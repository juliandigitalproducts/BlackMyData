package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func testKey(t *testing.T) {
	t.Helper()
	k, err := newSessionKey()
	if err != nil {
		t.Fatal(err)
	}
	sessionKey = k
}

func sessionCookie() *http.Cookie {
	return &http.Cookie{Name: cookieName(47811), Value: sessionCookieValue(sessionKey)}
}

func TestStorageMirror(t *testing.T) {
	testKey(t)
	_ = os.Remove(filepath.Join(dataDir(), "settings.json"))
	h := handler(t.TempDir(), 47811)
	req := func(method, body string, hdr, cookie bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:47811"+storagePath, strings.NewReader(body))
		r.Host = "127.0.0.1:47811"
		if hdr {
			r.Header.Set("X-BMD", "1")
		}
		if cookie {
			r.AddCookie(sessionCookie())
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := req(http.MethodPut, `{"bmd_web_theme":"light"}`, false, true); w.Code != http.StatusForbidden {
		t.Fatalf("PUT without X-BMD: got %d", w.Code)
	}
	if w := req(http.MethodPut, `{"bmd_web_theme":"light"}`, true, false); w.Code != http.StatusForbidden {
		t.Fatalf("PUT without session: got %d", w.Code)
	}
	if w := req(http.MethodPut, `not json`, true, true); w.Code != http.StatusBadRequest {
		t.Fatalf("PUT with bad JSON: got %d", w.Code)
	}
	if w := req(http.MethodPut, `{"bmd_web_theme":"light"}`, true, true); w.Code != http.StatusNoContent {
		t.Fatalf("PUT: got %d", w.Code)
	}
	if w := req(http.MethodGet, "", false, true); !strings.Contains(w.Body.String(), `"bmd_web_theme":"light"`) {
		t.Fatalf("GET: %s", w.Body.String())
	}
	if w := req(http.MethodGet, "", false, false); w.Code != http.StatusForbidden || strings.Contains(w.Body.String(), "bmd_web_theme") {
		t.Fatalf("GET without session: got %d %s", w.Code, w.Body.String())
	}
	r := httptest.NewRequest(http.MethodGet, "http://evil.example"+storagePath, nil)
	r.Host = "evil.example"
	r.AddCookie(sessionCookie())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("foreign host: got %d", w.Code)
	}
	if st, err := os.Stat(dataDir()); err != nil || (st.Mode().Perm()&0o077 != 0 && os.PathSeparator == '/') {
		t.Fatalf("data folder not private: %v %v", st.Mode(), err)
	}
}

// BMD-R4: parallel PUTs (several windows) must neither fail nor leave a broken or half-written settings file.
func TestStorageParallelPuts(t *testing.T) {
	testKey(t)
	file := filepath.Join(dataDir(), "settings.json")
	_ = os.Remove(file)
	h := handler(t.TempDir(), 47811)
	const n = 32
	padding := strings.Repeat("x", 64*1024) // large bodies make interleaved writes likely without the fix
	var wg sync.WaitGroup
	codes := make([]int, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			body := fmt.Sprintf(`{"bmd_writer":"%d","bmd_pad":"%s"}`, i, padding)
			r := httptest.NewRequest(http.MethodPut, "http://127.0.0.1:47811"+storagePath, strings.NewReader(body))
			r.Host = "127.0.0.1:47811"
			r.Header.Set("X-BMD", "1")
			r.AddCookie(sessionCookie())
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			codes[i] = w.Code
		}(i)
	}
	wg.Wait()
	for i, c := range codes {
		if c != http.StatusNoContent {
			t.Fatalf("PUT %d: got %d", i, c)
		}
	}
	b, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]string
	if err := json.Unmarshal(b, &got); err != nil || got["bmd_pad"] != padding || got["bmd_writer"] == "" {
		t.Fatalf("settings file broken after parallel PUTs: %v (%d bytes)", err, len(b))
	}
	if st, err := os.Stat(file); err == nil && os.PathSeparator == '/' && st.Mode().Perm() != 0o600 {
		t.Fatalf("settings file mode %v, want 0600", st.Mode().Perm())
	}
	left, _ := filepath.Glob(filepath.Join(dataDir(), "settings-*.tmp"))
	if len(left) != 0 {
		t.Fatalf("temporary files left behind: %v", left)
	}
}

func TestOneTimeCode(t *testing.T) {
	testKey(t)
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html><head></head></html>"), 0o600)
	h := handler(dir, 47811)
	open := func(code string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:47811/index.html?"+codeParam+"="+code, nil)
		r.Host = "127.0.0.1:47811"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	code := mintCode(sessionKey)
	w := open(code)
	if w.Code != http.StatusFound || !strings.Contains(w.Header().Get("Set-Cookie"), cookieName(47811)+"="+sessionCookieValue(sessionKey)) ||
		!strings.Contains(w.Header().Get("Set-Cookie"), "HttpOnly") {
		t.Fatalf("first use: %d %q", w.Code, w.Header().Get("Set-Cookie"))
	}
	if w := open(code); w.Header().Get("Set-Cookie") != "" {
		t.Fatalf("second use of the same code set a cookie")
	}
	other, _ := newSessionKey()
	if w := open(mintCode(other)); w.Header().Get("Set-Cookie") != "" {
		t.Fatalf("code of another key accepted")
	}
	old := randomHex(16) + "." + "1000000000"
	if redeemCode(sessionKey, old+"."+mac(sessionKey, "code", old)) {
		t.Fatalf("expired code accepted")
	}
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:47811/index.html", nil)
	r.Host = "127.0.0.1:47811"
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if strings.Contains(w.Body.String(), sessionCookieValue(sessionKey)) {
		t.Fatalf("index.html leaks the session secret")
	}
}

func TestPingChallenge(t *testing.T) {
	testKey(t)
	srv := httptest.NewServer(handler(t.TempDir(), 47811))
	defer srv.Close()
	get := func(path string, cookie bool) *http.Response {
		r, _ := http.NewRequest(http.MethodGet, srv.URL+path, nil)
		r.Host = "127.0.0.1:47811"
		if cookie {
			r.AddCookie(sessionCookie())
		}
		resp, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp
	}
	before := lastPing.Load()
	if resp := get(pingPath, false); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("ping without session: %d", resp.StatusCode)
	}
	if lastPing.Load() != before {
		t.Fatalf("heartbeat without session")
	}
	resp := get(pingPath+"?nonce=abc", false)
	if resp.Header.Get("X-BMD-Proof") != mac(sessionKey, "ping", "abc") {
		t.Fatalf("bad proof")
	}
	time.Sleep(time.Millisecond)
	if resp := get(pingPath, true); resp.StatusCode != http.StatusOK || lastPing.Load() == before {
		t.Fatalf("heartbeat with session: %d", resp.StatusCode)
	}
}

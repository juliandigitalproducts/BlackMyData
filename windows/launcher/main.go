// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

// BlackMyData for Windows: starts the web app without installation of anything else.
//
// The launcher serves the app folder ("web" next to the exe) on http://127.0.0.1:47811 – reachable only from this
// computer – and opens it in Microsoft Edge as an app window (own profile, no tabs), else Chrome, else the default
// browser. A real http origin instead of file:// lets the OCR workers run without the unsafe
// --allow-file-access-from-files switch (code review B13), and the same security headers as the website apply.
//
// The launcher ends by itself shortly after the last BlackMyData window is closed: the page sends a heartbeat,
// and an app window's browser profile is watched as well. A second start while it runs only opens a new window.
// Settings mirror and heartbeat need the session of this start (session.go, code review BMD-N5).
package main

import (
	"crypto/hmac"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	preferredPort = 47811 // fixed, so the browser keeps the app's settings (same origin every start)
	lastPort      = 47830
	pingPath      = "/__bmd/ping"
	storagePath   = "/__bmd/storage"
	maxStorage    = 512 * 1024
	idleTimeout   = 3 * time.Minute // background windows send timers at most once a minute
)

// Same policy as app/static/.htaccess (tested with the full pipeline: PDF, OCR workers, export).
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; " +
	"style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
	"connect-src 'self' http: https: blob: data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'"

// Injected into index.html: platform flag for the web app, the heartbeat that keeps the launcher alive and a mirror
// of the app's localStorage (bmd_* keys) in a file. localStorage belongs to the origin, i.e. to the port; when the
// preferred port is taken and another one is used, the settings come back from the file instead of being lost.
// Heartbeat and mirror authenticate with the HttpOnly session cookie (BMD-N5), which same-origin fetch/XHR send by
// themselves; the script never sees a secret. Without the cookie both answer 403 and the app works as before.
var hostScript = `<script>window.__bmdHost={platform:"` + runtime.GOOS + `"};` +
	`(function(){function p(){fetch("` + pingPath + `",{cache:"no-store"}).catch(function(){})}p();setInterval(p,20000)})();` +
	`(function(){var S="` + storagePath + `",ls=window.localStorage;if(!ls)return;` +
	`try{var x=new XMLHttpRequest();x.open("GET",S,false);x.send();if(x.status===200){var d=JSON.parse(x.responseText||"{}");` +
	`for(var k in d){if(k.indexOf("bmd_")===0&&ls.getItem(k)===null)ls.setItem(k,d[k]);}}}catch(e){}` +
	`var t=null;function save(){t=null;var o={};for(var i=0;i<ls.length;i++){var k=ls.key(i);if(k&&k.indexOf("bmd_")===0)o[k]=ls.getItem(k);}` +
	`fetch(S,{method:"PUT",headers:{"Content-Type":"application/json","X-BMD":"1"},body:JSON.stringify(o)}).catch(function(){})}` +
	`function q(){if(!t)t=setTimeout(save,500)}var si=ls.setItem.bind(ls),ri=ls.removeItem.bind(ls);` +
	`ls.setItem=function(k,v){si(k,v);if(String(k).indexOf("bmd_")===0)q()};ls.removeItem=function(k){ri(k);if(String(k).indexOf("bmd_")===0)q()}})();</script>`

var lastPing atomic.Int64

func main() {
	exe, err := os.Executable()
	if err != nil {
		fail("Programmpfad nicht ermittelbar", err)
	}
	webDir := filepath.Join(filepath.Dir(exe), "web")
	if _, err := os.Stat(filepath.Join(webDir, "index.html")); err != nil {
		fail("Der Ordner \"web\" fehlt neben BlackMyData.exe. Bitte BlackMyData neu installieren oder das ZIP vollständig entpacken.", err)
	}
	setupLog()

	// Already running (for this user)? Then only open another window.
	if key := loadSessionKey(); key != nil {
		for port := preferredPort; port <= lastPort; port++ {
			if isOurServer(port, key) {
				log.Printf("already running on %d", port)
				openApp(windowURL(port, key))
				return
			}
		}
	}

	key, err := newSessionKey()
	if err != nil {
		fail("Zufallszahlen für die Sitzung nicht verfügbar", err)
	}
	sessionKey = key
	ln, port, err := listen()
	if err != nil {
		fail("Kein freier Port für BlackMyData auf diesem Rechner gefunden (47811–47830).", err)
	}
	if err := saveSessionKey(key); err != nil {
		fail("Der Datenordner von BlackMyData ist nicht beschreibbar.", err)
	}
	srv := &http.Server{Handler: handler(webDir, port), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server: %v", err)
		}
	}()
	log.Printf("serving %s on %d", webDir, port)

	lastPing.Store(time.Now().UnixNano())
	profile := openApp(windowURL(port, key))
	waitUntilClosed(profile)
	log.Printf("no window left, exiting")
	_ = srv.Close()
}

func appURL(port int) string { return fmt.Sprintf("http://127.0.0.1:%d/index.html", port) }

func listen() (net.Listener, int, error) {
	var last error
	for port := preferredPort; port <= lastPort; port++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			return ln, port, nil
		}
		last = err
	}
	return nil, 0, last
}

// isOurServer: a server on this port answers the challenge with the key of this user's running launcher. A server of
// another account (or any other program) cannot, so its windows are never opened (BMD-N5, port squatting).
func isOurServer(port int, key []byte) bool {
	c := http.Client{Timeout: 700 * time.Millisecond}
	nonce := randomHex(16)
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d%s?nonce=%s", port, pingPath, nonce))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK && resp.Header.Get("X-BlackMyData") == "1" &&
		hmac.Equal([]byte(resp.Header.Get("X-BMD-Proof")), []byte(mac(key, "ping", nonce)))
}

func handler(webDir string, port int) http.Handler {
	files := http.FileServer(http.Dir(webDir))
	allowedHosts := map[string]bool{
		fmt.Sprintf("127.0.0.1:%d", port): true,
		fmt.Sprintf("localhost:%d", port): true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only requests addressed to this computer: protects against DNS rebinding from websites.
		if !allowedHosts[r.Host] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-cache")
		switch {
		case r.URL.Path == pingPath:
			h.Set("Content-Type", "text/plain")
			if nonce := r.URL.Query().Get("nonce"); nonce != "" && len(nonce) <= 64 {
				// Challenge of a second start (isOurServer); no heartbeat.
				h.Set("X-BlackMyData", "1")
				h.Set("X-BMD-Proof", pingProof(nonce))
			} else if hasSession(r, port) {
				lastPing.Store(time.Now().UnixNano())
				h.Set("X-BlackMyData", "1")
			} else {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			_, _ = w.Write([]byte("ok"))
		case r.URL.Path == storagePath:
			if !hasSession(r, port) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			serveStorage(w, r)
		case r.Method != http.MethodGet && r.Method != http.MethodHead:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		case strings.HasSuffix(r.URL.Path, "/"):
			// No directory listings.
			if r.URL.Path == "/" {
				http.Redirect(w, r, "/index.html", http.StatusFound)
				return
			}
			http.NotFound(w, r)
		case r.URL.Path == "/index.html" && r.URL.Query().Has(codeParam):
			// A new window: swap the one-time code for the session cookie, then drop the code from the address.
			if redeemCode(sessionKey, r.URL.Query().Get(codeParam)) {
				setSessionCookie(w, port)
			}
			http.Redirect(w, r, "/index.html", http.StatusFound)
		case r.URL.Path == "/index.html":
			serveIndex(w, webDir)
		default:
			// .gz language data must arrive as is (Tesseract unpacks it itself), never with Content-Encoding.
			if strings.HasSuffix(r.URL.Path, ".gz") {
				h.Set("Content-Type", "application/octet-stream")
			}
			files.ServeHTTP(w, r)
		}
	})
}

// serveStorage keeps the app's settings (bmd_* localStorage keys) in a file in the data folder. Writes need the
// custom X-BMD header: a foreign website cannot send it without a CORS preflight, which this server never allows.
// storageMu serialises reads and writes of settings.json: several windows (or a burst of saves) may PUT at the same
// time, and on Windows a rename over a file that another request is reading fails (code review BMD-R4).
var storageMu sync.Mutex

func serveStorage(w http.ResponseWriter, r *http.Request) {
	file := filepath.Join(dataDir(), "settings.json")
	w.Header().Set("Cache-Control", "no-store")
	switch r.Method {
	case http.MethodGet:
		storageMu.Lock()
		b, err := os.ReadFile(file)
		storageMu.Unlock()
		if err != nil {
			b = []byte("{}")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
	case http.MethodPut:
		if r.Header.Get("X-BMD") != "1" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, maxStorage+1))
		var probe map[string]string
		if err != nil || len(body) > maxStorage || json.Unmarshal(body, &probe) != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if err := writeSettings(file, body); err != nil {
			http.Error(w, "write failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// writeSettings replaces the settings file atomically: each write goes to its own temporary file in the same folder
// (os.CreateTemp, mode 0600) and is renamed over the old file, one writer at a time.
func writeSettings(file string, body []byte) error {
	storageMu.Lock()
	defer storageMu.Unlock()
	dir := filepath.Dir(file)
	if err := ensurePrivateDir(dir); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, "settings-*.tmp")
	if err != nil {
		return err
	}
	_, err = tmp.Write(body)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(tmp.Name(), file)
	}
	if err != nil {
		_ = os.Remove(tmp.Name())
	}
	return err
}

func serveIndex(w http.ResponseWriter, webDir string) {
	b, err := os.ReadFile(filepath.Join(webDir, "index.html"))
	if err != nil {
		http.Error(w, "index.html fehlt", http.StatusInternalServerError)
		return
	}
	html := strings.Replace(string(b), "<head>", "<head>"+hostScript, 1)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(html))
}

// waitUntilClosed returns when no BlackMyData window has been seen for a while: neither a heartbeat from a page
// nor a running app-window profile (if one was started).
func waitUntilClosed(profile string) {
	started := time.Now()
	idle, grace := idleTimeout, 45*time.Second
	// BMD_IDLE_SECONDS: shorter timeouts for automated tests.
	if s, err := strconv.Atoi(os.Getenv("BMD_IDLE_SECONDS")); err == nil && s > 0 {
		idle, grace = time.Duration(s)*time.Second, time.Duration(s)*time.Second
	}
	for {
		time.Sleep(2 * time.Second)
		if time.Since(started) < grace {
			continue // the browser may need a moment on a cold start
		}
		recentPing := time.Since(time.Unix(0, lastPing.Load())) < idle
		if recentPing || (profile != "" && profileInUse(profile)) {
			continue
		}
		return
	}
}

// ensurePrivateDir creates the data folder for this user only (0700) and tightens one that an older version created
// with 0755 (BMD-N12). On Windows the folder lives in the user's own %LOCALAPPDATA%.
func ensurePrivateDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if runtime.GOOS != "windows" {
		return os.Chmod(dir, 0o700)
	}
	return nil
}

func setupLog() {
	dir := dataDir()
	_ = ensurePrivateDir(dir)
	path := filepath.Join(dir, "launcher.log")
	if st, err := os.Stat(path); err == nil && st.Size() > 1<<20 {
		_ = os.Remove(path) // keep the log small
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err == nil {
		_ = f.Chmod(0o600)
		log.SetOutput(f)
	}
}

func fail(msg string, err error) {
	log.Printf("%s: %v", msg, err)
	showError("BlackMyData", fmt.Sprintf("%s\n\n(%v)", msg, err))
	os.Exit(1)
}

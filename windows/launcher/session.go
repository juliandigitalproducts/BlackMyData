// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

package main

// Per-start secret for the launcher's own endpoints (code review BMD-N5).
//
// 127.0.0.1 is shared by every account on the machine, so the Host check and the X-BMD header only keep websites out,
// not other local users or processes. Each start therefore creates a random key that only this user can read
// (session.key in the data folder, 0600 in a 0700 folder; %LOCALAPPDATA% on Windows):
//   - the app window is opened with a one-time code (?bmd_code=, valid 2 minutes, usable once) that the server swaps
//     for an HttpOnly session cookie; settings mirror and heartbeat require that cookie;
//   - a second start proves that a running server is ours with a challenge (HMAC over a random nonce) before it
//     opens a window there, so a server another user put on the port is never trusted.
// Remaining risk: on Linux other users can read the command line of the browser while it starts; the code in it is
// worthless once the window has used it.

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	codeParam    = "bmd_code"
	codeLifetime = 2 * time.Minute
)

var (
	sessionKey []byte // set once at start, before the server runs
	usedCodes  sync.Map
)

func newSessionKey() ([]byte, error) {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		return nil, err
	}
	return k, nil
}

func sessionKeyFile() string { return filepath.Join(dataDir(), "session.key") }

func saveSessionKey(k []byte) error {
	if err := ensurePrivateDir(dataDir()); err != nil {
		return err
	}
	tmp := sessionKeyFile() + ".tmp"
	if err := os.WriteFile(tmp, []byte(hex.EncodeToString(k)), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, sessionKeyFile())
}

func loadSessionKey() []byte {
	b, err := os.ReadFile(sessionKeyFile())
	if err != nil {
		return nil
	}
	k, err := hex.DecodeString(strings.TrimSpace(string(b)))
	if err != nil || len(k) != 32 {
		return nil
	}
	return k
}

func mac(key []byte, purpose, msg string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(purpose + ":" + msg))
	return hex.EncodeToString(m.Sum(nil))
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// mintCode returns a one-time code for opening a window: nonce.unixtime.mac
func mintCode(key []byte) string {
	msg := randomHex(16) + "." + strconv.FormatInt(time.Now().Unix(), 10)
	return msg + "." + mac(key, "code", msg)
}

// redeemCode accepts each valid, fresh code exactly once.
func redeemCode(key []byte, code string) bool {
	i := strings.LastIndexByte(code, '.')
	if i < 0 || len(key) == 0 {
		return false
	}
	msg, sig := code[:i], code[i+1:]
	if !hmac.Equal([]byte(sig), []byte(mac(key, "code", msg))) {
		return false
	}
	j := strings.LastIndexByte(msg, '.')
	ts, err := strconv.ParseInt(msg[j+1:], 10, 64)
	if j < 0 || err != nil {
		return false
	}
	age := time.Since(time.Unix(ts, 0))
	if age < -time.Minute || age > codeLifetime {
		return false
	}
	_, used := usedCodes.LoadOrStore(msg, true)
	return !used
}

func cookieName(port int) string { return fmt.Sprintf("bmd_session_%d", port) }

func sessionCookieValue(key []byte) string { return mac(key, "session", "cookie") }

func hasSession(r *http.Request, port int) bool {
	c, err := r.Cookie(cookieName(port))
	return err == nil && len(sessionKey) > 0 && hmac.Equal([]byte(c.Value), []byte(sessionCookieValue(sessionKey)))
}

func setSessionCookie(w http.ResponseWriter, port int) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName(port),
		Value:    sessionCookieValue(sessionKey),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// pingProof answers the challenge of a second start.
func pingProof(nonce string) string { return mac(sessionKey, "ping", nonce) }

// windowURL is the address a new app window opens: index.html with a fresh one-time code.
func windowURL(port int, key []byte) string {
	return appURL(port) + "?" + codeParam + "=" + mintCode(key)
}

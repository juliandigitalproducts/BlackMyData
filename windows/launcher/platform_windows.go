// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

// createNoWindow is CREATE_NO_WINDOW (not defined in package syscall).
const createNoWindow = 0x08000000

func dataDir() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "BlackMyData")
}

// openApp opens the app window and returns the browser profile folder it uses ("" for the default browser).
func openApp(url string) string {
	profile := filepath.Join(dataDir(), "AppProfile")
	for _, exe := range []string{findBrowser("msedge.exe", `Microsoft\Edge\Application\msedge.exe`), findBrowser("chrome.exe", `Google\Chrome\Application\chrome.exe`)} {
		if exe == "" {
			continue
		}
		cmd := exec.Command(exe, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check")
		if err := cmd.Start(); err == nil {
			_ = cmd.Process.Release()
			return profile
		}
	}
	// No Edge/Chrome: the default browser works too (normal tab), the heartbeat keeps the launcher alive.
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	return ""
}

// findBrowser looks up the registered path (App Paths, per machine or per user) and the usual install folders.
func findBrowser(name, rel string) string {
	for _, root := range []string{"HKCU", "HKLM"} {
		cmd := exec.Command("reg", "query", root+`\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\`+name, "/ve")
		// The launcher is a GUI exe: without this every lookup flashes a console window (code review BMD-R5).
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
		out, err := cmd.Output()
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(out), "\n") {
			if i := strings.Index(line, "REG_SZ"); i >= 0 {
				p := strings.Trim(strings.TrimSpace(line[i+len("REG_SZ"):]), `"`)
				if fileExists(p) {
					return p
				}
			}
		}
	}
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		if base := os.Getenv(env); base != "" {
			if p := filepath.Join(base, rel); fileExists(p) {
				return p
			}
		}
	}
	return ""
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// profileInUse: Chromium keeps "lockfile" in the profile open (no sharing) while any of its windows is open, so it
// cannot be deleted then.
func profileInUse(profile string) bool {
	lock := filepath.Join(profile, "lockfile")
	if !fileExists(lock) {
		return false
	}
	return os.Remove(lock) != nil
}

func showError(title, text string) {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	const mbIconError = 0x10
	syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), mbIconError)
}

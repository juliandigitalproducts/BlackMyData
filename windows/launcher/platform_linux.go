//go:build linux

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

func dataDir() string {
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return filepath.Join(xdg, "BlackMyData")
	}
	if home := os.Getenv("HOME"); home != "" {
		return filepath.Join(home, ".local", "share", "BlackMyData")
	}
	return filepath.Join(os.TempDir(), "BlackMyData")
}

// openApp opens the app window and returns the browser profile folder it uses ("" for the default browser).
func openApp(url string) string {
	profile := filepath.Join(dataDir(), "AppProfile")
	browsers := []string{
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
		"microsoft-edge",
		"microsoft-edge-stable",
		"brave-browser",
	}
	for _, b := range browsers {
		if path, err := exec.LookPath(b); err == nil && path != "" {
			cmd := exec.Command(path, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check")
			if err := cmd.Start(); err == nil {
				_ = cmd.Process.Release()
				return profile
			}
		}
	}
	// Fallback to default browser via xdg-open
	_ = exec.Command("xdg-open", url).Start()
	return ""
}

// profileInUse (BMD-N6): Chromium on Linux keeps SingletonLock in the profile directory, a symlink to
// "<hostname>-<pid>" that points nowhere (os.Stat on it always failed). Read the link itself and check that the
// browser process still runs with this profile. Never delete the lock: on Unix that succeeds even while the browser
// runs and would break the open profile.
func profileInUse(profile string) bool {
	lock := filepath.Join(profile, "SingletonLock")
	st, err := os.Lstat(lock)
	if err != nil || st.Mode()&os.ModeSymlink == 0 {
		return false
	}
	target, err := os.Readlink(lock)
	if err != nil {
		return false
	}
	i := strings.LastIndexByte(target, '-')
	if i < 0 {
		return false
	}
	pid, err := strconv.Atoi(target[i+1:])
	if err != nil || pid <= 0 {
		return false
	}
	if host, err := os.Hostname(); err == nil && target[:i] != host {
		return true // a browser on another machine (shared home folder) holds the profile
	}
	return processUsesProfile(pid, profile)
}

// processUsesProfile: the process is alive and, when /proc tells, it was started with this profile (a reused pid of
// an unrelated process would otherwise keep the launcher running forever).
func processUsesProfile(pid int, profile string) bool {
	if err := syscall.Kill(pid, 0); err != nil && !errors.Is(err, syscall.EPERM) {
		return false
	}
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return true // alive, details not readable: assume it is the browser
	}
	return strings.Contains(string(cmdline), "--user-data-dir="+profile)
}

func showError(title, text string) {
	fmt.Fprintln(os.Stderr, title+": "+text)
	if _, err := exec.LookPath("zenity"); err == nil {
		_ = exec.Command("zenity", "--error", "--title="+title, "--text="+text).Start()
	} else if _, err := exec.LookPath("kdialog"); err == nil {
		_ = exec.Command("kdialog", "--title", title, "--error", text).Start()
	}
}

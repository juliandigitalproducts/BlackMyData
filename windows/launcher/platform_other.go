//go:build !windows && !linux

package main

// Development build for macOS/Linux: lets the server, headers and shutdown be tested outside Windows.

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func dataDir() string { return filepath.Join(os.TempDir(), "BlackMyData") }

func openApp(url string) string {
	if os.Getenv("BMD_NO_BROWSER") == "" {
		opener := "xdg-open"
		if runtime.GOOS == "darwin" {
			opener = "open"
		}
		_ = exec.Command(opener, url).Start()
	}
	fmt.Println(url)
	return ""
}

func profileInUse(string) bool { return false }

func showError(title, text string) { fmt.Fprintln(os.Stderr, title+": "+text) }

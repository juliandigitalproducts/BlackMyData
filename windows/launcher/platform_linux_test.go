//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestProfileInUseLinux(t *testing.T) {
	profile := t.TempDir()
	lock := filepath.Join(profile, "SingletonLock")
	host, _ := os.Hostname()
	link := func(target string) {
		_ = os.Remove(lock)
		if err := os.Symlink(target, lock); err != nil {
			t.Fatal(err)
		}
	}

	if profileInUse(profile) {
		t.Fatal("no lock: in use")
	}

	// A running process that was started with this profile (stands in for the browser).
	cmd := exec.Command("/bin/sh", "-c", "sleep 30", "--user-data-dir="+profile)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	link(fmt.Sprintf("%s-%d", host, cmd.Process.Pid))
	if !profileInUse(profile) {
		t.Fatal("running browser not detected")
	}
	if _, err := os.Lstat(lock); err != nil {
		t.Fatal("lock of a running browser was removed")
	}

	// A live process with another command line (reused pid): not the browser.
	link(fmt.Sprintf("%s-%d", host, os.Getpid()))
	if profileInUse(profile) {
		t.Fatal("unrelated process counted as browser")
	}

	// Dead process: stale lock.
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	link(fmt.Sprintf("%s-%d", host, cmd.Process.Pid))
	if profileInUse(profile) {
		t.Fatal("dead process counted as browser")
	}

	// Another machine holds the profile (shared home folder).
	link("some-other-host-12345")
	if !profileInUse(profile) {
		t.Fatal("lock of another host ignored")
	}
}

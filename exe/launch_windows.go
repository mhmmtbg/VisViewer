//go:build windows

package main

import (
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

func fileURL(p string) string {
	u := url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(p)}
	return u.String()
}

func browserCandidates() []string {
	pf := os.Getenv("ProgramFiles")
	pf86 := os.Getenv("ProgramFiles(x86)")
	la := os.Getenv("LocalAppData")
	var c []string
	for _, base := range []string{pf, pf86, la} {
		if base != "" {
			c = append(c, filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
		}
	}
	for _, base := range []string{pf86, pf, la} {
		if base != "" {
			c = append(c, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	return c
}

func openInBrowser(path string) error {
	target := fileURL(path)
	for _, exe := range browserCandidates() {
		if _, err := os.Stat(exe); err != nil {
			continue
		}
		// --app: adres çubuğu ve sekmesiz, uygulama gibi pencere
		cmd := exec.Command(exe, "--app="+target, "--window-size=1440,900")
		if err := cmd.Start(); err == nil {
			return nil
		}
	}
	// son çare: varsayılan tarayıcı
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", target).Start()
}

func showError(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString("VisViewer")
	m, _ := syscall.UTF16PtrFromString(msg)
	proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
}

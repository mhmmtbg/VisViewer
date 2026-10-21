//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
)

// Windows dışı sistemlerde yalnızca geliştirme kolaylığı için.
func openInBrowser(path string) error {
	for _, c := range []string{"xdg-open", "open"} {
		if p, err := exec.LookPath(c); err == nil {
			return exec.Command(p, "file://"+path).Start()
		}
	}
	return fmt.Errorf("tarayıcı başlatıcı bulunamadı")
}

func showError(msg string) { fmt.Fprintln(os.Stderr, msg) }

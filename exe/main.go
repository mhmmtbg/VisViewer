// VisViewer başlatıcısı: gömülü HTML uygulamasını diske yazar ve Chrome/Edge'de açar.
// Yerel sunucu başlatmaz, kurulum ve yönetici hakkı gerektirmez, ağ kullanmaz.
package main

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

//go:embed VisViewer.html
var page []byte

const maxBootFile = 200 << 20 // komut satırından açılacak dosya için üst sınır (200 MB)

func workDir() string {
	base, err := os.UserCacheDir()
	if err != nil || base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "VisViewer")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		dir = os.TempDir()
	}
	return dir
}

func main() {
	html := string(page)

	// "VisViewer.exe cizim.vsdx" veya dosyayı exe'nin üstüne bırakma / "Birlikte aç"
	if len(os.Args) > 1 {
		arg := os.Args[1]
		data, err := os.ReadFile(arg)
		if err != nil {
			showError(fmt.Sprintf("Dosya okunamadı:\n%s\n\n%v", arg, err))
			return
		}
		if len(data) > maxBootFile {
			showError("Dosya çok büyük; VisViewer'ı dosyasız açıp 'Aç' düğmesini kullanın.")
		} else {
			name, _ := json.Marshal(filepath.Base(arg))
			boot := "<script>window.VV_BOOT={name:" + string(name) + ",b64:\"" + base64.StdEncoding.EncodeToString(data) + "\"};</script>\n"
			html = strings.Replace(html, "<script>\n", boot+"<script>\n", 1)
		}
	}

	out := filepath.Join(workDir(), "VisViewer.html")
	if err := os.WriteFile(out, []byte(html), 0o644); err != nil {
		showError("Geçici dosya yazılamadı:\n" + err.Error())
		return
	}
	if err := openInBrowser(out); err != nil {
		showError("Tarayıcı açılamadı:\n" + err.Error() + "\n\nDosya burada: " + out)
	}
}

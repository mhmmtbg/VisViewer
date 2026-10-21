import sys, json, base64
from playwright.sync_api import sync_playwright
OUT='/tmp/claude-0/shots'
fx=sys.argv[1]; shot=sys.argv[2]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1440,'height':860})
    errs=[]
    pg.on('console', lambda m: errs.append((m.type,m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.goto('file:///home/claude/visviewer/dist/VisViewer.html')
    pg.set_input_files('#filePick', fx)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/{shot}.png')
    print('errors:', json.dumps(errs, ensure_ascii=False, indent=1))
    print('report:', pg.evaluate("JSON.stringify(App.doc && App.doc.report)"))
    b.close()

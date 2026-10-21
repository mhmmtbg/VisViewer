import sys, json
from playwright.sync_api import sync_playwright
OUT='/tmp/claude-0/shots'
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1440,'height':860})
    errs=[]
    pg.on('console', lambda m: errs.append(('console',m.type,m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.goto('file:///home/claude/visviewer/dist/VisViewer.html')
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/01_landing.png')
    pg.click('#btnSample')
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{OUT}/02_sample.png')
    print('errors:', json.dumps(errs, ensure_ascii=False, indent=1))
    print('title', pg.title(), '| file', pg.inner_text('#fileName'))
    b.close()

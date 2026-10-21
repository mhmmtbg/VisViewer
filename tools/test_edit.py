#!/usr/bin/env python3
"""Uçtan uca test: gerçek fare/klavye etkileşimleri, geri al, kaydet -> yeniden aç, ZIP bütünlüğü."""
import base64
import io
import json
import sys
import zipfile
import xml.dom.minidom
from playwright.sync_api import sync_playwright

FX = sys.argv[1] if len(sys.argv) > 1 else 'samples/masters.vsdx'
OUT = '/tmp/claude-0/shots'
fails = []


def check(name, cond, extra=''):
    print(('  OK  ' if cond else '  FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))
    if not cond:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 860})
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error',) else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.goto('file:///home/claude/visviewer/dist/VisViewer.html')
    pg.set_input_files('#filePick', FX)
    pg.wait_for_timeout(1200)

    def center(sid):
        return pg.evaluate("""(id) => { const n = App.page.nodeMap.get(id); const c = mApply(n.M, n.w/2, n.h/2); const s = pageToScreen(c[0], c[1]); const r = stageRect(); return [s[0]+r.left, s[1]+r.top]; }""", sid)

    def node(sid, field):
        return pg.evaluate("(a) => App.page.nodeMap.get(a[0])[a[1]]", [sid, field])

    # ---------- 1) seç + taşı ----------
    cx, cy = center('2')
    pg.mouse.click(cx, cy)
    check('seçim yapıldı', pg.evaluate('App.sel.join(",")') == '2')
    check('özellikler paneli şekil gösteriyor', 'KONUM VE BOYUT' in pg.inner_text('#inspector').upper())
    pin0 = [node('2', 'pinX'), node('2', 'pinY')]
    pg.mouse.move(cx, cy)
    pg.mouse.down()
    pg.mouse.move(cx + 120, cy + 40, steps=6)
    pg.mouse.up()
    pin1 = [node('2', 'pinX'), node('2', 'pinY')]
    check('şekil taşındı', abs(pin1[0] - pin0[0]) > 0.5, f'{pin0}->{pin1}')
    cb = pg.evaluate("(()=>{const n=App.page.nodeMap.get('12'); return [n.num('BeginX',0), n.num('BeginY',0), n.num('EndX',0), n.num('EndY',0)]})()")
    t2 = pg.evaluate("(()=>{const n=App.page.nodeMap.get('2'); return mApply(n.M, n.w/2, n.h/2)})()")
    check('bağlayıcı bitişi karar şekline yapışık', abs(cb[2] - t2[0]) < 1.6 and cb[3] > t2[1], f'{cb} {t2}')
    pg.screenshot(path=f'{OUT}/10_moved.png')

    # ---------- 2) geri al / yinele ----------
    pg.keyboard.press('Control+z')
    pin2 = [node('2', 'pinX'), node('2', 'pinY')]
    check('geri al konumu eski haline getirdi', abs(pin2[0] - pin0[0]) < 1e-6 and abs(pin2[1] - pin0[1]) < 1e-6, f'{pin2} vs {pin0}')
    pg.keyboard.press('Control+y')
    pin3 = [node('2', 'pinX'), node('2', 'pinY')]
    check('yinele konumu yeniden uyguladı', abs(pin3[0] - pin1[0]) < 1e-6, f'{pin3}')

    # ---------- 3) yeniden boyutlandır (sağ-orta tutamaç) ----------
    w0 = node('2', 'w')
    h = pg.query_selector('#overlay [data-handle="1,0.5"]')
    bb = h.bounding_box()
    hx, hy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    pg.mouse.move(hx, hy); pg.mouse.down(); pg.mouse.move(hx + 60, hy, steps=5); pg.mouse.up()
    w1 = node('2', 'w')
    check('genişlik arttı', w1 > w0 + 0.3, f'{w0}->{w1}')
    geo = pg.evaluate("(()=>{const n=App.page.nodeMap.get('2'); const g=buildGeometry(n,()=>{}); return g[0].d})()")
    check('geometri yeni genişliğe uydu (master formülü)', f'{w1:.2f}'.rstrip('0').rstrip('.') in geo or str(round(w1, 4)) in geo, geo)

    # ---------- 4) döndür ----------
    rh = pg.query_selector('#overlay [data-handle="rot"]').bounding_box()
    rx, ry = rh['x'] + rh['width'] / 2, rh['y'] + rh['height'] / 2
    c = center('2')
    pg.mouse.move(rx, ry); pg.mouse.down(); pg.mouse.move(c[0] + 100, c[1] - 5, steps=6); pg.mouse.up()
    ang = node('2', 'angle')
    check('döndürme açısı uygulandı', abs(ang) > 0.3, f'{ang}')
    pg.keyboard.press('Control+z')

    # ---------- 5) metin düzenle (çift tık) ----------
    cx, cy = center('1')
    pg.mouse.dblclick(cx, cy)
    pg.wait_for_timeout(100)
    check('metin editörü açıldı', pg.query_selector('#textEditor') is not None)
    pg.keyboard.press('Control+a')
    pg.keyboard.type('Yeni metin: çğıöşü')
    pg.keyboard.press('Control+Enter')
    pg.wait_for_timeout(150)
    check('metin değişti', pg.evaluate("App.page.nodeMap.get('1').text()") == 'Yeni metin: çğıöşü', pg.evaluate("App.page.nodeMap.get('1').text()"))

    # ---------- 6) dolgu rengi (inspector) ----------
    pg.mouse.click(*center('1'))
    pg.eval_on_selector('#inspector [data-f="fillColor"]', "(el)=>{el.value='#ff0000'; el.dispatchEvent(new Event('change',{bubbles:true}))}")
    check('dolgu rengi hücreye yazıldı', pg.evaluate("colorOf(App.doc, App.page.nodeMap.get('1').str('FillForegnd','1'))") == '#FF0000')

    # ---------- 7) yeni şekil çiz ----------
    n_before = pg.evaluate('App.page.nodeMap.size')
    pg.keyboard.press('r')
    r = pg.evaluate("(()=>{const r=stageRect(); return [r.left, r.top]})()")
    pg.mouse.move(r[0] + 700, r[1] + 120); pg.mouse.down(); pg.mouse.move(r[0] + 820, r[1] + 190, steps=4); pg.mouse.up()
    pg.wait_for_timeout(100)
    pg.keyboard.type('Eklenen')
    pg.keyboard.press('Control+Enter')
    n_after = pg.evaluate('App.page.nodeMap.size')
    check('yeni şekil eklendi', n_after == n_before + 1, f'{n_before}->{n_after}')
    new_id = pg.evaluate('App.sel[0]')
    check('yeni şekil metni var', pg.evaluate(f"App.page.nodeMap.get('{new_id}').text()") == 'Eklenen')

    # ---------- 8) bağlayıcı aracı ----------
    pg.keyboard.press('Escape')
    pg.keyboard.press('c')
    a = center(new_id); d = center('3')
    nb = pg.evaluate('App.page.nodeMap.size')
    pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move((a[0] + d[0]) / 2, (a[1] + d[1]) / 2, steps=3); pg.mouse.move(*d, steps=3); pg.mouse.up()
    pg.wait_for_timeout(100)
    check('bağlayıcı eklendi', pg.evaluate('App.page.nodeMap.size') == nb + 1)
    cn = pg.evaluate("(()=>{const cs=App.doc.getConnects(App.page).filter(c=>c.getAttribute('ToSheet')==='3'); return cs.length})()")
    check('Connects kaydı yazıldı', cn >= 1)
    pg.screenshot(path=f'{OUT}/11_edited.png')

    # ---------- 9) çoğalt / sil / hizala ----------
    pg.mouse.click(*center('3'))
    nb = pg.evaluate('App.page.nodeMap.size')
    pg.keyboard.press('Control+d')
    check('çoğaltma', pg.evaluate('App.page.nodeMap.size') == nb + 1)
    pg.keyboard.press('Delete')
    check('silme', pg.evaluate('App.page.nodeMap.size') == nb)

    # ---------- 10) kaydet -> yeniden aç ----------
    b64 = pg.evaluate("""async () => { const u8 = await App.doc.serialize(); let s=''; for (let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000)); return btoa(s); }""")
    data = base64.b64decode(b64)
    open('/tmp/claude-0/shots/roundtrip.vsdx', 'wb').write(data)
    z = zipfile.ZipFile(io.BytesIO(data))
    check('ZIP geçerli', z.testzip() is None)
    orig = zipfile.ZipFile(FX)
    same = all(z.read(n) == orig.read(n) for n in orig.namelist() if n != 'visio/pages/page1.xml')
    check('değişmeyen parçalar bayt bayt aynı', same)
    names_ok = set(orig.namelist()) <= set(z.namelist())
    check('tüm parçalar korundu', names_ok)
    try:
        xml.dom.minidom.parseString(z.read('visio/pages/page1.xml'))
        check('page1.xml iyi biçimli', True)
    except Exception as e:
        check('page1.xml iyi biçimli', False, str(e))
    check('[Content_Types].xml ilk sırada', z.namelist()[0] == '[Content_Types].xml')

    pg.evaluate("""async (b64) => { const bin=atob(b64); const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); await loadBuffer(u8.buffer,'roundtrip.vsdx',null); }""", b64)
    pg.wait_for_timeout(800)
    check('yeniden açılan dosyada metin korunmuş', pg.evaluate("App.page.nodeMap.get('1').text()") == 'Yeni metin: çğıöşü')
    check('yeniden açılan dosyada renk korunmuş', pg.evaluate("colorOf(App.doc, App.page.nodeMap.get('1').str('FillForegnd','1'))") == '#FF0000')
    check('yeniden açılan dosyada şekil sayısı aynı', pg.evaluate('App.page.nodeMap.size') == nb)
    pg.screenshot(path=f'{OUT}/12_reopened.png')

    # ---------- 11) arama + katman ----------
    pg.fill('#searchInput', 'sunucu')
    pg.wait_for_timeout(400)
    check('arama sonucu bulundu', pg.query_selector('#searchResults .sr[data-id]') is not None)
    pg.click('#searchResults .sr[data-id]')
    check('aramadan şekil seçildi', pg.evaluate('App.sel.length') >= 1)
    pg.click('#leftTabs button[data-panel="pLayers"]')
    pg.click('#layerList input[data-layer="1"]')
    check('katman gizlendi', pg.evaluate("document.querySelectorAll('#flip [data-sid=\"11\"]').length") == 0)

    print('konsol hataları:', json.dumps(errs, ensure_ascii=False))
    check('konsol hatası yok', not errs)
    b.close()

print('\nBAŞARISIZ:' if fails else '\nTÜM TESTLER GEÇTİ', fails if fails else '')
sys.exit(1 if fails else 0)

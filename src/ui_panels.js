/* Paneller: sayfalar, şekil ağacı, katmanlar, özellikler, arama, dosya işlemleri, başlatma */
'use strict';

const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- simgeler ---------- */
const ICONS = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>',
  saveas: '<path d="M5 3h11l3 3v7"/><path d="M8 3v6h7V3"/><path d="M5 3v18h8"/><path d="M17 15v6M14 18h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  select: '<path d="m5 3 14 8-6 2-3 6z"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 14"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  rounded: '<rect x="4" y="6" width="16" height="12" rx="4"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  diamond: '<path d="M12 4 21 12 12 20 3 12z"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  conn: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17 17 7"/>',
  elbow: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h5V6h5"/>',
  zoomin: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8v6M8 11h6"/>',
  zoomout: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  theme: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  snap: '<path d="M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/>',
  front: '<rect x="4" y="4" width="10" height="10"/><rect x="10" y="10" width="10" height="10" fill="currentColor" fill-opacity=".25"/>',
  back: '<rect x="10" y="10" width="10" height="10"/><rect x="4" y="4" width="10" height="10" fill="currentColor" fill-opacity=".25"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  image: '<rect x="4" y="5" width="16" height="14"/><circle cx="9" cy="10" r="1.5"/><path d="m4 17 5-4 4 3 3-2 4 3"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alignL: '<path d="M4 4v16M8 7h12M8 14h8"/>', alignC: '<path d="M12 4v16M5 7h14M7 14h10"/>', alignR: '<path d="M20 4v16M4 7h12M8 14h8"/>',
  alignT: '<path d="M4 4h16M7 8v12M14 8v8"/>', alignM: '<path d="M4 12h16M7 5v14M14 8v8"/>', alignB: '<path d="M4 20h16M7 4v12M14 8v8"/>',
  distH: '<path d="M4 4v16M20 4v16M10 8h4v8h-4z"/>', distV: '<path d="M4 4h16M4 20h16M8 10v4h8v-4z"/>',
};
function icon(name) { return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; }

/* ---------- sayfa listesi ---------- */
function renderPageList() {
  const box = $('#pageList');
  if (!App.doc) { box.innerHTML = ''; return; }
  box.innerHTML = '';
  App.doc.pages.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'page-item' + (i === App.pageIdx ? ' active' : '');
    item.innerHTML = `<div class="thumb" data-thumb="${i}"></div><div class="pname">${esc(p.name)}${p.background ? ' <i>(arka plan)</i>' : ''}</div>`;
    item.onclick = () => openPage(i);
    box.appendChild(item);
  });
  // küçük resimleri sırayla üret
  let i = 0;
  const step = () => {
    if (!App.doc || i >= Math.min(App.doc.pages.length, 60)) return;
    const idx = i++;
    const slot = box.querySelector(`[data-thumb="${idx}"]`);
    if (slot) {
      try {
        slot.innerHTML = pageToSVGString(App.doc, App.doc.pages[idx], { fit: true, noText: App.doc.pages[idx].tree ? false : false });
      } catch (e) { slot.textContent = '—'; }
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}

function openPage(i) {
  if (!App.doc) return;
  endTextEdit(true);
  App.pageIdx = i;
  App.page = App.doc.pages[i];
  App.sel = [];
  App.hover = null;
  setupFrame();
  App.doc.buildTree(App.page);
  renderPage();
  fitPage();
  renderInspector(); renderShapeTree(); renderLayers(); updateStatus();
  $$('#pageList .page-item').forEach((el, k) => el.classList.toggle('active', k === i));
  $('#minimap').style.display = App.minimap ? '' : 'none';
}

/* ---------- şekil ağacı ---------- */
function nodeLabel(n) {
  const nm = n.el.getAttribute('NameU') || n.el.getAttribute('Name');
  const tx = n.text().replace(/\s+/g, ' ').trim();
  let label = tx ? tx.slice(0, 28) : (nm || (n.type === 'Group' ? 'Grup' : n.oneD ? 'Bağlayıcı' : 'Şekil'));
  if (tx && nm && nm !== tx) label += '  ·  ' + nm;
  return label;
}

function renderShapeTree() {
  const box = $('#shapeTree');
  if (!App.doc || !App.page || !App.page.tree) { box.innerHTML = ''; return; }
  let count = 0;
  const parts = [];
  const walk = (list, depth) => {
    for (const n of list) {
      if (count++ > 700) return;
      parts.push(`<div class="tnode${App.sel.includes(n.id) ? ' on' : ''}" data-id="${esc(n.id)}" style="padding-left:${8 + depth * 14}px"><span class="tid">${esc(n.id)}</span>${esc(nodeLabel(n))}</div>`);
      if (n.children.length) walk(n.children, depth + 1);
    }
  };
  walk(App.page.tree, 0);
  if (count > 700) parts.push('<div class="muted pad">… liste kısaltıldı (700 şekil)</div>');
  if (!parts.length) parts.push('<div class="muted pad">Bu sayfada şekil yok.</div>');
  box.innerHTML = parts.join('');
}
function highlightTree() {
  $$('#shapeTree .tnode').forEach((el) => el.classList.toggle('on', App.sel.includes(el.dataset.id)));
}

/* ---------- katmanlar ---------- */
function renderLayers() {
  const box = $('#layerList');
  if (!App.doc || !App.page) { box.innerHTML = ''; return; }
  const layers = App.doc.pageLayers(App.page);
  if (!layers.length) { box.innerHTML = '<div class="muted pad">Bu sayfada katman tanımı yok.</div>'; return; }
  box.innerHTML = layers.map((l) => `<label class="layer"><input type="checkbox" data-layer="${l.ix}" ${App.hiddenLayers.has(l.ix) ? '' : 'checked'}> ${esc(l.name)}</label>`).join('')
    + '<div class="muted pad">Görünürlük yalnızca bu oturumdaki görünümü etkiler; dosyaya yazılmaz.</div>';
}

/* ---------- özellikler paneli ---------- */
const ARROWS = [[0, 'Yok'], [13, 'Üçgen'], [4, 'Ok ucu'], [1, 'Açık'], [10, 'Daire'], [17, 'Eşkenar dörtgen']];
const PATTERNS = [[0, 'Yok'], [1, 'Düz'], [2, 'Kesik'], [3, 'Noktalı'], [4, 'Kesik-nokta'], [5, 'Kesik-nokta-nokta']];

function opts(list, cur) {
  let html = '';
  let found = false;
  for (const [v, t] of list) { if (Number(v) === Number(cur)) found = true; html += `<option value="${v}"${Number(v) === Number(cur) ? ' selected' : ''}>${t}</option>`; }
  if (!found) html = `<option value="${cur}" selected>Özel (${cur})</option>` + html;
  return html;
}

function inspectorForSingle(n) {
  const un = UNIT_INFO[App.units].s;
  const fill = n.num('FillPattern', 1);
  const fillC = colorOf(n.doc, n.str('FillForegnd', '1')) || '#ffffff';
  const linePat = n.num('LinePattern', 1);
  const lineC = colorOf(n.doc, n.str('LineColor', '0')) || '#000000';
  const lw = n.num('LineWeight', 0.01) * 72;
  const cp = charProps(n), pp = paraProps(n);
  const props = propRows(n);
  const nm = n.el.getAttribute('NameU') || n.el.getAttribute('Name') || '';
  const kind = n.type === 'Group' ? 'Grup' : n.oneD ? 'Bağlayıcı / çizgi' : n.type === 'Foreign' ? 'Resim / nesne' : 'Şekil';
  return `
  <div class="insp-head"><b>${kind}</b> <span class="muted">#${esc(n.id)}${nm ? ' · ' + esc(nm) : ''}</span></div>
  <div class="sec"><h4>Konum ve boyut <i class="muted">(${un})</i></h4>
    <div class="grid2">
      <label>X<input data-f="x" type="number" step="any"></label><label>Y<input data-f="y" type="number" step="any"></label>
      <label>Genişlik<input data-f="w" type="number" step="any"></label><label>Yükseklik<input data-f="h" type="number" step="any"></label>
      <label>Açı (°)<input data-f="a" type="number" step="any"></label>
    </div></div>
  <div class="sec"><h4>Dolgu</h4>
    <div class="row"><input type="color" data-f="fillColor" value="${fillC}"><label class="chk"><input type="checkbox" data-f="fillNone" ${fill === 0 ? 'checked' : ''}> Dolgu yok</label></div></div>
  <div class="sec"><h4>Çizgi</h4>
    <div class="row"><input type="color" data-f="lineColor" value="${lineC}"><label class="chk"><input type="checkbox" data-f="lineNone" ${linePat === 0 ? 'checked' : ''}> Çizgi yok</label></div>
    <div class="grid2">
      <label>Kalınlık (pt)<input data-f="lineW" type="number" step="0.25" min="0" value="${(Math.round(lw * 100) / 100)}"></label>
      <label>Desen<select data-f="linePat">${opts(PATTERNS, linePat)}</select></label>
      <label>Başlangıç oku<select data-f="arrB">${opts(ARROWS, Math.round(n.num('BeginArrow', 0)))}</select></label>
      <label>Bitiş oku<select data-f="arrE">${opts(ARROWS, Math.round(n.num('EndArrow', 0)))}</select></label>
    </div></div>
  <div class="sec"><h4>Metin</h4>
    <textarea data-f="text" rows="3" placeholder="Şekil metni">${esc(n.text())}</textarea>
    <div class="row wrap">
      <label class="inl">Boyut <input data-f="fontSize" type="number" min="1" step="0.5" value="${Math.round(cp.size * 72 * 10) / 10}" style="width:56px"> pt</label>
      <input type="color" data-f="textColor" value="${cp.color}" title="Metin rengi">
      <button class="mini${cp.bold ? ' on' : ''}" data-act="bold" title="Kalın"><b>K</b></button>
      <button class="mini${cp.italic ? ' on' : ''}" data-act="italic" title="İtalik"><i>İ</i></button>
      <button class="mini${cp.underline ? ' on' : ''}" data-act="underline" title="Altı çizili"><u>A</u></button>
      <button class="mini${pp.align === 0 ? ' on' : ''}" data-act="alignL" title="Sola">${icon('alignL')}</button>
      <button class="mini${pp.align === 1 ? ' on' : ''}" data-act="alignC" title="Ortala">${icon('alignC')}</button>
      <button class="mini${pp.align === 2 ? ' on' : ''}" data-act="alignR" title="Sağa">${icon('alignR')}</button>
    </div></div>
  <div class="sec"><h4>Sıralama ve işlemler</h4>
    <div class="row wrap">
      <button class="btn sm" data-act="front">${icon('front')}Öne getir</button>
      <button class="btn sm" data-act="back">${icon('back')}Arkaya gönder</button>
      <button class="btn sm" data-act="dup">${icon('copy')}Çoğalt</button>
      <button class="btn sm danger" data-act="del">${icon('trash')}Sil</button>
    </div></div>
  <div class="sec"><h4>Şekil verisi</h4>
    ${props.length ? `<table class="props">${props.map((p, i) => `<tr><td>${esc(p.label)}</td><td><input data-prop="${i}" value="${esc(p.value)}"></td></tr>`).join('')}</table>` : '<div class="muted">Bu şekilde veri alanı yok.</div>'}
  </div>`;
}

function inspectorForMulti(nodes) {
  return `
  <div class="insp-head"><b>${nodes.length} şekil seçili</b></div>
  <div class="sec"><h4>Hizala</h4>
    <div class="row wrap">
      ${['alignL:left:Sola', 'alignC:center:Yatay ortala', 'alignR:right:Sağa', 'alignT:top:Üste', 'alignM:middle:Dikey ortala', 'alignB:bottom:Alta'].map((s) => { const [i, m, t] = s.split(':'); return `<button class="mini" data-align="${m}" title="${t}">${icon(i)}</button>`; }).join('')}
      <button class="mini" data-dist="h" title="Yatay eşit dağıt">${icon('distH')}</button>
      <button class="mini" data-dist="v" title="Dikey eşit dağıt">${icon('distV')}</button>
    </div></div>
  <div class="sec"><h4>Dolgu ve çizgi</h4>
    <div class="row"><input type="color" data-f="fillColor" value="#ffffff" title="Dolgu rengi"><label class="chk"><input type="checkbox" data-f="fillNone"> Dolgu yok</label></div>
    <div class="row"><input type="color" data-f="lineColor" value="#333333" title="Çizgi rengi"><label class="chk"><input type="checkbox" data-f="lineNone"> Çizgi yok</label></div></div>
  <div class="sec"><div class="row wrap">
      <button class="btn sm" data-act="dup">${icon('copy')}Çoğalt</button>
      <button class="btn sm danger" data-act="del">${icon('trash')}Sil</button></div></div>`;
}

function inspectorForNone() {
  const d = App.doc;
  let shapes = 0;
  for (const p of d.pages) shapes += p.dom.getElementsByTagNameNS(NS_V, 'Shape').length;
  const notes = d.report.length
    ? `<ul class="notes">${d.report.map((r) => `<li class="${r.kind}">${esc(r.text)}</li>`).join('')}</ul>`
    : '<div class="muted">Desteklenmeyen öğe bulunmadı.</div>';
  return `
  <div class="insp-head"><b>Belge</b></div>
  <div class="sec"><div class="kv"><span>Dosya</span><b>${esc(d.name)}</b></div>
    <div class="kv"><span>Sayfa</span><b>${d.pages.length}</b></div>
    <div class="kv"><span>Şekil (tüm sayfalar)</span><b>${shapes}</b></div>
    <div class="kv"><span>Master</span><b>${d.masters.size}</b></div>
    <div class="kv"><span>Sayfa boyutu</span><b>${fmtU(App.page.w)} × ${fmtU(App.page.h)} ${UNIT_INFO[App.units].s}</b></div></div>
  <div class="sec"><h4>Görüntüleme notları</h4>${notes}</div>
  <div class="sec"><h4>İpuçları</h4><div class="muted tips">Şekle tıklayın · çift tıklayarak metni düzenleyin · tutamaçlarla boyutlandırın/döndürün · Ctrl+tıklama grup içindeki şekli seçer · boşluk+sürükleme kaydırır · Ctrl+tekerlek yakınlaştırır · <kbd>?</kbd> tüm kısayollar.</div></div>`;
}

function renderInspector() {
  const box = $('#inspector');
  if (!App.doc || !App.page) { box.innerHTML = ''; return; }
  const nodes = selNodes();
  if (!nodes.length) box.innerHTML = inspectorForNone();
  else if (nodes.length === 1) box.innerHTML = inspectorForSingle(nodes[0]);
  else box.innerHTML = inspectorForMulti(nodes);
  renderInspectorValues();
}

function renderInspectorValues() {
  const nodes = selNodes();
  if (nodes.length !== 1) return;
  const n = nodes[0];
  const set = (f, v) => { const el = $(`#inspector [data-f="${f}"]`); if (el && document.activeElement !== el) el.value = v; };
  const d = UNIT_INFO[App.units].d;
  set('x', toUnit(n.pinX).toFixed(d)); set('y', toUnit(n.pinY).toFixed(d));
  set('w', toUnit(n.w).toFixed(d)); set('h', toUnit(n.h).toFixed(d));
  set('a', (n.angle * 180 / Math.PI).toFixed(2));
}

function onInspectorChange(e) {
  const t = e.target;
  const f = t.dataset.f;
  if (t.dataset.prop !== undefined) {
    const n = selNodes()[0];
    const row = propRows(n)[Number(t.dataset.prop)];
    if (row) editSelected(() => setPropValue(n, row.secIx, row.key, row.name, t.value));
    return;
  }
  if (!f) return;
  const val = t.type === 'checkbox' ? t.checked : t.value;
  const nodes = selNodes();
  if (!nodes.length) return;
  const num = parseFloat(val);
  switch (f) {
    case 'x': case 'y': if (Number.isFinite(num)) editSelected(([n]) => { setCell(n.el, f === 'x' ? 'PinX' : 'PinY', fmtNum(fromUnit(num))); }, { reroute: true, partial: true }); break;
    case 'w': case 'h': if (Number.isFinite(num) && num > 0) editSelected(([n]) => {
      const w = f === 'w' ? fromUnit(num) : n.w, h = f === 'h' ? fromUnit(num) : n.h;
      resizeKeepAnchor(n, w, h, 0.5, 0.5);
    }, { reroute: true, partial: true }); break;
    case 'a': if (Number.isFinite(num)) editSelected(([n]) => setNodeAngle(n, num * Math.PI / 180), { reroute: true, partial: true }); break;
    case 'fillColor': editSelected((ns) => ns.forEach((n) => setFillColor(n, val)), { partial: true }); break;
    case 'fillNone': editSelected((ns) => ns.forEach((n) => setFillColor(n, val ? null : (colorOf(n.doc, n.str('FillForegnd', '1')) || '#FFFFFF'))), { partial: true }); break;
    case 'lineColor': editSelected((ns) => ns.forEach((n) => setLineColor(n, val)), { partial: true }); break;
    case 'lineNone': editSelected((ns) => ns.forEach((n) => setLineColor(n, val ? null : (colorOf(n.doc, n.str('LineColor', '0')) || '#333333'))), { partial: true }); break;
    case 'lineW': if (Number.isFinite(num) && num >= 0) editSelected(([n]) => setCell(n.el, 'LineWeight', fmtNum(num / 72)), { partial: true }); break;
    case 'linePat': editSelected(([n]) => setCell(n.el, 'LinePattern', val), { partial: true }); break;
    case 'arrB': editSelected(([n]) => setCell(n.el, 'BeginArrow', val), { partial: true }); break;
    case 'arrE': editSelected(([n]) => setCell(n.el, 'EndArrow', val), { partial: true }); break;
    case 'text': editSelected(([n]) => setNodeText(n, val), { partial: true }); break;
    case 'fontSize': if (Number.isFinite(num) && num > 0) editSelected(([n]) => setCharCell(n, 'Size', fmtNum(num / 72)), { partial: true }); break;
    case 'textColor': editSelected(([n]) => setCharCell(n, 'Color', val.toUpperCase()), { partial: true }); break;
    default: break;
  }
}

function onInspectorClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.act;
  if (b.dataset.align) { editSelected((ns) => alignNodes(ns, b.dataset.align), { reroute: true, partial: true }); return; }
  if (b.dataset.dist) { editSelected((ns) => distributeNodes(ns, b.dataset.dist), { reroute: true, partial: true }); return; }
  if (!act) return;
  if (act === 'del') return deleteSelection();
  if (act === 'dup') return duplicateSelection();
  if (act === 'front') return editSelected(([n]) => bringToFront(n));
  if (act === 'back') return editSelected(([n]) => sendToBack(n));
  if (act === 'bold') return editSelected(([n]) => setCharStyleBit(n, 1, !charProps(n).bold), { partial: true });
  if (act === 'italic') return editSelected(([n]) => setCharStyleBit(n, 2, !charProps(n).italic), { partial: true });
  if (act === 'underline') return editSelected(([n]) => setCharStyleBit(n, 4, !charProps(n).underline), { partial: true });
  if (act === 'alignL') return editSelected(([n]) => setParaAlign(n, 0), { partial: true });
  if (act === 'alignC') return editSelected(([n]) => setParaAlign(n, 1), { partial: true });
  if (act === 'alignR') return editSelected(([n]) => setParaAlign(n, 2), { partial: true });
}

/* ---------- durum çubuğu / başlık ---------- */
function updateStatus() {
  const el = $('#selInfo');
  if (!App.doc) { el.textContent = ''; return; }
  const n = selNodes();
  if (!n.length) el.textContent = `Sayfa ${App.pageIdx + 1}/${App.doc.pages.length} · ${App.page.name}`;
  else if (n.length === 1) el.textContent = `Şekil #${n[0].id} · ${fmtU(n[0].w)} × ${fmtU(n[0].h)} ${UNIT_INFO[App.units].s}`;
  else el.textContent = `${n.length} şekil seçili`;
}
function updateTitle() {
  const name = App.doc ? App.doc.name : 'Dosya açılmadı';
  $('#fileName').textContent = name + (App.dirty ? ' •' : '');
  document.title = (App.doc ? name + (App.dirty ? ' *' : '') + ' — ' : '') + 'VisViewer';
  $('#btnSave').disabled = !App.doc; $('#btnSaveAs').disabled = !App.doc;
}

/* ---------- mini harita ---------- */
let mmTimer = null;
function scheduleMinimap() {
  clearTimeout(mmTimer);
  mmTimer = setTimeout(renderMinimap, App.page && App.page.nodeMap && App.page.nodeMap.size > 800 ? 900 : 250);
}
function renderMinimap() {
  if (!App.doc || !App.page) return;
  const box = $('#mmPage');
  const pw = App.page.w, ph = App.page.h;
  const maxW = 176, maxH = 120;
  const k = Math.min(maxW / pw, maxH / ph);
  const w = Math.round(pw * k), h = Math.round(ph * k);
  box.style.width = w + 'px'; box.style.height = h + 'px';
  try { box.innerHTML = pageToSVGString(App.doc, App.page, { fit: true, noText: true }); } catch (e) { box.innerHTML = ''; }
  App.doc.buildTree(App.page);
  updateMinimapViewport();
}
function updateMinimapViewport() {
  const vp = $('#mmVp'), box = $('#mmPage');
  if (!App.page || !vp) return;
  const r = stageRect();
  const [x0, y1] = screenToPage(0, 0), [x1, y0] = screenToPage(r.width, r.height);
  const bw = box.clientWidth, bh = box.clientHeight;
  const sx = bw / App.page.w, sy = bh / App.page.h;
  const l = Math.max(0, x0 * sx), t = Math.max(0, (App.page.h - y1) * sy);
  const rr = Math.min(bw, x1 * sx), bb = Math.min(bh, (App.page.h - y0) * sy);
  vp.style.left = l + 'px'; vp.style.top = t + 'px';
  vp.style.width = Math.max(4, rr - l) + 'px'; vp.style.height = Math.max(4, bb - t) + 'px';
}
function minimapNav(e) {
  const box = $('#mmPage').getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width * App.page.w;
  const y = App.page.h - (e.clientY - box.top) / box.height * App.page.h;
  const r = stageRect();
  const z = App.view.z * 96;
  App.view.x = r.width / 2 - x * z;
  App.view.y = r.height / 2 - (App.page.h - y) * z;
  applyView();
}

/* ---------- arama ---------- */
function searchAll(q) {
  const out = [];
  const needle = q.toLocaleLowerCase('tr');
  const keep = App.page;
  App.doc.pages.forEach((p, pi) => {
    App.doc.buildTree(p);
    for (const n of p.nodeMap.values()) {
      const hay = [n.text(), n.el.getAttribute('NameU') || '', ...propRows(n).map((r) => r.value)].join(' \u0001 ');
      const idx = hay.toLocaleLowerCase('tr').indexOf(needle);
      if (idx >= 0) {
        const txt = n.text().replace(/\s+/g, ' ').trim() || n.el.getAttribute('NameU') || ('Şekil ' + n.id);
        out.push({ pi, id: n.id, label: txt.slice(0, 60), page: p.name });
        if (out.length >= 60) return;
      }
    }
  });
  App.doc.buildTree(keep);
  return out;
}
function runSearch() {
  const q = $('#searchInput').value.trim();
  const box = $('#searchResults');
  if (!App.doc || q.length < 1) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const res = searchAll(q);
  box.style.display = 'block';
  box.innerHTML = res.length
    ? res.map((r) => `<div class="sr" data-pi="${r.pi}" data-id="${esc(r.id)}"><b>${esc(r.label)}</b><span>${esc(r.page)}</span></div>`).join('')
    : '<div class="sr none">Sonuç yok</div>';
}
function goToShape(pi, id) {
  if (pi !== App.pageIdx) openPage(pi);
  const n = App.page.nodeMap.get(id);
  if (!n) return;
  selectIds([id]);
  const b = n.pageBBox();
  const padX = Math.max((b.x1 - b.x0) * 1.5, 1.5), padY = Math.max((b.y1 - b.y0) * 1.5, 1.2);
  fitPage({ x0: b.x0 - padX, x1: b.x1 + padX, y0: b.y0 - padY, y1: b.y1 + padY });
  if (App.view.z > 2) zoomAt(2, stageRect().width / 2, stageRect().height / 2);
}


/* ---------- son açılan dosyalar (yalnızca tutamaç; içerik saklanmaz) ---------- */
const Recent = {
  db() {
    return new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open('visviewer', 1); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = () => rq.result.createObjectStore('recent', { keyPath: 'name' });
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },
  async add(name, handle) {
    try {
      const db = await this.db();
      await new Promise((res, rej) => { const tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').put({ name, handle, time: Date.now() }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      const all = await this.list();
      for (const r of all.slice(6)) await new Promise((res) => { const tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').delete(r.name); tx.oncomplete = res; });
    } catch (e) { /* kullanılamıyorsa sessizce geç */ }
  },
  async list() {
    try {
      const db = await this.db();
      const all = await new Promise((res, rej) => { const rq = db.transaction('recent').objectStore('recent').getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
      return all.sort((a, b) => b.time - a.time);
    } catch (e) { return []; }
  },
  async remove(name) {
    try { const db = await this.db(); await new Promise((res) => { const tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').delete(name); tx.oncomplete = res; }); } catch (e) { /* yok say */ }
  },
};

async function renderRecent() {
  const box = $('#recent');
  if (!box) return;
  const list = await Recent.list();
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="rec-title">Son açılanlar</div>' + list.map((r, i) => `<button class="rec" data-i="${i}" title="${esc(r.name)}"><span>${esc(r.name)}</span><i>${new Date(r.time).toLocaleDateString('tr-TR')}</i></button>`).join('');
  box.onclick = async (e) => {
    const b = e.target.closest('.rec');
    if (!b) return;
    const r = list[Number(b.dataset.i)];
    try {
      let perm = await r.handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await r.handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { toast('Dosya erişim izni verilmedi.', 'warn'); return; }
      await loadFile(await r.handle.getFile(), r.handle);
    } catch (err) {
      await Recent.remove(r.name);
      toast('Dosya açılamadı (taşınmış veya silinmiş olabilir): ' + r.name, 'error');
      renderRecent();
    }
  };
}

/* ---------- dosya işlemleri ---------- */
const VSDX_TYPES = [{ description: 'Visio çizimi', accept: { 'application/vnd.ms-visio.drawing': ['.vsdx', '.vsdm'], 'application/octet-stream': ['.vsdx', '.vsdm'] } }];

async function loadBuffer(buf, name, handle) {
  try {
    toast('Dosya açılıyor…');
    const doc = await VDoc.load(buf, name);
    App.doc = doc; App.fileHandle = handle || null;
    if (handle) Recent.add(doc.name, handle);
    History.clear();
    App.dirty = false;
    App.hiddenLayers = new Set();
    $('#dropzone').style.display = 'none';
    $('#app').classList.add('has-doc');
    updateTitle();
    renderPageList();
    openPage(doc.pages.findIndex((p) => !p.background) >= 0 ? doc.pages.findIndex((p) => !p.background) : 0);
    renderInspector();
    const shapes = App.page.nodeMap.size;
    toast(`${name} açıldı · ${doc.pages.length} sayfa`);
    updateUndoButtons();
  } catch (err) {
    console.error(err);
    toast('Açılamadı: ' + err.message, 'error');
  }
}
async function loadFile(file, handle) {
  const buf = await file.arrayBuffer();
  await loadBuffer(buf, file.name, handle);
}
async function openFileDialog() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({ types: VSDX_TYPES, multiple: false });
      await loadFile(await h.getFile(), h);
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  $('#filePick').click();
}

function download(bytesOrStr, name, mime) {
  const blob = new Blob([bytesOrStr], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

async function saveFile(saveAs) {
  if (!App.doc) return;
  endTextEdit(true);
  try {
    const bytes = await App.doc.serialize();
    if (!saveAs && App.fileHandle) {
      try {
        const w = await App.fileHandle.createWritable();
        await w.write(bytes); await w.close();
        App.dirty = false; updateTitle(); toast('Kaydedildi: ' + App.doc.name);
        return;
      } catch (e) { /* yazma izni yok → aşağıda indir/farklı kaydet */ }
    }
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: App.doc.name, types: VSDX_TYPES });
        const w = await h.createWritable();
        await w.write(bytes); await w.close();
        App.fileHandle = h; App.doc.name = h.name; App.dirty = false; updateTitle(); Recent.add(h.name, h); toast('Kaydedildi: ' + h.name);
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const base = App.doc.name.replace(/\.(vsdx|vsdm)$/i, '');
    const name = /_duzenlendi$/.test(base) ? base + '.vsdx' : base + '_duzenlendi.vsdx';
    download(bytes, name, 'application/vnd.ms-visio.drawing');
    App.dirty = false; updateTitle();
    toast('İndirilenler klasörüne kaydedildi: ' + name);
  } catch (err) {
    console.error(err);
    toast('Kaydedilemedi: ' + err.message, 'error');
  }
}

async function exportPNG() {
  if (!App.doc) return;
  const svg = pageToSVGString(App.doc, App.page, { scale: 192 });
  App.doc.buildTree(App.page);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Resim üretilemedi')); img.src = url; });
  const c = document.createElement('canvas');
  c.width = Math.round(App.page.w * 192); c.height = Math.round(App.page.h * 192);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  c.toBlob((b) => download(b, App.doc.name.replace(/\.(vsdx|vsdm)$/i, '') + '_' + App.page.name + '.png', 'image/png'), 'image/png');
}
function exportSVG() {
  if (!App.doc) return;
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + pageToSVGString(App.doc, App.page, { scale: 96 });
  App.doc.buildTree(App.page);
  download(svg, App.doc.name.replace(/\.(vsdx|vsdm)$/i, '') + '_' + App.page.name + '.svg', 'image/svg+xml');
}

/* ---------- örnek / boş belge ---------- */
const SAMPLE_CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/><Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>';
const SAMPLE_ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/></Relationships>';
const SAMPLE_DOC = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<VisioDocument xmlns="${NS_V}" xmlns:r="${NS_R}" xml:space="preserve"><DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0"/><Colors/><FaceNames><FaceName ID="0" Name="Calibri" UnicodeRanges="-536870145 -1073732485 9 0" CharSets="1073742335 -65536" Panose="2 15 5 2 2 2 4 3 2 4" Flags="325"/></FaceNames><StyleSheets><StyleSheet ID="0" NameU="No Style" IsCustomName="1" IsCustomNameU="1"><Cell N="EnableLineProps" V="1"/><Cell N="EnableFillProps" V="1"/><Cell N="EnableTextProps" V="1"/><Cell N="LineWeight" V="0.01041666666666667"/><Cell N="LineColor" V="0"/><Cell N="LinePattern" V="1"/><Cell N="FillForegnd" V="1"/><Cell N="FillBkgnd" V="0"/><Cell N="FillPattern" V="1"/><Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/><Cell N="VerticalAlign" V="1"/><Section N="Character"><Row IX="0"><Cell N="Font" V="0"/><Cell N="Color" V="0"/><Cell N="Size" V="0.1666666666666667"/></Row></Section><Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="1"/></Row></Section></StyleSheet></StyleSheets></VisioDocument>`;
const SAMPLE_DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/></Relationships>';
const SAMPLE_PAGES = (w, h) => `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<Pages xmlns="${NS_V}" xmlns:r="${NS_R}" xml:space="preserve"><Page ID="0" NameU="Sayfa-1" Name="Sayfa-1" ViewScale="-1" ViewCenterX="${w / 2}" ViewCenterY="${h / 2}"><PageSheet LineStyle="0" FillStyle="0" TextStyle="0"><Cell N="PageWidth" V="${w}"/><Cell N="PageHeight" V="${h}"/><Cell N="PageScale" V="1" U="IN_F"/><Cell N="DrawingScale" V="1" U="IN_F"/></PageSheet><Rel r:id="rId1"/></Page></Pages>`;
const SAMPLE_PAGES_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/></Relationships>';
const SAMPLE_PAGE = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<PageContents xmlns="${NS_V}" xmlns:r="${NS_R}" xml:space="preserve"><Shapes/><Connects/></PageContents>`;

async function blankPackage(w, h) {
  const mk = (name, text) => ({ name, data: utf8enc.encode(text), modified: true });
  const entries = [
    mk('[Content_Types].xml', SAMPLE_CT), mk('_rels/.rels', SAMPLE_ROOT_RELS),
    mk('visio/document.xml', SAMPLE_DOC), mk('visio/_rels/document.xml.rels', SAMPLE_DOC_RELS),
    mk('visio/pages/pages.xml', SAMPLE_PAGES(w, h)), mk('visio/pages/_rels/pages.xml.rels', SAMPLE_PAGES_RELS),
    mk('visio/pages/page1.xml', SAMPLE_PAGE),
  ];
  return (await writeZip(entries)).buffer;
}

async function openSample(blank) {
  const buf = await blankPackage(11.69, 8.27);
  await loadBuffer(buf, blank ? 'yeni-cizim.vsdx' : 'ornek-akis.vsdx', null);
  if (blank) { App.dirty = true; updateTitle(); return; }
  const doc = App.doc, page = App.page;
  const mkS = (kind, x, y, w, h, text, fill, line) => {
    const id = addShape(page, kind, x, y, w, h, text);
    doc.buildTree(page);
    const n = page.nodeMap.get(String(id));
    if (fill) setFillColor(n, fill);
    if (line) setLineColor(n, line);
    return String(id);
  };
  const title = mkS('text', 5.85, 7.55, 6, 0.5, 'Örnek akış şeması', null, null);
  doc.buildTree(page);
  setCharCell(page.nodeMap.get(title), 'Size', fmtNum(20 / 72));
  setCharStyleBit(page.nodeMap.get(title), 1, true);
  const a = mkS('rounded', 3, 6.6, 2.2, 0.7, 'Başla', '#DDEBF7', '#2F5597');
  const b = mkS('rect', 3, 5.2, 2.4, 0.8, 'Veriyi oku', '#FFFFFF', '#2F5597');
  const c = mkS('diamond', 3, 3.5, 2.4, 1.4, 'Değer > 0 ?', '#FFF2CC', '#BF9000');
  const d = mkS('rect', 6.6, 3.5, 2.4, 0.8, 'İşle', '#E2F0D9', '#548235');
  const e = mkS('rect', 3, 1.7, 2.4, 0.8, 'Hata bildir', '#FBE5D6', '#C55A11');
  const f = mkS('ellipse', 6.6, 1.7, 2.2, 0.9, 'Bitir', '#DDEBF7', '#2F5597');
  const n1 = mkS('text', 4.5, 3.9, 0.9, 0.3, 'Evet', null, null);
  const n2 = mkS('text', 2.35, 2.45, 0.9, 0.3, 'Hayır', null, null);
  doc.buildTree(page);
  const link = (x, y, el) => addConnector(doc, page, x, y, el);
  link(a, b, false); link(b, c, false); link(c, d, false); link(c, e, false); link(d, f, true); link(e, f, false);
  doc.buildTree(page);
  const note = mkS('rect', 9.6, 6.2, 3.0, 1.5, 'Bu çizimi sürükleyip yeniden boyutlandırabilir, metinleri çift tıklayarak değiştirebilirsiniz.', '#F2F2F2', '#7F7F7F');
  doc.buildTree(page);
  setCharCell(page.nodeMap.get(note), 'Size', fmtNum(10 / 72));
  setCell(page.nodeMap.get(note).el, 'Width', '3');
  doc.markDirty(page);
  App.dirty = false;
  History.clear();
  App.doc.buildTree(page);
  refreshAll();
  fitPage();
  updateTitle();
}

/* ---------- yardım ---------- */
const SHORTCUTS = [
  ['V / H', 'Seç / El aracı'], ['R / O / D / T / C', 'Dikdörtgen / Elips / Eşkenar dörtgen / Metin / Bağlayıcı'],
  ['Ctrl+O / Ctrl+S', 'Aç / Kaydet'], ['Ctrl+Shift+S', 'Farklı kaydet'],
  ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'], ['Ctrl+C / X / V / D', 'Kopyala / Kes / Yapıştır / Çoğalt'],
  ['Delete', 'Sil'], ['Ok tuşları', 'İnce taşıma (Shift: 10×)'], ['F2 / Enter / çift tık', 'Metni düzenle'],
  ['Ctrl+tıklama', 'Grup içindeki şekli seç'], ['Shift+tıklama', 'Seçime ekle/çıkar'],
  ['Boşluk+sürükle / orta tuş', 'Kaydır'], ['Ctrl+tekerlek', 'Yakınlaştır'], ['F', 'Sayfaya sığdır'], ['+ / −', 'Yakınlaştır / uzaklaştır'], ['Ctrl+F', 'Şekil/metin ara'],
];
function showHelp() {
  const d = $('#helpDialog');
  $('#helpBody').innerHTML = `<table class="keys">${SHORTCUTS.map(([k, t]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(t)}</td></tr>`).join('')}</table>
  <p class="muted">Not: Eski ikili <b>.vsd</b> biçimi desteklenmez; Visio'da "Farklı kaydet → Visio Çizimi (*.vsdx)" yapın. Kaydedilen dosyada yalnızca değiştirdiğiniz şekillerin hücreleri güncellenir, geri kalan her şey olduğu gibi korunur.</p>`;
  d.style.display = 'flex';
}

/* ---------- tema ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('vv-theme', t); } catch (e) { /* yok say */ }
}

/* ---------- başlatma ---------- */
function bindUI() {
  // simgeleri yerleştir
  $$('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });

  $('#btnOpen').onclick = openFileDialog;
  $('#btnOpen2').onclick = openFileDialog;
  $('#btnSample').onclick = () => openSample(false);
  $('#btnBlank').onclick = () => openSample(true);
  $('#btnSave').onclick = () => saveFile(false);
  $('#btnSaveAs').onclick = () => saveFile(true);
  $('#btnUndo').onclick = () => doUndo(false);
  $('#btnRedo').onclick = () => doUndo(true);
  $('#btnPng').onclick = exportPNG;
  $('#btnSvg').onclick = exportSVG;
  $('#btnHelp').onclick = showHelp;
  $('#helpClose').onclick = () => { $('#helpDialog').style.display = 'none'; };
  $('#helpDialog').onclick = (e) => { if (e.target.id === 'helpDialog') e.target.style.display = 'none'; };
  $('#btnTheme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#filePick').onchange = (e) => { const f = e.target.files[0]; if (f) loadFile(f, null); e.target.value = ''; };

  $$('#toolbar [data-tool]').forEach((b) => { b.onclick = () => setTool(b.dataset.tool); });
  $('#zoomIn').onclick = () => zoomCenter(1.25);
  $('#zoomOut').onclick = () => zoomCenter(0.8);
  $('#zoomFit').onclick = () => fitPage();
  $('#zoomSel').onclick = () => { const n = selNodes(); if (!n.length) return fitPage(); let b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; for (const x of n) { const bb = x.pageBBox(); b = { x0: Math.min(b.x0, bb.x0), y0: Math.min(b.y0, bb.y0), x1: Math.max(b.x1, bb.x1), y1: Math.max(b.y1, bb.y1) }; } const px = Math.max((b.x1 - b.x0) * 0.4, 0.5), py = Math.max((b.y1 - b.y0) * 0.4, 0.5); fitPage({ x0: b.x0 - px, x1: b.x1 + px, y0: b.y0 - py, y1: b.y1 + py }); };
  $('#chkSnap').onchange = (e) => { App.snap = e.target.checked; };
  $('#chkGrid').onchange = (e) => { App.grid = e.target.checked; applyView(); };
  $('#unitSel').onchange = (e) => { App.units = e.target.value; if (App.page) { setupFrame(); renderPage(); renderInspector(); updateStatus(); } };
  $('#chkMini').onchange = (e) => { App.minimap = e.target.checked; $('#minimap').style.display = App.minimap && App.doc ? '' : 'none'; };

  const stage = $('#stage');
  stage.addEventListener('pointerdown', onStagePointerDown);
  stage.addEventListener('pointermove', onStagePointerMove);
  stage.addEventListener('pointerup', onStagePointerUp);
  stage.addEventListener('pointercancel', onStagePointerUp);
  stage.addEventListener('dblclick', onStageDblClick);
  stage.addEventListener('wheel', onStageWheel, { passive: false });
  stage.addEventListener('pointerleave', () => { if (App.hover) { App.hover = null; drawOverlay(); } });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', () => { applyView(); });
  window.addEventListener('beforeunload', (e) => { if (App.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // sürükle-bırak ile açma
  ['dragenter', 'dragover'].forEach((ev) => document.body.addEventListener(ev, (e) => { e.preventDefault(); $('#dropzone').classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => document.body.addEventListener(ev, (e) => { e.preventDefault(); $('#dropzone').classList.remove('over'); }));
  document.body.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f, null);
  });

  // sol sekmeler
  $$('#leftTabs button').forEach((b) => { b.onclick = () => { $$('#leftTabs button').forEach((x) => x.classList.toggle('active', x === b)); $$('.lpanel').forEach((p) => { p.style.display = p.id === b.dataset.panel ? '' : 'none'; }); }; });
  $('#shapeTree').addEventListener('click', (e) => {
    const t = e.target.closest('.tnode');
    if (t) { selectIds([t.dataset.id]); }
  });
  $('#shapeTree').addEventListener('dblclick', (e) => { const t = e.target.closest('.tnode'); if (t) $('#zoomSel').click(); });
  $('#shapeTree').addEventListener('mouseover', (e) => { const t = e.target.closest('.tnode'); App.hover = t ? t.dataset.id : null; drawOverlay(); });
  $('#shapeTree').addEventListener('mouseleave', () => { App.hover = null; drawOverlay(); });
  $('#layerList').addEventListener('change', (e) => {
    const ix = parseInt(e.target.dataset.layer, 10);
    if (Number.isFinite(ix)) { if (e.target.checked) App.hiddenLayers.delete(ix); else App.hiddenLayers.add(ix); renderPage(); }
  });
  $('#inspector').addEventListener('change', onInspectorChange);
  $('#inspector').addEventListener('click', onInspectorClick);

  // arama
  let st = null;
  $('#searchInput').addEventListener('input', () => { clearTimeout(st); st = setTimeout(runSearch, 160); });
  $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; runSearch(); e.target.blur(); } else if (e.key === 'Enter') { const f = $('#searchResults .sr[data-id]'); if (f) f.click(); } });
  $('#searchResults').addEventListener('click', (e) => {
    const r = e.target.closest('.sr[data-id]');
    if (r) { goToShape(parseInt(r.dataset.pi, 10), r.dataset.id); $('#searchResults').style.display = 'none'; }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#searchBox')) $('#searchResults').style.display = 'none'; });

  // mini harita
  let mmDrag = false;
  $('#mmBox').addEventListener('pointerdown', (e) => { mmDrag = true; e.currentTarget.setPointerCapture(e.pointerId); minimapNav(e); });
  $('#mmBox').addEventListener('pointermove', (e) => { if (mmDrag) minimapNav(e); });
  $('#mmBox').addEventListener('pointerup', () => { mmDrag = false; });

  setTool('select');
  updateTitle();
  updateUndoButtons();
}

async function boot() {
  let theme = 'light';
  try { theme = localStorage.getItem('vv-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* yok say */ }
  setTheme(theme);
  bindUI();
  renderRecent();
  if (window.VV_BOOT && window.VV_BOOT.b64) {
    try {
      const bin = atob(window.VV_BOOT.b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      await loadBuffer(u8.buffer, window.VV_BOOT.name || 'cizim.vsdx', null);
    } catch (e) { toast('Dosya açılamadı: ' + e.message, 'error'); }
  }
}
window.addEventListener('DOMContentLoaded', boot);

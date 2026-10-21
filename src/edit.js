/* Düzenleme işlemleri: orijinal XML DOM'unu yerinde değiştirir.
   Yalnızca dokunulan hücreler yazılır; geri kalan her şey olduğu gibi korunur. */
'use strict';

const XMLNS_ATTR = 'http://www.w3.org/2000/xmlns/';

function mkEl(dom, tag, attrs) {
  const el = dom.createElementNS(NS_V, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/* Visio şema sırası: Cell*, Section*, Text, Data*, ForeignData, Shapes */
function insertInOrder(shapeEl, newEl, kindRank) {
  const rank = (e) => {
    const n = e.localName;
    if (n === 'Cell') return 0;
    if (n === 'Section') return 1;
    if (n === 'Text') return 2;
    if (n === 'Data1' || n === 'Data2' || n === 'Data3') return 3;
    if (n === 'ForeignData') return 4;
    if (n === 'Shapes') return 5;
    return 6;
  };
  for (const c of shapeEl.children) {
    if (rank(c) > kindRank) { shapeEl.insertBefore(newEl, c); return; }
  }
  shapeEl.appendChild(newEl);
}

function ensureCell(el, name) {
  let c = findCell(el, name);
  if (!c) {
    c = mkEl(el.ownerDocument, 'Cell', { N: name });
    // satır içinde (Row) ise sona ekle, şekil içindeyse sıraya göre
    if (el.localName === 'Shape') insertInOrder(el, c, 0); else el.appendChild(c);
  }
  return c;
}

function setCell(el, name, value, keepF) {
  const c = ensureCell(el, name);
  c.setAttribute('V', String(value));
  if (!keepF) c.removeAttribute('F');
  return c;
}

function fmtNum(n) { return String(Math.round(n * 1e6) / 1e6); }

function ensureSection(shapeEl, name, ix) {
  for (const s of kids(shapeEl, 'Section')) {
    if (s.getAttribute('N') === name && (s.getAttribute('IX') || '0') === String(ix)) return s;
  }
  const s = mkEl(shapeEl.ownerDocument, 'Section', { N: name, IX: String(ix) });
  insertInOrder(shapeEl, s, 1);
  return s;
}

function ensureRow(sec, ix) {
  for (const r of kids(sec, 'Row')) if (r.getAttribute('IX') === String(ix)) return r;
  const r = mkEl(sec.ownerDocument, 'Row', { IX: String(ix) });
  sec.appendChild(r);
  return r;
}

/* ---------- geri al / yinele ---------- */
const History = {
  undo: [], redo: [],
  snap(doc, page) {
    return { doc, page, xml: new XMLSerializer().serializeToString(page.dom) };
  },
  push(doc, page) {
    this.undo.push(this.snap(doc, page));
    if (this.undo.length > 100) this.undo.shift();
    this.redo.length = 0;
  },
  restore(s) {
    const dom = new DOMParser().parseFromString(s.xml, 'application/xml');
    s.doc.dom.set(s.page.path, dom);
    s.page.dom = dom;
    s.doc.dirtyParts.add(s.page.path);
  },
  doUndo() {
    const s = this.undo.pop();
    if (!s) return null;
    this.redo.push(this.snap(s.doc, s.page));
    this.restore(s);
    return s;
  },
  doRedo() {
    const s = this.redo.pop();
    if (!s) return null;
    this.undo.push(this.snap(s.doc, s.page));
    this.restore(s);
    return s;
  },
  clear() { this.undo.length = 0; this.redo.length = 0; },
};

/* ---------- temel dönüşümler ---------- */
function parentLinear(node) {
  const m = node.parentM || M_ID;
  return [m[0], m[1], m[2], m[3], 0, 0];
}

function moveNode(node, dxPage, dyPage) {
  const inv = mInv(parentLinear(node));
  const [dx, dy] = mApply(inv, dxPage, dyPage);
  setCell(node.el, 'PinX', fmtNum(node.pinX + dx));
  setCell(node.el, 'PinY', fmtNum(node.pinY + dy));
}

function setPagePos(node, pageX, pageY) {
  // yerel kutunun merkezini sayfa koordinatına yerleştir
  const c = mApply(node.M, node.w / 2, node.h / 2);
  moveNode(node, pageX - c[0], pageY - c[1]);
}

function recomputeNode(node) {
  node.computeBasics();
  node.M = mMul(node.parentM || M_ID, localMatrix(node));
  for (const c of node.children) { c.parentM = node.M; recomputeNode(c); }
}

/* Biçimlendirilmiş hücreleri yeni ölçülerle yeniden hesapla */
function reevaluateFormulas(node) {
  const ctxNode = node;
  const evalCell = (cell) => {
    const f = cell.getAttribute('F');
    if (!f || f === 'Inh') return false;
    try {
      const v = evalFormula(f, ctxNode.formulaCtx());
      cell.setAttribute('V', fmtNum(v));
      return true;
    } catch (e) { return false; }
  };
  const visit = (el) => {
    for (const c of el.children) {
      if (c.localName === 'Cell') {
        const n = c.getAttribute('N');
        if (n === 'Width' || n === 'Height') continue;
        const f = c.getAttribute('F');
        if (f && /Width|Height/.test(f)) evalCell(c);
      } else if (c.localName === 'Section' || c.localName === 'Row') visit(c);
    }
  };
  visit(node.el);
}

function scaleOwnGeometry(node, sx, sy) {
  // formülü çözülemeyen yerel geometri hücrelerini orantılı ölçekle
  for (const sec of kids(node.el, 'Section')) {
    if (sec.getAttribute('N') !== 'Geometry') continue;
    for (const row of kids(sec, 'Row')) {
      const t = row.getAttribute('T') || '';
      if (t.startsWith('Rel') || t === 'ArcTo') continue;
      for (const c of kids(row, 'Cell')) {
        const n = c.getAttribute('N');
        const f = c.getAttribute('F');
        if (f && f !== 'Inh' && /Width|Height/.test(f)) continue; // formül yeniden hesaplanacak
        const v = parseFloat(c.getAttribute('V'));
        if (!Number.isFinite(v)) continue;
        const isXLike = n === 'X' || (n === 'A' && (t === 'EllipticalArcTo' || t === 'Ellipse')) || (n === 'C' && t === 'Ellipse');
        const isYLike = n === 'Y' || (n === 'B' && (t === 'EllipticalArcTo' || t === 'Ellipse')) || (n === 'D' && t === 'Ellipse');
        if (isXLike) { c.setAttribute('V', fmtNum(v * sx)); if (f) c.removeAttribute('F'); }
        else if (isYLike) { c.setAttribute('V', fmtNum(v * sy)); if (f) c.removeAttribute('F'); }
      }
    }
  }
}

function setNodeSize(node, newW, newH) {
  newW = Math.max(newW, 0.01); newH = Math.max(newH, 0.01);
  const sx = node.w > 0 ? newW / node.w : 1;
  const sy = node.h > 0 ? newH / node.h : 1;
  const old = { w: node.w, h: node.h };
  setCell(node.el, 'Width', fmtNum(newW));
  setCell(node.el, 'Height', fmtNum(newH));
  // yerel geometri: önce orantılı ölçek (yalnız formülsüz), sonra formüller
  scaleOwnGeometry(node, sx, sy);
  // LocPin: orantıyı koru
  const lx = findCell(node.el, 'LocPinX'), ly = findCell(node.el, 'LocPinY');
  if (lx) { if (!(lx.getAttribute('F') && /Width/.test(lx.getAttribute('F')))) setCell(node.el, 'LocPinX', fmtNum(node.locX * sx)); }
  else if (old.w) setCell(node.el, 'LocPinX', fmtNum(node.locX * sx));
  if (ly) { if (!(ly.getAttribute('F') && /Height/.test(ly.getAttribute('F')))) setCell(node.el, 'LocPinY', fmtNum(node.locY * sy)); }
  else if (old.h) setCell(node.el, 'LocPinY', fmtNum(node.locY * sy));
  // metin kutusu hücreleri
  for (const [n, k] of [['TxtWidth', sx], ['TxtPinX', sx], ['TxtLocPinX', sx], ['TxtHeight', sy], ['TxtPinY', sy], ['TxtLocPinY', sy]]) {
    const c = findCell(node.el, n);
    if (c && !(c.getAttribute('F') && /Width|Height/.test(c.getAttribute('F')))) {
      const v = parseFloat(c.getAttribute('V'));
      if (Number.isFinite(v)) { c.setAttribute('V', fmtNum(v * k)); c.removeAttribute('F'); }
    }
  }
  reevaluateFormulas(node);
  // alt şekiller
  for (const ch of node.children) {
    setCell(ch.el, 'PinX', fmtNum(ch.pinX * sx));
    setCell(ch.el, 'PinY', fmtNum(ch.pinY * sy));
    setNodeSize(ch, ch.w * sx, ch.h * sy);
  }
}

/* Boyutlandır; (ax,ay) yerel oranlı noktayı sayfada sabit tut */
function resizeKeepAnchor(node, newW, newH, ax, ay) {
  const before = mApply(node.M, ax * node.w, ay * node.h);
  setNodeSize(node, newW, newH);
  recomputeNode(node);
  const after = mApply(node.M, ax * node.w, ay * node.h);
  moveNode(node, before[0] - after[0], before[1] - after[1]);
  recomputeNode(node);
}

function setNodeAngle(node, rad) {
  setCell(node.el, 'Angle', fmtNum(rad));
}

/* ---------- metin ---------- */
function setNodeText(node, str) {
  const dom = node.el.ownerDocument;
  let t = kid(node.el, 'Text');
  if (!t) { t = mkEl(dom, 'Text'); insertInOrder(node.el, t, 2); }
  // ilk cp / pp işaretlerini koru, geri kalanı değiştir
  const keep = [];
  for (const c of [...t.childNodes]) {
    if (c.nodeType === 1 && (c.localName === 'cp' || c.localName === 'pp' || c.localName === 'tp') && !keep.some((k) => k.localName === c.localName)) keep.push(c);
  }
  while (t.firstChild) t.removeChild(t.firstChild);
  for (const k of keep) t.appendChild(k);
  t.appendChild(dom.createTextNode(str));
}

function charRow(node, create) {
  const sec = ensureSection(node.el, 'Character', 0);
  return ensureRow(sec, 0);
}
function setCharCell(node, name, value) {
  const row = charRow(node);
  setCell(row, name, value);
}
function setCharStyleBit(node, bit, on) {
  const cp = charProps(node);
  const cur = (cp.bold ? 1 : 0) | (cp.italic ? 2 : 0) | (cp.underline ? 4 : 0);
  const st = on ? (cur | bit) : (cur & ~bit);
  setCharCell(node, 'Style', st);
}
function setParaAlign(node, a) {
  const sec = ensureSection(node.el, 'Paragraph', 0);
  setCell(ensureRow(sec, 0), 'HorzAlign', a);
}

/* ---------- stiller ---------- */
function hexOk(c) { return /^#[0-9a-fA-F]{6}$/.test(c); }
function setFillColor(node, hex) {
  if (hex === null) { setCell(node.el, 'FillPattern', 0); return; }
  setCell(node.el, 'FillPattern', 1);
  setCell(node.el, 'FillForegnd', hex.toUpperCase());
  setCell(node.el, 'FillGradientEnabled', 0);
}
function setLineColor(node, hex) {
  if (hex === null) { setCell(node.el, 'LinePattern', 0); return; }
  if (node.num('LinePattern', 1) === 0) setCell(node.el, 'LinePattern', 1);
  setCell(node.el, 'LineColor', hex.toUpperCase());
}

/* ---------- şekil verisi (Property) ---------- */
function propRows(node) {
  const secs = node.sections('Property');
  const out = [];
  for (const [, sec] of secs) {
    for (const r of node.sortedRows(sec)) {
      const label = r.cells.get('Label') ? r.cells.get('Label').el.getAttribute('V') : (r.n || r.key);
      const value = r.cells.get('Value') ? r.cells.get('Value').el.getAttribute('V') : '';
      out.push({ key: r.key, name: r.n, label: label || r.n || r.key, value: value === null ? '' : value, secIx: sec.ix });
    }
  }
  return out;
}
function setPropValue(node, secIx, key, name, value) {
  const sec = ensureSection(node.el, 'Property', secIx);
  let row = null;
  for (const r of kids(sec, 'Row')) if ((r.getAttribute('IX') || r.getAttribute('N')) === key) row = r;
  if (!row) {
    row = mkEl(node.el.ownerDocument, 'Row');
    if (name) row.setAttribute('N', name); else row.setAttribute('IX', key);
    sec.appendChild(row);
  }
  setCell(row, 'Value', value);
}

/* ---------- kimlik ve ekleme ---------- */
function allShapeEls(page) {
  const out = [];
  const walk = (parent) => {
    const sh = kid(parent, 'Shapes');
    if (!sh) return;
    for (const s of kids(sh, 'Shape')) { out.push(s); walk(s); }
  };
  walk(page.dom.documentElement);
  return out;
}
function nextShapeId(page) {
  let max = 0;
  for (const s of allShapeEls(page)) max = Math.max(max, parseInt(s.getAttribute('ID'), 10) || 0);
  return max + 1;
}
function pageShapesEl(page) {
  const root = page.dom.documentElement;
  let sh = kid(root, 'Shapes');
  if (!sh) {
    sh = mkEl(page.dom, 'Shapes');
    const connects = kid(root, 'Connects');
    if (connects) root.insertBefore(sh, connects); else root.appendChild(sh);
  }
  return sh;
}
function pageConnectsEl(page) {
  const root = page.dom.documentElement;
  let c = kid(root, 'Connects');
  if (!c) { c = mkEl(page.dom, 'Connects'); root.appendChild(c); }
  return c;
}

function cellEl(dom, n, v, f) {
  const c = mkEl(dom, 'Cell', { N: n, V: String(v) });
  if (f) c.setAttribute('F', f);
  return c;
}
function geoRow(dom, ix, t, cells) {
  const r = mkEl(dom, 'Row', { T: t, IX: String(ix) });
  for (const [n, v, f] of cells) r.appendChild(cellEl(dom, n, fmtNum(v), f));
  return r;
}

function buildGeometrySection(dom, kind, W, H) {
  const sec = mkEl(dom, 'Section', { N: 'Geometry', IX: '0' });
  sec.appendChild(cellEl(dom, 'NoFill', 0));
  sec.appendChild(cellEl(dom, 'NoLine', 0));
  sec.appendChild(cellEl(dom, 'NoShow', 0));
  sec.appendChild(cellEl(dom, 'NoSnap', 0));
  sec.appendChild(cellEl(dom, 'NoQuickDrag', 0));
  if (kind === 'ellipse') {
    sec.appendChild(geoRow(dom, 1, 'Ellipse', [['X', W / 2, 'Width*0.5'], ['Y', H / 2, 'Height*0.5'], ['A', W, 'Width*1'], ['B', H / 2, 'Height*0.5'], ['C', W / 2, 'Width*0.5'], ['D', H, 'Height*1']]));
  } else if (kind === 'diamond') {
    sec.appendChild(geoRow(dom, 1, 'MoveTo', [['X', 0, 'Width*0'], ['Y', H / 2, 'Height*0.5']]));
    sec.appendChild(geoRow(dom, 2, 'LineTo', [['X', W / 2, 'Width*0.5'], ['Y', H, 'Height*1']]));
    sec.appendChild(geoRow(dom, 3, 'LineTo', [['X', W, 'Width*1'], ['Y', H / 2, 'Height*0.5']]));
    sec.appendChild(geoRow(dom, 4, 'LineTo', [['X', W / 2, 'Width*0.5'], ['Y', 0, 'Height*0']]));
    sec.appendChild(geoRow(dom, 5, 'LineTo', [['X', 0, 'Width*0'], ['Y', H / 2, 'Height*0.5']]));
  } else {
    sec.appendChild(geoRow(dom, 1, 'MoveTo', [['X', 0, 'Width*0'], ['Y', 0, 'Height*0']]));
    sec.appendChild(geoRow(dom, 2, 'LineTo', [['X', W, 'Width*1'], ['Y', 0, 'Height*0']]));
    sec.appendChild(geoRow(dom, 3, 'LineTo', [['X', W, 'Width*1'], ['Y', H, 'Height*1']]));
    sec.appendChild(geoRow(dom, 4, 'LineTo', [['X', 0, 'Width*0'], ['Y', H, 'Height*1']]));
    sec.appendChild(geoRow(dom, 5, 'LineTo', [['X', 0, 'Width*0'], ['Y', 0, 'Height*0']]));
  }
  return sec;
}

function addShape(page, kind, cx, cy, W, H, text) {
  const dom = page.dom;
  const id = nextShapeId(page);
  const el = mkEl(dom, 'Shape', { ID: String(id), Type: 'Shape', LineStyle: '0', FillStyle: '0', TextStyle: '0' });
  const isText = kind === 'text';
  el.appendChild(cellEl(dom, 'PinX', fmtNum(cx)));
  el.appendChild(cellEl(dom, 'PinY', fmtNum(cy)));
  el.appendChild(cellEl(dom, 'Width', fmtNum(W)));
  el.appendChild(cellEl(dom, 'Height', fmtNum(H)));
  el.appendChild(cellEl(dom, 'LocPinX', fmtNum(W / 2), 'Width*0.5'));
  el.appendChild(cellEl(dom, 'LocPinY', fmtNum(H / 2), 'Height*0.5'));
  el.appendChild(cellEl(dom, 'Angle', 0));
  el.appendChild(cellEl(dom, 'LineWeight', isText ? 0 : 0.0139));
  el.appendChild(cellEl(dom, 'LineColor', '#333333'));
  el.appendChild(cellEl(dom, 'LinePattern', isText ? 0 : 1));
  el.appendChild(cellEl(dom, 'FillForegnd', '#FFFFFF'));
  el.appendChild(cellEl(dom, 'FillPattern', isText ? 0 : 1));
  if (kind === 'rounded') el.appendChild(cellEl(dom, 'Rounding', 0.12));
  el.appendChild(cellEl(dom, 'TxtPinX', fmtNum(W / 2), 'Width*0.5'));
  el.appendChild(cellEl(dom, 'TxtPinY', fmtNum(H / 2), 'Height*0.5'));
  el.appendChild(cellEl(dom, 'TxtWidth', fmtNum(W), 'Width*1'));
  el.appendChild(cellEl(dom, 'TxtHeight', fmtNum(H), 'Height*1'));
  const ch = mkEl(dom, 'Section', { N: 'Character', IX: '0' });
  const chr = mkEl(dom, 'Row', { IX: '0' });
  chr.appendChild(cellEl(dom, 'Size', 0.1389));
  chr.appendChild(cellEl(dom, 'Color', '#000000'));
  ch.appendChild(chr);
  el.appendChild(ch);
  el.appendChild(buildGeometrySection(dom, kind === 'rounded' || isText ? 'rect' : kind, W, H));
  if (text) { const t = mkEl(dom, 'Text'); t.appendChild(dom.createTextNode(text)); el.appendChild(t); }
  pageShapesEl(page).appendChild(el);
  return id;
}

/* ---------- silme / kopya / sıralama ---------- */
function removeConnectsFor(page, id) {
  const c = kid(page.dom.documentElement, 'Connects');
  if (!c) return;
  for (const x of kids(c, 'Connect')) {
    if (x.getAttribute('FromSheet') === id || x.getAttribute('ToSheet') === id) c.removeChild(x);
  }
}
function collectIds(el, out) {
  out.push(el.getAttribute('ID'));
  const sh = kid(el, 'Shapes');
  if (sh) for (const s of kids(sh, 'Shape')) collectIds(s, out);
  return out;
}
function deleteNode(page, node) {
  const ids = collectIds(node.el, []);
  for (const id of ids) removeConnectsFor(page, id);
  node.el.parentNode.removeChild(node.el);
}

function renumberShape(page, el, counter) {
  const map = new Map();
  const walk = (e) => {
    const old = e.getAttribute('ID');
    const nid = String(counter.n++);
    map.set(old, nid);
    e.setAttribute('ID', nid);
    const sh = kid(e, 'Shapes');
    if (sh) for (const s of kids(sh, 'Shape')) walk(s);
  };
  walk(el);
  return map;
}

function cloneNodes(page, nodes, dx, dy) {
  const counter = { n: nextShapeId(page) };
  const created = [];
  const parentEl = pageShapesEl(page);
  for (const n of nodes) {
    if (n.parent) continue; // yalnız üst düzey şekiller
    const copy = n.el.cloneNode(true);
    renumberShape(page, copy, counter);
    parentEl.appendChild(copy);
    setCell(copy, 'PinX', fmtNum(parseNum(findCell(copy, 'PinX')?.getAttribute('V'), n.pinX) + dx));
    setCell(copy, 'PinY', fmtNum(parseNum(findCell(copy, 'PinY')?.getAttribute('V'), n.pinY) + dy));
    created.push(copy.getAttribute('ID'));
  }
  return created;
}

function bringToFront(node) { const p = node.el.parentNode; p.appendChild(node.el); }
function sendToBack(node) { const p = node.el.parentNode; p.insertBefore(node.el, p.firstElementChild); }
function stepForward(node) { const n = node.el.nextElementSibling; if (n) node.el.parentNode.insertBefore(n, node.el); }
function stepBackward(node) { const p = node.el.previousElementSibling; if (p) node.el.parentNode.insertBefore(node.el, p); }

/* ---------- hizalama ---------- */
function alignNodes(nodes, mode) {
  if (nodes.length < 2) return;
  const bbs = nodes.map((n) => n.pageBBox());
  const xs0 = Math.min(...bbs.map((b) => b.x0)), xs1 = Math.max(...bbs.map((b) => b.x1));
  const ys0 = Math.min(...bbs.map((b) => b.y0)), ys1 = Math.max(...bbs.map((b) => b.y1));
  nodes.forEach((n, i) => {
    const b = bbs[i];
    let dx = 0, dy = 0;
    if (mode === 'left') dx = xs0 - b.x0;
    else if (mode === 'right') dx = xs1 - b.x1;
    else if (mode === 'center') dx = (xs0 + xs1) / 2 - (b.x0 + b.x1) / 2;
    else if (mode === 'bottom') dy = ys0 - b.y0;
    else if (mode === 'top') dy = ys1 - b.y1;
    else if (mode === 'middle') dy = (ys0 + ys1) / 2 - (b.y0 + b.y1) / 2;
    if (dx || dy) moveNode(n, dx, dy);
  });
}
function distributeNodes(nodes, axis) {
  if (nodes.length < 3) return;
  const items = nodes.map((n) => ({ n, b: n.pageBBox() }));
  const key0 = axis === 'h' ? 'x0' : 'y0', key1 = axis === 'h' ? 'x1' : 'y1';
  items.sort((a, b) => (a.b[key0] + a.b[key1]) - (b.b[key0] + b.b[key1]));
  const first = items[0].b, last = items[items.length - 1].b;
  const totalSize = items.reduce((s, it) => s + (it.b[key1] - it.b[key0]), 0);
  const span = last[key1] - first[key0];
  const gap = (span - totalSize) / (items.length - 1);
  let pos = first[key1] + gap;
  for (let i = 1; i < items.length - 1; i++) {
    const it = items[i];
    const d = pos - it.b[key0];
    if (axis === 'h') moveNode(it.n, d, 0); else moveNode(it.n, 0, d);
    pos += (it.b[key1] - it.b[key0]) + gap;
  }
}

/* ---------- bağlayıcılar ---------- */
function geometryPolys(node) {
  const g = buildGeometry(node, () => {});
  const polys = [];
  for (const gp of g) for (const p of gp.polys || []) if (p.pts.length >= 2) polys.push(p.pts);
  return polys;
}

function boundaryPoint(target, towardX, towardY) {
  const inv = mInv(target.M);
  const [tx, ty] = mApply(inv, towardX, towardY);
  const cx = target.w / 2, cy = target.h / 2;
  const polys = geometryPolys(target);
  let best = -1;
  const dx = tx - cx, dy = ty - cy;
  if (Math.hypot(dx, dy) < 1e-9) return mApply(target.M, cx, cy);
  const tryEdge = (ax, ay, bx, by) => {
    const ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return;
    const t = ((ax - cx) * ey - (ay - cy) * ex) / den;
    const u = ((ax - cx) * dy - (ay - cy) * dx) / den;
    if (t > 1e-9 && t <= 1.0000001 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
  };
  if (polys.length) {
    for (const pts of polys) for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      tryEdge(a[0], a[1], b[0], b[1]);
    }
  } else {
    const w = target.w, h = target.h;
    tryEdge(0, 0, w, 0); tryEdge(w, 0, w, h); tryEdge(w, h, 0, h); tryEdge(0, h, 0, 0);
  }
  if (best < 0) return mApply(target.M, cx, cy);
  return mApply(target.M, cx + dx * best, cy + dy * best);
}

function connectInfo(doc, page, id) {
  const info = { begin: null, end: null };
  for (const c of doc.getConnects(page)) {
    if (c.getAttribute('FromSheet') !== id) continue;
    const fc = c.getAttribute('FromCell');
    const which = fc === 'BeginX' || fc === 'BeginY' ? 'begin' : fc === 'EndX' || fc === 'EndY' ? 'end' : null;
    if (!which) continue;
    info[which] = { sheet: c.getAttribute('ToSheet'), cell: c.getAttribute('ToCell') || 'PinX', part: c.getAttribute('ToPart') };
  }
  return info;
}

function connectionSite(target, cellName) {
  const m = /^Connections\.X(\d+)$/.exec(cellName);
  if (!m) return null;
  const secs = target.sections('Connection');
  for (const [, sec] of secs) {
    const row = sec.rows.get(String(parseInt(m[1], 10) - 1));
    if (row) {
      const x = target.entryNum(row.cells.get('X'), NaN), y = target.entryNum(row.cells.get('Y'), NaN);
      if (Number.isFinite(x) && Number.isFinite(y)) return mApply(target.M, x, y);
    }
  }
  return null;
}

function connectorCurrentEnds(node) {
  const bx = node.num('BeginX', NaN), by = node.num('BeginY', NaN), ex = node.num('EndX', NaN), ey = node.num('EndY', NaN);
  const pm = node.parentM || M_ID;
  const b = Number.isFinite(bx) ? mApply(pm, bx, by) : mApply(node.M, 0, node.h / 2);
  const e = Number.isFinite(ex) ? mApply(pm, ex, ey) : mApply(node.M, node.w, node.h / 2);
  return { b, e };
}

function simplifyRoute(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) out.splice(i, 1);
  }
  return out;
}

function connectorIsElbow(node) {
  const secs = node.sections('Geometry');
  let n = 0;
  for (const [, sec] of secs) n += sec.rows.size;
  return n > 2;
}

/* Bağlayıcıyı uç noktalarına göre yeniden çiz */
function rerouteConnector(doc, page, conn, forceElbow) {
  const info = connectInfo(doc, page, conn.id);
  if (!info.begin && !info.end) return false;
  const cur = connectorCurrentEnds(conn);
  const tb = info.begin ? page.nodeMap.get(info.begin.sheet) : null;
  const te = info.end ? page.nodeMap.get(info.end.sheet) : null;
  let b = cur.b, e = cur.e;
  const site = (t, inf) => (t && /^Connections\./.test(inf.cell) ? connectionSite(t, inf.cell) : null);
  const sb = site(tb, info.begin || {}), se = site(te, info.end || {});
  if (sb) b = sb;
  if (se) e = se;
  const centerOf = (t) => mApply(t.M, t.w / 2, t.h / 2);
  if (tb && !sb) { const toward = se || (te ? centerOf(te) : cur.e); b = boundaryPoint(tb, toward[0], toward[1]); }
  if (te && !se) { const toward = sb || (tb ? centerOf(tb) : cur.b); e = boundaryPoint(te, toward[0], toward[1]); }
  const elbow = forceElbow !== undefined ? forceElbow : connectorIsElbow(conn);
  let route = [b, e];
  if (elbow) {
    const dx = e[0] - b[0], dy = e[1] - b[1];
    if (Math.abs(dx) >= Math.abs(dy)) { const mx = (b[0] + e[0]) / 2; route = [b, [mx, b[1]], [mx, e[1]], e]; }
    else { const my = (b[1] + e[1]) / 2; route = [b, [b[0], my], [e[0], my], e]; }
    route = simplifyRoute(route);
  }
  writeConnector(conn, route);
  return true;
}

function writeConnector(conn, route) {
  const el = conn.el;
  const dom = el.ownerDocument;
  const pm = conn.parentM || M_ID;
  const ip = mInv(pm);
  const loc = route.map((p) => mApply(ip, p[0], p[1])); // üst yerel koordinat
  const b = loc[0], e = loc[loc.length - 1];
  const ang = Math.atan2(e[1] - b[1], e[0] - b[0]);
  const len = Math.hypot(e[0] - b[0], e[1] - b[1]);
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  const pts = loc.map((p) => [(p[0] - b[0]) * ca - (p[1] - b[1]) * sa, (p[0] - b[0]) * sa + (p[1] - b[1]) * ca]);
  const hmax = Math.max(0, ...pts.map((p) => Math.abs(p[1])));
  setCell(el, 'BeginX', fmtNum(b[0])); setCell(el, 'BeginY', fmtNum(b[1]));
  setCell(el, 'EndX', fmtNum(e[0])); setCell(el, 'EndY', fmtNum(e[1]));
  setCell(el, 'PinX', fmtNum(b[0])); setCell(el, 'PinY', fmtNum(b[1]));
  setCell(el, 'Angle', fmtNum(ang));
  setCell(el, 'Width', fmtNum(len));
  setCell(el, 'Height', fmtNum(hmax));
  setCell(el, 'LocPinX', 0); setCell(el, 'LocPinY', 0);
  // geometri: yerel bölümleri kaldır, master mirasını sil bayrağıyla kapat
  for (const s of kids(el, 'Section')) if (s.getAttribute('N') === 'Geometry') el.removeChild(s);
  let ix = 0;
  const inherited = conn.ms ? kids(conn.ms, 'Section').filter((s) => s.getAttribute('N') === 'Geometry') : [];
  for (const s of inherited) {
    const sx = parseInt(s.getAttribute('IX') || '0', 10);
    const del = mkEl(dom, 'Section', { N: 'Geometry', IX: String(sx), Del: '1' });
    insertInOrder(el, del, 1);
    ix = Math.max(ix, sx + 1);
  }
  const sec = mkEl(dom, 'Section', { N: 'Geometry', IX: String(ix) });
  sec.appendChild(cellEl(dom, 'NoFill', 1));
  sec.appendChild(cellEl(dom, 'NoLine', 0));
  pts.forEach((p, i) => sec.appendChild(geoRow(dom, i + 1, i === 0 ? 'MoveTo' : 'LineTo', [['X', p[0]], ['Y', p[1]]])));
  insertInOrder(el, sec, 1);
}

function rerouteAllConnectors(doc, page) {
  // ağacı yeniden kurmadan: yalnız bağlayıcı şekilleri
  doc.buildTree(page);
  const done = [];
  for (const c of doc.getConnects(page)) {
    const id = c.getAttribute('FromSheet');
    if (done.includes(id)) continue;
    done.push(id);
    const node = page.nodeMap.get(id);
    if (node) rerouteConnector(doc, page, node);
  }
  doc.buildTree(page);
}

function addConnector(doc, page, fromId, toId, elbow) {
  doc.buildTree(page);
  const a = page.nodeMap.get(fromId), b = page.nodeMap.get(toId);
  if (!a || !b || a === b) return null;
  const dom = page.dom;
  const id = nextShapeId(page);
  const el = mkEl(dom, 'Shape', { ID: String(id), Type: 'Shape', LineStyle: '0', FillStyle: '0', TextStyle: '0' });
  const ca = mApply(a.M, a.w / 2, a.h / 2), cb = mApply(b.M, b.w / 2, b.h / 2);
  for (const [n, v] of [['PinX', ca[0]], ['PinY', ca[1]], ['Width', 1], ['Height', 0], ['LocPinX', 0], ['LocPinY', 0], ['Angle', 0],
    ['BeginX', ca[0]], ['BeginY', ca[1]], ['EndX', cb[0]], ['EndY', cb[1]],
    ['LineWeight', 0.0139], ['LineColor', '#333333'], ['LinePattern', 1], ['EndArrow', 13], ['EndArrowSize', 2], ['FillPattern', 0], ['OneD', 1]]) {
    el.appendChild(cellEl(dom, n, typeof v === 'number' ? fmtNum(v) : v));
  }
  el.appendChild(cellEl(dom, 'ObjType', 2));
  const sec = mkEl(dom, 'Section', { N: 'Geometry', IX: '0' });
  sec.appendChild(cellEl(dom, 'NoFill', 1));
  sec.appendChild(cellEl(dom, 'NoLine', 0));
  sec.appendChild(geoRow(dom, 1, 'MoveTo', [['X', 0], ['Y', 0]]));
  sec.appendChild(geoRow(dom, 2, 'LineTo', [['X', 1], ['Y', 0]]));
  el.appendChild(sec);
  pageShapesEl(page).appendChild(el);
  const cs = pageConnectsEl(page);
  cs.appendChild(mkEl(dom, 'Connect', { FromSheet: String(id), FromCell: 'BeginX', FromPart: '9', ToSheet: fromId, ToCell: 'PinX', ToPart: '3' }));
  cs.appendChild(mkEl(dom, 'Connect', { FromSheet: String(id), FromCell: 'EndX', FromPart: '12', ToSheet: toId, ToCell: 'PinX', ToPart: '3' }));
  doc.buildTree(page);
  const node = page.nodeMap.get(String(id));
  rerouteConnector(doc, page, node, !!elbow);
  doc.buildTree(page);
  return String(id);
}

/* Yalnızca verilen şekillere bağlı bağlayıcıları yeniden çiz.
   fast=true: ağacı yeniden kurmaz (düğümler yerinde güncellenir); yeniden çizilen bağlayıcı kimliklerini döndürür. */
function rerouteConnectorsFor(doc, page, ids, fast) {
  if (!fast) doc.buildTree(page);
  const moved = new Set();
  const collect = (n) => { moved.add(n.id); n.children.forEach(collect); };
  for (const id of ids) { const n = page.nodeMap.get(id); if (n) collect(n); }
  const done = new Set();
  const out = [];
  for (const c of doc.getConnects(page)) {
    if (!moved.has(c.getAttribute('ToSheet'))) continue;
    const fid = c.getAttribute('FromSheet');
    if (done.has(fid) || moved.has(fid)) continue;
    done.add(fid);
    const cn = page.nodeMap.get(fid);
    if (cn && rerouteConnector(doc, page, cn)) {
      if (fast) recomputeNode(cn);
      out.push(fid);
    }
  }
  if (!fast) doc.buildTree(page);
  return out;
}

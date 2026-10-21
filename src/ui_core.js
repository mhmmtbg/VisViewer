/* Uygulama durumu, görünüm (yakınlaştırma/kaydırma), seçim katmanı ve etkileşimler */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

const App = {
  doc: null, page: null, pageIdx: 0,
  sel: [],                 // seçili şekil kimlikleri (aynı sayfa)
  tool: 'select',
  view: { x: 40, y: 40, z: 1 },
  snap: true, grid: true, units: 'mm',
  hiddenLayers: new Set(),
  fileHandle: null, dirty: false,
  space: false, hover: null,
  clip: null,
  minimap: true,
};

const UNIT_INFO = { in: { f: 1, d: 3, s: 'in' }, mm: { f: 25.4, d: 1, s: 'mm' }, cm: { f: 2.54, d: 2, s: 'cm' } };
const toUnit = (inch) => inch * UNIT_INFO[App.units].f;
const fromUnit = (v) => v / UNIT_INFO[App.units].f;
const fmtU = (inch) => toUnit(inch).toFixed(UNIT_INFO[App.units].d);
function gridSize() { return App.units === 'in' ? 0.25 : 5 / 25.4; }

function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + (kind || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, kind === 'error' ? 7000 : 2800);
}

/* ---------- görünüm ---------- */
function stageRect() { return $('#stage').getBoundingClientRect(); }

function pageToScreen(x, y) {
  const z = App.view.z * 96;
  return [App.view.x + x * z, App.view.y + (App.page.h - y) * z];
}
function screenToPage(sx, sy) {
  const z = App.view.z * 96;
  return [(sx - App.view.x) / z, App.page.h - (sy - App.view.y) / z];
}
function eventPage(e) {
  const r = stageRect();
  return screenToPage(e.clientX - r.left, e.clientY - r.top);
}

function applyView() {
  const vp = $('#vp');
  if (vp) vp.setAttribute('transform', `translate(${App.view.x} ${App.view.y}) scale(${App.view.z})`);
  const g = $('#gridRect');
  if (g) g.style.display = App.grid && App.view.z * gridSize() * 96 > 6 ? '' : 'none';
  $('#zoomLabel').textContent = Math.round(App.view.z * 100) + '%';
  drawOverlay();
  updateMinimapViewport();
}

function zoomAt(newZ, sx, sy) {
  newZ = Math.max(0.03, Math.min(16, newZ));
  const [px, py] = screenToPage(sx, sy);
  App.view.z = newZ;
  const z = newZ * 96;
  App.view.x = sx - px * z;
  App.view.y = sy - (App.page.h - py) * z;
  applyView();
}
function zoomCenter(factor) {
  const r = stageRect();
  zoomAt(App.view.z * factor, r.width / 2, r.height / 2);
}
function fitPage(bboxInches) {
  if (!App.page) return;
  const r = stageRect();
  const b = bboxInches || { x0: 0, y0: 0, x1: App.page.w, y1: App.page.h };
  const w = (b.x1 - b.x0) * 96, h = (b.y1 - b.y0) * 96;
  const margin = 48;
  const z = Math.min((r.width - margin * 2) / Math.max(w, 1), (r.height - margin * 2) / Math.max(h, 1), 8);
  App.view.z = Math.max(0.03, z);
  const zz = App.view.z * 96;
  App.view.x = (r.width - w * App.view.z) / 2 - b.x0 * zz;
  App.view.y = (r.height - h * App.view.z) / 2 - (App.page.h - b.y1) * zz;
  applyView();
}

/* ---------- sayfa çerçevesi + içerik ---------- */
function setupFrame() {
  const svg = $('#pageSvg');
  const p = App.page;
  const W = p.w * 96, H = p.h * 96;
  const gs = gridSize() * 96;
  svg.innerHTML = '';
  const defs = S('defs', null, [
    S('pattern', { id: 'gridPat', width: f4(gs), height: f4(gs), patternUnits: 'userSpaceOnUse' }, [
      S('path', { d: `M${f4(gs)} 0H0V${f4(gs)}`, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
    ]),
  ]);
  const vp = S('g', { id: 'vp' }, [
    S('rect', { id: 'pageRect', x: 0, y: 0, width: f4(W), height: f4(H), fill: '#ffffff', stroke: 'var(--page-edge)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
    S('rect', { id: 'gridRect', x: 0, y: 0, width: f4(W), height: f4(H), fill: 'url(#gridPat)', 'pointer-events': 'none' }),
    S('g', { id: 'flip', transform: `translate(0 ${f4(H)}) scale(96 -96)` }),
  ]);
  svg.append(defs, vp);
}

function renderPage() {
  if (!App.doc || !App.page) return;
  const { g, defs } = renderPageContent(App.doc, App.page, { hiddenLayers: App.hiddenLayers });
  const flip = $('#flip');
  flip.replaceChildren(defs, g);
  // seçimde artık var olmayan kimlikleri ayıkla
  App.sel = App.sel.filter((id) => App.page.nodeMap.has(id));
  applyView();
  scheduleMinimap();
}

function refreshAll() {
  renderPage();
  renderInspector();
  renderShapeTree();
  updateStatus();
  updateUndoButtons();
}

/* ---------- seçim ---------- */
function selNodes() { return App.sel.map((id) => App.page.nodeMap.get(id)).filter(Boolean); }
function selectIds(ids, additive) {
  App.sel = additive ? [...new Set([...App.sel, ...ids])] : ids.slice();
  drawOverlay();
  renderInspector();
  highlightTree();
  updateStatus();
}
function topAncestor(node) { let n = node; while (n.parent) n = n.parent; return n; }

/* ---------- seçim katmanı (ekran pikseli) ---------- */
const HANDLES = [
  [0, 1], [0.5, 1], [1, 1], [1, 0.5], [1, 0], [0.5, 0], [0, 0], [0, 0.5],
];

function overlayEl() { return $('#overlay'); }

function drawOverlay() {
  const ov = overlayEl();
  if (!ov) return;
  ov.replaceChildren();
  if (!App.doc || !App.page || !App.page.nodeMap) return;
  const add = (el) => ov.appendChild(el);
  // fare üzerindeki şekil
  if (App.hover && !App.sel.includes(App.hover) && !drag) {
    const hn = App.page.nodeMap.get(App.hover);
    if (hn) add(S('path', { d: outlinePath(hn), class: 'hov' }));
  }
  const nodes = selNodes();
  if (!nodes.length) return;
  for (const n of nodes) add(S('path', { d: outlinePath(n), class: 'sel' }));
  if (nodes.length === 1 && !drag?.hideHandles) {
    const n = nodes[0];
    if (n.oneD && !connectorHandlesWanted(n)) return;
    const cs = HANDLES.map(([hx, hy]) => ({ hx, hy, p: pageToScreen(...mApply(n.M, hx * n.w, hy * n.h)) }));
    // döndürme tutamacı
    const top = pageToScreen(...mApply(n.M, n.w / 2, n.h));
    const c = pageToScreen(...mApply(n.M, n.w / 2, n.h / 2));
    const vx = top[0] - c[0], vy = top[1] - c[1];
    const vl = Math.hypot(vx, vy) || 1;
    const rp = [top[0] + vx / vl * 26, top[1] + vy / vl * 26];
    add(S('line', { x1: top[0], y1: top[1], x2: rp[0], y2: rp[1], class: 'rotline' }));
    add(S('circle', { cx: rp[0], cy: rp[1], r: 5.5, class: 'handle rot', 'data-handle': 'rot' }));
    for (const h of cs) {
      add(S('rect', { x: h.p[0] - 4.5, y: h.p[1] - 4.5, width: 9, height: 9, class: 'handle', 'data-handle': `${h.hx},${h.hy}`, style: `cursor:${handleCursor(h.hx, h.hy, n)}` }));
    }
  } else if (nodes.length > 1) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of nodes) { const b = n.pageBBox(); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    const a = pageToScreen(x0, y1), b = pageToScreen(x1, y0);
    add(S('rect', { x: a[0], y: a[1], width: b[0] - a[0], height: b[1] - a[1], class: 'multi' }));
  }
}

function connectorHandlesWanted() { return false; }

function handleCursor(hx, hy, n) {
  const names = ['nesw-resize', 'ns-resize', 'nwse-resize', 'ew-resize'];
  if (hx === 0.5) return 'ns-resize';
  if (hy === 0.5) return 'ew-resize';
  return (hx === hy) ? 'nesw-resize' : 'nwse-resize';
}

function outlinePath(n) {
  const pts = [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]].map(([x, y]) => pageToScreen(...mApply(n.M, x, y)));
  if (n.oneD && n.h < 0.02) {
    // çizgi/bağlayıcı: yol boyunca
    return 'M' + pts[0][0] + ' ' + pts[0][1] + 'L' + pts[1][0] + ' ' + pts[1][1];
  }
  return 'M' + pts.map((p) => p[0] + ' ' + p[1]).join('L') + 'Z';
}

/* ---------- etkileşim ---------- */
let drag = null;
let rafPending = false;
function requestRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderPage(); drawOverlay(); renderInspectorValues(); });
}

/* Yalnızca değişen üst düzey şekilleri yeniden çiz (büyük sayfalarda hızlı) */
let partialIds = new Set();
let partialPending = false;
function requestPartial(ids) {
  for (const id of ids) partialIds.add(id);
  if (partialPending) return;
  partialPending = true;
  requestAnimationFrame(() => {
    partialPending = false;
    const list = [...partialIds];
    partialIds = new Set();
    rerenderNodes(list);
  });
}
function rerenderNodes(ids) {
  const page = App.page;
  if (!page || !page.renderCtx) { renderPage(); return; }
  const tops = new Set();
  for (const id of ids) { const n = page.nodeMap.get(id); if (n) tops.add(topAncestor(n)); }
  for (const t of tops) {
    const old = document.querySelector(`#flip .fg-page > [data-sid="${t.id}"]`);
    const tmp = S('g');
    renderNode(page.renderCtx, t, tmp);
    const nw = tmp.firstChild;
    if (old && nw) old.replaceWith(nw); else if (old) old.remove();
  }
  drawOverlay();
  renderInspectorValues();
  scheduleMinimap();
}

function hitChain(target) {
  const chain = [];
  let g = target.closest ? target.closest('#flip [data-sid]') : null;
  while (g) {
    chain.push(g.getAttribute('data-sid'));
    g = g.parentElement ? g.parentElement.closest('[data-sid]') : null;
  }
  return chain; // [en iç ... en dış]
}

function startEditHistory() {
  if (drag && !drag.historyDone) { History.push(App.doc, App.page); drag.historyDone = true; }
}
function markChanged() {
  App.doc.markDirty(App.page);
  App.dirty = true;
  updateTitle();
}

function onStagePointerDown(e) {
  if (!App.doc || e.target.closest('.floating, #dropzone')) return;
  const r = stageRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const stage = $('#stage');
  if (App.space || e.button === 1 || App.tool === 'hand') {
    stage.setPointerCapture(e.pointerId);
    drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: App.view.x, vy: App.view.y };
    stage.classList.add('panning');
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  stage.setPointerCapture(e.pointerId);
  const p = eventPage(e);
  const handleEl = e.target.closest ? e.target.closest('[data-handle]') : null;
  const tool = App.tool;

  if (tool === 'select' && handleEl) {
    const n = selNodes()[0];
    if (!n) return;
    const hv = handleEl.getAttribute('data-handle');
    if (hv === 'rot') {
      const c = mApply(n.M, n.w / 2, n.h / 2);
      drag = { type: 'rotate', id: n.id, center: c, a0: Math.atan2(p[1] - c[1], p[0] - c[0]), ang0: n.angle };
    } else {
      const [hx, hy] = hv.split(',').map(Number);
      drag = { type: 'resize', id: n.id, hx, hy, M0: n.M.slice(), w0: n.w, h0: n.h };
    }
    return;
  }

  if (tool === 'select') {
    const chain = hitChain(e.target);
    if (chain.length) {
      const inner = e.altKey || e.ctrlKey || e.metaKey;
      const id = inner ? chain[0] : chain[chain.length - 1];
      if (e.shiftKey) {
        App.sel = App.sel.includes(id) ? App.sel.filter((x) => x !== id) : [...App.sel, id];
        selectIds(App.sel);
      } else if (!App.sel.includes(id)) selectIds([id]);
      const nodes = selNodes();
      drag = {
        type: 'move', start: p, moved: false,
        items: nodes.map((n) => ({ id: n.id, pinX: n.pinX, pinY: n.pinY, lin: mInv(parentLinear(n)) })),
      };
    } else {
      if (!e.shiftKey) selectIds([]);
      drag = { type: 'marquee', start: p, sx, sy, base: e.shiftKey ? App.sel.slice() : [] };
    }
    return;
  }

  if (tool === 'conn' || tool === 'elbow') {
    const chain = hitChain(e.target);
    if (chain.length) {
      const fromId = chain[chain.length - 1];
      drag = { type: 'connect', from: fromId, elbow: tool === 'elbow', sx, sy, to: null };
    }
    return;
  }

  // çizim araçları
  drag = { type: 'draw', kind: tool, start: p, sx, sy, cur: p };
}

function onStagePointerMove(e) {
  if (!App.doc || !App.page) return;
  const r = stageRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (!drag) {
    // fare üstü vurgu + koordinat
    const [px, py] = screenToPage(sx, sy);
    $('#coords').textContent = `X ${fmtU(px)}  Y ${fmtU(py)} ${UNIT_INFO[App.units].s}`;
    if (App.tool === 'select') {
      const chain = hitChain(e.target);
      const id = chain.length ? chain[chain.length - 1] : null;
      if (id !== App.hover) { App.hover = id; drawOverlay(); }
    }
    return;
  }
  const p = screenToPage(sx, sy);
  if (drag.type === 'pan') {
    App.view.x = drag.vx + (e.clientX - drag.sx);
    App.view.y = drag.vy + (e.clientY - drag.sy);
    applyView();
    return;
  }
  if (drag.type === 'move') {
    let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
    if (!drag.moved && Math.hypot(dx, dy) * 96 * App.view.z < 3) return;
    if (!drag.moved) { drag.moved = true; startEditHistory(); }
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if (App.snap && drag.items.length) {
      // ilk öğenin merkezini ızgaraya oturt
      const first = App.page.nodeMap.get(drag.items[0].id);
      const c0 = mApply(first.M, first.w / 2, first.h / 2);
      // orijinal merkez = şu anki merkez - uygulanmış delta
      const applied = drag.applied || [0, 0];
      const ox = c0[0] - applied[0], oy = c0[1] - applied[1];
      const g = gridSize();
      dx = Math.round((ox + dx) / g) * g - ox;
      dy = Math.round((oy + dy) / g) * g - oy;
    }
    drag.applied = [dx, dy];
    for (const it of drag.items) {
      const n = App.page.nodeMap.get(it.id);
      if (!n) continue;
      const [lx, ly] = mApply(it.lin, dx, dy);
      setCell(n.el, 'PinX', fmtNum(it.pinX + lx));
      setCell(n.el, 'PinY', fmtNum(it.pinY + ly));
      recomputeNode(n);
    }
    const ids = drag.items.map((it) => it.id);
    const conns = rerouteConnectorsFor(App.doc, App.page, ids, true);
    markChanged();
    requestPartial([...ids, ...conns]);
    return;
  }
  if (drag.type === 'resize') {
    const n = App.page.nodeMap.get(drag.id);
    if (!n) return;
    startEditHistory();
    const inv = mInv(drag.M0);
    let [lx, ly] = mApply(inv, p[0], p[1]);
    const ax = 1 - drag.hx, ay = 1 - drag.hy;
    let w = drag.hx === 0.5 ? drag.w0 : (drag.hx === 1 ? lx - ax * drag.w0 : ax * drag.w0 - lx);
    let h = drag.hy === 0.5 ? drag.h0 : (drag.hy === 1 ? ly - ay * drag.h0 : ay * drag.h0 - ly);
    if (e.shiftKey && drag.hx !== 0.5 && drag.hy !== 0.5) {
      const k = Math.max(w / drag.w0, h / drag.h0);
      w = drag.w0 * k; h = drag.h0 * k;
    }
    if (App.snap) { const g = gridSize() / 2; if (drag.hx !== 0.5) w = Math.max(g, Math.round(w / g) * g); if (drag.hy !== 0.5) h = Math.max(g, Math.round(h / g) * g); }
    w = Math.max(w, 0.03); h = Math.max(h, 0.03);
    resizeKeepAnchor(n, w, h, ax, ay);
    const conns = rerouteConnectorsFor(App.doc, App.page, [n.id], true);
    markChanged();
    requestPartial([n.id, ...conns]);
    return;
  }
  if (drag.type === 'rotate') {
    const n = App.page.nodeMap.get(drag.id);
    if (!n) return;
    startEditHistory();
    const a = Math.atan2(p[1] - drag.center[1], p[0] - drag.center[0]);
    let ang = drag.ang0 + (a - drag.a0);
    if (e.shiftKey) { const step = Math.PI / 12; ang = Math.round(ang / step) * step; }
    setNodeAngle(n, ang);
    recomputeNode(n);
    const conns = rerouteConnectorsFor(App.doc, App.page, [n.id], true);
    markChanged();
    requestPartial([n.id, ...conns]);
    return;
  }
  if (drag.type === 'marquee') {
    drag.cur = [sx, sy];
    const ov = overlayEl();
    drawOverlay();
    ov.appendChild(S('rect', { x: Math.min(drag.sx, sx), y: Math.min(drag.sy, sy), width: Math.abs(sx - drag.sx), height: Math.abs(sy - drag.sy), class: 'marquee' }));
    return;
  }
  if (drag.type === 'draw') {
    drag.cur = p;
    drawOverlay();
    const a = pageToScreen(...drag.start), b = pageToScreen(...p);
    overlayEl().appendChild(S(drag.kind === 'ellipse' ? 'ellipse' : 'rect', drag.kind === 'ellipse'
      ? { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: Math.abs(b[0] - a[0]) / 2, ry: Math.abs(b[1] - a[1]) / 2, class: 'ghost' }
      : { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), class: 'ghost' }));
    return;
  }
  if (drag.type === 'connect') {
    const chain = hitChain(document.elementFromPoint(e.clientX, e.clientY) || e.target);
    drag.to = chain.length ? chain[chain.length - 1] : null;
    drawOverlay();
    const a = App.page.nodeMap.get(drag.from);
    const ca = a ? pageToScreen(...mApply(a.M, a.w / 2, a.h / 2)) : [sx, sy];
    const ov = overlayEl();
    ov.appendChild(S('line', { x1: ca[0], y1: ca[1], x2: sx, y2: sy, class: 'ghost' }));
    if (drag.to && drag.to !== drag.from) ov.appendChild(S('path', { d: outlinePath(App.page.nodeMap.get(drag.to)), class: 'sel' }));
    return;
  }
}

function onStagePointerUp(e) {
  const stage = $('#stage');
  try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  stage.classList.remove('panning');
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.type === 'move' || d.type === 'resize' || d.type === 'rotate') {
    if (d.historyDone) {
      App.doc.buildTree(App.page);   // düğümleri DOM'dan tazele
      drawOverlay(); renderInspector(); updateStatus(); updateUndoButtons(); scheduleMinimap();
    }
    return;
  }
  if (d.type === 'marquee') {
    const r = stageRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const a = screenToPage(Math.min(d.sx, sx), Math.max(d.sy, sy)), b = screenToPage(Math.max(d.sx, sx), Math.min(d.sy, sy));
    if (Math.abs(sx - d.sx) > 3 || Math.abs(sy - d.sy) > 3) {
      const ids = App.page.tree.filter((n) => { const bb = n.pageBBox(); return bb.x0 >= a[0] && bb.x1 <= b[0] && bb.y0 >= a[1] && bb.y1 <= b[1]; }).map((n) => n.id);
      selectIds([...new Set([...d.base, ...ids])]);
    }
    drawOverlay();
    return;
  }
  if (d.type === 'draw') {
    const kind = d.kind;
    const dist = Math.hypot(d.cur[0] - d.start[0], d.cur[1] - d.start[1]) * 96 * App.view.z;
    let x0, y0, x1, y1;
    if (dist < 6) {
      const w = kind === 'text' ? 1.6 : 1.5, h = kind === 'text' ? 0.4 : (kind === 'diamond' ? 1.1 : 1.0);
      x0 = d.start[0] - w / 2; x1 = d.start[0] + w / 2; y0 = d.start[1] - h / 2; y1 = d.start[1] + h / 2;
    } else {
      x0 = Math.min(d.start[0], d.cur[0]); x1 = Math.max(d.start[0], d.cur[0]);
      y0 = Math.min(d.start[1], d.cur[1]); y1 = Math.max(d.start[1], d.cur[1]);
    }
    if (App.snap) { const g = gridSize(); x0 = Math.round(x0 / g) * g; x1 = Math.max(x0 + g, Math.round(x1 / g) * g); y0 = Math.round(y0 / g) * g; y1 = Math.max(y0 + g, Math.round(y1 / g) * g); }
    History.push(App.doc, App.page);
    const id = addShape(App.page, kind, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, '');
    markChanged();
    App.doc.buildTree(App.page);
    App.sel = [String(id)];
    setTool('select');
    refreshAll();
    drawOverlay();
    startTextEdit(String(id));
    return;
  }
  if (d.type === 'connect') {
    drawOverlay();
    const upChain = hitChain(document.elementFromPoint(e.clientX, e.clientY) || e.target);
    if (upChain.length) d.to = upChain[upChain.length - 1];
    if (d.to && d.to !== d.from) {
      History.push(App.doc, App.page);
      const id = addConnector(App.doc, App.page, d.from, d.to, d.elbow);
      markChanged();
      App.sel = id ? [id] : [];
      refreshAll();
    }
    return;
  }
}

function onStageDblClick(e) {
  if (!App.doc || App.tool !== 'select') return;
  if (e.target.closest('.floating')) return;
  const chain = hitChain(document.elementFromPoint(e.clientX, e.clientY) || e.target);
  if (!chain.length) return;
  const id = chain[0];
  selectIds([id]);
  startTextEdit(id);
}

function onStageWheel(e) {
  if (!App.doc) return;
  e.preventDefault();
  const r = stageRect();
  if (e.ctrlKey || e.metaKey) {
    const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
    zoomAt(App.view.z * f, e.clientX - r.left, e.clientY - r.top);
  } else {
    const k = e.deltaMode === 1 ? 24 : 1;
    if (e.shiftKey) App.view.x -= (e.deltaY || e.deltaX) * k; else { App.view.x -= e.deltaX * k; App.view.y -= e.deltaY * k; }
    applyView();
  }
}

/* ---------- metin düzenleme ---------- */
let textEditor = null;
function startTextEdit(id) {
  const n = App.page.nodeMap.get(id);
  if (!n) return;
  endTextEdit(true);
  const b = n.pageBBox();
  const a = pageToScreen(b.x0, b.y1), c = pageToScreen(b.x1, b.y0);
  const ta = document.createElement('textarea');
  ta.id = 'textEditor';
  const w = Math.max(c[0] - a[0], 90), h = Math.max(c[1] - a[1], 28);
  const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
  Object.assign(ta.style, { left: (cx - w / 2) + 'px', top: (cy - h / 2) + 'px', width: w + 'px', height: h + 'px' });
  const cp = charProps(n);
  ta.style.fontSize = Math.max(11, cp.size * 96 * App.view.z) + 'px';
  ta.style.fontFamily = cp.family;
  ta.value = n.text();
  $('#stage').appendChild(ta);
  ta.focus(); ta.select();
  textEditor = { ta, id, orig: ta.value };
  ta.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { endTextEdit(false); }
    else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { endTextEdit(true); }
  });
  ta.addEventListener('blur', () => endTextEdit(true));
}
function endTextEdit(commit) {
  if (!textEditor) return;
  const { ta, id, orig } = textEditor;
  textEditor = null;
  const val = ta.value;
  ta.remove();
  if (commit && val !== orig && App.page.nodeMap.has(id)) {
    History.push(App.doc, App.page);
    setNodeText(App.page.nodeMap.get(id), val);
    markChanged();
    refreshAll();
  }
}

/* ---------- araçlar ---------- */
function setTool(t) {
  App.tool = t;
  $$('#toolbar [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  const cur = { select: 'default', hand: 'grab', rect: 'crosshair', rounded: 'crosshair', ellipse: 'crosshair', diamond: 'crosshair', text: 'text', conn: 'crosshair', elbow: 'crosshair' }[t] || 'default';
  $('#stage').style.cursor = cur;
}

/* ---------- düzenleme komutları ---------- */
function editSelected(fn, opts) {
  const nodes = selNodes();
  if (!nodes.length) return;
  History.push(App.doc, App.page);
  const ids = nodes.map((n) => n.id);
  fn(nodes);
  markChanged();
  if (opts && opts.partial) {
    for (const n of nodes) recomputeNode(n);
    const conns = opts.reroute ? rerouteConnectorsFor(App.doc, App.page, ids, true) : [];
    rerenderNodes([...ids, ...conns]);
    updateUndoButtons(); updateStatus();
    return;
  }
  if (opts && opts.reroute) rerouteConnectorsFor(App.doc, App.page, ids);
  App.doc.buildTree(App.page);
  refreshAll();
}

function deleteSelection() {
  const nodes = selNodes();
  if (!nodes.length) return;
  History.push(App.doc, App.page);
  for (const n of nodes) if (n.el.parentNode) deleteNode(App.page, n);
  markChanged();
  App.sel = [];
  App.doc.buildTree(App.page);
  refreshAll();
}

function copySelection(cut) {
  const nodes = selNodes().filter((n) => !n.parent);
  if (!nodes.length) return;
  const ser = new XMLSerializer();
  App.clip = { docName: App.doc.name, docRef: App.doc, xml: nodes.map((n) => ser.serializeToString(n.el)) };
  toast(nodes.length + ' şekil kopyalandı');
  if (cut) deleteSelection();
}
function pasteClipboard(offset) {
  if (!App.clip) return;
  History.push(App.doc, App.page);
  const counter = { n: nextShapeId(App.page) };
  const parent = pageShapesEl(App.page);
  const ids = [];
  const off = offset === undefined ? 0.25 : offset;
  let warned = false;
  for (const xml of App.clip.xml) {
    const dom = new DOMParser().parseFromString(`<Shapes xmlns="${NS_V}">${xml.replace(/ xmlns="[^"]*"/g, '')}</Shapes>`, 'application/xml');
    const el = App.page.dom.importNode(dom.documentElement.firstElementChild, true);
    if (App.clip.docRef !== App.doc && el.getAttribute('Master') && !warned) { warned = true; toast('Başka belgeden yapıştırılan master tabanlı şekiller sadeleşebilir.', 'warn'); }
    renumberShape(App.page, el, counter);
    parent.appendChild(el);
    const px = parseNum(findCell(el, 'PinX')?.getAttribute('V'), 0), py = parseNum(findCell(el, 'PinY')?.getAttribute('V'), 0);
    setCell(el, 'PinX', fmtNum(px + off)); setCell(el, 'PinY', fmtNum(py - off));
    ids.push(el.getAttribute('ID'));
  }
  markChanged();
  App.doc.buildTree(App.page);
  App.sel = ids;
  refreshAll();
  App.clip.xml = App.clip.xml; // aynı kopya art arda yapıştırılabilir
}
function duplicateSelection() {
  const nodes = selNodes().filter((n) => !n.parent);
  if (!nodes.length) return;
  History.push(App.doc, App.page);
  const ids = cloneNodes(App.page, nodes, 0.25, -0.25);
  markChanged();
  App.doc.buildTree(App.page);
  App.sel = ids;
  refreshAll();
}

function doUndo(redo) {
  const s = redo ? History.doRedo() : History.doUndo();
  if (!s) return;
  if (s.page !== App.page) { App.page = s.page; App.pageIdx = App.doc.pages.indexOf(s.page); setupFrame(); renderPageList(); }
  App.doc.buildTree(App.page);
  App.dirty = true; updateTitle();
  refreshAll();
}
function updateUndoButtons() {
  const u = $('#btnUndo'), r = $('#btnRedo');
  if (u) u.disabled = !History.undo.length;
  if (r) r.disabled = !History.redo.length;
}

function nudge(dx, dy) {
  const nodes = selNodes();
  if (!nodes.length) return;
  History.push(App.doc, App.page);
  const ids = nodes.map((n) => n.id);
  for (const n of nodes) { moveNode(n, dx, dy); recomputeNode(n); }
  markChanged();
  const conns = rerouteConnectorsFor(App.doc, App.page, ids, true);
  rerenderNodes([...ids, ...conns]);
  updateUndoButtons();
}

/* ---------- klavye ---------- */
function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === ' ' && !typing) { App.space = true; $('#stage').style.cursor = 'grab'; e.preventDefault(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (App.doc) saveFile(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFileDialog(); return; }
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#searchInput').focus(); $('#searchInput').select(); return; }
  if (typing) return;
  if (!App.doc) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(true); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectIds(App.page.tree.map((n) => n.id)); return; }
  if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(false); return; }
  if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copySelection(true); return; }
  if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
  if (e.key === 'Escape') { selectIds([]); setTool('select'); return; }
  if (e.key === 'F2' || e.key === 'Enter') { if (App.sel.length === 1) { e.preventDefault(); startTextEdit(App.sel[0]); } return; }
  if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * (App.snap ? gridSize() / (e.shiftKey ? 1 : 5) : 0.01);
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
    nudge(dx, dy);
    return;
  }
  if (!mod) {
    const map = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', d: 'diamond', t: 'text', c: 'conn' };
    const k = e.key.toLowerCase();
    if (map[k]) { setTool(map[k]); return; }
    if (e.key === '+' || e.key === '=') { zoomCenter(1.25); return; }
    if (e.key === '-') { zoomCenter(0.8); return; }
    if (k === 'f') { fitPage(); return; }
    if (e.key === '1') { zoomAt(1, stageRect().width / 2, stageRect().height / 2); return; }
  }
}
function onKeyUp(e) {
  if (e.key === ' ' && App.space) { App.space = false; setTool(App.tool); }
}

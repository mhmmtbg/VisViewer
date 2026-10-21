/* SVG çizim motoru: şekil geometrisi, stil, metin, bağlayıcı uçları, resimler.
   Tüm koordinatlar inç cinsinden, Y yukarı; sayfa grubu bir kez ters çevrilir. */
'use strict';

const SVGNS = 'http://www.w3.org/2000/svg';
const FONT_FALLBACK = '"Segoe UI", Calibri, Arial, Helvetica, sans-serif';

function S(tag, attrs, children) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
  if (children) for (const c of children) if (c) el.appendChild(c);
  return el;
}
const f4 = (n) => (Math.round(n * 10000) / 10000).toString();
const normAng = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/* ---------- metin ölçümü ---------- */
const _mctx = document.createElement('canvas').getContext('2d');
function measureText(str, sizeIn, bold, italic, family) {
  const px = sizeIn * 96;
  _mctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${family}`;
  return _mctx.measureText(str).width / 96;
}

/* ---------- geometri ---------- */
function ellipticalArc(x0, y0, x1, y1, xc, yc, ang, ratio, out) {
  if (!(ratio > 0)) ratio = 1;
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  const tr = (x, y) => [x * ca - y * sa, (x * sa + y * ca) * ratio];
  const [ax, ay] = tr(x0, y0), [bx, by] = tr(xc, yc), [cx, cy] = tr(x1, y1);
  const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(dd) < 1e-12) return `L${f4(x1)} ${f4(y1)}`;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / dd;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / dd;
  const R = Math.hypot(ax - ux, ay - uy);
  const a0 = Math.atan2(ay - uy, ax - ux), a1 = Math.atan2(cy - uy, cx - ux);
  const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
  const ccw = cross > 0;
  const span = ccw ? normAng(a1 - a0) : normAng(a0 - a1);
  if (out) {
    const ca2 = Math.cos(ang), sa2 = Math.sin(ang);
    for (let i = 1; i <= 16; i++) {
      const t = a0 + (ccw ? 1 : -1) * span * (i / 16);
      const qx = ux + R * Math.cos(t), qy = (uy + R * Math.sin(t)) / ratio;
      out.push([qx * ca2 - qy * sa2, qx * sa2 + qy * ca2]);
    }
  }
  return `A${f4(R)} ${f4(R / ratio)} ${f4(ang * 180 / Math.PI)} ${span > Math.PI ? 1 : 0} ${ccw ? 1 : 0} ${f4(x1)} ${f4(y1)}`;
}

function bulgeArc(x0, y0, x1, y1, bow, out) {
  const chord = Math.hypot(x1 - x0, y1 - y0);
  if (chord < 1e-9 || Math.abs(bow) < 1e-9) return `L${f4(x1)} ${f4(y1)}`;
  const r = (chord * chord / 4 + bow * bow) / (2 * Math.abs(bow));
  if (out) {
    const dx = (x1 - x0) / chord, dy = (y1 - y0) / chord;
    const nx = dy, ny = -dx; // yolun sağı
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const sg = bow > 0 ? 1 : -1;
    const px = mx + nx * bow, py = my + ny * bow;
    const cx0 = px - sg * nx * r, cy0 = py - sg * ny * r;
    const a0 = Math.atan2(y0 - cy0, x0 - cx0), a1 = Math.atan2(y1 - cy0, x1 - cx0);
    const span = bow > 0 ? normAng(a1 - a0) : -normAng(a0 - a1);
    for (let i = 1; i <= 12; i++) { const t = a0 + span * (i / 12); out.push([cx0 + r * Math.cos(t), cy0 + r * Math.sin(t)]); }
  }
  return `A${f4(r)} ${f4(r)} 0 ${Math.abs(bow) > r ? 1 : 0} ${bow > 0 ? 1 : 0} ${f4(x1)} ${f4(y1)}`;
}

function numList(f, name) {
  const m = new RegExp('^' + name + '\\s*\\((.*)\\)\\s*$', 'i').exec((f || '').trim());
  if (!m) return null;
  const parts = m[1].split(',').map((s) => parseFloat(s.replace(/[^0-9eE+.\-]/g, '')));
  return parts.every((n) => Number.isFinite(n)) ? parts : null;
}

function nurbsPoints(start, f, W, H) {
  const a = numList(f, 'NURBS');
  if (!a || a.length < 8) return null;
  const degree = Math.max(1, Math.min(8, Math.round(a[1])));
  const xRel = a[2] === 1, yRel = a[3] === 1;
  const ctrl = [{ x: start[0], y: start[1], w: 1 }];
  for (let i = 4; i + 3 < a.length; i += 4) {
    ctrl.push({ x: xRel ? a[i] * W : a[i], y: yRel ? a[i + 1] * H : a[i + 1], w: a[i + 3] || 1 });
  }
  const n = ctrl.length;
  if (n < 2) return null;
  const p = Math.min(degree, n - 1);
  const knots = [];
  for (let i = 0; i < p + 1; i++) knots.push(0);
  for (let i = 1; i < n - p; i++) knots.push(i / (n - p));
  for (let i = 0; i < p + 1; i++) knots.push(1);
  const basis = (i, k, u) => {
    if (k === 0) return (u >= knots[i] && u < knots[i + 1]) || (u === 1 && knots[i + 1] === 1 && knots[i] < 1) ? 1 : 0;
    let v = 0;
    const d1 = knots[i + k] - knots[i], d2 = knots[i + k + 1] - knots[i + 1];
    if (d1 > 0) v += (u - knots[i]) / d1 * basis(i, k - 1, u);
    if (d2 > 0) v += (knots[i + k + 1] - u) / d2 * basis(i + 1, k - 1, u);
    return v;
  };
  const out = [];
  const steps = Math.max(12, n * 10);
  for (let s = 1; s <= steps; s++) {
    const u = s / steps;
    let x = 0, y = 0, wsum = 0;
    for (let i = 0; i < n; i++) {
      const b = basis(i, p, u) * ctrl[i].w;
      x += b * ctrl[i].x; y += b * ctrl[i].y; wsum += b;
    }
    if (wsum > 0) out.push([x / wsum, y / wsum]);
  }
  const last = ctrl[n - 1];
  out.push([last.x, last.y]);
  return out;
}

function roundedPolyline(pts, closed, r) {
  const n = pts.length;
  if (n < 3) return null;
  const get = (i) => pts[(i + n) % n];
  let d = '';
  const start = closed ? 0 : 1;
  const end = closed ? n : n - 1;
  const corner = (i) => {
    const p = get(i), a = get(i - 1), b = get(i + 1);
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(r, la / 2, lb / 2);
    if (rr <= 1e-9) return { p, a: p, b: p };
    return {
      p,
      a: [p[0] + (a[0] - p[0]) / la * rr, p[1] + (a[1] - p[1]) / la * rr],
      b: [p[0] + (b[0] - p[0]) / lb * rr, p[1] + (b[1] - p[1]) / lb * rr],
    };
  };
  if (!closed) d = `M${f4(pts[0][0])} ${f4(pts[0][1])}`;
  let first = true;
  for (let i = start; i < end; i++) {
    const c = corner(i);
    if (first && closed) { d += `M${f4(c.a[0])} ${f4(c.a[1])}`; first = false; }
    else d += `L${f4(c.a[0])} ${f4(c.a[1])}`;
    d += `Q${f4(c.p[0])} ${f4(c.p[1])} ${f4(c.b[0])} ${f4(c.b[1])}`;
  }
  if (closed) d += 'Z';
  else d += `L${f4(pts[n - 1][0])} ${f4(pts[n - 1][1])}`;
  return d;
}

/* Şeklin geometri bölümlerini SVG yollarına çevirir */
function buildGeometry(node, ctxNotes) {
  const secs = node.sections('Geometry');
  const keys = [...secs.keys()].sort((a, b) => Number(a) - Number(b));
  const W = node.w, H = node.h;
  const out = [];
  for (const k of keys) {
    const sec = secs.get(k);
    const gv = (n, def) => node.entryNum(sec.cells.get(n), def);
    if (gv('NoShow', 0) !== 0) continue;
    const rows = node.sortedRows(sec);
    let d = '';
    let cx = 0, cy = 0, sx = 0, sy = 0, started = false;
    let segs = 0;
    let polyOnly = true;
    let polySub = [];
    const polyAll = [];
    const first = [], tangents = { first: null, second: null, last: null, prev: null };
    const noteMove = (x, y) => {
      if (!tangents.first) tangents.first = [x, y];
    };
    const noteSeg = (px, py, x, y) => {
      if (!tangents.second) tangents.second = [x, y];
      tangents.prev = [px, py];
      tangents.last = [x, y];
    };
    const closeSub = () => {
      if (started && segs > 1 && Math.abs(cx - sx) < 1e-6 && Math.abs(cy - sy) < 1e-6) d += 'Z';
      if (polySub.length) polyAll.push({ pts: polySub, closed: started && segs > 1 && Math.abs(cx - sx) < 1e-6 && Math.abs(cy - sy) < 1e-6 });
      polySub = [];
    };
    for (const row of rows) {
      const t = row.t;
      const rv = (n, def) => node.entryNum(row.cells.get(n), def);
      const rf = (n) => { const e = row.cells.get(n); return e ? e.el.getAttribute('F') : null; };
      switch (t) {
        case 'MoveTo': case 'RelMoveTo': {
          closeSub();
          let x = rv('X', 0), y = rv('Y', 0);
          if (t === 'RelMoveTo') { x *= W; y *= H; }
          d += `M${f4(x)} ${f4(y)}`;
          cx = sx = x; cy = sy = y; started = true; segs = 1;
          polySub = [[x, y]];
          noteMove(x, y);
          break;
        }
        case 'LineTo': case 'RelLineTo': {
          let x = rv('X', 0), y = rv('Y', 0);
          if (t === 'RelLineTo') { x *= W; y *= H; }
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; polySub = [[cx, cy]]; noteMove(cx, cy); }
          d += `L${f4(x)} ${f4(y)}`;
          noteSeg(cx, cy, x, y);
          polySub.push([x, y]);
          cx = x; cy = y; segs++;
          break;
        }
        case 'ArcTo': {
          polyOnly = false;
          const x = rv('X', 0), y = rv('Y', 0), a = rv('A', 0);
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          d += bulgeArc(cx, cy, x, y, a, polySub);
          if (!polySub.length || polySub[polySub.length - 1][0] !== x || polySub[polySub.length - 1][1] !== y) polySub.push([x, y]);
          noteSeg(cx, cy, x, y);
          cx = x; cy = y; segs++;
          break;
        }
        case 'EllipticalArcTo': {
          polyOnly = false;
          const x = rv('X', 0), y = rv('Y', 0);
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          d += ellipticalArc(cx, cy, x, y, rv('A', x), rv('B', y), rv('C', 0), rv('D', 1), polySub);
          polySub.push([x, y]);
          noteSeg(cx, cy, x, y);
          cx = x; cy = y; segs++;
          break;
        }
        case 'Ellipse': {
          polyOnly = false;
          closeSub();
          const ex = rv('X', 0), ey = rv('Y', 0), ax = rv('A', ex + 1), ay = rv('B', ey), bx = rv('C', ex), by = rv('D', ey + 1);
          const rx = Math.hypot(ax - ex, ay - ey), ry = Math.hypot(bx - ex, by - ey);
          const rot = Math.atan2(ay - ey, ax - ex) * 180 / Math.PI;
          const ox = 2 * ex - ax, oy = 2 * ey - ay;
          d += `M${f4(ax)} ${f4(ay)}A${f4(rx)} ${f4(ry)} ${f4(rot)} 1 1 ${f4(ox)} ${f4(oy)}A${f4(rx)} ${f4(ry)} ${f4(rot)} 1 1 ${f4(ax)} ${f4(ay)}Z`;
          {
            const rr = rot * Math.PI / 180, cr = Math.cos(rr), sr = Math.sin(rr), samp = [];
            for (let i = 0; i < 48; i++) {
              const th = (i / 48) * 2 * Math.PI;
              samp.push([ex + rx * Math.cos(th) * cr - ry * Math.sin(th) * sr, ey + rx * Math.cos(th) * sr + ry * Math.sin(th) * cr]);
            }
            samp.push(samp[0]);
            polyAll.push({ pts: samp, closed: true });
          }
          tangents.first = tangents.first || [ax, ay];
          cx = sx = ax; cy = sy = ay; started = false; segs = 0; polySub = [];
          break;
        }
        case 'RelCubBezTo': {
          polyOnly = false;
          const x = rv('X', 0) * W, y = rv('Y', 0) * H;
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          d += `C${f4(rv('A', 0) * W)} ${f4(rv('B', 0) * H)} ${f4(rv('C', 0) * W)} ${f4(rv('D', 0) * H)} ${f4(x)} ${f4(y)}`;
          {
            const b1 = [rv('A', 0) * W, rv('B', 0) * H], b2 = [rv('C', 0) * W, rv('D', 0) * H];
            for (let i = 1; i <= 12; i++) {
              const u = i / 12, v = 1 - u;
              polySub.push([v * v * v * cx + 3 * v * v * u * b1[0] + 3 * v * u * u * b2[0] + u * u * u * x, v * v * v * cy + 3 * v * v * u * b1[1] + 3 * v * u * u * b2[1] + u * u * u * y]);
            }
          }
          noteSeg(cx, cy, x, y);
          cx = x; cy = y; segs++;
          break;
        }
        case 'RelQuadBezTo': {
          polyOnly = false;
          const x = rv('X', 0) * W, y = rv('Y', 0) * H;
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          d += `Q${f4(rv('A', 0) * W)} ${f4(rv('B', 0) * H)} ${f4(x)} ${f4(y)}`;
          noteSeg(cx, cy, x, y);
          cx = x; cy = y; segs++;
          break;
        }
        case 'NURBSTo': {
          polyOnly = false;
          const x = rv('X', 0), y = rv('Y', 0);
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          const pts = nurbsPoints([cx, cy], rf('E'), W, H);
          if (pts) { for (const p of pts) { d += `L${f4(p[0])} ${f4(p[1])}`; polySub.push([p[0], p[1]]); } const lp = pts[pts.length - 1]; const pp = pts.length > 1 ? pts[pts.length - 2] : [cx, cy]; noteSeg(pp[0], pp[1], lp[0], lp[1]); cx = lp[0]; cy = lp[1]; }
          else { d += `L${f4(x)} ${f4(y)}`; noteSeg(cx, cy, x, y); cx = x; cy = y; ctxNotes('yaklaşık', 'Bazı eğriler (NURBS) düz çizgiyle yaklaşık gösteriliyor.'); }
          segs++;
          break;
        }
        case 'PolylineTo': {
          polyOnly = false;
          const x = rv('X', 0), y = rv('Y', 0);
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          const a = numList(rf('A'), 'POLYLINE');
          if (a && a.length >= 4) {
            const xRel = a[0] === 1, yRel = a[1] === 1;
            for (let i = 2; i + 1 < a.length; i += 2) {
              const px = xRel ? a[i] * W : a[i], py = yRel ? a[i + 1] * H : a[i + 1];
              d += `L${f4(px)} ${f4(py)}`; noteSeg(cx, cy, px, py); cx = px; cy = py;
            }
          } else { d += `L${f4(x)} ${f4(y)}`; noteSeg(cx, cy, x, y); cx = x; cy = y; }
          segs++;
          break;
        }
        case 'SplineStart': case 'SplineKnot': {
          polyOnly = false;
          const x = rv('X', 0), y = rv('Y', 0);
          if (!started) { d += `M${f4(cx)} ${f4(cy)}`; started = true; sx = cx; sy = cy; noteMove(cx, cy); }
          d += `L${f4(x)} ${f4(y)}`; noteSeg(cx, cy, x, y);
          cx = x; cy = y; segs++;
          ctxNotes('yaklaşık', 'Bazı eğriler (spline) düz çizgiyle yaklaşık gösteriliyor.');
          break;
        }
        default:
          break; // InfiniteLine vb. yok sayılır
      }
    }
    closeSub();
    if (!d) continue;
    let finalD = d;
    const rounding = node.num('Rounding', 0);
    if (rounding > 0 && polyOnly && polyAll.length) {
      const parts = polyAll.map((p) => {
        const pts = p.closed ? p.pts.slice(0, -1) : p.pts;
        return roundedPolyline(pts, p.closed, rounding);
      });
      if (parts.every(Boolean)) finalD = parts.join('');
    }
    out.push({ d: finalD, noFill: gv('NoFill', 0) !== 0, noLine: gv('NoLine', 0) !== 0, tangents, polys: polyAll });
  }
  return out;
}

/* ---------- çizgi / dolgu stili ---------- */
const DASHES = {
  2: [4, 3], 3: [1, 2], 4: [4, 2, 1, 2], 5: [4, 2, 1, 2, 1, 2], 6: [6, 3], 7: [8, 3], 8: [6, 2, 1, 2], 9: [8, 3, 1, 3],
  10: [3, 1], 11: [3, 1, 1, 1], 12: [1, 1], 13: [6, 2, 1, 2], 14: [8, 2, 1, 2], 15: [9, 2, 1, 2, 1, 2], 16: [6, 6], 17: [3, 3], 18: [6, 3, 1, 3], 19: [6, 3, 3, 3], 20: [6, 3, 1, 3, 1, 3], 21: [9, 3, 3, 3], 22: [12, 3], 23: [12, 3, 2, 3],
};

function lineStyle(node) {
  const pat = Math.round(node.num('LinePattern', 1));
  let w = node.num('LineWeight', 0.01);
  if (w <= 0) w = 0.004;
  const color = colorOf(node.doc, node.str('LineColor', '0')) || '#000000';
  const trans = node.num('LineColorTrans', 0);
  const cap = Math.round(node.num('LineCap', 0));
  return { pat, w, color, opacity: trans > 0 ? 1 - trans : 1, cap };
}

function applyStroke(el, ls) {
  if (ls.pat === 0) { el.setAttribute('stroke', 'none'); return; }
  el.setAttribute('stroke', ls.color);
  el.setAttribute('stroke-width', f4(ls.w));
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('stroke-linecap', ls.cap === 1 ? 'round' : ls.cap === 2 ? 'square' : 'butt');
  if (ls.opacity < 1) el.setAttribute('stroke-opacity', f4(ls.opacity));
  if (ls.pat > 1 && DASHES[ls.pat]) {
    const unit = Math.max(ls.w, 0.01);
    el.setAttribute('stroke-dasharray', DASHES[ls.pat].map((v) => f4(v * unit)).join(' '));
  }
}

function fillStyle(ctx, node) {
  const pat = Math.round(node.num('FillPattern', 1));
  if (pat === 0) return { none: true };
  const fg = colorOf(node.doc, node.str('FillForegnd', '1')) || '#FFFFFF';
  const bg = colorOf(node.doc, node.str('FillBkgnd', '1')) || '#FFFFFF';
  const trans = node.num('FillForegndTrans', 0);
  const grad = node.num('FillGradientEnabled', 0) !== 0;
  const style = { fill: fg, opacity: trans > 0 ? 1 - trans : 1 };
  if (grad) {
    const id = 'vg' + (++ctx.gradN);
    const dir = Math.round(node.num('FillGradientDir', 0));
    const horizontal = dir === 1 || dir === 5;
    const g = S('linearGradient', { id, x1: 0, y1: horizontal ? 0 : 1, x2: horizontal ? 1 : 0, y2: 0 }, [
      S('stop', { offset: 0, 'stop-color': fg }), S('stop', { offset: 1, 'stop-color': bg }),
    ]);
    ctx.defs.appendChild(g);
    style.fill = `url(#${id})`;
  } else if (pat > 1 && pat < 25) {
    ctx.note('yaklaşık', 'Desenli dolgular düz renkle yaklaşık gösteriliyor.');
  } else if (pat >= 25) {
    // gradyan benzeri desenler: iki rengi karıştır
    const id = 'vg' + (++ctx.gradN);
    ctx.defs.appendChild(S('linearGradient', { id, x1: 0, y1: 1, x2: 0, y2: 0 }, [
      S('stop', { offset: 0, 'stop-color': fg }), S('stop', { offset: 1, 'stop-color': bg }),
    ]));
    style.fill = `url(#${id})`;
    ctx.note('yaklaşık', 'Degrade dolgular iki renkli doğrusal geçişle yaklaşık gösteriliyor.');
  }
  return style;
}

/* ---------- ok uçları ---------- */
function arrowShape(type, tip, ang, size, ls) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [tip[0] + u * ca - v * sa, tip[1] + u * sa + v * ca]; // u: ileri, v: yan
  const L = size, Wd = size * 0.5;
  const pt = (p) => `${f4(p[0])} ${f4(p[1])}`;
  if (type === 1 || type === 15) { // açık V
    const a = P(-L, Wd), b = P(-L, -Wd);
    return S('path', { d: `M${pt(a)}L${pt(tip)}L${pt(b)}`, fill: 'none', stroke: ls.color, 'stroke-width': f4(ls.w), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  }
  if (type === 10 || type === 20 || type === 23) { // daire
    const c = P(-L * 0.5, 0);
    return S('circle', { cx: f4(c[0]), cy: f4(c[1]), r: f4(L * 0.45), fill: ls.color });
  }
  if (type === 17 || type === 18 || type === 22) { // eşkenar dörtgen
    const a = P(-L * 0.5, Wd), b = P(-L, 0), c = P(-L * 0.5, -Wd);
    return S('path', { d: `M${pt(tip)}L${pt(a)}L${pt(b)}L${pt(c)}Z`, fill: ls.color });
  }
  if (type === 4 || type === 14) { // yarım ok (stealth)
    const a = P(-L, Wd), m = P(-L * 0.7, 0), b = P(-L, -Wd);
    return S('path', { d: `M${pt(tip)}L${pt(a)}L${pt(m)}L${pt(b)}Z`, fill: ls.color });
  }
  const a = P(-L, Wd), b = P(-L, -Wd);
  return S('path', { d: `M${pt(tip)}L${pt(a)}L${pt(b)}Z`, fill: ls.color });
}

function arrowSize(idx, w) {
  const mult = [1.6, 2.2, 3.2, 4.4, 6.0, 8.0, 10.0][Math.max(0, Math.min(6, idx))];
  return Math.max(w * mult * 2, 0.035 * mult / 2 + 0.03);
}

/* ---------- metin ---------- */
function charProps(node) {
  const secs = node.sections('Character');
  const sec = secs.get('0');
  const row = sec ? (sec.rows.get('0') || [...sec.rows.values()][0]) : null;
  const cell = (n) => (row ? row.cells.get(n) : null);
  let size = node.entryNum(cell('Size'), 0.1111);
  if (!(size > 0)) size = 0.1111;
  const color = colorOf(node.doc, cell('Color') ? cell('Color').el.getAttribute('V') : '0') || '#000000';
  const style = node.entryNum(cell('Style'), 0) | 0;
  const faceId = cell('Font') ? cell('Font').el.getAttribute('V') : '0';
  let face = node.doc.faces.get(faceId) || 'Calibri';
  if (face === 'Themed') face = 'Calibri';
  return { size, color, bold: !!(style & 1), italic: !!(style & 2), underline: !!(style & 4), family: `"${face}", ${FONT_FALLBACK}` };
}

function paraProps(node) {
  const secs = node.sections('Paragraph');
  const sec = secs.get('0');
  const row = sec ? (sec.rows.get('0') || [...sec.rows.values()][0]) : null;
  const e = row ? row.cells.get('HorzAlign') : null;
  return { align: Math.round(node.entryNum(e, 1)) };
}

function wrapText(text, maxW, cp) {
  const lines = [];
  for (const para of text.split('\n')) {
    if (para === '') { lines.push(''); continue; }
    const words = para.split(/(\s+)/);
    let cur = '';
    for (const w of words) {
      const trial = cur + w;
      if (cur && measureText(trial.replace(/\s+$/, ''), cp.size, cp.bold, cp.italic, cp.family) > maxW) {
        lines.push(cur.replace(/\s+$/, ''));
        cur = w.replace(/^\s+/, '');
      } else cur = trial;
    }
    lines.push(cur.replace(/\s+$/, ''));
  }
  return lines;
}

function renderText(ctx, node, text) {
  if (!text || !text.trim()) return null;
  if (node.num('HideText', 0) !== 0) return null;
  const W = node.w, H = node.h;
  const tw = node.num('TxtWidth', W), th = node.num('TxtHeight', H);
  const tpx = node.num('TxtPinX', W / 2), tpy = node.num('TxtPinY', H / 2);
  const tlx = node.num('TxtLocPinX', tw / 2), tly = node.num('TxtLocPinY', th / 2);
  const tang = node.num('TxtAngle', 0);
  const cp = charProps(node), pp = paraProps(node);
  const lm = node.num('LeftMargin', 0.0556), rm = node.num('RightMargin', 0.0556);
  const tm = node.num('TopMargin', 0.0556), bm = node.num('BottomMargin', 0.0556);
  const va = Math.round(node.num('VerticalAlign', 1));
  const avail = Math.max(tw - lm - rm, 0.05);
  const lines = wrapText(text, avail, cp);
  const lh = cp.size * 1.2;
  const total = lines.length * lh;
  let y0 = va === 0 ? tm : va === 2 ? th - bm - total : tm + (Math.max(th - tm - bm, 0) - total) / 2;
  let anchor = 'middle', x = lm + avail / 2;
  if (pp.align === 0) { anchor = 'start'; x = lm; } else if (pp.align === 2) { anchor = 'end'; x = lm + avail; }

  let m = mTranslate(tpx, tpy);
  if (node.flipX || node.flipY) m = mMul(m, mScale(node.flipX ? -1 : 1, node.flipY ? -1 : 1));
  if (tang) m = mMul(m, mRotate(tang));
  m = mMul(m, mTranslate(-tlx, -tly));
  m = mMul(m, [1, 0, 0, -1, 0, th]); // metin çerçevesini Y aşağı yap
  const g = S('g', { transform: `matrix(${m.map(f4).join(' ')})`, class: 'txt' });
  const t = S('text', {
    'font-size': f4(cp.size), 'font-family': cp.family, fill: cp.color,
    'font-weight': cp.bold ? 'bold' : null, 'font-style': cp.italic ? 'italic' : null,
    'text-decoration': cp.underline ? 'underline' : null, 'text-anchor': anchor, 'pointer-events': 'none',
  });
  lines.forEach((ln, i) => {
    const ts = S('tspan', { x: f4(x), y: f4(y0 + i * lh + cp.size * 0.9) });
    ts.textContent = ln === '' ? ' ' : ln;
    t.appendChild(ts);
  });
  g.appendChild(t);
  return g;
}

/* ---------- şekil çizimi ---------- */
function layerHidden(ctx, node) {
  if (!ctx.hiddenLayers.size) return false;
  const lm = node.str('LayerMember', '');
  if (!lm) return false;
  const ids = lm.split(';').filter((s) => s !== '');
  return ids.length > 0 && ids.every((i) => ctx.hiddenLayers.has(parseInt(i, 10)));
}

function localMatrix(node) {
  let m = mTranslate(node.pinX, node.pinY);
  if (node.angle) m = mMul(m, mRotate(node.angle));
  if (node.flipX || node.flipY) m = mMul(m, mScale(node.flipX ? -1 : 1, node.flipY ? -1 : 1));
  return mMul(m, mTranslate(-node.locX, -node.locY));
}

function renderForeign(ctx, node) {
  const fd = kid(node.el, 'ForeignData');
  if (!fd) return null;
  const relEl = kid(fd, 'Rel');
  const rid = relEl ? relEl.getAttributeNS(NS_R, 'id') : null;
  const path = rid ? ctx.doc.relTarget(node.page, rid) : null;
  const url = path ? ctx.doc.imageCache.get(path) : null;
  const W = node.w, H = node.h;
  const g = S('g', { transform: `translate(0 ${f4(H)}) scale(1 -1)` });
  if (url) {
    g.appendChild(S('image', { x: 0, y: 0, width: f4(W), height: f4(H), href: url, preserveAspectRatio: 'none' }));
  } else {
    ctx.note('uyarı', 'Gömülü EMF/WMF/OLE nesneleri gösterilemiyor (yer tutucu çizildi); kaydederken korunur.');
    g.appendChild(S('rect', { x: 0, y: 0, width: f4(W), height: f4(H), fill: '#f0f0f0', stroke: '#999', 'stroke-width': 0.01, 'stroke-dasharray': '0.05 0.03' }));
    g.appendChild(S('path', { d: `M0 0L${f4(W)} ${f4(H)}M${f4(W)} 0L0 ${f4(H)}`, stroke: '#bbb', 'stroke-width': 0.008, fill: 'none' }));
  }
  return g;
}

function renderNode(ctx, node, parent) {
  if (node.type === 'Guide') return;
  if (layerHidden(ctx, node)) return;
  const lm = localMatrix(node);
  const g = S('g', { 'data-sid': node.id, transform: `matrix(${lm.map(f4).join(' ')})` });
  if (node.type === 'Group') g.setAttribute('data-group', '1');
  const ls = lineStyle(node);
  const geo = node.type === 'Foreign' ? [] : buildGeometry(node, ctx.note);
  const fs = fillStyle(ctx, node);
  let firstPathD = null;
  for (const gp of geo) {
    const p = S('path', { d: gp.d });
    if (gp.noFill || fs.none) p.setAttribute('fill', 'none');
    else {
      p.setAttribute('fill', fs.fill);
      p.setAttribute('fill-rule', 'evenodd');
      if (fs.opacity < 1) p.setAttribute('fill-opacity', f4(fs.opacity));
    }
    if (gp.noLine) p.setAttribute('stroke', 'none'); else applyStroke(p, ls);
    g.appendChild(p);
    if (!firstPathD) firstPathD = gp.d;
  }
  // ok uçları
  const beginArrow = Math.round(node.num('BeginArrow', 0));
  const endArrow = Math.round(node.num('EndArrow', 0));
  if ((beginArrow || endArrow) && geo.length && ls.pat !== 0) {
    const tg = geo[0].tangents;
    if (beginArrow && tg.first && tg.second) {
      const ang = Math.atan2(tg.first[1] - tg.second[1], tg.first[0] - tg.second[0]);
      g.appendChild(arrowShape(beginArrow, tg.first, ang, arrowSize(Math.round(node.num('BeginArrowSize', 2)), ls.w), ls));
    }
    if (endArrow && tg.last && tg.prev) {
      const ang = Math.atan2(tg.last[1] - tg.prev[1], tg.last[0] - tg.prev[0]);
      g.appendChild(arrowShape(endArrow, tg.last, ang, arrowSize(Math.round(node.num('EndArrowSize', 2)), ls.w), ls));
    }
  }
  if (node.type === 'Foreign') {
    const fgn = renderForeign(ctx, node);
    if (fgn) g.appendChild(fgn);
  }
  for (const c of node.children) renderNode(ctx, c, g);
  if (!ctx.noText) {
    const tg = renderText(ctx, node, node.text());
    if (tg) g.appendChild(tg);
  }
  if (!ctx.noHit && node.type !== 'Group') {
    if (node.oneD && firstPathD) {
      g.appendChild(S('path', { d: firstPathD, class: 'hit', fill: 'none', stroke: 'transparent', 'stroke-width': 0.12, 'pointer-events': 'stroke' }));
    } else if (node.w > 0 && node.h > 0) {
      g.appendChild(S('rect', { x: 0, y: 0, width: f4(node.w), height: f4(node.h), class: 'hit', fill: 'transparent', 'pointer-events': 'all' }));
    } else if (firstPathD) {
      g.appendChild(S('path', { d: firstPathD, class: 'hit', fill: 'none', stroke: 'transparent', 'stroke-width': 0.12, 'pointer-events': 'stroke' }));
    }
  }
  parent.appendChild(g);
}

/* Sayfa içeriği: {g, defs} döndürür; node ağacını (re)kurar */
function renderPageContent(doc, page, opts) {
  opts = opts || {};
  const hidden = new Set();
  for (const l of doc.pageLayers(page)) if (!l.visible) hidden.add(l.ix);
  if (opts.hiddenLayers) for (const i of opts.hiddenLayers) hidden.add(i);
  const defs = S('defs');
  const ctx = {
    doc, defs, gradN: 0, hiddenLayers: hidden, noHit: !!opts.noHit, noText: !!opts.noText,
    note: (k, t) => doc.note(k, t),
  };
  const g = S('g', { class: 'page-content' });
  if (page.backPage) {
    const bp = doc.pages.find((p) => p.id === page.backPage);
    if (bp) {
      const bg = S('g', { class: 'bg-page', 'pointer-events': 'none' });
      const tree = doc.buildTree(bp);
      for (const n of tree) renderNode({ ...ctx, noHit: true }, n, bg);
      g.appendChild(bg);
    }
  }
  const tree = doc.buildTree(page);
  const body = S('g', { class: 'fg-page' });
  for (const n of tree) renderNode(ctx, n, body);
  g.appendChild(body);
  page.renderCtx = ctx;
  return { g, defs };
}

/* Bağımsız SVG dizgesi (dışa aktarma / küçük resim) */
function pageToSVGString(doc, page, opts) {
  opts = opts || {};
  const { g, defs } = renderPageContent(doc, page, { noHit: true, noText: !!opts.noText });
  const scale = opts.scale || 96;
  const w = page.w * scale, h = page.h * scale;
  const svg = S('svg', { xmlns: SVGNS, viewBox: `0 0 ${f4(w)} ${f4(h)}`, width: opts.fit ? '100%' : f4(w), height: opts.fit ? '100%' : f4(h) });
  svg.appendChild(defs);
  if (opts.background !== false) svg.appendChild(S('rect', { width: f4(w), height: f4(h), fill: '#ffffff' }));
  const wrap = S('g', { transform: `translate(0 ${f4(h)}) scale(${scale} ${-scale})` });
  wrap.appendChild(g);
  svg.appendChild(wrap);
  return new XMLSerializer().serializeToString(svg);
}

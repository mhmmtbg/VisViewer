/* VSDX belge modeli: paketi okur, sayfa/master/stil yapısını çözer,
   hücre mirasını (şekil → master → stil) ve formül değerlendirmesini sağlar.
   Düzenleme sırasında orijinal XML DOM'u korunur. */
'use strict';

const NS_V = 'http://schemas.microsoft.com/office/visio/2012/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/* ---------- küçük yardımcılar ---------- */
function kids(el, name) {
  const r = [];
  if (!el) return r;
  for (const c of el.children) if (c.localName === name) r.push(c);
  return r;
}
function kid(el, name) {
  if (!el) return null;
  for (const c of el.children) if (c.localName === name) return c;
  return null;
}
function findCell(el, name) {
  if (!el) return null;
  for (const c of el.children) if (c.localName === 'Cell' && c.getAttribute('N') === name) return c;
  return null;
}
function parseNum(v, def) {
  if (v === null || v === undefined || v === '') return def;
  if (v === 'TRUE') return 1;
  if (v === 'FALSE') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function dirOf(path) { const i = path.lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i + 1); }
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dirOf(base) + target).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
function relsPathFor(part) {
  const i = part.lastIndexOf('/');
  return part.slice(0, i + 1) + '_rels/' + part.slice(i + 1) + '.rels';
}

/* ---------- Visio renk paleti (indeksli renkler) ---------- */
const DEFAULT_PALETTE = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#E6E6E6',
  '#CDCDCD', '#B3B3B3', '#9A9A9A', '#808080', '#666666', '#4D4D4D', '#333333', '#1A1A1A',
];

/* ---------- formül değerlendirici ---------- */
const UNIT = { in: 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54, pt: 1 / 72, deg: Math.PI / 180, rad: 1, '"': 1 };

function tokenizeFormula(s) {
  const t = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (j < s.length && /[eE]/.test(s[j]) && /[-+0-9]/.test(s[j + 1] || '')) {
        j++; if (/[-+]/.test(s[j])) j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      let val = parseFloat(s.slice(i, j));
      let k = j;
      while (k < s.length && s[k] === ' ') k++;
      const um = /^(in|ft|mm|cm|m|pt|deg|rad)\b/.exec(s.slice(k));
      if (um) { val *= UNIT[um[1]]; j = k + um[1].length; }
      else if (s[j] === '"') { j++; }
      t.push({ k: 'n', v: val });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_.!:$]/.test(s[j])) j++;
      t.push({ k: 'id', v: s.slice(i, j) });
      i = j; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j++;
      t.push({ k: 's', v: s.slice(i + 1, j) });
      i = j + 1; continue;
    }
    const two = s.slice(i, i + 2);
    if (['<=', '>=', '<>', '&&', '||'].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
    t.push({ k: 'op', v: ch }); i++;
  }
  return t;
}

function evalFormula(f, ctx) {
  const t = tokenizeFormula(f.replace(/^=/, ''));
  let i = 0;
  const peek = () => t[i];
  const isOp = (v) => t[i] && t[i].k === 'op' && t[i].v === v;
  const fail = (m) => { throw new Error('formül: ' + m); };

  function primary() {
    const tok = t[i++];
    if (!tok) fail('beklenmedik son');
    if (tok.k === 'n') return tok.v;
    if (tok.k === 's') fail('metin');
    if (tok.k === 'op') {
      if (tok.v === '(') { const v = expr(); if (!isOp(')')) fail(')'); i++; return v; }
      if (tok.v === '-') return -unary();
      if (tok.v === '+') return unary();
      fail('işleç ' + tok.v);
    }
    // identifier
    if (isOp('(')) {
      i++;
      const args = [];
      if (!isOp(')')) {
        for (;;) { args.push(expr()); if (isOp(',')) { i++; continue; } break; }
      }
      if (!isOp(')')) fail(')');
      i++;
      return callFn(tok.v.toUpperCase(), args);
    }
    const name = tok.v;
    if (name === 'TRUE') return 1;
    if (name === 'FALSE') return 0;
    if (name === 'PI') return Math.PI;
    return ctx.ref(name);
  }
  function callFn(n, a) {
    switch (n) {
      case 'ABS': return Math.abs(a[0]);
      case 'MIN': return Math.min(...a);
      case 'MAX': return Math.max(...a);
      case 'SQRT': return Math.sqrt(a[0]);
      case 'INT': return Math.floor(a[0]);
      case 'ROUND': return Math.round(a[0]);
      case 'SIN': return Math.sin(a[0]);
      case 'COS': return Math.cos(a[0]);
      case 'TAN': return Math.tan(a[0]);
      case 'ATAN': return Math.atan(a[0]);
      case 'ATAN2': return Math.atan2(a[0], a[1]);
      case 'RAD': return a[0] * Math.PI / 180;
      case 'DEG': return a[0] * 180 / Math.PI;
      case 'POW': return Math.pow(a[0], a[1]);
      case 'IF': return a[0] ? a[1] : a[2];
      case 'AND': return a.every(Boolean) ? 1 : 0;
      case 'OR': return a.some(Boolean) ? 1 : 0;
      case 'NOT': return a[0] ? 0 : 1;
      case 'GUARD': case 'DEFERRED': return a[0];
      default: return fail('işlev ' + n);
    }
  }
  function unary() { return primary(); }
  function power() {
    let v = unary();
    while (isOp('^')) { i++; v = Math.pow(v, unary()); }
    return v;
  }
  function mul() {
    let v = power();
    while (isOp('*') || isOp('/')) {
      const o = t[i++].v;
      const r = power();
      v = o === '*' ? v * r : v / r;
    }
    return v;
  }
  function add() {
    let v = mul();
    while (isOp('+') || isOp('-')) {
      const o = t[i++].v;
      const r = mul();
      v = o === '+' ? v + r : v - r;
    }
    return v;
  }
  function cmp() {
    let v = add();
    while (t[i] && t[i].k === 'op' && ['<', '>', '<=', '>=', '=', '<>'].includes(t[i].v)) {
      const o = t[i++].v;
      const r = add();
      v = ({ '<': v < r, '>': v > r, '<=': v <= r, '>=': v >= r, '=': v === r, '<>': v !== r })[o] ? 1 : 0;
    }
    return v;
  }
  function expr() {
    let v = cmp();
    while (t[i] && t[i].k === 'op' && (t[i].v === '&&' || t[i].v === '||')) {
      const o = t[i++].v;
      const r = cmp();
      v = o === '&&' ? (v && r ? 1 : 0) : (v || r ? 1 : 0);
    }
    return v;
  }
  const out = expr();
  if (i < t.length) fail('fazla belirteç');
  if (!Number.isFinite(out)) fail('sayı değil');
  return out;
}

/* ---------- matris yardımcıları (SVG: [a b c d e f]) ---------- */
const M_ID = [1, 0, 0, 1, 0, 0];
function mMul(m, n) { // m * n (önce n uygulanır)
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function mApply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function mInv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return M_ID.slice();
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
function mTranslate(x, y) { return [1, 0, 0, 1, x, y]; }
function mRotate(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; }
function mScale(x, y) { return [x, 0, 0, y, 0, 0]; }

/* ---------- stil hücre grupları ---------- */
const LINE_CELLS = new Set(['LineWeight', 'LineColor', 'LinePattern', 'Rounding', 'EndArrowSize', 'BeginArrow', 'BeginArrowSize',
  'EndArrow', 'LineCap', 'LineColorTrans']);
const FILL_CELLS = new Set(['FillForegnd', 'FillBkgnd', 'FillPattern', 'ShdwForegnd', 'ShdwPattern', 'FillForegndTrans',
  'FillBkgndTrans', 'FillGradientEnabled', 'FillGradientDir', 'FillGradientAngle']);
const TEXT_CELLS = new Set(['LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin', 'VerticalAlign', 'TextBkgnd', 'DefaultTabStop',
  'TextDirection', 'TextBkgndTrans']);

/* ---------- Belge ---------- */
class VDoc {
  constructor() {
    this.name = 'cizim.vsdx';
    this.entries = [];
    this.byName = new Map();
    this.dom = new Map();       // parça adı → XML Document
    this.pages = [];
    this.masters = new Map();
    this.styles = new Map();
    this.colors = [];
    this.faces = new Map();
    this.report = [];
    this.dirtyParts = new Set();
    this.docPath = 'visio/document.xml';
  }

  note(kind, text) {
    if (!this.report.some((r) => r.text === text)) this.report.push({ kind, text });
  }

  static async load(buf, name) {
    const d = new VDoc();
    d.name = name || d.name;
    d.entries = parseZip(buf);
    for (const e of d.entries) d.byName.set(e.name, e);

    // ana ilişki: belge parçası
    let docPath = 'visio/document.xml';
    const rootRels = await d.readXml('_rels/.rels', true);
    if (rootRels) {
      for (const r of kids(rootRels.documentElement, 'Relationship')) {
        if (/\/document$/.test(r.getAttribute('Type') || '')) docPath = resolvePath('/', r.getAttribute('Target'));
      }
    }
    if (!d.byName.has(docPath)) throw new Error('Visio belge parçası (visio/document.xml) bulunamadı. Bu bir VSDX dosyası değil.');
    d.docPath = docPath;
    const docDom = await d.readXml(docPath);
    const docRels = await d.readRels(docPath);
    d.parseDocument(docDom);

    let pagesPath = null, mastersPath = null;
    for (const r of docRels) {
      if (/\/pages$/.test(r.type)) pagesPath = r.path;
      else if (/\/masters$/.test(r.type)) mastersPath = r.path;
    }
    if (!pagesPath) throw new Error('Dosyada sayfa tanımı bulunamadı.');
    await d.parsePages(pagesPath);
    if (mastersPath && d.byName.has(mastersPath)) await d.parseMasters(mastersPath);
    await d.preloadMedia();
    return d;
  }

  async preloadMedia() {
    this.imageCache = new Map();
    const mimes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };
    for (const page of this.pages) {
      for (const rel of page.rels || []) {
        const ext = (rel.path.split('.').pop() || '').toLowerCase();
        const mime = mimes[ext];
        if (!mime || rel.external || !this.byName.has(rel.path) || this.imageCache.has(rel.path)) continue;
        const bytes = await entryBytes(this.byName.get(rel.path));
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        this.imageCache.set(rel.path, `data:${mime};base64,${btoa(bin)}`);
      }
    }
  }

  async readXml(part, optional) {
    if (this.dom.has(part)) return this.dom.get(part);
    const e = this.byName.get(part);
    if (!e) { if (optional) return null; throw new Error('Parça bulunamadı: ' + part); }
    const bytes = await entryBytes(e);
    const text = utf8dec.decode(bytes).replace(/^﻿/, '');
    const dom = new DOMParser().parseFromString(text, 'application/xml');
    if (dom.getElementsByTagName('parsererror').length) throw new Error('XML ayrıştırılamadı: ' + part);
    this.dom.set(part, dom);
    return dom;
  }

  async readRels(part) {
    const rp = relsPathFor(part);
    const dom = await this.readXml(rp, true);
    const out = [];
    if (!dom) return out;
    for (const r of kids(dom.documentElement, 'Relationship')) {
      const target = r.getAttribute('Target');
      const external = r.getAttribute('TargetMode') === 'External';
      out.push({
        id: r.getAttribute('Id'), type: r.getAttribute('Type') || '', target, external,
        path: external ? target : resolvePath(part, target),
      });
    }
    return out;
  }

  parseDocument(dom) {
    const root = dom.documentElement;
    const colors = kid(root, 'Colors');
    this.colors = DEFAULT_PALETTE.slice();
    if (colors) {
      for (const c of kids(colors, 'ColorEntry')) {
        const ix = parseInt(c.getAttribute('IX'), 10);
        if (Number.isFinite(ix)) this.colors[ix] = c.getAttribute('RGB');
      }
    }
    const faces = kid(root, 'FaceNames');
    if (faces) for (const f of kids(faces, 'FaceName')) this.faces.set(f.getAttribute('ID'), f.getAttribute('Name'));
    const styles = kid(root, 'StyleSheets');
    if (styles) for (const s of kids(styles, 'StyleSheet')) this.styles.set(s.getAttribute('ID'), s);
  }

  async parsePages(pagesPath) {
    const dom = await this.readXml(pagesPath);
    const rels = new Map((await this.readRels(pagesPath)).map((r) => [r.id, r]));
    for (const p of kids(dom.documentElement, 'Page')) {
      const relEl = kid(p, 'Rel');
      const rid = relEl ? relEl.getAttributeNS(NS_R, 'id') : null;
      const rel = rid ? rels.get(rid) : null;
      const page = {
        id: p.getAttribute('ID'),
        name: p.getAttribute('Name') || p.getAttribute('NameU') || ('Sayfa ' + (this.pages.length + 1)),
        background: p.getAttribute('Background') === '1',
        backPage: p.getAttribute('BackPage'),
        path: rel ? rel.path : null,
        sheet: kid(p, 'PageSheet'),
        w: 11, h: 8.5,
      };
      if (page.sheet) {
        page.w = parseNum(findCell(page.sheet, 'PageWidth')?.getAttribute('V'), 11);
        page.h = parseNum(findCell(page.sheet, 'PageHeight')?.getAttribute('V'), 8.5);
      }
      if (page.path && this.byName.has(page.path)) {
        page.dom = await this.readXml(page.path);
        page.rels = await this.readRels(page.path);
        this.pages.push(page);
      } else {
        this.note('uyarı', 'Sayfa içeriği bulunamadı: ' + page.name);
      }
    }
    if (!this.pages.length) throw new Error('Dosyada görüntülenecek sayfa yok.');
  }

  async parseMasters(path) {
    const dom = await this.readXml(path);
    const rels = new Map((await this.readRels(path)).map((r) => [r.id, r]));
    for (const m of kids(dom.documentElement, 'Master')) {
      const relEl = kid(m, 'Rel');
      const rid = relEl ? relEl.getAttributeNS(NS_R, 'id') : null;
      const rel = rid ? rels.get(rid) : null;
      if (!rel || !this.byName.has(rel.path)) continue;
      const mdom = await this.readXml(rel.path);
      const shapes = kid(mdom.documentElement, 'Shapes');
      const byId = new Map();
      const top = shapes ? kids(shapes, 'Shape') : [];
      const walk = (list) => {
        for (const s of list) {
          byId.set(s.getAttribute('ID'), s);
          const sub = kid(s, 'Shapes');
          if (sub) walk(kids(sub, 'Shape'));
        }
      };
      walk(top);
      this.masters.set(m.getAttribute('ID'), {
        id: m.getAttribute('ID'), name: m.getAttribute('Name') || m.getAttribute('NameU'),
        shapeById: byId, top,
        w: parseNum(findCell(kid(m, 'PageSheet'), 'PageWidth')?.getAttribute('V'), 0),
        h: parseNum(findCell(kid(m, 'PageSheet'), 'PageHeight')?.getAttribute('V'), 0),
      });
    }
  }

  /* ---------- şekil ağacı ---------- */
  buildTree(page) {
    const root = page.dom.documentElement;
    const shapes = kid(root, 'Shapes');
    const map = new Map();
    const make = (el, parent) => {
      const n = new Node(this, page, el, parent);
      map.set(n.id, n);
      const sub = kid(el, 'Shapes');
      if (sub) for (const c of kids(sub, 'Shape')) n.children.push(make(c, n));
      return n;
    };
    const top = shapes ? kids(shapes, 'Shape').map((s) => make(s, null)) : [];
    page.tree = top;
    page.nodeMap = map;
    this.computeMatrices(top, M_ID);
    return top;
  }

  computeMatrices(list, parentM) {
    for (const n of list) {
      n.computeBasics();
      let m = mTranslate(n.pinX, n.pinY);
      if (n.angle) m = mMul(m, mRotate(n.angle));
      if (n.flipX || n.flipY) m = mMul(m, mScale(n.flipX ? -1 : 1, n.flipY ? -1 : 1));
      m = mMul(m, mTranslate(-n.locX, -n.locY));
      n.M = mMul(parentM, m);
      n.parentM = parentM;
      this.computeMatrices(n.children, n.M);
    }
  }

  getConnects(page) {
    const root = page.dom.documentElement;
    const c = kid(root, 'Connects');
    return c ? kids(c, 'Connect') : [];
  }

  pageLayers(page) {
    const out = [];
    if (!page.sheet) return out;
    for (const s of kids(page.sheet, 'Section')) {
      if (s.getAttribute('N') !== 'Layer') continue;
      for (const row of kids(s, 'Row')) {
        const cells = {};
        for (const c of kids(row, 'Cell')) cells[c.getAttribute('N')] = c;
        out.push({
          ix: parseInt(row.getAttribute('IX'), 10),
          name: cells.Name ? cells.Name.getAttribute('V') : ('Katman ' + row.getAttribute('IX')),
          visible: cells.Visible ? parseNum(cells.Visible.getAttribute('V'), 1) !== 0 : true,
          cell: cells.Visible || null,
        });
      }
    }
    return out;
  }

  masterShapeFor(node) {
    const el = node.el;
    const ownMaster = el.getAttribute('Master');
    let mid = ownMaster;
    let p = node.parent;
    while (!mid && p) { mid = p.el.getAttribute('Master'); p = p.parent; }
    if (!mid) return null;
    const m = this.masters.get(mid);
    if (!m) return null;
    const msid = el.getAttribute('MasterShape');
    if (msid) return m.shapeById.get(msid) || null;
    if (ownMaster) return m.top.length === 1 ? m.top[0] : (m.top[0] || null);
    return null;
  }

  isMasterTopRef(node) { return !!node.el.getAttribute('Master'); }

  /* kaynak parçası: sayfa görselleri için rel çözümü */
  relTarget(page, rid) {
    const r = (page.rels || []).find((x) => x.id === rid);
    return r ? r.path : null;
  }

  markDirty(page) { this.dirtyParts.add(page.path); }

  async serialize() {
    const ser = new XMLSerializer();
    for (const part of this.dirtyParts) {
      const dom = this.dom.get(part);
      if (!dom) continue;
      let xml = ser.serializeToString(dom);
      xml = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
      xml = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n' + xml;
      const e = this.byName.get(part);
      e.data = utf8enc.encode(xml);
      e.modified = true;
    }
    return writeZip(this.entries);
  }
}

/* ---------- Şekil düğümü ---------- */
class Node {
  constructor(doc, page, el, parent) {
    this.doc = doc;
    this.page = page;
    this.el = el;
    this.parent = parent;
    this.id = el.getAttribute('ID');
    this.type = el.getAttribute('Type') || 'Shape';
    this.children = [];
    this._evalDepth = 0;
    this._ms = undefined;
  }

  get ms() {
    if (this._ms === undefined) this._ms = this.doc.masterShapeFor(this);
    return this._ms;
  }

  styleId(kind) {
    let v = this.el.getAttribute(kind);
    if (v === null && this.ms) v = this.ms.getAttribute(kind);
    return v === null ? '0' : v;
  }

  /* hücre kaydı: {el, own} ya da null */
  cellEntry(name) {
    const own = findCell(this.el, name);
    if (own && own.getAttribute('F') !== 'Inh') return { el: own, own: true };
    const ms = this.ms;
    if (ms) {
      const c = findCell(ms, name);
      if (c && c.getAttribute('F') !== 'Inh') return { el: c, own: false };
    }
    const kind = LINE_CELLS.has(name) ? 'LineStyle' : FILL_CELLS.has(name) ? 'FillStyle' : TEXT_CELLS.has(name) ? 'TextStyle' : null;
    if (kind) {
      let sid = this.styleId(kind);
      const seen = new Set();
      while (sid !== null && !seen.has(sid)) {
        seen.add(sid);
        const sheet = this.doc.styles.get(sid);
        if (!sheet) break;
        const c = findCell(sheet, name);
        if (c && c.getAttribute('F') !== 'Inh') return { el: c, own: false };
        sid = sheet.getAttribute(kind);
      }
    }
    if (own) return { el: own, own: true };
    return null;
  }

  /* sayısal hücre değeri (mirasta formül, bu şeklin ölçüleriyle) */
  num(name, def) {
    const e = this.cellEntry(name);
    return this.entryNum(e, def);
  }

  entryNum(e, def) {
    if (!e) return def;
    const f = e.el.getAttribute('F');
    const v = e.el.getAttribute('V');
    if (e.own && v !== null && v !== '') return parseNum(v, def);
    if (f && f !== 'Inh' && this._evalDepth < 6) {
      try {
        this._evalDepth++;
        return evalFormula(f, this.formulaCtx());
      } catch (err) {
        // yedek: önbellek değeri
      } finally { this._evalDepth--; }
    }
    return parseNum(v, def);
  }

  str(name, def) {
    const e = this.cellEntry(name);
    if (!e) return def;
    const v = e.el.getAttribute('V');
    return v === null ? def : v;
  }

  formulaCtx() {
    const self = this;
    return {
      ref(name) {
        let m;
        if ((m = /^Sheet\.(\d+)!(.+)$/.exec(name))) {
          const n = self.page.nodeMap && self.page.nodeMap.get(m[1]);
          if (n) return n.num(m[2], NaN) ?? NaN;
          throw new Error('sheet ref');
        }
        if ((m = /^Geometry(\d+)\.([A-Z]+)(\d+)$/.exec(name))) return self.geoRef(parseInt(m[1], 10) - 1, m[3], m[2]);
        if (/^(Controls|User|Prop|Scratch|Connections|Actions|Hyperlink)\./.test(name)) throw new Error('desteklenmeyen ref');
        const v = self.num(name, NaN);
        if (!Number.isFinite(v)) throw new Error('hücre yok: ' + name);
        return v;
      },
    };
  }

  geoRef(sectionIx, rowIx, cellName) {
    const secs = this.sections('Geometry');
    const s = secs.get(String(sectionIx));
    if (!s) throw new Error('geo ref');
    const r = s.rows.get(String(rowIx));
    if (!r) throw new Error('geo row');
    const e = r.cells.get(cellName);
    if (!e) throw new Error('geo cell');
    return this.entryNum(e, NaN);
  }

  /* birleşik bölüm: master üstüne şeklin kendisi */
  sections(name) {
    const out = new Map();
    const take = (el, own) => {
      for (const sec of kids(el, 'Section')) {
        if (sec.getAttribute('N') !== name) continue;
        const ix = sec.getAttribute('IX') || '0';
        if (sec.getAttribute('Del') === '1') { out.delete(ix); continue; }
        let s = out.get(ix);
        if (!s) { s = { ix, cells: new Map(), rows: new Map(), el: sec }; out.set(ix, s); }
        if (own) s.el = sec;
        for (const ch of sec.children) {
          if (ch.localName === 'Cell') s.cells.set(ch.getAttribute('N'), { el: ch, own });
          else if (ch.localName === 'Row') {
            const key = ch.getAttribute('IX') || ch.getAttribute('N');
            if (ch.getAttribute('Del') === '1') { s.rows.delete(key); continue; }
            let r = s.rows.get(key);
            if (!r) { r = { key, t: null, n: ch.getAttribute('N'), cells: new Map(), el: ch }; s.rows.set(key, r); }
            if (own) r.el = ch;
            if (ch.getAttribute('T')) r.t = ch.getAttribute('T');
            for (const c of kids(ch, 'Cell')) r.cells.set(c.getAttribute('N'), { el: c, own });
          }
        }
      }
    };
    if (this.ms) take(this.ms, false);
    take(this.el, true);
    return out;
  }

  sortedRows(sec) {
    const rows = [...sec.rows.values()];
    const numeric = rows.every((r) => /^\d+$/.test(r.key));
    if (numeric) rows.sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10));
    return rows;
  }

  computeBasics() {
    this.w = this.num('Width', 0);
    this.h = this.num('Height', 0);
    this.pinX = this.num('PinX', 0);
    this.pinY = this.num('PinY', 0);
    this.locX = this.num('LocPinX', this.w / 2);
    this.locY = this.num('LocPinY', this.h / 2);
    this.angle = this.num('Angle', 0);
    this.flipX = this.num('FlipX', 0) !== 0;
    this.flipY = this.num('FlipY', 0) !== 0;
    this.oneD = this.num('OneD', 0) !== 0 || (findCell(this.el, 'BeginX') !== null && findCell(this.el, 'EndX') !== null);
  }

  text() {
    let t = kid(this.el, 'Text');
    if (!t && this.ms) t = kid(this.ms, 'Text');
    if (!t) return '';
    let s = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3 || c.nodeType === 4) s += c.nodeValue;
        else if (c.nodeType === 1) {
          const ln = c.localName;
          if (ln === 'cp' || ln === 'pp' || ln === 'tp') continue;
          walk(c);
        }
      }
    };
    walk(t);
    return s.replace(/\r\n?/g, '\n').replace(/\u2028/g, '\n');
  }

  /* kök sayfa koordinatında sınır kutusu (dönmeyi hesaba katar) */
  pageBBox() {
    const pts = [mApply(this.M, 0, 0), mApply(this.M, this.w, 0), mApply(this.M, this.w, this.h), mApply(this.M, 0, this.h)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), pts };
  }
}

function colorOf(doc, v) {
  if (v === null || v === undefined || v === '') return null;
  if (v[0] === '#') {
    if (v.length === 4) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return v.slice(0, 7);
  }
  const n = parseInt(v, 10);
  if (Number.isFinite(n) && n >= 0 && n < doc.colors.length) return doc.colors[n];
  return null;
}

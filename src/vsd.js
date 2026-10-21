/* =====================================================================
   Eski ikili Visio biçimi (.vsd) — yalnızca okuma / görüntüleme.
   Dosya (OLE2 kabı) okunur, çizim modeli çıkarılır ve bellekte bir
   .vsdx paketine çevrilir; sonrası mevcut VSDX görüntüleme hattıdır.
   Desteklenen sürümler: Visio 4-5 (v5), Visio 2000 (v6), Visio 2003+ (v11).
   Biçim bilgisi libvisio (MPL-2.0) kaynağının incelenmesine dayanır;
   kod bu proje için JavaScript'te yeniden yazılmıştır.
   ===================================================================== */
const VSDImport = (() => {
  'use strict';
  const NONE = 0xffffffff;

  class EOS extends Error {}

  /* ---------- bayt okuyucu (sınır aşımında hata, libvisio akışı gibi) ---------- */
  class Rd {
    constructor(u8) {
      this.d = u8;
      this.n = u8.length;
      this.p = 0;
      this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    }
    isEnd() { return this.p >= this.n; }
    tell() { return this.p; }
    seek(abs) { this.p = Math.max(0, Math.min(abs, this.n)); }
    skip(k) { this.seek(this.p + k); }
    rem() { return Math.max(0, this.n - this.p); }
    u8() { if (this.p >= this.n) throw new EOS(); return this.d[this.p++]; }
    u16() { if (this.p + 2 > this.n) throw new EOS(); const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
    s16() { if (this.p + 2 > this.n) throw new EOS(); const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
    u32() { if (this.p + 4 > this.n) throw new EOS(); const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
    s32() { if (this.p + 4 > this.n) throw new EOS(); const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
    f64() { if (this.p + 8 > this.n) throw new EOS(); const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
    bytes(k) {
      const e = Math.min(this.n, this.p + Math.max(0, k));
      const out = this.d.subarray(this.p, e);
      this.p = e;
      return out;
    }
  }

  /* ---------- OLE2 (Compound File) ---------- */
  function cfbOpen(u8) {
    const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (u8.length < 512 || sig.some((b, i) => u8[i] !== b)) throw new Error('OLE2 kapsayıcısı değil');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const ss = 1 << dv.getUint16(0x1e, true);
    const mss = 1 << dv.getUint16(0x20, true);
    const dirStart = dv.getUint32(0x30, true);
    const miniCutoff = dv.getUint32(0x38, true);
    const miniStart = dv.getUint32(0x3c, true);
    let difat = dv.getUint32(0x44, true);
    const numDif = dv.getUint32(0x48, true);
    const secOff = (s) => (s + 1) * ss;
    const valid = (s) => s < 0xfffffffa;
    const fatSecs = [];
    for (let i = 0; i < 109; i++) {
      const s = dv.getUint32(0x4c + 4 * i, true);
      if (valid(s)) fatSecs.push(s);
    }
    for (let k = 0; k < numDif && valid(difat); k++) {
      const o = secOff(difat);
      if (o + ss > u8.length) break;
      for (let i = 0; i < ss / 4 - 1; i++) {
        const s = dv.getUint32(o + 4 * i, true);
        if (valid(s)) fatSecs.push(s);
      }
      difat = dv.getUint32(o + ss - 4, true);
    }
    const fat = [];
    for (const s of fatSecs) {
      const o = secOff(s);
      if (o + ss > u8.length) continue;
      for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(o + 4 * i, true));
    }
    const chain = (start, table) => {
      const out = [];
      let s = start;
      const seen = new Set();
      while (valid(s) && s < table.length && !seen.has(s)) { seen.add(s); out.push(s); s = table[s]; }
      return out;
    };
    const readSectors = (secs) => {
      const out = new Uint8Array(secs.length * ss);
      let o = 0;
      for (const s of secs) {
        const so = secOff(s);
        if (so >= u8.length) break;
        out.set(u8.subarray(so, Math.min(so + ss, u8.length)), o);
        o += ss;
      }
      return out;
    };
    const dir = readSectors(chain(dirStart, fat));
    const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    const entries = [];
    for (let o = 0; o + 128 <= dir.length; o += 128) {
      const nl = ddv.getUint16(o + 0x40, true);
      let name = '';
      for (let i = 0; i + 2 <= Math.max(0, nl - 2); i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
      entries.push({ name, type: dir[o + 0x42], start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
    }
    const root = entries.find((e) => e.type === 5);
    let mini = null, miniFat = null;
    const ensureMini = () => {
      if (mini || !root) return;
      mini = readSectors(chain(root.start, fat)).subarray(0, root.size);
      const mf = readSectors(chain(miniStart, fat));
      const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
      miniFat = [];
      for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mdv.getUint32(i, true));
    };
    const readStream = (e) => {
      if (e.size < miniCutoff) {
        ensureMini();
        if (!mini) return new Uint8Array(0);
        const secs = chain(e.start, miniFat);
        const out = new Uint8Array(secs.length * mss);
        let o = 0;
        for (const s of secs) {
          const so = s * mss;
          if (so >= mini.length) break;
          out.set(mini.subarray(so, Math.min(so + mss, mini.length)), o);
          o += mss;
        }
        return out.subarray(0, e.size);
      }
      return readSectors(chain(e.start, fat)).subarray(0, e.size);
    };
    return { entries, readStream, find: (n) => entries.find((e) => e.type === 2 && e.name === n) };
  }

  /* ---------- sıkıştırma (4096 baytlık kayan pencere) ---------- */
  function lzExpand(src) {
    const out = [];
    const buf = new Uint8Array(4096);
    let pos = 0, off = 0;
    const n = src.length;
    while (off < n) {
      const flag = src[off++];
      if (off > n - 1) break;
      let mask = 1;
      for (let bit = 0; bit < 8 && off < n; bit++) {
        if (flag & mask) {
          const c = src[off++];
          buf[pos & 4095] = c; out.push(c); pos++;
        } else {
          if (off > n - 2) break;
          const a1 = src[off++], a2 = src[off++];
          const len = (a2 & 15) + 3;
          let ptr = ((a2 & 0xf0) << 4) | a1;
          if (ptr > 4078) ptr -= 4078; else ptr += 18;
          for (let j = 0; j < len; j++) {
            const c = buf[(ptr + j) & 4095];
            buf[(pos + j) & 4095] = c; out.push(c);
          }
          pos += len;
        }
        mask <<= 1;
      }
    }
    return Uint8Array.from(out);
  }

  /* akış: size bayt oku, gerekirse aç */
  function innerStream(rd, size, compressed) {
    const raw = rd.bytes(size);
    if (raw.length < 2) return new Rd(new Uint8Array(0));
    return new Rd(compressed ? lzExpand(raw) : raw);
  }

  /* ---------- metin kod sayfaları ---------- */
  const FMT = { ANSI: 0, UTF16: 1, SYMBOL: 2, GREEK: 3, TURKISH: 4, VIETNAMESE: 5, HEBREW: 6, ARABIC: 7, BALTIC: 8, RUSSIAN: 9, THAI: 10, CENTRAL: 11, JAPANESE: 12, KOREAN: 13, ZH_S: 14, ZH_T: 15 };
  const LABELS = {
    [FMT.ANSI]: 'windows-1252', [FMT.SYMBOL]: 'windows-1252', [FMT.GREEK]: 'windows-1253', [FMT.TURKISH]: 'windows-1254',
    [FMT.VIETNAMESE]: 'windows-1258', [FMT.HEBREW]: 'windows-1255', [FMT.ARABIC]: 'windows-1256', [FMT.BALTIC]: 'windows-1257',
    [FMT.RUSSIAN]: 'windows-1251', [FMT.THAI]: 'windows-874', [FMT.CENTRAL]: 'windows-1250', [FMT.JAPANESE]: 'shift_jis',
    [FMT.KOREAN]: 'euc-kr', [FMT.ZH_S]: 'gbk', [FMT.ZH_T]: 'big5',
  };
  const decoders = new Map();
  function decodeBytes(bytes, fmt) {
    if (!bytes || !bytes.length) return '';
    if (fmt === FMT.UTF16) return new TextDecoder('utf-16le').decode(bytes);
    let dec = decoders.get(fmt);
    if (!dec) {
      try { dec = new TextDecoder(LABELS[fmt] || 'windows-1252'); } catch (e) { dec = new TextDecoder('windows-1252'); }
      decoders.set(fmt, dec);
    }
    return dec.decode(bytes);
  }
  function formatFromCodePage(cp) {
    switch (cp) {
      case 0x02: return FMT.SYMBOL;
      case 0xa1: return FMT.GREEK;
      case 0xa2: return FMT.TURKISH;
      case 0xa3: return FMT.VIETNAMESE;
      case 0xb1: return FMT.HEBREW;
      case 0xb2: return FMT.ARABIC;
      case 0xba: return FMT.BALTIC;
      case 0xcc: return FMT.RUSSIAN;
      case 0xde: return FMT.THAI;
      case 0xee: return FMT.CENTRAL;
      case 0x80: return FMT.JAPANESE;
      case 0x81: return FMT.KOREAN;
      case 0x86: return FMT.ZH_S;
      case 0x88: return FMT.ZH_T;
      default: return FMT.ANSI;
    }
  }

  /* ---------- yardımcı kapsayıcılar ---------- */
  class IdList {
    constructor() { this.el = new Map(); this.order = []; }
    clear() { this.el.clear(); this.order = []; }
    add(id, val) { if (!this.el.has(id)) this.el.set(id, val); }
    set(id, val) { this.el.set(id, val); }
    get size() { return this.el.size; }
    ordered() {
      if (this.el.size === 0) return [];
      const out = [];
      if (this.order.length) { for (const i of this.order) if (this.el.has(i)) out.push(this.el.get(i)); }
      else for (const k of [...this.el.keys()].sort((a, b) => a - b)) out.push(this.el.get(k));
      return out;
    }
  }

  function newShape() {
    return {
      id: NONE, parent: 0, masterPage: NONE, masterShape: NONE,
      lineStyleId: NONE, fillStyleId: NONE, textStyleId: NONE,
      xform: null, txtxform: null,
      geoms: [],
      line: null, fill: null, textBlock: null, charStyle: null, paraStyle: null,
      charList: new IdList(), paraList: new IdList(), fieldList: new IdList(), shapeList: new IdList(),
      text: null, names: new Map(), foreign: null, nurbs: new Map(), poly: new Map(),
      hideText: false, layerMem: null, type: 0, level: 0,
    };
  }
  function newGeomList() { return { order: [], el: new Map(), noFill: false, noLine: false, noShow: false, hasGeometry: false }; }
  const geomEmpty = (g) => g.el.size === 0;

  const rgba = (rd) => { const r = rd.u8(), g = rd.u8(), b = rd.u8(), a = rd.u8(); return { r, g, b, a }; };
  const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
  const hexColor = (c) => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);

  /* ===================================================================
     Ayrıştırıcı (libvisio VSDParser / VSD6Parser / VSD5Parser karşılığı)
     =================================================================== */
  const T = {
    FOREIGN_DATA: 0x0c, OLE_LIST: 0x0d, TEXT: 0x0e, TRAILER: 0x14, PAGE: 0x15, COLORS: 0x16, FONT_LIST: 0x18, FONT_IX: 0x19,
    STYLES: 0x1a, STENCILS: 0x1d, STENCIL_PAGE: 0x1e, OLE_DATA: 0x1f, PAGES: 0x27, NAME_LIST: 0x2c, NAME: 0x2d,
    NAME_LIST2: 0x32, NAME2: 0x33, NAMEIDX123: 0x34, PAGE_SHEET: 0x46, GROUP: 0x47, SHAPE: 0x48, GUIDE: 0x4d, FOREIGN: 0x4e,
    STYLE_SHEET: 0x4a, SHAPE_LIST: 0x65, FIELD_LIST: 0x66, PROP_LIST: 0x68, CHAR_LIST: 0x69, PARA_LIST: 0x6a, TABS_LIST: 0x6b,
    GEOM_LIST: 0x6c, LAYER_LIST: 0x6f, SHAPE_ID: 0x83, LINE: 0x85, FILL: 0x86, TEXT_BLOCK: 0x87, TABS_1: 0x88, GEOMETRY: 0x89,
    MOVE_TO: 0x8a, LINE_TO: 0x8b, ARC_TO: 0x8c, INFINITE_LINE: 0x8d, ELLIPSE: 0x8f, ELLIPTICAL_ARC_TO: 0x90, PAGE_PROPS: 0x92,
    CHAR_IX: 0x94, PARA_IX: 0x95, TABS_2: 0x96, TABS_3: 0x97, FOREIGN_TYPE: 0x98, XFORM: 0x9b, TXT_XFORM: 0x9c, XFORM_1D: 0x9d,
    TEXT_FIELD: 0xa1, MISC: 0xa4, SPLINE_START: 0xa5, SPLINE_KNOT: 0xa6, LAYER_MEM: 0xa7, LAYER: 0xa8, POLYLINE_TO: 0xc1,
    NURBS_TO: 0xc3, NAMEIDX: 0xc9, SHAPE_DATA: 0xd1, FONTFACE: 0xd7, FONTFACES: 0xd8,
  };

  class Parser {
    constructor(doc, ver) {
      this.in = new Rd(doc);
      this.ver = ver;
      this.h = { chunkType: 0, id: 0, list: 0, dataLength: 0, level: 0, unknown: 0, trailer: 0 };
      this.curLevel = 0;
      this.curShapeLevel = 0;
      this.isShapeStarted = false;
      this.isStencilStarted = false;
      this.isInStyles = false;
      this.curShapeID = NONE;
      this.shape = newShape();
      this.geom = null;
      this.geomCount = 0;
      this.colours = [];
      this.fonts = new Map();
      this.names = new Map();          // NameList2: id → {bytes, fmt}
      this.namesMapMap = new Map();    // düzey → (öğe kimliği → ad)
      this.pageName = null;
      this.isBackgroundPage = false;
      this.pageShapeList = new IdList();
      this.pages = [];
      this.curPage = null;
      this.stencils = new Map();
      this.curStencil = null;
      this.styles = new Map();
      this.curStyle = null;
      this.issues = [];
    }

    warn(t) { if (!this.issues.includes(t)) this.issues.push(t); }
    uint(rd) { return this.ver === 5 ? (rd.s16() >>> 0) : rd.u32(); }
    colourFromIndex(i) { return i < this.colours.length ? this.colours[i] : { r: 0, g: 0, b: 0, a: 0 }; }

    /* ---- işaretçiler ---- */
    readPointer(rd) {
      const p = {};
      if (this.ver === 5) {
        p.type = rd.u16() & 0xff; p.format = rd.u16() & 0xff; rd.skip(4); p.offset = rd.u32(); p.length = rd.u32();
      } else {
        p.type = rd.u32(); rd.skip(4); p.offset = rd.u32(); p.length = rd.u32(); p.format = rd.u16();
      }
      return p;
    }

    readPointerInfo(rd, ptrType, shift) {
      if (this.ver === 5) {
        switch (ptrType) {
          case T.TRAILER: rd.seek(shift + 0x82); break;
          case T.PAGE: rd.seek(shift + 0x42); break;
          case T.FONT_LIST: rd.seek(shift + 0x2e); break;
          case T.STYLES: rd.seek(shift + 0x12); break;
          case T.STENCILS: case T.FOREIGN: rd.seek(shift + 0x1e); break;
          case T.STENCIL_PAGE: rd.seek(shift + 0x36); break;
          default: rd.seek(shift + (ptrType > 0x45 ? 0x1e : 0xa)); break;
        }
        return { listSize: 0, count: rd.s16() };
      }
      rd.seek(shift);
      const off = rd.u32();
      rd.seek(off + shift - 4);
      const listSize = rd.u32();
      const count = rd.s32();
      rd.skip(4);
      return { listSize, count };
    }

    /* ---- parça başlığı ---- */
    getChunkHeader(rd) {
      let c = 0;
      while (!rd.isEnd() && !c) c = rd.u8();
      if (rd.isEnd()) return false;
      rd.skip(-1);
      const h = this.h;
      if (this.ver === 5) {
        h.chunkType = this.uint(rd); h.id = this.uint(rd); h.level = rd.u8(); h.unknown = rd.u8();
        h.trailer = 0; h.list = this.uint(rd); h.dataLength = rd.u32();
        return true;
      }
      h.chunkType = rd.u32(); h.id = rd.u32(); h.list = rd.u32();
      h.trailer = 0;
      if (this.ver === 11) {
        if (h.list !== 0 || [0x71, 0x70, 0x6b, 0x6a, 0x69, 0x66, 0x65, 0x2c].includes(h.chunkType)) h.trailer += 8;
      } else if (h.list !== 0 || [0x76, 0x73, 0x72, 0x71, 0x70, 0x6f, 0x6e, 0x6d, 0x6c, 0x6b, 0x6a, 0x69, 0x68, 0x67, 0x66, 0x65, 0x64, 0x2c, 0xd].includes(h.chunkType)) h.trailer += 8;
      h.dataLength = rd.u32(); h.level = rd.u16(); h.unknown = rd.u8();
      if (this.ver === 11) {
        if (h.list !== 0 || (h.level === 2 && h.unknown === 0x55) || (h.level === 2 && h.unknown === 0x54 && h.chunkType === 0xaa) ||
            (h.level === 3 && h.unknown !== 0x50 && h.unknown !== 0x54)) h.trailer += 4;
        for (const tc of [0x64, 0x65, 0x66, 0x69, 0x6a, 0x6b, 0x6f, 0x71, 0x92, 0xa9, 0xb4, 0xb6, 0xb9, 0xc7]) {
          if (h.chunkType === tc && h.trailer !== 12 && h.trailer !== 4) { h.trailer += 4; break; }
        }
        if (h.chunkType === 0x1f || h.chunkType === 0xc9 || h.chunkType === 0x2d || h.chunkType === 0xd1) h.trailer = 0;
      } else if (h.chunkType === 0x1f || h.chunkType === 0xc9) h.trailer = 0;
      return true;
    }

    /* ---- ana giriş ---- */
    parseMain() {
      const rd = this.in;
      rd.seek(0x24);
      const tp = this.readPointer(rd);
      const compressed = (tp.format & 2) === 2;
      const shift = compressed ? 4 : 0;
      rd.seek(tp.offset);
      const trailer = innerStream(rd, tp.length, compressed);
      try {
        this.handleStreams(trailer, T.TRAILER, shift, 0, new Set());
      } catch (e) {
        if (!(e instanceof EOS)) throw e;
        this.warn('Dosya sonu beklenmedik biçimde göründü; okunabilen kısım gösteriliyor.');
      }
      this.levelChange(0);
    }

    handleStreams(rd, ptrType, shift, level, visited) {
      const order = [];
      const ptrs = new Map(), faces = new Map(), nameList = new Map(), nameIdx = new Map();
      try {
        const info = this.readPointerInfo(rd, ptrType, shift);
        let listSize = info.listSize;
        for (let i = 0; i < info.count; i++) {
          const ptr = this.readPointer(rd);
          if (ptr.type === 0) continue;
          if (ptr.type === T.FONTFACES) faces.set(i, ptr);
          else if (ptr.type === T.NAME_LIST2) nameList.set(i, ptr);
          else if (ptr.type === T.NAMEIDX || ptr.type === T.NAMEIDX123) nameIdx.set(i, ptr);
          else ptrs.set(i, ptr);
        }
        if (listSize <= 1) listSize = 0;
        while (listSize--) order.push(rd.u32());
      } catch (e) {
        if (!(e instanceof EOS)) throw e;
        order.length = 0; ptrs.clear(); faces.clear(); nameList.clear();
      }
      for (const [i, p] of nameList) this.handleStream(p, i, level + 1, visited);
      for (const [i, p] of nameIdx) this.handleStream(p, i, level + 1, visited);
      for (const [i, p] of faces) this.handleStream(p, i, level + 1, visited);
      for (const j of order) {
        const p = ptrs.get(j);
        if (p) { this.handleStream(p, j, level + 1, visited); ptrs.delete(j); }
      }
      for (const [i, p] of ptrs) this.handleStream(p, i, level + 1, visited);
    }

    handleStream(ptr, idx, level, visited) {
      const h = this.h;
      h.level = level; h.id = idx; h.chunkType = ptr.type;
      this.levelChange(level);
      const compressed = (ptr.format & 2) === 2;
      this.in.seek(ptr.offset);
      const sub = innerStream(this.in, ptr.length, compressed);
      h.dataLength = sub.n;
      const shift = compressed ? 4 : 0;
      switch (ptr.type) {
        case T.STYLES: this.isInStyles = true; break;
        case T.PAGE:
          this.isBackgroundPage = !(ptr.format & 1);
          this.pageName = this.nameFromId(idx, level + 1);
          this.startPage(idx);
          break;
        case T.STENCILS: this.isStencilStarted = true; break;
        case T.STENCIL_PAGE: this.curStencil = { shapes: new Map(), id: idx }; break;
        case T.GROUP: case T.SHAPE: case T.FOREIGN: this.curShapeID = idx; break;
        case T.OLE_LIST:
          if (!this.shape.foreign) this.shape.foreign = newForeign();
          this.shape.foreign.dataId = idx;
          break;
        default: break;
      }
      const f = ptr.format >> 4;
      if (f === 4 || f === 5 || f === 0) {
        this.handleBlob(sub, shift, level + 1);
        if (f === 5 && ptr.type !== T.COLORS) {
          if (!visited.has(ptr.offset)) { visited.add(ptr.offset); this.handleStreams(sub, ptr.type, shift, level + 1, visited); }
        }
      } else if (f === 0xd || f === 0xc || f === 0x8) {
        this.handleChunks(sub, level + 1);
      }
      switch (ptr.type) {
        case T.STYLES: this.levelChange(0); this.isInStyles = false; break;
        case T.PAGE: this.levelChange(0); this.endPage(); break;
        case T.PAGES: this.levelChange(0); break;
        case T.STENCILS: this.levelChange(0); this.isStencilStarted = false; break;
        case T.STENCIL_PAGE:
          this.levelChange(0);
          if (this.curStencil) { this.stencils.set(idx, this.curStencil); this.curStencil = null; }
          break;
        case T.GROUP: case T.SHAPE: case T.FOREIGN:
          if (this.isStencilStarted) {
            this.levelChange(0);
            if (this.curStencil) this.curStencil.shapes.set(this.shape.id, this.shape);
          }
          break;
        default: break;
      }
    }

    handleBlob(rd, shift, level) {
      try {
        this.h.level = level;
        rd.seek(shift);
        this.h.dataLength -= shift;
        this.levelChange(level);
        this.handleChunk(rd);
      } catch (e) {
        if (!(e instanceof EOS)) throw e;
      }
    }

    handleChunks(rd, level) {
      while (!rd.isEnd()) {
        try {
          if (!this.getChunkHeader(rd)) return;
          const h = this.h;
          h.level += level;
          const endPos = h.dataLength + h.trailer + rd.tell();
          this.levelChange(h.level);
          try { this.handleChunk(rd); } catch (e) { if (!(e instanceof EOS)) throw e; }
          rd.seek(endPos);
        } catch (e) {
          if (e instanceof EOS) return;
          throw e;
        }
      }
    }

    /* v5: liste parçasının içindeki küçük kayıtlar */
    handleChunkRecords(rd) {
      const h = this.h;
      const start = rd.tell();
      const end = start + h.dataLength;
      rd.seek(end - 4);
      const numRecords = rd.u16();
      const headerPos = end - 4 * (numRecords + 1);
      if (headerPos <= start) return;
      let endOffset = rd.u16();
      if (endOffset > headerPos - start) endOffset = headerPos - start;
      const records = new Map();
      rd.seek(headerPos);
      for (let i = 0; i < numRecords; i++) {
        const rec = { chunkType: rd.u16(), dataLength: 0, level: h.level + 1, id: 0, list: 0, trailer: 0, unknown: 0 };
        const offset = rd.u16();
        let tmpStart = offset;
        while (tmpStart % 4) tmpStart++;
        if (tmpStart < endOffset) {
          rec.dataLength = endOffset - tmpStart;
          records.set(tmpStart, rec);
          endOffset = offset;
        }
      }
      let i = 0;
      for (const k of [...records.keys()].sort((a, b) => a - b)) {
        this.h = records.get(k);
        this.h.id = i++;
        rd.seek(start + k);
        try { this.handleChunk(rd); } catch (e) { if (!(e instanceof EOS)) throw e; }
      }
    }

    /* ---- düzey değişimi ve şeklin kapatılması ---- */
    levelChange(level) {
      if (level === this.curLevel) return;
      if (level <= this.curShapeLevel + 1) {
        if (this.shape.geoms.length && this.geom && geomEmpty(this.geom)) { this.shape.geoms.pop(); this.geomCount = Math.max(0, this.geomCount - 1); this.geom = null; }
        this.geom = null;
        if (this.pageShapeList.size) { this.pageOrder = this.pageShapeList.ordered(); }
        this.pageShapeList.clear();
      }
      if (level <= this.curShapeLevel) {
        if (!this.isStencilStarted) { this.flushShape(); this.shape = newShape(); this.geom = null; }
        this.isShapeStarted = false;
        this.curShapeLevel = 0;
      }
      this.curLevel = level;
    }

    flushShape() {
      if (!this.isShapeStarted) return;
      const s = this.shape;
      s.childOrder = s.shapeList.ordered();
      if (this.curPage) this.curPage.shapes.push(s);
    }

    startPage(idx) {
      this.curPage = {
        id: idx, background: this.isBackgroundPage, backId: NONE, name: this.pageName,
        w: 0, h: 0, scale: 1, shapes: [], order: [], layers: [], props: null,
      };
      this.pageOrder = [];
      this.pageShapeList.clear();
    }

    endPage() {
      if (!this.curPage) return;
      this.curPage.order = this.pageOrder || [];
      this.pages.push(this.curPage);
      this.curPage = null;
    }

    nameFromId(id, level) {
      const m = this.namesMapMap.get(level);
      return m && m.has(id) ? m.get(id) : null;
    }

    /* ---- parça dağıtımı ---- */
    handleChunk(rd) {
      switch (this.h.chunkType) {
        case T.GROUP: case T.SHAPE: case T.FOREIGN: this.readShape(rd); break;
        case T.XFORM: this.readXForm(rd); break;
        case T.TXT_XFORM: this.readTxtXForm(rd); break;
        case T.SHAPE_LIST: this.ver === 5 ? this.readList(rd) : this.readShapeList(rd); break;
        case T.SHAPE_ID: this.readShapeId(rd); break;
        case T.LINE: this.readLine(rd); break;
        case T.PROP_LIST: if (this.ver === 5) this.readList(rd); break;
        case T.FILL: this.readFill(rd); break;
        case T.GEOM_LIST: this.readGeomList(rd); break;
        case T.GEOMETRY: this.readGeometry(rd); break;
        case T.MOVE_TO: this.addGeom('MoveTo', { x: this.skipD(rd), y: this.skipD(rd) }); break;
        case T.LINE_TO: this.addGeom('LineTo', { x: this.skipD(rd), y: this.skipD(rd) }); break;
        case T.ARC_TO: this.addGeom('ArcTo', { x: this.skipD(rd), y: this.skipD(rd), a: this.skipD(rd) }); break;
        case T.ELLIPSE: this.addGeom('Ellipse', { x: this.skipD(rd), y: this.skipD(rd), a: this.skipD(rd), b: this.skipD(rd), c: this.skipD(rd), d: this.skipD(rd) }); break;
        case T.ELLIPTICAL_ARC_TO: this.addGeom('EllipticalArcTo', { x: this.skipD(rd), y: this.skipD(rd), a: this.skipD(rd), b: this.skipD(rd), c: this.skipD(rd), d: this.skipD(rd) }); break;
        case T.NURBS_TO: this.readNURBSTo(rd); break;
        case T.POLYLINE_TO: this.readPolylineTo(rd); break;
        case T.SPLINE_START: { const x = this.skipD(rd), y = this.skipD(rd); this.addGeom('SplineStart', { x, y }); break; }
        case T.SPLINE_KNOT: { const x = this.skipD(rd), y = this.skipD(rd); this.addGeom('SplineKnot', { x, y }); break; }
        case T.SHAPE_DATA: this.readShapeData(rd); break;
        case T.FOREIGN_TYPE: this.readForeignType(rd); break;
        case T.FOREIGN_DATA: this.readForeignData(rd); break;
        case T.OLE_DATA: this.readOLEData(rd); break;
        case T.NAMEIDX: this.readNameIDX(rd); break;
        case T.NAMEIDX123: this.readNameIDX123(rd); break;
        case T.PAGE_PROPS: this.readPageProps(rd); break;
        case T.CHAR_LIST: this.ver === 5 ? this.readList(rd) : this.readOrderList(rd, this.shape.charList); break;
        case T.PARA_LIST: this.ver === 5 ? this.readList(rd) : this.readOrderList(rd, this.shape.paraList); break;
        case T.TEXT: this.readText(rd); break;
        case T.CHAR_IX: this.readCharIX(rd); break;
        case T.PARA_IX: this.readParaIX(rd); break;
        case T.TEXT_BLOCK: this.readTextBlock(rd); break;
        case T.FONT_IX: this.readFontIX(rd); break;
        case T.PAGE: this.readPage(rd); break;
        case T.NAME_LIST: this.shape.names.clear(); break;
        case T.NAME_LIST2: if (this.ver === 5) this.readList(rd); this.names.clear(); break;
        case T.NAME: this.readName(rd); break;
        case T.NAME2: this.readName2(rd); break;
        case T.FIELD_LIST: this.ver === 5 ? this.readList(rd) : this.readOrderList(rd, this.shape.fieldList, true); break;
        case T.TEXT_FIELD: this.readTextField(rd); break;
        case T.STYLE_SHEET: this.readStyleSheet(rd); break;
        case T.PAGE_SHEET: this.curShapeLevel = this.h.level; break;
        case T.COLORS: this.readColours(rd); break;
        case T.FONTFACE: this.readFont(rd); break;
        case T.MISC: this.readMisc(rd); break;
        case T.LAYER: this.readLayer(rd); break;
        case T.LAYER_MEM: this.readLayerMem(rd); break;
        case T.TABS_LIST: if (this.ver === 5) this.readList(rd); break;
        default: break;
      }
    }

    skipD(rd) { rd.skip(1); return rd.f64(); }

    /* ---- listeler ---- */
    readList(rd) { this.handleChunkRecords(rd); }

    readOrderList(rd, list, isField) {
      if (this.h.trailer) {
        const sub = rd.u32(), childLen0 = rd.u32();
        rd.skip(sub);
        const childLen = Math.min(childLen0, rd.rem());
        const order = [];
        for (let i = 0; i < Math.floor(childLen / 4); i++) order.push(rd.u32());
        if (isField) { const seen = new Set(); list.order = order.filter((i) => !seen.has(i) && seen.add(i)); }
        else list.order = order;
      }
    }

    readShapeList(rd) {
      if (this.h.trailer) {
        const sub = rd.u32(), childLen0 = rd.u32();
        rd.skip(sub);
        const childLen = Math.min(childLen0, rd.rem());
        const order = [];
        for (let i = 0; i < Math.floor(childLen / 4); i++) order.push(rd.u32());
        (this.isShapeStarted ? this.shape.shapeList : this.pageShapeList).order = order;
      }
    }

    readShapeId(rd) {
      const sid = this.uint(rd);
      (this.isShapeStarted ? this.shape.shapeList : this.pageShapeList).set(this.h.id, sid);
    }

    readGeomList(rd) {
      if (this.shape.geoms.length && this.geom && geomEmpty(this.geom)) { this.shape.geoms.pop(); this.geomCount = Math.max(0, this.geomCount - 1); }
      this.geom = newGeomList();
      this.shape.geoms.push(this.geom);
      this.geomCount++;
      if (this.ver === 5) { this.handleChunkRecords(rd); return; }
      if (this.h.trailer) {
        const sub = rd.u32(), childLen0 = rd.u32();
        rd.skip(sub);
        const childLen = Math.min(childLen0, rd.rem());
        const order = [], seen = new Set();
        for (let i = 0; i < Math.floor(childLen / 4); i++) { const v = rd.u32(); if (!seen.has(v)) { seen.add(v); order.push(v); } }
        this.geom.order = order;
      }
    }

    /* ---- şekil ---- */
    readShape(rd) {
      this.geomCount = 0;
      this.isShapeStarted = true;
      this.pageShapeList.clear();
      const h = this.h;
      if (h.id !== NONE) this.curShapeID = h.id;
      this.curShapeLevel = h.level;
      const s = newShape();
      s.type = h.chunkType;
      s.level = h.level;
      try {
        if (this.ver === 5) {
          rd.skip(2); s.parent = this.uint(rd); rd.skip(2); s.masterPage = this.uint(rd); s.masterShape = this.uint(rd);
          s.lineStyleId = this.uint(rd); s.fillStyleId = this.uint(rd); s.textStyleId = this.uint(rd);
        } else {
          rd.skip(10); s.parent = rd.u32(); rd.skip(4); s.masterPage = rd.u32(); rd.skip(4); s.masterShape = rd.u32();
          rd.skip(4); s.fillStyleId = rd.u32(); rd.skip(4); s.lineStyleId = rd.u32(); rd.skip(4); s.textStyleId = rd.u32();
        }
      } catch (e) { if (!(e instanceof EOS)) throw e; }
      s.id = this.curShapeID;
      this.curShapeID = NONE;
      this.shape = s;
      this.geom = null;
    }

    readXForm(rd) {
      const x = {};
      x.pinX = this.skipD(rd); x.pinY = this.skipD(rd); x.width = this.skipD(rd); x.height = this.skipD(rd);
      x.pinLocX = this.skipD(rd); x.pinLocY = this.skipD(rd); x.angle = this.skipD(rd);
      x.flipX = !!rd.u8(); x.flipY = !!rd.u8();
      this.shape.xform = x;
    }

    readTxtXForm(rd) {
      const x = {};
      x.pinX = this.skipD(rd); x.pinY = this.skipD(rd); x.width = this.skipD(rd); x.height = this.skipD(rd);
      x.pinLocX = this.skipD(rd); x.pinLocY = this.skipD(rd); x.angle = this.skipD(rd);
      this.shape.txtxform = x;
    }

    /* ---- geometri ---- */
    readGeometry(rd) {
      const f = rd.u8();
      if (this.geom) {
        this.geom.noFill = !!(f & 1); this.geom.noLine = !!(f & 2); this.geom.noShow = !!(f & 4); this.geom.hasGeometry = true;
        this.geom.el.set(this.h.id, { t: 'Geometry' });
      }
    }

    addGeom(t, o) {
      if (!this.geom) return;
      this.geom.el.set(this.h.id, Object.assign({ t }, o));
    }

    readNURBSTo(rd) {
      const x = this.skipD(rd), y = this.skipD(rd);
      const knot = rd.f64(), weight = rd.f64(), knotPrev = rd.f64(), weightPrev = rd.f64();
      rd.skip(1);
      const useData = rd.u8();
      if (useData === 0x8a) {
        rd.skip(3);
        const dataId = rd.u32();
        this.addGeom('NURBSTo', { x, y, knot, knotPrev, weight, weightPrev, dataId });
        return;
      }
      const knots = [knotPrev], ctrl = [], weights = [weightPrev];
      rd.skip(9);
      let bytesRead = 0x50, cellRef = 0, length = 0, inputPos = rd.tell();
      while (cellRef !== 6 && !rd.isEnd() && this.h.dataLength - bytesRead > 4) {
        length = rd.u32(); rd.skip(1); cellRef = rd.u8();
        if (cellRef < 6) rd.skip(length - 6);
        bytesRead += rd.tell() - inputPos; inputPos = rd.tell();
      }
      if (rd.isEnd()) return;
      if (cellRef === 6) {
        let xType = 1, yType = 1, degree = 3, lastKnot = 0, reps = 0, valueType = 0;
        const paramType = rd.u8();
        if (paramType === 0x8a) {
          lastKnot = rd.f64(); degree = rd.u16(); xType = rd.u8(); yType = rd.u8(); reps = rd.u32();
        } else {
          valueType = paramType;
          lastKnot = valueType === 0x20 ? rd.f64() : rd.u16();
          rd.skip(1); degree = rd.u16(); rd.skip(1); xType = rd.u16(); rd.skip(1); yType = rd.u16();
        }
        let br = rd.tell() - inputPos;
        let flag = 0;
        if (paramType !== 0x8a) flag = rd.u8();
        while ((paramType === 0x8a ? reps > 0 : flag !== 0x81) && br < length) {
          inputPos = rd.tell();
          let k = 0, w = 0, cx = 0, cy = 0;
          if (paramType === 0x8a) { cx = rd.f64(); cy = rd.f64(); k = rd.f64(); w = rd.f64(); }
          else {
            valueType = flag; cx = valueType === 0x20 ? rd.f64() : rd.u16();
            valueType = rd.u8(); cy = valueType === 0x20 ? rd.f64() : rd.u16();
            valueType = rd.u8(); if (valueType === 0x20) k = rd.f64(); else if (valueType === 0x62) k = rd.u16();
            valueType = rd.u8(); if (valueType === 0x20) w = rd.f64(); else if (valueType === 0x62) w = rd.u16();
          }
          ctrl.push([cx, cy]); knots.push(k); weights.push(w);
          if (paramType !== 0x8a) flag = rd.u8(); else reps--;
          br += rd.tell() - inputPos;
        }
        knots.push(knot); knots.push(lastKnot); weights.push(weight);
        this.addGeom('NURBSTo', { x, y, xType, yType, degree, ctrl, knots, weights });
      } else {
        this.addGeom('LineTo', { x, y });
      }
    }

    readPolylineTo(rd) {
      const x = this.skipD(rd), y = this.skipD(rd);
      rd.skip(1);
      const useData = rd.u8();
      if (useData === 0x8b) {
        rd.skip(3);
        this.addGeom('PolylineTo', { x, y, dataId: rd.u32() });
        return;
      }
      rd.skip(9);
      let bytesRead = 0x30, cellRef = 0, length = 0, inputPos = rd.tell();
      while (cellRef !== 2 && !rd.isEnd() && this.h.dataLength - bytesRead > 4) {
        length = rd.u32();
        if (!length) break;
        rd.skip(1); cellRef = rd.u8();
        if (cellRef < 2) rd.skip(length - 6);
        bytesRead += rd.tell() - inputPos; inputPos = rd.tell();
      }
      if (rd.isEnd()) return;
      if (cellRef === 2) {
        let blockBytes = 6;
        inputPos = rd.tell();
        rd.skip(1); const xType = rd.u16(); rd.skip(1); const yType = rd.u16();
        let flag = rd.u8();
        blockBytes += rd.tell() - inputPos;
        const pts = [];
        while (flag !== 0x81 && blockBytes < length) {
          inputPos = rd.tell();
          let vt = flag, px, py;
          px = vt === 0x20 ? rd.f64() : rd.u16();
          vt = rd.u8(); py = vt === 0x20 ? rd.f64() : rd.u16();
          pts.push([px, py]);
          flag = rd.u8();
          blockBytes += rd.tell() - inputPos;
        }
        this.addGeom('PolylineTo', { x, y, xType, yType, pts });
      } else this.addGeom('LineTo', { x, y });
    }

    readShapeData(rd) {
      const dt = rd.u8();
      rd.skip(15);
      if (dt === 0x80) {
        const xType = rd.u8(), yType = rd.u8();
        let n = rd.u32();
        n = Math.min(n, Math.floor(rd.rem() / 16));
        const pts = [];
        for (let i = 0; i < n; i++) pts.push([rd.f64(), rd.f64()]);
        this.shape.poly.set(this.h.id, { xType, yType, pts });
      } else if (dt === 0x82) {
        const lastKnot = rd.f64(), degree = rd.u16(), xType = rd.u8(), yType = rd.u8();
        let n = rd.u32();
        n = Math.min(n, Math.floor(rd.rem() / 32));
        const ctrl = [], knots = [], weights = [];
        for (let i = 0; i < n; i++) { const cx = rd.f64(), cy = rd.f64(), k = rd.f64(), w = rd.f64(); ctrl.push([cx, cy]); knots.push(k); weights.push(w); }
        this.shape.nurbs.set(this.h.id, { lastKnot, degree, xType, yType, ctrl, knots, weights });
      }
    }

    /* ---- yabancı veri (resim) ---- */
    readForeignType(rd) {
      const ox = this.skipD(rd), oy = this.skipD(rd), w = this.skipD(rd), hh = this.skipD(rd);
      let type = rd.u16();
      const mapMode = rd.u16();
      if (mapMode === 0x8) type = 4;
      rd.skip(9);
      const format = rd.u32();
      const f = this.shape.foreign || (this.shape.foreign = newForeign());
      Object.assign(f, { typeId: this.h.id, type, format, offsetX: ox, offsetY: oy, width: w, height: hh });
    }

    readForeignData(rd) {
      const data = rd.bytes(this.h.dataLength);
      if (data.length !== this.h.dataLength) return;
      const f = this.shape.foreign || (this.shape.foreign = newForeign());
      f.dataId = this.h.id; f.data = data.slice();
    }

    readOLEData(rd) {
      const data = rd.bytes(this.h.dataLength);
      if (data.length !== this.h.dataLength) return;
      const f = this.shape.foreign || (this.shape.foreign = newForeign());
      const merged = new Uint8Array((f.data ? f.data.length : 0) + data.length);
      if (f.data) merged.set(f.data, 0);
      merged.set(data, f.data ? f.data.length : 0);
      f.data = merged;
    }

    /* ---- adlar ---- */
    readNameIDX(rd) {
      const names = new Map();
      if (this.ver === 5) {
        let n = rd.u16(); n = Math.min(n, Math.floor(rd.rem() / 4));
        for (let i = 0; i < n; i++) { const nameId = rd.u16(), elemId = rd.u16(); if (this.names.has(nameId)) names.set(elemId, this.names.get(nameId)); }
      } else {
        let n = rd.u32(); n = Math.min(n, Math.floor(rd.rem() / 13));
        for (let i = 0; i < n; i++) {
          const nameId = rd.u32(); rd.u32(); const elemId = rd.u32(); rd.skip(1);
          if (this.names.has(nameId)) names.set(elemId, this.names.get(nameId));
        }
      }
      this.namesMapMap.set(this.h.level, names);
    }

    readNameIDX123(rd) {
      const names = new Map();
      const end = rd.tell() + this.h.dataLength;
      while (!rd.isEnd() && rd.tell() < end) {
        const nameId = this.uint(rd), elemId = this.uint(rd);
        if (this.names.has(nameId)) names.set(elemId, this.names.get(nameId));
      }
      this.namesMapMap.set(this.h.level, names);
    }

    readName(rd) {
      const b = rd.bytes(this.h.dataLength);
      if (b.length) this.shape.names.set(this.h.id, { bytes: b.slice(), fmt: this.ver === 11 ? FMT.UTF16 : FMT.ANSI });
    }

    readName2(rd) {
      if (this.ver === 11) {
        rd.skip(4);
        const out = [];
        for (;;) { const c = rd.u16(); if (!c) break; out.push(c & 0xff, (c >> 8) & 0xff); }
        this.names.set(this.h.id, { bytes: Uint8Array.from(out), fmt: FMT.UTF16 });
      } else {
        rd.skip(this.ver === 5 ? 2 : 4);
        const out = [];
        for (;;) { const c = rd.u8(); if (!c) break; out.push(c); }
        this.names.set(this.h.id, { bytes: Uint8Array.from(out), fmt: FMT.ANSI });
      }
    }

    /* ---- sayfa ---- */
    readPage(rd) {
      if (this.ver !== 5) rd.skip(8);
      const bg = this.uint(rd);
      if (this.curPage) this.curPage.backId = bg;
    }

    readPageProps(rd) {
      rd.skip(1);
      const w = Math.max(rd.f64(), 0);
      rd.skip(1);
      const h = Math.max(rd.f64(), 0);
      rd.skip(1); this.shadowX = rd.f64();
      rd.skip(1); this.shadowY = rd.f64();
      rd.skip(1); const pageScale = rd.f64();
      const unit = rd.u8();
      let drawScale = rd.f64();
      if (Math.abs(drawScale) < 1e-9) drawScale = 1;
      const scale = Math.abs(pageScale / drawScale);
      if (this.curPage) { this.curPage.w = w; this.curPage.h = h; this.curPage.scale = scale || 1; this.curPage.unit = unit; }
    }

    /* ---- çizgi / dolgu / metin bloğu ---- */
    readLine(rd) {
      const o = {};
      rd.skip(1); o.w = rd.f64();
      if (this.ver === 5) { o.color = this.colourFromIndex(rd.u8()); }
      else { rd.skip(1); o.color = rgba(rd); }
      o.pattern = rd.u8();
      rd.skip(1); o.rounding = rd.f64();
      rd.skip(1); o.start = rd.u8(); o.end = rd.u8(); o.cap = rd.u8();
      if (this.isInStyles) { if (this.curStyle) this.curStyle.line = o; } else this.shape.line = o;
    }

    readFill(rd) {
      const o = {};
      if (this.ver === 5) {
        o.fg = this.colourFromIndex(rd.u8()); o.bg = this.colourFromIndex(rd.u8());
        o.pattern = rd.u8();
        o.shFg = this.colourFromIndex(rd.u8()); rd.skip(1);
        o.shPattern = rd.u8();
        o.fgTrans = 0; o.bgTrans = 0;
      } else {
        const fgIdx = rd.u8(); let fg = rgba(rd);
        const bgIdx = rd.u8(); let bg = rgba(rd);
        if (!fg.r && !fg.g && !fg.b && !fg.a && !bg.r && !bg.g && !bg.b && !bg.a) { fg = this.colourFromIndex(fgIdx); bg = this.colourFromIndex(bgIdx); }
        o.fg = fg; o.bg = bg; o.fgTrans = fg.a / 255; o.bgTrans = bg.a / 255;
        o.pattern = rd.u8();
        const sfIdx = rd.u8(); let sf = rgba(rd);
        const sbIdx = rd.u8(); let sb = rgba(rd);
        if (!sf.r && !sf.g && !sf.b && !sf.a && !sb.r && !sb.g && !sb.b && !sb.a) { sf = this.colourFromIndex(sfIdx); sb = this.colourFromIndex(sbIdx); }
        o.shFg = sf;
        o.shPattern = rd.u8();
      }
      if (this.isInStyles) { if (this.curStyle) this.curStyle.fill = o; } else this.shape.fill = o;
    }

    readTextBlock(rd) {
      const o = {};
      rd.skip(1); o.left = rd.f64(); rd.skip(1); o.right = rd.f64(); rd.skip(1); o.top = rd.f64(); rd.skip(1); o.bottom = rd.f64();
      o.valign = rd.u8();
      rd.u8(); // arka plan renk dizini
      if (this.ver !== 5) { rgba(rd); rd.skip(1); o.tab = rd.f64(); }
      if (this.isInStyles) { if (this.curStyle) this.curStyle.textBlock = o; } else this.shape.textBlock = o;
    }

    readStyleSheet(rd) {
      let line, fill, text;
      if (this.ver === 5) { rd.skip(10); line = this.uint(rd); fill = this.uint(rd); text = this.uint(rd); }
      else { rd.skip(0x22); line = rd.u32(); rd.skip(4); fill = rd.u32(); rd.skip(4); text = rd.u32(); }
      this.curStyle = { id: this.h.id, lineParent: line, fillParent: fill, textParent: text, line: null, fill: null, textBlock: null, charStyle: null, paraStyle: null };
      this.styles.set(this.h.id, this.curStyle);
    }

    /* ---- metin ---- */
    readText(rd) {
      rd.skip(8);
      const b = rd.bytes(this.h.dataLength - 8);
      this.shape.text = b.length ? { bytes: b.slice(), fmt: this.ver === 11 ? FMT.UTF16 : FMT.ANSI } : null;
    }

    readCharIX(rd) {
      const o = {};
      if (this.ver === 5) {
        o.count = rd.u16();
        const fid = rd.u16(); o.font = this.fonts.get(fid) || null;
        o.color = this.colourFromIndex(rd.u8());
        let m = rd.u8(); o.bold = !!(m & 1); o.italic = !!(m & 2); o.underline = !!(m & 4);
        m = rd.u8(); m = rd.u8();
        rd.u16(); rd.skip(2); o.size = rd.f64();
      } else {
        o.count = rd.u32();
        const fid = rd.u16(); o.font = this.fonts.get(fid) || null;
        rd.skip(1); o.color = rgba(rd);
        let m = rd.u8(); o.bold = !!(m & 1); o.italic = !!(m & 2); o.underline = !!(m & 4);
        m = rd.u8(); m = rd.u8();
        rd.u16(); rd.skip(2); o.size = rd.f64();
        m = rd.u8(); o.strike = !!(m & 4);
      }
      if (this.isInStyles) { if (this.curStyle) this.curStyle.charStyle = o; }
      else {
        this.shape.charStyle = o;
        this.shape.charList.set(this.h.id, o);
      }
    }

    readParaIX(rd) {
      const o = {};
      if (this.ver === 5) o.count = rd.u16(); else o.count = rd.u32();
      rd.skip(1); o.indFirst = rd.f64(); rd.skip(1); o.indLeft = rd.f64(); rd.skip(1); o.indRight = rd.f64();
      rd.skip(1); o.spLine = rd.f64(); rd.skip(1); o.spBefore = rd.f64(); rd.skip(1); o.spAfter = rd.f64();
      o.align = rd.u8();
      if (this.isInStyles) { if (this.curStyle) this.curStyle.paraStyle = o; }
      else { this.shape.paraStyle = o; this.shape.paraList.set(this.h.id, o); }
    }

    readFont(rd) {
      rd.skip(4);
      const out = [];
      for (let i = 0; i < 32; i++) {
        const a = rd.u8(), b = rd.u8();
        if (a === 0 && b === 0) break;
        out.push(a, b);
      }
      this.fonts.set(this.h.id, { name: decodeBytes(Uint8Array.from(out), FMT.UTF16), fmt: FMT.UTF16 });
    }

    readFontIX(rd) {
      let adjust = rd.tell();
      rd.skip(2);
      let cp = rd.u32() & 0xff;
      adjust -= rd.tell();
      const bytes = [];
      for (let i = 0; i < this.h.dataLength + adjust; i++) {
        const c = rd.u8();
        if (c === 0) break;
        bytes.push(c);
      }
      let name = String.fromCharCode(...bytes);
      if (!cp) {
        const L = name.length;
        const cut = (sfx, code) => { if (L > sfx.length && name.endsWith(sfx)) { cp = code; name = name.slice(0, L - sfx.length); return true; } return false; };
        cut(' CE', 0xee) || cut(' Cyrillic', 0xcc) || cut(' Cyr', 0xcc) || cut(' CYR', 0xcc) || cut(' Baltic', 0xba) ||
          cut(' Greek', 0xa1) || cut(' Tur', 0xa2) || cut(' TUR', 0xa2) || cut(' Hebrew', 0xb1) || cut(' Arabic', 0xb2) || cut(' Thai', 0xde);
        if (!cp && name.startsWith('GOST')) cp = 0xcc;
      }
      const fmt = formatFromCodePage(cp);
      this.fonts.set(this.h.id, { name: decodeBytes(Uint8Array.from(bytes), fmt === FMT.SYMBOL ? FMT.ANSI : fmt).replace(/\0/g, '') || name, fmt });
    }

    readColours(rd) {
      rd.skip(2);
      const n = rd.u8();
      rd.skip(1);
      this.colours = [];
      for (let i = 0; i < n; i++) this.colours.push(rgba(rd));
    }

    /* ---- alanlar ---- */
    readTextField(rd) {
      const f = this.shape.fieldList;
      const id = this.h.id;
      if (this.ver === 5) {
        rd.skip(3);
        const cellType = rd.u8();
        if (cellType === 232) f.add(id, { kind: 'text', nameId: rd.s16(), formatStringId: 0xffff });
        else f.add(id, { kind: 'num', format: 0xffff, cellType, number: rd.f64(), formatStringId: 0xffff });
        return;
      }
      const init = rd.tell();
      rd.skip(7);
      const cellType = rd.u8();
      if (cellType === 232) {
        const nameId = rd.s32(); rd.skip(6); const fs = rd.s32();
        f.add(id, { kind: 'text', nameId, formatStringId: fs });
      } else {
        const number = rd.f64(); rd.skip(2); const fs = rd.s32();
        let blockIdx = 0, formatNumber = 0;
        rd.seek(init + (this.ver === 11 ? 0x36 : 0x24));
        while (blockIdx !== 2 && !rd.isEnd() && rd.tell() < init + this.h.dataLength + this.h.trailer) {
          const pos = rd.tell();
          const length = rd.u32();
          if (!length) break;
          rd.skip(1);
          blockIdx = rd.u8();
          if (blockIdx !== 2) rd.seek(pos + length);
          else {
            rd.skip(1);
            formatNumber = rd.u16();
            if (rd.u8() !== 0x80) { rd.seek(pos + length); blockIdx = 0; }
            else if (rd.u8() !== 0xc2) { rd.seek(pos + length); blockIdx = 0; }
            else break;
          }
        }
        if (rd.isEnd()) return;
        if (blockIdx !== 2) formatNumber = cellType === 40 ? 200 : 0xffff;
        f.add(id, { kind: 'num', format: formatNumber, cellType, number, formatStringId: fs });
      }
    }

    /* ---- diğer ---- */
    readMisc(rd) {
      const flags = rd.u8();
      this.shape.hideText = !!(flags & 0x20);
    }

    readLayer(rd) {
      rd.skip(8);
      const ci = rd.u8();
      if (ci === 0xff) rd.skip(4); else rgba(rd);
      rd.skip(1);
      const visible = !!rd.u8();
      const printable = !!rd.u8();
      if (this.curPage) this.curPage.layers.push({ id: this.h.id, visible, printable });
    }

    readLayerMem(rd) {
      rd.skip(13);
      const len = rd.u8();
      const b = rd.bytes(this.ver === 11 ? len * 2 : len);
      if (b.length) this.shape.layerMem = decodeBytes(b, this.ver === 11 ? FMT.UTF16 : FMT.ANSI).replace(/\0/g, '');
    }
  }

  function newForeign() {
    return { typeId: 0, dataId: 0, type: 0, format: 0, offsetX: 0, offsetY: 0, width: 0, height: 0, data: null };
  }


  /* ===================================================================
     Model → bellek içi VSDX paketi
     =================================================================== */
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v) => { if (!Number.isFinite(v)) return '0'; const r = Math.round(v * 1e6) / 1e6; return String(r); };
  const enc = new TextEncoder();
  const NSV = 'http://schemas.microsoft.com/office/visio/2012/main';
  const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const isNone = (v) => v === NONE || v === undefined || v === null;

  function dibToBmp(d) {
    if (d.length < 40) return null;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const hdr = dv.getUint32(0, true);
    const bits = dv.getUint16(14, true);
    const comp = dv.getUint32(16, true);
    const used = hdr >= 36 ? dv.getUint32(32, true) : 0;
    let pal = used ? used * 4 : (bits <= 8 ? (1 << bits) * 4 : 0);
    if (comp === 3 && hdr === 40) pal += 12;
    const off = 14 + hdr + pal;
    const out = new Uint8Array(14 + d.length);
    const odv = new DataView(out.buffer);
    out[0] = 0x42; out[1] = 0x4d;
    odv.setUint32(2, out.length, true);
    odv.setUint32(10, off, true);
    out.set(d, 14);
    return out;
  }

  function imageOf(f) {
    if (!f || !f.data || !f.data.length) return null;
    if (f.type === 1) {
      const fm = f.format;
      if (fm === 0 || fm === 255) { const b = dibToBmp(f.data); return b ? { ext: 'bmp', data: b } : null; }
      if (fm === 1) return { ext: 'jpg', data: f.data };
      if (fm === 2) return { ext: 'gif', data: f.data };
      if (fm === 4) return { ext: 'png', data: f.data };
      return null;
    }
    const d = f.data;
    if (d[0] === 0x89 && d[1] === 0x50) return { ext: 'png', data: d };
    if (d[0] === 0xff && d[1] === 0xd8) return { ext: 'jpg', data: d };
    return null;
  }

  function convert(P) {
    const styles = P.styles;
    const chainGet = (id, parentKey, ownKey, depth) => {
      const st = styles.get(id);
      if (!st || depth > 20) return null;
      if (st[ownKey]) return st[ownKey];
      const par = st[parentKey];
      if (isNone(par) || par === id) return null;
      return chainGet(par, parentKey, ownKey, depth + 1);
    };
    const fonts = [];
    const fontId = (name) => {
      if (!name) return 0;
      let i = fonts.indexOf(name);
      if (i < 0) { fonts.push(name); i = fonts.length - 1; }
      return i;
    };
    fontId('Arial');
    const media = [];

    const fmtField = (fld, shape) => {
      if (fld.kind === 'text') {
        const nm = shape.names.get(fld.nameId) || P.names.get(fld.nameId);
        return nm ? decodeBytes(nm.bytes, nm.fmt).replace(/\0/g, '') : '';
      }
      const n = fld.number;
      if (fld.cellType === 40 || (fld.format >= 200 && fld.format < 300)) {
        const t = new Date((n * 86400 - 2209161600) * 1000);
        return isNaN(t) ? '' : t.toLocaleString('tr-TR', { timeZone: 'UTC' });
      }
      const dec = { 2: 0, 3: 0, 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3 }[fld.format];
      if (dec !== undefined) return n.toFixed(dec);
      if (Number.isInteger(n)) return String(n);
      return String(+n.toPrecision(4));
    };

    const textOf = (sh, ms) => {
      const t = sh.text || (ms && ms.text);
      if (!t) return '';
      let s = decodeBytes(t.bytes, t.fmt).replace(/\0/g, '');
      const flds = (sh.fieldList.size ? sh.fieldList : (ms ? ms.fieldList : sh.fieldList)).ordered();
      let fi = 0;
      s = s.replace(/[\u001e￼]/g, () => (fi < flds.length ? fmtField(flds[fi++], sh) : ''));
      return s.replace(/\r\n?/g, '\n').replace(/[\u000d\u000e]/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000f-\u001f]/g, '');
    };

    const pageXml = (page, bgIds) => {
      const sc = page.scale || 1;
      const byId = new Map();
      for (const s of page.shapes) if (!byId.has(s.id)) byId.set(s.id, s);
      const kidsOf = new Map();
      const top = [];
      for (const s of page.shapes) {
        const par = s.parent;
        if (par && par !== NONE && byId.has(par) && par !== s.id) {
          if (!kidsOf.has(par)) kidsOf.set(par, []);
          kidsOf.get(par).push(s);
        } else top.push(s);
      }
      const orderBy = (list, order) => {
        if (!order || !order.length) return list;
        const pos = new Map(order.map((v, i) => [v, i]));
        return list.map((s, i) => [s, i]).sort((a, b) => ((pos.has(a[0].id) ? pos.get(a[0].id) : 1e9 + a[1]) - (pos.has(b[0].id) ? pos.get(b[0].id) : 1e9 + b[1]))).map((x) => x[0]);
      };
      const rels = [];
      let nid = 0;
      let rid = 0;

      const emitShape = (s, depth) => {
        const ms = (!isNone(s.masterPage) && P.stencils.has(s.masterPage)) ? P.stencils.get(s.masterPage).shapes.get(s.masterShape) : null;
        const xf = s.xform || (ms && ms.xform);
        const id = ++nid;
        const isGroup = s.type === T.GROUP;
        const f = s.foreign || (ms && ms.foreign);
        const img = (s.type === T.FOREIGN || (f && f.data)) ? imageOf(f) : null;
        const type = s.type === T.GROUP ? 'Group' : (s.type === T.FOREIGN ? 'Foreign' : 'Shape');
        const c = [];
        const cell = (n, v) => c.push(`<Cell N="${n}" V="${esc(v)}"/>`);
        if (xf) {
          cell('PinX', num(xf.pinX * sc)); cell('PinY', num(xf.pinY * sc));
          cell('Width', num(xf.width * sc)); cell('Height', num(xf.height * sc));
          cell('LocPinX', num(xf.pinLocX * sc)); cell('LocPinY', num(xf.pinLocY * sc));
          cell('Angle', num(xf.angle));
          if (xf.flipX) cell('FlipX', '1');
          if (xf.flipY) cell('FlipY', '1');
        }
        const W = xf ? xf.width * sc : 0, H = xf ? xf.height * sc : 0;
        const tx = s.txtxform || (ms && ms.txtxform);
        if (tx) {
          cell('TxtPinX', num(tx.pinX * sc)); cell('TxtPinY', num(tx.pinY * sc));
          cell('TxtWidth', num(tx.width * sc)); cell('TxtHeight', num(tx.height * sc));
          cell('TxtLocPinX', num(tx.pinLocX * sc)); cell('TxtLocPinY', num(tx.pinLocY * sc));
          cell('TxtAngle', num(tx.angle));
        }
        // çizgi
        const ln = s.line || (ms && ms.line) || chainGet(isNone(s.lineStyleId) && ms ? ms.lineStyleId : s.lineStyleId, 'lineParent', 'line', 0);
        if (ln) {
          cell('LineWeight', num(ln.w)); cell('LineColor', hexColor(ln.color)); cell('LinePattern', String(ln.pattern));
          if (ln.rounding) cell('Rounding', num(ln.rounding * sc));
          if (ln.start) cell('BeginArrow', String(ln.start));
          if (ln.end) cell('EndArrow', String(ln.end));
          if (ln.cap) cell('LineCap', String(ln.cap));
          if (ln.color.a) cell('LineColorTrans', num(ln.color.a / 255));
        } else { cell('LineWeight', '0.01'); cell('LineColor', '#000000'); cell('LinePattern', '1'); }
        // dolgu
        const fl = s.fill || (ms && ms.fill) || chainGet(isNone(s.fillStyleId) && ms ? ms.fillStyleId : s.fillStyleId, 'fillParent', 'fill', 0);
        if (fl) {
          cell('FillPattern', String(fl.pattern)); cell('FillForegnd', hexColor(fl.fg)); cell('FillBkgnd', hexColor(fl.bg));
          if (fl.fgTrans) cell('FillForegndTrans', num(fl.fgTrans));
        } else cell('FillPattern', '0');
        // metin bloğu
        const tb = s.textBlock || (ms && ms.textBlock) || chainGet(isNone(s.textStyleId) && ms ? ms.textStyleId : s.textStyleId, 'textParent', 'textBlock', 0);
        if (tb) {
          cell('LeftMargin', num(tb.left * sc)); cell('RightMargin', num(tb.right * sc));
          cell('TopMargin', num(tb.top * sc)); cell('BottomMargin', num(tb.bottom * sc));
          cell('VerticalAlign', String(tb.valign));
        }
        if (s.hideText || (ms && ms.hideText)) cell('HideText', '1');
        if (s.layerMem) cell('LayerMember', s.layerMem);
        const out = [];
        // geometri
        let geoms = s.geoms.filter((g) => g.el.size);
        if (!geoms.length && ms) geoms = ms.geoms.filter((g) => g.el.size);
        let gix = 0;
        for (const g of geoms) {
          if (type === 'Foreign' && img) break;
          const rows = [];
          const els = g.order.length ? g.order.filter((k) => g.el.has(k)).map((k) => g.el.get(k)) : [...g.el.keys()].sort((a, b) => a - b).map((k) => g.el.get(k));
          let rix = 0;
          const sx = (v) => num(v * sc);
          for (const e of els) {
            if (e.t === 'Geometry') continue;
            const r = [];
            const cl = (n, v) => r.push(`<Cell N="${n}" V="${v}"/>`);
            switch (e.t) {
              case 'MoveTo': case 'LineTo': case 'SplineStart': case 'SplineKnot':
                cl('X', sx(e.x)); cl('Y', sx(e.y)); break;
              case 'ArcTo': cl('X', sx(e.x)); cl('Y', sx(e.y)); cl('A', sx(e.a)); break;
              case 'EllipticalArcTo':
                cl('X', sx(e.x)); cl('Y', sx(e.y)); cl('A', sx(e.a)); cl('B', sx(e.b)); cl('C', num(e.c)); cl('D', num(e.d)); break;
              case 'Ellipse':
                cl('X', sx(e.x)); cl('Y', sx(e.y)); cl('A', sx(e.a)); cl('B', sx(e.b)); cl('C', sx(e.c)); cl('D', sx(e.d)); break;
              case 'NURBSTo': {
                let d = e;
                if (e.dataId !== undefined) {
                  const nd = s.nurbs.get(e.dataId) || (ms && ms.nurbs.get(e.dataId));
                  if (!nd) { cl('X', sx(e.x)); cl('Y', sx(e.y)); break; }
                  d = { x: e.x, y: e.y, knot: e.knot, weight: e.weight, knotPrev: e.knotPrev, weightPrev: e.weightPrev, degree: nd.degree, xType: nd.xType, yType: nd.yType, ctrl: nd.ctrl, knots: [e.knotPrev].concat(nd.knots, [e.knot, nd.lastKnot]), weights: [e.weightPrev].concat(nd.weights, [e.weight]) };
                  d.lastKnot = nd.lastKnot;
                }
                cl('X', sx(e.x)); cl('Y', sx(e.y)); cl('A', num(e.knot)); cl('B', num(e.weight)); cl('C', num(e.knotPrev)); cl('D', num(e.weightPrev));
                const xr = d.xType === 0, yr = d.yType === 0;
                const last = d.knots ? d.knots[d.knots.length - 1] : 1;
                const parts = [num(last), String(d.degree || 3), xr ? '1' : '0', yr ? '1' : '0'];
                const nc = d.ctrl ? d.ctrl.length : 0;
                for (let i = 0; i < nc; i++) {
                  parts.push(num(xr ? d.ctrl[i][0] : d.ctrl[i][0] * sc), num(yr ? d.ctrl[i][1] : d.ctrl[i][1] * sc), num(d.knots[i + 1] || 0), num(d.weights[i + 1] || 1));
                }
                parts.push(sx(e.x), sx(e.y), num(e.knot), num(e.weight));
                cl('E', 'NURBS(' + parts.join(',') + ')');
                break;
              }
              case 'PolylineTo': {
                let d = e;
                if (e.dataId !== undefined) {
                  const pd = s.poly.get(e.dataId) || (ms && ms.poly.get(e.dataId));
                  d = pd ? { xType: pd.xType, yType: pd.yType, pts: pd.pts } : null;
                }
                cl('X', sx(e.x)); cl('Y', sx(e.y));
                if (d && d.pts) {
                  const xr = d.xType === 0, yr = d.yType === 0;
                  const parts = [xr ? '1' : '0', yr ? '1' : '0'];
                  for (const p of d.pts) parts.push(num(xr ? p[0] : p[0] * sc), num(yr ? p[1] : p[1] * sc));
                  cl('A', 'POLYLINE(' + parts.join(',') + ')');
                }
                break;
              }
              default: continue;
            }
            rows.push(`<Row T="${e.t}" IX="${++rix}">${r.join('')}</Row>`);
          }
          if (!rows.length) continue;
          out.push(`<Section N="Geometry" IX="${gix++}"><Cell N="NoFill" V="${g.noFill ? 1 : 0}"/><Cell N="NoLine" V="${g.noLine ? 1 : 0}"/><Cell N="NoShow" V="${g.noShow ? 1 : 0}"/>${rows.join('')}</Section>`);
        }
        // karakter / paragraf
        const cs = (s.charList.size ? s.charList.ordered()[0] : null) || s.charStyle || (ms && (ms.charList.size ? ms.charList.ordered()[0] : ms.charStyle)) || chainGet(isNone(s.textStyleId) && ms ? ms.textStyleId : s.textStyleId, 'textParent', 'charStyle', 0);
        const ps = (s.paraList.size ? s.paraList.ordered()[0] : null) || s.paraStyle || (ms && (ms.paraList.size ? ms.paraList.ordered()[0] : ms.paraStyle)) || chainGet(isNone(s.textStyleId) && ms ? ms.textStyleId : s.textStyleId, 'textParent', 'paraStyle', 0);
        const txt = textOf(s, ms);
        if (txt) {
          const fid = cs && cs.font ? fontId(cs.font.name) : 0;
          const sty = cs ? ((cs.bold ? 1 : 0) | (cs.italic ? 2 : 0) | (cs.underline ? 4 : 0)) : 0;
          out.push(`<Section N="Character"><Row IX="0"><Cell N="Font" V="${fid}"/><Cell N="Color" V="${cs ? hexColor(cs.color) : '#000000'}"/><Cell N="Size" V="${num(cs && cs.size > 0 ? cs.size : 12 / 72)}"/><Cell N="Style" V="${sty}"/></Row></Section>`);
          out.push(`<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="${ps ? ps.align : 1}"/></Row></Section>`);
        }
        let fdata = '';
        if (img) {
          const mname = `media/image${media.length + 1}.${img.ext}`;
          media.push({ name: 'visio/' + mname, data: img.data });
          const rId = 'rId' + (++rid);
          rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../${mname}"/>`);
          fdata = `<ForeignData ForeignType="Bitmap"><Rel xmlns:r="${NSR}" r:id="${rId}"/></ForeignData>`;
        }
        let kids = '';
        const own = kidsOf.get(s.id);
        if (own && own.length) kids = `<Shapes>${orderBy(own, s.childOrder).map((k) => emitShape(k, depth + 1)).join('')}</Shapes>`;
        else if (isGroup && ms && depth < 6) {
          // örnek, ana şeklin alt şekillerini kendisi taşımıyorsa
          const mst = P.stencils.get(s.masterPage);
          const mkids = [...mst.shapes.values()].filter((k) => k.parent === ms.id && k.id !== ms.id);
          if (mkids.length) kids = `<Shapes>${orderBy(mkids, ms.childOrder).map((k) => emitMaster(k, mst, depth + 1)).join('')}</Shapes>`;
        }
        void W; void H;
        return `<Shape ID="${id}" Type="${type}">${c.join('')}${out.join('')}${fdata}${txt ? `<Text>${esc(txt)}</Text>` : ''}${kids}</Shape>`;
      };

      const emitMaster = (m, mst, depth) => emitShape(Object.assign({}, m, { masterPage: NONE, masterShape: NONE }), depth);

      const body = orderBy(top, page.order).map((s) => emitShape(s, 0)).join('');
      const layers = page.layers.map((l, i) => `<Row IX="${l.id}"><Cell N="Name" V="Katman ${i + 1}"/><Cell N="Visible" V="${l.visible ? 1 : 0}"/></Row>`).join('');
      return { xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><PageContents xmlns="${NSV}" xmlns:r="${NSR}"><Shapes>${body}</Shapes></PageContents>`, rels, layers };
    };

    const real = P.pages.filter((p) => !p.background);
    const bgs = P.pages.filter((p) => p.background);
    const all = real.concat(bgs);
    const entries = [];
    const add = (name, text) => entries.push({ name, data: typeof text === 'string' ? enc.encode(text) : text, modified: true });
    const pageEntries = [];
    const pageNodes = [];
    all.forEach((p, i) => {
      const n = i + 1;
      const pg = pageXml(p);
      add(`visio/pages/page${n}.xml`, pg.xml);
      if (pg.rels.length) add(`visio/pages/_rels/page${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pg.rels.join('')}</Relationships>`);
      let nm = p.name && p.name.bytes ? decodeBytes(p.name.bytes, p.name.fmt).replace(/\0/g, '') : '';
      if (!nm) nm = (p.background ? 'Arka plan ' : 'Sayfa ') + n;
      const sc = p.scale || 1;
      const w = (p.w || 8.5) * sc, h = (p.h || 11) * sc;
      p._pid = p.id + 1;
      p._n = n;
      pageNodes.push({ p, nm, w, h, layers: pg.layers });
    });
    const pidOf = new Map(all.map((p) => [p.id, p._pid]));
    let pagesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Pages xmlns="${NSV}" xmlns:r="${NSR}">`;
    let pagesRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (const pn of pageNodes) {
      const { p } = pn;
      const back = p.backId !== NONE && pidOf.has(p.backId) && all.find((q) => q.id === p.backId && q.background) ? ` BackPage="${pidOf.get(p.backId)}"` : '';
      pagesXml += `<Page ID="${p._pid}" Name="${esc(pn.nm)}"${p.background ? ' Background="1"' : ''}${back}><PageSheet><Cell N="PageWidth" V="${num(pn.w)}"/><Cell N="PageHeight" V="${num(pn.h)}"/>${pn.layers ? `<Section N="Layer">${pn.layers}</Section>` : ''}</PageSheet><Rel r:id="rId${p._n}"/></Page>`;
      pagesRels += `<Relationship Id="rId${p._n}" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page${p._n}.xml"/>`;
    }
    pagesXml += '</Pages>'; pagesRels += '</Relationships>';
    add('visio/pages/pages.xml', pagesXml);
    add('visio/pages/_rels/pages.xml.rels', pagesRels);
    const colors = P.colours.map((c, i) => `<ColorEntry IX="${i}" RGB="${hexColor(c)}"/>`).join('');
    add('visio/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><VisioDocument xmlns="${NSV}" xmlns:r="${NSR}"><Colors>${colors}</Colors><FaceNames>${fonts.map((f, i) => `<FaceName ID="${i}" Name="${esc(f)}"/>`).join('')}</FaceNames></VisioDocument>`);
    add('visio/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/></Relationships>');
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/></Relationships>');
    add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>');
    for (const m of media) add(m.name, m.data);
    return entries;
  }

  function isCfb(u8) {
    return u8.length >= 6 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0 && u8[4] === 0xa1 && u8[5] === 0xb1;
  }

  /* .vsd baytlarından VSDX zip baytları + uyarılar üretir */
  async function toVsdx(u8) {
    const cfb = cfbOpen(u8);
    const e = cfb.find('VisioDocument');
    if (!e) throw new Error('Bu OLE dosyası bir Visio çizimi içermiyor.');
    const doc = cfb.readStream(e);
    const magic = 'Visio (TM) Drawing';
    for (let i = 0; i < magic.length; i++) if (doc[i] !== magic.charCodeAt(i)) throw new Error('Visio çizim imzası bulunamadı.');
    const ver = doc[0x1a];
    const kind = ver === 11 ? 11 : ver === 6 ? 6 : (ver >= 1 && ver <= 5) ? 5 : 0;
    if (!kind) throw new Error('Desteklenmeyen Visio sürümü (' + ver + ').');
    const P = new Parser(doc, kind);
    P.parseMain();
    if (!P.pages.length) throw new Error('Dosyada okunabilen sayfa bulunamadı.');
    const entries = convert(P);
    return { zip: await writeZip(entries), issues: P.issues, version: ver };
  }

  return { Rd, EOS, cfbOpen, lzExpand, innerStream, decodeBytes, FMT, NONE, IdList, newShape, T, Parser, hexColor, hex2, newForeign, toVsdx, isCfb, convert };
})();

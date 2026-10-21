/* ZIP okuyucu / yazıcı — harici kütüphane yok.
   Okuma: tarayıcının DecompressionStream('deflate-raw') özelliği.
   Yazma: değişmeyen girdiler olduğu gibi (yeniden sıkıştırmadan) kopyalanır. */
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const inflateRaw = (b) => pipeBytes(b, new DecompressionStream('deflate-raw'));
const deflateRaw = (b) => pipeBytes(b, new CompressionStream('deflate-raw'));

const utf8dec = new TextDecoder('utf-8');
const utf8enc = new TextEncoder();

function parseZip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const minPos = Math.max(0, u8.length - 22 - 65535);
  for (let i = u8.length - 22; i >= minPos; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Geçerli bir VSDX/ZIP dosyası değil. (Eski ikili .vsd biçimi desteklenmez; Visio\'da "Farklı kaydet → .vsdx" yapın.)');
  const count = dv.getUint16(eocd + 10, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff === 0xFFFFFFFF || count === 0xFFFF) throw new Error('ZIP64 biçimi desteklenmiyor.');
  const entries = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP dizini bozuk.');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const dosTime = dv.getUint16(p + 12, true);
    const dosDate = dv.getUint16(p + 14, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = utf8dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true);
    const lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    entries.push({
      name, method, crc, csize, usize, flags, dosTime, dosDate,
      raw: u8.subarray(start, start + csize), data: null, modified: false,
    });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

async function entryBytes(e) {
  if (e.data) return e.data;
  if (e.method === 0) e.data = e.raw;
  else if (e.method === 8) e.data = await inflateRaw(e.raw);
  else throw new Error('Desteklenmeyen ZIP sıkıştırma yöntemi: ' + e.method);
  return e.data;
}

function dosNow() {
  const d = new Date();
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function writeZip(entries) {
  const now = dosNow();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (u8) => { chunks.push(u8); offset += u8.length; };

  for (const e of entries) {
    const nameBytes = utf8enc.encode(e.name);
    let method, crc, csize, usize, payload, flags, time, date;
    if (e.modified) {
      const data = e.data;
      usize = data.length;
      crc = crc32(data);
      if (usize > 64) {
        const def = await deflateRaw(data);
        if (def.length < usize) { method = 8; payload = def; } else { method = 0; payload = data; }
      } else { method = 0; payload = data; }
      csize = payload.length;
      flags = 0x0800; time = now.time; date = now.date;
    } else {
      method = e.method; crc = e.crc; csize = e.csize; usize = e.usize;
      payload = e.raw; flags = e.flags & ~0x0008; time = e.dosTime; date = e.dosDate;
      flags |= 0x0800;
    }
    const lh = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(6, flags, true);
    ldv.setUint16(8, method, true);
    ldv.setUint16(10, time, true);
    ldv.setUint16(12, date, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, csize, true);
    ldv.setUint32(22, usize, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    const localOffset = offset;
    push(lh); push(payload);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, flags, true);
    cdv.setUint16(10, method, true);
    cdv.setUint16(12, time, true);
    cdv.setUint16(14, date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, csize, true);
    cdv.setUint32(24, usize, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, localOffset, true);
    ch.set(nameBytes, 46);
    central.push(ch);
  }
  const cdStart = offset;
  for (const c of central) push(c);
  const cdSize = offset - cdStart;
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, cdStart, true);
  push(end);

  const out = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

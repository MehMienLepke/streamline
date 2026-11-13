/* ==========================================================================
   Streamline — e-mails uitlezen (.msg uit Outlook en .eml)
   Alles gebeurt lokaal in de browser.
   Resultaat: { subject, from, date, body, attachments: [{ name, type, data: Uint8Array }] }
   ========================================================================== */
const MailParser = (() => {
  /* ---------- Outlook .msg (Compound File Binary) ---------- */
  function readCFB(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    if (!sig.every((b, i) => u8[i] === b)) throw new Error('Geen Outlook-bestand');
    const ss = 1 << dv.getUint16(0x1E, true), mss = 1 << dv.getUint16(0x20, true);
    const nFat = dv.getUint32(0x2C, true), dirStart = dv.getUint32(0x30, true), cutoff = dv.getUint32(0x38, true);
    const miniFatStart = dv.getUint32(0x3C, true), difStart = dv.getUint32(0x44, true);
    const secOff = s => (s + 1) * ss;
    const END = 0xFFFFFFFE;
    // FAT opbouwen via DIFAT
    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const s = dv.getUint32(0x4C + i * 4, true); if (s < 0xFFFFFFFA) fatSecs.push(s); }
    for (let d = difStart, guard = 0; d < 0xFFFFFFFA && fatSecs.length < nFat && guard++ < 10000;) {
      const o = secOff(d), per = ss / 4 - 1;
      for (let i = 0; i < per && fatSecs.length < nFat; i++) { const s = dv.getUint32(o + i * 4, true); if (s < 0xFFFFFFFA) fatSecs.push(s); }
      d = dv.getUint32(o + per * 4, true);
    }
    const fat = new Uint32Array(fatSecs.length * ss / 4);
    fatSecs.forEach((s, i) => { const o = secOff(s); for (let j = 0; j < ss / 4; j++) if (o + j * 4 + 4 <= u8.length) fat[i * ss / 4 + j] = dv.getUint32(o + j * 4, true); });
    const chain = (start, table) => { const out = []; for (let s = start, g = 0; s < 0xFFFFFFFA && s !== END && g++ < 1e6; s = table[s]) out.push(s); return out; };
    const readChain = (start, size) => {
      const secs = chain(start, fat), out = new Uint8Array(size ?? secs.length * ss); let p = 0;
      for (const s of secs) { const o = secOff(s), n = Math.min(ss, out.length - p); if (n <= 0) break; out.set(u8.subarray(o, o + n), p); p += n; }
      return out;
    };
    // mapstructuur
    const dirBytes = readChain(dirStart);
    const ddv = new DataView(dirBytes.buffer);
    const entries = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const nl = ddv.getUint16(o + 0x40, true);
      let name = ''; for (let i = 0; i < Math.max(0, nl / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true));
      entries.push({ name, type: dirBytes[o + 0x42], left: ddv.getUint32(o + 0x44, true), right: ddv.getUint32(o + 0x48, true), child: ddv.getUint32(o + 0x4C, true), start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
    }
    const root = entries[0];
    const miniStream = readChain(root.start, root.size);
    const miniFat = (() => { const b = readChain(miniFatStart); const d2 = new DataView(b.buffer); const t = new Uint32Array(b.length / 4); for (let i = 0; i < t.length; i++) t[i] = d2.getUint32(i * 4, true); return t; })();
    const readStream = e => {
      if (e.size < cutoff) {
        const out = new Uint8Array(e.size); let p = 0;
        for (const s of chain(e.start, miniFat)) { const n = Math.min(mss, e.size - p); if (n <= 0) break; out.set(miniStream.subarray(s * mss, s * mss + n), p); p += n; }
        return out;
      }
      return readChain(e.start, e.size);
    };
    const children = idx => {
      const out = [], stack = [], seen = new Set(); let cur = entries[idx]?.child;
      while ((cur !== undefined && cur < 0xFFFFFFFA) || stack.length) {
        while (cur !== undefined && cur < 0xFFFFFFFA && !seen.has(cur)) { seen.add(cur); stack.push(cur); cur = entries[cur].left; }
        if (!stack.length) break;
        const n = stack.pop(); out.push(n); cur = entries[n].right;
      }
      return out.map(i => ({ ...entries[i], idx: i }));
    };
    return { children, readStream, rootIdx: 0 };
  }
  const utf16 = b => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8)); return s.replace(/\u0000+$/, ''); };
  const ansi = b => new TextDecoder('windows-1252').decode(b).replace(/\u0000+$/, '');
  function msgProps(cfb, idx) {
    const props = {}, streams = {};
    for (const e of cfb.children(idx)) {
      if (e.type === 2) {
        const m = /^__substg1\.0_([0-9A-F]{4})([0-9A-F]{4})$/i.exec(e.name);
        if (m) {
          const id = m[1].toUpperCase(), type = m[2].toUpperCase(), data = cfb.readStream(e);
          props[id] = type === '001F' ? utf16(data) : type === '001E' ? ansi(data) : data;
        } else streams[e.name] = e;
      }
    }
    return { props, streams };
  }
  function filetimeFromProps(cfb, propsStream, headerSize, ids) {
    if (!propsStream) return null;
    const b = cfb.readStream(propsStream), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let o = headerSize; o + 16 <= b.length; o += 16) {
      const type = dv.getUint16(o, true), id = dv.getUint16(o + 2, true);
      if (type === 0x0040 && ids.includes(id)) {
        const lo = dv.getUint32(o + 8, true), hi = dv.getUint32(o + 12, true);
        const ms = (hi * 4294967296 + lo) / 10000 - 11644473600000;
        if (ms > 0) return new Date(ms);
      }
    }
    return null;
  }

  /* ---------- Outlook RTF (gecomprimeerd) → HTML ---------- */
  const RTF_PRE = '{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx';
  function decompressRTF(src) {
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const comp = dv.getUint32(0, true), raw = dv.getUint32(4, true), type = dv.getUint32(8, true);
    if (type === 0x414C454D) return src.subarray(16, 16 + raw); // 'MELA' = niet gecomprimeerd
    if (type !== 0x75465A4C) throw new Error('onbekend RTF-formaat');
    const dict = new Uint8Array(4096); for (let i = 0; i < RTF_PRE.length; i++) dict[i] = RTF_PRE.charCodeAt(i);
    let wp = RTF_PRE.length; const out = []; let p = 16; const end = Math.min(src.length, comp + 4);
    outer: while (p < end) {
      const ctrl = src[p++];
      for (let bit = 0; bit < 8 && p < end; bit++) {
        if (ctrl & (1 << bit)) {
          const v = (src[p] << 8) | src[p + 1]; p += 2;
          const off = v >> 4, len = (v & 15) + 2;
          if (off === wp) break outer;
          for (let i = 0; i < len; i++) { const b = dict[(off + i) & 4095]; out.push(b); dict[wp] = b; wp = (wp + 1) & 4095; }
        } else { const b = src[p++]; out.push(b); dict[wp] = b; wp = (wp + 1) & 4095; }
      }
    }
    return Uint8Array.from(out);
  }
  const SKIP_DEST = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'mmathPr', 'pgdsctbl', 'filetbl', 'revtbl', 'object', 'objdata', 'bkmkstart', 'bkmkend', 'fldinst']);
  const CHARSET_CP = { 0: 0, 77: 10000, 128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254, 163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250 };
  const CP_LABEL = { 932: 'shift_jis', 949: 'euc-kr', 936: 'gbk', 950: 'big5', 10000: 'macintosh', 1361: 'euc-kr' };
  // Haalt de oorspronkelijke HTML uit Outlooks RTF ("de-encapsulation", MS-OXRTFEX)
  function htmlFromRTF(bytes) {
    const s = latin1(bytes);
    if (!/\\fromhtml1/.test(s.slice(0, 2000))) return '';
    let cp = 1252; const m = /\\ansicpg(\d+)/.exec(s.slice(0, 2000)); if (m) cp = +m[1];
    const decoders = {};
    const decFor = c => decoders[c] ||= (() => { try { return new TextDecoder(CP_LABEL[c] || 'windows-' + c); } catch (e) { return new TextDecoder('windows-1252'); } })();
    // lettertypen met hun tekenset (bepaalt hoe \'xx-tekens gelezen worden, bijv. Japans)
    const fontCp = {};
    const ft = /\{\\fonttbl([\s\S]*?)\}\s*\}/.exec(s.slice(0, 200000));
    if (ft) for (const fm of ft[1].matchAll(/\\f(\d+)[^;]*?\\fcharset(\d+)/g)) { const c = CHARSET_CP[+fm[2]]; if (c) fontCp[fm[1]] = c; }
    const pieces = []; let bytesBuf = [], bufCp = cp;
    const flush = () => { if (bytesBuf.length) { pieces.push(decFor(bufCp).decode(Uint8Array.from(bytesBuf))); bytesBuf = []; } };
    let st = { skip: false, tag: false, rtfOnly: false, uc: 1, cp }; const stack = [];
    let skipChars = 0, first = false;
    const out = () => !st.skip && (st.tag || !st.rtfOnly);
    const emitByte = b => { if (skipChars > 0) { skipChars--; return; } if (out()) { if (st.cp !== bufCp) { flush(); bufCp = st.cp; } bytesBuf.push(b); } };
    const emitStr = t => { if (out()) { flush(); pieces.push(t); } };
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (c === '{') { stack.push(st); st = { ...st }; first = true; i++; continue; }
      if (c === '}') { st = stack.pop() || st; first = false; i++; continue; }
      if (c === '\\') {
        const n = s[i + 1];
        if (n === '\\' || n === '{' || n === '}') { emitByte(n.charCodeAt(0)); i += 2; first = false; continue; }
        if (n === "'") { emitByte(parseInt(s.substr(i + 2, 2), 16)); i += 4; first = false; continue; }
        if (n === '*') { i += 2; const mm = /^\\([a-zA-Z]+)(-?\d+)?/.exec(s.slice(i, i + 40)); if (mm) { if (mm[1] === 'htmltag') st.tag = true; else st.skip = true; } else st.skip = true; continue; }
        if (n === '~') { emitStr(' '); i += 2; continue; }
        if (n === '_') { emitStr('-'); i += 2; continue; }
        if (n === '\r' || n === '\n') { emitStr('\r\n'); i += 2; continue; }
        const mm = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i, i + 40));
        if (!mm) { i += 2; continue; }
        i += mm[0].length;
        const w = mm[1], arg = mm[2] !== undefined ? +mm[2] : null;
        if (first && SKIP_DEST.has(w)) st.skip = true;
        first = false;
        if (w === 'htmltag') { st.tag = true; continue; }
        if (w === 'htmlrtf') { st.rtfOnly = arg !== 0; continue; }
        if (w === 'f' && arg !== null) { st.cp = fontCp[arg] || cp; continue; }
        if (w === 'par' || w === 'line') { emitStr('\r\n'); continue; }
        if (w === 'tab') { emitStr('\t'); continue; }
        if (w === 'uc') { st.uc = arg ?? 1; continue; }
        if (w === 'u') { let code = arg; if (code < 0) code += 65536; emitStr(String.fromCharCode(code)); skipChars = st.uc; continue; }
        if (w === 'lquote') emitStr('‘'); else if (w === 'rquote') emitStr('’'); else if (w === 'ldblquote') emitStr('“'); else if (w === 'rdblquote') emitStr('”'); else if (w === 'bullet') emitStr('•'); else if (w === 'endash') emitStr('–'); else if (w === 'emdash') emitStr('—');
        continue;
      }
      first = false;
      if (c === '\r' || c === '\n') { i++; continue; }
      emitByte(c.charCodeAt(0)); i++;
    }
    flush();
    return pieces.join('');
  }

  function parseMsg(buf) {
    const cfb = readCFB(buf);
    const { props, streams } = msgProps(cfb, 0);
    const date = filetimeFromProps(cfb, streams['__properties_version1.0'], 32, [0x0039, 0x0E06]);
    let body = typeof props['1000'] === 'string' ? props['1000'] : '';
    let html = '';
    if (props['1013']) html = typeof props['1013'] === 'string' ? props['1013'] : decodeCharset(props['1013'], (/charset=["']?([\w-]+)/i.exec(latin1(props['1013'].subarray(0, 2000))) || [])[1] || 'utf-8');
    if (!html && props['1009'] instanceof Uint8Array) { try { html = htmlFromRTF(decompressRTF(props['1009'])); } catch (e) {} }
    if (!body && html) body = htmlToText(html);
    const attachments = [], inline = [];
    for (const e of cfb.children(0)) {
      if (e.type !== 1 || !/^__attach_version1\.0_/i.test(e.name)) continue;
      const a = msgProps(cfb, e.idx).props;
      const data = a['3701'];
      if (!(data instanceof Uint8Array)) continue; // ingesloten mail of OLE-object: overslaan
      const name = String(a['3707'] || a['3704'] || a['3001'] || 'bijlage');
      const cid = String(a['3712'] || '').replace(/^<|>$/g, '');
      const item = { name, type: String(a['370E'] || guessType(name)), data, cid };
      if (cid && html && html.includes('cid:' + cid)) inline.push(item); else attachments.push(item);
    }
    const fromName = props['0C1A'] || props['0042'] || '', fromMail = props['5D01'] || props['0C1F'] || props['0065'] || '';
    const th = typeof props['007D'] === 'string' ? headers(props['007D']) : {};
    return {
      subject: String(props['0037'] || props['0E1D'] || '').trim(),
      from: th['from'] ? decodeWords(th['from']) : [fromName, fromMail && fromMail !== fromName && /@/.test(fromMail) ? `<${fromMail}>` : ''].filter(Boolean).join(' '),
      date: date ? date.toISOString() : '',
      body: String(body || '').replace(/\r\n/g, '\n').trim(),
      html, attachments, inline,
    };
  }
  const EXT_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', html: 'text/html', htm: 'text/html', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822', zip: 'application/zip' };
  function guessType(name) { return EXT_TYPES[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream'; }

  /* ---------- .eml (MIME) ---------- */
  const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const bytesOf = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
  const decodeCharset = (bytes, cs) => { try { return new TextDecoder((cs || 'utf-8').toLowerCase().replace(/^us-ascii$/, 'utf-8')).decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); } };
  function decodeWords(s) {
    return String(s || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
      try {
        const bin = enc.toUpperCase() === 'B' ? atob(txt) : txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
        return decodeCharset(bytesOf(bin), cs);
      } catch (e) { return txt; }
    });
  }
  function headers(raw) {
    const out = {};
    raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) { const k = l.slice(0, i).trim().toLowerCase(); if (!(k in out)) out[k] = l.slice(i + 1).trim(); } });
    return out;
  }
  function param(v, name) {
    if (!v) return '';
    const star = new RegExp(name + '\\*(?:0\\*)?=([^;]+)', 'i').exec(v);
    if (star) { const m = /^([^']*)'[^']*'(.*)$/.exec(star[1].trim().replace(/^"|"$/g, '')); if (m) { try { return decodeCharset(bytesOf(unescape(m[2])), m[1]); } catch (e) {} } }
    const m = new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*("([^"]*)"|[^;]+)', 'i').exec(v);
    return m ? decodeWords((m[2] ?? m[1]).trim()) : '';
  }
  function decodeBody(str, enc) {
    enc = (enc || '').toLowerCase();
    if (enc === 'base64') { try { return bytesOf(atob(str.replace(/[^A-Za-z0-9+/=]/g, ''))); } catch (e) { return bytesOf(str); } }
    if (enc === 'quoted-printable') return bytesOf(str.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))));
    return bytesOf(str);
  }
  function walk(str, out) {
    const sep = /\r?\n\r?\n/.exec(str);
    const head = sep ? str.slice(0, sep.index) : str, body = sep ? str.slice(sep.index + sep[0].length) : '';
    const hd = headers(head), ct = hd['content-type'] || 'text/plain', type = ct.split(';')[0].trim().toLowerCase();
    const disp = hd['content-disposition'] || '';
    if (type.startsWith('multipart/')) {
      const b = param(ct, 'boundary'); if (!b) return hd;
      const parts = body.split(new RegExp('\\r?\\n?--' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*\\r?\\n?'));
      for (const p of parts.slice(1)) if (p.trim()) walk(p, out);
      return hd;
    }
    if (type === 'message/rfc822' && !/attachment/i.test(disp)) { walk(body, out); return hd; }
    const name = param(disp, 'filename') || param(ct, 'name');
    const data = decodeBody(body, hd['content-transfer-encoding']);
    const cid = (hd['content-id'] || '').trim().replace(/^<|>$/g, '');
    if (name || /attachment/i.test(disp) || !type.startsWith('text/')) {
      out.parts.push({ name: name || (cid ? cid.split('@')[0] : 'bijlage'), type, data, cid, loc: hd['content-location'] || '' });
    } else if (type === 'text/plain' && !out.text) out.text = decodeCharset(data, param(ct, 'charset'));
    else if (type === 'text/html' && !out.html) out.html = decodeCharset(data, param(ct, 'charset'));
    return hd;
  }
  function parseEml(buf) {
    const str = latin1(new Uint8Array(buf));
    const out = { parts: [], text: '', html: '' };
    const hd = walk(str, out);
    const attachments = [], inline = [];
    for (const p of out.parts) {
      if ((p.cid && out.html.includes('cid:' + p.cid)) || (p.loc && out.html.includes(p.loc))) inline.push(p); else attachments.push(p);
    }
    let date = ''; try { const d = new Date(hd['date']); if (!isNaN(d)) date = d.toISOString(); } catch (e) {}
    return { subject: decodeWords(hd['subject'] || '').trim(), from: decodeWords(hd['from'] || ''), date, body: (out.text || htmlToText(out.html)).replace(/\r\n/g, '\n').trim(), html: out.html, attachments, inline };
  }
  function htmlToText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(String(html).replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, m => m + '\n'), 'text/html');
    doc.querySelectorAll('style,script,head').forEach(n => n.remove());
    return (doc.body?.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  async function parseFile(file) {
    const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf, 0, 8);
    if (u8[0] === 0xD0 && u8[1] === 0xCF) return parseMsg(buf);
    return parseEml(buf);
  }
  return { parseFile, parseMsg, parseEml, htmlToText, guessType, decompressRTF, htmlFromRTF };
})();

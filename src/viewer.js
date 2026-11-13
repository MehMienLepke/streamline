/* ==========================================================================
   Streamline — mails en bijlagen bekijken
   - Mail-HTML wordt opgeschoond en in een afgeschermd venster (iframe zonder scripts) getoond.
   - Afbeeldingen uit de mail zelf (cid:) worden getoond; afbeeldingen van internet worden
     standaard geblokkeerd (privacy: geen 'leesbevestiging' via verborgen plaatjes).
   - Bijlagen bekijken in een pop-up; Word/Excel/PowerPoint worden lokaal uitgelezen.
   ========================================================================== */

/* ---------- zip lezen (voor .docx/.xlsx/.pptx) ---------- */
async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('geen zip');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl));
    files[name] = { method, csize, off };
    p += 46 + nl + xl + cl;
  }
  return {
    names: Object.keys(files),
    async read(name) {
      const f = files[name]; if (!f) return null;
      const lnl = dv.getUint16(f.off + 26, true), lxl = dv.getUint16(f.off + 28, true);
      const data = bytes.subarray(f.off + 30 + lnl + lxl, f.off + 30 + lnl + lxl + f.csize);
      if (f.method === 0) return data;
      const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(ds).arrayBuffer());
    },
    async text(name) { const b = await this.read(name); return b ? new TextDecoder().decode(b) : null; },
  };
}
const xmlDoc = s => new DOMParser().parseFromString(s, 'application/xml');
const byTag = (node, tag) => [...node.getElementsByTagName(tag)];
async function docxPreview(bytes) {
  const z = await unzip(bytes); const doc = xmlDoc(await z.text('word/document.xml'));
  const box = h('div', { class: 'docprev' });
  const body = byTag(doc, 'w:body')[0]; if (!body) throw new Error('leeg');
  const para = p => {
    const style = byTag(p, 'w:pStyle')[0]?.getAttribute('w:val') || '';
    const el = h(/^(Heading|Kop)\s?1|Title|Titel/i.test(style) ? 'h2' : /^(Heading|Kop)\s?[2-3]/i.test(style) ? 'h3' : byTag(p, 'w:numPr').length ? 'li' : 'p');
    for (const r of byTag(p, 'w:r')) {
      const t = byTag(r, 'w:t').map(x => x.textContent).join('') + (byTag(r, 'w:tab').length ? '\t' : '') + (byTag(r, 'w:br').length ? '\n' : '');
      if (!t) continue;
      let node = document.createTextNode(t);
      if (byTag(r, 'w:b').length) node = h('b', {}, node);
      if (byTag(r, 'w:i').length) node = h('i', {}, node);
      el.append(node);
    }
    return el;
  };
  for (const c of body.children) {
    if (c.tagName === 'w:p') box.append(para(c));
    else if (c.tagName === 'w:tbl') box.append(h('table', {}, byTag(c, 'w:tr').map(tr => h('tr', {}, byTag(tr, 'w:tc').map(tc => h('td', {}, byTag(tc, 'w:p').map(para)))))));
  }
  return box;
}
async function xlsxPreview(bytes) {
  const z = await unzip(bytes);
  const ss = await z.text('xl/sharedStrings.xml');
  const strings = ss ? byTag(xmlDoc(ss), 'si').map(si => byTag(si, 't').map(t => t.textContent).join('')) : [];
  const wb = xmlDoc(await z.text('xl/workbook.xml'));
  const sheets = byTag(wb, 'sheet').map((s, i) => ({ name: s.getAttribute('name'), file: `xl/worksheets/sheet${i + 1}.xml` }));
  const box = h('div', { class: 'docprev' });
  const tabs = h('div', { class: 'seg', style: { marginBottom: '10px' } });
  const area = h('div', { class: 'xlwrap' });
  const show = async i => {
    $$('button', tabs).forEach((b, j) => b.classList.toggle('on', i === j));
    const x = await z.text(sheets[i].file); area.innerHTML = '';
    if (!x) return area.append(h('div', { class: 'hint' }, 'Leeg werkblad'));
    const rows = byTag(xmlDoc(x), 'row').slice(0, 500);
    const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref || ''); return m ? [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : 0; };
    const table = h('table');
    for (const r of rows) {
      const cells = []; let max = 0;
      for (const c of byTag(r, 'c')) {
        const i2 = colIdx(c.getAttribute('r')), t = c.getAttribute('t'), v = byTag(c, 'v')[0]?.textContent ?? byTag(c, 't').map(e => e.textContent).join('');
        cells[i2] = t === 's' ? strings[+v] ?? '' : v ?? ''; max = Math.max(max, i2 + 1);
      }
      table.append(h('tr', {}, Array.from({ length: max }, (_, i3) => h('td', {}, cells[i3] ?? ''))));
    }
    area.append(table);
    if (byTag(xmlDoc(x), 'row').length > 500) area.append(h('div', { class: 'hint' }, 'Alleen de eerste 500 rijen worden getoond.'));
  };
  sheets.forEach((s, i) => tabs.append(h('button', { onclick: () => show(i) }, s.name)));
  if (sheets.length > 1) box.append(tabs);
  box.append(area); await show(0);
  return box;
}
async function pptxPreview(bytes) {
  const z = await unzip(bytes);
  const slides = z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  const box = h('div', { class: 'docprev' });
  for (const [i, s] of slides.entries()) {
    const d = xmlDoc(await z.text(s));
    const paras = byTag(d, 'a:p').map(p => byTag(p, 'a:t').map(t => t.textContent).join('')).filter(Boolean);
    box.append(h('div', { class: 'slide' }, h('span', { class: 'lbl' }, 'Dia ' + (i + 1)), paras.length ? [h('h3', {}, paras[0]), paras.slice(1).map(t => h('p', {}, t))] : h('p', { class: 'hint' }, '(alleen afbeeldingen)')));
  }
  return box;
}

/* ---------- mail-HTML veilig tonen ---------- */
function sanitizeMailHTML(html, inline, allowRemote) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.querySelectorAll('script,iframe,frame,frameset,object,embed,applet,form,input,button,textarea,select,base,meta[http-equiv],link').forEach(n => n.remove());
  let remote = 0;
  for (const el of doc.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = a.value.trim();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src' || n === 'background' || n === 'action' || n === 'xlink:href') && /^\s*(javascript|vbscript|data:text)/i.test(v)) el.removeAttribute(a.name);
    }
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    for (const attr of ['src', 'background']) {
      const v = el.getAttribute(attr); if (!v) continue;
      const cid = /^cid:(.+)$/i.exec(v.trim());
      if (cid) { const u = inline[cid[1]] || inline[decodeURIComponent(cid[1])]; if (u) el.setAttribute(attr, u); else el.removeAttribute(attr); }
      else if (/^https?:/i.test(v) && !allowRemote) { el.setAttribute('data-blocked-' + attr, v); el.removeAttribute(attr); remote++; }
    }
    const st = el.getAttribute('style');
    if (st && /url\s*\(/i.test(st)) {
      el.setAttribute('style', st.replace(/url\s*\(\s*['"]?\s*cid:([^'")\s]+)\s*['"]?\s*\)/gi, (m, c) => inline[c] ? `url("${inline[c]}")` : 'none')
        .replace(/url\s*\(\s*['"]?\s*https?:[^)]*\)/gi, m => { if (allowRemote) return m; remote++; return 'none'; }));
    }
  }
  for (const s of doc.querySelectorAll('style')) s.textContent = s.textContent.replace(/@import[^;]+;/gi, '').replace(/url\s*\(\s*['"]?https?:[^)]*\)/gi, m => { if (allowRemote) return m; remote++; return 'none'; });
  return { html: '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff;color:#111;font:14px/1.5 "Segoe UI",system-ui,sans-serif;overflow-wrap:anywhere}body{padding:14px 16px}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>' + doc.head.innerHTML + '</head><body>' + doc.body.innerHTML + '</body></html>', remote };
}
function mailFrame(html, inline) {
  const wrap = h('div', { class: 'mailframe' });
  const draw = allowRemote => {
    wrap.innerHTML = '';
    const r = sanitizeMailHTML(html, inline, allowRemote);
    if (r.remote && !allowRemote) wrap.append(h('div', { class: 'mailwarn' }, h('span', { html: icon('shield', 14) }), `${r.remote} afbeelding${r.remote === 1 ? '' : 'en'} van internet geblokkeerd voor je privacy.`, h('button', { class: 'linkbtn', onclick: () => draw(true) }, 'Toch laden')));
    const fr = h('iframe', { sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox', title: 'E-mail', referrerpolicy: 'no-referrer' });
    fr.srcdoc = r.html;
    fr.addEventListener('load', () => {
      const fit = () => { try { fr.style.height = Math.min(Math.max(fr.contentDocument.documentElement.scrollHeight, 80), 520) + 'px'; } catch (e) {} };
      fit(); try { fr.contentDocument.querySelectorAll('img').forEach(i => i.addEventListener('load', fit)); } catch (e) {}
    });
    wrap.append(fr);
  };
  draw(false);
  return wrap;
}

/* ---------- bijlagen-viewer ---------- */
const ICON_FOR = t => /^image\//.test(t) ? 'image' : /pdf/.test(t) ? 'filetext' : /^audio\//.test(t) ? 'music' : /^video\//.test(t) ? 'video' : /sheet|excel|csv/.test(t) ? 'chart' : /presentation|powerpoint/.test(t) ? 'layout' : /word|document|text/.test(t) ? 'filetext' : 'file';
function attType(a) { const t = a.type && a.type !== 'application/octet-stream' ? a.type : MailParser.guessType(a.name); return t.toLowerCase(); }
async function attachmentPreview(a, bytes) {
  const t = attType(a), ext = a.name.split('.').pop().toLowerCase();
  const url = () => URL.createObjectURL(new Blob([bytes], { type: t }));
  if (t.startsWith('image/') && t !== 'image/tiff') return h('div', { class: 'pv-img' }, h('img', { src: url(), alt: a.name }));
  if (t === 'application/pdf') return h('iframe', { class: 'pv-pdf', src: url(), title: a.name });
  if (t.startsWith('audio/')) return h('audio', { src: url(), controls: true, style: { width: '100%' } });
  if (t.startsWith('video/')) return h('video', { src: url(), controls: true, class: 'pv-video' });
  if (ext === 'docx') return docxPreview(bytes);
  if (ext === 'xlsx') return xlsxPreview(bytes);
  if (ext === 'pptx') return pptxPreview(bytes);
  if (ext === 'msg' || ext === 'eml' || t === 'message/rfc822') {
    const m = ext === 'msg' ? MailParser.parseMsg(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) : MailParser.parseEml(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const inline = {}; for (const i of m.inline || []) inline[i.cid] = 'data:' + (i.type || 'image/png') + ';base64,' + B64.enc(i.data);
    return h('div', {}, h('div', { class: 'mailbox', style: { marginBottom: '8px' } }, h('b', {}, m.subject || '(geen onderwerp)'), m.from ? h('div', {}, 'Van: ' + m.from) : null),
      m.html ? mailFrame(m.html, inline) : h('pre', { class: 'mailbody' }, m.body), (m.attachments || []).length ? h('div', { class: 'hint' }, 'Bevat zelf ook ' + m.attachments.length + ' bijlage(n).') : null);
  }
  if (t === 'text/html') return mailFrame(new TextDecoder().decode(bytes), {});
  if (t.startsWith('text/') || /json|xml|csv/.test(t) || ['txt', 'md', 'log', 'csv', 'json', 'xml', 'ini', 'yml', 'yaml'].includes(ext)) {
    const txt = new TextDecoder().decode(bytes.subarray(0, 400000));
    if (ext === 'csv' || t === 'text/csv') {
      const sep = (txt.split('\n')[0].match(/;/g) || []).length > (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      return h('div', { class: 'docprev xlwrap' }, h('table', {}, txt.split(/\r?\n/).slice(0, 500).filter(Boolean).map(l => h('tr', {}, l.split(sep).map(c => h('td', {}, c.replace(/^"|"$/g, '')))))));
    }
    return h('pre', { class: 'pv-text' }, txt);
  }
  return null;
}
function openAttachmentViewer(list, index, load) {
  let i = index;
  const cache = new Map();
  const get = async a => { if (!cache.has(a.id || a.name)) cache.set(a.id || a.name, await load(a)); return cache.get(a.id || a.name); };
  const title = h('div', { class: 'pv-title' });
  const area = h('div', { class: 'pv-area' });
  const prev = ib('chevronleft', 'Vorige bijlage', () => { i = (i - 1 + list.length) % list.length; draw(); });
  const next = ib('chevronright', 'Volgende bijlage', () => { i = (i + 1) % list.length; draw(); });
  const dl = h('button', { class: 'btn primary sm', onclick: async () => { const a = list[i]; try { download(a.name, new Blob([await get(a)], { type: attType(a) })); } catch (e) { toast('Downloaden mislukt: ' + e.message); } } }, h('span', { html: icon('download', 14) }), 'Downloaden');
  const all = list.length > 1 ? h('button', { class: 'btn sm', onclick: () => downloadAllAttachments(list, get) }, h('span', { html: icon('layers', 14) }), `Alle ${list.length} downloaden`) : null;
  const bar = h('div', { class: 'pv-bar' }, list.length > 1 ? prev : null, title, list.length > 1 ? next : null, h('span', { class: 'grow' }), dl, all);
  const draw = async () => {
    const a = list[i];
    title.innerHTML = ''; title.append(h('span', { html: icon(ICON_FOR(attType(a)), 18) }), h('b', {}, a.name), h('span', { class: 'cr-info' }, (a.size ? fmtSize(a.size) : '') + (list.length > 1 ? ` · ${i + 1} van ${list.length}` : '')));
    area.innerHTML = ''; area.append(h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' Laden…'));
    try {
      const bytes = await get(a);
      if (list[i] !== a) return;
      const el = await attachmentPreview(a, bytes);
      area.innerHTML = '';
      area.append(el || h('div', { class: 'missing', style: { minHeight: '240px' } }, h('span', { html: icon(ICON_FOR(attType(a)), 40) }), h('b', {}, 'Geen voorbeeld beschikbaar'), h('span', {}, 'Dit bestandstype kan Streamline niet tonen. Download het om het te openen.')));
    } catch (e) {
      area.innerHTML = ''; area.append(h('div', { class: 'missing', style: { minHeight: '200px' } }, h('span', { html: icon('alert', 32) }), h('b', {}, 'Kon de bijlage niet tonen'), h('span', {}, e.name === 'NotFoundError' ? 'De bijlage is nog niet binnen. OneDrive is waarschijnlijk nog aan het synchroniseren.' : e.message)));
    }
  };
  const m = openModal({ title: 'Bijlage', wide: true, body: [bar, area] });
  m.el.classList.add('pv');
  const key = e => { if (e.key === 'ArrowRight' && list.length > 1) next.click(); if (e.key === 'ArrowLeft' && list.length > 1) prev.click(); };
  document.addEventListener('keydown', key);
  const oc = m.close; m.close = () => { document.removeEventListener('keydown', key); oc(); };
  draw();
}
async function downloadAllAttachments(list, get) {
  toast(`Bezig met ${list.length} bijlagen…`);
  try {
    const names = new Set(), files = [];
    for (const a of list) {
      let n = a.name, k = 2; while (names.has(n.toLowerCase())) n = a.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`); names.add(n.toLowerCase());
      files.push({ name: n, data: await get(a) });
    }
    download('bijlagen.zip', makeZip(files));
  } catch (e) { toast('Downloaden mislukt: ' + e.message, 5000); }
}

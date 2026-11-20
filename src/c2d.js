/* ==========================================================================
   Streamline — module "Citrix to Desktop"
   Links: teksten met een kopieerknop. Rechts: bestanden heen en weer.
   Alles staat als losse bestanden in een map (standaard "Citrix naar Desktop" in je
   Streamline-map). Open je Streamline in Citrix én op je eigen computer met dezelfde
   map, dan zie je aan beide kanten direct hetzelfde.
     teksten/<id>.json      een tekst
     bestanden/...          bestanden en complete mappen
     .prullenbak/<tijd>/    weggesleepte of verwijderde onderdelen (7 dagen bewaard)
   ========================================================================== */
const C2D_FOLDER = 'Citrix naar Desktop';
const C2D_POLL = 2500;
const C2D_TRASH_DAYS = 7;
const C2D = new Map(); // item.id -> toestand

function toastAction(msg, label, fn, ms = 8000) {
  const t = h('div', { class: 'toast act' }, h('span', {}, msg), h('button', { class: 'toast-btn', onclick: () => { t.remove(); fn(); } }, label));
  $('#toasts').append(t); setTimeout(() => t.remove(), ms);
}
async function c2dDir(item, ask) {
  const st = C2D.get(item.id);
  let d = await IDB.get('c2d:' + item.id);
  if (d) {
    let p = 'prompt'; try { p = await d.queryPermission({ mode: 'readwrite' }); } catch (e) {}
    if (p !== 'granted' && (ask || navigator.userActivation?.isActive)) { try { p = await d.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
    if (p !== 'granted') { st.status = 'perm'; st.dirName = d.name; return null; }
    st.custom = true; st.dirName = d.name; return d;
  }
  st.custom = false;
  if (!FS.dir) { st.status = 'nodir'; return null; }
  if (!FS.perm && !(ask && await ensurePerm())) { st.status = 'perm'; st.dirName = FS.dir.name; return null; }
  st.dirName = FS.dir.name + ' / ' + C2D_FOLDER;
  return FS.dir.getDirectoryHandle(C2D_FOLDER, { create: true });
}
const C2D_SKIP = /^(~\$|\.DS_Store$|Thumbs\.db$|desktop\.ini$)|\.crswap$/i;
async function c2dList(dir, name) {
  const out = [];
  try {
    const sub = await dir.getDirectoryHandle(name, { create: true });
    for await (const [n, hd] of sub.entries()) if (hd.kind === 'file' && !C2D_SKIP.test(n)) { const f = await hd.getFile(); out.push({ name: n, handle: hd, file: f, stamp: f.lastModified, size: f.size }); }
  } catch (e) { if (e.name === 'NotAllowedError') throw e; }
  return out;
}
// alle bestanden en mappen onder "bestanden", inclusief submappen
async function c2dWalk(dh, prefix, out) {
  for await (const [n, hd] of dh.entries()) {
    if (C2D_SKIP.test(n)) continue;
    const path = prefix ? prefix + '/' + n : n;
    if (hd.kind === 'directory') { out.dirs.push({ dir: true, name: n, path, parent: prefix, handle: hd, parentHandle: dh }); await c2dWalk(hd, path, out); }
    else {
      try { const f = await hd.getFile(); out.files.push({ name: n, path, parent: prefix, handle: hd, parentHandle: dh, file: f, stamp: f.lastModified, size: f.size }); }
      catch (e) { if (e.name === 'NotAllowedError') throw e; }
    }
  }
  return out;
}
function c2dZipReset(st) { for (const z of st.zips.values()) if (z.url) URL.revokeObjectURL(z.url); st.zips = new Map(); }
async function c2dSync(item, force) {
  const st = C2D.get(item.id); if (!st || st.busy) return;
  if (document.hidden && !force) return;
  st.busy = true;
  try {
    const dir = st.dir || (st.dir = await c2dDir(item, false));
    if (!dir) { if (st.lastStatus !== st.status) { st.lastStatus = st.status; c2dRender(item); } return; }
    st.status = 'ok';
    const [texts, tree] = await Promise.all([
      c2dList(dir, 'teksten'),
      dir.getDirectoryHandle('bestanden', { create: true }).then(b => c2dWalk(b, '', { files: [], dirs: [] })),
    ]);
    // teksten inlezen (alleen gewijzigde)
    const tmap = new Map();
    for (const t of texts.filter(x => x.name.endsWith('.json'))) {
      const id = t.name.slice(0, -5), prev = st.texts.get(id);
      if (prev && prev.stamp === t.stamp) { tmap.set(id, prev); continue; }
      try { tmap.set(id, { ...JSON.parse(await t.file.text()), id, stamp: t.stamp }); } catch (e) { if (prev) tmap.set(id, prev); }
    }
    const sig = [...tmap.values()].map(t => t.id + t.stamp).join() + '|' + tree.files.map(f => f.path + f.stamp + f.size).join() + '|' + tree.dirs.map(d => d.path).join();
    st.texts = tmap;
    st.files = tree.files.sort((a, b) => b.stamp - a.stamp);
    st.dirs = tree.dirs.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    if (st.path && !st.dirs.some(d => d.path === st.path)) st.path = ''; // map is aan de andere kant weggehaald
    if (sig !== st.sig || st.lastStatus !== 'ok') { st.sig = sig; st.lastStatus = 'ok'; c2dZipReset(st); c2dRender(item); }
    // prullenbak opruimen
    if (!st.cleaned || Date.now() - st.cleaned > 3600000) {
      st.cleaned = Date.now();
      try {
        const tr = await dir.getDirectoryHandle('.prullenbak', { create: true }), max = C2D_TRASH_DAYS * 864e5;
        for await (const [n, hd] of tr.entries()) {
          const old = hd.kind === 'directory' ? Date.now() - (parseInt(n, 10) || Date.now()) > max : Date.now() - (await hd.getFile()).lastModified > max;
          if (old) await tr.removeEntry(n, { recursive: true });
        }
      } catch (e) {}
    }
  } catch (e) {
    if (e.name === 'NotAllowedError') { st.dir = null; st.status = 'perm'; } else { st.status = 'error'; st.error = e.message; }
    if (st.lastStatus !== st.status) { st.lastStatus = st.status; c2dRender(item); }
  } finally { st.busy = false; }
}
function c2dRender(item) {
  const el = els.get(item.id); if (!el) return;
  const a = document.activeElement;
  if (a && el.contains(a) && a.matches('[contenteditable="true"],input,textarea')) { a.addEventListener('blur', () => c2dRender(item), { once: true }); return; }
  buildItem(item);
}
async function c2dNames(dh) { const s = new Set(); for await (const k of dh.keys()) s.add(k.toLowerCase()); return s; }
function c2dFree(names, name, isDir) {
  const dot = isDir ? -1 : name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  let n = name, i = 2;
  while (names.has(n.toLowerCase())) n = `${base} (${i++})${ext}`;
  names.add(n.toLowerCase()); return n;
}
async function c2dSubdir(root, path) { let d = root; for (const p of (path || '').split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: true }); return d; }
async function c2dWrite(dh, name, blob) { const w = await (await dh.getFileHandle(name, { create: true })).createWritable(); await w.write(blob); await w.close(); }
async function c2dCopy(src, dest, name) {
  if (src.kind === 'file') return c2dWrite(dest, name, await src.getFile());
  const d = await dest.getDirectoryHandle(name, { create: true });
  for await (const [n, hd] of src.entries()) await c2dCopy(hd, d, n);
}
// uit een sleepactie: bestanden én complete mappen (met submappen) uitlezen
async function c2dFromEntries(entries) {
  const out = [];
  const walk = async (en, prefix) => {
    if (en.isFile) { const f = await new Promise((res, rej) => en.file(res, rej)); out.push({ path: prefix + en.name, file: f }); }
    else if (en.isDirectory) {
      const r = en.createReader(); let batch;
      do { batch = await new Promise((res, rej) => r.readEntries(res, rej)); for (const c of batch) await walk(c, prefix + en.name + '/'); } while (batch.length);
    }
  };
  for (const en of entries) await walk(en, '');
  return out.filter(x => !C2D_SKIP.test(x.path.split('/').pop()));
}
// list: [{ path: 'map/sub/bestand.pdf' of 'bestand.pdf', file }]
async function c2dAddFiles(item, list) {
  const st = C2D.get(item.id); if (!st.dir) return toast('Koppel eerst een map');
  if (!list.length) return toast('Geen bestanden gevonden (lege map?)');
  if (list.length > 15) toast(`Bezig met ${list.length} bestanden…`);
  let n = 0;
  const folders = new Set();
  try {
    const base = await c2dSubdir(await st.dir.getDirectoryHandle('bestanden', { create: true }), st.path);
    const names = await c2dNames(base), top = new Map();
    for (const { path, file } of list) {
      try {
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 1) await c2dWrite(base, c2dFree(names, parts[0] || 'bestand'), file);
        else {
          // bestaat er al een map met die naam, dan wordt het "Map (2)" — nooit stilletjes samenvoegen
          if (!top.has(parts[0])) top.set(parts[0], c2dFree(names, parts[0], true));
          parts[0] = top.get(parts[0]); folders.add(parts[0]);
          await c2dWrite(await c2dSubdir(base, parts.slice(0, -1).join('/')), parts.at(-1), file);
        }
        n++;
      } catch (e) { toast('Opslaan van ' + path + ' mislukt: ' + e.message, 5000); }
    }
  } catch (e) { toast('Opslaan mislukt: ' + e.message, 5000); }
  if (n) toast(folders.size ? `${folders.size === 1 ? 'Map' : folders.size + ' mappen'} opgeslagen (${n} ${n === 1 ? 'bestand' : 'bestanden'})` : n === 1 ? 'Bestand opgeslagen' : n + ' bestanden opgeslagen');
  c2dSync(item, true);
}
// naar de prullenbak (7 dagen bewaard), met één knop om alles terug te zetten
async function c2dTrash(item, list, msg) {
  const st = C2D.get(item.id), dir = st.dir; if (!dir || !list.length) return;
  try {
    const tr = await dir.getDirectoryHandle('.prullenbak', { create: true });
    const box = await tr.getDirectoryHandle(Date.now() + '-' + Math.random().toString(36).slice(2, 6), { create: true });
    const names = new Set(), moved = [];
    for (const en of list) {
      const nm = c2dFree(names, en.name, en.dir);
      await c2dCopy(en.handle, box, nm);
      await en.parentHandle.removeEntry(en.name, { recursive: true });
      moved.push({ nm, name: en.name, parent: en.parent, dir: !!en.dir });
    }
    c2dSync(item, true);
    toastAction(msg || (list.length === 1 ? `“${list[0].name}” verwijderd` : `${list.length} onderdelen verwijderd`), 'Ongedaan maken', async () => {
      try {
        const root = await dir.getDirectoryHandle('bestanden', { create: true });
        for (const m of moved) {
          const p = await c2dSubdir(root, m.parent);
          const src = m.dir ? await box.getDirectoryHandle(m.nm) : await box.getFileHandle(m.nm);
          await c2dCopy(src, p, c2dFree(await c2dNames(p), m.name, m.dir));
        }
        await tr.removeEntry(box.name, { recursive: true }); c2dSync(item, true);
      } catch (e) { toast('Terugzetten mislukt: ' + e.message); }
    });
  } catch (e) { toast('Verwijderen mislukt: ' + e.message, 5000); c2dSync(item, true); }
}
// alle bestanden onder 'entries' in één zip; namen beginnen na 'prefix'
function c2dFilesUnder(st, entries) { return entries.flatMap(en => en.dir ? st.files.filter(f => f.path.startsWith(en.path + '/')) : [en]); }
async function c2dZip(st, prefix, entries) {
  const files = [];
  for (const f of c2dFilesUnder(st, entries)) {
    let file = f.file; try { file = await f.handle.getFile(); } catch (e) {}
    files.push({ name: f.path.slice(prefix.length), data: new Uint8Array(await file.arrayBuffer()) });
  }
  return makeZip(files);
}
const C2D_ZIP_MAX = 400 * 1024 * 1024; // groter dan dit: niet als zip klaarzetten om te slepen
// Slepen naar het bureaublad moet direct bij de start weten welk bestand het is.
// Daarom zetten we de zip alvast klaar zodra je muis erboven komt.
function c2dPrepZip(st, key, prefix, entries) {
  if (st.zips.has(key)) return;
  const size = c2dFilesUnder(st, entries).reduce((n, f) => n + f.size, 0);
  const z = { size, big: size > C2D_ZIP_MAX }; st.zips.set(key, z);
  if (z.big) return;
  c2dZip(st, prefix, entries).then(b => { if (st.zips.get(key) === z) { z.blob = b; z.url = URL.createObjectURL(b); } }).catch(() => st.zips.delete(key));
}
async function c2dDownloadAll(item, kids) {
  const st = C2D.get(item.id); if (!kids.length) return;
  toast(kids.length === 1 ? 'Downloaden…' : `${kids.length} onderdelen downloaden…`);
  try {
    for (const en of kids) {
      if (en.dir) download(en.name + '.zip', await c2dZip(st, en.path + '/', [en]));
      else { let file = en.file; try { file = await en.handle.getFile(); } catch (e) {} download(en.name, file); }
      await new Promise(r => setTimeout(r, 350)); // Chrome slaat downloads over die te snel achter elkaar komen
    }
  } catch (e) { return toast('Downloaden mislukt: ' + e.message, 5000); }
  toastAction(kids.length === 1 ? `“${kids[0].name}” gedownload. Uit Streamline halen?` : `${kids.length} onderdelen gedownload. Uit Streamline halen?`, 'Uit Streamline halen',
    () => c2dTrash(item, kids, kids.length === 1 ? `“${kids[0].name}” uit Streamline gehaald` : `${kids.length} onderdelen uit Streamline gehaald`), 15000);
}
async function c2dSaveText(item, t) {
  const st = C2D.get(item.id), dir = st.dir; if (!dir) return;
  try {
    const sub = await dir.getDirectoryHandle('teksten', { create: true });
    const w = await (await sub.getFileHandle(t.id + '.json', { create: true })).createWritable();
    await w.write(JSON.stringify({ html: t.html, created: t.created, updated: Date.now() })); await w.close();
    t.stamp = (await (await sub.getFileHandle(t.id + '.json')).getFile()).lastModified;
    st.texts.set(t.id, t);
  } catch (e) { toast('Opslaan van de tekst mislukt: ' + e.message, 5000); }
}
function copyLegacy(html) {
  // klassieke manier (zoals Ctrl+C): werkt ook als de browser het klembord-verzoek blokkeert
  const box = h('div', { html, style: { position: 'fixed', left: '-9999px', top: '0', whiteSpace: 'pre-wrap' } });
  document.body.append(box);
  const sel = getSelection(), r = document.createRange(); r.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(r);
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  sel.removeAllRanges(); box.remove();
  return ok;
}
async function copyRich(html) {
  const text = (h('div', { html }).innerText || '').trim();
  const timeout = new Promise(res => setTimeout(() => res('timeout'), 1500));
  try {
    const job = window.ClipboardItem
      ? navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
      : navigator.clipboard.writeText(text);
    if ((await Promise.race([job.then(() => 'ok'), timeout])) === 'ok') return true;
  } catch (e) {}
  return copyLegacy(html);
}

reg({
  type: 'c2d', name: 'Citrix to Desktop', desc: 'Teksten kopiëren en bestanden overzetten tussen Citrix en je eigen computer', icon: 'monitor', group: 'widgets',
  size: { w: 14, h: 9 }, min: { w: 6, h: 5 },
  defaults: { title: 'Citrix to Desktop', split: 50, newOnTop: true },
  fields: [
    { key: 'title', label: 'Kop', type: 'text' },
    { key: 'split', label: 'Breedte tekstkolom', type: 'range', min: 25, max: 75, step: 5, unit: '%' },
    { key: 'newOnTop', label: 'Nieuwe teksten bovenaan', type: 'checkbox' },
  ],
  editor(el, cfg, item) {
    const st = C2D.get(item.id);
    el.append(h('div', { class: 'sect' }, h('h4', {}, 'Map'),
      h('div', { class: 'list-row' }, h('span', { html: icon('folder', 16) }), h('span', { class: 'grow' }, st?.dirName || '—')),
      h('div', { class: 'row', style: { flexWrap: 'wrap', marginTop: '8px' } },
        h('button', { class: 'btn sm', onclick: async () => {
          try { const d = await window.showDirectoryPicker({ id: 'streamline-c2d', mode: 'readwrite' }); await IDB.set('c2d:' + item.id, d); const s2 = C2D.get(item.id); if (s2) { s2.dir = null; s2.sig = ''; } await c2dSync(item, true); toast('Map gekozen: ' + d.name); } catch (e) {}
        } }, h('span', { html: icon('folder', 14) }), 'Andere map kiezen'),
        h('button', { class: 'btn sm', onclick: async () => { await IDB.set('c2d:' + item.id, null); const s2 = C2D.get(item.id); if (s2) { s2.dir = null; s2.sig = ''; } await c2dSync(item, true); toast('Weer de standaardmap in je Streamline-map'); } }, 'Standaardmap')),
      h('p', { class: 'hint' }, 'Beide kanten (Citrix en je eigen computer) moeten dezelfde map gebruiken, bijvoorbeeld een map in OneDrive of op een netwerkschijf die je in Citrix én thuis/op kantoor ziet. Gebruiken beide kanten dezelfde Streamline-map, dan hoef je niets te kiezen.')));
  },
  render(el, ctx) {
    const item = ctx.item, c = ctx.config;
    let st = C2D.get(item.id);
    if (!st) {
      st = { texts: new Map(), files: [], dirs: [], path: '', zips: new Map(), sig: '', status: 'load', urls: [] };
      C2D.set(item.id, st);
      st.timer = setInterval(() => c2dSync(item), C2D_POLL);
      c2dSync(item, true);
    }
    st.urls.forEach(u => URL.revokeObjectURL(u)); st.urls = [];
    if (st.status !== 'ok') {
      const msg = {
        load: ['clock', 'Laden…', ''],
        nodir: ['folder', 'Nog geen map', 'Koppel eerst je Streamline-map (bovenin de balk of bij Instellingen → Bestanden), of kies in de instellingen van deze widget een eigen map.'],
        perm: ['folder', 'Toestemming nodig', `Chrome vraagt toestemming voor de map “${st.dirName || ''}”.`],
        error: ['alert', 'Map niet bereikbaar', st.error || ''],
      }[st.status] || ['clock', '', ''];
      el.append(h('div', { class: 'missing' }, h('span', { html: icon(msg[0], 26) }), h('b', {}, msg[1]), h('span', {}, msg[2]),
        st.status === 'perm' || st.status === 'error' ? h('button', { class: 'btn primary sm', onclick: async () => { st.dir = await c2dDir(item, true); st.sig = ''; c2dSync(item, true); } }, 'Toestemming geven') : null));
      return;
    }
    /* ---- links: teksten ---- */
    const texts = [...st.texts.values()].sort((a, b) => c.newOnTop !== false ? b.created - a.created : a.created - b.created);
    const list = h('div', { class: 'notes' });
    for (const t of texts) {
      const ed = h('div', { class: 'ne', contenteditable: 'true', 'data-ph': 'Plak of typ een tekst…', html: sanitize(t.html || '') });
      let timer = null;
      const persist = () => { clearTimeout(timer); t.html = sanitize(ed.innerHTML); c2dSaveText(item, t); };
      ed.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(persist, 600); });
      ed.addEventListener('blur', () => { if (timer) persist(); });
      ed.addEventListener('paste', e => { e.preventDefault(); const html = e.clipboardData.getData('text/html'); if (html) document.execCommand('insertHTML', false, sanitize(html)); else document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
      const tb = h('div', { class: 'nt' }, NOTE_TOOLS.map(([ic, tt, fn]) => h('button', { title: tt, html: icon(ic, 15), onmousedown: e => e.preventDefault(), onclick: async () => { ed.focus(); await fn(); ed.dispatchEvent(new Event('input')); } })));
      const copyBtn = h('button', { class: 'mini copyb', title: 'Tekst kopiëren', html: icon('copy', 15) });
      copyBtn.onclick = async () => {
        if (timer) persist();
        const ok = await copyRich(sanitize(ed.innerHTML));
        if (ok) { copyBtn.classList.add('done'); copyBtn.innerHTML = icon('check', 15); setTimeout(() => { copyBtn.classList.remove('done'); copyBtn.innerHTML = icon('copy', 15); }, 1500); toast('Gekopieerd'); }
        else toast('Kopiëren lukte niet — selecteer de tekst en druk Ctrl+C');
      };
      list.append(h('div', { class: 'note' }, tb, ed, h('div', { class: 'nf' },
        h('span', { class: 'when' }, new Date(t.updated || t.created).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })),
        copyBtn,
        h('button', { class: 'mini', title: 'Tekst verwijderen', html: icon('trash', 15), onclick: async () => {
          if ((t.html || '').trim() && !(await confirmDlg('Tekst verwijderen?', 'Deze tekst verdwijnt aan beide kanten.', 'Verwijderen', true))) return;
          try { await (await st.dir.getDirectoryHandle('teksten')).removeEntry(t.id + '.json'); } catch (e) {}
          st.texts.delete(t.id); c2dSync(item, true); ctx.rerender();
        } }))));
      if (st.focusText === t.id) { st.focusText = null; setTimeout(() => ed.focus(), 30); }
    }
    if (!texts.length) list.append(h('div', { class: 'empty' }, 'Nog geen teksten. Klik op “+ Tekst” en plak iets.'));
    const left = h('div', { class: 'c2d-col' },
      h('div', { class: 'c2d-head' }, h('span', { html: icon('filetext', 15) }), 'Teksten', h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: async () => { const t = { id: uid(), html: '', created: Date.now() }; st.focusText = t.id; st.texts.set(t.id, t); await c2dSaveText(item, t); ctx.rerender(); } }, h('span', { html: icon('plus', 13) }), 'Tekst')),
      list);
    /* ---- rechts: bestanden (tegels, met mappen) ---- */
    const here = st.path || '';
    const kids = [...st.dirs.filter(d => d.parent === here), ...st.files.filter(f => f.parent === here)];
    const go = p => { st.path = p; ctx.rerender(); };
    const view = (list, f) => openAttachmentViewer(list.map(x => ({ name: x.name, type: x.file.type || MailParser.guessType(x.name), size: x.size, id: x.path })), list.indexOf(f),
      async a => { const x = list.find(y => y.path === a.id); let file = x.file; try { file = await x.handle.getFile(); } catch (e) {} return new Uint8Array(await file.arrayBuffer()); });
    const herefiles = kids.filter(k => !k.dir);
    const zipDrag = (el, key, prefix, entries, zipName, label) => {
      el.addEventListener('pointerenter', () => c2dPrepZip(st, key, prefix, entries));
      el.addEventListener('dragstart', e => {
        const z = st.zips.get(key);
        if (!z?.url) {
          e.preventDefault();
          return toast(z?.big ? 'Te groot om als zip te slepen — gebruik “Alles downloaden”' : 'Zip wordt nog klaargemaakt… probeer het zo nog eens', 4000);
        }
        e.dataTransfer.setData('DownloadURL', `application/zip:${zipName}:${z.url}`);
        e.dataTransfer.setData('text/plain', zipName);
        e.dataTransfer.effectAllowed = 'copy';
        st.dragging = key; el.classList.add('dragged');
      });
      el.addEventListener('dragend', e => {
        el.classList.remove('dragged'); st.dragging = null;
        if (e.dataTransfer.dropEffect !== 'none') c2dTrash(item, entries, `${label} is als zip naar je computer gesleept en uit Streamline gehaald`);
      });
    };
    const act = (ic, title, fn) => h('button', { title, html: icon(ic, 14), onclick: e => { e.stopPropagation(); fn(); }, ondblclick: e => e.stopPropagation() });
    const tiles = h('div', { class: 'c2d-tiles' });
    for (const d of kids.filter(k => k.dir)) {
      const inside = c2dFilesUnder(st, [d]);
      const tile = h('div', { class: 'c2d-tile folder', draggable: 'true', title: `${d.name}\nKlik om te openen · sleep naar je bureaublad (als zip)`, onclick: () => go(d.path) },
        h('div', { class: 'th', html: icon('folder', 34) }),
        h('b', {}, d.name), h('small', {}, inside.length === 1 ? '1 bestand' : `${inside.length} bestanden`),
        h('div', { class: 'acts' },
          act('download', 'Downloaden (zip)', () => c2dDownloadAll(item, [d])),
          act('trash', 'Map verwijderen', () => c2dTrash(item, [d]))));
      zipDrag(tile, 'dir:' + d.path, d.path + '/', [d], d.name + '.zip', `“${d.name}”`);
      tiles.append(tile);
    }
    for (const f of herefiles) {
      const url = URL.createObjectURL(f.file); st.urls.push(url);
      const type = f.file.type || MailParser.guessType(f.name);
      const dot = f.name.lastIndexOf('.'), ext = dot > 0 ? f.name.slice(dot + 1, dot + 5).toUpperCase() : '';
      const isImg = /^image\/(png|jpe?g|gif|webp|bmp|svg|avif)/.test(type) && f.size < 25e6;
      const tile = h('div', { class: 'c2d-tile', draggable: 'true', title: `${f.name}\n${fmtSize(f.size)} · ${timeAgo(f.stamp)}\nSleep naar je bureaublad of een map`, ondblclick: () => view(herefiles, f) },
        h('div', { class: 'th' + (isImg ? ' img' : '') }, isImg ? h('img', { src: url, alt: '', draggable: 'false', loading: 'lazy' }) : [h('span', { html: icon(ICON_FOR(type), 30) }), ext ? h('i', { class: 'ext' }, ext) : null]),
        h('b', {}, f.name), h('small', {}, fmtSize(f.size)),
        h('div', { class: 'acts' },
          act('eye', 'Bekijken', () => view(herefiles, f)),
          act('download', 'Downloaden', () => download(f.name, f.file)),
          act('trash', 'Verwijderen', () => c2dTrash(item, [f]))));
      tile.addEventListener('dragstart', e => {
        // Chrome/Edge: bestand naar het bureaublad slepen
        e.dataTransfer.setData('DownloadURL', `${type}:${f.name}:${url}`);
        e.dataTransfer.setData('text/plain', f.name);
        e.dataTransfer.effectAllowed = 'copy';
        st.dragging = f.path; tile.classList.add('dragged');
      });
      tile.addEventListener('dragend', e => {
        tile.classList.remove('dragged'); st.dragging = null;
        if (e.dataTransfer.dropEffect !== 'none') c2dTrash(item, [f], `“${f.name}” is naar je computer gesleept en uit Streamline gehaald`);
      });
      tiles.append(tile);
    }
    const fileInp = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: () => { c2dAddFiles(item, [...fileInp.files].map(f => ({ path: f.name, file: f }))); fileInp.value = ''; } });
    const dirInp = h('input', { type: 'file', multiple: true, webkitdirectory: true, style: { display: 'none' }, onchange: () => { c2dAddFiles(item, [...dirInp.files].filter(f => !C2D_SKIP.test(f.name)).map(f => ({ path: f.webkitRelativePath || f.name, file: f }))); dirInp.value = ''; } });
    let allChip = null;
    if (kids.length) {
      const zipName = (here ? here.split('/').pop() : C2D_FOLDER) + '.zip';
      allChip = h('div', { class: 'c2d-all', draggable: 'true', title: 'Sleep dit naar je bureaublad: je krijgt alles in één zip-bestand' },
        h('span', { html: icon('grip', 14) }), h('span', { html: icon('box', 15) }), h('span', { class: 'grow' }, 'Sleep alles naar je bureaublad'),
        h('span', { class: 'cnt' }, (() => { const fs = c2dFilesUnder(st, kids); return `${fs.length} ${fs.length === 1 ? 'bestand' : 'bestanden'} · ${fmtSize(fs.reduce((n, f) => n + f.size, 0))}`; })()), h('small', {}, 'zip'));
      zipDrag(allChip, 'all:' + here, here ? here + '/' : '', kids, zipName, kids.length === 1 ? `“${kids[0].name}”` : 'Alles');
    }
    const zone = h('div', { class: 'c2d-zone' + (kids.length ? ' has' : '') },
      kids.length ? [tiles, allChip] : h('div', { class: 'cr-drop', onclick: () => !editing && fileInp.click(), html: icon('upload', 30) + (here ? '<b style="color:var(--ink)">Deze map is leeg</b><span>Sleep bestanden of mappen hierheen.</span>' : '<b style="color:var(--ink)">Sleep bestanden of mappen hierheen</b><span>Ze komen aan de andere kant tevoorschijn. Sleep ze daar naar je bureaublad.</span>') }),
      fileInp, dirInp);
    zone.addEventListener('dragover', e => { if (editing || st.dragging || ![...e.dataTransfer.types].some(t => t === 'Files' || t === 'text/plain')) return; e.preventDefault(); e.stopPropagation(); zone.classList.add('dropping'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('dropping'); });
    zone.addEventListener('drop', async e => {
      if (editing || st.dragging) return; e.preventDefault(); e.stopPropagation(); zone.classList.remove('dropping');
      // mappen herkennen: dit moet meteen, vóór er iets anders gebeurt
      const entries = [...(e.dataTransfer.items || [])].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.()).filter(Boolean);
      const files = [...e.dataTransfer.files];
      if (entries.length) return c2dAddFiles(item, await c2dFromEntries(entries));
      if (files.length) return c2dAddFiles(item, files.map(f => ({ path: f.name, file: f })));
      const txt = e.dataTransfer.getData('text/html') || esc(e.dataTransfer.getData('text/plain'));
      if (txt) { const t = { id: uid(), html: sanitize(txt), created: Date.now() }; st.texts.set(t.id, t); await c2dSaveText(item, t); ctx.rerender(); toast('Als tekst toegevoegd'); }
    });
    const crumbs = [h('button', { class: here ? '' : 'cur', onclick: () => go('') }, 'Bestanden')];
    if (here) here.split('/').forEach((p, i, a) => crumbs.push(h('span', { class: 'sep', html: icon('chevronright', 12) }), h('button', { class: i === a.length - 1 ? 'cur' : '', onclick: () => go(a.slice(0, i + 1).join('/')) }, p)));
    const addBtn = h('button', { class: 'btn sm', onclick: () => popover(addBtn, [
      h('button', { class: 'opt', html: icon('file', 15) + 'Bestanden…', onclick: () => { closePop(); fileInp.click(); } }),
      h('button', { class: 'opt', html: icon('folder', 15) + 'Complete map…', onclick: () => { closePop(); dirInp.click(); } }),
    ]) }, h('span', { html: icon('plus', 13) }), 'Toevoegen');
    const right = h('div', { class: 'c2d-col' },
      h('div', { class: 'c2d-head' }, h('span', { html: icon(here ? 'folder' : 'file', 15) }), h('span', { class: 'crumb' }, crumbs),
        h('span', { class: 'grow' }),
        h('span', { class: 'btns' },
          kids.length ? h('button', { class: 'btn sm', title: 'Alles hieronder downloaden naar je Downloads-map (mappen als zip)', onclick: () => c2dDownloadAll(item, kids) }, h('span', { html: icon('download', 13) }), 'Alles downloaden') : null,
          addBtn)),
      zone);
    el.append(h('div', { class: 'c2d', style: { gridTemplateColumns: `${c.split || 50}fr ${100 - (c.split || 50)}fr` } }, left, right),
      h('div', { class: 'todo-foot' }, h('span', { title: st.dirName }, h('span', { html: icon('folder', 12), style: { display: 'inline-block', verticalAlign: '-1px', marginRight: '4px' } }), st.dirName), h('span', { class: 'sync' }, h('span', { html: icon('refresh', 12) }), 'live')));
  },
  destroy(item) { const st = C2D.get(item.id); if (st) { clearInterval(st.timer); st.urls.forEach(u => URL.revokeObjectURL(u)); c2dZipReset(st); C2D.delete(item.id); } },
});

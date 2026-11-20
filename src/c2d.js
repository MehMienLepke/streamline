/* ==========================================================================
   Streamline — module "Citrix to Desktop"
   Links: teksten met een kopieerknop. Rechts: bestanden heen en weer.
   Alles staat als losse bestanden in een map (standaard "Citrix naar Desktop" in je
   Streamline-map). Open je Streamline in Citrix én op je eigen computer met dezelfde
   map, dan zie je aan beide kanten direct hetzelfde.
     teksten/<id>.json      een tekst
     bestanden/<naam>       een bestand
     .prullenbak/<naam>     weggesleepte of verwijderde bestanden (7 dagen bewaard)
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
async function c2dList(dir, name) {
  const out = [];
  try {
    const sub = await dir.getDirectoryHandle(name, { create: true });
    for await (const [n, hd] of sub.entries()) if (hd.kind === 'file' && !n.startsWith('~$') && !n.endsWith('.crswap')) { const f = await hd.getFile(); out.push({ name: n, handle: hd, file: f, stamp: f.lastModified, size: f.size }); }
  } catch (e) { if (e.name === 'NotAllowedError') throw e; }
  return out;
}
async function c2dSync(item, force) {
  const st = C2D.get(item.id); if (!st || st.busy) return;
  if (document.hidden && !force) return;
  st.busy = true;
  try {
    const dir = st.dir || (st.dir = await c2dDir(item, false));
    if (!dir) { if (st.lastStatus !== st.status) { st.lastStatus = st.status; c2dRender(item); } return; }
    st.status = 'ok';
    const [texts, files] = await Promise.all([c2dList(dir, 'teksten'), c2dList(dir, 'bestanden')]);
    // teksten inlezen (alleen gewijzigde)
    const tmap = new Map();
    for (const t of texts.filter(x => x.name.endsWith('.json'))) {
      const id = t.name.slice(0, -5), prev = st.texts.get(id);
      if (prev && prev.stamp === t.stamp) { tmap.set(id, prev); continue; }
      try { tmap.set(id, { ...JSON.parse(await t.file.text()), id, stamp: t.stamp }); } catch (e) { if (prev) tmap.set(id, prev); }
    }
    const sig = [...tmap.values()].map(t => t.id + t.stamp).join() + '|' + files.map(f => f.name + f.stamp + f.size).join();
    st.texts = tmap; st.files = files.sort((a, b) => b.stamp - a.stamp);
    if (sig !== st.sig || st.lastStatus !== 'ok') { st.sig = sig; st.lastStatus = 'ok'; c2dRender(item); }
    // prullenbak opruimen
    if (!st.cleaned || Date.now() - st.cleaned > 3600000) {
      st.cleaned = Date.now();
      try { const tr = await dir.getDirectoryHandle('.prullenbak', { create: true }); for await (const [n, hd] of tr.entries()) { if (hd.kind === 'file' && Date.now() - (await hd.getFile()).lastModified > C2D_TRASH_DAYS * 864e5) await tr.removeEntry(n); } } catch (e) {}
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
async function freeName(sub, name) {
  const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  let n = name, i = 2;
  for (;;) { try { await sub.getFileHandle(n); n = `${base} (${i++})${ext}`; } catch (e) { return n; } }
}
async function c2dAddFiles(item, files) {
  const st = C2D.get(item.id); const dir = st.dir; if (!dir) return toast('Koppel eerst een map');
  const sub = await dir.getDirectoryHandle('bestanden', { create: true });
  let n = 0;
  for (const f of files) {
    try {
      const name = await freeName(sub, f.name || 'bestand');
      const w = await (await sub.getFileHandle(name, { create: true })).createWritable();
      await w.write(f); await w.close(); n++;
    } catch (e) { toast('Opslaan van ' + f.name + ' mislukt: ' + e.message, 5000); }
  }
  if (n) toast(n === 1 ? 'Bestand opgeslagen' : n + ' bestanden opgeslagen');
  c2dSync(item, true);
}
async function c2dTrash(item, f, msg) {
  const st = C2D.get(item.id), dir = st.dir; if (!dir) return;
  try {
    const tr = await dir.getDirectoryHandle('.prullenbak', { create: true });
    const name = await freeName(tr, f.name);
    const w = await (await tr.getFileHandle(name, { create: true })).createWritable();
    await w.write(await f.handle.getFile()); await w.close();
    await (await dir.getDirectoryHandle('bestanden')).removeEntry(f.name);
    c2dSync(item, true);
    toastAction(msg || `“${f.name}” verwijderd`, 'Ongedaan maken', async () => {
      try {
        const sub = await dir.getDirectoryHandle('bestanden', { create: true });
        const back = await freeName(sub, f.name);
        const w2 = await (await sub.getFileHandle(back, { create: true })).createWritable();
        await w2.write(await (await tr.getFileHandle(name)).getFile()); await w2.close();
        await tr.removeEntry(name); c2dSync(item, true);
      } catch (e) { toast('Terugzetten mislukt: ' + e.message); }
    });
  } catch (e) { toast('Verwijderen mislukt: ' + e.message, 5000); }
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
      st = { texts: new Map(), files: [], sig: '', status: 'load', urls: [] };
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
    /* ---- rechts: bestanden ---- */
    const flist = h('div', { class: 'c2d-files' });
    for (const f of st.files) {
      const url = URL.createObjectURL(f.file); st.urls.push(url);
      const type = f.file.type || MailParser.guessType(f.name);
      const row = h('div', { class: 'c2d-file', draggable: 'true', title: 'Sleep naar je bureaublad of een map' },
        h('span', { class: 'drag', html: icon('grip', 14) }),
        h('span', { class: 'fi', html: icon(ICON_FOR(type), 18) }),
        h('span', { class: 'grow' }, h('b', {}, f.name), h('small', {}, `${fmtSize(f.size)} · ${timeAgo(f.stamp)}`)),
        h('button', { class: 'mini', title: 'Bekijken', html: icon('eye', 15), onclick: () => openAttachmentViewer([{ name: f.name, type, size: f.size, id: f.name }], 0, async () => new Uint8Array(await f.file.arrayBuffer())) }),
        h('button', { class: 'mini', title: 'Opslaan (downloaden)', html: icon('download', 15), onclick: () => download(f.name, f.file) }),
        h('button', { class: 'mini', title: 'Verwijderen', html: icon('trash', 15), onclick: () => c2dTrash(item, f) }));
      row.addEventListener('dragstart', e => {
        // Chrome/Edge: bestand naar het bureaublad slepen
        e.dataTransfer.setData('DownloadURL', `${type}:${f.name}:${url}`);
        e.dataTransfer.setData('text/plain', f.name);
        e.dataTransfer.effectAllowed = 'copy';
        st.dragging = f.name; row.classList.add('dragged');
      });
      row.addEventListener('dragend', e => {
        row.classList.remove('dragged'); st.dragging = null;
        if (e.dataTransfer.dropEffect !== 'none') c2dTrash(item, f, `“${f.name}” is naar je computer gesleept en uit Streamline gehaald`);
      });
      flist.append(row);
    }
    const fileInp = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: () => { c2dAddFiles(item, [...fileInp.files]); fileInp.value = ''; } });
    const zone = h('div', { class: 'c2d-zone' + (st.files.length ? ' has' : '') },
      st.files.length ? flist : h('div', { class: 'cr-drop', onclick: () => !editing && fileInp.click(), html: icon('upload', 30) + '<b style="color:var(--ink)">Sleep bestanden hierheen</b><span>Ze komen aan de andere kant tevoorschijn. Sleep ze daar naar je bureaublad.</span>' }),
      fileInp);
    zone.addEventListener('dragover', e => { if (editing || st.dragging || ![...e.dataTransfer.types].some(t => t === 'Files' || t === 'text/plain')) return; e.preventDefault(); e.stopPropagation(); zone.classList.add('dropping'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('dropping'); });
    zone.addEventListener('drop', async e => {
      if (editing || st.dragging) return; e.preventDefault(); e.stopPropagation(); zone.classList.remove('dropping');
      const files = [...e.dataTransfer.files];
      if (files.length) return c2dAddFiles(item, files);
      const txt = e.dataTransfer.getData('text/html') || esc(e.dataTransfer.getData('text/plain'));
      if (txt) { const t = { id: uid(), html: sanitize(txt), created: Date.now() }; st.texts.set(t.id, t); await c2dSaveText(item, t); ctx.rerender(); toast('Als tekst toegevoegd'); }
    });
    const total = st.files.reduce((n, f) => n + f.size, 0);
    const right = h('div', { class: 'c2d-col' },
      h('div', { class: 'c2d-head' }, h('span', { html: icon('file', 15) }), 'Bestanden', st.files.length ? h('span', { class: 'cr-info' }, `${st.files.length} · ${fmtSize(total)}`) : '', h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: () => fileInp.click() }, h('span', { html: icon('plus', 13) }), 'Toevoegen')),
      zone);
    el.append(h('div', { class: 'c2d', style: { gridTemplateColumns: `${c.split || 50}fr ${100 - (c.split || 50)}fr` } }, left, right),
      h('div', { class: 'todo-foot' }, h('span', { title: st.dirName }, h('span', { html: icon('folder', 12), style: { display: 'inline-block', verticalAlign: '-1px', marginRight: '4px' } }), st.dirName), h('span', { class: 'sync' }, h('span', { html: icon('refresh', 12) }), 'live')));
  },
  destroy(item) { const st = C2D.get(item.id); if (st) { clearInterval(st.timer); st.urls.forEach(u => URL.revokeObjectURL(u)); C2D.delete(item.id); } },
});

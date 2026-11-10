/* ==========================================================================
   Streamline — kern
   Alles wat je maakt blijft lokaal: in je eigen instellingenbestand (map op je
   computer) en als reservekopie in de browser. De enige verbindingen naar buiten
   zijn: GitHub (alleen om updates/widgets op te halen, er gaat niets heen),
   radiostreams, en websites/favicons die je zelf in een knop zet.
   ========================================================================== */
const APP_VERSION = '1.0.6';
const DEFAULT_REPO = 'MehMienLepke/streamline';
const SCHEMA = 1;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v !== 'string' && typeof v !== 'number' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
}
const ib = (name, title, on, cls) => h('button', { class: cls || 'iconbtn', title, 'aria-label': title, html: icon(name, 16), onclick: on });

function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------- modals, dialogen, popovers ---------- */
const modalStack = [];
function openModal({ title, body, foot, wide, onClose }) {
  const root = h('div', { class: 'mroot show' });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
  const m = { el: box, root, close() { root.remove(); modalStack.splice(modalStack.indexOf(m), 1); onClose && onClose(); } };
  box.append(
    h('div', { class: 'modal-head' }, h('h3', {}, title), ib('x', 'Sluiten', () => m.close())),
    h('div', { class: 'modal-body' }, body),
    foot ? h('div', { class: 'modal-foot' }, foot) : null
  );
  root.addEventListener('pointerdown', e => { if (e.target === root) m.close(); });
  root.append(box); document.body.append(root); modalStack.push(m);
  setTimeout(() => { const f = box.querySelector('input:not([type=checkbox]):not([type=color]),textarea'); f && f.focus(); }, 30);
  return m;
}
function ask(title, label, value = '', placeholder = '') {
  return new Promise(res => {
    const inp = h('input', { class: 'inp', value, placeholder });
    let done = false;
    const ok = () => { done = true; m.close(); res(inp.value.trim()); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    const m = openModal({ title, body: h('div', { class: 'field' }, h('label', {}, label), inp),
      foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: ok }, 'OK')],
      onClose: () => { if (!done) res(null); } });
  });
}
function confirmDlg(title, text, okLabel = 'Ja', danger) {
  return new Promise(res => {
    let done = false;
    const m = openModal({ title, body: h('p', { style: { margin: '0 0 6px' } }, text),
      foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'),
        h('button', { class: 'btn primary' + (danger ? ' danger' : ''), style: danger ? { background: 'var(--hi)', color: '#fff' } : null, onclick: () => { done = true; m.close(); res(true); } }, okLabel)],
      onClose: () => { if (!done) res(false); } });
  });
}
function choiceDlg(title, text, options) {
  return new Promise(res => {
    let done = false;
    const m = openModal({ title, body: h('p', { style: { margin: '0 0 6px' } }, text),
      foot: options.map(([v, label, primary]) => h('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: () => { done = true; m.close(); res(v); } }, label)),
      onClose: () => { if (!done) res(null); } });
  });
}
let openPop = null;
function popover(anchor, content) {
  closePop();
  const p = h('div', { class: 'pop' }, content);
  document.body.append(p);
  const r = anchor.getBoundingClientRect(), pr = p.getBoundingClientRect();
  p.style.left = clamp(r.right - pr.width, 8, innerWidth - pr.width - 8) + 'px';
  p.style.top = (r.bottom + 6 + pr.height > innerHeight ? r.top - pr.height - 6 : r.bottom + 6) + 'px';
  openPop = p;
  setTimeout(() => document.addEventListener('pointerdown', popAway, true), 0);
  return p;
}
function popAway(e) { if (openPop && !openPop.contains(e.target)) closePop(); }
function closePop() { if (openPop) { openPop.remove(); openPop = null; document.removeEventListener('pointerdown', popAway, true); } }

/* ---------- thema's & lettertypes ---------- */
const THEMES = {
  licht:   { name: 'Licht',   bg: '#ECEBE7', surface: '#FFFFFF', surface2: '#F5F4F0', ink: '#171816', muted: '#73766F', line: '#E3E1DB', accent: '#2E5E4E', accentInk: '#FFFFFF', accentSoft: '#E3ECE7', dark: false },
  donker:  { name: 'Donker',  bg: '#0F1110', surface: '#181B19', surface2: '#212522', ink: '#ECEEE9', muted: '#8D938C', line: '#2B302C', accent: '#9CC3AE', accentInk: '#0F1110', accentSoft: '#1F2D26', dark: true },
  zand:    { name: 'Zand',    bg: '#EEE8DE', surface: '#FBF8F2', surface2: '#F3EEE5', ink: '#2A2119', muted: '#857A6C', line: '#E3DBCD', accent: '#A4532C', accentInk: '#FFF8F0', accentSoft: '#F3E1D5', dark: false },
  grafiet: { name: 'Grafiet', bg: '#E7E7E5', surface: '#FAFAF9', surface2: '#F0F0EE', ink: '#111111', muted: '#6E6E6B', line: '#DCDCD9', accent: '#111111', accentInk: '#FAFAF9', accentSoft: '#E4E4E1', dark: false },
  diepzee: { name: 'Diepzee', bg: '#0C1316', surface: '#131C20', surface2: '#1A252A', ink: '#E6EEF0', muted: '#86979C', line: '#24323A', accent: '#74B9C6', accentInk: '#0C1316', accentSoft: '#17323A', dark: true },
  mosterd: { name: 'Mosterd', bg: '#131210', surface: '#1C1B18', surface2: '#25231F', ink: '#F0ECE2', muted: '#9A9385', line: '#302D27', accent: '#D9A93D', accentInk: '#131210', accentSoft: '#3A3020', dark: true },
};
const THEME_KEYS = [['bg', 'Achtergrond'], ['surface', 'Vlakken'], ['surface2', 'Vlakken (zacht)'], ['ink', 'Tekst'], ['muted', 'Tekst (rustig)'], ['line', 'Lijnen'], ['accent', 'Accent'], ['accentInk', 'Tekst op accent'], ['accentSoft', 'Accent (zacht)']];
const FONTS = {
  'Bahnschrift (strak)': 'Bahnschrift,"Segoe UI",sans-serif',
  'Segoe UI': '"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif',
  'Aptos': 'Aptos,"Segoe UI",sans-serif',
  'Georgia (klassiek)': 'Georgia,"Times New Roman",serif',
  'Sitka (elegant)': '"Sitka Heading","Sitka Text",Georgia,serif',
  'Cambria': 'Cambria,Georgia,serif',
  'Candara (zacht)': 'Candara,"Segoe UI",sans-serif',
  'Corbel': 'Corbel,"Segoe UI",sans-serif',
  'Trebuchet': '"Trebuchet MS",sans-serif',
  'Consolas (mono)': 'Consolas,"Cascadia Mono",monospace',
  'Impact (krachtig)': 'Impact,"Arial Black",sans-serif',
};
function activeTheme() {
  const t = S.theme;
  if (t.auto) return THEMES[matchMedia('(prefers-color-scheme: dark)').matches ? 'donker' : 'licht'];
  if (t.preset === 'eigen') return { ...THEMES.licht, ...t.custom };
  return THEMES[t.preset] || THEMES.licht;
}
function applyTheme() {
  const t = activeTheme(), r = document.documentElement.style;
  const map = { bg: '--bg', surface: '--surface', surface2: '--surface-2', ink: '--ink', muted: '--muted', line: '--line', accent: '--accent', accentInk: '--accent-ink', accentSoft: '--accent-soft' };
  for (const k in map) r.setProperty(map[k], t[k]);
  r.setProperty('color-scheme', t.dark ? 'dark' : 'light');
  r.setProperty('--r', (S.theme.radius ?? 22) + 'px');
  r.setProperty('--r-sm', Math.round((S.theme.radius ?? 22) * 0.6) + 'px');
  const ty = S.typography;
  r.setProperty('--title-font', FONTS[ty.font] || FONTS['Bahnschrift (strak)']);
  r.setProperty('--title-color', ty.color || 'var(--ink)');
  r.setProperty('--title-weight', ty.weight || 600);
  try { localStorage.setItem('streamline.theme', JSON.stringify({ t, radius: S.theme.radius })); } catch (e) {}
  if (editing) setGridImage();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S && S.theme.auto && applyTheme());

/* ---------- opslag: map op je computer + browser-reserve ---------- */
const IDB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('streamline', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async get(k) { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch (e) { return undefined; } },
  async set(k, v) { try { const db = await this.open(); await new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} },
};
const FS = { supported: 'showDirectoryPicker' in window, dir: null, perm: false, file: null };
const EXT = '.streamline.json';

async function pickDir() {
  const dir = await window.showDirectoryPicker({ id: 'streamline', mode: 'readwrite' });
  FS.dir = dir; FS.perm = true; await IDB.set('dir', dir);
  return dir;
}
async function listFiles() {
  const out = [];
  if (!FS.dir || !FS.perm) return out;
  for await (const [name, hd] of FS.dir.entries()) if (hd.kind === 'file' && name.toLowerCase().endsWith(EXT)) out.push(name);
  return out.sort((a, b) => a.localeCompare(b));
}
async function getHandle(path, create) {
  const parts = path.split('/'); let d = FS.dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
  return d.getFileHandle(parts.at(-1), { create });
}
async function readText(path) { const f = await (await getHandle(path)).getFile(); return f.text(); }
async function writeText(path, text) { const w = await (await getHandle(path, true)).createWritable(); await w.write(text); await w.close(); }
async function readJSON(name) { return JSON.parse(await readText(name)); }
async function writeJSON(name, obj) { await writeText(name, JSON.stringify(obj, null, 2)); }
async function exists(path) { try { await getHandle(path); return true; } catch (e) { return false; } }
function slug(s) { return (s || 'dashboard').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dashboard'; }
// Bestandsnaam = titel van je dashboard; alleen tekens die Windows niet toestaat worden vervangen.
function safeName(s) { return (String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/[. -]+$/, '') || 'Mijn dashboard').slice(0, 80); }
const fileTitle = name => String(name || '').replace(new RegExp(EXT.replace(/\./g, '\\.') + '$', 'i'), '');
async function freeFileName(title, except) {
  const files = (await listFiles()).map(f => f.toLowerCase()); let base = safeName(title), n = base, i = 2;
  while (files.includes((n + EXT).toLowerCase()) && (n + EXT).toLowerCase() !== (except || '').toLowerCase()) n = base + ' (' + i++ + ')';
  return n + EXT;
}
/* Titel wijzigen = het instellingenbestand hernoemen, zodat titel en bestand altijd gelijk zijn. */
async function renameCurrent(title) {
  title = safeName(title);
  if (!(FS.dir && FS.file)) { S.meta.title = title; renderTop(); save(); return; }
  if (!(await ensurePerm())) { toast('Geef eerst toestemming voor je map'); permissionLost(); renderTop(); return; }
  const target = await freeFileName(title, FS.file);
  if (target === FS.file) { S.meta.title = fileTitle(target); renderTop(); save(); return; }
  const old = FS.file;
  S.meta.title = fileTitle(target);
  await writeJSON(target, S);
  if (target.toLowerCase() !== old.toLowerCase()) { try { await FS.dir.removeEntry(old); } catch (e) {} }
  else { /* alleen hoofdletters gewijzigd: Windows ziet dit als hetzelfde bestand */ }
  FS.file = target; await IDB.set('lastFile', target); cacheLocal(); renderTop();
  toast('Hernoemd naar ' + target);
}
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

let S = null; // de huidige instellingen
let saveTimer = null;
function cacheLocal() { try { localStorage.setItem('streamline.cache', JSON.stringify({ file: FS.file, state: S })); } catch (e) { console.warn('cache', e); } }
function save() {
  if (!S) return;
  S.meta.updated = Date.now();
  cacheLocal();
  $('#savedot') && $('#savedot').classList.add('busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 450);
}
/* Chrome trekt de schrijftoestemming voor een map soms stilletjes in (lang open tabblad,
   slaapstand, browser herstart). Dan vragen we hem opnieuw zodra dat mag (bij een klik),
   en tot die tijd blijft alles veilig in de browser bewaard. */
let pendingWrite = false;
async function ensurePerm() {
  if (!FS.dir) return false;
  let st = 'prompt';
  try { st = await FS.dir.queryPermission({ mode: 'readwrite' }); } catch (e) {}
  if (st === 'granted') return (FS.perm = true);
  if (navigator.userActivation?.isActive) {
    try { st = await FS.dir.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    if (st === 'granted') return (FS.perm = true);
  }
  return (FS.perm = false);
}
function permissionLost() {
  if (pendingWrite) return;
  pendingWrite = true;
  showBanner(`Chrome vraagt opnieuw toestemming om in je map “${esc(FS.dir.name)}” op te slaan. Je wijzigingen zijn veilig in de browser bewaard en worden opgeslagen zodra je toestemming geeft.`, 'Toestemming geven', retryWrite);
  // de eerstvolgende klik ergens op de pagina mag de toestemming ook vragen
  document.addEventListener('pointerup', retryWrite, { once: true, capture: true });
}
async function retryWrite() {
  if (!pendingWrite || !FS.dir) return;
  if (await ensurePerm()) {
    pendingWrite = false; hideBanner();
    document.removeEventListener('pointerup', retryWrite, { capture: true });
    await flush(); toast('Weer gekoppeld aan je map — alles is opgeslagen');
  } else document.addEventListener('pointerup', retryWrite, { once: true, capture: true });
}
async function flush() {
  clearTimeout(saveTimer);
  if (FS.dir && FS.file) {
    if (!(await ensurePerm())) permissionLost();
    else {
      try { await writeJSON(FS.file, S); }
      catch (e) {
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { FS.perm = false; permissionLost(); }
        else toast('Opslaan in je map mislukt: ' + e.message, 5000);
      }
    }
  }
  $('#savedot') && $('#savedot').classList.remove('busy');
}
window.addEventListener('beforeunload', () => { cacheLocal(); });

/* ---------- standaardinstellingen & migratie ---------- */
function mk(type, x, y, w, hgt, config = {}, data = {}) {
  const def = WIDGETS[type];
  return { id: uid(), type, x, y, w, h: hgt, locked: false, config: { ...clone(def?.defaults || {}), ...config }, data };
}
function defaultState(title, preset = 'licht') {
  const home = { id: uid(), name: 'Start', icon: 'home', items: [] };
  const work = { id: uid(), name: 'Werk', icon: 'briefcase', items: [] };
  const s = {
    app: 'streamline', schema: SCHEMA,
    meta: { title: title || 'Mijn dashboard', created: Date.now(), updated: Date.now(), appVersion: APP_VERSION },
    theme: { preset, auto: false, radius: 22, custom: { ...THEMES[preset] || THEMES.licht } },
    typography: { font: 'Bahnschrift (strak)', color: '', weight: 600 },
    buttons: { fontSize: 14 },
    grid: { cols: 24, rowH: 36, gap: 14 },
    ui: { panels: {} },
    pages: [home, work], global: [], activePage: home.id,
    update: { repo: DEFAULT_REPO, branch: 'main', notify: 'major', htmlName: 'streamline.html' },
    plugins: [],
  };
  s.global.push(mk('nav', 0, 0, 7, 2, { orientation: 'h', display: 'both' }));
  home.items.push(
    mk('title', 0, 3, 12, 2, { text: '{groet}', size: 4 }),
    mk('link', 0, 5, 3, 3, { label: 'Agenda', url: 'https://outlook.office.com/calendar', iconMode: 'icon', icon: 'calendar' }),
    mk('link', 3, 5, 3, 3, { label: 'Mail', url: 'https://outlook.office.com/mail', iconMode: 'icon', icon: 'mail', style: 'accent' }),
    mk('link', 6, 5, 3, 3, { label: 'GitHub', url: 'https://github.com', iconMode: 'icon', icon: 'github' }),
    mk('radio', 9, 5, 6, 3),
    mk('todo', 0, 8, 8, 9),
    mk('notes', 8, 8, 7, 9),
  );
  work.items.push(mk('title', 0, 3, 10, 2, { text: 'Werk', size: 3 }), mk('crop', 0, 5, 14, 12));
  return s;
}
function migrate(s) {
  const d = defaultState(s?.meta?.title);
  if (!s || typeof s !== 'object') return d;
  const out = { ...d, ...s };
  out.meta = { ...d.meta, ...s.meta };
  out.theme = { ...d.theme, ...s.theme, custom: { ...d.theme.custom, ...(s.theme?.custom || {}) } };
  out.typography = { ...d.typography, ...s.typography };
  out.buttons = { ...d.buttons, ...s.buttons };
  out.grid = { ...d.grid, ...s.grid };
  out.ui = { ...d.ui, ...s.ui, panels: { ...(s.ui?.panels || {}) } };
  out.update = { ...d.update, ...s.update };
  if (!out.update.repo) out.update.repo = DEFAULT_REPO;
  out.pages = Array.isArray(s.pages) && s.pages.length ? s.pages : d.pages;
  out.global = Array.isArray(s.global) ? s.global : d.global;
  out.plugins = Array.isArray(s.plugins) ? s.plugins : [];
  for (const it of allItems(out)) {
    const c = it.config || {};
    if (c.layout && !c.labelPos) c.labelPos = c.layout === 'row' ? 'right' : 'bottom'; // oude 'Indeling' omzetten
    delete c.layout;
    it.config = { ...clone(WIDGETS[it.type]?.defaults || {}), ...c }; it.data = it.data || {};
  }
  if (!out.pages.find(p => p.id === out.activePage)) out.activePage = out.pages[0].id;
  out.schema = SCHEMA; out.meta.appVersion = APP_VERSION;
  return out;
}
function allItems(s = S) { return [...s.global, ...s.pages.flatMap(p => p.items)]; }
function findItem(id) {
  let it = S.global.find(i => i.id === id); if (it) return { item: it, list: S.global };
  for (const p of S.pages) { it = p.items.find(i => i.id === id); if (it) return { item: it, list: p.items, page: p }; }
  return {};
}
function currentPage() { return S.pages.find(p => p.id === S.activePage) || S.pages[0]; }
function fmtVars(t) {
  const d = new Date(), hr = d.getHours();
  return String(t || '')
    .replace(/\{groet\}/gi, hr < 6 ? 'Goedenacht' : hr < 12 ? 'Goedemorgen' : hr < 18 ? 'Goedemiddag' : 'Goedenavond')
    .replace(/\{datum\}/gi, d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))
    .replace(/\{tijd\}/gi, d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
}

/* ---------- widget-register (ook voor uitbreidingen via GitHub) ---------- */
const WIDGETS = {};
let booted = false;
const Streamline = {
  version: APP_VERSION,
  registerWidget(def) {
    if (!def || !def.type || !def.render) return console.warn('Ongeldige widget', def);
    def.group = def.group || 'uitbreiding';
    WIDGETS[def.type] = def;
    if (booted) { renderAll(); renderRepo(); }
  },
  h, icon, toast, openModal, ask, confirmDlg, popover, closePop, save: () => save(), fmtVars, download,
};
window.Streamline = Streamline;

/* ---------- weergave ---------- */
const els = new Map();
let editing = false;
let geo = { cw: 40, rh: 36, gap: 14 };
const canvas = () => $('#canvas');

function currentTitle() { return FS.file ? fileTitle(FS.file) : S.meta.title; }
function renderTop() {
  $('#brandsub').textContent = currentTitle();
  $('#brandsub').title = FS.file ? 'Instellingenbestand: ' + FS.file : 'Alleen in deze browser opgeslagen';
  document.title = 'Streamline — ' + currentTitle();
}
function renderAll() {
  for (const [id] of els) destroyItem(id);
  canvas().innerHTML = ''; els.clear();
  for (const it of [...S.global, ...currentPage().items]) mountItem(it);
  layout(); renderTop();
}
function destroyItem(id) { const { item } = findItem(id); const def = item && WIDGETS[item.type]; try { def?.destroy?.(item); } catch (e) {} els.get(id)?.remove(); }
function mountItem(item) {
  const el = h('div', { class: 'item t-' + item.type, 'data-id': item.id });
  els.set(item.id, el); canvas().append(el);
  buildItem(item);
  return el;
}
function ctxFor(item) {
  return {
    item, config: item.config, data: item.data, editing,
    save: () => save(),
    rerender: () => buildItem(item),
    remind: (anchor, cur, cb) => remindPicker(anchor, cur, cb),
  };
}
function buildItem(item) {
  const el = els.get(item.id); if (!el) return;
  const def = WIDGETS[item.type];
  el.innerHTML = '';
  el.className = 'item t-' + item.type + (item.locked ? ' locked' : '');
  let host;
  if (!def) {
    host = h('div', { class: 'card' }, h('div', { class: 'missing', html: icon('alert', 26) + `<b>Widget “${esc(item.type)}” bestaat niet (meer) in deze versie</b><span>Verwijder hem via het tandwiel, of installeer hem via Instellingen → Uitbreidingen als het een uitbreiding van GitHub is.</span>` }));
    el.append(host);
  } else if (def.card === false) {
    host = h('div', { class: 'card flat' }); el.append(host);
    try { def.render(host, ctxFor(item)); } catch (e) { host.textContent = 'Fout in widget: ' + e.message; console.error(e); }
  } else {
    host = h('div', { class: 'card' });
    if (item.config.title && item.config.showHead !== false) host.append(h('div', { class: 'card-head', html: (def.icon ? icon(def.icon, 17) : '') + esc(fmtVars(item.config.title)) }));
    const body = h('div', { class: 'card-body' }); host.append(body); el.append(host);
    try { def.render(body, ctxFor(item)); } catch (e) { body.textContent = 'Fout in widget: ' + e.message; console.error(e); }
  }
  el.append(h('div', { class: 'chrome' },
    h('div', { class: 'shield' }),
    h('div', { class: 'grip', title: item.locked ? 'Vergrendeld' : 'Sleep om te verplaatsen' }, h('span')),
    h('div', { class: 'tools' },
      h('button', { class: 'nl', title: 'Instellingen van dit onderdeel', 'data-act': 'config', html: icon('settings', 15) }),
      h('button', { class: 'nl', title: 'Kopiëren', 'data-act': 'copy', html: icon('copy', 15) }),
      h('button', { class: 'nl', title: 'Verwijderen', 'data-act': 'delete', html: icon('trash', 15) }),
      h('button', { class: item.locked ? 'lock-on' : '', title: item.locked ? 'Ontgrendelen' : 'Op slot zetten', 'data-act': 'lock', html: icon(item.locked ? 'lock' : 'unlock', 15) })),
    h('div', { class: 'resize', title: 'Sleep om de grootte te wijzigen' }),
    h('div', { class: 'size-badge' })));
}
function computeGeo() {
  const g = S.grid, W = canvas().clientWidth;
  geo = { gap: g.gap, rh: g.rowH, cw: (W - g.gap * (g.cols - 1)) / g.cols };
}
/* Elk onderdeel ligt in een 'frame': het paginaraster, of het eigen (kleinere) raster
   van een vak met ruimte binnenin. Posities blijven altijd in paginavakjes opgeslagen;
   alleen de weergave wordt omgerekend. Zo blijft alles uitwisselbaar tussen beide modi. */
const pageFrame = () => ({ ox: 0, oy: 0, x0: 0, y0: 0, cw: geo.cw, rh: geo.rh, gap: geo.gap });
function rectIn(it, f) {
  return { left: f.ox + (it.x - f.x0) * (f.cw + f.gap), top: f.oy + (it.y - f.y0) * (f.rh + f.gap),
    width: it.w * f.cw + (it.w - 1) * f.gap, height: it.h * f.rh + (it.h - 1) * f.gap };
}
function rectOf(it) { return rectIn(it, pageFrame()); }
const boxPad = b => b.config.padding ?? 20;
const isInsideBox = b => b.type === 'box' && b.config.paddingMode === 'inside';
function containerOf(it, items) {
  let best = null;
  for (const b of items) {
    if (b.type !== 'box' || b === it || !inside(it, b)) continue;
    if (it.type === 'box' && b.w * b.h <= it.w * it.h) continue; // even grote vakken bevatten elkaar niet
    if (!best || b.w * b.h < best.w * best.h) best = b;
  }
  return best;
}
function subFrame(box, r, gap) {
  const p = boxPad(box);
  return { ox: r.left + p, oy: r.top + p, x0: box.x, y0: box.y, gap,
    cw: Math.max(4, (r.width - 2 * p - gap * (box.w - 1)) / box.w),
    rh: Math.max(4, (r.height - 2 * p - gap * (box.h - 1)) / box.h) };
}
function frameFor(it, items, memo = new Map()) {
  if (memo.has(it.id)) return memo.get(it.id);
  memo.set(it.id, pageFrame());
  const par = containerOf(it, items);
  let f = pageFrame();
  if (par) {
    const pf = frameFor(par, items, memo);
    f = isInsideBox(par) ? subFrame(par, rectIn(par, pf), pf.gap) : pf;
  }
  memo.set(it.id, f);
  return f;
}
function layout() {
  if (!S) return;
  computeGeo();
  const items = [...S.global, ...currentPage().items], memo = new Map();
  let bottom = 0;
  for (const it of items) {
    const el = els.get(it.id); if (!el) continue;
    it.w = clamp(it.w, 1, S.grid.cols); it.x = clamp(it.x, 0, S.grid.cols - it.w);
    const f = frameFor(it, items, memo), r = rectIn(it, f);
    if (it.type === 'box') {
      const pad = el.querySelector('.boxpad');
      if (isInsideBox(it)) {
        if (pad && editing) { const sf = subFrame(it, r, f.gap); pad.style.backgroundImage = gridImg(sf.cw, sf.rh, sf.gap); pad.style.backgroundSize = `${sf.cw + sf.gap}px ${sf.rh + sf.gap}px`; }
      } else {
        const p = boxPad(it); r.left -= p; r.top -= p; r.width += 2 * p; r.height += 2 * p;
        if (pad) pad.style.backgroundImage = 'none';
      }
    }
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    if (WIDGETS[it.type]?.isButton) el.style.setProperty('--btn-fs', btnFontSize(it, items) + 'px');
    bottom = Math.max(bottom, r.top + r.height);
  }
  canvas().style.height = (bottom + (editing ? 8 : 1) * (geo.rh + geo.gap)) + 'px';
  if (editing) setGridImage();
  requestAnimationFrame(() => $$('.lb', canvas()).forEach(b => window.fitButton && fitButton(b)));
}
/* Tekstgrootte van een knop: eigen instelling → instelling van het (binnenste) vak eromheen → algemene instelling */
function btnFontSize(it, items) {
  if (it.config.fontSizeOn) return it.config.fontSize || S.buttons.fontSize;
  for (let b = containerOf(it, items); b; b = containerOf(b, items)) if (b.config.btnFontSizeOn) return b.config.btnFontSize || S.buttons.fontSize;
  return S.buttons.fontSize;
}
function gridImg(cw, rh, gap) {
  const cs = getComputedStyle(document.documentElement);
  const acc = cs.getPropertyValue('--accent').trim(), line = cs.getPropertyValue('--muted').trim();
  const W = cw + gap, H = rh + gap;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><rect x='.75' y='.75' width='${Math.max(1, cw - 1.5)}' height='${Math.max(1, rh - 1.5)}' rx='8' fill='${acc}' fill-opacity='.06' stroke='${line}' stroke-opacity='.28' stroke-dasharray='3 3'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function setGridImage() {
  const { cw, rh, gap } = geo;
  canvas().style.setProperty('--gridimg', gridImg(cw, rh, gap));
  canvas().style.backgroundSize = `${cw + gap}px ${rh + gap}px`;
}
window.addEventListener('resize', debounce(layout, 60));

function goPage(id) {
  if (!S.pages.find(p => p.id === id)) return;
  S.activePage = id; save(); renderAll();
}

/* ---------- bewerkmodus ---------- */
function setEditing(on) {
  editing = on;
  document.body.classList.toggle('editing', on);
  $('#gear').classList.toggle('on', on);
  showPanel('repo', on);
  if (!on) { showPanel('settings', false); hist.length = 0; }
  for (const it of [...S.global, ...currentPage().items]) if (WIDGETS[it.type]?.rebuildOnEdit) buildItem(it);
  layout();
}
const hist = [];
function pushHistory() { hist.push(JSON.stringify({ pages: S.pages, global: S.global })); if (hist.length > 60) hist.shift(); }
function undo() {
  const last = hist.pop(); if (!last) return toast('Niets om ongedaan te maken');
  const o = JSON.parse(last); S.pages = o.pages; S.global = o.global; save(); renderAll(); toast('Ongedaan gemaakt');
}

function initDrag() {
  const cv = canvas();
  cv.addEventListener('click', e => {
    const b = e.target.closest('.tools button'); if (!b || !editing) return;
    const id = b.closest('.item').dataset.id; const { item } = findItem(id); if (!item) return;
    const act = b.dataset.act;
    if (act === 'lock') { pushHistory(); item.locked = !item.locked; buildItem(item); save(); toast(item.locked ? 'Op slot gezet' : 'Ontgrendeld'); }
    if (act === 'config') openItemConfig(item);
    if (act === 'copy') duplicateItem(item);
    if (act === 'delete') deleteItem(item);
  });
  cv.addEventListener('pointerdown', e => {
    if (!editing || e.button !== 0) return;
    const itemEl = e.target.closest('.item'); if (!itemEl || e.target.closest('.tools')) return;
    const resize = !!e.target.closest('.resize');
    if (!resize && !e.target.closest('.shield,.grip')) return;
    const { item } = findItem(itemEl.dataset.id); if (!item) return;
    if (item.locked) { toast('Dit onderdeel staat op slot — klik op het slotje om het te ontgrendelen'); return; }
    e.preventDefault();
    pushHistory();
    const sx = e.clientX, sy = e.clientY, o = { x: item.x, y: item.y, w: item.w, h: item.h };
    const f0 = frameFor(item, [...S.global, ...currentPage().items]);
    const kids = (!resize && item.type === 'box') ? findItem(item.id).list.filter(i => inside(i, item)).map(i => ({ i, x: i.x, y: i.y })) : [];
    const def = WIDGETS[item.type] || {}; const min = def.min || { w: 1, h: 1 }; const max = def.max || { w: S.grid.cols, h: 60 };
    const badge = itemEl.querySelector('.size-badge');
    itemEl.classList.add(resize ? 'resizing' : 'dragging');
    itemEl.setPointerCapture(e.pointerId);
    let moved = false;
    const move = ev => {
      const dx = (ev.clientX - sx) / (f0.cw + f0.gap), dy = (ev.clientY - sy) / (f0.rh + f0.gap);
      if (resize) {
        item.w = clamp(Math.round(o.w + dx), min.w, Math.min(max.w, S.grid.cols - item.x));
        item.h = clamp(Math.round(o.h + dy), min.h, max.h);
        badge.textContent = `${item.w} × ${item.h}`;
      } else {
        item.x = clamp(Math.round(o.x + dx), 0, S.grid.cols - item.w);
        item.y = Math.max(0, Math.round(o.y + dy));
        for (const k of kids) { k.i.x = k.x + item.x - o.x; k.i.y = k.y + item.y - o.y; }
        badge.textContent = `kolom ${item.x + 1} · rij ${item.y + 1}`;
      }
      moved = true; layout();
    };
    const up = () => {
      itemEl.classList.remove('resizing', 'dragging');
      itemEl.removeEventListener('pointermove', move); itemEl.removeEventListener('pointerup', up); itemEl.removeEventListener('pointercancel', up);
      if (moved) { save(); if (resize && WIDGETS[item.type]?.rebuildOnResize) buildItem(item); } else hist.pop();
      layout();
    };
    itemEl.addEventListener('pointermove', move); itemEl.addEventListener('pointerup', up); itemEl.addEventListener('pointercancel', up);
  });
  cv.addEventListener('dblclick', e => {
    if (!editing) return; const itemEl = e.target.closest('.item'); if (!itemEl) return;
    const { item } = findItem(itemEl.dataset.id); if (item && !item.locked) openItemConfig(item);
  });
}
function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function freeSpot(w, hgt, ignoreBoxes = true) {
  const others = [...S.global, ...currentPage().items].filter(i => !(ignoreBoxes && i.type === 'box'));
  for (let y = 0; y < 400; y++) for (let x = 0; x <= S.grid.cols - w; x++) {
    const r = { x, y, w, h: hgt };
    if (!others.some(o => overlaps(r, o))) return { x, y };
  }
  return { x: 0, y: pageBottom() };
}
function pageBottom(items = [...S.global, ...currentPage().items]) { return items.reduce((m, i) => Math.max(m, i.y + i.h), 0); }
function addItem(type, cfg) {
  const def = WIDGETS[type]; if (!def) return;
  pushHistory();
  const size = def.size || { w: 4, h: 4 };
  const spot = freeSpot(size.w, size.h, type !== 'box');
  const it = mk(type, spot.x, spot.y, size.w, size.h, cfg);
  (def.global ? S.global : currentPage().items).push(it);
  mountItem(it); layout(); save();
  const el = els.get(it.id); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.animate([{ transform: 'scale(.94)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
  if (def.configOnAdd) setTimeout(() => openItemConfig(it), 280);
  return it;
}
function inside(child, box) { return child.id !== box.id && child.x >= box.x && child.y >= box.y && child.x + child.w <= box.x + box.w && child.y + child.h <= box.y + box.h; }
function duplicateItem(item) {
  pushHistory();
  const { list } = findItem(item.id);
  if (item.type === 'box') {
    const kids = list.filter(i => inside(i, item));
    const dy = pageBottom() + 1 - item.y;
    for (const src of [item, ...kids]) { const c = clone(src); c.id = uid(); c.y += dy; c.locked = false; list.push(c); mountItem(c); }
    toast(`Vak gekopieerd met ${kids.length} onderdelen erin`);
  } else {
    const c = clone(item); c.id = uid(); c.locked = false;
    const right = { x: item.x + item.w, y: item.y, w: item.w, h: item.h };
    const others = [...S.global, ...currentPage().items].filter(i => i.type !== 'box');
    if (right.x + right.w <= S.grid.cols && !others.some(o => overlaps(right, o))) { c.x = right.x; }
    else { const s = freeSpot(c.w, c.h); c.x = s.x; c.y = s.y; }
    list.push(c); mountItem(c); toast('Gekopieerd');
  }
  layout(); save();
}
async function deleteItem(item) {
  const name = WIDGETS[item.type]?.name || item.type;
  if (!(await confirmDlg('Verwijderen?', `Wil je “${item.config.label || item.config.title || item.config.text || name}” verwijderen? Je kunt dit ongedaan maken met Ctrl+Z zolang je in de bewerkmodus bent.`, 'Verwijderen', true))) return;
  pushHistory();
  const { list } = findItem(item.id);
  list.splice(list.indexOf(item), 1);
  try { WIDGETS[item.type]?.onDelete?.(item); } catch (e) {}
  destroyItem(item.id); els.delete(item.id); layout(); save();
}

/* ---------- zwevende panelen met greep ---------- */
function showPanel(name, on) {
  const p = $('#panel-' + name); if (!p) return;
  p.classList.toggle('show', on);
  if (on) {
    if (name === 'repo') renderRepo();
    if (name === 'settings') renderSettings();
    const pos = S.ui.panels[name] || (name === 'repo' ? { x: innerWidth - 420, y: 96 } : { x: innerWidth - 880, y: 96 });
    placePanel(p, pos.x, pos.y);
  }
}
function placePanel(p, x, y) {
  const r = p.getBoundingClientRect();
  p.style.left = clamp(x, 8, innerWidth - Math.min(r.width || 380, innerWidth) - 8) + 'px';
  p.style.top = clamp(y, 8, innerHeight - 80) + 'px';
}
function initPanels() {
  for (const p of $$('.panel')) {
    const grip = p.querySelector('.panel-grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.style.cursor = 'grabbing';
      const r = p.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = ev => placePanel(p, ev.clientX - ox, ev.clientY - oy);
      const up = () => {
        grip.style.cursor = ''; grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up);
        S.ui.panels[p.dataset.name] = { x: parseInt(p.style.left), y: parseInt(p.style.top) }; save();
      };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
  }
}

/* ---------- repository (widgets toevoegen) ---------- */
const GROUPS = [['basis', 'Basis'], ['widgets', 'Widgets'], ['uitbreiding', 'Uitbreidingen']];
let repoFilter = '';
function renderRepo() {
  const body = $('#repo-body'); if (!body) return;
  body.innerHTML = '';
  body.append(h('input', { class: 'inp', placeholder: 'Zoek een widget…', value: repoFilter, style: { marginBottom: '14px' },
    oninput: e => { repoFilter = e.target.value; renderRepoList(list); } }));
  const list = h('div'); body.append(list);
  renderRepoList(list);
  body.append(h('p', { class: 'hint', html: `Klik op een onderdeel om het toe te voegen. Sleep onderdelen aan hun <b>greep</b> en verander de grootte met het bolletje rechtsonder. <kbd>Ctrl</kbd>+<kbd>Z</kbd> maakt ongedaan, <kbd>Esc</kbd> sluit de bewerkmodus.` }));
}
function renderRepoList(list) {
  list.innerHTML = '';
  const q = repoFilter.toLowerCase();
  for (const [g, label] of GROUPS) {
    const defs = Object.values(WIDGETS).filter(d => d.group === g && !d.hidden && (!q || (d.name + ' ' + (d.desc || '')).toLowerCase().includes(q)));
    if (!defs.length && g !== 'uitbreiding') continue;
    const grp = h('div', { class: 'repo-group' }, h('h4', {}, label));
    for (const d of defs) grp.append(h('button', { class: 'repo-item', onclick: () => addItem(d.type) },
      h('span', { class: 'ri', html: icon(d.icon || 'grid', 20) }),
      h('span', {}, h('b', {}, d.name), h('small', {}, d.desc || '')),
      h('span', { class: 'add', html: icon('plus', 18) })));
    if (g === 'uitbreiding') grp.append(h('button', { class: 'btn sm', onclick: () => { showPanel('settings', true); settingsTab = 'uitbr'; renderSettings(); } }, h('span', { html: icon('github', 15) }), 'Meer widgets van GitHub'));
    list.append(grp);
  }
}

/* ---------- configuratie per onderdeel ---------- */
function fieldEl(f, cfg, onChange) {
  const set = v => { cfg[f.key] = v; onChange && onChange(f.key, v); };
  const wrap = h('div', { class: 'field' });
  if (f.type !== 'checkbox') wrap.append(h('label', {}, f.label));
  let ctl;
  switch (f.type) {
    case 'textarea': ctl = h('textarea', { class: 'inp', value: cfg[f.key] ?? '', placeholder: f.placeholder || '', oninput: e => set(e.target.value) }); break;
    case 'number': ctl = h('input', { class: 'inp', type: 'number', min: f.min, max: f.max, step: f.step || 1, value: cfg[f.key] ?? '', oninput: e => set(Number(e.target.value)) }); break;
    case 'select': ctl = h('select', { class: 'inp', value: String(cfg[f.key] ?? ''), onchange: e => set(isNaN(e.target.value) || e.target.value === '' ? e.target.value : Number(e.target.value)) }, f.options.map(([v, l]) => h('option', { value: String(v) }, l))); break;
    case 'seg': {
      ctl = h('div', { class: 'seg' });
      const draw = () => { ctl.innerHTML = ''; for (const [v, l] of f.options) ctl.append(h('button', { type: 'button', class: cfg[f.key] === v ? 'on' : '', onclick: () => { set(v); draw(); } }, l)); };
      draw(); break;
    }
    case 'checkbox': ctl = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!cfg[f.key], onchange: e => set(e.target.checked) }), f.label); break;
    case 'range': {
      const out = h('span', { class: 'badge' }, (cfg[f.key] ?? 0) + (f.unit || ''));
      ctl = h('div', { class: 'row' }, h('input', { type: 'range', min: f.min, max: f.max, step: f.step || 1, value: cfg[f.key] ?? 0, oninput: e => { set(Number(e.target.value)); out.textContent = e.target.value + (f.unit || ''); } }), out);
      break;
    }
    case 'color': {
      const inp = h('input', { type: 'color', value: cfg[f.key] || f.fallback || '#888888', oninput: e => { set(e.target.value); lab.textContent = e.target.value; } });
      const lab = h('span', { class: 'hint', style: { margin: 0 } }, cfg[f.key] || 'themakleur');
      ctl = h('div', { class: 'row' }, inp, lab, f.allowTheme ? h('button', { class: 'btn sm', type: 'button', onclick: () => { set(''); lab.textContent = 'themakleur'; } }, 'Thema') : null);
      break;
    }
    case 'icon': {
      const btn = h('button', { class: 'btn', type: 'button' });
      const draw = () => { btn.innerHTML = icon(cfg[f.key] || 'globe', 18) + ' Kies icoon'; };
      btn.onclick = () => iconPicker(cfg[f.key], v => { set(v); draw(); }); draw(); ctl = btn; break;
    }
    default: ctl = h('input', { class: 'inp', type: f.type === 'url' ? 'url' : 'text', value: cfg[f.key] ?? '', placeholder: f.placeholder || '', oninput: e => set(e.target.value) });
  }
  wrap.append(ctl);
  if (f.hint) wrap.append(h('div', { class: 'hint', style: { margin: '2px 0 0' } }, f.hint));
  if (f.showIf) { const upd = () => { wrap.style.display = f.showIf(cfg) ? '' : 'none'; }; upd(); wrap._upd = upd; }
  return wrap;
}
function buildForm(fields, cfg) {
  const box = h('div');
  const refresh = () => $$('.field', box).forEach(w => w._upd && w._upd());
  for (const f of fields) box.append(fieldEl(f, cfg, refresh));
  return box;
}
function openItemConfig(item) {
  const def = WIDGETS[item.type];
  const cfg = clone(item.config);
  const size = { w: item.w, h: item.h };
  const body = h('div');
  if (def?.fields?.length) body.append(buildForm(def.fields, cfg));
  if (def?.editor) { const ed = h('div'); body.append(ed); def.editor(ed, cfg, item); }
  const min = def?.min || { w: 1, h: 1 };
  body.append(h('div', { class: 'sect', style: { marginTop: '10px' } }, h('h4', {}, 'Grootte (in rastervakjes)'),
    h('div', { class: 'row' },
      h('div', { class: 'field grow' }, h('label', {}, 'Breedte'), h('input', { class: 'inp', type: 'number', min: min.w, max: S.grid.cols, value: size.w, oninput: e => size.w = clamp(+e.target.value || 1, min.w, S.grid.cols) })),
      h('div', { class: 'field grow' }, h('label', {}, 'Hoogte'), h('input', { class: 'inp', type: 'number', min: min.h, max: 60, value: size.h, oninput: e => size.h = clamp(+e.target.value || 1, min.h, 60) })))));
  const isGlobal = S.global.includes(item);
  let target = '';
  if (!isGlobal) body.append(h('div', { class: 'sect' }, h('h4', {}, 'Naar een andere pagina'),
    h('div', { class: 'row' }, h('select', { class: 'inp grow', onchange: e => target = e.target.value },
      h('option', { value: '' }, '— niet verplaatsen —'), S.pages.filter(p => p.id !== S.activePage).map(p => [h('option', { value: 'move:' + p.id }, 'Verplaats naar ' + p.name), h('option', { value: 'copy:' + p.id }, 'Kopieer naar ' + p.name)])))));
  const m = openModal({ title: (def?.name || item.type) + ' — instellingen', wide: def?.wideConfig, body,
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'),
      h('button', { class: 'btn primary', onclick: async () => {
        if (def?.beforeSave && (await def.beforeSave(item, cfg)) === false) return;
        pushHistory();
        item.config = cfg; item.w = size.w; item.h = size.h;
        if (target) {
          const [act, pid] = target.split(':'); const page = S.pages.find(p => p.id === pid);
          const c = clone(item); c.id = uid(); const s = { y: pageBottom(page.items) };
          c.y = s.y; page.items.push(c);
          if (act === 'move') { const { list } = findItem(item.id); list.splice(list.indexOf(item), 1); destroyItem(item.id); els.delete(item.id); }
          toast(act === 'move' ? 'Verplaatst naar ' + page.name : 'Gekopieerd naar ' + page.name);
        }
        if (els.has(item.id)) buildItem(item);
        layout(); save(); m.close();
      } }, 'Opslaan')] });
}

/* ---------- icoon-catalogus ---------- */
function iconPicker(current, cb) {
  let q = '';
  const grid = h('div', { class: 'icongrid' });
  const draw = () => {
    grid.innerHTML = '';
    for (const [name, [kw]] of Object.entries(ICONS)) {
      if (q && !(name + ' ' + kw).includes(q)) continue;
      grid.append(h('button', { class: name === current ? 'on' : '', title: kw, html: icon(name, 22) + `<span>${name}</span>`, onclick: () => { cb(name); m.close(); } }));
    }
    if (!grid.children.length) grid.append(h('div', { class: 'empty' }, 'Niets gevonden — probeer een ander woord.'));
  };
  const m = openModal({ title: 'Kies een icoon', body: [h('input', { class: 'inp', placeholder: 'Zoek op Nederlands of Engels, bijv. “agenda” of “mail”…', style: { marginBottom: '12px' }, oninput: e => { q = e.target.value.toLowerCase().trim(); draw(); } }), grid] });
  draw();
}

/* ---------- herinneringen (to do's en notities) ---------- */
function remindPicker(anchor, current, cb) {
  const at = ms => () => { closePop(); askNotify(); cb(Date.now() + ms); };
  const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };
  const toLocal = ts => { const d = new Date(ts - new Date().getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
  const dt = h('input', { class: 'inp', type: 'datetime-local', value: toLocal(current || Date.now() + 36e5) });
  popover(anchor, [
    h('div', { class: 'lbl', style: { padding: '4px 10px 6px' } }, 'Herinner mij…'),
    [['Over 15 minuten', 15], ['Over 30 minuten', 30], ['Over 1 uur', 60], ['Over 3 uur', 180]].map(([l, m]) => h('button', { class: 'opt', html: icon('clock', 15) + l, onclick: at(m * 6e4) })),
    h('button', { class: 'opt', html: icon('sun', 15) + 'Morgen om 09:00', onclick: () => { closePop(); askNotify(); cb(tomorrow9()); } }),
    h('hr'),
    h('div', { style: { padding: '0 6px 6px' } }, dt, h('button', { class: 'btn primary sm', style: { marginTop: '6px', width: '100%' }, onclick: () => { const t = new Date(dt.value).getTime(); if (t) { closePop(); askNotify(); cb(t); } } }, 'Instellen')),
    current ? h('button', { class: 'opt', html: icon('x', 15) + 'Herinnering verwijderen', onclick: () => { closePop(); cb(null); } }) : null,
  ]);
}
function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
function fmtWhen(ts) {
  const d = new Date(ts), now = new Date();
  const same = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return same ? t : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + t;
}
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const c = audioCtx, t0 = c.currentTime;
    [0, .22, .44, 1.2, 1.42, 1.64].forEach((off, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = i % 3 === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0, t0 + off); g.gain.linearRampToValueAtTime(.25, t0 + off + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + off + .19);
      o.connect(g).connect(c.destination); o.start(t0 + off); o.stop(t0 + off + .2);
    });
  } catch (e) {}
}
let titleFlash = null;
function checkReminders() {
  if (!S) return;
  const now = Date.now();
  for (const p of S.pages) for (const it of p.items) {
    const entries = it.type === 'todo' ? (it.data.items || []).filter(t => !t.done) : it.type === 'notes' ? (it.data.notes || []) : [];
    for (const en of entries) if (en.remindAt && !en.reminded && en.remindAt <= now) fireReminder(p, it, en);
  }
}
function fireReminder(page, item, en) {
  en.reminded = true; save();
  const text = en.text || (h('div', { html: en.html || '' }).textContent || '').trim().slice(0, 140) || 'Notitie';
  beep();
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Streamline — herinnering', { body: text, tag: en.id }); } catch (e) {}
  let flip = false; clearInterval(titleFlash);
  titleFlash = setInterval(() => { document.title = (flip = !flip) ? '🔔 ' + text : 'Streamline — ' + currentTitle(); }, 1000);
  const box = h('div', { class: 'alarm', role: 'alert' });
  const close = () => { box.remove(); clearInterval(titleFlash); renderTop(); };
  const refresh = () => { if (els.has(item.id)) buildItem(item); };
  box.append(h('h4', { html: icon('bell', 18) + (item.type === 'todo' ? 'To-do herinnering' : 'Notitie herinnering') }), h('p', {}, text),
    h('div', { class: 'row' },
      item.type === 'todo' ? h('button', { class: 'btn primary sm', onclick: () => { en.done = true; save(); refresh(); close(); } }, h('span', { html: icon('check', 14) }), 'Gedaan') : null,
      h('button', { class: 'btn sm', onclick: () => { en.remindAt = Date.now() + 10 * 6e4; en.reminded = false; save(); refresh(); close(); } }, 'Over 10 min'),
      page.id !== S.activePage ? h('button', { class: 'btn sm', onclick: () => { goPage(page.id); close(); } }, 'Bekijk') : null,
      h('button', { class: 'btn sm', onclick: () => { en.remindAt = null; save(); refresh(); close(); } }, 'Sluiten')));
  document.body.append(box);
  refresh();
}

/* ---------- updates & uitbreidingen via GitHub (alleen ophalen, nooit versturen) ---------- */
const remote = { version: null, info: null, registry: null };
const rawUrl = path => `https://raw.githubusercontent.com/${S.update.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')}/${S.update.branch || 'main'}/${path}`;
const verParts = v => String(v || '0').split('.').map(n => parseInt(n) || 0);
function cmpVer(a, b) { const x = verParts(a), y = verParts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }
async function checkUpdate(manual) {
  if (!S.update.repo) { if (manual) toast('Vul eerst je GitHub-repository in'); return; }
  try {
    const r = await fetch(rawUrl('version.json') + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.json(); remote.info = v; remote.version = v.version;
    const newer = cmpVer(v.version, APP_VERSION) > 0;
    const big = verParts(v.version)[0] > verParts(APP_VERSION)[0] || v.groot === true;
    const show = newer && (S.update.notify === 'all' || (S.update.notify === 'major' && big));
    $('#updatebtn').style.display = show ? 'inline-flex' : 'none';
    if (manual) toast(newer ? `Versie ${v.version} is beschikbaar${big ? ' (grote update)' : ''}` : 'Je hebt de nieuwste versie');
    if (manual && newer) $('#updatebtn').style.display = 'inline-flex';
  } catch (e) { if (manual) toast('GitHub niet bereikbaar: ' + e.message, 4000); }
}
async function installUpdate() {
  const v = remote.info; if (!v) return;
  const name = S.update.htmlName || 'streamline.html';
  const canWrite = !!(FS.dir && FS.perm);
  const intro = h('div', {},
    h('p', {}, 'Nieuwe versie: ', h('b', {}, v.version), ` (jij hebt ${APP_VERSION}).`),
    v.notes ? h('div', { class: 'hint', style: { whiteSpace: 'pre-wrap' } }, v.notes) : null,
    h('p', { class: 'hint' }, canWrite
      ? `Ik maak eerst een reservekopie van je huidige versie en je instellingen in de map “backups”. Daarna vervang ik “${name}” in je gekoppelde map en ververs ik de pagina. Je dashboards, notities en to do's blijven gewoon staan.`
      : `Je map is niet gekoppeld, dus ik kan het bestand niet zelf vervangen. Ik download de nieuwe versie; zet die op de plek van je huidige “${name}” en open hem opnieuw.`));
  const bar = h('div', { class: 'upd-bar' }, h('i'));
  const list = h('div');
  const status = h('div', { class: 'upd-msg' });
  const progress = h('div', { style: { display: 'none' } }, bar, list, status);
  const later = h('button', { class: 'btn', onclick: () => m.close() }, 'Later');
  const go = h('button', { class: 'btn primary' }, 'Installeren');
  const m = openModal({ title: 'Update installeren', body: [intro, progress], foot: [later, go] });
  const topBtn = $('#updatebtn');
  const labels = canWrite
    ? ['Nieuwe versie ophalen van GitHub', 'Controleren of het bestand klopt', 'Reservekopie van je huidige versie maken', 'Reservekopie van je instellingen maken', 'Nieuwe versie installeren']
    : ['Nieuwe versie ophalen van GitHub', 'Controleren of het bestand klopt', 'Nieuwe versie downloaden'];
  const rows = labels.map(l => h('div', { class: 'upd-step' }, h('span', { class: 'st', html: icon('clock', 16) }), h('span', {}, l)));
  list.append(...rows);
  const pause = ms => new Promise(r => setTimeout(r, ms));
  let cur = -1;
  const step = async (i, fn) => {
    cur = i;
    rows[i].className = 'upd-step run'; rows[i].firstChild.innerHTML = '<span class="spin"></span>';
    const t0 = Date.now(); const out = await fn();
    await pause(Math.max(0, 450 - (Date.now() - t0))); // even zichtbaar laten, ook als het razendsnel gaat
    rows[i].className = 'upd-step ok'; rows[i].firstChild.innerHTML = icon('check', 16);
    bar.firstChild.style.width = Math.round((i + 1) / rows.length * 100) + '%';
    return out;
  };
  go.onclick = async () => {
    intro.style.display = 'none'; progress.style.display = ''; status.textContent = '';
    rows.forEach(r => { r.className = 'upd-step'; r.firstChild.innerHTML = icon('clock', 16); }); bar.firstChild.style.width = '0';
    go.disabled = later.disabled = true; go.innerHTML = '<span class="spin"></span> Bezig met updaten…';
    topBtn.classList.add('busy'); topBtn.innerHTML = '<span class="spin"></span> Bezig…';
    try {
      const html = await step(0, async () => {
        const r = await fetch(rawUrl(v.file || 'streamline.html') + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error('GitHub gaf foutcode ' + r.status);
        return r.text();
      });
      await step(1, async () => { if (!html.includes('name="streamline-app"')) throw new Error('Het gedownloade bestand is geen Streamline-pagina'); });
      if (canWrite) {
        await flush();
        const stamp = new Date().toISOString().slice(0, 10);
        await step(2, async () => { if (await exists(name)) await writeText(`backups/${name.replace(/\.html$/, '')}-v${APP_VERSION}.html`, await readText(name)); });
        await step(3, () => writeJSON(`backups/${FS.file.replace(EXT, '')}-${stamp}${EXT}`, S));
        await step(4, () => writeText(name, html));
        let n = 3;
        const tick = () => { status.innerHTML = `${icon('check', 18)}<b>Update geïnstalleerd.</b> De pagina wordt over ${n} seconde${n === 1 ? '' : 'n'} ververst…`; };
        tick();
        go.disabled = false; go.textContent = 'Nu verversen'; go.onclick = () => location.reload();
        later.style.display = 'none';
        const iv = setInterval(() => { n--; if (n <= 0) { clearInterval(iv); status.innerHTML = '<span class="spin"></span> <b>Verversen…</b>'; location.reload(); } else tick(); }, 1000);
      } else {
        await step(2, async () => download(name, html, 'text/html'));
        status.innerHTML = `${icon('check', 18)}<span><b>Gedownload.</b> Zet het bestand op de plek van je huidige “${esc(name)}” en open het opnieuw.</span>`;
        go.style.display = 'none'; later.disabled = false; later.textContent = 'Sluiten';
        topBtn.classList.remove('busy'); topBtn.textContent = 'Update';
      }
    } catch (e) {
      if (cur >= 0) { rows[cur].className = 'upd-step err'; rows[cur].firstChild.innerHTML = icon('alert', 16); }
      status.innerHTML = `<span style="color:var(--hi)"><b>Update mislukt:</b> ${esc(e.message)}</span><br><span class="hint">Er is niets kapotgegaan; je huidige versie werkt gewoon.</span>`;
      go.disabled = later.disabled = false; go.textContent = 'Opnieuw proberen'; later.textContent = 'Sluiten';
      topBtn.classList.remove('busy'); topBtn.textContent = 'Update';
    }
  };
}
async function loadPlugins() {
  const store = (await IDB.get('plugins')) || {};
  for (const p of Object.values(store)) await injectPlugin(p.code).catch(e => console.warn('plugin', p.id, e));
}
function injectPlugin(code) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const s = h('script', { src: url }); s.onload = () => { URL.revokeObjectURL(url); res(); }; s.onerror = rej;
    document.head.append(s);
  });
}
async function fetchRegistry() {
  const r = await fetch(rawUrl('widgets/registry.json') + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  remote.registry = await r.json(); return remote.registry;
}
async function installPlugin(entry) {
  const r = await fetch(rawUrl(entry.file) + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const code = await r.text();
  const store = (await IDB.get('plugins')) || {};
  store[entry.id] = { ...entry, code, installed: Date.now() };
  await IDB.set('plugins', store);
  if (FS.dir && FS.perm) await writeText('widgets/' + entry.id + '.js', code).catch(() => {});
  if (!S.plugins.find(p => p.id === entry.id)) S.plugins.push({ id: entry.id, name: entry.name, version: entry.version });
  else Object.assign(S.plugins.find(p => p.id === entry.id), { version: entry.version });
  save();
  await injectPlugin(code);
}
async function removePlugin(id) {
  const store = (await IDB.get('plugins')) || {}; delete store[id]; await IDB.set('plugins', store);
  S.plugins = S.plugins.filter(p => p.id !== id); save();
  toast('Verwijderd — ververs de pagina om hem helemaal te ontladen');
}

/* ---------- opstarten ---------- */
async function openFromDir(cached) {
  const files = await listFiles();
  let name = await IDB.get('lastFile');
  if (!files.includes(name)) name = files[0];
  if (!name) {
    S = cached ? migrate(cached.state) : defaultState('Mijn dashboard');
    FS.file = await freeFileName(S.meta.title);
    await writeJSON(FS.file, S);
  } else {
    let st = migrate(await readJSON(name));
    if (cached && cached.file === name && (cached.state?.meta?.updated || 0) > (st.meta.updated || 0)) st = migrate(cached.state);
    S = st; FS.file = name;
  }
  S.meta.title = fileTitle(FS.file);
  await IDB.set('lastFile', FS.file);
  cacheLocal();
}
async function switchFile(name) {
  await flush();
  const st = migrate(await readJSON(name));
  S = st; FS.file = name; S.meta.title = fileTitle(name); await IDB.set('lastFile', name); cacheLocal();
  applyTheme(); renderAll(); if (editing) { renderRepo(); renderSettings(); }
  renderTop(); toast('Geopend: ' + currentTitle());
}
function showBanner(html, btnLabel, onClick) {
  const b = $('#banner'); b.innerHTML = '';
  b.append(h('span', { html: icon('folder', 18) }), h('span', { html }), btnLabel ? h('button', { class: 'btn primary sm', onclick: onClick }, btnLabel) : null);
  b.classList.add('show');
}
function hideBanner() { $('#banner').classList.remove('show'); }
async function reconnect() {
  try {
    const p = await FS.dir.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return toast('Zonder toestemming kan ik niet in je map opslaan');
    FS.perm = true; hideBanner();
    const cached = JSON.parse(localStorage.getItem('streamline.cache') || 'null');
    await openFromDir(cached); applyTheme(); renderAll(); toast('Map gekoppeld — alles wordt weer in je bestand opgeslagen');
  } catch (e) { toast('Koppelen mislukt: ' + e.message); }
}
function welcome() {
  let preset = 'licht';
  const title = h('input', { class: 'inp', placeholder: 'Bijv. Werk, Marketing, Mijn dashboard', value: 'Mijn dashboard' });
  const seg = h('div', { class: 'seg' });
  const drawSeg = () => { seg.innerHTML = ''; for (const [k, l] of [['licht', 'Licht'], ['donker', 'Donker']]) seg.append(h('button', { class: preset === k ? 'on' : '', onclick: () => { preset = k; S.theme.preset = k; applyTheme(); drawSeg(); } }, l)); };
  S = defaultState('Mijn dashboard'); applyTheme(); drawSeg();
  const go = async useDir => {
    const t = title.value.trim() || 'Mijn dashboard';
    try {
      if (useDir) {
        await pickDir();
        const files = await listFiles();
        if (files.length) { await openFromDir(null); toast('Bestaande instellingen gevonden en geopend'); }
        else { S = defaultState(t, preset); FS.file = await freeFileName(t); await writeJSON(FS.file, S); await IDB.set('lastFile', FS.file); }
      } else S = defaultState(t, preset);
      m.close(); cacheLocal(); start();
    } catch (e) { if (e.name !== 'AbortError') toast('Dat lukte niet: ' + e.message); }
  };
  const m = openModal({ title: 'Welkom bij Streamline', body: h('div', {},
    h('div', { class: 'welcome-mark', html: LOGO }),
    h('p', {}, 'Je eigen dashboard dat volledig op je eigen computer blijft. Geef je eerste instellingenbestand een naam en kies waar het wordt bewaard.'),
    h('div', { class: 'field' }, h('label', {}, 'Naam van je dashboard'), title),
    h('div', { class: 'field' }, h('label', {}, 'Thema'), seg),
    h('p', { class: 'hint', html: FS.supported
      ? 'Kies bij voorkeur <b>dezelfde map als waar dit HTML-bestand staat</b>. Daar zet Streamline je instellingenbestand neer (<code>naam.streamline.json</code>), zodat je het kunt back-uppen of delen. Er gaat niets naar internet.'
      : 'Deze browser kan geen map op je computer koppelen. Gebruik Chrome of Edge voor de beste ervaring. Je kunt nu wel starten: alles wordt dan in deze browser bewaard en je kunt het exporteren.' })),
    foot: [h('button', { class: 'btn left', onclick: () => go(false) }, 'Alleen in deze browser'), FS.supported ? h('button', { class: 'btn primary', onclick: () => go(true) }, h('span', { html: icon('folder', 15) }), 'Map kiezen en starten') : null] });
}
function start() {
  booted = true;
  applyTheme(); renderAll();
  if (!FS.dir && FS.supported) showBanner('Je instellingen staan nu alleen in deze browser. Koppel een map om ze als bestand te bewaren en te kunnen delen.', 'Map koppelen', async () => { try { await pickDir(); hideBanner(); FS.file = await freeFileName(S.meta.title); S.meta.title = fileTitle(FS.file); await flush(); await IDB.set('lastFile', FS.file); renderTop(); toast('Opgeslagen als ' + FS.file); } catch (e) {} });
  checkReminders(); setInterval(checkReminders, 10000);
  setInterval(() => { for (const it of [...S.global, ...currentPage().items]) if (it.type === 'title' && /\{(groet|tijd|datum)\}/i.test(it.config.text)) buildItem(it); }, 60000);
  if (S.update.repo) setTimeout(() => checkUpdate(false), 1500);
}
async function boot() {
  try { const t = JSON.parse(localStorage.getItem('streamline.theme') || 'null'); if (t) for (const [k, v] of Object.entries({ '--bg': t.t.bg, '--ink': t.t.ink, '--surface': t.t.surface })) document.documentElement.style.setProperty(k, v); } catch (e) {}
  $('#brandmark').innerHTML = LOGO;
  initDrag(); initPanels(); initKeys();
  // voorkom dat de browser een losgelaten bestand opent als je naast een widget mikt
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  $('#gear').onclick = () => setEditing(!editing);
  $('#btn-settings').onclick = () => showPanel('settings', !$('#panel-settings').classList.contains('show'));
  $('#btn-repo').onclick = () => showPanel('repo', !$('#panel-repo').classList.contains('show'));
  $('#btn-done').onclick = () => setEditing(false);
  $('#updatebtn').onclick = installUpdate;
  for (const b of $$('.panel .x')) b.onclick = () => showPanel(b.closest('.panel').dataset.name, false);
  await loadPlugins();
  let cached = null; try { cached = JSON.parse(localStorage.getItem('streamline.cache') || 'null'); } catch (e) {}
  if (FS.supported) FS.dir = (await IDB.get('dir')) || null;
  if (FS.dir) {
    let perm = 'prompt'; try { perm = await FS.dir.queryPermission({ mode: 'readwrite' }); } catch (e) {}
    if (perm === 'granted') { FS.perm = true; try { await openFromDir(cached); return start(); } catch (e) { console.warn(e); } }
    if (cached) { S = migrate(cached.state); FS.file = cached.file; start(); }
    else { S = defaultState('Mijn dashboard'); start(); }
    showBanner(`Klik om je map “${esc(FS.dir.name)}” weer te koppelen. Tot die tijd bewaart Streamline je wijzigingen in de browser.`, 'Map koppelen', reconnect);
    return;
  }
  if (cached) { S = migrate(cached.state); FS.file = cached.file; return start(); }
  welcome();
}
function initKeys() {
  document.addEventListener('keydown', e => {
    const typing = e.target.closest('input,textarea,select,[contenteditable="true"]');
    if (e.key === 'Escape') {
      if (openPop) return closePop();
      if (modalStack.length) return modalStack.at(-1).close();
      if (editing) return setEditing(false);
    }
    if (editing && !typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
}
const LOGO = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = 9, r2 = i % 2 ? 19 : 21.5; return `<line x1="${(24 + r1 * Math.cos(a)).toFixed(2)}" y1="${(24 + r1 * Math.sin(a)).toFixed(2)}" x2="${(24 + r2 * Math.cos(a)).toFixed(2)}" y2="${(24 + r2 * Math.sin(a)).toFixed(2)}"/>`; }).join('')}</svg>`;

/* ==========================================================================
   Streamline — ingebouwde widgets
   Elke widget gebruikt dezelfde Streamline.registerWidget()-aanpak als
   uitbreidingen van GitHub. Zie widgets/klok.js voor een voorbeeld.
   ========================================================================== */
const reg = def => Streamline.registerWidget(def);
const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const normUrl = u => { u = String(u || '').trim(); if (!u) return ''; return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u; };
const hostOf = u => { try { return new URL(normUrl(u)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
function openUrl(u) { const url = normUrl(u); if (!url) return null; return window.open(url, '_blank', 'noopener'); }

/* ---------- Paginamenu ---------- */
reg({
  type: 'nav', name: 'Paginamenu', desc: 'Wissel tussen je pagina’s met iconen of namen', icon: 'menu', group: 'basis', global: true, card: false,
  size: { w: 7, h: 2 }, min: { w: 1, h: 1 }, rebuildOnEdit: true,
  defaults: { orientation: 'h', display: 'both' },
  fields: [
    { key: 'orientation', label: 'Richting', type: 'seg', options: [['h', 'Horizontaal'], ['v', 'Verticaal']] },
    { key: 'display', label: 'Knoppen', type: 'seg', options: [['icons', 'Iconen'], ['labels', 'Namen'], ['both', 'Beide']] },
  ],
  render(el, ctx) {
    const c = ctx.config;
    const nav = h('nav', { class: 'nav' + (c.orientation === 'v' ? ' v' : '') + (c.display === 'icons' ? ' icons' : ''), 'aria-label': "Pagina's" });
    for (const p of S.pages) nav.append(h('button', { class: p.id === S.activePage ? 'on' : '', title: p.name, onclick: () => goPage(p.id),
      html: (c.display !== 'labels' ? icon(p.icon || 'layout', 18) : '') + (c.display !== 'icons' ? `<span>${esc(p.name)}</span>` : '') }));
    if (editing) nav.append(h('button', { class: 'addpage', title: 'Nieuwe pagina', html: icon('plus', 18), onclick: newPage }));
    el.append(nav);
  },
});

/* ---------- Titel ---------- */
const TITLE_SIZES = { 1: 15, 2: 19, 3: 26, 4: 34, 5: 46, 6: 60 };
reg({
  type: 'title', name: 'Titel', desc: 'Kop boven een widget of groep. Lettertype en kleur stel je in bij Instellingen → Titels', icon: 'type', group: 'basis', card: false,
  size: { w: 8, h: 1 }, min: { w: 1, h: 1 }, configOnAdd: true,
  defaults: { text: 'Nieuwe titel', size: 3, align: 'left', valign: 'bottom' },
  fields: [
    { key: 'text', label: 'Tekst', type: 'text', hint: 'Tip: {groet}, {datum} en {tijd} worden automatisch ingevuld.' },
    { key: 'size', label: 'Grootte', type: 'seg', options: [[1, 'XS'], [2, 'S'], [3, 'M'], [4, 'L'], [5, 'XL'], [6, 'XXL']] },
    { key: 'align', label: 'Uitlijning', type: 'seg', options: [['left', 'Links'], ['center', 'Midden'], ['right', 'Rechts']] },
    { key: 'valign', label: 'Verticaal', type: 'seg', options: [['bottom', 'Onder'], ['mid', 'Midden']] },
  ],
  render(el, { config: c }) {
    el.append(h('div', { class: `ttl ${c.align} ${c.valign === 'mid' ? 'mid' : ''}`, style: { fontSize: (TITLE_SIZES[c.size] || 26) + 'px' } }, fmtVars(c.text)));
  },
});

/* ---------- Achtergrondvak ---------- */
reg({
  type: 'box', name: 'Achtergrondvak', desc: 'Groepeer widgets op een eigen achtergrond', icon: 'box', group: 'basis', card: false,
  size: { w: 10, h: 8 }, min: { w: 1, h: 1 },
  defaults: { bg: '', opacity: 60, paddingMode: 'outside', padding: 20, btnFontSizeOn: false, btnFontSize: 14, radiusAuto: true, radius: 24, border: '', borderWidth: 0, shadow: false },
  fields: [
    { key: 'paddingMode', label: 'Ruimte rond de inhoud', type: 'seg', options: [['outside', 'Buiten het vak'], ['inside', 'Binnen het vak']],
      hint: 'Buiten: het vak steekt uit rond zijn rastervakjes; de widgets erin blijven precies op het paginaraster. Laat één lege rij of kolom vrij naar de buren. — Binnen: het vak blijft precies op zijn rastervakjes en krijgt een eigen raster dat iets kleiner is. Widgets erin worden dus net iets kleiner, maar het vak zelf lijnt uit met de rest.' },
    { key: 'padding', label: 'Hoeveel ruimte', type: 'range', min: 0, max: 64, step: 2, unit: 'px' },
    { key: 'bg', label: 'Achtergrondkleur', type: 'color', allowTheme: true },
    { key: 'opacity', label: 'Dekking', type: 'range', min: 0, max: 100, unit: '%' },
    { key: 'radiusAuto', label: 'Hoeken automatisch laten meelopen met de widgets erin', type: 'checkbox' },
    { key: 'radius', label: 'Afronding hoeken', type: 'range', min: 0, max: 64, unit: 'px', showIf: c => !c.radiusAuto },
    { key: 'border', label: 'Randkleur', type: 'color', allowTheme: true },
    { key: 'borderWidth', label: 'Randdikte', type: 'range', min: 0, max: 8, unit: 'px' },
    { key: 'shadow', label: 'Schaduw', type: 'checkbox' },
    { key: 'btnFontSizeOn', label: 'Eigen tekstgrootte voor de knoppen in dit vak', type: 'checkbox' },
    { key: 'btnFontSize', label: 'Tekstgrootte knoppen in dit vak', type: 'range', min: 9, max: 32, unit: 'px', showIf: c => c.btnFontSizeOn },
  ],
  async beforeSave(item, cfg) {
    if (!cfg.btnFontSizeOn || (item.config.btnFontSizeOn && item.config.btnFontSize === cfg.btnFontSize)) return;
    const list = findItem(item.id).list || [];
    const own = list.filter(i => inside(i, item) && ((WIDGETS[i.type]?.isButton && i.config.fontSizeOn) || (i.type === 'box' && i.config.btnFontSizeOn)));
    if (!own.length) return;
    const nb = own.filter(i => i.type !== 'box').length, nv = own.length - nb;
    const what = [nb ? `${nb} knop${nb === 1 ? '' : 'pen'}` : '', nv ? `${nv} vak${nv === 1 ? '' : 'ken'}` : ''].filter(Boolean).join(' en ');
    const pick = await choiceDlg('Eigen instellingen gevonden', `In dit vak ${nb + nv === 1 ? 'heeft' : 'hebben'} ${what} een eigen tekstgrootte. Wil je die ook op ${cfg.btnFontSize} px zetten?`,
      [['keep', 'Nee, die laten staan'], ['all', 'Ja, ook die aanpassen', true]]);
    if (pick === null) return false;
    if (pick === 'all') own.forEach(i => { if (i.type === 'box') i.config.btnFontSizeOn = false; else i.config.fontSizeOn = false; });
  },
  render(el, { config: c }) {
    const a = (c.opacity ?? 60) / 100, p = c.padding ?? 20;
    // automatisch: buitenhoek = hoek van de widgets + de ruimte ertussen, zodat de rondingen netjes 'meelopen'
    const radius = c.radiusAuto !== false ? `calc(var(--r) + ${p}px)` : c.radius + 'px';
    el.style.position = 'relative';
    el.append(
      c.paddingMode === 'inside' ? h('div', { class: 'boxmask', style: { borderRadius: radius } }) : '',
      h('div', { class: 'boxv', style: {
        background: c.bg ? hexA(c.bg, a) : `color-mix(in srgb, var(--surface) ${Math.round(a * 100)}%, transparent)`,
        borderRadius: radius, border: c.borderWidth ? `${c.borderWidth}px solid ${c.border || 'var(--line)'}` : 'none',
        boxShadow: c.shadow ? 'var(--shadow)' : 'none' } }),
      h('div', { class: 'boxpad', title: 'Binnen deze lijn staan de widgets die bij dit vak horen', style: { inset: p + 'px' } }));
  },
});

/* ---------- Link-knop ---------- */
const LABEL_FIELDS = [
  { key: 'labelPos', label: 'Plaats van de naam', type: 'seg', options: [['bottom', 'Onder'], ['top', 'Boven'], ['left', 'Links'], ['right', 'Rechts'], ['center', 'Midden']],
    hint: '“Midden” zet de naam precies over het icoon. Is de knop te klein voor de tekst, dan blijft de tekst tegen de rand staan en schuift hij deels over het icoon.' },
  { key: 'showLabel', label: 'Naam tonen', type: 'checkbox' },
  { key: 'fontSizeOn', label: 'Eigen tekstgrootte voor deze knop', type: 'checkbox', hint: 'Uit = de knop volgt de tekstgrootte van het vak eromheen, of anders de algemene instelling (Instellingen → Algemeen → Knoppen).' },
  { key: 'fontSize', label: 'Tekstgrootte', type: 'range', min: 9, max: 32, unit: 'px', showIf: c => c.fontSizeOn },
];
const STYLE_FIELD = { key: 'style', label: 'Stijl', type: 'seg', options: [['card', 'Kaart'], ['accent', 'Accent'], ['dark', 'Donker'], ['outline', 'Rand']] };
const BTN_FIELDS = [
  { key: 'iconMode', label: 'Afbeelding', type: 'seg', options: [['icon', 'Icoon'], ['favicon', 'Favicon van website'], ['none', 'Geen']] },
  { key: 'icon', label: 'Icoon', type: 'icon', showIf: c => c.iconMode === 'icon' },
  STYLE_FIELD,
  ...LABEL_FIELDS,
];
const BTN_DEFAULTS = { style: 'card', labelPos: 'bottom', showLabel: true, fontSizeOn: false, fontSize: 14 };

/* Knoppen schalen mee met hun grootte. Past de tekst niet, dan blijft hij tegen
   de rand staan (onder/boven/links/rechts) en schuift hij deels over het icoon. */
const BTN_RO = new ResizeObserver(entries => entries.forEach(e => fitButton(e.target)));
function fitButton(lb) {
  if (!lb.isConnected) return;
  const W = lb.clientWidth, H = lb.clientHeight; if (!W || !H) return;
  const ic = lb.querySelector('.lbi'), tx = lb.querySelector('.lbx'), t = tx && tx.querySelector('.lbt'), sub = tx && tx.querySelector('.lbs');
  const m = Math.min(W, H), pad = Math.round(clamp(m * .1, 6, 16));
  lb.style.padding = pad + 'px'; lb.style.setProperty('--pad', pad + 'px');
  if (ic) {
    const sz = Math.round(clamp(m * .4, 18, 64));
    ic.style.width = ic.style.height = sz + 'px'; ic.style.borderRadius = Math.round(sz * .32) + 'px';
    ic.style.setProperty('--ics', Math.round(sz * .52) + 'px'); lb.style.gap = Math.round(clamp(sz * .22, 4, 14)) + 'px';
  }
  if (!tx) return;
  lb.classList.remove('tight'); t.style.webkitLineClamp = ''; if (sub) sub.style.display = '';
  const center = lb.classList.contains('pos-center');
  if (!center && lb.scrollHeight <= H + 1 && lb.scrollWidth <= W + 1) return;
  if (!center && ic) lb.classList.add('tight');
  const avail = H - 2 * pad;
  if (tx.scrollHeight > avail && sub) sub.style.display = 'none';
  if (tx.scrollHeight > avail) { const lh = parseFloat(getComputedStyle(t).lineHeight) || 16; t.style.webkitLineClamp = String(Math.max(1, Math.floor(avail / lh))); }
}
window.fitButton = fitButton;
function buttonFace(c, url) {
  const pos = c.labelPos || (c.layout === 'row' ? 'right' : 'bottom');
  const lb = h('button', { class: `lb ${c.style || 'card'} pos-${pos}`, title: c.label || url });
  if (c.iconMode !== 'none') {
    const box = h('span', { class: 'lbi' });
    const host = hostOf(url);
    if (c.iconMode === 'favicon' && host) {
      const img = h('img', { alt: '', src: `https://${new URL(normUrl(url)).host}/favicon.ico`, referrerpolicy: 'no-referrer' });
      img.onerror = () => { box.innerHTML = icon('globe', 22); };
      box.append(img);
    } else box.innerHTML = icon(c.icon || 'globe', 22);
    lb.append(box);
  }
  if (c.showLabel !== false) lb.append(h('span', { class: 'lbx' }, h('span', { class: 'lbt' }, c.label || hostOf(url) || 'Knop'), c.sub ? h('span', { class: 'lbs' }, c.sub) : null));
  BTN_RO.observe(lb);
  requestAnimationFrame(() => fitButton(lb));
  return lb;
}
reg({
  type: 'link', name: 'Link-knop', desc: 'Opent een website in een nieuw tabblad', icon: 'link', group: 'basis', card: false, isButton: true,
  size: { w: 3, h: 3 }, min: { w: 1, h: 1 }, configOnAdd: true,
  defaults: { label: 'Nieuwe link', url: '', sub: '', iconMode: 'favicon', icon: 'globe', ...BTN_DEFAULTS },
  fields: [
    { key: 'label', label: 'Naam', type: 'text' },
    { key: 'url', label: 'Webadres', type: 'url', placeholder: 'https://…' },
    { key: 'sub', label: 'Onderschrift (optioneel)', type: 'text' },
    ...BTN_FIELDS,
  ],
  render(el, { config: c }) {
    const b = buttonFace(c, c.url);
    b.onclick = () => { if (!c.url) return toast('Deze knop heeft nog geen webadres — open de bewerkmodus via het tandwiel'); openUrl(c.url); };
    el.append(b);
  },
});

/* ---------- Map- of bestandsknop ---------- */
// Zet een Windows-pad (C:\..., \\server\share\...) om naar een file:-adres dat Chrome/Edge kan openen.
function pathToUrl(p) {
  p = String(p || '').trim().replace(/^"(.*)"$/, '$1');
  if (!p) return '';
  if (/^file:/i.test(p)) return p;
  const unc = /^\\\\/.test(p);
  const parts = p.replace(/^\\\\/, '').split(/[\\/]+/).filter((x, i, a) => x || i === a.length - 1);
  const enc = parts.map((seg, i) => (i === 0 && /^[a-z]:$/i.test(seg)) ? seg : encodeURIComponent(seg)).join('/');
  return unc ? 'file://' + enc : 'file:///' + enc;
}
const isFilePath = p => /\.[a-z0-9]{1,6}"?$/i.test(String(p || '').trim()) && !/[\\/]$/.test(String(p || '').trim());
reg({
  type: 'localpath', name: 'Map- of bestandsknop', desc: 'Opent een map of bestand op je computer of netwerkschijf', icon: 'folder', group: 'basis', card: false, isButton: true,
  size: { w: 3, h: 3 }, min: { w: 1, h: 1 }, configOnAdd: true,
  defaults: { label: 'Nieuwe map', path: '', sub: '', action: 'open', iconMode: 'auto', icon: 'folder', ...BTN_DEFAULTS },
  fields: [
    { key: 'label', label: 'Naam', type: 'text' },
    { key: 'path', label: 'Pad naar map of bestand', type: 'text', placeholder: 'C:\\Users\\jij\\Documents\\Projecten  of  \\\\server\\gedeeld\\Marketing',
      hint: 'Pad kopiëren in Windows Verkenner: klik met rechts op de map of het bestand → “Als pad kopiëren” (of Shift + rechtsklik → “Kopiëren als pad”) en plak het hier.' },
    { key: 'action', label: 'Bij klikken', type: 'seg', options: [['open', 'Openen in nieuw tabblad'], ['copy', 'Pad kopiëren']],
      hint: 'Een browser mag Verkenner of programma’s zoals Word niet zelf starten. “Openen” toont een map als lijst waarin je kunt doorklikken; PDF’s, afbeeldingen en tekst openen direct. “Pad kopiëren” zet het pad op je klembord: druk in Verkenner op Ctrl+L en Ctrl+V om er direct heen te gaan.' },
    { key: 'sub', label: 'Onderschrift (optioneel)', type: 'text' },
    { key: 'iconMode', label: 'Afbeelding', type: 'seg', options: [['auto', 'Automatisch'], ['icon', 'Zelf kiezen'], ['none', 'Geen']] },
    { key: 'icon', label: 'Icoon', type: 'icon', showIf: c => c.iconMode === 'icon' },
    STYLE_FIELD,
    ...LABEL_FIELDS,
  ],
  render(el, { config: c }) {
    const face = { ...c, iconMode: c.iconMode === 'none' ? 'none' : 'icon', icon: c.iconMode === 'icon' ? c.icon : (isFilePath(c.path) ? 'file' : 'folder') };
    const b = buttonFace(face, '');
    b.title = c.path || 'Nog geen pad ingesteld';
    b.onclick = async () => {
      if (!c.path) return toast('Deze knop heeft nog geen pad — open de bewerkmodus via het tandwiel');
      const clean = c.path.trim().replace(/^"(.*)"$/, '$1');
      if (c.action === 'copy') {
        try { await navigator.clipboard.writeText(clean); toast('Pad gekopieerd — in Verkenner: Ctrl+L, Ctrl+V, Enter'); }
        catch (e) { toast('Kopiëren lukte niet: ' + clean, 6000); }
        return;
      }
      const w = window.open(pathToUrl(clean), '_blank');
      if (!w) toast('Je browser blokkeerde het openen. Sta pop-ups toe voor Streamline (icoon in de adresbalk).', 6000);
    };
    el.append(b);
  },
});

/* ---------- Actieknop (meerdere sites + toetsaanslagen) ---------- */
const STEP_TYPES = {
  open: { label: 'Open website', fields: [['url', 'Webadres', 'https://…']] },
  wait: { label: 'Wacht', fields: [['ms', 'Milliseconden', '1500']] },
  waitFor: { label: 'Wacht op element', fields: [['selector', 'CSS-selector', '#zoekveld'], ['ms', 'Max. wachten (ms)', '10000']] },
  click: { label: 'Klik op element', fields: [['selector', 'CSS-selector', 'button[type=submit]']] },
  fill: { label: 'Vul veld in', fields: [['selector', 'CSS-selector', 'input[name=q]'], ['text', 'Tekst', '']] },
  type: { label: 'Typ tekst', fields: [['text', 'Tekst (in het actieve veld)', '']] },
  key: { label: 'Druk op toets', fields: [['key', 'Toets', 'Enter']] },
  copy: { label: 'Kopieer naar klembord', fields: [['text', 'Tekst', '']] },
};
const KEYS = ['Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'Delete', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Ctrl+A', 'Ctrl+Enter', 'Shift+Tab'];
function stepsEditor(el, cfg) {
  cfg.steps = cfg.steps || [];
  const list = h('div');
  const draw = () => {
    list.innerHTML = '';
    cfg.steps.forEach((st, i) => {
      const t = STEP_TYPES[st.t] || STEP_TYPES.open;
      const sf = h('div', { class: 'sf' });
      for (const [k, l, ph] of t.fields) {
        if (st.t === 'key') sf.append(h('select', { class: 'inp', value: st.key || 'Enter', onchange: e => st.key = e.target.value }, KEYS.map(k2 => h('option', { value: k2 }, k2))));
        else sf.append(h('input', { class: 'inp', placeholder: l + (ph ? ' — bijv. ' + ph : ''), value: st[k] ?? '', oninput: e => st[k] = e.target.value }));
      }
      if (st.t === 'open') sf.append(h('label', { class: 'check', style: { margin: 0 } }, h('input', { type: 'checkbox', checked: st.bg, onchange: e => st.bg = e.target.checked }), 'Op de achtergrond openen'));
      list.append(h('div', { class: 'step' },
        h('select', { class: 'inp', value: st.t, onchange: e => { st.t = e.target.value; draw(); } }, Object.entries(STEP_TYPES).map(([k, v]) => h('option', { value: k }, (i + 1) + '. ' + v.label))),
        sf,
        h('div', { class: 'sa' },
          ib('chevronup', 'Omhoog', () => { if (i) { cfg.steps.splice(i - 1, 0, cfg.steps.splice(i, 1)[0]); draw(); } }, 'mini'),
          ib('chevrondown', 'Omlaag', () => { if (i < cfg.steps.length - 1) { cfg.steps.splice(i + 1, 0, cfg.steps.splice(i, 1)[0]); draw(); } }, 'mini'),
          ib('trash', 'Verwijderen', () => { cfg.steps.splice(i, 1); draw(); }, 'mini'))));
    });
    if (!cfg.steps.length) list.append(h('div', { class: 'empty' }, 'Nog geen stappen. Begin met “Open website”.'));
  };
  draw();
  el.append(h('div', { class: 'sect' }, h('h4', {}, 'Stappen'), list,
    h('div', { class: 'row', style: { flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', onclick: () => { cfg.steps.push({ t: 'open', url: '' }); draw(); } }, '+ Website'),
      h('button', { class: 'btn sm', onclick: () => { cfg.steps.push({ t: 'wait', ms: 1500 }); draw(); } }, '+ Wachttijd'),
      h('button', { class: 'btn sm', onclick: () => { cfg.steps.push({ t: 'type', text: '' }); draw(); } }, '+ Tekst typen'),
      h('button', { class: 'btn sm', onclick: () => { cfg.steps.push({ t: 'key', key: 'Enter' }); draw(); } }, '+ Toets'),
      h('button', { class: 'btn sm', onclick: () => { cfg.steps.push({ t: 'fill', selector: '', text: '' }); draw(); } }, '+ Veld invullen')),
    h('p', { class: 'hint', html: 'Alle stappen na “Open website” gebeuren in dát tabblad, tot de volgende “Open website”.<br>' +
      '<b>Slimme invulvelden:</b> <code>{vraag:Zoekterm}</code> vraagt bij het klikken om een waarde, <code>{datum}</code> en <code>{tijd}</code> worden automatisch ingevuld.<br>' +
      '<b>CSS-selector:</b> rechtsklik op een veld in de website → Inspecteren → rechtsklik op de gemarkeerde regel → Kopiëren → Selector kopiëren.<br>' +
      'Toetsaanslagen, klikken en invullen werken met de extensie <b>Streamline Helper</b>; zonder extensie opent de knop alleen de websites.' })));
}
async function runAction(item) {
  const steps = clone(item.config.steps || []);
  if (!steps.length) return toast('Deze actieknop heeft nog geen stappen');
  const asks = new Map();
  const scan = s => String(s ?? '').replace(/\{vraag:([^}]+)\}/gi, (_, l) => { asks.set(l, null); return _; });
  steps.forEach(st => Object.values(st).forEach(scan));
  for (const l of asks.keys()) { const v = await ask(item.config.label || 'Actie', l); if (v == null) return; asks.set(l, v); }
  const fill = s => typeof s === 'string' ? fmtVars(s.replace(/\{vraag:([^}]+)\}/gi, (_, l) => asks.get(l) ?? '')) : s;
  for (const st of steps) for (const k in st) st[k] = fill(st[k]);
  for (const st of steps) if (st.t === 'open') st.url = normUrl(st.url);
  const helper = document.documentElement.dataset.streamlineHelper;
  if (helper) {
    const cp = steps.filter(s => s.t === 'copy').at(-1);
    if (cp) { try { await navigator.clipboard.writeText(cp.text || ''); } catch (e) {} }
    window.postMessage({ type: 'streamline-run', id: uid(), steps: steps.filter(s => s.t !== 'copy') }, '*');
    toast('Actie gestart…');
    return;
  }
  let blocked = false, copied = '';
  for (const st of steps) {
    if (st.t === 'open') { const w = window.open(st.url, '_blank'); if (!w) blocked = true; }
    if (st.t === 'copy' || ((st.t === 'type' || st.t === 'fill') && !copied && st.text)) copied = st.text;
  }
  if (copied) { try { await navigator.clipboard.writeText(copied); } catch (e) { copied = ''; } }
  const needsHelper = steps.some(s => ['type', 'key', 'click', 'fill', 'waitFor'].includes(s.t));
  if (blocked) toast('Je browser blokkeerde extra tabbladen: klik op het pop-up-icoon in de adresbalk en kies “Altijd toestaan”.', 6500);
  else if (needsHelper) toast(copied ? 'Websites geopend. Tekst staat op je klembord (Ctrl+V) — installeer Streamline Helper voor automatisch typen.' : 'Websites geopend. Voor toetsaanslagen is de extensie Streamline Helper nodig.', 6500);
}
window.addEventListener('message', e => {
  if (e.source !== window || e.data?.type !== 'streamline-run-status') return;
  if (e.data.error) toast('Actie: ' + e.data.error, 5000); else if (e.data.done) toast('Actie klaar');
});
reg({
  type: 'action', name: 'Actieknop', desc: 'Opent meerdere sites en kan typen, klikken, wachten en invullen', icon: 'zap', group: 'basis', card: false, isButton: true,
  size: { w: 3, h: 3 }, min: { w: 1, h: 1 }, configOnAdd: true, wideConfig: true,
  defaults: { label: 'Nieuwe actie', sub: '', iconMode: 'icon', icon: 'zap', ...BTN_DEFAULTS, style: 'accent', steps: [{ t: 'open', url: '' }] },
  fields: [{ key: 'label', label: 'Naam', type: 'text' }, { key: 'sub', label: 'Onderschrift (optioneel)', type: 'text' }, ...BTN_FIELDS],
  editor: stepsEditor,
  render(el, ctx) {
    const c = ctx.config;
    const firstUrl = (c.steps || []).find(s => s.t === 'open')?.url || '';
    const b = buttonFace(c, firstUrl);
    b.onclick = () => runAction(ctx.item);
    el.append(b);
  },
});

/* ---------- Radio ---------- */
// Lijst gebaseerd op de zenders van nederland.fm. Het veld "page" verwijst naar de zenderpagina daar.
const RADIO = [
  ['NPO Radio 1', 'https://icecast.omroep.nl/radio1-bb-mp3', 'radio1'],
  ['NPO Radio 2', 'https://icecast.omroep.nl/radio2-bb-mp3', 'radio2'],
  ['NPO 3FM', 'https://icecast.omroep.nl/3fm-bb-mp3', '3fm'],
  ['NPO Klassiek', 'https://icecast.omroep.nl/radio4-bb-mp3', 'radio4'],
  ['NPO Radio 5', 'https://icecast.omroep.nl/radio5-bb-mp3', 'radio5'],
  ['FunX', 'https://icecast.omroep.nl/funx-bb-mp3', 'funx'],
  ['Radio 538', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO538.mp3', 'radio538'],
  ['Qmusic', 'https://stream.qmusic.nl/qmusic/mp3', 'q-music'],
  ['Qmusic Non-Stop', 'https://stream.qmusic.nl/nonstop/mp3', 'qmusicnonstop'],
  ['Qmusic Foute Uur', 'https://stream.qmusic.nl/fouteuur/mp3', 'qmusichetfouteuur'],
  ['Sky Radio', 'https://playerservices.streamtheworld.com/api/livestream-redirect/SKYRADIO.mp3', 'skyradio'],
  ['Radio 10', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO10.mp3', 'radio10'],
  ['Radio Veronica', 'https://playerservices.streamtheworld.com/api/livestream-redirect/VERONICA.mp3', 'veronicafm'],
  ['BNR Nieuwsradio', 'https://playerservices.streamtheworld.com/api/livestream-redirect/BNR_NIEUWSRADIO.mp3', 'bnr'],
  ['100%NL', 'https://stream.100p.nl/100pctnl.mp3', '100pnl'],
  ['SLAM!', 'https://stream.slam.nl/slam_mp3', 'slamfm'],
  ['JOE', 'https://stream.joe.nl/joe/mp3', 'joe'],
  ['KINK', 'https://playerservices.streamtheworld.com/api/livestream-redirect/KINK.mp3', 'kink'],
  ['Arrow Classic Rock', 'https://stream.gal.io/arrow', 'arrowclassicrock'],
  ['Radio Decibel', 'https://playerservices.streamtheworld.com/api/livestream-redirect/DECIBEL.mp3', 'decibel'],
  ['Sublime', 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUBLIME.mp3', 'sublimefm'],
  ['Radio Noordzee', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIONOORDZEE.mp3', 'radionoordzee'],
].map(([name, url, page]) => ({ name, url, page }));
const AUDIO = new Map();
function radioState(item) {
  let st = AUDIO.get(item.id);
  if (!st) {
    const audio = new Audio(); audio.preload = 'none';
    st = { audio, status: 'stil' };
    const upd = s => { st.status = s; radioRefresh(item); };
    audio.addEventListener('playing', () => upd('speelt'));
    audio.addEventListener('waiting', () => upd('laden'));
    audio.addEventListener('pause', () => upd('stil'));
    audio.addEventListener('error', () => { if (audio.src) upd('fout'); });
    AUDIO.set(item.id, st);
  }
  st.audio.volume = (item.data.volume ?? 70) / 100;
  return st;
}
const stations = item => (item.config.stations && item.config.stations.length ? item.config.stations : RADIO);
function radioRefresh(item) {
  const el = els.get(item.id); if (!el) return;
  const st = AUDIO.get(item.id), sta = stations(item)[item.data.idx || 0] || stations(item)[0];
  const p = el.querySelector('.radio-play'), s = el.querySelector('.radio-status');
  if (!p || !s) return;
  p.innerHTML = icon(st?.status === 'speelt' || st?.status === 'laden' ? 'pause' : 'play', 24);
  s.innerHTML = st?.status === 'speelt' ? '<span class="eq"><i></i><i></i><i></i></span> Live'
    : st?.status === 'laden' ? 'Verbinden…'
    : st?.status === 'fout' ? `<span style="color:var(--hi)">Stream werkt niet</span> · <a href="#" class="np">open op nederland.fm</a>` : 'Klik op afspelen';
  const np = s.querySelector('.np'); if (np) np.onclick = e => { e.preventDefault(); openUrl('https://www.nederland.fm/radio/' + (sta.page || '')); };
}
reg({
  type: 'radio', name: 'Radio', desc: 'Luister naar Nederlandse radiozenders (via nederland.fm)', icon: 'radio', group: 'widgets',
  size: { w: 6, h: 3 }, min: { w: 3, h: 2 },
  defaults: { title: '', stations: null },
  fields: [{ key: 'title', label: 'Kop (optioneel)', type: 'text' }],
  editor(el, cfg) {
    let list = clone(cfg.stations && cfg.stations.length ? cfg.stations : RADIO);
    cfg.stations = list;
    const box = h('div');
    const draw = () => {
      box.innerHTML = '';
      list.forEach((s, i) => box.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('input', { class: 'inp', style: { flex: '0 0 34%' }, value: s.name, oninput: e => s.name = e.target.value }),
        h('input', { class: 'inp grow', value: s.url, placeholder: 'Stream-adres', oninput: e => s.url = e.target.value }),
        ib('trash', 'Verwijderen', () => { list.splice(i, 1); draw(); }, 'mini'))));
    };
    draw();
    el.append(h('div', { class: 'sect' }, h('h4', {}, 'Zenders'), box,
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { list.push({ name: 'Nieuwe zender', url: '', page: '' }); draw(); } }, '+ Zender'),
        h('button', { class: 'btn sm', onclick: () => { list.splice(0, list.length, ...clone(RADIO)); draw(); } }, 'Standaardlijst herstellen')),
      h('p', { class: 'hint' }, 'Werkt een zender niet? Open hem op nederland.fm, en plak het stream-adres hier (te vinden via F12 → Netwerk → “media”).')));
  },
  render(el, ctx) {
    const item = ctx.item, st = radioState(item), list = stations(item);
    item.data.idx = clamp(item.data.idx || 0, 0, list.length - 1);
    const play = () => {
      const s = list[item.data.idx];
      if (st.status === 'speelt' || st.status === 'laden') { st.audio.pause(); st.audio.removeAttribute('src'); st.audio.load(); st.status = 'stil'; radioRefresh(item); return; }
      st.audio.src = s.url; st.status = 'laden'; radioRefresh(item);
      st.audio.play().catch(() => { st.status = 'fout'; radioRefresh(item); });
    };
    const pick = i => { const playing = st.status === 'speelt' || st.status === 'laden'; item.data.idx = (i + list.length) % list.length; ctx.save(); if (playing) { st.status = 'stil'; play(); } ctx.rerender(); };
    const sel = h('select', { class: 'inp', style: { padding: '6px 10px' }, value: String(item.data.idx), onchange: e => pick(+e.target.value) }, list.map((s, i) => h('option', { value: String(i) }, s.name)));
    el.append(h('div', { class: 'radio' },
      h('div', { class: 'radio-now' },
        h('button', { class: 'radio-play', title: 'Afspelen / stoppen', onclick: play }),
        h('div', { class: 'radio-meta' }, h('b', {}, list[item.data.idx]?.name || '—'), h('small', { class: 'radio-status' })),
        ib('prev', 'Vorige zender', () => pick(item.data.idx - 1), 'mini'), ib('next', 'Volgende zender', () => pick(item.data.idx + 1), 'mini')),
      h('div', { class: 'radio-ctrl' }, h('div', { class: 'grow' }, sel),
        h('span', { html: icon('volume', 16), style: { color: 'var(--muted)' } }),
        h('input', { type: 'range', min: 0, max: 100, value: item.data.volume ?? 70, style: { width: '90px' }, oninput: e => { item.data.volume = +e.target.value; st.audio.volume = item.data.volume / 100; }, onchange: () => ctx.save() }))));
    radioRefresh(item);
  },
  onDelete(item) { const st = AUDIO.get(item.id); if (st) { st.audio.pause(); st.audio.src = ''; AUDIO.delete(item.id); } },
});

/* ---------- To do's ---------- */
const PRIO = { hoog: 0, medium: 1, laag: 2 };
const PRIO_LABEL = { hoog: 'Hoog', medium: 'Medium', laag: 'Laag' };
function decodeMimeWords(s) {
  return s.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
    try {
      const bin = enc.toUpperCase() === 'B' ? atob(txt) : txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
      return new TextDecoder(cs).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    } catch (e) { return txt; }
  });
}
async function titlesFromDrop(dt) {
  const out = [];
  for (const f of [...(dt.files || [])]) {
    const n = f.name || '';
    if (/\.eml$/i.test(n)) {
      const head = (await f.slice(0, 64000).text()).split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
      const m = /^Subject:\s*(.*)$/im.exec(head);
      out.push(m ? decodeMimeWords(m[1]).trim() : n.replace(/\.eml$/i, ''));
    } else out.push(n.replace(/\.(msg|eml|txt|url|html?)$/i, ''));
  }
  if (!out.length) {
    const t = dt.getData('text/plain') || dt.getData('text/uri-list') || '';
    const line = t.split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (line) out.push(line);
  }
  return out.map(s => s.slice(0, 240)).filter(Boolean);
}
reg({
  type: 'todo', name: "To do's", desc: 'Taken met prioriteit en herinnering. Sleep een e-mail erin om er een taak van te maken', icon: 'checksquare', group: 'widgets',
  size: { w: 7, h: 9 }, min: { w: 3, h: 4 },
  defaults: { title: "To do's", defaultPrio: 'medium', showDone: true },
  fields: [
    { key: 'title', label: 'Kop', type: 'text' },
    { key: 'defaultPrio', label: 'Standaard prioriteit', type: 'seg', options: [['hoog', 'Hoog'], ['medium', 'Medium'], ['laag', 'Laag']] },
    { key: 'showDone', label: 'Afgevinkte taken blijven zichtbaar (onderaan)', type: 'checkbox' },
  ],
  render(el, ctx) {
    const item = ctx.item, d = item.data; d.items = d.items || [];
    let prio = ctx.config.defaultPrio || 'medium';
    const inp = h('input', { class: 'inp grow', placeholder: 'Nieuwe to-do… (of sleep een e-mail hierheen)' });
    const pr = h('div', { class: 'prio', title: 'Prioriteit' });
    const drawPr = () => { pr.innerHTML = ''; for (const p of ['hoog', 'medium', 'laag']) pr.append(h('button', { class: prio === p ? 'on' : '', title: PRIO_LABEL[p], onclick: () => { prio = p; drawPr(); } }, h('i', { class: 'pc-' + p }))); };
    drawPr();
    const add = (text, p = prio) => { if (!text) return; d.items.push({ id: uid(), text, prio: p, done: false, created: Date.now() }); ctx.save(); drawList(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { add(inp.value.trim()); inp.value = ''; } });
    const list = h('div', { class: 'todo-list' });
    const foot = h('div', { class: 'todo-foot' });
    const drawList = () => {
      list.innerHTML = '';
      const items = d.items.filter(t => ctx.config.showDone !== false || !t.done)
        .sort((a, b) => (a.done - b.done) || (PRIO[a.prio] - PRIO[b.prio]) || (a.created - b.created));
      for (const t of items) {
        const tt = h('div', { class: 'tt', title: 'Dubbelklik om te bewerken' }, t.text);
        tt.ondblclick = () => { tt.contentEditable = 'true'; tt.focus(); document.getSelection().selectAllChildren(tt); };
        tt.onblur = () => { if (tt.isContentEditable) { tt.contentEditable = 'false'; const v = tt.textContent.trim(); if (v) { t.text = v; ctx.save(); } else tt.textContent = t.text; } };
        tt.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); tt.blur(); } if (e.key === 'Escape') { tt.textContent = t.text; tt.blur(); } };
        const bell = h('button', { class: 'mini' + (t.remindAt ? ' on' : ''), title: 'Herinnering', html: icon('bell', 15) });
        bell.onclick = () => ctx.remind(bell, t.remindAt, ts => { t.remindAt = ts; t.reminded = false; ctx.save(); drawList(); });
        list.append(h('div', { class: 'todo' + (t.done ? ' done' : '') },
          h('span', { class: 'bar pc-' + t.prio }),
          h('button', { class: 'cb', title: t.done ? 'Niet gedaan' : 'Gedaan', html: icon('check', 13), onclick: () => { t.done = !t.done; ctx.save(); drawList(); } }),
          tt,
          t.remindAt && !t.done ? h('span', { class: 'meta', title: 'Herinnering' }, fmtWhen(t.remindAt)) : null,
          h('div', { class: 'ta' + (t.remindAt ? ' has' : '') },
            h('button', { class: 'mini', title: 'Prioriteit wijzigen (nu: ' + PRIO_LABEL[t.prio] + ')', onclick: () => { t.prio = { hoog: 'medium', medium: 'laag', laag: 'hoog' }[t.prio]; ctx.save(); drawList(); } }, h('i', { class: 'pc-' + t.prio, style: { width: '10px', height: '10px', borderRadius: '50%', display: 'block' } })),
            bell,
            h('button', { class: 'mini', title: 'Verwijderen', html: icon('x', 15), onclick: () => { d.items.splice(d.items.indexOf(t), 1); ctx.save(); drawList(); } }))));
      }
      if (!items.length) list.append(h('div', { class: 'empty', html: icon('inbox', 26).replace('class="ic"', 'class="ic" style="margin:0 auto 6px;opacity:.5"') + 'Niets te doen. Typ hierboven of sleep een e-mail uit Outlook hierheen.' }));
      const open = d.items.filter(t => !t.done).length, done = d.items.length - open;
      foot.innerHTML = '';
      foot.append(h('span', {}, `${open} open`), done ? h('button', { class: 'linkbtn', onclick: () => { d.items = d.items.filter(t => !t.done); ctx.save(); drawList(); } }, `${done} afgevinkt wissen`) : '');
    };
    drawList();
    el.append(h('div', { class: 'todo-add' }, inp, pr, h('button', { class: 'iconbtn', title: 'Toevoegen', html: icon('plus', 16), onclick: () => { add(inp.value.trim()); inp.value = ''; } })), list, foot);
    const card = el.closest('.card') || el;
    card.addEventListener('dragover', e => { if (editing) return; e.preventDefault(); e.stopPropagation(); card.classList.add('dropping'); });
    card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('dropping'); });
    card.addEventListener('drop', async e => {
      if (editing) return; e.preventDefault(); e.stopPropagation(); card.classList.remove('dropping');
      const titles = await titlesFromDrop(e.dataTransfer);
      if (!titles.length) return toast('Ik kon hier geen titel uit halen');
      titles.forEach(t => d.items.push({ id: uid(), text: t, prio: ctx.config.defaultPrio || 'medium', done: false, created: Date.now(), fromMail: true }));
      ctx.save(); drawList(); toast(titles.length === 1 ? 'To-do toegevoegd: ' + titles[0] : titles.length + " to do's toegevoegd");
    });
  },
});

/* ---------- Notities (WYSIWYG) ---------- */
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'DIV', 'UL', 'OL', 'LI', 'H3', 'A', 'MARK', 'SPAN']);
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = node => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 1) {
        walk(c);
        if (!ALLOWED.has(c.tagName)) { c.replaceWith(...c.childNodes); continue; }
        for (const a of [...c.attributes]) if (!(c.tagName === 'A' && a.name === 'href') && !(a.name === 'class' && /^(chk|ok)$/.test(a.value))) c.removeAttribute(a.name);
        if (c.tagName === 'A' && !/^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) c.removeAttribute('href');
      } else if (c.nodeType !== 3) c.remove();
    }
  };
  walk(doc.body); return doc.body.innerHTML;
}
const NOTE_TOOLS = [
  ['bold', 'Vet (Ctrl+B)', () => document.execCommand('bold')],
  ['italic', 'Cursief (Ctrl+I)', () => document.execCommand('italic')],
  ['underline', 'Onderstrepen (Ctrl+U)', () => document.execCommand('underline')],
  ['heading', 'Kop', () => { const b = document.queryCommandValue('formatBlock'); document.execCommand('formatBlock', false, /h3/i.test(b) ? 'div' : 'h3'); }],
  ['list', 'Opsomming', () => document.execCommand('insertUnorderedList')],
  ['listol', 'Genummerde lijst', () => document.execCommand('insertOrderedList')],
  ['checksquare', 'Afvinklijst', () => {
    document.execCommand('insertUnorderedList');
    const n = document.getSelection().anchorNode; const ul = (n?.nodeType === 1 ? n : n?.parentElement)?.closest('ul'); if (ul) ul.className = 'chk';
  }],
  ['highlight', 'Markeren', () => { const s = document.getSelection(); if (!s.isCollapsed) document.execCommand('insertHTML', false, '<mark>' + esc(s.toString()) + '</mark>'); }],
  ['link', 'Link (Ctrl+klik opent hem)', async () => {
    const s = document.getSelection(); const r = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    const url = await ask('Link toevoegen', 'Webadres', 'https://');
    if (url && r) { s.removeAllRanges(); s.addRange(r); document.execCommand('createLink', false, normUrl(url)); }
  }],
  ['eraser', 'Opmaak wissen', () => { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'div'); }],
];
reg({
  type: 'notes', name: 'Notities', desc: 'Opgemaakte notities met een herinnering op tijd', icon: 'note', group: 'widgets',
  size: { w: 7, h: 9 }, min: { w: 3, h: 3 },
  defaults: { title: 'Notities', newOnTop: true },
  fields: [{ key: 'title', label: 'Kop', type: 'text' }, { key: 'newOnTop', label: 'Nieuwe notities bovenaan', type: 'checkbox' }],
  render(el, ctx) {
    const item = ctx.item, d = item.data; d.notes = d.notes || [];
    const wrap = h('div', { class: 'notes' });
    const persist = debounce(() => ctx.save(), 400);
    const drawNote = n => {
      const ed = h('div', { class: 'ne', contenteditable: 'true', 'data-ph': 'Schrijf een notitie…', html: n.html || '' });
      ed.addEventListener('input', () => { n.html = ed.innerHTML; n.updated = Date.now(); persist(); });
      ed.addEventListener('paste', e => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        if (html) document.execCommand('insertHTML', false, sanitize(html));
        else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      });
      ed.addEventListener('click', e => {
        const a = e.target.closest('a'); if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openUrl(a.href); return; }
        const li = e.target.closest('ul.chk > li'); if (li && e.offsetX < 22) { li.classList.toggle('ok'); n.html = ed.innerHTML; persist(); }
      });
      const tb = h('div', { class: 'nt' }, NOTE_TOOLS.map(([ic, t, fn]) => h('button', { title: t, html: icon(ic, 15), onmousedown: e => e.preventDefault(), onclick: async () => { ed.focus(); await fn(); n.html = ed.innerHTML; persist(); } })));
      const bell = h('button', { class: 'mini' + (n.remindAt ? ' on' : ''), title: 'Herinnering instellen', html: icon('bell', 15) });
      bell.onclick = () => ctx.remind(bell, n.remindAt, ts => { n.remindAt = ts; n.reminded = false; ctx.save(); redraw(); });
      return h('div', { class: 'note' + (n.remindAt && !n.reminded ? ' due' : '') }, tb, ed,
        h('div', { class: 'nf' },
          n.remindAt && !n.reminded ? h('span', { class: 'rem', html: icon('bell', 12) + fmtWhen(n.remindAt) }) : null,
          h('span', { class: 'when' }, new Date(n.updated || n.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })),
          bell,
          h('button', { class: 'mini', title: 'Notitie verwijderen', html: icon('trash', 15), onclick: async () => {
            if ((n.html || '').trim() && !(await confirmDlg('Notitie verwijderen?', 'Deze notitie wordt verwijderd.', 'Verwijderen', true))) return;
            d.notes.splice(d.notes.indexOf(n), 1); ctx.save(); redraw();
          } })));
    };
    const redraw = () => { wrap.innerHTML = ''; d.notes.forEach(n => wrap.append(drawNote(n))); if (!d.notes.length) wrap.append(h('div', { class: 'empty' }, 'Nog geen notities.')); };
    redraw();
    el.append(wrap, h('div', { style: { paddingTop: '8px' } }, h('button', { class: 'btn sm', onclick: () => {
      const n = { id: uid(), html: '', created: Date.now(), updated: Date.now() };
      ctx.config.newOnTop !== false ? d.notes.unshift(n) : d.notes.push(n); ctx.save(); redraw();
      const eds = $$('.ne', wrap); (ctx.config.newOnTop !== false ? eds[0] : eds.at(-1))?.focus();
    } }, h('span', { html: icon('plus', 14) }), 'Notitie')));
  },
});

/* ---------- Afbeeldingen bijsnijden ---------- */
const CROP = new Map();
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh, name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(ch, name);
    off += 30 + name.length + sz;
  }
  const csize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
function cropRect(im, p) {
  const W = im.w, H = im.h, a = p.w / p.h;
  let cw, ch; if (W / H > a) { ch = H; cw = H * a; } else { cw = W; ch = W / a; }
  cw /= im.zoom || 1; ch /= im.zoom || 1;
  const sx = clamp(im.fx * W - cw / 2, 0, W - cw), sy = clamp(im.fy * H - ch / 2, 0, H - ch);
  return { sx, sy, sw: cw, sh: ch };
}
async function renderCrop(im, p, cfg) {
  const r = cropRect(im, p);
  let bmp;
  try { bmp = await createImageBitmap(im.el, r.sx, r.sy, r.sw, r.sh, { resizeWidth: p.w, resizeHeight: p.h, resizeQuality: 'high' }); } catch (e) { bmp = null; }
  const cv = h('canvas', { width: p.w, height: p.h }); const cx = cv.getContext('2d');
  if (cfg.format === 'jpeg') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, p.w, p.h); }
  if (bmp) cx.drawImage(bmp, 0, 0);
  else {
    // terugval: stapsgewijs verkleinen voor scherpe resultaten
    let src = im.el, sx = r.sx, sy = r.sy, sw = r.sw, sh = r.sh;
    while (sw / 2 > p.w && sh / 2 > p.h) {
      const t = h('canvas', { width: Math.round(sw / 2), height: Math.round(sh / 2) }); const tc = t.getContext('2d');
      tc.imageSmoothingQuality = 'high'; tc.drawImage(src, sx, sy, sw, sh, 0, 0, t.width, t.height);
      src = t; sx = sy = 0; sw = t.width; sh = t.height;
    }
    cx.imageSmoothingQuality = 'high'; cx.drawImage(src, sx, sy, sw, sh, 0, 0, p.w, p.h);
  }
  const type = 'image/' + (cfg.format || 'jpeg');
  return new Promise(res => cv.toBlob(res, type, (cfg.quality ?? 92) / 100));
}
const fileBase = n => n.replace(/\.[^.]+$/, '');
const extOf = f => f === 'jpeg' ? 'jpg' : f;
function cropName(cfg, im, p) {
  return (cfg.pattern || '{naam}-{formaat}').replace('{naam}', fileBase(im.name)).replace('{formaat}', slug(p.name)).replace('{breedte}', p.w).replace('{hoogte}', p.h) + '.' + extOf(cfg.format || 'jpeg');
}
reg({
  type: 'crop', name: 'Bijsnijden', desc: 'Afbeeldingen snel en scherp bijsnijden op vaste formaten met een focuspunt', icon: 'crop', group: 'widgets',
  size: { w: 14, h: 12 }, min: { w: 6, h: 7 }, wideConfig: true, rebuildOnResize: true,
  defaults: {
    title: '', format: 'jpeg', quality: 92, pattern: '{naam}-{formaat}',
    presets: [
      { name: 'Social deelbeeld', w: 1200, h: 630 }, { name: 'Vierkant', w: 1080, h: 1080 }, { name: 'Instagram staand', w: 1080, h: 1350 },
      { name: 'Story', w: 1080, h: 1920 }, { name: 'Website header', w: 1920, h: 600 }, { name: 'Thumbnail', w: 400, h: 400 },
    ],
  },
  fields: [
    { key: 'title', label: 'Kop (optioneel)', type: 'text' },
    { key: 'format', label: 'Bestandstype', type: 'seg', options: [['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']] },
    { key: 'quality', label: 'Kwaliteit (JPG/WebP)', type: 'range', min: 60, max: 100, unit: '%' },
    { key: 'pattern', label: 'Bestandsnaam', type: 'text', hint: 'Gebruik {naam}, {formaat}, {breedte} en {hoogte}.' },
  ],
  editor(el, cfg) {
    cfg.presets = clone(cfg.presets || []);
    const box = h('div');
    const draw = () => {
      box.innerHTML = '';
      cfg.presets.forEach((p, i) => box.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('input', { class: 'inp grow', value: p.name, placeholder: 'Naam', oninput: e => p.name = e.target.value }),
        h('input', { class: 'inp', type: 'number', min: 1, style: { width: '100px' }, value: p.w, oninput: e => p.w = Math.max(1, +e.target.value) }),
        h('span', {}, '×'),
        h('input', { class: 'inp', type: 'number', min: 1, style: { width: '100px' }, value: p.h, oninput: e => p.h = Math.max(1, +e.target.value) }),
        h('span', { class: 'hint', style: { margin: 0 } }, 'px'),
        ib('trash', 'Verwijderen', () => { cfg.presets.splice(i, 1); draw(); }, 'mini'))));
    };
    draw();
    el.append(h('div', { class: 'sect' }, h('h4', {}, 'Formaten'), box, h('button', { class: 'btn sm', onclick: () => { cfg.presets.push({ name: 'Nieuw formaat', w: 1000, h: 1000 }); draw(); } }, '+ Formaat')));
  },
  render(el, ctx) {
    const item = ctx.item, cfg = ctx.config;
    const st = CROP.get(item.id) || { imgs: [], cur: 0 }; CROP.set(item.id, st);
    const presets = cfg.presets?.length ? cfg.presets : [{ name: 'Origineel vierkant', w: 1000, h: 1000 }];
    const fileInp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onchange: () => { addFiles(fileInp.files); fileInp.value = ''; } });
    const addFiles = async files => {
      const imgs = [...files].filter(f => f.type.startsWith('image/'));
      if (!imgs.length) return toast('Sleep afbeeldingen (JPG, PNG, WebP…)');
      for (const f of imgs) {
        const url = URL.createObjectURL(f);
        const img = new Image(); img.src = url; await img.decode().catch(() => {});
        st.imgs.push({ id: uid(), name: f.name, url, el: img, w: img.naturalWidth, h: img.naturalHeight, fx: .5, fy: .5, zoom: 1, preset: st.imgs[st.cur]?.preset ?? 0 });
      }
      st.cur = st.imgs.length - imgs.length; draw();
    };
    const root = h('div', { class: 'cr' }); el.append(root, fileInp);
    const card = el.closest('.card') || el;
    card.addEventListener('dragover', e => { if (editing) return; e.preventDefault(); e.stopPropagation(); card.classList.add('dropping'); });
    card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('dropping'); });
    card.addEventListener('drop', e => { if (editing) return; e.preventDefault(); e.stopPropagation(); card.classList.remove('dropping'); addFiles(e.dataTransfer.files); });

    let previewTick = 0;
    const draw = () => {
      root.innerHTML = '';
      if (!st.imgs.length) {
        root.append(h('div', { class: 'cr-drop', onclick: () => fileInp.click(), html: icon('image', 34) + '<b style="color:var(--ink)">Sleep afbeeldingen hierheen</b><span>of klik om ze te kiezen — meerdere tegelijk kan ook</span><span style="font-size:11.5px">Alles gebeurt op je eigen computer.</span>' }));
        return;
      }
      st.cur = clamp(st.cur, 0, st.imgs.length - 1);
      const im = st.imgs[st.cur]; im.preset = clamp(im.preset, 0, presets.length - 1);
      const p = presets[im.preset];
      // balk
      const presetSel = h('select', { class: 'inp', value: String(im.preset), onchange: e => { im.preset = +e.target.value; draw(); } }, presets.map((x, i) => h('option', { value: String(i) }, `${x.name} · ${x.w}×${x.h}`)));
      const zoom = h('input', { type: 'range', min: 1, max: 4, step: .05, value: im.zoom, style: { width: '110px' }, oninput: e => { im.zoom = +e.target.value; overlay(); preview(); } });
      root.append(h('div', { class: 'cr-bar' }, presetSel,
        h('button', { class: 'btn sm', title: 'Gebruik dit formaat voor alle afbeeldingen', onclick: () => { st.imgs.forEach(x => x.preset = im.preset); toast('Formaat toegepast op alle afbeeldingen'); } }, 'Op alles toepassen'),
        h('span', { class: 'cr-info', style: { marginLeft: 'auto' } }, 'Inzoomen'), zoom,
        h('button', { class: 'btn sm', title: 'Focuspunt terug naar het midden', onclick: () => { im.fx = im.fy = .5; im.zoom = 1; draw(); } }, 'Reset')));
      // panelen
      const stage = h('div', { class: 'cr-stage' }); const img = h('img', { src: im.url, alt: im.name, draggable: false });
      const rect = h('div', { class: 'cr-rect' }), fp = h('div', { class: 'cr-fp' });
      stage.append(img, rect, fp);
      const prevCv = h('canvas', { class: 'cr-prev' });
      const stack = el.clientWidth < 560;
      root.append(h('div', { class: 'cr-main' + (stack ? ' stack' : '') },
        h('div', { class: 'cr-pane' }, h('span', { class: 'lab' }, 'Klik voor focuspunt'), stage),
        h('div', { class: 'cr-pane' }, h('span', { class: 'lab' }, 'Voorbeeld'), prevCv)));
      const info = h('span', { class: 'cr-info' });
      const overlay = () => {
        const dw = img.clientWidth, dh = img.clientHeight; if (!dw) return;
        const r = cropRect(im, p), k = dw / im.w;
        Object.assign(rect.style, { left: r.sx * k + 'px', top: r.sy * k + 'px', width: r.sw * k + 'px', height: r.sh * k + 'px' });
        Object.assign(fp.style, { left: im.fx * dw + 'px', top: im.fy * dh + 'px' });
        const up = r.sw < p.w - .5;
        info.innerHTML = `${im.w}×${im.h} → ${p.w}×${p.h}` + (up ? ` · <span class="cr-warn">wordt vergroot (bron te klein)</span>` : '');
      };
      const preview = () => {
        const tick = ++previewTick;
        requestAnimationFrame(() => {
          if (tick !== previewTick) return;
          const pane = prevCv.parentElement; const maxW = pane.clientWidth - 20, maxH = pane.clientHeight - 44;
          const s = Math.min(maxW / p.w, maxH / p.h, 1); const w = Math.max(1, Math.round(p.w * s)), hh = Math.max(1, Math.round(p.h * s));
          const dpr = devicePixelRatio || 1; prevCv.width = w * dpr; prevCv.height = hh * dpr; prevCv.style.width = w + 'px'; prevCv.style.height = hh + 'px';
          const r = cropRect(im, p), c = prevCv.getContext('2d'); c.imageSmoothingQuality = 'high';
          c.drawImage(im.el, r.sx, r.sy, r.sw, r.sh, 0, 0, prevCv.width, prevCv.height);
        });
      };
      const setFp = e => { const b = img.getBoundingClientRect(); im.fx = clamp((e.clientX - b.left) / b.width, 0, 1); im.fy = clamp((e.clientY - b.top) / b.height, 0, 1); overlay(); preview(); };
      stage.addEventListener('pointerdown', e => { e.preventDefault(); stage.setPointerCapture(e.pointerId); setFp(e); const mv = ev => setFp(ev); stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', () => stage.removeEventListener('pointermove', mv), { once: true }); });
      const fit = () => { const pane = stage.parentElement; img.style.maxWidth = (pane.clientWidth - 16) + 'px'; img.style.maxHeight = (pane.clientHeight - 16) + 'px'; overlay(); preview(); };
      if (img.complete) requestAnimationFrame(fit); else img.onload = fit;
      new ResizeObserver(() => fit()).observe(stage.parentElement);
      // onderbalk
      const thumbs = h('div', { class: 'cr-thumbs' });
      st.imgs.forEach((x, i) => thumbs.append(h('button', { class: 'cr-thumb' + (i === st.cur ? ' on' : ''), title: x.name, onclick: () => { st.cur = i; draw(); } },
        h('img', { src: x.url, alt: '' }),
        h('span', { class: 'rm', title: 'Verwijderen', onclick: e => { e.stopPropagation(); URL.revokeObjectURL(x.url); st.imgs.splice(i, 1); draw(); } }, '×'))));
      thumbs.append(h('button', { class: 'cr-add', title: 'Afbeeldingen toevoegen', html: icon('plus', 18), onclick: () => fileInp.click() }));
      const dl = h('button', { class: 'btn primary', html: icon('download', 16) + 'Download' });
      dl.onclick = () => popover(dl, [
        h('button', { class: 'opt', html: icon('image', 15) + 'Deze afbeelding', onclick: () => { closePop(); exportSet([[im, p]]); } }),
        st.imgs.length > 1 ? h('button', { class: 'opt', html: icon('layers', 15) + `Alle ${st.imgs.length} afbeeldingen (zip)`, onclick: () => { closePop(); exportSet(st.imgs.map(x => [x, presets[clamp(x.preset, 0, presets.length - 1)]])); } }) : null,
        h('button', { class: 'opt', html: icon('grid', 15) + 'Alles in álle formaten (zip)', onclick: () => { closePop(); exportSet(st.imgs.flatMap(x => presets.map(pp => [x, pp]))); } }),
        h('hr'),
        h('button', { class: 'opt', html: icon('trash', 15) + 'Alles leegmaken', onclick: () => { closePop(); st.imgs.forEach(x => URL.revokeObjectURL(x.url)); st.imgs = []; draw(); } }),
      ]);
      root.append(h('div', { class: 'cr-foot' }, thumbs, h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } }, info, dl)));
    };
    const exportSet = async pairs => {
      toast(pairs.length > 1 ? `Bezig met ${pairs.length} bestanden…` : 'Bezig…');
      const out = [], names = new Set();
      for (const [im, p] of pairs) {
        const blob = await renderCrop(im, p, cfg);
        let n = cropName(cfg, im, p), k = 2; while (names.has(n)) n = n.replace(/(\.\w+)$/, `-${k++}$1`); names.add(n);
        out.push({ name: n, blob });
      }
      if (out.length === 1) return download(out[0].name, out[0].blob);
      const files = await Promise.all(out.map(async o => ({ name: o.name, data: new Uint8Array(await o.blob.arrayBuffer()) })));
      download(`bijgesneden-${new Date().toISOString().slice(0, 10)}.zip`, makeZip(files));
    };
    draw();
  },
});

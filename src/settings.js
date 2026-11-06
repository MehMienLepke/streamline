/* ==========================================================================
   Streamline — instellingenpaneel
   ========================================================================== */
let settingsTab = 'algemeen';
const TABS = [['algemeen', 'Algemeen'], ['thema', 'Thema'], ['titels', 'Titels'], ['paginas', "Pagina's"], ['bestanden', 'Bestanden'], ['uitbr', 'Uitbreidingen'], ['updates', 'Updates'], ['over', 'Over']];

function renderSettings() {
  const tabs = $('#settings-tabs'), body = $('#settings-body');
  if (!tabs || !$('#panel-settings').classList.contains('show')) return;
  tabs.innerHTML = '';
  for (const [k, l] of TABS) tabs.append(h('button', { class: settingsTab === k ? 'on' : '', onclick: () => { settingsTab = k; renderSettings(); } }, l));
  body.innerHTML = '';
  ({ algemeen: tabGeneral, thema: tabTheme, titels: tabTitles, paginas: tabPages, bestanden: tabFiles, uitbr: tabPlugins, updates: tabUpdates, over: tabAbout })[settingsTab](body);
}
const sect = (title, ...kids) => h('div', { class: 'sect' }, h('h4', {}, title), ...kids);
function segCtl(options, value, onPick) {
  const s = h('div', { class: 'seg' });
  const draw = v => { s.innerHTML = ''; for (const [k, l] of options) s.append(h('button', { class: v === k ? 'on' : '', onclick: () => { onPick(k); draw(k); } }, l)); };
  draw(value); return s;
}

function tabGeneral(b) {
  const nav = S.global.find(i => i.type === 'nav') || allItems().find(i => i.type === 'nav');
  b.append(
    sect('Dit instellingenbestand',
      h('div', { class: 'field' }, h('label', {}, 'Titel (staat linksboven naast Streamline)'),
        h('input', { class: 'inp', value: S.meta.title, oninput: e => { S.meta.title = e.target.value; renderTop(); save(); } }))),
    sect('Paginamenu',
      nav ? [
        h('div', { class: 'field' }, h('label', {}, 'Richting'), segCtl([['h', 'Horizontaal'], ['v', 'Verticaal']], nav.config.orientation, v => setAllNav('orientation', v))),
        h('div', { class: 'field' }, h('label', {}, 'Knoppen'), segCtl([['icons', 'Iconen'], ['labels', 'Namen'], ['both', 'Beide']], nav.config.display, v => setAllNav('display', v))),
        h('p', { class: 'hint' }, 'Tip: bij een verticaal menu maak je het onderdeel smal en hoog (bijv. 2 × 10). Het menu zelf verplaats je net als elke widget.'),
      ] : h('p', { class: 'hint' }, 'Er staat geen paginamenu op je dashboard. Voeg het toe via de repository (Basis → Paginamenu).')),
    sect('Knoppen',
      h('div', { class: 'field' }, h('label', {}, `Tekstgrootte van alle knoppen: ${S.buttons.fontSize}px`),
        h('input', { type: 'range', min: 9, max: 32, value: S.buttons.fontSize,
          oninput: e => { S.buttons.fontSize = +e.target.value; e.target.previousSibling.textContent = `Tekstgrootte van alle knoppen: ${S.buttons.fontSize}px`; layout(); },
          onchange: () => setGlobalButtonSize() })),
      h('p', { class: 'hint' }, 'Een vak of een losse knop kan een eigen tekstgrootte hebben; die gaat dan voor. Bij een wijziging hier vraagt Streamline of je die eigen instellingen ook wilt aanpassen.')),
    sect('Raster',
      h('div', { class: 'field' }, h('label', {}, `Aantal kolommen: ${S.grid.cols}`), h('input', { type: 'range', min: 12, max: 48, step: 2, value: S.grid.cols, onchange: e => { const old = S.grid.cols, nw = +e.target.value; rescaleGrid(old, nw); renderSettings(); } })),
      h('div', { class: 'field' }, h('label', {}, `Rijhoogte: ${S.grid.rowH}px`), h('input', { type: 'range', min: 20, max: 72, step: 2, value: S.grid.rowH, oninput: e => { S.grid.rowH = +e.target.value; e.target.previousSibling.textContent = `Rijhoogte: ${S.grid.rowH}px`; layout(); save(); } })),
      h('div', { class: 'field' }, h('label', {}, `Tussenruimte: ${S.grid.gap}px`), h('input', { type: 'range', min: 4, max: 32, step: 2, value: S.grid.gap, oninput: e => { S.grid.gap = +e.target.value; e.target.previousSibling.textContent = `Tussenruimte: ${S.grid.gap}px`; layout(); save(); } })),
      h('p', { class: 'hint' }, 'Bij een ander aantal kolommen schaalt Streamline je indeling automatisch mee.')),
  );
}
function setAllNav(key, v) { for (const it of allItems()) if (it.type === 'nav') { it.config[key] = v; if (els.has(it.id)) buildItem(it); } save(); }
function rescaleGrid(oldC, newC) {
  pushHistory();
  const f = newC / oldC;
  for (const it of allItems()) { it.x = Math.round(it.x * f); it.w = Math.max(1, Math.round(it.w * f)); if (it.x + it.w > newC) it.x = Math.max(0, newC - it.w); }
  S.grid.cols = newC; save(); layout();
}

function tabTheme(b) {
  const grid = h('div', { class: 'swatches' });
  const all = [...Object.entries(THEMES), ['eigen', { ...THEMES.licht, ...S.theme.custom, name: 'Eigen' }]];
  for (const [k, t] of all) grid.append(h('button', { class: 'swatch' + (!S.theme.auto && S.theme.preset === k ? ' on' : ''), onclick: () => { S.theme.preset = k; S.theme.auto = false; applyTheme(); save(); renderSettings(); } },
    h('div', { class: 'sw', style: { background: t.bg, border: '1px solid ' + t.line } }, h('i', { style: { background: t.surface } }), h('i', { style: { background: t.accent } }), h('i', { style: { background: t.ink } })),
    h('b', {}, t.name)));
  b.append(sect('Thema', grid,
    h('label', { class: 'check', style: { marginTop: '12px' } }, h('input', { type: 'checkbox', checked: S.theme.auto, onchange: e => { S.theme.auto = e.target.checked; applyTheme(); save(); renderSettings(); } }), 'Volg Windows: licht overdag, donker als Windows donker staat')));
  b.append(sect('Afronding van hoeken',
    h('div', { class: 'row' }, h('input', { type: 'range', min: 0, max: 32, value: S.theme.radius, oninput: e => { S.theme.radius = +e.target.value; e.target.nextSibling.textContent = e.target.value + 'px'; applyTheme(); save(); } }), h('span', { class: 'badge' }, S.theme.radius + 'px'))));
  if (S.theme.preset === 'eigen' && !S.theme.auto) {
    const ed = h('div');
    for (const [k, l] of THEME_KEYS) ed.append(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('input', { type: 'color', value: S.theme.custom[k], oninput: e => { S.theme.custom[k] = e.target.value; applyTheme(); save(); } }), h('span', { class: 'grow' }, l)));
    ed.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!S.theme.custom.dark, onchange: e => { S.theme.custom.dark = e.target.checked; applyTheme(); save(); } }), 'Dit is een donker thema (voor schuifbalken en formulieren)'));
    ed.append(h('div', { class: 'lbl', style: { margin: '8px 0 6px' } }, 'Begin opnieuw vanaf:'), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, Object.entries(THEMES).map(([k, t]) => h('button', { class: 'btn sm', onclick: () => { S.theme.custom = { ...t }; applyTheme(); save(); renderSettings(); } }, t.name))));
    b.append(sect('Eigen thema samenstellen', ed));
  } else b.append(h('p', { class: 'hint' }, 'Kies “Eigen” om zelf alle kleuren samen te stellen.'));
}

function tabTitles(b) {
  const ty = S.typography;
  const prev = h('div', { style: { fontFamily: FONTS[ty.font], color: ty.color || 'var(--ink)', fontWeight: ty.weight, fontSize: '28px', padding: '14px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', marginBottom: '14px' } }, 'Zo zien je titels eruit');
  const upd = () => { applyTheme(); save(); Object.assign(prev.style, { fontFamily: FONTS[ty.font], color: ty.color || 'var(--ink)', fontWeight: ty.weight }); };
  b.append(h('p', { class: 'hint' }, 'Deze instellingen gelden voor alle titels op al je pagina’s tegelijk.'), prev,
    h('div', { class: 'field' }, h('label', {}, 'Lettertype'), h('select', { class: 'inp', value: ty.font, onchange: e => { ty.font = e.target.value; upd(); } }, Object.keys(FONTS).map(f => h('option', { value: f, style: { fontFamily: FONTS[f] } }, f)))),
    h('div', { class: 'field' }, h('label', {}, 'Dikte'), segCtl([[300, 'Dun'], [400, 'Normaal'], [600, 'Halfvet'], [800, 'Vet']], ty.weight, v => { ty.weight = v; upd(); })),
    fieldEl({ key: 'color', label: 'Kleur', type: 'color', allowTheme: true, fallback: activeTheme().ink }, ty, () => upd()),
    h('p', { class: 'hint' }, 'Lettertypes komen van je eigen computer (geen downloads van internet). Op Windows zijn ze allemaal aanwezig.'));
}

function tabPages(b) {
  const list = h('div');
  S.pages.forEach((p, i) => {
    list.append(h('div', { class: 'list-row' + (p.id === S.activePage ? ' on' : '') },
      h('button', { class: 'iconbtn', title: 'Icoon kiezen', html: icon(p.icon || 'layout', 16), onclick: () => iconPicker(p.icon, v => { p.icon = v; save(); refreshNav(); renderSettings(); }) }),
      h('input', { class: 'inp grow', value: p.name, oninput: e => { p.name = e.target.value; save(); refreshNav(); } }),
      ib('chevronup', 'Omhoog', () => { if (i) { S.pages.splice(i - 1, 0, S.pages.splice(i, 1)[0]); save(); refreshNav(); renderSettings(); } }, 'mini'),
      ib('chevrondown', 'Omlaag', () => { if (i < S.pages.length - 1) { S.pages.splice(i + 1, 0, S.pages.splice(i, 1)[0]); save(); refreshNav(); renderSettings(); } }, 'mini'),
      ib('copy', 'Pagina dupliceren', () => { const c = clone(p); c.id = uid(); c.name += ' (kopie)'; c.items.forEach(it => it.id = uid()); S.pages.splice(i + 1, 0, c); save(); refreshNav(); renderSettings(); }, 'mini'),
      ib('trash', 'Verwijderen', async () => {
        if (S.pages.length < 2) return toast('Je hebt minstens één pagina nodig');
        if (!(await confirmDlg('Pagina verwijderen?', `“${p.name}” en alles erop wordt verwijderd.`, 'Verwijderen', true))) return;
        S.pages.splice(i, 1); if (S.activePage === p.id) S.activePage = S.pages[0].id; save(); renderAll(); renderSettings();
      }, 'mini')));
  });
  b.append(sect("Pagina's", list, h('button', { class: 'btn', onclick: () => newPage() }, h('span', { html: icon('plus', 15) }), 'Nieuwe pagina')));
}
async function newPage() {
  const name = await ask('Nieuwe pagina', 'Naam van de pagina', '', 'Bijv. Projecten');
  if (!name) return;
  const p = { id: uid(), name, icon: 'layout', items: [] };
  S.pages.push(p); S.activePage = p.id; save(); renderAll(); renderSettings();
}
function refreshNav() { for (const it of [...S.global, ...currentPage().items]) if (it.type === 'nav') buildItem(it); }

function tabFiles(b) {
  const status = FS.dir
    ? h('div', { class: 'list-row' }, h('span', { html: icon('folder', 18) }), h('div', { class: 'grow' }, h('b', {}, FS.dir.name), h('div', { class: 'hint', style: { margin: 0 } }, FS.perm ? `Actief bestand: ${FS.file}` : 'Nog geen toestemming in deze sessie')),
        FS.perm ? null : h('button', { class: 'btn primary sm', onclick: reconnect }, 'Koppelen'))
    : h('div', { class: 'list-row' }, h('span', { html: icon('alert', 18) }), h('div', { class: 'grow hint', style: { margin: 0 } }, 'Geen map gekoppeld: je instellingen staan alleen in deze browser.'));
  b.append(sect('Opslaglocatie', status,
    FS.supported ? h('button', { class: 'btn', onclick: async () => {
      try { await flush(); await pickDir(); const files = await listFiles(); if (files.length) await switchFile(files[0]); else { FS.file = await freeFileName(S.meta.title); await flush(); await IDB.set('lastFile', FS.file); } hideBanner(); renderSettings(); } catch (e) {}
    } }, h('span', { html: icon('folder', 15) }), FS.dir ? 'Andere map kiezen' : 'Map koppelen') : null));

  const filesBox = h('div', {}, h('div', { class: 'hint' }, 'Laden…'));
  b.append(sect('Instellingenbestanden in deze map', filesBox,
    h('div', { class: 'row', style: { flexWrap: 'wrap', marginTop: '8px' } },
      h('button', { class: 'btn sm', onclick: newSettingsFile }, h('span', { html: icon('plus', 14) }), 'Nieuw'),
      h('button', { class: 'btn sm', onclick: dupSettingsFile }, h('span', { html: icon('copy', 14) }), 'Dupliceer huidige'),
      h('button', { class: 'btn sm', onclick: () => download(FS.file || slug(S.meta.title) + EXT, JSON.stringify(S, null, 2), 'application/json') }, h('span', { html: icon('download', 14) }), 'Exporteren'),
      h('button', { class: 'btn sm', onclick: importSettingsFile }, h('span', { html: icon('upload', 14) }), 'Importeren'))));
  (async () => {
    filesBox.innerHTML = '';
    const files = await listFiles();
    if (!files.length) return filesBox.append(h('div', { class: 'hint' }, FS.dir ? 'Nog geen bestanden.' : 'Koppel een map om meerdere instellingenbestanden te beheren.'));
    for (const f of files) filesBox.append(h('div', { class: 'list-row' + (f === FS.file ? ' on' : '') },
      h('span', { html: icon('file', 16) }), h('span', { class: 'grow', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, f),
      f === FS.file ? h('span', { class: 'badge' }, 'actief') : h('button', { class: 'btn sm', onclick: () => switchFile(f).then(renderSettings) }, 'Openen')));
  })();

  b.append(sect('Onderdelen kopiëren tussen bestanden',
    h('p', { class: 'hint' }, 'Kopieer losse widgets, complete vakken met hun inhoud of hele pagina’s van het ene instellingenbestand naar het andere.'),
    h('button', { class: 'btn', onclick: openCopyBetween }, h('span', { html: icon('layers', 15) }), 'Kopiëren…')));
}
async function newSettingsFile() {
  const t = await ask('Nieuw instellingenbestand', 'Naam van het dashboard', '', 'Bijv. Marketing');
  if (!t) return;
  const st = defaultState(t, S.theme.preset);
  if (FS.dir && FS.perm) { const n = await freeFileName(t); await writeJSON(n, st); await switchFile(n); renderSettings(); }
  else { if (!(await confirmDlg('Zonder map', 'Zonder gekoppelde map kun je maar één instellingenbestand tegelijk gebruiken. Het huidige wordt eerst gedownload als reservekopie en daarna vervangen.', 'Doorgaan'))) return; download(slug(S.meta.title) + EXT, JSON.stringify(S, null, 2)); S = st; save(); applyTheme(); renderAll(); renderSettings(); }
}
async function dupSettingsFile() {
  if (!(FS.dir && FS.perm)) return toast('Koppel eerst een map');
  const t = await ask('Dupliceren', 'Naam van de kopie', S.meta.title + ' (kopie)');
  if (!t) return;
  const st = clone(S); st.meta.title = t; st.meta.created = Date.now();
  const n = await freeFileName(t); await writeJSON(n, st); toast('Kopie gemaakt: ' + n); renderSettings();
}
function pickJSONFile() {
  return new Promise(res => {
    const inp = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => { const f = inp.files[0]; if (!f) return res(null); try { res({ name: f.name, data: JSON.parse(await f.text()) }); } catch (e) { toast('Dit is geen geldig instellingenbestand'); res(null); } } });
    inp.click();
  });
}
async function importSettingsFile() {
  const f = await pickJSONFile(); if (!f) return;
  if (f.data.app !== 'streamline' && !f.data.pages) return toast('Dit is geen Streamline-instellingenbestand');
  const st = migrate(f.data);
  if (FS.dir && FS.perm) { const n = await freeFileName(st.meta.title); await writeJSON(n, st); await switchFile(n); renderSettings(); }
  else { if (!(await confirmDlg('Importeren', 'Je huidige dashboard wordt vervangen. Eerst wordt een reservekopie gedownload.', 'Importeren'))) return; download(slug(S.meta.title) + EXT, JSON.stringify(S, null, 2)); S = st; save(); applyTheme(); renderAll(); renderSettings(); }
}

/* --- kopiëren tussen bestanden --- */
async function openCopyBetween() {
  const files = await listFiles();
  const sources = [['__current', 'Huidig: ' + S.meta.title], ...files.filter(f => f !== FS.file).map(f => [f, f]), ['__pick', 'Bestand van mijn computer…']];
  const targets = [['__current', 'Huidig: ' + S.meta.title], ...files.filter(f => f !== FS.file).map(f => [f, f])];
  let src = files.length > 1 ? sources[1][0] : '__pick', dst = '__current', srcState = null, targetPage = '__new';
  const sel = new Set();
  const treeBox = h('div', { class: 'tree' });
  const tpSel = h('select', { class: 'inp' });
  const loadSrc = async () => {
    sel.clear();
    if (src === '__current') srcState = S;
    else if (src === '__pick') { const f = await pickJSONFile(); srcState = f ? migrate(f.data) : null; }
    else srcState = migrate(await readJSON(src));
    drawTree();
  };
  const loadTargetPages = async () => {
    const st = dst === '__current' ? S : migrate(await readJSON(dst));
    tpSel.innerHTML = ''; tpSel.append(h('option', { value: '__new' }, 'Als nieuwe pagina'), st.pages.map(p => h('option', { value: p.id }, 'Op pagina: ' + p.name)));
    tpSel.value = targetPage = '__new';
  };
  tpSel.onchange = () => targetPage = tpSel.value;
  const label = it => `${WIDGETS[it.type]?.name || it.type}${(it.config.label || it.config.title || it.config.text) ? ' — ' + fmtVars(it.config.label || it.config.title || it.config.text) : ''}`;
  const drawTree = () => {
    treeBox.innerHTML = '';
    if (!srcState) return treeBox.append(h('div', { class: 'hint' }, 'Kies een bronbestand.'));
    for (const p of srcState.pages) {
      const boxes = p.items.filter(i => i.type === 'box');
      const inBox = new Set(boxes.flatMap(bx => p.items.filter(i => inside(i, bx)).map(i => i.id)));
      const pgCb = h('input', { type: 'checkbox', onchange: e => { p.items.forEach(i => e.target.checked ? sel.add(i.id) : sel.delete(i.id)); drawTree(); } });
      pgCb.checked = p.items.length && p.items.every(i => sel.has(i.id));
      treeBox.append(h('label', { class: 'pg' }, pgCb, h('span', { html: icon(p.icon || 'layout', 15) }), p.name));
      const row = (it, cls) => {
        const cb = h('input', { type: 'checkbox', checked: sel.has(it.id), onchange: e => {
          const ids = [it.id, ...(it.type === 'box' ? p.items.filter(i => inside(i, it)).map(i => i.id) : [])];
          ids.forEach(id => e.target.checked ? sel.add(id) : sel.delete(id)); drawTree();
        } });
        return h('label', { class: cls }, cb, h('span', { html: icon(WIDGETS[it.type]?.icon || 'grid', 14) }), label(it));
      };
      for (const it of p.items.filter(i => !inBox.has(i.id))) {
        treeBox.append(row(it, 'sub'));
        if (it.type === 'box') for (const k of p.items.filter(i => inside(i, it))) treeBox.append(h('div', { style: { paddingLeft: '24px' } }, row(k, 'sub')));
      }
    }
  };
  const srcSel = h('select', { class: 'inp', value: src, onchange: e => { src = e.target.value; loadSrc(); } }, sources.map(([v, l]) => h('option', { value: v }, l)));
  const dstSel = h('select', { class: 'inp', value: dst, onchange: e => { dst = e.target.value; loadTargetPages(); } }, targets.map(([v, l]) => h('option', { value: v }, l)));
  const m = openModal({ title: 'Onderdelen kopiëren', wide: true, body: h('div', {},
    h('div', { class: 'row', style: { alignItems: 'flex-end' } },
      h('div', { class: 'field grow' }, h('label', {}, 'Van'), srcSel),
      h('span', { style: { paddingBottom: '18px' }, html: icon('chevronright', 18) }),
      h('div', { class: 'field grow' }, h('label', {}, 'Naar'), dstSel),
      h('div', { class: 'field grow' }, h('label', {}, 'Plaats'), tpSel)),
    h('p', { class: 'hint' }, 'Vink aan wat je wilt kopiëren. Een vak neemt automatisch alles mee wat erin staat. De onderlinge indeling blijft behouden.'),
    treeBox),
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: async () => {
      if (!srcState || !sel.size) return toast('Vink eerst iets aan');
      const dstState = dst === '__current' ? S : migrate(await readJSON(dst));
      const picked = srcState.pages.flatMap(p => p.items.filter(i => sel.has(i.id)).map(i => ({ i, p })));
      let page;
      if (targetPage === '__new') { const srcPages = [...new Set(picked.map(x => x.p))]; page = { id: uid(), name: srcPages.length === 1 ? srcPages[0].name : 'Gekopieerd', icon: srcPages[0]?.icon || 'layout', items: [] }; dstState.pages.push(page); }
      else page = dstState.pages.find(p => p.id === targetPage);
      const minY = Math.min(...picked.map(x => x.i.y)), base = targetPage === '__new' ? 3 : pageBottom(page.items) + 1;
      for (const { i } of picked) { const c = clone(i); c.id = uid(); c.locked = false; c.y = c.y - minY + base; page.items.push(c); }
      if (dst === '__current') { save(); renderAll(); } else await writeJSON(dst, dstState);
      toast(`${picked.length} onderdelen gekopieerd`); m.close();
    } }, 'Kopiëren')] });
  srcSel.value = src; dstSel.value = dst;
  await loadTargetPages();
  if (src !== '__pick') await loadSrc(); else drawTree();
}

function tabPlugins(b) {
  b.append(h('p', { class: 'hint' }, 'Extra widgets haal je uit je eigen GitHub-repository (map “widgets”). Ze worden één keer gedownload en daarna lokaal bewaard; er gaat niets van jou naar GitHub. Installeer alleen widgets uit een repository die je vertrouwt.'));
  b.append(h('div', { class: 'field' }, h('label', {}, 'GitHub-repository (eigenaar/naam)'), h('input', { class: 'inp', value: S.update.repo, placeholder: 'bijv. MehMienLepke/streamline', onchange: e => { S.update.repo = e.target.value.trim(); save(); } })));
  const box = h('div');
  b.append(h('button', { class: 'btn', onclick: async () => {
    box.innerHTML = '<div class="hint">Ophalen…</div>';
    try { await fetchRegistry(); drawReg(); } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'hint' }, 'Kon de widgetlijst niet ophalen (' + e.message + '). Controleer de repository-naam en of het bestand widgets/registry.json bestaat.')); }
  } }, h('span', { html: icon('refresh', 15) }), 'Widgets ophalen van GitHub'), box);
  const drawReg = async () => {
    box.innerHTML = ''; const store = (await IDB.get('plugins')) || {};
    const list = remote.registry?.widgets || [];
    if (!list.length) return box.append(h('div', { class: 'hint' }, 'Geen widgets gevonden.'));
    for (const w of list) {
      const inst = store[w.id];
      const upd = inst && cmpVer(w.version, inst.version) > 0;
      box.append(h('div', { class: 'list-row', style: { marginTop: '8px' } }, h('span', { html: icon(w.icon || 'grid', 18) }),
        h('div', { class: 'grow' }, h('b', {}, w.name, ' '), h('span', { class: 'badge' }, 'v' + w.version), h('div', { class: 'hint', style: { margin: 0 } }, w.description || '')),
        h('button', { class: 'btn sm' + (inst && !upd ? '' : ' primary'), onclick: async () => { try { await installPlugin(w); toast(w.name + ' geïnstalleerd'); drawReg(); renderRepo(); } catch (e) { toast('Mislukt: ' + e.message); } } }, inst ? (upd ? 'Bijwerken' : 'Opnieuw') : 'Installeren'),
        inst ? ib('trash', 'Verwijderen', async () => { await removePlugin(w.id); drawReg(); }, 'mini') : null));
    }
  };
  (async () => {
    const store = (await IDB.get('plugins')) || {};
    const inst = Object.values(store);
    if (inst.length) b.append(sect('Geïnstalleerd in deze browser', inst.map(p => h('div', { class: 'list-row' }, h('span', { html: icon(p.icon || 'grid', 16) }), h('span', { class: 'grow' }, p.name), h('span', { class: 'badge' }, 'v' + p.version), ib('trash', 'Verwijderen', async () => { await removePlugin(p.id); renderSettings(); }, 'mini')))));
  })();
}

function tabUpdates(b) {
  const u = S.update;
  b.append(
    h('div', { class: 'list-row' }, h('span', { html: icon('info', 18) }), h('div', { class: 'grow' }, 'Jouw versie: ', h('b', {}, APP_VERSION), remote.version ? h('div', { class: 'hint', style: { margin: 0 } }, 'Op GitHub: ' + remote.version) : null)),
    h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, 'GitHub-repository (eigenaar/naam)'), h('input', { class: 'inp', value: u.repo, placeholder: 'bijv. MehMienLepke/streamline', onchange: e => { u.repo = e.target.value.trim(); save(); } })),
    h('div', { class: 'row' },
      h('div', { class: 'field grow' }, h('label', {}, 'Branch'), h('input', { class: 'inp', value: u.branch, onchange: e => { u.branch = e.target.value.trim() || 'main'; save(); } })),
      h('div', { class: 'field grow' }, h('label', {}, 'Naam van je HTML-bestand'), h('input', { class: 'inp', value: u.htmlName, onchange: e => { u.htmlName = e.target.value.trim() || 'streamline.html'; save(); } }))),
    h('div', { class: 'field' }, h('label', {}, 'Updateknop tonen bij'), segCtl([['major', 'Grote updates'], ['all', 'Alle updates'], ['never', 'Nooit']], u.notify, v => { u.notify = v; save(); })),
    h('button', { class: 'btn primary', onclick: () => checkUpdate(true).then(renderSettings) }, h('span', { html: icon('refresh', 15) }), 'Nu controleren'),
    h('p', { class: 'hint', style: { marginTop: '12px' } }, 'Bij een update vervangt Streamline alleen het HTML-bestand. Je instellingenbestand blijft staan en er komt eerst een reservekopie in de map “backups”. Bestaat een widget die je gebruikte niet meer, dan blijft zijn inhoud bewaard en zie je een melding op die plek.'));
}

function tabAbout(b) {
  const helper = document.documentElement.dataset.streamlineHelper;
  b.append(
    h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' } }, h('div', { style: { width: '44px', color: 'var(--accent)' }, html: LOGO }), h('div', {}, h('b', { style: { font: '600 20px var(--font-display)' } }, 'Streamline'), h('div', { class: 'hint', style: { margin: 0 } }, 'Versie ' + APP_VERSION))),
    sect('Privacy',
      h('p', { class: 'hint' }, 'Alles wat je maakt (dashboards, to do’s, notities, instellingen) wordt alleen op jouw computer bewaard: in je instellingenbestand en als reservekopie in deze browser. De pagina blokkeert technisch elk verzoek om gegevens te versturen; alleen GitHub mag gelezen worden voor updates en widgets. Radiozenders, favicons en websites in je knoppen worden alleen geladen als jij ze gebruikt.'),
      h('p', { class: 'hint' }, 'Afbeeldingen die je bijsnijdt, verlaten je computer nooit.')),
    sect('Hulp-extensie voor toetsaanslagen',
      h('div', { class: 'list-row' }, h('span', { html: icon(helper ? 'check' : 'alert', 16) }), h('span', {}, helper ? 'Streamline Helper is actief (v' + helper + ')' : 'Niet gevonden — Actieknoppen kunnen dan alleen websites openen.')),
      h('p', { class: 'hint' }, 'Een browser staat niet toe dat een pagina in andere tabbladen typt. De kleine extensie “Streamline Helper” (in de map helper-extensie) maakt dat mogelijk. Zie LEESMIJ.md voor de installatie.')),
    sect('Sneltoetsen', h('p', { class: 'hint', html: '<kbd>Esc</kbd> sluit vensters of de bewerkmodus · <kbd>Ctrl</kbd>+<kbd>Z</kbd> ongedaan maken in de bewerkmodus · dubbelklik op een onderdeel in de bewerkmodus opent de instellingen.' })));
}

async function setGlobalButtonSize() {
  const all = S.pages.flatMap(p => p.items);
  const own = all.filter(i => (WIDGETS[i.type]?.isButton && i.config.fontSizeOn) || (i.type === 'box' && i.config.btnFontSizeOn));
  if (own.length) {
    const nb = own.filter(i => i.type !== 'box').length, nv = own.length - nb;
    const what = [nb ? `${nb} knop${nb === 1 ? '' : 'pen'}` : '', nv ? `${nv} vak${nv === 1 ? '' : 'ken'}` : ''].filter(Boolean).join(' en ');
    const pick = await choiceDlg('Eigen instellingen gevonden', `${what[0].toUpperCase() + what.slice(1)} ${nb + nv === 1 ? 'heeft' : 'hebben'} een eigen tekstgrootte. Wil je die ook op ${S.buttons.fontSize} px zetten?`,
      [['keep', 'Nee, die laten staan'], ['all', 'Ja, alles aanpassen', true]]);
    if (pick === 'all') { pushHistory(); own.forEach(i => { if (i.type === 'box') i.config.btnFontSizeOn = false; else i.config.fontSizeOn = false; }); toast('Alle knoppen staan nu op ' + S.buttons.fontSize + ' px'); }
  }
  save(); layout();
}

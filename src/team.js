/* ==========================================================================
   Streamline — Team (samenwerken via een gedeelde map, bijv. op OneDrive)

   Opbouw van de teammap:
     team.json              teamnaam, versleutelde sleutel (alleen te openen met het wachtwoord)
     leden/<id>.json        per teamlid één bestand; ieder schrijft ALLEEN in zijn eigen bestand,
                            zodat OneDrive nooit twee mensen in hetzelfde bestand laat schrijven
     bijlagen/<id>.bin      versleutelde bijlagen van gedeelde e-mails

   Alle inhoud (taken, mails, bijlagen, namen, foto's) is versleuteld met AES-256 (AES-GCM).
   De sleutel wordt beschermd door het teamwachtwoord (PBKDF2). In je persoonlijke instellingen
   staat de sleutel nog eens versleuteld met een apparaatsleutel die alleen in déze browser bestaat:
   deel je je persoonlijke preset, dan deel je dus géén toegang tot het team.

   Samenvoegen: elk veld van een taak heeft een tijdstempel; de nieuwste wint. Wijzigen twee
   mensen hetzelfde veld zonder elkaars wijziging te hebben gezien, dan krijgt de taak een
   waarschuwing. Tijdens het bewerken van een taak 'vergrendelt' Streamline die voor anderen.
   ========================================================================== */
const TEAM_ITER = 250000;
const LOCK_MS = 90000;
const SYNC_MS = 3000;
const B64 = {
  enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); },
  dec(b) { return Uint8Array.from(atob(b), c => c.charCodeAt(0)); },
};
const TC = {
  rand: n => crypto.getRandomValues(new Uint8Array(n)),
  async kek(password, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  importRaw: raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']),
  async newKey() { const raw = TC.rand(32); return { raw, key: await TC.importRaw(raw) }; },
  async enc(key, bytes) { const iv = TC.rand(12); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; },
  async dec(key, bytes) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12))); },
  async encStr(key, str) { return B64.enc(await TC.enc(key, new TextEncoder().encode(str))); },
  async decStr(key, b64) { return new TextDecoder().decode(await TC.dec(key, B64.dec(b64))); },
  async deviceKey() {
    let k = await IDB.get('devkey');
    if (!k) { k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await IDB.set('devkey', k); }
    return k;
  },
};

const Team = {
  dir: null, perm: false, meta: null, metaStamp: 0,
  key: null, kid: null, keys: {},           // kid -> CryptoKey (huidige + oudere sleutels)
  status: 'off',                            // off | perm | locked | ok | error
  error: '',
  mine: null,                               // { profile, records, locks, updated }
  others: new Map(),                        // bestandsnaam -> { stamp, data }
  tasks: [], members: new Map(), locks: new Map(),
  timer: null, writeTimer: null, firstMerge: true, lastWriteError: 0,
};
const TEAM_PROFILE_COLORS = ['#2E5E4E', '#A4532C', '#3D5A80', '#7A4E8C', '#B5651D', '#2F6F73', '#8C3B4E', '#5C6B2E'];
const teamOn = () => !!(S && S.team);
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB';
const meId = () => S?.team?.memberId;

/* ---------- bestanden in de teammap ---------- */
async function tGet(path, create) {
  const parts = path.split('/'); let d = Team.dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
  return d.getFileHandle(parts.at(-1), { create });
}
async function tReadText(path) { return (await (await tGet(path)).getFile()).text(); }
async function tWrite(path, data) { const w = await (await tGet(path, true)).createWritable(); await w.write(data); await w.close(); }
async function tStamp(path) { try { return (await (await tGet(path)).getFile()).lastModified; } catch (e) { return 0; } }
async function teamEnsurePerm() {
  if (!Team.dir) return false;
  let st = 'prompt';
  try { st = await Team.dir.queryPermission({ mode: 'readwrite' }); } catch (e) {}
  if (st !== 'granted' && navigator.userActivation?.isActive) { try { st = await Team.dir.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
  Team.perm = st === 'granted';
  return Team.perm;
}

/* ---------- sleutels ---------- */
async function teamKeyFromAccess() {
  const acc = S.team?.access; if (!acc?.blob) return null;
  try { const raw = await TC.dec(await TC.deviceKey(), B64.dec(acc.blob)); return { kid: acc.kid, raw, key: await TC.importRaw(raw) }; } catch (e) { return null; }
}
async function storeAccess(kid, raw) {
  S.team.access = { kid, blob: B64.enc(await TC.enc(await TC.deviceKey(), raw)) };
  save();
}
async function loadKeyring(cur) {
  Team.keys = { [cur.kid]: cur.key }; Team.key = cur.key; Team.kid = cur.kid;
  for (const r of Team.meta.ring || []) {
    try { Team.keys[r.kid] = await TC.importRaw(await TC.dec(cur.key, B64.dec(r.key))); } catch (e) {}
  }
}
async function unlockWithPassword(meta, password) {
  const kek = await TC.kek(password, B64.dec(meta.kdf.salt), meta.kdf.iter);
  let raw; try { raw = await TC.dec(kek, B64.dec(meta.wrapped)); } catch (e) { return null; }
  return { kid: meta.kid, raw, key: await TC.importRaw(raw) };
}

/* ---------- eigen bestand ---------- */
const myFile = () => `leden/${meId()}.json`;
function scheduleTeamWrite() { clearTimeout(Team.writeTimer); Team.writeTimer = setTimeout(writeMine, 250); }
async function writeMine() {
  clearTimeout(Team.writeTimer);
  if (Team.status !== 'ok' || !Team.mine) return;
  if (!(await teamEnsurePerm())) { setTeamStatus('perm'); return; }
  Team.mine.updated = Date.now();
  try {
    const data = await TC.encStr(Team.key, JSON.stringify(Team.mine));
    await tWrite(myFile(), JSON.stringify({ app: 'streamline-member', v: 1, member: meId(), kid: Team.kid, data }));
    const own = Team.others.get(myFile().split('/')[1]); if (own) own.stamp = await tStamp(myFile());
  } catch (e) {
    if (e.name === 'NotAllowedError') setTeamStatus('perm');
    else if (Date.now() - Team.lastWriteError > 20000) { Team.lastWriteError = Date.now(); toast('Opslaan in de teammap mislukt: ' + e.message, 5000); }
  }
}

/* ---------- samenvoegen ---------- */
const newer = (a, b) => !b || a.t > b.t || (a.t === b.t && String(a.by) > String(b.by));
function mergeAll() {
  const sources = [Team.mine, ...[...Team.others.entries()].filter(([n]) => n !== meId() + '.json').map(([, o]) => o.data)].filter(Boolean);
  const fields = new Map(), all = new Map();
  Team.members = new Map(); Team.locks = new Map();
  for (const src of sources) {
    const by = src.member || meId();
    if (src.profile) { const m = Team.members.get(src.profile.id); if (!m || (src.updated || 0) > (m.updated || 0)) Team.members.set(src.profile.id, { ...src.profile, updated: src.updated || 0 }); }
    for (const [tid, until] of Object.entries(src.locks || {})) if (until > Date.now() && src.profile?.id !== meId()) Team.locks.set(tid, { by: src.profile?.id, until });
    for (const [id, rec] of Object.entries(src.records || {})) {
      if (!fields.has(id)) { fields.set(id, {}); all.set(id, {}); }
      const best = fields.get(id), vers = all.get(id);
      for (const [k, fv] of Object.entries(rec.f || {})) {
        (vers[k] ||= []).push(fv);
        if (newer(fv, best[k])) best[k] = fv;
      }
    }
  }
  const tasks = [];
  for (const [id, best] of fields) {
    const t = { id, _f: best, conflicts: [] };
    for (const [k, fv] of Object.entries(best)) t[k] = fv.v;
    // gelijktijdige wijzigingen zonder dat de winnaar de ander had gezien
    for (const [k, list] of Object.entries(all.get(id))) {
      const w = best[k];
      for (const fv of list) if (fv !== w && fv.by !== w.by && fv.t > (w.base || 0) && JSON.stringify(fv.v) !== JSON.stringify(w.v) && !(t.ack || {})[k + ':' + fv.t]) t.conflicts.push({ field: k, by: fv.by, v: fv.v, t: fv.t });
    }
    if (!t.deleted && t.title !== undefined) tasks.push(t);
  }
  Team.tasks = tasks;
  checkAssigned();
}
function teamSet(id, changes, bases) {
  const me = meId(); const rec = (Team.mine.records[id] ||= { f: {} });
  const cur = Team.tasks.find(t => t.id === id);
  for (const [k, v] of Object.entries(changes)) {
    const f = cur?._f?.[k];
    const t = Math.max(Date.now(), (f?.t || 0) + 1);
    rec.f[k] = { v, t, by: me, base: bases && k in bases ? bases[k] : (f?.t || 0) };
  }
  mergeAll(); scheduleTeamWrite(); teamRefresh();
}
function teamAddTask(fields) {
  const id = uid();
  teamSet(id, { title: fields.title, prio: fields.prio || 'medium', done: false, assignee: fields.assignee || null, createdBy: meId(), created: Date.now(), mail: fields.mail || null });
  return id;
}

/* ---------- synchroniseren ---------- */
async function teamSync() {
  if (!teamOn() || !Team.dir) return;
  if (!(await teamEnsurePerm())) return setTeamStatus('perm');
  try {
    const stamp = await tStamp('team.json');
    if (stamp && stamp !== Team.metaStamp) {
      Team.meta = JSON.parse(await tReadText('team.json')); Team.metaStamp = stamp;
      if (Team.meta.kid !== Team.kid) { // wachtwoord gewijzigd
        const acc = await teamKeyFromAccess();
        if (!acc || acc.kid !== Team.meta.kid) { Team.key = null; return setTeamStatus('locked'); }
        await loadKeyring(acc);
      }
    }
    if (Team.status !== 'ok') return;
    let changed = false;
    const ledenDir = await Team.dir.getDirectoryHandle('leden', { create: true });
    const seen = new Set();
    for await (const [name, hd] of ledenDir.entries()) {
      if (hd.kind !== 'file' || !name.endsWith('.json')) continue;
      seen.add(name);
      const f = await hd.getFile(); const prev = Team.others.get(name);
      if (prev && prev.stamp === f.lastModified) continue;
      try {
        const wrap = JSON.parse(await f.text()); const key = Team.keys[wrap.kid];
        const data = key ? JSON.parse(await TC.decStr(key, wrap.data)) : null;
        if (data) { data.member = wrap.member; Team.others.set(name, { stamp: f.lastModified, data }); changed = true; }
        else Team.others.set(name, { stamp: f.lastModified, data: prev?.data || null });
      } catch (e) { Team.others.set(name, { stamp: f.lastModified, data: prev?.data || null }); }
    }
    for (const n of [...Team.others.keys()]) if (!seen.has(n)) { Team.others.delete(n); changed = true; }
    // vergrendelingen verlopen vanzelf
    const expired = [...Team.locks.values()].some(l => l.until <= Date.now());
    if (changed || expired) { mergeAll(); teamRefresh(); }
  } catch (e) {
    if (e.name === 'NotAllowedError') setTeamStatus('perm');
    else console.warn('teamSync', e);
  }
}
function setTeamStatus(st, err) {
  const changed = Team.status !== st; Team.status = st; Team.error = err || '';
  if (changed) { teamRefresh(); if (typeof renderSettings === 'function') renderSettings(); }
}
async function teamStart() {
  clearInterval(Team.timer);
  Object.assign(Team, { dir: null, perm: false, meta: null, metaStamp: 0, key: null, kid: null, keys: {}, mine: null, others: new Map(), tasks: [], members: new Map(), locks: new Map(), firstMerge: true });
  if (!teamOn()) { Team.status = 'off'; return; }
  Team.dir = (await IDB.get('teamdir:' + S.team.id)) || null;
  if (!Team.dir) { setTeamStatus('perm', 'nodir'); return; }
  await teamOpen();
  Team.timer = setInterval(teamSync, SYNC_MS);
}
async function teamOpen() {
  if (!(await teamEnsurePerm())) return setTeamStatus('perm');
  try {
    Team.meta = JSON.parse(await tReadText('team.json')); Team.metaStamp = await tStamp('team.json');
    if (Team.meta.id !== S.team.id) return setTeamStatus('error', 'Deze map hoort bij een ander team.');
    const acc = await teamKeyFromAccess();
    if (!acc || acc.kid !== Team.meta.kid) return setTeamStatus('locked');
    await loadKeyring(acc);
    // eigen bestand terugzetten (staat in de teammap)
    let mine = null, mineKid = null;
    try { const w = JSON.parse(await tReadText(myFile())); const k = Team.keys[w.kid]; if (k) { mine = JSON.parse(await TC.decStr(k, w.data)); mineKid = w.kid; } } catch (e) {}
    const col = TEAM_PROFILE_COLORS[[...meId()].reduce((n, c) => n + c.charCodeAt(0), 0) % TEAM_PROFILE_COLORS.length];
    Team.mine = mine || { profile: { id: meId(), name: S.team.myName || 'Ik', avatar: '', color: col }, records: {}, locks: {}, updated: 0 };
    Team.mine.profile.id = meId(); Team.mine.locks = {};
    Team.status = 'ok';
    await teamSync();
    mergeAll(); teamRefresh(); if (typeof renderSettings === 'function') renderSettings();
    if (!mine || mineKid !== Team.kid) scheduleTeamWrite(); // nieuw lid, of na wachtwoordwijziging opnieuw versleutelen
  } catch (e) {
    if (e.name === 'NotAllowedError') return setTeamStatus('perm');
    if (e.name === 'NotFoundError') return setTeamStatus('error', 'De teammap is niet gevonden. Is hij verplaatst of nog niet gesynchroniseerd door OneDrive?');
    setTeamStatus('error', e.message);
  }
}
async function teamReconnect() {
  if (!Team.dir) return teamPickExisting(true);
  try { const st = await Team.dir.requestPermission({ mode: 'readwrite' }); if (st !== 'granted') return toast('Zonder toestemming kan Streamline de teammap niet gebruiken'); } catch (e) { return toast(e.message); }
  Team.perm = true; await teamOpen();
}

/* ---------- melding bij een nieuwe taak ---------- */
function checkAssigned() {
  if (!S.team) return;
  const seen = new Set(S.team.seen || []);
  const mine = Team.tasks.filter(t => t.assignee === meId() && !t.done);
  const fresh = mine.filter(t => !seen.has(t.id));
  const first = S.team.seenInit !== true;
  if (first) { S.team.seenInit = true; save(); }
  if (!fresh.length) return;
  S.team.seen = [...new Set([...(S.team.seen || []).filter(id => Team.tasks.some(t => t.id === id)), ...fresh.map(t => t.id)])];
  save();
  if (first) { toast(`Er staa${fresh.length === 1 ? 't 1 teamtaak' : 'n ' + fresh.length + ' teamtaken'} op jouw naam`); return; }
  for (const t of fresh) {
    const from = t._f?.assignee?.by;
    if (from === meId()) continue; // zelf aan jezelf toegewezen
    notifyAssigned(t, memberName(from));
  }
}
function notifyAssigned(t, fromName) {
  beep();
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Streamline — nieuwe teamtaak', { body: `${fromName}: ${t.title}`, tag: 'team-' + t.id }); } catch (e) {}
  const box = h('div', { class: 'alarm', role: 'alert' });
  const close = () => box.remove();
  box.append(h('h4', { html: icon('users', 18) + 'Nieuwe teamtaak' }), h('p', {}, h('b', {}, fromName), ' heeft je een taak gegeven:', h('br'), t.title),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary sm', onclick: () => { close(); openTeamTask(t.id); } }, 'Bekijken'),
      h('button', { class: 'btn sm', onclick: close }, 'OK')));
  const stack = $$('.alarm').length; box.style.bottom = (24 + stack * 12) + 'px';
  document.body.append(box);
}

/* ---------- hulpjes voor weergave ---------- */
function memberName(id) { return id === meId() ? (Team.mine?.profile?.name || 'Ik') : (Team.members.get(id)?.name || 'Onbekend'); }
function avatarEl(id, size = 26) {
  const m = id === meId() ? Team.mine?.profile : Team.members.get(id);
  const name = m?.name || '?';
  const el = h('span', { class: 'av', title: name, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * .42) + 'px', background: m?.color || 'var(--muted)' } });
  if (m?.avatar) el.append(h('img', { src: m.avatar, alt: '' })); else el.textContent = name.trim().slice(0, 1).toUpperCase();
  return el;
}
function membersList() {
  const list = [...Team.members.values()];
  if (Team.mine?.profile && !list.some(m => m.id === meId())) list.push(Team.mine.profile);
  return list.sort((a, b) => (a.id === meId() ? -1 : b.id === meId() ? 1 : String(a.name).localeCompare(b.name)));
}
function assigneePicker(anchor, current, cb) {
  popover(anchor, [
    h('div', { class: 'lbl', style: { padding: '4px 10px 6px' } }, 'Toewijzen aan'),
    membersList().map(m => h('button', { class: 'opt' + (m.id === current ? ' cr-cur' : ''), onclick: () => { closePop(); cb(m.id); } }, avatarEl(m.id, 28), h('span', { class: 'grow' }, m.name + (m.id === meId() ? ' (jij)' : '')))),
    current ? [h('hr'), h('button', { class: 'opt', html: icon('x', 15) + 'Niemand', onclick: () => { closePop(); cb(null); } })] : null,
  ]);
}
const teamRefresh = debounce(() => {
  if (!S) return;
  for (const it of [...S.global, ...currentPage().items]) {
    if (!['todo', 'teamtasks', 'teammembers'].includes(it.type)) continue;
    const el = els.get(it.id); if (!el) continue;
    const a = document.activeElement;
    if (a && el.contains(a) && a.matches('[contenteditable="true"]')) { a.addEventListener('blur', () => teamRefresh(), { once: true }); continue; }
    // invoerveld met de cursor erin: na het verversen cursor en tekst terugzetten
    let keep = null;
    if (a && el.contains(a) && a.matches('input,textarea')) { const all = [...el.querySelectorAll('input,textarea')]; keep = { i: all.indexOf(a), v: a.value, s: a.selectionStart, e: a.selectionEnd }; }
    buildItem(it);
    if (keep && keep.i >= 0) { const n = el.querySelectorAll('input,textarea')[keep.i]; if (n) { n.value = keep.v; n.focus(); try { n.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
  }
}, 60);
function teamStatusBox(el) {
  const msg = {
    off: ['users', 'Nog geen team', 'Maak een team of sluit je aan bij een team via Instellingen → Team.', 'Naar instellingen', () => { setEditing(true); showPanel('settings', true); settingsTab = 'team'; renderSettings(); }],
    perm: ['folder', 'Teammap koppelen', 'Chrome vraagt toestemming om de teammap te gebruiken.', 'Koppelen', teamReconnect],
    locked: ['lock', 'Wachtwoord nodig', 'Het teamwachtwoord is gewijzigd, of je gebruikt een andere computer. Vul het wachtwoord in om verder te gaan.', 'Wachtwoord invullen', teamUnlockDialog],
    error: ['alert', 'Teammap niet bereikbaar', Team.error, 'Opnieuw proberen', teamStart],
  }[Team.status] || ['clock', 'Team laden…', '', null];
  el.append(h('div', { class: 'missing' }, h('span', { html: icon(msg[0], 26) }), h('b', {}, msg[1]), h('span', {}, msg[2]), msg[3] ? h('button', { class: 'btn primary sm', onclick: msg[4] }, msg[3]) : null));
}

/* ---------- teamtaak openen / bewerken (met vergrendeling) ---------- */
function setLock(id, on) {
  if (!Team.mine) return;
  if (on) Team.mine.locks[id] = Date.now() + LOCK_MS; else delete Team.mine.locks[id];
  writeMine();
}
async function downloadAttachment(a) {
  try {
    const bytes = new Uint8Array(await (await (await tGet('bijlagen/' + a.id + '.bin')).getFile()).arrayBuffer());
    const key = Team.keys[a.kid]; if (!key) throw new Error('sleutel ontbreekt');
    download(a.name, new Blob([await TC.dec(key, bytes)], { type: a.type || 'application/octet-stream' }));
  } catch (e) { toast(e.name === 'NotFoundError' ? 'Bijlage nog niet binnen — OneDrive is waarschijnlijk nog aan het synchroniseren' : 'Bijlage openen mislukt: ' + e.message, 5000); }
}
function openTeamTask(id) {
  const t = Team.tasks.find(x => x.id === id);
  if (!t) return toast('Deze taak bestaat niet meer');
  const lock = Team.locks.get(id);
  const ro = !!lock && lock.until > Date.now();
  const bases = Object.fromEntries(Object.entries(t._f).map(([k, f]) => [k, f.t]));
  const draft = { title: t.title, prio: t.prio, assignee: t.assignee, done: !!t.done };
  const body = h('div');
  if (ro) body.append(h('div', { class: 'list-row', style: { marginBottom: '12px' } }, h('span', { html: icon('lock', 16) }), h('span', {}, h('b', {}, memberName(lock.by)), ' is deze taak nu aan het bewerken. Je kunt hem bekijken; wijzigen kan zodra die klaar is.')));
  if (t.conflicts.length) body.append(h('div', { class: 'list-row', style: { marginBottom: '12px', outline: '2px solid var(--mid)' } }, h('span', { html: icon('alert', 16), style: { color: 'var(--mid)' } }),
    h('div', { class: 'grow' }, h('b', {}, 'Tegelijk gewijzigd. '), t.conflicts.map(c => `${memberName(c.by)} veranderde ${({ title: 'de titel', prio: 'de prioriteit', assignee: 'de toewijzing', done: 'de status' })[c.field] || c.field} naar “${c.field === 'assignee' ? memberName(c.v) : c.field === 'done' ? (c.v ? 'klaar' : 'open') : c.v}”`).join('; ') + '. De nieuwste wijziging is bewaard.'),
    ro ? null : h('button', { class: 'btn sm', onclick: () => { const ack = { ...(t.ack || {}) }; t.conflicts.forEach(c => ack[c.field + ':' + c.t] = 1); teamSet(id, { ack }); m.close(); } }, 'Begrepen')));
  const title = h('input', { class: 'inp', value: draft.title, disabled: ro, oninput: e => draft.title = e.target.value });
  const prio = h('div', { class: 'seg' });
  const drawPrio = () => { prio.innerHTML = ''; for (const p of ['hoog', 'medium', 'laag']) prio.append(h('button', { class: draft.prio === p ? 'on' : '', disabled: ro, onclick: () => { draft.prio = p; drawPrio(); } }, h('i', { class: 'pc-' + p, style: { width: '9px', height: '9px', borderRadius: '50%', display: 'inline-block', marginRight: '6px' } }), PRIO_LABEL[p])); };
  drawPrio();
  const asg = h('button', { class: 'btn', disabled: ro });
  const drawAsg = () => { asg.innerHTML = ''; asg.append(draft.assignee ? avatarEl(draft.assignee, 22) : h('span', { html: icon('user', 16) }), draft.assignee ? memberName(draft.assignee) : 'Niemand'); };
  asg.onclick = () => assigneePicker(asg, draft.assignee, v => { draft.assignee = v; drawAsg(); });
  drawAsg();
  body.append(
    h('div', { class: 'field' }, h('label', {}, 'Taak'), title),
    h('div', { class: 'row', style: { alignItems: 'flex-end', flexWrap: 'wrap' } },
      h('div', { class: 'field' }, h('label', {}, 'Prioriteit'), prio),
      h('div', { class: 'field' }, h('label', {}, 'Toegewezen aan'), asg),
      h('label', { class: 'check', style: { marginBottom: '16px' } }, h('input', { type: 'checkbox', checked: draft.done, disabled: ro, onchange: e => draft.done = e.target.checked }), 'Klaar')),
    h('div', { class: 'hint' }, `Aangemaakt door ${memberName(t.createdBy)} op ${new Date(t.created).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}`));
  if (t.mail) {
    const mail = t.mail;
    body.append(h('div', { class: 'sect', style: { marginTop: '14px' } }, h('h4', {}, 'E-mail'),
      h('div', { class: 'mailbox' },
        mail.from ? h('div', {}, h('span', { class: 'lbl' }, 'Van: '), mail.from) : null,
        mail.date ? h('div', {}, h('span', { class: 'lbl' }, 'Datum: '), new Date(mail.date).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })) : null,
        mail.body ? h('pre', { class: 'mailbody' }, mail.body) : h('div', { class: 'hint' }, 'Alleen de titel is gedeeld.')),
      (mail.attachments || []).length ? h('div', { class: 'atts' }, mail.attachments.map(a => h('button', { class: 'btn sm', title: 'Downloaden', onclick: () => downloadAttachment(a) }, h('span', { html: icon('download', 14) }), a.name, h('span', { class: 'cr-info' }, ' ' + fmtSize(a.size))))) : null));
  }
  let lockTimer = null;
  if (!ro) { setLock(id, true); lockTimer = setInterval(() => setLock(id, true), 30000); }
  const m = openModal({ title: 'Teamtaak', wide: !!t.mail, body,
    foot: ro ? [h('button', { class: 'btn', onclick: () => m.close() }, 'Sluiten')] : [
      h('button', { class: 'btn left danger', onclick: async () => {
        if (!(await confirmDlg('Teamtaak verwijderen?', 'De taak verdwijnt voor iedereen in het team.', 'Verwijderen', true))) return;
        teamSet(id, { deleted: true }); m.close(); toast('Teamtaak verwijderd');
      } }, h('span', { html: icon('trash', 14) }), 'Verwijderen'),
      h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'),
      h('button', { class: 'btn primary', onclick: async () => {
        draft.title = draft.title.trim(); if (!draft.title) return toast('Geef de taak een titel');
        const now = Team.tasks.find(x => x.id === id);
        if (!now) { m.close(); return toast('Deze taak is intussen door iemand verwijderd'); }
        const changes = {};
        for (const k of Object.keys(draft)) if (JSON.stringify(draft[k] ?? null) !== JSON.stringify(t[k] ?? null)) changes[k] = draft[k];
        if (!Object.keys(changes).length) return m.close();
        // fail-safe: heeft iemand dit intussen gewijzigd?
        const clash = Object.keys(changes).filter(k => now._f[k] && now._f[k].t > (bases[k] || 0) && now._f[k].by !== meId());
        if (clash.length) {
          const who = [...new Set(clash.map(k => memberName(now._f[k].by)))].join(' en ');
          const pick = await choiceDlg('Intussen gewijzigd', `${who} heeft deze taak gewijzigd terwijl jij hem open had. Wil je jouw versie toch opslaan?`, [['cancel', 'Nee, bekijk hun versie'], ['save', 'Ja, mijn versie opslaan', true]]);
          if (pick !== 'save') { m.close(); setTimeout(() => openTeamTask(id), 50); return; }
          for (const k of clash) bases[k] = now._f[k].t;
        }
        teamSet(id, changes, bases); m.close();
        if ('assignee' in changes && changes.assignee && changes.assignee !== meId()) toast('Toegewezen aan ' + memberName(changes.assignee));
      } }, 'Opslaan')],
    onClose: () => { clearInterval(lockTimer); if (!ro) setLock(id, false); } });
}

/* ---------- e-mails slepen in de teamtaken ---------- */
async function mailsFromDrop(dt) {
  const out = [];
  for (const f of [...(dt.files || [])]) {
    if (/\.(msg|eml)$/i.test(f.name)) {
      try { const m = await MailParser.parseFile(f); out.push({ title: m.subject || f.name.replace(/\.(msg|eml)$/i, ''), mail: m }); continue; } catch (e) { console.warn(e); }
    }
    out.push({ title: f.name.replace(/\.(msg|eml|txt|url|html?)$/i, '') });
  }
  if (!out.length) {
    const t = dt.getData('text/plain') || dt.getData('text/uri-list') || '';
    const line = t.split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (line) out.push({ title: line });
  }
  return out.map(o => ({ ...o, title: o.title.slice(0, 240) })).filter(o => o.title);
}
async function shareChoice(n) {
  const pref = S.team.shareMail || 'ask';
  if (pref !== 'ask') return pref === 'on';
  return new Promise(res => {
    let done = false;
    const remember = h('input', { type: 'checkbox' });
    const pick = v => { done = true; if (remember.checked) { S.team.shareMail = v ? 'on' : 'off'; save(); } m.close(); res(v); };
    const m = openModal({ title: 'E-mail delen met het team?', body: h('div', {},
      h('p', { style: { margin: '0 0 10px' } }, n === 1 ? 'Wil je ook de inhoud van de e-mail en de bijlagen met je team delen? Anders deel je alleen de titel.' : `Wil je ook de inhoud en bijlagen van deze ${n} e-mails met je team delen? Anders deel je alleen de titels.`),
      h('label', { class: 'check' }, remember, 'Onthoud mijn keuze (te wijzigen bij Instellingen → Team)')),
      foot: [h('button', { class: 'btn', onclick: () => pick(false) }, 'Alleen de titel'), h('button', { class: 'btn primary', onclick: () => pick(true) }, 'Ook inhoud en bijlagen')],
      onClose: () => { if (!done) res(null); } });
  });
}
async function storeMail(mail) {
  const atts = [];
  for (const a of mail.attachments || []) {
    const id = uid() + uid();
    await tWrite('bijlagen/' + id + '.bin', await TC.enc(Team.key, a.data));
    atts.push({ id, name: a.name, type: a.type || '', size: a.data.length, kid: Team.kid });
  }
  return { from: mail.from || '', date: mail.date || '', body: (mail.body || '').slice(0, 100000), attachments: atts };
}

/* ---------- widgets ---------- */
reg({
  type: 'teamtasks', name: 'Teamtaken', desc: 'Gedeelde takenlijst: toewijzen aan collega’s, e-mails erin slepen', icon: 'users', group: 'widgets',
  size: { w: 9, h: 11 }, min: { w: 4, h: 5 },
  defaults: { title: 'Teamtaken', filter: 'all', showDone: true, defaultPrio: 'medium' },
  fields: [
    { key: 'title', label: 'Kop', type: 'text' },
    { key: 'filter', label: 'Standaard tonen', type: 'seg', options: [['all', 'Alles'], ['mine', 'Aan mij'], ['open', 'Niet toegewezen']] },
    { key: 'defaultPrio', label: 'Standaard prioriteit', type: 'seg', options: [['hoog', 'Hoog'], ['medium', 'Medium'], ['laag', 'Laag']] },
    { key: 'showDone', label: 'Afgeronde taken tonen (onderaan)', type: 'checkbox' },
  ],
  render(el, ctx) {
    if (Team.status !== 'ok') return teamStatusBox(el);
    const c = ctx.config, d = ctx.item.data;
    d.filter = d.filter || c.filter || 'all';
    let prio = c.defaultPrio || 'medium', assignee = null;
    const inp = h('input', { class: 'inp grow', placeholder: 'Nieuwe teamtaak… (of sleep een e-mail hierheen)' });
    const pr = h('div', { class: 'prio', title: 'Prioriteit' });
    const drawPr = () => { pr.innerHTML = ''; for (const p of ['hoog', 'medium', 'laag']) pr.append(h('button', { class: prio === p ? 'on' : '', title: PRIO_LABEL[p], onclick: () => { prio = p; drawPr(); } }, h('i', { class: 'pc-' + p }))); };
    drawPr();
    const asg = h('button', { class: 'iconbtn', title: 'Toewijzen aan…' });
    const drawAsg = () => { asg.innerHTML = ''; asg.append(assignee ? avatarEl(assignee, 26) : h('span', { html: icon('user', 16) })); asg.title = assignee ? 'Toewijzen aan ' + memberName(assignee) : 'Toewijzen aan…'; };
    asg.onclick = () => assigneePicker(asg, assignee, v => { assignee = v; drawAsg(); });
    drawAsg();
    const add = () => { const v = inp.value.trim(); if (!v) return; teamAddTask({ title: v, prio, assignee }); inp.value = ''; inp.focus(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    const tabs = h('div', { class: 'seg', style: { marginBottom: '8px' } });
    for (const [k, l] of [['all', 'Alles'], ['mine', 'Aan mij'], ['open', 'Niet toegewezen']]) tabs.append(h('button', { class: d.filter === k ? 'on' : '', onclick: () => { d.filter = k; ctx.save(); ctx.rerender(); } }, l));
    const list = h('div', { class: 'todo-list' });
    const items = Team.tasks.filter(t => (c.showDone !== false || !t.done) && (d.filter === 'all' || (d.filter === 'mine' ? t.assignee === meId() : !t.assignee)))
      .sort((a, b) => (!!a.done - !!b.done) || (PRIO[a.prio] - PRIO[b.prio]) || (a.created - b.created));
    for (const t of items) {
      const lock = Team.locks.get(t.id);
      const av = h('button', { class: 'mini av-btn', title: t.assignee ? 'Toegewezen aan ' + memberName(t.assignee) : 'Toewijzen' });
      av.append(t.assignee ? avatarEl(t.assignee, 24) : h('span', { html: icon('user', 15) }));
      av.onclick = e => { e.stopPropagation(); if (lock) return toast(memberName(lock.by) + ' is deze taak aan het bewerken'); assigneePicker(av, t.assignee, v => teamSet(t.id, { assignee: v })); };
      list.append(h('div', { class: 'todo' + (t.done ? ' done' : '') },
        h('span', { class: 'bar pc-' + (t.prio || 'medium') }),
        h('button', { class: 'cb', title: t.done ? 'Niet klaar' : 'Klaar', html: icon('check', 13), onclick: () => { if (lock) return toast(memberName(lock.by) + ' is deze taak aan het bewerken'); teamSet(t.id, { done: !t.done }); } }),
        h('div', { class: 'tt clickable', title: 'Openen', onclick: () => openTeamTask(t.id) }, t.title),
        t.mail ? h('span', { class: 'meta', title: 'Met e-mail' + ((t.mail.attachments || []).length ? ' en bijlagen' : ''), html: icon((t.mail.attachments || []).length ? 'file' : 'mail', 14) }) : '',
        t.conflicts.length ? h('span', { class: 'meta warn', title: 'Tegelijk gewijzigd — open de taak', html: icon('alert', 14) }) : '',
        lock ? h('span', { class: 'lockb', title: memberName(lock.by) + ' bewerkt deze taak' }, h('span', { html: icon('lock', 12) }), memberName(lock.by)) : '',
        av));
    }
    if (!items.length) list.append(h('div', { class: 'empty' }, d.filter === 'mine' ? 'Er staan geen taken op jouw naam.' : 'Nog geen teamtaken. Typ hierboven of sleep een e-mail hierheen.'));
    const open = Team.tasks.filter(t => !t.done).length;
    el.append(h('div', { class: 'todo-add' }, inp, pr, asg, h('button', { class: 'iconbtn', title: 'Toevoegen', html: icon('plus', 16), onclick: add })), tabs, list,
      h('div', { class: 'todo-foot' }, h('span', {}, `${open} open`), h('span', { class: 'sync', title: 'Wijzigingen worden direct in de teammap opgeslagen' }, h('span', { html: icon('refresh', 12) }), 'live')));
    const card = el.closest('.card') || el;
    card.addEventListener('dragover', e => { if (editing) return; e.preventDefault(); e.stopPropagation(); card.classList.add('dropping'); });
    card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) card.classList.remove('dropping'); });
    card.addEventListener('drop', async e => {
      if (editing) return; e.preventDefault(); e.stopPropagation(); card.classList.remove('dropping');
      const got = await mailsFromDrop(e.dataTransfer);
      if (!got.length) return toast('Ik kon hier geen titel uit halen');
      const withMail = got.filter(g => g.mail);
      let share = false;
      if (withMail.length) { share = await shareChoice(withMail.length); if (share === null) return; }
      for (const g of got) {
        let mail = null;
        if (share && g.mail) { try { mail = await storeMail(g.mail); } catch (err) { toast('Bijlagen opslaan mislukt: ' + err.message, 5000); } }
        teamAddTask({ title: g.title, prio, assignee, mail });
      }
      toast(got.length === 1 ? 'Teamtaak toegevoegd: ' + got[0].title : got.length + ' teamtaken toegevoegd');
    });
  },
});
reg({
  type: 'teammembers', name: 'Teamleden', desc: 'Wie er in je team zit, met foto', icon: 'users', group: 'widgets',
  size: { w: 5, h: 5 }, min: { w: 2, h: 2 },
  defaults: { title: 'Team' },
  fields: [{ key: 'title', label: 'Kop', type: 'text' }],
  render(el) {
    if (Team.status !== 'ok') return teamStatusBox(el);
    const wrap = h('div', { class: 'members' });
    for (const m of membersList()) {
      const open = Team.tasks.filter(t => t.assignee === m.id && !t.done).length;
      const ago = m.id === meId() ? 'jij' : m.updated ? 'actief ' + timeAgo(m.updated) : '';
      wrap.append(h('button', { class: 'member', title: m.id === meId() ? 'Je profiel aanpassen' : m.name, onclick: () => { if (m.id === meId()) profileDialog(); } },
        avatarEl(m.id, 38), h('span', { class: 'grow' }, h('b', {}, m.name), h('small', {}, [ago, open ? `${open} open` : ''].filter(Boolean).join(' · ')))));
    }
    el.append(wrap);
  },
});
function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  return s < 90 ? 'zojuist' : s < 3600 ? Math.round(s / 60) + ' min geleden' : s < 86400 ? Math.round(s / 3600) + ' uur geleden' : new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/* ---------- persoonlijke takenlijst: teamtaken erbij ---------- */
const TeamForTodo = {
  mine: () => (Team.status === 'ok' ? Team.tasks.filter(t => t.assignee === meId()) : []),
  open: id => openTeamTask(id),
  toggle: t => teamSet(t.id, { done: !t.done }),
};

/* ---------- profiel ---------- */
function resizeAvatar(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const s = 160, cv = h('canvas', { width: s, height: s }), c = cv.getContext('2d');
      const m = Math.min(img.naturalWidth, img.naturalHeight);
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, s, s);
      URL.revokeObjectURL(img.src); res(cv.toDataURL('image/jpeg', .85));
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
function profileDialog() {
  if (!Team.mine) return;
  const p = { ...Team.mine.profile };
  const prev = h('div');
  const draw = () => { prev.innerHTML = ''; const a = avatarEl(meId(), 72); if (p.avatar) { a.innerHTML = ''; a.append(h('img', { src: p.avatar, alt: '' })); } else { a.textContent = (p.name || '?').slice(0, 1).toUpperCase(); } a.style.background = p.color; prev.append(a); };
  const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async () => { if (file.files[0]) { p.avatar = await resizeAvatar(file.files[0]); draw(); } } });
  const colors = h('div', { class: 'row', style: { flexWrap: 'wrap' } }, TEAM_PROFILE_COLORS.map(c => h('button', { class: 'swatch-dot', style: { background: c }, title: 'Kleur', onclick: () => { p.color = c; draw(); } })));
  draw();
  const m = openModal({ title: 'Je teamprofiel', body: h('div', {},
    h('div', { class: 'row', style: { gap: '16px', marginBottom: '14px' } }, prev,
      h('div', { class: 'grow' }, h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn sm', onclick: () => file.click() }, h('span', { html: icon('image', 14) }), 'Foto kiezen'),
        h('button', { class: 'btn sm', onclick: () => { p.avatar = ''; draw(); } }, 'Foto weghalen')), h('div', { class: 'lbl', style: { margin: '10px 0 6px' } }, 'Kleur (zonder foto)'), colors)),
    file,
    h('div', { class: 'field' }, h('label', {}, 'Je naam in het team'), h('input', { class: 'inp', value: p.name, placeholder: 'Je voornaam', oninput: e => { p.name = e.target.value; draw(); } })),
    h('p', { class: 'hint' }, 'Je foto wordt verkleind en versleuteld in de teammap opgeslagen. Alleen teamleden zien hem.')),
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: () => {
      p.name = (p.name || '').trim() || 'Ik';
      Team.mine.profile = { ...p, id: meId() }; S.team.myName = p.name; save();
      mergeAll(); writeMine(); teamRefresh(); renderSettings(); m.close();
    } }, 'Opslaan')] });
}

/* ---------- team maken / aansluiten / wachtwoord ---------- */
function teamPage(add) {
  let p = S.pages.find(x => x.team);
  if (!p && add) {
    p = { id: uid(), name: 'Team', icon: 'users', team: true, items: [
      mk('title', 0, 3, 10, 1, { text: S.team.name, size: 3 }),
      mk('teamtasks', 0, 4, 10, 11), mk('teammembers', 10, 4, 5, 6) ] };
    const i = S.pages.findIndex(x => x.id === S.activePage);
    S.pages.splice(i + 1, 0, p);
  }
  return p;
}
async function attachTeam(dir, meta, key, memberId, name) {
  S.team = { id: meta.id, name: meta.name, memberId, myName: name, shareMail: S.team?.shareMail || 'ask', seen: [], seenInit: false, folder: dir.name };
  await IDB.set('teamdir:' + meta.id, dir);
  await storeAccess(key.kid, key.raw);
  const p = teamPage(true); save();
  await teamStart();
  if (Team.mine) { Team.mine.profile.name = name; writeMine(); }
  goPage(p.id);
}
function pwFields() {
  const a = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' }), b = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
  return { a, b, el: [h('div', { class: 'field' }, h('label', {}, 'Wachtwoord (minstens 8 tekens)'), a), h('div', { class: 'field' }, h('label', {}, 'Wachtwoord herhalen'), b)],
    check() { if (a.value.length < 8) { toast('Kies een wachtwoord van minstens 8 tekens'); return null; } if (a.value !== b.value) { toast('De wachtwoorden zijn niet gelijk'); return null; } return a.value; } };
}
function teamCreateDialog() {
  if (!FS.supported) return toast('Gebruik Chrome of Edge om een team te maken');
  const name = h('input', { class: 'inp', placeholder: 'Bijv. Marketing' });
  const me = h('input', { class: 'inp', placeholder: 'Je voornaam', value: S.team?.myName || '' });
  const pw = pwFields();
  const m = openModal({ title: 'Nieuw team maken', body: h('div', {},
    h('p', { class: 'hint' }, 'Streamline maakt een teammap aan op een plek die je collega’s ook kunnen bereiken, bijvoorbeeld een gedeelde map in OneDrive of Teams/SharePoint.'),
    h('div', { class: 'field' }, h('label', {}, 'Naam van het team'), name),
    h('div', { class: 'field' }, h('label', {}, 'Je naam in het team'), me),
    pw.el,
    h('p', { class: 'hint' }, 'Alles in de teammap wordt met dit wachtwoord versleuteld. Deel het wachtwoord alleen met je collega’s, en niet via dezelfde gedeelde map. Kwijt = kwijt: er is geen herstel.')),
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: async () => {
      const tn = name.value.trim(), mn = me.value.trim(); if (!tn || !mn) return toast('Vul een teamnaam en je naam in');
      const password = pw.check(); if (!password) return;
      let parent; try { parent = await window.showDirectoryPicker({ id: 'streamline-team', mode: 'readwrite' }); } catch (e) { return; }
      try {
        const dir = await parent.getDirectoryHandle(safeName('Streamline team - ' + tn), { create: true });
        try { await dir.getFileHandle('team.json'); return toast('Daar staat al een team. Kies “Aansluiten bij een team”.', 5000); } catch (e) {}
        const salt = TC.rand(16), kek = await TC.kek(password, salt, TEAM_ITER), k = await TC.newKey(), kid = uid();
        const meta = { app: 'streamline-team', v: 1, id: uid() + uid(), name: tn, created: Date.now(), creator: null, kdf: { salt: B64.enc(salt), iter: TEAM_ITER }, kid, wrapped: B64.enc(await TC.enc(kek, k.raw)), ring: [] };
        const memberId = uid() + uid(); meta.creator = memberId;
        const w = await (await dir.getFileHandle('team.json', { create: true })).createWritable(); await w.write(JSON.stringify(meta, null, 2)); await w.close();
        await dir.getDirectoryHandle('leden', { create: true }); await dir.getDirectoryHandle('bijlagen', { create: true });
        const ws = await (await dir.getFileHandle('LEESMIJ.txt', { create: true })).createWritable();
        await ws.write(`Dit is de teammap van Streamline-team "${tn}".\r\nAlles hierin is versleuteld. Verplaats of wijzig niets met de hand.\r\nCollega's sluiten aan via Streamline: Instellingen > Team > Aansluiten bij een team.\r\n`); await ws.close();
        m.close();
        await attachTeam(dir, meta, { kid, raw: k.raw }, memberId, mn);
        toast('Team “' + tn + '” is aangemaakt');
        teamInviteInfo(dir.name);
      } catch (e) { toast('Team maken mislukt: ' + e.message, 6000); }
    } }, h('span', { html: icon('folder', 15) }), 'Locatie kiezen en maken')] });
}
function teamInviteInfo(folder) {
  openModal({ title: 'Collega’s uitnodigen', body: h('div', {},
    h('p', {}, 'Zo laat je collega’s meedoen:'),
    h('ol', { class: 'hint', style: { fontSize: '13.5px', lineHeight: 1.6 } },
      h('li', {}, 'Deel de map “', h('b', {}, folder), '” via OneDrive/SharePoint met je collega’s (met bewerkrechten).'),
      h('li', {}, 'Zij kiezen in OneDrive bij die map “Snelkoppeling toevoegen aan Mijn bestanden”, zodat hij op hun computer staat.'),
      h('li', {}, 'In Streamline: Instellingen → Team → “Aansluiten bij een team” en die map kiezen.'),
      h('li', {}, 'Geef ze het wachtwoord persoonlijk of via een ander kanaal.'))) });
}
async function findTeamDir(dir) {
  try { await dir.getFileHandle('team.json'); return dir; } catch (e) {}
  for await (const [, hd] of dir.entries()) if (hd.kind === 'directory') { try { await hd.getFileHandle('team.json'); return hd; } catch (e) {} }
  return null;
}
async function teamPickExisting(reconnectOnly) {
  let picked; try { picked = await window.showDirectoryPicker({ id: 'streamline-team', mode: 'readwrite' }); } catch (e) { return; }
  const dir = await findTeamDir(picked);
  if (!dir) return toast('In deze map staat geen Streamline-team (team.json ontbreekt). Kies de map “Streamline team - …”.', 6000);
  let meta; try { meta = JSON.parse(await (await (await dir.getFileHandle('team.json')).getFile()).text()); } catch (e) { return toast('team.json is niet te lezen'); }
  if (meta.app !== 'streamline-team') return toast('Dit is geen Streamline-teammap');
  if (reconnectOnly && S.team && meta.id === S.team.id) { await IDB.set('teamdir:' + meta.id, dir); S.team.folder = dir.name; save(); return teamStart(); }
  teamJoinDialog(dir, meta);
}
function teamJoinDialog(dir, meta) {
  const pw = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' });
  const me = h('input', { class: 'inp', placeholder: 'Je voornaam', value: S.team?.myName || '' });
  const go = async () => {
    const mn = me.value.trim(); if (!mn) return toast('Vul je naam in');
    const key = await unlockWithPassword(meta, pw.value);
    if (!key) { pw.value = ''; pw.focus(); return toast('Wachtwoord klopt niet'); }
    m.close();
    const memberId = (S.team && S.team.id === meta.id && S.team.memberId) || uid() + uid();
    await attachTeam(dir, meta, key, memberId, mn);
    toast('Welkom in team “' + meta.name + '”');
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  const m = openModal({ title: 'Aansluiten bij “' + meta.name + '”', body: h('div', {},
    h('div', { class: 'field' }, h('label', {}, 'Je naam in het team'), me),
    h('div', { class: 'field' }, h('label', {}, 'Teamwachtwoord'), pw),
    h('p', { class: 'hint' }, 'Streamline onthoudt de toegang versleuteld in je eigen instellingen, alleen op deze computer. Wijzigt de maker het wachtwoord, dan vraagt Streamline het opnieuw.')),
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: go }, 'Aansluiten')] });
}
function teamUnlockDialog() {
  if (!Team.meta) return teamStart();
  const pw = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' });
  const go = async () => {
    const key = await unlockWithPassword(Team.meta, pw.value);
    if (!key) { pw.value = ''; pw.focus(); return toast('Wachtwoord klopt niet'); }
    await storeAccess(key.kid, key.raw); m.close(); await teamOpen(); toast('Team ontgrendeld');
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  const m = openModal({ title: 'Teamwachtwoord', body: h('div', {}, h('div', { class: 'field' }, h('label', {}, 'Wachtwoord van “' + (Team.meta.name || S.team.name) + '”'), pw)),
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: go }, 'Ontgrendelen')] });
}
function teamPasswordDialog() {
  const old = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' });
  const pw = pwFields();
  const m = openModal({ title: 'Teamwachtwoord wijzigen', body: h('div', {},
    h('div', { class: 'field' }, h('label', {}, 'Huidig wachtwoord'), old), pw.el,
    h('p', { class: 'hint' }, 'Na het wijzigen moeten alle teamleden het nieuwe wachtwoord invullen. Wie het nieuwe wachtwoord niet heeft, kan geen nieuwe teamgegevens meer lezen.')),
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuleren'), h('button', { class: 'btn primary', onclick: async () => {
      const np = pw.check(); if (!np) return;
      if (!(await unlockWithPassword(Team.meta, old.value))) return toast('Huidig wachtwoord klopt niet');
      try {
        const meta = JSON.parse(await tReadText('team.json'));
        const salt = TC.rand(16), kek = await TC.kek(np, salt, TEAM_ITER), k = await TC.newKey(), kid = uid();
        const ring = [];
        for (const [okid, okey] of Object.entries(Team.keys)) { const raw = new Uint8Array(await crypto.subtle.exportKey('raw', okey)); ring.push({ kid: okid, key: B64.enc(await TC.enc(k.key, raw)) }); }
        Object.assign(meta, { kdf: { salt: B64.enc(salt), iter: TEAM_ITER }, kid, wrapped: B64.enc(await TC.enc(kek, k.raw)), ring, changed: Date.now() });
        await tWrite('team.json', JSON.stringify(meta, null, 2));
        Team.meta = meta; Team.metaStamp = await tStamp('team.json');
        await storeAccess(kid, k.raw); await loadKeyring({ kid, key: k.key, raw: k.raw });
        await writeMine(); m.close(); toast('Wachtwoord gewijzigd — laat je collega’s het nieuwe wachtwoord invullen');
      } catch (e) { toast('Wijzigen mislukt: ' + e.message, 6000); }
    } }, 'Wijzigen')] });
}
async function teamLeave() {
  if (!(await confirmDlg('Team verlaten op deze computer?', 'Streamline vergeet de toegang tot dit team en haalt het team-tabblad weg. De teammap en de taken van je collega’s blijven gewoon bestaan; je kunt later weer aansluiten.', 'Verlaten', true))) return;
  clearInterval(Team.timer);
  const p = S.pages.find(x => x.team);
  if (p && S.pages.length > 1) { S.pages.splice(S.pages.indexOf(p), 1); if (S.activePage === p.id) S.activePage = S.pages[0].id; }
  S.team = null; save(); await teamStart(); renderAll(); renderSettings();
}

/* ---------- instellingen-tab ---------- */
function tabTeam(b) {
  if (!S.team) {
    b.append(h('p', { class: 'hint' }, 'Werk samen met collega’s in een gedeelde map, bijvoorbeeld op OneDrive. Je persoonlijke dashboard blijft van jou; alleen wat op het team-tabblad staat, wordt gedeeld.'),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn primary', onclick: teamCreateDialog }, h('span', { html: icon('plus', 15) }), 'Nieuw team maken'),
        h('button', { class: 'btn', onclick: () => teamPickExisting(false) }, h('span', { html: icon('users', 15) }), 'Aansluiten bij een team')));
    return;
  }
  const st = { ok: ['check', 'Verbonden'], perm: ['folder', 'Toestemming nodig'], locked: ['lock', 'Wachtwoord nodig'], error: ['alert', 'Niet bereikbaar'], off: ['clock', 'Laden…'] }[Team.status] || ['clock', ''];
  b.append(sect('Team',
    h('div', { class: 'list-row' }, h('span', { html: icon('users', 18) }), h('div', { class: 'grow' }, h('b', {}, S.team.name), h('div', { class: 'hint', style: { margin: 0 } }, 'Map: ' + (S.team.folder || '—'))),
      h('span', { class: 'badge' }, h('span', { html: icon(st[0], 11), style: { display: 'inline-block', verticalAlign: '-1px', marginRight: '3px' } }), st[1])),
    Team.status === 'perm' ? h('button', { class: 'btn primary sm', onclick: teamReconnect }, 'Teammap koppelen') : null,
    Team.status === 'locked' ? h('button', { class: 'btn primary sm', onclick: teamUnlockDialog }, 'Wachtwoord invullen') : null,
    Team.status === 'error' ? [h('p', { class: 'hint' }, Team.error), h('button', { class: 'btn sm', onclick: () => teamPickExisting(true) }, 'Teammap opnieuw kiezen')] : null));
  if (Team.status === 'ok') {
    b.append(sect('Jouw profiel', h('button', { class: 'member', onclick: profileDialog }, avatarEl(meId(), 38), h('span', { class: 'grow' }, h('b', {}, memberName(meId())), h('small', {}, 'Naam en foto aanpassen')), h('span', { html: icon('pencil', 15) }))));
    b.append(sect('Leden', h('div', { class: 'members' }, membersList().map(m => h('div', { class: 'member' }, avatarEl(m.id, 30), h('span', { class: 'grow' }, h('b', {}, m.name + (m.id === meId() ? ' (jij)' : '')), h('small', {}, m.id === Team.meta?.creator ? 'maker van het team' : '')))))));
  }
  b.append(sect('E-mails in teamtaken',
    h('div', { class: 'field' }, h('label', {}, 'Inhoud en bijlagen van gesleepte e-mails delen'), segCtl([['ask', 'Elke keer vragen'], ['on', 'Standaard aan'], ['off', 'Standaard uit']], S.team.shareMail || 'ask', v => { S.team.shareMail = v; save(); }))));
  const page = S.pages.find(x => x.team);
  b.append(sect('Beheer',
    h('div', { class: 'row', style: { flexWrap: 'wrap' } },
      page ? null : h('button', { class: 'btn sm', onclick: () => { teamPage(true); save(); renderAll(); renderSettings(); } }, 'Team-tabblad terugzetten'),
      Team.status === 'ok' && Team.meta?.creator === meId() ? h('button', { class: 'btn sm', onclick: teamPasswordDialog }, h('span', { html: icon('key', 14) }), 'Wachtwoord wijzigen') : null,
      h('button', { class: 'btn sm', onclick: () => teamInviteInfo(S.team.folder || 'Streamline team') }, 'Collega’s uitnodigen'),
      h('button', { class: 'btn sm danger', onclick: teamLeave }, 'Team verlaten')),
    h('p', { class: 'hint' }, 'De indeling van het team-tabblad is persoonlijk en staat in je eigen instellingenbestand. De taken zelf zijn voor het hele team.')));
}

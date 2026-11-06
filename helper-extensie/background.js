// Streamline Helper — voert de stappen van een Actieknop uit.
// Er wordt niets verstuurd of opgeslagen; de extensie opent alleen tabbladen en
// voert de stappen uit die jij zelf in Streamline hebt ingesteld.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'streamline-run' || !sender.tab) return;
  const back = data => chrome.tabs.sendMessage(sender.tab.id, { type: 'streamline-run-status', id: msg.id, ...data }).catch(() => {});
  run(msg.steps || []).then(() => back({ done: true })).catch(e => back({ error: e.message || String(e) }));
  sendResponse({ ok: true });
});

// Wachten zonder dat Chrome de extensie halverwege in slaap zet.
async function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, Math.min(15000, end - Date.now())));
    await chrome.runtime.getPlatformInfo();
  }
}

function waitLoad(tabId, timeout = 30000) {
  return new Promise(resolve => {
    const done = () => { chrome.tabs.onUpdated.removeListener(fn); clearTimeout(t); resolve(); };
    const fn = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(fn);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') done(); }).catch(done);
  });
}

async function exec(tabId, func, args) {
  if (tabId == null) throw new Error('Begin met een stap “Open website”');
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  if (res && res.result && res.result.error) throw new Error(res.result.error);
  return res && res.result;
}

async function run(steps) {
  let tabId = null;
  for (const st of steps) {
    switch (st.t) {
      case 'open': {
        const tab = await chrome.tabs.create({ url: st.url, active: !st.bg });
        tabId = tab.id;
        await waitLoad(tabId);
        break;
      }
      case 'wait': await sleep(Number(st.ms) || 0); break;
      case 'waitFor': await exec(tabId, pageWaitFor, [st.selector, Number(st.ms) || 10000]); break;
      case 'click': await exec(tabId, pageClick, [st.selector]); break;
      case 'fill': await exec(tabId, pageFill, [st.selector, st.text || '']); break;
      case 'type': await exec(tabId, pageType, [st.text || '']); break;
      case 'key': await exec(tabId, pageKey, [st.key || 'Enter']); break;
    }
  }
}

/* ---- onderstaande functies draaien ín het geopende tabblad ---- */
async function pageWaitFor(sel, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const el = document.querySelector(sel);
    if (el) return { ok: true };
    await new Promise(r => setTimeout(r, 200));
  }
  return { error: 'Element niet gevonden: ' + sel };
}
function pageClick(sel) {
  const el = document.querySelector(sel);
  if (!el) return { error: 'Element niet gevonden: ' + sel };
  el.scrollIntoView({ block: 'center' }); el.focus && el.focus(); el.click();
  return { ok: true };
}
function pageFill(sel, text) {
  const el = document.querySelector(sel);
  if (!el) return { error: 'Veld niet gevonden: ' + sel };
  el.focus();
  if (el.isContentEditable) { document.execCommand('selectAll'); document.execCommand('insertText', false, text); return { ok: true }; }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}
function pageType(text) {
  const el = document.activeElement;
  if (!el || el === document.body) return { error: 'Er is geen actief invoerveld. Gebruik eerst “Klik op element” of “Vul veld in”.' };
  if (!document.execCommand('insertText', false, text)) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!d) return { error: 'Kan hier niet typen' };
    d.set.call(el, (el.value || '') + text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { ok: true };
}
function pageKey(combo) {
  const parts = combo.split('+'), key = parts.pop();
  const mods = { ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt') };
  const map = { Enter: 13, Tab: 9, Escape: 27, Space: 32, Backspace: 8, Delete: 46, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, A: 65 };
  const k = key === 'Space' ? ' ' : key.length === 1 ? key.toLowerCase() : key;
  const el = document.activeElement || document.body;
  const opts = { key: k, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, keyCode: map[key] || 0, which: map[key] || 0, bubbles: true, cancelable: true, ...mods };
  const okDown = el.dispatchEvent(new KeyboardEvent('keydown', opts));
  if (key === 'Enter' || key === 'Space') el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
  if (!okDown) return { ok: true }; // de website heeft de toets zelf afgehandeld
  // nagebootste standaardgedrag (browsers voeren dit niet uit voor gesimuleerde toetsen)
  if (key === 'Enter' && !mods.ctrlKey) {
    if (el.form) { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); }
    else if (el.tagName === 'TEXTAREA' || el.isContentEditable) document.execCommand('insertText', false, '\n');
    else if (el.click && /^(A|BUTTON)$/.test(el.tagName)) el.click();
  } else if (key === 'Tab') {
    const f = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]')].filter(x => !x.disabled && x.offsetParent !== null);
    const i = f.indexOf(el); const n = f[(i + (mods.shiftKey ? -1 : 1) + f.length) % f.length]; n && n.focus();
  } else if (key === 'A' && mods.ctrlKey) { el.select ? el.select() : document.execCommand('selectAll'); }
  else if (key === 'Backspace') document.execCommand('delete');
  else if (key === 'Delete') document.execCommand('forwardDelete');
  else if (key === 'Space') document.execCommand('insertText', false, ' ');
  return { ok: true };
}

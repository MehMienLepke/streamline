// Brug tussen de Streamline-pagina (lokaal bestand) en de extensie.
// Doet alleen iets op pagina's die zichzelf als Streamline herkenbaar maken.
if (document.querySelector('meta[name="streamline-app"]')) {
  document.documentElement.dataset.streamlineHelper = chrome.runtime.getManifest().version;
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.type !== 'streamline-run') return;
    chrome.runtime.sendMessage({ type: 'streamline-run', id: e.data.id, steps: e.data.steps });
  });
  chrome.runtime.onMessage.addListener(m => {
    if (m && m.type === 'streamline-run-status') window.postMessage(m, '*');
  });
}

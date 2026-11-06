/* Voorbeeld-uitbreiding voor Streamline: een klok met datum.
   Kopieer dit bestand als basis voor je eigen widgets en zet ze in widgets/registry.json. */
(() => {
  const { h, icon } = Streamline;
  const timers = new Map();
  Streamline.registerWidget({
    type: 'klok',                  // unieke naam, nooit meer wijzigen
    name: 'Klok',
    desc: 'Grote klok met de datum van vandaag',
    icon: 'clock',
    group: 'uitbreiding',
    size: { w: 5, h: 3 },          // standaardgrootte in rastervakjes
    min: { w: 3, h: 2 },
    defaults: { title: '', seconds: false, showDate: true },
    fields: [
      { key: 'title', label: 'Kop (optioneel)', type: 'text' },
      { key: 'seconds', label: 'Seconden tonen', type: 'checkbox' },
      { key: 'showDate', label: 'Datum tonen', type: 'checkbox' },
    ],
    render(el, ctx) {
      const c = ctx.config;
      const time = h('div', { style: { font: '600 44px var(--font-display)', letterSpacing: '.02em', lineHeight: 1 } });
      const date = h('div', { style: { color: 'var(--muted)', marginTop: '6px', textTransform: 'capitalize' } });
      el.append(h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' } }, time, c.showDate ? date : null));
      const tick = () => {
        const d = new Date();
        time.textContent = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: c.seconds ? '2-digit' : undefined });
        date.textContent = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      };
      tick();
      clearInterval(timers.get(ctx.item.id));
      timers.set(ctx.item.id, setInterval(tick, 1000));
    },
    destroy(item) { clearInterval(timers.get(item.id)); },
  });
})();

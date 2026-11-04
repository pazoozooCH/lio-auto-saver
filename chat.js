// Chat beim freien Fahren online (Stadt, Stuntpark): Schnell-Nachrichten (feste Sprüche) überall, freier Text nur in
// privaten Räumen (dort sind nur Leute, die den Code bekommen haben). Ohne Wortfilter – so entschieden, solange das
// Spiel nur im Freundeskreis läuft. Regeln: rooms/<CODE>/chat/<Platz> = { m: Spruch-Nummer | x: Text (≤ 80), t }, ≤ 1/s.
// net (von online.js): { mySlot, players(), chats() → { slot: { m | x, t } }, chat(m), canType, chatText(text) }
export const QUICK = [
  '👋 Hallo!', '😂', '👍', '🔥 Cool!', '😎 Folg mir!', '🏁 Wettrennen?', '📍 Wo bist du?', '⏳ Warte auf mich!',
  '🤸 Schau mal!', '🎢 Komm zum Looping!', '🚓 Achtung, Polizei!', '💥 Autsch!', '😮 Wow!', '🙌 Gut gemacht!', '❤️', '👋 Tschüss!',
];
// welche Sprüche wo passen (Nummern in QUICK)
const FOR = { city: [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15], stunt: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15] };

const CSS = `
.qchat-btn { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); height: 46px; padding: 0 16px; border-radius: 23px;
  border: 3px solid rgba(255,255,255,.65); background: rgba(0,0,0,.45); color: #fff; font: 800 20px system-ui, sans-serif; touch-action: none; }
.qchat-btn.new { border-color: #facc15; }
.qchat-panel { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); width: min(560px, 92%); display: flex; flex-wrap: wrap;
  gap: 6px; justify-content: center; background: rgba(15,18,28,.88); border-radius: 14px; padding: 10px; z-index: 5; }
.qchat-panel[hidden] { display: none; }
.qchat-panel button { border: none; border-radius: 10px; background: #334155; color: #fff; font: 700 17px system-ui, sans-serif; padding: 9px 12px; touch-action: none; }
.qchat-panel form { display: flex; gap: 6px; width: 100%; }
.qchat-panel input { flex: 1; min-width: 0; border-radius: 10px; border: 1px solid #475569; background: #0e1118; color: #fff;
  font: 600 17px system-ui, sans-serif; padding: 9px 12px; }
.qchat-panel form button { background: #16a34a; }
.qchat-log { position: absolute; left: 12px; bottom: 124px; max-width: 46%; pointer-events: none; font: 700 16px system-ui, sans-serif; }
.qchat-log div { background: rgba(0,0,0,.55); border-radius: 10px; padding: 4px 10px; margin-top: 4px; transition: opacity .6s; }
.qchat-log b { margin-right: 6px; }
`;
let styled = false;

// parent: Bedienoberfläche des Modus; onSay(slot, text): Sprechblase über dem Auto zeigen
export function makeChat({ parent, net, mode, onSay = () => {} }) {
  if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
  const btn = document.createElement('button'), panel = document.createElement('div'), log = document.createElement('div');
  btn.className = 'qchat-btn'; btn.textContent = '💬 Chat';
  panel.className = 'qchat-panel'; panel.hidden = true;
  log.className = 'qchat-log';
  const list = FOR[mode] || FOR.city;
  panel.innerHTML = (net.canType ? '<form><input maxlength="80" placeholder="Nachricht schreiben …" enterkeyhint="send" autocomplete="off"><button>Senden</button></form>' : '')
    + list.map(i => `<button type="button" data-m="${i}">${QUICK[i]}</button>`).join('');
  const input = panel.querySelector('input');
  parent.append(btn, panel, log);
  const seen = {}; // slot → Zeit der zuletzt gezeigten Nachricht
  const chats0 = net.chats() || {};
  for (const s of Object.keys(chats0)) seen[s] = chats0[s].t; // alte Nachrichten nicht nochmals zeigen
  let lastSend = 0;
  const lines = [];

  const show = (name, text, mine) => {
    const d = document.createElement('div');
    d.innerHTML = `<b style="color:${mine ? '#facc15' : '#7dd3fc'}"></b>`;
    d.firstChild.textContent = name + ':';
    d.append(text);
    log.append(d);
    lines.push({ el: d, t: 9 });
    while (lines.length > 5) lines.shift().el.remove();
  };
  const send = m => { // m: Nummer eines Spruchs oder Text
    const now = Date.now();
    if (now - lastSend < 1100) return; // die Datenbank nimmt höchstens eine Nachricht pro Sekunde
    if (typeof m === 'string') { m = m.trim().slice(0, 80); if (!m) return; net.chatText(m); input.value = ''; }
    else net.chat(m);
    lastSend = now;
    close();
  };
  const close = () => { panel.hidden = true; if (input) input.blur(); };
  const open = () => { panel.hidden = false; btn.classList.remove('new'); };
  if (input) panel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  btn.addEventListener('pointerdown', e => { e.preventDefault(); if (panel.hidden) open(); else close(); });
  panel.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    e.preventDefault();
    send(+b.dataset.m);
  });
  const onKey = e => { // PC: C öffnet den Chat (mit Textfeld: gleich zum Schreiben), dann 1–9 für die ersten Sprüche
    if (e.type !== 'keydown') return;
    if (e.target === input) { if (e.code === 'Escape') close(); return; }
    if (e.code === 'KeyC') {
      e.preventDefault();
      if (!panel.hidden) close(); else { open(); if (input) input.focus(); }
    } else if (!panel.hidden && /^Digit[1-9]$/.test(e.code)) { const i = list[+e.code.slice(5) - 1]; if (i !== undefined) send(i); }
  };
  window.addEventListener('keydown', onKey);

  return {
    update(dt) {
      const chats = net.chats() || {}, players = net.players() || {};
      for (const s of Object.keys(chats)) {
        const c = chats[s];
        const text = !c ? null : typeof c.x === 'string' ? c.x.slice(0, 80) : QUICK[c.m];
        if (!text || c.t === seen[s]) continue;
        seen[s] = c.t;
        const mine = +s === net.mySlot;
        show(mine ? 'Du' : (players[s] || {}).name || '?', text, mine);
        if (!mine) { onSay(+s, text); if (panel.hidden) btn.classList.add('new'); }
      }
      for (const l of lines) if ((l.t -= dt) <= 0) l.el.style.opacity = '0';
    },
    dispose() { window.removeEventListener('keydown', onKey); btn.remove(); panel.remove(); log.remove(); },
  };
}

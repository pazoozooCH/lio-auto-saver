// Chat beim freien Fahren online (Stadt, Stuntpark): nur feste Schnell-Nachrichten, kein freier Text.
// So kann auch mit Fremden in öffentlichen Räumen niemand etwas Gemeines schreiben – die Datenbank nimmt nur die
// Nummer eines Spruchs an (Regeln: rooms/<CODE>/chat/<Platz> = { m: Nummer, t: Serverzeit }), höchstens einen pro Sekunde.
// net (von online.js): { mySlot, players(), chats() → { slot: { m, t } }, chat(m) }
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
  panel.innerHTML = list.map(i => `<button data-m="${i}">${QUICK[i]}</button>`).join('');
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
  const send = m => {
    const now = Date.now();
    if (now - lastSend < 1100) return; // die Datenbank nimmt höchstens eine Nachricht pro Sekunde
    lastSend = now;
    net.chat(m);
    panel.hidden = true;
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); panel.hidden = !panel.hidden; btn.classList.remove('new'); });
  panel.addEventListener('pointerdown', e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    send(+b.dataset.m);
  });
  const onKey = e => { // PC: C öffnet den Chat, dann 1–9 für die ersten Sprüche
    if (e.type !== 'keydown') return;
    if (e.code === 'KeyC') { panel.hidden = !panel.hidden; btn.classList.remove('new'); }
    else if (!panel.hidden && /^Digit[1-9]$/.test(e.code)) { const i = list[+e.code.slice(5) - 1]; if (i !== undefined) send(i); }
  };
  window.addEventListener('keydown', onKey);

  return {
    update(dt) {
      const chats = net.chats() || {}, players = net.players() || {};
      for (const s of Object.keys(chats)) {
        const c = chats[s];
        if (!c || c.t === seen[s] || !(c.m in QUICK)) continue;
        seen[s] = c.t;
        const mine = +s === net.mySlot, text = QUICK[c.m];
        show(mine ? 'Du' : (players[s] || {}).name || '?', text, mine);
        if (!mine) { onSay(+s, text); if (panel.hidden) btn.classList.add('new'); }
      }
      for (const l of lines) if ((l.t -= dt) <= 0) l.el.style.opacity = '0';
    },
    dispose() { window.removeEventListener('keydown', onKey); btn.remove(); panel.remove(); log.remove(); },
  };
}

// Online spielen: Räume mit Code, alle sehen sich live auf der Rennstrecke oder der Dragster-Bahn.
// Technik: Firebase Realtime Database (Gratis-Plan) mit anonymer Anmeldung; was erlaubt ist, prüfen die
// Sicherheitsregeln in database.rules.json. Einrichtung und Pflege: siehe README.md.
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const CONFIG = {
  apiKey: 'AIzaSyCKvwhj0oQon6pOanQnhqDPY4Z6l87IALI',
  authDomain: 'lio-car-saver-de75a.firebaseapp.com',
  databaseURL: 'https://lio-car-saver-de75a-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'lio-car-saver-de75a',
  appId: '1:377042518173:web:f1184f6da48e2c21509474',
};
const MAX_PLAYERS = { race: 6, drag: 2, city: 6, stunt: 6 };
// Stadt und Stuntpark: freies Fahren ohne gemeinsamen Start – jeder fährt los, wann er will, und sieht die anderen
const FREE = { city: true, stunt: true };
// Rennstrecke im Raum: steckt in round (round = Rennen × 8 + Strecke), so braucht es kein neues Feld in den Regeln
const TRACK_SLOTS = 8;
const trackOf = round => (round || 0) % TRACK_SLOTS;
const raceNo = round => Math.floor((round || 0) / TRACK_SLOTS);
const trackDef = round => (api.tracks || [])[trackOf(round)] || { id: 'gp', name: 'Alpen-Grand-Prix', emoji: '🏔️', km: 1.8, laps: 3 };
const MODE_LABEL = { race: '🏁 Rennen', drag: '🔥 Dragster', city: '🏙️ Stadt', stunt: '🤸 Stuntpark' };
const LS = { name: 'autoRetterOnlineName', key: 'autoRetterFriendKey', car: 'autoRetterOnlineCar', pub: 'autoRetterOnlinePublic' };

let api = null;   // vom Spiel: kinds, fleet(), topSpeed, paintLabel(v), onClose()
let fb = null;    // Firebase: db-Funktionen, uid, Zeitversatz zur Serveruhr
let ui = null;    // Bedienoberfläche
let room = null;  // aktueller Raum: { code, mode, slot, data, unsub, lastRound, racing, results }

const load = (k, d = '') => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } };

// ---------- Verbindung ----------
async function connect() {
  if (fb) return fb;
  const [appM, authM, dbM] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-database.js'].map(f => import(FB + f)));
  const app = appM.initializeApp(CONFIG);
  const auth = authM.getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser || (await authM.signInAnonymously(auth)).user;
  const db = dbM.getDatabase(app);
  fb = { ...dbM, db, uid: user.uid, offset: 0 };
  // Wird das anonyme Konto aufgeräumt (nach 30 Tagen), still neu anmelden
  authM.onAuthStateChanged(auth, u => { if (u) fb.uid = u.uid; else authM.signInAnonymously(auth).catch(() => {}); });
  dbM.onValue(dbM.ref(db, '.info/serverTimeOffset'), s => { fb.offset = s.val() || 0; });
  return fb;
}
const serverNow = () => Date.now() + (fb ? fb.offset : 0);
const roomRef = (code, path = '') => fb.ref(fb.db, 'rooms/' + code + (path ? '/' + path : ''));
const publicRef = (code = '') => fb.ref(fb.db, 'public' + (code ? '/' + code : ''));
let publicWatch = null; // Abo der Liste offener Räume (nur im Online-Menü)

// ---------- Oberfläche ----------
const CSS = `
#online { position: fixed; inset: 0; z-index: 30; overflow-y: auto; background: radial-gradient(circle at 30% 0%, #26304a, #14161c 70%);
  color: #fff; font-family: system-ui, sans-serif; display: flex; justify-content: center; padding: 18px 14px 30px; box-sizing: border-box; }
#online[hidden] { display: none; }
#online .wrap { width: 100%; max-width: 760px; }
#online h1 { margin: 4px 0 14px; font-size: 30px; }
#online .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 640px) { #online .cols { grid-template-columns: 1fr; } }
#online .box { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; }
#online .box b { display: block; margin-bottom: 8px; font-size: 18px; }
#online label { display: block; font-size: 14px; color: #c9d1e3; margin: 6px 0 10px; }
#online input, #online select { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px; font-size: 17px;
  border-radius: 10px; border: 1px solid #3b4560; background: #0e1118; color: #fff; }
#online button { font: 800 17px system-ui, sans-serif; color: #fff; border: 2px solid rgba(255,255,255,0.35); border-radius: 12px;
  padding: 11px 14px; margin: 4px 6px 4px 0; cursor: pointer; background: #3657b8; }
#online button.race { background: #c0392b; } #online button.drag { background: #d35400; }
#online button.city { background: #6d28d9; } #online button.stunt { background: #db2777; } #online button.go { background: #21a35b; font-size: 22px; padding: 14px 26px; }
#online button.grey { background: #4b5563; } #online button:disabled { opacity: 0.45; cursor: default; }
#online .code { font-size: 40px; letter-spacing: 6px; color: #ffd166; user-select: all; }
#online .players { list-style: none; padding: 0; margin: 0; }
#online .players li { display: flex; justify-content: space-between; padding: 9px 4px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 17px; }
#online .players li.me { color: #ffd166; }
#online .status { min-height: 22px; margin: 10px 0; color: #ffb4a8; font-weight: 700; }
#online .hint { color: #9aa4b8; font-size: 14px; }
#online .check { display: flex; align-items: center; gap: 8px; color: #fff; font-size: 16px; }
#online .check input { width: 22px; height: 22px; margin: 0; display: inline-block; }
#online .rooms button { display: flex; justify-content: space-between; width: 100%; text-align: left; background: #1f2a44; margin: 6px 0; }
#online .rooms button small { color: #9aa4b8; font-weight: 700; }
#online .trackrow { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
#online .trackrow button { margin: 0; padding: 8px 16px; font-size: 20px; } #online .temoji { font-size: 30px; vertical-align: middle; }
#online .badge { font-size: 15px; background: #0e7490; border-radius: 8px; padding: 3px 8px; margin-left: 8px; vertical-align: middle; }
#online table { width: 100%; border-collapse: collapse; font-size: 17px; }
#online td { padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
`;

function buildUi() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'online';
  root.innerHTML = '<div class="wrap"></div>';
  document.body.appendChild(root);
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (b && !b.disabled) ACTIONS[b.dataset.act](b);
  });
  return { root, wrap: root.querySelector('.wrap') };
}

// Text sicher einsetzen (Namen kommen von anderen Spielern)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const carLabel = v => (api.kinds[v.kind] ? api.kinds[v.kind].name : v.kind) + (v.special ? ' ' + api.paintLabel(v) : '') + ' · ' + v.ps + ' PS';
function status(text) { const s = ui.wrap.querySelector('.status'); if (s) s.textContent = text || ''; }

function showHome(msg = '') {
  const fleet = api.fleet(), chosen = load(LS.car);
  ui.wrap.innerHTML = `
    <h1>🌍 Online spielen</h1>
    <div class="box">
      <label>Dein Spitzname <input id="on-name" maxlength="16" value="${esc(load(LS.name))}" placeholder="z.B. Turbo-Lio"></label>
      <label>Dein Auto <select id="on-car">${fleet.map(v => `<option value="${esc(v.id)}"${v.id === chosen ? ' selected' : ''}>${esc(carLabel(v))}</option>`).join('')}</select></label>
    </div>
    <div class="cols">
      <div class="box"><b>Raum erstellen</b>
        <label>Freundes-Schlüssel <input id="on-key" value="${esc(load(LS.key))}" placeholder="bekommst du von den Eltern" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="check"><input type="checkbox" id="on-public"${load(LS.pub) === '1' ? ' checked' : ''}> 🌍 Öffentlich (alle sehen den Raum)</label>
        <button class="race" data-act="create" data-mode="race">🏁 Rennen (2–6)</button>
        <button class="drag" data-act="create" data-mode="drag">🔥 Dragster (1 gegen 1)</button>
        <button class="city" data-act="create" data-mode="city">🏙️ Stadt (bis 6)</button>
        <button class="stunt" data-act="create" data-mode="stunt">🤸 Stuntpark (bis 6)</button>
      </div>
      <div class="box"><b>Raum beitreten</b>
        <label>Raum-Code <input id="on-code" placeholder="z.B. 4821" autocomplete="off" inputmode="numeric" maxlength="4"></label>
        <button data-act="join">➜ Beitreten</button>
      </div>
    </div>
    <div class="box"><b>🌍 Offene Räume</b><div class="rooms"><p class="hint">Suche …</p></div></div>
    <div class="status"></div>
    <button class="grey" data-act="back">← Zurück</button>
    <p class="hint">Online gibt es keine Autos zu gewinnen oder zu verlieren – nur Ruhm! 🏆</p>`;
  status(msg);
  watchPublic();
}

// Liste der öffentlichen Räume live anzeigen; Antippen = beitreten
function watchPublic() {
  if (publicWatch) return;
  publicWatch = 'starting';
  connect().then(() => {
    if (publicWatch !== 'starting') return;
    publicWatch = fb.onValue(publicRef(), snap => renderPublic(snap.val() || {}), () => renderPublic(null));
  }).catch(() => { publicWatch = null; renderPublic(null); });
}
function stopPublic() {
  if (typeof publicWatch === 'function') publicWatch();
  publicWatch = null;
}
function renderPublic(list) {
  const box = ui.wrap.querySelector('.rooms');
  if (!box) return;
  if (!list) { box.innerHTML = '<p class="hint">Offline – keine Liste.</p>'; return; }
  const fresh = Object.entries(list).filter(([, r]) => r && r.created > serverNow() - 3 * 3600 * 1000)
    .sort((a, b) => b[1].created - a[1].created).slice(0, 12);
  box.innerHTML = fresh.length ? fresh.map(([code, r]) => {
    const full = r.n >= (MAX_PLAYERS[r.mode] || 6);
    return `<button data-act="join" data-code="${esc(code)}"${full ? ' disabled' : ''}><span>${MODE_LABEL[r.mode] || r.mode} von ${esc(r.name)}</span>
      <small>${r.n}/${MAX_PLAYERS[r.mode] || 6}${r.state === 'running' ? ' · fährt gerade' : ''}${full ? ' · voll' : ''}</small></button>`;
  }).join('') : '<p class="hint">Gerade gibt es keine offenen Räume. Erstell doch selber einen! 😊</p>';
}

// Eingaben lesen und merken
function readForm() {
  const name = ui.wrap.querySelector('#on-name').value.trim().slice(0, 16);
  const carId = ui.wrap.querySelector('#on-car').value;
  const v = api.fleet().find(f => f.id === carId);
  if (!name) { status('Bitte gib einen Spitznamen ein.'); return null; }
  if (!v) { status('Bitte wähle ein Auto.'); return null; }
  store(LS.name, name);
  store(LS.car, carId);
  const me = { name, kind: v.kind, color: String(v.color || '#888888').slice(0, 10), ps: Math.min(1000, Math.max(0, Math.round(v.ps))) };
  if (v.special) me.special = v.special;
  return me;
}

function busy(on) { ui.wrap.querySelectorAll('button').forEach(b => { b.disabled = on; }); }

const ACTIONS = {
  back: () => { close(); },
  async create(b) {
    const me = readForm();
    if (!me) return;
    // Gross-/Kleinschreibung egal (Handy-Tastaturen schreiben gern den ersten Buchstaben gross)
    const key = ui.wrap.querySelector('#on-key').value.trim().toLowerCase().replace(/\s+/g, '');
    if (!key) { status('Zum Erstellen brauchst du den Freundes-Schlüssel.'); return; }
    store(LS.key, key);
    const isPublic = ui.wrap.querySelector('#on-public').checked;
    store(LS.pub, isPublic ? '1' : '0');
    busy(true); status('Verbinde …');
    try {
      await connect();
      const mode = b.dataset.mode;
      for (let tries = 0; tries < 8; tries++) {
        const code = String(1000 + Math.floor(Math.random() * 9000)); // vier Ziffern: schnell eingetippt
        if ((await fb.get(roomRef(code))).exists()) continue;
        await fb.set(roomRef(code), { host: fb.uid, key, created: fb.serverTimestamp(), mode, state: 'lobby', round: 0, players: { 0: { uid: fb.uid, ...me } } });
        if (isPublic) { // in die öffentliche Liste eintragen (verschwindet mit dem Raum)
          await fb.set(publicRef(code), { mode, name: me.name, n: 1, state: 'lobby', created: fb.serverTimestamp() });
          await fb.onDisconnect(publicRef(code)).remove();
        }
        await enterRoom(code, 0, true, 0, isPublic);
        return;
      }
      status('Kein freier Raum-Code gefunden – nochmal versuchen.');
    } catch (err) {
      console.error(err);
      status(/permission/i.test(err.message) ? 'Der Freundes-Schlüssel stimmt nicht. 🔑 (Oder die App ist veraltet: Update-Knopf auf dem Startbildschirm.)' : 'Keine Verbindung – braucht Internet.');
    }
    busy(false);
  },
  async join(b) {
    const me = readForm();
    if (!me) return;
    const code = (b && b.dataset.code) || ui.wrap.querySelector('#on-code').value.replace(/\D/g, '');
    if (!/^[0-9]{4}$/.test(code)) { status('Der Raum-Code hat 4 Ziffern, z.B. 4821'); return; }
    busy(true); status('Verbinde …');
    try {
      await connect();
      const snap = await fb.get(roomRef(code));
      if (!snap.exists()) { status('Diesen Raum gibt es nicht (mehr).'); busy(false); return; }
      const data = snap.val(), players = data.players || {};
      let slot = Object.keys(players).find(s => players[s].uid === fb.uid);
      if (slot === undefined) {
        for (let s = 0; s < MAX_PLAYERS[data.mode]; s++) {
          if (players[s]) continue;
          try { await fb.set(roomRef(code, 'players/' + s), { uid: fb.uid, ...me }); slot = s; break; } catch (e) { /* gerade besetzt */ }
        }
      } else await fb.set(roomRef(code, 'players/' + slot), { uid: fb.uid, ...me });
      if (slot === undefined) { status('Der Raum ist schon voll.'); busy(false); return; }
      await enterRoom(code, +slot, false, data.round || 0);
    } catch (err) {
      console.error(err);
      status('Keine Verbindung – braucht Internet.');
      busy(false);
    }
  },
  start: () => {
    const d = room.data, n = Object.keys(d.players || {}).length;
    if (n < 2) return;
    // etwas mehr Vorlauf: die grossen Strecken brauchen auf dem Handy ein paar Sekunden zum Aufbauen
    fb.update(roomRef(room.code), { state: 'running', start: serverNow() + (d.mode === 'race' ? 7000 : 4000),
      round: (raceNo(d.round) + 1) * TRACK_SLOTS + trackOf(d.round) }).catch(e => status(e.message));
  },
  track(b) { // Gastgeber wählt die Strecke (nur zwischen den Rennen)
    const d = room.data, n = (api.tracks || []).length;
    if (!n || d.host !== fb.uid || d.state !== 'lobby') return;
    const t = (trackOf(d.round) + +b.dataset.dir + n) % n;
    fb.update(roomRef(room.code), { round: raceNo(d.round) * TRACK_SLOTS + t }).catch(e => status(e.message));
  },
  leave: () => leaveRoom(true),
  drive: () => { if (room && room.data && FREE[room.data.mode] && !room.racing) launchFree(room.data); },
};

// ---------- Raum ----------
async function enterRoom(code, slot, host, lastRound = 0, isPublic = false) {
  stopPublic();
  room = { code, slot, host, data: null, lastRound, racing: false, results: null, public: isPublic, pubN: 1, pubState: 'lobby' };
  // Bricht die Verbindung ab, räumt Firebase selbst auf: eigener Platz weg, als Gastgeber der ganze Raum
  await fb.onDisconnect(roomRef(code, 'live/' + slot)).remove();
  await fb.onDisconnect(roomRef(code, 'players/' + slot)).remove();
  await fb.onDisconnect(roomRef(code, 'chat/' + slot)).remove().catch(() => {}); // (ohne neue Regeln abgelehnt – egal)
  if (host) await fb.onDisconnect(roomRef(code)).remove();
  room.unsub = fb.onValue(roomRef(code), snap => onRoom(snap.val()), err => { console.error(err); leaveRoom(false, 'Verbindung zum Raum verloren.'); });
}

function onRoom(data) {
  if (!room) return;
  if (!data) { leaveRoom(false, 'Der Raum wurde geschlossen.'); return; }
  room.data = data;
  room.mode = data.mode;
  if (room.public && data.host === fb.uid) { // öffentliche Liste aktuell halten: Spielerzahl, läuft gerade?
    const n = Object.keys(data.players || {}).length;
    if (n !== room.pubN || data.state !== room.pubState) {
      room.pubN = n; room.pubState = data.state;
      fb.update(publicRef(room.code), { n, state: data.state }).catch(() => {});
    }
  }
  if (data.state === 'running' && data.round > room.lastRound && data.players && data.players[room.slot]) {
    room.lastRound = data.round;
    launch(data);
    return;
  }
  if (!room.racing) showRoom();
}

function showRoom() {
  const d = room.data, players = d.players || {}, slots = Object.keys(players).sort();
  const isHost = d.host === fb.uid, n = slots.length, max = MAX_PLAYERS[d.mode];
  const ready = d.mode === 'drag' ? n === 2 : n >= 2, free = FREE[d.mode];
  const driving = free ? Object.keys(players).filter(s => { const l = d.live && d.live[s]; return l && l.r === 0 && serverNow() - l.t < 5000; }).length : 0;
  ui.wrap.innerHTML = `
    <h1>${MODE_LABEL[d.mode] || d.mode} online${room.public ? '<span class="badge">🌍 öffentlich</span>' : ''}</h1>
    <div class="box"><b>Raum-Code</b><div class="code">${esc(room.code)}</div>
      <p class="hint">${room.public ? 'Der Raum steht bei allen unter „Offene Räume“. Du kannst den Code auch direkt weitergeben.' : 'Schick diesen Code deinen Freunden. Sie tippen ihn unter „Raum beitreten“ ein.'}</p></div>
    <div class="box"><b>Spieler (${n}/${max})</b><ul class="players">${slots.map(s => {
      const p = players[s];
      return `<li class="${+s === room.slot ? 'me' : ''}"><span>${p.uid === d.host ? '👑 ' : ''}${esc(p.name)}</span><span>${esc(carLabel(p))}</span></li>`;
    }).join('')}</ul></div>
    ${d.mode === 'race' ? (() => { const tr = trackDef(d.round); return `<div class="box track"><b>Strecke</b>
      <div class="trackrow">${isHost && d.state === 'lobby' ? '<button class="grey" data-act="track" data-dir="-1">◀</button>' : ''}
      <span><span class="temoji">${tr.emoji}</span> <b>${esc(tr.name)}</b><br><small>${tr.km.toFixed(1)} km · ${tr.laps} Runden</small></span>
      ${isHost && d.state === 'lobby' ? '<button class="grey" data-act="track" data-dir="1">▶</button>' : ''}</div>
      ${isHost ? '' : '<p class="hint">👑 wählt die Strecke.</p>'}</div>`; })() : ''}
    ${room.results ? resultsHtml() : ''}
    <div class="status"></div>
    ${free ? `<button class="go" data-act="drive">▶ Losfahren</button>
      <p class="hint">${driving ? '🚗 ' + driving + ' fahren schon herum. ' : ''}Jeder fährt los, wann er will – wer schon fährt, sieht dich sofort.</p>`
    : isHost ? `<button class="go" data-act="start"${ready ? '' : ' disabled'}>▶ ${room.results ? 'Nochmal fahren' : 'Start'}</button>`
      : '<p class="hint">Warte, bis 👑 das Rennen startet …</p>'}
    <button class="grey" data-act="leave">Raum verlassen</button>
    ${isHost && !ready && !free ? `<p class="hint">${d.mode === 'drag' ? 'Für den Dragster braucht es genau 2 Spieler.' : 'Es braucht mindestens 2 Spieler.'}</p>` : ''}
    ${d.mode === 'race' && n < max ? `<p class="hint">🤖 Die ${max - n} freien Plätze fahren Bots – es sind immer 6 Autos auf der Strecke.</p>` : ''}`;
}

function resultsHtml() {
  const r = room.results;
  const rows = r.rows.map((row, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'}</td><td>${esc(row.name)}${row.me ? ' (du)' : ''}</td><td>${esc(row.kind)}</td><td style="text-align:right">${row.time ? row.time.toFixed(2) + ' s' : '–'}</td></tr>`).join('');
  return `<div class="box"><b>Ergebnis ${r.mode === 'race' ? 'Rennen ' + raceNo(r.round) + ' · ' + esc(trackDef(r.round).name) : 'Runde ' + raceNo(r.round)}</b><table>${rows}</table></div>`;
}

async function leaveRoom(byUser, msg = '') {
  if (!room) { showHome(msg); return; }
  const r = room;
  room = null;
  if (r.unsub) r.unsub();
  try {
    if (r.data && r.data.host === fb.uid) {
      if (r.public) { await fb.remove(publicRef(r.code)); await fb.onDisconnect(publicRef(r.code)).cancel(); }
      await fb.remove(roomRef(r.code));
    } else {
      await fb.remove(roomRef(r.code, 'chat/' + r.slot)).catch(() => {});
      await fb.remove(roomRef(r.code, 'live/' + r.slot)); await fb.remove(roomRef(r.code, 'players/' + r.slot));
    }
    for (const p of ['live/' + r.slot, 'players/' + r.slot, '']) await fb.onDisconnect(roomRef(r.code, p)).cancel();
    await fb.onDisconnect(roomRef(r.code, 'chat/' + r.slot)).cancel().catch(() => {});
  } catch (e) { /* Raum ist vielleicht schon weg */ }
  if (!r.racing) showHome(msg);
}

// ---------- Rennen starten ----------
function vehicleOf(p) {
  const kind = api.kinds[p.kind] ? p.kind : 'car';
  return { kind, color: p.color, special: p.special || null, ps: p.ps };
}

// Bots für die freien Startplätze im Rennen (bis 6 Autos). Alle Geräte rechnen sie aus Raum-Code und Runde
// gleich aus: gleiche Fahrzeuge, PS wie die Spieler im Schnitt, gleicher Zufall beim Fahren (seed)
const BOT_NAMES = ['🤖 Robo-Ruedi', '🤖 Turbo-Tina', '🤖 Chip-Chiara', '🤖 Bolt-Beni', '🤖 Pixel-Pia', '🤖 Byte-Bruno'];
const BOT_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#8338ec', '#ffbe0b', '#06d6a0', '#ef476f'];
function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function botsFor(players, code, round) {
  const taken = new Set(Object.keys(players).map(Number));
  let a = seedOf('bots:' + code + ':' + round);
  const rnd = () => { a = Math.imul(a ^ (a >>> 15), 2246822507) + 0x9e3779b9 >>> 0; return (a >>> 8) / 16777216; };
  const pool = Object.keys(api.kinds).filter(k => api.kinds[k].tier !== 'legendary').sort();
  const ps = Object.values(players).map(p => p.ps || 0), avg = ps.reduce((x, y) => x + y, 0) / Math.max(1, ps.length);
  const names = [...BOT_NAMES];
  const bots = [];
  for (let slot = 0; slot < MAX_PLAYERS.race; slot++) {
    if (taken.has(slot)) continue;
    const kind = pool[Math.floor(rnd() * pool.length)];
    const name = names.splice(Math.floor(rnd() * names.length), 1)[0];
    bots.push({ slot, name, kind, color: api.kinds[kind].color || BOT_COLORS[Math.floor(rnd() * BOT_COLORS.length)], special: null,
      ps: Math.max(30, Math.round(avg * (0.8 + rnd() * 0.3))) });
  }
  return bots;
}

async function launch(data) {
  const round = data.round, players = data.players, mySlot = room.slot, code = room.code;
  const others = Object.keys(players).filter(s => +s !== mySlot).map(s => ({ slot: +s, name: players[s].name, v: vehicleOf(players[s]) }));
  const myV = { ...vehicleOf(players[mySlot]), id: 'online', name: players[mySlot].name };
  const net = {
    mySlot, startAt: data.start, round, serverNow, remotes: others, seed: seedOf('race:' + code + ':' + round),
    send(s) { fb.set(roomRef(code, 'live/' + mySlot), { ...s, r: round, t: fb.serverTimestamp() }).catch(() => {}); },
    latest(slot) {
      const l = room && room.data && room.data.live && room.data.live[slot];
      return l && l.r === round ? l : null;
    },
  };
  room.racing = true;
  ui.root.hidden = true;
  const done = res => {
    ui.root.hidden = false;
    if (!room) { showHome('Der Raum wurde geschlossen.'); return; }
    room.racing = false;
    if (!res.quit) room.results = { round, mode: data.mode, rows: resultRows(res, data, round) };
    if (room.data && room.data.host === fb.uid && room.data.state === 'running') fb.update(roomRef(code), { state: 'lobby' }).catch(() => {});
    showRoom();
  };
  try {
    if (data.mode === 'race') {
      const m = await import('./race.js');
      m.startRace({ player: myV, opponents: botsFor(players, code, round), kinds: api.kinds, topSpeed: api.topSpeed, onFinish: done, net,
        track: trackDef(round).id });
    } else {
      const m = await import('./drag.js');
      const opp = others[0];
      m.startDrag({ player: myV, opponent: { ...opp.v, name: opp.name }, skill: 0.5, kinds: api.kinds, topSpeed: api.topSpeed, onFinish: done,
        net: { ...net, oppSlot: opp.slot, latest: () => net.latest(opp.slot) } });
    }
  } catch (err) {
    console.error(err);
    room.racing = false;
    ui.root.hidden = false;
    showRoom();
    status('Die 3D-Strecke konnte nicht geladen werden.');
  }
}

// Stadt oder Stuntpark: losfahren; zurück im Raum verschwindet das eigene Auto bei den anderen
async function launchFree(data) {
  const mySlot = room.slot, code = room.code, players = data.players || {};
  const myV = { ...vehicleOf(players[mySlot]), id: 'online', name: players[mySlot].name };
  const net = {
    mySlot, serverNow,
    players: () => (room && room.data && room.data.players) || {},
    chats: () => (room && room.data && room.data.chat) || {},
    chat(m) { fb.set(roomRef(code, 'chat/' + mySlot), { m, t: fb.serverTimestamp() }).catch(() => {}); }, // nur die Nummer eines Spruchs (chat.js)
    send(s) { fb.set(roomRef(code, 'live/' + mySlot), { ...s, r: 0, t: fb.serverTimestamp() }).catch(() => {}); },
    latest(slot) {
      const l = room && room.data && room.data.live && room.data.live[slot];
      return l && l.r === 0 ? l : null;
    },
  };
  room.racing = true;
  ui.root.hidden = true;
  const done = () => {
    ui.root.hidden = false;
    fb.remove(roomRef(code, 'live/' + mySlot)).catch(() => {});
    if (!room) { showHome('Der Raum wurde geschlossen.'); return; }
    room.racing = false;
    showRoom();
  };
  try {
    if (data.mode === 'city') (await import('./city.js')).startCity({ player: myV, kinds: api.kinds, topSpeed: api.topSpeed, onExit: done, net });
    else (await import('./stunt.js')).startStunt({ player: myV, kinds: api.kinds, topSpeed: api.topSpeed, onExit: done, net });
  } catch (err) {
    console.error(err);
    room.racing = false;
    ui.root.hidden = false;
    showRoom();
    status('Das konnte nicht geladen werden – braucht Internet.');
  }
}

// Ergebnisliste aus den gemeldeten Zielzeiten aller Spieler
function resultRows(res, data, round) {
  const live = (room && room.data && room.data.live) || {};
  const rows = Object.keys(data.players).map(s => {
    const p = data.players[s], l = live[s] && live[s].r === round ? live[s] : null;
    let time = l && l.fin ? l.fin : null;
    if (+s === room.slot) time = res.myTime !== undefined ? res.myTime : (res.order || []).find(o => o.isPlayer)?.time || time;
    return { name: p.name, kind: api.kinds[p.kind] ? api.kinds[p.kind].name : p.kind, time, me: +s === room.slot };
  });
  for (const o of res.order || []) if (o.isBot) rows.push({ name: o.name, kind: api.kinds[o.kind] ? api.kinds[o.kind].name : o.kind, time: o.time || null });
  return rows.sort((a, b) => (a.time || 1e9) - (b.time || 1e9));
}

// ---------- Ein- und Ausgang ----------
export function openLobby(gameApi) {
  api = gameApi;
  if (!ui) ui = buildUi();
  ui.root.hidden = false;
  if (room) showRoom(); else showHome();
}

function close() {
  stopPublic();
  ui.root.hidden = true;
  api.onClose();
}

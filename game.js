'use strict';

// ---------- Grundeinstellungen ----------
const W = 960, H = 540;
const ROAD_Y = 420;                 // Fahrbahnoberfläche (Unterkante der Autos)
const PRESS_W = 120;
const PLATE_H = 34;
const PLATE_UP = 170;               // Unterkante der Pressplatte, wenn oben
const PLATE_DOWN = ROAD_Y - 12;     // Unterkante, wenn unten (Auto platt)
const BEAM_Y = 70;
const PRESS_SLOTS = [0.47, 0.80, 0.16]; // Reihenfolge, in der neue Pressen auftauchen
const LEVEL_EVERY = 6;              // so viele Punkte pro Level
const COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5', '#00bbf9', '#f15bb5', '#06d6a0', '#ef476f'];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1, dpr = 1;
let rotated = false; // Hochformat: das Spiel wird um 90° gedreht, damit es immer quer läuft
let press3d = null;  // 3D-Presse (press3d.js), sobald geladen; sonst wird in 2D gezeichnet

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); // mehr Pixel sieht man nicht, kostet aber Zeit
  const vw = window.innerWidth, vh = window.innerHeight;
  rotated = vh > vw;
  scale = rotated ? Math.min(vh / W, vw / H) : Math.min(vw / W, vh / H);
  const cssW = W * scale, cssH = H * scale;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.style.left = (vw - cssW) / 2 + 'px';
  canvas.style.top = (vh - cssH) / 2 + 'px';
  canvas.style.transform = rotated ? 'rotate(90deg)' : 'none';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  if (press3d) press3d.layout(cssW, cssH, (vw - cssW) / 2, (vh - cssH) / 2, canvas.style.transform);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// Bildschirmposition (z.B. Finger) in Spielkoordinaten umrechnen, auch wenn das Spiel gedreht ist
function gamePoint(e) {
  const r = canvas.getBoundingClientRect();
  if (rotated) return { x: ((e.clientY - r.top) / r.height) * W, y: ((r.right - e.clientX) / r.width) * H };
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

// Auf Handys (Android) Vollbild und Querformat erzwingen; geht nur nach einem Antippen
function goLandscape() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => { /* nicht unterstützt (z.B. iPhone): dann dreht resize() das Spiel */ });
}

// ---------- Sound ----------
let actx = null;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function soundOn() { return state !== 'title' && state !== 'over'; }

function beep(freq, dur, type = 'square', vol = 0.06, delay = 0) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

function noise(dur, cutoff, vol) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

// ---------- Spielzustand ----------
let state = 'title';   // title | select | play | over | shop | reveal | admin | racemenu | raceload | race | raceresult | dragmenu | dragload | drag | dragresult | collection
let cars, presses, wrecks, particles, floaters;
// Fahrzeuge dieser Runde: { entry, state: 'pool' | 'road' | 'crushed' }
let roster = [], crushedOrder = [];
let seenKinds, tips, tip;   // Tipps zu Fahrzeugfähigkeiten, je Typ einmal pro Spiel
let coins, coinTimer, coinsThisGame, coinsLeftInLevel;
const COINS_PER_LEVEL = 5;
const COIN_GROUND = ROAD_Y + 28;
let saved, level, spawnTimer, shake, time, overTime;
let best = loadBest();

function loadBest() {
  try { return parseInt(localStorage.getItem('autoRetterBest'), 10) || 0; } catch (e) { return 0; }
}
function storeBest() {
  try { localStorage.setItem('autoRetterBest', String(best)); } catch (e) { /* egal */ }
}

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function carSpeed() { return Math.min(290, 95 + (level - 1) * 22); }
function warnTime() { return Math.max(0.4, 0.95 - level * 0.06); }
// Mindestens so lang, dass ein normales Auto bequem unter der Presse durchkommt
function idleTime() { return (PRESS_W + 120) / carSpeed() + rand(0.2, 2.0); }

function newPress(slot) {
  const p = { x: W * PRESS_SLOTS[slot] - PRESS_W / 2, y: PLATE_UP, phase: 'idle', t: 0, t0: 1, beepT: 0 };
  p.t = p.t0 = idleTime() + 1;
  return p;
}

function reset() {
  cars = []; wrecks = []; particles = []; floaters = [];
  seenKinds = new Set(); tips = []; tip = null;
  coins = []; coinTimer = 3; coinsThisGame = 0; coinsLeftInLevel = COINS_PER_LEVEL;
  saved = 0; level = 1;
  spawnTimer = 0.4; shake = 0; time = 0; overTime = 0;
  presses = [newPress(0)];
}

function pressCount() { return level >= 4 ? 3 : level >= 2 ? 2 : 1; }

// Neue Runde mit den ausgewählten Fahrzeugen aus dem Fahrzeugpark
function start(entries) {
  reset();
  roster = entries.map(entry => ({ entry, state: 'pool' }));
  crushedOrder = [];
  if (press3d) press3d.prepare(entries); // 3D-Autos vorab bauen, damit es beim Erscheinen nicht ruckelt
  state = 'play';
  audio();
}

function endRound() {
  state = 'over';
  overTime = 0;
  if (saved > best) { best = saved; storeBest(); }
}

function vehiclesLeft() { return roster.filter(r => r.state !== 'crushed').length; }

reset();

// ---------- Autos ----------
// Alle Fahrzeugtypen: Seltenheit im Shop, Grösse, Radgrösse und Grundfarbe (ein Spezial-Lack übermalt sie).
// Fähigkeiten: points = Punkte beim Retten, heal = repariert zerquetschte Fahrzeuge, armor = hält Pressen-Schläge aus,
// ability = was beim Antippen passiert, info = Tipp, wenn der Typ zum ersten Mal auftaucht.
const KINDS = {
  car:       { name: 'Auto', tier: 'common', w: [88, 110], h: [40, 46] },
  mini:      { name: 'Mini', tier: 'common', w: [66, 76], h: [34, 38], speed: 1.1, wheel: 9 },
  beetle:    { name: 'Käfer', tier: 'common', w: [78, 88], h: [42, 46], wheel: 10 },
  pickup:    { name: 'Pickup', tier: 'common', w: [112, 126], h: [46, 50], points: 2,
               info: '📦 Pickup: bringt seine Kisten mit – 2 Punkte!' },
  taxi:      { name: 'Taxi', tier: 'common', w: [92, 104], h: [48, 52], color: '#ffc61a', points: 2,
               info: '🚕 Taxi: hat einen Fahrgast dabei – 2 Punkte!' },
  van:       { name: 'Bus', tier: 'common', w: [130, 150], h: [54, 54], points: 3,
               info: '🚌 Bus: viele Fahrgäste – 3 Punkte!' },
  kombi:     { name: 'Kombi', tier: 'common', w: [98, 112], h: [42, 46] },
  cabrio:    { name: 'Cabrio', tier: 'common', w: [92, 104], h: [36, 40] },
  delivery:  { name: 'Lieferwagen', tier: 'common', w: [118, 128], h: [56, 60], points: 2,
               info: '📦 Lieferwagen: bringt Pakete – 2 Punkte!' },
  isetta:    { name: 'Knutschkugel', tier: 'common', w: [56, 62], h: [38, 42], wheel: 8, speed: 1.25,
               info: '🥚 Knutschkugel: klein und flink!' },
  pizza:     { name: 'Pizza-Roller', tier: 'uncommon', w: [54, 60], h: [44, 48], wheel: 8, speed: 1.3,
               color: '#e63946', coins: 1, info: '🍕 Pizza-Roller: retten gibt 1 Münze Trinkgeld!' },
  garbage:   { name: 'Müllauto', tier: 'uncommon', w: [140, 150], h: [58, 62], color: '#f28c28',
               ability: 'magnet', info: '♻️ Müllauto: Antippen = sammelt ALLE Münzen ein!' },
  camper:    { name: 'Wohnmobil', tier: 'uncommon', w: [140, 155], h: [60, 64], points: 3,
               info: '🏕️ Wohnmobil: eine ganze Familie im Urlaub – 3 Punkte!' },
  dumper:    { name: 'Kipplaster', tier: 'rare', w: [128, 138], h: [52, 56], points: 3,
               info: '⛏️ Kipplaster: voll mit Sand – 3 Punkte!' },
  postauto:  { name: 'Postauto', tier: 'rare', w: [140, 150], h: [56, 58], color: '#ffcc00',
               ability: 'horn', points: 4, info: '📯 Postauto: Antippen = Dreiklanghorn! 4 Punkte.' },
  racer:     { name: 'Rennauto', tier: 'rare', w: [112, 120], h: [30, 32], wheel: 12, speed: 1.6,
               info: '🏁 Rennauto: das schnellste Auto von allen!' },
  sports:    { name: 'Sportwagen', tier: 'uncommon', w: [104, 118], h: [32, 35], speed: 1.2, wheel: 10,
               ability: 'turbo', info: '⚡ Sportwagen: Antippen = TURBO! Aber er kann nicht bremsen.' },
  jeep:      { name: 'Jeep', tier: 'uncommon', w: [92, 104], h: [52, 56], wheel: 15, armor: 1,
               info: '🛡️ Jeep: so stark, dass er einen Pressen-Schlag aushält!' },
  police:    { name: 'Polizei', tier: 'uncommon', w: [96, 108], h: [48, 52], color: '#f4f6fb',
               ability: 'unstoppable', points: 2, info: '🚓 Polizei: lässt sich NICHT anhalten! 2 Punkte.' },
  ambulance: { name: 'Krankenwagen', tier: 'uncommon', w: [118, 130], h: [56, 60], color: '#ffffff', heal: 1,
               info: '🚑 Krankenwagen: retten repariert ein zerquetschtes Fahrzeug!' },
  icecream:  { name: 'Glace-Wagen', tier: 'rare', w: [116, 128], h: [60, 62], color: '#ffd6e8',
               ability: 'freeze', info: '🍦 Glace-Wagen: Antippen = Eis! ALLE Pressen frieren 3 Sek. ein.' },
  firetruck: { name: 'Feuerwehr', tier: 'rare', w: [150, 165], h: [58, 62], color: '#d62828',
               ability: 'water', info: '🚒 Feuerwehr: Antippen = Wasser! Die Presse ist 5 Sek. aus.' },
  excavator: { name: 'Bagger', tier: 'rare', w: [118, 128], h: [62, 66], color: '#f6b500',
               ability: 'lift', info: '🏗️ Bagger: Antippen = Schaufel hoch! Hält die Presse 3 Sek. offen.' },
  limo:      { name: 'Stretch-Limo', tier: 'rare', w: [170, 185], h: [40, 44], color: '#22232b',
               points: 4, info: '🎩 Stretch-Limo: sehr lang, aber 4 Punkte!' },
  tractor:   { name: 'Traktor', tier: 'rare', w: [100, 110], h: [56, 60], color: '#3fa34d', speed: 0.75,
               points: 3, info: '🚜 Traktor: langsam, aber fleissig – 3 Punkte!' },
  train:     { name: 'Dampflok', tier: 'epic', w: [150, 165], h: [62, 66], color: '#1f3b73',
               points: 5, info: '🚂 Dampflok: tschu-tschu – 5 Punkte!' },
  ghost:     { name: 'Geisterauto', tier: 'epic', w: [92, 104], h: [42, 46], color: '#e3dcff',
               ability: 'ghost', info: '👻 Geisterauto: Antippen = unsichtbar! Die Presse geht durch es durch.' },
  monster:   { name: 'Monstertruck', tier: 'epic', w: [110, 120], h: [70, 74], wheel: 20, armor: 2,
               points: 2, info: '💪 Monstertruck: hält ZWEI Pressen-Schläge aus!' },
  rocketcar: { name: 'Raketenauto', tier: 'epic', w: [104, 116], h: [38, 42],
               ability: 'rocket', info: '🚀 Raketenauto: Antippen = fliegt direkt zum Ausgang!' },
  ufo:       { name: 'Ufo', tier: 'epic', w: [100, 110], h: [50, 54], color: '#b7c3d0',
               ability: 'beam', info: '🛸 Ufo: Antippen = Beamen! Es springt hinter die nächste Presse.' },
  // --- Neue Fahrzeuge (Runde 3) ---
  kompakt:   { name: 'Kompaktwagen', tier: 'common', w: [86, 96], h: [44, 48] },
  minivan:   { name: 'Familien-Van', tier: 'common', w: [110, 120], h: [54, 58], points: 2,
               info: '👨‍👩‍👧 Familien-Van: die ganze Familie fährt mit – 2 Punkte!' },
  golfcart:  { name: 'Golfwägeli', tier: 'common', w: [70, 78], h: [46, 50], wheel: 8, speed: 0.9,
               info: '⛳ Golfwägeli: gemütlich unterwegs.' },
  scooter:   { name: 'Roller', tier: 'common', w: [50, 56], h: [44, 48], wheel: 8, speed: 1.3,
               info: '🛵 Roller: klein und flink!' },
  umzug:     { name: 'Umzugswagen', tier: 'common', w: [130, 140], h: [60, 64], points: 2,
               info: '🛋️ Umzugswagen: ein ganzes Haus voller Sachen – 2 Punkte!' },
  oldtimer:  { name: 'Oldtimer', tier: 'uncommon', w: [96, 104], h: [50, 54], points: 2,
               info: '🎩 Oldtimer: ein Schatz auf Rädern – 2 Punkte!' },
  muscle:    { name: 'Muscle-Car', tier: 'uncommon', w: [108, 118], h: [38, 42], speed: 1.25,
               info: '💨 Muscle-Car: brummt laut und fährt schnell!' },
  bakery:    { name: 'Bäckerwagen', tier: 'uncommon', w: [118, 128], h: [56, 60], color: '#f3dfbf', coins: 1,
               info: '🥖 Bäckerwagen: retten gibt 1 Münze fürs Brot!' },
  safari:    { name: 'Safari-Jeep', tier: 'uncommon', w: [96, 106], h: [54, 58], wheel: 15, color: '#e8d7a8', armor: 1,
               info: '🦓 Safari-Jeep: robust – hält einen Pressen-Schlag aus!' },
  towtruck:  { name: 'Abschleppwagen', tier: 'uncommon', w: [124, 134], h: [56, 60], heal: 1,
               info: '🪝 Abschleppwagen: retten repariert ein zerquetschtes Fahrzeug!' },
  buggy:     { name: 'Strandbuggy', tier: 'uncommon', w: [86, 94], h: [46, 50], wheel: 13, speed: 1.2,
               info: '🏖️ Strandbuggy: flitzt über jeden Sand!' },
  tuktuk:    { name: 'Tuk-Tuk', tier: 'uncommon', w: [72, 80], h: [56, 60], wheel: 9,
               info: '🛺 Tuk-Tuk: knattert fröhlich durch die Fabrik!' },
  doubledecker: { name: 'Doppeldecker', tier: 'rare', w: [140, 150], h: [74, 78], color: '#d62828', points: 5,
               info: '🚌 Doppeldecker: zwei Stockwerke voller Fahrgäste – 5 Punkte!' },
  cement:    { name: 'Betonmischer', tier: 'rare', w: [134, 144], h: [60, 64], armor: 1, points: 2,
               info: '🧱 Betonmischer: hart wie Beton – hält einen Schlag aus!' },
  armored:   { name: 'Geldtransporter', tier: 'rare', w: [120, 130], h: [56, 60], color: '#6b7280', armor: 1, coins: 2,
               info: '💰 Geldtransporter: gepanzert und bringt 2 Münzen!' },
  snowplow:  { name: 'Schneepflug', tier: 'rare', w: [130, 140], h: [56, 60], color: '#f97316', ability: 'freeze',
               info: '❄️ Schneepflug: Antippen = Schneesturm! ALLE Pressen frieren 3 Sek. ein.' },
  crane:     { name: 'Autokran', tier: 'rare', w: [160, 172], h: [62, 66], color: '#facc15', ability: 'lift',
               info: '🏗️ Autokran: Antippen = hält die Presse 3 Sek. hoch!' },
  hotdog:    { name: 'Hotdog-Wagen', tier: 'rare', w: [110, 120], h: [60, 64], points: 2, coins: 1,
               info: '🌭 Hotdog-Wagen: 2 Punkte und 1 Münze!' },
  policebike: { name: 'Polizei-Töff', tier: 'rare', w: [62, 68], h: [48, 52], wheel: 10, speed: 1.4, color: '#f4f6fb',
               ability: 'unstoppable', points: 2, info: '🏍️ Polizei-Töff: schnell und lässt sich NICHT anhalten!' },
  amphibian: { name: 'Amphibienauto', tier: 'rare', w: [112, 122], h: [50, 54], points: 3,
               info: '🚤 Amphibienauto: schwimmt sogar – 3 Punkte!' },
  heli:      { name: 'Helikopter', tier: 'epic', w: [112, 122], h: [54, 58], color: '#2563eb', ability: 'rocket', points: 3,
               info: '🚁 Helikopter: Antippen = abheben! Fliegt direkt zum Ausgang.' },
  dragster:  { name: 'Dragster', tier: 'epic', w: [150, 160], h: [44, 48], wheel: 8, speed: 1.3, ability: 'turbo', points: 3,
               info: '🏎️ Dragster: Antippen = MEGA-TURBO!' },
  hovercraft: { name: 'Hovercraft', tier: 'epic', w: [110, 120], h: [50, 54], ability: 'beam', points: 3,
               info: '💨 Hovercraft: Antippen = Sprung hinter die nächste Presse!' },
  firework:  { name: 'Feuerwerk-Wagen', tier: 'epic', w: [118, 128], h: [50, 54], ability: 'firework',
               info: '🎆 Feuerwerk-Wagen: Antippen = Feuerwerk! Alle Pressen 4 Sek. aus.' },
  treasure:  { name: 'Schatz-Truck', tier: 'epic', w: [124, 134], h: [62, 66], color: '#7c4a1e', coins: 5, points: 3,
               info: '🏴‍☠️ Schatz-Truck: retten gibt 5 Münzen!' },
  dragon:    { name: 'Drachen-Auto', tier: 'legendary', w: [114, 124], h: [54, 58], color: '#2f9e44', ability: 'fire', points: 6,
               info: '🐉 Drachen-Auto: Antippen = Feueratem! Die Presse schmilzt 5 Sek.' },
  shuttle:   { name: 'Space-Shuttle', tier: 'legendary', w: [140, 150], h: [52, 56], wheel: 8, color: '#f1f5f9',
               ability: 'rocket', points: 8, info: '🚀 Space-Shuttle: Antippen = Start ins All! 8 Punkte.' },
  timemachine: { name: 'Zeitmaschine', tier: 'legendary', w: [108, 118], h: [40, 44], color: '#c0c7d2', ability: 'timestop',
               points: 6, info: '⏳ Zeitmaschine: Antippen = Zeit anhalten! Alle Pressen 5 Sek. aus.' },
  unicorn:   { name: 'Einhorn-Mobil', tier: 'legendary', w: [102, 112], h: [54, 58], color: '#fdf4ff', heal: 3,
               points: 5, info: '🦄 Einhorn-Mobil: repariert 3 zerquetschte Fahrzeuge!' },
  royal:     { name: 'Königskutsche', tier: 'legendary', w: [104, 114], h: [64, 68], wheel: 16, color: '#d4a017', coins: 5,
               points: 10, info: '👑 Königskutsche: 10 Punkte und 5 Münzen!' },
  // --- Neue Fahrzeuge (Runde 4): look = wie es in 2D gezeichnet wird, badge = Bildchen auf der Seite ---
  hatch:     { name: 'Kleinwagen', tier: 'common', w: [84, 94], h: [44, 48], look: 'kompakt' },
  coupe:     { name: 'Coupé', tier: 'common', w: [98, 108], h: [38, 42], speed: 1.05, look: 'car' },
  schoolbus: { name: 'Schulbus', tier: 'common', w: [140, 152], h: [56, 58], color: '#f5b700', points: 3, look: 'van', badge: '🎒',
               info: '🎒 Schulbus: voller Kinder – 3 Punkte!' },
  smart:     { name: 'Stadtflitzer', tier: 'common', w: [56, 62], h: [40, 44], wheel: 9, speed: 1.15, look: 'mini',
               info: '🏙️ Stadtflitzer: passt in jede Lücke!' },
  cargobike: { name: 'Lastenvelo', tier: 'common', w: [64, 72], h: [44, 48], wheel: 8, speed: 0.9, coins: 1, look: 'scooter', badge: '📦',
               info: '🚲 Lastenvelo: bringt 1 Münze mit!' },
  ecar:      { name: 'Elektroauto', tier: 'common', w: [96, 108], h: [40, 44], color: '#e9eef5', speed: 1.1, look: 'car', badge: '⚡',
               info: '⚡ Elektroauto: leise und flott!' },
  quad:      { name: 'Quad', tier: 'common', w: [70, 78], h: [44, 48], wheel: 12, speed: 1.15, look: 'buggy',
               info: '🏍️ Quad: vier Räder, viel Spass!' },
  moped:     { name: 'Mofa', tier: 'common', w: [52, 58], h: [44, 48], wheel: 8, speed: 1.05, look: 'scooter' },
  offroad:   { name: 'Geländewagen', tier: 'common', w: [100, 110], h: [54, 58], wheel: 14, look: 'jeep',
               info: '⛰️ Geländewagen: fährt über Stock und Stein!' },
  roadster:  { name: 'Roadster', tier: 'common', w: [92, 100], h: [34, 38], speed: 1.1, look: 'cabrio' },
  rally:     { name: 'Rallyeauto', tier: 'uncommon', w: [90, 100], h: [42, 46], wheel: 11, speed: 1.25, ability: 'turbo', look: 'sports', badge: '🏁',
               info: '🏁 Rallyeauto: Antippen = TURBO! Aber es kann nicht bremsen.' },
  sweeper:   { name: 'Kehrmaschine', tier: 'uncommon', w: [110, 120], h: [56, 60], color: '#f97316', ability: 'magnet', look: 'garbage', badge: '🧹',
               info: '🧹 Kehrmaschine: Antippen = fegt ALLE Münzen zusammen!' },
  taco:      { name: 'Taco-Truck', tier: 'uncommon', w: [118, 128], h: [58, 62], color: '#16a34a', points: 2, coins: 1, look: 'bakery', badge: '🌮',
               info: '🌮 Taco-Truck: 2 Punkte und 1 Münze!' },
  hippie:    { name: 'Hippie-Bus', tier: 'uncommon', w: [104, 114], h: [56, 60], color: '#38bdf8', points: 3, look: 'van', badge: '🌼',
               info: '🌼 Hippie-Bus: Peace! 3 Punkte.' },
  parcel:    { name: 'Paketbote', tier: 'uncommon', w: [118, 128], h: [56, 60], color: '#facc15', points: 2, look: 'delivery', badge: '📦',
               info: '📦 Paketbote: viele Pakete – 2 Punkte!' },
  rescue:    { name: 'Bergrettung', tier: 'uncommon', w: [100, 110], h: [54, 58], wheel: 15, color: '#dc2626', heal: 1, look: 'jeep', badge: '⛑️',
               info: '⛑️ Bergrettung: retten repariert ein zerquetschtes Fahrzeug!' },
  gokart:    { name: 'Gokart', tier: 'uncommon', w: [64, 72], h: [26, 30], wheel: 8, speed: 1.35, look: 'racer',
               info: '🏎️ Gokart: ganz tief und sehr flink!' },
  lowrider:  { name: 'Lowrider', tier: 'uncommon', w: [118, 128], h: [36, 40], color: '#7c3aed', points: 2, look: 'limo', badge: '🎵',
               info: '🎵 Lowrider: cool und glänzend – 2 Punkte!' },
  tanker:    { name: 'Tankwagen', tier: 'uncommon', w: [150, 162], h: [58, 62], armor: 1, look: 'cement', badge: '⛽',
               info: '⛽ Tankwagen: dicker Stahltank – hält einen Schlag aus!' },
  policebus: { name: 'Polizeibus', tier: 'uncommon', w: [130, 145], h: [54, 56], color: '#f4f6fb', ability: 'unstoppable', points: 3, look: 'van', badge: '🚓',
               info: '🚓 Polizeibus: lässt sich NICHT anhalten! 3 Punkte.' },
  dozer:     { name: 'Bulldozer', tier: 'rare', w: [120, 130], h: [60, 64], color: '#f6b500', ability: 'lift', armor: 1, look: 'excavator', badge: '🚜',
               info: '🚜 Bulldozer: Antippen = Schild hoch! Hält die Presse 3 Sek. offen.' },
  forklift:  { name: 'Gabelstapler', tier: 'rare', w: [80, 88], h: [62, 66], wheel: 9, color: '#f2b705', speed: 0.85, ability: 'lift', look: 'golfcart', badge: '📦',
               info: '📦 Gabelstapler: Antippen = Gabel hoch! Hält die Presse 3 Sek. offen.' },
  carrier:   { name: 'Autotransporter', tier: 'rare', w: [170, 185], h: [66, 70], color: '#1d4ed8', points: 5, look: 'crane', badge: '🚗',
               info: '🚗 Autotransporter: bringt drei Autos mit – 5 Punkte!' },
  groomer:   { name: 'Pistenfahrzeug', tier: 'rare', w: [124, 134], h: [62, 66], color: '#dc2626', ability: 'freeze', look: 'snowplow', badge: '⛷️',
               info: '⛷️ Pistenfahrzeug: Antippen = Schnee! ALLE Pressen frieren 3 Sek. ein.' },
  watercannon: { name: 'Wasserwerfer', tier: 'rare', w: [124, 134], h: [58, 62], color: '#e5e7eb', ability: 'water', look: 'armored', badge: '💦',
               info: '💦 Wasserwerfer: Antippen = Wasser! Die Presse ist 5 Sek. aus.' },
  stockcar:  { name: 'Stockcar', tier: 'rare', w: [108, 118], h: [36, 40], speed: 1.45, ability: 'turbo', look: 'muscle', badge: '🏁',
               info: '🏁 Stockcar: Antippen = TURBO! Superschnell.' },
  popcorn:   { name: 'Popcorn-Wagen', tier: 'rare', w: [116, 126], h: [60, 64], color: '#ef4444', coins: 2, look: 'icecream', badge: '🍿',
               info: '🍿 Popcorn-Wagen: retten gibt 2 Münzen!' },
  circus:    { name: 'Zirkuswagen', tier: 'rare', w: [140, 155], h: [60, 64], color: '#b91c1c', points: 4, look: 'camper', badge: '🎪',
               info: '🎪 Zirkuswagen: Manege frei – 4 Punkte!' },
  tram:      { name: 'Tram', tier: 'rare', w: [175, 190], h: [58, 62], color: '#1e40af', points: 5, speed: 0.85, look: 'van', badge: '🚋',
               info: '🚋 Tram: ganz lang und voller Leute – 5 Punkte!' },
  sub:       { name: 'U-Boot-Auto', tier: 'epic', w: [112, 122], h: [50, 54], color: '#facc15', ability: 'ghost', points: 3, look: 'amphibian', badge: '🫧',
               info: '🫧 U-Boot-Auto: Antippen = abtauchen! Die Presse geht durch es durch.' },
  jet:       { name: 'Düsenjet', tier: 'epic', w: [140, 150], h: [50, 54], wheel: 8, color: '#94a3b8', ability: 'rocket', points: 4, look: 'shuttle', badge: '✈️',
               info: '✈️ Düsenjet: Antippen = abheben! Fliegt direkt zum Ausgang.' },
  robot:     { name: 'Roboter-Truck', tier: 'epic', w: [110, 120], h: [74, 78], wheel: 18, color: '#64748b', armor: 2, points: 3, look: 'monster', badge: '🤖',
               info: '🤖 Roboter-Truck: hält ZWEI Pressen-Schläge aus!' },
  nightracer: { name: 'Nachtflitzer', tier: 'epic', w: [108, 118], h: [34, 38], color: '#18181b', speed: 1.4, ability: 'ghost', look: 'sports', badge: '🦇',
               info: '🦇 Nachtflitzer: Antippen = unsichtbar wie die Nacht!' },
  zeppelin:  { name: 'Zeppelin', tier: 'epic', w: [130, 140], h: [56, 60], color: '#cbd5e1', ability: 'beam', points: 4, look: 'ufo', badge: '🎈',
               info: '🎈 Zeppelin: Antippen = schwebt hinter die nächste Presse!' },
  pirate:    { name: 'Piratenschiff', tier: 'epic', w: [124, 134], h: [70, 74], color: '#7c4a1e', coins: 4, points: 3, look: 'treasure', badge: '🏴‍☠️',
               info: '🏴‍☠️ Piratenschiff: Arrr! Retten gibt 4 Münzen.' },
  polar:     { name: 'Polar-Truck', tier: 'epic', w: [112, 122], h: [70, 74], wheel: 20, color: '#e0f2fe', ability: 'freeze', armor: 1, look: 'monster', badge: '🐻‍❄️',
               info: '🐻‍❄️ Polar-Truck: Antippen = Eiszeit! Und hält einen Schlag aus.' },
  phoenix:   { name: 'Phönix-Auto', tier: 'legendary', w: [112, 122], h: [52, 56], color: '#ea580c', ability: 'fire', heal: 2, points: 6, look: 'dragon', badge: '🔥',
               info: '🔥 Phönix-Auto: Antippen = Feuer! Und retten repariert 2 Fahrzeuge.' },
  rover:     { name: 'Mondrover', tier: 'legendary', w: [104, 114], h: [52, 56], wheel: 13, color: '#e2e8f0', ability: 'beam', points: 7, look: 'buggy', badge: '🌙',
               info: '🌙 Mondrover: Antippen = Mondsprung hinter die nächste Presse! 7 Punkte.' },
  shark:     { name: 'Hai-Mobil', tier: 'legendary', w: [110, 120], h: [44, 48], color: '#64748b', speed: 1.3, ability: 'unstoppable', points: 7, look: 'sports', badge: '🦈',
               info: '🦈 Hai-Mobil: lässt sich NICHT anhalten! 7 Punkte.' },
  pumpkin:   { name: 'Kürbiskutsche', tier: 'legendary', w: [104, 114], h: [64, 68], wheel: 16, color: '#f97316', coins: 6, points: 8, look: 'royal', badge: '🎃',
               info: '🎃 Kürbiskutsche: Zauberei! 8 Punkte und 6 Münzen.' },
};

// Münzen und Fahrzeugpark bleiben gespeichert
function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function storeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* egal */ }
}
let wallet = loadJSON('autoRetterCoins', 0);

// Ein Fahrzeug im Fahrzeugpark: Typ, eigene Farbe und evtl. Gold-/Regenbogen-Lack
// Start-PS eines Fahrzeugtyps: Seltenheit mal Tempo. In der Presse: retten +1 PS, zerquetscht −3 PS.
const TIER_PS = { common: 40, uncommon: 55, rare: 70, epic: 85, legendary: 100 };
const PAINT_PS = { gold: 5, rainbow: 8, diamond: 12, obsidian: 20 };   // Spezial-Lack gibt Extra-PS
function basePS(kind, special) { return Math.round(TIER_PS[KINDS[kind].tier] * (KINDS[kind].speed || 1)) + (PAINT_PS[special] || 0); }

function makeVehicle(kind, special = null) {
  const k = KINDS[kind];
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    kind, special, ps: basePS(kind, special), paintPS: true,
    color: { gold: '#ffcf33', diamond: '#bfefff', obsidian: '#1d1030' }[special] || k.color || pick(COLORS),
  };
}

const START_FLEET = ['car', 'mini', 'kombi', 'cabrio'];
let fleet = loadJSON('autoRetterFleet', null);
if (!fleet) {
  fleet = START_FLEET.map(kind => makeVehicle(kind));
  // Wer früher schon Fahrzeuge freigeschaltet hat, bekommt sie in den Fahrzeugpark
  for (const kind of loadJSON('autoRetterUnlocked', [])) if (KINDS[kind]) fleet.push(makeVehicle(kind));
  storeJSON('autoRetterFleet', fleet);
  try { localStorage.removeItem('autoRetterUnlocked'); } catch (e) { /* egal */ }
}
fleet = fleet.filter(v => KINDS[v.kind]);
for (const v of fleet) {
  if (typeof v.ps !== 'number') v.ps = basePS(v.kind); // ältere Spielstände ohne PS
  if (!v.paintPS) { v.ps += PAINT_PS[v.special] || 0; v.paintPS = true; } // Lack-Bonus einmal nachrüsten
}
storeJSON('autoRetterFleet', fleet);
const MAX_SELECTED = 4;      // so viele Fahrzeuge darf man in eine Runde mitnehmen
let selectedIds = new Set(loadJSON('autoRetterSelected', fleet.slice(0, MAX_SELECTED).map(v => v.id)));

// Baut aus einem Fahrzeug des Fahrzeugparks ein fahrendes Auto
function carFromVehicle(v, x) {
  const k = KINDS[v.kind];
  const w = k.w[1], h = k.h[1];
  const speed = carSpeed() * rand(0.92, 1.08) * (k.speed || 1);
  return {
    x, w, h, kind: v.kind, special: v.special, seed: Math.random(), r: k.wheel || 11,
    diamond: v.special === 'diamond',
    color: v.color, speed, v: speed * 0.8,
    stopped: false, rot: 0, dead: false,
    armor: (k.armor || 0) + ({ diamond: 1, obsidian: 2 }[v.special] || 0), powerUsed: false, turbo: 0, spray: 0, sprayTarget: null, cd: 0,
    ghost: 0, fly: false, alt: 0,
  };
}

function spawnCar() {
  const waiting = roster.filter(r => r.state === 'pool');
  if (!waiting.length) return false;
  const slot = pick(waiting);
  const k = KINDS[slot.entry.kind];
  const c = carFromVehicle(slot.entry, 0);
  c.x = -c.w - 5;
  c.slot = slot;
  slot.state = 'road';
  cars.push(c);
  if (k.info && !seenKinds.has(slot.entry.kind)) {
    seenKinds.add(slot.entry.kind);
    tips.push(k.info);
  }
  return true;
}

// Holt die zuletzt zerquetschten Fahrzeuge zurück in die Runde
function revive(n) {
  const names = [];
  while (n-- > 0 && crushedOrder.length) {
    const r = crushedOrder.pop();
    r.state = 'pool';
    names.push(KINDS[r.entry.kind].name);
  }
  return names;
}

function pressAhead(c) {
  let found = null;
  for (const p of presses) {
    if (p.phase === 'off' || p.x + PRESS_W < c.x) continue;
    if (!found || p.x < found.x) found = p;
  }
  return found;
}

function switchOff(p, secs, how) {
  p.phase = 'off';
  p.t = p.t0 = secs;
  p.off = how;
}

// Was passiert, wenn man ein Fahrzeug antippt
function tapCar(c) {
  const ability = KINDS[c.kind].ability;
  const fx = c.x + c.w / 2, fy = ROAD_Y - c.h - 50;

  if (ability === 'unstoppable') {
    floaters.push({ text: 'Polizei hält nicht an! 🚨', x: fx, y: fy, t: 0, color: '#9cc3ff', size: 22 });
    beep(700, 0.12, 'sawtooth', 0.04);
    beep(500, 0.12, 'sawtooth', 0.04, 0.12);
    return;
  }
  if (ability === 'rocket' && !c.powerUsed) {
    c.powerUsed = true;
    c.fly = true;
    c.stopped = false;
    const liftoff = { heli: 'ABHEBEN! 🚁', shuttle: 'LIFT-OFF! 🚀' }[c.kind] || '3, 2, 1 … START! 🚀';
    floaters.push({ text: liftoff, x: fx, y: fy, t: 0, color: '#ffb020', size: 26 });
    noise(1.2, 900, 0.35);
    beep(200, 0.8, 'sawtooth', 0.05);
    return;
  }
  if (ability === 'ghost' && c.cd <= 0) {
    c.ghost = 3;
    c.cd = 9;
    floaters.push({ text: 'Huuuh! 👻', x: fx, y: fy, t: 0, color: '#e3dcff', size: 26 });
    beep(500, 0.5, 'sine', 0.06);
    beep(350, 0.6, 'sine', 0.06, 0.25);
    return;
  }
  if (ability === 'lift' && c.cd <= 0) {
    const p = pressAhead(c);
    if (p) {
      switchOff(p, 3, 'lift');
      c.cd = 8;
      floaters.push({ text: 'HOCH DAMIT! 🏗️', x: fx, y: fy, t: 0, color: '#ffd84d', size: 24 });
      beep(150, 0.4, 'square', 0.05);
      return;
    }
  }
  if (ability === 'magnet' && !c.powerUsed && coins.length) {
    c.powerUsed = true;
    floaters.push({ text: 'Alles eingesammelt! ♻️', x: fx, y: fy, t: 0, color: '#ffd700', size: 22 });
    for (const k of coins) collectCoin(k);
    return;
  }
  if (ability === 'horn') {
    floaters.push({ text: '🎵 Tüü-taa-too!', x: fx, y: fy, t: 0, color: '#ffcc00', size: 22 });
    beep(554, 0.22, 'sawtooth', 0.04);
    beep(659, 0.22, 'sawtooth', 0.04, 0.22);
    beep(880, 0.35, 'sawtooth', 0.04, 0.44);
    // danach normal anhalten bzw. weiterfahren
  }
  if (ability === 'turbo') {
    c.turbo = 1.4;
    floaters.push({ text: 'TURBO! ⚡', x: fx, y: fy, t: 0, color: '#ffe066', size: 26 });
    beep(300, 0.3, 'sawtooth', 0.05);
    beep(600, 0.3, 'sawtooth', 0.05, 0.1);
    return;
  }
  if (ability === 'water' && !c.powerUsed) {
    const p = pressAhead(c);
    if (p) {
      c.powerUsed = true;
      c.spray = 0.9;
      c.sprayTarget = p;
      switchOff(p, 5, 'water');
      floaters.push({ text: 'WASSER MARSCH! 💧', x: fx, y: fy, t: 0, color: '#7cc8ff', size: 24 });
      noise(0.9, 3000, 0.25);
      return;
    }
  }
  if (ability === 'beam' && c.cd <= 0) {
    const p = pressAhead(c);
    if (p) {
      const lx = p.x + PRESS_W + 8;
      const blocked = cars.some(o => o !== c && o.x < lx + c.w + 10 && o.x + o.w + 10 > lx);
      if (blocked) {
        floaters.push({ text: 'Kein Platz zum Landen!', x: fx, y: fy, t: 0, color: '#c8ffd8', size: 20 });
        return;
      }
      for (const [bx, by] of [[c.x + c.w / 2, ROAD_Y - c.h / 2], [lx + c.w / 2, ROAD_Y - c.h / 2]]) {
        for (let i = 0; i < 14; i++) {
          particles.push({
            x: bx + rand(-30, 30), y: by + rand(-20, 20), vx: rand(-40, 40), vy: rand(-120, -30),
            life: 0, max: rand(0.4, 0.8), color: Math.random() < 0.5 ? '#8dffb4' : '#fff', size: rand(2, 5), g: 0,
          });
        }
      }
      c.x = lx;
      c.stopped = false;
      c.cd = 3;
      floaters.push({ text: c.kind === 'hovercraft' ? 'SPRUNG! 💨' : 'BEAM! ✨', x: lx + c.w / 2, y: ROAD_Y - c.h - 50, t: 0, color: '#8dffb4', size: 26 });
      beep(400, 0.25, 'sine', 0.06);
      beep(1200, 0.25, 'sine', 0.06, 0.1);
      return;
    }
  }
  if (ability === 'fire' && c.cd <= 0) {
    const p = pressAhead(c);
    if (p) {
      c.cd = 10;
      c.spray = 0.9;
      c.sprayTarget = p;
      c.sprayColors = ['#ff7b2e', '#ffd166', '#ff3d00'];
      switchOff(p, 5, 'fire');
      floaters.push({ text: 'FEUERATEM! 🔥', x: fx, y: fy, t: 0, color: '#ffb020', size: 26 });
      noise(0.9, 1200, 0.3);
      return;
    }
  }
  if (ability === 'firework' && !c.powerUsed) {
    c.powerUsed = true;
    for (const p of presses) switchOff(p, 4, 'firework');
    for (let b = 0; b < 5; b++) {
      const bx = rand(150, W - 150), by = rand(70, 210);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, sp = rand(120, 220);
        particles.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: -b * 0.15, max: rand(0.8, 1.2), color: pick(COLORS), size: rand(3, 5), g: 120,
        });
      }
      beep(rand(500, 900), 0.15, 'triangle', 0.05, b * 0.15);
    }
    floaters.push({ text: 'FEUERWERK! 🎆', x: W / 2, y: H / 2 - 60, t: 0, color: '#ffd166', size: 40, long: true });
    return;
  }
  if (ability === 'timestop' && c.cd <= 0) {
    c.cd = 15;
    for (const p of presses) switchOff(p, 5, 'time');
    floaters.push({ text: 'ZEIT STOPP! ⏳', x: W / 2, y: H / 2 - 60, t: 0, color: '#67e8f9', size: 40, long: true });
    beep(1200, 0.5, 'sine', 0.06);
    beep(600, 0.6, 'sine', 0.06, 0.2);
    return;
  }
  if (ability === 'freeze' && !c.powerUsed) {
    c.powerUsed = true;
    for (const p of presses) switchOff(p, 3, 'ice');
    floaters.push({ text: c.kind === 'snowplow' ? 'SCHNEESTURM! ❄️' : 'EISZEIT! 🍦❄️', x: W / 2, y: H / 2 - 60, t: 0, color: '#bff4ff', size: 40, long: true });
    beep(1320, 0.15, 'sine', 0.06);
    beep(1760, 0.15, 'sine', 0.06, 0.12);
    beep(2093, 0.25, 'sine', 0.06, 0.24);
    return;
  }

  c.stopped = !c.stopped;
  beep(c.stopped ? 330 : 520, 0.08, 'triangle', 0.07);
}

function carAt(px, py) {
  let bestCar = null, bestDist = Infinity;
  for (const c of cars) {
    if (c.fly) continue;
    const a = screenPos(c.x, ROAD_Y - c.h - 50), b = screenPos(c.x + c.w, ROAD_Y + 30);
    if (px < a.x - 14 || px > b.x + 14) continue;
    if (py < a.y || py > b.y) continue;
    const d = Math.abs(px - (a.x + b.x) / 2);
    if (d < bestDist) { bestDist = d; bestCar = c; }
  }
  return bestCar;
}

function overlapsPress(c, p) {
  return c.x < p.x + PRESS_W - 4 && c.x + c.w > p.x + 4;
}

function updateCars(dt) {
  cars.sort((a, b) => b.x - a.x); // vorderstes Auto zuerst
  let ahead = null; // nächstes Auto davor, das auf der Strasse fährt
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    c.turbo = Math.max(0, c.turbo - dt);
    c.cd = Math.max(0, c.cd - dt);
    c.ghost = Math.max(0, c.ghost - dt);

    // Raketenauto im Flug: steigt auf und fliegt über alles hinweg zum Ausgang
    if (c.fly) {
      c.alt = Math.min(230, c.alt + 380 * dt);
      c.x += 520 * dt;
      if (Math.random() < dt * 40) {
        particles.push({
          x: c.x - 10, y: ROAD_Y - c.alt - c.h * 0.7, vx: rand(-80, -20), vy: rand(-20, 40),
          life: 0, max: rand(0.4, 0.8), color: Math.random() < 0.5 ? '#ffb020' : '#c9ced8', size: rand(4, 8), g: 0,
        });
      }
      if (c.x > W + 10) { c.dead = true; saveCar(c); }
      continue;
    }

    if (c.kind === 'train' && Math.random() < dt * 8) {
      particles.push({
        x: c.x + c.w * 0.78 + 2, y: ROAD_Y - c.h * 0.62 - 24, vx: rand(-50, -15), vy: rand(-70, -35),
        life: 0, max: 1.2, color: '#d8dce3', size: rand(6, 10), g: -10,
      });
    }

    const target = c.stopped ? 0 : c.turbo > 0 ? c.speed * 2.6 : c.speed;
    if (c.v < target) c.v = Math.min(target, c.v + (c.turbo > 0 ? 1400 : 380) * dt);
    else c.v = Math.max(target, c.v - 900 * dt);

    // Nicht ins vordere Auto fahren und nicht in eine heruntergefahrene Presse
    let maxFront = ahead ? ahead.x - 10 : Infinity;
    const front = c.x + c.w;
    for (const p of presses) {
      if (c.ghost > 0) break; // Geister fahren durch die Platte
      if (front <= p.x + 1 && p.y > ROAD_Y - c.h - 8) maxFront = Math.min(maxFront, p.x - 2);
    }

    let nx = c.x + c.v * dt;
    if (nx + c.w > maxFront) {
      nx = Math.max(c.x, maxFront - c.w);
      c.v = Math.max(0, (nx - c.x) / dt);
    }
    c.rot += (nx - c.x) / 10;
    c.x = nx;

    // Wasserstrahl der Feuerwehr: Tropfen fliegen im Bogen zur Presse
    if (c.spray > 0) {
      c.spray -= dt;
      const p = c.sprayTarget;
      const sx = c.x + c.w * 0.7, sy = ROAD_Y - c.h;
      const tx = p.x + rand(10, PRESS_W - 10), ty = p.y - PLATE_H / 2;
      const T = 0.45, g = 600;
      for (let n = 0; n < 3; n++) {
        particles.push({
          x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T - 0.5 * g * T,
          life: 0, max: T + 0.1, color: pick(c.sprayColors || ['#5ab4ff', '#bfe6ff']), size: rand(3, 5), g,
        });
      }
    }

    if (c.x > W + 10) { c.dead = true; saveCar(c); }
    ahead = c;
  }
  cars = cars.filter(c => !c.dead);
}

function saveCar(c) {
  const k = KINDS[c.kind];
  const pts = Math.max(k.points || 1, { gold: 3, rainbow: 5, diamond: 8, obsidian: 12 }[c.special] || 1);
  const repairs = (k.heal || 0) + ({ gold: 1, rainbow: 3 }[c.special] || 0);
  saved += pts;
  c.slot.state = 'pool'; // fährt später nochmal
  c.slot.entry.ps += 1;
  storeJSON('autoRetterFleet', fleet);
  let text = '+' + pts + '  ⚡+1 PS';
  const repaired = revive(repairs);
  if (repaired.length) {
    floaters.push({ text: '🔧 ' + repaired.join(', ') + ' repariert!', x: W / 2, y: 175, t: 0, color: '#7dffb0', size: 26, long: true });
  }
  if (k.coins) {
    wallet += k.coins;
    coinsThisGame += k.coins;
    storeJSON('autoRetterCoins', wallet);
    text += '  +' + k.coins + ' 🪙';
  }
  const textColor = c.special === 'rainbow' ? 'hsl(' + ((time * 200) % 360) + ', 90%, 65%)'
    : { gold: '#ffcf33', diamond: '#bfefff', obsidian: '#c9a2ff' }[c.special] || '#7dffb0';
  floaters.push({ text, x: W - 90, y: ROAD_Y - 80, t: 0, color: textColor, size: 30, rainbow: c.special === 'rainbow' });
  for (let i = 0; i < 14; i++) {
    particles.push({
      x: W - 20, y: ROAD_Y - 30, vx: rand(-220, -40), vy: rand(-300, -80),
      life: 0, max: rand(0.6, 1.1), color: pick(COLORS), size: rand(3, 6), g: 600,
    });
  }
  beep(660, 0.09, 'sine', 0.08);
  beep(990, 0.14, 'sine', 0.08, 0.08);

  const newLevel = 1 + Math.floor(saved / LEVEL_EVERY);
  if (newLevel > level) {
    // Für jedes geschaffte Level gibt es so viele Münzen, wie das Level hoch war
    let bonus = 0;
    for (let l = level; l < newLevel; l++) bonus += l;
    wallet += bonus;
    coinsThisGame += bonus;
    storeJSON('autoRetterCoins', wallet);
    level = newLevel;
    coinsLeftInLevel = COINS_PER_LEVEL;
    let msg = 'Level ' + level + '!  +' + bonus + ' 🪙';
    if (presses.length < pressCount()) {
      presses.push(newPress(presses.length));
      msg += '  Neue Presse!';
    }
    floaters.push({ text: msg, x: W / 2, y: H / 2 - 40, t: 0, color: '#ffe066', size: 44, long: true });
    beep(523, 0.1, 'triangle', 0.08);
    beep(659, 0.1, 'triangle', 0.08, 0.1);
    beep(784, 0.2, 'triangle', 0.08, 0.2);
  }
}

function crush(c) {
  c.dead = true;
  wrecks.push({ x: c.x - 5, w: c.w + 10, h: 12, color: c.color, special: c.special, seed: c.seed, t: 0 });
  for (let i = 0; i < 26; i++) {
    particles.push({
      x: c.x + rand(0, c.w), y: ROAD_Y - 10, vx: rand(-320, 320), vy: rand(-380, -60),
      life: 0, max: rand(0.5, 1.0), size: rand(2, 6), g: 900,
      color: c.special === 'rainbow' ? pick(COLORS) : c.special === 'diamond' ? pick(['#bfefff', '#ffffff', '#7fd0ff'])
        : c.special === 'obsidian' ? pick(['#8b5cf6', '#1d1030', '#c9a2ff'])
        : Math.random() < 0.5 ? c.color : '#ffd166',
    });
  }
  noise(0.5, 1800, 0.5);
  beep(90, 0.4, 'sawtooth', 0.1);
  c.slot.entry.ps = Math.max(1, c.slot.entry.ps - 3);
  storeJSON('autoRetterFleet', fleet);
  floaters.push({ text: 'KRACH!  −3 PS', x: c.x + c.w / 2, y: ROAD_Y - 120, t: 0, color: '#ff5d5d', size: 32 });
  c.slot.state = 'crushed';
  crushedOrder.push(c.slot);
  if (vehiclesLeft() === 0) endRound();
}

// Der Jeep hält einen Schlag aus: die Platte prallt ab und der Jeep wird etwas flacher
function bounceOff(c, p) {
  c.armor--;
  c.h -= 10;
  p.y = ROAD_Y - c.h - 1;
  p.phase = 'rise';
  shake = 6;
  floaters.push({ text: 'BOING! 🛡️', x: c.x + c.w / 2, y: ROAD_Y - 130, t: 0, color: '#ffe066', size: 30 });
  beep(160, 0.3, 'square', 0.08);
  beep(320, 0.2, 'triangle', 0.08, 0.05);
}

// ---------- Münzen ----------
const COIN_R = 13;

function updateCoins(dt) {
  coinTimer -= dt;
  if (coinTimer <= 0 && coinsLeftInLevel > 0) {
    coinTimer = rand(4, 9);
    coinsLeftInLevel--;
    coins.push({ x: rand(60, W - 60), y: -20, vy: rand(90, 130), t: 0, landed: false, seed: rand(0, 6) });
  }
  for (const k of coins) {
    k.t += dt;
    if (!k.landed) {
      k.y += k.vy * dt;
      k.x += Math.sin(k.t * 3 + k.seed) * 25 * dt;
      if (k.y >= COIN_GROUND) {
        k.y = COIN_GROUND;
        k.landed = true;
        k.t = 0;
        beep(2400, 0.05, 'triangle', 0.025);
      }
    }
  }
  coins = coins.filter(k => !k.taken && !(k.landed && k.t > 5));
}

function coinAt(px, py) {
  for (const k of coins) {
    const p = in3D() ? press3d.projectCoin(k) : k;
    if (Math.hypot(px - p.x, py - p.y) < COIN_R + 22) return k;
  }
  return null;
}

function collectCoin(k) {
  k.taken = true;
  wallet++;
  coinsThisGame++;
  storeJSON('autoRetterCoins', wallet);
  floaters.push({ text: '+1 🪙', x: k.x, y: k.y - 30, t: 0, color: '#ffd700', size: 26 });
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: k.x, y: k.y, vx: rand(-150, 150), vy: rand(-220, -40),
      life: 0, max: rand(0.4, 0.7), color: Math.random() < 0.5 ? '#ffd700' : '#fff6c2', size: rand(2, 5), g: 500,
    });
  }
  beep(1568, 0.07, 'square', 0.04);
  beep(2093, 0.12, 'square', 0.04, 0.07);
}

function drawCoin(cx, cy, rad, spin) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.max(0.2, Math.abs(Math.cos(spin))), 1);
  ctx.fillStyle = '#b8860b';
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd700';
  ctx.beginPath(); ctx.arc(0, 0, rad * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff6c2';
  ctx.beginPath(); ctx.arc(-rad * 0.3, -rad * 0.3, rad * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b8860b';
  ctx.font = 'bold ' + Math.round(rad * 1.1) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, 1);
  ctx.restore();
}

function drawCoins() {
  for (const k of coins) {
    if (k.landed && k.t > 3.5 && Math.floor(k.t * 8) % 2 === 0) continue; // blinkt kurz vor dem Verschwinden
    drawCoin(k.x, k.y, COIN_R, time * 4 + k.seed);
  }
}

// ---------- Pressen ----------
function updatePress(p, dt) {
  p.t -= dt;
  switch (p.phase) {
    case 'idle':
      if (p.t <= 0) { p.phase = 'warn'; p.t = warnTime(); p.beepT = 0; }
      break;
    case 'warn':
      p.beepT -= dt;
      if (p.beepT <= 0) { beep(880, 0.06, 'square', 0.035); p.beepT = 0.18; }
      if (p.t <= 0) p.phase = 'slam';
      break;
    case 'slam':
      p.y = Math.min(PLATE_DOWN, p.y + 2600 * dt);
      if (p.y >= PLATE_DOWN) {
        p.phase = 'hold';
        p.t = 0.35;
        shake = 9;
        noise(0.25, 400, 0.45);
        for (let i = 0; i < 16; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          particles.push({
            x: p.x + PRESS_W / 2 + side * PRESS_W / 2, y: ROAD_Y - 4,
            vx: side * rand(40, 200), vy: rand(-90, -10),
            life: 0, max: rand(0.4, 0.8), color: '#8a8f99', size: rand(3, 7), g: 150,
          });
        }
      }
      break;
    case 'hold':
      if (p.t <= 0) p.phase = 'rise';
      break;
    case 'rise':
      p.y = Math.max(PLATE_UP, p.y - 420 * dt);
      if (p.y <= PLATE_UP) { p.phase = 'idle'; p.t = p.t0 = idleTime(); }
      break;
    case 'off': // von Feuerwehr (Wasser) oder Glace-Wagen (Eis) ausgeschaltet
      p.y = Math.max(PLATE_UP, p.y - 420 * dt);
      if ((p.off === 'water' || p.off === 'ice') && Math.random() < dt * 10) {
        particles.push({
          x: p.x + rand(5, PRESS_W - 5), y: p.y, vx: 0, vy: 0,
          life: 0, max: 0.8, color: p.off === 'ice' ? '#e6fbff' : '#5ab4ff', size: 3, g: 500,
        });
      }
      if (p.t <= 0) { p.phase = 'idle'; p.t = p.t0 = idleTime(); }
      break;
  }

  if (state === 'play' && (p.phase === 'slam' || p.phase === 'hold')) {
    for (const c of cars) {
      if (c.dead || c.fly || c.ghost > 0 || !overlapsPress(c, p) || p.y <= ROAD_Y - c.h) continue;
      if (c.armor > 0 && p.phase === 'slam') bounceOff(c, p);
      else crush(c);
    }
    cars = cars.filter(c => !c.dead);
  }
}

// ---------- Update ----------
function update(dt) {
  time += dt;
  shake = Math.max(0, shake - dt * 30);

  if (state === 'over') overTime += dt;
  if (state === 'play' || state === 'title') {
    for (const p of presses) updatePress(p, dt);
  }
  menuMsgT = Math.max(0, menuMsgT - dt);
  if (state === 'reveal') updateReveal(dt);

  if (state === 'play') {
    spawnTimer -= dt;
    const last = cars.reduce((m, c) => (m && m.x < c.x ? m : c), null);
    if (spawnTimer <= 0 && (!last || last.x > 30) && spawnCar()) {
      const a = Math.max(0.5, 2.2 - level * 0.22);
      spawnTimer = rand(a, a + 1.2);
    }
    updateCars(dt);
    updateCoins(dt);
  }

  for (const pt of particles) {
    pt.life += dt;
    pt.vy += pt.g * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  particles = particles.filter(pt => pt.life < pt.max);
  for (const w of wrecks) w.t += dt;
  wrecks = wrecks.filter(w => w.t < 2.5);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < (f.long ? 2 : 1));

  if (state === 'play') {
    if (!tip && tips.length) tip = { text: tips.shift(), t: 0 };
    if (tip) {
      tip.t += dt;
      if (tip.t > 3.5) tip = null;
    }
  }
}

// ---------- Zeichnen ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, ROAD_Y);
  g.addColorStop(0, '#262a35');
  g.addColorStop(1, '#353a48');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, ROAD_Y);

  // Ziegelfugen
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let y = 20, row = 0; y < ROAD_Y; y += 22, row++) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (let x = (row % 2) * 30; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke();
    }
  }

  // Fabrikfenster
  for (let i = 0; i < 6; i++) {
    const x = 50 + i * 160;
    ctx.fillStyle = '#1b1e27';
    rr(x, 26, 90, 40, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255, 214, 120, 0.18)';
    rr(x + 4, 30, 82, 32, 3); ctx.fill();
  }

  // Strasse
  ctx.fillStyle = '#4b505c';
  ctx.fillRect(0, ROAD_Y, W, 8);
  ctx.fillStyle = '#2b2d33';
  ctx.fillRect(0, ROAD_Y + 8, W, H - ROAD_Y - 8);
  ctx.fillStyle = '#e8c547';
  for (let x = 10; x < W; x += 60) ctx.fillRect(x, ROAD_Y + 48, 32, 5);

  // Einfahrt links
  ctx.fillStyle = '#111318';
  rr(-20, ROAD_Y - 90, 40, 90, 8); ctx.fill();

  // Ausgang rechts
  ctx.fillStyle = '#123d2a';
  rr(W - 26, ROAD_Y - 100, 50, 100, 8); ctx.fill();
  ctx.fillStyle = '#2ecc71';
  rr(W - 120, ROAD_Y - 150, 104, 30, 5); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AUSGANG ➜', W - 68, ROAD_Y - 134);
}

// Lack eines Autos: normal einfarbig, Gold metallisch, Regenbogen mit wandernden Farben, Diamant funkelnd,
// Obsidian schwarz mit lila Schimmer
function carPaint(c) {
  const top = ROAD_Y - c.h;
  if (c.special === 'obsidian') {
    const g = ctx.createLinearGradient(c.x, top, c.x + c.w, ROAD_Y);
    const shift = (time * 0.25 + c.seed) % 1;
    ['#0b0710', '#3b1f5c', '#05040a', '#5b2d8f', '#120a1c', '#26143d']
      .forEach((col, i) => g.addColorStop((i / 6 + shift) % 1, col));
    return g;
  }
  if (c.special === 'diamond') {
    const g = ctx.createLinearGradient(c.x, top, c.x + c.w, ROAD_Y);
    const shift = (time * 0.35 + c.seed) % 1;
    ['#e8fbff', '#8fdcff', '#ffffff', '#6cc8f5', '#d6f6ff', '#a6e4ff']
      .forEach((col, i) => g.addColorStop((i / 6 + shift) % 1, col));
    return g;
  }
  if (c.special === 'gold') {
    const g = ctx.createLinearGradient(0, top, 0, ROAD_Y);
    g.addColorStop(0, '#fff6c2');
    g.addColorStop(0.3, '#ffd700');
    g.addColorStop(0.65, '#d4a017');
    g.addColorStop(1, '#8b6508');
    return g;
  }
  if (c.special === 'rainbow') {
    const g = ctx.createLinearGradient(c.x, 0, c.x + c.w, 0);
    for (let i = 0; i <= 6; i++) {
      g.addColorStop(i / 6, 'hsl(' + ((i * 55 + time * 160 + c.seed * 360) % 360) + ', 90%, 58%)');
    }
    return g;
  }
  return c.color;
}

function drawSparkle(sx, sy, size) {
  ctx.beginPath();
  ctx.moveTo(sx, sy - size);
  ctx.lineTo(sx + size * 0.25, sy - size * 0.25);
  ctx.lineTo(sx + size, sy);
  ctx.lineTo(sx + size * 0.25, sy + size * 0.25);
  ctx.lineTo(sx, sy + size);
  ctx.lineTo(sx - size * 0.25, sy + size * 0.25);
  ctx.lineTo(sx - size, sy);
  ctx.lineTo(sx - size * 0.25, sy - size * 0.25);
  ctx.closePath();
  ctx.fill();
}

// Schwarzer Kristall mit lila Kante
function drawObsidianIcon(ix, iy) {
  ctx.save();
  ctx.shadowColor = '#8b5cf6';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#140b20';
  poly([[ix, iy - 12], [ix + 9, iy - 2], [ix + 4, iy + 10], [ix - 4, iy + 10], [ix - 9, iy - 2]]);
  ctx.restore();
  ctx.strokeStyle = '#b57cff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ix, iy - 12); ctx.lineTo(ix + 9, iy - 2); ctx.lineTo(ix + 4, iy + 10);
  ctx.lineTo(ix - 4, iy + 10); ctx.lineTo(ix - 9, iy - 2); ctx.closePath();
  ctx.moveTo(ix, iy - 12); ctx.lineTo(ix, iy + 10);
  ctx.stroke();
}

function drawRainbowIcon(ix, iy) {
  const hues = [0, 30, 55, 120, 210, 275];
  ctx.lineWidth = 3;
  hues.forEach((hue, i) => {
    ctx.strokeStyle = 'hsl(' + hue + ', 90%, 60%)';
    ctx.beginPath();
    ctx.arc(ix, iy + 8, 18 - i * 3, Math.PI, 0);
    ctx.stroke();
  });
}

const GLASS = '#bfe3ff';

function poly(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function circle(cx, cy, rad) {
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
}

function blueLight(lx, ly, offset) {
  const on = Math.floor(time * 6 + offset) % 2 === 0;
  ctx.save();
  if (on) { ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 18; }
  ctx.fillStyle = on ? '#60a5fa' : '#1e3a8a';
  rr(lx - 5, ly - 6, 10, 6, 2); ctx.fill();
  ctx.restore();
}

// Limousine (auch Grundform für Taxi und Polizei)
function drawSedan(c, paint, roofY) {
  const { x, w } = c, y = ROAD_Y;
  const bodyTop = y - c.h * 0.58;
  const bodyH = c.h * 0.58 - c.r * 0.4;
  ctx.fillStyle = paint;
  poly([[x + w * 0.18, bodyTop + 2], [x + w * 0.3, roofY], [x + w * 0.64, roofY], [x + w * 0.82, bodyTop + 2]]);
  ctx.fillStyle = GLASS;
  poly([[x + w * 0.24, bodyTop + 1], [x + w * 0.325, roofY + 5], [x + w * 0.47, roofY + 5], [x + w * 0.47, bodyTop + 1]]);
  poly([[x + w * 0.51, bodyTop + 1], [x + w * 0.51, roofY + 5], [x + w * 0.625, roofY + 5], [x + w * 0.75, bodyTop + 1]]);
  ctx.fillStyle = paint;
  rr(x, bodyTop, w, bodyH, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 8, bodyTop + 4, w - 16, 3);
  return { bodyTop, bodyH };
}

// Kastenwagen mit Fahrerkabine vorne (Glace-Wagen, Krankenwagen, Feuerwehr)
function drawBoxTruck(c, paint, boxTop, boxEnd) {
  const { x, w, h } = c, y = ROAD_Y;
  const bottom = y - c.r * 0.4;
  const cabX = x + w * boxEnd;
  const cabTop = boxTop + (bottom - boxTop) * 0.22;
  const noseY = y - h * 0.45;
  ctx.fillStyle = paint;
  poly([[cabX - 6, bottom], [cabX - 6, cabTop], [x + w * 0.9, cabTop], [x + w, noseY], [x + w, bottom]]);
  ctx.fillStyle = GLASS;
  poly([[cabX + 2, cabTop + 4], [x + w * 0.9 - 1, cabTop + 4], [x + w - 5, noseY - 1], [cabX + 2, noseY - 1]]);
  ctx.fillStyle = paint;
  rr(x, boxTop, w * boxEnd, bottom - boxTop, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x + 6, boxTop + 3, w * boxEnd - 12, 3);
  return cabTop;
}

// Auto mit Kabine; shape = Anteile der Breite [hinten unten, hinten oben, vorne oben, vorne unten]
function drawCabin(c, paint, shape, roofY, bodyFrac = 0.58) {
  const { x, w } = c, y = ROAD_Y;
  const bodyTop = y - c.h * bodyFrac;
  const bodyH = c.h * bodyFrac - c.r * 0.4;
  const [rb, rt, ft, fb] = shape;
  const mid = (rt + ft) / 2;
  ctx.fillStyle = paint;
  poly([[x + w * rb, bodyTop + 2], [x + w * rt, roofY], [x + w * ft, roofY], [x + w * fb, bodyTop + 2]]);
  ctx.fillStyle = GLASS;
  poly([[x + w * (rb + 0.05), bodyTop + 1], [x + w * (rt + 0.02), roofY + 5], [x + w * (mid - 0.015), roofY + 5], [x + w * (mid - 0.015), bodyTop + 1]]);
  poly([[x + w * (mid + 0.015), bodyTop + 1], [x + w * (mid + 0.015), roofY + 5], [x + w * (ft - 0.02), roofY + 5], [x + w * (fb - 0.06), bodyTop + 1]]);
  ctx.fillStyle = paint;
  rr(x, bodyTop, w, bodyH, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 8, bodyTop + 4, w - 16, 3);
  return { bodyTop, bodyH };
}

// Fahrerkabine vorne, ab dem Anteil fromX der Breite
function drawFrontCab(c, paint, fromX, cabTop) {
  const { x, w, h } = c, y = ROAD_Y, bottom = y - c.r * 0.4;
  const noseY = y - h * 0.45;
  const slopeX = x + w - w * (1 - fromX) * 0.4;
  ctx.fillStyle = paint;
  poly([[x + w * fromX, bottom], [x + w * fromX, cabTop], [slopeX, cabTop], [x + w, noseY], [x + w, bottom]]);
  ctx.fillStyle = GLASS;
  poly([[x + w * fromX + 4, cabTop + 5], [slopeX - 1, cabTop + 5], [x + w - 5, noseY - 1], [x + w * fromX + 4, noseY - 1]]);
}

function drawChassis(c, fromY) {
  ctx.fillStyle = '#3d4350';
  ctx.fillRect(c.x + 4, fromY, c.w - 8, ROAD_Y - c.r * 0.4 - fromY);
}

function amberLight(lx, ly) {
  ctx.fillStyle = Math.floor(time * 4) % 2 ? '#ffb020' : '#7a5200';
  rr(lx, ly, 14, 6, 2); ctx.fill();
}

// Räder als [x, Radius]
function wheels(c) {
  const { x, w, r } = c;
  switch (KINDS[c.kind].look || c.kind) {
    case 'firetruck': return [[x + 24, r], [x + 58, r], [x + w - 26, r]];
    case 'van': case 'icecream': case 'ambulance': case 'postauto':
    case 'delivery': case 'garbage': case 'camper': case 'umzug': case 'bakery': case 'doubledecker':
    case 'armored': case 'hotdog': case 'treasure': return [[x + 22, r], [x + w - 22, r]];
    case 'crane': return [[x + 20, r], [x + 46, r], [x + w - 50, r], [x + w - 22, r]];
    case 'dragster': return [[x + w * 0.14, 20], [x + w * 0.93, r]];
    case 'pizza': case 'scooter': return [[x + w * 0.15, r], [x + w * 0.85, r]];
    case 'racer': return [[x + w * 0.18, r], [x + w * 0.82, 10]];
    case 'dumper': case 'cement': case 'snowplow': return [[x + w * 0.16, r], [x + w * 0.38, r], [x + w * 0.85, r]];
    case 'limo': return [[x + w * 0.12, r], [x + w * 0.88, r]];
    case 'train': return [[x + w * 0.25, 14], [x + w * 0.47, 14], [x + w * 0.69, 14], [x + w * 0.9, 8]];
    case 'excavator': return [];
    case 'jeep': case 'safari': return [[x + w * 0.22, r], [x + w * 0.78, r]];
    case 'tractor': return [[x + w * 0.28, 19], [x + w * 0.82, r]];
    case 'ufo': case 'heli': case 'hovercraft': return [];
    default: return [[x + w * 0.2, r], [x + w * 0.8, r]];
  }
}

// Kleines Symbol, das die Fähigkeit eines Fahrzeugs zeigt (solange sie noch nutzbar ist)
function abilityIcon(c) {
  const k = KINDS[c.kind];
  if (k.ability === 'water' && !c.powerUsed) return '💧';
  if (k.ability === 'freeze' && !c.powerUsed) return '❄️';
  if (k.ability === 'turbo') return '⚡';
  if (k.ability === 'beam' && c.cd <= 0) return '✨';
  if (k.ability === 'fire' && c.cd <= 0) return '🔥';
  if (k.ability === 'firework' && !c.powerUsed) return '🎆';
  if (k.ability === 'timestop' && c.cd <= 0) return '⏳';
  if (k.ability === 'ghost' && c.cd <= 0) return '👻';
  if (k.ability === 'lift' && c.cd <= 0) return '🏗️';
  if (k.ability === 'rocket' && !c.powerUsed) return '🚀';
  if (k.ability === 'magnet' && !c.powerUsed) return '🧲';
  if (k.ability === 'horn') return '📯';
  if (k.coins) return '🪙';
  if (k.armor && c.armor > 0) return '🛡️';
  if (k.heal) return '🔧';
  return null;
}

function drawCar(c) {
  const { x, w, h, r } = c;
  const y = ROAD_Y;
  const top = y - h;
  const paint = carPaint(c);
  ctx.save();
  if (c.alt) ctx.translate(0, -c.alt);
  if (c.ghost > 0) ctx.globalAlpha = 0.3 + 0.1 * Math.sin(time * 10);

  // Turbo: Feuer aus dem Auspuff und Speed-Linien
  if (c.turbo > 0) {
    ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffb020' : '#ff5d2a';
    poly([[x, y - r - 2], [x - 18 - rand(0, 10), y - r + 2], [x, y - r + 6]]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ly = y - h * (0.3 + i * 0.22);
      ctx.beginPath(); ctx.moveTo(x - 50 - i * 12, ly); ctx.lineTo(x - 22, ly); ctx.stroke();
    }
  }

  // Leuchtender Schein um Spezialautos
  if (c.special) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 5);
    ctx.fillStyle = { gold: '#ffd700', diamond: '#bfefff', obsidian: '#8b5cf6' }[c.special]
      || 'hsl(' + ((time * 160) % 360) + ', 90%, 60%)';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y - h / 2, w / 2 + 6, h / 2 + 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 3, w / 2 + 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  let lightY = y - h * 0.58 + 5;
  switch (KINDS[c.kind].look || c.kind) {
    case 'van': case 'postauto': { // Bus und Postauto
      ctx.fillStyle = paint;
      rr(x, top, w, h - r * 0.4, 9); ctx.fill();
      ctx.fillStyle = GLASS;
      const n = Math.floor((w - 34) / 26);
      for (let i = 0; i < n; i++) { rr(x + 10 + i * 26, top + 8, 20, h * 0.3, 3); ctx.fill(); }
      rr(x + w - 18, top + 8, 13, h * 0.4, 3); ctx.fill();
      if (c.kind === 'postauto') {
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(x, y - h * 0.38, w, 4);
      }
      lightY = y - h * 0.45;
      break;
    }
    case 'beetle': {
      const bottom = y - r * 0.4;
      ctx.fillStyle = paint;
      ctx.beginPath(); ctx.ellipse(x + w / 2, bottom, w / 2, bottom - top, 0, Math.PI, 0); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.rect(x, top, w, h * 0.42); ctx.clip();
      ctx.fillStyle = GLASS;
      ctx.beginPath(); ctx.ellipse(x + w / 2 + 3, bottom, w * 0.34, bottom - top - 6, 0, Math.PI, 0); ctx.fill();
      ctx.restore();
      ctx.fillStyle = paint;
      ctx.fillRect(x + w * 0.52, top, 4, h * 0.42);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.3, top + h * 0.55, 10, 3, -0.5, 0, Math.PI * 2); ctx.fill();
      lightY = y - h * 0.32;
      break;
    }
    case 'sports': {
      const bottom = y - r * 0.4;
      ctx.fillStyle = paint;
      poly([[x, bottom], [x, y - h * 0.62], [x + w * 0.35, y - h * 0.7], [x + w * 0.44, top], [x + w * 0.6, top],
        [x + w * 0.78, y - h * 0.62], [x + w, y - h * 0.45], [x + w, bottom]]);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.42, y - h * 0.68], [x + w * 0.465, top + 3], [x + w * 0.59, top + 3], [x + w * 0.74, y - h * 0.63]]);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x + 4, y - h * 0.3, w - 8, 3);
      // Heckspoiler
      ctx.fillStyle = '#1f2026';
      ctx.fillRect(x + 6, y - h * 0.62 - 7, 3, 7);
      rr(x - 2, y - h * 0.62 - 11, 20, 4, 1); ctx.fill();
      lightY = y - h * 0.45;
      break;
    }
    case 'pickup': case 'firework': {
      const bodyTop = y - h * 0.55;
      if (c.kind === 'firework') { // Raketen auf der Ladefläche
        for (let i = 0; i < 5; i++) {
          const rx = x + w * 0.06 + i * 9, ry = bodyTop - 20 - (i % 2) * 5;
          ctx.fillStyle = COLORS[i];
          ctx.fillRect(rx, ry, 5, bodyTop - ry);
          poly([[rx - 1, ry], [rx + 6, ry], [rx + 2.5, ry - 6]]);
        }
      } else { // Kisten auf der Ladefläche
        ctx.fillStyle = '#a0703c';
        rr(x + w * 0.1, bodyTop - 13, 16, 13, 2); ctx.fill();
        rr(x + w * 0.1 + 19, bodyTop - 10, 13, 10, 2); ctx.fill();
      }
      ctx.fillStyle = paint;
      poly([[x + w * 0.5, bodyTop + 1], [x + w * 0.53, top], [x + w * 0.74, top], [x + w * 0.86, bodyTop + 1]]);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.56, bodyTop], [x + w * 0.575, top + 5], [x + w * 0.72, top + 5], [x + w * 0.81, bodyTop]]);
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, h * 0.55 - r * 0.4, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 5, bodyTop, w * 0.42, 4);
      lightY = bodyTop + 5;
      break;
    }
    case 'jeep': case 'safari': {
      const bodyTop = y - h * 0.5;
      ctx.fillStyle = paint;
      rr(x + w * 0.1, top, w * 0.68, h * 0.55, 5); ctx.fill();
      ctx.fillStyle = GLASS;
      rr(x + w * 0.16, top + 6, w * 0.25, h * 0.3, 3); ctx.fill();
      rr(x + w * 0.46, top + 6, w * 0.26, h * 0.3, 3); ctx.fill();
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, h * 0.5 - r * 0.4, 6); ctx.fill();
      // Dachträger und Reserverad
      ctx.fillStyle = '#1f2026';
      ctx.fillRect(x + w * 0.12, top - 3, w * 0.64, 3);
      ctx.beginPath(); ctx.arc(x - 4, bodyTop + 10, 9, 0, Math.PI * 2); ctx.fill();
      if (c.kind === 'safari') { // Zebrastreifen
        ctx.fillStyle = 'rgba(25, 25, 25, 0.8)';
        for (let sx = x + 8; sx < x + w - 10; sx += 15) {
          poly([[sx, bodyTop], [sx + 6, bodyTop], [sx + 2, y - r * 0.4], [sx - 4, y - r * 0.4]]);
        }
      }
      lightY = bodyTop + 5;
      break;
    }
    case 'taxi': {
      const { bodyTop, bodyH } = drawSedan(c, paint, top + 9);
      ctx.fillStyle = '#1f2026';
      for (let i = 0; 8 + i * 8 < w - 8; i++) {
        ctx.fillRect(x + 8 + i * 8, bodyTop + bodyH * 0.45 + (i % 2) * 4, 8, 4);
      }
      ctx.fillStyle = '#fff8d0';
      rr(x + w * 0.39, top, w * 0.2, 9, 2); ctx.fill();
      ctx.fillStyle = '#1f2026';
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', x + w * 0.49, top + 5);
      lightY = bodyTop + 5;
      break;
    }
    case 'police': {
      const { bodyTop, bodyH } = drawSedan(c, paint, top + 8);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(x + 3, bodyTop + bodyH * 0.38, w - 6, bodyH * 0.36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('POLIZEI', x + w / 2, bodyTop + bodyH * 0.56);
      ctx.fillStyle = '#2b2e36';
      rr(x + w * 0.36, top + 2, w * 0.26, 6, 2); ctx.fill();
      blueLight(x + w * 0.42, top + 8, 0);
      blueLight(x + w * 0.56, top + 8, 1);
      lightY = bodyTop + 4;
      break;
    }
    case 'icecream': {
      const boxTop = top + 18;
      drawBoxTruck(c, paint, boxTop, 0.74);
      // Markise und Verkaufsfenster
      for (let i = 0; i * 8 < w * 0.44; i++) {
        ctx.fillStyle = i % 2 ? '#fff' : '#ff5fa2';
        ctx.fillRect(x + w * 0.12 + i * 8, boxTop + 6, 8, 7);
      }
      ctx.fillStyle = GLASS;
      rr(x + w * 0.14, boxTop + 14, w * 0.4, (y - boxTop) * 0.3, 3); ctx.fill();
      // Glace-Cornet auf dem Dach
      const cx = x + w * 0.36;
      ctx.fillStyle = '#d9a25f';
      poly([[cx - 7, boxTop - 12], [cx + 7, boxTop - 12], [cx, boxTop]]);
      ctx.fillStyle = '#8ef0c8';
      ctx.beginPath(); ctx.arc(cx, boxTop - 13, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7eb6';
      ctx.beginPath(); ctx.arc(cx + 1, boxTop - 18, 5, 0, Math.PI * 2); ctx.fill();
      lightY = y - h * 0.4;
      break;
    }
    case 'ambulance': {
      const boxTop = top + 6;
      drawBoxTruck(c, paint, boxTop, 0.72);
      ctx.fillStyle = '#e02424';
      ctx.fillRect(x, y - h * 0.42, w, 6);
      const cx = x + w * 0.36, cy = boxTop + (y - boxTop) * 0.33;
      ctx.fillRect(cx - 10, cy - 3.5, 20, 7);
      ctx.fillRect(cx - 3.5, cy - 10, 7, 20);
      blueLight(x + w * 0.1, boxTop, 0);
      blueLight(x + w * 0.62, boxTop, 1);
      lightY = y - h * 0.4;
      break;
    }
    case 'firetruck': {
      const boxTop = top + 14;
      const cabTop = drawBoxTruck(c, paint, boxTop, 0.76);
      // Rolltore und Zierstreifen
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 3; i++) { rr(x + 8 + i * w * 0.23, boxTop + 6, w * 0.19, (y - boxTop) * 0.5, 3); ctx.fill(); }
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(x, y - h * 0.3, w * 0.76, 4);
      // Leiter
      ctx.fillStyle = '#c9ced8';
      ctx.fillRect(x + 4, top + 2, w * 0.72, 3);
      ctx.fillRect(x + 4, top + 9, w * 0.72, 3);
      for (let lx = x + 8; lx < x + w * 0.74; lx += 9) ctx.fillRect(lx, top + 2, 2, 10);
      blueLight(x + w * 0.84, cabTop, 0);
      lightY = y - h * 0.4;
      break;
    }
    case 'tractor': {
      // Kabine hinten, Motorhaube vorne, Auspuff
      ctx.fillStyle = paint;
      rr(x + w * 0.08, top, w * 0.42, h * 0.78, 4); ctx.fill();
      ctx.fillStyle = GLASS;
      rr(x + w * 0.13, top + 5, w * 0.32, h * 0.36, 3); ctx.fill();
      ctx.fillStyle = paint;
      rr(x + w * 0.42, y - h * 0.58, w * 0.58, h * 0.34, 5); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let gx = x + w * 0.58; gx < x + w * 0.95; gx += 7) ctx.fillRect(gx, y - h * 0.5, 3, h * 0.18);
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(x + w * 0.76, y - h * 0.58 - 14, 5, 14);
      // Kotflügel über dem grossen Hinterrad
      ctx.fillStyle = '#2f7a39';
      ctx.beginPath(); ctx.arc(x + w * 0.28, y - 19, 23, Math.PI, 0); ctx.fill();
      lightY = y - h * 0.5;
      break;
    }
    case 'monster': {
      const bodyTop = y - h * 0.62, bodyBot = y - h * 0.36;
      ctx.fillStyle = '#4a4f5a'; // Federbeine
      ctx.fillRect(x + w * 0.2 - 3, bodyBot - 2, 6, y - r - bodyBot + 2);
      ctx.fillRect(x + w * 0.8 - 3, bodyBot - 2, 6, y - r - bodyBot + 2);
      ctx.fillStyle = paint;
      poly([[x + w * 0.22, bodyTop + 1], [x + w * 0.3, top], [x + w * 0.62, top], [x + w * 0.76, bodyTop + 1]]);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.27, bodyTop], [x + w * 0.335, top + 5], [x + w * 0.6, top + 5], [x + w * 0.7, bodyTop]]);
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, bodyBot - bodyTop, 6); ctx.fill();
      // Flammen-Aufkleber
      ctx.fillStyle = '#ff8c1a';
      poly([[x + 6, bodyBot - 3], [x + w * 0.25, bodyTop + 5], [x + w * 0.3, bodyBot - 7], [x + w * 0.45, bodyTop + 7], [x + w * 0.5, bodyBot - 3]]);
      lightY = bodyTop + 4;
      break;
    }
    case 'ufo': {
      const cy = y - h * 0.42 + Math.sin(time * 3 + c.seed * 6) * 3;
      ctx.fillStyle = 'rgba(150, 255, 200, 0.14)'; // Traktorstrahl
      poly([[x + w * 0.35, cy], [x + w * 0.65, cy], [x + w * 0.82, y], [x + w * 0.18, y]]);
      ctx.fillStyle = 'rgba(170, 230, 255, 0.85)'; // Kuppel
      ctx.beginPath(); ctx.ellipse(x + w / 2, cy - 4, w * 0.22, h * 0.5, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#6fdc5a'; // kleiner Ausserirdischer
      ctx.beginPath(); ctx.arc(x + w / 2, cy - h * 0.25, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(x + w / 2 - 2.5, cy - h * 0.26, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w / 2 + 2.5, cy - h * 0.26, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = paint; // Scheibe
      ctx.beginPath(); ctx.ellipse(x + w / 2, cy, w / 2, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(x + w / 2, cy - 3, w * 0.4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'hsl(' + ((i * 70 + time * 200) % 360) + ', 90%, 65%)';
        ctx.beginPath(); ctx.arc(x + w * (0.15 + i * 0.175), cy + 3, 3, 0, Math.PI * 2); ctx.fill();
      }
      lightY = cy - 3;
      break;
    }
    case 'kombi': {
      const bodyTop = y - h * 0.58;
      ctx.fillStyle = paint;
      poly([[x + w * 0.04, bodyTop + 2], [x + w * 0.06, top], [x + w * 0.66, top], [x + w * 0.82, bodyTop + 2]]);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.09, bodyTop + 1], [x + w * 0.1, top + 5], [x + w * 0.3, top + 5], [x + w * 0.3, bodyTop + 1]]);
      poly([[x + w * 0.33, bodyTop + 1], [x + w * 0.33, top + 5], [x + w * 0.5, top + 5], [x + w * 0.5, bodyTop + 1]]);
      poly([[x + w * 0.53, bodyTop + 1], [x + w * 0.53, top + 5], [x + w * 0.645, top + 5], [x + w * 0.76, bodyTop + 1]]);
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, h * 0.58 - r * 0.4, 8); ctx.fill();
      ctx.fillStyle = '#2b2e36'; // Dachreling
      ctx.fillRect(x + w * 0.1, top - 3, w * 0.5, 3);
      lightY = bodyTop + 5;
      break;
    }
    case 'cabrio': {
      const bodyTop = y - h * 0.62;
      // Fahrer mit Sonnenbrille
      const hx = x + w * 0.45, hy = top + 7;
      ctx.fillStyle = '#f2c9a0';
      circle(hx, hy, 7);
      ctx.fillStyle = '#5a3a1e';
      ctx.beginPath(); ctx.arc(hx, hy - 2, 7, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(hx - 1, hy - 1, 8, 3);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.6, bodyTop], [x + w * 0.66, top + 4], [x + w * 0.69, top + 4], [x + w * 0.66, bodyTop]]);
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, h * 0.62 - r * 0.4, 9); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + w * 0.3, bodyTop, w * 0.3, 3);
      lightY = bodyTop + 5;
      break;
    }
    case 'delivery': {
      const boxTop = top + 4;
      drawBoxTruck(c, paint, boxTop, 0.72);
      const bx = x + w * 0.36, by = boxTop + (y - boxTop) * 0.36;
      ctx.fillStyle = '#c8955a';
      rr(bx - 13, by - 10, 26, 20, 2); ctx.fill();
      ctx.fillStyle = '#8d5a2b';
      ctx.fillRect(bx - 2, by - 10, 4, 20);
      lightY = y - h * 0.4;
      break;
    }
    case 'isetta': {
      const bottom = y - r * 0.4;
      ctx.fillStyle = paint;
      ctx.beginPath(); ctx.ellipse(x + w / 2, (bottom + top) / 2, w / 2, (bottom - top) / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GLASS;
      ctx.beginPath(); ctx.ellipse(x + w * 0.62, top + h * 0.36, w * 0.25, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + w * 0.5, y - h * 0.32, w * 0.36, 2);
      lightY = y - h * 0.45;
      break;
    }
    case 'pizza': case 'scooter': {
      ctx.fillStyle = paint; // Roller
      poly([[x + w * 0.08, y - 12], [x + w * 0.62, y - 12], [x + w * 0.75, y - h * 0.55], [x + w * 0.85, y - h * 0.55],
        [x + w * 0.92, y - 10], [x + w * 0.92, y - 6], [x + w * 0.08, y - 6]]);
      ctx.fillStyle = '#2b2e36'; // Lenker
      ctx.fillRect(x + w * 0.78, y - h * 0.75, 3, h * 0.22);
      ctx.fillStyle = '#3d5a80'; // Fahrer
      rr(x + w * 0.38, y - h * 0.68, w * 0.2, h * 0.42, 4); ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      circle(x + w * 0.5, y - h * 0.78, 6);
      ctx.fillStyle = paint; // Helm
      ctx.beginPath(); ctx.arc(x + w * 0.5, y - h * 0.8, 7, Math.PI, 0); ctx.fill();
      if (c.kind === 'pizza') {
        ctx.fillStyle = '#e8d3a6'; // Pizzaschachtel
        rr(x, y - h * 0.62, w * 0.34, h * 0.36, 2); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.font = 'bold 6px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PIZZA', x + w * 0.17, y - h * 0.44);
      }
      lightY = c.kind === 'pizza' ? y - h * 0.5 : y - 18;
      break;
    }
    case 'garbage': {
      const boxTop = top + 6;
      drawBoxTruck(c, paint, boxTop, 0.74);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let gx = x + 12; gx < x + w * 0.7; gx += 14) ctx.fillRect(gx, boxTop + 6, 5, (y - boxTop) * 0.55);
      ctx.fillStyle = '#5b6170'; // Schüttung hinten
      rr(x - 4, y - h * 0.55, 10, h * 0.4, 3); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♻', x + w * 0.4, boxTop + (y - boxTop) * 0.38);
      lightY = y - h * 0.4;
      break;
    }
    case 'camper': {
      const boxTop = top + 2;
      drawBoxTruck(c, '#f5f1e6', boxTop, 0.8);
      ctx.fillStyle = paint; // Zierstreifen in der Wagenfarbe
      ctx.fillRect(x, y - h * 0.42, w * 0.8, 5);
      ctx.fillRect(x, y - h * 0.33, w * 0.8, 3);
      ctx.fillStyle = GLASS;
      rr(x + w * 0.08, boxTop + 10, w * 0.2, h * 0.25, 3); ctx.fill();
      rr(x + w * 0.5, boxTop + 10, w * 0.18, h * 0.25, 3); ctx.fill();
      ctx.fillStyle = '#c9c2b0'; // Tür
      rr(x + w * 0.34, boxTop + 10, w * 0.11, (y - boxTop) * 0.68, 2); ctx.fill();
      lightY = y - h * 0.4;
      break;
    }
    case 'dumper': {
      const chassisTop = y - h * 0.46, bottom = y - r * 0.4;
      ctx.fillStyle = '#3d4350'; // Fahrgestell
      ctx.fillRect(x + 4, chassisTop, w - 8, bottom - chassisTop);
      ctx.fillStyle = '#d9b26f'; // Sand
      ctx.beginPath(); ctx.ellipse(x + w * 0.34, top + 14, w * 0.3, 12, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = paint; // Mulde
      poly([[x, top + 12], [x + w * 0.68, top + 12], [x + w * 0.64, chassisTop + 2], [x + w * 0.04, chassisTop + 2]]);
      // Kabine vorne
      poly([[x + w * 0.7, bottom], [x + w * 0.7, top + 4], [x + w * 0.88, top + 4], [x + w, y - h * 0.5], [x + w, bottom]]);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.74, top + 9], [x + w * 0.87, top + 9], [x + w * 0.96, y - h * 0.52], [x + w * 0.74, y - h * 0.52]]);
      lightY = y - h * 0.4;
      break;
    }
    case 'racer': {
      const bottom = y - 6;
      ctx.fillStyle = paint;
      poly([[x + w * 0.05, bottom], [x + w * 0.05, y - h * 0.6], [x + w * 0.4, y - h * 0.65], [x + w * 0.55, y - h * 0.95],
        [x + w * 0.62, y - h * 0.65], [x + w, y - h * 0.35], [x + w, bottom]]);
      ctx.fillStyle = '#fff'; // Helm
      circle(x + w * 0.5, y - h * 0.85, 6);
      ctx.fillStyle = '#222';
      ctx.fillRect(x + w * 0.5, y - h * 0.9, 6, 3);
      ctx.fillStyle = '#1f2026'; // Heck- und Frontflügel
      ctx.fillRect(x + 2, top, w * 0.16, 5);
      ctx.fillRect(x + w * 0.08, top, 4, h * 0.45);
      ctx.fillRect(x + w * 0.86, bottom - 4, w * 0.14, 4);
      ctx.fillStyle = '#fff'; // Startnummer
      circle(x + w * 0.3, y - h * 0.38, 7);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('7', x + w * 0.3, y - h * 0.38 + 1);
      lightY = y - h * 0.45;
      break;
    }
    case 'excavator': {
      ctx.fillStyle = '#2b2b2b'; // Raupenkette
      rr(x + 2, y - 16, w * 0.68, 16, 8); ctx.fill();
      ctx.fillStyle = '#6b6f78';
      for (let i = 0; i < 4; i++) circle(x + 12 + i * (w * 0.68 - 20) / 3, y - 8, 5);
      ctx.fillStyle = paint;
      rr(x, y - h * 0.55, w * 0.7, h * 0.3, 4); ctx.fill();
      rr(x + w * 0.36, top + 6, w * 0.3, h * 0.42, 4); ctx.fill();
      ctx.fillStyle = GLASS;
      rr(x + w * 0.42, top + 11, w * 0.2, h * 0.22, 3); ctx.fill();
      // Arm mit Schaufel (hoch, solange der Bagger gerade eine Presse hält)
      const lift = c.cd > 5 ? -12 : 0;
      ctx.strokeStyle = paint;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.6, y - h * 0.5);
      ctx.lineTo(x + w * 0.82, top + 4 + lift);
      ctx.lineTo(x + w * 0.95, y - h * 0.35 + lift);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#5b6170';
      poly([[x + w * 0.9, y - h * 0.38 + lift], [x + w, y - h * 0.38 + lift], [x + w, y - 6 + lift], [x + w * 0.9, y - 14 + lift]]);
      lightY = null;
      break;
    }
    case 'limo': {
      const bodyTop = y - h * 0.58;
      ctx.fillStyle = paint;
      poly([[x + w * 0.1, bodyTop + 2], [x + w * 0.16, top], [x + w * 0.74, top], [x + w * 0.86, bodyTop + 2]]);
      ctx.fillStyle = '#3a4a5c'; // getönte Scheiben
      for (let i = 0; i < 5; i++) { rr(x + w * (0.18 + i * 0.11), top + 5, w * 0.095, bodyTop - top - 4, 2); ctx.fill(); }
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, h * 0.58 - r * 0.4, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; // Chromleiste
      ctx.fillRect(x + 6, bodyTop + 5, w - 12, 2);
      lightY = bodyTop + 5;
      break;
    }
    case 'train': {
      ctx.fillStyle = paint; // Führerhaus hinten
      rr(x, top + 4, w * 0.3, h * 0.75, 4); ctx.fill();
      ctx.fillStyle = '#b5382f';
      ctx.fillRect(x - 2, top, w * 0.3 + 4, 6);
      ctx.fillStyle = GLASS;
      rr(x + w * 0.06, top + 12, w * 0.18, h * 0.22, 2); ctx.fill();
      ctx.fillStyle = paint; // Kessel
      rr(x + w * 0.28, y - h * 0.62, w * 0.62, h * 0.36, 10); ctx.fill();
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(x + w * 0.45, y - h * 0.62, 3, h * 0.36);
      ctx.fillRect(x + w * 0.65, y - h * 0.62, 3, h * 0.36);
      ctx.beginPath(); ctx.arc(x + w * 0.56, y - h * 0.62, 7, Math.PI, 0); ctx.fill(); // Dampfdom
      ctx.fillStyle = '#2b2b2b'; // Schornstein
      ctx.fillRect(x + w * 0.78, y - h * 0.62 - 16, 10, 16);
      ctx.fillRect(x + w * 0.78 - 3, y - h * 0.62 - 20, 16, 5);
      ctx.fillRect(x, y - h * 0.28, w * 0.92, 6); // Rahmen
      ctx.fillStyle = '#b5382f'; // Schienenräumer
      poly([[x + w * 0.9, y - h * 0.3], [x + w, y - 3], [x + w * 0.9, y - 3]]);
      ctx.fillStyle = '#fff3b0'; // Laterne
      circle(x + w * 0.91, y - h * 0.5, 4);
      lightY = null;
      break;
    }
    case 'ghost': {
      const { bodyTop, bodyH } = drawSedan(c, paint, top);
      ctx.fillStyle = '#2b2350'; // Geistergesicht
      ctx.beginPath(); ctx.ellipse(x + w * 0.38, bodyTop + bodyH * 0.42, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w * 0.55, bodyTop + bodyH * 0.42, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w * 0.465, bodyTop + bodyH * 0.78, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      lightY = bodyTop + 5;
      break;
    }
    case 'rocketcar': {
      const { bodyTop } = drawSedan(c, paint, top + 6);
      if (c.fly) { // Feuerstrahl
        ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffb020' : '#ff5d2a';
        poly([[x - 10, bodyTop - 7], [x - 55 - rand(0, 20), bodyTop - 2], [x - 10, bodyTop + 3]]);
      }
      ctx.fillStyle = '#c9ced8'; // Rakete auf dem Heck
      rr(x - 10, bodyTop - 8, w * 0.45, 12, 6); ctx.fill();
      ctx.fillStyle = '#e02424';
      poly([[x - 4, bodyTop - 8], [x + 8, bodyTop - 8], [x - 4, bodyTop - 18]]);
      rr(x + w * 0.45 - 16, bodyTop - 8, 8, 12, 3); ctx.fill();
      lightY = bodyTop + 5;
      break;
    }
    case 'kompakt': {
      const { bodyTop } = drawCabin(c, paint, [0.1, 0.16, 0.62, 0.8], top);
      lightY = bodyTop + 5;
      break;
    }
    case 'minivan': {
      const { bodyTop } = drawCabin(c, paint, [0.03, 0.06, 0.7, 0.9], top, 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; // Schiebetür
      ctx.fillRect(x + w * 0.4, bodyTop + 4, 2, h * 0.3);
      lightY = bodyTop + 5;
      break;
    }
    case 'golfcart': {
      ctx.fillStyle = '#7a4a22'; // Golfbag mit Schlägern
      rr(x + 1, y - h * 0.72, 10, h * 0.42, 3); ctx.fill();
      ctx.strokeStyle = '#d0d4dc';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(x + 3 + i * 3, y - h * 0.72); ctx.lineTo(x + 2 + i * 3, y - h * 0.88); ctx.stroke();
      }
      ctx.fillStyle = '#f4f4f4'; // Dach mit Stangen
      ctx.fillRect(x + w * 0.12, top, w * 0.76, 5);
      ctx.fillStyle = '#9aa0aa';
      ctx.fillRect(x + w * 0.16, top + 5, 3, h * 0.5);
      ctx.fillRect(x + w * 0.8, top + 5, 3, h * 0.5);
      ctx.fillStyle = GLASS;
      ctx.fillRect(x + w * 0.83, top + 7, 3, h * 0.35);
      ctx.fillStyle = '#3d3d3d'; // Sitz
      rr(x + w * 0.3, y - h * 0.55, w * 0.25, h * 0.2, 3); ctx.fill();
      ctx.fillStyle = paint;
      rr(x, y - h * 0.38, w, h * 0.38 - 3, 6); ctx.fill();
      lightY = y - h * 0.32;
      break;
    }
    case 'umzug': {
      const boxTop = top + 2;
      drawBoxTruck(c, paint, boxTop, 0.74);
      ctx.fillStyle = '#fff';
      rr(x + w * 0.08, boxTop + 10, w * 0.56, 18, 4); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('UMZUG', x + w * 0.36, boxTop + 20);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('🛋️', x + w * 0.36, boxTop + 42);
      lightY = y - h * 0.4;
      break;
    }
    case 'oldtimer': {
      const { bodyTop } = drawCabin(c, paint, [0.24, 0.27, 0.6, 0.64], top, 0.55);
      ctx.fillStyle = '#1f2026'; // Kotflügel und Trittbrett
      for (const fx of [x + w * 0.2, x + w * 0.8]) {
        ctx.beginPath(); ctx.ellipse(fx, y - r, r + 7, r + 5, 0, Math.PI, 0); ctx.fill();
      }
      ctx.fillRect(x + w * 0.28, y - r * 0.9, w * 0.44, 3);
      ctx.fillStyle = '#fff3b0'; // runder Scheinwerfer
      circle(x + w - 5, bodyTop + 4, 5);
      lightY = bodyTop + 5;
      break;
    }
    case 'muscle': {
      const { bodyTop, bodyH } = drawCabin(c, paint, [0.3, 0.38, 0.6, 0.72], top, 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; // Rennstreifen
      ctx.fillRect(x, bodyTop + bodyH * 0.3, w, 3);
      ctx.fillRect(x, bodyTop + bodyH * 0.3 + 6, w, 3);
      ctx.fillStyle = '#1f2026'; // Lufthutze
      rr(x + w * 0.76, bodyTop - 5, 14, 6, 2); ctx.fill();
      lightY = bodyTop + 5;
      break;
    }
    case 'bakery': {
      const boxTop = top + 4;
      drawBoxTruck(c, paint, boxTop, 0.72);
      const bx = x + w * 0.36, by = boxTop + (y - boxTop) * 0.35;
      ctx.fillStyle = '#c8955a'; // Brot
      ctx.beginPath(); ctx.ellipse(bx, by, 22, 9, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8d5a2b';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(bx + i * 10 - 3, by - 5); ctx.lineTo(bx + i * 10 + 3, by + 5); ctx.stroke();
      }
      lightY = y - h * 0.4;
      break;
    }
    case 'towtruck': {
      const chassisTop = y - h * 0.42;
      drawChassis(c, chassisTop);
      ctx.strokeStyle = '#4b5563'; // Ausleger mit Haken
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + w * 0.55, chassisTop); ctx.lineTo(x + w * 0.12, top + 8); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * 0.12, top + 8); ctx.lineTo(x + w * 0.12, y - h * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w * 0.12 - 4, y - h * 0.35, 4, 0, Math.PI); ctx.stroke();
      ctx.lineCap = 'butt';
      drawFrontCab(c, paint, 0.62, top + 6);
      amberLight(x + w * 0.66, top);
      lightY = y - h * 0.4;
      break;
    }
    case 'buggy': {
      const bodyTop = y - h * 0.5;
      ctx.strokeStyle = '#2b2b2b'; // Überrollbügel
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.25, bodyTop); ctx.lineTo(x + w * 0.32, top + 2);
      ctx.lineTo(x + w * 0.62, top + 2); ctx.lineTo(x + w * 0.72, bodyTop);
      ctx.stroke();
      ctx.fillStyle = '#f2c9a0';
      circle(x + w * 0.5, top + h * 0.3, 6);
      ctx.fillStyle = paint;
      poly([[x + 2, bodyTop], [x + w * 0.85, bodyTop + 2], [x + w, y - h * 0.35], [x + w * 0.9, y - r - 2], [x + w * 0.1, y - r - 2], [x, y - h * 0.32]]);
      lightY = y - h * 0.42;
      break;
    }
    case 'tuktuk': {
      ctx.fillStyle = paint; // Dach
      rr(x + w * 0.04, top, w * 0.82, h * 0.16, 8); ctx.fill();
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(x + w * 0.08, top + h * 0.16, 3, h * 0.4);
      ctx.fillRect(x + w * 0.78, top + h * 0.16, 3, h * 0.4);
      ctx.fillStyle = '#f2c9a0';
      circle(x + w * 0.66, top + h * 0.34, 6);
      ctx.fillStyle = GLASS;
      poly([[x + w * 0.82, top + h * 0.16], [x + w * 0.86, top + h * 0.16], [x + w * 0.9, y - h * 0.5], [x + w * 0.84, y - h * 0.5]]);
      ctx.fillStyle = paint;
      rr(x, y - h * 0.5, w * 0.84, h * 0.5 - 4, 6); ctx.fill();
      rr(x + w * 0.78, y - h * 0.56, w * 0.22, h * 0.4, 6); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x + 4, y - h * 0.32, w * 0.7, 3);
      lightY = y - h * 0.45;
      break;
    }
    case 'doubledecker': {
      ctx.fillStyle = paint;
      rr(x, top, w, h - r * 0.4, 10); ctx.fill();
      ctx.fillStyle = GLASS;
      const n = Math.floor((w - 30) / 24);
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < n; i++) { rr(x + 8 + i * 24, top + 6 + row * h * 0.36, 18, h * 0.22, 3); ctx.fill(); }
      }
      rr(x + w - 14, top + 6 + h * 0.36, 10, h * 0.3, 3); ctx.fill();
      ctx.fillStyle = '#f5d000';
      ctx.fillRect(x, top + h * 0.31, w, 3);
      lightY = y - h * 0.3;
      break;
    }
    case 'cement': {
      drawChassis(c, y - h * 0.4);
      const dx = x + w * 0.35, dy = y - h * 0.58;
      ctx.save(); // drehende Trommel
      ctx.beginPath(); ctx.ellipse(dx, dy, w * 0.3, h * 0.3, -0.12, 0, Math.PI * 2);
      ctx.fillStyle = paint;
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      const off = (time * 40) % 24;
      for (let sx = dx - w * 0.4 - 24 + off; sx < dx + w * 0.4; sx += 24) {
        poly([[sx, dy - h * 0.35], [sx + 10, dy - h * 0.35], [sx + 30, dy + h * 0.35], [sx + 20, dy + h * 0.35]]);
      }
      ctx.restore();
      drawFrontCab(c, paint, 0.68, top + 8);
      lightY = y - h * 0.4;
      break;
    }
    case 'armored': {
      const boxTop = top + 4;
      drawBoxTruck(c, paint, boxTop, 0.74);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; // Nieten
      for (let rx = x + 8; rx < x + w * 0.72; rx += 12) {
        circle(rx, boxTop + 6, 1.8);
        circle(rx, y - r * 0.4 - 6, 1.8);
      }
      ctx.fillStyle = '#1f2937'; // Sehschlitze
      rr(x + w * 0.1, boxTop + 12, w * 0.12, 6, 2); ctx.fill();
      rr(x + w * 0.5, boxTop + 12, w * 0.12, 6, 2); ctx.fill();
      drawCoin(x + w * 0.36, boxTop + (y - boxTop) * 0.5, 11, 0);
      lightY = y - h * 0.4;
      break;
    }
    case 'snowplow': {
      const chassisTop = y - h * 0.42;
      drawChassis(c, chassisTop);
      ctx.fillStyle = '#f8fafc'; // Schnee in der Mulde
      ctx.beginPath(); ctx.ellipse(x + w * 0.3, top + 16, w * 0.26, 12, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = paint;
      poly([[x, top + 14], [x + w * 0.58, top + 14], [x + w * 0.56, chassisTop + 2], [x + w * 0.03, chassisTop + 2]]);
      drawFrontCab(c, paint, 0.6, top + 4);
      ctx.fillStyle = '#9ca3af'; // Pflugschild
      poly([[x + w * 0.9, y - h * 0.42], [x + w, y - h * 0.5], [x + w + 4, y - 2], [x + w * 0.9, y - 6]]);
      amberLight(x + w * 0.7, top - 2);
      lightY = null;
      break;
    }
    case 'crane': {
      const chassisTop = y - h * 0.38;
      drawChassis(c, chassisTop);
      ctx.fillStyle = paint; // Drehteller
      rr(x + w * 0.2, chassisTop - 14, w * 0.3, 14, 3); ctx.fill();
      const bx0 = x + w * 0.28, by0 = chassisTop - 10, bx1 = x + w * 0.92, by1 = top + 2;
      ctx.strokeStyle = paint; // Ausleger als Gitter
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx1, by1); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      for (let t = 0.1; t < 1; t += 0.12) {
        const px = bx0 + (bx1 - bx0) * t, py = by0 + (by1 - by0) * t;
        ctx.beginPath(); ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3); ctx.stroke();
      }
      ctx.strokeStyle = '#333'; // Seil und Haken
      ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx1, by1 + 22); ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.fillRect(bx1 - 3, by1 + 22, 6, 5);
      drawFrontCab(c, paint, 0.78, top + h * 0.35);
      lightY = y - h * 0.32;
      break;
    }
    case 'hotdog': {
      const bodyTop = top + 16;
      ctx.fillStyle = paint;
      rr(x, bodyTop, w, y - r * 0.4 - bodyTop, 9); ctx.fill();
      ctx.fillStyle = GLASS;
      rr(x + w * 0.12, bodyTop + 8, w * 0.45, (y - bodyTop) * 0.32, 3); ctx.fill();
      rr(x + w - 16, bodyTop + 8, 11, (y - bodyTop) * 0.4, 3); ctx.fill();
      ctx.fillStyle = '#e3a857'; // Riesen-Hotdog auf dem Dach
      rr(x + w * 0.15, top + 4, w * 0.6, 12, 6); ctx.fill();
      ctx.fillStyle = '#b4432c';
      rr(x + w * 0.1, top + 1, w * 0.7, 8, 4); ctx.fill();
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const zx = x + w * 0.14 + i * w * 0.075, zy = top + 3 + (i % 2) * 4;
        if (i) ctx.lineTo(zx, zy); else ctx.moveTo(zx, zy);
      }
      ctx.stroke();
      lightY = y - h * 0.4;
      break;
    }
    case 'policebike': {
      ctx.fillStyle = paint; // Verkleidung
      poly([[x + w * 0.1, y - h * 0.38], [x + w * 0.62, y - h * 0.42], [x + w * 0.88, y - h * 0.62], [x + w * 0.95, y - h * 0.4],
        [x + w * 0.8, y - r], [x + w * 0.25, y - r]]);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(x + w * 0.2, y - h * 0.32, w * 0.6, 4);
      ctx.fillStyle = '#1f2937'; // Fahrer mit Helm
      rr(x + w * 0.35, y - h * 0.75, w * 0.22, h * 0.38, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      circle(x + w * 0.48, y - h * 0.82, 7);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + w * 0.48, y - h * 0.85, 7, 3);
      blueLight(x + w * 0.12, y - h * 0.38, 0);
      lightY = y - h * 0.5;
      break;
    }
    case 'amphibian': {
      const hullTop = y - h * 0.55;
      ctx.fillStyle = GLASS; // Windschutz
      poly([[x + w * 0.5, hullTop], [x + w * 0.58, top + 4], [x + w * 0.62, top + 4], [x + w * 0.6, hullTop]]);
      ctx.fillStyle = '#f2c9a0';
      circle(x + w * 0.42, top + h * 0.3, 6);
      ctx.fillStyle = paint; // Bootsrumpf
      poly([[x, hullTop], [x + w * 0.8, hullTop], [x + w, hullTop - 8], [x + w * 0.92, y - r - 2], [x + w * 0.08, y - r - 2]]);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, hullTop + 6, w * 0.85, 3);
      ctx.strokeStyle = '#e02424'; // Rettungsring
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x + w * 0.25, hullTop + 14, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#6b7280'; // Propeller
      ctx.fillRect(x - 6, y - r - 4, 6, 3);
      ctx.fillRect(x - 8, y - r - 9 + Math.sin(time * 30) * 3, 3, 12);
      lightY = hullTop + 4;
      break;
    }
    case 'heli': {
      const cy = y - h * 0.45;
      ctx.fillStyle = '#4b5563'; // Kufen
      ctx.fillRect(x + w * 0.35, y - 4, w * 0.5, 3);
      ctx.fillRect(x + w * 0.42, y - 12, 3, 9);
      ctx.fillRect(x + w * 0.75, y - 12, 3, 9);
      ctx.fillStyle = paint; // Heckausleger und Leitwerk
      poly([[x + w * 0.05, cy - 10], [x + w * 0.45, cy - 6], [x + w * 0.45, cy + 4], [x + w * 0.05, cy - 4]]);
      ctx.fillRect(x + w * 0.03, cy - 22, 6, 18);
      ctx.fillStyle = '#333'; // Heckrotor
      const tail = Math.sin(time * 40) * 9;
      ctx.fillRect(x + w * 0.05 - 1, cy - 14 - Math.abs(tail) / 2, 2, Math.abs(tail) + 2);
      ctx.fillStyle = paint; // Kabine
      ctx.beginPath(); ctx.ellipse(x + w * 0.66, cy, w * 0.3, h * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = GLASS;
      ctx.beginPath(); ctx.ellipse(x + w * 0.78, cy - 4, w * 0.13, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333'; // Hauptrotor
      ctx.fillRect(x + w * 0.64, top + 6, 4, cy - h * 0.32 - top - 6);
      const span = Math.abs(Math.cos(time * 25)) * w * 0.55 + 6;
      ctx.fillRect(x + w * 0.66 - span, top + 3, span * 2, 3);
      lightY = null;
      break;
    }
    case 'dragster': {
      const bottom = y - 8;
      ctx.fillStyle = '#1f2026'; // Heckflügel
      ctx.fillRect(x + 2, top, w * 0.14, 5);
      ctx.fillRect(x + w * 0.07, top, 4, h * 0.4);
      ctx.fillStyle = paint;
      poly([[x + w * 0.04, y - h * 0.62], [x + w * 0.3, y - h * 0.62], [x + w * 0.36, y - h * 0.8], [x + w * 0.42, y - h * 0.62],
        [x + w, bottom - 2], [x + w, bottom], [x + w * 0.04, bottom]]);
      ctx.fillStyle = '#fff'; // Helm
      circle(x + w * 0.37, y - h * 0.82, 6);
      ctx.fillStyle = '#222';
      ctx.fillRect(x + w * 0.37, y - h * 0.86, 6, 3);
      ctx.fillStyle = '#c0c7d2'; // Motor
      ctx.fillRect(x + w * 0.2, y - h * 0.72, 8, 6);
      lightY = y - h * 0.2;
      break;
    }
    case 'hovercraft': {
      const hover = Math.sin(time * 6 + c.seed * 5) * 2;
      ctx.fillStyle = '#1f2026'; // Luftkissen-Schürze
      rr(x + 2, y - 14 + hover, w - 4, 14, 7); ctx.fill();
      ctx.fillStyle = paint;
      rr(x + w * 0.05, y - h * 0.5 + hover, w * 0.9, h * 0.25, 6); ctx.fill();
      rr(x + w * 0.4, top + h * 0.2 + hover, w * 0.4, h * 0.3, 6); ctx.fill();
      ctx.fillStyle = GLASS;
      rr(x + w * 0.62, top + h * 0.25 + hover, w * 0.15, h * 0.15, 3); ctx.fill();
      const fx = x + w * 0.18, fy = top + h * 0.3 + hover; // Propeller im Käfig
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx, fy, h * 0.28, 0, Math.PI * 2); ctx.stroke();
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(time * 20);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(-2, -h * 0.25, 4, h * 0.5);
      ctx.restore();
      lightY = y - h * 0.45 + hover;
      break;
    }
    case 'treasure': {
      const boxTop = top + 18;
      drawBoxTruck(c, paint, boxTop, 0.74);
      const tx = x + w * 0.36; // Schatztruhe mit Goldstücken
      ctx.fillStyle = '#ffd700';
      circle(tx - 14, boxTop - 12, 5); circle(tx + 14, boxTop - 13, 5); circle(tx, boxTop - 17, 5);
      ctx.fillStyle = '#8b5a2b';
      rr(tx - 20, boxTop - 14, 40, 14, 3); ctx.fill();
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(tx - 20, boxTop - 9, 40, 3);
      ctx.fillRect(tx - 3, boxTop - 12, 6, 7);
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', tx, boxTop + (y - boxTop) * 0.38);
      lightY = y - h * 0.4;
      break;
    }
    case 'dragon': {
      const { bodyTop } = drawSedan(c, paint, top + 14);
      const flap = Math.sin(time * 6 + c.seed * 4) * 6;
      ctx.fillStyle = '#1b7a33'; // Flügel
      poly([[x + w * 0.35, top + 16], [x + w * 0.2, top + 2 - flap], [x + w * 0.42, top + 8], [x + w * 0.55, top - 2 - flap], [x + w * 0.58, top + 16]]);
      ctx.strokeStyle = paint; // Schwanz
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 4, bodyTop + 6); ctx.quadraticCurveTo(x - 14, bodyTop - 4 + flap / 2, x - 10, bodyTop - 16); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = paint; // Kopf mit Horn und Auge
      poly([[x + w * 0.82, bodyTop + 2], [x + w * 0.9, bodyTop - 14], [x + w + 8, bodyTop - 8], [x + w + 8, bodyTop], [x + w, bodyTop + 6]]);
      ctx.fillStyle = '#ffd166';
      poly([[x + w * 0.88, bodyTop - 13], [x + w * 0.86, bodyTop - 22], [x + w * 0.92, bodyTop - 14]]);
      ctx.fillStyle = '#fff';
      circle(x + w * 0.95, bodyTop - 7, 3);
      ctx.fillStyle = '#111';
      circle(x + w * 0.955, bodyTop - 7, 1.5);
      lightY = bodyTop + 5;
      break;
    }
    case 'shuttle': {
      const by = y - h * 0.42;
      if (c.fly) { // Triebwerksfeuer
        ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffb020' : '#ff5d2a';
        poly([[x, by - 8], [x - 60 - rand(0, 25), by], [x, by + 8]]);
      }
      ctx.fillStyle = paint; // Leitwerk
      poly([[x + w * 0.02, by - 6], [x + w * 0.08, top], [x + w * 0.16, top], [x + w * 0.2, by - 6]]);
      poly([[x, by - 8], [x + w * 0.8, by - 10], [x + w, by + 2], [x + w * 0.8, by + 10], [x, by + 10]]); // Rumpf
      ctx.fillStyle = '#1f2937'; // Hitzeschild
      poly([[x, by + 6], [x + w * 0.8, by + 6], [x + w, by + 2], [x + w * 0.8, by + 10], [x, by + 10]]);
      ctx.fillStyle = '#cbd5e1'; // Flügel
      poly([[x + w * 0.25, by + 4], [x + w * 0.6, by + 4], [x + w * 0.3, by + 16]]);
      ctx.fillStyle = '#1f2937'; // Cockpit
      poly([[x + w * 0.83, by - 8], [x + w * 0.92, by - 4], [x + w * 0.84, by - 2]]);
      ctx.fillStyle = '#e11d48';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('RETTER', x + w * 0.35, by);
      ctx.fillStyle = '#4b5563'; // Fahrwerk
      ctx.fillRect(x + w * 0.2, by + 10, 3, y - r - by - 10);
      ctx.fillRect(x + w * 0.8, by + 10, 3, y - r - by - 10);
      lightY = null;
      break;
    }
    case 'timemachine': {
      const bottom = y - r * 0.4;
      ctx.fillStyle = paint;
      poly([[x, bottom], [x, y - h * 0.62], [x + w * 0.3, top + 2], [x + w * 0.62, top + 2], [x + w * 0.8, y - h * 0.55],
        [x + w, y - h * 0.45], [x + w, bottom]]);
      ctx.fillStyle = '#334155'; // dunkle Scheiben
      poly([[x + w * 0.34, top + 6], [x + w * 0.6, top + 6], [x + w * 0.74, y - h * 0.55], [x + w * 0.3, y - h * 0.55]]);
      ctx.save(); // leuchtende Linien
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10 + (0.5 + 0.5 * Math.sin(time * 8)) * 10;
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(x + 4, y - h * 0.38, w - 8, 3);
      ctx.fillRect(x + w * 0.08, y - h * 0.62, 4, h * 0.3);
      ctx.restore();
      ctx.fillStyle = '#94a3b8'; // Rohre hinten
      ctx.fillRect(x - 6, y - h * 0.55, 8, 4);
      ctx.fillRect(x - 6, y - h * 0.45, 8, 4);
      lightY = y - h * 0.45;
      break;
    }
    case 'unicorn': {
      const { bodyTop } = drawSedan(c, paint, top + 12);
      [0, 35, 55, 120, 210, 275].forEach((hue, i) => { // Regenbogen-Mähne
        ctx.fillStyle = 'hsl(' + hue + ', 90%, 62%)';
        rr(x + w * 0.28 + i * w * 0.06, top + 6 + Math.sin(time * 5 + i) * 2, w * 0.07, 8, 3); ctx.fill();
      });
      ctx.fillStyle = '#ffd166'; // Horn
      poly([[x + w * 0.66, top + 14], [x + w * 0.74, top - 4], [x + w * 0.72, top + 14]]);
      ctx.strokeStyle = 'hsl(' + ((time * 120) % 360) + ', 90%, 65%)'; // Schweif
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 2, bodyTop + 4); ctx.quadraticCurveTo(x - 16, bodyTop + 8, x - 10, bodyTop + 20); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#6d28d9';
      circle(x + w * 0.86, bodyTop + 6, 3);
      lightY = bodyTop + 8;
      break;
    }
    case 'royal': {
      const boxTop = top + 14, boxBot = y - h * 0.3;
      ctx.fillStyle = '#5b3a1a'; // Kutschbock
      ctx.fillRect(x + w * 0.8, y - h * 0.45, w * 0.2, 5);
      ctx.fillStyle = paint;
      rr(x + w * 0.08, boxTop, w * 0.72, boxBot - boxTop, 12); ctx.fill();
      ctx.strokeStyle = '#fff6c2'; // Verzierung
      ctx.lineWidth = 2;
      rr(x + w * 0.12, boxTop + 4, w * 0.64, boxBot - boxTop - 8, 9); ctx.stroke();
      ctx.fillStyle = GLASS;
      rr(x + w * 0.3, boxTop + 9, w * 0.28, (boxBot - boxTop) * 0.4, 6); ctx.fill();
      ctx.fillStyle = '#ffd700'; // Krone
      poly([[x + w * 0.34, boxTop], [x + w * 0.34, boxTop - 12], [x + w * 0.39, boxTop - 6], [x + w * 0.44, boxTop - 14],
        [x + w * 0.49, boxTop - 6], [x + w * 0.54, boxTop - 12], [x + w * 0.54, boxTop]]);
      ctx.fillStyle = '#e11d48';
      circle(x + w * 0.44, boxTop - 4, 2.5);
      lightY = null;
      break;
    }
    default: // car, mini
      drawSedan(c, paint, top);
  }
  if (KINDS[c.kind].badge) { // Bildchen für Fahrzeuge, die wie ein anderes gezeichnet werden
    ctx.font = Math.round(Math.min(26, h * 0.42)) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(KINDS[c.kind].badge, x + w * 0.45, y - h * 0.42);
  }

  if (lightY !== null) {
    // Lichter: vorne (rechts) Scheinwerfer, hinten (links) Rücklicht
    ctx.fillStyle = '#fff3b0';
    rr(x + w - 6, lightY, 6, 7, 2); ctx.fill();
    ctx.save();
    if (c.stopped) { ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 14; }
    ctx.fillStyle = c.stopped ? '#ff3030' : '#a32020';
    rr(x, lightY, 5, 8, 2); ctx.fill();
    ctx.restore();

    // Warnblinker, wenn angehalten
    if (c.stopped && Math.floor(time * 3) % 2 === 0) {
      ctx.save();
      ctx.shadowColor = '#ffa500';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffb020';
      rr(x - 1, lightY + 9, 6, 5, 2); ctx.fill();
      rr(x + w - 5, lightY + 9, 6, 5, 2); ctx.fill();
      ctx.restore();
    }
  }

  // Räder
  for (const [wx, wr] of wheels(c)) {
    const wy = y - wr;
    const rot = c.rot * r / wr;
    ctx.fillStyle = '#16171b';
    ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9aa0aa';
    ctx.beginPath(); ctx.arc(wx, wy, wr * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#555a63';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + Math.cos(rot) * wr * 0.5, wy + Math.sin(rot) * wr * 0.5);
    ctx.lineTo(wx - Math.cos(rot) * wr * 0.5, wy - Math.sin(rot) * wr * 0.5);
    ctx.stroke();
  }

  drawCarIcons(c, x + w / 2, top - 20);

  // Glitzer auf Spezial-Lack (Diamant und Obsidian funkeln am meisten)
  if (c.special) {
    ctx.fillStyle = c.special === 'obsidian' ? '#c9a2ff' : '#fff';
    for (let k = 0; k < (c.special === 'diamond' || c.special === 'obsidian' ? 6 : 3); k++) {
      const phase = time * 2.5 + c.seed * 10 + k * 2.1;
      const cycle = Math.floor(phase / Math.PI);
      const glow = Math.sin(phase);
      if (glow <= 0) continue;
      const fx = ((c.seed * 7.3 + k * 0.37 + cycle * 0.618) % 1);
      const fy = ((c.seed * 3.1 + k * 0.53 + cycle * 0.382) % 1);
      drawSparkle(x + 8 + fx * (w - 16), y - h + 6 + fy * (h * 0.6), 6 * glow);
    }
  }
  ctx.restore();
}

// Symbole über einem Fahrzeug: Fähigkeit, Stopp-Schild, Spezial-Lack
function drawCarIcons(c, ix, iy) {
  const power = abilityIcon(c);
  if (power) {
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(power, ix, iy + Math.sin(time * 5 + c.seed * 6) * 2);
    iy -= 26;
  }
  if (c.stopped) {
    ctx.fillStyle = '#e02424';
    ctx.beginPath(); ctx.arc(ix, iy, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(ix - 7, iy - 2.5, 14, 5);
  } else if (c.special === 'gold') {
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', ix, iy + Math.sin(time * 6) * 3);
  } else if (c.special === 'rainbow') {
    drawRainbowIcon(ix, iy + Math.sin(time * 6) * 3);
  } else if (c.special === 'diamond') {
    ctx.font = '22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💎', ix, iy + Math.sin(time * 6) * 3);
  } else if (c.special === 'obsidian') {
    drawObsidianIcon(ix, iy + Math.sin(time * 6) * 3);
  }
}

function drawWreck(wk) {
  const alpha = Math.min(1, (2.5 - wk.t) / 0.6);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = carPaint(wk);
  ctx.beginPath();
  ctx.moveTo(wk.x, ROAD_Y);
  for (let i = 0; i <= 10; i++) {
    ctx.lineTo(wk.x + (wk.w * i) / 10, ROAD_Y - 8 - ((i * 7) % 5));
  }
  ctx.lineTo(wk.x + wk.w, ROAD_Y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#16171b';
  ctx.fillRect(wk.x + 6, ROAD_Y - 4, 18, 4);
  ctx.fillRect(wk.x + wk.w - 24, ROAD_Y - 4, 18, 4);
  ctx.globalAlpha = 1;
}

function drawPress(p) {
  const x = p.x;
  const danger = p.phase === 'warn' || p.phase === 'slam' || p.phase === 'hold';

  // Gefahrenzone am Boden
  if (p.phase === 'warn' && Math.floor(time * 8) % 2 === 0) {
    ctx.fillStyle = 'rgba(255, 50, 50, 0.22)';
    ctx.fillRect(x, PLATE_UP, PRESS_W, ROAD_Y - PLATE_UP);
  }
  ctx.fillStyle = danger ? '#c0392b' : '#6b4f1d';
  ctx.fillRect(x, ROAD_Y, PRESS_W, 4);

  // Säulen und Querbalken
  ctx.fillStyle = '#4a5160';
  ctx.fillRect(x - 22, BEAM_Y, 16, ROAD_Y - BEAM_Y);
  ctx.fillRect(x + PRESS_W + 6, BEAM_Y, 16, ROAD_Y - BEAM_Y);
  ctx.fillStyle = '#5c6475';
  rr(x - 30, BEAM_Y - 30, PRESS_W + 60, 40, 6); ctx.fill();

  // Hydraulikzylinder
  const plateTop = p.y - PLATE_H;
  ctx.fillStyle = '#3d4350';
  ctx.fillRect(x + PRESS_W / 2 - 20, BEAM_Y + 10, 40, 50);
  const pg = ctx.createLinearGradient(x + PRESS_W / 2 - 12, 0, x + PRESS_W / 2 + 12, 0);
  pg.addColorStop(0, '#8b93a3');
  pg.addColorStop(0.5, '#e4e8ef');
  pg.addColorStop(1, '#8b93a3');
  ctx.fillStyle = pg;
  ctx.fillRect(x + PRESS_W / 2 - 12, BEAM_Y + 60, 24, Math.max(0, plateTop - BEAM_Y - 60));

  // Pressplatte mit Warnstreifen
  ctx.save();
  rr(x - 4, plateTop, PRESS_W + 8, PLATE_H, 4);
  ctx.clip();
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(x - 4, plateTop, PRESS_W + 8, PLATE_H);
  ctx.fillStyle = '#1d1d1d';
  for (let sx = -40; sx < PRESS_W + 40; sx += 22) {
    ctx.beginPath();
    ctx.moveTo(x + sx, plateTop + PLATE_H);
    ctx.lineTo(x + sx + 11, plateTop + PLATE_H);
    ctx.lineTo(x + sx + 11 + PLATE_H, plateTop);
    ctx.lineTo(x + sx + PLATE_H, plateTop);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#2b2e36';
  ctx.fillRect(x - 4, p.y - 5, PRESS_W + 8, 5);

  // Warnlampe mit Countdown-Ring
  const lx = x + PRESS_W / 2, ly = BEAM_Y - 10;
  let lamp = '#2ecc71';
  if (danger) lamp = Math.floor(time * 10) % 2 === 0 ? '#ff3b3b' : '#6b1515';
  else if (p.phase === 'rise') lamp = '#f39c12';
  else if (p.phase === 'off') lamp = { ice: '#d9f7ff', water: '#3b9cff', lift: '#f6b500', fire: '#ff7b2e', firework: '#d58bff', time: '#5eead4' }[p.off];
  ctx.save();
  ctx.shadowColor = lamp;
  ctx.shadowBlur = danger ? 22 : 10;
  ctx.fillStyle = lamp;
  ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (p.phase === 'idle') {
    const frac = Math.max(0, p.t / p.t0);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(lx, ly, 14, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // Ausgeschaltet: Eiszapfen bzw. Wasser und ein Schild mit Countdown auf der Platte
  if (p.phase === 'off') {
    const plateTop = p.y - PLATE_H;
    if (p.off === 'ice') {
      ctx.fillStyle = 'rgba(200, 245, 255, 0.55)';
      rr(x - 6, plateTop - 4, PRESS_W + 12, PLATE_H + 4, 6); ctx.fill();
      ctx.fillStyle = '#e6fbff';
      for (let ix = x + 4; ix < x + PRESS_W; ix += 14) {
        poly([[ix, p.y], [ix + 8, p.y], [ix + 4, p.y + 8 + ((ix * 7) % 9)]]);
      }
    }
    drawOffLabel(p, x + PRESS_W / 2, plateTop + PLATE_H / 2);
  }
}

function drawOffLabel(p, cx, cy) {
  const label = { ice: '❄️ AUS ', water: '💧 AUS ', lift: '🏗️ HALT ', fire: '🔥 AUS ', firework: '🎆 AUS ', time: '⏳ STOPP ' }[p.off] + Math.ceil(p.t);
  ctx.fillStyle = { ice: '#2a7fa8', water: '#1d5fbf', lift: '#9a6b00', fire: '#b4400c', firework: '#6d28d9', time: '#0e7490' }[p.off];
  rr(cx - PRESS_W / 2 + 12, cy - PLATE_H / 2 + 5, PRESS_W - 24, PLATE_H - 10, 6); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);
}

// --- Über der 3D-Presse: Symbole, Countdown, Schilder (Positionen kommen von der 3D-Kamera) ---
function in3D() { return press3d && (state === 'title' || state === 'play' || state === 'over'); }
function screenPos(lx, ly) { return in3D() ? press3d.project(lx, ly) : { x: lx, y: ly }; }

function drawSceneOverlay() {
  for (const p of presses) {
    if (p.phase === 'idle') { // Countdown-Ring um die Warnlampe
      const l = screenPos(p.x + PRESS_W / 2, press3d.lampY());
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 15, -Math.PI / 2, -Math.PI / 2 + Math.max(0, p.t / p.t0) * Math.PI * 2);
      ctx.stroke();
    }
    if (p.phase === 'off') {
      const c = screenPos(p.x + PRESS_W / 2, p.y - PLATE_H / 2);
      drawOffLabel(p, c.x, c.y);
    }
  }
  for (const c of cars) {
    const top = screenPos(c.x + c.w / 2, ROAD_Y - c.h - (c.alt || 0));
    drawCarIcons(c, top.x, top.y - 22);
  }
}

function drawHUD() {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rr(12, 10, 400, 40, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText('Gerettet: ' + saved, 24, 18);
  ctx.fillStyle = '#ffe066';
  ctx.fillText('Lvl ' + level, 190, 18);
  drawCoin(296, 30, 12, 0);
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(wallet), 314, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rr(W - 150, 10, 138, 40, 10); ctx.fill();
  ctx.fillStyle = vehiclesLeft() > 1 ? '#fff' : '#ff5d73';
  ctx.textAlign = 'right';
  ctx.fillText('🚗 ' + vehiclesLeft() + ' / ' + roster.length, W - 24, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Rekord: ' + best, W - 20, 50);

  // Tipp zu einem neuen Fahrzeug
  if (tip) {
    const a = Math.min(1, tip.t * 4, (3.5 - tip.t) * 3);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = 'bold 20px system-ui, sans-serif';
    const tw = ctx.measureText(tip.text).width + 40;
    ctx.fillStyle = 'rgba(20, 30, 60, 0.9)';
    rr(W / 2 - tw / 2, 100, tw, 40, 12); ctx.fill();
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tip.text, W / 2, 121);
    ctx.globalAlpha = 1;
  }
}

function drawOverlay(title, lines, prompt) {
  ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(title, W / 2, 120);
  ctx.fillStyle = '#fff';
  ctx.font = '22px system-ui, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 200 + i * 33));
  if (prompt) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4);
    ctx.fillStyle = '#7dffb0';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(prompt, W / 2, 420);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  if (press3d && !in3D()) press3d.setVisible(false);
  if (state === 'select') { drawSelect(); return; }
  if (state === 'shop') { drawShop(); return; }
  if (state === 'collection') { drawCollection(); return; }
  if (state === 'reveal') { drawReveal(); return; }
  if (state === 'admin') { drawAdmin(); return; }
  if (state === 'racemenu') { drawRaceMenu(); return; }
  if (state === 'raceresult') { drawRaceResult(); return; }
  if (state === 'raceload') { drawLoading('🏁 RENNSTRECKE', 'Lade 3D-Rennstrecke'); return; }
  if (state === 'dragmenu') { drawDragMenu(); return; }
  if (state === 'dragresult') { drawDragResult(); return; }
  if (state === 'dragload') { drawLoading('🔥 DRAGSTER-BAHN', 'Lade 3D-Dragster-Bahn'); return; }
  ctx.save();
  if (in3D()) {
    ctx.clearRect(0, 0, W, H); // durchsichtig: darunter liegt die 3D-Szene
    press3d.render({ cars, presses, wrecks, coins, time, shake });
    drawSceneOverlay();
  } else {
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawBackground();
    for (const wk of wrecks) drawWreck(wk);
    for (const c of cars) if (!c.fly) drawCar(c);
    for (const p of presses) drawPress(p);
    for (const c of cars) if (c.fly) drawCar(c);
    drawCoins();
  }
  drawParticles();

  for (const f of floaters) {
    const dur = f.long ? 2 : 1;
    ctx.globalAlpha = Math.min(1, (dur - f.t) * 2);
    ctx.fillStyle = f.rainbow ? 'hsl(' + ((time * 300) % 360) + ', 90%, 65%)' : f.color;
    ctx.font = 'bold ' + f.size + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = ctx.measureText(f.text).width / 2 + 10;
    const fp = f.long ? f : screenPos(f.x, f.y); // grosse Meldungen stehen fest in der Bildmitte
    ctx.fillText(f.text, Math.max(half, Math.min(W - half, fp.x)), fp.y - f.t * (f.long ? 15 : 50));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (state !== 'title') drawHUD();

  if (state === 'title') {
    drawOverlay('CAR-SAVER', [
      '🏁 Rennstrecke: lenken, Gas, Bremse – gewinne Pokale in vier Cups!',
      '⚡ Je mehr PS dein Auto hat, desto schneller ist es im Rennen.',
      '🏭 Presse: Autos antippen = anhalten. Gerettet +1 PS, zerquetscht −3 PS.',
      '🪙 In der Presse sammelst du Münzen für neue Fahrzeuge im Shop.',
      '🔥 Dragster: 1 gegen 1 – wer gewinnt, bekommt das Auto des anderen!',
    ], null);
    drawTitleButtons();
    drawVersion();
  } else if (state === 'over') {
    drawOverlay('RUNDE VORBEI!', [
      'Punkte: ' + saved + '   ·   Level ' + level,
      saved >= best && saved > 0 ? 'Neuer Rekord! 🏆' : 'Rekord: ' + best,
      'Münzen in dieser Runde: +' + coinsThisGame + ' 🪙',
      '🚗 Alle deine Fahrzeuge sind wieder heil in der Garage.',
    ], null);
    if (overTime > 0.8) drawMenuButtons('▶ NOCHMAL');
  }
}

// ---------- Menüs: Start, Fahrzeugauswahl, Shop ----------
const PLAY_BTN = { x: W / 2 - 250, y: 420, w: 230, h: 62 };
const SHOP_BTN = { x: W / 2 + 20, y: 420, w: 230, h: 62 };
const BACK_BTN = { x: 20, y: 18, w: 140, h: 44 };
const ALL_BTN = { x: 615, y: 494, w: 180, h: 42 };
const SELL_BTN = { x: 165, y: 494, w: 180, h: 42 };
const PREV_BTN = { x: 20, y: 494, w: 130, h: 42 };
const NEXT_BTN = { x: W - 150, y: 494, w: 130, h: 42 };
const GO_BTN = { x: W / 2 - 120, y: 490, w: 240, h: 46 };
const CARDS_PER_PAGE = 15;
let menuMsg = '', menuMsgT = 0, selectPage = 0, reveal = null;
let sellMode = false, pendingSell = null;   // Verkaufen im Fahrzeugpark: zweimal antippen

const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const TIERS = {
  common:   { label: 'Normal', color: '#b8bec9' },
  uncommon: { label: 'Besonders', color: '#4ade80' },
  rare:     { label: 'Selten', color: '#60a5fa' },
  epic:     { label: 'Episch', color: '#c084fc' },
  legendary: { label: 'Legendär', color: '#ff9f1c' },
};

// Verkaufswert: Seltenheit mal Lack (ein episches Regenbogen-Fahrzeug ist viel mehr wert als ein normales goldenes)
const TIER_VALUE = { common: 5, uncommon: 12, rare: 25, epic: 50, legendary: 100 };
const PAINT_FACTOR = { gold: 2, rainbow: 3, diamond: 5, obsidian: 8 };
function vehicleValue(v) { return TIER_VALUE[KINDS[v.kind].tier] * (PAINT_FACTOR[v.special] || 1); }

// Garagentore im Shop: Chancen in Prozent je Seltenheit, dazu Gold- und Regenbogen-Lack
const GATES = [
  { name: 'Holztor', price: 24, color: '#a0703c',
    odds: { common: 70, uncommon: 25, rare: 5 }, gold: 4, rainbow: 1, diamond: 0, obsidian: 0 },
  { name: 'Stahltor', price: 48, color: '#8a94a6',
    odds: { common: 35, uncommon: 40, rare: 20, epic: 5 }, gold: 6, rainbow: 2, diamond: 0.5, obsidian: 0 },
  { name: 'Goldtor', price: 100, color: '#e0b030',
    odds: { common: 10, uncommon: 30, rare: 40, epic: 19, legendary: 1 }, gold: 10, rainbow: 4, diamond: 1, obsidian: 0.2 },
  { name: 'Diamanttor', price: 300, color: '#7fdcff',
    odds: { uncommon: 10, rare: 42, epic: 43, legendary: 5 }, gold: 15, rainbow: 8, diamond: 3, obsidian: 0.5 },
  { name: 'Obsidiantor', price: 500, color: '#2a2238', glint: '#c9a2ff',
    odds: { rare: 20, epic: 50, legendary: 30 }, gold: 15, rainbow: 10, diamond: 6, obsidian: 2 },
];

function inRect(px, py, b) { return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; }

function openMenu(name) {
  if (name === 'select') { trimSelection(); sellMode = false; pendingSell = null; }
  state = name;
  menuMsgT = 0;
  particles = [];
}

function showMenuMsg(text) {
  menuMsg = text;
  menuMsgT = 2.5;
}

function drawButton(b, text, color, size = 24) {
  ctx.fillStyle = color;
  rr(b.x, b.y, b.w, b.h, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 1);
}

// Versionsnummer (Anzahl Commits) und Zeitpunkt aus version.js, die der Server aus Git erzeugt
function versionText() {
  const v = window.GAME_VERSION;
  if (!v || !v.number) return 'Version: Entwicklung';
  let text = 'Version ' + v.number;
  if (v.date) {
    text += '  ·  ' + new Date(v.date).toLocaleString('de-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  if (v.dirty) text += '  (lokal geändert)';
  return text;
}

function drawVersion() {
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(versionText(), W - 12, H - 8);
}

function drawMenuButtons(playText) {
  const pulse = 1 + 0.03 * Math.sin(time * 4);
  ctx.save();
  ctx.translate(PLAY_BTN.x + PLAY_BTN.w / 2, PLAY_BTN.y + PLAY_BTN.h / 2);
  ctx.scale(pulse, pulse);
  ctx.translate(-(PLAY_BTN.x + PLAY_BTN.w / 2), -(PLAY_BTN.y + PLAY_BTN.h / 2));
  drawButton(PLAY_BTN, playText, '#21a35b');
  ctx.restore();
  drawButton(SHOP_BTN, '🏪 SHOP  🪙 ' + wallet, '#3657b8');
}

function drawParticles() {
  for (const pt of particles) {
    ctx.globalAlpha = 1 - pt.life / pt.max;
    ctx.fillStyle = pt.color;
    const sp = screenPos(pt.x, pt.y);
    ctx.fillRect(sp.x, sp.y, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawMenuBackdrop(title, showWallet) {
  drawBackground();
  ctx.fillStyle = 'rgba(10, 12, 18, 0.94)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, W / 2, 40);
  if (showWallet) {
    drawCoin(W - 120, 40, 16, time * 3);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(wallet), W - 96, 42);
  }
}

function drawMenuMsg(hint, my = 472) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (menuMsgT > 0) {
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(menuMsg, W / 2, my);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(hint, W / 2, my);
  }
}

// Fahrzeug aus dem Fahrzeugpark als Bild zeichnen (stehend, ohne Bewegung)
const previews = {};
function drawVehiclePreview(v, cx, baseY, maxW, maxScale) {
  if (!previews[v.id]) {
    previews[v.id] = carFromVehicle(v, 0);
    previews[v.id].seed = 0.4;
  }
  const c = previews[v.id];
  const s = Math.min(maxScale, maxW / c.w);
  ctx.save();
  ctx.translate(cx - (s * c.w) / 2, baseY - s * ROAD_Y);
  ctx.scale(s, s);
  drawCar(c);
  ctx.restore();
}

function specialLabel(v) {
  return { gold: '★ Gold', rainbow: '🌈 Regenbogen', diamond: '💎 Diamant', obsidian: '🖤 Obsidian' }[v.special] || '';
}

// --- Fahrzeugauswahl vor der Runde ---
function sortedFleet() {
  return [...fleet].sort((a, b) =>
    vehicleValue(b) - vehicleValue(a) || KINDS[a.kind].name.localeCompare(KINDS[b.kind].name));
}

function pageCount(n) { return Math.max(1, Math.ceil(n / CARDS_PER_PAGE)); }

function gridCards(items, page) {
  const cw = 172, ch = 124, gap = 10, left = (W - (5 * cw + 4 * gap)) / 2;
  return items.slice(page * CARDS_PER_PAGE, (page + 1) * CARDS_PER_PAGE).map((item, i) => ({
    item, w: cw, h: ch,
    x: left + (i % 5) * (cw + gap),
    y: 72 + Math.floor(i / 5) * (ch + 8),
  }));
}

function selectedVehicles() { return fleet.filter(v => selectedIds.has(v.id)); }

function saveSelection() { storeJSON('autoRetterSelected', [...selectedIds]); }

// Ältere Spielstände können mehr als 4 ausgewählt haben: die seltensten behalten
function trimSelection() {
  const keep = sortedFleet().filter(v => selectedIds.has(v.id)).slice(0, MAX_SELECTED);
  if (keep.length !== selectedIds.size) {
    selectedIds = new Set(keep.map(v => v.id));
    saveSelection();
  }
}

function drawSelect() {
  drawMenuBackdrop(sellMode ? 'FAHRZEUGE VERKAUFEN' : 'DEIN FAHRZEUGPARK', true);
  const items = sortedFleet();
  const pages = pageCount(items.length);
  selectPage = Math.min(selectPage, pages - 1);

  for (const card of gridCards(items, selectPage)) {
    const v = card.item, k = KINDS[v.kind], on = selectedIds.has(v.id);
    const armed = sellMode && pendingSell === v.id;
    ctx.fillStyle = armed ? 'rgba(231, 76, 60, 0.3)' : sellMode ? 'rgba(255, 255, 255, 0.07)'
      : on ? 'rgba(46, 204, 113, 0.16)' : 'rgba(255, 255, 255, 0.05)';
    rr(card.x, card.y, card.w, card.h, 12); ctx.fill();
    ctx.strokeStyle = armed ? '#e74c3c' : sellMode ? '#8a6d3b' : on ? '#2ecc71' : '#4a4f5c';
    ctx.lineWidth = armed || (on && !sellMode) ? 3 : 2;
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = on || sellMode ? 1 : 0.35;
    drawVehiclePreview(v, card.x + card.w / 2, card.y + 78, 125, 0.8);
    ctx.restore();

    // Wert oben links
    drawCoin(card.x + 16, card.y + 16, 8, 0);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(vehicleValue(v)), card.x + 28, card.y + 17);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(armed ? 'Verkaufen?' : k.name, card.x + card.w / 2, card.y + 94);
    ctx.fillStyle = armed ? '#ff9c8f' : TIERS[k.tier].color;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(armed ? 'Nochmal tippen = +' + vehicleValue(v) + ' 🪙'
      : TIERS[k.tier].label + (v.special ? '  ' + specialLabel(v) : ''), card.x + card.w / 2, card.y + 111);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('⚡' + v.ps + ' PS', card.x + card.w - 10, card.y + 17);
  }

  drawButton(BACK_BTN, '← Zurück', '#444b5c');
  drawButton(SELL_BTN, sellMode ? '✓ Fertig' : '💰 Verkaufen', sellMode ? '#21a35b' : '#8a6d3b', 20);
  if (selectPage > 0) drawButton(PREV_BTN, '◀ Zurück', '#444b5c', 20);
  if (selectPage < pages - 1) drawButton(NEXT_BTN, 'Weiter ▶', '#3657b8', 20);
  const pageInfo = pages > 1 ? '  Seite ' + (selectPage + 1) + '/' + pages : '';
  if (sellMode) {
    drawMenuMsg('Tippe ein Fahrzeug zweimal an, um es zu verkaufen.' + pageInfo);
  } else {
    if (selectedIds.size) drawButton(ALL_BTN, 'Keine', '#444b5c', 20);
    const n = selectedVehicles().length;
    drawButton(GO_BTN, '▶ LOS!  (' + n + ' von ' + MAX_SELECTED + ')', n ? '#21a35b' : '#555a66', 21);
    drawMenuMsg('Wähle bis zu ' + MAX_SELECTED + ' Fahrzeuge für die Runde aus.' + pageInfo);
  }
  drawParticles();
}

function sellVehicle(v, card) {
  if (fleet.length <= 1) {
    showMenuMsg('Dein letztes Fahrzeug kannst du nicht verkaufen!');
    beep(200, 0.15, 'square', 0.05);
    return;
  }
  const value = vehicleValue(v);
  fleet = fleet.filter(f => f !== v);
  selectedIds.delete(v.id);
  wallet += value;
  storeJSON('autoRetterFleet', fleet);
  storeJSON('autoRetterCoins', wallet);
  saveSelection();
  pendingSell = null;
  showMenuMsg(KINDS[v.kind].name + ' verkauft: +' + value + ' Münzen');
  for (let i = 0; i < 18; i++) {
    particles.push({
      x: card.x + card.w / 2, y: card.y + card.h / 2, vx: rand(-200, 200), vy: rand(-300, -60),
      life: 0, max: rand(0.5, 0.9), color: Math.random() < 0.5 ? '#ffd700' : '#fff6c2', size: rand(3, 6), g: 600,
    });
  }
  beep(1568, 0.07, 'square', 0.04);
  beep(2093, 0.12, 'square', 0.04, 0.07);
}

function selectTap(px, py) {
  const pages = pageCount(fleet.length);
  if (inRect(px, py, BACK_BTN)) { openMenu('title'); return; }
  if (inRect(px, py, SELL_BTN)) { sellMode = !sellMode; pendingSell = null; menuMsgT = 0; return; }
  if (selectPage > 0 && inRect(px, py, PREV_BTN)) { selectPage--; pendingSell = null; return; }
  if (selectPage < pages - 1 && inRect(px, py, NEXT_BTN)) { selectPage++; pendingSell = null; return; }
  if (!sellMode && selectedIds.size && inRect(px, py, ALL_BTN)) {
    selectedIds = new Set();
    saveSelection();
    return;
  }
  if (!sellMode && inRect(px, py, GO_BTN)) {
    const chosen = selectedVehicles();
    if (!chosen.length) {
      showMenuMsg('Wähle mindestens ein Fahrzeug aus!');
      beep(200, 0.15, 'square', 0.05);
      return;
    }
    saveSelection();
    start(chosen);
    return;
  }
  for (const card of gridCards(sortedFleet(), selectPage)) {
    if (!inRect(px, py, card)) continue;
    const v = card.item, id = v.id;
    if (sellMode) {
      if (pendingSell === id) sellVehicle(v, card);
      else { pendingSell = id; beep(440, 0.07, 'triangle', 0.06); }
      return;
    }
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else if (selectedIds.size >= MAX_SELECTED) {
      showMenuMsg('Du darfst nur ' + MAX_SELECTED + ' Fahrzeuge mitnehmen – tippe zuerst eines ab.');
      beep(200, 0.15, 'square', 0.05);
      return;
    } else {
      selectedIds.add(id);
    }
    saveSelection();
    beep(selectedIds.has(id) ? 660 : 330, 0.07, 'triangle', 0.06);
    return;
  }
  pendingSell = null; // daneben getippt: Verkauf abbrechen
}

// --- Shop mit Garagentoren ---
function gateCards() {
  const gw = 176, gap = 10, left = (W - (GATES.length * gw + (GATES.length - 1) * gap)) / 2;
  return GATES.map((gate, i) => ({ gate, x: left + i * (gw + gap), y: 72, w: gw, h: 400 }));
}

// Rolltor, das je nach open (0 = zu, 1 = offen) nach oben gerollt ist
function drawGateDoor(x, y, w, h, color, open) {
  ctx.strokeStyle = '#2b2e36';
  ctx.lineWidth = 8;
  rr(x - 4, y - 4, w + 8, h + 4, 6); ctx.stroke();
  const doorH = h * (1 - open);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, doorH);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let sy = y + doorH - 12; sy > y - 14; sy -= 14) ctx.fillRect(x, sy, w, 3);
  if (doorH > 20) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(x + w / 2 - 16, y + doorH - 14, 32, 6, 3); ctx.fill();
  }
  ctx.restore();
}

function drawShop() {
  drawMenuBackdrop('SHOP', true);
  drawButton(BACK_BTN, '← Zurück', '#444b5c');
  drawButton(COLLECTION_BTN, '📖 SAMMLUNG', '#7c3aed', 20);

  for (const card of gateCards()) {
    const g = card.gate, can = wallet >= g.price;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    rr(card.x, card.y, card.w, card.h, 12); ctx.fill();
    ctx.strokeStyle = can ? '#ffe066' : '#4a4f5c';
    ctx.lineWidth = can ? 3 : 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(g.name, card.x + card.w / 2, card.y + 24);
    drawGateDoor(card.x + 22, card.y + 48, card.w - 44, 104, g.color, 0);
    if (g.price >= 100) {
      ctx.fillStyle = g.glint || '#fff';
      for (let k = 0; k < 3; k++) {
        const glow = Math.sin(time * 3 + k * 2 + card.x);
        if (glow > 0) drawSparkle(card.x + 40 + k * 45, card.y + 70 + (k % 2) * 45, 7 * glow);
      }
    }

    // Chancen auf die Seltenheit
    let ly = card.y + 176;
    for (const t of TIER_ORDER) {
      if (!g.odds[t]) continue;
      ctx.fillStyle = TIERS[t].color;
      circle(card.x + 18, ly, 5);
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(TIERS[t].label, card.x + 30, ly + 1);
      ctx.textAlign = 'right';
      ctx.fillText(g.odds[t] + ' %', card.x + card.w - 14, ly + 1);
      ly += 21;
    }
    // Chancen auf Spezial-Lack
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px system-ui, sans-serif';
    [['★ Gold', g.gold], ['🌈 Regenbogen', g.rainbow], ['💎 Diamant', g.diamond], ['🖤 Obsidian', g.obsidian]]
      .forEach(([label, pct], i) => {
        ctx.textAlign = 'left';
        ctx.fillText(label, card.x + 12, card.y + 288 + i * 18);
        ctx.textAlign = 'right';
        ctx.fillText(pct + ' %', card.x + card.w - 14, card.y + 288 + i * 18);
      });

    drawCoin(card.x + card.w / 2 - 30, card.y + card.h - 26, 13, 0);
    ctx.fillStyle = can ? '#ffe066' : '#9aa0aa';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(g.price), card.x + card.w / 2 - 12, card.y + card.h - 24);
  }

  drawMenuMsg('Tippe ein Tor an, um es zu öffnen – dahinter wartet ein neues Fahrzeug!  Du hast ' + fleet.length + ' Fahrzeuge.', 490);
  drawParticles();
}

function rollGate(g) {
  const possible = TIER_ORDER.filter(t => g.odds[t] > 0);
  let tier = possible[possible.length - 1];
  let roll = Math.random() * 100;
  for (const t of possible) {
    roll -= g.odds[t];
    if (roll < 0) { tier = t; break; }
  }
  const kind = pick(Object.keys(KINDS).filter(kd => KINDS[kd].tier === tier));
  let sr = Math.random() * 100, special = null;
  for (const paint of ['obsidian', 'diamond', 'rainbow', 'gold']) {
    sr -= g[paint];
    if (sr < 0) { special = paint; break; }
  }
  return makeVehicle(kind, special);
}

function shopTap(px, py) {
  if (inRect(px, py, BACK_BTN)) { openMenu('title'); return; }
  if (inRect(px, py, COLLECTION_BTN)) { collectionPage = 0; openMenu('collection'); return; }
  for (const card of gateCards()) {
    if (!inRect(px, py, card)) continue;
    const g = card.gate;
    if (wallet < g.price) {
      const missing = g.price - wallet;
      showMenuMsg('Dir fehlen noch ' + missing + (missing === 1 ? ' Münze' : ' Münzen') + ' für das ' + g.name + '.');
      beep(200, 0.15, 'square', 0.05);
      return;
    }
    wallet -= g.price;
    const v = rollGate(g);
    fleet.push(v);
    if (selectedIds.size < MAX_SELECTED) selectedIds.add(v.id);
    storeJSON('autoRetterCoins', wallet);
    storeJSON('autoRetterFleet', fleet);
    saveSelection();
    openMenu('reveal');
    reveal = { v, gate: g, t: 0, burst: false };
    return;
  }
}

// --- Sammlung: alle Fahrzeugtypen, die man schon hat und die noch fehlen (nach Wert sortiert) ---
const COLLECTION_BTN = { x: 172, y: 18, w: 190, h: 44 };
let collectionPage = 0;

function collectionKinds() {
  return Object.keys(KINDS).sort((a, b) =>
    TIER_VALUE[KINDS[b].tier] - TIER_VALUE[KINDS[a].tier] || KINDS[a].name.localeCompare(KINDS[b].name));
}

function drawCollection() {
  const kinds = collectionKinds();
  const owned = kind => fleet.filter(v => v.kind === kind);
  const have = kinds.filter(kind => owned(kind).length).length;
  drawMenuBackdrop('📖 SAMMLUNG  ' + have + ' / ' + kinds.length, true);
  drawButton(BACK_BTN, '← Shop', '#444b5c');
  const pages = pageCount(kinds.length);
  collectionPage = Math.min(collectionPage, pages - 1);

  for (const card of gridCards(kinds, collectionPage)) {
    const kind = card.item, k = KINDS[kind], mine = owned(kind), got = mine.length > 0;
    ctx.fillStyle = got ? 'rgba(46, 204, 113, 0.12)' : 'rgba(255, 255, 255, 0.04)';
    rr(card.x, card.y, card.w, card.h, 12); ctx.fill();
    ctx.strokeStyle = got ? '#2ecc71' : '#3a3f4b';
    ctx.lineWidth = 2;
    ctx.setLineDash(got ? [] : [6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bild: eigenes Fahrzeug (das wertvollste) in Farbe, fehlende blass
    const shown = got ? mine.sort((a, b) => vehicleValue(b) - vehicleValue(a))[0]
      : { id: 'sammlung-' + kind, kind, special: null, color: k.color || '#8a8f99' };
    ctx.save();
    ctx.globalAlpha = got ? 1 : 0.22;
    drawVehiclePreview(shown, card.x + card.w / 2, card.y + 78, 125, 0.8);
    ctx.restore();

    ctx.textBaseline = 'middle';
    drawCoin(card.x + 16, card.y + 16, 8, 0);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(TIER_VALUE[k.tier]), card.x + 28, card.y + 17);
    ctx.textAlign = 'right';
    ctx.fillStyle = got ? '#7dffb0' : '#9aa0aa';
    ctx.font = (got ? 'bold 16px' : '15px') + ' system-ui, sans-serif';
    ctx.fillText(got ? '×' + mine.length : '🔒', card.x + card.w - 10, card.y + 17);

    ctx.textAlign = 'center';
    ctx.fillStyle = got ? '#fff' : '#8a8f99';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(k.name, card.x + card.w / 2, card.y + 94);
    // Seltenheit und welche Spezial-Lacke man davon schon hat
    const paints = ['gold', 'rainbow', 'diamond', 'obsidian'].filter(p => mine.some(v => v.special === p))
      .map(p => ({ gold: '★', rainbow: '🌈', diamond: '💎', obsidian: '🖤' })[p]).join(' ');
    ctx.fillStyle = got ? TIERS[k.tier].color : '#6b7280';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(got ? TIERS[k.tier].label + (paints ? '  ' + paints : '') : TIERS[k.tier].label + ' · fehlt noch', card.x + card.w / 2, card.y + 111);
  }

  if (collectionPage > 0) drawButton(PREV_BTN, '◀ Zurück', '#444b5c', 20);
  if (collectionPage < pages - 1) drawButton(NEXT_BTN, 'Weiter ▶', '#3657b8', 20);
  drawMenuMsg('Grün = hast du schon (×Anzahl)  ·  🔒 = fehlt noch  ·  Seite ' + (collectionPage + 1) + '/' + pages);
}

function collectionTap(px, py) {
  const pages = pageCount(Object.keys(KINDS).length);
  if (inRect(px, py, BACK_BTN)) openMenu('shop');
  else if (collectionPage > 0 && inRect(px, py, PREV_BTN)) collectionPage--;
  else if (collectionPage < pages - 1 && inRect(px, py, NEXT_BTN)) collectionPage++;
}

// --- Tor geht auf: das neue Fahrzeug wird enthüllt ---
const REVEAL_AT = 1.6;

function updateReveal(dt) {
  const before = reveal.t;
  reveal.t += dt;
  // Trommelwirbel, während das Tor hochrollt
  if (reveal.t > 0.4 && reveal.t < REVEAL_AT && Math.floor(reveal.t * 12) !== Math.floor(before * 12)) {
    beep(160 + reveal.t * 220, 0.05, 'triangle', 0.05);
  }
  if (!reveal.burst && reveal.t >= REVEAL_AT) {
    reveal.burst = true;
    const rank = TIER_ORDER.indexOf(KINDS[reveal.v.kind].tier);
    const n = 30 + rank * 30 + (reveal.v.special ? 40 : 0);
    for (let i = 0; i < n; i++) {
      particles.push({
        x: W / 2 + rand(-60, 60), y: 250, vx: rand(-420, 420), vy: rand(-520, -120),
        life: 0, max: rand(0.9, 1.6),
        color: { gold: pick(['#ffd700', '#fff6c2']), diamond: pick(['#bfefff', '#ffffff', '#7fd0ff']),
          obsidian: pick(['#8b5cf6', '#c9a2ff', '#2a1840']) }[reveal.v.special] || pick(COLORS),
        size: rand(3, 7), g: 600,
      });
    }
    [523, 659, 784, 1047, 1319, 1568, 2093].slice(0, 2 + rank + (reveal.v.special ? 1 : 0))
      .forEach((f, i) => beep(f, i === 1 + rank ? 0.35 : 0.12, 'triangle', 0.08, i * 0.12));
  }
}

function drawReveal() {
  const v = reveal.v, k = KINDS[v.kind], tier = TIERS[k.tier];
  drawMenuBackdrop(reveal.gate.name.toUpperCase(), true);
  const t = reveal.t;
  const open = Math.min(1, Math.max(0, (t - 0.4) / (REVEAL_AT - 0.4)));
  const fx = W / 2 - 210, fy = 76, fw = 420, fh = 270;

  // Garage innen mit Scheinwerfer in der Farbe der Seltenheit
  ctx.fillStyle = '#15171d';
  ctx.fillRect(fx, fy, fw, fh);
  const glow = ctx.createRadialGradient(W / 2, fy + fh * 0.7, 10, W / 2, fy + fh * 0.7, 230);
  glow.addColorStop(0, tier.color + '66');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.save();
  ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
  drawVehiclePreview(v, W / 2, fy + fh - 18, 360, 2);
  ctx.restore();
  drawGateDoor(fx, fy, fw, fh, reveal.gate.color, open);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (t >= REVEAL_AT) {
    ctx.fillStyle = tier.color;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(tier.label.toUpperCase() + (v.special ? '  ·  ' + specialLabel(v).toUpperCase() + '-LACK' : '')
      + '  ·  ' + v.ps + ' PS  ·  WERT ' + vehicleValue(v) + ' 🪙', W / 2, 374);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.fillText(k.name, W / 2, 410);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(k.info || 'Ein treues Fahrzeug ohne Spezialkraft.', W / 2, 446);
    const paintInfo = {
      gold: '★ Gold-Lack: +5 PS, 3 Punkte und repariert 1 Fahrzeug',
      rainbow: '🌈 Regenbogen-Lack: +8 PS, 5 Punkte und repariert 3 Fahrzeuge',
      diamond: '💎 Diamant-Lack: +12 PS, 8 Punkte und hält einen Schlag aus',
      obsidian: '🖤 Obsidian-Lack: +20 PS, 12 Punkte und hält ZWEI Schläge aus',
    }[v.special];
    if (paintInfo) ctx.fillText(paintInfo, W / 2, 472);
  }
  if (t >= REVEAL_AT + 0.6) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4);
    ctx.fillStyle = '#7dffb0';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Tippen zum Weiter', W / 2, 500);
    ctx.globalAlpha = 1;
  }
  drawParticles();
}

// --- Startbildschirm: Rennen, Presse, Shop ---
const RACE_BTN = { x: 22, y: 420, w: 172, h: 62 };
const DRAG_BTN = { x: 208, y: 420, w: 172, h: 62 };
const ONLINE_BTN = { x: 394, y: 420, w: 172, h: 62 };
const PRESS_BTN = { x: 580, y: 420, w: 172, h: 62 };
const TITLE_SHOP_BTN = { x: 766, y: 420, w: 172, h: 62 };

function drawTitleButtons() {
  const pulse = 1 + 0.03 * Math.sin(time * 4);
  ctx.save();
  ctx.translate(RACE_BTN.x + RACE_BTN.w / 2, RACE_BTN.y + RACE_BTN.h / 2);
  ctx.scale(pulse, pulse);
  ctx.translate(-(RACE_BTN.x + RACE_BTN.w / 2), -(RACE_BTN.y + RACE_BTN.h / 2));
  drawButton(RACE_BTN, '🏁 RENNEN', '#c0392b', 20);
  ctx.restore();
  drawButton(DRAG_BTN, '🔥 DRAGSTER', '#d35400', 20);
  drawButton(ONLINE_BTN, '🌍 ONLINE', '#0e7490', 20);
  drawButton(PRESS_BTN, '🏭 PRESSE', '#21a35b', 20);
  drawButton(TITLE_SHOP_BTN, '🏪 🪙 ' + wallet, '#3657b8', 20);
}

// --- Rennstrecke: Cups, Fahrzeugwahl und Pokale ---
// Höchstgeschwindigkeit auf der Rennstrecke in m/s: mehr PS = schneller (race.js benutzt dieselbe Formel)
function raceTopSpeed(ps) { return 18 + ps * 0.32; }

const CUPS = [
  { id: 'anfaenger', name: 'Anfänger-Cup', ps: [30, 45], tiers: ['common'], color: '#cd7f32' },
  { id: 'profi', name: 'Profi-Cup', ps: [55, 75], tiers: ['common', 'uncommon'], color: '#c0c7d2' },
  { id: 'champion', name: 'Champion-Cup', ps: [85, 110], tiers: ['uncommon', 'rare'], color: '#ffd700' },
  { id: 'wm', name: 'Weltmeister-Cup', ps: [120, 160], tiers: ['epic', 'legendary'], color: '#c084fc' },
];
const RACER_NAMES = ['Blitz-Bert', 'Turbo-Tina', 'Speedy Sam', 'Rakete Rosi', 'Donner-Dani', 'Flitz-Fritz',
  'Kurven-Karla', 'Vollgas-Vreni', 'Brumm-Beni', 'Düsen-Dora'];
let trophies = loadJSON('autoRetterTrophies', {});   // { cupId: { gold, silver, bronze } }
let raceCup = 0, raceVehicleId = loadJSON('autoRetterRaceCar', null), raceResult = null;

const CUP_CARDS = CUPS.map((cup, i) => ({ cup, i, x: 42 + i * 222, y: 76, w: 210, h: 166 }));
const RACE_PREV_BTN = { x: 196, y: 300, w: 64, h: 80 };
const RACE_NEXT_BTN = { x: 700, y: 300, w: 64, h: 80 };
const RACE_GO_BTN = { x: W / 2 - 160, y: 470, w: 320, h: 54 };
const RESULT_AGAIN_BTN = { x: W / 2 - 250, y: 462, w: 240, h: 56 };
const RESULT_MENU_BTN = { x: W / 2 + 10, y: 462, w: 240, h: 56 };

function cupTrophies(cup) { return trophies[cup.id] || { gold: 0, silver: 0, bronze: 0 }; }
function cupUnlocked(i) { return i === 0 || cupTrophies(CUPS[i - 1]).gold > 0; }
function fleetByPS() { return [...fleet].sort((a, b) => b.ps - a.ps); }
function raceVehicle() { return fleet.find(v => v.id === raceVehicleId) || fleetByPS()[0]; }

function drawRaceMenu() {
  drawMenuBackdrop('🏁 RENNSTRECKE', true);
  drawButton(BACK_BTN, '← Zurück', '#444b5c');

  for (const card of CUP_CARDS) {
    const { cup, i } = card, open = cupUnlocked(i), chosen = i === raceCup, t = cupTrophies(cup);
    ctx.fillStyle = chosen ? 'rgba(255, 224, 102, 0.14)' : 'rgba(255, 255, 255, 0.06)';
    rr(card.x, card.y, card.w, card.h, 12); ctx.fill();
    ctx.strokeStyle = chosen ? '#ffe066' : '#4a4f5c';
    ctx.lineWidth = chosen ? 3 : 2;
    ctx.stroke();
    ctx.globalAlpha = open ? 1 : 0.45;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cup.color;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(open ? '🏆' : '🔒', card.x + card.w / 2, card.y + 34);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(cup.name, card.x + card.w / 2, card.y + 72);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Gegner: ' + cup.ps[0] + '–' + cup.ps[1] + ' PS', card.x + card.w / 2, card.y + 98);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('🥇 ' + t.gold + '   🥈 ' + t.silver + '   🥉 ' + t.bronze, card.x + card.w / 2, card.y + 128);
    if (!open) {
      ctx.fillStyle = '#ffb4a8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Erst ' + CUPS[i - 1].name + ' gewinnen', card.x + card.w / 2, card.y + 152);
    }
    ctx.globalAlpha = 1;
  }

  // Gewählter Rennwagen
  const v = raceVehicle(), k = KINDS[v.kind];
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  rr(180, 256, 600, 180, 14); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Dein Rennwagen: ' + k.name + (v.special ? '  ' + specialLabel(v) : ''), W / 2, 278);
  drawVehiclePreview(v, W / 2, 392, 260, 1.15);
  ctx.fillStyle = '#7dd3fc';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡ ' + v.ps + ' PS   ·   bis ' + Math.round(raceTopSpeed(v.ps) * 3.6) + ' km/h', W / 2, 418);
  if (fleet.length > 1) {
    drawButton(RACE_PREV_BTN, '◀', '#444b5c', 30);
    drawButton(RACE_NEXT_BTN, '▶', '#444b5c', 30);
  }

  drawButton(RACE_GO_BTN, '🏁 RENNEN STARTEN', '#c0392b', 24);
  drawMenuMsg('Mehr PS = schneller! PS trainierst du in der Presse: retten +1, zerquetscht −3.', 452);
  drawParticles();
}

function raceMenuTap(px, py) {
  if (inRect(px, py, BACK_BTN)) { openMenu('title'); return; }
  for (const card of CUP_CARDS) {
    if (!inRect(px, py, card)) continue;
    if (cupUnlocked(card.i)) {
      raceCup = card.i;
      beep(660, 0.07, 'triangle', 0.06);
    } else {
      showMenuMsg('Gewinne zuerst den ' + CUPS[card.i - 1].name + ', dann ist dieser Cup frei!');
      beep(200, 0.15, 'square', 0.05);
    }
    return;
  }
  const list = fleetByPS();
  const step = inRect(px, py, RACE_PREV_BTN) ? -1 : inRect(px, py, RACE_NEXT_BTN) ? 1 : 0;
  if (step && list.length > 1) {
    const i = list.indexOf(raceVehicle());
    raceVehicleId = list[(i + step + list.length) % list.length].id;
    storeJSON('autoRetterRaceCar', raceVehicleId);
    beep(520, 0.06, 'triangle', 0.05);
    return;
  }
  if (inRect(px, py, RACE_GO_BTN)) startRaceMode();
}

// Online spielen (online.js): Räume mit Code, Mitspieler live. Ohne Internet zurück zum Start.
function openOnline() {
  state = 'online';
  import('./online.js')
    .then(m => m.openLobby({ kinds: KINDS, fleet: fleetByPS, topSpeed: raceTopSpeed, paintLabel: specialLabel, onClose: () => openMenu('title') }))
    .catch(err => {
      console.error(err);
      openMenu('title');
    });
}

// Lädt die 3D-Rennstrecke (race.js + three.js) erst beim ersten Rennen
function startRaceMode() {
  const cup = CUPS[raceCup], v = raceVehicle();
  raceVehicleId = v.id;
  storeJSON('autoRetterRaceCar', v.id);
  const pool = Object.keys(KINDS).filter(kind => cup.tiers.includes(KINDS[kind].tier));
  const names = [...RACER_NAMES].sort(() => Math.random() - 0.5).slice(0, 5);
  const opponents = names.map(name => {
    const paint = raceCup >= 2 && Math.random() < 0.3 ? pick(['gold', 'rainbow', 'diamond']) : null;
    return { ...makeVehicle(pick(pool), paint), name, ps: Math.round(rand(cup.ps[0], cup.ps[1])) + (PAINT_PS[paint] || 0) };
  });
  state = 'raceload';
  import('./race.js')
    .then(m => {
      state = 'race';
      m.startRace({ player: { ...v, name: 'Du' }, opponents, kinds: KINDS, topSpeed: raceTopSpeed, onFinish: finishRace });
    })
    .catch(err => {
      console.error(err);
      openMenu('racemenu');
      showMenuMsg('Die 3D-Rennstrecke konnte nicht geladen werden – braucht Internet.');
    });
}

function finishRace(res) {
  if (res.quit) { openMenu('racemenu'); return; }
  const cup = CUPS[raceCup];
  const medal = ['gold', 'silver', 'bronze'][res.place - 1] || null;
  const firstGold = medal === 'gold' && cupTrophies(cup).gold === 0;
  if (medal) {
    trophies[cup.id] = cupTrophies(cup);
    trophies[cup.id][medal]++;
    storeJSON('autoRetterTrophies', trophies);
  }
  raceResult = { ...res, medal, cup, newCup: firstGold && raceCup < CUPS.length - 1 ? CUPS[raceCup + 1] : null };
  openMenu('raceresult');
  if (medal) {
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: W / 2 + rand(-80, 80), y: 120, vx: rand(-380, 380), vy: rand(-420, -60),
        life: 0, max: rand(1, 1.8), color: medal === 'gold' ? pick(['#ffd700', '#fff6c2', ...COLORS]) : pick(COLORS),
        size: rand(3, 7), g: 500,
      });
    }
    [523, 659, 784, 1047].forEach((f, i) => beep(f, i === 3 ? 0.4 : 0.12, 'triangle', 0.08, i * 0.13));
  }
}

function drawLoading(title, text) {
  drawMenuBackdrop(title, false);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text + '.'.repeat(1 + Math.floor(time * 3) % 3), W / 2, H / 2);
}

function drawRaceResult() {
  const r = raceResult;
  const title = { gold: '🥇 SIEG!', silver: '🥈 2. PLATZ!', bronze: '🥉 3. PLATZ!' }[r.medal] || r.place + '. PLATZ';
  drawMenuBackdrop(title, false);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(r.cup.name + (r.medal ? '  ·  Pokal gewonnen!' : '  ·  Mehr PS sammeln und nochmal versuchen!'), W / 2, 82);

  r.order.forEach((car, i) => {
    const y = 124 + i * 46;
    ctx.fillStyle = car.isPlayer ? 'rgba(255, 224, 102, 0.2)' : 'rgba(255, 255, 255, 0.05)';
    rr(W / 2 - 300, y - 19, 600, 38, 9); ctx.fill();
    ctx.fillStyle = car.isPlayer ? '#ffe066' : '#fff';
    ctx.font = (car.isPlayer ? 'bold ' : '') + '19px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText((i + 1) + '.  ' + car.name, W / 2 - 280, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(KINDS[car.kind].name + '  ·  ' + car.ps + ' PS' + (car.time ? '  ·  ' + car.time.toFixed(1) + ' s' : ''), W / 2 + 280, y);
  });

  if (r.newCup) {
    ctx.fillStyle = '#7dffb0';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔓 Neu freigeschaltet: ' + r.newCup.name + '!', W / 2, 432);
  }
  drawButton(RESULT_AGAIN_BTN, '🔁 NOCHMAL', '#c0392b');
  drawButton(RESULT_MENU_BTN, '🏁 RENNMENÜ', '#444b5c');
  drawParticles();
}

function raceResultTap(px, py) {
  if (inRect(px, py, RESULT_AGAIN_BTN)) startRaceMode();
  else if (inRect(px, py, RESULT_MENU_BTN)) openMenu('racemenu');
}

// --- Dragster-Bahn: 1 gegen 1, der Gewinner bekommt das Auto des Verlierers ---
const DRAG_LEVELS = [
  { label: 'Leicht', color: '#4ade80', ps: [0.7, 0.85], tierShift: -1, skill: 0.8 },
  { label: 'Mittel', color: '#ffd166', ps: [0.95, 1.08], tierShift: 0, skill: 0.9 },
  { label: 'Schwer', color: '#f87171', ps: [1.15, 1.35], tierShift: 1, skill: 0.96 },
];
let dragVehicleId = loadJSON('autoRetterDragCar', null), dragOpponents = null, dragPick = null, dragResult = null;
const DRAG_MINE = { x: 30, y: 76, w: 330, h: 340 };
const DRAG_PREV_BTN = { x: 40, y: 190, w: 54, h: 70 };
const DRAG_NEXT_BTN = { x: 296, y: 190, w: 54, h: 70 };
const DRAG_CARDS = [0, 1, 2].map(i => ({ i, x: 380 + i * 190, y: 76, w: 180, h: 340 }));
const DRAG_GO_BTN = { x: W / 2 - 170, y: 466, w: 340, h: 54 };
const DRAG_NEW_BTN = { x: 760, y: 470, w: 180, h: 46 };
const DRAG_AGAIN_BTN = { x: W / 2 - 250, y: 462, w: 240, h: 56 };
const DRAG_MENU_BTN = { x: W / 2 + 10, y: 462, w: 240, h: 56 };

function dragVehicle() { return fleet.find(v => v.id === dragVehicleId) || fleetByPS()[0]; }

// Drei Gegner: leicht (schwächer, weniger wert), mittel, schwer (stärker, seltenes Auto)
function makeDragOpponents() {
  const mine = dragVehicle();
  const tierIdx = TIER_ORDER.indexOf(KINDS[mine.kind].tier);
  const names = [...RACER_NAMES].sort(() => Math.random() - 0.5);
  dragOpponents = DRAG_LEVELS.map((lv, i) => {
    const tier = TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, tierIdx + lv.tierShift))];
    const kind = pick(Object.keys(KINDS).filter(kd => KINDS[kd].tier === tier));
    const paint = lv.tierShift > 0 && Math.random() < 0.3 ? pick(['gold', 'rainbow', 'diamond']) : null;
    const v = makeVehicle(kind, paint);
    v.ps = Math.max(5, Math.round(mine.ps * rand(lv.ps[0], lv.ps[1]))) + (PAINT_PS[paint] || 0);
    return { ...v, name: names[i], level: lv };
  });
  dragPick = null;
}

function openDragMenu() {
  openMenu('dragmenu');
  if (!dragOpponents) makeDragOpponents();
}

function drawDragMenu() {
  drawMenuBackdrop('🔥 DRAGSTER-BAHN', true);
  drawButton(BACK_BTN, '← Zurück', '#444b5c');
  const mine = dragVehicle(), k = KINDS[mine.kind];

  // Dein Einsatz
  ctx.fillStyle = 'rgba(255, 224, 102, 0.1)';
  rr(DRAG_MINE.x, DRAG_MINE.y, DRAG_MINE.w, DRAG_MINE.h, 14); ctx.fill();
  ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('Dein Einsatz', DRAG_MINE.x + DRAG_MINE.w / 2, 100);
  drawVehiclePreview(mine, DRAG_MINE.x + DRAG_MINE.w / 2, 290, 190, 1.0);
  dragCarInfo(mine, DRAG_MINE.x + DRAG_MINE.w / 2, 318);
  if (fleet.length > 1) {
    drawButton(DRAG_PREV_BTN, '◀', '#444b5c', 26);
    drawButton(DRAG_NEXT_BTN, '▶', '#444b5c', 26);
  }

  // Gegner zur Auswahl
  for (const card of DRAG_CARDS) {
    const o = dragOpponents[card.i], chosen = dragPick === card.i;
    ctx.fillStyle = chosen ? 'rgba(248, 113, 113, 0.18)' : 'rgba(255, 255, 255, 0.06)';
    rr(card.x, card.y, card.w, card.h, 14); ctx.fill();
    ctx.strokeStyle = chosen ? '#f87171' : '#4a4f5c'; ctx.lineWidth = chosen ? 3 : 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.level.color;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(o.level.label, card.x + card.w / 2, 100);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(o.name, card.x + card.w / 2, 126);
    drawVehiclePreview(o, card.x + card.w / 2, 290, 150, 0.85);
    dragCarInfo(o, card.x + card.w / 2, 318);
  }

  if (menuMsgT > 0) drawMenuMsg('', 440);
  else {
    ctx.fillStyle = '#ffb4a8';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ Wer verliert, muss sein Auto dem Gewinner geben!', W / 2, 440);
  }
  const o = dragPick !== null ? dragOpponents[dragPick] : null;
  drawButton(DRAG_GO_BTN, o ? '🔥 GEGEN ' + o.name.toUpperCase() : 'Gegner antippen', o ? '#c0392b' : '#555a66', o ? 21 : 20);
  drawButton(DRAG_NEW_BTN, '🎲 Neue Gegner', '#444b5c', 18);
  drawParticles();
}

function dragCarInfo(v, cx, y) {
  const k = KINDS[v.kind];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(k.name, cx, y);
  ctx.fillStyle = TIERS[k.tier].color;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(TIERS[k.tier].label + (v.special ? '  ' + specialLabel(v) : ''), cx, y + 22);
  ctx.fillStyle = '#7dd3fc';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('⚡ ' + v.ps + ' PS  ·  ' + Math.round(raceTopSpeed(v.ps) * 1.35 * 3.6) + ' km/h', cx, y + 46);
  ctx.fillStyle = '#ffd700';
  ctx.fillText('Wert 🪙 ' + vehicleValue(v), cx, y + 70);
}

function dragMenuTap(px, py) {
  if (inRect(px, py, BACK_BTN)) { openMenu('title'); return; }
  const list = fleetByPS();
  const step = inRect(px, py, DRAG_PREV_BTN) ? -1 : inRect(px, py, DRAG_NEXT_BTN) ? 1 : 0;
  if (step && list.length > 1) {
    const i = list.indexOf(dragVehicle());
    dragVehicleId = list[(i + step + list.length) % list.length].id;
    storeJSON('autoRetterDragCar', dragVehicleId);
    makeDragOpponents(); // Gegner passend zum neuen Auto
    beep(520, 0.06, 'triangle', 0.05);
    return;
  }
  for (const card of DRAG_CARDS) {
    if (inRect(px, py, card)) { dragPick = card.i; beep(660, 0.07, 'triangle', 0.06); return; }
  }
  if (inRect(px, py, DRAG_NEW_BTN)) { makeDragOpponents(); beep(440, 0.07, 'triangle', 0.05); return; }
  if (inRect(px, py, DRAG_GO_BTN)) {
    if (dragPick === null) { showMenuMsg('Tippe zuerst einen Gegner an!'); return; }
    if (fleet.length < 2) {
      showMenuMsg('Du brauchst mindestens 2 Fahrzeuge – sonst hättest du beim Verlieren keins mehr!');
      beep(200, 0.15, 'square', 0.05);
      return;
    }
    startDragMode();
  }
}

function startDragMode() {
  const mine = dragVehicle(), opp = dragOpponents[dragPick];
  dragVehicleId = mine.id;
  storeJSON('autoRetterDragCar', mine.id);
  state = 'dragload';
  import('./drag.js')
    .then(m => {
      state = 'drag';
      m.startDrag({ player: { ...mine, name: 'Du' }, opponent: opp, skill: opp.level.skill, kinds: KINDS, topSpeed: raceTopSpeed, onFinish: finishDrag });
    })
    .catch(err => {
      console.error(err);
      openMenu('dragmenu');
      showMenuMsg('Die 3D-Dragster-Bahn konnte nicht geladen werden – braucht Internet.');
    });
}

function finishDrag(res) {
  if (res.quit) { openMenu('dragmenu'); return; }
  const mine = dragVehicle(), opp = dragOpponents[dragPick];
  if (res.win) {
    // Das Gegnerauto gehört jetzt dir (mit seinen PS und seinem Lack)
    const won = { id: makeVehicle(opp.kind).id, kind: opp.kind, special: opp.special, ps: opp.ps, color: opp.color, paintPS: true };
    fleet.push(won);
    if (selectedIds.size < MAX_SELECTED) selectedIds.add(won.id);
    dragResult = { win: true, car: won, opp, res };
  } else {
    // Dein Auto geht an den Gewinner
    fleet = fleet.filter(v => v !== mine);
    selectedIds.delete(mine.id);
    if (raceVehicleId === mine.id) raceVehicleId = null;
    dragVehicleId = null;
    dragResult = { win: false, car: mine, opp, res };
  }
  storeJSON('autoRetterFleet', fleet);
  saveSelection();
  dragOpponents = null;
  openMenu('dragresult');
  if (res.win) {
    for (let i = 0; i < 80; i++) {
      particles.push({ x: W / 2 + rand(-80, 80), y: 140, vx: rand(-400, 400), vy: rand(-420, -60),
        life: 0, max: rand(1, 1.8), color: pick(['#ffd700', '#fff6c2', ...COLORS]), size: rand(3, 7), g: 500 });
    }
    [523, 659, 784, 1047].forEach((f, i) => beep(f, i === 3 ? 0.4 : 0.12, 'triangle', 0.08, i * 0.13));
  } else {
    beep(330, 0.25, 'sawtooth', 0.06); beep(220, 0.45, 'sawtooth', 0.06, 0.25);
  }
}

function drawDragResult() {
  const r = dragResult, k = KINDS[r.car.kind];
  drawMenuBackdrop(r.win ? '🏆 GEWONNEN!' : '😢 VERLOREN', true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(r.win ? 'Der ' + k.name + ' von ' + r.opp.name + ' gehört jetzt dir!' : 'Dein ' + k.name + ' gehört jetzt ' + r.opp.name + '.', W / 2, 92);
  drawVehiclePreview(r.car, W / 2, 300, 340, 1.8);
  ctx.globalAlpha = 1;
  dragCarInfo(r.car, W / 2, 330);
  const t = s => (s ? s.toFixed(2) + ' s' : '–');
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Du: ' + t(r.res.myTime) + '   ·   ' + r.opp.name + ': ' + t(r.res.oppTime) +
    (r.res.react !== null && r.res.react !== undefined ? '   ·   Reaktion ' + r.res.react.toFixed(3) + ' s' : ''), W / 2, 432);
  drawButton(DRAG_AGAIN_BTN, '🔥 NOCHMAL', '#c0392b');
  drawButton(DRAG_MENU_BTN, '🏠 MENÜ', '#444b5c');
  drawParticles();
}

function dragResultTap(px, py) {
  if (inRect(px, py, DRAG_AGAIN_BTN)) openDragMenu();
  else if (inRect(px, py, DRAG_MENU_BTN)) openMenu('title');
}

// --- Verstecktes Admin-Menü: 5× schnell auf die Versionsnummer im Startbildschirm tippen ---
const VERSION_AREA = { x: W - 300, y: H - 34, w: 300, h: 34 };
const ADMIN_COIN_BTNS = [10, 100, 1000, 10000].map((n, i) => ({ n, x: 110 + i * 190, y: 140, w: 170, h: 56 }));
const ADMIN_ZERO_BTN = { x: W / 2 - 150, y: 222, w: 300, h: 50 };
const ADMIN_RESET_BTN = { x: W / 2 - 230, y: 330, w: 460, h: 60 };
let adminTaps = [], adminConfirm = false;

function secretTap() {
  adminTaps = adminTaps.filter(t => time - t < 3);
  adminTaps.push(time);
  if (adminTaps.length >= 5) {
    adminTaps = [];
    adminConfirm = false;
    openMenu('admin');
  }
}

// Alles auf Anfang: 4 Startautos, keine Münzen, kein Rekord
function resetProgress() {
  fleet = START_FLEET.map(kind => makeVehicle(kind));
  wallet = 0;
  best = 0;
  selectedIds = new Set(fleet.map(v => v.id));
  storeJSON('autoRetterFleet', fleet);
  storeJSON('autoRetterCoins', wallet);
  storeBest();
  saveSelection();
}

function drawAdmin() {
  drawMenuBackdrop('🔧 ADMIN', true);
  drawButton(BACK_BTN, '← Zurück', '#444b5c');
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Münzen geben', W / 2, 112);
  for (const b of ADMIN_COIN_BTNS) drawButton(b, '+' + b.n.toLocaleString('de-CH') + ' 🪙', '#a67c00', 22);
  drawButton(ADMIN_ZERO_BTN, 'Münzen auf 0', '#444b5c', 20);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Fahrzeugpark: ' + fleet.length + ' Fahrzeuge   ·   Rekord: ' + best, W / 2, 304);
  drawButton(ADMIN_RESET_BTN, adminConfirm ? '⚠️ Wirklich alles löschen? Nochmal tippen!' : '🗑️ Spielstand zurücksetzen',
    adminConfirm ? '#b91c1c' : '#7f1d1d', 20);
  drawMenuMsg('Zurücksetzen löscht Münzen, Rekord und Fahrzeugpark (danach wieder die 4 Startautos).', 420);
  drawParticles();
}

function adminTap(px, py) {
  if (inRect(px, py, BACK_BTN)) { openMenu('title'); return; }
  for (const b of ADMIN_COIN_BTNS) {
    if (!inRect(px, py, b)) continue;
    wallet += b.n;
    storeJSON('autoRetterCoins', wallet);
    adminConfirm = false;
    showMenuMsg('+' + b.n.toLocaleString('de-CH') + ' Münzen – jetzt ' + wallet.toLocaleString('de-CH'));
    beep(1568, 0.07, 'square', 0.04);
    beep(2093, 0.12, 'square', 0.04, 0.07);
    return;
  }
  if (inRect(px, py, ADMIN_ZERO_BTN)) {
    wallet = 0;
    storeJSON('autoRetterCoins', wallet);
    adminConfirm = false;
    showMenuMsg('Münzen auf 0 gesetzt');
    beep(300, 0.12, 'triangle', 0.06);
    return;
  }
  if (inRect(px, py, ADMIN_RESET_BTN)) {
    if (!adminConfirm) {
      adminConfirm = true;
      beep(440, 0.1, 'square', 0.05);
      return;
    }
    adminConfirm = false;
    resetProgress();
    showMenuMsg('Spielstand zurückgesetzt – alles auf Anfang!');
    beep(200, 0.3, 'sawtooth', 0.06);
    return;
  }
  adminConfirm = false; // daneben getippt: Zurücksetzen abbrechen
}

// ---------- Eingabe ----------
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  audio();
  if (e.pointerType === 'touch' && state !== 'play') goLandscape();
  const { x: px, y: py } = gamePoint(e);

  if (state === 'title' || state === 'over') {
    if (state === 'over' && overTime < 0.8) return;
    if (state === 'title') {
      if (inRect(px, py, VERSION_AREA)) secretTap();
      else if (inRect(px, py, RACE_BTN)) openMenu('racemenu');
      else if (inRect(px, py, DRAG_BTN)) openDragMenu();
      else if (inRect(px, py, ONLINE_BTN)) openOnline();
      else if (inRect(px, py, PRESS_BTN)) openMenu('select');
      else if (inRect(px, py, TITLE_SHOP_BTN)) openMenu('shop');
      return;
    }
    openMenu(inRect(px, py, SHOP_BTN) ? 'shop' : 'select');
    return;
  }
  if (state === 'select') { selectTap(px, py); return; }
  if (state === 'admin') { adminTap(px, py); return; }
  if (state === 'racemenu') { raceMenuTap(px, py); return; }
  if (state === 'raceresult') { raceResultTap(px, py); return; }
  if (state === 'dragmenu') { dragMenuTap(px, py); return; }
  if (state === 'dragresult') { dragResultTap(px, py); return; }
  if (['race', 'raceload', 'drag', 'dragload'].includes(state)) return;
  if (state === 'shop') { shopTap(px, py); return; }
  if (state === 'collection') { collectionTap(px, py); return; }
  if (state === 'reveal') { if (reveal.t > REVEAL_AT + 0.2) openMenu('shop'); return; }

  const coin = coinAt(px, py);
  if (coin) { collectCoin(coin); return; }
  const car = carAt(px, py);
  if (car) tapCar(car);
});

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === 'title' || (state === 'over' && overTime > 0.8)) openMenu('select');
    else if (state === 'select') selectTap(GO_BTN.x + 1, GO_BTN.y + 1);
  }
  if (e.code === 'Escape' && state === 'collection') openMenu('shop');
  else if (e.code === 'Escape' && ['select', 'shop', 'admin', 'racemenu', 'raceresult', 'dragmenu', 'dragresult'].includes(state)) openMenu('title');
});

// ---------- 3D-Presse laden; klappt das nicht (z.B. offline), bleibt alles in 2D ----------
import('./press3d.js')
  .then(m => {
    m.init({ W, H, ROAD_Y, PRESS_W, PLATE_H, PLATE_UP, COIN_GROUND, KINDS, canvas });
    press3d = m;
    resize();
  })
  .catch(err => console.warn('3D-Presse nicht verfügbar, es wird in 2D gezeichnet.', err));

// ---------- Hauptschleife ----------
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state !== 'race' && state !== 'drag' && state !== 'online') { // dort zeichnen race.js, drag.js bzw. online.js
    update(dt);
    draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

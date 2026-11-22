// Review-Seite (nur für Lionels Geräte): alle Autos in 3D prüfen – Blinker, Warnblinker, Licht, Bremslicht, Beulen, Motor-Ton,
// Kamera vorne/hinten/Fahrersitz – und Findings direkt in die Datenbank schreiben (review/findings).
// Zugang: 3× schnell auf „Ersteller: LIONEL“ im Startbild (game.js). Ein Gerät wird einmal mit dem Review-Code freigeschaltet
// (reviewers/<uid>, Regeln in database.rules.json); fremde Geräte sehen nichts (falscher Code = es passiert nichts).
// Lichter und Beulen kommen aus carlamps.js (gleich wie in der Stadt), der Ton aus sound.js.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar, loadCarModels, setLod, MODELS, MOBILE, hasModel } from './cars3d.js';
import { makeLamps, setLamps, removeLamps, dentAt, dropDents } from './carlamps.js';
import { createCarSound, gearbox, soundOf, hasRecording } from './sound.js';
import { connectFirebase } from './online.js';

const TOPICS = ['Blinker', 'Licht', 'Bremslicht', 'Ton', 'Optik/Modell', 'Fahren', 'Name', 'Sonstiges'];
const CSS = `
#review { position: fixed; inset: 0; z-index: 80; background: #0d1018; color: #e5e7eb; font-family: system-ui, sans-serif;
  display: flex; flex-direction: column; user-select: none; -webkit-user-select: none; }
#review .rtop { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: #161b26; flex-wrap: wrap; }
#review .rtop b { font-size: 17px; margin-right: 4px; }
#review select, #review textarea, #review input[type=text] { background: #0b0e15; color: #fff; border: 1px solid #374151; border-radius: 8px; font-size: 15px; padding: 6px; }
#review .rtop select { flex: 1; min-width: 160px; }
#review button { background: #263043; color: #fff; border: 1px solid #3b4660; border-radius: 8px; font-size: 15px; padding: 6px 9px; touch-action: manipulation; }
#review button.on { background: #f59e0b; border-color: #fde68a; color: #111; }
#review .rmain { flex: 1; display: flex; min-height: 0; }
#review .rview { position: relative; flex: 1.4; min-width: 0; min-height: 0; }
#review .rview canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
#review .rinfo { position: absolute; left: 8px; bottom: 6px; font-size: 12px; opacity: .75; pointer-events: none; }
#review .rside { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px; overflow-y: auto; background: #121620; }
#review .rbtns { display: flex; flex-wrap: wrap; gap: 5px; }
#review .rbtns label { display: flex; align-items: center; gap: 6px; font-size: 14px; flex: 1; min-width: 180px; }
#review .rbtns input[type=range] { flex: 1; }
#review h4 { margin: 6px 0 2px; font-size: 14px; color: #9ca3af; }
#review textarea { width: 100%; min-height: 60px; box-sizing: border-box; }
#review .rform { display: flex; gap: 5px; flex-wrap: wrap; }
#review .rform select { flex: 1; }
#review .flist { display: flex; flex-direction: column; gap: 5px; }
#review .find { background: #1b2230; border-radius: 8px; padding: 6px 8px; font-size: 14px; }
#review .find.done { opacity: .55; }
#review .find small { color: #9ca3af; display: block; }
#review .find .ans { color: #86efac; margin-top: 3px; }
#review table { border-collapse: collapse; font-size: 13px; width: 100%; }
#review td, #review th { padding: 2px 6px; border-bottom: 1px solid #222a38; text-align: left; vertical-align: top; }
#review td:first-child { color: #9ca3af; white-space: nowrap; }
#review .warn { color: #fbbf24; } #review .bad { color: #f87171; }
#review .rall { position: absolute; inset: 0; z-index: 2; background: #0d1018; overflow: auto; padding: 8px; }
#review .rall th { position: sticky; top: 0; background: #161b26; cursor: pointer; white-space: nowrap; }
#review .rall td:first-child { color: #e5e7eb; cursor: pointer; }
#review .rall td { text-align: right; } #review .rall td:first-child, #review .rall th:first-child { text-align: left; }
#review .rmsg { font-size: 13px; color: #fbbf24; min-height: 16px; }
@media (max-aspect-ratio: 1/1) { #review .rmain { flex-direction: column; } #review .rview { flex: none; height: 46vh; } }
`;

let R = null; // offene Review-Seite

// ---------- Technische Daten eines gebauten Autos ----------
const mb = b => b == null ? '–' : (b / 1048576).toFixed(b < 1048576 ? 2 : 1) + ' MB';
const num = n => Math.round(n).toLocaleString('de-CH');
const sizeCache = new Map();
function fileSize(url) { // Dateigrösse vom Server (HEAD), ohne die Datei zu laden
  if (!sizeCache.has(url)) sizeCache.set(url, fetch(url, { method: 'HEAD', cache: 'no-store' }).then(r => r.ok ? +r.headers.get('content-length') || null : null).catch(() => null));
  return sizeCache.get(url);
}
function texBytes(t) { const i = t.image; if (!i || !i.width) return 0; return i.width * i.height * 4 * (t.generateMipmaps === false ? 1 : 4 / 3); }
export function carStats(car) {
  const geos = new Set(), mats = new Set(), texs = new Set(), b = new THREE.Box3(); let tris = 0, verts = 0, draws = 0;
  car.traverseVisible(o => {
    if (!o.isMesh || o.name === 'shadow') return;
    if (o.name !== 'driver' && !o.parent?.name?.includes('driver') && !(o.material && o.material.transparent && o.material.opacity < 0.05)) b.expandByObject(o, true);
    const g = o.geometry, n = o.isInstancedMesh ? o.count : 1;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * n; verts += g.attributes.position.count; draws++;
    geos.add(g);
    for (const m of [].concat(o.material)) { mats.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); } }
  });
  let geoB = 0; for (const g of geos) { for (const a of Object.values(g.attributes)) geoB += a.array.byteLength; if (g.index) geoB += g.index.array.byteLength; }
  let texB = 0, maxTex = 0; for (const t of texs) { texB += texBytes(t); maxTex = Math.max(maxTex, t.image?.width || 0, t.image?.height || 0); }
  const sz = b.isEmpty() ? new THREE.Vector3() : b.getSize(new THREE.Vector3());
  return { tris, verts, draws, mats: mats.size, texs: texs.size, maxTex, geoB, texB, size: sz };
}
const modelEntry = kind => MODELS.find(M => M.kinds.includes(kind)) || null;
const mobileFile = f => f.replace('models/', 'models/m/');


// Eigenes Eingabefeld statt window.prompt (das wird in installierten Web-Apps, im Vollbild und in eingebetteten Browsern oft still unterdrückt)
function askCode() {
  return new Promise(done => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)';
    d.innerHTML = '<form style="background:#161b26;padding:14px;border-radius:12px;display:flex;gap:8px;font:16px system-ui">' +
      '<input type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="64" placeholder="Code" ' +
      'style="font-size:18px;padding:8px;border-radius:8px;border:1px solid #374151;background:#0b0e15;color:#fff;width:150px">' +
      '<button style="font-size:18px;padding:8px 12px;border-radius:8px;border:0;background:#f59e0b">OK</button>' +
      '<button type="button" style="font-size:18px;padding:8px 12px;border-radius:8px;border:0;background:#374151;color:#fff">✕</button></form>';
    const inp = d.querySelector('input'), end = v => { d.remove(); done(v); };
    d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); end(inp.value); });
    d.querySelector('button[type=button]').addEventListener('click', () => end(''));
    d.addEventListener('pointerdown', e => { if (e.target === d) end(''); });
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'touchstart']) d.addEventListener(ev, e => e.stopPropagation()); // Spiel bekommt nichts mit
    document.body.appendChild(d); setTimeout(() => inp.focus(), 50);
  });
}

// Zugang prüfen: Gerät schon freigeschaltet? Sonst Code abfragen. Falsch/abgebrochen/offline = still nichts tun.
export async function tryOpenReview(api) {
  if (R) return;
  let fb;
  try { fb = await connectFirebase(); } catch (e) { return; }
  const me = fb.ref(fb.db, 'reviewers/' + fb.uid);
  let ok = false;
  try { ok = (await fb.get(me)).exists(); } catch (e) { ok = false; }
  if (!ok) {
    const code = (await askCode()).trim().toLowerCase();
    if (!code) return;
    const name = (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'PC') + ' ' + new Date().toLocaleDateString('de-CH');
    try { await fb.set(me, { code, name, t: fb.serverTimestamp() }); ok = true; } catch (e) { ok = false; }
    if (!ok) return; // falscher Code: kein Hinweis
  }
  openReview(api, fb);
}

export async function openReview(api, fb) { // ohne Freischaltung zeigt sie nur leere Findings (Datenbank-Regeln)
  if (!document.getElementById('review-css')) { const st = document.createElement('style'); st.id = 'review-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'review';
  root.innerHTML = `
    <div class="rtop"><b>🔍 Review</b><button data-a="prev">◀</button><select class="rcar"></select><button data-a="next">▶</button>
      <button data-a="all" title="Alle Autos als Tabelle">📊</button><button data-a="close" title="Schliessen">✕</button></div>
    <div class="rmain">
      <div class="rview"><div class="rinfo"></div></div>
      <div class="rside">
        <div class="rbtns">
          <button data-a="bl">◀ Blinker</button><button data-a="hz">⚠️ Warnblinker</button><button data-a="br">Blinker ▶</button>
          <button data-a="night">🌙 Nacht</button><button data-a="brake">🛑 Bremse</button>
          <button data-a="dent">💥 Delle</button><button data-a="fix">🔧 Reparieren</button>
        </div>
        <div class="rbtns">
          <button data-a="cam" data-c="front">Vorne</button><button data-a="cam" data-c="back">Hinten</button><button data-a="cam" data-c="side">Seite</button>
          <button data-a="cam" data-c="seat">🪑 Fahrersitz</button><button data-a="spin">🔄 Drehen</button>
        </div>
        <div class="rbtns">
          <button data-a="sound">🔊 Motor</button><button data-a="gas">⛽ Gas</button>
          <label>Drehzahl <input type="range" class="rrpm" min="0" max="1" step="0.01" value="0"></label>
        </div>
        <h4>Technik</h4>
        <table class="rtech"></table>
        <h4>Finding zu diesem Auto</h4>
        <div class="rform"><select class="rtopic">${TOPICS.map(t => `<option>${t}</option>`).join('')}</select><button data-a="send">📨 Speichern</button></div>
        <textarea class="rtext" maxlength="1000" placeholder="Was stimmt nicht? Z. B. „Blinker hinten links ist zu weit innen“"></textarea>
        <div class="rmsg"></div>
        <h4>Findings</h4>
        <div class="flist"></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), msg = t => { $('.rmsg').textContent = t; };
  msg('⏳ Autos werden geladen …');
  await loadCarModels();

  // Autos: zuerst alle echten (mit lustigem Namen), dann die übrigen Fahrzeuge
  const real = api.modelKinds.filter(k => api.kinds[k]);
  const other = Object.keys(api.kinds).filter(k => !real.includes(k) && !api.kinds[k].secret && !api.kinds[k].retired);
  const list = [...real, ...other];
  const label = k => api.name({ kind: k, id: 'review-' + k }) + (real.includes(k) ? '' : ' (alt)');

  // 3D
  const view = $('.rview');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer), envDay = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const hemi = new THREE.HemisphereLight(0xdde6ff, 0x30303a, 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 10, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9 }));
  ground.receiveShadow = true; scene.add(ground);
  const heads = [0, 1].map(() => { const s = new THREE.SpotLight(0xfff2d6, 0, 40, 0.5, 0.5, 1.2); scene.add(s, s.target); return s; });
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  const st = { kind: list[0], car: null, lamps: null, dented: [], blink: null, night: false, brake: false, cam: 'free', spin: true,
    yaw: 0.8, pitch: 0.28, dist: 9, snd: null, gas: false, rpm: 0, gears: null, findings: {}, running: true, last: performance.now() };

  function showCar(kind) {
    if (st.car) { removeLamps(st.lamps); dropDents(st.dented); scene.remove(st.car); }
    st.kind = kind;
    const v = { kind, id: 'review-' + kind, color: api.kinds[kind].color || '#9ca3af', special: null, ps: 300 };
    const car = buildCar(v, api.kinds); setLod(car, false);
    car.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(car); st.car = car; car.updateMatrixWorld(true);
    st.stats = carStats(car);
    st.lamps = makeLamps(car); car.add(st.lamps.g);
    renderTech();
    const u = car.userData, src = u.lampShapes ? 'echte Lampenformen' : 'Lampen geschätzt (Modell ohne Lampenform)';
    $('.rinfo').textContent = `${label(kind)} · Typ ${kind} · ${(u.length || 0).toFixed(2)} m · ${src}`;
    if (st.snd) startSound();
    renderList(); fillSelect();
  }
  function fillSelect() {
    const sel = $('.rcar'), open = k => Object.values(st.findings).filter(f => f.kind === k && f.status !== 'erledigt').length;
    sel.innerHTML = list.map(k => `<option value="${k}"${k === st.kind ? ' selected' : ''}>${label(k)}${open(k) ? ' (' + open(k) + ' offen)' : ''}</option>`).join('');
  }
  function renderTech() {
    const k = st.kind, s = st.stats, u = st.car.userData, M = modelEntry(k), P = soundOf(k), K = api.kinds[k] || {};
    const cls = (v, w, b) => v > b ? 'bad' : v > w ? 'warn' : '';
    const ls = u.lampShapes, shapes = ls ? ['head', 'tail', 'blinkF', 'blinkR'].map(n => (ls[n] || []).filter(Boolean).length) : null;
    const rows = [
      ['Modell', M ? M.file.replace('models/', '') + (MOBILE ? ' (Handy-Fassung)' : '') : 'kein echtes Modell (gebaut aus Formen)'],
      ['Dreiecke', `<span class="${cls(s.tris, 60000, 120000)}">${num(s.tris)}</span> · ${num(s.verts)} Ecken`],
      ['Zeichen-Befehle', `<span class="${cls(s.draws, 40, 80)}">${s.draws}</span> Teile · ${s.mats} Materialien`],
      ['Bilder', `${s.texs}${s.maxTex ? ' · grösstes ' + s.maxTex + ' px' : ''}`],
      ['Grafikspeicher', `${mb(s.geoB + s.texB)} <small>(Form ${mb(s.geoB)}, Bilder ${mb(s.texB)})</small>`],
      ['Datei', M ? '<span class="rfile">…</span>' : '–'],
      ['Masse', `${s.size.x.toFixed(2)} × ${s.size.z.toFixed(2)} × ${s.size.y.toFixed(2)} m (L × B × H)${M ? ' · soll ' + M.len + ' m' : ''}`],
      ['Räder', `${(u.wheels || []).length} drehende Teile`],
      ['Lampen', shapes ? `echte Formen: Scheinwerfer ${shapes[0]}, Rück ${shapes[1]}, Blinker vorne ${shapes[2]} / hinten ${shapes[3]}` : (u.lampPos ? 'Lage aus dem Modell, keine Form' : 'geschätzt aus dem Umriss')],
      ['Fahrersitz', u.eye ? u.eye.map(n => n.toFixed(2)).join(' / ') + (M && (M.eyeX !== undefined || M.eyeY !== undefined) ? ' (von Hand)' : '') : '–'],
      ['Motor-Ton', (hasRecording(k) ? '🎙️ echte Aufnahme im Leerlauf + ' : '') + (P.type === 'engine' ? `${P.cyl} Zylinder, ${P.idle}–${P.red} U/min` + ['turbo', 'sc', 'burble', 'rasp', 'pops', 'knock'].filter(n => P[n] > 0.15).map(n => ({ turbo: ' · Turbo', sc: ' · Kompressor', burble: ' · Blubbern', rasp: ' · Kreischen', pops: ' · Klepfen', knock: ' · Diesel-Klopfen' })[n]).join('') : P.type || 'Synthesizer')],
      ['Typ', `${k} · ${K.tier || '–'}${K.name ? ' · ' + K.name : ''}`],
      ['Ersteller', M ? M.credit : '–'],
    ];
    const t = $('.rtech'); t.innerHTML = '';
    for (const [a, b] of rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; t.append(tr); }
    if (M) Promise.all([fileSize(M.file), fileSize(mobileFile(M.file))]).then(([pc, mo]) => {
      if (st.kind !== k) return; const f = $('.rfile'); if (f) f.textContent = `PC ${mb(pc)} · Handy ${mb(mo)}`;
    });
  }
  // Übersicht: alle echten Autos als Tabelle (antippen = dieses Auto zeigen, Spaltenkopf = sortieren)
  async function showAll() {
    if ($('.rall')) { $('.rall').remove(); return; }
    const box = document.createElement('div'); box.className = 'rall'; box.textContent = '⏳ …'; view.append(box);
    const rows = [];
    for (const k of real) {
      const M = modelEntry(k); if (!M || !hasModel(k)) continue;
      const car = buildCar({ kind: k, id: 'review-' + k, color: '#9ca3af', special: null }, api.kinds); setLod(car, false); car.updateMatrixWorld(true);
      const s = carStats(car), ls = car.userData.lampShapes;
      rows.push({ k, name: label(k), tris: s.tris, draws: s.draws, texs: s.texs, maxTex: s.maxTex, gpu: s.geoB + s.texB, pc: await fileSize(M.file), mo: await fileSize(mobileFile(M.file)), lamps: ls ? 'Form' : 'geschätzt', snd: hasRecording(k) ? '🎙️' : '', open: Object.values(st.findings).filter(f => f.kind === k && f.status !== 'erledigt').length });
    }
    const cols = [['name', 'Auto'], ['tris', 'Dreiecke'], ['draws', 'Teile'], ['texs', 'Bilder'], ['maxTex', 'px'], ['gpu', 'Grafik'], ['pc', 'Datei PC'], ['mo', 'Handy'], ['lamps', 'Lampen'], ['snd', 'Ton'], ['open', 'offen']];
    let by = 'tris', dir = -1;
    const fmt = (c, v) => ['gpu', 'pc', 'mo'].includes(c) ? mb(v) : typeof v === 'number' ? num(v) : v;
    const draw = () => {
      rows.sort((a, b) => (a[by] > b[by] ? 1 : a[by] < b[by] ? -1 : 0) * dir);
      const tot = rows.reduce((t, r) => ({ tris: t.tris + r.tris, pc: t.pc + (r.pc || 0), mo: t.mo + (r.mo || 0), gpu: t.gpu + r.gpu }), { tris: 0, pc: 0, mo: 0, gpu: 0 });
      box.innerHTML = `<div style="font-size:13px;margin-bottom:4px">${rows.length} echte Autos · zusammen ${num(tot.tris)} Dreiecke · Dateien PC ${mb(tot.pc)}, Handy ${mb(tot.mo)} · Grafikspeicher ${mb(tot.gpu)} <button data-x="1">✕</button></div>` +
        '<table><tr>' + cols.map(([c, n]) => `<th data-c="${c}">${n}${c === by ? (dir < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('') + '</tr>' +
        rows.map(r => `<tr data-k="${r.k}">` + cols.map(([c]) => `<td class="${c === 'tris' && r.tris > 120000 ? 'bad' : c === 'tris' && r.tris > 60000 ? 'warn' : ''}">${fmt(c, r[c])}</td>`).join('') + '</tr>').join('') + '</table>';
    };
    box.addEventListener('click', e => {
      if (e.target.dataset.x) return box.remove();
      const th = e.target.closest('th'); if (th) { const c = th.dataset.c; dir = by === c ? -dir : c === 'name' || c === 'lamps' ? 1 : -1; by = c; draw(); return; }
      const tr = e.target.closest('tr[data-k]'); if (tr) { box.remove(); showCar(tr.dataset.k); }
    });
    draw();
  }
  function renderList() {
    const fl = $('.flist'), items = Object.entries(st.findings).filter(([, f]) => f.kind === st.kind).sort((a, b) => b[1].t - a[1].t);
    fl.innerHTML = items.length ? '' : '<small style="opacity:.6">Noch keine Findings zu diesem Auto.</small>';
    for (const [, f] of items) {
      const d = document.createElement('div'); d.className = 'find' + (f.status === 'erledigt' ? ' done' : '');
      const sm = document.createElement('small'); sm.textContent = `${f.topic} · ${new Date(f.t).toLocaleString('de-CH')} · ${f.status}`;
      const tx = document.createElement('div'); tx.textContent = f.text; d.append(sm, tx);
      if (f.answer) { const a = document.createElement('div'); a.className = 'ans'; a.textContent = '💬 ' + f.answer; d.append(a); }
      fl.append(d);
    }
  }
  // Findings live aus der Datenbank
  const unsub = fb.onValue(fb.ref(fb.db, 'review/findings'), s => { st.findings = s.val() || {}; renderList(); fillSelect(); }, () => msg('⚠️ Findings können nicht gelesen werden'));

  function startSound() {
    if (st.snd) st.snd.stop();
    st.snd = createCarSound({ kind: st.kind }); st.gears = gearbox(st.kind);
  }
  function dent() { // von einer zufälligen Seite aufs Auto zielen und dort eindrücken (wie bei einem Unfall in der Stadt)
    const car = st.car; car.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(car), c = b.getCenter(new THREE.Vector3()), side = Math.random() < 0.5 ? -1 : 1;
    const along = Math.random() < 0.3, o = along ? new THREE.Vector3(c.x + side * 6, 0.4 + Math.random() * 0.5, c.z + (Math.random() - 0.5) * 1.2)
      : new THREE.Vector3(c.x + (Math.random() - 0.5) * (b.max.x - b.min.x) * 0.6, 0.45 + Math.random() * 0.4, c.z + side * 6);
    const ray = new THREE.Raycaster(o, c.clone().setY(o.y).sub(o).normalize()); ray.camera = camera; // Leucht-Sprites brauchen eine Kamera
    const hit = ray.intersectObject(car, true).find(h => h.face && h.object.isMesh && h.object.name.startsWith('part:') && !h.object.material.transparent);
    if (hit) dentAt(hit, 0.9, st.dented); else msg('Delle geht nur bei echten Automodellen');
  }

  // Bedienung
  const btn = a => root.querySelector(`[data-a="${a}"]`);
  const toggleBlink = k => { st.blink = st.blink === k ? null : k; for (const [a, b] of [['bl', 'left'], ['hz', 'hazard'], ['br', 'right']]) btn(a).classList.toggle('on', st.blink === b); };
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a, i = list.indexOf(st.kind);
    if (a === 'close') return close();
    if (a === 'all') return showAll();
    if (a === 'prev') showCar(list[(i - 1 + list.length) % list.length]);
    if (a === 'next') showCar(list[(i + 1) % list.length]);
    if (a === 'bl') toggleBlink('left'); if (a === 'br') toggleBlink('right'); if (a === 'hz') toggleBlink('hazard');
    if (a === 'night') { st.night = !st.night; b.classList.toggle('on', st.night); }
    if (a === 'brake') { st.brake = !st.brake; b.classList.toggle('on', st.brake); }
    if (a === 'dent') dent();
    if (a === 'fix') dropDents(st.dented);
    if (a === 'cam') { st.cam = b.dataset.c; st.spin = false; btn('spin').classList.remove('on'); for (const x of root.querySelectorAll('[data-a="cam"]')) x.classList.toggle('on', x === b); }
    if (a === 'spin') { st.spin = !st.spin; st.cam = 'free'; b.classList.toggle('on', st.spin); for (const x of root.querySelectorAll('[data-a="cam"]')) x.classList.remove('on'); }
    if (a === 'sound') { if (st.snd) { st.snd.stop(); st.snd = null; } else startSound(); b.classList.toggle('on', !!st.snd); }
    if (a === 'gas') { st.gas = !st.gas; b.classList.toggle('on', st.gas); }
    if (a === 'send') send();
  });
  btn('spin').classList.add('on');
  $('.rcar').addEventListener('change', e => showCar(e.target.value));
  $('.rrpm').addEventListener('input', e => { st.rpm = +e.target.value; });
  async function send() {
    const text = $('.rtext').value.trim(); if (!text) { msg('Bitte zuerst etwas hineinschreiben'); return; }
    const ref = fb.push(fb.ref(fb.db, 'review/findings'));
    try {
      await fb.set(ref, { kind: st.kind, model: label(st.kind).slice(0, 60), topic: $('.rtopic').value, text: text.slice(0, 1000),
        version: (api.version || '').slice(0, 40), t: fb.serverTimestamp(), uid: fb.uid, status: 'offen' });
      $('.rtext').value = ''; msg('✅ Gespeichert – danke!');
    } catch (e) { msg('⚠️ Speichern ging nicht (' + (e.code || e.message) + ')'); }
  }

  // Drehen mit Finger/Maus, zoomen mit zwei Fingern/Mausrad
  const el = renderer.domElement, ptr = new Map(); let pinch = 0;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); if (st.cam !== 'seat') { st.cam = 'free'; st.spin = false; btn('spin').classList.remove('on'); } });
  el.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return; const [px, py] = ptr.get(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 1) { st.yaw -= (e.clientX - px) * 0.008; st.pitch = Math.max(0.02, Math.min(1.35, st.pitch + (e.clientY - py) * 0.006)); }
    else if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) st.dist = Math.max(3, Math.min(20, st.dist * pinch / d)); pinch = d; }
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0; });
  el.addEventListener('wheel', e => { e.preventDefault(); st.dist = Math.max(3, Math.min(20, st.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  const onKey = e => { if (e.code === 'Escape' && document.activeElement.tagName !== 'TEXTAREA') close(); };
  window.addEventListener('keydown', onKey);
  const layout = () => { const w = view.clientWidth || 1, h = view.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', layout);

  const frame = now => {
    if (!st.running) return;
    const dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
    layout();
    const car = st.car, u = car.userData, L = (u.length || 4.5) * Math.max(1, 1.2 / camera.aspect); // schmales Bild: weiter weg
    // Tag/Nacht
    const night = st.night ? 1 : 0;
    scene.background = new THREE.Color(st.night ? 0x05070c : 0x1d2330); scene.environment = st.night ? null : envDay;
    hemi.intensity = st.night ? 0.22 : 0.8; sun.intensity = st.night ? 0.12 : 2.2;
    const phase = Math.floor(now / 380) % 2 === 0;
    setLamps(st.lamps, { night, braking: st.brake, blink: st.blink, phase, driving: true });
    st.lamps.headPos.forEach((p, i) => { const s = heads[i]; s.intensity = 55 * night; s.position.copy(car.localToWorld(p.clone())); s.target.position.copy(car.localToWorld(p.clone().add(new THREE.Vector3(20, -1.2, p.z * 0.6)))); });
    animateCar(car, now / 1000, null, false);
    for (const w of u.wheels || []) w.rotation.z -= st.rpm * dt * 20;
    // Motor: Drehzahl vom Regler (mit Gas etwas höher), Gänge wie in der Stadt
    if (st.snd) st.snd.update({ frac: Math.max(0.02, st.rpm), throttle: st.gas ? 1 : 0.15, speed: st.rpm * 30, dt });
    // Kamera
    if (st.cam === 'seat' && u.eye) {
      const [x, y, z] = u.eye; camera.position.copy(car.localToWorld(new THREE.Vector3(x, y, z))); camera.lookAt(car.localToWorld(new THREE.Vector3(x + 10, y - 1.5, z)));
      if (u.driver) u.driver.visible = false;
    } else {
      if (u.driver) u.driver.visible = true;
      if (st.cam === 'front') { st.yaw = 0; st.pitch = 0.12; st.dist = L * 1.6; }
      if (st.cam === 'back') { st.yaw = Math.PI; st.pitch = 0.12; st.dist = L * 1.6; }
      if (st.cam === 'side') { st.yaw = -Math.PI / 2; st.pitch = 0.1; st.dist = L * 1.8; }
      if (st.spin) st.yaw += dt * 0.3;
      const lk = new THREE.Vector3(0, 0.7, 0);
      camera.position.set(Math.cos(st.yaw) * Math.cos(st.pitch) * st.dist, lk.y + Math.sin(st.pitch) * st.dist, Math.sin(st.yaw) * Math.cos(st.pitch) * st.dist);
      camera.lookAt(lk);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  function close() {
    st.running = false; unsub && unsub();
    if (st.snd) st.snd.stop();
    window.removeEventListener('keydown', onKey); window.removeEventListener('resize', layout);
    renderer.dispose(); renderer.forceContextLoss(); root.remove(); R = null;
    api.onClose && api.onClose();
  }
  R = { close };
  showCar(st.kind); msg('');
  requestAnimationFrame(frame);
}

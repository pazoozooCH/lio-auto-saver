// Neue Gebiete draussen (für city.js), frei zugänglich:
// - Bauernhof im Nordosten: Feldweg von der Stadt, Felder, Matsch-Löcher (langsam, spritzt), Kühe auf der Weide,
//   Scheune, Silo, Windrad, Heuballen (mit dem Traktor einsammeln = Münzen) und ein Traktor zum Einsteigen (RIDES).
// - Strand im Westen am Wasser: Strasse von der Stadt, Promenade mit Palmen, Sand (langsam), Schirme, Kiosk,
//   Rettungsturm, ein Steg mit Boot (BOAT: im Boot fährt man auf dem Wasser).
// - Skigebiet am Pass (ab 20 Schlüsseln): mehr Schnee am Berg, Schnee auf der Strasse oben (rutschig),
//   Sessellift mit fahrenden Sesseln, Skifahrer, die im Zickzack hinunterfahren, Skihütte.
// Koordinaten wie in city.js (x nach Osten, z nach Süden). Bodenhöhe am Berg: passTerrain (wie das feine Gelände).
import * as THREE from 'three';
import { passPoints, passGround, passTerrain, SUMMIT } from './outskirts.js';

const box = (b, x, z, m = 0) => x > b.x0 + m && x < b.x1 - m && z > b.z0 + m && z < b.z1 - m;
const boxDist = (x, z, b) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
};

// ---------- Bauernhof ----------
export const FARM = { x0: 440, x1: 1040, z0: -1040, z1: -350 };
const FARM_ROADS = [{ x0: 250, x1: 330, z0: -263, z1: -249 }, { x0: 316, x1: 330, z0: -287, z1: -249 }, { x0: 316, x1: 512, z0: -287, z1: -273 },
  { x0: 494, x1: 508, z0: -360, z1: -273 }]; // Feldweg: Verlängerung der nördlichen Ringstrasse, dann nach Osten und Norden
const TRACKS = [{ x0: 494, x1: 508, z0: -1000, z1: -350 }, { x0: 501, x1: 1010, z0: -560, z1: -546 }, { x0: 501, x1: 1010, z0: -800, z1: -786 }];
const YARD = { x0: 470, x1: 640, z0: -500, z1: -360 };
const FIELDS = [{ x0: 650, x1: 1020, z0: -530, z1: -380, kind: 'wheat' }, { x0: 520, x1: 1020, z0: -775, z1: -575, kind: 'green' },
  { x0: 520, x1: 1020, z0: -1020, z1: -815, kind: 'plowed' }];
const PASTURE = { x0: 450, x1: 488, z0: -760, z1: -580 };
const MUD = [{ x: 501, z: -640, r: 9 }, { x: 720, z: -553, r: 10 }, { x: 600, z: -480, r: 7 }, { x: 501, z: -905, r: 11 }, { x: 880, z: -793, r: 9 }];
const FARM_SOLIDS = [{ x0: 538, x1: 562, z0: -452, z1: -428 }, { x0: 576, x1: 604, z0: -418, z1: -382 }, { x0: 611, x1: 619, z0: -444, z1: -436 }];
const TRACTOR = { x: 530, z: -475, h: 0 };

// ---------- Strand ----------
const BEACH = { x0: -702, x1: -646, z0: -660, z1: -170 };
const PROM = { x0: -646, x1: -632, z0: -660, z1: -150 };
const BEACH_ROAD = { x0: -646, x1: -250, z0: -200, z1: -184 }; // genau auf der Stadtstrasse z = −192 (beide Spuren)
const PIER = { x0: -772, x1: -700, z0: -424, z1: -416 };
const WATER = { x0: -1100, x1: -702, z0: -700, z1: 380, y: -4 }; // wie in outskirts.js
const BOAT_HOME = { x: -780, z: -420, h: Math.PI };
const KIOSK = { x0: -676, x1: -666, z0: -306, z1: -298 };

// ---------- Skigebiet ----------
const LIFT_A = { x: 290, z: -650 }, LIFT_B = { x: 95, z: -895 }; // Tal- und Bergstation
const SNOW_ROAD = 55; // ab dieser Höhe liegt Schnee auf der Passstrasse

export const RIDES_INFO = { tractor: { ...TRACTOR, v: { id: 'farm-tractor', kind: 'tractor', color: '#3fa34d', ps: 95, name: 'Traktor' } } };

// Abstand zum nächsten ebenen Stück (für das Gelände in city.js)
export function countryDist(x, z) {
  let d = Math.min(boxDist(x, z, FARM) - 4, boxDist(x, z, BEACH), boxDist(x, z, PROM), boxDist(x, z, BEACH_ROAD) - 4);
  for (const r of FARM_ROADS) d = Math.min(d, boxDist(x, z, r) - 4);
  return d;
}
export const inCountry = (x, z) => box(FARM, x, z) || FARM_ROADS.some(r => box(r, x, z)) || box(BEACH, x, z) || box(PROM, x, z) || box(BEACH_ROAD, x, z) || box(PIER, x, z);
export function countryDrivable(x, z, r = 1) {
  const m = r * 0.6;
  if (box(FARM, x, z, m)) return !FARM_SOLIDS.some(b => box(b, x, z, -m)) && !box(PASTURE, x, z, -m);
  if (FARM_ROADS.some(b => box(b, x, z, m - 1)) || box(BEACH_ROAD, x, z, m - 1) || box(PROM, x, z, m - 1)) return true;
  if (box(BEACH, x, z, m)) return !box(KIOSK, x, z, -m);
  return box(PIER, x, z, m - 0.5);
}
export function countrySurface(x, z) {
  if (box(FARM, x, z) || FARM_ROADS.some(b => box(b, x, z))) {
    if (MUD.some(p => Math.hypot(x - p.x, z - p.z) < p.r)) return 'mud';
    if (TRACKS.some(b => box(b, x, z)) || box(YARD, x, z) || FARM_ROADS.some(b => box(b, x, z))) return 'gravel';
    return 'grass';
  }
  if (box(BEACH, x, z)) return 'sand';
  if (box(BEACH_ROAD, x, z) || box(PROM, x, z) || box(PIER, x, z)) return 'asphalt';
  if (passGround(x, z) > SNOW_ROAD) return 'snow';
  return null;
}
// Feste Dinge (auch wenn man quer übers Gelände kommt): Gebäude auf dem Hof, Weide, Kiosk
export const countryBlocked = (x, z, r = 1) => FARM_SOLIDS.some(b => box(b, x, z, -r * 0.6)) || box(PASTURE, x, z, -r * 0.6) || box(KIOSK, x, z, -r * 0.6);
// Skigebiet: Talstation, Bergstation (für city.js: Lift fahren und selber Ski fahren)
export const LIFT = { A: LIFT_A, B: LIFT_B };
// Auf dem Wasser (für das Boot)
export const inWater = (x, z, r = 2) => box(WATER, x, z, r + 6) && !box(PIER, x, z, -r);
export const nearPier = (x, z) => Math.hypot(x - BOAT_HOME.x, z - BOAT_HOME.z) < 14;
export const BOAT_Y = -1.1; // Wasseroberfläche liegt bei −1,2 (outskirts.js), der Rumpf taucht etwas ein

// ---------- Bauen ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function canvasTex(w, h, draw, rep = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t;
}
export function buildCountry({ scene, group, asphaltMat, grassMat, sign, natural, makePerson }) {
  const out = { cows: [], bales: [], chairs: [], skiers: [], blades: null, boat: null, natural };
  const add = (geo, m, x, y, z, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const flat = (b, m, y = 0.04) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0).rotateX(-Math.PI / 2), m); o.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); o.receiveShadow = true; group.add(o); return o; };
  const signPair = (text, bg, fg, w, h, x, y, z, ry) => { for (const side of [0, 1]) { const s = sign(text, bg, fg, w, h); s.position.set(x + Math.sin(ry) * side * 0.05, y, z + Math.cos(ry) * side * 0.05); s.rotation.y = ry + side * Math.PI; group.add(s); } };

  // ===== Bauernhof =====
  const dirt = M(0xa47b4f, { map: canvasTex(64, 64, g => { for (let k = 0; k < 900; k++) { g.fillStyle = `hsl(30,${30 + Math.random() * 20}%,${35 + Math.random() * 20}%)`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); } }, 40), roughness: 1 });
  for (const r of [...FARM_ROADS, ...TRACKS, YARD]) flat(r, dirt, 0.03);
  const fieldTex = { wheat: canvasTex(64, 64, g => { for (let y = 0; y < 64; y += 4) { g.fillStyle = y % 8 ? '#e2c15a' : '#c9a33f'; g.fillRect(0, y, 64, 4); } }, 30),
    green: canvasTex(64, 64, g => { for (let y = 0; y < 64; y += 4) { g.fillStyle = y % 8 ? '#5aa84a' : '#3f8a36'; g.fillRect(0, y, 64, 4); } }, 30),
    plowed: canvasTex(64, 64, g => { for (let y = 0; y < 64; y += 4) { g.fillStyle = y % 8 ? '#7a5534' : '#5e3f25'; g.fillRect(0, y, 64, 4); } }, 30) };
  for (const f of FIELDS) flat(f, M(0xffffff, { map: fieldTex[f.kind], roughness: 1 }), 0.025);
  const mudM = M(0x4a3320, { roughness: 0.35, metalness: 0.1 });
  for (const p of MUD) { const o = add(new THREE.CircleGeometry(p.r, 28).rotateX(-Math.PI / 2), mudM, p.x, 0.05, p.z); o.scale.set(1, 1, 0.8); }
  // Bauernhaus, Scheune, Silo
  const wall = M(0xf1e6cf), red = M(0xb3261e), roofM = M(0x5b3a29), grey = M(0xb8bcc2, { metalness: 0.4 }), wood = M(0x8b5a2b), white = M(0xffffff);
  add(new THREE.BoxGeometry(24, 7, 24), wall, 550, 3.5, -440);
  const r1 = add(new THREE.ConeGeometry(18, 6, 4), roofM, 550, 10, -440); r1.rotation.y = Math.PI / 4;
  for (const dx of [-7, 0, 7]) add(new THREE.BoxGeometry(2, 1.6, 0.2), M(0x8fb9d9), 550 + dx, 4.6, -427.9);
  add(new THREE.BoxGeometry(28, 10, 36), red, 590, 5, -400);
  const barnRoof = add(new THREE.CylinderGeometry(14.5, 14.5, 36.4, 4, 1, false, 0, Math.PI), roofM, 590, 10, -400); barnRoof.rotation.x = Math.PI / 2; barnRoof.rotation.y = Math.PI / 2; barnRoof.scale.set(1, 1, 0.45);
  add(new THREE.BoxGeometry(0.3, 7, 10), white, 575.9, 3.5, -400);
  add(new THREE.CylinderGeometry(4, 4, 16, 20), grey, 615, 8, -440); add(new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), grey, 615, 16, -440);
  signPair('🚜 BAUERNHOF', '#3f6212', '#ffffff', 8, 1.6, 300, 4, -268, Math.PI / 2);
  // Weide mit Zaun und Kühen
  const fence = new THREE.Group(); group.add(fence);
  for (const [x0, z0, x1, z1] of [[PASTURE.x0, PASTURE.z0, PASTURE.x1, PASTURE.z0], [PASTURE.x0, PASTURE.z1, PASTURE.x1, PASTURE.z1], [PASTURE.x0, PASTURE.z0, PASTURE.x0, PASTURE.z1], [PASTURE.x1, PASTURE.z0, PASTURE.x1, PASTURE.z1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(z1 - z0, x1 - x0);
    for (const y of [0.5, 1]) { const b = add(new THREE.BoxGeometry(len, 0.1, 0.08), wood, (x0 + x1) / 2, y, (z0 + z1) / 2, fence); b.rotation.y = -ry; }
    for (let k = 0; k <= len; k += 4) add(new THREE.BoxGeometry(0.15, 1.2, 0.15), wood, x0 + (x1 - x0) * k / len, 0.6, z0 + (z1 - z0) * k / len, fence);
  }
  const cowW = M(0xf5f5f4), cowB = M(0x1c1917), pink = M(0xf9a8d4);
  for (let k = 0; k < 8; k++) {
    const c = new THREE.Group(); scene.add(c);
    add(new THREE.BoxGeometry(2, 1, 0.9), k % 3 ? cowW : cowB, 0, 1.1, 0, c);
    add(new THREE.BoxGeometry(0.7, 0.4, 0.92), k % 3 ? cowB : cowW, 0.2, 1.3, 0, c); // Flecken
    add(new THREE.BoxGeometry(0.6, 0.55, 0.55), k % 3 ? cowW : cowB, 1.2, 1.4, 0, c);
    add(new THREE.BoxGeometry(0.25, 0.25, 0.4), pink, 1.5, 1.25, 0, c);
    for (const [lx, lz] of [[-0.7, -0.3], [-0.7, 0.3], [0.7, -0.3], [0.7, 0.3]]) add(new THREE.BoxGeometry(0.18, 0.7, 0.18), cowB, lx, 0.35, lz, c);
    const cow = { mesh: c, x: PASTURE.x0 + 5 + Math.random() * (PASTURE.x1 - PASTURE.x0 - 10), z: PASTURE.z0 + 8 + Math.random() * (PASTURE.z1 - PASTURE.z0 - 16), h: Math.random() * 6, t: Math.random() * 5, walk: 0 };
    out.cows.push(cow);
  }
  // Heuballen auf dem Weizenfeld
  const hay = M(0xe9c46a, { roughness: 1 });
  for (let k = 0; k < 12; k++) {
    const f = FIELDS[0], x = f.x0 + 20 + Math.random() * (f.x1 - f.x0 - 40), z = f.z0 + 15 + Math.random() * (f.z1 - f.z0 - 30);
    const b = add(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 14).rotateZ(Math.PI / 2), hay, x, 1.1, z, scene);
    out.bales.push({ mesh: b, x, z, gone: 0 });
  }
  // Windrad
  add(new THREE.CylinderGeometry(0.6, 1, 34, 12), white, 950, 17, -960);
  const hub = new THREE.Group(); hub.position.set(950, 34, -958.5); scene.add(hub);
  for (let k = 0; k < 3; k++) { const b = add(new THREE.BoxGeometry(0.6, 14, 0.2), white, 0, 7, 0, new THREE.Group()); b.parent.rotation.z = k * Math.PI * 2 / 3; hub.add(b.parent); }
  out.blades = hub;

  // ===== Strand =====
  const sandM = M(0xe8d39a, { map: canvasTex(64, 64, g => { g.fillStyle = '#e8d39a'; g.fillRect(0, 0, 64, 64); for (let k = 0; k < 500; k++) { g.fillStyle = Math.random() < 0.5 ? '#dcc38a' : '#f3e2b0'; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); } }, 30), roughness: 1 });
  flat(BEACH, sandM, 0.03);
  flat(PROM, asphaltMat, 0.035); flat(BEACH_ROAD, asphaltMat, 0.035);
  // Steg und Boot
  const plank = M(0x9c6b3e);
  add(new THREE.BoxGeometry(PIER.x1 - PIER.x0, 0.3, PIER.z1 - PIER.z0), plank, (PIER.x0 + PIER.x1) / 2, 0.05, (PIER.z0 + PIER.z1) / 2);
  for (let x = PIER.x0 + 2; x < PIER.x1; x += 6) for (const z of [PIER.z0 + 0.3, PIER.z1 - 0.3]) add(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), plank, x, -2.3, z);
  out.boat = makeBoat(); out.boat.position.set(BOAT_HOME.x, BOAT_Y, BOAT_HOME.z); out.boat.rotation.y = -BOAT_HOME.h; scene.add(out.boat);
  signPair('🚤 BOOT – zu Fuss auf den Steg', '#0e7490', '#ffffff', 7, 1.2, PIER.x1 - 4, 2.6, PIER.z0 - 0.5, 0);
  // Palmen, Schirme, Tücher, Kiosk, Rettungsturm, Volleyballnetz, Leute
  const trunk = M(0x8b6b4a), leaf = M(0x2f8f3a, { side: THREE.DoubleSide });
  for (let z = -640; z < -175; z += 26) {
    const p = new THREE.Group(); p.position.set(-650, 0, z); group.add(p);
    const t = add(new THREE.CylinderGeometry(0.22, 0.35, 8, 8), trunk, 0, 4, 0, p); t.rotation.z = 0.08;
    for (let k = 0; k < 6; k++) { const l = add(new THREE.PlaneGeometry(1.2, 4.5), leaf, Math.cos(k) * 1.6, 7.8, Math.sin(k) * 1.6, p); l.rotation.set(Math.PI / 2 - 0.5, 0, -k + Math.PI / 2); }
  }
  const colors = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xec4899];
  for (let k = 0; k < 14; k++) {
    const x = -695 + Math.random() * 38, z = -640 + k * 32 + Math.random() * 8;
    if (box(KIOSK, x, z, -6)) continue;
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), white, x, 1.2, z);
    add(new THREE.ConeGeometry(1.6, 0.6, 10), M(colors[k % 5]), x, 2.4, z);
    add(new THREE.BoxGeometry(1.8, 0.03, 0.9), M(colors[(k + 2) % 5]), x + 1.6, 0.06, z + 0.6);
    if (k % 2 && makePerson) { const pm = makePerson(colors[(k + 1) % 5], 0x5a3a1e, 0xe0ac69); pm.rotation.set(0, Math.random() * 6, Math.PI / 2); pm.position.set(x + 1.6, 0.25, z + 0.6); pm.rotation.order = 'YXZ'; group.add(pm); }
  }
  add(new THREE.BoxGeometry(KIOSK.x1 - KIOSK.x0, 3, KIOSK.z1 - KIOSK.z0), M(0xfde68a), (KIOSK.x0 + KIOSK.x1) / 2, 1.5, (KIOSK.z0 + KIOSK.z1) / 2);
  add(new THREE.BoxGeometry(KIOSK.x1 - KIOSK.x0 + 1.5, 0.3, KIOSK.z1 - KIOSK.z0 + 1.5), M(0xec4899), (KIOSK.x0 + KIOSK.x1) / 2, 3.2, (KIOSK.z0 + KIOSK.z1) / 2);
  signPair('🍦 GLACE', '#ec4899', '#ffffff', 4, 1, (KIOSK.x0 + KIOSK.x1) / 2, 4, KIOSK.z1 + 0.8, 0);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(0.2, 3.6, 0.2), white, -690 + dx * 1.2, 1.8, -420 + dz * 1.2);
  add(new THREE.BoxGeometry(3, 0.3, 3), white, -690, 3.7, -420); add(new THREE.BoxGeometry(2.6, 1.4, 2.6), M(0xef4444), -690, 4.6, -420);
  for (const x of [-688, -676]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), white, x, 1.3, -520);
  add(new THREE.BoxGeometry(12, 0.9, 0.04), M(0xf8fafc, { transparent: true, opacity: 0.7 }), -682, 2.1, -520);
  signPair('🏖️ STRAND', '#0e7490', '#ffffff', 7, 1.5, -300, 4, -204, -Math.PI / 2);

  // ===== Skigebiet: Sessellift, Skihütte, Skifahrer =====
  const ground = (x, z) => Math.max(passTerrain(x, z, natural(x, z)), passGround(x, z));
  const towers = [], n = Math.ceil(Math.hypot(LIFT_B.x - LIFT_A.x, LIFT_B.z - LIFT_A.z) / 55);
  for (let k = 0; k <= n; k++) {
    const x = LIFT_A.x + (LIFT_B.x - LIFT_A.x) * k / n, z = LIFT_A.z + (LIFT_B.z - LIFT_A.z) * k / n, y = ground(x, z);
    add(new THREE.CylinderGeometry(0.35, 0.5, 11, 8), grey, x, y + 5.5, z);
    const arm = add(new THREE.BoxGeometry(0.4, 0.4, 5), grey, x, y + 11, z); arm.rotation.y = -Math.atan2(LIFT_B.z - LIFT_A.z, LIFT_B.x - LIFT_A.x);
    towers.push({ x, y: y + 11, z });
  }
  const dirX = (LIFT_B.x - LIFT_A.x), dirZ = (LIFT_B.z - LIFT_A.z), dl = Math.hypot(dirX, dirZ), sx = -dirZ / dl * 2.2, sz = dirX / dl * 2.2;
  const cableM = new THREE.LineBasicMaterial({ color: 0x222222 });
  for (const s of [1, -1]) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(towers.map(t => new THREE.Vector3(t.x + sx * s, t.y, t.z + sz * s))), cableM));
  out.lift = { towers, sx, sz };
  const seatM = M(0x2563eb), barM = M(0x374151);
  for (let k = 0; k < 18; k++) {
    const c = new THREE.Group(); scene.add(c);
    add(new THREE.BoxGeometry(0.05, 2.2, 0.05), barM, 0, -1.1, 0, c); add(new THREE.BoxGeometry(1.6, 0.15, 0.8), seatM, 0, -2.2, 0, c); add(new THREE.BoxGeometry(1.6, 0.8, 0.12), seatM, 0, -1.8, -0.4, c);
    out.chairs.push({ mesh: c, u: k / 18 });
  }
  for (const [p, text, bg] of [[LIFT_A, '🚡 SESSELLIFT', '#1d4ed8'], [LIFT_B, '⛷️ SKIHÜTTE', '#7c2d12']]) {
    const y = ground(p.x, p.z), hx = p.x - dirX / dl * 8, hz = p.z - dirZ / dl * 8 * (p === LIFT_A ? 1 : -1);
    const hut = add(new THREE.BoxGeometry(9, 4, 7), wood, hx, y + 2, hz); hut.rotation.y = -Math.atan2(dirZ, dirX);
    const rf = add(new THREE.ConeGeometry(7, 3, 4), M(0xf8fafc), hx, y + 5.5, hz); rf.rotation.y = Math.PI / 4 - Math.atan2(dirZ, dirX);
    signPair(text, bg, '#ffffff', 6, 1.2, hx, y + 7.8, hz, 0);
  }
  if (makePerson) for (let k = 0; k < 9; k++) {
    const pm = makePerson(colors[k % 5], 0x1b1b1b, 0xf2c9a0);
    add(new THREE.BoxGeometry(1.7, 0.05, 0.12), M(0x111827), 0, 0.03, -0.12, pm); add(new THREE.BoxGeometry(1.7, 0.05, 0.12), M(0x111827), 0, 0.03, 0.12, pm);
    pm.userData.legs.forEach(l => { l.rotation.z = 0.35; }); pm.userData.arms.forEach(a => { a.rotation.z = 0.5; });
    scene.add(pm);
    out.skiers.push({ mesh: pm, u: k / 9, side: (k % 2 ? 1 : -1) * (8 + k * 2), ph: k });
  }
  out.ground = ground;
  // Schnee auf der Passstrasse (oben): weisses Band über der Fahrbahn
  const pts = passPoints(), snowRows = [], snowM = M(0xf4f7fb, { transparent: true, opacity: 0.75, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  let run = [];
  const flush = () => { if (run.length > 1) snowRows.push(run); run = []; };
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], y = passGround(a.x, a.z);
    if (y < SNOW_ROAD) { flush(); continue; }
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl * 4.4, nz = tx / tl * 4.4;
    run.push([[a.x - nx, y + 0.06, a.z - nz], [a.x + nx, y + 0.06, a.z + nz]]);
  }
  flush();
  for (const rows of snowRows) {
    const pos = [], idx = [];
    rows.forEach((row, i) => { for (const p of row) pos.push(...p); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, snowM); m.material.side = THREE.DoubleSide; m.receiveShadow = true; group.add(m);
  }
  return out;
}

// Boot: Rumpf, Deck, Kabine mit Scheibe (für city.js wie ein Auto: userData.wheels, length, radius)
function makeBoat() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const hull = M(0xf8fafc), stripe = M(0x0e7490), deck = M(0x9c6b3e), glass = M(0x7dd3fc, { metalness: 0.3, roughness: 0.1 });
  const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  const shape = new THREE.Shape(); shape.moveTo(-2.6, -1.1); shape.lineTo(1.6, -1.1); shape.quadraticCurveTo(3.4, 0, 1.6, 1.1); shape.lineTo(-2.6, 1.1); shape.lineTo(-2.6, -1.1);
  const hg = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false }); hg.rotateX(Math.PI / 2); hg.translate(0, 0.5, 0);
  part(hg, hull, 0, 0, 0); part(new THREE.BoxGeometry(4.2, 0.12, 2.2), stripe, -0.5, -0.35, 0);
  part(new THREE.BoxGeometry(4, 0.08, 2), deck, -0.4, 0.52, 0);
  part(new THREE.BoxGeometry(1.4, 0.9, 1.8), M(0xe5e7eb), -0.6, 1, 0); part(new THREE.BoxGeometry(0.1, 0.7, 1.7), glass, 0.15, 1.15, 0);
  part(new THREE.BoxGeometry(0.6, 0.6, 0.6), M(0x111827), -2.6, 0.5, 0); // Motor
  g.userData = { wheels: [], length: 5.8, radius: 2.8, body, boat: true };
  return g;
}

// Bewegung: Kühe grasen und laufen, Windrad dreht, Sessel fahren, Skifahrer im Zickzack, Heuballen einsammeln
export function stepCountry(C, dt, { t, me, cam, tractor, onBale }) {
  if (!C) return;
  const near = (x, z, r) => Math.hypot(x - cam.x, z - cam.z) < r;
  if (C.blades && near(950, -960, 900)) C.blades.rotation.z += dt * 0.9;
  for (const c of C.cows) {
    if (!near(c.x, c.z, 300)) { c.mesh.visible = false; continue; }
    c.mesh.visible = true;
    if ((c.t -= dt) <= 0) { c.t = 3 + Math.random() * 6; c.walk = Math.random() < 0.5 ? 0.7 : 0; c.h += (Math.random() - 0.5) * 2; }
    const nx = c.x + Math.cos(c.h) * c.walk * dt, nz = c.z + Math.sin(c.h) * c.walk * dt;
    if (box(PASTURE, nx, nz, 2.5)) { c.x = nx; c.z = nz; } else c.h += Math.PI * 0.7;
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = -c.h;
  }
  for (const b of C.bales) {
    if (b.gone > 0) { if ((b.gone -= dt) <= 0) b.mesh.visible = true; continue; }
    if (tractor && Math.hypot(me.x - b.x, me.z - b.z) < 3) { b.gone = 120; b.mesh.visible = false; onBale(); }
  }
  if (C.lift && near(LIFT_A.x, (LIFT_A.z + LIFT_B.z) / 2, 700)) {
    const T = C.lift.towers, n = T.length - 1;
    const at = (u, s) => { // u 0…1 entlang der Seile, s = 1 hinauf, −1 hinunter
      const f = Math.min(n - 1e-6, u * n), k = Math.floor(f), w = f - k, a = T[k], b = T[k + 1];
      return [a.x + (b.x - a.x) * w + C.lift.sx * s, a.y + (b.y - a.y) * w - 0.2, a.z + (b.z - a.z) * w + C.lift.sz * s];
    };
    const ry = -Math.atan2(T[n].z - T[0].z, T[n].x - T[0].x) + Math.PI / 2;
    for (const ch of C.chairs) {
      ch.u = (ch.u + dt * 0.012) % 1;
      const up = ch.u < 0.5, [x, y, z] = at(up ? ch.u * 2 : 2 - ch.u * 2, up ? 1 : -1);
      ch.mesh.position.set(x, y, z); ch.mesh.rotation.y = ry + (up ? 0 : Math.PI);
    }
    for (const s of C.skiers) { // von der Berg- zur Talstation im Zickzack
      s.u = (s.u + dt * 0.012) % 1;
      const bx = LIFT_B.x + (LIFT_A.x - LIFT_B.x) * s.u, bz = LIFT_B.z + (LIFT_A.z - LIFT_B.z) * s.u, dl = Math.hypot(LIFT_A.x - LIFT_B.x, LIFT_A.z - LIFT_B.z);
      const px = -(LIFT_A.z - LIFT_B.z) / dl, pz = (LIFT_A.x - LIFT_B.x) / dl, wig = Math.sin(s.u * 40 + s.ph) * 14, side = s.side + wig;
      const x = bx + px * (side + 30), z = bz + pz * (side + 30);
      const dw = Math.cos(s.u * 40 + s.ph) * 14 * 40 / dl, h = Math.atan2(LIFT_A.z - LIFT_B.z + pz * dw * dl, LIFT_A.x - LIFT_B.x + px * dw * dl);
      s.mesh.position.set(x, C.ground(x, z) + 0.05, z); s.mesh.rotation.y = -h; s.mesh.rotation.x = Math.sin(s.u * 40 + s.ph) * 0.25;
    }
  }
  if (C.boat && C.boat.userData.body) C.boat.userData.body.rotation.z = Math.sin(t * 1.3) * 0.03; // schaukelt
}
export { BOAT_HOME };

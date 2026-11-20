// Neue Gebiete draussen (für city.js), frei zugänglich:
// - Bauernhof im Nordosten: Feldweg von der Stadt, Felder, Matsch-Löcher (langsam, spritzt), Kühe auf der Weide,
//   Scheune, Silo, Windrad, Heuballen (mit dem Traktor einsammeln = Münzen) und ein Traktor zum Einsteigen (RIDES).
// - Strand im Westen am Wasser: Strasse von der Stadt, Promenade mit Palmen, Sand (langsam), Schirme, Kiosk,
//   Rettungsturm, ein Steg mit Boot (BOAT: im Boot fährt man auf dem Wasser).
// - Skigebiet am Pass (ab 20 Schlüsseln): mehr Schnee am Berg, Schnee auf der Strasse oben (rutschig),
//   Sessellift mit fahrenden Sesseln, Skifahrer, die im Zickzack hinunterfahren, Skihütte.
// Koordinaten wie in city.js (x nach Osten, z nach Süden). Bodenhöhe am Berg: passTerrain (wie das feine Gelände).
import * as THREE from 'three';
import { passPoints, passGround, passTerrain, passNearest, SUMMIT, ALP } from './outskirts.js';
import { landDist } from './island.js';

const box = (b, x, z, m = 0) => x > b.x0 + m && x < b.x1 - m && z > b.z0 + m && z < b.z1 - m;
const boxDist = (x, z, b) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
};

// ---------- Bauernhof ----------
// Bauernhof auf der Alp am Pass (ebene Wiese ALP in outskirts.js, Höhe FARM_Y); hin kommt man über die Passstrasse
export const FARM = { x0: ALP.x0, x1: ALP.x1, z0: ALP.z0, z1: ALP.z1 };
const FARM_Y = ALP.y;
const FARM_ROADS = []; // Weg von der Passstrasse: nur gezeichnet (am Berg darf man überall fahren)
const TRACKS = [{ x0: 330, x1: 337, z0: -800, z1: -650 }, { x0: 250, x1: 330, z0: -712, z1: -705 }];
const YARD = { x0: 250, x1: 330, z0: -700, z1: -650 };
const FIELDS = [{ x0: 255, x1: 328, z0: -795, z1: -716, kind: 'wheat' }];
const PASTURE = { x0: 342, x1: 386, z0: -795, z1: -700 };
const MUD = [{ x: 290, z: -708, r: 5 }, { x: 333, z: -742, r: 5 }, { x: 362, z: -682, r: 6 }];
const FARM_SOLIDS = [{ x0: 260, x1: 276, z0: -677, z1: -663 }, { x0: 298, x1: 314, z0: -683, z1: -663 }, { x0: 319, x1: 325, z0: -693, z1: -687 }];
const TRACTOR = { x: 285, z: -695, h: 0 };

// ---------- Strand ----------
const BEACH = { x0: -702, x1: -646, z0: -660, z1: -170 };
const PROM = { x0: -646, x1: -632, z0: -660, z1: -150 };
const BEACH_ROAD = { x0: -646, x1: -314, z0: -200, z1: -184 }; // genau auf der Stadtstrasse z = −192 (beide Spuren)
const PIER = { x0: -772, x1: -700, z0: -424, z1: -416 };
const WATER = { x0: -1100, x1: -702, z0: -700, z1: 380, y: -4 }; // wie in outskirts.js
const BOAT_HOME = { x: -780, z: -420, h: Math.PI };
const KIOSK = { x0: -676, x1: -666, z0: -306, z1: -298 };

// ---------- Raketenstart (Mondausflug) ----------
export const SPACE = { x: 700, z: 200, r: 26 }; // Startplatz mit der Mondrakete
const SPACE_ROAD = { x0: 314, x1: 690, z0: 184, z1: 200 }; // Verlängerung der Stadtstrasse z = 192 nach Osten

// ---------- Skigebiet ----------
const SNOW_ROAD = 55; // ab dieser Höhe liegt Schnee auf der Passstrasse
// Skigebiet „Schneeberg“: ein eigener Berg im Autobahn-Ring (südlich vom Flughafen), Dorf mit Talstationen im Norden.
// Drei Lifte (LIFTS: unten A, oben B) und fünf Pisten (PISTES: von oben nach unten, mit Farbe).
export const SKI = { x: 420, z: 1650, r: 360, top: 150 };
const SKI_BASE = { x0: 290, x1: 570, z0: 1210, z1: 1292 };
const SKI_ROAD = { x0: 345, x1: 359, z0: 470, z1: 1222 }; // von der Autobahn-Ausfahrt (Flughafen) zum Skidorf
export function skiH(x, z) { // Höhe des Bergs über dem Gelände
  const d = Math.hypot(x - SKI.x, z - SKI.z);
  if (d >= SKI.r) return 0;
  const c = Math.cos(d / SKI.r * Math.PI / 2);
  return SKI.top * c * c * (1 + 0.07 * Math.sin(Math.atan2(z - SKI.z, x - SKI.x) * 3) * (d / SKI.r));
}
export const skiFade = (x, z) => { const t = Math.min(1, Math.max(0, (Math.hypot(x - SKI.x, z - SKI.z) - SKI.r * 0.85) / (SKI.r * 0.5))); return t * t * (3 - 2 * t); }; // dort keine Hügel
export const LIFTS = [
  { name: '🚡 Gipfel-Sesselbahn', A: { x: 420, z: 1302 }, B: { x: 420, z: 1598 }, color: 0x2563eb },
  { name: '🎿 Skilift West', A: { x: 330, z: 1305 }, B: { x: 268, z: 1488 }, color: 0x16a34a },
  { name: '🚡 Sesselbahn Ost', A: { x: 520, z: 1305 }, B: { x: 602, z: 1498 }, color: 0xdc2626 },
];
const PISTES = [
  { name: '🔵 1 Panorama', color: 0x2563eb, pts: [[400, 1585], [300, 1545], [245, 1455], [285, 1375], [360, 1318], [405, 1290]] },
  { name: '🔴 2 Direttissima', color: 0xdc2626, pts: [[432, 1585], [446, 1480], [428, 1385], [440, 1292]] },
  { name: '⚫ 3 Schwarze Wand', color: 0x111827, pts: [[452, 1592], [535, 1598], [602, 1556], [642, 1450], [592, 1330], [545, 1290]] },
  { name: '🔵 4 Waldweg', color: 0x2563eb, pts: [[262, 1475], [226, 1400], [288, 1322], [340, 1290]] },
  { name: '🔴 5 Ostflanke', color: 0xdc2626, pts: [[610, 1484], [652, 1400], [602, 1322], [556, 1290]] },
];
const pisteDist = (x, z) => { let best = 1e9; for (const P of PISTES) for (let k = 0; k < P.pts.length - 1; k++) {
  const [ax, az] = P.pts[k], [bx, bz] = P.pts[k + 1], lx = bx - ax, lz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / (lx * lx + lz * lz)));
  best = Math.min(best, Math.hypot(x - ax - lx * t, z - az - lz * t)); } return best; };

export const RIDES_INFO = { tractor: { ...TRACTOR, v: { id: 'farm-tractor', kind: 'tractor', color: '#3fa34d', ps: 95, name: 'Traktor' } } };

// Abstand zum nächsten ebenen Stück (für das Gelände in city.js)
export function countryDist(x, z) {
  let d = Math.min(boxDist(x, z, BEACH), boxDist(x, z, PROM), boxDist(x, z, BEACH_ROAD) - 4);
  d = Math.min(d, boxDist(x, z, SPACE_ROAD) - 4, Math.hypot(x - SPACE.x, z - SPACE.z) - SPACE.r - 6, boxDist(x, z, SKI_BASE) - 4, boxDist(x, z, SKI_ROAD) - 4);
  return d;
}
export const inCountry = (x, z) => box(FARM, x, z) || FARM_ROADS.some(r => box(r, x, z)) || box(BEACH, x, z) || box(PROM, x, z) || box(BEACH_ROAD, x, z) || box(PIER, x, z)
  || box(SPACE_ROAD, x, z) || Math.hypot(x - SPACE.x, z - SPACE.z) < SPACE.r || box(SKI_ROAD, x, z) || box(SKI_BASE, x, z);
export function countryDrivable(x, z, r = 1) {
  const m = r * 0.6;
  if (box(FARM, x, z, m)) return !FARM_SOLIDS.some(b => box(b, x, z, -m)) && !box(PASTURE, x, z, -m);
  if (FARM_ROADS.some(b => box(b, x, z, m - 1)) || box(BEACH_ROAD, x, z, m - 1) || box(PROM, x, z, m - 1) || box(SPACE_ROAD, x, z, m - 1) || box(SKI_ROAD, x, z, m - 1) || box(SKI_BASE, x, z, m)) return true;
  if (Math.hypot(x - SPACE.x, z - SPACE.z) < SPACE.r - m) return Math.hypot(x - SPACE.x, z - SPACE.z) > 3 + m; // um die Rakete herum
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
  if (box(BEACH_ROAD, x, z) || box(PROM, x, z) || box(PIER, x, z) || box(SPACE_ROAD, x, z) || Math.hypot(x - SPACE.x, z - SPACE.z) < SPACE.r || box(SKI_ROAD, x, z) || box(SKI_BASE, x, z)) return 'asphalt';
  if (passGround(x, z) > SNOW_ROAD || skiH(x, z) > 2) return 'snow';
  return null;
}
// Feste Dinge (auch wenn man quer übers Gelände kommt): Gebäude auf dem Hof, Weide, Kiosk
export const countryBlocked = (x, z, r = 1) => FARM_SOLIDS.some(b => box(b, x, z, -r * 0.6)) || box(PASTURE, x, z, -r * 0.6) || box(KIOSK, x, z, -r * 0.6)
  || Math.hypot(x - SPACE.x, z - SPACE.z) < 3 + r * 0.6;
// Skigebiet: Talstation, Bergstation (für city.js: Lift fahren und selber Ski fahren)
export const inSki = (x, z) => Math.hypot(x - SKI.x, z - SKI.z) < SKI.r + 30 || box(SKI_BASE, x, z);
// Auf dem Wasser (für das Boot)
export const inWater = (x, z, r = 2) => { const d = landDist(x, z); return d < -(r + 3) && d > -3500 && !box(PIER, x, z, -r); }; // Meer rund um beide Inseln
export const nearPier = (x, z) => Math.hypot(x - BOAT_HOME.x, z - BOAT_HOME.z) < 14;
export const BOAT_Y = -1.1; // Wasseroberfläche liegt bei −1,2 (outskirts.js), der Rumpf taucht etwas ein

// ---------- Bauen ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function mergeGeos(list) { // einfache Formen zu einer zusammenfügen (alle mit Index, Position, Normale, UV)
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0; const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
    const I = g.index; for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off);
    off += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
  return out;
}
function canvasTex(w, h, draw, rep = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t;
}
export function buildCountry({ scene, group, asphaltMat, grassMat, sign, natural, makePerson, height }) {
  const out = { cows: [], bales: [], chairs: [], skiers: [], blades: null, boat: null, natural };
  const add = (geo, m, x, y, z, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const flat = (b, m, y = 0.04) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0).rotateX(-Math.PI / 2), m); o.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); o.receiveShadow = true; group.add(o); return o; };
  const signPair = (text, bg, fg, w, h, x, y, z, ry) => { for (const side of [0, 1]) { const s = sign(text, bg, fg, w, h); s.position.set(x + Math.sin(ry) * side * 0.05, y, z + Math.cos(ry) * side * 0.05); s.rotation.y = ry + side * Math.PI; group.add(s); } };

  // ===== Bauernhof auf der Alp =====
  const farmG = new THREE.Group(); farmG.position.y = FARM_Y; group.add(farmG);
  const fadd = (geo, m, x, y, z) => add(geo, m, x, y, z, farmG);
  const fflat = (b, m, y) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0).rotateX(-Math.PI / 2), m); o.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); o.receiveShadow = true; farmG.add(o); return o; };
  const dirt = M(0xa47b4f, { map: canvasTex(64, 64, g => { for (let k = 0; k < 900; k++) { g.fillStyle = `hsl(30,${30 + Math.random() * 20}%,${35 + Math.random() * 20}%)`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); } }, 12), roughness: 1 });
  for (const r of [...TRACKS, YARD]) fflat(r, dirt, 0.04);
  const fieldTex = canvasTex(64, 64, g => { for (let y = 0; y < 64; y += 4) { g.fillStyle = y % 8 ? '#e2c15a' : '#c9a33f'; g.fillRect(0, y, 64, 4); } }, 10);
  for (const f of FIELDS) fflat(f, M(0xffffff, { map: fieldTex, roughness: 1 }), 0.035);
  const mudM = M(0x4a3320, { roughness: 0.35, metalness: 0.1 });
  for (const p of MUD) { const o = fadd(new THREE.CircleGeometry(p.r, 24).rotateX(-Math.PI / 2), mudM, p.x, 0.06, p.z); o.scale.set(1, 1, 0.8); }
  // Bauernhaus (Chalet), Scheune, Silo
  const wall = M(0xf1e6cf), red = M(0xb3261e), roofM = M(0x5b3a29), grey = M(0xb8bcc2, { metalness: 0.4 }), wood = M(0x8b5a2b), white = M(0xffffff);
  fadd(new THREE.BoxGeometry(16, 6, 14), wall, 268, 3, -670);
  const r1 = fadd(new THREE.ConeGeometry(12, 5, 4), roofM, 268, 8.5, -670); r1.rotation.y = Math.PI / 4; r1.scale.z = 0.9;
  for (const dx of [-5, 0, 5]) fadd(new THREE.BoxGeometry(1.8, 1.4, 0.2), M(0x8fb9d9), 268 + dx, 4, -662.9);
  for (const dx of [-5, 5]) fadd(new THREE.BoxGeometry(1.8, 0.4, 0.5), M(0xdc2626), 268 + dx, 3.1, -662.7); // Blumenkisten
  fadd(new THREE.BoxGeometry(16, 9, 20), red, 306, 4.5, -673);
  const barnRoof = fadd(new THREE.CylinderGeometry(11.5, 11.5, 20.4, 4, 1, false, 0, Math.PI), roofM, 306, 9, -673); barnRoof.rotation.x = Math.PI / 2; barnRoof.rotation.y = Math.PI / 2; barnRoof.scale.set(0.7, 1, 0.42);
  fadd(new THREE.BoxGeometry(6, 6, 0.3), white, 306, 3, -662.9);
  fadd(new THREE.CylinderGeometry(3, 3, 13, 18), grey, 322, 6.5, -690); fadd(new THREE.SphereGeometry(3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), grey, 322, 13, -690);
  signPair('🐄 ALP-BAUERNHOF', '#3f6212', '#ffffff', 8, 1.5, 250, FARM_Y + 3.5, -648, 0);
  // Weg von der Passstrasse herunter (Erdstreifen dem Hang entlang)
  { const pts = []; const A = { x: 222, z: -612 }, B = { x: 256, z: -656 };
    for (let k = 0; k <= 20; k++) { const t = k / 20, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; pts.push([x, Math.max(passTerrain(x, z, natural(x, z)), passGround(x, z)) + 0.15, z]); }
    const pos = [], idx = [];
    pts.forEach(([x, y, z], k) => { pos.push(x - 3, y, z - 2.4, x + 3, y, z + 2.4); if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M(0x8b6b4a, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; group.add(m); }
  // Weide mit Zaun und Kühen (mit Glocke)
  const fence = new THREE.Group(); farmG.add(fence);
  for (const [x0, z0, x1, z1] of [[PASTURE.x0, PASTURE.z0, PASTURE.x1, PASTURE.z0], [PASTURE.x0, PASTURE.z1, PASTURE.x1, PASTURE.z1], [PASTURE.x0, PASTURE.z0, PASTURE.x0, PASTURE.z1], [PASTURE.x1, PASTURE.z0, PASTURE.x1, PASTURE.z1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(z1 - z0, x1 - x0);
    for (const y of [0.5, 1]) { const b = add(new THREE.BoxGeometry(len, 0.1, 0.08), wood, (x0 + x1) / 2, y, (z0 + z1) / 2, fence); b.rotation.y = -ry; }
    for (let k = 0; k <= len; k += 4) add(new THREE.BoxGeometry(0.15, 1.2, 0.15), wood, x0 + (x1 - x0) * k / len, 0.6, z0 + (z1 - z0) * k / len, fence);
  }
  const cowW = M(0xf5f5f4), cowB = M(0x1c1917), pink = M(0xf9a8d4), bell = M(0xd4a017, { metalness: 0.8, roughness: 0.3 });
  for (let k = 0; k < 7; k++) {
    const c = new THREE.Group(); scene.add(c);
    add(new THREE.BoxGeometry(2, 1, 0.9), k % 3 ? cowW : cowB, 0, 1.1, 0, c);
    add(new THREE.BoxGeometry(0.7, 0.4, 0.92), k % 3 ? cowB : cowW, 0.2, 1.3, 0, c); // Flecken
    add(new THREE.BoxGeometry(0.6, 0.55, 0.55), k % 3 ? cowW : cowB, 1.2, 1.4, 0, c);
    add(new THREE.BoxGeometry(0.25, 0.25, 0.4), pink, 1.5, 1.25, 0, c);
    add(new THREE.ConeGeometry(0.14, 0.25, 8), bell, 1.05, 0.95, 0, c); // Kuhglocke
    for (const [lx, lz] of [[-0.7, -0.3], [-0.7, 0.3], [0.7, -0.3], [0.7, 0.3]]) add(new THREE.BoxGeometry(0.18, 0.7, 0.18), cowB, lx, 0.35, lz, c);
    out.cows.push({ mesh: c, x: PASTURE.x0 + 5 + Math.random() * (PASTURE.x1 - PASTURE.x0 - 10), z: PASTURE.z0 + 8 + Math.random() * (PASTURE.z1 - PASTURE.z0 - 16), h: Math.random() * 6, t: Math.random() * 5, walk: 0 });
  }
  // Heuballen auf dem Feld
  const hay = M(0xe9c46a, { roughness: 1 });
  for (let k = 0; k < 10; k++) {
    const f = FIELDS[0], x = f.x0 + 8 + Math.random() * (f.x1 - f.x0 - 16), z = f.z0 + 8 + Math.random() * (f.z1 - f.z0 - 16);
    const b = add(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 14).rotateZ(Math.PI / 2), hay, x, FARM_Y + 1.1, z, scene);
    out.bales.push({ mesh: b, x, z, gone: 0 });
  }
  // Windrad auf der Alp
  fadd(new THREE.CylinderGeometry(0.5, 0.8, 22, 12), white, 372, 11, -668);
  const hub = new THREE.Group(); hub.position.set(372, FARM_Y + 22, -666.8); scene.add(hub);
  for (let k = 0; k < 3; k++) { const b = add(new THREE.BoxGeometry(0.5, 10, 0.2), white, 0, 5, 0, new THREE.Group()); b.parent.rotation.z = k * Math.PI * 2 / 3; hub.add(b.parent); }
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

  // ===== Raketenstart =====
  flat(SPACE_ROAD, asphaltMat, 0.035);
  const padM = M(0xc7cbd1, { roughness: 0.9 });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(SPACE.r, 40).rotateX(-Math.PI / 2), padM); pad.position.set(SPACE.x, 0.04, SPACE.z); pad.receiveShadow = true; group.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6, 32).rotateX(-Math.PI / 2), M(0xfacc15)); ring.position.set(SPACE.x, 0.06, SPACE.z); group.add(ring);
  const steelT = M(0xdc2626, { metalness: 0.4 });
  for (const [dx, dz] of [[6.5, -1.5], [6.5, 1.5], [9.5, -1.5], [9.5, 1.5]]) add(new THREE.BoxGeometry(0.35, 34, 0.35), steelT, SPACE.x + dx, 17, SPACE.z + dz);
  for (let y = 3; y < 34; y += 4) add(new THREE.BoxGeometry(3.4, 0.25, 3.4), steelT, SPACE.x + 8, y, SPACE.z);
  add(new THREE.BoxGeometry(5, 0.4, 0.8), steelT, SPACE.x + 4.5, 24, SPACE.z); // Arm zur Rakete
  out.rocket = makeRocket(); out.rocket.position.set(SPACE.x, 0, SPACE.z); scene.add(out.rocket);
  signPair('🚀 MONDRAKETE – zu Fuss hin, X', '#111827', '#facc15', 10, 1.5, SPACE.x - 12, 3, SPACE.z - SPACE.r + 2, 0);
  signPair('🚀 RAUMBAHNHOF', '#111827', '#facc15', 8, 1.5, 300, 4, 205, -Math.PI / 2);

  // ===== Skigebiet Schneeberg (im Autobahn-Ring) =====
  const ground = (x, z) => Math.max(passTerrain(x, z, natural(x, z)), passGround(x, z)); // am Pass (feines Gelände)
  const H = (x, z) => height(x, z); // Gelände der Welt (mit dem Schneeberg)
  out.lifts = [];
  const seatMs = {}, barM = M(0x374151);
  for (const L of LIFTS) {
    const dx = L.B.x - L.A.x, dz = L.B.z - L.A.z, dl = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(dl / 50)), towers = [];
    for (let k = 0; k <= n; k++) { const x = L.A.x + dx * k / n, z = L.A.z + dz * k / n, y = H(x, z);
      add(new THREE.CylinderGeometry(0.35, 0.5, 11, 8), grey, x, y + 5.5, z); const arm = add(new THREE.BoxGeometry(0.4, 0.4, 5), grey, x, y + 11, z); arm.rotation.y = -Math.atan2(dz, dx);
      towers.push({ x, y: y + 11, z }); }
    const sx = -dz / dl * 2.2, sz = dx / dl * 2.2, cableM = new THREE.LineBasicMaterial({ color: 0x222222 });
    for (const sd of [1, -1]) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(towers.map(t => new THREE.Vector3(t.x + sx * sd, t.y, t.z + sz * sd))), cableM));
    const seatM = seatMs[L.color] || (seatMs[L.color] = M(L.color)), chairs = [];
    const nc = Math.round(dl / 22);
    for (let k = 0; k < nc; k++) { const c = new THREE.Group(); scene.add(c);
      add(new THREE.BoxGeometry(0.05, 2.2, 0.05), barM, 0, -1.1, 0, c); add(new THREE.BoxGeometry(1.6, 0.15, 0.8), seatM, 0, -2.2, 0, c); add(new THREE.BoxGeometry(1.6, 0.8, 0.12), seatM, 0, -1.8, -0.4, c);
      chairs.push({ mesh: c, u: k / nc }); }
    // Stationen unten und oben
    for (const [P, top] of [[L.A, false], [L.B, true]]) { const y = H(P.x, P.z), ang = -Math.atan2(dz, dx);
      const hut = add(new THREE.BoxGeometry(7, 4, 6), wood, P.x - dx / dl * 5 * (top ? -1 : 1), y + 2, P.z - dz / dl * 5 * (top ? -1 : 1)); hut.rotation.y = ang;
      const rf = add(new THREE.BoxGeometry(8, 0.5, 7), M(0xf8fafc), hut.position.x, y + 4.2, hut.position.z); rf.rotation.y = ang; }
    signPair(L.name + (L === LIFTS[0] ? ' – X' : ''), '#1d4ed8', '#ffffff', 7, 1.2, L.A.x - sx * 3, H(L.A.x, L.A.z) + 6, L.A.z - sz * 3, 0);
    out.lifts.push({ ...L, towers, sx, sz, chairs, len: dl });
  }
  // Pisten: Stangen in der Pistenfarbe links und rechts, Schild oben
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6);
  for (const P of PISTES) {
    const pm = M(P.color), pts = [];
    for (let k = 0; k < P.pts.length - 1; k++) { const [ax, az] = P.pts[k], [bx, bz] = P.pts[k + 1], len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < len; d += 22) { const t = d / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t, nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (const sd of [-1, 1]) pts.push([x + nx * sd * 10, z + nz * sd * 10]); } }
    const inst = new THREE.InstancedMesh(poleGeo, pm, pts.length), d0 = new THREE.Object3D();
    pts.forEach(([x, z], k) => { d0.position.set(x, H(x, z) + 0.8, z); d0.updateMatrix(); inst.setMatrixAt(k, d0.matrix); }); scene.add(inst);
    const [x0, z0] = P.pts[0]; signPair(P.name, P.color === 0x111827 ? '#111827' : '#' + P.color.toString(16).padStart(6, '0'), '#ffffff', 5.5, 1.1, x0, H(x0, z0) + 3, z0, 0);
  }
  // Dorf unten: Belag, Skischule, Restaurant oben, grosses Schild, Tannen am Berg (nicht auf Pisten und Liften)
  flat(SKI_BASE, asphaltMat, 0.035); flat(SKI_ROAD, asphaltMat, 0.035);
  signPair('⛷️ SKIGEBIET ↓', '#0e7490', '#ffffff', 6, 1.2, 365, 4, 492, Math.PI / 2);
  const chalet = (x, z, text, w = 14) => { const y = H(x, z);
    add(new THREE.BoxGeometry(w, 5, 9), wood, x, y + 2.5, z);
    const rf = add(new THREE.ConeGeometry(w * 0.72, 4, 4), M(0xf8fafc), x, y + 7, z); rf.rotation.y = Math.PI / 4; rf.scale.z = 9 / w;
    signPair(text, '#7c2d12', '#ffffff', w * 0.7, 1.4, x, y + 5.6, z - 4.8, 0); };
  chalet(360, 1235, '🎿 SKISCHULE'); chalet(480, 1235, '☕ RESTAURANT'); chalet(430, 1612, '⛷️ BERGRESTAURANT', 16);
  signPair('⛷️ SKIGEBIET SCHNEEBERG', '#0e7490', '#ffffff', 14, 2.2, 420, 9, 1212, 0);
  {
    const rnd = (() => { let q = 21; return () => (q = (q * 16807) % 2147483647) / 2147483647; })(), firs = [];
    for (let tries = 0; tries < 3000 && firs.length < 260; tries++) {
      const a = rnd() * Math.PI * 2, r = 60 + rnd() * (SKI.r - 40), x = SKI.x + Math.cos(a) * r, z = SKI.z + Math.sin(a) * r;
      if (pisteDist(x, z) < 20 || LIFTS.some(L => { const lx = L.B.x - L.A.x, lz = L.B.z - L.A.z, t = Math.max(0, Math.min(1, ((x - L.A.x) * lx + (z - L.A.z) * lz) / (lx * lx + lz * lz))); return Math.hypot(x - L.A.x - lx * t, z - L.A.z - lz * t) < 12; }) || H(x, z) > 125) continue;
      firs.push([x, H(x, z), z, 0.7 + rnd() * 0.7]);
    }
    const cone = new THREE.ConeGeometry(2, 6, 8).translate(0, 3.8, 0), fm = new THREE.InstancedMesh(cone, M(0xffffff, { flatShading: true }), firs.length), tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 6).translate(0, 0.6, 0), M(0x5b4030), firs.length), d0 = new THREE.Object3D(), col = new THREE.Color();
    firs.forEach(([x, y, z, sc], k) => { d0.position.set(x, y - 0.2, z); d0.scale.setScalar(sc); d0.updateMatrix(); fm.setMatrixAt(k, d0.matrix); tr.setMatrixAt(k, d0.matrix); fm.setColorAt(k, col.setHex(0x2f5d2a).lerp(new THREE.Color(0xeef2f7), 0.45)); });
    fm.castShadow = true; scene.add(fm, tr);
    out.skiRound = firs.map(([x, , z, sc]) => ({ x, z, r: 0.45 * sc, h: 7 * sc }));
  }
  if (makePerson) for (const [pi, P] of PISTES.entries()) for (let k = 0; k < 2; k++) { // Skifahrer auf den Pisten
    const pm = makePerson(colors[(pi * 2 + k) % 5], 0x1b1b1b, 0xf2c9a0);
    add(new THREE.BoxGeometry(1.7, 0.05, 0.12), M(0x111827), 0, 0.03, -0.12, pm); add(new THREE.BoxGeometry(1.7, 0.05, 0.12), M(0x111827), 0, 0.03, 0.12, pm);
    pm.userData.legs.forEach(l => { l.rotation.z = 0.35; }); pm.userData.arms.forEach(a => { a.rotation.z = 0.5; });
    pm.traverse(o => { o.castShadow = false; }); scene.add(pm);
    out.skiers.push({ mesh: pm, P, u: k / 2 + Math.random() * 0.2, ph: pi * 3 + k, H });
  }
  out.ground = ground;
  // Am Berg: Tannen (oben verschneit), Felsen, rot-weisse Schneestangen und Schneewälle an der Strasse
  {
    const rnd = (() => { let q = 7; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();

    const firs = [], rocks = [];
    for (let tries = 0; tries < 6000 && firs.length < 520; tries++) {
      const x = -400 + rnd() * 800, z = -1100 + rnd() * 720; // bis z = −380: dahinter beginnt die Stadt (oberste Strasse bei −320)
      if (passNearest(x, z).d < 12 || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r + 8 || boxDist(x, z, FARM) < 18) continue; // nicht auf Strasse, Gipfel, Piste
      const y = ground(x, z);
      if (y > 118) continue; // ganz oben wächst nichts
      if (rnd() < 0.18) rocks.push([x, y, z, 0.8 + rnd() * 2.2]); else firs.push([x, y, z, 0.7 + rnd() * 0.8]);
    }
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const fir = new THREE.ConeGeometry(2.2, 4.2, 8); fir.translate(0, 2.1, 0);
    const parts = [fir.clone().translate(0, 1.2, 0), fir.clone().scale(0.78, 0.8, 0.78).translate(0, 3.6, 0), fir.clone().scale(0.52, 0.6, 0.52).translate(0, 5.6, 0)];
    const firGeo = mergeGeos(parts);
    const firM = new THREE.InstancedMesh(firGeo, M(0xffffff, { roughness: 0.9, flatShading: true }), firs.length);
    const trunkM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6).translate(0, 0.8, 0), M(0x5b4030), firs.length);
    firs.forEach(([x, y, z, sc], k) => {
      dummy.position.set(x, y - 0.2, z); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(sc, sc * (0.9 + rnd() * 0.3), sc); dummy.updateMatrix();
      firM.setMatrixAt(k, dummy.matrix); trunkM.setMatrixAt(k, dummy.matrix);
      const snow = Math.min(1, Math.max(0, (y - 45) / 30)); // je höher, desto weisser
      firM.setColorAt(k, col.setHex(0x2f5d2a).lerp(new THREE.Color(0xe8eef5), snow * 0.75));
    });
    firM.castShadow = true; firM.receiveShadow = true; scene.add(firM, trunkM);
    const rockM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M(0x7c7f86, { roughness: 1, flatShading: true }), rocks.length);
    rocks.forEach(([x, y, z, sc], k) => { dummy.position.set(x, y + sc * 0.3, z); dummy.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3); dummy.scale.set(sc * 1.3, sc, sc * 1.1); dummy.updateMatrix(); rockM.setMatrixAt(k, dummy.matrix); });
    rockM.castShadow = true; scene.add(rockM);
    // Schneestangen (rot mit weisser Spitze) und Schneewälle am Strassenrand, wo Schnee liegt
    const pts = passPoints(), poles = [], banks = [];
    for (let k = 0; k < pts.length - 1; k += 3) {
      const a = pts[k], b = pts[k + 1], y = passGround(a.x, a.z), tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl;
      if (y < 30) continue;
      for (const sd of [-1, 1]) { poles.push([a.x + nx * sd * 6.4, y, a.z + nz * sd * 6.4]); if (y > SNOW_ROAD - 5) banks.push([a.x + nx * sd * 7.4, y, a.z + nz * sd * 7.4, Math.atan2(b.z - a.z, b.x - a.x)]); }
    }
    const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 6).translate(0, 1, 0), M(0xdc2626), poles.length);
    const tipM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.065, 0.4, 6).translate(0, 2.2, 0), M(0xf8fafc), poles.length);
    poles.forEach(([x, y, z], k) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); poleM.setMatrixAt(k, dummy.matrix); tipM.setMatrixAt(k, dummy.matrix); });
    const bankM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), M(0xf4f7fb, { roughness: 0.95 }), banks.length);
    banks.forEach(([x, y, z, h], k) => { dummy.position.set(x, y, z); dummy.rotation.set(0, -h, 0); dummy.scale.set(4.2, 0.9, 1.3); dummy.updateMatrix(); bankM.setMatrixAt(k, dummy.matrix); });
    bankM.receiveShadow = true; scene.add(poleM, tipM, bankM);
    out.round = [...firs.map(([x, , z, sc]) => ({ x, z, r: 0.5 * sc, h: 8 * sc })), ...rocks.map(([x, , z, sc]) => ({ x, z, r: sc * 1.1, h: sc * 1.4 }))]; // fest (city.js)
  }
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

// Mondrakete: weisser Rumpf, rote Spitze, vier Flossen, Fenster, Schweizer Kreuz; Flamme (unsichtbar, beim Start an)
export function makeRocket() {
  const g = new THREE.Group(), white = M(0xf8fafc, { metalness: 0.2, roughness: 0.4 }), red = M(0xdc2626), dark = M(0x374151, { metalness: 0.6 });
  const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  part(new THREE.CylinderGeometry(2, 2.2, 20, 24), white, 0, 13, 0);
  part(new THREE.ConeGeometry(2, 6, 24), red, 0, 26, 0);
  part(new THREE.CylinderGeometry(2.25, 2.25, 1.2, 24), red, 0, 18, 0);
  for (let k = 0; k < 4; k++) { const f = part(new THREE.BoxGeometry(0.3, 6, 3), red, Math.cos(k * Math.PI / 2) * 2.6, 4.5, Math.sin(k * Math.PI / 2) * 2.6); f.rotation.y = -k * Math.PI / 2 + Math.PI / 2; }
  part(new THREE.CylinderGeometry(1.4, 2, 2.5, 18), dark, 0, 1.6, 0); // Düse
  for (const y of [15, 21]) { const w = part(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16).rotateZ(Math.PI / 2), M(0x60a5fa, { metalness: 0.5, roughness: 0.1 }), 2.05, y, 0); w.castShadow = false; }
  part(new THREE.BoxGeometry(2, 2, 0.1), red, 0, 9, 2.22); // Schweizer Kreuz auf der Seite
  part(new THREE.BoxGeometry(0.38, 1.3, 0.06), white, 0, 9, 2.29); part(new THREE.BoxGeometry(1.3, 0.38, 0.06), white, 0, 9, 2.29);
  const flame = new THREE.Group(); flame.visible = false; g.add(flame);
  for (const [r, h, c] of [[1.6, 8, 0xf97316], [1, 6, 0xfde047]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })); f.rotation.x = Math.PI; f.position.y = -h / 2 + 0.4; flame.add(f); }
  g.userData.flame = flame;
  return g;
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
  if (C.blades && near(372, -668, 700)) C.blades.rotation.z += dt * 0.9;
  for (const c of C.cows) {
    if (!near(c.x, c.z, 300)) { c.mesh.visible = false; continue; }
    c.mesh.visible = true;
    if ((c.t -= dt) <= 0) { c.t = 3 + Math.random() * 6; c.walk = Math.random() < 0.5 ? 0.7 : 0; c.h += (Math.random() - 0.5) * 2; }
    const nx = c.x + Math.cos(c.h) * c.walk * dt, nz = c.z + Math.sin(c.h) * c.walk * dt;
    if (box(PASTURE, nx, nz, 2.5)) { c.x = nx; c.z = nz; } else c.h += Math.PI * 0.7;
    c.mesh.position.set(c.x, FARM_Y, c.z); c.mesh.rotation.y = -c.h;
  }
  for (const b of C.bales) {
    if (b.gone > 0) { if ((b.gone -= dt) <= 0) b.mesh.visible = true; continue; }
    if (tractor && Math.hypot(me.x - b.x, me.z - b.z) < 3) { b.gone = 120; b.mesh.visible = false; onBale(); }
  }
  if (C.lifts && near(SKI.x, SKI.z, 900)) {
    for (const L of C.lifts) {
      const T = L.towers, n = T.length - 1, ry = -Math.atan2(L.B.z - L.A.z, L.B.x - L.A.x) + Math.PI / 2;
      for (const ch of L.chairs) {
        ch.u = (ch.u + dt * 3 / L.len) % 1;
        const up = ch.u < 0.5, u = up ? ch.u * 2 : 2 - ch.u * 2, sd = up ? 1 : -1;
        const f = Math.min(n - 1e-6, u * n), k = Math.floor(f), w = f - k, a = T[k], b = T[k + 1];
        ch.mesh.position.set(a.x + (b.x - a.x) * w + L.sx * sd, a.y + (b.y - a.y) * w - 0.2, a.z + (b.z - a.z) * w + L.sz * sd); ch.mesh.rotation.y = ry + (up ? 0 : Math.PI);
      }
    }
    for (const s of C.skiers) { // den Pisten entlang hinunter, mit Bögen
      const P = s.P.pts, segs = P.length - 1;
      s.u += dt * 0.025; if (s.u >= 1) s.u = 0;
      const f = s.u * segs, k = Math.min(segs - 1, Math.floor(f)), w = f - k, [ax, az] = P[k], [bx, bz] = P[k + 1], len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len, wig = Math.sin(s.u * 60 + s.ph) * 6, x = ax + (bx - ax) * w + nx * wig, z = az + (bz - az) * w + nz * wig;
      const h = Math.atan2(bz - az, bx - ax) + Math.cos(s.u * 60 + s.ph) * 0.6;
      s.mesh.position.set(x, s.H(x, z) + 0.05, z); s.mesh.rotation.y = -h; s.mesh.rotation.x = Math.sin(s.u * 60 + s.ph) * 0.25;
    }
  }
  if (C.boat && C.boat.userData.body) C.boat.userData.body.rotation.z = Math.sin(t * 1.3) * 0.03; // schaukelt
}
export { BOAT_HOME };

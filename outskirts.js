// Gebiete ausserhalb des Stadtgitters (für city.js). Die Autobahn: ein Rechteck mit runden Ecken südlich der Stadt
// (etwa 7,8 km; die Südgerade liegt auf einem eigenen Geländestück bis z ≈ 3300) mit vier
// Spuren je Richtung, Mittelleitplanke und Leitplanken aussen, Zufahrt vom Südrand der Stadt. Tempolimit 140 (HW_LIMIT) –
// an das sich Raser und Drängler aber nicht halten (die fahren gegen 200).
// Auf der Autobahn fährt jeder anders: gemütliche Lastwagen rechts, normale Autos (überholen und gehen wieder rechts),
// Drängler (kleben am Vordermann, blinken mit dem Licht, hupen) und Raser (sehr schnell, wechseln dauernd die Spur).
// Koordinaten wie in city.js: x nach Osten, z nach Süden, s = Strecke entlang des Ovals, lat = seitlich (positiv =
// rechts in Fahrtrichtung +s, also innen).
import * as THREE from 'three';
import { buildCar, animateCar } from './cars3d.js';

// Mittellinie = Rechteck (x ±half, z cz … cz + L) mit Abstand R rundherum: oben (Norden, bei der Stadt) nach Osten,
// rechts nach Süden, unten nach Westen, links nach Norden; die Ecken sind Viertelkreise
export const HW = { cz: 710, half: 790, R: 260, L: 1500 };
export const HW_LIMIT = 140;
const Q = Math.PI * HW.R / 2; // Viertelkreis
export const HW_LEN = 4 * HW.half + 2 * HW.L + 4 * Q; // ≈ 7794 m
const S_SOUTH = 2 * HW.half + 2 * Q + HW.L; // Anfang der Südgeraden
const TOP = HW.cz - HW.R; // die obere Gerade liegt bei z = 450
const RAMP = { x0: -7, x1: 7, z0: 250, z1: TOP - 6 }; // Zufahrt von der Strasse am Südrand der Stadt (z = 256)
const GAP = { s0: HW.half - 16, s1: HW.half + 16 }; // Einfahrt: dort fehlen Mittel- und Aussenleitplanke
const EDGE = 17.6, MEDIAN = 0.4; // Leitplanken: aussen und in der Mitte
const LANES = [14.1, 10.4, 6.6, 2.9]; // Spurmitte: ganz rechts … ganz links (Überholspur)
const WIDE = EDGE + 1.2; // so weit reicht die Autobahn seitlich
const inGap = s => s > GAP.s0 && s < GAP.s1;

const arcAt = (cx, cz, a) => ({ x: cx + HW.R * Math.cos(a), z: cz + HW.R * Math.sin(a), tx: -Math.sin(a), tz: Math.cos(a) });
export function hwPoint(s) {
  s = ((s % HW_LEN) + HW_LEN) % HW_LEN;
  const { half: h, R, cz, L } = HW, z1 = cz + L;
  if (s < 2 * h) return { x: -h + s, z: cz - R, tx: 1, tz: 0 }; s -= 2 * h;
  if (s < Q) return arcAt(h, cz, -Math.PI / 2 + s / R); s -= Q;
  if (s < L) return { x: h + R, z: cz + s, tx: 0, tz: 1 }; s -= L;
  if (s < Q) return arcAt(h, z1, s / R); s -= Q;
  if (s < 2 * h) return { x: h - s, z: z1 + R, tx: -1, tz: 0 }; s -= 2 * h;
  if (s < Q) return arcAt(-h, z1, Math.PI / 2 + s / R); s -= Q;
  if (s < L) return { x: -h - R, z: z1 - s, tx: 0, tz: -1 }; s -= L;
  return arcAt(-h, cz, Math.PI + s / R);
}
export function hwProject(x, z) {
  const { half: h, R, cz, L } = HW, z1 = cz + L;
  const qx = Math.max(-h, Math.min(h, x)), qz = Math.max(cz, Math.min(z1, z)), dx = x - qx, dz = z - qz;
  if (!dx && !dz) { // mitten im Rechteck (weit weg von der Strasse): nächste Seite
    const n = z - cz, so = z1 - z, w = x + h, e = h - x, m = Math.min(n, so, w, e);
    const s = m === n ? x + h : m === e ? 2 * h + Q + (z - cz) : m === so ? S_SOUTH + (h - x) : 4 * h + 3 * Q + L + (z1 - z);
    return { s, lat: R + m };
  }
  const a = Math.atan2(dz, dx);
  let s;
  if (!dx) s = dz < 0 ? qx + h : S_SOUTH + (h - qx);
  else if (!dz) s = dx > 0 ? 2 * h + Q + (qz - cz) : 4 * h + 3 * Q + L + (z1 - qz);
  else if (dx > 0) s = dz < 0 ? 2 * h + (a + Math.PI / 2) * R : 2 * h + Q + L + a * R;
  else s = dz > 0 ? 4 * h + 2 * Q + L + (a - Math.PI / 2) * R : 4 * h + 3 * Q + 2 * L + (a + Math.PI) * R;
  return { s, lat: R - Math.hypot(dx, dz) };
}
const at = (s, lat) => { const p = hwPoint(s); return { x: p.x - p.tz * lat, z: p.z + p.tx * lat, tx: p.tx, tz: p.tz }; };

// Abstand zum nächsten Gebiet hier draussen (negativ = drin): für flaches Gelände und keine Bäume auf der Strasse
const boxDist = (x, z, b) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
};
export function outskirtsDist(x, z) { return Math.min(Math.abs(hwProject(x, z).lat) - WIDE, boxDist(x, z, RAMP), boxDist(x, z, REST_BOX)); }

// Darf ein Fahrzeug (Radius r) hier draussen stehen? Leitplanken aussen und in der Mitte, Zufahrt mit Leitplanken
export function hwDrivable(x, z, r = 1) {
  const p = hwProject(x, z), gap = inGap(p.s) && p.s < 2 * HW.half;
  if (rwBlocked(p.s, p.lat, r)) return false; // Baustelle
  if (Math.abs(p.lat) <= EDGE - r * 0.8 && (Math.abs(p.lat) >= MEDIAN + r * 0.6 || gap)) return true;
  if (gap && p.lat < 0 && p.lat > -WIDE - 3) return true; // Einfahrt von der Zufahrt her
  if (restDrivable(x, z, r)) return true;
  return x > RAMP.x0 + r * 0.6 && x < RAMP.x1 - r * 0.6 && z > RAMP.z0 && z < RAMP.z1 + 8;
}
export const onHighway = (x, z) => Math.abs(hwProject(x, z).lat) < WIDE || boxDist(x, z, RAMP) < 0;

// ---------- Bauen ----------
function strip(points, mat) { // points: Reihen von [x, y, z, u, v] (zwei je Reihe) → Band
  const pos = [], uv = [], idx = [];
  points.forEach((row, i) => {
    for (const [x, y, z, u, v] of row) { pos.push(x, y, z); uv.push(u, v); }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // Oberseite zeigt nach oben
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}
// Band entlang des Ovals zwischen lat0 und lat1 in der Höhe y (bzw. senkrecht von y0 bis y1 bei lat0 = lat1)
function ribbon(lat0, lat1, y0, y1, mat, keep = () => true, step = 4) {
  const out = [];
  let run = [];
  for (let s = 0; s <= HW_LEN + 0.01; s += step) {
    if (!keep(s)) { if (run.length > 1) out.push(strip(run, mat)); run = []; continue; }
    const a = at(s, lat0), b = at(s, lat1);
    run.push([[a.x, y0, a.z, lat0 / 8, s / 8], [b.x, y1, b.z, lat1 / 8, s / 8]]);
  }
  if (run.length > 1) out.push(strip(run, mat));
  return out;
}

// ---------- Spannung auf der Autobahn ----------
// Tunnel durch einen Hügel auf der unteren Geraden, eine Baustelle auf der oberen (Richtung +s: die zwei rechten Spuren
// gesperrt, alle müssen nach links), knapp überholen gibt Bonus (hooks.nearMiss) und ab und zu jagt die Polizei einen Raser.
const TUNNEL = { s0: S_SOUTH + 60, len: 420, h: 7 }; // auf der Südgeraden, nach der Raststätte (Richtung −s)
const RW = { dir: 1, s0: 140, s1: 440, lat: 8.5, taper: 60 }; // Baustelle: ab lat 8.5 nach rechts gesperrt (davor schräg)
const SHOULDER = 16.4; // Pannenstreifen (dort hält die Polizei einen Raser an)
const inRW = (s, lat) => lat > 0 && s > RW.s0 - RW.taper && s < RW.s1;
const coneLat = s => s >= RW.s0 ? RW.lat : EDGE - 1 - (EDGE - 1 - RW.lat) * (s - RW.s0 + RW.taper) / RW.taper; // Linie der Leitkegel
const rwBlocked = (s, lat, r) => inRW(s, lat) && lat > coneLat(s) - r * 0.6;
// Muss ein Auto (Richtung +1) wegen der Baustelle schon auf die linken Spuren? (220 m vor den Kegeln bis zum Ende)
const rwZone = c => c.dir === 1 && (((RW.s0 - RW.taper - c.s) % HW_LEN + HW_LEN) % HW_LEN < 220 || (c.s > RW.s0 - RW.taper && c.s < RW.s1));
// ---------- Raststätte ----------
// Aussen an der Südgeraden (für die Richtung −s, also wer von der Zufahrt her kommt): Ausfahrt, Grasinsel, Tankstelle
// mit Ladesäulen (REST_ZONES: city.js tankt dort wie an der Tankstelle in der Stadt), Parkplätze für Autos und
// Lastwagen, ein Restaurant. u = Abstand nach aussen (Süden) von der Mittellinie, x wie in der Welt.
export const REST = { x: 0, z: HW.cz + HW.L + HW.R, half: 150, end: 222, island: 142 };
const REST_S = S_SOUTH + HW.half; // s in der Mitte der Raststätte
const REST_BOX = { x0: REST.x - REST.end - 10, x1: REST.x + REST.end + 10, z0: REST.z + EDGE, z1: REST.z + 135 };
const RB = { x0: -45, x1: 45, u0: 74, u1: 98 }; // Restaurant
export const REST_ZONES = { gas: { x: REST.x - 110, z: REST.z + 50, w: 34, d: 18 }, charge: { x: REST.x - 80, z: REST.z + 50, w: 10, d: 14 } };
// Parkfelder: 25 für Autos (Schnauze nach Süden), 3 für Lastwagen (Schnauze nach Osten). Autos von der Autobahn fahren
// hinein, bleiben eine Weile und fahren wieder weg (stepRestCar); die parkierten sind fest (restSolid, für dich).
const REST_SLOTS = [];
for (let k = 0; k < 25; k++) REST_SLOTS.push({ x: REST.x - 36 + 3 * k, u: 48, truck: false, car: null });
for (const u of [40, 49, 58]) REST_SLOTS.push({ x: REST.x + 108, u, truck: true, car: null });
const restSolid = [];
const restOuter = ax => EDGE + 16 + 96 * Math.min(1, Math.max(0, (REST.half - ax) / 30));
const restGap = s => { const d = Math.abs(s - REST_S); return d > REST.island && d < REST.end; }; // Aus- und Einfahrt
function restDrivable(x, z, r) {
  const u = z - REST.z, ax = Math.abs(x - REST.x);
  if (ax > REST.end || u < EDGE - 2 || u > restOuter(ax) - r * 0.6) return false;
  if (ax < REST.island && u < EDGE + 12 + r * 0.6) return false; // Grasinsel zwischen Autobahn und Raststätte
  if (x > REST.x + RB.x0 - r * 0.6 && x < REST.x + RB.x1 + r * 0.6 && u > RB.u0 - r * 0.6 && u < RB.u1 + r * 0.6) return false; // Restaurant
  for (const b of restSolid) if (Math.abs(x - b.x) < b.hx + r * 0.6 && Math.abs(z - b.z) < b.hz + r * 0.6) return false; // parkierte Fahrzeuge
  return true;
}
const inRestZone = (x, z) => Math.abs(x - REST.x) < REST.end + 5 && z - REST.z > EDGE + 0.5 && z - REST.z < 140;

// Weg durch Punkte [x, z] (Catmull-Rom, alle ~0,5 m ein Punkt; d = Länge bis dorthin, L = ganze Länge)
export function makePath(pts) {
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  let L = 0;
  for (let i = 1; i < P.length - 2; i++) {
    const [a, b, c, d] = [P[i - 1], P[i], P[i + 1], P[i + 2]], n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 0.5));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, f = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      const x = f(a[0], b[0], c[0], d[0]), z = f(a[1], b[1], c[1], d[1]), q = out[out.length - 1];
      if (q) L += Math.hypot(x - q.x, z - q.z);
      out.push({ x, z, d: L });
    }
  }
  out.L = L;
  return out;
}
// Punkt und Richtung (h = atan2(dz, dx)) bei Länge d; i = wo man zuletzt war (schneller suchen)
export function pathAt(path, d, i = 0) {
  i = Math.min(i, path.length - 2);
  while (i < path.length - 2 && path[i + 1].d < d) i++;
  const a = path[i], b = path[i + 1], f = b.d > a.d ? Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d))) : 0;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, h: Math.atan2(b.z - a.z, b.x - a.x), i };
}
// Winkel a langsam zu b drehen (höchstens m)
export const turnTo = (a, b, m) => { let d = b - a; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return a + Math.max(-m, Math.min(m, d)); };

const RZ = u => REST.z + u;
function restInPath(c, slot) { // von der Autobahn bis ins Feld
  const pts = [[c.x, c.z], [REST.x - 215, RZ(18.5)], [REST.x - 195, RZ(24)], [REST.x - 160, RZ(31)], [REST.x - 130, RZ(33.5)]];
  if (slot.truck) pts.push([REST.x + 70, RZ(33.5)], [REST.x + 90, RZ(slot.u)], [REST.x + 100, RZ(slot.u)], [slot.x, RZ(slot.u)]);
  else pts.push([slot.x - 9, RZ(34)], [slot.x, RZ(41)], [slot.x, RZ(slot.u)]);
  const P = makePath(pts);
  P.fast = makePath(pts.slice(0, 4)).L; // bis dahin noch zügig
  return P;
}
function restOutPath(slot) { // vorwärts hinaus, hinten herum zur Einfahrt
  const sx = slot.x - REST.x, pts = slot.truck ? [[sx, slot.u], [124, slot.u], [140, 44], [149, 33]]
    : [[sx, slot.u], [sx, 57], [sx + 9, 65], [120, 67], [138, 56], [148, 38]];
  pts.push([175, 28], [200, 21], [215, 18.5]);
  return makePath(pts.map(([x, u]) => [REST.x + x, RZ(u)]));
}
function freeSlot(truck) {
  const free = REST_SLOTS.filter(q => q.truck === truck && !q.car && !(q.gone > 0));
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}
function stepRestCar(c, dt, cars, me, ahead) {
  const R = c.rest;
  if (R.state === 'park') {
    c.speed = 0;
    if ((R.t -= dt) <= 0) { R.state = 'out'; R.path = restOutPath(R.slot); R.d = 0; R.i = 0; R.slot.car = null; R.slot.gone = 4; }
    return;
  }
  if (R.state === 'merge') { // an der Einfahrt warten, bis rechts eine Lücke ist
    const p = hwProject(c.x, c.z);
    c.s = p.s; c.dir = -1; c.lat = p.lat; c.speed = 0;
    if (!ahead(c, -LANES[0], -45, 30)) {
      c.rest = null; c.lane = 0; c.speed = 10; c.laneT = 3; c.restAsk = true;
      cars.restCars.splice(cars.restCars.indexOf(c), 1);
    }
    return;
  }
  const left = R.path.L - R.d;
  let v = R.state === 'in' && R.d < R.path.fast ? 16 : R.state === 'out' && left < 75 ? 13 : 6;
  v = Math.min(v, Math.sqrt(2 * 2.5 * left) + 0.2); // im Feld (bzw. an der Einfahrt) anhalten
  const fx = Math.cos(c.h), fz = Math.sin(c.h), wait = (x, z, far) => {
    const dx = x - c.x, dz = z - c.z, along = dx * fx + dz * fz;
    return along > 0 && along < far && Math.abs(dz * fx - dx * fz) < 2.6;
  };
  for (const o of cars.restCars) if (o !== c && o.rest.state !== 'park' && wait(o.x, o.z, 9)) v = 0; // andere vorne
  if (wait(me.x, me.z, 8)) v = 0; // du stehst im Weg
  c.speed += Math.max(-6 * dt, Math.min(3 * dt, v - c.speed));
  c.speed = Math.max(0, c.speed);
  R.d = Math.min(R.path.L, R.d + c.speed * dt);
  const q = pathAt(R.path, R.d, R.i);
  R.i = q.i; c.x = q.x; c.z = q.z; c.h = turnTo(c.h, q.h, dt * Math.max(0.6, c.speed * 0.5));
  if (left < 0.05) {
    if (R.state === 'in') { R.state = 'park'; R.t = (R.slot.truck ? 60 : 25) + Math.random() * (R.slot.truck ? 140 : 90); c.speed = 0; c.h = R.slot.truck ? 0 : Math.PI / 2; }
    else R.state = 'merge';
  }
}

function buildRest(group, { asphaltMat, lineMat, sign, grassMat, rail, posts }) {
  const X = REST.x, Z = REST.z, mat = o => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; group.add(b); return b; };
  const flat = (w, d, m, x, y, z) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); f.position.set(x, y, z); f.receiveShadow = true; group.add(f); return f; };
  // Belag: Ausfahrt, Gasse, Parkplatz (Zeilen von West nach Ost, damit die Oberseite nach oben zeigt)
  const rows = [];
  for (let x = -REST.end; x <= REST.end + 0.01; x += 3) rows.push([[X + x, 0.025, Z + EDGE - 0.6, x / 8, 0], [X + x, 0.025, Z + restOuter(Math.abs(x)), x / 8, 14]]);
  group.add(strip(rows, asphaltMat));
  // Grasinsel mit Randstein
  const curb = mat({ color: 0xc7c9cc });
  flat(2 * REST.island, 11.2, grassMat, X, 0.13, Z + EDGE + 6.2);
  box(2 * REST.island, 0.14, 0.3, curb, X, 0.07, Z + EDGE + 12.05);
  for (const sx of [-1, 1]) box(0.3, 0.14, 11.6, curb, X + sx * REST.island, 0.07, Z + EDGE + 6.2);
  // Randlinien und Parkfelder
  flat(2 * REST.end, 0.15, lineMat, X, 0.05, Z + restOuter(REST.end) - 0.6);
  for (let x = -37.5; x <= 37.6; x += 3) flat(0.13, 12, lineMat, X + x, 0.05, Z + 48);
  for (const u of [35.5, 44.5, 53.5, 62.5]) flat(60, 0.15, lineMat, X + 110, 0.05, Z + u);
  // Tankstelle (rotes Dach, Zapfsäulen) und Ladesäulen (grün)
  const G = REST_ZONES.gas, C = REST_ZONES.charge, red = mat({ color: 0xd62828 }), white = mat({ color: 0xf3f4f6 }), steel = mat({ color: 0x9ca3af, metalness: 0.5 });
  box(G.w + 2, 0.7, G.d + 2, red, G.x, 5.6, G.z);
  box(G.w + 2.1, 0.25, G.d + 2.1, white, G.x, 5.15, G.z);
  for (const dx of [-G.w / 2 + 1, G.w / 2 - 1]) for (const dz of [-G.d / 2 + 1, G.d / 2 - 1]) box(0.5, 5.2, 0.5, steel, G.x + dx, 2.6, G.z + dz);
  for (const dx of [-10, 0, 10]) { box(1.2, 1.7, 0.8, red, G.x + dx, 0.85, G.z); box(1.25, 0.4, 0.85, white, G.x + dx, 1.5, G.z); }
  const green = mat({ color: 0x16a34a });
  box(C.w + 1, 0.4, C.d, green, C.x, 4.2, C.z);
  for (const dz of [-3.5, 3.5]) { box(0.7, 1.8, 0.5, green, C.x, 0.9, C.z + dz); box(0.4, 4, 0.4, steel, C.x + C.w / 2, 2, C.z + dz); }
  for (const side of [0, 1]) {
    const s1 = sign('⛽ TANKEN', '#d62828', '#ffffff', 6, 1.3); s1.position.set(G.x, 6.6, G.z - G.d / 2 - 1.2 - side * 0.05); s1.rotation.y = side ? Math.PI : 0; group.add(s1);
    const s2 = sign('⚡ LADEN', '#16a34a', '#ffffff', 4.5, 1.1); s2.position.set(C.x, 5, C.z - C.d / 2 - 0.2 - side * 0.05); s2.rotation.y = side ? Math.PI : 0; group.add(s2);
  }
  // Restaurant: Wände, Glasfront zur Autobahn, Dach, Schild
  const wall = mat({ color: 0xe8dcc4 }), glass = mat({ color: 0x5b8db8, metalness: 0.4, roughness: 0.15 }), roof = mat({ color: 0x5b4636 });
  const bw = RB.x1 - RB.x0, bd = RB.u1 - RB.u0, bx = X + (RB.x0 + RB.x1) / 2, bz = Z + (RB.u0 + RB.u1) / 2;
  box(bw, 5, bd, wall, bx, 2.5, bz);
  box(bw - 6, 3.4, 0.3, glass, bx, 2.2, Z + RB.u0 - 0.1);
  box(bw + 3, 0.6, bd + 3, roof, bx, 5.3, bz);
  box(10, 0.3, 4, roof, bx, 3.6, Z + RB.u0 - 2); // Vordach über der Tür
  for (const side of [0, 1]) {
    const s = sign('🍔 RASTSTÄTTE ☕', '#b45309', '#ffffff', 16, 2.4); s.position.set(bx, 7.2, Z + RB.u0 - 0.2 - side * 0.05); s.rotation.y = side ? Math.PI : 0; group.add(s);
  }
  // Tische draussen und ein paar Bäume
  const wood = mat({ color: 0x8b5a2b });
  for (let k = 0; k < 5; k++) { const x = X - 38 + k * 19; box(2.4, 0.15, 1.2, wood, x, 0.8, Z + 104); box(2.4, 0.1, 0.4, wood, x, 0.45, Z + 103); box(2.4, 0.1, 0.4, wood, x, 0.45, Z + 105); }
  const trees = [];
  for (let x = -REST.half + 6; x <= REST.half - 6; x += 14) trees.push([X + x, Z + restOuter(Math.abs(x)) + 6]);
  for (let x = -REST.island + 10; x <= REST.island - 10; x += 22) trees.push([X + x, Z + EDGE + 6.5]);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 6), mat({ color: 0x5b4030 }), trees.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1), mat({ color: 0x3f7a35, flatShading: true }), trees.length);
  const m4 = new THREE.Matrix4();
  trees.forEach(([x, z], k) => { trunk.setMatrixAt(k, m4.makeTranslation(x, 1.3, z)); crown.setMatrixAt(k, m4.makeTranslation(x, 3.6, z)); });
  crown.castShadow = true; group.add(trunk, crown);
  // Schilder vor der Ausfahrt (die Autos kommen von Westen) und ein hoher Mast
  for (const [d, text] of [[720, '⛽🍔 Raststätte 500 m'], [400, '⛽🍔 Raststätte 200 m'], [REST.end + 10, '⛽🍔 Raststätte ↘']]) for (const side of [0, 1]) {
    const p = at(REST_S + d, -(EDGE + 1.6)), sg = sign(text, '#1d4ed8', '#ffffff', 9, 1.6);
    sg.position.set(p.x + side * 0.05, 4.5, p.z); sg.rotation.y = -Math.PI / 2 + side * Math.PI; // vorne die Seite, die nach Westen schaut group.add(sg);
  }
  box(0.5, 14, 0.5, steel, X - 175, 7, Z + 30);
  for (const side of [0, 1]) { const s = sign('⛽ 🍔 ☕', '#b45309', '#ffffff', 5, 2.2); s.position.set(X - 175 + side * 0.3 - 0.15, 13, Z + 30); s.rotation.y = -Math.PI / 2 + side * Math.PI; group.add(s); }
  // Leitplanke aussen um den Parkplatz (nur als Rand, fahren darf man dort sowieso nicht weiter)
  for (let x = -REST.end; x < REST.end; x += 4) posts.push({ x: X + x, z: Z + restOuter(Math.abs(x)) + 0.4 });
  const pr = [];
  for (let x = -REST.end; x <= REST.end + 0.01; x += 3) { const zz = Z + restOuter(Math.abs(x)) + 0.4; pr.push([[X + x, 0.8, zz, 0, 0], [X + x, 0.45, zz, 0, 1]]); }
  group.add(strip(pr, rail));
}

function buildExtras(group, sign, grassMat) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9, side: THREE.DoubleSide });
  const T0 = TUNNEL.s0, T1 = TUNNEL.s0 + TUNNEL.len, inT = s => s >= T0 && s <= T1, H = TUNNEL.h;
  // Tunnel: Wände, Decke, Lampenreihen; darüber ein Grashügel, vorne und hinten ein Portal
  for (const l of [-EDGE - 0.3, EDGE + 0.3]) for (const m of ribbon(l, l, 0, H, concrete, inT, 6)) group.add(m);
  for (const m of ribbon(-EDGE - 0.3, EDGE + 0.3, H, H, concrete, inT, 6)) { m.castShadow = true; group.add(m); }
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  for (const l of [-9, 9]) for (const m of ribbon(l + 0.3, l - 0.3, H - 0.05, H - 0.05, lamp, s => inT(s) && s % 14 < 5, 2)) group.add(m); // zeigt nach unten
  // Grashügel als Gitter über (s, lat): rund nach allen Seiten, über der Strasse ausserhalb des Tunnels ausgeschnitten
  const TOP = 14, smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const road = (s, lat) => Math.abs(lat) < EDGE + 1.5 && (s < T0 || s > T1);
  const hs = [], ls = [];
  for (let q = T0 - 48; q <= T1 + 48; q += 4) hs.push(q);
  for (let l = -72; l <= 72; l += 3) ls.push(l);
  const pos = [], uv = [], idx = [], NL = ls.length;
  for (const q of hs) for (const l of ls) {
    const ds = q < T0 ? T0 - q : q > T1 ? q - T1 : 0, bump = 1 + 0.08 * Math.sin(q * 0.05) * Math.cos(l * 0.09)
      + (ds ? 0 : 1.1 * Math.sin(Math.PI * (q - T0) / TUNNEL.len)); // in der Mitte ein richtiger Berg
    const h = road(q, l) ? 0 : Math.max(0, TOP * bump * (1 - smooth(EDGE + 4, 72, Math.abs(l))) * (1 - smooth(0, 48, ds)) - 0.3);
    const p = at(q, l); pos.push(p.x, h, p.z); uv.push(l / 8, q / 8);
  }
  for (let i = 1; i < hs.length; i++) for (let j = 0; j + 1 < NL; j++) {
    if (road(hs[i - 1], ls[j]) || road(hs[i], ls[j]) || road(hs[i - 1], ls[j + 1]) || road(hs[i], ls[j + 1])) continue;
    const A = (i - 1) * NL + j, B = A + 1, C = i * NL + j, D = C + 1;
    idx.push(A, B, C, B, D, C);
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); hg.setIndex(idx); hg.computeVertexNormals();
  const mound = new THREE.Mesh(hg, grassMat); mound.castShadow = mound.receiveShadow = true; group.add(mound);
  for (const s of [T0, T1]) { // Portale: Betonwand von der Tunneldecke bis über den Hügel, mit dunklem Rand
    const p = at(s, 0), w = 2 * EDGE + 4;
    const portal = new THREE.Mesh(new THREE.BoxGeometry(1.4, TOP - H + 0.6, w), new THREE.MeshStandardMaterial({ color: 0x8b9099, roughness: 0.85 }));
    portal.position.set(p.x, (H + TOP + 0.6) / 2, p.z); portal.rotation.y = -Math.atan2(p.tz, p.tx); portal.castShadow = true;
    group.add(portal);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, w + 0.2), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.7 }));
    band.position.set(p.x, H + 0.4, p.z); band.rotation.y = portal.rotation.y; group.add(band);
  }
  // Baustelle: Leitkegel und Baken entlang der Sperrung, Schild davor
  const cone = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 }), white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const cones = [];
  for (let s = RW.s0 - RW.taper; s < RW.s1; s += 5) cones.push(at(s, coneLat(s) + 0.3)); // schräg hineinführen, dann geradeaus
  const coneM = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.8, 10), cone, cones.length), ringM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 10), white, cones.length);
  const m4 = new THREE.Matrix4();
  cones.forEach((p, k) => { coneM.setMatrixAt(k, m4.makeTranslation(p.x, 0.43, p.z)); ringM.setMatrixAt(k, m4.makeTranslation(p.x, 0.5, p.z)); });
  group.add(coneM, ringM);
  for (const s of [RW.s0 - 230, RW.s0 - 110]) for (const side of [0, 1]) {
    const p = at(s, EDGE + 1.5), sg = sign(s < RW.s0 - 200 ? '🚧 BAUSTELLE in 200 m' : '🚧 Rechte Spuren gesperrt', '#f59e0b', '#111827', 9, 1.6);
    sg.position.set(p.x - side * 0.05 * p.tz, 4.5, p.z + side * 0.05); sg.rotation.y = -Math.PI / 2 + side * Math.PI; group.add(sg); // schaut den Autos entgegen
  }
}

export function buildHighway({ group, asphaltMat, lineMat, sign, grassMat }) {
  buildExtras(group, sign, grassMat);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.9, side: THREE.DoubleSide });
  const rail = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  const add = list => { for (const m of list) group.add(m); };
  add(ribbon(-WIDE + 0.5, WIDE - 0.5, 0.03, 0.03, asphaltMat)); // Fahrbahn
  for (const l of [-EDGE + 0.7, -0.8, 0.8, EDGE - 0.7]) add(ribbon(l - 0.12, l + 0.12, 0.05, 0.05, lineMat)); // Randlinien
  for (const b of [4.75, 8.5, 12.25]) for (const l of [-b, b]) add(ribbon(l - 0.1, l + 0.1, 0.05, 0.05, lineMat, s => s % 18 < 6)); // gestrichelt
  const noGap = s => !(inGap(s) && s < 2 * HW.half);
  for (const l of [-MEDIAN, MEDIAN]) add(ribbon(l, l, 0, 0.85, concrete, noGap)); // Mittelleitplanke (Beton)
  add(ribbon(-MEDIAN, MEDIAN, 0.85, 0.85, concrete, noGap));
  const outer = s => noGap(s) && !restGap(s); // aussen fehlt die Leitplanke bei der Einfahrt und an der Raststätte
  add(ribbon(EDGE, EDGE, 0.45, 0.8, rail)); add(ribbon(-EDGE, -EDGE, 0.45, 0.8, rail, outer)); // Leitplanken aussen
  const posts = [];
  for (let s = 0; s < HW_LEN; s += 4) for (const l of [EDGE + 0.1, -EDGE - 0.1]) if (l > 0 || outer(s)) posts.push(at(s, l));
  buildRest(group, { asphaltMat, lineMat, sign, grassMat, rail, posts });
  // Zufahrt
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(RAMP.x1 - RAMP.x0, RAMP.z1 + 4 - RAMP.z0).rotateX(-Math.PI / 2), asphaltMat);
  ramp.position.set(0, 0.03, (RAMP.z0 + RAMP.z1 + 4) / 2); ramp.receiveShadow = true;
  group.add(ramp);
  for (let z = RAMP.z0 + 16; z < RAMP.z1 - 2; z += 12) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5).rotateX(-Math.PI / 2), lineMat); d.position.set(0, 0.05, z); group.add(d); }
  for (const x of [RAMP.x0 - 0.4, RAMP.x1 + 0.4]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(RAMP.z1 - RAMP.z0 - 22, 0.35).rotateY(Math.PI / 2), rail);
    r.position.set(x, 0.62, (RAMP.z0 + 20 + RAMP.z1 - 2) / 2); group.add(r);
    for (let z = RAMP.z0 + 20; z < RAMP.z1 - 2; z += 4) posts.push({ x, z });
  }
  const postM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), rail, posts.length), m4 = new THREE.Matrix4();
  posts.forEach((p, k) => postM.setMatrixAt(k, m4.makeTranslation(p.x, 0.4, p.z)));
  group.add(postM);
  // Schilder: Autobahn (blau) am Anfang der Zufahrt, Tempo 140 vor der Einfahrt
  for (const side of [0, 1]) {
    const s1 = sign('🛣️ AUTOBAHN', '#1d4ed8', '#ffffff', 8, 1.6);
    s1.position.set(9.5, 4, RAMP.z0 + 22 + side * 0.05); s1.rotation.y = side * Math.PI; group.add(s1);
  }
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d61f1f'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(HW_LIMIT), 64, 67);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
  end.position.set(8.4, 2.4, RAMP.z1 - 30); end.rotation.y = Math.PI; group.add(end);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), rail); pole.position.set(8.4, 1.2, RAMP.z1 - 29.95); group.add(pole);
}

// ---------- Verkehr ----------
// Viele Autos: jedes ist nur ein kleines Objekt (Strecke s, Spur, Tempo). Nur die nahen bekommen ein echtes 3D-Auto aus
// einem Vorrat (POOL), weiter weg genügt ein einfacher Klotz (zwei InstancedMesh = zwei Zeichen-Befehle für alle).
// Gesucht wird der Vordermann über Fächer (BIN Meter lang), sonst würde jedes Auto alle anderen anschauen.
const KINDS_OF = {
  slow: ['delivery', 'tanker', 'umzug', 'camper', 'van', 'postauto', 'parcel'],
  normal: ['car', 'kombi', 'kompakt', 'hatch', 'coupe', 'minivan', 'pickup', 'jeep', 'smart', 'taxi', 'ecar'],
  tail: ['car', 'kombi', 'coupe', 'muscle', 'jeep', 'pickup', 'offroad'],
  racer: ['sports', 'muscle', 'roadster', 'rally', 'hyper', 'nightracer', 'stockcar'],
};
const TYPES = [['slow', 0.2], ['normal', 0.47], ['tail', 0.17], ['racer', 0.16]];
const COLORS = [0xc0392b, 0x2563eb, 0xf4f4f4, 0x22232b, 0x9aa0aa, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0e7490, 0xb45309, 0xe5e7eb, 0x1f2937];
const pick = a => a[Math.floor(Math.random() * a.length)];
const LEN = { slow: 8, normal: 4.6, tail: 4.6, racer: 4.4 };
const WANT = { slow: 22, normal: 35, tail: 53, racer: 56 }; // m/s: Lastwagen ~80 km/h, Normale ~125, Drängler ~190, Raser ~200
const GAPT = { slow: 1.8, normal: 1.4, tail: 0.35, racer: 0.8 };
const POOL = { slow: 6, normal: 16, tail: 6, racer: 6 }; // so viele echte 3D-Autos gleichzeitig (die nächsten)
const BIN = 25, NBIN = Math.ceil(HW_LEN / BIN);
const MAX_EXTRA = 650; // Zusatzautos für lange Staus
const MAXI = 1200; // Klötze
const wrapS = s => ((s % HW_LEN) + HW_LEN) % HW_LEN;
const wrapDs = d => { d %= HW_LEN; if (d < -HW_LEN / 2) d += HW_LEN; if (d > HW_LEN / 2) d -= HW_LEN; return d; };
const randType = () => { let r = Math.random(); for (const [t, w] of TYPES) if ((r -= w) < 0) return t; return 'normal'; };

function newCar(type, dir, s, lane, extra = false) {
  const want = WANT[type] + (Math.random() - 0.5) * 6;
  return { type, dir, lane, lat: dir * LANES[lane], s, speed: want * 0.8, want, len: LEN[type], radius: LEN[type] * 0.48,
    gapT: GAPT[type], laneT: Math.random() * 2, flashT: 0, honkT: 0, x: 0, z: 0, mesh: null, col: pick(COLORS), extra, ph: Math.floor(Math.random() * 3) };
}

export function makeHighwayTraffic(scene, kinds, n = 260) {
  const cars = [];
  for (let k = 0; k < n; k++) {
    const type = randType(), dir = k % 2 ? -1 : 1;
    cars.push(newCar(type, dir, Math.random() * HW_LEN, { slow: 0, normal: k % 3 === 0 ? 1 : 0, tail: 3, racer: 2 + (k % 2) }[type]));
  }
  cars.meshes = [];
  // Vorrat an echten 3D-Autos je Art
  cars.pool = {};
  for (const type of Object.keys(POOL)) {
    cars.pool[type] = [];
    const list = KINDS_OF[type].filter(x => kinds[x]);
    for (let k = 0; k < POOL[type]; k++) {
      const kind = list[k % list.length], v = { kind, color: kinds[kind].color || '#' + pick(COLORS).toString(16).padStart(6, '0'), special: null };
      const mesh = buildCar(v, kinds);
      if (type === 'tail') { // Lichthupe: zwei helle Punkte vorne, nur beim Drängeln sichtbar
        const fl = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (const z of [-0.6, 0.6]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m); b.position.set(mesh.userData.length / 2, 0.7, z); fl.add(b); }
        fl.visible = false; mesh.add(fl); mesh.userData.flash = fl;
      }
      mesh.visible = false; scene.add(mesh);
      cars.pool[type].push(mesh); cars.meshes.push(mesh);
    }
  }
  // weit weg: Klötze (Karosserie farbig, Kabine dunkel)
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXI);
  const cab = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x2b3440 }), MAXI);
  for (const m of [body, cab]) { m.count = 0; m.frustumCulled = false; m.castShadow = m.receiveShadow = false; scene.add(m); }
  body.setColorAt(0, new THREE.Color(0xffffff));
  cars.far = { body, cab };
  if (kinds.police) { // ein Polizeiauto, das ab und zu einen Raser jagt (dir 0 = gerade nicht unterwegs)
    const mesh = buildCar({ kind: 'police', color: kinds.police.color, special: null }, kinds);
    mesh.visible = false; scene.add(mesh); cars.meshes.push(mesh);
    cars.cop = { mesh, own: true, type: 'cop', state: 'idle', t: 25 + Math.random() * 20, dir: 0, lane: 3, lat: 0, s: 0, speed: 0, want: 60, len: mesh.userData.length,
      radius: mesh.userData.radius, gapT: 0.5, laneT: 0, flashT: 0, honkT: 0, x: 0, z: 0, target: null };
    cars.push(cars.cop);
  }
  cars.rescue = []; // Krankenwagen und Feuerwehr für Unfälle (warten unsichtbar)
  for (const kind of ['ambulance', 'firetruck']) {
    if (!kinds[kind]) continue;
    const mesh = buildCar({ kind, color: kinds[kind].color, special: null }, kinds);
    mesh.visible = false; scene.add(mesh); cars.meshes.push(mesh);
    const c = { mesh, own: true, type: 'rescue', state: 'idle', t: 0, dir: 0, lane: 2, lat: 0, s: 0, speed: 0, want: 30, len: mesh.userData.length,
      radius: mesh.userData.radius, gapT: 0.4, laneT: 0, flashT: 0, honkT: 0, x: 0, z: 0, k: 0 };
    cars.push(c); cars.rescue.push(c);
  }
  // Unfallstelle: Rauch und ein Warndreieck
  const smoke = new THREE.Group(), smokeMat = new THREE.MeshBasicMaterial({ color: 0x4b4b4b, transparent: true, opacity: 0.4, depthWrite: false });
  for (let k = 0; k < 7; k++) smoke.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), smokeMat));
  const tri = new THREE.Mesh(new THREE.CircleGeometry(0.5, 3).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide }));
  smoke.visible = tri.visible = false; scene.add(smoke, tri);
  cars.props = { smoke, tri };
  // Raststätte: am Anfang ist gut die Hälfte der Felder besetzt (Zusatzautos: fahren später weg und verschwinden)
  cars.restCars = [];
  for (const q of REST_SLOTS) {
    q.car = null; q.gone = 0;
    if (Math.random() > 0.6) continue;
    const c = newCar(q.truck ? 'slow' : pick(['normal', 'normal', 'normal', 'tail', 'racer']), -1, 0, 0, true);
    c.rest = { state: 'park', slot: q, t: Math.random() * 100 };
    c.x = q.x; c.z = REST.z + q.u; c.h = q.truck ? 0 : Math.PI / 2; c.speed = 0;
    q.car = c; cars.push(c); cars.restCars.push(c);
  }
  cars.zones = []; cars.acc = null; cars.extras = 0; cars.meshed = [];
  cars.accT = 60 + Math.random() * 30; // der erste Unfall nach gut einer Minute auf der Autobahn
  cars.jamT = 100 + Math.random() * 60; // der erste lange Stau
  cars.bins = [[], []].map(() => Array.from({ length: NBIN }, () => []));
  return cars;
}

// Polizei: wartet unsichtbar, taucht dann hinter dir auf und jagt einen Raser vor dir; hat sie ihn, winken beide
// auf den Pannenstreifen und bleiben eine Weile stehen. Gibt die gewünschte Geschwindigkeit zurück (null = nicht unterwegs).
function stepCop(c, dt, cars, P, ahead, hooks) {
  c.t -= dt;
  if (c.state === 'idle') {
    if (c.t > 0 || !P) return null;
    let best = null, bd = Infinity;
    for (const r of cars) {
      if (r.type !== 'racer' || r.dir !== P.dir || r.shoulder || r.wreck || r.rest) continue;
      const ds = wrapDs((r.s - P.s) * P.dir);
      if (ds > 30 && ds < 400 && ds < bd) { bd = ds; best = r; }
    }
    if (!best) { c.t = 8; return null; }
    Object.assign(c, { state: 'chase', target: best, dir: P.dir, s: wrapS(P.s - P.dir * 160), lane: 3, speed: 60, t: 70, shoulder: false });
    c.lat = c.dir * LANES[3];
    hooks.msg('🚨 Die Polizei jagt einen Raser!', true);
  }
  const R = c.target;
  if ((R.dead || R.rest) && c.state !== 'leave') { c.state = 'leave'; c.t = 12; c.shoulder = false; R.shoulder = false; }
  const gap = wrapDs((R.s - c.s) * c.dir) - (R.len + c.len) / 2;
  if (c.state === 'chase') {
    if (gap < 70) c.lane = R.lane; // nah dran: hinter den Raser
    else if ((c.laneT -= dt) <= 0) { // sonst die Spur mit dem meisten Platz nehmen
      c.laneT = 0.5;
      let bl = c.lane, bg = -1;
      for (let l = c.dir === 1 && rwZone(c) ? 2 : 0; l < LANES.length; l++) {
        const a = ahead(c, c.dir * LANES[l], -12, 160), g = a ? a.gap : 999;
        if (g > bg + (l === c.lane ? -5 : 5)) { bg = g; bl = l; }
      }
      c.lane = bl;
    }
    if (gap < 14 && !(c.dir === 1 && rwZone(c)) && !(c.dir === 1 && rwZone(R)) && !zoneOf(cars, R)) { // erwischt (nicht in Baustelle oder Stau anhalten)
      c.state = 'stop'; c.t = 16; R.shoulder = c.shoulder = true; c.speed = Math.min(c.speed, R.speed); // nicht am Raser vorbeischiessen
      if (P && Math.abs(wrapDs(c.s - P.s)) < 300) hooks.msg('🚓 Raser erwischt! Ab auf den Pannenstreifen.', true);
    } else if (c.t <= 0 || gap < -20) { c.state = 'leave'; c.t = 12; } // zu schnell weg oder überholt: aufgeben
    return Math.min(78, Math.max(R.speed + 16, gap > 40 ? 75 : R.speed + 4));
  }
  if (c.state === 'stop') {
    if (c.t <= 0) { R.shoulder = c.shoulder = false; R.laneT = 0; c.state = 'leave'; c.t = 25; c.lane = 0; }
    return Math.max(0, R.speed + (gap - 5) * 0.8);
  }
  // leave: fährt davon und verschwindet, sobald niemand mehr hinschaut
  if (c.t <= 0 || !P || Math.abs(wrapDs(c.s - P.s)) > 500) {
    c.state = 'idle'; c.dir = 0; c.t = 70 + Math.random() * 60; c.mesh.visible = false; c.target = null; return null;
  }
  return 42;
}

// ---------- Staus: nach einem Unfall oder einfach so (kilometerlang) ----------
// Ein Stau ist eine Zone vor ihrem Kopf (s, Richtung dir, Länge len): darin Stop-and-go, und alle bilden eine
// Rettungsgasse (ganz links an die Mitte, alle anderen nach rechts). Beim Unfall krachen weit vor dir zwei Autos
// zusammen (die zwei rechten Spuren sind zu); kurz nachdem du im Stau stehst, kommen Krankenwagen und Feuerwehr mit
// Blaulicht durch die Gasse; wer sie blockiert, bekommt eine Busse (hooks.gasse). Lange Staus lösen sich nach ein paar
// Minuten wieder auf; die Zusatzautos verschwinden, sobald man sie nicht mehr sieht.
const JAM = 330;     // so lang ist der Stau hinter einer Unfallstelle (m)
const GASSE = 4.75;  // dort fahren die Retter durch (zwischen Überholspur und den anderen)
const zoneDist = (Z, c) => wrapDs((Z.s - c.s) * Z.dir); // > 0: der Kopf liegt vor c
function zoneOf(cars, c) {
  for (const Z of cars.zones) if (Z.dir === c.dir) { const d = zoneDist(Z, c); if (d > -12 && d < Z.len) return Z; }
  return null;
}
const gasseOff = c => c.lane === 3 ? -1.0 : 1.15; // in der Gasse: Überholspur zur Mitte, die anderen nach rechts
const km = m => (Math.round(m / 100) / 10).toFixed(1).replace('.', ',');

// Liegt ein Stück der Strecke (Richtung dir, von s0 rückwärts len Meter) schon in einem Stau oder in der Baustelle?
function busy(cars, dir, s0, len) {
  for (const Z of cars.zones) if (Z.dir === dir) {
    const a = wrapDs((Z.s - s0) * dir); // Kopf des anderen relativ zu unserem Kopf (positiv = davor)
    if (a > -len - 200 && a < Z.len + 200) return true;
  }
  if (dir === 1) { const d = wrapDs(RW.s1 - s0); if (d > -len - 400 && d < RW.s1 - RW.s0 + RW.taper + 300) return true; }
  return false;
}
// Stau auffüllen: in allen Spuren Autos mit kleinem Abstand (zuerst die, die schon dort sind; dann Zusatzautos)
function fillQueue(cars, Z, from = 10) {
  const here = cars.filter(c => !c.own && !c.rest && c.dir === Z.dir && !c.wreck && !c.shoulder && zoneDist(Z, c) > -8 && zoneDist(Z, c) < Z.len + 10);
  for (let lane = 0; lane < LANES.length; lane++) {
    for (let d = from + Math.random() * 6; d < Z.len - 6;) {
      const s = wrapS(Z.s - Z.dir * d);
      let c = here.pop();
      if (!c) { if (cars.extras >= MAX_EXTRA) break; c = newCar(randType(), Z.dir, s, lane, true); cars.push(c); cars.extras++; }
      Object.assign(c, { s, lane, lat: Z.dir * (LANES[lane] + gasseOff({ lane })), speed: 0.5, laneT: 1 + Math.random() * 3 });
      d += c.len + 3.5 + Math.random() * 4;
    }
  }
}
function startAccident(cars, P) {
  const dir = P.dir, s = wrapS(P.s + dir * 760);
  if (busy(cars, dir, s, JAM + 200)) return false;
  const far = cars.filter(c => !c.own && !c.rest && c.dir === dir && !c.shoulder && !c.wreck && c !== (cars.cop && cars.cop.target)
    && Math.abs(wrapDs(c.s - P.s)) > 430); // nur Autos, die du gerade nicht siehst
  if (far.length < 2) return false;
  const A = { kind: 'acc', s, dir, len: JAM, t: 0, phase: 'jam', wrecks: [], rescue: [], called: false, block: 0, warnT: 0, told: 0 };
  for (let k = 0; k < 2; k++) { // die zwei Unfallautos, schräg auf den rechten Spuren
    const c = far.splice(Math.floor(Math.random() * far.length), 1)[0];
    Object.assign(c, { wreck: { yaw: k ? -0.55 : 0.7 }, lane: k, lat: dir * LANES[k], s: wrapS(s - dir * k * 5), speed: 0 });
    A.wrecks.push(c);
  }
  cars.zones.push(A); cars.acc = A;
  fillQueue(cars, A, 16);
  return true;
}
function endAccident(cars) {
  const A = cars.acc;
  for (const c of A.wrecks) { c.wreck = null; c.laneT = 1 + Math.random() * 3; }
  for (const c of A.rescue) { c.state = 'leave'; c.t = 0; }
  cars.props.smoke.visible = cars.props.tri.visible = false;
  cars.zones = cars.zones.filter(Z => Z !== A);
  cars.acc = null; cars.accT = 150 + Math.random() * 100;
}
// Langer Stau: entsteht weit weg (meist vor dir, damit du hineinfährst), 0,9 bis 2,5 km lang, hält ein paar Minuten
function startJam(cars, P) {
  const dir = Math.random() < 0.7 ? P.dir : -P.dir, len = 900 + Math.random() * 1600;
  const s = dir === P.dir ? wrapS(P.s + dir * (650 + len + Math.random() * 900)) : wrapS(P.s + (Math.random() - 0.5) * HW_LEN);
  if (busy(cars, dir, s, len)) return false;
  if (dir !== P.dir) { // auf der Gegenseite: nicht direkt neben dir entstehen lassen
    const d = zoneDist({ s, dir }, P);
    if (d > -500 && d < len + 500) return false;
  }
  const Z = { kind: 'jam', s, dir, len, t: 0, dur: 160 + Math.random() * 160, told: 0 };
  cars.zones.push(Z);
  fillQueue(cars, Z);
  return true;
}
function callRescue(cars, A, from) {
  A.called = true;
  cars.rescue.forEach((c, k) => {
    Object.assign(c, { state: 'go', dir: A.dir, s: wrapS(from - A.dir * k * 22), lat: A.dir * GASSE, speed: 16, t: 0, k, passed: false });
    A.rescue.push(c);
  });
}
// Retter: fahren durch die Gasse bis zur Unfallstelle, stehen dort eine Weile, fahren dann weg und verschwinden
function stepRescue(c, dt, A, P) {
  c.t += dt;
  if (c.state === 'go') {
    const d = A ? zoneDist(A, c) - (6 + c.k * 12) : 0;
    if (d <= 0.5) c.state = 'park';
    return Math.min(17, Math.sqrt(2 * 5 * Math.max(0, d)) + 0.3);
  }
  if (c.state === 'park') return 0;
  if (c.t > 60 || !P || Math.abs(wrapDs(c.s - P.s)) > 450) { c.state = 'idle'; c.dir = 0; c.mesh.visible = false; return null; }
  return 30;
}

// Ein Schritt: me = { x, z, heading, speed, len, radius, on, see } (on: steht auf der Autobahn),
// hooks = { honk, msg, bump, nearMiss, siren, gasse }
const dummy = new THREE.Object3D(), tmpCol = new THREE.Color();
export function stepHighway(cars, dt, t, me, cam, hooks) {
  let P = null;
  if (me.on) { // du als Hindernis (auf welcher Seite, welcher Spur, wie schnell in Fahrtrichtung)
    const p = hwProject(me.x, me.z), d = p.lat >= 0 ? 1 : -1, tp = hwPoint(p.s);
    P = { s: p.s, lat: p.lat, dir: d, speed: me.speed * (Math.cos(me.heading) * tp.tx + Math.sin(me.heading) * tp.tz) * d, len: me.len, me: true };
  }
  // Fächer füllen (einmal pro Bild)
  const bins = cars.bins;
  for (const B of bins) for (const b of B) b.length = 0;
  for (const c of cars) if (c.dir && !c.rest) bins[c.dir > 0 ? 1 : 0][Math.floor(c.s / BIN) % NBIN].push(c);
  if (P) bins[P.dir > 0 ? 1 : 0][Math.floor(P.s / BIN) % NBIN].push(P);
  const ahead = (c, lat, from = 0, range = 140) => { // nächstes Fahrzeug vor c auf der Spur lat (from < 0: auch knapp dahinter)
    const B = bins[c.dir > 0 ? 1 : 0], b0 = Math.floor(c.s / BIN), k0 = from < 0 ? -Math.ceil(-from / BIN) - 1 : -1, k1 = Math.ceil(range / BIN) + 1;
    let best = null, bd = Infinity;
    for (let k = k0; k <= k1; k++) {
      if (best && (k - 1) * BIN > bd) break; // weiter vorne kommt nichts Näheres mehr
      for (const o of B[((b0 + c.dir * k) % NBIN + NBIN) % NBIN]) {
        if (o === c || Math.abs(o.lat - lat) > 2.3) continue;
        if (o.shoulder && !c.shoulder && Math.abs(o.lat) > 15.3) continue; // steht schon auf dem Pannenstreifen
        const ds = wrapDs((o.s - c.s) * c.dir);
        if (ds > from && ds < range && ds < bd) { bd = ds; best = o; }
      }
    }
    return best ? { o: best, gap: bd - (c.len + best.len) / 2 } : null;
  };
  // Unfall und lange Staus: starten, Retter rufen, aufräumen
  if (P) {
    if (!cars.acc && (cars.accT -= dt) <= 0 && !startAccident(cars, P)) cars.accT = 5;
    if (!cars.zones.some(Z => Z.kind === 'jam') && (cars.jamT -= dt) <= 0 && !startJam(cars, P)) cars.jamT = 5;
  }
  for (const Z of cars.zones) {
    Z.t += dt;
    const dP = P && P.dir === Z.dir ? zoneDist(Z, P) : null;
    if (dP !== null) {
      if (dP > Z.len && dP < Z.len + 700 && !Z.told) { Z.told = 1; hooks.msg(Z.kind === 'acc' ? '⚠️ Unfall! Gleich Stau – Rettungsgasse bilden!' : '⚠️ Achtung: ' + km(Z.len) + ' km Stau!', true); }
      if (dP > 0 && dP < Z.len && Z.told < 2) { Z.told = 2; hooks.msg('🚧 Stau! Rettungsgasse: ganz links nach links, alle anderen nach rechts.', true); }
      if (dP < -15 && Z.told === 2) { Z.told = 3; hooks.msg('✅ Stauende – freie Fahrt!', true); }
    }
    if (Z.kind === 'jam' && Z.t > Z.dur) { // löst sich auf
      Z.gone = true; cars.jamT = 200 + Math.random() * 160;
      if (dP !== null && dP > -20 && dP < Z.len) hooks.msg('🚗 Der Stau löst sich auf!', true);
    }
  }
  if (cars.zones.some(Z => Z.gone)) cars.zones = cars.zones.filter(Z => !Z.gone);
  let A = cars.acc;
  if (A) {
    A.warnT -= dt;
    const dP = P && P.dir === A.dir ? zoneDist(A, P) : null;
    if (!A.called && cars.rescue.length) {
      if (dP !== null && dP > 0 && dP < JAM) { A.callT = (A.callT || 0) + dt; if (A.callT > 6) { callRescue(cars, A, P.s - A.dir * 230); hooks.msg('🚑 Blaulicht von hinten!', true); } }
      else if (A.t > 90) callRescue(cars, A, A.s - A.dir * (JAM + 200)); // du kommst nicht: sie kommen trotzdem
    }
    if (A.phase === 'jam' && A.called && A.rescue.every(c => c.state === 'park')) { A.phase = 'work'; A.t = 0; }
    if (A.phase === 'work' && A.t > 20) { endAccident(cars); A = null; if (dP !== null && dP > -50 && dP < JAM + 100) hooks.msg('✅ Die Unfallstelle ist geräumt.', true); }
    else if (!cars.rescue.length && A.t > 120) { endAccident(cars); A = null; }
  }
  if (A) { // Rauch und Warndreieck
    const w = A.wrecks[0], { smoke, tri } = cars.props;
    smoke.visible = tri.visible = true;
    smoke.position.set(w.x, 0, w.z);
    smoke.children.forEach((b, k) => { const ph = (t * 0.35 + k / smoke.children.length) % 1; b.position.set(Math.sin(k * 2.4) * 0.9, 1 + ph * 8, Math.cos(k * 2.4) * 0.9); b.scale.setScalar(0.5 + ph * 2.4); });
    const p = at(A.s - A.dir * 90, A.dir * 16.9);
    tri.position.set(p.x, 0.45, p.z); tri.rotation.y = -Math.atan2(p.tz, p.tx) + Math.PI / 2;
  }
  const see = me.see || 240, near = Math.min(150, see * 0.55), near2 = near * near, rel2 = (near + 25) ** 2, see2 = see * see;
  const { body, cab } = cars.far;
  let nFar = 0, siren = 0, dead = 0;
  const vis = cars.vis || (cars.vis = []); vis.length = 0;
  const cop = cars.cop && cars.cop.state === 'chase' ? cars.cop : null;
  restSolid.length = 0; // parkierte Fahrzeuge an der Raststätte: fest für dich
  for (const c of cars.restCars) if (c.rest.state === 'park') restSolid.push({ x: c.x, z: c.z, hx: c.rest.slot.truck ? 4.2 : 1.1, hz: c.rest.slot.truck ? 1.3 : 2.4 });
  for (const q of REST_SLOTS) if (q.gone > 0) q.gone -= dt;
  const lodD2 = Math.max(700, see + 60) ** 2, frame = cars.frame = (cars.frame || 0) + 1;
  for (const c of cars) {
    // weit weg (nicht zu sehen): nur jedes dritte Bild rechnen, dafür mit dreifachem Zeitschritt
    const lx = c.x - cam.x, lz = c.z - cam.z, lod = !c.own && lx * lx + lz * lz > lodD2 && c.x !== 0;
    if (lod && (frame + (c.ph || 0)) % 3) continue;
    const cdt = lod ? dt * 3 : dt;
    if (c.rest) { // an der Raststätte
      stepRestCar(c, cdt, cars, me, ahead);
      const dx = c.x - cam.x, dz = c.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 < see2) { c.yaw = -c.h; c.d2 = d2; c.cdt = cdt; vis.push(c); }
      continue;
    }
    // Richtung −s, rechts unterwegs, kurz vor der Ausfahrt: etwa jeder Zweite fährt zur Raststätte (wenn ein Feld frei ist)
    if (c.dir === -1 && !c.own) {
      const ds = c.s - REST_S;
      if (ds > 250 && ds < 300 && !c.restAsk && c.lane <= 1 && !c.wreck && !c.shoulder && c !== (cars.cop && cars.cop.target)) {
        c.restAsk = true;
        const slot = Math.random() < 0.5 && !zoneOf(cars, c) ? freeSlot(c.type === 'slow') : null;
        if (slot) {
          const tp = hwPoint(c.s);
          c.h = Math.atan2(-tp.tz, -tp.tx);
          c.rest = { state: 'in', slot, path: restInPath(c, slot), d: 0, i: 0 };
          slot.car = c; cars.restCars.push(c);
          continue;
        }
      } else if (c.restAsk && (ds < 200 || ds > 320)) c.restAsk = false;
    }
    let want = c.want;
    if (c.own) {
      want = c.type === 'cop' ? stepCop(c, cdt, cars, P, ahead, hooks) : stepRescue(c, cdt, A, P);
      if (want === null) { c.mesh.visible = false; continue; }
      if (P && c.state !== 'leave' && c.state !== 'stop') siren = Math.max(siren, 1 - Math.hypot(me.x - c.x, me.z - c.z) / 260);
    }
    if (c.shoulder && c.type === 'racer') want = 0; // angehalten
    if (c.wreck) want = 0;
    const Z = c.type === 'rescue' || c.wreck ? null : zoneOf(cars, c), jam = !!Z;
    let lead = c.shoulder || c.wreck ? null : ahead(c, c.lat);
    if (lead && lead.o.me && c.type === 'rescue' && A && A.block > 12) lead = null; // nach der Busse drängelt er sich vorbei
    const safe = Math.max(c.type === 'rescue' ? 2 : 3, c.speed * c.gapT);
    let v = want;
    if (lead && lead.gap < safe + 25 && !(c.type === 'cop' && lead.o === c.target)) v = Math.min(v, Math.max(0, lead.o.speed + (lead.gap - safe) * 0.7));
    // Stau: Stop-and-go (die Wellen laufen nach hinten), am Kopf geht es wieder los; hinten rechtzeitig bremsen;
    // am Unfall nur im Schritttempo vorbei; bei einem Unfall schauen die Gaffer drüben
    if (c.type !== 'rescue') for (const Y of cars.zones) {
      const d = zoneDist(Y, c);
      if (Y.dir !== c.dir) { if (Y.kind === 'acc' && Math.abs(d) < 80) v = Math.min(v, 18); continue; }
      if (Y === Z) v = Math.min(v, (Y.kind === 'acc' && d < 40 ? 5 : 0.8 + 3.6 * Math.max(0, Math.sin(t * 0.5 - d * 0.035))) + (Y.kind === 'jam' && d < 60 ? (60 - d) * 0.5 : 0));
      else if (d >= Y.len && d < Y.len + 160) v = Math.min(v, 3 + Math.sqrt(2 * 6 * (d - Y.len)));
    }
    // Gesperrte Spuren (Baustelle, Unfall): wer noch rechts ist, muss hinüber und notfalls davor anhalten
    let minL = 0, blockD = Infinity;
    if (rwZone(c)) { minL = 2; blockD = c.s > RW.s0 - RW.taper && c.s < RW.s1 ? -1 : wrapS(RW.s0 - RW.taper - 6 - c.s); }
    if (A && c.dir === A.dir && !c.wreck && c.type !== 'rescue') { const d = zoneDist(A, c); if (d > -12 && d < JAM + 160) { minL = 2; blockD = Math.min(blockD, d < 3 ? -1 : d - 9); } }
    if (c.lane < minL && c.type !== 'rescue') {
      if (blockD < 0) c.lane = minL; // steckt schon drin (z.B. beim Start)
      else v = Math.min(v, Math.sqrt(2 * 6 * Math.max(0, blockD)));
      if (c.laneT > 0.3) c.laneT = 0.3;
    }
    if (cop && cop.dir === c.dir && c.laneT > 0.4) { const d = wrapDs((c.s - cop.s) * c.dir); if (d > 0 && d < 90) c.laneT = 0.4; } // Polizei hinten
    // Spurwechsel: überholen, wenn vorne einer bummelt; normale Autos gehen danach wieder nach rechts
    if (!c.own && !c.shoulder && !c.wreck && (c.laneT -= cdt) <= 0) {
      c.laneT = c.type === 'racer' ? 0.6 : 1.5;
      const back = -Math.max(7, c.speed * 0.7), fwd = Math.max(10, c.speed * 1.3); // im Stau reicht eine kleine Lücke
      const free = l => l >= minL && l < LANES.length && !ahead(c, c.dir * LANES[l], back, fwd);
      const slowLead = !jam && lead && lead.gap < 70 && lead.o.speed < c.want - 3, top = Math.max(minL, c.type === 'slow' ? 1 : LANES.length - 1);
      const copDs = cop && cop.dir === c.dir && Math.abs(cop.lat - c.lat) < 2.3 ? wrapDs((c.s - cop.s) * c.dir) : -1;
      if (c.lane < minL) { if (free(c.lane + 1)) c.lane++; } // einfädeln
      else if (jam) {} // im Stau bleibt man in der Spur
      else if (copDs > 0 && copDs < 90) { if (free(c.lane - 1)) c.lane--; else if (free(c.lane + 1)) c.lane++; } // Platz machen für die Polizei
      else if (slowLead && c.lane < top && free(c.lane + 1)) c.lane++; // links überholen
      else if (slowLead && c.type === 'racer' && free(c.lane - 1)) c.lane--; // Raser: auch rechts vorbei
      else if (!slowLead && (c.type === 'normal' || c.type === 'slow') && c.lane > 0 && free(c.lane - 1)
        && !ahead(c, c.dir * LANES[c.lane - 1], -10, 80)) c.lane--; // Rechtsfahrgebot
    }
    const lat = c.wreck ? c.lat : c.dir * (c.shoulder ? SHOULDER : c.type === 'rescue' && c.state !== 'leave' ? GASSE
      : LANES[c.lane] + (jam ? gasseOff(c) : 0));
    const quick = c.type === 'racer' || c.type === 'cop' || c.type === 'rescue';
    c.speed += Math.max(-9 * cdt, Math.min((quick ? 5 : 3) * cdt, v - c.speed));
    if (c.wreck) c.speed = 0;
    c.s = wrapS(c.s + c.dir * c.speed * cdt);
    const dl = (lat - c.lat) * Math.min(1, cdt * (quick ? 2.2 : 1.2));
    c.lat += dl;
    // Drängler: klebt hinten dran, blinkt mit dem Licht und hupt (bei dir besonders; im Stau nicht)
    c.flashT -= cdt; c.honkT -= cdt;
    if (c.type === 'tail' && !jam && lead && lead.gap < 14 && lead.o.speed < c.want - 2) {
      c.flashT = 0.25 + (Math.floor(t * 4) % 2) * 0.2;
      if (lead.o.me && c.honkT <= 0) { hooks.honk(c); c.honkT = 3 + Math.random() * 2; hooks.msg('😠 Ein Drängler klebt an dir!'); }
    }
    const p = at(c.s, c.lat);
    c.x = p.x; c.z = p.z;
    if (c.type === 'racer' && P && c.dir === P.dir && c.speed > P.speed + 15 && Math.abs(me.x - c.x) < 9 && Math.abs(me.z - c.z) < 9) hooks.msg('💨 Achtung, ein Raser!');
    // Retter hinter dir: stehst du in der Gasse? (kurz geht, zu lange gibt eine Busse); sind sie vorbei, gibt es ein Lob
    if (c.type === 'rescue' && c.state === 'go' && P && P.dir === c.dir && A) {
      const ds = wrapDs((P.s - c.s) * c.dir);
      if (ds > 0 && ds < 45 && Math.abs(P.lat - c.dir * GASSE) < 2.3) {
        A.block += cdt;
        if (A.block > 1 && A.warnT <= 0) { A.warnT = 3; hooks.msg('🚑 Mach Platz! Fahr zur Seite – Rettungsgasse!', true); }
        if (A.block > 8 && !A.fined) { A.fined = true; hooks.gasse('block'); }
      }
      if (ds < -3 && !c.passed) { c.passed = true; if (!A.fined && !A.praised && zoneDist(A, P) > 0 && zoneDist(A, P) < JAM + 50) { A.praised = true; hooks.gasse('ok'); } }
    }
    const dx = c.x - cam.x, dz = c.z - cam.z, d2 = dx * dx + dz * dz;
    if (P && Math.abs(me.x - c.x) < 12 && Math.abs(me.z - c.z) < 12) {
      // du wirst angefahren oder fährst auf
      if (Math.hypot(me.x - c.x, me.z - c.z) < (me.radius + c.radius) * 0.75) { hooks.bump(c); if (!c.wreck) c.speed *= 0.5; c.nmBad = 3; }
    }
    // knapp überholt (auf der Nebenspur, du deutlich schneller): Bonus
    if (c.nmBad > 0) c.nmBad -= cdt;
    if (P && c.dir === P.dir && d2 < 2500) {
      const ds = wrapDs((c.s - P.s) * c.dir), side = Math.abs(c.lat - P.lat);
      if (c.nmDs > 0 && ds <= 0 && side > 1.4 && side < 4.4 && P.speed > 24 && P.speed > c.speed + 5 && !(c.nmBad > 0) && !c.own) hooks.nearMiss(c, side);
      c.nmDs = ds;
    } else c.nmDs = undefined;
    // Zusatzautos aus einem Stau verschwinden, sobald sie draussen sind und niemand hinschaut
    if (c.extra && !jam && d2 > (see + 60) ** 2 && !c.wreck && c !== (cars.cop && cars.cop.target)) { c.dead = true; dead++; continue; } // ein Auto aus dem Vorrat gibt die Zeichnung unten zurück
    // zeichnen (nach der Schleife): merken, wie weit weg und wie gedreht
    if (d2 < see2) { c.yaw = -(Math.atan2(p.tz, p.tx) + (c.dir < 0 ? Math.PI : 0)) - dl * c.dir * 3 + (c.wreck ? c.wreck.yaw : 0); c.d2 = d2; c.cdt = cdt; vis.push(c); }
    else if (c.own) c.mesh.visible = false;
  }
  // Die nächsten Autos jeder Art bekommen ein echtes 3D-Auto aus dem Vorrat, alle anderen einen Klotz
  vis.sort((a, b) => a.d2 - b.d2);
  const left = { ...POOL }, chosen = new Set();
  for (const c of vis) if (!c.own && c.d2 < near2 && left[c.type] > 0) { left[c.type]--; chosen.add(c); }
  for (const c of cars.meshed) if (c.mesh && !chosen.has(c)) { c.mesh.visible = false; cars.pool[c.type].push(c.mesh); c.mesh = null; }
  cars.meshed.length = 0;
  for (const c of chosen) { if (!c.mesh) c.mesh = cars.pool[c.type].pop(); cars.meshed.push(c); }
  for (const c of vis) {
    const m = c.mesh, yaw = c.yaw;
    if (m) {
      m.visible = true;
      m.position.set(c.x, 0, c.z);
      m.rotation.y = yaw;
      for (const w of m.userData.wheels) w.rotation.z -= c.speed * c.cdt / 0.35;
      if (m.userData.flash) m.userData.flash.visible = c.flashT > 0 && Math.floor(t * 8) % 2 === 0;
      animateCar(m, t, null);
    } else if (nFar < MAXI) { // Klotz
      const truck = c.type === 'slow', co = Math.cos(yaw), si = Math.sin(yaw);
      dummy.rotation.set(0, yaw, 0);
      dummy.position.set(c.x - (truck ? co * 0.9 : 0), 0.3, c.z + (truck ? si * 0.9 : 0));
      dummy.scale.set(truck ? c.len * 0.75 : c.len, truck ? 2.6 : 0.8, truck ? 2.3 : 1.85);
      dummy.updateMatrix(); body.setMatrixAt(nFar, dummy.matrix); body.setColorAt(nFar, tmpCol.setHex(c.col));
      const off = truck ? c.len * 0.38 : -c.len * 0.06;
      dummy.position.set(c.x + co * off, truck ? 0.3 : 1.1, c.z - si * off);
      dummy.scale.set(truck ? c.len * 0.2 : c.len * 0.5, truck ? 2.2 : 0.62, truck ? 2.2 : 1.6);
      dummy.updateMatrix(); cab.setMatrixAt(nFar, dummy.matrix);
      nFar++;
    }
  }
  body.count = cab.count = nFar;
  body.instanceMatrix.needsUpdate = cab.instanceMatrix.needsUpdate = true;
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  if (dead) { let j = 0; for (const c of cars) if (!c.dead) cars[j++] = c; cars.length = j; cars.extras -= dead; }
  hooks.siren(siren);
}

// ---------- Hafen und Flughafen ----------
// Neue Gebiete hinter einer Schranke: sie öffnet sich erst mit genug goldenen Schlüsseln (need). Je eine Strasse
// führt von der Stadt hin (road), das Gebiet selbst ist eben (rect). Der Hafen liegt im Westen am Wasser, der
// Flughafen im Osten mit Piste, Terminal, Tower und Flugzeugen (eines startet immer wieder).
export const AREAS = {
  harbor: { need: 5, name: '⚓ Hafen', rect: { x0: -700, x1: -340, z0: -150, z1: 110 }, road: { x0: -350, x1: -256, z0: -7, z1: 7 }, gate: { x: -334, z: 0 } },
  airport: { need: 12, name: '✈️ Flughafen', rect: { x0: 340, x1: 1000, z0: -260, z1: 60 }, road: { x0: 256, x1: 350, z0: -7, z1: 7 }, gate: { x: 334, z: 0 } },
};
const WATER = { x0: -1100, x1: -702, z0: -700, z1: 380, y: -4 }; // Hafenbecken (der Boden liegt tiefer), nicht bis zur Autobahn
const RUNWAY = { x0: 400, x1: 980, z: -150, w: 50 };
const inBox = (x, z, b, m = 0) => x > b.x0 + m && x < b.x1 - m && z > b.z0 + m && z < b.z1 - m;

// Gelände: wie weit weg ist das nächste ebene Gebiet (d < 0: drin) und auf welche Höhe soll es (y)
export function groundShape(x, z) {
  let d = outskirtsDist(x, z), y = 0;
  for (const A of Object.values(AREAS)) d = Math.min(d, boxDist(x, z, A.rect) - 4, boxDist(x, z, A.road) - 4);
  const dw = boxDist(x, z, WATER);
  if (dw < d) { d = dw; y = WATER.y; }
  return { d, y };
}
export function areaDrivable(x, z, r, keys) {
  for (const A of Object.values(AREAS)) {
    if (keys < A.need) continue;
    if (inBox(x, z, A.rect, r * 0.6) || inBox(x, z, A.road, r * 0.6 - 1)) return true;
  }
  return false;
}
export const inArea = (x, z) => Object.values(AREAS).some(A => inBox(x, z, A.rect) || inBox(x, z, A.road));
export function lockedGate(x, z, keys) { // Schranke in der Nähe, die noch zu ist?
  return [...Object.values(AREAS), PASS_AREA].find(A => keys < A.need && Math.hypot(x - A.gate.x, z - A.gate.z) < 30) || null;
}

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
function boxAt(group, solids, w, h, d, mat, x, y, z, solid = true) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true;
  group.add(b);
  if (solid) solids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: y + h / 2 });
  return b;
}
function flat(group, mat, b, y = 0.03) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0).rotateX(-Math.PI / 2), mat);
  m.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); m.receiveShadow = true;
  group.add(m);
  return m;
}
// Schranke: Pfosten und rot-weisser Arm (offen = hochgeklappt)
function gate(scene, A, sign) {
  const g = new THREE.Group(), stripes = document.createElement('canvas');
  stripes.width = 128; stripes.height = 8;
  const sg = stripes.getContext('2d');
  for (let k = 0; k < 8; k++) { sg.fillStyle = k % 2 ? '#ffffff' : '#dc2626'; sg.fillRect(k * 16, 0, 16, 8); }
  const tex = new THREE.CanvasTexture(stripes); tex.colorSpace = THREE.SRGBColorSpace;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), M(0x374151)); post.position.set(0, 0.7, -8);
  const arm = new THREE.Group(); arm.position.set(0, 1.25, -8);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 16), new THREE.MeshStandardMaterial({ map: tex })); bar.position.z = 8;
  arm.add(bar);
  g.add(post, arm);
  g.position.set(A.gate.x, 0, A.gate.z);
  g.rotation.y = A.gate.rot || 0;
  scene.add(g);
  const s = sign('🔒 ' + A.name + ': ab ' + A.need + ' 🔑', '#1f2937', '#facc15', 9, 1.4);
  s.position.set(A.gate.x, 3.6, A.gate.z); s.rotation.y = A.gate.rot ? 0 : A.gate.x < 0 ? Math.PI / 2 : -Math.PI / 2; // lesbar von der Stadt her
  scene.add(s);
  return { A, arm, sign: s, open: 0 };
}
function plane(color = 0xffffff, stripe = 0x1d4ed8) {
  const g = new THREE.Group(), body = M(color, { metalness: 0.3, roughness: 0.4 }), blue = M(stripe), dark = M(0x111827, { metalness: 0.4 }), glass = M(0x1e293b, { metalness: 0.8, roughness: 0.1 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(2, 2, 30, 20).rotateZ(Math.PI / 2), body, 0, 3.4, 0); // Rumpf
  add(new THREE.SphereGeometry(2, 20, 14), body, 15, 3.4, 0).scale.set(2, 1, 1); // Nase
  add(new THREE.ConeGeometry(2, 7, 20).rotateZ(Math.PI / 2), body, -18.5, 3.9, 0).scale.set(1, 0.8, 1); // Heck
  add(new THREE.BoxGeometry(30, 0.35, 0.25), blue, 0, 3.4, 2.02); add(new THREE.BoxGeometry(30, 0.35, 0.25), blue, 0, 3.4, -2.02); // Streifen
  add(new THREE.BoxGeometry(1.2, 0.5, 3.2), glass, 17.6, 4.3, 0); // Cockpitfenster
  add(new THREE.BoxGeometry(6, 0.4, 32), body, 1, 2.6, 0); // Flügel
  add(new THREE.BoxGeometry(3, 0.3, 11), body, -17, 4.4, 0); // Höhenleitwerk
  add(new THREE.BoxGeometry(4, 6, 0.4), blue, -18, 7.2, 0); // Seitenleitwerk
  for (const z of [-7, 7]) add(new THREE.CylinderGeometry(1.1, 1.1, 4.5, 14).rotateZ(Math.PI / 2), dark, 2, 1.6, z); // Triebwerke
  for (const [x, z] of [[11, 0], [-1, -2.6], [-1, 2.6]]) add(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12).rotateX(Math.PI / 2), dark, x, 0.6, z); // Räder
  return g;
}

export function buildAreas({ group, scene, asphaltMat, lineMat, sign }) {
  const solids = [], out = { solids, gates: [] };
  for (const A of Object.values(AREAS)) { flat(group, asphaltMat, A.road); out.gates.push(gate(scene, A, sign)); }
  out.gates.push(gate(scene, PASS_AREA, sign));
  // Hafen: Kai, Wasser, Containerstapel, zwei Kräne, Lagerhallen, ein Schiff
  const H = AREAS.harbor.rect;
  flat(group, asphaltMat, H);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER.x1 - WATER.x0, WATER.z1 - WATER.z0).rotateX(-Math.PI / 2),
    M(0x1e5a8a, { metalness: 0.4, roughness: 0.12, transparent: true, opacity: 0.88 }));
  water.position.set((WATER.x0 + WATER.x1) / 2, -1.2, 0); scene.add(water);
  boxAt(group, solids, 2, 1.4, H.z1 - H.z0, M(0x4b5563), H.x0 + 1, 0.7, (H.z0 + H.z1) / 2, false); // Kaimauer
  for (let z = H.z0 + 6; z < H.z1; z += 12) boxAt(group, solids, 0.6, 0.7, 0.6, M(0x111827), H.x0 + 3, 0.35, z); // Poller
  const boxCols = [0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b, 0x9ca3af, 0x7c3aed, 0xea580c];
  let k = 0;
  for (let x = -640; x <= -440; x += 40) for (let z = -120; z <= -30; z += 30) {
    const hgt = 1 + (k * 7 % 3), w = 12.2, d = 2.6;
    for (let lv = 0; lv < hgt; lv++) for (const dz of [-1.4, 1.4]) boxAt(group, solids, w, 2.6, d, M(boxCols[(k + lv * 3 + (dz > 0 ? 1 : 0)) % boxCols.length], { roughness: 0.6 }), x, 1.3 + lv * 2.6, z + dz, lv === 0);
    k++;
  }
  for (const cz of [-70, 40]) { // Containerkran am Kai
    const yel = M(0xfacc15, { metalness: 0.4 });
    for (const [dx, dz] of [[-6, -9], [-6, 9], [14, -9], [14, 9]]) boxAt(group, solids, 1, 24, 1, yel, H.x0 + 10 + dx, 12, cz + dz);
    boxAt(group, solids, 50, 2, 3, yel, H.x0 - 2, 25, cz, false); // Ausleger übers Wasser
    boxAt(group, solids, 4, 3, 4, M(0x1f2937), H.x0 + 4, 22.5, cz, false); // Laufkatze
  }
  for (const [x, z] of [[-430, 75], [-560, 75]]) { // Lagerhallen
    boxAt(group, solids, 60, 12, 30, M(0x94a3b8), x, 6, z);
    boxAt(group, solids, 61, 1, 31, M(0x475569), x, 12.5, z, false);
  }
  const ship = new THREE.Group(); // Frachtschiff am Kai
  const hull = new THREE.Mesh(new THREE.BoxGeometry(110, 10, 20), M(0x7f1d1d)); hull.position.y = 2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(110, 1, 20), M(0x111827)); deck.position.y = 7.4;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 18), M(0xf8fafc)); bridge.position.set(-44, 13.5, 0);
  ship.add(hull, deck, bridge);
  for (let x = -30; x <= 40; x += 13) for (const z of [-5, 0, 5]) { const c = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 2.5), M(boxCols[(x + z + 100) % boxCols.length])); c.position.set(x, 9.2, z * 1.1); ship.add(c); }
  ship.position.set(H.x0 - 14, 0, -10); scene.add(ship);
  for (const side of [0, 1]) {
    const s1 = sign('⚓ HAFEN', '#0e7490', '#ffffff', 8, 1.6); s1.position.set(H.x1 - 2 - side * 0.05, 5, 22); s1.rotation.y = Math.PI / 2 + side * Math.PI; group.add(s1);
  }
  // Flughafen: Piste mit Markierungen, Rollweg, Vorfeld, Terminal, Tower, zwei Flugzeuge am Gate, eines startet
  const F = AREAS.airport.rect;
  flat(group, M(0x5f9a45, { roughness: 1 }), F, 0.01);
  flat(group, asphaltMat, { x0: RUNWAY.x0, x1: RUNWAY.x1, z0: RUNWAY.z - RUNWAY.w / 2, z1: RUNWAY.z + RUNWAY.w / 2 }, 0.04);
  flat(group, asphaltMat, { x0: 350, x1: 640, z0: -70, z1: 25 }, 0.035); // Vorfeld
  flat(group, asphaltMat, { x0: 480, x1: 510, z0: RUNWAY.z + 20, z1: -65 }, 0.035); // Rollweg
  for (let x = RUNWAY.x0 + 40; x < RUNWAY.x1 - 40; x += 30) flat(group, lineMat, { x0: x, x1: x + 15, z0: RUNWAY.z - 0.5, z1: RUNWAY.z + 0.5 }, 0.06);
  for (const x0 of [RUNWAY.x0 + 4, RUNWAY.x1 - 24]) for (let z = -20; z <= 20; z += 5) flat(group, lineMat, { x0, x1: x0 + 20, z0: RUNWAY.z + z - 1, z1: RUNWAY.z + z + 1 }, 0.06);
  boxAt(group, solids, 150, 14, 26, M(0x93c5fd, { metalness: 0.4, roughness: 0.1 }), 480, 7, 45); // Terminal (Glas)
  boxAt(group, solids, 152, 1, 28, M(0xf1f5f9), 480, 14.5, 45, false);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 34, 16), M(0xe5e7eb)); tower.position.set(600, 17, 40); group.add(tower);
  solids.push({ x0: 597, x1: 603, z0: 37, z1: 43, h: 40 });
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(6, 4.5, 6, 16), M(0x1e293b, { metalness: 0.7, roughness: 0.1 })); cab.position.set(600, 37, 40); group.add(cab);
  for (const side of [0, 1]) {
    const s1 = sign('✈️ FLUGHAFEN', '#1d4ed8', '#ffffff', 16, 2.4); s1.position.set(480, 17, 31.9 - side * 0.05); s1.rotation.y = side * Math.PI; group.add(s1);
  }
  for (const [x, col] of [[420, 0x1d4ed8], [540, 0xdc2626]]) {
    const p = plane(0xffffff, col); p.rotation.y = Math.PI / 2; p.position.set(x, 0, -30); scene.add(p);
    solids.push({ x0: x - 2.5, x1: x + 2.5, z0: -48, z1: -10, h: 6 }); // nur der Rumpf ist fest (unter den Flügeln kann man durch)
  }
  out.jet = { mesh: plane(0xf8fafc, 0x16a34a), t: -10, x: RUNWAY.x0 + 20, y: 0, v: 0 };
  scene.add(out.jet.mesh);
  return out;
}

// Schranken öffnen sich mit genug Schlüsseln; das Flugzeug startet immer wieder (Anlauf auf der Piste, dann steigen)
export function stepAreas(A, dt, keys, hooks) {
  for (const G of A.gates) {
    const want = keys >= G.A.need ? 1 : 0;
    G.open += Math.sign(want - G.open) * Math.min(Math.abs(want - G.open), dt * 0.8);
    G.arm.rotation.x = -G.open * 1.4;
    G.sign.visible = !want;
  }
  const J = A.jet;
  J.t += dt;
  if (J.t < 0) { J.mesh.visible = false; return; }
  J.mesh.visible = true;
  if (J.t < dt * 1.5) { J.x = RUNWAY.x0 + 20; J.y = 0; J.v = 0; hooks.start(J); }
  J.v = Math.min(80, J.v + dt * 6);
  J.x += J.v * dt;
  if (J.x > RUNWAY.x0 + 330) J.y += J.v * dt * 0.22; // abheben
  J.mesh.position.set(J.x, J.y, RUNWAY.z);
  J.mesh.rotation.z = J.y > 0 ? 0.18 : 0;
  if (J.y > 260) J.t = -40 - Math.random() * 30; // weg – das nächste kommt später
  hooks.danger(J.x, J.y, RUNWAY.z, J.v);
}

// ---------- Passstrasse ----------
// Im Norden führt eine Bergstrasse mit Haarnadelkurven auf einen Gipfel (ab 20 Schlüsseln). Die Strasse hat eine Höhe
// (passGround); das Gelände wird um sie herum geformt (passTerrain): flach unter der Fahrbahn, dazwischen Hänge,
// am Rand geht es ins normale Gelände über. Ein eigenes, feineres Geländestück liegt über dem groben.
export const PASS_AREA = { need: 20, name: '⛰️ Passstrasse', gate: { x: 0, z: -334, rot: Math.PI / 2 } };
const PASS_CTRL = [[0, -262], [0, -340], [0, -400], [-120, -430], [-200, -450], [-232, -472], [-210, -500], [-100, -525], [100, -560],
  [200, -580], [232, -602], [210, -630], [100, -655], [-100, -690], [-200, -710], [-232, -732], [-210, -760], [-100, -785], [60, -815],
  [150, -840], [170, -870], [120, -900], [40, -915]];
const PASS_TOP = 110, PASS_FLAT = 140, PASS_W = 4.6; // Gipfelhöhe, ebene Anfahrt, halbe Fahrbahnbreite
export const SUMMIT = { x: 25, z: -925, r: 28 };
const REGION = { x0: -420, x1: 420, z0: -1120, z1: -290 };
let PASS = null;
function passPath() {
  if (PASS) return PASS;
  const pts = [], P = PASS_CTRL, n = P.length;
  for (let i = 0; i < n - 1; i++) { // Catmull-Rom durch die Punkte, etwa alle 2 m
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  pts.push({ x: P[n - 1][0], z: P[n - 1][1] });
  let s = 0;
  pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = s; });
  for (const p of pts) { const t = Math.min(1, Math.max(0, (p.s - PASS_FLAT) / (s - PASS_FLAT - 20))); p.y = PASS_TOP * t * t * (3 - 2 * t); }
  const grid = new Map(), cell = 16, key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  pts.forEach((p, i) => { const k = key(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  PASS = { pts, len: s, grid, cell, key, coarse: pts.filter((p, i) => i % 8 === 0) };
  return PASS;
}
// Nächster Punkt der Strasse (d: Abstand, y: Höhe dort); weiter als ~24 m weg: nur ungefähr
export function passNearest(x, z) {
  const P = passPath();
  let best = null, bd = Infinity;
  const cx = Math.floor(x / P.cell), cz = Math.floor(z / P.cell);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of P.grid.get((cx + a) + ',' + (cz + b)) || []) {
    const p = P.pts[i], d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) for (const p of P.coarse) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  return { d: bd, y: best.y, p: best };
}
const inRegion = (x, z) => x > REGION.x0 && x < REGION.x1 && z > REGION.z0 && z < REGION.z1;
export const inPassRegion = inRegion;
export const passPoints = () => passPath().pts;
// Höhe des Bodens am Berg (für die Fahrzeuge): auf der Strasse und dem Gipfelplatz, sonst 0
export function passGround(x, z) {
  if (!inRegion(x, z)) return 0;
  if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r + 4) return PASS_TOP;
  const q = passNearest(x, z);
  return q.d < 9 ? q.y : 0;
}
export function passDrivable(x, z, r, keys) {
  if (keys < PASS_AREA.need || !inRegion(x, z)) return false;
  return passNearest(x, z).d < PASS_W - r * 0.5 || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r - r;
}
export const onPass = (x, z) => inRegion(x, z) && (passNearest(x, z).d < 9 || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r);
// Gelände am Berg: natural = normales Gelände (von city.js), lower = so viel tiefer (für das grobe Gelände darunter)
export function passTerrain(x, z, natural, lower = 0) {
  const P = passPath(), q = passNearest(x, z);
  let wsum = 0, ysum = 0;
  for (const p of P.coarse) { const w = 1 / (60 + (p.x - x) ** 2 + (p.z - z) ** 2); wsum += w; ysum += w * p.y; }
  const ds = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
  let base = ysum / wsum + 30 * Math.exp(-((ds / 160) ** 2)) + 6 * Math.sin(x / 37) * Math.cos(z / 41); // Berg mit Buckeln
  base = Math.max(base, (Math.abs(x) - 250) * 0.6 + 40 * smooth01((-z - 380) / 400)); // seitlich steigt es an
  const shelf = ds < SUMMIT.r + 6 ? PASS_TOP - 0.3 : q.y - 0.35, t = Math.min(smooth01((q.d - 7) / 20), smooth01((ds - SUMMIT.r - 6) / 20));
  const h = shelf * (1 - t) + base * t;
  const edge = Math.min(x - REGION.x0, REGION.x1 - x, z - REGION.z0, REGION.z1 - z), wr = smooth01(edge / 70);
  return natural * (1 - wr) + h * wr - lower * smooth01(edge / 30);
}
const smooth01 = v => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };

export function buildPass({ scene, group, asphaltMat, lineMat, sign, natural, terrainMesh }) {
  const P = passPath();
  // feines Geländestück über dem groben (Fels an steilen Stellen, oben Schnee)
  const rock = new THREE.Color(0x857b70), gA = new THREE.Color(0x5e9142), gB = new THREE.Color(0x4a7c35), snow = new THREE.Color(0xf1f5f9);
  const land = terrainMesh({ size: 840, segments: 140, center: [0, -705], height: (x, z) => passTerrain(x, z, natural(x, z)),
    color: (x, z, y, steep, c) => { c.lerpColors(gA, gB, 0.5 + 0.5 * Math.sin(x / 23 + z / 31)); c.lerp(rock, smooth01((steep - 0.2) / 0.25)); c.lerp(snow, smooth01((y - 48) / 25) * 0.95); } }); // Skigebiet: oben alles weiss
  scene.add(land);
  // Fahrbahn, Linien, Leitplanken
  const rows = (off0, off1, dy0, dy1) => P.pts.map((p, i) => {
    const q = P.pts[Math.min(P.pts.length - 1, i + 1)], o = P.pts[Math.max(0, i - 1)], tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    return [[p.x + nx * off0, p.y + dy0, p.z + nz * off0, off0 / 8, p.s / 8], [p.x + nx * off1, p.y + dy1, p.z + nz * off1, off1 / 8, p.s / 8]];
  });
  const rail = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  group.add(strip(rows(-PASS_W - 0.4, PASS_W + 0.4, 0.06, 0.06), asphaltMat));
  for (const o of [-PASS_W + 0.3, PASS_W - 0.3]) group.add(strip(rows(o - 0.1, o + 0.1, 0.09, 0.09), lineMat));
  let run = []; // Mittellinie gestrichelt
  rows(-0.1, 0.1, 0.09, 0.09).forEach((r, i) => { if (P.pts[i].s % 12 < 6) run.push(r); else { if (run.length > 1) group.add(strip(run, lineMat)); run = []; } });
  for (const o of [-PASS_W - 0.6, PASS_W + 0.6]) {
    const rr = rows(o, o, 0.45, 0.8).filter((r, i) => P.pts[i].s > PASS_FLAT - 40);
    group.add(strip(rr, rail));
  }
  // Gipfelplatz mit Aussicht: Platz, Fahne, Bank, Kiosk, Schild
  const plat = new THREE.Mesh(new THREE.CircleGeometry(SUMMIT.r, 40).rotateX(-Math.PI / 2), asphaltMat);
  plat.position.set(SUMMIT.x, PASS_TOP + 0.05, SUMMIT.z); plat.receiveShadow = true; group.add(plat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), rail); pole.position.set(SUMMIT.x + 12, PASS_TOP + 4.5, SUMMIT.z - 14); group.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: 0xd52b1e, side: THREE.DoubleSide }));
  flag.position.set(SUMMIT.x + 13.5, PASS_TOP + 8, SUMMIT.z - 14); scene.add(flag);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff })); cross.position.set(SUMMIT.x + 13.5, PASS_TOP + 8, SUMMIT.z - 13.99);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.2, 0.4), cross.material); cross2.position.copy(cross.position); scene.add(cross, cross2);
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 4), new THREE.MeshStandardMaterial({ color: 0x92400e })); kiosk.position.set(SUMMIT.x - 14, PASS_TOP + 1.75, SUMMIT.z - 10); group.add(kiosk);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0x7f1d1d })); roof.position.set(SUMMIT.x - 14, PASS_TOP + 3.7, SUMMIT.z - 10); group.add(roof);
  for (const side of [0, 1]) {
    const s1 = sign('🏔️ GIPFEL · 1240 m', '#f8fafc', '#111827', 9, 1.6); s1.position.set(SUMMIT.x, PASS_TOP + 3, SUMMIT.z - SUMMIT.r + 2 - side * 0.05); s1.rotation.y = side * Math.PI; group.add(s1);
    const s2 = sign('⛰️ PASSSTRASSE', '#166534', '#ffffff', 8, 1.5); s2.position.set(9, 3.2, -300 - side * 0.05); s2.rotation.y = side * Math.PI; group.add(s2);
  }
  return { flag, land };
}

// An einer Leitplanke entlangrutschen statt hängen zu bleiben: die nächste erlaubte Stelle auf der Fahrbahn
// (Passstrasse, Autobahn, Zufahrt) – oder null, wenn man gar nicht auf einer dieser Strassen ist
export function slideInside(x, z, r, keys) {
  if (keys >= PASS_AREA.need && inRegion(x, z) && Math.hypot(x - SUMMIT.x, z - SUMMIT.z) > SUMMIT.r - r) {
    const q = passNearest(x, z), max = PASS_W - r * 0.5 - 0.05;
    if (q.d < max + 4) { const k = max / (q.d || 1); return { x: q.p.x + (x - q.p.x) * k, z: q.p.z + (z - q.p.z) * k }; }
  }
  if (z > RAMP.z0 && z < RAMP.z1 && Math.abs(x) < RAMP.x1 + 4) return { x: Math.max(RAMP.x0 + r * 0.6 + 0.05, Math.min(RAMP.x1 - r * 0.6 - 0.05, x)), z };
  if (inRestZone(x, z)) return null; // Raststätte: einfach zurück an die letzte gute Stelle
  const p = hwProject(x, z);
  if (Math.abs(p.lat) < WIDE + 2) {
    const hi = inRW(p.s, p.lat) ? Math.min(EDGE - r * 0.8, coneLat(p.s) - r * 0.6) - 0.05 : EDGE - r * 0.8 - 0.05; // Baustelle: an den Kegeln entlang
    const lo = MEDIAN + r * 0.6 + 0.05, lat = (p.lat >= 0 ? 1 : -1) * Math.min(hi, Math.max(lo, Math.abs(p.lat)));
    const q = at(p.s, lat);
    return { x: q.x, z: q.z };
  }
  return null;
}

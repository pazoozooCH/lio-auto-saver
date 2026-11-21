// Diamantinsel (für city.js): kleine Insel wie Monaco im Westen vor der Bucht. Hügel mit Palast, Villen mit Pool und
// Palmen, Ringstrasse mit teuren Autos (eigener kleiner Verkehr), Strasse in Kehren zum Palast, Jachthafen mit Fähr- und
// Bootssteg, flache Landzunge mit Piste fürs Flugzeug. Die Fähre pendelt zwischen Frachthafen (A) und Jachthafen (B).
import * as THREE from 'three';
import { hasModel } from './cars3d.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MONACO, MON_HARBOR, MON_STRIP, MON_PIER, MON_BOAT, monacoDist, monRadius, SEA_Y, inBox } from './island.js';

const M = MONACO, W = 9;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const boxD = (x, z, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
const STRIP_PAD = { x0: MON_STRIP.x0 - 20, x1: MON_STRIP.x1 + 20, z0: MON_STRIP.z0 - 25, z1: MON_STRIP.z1 + 20 };
export { MON_BOAT, MON_PIER };
export const MON_NAME = '💎 Diamantinsel';
export const inMonaco = (x, z) => Math.hypot(x - M.x, z - M.z) < 560;
export const nearMonPier = (x, z) => Math.hypot(x - MON_BOAT.x, z - MON_BOAT.z) < 16;

// Boden: Hügel in der Mitte (oben der Palast), Kai und Piste flach, an der Küste hinunter ins Meer
function landH(x, z) {
  const dc = Math.hypot(x - M.x, z - M.z), h = 0.3 + 28 * ss(250, 30, dc);
  return 0.3 + (h - 0.3) * ss(0, 40, Math.min(boxD(x, z, MON_HARBOR), boxD(x, z, STRIP_PAD)));
}
export function monGround(x, z) {
  if (inBox(x, z, MON_HARBOR) || inBox(x, z, STRIP_PAD) || inBox(x, z, MON_PIER)) return 0.3; // Kai, Piste, Steg: gerade Kante
  const d = monacoDist(x, z), h = landH(x, z);
  if (d > 22) return h;
  const bed = -9 - 22 * ss(-60, -260, d);
  return bed + (h - bed) * ss(-45, 22, d);
}

// ---------- Strassen ----------
// Ringstrasse rund um die Insel (am Hafen dem Kai entlang), Kehrenstrasse hinauf zum Palast, Zufahrt zur Piste
const ring = [];
for (let k = 0; k < 96; k++) {
  const a = k / 96 * Math.PI * 2; let x = Math.cos(a) * (monRadius(a) - 70), z = Math.sin(a) * (monRadius(a) - 70);
  if (x > 245 && Math.abs(z) < 100) x = 250; // am Hafen: dem Kai entlang
  ring.push([M.x + x, M.z + z]);
}
ring.push(ring[0]);
const spiral = [];
for (let k = 0; k <= 140; k++) { const t = k / 140, a = -t * Math.PI * 2.2, r = 250 - 215 * t; spiral.push([M.x + Math.cos(a) * r, M.z + Math.sin(a) * r]); }
const stripRoad = [[M.x - 10, M.z + 200], [M.x - 10, M.z + 250]];
export const MON_ROADS = [{ line: ring, loop: true }, { line: spiral }, { line: stripRoad }];
for (const R of MON_ROADS) { // Länge je Punkt (für den Verkehr)
  R.cum = [0]; for (let k = 1; k < R.line.length; k++) R.cum.push(R.cum[k - 1] + Math.hypot(R.line[k][0] - R.line[k - 1][0], R.line[k][1] - R.line[k - 1][1]));
  R.len = R.cum[R.cum.length - 1];
}
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
const roadDist = (x, z) => { let d = Infinity; for (const R of MON_ROADS) for (let k = 0; k < R.line.length - 1; k++) d = Math.min(d, segDist(x, z, R.line[k], R.line[k + 1])); return d; };
// Asphalt: Strassen, Kai, Piste
export function monRoad(x, z) {
  if (!inMonaco(x, z)) return false;
  return inBox(x, z, MON_HARBOR) || inBox(x, z, MON_STRIP, 2) || roadDist(x, z) < W / 2 + 0.3;
}
// Punkt auf der Ringstrasse (s in Metern), rechte Spur
export function ringAt(s, lane = 2.3) {
  const R = MON_ROADS[0]; s = ((s % R.len) + R.len) % R.len;
  let k = 1; while (k < R.cum.length - 1 && R.cum[k] < s) k++;
  const a = R.line[k - 1], b = R.line[k], f = (s - R.cum[k - 1]) / ((R.cum[k] - R.cum[k - 1]) || 1), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  const h = Math.atan2(dz, dx);
  return { x: a[0] + dx * f - dz / l * lane, z: a[1] + dz * f + dx / l * lane, h };
}

// ---------- Fähre ----------
// Dock A am Frachthafen (Kai bei x = −700), Dock B im Jachthafen. Die Fähre liegt längs zum Kai; Autos fahren von der Seite drauf.
export const FERRY_Y = 0.3;
export const FERRY = { A: { x: -710, z: 80 }, B: { x: M.x + 300, z: M.z }, dockH: Math.PI / 2, halfL: 28, halfW: 8 };
const fpts = (() => {
  const P = [[FERRY.A.x, FERRY.A.z], [-790, 80], [-1150, 30], [-1500, -90], [-1720, -170], [M.x + 380, M.z], [FERRY.B.x, FERRY.B.z]], out = [];
  for (let k = 0; k < P.length - 1; k++) {
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)], n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6);
    for (let i = 0; i < n; i++) { const t = i / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3); out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); }
  }
  out.push(P[P.length - 1]);
  return out;
})();
const fcum = [0]; for (let k = 1; k < fpts.length; k++) fcum.push(fcum[k - 1] + Math.hypot(fpts[k][0] - fpts[k - 1][0], fpts[k][1] - fpts[k - 1][1]));
export const FERRY_LEN = fcum[fcum.length - 1];
export const FERRY_PATH = fpts;
// Lage der Fähre bei s Metern (0 = Dock A); an den Docks längs zum Kai, unterwegs mit dem Bug voraus
export function ferryAt(s) {
  s = Math.max(0, Math.min(FERRY_LEN, s));
  let k = 1; while (k < fcum.length - 1 && fcum[k] < s) k++;
  const a = fpts[k - 1], b = fpts[k], f = (s - fcum[k - 1]) / ((fcum[k] - fcum[k - 1]) || 1);
  let h = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const e = Math.min(s, FERRY_LEN - s), w = ss(70, 5, e); // nah am Dock: in die Dock-Richtung drehen
  let dh = FERRY.dockH - h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  if (Math.abs(dh) > Math.PI / 2) dh += dh > 0 ? -Math.PI : Math.PI; // längs liegen, egal wohin der Bug zeigt
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, h: h + dh * w };
}
// Welt → Fähre (lx entlang, lz quer)
export function ferryLocal(F, x, z) { const dx = x - F.x, dz = z - F.z, c = Math.cos(F.h), s = Math.sin(F.h); return [dx * c + dz * s, -dx * s + dz * c]; }
export function ferryWorld(F, lx, lz) { const c = Math.cos(F.h), s = Math.sin(F.h); return [F.x + lx * c - lz * s, F.z + lx * s + lz * c]; }
export function makeFerry() {
  const g = new THREE.Group(), mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const L = FERRY.halfL * 2, Wd = FERRY.halfW * 2;
  add(new THREE.BoxGeometry(L + 4, 3.2, Wd + 1), mat(0x1d4ed8), 0, SEA_Y - 0.5, 0); // Rumpf blau
  add(new THREE.BoxGeometry(L + 4.1, 0.6, Wd + 1.1), mat(0xffffff), 0, FERRY_Y - 0.6, 0); // weisser Streifen
  add(new THREE.BoxGeometry(L, 0.12, Wd), mat(0x374151, { roughness: 0.9 }), 0, FERRY_Y - 0.05, 0); // Autodeck
  for (let x = -L / 2 + 4; x < L / 2 - 2; x += 6) add(new THREE.BoxGeometry(0.2, 0.02, Wd - 2), mat(0xfacc15), x, FERRY_Y + 0.02, 0); // Spuren
  for (const e of [-1, 1]) { // Bug und Heck: Brücke und Geländer
    add(new THREE.BoxGeometry(1, 1.1, Wd), mat(0xffffff), e * (L / 2 + 1.5), FERRY_Y + 0.5, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(3.4, 0.9, 0.5), mat(0xfacc15), e * (L / 2 - 2), FERRY_Y + 0.4, s * (Wd / 2 + 0.6)); // Klappen (Rampen)
  }
  add(new THREE.BoxGeometry(8, 5, Wd - 4), mat(0xf8fafc), L / 2 - 8, FERRY_Y + 6, 0); // Brücke über dem Deck
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.6, 3.5, 0.6), mat(0xf8fafc), L / 2 - 8, FERRY_Y + 1.75, s * (Wd / 2 - 2.5)); // Stützen
  add(new THREE.BoxGeometry(7.6, 1, Wd - 4.4), mat(0x0f172a, { metalness: 0.5, roughness: 0.15 }), L / 2 - 8, FERRY_Y + 6.5, 0); // Fenster
  add(new THREE.CylinderGeometry(0.9, 1.1, 3, 14), mat(0xdc2626), L / 2 - 12, FERRY_Y + 9.5, 0); // Kamin
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.6, 2.4, 4, 10), mat(0xf97316), L / 2 - 8, FERRY_Y + 4.2, s * (Wd / 2 - 1)).rotation.z = Math.PI / 2; // Rettungsboote
  g.userData.noWarp = true;
  return g;
}

// ---------- Palmen ----------
function palmGeos() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.28, 6, 7); trunk.translate(0, 3, 0);
  const fr = [];
  for (let k = 0; k < 8; k++) {
    const p = new THREE.PlaneGeometry(0.9, 3.4, 1, 3); p.translate(0, 1.7, 0);
    const P = p.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setZ(i, -y * y * 0.12); } // hängt nach unten
    p.rotateX(-1.15); p.rotateY(k / 8 * Math.PI * 2); p.translate(0, 6, 0);
    const N = p.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
    fr.push(p);
  }
  fr.push(new THREE.IcosahedronGeometry(0.45, 0).translate(0, 5.9, 0).toNonIndexed());
  return { trunk, crown: mergeGeometries(fr.map(g => (g.index ? g.toNonIndexed() : g)), false) };
}

// ---------- Bauen ----------
// terrainMesh(opts) = Gelände wie in city.js; trees: gibt es nicht hier (Palmen eigen); round/solid = Zusammenstösse
export function buildMonaco({ scene, group, asphaltMat, lineMat, paveMat, sign, terrainMesh, rng, round, solid }) {
  const r = rng(7171), mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  const add = (geo, m, x, y, z, ry = 0, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // Gelände (eigenes Stück, 5-m-Raster)
  const C = c => new THREE.Color(c), gA = C(0x6aa84f), gB = C(0x4f8f3a), sandC = C(0xf1e3b5), bedC = C(0x6f9f9a), deepC = C(0x0f3552), rockC = C(0xb8a58a);
  const land = terrainMesh({ size: 820, segments: 164, center: [M.x, M.z - 20], height: monGround, color: (x, z, y, steep, c) => {
    c.lerpColors(gA, gB, 0.5 + 0.5 * Math.sin(x / 23) * Math.cos(z / 31)); c.lerp(rockC, ss(0.25, 0.5, steep));
    const d = monacoDist(x, z); if (d < 30 && y < 4) c.lerp(sandC, ss(30, 10, d));
    if (y < SEA_Y) { c.lerp(bedC, ss(SEA_Y, SEA_Y - 6, y)); c.lerp(deepC, ss(SEA_Y - 8, SEA_Y - 26, y)); }
  } });
  scene.add(land);
  // Strassen: Band, das dem Boden folgt; Kai und Piste als Flächen
  const ribbon = (line, a, b, dy) => {
    const pos = [], idx = [];
    line.forEach((p, k) => {
      const q = line[Math.min(line.length - 1, k + 1)], o = line[Math.max(0, k - 1)]; let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const off of [a, b]) { const x = p[0] - dz * off, z = p[1] + dx * off; pos.push(x, monGround(x, z) + dy, z); }
      if (k) { const i = k * 2; idx.push(i - 2, i, i - 1, i - 1, i, i + 1); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const uv = []; let s = 0; line.forEach((p, k) => { if (k) s += Math.hypot(p[0] - line[k - 1][0], p[1] - line[k - 1][1]); uv.push(0, s / 8, 1, s / 8); });
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const N = g.attributes.normal; for (let k = 0; k < N.count; k++) if (N.getY(k) < 0) N.setXYZ(k, -N.getX(k), -N.getY(k), -N.getZ(k));
    const P = g.attributes.position, I = g.index.array;
    for (let k = 0; k < I.length; k += 3) { const A = I[k], B = I[k + 1], Cc = I[k + 2]; if ((P.getX(B) - P.getX(A)) * (P.getZ(Cc) - P.getZ(A)) - (P.getZ(B) - P.getZ(A)) * (P.getX(Cc) - P.getX(A)) > 0) { I[k + 1] = Cc; I[k + 2] = B; } }
    return g;
  };
  for (const R of MON_ROADS) {
    const m = new THREE.Mesh(ribbon(R.line, -W / 2, W / 2, 0.12), asphaltMat); m.receiveShadow = true; group.add(m);
    const ml = new THREE.Mesh(ribbon(R.line, -0.1, 0.1, 0.16), lineMat); group.add(ml); // Mittellinie
    for (const [a, b] of [[W / 2, W / 2 + 0.4], [-W / 2 - 0.4, -W / 2]]) group.add(new THREE.Mesh(ribbon(R.line, a, b, 0.22), mat(0xe5e7eb))); // Randsteine
  }
  const flat = (b, m, y) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0).rotateX(-Math.PI / 2), m); o.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); o.receiveShadow = true; group.add(o); };
  flat(MON_HARBOR, paveMat, 0.33); // Kai
  flat(MON_STRIP, asphaltMat, 0.34); // Piste
  for (let x = MON_STRIP.x0 + 20; x < MON_STRIP.x1 - 20; x += 24) flat({ x0: x, x1: x + 12, z0: (MON_STRIP.z0 + MON_STRIP.z1) / 2 - 0.4, z1: (MON_STRIP.z0 + MON_STRIP.z1) / 2 + 0.4 }, lineMat, 0.36);
  add(new THREE.BoxGeometry(1.2, 2.2, MON_HARBOR.z1 - MON_HARBOR.z0 - 70), mat(0x9ca3af), MON_HARBOR.x1 - 0.6, -0.8, M.z - 35 + 35); // Kaimauer
  for (let z = MON_HARBOR.z0 + 8; z < MON_HARBOR.z1; z += 12) if (Math.abs(z - FERRY.B.z) > 34) { add(new THREE.CylinderGeometry(0.3, 0.35, 0.7, 10), mat(0x111827), MON_HARBOR.x1 - 1.5, 0.65, z); round.push({ x: MON_HARBOR.x1 - 1.5, z, r: 0.4, h: 1 }); }
  // Bootssteg (Holz) und Jachten im Hafenbecken
  add(new THREE.BoxGeometry(MON_PIER.x1 - MON_PIER.x0, 0.3, MON_PIER.z1 - MON_PIER.z0), mat(0x8b5a2b), (MON_PIER.x0 + MON_PIER.x1) / 2, 0.15, (MON_PIER.z0 + MON_PIER.z1) / 2);
  for (const [x, z, s] of [[M.x + 340, M.z - 55, 1], [M.x + 365, M.z + 40, 1.3], [M.x + 330, M.z + 72, 0.8], [M.x + 400, M.z - 20, 1.6]]) {
    const y = new THREE.Group(); y.position.set(x, SEA_Y, z); y.rotation.y = r() * 0.6; y.scale.setScalar(s); group.add(y);
    add(new THREE.BoxGeometry(16, 2.2, 5), mat(0xffffff, { roughness: 0.3 }), 0, 0.6, 0, 0, y);
    add(new THREE.ConeGeometry(2.5, 5, 4, 1), mat(0xffffff, { roughness: 0.3 }), 9.5, 0.6, 0, 0, y).rotation.z = -Math.PI / 2;
    add(new THREE.BoxGeometry(7, 1.8, 3.6), mat(0xe5e7eb), -1.5, 2.6, 0, 0, y);
    add(new THREE.BoxGeometry(6.6, 0.7, 3.7), mat(0x0f172a, { metalness: 0.6, roughness: 0.1 }), -1.5, 2.9, 0, 0, y);
    add(new THREE.BoxGeometry(16.2, 0.25, 5.1), mat(0x1d4ed8), 0, -0.2, 0, 0, y);
  }
  // Palast oben auf dem Hügel: rosa, zwei runde Türme, Fahne, Brunnen davor
  const top = monGround(M.x, M.z), pink = mat(0xf9a8d4), cream = mat(0xfef3c7), roofR = mat(0xb91c1c);
  add(new THREE.CylinderGeometry(32, 32, 0.12, 40), paveMat, M.x, top + 0.06, M.z);
  add(new THREE.BoxGeometry(34, 12, 14), pink, M.x - 4, top + 6, M.z - 14);
  add(new THREE.BoxGeometry(35, 0.8, 15), cream, M.x - 4, top + 12.4, M.z - 14);
  for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(2.2, 3.4, 0.2), mat(0x1e3a5f, { metalness: 0.5, roughness: 0.2 }), M.x - 4 + k * 4.5, top + 6.5, M.z - 6.9);
  for (const dx of [-21, 13]) {
    add(new THREE.CylinderGeometry(4, 4, 18, 20), cream, M.x + dx, top + 9, M.z - 14);
    add(new THREE.ConeGeometry(4.6, 7, 20), roofR, M.x + dx, top + 21.5, M.z - 14);
    round.push({ x: M.x + dx, z: M.z - 14, r: 4.2, h: 25 });
  }
  add(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), mat(0x9ca3af), M.x + 13, top + 28, M.z - 14);
  add(new THREE.BoxGeometry(2.6, 1.6, 0.05), mat(0xdc2626), M.x + 14.3, top + 30, M.z - 14);
  solid.push({ x0: M.x - 21, x1: M.x + 13, z0: M.z - 21, z1: M.z - 7, h: top + 13 });
  add(new THREE.CylinderGeometry(4, 4.3, 0.8, 24), cream, M.x, top + 0.4, M.z + 10); add(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 24), mat(0x38bdf8, { roughness: 0.05 }), M.x, top + 0.82, M.z + 10);
  round.push({ x: M.x, z: M.z + 10, r: 4.3, h: 1 });
  const ps = sign('🏰 PALAST', '#be185d', '#ffffff', 9, 1.6); ps.position.set(M.x - 4, top + 14.2, M.z - 6.8); group.add(ps);
  // Villen an den Strassen: weiss oder pastell, zwei versetzte Stockwerke, Glas, Dachterrasse, Pool, Palmen
  const palms = [], villas = [], walls = [0xffffff, 0xfef3c7, 0xfce7f3, 0xe0f2fe, 0xecfccb].map(c => mat(c, { roughness: 0.5 }));
  const glass = mat(0x0f2742, { metalness: 0.7, roughness: 0.08 }), pool = mat(0x22d3ee, { roughness: 0.05, metalness: 0.2, emissive: 0x0e7490, emissiveIntensity: 0.25 });
  const stone = mat(0xd6d3d1), rail = mat(0xbfe3ff, { transparent: true, opacity: 0.4, roughness: 0.05 });
  const reserved = [MON_HARBOR, STRIP_PAD, { x0: M.x - 40, x1: M.x + 40, z0: M.z - 40, z1: M.z + 40 }];
  for (const R of MON_ROADS) {
    if (R === MON_ROADS[2]) continue;
    let s = 0, next = 20;
    for (let i = 1; i < R.line.length; i++) {
      const p = R.line[i], o = R.line[i - 1]; s += Math.hypot(p[0] - o[0], p[1] - o[1]);
      if (s < next) continue; next = s + 24 + r() * 8;
      const dx = p[0] - o[0], dz = p[1] - o[1], l = Math.hypot(dx, dz) || 1, tx = dx / l, tz = dz / l;
      for (const side of [1, -1]) {
        const hx = p[0] - tz * side * 17, hz = p[1] + tx * side * 17;
        if (monacoDist(hx, hz) < 16 || roadDist(hx, hz) < 13 || villas.some(v => Math.hypot(v.x - hx, v.z - hz) < 19) || reserved.some(b => boxD(hx, hz, b) < 6)) continue;
        villas.push({ x: hx, z: hz });
        villa(hx, hz, tz * side, -tx * side, tx * side, tz * side);
      }
    }
  }
  function villa(x, z, nx, nz, ax, az) { // (nx, nz) zur Strasse, (ax, az) = lokale x-Achse
    const y = monGround(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(-nx, -nz); group.add(g);
    const w = 11 + r() * 4, d = 9 + r() * 3, wm = walls[Math.floor(r() * walls.length)];
    add(new THREE.BoxGeometry(w + 6, 3, d + 8), stone, 0, -1.2, 1, 0, g); // Sockel (der Hang)
    add(new THREE.BoxGeometry(w, 3.4, d), wm, 0, 2, 0, 0, g);
    add(new THREE.BoxGeometry(w * 0.7, 3, d * 0.8), wm, -w * 0.12, 5.2, 0.5, 0, g); // zweites Stockwerk versetzt
    add(new THREE.BoxGeometry(w * 0.6, 1.8, 0.1), glass, 0, 2.1, -d / 2 - 0.05, 0, g); // Glasfront
    add(new THREE.BoxGeometry(w * 0.5, 1.6, 0.1), glass, -w * 0.12, 5.3, -d * 0.4 - 0.05, 0, g);
    add(new THREE.BoxGeometry(w * 0.3, 0.6, 0.05), rail, w * 0.3, 4.05, -d / 2 + 0.2, 0, g); // Terrasse mit Glasgeländer
    add(new THREE.BoxGeometry(w * 0.72, 0.3, d * 0.82), mat(0xf5f5f4), -w * 0.12, 6.85, 0.5, 0, g);
    add(new THREE.BoxGeometry(6, 0.2, 3.5), pool, w / 2 + 3.4, 0.35, 0.5, 0, g); // Pool neben dem Haus
    add(new THREE.BoxGeometry(6.6, 0.3, 4.1), stone, w / 2 + 3.4, 0.2, 0.5, 0, g);
    for (const k of [-1, 1]) round.push({ x: x + ax * k * w * 0.25, z: z + az * k * w * 0.25, r: Math.max(w * 0.3, d * 0.55), h: y + 7 });
    for (const [lx, lz] of [[w / 2 + 6.5, -2], [-w / 2 - 2, -d / 2 - 2]]) palms.push([x + ax * lx - nx * lz, y, z + az * lx - nz * lz, 0.8 + r() * 0.4]);
  }
  // Palmen am Kai und an der Ringstrasse
  for (let z = MON_HARBOR.z0 + 6; z < MON_HARBOR.z1; z += 18) palms.push([MON_HARBOR.x0 + 4, 0.3, z, 1]);
  for (let s = 0; s < MON_ROADS[0].len; s += 30) { const p = ringAt(s, -7.5); if (monacoDist(p.x, p.z) > 6 && !reserved.some(b => boxD(p.x, p.z, b) < 2)) palms.push([p.x, monGround(p.x, p.z), p.z, 0.8 + r() * 0.5]); }
  const G = palmGeos(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion();
  const trunkM = new THREE.InstancedMesh(G.trunk, mat(0x8b6b4a, { roughness: 1 }), palms.length), crownM = new THREE.InstancedMesh(G.crown, mat(0xffffff, { side: THREE.DoubleSide, roughness: 0.8 }), palms.length), col = new THREE.Color();
  palms.forEach(([x, y, z, s], k) => {
    q.setFromAxisAngle(up, r() * 6.28).multiply(tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (r() - 0.5) * 0.25));
    m4.compose(p3.set(x, y, z), q, sc.set(s, s, s)); trunkM.setMatrixAt(k, m4); crownM.setMatrixAt(k, m4);
    crownM.setColorAt(k, col.setHSL(0.27 + r() * 0.06, 0.6, 0.25 + r() * 0.08));
    round.push({ x, z, r: 0.45 * s, h: y + 6 * s });
  });
  trunkM.castShadow = crownM.castShadow = true; scene.add(trunkM, crownM);
  // Schilder: am Jachthafen und an der Piste
  const hs = sign('⛴️ JACHTHAFEN · FÄHRE', '#0e7490', '#ffffff', 12, 1.6); hs.position.set(MON_HARBOR.x0 + 2, 4.5, M.z - 40); hs.rotation.y = Math.PI / 2; group.add(hs);
  add(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), mat(0x9ca3af), MON_HARBOR.x0 + 2, 2, M.z - 40);
  const st = sign('✈️ DIAMANT-FLUGPLATZ', '#1d4ed8', '#ffffff', 11, 1.5); st.position.set(M.x - 10, 3.5, MON_STRIP.z0 - 12); group.add(st);
  return { villas, palms: palms.length };
}

// ---------- Teure Autos auf der Ringstrasse ----------
// Alle teuren echten Autos (selten, episch, legendär); die günstigen fahren in der Stadt (city.js, makeCar)
const LUX_TIERS = new Set(['rare', 'epic', 'legendary']);
const LUX_EXTRA = ['sports', 'muscle']; // Porsche 911 / GT3 RS, Mercedes SLS: passen auch hierher
const LUX_COL = ['#f8fafc', '#111827', '#dc2626', '#facc15', '#1d4ed8', '#16a34a', '#f472b6', '#9ca3af'];
export function makeMonacoTraffic(kinds, buildCar, scene) {
  const list = Object.keys(kinds).filter(k => hasModel(k) && !kinds[k].secret && (LUX_TIERS.has(kinds[k].tier) || LUX_EXTRA.includes(k)) && !['police', 'ambulance'].includes(k));
  const cars = [], R = MON_ROADS[0], n = 14;
  if (!list.length) return cars;
  for (let k = 0; k < n; k++) {
    const kind = list[Math.floor(Math.random() * list.length)];
    const v = { kind, color: LUX_COL[(k * 3) % LUX_COL.length], special: null, seed: Math.floor(Math.random() * 1e6) }; // Originalfarbe, keine Spezial-Lacke
    const mesh = buildCar(v, kinds); mesh.traverse(o => { o.castShadow = false; }); if (mesh.userData.driver) mesh.userData.driver.visible = true;
    scene.add(mesh);
    cars.push({ v, mesh, s: k * R.len / n, speed: 0, cruise: 11 + (k % 4) * 2.2, x: 0, z: 0, h: 0, len: mesh.userData.length || 4.5, wait: 0 });
  }
  return cars;
}
// me: { x, z, r } (dein Auto oder du zu Fuss); gibt das Auto zurück, mit dem du zusammengestossen bist
export function stepMonacoTraffic(cars, dt, me, cam, animateCar, t) {
  const R = MON_ROADS[0], L = R.len;
  let hit = null;
  const sorted = [...cars].sort((a, b) => a.s - b.s);
  sorted.forEach((c, i) => {
    const next = sorted[(i + 1) % sorted.length];
    let gap = ((next.s - c.s) % L + L) % L; if (next === c) gap = 1e9;
    let lim = c.cruise;
    if (gap < c.len + 10) lim = Math.max(0, (gap - c.len - 4) * 1.2); // Abstand halten
    const fx = Math.cos(c.h), fz = Math.sin(c.h), dx = me.x - c.x, dz = me.z - c.z, along = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
    if (along > 0 && along < 16 && lat < 2.8) lim = Math.min(lim, Math.max(0, (along - c.len / 2 - 3) * 1.2)); // du stehst im Weg
    if (c.wait > 0) { c.wait -= dt; lim = 0; }
    c.speed += Math.max(-8 * dt, Math.min(3 * dt, lim - c.speed));
    c.s = (c.s + c.speed * dt) % L;
    const p = ringAt(c.s); c.x = p.x; c.z = p.z; c.h = p.h;
    if (Math.hypot(me.x - c.x, me.z - c.z) < me.r + c.len * 0.4) { hit = c; c.wait = 1.5; }
    const seen = Math.hypot(c.x - cam.x, c.z - cam.z) < 280;
    c.mesh.visible = seen;
    if (seen) { c.mesh.position.set(c.x, monGround(c.x, c.z), c.z); c.mesh.rotation.y = -c.h; for (const w of c.mesh.userData.wheels || []) w.rotation.z -= c.speed * dt / 0.35; animateCar(c.mesh, t, null); }
  });
  return hit;
}

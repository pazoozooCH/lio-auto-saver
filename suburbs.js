// Vororte rund um die Stadt (für city.js): Ostquartier (zwischen Stadt und Raumbahnhof) und Westquartier
// (zwischen Hafen und Autobahn). Geschwungene Quartierstrassen mit Trottoir und Wendeplatz, Einfamilienhäuser mit Garten,
// Einfahrt und Hecke, im Osten Schule mit Sportplatz, Quartierladen mit Parkplatz und Spielplatz.
// Kein Verkehr: die Strassen sind frei geformt (nicht im Gitter der Stadt). Häuser sind Kreise in `round` (sie stehen schräg),
// Schule und Laden Rechtecke in `solid`. Das Gelände wird hier flach (suburbDist in height() von city.js).
import * as THREE from 'three';

const W = 9, SIDE = 2.2; // Fahrbahnbreite, Trottoir je Seite
// Rechtecke der Quartiere (für Gelände, Boden, Wald) und ihre Strassen (Kontrollpunkte, werden weich gemacht)
export const SUBURBS = [
  { name: '🏡 Ostquartier', rect: { x0: 320, x1: 770, z0: -260, z1: 110 }, roads: [
    { pts: [[263, -64], [345, -64], [420, -42], [500, -74], [580, -50], [660, -72], [735, -58]], end: true },
    { pts: [[263, -192], [335, -192], [392, -165], [398, -120], [380, -58]] },
    { pts: [[398, -120], [450, -190], [530, -212], [610, -188], [655, -128], [660, -72]] },
    { pts: [[500, -74], [508, -12], [548, 40], [618, 58], [690, 32]], end: true },
    { pts: [[580, -50], [592, 0]], end: true },
    { pts: [[610, -188], [700, -200], [740, -160]], end: true },
  ], specials: 'ost' },
  { name: '🏡 Westquartier', rect: { x0: -660, x1: -320, z0: 180, z1: 370 }, roads: [
    { pts: [[-263, 192], [-338, 192], [-410, 222], [-485, 208], [-560, 240], [-628, 232]], end: true },
    { pts: [[-410, 222], [-424, 290], [-486, 330], [-566, 304]], end: true },
    { pts: [[-485, 208], [-500, 260]], end: true },
  ], specials: 'west' },
];
// Weiche Linie durch die Kontrollpunkte (Catmull-Rom), Punkte etwa alle 3 m
function smooth(pts) {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
for (const S of SUBURBS) for (const R of S.roads) {
  R.line = smooth(R.pts);
  R.box = R.line.reduce((b, [x, z]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), z0: Math.min(b.z0, z), z1: Math.max(b.z1, z) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
}
const ALL = SUBURBS.flatMap(S => S.roads);
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
export function roadDist(x, z, R) {
  const B = R.box;
  if (x < B.x0 - 60 || x > B.x1 + 60 || z < B.z0 - 60 || z > B.z1 + 60) return Infinity;
  let d = Infinity;
  for (let k = 0; k < R.line.length - 1; k++) d = Math.min(d, segDist(x, z, R.line[k], R.line[k + 1]));
  if (R.end) { const e = R.line[R.line.length - 1]; d = Math.min(d, Math.max(0, Math.hypot(x - e[0], z - e[1]) - 6)); } // Wendeplatz
  return d;
}
const boxDist = (x, z, b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
// Abstand zum nächsten Quartier oder seiner Zufahrt (0 = drin); für flaches Gelände und keinen Wald
export function suburbDist(x, z) {
  let d = Infinity;
  for (const S of SUBURBS) d = Math.min(d, boxDist(x, z, S.rect));
  if (d > 80) return d;
  for (const R of ALL) d = Math.min(d, roadDist(x, z, R) - 8);
  return d;
}
export const inSuburb = (x, z) => SUBURBS.some(S => boxDist(x, z, S.rect) === 0);
// Fährt man auf Asphalt (Strasse, Wendeplatz, Parkplatz)?
let LOTS = [];
export function suburbRoad(x, z) {
  if (!inSuburb(x, z) && suburbDist(x, z) > 0) return false;
  if (LOTS.some(b => boxDist(x, z, b) === 0)) return true;
  return ALL.some(R => roadDist(x, z, R) < W / 2 + 0.3);
}

// Karte (Weltkarte in city.js): Strassen, Wendeplätze, Häuser; P(x, z) → [x, y] auf der Karte, k = Bildpunkte pro Meter
export const SUB_HOUSES = [], SUB_PLACES = [];
export function drawSuburbs(g, P, k) {
  g.save(); g.lineJoin = g.lineCap = 'round';
  g.fillStyle = '#e8dcc0';
  for (const h of SUB_HOUSES) { const [x, y] = P(h.x, h.z); g.fillRect(x - 4.5 * k, y - 4.5 * k, 9 * k, 9 * k); }
  g.strokeStyle = '#d4d8de'; g.lineWidth = Math.max(2, (W + 2 * SIDE) * k);
  for (const R of ALL) {
    g.beginPath(); R.line.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    if (R.end) { const e = R.line[R.line.length - 1], [a, b] = P(e[0], e[1]); g.fillStyle = '#d4d8de'; g.beginPath(); g.arc(a, b, Math.max(2, 10 * k), 0, 7); g.fill(); }
  }
  g.restore();
}

// Band entlang einer Linie (Fahrbahn oder Trottoir): von a bis b Meter links der Mitte, Höhe y; skip(x, z) lässt Stücke weg
function ribbon(line, a, b, y, skip = null) {
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let k = 0; k < line.length; k++) {
    const p = line[k], q = line[Math.min(line.length - 1, k + 1)], o = line[Math.max(0, k - 1)];
    let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx; // links
    if (k) s += Math.hypot(p[0] - line[k - 1][0], p[1] - line[k - 1][1]);
    pos.push(p[0] + nx * a, y, p[1] + nz * a, p[0] + nx * b, y, p[1] + nz * b);
    uv.push(a / 8, s / 8, b / 8, s / 8);
    if (k && !(skip && skip((p[0] + line[k - 1][0]) / 2 + nx * (a + b) / 2, (p[1] + line[k - 1][1]) / 2 + nz * (a + b) / 2))) {
      const i = k * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Normalen nach oben (je nach Richtung der Linie zeigen sie sonst nach unten)
  const N = g.attributes.normal; for (let k = 0; k < N.count; k++) N.setXYZ(k, 0, 1, 0);
  const P = g.attributes.position, I = g.index.array;
  for (let k = 0; k < I.length; k += 3) { // Dreiecke so drehen, dass sie von oben sichtbar sind
    const A = I[k], B = I[k + 1], C = I[k + 2];
    const cy = (P.getX(B) - P.getX(A)) * (P.getZ(C) - P.getZ(A)) - (P.getZ(B) - P.getZ(A)) * (P.getX(C) - P.getX(A));
    if (cy > 0) { I[k + 1] = C; I[k + 2] = B; }
  }
  return g;
}

export function buildSuburbs({ group, asphaltMat, lineMat, grassMat, paveMat, sign, wallBox, homeWalls, walls, roofTiles, roofMat, lampHead, trees, round, solid, rng, veg = null }) {
  const r = rng(2468), vr = rng(8642), mat = o => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const add = (geo, m, x, y, z, ry = 0, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const lampPole = new THREE.CylinderGeometry(0.08, 0.11, 5.5, 8), poleM = mat({ color: 0x3a3f4b, metalness: 0.6, roughness: 0.4 }), headG = new THREE.BoxGeometry(0.8, 0.16, 0.35);
  const hedgeM = mat({ color: 0x3f6f35, roughness: 1 }), fenceM = mat({ color: 0xf5f5f4 }), glassM = mat({ color: 0x1e293b, metalness: 0.6, roughness: 0.1 });
  const whiteM = mat({ color: 0xf1f5f9 }), woodM = mat({ color: 0x8b5a2b });
  const houses = [], reserved = [];
  LOTS = []; SUB_HOUSES.length = 0; SUB_PLACES.length = 0;
  const roadNear = (x, z, lim) => ALL.some(R => roadDist(x, z, R) < lim);
  let ry = 0;
  for (const S of SUBURBS) {
    // Strassen: Fahrbahn, Trottoir (nicht über andere Strassen), Wendeplatz am Ende
    S.roads.forEach((R, k) => {
      const y = 0.03 + k * 0.003;
      group.add(new THREE.Mesh(ribbon(R.line, -W / 2, W / 2, y), asphaltMat));
      for (const [a, b] of [[W / 2, W / 2 + SIDE], [-W / 2 - SIDE, -W / 2]]) {
        const m = new THREE.Mesh(ribbon(R.line, a, b, 0.12, (x, z) => ALL.some(o => o !== R && roadDist(x, z, o) < W / 2 + SIDE + 0.5) || Math.max(Math.abs(x), Math.abs(z)) < 270), paveMat);
        m.receiveShadow = true; group.add(m);
      }
      if (R.end) { const e = R.line[R.line.length - 1]; add(new THREE.CylinderGeometry(10, 10, 0.04, 32), asphaltMat, e[0], y + 0.01, e[1]); }
      // Lampen am Rand
      let s = 0;
      for (let i = 1; i < R.line.length; i++) {
        const p = R.line[i], o = R.line[i - 1]; s += Math.hypot(p[0] - o[0], p[1] - o[1]);
        if (s < 36) continue; s = 0;
        const dx = p[0] - o[0], dz = p[1] - o[1], l = Math.hypot(dx, dz) || 1, side = (i % 2 ? 1 : -1) * (W / 2 + 1.2), lx = p[0] - dz / l * side, lz = p[1] + dx / l * side;
        if (Math.max(Math.abs(lx), Math.abs(lz)) < 275 || ALL.some(q => q !== R && roadDist(lx, lz, q) < W / 2 + 1)) continue;
        add(lampPole, poleM, lx, 2.75, lz);
        add(headG, lampHead, lx + dz / l * side * 0.12, 5.5, lz - dx / l * side * 0.12, -Math.atan2(dz, dx));
      }
    });
    const st = sign(S.name.toUpperCase(), '#166534', '#ffffff', 9, 1.5), e0 = S.roads[0].pts[1]; // Ortsschild an der Zufahrt
    st.position.set(e0[0], 3.2, e0[1] + (e0[1] < 0 ? 6.5 : -6.5)); st.rotation.y = e0[0] > 0 ? -Math.PI / 2 : Math.PI / 2; group.add(st); // schaut zur Stadt
    add(lampPole, poleM, e0[0], 1.6, e0[1] + (e0[1] < 0 ? 6.5 : -6.5));
    // Besondere Häuser
    if (S.specials === 'ost') {
      const sc = { x0: 470, x1: 560, z0: -165, z1: -100 }; reserved.push(sc);
      const school = wallBox(40, 10, 14, walls[3], 8); school.position.set(500, 5.12, -152); group.add(school);
      const wing = wallBox(14, 10, 22, walls[3], 8); wing.position.set(473, 5.12, -134); group.add(wing);
      add(new THREE.BoxGeometry(40.6, 0.5, 14.6), roofMat, 500, 10.37, -152); add(new THREE.BoxGeometry(14.6, 0.5, 22.6), roofMat, 473, 10.37, -134);
      solid.push({ x0: 480, x1: 520, z0: -159, z1: -145, h: 11 }, { x0: 466, x1: 480, z0: -145, z1: -123, h: 11 });
      drive(496, 504, -210, -159); // Zufahrt zur Schule von der Ringstrasse
      SUB_PLACES.push({ x: 500, z: -150, icon: '🏫' }, { x: 520, z: -118, icon: '⚽' }, { x: 441, z: 13, icon: '🛒' }, { x: 580, z: -135, icon: '🛝' });
      const ss = sign('🏫 SCHULE', '#2563eb', '#ffffff', 9, 1.6); ss.position.set(500, 8.6, -144.9); group.add(ss);
      // Sportplatz mit Linien und zwei Toren
      const field = new THREE.Mesh(new THREE.PlaneGeometry(44, 24).rotateX(-Math.PI / 2), mat({ color: 0x3f8f3a, roughness: 1 })); field.position.set(520, 0.05, -118); field.receiveShadow = true; group.add(field);
      for (const [w, d, x, z] of [[44, 0.2, 520, -130], [44, 0.2, 520, -106], [0.2, 24, 498, -118], [0.2, 24, 542, -118], [0.2, 24, 520, -118]]) add(new THREE.BoxGeometry(w, 0.02, d), lineMat, x, 0.07, z);
      for (const gx of [499, 541]) { for (const dz of [-3, 3]) { add(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), whiteM, gx, 1.1, -118 + dz); round.push({ x: gx, z: -118 + dz, r: 0.3, h: 2.3 }); }
        add(new THREE.BoxGeometry(0.16, 0.16, 6.2), whiteM, gx, 2.2, -118); }
      // Quartierladen mit Parkplatz
      const lot = { x0: 420, x1: 462, z0: -20, z1: 4 }; LOTS.push(lot); reserved.push({ x0: 415, x1: 467, z0: -22, z1: 30 });
      const lt = new THREE.Mesh(new THREE.PlaneGeometry(42, 24).rotateX(-Math.PI / 2), asphaltMat); lt.position.set(441, 0.05, -8); lt.receiveShadow = true; group.add(lt);
      drive(436, 446, -46, -20); // Zufahrt von der Hauptstrasse
      for (let k = 0; k <= 8; k++) add(new THREE.BoxGeometry(0.15, 0.02, 5), lineMat, 423 + k * 4.5, 0.07, -1.5);
      const shop = wallBox(30, 5, 14, walls[1], 8); shop.position.set(441, 2.6, 13); group.add(shop);
      add(new THREE.BoxGeometry(30.6, 0.5, 14.6), roofMat, 441, 5.35, 13);
      add(new THREE.BoxGeometry(26, 2.6, 0.12), glassM, 441, 1.5, 5.95);
      solid.push({ x0: 426, x1: 456, z0: 6, z1: 20, h: 6 });
      const ls = sign('🛒 QUARTIERLADEN', '#f59e0b', '#111827', 10, 1.6); ls.position.set(441, 6.3, 5.8); group.add(ls);
      // Spielplatz im Ring der Strassen
      const pg = { x0: 560, x1: 600, z0: -150, z1: -120 }; reserved.push(pg); playground(580, -135);
    } else {
      const pg = { x0: -470, x1: -440, z0: 245, z1: 270 }; reserved.push(pg); playground(-455, 258);
      SUB_PLACES.push({ x: -455, z: 258, icon: '🛝' }, { x: -540, z: 268, icon: '🥐' });
      const bk = wallBox(14, 4.5, 10, walls[0], 8); bk.position.set(-540, 2.35, 268); group.add(bk); // Bäckerei
      add(new THREE.BoxGeometry(14.6, 0.5, 10.6), roofMat, -540, 4.85, 268);
      solid.push({ x0: -547, x1: -533, z0: 263, z1: 273, h: 5.5 }); reserved.push({ x0: -550, x1: -530, z0: 258, z1: 278 });
      drive(-543, -537, 238, 263); // Zufahrt
      const bs = sign('🥐 BÄCKEREI', '#b45309', '#ffffff', 7, 1.3); bs.position.set(-540, 4.1, 262.9); bs.rotation.y = Math.PI; group.add(bs);
    }
    // Einfamilienhäuser entlang der Strassen, mit Garten, Hecke und Einfahrt
    for (const R of S.roads) {
      let s = 0, next = 30 + r() * 10;
      for (let i = 1; i < R.line.length; i++) {
        const p = R.line[i], o = R.line[i - 1]; s += Math.hypot(p[0] - o[0], p[1] - o[1]);
        if (s < next) continue; next = s + 22 + r() * 8;
        const dx = p[0] - o[0], dz = p[1] - o[1], l = Math.hypot(dx, dz) || 1, tx = dx / l, tz = dz / l;
        for (const side of [1, -1]) {
          const hx = p[0] - tz * side * 15, hz = p[1] + tx * side * 15;
          const B = S.rect;
          if (hx < B.x0 + 8 || hx > B.x1 - 8 || hz < B.z0 + 8 || hz > B.z1 - 8 || Math.max(Math.abs(hx), Math.abs(hz)) < 300) continue;
          if (roadNear(hx, hz, 12.5) || houses.some(h => Math.hypot(h.x - hx, h.z - hz) < 17) || reserved.some(b => boxDist(hx, hz, b) < 8)) continue;
          houses.push({ x: hx, z: hz }); SUB_HOUSES.push({ x: hx, z: hz });
          house(hx, hz, tz * side, -tx * side, tx * side, tz * side); // (nx, nz) = zur Strasse, (ax, az) = lokale x-Achse
        }
      }
    }
  }
  function drive(x0, x1, z0, z1) { // gerade Zufahrt (Asphalt, zählt als Strasse)
    const b = { x0, x1, z0, z1 }; LOTS.push(b); reserved.push({ x0: x0 - 4, x1: x1 + 4, z0, z1 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), asphaltMat); m.position.set((x0 + x1) / 2, 0.045, (z0 + z1) / 2); m.receiveShadow = true; group.add(m);
  }
  function playground(x, z) {
    add(new THREE.BoxGeometry(14, 0.1, 10), mat({ color: 0xe8d39a, roughness: 1 }), x, 0.06, z);
    add(new THREE.BoxGeometry(3.4, 1.4, 1), mat({ color: 0xef4444 }), x - 3, 0.7, z - 2); // Rutschbahn
    for (const dx of [-1.5, 1.5]) add(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), woodM, x + 3 + dx, 1.3, z + 2); // Schaukel
    add(new THREE.BoxGeometry(3.4, 0.12, 0.12), woodM, x + 3, 2.6, z + 2);
    add(new THREE.BoxGeometry(0.6, 0.06, 0.3), mat({ color: 0x2563eb }), x + 3, 0.6, z + 2);
    round.push({ x: x - 3, z: z - 2, r: 1.6, h: 1.5 }, { x: x + 3, z: z + 2, r: 1.8, h: 2.7 });
    trees.push([x - 8, 0, z + 6, 0.8], [x + 8, 0, z - 6, 0.7]);
  }
  // Ein Haus: (nx, nz) zeigt vom Haus zur Strasse, (tx, tz) = lokale x-Achse (entlang der Strasse)
  function house(x, z, nx, nz, tx, tz) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-nx, -nz); group.add(g); // lokal −z = zur Strasse
    const modern = r() < 0.25, w = 9 + r() * 3, d = 8 + r() * 2, h = modern ? 6.2 : 3.4 + r() * 2.6;
    const body = wallBox(w, h, d, homeWalls[Math.floor(r() * homeWalls.length)], 7); body.position.set(0, h / 2, 0); g.add(body);
    let top = h;
    if (modern) { add(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), whiteM, 0, h + 0.2, 0, 0, g); add(new THREE.BoxGeometry(w * 0.6, 2.4, 0.1), glassM, 0, 1.6, -d / 2 - 0.05, 0, g); top = h + 0.4; }
    else {
      const hw = w / 2 + 0.45, rh = 1.8 + r() * 1.2;
      const shape = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, rh)]);
      const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.7, bevelEnabled: false }); rg.translate(0, 0, -(d + 0.7) / 2);
      const roof = new THREE.Mesh(rg, roofTiles[Math.floor(r() * roofTiles.length)]); roof.position.y = h; roof.castShadow = roof.receiveShadow = true; g.add(roof);
      if (r() < 0.5) add(new THREE.BoxGeometry(0.6, 1.6, 0.6), roofMat, hw * 0.4, h + rh * 0.6, (r() - 0.5) * d * 0.5, 0, g);
      top = h + rh;
    }
    const gs = r() < 0.5 ? 1 : -1; // Einfahrt links oder rechts, Garage daneben
    add(new THREE.BoxGeometry(3.2, 0.04, 6), mat({ color: 0x6b7280, roughness: 0.9 }), gs * (w / 2 + 2.4), 0.04, -d / 2 - 2.5, 0, g);
    if (r() < 0.6) { // Garage
      add(new THREE.BoxGeometry(3.6, 2.6, 6), whiteM, gs * (w / 2 + 2.4), 1.3, 1, 0, g);
      const ga = gs * (w / 2 + 2.4); round.push({ x: x + tx * ga - nx, z: z + tz * ga - nz, r: 2.7, h: 2.7 });
    }
    add(new THREE.BoxGeometry(w + 1, 0.9, 0.6), r() < 0.5 ? hedgeM : fenceM, -gs * 1.2, 0.45, -d / 2 - 3.2, 0, g); // Hecke oder Zaun vorne
    add(new THREE.BoxGeometry(1.1, 2.1, 0.1), woodM, -gs * 1.5, 1.05, -d / 2 - 0.06, 0, g); // Haustür
    // Zusammenstösse: zwei Kreise entlang der Hausbreite; Baum im Garten hinten
    for (const k of [-1, 1]) round.push({ x: x + tx * k * w * 0.25, z: z + tz * k * w * 0.25, r: Math.max(w * 0.3, d * 0.55), h: top });
    if (r() < 0.7) trees.push([x - nx * (d / 2 + 6) + tx * (r() - 0.5) * 8, 0, z - nz * (d / 2 + 6) + tz * (r() - 0.5) * 8, 0.7 + r() * 0.5]);
    if (veg) { // Garten: Gras hinten und seitlich, Büsche neben der Tür, Blumenbeet vorne
      const at = (a, b) => [x + tx * a - nx * b, z + tz * a - nz * b]; // a = entlang der Strasse, b = von der Strasse weg
      for (let k = 0; k < 22; k++) { const [px, pz] = at((vr() - 0.5) * (w + 10), d / 2 + 1.5 + vr() * 8); veg.tufts.push([px, 0, pz, 0.8 + vr() * 0.6]); }
      for (const sgn of [-1, 1]) { const [px, pz] = at(-gs * 1.5 + sgn * 1.4, -d / 2 - 0.9); veg.bushes.push([px, 0, pz, 0.55 + vr() * 0.25]); }
      for (let k = 0; k < 7; k++) { const [px, pz] = at(-gs * (w * 0.25) + (vr() - 0.5) * 3, -d / 2 - 1.8 - vr() * 0.8); veg.flowers.push([px, 0, pz, 0.8 + vr() * 0.4]); }
    }
  }
  return { houses: houses.length };
}

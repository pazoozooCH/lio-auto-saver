// Gebiete ausserhalb des Stadtgitters (für city.js). Die Autobahn: ein Oval südlich der Stadt (etwa 3,7 km) mit zwei
// Spuren je Richtung, Mittelleitplanke und Leitplanken aussen, Zufahrt vom Südrand der Stadt. Kein Tempolimit.
// Auf der Autobahn fährt jeder anders: gemütliche Lastwagen rechts, normale Autos (überholen und gehen wieder rechts),
// Drängler (kleben am Vordermann, blinken mit dem Licht, hupen) und Raser (sehr schnell, wechseln dauernd die Spur).
// Koordinaten wie in city.js: x nach Osten, z nach Süden, s = Strecke entlang des Ovals, lat = seitlich (positiv =
// rechts in Fahrtrichtung +s, also innen).
import * as THREE from 'three';
import { buildCar, animateCar } from './cars3d.js';

export const HW = { cz: 650, half: 600, R: 200 };
export const HW_LEN = 4 * HW.half + 2 * Math.PI * HW.R;
const TOP = HW.cz - HW.R; // die obere Gerade liegt bei z = 450
const RAMP = { x0: -7, x1: 7, z0: 250, z1: TOP - 6 }; // Zufahrt von der Strasse am Südrand der Stadt (z = 256)
const GAP = { s0: HW.half - 16, s1: HW.half + 16 }; // Einfahrt: dort fehlen Mittel- und Aussenleitplanke
const EDGE = 9.9, MEDIAN = 0.4; // Leitplanken: aussen und in der Mitte
const LANES = [7, 2.9]; // Spurmitte: rechte Spur, Überholspur
const inGap = s => s > GAP.s0 && s < GAP.s1;

export function hwPoint(s) {
  s = ((s % HW_LEN) + HW_LEN) % HW_LEN;
  const { half: h, R, cz } = HW, arc = Math.PI * R;
  if (s < 2 * h) return { x: -h + s, z: cz - R, tx: 1, tz: 0 };
  s -= 2 * h;
  if (s < arc) { const a = -Math.PI / 2 + s / R; return { x: h + R * Math.cos(a), z: cz + R * Math.sin(a), tx: -Math.sin(a), tz: Math.cos(a) }; }
  s -= arc;
  if (s < 2 * h) return { x: h - s, z: cz + R, tx: -1, tz: 0 };
  s -= 2 * h;
  const a = Math.PI / 2 + s / R;
  return { x: -h + R * Math.cos(a), z: cz + R * Math.sin(a), tx: -Math.sin(a), tz: Math.cos(a) };
}
export function hwProject(x, z) {
  const { half: h, R, cz } = HW, qx = Math.max(-h, Math.min(h, x)), dx = x - qx, dz = z - cz, len = Math.hypot(dx, dz) || 1e-6;
  let s;
  if (qx > -h && qx < h) s = dz < 0 ? qx + h : 2 * h + Math.PI * R + (h - qx);
  else if (qx >= h) s = 2 * h + (Math.atan2(dz, dx) + Math.PI / 2) * R;
  else { let a = Math.atan2(dz, dx); if (a < 0) a += 2 * Math.PI; s = 4 * h + Math.PI * R + (a - Math.PI / 2) * R; }
  return { s, lat: R - len };
}
const at = (s, lat) => { const p = hwPoint(s); return { x: p.x - p.tz * lat, z: p.z + p.tx * lat, tx: p.tx, tz: p.tz }; };

// Abstand zum nächsten Gebiet hier draussen (negativ = drin): für flaches Gelände und keine Bäume auf der Strasse
const boxDist = (x, z, b) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx || dz ? Math.hypot(dx, dz) : -Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
};
export function outskirtsDist(x, z) { return Math.min(Math.abs(hwProject(x, z).lat) - 11, boxDist(x, z, RAMP)); }

// Darf ein Fahrzeug (Radius r) hier draussen stehen? Leitplanken aussen und in der Mitte, Zufahrt mit Leitplanken
export function hwDrivable(x, z, r = 1) {
  const p = hwProject(x, z), gap = inGap(p.s) && p.s < 2 * HW.half;
  if (Math.abs(p.lat) <= EDGE - r * 0.8 && (Math.abs(p.lat) >= MEDIAN + r * 0.6 || gap)) return true;
  if (gap && p.lat < 0 && p.lat > -14) return true; // Einfahrt von der Zufahrt her
  return x > RAMP.x0 + r * 0.6 && x < RAMP.x1 - r * 0.6 && z > RAMP.z0 && z < RAMP.z1 + 8;
}
export const onHighway = (x, z) => Math.abs(hwProject(x, z).lat) < 11 || boxDist(x, z, RAMP) < 0;

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

export function buildHighway({ group, asphaltMat, lineMat, sign }) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.9, side: THREE.DoubleSide });
  const rail = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  const add = list => { for (const m of list) group.add(m); };
  add(ribbon(-10.6, 10.6, 0.03, 0.03, asphaltMat)); // Fahrbahn
  for (const l of [-9.3, -0.8, 0.8, 9.3]) add(ribbon(l - 0.12, l + 0.12, 0.05, 0.05, lineMat)); // Randlinien
  for (const l of [-4.95, 4.95]) add(ribbon(l - 0.1, l + 0.1, 0.05, 0.05, lineMat, s => s % 18 < 6)); // gestrichelt
  const noGap = s => !(inGap(s) && s < 2 * HW.half);
  for (const l of [-MEDIAN, MEDIAN]) add(ribbon(l, l, 0, 0.85, concrete, noGap)); // Mittelleitplanke (Beton)
  add(ribbon(-MEDIAN, MEDIAN, 0.85, 0.85, concrete, noGap));
  add(ribbon(EDGE, EDGE, 0.45, 0.8, rail)); add(ribbon(-EDGE, -EDGE, 0.45, 0.8, rail, noGap)); // Leitplanken aussen
  const posts = [];
  for (let s = 0; s < HW_LEN; s += 4) for (const l of [EDGE + 0.1, -EDGE - 0.1]) if (l > 0 || noGap(s)) posts.push(at(s, l));
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
  // Schilder: Autobahn (blau) am Anfang der Zufahrt, „Ende aller Beschränkungen“ vor der Einfahrt
  for (const side of [0, 1]) {
    const s1 = sign('🛣️ AUTOBAHN', '#1d4ed8', '#ffffff', 8, 1.6);
    s1.position.set(9.5, 4, RAMP.z0 + 22 + side * 0.05); s1.rotation.y = side * Math.PI; group.add(s1);
  }
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 4; g.stroke();
  g.save(); g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.clip();
  g.translate(64, 64); g.rotate(-Math.PI / 4);
  for (const o of [-14, -5, 4, 13]) g.fillRect(-70, o, 140, 4);
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
  end.position.set(8.4, 2.4, RAMP.z1 - 30); end.rotation.y = Math.PI; group.add(end);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), rail); pole.position.set(8.4, 1.2, RAMP.z1 - 29.95); group.add(pole);
}

// ---------- Verkehr ----------
const KINDS_OF = {
  slow: ['delivery', 'tanker', 'umzug', 'camper', 'van', 'postauto', 'parcel'],
  normal: ['car', 'kombi', 'kompakt', 'hatch', 'coupe', 'minivan', 'pickup', 'jeep', 'smart', 'taxi', 'ecar'],
  tail: ['car', 'kombi', 'coupe', 'muscle', 'jeep', 'pickup', 'offroad'],
  racer: ['sports', 'muscle', 'roadster', 'rally', 'hyper', 'nightracer', 'stockcar'],
};
const TYPES = [['slow', 0.2], ['normal', 0.45], ['tail', 0.18], ['racer', 0.17]];
const COLORS = ['#c0392b', '#2563eb', '#f4f4f4', '#22232b', '#9aa0aa', '#16a34a', '#f59e0b', '#7c3aed', '#0e7490', '#b45309'];
const pick = a => a[Math.floor(Math.random() * a.length)];

export function makeHighwayTraffic(scene, kinds, n = 28) {
  const cars = [];
  for (let k = 0; k < n; k++) {
    let r = Math.random(), type = 'normal';
    for (const [t, w] of TYPES) { if ((r -= w) < 0) { type = t; break; } }
    const kind = pick(KINDS_OF[type].filter(x => kinds[x])), v = { kind, color: kinds[kind].color || pick(COLORS), special: null };
    const mesh = buildCar(v, kinds);
    if (type === 'tail') { // Lichthupe: zwei helle Punkte vorne, nur beim Drängeln sichtbar
      const fl = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (const z of [-0.6, 0.6]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m); b.position.set(mesh.userData.length / 2, 0.7, z); fl.add(b); }
      fl.visible = false; mesh.add(fl); mesh.userData.flash = fl;
    }
    const want = { slow: 22, normal: 31, tail: 38, racer: 50 }[type] + (Math.random() - 0.5) * 6;
    const dir = k % 2 ? -1 : 1, lane = type === 'tail' || type === 'racer' ? 1 : 0;
    cars.push({ v, mesh, type, dir, lane, lat: dir * LANES[lane], s: Math.random() * HW_LEN, speed: want * 0.8, want, len: mesh.userData.length,
      radius: mesh.userData.radius, gapT: { slow: 1.8, normal: 1.4, tail: 0.35, racer: 0.8 }[type], laneT: Math.random() * 2, flashT: 0, honkT: 0, x: 0, z: 0 });
    scene.add(mesh);
  }
  return cars;
}

// Ein Schritt: me = { x, z, heading, speed, len, radius, on } (on: steht auf der Autobahn), hooks = { honk, msg, bump }
export function stepHighway(cars, dt, t, me, cam, hooks) {
  let P = null;
  if (me.on) { // du als Hindernis (auf welcher Seite, welcher Spur, wie schnell in Fahrtrichtung)
    const p = hwProject(me.x, me.z), d = p.lat >= 0 ? 1 : -1, tp = hwPoint(p.s);
    P = { s: p.s, lat: p.lat, dir: d, speed: me.speed * (Math.cos(me.heading) * tp.tx + Math.sin(me.heading) * tp.tz) * d, len: me.len, me: true };
  }
  const ahead = (c, lat, from = 0, range = 140) => { // nächstes Fahrzeug vor c auf der Spur lat (from < 0: auch knapp dahinter)
    let best = null, bd = Infinity;
    for (const o of P ? [...cars, P] : cars) {
      if (o === c || o.dir !== c.dir || Math.abs(o.lat - lat) > 2.3) continue;
      let ds = ((o.s - c.s) * c.dir) % HW_LEN; if (ds < -HW_LEN / 2) ds += HW_LEN; if (ds > HW_LEN / 2) ds -= HW_LEN;
      if (ds > from && ds < range && ds < bd) { bd = ds; best = o; }
    }
    return best ? { o: best, gap: bd - (c.len + best.len) / 2 } : null;
  };
  for (const c of cars) {
    const lead = ahead(c, c.lat), safe = Math.max(3, c.speed * c.gapT);
    let v = c.want;
    if (lead && lead.gap < safe + 25) v = Math.min(v, Math.max(0, lead.o.speed + (lead.gap - safe) * 0.7));
    // Spurwechsel: überholen, wenn vorne einer bummelt; normale Autos gehen danach wieder nach rechts
    if ((c.laneT -= dt) <= 0) {
      c.laneT = c.type === 'racer' ? 0.6 : 1.5;
      const other = 1 - c.lane, oLat = c.dir * LANES[other], free = !ahead(c, oLat, -22, 45);
      const slowLead = lead && lead.gap < 70 && lead.o.speed < c.want - 3;
      if (c.type === 'racer' && slowLead && free) c.lane = other; // Raser: immer dorthin, wo es frei ist
      else if (c.type !== 'slow' && c.lane === 0 && slowLead && free) c.lane = 1;
      else if (c.type === 'normal' && c.lane === 1 && free && !ahead(c, oLat, -10, 80)) c.lane = 0; // Rechtsfahrgebot
    }
    const lat = c.dir * LANES[c.lane];
    c.speed += Math.max(-9 * dt, Math.min((c.type === 'racer' ? 5 : 3) * dt, v - c.speed));
    c.s = ((c.s + c.dir * c.speed * dt) % HW_LEN + HW_LEN) % HW_LEN;
    const dl = (lat - c.lat) * Math.min(1, dt * (c.type === 'racer' ? 2.2 : 1.2));
    c.lat += dl;
    // Drängler: klebt hinten dran, blinkt mit dem Licht und hupt (bei dir besonders)
    c.flashT -= dt; c.honkT -= dt;
    if (c.type === 'tail' && lead && lead.gap < 14 && lead.o.speed < c.want - 2) {
      c.flashT = 0.25 + (Math.floor(t * 4) % 2) * 0.2;
      if (lead.o.me && c.honkT <= 0) { hooks.honk(c); c.honkT = 3 + Math.random() * 2; hooks.msg('😠 Ein Drängler klebt an dir!'); }
    }
    if (c.mesh.userData.flash) c.mesh.userData.flash.visible = c.flashT > 0 && Math.floor(t * 8) % 2 === 0;
    const p = at(c.s, c.lat);
    c.x = p.x; c.z = p.z;
    if (c.type === 'racer' && P && c.dir === P.dir && c.speed > P.speed + 15 && Math.hypot(me.x - c.x, me.z - c.z) < 9) hooks.msg('💨 Achtung, ein Raser!');
    // du wirst angefahren oder fährst auf
    if (P && Math.hypot(me.x - c.x, me.z - c.z) < (me.radius + c.radius) * 0.75) { hooks.bump(c); c.speed *= 0.5; }
    const m = c.mesh, seen = Math.hypot(c.x - cam.x, c.z - cam.z) < 320;
    m.visible = seen;
    if (!seen) continue;
    m.position.set(c.x, 0, c.z);
    m.rotation.y = -(Math.atan2(p.tz, p.tx) + (c.dir < 0 ? Math.PI : 0)) - dl * c.dir * 3;
    for (const w of m.userData.wheels) w.rotation.z -= c.speed * dt / 0.35;
    animateCar(m, t, null);
  }
}

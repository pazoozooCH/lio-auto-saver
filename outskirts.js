// Gebiete ausserhalb des Stadtgitters (für city.js). Die Autobahn: ein Oval südlich der Stadt (etwa 3,7 km) mit zwei
// Spuren je Richtung, Mittelleitplanke und Leitplanken aussen, Zufahrt vom Südrand der Stadt. Tempolimit 140 (HW_LIMIT) –
// an das sich Raser und Drängler aber nicht halten (die fahren gegen 200).
// Auf der Autobahn fährt jeder anders: gemütliche Lastwagen rechts, normale Autos (überholen und gehen wieder rechts),
// Drängler (kleben am Vordermann, blinken mit dem Licht, hupen) und Raser (sehr schnell, wechseln dauernd die Spur).
// Koordinaten wie in city.js: x nach Osten, z nach Süden, s = Strecke entlang des Ovals, lat = seitlich (positiv =
// rechts in Fahrtrichtung +s, also innen).
import * as THREE from 'three';
import { buildCar, animateCar } from './cars3d.js';

export const HW = { cz: 650, half: 600, R: 200 };
export const HW_LIMIT = 140;
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
    // m/s: Lastwagen ~80 km/h, Normale ~125 (knapp unter dem Limit), Drängler ~190, Raser ~200 und mehr
    const want = { slow: 22, normal: 35, tail: 53, racer: 56 }[type] + (Math.random() - 0.5) * 6;
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

// ---------- Hafen und Flughafen ----------
// Neue Gebiete hinter einer Schranke: sie öffnet sich erst mit genug goldenen Schlüsseln (need). Je eine Strasse
// führt von der Stadt hin (road), das Gebiet selbst ist eben (rect). Der Hafen liegt im Westen am Wasser, der
// Flughafen im Osten mit Piste, Terminal, Tower und Flugzeugen (eines startet immer wieder).
export const AREAS = {
  harbor: { need: 5, name: '⚓ Hafen', rect: { x0: -700, x1: -340, z0: -150, z1: 110 }, road: { x0: -350, x1: -256, z0: -7, z1: 7 }, gate: { x: -334, z: 0 } },
  airport: { need: 12, name: '✈️ Flughafen', rect: { x0: 340, x1: 1000, z0: -260, z1: 60 }, road: { x0: 256, x1: 350, z0: -7, z1: 7 }, gate: { x: 334, z: 0 } },
};
const WATER = { x0: -1100, x1: -702, z0: -700, z1: 700, y: -4 }; // Hafenbecken (der Boden liegt tiefer)
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
    color: (x, z, y, steep, c) => { c.lerpColors(gA, gB, 0.5 + 0.5 * Math.sin(x / 23 + z / 31)); c.lerp(rock, smooth01((steep - 0.2) / 0.25)); c.lerp(snow, smooth01((y - 85) / 30) * 0.85); } });
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
  const p = hwProject(x, z);
  if (Math.abs(p.lat) < 13) {
    const lo = MEDIAN + r * 0.6 + 0.05, hi = EDGE - r * 0.8 - 0.05, lat = (p.lat >= 0 ? 1 : -1) * Math.min(hi, Math.max(lo, Math.abs(p.lat)));
    const q = at(p.s, lat);
    return { x: q.x, z: q.z };
  }
  return null;
}

// Eisenbahn (Wunsch Lionel): Rundstrecke südlich vom Flughafen, zwischen Flughafen und Skigebiet – für city.js.
// Strecke = abgerundetes Rechteck (RAIL), gerechnet mit Punkten alle 1 m (railAt, railProject); das Gelände dort ist eben
// (railDist in height()). Zwei Bahnhöfe (STATIONS), Bahnübergänge wo Strassen kreuzen (CROSSINGS, mit Schranken und Blinklicht).
// Der Zug fährt immer im Kreis, hält an den Bahnhöfen; zu Fuss am Bahnsteig X = einsteigen und mitfahren.
import * as THREE from 'three';

export const RAIL = { x0: 200, x1: 1040, z0: 885, z1: 1180, r: 110 };
export const RAIL_W = 2.2; // halbe Breite des Schotterbetts
const GAUGE = 1.435;
// ---------- Strecke ----------
const PX = [], PZ = [], TX = [], TZ = [];
{
  const { x0, x1, z0, z1, r } = RAIL, pts = [];
  const line = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az); for (let k = 0; k < L; k += 0.25) pts.push([ax + (bx - ax) * k / L, az + (bz - az) * k / L]); };
  const arc = (cx, cz, a0) => { for (let k = 0; k < Math.PI / 2 * r; k += 0.25) { const a = a0 + k / r; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  // im Uhrzeigersinn von oben links (z0 = Norden): oben nach Osten, rechts nach Süden, unten nach Westen, links nach Norden
  line(x0 + r, z0, x1 - r, z0); arc(x1 - r, z0 + r, -Math.PI / 2);
  line(x1, z0 + r, x1, z1 - r); arc(x1 - r, z1 - r, 0);
  line(x1 - r, z1, x0 + r, z1); arc(x0 + r, z1 - r, Math.PI / 2);
  line(x0, z1 - r, x0, z0 + r); arc(x0 + r, z0 + r, Math.PI);
  // gleichmässig alle 1 m
  let acc = 0, need = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (need <= acc + d) { const t = (need - acc) / d; PX.push(a[0] + (b[0] - a[0]) * t); PZ.push(a[1] + (b[1] - a[1]) * t); need += 1; }
    acc += d;
  }
  for (let k = 0; k < PX.length; k++) { const n = (k + 1) % PX.length, p = (k - 1 + PX.length) % PX.length, dx = PX[n] - PX[p], dz = PZ[n] - PZ[p], l = Math.hypot(dx, dz) || 1; TX.push(dx / l); TZ.push(dz / l); }
}
export const RAIL_LEN = PX.length;
const wrap = s => ((s % RAIL_LEN) + RAIL_LEN) % RAIL_LEN;
// Punkt bei s (Meter entlang der Strecke): x, z und Richtung tx, tz
export function railAt(s, out = {}) {
  s = wrap(s); const i = Math.floor(s), j = (i + 1) % RAIL_LEN, f = s - i;
  out.x = PX[i] + (PX[j] - PX[i]) * f; out.z = PZ[i] + (PZ[j] - PZ[i]) * f; out.tx = TX[i] + (TX[j] - TX[i]) * f; out.tz = TZ[i] + (TZ[j] - TZ[i]) * f;
  const l = Math.hypot(out.tx, out.tz) || 1; out.tx /= l; out.tz /= l;
  return out;
}
// Abstand zur Mittellinie (genau, ohne Punkte: Abstand zum abgerundeten Rechteck)
export function railDist(x, z) {
  const { x0, x1, z0, z1, r } = RAIL, ix0 = x0 + r, ix1 = x1 - r, iz0 = z0 + r, iz1 = z1 - r;
  const dx = Math.max(ix0 - x, 0, x - ix1), dz = Math.max(iz0 - z, 0, z - iz1);
  if (dx === 0 && dz === 0) return r + Math.min(x - ix0, ix1 - x, z - iz0, iz1 - z);
  return Math.abs(Math.hypot(dx, dz) - r);
}
export const onRail = (x, z, pad = 0) => railDist(x, z) < RAIL_W + pad;
// nächster Punkt der Strecke (s und seitlicher Abstand); grob über die Punkte, dann genau
export function railProject(x, z) {
  let best = 1e9, bi = 0;
  for (let k = 0; k < RAIL_LEN; k += 4) { const d = (PX[k] - x) ** 2 + (PZ[k] - z) ** 2; if (d < best) { best = d; bi = k; } }
  for (let k = bi - 4; k <= bi + 4; k++) { const i = (k + RAIL_LEN) % RAIL_LEN, d = (PX[i] - x) ** 2 + (PZ[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
  return { s: bi, d: Math.sqrt(best) };
}

// ---------- Bahnhöfe und Bahnübergänge ----------
// Bahnsteig aussen neben dem Gleis; der Zug hält so, dass er am Bahnsteig steht
export const STATIONS = [
  { name: '🚉 Bahnhof Flugfeld', x: 620, z: RAIL.z0 },
  { name: '🚉 Bahnhof Schneeberg', x: 620, z: RAIL.z1 },
].map(st => { const p = railProject(st.x, st.z), q = railAt(p.s), side = -1; // links in Fahrtrichtung = aussen
  return { ...st, s: p.s, px: q.x - q.tz * side * 4.6, pz: q.z + q.tx * side * 4.6, tx: q.tx, tz: q.tz, side, len: 76 }; });
const PLAT_HALF = 2.2, PLAT_Y = 0.55;
// Bahnsteig: Rechteck entlang des Gleises (Strecken dort gerade)
export function onPlatform(x, z) {
  for (const st of STATIONS) {
    const dx = x - st.px, dz = z - st.pz, a = dx * st.tx + dz * st.tz, b = -dx * st.tz + dz * st.tx;
    if (Math.abs(a) < st.len / 2 && Math.abs(b) < PLAT_HALF) return st;
  }
  return null;
}
export const railGround = (x, z) => (onPlatform(x, z) ? PLAT_Y : 0);
export const railSurface = (x, z) => (onPlatform(x, z) ? 'asphalt' : railDist(x, z) < RAIL_W ? 'gravel' : null);

// ---------- Bauen ----------
const TRAIN = [{ L: 15, loco: true }, { L: 17 }, { L: 17 }, { L: 17 }], GAP = 1.2;
export const TRAIN_LEN = TRAIN.reduce((s, c) => s + c.L, 0) + GAP * (TRAIN.length - 1);
export function buildRail({ scene, sign, isRoad }) {
  const g = new THREE.Group(); g.userData.noWarp = true; scene.add(g);
  const M = o => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  // Schotterbett als Band
  const ribbon = (half, y, mat, step = 2, off = 0) => {
    const pos = [], idx = [], P = {};
    for (let s = 0, k = 0; s <= RAIL_LEN; s += step, k++) {
      railAt(s, P); const nx = -P.tz, nz = P.tx;
      pos.push(P.x + nx * (off - half), y, P.z + nz * (off - half), P.x + nx * (off + half), y, P.z + nz * (off + half));
      if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m); return m;
  };
  ribbon(RAIL_W, 0.1, M({ color: 0x8a847c, roughness: 1 }));
  // Schwellen
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.14, 2.5), M({ color: 0x5b4636 }), Math.ceil(RAIL_LEN / 0.7));
  { const P = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(); let k = 0;
    for (let s = 0; s < RAIL_LEN - 0.35; s += 0.7) { railAt(s, P); q.setFromAxisAngle(up, -Math.atan2(P.tz, P.tx)); sleepers.setMatrixAt(k++, m4.compose(v.set(P.x, 0.2, P.z), q, one)); }
    sleepers.count = k; sleepers.instanceMatrix.needsUpdate = true; sleepers.receiveShadow = true; g.add(sleepers); }
  // Schienen (zwei glänzende Bänder mit Seiten)
  const steel = M({ color: 0xb8bec6, metalness: 0.85, roughness: 0.3 });
  for (const side of [-1, 1]) { ribbon(0.04, 0.42, steel, 1, side * GAUGE / 2); const r2 = ribbon(0.05, 0.3, M({ color: 0x4b5563, metalness: 0.5 }), 1, side * GAUGE / 2); r2.position.y = 0; }
  // Bahnübergänge: wo eine Strasse das Gleis kreuzt (isRoad), Gummiplatten, Andreaskreuze mit Blinklicht und Schranken
  const crossings = [];
  { let inRun = false, s0 = 0; const P = {};
    for (let s = 0; s <= RAIL_LEN + 1; s++) { railAt(s, P); const r = isRoad(P.x, P.z); if (r && !inRun) { inRun = true; s0 = s; } if (!r && inRun) { inRun = false; crossings.push({ s: (s0 + s - 1) / 2, w: s - s0 }); } } }
  const red = M({ color: 0xdc2626 }), white = M({ color: 0xf8fafc }), dark = M({ color: 0x1f2937 }), pole = M({ color: 0x9ca3af, metalness: 0.4 });
  const lampOff = M({ color: 0x4b1010, emissive: 0xff2020, emissiveIntensity: 0 });
  for (const C of crossings) {
    const P = railAt(C.s), nx = -P.tz, nz = P.tx, yaw = -Math.atan2(P.tz, P.tx);
    C.x = P.x; C.z = P.z;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(C.w + 2, 0.06, 3.6), dark); pad.position.set(P.x, 0.43, P.z); pad.rotation.y = yaw; g.add(pad);
    C.arms = []; C.lamps = [];
    for (const side of [-1, 1]) { // je Seite des Gleises: Schranke rechts der Strasse, Andreaskreuz links
      const bx = P.x + nx * side * 5 + P.tx * side * (C.w / 2 + 1), bz = P.z + nz * side * 5 + P.tz * side * (C.w / 2 + 1);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), white); post.position.set(bx, 0.55, bz); g.add(post);
      const pivot = new THREE.Group(); pivot.position.set(bx, 1.0, bz); pivot.rotation.y = yaw + (side < 0 ? Math.PI : 0); g.add(pivot); // Arm zeigt über die Strasse
      const armLen = C.w + 1;
      const arm = new THREE.Group(); pivot.add(arm);
      for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(armLen / 6, 0.12, 0.08), k % 2 ? white : red); seg.position.set(-armLen / 12 - k * armLen / 6, 0, 0); arm.add(seg); }
      arm.rotation.z = -Math.PI / 2 * 0.95; C.arms.push(arm); // offen: steht senkrecht
      const cx = P.x + nx * side * 5.6 - P.tx * side * (C.w / 2 + 1.2), cz = P.z + nz * side * 5.6 - P.tz * side * (C.w / 2 + 1.2);
      const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), pole); cp.position.set(cx, 1.7, cz); g.add(cp);
      for (const r of [0.7, -0.7]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.04), red); b.position.set(cx, 3.1, cz); b.rotation.set(0, yaw + Math.PI / 2 + (side > 0 ? Math.PI : 0), r); g.add(b); } // Andreaskreuz
      for (const k of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lampOff.clone()); l.position.set(cx + P.tx * k * 0.25 * side, 2.35, cz + P.tz * k * 0.25 * side); g.add(l); C.lamps.push(l); }
    }
  }
  // Bahnhöfe: Bahnsteig mit Kante, Dach, Bank, Schild
  for (const st of STATIONS) {
    const yaw = -Math.atan2(st.tz, st.tx), nx = -st.tz * st.side, nz = st.tx * st.side;
    const pl = new THREE.Mesh(new THREE.BoxGeometry(st.len, PLAT_Y, PLAT_HALF * 2), M({ color: 0xb8b2a7 })); pl.position.set(st.px, PLAT_Y / 2, st.pz); pl.rotation.y = yaw; pl.receiveShadow = true; g.add(pl);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(st.len, 0.02, 0.3), M({ color: 0xfacc15 })); edge.position.set(st.px - nx * (PLAT_HALF - 0.35), PLAT_Y + 0.01, st.pz - nz * (PLAT_HALF - 0.35)); edge.rotation.y = yaw; g.add(edge);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(24, 0.25, 3.4), M({ color: 0x334155 })); roof.position.set(st.px + nx * 0.3, 3.6, st.pz + nz * 0.3); roof.rotation.y = yaw; roof.castShadow = true; g.add(roof);
    for (const k of [-10, 0, 10]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.1, 8), pole); c.position.set(st.px + st.tx * k + nx * 1.4, PLAT_Y + 1.5, st.pz + st.tz * k + nz * 1.4); g.add(c); }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), M({ color: 0x8b5a2b })); bench.position.set(st.px + nx * 1.4, PLAT_Y + 0.45, st.pz + nz * 1.4); bench.rotation.y = yaw; g.add(bench);
    for (const side of [0, 1]) { const s1 = sign(st.name, '#1d4ed8', '#ffffff', 8, 1.3); s1.position.set(st.px + nx * 1.5, 4.5, st.pz + nz * 1.5); s1.rotation.y = yaw + side * Math.PI; s1.position.x += (side ? 1 : -1) * 0.03 * nx; s1.position.z += (side ? 1 : -1) * 0.03 * nz; g.add(s1); }
  }
  // Zug: rote Lok und drei Wagen (Kasten mit Fensterband, Dach, Drehgestelle, Lampen)
  const cars = TRAIN.map(c => {
    const car = new THREE.Group(); car.userData.noWarp = true;
    const body = c.loco ? 0xd61f1f : 0xf1f5f9, H = 3.3, W = 2.9;
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; car.add(m); return m; };
    box(c.L, H, W, M({ color: body, roughness: 0.4, metalness: 0.2 }), 0, 1.0 + H / 2, 0);
    box(c.L - 0.4, 0.3, W - 0.2, M({ color: 0x6b7280 }), 0, 1.0 + H + 0.15, 0); // Dach
    box(c.L - (c.loco ? 5 : 1.4), 0.9, W + 0.02, M({ color: 0x111827, roughness: 0.15, metalness: 0.5 }), c.loco ? 0 : 0, 3.1, 0); // Fensterband
    if (!c.loco) box(c.L, 0.35, W + 0.03, M({ color: 0xdc2626 }), 0, 2.05, 0); // roter Streifen
    else {
      for (const e of [-1, 1]) box(0.05, 1.0, W - 0.5, M({ color: 0x111827, roughness: 0.1, metalness: 0.5 }), e * (c.L / 2 + 0.01), 3.2, 0); // Frontscheiben
      for (const e of [-1, 1]) box(0.05, 0.25, W - 0.4, white, e * (c.L / 2 + 0.02), 1.9, 0); // weisser Streifen vorne
      const pg = M({ color: 0x374151 }); box(0.08, 0.9, 0.08, pg, -2, 5.0, 0); box(1.6, 0.06, 0.08, pg, -2, 5.45, 0); box(0.08, 0.06, 1.6, pg, -2, 5.48, 0); // Stromabnehmer
    }
    for (const e of [-1, 1]) for (const z of [-0.9, 0.9]) box(0.25, 0.25, 0.25, M({ color: 0xfff6d5, emissive: 0xfff2c0, emissiveIntensity: 0.4 }), e * (c.L / 2 + 0.03), 1.45, z).userData.lamp = e; // Lampen
    const bogie = M({ color: 0x1f2937, metalness: 0.4 });
    for (const e of [-1, 1]) { box(3.2, 0.7, W - 0.6, bogie, e * (c.L / 2 - 2.6), 0.75, 0); for (const k of [-0.8, 0.8]) for (const z of [-0.75, 0.75]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 14).rotateX(Math.PI / 2), M({ color: 0x111111, metalness: 0.6 })); w.position.set(e * (c.L / 2 - 2.6) + k, 0.8, z); car.add(w); } }
    scene.add(car);
    return { ...c, mesh: car };
  });
  return { g, crossings, cars, T: { s: STATIONS[0].s + TRAIN_LEN / 2, v: 0, wait: 6, next: 1 }, blink: 0 };
}

// ---------- Fahren ----------
const VMAX = 22, ACC = 1.1, DEC = 1.0, DWELL = 10;
const fwd = (a, b) => ((b - a) % RAIL_LEN + RAIL_LEN) % RAIL_LEN; // wie weit b vor a liegt
const stopAt = st => st.s + st.len / 2 - 4; // Zugspitze steht kurz vor dem Ende des Bahnsteigs
// Ein Bild: Zug bewegen, Schranken und Lichter; gibt Ereignisse zurück ({ depart, ding })
export function stepRail(R, dt, night = 0) {
  const T = R.T, ev = {};
  if (T.wait > 0) { T.wait -= dt; if (T.wait <= 0) { ev.depart = true; } }
  else {
    const st = STATIONS[T.next], d = fwd(T.s, stopAt(st));
    const want = d < (T.v * T.v) / (2 * DEC) + 0.5 ? Math.max(0, Math.sqrt(Math.max(0, 2 * DEC * (d - 0.3)))) : VMAX;
    T.v = T.v < want ? Math.min(want, T.v + ACC * dt) : Math.max(want, T.v - DEC * 2 * dt);
    T.s = (T.s + T.v * dt) % RAIL_LEN;
    if (d < 0.6 && T.v < 0.6) { T.v = 0; T.wait = DWELL; T.station = T.next; T.next = (T.next + 1) % STATIONS.length; ev.arrive = STATIONS[T.station]; }
  }
  if (T.wait <= 0) T.station = -1;
  // Wagen auf das Gleis setzen
  let off = 0; const A = {}, B = {};
  for (const c of R.cars) {
    const front = T.s - off, rear = front - c.L;
    railAt(front - 2.6, A); railAt(rear + 2.6, B);
    c.x = (A.x + B.x) / 2; c.z = (A.z + B.z) / 2; c.h = Math.atan2(A.z - B.z, A.x - B.x);
    c.mesh.position.set(c.x, 0.15, c.z); c.mesh.rotation.y = -c.h;
    c.mesh.traverse(o => { if (o.userData.lamp) o.material.emissiveIntensity = (o.userData.lamp > 0) === (c === R.cars[0]) ? 0.4 + night * 2.5 : 0.1; });
    off += c.L + GAP;
  }
  // Schranken: zu, solange der Zug näher als 170 m ist oder noch drauf steht
  R.blink += dt;
  for (const C of R.crossings) {
    const closed = fwd(T.s - TRAIN_LEN - 8, C.s) < TRAIN_LEN + 8 + 170 && !(T.wait > 3 && fwd(T.s, C.s) > 40);
    C.closed = closed;
    C.f = Math.max(0, Math.min(1, (C.f || 0) + (closed ? dt / 3 : -dt / 3)));
    for (const a of C.arms) a.rotation.z = -Math.PI / 2 * 0.95 * (1 - C.f);
    const on = closed || C.f > 0.02, ph = Math.floor(R.blink * 2.2) % 2;
    C.lamps.forEach((l, k) => { l.material.emissiveIntensity = on && (k % 2) === ph ? 3 : 0; });
    if (closed && !C.wasClosed) ev.ding = C;
    C.wasClosed = closed;
  }
  return ev;
}
// Zusammenstoss: Kreis (x, z, r) gegen die Wagen; gibt { nx, nz, d } zurück (wie weit hinausschieben) oder null
export function trainHit(R, x, z, r) {
  for (const c of R.cars) {
    const ca = Math.cos(c.h), sa = Math.sin(c.h), dx = x - c.x, dz = z - c.z, a = dx * ca + dz * sa, b = -dx * sa + dz * ca;
    const ha = c.L / 2 + r, hb = 1.45 + r;
    if (Math.abs(a) < ha && Math.abs(b) < hb) {
      const pa = ha - Math.abs(a), pb = hb - Math.abs(b);
      if (pb < pa) { const s = Math.sign(b) || 1; return { nx: -sa * s, nz: ca * s, d: pb, car: c }; }
      const s = Math.sign(a) || 1; return { nx: ca * s, nz: sa * s, d: pa, car: c };
    }
  }
  return null;
}
// Punkte der Strecke für die Karte
export function railPoints(step = 8) { const out = []; for (let s = 0; s <= RAIL_LEN; s += step) { const P = railAt(s); out.push([P.x, P.z]); } return out; }

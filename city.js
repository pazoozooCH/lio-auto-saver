// Stadt zum freien Herumfahren (three.js): Strassen im Gitter, Häuser, Parks, Ampeln und viel Verkehr.
// Wird von game.js erst geladen, wenn man in die Stadt fährt.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic, setLod, MODEL_LAMPS, hasModel, modelVariants, MOBILE, ghostLook, realTraffic } from './cars3d.js';
import { makeLamps, setLamps, removeLamps, dentAt, dropDents as dropCarDents } from './carlamps.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';
import { createCarSound, crash, gearbox, horn, createSiren } from './sound.js';
import { buildMoon, stepMoon, inMoon, moonGround, moonAllowed, MOON, MOON_G, MOON_ROCKET, MOON_BUGGY } from './moon.js';
import { buildCountry, stepCountry, countryDist, countryDrivable, countrySurface, inCountry, inWater, nearPier, BOAT_Y, BOAT_HOME, RIDES_INFO, FARM, countryBlocked, SPACE, SKI, skiH, skiFade } from './country.js';
import { makeNetCars } from './netcars.js';
import { setIsland, islandDist, landDist, SEA_Y, ISLAND_C, MONACO } from './island.js';
import { buildMonaco, monGround, monRoad, inMonaco, nearMonPier, MON_BOAT, MON_PIER, MON_ROADS, MON_NAME, FERRY, FERRY_Y, FERRY_LEN, FERRY_PATH, ferryAt, ferryLocal, ferryWorld, makeFerry,
  makeMonacoTraffic, stepMonacoTraffic } from './monaco.js';
import { PARTY, makeParty, partyGeo, birthdayBanner, birthdayCake } from './party.js';
import { buildService, serviceDist, inService, SERVICES, CITY_SERVICES } from './service.js';
import { buildSuburbs, suburbDist, inSuburb, suburbRoad, drawSuburbs, SUBURBS, SUB_PLACES } from './suburbs.js';
import { loadLook, makeLook, skyEnvironment, lookWanted, setLookWanted } from './look.js';
import { makeChat } from './chat.js';
import { buildHighway, outskirtsDist, hwDrivable, onHighway, hwGround, onRoads, ROADS, EXITS, SLIPS, inRest, makeHighwayTraffic, stepHighway, hwProject, hwPoint, HW, HW_LEN, HW_LIMIT, REST, REST_ZONES, makePath, pathAt, turnTo,
  AREAS, buildAreas, stepAreas, groundShape, areaDrivable, inArea, lockedGate, offroadWhy,
  PASS_AREA, buildPass, passGround, passDrivable, onPass, passTerrain, passNearest, inPassRegion, passPoints, SUMMIT, slideInside, waveFlag } from './outskirts.js';
import { makeEffects, camView, cockpit, COCKPIT, CAM_NAMES, FLY_HTML, FLY_KEYS, flyCss, flyHelp, flyToggle, flyStep } from './fx.js';

const N = 10;                   // Blöcke pro Seite (einzelne Randblöcke bleiben frei: MASK)
const BLOCK = 64;               // Abstand der Kreuzungen (Meter)
const ROAD = 14;                // Strassenbreite: eine Spur je Richtung
const LANE = 3.5;               // Spurmitte rechts neben der Strassenmitte
const HALF = N * BLOCK / 2;     // halbe Stadtgrösse
const LIMIT = HALF + 70;        // so weit darf man fahren
const FLY_MAX = 100, FLY_SPEED = 1.25; // Fliegen: höchste Höhe (über dem höchsten Haus), schneller als am Boden
const STOP = BLOCK - 12;        // Haltelinie (Abstand von der vorigen Kreuzung); die Wagenmitte hält eine halbe Länge davor
const CYCLE = 22;               // Ampelzyklus in Sekunden
const TRAFFIC = 64;             // so viele Autos fahren herum
const SEE = 115;                // weiter weg werden Autos nicht gezeichnet (jedes Auto sind viele Zeichen-Befehle)
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, −x, −z
const SPECIAL = { '3,6': 'gas', '6,3': 'wash', '6,6': 'pizza', '3,3': 'jail', '7,4': 'workshop', '2,4': 'dealer', '7,7': 'hospital', '4,7': 'blue', '8,6': 'house', '5,3': 'park', '3,7': 'drive', '7,5': 'kino', '6,7': 'stadium' }; // Blöcke mit Tankstelle, Waschanlage, Pizzeria, Gefängnis, Werkstatt, Autohändler, Spital, Blauer Zone
// Basen: sechs Blöcke nebeneinander am oberen Stadtrand, Platz s im Block (s + 1, 0); Einfahrt von der Strasse, an der man startet
const BASES = 6, BASE_CARS = 10, BASE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
const baseOf = key => { const [i, j] = key.split(',').map(Number); return j === 0 && i >= 1 && i <= BASES ? i - 1 : -1; };
const POOL = ('car mini kombi kompakt taxi police van delivery pickup hatch coupe smart ecar minivan jeep postauto ' +
  'schoolbus ambulance garbage beetle cabrio sports muscle offroad parcel bakery icecream oldtimer limo firetruck ' +
  'tiguanx tiguan24 e63 trackhawk kodiaq q5').split(' '); // eigene Typen der echten Autos
// Alte Autos ohne echtes 3D-Modell: im Verkehr durch echte ersetzt (realTraffic in cars3d.js; Busse und Lastwagen bleiben, bis es echte gibt)
const COLORS = ['#c0392b', '#2563eb', '#f4f4f4', '#22232b', '#9aa0aa', '#16a34a', '#f59e0b', '#7c3aed', '#0e7490', '#b45309'];

const node = i => (i - N / 2) * BLOCK;

// ---------- Stadt wie gewachsen: geschwungene Strassen, schiefe Blöcke ----------
// Gerechnet wird weiter im geraden Gitter (Verkehr, Zusammenstösse, Zonen); nur beim Zeichnen wird alles verbogen:
// warpXZ schiebt einen Punkt, warpRot dreht dort mit.
// - jede Strasse hat ihre eigene Welle (SW.v[i] für die Strasse x = node(i), SW.h[j] für z = node(j)), dazwischen gemischt
// - die Stadt ist rund statt viereckig: die Ecken werden nach innen gezogen (WARP_ROUND, Quadrat → Kreis)
// - ausserhalb des Rings läuft alles bis WARP_OUT sanft aus; dort und weiter draussen ist die Verbiegung null
const WARP_OUT = HALF + 160, WARP_ROUND = 0.32; // breiter Übergang, sanfter gerundet: sonst wirkt das Auto am Stadtrand wie hinausgeschleudert
const SW = (() => {
  const r = rng(1312), mk = () => { const calm = r() < 0.2; // ein paar Strassen fast gerade
    return { a: calm ? 1 + r() * 2 : 3.5 + r() * 5.5, l: 45 + r() * 45, p: r() * 6.28, b: calm ? 0 : r() * 3, m: 22 + r() * 12, q: r() * 6.28 }; };
  // Verschiebung jeder Strasse quer zu sich selbst: so sind die Blöcke verschieden gross (schmal und breit gemischt, Ring bleibt)
  const off = () => { const o = [0]; for (let k = 1; k < N; k++) o.push(Math.max(o[k - 1] - 14, Math.min(o[k - 1] + 14, (r() - 0.5) * 38))); o.push(0); return o; };
  // Neigung jeder Strasse: sie läuft schräg statt genau quer – Blöcke werden schiefe Vierecke und Trapeze (nicht falten: kleine Schritte)
  const tilt = () => { const t = [(r() - 0.5) * 0.14]; for (let k = 1; k <= N; k++) t.push(Math.max(-0.12, Math.min(0.12, t[k - 1] + (r() - 0.5) * 0.06))); return t; };
  return { v: Array.from({ length: N + 1 }, mk), h: Array.from({ length: N + 1 }, mk), ox: off(), oz: off(), kx: tilt(), kz: tilt() };
})();
const sstep = t => t * t * (3 - 2 * t); // an den Strassen flach: die Strasse behält ihre Breite
const wave = (w, t) => w.a * Math.sin(t / w.l + w.p) + w.b * Math.sin(t / w.m + w.q);
function warpXZ(x, z, out) {
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m >= WARP_OUT) { out.x = x; out.z = z; return out; }
  const F = m <= HALF ? 1 : 1 - smoothstep(HALF, WARP_OUT, m);
  const u = Math.max(-1, Math.min(1, x / HALF)), v = Math.max(-1, Math.min(1, z / HALF));
  let dx = (u * Math.sqrt(1 - v * v / 2) - u) * HALF * WARP_ROUND, dz = (v * Math.sqrt(1 - u * u / 2) - v) * HALF * WARP_ROUND;
  const fi = Math.max(0, Math.min(N - 1e-9, (x + HALF) / BLOCK)), i = Math.floor(fi), ti = fi - i;
  const fj = Math.max(0, Math.min(N - 1e-9, (z + HALF) / BLOCK)), j = Math.floor(fj), tj = fj - j;
  const si = sstep(ti), sj = sstep(tj);
  dx += wave(SW.v[i], z) * (1 - ti) + wave(SW.v[i + 1], z) * ti + SW.ox[i] + (SW.ox[i + 1] - SW.ox[i]) * si + (SW.kx[i] + (SW.kx[i + 1] - SW.kx[i]) * si) * z;
  dz += wave(SW.h[j], x) * (1 - tj) + wave(SW.h[j + 1], x) * tj + SW.oz[j] + (SW.oz[j + 1] - SW.oz[j]) * sj + (SW.kz[j] + (SW.kz[j + 1] - SW.kz[j]) * sj) * x;
  out.x = x + dx * F; out.z = z + dz * F;
  return out;
}
const _wa = { x: 0, z: 0 }, _wb = { x: 0, z: 0 };
function warpRot(x, z) { // Drehung (um y, wie rotation.y) der Gegend um (x, z)
  if (Math.abs(x) >= WARP_OUT || Math.abs(z) >= WARP_OUT) return 0;
  warpXZ(x + 0.5, z, _wa); warpXZ(x - 0.5, z, _wb);
  const t1 = Math.atan2(-(_wa.z - _wb.z), _wa.x - _wb.x);
  warpXZ(x, z + 0.5, _wa); warpXZ(x, z - 0.5, _wb);
  const t2 = Math.atan2(_wa.x - _wb.x, _wa.z - _wb.z);
  return (t1 + t2) / 2;
}
// Drehung genau für die Richtung, in die etwas schaut (ry wie rotation.y; die eigene x-Achse = vorne bei Autos):
// so stehen Autos parallel zur gebogenen Strasse statt um einen Mittelwert gedreht (das sah schief aus)
function warpDir(x, z, ry) {
  if (Math.abs(x) >= WARP_OUT || Math.abs(z) >= WARP_OUT) return ry;
  const dx = Math.cos(ry), dz = -Math.sin(ry);
  warpXZ(x + dx * 0.5, z + dz * 0.5, _wa); warpXZ(x - dx * 0.5, z - dz * 0.5, _wb);
  return -Math.atan2(_wa.z - _wb.z, _wa.x - _wb.x);
}
const inWarp = (x, z) => Math.abs(x) < WARP_OUT && Math.abs(z) < WARP_OUT;
// Massstab des Bildes an einer Stelle (1 = unverbogen): Dinge sind im Bild so gross, im Gitter also 1/warpScale
function warpScale(x, z) { return inWarp(x, z) ? Math.sqrt(warpStretch(x, z, 1, 0) * warpStretch(x, z, 0, 1)) : 1; }
// Auto als drei Kreise entlang der Fahrtrichtung: r = halbe Breite, vorne und hinten bis an die Stossstangen
function carCircles(x, z, h, len, ks = 1) {
  const r = (len > 6.5 ? 1.2 : 0.95) * ks, a = Math.max(0, (len / 2) * ks - r), fx = Math.cos(h), fz = Math.sin(h);
  const p = [[x + fx * a, z + fz * a], [x, z], [x - fx * a, z - fz * a]];
  return { r, p, move(dx, dz) { for (const q of p) { q[0] += dx; q[1] += dz; } } };
}
// Wie stark ist das Bild an dieser Stelle in Fahrrichtung (dx, dz) gestreckt? Teilt man die Bewegung im Gitter dadurch,
// fährt man im Bild immer genau so schnell, wie der Tacho zeigt (sonst wirkt es mal schneller, mal langsamer)
const _ws1 = { x: 0, z: 0 }, _ws2 = { x: 0, z: 0 };
function warpStretch(x, z, dx, dz) {
  if (!inWarp(x, z)) return 1;
  const l = Math.hypot(dx, dz); if (l < 1e-6) return 1;
  const ux = dx / l, uz = dz / l;
  warpXZ(x + ux, z + uz, _ws1); warpXZ(x - ux, z - uz, _ws2);
  return Math.max(0.5, Math.min(2, Math.hypot(_ws1.x - _ws2.x, _ws1.z - _ws2.z) / 2));
}
const isIdent = o => o.position.x === 0 && o.position.z === 0 && o.rotation.x === 0 && o.rotation.y === 0 && o.rotation.z === 0;
// Lange Dreiecke in der Stadt teilen (sonst wird eine 50 m lange Strasse nur an den Ecken verbogen)
function splitGeo(g0, maxLen = 16) {
  const g = g0.index ? g0.toNonIndexed() : g0.clone();
  if (g.groups.length > 1) return g;
  const names = Object.keys(g.attributes).filter(n => !g.attributes[n].isInterleavedBufferAttribute), A = names.map(n => g.attributes[n]);
  const sz = A.map(a => a.itemSize), tot = sz.reduce((s, v) => s + v, 0), pOff = sz.slice(0, names.indexOf('position')).reduce((s, v) => s + v, 0);
  const get = k => { const v = new Array(tot); let o = 0; A.forEach((a, q) => { for (let c = 0; c < sz[q]; c++) v[o++] = a.array[k * sz[q] + c]; }); return v; };
  const out = [], push = v => { for (let i = 0; i < tot; i++) out.push(v[i]); };
  const px = pOff, pz = pOff + 2, L = (u, v) => Math.hypot(u[px] - v[px], u[pz] - v[pz]), mid = (u, v) => u.map((x, i) => (x + v[i]) / 2);
  const tri = (a, b, c, depth) => {
    const ab = L(a, b), bc = L(b, c), ca = L(c, a), m = Math.max(ab, bc, ca);
    const x0 = Math.min(a[px], b[px], c[px]), x1 = Math.max(a[px], b[px], c[px]), z0 = Math.min(a[pz], b[pz], c[pz]), z1 = Math.max(a[pz], b[pz], c[pz]);
    if (m <= maxLen || depth > 9 || x0 >= WARP_OUT || x1 <= -WARP_OUT || z0 >= WARP_OUT || z1 <= -WARP_OUT) { push(a); push(b); push(c); return; }
    if (m === ab) { const d = mid(a, b); tri(a, d, c, depth + 1); tri(d, b, c, depth + 1); }
    else if (m === bc) { const d = mid(b, c); tri(a, b, d, depth + 1); tri(a, d, c, depth + 1); }
    else { const d = mid(c, a); tri(a, b, d, depth + 1); tri(d, b, c, depth + 1); }
  };
  const n = g.attributes.position.count, P = g.attributes.position.array;
  if (n % 3) return g;
  const need = k => { // muss dieses Dreieck geteilt werden? (direkt aus den Zahlen, ohne Hilfslisten: geht schneller)
    const ax = P[k * 3], az = P[k * 3 + 2], bx = P[k * 3 + 3], bz = P[k * 3 + 5], cx = P[k * 3 + 6], cz = P[k * 3 + 8];
    if (Math.min(ax, bx, cx) >= WARP_OUT || Math.max(ax, bx, cx) <= -WARP_OUT || Math.min(az, bz, cz) >= WARP_OUT || Math.max(az, bz, cz) <= -WARP_OUT) return false;
    return Math.max(Math.hypot(ax - bx, az - bz), Math.hypot(bx - cx, bz - cz), Math.hypot(cx - ax, cz - az)) > maxLen;
  };
  let any = false;
  for (let k = 0; k < n && !any; k += 3) any = need(k);
  if (!any) return g;
  const raw = k => { for (let q = 0; q < A.length; q++) { const a = A[q].array, w = sz[q]; for (let c = 0; c < w; c++) out.push(a[k * w + c]); } };
  for (let k = 0; k < n; k += 3) if (need(k)) tri(get(k), get(k + 1), get(k + 2), 0); else { raw(k); raw(k + 1); raw(k + 2); }
  const cnt = out.length / tot, res = new THREE.BufferGeometry();
  let o = 0;
  A.forEach((a, q) => {
    const arr = new Float32Array(cnt * sz[q]);
    for (let k = 0; k < cnt; k++) for (let c = 0; c < sz[q]; c++) arr[k * sz[q] + c] = out[k * tot + o + c];
    res.setAttribute(names[q], new THREE.BufferAttribute(arr, sz[q], a.normalized));
    o += sz[q];
  });
  return res;
}
// Einmal beim Bauen: alles, was mit Weltkoordinaten am Ursprung liegt (zusammengefasste Häuser, Strassen, Instanzen), verbiegen
const _wm = new THREE.Matrix4(), _wr = new THREE.Matrix4(), _wt = new THREE.Matrix4();
function warpStatic(o, skip, done = new Map()) {
  if (skip.has(o) || !isIdent(o)) return; // eigene Lage: wird in jedem Bild verschoben (warpFrame)
  if (o.isInstancedMesh) {
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, _wm);
      const x = _wm.elements[12], z = _wm.elements[14];
      if (!inWarp(x, z)) continue;
      const p = warpXZ(x, z, _wa);
      const e = _wm.elements, ry0 = Math.atan2(-e[2], e[0]); // Richtung der eigenen x-Achse
      _wt.makeTranslation(-x, 0, -z).premultiply(_wr.makeRotationY(warpDir(x, z, ry0) - ry0));
      _wt.elements[12] += p.x; _wt.elements[14] += p.z;
      o.setMatrixAt(k, _wm.premultiply(_wt));
    }
    o.instanceMatrix.needsUpdate = true;
    o.computeBoundingSphere(); o.computeBoundingBox && o.computeBoundingBox();
  } else if ((o.isMesh || o.isLine) && o.geometry && o.geometry.attributes.position) {
    let g = o.geometry;
    if (done.has(g)) { o.geometry = done.get(g); }
    else {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      if (!(bb.min.x >= WARP_OUT || bb.max.x <= -WARP_OUT || bb.min.z >= WARP_OUT || bb.max.z <= -WARP_OUT)) {
        const g2 = o.isMesh ? splitGeo(g) : g.clone(), P = g2.attributes.position, Nm = g2.attributes.normal;
        for (let k = 0; k < P.count; k++) {
          const x = P.getX(k), z = P.getZ(k);
          if (!inWarp(x, z)) continue;
          warpXZ(x, z, _wa); P.setX(k, _wa.x); P.setZ(k, _wa.z);
          if (Nm && Math.abs(Nm.getY(k)) < 0.999) {
            const t = warpRot(x, z), c = Math.cos(t), s = Math.sin(t), nx = Nm.getX(k), nz = Nm.getZ(k);
            Nm.setX(k, c * nx + s * nz); Nm.setZ(k, -s * nx + c * nz);
          }
        }
        g2.computeBoundingBox(); g2.computeBoundingSphere();
        done.set(g, g2); o.geometry = g2;
      } else done.set(g, g);
    }
  }
  for (const c of o.children) warpStatic(c, skip, done);
}
// Jedes Bild: alles mit eigener Lage (Autos, Leute, Schilder ...) kurz verschieben und drehen, zeichnen, dann zurück
const warpList = [];
function warpFrame(root) {
  for (const o of root.children) {
    if (!o.visible || o.userData.noWarp) continue;
    if (isIdent(o)) { if (o.children.length) warpFrame(o); continue; }
    const x = o.position.x, z = o.position.z;
    if (!inWarp(x, z)) continue;
    warpList.push(o, x, z, o.rotation.y);
    const ry = warpDir(x, z, o.rotation.y);
    warpXZ(x, z, _wa); o.position.x = _wa.x; o.position.z = _wa.z; o.rotation.y = ry;
  }
}
function unwarpFrame() {
  for (let k = 0; k < warpList.length; k += 4) { const o = warpList[k]; o.position.x = warpList[k + 1]; o.position.z = warpList[k + 2]; o.rotation.y = warpList[k + 3]; }
  warpList.length = 0;
}
const warpV = v => { if (inWarp(v.x, v.z)) { warpXZ(v.x, v.z, _wa); v.x = _wa.x; v.z = _wa.z; } return v; };

const inGrid =(i, j) => i >= 0 && i <= N && j >= 0 && j <= N;
// Umriss wie eine echte Stadt: diese Randblöcke sind frei (Wald und Wiese) – neben den Vororten, an Ecken und am Südrand.
// Strassen gibt es nur, wo mindestens auf einer Seite ein Block der Stadt liegt (segOn); sonst gelten sie als gesperrt (isPed).
// ORGANIC: frei geformte Quartiere in der Stadt (Gassen in Kurven, Einfamilienhäuser; SUBURBS mit inCity in suburbs.js)
const ORGANIC = new Set(['1,7', '2,7', '1,8', '2,8', '7,1', '8,1', '7,2', '8,2']);
const MASK = new Set(['0,0', '7,0', '8,0', '9,0', '9,1', '9,2', '9,3', '9,4', '9,5', '9,6', '0,7', '0,8', '0,9', '1,9', '7,9', '8,9', '9,9', '0,6', ...ORGANIC]);
const blockOn = (bi, bj) => bi >= 0 && bj >= 0 && bi < N && bj < N && !MASK.has(bi + ',' + bj);
const segOn = (i, j, d) => {
  const [fx, fz] = DIRS[d], i2 = i + fx, j2 = j + fz;
  if (!inGrid(i, j) || !inGrid(i2, j2)) return false;
  if (fx) { const bi = Math.min(i, i2); return blockOn(bi, j - 1) || blockOn(bi, j); }
  const bj = Math.min(j, j2); return blockOn(i - 1, bj) || blockOn(i, bj);
};
const nodeSegs = (i, j) => [0, 1, 2, 3].filter(d => segOn(i, j, d)).length;
// Echte Stadt: an einigen Kreuzungen ein Kreisel (keine Ampel, Autos fahren rundherum), und einzelne Strassenstücke sind
// Fussgängerzonen (Autos fahren dort nicht durch; so gibt es T-Kreuzungen und längere Blöcke)
const ROUND = new Set(['3,4', '7,3', '4,7', '7,7', '6,8']), ROUND_R = 5.4; // Kreisel: Spur im Kreis mit diesem Radius
const PED = (() => { // Schlüssel "i,j,d" für beide Richtungen jedes Fussgängerstücks
  const r = rng(808), out = new Set(), used = new Set(), list = [];
  const bad = (bi, bj) => SPECIAL[bi + ',' + bj] || (bi === N >> 1 && bj === N >> 1) || baseOf(bi + ',' + bj) >= 0 || !blockOn(bi, bj);
  for (let t = 0; list.length < 8 && t < 800; t++) {
    const ax = r() < 0.5, i = 1 + Math.floor(r() * (N - 2)), j = 1 + Math.floor(r() * (N - 2)), i2 = ax ? i + 1 : i, j2 = ax ? j : j + 1;
    if (i2 >= N || j2 >= N) continue; // nicht am Ring
    if (ax ? bad(i, j - 1) || bad(i, j) : bad(i - 1, j) || bad(i, j)) continue; // nicht vor Tankstelle, Basen, Platz usw.
    if ([i + ',' + j, i2 + ',' + j2].some(k => ROUND.has(k) || used.has(k))) continue;
    used.add(i + ',' + j); used.add(i2 + ',' + j2);
    out.add(i + ',' + j + ',' + (ax ? 0 : 1)); out.add(i2 + ',' + j2 + ',' + (ax ? 2 : 3));
    list.push({ i, j, i2, j2, ax });
  }
  out.list = list;
  return out;
})();
const isPed = (i, j, d) => PED.has(i + ',' + j + ',' + d) || !segOn(i, j, d); // Fussgängerzone oder keine Strasse (freier Block)
const hasLights = (i, j) => nodeSegs(i, j) >= 3 && !ROUND.has(i + ',' + j); // Ecken: nur Kurve; Kreisel: keine Ampel
const axisOf = d => (d % 2 === 0 ? 'x' : 'z');
// Tempolimit einer Strasse (k: Nummer der Strasse): aussen der Ring 80, durch die Mitte (Platz) 30, sonst 50 km/h
const streetLimit = k => (k === 0 || k === N ? 80 : k === N / 2 ? 30 : 50);

// Ampel je Fahrtrichtung: x fährt zuerst, dann z; dazwischen kurz alle rot
function lightState(axis, t) {
  const p = ((t % CYCLE) + CYCLE) % CYCLE;
  if (axis === 'x') return p < 8 ? 'green' : p < 10 ? 'yellow' : 'red';
  return p >= 11 && p < 19 ? 'green' : p >= 19 && p < 21 ? 'yellow' : 'red';
}

let S = null;     // Szene, Renderer, Stadt (einmal gebaut)
let city = null;  // laufende Fahrt

// ---------- Hilfen zum Bauen ----------
// Viele flache Rechtecke in einer Form (Strassen, Linien); uv nach Weltkoordinaten, damit Texturen nahtlos sind
function quads(uvScale = 1 / 8) {
  const pos = [], uv = [], idx = [];
  return {
    add(x0, z0, x1, z1, y) {
      [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)]; [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
      const b = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      uv.push(x0 * uvScale, z0 * uvScale, x1 * uvScale, z0 * uvScale, x1 * uvScale, z1 * uvScale, x0 * uvScale, z1 * uvScale);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    },
    rect(cx, cz, sx, sz, y) { this.add(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, y); },
    mesh(mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      return m;
    },
  };
}

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Hausfassade (Bild 512 × 512 = 12 × 12 m, 4 Stockwerke). Stile: classic = einzelne Fenster mit Sims und Vorhang,
// ribbon = moderne Fensterbänder, curtain = Glasfassade, panel = Fenster mit bunten Paneelen.
// Jeder Stil liefert eine Liste von Teilen (Rechtecke); daraus werden alle Bilder gezeichnet: Farbe, Leuchten (nachts),
// Rauheit/Metall (Glas glänzt und spiegelt den Himmel) und Relief (Fenster liegen tiefer, Simse stehen vor)
const ACCENTS = ['#f87171', '#2dd4bf', '#fbbf24', '#a78bfa', '#60a5fa', '#fb923c'];
function facade(wall, frame, r, style = 'classic') {
  const Z = 512, C = 128, parts = [], wins = [];
  const win = (x, y, w, h, extra = {}) => { const o = { k: 'glass', x, y, w, h, lit: r() < 0.12, glow: r() < 0.55, ...extra }; parts.push(o); wins.push(o); return o; };
  const P = (k, x, y, w, h, c) => parts.push({ k, x, y, w, h, c });
  if (style === 'classic') {
    for (let y = 0; y < 4; y++) P('ledge', 0, y * C + C - 10, Z, 7);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = x * C + 24, py = y * C + 26;
      P('frame', px - 7, py - 7, 94, 86); const w = win(px, py, 80, 72);
      if (r() < 0.25) P('curtain', px, py, 80, 20 + r() * 40);
      P('frame', px + 38, py, 4, 72); P('frame', px, py + 30, 80, 3); P('sill', px - 12, py + 79, 104, 8);
      w.sill = true;
    }
  } else if (style === 'ribbon') { // durchgehende Fensterbänder, schlanke Profile
    for (let y = 0; y < 4; y++) {
      const py = y * C + 30; P('frame', 0, py - 5, Z, 80);
      for (let x = 0; x < 8; x++) { win(x * 64 + 3, py, 58, 70); if (r() < 0.2) P('curtain', x * 64 + 3, py, 58, 14 + r() * 30); }
      P('ledge', 0, y * C + C - 14, Z, 8);
    }
  } else if (style === 'curtain') { // Glasfassade: alles Glas, Raster aus Profilen
    P('frame', 0, 0, Z, Z);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) win(x * 64 + 3, y * C + 5, 58, C - 12, { tall: true });
  } else { // panel: Fenster und bunte Paneele im Wechsel
    for (let y = 0; y < 4; y++) {
      P('ledge', 0, y * C + C - 9, Z, 6);
      for (let x = 0; x < 4; x++) {
        const px = x * C + 14, py = y * C + 22, pc = ACCENTS[Math.floor(r() * ACCENTS.length)];
        P('frame', px - 4, py - 4, 66, 88); win(px, py, 58, 80);
        P('panel', px + 66, py - 4, 40, 88, pc);
      }
    }
  }
  // Zeichnen; col(Teil) gibt die Füllung je Bild
  const draw = (g, col, extra) => {
    g.fillStyle = col({ k: 'wall' }); g.fillRect(0, 0, Z, Z);
    if (extra) extra(g);
    for (const o of parts) { g.fillStyle = col(o); g.fillRect(o.x, o.y, o.w, o.h); if (o.k === 'glass' && col.gloss) col.gloss(g, o); }
  };
  const look = o => {
    if (o.k === 'glass') { // Himmel spiegelt sich: oben hell, unten dunkel (beleuchtete Fenster warm)
      const gr = g0.createLinearGradient(0, o.y, 0, o.y + o.h);
      gr.addColorStop(0, o.lit ? '#fff4cf' : style === 'curtain' ? '#a9d4f2' : '#9cc7e8'); gr.addColorStop(0.55, o.lit ? '#ffd98a' : '#4f7fae'); gr.addColorStop(1, o.lit ? '#f2b35a' : '#203752');
      return gr;
    }
    return { wall, ledge: 'rgba(255,255,255,0.2)', frame, curtain: 'rgba(240,235,225,0.9)', sill: 'rgba(240,238,232,1)', panel: o.c }[o.k];
  };
  look.gloss = (g, o) => { // glänzender Lichtstreifen schräg über das Glas (Cartoon-Glanz)
    if (o.lit) return;
    g.save(); g.beginPath(); g.rect(o.x, o.y, o.w, o.h); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath();
    const x0 = o.x + o.w * 0.15; g.moveTo(x0, o.y + o.h); g.lineTo(x0 + o.w * 0.25, o.y + o.h); g.lineTo(x0 + o.w * 0.25 + o.h * 0.6, o.y); g.lineTo(x0 + o.h * 0.6, o.y); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(o.x, o.y, o.w, 3);
    g.restore();
  };
  let g0 = null;
  const tex = canvasTex(Z, Z, g => { g0 = g; draw(g, look, g => { // Verputz: feine Flecken
    for (let k = 0; k < 9000; k++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.random() * Z, Math.random() * Z, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  }); for (const w of wins) if (w.sill) { const gr = g.createLinearGradient(0, w.y + 86, 0, w.y + 112); gr.addColorStop(0, 'rgba(0,0,0,0.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w.x - 8, w.y + 86, 96, 26); } });
  tex.glow = canvasTex(Z, Z, g => { // Leuchtbild für die Nacht: schwarz, nur die beleuchteten Fenster gelb
    g.fillStyle = '#000'; g.fillRect(0, 0, Z, Z);
    for (const w of wins) if (w.glow) { g.fillStyle = Math.random() < 0.3 ? '#bfe4ff' : '#ffd38a'; g.fillRect(w.x, w.y, w.w, w.h); }
  });
  // Rauheit (grün) und Metall (blau): Glas sehr glatt und spiegelnd, Profile metallisch, Verputz matt
  tex.rough = canvasTex(Z, Z, g => draw(g, o => ({ wall: 'rgb(0,235,0)', ledge: 'rgb(0,210,0)', frame: 'rgb(0,95,70)', glass: 'rgb(0,10,150)', curtain: 'rgb(0,10,150)', sill: 'rgb(0,190,0)', panel: 'rgb(0,140,0)' }[o.k])));
  tex.rough.colorSpace = THREE.NoColorSpace;
  // Relief → Normalenbild
  const hc = document.createElement('canvas'); hc.width = hc.height = Z;
  const hg = hc.getContext('2d');
  draw(hg, o => ({ wall: '#c8c8c8', ledge: '#e6e6e6', frame: '#b4b4b4', glass: '#5a5a5a', curtain: '#5a5a5a', sill: '#ffffff', panel: '#d2d2d2' }[o.k]));
  const H = hg.getImageData(0, 0, Z, Z).data, out = hg.createImageData(Z, Z), o = out.data, h = (x, y) => H[(((y + Z) % Z) * Z + (x + Z) % Z) * 4] / 255;
  for (let y = 0; y < Z; y++) for (let x = 0; x < Z; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * Z + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  hg.putImageData(out, 0, 0);
  tex.normal = new THREE.CanvasTexture(hc); tex.normal.wrapS = tex.normal.wrapT = THREE.RepeatWrapping; tex.normal.anisotropy = 8;
  return tex;
}
const facadeMat = (f, base) => new THREE.MeshStandardMaterial({ map: f, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 0,
  roughness: 1, metalness: 1, roughnessMap: f.rough, metalnessMap: f.rough, normalMap: f.normal, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: base * 1.3 });

// ---------- Pflanzen (Cartoon, aber mit mehr Details) ----------
// Farbverlauf in den Ecken (Vertex-Farben): oben hell und gelblich (Sonne), unten dunkel (Schatten) – gibt Tiefe ohne Kosten.
// Die Farbe je Pflanze kommt als Instanz-Farbe dazu (multipliziert).
const UP = new THREE.Vector3(0, 1, 0);
function shadeGeo(g, y0, y1, lo = 0.5, hi = 1, warm = 0.12) {
  const P = g.attributes.position, c = new Float32Array(P.count * 3);
  for (let k = 0; k < P.count; k++) {
    const t = Math.max(0, Math.min(1, (P.getY(k) - y0) / (y1 - y0))), v = lo + (hi - lo) * t * t * (3 - 2 * t);
    c[k * 3] = Math.min(1, v * (1 + warm * t)); c[k * 3 + 1] = Math.min(1, v); c[k * 3 + 2] = v * (1 - warm * 0.8 * t);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const lumpy = (g, amt, x = 0, y = 0, z = 0) => { // verbeult und verschoben
  const P = g.attributes.position;
  for (let k = 0; k < P.count; k++) {
    const px = P.getX(k), py = P.getY(k), pz = P.getZ(k), n = 1 + amt * Math.sin(px * 3.1 + pz * 2.3) * Math.cos(py * 2.7 + px);
    P.setXYZ(k, px * n + x, py * n + y, pz * n + z);
  }
  return g.index ? g.toNonIndexed() : g;
};
// Baumkrone: fünf verbeulte Blätter-Klumpen; die Normalen zeigen von der Kronenmitte weg (weiches Licht wie bei echtem Laub)
function crownGeo() {
  const parts = [[0, 0.25, 0, 1.75, 1], [1.0, -0.3, 0.45, 1.25, 0], [-0.9, -0.2, -0.6, 1.3, 0], [-0.3, -0.45, 1.05, 1.1, 0], [0.55, 0.95, -0.4, 1.0, 0]]
    .map(([x, y, z, rad, det]) => lumpy(new THREE.IcosahedronGeometry(rad, det), 0.16, x, y, z));
  const g = mergeGeometries(parts, false), P = g.attributes.position, Nm = g.attributes.normal, v = new THREE.Vector3();
  for (let k = 0; k < P.count; k++) { v.set(P.getX(k), P.getY(k) + 0.3, P.getZ(k)).normalize(); Nm.setXYZ(k, v.x, v.y, v.z); }
  return shadeGeo(g, -1.6, 2.2, 0.55, 1.05);
}
// Tanne: drei Kegel übereinander (im Wald rund um die Stadt)
function pineGeo() {
  const parts = [[2.2, 2.6, 0.9], [1.75, 2.3, 2.3], [1.2, 2.0, 3.6]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 9, 1); g.translate(0, y, 0); return g.index ? g.toNonIndexed() : g; });
  return shadeGeo(mergeGeometries(parts, false), -0.4, 4.6, 0.5, 1.05, 0.06);
}
function bushGeo() {
  const g = mergeGeometries([lumpy(new THREE.IcosahedronGeometry(0.7, 1), 0.18, 0, 0.45, 0), lumpy(new THREE.IcosahedronGeometry(0.5, 0), 0.2, 0.45, 0.3, 0.2)], false);
  const P = g.attributes.position, Nm = g.attributes.normal, v = new THREE.Vector3();
  for (let k = 0; k < P.count; k++) { v.set(P.getX(k), P.getY(k) - 0.1, P.getZ(k)).normalize(); Nm.setXYZ(k, v.x, v.y, v.z); }
  return shadeGeo(g, 0, 1.1, 0.5, 1.05);
}
// Grasbüschel: zwei gekreuzte Bilder mit Halmen (durchsichtig zwischen den Halmen), Normalen nach oben wie der Boden
let tuftTex = null;
function tuftGeo() {
  // vier Bilder (je zwei Rücken an Rücken): mit einer Seite gezeichnet, sonst wird die Rückseite dunkel (Normale nach unten)
  const g = mergeGeometries([0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(a => new THREE.PlaneGeometry(0.9, 0.55).rotateY(a)), false); g.translate(0, 0.27, 0);
  const Nm = g.attributes.normal; for (let k = 0; k < Nm.count; k++) Nm.setXYZ(k, 0, 1, 0);
  return g;
}
function tuftMat() {
  if (!tuftTex) tuftTex = canvasTex(128, 80, g => {
    for (let k = 0; k < 26; k++) { // Halme: unten breit, oben spitz, verschieden hell
      const x = 6 + Math.random() * 116, h = 30 + Math.random() * 48, l = 140 + Math.random() * 115, lean = (Math.random() - 0.5) * 22;
      g.fillStyle = `rgb(${l * 0.82},${l},${l * 0.62})`; g.beginPath(); g.moveTo(x - 3, 80); g.quadraticCurveTo(x + lean * 0.3, 80 - h * 0.6, x + lean, 80 - h); g.lineTo(x + 3, 80); g.fill();
    }
  });
  return new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.4, roughness: 0.9 });
}
// Laub: viele kleine Blätter in Hell und Dunkel; dient auch als Relief (bumpMap), damit die Blätter plastisch wirken
let leafTex = null;
function leafMat(opts = {}) {
  if (!leafTex) {
    leafTex = canvasTex(256, 256, g => {
      g.fillStyle = '#8e8e8e'; g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 3400; k++) {
        const l = 100 + Math.random() * 155; g.fillStyle = `rgb(${l * 0.94},${l},${l * 0.86})`;
        g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 2.5 + Math.random() * 3.5, 1.3 + Math.random() * 1.6, Math.random() * 3.14, 0, 6.29); g.fill();
      }
    });
    leafTex.repeat.set(3, 2);
  }
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: leafTex, bumpMap: leafTex, bumpScale: 2.2, vertexColors: true, roughness: 0.85, envMapIntensity: 0.5, ...opts });
}

// Box, deren Textur in Metern wiederholt wird (Fassaden passen bei jeder Hausgrösse)
function wallBox(w, h, d, mat, tile = 12) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * sizes[f][0] / tile, uv.getY(i) * sizes[f][1] / tile);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Runde Häuser: Grundriss als Rechteck w × d mit runden Ecken (rad je Ecke: [+x+z, −x+z, −x−z, +x−z]) …
function roundRectPts(w, d, rad, seg = 7) {
  const pts = [], C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  C.forEach(([sx, sz], k) => {
    const R = rad[k], cx = sx * (w / 2 - R), cz = sz * (d / 2 - R), a0 = k * Math.PI / 2;
    if (R < 0.01) { pts.push([sx * w / 2, sz * d / 2]); return; }
    for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
  });
  return pts;
}
const circlePts = (R, n = 28) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * R, Math.sin(i / n * Math.PI * 2) * R]);
// … und daraus eine Wand der Höhe h (Fassade läuft um die Rundung herum, tile = Meter pro Bildkachel), cap = Deckel oben
function prism(pts, h, material, tile = 12, cap = false) {
  const n = pts.length, pos = [], nor = [], uv = [];
  const sn = pts.map((p, i) => { // Normale je Wandstück, nach aussen
    const q = pts[(i + 1) % n]; let nx = q[1] - p[1], nz = p[0] - q[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * (p[0] + q[0]) + nz * (p[1] + q[1]) < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  });
  const vn = (i, j) => { const a = sn[i], b = sn[j]; if (a[0] * b[0] + a[1] * b[1] < 0.8) return a; const x = a[0] + b[0], z = a[1] + b[1], l = Math.hypot(x, z); return [x / l, z / l]; };
  let u = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]), u1 = u + len / tile, v = h / tile;
    const np = vn(i, (i - 1 + n) % n), nq = vn(i, (i + 1) % n);
    let A = [p, np, u], B = [q, nq, u1];
    if (-(q[1] - p[1]) * sn[i][0] + (q[0] - p[0]) * sn[i][1] < 0) { const t = A; A = B; B = t; } // Dreiecke von aussen sichtbar
    for (const [V, y] of [[A, 0], [B, 0], [B, h], [A, 0], [B, h], [A, h]]) {
      pos.push(V[0][0], y, V[0][1]); nor.push(V[1][0], 0, V[1][1]); uv.push(V[2], y / tile);
    }
    u = u1;
  }
  if (cap) {
    const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const t of tri) {
      const [a, b, c] = t.map(k => pts[k]), up = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0; // Normale nach oben?
      for (const P of up ? [a, b, c] : [a, c, b]) { pos.push(P[0], h, P[1]); nor.push(0, 1, 0); uv.push(P[0] / tile, P[1] / tile); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------- Stadt bauen ----------
function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 2 : 1.5)); // Handy: schärfer (hohe Pixeldichte, sonst verpixelt)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // mit shadow.radius: weiche, breite Schattenränder
  renderer.domElement.className = 'c3d';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc6d6e6, 110, 950); // Dunst in der Ferne: mehr Tiefe
  scene.environment = skyEnvironment(renderer, { elevation: 50, azimuth: 210 }); // Spiegelungen zeigen den Himmel
  const dayEnv = scene.environment;
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 5000);
  camera.layers.enable(1);

  const sky = new Sky();
  sky.scale.setScalar(4000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.3; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(210));
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x55604a, 0.75);
  scene.add(hemi);
  // Umgebungslicht für Tag, Dämmerung und Nacht (nur die Textur wird getauscht, das kostet nichts)
  const pm = new THREE.PMREMGenerator(renderer), envOf = col => { const sc = new THREE.Scene(); sc.background = new THREE.Color(col); return pm.fromScene(sc, 0.04).texture; };
  const envs = { day: null, dusk: skyEnvironment(renderer, { elevation: 87, azimuth: 210, turbidity: 8, rayleigh: 2.5, ground: 0x2a2c30 }), night: envOf(0x0d1426) };
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.4); // warmes Sonnenlicht
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 400 });
  sun.shadow.normalBias = 0.04; sun.shadow.radius = 3.5;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const r = rng(42), NZ = makeNoise(4);
  const decor = new THREE.Group();
  const solid = [], round = []; // Hindernisse: Häuser (Rechtecke), Bäume und Brunnen (Kreise)

  // Texturen
  const asphalt = surface(256, (u, v) => {
    const n = NZ.fbm(u * 8, v * 8, 4, 8), gr = r();
    const k = 54 + n * 22 + gr * 12;
    return [k, k + 1, k + 4, gr * 0.4 + n * 0.5];
  }, 3);
  const pave = surface(256, (u, v) => { // Trottoir-Platten 2 × 2 m (Textur = 4 × 4 m)
    const fu = (u * 2) % 1, fv = (v * 2) % 1, joint = fu < 0.03 || fv < 0.03;
    const k = joint ? 120 : 170 + NZ.noise(u * 20, v * 20, 20) * 25 + r() * 10;
    return [k, k - 2, k - 6, joint ? 0 : 1];
  }, 2);
  const grassDetail = surface(256, (u, v) => { // Rasen: mehrere Grüntöne (gelblich bis satt) und sichtbare Halme
    const n = NZ.fbm(u * 16, v * 16, 4, 16), b = r(), m = NZ.fbm(u * 3, v * 3, 3, 3);
    const blade = Math.pow(Math.abs(Math.sin((u * 96 + NZ.noise(u * 24, v * 24, 24) * 4 + v * 7) * Math.PI)), 8); // feine Halm-Striche
    const k = 182 + n * 46 + b * 16 + blade * 34;
    return [k - 4 + m * 26, k + 6 + m * 6, k - 26 - m * 14, n * 0.5 + b * 0.35 + blade * 0.6];
  }, 3.6);
  const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const asphaltMat = mat({ map: asphalt.map, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.85 });
  const paveMat = mat({ map: pave.map, normalMap: pave.normalMap });
  pave.map.repeat.set(12.5, 12.5); pave.normalMap.repeat.set(12.5, 12.5);
  const lineMat = mat({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  grassDetail.normalMap.repeat.set(8, 8); // Halme als Relief, gleich fein wie das Bild
  const grassMat = mat({ color: 0x5f9a45, map: grassDetail.map, normalMap: grassDetail.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 1 });
  grassDetail.map.repeat.set(8, 8);

  // Gelände rundherum: in der Stadt flach, draussen Hügel
  const natural = (x, z) => smoothstep(HALF + 90, HALF + 500, Math.max(Math.abs(x), Math.abs(z))) * NZ.fbm(x / 260, z / 260, 4) * 190 - 0.06;
  // Die Insel: die Küste wird um alles gelegt, was es gibt (island.js); das Gelände fällt dort zum Meer ab
  const isle = [];
  for (let s = 0; s <= HW_LEN; s += 25) { const p = hwPoint(s); for (const l of [-30, 30]) isle.push([p.x - p.tz * l, p.z + p.tx * l]); }
  for (const p of passPoints()) for (const [ox, oz] of [[-25, 0], [25, 0], [0, -25], [0, 25]]) isle.push([p.x + ox, p.z + oz]);
  const boxPts = (b, m = 30) => { for (const [x, z] of [[b.x0 - m, b.z0 - m], [b.x1 + m, b.z0 - m], [b.x0 - m, b.z1 + m], [b.x1 + m, b.z1 + m], [(b.x0 + b.x1) / 2, b.z0 - m], [(b.x0 + b.x1) / 2, b.z1 + m], [b.x0 - m, (b.z0 + b.z1) / 2], [b.x1 + m, (b.z0 + b.z1) / 2]]) isle.push([x, z]); };
  for (const A of Object.values(AREAS)) { boxPts(A.rect); boxPts(A.road); }
  boxPts({ x0: REST.x - REST.half - 40, x1: REST.x + REST.half + 40, z0: REST.z - 30, z1: REST.z + 250 });
  boxPts(FARM, 60); boxPts({ x0: -HALF - 80, x1: HALF + 80, z0: -HALF - 80, z1: HALF + 80 }, 0);
  for (const S2 of SUBURBS) boxPts(S2.rect, 40);
  for (let a = 0; a < 6.3; a += 0.2) { isle.push([SKI.x + Math.cos(a) * (SKI.r + 60), SKI.z + Math.sin(a) * (SKI.r + 60)]); isle.push([SPACE.x + Math.cos(a) * 90, SPACE.z + Math.sin(a) * 90]); }
  boxPts({ x0: -702, x1: -HALF, z0: -700, z1: -150 }, 10); // Strand und Promenade (die Bucht liegt westlich davon)
  setIsland(isle);
  const SEABED = -9;
  const height = (x, z) => { // Land; an der Küste geht es hinunter ins Meer (bei Hügeln als Klippe)
    const h = heightLand(x, z), d = islandDist(x, z);
    if (d > 22) return h;
    const bed = SEABED - 22 * smoothstep(-60, -260, d); // weiter draussen tiefer (dunkel wie der Meeresgrund überall)
    return bed + (h - bed) * smoothstep(-45, 22, d);
  };
  const heightLand = (x, z) => {
    const rr = Math.max(Math.abs(x), Math.abs(z));
    if (rr <= HALF + 60) return -0.06;
    if (inPassRegion(x, z)) return passTerrain(x, z, natural(x, z), 15); // am Berg: das feinere Gelände liegt darüber
    let gs = groundShape(x, z); const cd = Math.min(countryDist(x, z), suburbDist(x, z), serviceDist(x, z)); if (cd < gs.d) gs = { d: cd, y: 0 }; // auch Bauernhof, Strand, Vororte und Tankstellen eben
    const f = smoothstep(24, 100, gs.d); // unter Autobahn, Hafen und Flughafen eben (Hafenbecken tiefer); breiter
    // ebener Rand, sonst ragt das grobe Gelände (20-m-Raster) über die äusserste Spur
    return smoothstep(HALF + 90, HALF + 500, rr) * NZ.fbm(x / 260, z / 260, 4) * 190 * f * skiFade(x, z) + gs.y * (1 - f) + skiH(x, z) - 0.06; // + Schneeberg
  };
  const C = h => new THREE.Color(h), gA = C(0x5e9142), gB = C(0x4a7c35), gC = C(0x8db84f), rock = C(0x857b70), snowC = C(0xf1f5f9), sandC = C(0xe9d8a6), bedC = C(0x6f9f9a), deepC = C(0x0f3552);
  const landColor = (x, z, y, steep, c) => {
    c.lerpColors(gA, gB, NZ.fbm(x / 80, z / 80, 3)); c.lerp(gC, smoothstep(0.5, 0.8, NZ.fbm(x / 37 + 5, z / 37, 2)) * 0.55); c.lerp(rock, smoothstep(0.2, 0.4, steep)); c.lerp(snowC, smoothstep(1, 10, skiH(x, z)) * 0.95);
    const d = islandDist(x, z); if (d < 40 && y < 5) c.lerp(sandC, smoothstep(40, 14, d) * smoothstep(5, 1, y)); // Sandstrand (nicht an Klippen)
    if (y < SEA_Y) { c.lerp(bedC, smoothstep(SEA_Y, SEA_Y - 6, y)); c.lerp(deepC, smoothstep(SEA_Y - 8, SEA_Y - 26, y)); } // Meeresboden: flach hell, tief dunkel
  };
  // Gelände in zwei grossen Stücken (20-m-Raster wie groundAt): Insel mit Küste und Meeresboden rundherum
  const land = terrain({ size: 3400, segments: 170, center: [0, 0], height, detail: grassDetail, detailRepeat: 400, color: landColor });
  land.material.normalScale.set(0.9, 0.9); // Wiesen mit sichtbaren Halmen (plastischer)
  scene.add(land);
  // Süden: ein zweites Stück Gelände für die lange Autobahn und die Raststätte (gleiches Material, gleiches Raster)
  const landS = terrain({ size: 3400, segments: 170, center: [0, 3400], height, detail: grassDetail, detailRepeat: 400, color: landColor });
  landS.material.dispose(); landS.material = land.material;
  scene.add(landS);
  // Meer bis zum Horizont (der Dunst verdeckt den Rand)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2),
    mat({ color: 0x1f6fa8, metalness: 0.35, roughness: 0.12, transparent: true, opacity: 0.86, envMapIntensity: 1.2 }));
  sea.position.set(ISLAND_C.x, SEA_Y, ISLAND_C.z); sea.renderOrder = -1; scene.add(sea); // nicht am Ursprung: wird nicht verbogen
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), mat({ color: 0x0f3552, roughness: 1 })); // gleich beleuchtet wie das Gelände
  deep.position.set(ISLAND_C.x, -31.5, ISLAND_C.z); scene.add(deep); // tiefer Meeresgrund überall (unter dem Gelände-Netz)

  // Strassen, Kreuzungen, Mittellinien, Haltelinien, Zebrastreifen
  const roads = quads(1 / 8), lines = quads();
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = node(i), z = node(j);
    if (!nodeSegs(i, j)) continue; // mitten im Grünen: keine Kreuzung
    roads.rect(x, z, ROAD, ROAD, 0.02);
    const goX = i < N && !isPed(i, j, 0), goZ = j < N && !isPed(i, j, 1); // Fussgängerzone: keine Strasse
    if (goX) roads.add(x + ROAD / 2, z - ROAD / 2, node(i + 1) - ROAD / 2, z + ROAD / 2, 0.02);
    if (goZ) roads.add(x - ROAD / 2, z + ROAD / 2, x + ROAD / 2, node(j + 1) - ROAD / 2, 0.02);
    for (let s = 12; s < BLOCK - 12; s += 6) { // gestrichelte Mittellinie
      if (goX) lines.add(x + s, z - 0.08, x + s + 3, z + 0.08, 0.03);
      if (goZ) lines.add(x - 0.08, z + s, x + 0.08, z + s + 3, 0.03);
    }
    if (!hasLights(i, j)) continue;
    for (let d = 0; d < 4; d++) { // jede Zufahrt: Haltelinie auf der rechten Spur und Zebrastreifen
      const [fx, fz] = DIRS[d];
      if (!inGrid(i - fx, j - fz) || isPed(i - fx, j - fz, d)) continue;
      const rx = -fz, rz = fx;
      const sl = 11.5, ax = fx !== 0;
      lines.rect(x - fx * sl + rx * LANE, z - fz * sl + rz * LANE, ax ? 0.45 : 6.6, ax ? 6.6 : 0.45, 0.03);
      for (let k = 0; k < 6; k++) {
        const o = -6 + k * 2.4 + 0.6;
        lines.rect(x - fx * 8.8 + rx * o, z - fz * 8.8 + rz * o, ax ? 3 : 1.2, ax ? 1.2 : 3, 0.03);
      }
    }
  }
  decor.add(roads.mesh(asphaltMat), lines.mesh(lineMat));

  // Blöcke: Trottoir-Platte, darauf Häuser, ein Park oder der Brunnen-Platz
  const walls = [['#d9c7a7', '#6b5a45'], ['#b0544a', '#f1e7da'], ['#9aa3ad', '#3b4350'], ['#e9e4d8', '#7a6a55'], ['#3c5a78', '#c7d6e6'], ['#c9a46a', '#4b3b2a']]
    .map(([wall, frame]) => facadeMat(facade(wall, frame, r), 1));
  // moderne Fassaden (eigener Zufall): Fensterbänder, Glasfassaden, bunte Paneele – kommen hinten dazu (die ersten 6 brauchen die Spezialhäuser)
  [['#f4f4f5', '#3f4652', 'ribbon'], ['#fde7c8', '#475569', 'ribbon'], ['#dbe7f0', '#5b6b7c', 'curtain'], ['#d8f0ea', '#2f5f57', 'curtain'],
    ['#f1f5f9', '#334155', 'panel'], ['#fef3c7', '#57534e', 'panel']].forEach(([wall, frame, st], k) => walls.push(facadeMat(facade(wall, frame, rng(900 + k), st), 1.2)));
  const roofMat = mat({ color: 0x4b4f57, roughness: 0.9 }), metal = mat({ color: 0x9aa0aa, metalness: 0.6, roughness: 0.4 });
  const plaza = (N >> 1) + ',' + (N >> 1);
  const parks = new Set(); // zwölf Parks, über die Stadt verteilt (Luft zwischen den Häusern)
  while (parks.size < 12) { const k = Math.floor(r() * N) + ',' + Math.floor(r() * N); if (k !== plaza && !SPECIAL[k] && baseOf(k) < 0 && !MASK.has(k)) parks.add(k); }
  const places = { bases: [], services: [] }; // Tankstelle, Waschanlage, Pizzeria: Mitte des Blocks; Basen
  // Schild mit Schrift (beidseitig lesbar)
  const sign = (text, bg, fg, w = 8, h = 1.6) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = 'bold ' + Math.round(c.height * 0.55) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2, c.width - 20);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  };
  const box = (w, h, d, m, x, y, z, solidToo, parent = decor) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b);
    if (solidToo) solid.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: y + h / 2 });
    return b;
  };
  const tarmac = mat({ map: asphalt.map, roughness: 0.85 });
  for (const SV of SERVICES) places.services.push(buildService(decor, SV, { sign, solid, round, y: 0 })); // draussen an den Autobahn-Ausfahrten
  function buildGas(cx, cz) { // Tankstelle: Dach auf vier Säulen, zwei Zapfsäulen, Shop dahinter
    box(40, 0.04, 30, tarmac, cx, 0.18, cz - 4);
    box(22, 0.7, 14, mat({ color: 0xf8fafc }), cx, 5.6, cz - 6);
    box(22.2, 0.5, 14.2, mat({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.25 }), cx, 5.05, cz - 6);
    for (const [dx, dz] of [[-10, -12.5], [10, -12.5], [-10, 0.5], [10, 0.5]]) { box(0.6, 5.2, 0.6, metal, cx + dx, 2.7, cz + dz); round.push({ x: cx + dx, z: cz + dz, r: 0.5 }); }
    for (const dx of [-4, 4]) { box(1.1, 1.8, 0.7, mat({ color: 0xdc2626 }), cx + dx, 1.06, cz - 6, true); box(0.8, 0.5, 0.05, mat({ color: 0x111827, emissive: 0x22d3ee, emissiveIntensity: 0.6 }), cx + dx, 1.5, cz - 6.38); }
    const shop = wallBox(16, 4.5, 8, walls[3], 8); shop.position.set(cx, 2.41, cz + 13); decor.add(shop);
    solid.push({ x0: cx - 8, x1: cx + 8, z0: cz + 9, z1: cz + 17, h: 5 });
    const s1 = sign('⛽ TANKSTELLE', '#dc2626', '#ffffff', 12, 2); s1.position.set(cx, 6.6, cz - 13.2); decor.add(s1);
    places.gas = { x: cx, z: cz - 6, w: 18, d: 10 };
    const green = mat({ color: 0x16a34a }), screen = mat({ color: 0x0b1a10, emissive: 0x22c55e, emissiveIntensity: 0.8 }); // Ladesäulen für Elektroautos
    for (const dz of [-10, -2]) { box(0.7, 1.7, 0.45, green, cx + 17, 1.03, cz + dz, true); box(0.05, 0.4, 0.3, screen, cx + 16.63, 1.4, cz + dz); }
    for (const side of [1, -1]) { // von beiden Seiten lesbar
      const s2 = sign('⚡ LADEN', '#16a34a', '#ffffff', 5, 1.2); s2.position.set(cx + 17 + side * 0.03, 2.6, cz - 6); s2.rotation.y = side * Math.PI / 2; decor.add(s2);
    }
    places.charge = { x: cx + 14.5, z: cz - 6, w: 5, d: 14 };
    places.gasShop = { x: cx, z: cz + 6.5, w: 10, d: 4.5 }; // vor dem Shop anhalten: Snacks
    for (const side of [0, 1]) { const s3 = sign('🛒 SHOP · SNACKS', '#f59e0b', '#111827', 7, 1.2); s3.position.set(cx, 5.4, cz + 8.9 - side * 0.05); s3.rotation.y = side ? Math.PI : 0; decor.add(s3); }
  }
  function buildWash(cx, cz) { // Waschanlage: Tunnel mit drehenden Bürsten, man fährt der Länge nach durch
    box(44, 0.04, 14, tarmac, cx, 0.18, cz);
    const wallM = mat({ color: 0x38bdf8 }), roofM = mat({ color: 0xe0f2fe });
    for (const dz of [-4.6, 4.6]) box(16, 5, 0.5, wallM, cx, 2.66, cz + dz, true);
    box(16.4, 0.5, 9.8, roofM, cx, 5.4, cz);
    const brushes = [];
    const brushM = mat({ color: 0x2563eb, roughness: 1 }), brushM2 = mat({ color: 0xf472b6, roughness: 1 });
    for (const [dx, dz, m] of [[-3, -3.2, brushM], [-3, 3.2, brushM], [3, -3.2, brushM2], [3, 3.2, brushM2]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.2, 10, 1, false), m);
      b.position.set(cx + dx, 2.4, cz + dz); b.castShadow = true;
      b.userData.brush = true; // dreht sich (bleibt einzeln, nicht zusammengefasst)
      scene.add(b); brushes.push(b);
    }
    const s1 = sign('🫧 WASCHANLAGE', '#0ea5e9', '#ffffff', 12, 2); s1.position.set(cx, 6.7, cz - 4.9); decor.add(s1);
    const s2 = sign('🫧 WASCHANLAGE', '#0ea5e9', '#ffffff', 12, 2); s2.position.set(cx, 6.7, cz + 4.9); decor.add(s2);
    places.wash = { x: cx, z: cz, w: 16, d: 8, brushes };
    // Lackiererei hinter der Waschanlage: anhalten = neue Farbe aussuchen
    box(8, 0.05, 10, mat({ color: 0xe5e7eb, roughness: 0.6 }), cx + 16, 0.21, cz);
    for (const [k, c] of [[-3, 0xef4444], [-1, 0xfacc15], [1, 0x22c55e], [3, 0x3b82f6]]) box(0.8, 0.8, 0.8, mat({ color: c }), cx + 21, 0.6, cz + k); // Farbkübel
    for (const side of [0, 1]) { const s3 = sign('🎨 LACKIEREN', '#7c3aed', '#ffffff', 6, 1.2); s3.position.set(cx + 16, 4, cz - 5.2 - side * 0.05); s3.rotation.y = side ? Math.PI : 0; decor.add(s3); }
    places.paint = { x: cx + 16, z: cz, w: 8, d: 10 };
  }
  function buildPizza(cx, cz) { // Pizzeria mit gestreifter Markise; abgeholt wird vorne an der Strasse
    const shop = wallBox(18, 6, 12, walls[1], 8); shop.position.set(cx, 3.16, cz + 4); decor.add(shop);
    solid.push({ x0: cx - 9, x1: cx + 9, z0: cz - 2, z1: cz + 10, h: 6.5 });
    const st = document.createElement('canvas'); st.width = 128; st.height = 8;
    const sg = st.getContext('2d'); for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#ffffff' : '#16a34a'; sg.fillRect(i * 16, 0, 16, 8); }
    const awn = new THREE.Mesh(new THREE.BoxGeometry(18, 0.2, 3), mat({ map: new THREE.CanvasTexture(st) }));
    awn.position.set(cx, 3.6, cz - 3.4); awn.rotation.x = -0.3; decor.add(awn);
    const s1 = sign('🍕 PIZZERIA', '#b91c1c', '#ffffff', 10, 1.8); s1.position.set(cx, 5.2, cz - 2.06); decor.add(s1);
    places.pizza = { x: cx, z: cz - 2, front: { x: cx, z: cz - 32 + LANE } }; // rechte Spur der Strasse davor
  }
  function buildJail(cx, cz) { // Gefängnis: Hof mit hohen Mauern, vorne Gitter, Stacheldraht, Wachturm, Zellenhaus dahinter
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const wallM = mat({ color: 0x9ca3af, roughness: 0.9 }), barM = mat({ color: 0x3f444c, metalness: 0.7, roughness: 0.35 });
    const yx = cx, yz = cz - 4, h = 11; // Hof: 22 × 22 m, vorne (−z) zur Strasse
    for (const s of [-1, 1]) box(0.8, 4.4, 2 * h + 0.8, wallM, yx + s * h, 2.38, yz, true); // Seitenmauern
    box(2 * h + 0.8, 4.4, 0.8, wallM, yx, 2.38, yz + h, true); // hinten
    for (let x = -h; x <= h + 0.01; x += 0.55) { // vorne: Gitterstäbe
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), barM);
      b.position.set(yx + x, 2.38, yz - h); decor.add(b);
    }
    for (const y of [0.6, 2.4, 4.4]) box(2 * h, 0.12, 0.12, barM, yx, y, yz - h);
    solid.push({ x0: yx - h, x1: yx + h, z0: yz - h - 0.3, z1: yz - h + 0.3, h: 4.6 });
    for (const [x0, z0, x1, z1] of [[-h, -h, -h, h], [h, -h, h, h], [-h, h, h, h], [-h, -h, h, -h]]) { // Stacheldraht oben
      const len = Math.hypot(x1 - x0, z1 - z0), wire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 8, 1, true), mat({ color: 0x6b7280, metalness: 0.8, roughness: 0.4, wireframe: true }));
      wire.rotation.set(z1 !== z0 ? Math.PI / 2 : 0, 0, x1 !== x0 ? Math.PI / 2 : 0);
      wire.position.set(yx + (x0 + x1) / 2, 4.8, yz + (z0 + z1) / 2); decor.add(wire);
    }
    const house = wallBox(30, 7, 8, walls[2], 8); house.position.set(cx, 3.66, cz + 15); decor.add(house); // Zellenhaus
    solid.push({ x0: cx - 15, x1: cx + 15, z0: cz + 11, z1: cz + 19, h: 7.5 });
    box(1.2, 9, 1.2, wallM, yx - h - 2.5, 4.68, yz - h - 1, true); // Wachturm mit Hütte und Scheinwerfer
    box(3.4, 2.2, 3.4, mat({ color: 0x4b5563 }), yx - h - 2.5, 10.2, yz - h - 1);
    box(3.8, 0.3, 3.8, mat({ color: 0x1f2937 }), yx - h - 2.5, 11.45, yz - h - 1);
    box(0.6, 0.4, 0.6, mat({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 1.5 }), yx - h - 1, 9.6, yz - h - 1);
    for (const side of [0, 1]) { // Schild: von der Strasse und vom Hof aus lesbar
      const s1 = sign('🔒 GEFÄNGNIS', '#1f2937', '#fb923c', 12, 2);
      s1.position.set(yx, 6.2, yz - h - 0.2 - side * 0.06); s1.rotation.y = side * Math.PI; decor.add(s1);
    }
    places.jail = { x: yx, z: yz, half: h - 2.5, gate: { x: yx, z: cz - BLOCK / 2 + LANE, h: 0 } }; // raus: rechte Spur der Strasse davor
  }
  function buildWorkshop(cx, cz) { // Werkstatt (offene Halle mit Hebebühne) und davor ein Parkplatz zum Einparken
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const wallM = mat({ color: 0xe5e7eb, roughness: 0.8 }), blue = mat({ color: 0x1d4ed8 }), hz = cz + 11; // Halle: offen nach −z
    for (const s of [-1, 1]) box(0.6, 6, 14, wallM, cx + s * 8, 3.18, hz, true);
    box(16.6, 0.6, 14, blue, cx, 6.4, hz);
    box(16, 6, 0.6, wallM, cx, 3.18, hz + 7, true);
    box(4, 0.25, 6, mat({ color: 0xfacc15, metalness: 0.4 }), cx, 0.32, hz - 1); // Hebebühne
    for (const s of [-1, 1]) box(0.3, 2.4, 0.3, mat({ color: 0x9ca3af, metalness: 0.6 }), cx + s * 2.6, 1.38, hz - 1, true);
    box(1.6, 1.1, 0.6, mat({ color: 0xdc2626 }), cx - 6.5, 0.73, hz + 5.6, true); // Werkzeugwagen
    for (const side of [0, 1]) {
      const s1 = sign('🔧 WERKSTATT', '#1d4ed8', '#ffffff', 12, 2); s1.position.set(cx, 7.8, hz - 7 - side * 0.05); s1.rotation.y = side * Math.PI; decor.add(s1);
    }
    places.repair = { x: cx, z: hz - 1, w: 10, d: 10 };
    // Parkplatz: acht Felder quer, Einfahrt von der Strasse (−z)
    const marks = quads(), bays = [], bz = cz - 12;
    for (let k = 0; k <= 8; k++) marks.rect(cx - 13.2 + k * 3.3, bz, 0.15, 5.6, 0.2);
    marks.rect(cx, bz + 2.8, 26.4, 0.15, 0.2);
    decor.add(marks.mesh(lineMat));
    for (let k = 0; k < 8; k++) bays.push({ x: cx - 13.2 + 1.65 + k * 3.3, z: bz, h: Math.PI / 2 }); // vorwärts hinein: Schnauze nach +z
    places.lot = { bays };
    // Tuning: Platz neben der Halle mit Reifenstapeln und Werkzeug
    box(8, 0.05, 10, mat({ color: 0x334155, roughness: 0.7 }), cx - 16, 0.21, cz + 11);
    const tire = mat({ color: 0x111827, roughness: 0.9 });
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.2, 8, 16).rotateX(Math.PI / 2), tire); t.position.set(cx - 20.6, 0.4 + k * 0.4, cz + 7); decor.add(t); }
    for (const side of [0, 1]) { const s3 = sign('🔧 TUNING', '#111827', '#facc15', 6, 1.2); s3.position.set(cx - 16, 4, cz + 5.8 - side * 0.05); s3.rotation.y = side ? Math.PI : 0; decor.add(s3); }
    places.tuning = { x: cx - 16, z: cz + 11, w: 8, d: 10 };
  }
  // Blaue Zone: Parkplatz mit blauen Feldern (Reihe A vorne mit Einfahrt in der Mitte, Reihe B hinten), Schild und
  // Anzeige „frei / besetzt“. Die Autos kommen aus dem Verkehr auf der Strasse davor (stepLot) und fahren wieder dorthin.
  function buildBlue(cx, cz, bi, bj) {
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const blue = mat({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.25, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const marks = quads(), slots = [];
    for (const o of [-19.8, -16.5, -13.2, -9.9, -6.6, -3.3, 3.3, 6.6, 9.9, 13.2, 16.5, 19.8]) marks.rect(cx + o, cz - 12, 0.15, 5.6, 0.21);
    for (const sx of [-1, 1]) marks.rect(cx + sx * 11.55, cz - 14.8, 16.5, 0.15, 0.21);
    for (let k = 0; k <= 12; k++) marks.rect(cx - 19.8 + k * 3.3, cz + 12, 0.15, 5.6, 0.21);
    marks.rect(cx, cz + 14.8, 39.6, 0.15, 0.21);
    for (const o of [-18.15, -14.85, -11.55, -8.25, -4.95, 4.95, 8.25, 11.55, 14.85, 18.15]) slots.push({ x: cx + o, z: cz - 12, h: -Math.PI / 2, car: null });
    for (let k = 0; k < 12; k++) slots.push({ x: cx - 18.15 + k * 3.3, z: cz + 12, h: Math.PI / 2, car: null });
    for (const q of slots) marks.rect(q.x, q.z, 1.2, 1.2, 0.205); // ein blaues Viereck in jedem Feld
    decor.add(marks.mesh(blue));
    // Schild am Eingang und Anzeige darunter
    const pole = mat({ color: 0x9ca3af, metalness: 0.5 });
    box(0.2, 4.6, 0.2, pole, cx + 6, 2.3, cz - 21);
    for (const side of [0, 1]) {
      const s1 = sign('🅿️ BLAUE ZONE', '#1d4ed8', '#ffffff', 5, 1.1); s1.position.set(cx + 6, 4.2, cz - 21.1 - side * 0.05); s1.rotation.y = side ? Math.PI : 0; decor.add(s1);
    }
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    disp.position.set(cx + 6, 2.8, cz - 21.15); disp.rotation.y = Math.PI; disp.userData.keep = true; scene.add(disp);
    places.blue = { cx, cz, slots, road: node(bj), seg: { i: bi, j: bj, d: 0 }, disp: { c, tex, last: -1 } };
  }
  // Eigenes Haus: Villa, Garage mit Tor (geht auf, wenn du kommst), Garten mit Zaun, Briefkasten (dort kaufen und
  // einrichten: HOUSE_ITEMS). Die Sachen stehen schon da und werden erst sichtbar, wenn sie gekauft sind.
  function buildHouse(cx, cz) {
    const lawn = quads(1 / 4); lawn.add(cx - 23, cz - 23, cx + 23, cz + 23, 0.17); decor.add(lawn.mesh(grassMat));
    box(12, 0.04, 12, tarmac, cx + 14, 0.2, cz - 17); // Einfahrt
    box(3, 0.04, 9, paveMat, cx - 8, 0.2, cz - 18.5); // Weg zur Haustür
    const wall = mat({ color: 0xf5efe0, roughness: 0.85 }), roofM = mat({ color: 0xa3402f, roughness: 0.8 }), win = mat({ color: 0x7fb2d9, metalness: 0.3, roughness: 0.2, emissive: 0xffd38a, emissiveIntensity: 0 });
    const white = mat({ color: 0xffffff }), wood = mat({ color: 0x8b5a2b }), grey = mat({ color: 0x9ca3af });
    // Villa: hohl zum Hineingehen (Wände, Boden, Decke), Tür vorne in der Mitte
    const X0 = cx - 20, X1 = cx + 4, Z0 = cz - 8, Z1 = cz + 8, T = 0.3, HH = 7, wy = 0.16 + HH / 2, dx0 = cx - 8;
    box(24, HH, T, wall, cx - 8, wy, Z1 - T / 2, true); // hinten
    box(T, HH, 16, wall, X0 + T / 2, wy, cz, true); box(T, HH, 16, wall, X1 - T / 2, wy, cz, true); // Seiten
    const dl = dx0 - 0.95 - X0, dr = X1 - (dx0 + 0.95);
    box(dl, HH, T, wall, X0 + dl / 2, wy, Z0 + T / 2, true); box(dr, HH, T, wall, X1 - dr / 2, wy, Z0 + T / 2, true); // vorne links und rechts der Tür
    box(1.9, HH - 2.75, T, wall, dx0, 2.91 + (HH - 2.75) / 2, Z0 + T / 2); // über der Tür
    const imat = (color, e = 0.28) => mat({ color, emissive: color, emissiveIntensity: e, roughness: 0.8 }); // drinnen etwas aufgehellt (kein Licht nötig)
    box(23.4, 0.15, 15.4, imat(0xfaf7f0, 0.5), cx - 8, 3.7, cz); // Decke
    box(23.4, 0.06, 15.4, imat(0xb07d4f, 0.22), cx - 8, 0.2, cz); // Holzboden
    const inW = imat(0xf3ece0, 0.4); // helle Wände innen
    box(23.3, 3.5, 0.04, inW, cx - 8, 1.95, Z1 - T - 0.02); box(0.04, 3.5, 15.3, inW, X0 + T + 0.02, 1.95, cz); box(0.04, 3.5, 15.3, inW, X1 - T - 0.02, 1.95, cz);
    box(dl - T, 3.5, 0.04, inW, X0 + T + (dl - T) / 2, 1.95, Z0 + T + 0.02); box(dr - T, 3.5, 0.04, inW, X1 - T - (dr - T) / 2, 1.95, Z0 + T + 0.02);
    for (const ddx of [-9, -4, 4, 9]) box(2.2, 1.6, 0.04, win, cx - 8 + ddx, 2.2, Z0 + T + 0.08); // Fenster auch von innen
    for (const ddx of [-9, -3, 3, 9]) box(2.2, 1.6, 0.04, win, cx - 8 + ddx, 2.2, Z1 - T - 0.08);
    // Einrichtung: Bett (hinten links), Wohnzimmer (Sofa, Fernseher), Esstisch, Küche (rechts)
    const fab = imat(0x3b82f6), sheet = imat(0xf8fafc, 0.35), dark = imat(0x1f2937, 0.15), woodI = imat(0x8b5a2b), sofaM = imat(0x9a3412, 0.25), green = imat(0x16a34a);
    const bed = { x: X0 + 3, z: Z1 - 2.6 };
    box(2.4, 0.45, 3.4, woodI, bed.x, 0.45, bed.z, true); box(2.4, 1.3, 0.2, woodI, bed.x, 0.85, Z1 - T - 0.1);
    box(2.2, 0.3, 3.2, sheet, bed.x, 0.82, bed.z); box(2.25, 0.14, 2, fab, bed.x, 1.0, bed.z - 0.55); box(1.6, 0.18, 0.55, sheet, bed.x, 1.05, bed.z + 1.15);
    box(0.7, 0.6, 0.6, woodI, bed.x + 1.8, 0.5, Z1 - T - 0.5); box(0.25, 0.3, 0.25, imat(0xfde68a, 1.2), bed.x + 1.8, 0.95, Z1 - T - 0.5); // Nachttisch mit Lampe
    box(3, 0.02, 2.2, imat(0xa21caf, 0.2), bed.x + 0.4, 0.24, bed.z - 2.8); // Teppich vor dem Bett
    box(4, 0.5, 1.2, sofaM, cx - 1, 0.5, Z1 - 1.6, true); box(4, 0.8, 0.3, sofaM, cx - 1, 1, Z1 - T - 0.6); for (const sx of [-1, 1]) box(0.3, 0.75, 1.2, sofaM, cx - 1 + sx * 2, 0.6, Z1 - 1.6);
    box(2, 0.4, 1, woodI, cx - 1, 0.45, Z1 - 4, true); box(5, 0.02, 3.5, imat(0x64748b, 0.2), cx - 1, 0.24, Z1 - 3.4); // Salontisch, Teppich
    box(2.6, 0.6, 0.5, dark, cx - 1, 0.5, Z0 + T + 1.2, true); box(2.4, 1.4, 0.08, imat(0x60a5fa, 0.9), cx - 1, 1.6, Z0 + T + 1.2); // Fernseher
    box(2.4, 0.1, 1.4, woodI, cx - 9, 0.95, cz + 0.5, true); for (const [ox, oz] of [[-0.8, -1.1], [0.8, -1.1], [-0.8, 1.1], [0.8, 1.1]]) box(0.5, 0.5, 0.5, woodI, cx - 9 + ox, 0.45, cz + 0.5 + oz); // Esstisch
    box(0.9, 0.95, 7, imat(0xe5e7eb, 0.3), X1 - T - 0.5, 0.65, cz + 1.5, true); box(0.92, 0.05, 7, dark, X1 - T - 0.5, 1.14, cz + 1.5); // Küche
    box(0.9, 2.2, 0.9, imat(0xf1f5f9, 0.3), X1 - T - 0.5, 1.3, Z0 + T + 1.5, true); box(0.7, 0.04, 0.7, dark, X1 - T - 0.5, 1.17, cz + 3.5); // Kühlschrank, Herd
    box(0.6, 1.2, 0.6, green, X0 + T + 0.6, 0.8, Z0 + T + 0.6); // Pflanze
    for (const [lx, lz] of [[cx - 15, cz], [cx - 8, cz], [cx - 1, cz]]) box(1, 0.06, 1, imat(0xfff7d6, 1.5), lx, 3.6, lz); // Deckenlampen
    box(1.6, 1, 0.05, imat(0xf59e0b, 0.5), cx - 9, 2.2, Z1 - T - 0.03); // Bild an der Wand
    // Haustür: dreht sich auf, wenn du davor stehst und das Haus dir gehört
    const hinge = new THREE.Group(); hinge.position.set(dx0 - 0.9, 0.2, Z0 + 0.15); decor.add(hinge); hinge.userData.keep = true;
    const fdoor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.7, 0.12), wood); fdoor.position.set(0.9, 1.35, 0); fdoor.castShadow = true; hinge.add(fdoor);
    const frontSolid = { x0: dx0 - 0.95, x1: dx0 + 0.95, z0: Z0 - 0.1, z1: Z0 + 0.4, h: 2.8 }; solid.push(frontSolid);
    const inside = { x0: X0 + T, x1: X1 - T, z0: Z0 + T, z1: Z1 - T };
    const roof = new THREE.Mesh(new THREE.ConeGeometry(15.5, 5, 4, 1), roofM); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.68);
    roof.position.set(cx - 8, 9.6, cz); roof.castShadow = true; decor.add(roof);
    for (const fl of [2.2, 5.4]) for (const dx of [-9, -4, 4, 9]) box(2.2, 1.6, 0.15, win, cx - 8 + dx, fl, cz - 8.05); // Fenster vorne
    for (const fl of [2.2, 5.4]) for (const dx of [-9, -3, 3, 9]) box(2.2, 1.6, 0.15, win, cx - 8 + dx, fl, cz + 8.05);
    // Garage: Wände, Dach, Tor (nach Norden)
    const gw = mat({ color: 0xe7e1d1 });
    box(0.4, 4, 14, gw, cx + 8, 2.2, cz - 5, true); box(0.4, 4, 14, gw, cx + 20, 2.2, cz - 5, true); box(12.4, 4, 0.4, gw, cx + 14, 2.2, cz + 2, true);
    box(12.8, 0.4, 14.6, roofM, cx + 14, 4.4, cz - 5);
    box(11.6, 0.05, 13.6, mat({ color: 0x6b7280 }), cx + 14, 0.21, cz - 5); // Boden
    const door = box(11.6, 3.8, 0.2, mat({ color: 0xf8fafc, roughness: 0.5 }), cx + 14, 2.1, cz - 12);
    const doorSolid = { x0: cx + 8.2, x1: cx + 19.8, z0: cz - 12.2, z1: cz - 11.8, h: 4 };
    solid.push(doorSolid);
    // Zaun (mit Lücken für Einfahrt und Weg), Briefkasten
    const fence = quads();
    const post = (x, z) => fence.add(x - 0.08, z - 0.08, x + 0.08, z + 0.08, 0.95);
    for (let k = -23; k <= 23; k += 2) { post(cx + k, cz + 23); post(cx - 23, cz + k); post(cx + 23, cz + k); if (k < -10 || (k > -6 && k < 7)) post(cx + k, cz - 23); }
    decor.add(fence.mesh(white));
    for (const [x0, x1] of [[-23, -10], [-6, 7]]) box(x1 - x0, 0.12, 0.08, white, cx + (x0 + x1) / 2, 0.75, cz - 23);
    box(0.08, 0.12, 46, white, cx - 23, 0.75, cz); box(0.08, 0.12, 46, white, cx + 23, 0.75, cz); box(46, 0.12, 0.08, white, cx, 0.75, cz + 23);
    box(0.12, 1.1, 0.12, grey, cx - 2, 0.7, cz - 21.5); box(0.6, 0.45, 0.8, mat({ color: 0xdc2626 }), cx - 2, 1.4, cz - 21.5);
    const forSale = sign('🏡 ZU VERKAUFEN · ' + HOUSE_PRICE + ' 🪙', '#16a34a', '#ffffff', 7, 1.3), mine = sign('🏡 MEIN HAUS', '#1d4ed8', '#ffffff', 6, 1.3);
    for (const sg of [forSale, mine]) { sg.position.set(cx - 2, 2.6, cz - 21.6); sg.rotation.y = Math.PI; decor.add(sg); sg.userData.keep = true; }
    // Sachen zum Kaufen (erst unsichtbar)
    const items = {}, G = id => { const g = new THREE.Group(); g.visible = false; g.userData.keep = true; scene.add(g); items[id] = g; return g; };
    const part = (g, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    let g = G('pool'); part(g, new THREE.BoxGeometry(12, 0.3, 7), white, cx - 12, 0.3, cz + 15.5); part(g, new THREE.BoxGeometry(11, 0.1, 6), mat({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.3, roughness: 0.1 }), cx - 12, 0.42, cz + 15.5);
    g = G('trampoline'); part(g, new THREE.CylinderGeometry(2.4, 2.4, 0.12, 24), mat({ color: 0x2563eb }), cx + 14, 1, cz + 15); part(g, new THREE.CylinderGeometry(2.1, 2.1, 0.14, 24), mat({ color: 0x111827 }), cx + 14, 1.02, cz + 15);
    for (let k = 0; k < 4; k++) part(g, new THREE.CylinderGeometry(0.06, 0.06, 1, 6), grey, cx + 14 + Math.cos(k * 1.57) * 2.2, 0.5, cz + 15 + Math.sin(k * 1.57) * 2.2);
    g = G('grill'); part(g, new THREE.BoxGeometry(1.4, 0.9, 0.8), mat({ color: 0x1f2937 }), cx + 2, 0.7, cz + 12); part(g, new THREE.CylinderGeometry(0.1, 0.1, 1, 8), grey, cx + 2.5, 1.6, cz + 12);
    part(g, new THREE.BoxGeometry(2.4, 0.1, 1.2), wood, cx + 5, 0.9, cz + 14); for (const sx of [-1, 1]) part(g, new THREE.BoxGeometry(0.1, 0.8, 1), wood, cx + 5 + sx, 0.5, cz + 14);
    g = G('solar'); for (const dx of [-6, 0, 6]) { const o = part(g, new THREE.BoxGeometry(4.5, 0.1, 3), mat({ color: 0x1e3a8a, metalness: 0.5, roughness: 0.2 }), cx - 8 + dx, 9.3, cz - 3.2); o.rotation.x = -0.55; }
    g = G('dog'); part(g, new THREE.BoxGeometry(2, 1.4, 1.6), wood, cx - 19, 0.9, cz - 16); part(g, new THREE.BoxGeometry(2.3, 0.2, 1.9), roofM, cx - 19, 1.7, cz - 16);
    const fur = mat({ color: 0xb7793e }); part(g, new THREE.BoxGeometry(0.9, 0.45, 0.4), fur, cx - 17, 0.6, cz - 18); part(g, new THREE.SphereGeometry(0.25, 10, 8), fur, cx - 16.45, 0.85, cz - 18);
    for (const [ox, oz] of [[-0.3, -0.12], [-0.3, 0.12], [0.3, -0.12], [0.3, 0.12]]) part(g, new THREE.BoxGeometry(0.1, 0.4, 0.1), fur, cx - 17 + ox, 0.35, cz - 18 + oz);
    g = G('fountain'); part(g, new THREE.CylinderGeometry(1.8, 2, 0.6, 20), grey, cx - 4, 0.47, cz - 15); part(g, new THREE.CylinderGeometry(0.25, 0.3, 1.6, 10), grey, cx - 4, 1.2, cz - 15);
    part(g, new THREE.CylinderGeometry(1.6, 1.6, 0.1, 20), mat({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.3 }), cx - 4, 0.75, cz - 15);
    g = G('flowers'); const petals = [0xf43f5e, 0xfacc15, 0xa855f7, 0xffffff, 0xfb923c];
    for (let k = 0; k < 40; k++) part(g, new THREE.SphereGeometry(0.22, 6, 5), mat({ color: petals[k % 5] }), cx - 21 + (k % 10) * 1.2, 0.4, cz - 10 + Math.floor(k / 10) * 1.2 + (k % 2) * 0.3);
    g = G('lights'); const bulbs = [0xfde047, 0xf87171, 0x60a5fa, 0x4ade80];
    for (let k = 0; k <= 46; k += 1.5) for (const [x, z] of [[cx - 23 + k, cz + 23], [cx - 23, cz - 23 + k], [cx + 23, cz - 23 + k]])
      part(g, new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: bulbs[Math.floor(k / 1.5) % 4] }), x, 1.15, z);
    places.house = { x: cx, z: cz, box: { x: cx + 14, z: cz - 5, w: 10, d: 12 }, mailbox: { x: cx - 2, z: cz - 20, w: 6, d: 5 }, door, doorSolid, open: 0, items, forSale, mine, win,
      hinge, frontSolid, fopen: 0, inside, bed, front: { x: dx0, z: Z0 } };
  }
  // Parkhaus: Erdgeschoss + 3 Ebenen (alle 3,5 m), Rampen übereinander rechts hinten (fahren nach Süden hinauf),
  // Einfahrt im Süden. Höhe und Ebene rechnet parkY/parkStep (die Rampe wählt man durch Hineinfahren).
  function buildPark(cx, cz) {
    const LV = PK_LV, F = { x0: cx - 23, x1: cx + 23, z0: cz - 23, z1: cz + 23 }, RS = { x0: cx + 14, x1: cx + 22, z0: cz - 15, z1: cz + 15 };
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const conc = mat({ color: 0xb8bcc2, roughness: 0.9 }), dark = mat({ color: 0x6b7280, roughness: 0.9 }), yel = mat({ color: 0xfacc15 });
    const lineM = mat({ color: 0xf8fafc, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let L = 1; L <= 3; L++) { // Decks (mit Loch für die Rampen)
      const y = L * LV - 0.15;
      box(37, 0.3, 46, conc, cx - 4.5, y, cz);
      for (const zz of [cz - 19, cz + 19]) box(9, 0.3, 8, conc, cx + 18.5, y, zz);
      for (const [x0, x1, z0, z1] of [[F.x0, F.x1, F.z0, F.z0 + 0.4], [F.x0, F.x1, F.z1 - 0.4, F.z1], [F.x0, F.x0 + 0.4, F.z0, F.z1], [F.x1 - 0.4, F.x1, F.z0, F.z1]])
        box(x1 - x0, 1, z1 - z0, conc, (x0 + x1) / 2, L * LV + 0.5, (z0 + z1) / 2); // Brüstung
      box(0.3, 0.3, 26, yel, RS.x0 - 0.2, L * LV + 0.15, cz); // gelbe Kante zur Rampe
      for (let k = 0; k < 7; k++) box(0.12, 0.02, 5, lineM, cx - 20 + k * 3, L * LV + 0.02, cz - 15); // Parkfelder
      box(30, 0.08, 0.6, mat({ color: 0xfff7d6, emissive: 0xfff7d6, emissiveIntensity: 0.9 }), cx - 6, L * LV - 0.32, cz); // Licht unter dem Deck
    }
    const rl = Math.hypot(30, LV), ra = Math.atan2(LV, 30);
    for (let r = 0; r <= 2; r++) { const m = box(8, 0.3, rl, dark, cx + 18, (r + 0.5) * LV - 0.1, cz); m.rotation.x = -ra; }
    for (const [x, z] of [[cx - 14, cz - 10], [cx - 14, cz + 10], [cx + 1, cz - 10], [cx + 1, cz + 10], [cx + 13, cz - 19], [cx + 13, cz + 19]]) {
      box(0.8, 3 * LV, 0.8, conc, x, 1.5 * LV, z); round.push({ x, z, r: 0.5, h: 3 * LV + 1 });
    }
    // Wände unten (Süden mit Einfahrt in der Mitte)
    box(46, 3.2, 0.4, conc, cx, 1.8, F.z0 + 0.2, true); box(0.4, 3.2, 46, conc, F.x0 + 0.2, 1.8, cz, true); box(0.4, 3.2, 46, conc, F.x1 - 0.2, 1.8, cz, true);
    box(15, 3.2, 0.4, conc, cx - 15.5, 1.8, F.z1 - 0.2, true); box(15, 3.2, 0.4, conc, cx + 15.5, 1.8, F.z1 - 0.2, true);
    for (const side of [0, 1]) { const s1 = sign('🅿️ PARKHAUS · Rampe hinten rechts', '#1d4ed8', '#ffffff', 10, 1.4); s1.position.set(cx, 4.3, F.z1 + 0.3 + side * 0.05); s1.rotation.y = side ? Math.PI : 0; decor.add(s1); }
    for (let L = 1; L <= 3; L++) { const sg = sign(L === 3 ? '🌇 DACH' : 'Ebene ' + L, '#1d4ed8', '#ffffff', 2.6, 0.8); sg.position.set(cx + 13, L * LV + 2, cz + 18.5); sg.rotation.y = -Math.PI / 2; decor.add(sg); }
    // Parkierte Autos auf jeder Ebene (fest auf ihrer Ebene, siehe parkBlocked)
    const parked = [];
    for (let L = 0; L <= 3; L++) for (const k of [0, 3, 5]) if ((L + k) % 2 === 0 || L === 0) parked.push({ x: cx - 18.5 + k * 3, z: cz - 15, L, h: Math.PI / 2 });
    places.park = { F, RS, parked, cx, cz };
  }
  // Drive-in: Burger-Restaurant, Spur rechts am Haus entlang (von Norden): beim Lautsprecher bestellen, am Fenster abholen
  function buildDrive(cx, cz) {
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const wallM = mat({ color: 0xfde68a }), red = mat({ color: 0xdc2626 }), dark = mat({ color: 0x1f2937 });
    const shop = wallBox(16, 5, 12, walls[1], 8); shop.position.set(cx - 6, 2.66, cz + 2); decor.add(shop);
    solid.push({ x0: cx - 14, x1: cx + 2, z0: cz - 4, z1: cz + 8, h: 6 });
    box(16.6, 0.6, 12.6, red, cx - 6, 5.45, cz + 2);
    // Riesenburger auf dem Dach
    const bun = mat({ color: 0xd97706 }), patty = mat({ color: 0x5b2c0f }), cheese = mat({ color: 0xfacc15 }), salad = mat({ color: 0x22c55e });
    for (const [y, rr, h, m] of [[6.2, 2.6, 0.9, bun], [6.85, 2.75, 0.2, salad], [7.1, 2.7, 0.4, patty], [7.35, 2.85, 0.12, cheese]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, h, 20), m); c.position.set(cx - 6, y, cz + 2); c.castShadow = true; decor.add(c); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), bun); top.position.set(cx - 6, 7.4, cz + 2); top.scale.y = 0.7; decor.add(top);
    for (const side of [0, 1]) { const s1 = sign('🍔 BURGER DRIVE-IN', '#dc2626', '#fde68a', 12, 1.8); s1.position.set(cx - 6, 4, cz - 4.2 - side * 0.05); s1.rotation.y = side ? Math.PI : 0; decor.add(s1); }
    // Spur mit Pfeilen, Lautsprecher mit Menütafel, Fenster
    const lineM2 = mat({ color: 0xfacc15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const x of [cx + 3, cx + 9]) box(0.15, 0.02, 44, lineM2, x, 0.21, cz);
    box(0.25, 1.5, 0.25, dark, cx + 10.2, 0.9, cz - 8); box(0.6, 0.6, 0.4, dark, cx + 10.2, 1.7, cz - 8);
    const menu = sign('🍔 6 · 🍟 4 · 🥤 3 · 🍱 11', '#111827', '#fde68a', 4.5, 1.4); menu.position.set(cx + 11.5, 2.2, cz - 10); menu.rotation.y = -Math.PI / 2; decor.add(menu);
    box(0.1, 1.4, 2, mat({ color: 0x93c5fd, emissive: 0xfff3c4, emissiveIntensity: 0.5 }), cx + 2.1, 1.6, cz + 4);
    const spk = sign('🔊 BESTELLEN', '#dc2626', '#ffffff', 3, 0.8); spk.position.set(cx + 10.2, 2.4, cz - 8); spk.rotation.y = -Math.PI / 2; decor.add(spk);
    const win = sign('🪟 ABHOLEN', '#dc2626', '#ffffff', 3, 0.8); win.position.set(cx + 2.2, 3, cz + 4); win.rotation.y = Math.PI / 2; decor.add(win);
    // Tische mit Schirmen auf der anderen Seite
    for (const [dx, dz] of [[-18, -14], [-10, -14], [-18, 16], [-10, 16]]) { box(1.6, 0.1, 1.6, mat({ color: 0xffffff }), cx + dx, 0.95, cz + dz); const u = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 10), red); u.position.set(cx + dx, 2.6, cz + dz); decor.add(u); box(0.08, 2.3, 0.08, dark, cx + dx, 1.4, cz + dz); }
    places.order = { x: cx + 6, z: cz - 8, w: 6, d: 5 }; places.pickup = { x: cx + 6, z: cz + 4, w: 6, d: 5 };
  }
  // Kino: grosser Saal mit Leinwand (läuft ein Film) und Sitzreihen; vorne Leuchtschrift, Plakate, abends Leute
  function buildKino(cx, cz) {
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const X0 = cx - 20, X1 = cx + 20, Z0 = cz - 14, Z1 = cz + 14, T = 0.4, H = 9, wy = 0.16 + H / 2;
    const wallM = mat({ color: 0x3b0764 }), inM = mat({ color: 0x1e1b4b, emissive: 0x1e1b4b, emissiveIntensity: 0.4 }), gold = mat({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.8 });
    box(40, H, T, wallM, cx, wy, Z1 - T / 2, true); box(T, H, 28, wallM, X0 + T / 2, wy, cz, true); box(T, H, 28, wallM, X1 - T / 2, wy, cz, true);
    box(18, H, T, wallM, cx - 11, wy, Z0 + T / 2, true); box(18, H, T, wallM, cx + 11, wy, Z0 + T / 2, true); box(4, H - 3.2, T, wallM, cx, 3.36 + (H - 3.2) / 2, Z0 + T / 2);
    box(40, 0.3, 28, inM, cx, H + 0.1, cz); box(39, 0.05, 27, mat({ color: 0x7f1d1d, emissive: 0x7f1d1d, emissiveIntensity: 0.25 }), cx, 0.2, cz); // Dach, Teppich
    for (const [x, z, w, d] of [[cx, Z1 - T - 0.02, 39, 0.04], [X0 + T + 0.02, cz, 0.04, 27], [X1 - T - 0.02, cz, 0.04, 27]]) box(w, H - 0.3, d, inM, x, wy, z);
    // Leinwand mit Film (Bild wird in stepKino gezeichnet)
    const fc = document.createElement('canvas'); fc.width = 384; fc.height = 160;
    const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), new THREE.MeshBasicMaterial({ map: ftex }));
    screen.position.set(cx, 5, Z1 - T - 0.1); screen.rotation.y = Math.PI; screen.userData.keep = true; scene.add(screen);
    // Sitzreihen
    const seats = []; for (let r = 0; r < 6; r++) for (let k = 0; k < 12; k++) seats.push([cx - 11 + k * 2, cz - 7 + r * 2.4]);
    const seatM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.1, 1), mat({ color: 0xb91c1c, emissive: 0x7f1d1d, emissiveIntensity: 0.3 }), seats.length), d0 = new THREE.Object3D();
    seats.forEach(([x, z], k) => { d0.position.set(x, 0.75, z); d0.updateMatrix(); seatM.setMatrixAt(k, d0.matrix); }); scene.add(seatM);
    // aussen: Leuchtschrift mit Lämpchen, Plakate
    for (const side of [0, 1]) { const s1 = sign('🎬 KINO', '#111827', '#fbbf24', 14, 2.6); s1.position.set(cx, 7, Z0 - 0.3 - side * 0.05); s1.rotation.y = side ? 0 : Math.PI; decor.add(s1); }
    for (let k = 0; k < 16; k++) box(0.3, 0.3, 0.3, gold, cx - 7.5 + k, 8.6, Z0 - 0.35);
    const posters = [['🚗💨 TURBO-TOM', '#dc2626'], ['🚀 WELTRAUM-RENNEN', '#1d4ed8'], ['🐉 DER AUTO-DRACHE', '#16a34a'], ['🏁 LIONELS GROSSER SIEG', '#7c3aed']];
    posters.forEach(([t, bg], k) => { const pz = sign(t, bg, '#ffffff', 4.5, 2.4); pz.position.set(cx + (k < 2 ? -16 + k * 6 : 10 + (k - 2) * 6), 3, Z0 - 0.3); pz.rotation.y = Math.PI; decor.add(pz); });
    places.kino = { x: cx, z: cz, inside: { x0: X0 + T, x1: X1 - T, z0: Z0 + T, z1: Z1 - T }, seats: { x0: cx - 12, x1: cx + 12, z0: cz - 8, z1: cz + 6 }, film: { c: fc, tex: ftex }, door: { x: cx, z: Z0 } };
  }
  // Stadion: Rasen mit Linien, Tribünen rundherum (Eingang im Süden), Flutlicht; Spiel am Nachmittag und Abend (stepStadium)
  function buildStadium(cx, cz) {
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const pc = document.createElement('canvas'); pc.width = 300; pc.height = 200; const g = pc.getContext('2d');
    for (let k = 0; k < 10; k++) { g.fillStyle = k % 2 ? '#3f9b45' : '#47a84d'; g.fillRect(k * 30, 0, 30, 200); }
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(6, 6, 288, 188); g.beginPath(); g.moveTo(150, 6); g.lineTo(150, 194); g.stroke();
    g.beginPath(); g.arc(150, 100, 28, 0, Math.PI * 2); g.stroke(); g.strokeRect(6, 55, 36, 90); g.strokeRect(258, 55, 36, 90);
    const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(30, 20).rotateX(-Math.PI / 2), mat({ map: pt, roughness: 1 })); pitch.position.set(cx, 0.22, cz); pitch.receiveShadow = true; decor.add(pitch);
    const white = mat({ color: 0xffffff });
    for (const sx of [-1, 1]) { box(0.15, 2.2, 0.15, white, cx + sx * 15, 1.3, cz - 3); box(0.15, 2.2, 0.15, white, cx + sx * 15, 1.3, cz + 3); box(0.15, 0.15, 6.2, white, cx + sx * 15, 2.4, cz); }
    // Tribünen: drei Stufen auf jeder Seite (im Süden mit Eingang)
    const seatC = [0xdc2626, 0xfacc15, 0x1d4ed8, 0xffffff], crowd = [];
    for (let st = 0; st < 3; st++) {
      const h = 1.4 + st * 1.4, o = 12 + st * 3.3, m = mat({ color: seatC[st % 4] });
      box(36 + st * 6.6, h, 3.2, m, cx, 0.16 + h / 2, cz - o - 1.6, true); // Norden
      for (const sx of [-1, 1]) box(3.2, h, 26 + st * 6.6, m, cx + sx * (17 + st * 3.3 + 1.6), 0.16 + h / 2, cz, true); // Ost, West
      for (const sx of [-1, 1]) box(15 + st * 3.3, h, 3.2, m, cx + sx * (11 + st * 1.65), 0.16 + h / 2, cz + o + 1.6, true); // Süden (Lücke in der Mitte)
      for (let k = 0; k < 46; k++) { const t = (k + 0.5) / 46;
        crowd.push([cx - 18 - st * 3.3 + t * (36 + st * 6.6), 0.16 + h + 0.4, cz - o - 1.6]);
        if (k % 2 === 0) for (const sx of [-1, 1]) crowd.push([cx + sx * (17 + st * 3.3 + 1.6), 0.16 + h + 0.4, cz - 13 - st * 3.3 + t * (26 + st * 6.6)]);
      }
    }
    const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), mat({ color: 0xffffff }), crowd.length), d0 = new THREE.Object3D(), col = new THREE.Color(), cc = [0xdc2626, 0x1d4ed8, 0xfacc15, 0xffffff, 0x16a34a, 0xf472b6];
    crowd.forEach(([x, y, z], k) => { d0.position.set(x, y, z); d0.updateMatrix(); cm.setMatrixAt(k, d0.matrix); cm.setColorAt(k, col.setHex(cc[k % cc.length])); });
    cm.visible = false; scene.add(cm);
    // Flutlicht
    const lampM = mat({ color: 0xffffff, emissive: 0xfffbe6, emissiveIntensity: 0.2 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { box(0.6, 18, 0.6, metal, cx + sx * 22, 9.16, cz + sz * 22, true); box(3, 1.6, 0.6, lampM, cx + sx * 21, 18, cz + sz * 21); }
    for (const side of [0, 1]) { const s1 = sign('⚽ STADION', '#16a34a', '#ffffff', 10, 1.8); s1.position.set(cx, 6.8, cz + 23.2 + side * 0.05); s1.rotation.y = side ? Math.PI : 0; decor.add(s1); }
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96; const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: stex })); board.position.set(cx, 9.5, cz - 22.6); board.userData.keep = true; scene.add(board);
    box(8.4, 3.4, 0.3, mat({ color: 0x111827 }), cx, 9.5, cz - 22.8); box(0.4, 8, 0.4, metal, cx, 4, cz - 22.8);
    places.stadium = { x: cx, z: cz, crowd: cm, lampM, board: { c: sc, tex: stex, last: '' } };
  }
  function buildDealer(cx, cz) { // Autohändler: Glas-Ausstellungsraum, davor drei Drehteller mit Gebrauchtwagen
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const glass = mat({ color: 0x9cc7e6, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.35 }), frame = mat({ color: 0x1f2937 });
    // Ausstellungsraum zum Hineingehen (und Hineinfahren): Glas vorne mit Tür in der Mitte, Wand hinten, heller Boden
    box(30, 0.06, 12, mat({ color: 0xf3f4f6, roughness: 0.25, metalness: 0.1 }), cx, 0.2, cz + 14);
    for (const s of [-1, 1]) {
      box(12, 6, 0.2, glass, cx + s * 9, 3.18, cz + 8, true); // vorne links und rechts der Tür
      box(0.2, 6, 12, glass, cx + s * 15, 3.18, cz + 14, true); // Seiten
    }
    box(30, 6, 0.4, mat({ color: 0xe5e7eb }), cx, 3.18, cz + 20, true); // Rückwand
    box(30.4, 0.5, 12.4, frame, cx, 6.4, cz + 14);
    box(26, 0.05, 8, mat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 }), cx, 6.12, cz + 14); // Deckenlicht
    for (const dx of [-15, -3, 3, 15]) box(0.3, 6, 0.3, frame, cx + dx, 3.18, cz + 8);
    const inside = [-10, 0, 10].map(dx => { // drei Plätze drinnen, mit Teppich
      box(5, 0.03, 7, mat({ color: 0x991b1b, roughness: 0.9 }), cx + dx, 0.25, cz + 15);
      return { x: cx + dx, z: cz + 15 };
    });
    for (const side of [0, 1]) {
      const s1 = sign('🚗 AUTOHÄNDLER', '#f59e0b', '#1f2937', 14, 2.2); s1.position.set(cx, 7.9, cz + 7.9 - side * 0.05); s1.rotation.y = side * Math.PI; decor.add(s1);
    }
    const pods = [-10, 0, 10].map(dx => { // Drehteller (drehen sich mit dem Auto darauf)
      const t = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 32), mat({ color: 0xd1d5db, metalness: 0.6, roughness: 0.3 }));
      t.position.set(cx + dx, 0.33, cz + 1); scene.add(t);
      round.push({ x: cx + dx, z: cz + 1, r: 2.6, h: 1.5 });
      return t;
    });
    box(3.2, 1.0, 1.2, mat({ color: 0x78350f, roughness: 0.6 }), cx, 0.7, cz + 18.6, true); // Schreibtisch hinten im Raum
    box(0.9, 0.55, 0.05, mat({ color: 0x0b1a2e, emissive: 0x3b82f6, emissiveIntensity: 0.8 }), cx, 1.5, cz + 18.6);
    places.dealer = { x: cx, z: cz - 12, w: 14, d: 10, pods, inside, door: { x: cx, z: cz + 8 }, desk: { x: cx, z: cz + 16.8, w: 6, d: 3 } };
  }
  function buildHospital(cx, cz) { // Spital: weisses Haus mit rotem Kreuz, Vordach und Notfall-Einfahrt
    box(46, 0.04, 46, tarmac, cx, 0.18, cz);
    const house = wallBox(32, 12, 14, walls[3], 8); house.position.set(cx, 6.16, cz + 12); decor.add(house);
    solid.push({ x0: cx - 16, x1: cx + 16, z0: cz + 5, z1: cz + 19, h: 12.5 });
    box(14, 0.4, 6, mat({ color: 0xf8fafc }), cx, 4.2, cz + 2); // Vordach
    for (const dx of [-6.5, 6.5]) box(0.4, 4, 0.4, mat({ color: 0x9ca3af }), cx + dx, 2.2, cz - 0.6, true);
    const red = mat({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.5 });
    box(1.2, 4, 0.3, red, cx, 9, cz + 4.8); box(4, 1.2, 0.3, red, cx, 9, cz + 4.8); // rotes Kreuz
    for (const side of [0, 1]) {
      const s1 = sign('🏥 SPITAL', '#dc2626', '#ffffff', 10, 1.8); s1.position.set(cx, 5.5, cz - 1.05 - side * 0.05); s1.rotation.y = side * Math.PI; decor.add(s1);
    }
    const marks = quads(); marks.rect(cx, cz - 6, 10, 0.2, 0.2); marks.rect(cx, cz - 12, 10, 0.2, 0.2); decor.add(marks.mesh(lineMat));
    places.hospital = { x: cx, z: cz - 9 };
  }
  // Base: ummauerter Parkplatz mit Einfahrt und Torbogen, je fünf Parkfelder links und rechts der Fahrgasse.
  // Die Autos und das Schild kommen erst beim Spielen dazu (stepBases); bay.solid ist weit weg, solange das Feld leer ist.
  // Eine Base steht nur, wenn sie jemandem gehört (setBaseOn), sonst ist hier eine Wiese
  function buildBase(cx, cz, s) {
    const col = new THREE.Color(BASE_COLORS[s]), wallM = mat({ color: 0x2b2f3a }), neon = mat({ color: col, emissive: col, emissiveIntensity: 1.3 });
    const floor = quads(1 / 8), marks = quads(), grass = quads(1 / 4), shell = new THREE.Group(), root = new THREE.Group(), first = solid.length;
    grass.add(cx - 22, cz - 22, cx + 22, cz + 22, 0.17);
    const lawn = grass.mesh(grassMat);
    scene.add(lawn, root);
    floor.add(cx - 24, cz - 24, cx + 24, cz + 24, 0.17);
    for (const sx of [-1, 1]) for (let k = 0; k <= 5; k++) marks.rect(cx + sx * 15, cz - 20 + k * 8, 18, 0.2, 0.18);
    shell.add(floor.mesh(asphaltMat), marks.mesh(lineMat));
    for (const sx of [-1, 1]) {
      box(1, 2.6, 49, wallM, cx + sx * 24.5, 1.46, cz, true, shell);
      box(1.05, 0.14, 49, neon, cx + sx * 24.5, 2.8, cz, false, shell);
      box(17, 2.6, 1, wallM, cx + sx * 15.5, 1.46, cz - 24.5, true, shell);
      box(17, 0.14, 1.05, neon, cx + sx * 15.5, 2.8, cz - 24.5, false, shell);
      box(1.2, 6.8, 1.2, wallM, cx + sx * 7.6, 3.56, cz - 24.5, true, shell);
    }
    box(48, 2.6, 1, wallM, cx, 1.46, cz + 24.5, true, shell);
    box(48, 0.14, 1.05, neon, cx, 2.8, cz + 24.5, false, shell);
    box(16.4, 2, 1, wallM, cx, 6.4, cz - 24.5, false, shell);
    root.add(shell);
    mergeStatic(shell);
    const walls = solid.slice(first).map(w => ({ w, box: { ...w } }));
    // Schild am Torbogen (von der Strasse und von innen lesbar), Text wechselt im Spiel
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 });
    for (const [z, ry] of [[-25.06, Math.PI], [-23.94, 0]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 1.95), sm);
      p.position.set(cx, 6.4, cz + z); p.rotation.y = ry; root.add(p);
    }
    const setSign = text => {
      const g = c.getContext('2d');
      g.fillStyle = BASE_COLORS[s]; g.fillRect(0, 0, 512, 64);
      g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 256, 34, 490);
      tex.needsUpdate = true;
    };
    const bays = [];
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
      const b = { x: cx + sx * 15, z: cz - 16 + k * 8, ry: sx < 0 ? 0 : Math.PI, key: '', mesh: null, solid: { x0: 1e9, x1: 1e9, z0: 1e9, z1: 1e9, h: 2.5 } };
      solid.push(b.solid);
      bays.push(b);
    }
    const group = new THREE.Group();
    root.add(group);
    places.bases[s] = { x: cx, z: cz, w: 49, d: 49, bays, group, setSign, sign: '', root, lawn, walls, on: true };
    setBaseOn(places.bases[s], false);
  }
  const shops = [], balcs = [], street = []; // Ladenfronten, Balkone, Bänke (am Schluss als Instanzen)
  const roofTiles = [mat({ color: 0x9b3b2b, roughness: 0.85 }), mat({ color: 0x5a4e4a, roughness: 0.85 }), mat({ color: 0xb4532a, roughness: 0.85 })];
  const homeWalls = [['#f3eadb', '#7a6a55'], ['#e8d9b8', '#5b4a35'], ['#dfe7ea', '#4a5560'], ['#f0d9d0', '#7a4a3a']]
    .map(([wall, frame]) => facadeMat(facade(wall, frame, r), 1));
  const block = 50, inner = 44, curbMat = mat({ color: 0xc9ccd1, roughness: 0.9 });
  const trees = [];
  // Pflanzen (eigener Zufall, ändert die Stadt sonst nicht): Tannen im Wald, Büsche, Grasbüschel, Blumen; Dachgärten/Solar
  const pines = [], bushes = [], tufts = [], flowers = [], roofSpots = [], vr = rng(4242);
  const scatter = (list, x0, z0, x1, z1, n, y = 0.17, s0 = 0.7, s1 = 1.2, ok = null) => {
    for (let k = 0; k < n; k++) { const x = x0 + vr() * (x1 - x0), z = z0 + vr() * (z1 - z0); if (!ok || ok(x, z)) list.push([x, y, z, s0 + vr() * (s1 - s0)]); }
  };
  const bed = (x, z, n, rad = 1.2, y = 0.17) => { for (let k = 0; k < n; k++) { const a = vr() * 6.28, d = Math.sqrt(vr()) * rad; flowers.push([x + Math.cos(a) * d, y, z + Math.sin(a) * d, 0.8 + vr() * 0.5]); } };
  const shapeR = rng(4711); // Formen der Häuser (rund, Turm, weiche Kanten)
  const layR = rng(5150); // Block-Arten (lockerer bauen)
  const lotLines = quads(), lotTar = quads(1 / 8), greenQ = quads(1 / 4), plazaM = mat({ color: 0xb8ad9c, roughness: 0.9 });
  // Freier Quadrant (etwa 20 × 20 m): Parkplatz, Grün oder Plätzchen
  function fillQuad(kind, x, z, sx, sz) {
    if (kind === 'lot') { // Parkplatz mit Feldern und Parkuhr
      lotTar.add(x - 10, z - 10, x + 10, z + 10, 0.18);
      for (let k = 0; k <= 5; k++) { lotLines.rect(x - 10 + k * 4, z - 6, 0.15, 5, 0.19); lotLines.rect(x - 10 + k * 4, z + 6, 0.15, 5, 0.19); }
      box(0.3, 1.3, 0.3, metal, x + sx * 9.5, 0.82, z + sz * 9.5, true);
      return;
    }
    if (kind === 'green') { // Wiese mit Bäumen, Hecke und Bank
      greenQ.add(x - 10, z - 10, x + 10, z + 10, 0.17);
      scatter(tufts, x - 10, z - 10, x + 10, z + 10, 95); scatter(bushes, x - 9, z - 9, x + 9, z + 9, 3); bed(x + sx * 5, z + sz * 2, 10, 1.4);
      for (let k = 0; k < 3; k++) trees.push([x + (layR() - 0.5) * 14, 0.17, z + (layR() - 0.5) * 14, 0.7 + layR() * 0.4]);
      box(18, 0.9, 0.8, mat({ color: 0x3f6f35, roughness: 1 }), x, 0.6, z - sz * 9.6); // Hecke zum Haus hin
      street.push([x, z + sz * 6, sz > 0 ? Math.PI : 0]);
      return;
    }
    // Plätzchen: anderer Stein, Brunnen, Bäume, Bänke, Kiosk
    const pl = new THREE.Mesh(new THREE.BoxGeometry(20, 0.03, 20), plazaM); pl.position.set(x, 0.175, z); decor.add(pl);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 24), mat({ color: 0xc9c2b4, roughness: 0.85 })); basin.position.set(x, 0.45, z); basin.castShadow = true; decor.add(basin);
    const wat = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.05, 24), mat({ color: 0x3b8bd0, roughness: 0.05, metalness: 0.3 })); wat.position.set(x, 0.72, z); decor.add(wat);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.8, 10), mat({ color: 0xc9c2b4 })); col.position.set(x, 1.2, z); decor.add(col);
    round.push({ x, z, r: 2.4, h: 0.8 });
    for (const [tx, tz] of [[-7, -7], [7, 7], [-7, 7], [7, -7]]) trees.push([x + tx, 0.17, z + tz, 0.6]);
    street.push([x - 5, z, Math.PI / 2], [x + 5, z, -Math.PI / 2]);
    box(2.6, 2.6, 2.2, mat({ color: 0x166534, roughness: 0.7 }), x + sx * 6, 1.47, z - sz * 6, true); // Kiosk
  }
  // Ein Haus rund um den Block mit grünem Innenhof (Blockrand), Läden zur Strasse
  function buildCourt(cx, cz, h) {
    const wm = walls[Math.floor(layR() * walls.length)], D = 10, O = 20; // Flügeltiefe, halbe Aussenbreite
    for (const [x, z, w, d] of [[cx, cz - O + D / 2, 2 * O, D], [cx, cz + O - D / 2, 2 * O, D], [cx - O + D / 2, cz, D, 2 * O - 2 * D], [cx + O - D / 2, cz, D, 2 * O - 2 * D]]) {
      const b = wallBox(w, h, d, wm); b.position.set(x, 0.16 + h / 2, z); decor.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), roofMat); roof.position.set(x, 0.16 + h + 0.3, z); roof.castShadow = true; decor.add(roof);
      solid.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: h + 2 });
    }
    shops.push([cx, cz - O - 0.05, 2 * O - 4, 0], [cx, cz + O + 0.05, 2 * O - 4, 0], [cx - O - 0.05, cz, 2 * O - 4, Math.PI / 2], [cx + O + 0.05, cz, 2 * O - 4, Math.PI / 2]);
    greenQ.add(cx - O + D, cz - O + D, cx + O - D, cz + O - D, 0.17); // Innenhof
    scatter(tufts, cx - 9, cz - 9, cx + 9, cz + 9, 95); scatter(bushes, cx - 9, cz - 9, cx + 9, cz + 9, 4); bed(cx - 6, cz - 6, 10, 1.3); bed(cx + 6, cz + 7, 8, 1);
    trees.push([cx - 4, 0.17, cz - 3, 0.8], [cx + 5, 0.17, cz + 4, 0.7]);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 1), mat({ color: 0xef4444 })); slide.position.set(cx + 4, 0.77, cz - 5); decor.add(slide); // Spielplatz
    const sand = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), mat({ color: 0xe8d39a, roughness: 1 })); sand.position.set(cx - 5, 0.2, cz + 5); decor.add(sand);
  }
  const copper = mat({ color: 0x5f9e88, metalness: 0.55, roughness: 0.45 }), slate = mat({ color: 0x3b4252, metalness: 0.3, roughness: 0.6 });
  for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
    const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2;
    if (ORGANIC.has(bi + ',' + bj)) { scatter(tufts, cx - 26, cz - 26, cx + 26, cz + 26, 60, 0, 0.8, 1.4, (x, z) => !suburbRoad(x, z) && !suburbRoad(x + 5, z) && !suburbRoad(x, z + 5)); continue; } // Quartier mit Gassen (suburbs.js)
    const svc = CITY_SERVICES[bi + ',' + bj];
    if (svc) { // Tankstelle mit Werkstatt (service.js) statt Wäldchen; 7 m näher an die Strasse
      const [fx, fz] = { '-z': [0, -1], '+z': [0, 1], '-x': [-1, 0], '+x': [1, 0] }[svc];
      places.services.push(buildService(decor, { x: cx + fx * 7, z: cz + fz * 7, face: svc }, { sign, solid, round, y: 0 }));
      continue;
    }
    if (!blockOn(bi, bj)) { // freier Block am Stadtrand: Wäldchen mit Wiese (eigener Zufall, der Haupt-Zufall bleibt gleich)
      const free = (x, z) => ![[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]].some(([a, b]) => suburbRoad(x + a, z + b)) // nicht auf die Strassen der Vororte
        && !SUBURBS.some(S2 => S2.inCity && x > S2.rect.x0 && x < S2.rect.x1 && z > S2.rect.z0 && z < S2.rect.z1); // und nicht zu den Häusern der Quartiere
      for (let k = 0; k < 16; k++) {
        const tx = cx + (vr() - 0.5) * 36, tz = cz + (vr() - 0.5) * 36, pine = vr() < 0.5, sc = 0.8 + vr() * 0.7; // mind. 7 m bis zur Strasse (Äste!)
        if (!free(tx, tz)) continue;
        if (pine) pines.push([tx, 0, tz, sc]); else trees.push([tx, 0, tz, sc]);
      }
      scatter(tufts, cx - 22, cz - 22, cx + 22, cz + 22, 140, 0, 0.9, 1.6, free); scatter(bushes, cx - 19, cz - 19, cx + 19, cz + 19, 8, 0, 0.8, 1.4, free);
      continue;
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(block, 0.16, block), paveMat);
    slab.position.set(cx, 0.08, cz); slab.receiveShadow = true;
    decor.add(slab);
    for (const [x, z, w, d] of [[cx, cz - 24.85, 50, 0.3], [cx, cz + 24.85, 50, 0.3], [cx - 24.85, cz, 0.3, 50], [cx + 24.85, cz, 0.3, 50]]) { // Randstein
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), curbMat); c.position.set(x, 0.1, z); c.receiveShadow = true; decor.add(c);
    }
    const key = bi + ',' + bj;
    if (key === plaza) { buildPlaza(decor, cx, cz, round); continue; }
    if (baseOf(key) >= 0) { buildBase(cx, cz, baseOf(key)); continue; }
    if (SPECIAL[key]) { ({ gas: buildGas, wash: buildWash, pizza: buildPizza, jail: buildJail, workshop: buildWorkshop, dealer: buildDealer, hospital: buildHospital, blue: (x, z) => buildBlue(x, z, bi, bj), house: buildHouse, park: buildPark, drive: buildDrive, kino: buildKino, stadium: buildStadium })[SPECIAL[key]](cx, cz); continue; }
    if (parks.has(key)) { // Park: Wiese mit Wegkreuz und Bäumen
      const g = quads(1 / 4), h = inner / 2, p = 1.6;
      g.add(cx - h, cz - h, cx - p, cz - p, 0.17); g.add(cx + p, cz - h, cx + h, cz - p, 0.17);
      g.add(cx - h, cz + p, cx - p, cz + h, 0.17); g.add(cx + p, cz + p, cx + h, cz + h, 0.17);
      decor.add(g.mesh(grassMat));
      const off = (x, z) => Math.abs(x - cx) > 2.4 && Math.abs(z - cz) > 2.4; // nicht auf dem Weg
      scatter(tufts, cx - h, cz - h, cx + h, cz + h, 280, 0.17, 0.8, 1.6, off); scatter(bushes, cx - h + 2, cz - h + 2, cx + h - 2, cz + h - 2, 7, 0.17, 0.8, 1.4, off);
      for (const [dx, dz] of [[4.5, 4.5], [-4.5, 4.5], [4.5, -4.5], [-4.5, -4.5]]) bed(cx + dx, cz + dz, 12, 1.5); // Blumenbeete beim Wegkreuz
      for (let k = 0; k < 14; k++) {
        const tx = cx + (r() - 0.5) * (inner - 6), tz = cz + (r() - 0.5) * (inner - 6);
        if (Math.abs(tx - cx) < 4 || Math.abs(tz - cz) < 4) continue;
        trees.push([tx, 0.16, tz, 0.8 + r() * 0.6]);
      }
      continue;
    }
    // Aussenquartier: Einfamilienhäuser mit Giebeldach und Garten
    const edge = !blockOn(bi - 1, bj) || !blockOn(bi + 1, bj) || !blockOn(bi, bj - 1) || !blockOn(bi, bj + 1); // am Stadtrand
    if (edge && r() < 0.7) {
      const g = quads(1 / 4), h = inner / 2;
      g.add(cx - h, cz - h, cx + h, cz + h, 0.17);
      decor.add(g.mesh(grassMat));
      for (const ox of [-11, 11]) for (const oz of [-11, 11]) {
        const turn = r() < 0.5, w = 8 + r() * 3, d = 7 + r() * 2, hgt = 3.6 + r() * 1.6;
        const bx = cx + ox + (r() - 0.5) * 3, bz = cz + oz + (r() - 0.5) * 3, W = turn ? d : w, D = turn ? w : d;
        const b = wallBox(W, hgt, D, homeWalls[Math.floor(r() * homeWalls.length)], 7);
        b.position.set(bx, 0.17 + hgt / 2, bz);
        decor.add(b);
        const hw = W / 2 + 0.45, rh = 1.6 + r() * 1.2;
        const shape = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, rh)]);
        const rg = new THREE.ExtrudeGeometry(shape, { depth: D + 0.7, bevelEnabled: false });
        rg.translate(0, 0, -(D + 0.7) / 2);
        const roof = new THREE.Mesh(rg, roofTiles[Math.floor(r() * roofTiles.length)]);
        roof.position.set(bx, 0.17 + hgt, bz); roof.castShadow = roof.receiveShadow = true;
        decor.add(roof);
        if (r() < 0.5) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), roofMat); ch.position.set(bx + hw * 0.4, 0.17 + hgt + rh * 0.6, bz + (r() - 0.5) * D * 0.5); ch.castShadow = true; decor.add(ch); }
        solid.push({ x0: bx - W / 2, x1: bx + W / 2, z0: bz - D / 2, z1: bz + D / 2, h: hgt + rh + 0.2 });
      }
      for (let k = 0; k < 3; k++) trees.push([cx + (r() - 0.5) * 6, 0.17, cz + (r() - 0.5) * 6, 0.6 + r() * 0.4]);
      const away = (x, z) => !solid.some(b => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1);
      scatter(tufts, cx - 21, cz - 21, cx + 21, cz + 21, 180, 0.17, 0.8, 1.6, away); scatter(bushes, cx - 20, cz - 20, cx + 20, cz + 20, 10, 0.17, 0.7, 1.3, away);
      for (let k = 0; k < 4; k++) { const x = cx + (vr() - 0.5) * 36, z = cz + (vr() - 0.5) * 36; if (away(x, z)) bed(x, z, 8, 1); }
      continue;
    }
    // Häuser: 2 × 2 Bauplätze; in der Mitte der Stadt höher (Skyline)
    const center = 1 - Math.hypot(cx, cz) / (HALF * 1.3);
    for (const k of [-16, -8, 8, 16]) for (const [tx, tz] of [[cx + k, cz - 22.2], [cx + k, cz + 22.2], [cx - 22.2, cz + k], [cx + 22.2, cz + k]])
      { trees.push([tx, 0.16, tz, 0.55 + r() * 0.2]); tufts.push([tx + 0.4, 0.17, tz, 0.6], [tx - 0.3, 0.17, tz + 0.3, 0.5]); } // Strassenbäume auf dem Trottoir
    for (const k of [-12, 12]) street.push([cx + k, cz - 22.6, 0], [cx + k, cz + 22.6, Math.PI], [cx - 22.6, cz + k, Math.PI / 2], [cx + 22.6, cz + k, -Math.PI / 2]); // Bänke
    // Block-Art (eigener Zufall): four = 4 Häuser (dicht, eher in der Mitte), three = 3 Häuser + Plätzchen oder Grün,
    // pair = 2 Häuser + Parkplatz + Grün, court = ein Haus rundherum mit Innenhof. So ist die Stadt lockerer und jeder Block anders.
    const lr = layR(), dense = Math.max(0, center);
    const lay = lr < 0.15 + dense * 0.45 ? 'four' : lr < 0.38 + dense * 0.3 ? 'court' : lr < 0.72 + dense * 0.15 ? 'three' : 'pair';
    const Q = lay === 'four' ? ['b', 'b', 'b', 'b'] : lay === 'court' ? ['c', 'c', 'c', 'c'] : ['b', 'b', 'b', 'b'];
    if (lay === 'three') Q[Math.floor(layR() * 4)] = layR() < 0.5 ? 'plaza' : 'green';
    if (lay === 'pair') { const k = Math.floor(layR() * 4); Q[k] = 'lot'; Q[3 - k] = 'green'; } // Quadranten 0..3: diagonal gegenüber = 3 - k
    let qi = 0, courtH = 0;
    for (const ox of [-11, 11]) for (const oz of [-11, 11]) {
      const w = 14 + r() * 5, d = 14 + r() * 5, hgt = 7 + r() * (8 + 42 * Math.max(0, center) ** 1.4);
      const bx = cx + ox, bz = cz + oz;
      const sx = Math.sign(ox), sz = Math.sign(oz);
      const qk = Q[qi++];
      if (qk !== 'b') { // kein Haus hier: gleich viel Zufall verbrauchen wie ein Haus (sonst ändert sich der Rest der Stadt)
        shapeR(); r(); if (r() < 0.6) { r(); r(); r(); r(); }
        courtH += hgt;
        if (qk !== 'c') fillQuad(qk, bx, bz, sx, sz);
        continue;
      }
      // Form (eigener Zufall, damit Grösse, Höhe und die Schlüssel auf den Dächern gleich bleiben):
      // tower = runder Turm mit Kuppel, corner = runde Ecke zur Kreuzung, soft = weiche Kanten, box = wie früher
      const rk = shapeR(), mn = Math.min(w, d), Rc = Math.min(mn * 0.42, mn - 8.5);
      const shape = hgt > 20 && hgt < 46 && rk < 0.2 ? 'tower' : rk < 0.5 && Rc > 3 ? 'corner' : rk < 0.78 ? 'soft' : 'box';
      const ck = sx > 0 ? (sz > 0 ? 0 : 3) : (sz > 0 ? 1 : 2), RS = 2.2;
      const radii = shape === 'corner' ? [0, 1, 2, 3].map(k => (k === ck ? Rc : 0)) : [RS, RS, RS, RS];
      // Läden im Erdgeschoss (zur Strasse): Schaufenster und farbige Markise; niedrigere Häuser mit Balkonen
      // (an runden Ecken kürzer, damit nichts in der Luft hängt)
      if (shape === 'corner') shops.push([bx + sx * (w / 2 + 0.05), bz + sz * (1.2 - Rc) / 2, d - Rc - 1.8, Math.PI / 2], [bx + sx * (1.2 - Rc) / 2, bz + sz * (d / 2 + 0.05), w - Rc - 1.8, 0]);
      else if (shape === 'soft') shops.push([bx + sx * (w / 2 + 0.05), bz, d - 2 * RS - 1, Math.PI / 2], [bx, bz + sz * (d / 2 + 0.05), w - 2 * RS - 1, 0]);
      else if (shape === 'box') shops.push([bx + sx * (w / 2 + 0.05), bz, d - 3, Math.PI / 2], [bx, bz + sz * (d / 2 + 0.05), w - 3, 0]);
      const fitsX = f => shape === 'box' || (shape === 'soft' ? Math.abs(f) * d + 1.2 < d / 2 - RS : f * sz * d + 1.2 < d / 2 - Rc);
      const fitsZ = f => shape === 'box' || (shape === 'soft' ? Math.abs(f) * w + 1.2 < w / 2 - RS : f * sx * w + 1.2 < w / 2 - Rc);
      if (hgt < 26 && shape !== 'tower') for (let fy = 4.6; fy < hgt - 1.5; fy += 3.2) for (const f of [-0.3, 0, 0.3]) {
        if (fitsX(f)) balcs.push([bx + sx * (w / 2 + 0.55), 0.16 + fy, bz + f * d, Math.PI / 2, sx]);
        if (fitsZ(f)) balcs.push([bx + f * w, 0.16 + fy, bz + sz * (d / 2 + 0.55), 0, sz]);
      }
      const wm = walls[Math.floor(r() * walls.length)], R = mn / 2;
      let topH = 2;
      if (shape === 'box') {
        const b = wallBox(w, hgt, d, wm);
        b.position.set(bx, 0.16 + hgt / 2, bz);
        decor.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), roofMat); // Dach mit Rand
        roof.position.set(bx, 0.16 + hgt + 0.3, bz); roof.castShadow = true;
        decor.add(roof);
      } else if (shape === 'tower') {
        const b = prism(circlePts(R), hgt, wm); b.position.set(bx, 0.16, bz); decor.add(b);
        const ring = prism(circlePts(R + 0.35), 0.6, roofMat, 12, true); ring.position.set(bx, 0.16 + hgt, bz); decor.add(ring);
        const dome = shapeR() < 0.55;
        const top = new THREE.Mesh(dome ? new THREE.SphereGeometry(R * 0.95, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.ConeGeometry(R * 0.98, R * 1.3, 28),
          dome ? copper : slate);
        top.position.set(bx, 0.16 + hgt + 0.6 + (dome ? 0 : R * 0.65), bz); top.castShadow = true; decor.add(top);
        topH = 0.6 + (dome ? R * 0.95 : R * 1.3);
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 3, 6), metal); spire.position.set(bx, 0.16 + hgt + topH + 1.4, bz); decor.add(spire);
      } else {
        const b = prism(roundRectPts(w, d, radii), hgt, wm); b.position.set(bx, 0.16, bz); decor.add(b);
        const roof = prism(roundRectPts(w + 0.5, d + 0.5, radii.map(q => (q ? q + 0.25 : 0))), 0.6, roofMat, 12, true);
        roof.position.set(bx, 0.16 + hgt, bz); decor.add(roof);
      }
      { const ex = shape === 'tower' ? R : w / 2, ez = shape === 'tower' ? R : d / 2; // Büsche an den Hauswänden zum Blockinneren
        bushes.push([bx - sx * (ex + 0.9), 0.17, bz - sz * ez * 0.5, 0.8 + vr() * 0.4], [bx - sx * ez * 0.5 * 0 - sx * ex * 0.4, 0.17, bz - sz * (ez + 0.9), 0.8 + vr() * 0.4]);
        if (shape !== 'tower') roofSpots.push({ x: bx, z: bz, w: w * (shape === 'corner' ? 0.55 : 0.8), d: d * (shape === 'corner' ? 0.55 : 0.8), y: 0.16 + hgt + 0.6,
          ox: shape === 'corner' ? -sx * w * 0.15 : 0, oz: shape === 'corner' ? -sz * d * 0.15 : 0 }); }
      if (r() < 0.6) { // Lüftung oder Wassertank auf dem Dach
        const a = new THREE.Mesh(new THREE.BoxGeometry(2 + r() * 2, 1.2, 2 + r() * 2), metal), k = shape === 'corner' ? 0.45 : 1;
        a.position.set(bx + (r() - 0.5) * (w - 5) * k, 0.16 + hgt + 1.2, bz + (r() - 0.5) * (d - 5) * k); a.castShadow = true;
        if (shape !== 'tower') decor.add(a);
      }
      if (shape === 'tower') { // rund: Kreis; dazu ein Quadrat im Kreis (Dach für Schlüssel und Landen beim Fliegen)
        round.push({ x: bx, z: bz, r: R, h: hgt + 2 });
        solid.push({ x0: bx - R * 0.7, x1: bx + R * 0.7, z0: bz - R * 0.7, z1: bz + R * 0.7, h: hgt + topH });
      } else if (shape === 'corner') { // Rechteck ohne die Ecke, dazu zwei Teile: Streifen und Viertelkreis
        solid.push({ x0: bx - w / 2, x1: bx + w / 2, z0: sz > 0 ? bz - d / 2 : bz - d / 2 + Rc, z1: sz > 0 ? bz + d / 2 - Rc : bz + d / 2, h: hgt + 2 });
        solid.push({ x0: sx > 0 ? bx - w / 2 : bx - w / 2 + Rc, x1: sx > 0 ? bx + w / 2 - Rc : bx + w / 2, z0: sz > 0 ? bz + d / 2 - Rc : bz - d / 2, z1: sz > 0 ? bz + d / 2 : bz - d / 2 + Rc, h: hgt + 2 });
        round.push({ x: bx + sx * (w / 2 - Rc), z: bz + sz * (d / 2 - Rc), r: Rc, h: hgt + 2 });
      } else solid.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h: hgt + 2 });
    }
    if (lay === 'court') buildCourt(cx, cz, Math.min(30, 9 + courtH / 4 * 0.6));
  }

  const solar = []; // Dächer: Solarzellen (modern) oder ein Dachgarten mit Büschen
  for (const R of roofSpots) {
    const v = vr(), x = R.x + R.ox, z = R.z + R.oz;
    if (v < 0.32) { const nx = Math.max(1, Math.min(4, Math.floor(R.w / 2.1))), nz = Math.max(1, Math.min(5, Math.floor(R.d / 1.5)));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) solar.push([x + (i - (nx - 1) / 2) * 2.1, R.y + 0.35, z + (j - (nz - 1) / 2) * 1.5]); }
    else if (v < 0.52) { greenQ.add(x - R.w / 2, z - R.d / 2, x + R.w / 2, z + R.d / 2, R.y + 0.02);
      scatter(bushes, x - R.w / 2 + 1, z - R.d / 2 + 1, x + R.w / 2 - 1, z + R.d / 2 - 1, 4, R.y, 0.6, 1.0); scatter(tufts, x - R.w / 2, z - R.d / 2, x + R.w / 2, z + R.d / 2, 10, R.y, 0.7, 1.1);
      bed(x, z, 8, 1.2, R.y); }
  }
  decor.add(lotTar.mesh(tarmac), lotLines.mesh(lineMat), greenQ.mesh(grassMat)); // Parkplätze, Wiesen und Innenhöfe der Blöcke
  // Fussgängerzonen: Pflaster statt Strasse, Bäume in der Mitte, Bänke, Blumentröge
  const rz = rng(909), flowerM = [0xdc2626, 0xf59e0b, 0xdb2777, 0x7c3aed].map(c => mat({ color: c, roughness: 0.8 })), troughM = mat({ color: 0x78716c, roughness: 0.9 });
  for (const Z of PED.list) {
    const ax = Z.ax, mx = ax ? node(Z.i) + BLOCK / 2 : node(Z.i), mz = ax ? node(Z.j) : node(Z.j) + BLOCK / 2, along = (k, side) => [mx + (ax ? k : side), mz + (ax ? side : k)];
    const slab = new THREE.Mesh(new THREE.BoxGeometry(ax ? BLOCK - ROAD : ROAD, 0.16, ax ? ROAD : BLOCK - ROAD), paveMat);
    slab.position.set(mx, 0.08, mz); slab.receiveShadow = true; decor.add(slab);
    const band = new THREE.Mesh(new THREE.BoxGeometry(ax ? BLOCK - ROAD : 3, 0.02, ax ? 3 : BLOCK - ROAD), mat({ color: 0x9c8f80, roughness: 0.9 }));
    band.position.set(mx, 0.17, mz); decor.add(band); // Mittelband aus dunklerem Stein
    for (const k of [-18, -6, 6, 18]) { const [tx, tz] = along(k, 0); trees.push([tx, 0.17, tz, 0.75 + rz() * 0.2]); }
    for (const k of [-12, 0, 12]) for (const side of [-3.2, 3.2]) { const [bx, bz] = along(k, side); street.push([bx, bz, ax ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2)]); }
    for (const k of [-21, 21]) for (const side of [-4.8, 4.8]) { // Blumentröge
      const [fx, fz] = along(k, side);
      box(1.4, 0.6, 1.4, troughM, fx, 0.46, fz, true);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flowerM[Math.floor(rz() * flowerM.length)]);
      fl.position.set(fx, 0.76, fz); fl.scale.set(1, 0.6, 1); decor.add(fl);
    }
  }
  // Kreisel: Insel mit Randstein, Wiese und Baum, gepflasterter Ring darum, Markierung, blaue Schilder an den Zufahrten
  const rbTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#1d4ed8'; g.beginPath(); g.arc(64, 64, 57, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) { const a = k * 2.094; g.beginPath(); g.arc(64, 64, 30, a + 0.35, a + 1.75); g.stroke();
      const ex = 64 + Math.cos(a + 1.75) * 30, ey = 64 + Math.sin(a + 1.75) * 30, tx = -Math.sin(a + 1.75), ty = Math.cos(a + 1.75);
      g.beginPath(); g.moveTo(ex + tx * 12, ey + ty * 12); g.lineTo(ex - ty * 9 - tx * 2, ey + tx * 9 - ty * 2); g.lineTo(ex + ty * 9 - tx * 2, ey - tx * 9 - ty * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const rbSign = mat({ map: rbTex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), rbPole = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6);
  const islandM = mat({ color: 0xd6d3d1, roughness: 0.85 }), rbDark = mat({ color: 0x23262d, metalness: 0.5, roughness: 0.5 }), rbPlate = new THREE.PlaneGeometry(0.9, 0.9);
  for (const key of ROUND) {
    const [i, j] = key.split(',').map(Number), x = node(i), z = node(j);
    const ringStone = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.08, 40), paveMat); ringStone.position.set(x, 0.05, z); decor.add(ringStone); // überfahrbarer Pflasterring
    const curb = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 0.3, 40), islandM); curb.position.set(x, 0.15, z); curb.castShadow = curb.receiveShadow = true; decor.add(curb);
    const lawn = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 0.08, 40), grassMat); lawn.position.set(x, 0.32, z); decor.add(lawn);
    trees.push([x, 0.3, z, 0.85]); scatter(tufts, x - 2.5, z - 2.5, x + 2.5, z + 2.5, 6, 0.33, 0.6, 0.9, (a, b) => Math.hypot(a - x, b - z) < 2.7);
    for (let k = 0; k < 6; k++) { const a = k * 1.047, fl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), flowerM[k % flowerM.length]);
      fl.position.set(x + Math.cos(a) * 2.1, 0.36, z + Math.sin(a) * 2.1); decor.add(fl); }
    const edge = new THREE.Mesh(new THREE.RingGeometry(6.55, 6.75, 48).rotateX(-Math.PI / 2), lineMat); edge.position.set(x, 0.035, z); decor.add(edge); // Rand des Kreisels
    round.push({ x, z, r: 3.2, h: 1 });
    for (const [fx, fz] of DIRS) {
      if (!inGrid(i - fx, j - fz)) continue;
      const rx = -fz, rz2 = fx, px = x - fx * 11 + rx * 8.4, pz = z - fz * 11 + rz2 * 8.4;
      const p = new THREE.Mesh(rbPole, rbDark); p.position.set(px, 1.2, pz); decor.add(p);
      const sg = new THREE.Mesh(rbPlate, rbSign); sg.position.set(px - fx * 0.06, 2.4, pz - fz * 0.06); sg.rotation.y = Math.atan2(-fx, -fz); decor.add(sg);
    }
  }

  // Vororte (suburbs.js): Ostquartier und Westquartier mit eigenen Strassen und Häusern
  const lampHeadMat = mat({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.6 }); // Lampenköpfe in Stadt und Vororten (nachts heller)
  buildSuburbs({ group: decor, asphaltMat, lineMat, grassMat, paveMat, sign, wallBox, homeWalls, walls, roofTiles, roofMat, lampHead: lampHeadMat, trees, round, solid, rng, veg: { bushes, tufts, flowers } });
  // Bäume: in den Parks und als Waldgürtel rund um die Stadt
  // (die Stadt ist quadratisch: Bäume aus einem Kreis landeten sonst in den Ecken auf Strassen und Häusern)
  for (let k = 0; k < 360;) {
    const a = r() * Math.PI * 2, rr = HALF + 30 + r() * 150;
    const tx = Math.cos(a) * rr * 1.1, tz = Math.sin(a) * rr * 1.1;
    if (Math.max(Math.abs(tx), Math.abs(tz)) < HALF + ROAD / 2 + 12 || suburbDist(tx, tz) < 14 || serviceDist(tx, tz) < 14 || groundShape(tx, tz).d < 14 || countryDist(tx, tz) < 14 || (inPassRegion(tx, tz) && passNearest(tx, tz).d < 16)) continue; // nicht auf Strassen und Plätzen
    const ty = height(tx, tz); pines.push([tx, ty, tz, 0.9 + r() * 0.9]);
    for (let q = 0; q < 6; q++) tufts.push([tx + (vr() - 0.5) * 7, ty, tz + (vr() - 0.5) * 7, 1 + vr() * 0.6]);
    k++;
  }
  // Wiesen rund um die Stadt: viele Grasbüschel (nicht auf Strassen, Plätzen, Vororten und dem Pass)
  for (let k = 0, n = 0; k < 20000 && n < 6500; k++) {
    const a = vr() * Math.PI * 2, rr = HALF + 22 + vr() * 260, tx = Math.cos(a) * rr * 1.15, tz = Math.sin(a) * rr * 1.15;
    if (Math.max(Math.abs(tx), Math.abs(tz)) < HALF + ROAD / 2 + 8 || groundShape(tx, tz).d < 12 || suburbDist(tx, tz) < 6 || serviceDist(tx, tz) < 8 || countryDist(tx, tz) < 10
      || inPassRegion(tx, tz) || islandDist(tx, tz) < 30) continue; // am Pass liegt ein eigenes Gelände
    tufts.push([tx, height(tx, tz), tz, 0.9 + vr() * 0.8]); n++;
  }
  // Ladenfronten (Schaufenster + Markise), Balkone, Bänke: je ein Zeichen-Befehl für alle
  {
    const dummy = new THREE.Object3D(), acol = new THREE.Color(), awnCols = [0xdc2626, 0x16a34a, 0x2563eb, 0xf59e0b, 0x7c3aed, 0x0e7490, 0xdb2777, 0x1f2937];
    const inst = (geo, material, list, place) => {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((it, k) => { place(it, dummy); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); });
      im.castShadow = false; im.receiveShadow = true; scene.add(im); return im; // kleine Teile: kein eigener Schatten (spart Zeit)
    };
    inst(new THREE.BoxGeometry(1, 2.6, 0.12), mat({ color: 0x1e293b, metalness: 0.6, roughness: 0.1, emissive: 0xffe2a8, emissiveIntensity: 0.15 }), shops,
      ([x, z, len, ry], d) => { d.position.set(x, 1.6, z); d.rotation.set(0, ry, 0); d.scale.set(len, 1, 1); });
    const awn = inst(new THREE.BoxGeometry(1, 0.12, 1.6), mat({ color: 0xffffff, roughness: 0.8 }), shops,
      ([x, z, len, ry], d) => { d.position.set(x, 3.15, z); d.rotation.set(0, ry, 0); d.scale.set(len * 0.95, 1, 1); });
    shops.forEach((it, k) => awn.setColorAt(k, acol.setHex(awnCols[k % awnCols.length])));
    // Balkone: Platte, Glasgeländer vorne und seitlich, Handlauf aus Metall, manche mit Blumenkiste
    const outAt = ([x, y, z, ry, out], f, dy) => [x + (ry ? out * f : 0), y + dy, z + (ry ? 0 : out * f)];
    inst(new THREE.BoxGeometry(2.6, 0.16, 1.2), mat({ color: 0xf1f5f9, roughness: 0.6 }), balcs,
      ([x, y, z, ry], d) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(1, 1, 1); });
    const glassRail = mat({ color: 0xbfe3ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, envMapIntensity: 1.6 });
    inst(new THREE.BoxGeometry(2.5, 0.85, 0.04), glassRail, balcs, (b, d) => { d.position.set(...outAt(b, 0.56, 0.5)); d.rotation.set(0, b[3], 0); });
    const sides = balcs.flatMap(b => [[b, -1], [b, 1]]);
    inst(new THREE.BoxGeometry(0.04, 0.85, 1.1), glassRail, sides, ([b, k], d) => { const [x, y, z] = outAt(b, 0.02, 0.5), ry = b[3]; d.position.set(x + Math.cos(ry) * k * 1.27, y, z - Math.sin(ry) * k * 1.27); d.rotation.set(0, ry, 0); });
    const railM = mat({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
    inst(new THREE.BoxGeometry(2.62, 0.06, 0.08), railM, balcs, (b, d) => { d.position.set(...outAt(b, 0.56, 0.95)); d.rotation.set(0, b[3], 0); });
    const boxes = balcs.filter(() => vr() < 0.4);
    const fb = inst(new THREE.BoxGeometry(1.0, 0.28, 0.26), mat({ color: 0xffffff, roughness: 0.7 }), boxes, (b, d) => { d.position.set(...outAt(b, 0.42, 1.05)); d.rotation.set(0, b[3], 0); });
    const fl = inst(new THREE.BoxGeometry(0.9, 0.16, 0.2), mat({ color: 0xffffff, roughness: 0.8 }), boxes, (b, d) => { d.position.set(...outAt(b, 0.42, 1.27)); d.rotation.set(0, b[3], 0); });
    boxes.forEach((b, k) => { fb.setColorAt(k, acol.setHex([0x9a3412, 0x57534e, 0x166534][k % 3])); fl.setColorAt(k, acol.setHex([0xef4444, 0xf472b6, 0xfacc15, 0xa855f7, 0xffffff][k % 5])); });
    // Solarzellen auf den Dächern (leicht schräg)
    const sTex = canvasTex(64, 64, g => { g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#93c5fd'; g.lineWidth = 1; for (let k = 0; k <= 64; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 64); g.moveTo(0, k); g.lineTo(64, k); g.stroke(); } });
    inst(new THREE.BoxGeometry(1.9, 0.05, 1.25), mat({ map: sTex, metalness: 0.5, roughness: 0.25, envMapIntensity: 1.4 }), solar, ([x, y, z], d) => { d.position.set(x, y, z); d.rotation.set(-0.35, 0, 0); });
    const benchM = mat({ color: 0x8b5a2b, roughness: 0.8 });
    inst(new THREE.BoxGeometry(1.8, 0.1, 0.5), benchM, street, ([x, z, ry], d) => { d.position.set(x, 0.62, z); d.rotation.set(0, ry, 0); });
    inst(new THREE.BoxGeometry(1.8, 0.45, 0.08), benchM, street, ([x, z, ry], d) => { d.position.set(x - Math.sin(ry) * 0.22, 0.9, z - Math.cos(ry) * 0.22); d.rotation.set(0, ry, 0); });
    inst(new THREE.CylinderGeometry(0.25, 0.22, 0.8, 10), mat({ color: 0x166534, roughness: 0.6 }), street, ([x, z, ry], d) => { d.position.set(x + Math.cos(ry) * 1.6, 0.56, z - Math.sin(ry) * 1.6); d.rotation.set(0, 0, 0); }); // Abfalleimer
  }
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 3, 7), barkM = mat({ color: 0x6b4a32, roughness: 1 });
  const trunkM = new THREE.InstancedMesh(trunkGeo, barkM, trees.length);
  const crownM = new THREE.InstancedMesh(crownGeo(), leafMat(), trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach(([x, y, z, s], k) => {
    trunkM.setMatrixAt(k, m4.compose(p3.set(x, y + 1.5 * s, z), q, sc.set(s, s, s)));
    crownM.setMatrixAt(k, m4.compose(p3.set(x, y + 4.6 * s, z), q.setFromAxisAngle(UP, r() * 6.28), sc.set(s, s * 1.1, s))); q.identity();
    crownM.setColorAt(k, col.setHSL(0.21 + r() * 0.1, 0.62, 0.13 + vr() * 0.07)); // verschiedene Grüntöne, manche gelblicher
    round.push({ x, z, r: 0.7 * s, h: 7.5 * s });
  });
  // Tannen im Wald: dunkler, spitz
  const pTrunk = new THREE.InstancedMesh(trunkGeo, barkM, pines.length), pineM = new THREE.InstancedMesh(pineGeo(), mat({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }), pines.length);
  pines.forEach(([x, y, z, s], k) => {
    pTrunk.setMatrixAt(k, m4.compose(p3.set(x, y + 0.9 * s, z), q, sc.set(s * 0.8, s * 0.6, s * 0.8)));
    pineM.setMatrixAt(k, m4.compose(p3.set(x, y + 0.6 * s, z), q.setFromAxisAngle(UP, r() * 6.28), sc.set(s, s * 1.15, s))); q.identity();
    pineM.setColorAt(k, col.setHSL(0.33 + r() * 0.06, 0.5, 0.1 + vr() * 0.05));
    round.push({ x, z, r: 0.7 * s, h: 6 * s });
  });
  trunkM.castShadow = crownM.castShadow = pTrunk.castShadow = pineM.castShadow = true;
  decor.add(trunkM, crownM, pTrunk, pineM);
  // Büsche, Grasbüschel und Blumen (ohne eigenen Schatten: viele kleine Teile)
  const vegInst = (geo, material, list, color, tilt = 0) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach(([x, y, z, s], k) => {
      im.setMatrixAt(k, m4.compose(p3.set(x, y, z), q.setFromEuler(new THREE.Euler((vr() - 0.5) * tilt, vr() * 6.28, (vr() - 0.5) * tilt)), sc.set(s, s * (0.85 + vr() * 0.3), s)));
      im.setColorAt(k, color(col)); q.identity();
    });
    im.castShadow = false; im.receiveShadow = true; decor.add(im); return im;
  };
  vegInst(bushGeo(), leafMat({ bumpScale: 1.6 }), bushes, c => c.setHSL(0.22 + vr() * 0.12, 0.6, 0.16 + vr() * 0.08));
  vegInst(tuftGeo(), tuftMat(), tufts, c => c.setHSL(0.21 + vr() * 0.08, 0.62, 0.32 + vr() * 0.14), 0.25);
  const flowerGeo = mergeGeometries([[0, 0.32, 0], [0.12, 0.26, 0.08], [-0.1, 0.28, -0.07]].map(([x, y, z]) => { const g = new THREE.OctahedronGeometry(0.1, 0); g.translate(x, y, z); return g; }), false);
  const FLOWER = [0xef4444, 0xf472b6, 0xfacc15, 0xa855f7, 0xffffff, 0xfb923c, 0x60a5fa];
  vegInst(flowerGeo, mat({ color: 0xffffff, roughness: 0.6, emissive: 0x222222 }), flowers, c => c.setHex(FLOWER[Math.floor(vr() * FLOWER.length)]));
  vegInst(tuftGeo(), tuftMat(), flowers.map(([x, y, z]) => [x, y, z, 0.45]), c => c.setHSL(0.27, 0.6, 0.25)); // Blätter unter den Blumen

  // Strassenlampen auf den Trottoirs
  const lampPos = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (const s of [20, 44]) {
    if (i < N && segOn(i, j, 0)) for (const side of [-1, 1]) lampPos.push([node(i) + s, node(j) + side * 8.3]);
    if (j < N && segOn(i, j, 1)) for (const side of [-1, 1]) lampPos.push([node(i) + side * 8.3, node(j) + s]);
  }
  const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 6, 8), mat({ color: 0x3a3f4b, metalness: 0.6, roughness: 0.4 }), lampPos.length);
  const headM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), lampHeadMat, lampPos.length);
  lampPos.forEach(([x, z], k) => {
    poleM.setMatrixAt(k, m4.makeTranslation(x, 3.1, z));
    headM.setMatrixAt(k, m4.makeTranslation(x, 6.05, z));
  });
  poleM.castShadow = true;
  decor.add(poleM, headM);
  // Lichtkegel der Lampen auf dem Boden (nachts sichtbar): ein Bild mit weichem Rand, alle in einem Zeichen-Befehl
  const pool = document.createElement('canvas'); pool.width = pool.height = 64;
  const pg = pool.getContext('2d'), prg = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
  prg.addColorStop(0, 'rgba(255,255,255,1)'); prg.addColorStop(1, 'rgba(255,255,255,0)'); pg.fillStyle = prg; pg.fillRect(0, 0, 64, 64);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: new THREE.CanvasTexture(pool), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), lampPos.length);
  lampPos.forEach(([x, z], k) => pools.setMatrixAt(k, m4.makeTranslation(x, 0.2, z)));
  pools.visible = false;
  scene.add(pools);
  // Sterne (nachts)
  const sp = [];
  for (let k = 0; k < 900; k++) { const a = r() * Math.PI * 2, e = 0.08 + r() * 1.4; sp.push(Math.cos(a) * Math.cos(e) * 2400, Math.sin(e) * 2400, Math.sin(a) * Math.cos(e) * 2400); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.layers.set(1);
  scene.add(stars);
  // Scheinwerfer des eigenen Autos (nachts an)
  // Zwei Lichtkegel aus dem linken und rechten Scheinwerfer, hinten ein rotes Leuchten (Handy: nur ein Kegel, spart Rechenzeit)
  const headlight = new THREE.SpotLight(0xfff2d6, 0, 70, 0.5, 0.5, 1.2);
  scene.add(headlight, headlight.target);
  const headlight2 = MOBILE ? null : new THREE.SpotLight(0xfff2d6, 0, 70, 0.5, 0.5, 1.2);
  if (headlight2) scene.add(headlight2, headlight2.target);
  const tailGlow = MOBILE ? null : new THREE.PointLight(0xff2a14, 0, 5, 2);
  if (tailGlow) scene.add(tailGlow);

  // Ampeln: vor jeder Kreuzung rechts ein Mast; Lichter teilen sich je Richtung und Farbe ein Material
  const lamps = {};
  for (const ax of ['x', 'z']) for (const [c, hex] of [['red', 0xff2020], ['yellow', 0xffb020], ['green', 0x20ff60]]) {
    lamps[ax + c] = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: hex, emissiveIntensity: 0 });
  }
  const dark = mat({ color: 0x23262d, metalness: 0.5, roughness: 0.5 });
  const bulb = new THREE.SphereGeometry(0.13, 12, 8);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    if (!hasLights(i, j)) continue;
    for (let d = 0; d < 4; d++) {
      const [fx, fz] = DIRS[d];
      if (!inGrid(i - fx, j - fz) || isPed(i - fx, j - fz, d)) continue;
      const rx = -fz, rz = fx, x = node(i) - fx * 11 + rx * 8.4, z = node(j) - fz * 11 + rz * 8.4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 8), dark);
      pole.position.set(x, 2.3, z); pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(fx ? 0.35 : 0.5, 1.2, fx ? 0.5 : 0.35), dark);
      head.position.set(x, 4.1, z);
      decor.add(pole, head);
      [['red', 4.5], ['yellow', 4.1], ['green', 3.7]].forEach(([c, y]) => {
        const b = new THREE.Mesh(bulb, lamps[axisOf(d) + c]);
        b.position.set(x - fx * 0.2, y, z - fz * 0.2);
        decor.add(b);
      });
    }
  }


  // Blitzer: an jeder zehnten Ampel eine Rotlicht-Kamera am Mast; an einigen Strassen ein Radarkasten fürs Tempo
  const camBody = mat({ color: 0x8f969f, metalness: 0.4, roughness: 0.5 }), lensM = mat({ color: 0x050505, metalness: 0.9, roughness: 0.1 });
  const redCams = new Map(), speedCams = [];
  const camAt = (x, y, z, fx, fz) => { // Kamerakasten, schaut gegen die Fahrtrichtung (fx, fz)
    box(fx ? 0.6 : 0.42, 0.4, fx ? 0.42 : 0.6, camBody, x, y, z);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), lensM);
    l.rotation.set(fz ? Math.PI / 2 : 0, 0, fx ? Math.PI / 2 : 0);
    l.position.set(x - fx * 0.33, y + 0.05, z - fz * 0.33);
    decor.add(l);
    box(fx ? 0.04 : 0.24, 0.12, fx ? 0.24 : 0.04, mat({ color: 0xdddddd, emissive: 0x555555 }), x - fx * 0.31, y - 0.12, z - fz * 0.31);
    return { x: x - fx * 0.4, y, z: z - fz * 0.4 };
  };
  let nLight = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    if (!hasLights(i, j)) continue;
    for (let d = 0; d < 4; d++) {
      const [fx, fz] = DIRS[d];
      if (!inGrid(i - fx, j - fz) || isPed(i - fx, j - fz, d) || nLight++ % 10 !== 4) continue;
      const rx = -fz, rz = fx, x = node(i) - fx * 11 + rx * 8.4, z = node(j) - fz * 11 + rz * 8.4;
      redCams.set(i + ',' + j + ',' + d, camAt(x - fx * 0.1, 3.0, z - fz * 0.1, fx, fz));
    }
  }
  // Tempotafeln am Anfang jeder Strasse (rechts) und Radarkästen an zehn Stellen
  const limitTex = n => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d61f1f'; g.lineWidth = 16; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 64, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const plates = Object.fromEntries([30, 50, 80].map(n => [n, mat({ map: limitTex(n), transparent: true, alphaTest: 0.5, roughness: 0.5 })]));
  const plateGeo = new THREE.PlaneGeometry(0.9, 0.9), signPole = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6);
  const rs = rng(77), segs = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (const [fx, fz] of DIRS) {
    if (!inGrid(i + fx, j + fz) || isPed(i, j, DIRS.findIndex(q => q[0] === fx && q[1] === fz))) continue;
    const rx = -fz, rz = fx, lim = streetLimit(fx ? j : i), x = node(i) + fx * 15 + rx * (ROAD / 2 + 0.9), z = node(j) + fz * 15 + rz * (ROAD / 2 + 0.9);
    const p = new THREE.Mesh(signPole, dark); p.position.set(x, 1.2, z); decor.add(p);
    const s = new THREE.Mesh(plateGeo, plates[lim]); s.position.set(x - fx * 0.06, 2.4, z - fz * 0.06);
    s.rotation.y = Math.atan2(-fx, -fz); // Schild schaut den ankommenden Autos entgegen
    decor.add(s);
    segs.push({ i, j, fx, fz, lim });
  }
  while (speedCams.length < 10) {
    const g = segs[Math.floor(rs() * segs.length)];
    if (speedCams.some(c => c.seg === g)) continue;
    const rx = -g.fz, rz = g.fx, x = node(g.i) + g.fx * BLOCK / 2 + rx * (ROAD / 2 + 1.2), z = node(g.j) + g.fz * BLOCK / 2 + rz * (ROAD / 2 + 1.2);
    box(0.5, 1.6, 0.5, mat({ color: 0x5b6470, roughness: 0.6 }), x, 0.8, z, true); // Säule
    const at = camAt(x, 1.85, z, g.fx, g.fz);
    speedCams.push({ seg: g, ...at, fx: g.fx, fz: g.fz, limit: g.lim, cd: 0 });
  }

  buildHighway({ group: decor, asphaltMat, lineMat, sign, grassMat }); // Autobahn im Süden (outskirts.js)
  const areas = buildAreas({ group: decor, scene, asphaltMat, lineMat, sign }); // Hafen und Flughafen
  const country = buildCountry({ scene, group: decor, asphaltMat, grassMat, sign, natural, makePerson, height }); // Bauernhof, Strand, Skigebiet
  round.push(...(country.round || []), ...(country.skiRound || [])); // Tannen und Felsen am Berg sind fest
  const moon = buildMoon({ scene }); // der Mond (weit weg, nur mit der Rakete)
  solid.push(...areas.solids);
  areas.pass = buildPass({ scene, group: decor, asphaltMat, lineMat, sign, natural, // Passstrasse im Norden
    terrainMesh: o => terrain({ ...o, detail: grassDetail, detailRepeat: 100 }) });
  // Diamantinsel (monaco.js): eigenes Gelände, Villen, Palast, Jachthafen, Piste
  const monaco = buildMonaco({ scene, group: decor, asphaltMat, lineMat, paveMat, sign, rng, round, solid,
    terrainMesh: o => terrain({ ...o, detail: grassDetail, detailRepeat: 160 }) });
  if (PARTY) { // Geburtstag (Version 200, party.js): Wimpelketten über allen Strassen, Ballon-Sträusse an Kreuzungen, Torte und Banner
    const pg = partyGeo(), off = ROAD / 2 + 1.3;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      for (const d of [0, 1]) {
        if (isPed(i, j, d)) continue;
        const [fx, fz] = DIRS[d], mx = node(i) + fx * BLOCK / 2, mz = node(j) + fz * BLOCK / 2; // Mitte des Strassenstücks, quer darüber
        const ax = mx - fz * off, az = mz - fx * off, bx = mx + fz * off, bz = mz + fx * off;
        pg.pole(ax, az); pg.pole(bx, bz); pg.bunting(ax, az, bx, bz);
      }
      if ((i + j) % 2 === 0 && nodeSegs(i, j) >= 3 && blockOn(i, j) && (i + ',' + j) !== plaza) pg.bunch(node(i) + off + 0.6, node(j) + off + 0.6); // Ecke im Block (i, j)
    }
    const [pi, pj] = plaza.split(',').map(Number), pcx = (node(pi) + node(pi + 1)) / 2, pcz = (node(pj) + node(pj + 1)) / 2; // Platz mit Brunnen
    for (const [dx, dz] of [[-19, -19], [19, -19], [-19, 19]]) pg.bunch(pcx + dx, pcz + dz, 0.16, 7);
    decor.add(pg.mesh());
    birthdayCake(decor, pcx + 16, pcz + 16, 4.6); round.push({ x: pcx + 16, z: pcz + 16, r: 4.8 });
    birthdayBanner(decor, pcx, pcz - 18, 0); birthdayBanner(decor, pcx - 18, pcz, Math.PI / 2);
    birthdayBanner(decor, node(1) + 60, node(0), Math.PI / 2, ROAD + 3); // gleich nach dem Start über die Strasse
  }
  scene.add(decor);
  mergeStatic(decor, { bySig: true, tile: window.__mergeTile ?? 400 }); // gleiche Farben zusammen, in grossen Kacheln (weniger Zeichen-Befehle)
  const clouds = cloudDome({ radius: 2600, coverage: 0.52, shade: '#aebccd', seed: 9 });
  clouds.layers.set(1);
  scene.add(clouds);
  for (const o of [clouds, sun, sun.target]) o.userData.noWarp = true; // folgen der Kamera bzw. dem eigenen Auto (render)
  const t0 = performance.now();
  for (const o of [...scene.children]) warpStatic(o, new Set([sky, stars, clouds]));
  console.log('Stadt verbogen in', Math.round(performance.now() - t0), 'ms');
  const chunks = window.__chunkSize === 0 ? [] : chunkInstances(scene, new Set([pools]));
  warmUp(renderer, scene, camera);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  flash.visible = false;
  scene.add(flash);
  sky.userData.noWarp = stars.userData.noWarp = true; // wandern mit der Kamera (render): Himmel überall, auch weit draussen
  return { chunks, skyMesh: sky, stars, monaco, renderer, scene, camera, sun, clouds, lamps, solid, round, parks, places, sign, country, height, moon, redCams, speedCams, flash, areas, ground: { asphalt: asphaltMat, grass: grassMat, pave: paveMat, land: land.material },
    night: { sky: su, hemi, envs: { ...envs, day: dayEnv }, walls: [...walls, ...homeWalls], heads: headM.material, pools, stars, headlight, headlight2, tailGlow, fog: scene.fog } };
}

// Gegen Ruckeln: grosse InstancedMesh (Bäume, Büsche, Blumen, Grasbüschel über die ganze Insel) in Kacheln von CHUNK
// Metern teilen. So zeichnet three.js nur, was im Bild (und im Schattenbereich) liegt, statt jedes Bild alles. Kleines
// (Gras, Blumen) wird weiter weg ganz weggelassen (stepChunks). Gilt nur für Dinge, die sich nach dem Bauen nicht ändern.
const CHUNK = 300, SMALL_SEE = 170;
function chunkInstances(scene, skip) {
  const list = [], out = [], m = new THREE.Matrix4(), col = new THREE.Color();
  scene.traverse(o => { if (o.isInstancedMesh && o.count > 48 && !skip.has(o) && o.parent) list.push(o); });
  const size = window.__chunkSize || CHUNK; // zum Messen änderbar
  for (const im of list) {
    const buckets = new Map();
    for (let k = 0; k < im.count; k++) {
      im.getMatrixAt(k, m);
      const key = Math.floor(m.elements[12] / size) + ',' + Math.floor(m.elements[14] / size);
      let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(k);
    }
    if (!im.geometry.boundingSphere) im.geometry.computeBoundingSphere();
    const small = im.geometry.boundingSphere.radius < 1.6;
    if (buckets.size < 2) { im.frustumCulled = true; im.computeBoundingSphere(); out.push({ o: im, small }); continue; }
    for (const ks of buckets.values()) {
      const c = new THREE.InstancedMesh(im.geometry, im.material, ks.length);
      ks.forEach((k, i) => { im.getMatrixAt(k, m); c.setMatrixAt(i, m); if (im.instanceColor) { im.getColorAt(k, col); c.setColorAt(i, col); } });
      c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow; c.renderOrder = im.renderOrder; c.layers.mask = im.layers.mask;
      c.matrixAutoUpdate = im.matrixAutoUpdate; c.matrix.copy(im.matrix); c.position.copy(im.position); c.quaternion.copy(im.quaternion); c.scale.copy(im.scale);
      c.userData = im.userData; c.name = im.name; c.visible = im.visible; c.frustumCulled = true;
      c.computeBoundingSphere();
      im.parent.add(c);
      out.push({ o: c, small });
    }
    im.parent.remove(im);
    im.dispose(); // nur die Instanz-Daten; Form und Material gehören jetzt den Kacheln
  }
  for (const ch of out) { ch.o.updateMatrixWorld(true); ch.c = ch.o.boundingSphere.center.clone().applyMatrix4(ch.o.matrixWorld); ch.r = ch.o.boundingSphere.radius; }
  return out;
}
function stepChunks() { // Kleines weit weg nicht zeichnen (alle paar Bilder prüfen)
  if ((city.chunkT = (city.chunkT || 0) - 1) > 0) return;
  city.chunkT = 8;
  const cam = S.camera.position;
  for (const ch of S.chunks) if (ch.small) ch.o.visible = Math.hypot(ch.c.x - cam.x, ch.c.z - cam.z) - ch.r < SMALL_SEE;
}

// Platz in der Stadtmitte mit Brunnen und Bänken
function buildPlaza(g, cx, cz, round) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.85 });
  const water = new THREE.MeshStandardMaterial({ color: 0x3b8bd0, roughness: 0.05, metalness: 0.3, emissive: 0x0b2a4a, emissiveIntensity: 0.4 });
  const add = (geo, m, x, y, z, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; g.add(o); };
  add(new THREE.CylinderGeometry(6, 6.2, 0.7, 40), stone, cx, 0.5, cz);
  add(new THREE.CylinderGeometry(5.4, 5.4, 0.1, 40), water, cx, 0.82, cz, false);
  add(new THREE.CylinderGeometry(0.5, 0.7, 3, 16), stone, cx, 2.2, cz);
  add(new THREE.CylinderGeometry(1.8, 0.6, 0.5, 24), stone, cx, 3.7, cz);
  add(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 24), water, cx, 3.92, cz, false);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
  for (const [dx, dz, rot] of [[0, 11, 0], [0, -11, 0], [11, 0, Math.PI / 2], [-11, 0, Math.PI / 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.6), wood);
    b.position.set(cx + dx, 0.62, cz + dz); b.rotation.y = rot; b.castShadow = true;
    g.add(b);
  }
  round.push({ x: cx, z: cz, r: 6.4 });
}

// ---------- Verkehr ----------
// Alles einmal an die Grafikkarte schicken (Formen, Bilder), solange noch geladen wird – sonst ruckelt es jedes Mal,
// wenn man zum ersten Mal in eine Gegend kommt (in der Stadtmitte fast eine Sekunde)
function prewarm() {
  const shown = [], culled = [];
  S.scene.traverse(o => {
    if (!o.visible) { shown.push(o); o.visible = true; }
    if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
  });
  if (MOBILE) S.renderer.compile(S.scene, S.camera); // Handy: nur die Shader übersetzen. Alles auf einmal zeichnen (über 12 Mio. Dreiecke, alle Bilder
  else { //   auf die Grafikkarte) liess das iPhone abstürzen = Seite lädt neu, man fliegt sofort aus der Stadt
    const rt = new THREE.WebGLRenderTarget(64, 64);
    S.renderer.setRenderTarget(rt);
    S.renderer.render(S.scene, S.camera);
    S.renderer.setRenderTarget(null);
    rt.dispose();
  }
  for (const o of shown) o.visible = false;
  for (const o of culled) o.frustumCulled = true;
}
// Bot-Autos werfen keinen echten Schatten (der weiche Schatten darunter reicht): spart viel Arbeit pro Bild
const noShadow = m => m.traverse(o => { o.castShadow = false; });
function makeCar(kinds, i, j, d, s, given = null) {
  // Stadt: vor allem günstige Autos; teure (selten, episch, legendär) fahren auf der Diamantinsel (monaco.js), hier nur ab und zu eines
  const cheap = k => !hasModel(k) || (!['rare', 'epic', 'legendary'].includes((kinds[k] || {}).tier) && !['sports', 'muscle', 'gt3rs'].includes(k)); // Porsche, SLS: teuer
  let kind = POOL[Math.floor(Math.random() * POOL.length)];
  if (!cheap(kind) && Math.random() > 0.06) kind = 'car';
  if (!realTraffic(kind)) { const real = POOL.filter(k => hasModel(k) && cheap(k)); if (real.length) kind = real[Math.floor(Math.random() * real.length)]; } // nur echte Autos (Busse/Lastwagen bis es echte gibt)
  if (kind === 'car' && Math.random() < 0.06) { const lux = Object.keys(kinds).filter(k => hasModel(k) && !cheap(k) && !kinds[k].secret); if (lux.length) kind = lux[Math.floor(Math.random() * lux.length)]; } // selten ein teures
  const v = given || { kind, color: kinds[kind].color || COLORS[Math.floor(Math.random() * COLORS.length)], special: null, seed: Math.floor(Math.random() * 1e6) };
  const mesh = buildCar(v, kinds);
  noShadow(mesh);
  return { v, mesh, i, j, d, s, speed: 6 + Math.random() * 4, cruise: 10 + Math.random() * 4, turn: null,
    len: mesh.userData.length, x: 0, z: 0, h: 0, blocked: 0, waitMe: 0, honkT: 0 };
}

function spawnTraffic(kinds) {
  const cars = [];
  for (let tries = 0; cars.length < TRAFFIC && tries < 500; tries++) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1)), d = Math.floor(Math.random() * 4);
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1]) || isPed(i, j, d)) continue;
    const s = 10 + Math.random() * (BLOCK - 26);
    if (cars.some(c => c.i === i && c.j === j && c.d === d && Math.abs(c.s - s) < 14)) continue;
    const c = makeCar(kinds, i, j, d, s);
    placeOnSegment(c);
    cars.push(c);
  }
  return cars;
}

function placeOnSegment(c) {
  const [fx, fz] = DIRS[c.d];
  const off = LANE + (c.side || 0); // side: zur Seite gefahren (Platz für die Ambulanz)
  c.x = node(c.i) + fx * c.s - fz * off;
  c.z = node(c.j) + fz * c.s + fx * off;
  c.h = Math.atan2(fz, fx);
}

// Weg durch die Kreuzung: Bogen von der eigenen Spur auf die Spur der neuen Richtung
function planTurn(c) {
  const bi = c.i + DIRS[c.d][0], bj = c.j + DIRS[c.d][1];
  const options = [0, 1, 3].map(k => (c.d + k) % 4).filter(d => inGrid(bi + DIRS[d][0], bj + DIRS[d][1]) && !isClosed(bi, bj, d)); // geradeaus, rechts, links (nicht in die Baustelle)
  const weights = options.map(d => (d === c.d ? 3 : 1));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0), d2 = options[0];
  for (let k = 0; k < options.length; k++) { pick -= weights[k]; if (pick <= 0) { d2 = options[k]; break; } }
  if (!options.length) d2 = (c.d + 2) % 4;
  if (c.blueGo && options.includes(c.d)) d2 = c.d; // fährt zur Blauen Zone: geradeaus
  const [fx, fz] = DIRS[c.d], [gx, gz] = DIRS[d2], bx = node(bi), bz = node(bj);
  const P0 = [bx - fx * 7 - fz * LANE, bz - fz * 7 + fx * LANE];
  const P2 = [bx + gx * 7 - gz * LANE, bz + gz * 7 + gx * LANE];
  const pts = [P0];
  if (ROUND.has(bi + ',' + bj)) { // Kreisel: rechts hinein, die Insel links lassen, im Kreis bis zur Ausfahrt
    const a0 = Math.atan2(P0[1] - bz, P0[0] - bx), a1 = Math.atan2(P2[1] - bz, P2[0] - bx);
    let span = ((a0 - a1) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); // im Kreis rückwärts (Winkel nimmt ab)
    if (span < 0.6) span += Math.PI * 2; // Wenden: einmal ganz herum
    const from = a0 - 0.45, to = a0 - span + 0.45, n = Math.max(4, Math.ceil((from - to) / 0.25));
    for (let k = 0; k <= n; k++) { const a = from - (from - to) * k / n; pts.push([bx + Math.cos(a) * ROUND_R, bz + Math.sin(a) * ROUND_R]); }
  } else {
    const P1 = d2 === c.d ? [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2] : [bx - fz * LANE - gz * LANE, bz + fx * LANE + gx * LANE];
    for (let k = 1; k < 8; k++) pts.push(bez(P0, P1, P2, k / 8));
  }
  pts.push(P2);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  c.turn = { pts, cum, len: cum[cum.length - 1], t: 0, d2, bi, bj, straight: d2 === c.d && !ROUND.has(bi + ',' + bj) };
}
// Punkt auf dem Weg durch die Kreuzung (t = 0 … 1 nach Länge)
function turnAt(T, t) {
  const L = t * T.len, cum = T.cum;
  let k = 1; while (k < cum.length - 1 && cum[k] < L) k++;
  const a = T.pts[k - 1], b = T.pts[k], f = Math.min(1, Math.max(0, (L - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1)));
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
function bez(a, b, c, t) { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; }

// Höchsttempo wegen Autos (und dir) vorne auf derselben Spur
function followLimit(c, me) {
  let lim = Infinity, byMe = false, byWreck = false;
  const fx = Math.cos(c.h), fz = Math.sin(c.h);
  const check = (ox, oz, olen, isMe, isWreck) => {
    const dx = ox - c.x, dz = oz - c.z, along = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
    if (along <= 0 || along > 18 || lat > 2.6) return;
    const gap = along - (c.len + olen) / 2 - 2;
    const v = Math.max(0, gap * 1.3);
    if (v < lim) { lim = v; byMe = isMe; byWreck = isWreck || false; }
  };
  for (const o of city.cars) if (o !== c && !o.off && !(c.amb && o.side > 1)) check(o.x, o.z, o.len, false, o.wreck > 0 || o.jam); // Nacht-Lastwagen fehlen; die Ambulanz fährt an Platz machenden vorbei
  if (city.police) check(city.police.pos.x, city.police.pos.z, 5, false);
  if (city.truck && c !== city.truck) check(city.truck.x, city.truck.z, city.truck.len, false); // Lieferwagen
  if (me.alt < 2.5) check(me.pos.x, me.pos.z, me.len, true); // wer darüber fliegt, stört nicht
  for (const p of city.peds || []) { // Fussgänger auf dem Zebrastreifen (oder umgefallen auf der Strasse): anhalten
    if (!p.onZebra && !(p.down > 0)) continue;
    const dx = p.x - c.x, dz = p.z - c.z, along = dx * fx + dz * fz;
    if (along > 0 && along < 22 && Math.abs(-dx * fz + dz * fx) < 4.5) lim = Math.min(lim, Math.max(0, (along - c.len / 2 - 3) * 1.2));
  }
  return { lim, byMe, byWreck };
}

function stepTraffic(dt) {
  const t = city.t, me = city.me;
  for (const c of city.cars) {
    if (c.wreck > 0) { // Unfallauto steht schräg da
      const m = c.mesh;
      m.visible = Math.hypot(c.x - S.camera.position.x, c.z - S.camera.position.z) < city.see;
      m.position.set(c.x, 0, c.z); m.rotation.y = -c.h - c.wreckYaw;
      continue;
    }
    if (c.lot) { stepLot(c, dt); showCar(c, dt); continue; } // in der Blauen Zone
    if (c.off) { c.mesh.visible = false; continue; } // nachts: Lastwagen stehen im Depot (tagsüber die Strassenwischer)
    const special = trafficSpecial(c, dt); // Bus an der Haltestelle, Schulbus, Platz machen für die Ambulanz
    const B = S.places.blue;
    if (B && !c.turn && c.i === B.seg.i && c.j === B.seg.j && c.d === B.seg.d && c.s > 12 && c.s < 18 && !c.lotAsk && !c.rush && !c.reckless && c.len < 5.6) {
      c.lotAsk = true; // an der Einfahrt: hinein? (meist, wenn viel los ist; immer, wenn es extra dafür kam)
      const q = c.blueGo || Math.random() < (city.blue.busy ? 0.6 : 0.12) ? freeBlue() : null;
      c.blueGo = false;
      if (q) { enterLot(c, q); showCar(c, dt); continue; }
    }
    if (c.s < 10) c.lotAsk = false;
    let limit = c.turn ? c.cruise * (c.turn.straight ? 1 : 0.5) : c.cruise;
    if (c.rush || c.reckless) limit *= 1.5; // Raser
    let atLight = false;
    if (!c.turn && !c.reckless) { // rote oder gelbe Ampel vorne? (Raser fahren einfach durch)
      const bi = c.i + DIRS[c.d][0], bj = c.j + DIRS[c.d][1], stop = STOP - c.len / 2;
      if (hasLights(bi, bj) && c.s < stop) {
        const st = lightState(axisOf(c.d), t);
        if (st === 'red' || (st === 'yellow' && stop - c.s > 7)) {
          limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * 5 * (stop - c.s - 0.3))));
          atLight = stop - c.s < 25;
        }
      }
    }
    if (!c.turn && c.s > BLOCK - 22) { // vor dem Kreisel: warten, wenn schon jemand im Kreis an der Einfahrt ist
      const bi = c.i + DIRS[c.d][0], bj = c.j + DIRS[c.d][1];
      if (ROUND.has(bi + ',' + bj)) {
        const [fx, fz] = DIRS[c.d], ex = node(bi) - fx * 7 - fz * LANE, ez = node(bj) - fz * 7 + fx * LANE;
        limit = Math.min(limit, c.cruise * 0.6);
        if (city.cars.some(o => o !== c && o.turn && o.turn.bi === bi && o.turn.bj === bj && o.turn.t > 0.08 && Math.hypot(o.x - ex, o.z - ez) < 7.5))
          limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * 5 * (BLOCK - 8 - c.s))));
      }
    }
    const f = followLimit(c, me);
    c.jam = f.byWreck && f.lim < 1; // steht im Stau hinter einem Unfall: Stau wächst nach hinten
    // Steckt ein Auto lange fest (z.B. zwei Abbieger in der Kreuzung), fährt es vorsichtig weiter (nicht im Stau)
    c.stuck = !atLight && !f.byMe && !f.byWreck && f.lim < 0.5 ? (c.stuck || 0) + dt : 0;
    if (c.stuck > 6) { c.ghost = 2.5; c.stuck = 0; }
    if (c.ghost > 0) c.ghost -= dt;
    else if (!c.rush && !c.reckless) limit = Math.min(limit, f.lim); // Raser bremsen nicht
    if (c.blocked > 0) { c.blocked -= dt; limit = 0; } // nach einem Rempler kurz stehen
    if (special !== null) limit = Math.min(limit, special);
    if (c.amb) { limit = f.byMe ? Math.min(c.cruise, f.lim) : c.turn ? c.cruise * 0.6 : c.cruise; c.ambBlock = f.byMe && f.lim < 2; } // Ambulanz: nur du kannst sie aufhalten
    // Wer wegen dir warten muss, hupt irgendwann
    c.waitMe = f.byMe && limit < 1 ? c.waitMe + dt : 0;
    c.honkT -= dt;
    if (c.waitMe > 1.6 && c.honkT <= 0) {
      const dist = Math.hypot(me.pos.x - c.x, me.pos.z - c.z);
      horn(Math.max(0.15, 1 - dist / 40), 0.35 + Math.random() * 0.3, 0.85 + Math.random() * 0.3);
      c.honkT = 3 + Math.random() * 3;
    }
    c.speed = c.speed < limit ? Math.min(limit, c.speed + 3 * dt) : Math.max(limit, c.speed - 7 * dt);
    c.speed = Math.max(0, c.speed);
    const wk = 1 / warpStretch(c.x, c.z, Math.cos(c.h), Math.sin(c.h)); // im Bild gleichmässig schnell
    if (!c.turn) {
      c.s += c.speed * dt * wk;
      if (c.s >= BLOCK - 7) planTurn(c);
      else placeOnSegment(c);
    }
    if (c.turn) {
      const T = c.turn;
      T.t = Math.min(1, T.t + c.speed * dt * wk / T.len);
      const p = turnAt(T, T.t), p2 = turnAt(T, Math.min(1, T.t + 0.6 / T.len));
      if (p2[0] !== p[0] || p2[1] !== p[1]) c.h = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      c.x = p[0]; c.z = p[1];
      if (T.t >= 1) { c.i = T.bi; c.j = T.bj; c.d = T.d2; c.s = 7; c.turn = null; c.reckless = c.rush = false; placeOnSegment(c); }
    }
    showCar(c, dt);
  }
}
const LOD_NEAR = 42; // weiter weg: einfache Fassung der Autos (setLod in cars3d.js)
function showCar(c, dt) {
  const m = c.mesh, d = Math.hypot(c.x - S.camera.position.x, c.z - S.camera.position.z), seen = d < city.see;
  m.visible = seen;
  if (!seen) return;
  const B = S.places.blue, onLot = c.lot && B && Math.abs(c.x - B.cx) < 23 && Math.abs(c.z - B.cz) < 23;
  m.position.set(c.x, onLot ? 0.18 : 0, c.z);
  m.rotation.y = -c.h;
  const far = d > LOD_NEAR && c !== city.amb && !c.school; // Ambulanz und Schulbus blinken auch von weitem
  setLod(m, far);
  if (far) return; // Räder und Blinker sieht man von weitem nicht
  for (const w of m.userData.wheels) w.rotation.z -= (c.lot && c.lot.state === 'back' ? -1 : 1) * c.speed * dt / 0.35;
  animateCar(m, city.t, null);
}

// ---------- Parkhaus ----------
// city.pkL = Ebene (0 unten … 3 Dach), city.pkR = auf welcher Rampe (r: von Ebene r nach r+1) oder null.
// Grosse Höhensprünge sind verboten (so wirken Deck-Kanten und Rampenseiten wie Wände, und man fällt nicht hinunter).
const PK_LV = 3.5;
const pkIn = (x, z) => { const P = S.places.park; return !!P && x > P.F.x0 && x < P.F.x1 && z > P.F.z0 && z < P.F.z1; };
const pkStrip = (x, z) => { const R = S.places.park.RS; return x > R.x0 && x < R.x1 && z > R.z0 - 0.5 && z < R.z1 + 0.5; };
const pkT = z => { const R = S.places.park.RS; return Math.max(0, Math.min(1, (z - R.z0) / (R.z1 - R.z0))); };
function pkChoose(t, y) {
  let best = 0, bd = 1e9;
  for (const r of [city.pkL || 0, (city.pkL || 0) - 1]) if (r >= 0 && r <= 2) { const d = Math.abs((r + t) * PK_LV - y); if (d < bd) { bd = d; best = r; } }
  return best;
}
function parkY(x, z) { // Bodenhöhe im Parkhaus
  if (pkStrip(x, z)) { const t = pkT(z), r = city.pkR != null ? city.pkR : pkChoose(t, city.gy || 0); return (r + t) * PK_LV; }
  return (city.pkL || 0) * PK_LV;
}
function parkBlocked(x, z) {
  const inside = pkIn(x, z);
  if (!inside) return (city.pkL || 0) > 0 || city.pkR != null; // oben nicht über die Brüstung hinaus
  let y, L = city.pkL || 0;
  if (pkStrip(x, z)) { const t = pkT(z), r = city.pkR != null ? city.pkR : pkChoose(t, city.gy || 0); y = (r + t) * PK_LV; }
  else if (city.pkR != null) { L = Math.max(0, Math.min(3, Math.round(city.pkR + pkT(z)))); y = L * PK_LV; }
  else y = L * PK_LV;
  if (Math.abs(y - (city.gy || 0)) > 0.8) return true;
  for (const c of S.places.park.parked) if (c.L === L && Math.abs(x - c.x) < 1.1 + city.me.radius * 0.6 && Math.abs(z - c.z) < 2.4 + city.me.radius * 0.6) return true;
  return false;
}
function parkStep(x, z) {
  if (!pkIn(x, z)) { city.pkL = 0; city.pkR = null; city.pkTold = false; return; }
  if (!city.pkTold) { city.pkTold = true; showMsg('🅿️ Parkhaus – die Rampe ist hinten rechts', 1.8); }
  if (pkStrip(x, z)) { if (city.pkR == null) city.pkR = pkChoose(pkT(z), city.gy || 0); }
  else if (city.pkR != null) {
    city.pkL = Math.max(0, Math.min(3, Math.round(city.pkR + pkT(z)))); city.pkR = null;
    showMsg(city.pkL === 3 ? '🌇 Auf dem Dach – schöne Aussicht!' : city.pkL ? '🅿️ Ebene ' + city.pkL : '🅿️ Erdgeschoss', 1.4);
  }
}

// ---------- Besonderer Verkehr ----------
// Postautos halten an den Haltestellen 🚏 (Leute steigen ein). Der Schulbus hält ab und zu mit Blinklicht: nicht
// überholen! Ab und zu kommt eine Ambulanz mit Blaulicht von hinten: alle fahren zur Seite; wer sie aufhält, bekommt
// eine Busse. Nachts (22–5 Uhr) fahren keine Lastwagen, dafür die Strassenwischer.
const TRUCKS = new Set(['delivery', 'garbage', 'parcel', 'bakery', 'tanker', 'umzug', 'icecream']);
const isNight = () => { const m = clockMins(); return m >= 22 * 60 || m < 5 * 60; };
function setupTrafficSpecials(kinds) {
  city.stops = new Map(); city.stopList = [];
  const used = new Set();
  for (let tries = 0; tries < 200 && city.stopList.length < 14; tries++) { // Haltestellen auf zufälligen Strassenstücken
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1)), d = Math.floor(Math.random() * 4);
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1]) || isPed(i, j, d) || used.has(i + ',' + j) || (d % 2 === 0 ? j === 0 : i === 0)) continue;
    used.add(i + ',' + j);
    const [fx, fz] = DIRS[d], s0 = 30, x = node(i) + fx * s0 - fz * (ROAD / 2 + 1.6), z = node(j) + fz * s0 + fx * (ROAD / 2 + 1.6);
    const st = { i, j, d, s: s0, x, z, people: [], away: 0 };
    if (!S.stopMeshes) S.stopMeshes = [];
    const g = new THREE.Group(); g.position.set(x, 0.16, z); g.rotation.y = -Math.atan2(fz, fx); S.scene.add(g); S.stopMeshes.push(g);
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 1.8), M(0x1f2937)); roof.position.set(0, 2.5, 0.6); g.add(roof);
    const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.3, 0.08), M(0x93c5fd, { transparent: true, opacity: 0.45 })); back.position.set(0, 1.3, 1.45); g.add(back);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.5), M(0x8b5a2b)); bench.position.set(0, 0.5, 1.1); g.add(bench);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), M(0x9ca3af)); pole.position.set(-2.4, 1.4, 0); g.add(pole);
    const sg = S.sign('🚏', '#facc15', '#111827', 0.8, 0.8); sg.position.set(-2.4, 2.9, 0); g.add(sg);
    for (let k = 0; k < 2; k++) { const pm = makePerson(SHIRTS[(i + k) % SHIRTS.length], HAIRS[(j + k) % HAIRS.length], SKINS[(i + j + k) % SKINS.length]);
      pm.traverse(o => { o.castShadow = false; }); pm.position.set(-0.6 + k * 1.3, 0, 0.6); pm.rotation.y = -Math.PI / 2; g.add(pm); st.people.push(pm); }
    city.stops.set(i + ',' + j + ',' + d, st); city.stopList.push(st);
  }
  const add = (kind, extra) => { if (!kinds[kind]) return null; let c;
    for (let t = 0; t < 30; t++) { const i = Math.floor(Math.random() * N), j = 1 + Math.floor(Math.random() * (N - 1)); c = makeCar(kinds, i, j, 0, 15, { kind, color: kinds[kind].color, special: null }); break; }
    placeOnSegment(c); Object.assign(c, extra); S.scene.add(c.mesh); city.cars.push(c); return c; };
  for (let k = 0; k < 3; k++) add('postauto', { bus: true, cruise: 10 });
  const sb = add('schoolbus', { school: true, cruise: 9, schoolT: 25 });
  if (sb) { // Blinklichter und Stopp-Schild (nur beim Halten sichtbar)
    const g = new THREE.Group(), red = new THREE.MeshBasicMaterial({ color: 0xff2020 }), L = sb.len / 2;
    for (const [x, z] of [[L - 0.3, -0.7], [L - 0.3, 0.7], [-L + 0.3, -0.7], [-L + 0.3, 0.7]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), red); b.position.set(x, 2.4, z); g.add(b); }
    const arm = S.sign('STOP', '#dc2626', '#ffffff', 0.9, 0.9); arm.position.set(L * 0.5, 1.4, -1.35); arm.rotation.y = Math.PI / 2; g.add(arm);
    g.visible = false; sb.mesh.add(g); sb.flash = g;
  }
  for (let k = 0; k < 2; k++) { const sw = add('sweeper', { sweeper: true, cruise: 5 }); if (sw) { // Bürsten vorne
    const br = []; for (const z of [-0.8, 0.8]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); b.position.set(sw.len / 2 - 0.2, 0.15, z); sw.mesh.add(b); br.push(b); } sw.brushes = br; } }
  city.ambT = 120 + Math.random() * 90; city.amb = null;
}
// Gibt ein Höchsttempo zurück (oder null): Haltestelle, Schulbus, Platz machen
function trafficSpecial(c, dt) {
  const me = city.me;
  if (c.yieldT > 0) { c.yieldT -= dt; c.side = Math.min(2.4, (c.side || 0) + dt * 2.5); if (!c.turn) placeOnSegment(c); return 0; }
  if (c.side > 0) { c.side = Math.max(0, c.side - dt * 1.5); }
  if (c.bus && !c.turn) {
    if (c.busWait > 0) { c.busWait -= dt; if (c.busWait <= 0) c.busStop.away = 25; return 0; }
    const st = city.stops.get(c.i + ',' + c.j + ',' + c.d);
    if (st && st !== c.busLast && st.s - c.s > -0.5 && st.s - c.s < 14) {
      if (st.s - c.s < 0.6) { c.busWait = 6; c.busLast = st; c.busStop = st; for (const p of st.people) p.visible = false; // einsteigen
        if (Math.hypot(me.pos.x - c.x, me.pos.z - c.z) < 30 && city.msgT <= 0) showMsg('🚏 Das Postauto hält – Leute steigen ein', 1.6); return 0; }
      return Math.sqrt(2 * 3 * Math.max(0, st.s - c.s - 0.5));
    }
  }
  if (c.school) {
    if (c.schoolStop > 0) {
      c.schoolStop -= dt; c.flash.visible = Math.floor(city.t * 4) % 2 === 0;
      // nicht überholen: du fährst vorbei, solange er blinkt
      const fx = Math.cos(c.h), fz = Math.sin(c.h), dx = me.pos.x - c.x, dz = me.pos.z - c.z, along = dx * fx + dz * fz, side = Math.abs(dz * fx - dx * fz);
      if (c.meAlong < -3 && along > 3 && side < 9 && !city.walk && me.alt < 2 && Math.abs(me.speed) > 2 && !city.ticket && !city.police) {
        city.reason = { kind: 'school', text: '🚌 Schulbus mit Blinklicht überholt' }; giveTicket();
      }
      c.meAlong = along;
      if (c.schoolStop <= 0) { c.flash.visible = false; c.schoolT = 35 + Math.random() * 25; }
      return 0;
    }
    if (!c.turn && (c.schoolT -= dt) <= 0 && c.s > 12 && c.s < BLOCK - 22) { c.schoolStop = 8; c.meAlong = 0; const d = Math.hypot(me.pos.x - c.x, me.pos.z - c.z); if (d < 60) showMsg('🚌 Der Schulbus hält – warten, nicht überholen!', 2); }
  }
  return null;
}
function stepTrafficSpecials(dt) {
  const me = city.me, night = isNight();
  const cam = S.camera.position;
  (city.stopList || []).forEach((st, k) => {
    if (st.away > 0 && (st.away -= dt) <= 0) for (const p of st.people) p.visible = true;
    S.stopMeshes[k].visible = Math.hypot(st.x - cam.x, st.z - cam.z) < city.see; // weit weg nicht zeichnen
  });
  for (const c of city.cars) { // Nachtfahrverbot / Strassenwischer nur nachts
    const off = c.sweeper ? !night : night && TRUCKS.has(c.v.kind) && !c.lot;
    if (off !== !!c.off) { c.off = off; if (!off) c.mesh.visible = true; }
    if (c.sweeper && !c.off && c.mesh.visible) { for (const b of c.brushes) b.rotation.y += dt * 12; if (Math.random() < dt * 6) S.fx.puff(c.x + Math.cos(c.h) * c.len * 0.5, 0.3, c.z + Math.sin(c.h) * c.len * 0.5, 0, 0); }
  }
  if (night && TRUCKS.has(me.v.kind) && !city.walk && Math.abs(me.speed) > 2 && city.t - (city.truckMsgT || -99) > 60) { city.truckMsgT = city.t; showMsg('🚚 Nachtfahrverbot: Lastwagen fahren von 22 bis 5 Uhr nicht!', 2.6); }
  // Ambulanz-Einsatz in der Stadt
  const A = city.amb;
  if (!A) {
    if ((city.ambT -= dt) > 0 || city.walk || city.plane || city.boat || city.mission || Math.max(Math.abs(me.pos.x), Math.abs(me.pos.z)) > HALF) return;
    city.ambT = 150 + Math.random() * 120;
    const d = ((Math.round(me.heading / (Math.PI / 2)) % 4) + 4) % 4, [fx, fz] = DIRS[d];
    let i, j, sMe;
    if (fx) { j = Math.round(me.pos.z / BLOCK + N / 2); i = fx > 0 ? Math.floor(me.pos.x / BLOCK + N / 2) : Math.ceil(me.pos.x / BLOCK + N / 2); sMe = (me.pos.x - node(i)) * fx; }
    else { i = Math.round(me.pos.x / BLOCK + N / 2); j = fz > 0 ? Math.floor(me.pos.z / BLOCK + N / 2) : Math.ceil(me.pos.z / BLOCK + N / 2); sMe = (me.pos.z - node(j)) * fz; }
    if (!inGrid(i, j) || !inGrid(i + fx, j + fz) || sMe < 40 || sMe > BLOCK - 8) { city.ambT = 10; return; } // nur auf einem geraden Stück mit Platz dahinter
    const c = makeCar(city.kinds, i, j, d, sMe - 34, { kind: 'ambulance', color: city.kinds.ambulance.color, special: null });
    Object.assign(c, { amb: true, cruise: 15, speed: 12, ambT: 0, blockT: 0, passed: false });
    placeOnSegment(c); S.scene.add(c.mesh); city.cars.push(c); city.amb = c;
    if (!city.ambSiren && city.ambSiren !== null) city.ambSiren = createSiren();
    showMsg('🚑 Blaulicht hinter dir – fahr zur Seite und lass sie vorbei!', 2.6);
    return;
  }
  A.ambT += dt;
  const dist = Math.hypot(me.pos.x - A.x, me.pos.z - A.z);
  if (city.ambSiren) city.ambSiren.set(Math.max(0, 1 - dist / 200));
  for (const c of city.cars) { // wer vor der Ambulanz fährt, macht Platz
    if (c === A || c.off || c.lot || c.amb || c.wreck > 0) continue;
    const fx = Math.cos(A.h), fz = Math.sin(A.h), dx = c.x - A.x, dz = c.z - A.z, along = dx * fx + dz * fz;
    if (along > 0 && along < 40 && Math.abs(dz * fx - dx * fz) < 3 && Math.cos(c.h - A.h) > 0.5) c.yieldT = Math.max(c.yieldT || 0, 3);
  }
  if (A.ambBlock && !city.walk) {
    A.blockT += dt;
    if (A.blockT > 1 && city.msgT <= 0) showMsg('🚑 Mach Platz! Fahr rechts ran!', 1.4);
    if (A.blockT > 6 && !A.fined && !city.ticket && !city.police) { A.fined = true; city.reason = { kind: 'amb', text: '🚑 Ambulanz aufgehalten' }; giveTicket(); }
  }
  const fx = Math.cos(A.h), fz = Math.sin(A.h), alongMe = (me.pos.x - A.x) * fx + (me.pos.z - A.z) * fz;
  if (!A.passed && alongMe < -4 && dist < 25 && A.ambT > 2) { A.passed = true; if (!A.fined) { const c = city.net ? 0 : 5; if (c) city.earn(c); showMsg('👍 Gut Platz gemacht!' + (c ? '  +' + c + ' 🪙' : ''), 2); } }
  if (A.ambT > 70 || (A.ambT > 8 && dist > 260)) { // Einsatz vorbei
    S.scene.remove(A.mesh); city.cars.splice(city.cars.indexOf(A), 1); city.amb = null;
    if (city.ambSiren) city.ambSiren.set(0);
  }
}

// ---------- Läden in der Stadt (Snacks, Lackieren, Tuning, Drive-in) ----------
// Ein Fenster für alles: openPanel({ title, rows: () => [{ id, label, price, note, done }], buy(id) }). Geht auf, wenn man
// in einer Zone anhält (oder zu Fuss hineingeht), und zu, wenn man wegfährt. Online geschlossen (keine Münzen).
function openPanel(P) { city.panel = P; drawPanel(); }
function closePanel() { city.panel = null; S.ui.dealpanel.hidden = true; }
function drawPanel() {
  const P = city.panel, p = S.ui.dealpanel, coins = city.dealer.coins();
  p.textContent = '';
  const h = document.createElement('h3'); h.textContent = P.title + ' · du hast ' + coins + ' 🪙';
  const grid = document.createElement('div'); grid.className = 'cars';
  for (const r of P.rows()) {
    const b = document.createElement('button'), dot = document.createElement('i'), name = document.createElement('span'), pr = document.createElement('small');
    b.dataset.pi = r.id; b.disabled = !!r.done || coins < r.price;
    if (r.color) dot.style.background = r.color; else dot.style.display = 'none';
    name.textContent = r.label + (r.note ? ' · ' + r.note : '');
    pr.textContent = r.done ? '✓' : r.price ? r.price + ' 🪙' : 'gratis';
    b.append(dot, name, pr); grid.append(b);
  }
  const row = document.createElement('div'); row.className = 'row';
  const close = document.createElement('button'); close.dataset.act = 'close'; close.textContent = '✕ Schliessen';
  row.append(close); p.append(h, grid, row); p.hidden = false;
}
function onPanelClick(b) {
  if (!city.panel) return false;
  if (b.dataset.act === 'close') { closePanel(); return true; }
  if (b.dataset.pi !== undefined) { city.panel.buy(b.dataset.pi); if (city.panel) drawPanel(); }
  return true;
}
// Neues Aussehen fürs eigene Auto (Farbe oder Tuning): im Fahrzeugpark speichern und neu bauen
function modMe(change, price, text) {
  const me = city.me, res = city.dealer.mod(me.v.id, change, price);
  if (typeof res === 'string') { showMsg(res, 1.8); return; }
  const v = { ...res, name: me.v.name }, mesh = buildCar(v, city.kinds);
  mesh.rotation.order = 'YZX';
  for (const sc of city.scratches) sc.parent && sc.parent.remove(sc); city.scratches = []; dropDents(); // frisch lackiert: ohne Kratzer und Beulen (Schaden bleibt)
  S.scene.remove(me.mesh); S.scene.add(mesh);
  Object.assign(me, carStats(v, mesh, city.kinds, city.topSpeed), { v, mesh });
  S.ui.ps.textContent = '⚡ ' + v.ps + ' PS';
  if (city.cruise) showCruise();
  showMsg(text, 2);
  window.beep && window.beep(784, 0.12, 'triangle', 0.07);
}
const PAINT = [['#dc2626', 'Rot'], ['#f97316', 'Orange'], ['#facc15', 'Gelb'], ['#16a34a', 'Grün'], ['#0ea5e9', 'Hellblau'], ['#1d4ed8', 'Blau'],
  ['#7c3aed', 'Violett'], ['#ec4899', 'Pink'], ['#f8fafc', 'Weiss'], ['#9ca3af', 'Silber'], ['#111827', 'Schwarz'], ['#78350f', 'Braun']];
const SNACKS = [['choc', '🍫 Schoggi', 3, 'Turbo 20 s', 20], ['drink', '🥤 Energy-Drink', 8, 'Turbo 60 s', 60], ['ice', '🍦 Glace', 2, 'fein!', 0], ['hotdog', '🌭 Hotdog', 4, 'Turbo 25 s', 25]];
const DRIVE = [['burger', '🍔 Burger', 6, 'Turbo 30 s', 30], ['fries', '🍟 Pommes', 4, 'Turbo 15 s', 15], ['cola', '🥤 Cola', 3, 'Turbo 10 s', 10], ['menu', '🍱 Menü (alles)', 11, 'Turbo 60 s', 60]];
function stationPanel(id) {
  const me = city.me, K = city.kinds;
  if (id === 'gasShop') return { title: '🛒 Tankstellen-Shop', rows: () => SNACKS.map(([k, label, price, note]) => ({ id: k, label, price, note })),
    buy: k => { const it = SNACKS.find(x => x[0] === k); if (city.pay(it[2]) < it[2]) return; if (it[4]) city.turbo = Math.max(city.turbo, it[4]); showMsg(it[1] + ' gekauft! ' + (it[4] ? '🚀 Turbo ' + it[4] + ' s' : it[3]), 2); } };
  if (id === 'order') return { title: '🔊 Burger Drive-in – was darf es sein?', rows: () => DRIVE.map(([k, label, price, note]) => ({ id: k, label, price, note, done: !!city.dOrder })),
    buy: k => { const it = DRIVE.find(x => x[0] === k); if (city.dOrder || city.pay(it[2]) < it[2]) return; city.dOrder = it; closePanel(); showMsg('🔊 Danke! Bitte zum Fenster vorfahren 🪟', 2.4); } };
  if (id === 'paint') return { title: '🎨 Lackieren (' + vname(me.v) + ')', rows: () => PAINT.map(([c, name]) => ({ id: c, label: name, price: 20, color: c, done: !!me.v.painted && (me.v.color || '').toLowerCase() === c })), // echte Modelle: Originalfarbe, bis man lackiert
    buy: c => modMe({ color: c }, 20, '🎨 Frisch lackiert: ' + PAINT.find(x => x[0] === c)[1] + '!') };
  if (id === 'tuning') return { title: '🔧 Tuning (' + vname(me.v) + ')', rows: () => {
      const T = city.dealer.tuneInfo(), t = me.v.tune || {}, out = [];
      for (const r of T.rows) {
        if (r.id === 'plate') continue; // Nummernschild: im Tuning-Menü (dort kann man schreiben)
        if (r.id === 'wheels' || r.id === 'spoiler') out.push({ id: r.id, label: r.label, note: r.note, price: t[r.id] ? 0 : r.price, done: false, color: null, off: !!t[r.id] });
        else if (r.id === 'finish') for (const f of r.choices) out.push({ id: 'finish:' + f, label: '✨ ' + T.finish[f].name + '-Lack', price: T.finish[f].price, color: T.finish[f].color, done: t.finish === f });
        else for (const ch of r.choices) out.push({ id: r.id + ':' + ch, label: r.label + ' ' + (r.id === 'sticker' ? T.stickers[ch] : ''), price: r.price, color: r.id === 'neon' ? ch : null, done: t[r.id] === ch });
      }
      return out.map(o => o.off ? { ...o, label: o.label + ' ausbauen', note: '' } : o);
    },
    buy: k => {
      const T = city.dealer.tuneInfo(), t = me.v.tune || {}, [part, val] = k.split(':');
      if (part === 'wheels' || part === 'spoiler') {
        const row = T.rows.find(r => r.id === part);
        if (t[part]) modMe({ tune: { [part]: null } }, 0, '🔧 ' + row.label + ' ausgebaut');
        else modMe({ tune: { [part]: true } }, row.price, '🔧 ' + row.label + ' eingebaut! ' + row.note);
      } else if (part === 'finish') modMe({ tune: { finish: val } }, T.finish[val].price, '✨ ' + T.finish[val].name + '-Lack!');
      else modMe({ tune: { [part]: val } }, T.rows.find(r => r.id === part).price, '🔧 ' + T.rows.find(r => r.id === part).label + ' eingebaut!');
    } };
  return null;
}
// In den Zonen anhalten: Fenster auf; wegfahren: zu
function stepStations() {
  const me = city.me, w = city.walk, x = w ? w.x : me.pos.x, z = w ? w.z : me.pos.z, P = S.places;
  let here = null;
  for (const id of ['gasShop', 'paint', 'tuning', 'order']) if (inZone(P[id], x, z) && (w ? id === 'gasShop' : Math.abs(me.speed) < 1 && me.alt < 2)) here = id;
  if (here && city.station !== here) {
    city.station = here;
    if (!city.dealer) showMsg('🌐 Online sind die Läden geschlossen', 1.6);
    else if (!city.plane && !city.boat) openPanel(stationPanel(here));
  }
  if (!here && city.station && !inZone(P[city.station], x, z, 3)) { city.station = null; if (city.panel) closePanel(); }
  // Drive-in: am Fenster abholen
  const atWin = P.pickup && !w && inZone(P.pickup, x, z) && Math.abs(me.speed) < 1.5;
  if (atWin && !city.atWin) {
    const it = city.dOrder;
    if (it) { city.dOrder = null; if (it[4]) city.turbo = Math.max(city.turbo, it[4]); showMsg('🍔 Bitte schön: ' + it[1] + '! En Guete 😋' + (it[4] ? '  🚀 Turbo ' + it[4] + ' s' : ''), 2.6); window.beep && window.beep(880, 0.12, 'triangle', 0.06); }
    else showMsg('🔊 Zuerst beim Lautsprecher bestellen', 1.6);
  }
  city.atWin = atWin;
}

// ---------- Kino ----------
// Im Saal bei den Sitzen X: hinsetzen und den Film schauen (Kamera auf die Leinwand), nochmals X: aufstehen.
// Abends (18–23 Uhr) stehen Leute vor dem Eingang.
function drawFilm(t) {
  const F = S.places.kino.film, g = F.c.getContext('2d'), W = 384, H = 160, k = t % 24;
  const night = k > 12, sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, night ? '#0b1033' : '#38bdf8'); sky.addColorStop(1, night ? '#3b0764' : '#bae6fd');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (night) { g.fillStyle = '#fff'; for (let i = 0; i < 30; i++) g.fillRect((i * 97 + t * 3) % W, (i * 37) % 70, 2, 2); }
  else { g.fillStyle = '#fde047'; g.beginPath(); g.arc(320, 30, 16, 0, 7); g.fill(); }
  g.fillStyle = night ? '#1e293b' : '#4ade80'; for (let i = 0; i < 6; i++) { const x = ((i * 90 - t * 30) % 480 + 480) % 480 - 60; g.beginPath(); g.moveTo(x, 120); g.lineTo(x + 50, 60); g.lineTo(x + 100, 120); g.fill(); }
  g.fillStyle = '#374151'; g.fillRect(0, 118, W, 42); g.fillStyle = '#fde047'; for (let i = 0; i < 10; i++) g.fillRect(((i * 50 - t * 160) % 500 + 500) % 500 - 50, 137, 26, 4);
  const cx = 120 + Math.sin(t * 0.7) * 60, cy = 104 + Math.abs(Math.sin(t * 6)) * 3;
  g.fillStyle = '#dc2626'; g.fillRect(cx - 34, cy, 68, 16); g.fillRect(cx - 18, cy - 12, 34, 13); g.fillStyle = '#93c5fd'; g.fillRect(cx - 12, cy - 9, 12, 8); g.fillRect(cx + 3, cy - 9, 10, 8);
  g.fillStyle = '#111'; for (const dx of [-20, 20]) { g.beginPath(); g.arc(cx + dx, cy + 16, 7, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(249,115,22,.85)'; for (let i = 0; i < 4; i++) g.fillRect(cx - 40 - i * 9 - Math.random() * 6, cy + 6 + Math.random() * 6, 7, 4);
  const bx = (k * 40) % 520 - 60; g.fillStyle = '#7c3aed'; g.fillRect(380 - bx, 100, 40, 20); g.fillStyle = '#111'; g.beginPath(); g.arc(388 - bx, 122, 6, 0, 7); g.arc(412 - bx, 122, 6, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 14px system-ui'; g.textAlign = 'center';
  g.fillText(['Turbo-Tom gibt Gas!', 'Der Rivale kommt näher …', 'Nachtrennen unter den Sternen', 'Wer gewinnt das grosse Rennen?'][Math.floor(t / 6) % 4], W / 2, 18);
  F.tex.needsUpdate = true;
}
function stepKino(dt) {
  const K = S.places.kino; if (!K) return;
  const cam = S.camera.position, inside = cam.x > K.inside.x0 - 2 && cam.x < K.inside.x1 + 2 && cam.z > K.inside.z0 - 2 && cam.z < K.inside.z1 + 2;
  if (inside && (city.filmT = (city.filmT || 0) + dt) > 1 / 15) { city.filmT = 0; drawFilm(city.t); }
  const m = clockMins(), evening = m >= 18 * 60 && m < 23 * 60, near = Math.hypot(cam.x - K.x, cam.z - K.z) < 160;
  for (const p of S.kinoCrowd || []) { p.mesh.visible = evening && near; if (p.mesh.visible) { p.mesh.rotation.y = -p.h + Math.sin(city.t * 1.3 + p.phase) * 0.2; } }
}

// ---------- Stadion ----------
// Fussballspiel von 14 bis 22 Uhr: zwei Teams (Rot, Blau) laufen dem Ball nach, schiessen aufs Tor; Zuschauer und
// Anzeigetafel; nachts leuchtet das Flutlicht.
function setupStadium() {
  const St = S.places.stadium; if (!St) return;
  if (!S.match) {
    const players = [];
    for (let k = 0; k < 10; k++) {
      const team = k < 5 ? 0 : 1, mesh = makePerson(team ? 0x1d4ed8 : 0xdc2626, HAIRS[k % HAIRS.length], SKINS[k % SKINS.length]);
      mesh.traverse(o => { o.castShadow = false; }); mesh.visible = false; S.scene.add(mesh);
      const hx = St.x + (team ? 1 : -1) * (3 + (k % 5) * 2.4), hz = St.z + ((k % 5) - 2) * 3.5;
      players.push({ mesh, team, hx, hz, x: hx, z: hz, h: 0, speed: 0, phase: k, gy: 0.22 });
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff })); ball.visible = false; S.scene.add(ball);
    S.match = { players, ball, bx: St.x, bz: St.z, vx: 0, vz: 0, score: [0, 0] };
  }
}
function stepStadium(dt) {
  const St = S.places.stadium, M = S.match; if (!St || !M) return;
  const cam = S.camera.position, near = Math.hypot(cam.x - St.x, cam.z - St.z) < 260, m = clockMins(), on = m >= 14 * 60 && m < 22 * 60;
  St.lampM.emissiveIntensity = S.night.walls[0] ? 0.2 + S.night.walls[0].emissiveIntensity * 2.5 : 0.2; // Flutlicht
  const show = near && on;
  St.crowd.visible = show; M.ball.visible = show; for (const p of M.players) p.mesh.visible = show;
  if (St.board.last !== (on ? M.score.join(':') : 'aus')) { // Anzeigetafel
    St.board.last = on ? M.score.join(':') : 'aus';
    const g = St.board.c.getContext('2d'); g.fillStyle = '#0b1220'; g.fillRect(0, 0, 256, 96); g.textAlign = 'center';
    g.fillStyle = '#fde047'; g.font = 'bold 22px system-ui'; g.fillText(on ? '🔴 ROT  :  BLAU 🔵' : 'Nächstes Spiel 14 Uhr', 128, 30);
    if (on) { g.fillStyle = '#fff'; g.font = 'bold 44px system-ui'; g.fillText(M.score[0] + ' : ' + M.score[1], 128, 80); }
    St.board.tex.needsUpdate = true;
  }
  if (!show) return;
  St.crowd.position.y = Math.abs(Math.sin(city.t * 3)) * 0.12; // Zuschauer wippen
  // Ball rollt, prallt an den Seitenlinien ab; Tor?
  M.bx += M.vx * dt; M.bz += M.vz * dt; M.vx *= Math.exp(-0.8 * dt); M.vz *= Math.exp(-0.8 * dt);
  if (Math.abs(M.bz - St.z) > 9.6) { M.vz *= -0.7; M.bz = St.z + Math.sign(M.bz - St.z) * 9.6; }
  if (Math.abs(M.bx - St.x) > 14.8) {
    if (Math.abs(M.bz - St.z) < 2.8) { // Tor!
      const team = M.bx > St.x ? 0 : 1; M.score[team]++;
      if (Math.hypot(city.me.pos.x - St.x, city.me.pos.z - St.z) < 120) showMsg('⚽ TOOOR für ' + (team ? 'Blau 🔵' : 'Rot 🔴') + '! ' + M.score.join(':'), 2.4);
      M.bx = St.x; M.bz = St.z; M.vx = M.vz = 0;
    } else { M.vx *= -0.7; M.bx = St.x + Math.sign(M.bx - St.x) * 14.8; }
  }
  M.ball.position.set(M.bx, 0.44, M.bz); M.ball.rotation.z -= M.vx * dt * 4; M.ball.rotation.x += M.vz * dt * 4;
  // Spieler: die zwei Nächsten jedes Teams laufen zum Ball, die anderen halten ihre Position (mit dem Ball etwas mit)
  for (const team of [0, 1]) {
    const mine = M.players.filter(p => p.team === team).sort((a, b) => Math.hypot(a.x - M.bx, a.z - M.bz) - Math.hypot(b.x - M.bx, b.z - M.bz));
    mine.forEach((p, i) => {
      const tx = i < 2 ? M.bx - (team ? -0.5 : 0.5) : p.hx + (M.bx - St.x) * 0.4, tz = i < 2 ? M.bz : p.hz + (M.bz - St.z) * 0.3;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), sp = i < 2 ? 5.5 : 3;
      p.speed = d > 0.3 ? Math.min(sp, d * 2) : 0; if (d > 0.01) p.h = Math.atan2(dz, dx);
      p.x += Math.cos(p.h) * p.speed * dt; p.z += Math.sin(p.h) * p.speed * dt;
      if (Math.hypot(p.x - M.bx, p.z - M.bz) < 0.7) { // schiessen: Richtung gegnerisches Tor
        const gx = St.x + (team ? -15.5 : 15.5), gz = St.z + (Math.random() - 0.5) * 7, gd = Math.hypot(gx - M.bx, gz - M.bz), v = 7 + Math.random() * 7;
        M.vx = (gx - M.bx) / gd * v; M.vz = (gz - M.bz) / gd * v + (Math.random() - 0.5) * 4;
      }
      animatePerson(p, dt);
    });
  }
}

// ---------- Eigenes Haus ----------
// Am Briefkasten anhalten: kaufen (HOUSE_PRICE) und Sachen für den Garten kaufen. In die Garage fahren = zuhause:
// repariert und vollgetankt. Spielstand: autoRetterHouse = { owned, items: [...] }.
const HOUSE_PRICE = 300;
const HOUSE_ITEMS = [['flowers', '🌷 Blumenbeet', 40], ['grill', '🍖 Grill mit Tisch', 60], ['lights', '✨ Lichterkette', 50], ['trampoline', '🤸 Trampolin', 80],
  ['fountain', '⛲ Brunnen', 90], ['dog', '🐶 Hund mit Hütte', 100], ['solar', '☀️ Solardach', 120], ['pool', '🏊 Pool', 150]];
function loadHouse() { try { return JSON.parse(localStorage.getItem('autoRetterHouse')) || { owned: false, items: [] }; } catch (e) { return { owned: false, items: [] }; } }
function saveHouse() { try { localStorage.setItem('autoRetterHouse', JSON.stringify(city.house)); } catch (e) {} }
function showHouse() {
  const H = S.places.house; if (!H) return;
  H.forSale.visible = !city.house.owned; H.mine.visible = city.house.owned;
  for (const [id, g] of Object.entries(H.items)) g.visible = city.house.owned && city.house.items.includes(id);
}
function drawHouse() {
  const p = S.ui.dealpanel, coins = city.dealer.coins(), Hs = city.house;
  p.textContent = '';
  const h = document.createElement('h3'); h.textContent = (Hs.owned ? '🏡 Mein Haus' : '🏡 Haus zu verkaufen') + ' · du hast ' + coins + ' 🪙';
  const grid = document.createElement('div'); grid.className = 'cars';
  const btn = (data, text, price, done) => {
    const b = document.createElement('button'), name = document.createElement('span'), pr = document.createElement('small');
    b.dataset.house = data; b.disabled = done || coins < price;
    name.textContent = text; pr.textContent = done ? '✓ gekauft' : price + ' 🪙';
    b.append(name, pr); grid.append(b);
  };
  if (!Hs.owned) btn('buy', '🔑 Haus kaufen (mit Garage: dort reparieren und tanken gratis)', HOUSE_PRICE, false);
  else for (const [id, name, price] of HOUSE_ITEMS) btn(id, name, price, Hs.items.includes(id));
  const row = document.createElement('div'); row.className = 'row';
  const close = document.createElement('button'); close.dataset.act = 'close'; close.textContent = '✕ Schliessen';
  row.append(close);
  p.append(h, grid, row);
  p.hidden = false;
}
function onHouseClick(b) {
  if (!city.houseOpen) return false;
  const id = b.dataset.house;
  if (b.dataset.act === 'close') { city.houseOpen = false; S.ui.dealpanel.hidden = true; return true; }
  if (!id) return true;
  const price = id === 'buy' ? HOUSE_PRICE : (HOUSE_ITEMS.find(x => x[0] === id) || [])[2];
  if (!price || city.dealer.coins() < price) return true;
  city.pay(price);
  if (id === 'buy') { city.house.owned = true; showMsg('🎉 Das Haus gehört jetzt dir! Fahr in die Garage.', 2.6); }
  else { city.house.items.push(id); showMsg('🏡 ' + HOUSE_ITEMS.find(x => x[0] === id)[1] + ' steht jetzt im Garten!', 2.2); }
  window.beep && window.beep(784, 0.12, 'triangle', 0.07);
  saveHouse(); showHouse(); drawHouse();
  return true;
}
function stepHouse(dt) {
  const H = S.places.house, me = city.me;
  if (!H) return;
  const w = city.walk, x = w ? w.x : me.pos.x, z = w ? w.z : me.pos.z;
  if (S.night.walls[0]) H.win.emissiveIntensity = S.night.walls[0].emissiveIntensity * 0.9; // Fenster nachts hell
  // Garagentor: geht auf, wenn das Haus dir gehört und du davor bist
  const near = city.house.owned && Math.abs(x - H.box.x) < 9 && z > H.box.z - 22 && z < H.box.z + 8;
  H.open = Math.max(0, Math.min(1, H.open + (near ? 1 : -1) * dt * 0.8));
  H.door.position.y = 2.1 + H.open * 3.6; H.door.scale.y = 1 - H.open * 0.9;
  const sol = H.doorSolid; if (H.open > 0.7) { sol.z0 = sol.z1 = 1e9; } else { sol.z0 = H.box.z - 7.2; sol.z1 = H.box.z - 6.8; }
  // Haustür: geht auf, wenn das Haus dir gehört und du (zu Fuss) davor oder drinnen bist
  const atDoor = city.house.owned && !!w && Math.abs(x - H.front.x) < 4 && Math.abs(z - H.front.z) < 4;
  H.fopen = Math.max(0, Math.min(1, H.fopen + (atDoor ? 1 : -1) * dt * 1.6));
  H.hinge.rotation.y = H.fopen * 1.5;
  if (H.fopen > 0.6) { H.frontSolid.z0 = H.frontSolid.z1 = 1e9; } else { H.frontSolid.z0 = H.front.z - 0.1; H.frontSolid.z1 = H.front.z + 0.4; }
  if (!city.house.owned && w && Math.abs(x - H.front.x) < 2.5 && Math.abs(z - H.front.z) < 2.5 && !city.doorMsg) { city.doorMsg = true; showMsg('🔒 Abgeschlossen – das Haus gehört dir noch nicht (Briefkasten)', 2); }
  if (!w || Math.abs(x - H.front.x) > 5 || Math.abs(z - H.front.z) > 5) city.doorMsg = false;
  // in der Garage: zuhause
  const inG = !w && inZone(H.box, me.pos.x, me.pos.z) && Math.abs(me.speed) < 1;
  if (inG && !city.homeT) {
    city.homeT = 1;
    const fix = city.damage > 0.02 || city.fuel < 0.98;
    repairAll(); city.fuel = 1;
    showMsg('🏠 Zuhause!' + (fix ? ' Repariert und vollgetankt – gratis.' : ''), 2.4);
  }
  if (!inZone(H.box, me.pos.x, me.pos.z, 4)) city.homeT = 0;
  // Briefkasten: kaufen und einrichten (im Auto anhalten oder zu Fuss hingehen)
  const atMail = inZone(H.mailbox, x, z) && (w || Math.abs(me.speed) < 1.5);
  if (atMail && !city.houseOpen && !city.houseT) {
    city.houseT = 1;
    if (!city.dealer) showMsg('🏡 Online kann man kein Haus kaufen', 1.8);
    else { city.houseOpen = true; drawHouse(); }
  }
  if (!inZone(H.mailbox, x, z, 3)) { city.houseT = 0; if (city.houseOpen) { city.houseOpen = false; S.ui.dealpanel.hidden = true; } }
}

// Schlafen im eigenen Bett (nur allein, nicht online): am Abend oder in der Nacht X beim Bett = bis 7 Uhr morgens
const clockMins = () => Math.floor(((city.tod - 0.25 + 1) % 1) * 24 * 60 + 12 * 60) % (24 * 60);
function goSleep(w) {
  if (city.net) { showMsg('🌐 Online läuft die Zeit für alle – schlafen geht nur, wenn du allein spielst', 2.4); return; }
  const m = clockMins();
  if (m >= 6 * 60 && m < 19 * 60) { showMsg('☀️ Es ist noch Tag – schlafen kannst du ab 19 Uhr', 2); return; }
  const B = S.places.house.bed;
  city.sleep = { t: 0, w };
  w.mesh.position.set(B.x, 1.15, B.z); w.mesh.rotation.set(Math.PI / 2, Math.PI / 2, 0, 'YXZ'); // ins Bett legen
  overlay();
  if (!S.ui.sleep) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;display:flex;align-items:center;justify-content:center;font:700 44px system-ui,sans-serif;color:#fff;z-index:5';
    S.ui.root.append(d); S.ui.sleep = d;
  }
  S.ui.sleep.textContent = '💤 Gute Nacht …';
}
function stepSleep(dt) {
  const Z = city.sleep;
  if (!Z) return;
  Z.t += dt;
  const op = Z.t < 1.4 ? Z.t / 1.4 : Z.t < 3.2 ? 1 : Math.max(0, 1 - (Z.t - 3.2) / 1.2);
  S.ui.sleep.style.opacity = op;
  if (Z.t > 1.4 && !Z.done) { Z.done = true; city.tod = 0.0417; S.ui.sleep.textContent = '☀️ Guten Morgen!'; } // 7 Uhr
  const w = Z.w, B = S.places.house.bed;
  if (Z.t < 3.2) { w.mesh.position.set(B.x, 1.15, B.z); w.speed = 0; }
  else if (!Z.up) { // aufstehen, neben dem Bett
    Z.up = true; w.x = B.x + 2; w.z = B.z - 1.5; w.h = -Math.PI / 2; w.mesh.rotation.set(0, -w.h, 0);
    if (city.fuel < 1 || city.damage > 0) { city.fuel = 1; repairAll(); }
    showMsg('☀️ Guten Morgen! Ausgeschlafen – es ist 7 Uhr', 2.4);
  }
  if (Z.t > 4.4) { city.sleep = null; S.ui.sleep.style.opacity = 0; }
}

// ---------- Baustelle in der Stadt ----------
// Ab und zu ist ein Strassenstück zwischen zwei Kreuzungen ein paar Minuten gesperrt: Absperrungen mit Umleitungsschild,
// Bagger und Arbeiter. Die Autos biegen vorher ab (planTurn), du musst einen anderen Weg fahren.
const isClosed = (i, j, d) => {
  if (isPed(i, j, d)) return true; // Fussgängerzone
  const W = city && city.works; if (!W) return false;
  const i2 = i + DIRS[d][0], j2 = j + DIRS[d][1];
  return (W.a[0] === i && W.a[1] === j && W.b[0] === i2 && W.b[1] === j2) || (W.b[0] === i && W.b[1] === j && W.a[0] === i2 && W.a[1] === j2);
};
function relocate(c) { // Auto woanders weit weg einsetzen
  for (let tries = 0; tries < 40; tries++) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1)), d = Math.floor(Math.random() * 4);
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1]) || isClosed(i, j, d)) continue;
    Object.assign(c, { i, j, d, s: 10 + Math.random() * (BLOCK - 26), turn: null, speed: 4 });
    placeOnSegment(c);
    if (Math.hypot(c.x - city.me.pos.x, c.z - city.me.pos.z) > 150) break;
  }
}
function startWorks() {
  const cam = S.camera.position, B = S.places.blue;
  for (let tries = 0; tries < 30; tries++) {
    const i = 1 + Math.floor(Math.random() * (N - 2)), j = 1 + Math.floor(Math.random() * (N - 2)), ax = Math.random() < 0.5;
    const a = [i, j], b = ax ? [i + 1, j] : [i, j + 1], mxp = (node(a[0]) + node(b[0])) / 2, mzp = (node(a[1]) + node(b[1])) / 2;
    if (Math.hypot(mxp - cam.x, mzp - cam.z) < 160) continue;
    if (B && ax && j === B.seg.j && i === B.seg.i) continue; // nicht vor der Blauen Zone
    if (isPed(i, j, ax ? 0 : 1)) continue; // Fussgängerzone ist schon zu
    city.works = { a, b, ax, x: mxp, z: mzp, t: 200 + Math.random() * 120, meshes: [], solids: [], told: false };
    break;
  }
  const W = city.works;
  if (!W) return;
  for (const c of city.cars) { // wer drauf ist oder hineinwill, fährt woanders
    if (c.lot || c.wreck > 0) continue;
    if ((!c.turn && isClosed(c.i, c.j, c.d)) || (c.turn && isClosed(c.turn.bi, c.turn.bj, c.turn.d2))) relocate(c);
  }
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; S.scene.add(o); W.meshes.push(o); return o; };
  const stripe = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d');
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#dc2626'; g.fillRect(k * 16, 0, 16, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const bar = M(0xffffff, { map: stripe }), cone = M(0xf97316), yellow = M(0xfacc15), dark = M(0x374151), dirt = M(0x7c5a3a, { roughness: 1 });
  const fx = W.ax ? 1 : 0, fz = W.ax ? 0 : 1, len = BLOCK;
  for (const e of [-1, 1]) { // Absperrung an beiden Enden, 9 m vor der Kreuzung
    const x = W.x + fx * e * (len / 2 - 9), z = W.z + fz * e * (len / 2 - 9), ry = W.ax ? Math.PI / 2 : 0;
    add(new THREE.BoxGeometry(ROAD, 0.35, 0.25), bar, x, 0.95, z, ry);
    for (const o of [-ROAD / 2 + 0.6, ROAD / 2 - 0.6]) add(new THREE.BoxGeometry(0.15, 1.1, 0.15), dark, x + (W.ax ? 0 : o), 0.55, z + (W.ax ? o : 0));
    for (let k = -2; k <= 2; k++) add(new THREE.ConeGeometry(0.28, 0.8, 10), cone, x + fx * e * 2 + (W.ax ? 0 : k * 2.6), 0.4, z + fz * e * 2 + (W.ax ? k * 2.6 : 0));
    W.solids.push({ x0: x - (W.ax ? 0.4 : ROAD / 2), x1: x + (W.ax ? 0.4 : ROAD / 2), z0: z - (W.ax ? ROAD / 2 : 0.4), z1: z + (W.ax ? ROAD / 2 : 0.4), h: 1.2 });
    for (const side of [0, 1]) {
      const sg = S.sign('🚧 UMLEITUNG', '#f59e0b', '#111827', 5, 1.1);
      sg.position.set(x + fx * e * 0.3, 2.2, z + fz * e * 0.3); sg.rotation.y = (W.ax ? (e > 0 ? Math.PI / 2 : -Math.PI / 2) : (e > 0 ? 0 : Math.PI)) + side * Math.PI;
      sg.position.x += fx * e * side * 0.05; sg.position.z += fz * e * side * 0.05;
      S.scene.add(sg); W.meshes.push(sg);
    }
  }
  // Bagger, Erdhaufen, zwei Arbeiter
  const dg = new THREE.Group(); dg.position.set(W.x, 0, W.z); dg.rotation.y = W.ax ? 0 : Math.PI / 2; S.scene.add(dg); W.meshes.push(dg);
  const part = (geo, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = true; dg.add(o); return o; };
  part(new THREE.BoxGeometry(4, 0.8, 2.6), dark, 0, 0.5, 0); part(new THREE.BoxGeometry(3, 1.2, 2.2), yellow, -0.3, 1.5, 0);
  part(new THREE.BoxGeometry(1.4, 1.4, 1.6), M(0x93c5fd, { metalness: 0.3 }), -0.9, 2.8, 0);
  part(new THREE.BoxGeometry(3.4, 0.4, 0.4), yellow, 2.1, 2.9, 0, 0.5); part(new THREE.BoxGeometry(0.4, 2.4, 0.4), yellow, 3.7, 2.4, 0, -0.3);
  part(new THREE.BoxGeometry(1, 0.6, 1.2), dark, 4.1, 1.1, 0);
  add(new THREE.ConeGeometry(3, 1.8, 12), dirt, W.x + (W.ax ? -9 : 3), 0.9, W.z + (W.ax ? 3 : -9));
  for (const k of [0, 1]) {
    const pm = makePerson(0xf97316, 0x5a3a1e, 0xe0ac69); pm.position.set(W.x + (W.ax ? 7 + k * 3 : -3 + k * 1.5), 0.02, W.z + (W.ax ? -3 + k * 1.5 : 7 + k * 3)); pm.rotation.y = k * 2;
    S.scene.add(pm); W.meshes.push(pm);
  }
  S.solid.push(...W.solids);
}
function endWorks() {
  const W = city.works;
  if (!W) return;
  for (const m of W.meshes) S.scene.remove(m);
  for (const b of W.solids) { const k = S.solid.indexOf(b); if (k >= 0) S.solid.splice(k, 1); }
  city.works = null;
}
function stepWorks(dt) {
  if (!city.works) { if ((city.worksT -= dt) <= 0) { startWorks(); city.worksT = 80 + Math.random() * 80; } return; }
  const W = city.works, me = city.me;
  if ((W.t -= dt) <= 0) { endWorks(); return; }
  if (!W.told && Math.hypot(me.pos.x - W.x, me.pos.z - W.z) < 70 && me.alt < 2) { W.told = true; showMsg('🚧 Baustelle – Strasse gesperrt, fahr eine Umleitung!', 2.4); }
}

// ---------- Mondausflug ----------
// Zu Fuss zur Rakete (Raumbahnhof östlich der Stadt), X: Countdown, Start, Flug zum Mond (dunkel), Landung. Auf dem Mond:
// wenig Schwerkraft, Mondsteine sammeln, Mond-Buggy fahren. Zurück: zur Rakete auf dem Mond und X.
function overlay() {
  if (!S.ui.sleep) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;display:flex;align-items:center;justify-content:center;font:700 40px system-ui,sans-serif;color:#fff;z-index:5;text-align:center';
    S.ui.root.append(d); S.ui.sleep = d;
  }
  return S.ui.sleep;
}
function startLaunch() {
  const w = city.walk, toMoon = !city.moonOn;
  const R = toMoon ? S.country.rocket : S.moon.rocket;
  city.launch = { t: 0, toMoon, R, x: R.position.x, z: R.position.z, y0: R.position.y, count: 4 };
  w.mesh.visible = false;
  showMsg('🚀 Alle einsteigen! Countdown …', 1.4);
}
function stepLaunch(dt) {
  const L = city.launch; if (!L) return;
  L.t += dt;
  const R = L.R, ov = overlay();
  if (L.t < 3) { const n = 3 - Math.floor(L.t); if (n !== L.count) { L.count = n; showMsg(n + ' …', 0.9); window.beep && window.beep(440, 0.15, 'square', 0.05); } }
  else if (L.t < 8.5) {
    if (L.count !== 0) { L.count = 0; showMsg('🚀 START!', 1.4); crash(0.5, 'car'); }
    const k = L.t - 3; R.position.y = L.y0 + 0.5 * 7 * k * k; R.userData.flame.visible = true; R.userData.flame.scale.y = 0.8 + Math.random() * 0.5;
    if (Math.random() < dt * 30) S.fx.puff(L.x + (Math.random() - 0.5) * 8, L.y0 + 1 + Math.random() * 3, L.z + (Math.random() - 0.5) * 8, 0, 0);
    if (L.t > 7) { ov.textContent = L.toMoon ? '🌌 Flug zum Mond …' : '🌍 Flug zurück zur Erde …'; ov.style.opacity = Math.min(1, (L.t - 7) / 1.2); }
  } else if (!L.arrived) { // ankommen: auf der anderen Seite neben der Rakete aussteigen
    L.arrived = true; R.position.y = L.y0; R.userData.flame.visible = false;
    const D = L.toMoon ? { x: MOON_ROCKET.x + 8, z: MOON_ROCKET.z + 7 } : { x: SPACE.x - 10, z: SPACE.z + 10 }, w = city.walk;
    w.x = D.x; w.z = D.z; w.okX = D.x; w.okZ = D.z; w.h = -Math.PI / 2; w.speed = 0; w.air = null; w.jy = 0; w.gy = groundAt(D.x, D.z);
    S.moon.group.visible = L.toMoon;
  } else if (L.t < 10.8) ov.style.opacity = Math.max(0, 1 - (L.t - 9.3) / 1.4);
  else {
    ov.style.opacity = 0; city.walk.mesh.visible = true; city.launch = null;
    showMsg(L.toMoon ? '🌙 Willkommen auf dem Mond! Spring mal (E) – hier ist alles ganz leicht. 💎 Sammle Mondsteine!' : '🌍 Zurück auf der Erde!', 3.2);
  }
}
// Himmel, Licht und Nebel: auf dem Mond schwarz mit Sternen, harte Sonne, kein Wetter, keine Wolken
function stepMoonEnv(dt) {
  const w = city.walk, me = city.me, fx = w ? w.x : me.pos.x, fz = w ? w.z : me.pos.z, on = inMoon(fx, fz);
  if (on !== city.moonOn) {
    city.moonOn = on;
    S.scene.background = on ? new THREE.Color(0x000000) : null;
    S.clouds.visible = !on;
  }
  S.moon.group.visible = on || !!(city.launch && !city.launch.toMoon && !city.launch.arrived); // auch beim Start vom Mond
  if (!on) return;
  const n = S.night;
  n.fog.color.setHex(0x000000); n.fog.near = 2500; n.fog.far = 6000;
  S.sun.intensity = 2.4; n.hemi.intensity = 0.1; n.stars.material.opacity = 0;
  if (S.wxFx) { S.wxFx.rain.visible = false; S.wxFx.snow.visible = false; }
  stepMoon(S.moon, dt, city.t, fx, fz, (got, all) => {
    const c = city.net ? 0 : 3; if (c) city.earn(c);
    showMsg('💎 Mondstein! (' + got + '/' + all + ')' + (c ? '  +' + c + ' 🪙' : '') + (got === all ? '  Alle gefunden! 🎉' : ''), 2);
  });
}
function drawMoonMap(g) {
  const sc = (MAP - 16) / (MOON.r * 2), mx2 = x => MAP / 2 + (x - MOON.x) * sc, mz2 = z => MAP / 2 + (z - MOON.z) * sc, w = city.walk, me = city.me;
  g.fillStyle = '#0b0b12'; g.fillRect(0, 0, MAP, MAP);
  g.fillStyle = '#6b6b73'; g.beginPath(); g.arc(MAP / 2, MAP / 2, MOON.r * sc, 0, Math.PI * 2); g.fill();
  g.font = '12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🚀', mx2(MOON_ROCKET.x), mz2(MOON_ROCKET.z));
  g.fillStyle = '#67e8f9'; for (const r of S.moon.rocks) if (!r.got) g.fillRect(mx2(r.x) - 1.5, mz2(r.z) - 1.5, 3, 3);
  const P = mapWho();
  return { x: mx2(P.x), y: mz2(P.z), h: P.h, zoom: 2.5, bg: '#0b0b12' };
}

// ---------- Skifahren (Skigebiet am Pass) ----------
// Zu Fuss zur Talstation, X: im Sessellift hinauf. Oben bekommt man Ski: ⬅️➡️ lenken, ⬆️ anschieben, ⬇️ bremsen (Pflug),
// bergab wird man von selber schneller. Unten an der Talstation wieder X = nochmals hinauf; sonst X = Ski aus.
function startLift(w, Lf) {
  w.lift = { u: 0, len: Lf.len, L: Lf };
  w.target = null;
  if (!w.chair) { // Sessel unter dir
    const ch = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x2563eb });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.6), m); seat.position.y = 0.45; ch.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 1.6), m); back.position.set(-0.4, 0.85, 0); ch.add(back);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), new THREE.MeshStandardMaterial({ color: 0x374151 })); bar.position.set(-0.3, 1.9, 0); ch.add(bar);
    w.chair = ch;
  }
  w.mesh.add(w.chair);
  showMsg(Lf.name + ': es geht hinauf! Gas oder ▲ halten = schneller', 2.2);
}
function stepLift(w, dt) {
  const L = w.lift, Lf = L.L, T = Lf.towers, n = T.length - 1;
  L.u = Math.min(1, L.u + dt * (city.input.drift || city.input.up || city.input.gas ? 36 : 9) / L.len); // Leertaste, ▲ oder Gas: viermal so schnell
  const f = Math.min(n - 1e-6, L.u * n), k = Math.floor(f), q = f - k, a = T[k], b = T[k + 1];
  w.x = a.x + (b.x - a.x) * q + Lf.sx; w.z = a.z + (b.z - a.z) * q + Lf.sz;
  w.gy = a.y + (b.y - a.y) * q - 2.9;
  w.h = Math.atan2(T[n].z - T[0].z, T[n].x - T[0].x);
  w.mesh.position.set(w.x, w.gy, w.z); w.mesh.rotation.set(0, -w.h, 0);
  w.mesh.userData.legs.forEach(l => { l.rotation.z = 1.4; }); // sitzen
  w.mesh.userData.arms.forEach(a => { a.rotation.z = 0.3; });
  if (L.u >= 1) { // oben: aussteigen, Ski an
    w.lift = null; w.mesh.remove(w.chair);
    const back = Math.atan2(T[0].z - T[n].z, T[0].x - T[n].x); // oben aussteigen, Blick ins Tal
    w.x = Lf.B.x + Math.cos(back) * 10 - Lf.sx * 3; w.z = Lf.B.z + Math.sin(back) * 10 - Lf.sz * 3; w.h = back; w.speed = 3;
    skiOn(w);
  }
}
function skiOn(w) {
  if (!w.skis) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
    for (const z of [-0.12, 0.12]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.11), m); s.position.set(0.15, 0.03, z); g.add(s); }
    w.skis = g;
  }
  (w.mesh.userData.body || w.mesh).add(w.skis); // Ski drehen beim Salto mit
  w.ski = true; w.speed = 0;
  S.ui.hint.textContent = '⛷️ ⬅️ ➡️ lenken · ⬆️ anschieben · ⬇️ bremsen · X Ski aus (unten an der Talstation: X = Lift)';
  showMsg('⛷️ Ski an! Fahr hinunter – ⬅️➡️ lenken, ⬇️ bremsen', 2.6);
}
function skiOff(w) {
  w.ski = false; w.speed = 0;
  if (w.skis && w.skis.parent) w.skis.parent.remove(w.skis);
  w.mesh.rotation.set(0, -w.h, 0);
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen (lange = rennen) · E springen · Q Backflip · X einsteigen';
  showMsg('🚶 Ski aus', 1.2);
}
function stepSki(w, dt) {
  const input = city.input, G = (x, z) => groundAt(x, z), steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  w.h += steer * 1.7 * dt;
  const fx = Math.cos(w.h), fz = Math.sin(w.h);
  const slope = (G(w.x + fx, w.z + fz) - G(w.x - fx, w.z - fz)) / 2; // > 0: bergauf
  let v = w.speed - (city.moonOn ? MOON_G : 9.81) * slope * 0.85 * dt;
  if (input.gas && v < 6) v += 3 * dt; // mit den Stöcken anschieben
  if (input.brake) v -= Math.sign(v) * Math.min(Math.abs(v), 7 * dt); // Pflug
  v -= v * 0.05 * dt + Math.sign(v) * Math.min(Math.abs(v), 0.4 * dt); // Schnee bremst ein wenig
  if (steer) v *= 1 - 0.2 * dt;
  v = Math.max(-2, Math.min(26, v));
  const nx = w.x + fx * v * dt, nz = w.z + fz * v * dt;
  if (allowedAt(nx, nz, 0.5)) { w.x = nx; w.z = nz; } else { v = 0; if (city.msgT <= 0) showMsg('⛷️ Hier geht es nicht weiter', 1.2); }
  w.speed = v; w.gy = G(w.x, w.z);
  if (Math.abs(v) > 8 && steer && Math.random() < dt * 30) S.fx.puff(w.x - fx, w.gy + 0.2, w.z - fz, 0, 0); // Schnee stäubt
  stepAir(w, dt); // auf Ski: springen und Backflips!
  w.mesh.position.set(w.x, w.gy + (w.jy || 0), w.z); w.mesh.rotation.set(-steer * Math.min(0.4, Math.abs(v) / 40), -w.h, 0);
  if (!w.air && !(w.fallT > 0)) {
    w.mesh.userData.legs.forEach(l => { l.rotation.z = 0.35; }); (w.mesh.userData.knees || []).forEach(k => { k.rotation.z = -0.6; });
    w.mesh.userData.arms.forEach((a, i) => { a.rotation.z = 0.5 + (input.gas ? Math.sin(city.t * 8 + i) * 0.5 : 0); });
  }
  const atLift = S.country.lifts.find(Lf => Math.hypot(w.x - Lf.A.x, w.z - Lf.A.z) < 12);
  if (atLift && !(w.target && w.target.lift)) showMsg(atLift.name + ' – X: nochmals hinauf', 1.6);
  w.target = atLift ? { lift: atLift } : null;
  S.ui.walkbtn.classList.toggle('ready', atLift);
  S.ui.kmh.textContent = Math.round(Math.abs(v) * 3.6);
}

// ---------- Tempomat ----------
// Über der km/h-Anzeige: 🎯 ein/aus (C), − / + in 10er-Schritten. Eingeschaltet fährt das Auto selber bis zu diesem
// Tempo und nie schneller; Bremsen bremst. Wie hoch man ihn stellen kann, hängt vom Auto ab (seine Höchstgeschwindigkeit).
const cruiseMax = () => Math.max(20, Math.floor(city.me.maxV * 3.6 / 10) * 10);
function cruiseCmd(c) {
  if (!city || !city.cruise) return;
  const C = city.cruise, max = cruiseMax();
  if (c === '+') C.kmh = Math.min(max, C.kmh + 10);
  else if (c === '-') C.kmh = Math.max(20, C.kmh - 10);
  else { C.on = !C.on; showMsg(C.on ? '🎯 Tempomat an: höchstens ' + C.kmh + ' km/h' : '🎯 Tempomat aus', 1.4); }
  if (c !== 'on' && C.kmh === max && c === '+') showMsg('🎯 Mehr geht mit diesem Auto nicht (' + max + ' km/h)', 1.6);
  showCruise();
}
function showCruise() {
  const C = city.cruise;
  C.kmh = Math.min(C.kmh, cruiseMax());
  S.ui.cruiseVal.textContent = C.kmh;
  S.ui.cruiseOn.classList.toggle('on', C.on);
}

// ---------- Fliegen (Flughafen, ab 12 Schlüsseln) ----------
// Zu Fuss zum orangen Flugzeug, X: einsteigen. Gas = schneller rollen, ab ~150 km/h mit E / ▲ abheben. In der Luft:
// ⬅️➡️ Kurve (das Flugzeug legt sich hinein), E/Q bzw. ▲▼ steigen/sinken, Gas/Bremse schneller/langsamer.
// Landen: langsam (unter 270 km/h), flach sinken und Flügel gerade auf ebenem Boden. Sonst Bruchlandung = zurück zum Flughafen.
function enterPlane() {
  const me = city.me, F = S.areas.flyer;
  city.plane = { car: me.mesh, carPos: { x: me.pos.x, z: me.pos.z }, carH: me.heading, air: false, vy: 0, roll: 0, pitch: 0, crashT: 0, told: false };
  me.mesh = F.mesh;
  Object.assign(me.pos, { x: F.x, z: F.z }); me.heading = F.h;
  Object.assign(me, { speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  S.ui.flybtn.hidden = true;
  showMsg('✈️ Gas: zur Piste rollen und schnell werden – dann E / ▲ zum Abheben', 3);
}
function leavePlane() {
  const me = city.me, P = city.plane, F = S.areas.flyer;
  F.x = me.pos.x; F.z = me.pos.z; F.h = me.heading; // bleibt stehen, wo du es abstellst
  me.mesh = P.car;
  const px = me.pos.x - Math.sin(me.heading) * 9, pz = me.pos.z + Math.cos(me.heading) * 9; // neben dem Flugzeug aussteigen
  Object.assign(me.pos, P.carPos); me.heading = P.carH;
  Object.assign(me, { speed: 0, vl: 0, alt: 0, fly: false });
  city.plane = null;
  S.ui.flyctl.hidden = true; S.ui.flybtn.hidden = !city.canFly;
  const w = city.walk = { x: px, z: pz, h: me.heading, speed: 0, phase: 0, mesh: makePlayer(), target: null };
  w.mesh.position.set(w.x, 0, w.z); S.scene.add(w.mesh);
  S.ui.walkbtn.textContent = '🚗';
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen (lange = rennen) · E springen · Q Backflip · X einsteigen';
  showMsg('🚶 Ausgestiegen – dein Auto steht noch, wo du es gelassen hast', 2.2);
}
function planeCrash() {
  const P = city.plane, me = city.me;
  P.crashT = 2.5; me.speed = 0;
  crash(1, 'car');
  for (let k = 0; k < 14; k++) S.fx.puff(me.pos.x + (Math.random() - 0.5) * 12, me.alt + Math.random() * 5, me.pos.z + (Math.random() - 0.5) * 12, 0, 0);
  showMsg('💥 Bruchlandung! Das Flugzeug wird zurück zum Flughafen gebracht', 2.6);
}
function solidTop(x, z) { let h = 0; for (const b of S.solid) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) h = Math.max(h, b.h || 6); return h; }
function stepPlane(dt) {
  const me = city.me, P = city.plane, input = city.input, m = me.mesh, F = S.areas.flyer;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (P.crashT > 0) { // nach der Bruchlandung: zurück an den Anfang der Piste
    if ((P.crashT -= dt) <= 0) {
      Object.assign(me.pos, { x: F.start.x, z: F.start.z }); me.heading = F.start.h;
      Object.assign(P, { air: false, vy: 0, roll: 0, pitch: 0 }); me.alt = 0; me.fly = false; me.speed = 0;
    }
    return;
  }
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  if (!P.air) { // am Boden rollen
    if (input.gas) me.speed = Math.min(85, Math.max(0, me.speed) + (me.speed < 20 ? 6 : 9) * dt);
    else if (input.brake) me.speed = me.speed > 0 ? Math.max(0, me.speed - 14 * dt) : Math.max(-3, me.speed - 2 * dt);
    else me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 1.5 * dt);
    me.heading += steer * Math.min(0.7, 9 / Math.max(9, Math.abs(me.speed))) * dt * Math.sign(me.speed || 1);
    const nx = me.pos.x + Math.cos(me.heading) * me.speed * dt, nz = me.pos.z + Math.sin(me.heading) * me.speed * dt;
    if (allowedAt(nx, nz, 3)) { me.pos.x = nx; me.pos.z = nz; } else { if (Math.abs(me.speed) > 10) crash(0.4, 'car'); me.speed = 0; }
    me.alt = 0; P.roll *= 0.9; P.pitch *= 0.9;
    if (me.speed > 42) {
      if (input.up) { P.air = true; P.vy = 7; P.liftT = 2; me.alt = 1; me.fly = true; showMsg('✈️ Abgehoben! ⬅️➡️ Kurve · E/Q oder ▲▼ steigen/sinken', 2.6); }
      else if (!P.told) { P.told = true; showMsg('⬆️ Jetzt E oder ▲ drücken – abheben!', 2); }
    }
    S.ui.flyctl.hidden = me.speed < 30;
  } else { // in der Luft
    if (input.gas) me.speed = Math.min(120, me.speed + 8 * dt); else if (input.brake) me.speed = Math.max(40, me.speed - 10 * dt);
    P.roll += (steer * 0.7 - P.roll) * Math.min(1, dt * 2);
    me.heading += P.roll * 0.8 * dt;
    const want = ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * 16;
    P.vy += (want - P.vy) * Math.min(1, dt * 1.5);
    me.alt = Math.min(600, me.alt + P.vy * dt);
    P.pitch = Math.atan2(P.vy, me.speed) * 1.4;
    let nx = me.pos.x + Math.cos(me.heading) * me.speed * dt, nz = me.pos.z + Math.sin(me.heading) * me.speed * dt;
    if (nx < -2750 || nx > 1750 || nz < -1700 || nz > 3400) { // Ende der Welt: umkehren (die Diamantinsel liegt im Westen)
      me.heading += Math.PI * dt * 0.8; nx = me.pos.x; nz = me.pos.z;
      if (city.msgT <= 0) showMsg('🌍 Ende der Welt – kehr um!', 1.4);
    }
    me.pos.x = nx; me.pos.z = nz;
    const floor = Math.max(groundAt(nx, nz), solidTop(nx, nz));
    P.liftT = (P.liftT || 0) - dt;
    if (P.liftT > 0) me.alt = Math.max(me.alt, floor + 1); // gerade abgehoben: noch nicht wieder landen
    else if (me.alt <= floor + 0.6) { // Boden berührt: landen oder Bruch
      const flat = solidTop(nx, nz) === 0 && allowedAt(nx, nz, 3) && Math.abs(groundAt(nx + fx * 10, nz + fz * 10) - groundAt(nx, nz)) < 1;
      if (flat && P.vy > -7 && Math.abs(P.roll) < 0.35 && me.speed < 76) {
        Object.assign(P, { air: false, vy: 0 }); me.fly = false; me.alt = 0;
        const c = city.net ? 0 : 5; if (c) city.earn(c);
        showMsg('🛬 Gelandet! Gut gemacht' + (c ? '  +' + c + ' 🪙' : '') + ' – anhalten und X zum Aussteigen', 2.6);
      } else { me.alt = floor; planeCrash(); return; }
    }
    S.ui.flyctl.hidden = false;
  }
  const y = me.alt + (P.air ? 0 : groundAt(me.pos.x, me.pos.z));
  city.gy = P.air ? 0 : y;
  m.position.set(me.pos.x, y, me.pos.z);
  m.rotation.set(P.roll, -me.heading, P.pitch);
  S.ui.kmh.textContent = Math.round(Math.abs(me.speed) * 3.6);
}

// ---------- Boot (Strand) ----------
// Zu Fuss auf den Steg und einsteigen: das Auto bleibt am Strand stehen, man fährt mit dem Boot (city.boat) auf dem
// Wasser. Zurück am Steg mit 🚪 aussteigen und zu Fuss zum Auto.
function enterBoat() {
  const me = city.me, C = S.country;
  city.boat = { car: me.mesh, carPos: { x: me.pos.x, z: me.pos.z }, carH: me.heading };
  C.boat.rotation.order = 'YZX';
  me.mesh = C.boat;
  const bs = city.boatAt || BOAT_HOME;
  Object.assign(me.pos, { x: bs.x, z: bs.z }); me.heading = bs.h;
  Object.assign(me, { speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  S.ui.flybtn.hidden = true;
  showMsg('🚤 Leinen los! Zum Aussteigen zurück zum Steg und 🚪', 2.6);
}
function leaveBoat() {
  const me = city.me, B = city.boat, C = S.country, mon = nearMonPier(me.pos.x, me.pos.z), bs = mon ? MON_BOAT : BOAT_HOME;
  city.boatAt = mon ? MON_BOAT : null; // das Boot bleibt an diesem Steg
  C.boat.position.set(bs.x, BOAT_Y, bs.z); C.boat.rotation.set(0, -bs.h, 0);
  me.mesh = B.car;
  Object.assign(me.pos, B.carPos); me.heading = B.carH;
  Object.assign(me, { speed: 0, vl: 0, alt: 0 });
  city.boat = null;
  const w = city.walk = mon ? { x: MON_PIER.x0 + 3, z: (MON_PIER.z0 + MON_PIER.z1) / 2, h: Math.PI, speed: 0, phase: 0, mesh: makePlayer(), target: null }
    : { x: -768, z: -420, h: 0, speed: 0, phase: 0, mesh: makePlayer(), target: null };
  w.mesh.position.set(w.x, 0, w.z);
  S.scene.add(w.mesh);
  S.ui.walkbtn.textContent = '🚗';
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen (lange = rennen) · E springen · Q Backflip · X einsteigen';
  showMsg(mon ? '🚶 Willkommen auf der Diamantinsel! Nimm ein Auto vom Jachthafen' : '🚶 Am Steg ausgestiegen – geh zu deinem Auto', 2.4);
}
function onBale() {
  city.bales = (city.bales || 0) + 1;
  const c = city.net ? 0 : 2;
  if (c) city.earn(c);
  showMsg('🌾 Heuballen eingesammelt! (' + city.bales + ')' + (c ? '  +' + c + ' 🪙' : ''), 1.6);
}

// ---------- Fussgänger ----------
// Sie gehen auf den Trottoirs rund um die Blöcke (RING Meter von der Blockmitte) und überqueren an Ampel-Kreuzungen
// auf dem Zebrastreifen, wenn die Autos dort Rot haben. Autos halten für sie an (followLimit); wer einen anfährt,
// erschreckt ihn (er fällt um), auf dem Zebrastreifen gibt es dafür einen Strafzettel.
const PEDS = 64, RING = 23.5, PED_SEE = 110; // weiter weg werden Fussgänger nicht gezeichnet
const SHIRTS = [0x2563eb, 0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0xec4899, 0x0e7490, 0xf4f4f5, 0x1f2937], HAIRS = [0x5a3a1e, 0x1b1b1b, 0xd4a017, 0x8b4513, 0x9ca3af];
const SKINS = [0xf2c9a0, 0xe0ac69, 0x8d5524, 0xc68642, 0xffdbac];
const pedBlockOk = (bi, bj) => blockOn(bi, bj) && baseOf(bi + ',' + bj) < 0;
const corner = (bi, bj, k) => { const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2; return [cx + (k === 1 || k === 2 ? RING : -RING), cz + (k >= 2 ? RING : -RING)]; };
// Charaktere: jeder geht anders, trägt etwas Eigenes und sagt eigene Sprüche (wenn du nahe kommst, hupst oder gesucht wirst)
const PED_TYPES = {
  normal: { n: 5, speed: [1.1, 1.6], hi: ['👋 Hallo!', '🙂 Schöner Tag heute!', '😊 Grüezi!'], honk: ['😠 Hey!', '🙉 So laut!'] },
  jogger: { n: 2, speed: [3.6, 4.4], hi: ['🏃 Bin am Trainieren!', '💪 Noch 5 Kilometer!', '😅 Puh, ist das heiss!'], honk: ['🏃 Ich bin schneller!', '😤 Hey!'] },
  senior: { n: 2, speed: [0.5, 0.7], hi: ['👴 Grüss dich, junger Freund!', '🧓 Früher gab es nur Pferde!', '👵 Fahr vorsichtig, gell!'], honk: ['👴 Nicht so laut, Lausbub!', '🧓 Meine Ohren!'] },
  kid: { n: 2, speed: [1.5, 2.0], hi: ['😄 Cooles Auto!', '🎈 Schau, mein Ballon!', '🍦 Ich will ein Glace!'], honk: ['😆 Nochmal hupen!', '🤩 Tuuut tuuut!'] },
  dog: { n: 2, speed: [1.0, 1.3], hi: ['🐶 Er will nur spielen!', '🐕 Sitz, Bello!', '🦴 Wer ist ein braver Hund?'], honk: ['🐕 Wuff! Wuff!', '🐶 Jetzt bellt er!'] },
  phone: { n: 2, speed: [0.8, 1.0], hi: ['📱 Moment, ich schreibe grad …', '🤳 Selfie!', '🎧 Hast du was gesagt?'], honk: ['📱 Oh! Hab nicht geschaut!', '😳 Sorry!'] },
  business: { n: 2, speed: [1.7, 2.0], hi: ['💼 Ich bin spät dran!', '📞 Ja, Sitzung um drei!', '⌚ Zeit ist Geld!'], honk: ['💼 Ich hab keine Zeit!', '😤 Unverschämt!'] },
  tourist: { n: 2, speed: [0.9, 1.2], hi: ['📸 Wie schön hier!', '🗺️ Wo ist der Bahnhof?', '😍 So eine schöne Stadt!'], honk: ['📸 Oh, ein Foto!', '😮 Ui!'] },
};
const PED_LIST = Object.entries(PED_TYPES).flatMap(([id, T]) => Array(T.n).fill(id));
const accMat = {};
const accM = (hex, o = {}) => accMat[hex] || (accMat[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, ...o }));
function addAcc(parent, geo, hex, x, y, z, o) { const m = new THREE.Mesh(geo, accM(hex, o)); m.position.set(x, y, z); parent.add(m); return m; }
function makeCharacter(type) {
  const r = a => a[Math.floor(Math.random() * a.length)], shirt = r(SHIRTS), hair = r(HAIRS), skin = r(SKINS);
  let mesh;
  if (type === 'jogger') {
    mesh = makePerson(r([0xf97316, 0x22d3ee, 0xa3e635, 0xf43f5e]), hair, skin, { outfit: 'tee', hair: r(['short', 'cap']), pants: 0x111827, noBag: true });
    addAcc(mesh, new THREE.TorusGeometry(0.15, 0.025, 6, 16), 0xffffff, 0, 1.85, 0).rotation.x = Math.PI / 2; // Stirnband
  } else if (type === 'senior') {
    mesh = makePerson(r([0x78716c, 0x6b7280, 0x7c2d12, 0x1e3a5f]), r([0xd1d5db, 0xf3f4f6, 0x9ca3af]), skin, { outfit: r(['jacket', 'dress']), hair: r(['short', 'hat', 'bun']), noBag: true });
    const cane = addAcc(mesh.userData.arms[1], new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), 0x5b3a1e, 0.05, -0.95, 0); // Stock
    addAcc(cane, new THREE.TorusGeometry(0.05, 0.016, 6, 10, Math.PI), 0x5b3a1e, 0.05, 0.45, 0);
  } else if (type === 'kid') {
    mesh = makePerson(r([0xfacc15, 0xf472b6, 0x38bdf8, 0x4ade80]), hair, skin, { outfit: r(['tee', 'dress']), hair: r(['short', 'cap', 'bun', 'long']), noBag: true });
    mesh.scale.setScalar(0.62);
    const col = r([0xef4444, 0x3b82f6, 0xfacc15, 0xa855f7]);
    addAcc(mesh, new THREE.CylinderGeometry(0.006, 0.006, 1.2, 4), 0xf5f5f5, 0.15, 1.85, 0.3); // Ballon an der Schnur
    const ball = addAcc(mesh, new THREE.SphereGeometry(0.26, 14, 12), col, 0.15, 2.6, 0.3, { roughness: 0.25 }); ball.scale.y = 1.15;
    mesh.userData.balloon = ball;
  } else if (type === 'business') {
    mesh = makePerson(r([0x1f2937, 0x334155, 0x1e3a5f]), r([0x1b1b1b, 0x5a3a1e, 0x9ca3af]), skin, { outfit: 'jacket', hair: 'short', pants: 0x1f2937, noBag: true });
    addAcc(mesh.userData.arms[1], new THREE.BoxGeometry(0.3, 0.22, 0.07), 0x3b2a1a, 0, -0.75, 0); // Aktenkoffer
    addAcc(mesh, new THREE.BoxGeometry(0.02, 0.3, 0.05), r([0xdc2626, 0x1d4ed8, 0xfacc15]), 0.17, 1.3, 0); // Krawatte
  } else if (type === 'tourist') {
    mesh = makePerson(r([0xf472b6, 0x22d3ee, 0xfde047, 0xffffff]), hair, skin, { outfit: 'tee', hair: 'hat', pants: r([0xd6c29c, 0x65a30d]), noBag: true });
    addAcc(mesh, new THREE.BoxGeometry(0.1, 0.09, 0.14), 0x111827, 0.2, 1.32, 0); // Kamera
    addAcc(mesh, new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), 0x374151, 0.27, 1.32, 0).rotation.z = Math.PI / 2;
    addAcc(mesh, new THREE.BoxGeometry(0.22, 0.3, 0.3), r([0x15803d, 0xb91c1c, 0x1d4ed8]), -0.22, 1.25, 0); // Rucksack
  } else if (type === 'phone') {
    mesh = makePerson(shirt, hair, skin, { noBag: true });
    addAcc(mesh.userData.arms[1], new THREE.BoxGeometry(0.02, 0.15, 0.08), 0x0f172a, 0.04, -0.62, 0); // Handy
    if (Math.random() < 0.5) for (const s of [-1, 1]) addAcc(mesh, new THREE.SphereGeometry(0.05, 8, 6), 0xffffff, 0, 1.76, s * 0.15); // Kopfhörer
  } else if (type !== 'dog') mesh = makePerson(shirt, hair, skin);
  if (type === 'dog') { // Hund an der Leine
    mesh = makePerson(shirt, hair, skin, { noBag: true });
    const fur = r([0x8b5a2b, 0xf5deb3, 0x1b1b1b, 0xffffff, 0xd97706]), dog = figMesh([
      [G.cap(0.12, 0.35), fur, 0, 0.32, 0, 0, 0, Math.PI / 2], [G.sph(0.11), fur, 0.3, 0.45, 0], [G.sph(0.06), shade(fur, 0.8), 0.4, 0.42, 0],
      [G.sph(0.025), 0x111111, 0.46, 0.43, 0], [G.sph(0.05), shade(fur, 0.7), 0.27, 0.52, 0.08, 0, 0, 0, 0.6, 1.2, 0.5], [G.sph(0.05), shade(fur, 0.7), 0.27, 0.52, -0.08, 0, 0, 0, 0.6, 1.2, 0.5],
      [G.cap(0.03, 0.15), fur, -0.27, 0.45, 0, 0, 0, -0.7],
      ...[[0.15, 0.08], [0.15, -0.08], [-0.15, 0.08], [-0.15, -0.08]].map(([x, z]) => [G.cap(0.035, 0.16), fur, x, 0.13, z]),
    ]);
    dog.position.set(0.6, 0, 0.55); mesh.add(dog);
    const leash = addAcc(mesh, new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), 0xdc2626, 0.35, 0.75, 0.42); leash.rotation.set(0.6, 0, -1.0);
    mesh.userData.dog = dog;
  }
  return mesh;
}
function makePeds() {
  const peds = [];
  for (let n = 0; n < PEDS; n++) {
    let bi, bj; do { bi = Math.floor(Math.random() * N); bj = Math.floor(Math.random() * N); } while (!pedBlockOk(bi, bj));
    const k = Math.floor(Math.random() * 4), [x, z] = corner(bi, bj, k), type = PED_LIST[Math.floor(Math.random() * PED_LIST.length)], T = PED_TYPES[type];
    const mesh = makeCharacter(type);
    mesh.traverse(o => { o.castShadow = false; });
    S.scene.add(mesh);
    peds.push({ mesh, type, bi, bj, k, rot: Math.random() < 0.5 ? 1 : -1, x, z, h: 0, speed: 0, want: T.speed[0] + Math.random() * (T.speed[1] - T.speed[0]), phase: Math.random() * 6,
      tx: x, tz: z, cross: null, wait: 0, down: 0, gy: 0.16, pause: 0, pauseT: 6 + Math.random() * 20, talkT: Math.random() * 5, sayT: 0 });
  }
  return peds;
}
// Fussgänger sagt etwas (Sprechblase für ein paar Sekunden)
function pedSay(p, list, t = 2.6) { say(p, list[Math.floor(Math.random() * list.length)]); p.sayT = t; p.talkT = 15 + Math.random() * 15; }
// Charakter: Pausen (Handy lesen, Foto machen), Ballon wackelt, Hund läuft mit, Sprüche
function stepCharacter(p, dt, seen) {
  if (p.sayT > 0 && (p.sayT -= dt) <= 0) say(p, null);
  p.talkT -= dt;
  if ((p.type === 'phone' || p.type === 'tourist' || p.type === 'dog') && !p.cross && (p.pauseT -= dt) <= 0) { // kurz stehen bleiben
    p.pause = p.type === 'tourist' ? 3 : 2 + Math.random() * 3; p.pauseT = 10 + Math.random() * 20;
    if (p.type === 'tourist' && seen && p.talkT < 8) { say(p, '📸 Klick!'); p.sayT = 1.4; }
  }
  if (!seen) return;
  const U = p.mesh.userData;
  if (p.type === 'phone') U.arms[1].rotation.z = 1.25; // schaut aufs Handy
  if (p.type === 'tourist' && p.pause > 0) U.arms.forEach(a => { a.rotation.z = 1.5; });
  if (p.type === 'senior') U.arms[1].rotation.z = 0.15 + Math.sin(p.phase) * 0.1;
  if (p.type === 'business') U.arms[1].rotation.z *= 0.4;
  if (U.balloon) { U.balloon.position.y = 2.6 + Math.sin(city.t * 2 + p.phase) * 0.06; U.balloon.rotation.z = Math.sin(city.t * 1.3 + p.phase) * 0.15; }
  if (U.dog) U.dog.position.y = Math.abs(Math.sin(p.phase * 1.6)) * 0.05;
  // Sprüche: kommst du nah (zu Fuss oder langsam im Auto)?
  const w = city.walk, x = w ? w.x : city.me.pos.x, z = w ? w.z : city.me.pos.z, d = Math.hypot(x - p.x, z - p.z);
  if (p.talkT <= 0 && p.sayT <= 0) {
    if (city.wanted && d < 14) pedSay(p, ['😱 Der Autodieb!', '🚨 Polizei! Da ist er!', '😨 Hilfe, ein Dieb!']);
    else if (d < (w ? 3.5 : 7) && (w || Math.abs(city.me.speed) < 3)) pedSay(p, PED_TYPES[p.type].hi);
  }
}
function nextCorner(p) { // weiter auf dem Trottoir, oder an der Ecke über die Strasse
  const [x, z] = corner(p.bi, p.bj, p.k), X = Math.round(x / BLOCK) * BLOCK, Z = Math.round(z / BLOCK) * BLOCK;
  const I = Math.round(X / BLOCK + N / 2), J = Math.round(Z / BLOCK + N / 2);
  if (Math.random() < 0.45 && inGrid(I, J) && hasLights(I, J)) {
    const opts = [];
    const nbx = p.bi + Math.sign(X - x), nbz = p.bj + Math.sign(Z - z);
    if (pedBlockOk(nbx, p.bj)) opts.push({ tx: 2 * X - x, tz: z, axis: 'z', bi: nbx, bj: p.bj }); // über die Strasse, auf der die Autos in z fahren
    if (pedBlockOk(p.bi, nbz)) opts.push({ tx: x, tz: 2 * Z - z, axis: 'x', bi: p.bi, bj: nbz });
    if (opts.length) {
      const o = opts[Math.floor(Math.random() * opts.length)];
      p.cross = o; p.tx = x; p.tz = z; p.wait = 0;
      return;
    }
  }
  p.k = (p.k + p.rot + 4) % 4;
  [p.tx, p.tz] = corner(p.bi, p.bj, p.k);
}
function stepPeds(dt) {
  const t = city.t, me = city.me, cam = S.camera.position;
  for (const p of city.peds) {
    if (p.down > 0) { // umgefallen: liegt kurz und steht wieder auf
      p.down -= dt;
      p.mesh.rotation.z = p.down > 0.6 ? -Math.PI / 2 * Math.min(1, (3.2 - p.down) * 4) : -Math.PI / 2 * p.down / 0.6;
      p.mesh.position.y = 0.16 + (p.down > 0.6 ? 0.25 : 0);
      if (p.down <= 0) p.mesh.rotation.z = 0;
      continue;
    }
    const C = p.cross;
    if (C && !C.go) { // am Zebrastreifen: warten, bis die Autos dort Rot haben (und noch ein paar Sekunden bleibt)
      const ph = ((t % CYCLE) + CYCLE) % CYCLE, ok = C.axis === 'x' ? ph >= 10.5 && ph < 12.5 : ph >= 21.5 || ph < 2.5;
      if (ok) { C.go = true; p.tx = C.tx; p.tz = C.tz; }
      p.speed = 0;
    }
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15 && !(C && !C.go)) {
      if (C && C.go) { p.bi = C.bi; p.bj = C.bj; p.cross = null; // drüben: welche Ecke vom neuen Block?
        let best = 0, bd = 1e9; for (let k = 0; k < 4; k++) { const [cx, cz] = corner(p.bi, p.bj, k), e = Math.hypot(cx - p.x, cz - p.z); if (e < bd) { bd = e; best = k; } }
        p.k = best; }
      nextCorner(p);
    } else if (city.walk && Math.hypot(city.walk.x - p.x, city.walk.z - p.z) < 1.3 && (city.walk.x - p.x) * dx + (city.walk.z - p.z) * dz > 0) {
      p.speed = 0; // du stehst im Weg: kurz warten statt hindurchlaufen
    } else if (p.pause > 0 && !C) {
      p.pause -= dt; p.speed = 0;
    } else if (d > 0.01 && !(C && !C.go)) {
      p.speed = C && C.go ? Math.max(1.7, p.want) : p.want;
      p.h = Math.atan2(dz, dx);
      const st = Math.min(d, p.speed * dt);
      p.x += dx / d * st; p.z += dz / d * st;
    }
    p.onZebra = !!(C && C.go);
    // angefahren?
    const md = Math.hypot(me.pos.x - p.x, me.pos.z - p.z);
    if (p.hitByMe || (!city.walk && me.alt < 1.5 && md < me.radius * 0.6 + 0.4 && Math.abs(me.speed) > 1.5)) {
      p.hitByMe = false;
      p.down = 3.2; p.speed = 0;
      crash(0.15, 'car');
      if (p.onZebra && !city.ticket && !city.police) { city.reason = { kind: 'zebra', text: '🚸 Fussgänger auf dem Zebrastreifen angefahren' }; giveTicket(); }
      else showMsg('😵 Pass auf – ein Fussgänger!', 1.8);
      me.speed *= 0.5;
      continue;
    }
    const seen = Math.hypot(p.x - cam.x, p.z - cam.z) < Math.min(city.see, PED_SEE);
    p.mesh.visible = seen;
    if (seen) { p.gy = p.onZebra ? 0.02 : 0.16; animatePerson(p, dt); }
    stepCharacter(p, dt, seen);
  }
}

// ---------- Blaue Zone ----------
// Parkplatz in der Stadt: mal ist viel los (fast alles besetzt, manchmal gar kein Feld frei), mal ist es ruhig.
// Autos aus dem Verkehr biegen ein, parkieren, fahren rückwärts hinaus und wieder in den Verkehr. Wer selber in einem
// freien Feld parkiert, bekommt Münzen; die Parkscheibe erlaubt BLUE_MAX Sekunden, danach gibt es einen Strafzettel.
const BLUE_MAX = 180;
function freeBlue() {
  const free = S.places.blue.slots.filter(q => !q.car && !q.me && !(q.gone > 0));
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}
function enterLot(c, q) {
  const B = S.places.blue, cx = B.cx, cz = B.cz, sg = q.x >= cx ? 1 : -1, ez = B.road + LANE;
  const pts = [[c.x, c.z], [cx - 8, ez], [cx - 1.6, ez + 6], [cx - 1.6, cz - 8]]; // Einfahrt links, Ausfahrt rechts
  if (q.z < cz) pts.push([cx + sg * 2, cz - 1], [q.x + sg * 6, cz + 1], [q.x, cz - 6], [q.x, q.z]); // vorne: vorbei und zurück ins Feld
  else if (Math.abs(q.x - cx) < 7) pts.push([q.x, cz + 4], [q.x, q.z]);
  else pts.push([cx + sg * 2, cz - 2], [q.x - sg * 5, cz + 2], [q.x, cz + 6], [q.x, q.z]);
  c.lot = { state: 'in', q, path: makePath(pts), d: 0, i: 0 };
  c.turn = null; q.car = c;
}
function stepLot(c, dt) {
  const L = c.lot, q = L.q, B = S.places.blue, me = city.me;
  if (L.state === 'park') {
    c.speed = 0;
    if ((L.t -= dt) <= 0 && Math.hypot(me.pos.x - q.x, me.pos.z - (q.z < B.cz ? q.z + 5 : q.z - 5)) > 4) { // rückwärts hinaus (wenn hinten frei ist)
      L.state = 'back'; L.path = makePath([[q.x, q.z], [q.x, q.z < B.cz ? B.cz - 3 : B.cz + 3]]); L.d = 0; L.i = 0; q.car = null; q.gone = 4;
    }
    return;
  }
  if (L.state === 'join') { // auf die Strasse, wenn eine Lücke da ist
    const jx = B.cx + 13, jz = B.road + LANE;
    if (!city.cars.some(o => o !== c && !o.lot && Math.abs(o.z - jz) < 2.5 && o.x > jx - 18 && o.x < jx + 8) && Math.hypot(me.pos.x - jx, me.pos.z - jz) > 6) {
      c.lot = null;
      Object.assign(c, { i: B.seg.i, j: B.seg.j, d: B.seg.d, s: jx - node(B.seg.i), turn: null, speed: 3, lotAsk: true });
      placeOnSegment(c);
    }
    return;
  }
  const left = L.path.L - L.d, back = L.state === 'back';
  let v = Math.min(back ? 1.8 : L.state === 'in' && L.d < 20 ? 7 : 4, Math.sqrt(2 * 2 * left) + 0.15);
  const dir = back ? c.h + Math.PI : c.h, fx = Math.cos(dir), fz = Math.sin(dir);
  const ahead = (x, z, far) => { const dx = x - c.x, dz = z - c.z, along = dx * fx + dz * fz; return along > 0 && along < far && Math.abs(dz * fx - dx * fz) < 2.4; };
  let byCar = false; // andere auf dem Parkplatz (stehen zwei zu lange voreinander, schiebt sich einer vorsichtig vorbei)
  if (!(L.ghost > 0)) for (const o of city.cars) if (o !== c && o.lot && o.lot.state !== 'park' && ahead(o.x, o.z, 7)) { v = 0; byCar = true; }
  L.ghost = (L.ghost || 0) - dt;
  L.waitT = byCar ? (L.waitT || 0) + dt : 0;
  if (L.waitT > 4) { L.ghost = 2.5; L.waitT = 0; }
  if (me.alt < 2 && ahead(me.pos.x, me.pos.z, 7)) v = 0; // du stehst im Weg
  if (city.walk && ahead(city.walk.x, city.walk.z, 5)) v = 0; // zu Fuss auch
  c.speed += Math.max(-5 * dt, Math.min(2.5 * dt, v - c.speed));
  c.speed = Math.max(0, c.speed);
  L.d = Math.min(L.path.L, L.d + c.speed * dt);
  const p = pathAt(L.path, L.d, L.i);
  L.i = p.i; c.x = p.x; c.z = p.z;
  c.h = turnTo(c.h, back ? p.h + Math.PI : p.h, dt * Math.max(0.8, c.speed * 0.7));
  if (left > 0.05) return;
  if (L.state === 'in') { L.state = 'park'; c.h = q.h; c.speed = 0; L.t = city.blue.busy ? 60 + Math.random() * 120 : 15 + Math.random() * 45; }
  else if (back) {
    const sg = q.x >= B.cx ? 1 : -1, ez = B.road + LANE, z0 = q.z < B.cz ? B.cz - 3 : B.cz + 3;
    L.state = 'out'; L.d = 0; L.i = 0;
    L.path = makePath([[q.x, z0], [B.cx + sg * 4 + 1.6, B.cz - 4], [B.cx + 1.6, B.cz - 10], [B.cx + 1.6, ez + 6], [B.cx + 7, ez + 1], [B.cx + 13, ez]]);
  } else L.state = 'join';
}
function setupBlue() {
  const B = S.places.blue;
  city.blue = { busy: Math.random() < 0.5, t: 40 + Math.random() * 40, spawnT: 3, stillT: 0, parked: null, coinT: -999, toldFull: false };
  if (!B) return;
  B.disp.last = -1;
  for (const q of B.slots) {
    q.car = null; q.gone = 0; q.me = false;
    if (Math.random() > (city.blue.busy ? 0.9 : 0.55)) continue;
    let c = null;
    for (let k = 0; k < 4 && !(c && c.len < 5.6); k++) c = makeCar(city.kinds, B.seg.i, B.seg.j, 0, 20);
    if (c.len >= 5.6) continue;
    Object.assign(c, { x: q.x, z: q.z, h: q.h, speed: 0, lot: { state: 'park', q, t: Math.random() * 150 } });
    q.car = c; city.cars.push(c); S.scene.add(c.mesh);
  }
}
function drawBlueDisplay(free) {
  const { c, tex } = S.places.blue.disp, g = c.getContext('2d');
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, 256, 128);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = free ? '#22c55e' : '#ef4444'; g.font = 'bold 50px system-ui, sans-serif';
  g.fillText(free ? free + ' frei' : 'BESETZT', 128, 50);
  g.fillStyle = '#93c5fd'; g.font = 'bold 22px system-ui, sans-serif'; g.fillText('🕐 Parkscheibe 3 Min.', 128, 104);
  tex.needsUpdate = true;
}
function stepBlue(dt) {
  const B = S.places.blue, st = city.blue, me = city.me;
  if (!B) return;
  if ((st.t -= dt) <= 0) { st.busy = !st.busy; st.t = st.busy ? 80 + Math.random() * 70 : 50 + Math.random() * 50; } // mal viel los, mal ruhig
  // stehst du (mit dem Auto) in einem Feld?
  let mine = null;
  for (const q of B.slots) { if (q.gone > 0) q.gone -= dt; q.me = Math.abs(me.pos.x - q.x) < 1.7 && Math.abs(me.pos.z - q.z) < 3 && me.alt < 1.5; if (q.me) mine = q; }
  if (mine && !mine.car && Math.abs(me.speed) < 0.4) st.stillT += dt; else if (!mine) { st.stillT = 0; st.parked = null; }
  if (mine && !st.parked && st.stillT > 1.2) {
    st.parked = { t: 0, warned: false, fined: false };
    const coins = !city.net && city.t - st.coinT > 90 ? 3 : 0;
    if (coins) { city.earn(coins); st.coinT = city.t; }
    showMsg('🅿️ Parkiert in der Blauen Zone! Parkscheibe: 3 Minuten 🕐' + (coins ? '  +' + coins + ' 🪙' : ''), 2.6);
  }
  if (st.parked) {
    const P = st.parked;
    P.t += dt;
    if (P.t > BLUE_MAX - 30 && !P.warned) { P.warned = true; showMsg('⏰ Parkzeit bald um – noch 30 Sekunden!', 2.4); }
    if (P.t > BLUE_MAX && !P.fined && !city.ticket && !city.police) {
      P.fined = true;
      city.reason = { kind: 'blue', text: '🅿️ Blaue Zone: Parkzeit überschritten' };
      giveTicket();
    }
  }
  // Anzeige und Hinweis, wenn alles besetzt ist
  const free = B.slots.filter(q => !q.car && !q.me).length;
  if (free !== B.disp.last) { B.disp.last = free; drawBlueDisplay(free); }
  const near = Math.hypot(me.pos.x - B.cx, me.pos.z - (B.road + 4)) < 28;
  if (near && !free && !st.toldFull && !mine) { st.toldFull = true; showMsg('🅿️ Blaue Zone: alles besetzt – kein Platz frei 😕', 2.2); }
  if (!near) st.toldFull = false;
  // Nachschub: ein weit entferntes Auto fährt (unsichtbar umgesetzt) von weiter vorne her zur Blauen Zone
  if ((st.spawnT -= dt) <= 0) {
    st.spawnT = st.busy ? 4 + Math.random() * 4 : 20 + Math.random() * 20;
    const si = B.seg.i - 2, cam = S.camera.position;
    if (free > 0 && si >= 0 && Math.hypot(node(si) - cam.x, B.road - cam.z) > 110) {
      const c = city.cars.find(o => !o.lot && !(o.wreck > 0) && !o.turn && !o.blueGo && o.len < 5.6 && !o.rush && !o.reckless
        && Math.hypot(o.x - cam.x, o.z - cam.z) > 160);
      if (c) { Object.assign(c, { i: si, j: B.seg.j, d: B.seg.d, s: 4, turn: null, speed: 8, blueGo: true, lotAsk: false }); placeOnSegment(c); }
    }
  }
}


// ---------- Unfälle und Stau ----------
// Ab und zu baut ein Auto einen Unfall: Auffahrunfall (fährt dem Vordermann hinten rein) oder ein Raser fährt über Rot
// und kracht in die Kreuzung. Die Unfallautos stehen schräg mit Warnblinker und Rauch, dahinter staut es sich.
// Nach einer Weile werden sie abgeschleppt (verschwinden und fahren woanders wieder los).
const WRECK_TIME = 45;
let hazardMat = null, triGeo = null;
function wreck(c, yaw) {
  if (c.wreck > 0) return;
  c.wreck = WRECK_TIME; c.wreckYaw = yaw; c.speed = 0; c.rush = false; c.reckless = false;
  if (!hazardMat) { hazardMat = new THREE.MeshStandardMaterial({ color: 0x7a4a00, emissive: 0xff9a1a, emissiveIntensity: 0 }); triGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 3).rotateX(-Math.PI / 2); } // Dreieck mit Spitze oben
  const hl = c.len / 2 - 0.2, g = new THREE.Group(); // Warnblinker an allen vier Ecken
  for (const x of [-hl, hl]) for (const z of [-0.75, 0.75]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hazardMat); b.position.set(x, 0.75, z); g.add(b); }
  c.mesh.add(g); c.hazard = g;
  const tri = new THREE.Mesh(triGeo, new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x7f1d1d })); // Warndreieck dahinter
  const fx = Math.cos(c.h), fz = Math.sin(c.h);
  tri.position.set(c.x - fx * (c.len / 2 + 7), 0.22, c.z - fz * (c.len / 2 + 7)); tri.rotation.y = Math.atan2(fx, fz); // schaut den Autos entgegen
  S.scene.add(tri); c.tri = tri;
}
function clearWreck(c) {
  if (c.hazard) c.mesh.remove(c.hazard);
  if (c.tri) S.scene.remove(c.tri);
  c.hazard = c.tri = null; c.wreck = 0; c.wreckYaw = 0;
  // abgeschleppt: woanders weit weg wieder einsetzen
  for (let tries = 0; tries < 40; tries++) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1)), d = Math.floor(Math.random() * 4);
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1]) || isClosed(i, j, d)) continue;
    Object.assign(c, { i, j, d, s: 10 + Math.random() * (BLOCK - 26), turn: null, speed: 4 });
    placeOnSegment(c);
    if (Math.hypot(c.x - city.me.pos.x, c.z - city.me.pos.z) > 150) break;
  }
}
function crashNear(x, z, text) { // Knall und Meldung, wenn es in der Nähe passiert
  const d = Math.hypot(x - city.me.pos.x, z - city.me.pos.z);
  if (d < 220) crash(0.15 + 0.6 * (1 - d / 220), 'car');
  if (d < 260 && !city.mission) showMsg(text, 2.2);
}
function stepAccidents(dt) {
  if (hazardMat) hazardMat.emissiveIntensity = Math.floor(city.t * 2.5) % 2 ? 2.5 : 0;
  for (const c of city.cars) {
    if (c.wreck > 0) {
      if (Math.random() < dt * 3) S.fx.puff(c.x + (Math.random() - 0.5), 1, c.z + (Math.random() - 0.5), 0, 0); // Rauch
      if ((c.wreck -= dt) <= 0) clearWreck(c);
    }
  }
  // Raser auf Kollisionskurs: kracht, wenn er ein anderes Auto berührt
  for (const c of city.cars) {
    if (!(c.rush || c.reckless) || c.wreck > 0 || c.lot) continue;
    for (const o of city.cars) {
      if (o === c || o.wreck > 0 || o.lot) continue;
      if (Math.hypot(o.x - c.x, o.z - c.z) < (c.len + o.len) * 0.32) {
        wreck(c, (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.3));
        wreck(o, (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.3));
        crashNear(c.x, c.z, '💥 Unfall! Da vorne gibt es Stau.');
        break;
      }
    }
  }
  if ((city.accT -= dt) > 0) return;
  city.accT = 50 + Math.random() * 70;
  const me = city.me, near = c => { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); return d > 50 && d < 260; };
  if (city.cars.filter(c => c.wreck > 0).length >= 4) return; // nicht zu viele auf einmal
  if (Math.random() < 0.6) { // Auffahrunfall: Auto mit Vordermann auf derselben Spur
    for (const c of city.cars) {
      if (c.turn || c.wreck > 0 || c.lot || !near(c)) continue;
      const lead = city.cars.find(o => o !== c && !o.turn && !(o.wreck > 0) && !o.lot && o.i === c.i && o.j === c.j && o.d === c.d && o.s > c.s && o.s - c.s < 30);
      if (lead) { c.rush = true; return; }
    }
  }
  const c = city.cars.find(o => !o.turn && !(o.wreck > 0) && !o.lot && near(o)); // Raser: fährt über Rot
  if (c) c.reckless = true;
}

// ---------- Selber fahren ----------
const GRIP = 12, BRAKE = 20;
// Von der Polizei angehalten: das Auto lenkt selber an den rechten Strassenrand und bremst bis zum Stillstand
// (nur „Bremse“ drücken hiesse nach dem Anhalten rückwärts fahren – dann fuhr man rückwärts durch die ganze Stadt)
function pullOver(me, dt) {
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const gi = Math.round(me.pos.x / BLOCK + N / 2), gj = Math.round(me.pos.z / BLOCK + N / 2);
  const offX = Math.abs(me.pos.z - node(gj)), offZ = Math.abs(me.pos.x - node(gi));
  // Strasse entlang x (man ist nahe an einer z-Linie) oder entlang z; Fahrtrichtung auf der Strasse
  const alongX = offX < ROAD / 2 + 2 && (offZ >= ROAD / 2 + 2 || Math.abs(fx) > Math.abs(fz));
  const ax = alongX ? Math.sign(fx) || 1 : 0, az = alongX ? 0 : Math.sign(fz) || 1;
  const edge = ROAD / 2 - 1.6; // Abstand der Fahrzeugmitte von der Strassenmitte am rechten Rand
  const tx = (alongX ? me.pos.x : node(gi)) + ax * 8 - az * edge, tz = (alongX ? node(gj) : me.pos.z) + az * 8 + ax * edge;
  let diff = Math.atan2(tz - me.pos.z, tx - me.pos.x) - me.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const atEdge = Math.abs((alongX ? me.pos.z - node(gj) : me.pos.x - node(gi)) - (alongX ? ax : -az) * edge) < 1;
  // bis auf Schritttempo bremsen und so an den Rand rollen (höchstens 4 s), dort anhalten; nie rückwärts
  me.pullT = (me.pullT || 0) + dt;
  if (me.speed < 0) me.speed = Math.min(0, me.speed + 10 * dt);
  else if (atEdge || me.pullT > 4) me.speed = Math.max(0, me.speed - 9 * dt);
  else me.speed = me.speed > 3.5 ? Math.max(3.5, me.speed - 7 * dt) : Math.min(3.5, me.speed + 4 * dt);
  if (me.speed < 0.4 && (atEdge || me.pullT > 4)) me.speed = 0;
  return { left: diff < -0.05, right: diff > 0.05 };
}

// ---------- Lichter am eigenen Auto: Scheinwerfer, Rücklichter, Bremslicht, Blinker, Warnblinker ----------
// Leuchtpunkte an den richtigen Stellen (aus dem Umriss des Autos), die Lichtkegel kommen aus den Scheinwerfern.
function setBlink(kind) {
  if (!city) return;
  city.blink = city.blink === kind ? null : kind;
  city.blinkH0 = city.me.heading; city.blinkTurned = false;
  for (const b of S.ui.root.querySelectorAll('.blinkers button')) b.classList.toggle('on', b.dataset.b === city.blink);
}
function stepCarLights(n, night) {
  const me = city.me, m = me.mesh, hide = !m || city.boat || city.plane;
  if (city.lamps && city.lamps.mesh !== m) { removeLamps(city.lamps); city.lamps = null; }
  if (!hide && !city.lamps) { city.lamps = makeLamps(m); m.add(city.lamps.g); }
  const L = city.lamps, driving = !city.walk && !hide;
  // Blinker geht nach dem Abbiegen von selbst aus (wie im echten Auto)
  if (city.blink === 'left' || city.blink === 'right') {
    let d = me.heading - city.blinkH0; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 1.1) city.blinkTurned = true;
    if (city.blinkTurned && Math.abs(me.steer || 0) < 0.04) setBlink(city.blink);
  }
  const phase = Math.floor(performance.now() / 380) % 2 === 0;
  if (city.blink && phase !== city.blinkPhase && driving) window.beep && window.beep(phase ? 1500 : 1000, 0.018, 'square', 0.025); // tick … tack
  city.blinkPhase = phase;
  const braking = driving && !!city.input.brake; // Bremspedal (auch im Stand)
  if (L) {
    setLamps(L, { night, braking, blink: city.blink, phase, driving });
  }
  // Lichtkegel aus den Scheinwerfern (Weltlage aus Position und Richtung: so wie das Bild es verbiegt, wird auch das Licht verschoben)
  const h = me.heading, ch = Math.cos(h), sh = Math.sin(h), y0 = me.alt + (city.gy || 0);
  const wx = (lx, lz) => me.pos.x + lx * ch - lz * sh, wz = (lx, lz) => me.pos.z + lx * sh + lz * ch;
  const heads = [n.headlight, n.headlight2].filter(Boolean), hp = L ? L.headPos : [new THREE.Vector3(1.5, 1.1, 0)];
  heads.forEach((sl, i) => {
    const p = hp[Math.min(i, hp.length - 1)], pz = heads.length === 1 ? 0 : p.z;
    sl.intensity = driving ? (heads.length === 1 ? 90 : 55) * night : 0;
    sl.position.set(wx(p.x, pz), y0 + p.y, wz(p.x, pz));
    sl.target.position.set(wx(p.x + 25, pz * 1.6), y0, wz(p.x + 25, pz * 1.6));
  });
  if (n.tailGlow) {
    n.tailGlow.intensity = driving ? night * (0.35 + (braking ? 1.1 : 0)) : 0; // nur ein Hauch Rot auf der Strasse: die Lampen selbst sollen leuchten
    if (L) n.tailGlow.position.set(wx(L.tailX, 0), y0 + L.tailY, wz(L.tailX, 0));
  }
}

function stepMe(dt) {
  const stopped = city.pulled > 0 || city.ticket || (city.police && city.police.state === 'stop');
  if (!stopped) city.me.pullT = 0;
  if (stopped && city.me.fly) city.me.landing = true; // die Polizei holt dich herunter
  const me = city.me, input = stopped ? pullOver(me, dt) : city.input; // von der Polizei angehalten: rechts ranfahren
  const cr = city.cruise && city.cruise.on && input === city.input; // Tempomat: fährt selber (ausser beim Bremsen)
  // Driften: Bremse + Lenken bei Tempo (oder Leertaste als Handbremse); dann bremst die Bremse nicht voll, das Heck bricht aus
  const brakeDrift = !!input.brake && (input.left || input.right) && me.speed > 10 && !stopped && !me.fly;
  const brake = input.brake && !brakeDrift, gas = input.gas || (cr && !brake), hand = (!!input.drift || brakeDrift) && !stopped && !me.fly;
  const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  me.steer += (steerTarget - me.steer) * Math.min(1, dt * 7);
  me.surface = me.fly ? 'asphalt' : surfaceAt(me.pos.x, me.pos.z);
  const boost = city.turbo > 0 ? 1.3 : 1; // Turbo-Benzin von der Tankstelle
  const offroad = ['tractor', 'offroad', 'jeep', 'monster', 'rally'].includes(me.v.kind); // im Matsch und Sand besser
  const SURF = { grass: 0.55, sand: offroad ? 0.8 : 0.5, mud: offroad ? 0.75 : 0.32, gravel: 0.85, snow: 0.8, water: 1, moon: offroad ? 0.9 : 0.75 };
  let maxV = (me.fly ? me.maxV * FLY_SPEED : me.maxV * (SURF[me.surface] || 1)) * boost;
  if (city.boat && !city.walk) maxV = Math.min(maxV, 22); // Boot: bis 80 km/h
  if (city.cruise && city.cruise.on) maxV = Math.min(maxV, city.cruise.kmh / 3.6); // Tempomat: nie schneller
  if (me.surface === 'mud' && Math.abs(me.speed) > 2 && Math.random() < dt * 25) S.fx.puff(me.pos.x + (Math.random() - 0.5) * 2, 0.6, me.pos.z + (Math.random() - 0.5) * 2, 0, 0); // Matsch spritzt
  if (city.boat && Math.abs(me.speed) > 3 && Math.random() < dt * 20) { const bx = Math.cos(me.heading), bz = Math.sin(me.heading); S.fx.puff(me.pos.x - bx * 3, BOAT_Y - 2.4, me.pos.z - bz * 3, 0, 0); } // Gischt
  if (city.damage > 0.5) maxV *= 1 - 0.8 * (city.damage - 0.5); // kaputter Motor: bis 40 % langsamer
  if (needsFuel(me.v.kind) && !city.boat) { // Tank: reicht für etwa 7 km; leer = nur noch Schritttempo bis zur Tankstelle
    city.fuel = Math.max(0, city.fuel - Math.abs(me.speed) * dt / 7000 * (gas ? 1 : 0.4));
    if (city.fuel <= 0) { maxV = Math.min(maxV, 4.5); if (!city.emptyMsg) { city.emptyMsg = true; showMsg(isElectric(me.v.kind) ? '🔋 Akku leer! Fahr langsam zur Ladesäule' : '⛽ Tank leer! Fahr langsam zur Tankstelle', 2.6); } }
    else city.emptyMsg = false;
  }
  if (gas) {
    if (me.speed < -0.5) me.speed = Math.min(0, me.speed + BRAKE * dt); // rückwärts: erst bremsen
    else me.speed = Math.max(0, me.speed) + me.acc * boost * Math.max(0, 1 - (me.speed / maxV) ** (me.maxV > 60 ? 3 : 1)) * dt; // LIONEL X zieht bis fast oben durch
  } else if (!brake) me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 2.5 * dt);
  if (brake) me.speed = me.speed > 0 ? Math.max(0, me.speed - BRAKE * dt) : Math.max(-8, me.speed - 6 * dt);
  if (me.speed > maxV) me.speed = Math.max(maxV, me.speed - 12 * dt);
  if (hand) me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 3.5 * dt); // blockierte Hinterräder bremsen etwas
  // Drehen: mit Handbremse oder im Drift dreht das Auto viel stärker (das Heck bricht aus)
  // Drift-Modus: beginnt mit der Handbremse (oder starkem Rutschen) und hält, solange das Auto quer rutscht
  if ((hand && Math.abs(me.speed) > 8) || Math.abs(me.vl) > 3.5) me.driftMode = true;
  else if (Math.abs(me.vl) < 1.2 || Math.abs(me.speed) < 5) me.driftMode = false;
  const sliding = me.driftMode;
  const total = Math.hypot(me.speed, me.vl); // Tempo in alle Richtungen (auch seitwärts)
  const gb = city.gripBoost * (0.6 + 0.4 * city.wGrip); // Reifen-Haftung (Fahrzeug und Wetter)
  let yawMax = hand || sliding ? Math.min(1.9, 30 / Math.max(total, 0.1)) : Math.min(1.6 * gb, GRIP * gb / Math.max(Math.abs(me.speed), 0.1));
  if (me.maxV > 60) yawMax = Math.max(yawMax, 0.85); // LIONEL X lenkt auch bei 300 noch gut
  const turn = Math.abs(me.speed) > 0.3 ? me.steer * yawMax * dt * Math.sign(me.speed) : 0;
  me.heading += turn;
  // Die Bewegung bleibt in der alten Richtung (Trägheit): vorwärts (speed) und seitwärts (vl) neu aufteilen
  const c = Math.cos(turn), s = Math.sin(turn), vf = me.speed * c + me.vl * s;
  me.vl = -me.speed * s + me.vl * c;
  me.speed = vf;
  // Reifen greifen: seitliches Rutschen wird abgebaut – normal schnell, im Drift mit Gas langsam, mit Handbremse kaum
  const SURF_GRIP = { grass: 4, sand: 3.5, mud: 2.5, gravel: 6, snow: 3, water: 1.6, moon: 3.5 };
  const grip = (hand ? 0.8 : sliding ? (gas ? 1.3 : 2.4) : SURF_GRIP[me.surface] || 9) * city.wGrip; // Regen und Schnee: rutschiger
  me.vl *= Math.exp(-grip * dt);
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  { const vx = fx * me.speed - fz * me.vl, vz = fz * me.speed + fx * me.vl, k = 1 / warpStretch(me.pos.x, me.pos.z, vx, vz); // im Bild gleich schnell
    me.pos.x += vx * dt * k; me.pos.z += vz * dt * k; }
  me.drifting = Math.abs(me.vl) > 2.5 && Math.abs(me.speed) > 5;
  const latA = Math.abs(me.steer) * yawMax * Math.abs(me.speed);
  me.slip = 0.7 * Math.min(1, Math.max(0, (latA - 10.8 * gb) / 1.2)) * Math.min(1, Math.max(0, (Math.abs(me.speed) - 16) / 8));
  if (brake && me.speed > 6) me.slip = Math.max(me.slip, 0.45 + 0.55 * Math.min(1, me.speed / 40));
  if (me.drifting) me.slip = Math.max(me.slip, Math.min(1, Math.abs(me.vl) / 7));
  if (me.fly) me.slip = 0;

  // Häuser, Bäume und der Brunnen sind fest (wer höher fliegt, kommt darüber hinweg). Das Auto ist so lang und breit
  // wie es aussieht: drei Kreise entlang des Autos (vorne, Mitte, hinten) statt eines grossen Kreises, der seitlich
  // weit übers Auto hinausragte. ks gleicht aus, dass die Stadt im Bild leicht verbogen ist.
  const ks = 1 / warpScale(me.pos.x, me.pos.z), CC = carCircles(me.pos.x, me.pos.z, me.heading, me.len, ks), rc = CC.r;
  let hit = 0, floor = 0;
  const push = (k, dx, dz, pen) => { const d = Math.hypot(dx, dz); if (d > 0.001) { me.pos.x += dx / d * pen; me.pos.z += dz / d * pen; CC.move(dx / d * pen, dz / d * pen); } };
  for (const b of S.solid) {
    if (b.x0 > me.pos.x + 12 || b.x1 < me.pos.x - 12 || b.z0 > me.pos.z + 12 || b.z1 < me.pos.z - 12) continue;
    for (let k = 0; k < 3; k++) {
      const [cx, cz] = CC.p[k], qx = Math.max(b.x0, Math.min(cx, b.x1)), qz = Math.max(b.z0, Math.min(cz, b.z1)), dx = cx - qx, dz = cz - qz, dd = Math.hypot(dx, dz);
      if (dd >= rc) continue;
      if (me.alt > b.h - 0.4) { floor = Math.max(floor, b.h + 0.5); break; }
      if (dd > 0.001) push(k, dx, dz, rc - dd); else push(k, -Math.cos(me.heading), -Math.sin(me.heading), rc);
      hit = Math.max(hit, Math.abs(me.speed)); city.hitAt = [qx, qz];
      if (b.lot && Math.abs(me.speed) > 0.8) city.touchLot = true; // beim Einparken ein Auto angefahren
    }
  }
  for (const o of S.round) {
    if (Math.abs(o.x - me.pos.x) > 14 || Math.abs(o.z - me.pos.z) > 14) continue;
    for (let k = 0; k < 3; k++) {
      const [cx, cz] = CC.p[k], dx = cx - o.x, dz = cz - o.z, dd = Math.hypot(dx, dz), min = rc + o.r * ks;
      if (dd >= min) continue;
      if (me.alt > (o.h || 6) - 0.4) { floor = Math.max(floor, (o.h || 6) + 0.5); break; }
      if (dd > 0.001) { push(k, dx, dz, min - dd); hit = Math.max(hit, Math.abs(me.speed)); city.hitAt = [o.x, o.z]; }
    }
  }
  // Mit Autos zusammenstossen: du wirst weggeschoben, das andere Auto bleibt kurz stehen (beide Autos als drei Kreise)
  for (const c of city.cars) {
    if (c.off || Math.abs(c.x - me.pos.x) > 14 || Math.abs(c.z - me.pos.z) > 14) continue;
    const O = carCircles(c.x, c.z, c.h, c.len || 4.5, ks);
    let best = null;
    for (const a of CC.p) for (const b of O.p) { const dx = a[0] - b[0], dz = a[1] - b[1], dd = Math.hypot(dx, dz), min = rc + O.r; if (dd < min && dd > 0.001 && (!best || min - dd > best[2])) best = [dx, dz, min - dd]; }
    if (best && me.alt < 2.5) {
      push(0, best[0], best[1], best[2]);
      const rel = Math.abs(me.speed - c.speed);
      if (rel > 2 && city.crashT <= 0) { crash(0.15 + rel / 18, 'car'); hurt(rel / 18, c.x, c.z); city.crashT = 0.5; c.blocked = 2; c.honkT = 0.4; c.waitMe = 2; }
      me.speed *= 0.6; me.vl *= 0.5;
    }
  }
  // Menschen sind fest: das Auto fährt nicht durch sie hindurch (Fussgänger, bestohlene Fahrer, Polizist zu Fuss)
  if (me.alt < 1.5) for (const p of people()) {
    if (Math.abs(p.x - me.pos.x) > 8 || Math.abs(p.z - me.pos.z) > 8) continue;
    for (let k = 0; k < 3; k++) {
      const [cx, cz] = CC.p[k], dx = cx - p.x, dz = cz - p.z, dd = Math.hypot(dx, dz), min = rc + 0.42 * ks;
      if (dd >= min) continue;
      if (Math.abs(me.speed) > 1.5 && p.down !== undefined && !(p.down > 0)) p.hitByMe = true; // angefahren: fällt um (stepPeds)
      push(k, dd > 0.001 ? dx : -Math.cos(me.heading), dd > 0.001 ? dz : -Math.sin(me.heading), min - dd);
      me.speed *= 0.5; me.vl *= 0.5;
    }
  }
  if (hit > 3) {
    if (city.crashT <= 0) { crash(hit / 25, 'car'); hurt(hit / 25, ...(city.hitAt || [])); city.crashT = 0.5; }
    me.speed *= -0.15; // abprallen
    me.vl *= 0.2;
    if (city.drift > 0) bankDrift(true);
  }
  city.crashT -= dt;
  if (me.fly) {
    me.alt = flyStep(me, input, dt, me.alt, floor, FLY_MAX);
    if (me.landing && me.alt <= 0.03) { me.fly = me.landing = false; me.alt = 0; showMsg('🛬 Gelandet', 1.2); }
  }
  if (S.places.park && !me.fly && parkBlocked(me.pos.x, me.pos.z)) { // Parkhaus: Deck-Kante, Rampenseite, parkiertes Auto
    me.pos.x = city.okPos.x; me.pos.z = city.okPos.z;
    if (Math.abs(me.speed) > 8 && city.crashT <= 0) { crash(0.3, 'car'); city.crashT = 0.5; }
    me.speed *= -0.2; me.vl = 0;
  }
  // Am Stadtrand ist Schluss – ausser auf der Autobahn (dort halten die Leitplanken einen auf der Fahrbahn)
  const slide = allowedAt(me.pos.x, me.pos.z, me.radius) ? null : slideInside(me.pos.x, me.pos.z, me.radius, city.keys.size);
  if (slide && allowedAt(slide.x, slide.z, me.radius)) { // an der Leitplanke entlang schrammen
    me.pos.x = slide.x; me.pos.z = slide.z;
    me.speed *= 1 - 0.6 * dt; me.vl *= 0.3;
    if (Math.abs(me.speed) > 12 && city.crashT <= 0) { crash(0.2, 'tyres'); hurt(0.1); city.crashT = 0.8; }
    city.okPos = { x: me.pos.x, z: me.pos.z };
  } else if (!allowedAt(me.pos.x, me.pos.z, me.radius)) {
    const fast = Math.abs(me.speed) > 8;
    me.pos.x = city.okPos.x; me.pos.z = city.okPos.z;
    if (fast && city.crashT <= 0) { crash(Math.min(1, Math.abs(me.speed) / 30), 'car'); hurt(Math.abs(me.speed) / 40); city.crashT = 0.5; }
    me.speed *= fast ? -0.25 : 0.3; me.vl *= 0.2;
    const lg = lockedGate(me.pos.x, me.pos.z, city.keys.size);
    if (lg && city.msgT <= 0) showMsg('🔒 ' + lg.name + ' öffnet ab ' + lg.need + ' goldenen Schlüsseln (du hast ' + city.keys.size + ')', 2.4);
    else if (city.msgT <= 0 && city.moonOn) showMsg('⛰️ Die Mondberge sind zu steil', 1.4);
    else if (city.msgT <= 0 && !city.boat) { // sagen, warum es nicht weitergeht
      const fx = Math.cos(me.heading) * 3, fz = Math.sin(me.heading) * 3, why = offroadWhy(me.pos.x + fx, me.pos.z + fz, me.radius, city.keys.size);
      if (why === 'water') showMsg('🌊 Da ist Wasser – das Boot wartet am Steg beim Strand', 1.8);
      else if (why === 'world') showMsg('🌍 Hier ist die Welt zu Ende', 1.5);
      else if (why.startsWith('locked')) { const [, name, need] = why.split(':'); showMsg('🔒 ' + name + ' öffnet ab ' + need + ' goldenen Schlüsseln (du hast ' + city.keys.size + ')', 2.2); }
    }
  } else city.okPos = { x: me.pos.x, z: me.pos.z };
  // Über eine rote Ampel gefahren?
  const ni = Math.round(me.pos.x / BLOCK + N / 2), nj = Math.round(me.pos.z / BLOCK + N / 2);
  const inX = inGrid(ni, nj) && Math.abs(me.pos.x - node(ni)) < ROAD / 2 && Math.abs(me.pos.z - node(nj)) < ROAD / 2;
  if (inX && !city.inCross && hasLights(ni, nj) && Math.abs(me.speed) > 5 && me.alt < 2.5) {
    const ax = Math.abs(Math.cos(me.heading)) > Math.abs(Math.sin(me.heading)) ? 'x' : 'z';
    if (lightState(ax, city.t) === 'red') failSchool('Über Rot gefahren 🚦');
    if (lightState(ax, city.t) === 'red' && !POLICE_KINDS.includes(me.v.kind)) { // Polizei darf (im Einsatz)
      const d = ((Math.round(me.heading / (Math.PI / 2)) % 4) + 4) % 4, cam = S.redCams.get(ni + ',' + nj + ',' + d);
      if (cam) blitz(cam, 'red', '📸 Geblitzt! Über Rot gefahren', 'Über Rot gefahren 🚦');
      else showMsg('🚦 Rot! Zum Glück kein Blitzer 😅', 1.6);
    }
  }
  city.inCross = inX;
  // Am Berg: Boden unter dem Auto, Neigung vorne/hinten, bergab rollt es schneller
  if (S.places.park && !me.fly) parkStep(me.pos.x, me.pos.z);
  city.gy = city.boat && !city.walk ? BOAT_Y + Math.sin(city.t * 1.6) * 0.08 : groundAt(me.pos.x, me.pos.z);
  if (city.moonOn && !me.fly) { // Mond: wenig Schwerkraft – über Kraterränder fliegt man weit
    const g = city.gy, Gc = MOON_G * 1.6;
    if (me.mY === undefined || Math.abs(me.mY - g) > 30) { me.mY = g; me.mVy = 0; me.mAir = false; }
    if (me.mAir) {
      me.mVy -= Gc * dt; me.mY += me.mVy * dt;
      if (me.mY <= g) { if (me.mVy < -8 && city.crashT <= 0) { crash(0.25, 'car'); city.crashT = 0.5; } me.mY = g; me.mVy = 0; me.mAir = false; }
    } else {
      const expect = me.mY + me.mVy * dt - 0.5 * Gc * dt * dt;
      if (g < expect - 0.03 && Math.abs(me.speed) > 3) { me.mAir = true; me.mY = expect; me.mVy -= Gc * dt; if (city.msgT <= 0) showMsg('🌙 Hui – auf dem Mond fliegt man weit!', 1.2); }
      else { me.mVy = Math.max(-25, Math.min(25, (g - me.mY) / Math.max(dt, 1e-3))); me.mY = g; }
    }
    city.gy = me.mY;
  } else me.mAir = false;
  let slope = 0;
  if (!city.boat && (city.gy || Math.abs(me.pos.z) > LIMIT || Math.abs(me.pos.x) > LIMIT)) {
    const hx = Math.cos(me.heading) * me.len * 0.4, hz = Math.sin(me.heading) * me.len * 0.4;
    slope = (groundAt(me.pos.x + hx, me.pos.z + hz) - groundAt(me.pos.x - hx, me.pos.z - hz)) / (me.len * 0.8 || 1);
    if (!me.fly && !me.mAir) me.speed -= (city.moonOn ? MOON_G : 9.81) * slope * 0.7 * dt;
  }
  const m = me.mesh;
  m.position.set(me.pos.x, me.alt + city.gy, me.pos.z);
  m.rotation.set(me.fly ? me.flyRoll : 0, -me.heading, me.fly ? me.flyPitch : Math.atan(slope));
  for (const w of m.userData.wheels) {
    w.rotation.z -= me.speed * dt / 0.35;
    if (w.position.x > 0) w.rotation.y = -me.steer * 0.4;
  }
  animateCar(m, city.t, me.v.special, me.fly);
}

// Autobahn-Verkehr (outskirts.js): du bist dort ein Hindernis, Drängler hupen, Zusammenstösse schieben dich weg
const hwMe = {}; // wird jedes Bild neu befüllt (kein neues Objekt pro Bild)
const hwHooks = {
  honk: c => horn(Math.max(0.15, 1 - Math.hypot(c.x - city.me.pos.x, c.z - city.me.pos.z) / 60), 0.4, 1.1),
  msg: (text, now) => { if (now || city.hwMsgT <= 0) { showMsg(text, 1.8); city.hwMsgT = 10; } },
  // knapp überholt: Kette (innert 5 s) gibt mehr; online keine Münzen
  nearMiss: () => {
    city.nmN = city.t - (city.nmT || -99) < 5 ? (city.nmN || 0) + 1 : 1; city.nmT = city.t;
    const coins = city.net ? 0 : Math.min(3, Math.ceil(city.nmN / 2));
    if (coins) city.earn(coins);
    showMsg('😎 Knapp vorbei!' + (city.nmN > 1 ? ' ×' + city.nmN : '') + (coins ? '  +' + coins + ' 🪙' : ''), 1.2);
  },
  // Rettungsgasse: blockiert = Strafzettel (50), gut gemacht = Lob und 10 Münzen (online ohne Münzen)
  gasse: kind => {
    if (kind === 'ok') { const c = city.net ? 0 : 10; if (c) city.earn(c); showMsg('👍 Super Rettungsgasse!' + (c ? '  +' + c + ' 🪙' : ''), 2.2); city.hwMsgT = 4; return; }
    if (city.ticket || city.police) return;
    city.reason = { kind: 'gasse', text: '🚑 Rettungsgasse blockiert' };
    giveTicket();
  },
  siren: v => { // Sirene der Autobahnpolizei (erst gebaut, wenn sie zum ersten Mal unterwegs ist)
    if (v > 0 && city.hwSiren === undefined) city.hwSiren = createSiren();
    if (city.hwSiren) city.hwSiren.set(v);
  },
  bump: (c, hb) => { // hb: Richtung und Tiefe aus hitBox (outskirts.js)
    const me = city.me;
    me.pos.x += hb.nx * hb.depth; me.pos.z += hb.nz * hb.depth;
    if (city.crashT <= 0) { const rel = Math.abs(me.speed - c.speed); crash(0.2 + rel / 25, 'car'); hurt(rel / 20, c.x, c.z); city.crashT = 0.6; }
    me.speed *= 0.7;
  },
};
function stepHw(dt) {
  const me = city.me;
  city.hwMsgT -= dt;
  Object.assign(hwMe, { x: me.pos.x, z: me.pos.z, heading: me.heading, speed: me.speed, len: me.len, radius: me.radius, see: city.see * 1.7,
    on: !city.walk && me.alt < 2 && onHighway(me.pos.x, me.pos.z) });
  stepHighway(city.hw, dt, city.t, hwMe, S.camera.position, hwHooks);
}
// Wo man fahren (und gehen) darf: in der Stadt bis zum Waldrand, draussen nur auf der Autobahn
// (dazu überall auf dem Gelände, siehe offroadWhy in outskirts.js: nicht ins Wasser, nicht über Leitplanken, nicht in gesperrte Gebiete)
const allowedAt = (x, z, r) => {
  if (inMoon(x, z)) return moonAllowed(x, z, r); // auf dem Mond
  if (city.boat && !city.walk) return inWater(x, z, r);
  if (onDeck(x, z)) return true; // auf der Fähre
  const keys = city.keys ? city.keys.size : 0;
  if ((Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT) || (inMonaco(x, z) && monRoad(x, z)) || hwDrivable(x, z, r) || countryDrivable(x, z, r) || areaDrivable(x, z, r, keys) || passDrivable(x, z, r, keys)) return true;
  return !offroadWhy(x, z, r, keys) && !countryBlocked(x, z, r);
};
// Bodenhöhe unter einem Punkt: in der Stadt 0, auf der Passstrasse ihre Höhe, am Berg das feine Gelände, sonst genau
// wie das Gelände-Netz (20-m-Dreiecke, sonst schwebt man oder versinkt zwischen den Ecken)
const groundMemo = new Map();
function landAt(i, j) { const k = i * 100000 + j; let h = groundMemo.get(k); if (h === undefined) { h = S.height(-1100 + i * 20, -1100 + j * 20); groundMemo.set(k, h); } return h; }
function landRaw(x, z) { // Gelände-Netz genau wie groundAt, aber auch unter 0 (Senken am Wasser)
  const gx = (x + 1100) / 20, gz = (z + 1100) / 20, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const a = landAt(i, j), b = landAt(i, j + 1), c = landAt(i + 1, j + 1), d = landAt(i + 1, j);
  return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}
function groundAt(x, z) {
  if (inMoon(x, z)) return moonGround(x, z);
  if (onDeck(x, z)) return FERRY_Y; // Autodeck der Fähre
  if (inMonaco(x, z)) return monGround(x, z); // Diamantinsel
  if (pkIn(x, z)) return parkY(x, z);
  const pg = passGround(x, z);
  if (pg) return pg;
  if (Math.abs(x) <= HALF + 20 && Math.abs(z) <= HALF + 20) return 0;
  if (inPassRegion(x, z)) return Math.max(0, S.country.ground(x, z)); // auch knapp am Stadtrand: dort liegt schon das Pass-Gelände
  if (Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT) return 0;
  if (onHighway(x, z)) return hwGround(x, z); // auf der Brücke oben
  if (onRoads(x, z) || inArea(x, z) || inCountry(x, z) || inSuburb(x, z) || inService(x, z)) return 0;
  const gx = (x + 1100) / 20, gz = (z + 1100) / 20, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const a = landAt(i, j), b = landAt(i, j + 1), c = landAt(i + 1, j + 1), d = landAt(i + 1, j);
  return Math.max(0, fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz));
}

// ---------- Reifenrauch und Bremsspuren ----------
// Rauch, Spuren und Drift-Punkte nach jedem Schritt
function stepDrift(dt) {
  const me = city.me, fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const skid = !me.fly && (me.drifting || (city.input.brake && me.speed > 10) || (city.input.drift && Math.abs(me.speed) > 6));
  const onRoad = surfaceAt(me.pos.x, me.pos.z) === 'asphalt';
  const ni = node(Math.round(me.pos.x / BLOCK + N / 2)), nj = node(Math.round(me.pos.z / BLOCK + N / 2));
  const inCity = Math.abs(me.pos.x) < HALF + ROAD / 2 && Math.abs(me.pos.z) < HALF + ROAD / 2;
  const y = !inCity ? groundAt(me.pos.x, me.pos.z) + 0.01 : Math.abs(me.pos.x - ni) < ROAD / 2 || Math.abs(me.pos.z - nj) < ROAD / 2 ? 0.035 : 0.175;
  const back = me.len * 0.32, side = 0.8;
  for (const k of [0, 1]) {
    const sx = k ? 1 : -1, wx = me.pos.x - fx * back - fz * side * sx, wz = me.pos.z - fz * back + fx * side * sx;
    S.fx.mark(k, wx, y, wz, skid && onRoad);
    if (me.drifting && Math.random() < dt * 22) S.fx.puff(wx, y + 0.3, wz, fx * me.speed - fz * me.vl, fz * me.speed + fx * me.vl);
  }
  // Drift-Punkte: je schneller und je quer, desto mehr
  if (me.drifting) {
    city.drift += Math.abs(me.vl) * Math.abs(me.speed) * dt * 0.8;
    city.driftT = 0.7;
    S.ui.drift.hidden = false;
    S.ui.drift.textContent = '🔥 DRIFT ' + Math.round(city.drift);
  } else if (city.drift > 0 && (city.driftT -= dt) <= 0) bankDrift();
}

function bankDrift(crashed = false) {
  const pts = Math.round(city.drift);
  city.drift = 0;
  S.ui.drift.hidden = true;
  if (crashed) { if (pts > 100) showMsg('💥 Drift kaputt!', 1.4); return; }
  if (pts < 60) return;
  const coins = Math.min(5, Math.floor(pts / 1500));
  if (coins) city.earn(coins);
  let rec = '';
  if (pts > city.driftBest) { city.driftBest = pts; rec = '  🏆 Rekord!'; try { localStorage.setItem('autoRetterDriftBest', String(pts)); } catch (e) { /* egal */ } }
  showMsg('🔥 ' + pts + ' Drift-Punkte' + (coins ? '  +' + coins + ' 🪙' : '') + rec, 2.2);
}

// ---------- Tankstelle und Waschanlage ----------
const inZone = (p, x, z, pad = 0) => p && Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(z - p.z) < p.d / 2 + pad;
function stepPlaces(dt) {
  const me = city.me, P = S.places, x = me.pos.x, z = me.pos.z;
  if (city.turbo > 0) city.turbo -= dt;
  // Tankstelle: unter dem Dach anhalten = volltanken (1 Münze pro 10 %) und Turbo-Benzin (30 s schneller);
  // Elektroautos laden an der grünen Ladesäule daneben. Ohne Münzen gratis.
  const Pl = [REST_ZONES, ...P.services].find(q => inZone(q.gas, x, z, 10) || inZone(q.charge, x, z, 10)) || P; // Tankstelle in der Stadt, an der Raststätte oder eine der Stationen (service.js)
  const ev = isElectric(me.v.kind), zone = ev ? Pl.charge : Pl.gas, stopped = Math.abs(me.speed) < 1.5 && me.alt < 2 && !city.walk;
  if (stopped && !ev && inZone(Pl.charge, x, z) && city.fuelT === 0) { showMsg('⛽ Benziner tanken unter dem roten Dach', 1.6); city.fuelT = -1; }
  if (stopped && ev && inZone(Pl.gas, x, z) && city.fuelT === 0) { showMsg('⚡ Elektroauto: lade an der grünen Ladesäule', 1.6); city.fuelT = -1; }
  if (stopped && inZone(zone, x, z)) {
    if (city.fuelT >= 0) {
      if (city.fuelT === 0) { showMsg(ev ? '⚡ Laden …' : '⛽ Tanken …', 1.6); city.filled = 0; }
      city.fuelT += dt;
      const add = Math.min(1 - city.fuel, dt * 0.4);
      city.fuel += add; city.filled += add;
      if (city.fuelT > 1.5 && city.fuel >= 0.999) {
        const paid = city.pay(Math.ceil(city.filled * 10));
        city.turbo = 30; city.fuelT = -1; // erst nach dem Wegfahren wieder
        showMsg((ev ? '⚡ Voll geladen!' : '⛽ Vollgetankt!') + ' Turbo 30 s' + (paid ? '  (−' + paid + ' 🪙)' : ''), 2.6);
        window.beep && window.beep(660, 0.1, 'triangle', 0.06); window.beep && window.beep(990, 0.18, 'triangle', 0.06, 0.1);
      }
    }
  } else if (!inZone(Pl.gas, x, z, 3) && !inZone(Pl.charge, x, z, 3)) city.fuelT = 0;
  // Waschanlage: langsam durchfahren, Bürsten drehen schneller, Schaum; hinten raus = blitzblank
  const inWash = inZone(P.wash, x, z) && me.alt < 2;
  for (const b of P.wash.brushes) b.rotation.y += dt * (inWash ? 14 : 1.5);
  if (inWash) {
    if (!city.washT) showMsg('🫧 Schaum und Bürsten …', 1.6);
    city.washT = (city.washT || 0) + dt;
    if (Math.random() < dt * 30) S.fx.puff(x + (Math.random() - 0.5) * 3, 0.6 + Math.random() * 2.2, z + (Math.random() - 0.5) * 3, 0, 0);
  } else if (city.washT > 1.2) {
    showMsg('✨ Blitzblank! Dein Auto glänzt.', 2.2);
    window.beep && window.beep(1047, 0.12, 'triangle', 0.06); window.beep && window.beep(1319, 0.2, 'triangle', 0.06, 0.12);
    city.washT = 0;
  } else city.washT = 0;
}

// ---------- Schaden und Werkstatt ----------
// Jeder Zusammenstoss gibt Schaden und einen Kratzer mit Delle an der getroffenen Stelle (Aufkleber auf der Karosserie).
// Ab 50 % qualmt der Motor und das Auto wird langsamer. In der Werkstatt wird alles repariert (1 Münze pro 5 %).
let scratchMat = null;
const ray = new THREE.Raycaster();
function scratchTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 32, 4, 64, 32, 30); // Delle: dunkler Schatten in der Mitte
  r.addColorStop(0, 'rgba(0,0,0,0.6)'); r.addColorStop(0.6, 'rgba(0,0,0,0.25)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 9; k++) { // Kratzer: helle Striche (blankes Blech)
    const y = 10 + Math.random() * 44, x = 6 + Math.random() * 30;
    g.strokeStyle = k % 3 ? 'rgba(235,238,242,1)' : 'rgba(70,70,75,0.9)'; g.lineWidth = 1.5 + Math.random() * 2.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 60 + Math.random() * 30, y + (Math.random() - 0.5) * 10); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Name eines Fahrzeugs: echte Autos haben lustige Namen (vehicleName in game.js), sonst der Typ-Name
const vname = v => (typeof window.vehicleName === 'function' ? window.vehicleName(v) : ((city && city.kinds[v.kind]) || {}).name || v.kind);
const UNBREAKABLE = ['lionelx']; // geht nie kaputt (muss nie in die Werkstatt)
function hurt(intensity, fromX, fromZ) {
  if (city.mission && city.mission.type === 'school') failSchool('💥 Unfall gebaut');
  if (city.mission && city.mission.type === 'park') endMission(false, '💥 Angefahren! Einparken nicht bestanden.');
  if (UNBREAKABLE.includes(city.me.v.kind) || city.boat) return;
  city.damage = Math.min(1, city.damage + Math.min(0.075, intensity * 0.07)); // ein Viertel von früher: seltener in die Werkstatt
  const m = city.me.mesh;
  if (city.scratches.length >= 12 || fromX === undefined) return;
  if (!scratchMat) scratchMat = new THREE.MeshStandardMaterial({ map: scratchTexture(), transparent: true, depthWrite: false, roughness: 0.6,
    polygonOffset: true, polygonOffsetFactor: -4 });
  m.updateMatrixWorld(true);
  const p = m.worldToLocal(new THREE.Vector3(fromX, 0.7, fromZ)), L = m.userData.length;
  const side = Math.abs(p.z) * 1.6 > Math.abs(p.x) - L * 0.35, s = Math.sign(side ? p.z : p.x) || 1, y = 0.45 + Math.random() * 0.4;
  // seitlich: an den Türen (nicht in den Radkästen), sonst vorne oder hinten
  const o = side ? new THREE.Vector3(Math.max(-L * 0.18, Math.min(L * 0.18, p.x)), y, s * 4) : new THREE.Vector3(s * (L / 2 + 3), y, (Math.random() - 0.5) * 1.2);
  const d = side ? new THREE.Vector3(0, 0, -s) : new THREE.Vector3(-s, 0, 0);
  ray.set(o.applyMatrix4(m.matrixWorld), d.transformDirection(m.matrixWorld));
  ray.camera = S.camera; // schwebende Schilder (Sprites, z.B. „ADMIN“) brauchen die Kamera
  const model = o => o.name.startsWith('part:'); // Teil eines echten Automodells (beidseitig gezeichnet)
  const inWheel = o => { for (let q = o.parent; q && q !== m; q = q.parent) if (q.name === 'wheel') return true; return false; };
  const hit = ray.intersectObject(m, true).find(h => h.face && !h.object.isSprite && h.object.visible && !h.object.material.transparent && (!h.object.material.side || model(h.object))
    && h.object.name !== 'caliper' && !inWheel(h.object));
  if (!hit) return;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const depth = model(hit.object) ? dentAt(hit, Math.min(1, intensity), city.dented) : 0; // echte Beule ins Blech drücken
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + Math.random() * 0.4, 0.36), scratchMat);
  sc.position.copy(hit.point).addScaledVector(n, 0.03 - depth); // über den Türlinien-Aufklebern (in der Beule)
  sc.lookAt(hit.point.clone().add(n));
  sc.rotation.z += (Math.random() - 0.5) * 0.5;
  S.scene.add(sc);
  m.attach(sc); // fährt mit
  city.scratches.push(sc);
}
function dropDents() { dropCarDents(city.dented); } // Form wieder wie neu (Werkstatt, anderes Auto)
function repairAll() {
  for (const sc of city.scratches) sc.parent && sc.parent.remove(sc);
  city.scratches = []; dropDents();
  city.damage = 0;
}
function stepDamage(dt) {
  const me = city.me;
  if (city.damage > 0.5 && !city.walk && Math.random() < dt * city.damage * 10) { // Motor qualmt
    const fx = Math.cos(me.heading), fz = Math.sin(me.heading), f = me.len * 0.38;
    S.fx.puff(me.pos.x + fx * f, me.alt + 1.1, me.pos.z + fz * f, fx * me.speed * 0.5, fz * me.speed * 0.5);
  }
  // Werkstatt: in der Halle anhalten (in der Stadt oder in einer Station mit Tankstelle, service.js)
  const P = S.places.services.map(q => q.repair).find(q => inZone(q, me.pos.x, me.pos.z, 3)) || S.places.repair;
  if (inZone(P, me.pos.x, me.pos.z) && Math.abs(me.speed) < 1.5 && me.alt < 2 && !city.walk) {
    if (city.repairT >= 0) {
      if (city.damage < 0.02) { if (city.repairT === 0) showMsg('🔧 Dein Auto ist ganz – nichts zu reparieren', 1.6); city.repairT = -1; return; }
      if (city.repairT === 0) showMsg('🔧 Reparieren …', 1.8);
      city.repairT += dt;
      if (Math.random() < dt * 12) S.fx.puff(me.pos.x + (Math.random() - 0.5) * 2, 0.6 + Math.random(), me.pos.z + (Math.random() - 0.5) * 2, 0, 0);
      if (city.repairT > 2.5) {
        const paid = city.pay(Math.ceil(city.damage * 20));
        repairAll();
        city.repairT = -1;
        showMsg('🔧 Wie neu!' + (paid ? '  (−' + paid + ' 🪙)' : ''), 2.4);
        window.beep && window.beep(880, 0.1, 'triangle', 0.06); window.beep && window.beep(1175, 0.18, 'triangle', 0.06, 0.1);
      }
    }
  } else if (!inZone(P, me.pos.x, me.pos.z, 3)) city.repairT = 0;
}

// ---------- Basen ----------
// Eigene Base: bis zu 10 ausgesuchte Fahrzeuge (garage von game.js). Dort kann man das Auto wechseln, ohne die Stadt zu verlassen.
// Online stehen die Basen aller Mitspieler nebeneinander (net.bases(): Platz → Fahrzeugliste, Regeln: rooms/<CODE>/bases).
function loadBase() {
  const G = city.garage;
  const all = G ? G.all() : [], ids = G ? G.ids() : [];
  city.base = ids.map(id => all.find(v => v.id === id)).filter(Boolean);
  if (city.net) city.net.setBase(city.base);
}
const baseOwner = s => { // Name, wem die Base gehört (leer = frei)
  if (s === city.baseSlot) return city.net ? ((city.net.players() || {})[s] || {}).name || 'Du' : 'Du';
  return city.net ? ((city.net.players() || {})[s] || {}).name || '' : '';
};
function baseCars(s) {
  if (s === city.baseSlot) return city.base;
  const l = city.net && baseOwner(s) ? (city.net.bases() || {})[s] : null;
  return l ? Object.values(l).slice(0, BASE_CARS) : [];
}
// Base aufstellen oder wegräumen (mit den Mauern, an denen man sonst hängen bliebe)
function setBaseOn(B, on) {
  if (B.on === on) return;
  B.on = B.root.visible = on;
  B.lawn.visible = !on;
  for (const { w, box } of B.walls) Object.assign(w, on ? box : { x0: 1e9, x1: 1e9, z0: 1e9, z1: 1e9 });
}
function clearBay(B, b) {
  if (b.mesh) B.group.remove(b.mesh);
  b.mesh = null; b.key = '';
  Object.assign(b.solid, { x0: 1e9, x1: 1e9, z0: 1e9, z1: 1e9 });
}
function parkCar(B, b, v) {
  const m = b.mesh = buildCar({ ...v, kind: city.kinds[v.kind] ? v.kind : 'car' }, city.kinds);
  m.position.set(b.x, 0.17, b.z); m.rotation.y = b.ry;
  m.traverse(o => { o.castShadow = false; }); // spart Rechenzeit, es stehen viele Autos da
  b.anim = v.special === 'rainbow' || !!(city.kinds[v.kind] || {}).secret; // bewegt sich auch im Stehen
  B.group.add(m);
}
function stepBases(dt) {
  const me = city.me, x = me.pos.x, z = me.pos.z, players = city.net ? city.net.players() || {} : {};
  let at = -1;
  S.places.bases.forEach((B, s) => {
    if (B.on && inZone(B, x, z)) at = s;
    B.group.visible = Math.hypot(B.x - x, B.z - z) < 130;
    if (B.group.visible) for (const b of B.bays) if (b.anim && b.mesh && b.mesh.visible) animateCar(b.mesh, city.t, null);
  });
  if (at !== city.atBase) {
    city.atBase = at;
    if (at >= 0) showMsg(at === city.baseSlot ? '🏠 Deine Base' : '🏠 Base von ' + baseOwner(at), 1.6);
  }
  const mine = at === city.baseSlot && me.alt < 2 && !city.walk;
  S.ui.basebtn.hidden = !mine;
  if (!mine) S.ui.basepanel.hidden = true;
  if ((city.baseT -= dt) > 0) return;
  city.baseT = 0.1;
  let built = false; // höchstens ein Auto pro Durchgang aufbauen, sonst ruckelt es
  S.places.bases.forEach((B, s) => {
    const owner = baseOwner(s), text = owner === 'Du' ? '🏠 MEINE BASE' : '🏠 BASE VON ' + owner.toUpperCase();
    setBaseOn(B, !!owner);
    if (!owner) return;
    if (text !== B.sign) { B.sign = text; B.setSign(text); }
    if (!B.group.visible) return;
    const list = baseCars(s);
    let driven = s === city.baseSlot ? me.v : players[s]; // wer gerade damit herumfährt: das Parkfeld ist leer
    B.bays.forEach((b, i) => {
      const v = list[i], key = v ? [v.kind, v.color, v.special || '', JSON.stringify(v.tune || {})].join('|') : '';
      if (b.key !== key && !built) {
        clearBay(B, b);
        if (v) { parkCar(B, b, v); built = true; }
        b.key = key;
      }
      if (!b.mesh || !v) return;
      // eigene Base: jedes Auto kann man beliebig oft nehmen – es fehlt nur, solange dein Auto (oder ein geparktes) auf dem Platz steht
      const onBay = (x, z) => Math.hypot(x - b.x, z - b.z) < 3;
      const gone = s === city.baseSlot ? onBay(me.pos.x, me.pos.z) || city.parked.some(P => onBay(P.x, P.z))
        : !!driven && v.kind === driven.kind && v.color === driven.color && (v.special || null) === (driven.special || null);
      if (gone && s !== city.baseSlot) driven = null;
      b.mesh.visible = !gone;
      const hl = b.mesh.userData.length / 2;
      Object.assign(b.solid, gone ? { x0: 1e9, x1: 1e9, z0: 1e9, z1: 1e9 } : { x0: b.x - hl, x1: b.x + hl, z0: b.z - 1.4, z1: b.z + 1.4 });
    });
  });
}
function toggleBase() {
  if (!city || S.ui.basebtn.hidden) return;
  const p = S.ui.basepanel;
  if (p.hidden) { city.baseEdit = false; drawBase(); }
  p.hidden = !p.hidden;
}
// Liste in der Base: Auto antippen = einsteigen; „Autos wählen“: ganzer Fahrzeugpark, bis zu 10 ankreuzen
function drawBase() {
  const p = S.ui.basepanel, edit = city.baseEdit, K = city.kinds;
  const list = edit ? city.garage.all() : city.base, chosen = new Set(city.base.map(v => v.id));
  p.textContent = '';
  const h = document.createElement('h3');
  h.textContent = edit ? '✏️ Autos für die Base: ' + chosen.size + ' / ' + BASE_CARS : '🏠 Meine Base: wähl dein Auto';
  const grid = document.createElement('div'); grid.className = 'cars';
  for (const v of list) {
    const b = document.createElement('button'), dot = document.createElement('i'), name = document.createElement('span'), ps = document.createElement('small');
    b.dataset.id = v.id;
    b.classList.toggle('sel', edit ? chosen.has(v.id) : v.id === city.me.v.id);
    dot.style.background = v.color || '#888';
    name.textContent = vname(v);
    ps.textContent = '⚡ ' + v.ps;
    b.append(dot, name, ps);
    grid.append(b);
  }
  const row = document.createElement('div'); row.className = 'row';
  for (const [act, text] of edit ? [['done', '✅ Fertig']] : [['edit', '✏️ Autos wählen'], ...(city.parked.length ? [['home', '🧹 ' + city.parked.length + ' geparkte Autos zurückholen']] : []), ['close', '✕ Schliessen']]) {
    const b = document.createElement('button'); b.dataset.act = act; b.textContent = text; row.append(b);
  }
  p.append(h, grid, row);
}
let baseDragged = false; // geschoben, nicht angetippt
function onBaseClick(e) {
  const b = e.target.closest('button');
  if (!b || !city || baseDragged) return;
  const act = b.dataset.act;
  if (act === 'close') { S.ui.basepanel.hidden = true; return; }
  if (act === 'home') { const n = city.parked.length; while (city.parked.length) removeParked(city.parked[0]); showMsg('🧹 ' + n + ' Autos sind wieder in der Base', 2); drawBase(); return; }
  if (act === 'edit' || act === 'done') { city.baseEdit = act === 'edit'; drawBase(); return; }
  const v = city.garage.all().find(f => f.id === b.dataset.id);
  if (!v) return;
  if (city.baseEdit) {
    const ids = city.base.map(f => f.id), i = ids.indexOf(v.id);
    if (i >= 0) ids.splice(i, 1);
    else if (ids.length < BASE_CARS) ids.push(v.id);
    else { showMsg('Die Base hat nur ' + BASE_CARS + ' Plätze', 1.4); return; }
    city.garage.save(ids);
    loadBase();
    drawBase();
    return;
  }
  S.ui.basepanel.hidden = true;
  switchCar(v);
}
// ---------- Geparkte Autos ----------
// Nimmt man ein anderes Auto (aus der Base oder ein geparktes), bleibt das bisherige stehen, wo man ausgestiegen ist –
// so kann man beliebig viele Autos irgendwo hinstellen (auch hundert auf dem Berg). Aus der Base kann man jedes Auto
// beliebig oft nehmen. Gespeichert in autoRetterParked; Autos weit weg werden erst gebaut, wenn man in die Nähe kommt.
const PARK_KEY = 'autoRetterParked', PARK_MAX = 200, PARK_SEE = 260;
function loadParked() {
  try { return (JSON.parse(localStorage.getItem(PARK_KEY)) || []).filter(p => p && p.v && p.v.kind && isFinite(p.x) && isFinite(p.z)).map(p => ({ ...p, mesh: null, cols: [] })); }
  catch (err) { return []; }
}
function saveParked() { try { localStorage.setItem(PARK_KEY, JSON.stringify(city.parked.map(({ v, x, z, h }) => ({ v, x, z, h })))); } catch (err) { /* ohne Speicher */ } }
function parkCols(P) { // zwei Kreise entlang des Autos (es steht schräg): man stösst an
  const L = P.mesh ? P.mesh.userData.length || 4.5 : 4.5, fx = Math.cos(P.h), fz = Math.sin(P.h);
  for (const o of P.cols) { const k = S.round.indexOf(o); if (k >= 0) S.round.splice(k, 1); }
  P.cols = [-1, 1].map(s => ({ x: P.x + fx * s * L * 0.25, z: P.z + fz * s * L * 0.25, r: 1.15, h: 2 }));
  S.round.push(...P.cols);
}
function setParkMesh(P, mesh) {
  P.mesh = mesh;
  mesh.position.set(P.x, groundAt(P.x, P.z), P.z); mesh.rotation.set(0, -P.h, 0);
  if (mesh.userData.driver) mesh.userData.driver.visible = false; // niemand sitzt drin
  mesh.traverse(o => { o.castShadow = false; });
  if (!mesh.parent) S.scene.add(mesh);
}
function parkHere(mesh, v, x, z, h) {
  const P = { v: { ...v }, x, z, h, mesh: null, cols: [] };
  if (mesh) setParkMesh(P, mesh);
  parkCols(P);
  city.parked.push(P);
  while (city.parked.length > PARK_MAX) removeParked(city.parked[0]);
  saveParked();
  return P;
}
function removeParked(P) {
  if (P.mesh) S.scene.remove(P.mesh);
  for (const o of P.cols) { const k = S.round.indexOf(o); if (k >= 0) S.round.splice(k, 1); }
  const k = city.parked.indexOf(P); if (k >= 0) city.parked.splice(k, 1);
  saveParked();
}
// ---------- Fähre zur Diamantinsel und Verkehr dort ----------
// Die Fähre liegt am Frachthafen (A) oder im Jachthafen (B). Aufs Deck fahren (oder gehen) und anhalten = sie legt ab,
// man fährt mit (Gas = schneller). Wartet sie am anderen Ufer, kommt sie, sobald man am Kai steht.
function onDeck(x, z) {
  const F = city && city.ferry; if (!F) return false;
  const [lx, lz] = ferryLocal(F.pose, x, z);
  if (Math.abs(lx) >= FERRY.halfL - 1) return false;
  if (F.moving) return Math.abs(lz) < FERRY.halfW;
  // angelegt: auf der Kaiseite 7 m weiter (Rampe bis sicher aufs Land)
  const q = F.at === 'A' ? [FERRY.A.x + 10, FERRY.A.z] : [FERRY.B.x - 10, FERRY.B.z], side = Math.sign(ferryLocal(F.pose, q[0], q[1])[1]) || 1, t = lz * side;
  return t > -FERRY.halfW && t < FERRY.halfW + 7;
}
function placeRider() {
  const F = city.ferry, R = F.rider; if (!R) return;
  const [x, z] = ferryWorld(F.pose, R.lx, R.lz), h = F.pose.h + R.dh;
  if (R.walk) { const w = city.walk; if (!w) return; Object.assign(w, { x, z, h, speed: 0, gy: FERRY_Y }); w.mesh.position.set(x, FERRY_Y, z); w.mesh.rotation.y = -h; }
  else { const me = city.me; me.pos.x = x; me.pos.z = z; me.heading = h; me.speed = 0; me.vl = 0; city.gy = FERRY_Y; me.mesh.position.set(x, FERRY_Y, z); me.mesh.rotation.set(0, -h, 0); }
}
function stepFerry(dt) {
  const F = city.ferry, me = city.me, w = city.walk;
  F.pose = ferryAt(F.s);
  S.ferryMesh.position.set(F.pose.x, 0, F.pose.z); S.ferryMesh.rotation.y = -F.pose.h;
  if (F.moving) {
    const v = F.rider ? (city.input.gas || city.input.up ? 75 : 26) : 70;
    F.s += F.dir * v * dt;
    if (F.s <= 0 || F.s >= FERRY_LEN) { // angekommen
      F.s = F.dir > 0 ? FERRY_LEN : 0; F.moving = false; F.at = F.dir > 0 ? 'B' : 'A'; F.pose = ferryAt(F.s); placeRider();
      if (F.rider) showMsg(F.at === 'B' ? '⛴️ Angekommen auf der Diamantinsel! Fahr von der Fähre' : '⛴️ Zurück im Frachthafen!', 3);
      else showMsg('⛴️ Die Fähre ist da – fahr drauf und halte an', 2.4);
      F.rider = null; city.ferryRide = false; F.wait = 0; F.cool = 5;
    } else placeRider();
    return;
  }
  F.cool = Math.max(0, (F.cool || 0) - dt);
  const P = w ? { x: w.x, z: w.z, v: Math.abs(w.speed) } : { x: me.pos.x, z: me.pos.z, v: Math.abs(me.speed) };
  if (city.boat || city.plane || city.launch) return;
  const [lx, lz] = ferryLocal(F.pose, P.x, P.z);
  if (F.cool <= 0 && Math.abs(lx) < FERRY.halfL - 3 && Math.abs(lz) < FERRY.halfW - 1.5) { // auf dem Deck
    if (!F.told) { F.told = true; showMsg('⛴️ Anhalten – die Fähre legt ab! (Gas = schneller)', 2.4); }
    F.wait = P.v < 0.8 ? F.wait + dt : 0;
    if (F.wait > 1.2) {
      F.rider = { walk: !!w, lx, lz, dh: (w ? w.h : me.heading) - F.pose.h }; F.moving = true; F.dir = F.at === 'A' ? 1 : -1; city.ferryRide = true;
      showMsg(F.at === 'A' ? '⛴️ Leinen los – zur Diamantinsel!' : '⛴️ Zurück zum Frachthafen', 2.4);
    }
  } else { F.wait = 0; F.told = false; }
  const here = F.at === 'A' ? FERRY.A : FERRY.B, there = F.at === 'A' ? FERRY.B : FERRY.A;
  if (Math.hypot(P.x - there.x, P.z - there.z) < 45 && Math.hypot(P.x - here.x, P.z - here.z) > 200) { // am anderen Kai: Fähre rufen
    F.moving = true; F.dir = F.at === 'A' ? 1 : -1; showMsg('⛴️ Die Fähre kommt – warte am Kai!', 2.6);
  }
}
function stepMonaco(dt) {
  const P = mapWho(), near = Math.hypot(P.x - MONACO.x, P.z - MONACO.z) < 800;
  if (!S.monCars) return;
  if (!near) { for (const c of S.monCars) c.mesh.visible = false; return; }
  const me = city.me, w = city.walk, who = w ? { x: w.x, z: w.z, r: 0.5 } : { x: me.pos.x, z: me.pos.z, r: city.boat || city.plane ? -99 : me.radius * 0.8 };
  const hit = stepMonacoTraffic(S.monCars, dt, who, S.camera.position, animateCar, city.t);
  if (hit && !w && !city.ferryRide) { // Rempler: zurückprallen
    const dx = me.pos.x - hit.x, dz = me.pos.z - hit.z, d = Math.hypot(dx, dz) || 1;
    me.pos.x += dx / d * 1.2; me.pos.z += dz / d * 1.2;
    if (Math.abs(me.speed) > 3 && (city.crashT || 0) <= 0) { crash(0.2 + Math.abs(me.speed) / 25, 'car'); hurt(Math.abs(me.speed) / 25, hit.x, hit.z); city.crashT = 0.5; }
    me.speed *= -0.3;
  } else if (hit && w) { const dx = w.x - hit.x, dz = w.z - hit.z, d = Math.hypot(dx, dz) || 1; w.x += dx / d * 0.8; w.z += dz / d * 0.8; }
}

// ---------- Dichtes Gras um dich herum ----------
// Auf Wiesen stehen rund um den Spieler (42 m) tausende Grasbüschel; sie wandern mit. Jede Stelle hat immer dasselbe
// Büschel (fester Zufall je Feld), darum flackert nichts. Nur wo Wiese ist (surfaceAt), nicht auf Strassen und im Wasser.
const GRASS = { n: 3800, r: 42, cell: 1.35 };
const gHash = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
function stepGrass() {
  if (!S.grassPatch) {
    const im = new THREE.InstancedMesh(tuftGeo(), tuftMat(), GRASS.n);
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; im.count = 0; im.userData.noWarp = true;
    for (let k = 0; k < GRASS.n; k++) { const v = gHash(k, 3, 1); im.setColorAt(k, new THREE.Color().setHSL(0.22 + v * 0.07, 0.62, 0.3 + gHash(k, 5, 2) * 0.12)); }
    S.scene.add(im); S.grassPatch = im;
  }
  const P = mapWho(), im = S.grassPatch;
  if (city.grassAt && Math.hypot(P.x - city.grassAt.x, P.z - city.grassAt.z) < 5) return;
  city.grassAt = { x: P.x, z: P.z };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), w = { x: 0, z: 0 }, C = GRASS.cell;
  const i0 = Math.floor((P.x - GRASS.r) / C), i1 = Math.ceil((P.x + GRASS.r) / C), j0 = Math.floor((P.z - GRASS.r) / C), j1 = Math.ceil((P.z + GRASS.r) / C);
  // Jedes Feld nur einmal prüfen und merken (die Prüfungen sind teuer: sonst ruckelte es alle 5 m); null = kein Gras
  const cache = city.grassCache || (city.grassCache = new Map());
  if (cache.size > 80000) cache.clear();
  let n = 0;
  for (let i = i0; i <= i1 && n < GRASS.n; i++) for (let j = j0; j <= j1 && n < GRASS.n; j++) {
    const x = (i + gHash(i, j, 0)) * C, z = (j + gHash(i, j, 9)) * C;
    if ((x - P.x) ** 2 + (z - P.z) ** 2 > GRASS.r * GRASS.r) continue;
    const key = (i + 30000) * 60000 + (j + 30000);
    let e = cache.get(key);
    if (e === undefined) {
      e = null;
      const ok = surfaceAt(x, z) === 'grass' && landDist(x, z) >= 12
        && !((inPassRegion(x, z) && passNearest(x, z).d < 9) || [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([a, b]) => surfaceAt(x + a, z + b) !== 'grass')) // nicht auf Strassen und ihren Rändern
        && !(inRest(x, z) || inMonaco(x, z) || (Math.max(Math.abs(x), Math.abs(z)) > HALF + 20 && !inPassRegion(x, z) && landRaw(x, z) < 0.15)); // nicht Raststätte, Diamantinsel, Wasser
      if (ok) { warpXZ(x, z, w); e = [w.x, groundAt(x, z), w.z, 0.8 + gHash(i, j, 4) * 0.8]; } // wie alles andere: in der Stadt verbogen
      cache.set(key, e);
    }
    if (!e) continue;
    const s = e[3];
    im.setMatrixAt(n++, m.compose(p.set(e[0], e[1], e[2]), q.setFromAxisAngle(UP, gHash(i, j, 7) * 6.28), sc.set(s, s * (0.8 + gHash(i, j, 2) * 0.5), s)));
  }
  im.count = n; im.instanceMatrix.needsUpdate = true;
}
// Die Stadt ist neu gebaut worden: steht ein gespeichertes Auto jetzt in einem Haus, kommt es auf die nächste Strasse
function parkFree(P) {
  if (Math.max(Math.abs(P.x), Math.abs(P.z)) > HALF + 10) return;
  if (!S.solid.some(b => P.x > b.x0 - 1.2 && P.x < b.x1 + 1.2 && P.z > b.z0 - 1.2 && P.z < b.z1 + 1.2)) return;
  const nx = node(Math.round(P.x / BLOCK + N / 2)), nz = node(Math.round(P.z / BLOCK + N / 2));
  if (Math.abs(P.x - nx) < Math.abs(P.z - nz)) { P.x = nx + LANE; P.h = Math.PI / 2; } else { P.z = nz + LANE; P.h = 0; }
  saveParked();
}
function stepParked(dt) {
  if ((city.parkT = (city.parkT || 0) - dt) > 0) return;
  city.parkT = 0.25;
  const cam = S.camera.position, me = city.me;
  let built = false; // höchstens ein Auto pro Durchgang bauen, sonst ruckelt es
  for (const P of city.parked) {
    const near = Math.hypot(P.x - me.pos.x, P.z - me.pos.z) < PARK_SEE || Math.hypot(P.x - cam.x, P.z - cam.z) < PARK_SEE;
    if (!P.mesh && near && !built) {
      parkFree(P);
      if (realKind(P.v.kind) !== P.v.kind) { P.v.kind = realKind(P.v.kind); if (P.v.special === 'junk') P.v.special = null; saveParked(); } // altes Fahrzeug → echtes Auto
      const v = city.kinds[P.v.kind] ? P.v : { ...P.v, kind: 'car' };
      setParkMesh(P, buildCar(v, city.kinds)); parkCols(P); built = true;
    }
    if (P.mesh) { P.mesh.visible = near; if (near) setLod(P.mesh, Math.hypot(P.x - cam.x, P.z - cam.z) > LOD_NEAR); }
  }
}
// Anderes Auto nehmen: gleiche Stelle, neue Werte, online sehen es alle
function switchCar(v, force = false) {
  const me = city.me;
  if (v.id === me.v.id && !force) return; // force: gleiches Auto aus der Base nochmals (eine weitere Kopie)
  const mesh = buildCar(v, city.kinds), M = city.mission;
  mesh.rotation.order = 'YZX';
  if (M && M.pizzaBox) { me.mesh.remove(M.pizzaBox); mesh.add(M.pizzaBox); }
  S.scene.remove(me.mesh);
  S.scene.add(mesh);
  Object.assign(me, carStats(v, mesh, city.kinds, city.topSpeed), { v: { ...v, name: me.v.name }, mesh, speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  city.fuel = 1; // aus der Base kommt es vollgetankt und ganz
  city.damage = 0; city.scratches = []; dropDents();
  city.gears = gearbox(v.kind);
  city.gripBoost = (city.kinds[v.kind] && city.kinds[v.kind].grip) || 1;
  if (city.cruise) showCruise(); // anderes Auto: höchstens so schnell, wie es kann
  city.canFly = !!(city.kinds[v.kind] && city.kinds[v.kind].fly);
  S.ui.flybtn.hidden = !city.canFly;
  S.ui.ps.textContent = '⚡ ' + v.ps + ' PS';
  if (S.snd) { S.snd.stop(); S.snd = createCarSound({ kind: v.kind }); }
  if (city.net) city.net.setCar(v);
  showMsg('🔑 ' + vname(v), 1.6);
}

// ---------- Aussteigen und zu Fuss gehen ----------
// 🚪 oder X: anhalten, aussteigen (links, auf der Fahrerseite), herumlaufen (⬆️ gehen, lange halten oder Leertaste = rennen) und
// wieder einsteigen: ins eigene Auto oder in ein Auto der eigenen Base. Online sehen die anderen nur das parkierte Auto.
// ---------- Figuren (rund, cartoonartig, mit Kleidung) ----------
// Jede Gruppe (Rumpf, Kopf, Oberschenkel …) ist EIN Stück mit Farben in den Ecken: viele Details, aber wenig Zeichen-Befehle.
// Teil: [Form, Farbe, x, y, z, Drehung x, y, z, Grösse x, y, z]
let FIG_MAT = null;
const _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fe = new THREE.Euler(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(), _fc = new THREE.Color();
function figMesh(parts) {
  if (!FIG_MAT) FIG_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, envMapIntensity: 0.8 });
  const geos = parts.map(([g0, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    g.applyMatrix4(_fm.compose(_fp.set(x, y, z), _fq.setFromEuler(_fe.set(rx, ry, rz)), _fs.set(sx, sy, sz)));
    _fc.setHex(col); const c = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < c.length; k += 3) { c[k] = _fc.r; c[k + 1] = _fc.g; c[k + 2] = _fc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), FIG_MAT);
  m.castShadow = true;
  return m;
}
const G = { // Formen werden wiederverwendet
  sph: (r, w = 12, h = 9) => new THREE.SphereGeometry(r, Math.min(w, 14), Math.min(h, 10)), half: (r, w = 12, h = 6) => new THREE.SphereGeometry(r, Math.min(w, 14), Math.min(h, 6), 0, Math.PI * 2, 0, Math.PI / 2), // nicht zu fein: viele Figuren, wenig Speicher
  cap: (r, l, s = 10) => new THREE.CapsuleGeometry(r, l, 3, Math.min(s, 10)), box: (x, y, z) => new THREE.BoxGeometry(x, y, z), cyl: (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, Math.min(s, 12)),
};
const shade = (hex, f) => { _fc.setHex(hex); _fc.multiplyScalar(f); return _fc.getHex(); };
// Gesicht nach vorne (+x): grosse Augen mit Glanzpunkt, Nase, Lächeln, rote Wangen, Ohren
function faceParts(skin, R, y, iris = 0x3b2a1a) {
  const f = [[G.sph(R, 22, 18), skin, 0, y, 0, 0, 0, 0, 1, 1.04, 0.98], [G.sph(R * 0.17), skin, R * 1.02, y - R * 0.18, 0]];
  for (const s of [-1, 1]) {
    f.push([G.sph(R * 0.28, 12, 10), 0xffffff, R * 0.82, y + R * 0.06, s * R * 0.38, 0, 0, 0, 0.55, 1.05, 0.9],
      [G.sph(R * 0.18, 10, 8), iris, R * 0.93, y + R * 0.05, s * R * 0.38], [G.sph(R * 0.1, 8, 6), 0x0b0b0f, R * 1.0, y + R * 0.05, s * R * 0.38],
      [G.sph(R * 0.045, 6, 4), 0xffffff, R * 1.04, y + R * 0.13, s * R * 0.34],
      [G.box(0.012, 0.014, R * 0.36), shade(skin, 0.45), R * 0.9, y + R * 0.38, s * R * 0.4, 0, 0, s * 0.1],
      [G.sph(R * 0.14, 8, 6), 0xf9a8b4, R * 0.82, y - R * 0.2, s * R * 0.62, 0, 0, 0, 0.4, 0.7, 1],
      [G.sph(R * 0.2, 10, 8), skin, 0, y, s * R * 0.98, 0, 0, 0, 0.6, 1, 0.5]);
  }
  f.push([new THREE.TorusGeometry(R * 0.26, R * 0.05, 6, 14, Math.PI), 0x9f1239, R * 0.93, y - R * 0.36, 0, 0, Math.PI / 2, Math.PI]);
  return f;
}
const pick = a => a[Math.floor(Math.random() * a.length)];
// Fussgänger und andere Leute: verschiedene Kleider (T-Shirt, Jacke, Kleid), Frisuren, Mützen, Taschen
function makePerson(shirtColor = 0x2563eb, hairColor = 0x5a3a1e, skinColor = 0xf2c9a0, o = {}) {
  const g = new THREE.Group(), outfit = o.outfit || pick(['tee', 'tee', 'jacket', 'dress']), hairStyle = o.hair || pick(['short', 'long', 'bun', 'cap', 'hat', 'short']);
  const pants = o.pants || pick([0x1e3a5f, 0x334155, 0x7c5a3a, 0x111827, 0x3f6212]), shoes = pick([0xf8fafc, 0x1b1b1b, 0x7c2d12, 0xdc2626]), accent = pick([0xfacc15, 0xffffff, 0xf472b6, 0x22d3ee]);
  const limb = (parts, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); p.add(figMesh(parts)); g.add(p); return p; };
  const legs = [-1, 1].map(s => limb([
    outfit === 'dress' ? [G.cap(0.06, 0.62), skinColor, 0, -0.42, 0] : [G.cap(0.085, 0.6), pants, 0, -0.4, 0],
    ...(outfit === 'dress' ? [] : [[G.cyl(0.092, 0.092, 0.05), shade(pants, 0.8), 0, -0.72, 0]]),
    [G.sph(0.1, 14, 10), shoes, 0.04, -0.82, 0, 0, 0, 0, 1.7, 0.85, 1.1], [G.sph(0.1, 12, 6), 0x374151, 0.04, -0.87, 0, 0, 0, 0, 1.75, 0.3, 1.15],
  ], 0, 0.92, s * 0.11));
  const arms = [-1, 1].map(s => limb([
    [G.cap(0.065, outfit === 'tee' ? 0.12 : 0.42), shirtColor, 0, outfit === 'tee' ? -0.12 : -0.26, 0],
    ...(outfit === 'tee' ? [[G.cap(0.05, 0.3), skinColor, 0, -0.38, 0]] : [[G.cyl(0.068, 0.068, 0.04), shade(shirtColor, 0.75), 0, -0.5, 0]]),
    [G.sph(0.062, 12, 10), skinColor, 0, -0.6, 0, 0, 0, 0, 1, 1.1, 0.85], [G.sph(0.028, 8, 6), skinColor, 0.035, -0.57, s * 0.035],
  ], 0, 1.47, s * 0.26));
  const body = [[G.cap(0.19, 0.38, 16), shirtColor, 0, 1.2, 0, 0, 0, 0, 0.8, 1, 1.15], [G.cyl(0.055, 0.065, 0.1), skinColor, 0, 1.6, 0]];
  if (outfit === 'tee') body.push([G.sph(0.07, 12, 8), accent, 0.15, 1.3, 0, 0, 0, 0, 0.25, 1, 1], // Bild auf dem T-Shirt
    [G.box(0.22, 0.1, 0.36), pants, 0, 0.93, 0], [G.box(0.225, 0.035, 0.365), 0x3b2a1a, 0, 0.99, 0]);
  if (outfit === 'jacket') body.push([G.box(0.012, 0.42, 0.02), 0xd1d5db, 0.155, 1.22, 0], [new THREE.TorusGeometry(0.11, 0.03, 6, 14), shade(shirtColor, 0.8), 0, 1.53, 0, Math.PI / 2, 0, 0, 1, 1, 1.2],
    [G.box(0.03, 0.08, 0.1), shade(shirtColor, 0.8), 0.15, 1.08, 0.1], [G.box(0.03, 0.08, 0.1), shade(shirtColor, 0.8), 0.15, 1.08, -0.1], [G.box(0.22, 0.1, 0.36), pants, 0, 0.93, 0]);
  if (outfit === 'dress') body.push([G.cyl(0.19, 0.33, 0.48, 18), shirtColor, 0, 0.88, 0], [G.cyl(0.335, 0.335, 0.04, 18), accent, 0, 0.66, 0]);
  if (!o.noBag && Math.random() < 0.35) body.push([G.box(0.24, 0.2, 0.08), pick([0x7c2d12, 0x111827, 0xbe185d]), 0, 1.0, 0.27], [G.box(0.02, 0.6, 0.02), 0x3b2a1a, 0.05, 1.3, 0.2, 0.5, 0, 0]); // Tasche
  g.add(figMesh(body));
  const hy = 1.76, R = 0.145, head = faceParts(skinColor, R, hy, pick([0x3b2a1a, 0x1d4ed8, 0x166534]));
  const hair = [[G.half(R * 1.06), hairColor, -0.01, hy + 0.02, 0, 0, 0, 0.25]];
  if (hairStyle === 'long') hair.push([G.cap(R * 0.85, 0.22), hairColor, -0.08, hy - 0.12, 0, 0, 0, 0, 0.7, 1, 1.15]);
  if (hairStyle === 'bun') hair.push([G.sph(0.07), hairColor, -0.1, hy + 0.15, 0]);
  if (hairStyle === 'cap') { const c = pick([0xdc2626, 0x1d4ed8, 0x16a34a, 0xf59e0b]); hair.push([G.half(R * 1.1), c, -0.005, hy + 0.04, 0], [G.cyl(0.11, 0.11, 0.02, 16), c, 0.12, hy + 0.05, 0, 0, 0, -0.12, 1, 1, 0.9]); }
  if (hairStyle === 'hat') { const c = pick([0x78350f, 0x111827, 0xfef3c7]); hair.push([G.cyl(0.25, 0.25, 0.02, 20), c, 0, hy + 0.08, 0], [G.cyl(0.11, 0.13, 0.13, 16), c, 0, hy + 0.15, 0], [G.cyl(0.132, 0.132, 0.03, 16), 0xdc2626, 0, hy + 0.1, 0]); }
  g.add(figMesh([...head, ...hair]));
  g.userData = { legs, arms };
  return g;
}
// Deine Spielfigur (zu Fuss), so wie du sie im Shop unter „Meine Figur“ gestaltet hast (autoRetterSkin aus game.js):
// Haut, Frisur, Kopfbedeckung, Oberteil, Hose, Schuhe, Extras. Knie und Ellbogen biegen sich.
// Aufbau: root (Ort, Richtung) → spin (Drehpunkt in der Körpermitte, für Saltos) → body.
const SKIN_DEF = { tone: '#f2c9a0', hair: 'short', hairCol: '#5a3a1e', head: 'cap', headCol: '#1d4ed8', top: 'hoodie', topCol: '#dc2626',
  legs: 'jeans', legsCol: '#1e40af', shoes: 'sneaker', shoesCol: '#f8fafc', extras: ['backpack'] };
function loadSkin() { try { return { ...SKIN_DEF, ...(JSON.parse(localStorage.getItem('autoRetterSkin')) || {}) }; } catch (err) { return { ...SKIN_DEF }; } }
function makePlayer(cfg = loadSkin()) {
  const root = new THREE.Group(), spin = new THREE.Group(), body = new THREE.Group();
  root.add(spin); spin.position.y = 1.0; spin.add(body); body.position.y = -1.0;
  const hx = c => parseInt(String(c || '#888888').slice(1), 16), X = new Set(cfg.extras || []);
  const skin = hx(cfg.tone), white = 0xf8fafc, top = cfg.top, astro = top === 'astro';
  const topC = top === 'tux' ? 0x111827 : astro ? 0xf1f5f9 : hx(cfg.topCol), topD = shade(topC, 0.78);
  const legC = astro ? 0xf1f5f9 : hx(cfg.legsCol), legD = shade(legC, 0.8), shoeC = cfg.shoes === 'gold' ? 0xfacc15 : hx(cfg.shoesCol), hair = hx(cfg.hairCol), hatC = hx(cfg.headCol);
  const shortSleeve = ['tee', 'jersey', 'hawaii'].includes(top);
  const joint = (parent, x, y, z, parts) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); if (parts && parts.length) g.add(figMesh(parts)); return g; };
  const legs = [], knees = [], arms = [], elbows = [];
  for (const sz of [-1, 1]) { // Beine: Oberschenkel, Knie, Unterschenkel, Schuh
    const thigh = cfg.legs === 'skirt' ? [[G.cap(0.07, 0.3), skin, 0, -0.22, 0]]
      : cfg.legs === 'shorts' ? [[G.cap(0.1, 0.12), legC, 0, -0.12, 0], [G.cap(0.075, 0.2), skin, 0, -0.3, 0]]
      : [[G.cap(0.098, 0.3), legC, 0, -0.22, 0], [G.box(0.01, 0.34, 0.014), cfg.legs === 'track' ? white : 0x93c5fd, 0, -0.22, sz * 0.097]];
    const hip = joint(body, 0, 0.95, sz * 0.11, thigh);
    const bare = cfg.legs === 'skirt' || cfg.legs === 'shorts';
    const shin = [[G.cap(bare ? 0.07 : 0.088, 0.3), bare ? skin : legC, 0, -0.2, 0]];
    if (!bare) shin.push([G.cyl(0.098, 0.098, 0.05), legD, 0, -0.37, 0], [G.box(0.01, 0.3, 0.014), cfg.legs === 'track' ? white : 0x93c5fd, 0, -0.2, sz * 0.087]);
    if (cfg.shoes === 'boots') shin.push([G.cyl(0.1, 0.11, 0.26, 14), 0x78350f, 0, -0.38, 0], [G.sph(0.11, 14, 10), 0x78350f, 0.06, -0.48, 0, 0, 0, 0, 1.7, 0.85, 1.12], [G.sph(0.11, 12, 6), 0x292524, 0.06, -0.535, 0, 0, 0, 0, 1.85, 0.28, 1.2]);
    else shin.push([G.sph(0.11, 16, 12), shoeC, 0.06, -0.47, 0, 0, 0, 0, 1.75, 0.9, 1.12], [G.sph(0.09, 12, 8), cfg.shoes === 'gold' ? 0xfde68a : 0xe5e7eb, 0.16, -0.49, 0, 0, 0, 0, 0.9, 0.7, 1.1],
      [G.sph(0.11, 14, 6), 0x374151, 0.06, -0.535, 0, 0, 0, 0, 1.85, 0.28, 1.2], [G.box(0.11, 0.022, 0.012), 0xdc2626, 0.05, -0.46, sz * 0.122],
      ...[0.04, 0.08, 0.12].map(dx => [G.box(0.012, 0.012, 0.08), 0x9ca3af, dx, -0.39 + dx * -0.15, 0]));
    const knee = joint(hip, 0, -0.45, 0, shin);
    legs.push(hip); knees.push(knee);
  }
  // Oberkörper: Grundform in der Farbe des Oberteils, dazu je nach Kleid Reissverschluss, Taschen, Aufdruck …
  const T = [[G.cap(0.2, 0.34, 18), topC, 0, 0.3, 0, 0, 0, 0, astro ? 0.9 : 0.8, 1, astro ? 1.25 : 1.15], [G.cyl(0.165, 0.165, 0.07, 18), topD, 0, 0.08, 0, 0, 0, 0, 0.82, 1, 1.15]];
  if (top === 'hoodie') T.push([G.box(0.012, 0.36, 0.022), 0xe5e7eb, 0.163, 0.34, 0], [G.box(0.02, 0.04, 0.02), 0x9ca3af, 0.17, 0.45, 0.02], [G.box(0.03, 0.12, 0.26), topD, 0.157, 0.18, 0],
    [G.half(0.16), topD, -0.1, 0.55, 0, 0, 0, 0.9], [G.cyl(0.008, 0.008, 0.16, 5), white, 0.16, 0.44, -0.05], [G.cyl(0.008, 0.008, 0.16, 5), white, 0.16, 0.44, 0.05]);
  if (top === 'tee') T.push([G.sph(0.07, 12, 8), 0xfde047, 0.155, 0.36, 0, 0, 0, 0, 0.25, 1, 1]);
  if (top === 'jersey') T.push([G.cyl(0.168, 0.168, 0.05, 18), white, 0, 0.36, 0, 0, 0, 0, 0.82, 1, 1.16], [new THREE.TorusGeometry(0.1, 0.025, 6, 14), white, 0, 0.58, 0, Math.PI / 2, 0, 0, 1, 1, 1.2]);
  if (top === 'hawaii') for (const [y, z, x] of [[0.42, -0.08, 1], [0.28, 0.1, 1], [0.15, -0.05, 1], [0.38, 0.06, -1], [0.2, -0.1, -1]]) T.push([G.sph(0.03, 8, 6), z > 0 ? 0xfde047 : 0xf472b6, x * 0.155, y, z, 0, 0, 0, 0.3, 1, 1]);
  if (top === 'jacket') T.push([G.box(0.012, 0.42, 0.022), 0x9ca3af, 0.163, 0.3, 0], [new THREE.TorusGeometry(0.11, 0.035, 6, 14), topD, 0, 0.56, 0, Math.PI / 2, 0, 0, 1, 1, 1.25]);
  if (top === 'tux') T.push([G.box(0.02, 0.26, 0.12), white, 0.16, 0.42, 0], [G.sph(0.03, 8, 6), 0xdc2626, 0.175, 0.53, -0.03], [G.sph(0.03, 8, 6), 0xdc2626, 0.175, 0.53, 0.03],
    ...[0.38, 0.3].map(y => [G.sph(0.012, 6, 4), 0x111827, 0.172, y, 0]));
  if (top === 'hero') T.push([new THREE.OctahedronGeometry(0.07), 0xfacc15, 0.16, 0.4, 0, 0, 0, 0, 0.3, 1, 1], [G.box(0.22, 0.04, 0.37), 0xfacc15, 0, 0.12, 0]);
  if (astro) T.push([G.box(0.03, 0.12, 0.18), 0xcbd5e1, 0.175, 0.36, 0], ...[[-0.05, 0xdc2626], [0, 0x22c55e], [0.05, 0x3b82f6]].map(([z, c]) => [G.sph(0.015, 6, 4), c, 0.192, 0.38, z]), [G.box(0.14, 0.34, 0.3), 0xe5e7eb, -0.22, 0.33, 0]);
  if (cfg.legs === 'skirt') T.push([G.cyl(0.17, 0.3, 0.36, 18), legC, 0, -0.08, 0, 0, 0, 0, 1, 1, 1.1]);
  else if (!['tux', 'hero', 'astro'].includes(top)) T.push([G.box(0.22, 0.12, 0.36), legC, 0, 0.0, 0], [G.box(0.225, 0.035, 0.365), 0x3b2a1a, 0, 0.055, 0], [G.box(0.02, 0.04, 0.05), 0xfacc15, 0.115, 0.055, 0]);
  if (cfg.legs === 'jeans') T.push([G.box(0.02, 0.07, 0.08), legD, -0.112, -0.02, 0.08], [G.box(0.02, 0.07, 0.08), legD, -0.112, -0.02, -0.08]);
  if (X.has('backpack') && !astro) T.push([G.cap(0.12, 0.16, 14), 0xfacc15, -0.24, 0.33, 0, 0, 0, 0, 0.6, 1, 1.15], [G.sph(0.08, 12, 8), 0xf59e0b, -0.32, 0.25, 0, 0, 0, 0, 0.5, 0.8, 1.2],
    [G.box(0.02, 0.32, 0.035), 0xca8a04, 0.165, 0.36, 0.11], [G.box(0.02, 0.32, 0.035), 0xca8a04, 0.165, 0.36, -0.11]);
  if (X.has('cape')) T.push([G.box(0.03, 1.0, 0.5), topC === 0xdc2626 ? 0x7c3aed : 0xdc2626, -0.21, 0.08, 0, 0, 0, -0.12, 1, 1, 1], [new THREE.TorusGeometry(0.12, 0.02, 6, 14), 0xfacc15, 0, 0.6, 0, Math.PI / 2, 0, 0, 1, 1, 1.2]);
  if (X.has('wings')) for (const s of [-1, 1]) T.push([G.sph(0.3, 14, 10), white, -0.28, 0.45, s * 0.28, s * 0.5, 0, 0, 0.15, 1, 0.7], [G.sph(0.2, 12, 8), 0xe0f2fe, -0.3, 0.4, s * 0.3, s * 0.5, 0, 0, 0.12, 0.9, 0.6]);
  const torso = joint(body, 0, 0.98, 0, T);
  for (const sz of [-1, 1]) { // Arme: Ärmel, Bündchen, runde Hand mit Daumen
    const hand = astro ? 0xe5e7eb : skin;
    const sh = joint(torso, 0, 0.5, sz * 0.28, shortSleeve ? [[G.cap(0.075, 0.06), topC, 0, -0.07, 0], [G.cap(0.06, 0.18), skin, 0, -0.18, 0]] : [[G.cap(0.07, 0.22), topC, 0, -0.16, 0]]);
    const el = joint(sh, 0, -0.33, 0, [[G.cap(shortSleeve ? 0.055 : 0.064, 0.2), shortSleeve ? skin : topC, 0, -0.14, 0], ...(shortSleeve ? [] : [[G.cyl(0.07, 0.07, 0.045), topD, 0, -0.27, 0]]),
      [G.sph(0.068, 12, 10), hand, 0, -0.34, 0, 0, 0, 0, 1, 1.1, 0.85], [G.sph(0.03, 8, 6), hand, 0.045, -0.31, sz * 0.04]]);
    arms.push(sh); elbows.push(el);
  }
  // Kopf: rund (Cartoon), Frisur, Kopfbedeckung, Brille
  const R = 0.16, hy = 0.2, H = [[G.cyl(0.05, 0.06, 0.1), skin, 0, 0.02, 0], ...faceParts(skin, R, hy)];
  const hatOn = ['cap', 'beanie', 'hat', 'viking', 'wizard'].includes(cfg.head) || astro, hs = cfg.hair;
  if (hs !== 'bald') {
    if (hatOn) H.push([new THREE.SphereGeometry(R * 0.98, 16, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.25), hair, -0.01, hy - 0.01, 0]); // Haare unter dem Hut
    else H.push([G.half(R * 1.05, 20, 10), hair, -0.012, hy + 0.01, 0, 0, 0, 0.18]);
    if (hs === 'long') H.push([G.cap(R * 0.85, 0.2, 14), hair, -0.09, hy - 0.12, 0, 0, 0, 0, 0.6, 1, 1.15]);
    if (hs === 'bun' && !hatOn) H.push([G.sph(0.065, 12, 10), hair, -0.07, hy + 0.17, 0]);
    if (hs === 'spiky' && !hatOn) for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; H.push([new THREE.ConeGeometry(0.035, 0.12, 6), hair, Math.cos(a) * 0.08 - 0.02, hy + 0.15, Math.sin(a) * 0.08, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
    if (hs === 'curly' && !hatOn) for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; H.push([G.sph(0.05, 8, 6), hair, Math.cos(a) * 0.12 - 0.02, hy + 0.1, Math.sin(a) * 0.12]); }
  }
  const hd = cfg.head;
  if (hd === 'cap' && !astro) H.push([G.half(R * 1.06, 20, 10), hatC, -0.005, hy + 0.035, 0], [G.cyl(0.12, 0.12, 0.022, 18), hatC, 0.15, hy + 0.045, 0, 0, 0, -0.12, 1.1, 1, 0.95],
    [G.sph(0.022, 8, 6), white, 0, hy + 0.21, 0], [G.sph(0.035, 10, 8), 0xfacc15, 0.14, hy + 0.12, 0, 0, 0, 0, 0.35, 1, 1]);
  if (hd === 'beanie' && !astro) H.push([G.half(R * 1.08, 20, 10), hatC, -0.005, hy + 0.02, 0, 0, 0, 0, 1, 1.25, 1], [G.cyl(R * 1.09, R * 1.09, 0.06, 20), shade(hatC, 0.8), -0.005, hy + 0.04, 0], [G.sph(0.045, 10, 8), white, -0.005, hy + 0.24, 0]);
  if (hd === 'hat' && !astro) H.push([G.cyl(0.3, 0.3, 0.02, 24), hatC, 0, hy + 0.07, 0], [G.cyl(0.13, 0.15, 0.14, 18), hatC, 0, hy + 0.15, 0], [G.cyl(0.152, 0.152, 0.035, 18), 0xdc2626, 0, hy + 0.1, 0]);
  if (hd === 'headphones' && !astro) H.push([new THREE.TorusGeometry(R * 1.08, 0.018, 6, 20, Math.PI), 0x111827, 0, hy, 0, 0, Math.PI / 2, 0], ...[-1, 1].map(s => [G.cyl(0.06, 0.06, 0.05, 14), hatC, 0, hy, s * R * 1.05, Math.PI / 2, 0, 0]));
  if (hd === 'wizard' && !astro) H.push([G.cyl(0.26, 0.26, 0.02, 24), hatC, 0, hy + 0.08, 0], [new THREE.ConeGeometry(0.15, 0.42, 16), hatC, -0.03, hy + 0.3, 0, 0, 0, 0.15], [G.sph(0.025, 8, 6), 0xfacc15, 0.1, hy + 0.25, 0.05], [G.sph(0.02, 8, 6), 0xfacc15, 0.07, hy + 0.36, -0.04]);
  if (hd === 'viking' && !astro) H.push([G.half(R * 1.08, 20, 10), 0x9ca3af, -0.005, hy + 0.03, 0], [G.cyl(R * 1.09, R * 1.09, 0.04, 20), 0x78350f, -0.005, hy + 0.04, 0], ...[-1, 1].map(s => [new THREE.ConeGeometry(0.04, 0.2, 10), 0xfef3c7, 0, hy + 0.14, s * 0.2, s * 0.9, 0, 0]));
  if (hd === 'crown' && !astro) H.push([G.cyl(0.12, 0.12, 0.08, 18), 0xfacc15, 0, hy + 0.17, 0], ...[0, 1, 2, 3, 4].map(k => { const a = k / 5 * Math.PI * 2; return [new THREE.ConeGeometry(0.025, 0.08, 6), 0xfacc15, Math.cos(a) * 0.11, hy + 0.25, Math.sin(a) * 0.11]; }), [G.sph(0.025, 8, 6), 0xdc2626, 0.12, hy + 0.17, 0]);
  if (astro) H.push([new THREE.TorusGeometry(R * 1.32, 0.03, 8, 24), 0xe5e7eb, 0.02, hy, 0, 0, Math.PI / 2, 0], [new THREE.SphereGeometry(R * 1.35, 18, 12, Math.PI / 2, Math.PI), 0xf1f5f9, 0, hy, 0]);
  if (X.has('glasses')) H.push(...[-1, 1].map(s => [new THREE.TorusGeometry(0.045, 0.008, 6, 14), 0x111111, R * 0.98, hy + R * 0.05, s * R * 0.38, 0, Math.PI / 2, 0]));
  if (X.has('sunglasses')) H.push(...[-1, 1].map(s => [G.box(0.02, 0.06, 0.09), 0x111827, R * 0.98, hy + R * 0.05, s * R * 0.38]), [G.box(0.02, 0.012, 0.05), 0x111827, R * 1.0, hy + R * 0.08, 0]);
  const head = joint(torso, 0, 0.62, 0, H);
  root.userData = { legs, knees, arms, elbows, spin, body, torso, head };
  return root;
}
// Gehen und Rennen: Beine mit Knien, Arme mit Ellbogen, Körper wippt und lehnt sich nach vorne; im Stand atmen
function animatePlayer(w, dt) {
  const U = w.mesh.userData;
  if (!U.knees) { animatePerson(w, dt); return; }
  if (w.air || w.fallT > 0) { w.mesh.position.set(w.x, (w.gy || 0) + (w.jy || 0), w.z); w.mesh.rotation.set(0, -w.h, 0); return; }
  const sp = Math.abs(w.speed), run = sp > 4.5, dir = w.speed < 0 ? -1 : 1;
  w.phase += sp * dt * (run ? 1.9 : 2.7);
  const amp = Math.min(1, sp / 3) * (run ? 0.95 : 0.55);
  U.legs.forEach((l, i) => { const s = Math.sin(w.phase + i * Math.PI); l.rotation.z = s * amp * dir; U.knees[i].rotation.z = -Math.max(0, -Math.cos(w.phase + i * Math.PI)) * amp * 1.5 - (run ? 0.12 : 0.03); });
  U.arms.forEach((a, i) => { a.rotation.z = -Math.sin(w.phase + i * Math.PI) * amp * 0.9 * dir; a.rotation.x = (i ? -1 : 1) * 0.06; U.elbows[i].rotation.z = 0.25 + (run ? 1.0 : 0.25) * Math.min(1, sp / 3); });
  const breathe = sp < 0.2 ? Math.sin(city.t * 2.2) * 0.01 : 0;
  U.body.position.y = -1.0 + Math.abs(Math.sin(w.phase)) * 0.05 * amp + breathe;
  U.torso.rotation.z = -(run ? 0.2 : 0.05 * amp);
  U.head.rotation.y = sp < 0.2 ? Math.sin(city.t * 0.6) * 0.25 : 0; // umschauen, wenn man steht
  U.spin.rotation.set(0, 0, 0);
  w.mesh.position.set(w.x, (w.gy || 0) + (w.jy || 0), w.z); w.mesh.rotation.set(0, -w.h, 0);
}
// Springen und Tricks (zu Fuss und auf Ski): E / ▲ springen, Q / ▼ Backflip (rennend: Doppel-Backflip),
// in der Luft ⬅️➡️ = drehen (360°). Nicht fertig gedreht = hingefallen.
function stepAir(w, dt) {
  const input = city.input, U = w.mesh.userData, up = !!input.up, down = !!input.down;
  const upHit = up && !w.upPrev, downHit = down && !w.downPrev; w.upPrev = up; w.downPrev = down;
  if (w.fallT > 0) { // hingefallen: kurz liegen, dann aufstehen
    w.fallT -= dt; w.speed = 0;
    U.spin.rotation.set(0, 0, w.fallT > 0.5 ? 1.45 : 1.45 * w.fallT / 0.5); w.jy = 0;
    if (w.fallT <= 0) U.spin.rotation.set(0, 0, 0);
    return;
  }
  if (!w.air && (upHit || downHit) && U.spin) {
    const run = !!input.drift || Math.abs(w.speed) > 6, flip = downHit ? (run ? 2 : 1) * Math.PI * 2 : 0, vy = downHit ? (run ? 9.6 : 7.6) : (run ? 7 : 6);
    const G = city.moonOn ? MOON_G * 1.8 : 9.81; // auf dem Mond springt man viel höher
    w.air = { vy, y: 0, flip, rot: 0, spinY: 0, G, rate: flip / (2 * vy / G * 0.9) };
    window.beep && window.beep(520, 0.06, 'triangle', 0.03);
  }
  const A = w.air;
  if (!A) { w.jy = 0; return; }
  A.vy -= A.G * dt; A.y += A.vy * dt;
  if (A.flip) A.rot = Math.min(A.flip, A.rot + A.rate * dt);
  else if (input.left || input.right) A.spinY += (input.right ? -1 : 1) * 10 * dt; // Pirouette
  U.spin.rotation.set(0, A.spinY, A.rot);
  if (A.flip) { // eng zusammen beim Salto
    U.legs.forEach(l => { l.rotation.z = 1.7; }); U.knees.forEach(k => { k.rotation.z = -2.2; }); U.arms.forEach(a => { a.rotation.z = 1.0; }); U.elbows.forEach(e => { e.rotation.z = 1.3; });
  } else { U.legs.forEach((l, i) => { l.rotation.z = i ? 0.35 : -0.2; }); U.knees.forEach(k => { k.rotation.z = -0.7; }); U.arms.forEach(a => { a.rotation.z = 2.5; }); U.elbows.forEach(e => { e.rotation.z = 0.2; }); }
  w.jy = Math.max(0, A.y);
  if (A.y <= 0 && A.vy < 0) { // Landung
    w.air = null; w.jy = 0; U.spin.rotation.set(0, 0, 0);
    const flipLeft = A.flip - A.rot, spins = Math.abs(A.spinY) / (Math.PI * 2), spinLeft = Math.abs(spins - Math.round(spins)) * Math.PI * 2;
    if (flipLeft > 0.6 || (spins > 0.3 && spinLeft > 0.9)) { w.fallT = 1.4; showMsg('🤕 Autsch – hingefallen!', 1.4); crash(0.15, 'car'); return; }
    let name = A.flip ? (A.flip > 7 ? '🤸 Doppel-Backflip!' : '🤸 Backflip!') : spins >= 0.7 ? '🌀 ' + Math.round(spins) * 360 + '°-Drehung!' : '';
    if (!name) return;
    city.tricks = (city.tricks || 0) + 1;
    const coin = !city.net && city.tricks % 5 === 0 ? 1 : 0; if (coin) city.earn(coin);
    showMsg(name + '  (' + city.tricks + ' Tricks)' + (coin ? '  +1 🪙' : ''), 1.6);
    window.beep && window.beep(880, 0.08, 'triangle', 0.05);
  }
}
// Gehen: Beine und Arme schwingen (p: x, z, h, speed, phase, mesh)
function animatePerson(p, dt) {
  p.phase += Math.abs(p.speed) * dt * 2.4;
  const amp = Math.min(1, Math.abs(p.speed) / 3) * (p.speed > 4 ? 0.85 : 0.55);
  const { legs, arms } = p.mesh.userData;
  legs.forEach((l, i) => { l.rotation.z = Math.sin(p.phase + i * Math.PI) * amp; });
  arms.forEach((a, i) => { a.rotation.z = -Math.sin(p.phase + i * Math.PI) * amp * 0.8; });
  p.mesh.position.set(p.x, (p.gy || 0) + Math.abs(Math.sin(p.phase)) * 0.04 * amp, p.z);
  p.mesh.rotation.y = -p.h;
}
// Ins Auto oder hinaus
function toggleWalk() {
  if (!city) return;
  if (city.walk) { getIn(); return; }
  const me = city.me;
  if (city.plane) { if (!city.plane.air && Math.abs(me.speed) < 3 && !(city.plane.crashT > 0)) leavePlane(); else showMsg('✈️ Zuerst landen und anhalten', 1.6); return; }
  if (city.boat) { if ((nearPier(me.pos.x, me.pos.z) || nearMonPier(me.pos.x, me.pos.z)) && Math.abs(me.speed) < 5) leaveBoat(); else showMsg('🚤 Fahr zu einem Steg (Strand oder Diamantinsel), dort kannst du aussteigen', 2); return; }
  if (city.ticket || city.pulled > 0 || (city.police && city.police.state === 'stop')) { showMsg('🚔 Nicht jetzt – die Polizei!', 1.4); return; }
  if (tagState()) { showMsg('🏃 Nicht während Fangis', 1.4); return; }
  if (Math.abs(me.speed) > 3 || me.alt > 0.5) { showMsg('Zuerst anhalten', 1.2); return; }
  exitCar();
  showMsg(city.police ? '🏃 Ausgestiegen – lauf! (⬆️ lange halten = rennen)' : '🚶 Ausgestiegen!', 1.6);
}
function exitCar() { // aussteigen (links, auf der Fahrerseite) und zu Fuss weiter
  const me = city.me;
  Object.assign(me, { speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading), side = me.radius * 0.6 + 0.9; // links = Fahrerseite
  const w = city.walk = { x: me.pos.x + fz * side + fx * 0.3, z: me.pos.z - fx * side + fz * 0.3, h: me.heading - Math.PI / 2, speed: 0, phase: 0, mesh: makePlayer(), target: null };
  w.mesh.position.set(w.x, 0, w.z);
  S.scene.add(w.mesh);
  if (me.mesh.userData.driver) me.mesh.userData.driver.visible = false; // der Fahrer ist ja ausgestiegen
  S.ui.walkbtn.textContent = '🚗';
  S.ui.flybtn.hidden = true;
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen (lange = rennen) · E springen · Q Backflip · X einsteigen';
}
function getIn() {
  const w = city.walk, t = w.target;
  if (city.movie) { city.movie = null; w.mesh.visible = true; showMsg('🎬 Aufgestanden', 1.2); return; }
  if (t && t.movie) { city.movie = { t: 0 }; w.mesh.visible = false; showMsg('🍿 Film läuft – X zum Aufstehen', 2.4); return; }
  if (t && t.lift) { startLift(w, t.lift); return; }
  if (t && t.rocket) { startLaunch(); return; }
  if (t && t.bed) { goSleep(w); return; }
  if (w.ski) { skiOff(w); return; }
  if (!t) { showMsg('🚗 Geh näher zu einem Auto', 1.4); return; }
  S.scene.remove(w.mesh);
  city.walk = null;
  if (t.boat) enterBoat();
  else if (t.plane) enterPlane();
  else if (t.steal) stealCar(t.steal);
  else if (t.ride) { // Fahrzeug tauschen: dein Auto bleibt stehen, wo es ist (und man kann wieder zurücktauschen)
    const me = city.me, R = t.ride, old = { v: me.v, x: me.pos.x, z: me.pos.z, h: me.heading };
    switchCar(R.v);
    Object.assign(me.pos, { x: R.x, z: R.z }); me.heading = R.h;
    S.scene.remove(R.mesh);
    R.mesh = buildCar({ ...old.v, special: null }, city.kinds);
    R.mesh.position.set(old.x, groundAt(old.x, old.z), old.z); R.mesh.rotation.y = -old.h; S.scene.add(R.mesh);
    if (R.mesh.userData.driver) R.mesh.userData.driver.visible = false;
    Object.assign(R, old);
  } else if (t.parked || t.v) { // geparktes Auto oder Auto aus der Base: das bisherige Auto bleibt stehen, wo es ist
    const me = city.me, oldMesh = me.mesh, old = { v: me.v, x: me.pos.x, z: me.pos.z, h: me.heading };
    const P = t.parked, v = P ? P.v : t.v, at = P || t;
    if (P) removeParked(P);
    switchCar(v, true);
    Object.assign(me.pos, { x: at.x, z: at.z }); me.heading = at.h;
    parkHere(oldMesh, old.v, old.x, old.z, old.h);
  }
  if (city.me.mesh.userData.driver) city.me.mesh.userData.driver.visible = true;
  S.ui.walkbtn.textContent = '🚪';
  S.ui.walkbtn.classList.remove('ready');
  S.ui.flybtn.hidden = !city.canFly;
  S.ui.hint.textContent = HINT;
  showMsg('🚗 Eingestiegen', 1.2);
}
function stepWalk(dt) {
  const w = city.walk, input = city.input, me = city.me;
  if (city.sleep || city.movie || city.launch) return; // schläft, schaut einen Film oder fliegt mit der Rakete
  if (w.lift) { stepLift(w, dt); return; }
  if (w.ski) { stepSki(w, dt); return; }
  stepAir(w, dt); // springen, Backflip, hinfallen
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  w.turn = (w.turn || 0) + (steer - (w.turn || 0)) * Math.min(1, dt * 10); // weich drehen
  if (!w.air) w.h += w.turn * (Math.abs(w.speed) > 4.5 ? 2.2 : 3) * dt; // in der Luft dreht ⬅️➡️ die Figur (Pirouette)
  w.gasT = input.gas ? (w.gasT || 0) + dt : 0; // Gas lange halten = rennen (auch ohne Leertaste)
  const want = w.fallT > 0 ? 0 : input.gas ? (input.drift || w.gasT > 1.2 ? 8 : 3.8) : input.brake ? -2 : 0;
  w.speed += (want - w.speed) * Math.min(1, dt * (w.air ? 1 : want ? 6 : 10));
  const fx = Math.cos(w.h), fz = Math.sin(w.h);
  { const k = 1 / warpStretch(w.x, w.z, fx * w.speed, fz * w.speed); w.x += fx * w.speed * dt * k; w.z += fz * w.speed * dt * k; }
  const R = 0.35, push = (ox, oz, min) => {
    const dx = w.x - ox, dz = w.z - oz, dd = Math.hypot(dx, dz);
    if (dd < min && dd > 0.001) { w.x += dx / dd * (min - dd); w.z += dz / dd * (min - dd); }
  };
  for (const b of S.solid) { // Häuser, Bäume, Mauern, parkierte Autos
    const qx = Math.max(b.x0, Math.min(w.x, b.x1)), qz = Math.max(b.z0, Math.min(w.z, b.z1));
    push(qx, qz, R);
  }
  for (const o of S.round) push(o.x, o.z, R + o.r);
  for (const c of city.cars) if (!c.off) push(c.x, c.z, R + c.mesh.userData.radius * 0.7); // Autos schieben einen weg
  for (const p of people()) if (Math.abs(p.x - w.x) < 3 && Math.abs(p.z - w.z) < 3) push(p.x, p.z, R + 0.33); // nicht durch Menschen hindurch
  push(me.pos.x, me.pos.z, R + me.radius * 0.6);
  if (!allowedAt(w.x, w.z, 0.5)) { w.x = w.okX ?? w.x; w.z = w.okZ ?? w.z; } else { w.okX = w.x; w.okZ = w.z; }
  // Laufen: Beine und Arme schwingen
  w.gy = groundAt(w.x, w.z);
  animatePlayer(w, dt);
  // Welches Auto ist nah genug zum Einsteigen? Das eigene oder eines in der eigenen Base
  let best = null, bd = Infinity;
  const d0 = Math.hypot(me.pos.x - w.x, me.pos.z - w.z) - me.radius * 0.6;
  if (d0 < 1.6) { best = { me: true }; bd = d0; }
  const B = S.places.bases[city.baseSlot];
  if (B && B.on) B.bays.forEach((b, i) => {
    const v = city.base[i];
    if (!v || !b.mesh || !b.mesh.visible) return;
    const d = Math.hypot(b.x - w.x, b.z - w.z) - b.mesh.userData.length * 0.35;
    if (d < 1.6 && d < bd) { bd = d; best = { v, x: b.x, z: b.z, h: -b.ry }; }
  });
  for (const P of city.parked) { // geparkte eigene Autos
    if (!P.mesh) continue;
    const d = Math.hypot(P.x - w.x, P.z - w.z) - (P.mesh.userData.length || 4.5) * 0.35;
    if (d < 1.6 && d < bd) { bd = d; best = { parked: P }; }
  }
  if (!city.jail && !city.ticket) for (const c of city.cars) { // fremde Autos im Verkehr: klauen (gibt Alarm)
    if (!canSteal(c)) continue;
    const d = Math.hypot(c.x - w.x, c.z - w.z) - c.len * 0.35;
    if (d < 1.8 && d < bd) { bd = d; best = { steal: c, v: c.v }; }
  }
  for (const R of city.rides || []) { // Traktor (oder dein dafür abgestelltes Auto)
    const d = Math.hypot(R.x - w.x, R.z - w.z) - R.mesh.userData.length * 0.35;
    if (d < 1.6 && d < bd) { bd = d; best = { v: R.v, x: R.x, z: R.z, h: R.h, ride: R }; }
  }
  { const bs = city.boatAt || BOAT_HOME; // Boot an seinem Steg (Strand oder Diamantinsel)
    if (!city.boat && (nearPier(w.x, w.z) || nearMonPier(w.x, w.z)) && Math.hypot(w.x - bs.x, w.z - bs.z) < 13) { best = { boat: true }; bd = 0; } }
  for (const Lf of S.country.lifts) if (Math.hypot(w.x - Lf.A.x, w.z - Lf.A.z) < 12) { best = { lift: Lf }; bd = 0; } // Talstation eines Lifts
  const KS = S.places.kino && S.places.kino.seats;
  if (KS && w.x > KS.x0 && w.x < KS.x1 && w.z > KS.z0 && w.z < KS.z1) { best = { movie: true }; bd = 0; } // im Kino bei den Sitzen
  const RK = city.moonOn ? MOON_ROCKET : SPACE;
  if (Math.hypot(w.x - RK.x, w.z - RK.z) < 9) { best = { rocket: true }; bd = 0; } // Mondrakete
  const FL = S.areas.flyer;
  if (FL && !city.plane && Math.hypot(w.x - FL.x, w.z - FL.z) < 16) { best = { plane: true }; bd = 0; } // Flugzeug
  const HB = S.places.house && S.places.house.bed;
  if (HB && city.house.owned && Math.hypot(w.x - HB.x, w.z - HB.z) < 3) { best = { bed: true }; bd = 0; } // Bett im eigenen Haus
  if (best && (!w.target || w.target.v !== best.v || !!w.target.boat !== !!best.boat || !!w.target.lift !== !!best.lift || !!w.target.bed !== !!best.bed || !!w.target.plane !== !!best.plane || !!w.target.movie !== !!best.movie || !!w.target.rocket !== !!best.rocket))
    showMsg(best.lift ? best.lift.name + ' – X: einsteigen' : best.rocket ? (city.moonOn ? '🚀 Zurück zur Erde – X' : '🚀 Zum Mond fliegen – X') : best.movie ? '🍿 Film schauen – X' : best.plane ? '✈️ Flugzeug – X: einsteigen und fliegen' : best.bed ? '🛏️ Bett – X: schlafen' : best.lift ? '🚡 Sessellift – X: einsteigen und hinauffahren' : best.boat ? '🚤 Boot – einsteigen' : best.steal ? '😈 ' + ((city.kinds[best.v.kind] || {}).name || 'Auto') + ' – X: klauen (gibt Alarm!)' : best.v ? '🔑 ' + vname(best.v) + ' – 🚗 einsteigen' : '🚗 Einsteigen?', 1.2);
  w.target = best;
  S.ui.walkbtn.classList.toggle('ready', !!best);
}

// ---------- Fangis (nur online) ----------
// Im Raum steht tag = { it: Platz, der dran ist (−1 = kein Spiel), by: wer zuletzt gefangen hat, t }.
// Wer dran ist, prüft selbst, ob er jemanden berührt, und gibt „dran“ weiter (zurückfangen erst nach 3 s).
// Die Höhe zählt nicht: wer fliegt, kann gefangen werden, wenn jemand genau darunter fährt (sonst wäre er unfangbar).
function tagState() {
  const tag = city.net && city.net.tag();
  return tag && tag.it >= 0 && (city.net.players() || {})[tag.it] ? tag : null;
}
function toggleTag() {
  if (!city.net) return;
  if (tagState()) { city.net.setTag(-1); showMsg('🏃 Fangis beendet', 1.6); }
  else { city.net.setTag(city.net.mySlot); showMsg('🏃 Fangis! Du bist zuerst dran – fang jemanden!', 2.4); }
}
function stepTag(dt) {
  if (!city.net) return;
  const tag = tagState(), me = city.me, ui = S.ui;
  ui.tagbtn.textContent = tag ? '🛑' : '🏃';
  if (!tag) { ui.tagbar.hidden = true; city.netCars.setIt(null); city.lastIt = -1; return; }
  const mine = tag.it === city.net.mySlot, players = city.net.players() || {};
  city.netCars.setIt(mine ? null : tag.it);
  ui.tagbar.hidden = false;
  ui.tagbar.classList.toggle('me', mine);
  ui.tagbar.textContent = mine ? '🏃 DU BIST DRAN! Fang jemanden!' : '🏃 ' + ((players[tag.it] || {}).name || '?') + ' ist dran – lauf weg!';
  if (city.lastIt !== tag.it) {
    if (mine && city.lastIt >= 0) { showMsg('😱 Erwischt! Jetzt bist DU dran!', 2); horn(0.6, 0.25, 1.3); }
    city.lastIt = tag.it; city.tagCD = 1;
  }
  if (!mine || (city.tagCD -= dt) > 0) return;
  for (const o of city.netCars.list()) {
    if (o.slot === tag.by && city.net.serverNow() - tag.t < 3000) continue; // nicht gleich zurückfangen
    if (Math.hypot(o.x - me.pos.x, o.z - me.pos.z) < (me.radius + o.r) * 1.05) {
      city.net.setTag(o.slot);
      city.tagCD = 1.5;
      showMsg('🏃 Erwischt: ' + o.name + '!', 1.8);
      window.beep && window.beep(880, 0.15, 'square', 0.05);
      break;
    }
  }
}

// ---------- Autohändler ----------
// Vor dem Ausstellungsraum anhalten: Gebrauchtwagen kaufen (die drei auf den Drehtellern) oder das eigene Auto verkaufen.
// Gekauft wird mit den Münzen aus dem Spiel (dealer von game.js); das neue Auto fährt man gleich weg.
const wholeOffer = () => { const o = city.dealer.offers()[0]; return { v: o.v, cost: Math.round(o.price / 2) }; }; // Einkaufspreis = Wert
function setupDealer() {
  city.offers = city.dealer ? city.dealer.offers().concat(city.dealer.offers()) : []; // sechs Plätze
  city.shop = city.dealer ? loadShop() : { on: false, stock: [], orders: [] };
  city.whole = city.dealer ? Array.from({ length: 6 }, wholeOffer) : [];
  city.truckT = 6; // schon Bestelltes kommt bald
  showPods();
}
function stepDealer(dt) {
  const D = S.places.dealer, me = city.me;
  for (const p of D.pods) p.rotation.y += dt * 0.4;
  // vor den Drehtellern anhalten (im Auto oder zu Fuss) oder drinnen zum Schreibtisch gehen
  const w = city.walk, x = w ? w.x : me.pos.x, z = w ? w.z : me.pos.z;
  const at = inZone(D, x, z) || (!!w && inZone(D.desk, x, z));
  const here = at && (w || (Math.abs(me.speed) < 1.5 && me.alt < 2));
  if (here && !city.dealOpen && city.dealT === 0) openDealer();
  if (!at && !inZone(D, x, z, 4) && !(w && inZone(D.desk, x, z, 2))) { city.dealT = 0; if (city.dealOpen) closeDealer(); }
  S.ui.shopbtn.hidden = !at || city.dealOpen || !city.dealer; // nach dem Schliessen wieder öffnen
}
function openDealer() {
  if (!city.dealer) { showMsg('🚗 Online ist der Autohändler geschlossen', 1.8); city.dealT = 1; return; }
  city.dealOpen = true; city.dealT = 1; drawDealer();
}
function closeDealer() { city.dealOpen = false; S.ui.dealpanel.hidden = true; }
function drawDealer() {
  if (city.shop.on) { drawShop(); return; }
  const p = S.ui.dealpanel, K = city.kinds, D = city.dealer, coins = D.coins();
  p.textContent = '';
  const h = document.createElement('h3'); h.textContent = '🚗 Autohändler · du hast ' + coins + ' 🪙';
  const grid = document.createElement('div'); grid.className = 'cars';
  city.offers.forEach((o, k) => {
    const b = document.createElement('button'), dot = document.createElement('i'), name = document.createElement('span'), ps = document.createElement('small');
    b.dataset.buy = k; b.disabled = !!o.sold || coins < o.price;
    dot.style.background = o.v.color;
    name.textContent = vname(o.v) + ' · ⚡ ' + o.v.ps;
    ps.textContent = o.sold ? 'verkauft' : o.price + ' 🪙';
    b.append(dot, name, ps); grid.append(b);
  });
  const row = document.createElement('div'); row.className = 'row';
  const value = D.value(city.me.v.id), sell = document.createElement('button'), close = document.createElement('button');
  sell.dataset.act = 'sell'; sell.disabled = !value;
  sell.textContent = value ? '💰 ' + vname(city.me.v) + ' verkaufen: +' + value + ' 🪙' : '💰 Dieses Auto kann man nicht verkaufen';
  close.dataset.act = 'close'; close.textContent = '✕ Schliessen';
  const own = document.createElement('button');
  own.dataset.act = 'shopon'; own.textContent = '🧑‍💼 Selber Autohändler sein';
  row.append(sell, close);
  const row2 = document.createElement('div'); row2.className = 'row'; row2.append(own);
  p.append(h, grid, row, row2);
  p.hidden = false;
}
function onDealerClick(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled || !city || !city.dealer) return;
  if (onPanelClick(b)) return;
  if (onHouseClick(b)) return;
  if (b.dataset.act === 'close') { closeDealer(); return; }
  if (onShopClick(b)) return;
  const D = S.places.dealer, out = () => { Object.assign(city.me.pos, { x: D.x, z: D.z - 3 }); city.me.heading = -Math.PI / 2; };
  if (b.dataset.act === 'sell') {
    const old = city.me.v, res = city.dealer.sell(old.id);
    if (typeof res === 'string') { showMsg(res, 2.2); return; }
    loadBase();
    const next = city.base[0] || city.garage.all()[0];
    closeDealer();
    if (next) { switchCar(next); out(); }
    showMsg('💰 ' + vname(old) + ' verkauft: +' + res + ' 🪙', 2.4);
    return;
  }
  const o = city.offers[+b.dataset.buy];
  if (!o || o.sold || !city.dealer.buy(o)) return;
  o.sold = true;
  if (o.mesh) o.mesh.parent.remove(o.mesh);
  closeDealer();
  switchCar(o.v); out();
  showMsg('🔑 Gekauft! Dein neuer ' + vname(o.v) + ' gehört dir.', 2.6);
  window.beep && window.beep(784, 0.12, 'triangle', 0.07); window.beep && window.beep(1175, 0.25, 'triangle', 0.07, 0.12);
}

// ---------- Eigenes Autohaus ----------
// Beim Autohändler „Selber Autohändler sein“: beim Grosshandel Autos einkaufen (Einkaufspreis = Wert) und auf die drei
// Drehteller stellen. Dann kommen Kunden zu Fuss ins Geschäft und wollen eine Beratung: aussteigen, hingehen, 💬.
// Jeder Kunde hat einen Wunsch; passt das Auto und der Preis, kauft er (und fährt damit weg), sonst geht er wieder.
// Die ausgestellten Autos bleiben gespeichert (Spielstand autoRetterShop).
const SHOP_KEY = 'autoRetterShop', SHOP_SLOTS = 6;
const BIG = ['van', 'minivan', 'kombi', 'camper', 'schoolbus', 'doubledecker', 'jeep', 'safari', 'offroad', 'pickup', 'delivery', 'umzug', 'caravan', 'hippie', 'postauto', 'parcel'];
const SPORTY = ['sports', 'muscle', 'coupe', 'roadster', 'racer', 'rally', 'hyper', 'nightracer', 'cabrio', 'stockcar', 'gokart', 'dragster', 'lowrider'];
const WISHES = {
  fast: { text: 'Ich suche ein richtig schnelles Auto! 🏎️', ok: (v, k) => v.ps >= 60 },
  cheap: { text: 'Ich habe nicht viel Geld. Was ist günstig? 💸', ok: (v, k, price) => price <= 20 },
  big: { text: 'Wir sind eine grosse Familie – wir brauchen Platz! 👨‍👩‍👧‍👦', ok: v => BIG.includes(v.kind) },
  sporty: { text: 'Ich will ein sportliches Auto! 😎', ok: v => SPORTY.includes(v.kind) },
  color: { text: '', ok: (v, k, p, c) => colorName(v.color) === c.color },
};
// Farbe als Wort (für den Wunsch „ein rotes Auto“)
function colorName(hex) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  if (hsl.l < 0.18) return 'schwarz';
  if (hsl.l > 0.85) return 'weiss';
  if (hsl.s < 0.18) return 'grau';
  const h = hsl.h * 360;
  return h < 15 || h >= 340 ? 'rot' : h < 45 ? 'orange' : h < 70 ? 'gelb' : h < 165 ? 'grün' : h < 255 ? 'blau' : h < 300 ? 'lila' : 'rosa';
}
const COLOR_ADJ = { schwarz: 'schwarzes', weiss: 'weisses', grau: 'graues', rot: 'rotes', orange: 'oranges', gelb: 'gelbes', 'grün': 'grünes', blau: 'blaues', lila: 'lila', rosa: 'rosa' };
const shopPrice = (o, kind = 'normal') => Math.max(2, Math.round(o.cost * { cheap: 1.6, normal: 2, high: 3 }[kind]));
function loadShop() {
  let sh = null;
  try { sh = JSON.parse(localStorage.getItem(SHOP_KEY)); } catch (err) { /* kaputt oder ohne Speicher */ }
  sh = { on: false, stock: [], orders: [], ...(sh || {}) };
  sh.stock = Array.from({ length: SHOP_SLOTS }, (_, k) => sh.stock[k] || null); // feste Plätze (leer = null)
  for (const o of sh.stock) if (o && o.v) o.v.kind = realKind(o.v.kind); // nur echte Autos
  return sh;
}
const stockCount = () => city.shop.stock.filter(Boolean).length;
function saveShop() { // nur Fahrzeug und Einkaufspreis (nicht die 3D-Form)
  const plain = list => list.map(o => o && { v: o.v, cost: o.cost });
  try { localStorage.setItem(SHOP_KEY, JSON.stringify({ on: city.shop.on, stock: plain(city.shop.stock), orders: plain(city.shop.orders) })); } catch (err) { /* ohne Speicher */ }
}

// Drehteller: im eigenen Autohaus die eigenen Autos, sonst die Angebote des Händlers
// Plätze 0–2: Drehteller draussen, 3–5: drinnen im Ausstellungsraum
function showPods() {
  const D = S.places.dealer, list = city.shop.on ? city.shop.stock : city.offers;
  if (!D.inGroup) { D.inGroup = new THREE.Group(); S.scene.add(D.inGroup); }
  D.inGroup.clear();
  for (let k = 0; k < SHOP_SLOTS; k++) {
    const o = list[k];
    if (k < 3) D.pods[k].clear();
    if (!o || o.sold) continue;
    const m = buildCar({ ...o.v, kind: city.kinds[o.v.kind] ? o.v.kind : 'car' }, city.kinds);
    if (k < 3) { m.position.y = 0.15; D.pods[k].add(m); }
    else { const p = D.inside[k - 3]; m.position.set(p.x, 0.23, p.z); m.rotation.y = Math.PI / 2 - 0.5; D.inGroup.add(m); } // schräg zur Tür
    o.mesh = m;
  }
}
function drawShop() {
  const p = S.ui.dealpanel, K = city.kinds, coins = city.dealer.coins(), sh = city.shop;
  p.textContent = '';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  p.append(el('h3', '', '🧑‍💼 Dein Autohaus · ' + coins + ' 🪙'));
  p.append(el('p', 'note', 'Ausgestellt (' + stockCount() + ' / ' + SHOP_SLOTS + ': 3 draussen, 3 drinnen) – Kunden kommen vorbei und wollen beraten werden. Verkaufspreis normal: das Doppelte vom Einkauf.'));
  if (sh.orders.length) p.append(el('p', 'note', '🚚 Bestellt, der Lieferant bringt sie bald: ' + sh.orders.map(o => vname(o.v)).join(', ')));
  const mine = el('div', 'cars');
  sh.stock.forEach((o, k) => {
    if (!o) return;
    const b = el('button'), dot = el('i');
    b.dataset.back = k; dot.style.background = o.v.color;
    b.append(dot, el('span', '', vname(o.v) + ' · ⚡ ' + o.v.ps), el('small', '', '↩ ' + o.cost + ' 🪙'));
    mine.append(b);
  });
  if (!stockCount()) mine.append(el('p', 'note', 'Noch nichts ausgestellt – bestell unten etwas!'));
  p.append(mine, el('h3', '', '📦 Bestellen beim Grosshandel'));
  if (stockCount() + sh.orders.length >= SHOP_SLOTS) p.append(el('p', 'note', '⚠️ Alle 6 Plätze sind voll (oder schon bestellt) – verkauf zuerst ein Auto oder gib eins zurück (↩).'));
  else if (city.whole.every(o => coins < o.cost)) p.append(el('p', 'note', '⚠️ Zu wenig Münzen für den Grosshandel.'));
  const buy = el('div', 'cars');
  city.whole.forEach((o, k) => {
    const b = el('button'), dot = el('i');
    b.dataset.whole = k; b.disabled = o.sold || coins < o.cost || stockCount() + sh.orders.length >= SHOP_SLOTS;
    dot.style.background = o.v.color;
    b.append(dot, el('span', '', vname(o.v) + ' · ⚡ ' + o.v.ps), el('small', '', o.sold ? 'gekauft' : o.cost + ' 🪙'));
    buy.append(b);
  });
  const row = el('div', 'row'), off = el('button', '', '🚗 Normaler Händler'), close = el('button', '', '✕ Schliessen');
  off.dataset.act = 'shopoff'; close.dataset.act = 'close';
  row.append(off, close);
  p.append(buy, row);
  p.hidden = false;
}
function onShopClick(b) {
  const sh = city.shop;
  if (b.dataset.act === 'shopoff') { sh.on = false; saveShop(); clearCustomers(); showPods(); drawDealer(); return true; }
  if (b.dataset.act === 'shopon') {
    sh.on = true; saveShop(); showPods();
    drawShop(); return true;
  }
  if (b.dataset.whole !== undefined) {
    const o = city.whole[+b.dataset.whole];
    if (!o || o.sold || stockCount() + sh.orders.length >= SHOP_SLOTS || city.dealer.coins() < o.cost) return true;
    city.pay(o.cost);
    sh.orders.push({ v: o.v, cost: o.cost });
    city.whole[+b.dataset.whole] = wholeOffer(); // der Grosshandel hat immer Nachschub
    if (!city.truck) city.truckT = TRUCK_DELAY;
    saveShop(); drawShop();
    showMsg('📦 Bestellt! Der Lieferant kommt bald.', 1.8);
    return true;
  }
  if (b.dataset.back !== undefined) { // zurückgeben: Einkaufspreis zurück
    const o = sh.stock[+b.dataset.back];
    sh.stock[+b.dataset.back] = null;
    if (o) city.earn(o.cost);
    saveShop(); showPods(); drawShop();
    return true;
  }
  return false;
}

// Lieferung: bestellte Autos bringt der Autotransporter. Er kommt über die Strasse vor dem Autohaus, hält an,
// lädt ab (die Autos stehen dann auf freien Plätzen) und fährt weiter.
const TRUCK_DELAY = 20;
function stepDelivery(dt) {
  const sh = city.shop, D = S.places.dealer;
  if (!city.truck) {
    if (!sh.orders.length || (city.truckT -= dt) > 0) return;
    const j = Math.round((D.z - 20) / BLOCK + N / 2), z = node(j) + LANE;
    const mesh = buildCar({ kind: 'carrier', color: '#f59e0b', special: null }, city.kinds);
    S.scene.add(mesh);
    city.truck = { mesh, x: node(0) - 20, z, h: 0, speed: 12, len: mesh.userData.length, stopX: D.x - 2, state: 'come', t: 0 };
    showMsg('🚚 Der Lieferant ist unterwegs!', 2.2);
  }
  const T = city.truck, me = city.me;
  let want = 12;
  if (T.state === 'come') want = Math.min(12, Math.max(0, (T.stopX - T.x) * 0.6));
  else if (T.state === 'unload') { want = 0; if ((T.t -= dt) <= 0) T.state = 'go'; }
  want = Math.min(want, followLimit(T, me).lim); // nicht auffahren
  T.speed += Math.max(-8 * dt, Math.min(3 * dt, want - T.speed));
  T.x += T.speed * dt;
  T.stuck = T.speed < 0.3 ? (T.stuck || 0) + dt : 0;
  if (T.state === 'come' && T.speed < 0.5 && (T.x > T.stopX - 0.3 || (T.stuck > 2 && T.x > T.stopX - 40))) { // da (oder kurz davor blockiert): abladen
    T.state = 'unload'; T.t = 3;
    const n = sh.orders.length;
    for (const o of sh.orders) { const k = sh.stock.indexOf(null); if (k >= 0) sh.stock[k] = o; } // auf freie Plätze
    sh.orders = [];
    saveShop(); showPods();
    for (let k = 0; k < 14; k++) S.fx.puff(T.x + (Math.random() - 0.5) * 8, 1, T.z + (Math.random() - 0.5) * 3, 0, 0);
    if (Math.hypot(me.pos.x - T.x, me.pos.z - T.z) < 200) showMsg('🚚 Lieferung ist da: ' + n + (n === 1 ? ' Auto' : ' Autos') + ' ausgestellt!', 2.6);
    window.beep && window.beep(660, 0.1, 'triangle', 0.06); window.beep && window.beep(880, 0.16, 'triangle', 0.06, 0.1);
  }
  if (T.state === 'go' && T.x > node(N) + 30) { S.scene.remove(T.mesh); city.truck = null; } // am Stadtrand verschwinden
  const m = T.mesh;
  m.position.set(T.x, 0, T.z); m.rotation.y = -T.h;
  for (const w of m.userData.wheels) w.rotation.z -= T.speed * dt / 0.35;
}

// Kunden: kommen vom Trottoir, warten vor den Drehtellern auf Beratung, gehen nach einer Weile wieder
const SHIRTS_C = [0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0ea5e9, 0xf472b6, 0x334155, 0xffffff];
const HAIR_C = [0x2b1a10, 0x6b4423, 0xd9b26f, 0x111111, 0x9ca3af, 0x8a3b12];
const SKIN_C = [0xf2c9a0, 0xe0ac7e, 0xc68642, 0x8d5524, 0xffdbac];
function bubble(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath();
  if (g.roundRect) g.roundRect(4, 4, 504, 92, 30); else g.rect(4, 4, 504, 92);
  g.fill();
  g.beginPath(); g.moveTo(236, 94); g.lineTo(256, 112); g.lineTo(276, 94); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 52, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  sp.scale.set(2.6, 0.57, 1); sp.position.y = 2.35; sp.renderOrder = 5;
  return sp;
}
function say(cu, text) {
  if (cu.bubble) cu.mesh.remove(cu.bubble);
  cu.bubble = text ? bubble(text) : null;
  if (cu.bubble) cu.mesh.add(cu.bubble);
}
function clearCustomers() {
  for (const cu of city.customers) S.scene.remove(cu.mesh);
  city.customers = [];
  closeTalk();
}
function spawnCustomer() {
  const D = S.places.dealer, sh = city.shop, pick = a => a[Math.floor(Math.random() * a.length)];
  // schaut sich ein ausgestelltes Auto an, das noch kein anderer Kunde anschaut (draussen oder drinnen)
  const free = sh.stock.map((o, k) => k).filter(k => sh.stock[k] && !city.customers.some(c => c.slot === k));
  if (!free.length) return;
  const slot = pick(free), inside = slot >= 3, P = inside ? D.inside[slot - 3] : { x: D.x + [-10, 0, 10][slot], z: D.z + 8 };
  const goal = inside ? { x: P.x, z: P.z - 4.6 } : P;
  const path = inside ? [{ x: D.door.x, z: D.door.z - 2 }, { x: D.door.x, z: D.door.z + 2 }, goal] : [goal]; // drinnen: durch die Tür
  let wish = pick(Object.keys(WISHES)), color = '';
  if (wish === 'color') color = colorName(pick(sh.stock.filter(Boolean)).v.color); // meistens gibt es die Farbe
  const x = D.x + (Math.random() - 0.5) * 24, z = D.z - 12; // kommt vom Trottoir
  const cu = { x, z, h: Math.PI / 2, speed: 0, phase: 0, slot, inside, path, state: 'come', wish, color, wait: 60,
    mesh: makePerson(pick(SHIRTS_C), pick(HAIR_C), pick(SKIN_C)) };
  S.scene.add(cu.mesh);
  city.customers.push(cu);
}
function stepShop(dt) {
  const sh = city.shop, D = S.places.dealer, me = city.me, near = Math.hypot(me.pos.x - D.x, me.pos.z - D.z) < 160;
  if (sh.on && stockCount() && near && city.customers.length < 2 && (city.custT -= dt) <= 0) {
    city.custT = 18 + Math.random() * 20;
    spawnCustomer();
    if (city.customers.length === 1) showMsg('🛎️ Ein Kunde kommt ins Autohaus!', 2);
  }
  for (const cu of [...city.customers]) {
    if (cu.state === 'come' || cu.state === 'leave') {
      const t = cu.path[0], dx = t.x - cu.x, dz = t.z - cu.z, d = Math.hypot(dx, dz);
      cu.h = Math.atan2(dz, dx); cu.speed = 1.6;
      if (d < 0.3) {
        cu.path.shift();
        if (cu.path.length) continue;
        cu.speed = 0;
        if (cu.state === 'leave') { S.scene.remove(cu.mesh); city.customers.splice(city.customers.indexOf(cu), 1); continue; }
        cu.state = 'wait'; cu.h = -Math.PI / 2; say(cu, '💬 Beratung bitte!'); // schaut zum Eingang
      } else { cu.x += dx / d * cu.speed * dt; cu.z += dz / d * cu.speed * dt; }
    } else if (cu.state === 'wait' && (cu.wait -= dt) <= 0) leaveCustomer(cu, '😤 Zu lange gewartet!');
    animatePerson(cu, dt);
  }
  // Zu Fuss neben einem wartenden Kunden? Dann kann man beraten
  const w = city.walk;
  city.talkTo = w ? city.customers.find(cu => cu.state === 'wait' && Math.hypot(cu.x - w.x, cu.z - w.z) < 2.6) : null;
  S.ui.talkbtn.hidden = !city.talkTo || !S.ui.talkpanel.hidden;
  if (!w && city.customers.some(cu => cu.state === 'wait') && Math.hypot(me.pos.x - D.x, me.pos.z - D.z) < 30 && city.custMsgT <= 0) {
    showMsg('🚪 Steig aus und geh zum Kunden, um ihn zu beraten', 2.2); city.custMsgT = 12;
  }
  city.custMsgT -= dt;
}
function leaveCustomer(cu, text) {
  const D = S.places.dealer, out = { x: cu.x + (Math.random() - 0.5) * 10, z: D.z - 12 };
  cu.state = 'leave'; cu.path = cu.inside ? [{ x: D.door.x, z: D.door.z + 2 }, { x: D.door.x, z: D.door.z - 2 }, out] : [out];
  say(cu, text);
}
// Beratungsgespräch: Wunsch hören, Auto zeigen, Preis sagen
function startTalk() {
  const cu = city.talkTo;
  if (!cu) return;
  cu.state = 'talk';
  if (city.walk) cu.h = Math.atan2(city.walk.z - cu.z, city.walk.x - cu.x); // schaut dich an
  city.talk = { cu, pick: null };
  say(cu, '🙂');
  drawTalk();
}
function closeTalk() { if (S.ui.talkpanel) S.ui.talkpanel.hidden = true; city.talk = null; }
function drawTalk() {
  const T = city.talk, p = S.ui.talkpanel, K = city.kinds, cu = T.cu;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  p.textContent = '';
  const wish = cu.wish === 'color' ? 'Ich hätte gern ein ' + COLOR_ADJ[cu.color] + ' Auto! 🎨' : WISHES[cu.wish].text;
  p.append(el('h3', '', '🧑 Kunde: „' + wish + '“'));
  const grid = el('div', 'cars');
  if (!T.pick) {
    p.append(el('p', 'note', 'Welches Auto zeigst du?'));
    city.shop.stock.forEach((o, k) => {
      if (!o) return;
      const b = el('button'), dot = el('i');
      b.dataset.show = k; dot.style.background = o.v.color;
      b.append(dot, el('span', '', vname(o.v) + ' · ⚡ ' + o.v.ps), el('small', '', colorName(o.v.color)));
      grid.append(b);
    });
  } else {
    p.append(el('p', 'note', 'Und zu welchem Preis? (Einkauf: ' + T.pick.cost + ' 🪙)'));
    for (const [kind, label] of [['cheap', '🏷️ Rabatt'], ['normal', '💰 Normal'], ['high', '💎 Teuer']]) {
      const b = el('button');
      b.dataset.price = kind;
      b.append(el('span', '', label), el('small', '', shopPrice(T.pick, kind) + ' 🪙'));
      grid.append(b);
    }
  }
  const row = el('div', 'row'), bye = el('button', '', '👋 Tschüss');
  bye.dataset.act = 'bye';
  row.append(bye);
  p.append(grid, row);
  p.hidden = false;
}
function onTalkClick(e) {
  const b = e.target.closest('button'), T = city && city.talk;
  if (!b || !T) return;
  const cu = T.cu;
  if (b.dataset.act === 'bye') { closeTalk(); leaveCustomer(cu, '👋 Tschüss!'); return; }
  if (b.dataset.show !== undefined) { T.pick = city.shop.stock[+b.dataset.show]; say(cu, '🤔 Hmm …'); drawTalk(); return; }
  if (!b.dataset.price || !T.pick) return;
  // Entscheiden: passt das Auto zum Wunsch? Wie ist der Preis?
  const o = T.pick, kind = b.dataset.price, price = shopPrice(o, kind);
  const fits = WISHES[cu.wish].ok(o.v, city.kinds[o.v.kind] || {}, shopPrice(o, 'normal'), cu);
  const chance = Math.max(0.05, Math.min(0.95, 0.2 + (fits ? 0.5 : 0) + { cheap: 0.25, normal: 0, high: -0.3 }[kind]));
  closeTalk();
  if (Math.random() < chance) {
    const i = city.shop.stock.indexOf(o);
    if (i >= 0) city.shop.stock[i] = null; // Platz wird frei, die anderen bleiben stehen
    saveShop(); showPods();
    city.earn(price);
    city.sold = (city.sold || 0) + 1;
    showMsg('🤝 Verkauft! +' + price + ' 🪙  (Gewinn ' + (price - o.cost) + ')', 2.6);
    window.beep && window.beep(784, 0.12, 'triangle', 0.07); window.beep && window.beep(1175, 0.25, 'triangle', 0.07, 0.12);
    S.scene.remove(cu.mesh); city.customers.splice(city.customers.indexOf(cu), 1);
    driveAway(o.v);
  } else leaveCustomer(cu, !fits ? '😕 Nicht, was ich suche' : kind === 'high' ? '😬 Viel zu teuer!' : '🤔 Ich überleg es mir …');
}
// Der Kunde fährt mit dem neuen Auto los: es fährt ab jetzt im Verkehr mit (ein weit entferntes Auto verschwindet dafür)
function driveAway(v) {
  const D = S.places.dealer, i = Math.round(D.x / BLOCK + N / 2 - 0.5), j = Math.round((D.z - 20) / BLOCK + N / 2);
  const c = makeCar(city.kinds, Math.max(0, Math.min(N - 1, i)), Math.max(0, Math.min(N, j)), 0, BLOCK / 2, { kind: v.kind, color: v.color, special: null });
  placeOnSegment(c);
  S.scene.add(c.mesh);
  const far = city.cars.findIndex(o => !(o.wreck > 0) && !o.lot && Math.hypot(o.x - city.me.pos.x, o.z - city.me.pos.z) > 200);
  if (far >= 0) { S.scene.remove(city.cars[far].mesh); city.cars.splice(far, 1); }
  city.cars.push(c);
}

// ---------- Einparken und Fahrschule ----------
// Parkplatz vor der Werkstatt: ein paar Autos stehen schon da (fest, mit Rand). Einparken: ins gelbe Feld, gerade
// stehen, anhalten – ohne ein Auto anzufahren. Fahrschule: vier Punkte abfahren, dabei Tempo einhalten, bei Rot
// halten und keinen Unfall bauen; bestanden = Führerschein (gespeichert) und Münzen.
const LOT_KINDS = ['car', 'kompakt', 'kombi', 'hatch', 'coupe', 'minivan', 'smart']; // nur echte Autos
const LOT_TAKEN = [0, 1, 3, 5, 6];
function parkLotCars() {
  if (S.lotCars) return;
  S.lotCars = [];
  for (const k of LOT_TAKEN) {
    const lk = LOT_KINDS.filter(realTraffic), b = S.places.lot.bays[k], kind = lk[Math.floor(Math.random() * lk.length)] || 'car';
    const m = buildCar({ kind, color: COLORS[Math.floor(Math.random() * COLORS.length)], special: null }, city.kinds);
    m.position.set(b.x, 0.17, b.z); m.rotation.y = -b.h;
    S.scene.add(m);
    const hl = m.userData.length / 2;
    S.solid.push({ x0: b.x - 1.05, x1: b.x + 1.05, z0: b.z - hl, z1: b.z + hl, h: 2, lot: true });
    S.lotCars.push(m);
  }
}
function parkSpot(b) { // gelbes Feld, leuchtet
  if (!S.parkSpot) {
    S.parkSpot = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.45, depthWrite: false }));
    S.scene.add(S.parkSpot);
  }
  S.parkSpot.position.set(b.x, 0.22, b.z);
  S.parkSpot.visible = true;
}
function stepPark(M, dt) {
  const me = city.me, b = M.bay, dx = me.pos.x - b.x, dz = me.pos.z - b.z;
  const ax = Math.cos(b.h), az = Math.sin(b.h), along = dx * ax + dz * az, lat = -dx * az + dz * ax;
  let dh = Math.abs(((me.heading - b.h) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2); // vorwärts oder rückwärts drin
  S.parkSpot.material.opacity = 0.3 + 0.2 * Math.sin(city.t * 6);
  if (city.touchLot) { city.touchLot = false; endMission(false, '💥 Angefahren! Einparken nicht bestanden.'); return; }
  const inside = Math.abs(lat) < 0.55 && Math.abs(along) < 0.9 && dh < 0.25;
  M.hold = inside && Math.abs(me.speed) < 0.3 ? M.hold + dt : 0;
  M.text = inside ? '🅿️ Gut so – jetzt anhalten!' : '🅿️ Park im gelben Feld';
  if (M.hold > 1) {
    const coins = M.timer > 30 ? 15 : 10;
    endMission(true, '🅿️ Perfekt eingeparkt!', coins);
  }
}
function failSchool(reason) { if (city.mission && city.mission.type === 'school') endMission(false, '🎓 Durchgefallen: ' + reason); }
function stepSchool(M, dt) {
  const me = city.me, kmh = Math.abs(me.speed) * 3.6;
  if (me.fly) { failSchool('Fliegen gilt nicht ✈️'); return; }
  M.over = city.limit && kmh > city.limit + 3 ? M.over + dt : 0;
  if (M.over > 1) { failSchool('Zu schnell gefahren 🚨'); return; }
  if (Math.hypot(M.target.x - me.pos.x, M.target.z - me.pos.z) < 8) {
    M.step++;
    if (M.step >= M.points.length) {
      try { localStorage.setItem('autoRetterLicense', '1'); } catch (err) { /* ohne Speicher */ }
      endMission(true, '🎓 Bestanden! Du hast den Führerschein!', 15);
      return;
    }
    M.target = M.points[M.step];
    marker().set(M.target.x, M.target.z, M.color);
    window.beep && window.beep(988, 0.1, 'triangle', 0.06);
  }
  M.text = '🎓 Prüfung: Punkt ' + (M.step + 1) + ' von ' + M.points.length + (city.limit ? ' · max. ' + city.limit : '');
}

// ---------- Goldene Schlüssel ----------
// 30 Schlüssel, immer an denselben Orten: auf Dächern (nur fliegend erreichbar), in Parks, an der Autobahn und an
// besonderen Orten. Jeder gibt 5 Münzen; mit genug Schlüsseln öffnen sich neue Gebiete (KEY_GOALS).
// Gefundene stehen im Spielstand autoRetterKeys.
const KEYS_KEY = 'autoRetterKeys', KEY_COUNT = 30;
const KEY_GOALS = [[5, '⚓ Der Hafen ist offen!'], [12, '✈️ Der Flughafen ist offen!'], [20, '⛰️ Die Passstrasse ist offen!'], [30, '👑 Alle Schlüssel! Du bist der Schatzmeister der Stadt!']];
function loadKeys() { try { return new Set(JSON.parse(localStorage.getItem(KEYS_KEY)) || []); } catch (err) { return new Set(); } }
function saveKeys() { try { localStorage.setItem(KEYS_KEY, JSON.stringify([...city.keys])); } catch (err) { /* ohne Speicher */ } }
function keySpots() {
  const r = rng(2026), P = S.places, spots = [];
  const roofs = S.solid.filter(b => b.h > 9 && b.h < 60 && b.x1 - b.x0 > 8 && b.z1 - b.z0 > 8 && b.x0 < 1e8);
  for (let k = 0; k < 10 && roofs.length; k++) { // Dächer
    const b = roofs.splice(Math.floor(r() * roofs.length), 1)[0];
    spots.push({ x: (b.x0 + b.x1) / 2, y: b.h + 1.3, z: (b.z0 + b.z1) / 2, roof: true });
  }
  const parks = [...S.parks];
  for (let k = 0; k < 6; k++) { // Parks: in einer Ecke der Wiese
    const [bi, bj] = parks[k % parks.length].split(',').map(Number), cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2;
    spots.push({ x: cx + (k % 2 ? 14 : -14), y: 1.2, z: cz + (k % 3 ? 14 : -14) });
  }
  for (const [s, lat] of [[900, 16], [1500, -16], [2600, 16], [3500, -16], [4400, 16]]) { // Autobahn: auf dem Pannenstreifen
    const p = hwPoint(s);
    spots.push({ x: p.x - p.tz * lat, y: 1.2, z: p.z + p.tx * lat });
  }
  spots.push({ x: P.gas.x, y: 7.2, z: P.gas.z }); // auf dem Tankstellendach
  spots.push({ x: P.repair.x, y: 1.2, z: P.repair.z + 4 }); // in der Werkstatt
  spots.push({ x: P.dealer.desk.x + 3, y: 1.2, z: P.dealer.desk.z }); // im Autohaus
  spots.push({ x: P.wash.x, y: 1.2, z: P.wash.z }); // in der Waschanlage
  spots.push({ x: P.jail.x, y: 1.2, z: P.jail.z - P.jail.half - 12 }); // vor dem Gefängnis
  spots.push({ x: P.hospital.x + 14, y: 1.2, z: P.hospital.z }); // beim Spital
  for (let k = 0; spots.length < KEY_COUNT && k < 200; k++) { // Rest: irgendwo auf dem Trottoir
    const i = Math.floor(r() * N), j = Math.floor(r() * N), x = node(i) + 9.5, z = node(j) + 14 + r() * 30;
    if (!S.solid.some(b => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) spots.push({ x, y: 1.2, z });
  }
  return spots.slice(0, KEY_COUNT).map((p, id) => ({ ...p, id }));
}
function keyMesh() {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.2, emissive: 0x6b4d00, emissiveIntensity: 0.8 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 10, 24), gold); ring.position.y = 0.45;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.08), gold); shaft.position.y = -0.2;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.08), gold); t1.position.set(0.15, -0.5, 0);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), gold); t2.position.set(0.12, -0.3, 0);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(ring, shaft, t1, t2, glow);
  g.scale.setScalar(1.3);
  return g;
}
function setupKeys() {
  if (!S.keySpots) S.keySpots = keySpots();
  if (S.keyMeshes) for (const m of S.keyMeshes) S.scene.remove(m);
  city.keys = loadKeys();
  S.keyMeshes = S.keySpots.map(p => {
    const m = keyMesh();
    m.position.set(p.x, p.y, p.z);
    m.visible = !city.keys.has(p.id);
    S.scene.add(m);
    return m;
  });
}
function stepKeys(dt) {
  const me = city.me, w = city.walk, x = w ? w.x : me.pos.x, z = w ? w.z : me.pos.z, y = (w ? (w.gy || 0) + 1 : me.alt + city.gy + 1);
  S.keySpots.forEach((p, k) => {
    const m = S.keyMeshes[k];
    if (!m.visible) return;
    m.rotation.y += dt * 2;
    m.position.y = p.y + Math.sin(city.t * 2 + k) * 0.2;
    if (Math.hypot(p.x - x, p.z - z) > 2.8 || Math.abs(p.y - y) > 3.2) return;
    m.visible = false;
    city.keys.add(p.id); saveKeys();
    const n = city.keys.size, goal = KEY_GOALS.find(([c]) => c === n);
    if (!city.net) city.earn(goal && n === KEY_COUNT ? 100 : 5);
    for (let i = 0; i < 10; i++) S.fx.puff(p.x, p.y, p.z, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    showMsg(goal ? goal[1] : '🔑 Goldener Schlüssel! (' + n + ' / ' + KEY_COUNT + ')' + (city.net ? '' : '  +5 🪙'), goal ? 3.2 : 2.2);
    window.beep && window.beep(1319, 0.1, 'triangle', 0.07); window.beep && window.beep(1760, 0.2, 'triangle', 0.07, 0.1);
  });
}

// ---------- Überraschungen ----------
// Ab und zu passiert etwas in der Stadt und wird zum Auftrag: ein Haus brennt (mit dem Feuerwehrauto löschen, mit
// einem anderen Auto wenigstens die Feuerwehr rufen), ein Banküberfall (Räuber verfolgen, wie beim Dieb) oder jemand
// liegt verletzt am Strassenrand (abholen und ins Spital bringen). Mit dem passenden Fahrzeug gibt es mehr Münzen.
const FIRE_KINDS = ['firetruck', 'watercannon'], AMBU_KINDS = ['ambulance', 'rescue'];
function stepEvents(dt) {
  if (city.mission || city.jail || city.walk || city.ticket || city.police) return;
  if ((city.eventT -= dt) > 0) return;
  city.eventT = 90 + Math.random() * 90;
  startMission(['fire', 'robbery', 'ambu'][Math.floor(Math.random() * 3)]);
  window.beep && window.beep(988, 0.12, 'square', 0.05); window.beep && window.beep(740, 0.18, 'square', 0.05, 0.14);
}
function makeFire(x, y, z) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.9 + Math.random() * 0.8, 3 + Math.random() * 2.5, 7), m);
    f.position.set((Math.random() - 0.5) * 6, 1.5, (Math.random() - 0.5) * 6);
    f.userData.ph = Math.random() * 6;
    g.add(f);
  }
  g.position.set(x, y, z);
  S.scene.add(g);
  return g;
}
function stepFire(M, dt) {
  const me = city.me, b = M.b, F = M.fire;
  for (const f of F.children) f.scale.set(1, 0.7 + 0.45 * Math.abs(Math.sin(city.t * 7 + f.userData.ph)), 1);
  F.visible = true;
  if (Math.random() < dt * 14) S.fx.puff(F.position.x + (Math.random() - 0.5) * 5, F.position.y + 3, F.position.z + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  const qx = Math.max(b.x0, Math.min(me.pos.x, b.x1)), qz = Math.max(b.z0, Math.min(me.pos.z, b.z1));
  const near = Math.hypot(me.pos.x - qx, me.pos.z - qz) < 18 && Math.abs(me.speed) < 2 && me.alt < 2 && !city.walk;
  const truck = FIRE_KINDS.includes(me.v.kind);
  M.spray = near ? M.spray + dt : Math.max(0, M.spray - dt);
  if (near && truck && Math.random() < dt * 25) { // Wasser spritzt zum Feuer
    const k = Math.random(), tx = me.pos.x + (F.position.x - me.pos.x) * k, tz = me.pos.z + (F.position.z - me.pos.z) * k;
    S.fx.puff(tx, 2 + (F.position.y - 2) * k + Math.sin(k * Math.PI) * 4, tz, 0, 0);
  }
  if (truck) {
    M.text = near ? '💦 Löschen … ' + '█'.repeat(Math.ceil(M.spray)) + '░'.repeat(Math.max(0, 4 - Math.ceil(M.spray))) : '🔥 Feuer! Fahr mit dem Feuerwehrauto hin und halte an';
    if (M.spray > 4) endMission(true, '🚒 Feuer gelöscht! Du bist ein Held!', 25);
  } else {
    M.text = near ? '📞 Feuerwehr rufen …' : '🔥 Feuer! Fahr hin (mit dem Feuerwehrauto kannst du löschen)';
    if (M.spray > 2) endMission(true, '📞 Feuerwehr gerufen – gut aufgepasst!', 5);
  }
}

// ---------- Aufträge: Taxi, Pizza, Dieb jagen ----------
const POLICE_KINDS = ['police', 'policebike', 'policebus'];
// Tank: Elektroautos laden an der Ladesäule; Zauber-, Tier- und Muskelkraft-Fahrzeuge brauchen gar nichts
const ELECTRIC = ['ecar', 'smart', 'golfcart', 'tram', 'scooter', 'forklift'];
const NO_FUEL = ['cargobike', 'bobbycar', 'snail', 'ghost', 'ufo'];
const isElectric = kind => ELECTRIC.includes(kind);
function needsFuel(kind) {
  const k = city.kinds[kind] || {};
  return !NO_FUEL.includes(kind) && !k.secret && !k.fly && k.tier !== 'legendary' && k.tier !== 'admin';
}
function toggleJobs() {
  const ui = S.ui;
  if (!ui.jobpanel.hidden) { ui.jobpanel.hidden = true; return; }
  ui.jobpanel.querySelector('[data-job="thief"]').disabled = !POLICE_KINDS.includes(city.me.v.kind);
  ui.jobpanel.querySelector('[data-job="cancel"]').hidden = !city.mission;
  ui.jobpanel.hidden = false;
}
// zufälliger Punkt auf der rechten Spur einer Strasse, min–max Meter von „from“ entfernt
function roadPoint(minD, maxD, from) {
  for (let k = 0; k < 300; k++) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1)), d = Math.floor(Math.random() * 4);
    const [fx, fz] = DIRS[d];
    if (!inGrid(i + fx, j + fz) || isPed(i, j, d)) continue;
    const sAlong = 16 + Math.random() * (BLOCK - 32), x = node(i) + fx * sAlong - fz * LANE, z = node(j) + fz * sAlong + fx * LANE;
    const dist = Math.hypot(x - from.x, z - from.z);
    if (dist >= minD && dist <= maxD) return { x, z };
  }
  return { x: node(1) + 20, z: node(1) + LANE };
}
// Zielmarkierung: Lichtsäule mit Ring am Boden
function marker() {
  if (S.marker) return S.marker;
  const g = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 40, 24, 1, true), beamMat); beam.position.y = 20;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.y = 0.25;
  g.add(beam, ring);
  g.visible = false;
  S.scene.add(g);
  S.marker = { g, set(x, z, col) { g.position.set(x, 0, z); beamMat.color.set(col); ring.material.color.set(col); g.visible = true; }, hide() { g.visible = false; } };
  return S.marker;
}
function startMission(type) {
  if (city.mission) endMission(false);
  const me = city.me, from = { x: me.pos.x, z: me.pos.z };
  if (type === 'taxi') city.mission = { type, step: 'pick', color: '#facc15', target: roadPoint(120, 320, from), text: '🚕 Hol den Fahrgast ab' };
  else if (type === 'pizza') city.mission = { type, step: 'pick', color: '#ef4444', target: { ...S.places.pizza.front }, text: '🍕 Hol die Pizza bei der Pizzeria' };
  else if (type === 'ambu') {
    const p = roadPoint(100, 260, from), patient = makePerson(0x22c55e, 0x6b4423);
    patient.rotation.z = Math.PI / 2; patient.position.set(p.x + 4, 0.25, p.z); say({ mesh: patient }, '🆘 Hilfe!');
    S.scene.add(patient);
    city.mission = { type, step: 'pick', color: '#ef4444', target: p, text: '🚑 Notfall! Hol die verletzte Person ab', patient };
  } else if (type === 'fire') {
    const cands = S.solid.filter(b => b.h > 5 && b.x1 - b.x0 > 6 && b.z1 - b.z0 > 6 && b.x0 < 1e8 && !b.lot)
      .filter(b => { const d = Math.hypot((b.x0 + b.x1) / 2 - from.x, (b.z0 + b.z1) / 2 - from.z); return d > 70 && d < 280; });
    const b = cands[Math.floor(Math.random() * cands.length)] || S.solid[0], fx = (b.x0 + b.x1) / 2, fz = (b.z0 + b.z1) / 2;
    city.mission = { type, color: '#f97316', target: { x: fx, z: fz }, text: '🔥 Feuer!', timer: 150, b, spray: 0, fire: makeFire(fx, b.h, fz) };
    showMsg('🔥 Ein Haus brennt!' + (FIRE_KINDS.includes(me.v.kind) ? ' Schnell hin zum Löschen!' : ' Hol ein Feuerwehrauto oder ruf die Feuerwehr!'), 3);
  } else if (type === 'thief' || type === 'robbery') {
    const p = roadPoint(90, 160, from), rob = type === 'robbery';
    const mesh = buildCar({ kind: rob ? 'muscle' : 'sports', color: '#18181b', special: null }, city.kinds);
    S.scene.add(mesh);
    city.mission = { type: 'thief', robbery: rob, step: 'chase', color: '#a855f7', target: p, text: rob ? '🏦 Fang den Bankräuber!' : '🚓 Fang den Dieb!', close: 0, far: 0,
      thief: { mesh, pos: new THREE.Vector3(p.x, 0, p.z), heading: 0, speed: 6, path: [], pathT: 0, maxV: Math.max(18, Math.min(34, me.maxV * 0.78)), radius: Math.max(1.3, mesh.userData.radius * 0.8) } };
    showMsg(rob ? '🏦 Banküberfall! Der Räuber flüchtet im schwarzen Wagen – bleib dran!' : '🚨 Ein Dieb flüchtet! Bleib dicht hinter ihm.', 2.6);
  } else if (type === 'park') {
    const free = S.places.lot.bays.filter((b, k) => !LOT_TAKEN.includes(k)), bay = free[Math.floor(Math.random() * free.length)];
    city.mission = { type, bay, color: '#facc15', target: { x: bay.x, z: bay.z }, text: '🅿️ Park im gelben Feld', timer: 75, hold: 0 };
    city.touchLot = false;
    parkSpot(bay);
  } else if (type === 'school') {
    const points = [];
    for (let k = 0, at = from; k < 4; k++) { at = roadPoint(110, 220, at); points.push(at); }
    city.mission = { type, points, step: 0, color: '#38bdf8', target: points[0], text: '🎓 Prüfung', timer: 200, over: 0 };
    showMsg('🎓 Prüfung! Halte das Tempo ein, bei Rot anhalten, kein Unfall.', 3);
  }
  const M = city.mission;
  if (!['thief', 'robbery', 'school', 'fire'].includes(type)) showMsg(M.text + '!', 2);
  marker().set(M.target.x, M.target.z, M.color);
  S.ui.goal.hidden = false;
}
function endMission(ok, text, coins = 0) {
  const M = city.mission;
  if (!M) return;
  if (M.thief) S.scene.remove(M.thief.mesh);
  if (M.pizzaBox) city.me.mesh.remove(M.pizzaBox);
  if (M.type === 'park' && S.parkSpot) S.parkSpot.visible = false;
  if (M.fire) S.scene.remove(M.fire);
  if (M.patient) S.scene.remove(M.patient);
  city.mission = null;
  marker().hide();
  S.ui.goal.hidden = true;
  if (city.net) coins = 0; // online gibt es keine Münzen
  if (coins) city.earn(coins);
  if (text) showMsg(text + (coins ? '  +' + coins + ' 🪙' : ''), 2.6);
  if (ok) { window.beep && window.beep(784, 0.12, 'triangle', 0.07); window.beep && window.beep(1047, 0.25, 'triangle', 0.07, 0.12); }
}
function stepMission(dt) {
  const M = city.mission;
  if (!M) return;
  const me = city.me, x = me.pos.x, z = me.pos.z;
  if (M.thief) stepThief(M, dt);
  const d = Math.hypot(M.target.x - x, M.target.z - z), stopped = Math.abs(me.speed) < 3;
  if (M.timer !== undefined && (M.timer -= dt) <= 0) { endMission(false, '⏰ Zu spät! Der Auftrag ist vorbei.'); return; }
  if (M.type === 'park') stepPark(M, dt);
  else if (M.type === 'school') stepSchool(M, dt);
  else if (M.type === 'fire') stepFire(M, dt);
  if (!city.mission) return;
  if (['taxi', 'pizza', 'ambu'].includes(M.type) && d < 7 && stopped && me.alt < 2) {
    if (M.step === 'pick') {
      M.step = 'drop';
      M.target = M.type === 'taxi' ? roadPoint(220, 420, M.target) : M.type === 'ambu' ? { ...S.places.hospital } : roadPoint(180, 380, M.target);
      M.timer = Math.round(Math.hypot(M.target.x - x, M.target.z - z) / 10 + 25);
      M.text = M.type === 'taxi' ? '🚕 Bring den Fahrgast ans Ziel' : M.type === 'ambu' ? '🚑 Schnell ins Spital!' : '🍕 Liefere die Pizza aus';
      if (M.patient) { S.scene.remove(M.patient); M.patient = null; }
      if (M.type === 'pizza') { // Pizzaschachtel aufs Dach
        const b = new THREE.Box3().setFromObject(me.mesh);
        M.pizzaBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0xf5deb3 }));
        M.pizzaBox.position.set(0, b.max.y - me.mesh.position.y + 0.06, 0);
        me.mesh.add(M.pizzaBox);
      }
      showMsg(M.type === 'taxi' ? '🧍 Eingestiegen! Bring ihn hin.' : M.type === 'ambu' ? '🚑 Eingeladen! Ab ins Spital 🏥' : '🍕 Pizza eingepackt! Schnell ausliefern.', 2.2);
      marker().set(M.target.x, M.target.z, M.color);
    } else {
      const ambu = M.type === 'ambu', coins = ambu ? (AMBU_KINDS.includes(me.v.kind) ? 20 : 12) : Math.min(12, (M.type === 'taxi' ? 5 : 6) + Math.floor(M.timer / 10));
      endMission(true, M.type === 'taxi' ? '🚕 Angekommen! Danke fürs Fahren.' : ambu ? '🏥 Gerettet! Die Ärzte kümmern sich um alles.' : '🍕 Pizza geliefert! Mmmh.', coins);
      return;
    }
  }
  if (M.thief) { // Dieb: dicht dranbleiben = erwischt, zu weit weg = entkommen
    M.target = { x: M.thief.pos.x, z: M.thief.pos.z };
    marker().set(M.target.x, M.target.z, M.color);
    M.close = d < 10 ? M.close + dt : Math.max(0, M.close - dt * 0.5);
    M.far = d > 380 ? M.far + dt : 0;
    M.text = M.close > 0.2 ? '🚓 Dranbleiben! ' + '█'.repeat(Math.ceil(M.close / 0.5)) + '░'.repeat(Math.max(0, 5 - Math.ceil(M.close / 0.5))) : M.robbery ? '🏦 Fang den Bankräuber!' : '🚓 Fang den Dieb!';
    if (M.close > 2.5) { endMission(true, M.robbery ? '🏦 Bankräuber gefasst! Das Geld ist zurück.' : '🚓 Erwischt! Der Dieb ist gefasst.', M.robbery ? (POLICE_KINDS.includes(me.v.kind) ? 25 : 15) : 12); return; }
    if (M.far > 8) { endMission(false, M.robbery ? '💨 Der Bankräuber ist entkommen …' : '💨 Der Dieb ist entkommen …'); return; }
  }
  // Anzeige: Pfeil zum Ziel (relativ zur Fahrtrichtung), Text, Entfernung, Zeit
  const ang = Math.atan2(M.target.z - z, M.target.x - x) - me.heading;
  S.ui.arrow.style.transform = 'rotate(' + (ang - Math.PI / 2) + 'rad)'; // ➤ zeigt nach rechts, geradeaus = nach oben
  S.ui.gtext.textContent = M.text + ' · ' + Math.round(d) + ' m' + (M.timer !== undefined ? ' · ⏱ ' + Math.ceil(M.timer) + ' s' : '');
}
// Dieb fährt über die Kreuzungen weg vom Spieler (wie der Streifenwagen, nur in die andere Richtung)
function stepThief(M, dt) {
  const T = M.thief, me = city.me;
  if ((T.pathT -= dt) <= 0 || !T.path.length) {
    let best = null, bd = -1; // Kreuzung, die weit weg von dir und nicht zu weit vom Dieb ist
    for (let k = 0; k < 20; k++) {
      const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1));
      const sc = Math.hypot(node(i) - me.pos.x, node(j) - me.pos.z) - 0.4 * Math.hypot(node(i) - T.pos.x, node(j) - T.pos.z);
      if (sc > bd) { bd = sc; best = [node(i), node(j)]; }
    }
    T.path = pathTo(T.pos.x, T.pos.z, best[0], best[1]); T.pathT = 3;
  }
  while (T.path.length > 1 && Math.hypot(T.path[0][0] - T.pos.x, T.path[0][1] - T.pos.z) < 9) T.path.shift();
  const [tx, tz] = T.path[0] || [T.pos.x, T.pos.z];
  let diff = Math.atan2(tz - T.pos.z, tx - T.pos.x) - T.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const want = Math.abs(diff) > 0.7 ? 9 : T.maxV;
  T.speed = T.speed < want ? Math.min(want, T.speed + 8 * dt) : Math.max(want, T.speed - 14 * dt);
  const yawMax = Math.min(2, GRIP * 1.3 / Math.max(T.speed, 0.1));
  if (T.speed > 0.3) T.heading += Math.max(-1, Math.min(1, diff * 2.5)) * yawMax * dt;
  T.pos.x += Math.cos(T.heading) * T.speed * dt;
  T.pos.z += Math.sin(T.heading) * T.speed * dt;
  for (const b of S.solid) {
    const qx = Math.max(b.x0, Math.min(T.pos.x, b.x1)), qz = Math.max(b.z0, Math.min(T.pos.z, b.z1));
    const ex = T.pos.x - qx, ez = T.pos.z - qz, d = Math.hypot(ex, ez);
    if (d < T.radius && d > 0.001) { T.pos.x += ex / d * (T.radius - d); T.pos.z += ez / d * (T.radius - d); T.speed *= 0.7; }
  }
  const ex = me.pos.x - T.pos.x, ez = me.pos.z - T.pos.z, d = Math.hypot(ex, ez), min = (me.radius + T.radius) * 0.85;
  if (d < min && d > 0.01) { me.pos.x += ex / d * (min - d); me.pos.z += ez / d * (min - d); T.speed *= 0.9; }
  const m = T.mesh;
  m.position.set(T.pos.x, 0, T.pos.z);
  m.rotation.y = -T.heading;
  for (const w of m.userData.wheels) w.rotation.z -= T.speed * dt / 0.35;
}

// ---------- Tempolimit und Blitzer ----------
// Die Polizei merkt nur etwas, wenn ein Blitzer dich erwischt: Rotlicht-Kamera (an jeder zehnten Ampel) oder
// Radarkasten (zu schnell: mehr als 5 km/h über dem Limit). Polizeiautos dürfen im Einsatz.
function limitAt(x, z) {
  const i = Math.round(x / BLOCK + N / 2), j = Math.round(z / BLOCK + N / 2);
  const alongX = inGrid(0, j) && Math.abs(z - node(j)) < ROAD / 2, alongZ = inGrid(i, 0) && Math.abs(x - node(i)) < ROAD / 2;
  if (alongX === alongZ) return 0; // Kreuzung oder neben der Strasse: bleibt wie vorher
  return streetLimit(alongX ? j : i);
}
function showLimit(n) { S.ui.limit.textContent = n; S.ui.limit.style.fontSize = n > 99 ? '15px' : ''; } // dreistellig etwas kleiner
function stepRules(dt) {
  const me = city.me, kmh = Math.round(Math.abs(me.speed) * 3.6);
  const lim = limitAt(me.pos.x, me.pos.z), hw = onHighway(me.pos.x, me.pos.z) && Math.abs(me.pos.z) > HALF + ROAD / 2;
  if (hw !== city.onHw) { city.onHw = hw; if (hw) { city.limit = HW_LIMIT; showLimit(HW_LIMIT); } } // Autobahn: 140
  if (lim && lim !== city.limit && !hw) { city.limit = lim; showLimit(lim); }
  const outside = Math.max(Math.abs(me.pos.x), Math.abs(me.pos.z)) > LIMIT; // Hafen, Flughafen: keine Tafel, kein Limit
  if (outside && !hw) city.limit = 0;
  S.ui.limit.hidden = (!city.limit && !hw) || (outside && !hw) || me.alt > 2 || !!city.walk;
  S.ui.speed.classList.toggle('over', !!city.limit && kmh > city.limit + 5 && me.alt < 2);
  const F = S.flash; // Blitz verglüht
  if (F.visible && (F.material.opacity -= dt * 4) <= 0) F.visible = false;
  if (me.alt > 2.5 || city.walk || city.plane || POLICE_KINDS.includes(me.v.kind)) return;
  const hx = Math.cos(me.heading), hz = Math.sin(me.heading);
  for (const c of S.speedCams) {
    const dx = me.pos.x - c.x, dz = me.pos.z - c.z, along = dx * c.fx + dz * c.fz, side = Math.abs(dz * c.fx - dx * c.fz);
    if (Math.abs(along) > 4 || side > 13 || c.cd > city.t || hx * c.fx + hz * c.fz < 0.5) continue;
    c.cd = city.t + 3;
    if (kmh > c.limit + 5) blitz(c, 'speed', '📸 Geblitzt! ' + kmh + ' statt ' + c.limit + ' km/h', 'Zu schnell: ' + kmh + ' statt ' + c.limit + ' km/h 📸', kmh);
  }
}
function blitz(cam, kind, msg, reason, kmh = 0) {
  const F = S.flash;
  F.position.set(cam.x, cam.y, cam.z);
  F.material.opacity = 1;
  F.visible = true;
  S.ui.flash.classList.remove('on'); void S.ui.flash.offsetWidth; S.ui.flash.classList.add('on'); // weisser Blitz übers Bild
  window.beep && window.beep(2200, 0.06, 'square', 0.05);
  showMsg(msg, 2);
  if (city.police || city.ticket) return;
  city.reason = { kind, text: reason, kmh, jail: kind === 'speed' && kmh > JAIL_KMH };
  startChase();
}

// ---------- Gefängnis ----------
// Über 140 km/h geblitzt: nach dem Strafzettel 3 Minuten in den Gefängnishof (hohe Mauern, Fliegen geht nicht).
// Freikaufen kostet BAIL Münzen. Die Zeit läuft weiter, auch wenn man die Stadt verlässt (Spielstand autoRetterJail).
const JAIL_KMH = 140, JAIL_MS = 3 * 60 * 1000, BAIL = 100;
const jailKey = 'autoRetterJail';
function jailUntil() { try { return Number(localStorage.getItem(jailKey)) || 0; } catch (err) { return 0; } }
function setJailUntil(t) { try { if (t) localStorage.setItem(jailKey, String(t)); else localStorage.removeItem(jailKey); } catch (err) { /* ohne Speicher */ } }
function goToJail(until = Date.now() + JAIL_MS) {
  const J = S.places.jail, me = city.me;
  removePolice();
  if (city.walk) { S.scene.remove(city.walk.mesh); city.walk = null; S.ui.walkbtn.textContent = '🚪'; S.ui.walkbtn.classList.remove('ready'); S.ui.hint.textContent = HINT; }
  if (me.mesh.userData.driver) me.mesh.userData.driver.visible = true;
  setJailUntil(until);
  city.jail = { until };
  Object.assign(me.pos, { x: J.x, z: J.z });
  Object.assign(me, { heading: -Math.PI / 2, speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  S.ui.jail.hidden = false;
  S.ui.bail.textContent = '💰 Freikaufen (' + BAIL + ' 🪙)';
  showMsg('🔒 Ab ins Gefängnis!', 2.2);
}
function leaveJail(text) {
  const J = S.places.jail, me = city.me;
  city.jail = null;
  setJailUntil(0);
  S.ui.jail.hidden = true;
  if (city.walk) { S.scene.remove(city.walk.mesh); city.walk = null; S.ui.walkbtn.textContent = '🚪'; S.ui.walkbtn.classList.remove('ready'); S.ui.hint.textContent = HINT; }
  if (me.mesh.userData.driver) me.mesh.userData.driver.visible = true;
  Object.assign(me.pos, { x: J.gate.x, z: J.gate.z });
  Object.assign(me, { heading: J.gate.h, speed: 0, vl: 0 });
  showMsg(text, 2.4);
}
function bail() {
  if (!city || !city.jail) return;
  const paid = city.pay(BAIL);
  if (paid < BAIL) { if (paid) city.earn(paid); showMsg('Zu wenig Münzen – du brauchst ' + BAIL + ' 🪙', 1.8); return; }
  leaveJail('💰 Freigekauft! Fahr vorsichtig 😉');
}
function stepJail() {
  const J = city.jail;
  if (!J) return;
  const left = J.until - Date.now();
  if (left <= 0) { leaveJail('🔓 Frei! Fahr vorsichtig 😉'); return; }
  const sec = Math.ceil(left / 1000);
  S.ui.jailtime.textContent = '🔒 Gefängnis ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  const P = S.places.jail, keep = o => { // im Hof bleiben (auch zu Fuss)
    o.x = Math.max(P.x - P.half, Math.min(P.x + P.half, o.x));
    o.z = Math.max(P.z - P.half, Math.min(P.z + P.half, o.z));
  };
  keep(city.me.pos);
  if (city.walk) keep(city.walk);
  city.me.fly = false; city.me.alt = 0;
}

// ---------- Polizei ----------
// Geblitzt (über Rot oder zu schnell): hinter dir taucht ein Streifenwagen auf und folgt dir über die Strassen (Weg über die
// Kreuzungen), in der Nähe direkt. Bleibt er ein paar Sekunden dicht dran, zieht er dich raus → Strafzettel.
// Fährst du weit genug weg, gibt er auf.
function startChase(from = null) {
  if (city.police || city.ticket) return;
  const me = city.me, T = target(), fx = Math.cos(T.h), fz = Math.sin(T.h);
  if (city.wanted && !(city.reason && city.reason.kind === 'steal')) city.reason = { kind: 'steal', text: '🚗 Auto geklaut', jail: city.wanted.stars >= 3 };
  if (from) { // ein Streifenwagen aus dem Verkehr hat dich gesehen: er selbst nimmt die Verfolgung auf
    const k = city.cars.indexOf(from);
    if (k >= 0) city.cars.splice(k, 1);
    city.police = { mesh: from.mesh, pos: new THREE.Vector3(from.x, 0, from.z), heading: from.h, speed: from.speed || 6, state: 'chase', closeT: 0, farT: 0, t: 0,
      maxV: Math.max(24, Math.min(46, me.maxV * 0.92)), radius: Math.max(1.3, from.mesh.userData.radius * 0.8), siren: createSiren(), path: [] };
    S.ui.chase.hidden = false;
    showMsg('🚨 Die Polizei hat dich gesehen!', 2.2);
    return;
  }
  // Kreuzung etwa 70 m hinter dir
  let best = null, bd = Infinity;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    if (!nodeSegs(i, j)) continue;
    const x = node(i), z = node(j), dx = x - T.x, dz = z - T.z, dist = Math.hypot(dx, dz);
    const behind = -(dx * fx + dz * fz);
    const score = Math.abs(dist - 75) + (behind > 0 ? 0 : 200);
    if (score < bd) { bd = score; best = [i, j]; }
  }
  const mesh = buildCar({ kind: 'police', color: city.kinds.police.color, special: null }, city.kinds);
  const pos = new THREE.Vector3(node(best[0]), 0, node(best[1]));
  S.scene.add(mesh);
  city.police = { mesh, pos, heading: Math.atan2(T.z - pos.z, T.x - pos.x), speed: 8, state: 'chase', closeT: 0, farT: 0, t: 0,
    maxV: Math.max(24, Math.min(46, me.maxV * 0.92)), radius: Math.max(1.3, mesh.userData.radius * 0.8), siren: createSiren(), path: [] };
  S.ui.chase.hidden = false;
  showMsg('🚨 Polizei! Sie verfolgt dich!', 2.2);
}

// Weg über das Strassengitter (Breitensuche von Kreuzung zu Kreuzung). Start ist die bessere der beiden
// Kreuzungen an der Strasse, auf der der Streifenwagen gerade fährt (sonst würde er umkehren).
function bfs(start, goal) {
  const key = (i, j) => i * 100 + j, prev = new Map([[key(...start), null]]), queue = [start];
  while (queue.length) {
    const [i, j] = queue.shift();
    if (i === goal[0] && j === goal[1]) break;
    for (let d = 0; d < 4; d++) {
      const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
      if (!segOn(i, j, d) || prev.has(key(ni, nj))) continue; // nur echte Strassen
      prev.set(key(ni, nj), [i, j]); queue.push([ni, nj]);
    }
  }
  const path = [];
  for (let p = goal; p; p = prev.get(key(...p))) path.unshift(p);
  return path;
}
function pathTo(fromX, fromZ, toX, toZ) {
  const clampI = v => Math.max(0, Math.min(N, v)), gx = fromX / BLOCK + N / 2, gz = fromZ / BLOCK + N / 2;
  const goal = [clampI(Math.round(toX / BLOCK + N / 2)), clampI(Math.round(toZ / BLOCK + N / 2))];
  const onX = Math.abs(fromX - node(Math.round(gx))) < Math.abs(fromZ - node(Math.round(gz))); // auf einer Strasse entlang z
  const starts = onX ? [[Math.round(gx), Math.floor(gz)], [Math.round(gx), Math.ceil(gz)]] : [[Math.floor(gx), Math.round(gz)], [Math.ceil(gx), Math.round(gz)]];
  let best = null, cost = Infinity;
  for (const st of starts.map(([i, j]) => [clampI(i), clampI(j)])) {
    const path = bfs(st, goal), c = Math.hypot(node(st[0]) - fromX, node(st[1]) - fromZ) + (path.length - 1) * BLOCK;
    if (c < cost) { cost = c; best = path; }
  }
  return best.map(([i, j]) => [node(i), node(j)]);
}

function stepPolice(dt) {
  const P = city.police;
  if (!P) return;
  const me = city.me, T = target(), w = city.walk;
  P.t += dt;
  const dx = T.x - P.pos.x, dz = T.z - P.pos.z, dist = Math.hypot(dx, dz) + (T.alt > 4 ? 200 : 0); // in der Luft kommt sie nicht hin
  let tx, tz, want = P.maxV;
  if (P.state === 'chase' && w && !P.cop && dist < 14) { // du bist zu Fuss: der Polizist steigt aus und rennt dir nach
    const sx = Math.cos(P.heading), sz = Math.sin(P.heading);
    P.cop = { x: P.pos.x + sz * 1.6, z: P.pos.z - sx * 1.6, h: P.heading, speed: 0, phase: 0, mesh: makeCop() };
    S.scene.add(P.cop.mesh);
    if (P.mesh.userData.driver) P.mesh.userData.driver.visible = false;
    showMsg('👮 Der Polizist rennt dir nach – renn! (⬆️ lange halten)', 2);
  }
  if (P.cop) {
    if (P.state === 'leave') { S.scene.remove(P.cop.mesh); P.cop = null; }
    else { stepCop(P, dt, T); want = 0; }
    if (!P.cop && P.mesh.userData.driver) P.mesh.userData.driver.visible = true;
  }
  if (P.cop) { tx = P.pos.x + Math.cos(P.heading); tz = P.pos.z + Math.sin(P.heading); } // Auto wartet
  else if (P.state === 'leave') { // fährt davon und verschwindet
    tx = P.pos.x + Math.cos(P.heading) * 50; tz = P.pos.z + Math.sin(P.heading) * 50;
    want = 16;
    if (P.t > 6) { removePolice(); return; }
  } else if (P.state === 'stop') {
    tx = T.x; tz = T.z; want = 0;
  } else if (dist < 40) { // nah: direkt hinter dir her, etwas vorausschauend
    tx = T.x + Math.cos(T.h) * T.v * 0.4; tz = T.z + Math.sin(T.h) * T.v * 0.4;
    want = dist < 9 ? Math.max(0, Math.abs(T.v) - 1) : Math.min(P.maxV, Math.abs(T.v) + 8 + dist * 0.4);
    if (w) want = Math.min(want, 4 + dist * 0.5); // zu Fuss: langsam heranfahren
  } else { // weit: von Kreuzung zu Kreuzung
    if ((P.pathT = (P.pathT || 0) - dt) <= 0 || !P.path.length) { P.path = pathTo(P.pos.x, P.pos.z, T.x, T.z); P.pathT = 1; }
    while (P.path.length > 1 && Math.hypot(P.path[0][0] - P.pos.x, P.path[0][1] - P.pos.z) < 9) P.path.shift();
    [tx, tz] = P.path[0] || [T.x, T.z];
  }
  // Lenken wie ein Auto, in engen Kurven langsamer
  let diff = Math.atan2(tz - P.pos.z, tx - P.pos.x) - P.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  if (Math.abs(diff) > 0.7) want = Math.min(want, 9);
  P.speed = P.speed < want ? Math.min(want, P.speed + 9 * dt) : Math.max(want, P.speed - 14 * dt);
  const yawMax = Math.min(2, GRIP * 1.3 / Math.max(P.speed, 0.1));
  if (P.speed > 0.3) P.heading += Math.max(-1, Math.min(1, diff * 2.5)) * yawMax * dt;
  P.pos.x += Math.cos(P.heading) * P.speed * dt;
  P.pos.z += Math.sin(P.heading) * P.speed * dt;
  // Häuser, Bäume, Autos und du schieben den Streifenwagen weg
  for (const b of S.solid) {
    const qx = Math.max(b.x0, Math.min(P.pos.x, b.x1)), qz = Math.max(b.z0, Math.min(P.pos.z, b.z1));
    const ex = P.pos.x - qx, ez = P.pos.z - qz, d = Math.hypot(ex, ez);
    if (d < P.radius && d > 0.001) { P.pos.x += ex / d * (P.radius - d); P.pos.z += ez / d * (P.radius - d); P.speed *= 0.7; }
  }
  for (const o of [...city.cars.map(c => ({ x: c.x, z: c.z, r: c.mesh.userData.radius })), { x: me.pos.x, z: me.pos.z, r: me.radius, me: true }]) {
    const ex = P.pos.x - o.x, ez = P.pos.z - o.z, d = Math.hypot(ex, ez), min = (P.radius + o.r) * 0.8;
    if (d < min && d > 0.001) {
      P.pos.x += ex / d * (min - d); P.pos.z += ez / d * (min - d);
      if (o.me && !w && Math.abs(P.speed - me.speed) > 4 && city.crashT <= 0) { crash(0.3, 'car'); hurt(0.3, P.pos.x, P.pos.z); city.crashT = 0.5; }
    }
  }
  // Erwischt? Dicht dran bleiben = rausziehen; freiwillig anhalten geht auch
  if (P.state === 'chase') {
    const cd = P.cop ? Math.hypot(T.x - P.cop.x, T.z - P.cop.z) : dist; // zu Fuss zählt der Abstand zum Polizisten
    P.closeT = dist < 9 && !w ? P.closeT + dt : Math.max(0, P.closeT - dt * 0.5);
    P.farT = cd > (w ? 70 : 160) ? P.farT + dt : 0;
    if (w) { /* zu Fuss: erwischt nur der Polizist (stepCop) */ } else if (P.closeT > 3 || (dist < 14 && Math.abs(me.speed) < 1.5 && P.t > 2)) {
      P.state = 'stop';
      city.pulled = 1.4;
      showMsg('🚓 Rechts ranfahren und anhalten!', 1.8);
      horn(0.8, 0.3, 0.8);
    } else if (P.farT > 8) {
      showMsg(city.wanted ? '😎 Entkommen! Aber du wirst noch gesucht – versteck dich!' : '😎 Entkommen! Die Polizei gibt auf.', 2.5);
      P.state = 'leave'; P.t = 0;
      S.ui.chase.hidden = true;
      if (P.siren) P.siren.set(0);
    }
  }
  if (P.state === 'stop' && !P.cop && city.pulled <= 0 && Math.abs(me.speed) < 0.5 && !city.ticket) giveTicket();
  if (P.siren) P.siren.set(P.state === 'chase' || P.state === 'stop' ? 1 - dist / 220 : 0);
  const m = P.mesh;
  m.position.set(P.pos.x, 0, P.pos.z);
  m.rotation.y = -P.heading;
  for (const w of m.userData.wheels) w.rotation.z -= P.speed * dt / 0.35;
  animateCar(m, city.t, null);
}

// Strafzettel über Rot: 10 Münzen, bei jedem weiteren Mal 10 mehr (höchstens 50). Zu schnell: je schneller, desto teurer
// (bis 90 km/h 10, bei 100 km/h 20, bei 110 km/h 30 …). Ohne Münzen nur eine Verwarnung.
const speedFine = kmh => Math.max(10, (Math.floor(kmh / 10) - 8) * 10);
function giveTicket() {
  city.fines++;
  const R = city.reason || {}, amount = R.kind === 'speed' ? speedFine(R.kmh) : R.kind === 'gasse' ? 50 : R.kind === 'blue' ? 20 : R.kind === 'zebra' ? 30 : R.kind === 'school' ? 20 : R.kind === 'amb' ? 30 : R.kind === 'steal' ? 30 * ((city.wanted || {}).stars || 1) : Math.min(50, 10 * city.fines), paid = city.pay(amount);
  city.ticket = true;
  const T = S.ui.ticket;
  T.querySelector('.amount').textContent = paid ? paid + ' 🪙' : 'Verwarnung';
  T.querySelector('.reason').textContent = (city.reason || {}).text || 'Über Rot gefahren 🚦';
  T.querySelector('.jailnote').hidden = !R.jail;
  T.querySelector('.jailnote').textContent = R.kind === 'steal' ? '🔒 Drei Autos geklaut: 3 Minuten Gefängnis!' : '🔒 Über 140 km/h: 3 Minuten Gefängnis!';
  T.querySelector('.note').textContent = paid === amount ? 'Die Münzen wurden abgezogen.'
    : paid ? 'Du hattest nur noch ' + paid + ' Münzen – Glück gehabt!' : 'Keine Münzen dabei – diesmal nur eine Verwarnung!';
  T.querySelector('.count').textContent = city.fines > 1 ? 'Schon ' + city.fines + '× erwischt!' : '';
  T.hidden = false;
  window.beep && window.beep(660, 0.12, 'square', 0.05);
}
function closeTicket() {
  if (!city || !city.ticket) return;
  city.ticket = false;
  S.ui.ticket.hidden = true;
  S.ui.chase.hidden = true;
  const P = city.police;
  if (P) { P.state = 'leave'; P.t = 0; if (P.siren) P.siren.set(0); }
  const stole = !!city.wanted || (city.reason || {}).kind === 'steal';
  if (stole) { city.wanted = null; giveBack(); }
  if ((city.reason || {}).jail) { city.reason = null; goToJail(); return; }
  const kind = (city.reason || {}).kind;
  if (stole) { city.reason = null; showMsg('🚓 Das Auto geht zurück. Deines steht noch dort, wo du es gelassen hast (Karte).', 3.2); return; }
  showMsg(kind === 'speed' ? 'Gute Fahrt! Und nicht zu schnell 😉' : kind === 'gasse' ? 'Bei Blaulicht immer Platz machen 🚑' : kind === 'blue' ? 'Parkscheibe nicht vergessen 🕐' : kind === 'zebra' ? 'Am Zebrastreifen immer anhalten 🚸' : kind === 'school' ? 'Beim blinkenden Schulbus warten 🚌' : kind === 'amb' ? 'Bei Blaulicht immer Platz machen 🚑' : 'Gute Fahrt! Und bei Rot anhalten 😉', 2);
  if (['gasse', 'blue', 'zebra', 'school', 'amb'].includes(kind)) city.reason = null;
}
// Erwischt mit einem geklauten Auto: es geht zurück, du stehst zu Fuss daneben; dein eigenes Auto steht, wo du es gelassen hast
function giveBack() {
  const me = city.me;
  if (!me.v.stolen) return;
  const F = city.stolenFrom && city.parked.includes(city.stolenFrom) ? city.stolenFrom : null;
  if (!F) { me.v = { ...me.v, stolen: false }; return; } // das eigene Auto gibt es nicht mehr: dann behältst du dieses
  if (!city.walk) exitCar();
  if (city.alarm) { if (city.alarm.mesh) city.alarm.mesh.remove(city.alarm.g); city.alarm = null; }
  const cx = me.pos.x, cz = me.pos.z, stolen = me.v;
  removeParked(F);
  switchCar(F.v, true);
  Object.assign(me.pos, { x: F.x, z: F.z }); me.heading = F.h;
  me.mesh.position.set(F.x, groundAt(F.x, F.z), F.z); me.mesh.rotation.y = -F.h;
  if (me.mesh.userData.driver) me.mesh.userData.driver.visible = false; // du bist ja zu Fuss
  city.stolenFrom = null;
  if (Math.max(Math.abs(cx), Math.abs(cz)) < HALF) addFarCar({ kind: stolen.kind, color: stolen.color, special: null }); // fährt wieder im Verkehr mit
}
function removePolice() {
  const P = city.police;
  if (!P) return;
  if (P.cop) { S.scene.remove(P.cop.mesh); P.cop = null; }
  if (P.siren) P.siren.stop();
  S.scene.remove(P.mesh);
  city.police = null;
  S.ui.chase.hidden = true;
}

// ---------- Autos klauen, Alarm und gesucht ----------
// Zu Fuss zu einem fremden Auto im Verkehr (oder in der Blauen Zone), X = klauen: der Fahrer springt heraus, die Alarmanlage
// hupt und blinkt, und du wirst gesucht (⭐ pro geklautem Auto, höchstens 3). Dein eigenes Auto bleibt stehen, wo du es
// gelassen hast (city.stolenFrom). Gesucht heisst: sieht dich ein Streifenwagen (nah genug, kein Haus dazwischen; während
// des Alarms hört er dich auch weiter weg), verfolgt er dich. Aussteigen geht immer – dann rennt der Polizist dir zu Fuss
// nach. Erwischt: Busse, das Auto geht zurück (bei ⭐⭐⭐ ins Gefängnis). Ohne gesehen zu werden ist man nach WANTED_TIME frei.
const WANTED_TIME = 120, COP_RUN = 5.6;
const canSteal = c => !c.off && !c.bus && !c.school && !c.sweeper && !c.rescue && !c.patrol && c !== city.amb && !(c.wreck > 0) && !c.hazard
  && !POLICE_KINDS.includes(c.v.kind) && !(c.lot && c.lot.state !== 'park');
function freeSpot() { // Platz auf einer Strasse weit weg vom Spieler (für neue Autos im Verkehr)
  const o = {};
  for (let tries = 0; tries < 60; tries++) {
    Object.assign(o, { i: Math.floor(Math.random() * (N + 1)), j: Math.floor(Math.random() * (N + 1)), d: Math.floor(Math.random() * 4), s: 10 + Math.random() * (BLOCK - 26) });
    if (!inGrid(o.i + DIRS[o.d][0], o.j + DIRS[o.d][1]) || isClosed(o.i, o.j, o.d)) continue;
    placeOnSegment(o);
    if (Math.hypot(o.x - city.me.pos.x, o.z - city.me.pos.z) > 150) return o;
  }
  return null;
}
function addFarCar(given = null, extra = {}) {
  const o = freeSpot();
  if (!o) return null;
  const c = makeCar(city.kinds, o.i, o.j, o.d, o.s, given);
  placeOnSegment(c); Object.assign(c, extra);
  S.scene.add(c.mesh); city.cars.push(c);
  return c;
}
function hazardGroup(len) { // Warnblinker an allen vier Ecken (blinken mit hazardMat in stepAccidents)
  if (!hazardMat) { hazardMat = new THREE.MeshStandardMaterial({ color: 0x7a4a00, emissive: 0xff9a1a, emissiveIntensity: 0 }); triGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 3).rotateX(-Math.PI / 2); }
  const hl = len / 2 - 0.2, g = new THREE.Group();
  for (const x of [-hl, hl]) for (const z of [-0.75, 0.75]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hazardMat); b.position.set(x, 0.75, z); g.add(b); }
  return g;
}
function stealCar(c) {
  const me = city.me, oldMesh = me.mesh, old = { v: me.v, x: me.pos.x, z: me.pos.z, h: me.heading };
  const k = city.cars.indexOf(c);
  if (k >= 0) city.cars.splice(k, 1);
  S.scene.remove(c.mesh);
  if (c.lot && c.lot.q) c.lot.q.car = null;
  const ps = typeof window.basePS === 'function' ? window.basePS(c.v.kind) : 60;
  switchCar({ kind: c.v.kind, color: c.v.color, special: null, ps, stolen: true }, true);
  Object.assign(me.pos, { x: c.x, z: c.z }); me.heading = c.h;
  const P = parkHere(oldMesh, old.v, old.x, old.z, old.h); // dein Auto bleibt stehen
  if (!old.v.stolen || !city.parked.includes(city.stolenFrom)) city.stolenFrom = old.v.stolen ? city.stolenFrom : P;
  // der Fahrer springt heraus und schimpft
  const fx = Math.cos(c.h), fz = Math.sin(c.h), vic = { x: c.x - fz * 2.2, z: c.z + fx * 2.2, h: c.h + Math.PI / 2, speed: 0, phase: 0, t: 9,
    mesh: makePerson(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], HAIRS[Math.floor(Math.random() * HAIRS.length)], SKINS[Math.floor(Math.random() * SKINS.length)]) };
  vic.mesh.position.set(vic.x, groundAt(vic.x, vic.z), vic.z);
  S.scene.add(vic.mesh); say(vic, pick(['😠 Hey! Mein Auto!', '😱 Diebstahl! Polizei!', '😤 Halt! Das ist meins!']));
  (city.victims = city.victims || []).push(vic);
  addFarCar(); // der Verkehr bleibt gleich voll
  // Alarm: hupen und blinken
  if (city.alarm && city.alarm.g && city.alarm.mesh) city.alarm.mesh.remove(city.alarm.g);
  city.alarm = { t: 9, beat: 0, mesh: me.mesh, g: hazardGroup(me.len || 4.5) };
  me.mesh.add(city.alarm.g);
  const W = city.wanted = { stars: Math.min(3, ((city.wanted || {}).stars || 0) + 1), t: WANTED_TIME, look: 0 };
  ensurePatrols();
  showMsg('🚨 Auto geklaut! Alarm! Du wirst gesucht ' + '⭐'.repeat(W.stars), 2.6);
}
// Mehr Streifenwagen im Verkehr, solange man gesucht wird (2 + Sterne)
function ensurePatrols() {
  const W = city.wanted;
  if (!W || !city.kinds.police) return;
  let n = city.cars.filter(c => POLICE_KINDS.includes(c.v.kind) && !c.off).length;
  for (; n < 2 + W.stars; n++) if (!addFarCar({ kind: 'police', color: city.kinds.police.color, special: null }, { patrol: true, cruise: 12 })) break;
}
// Kann der Streifenwagen dich sehen? Kein Haus (höher als 2,5 m) auf der Linie dazwischen
function canSee(ax, az, bx, bz) {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
  const walls = S.solid.filter(b => b.h > 2.5 && b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1);
  if (!walls.length) return true;
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
  for (let k = 1; k < n; k++) {
    const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
    if (walls.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) return false;
  }
  return true;
}
const target = () => city.walk ? { x: city.walk.x, z: city.walk.z, h: city.walk.h, v: city.walk.speed, alt: 0 }
  : { x: city.me.pos.x, z: city.me.pos.z, h: city.me.heading, v: city.me.speed, alt: city.me.alt };
function stepWanted(dt) {
  const A = city.alarm;
  if (A) { // Alarmanlage: hupt im Takt
    A.t -= dt;
    if ((A.beat -= dt) <= 0) { A.beat = 0.55; const d = Math.hypot(city.me.pos.x - S.camera.position.x, city.me.pos.z - S.camera.position.z); horn(Math.max(0.1, 0.75 - d / 120), 0.3, 1.15); }
    if (A.t <= 0) { if (A.mesh) A.mesh.remove(A.g); city.alarm = null; }
  }
  for (const v of city.victims || []) { // bestohlene Fahrer laufen davon
    v.t -= dt;
    if (v.t < 6) { v.speed = 2.2; v.x += Math.cos(v.h) * v.speed * dt; v.z += Math.sin(v.h) * v.speed * dt; }
    v.gy = groundAt(v.x, v.z); animatePerson(v, dt);
    if (v.t < 7 && v.bubble) say(v, null);
    if (v.t <= 0) S.scene.remove(v.mesh);
  }
  if (city.victims) city.victims = city.victims.filter(v => v.t > 0);
  const W = city.wanted, ui = S.ui.wanted;
  if (!W) {
    ui.hidden = true;
    if ((city.patrolT = (city.patrolT || 0) - dt) <= 0) { // zusätzliche Streifen verschwinden wieder, wenn sie weit weg sind
      city.patrolT = 2;
      for (const c of city.cars.filter(c => c.patrol && Math.hypot(c.x - S.camera.position.x, c.z - S.camera.position.z) > 160)) { S.scene.remove(c.mesh); city.cars.splice(city.cars.indexOf(c), 1); }
    }
    return;
  }
  if (!city.police && !city.jail) W.t -= dt;
  const sec = Math.max(0, Math.ceil(W.t));
  ui.hidden = false;
  ui.textContent = '🚨 GESUCHT ' + '⭐'.repeat(W.stars) + (city.police ? '' : ' · ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'));
  if (W.t <= 0) { city.wanted = null; showMsg('😇 Niemand sucht dich mehr', 2.2); return; }
  if (city.police || city.ticket || city.jail || (W.look -= dt) > 0) return;
  W.look = 0.3;
  if ((W.patrolT = (W.patrolT || 0) - 0.3) <= 0) { W.patrolT = 10; ensurePatrols(); }
  const T = target(), see = 50 + 15 * W.stars, hear = city.alarm ? 90 : 0;
  if (T.alt > 6) return; // hoch in der Luft sieht dich keiner
  for (const c of city.cars) {
    if (!POLICE_KINDS.includes(c.v.kind) || c.off || c.wreck > 0) continue;
    const d = Math.hypot(c.x - T.x, c.z - T.z);
    if (d < hear || (d < see && canSee(c.x, c.z, T.x, T.z))) { startChase(c); return; }
  }
}
// Polizist zu Fuss (steigt aus, wenn du zu Fuss flüchtest)
function makeCop() {
  const m = makePerson(0x1e3a8a, 0x111827, 0xf2c9a0), cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0x172554 }));
  cap.position.y = 1.83; m.add(cap);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: 0x0b0b0f })); peak.position.set(0.15, 1.79, 0); m.add(peak);
  return m;
}
function stepCop(P, dt, T) {
  const c = P.cop, w = city.walk;
  const tx = w ? T.x : P.pos.x, tz = w ? T.z : P.pos.z, d = Math.hypot(tx - c.x, tz - c.z);
  c.h = Math.atan2(tz - c.z, tx - c.x);
  c.speed = d > 0.6 ? COP_RUN : 0;
  c.x += Math.cos(c.h) * c.speed * dt; c.z += Math.sin(c.h) * c.speed * dt;
  for (const b of S.solid) { // nicht durch Häuser
    const qx = Math.max(b.x0, Math.min(c.x, b.x1)), qz = Math.max(b.z0, Math.min(c.z, b.z1)), ex = c.x - qx, ez = c.z - qz, dd = Math.hypot(ex, ez);
    if (dd < 0.35 && dd > 0.001) { c.x += ex / dd * (0.35 - dd); c.z += ez / dd * (0.35 - dd); }
  }
  c.gy = groundAt(c.x, c.z); animatePerson(c, dt);
  if (!w && d < 2.4) { S.scene.remove(c.mesh); P.cop = null; return; } // zurück im Streifenwagen, weiter geht die Jagd
  if (w && d < 1.1 && P.state === 'chase' && !city.ticket) { // erwischt!
    P.state = 'stop'; c.speed = 0; say(c, '👮 Stehen bleiben!');
    showMsg('👮 Erwischt!', 1.6);
    giveTicket();
  }
}

// Eigenes altes Fahrzeug → echtes Auto (game.js: retired = Fantasie, realAs = ohne echtes Modell)
function realKind(k) { for (let i = 0; i < 4; i++) { const K = city.kinds[k], to = K && (K.retired || K.realAs); if (!to) break; k = to; } return k; }
function surfaceAt(x, z) {
  if (city && city.boat && !city.walk) return 'water';
  for (const q of (S.places && S.places.services) || []) { const b = q.pad; if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return 'asphalt'; } // Tankstellen mit Werkstatt
  if (inMoon(x, z)) return 'moon';
  if (Math.abs(x) > HALF + ROAD / 2 || Math.abs(z) > HALF + ROAD / 2) {
    if (onHighway(x, z) || onRoads(x, z) || inArea(x, z) || suburbRoad(x, z) || monRoad(x, z) || onDeck(x, z)) return 'asphalt';
    return countrySurface(x, z) || (onPass(x, z) ? 'asphalt' : 'grass');
  }
  const bi = Math.floor(x / BLOCK + N / 2), bj = Math.floor(z / BLOCK + N / 2);
  const nx = node(Math.round(x / BLOCK + N / 2)), nz = node(Math.round(z / BLOCK + N / 2));
  if (Math.abs(x - nx) < ROAD / 2 || Math.abs(z - nz) < ROAD / 2) { // Strasse – ausser zwischen freien Blöcken
    const ok = [[-ROAD, -ROAD], [ROAD, -ROAD], [-ROAD, ROAD], [ROAD, ROAD]].some(([a, b]) => blockOn(Math.floor((x + a) / BLOCK + N / 2), Math.floor((z + b) / BLOCK + N / 2)));
    return ok ? 'asphalt' : 'grass';
  }
  if (!blockOn(bi, bj)) return suburbRoad(x, z) ? 'asphalt' : 'grass'; // freier Block (Wäldchen) oder Quartier mit Gassen
  const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2, bs = baseOf(bi + ',' + bj);
  if (S.parks.has(bi + ',' + bj)) {
    if (Math.abs(x - cx) < 22 && Math.abs(z - cz) < 22 && Math.abs(x - cx) > 1.6 && Math.abs(z - cz) > 1.6) return 'grass';
  }
  if (bs >= 0 && !S.places.bases[bs].on && Math.abs(x - cx) < 22 && Math.abs(z - cz) < 22) return 'grass'; // Wiese, wo keine Base steht
  return 'asphalt';
}

function stepLights() {
  for (const ax of ['x', 'z']) {
    const st = lightState(ax, city.t);
    for (const c of ['red', 'yellow', 'green']) S.lamps[ax + c].emissiveIntensity = st === c ? 3 : 0;
  }
}

// ---------- Bedienoberfläche ----------
const CSS = `
#city { position: fixed; overflow: hidden; background: #000; z-index: 10; transform-origin: center center;
  font-family: system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; touch-action: none; }
#city canvas.c3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#city .speed { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); text-align: center;
  background: rgba(0,0,0,.55); border-radius: 14px; padding: 6px 16px; font-weight: 800; font-size: 26px; }
#city .speed small { display: block; font-size: 13px; font-weight: 600; opacity: .8; }
#city .speed.over { background: rgba(185,28,28,.85); }
#city .cruise { position: absolute; bottom: 124px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; z-index: 3; } /* über der Anleitung (.hint, bottom 86px) */
#city .cruise[hidden] { display: none; }
@media (max-width: 760px) { #city .cruise { left: 16px; transform: none; bottom: 216px; } } /* Handy: links über den Lenk- und Flugknöpfen */
#city .cruise button { background: rgba(0,0,0,.55); color: #fff; border: 2px solid rgba(255,255,255,.3); border-radius: 10px; font: 800 16px system-ui, sans-serif; padding: 4px 10px; touch-action: manipulation; }
#city .cruise .cron.on { background: #16a34a; border-color: #86efac; }
#city .limit { position: absolute; bottom: 18px; left: calc(50% - 128px); width: 46px; height: 46px; border-radius: 50%; background: #fff;
  border: 7px solid #d61f1f; color: #111; font: 900 20px system-ui, sans-serif; letter-spacing: -1px; display: flex; align-items: center; justify-content: center; }
#city .limit[hidden], #city .jailbar[hidden], #city .fuel[hidden] { display: none; }
#city .fuel { position: absolute; bottom: 20px; left: calc(50% + 92px); display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,.55);
  border-radius: 10px; padding: 5px 8px; font-size: 18px; }
#city .fuel span { display: block; width: 64px; height: 12px; border-radius: 6px; background: rgba(255,255,255,.2); overflow: hidden; }
#city .fuel i { display: block; height: 100%; background: #22c55e; }
#city .fuel.dmg { bottom: 56px; } #city .fuel.dmg i { background: #f97316; }
#city .fuel.low i { background: #ef4444; } #city .fuel.low { animation: cityblink 0.6s infinite alternate; }
#city .jailbar { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); background: rgba(31,41,55,.92); border: 3px solid #fb923c;
  border-radius: 14px; padding: 6px 10px 6px 16px; display: flex; align-items: center; gap: 12px; font-weight: 900; font-size: 22px; white-space: nowrap; z-index: 4; }
#city .jailbar .bail { border: none; border-radius: 10px; background: #16a34a; color: #fff; font: 800 16px system-ui, sans-serif; padding: 8px 12px; }
#city .ticket .jailnote { color: #fff; background: #b91c1c; border-radius: 8px; padding: 6px 10px; font-weight: 900; }
#city .flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
#city .flash.on { animation: cityflash .45s ease-out; }
@keyframes cityflash { from { opacity: .85; } to { opacity: 0; } }
#city .minimap { position: absolute; top: 10px; right: 62px; width: 190px; height: 190px; border-radius: 50%; cursor: pointer; }
#city.mobile .minimap:not(.big) { width: 118px; height: 118px; top: 8px; } /* Handy: Minikarte kleiner (Wunsch Lionel) */
#city .mapzoom { position: absolute; top: 4%; left: 50%; transform: translateX(-50%); z-index: 9; display: flex; gap: 10px; }
#city .mapzoom[hidden] { display: none; }
#city .mapzoom button { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #fff; background: rgba(15,23,42,.8); color: #fff; font-size: 24px; font-weight: 900; }
#city .minimap.big { touch-action: none; top: 50%; right: 50%; transform: translate(50%, -50%); height: 94%; width: auto; border-radius: 14px; z-index: 8;
  box-shadow: 0 6px 30px rgba(0,0,0,.6); }
#city .tagbtn { position: absolute; top: 10px; left: 148px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid #f87171;
  background: rgba(0,0,0,.4); font-size: 26px; }
#city .tagbtn[hidden], #city .tagbar[hidden] { display: none; }
#city .tagbar { position: absolute; top: 104px; left: 50%; transform: translateX(-50%); background: rgba(30,41,59,.85); border-radius: 12px;
  padding: 6px 16px; font-weight: 900; font-size: 20px; white-space: nowrap; }
#city .tagbar.me { background: #dc2626; animation: cityblink 0.7s infinite alternate; }
#city .jobs { position: absolute; top: 10px; left: 80px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.4); font-size: 26px; }
#city .jobpanel { position: absolute; top: 76px; left: 12px; width: min(380px, 70%); background: rgba(15,18,28,.92); border-radius: 14px;
  padding: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 5; font-size: 18px; }
#city .jobpanel[hidden], #city .goal[hidden] { display: none; }
#city .jobpanel button { border: none; border-radius: 10px; background: #2563eb; color: #fff; font: 700 16px system-ui, sans-serif; padding: 10px; text-align: left; }
#city .jobpanel button.grey { background: #4b5563; } #city .jobpanel button:disabled { opacity: .4; }
#city .goal { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.6); border-radius: 12px;
  padding: 6px 14px; font-weight: 800; font-size: 18px; white-space: nowrap; }
#city .goal .arrow { display: inline-block; color: #facc15; font-size: 22px; transition: transform .1s; }
#city .clock { position: absolute; top: 206px; right: 62px; width: 190px; text-align: center; font-weight: 800; font-size: 17px;
  background: rgba(0,0,0,.45); border-radius: 8px; padding: 3px 0; }
#city .gfx { position: absolute; top: 166px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; } #city .gfx.off { opacity: .45; } #city .gfx[hidden] { display: none; }
#city .cam { position: absolute; top: 58px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#city .quit { position: absolute; top: 10px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#city .msg { position: absolute; top: 30%; width: 100%; text-align: center; font-size: 40px; font-weight: 900;
  text-shadow: 0 3px 10px rgba(0,0,0,.7); pointer-events: none; }
#city .ctl { position: absolute; bottom: 16px; width: 94px; height: 94px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.35); color: #fff; font-size: 30px; font-weight: 900; touch-action: none; }
#city .ctl.on { background: rgba(255,255,255,.4); }
#city .ctl.gas { border-color: #4ade80; } #city .ctl.brake { border-color: #f87171; font-size: 18px; }
#city .walkbtn { position: absolute; top: 112px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#city .walkbtn.ready { background: #16a34a; box-shadow: 0 0 0 3px #bbf7d0; }
#city .blinkers { position: absolute; top: 74px; left: 8px; display: flex; gap: 4px; }
#city .blinkers button { width: 36px; height: 30px; border-radius: 8px; border: 2px solid rgba(255,255,255,.5); background: rgba(0,0,0,.4); color: #fff;
  font-size: 15px; padding: 0; touch-action: manipulation; }
#city .blinkers button.on { background: #f59e0b; border-color: #fde68a; }
#city .horn { position: absolute; top: 10px; left: 12px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.4); font-size: 28px; }
#city .drift { position: absolute; top: 14%; left: 50%; transform: translateX(-50%); background: linear-gradient(90deg, #f97316, #dc2626);
  border-radius: 14px; padding: 6px 18px; font-weight: 900; font-size: 28px; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
#city .drift[hidden] { display: none; }
#city .ctl.hand { width: 84px; height: 84px; font-size: 16px; border-color: #fb923c; }
${flyCss('city')}#city .basebtn { position: absolute; top: 76px; left: 12px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid #facc15;
  background: rgba(0,0,0,.4); font-size: 28px; }
#city .basepanel { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: min(560px, 88%); max-height: calc(100% - 24px); box-sizing: border-box;
  overflow-y: auto; touch-action: none; background: rgba(15,18,28,.94); border-radius: 14px; padding: 12px; z-index: 6; }
#city .basebtn[hidden], #city .basepanel[hidden] { display: none; }
#city .basepanel h3 { margin: 0 0 8px; font-size: 20px; }
#city .basepanel .cars { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#city .basepanel button { border: 2px solid transparent; border-radius: 10px; background: #334155; color: #fff; font: 700 15px system-ui, sans-serif; padding: 8px 10px;
  text-align: left; display: flex; align-items: center; gap: 8px; min-width: 0; }
#city .basepanel button i { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(255,255,255,.5); }
#city .basepanel button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#city .basepanel button small { margin-left: auto; flex: none; opacity: .8; }
#city .basepanel button.sel { border-color: #facc15; background: #475569; }
#city .basepanel button:disabled { opacity: .45; }
#city .basepanel .note { margin: 2px 0 8px; font-size: 14px; opacity: .8; }
#city .talkpanel { top: auto; bottom: 12px; }
#city .talkbtn { position: absolute; bottom: 130px; left: 50%; transform: translateX(-50%); width: 84px; height: 84px; border-radius: 50%;
  border: 3px solid #22c55e; background: #16a34a; color: #fff; font-size: 38px; box-shadow: 0 0 0 6px rgba(34,197,94,.35); }
#city .talkbtn[hidden], #city .shopbtn[hidden] { display: none; }
#city .shopbtn { position: absolute; top: 76px; left: 12px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid #f59e0b;
  background: rgba(0,0,0,.4); font-size: 28px; }
#city .basepanel .row { display: flex; gap: 6px; margin-top: 8px; }
#city .basepanel .row button { flex: 1; justify-content: center; background: #1e293b; }
#city .chase { position: absolute; top: 76px; left: 12px; background: #b91c1c; border-radius: 12px; padding: 6px 12px;
  font-weight: 900; font-size: 18px; animation: cityblink 0.6s infinite alternate; }
@keyframes cityblink { from { background: #b91c1c; } to { background: #1d4ed8; } }
#city .ticket { position: absolute; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; }
#city .ticket[hidden], #city .chase[hidden], #city .wanted[hidden], #city .dest[hidden] { display: none; }
#city .dest { position: absolute; top: 152px; left: 12px; background: rgba(17,24,39,.88); border: 2px solid #ff3df5; border-radius: 12px;
  padding: 4px 10px; font-weight: 900; font-size: 15px; color: #fbcfe8; cursor: pointer; pointer-events: auto; }
#city .wanted { position: absolute; top: 116px; left: 12px; background: rgba(17,24,39,.88); border: 2px solid #ef4444; border-radius: 12px;
  padding: 4px 10px; font-weight: 900; font-size: 15px; color: #fecaca; }
#city .ticket .card { background: #fff8dc; color: #222; border-radius: 16px; padding: 18px 26px; width: min(420px, 80%);
  box-shadow: 0 10px 40px rgba(0,0,0,.6); transform: rotate(-2deg); font-size: 18px; border-top: 14px solid #1d4ed8; }
#city .ticket h2 { margin: 0 0 10px; font-size: 28px; letter-spacing: 1px; }
#city .ticket p { margin: 6px 0; } #city .ticket .note { color: #555; font-size: 15px; } #city .ticket .count { color: #b91c1c; font-weight: 800; }
#city .ticket .pay { margin-top: 10px; font: 800 20px system-ui, sans-serif; color: #fff; background: #16a34a; border: none; border-radius: 12px; padding: 10px 22px; }
#city .hint { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); font-size: 15px; opacity: .85;
  background: rgba(0,0,0,.45); padding: 4px 12px; border-radius: 10px; white-space: nowrap; }
`;

const HINT = '⬅️ ➡️ lenken · ⬆️ Gas · ⬇️ Bremse/rückwärts · Bremse + lenken = driften · H hupen · X aussteigen';
function buildDom() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'city'; if (MOBILE) root.classList.add('mobile'); // Handy: kleinere Minikarte usw.
  root.hidden = true;
  root.innerHTML = `
    <canvas class="minimap" width="190" height="190"></canvas>
    <div class="mapzoom" hidden><button data-z="in" title="Hineinzoomen">＋</button><button data-z="out" title="Hinauszoomen">－</button><button data-z="close" title="Karte schliessen">✕</button></div>
    <div class="clock"></div>
    <button class="quit" title="Stadt verlassen">✕</button>
    <button class="cam" title="Kamera wechseln (V)">📷</button>
    <button class="gfx" title="Grafik: schön oder schnell" hidden>✨</button>
    <button class="horn" title="Hupen (H)">📯</button>
    <div class="blinkers"><button data-b="left" title="Blinker links (,)">◀</button><button data-b="hazard" title="Warnblinker (G)">⚠️</button><button data-b="right" title="Blinker rechts (.)">▶</button></div>
    <button class="walkbtn" title="Aussteigen / einsteigen (X)">🚪</button>
    <button class="jobs" title="Aufträge (J)">📋</button>
    <button class="tagbtn" title="Fangis (online)" hidden>🏃</button>
    <button class="basebtn" title="Base (B)" hidden>🏠</button>
    <div class="basepanel" hidden></div>
    <div class="basepanel dealpanel" hidden></div>
    <div class="basepanel talkpanel" hidden></div>
    <button class="talkbtn" title="Beraten (T)" hidden>💬</button>
    <button class="shopbtn" title="Autohaus öffnen" hidden>🏪</button>
    <div class="tagbar" hidden></div>
    <div class="jobpanel" hidden><b>📋 Aufträge</b>
      <button data-job="taxi">🚕 Taxi: Fahrgast abholen und hinbringen</button>
      <button data-job="pizza">🍕 Pizza: bei der Pizzeria abholen und ausliefern</button>
      <button data-job="thief">🚓 Dieb jagen (nur mit Polizeiauto)</button>
      <button data-job="park">🅿️ Einparken (Parkplatz bei der Werkstatt)</button>
      <button data-job="school">🎓 Fahrschule: Führerschein-Prüfung</button>
      <button data-job="cancel" class="grey">Auftrag abbrechen</button>
      <button data-job="close" class="grey">Schliessen</button></div>
    <div class="goal" hidden><span class="arrow">➤</span> <span class="gtext"></span></div>
    <div class="msg"></div>
    <div class="chase" hidden>🚨 Polizei!</div>
    <div class="wanted" hidden></div>
    <div class="dest" hidden></div>
    <div class="drift" hidden></div>
    <div class="ticket" hidden><div class="card">
      <h2>🚔 STRAFZETTEL</h2>
      <p>Grund: <b class="reason"></b></p>
      <p>Busse: <b class="amount"></b></p>
      <p class="note"></p><p class="count"></p>
      <p class="jailnote" hidden>🔒 Über 140 km/h: 3 Minuten Gefängnis!</p>
      <button class="pay">Okay 👍</button></div></div>
    <div class="speed"><span class="kmh">0</span> km/h<small class="ps"></small></div>
    <div class="cruise" title="Tempomat (C ein/aus, + und − einstellen)"><button data-cr="-">−</button><button data-cr="on" class="cron">🎯 <b>80</b></button><button data-cr="+">+</button></div>
    <div class="limit" hidden></div>
    <div class="fuel" hidden><b></b><span><i></i></span></div>
    <div class="fuel dmg" hidden><b>🔧</b><span><i></i></span></div>
    <div class="jailbar" hidden><span class="jt"></span><button class="bail"></button></div>
    <div class="flash"></div>
    <div class="hint">${HINT}</div>
    <button class="ctl" data-k="left" style="left:16px">◀</button>
    <button class="ctl" data-k="right" style="left:124px">▶</button>
    <button class="ctl brake" data-k="brake" style="right:124px">BREMSE</button>
    <button class="ctl gas" data-k="gas" style="right:16px">GAS</button>
    ${FLY_HTML}`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, gfx: $('.gfx'), mapzoom: $('.mapzoom'), kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), hint: $('.hint'), minimap: $('.minimap'), ctls: [...root.querySelectorAll('.ctl')],
    speed: $('.speed'), cruise: $('.cruise'), cruiseVal: $('.cruise b'), cruiseOn: $('.cruise .cron'), limit: $('.limit'), fuel: $('.fuel'), fuelIcon: $('.fuel b'), fuelBar: $('.fuel i'), dmg: $('.dmg'), dmgBar: $('.dmg i'), jail: $('.jailbar'), jailtime: $('.jailbar .jt'), bail: $('.bail'), flash: $('.flash'), flybtn: $('.flybtn'), flyctl: $('.flyctl'), basebtn: $('.basebtn'), walkbtn: $('.walkbtn'), basepanel: $('.basepanel'), dealpanel: $('.dealpanel'), talkpanel: $('.talkpanel'), talkbtn: $('.talkbtn'), shopbtn: $('.shopbtn'),
    chase: $('.chase'), wanted: $('.wanted'), dest: $('.dest'), ticket: $('.ticket'), drift: $('.drift'), clock: $('.clock'),
    tagbtn: $('.tagbtn'), tagbar: $('.tagbar'),
    jobs: $('.jobs'), jobpanel: $('.jobpanel'), goal: $('.goal'), arrow: $('.goal .arrow'), gtext: $('.goal .gtext') };
  $('.jobs').addEventListener('pointerdown', e => { e.preventDefault(); toggleJobs(); });
  $('.tagbtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleTag(); });
  ui.jobpanel.addEventListener('pointerdown', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    e.preventDefault();
    const j = b.dataset.job;
    ui.jobpanel.hidden = true;
    if (j === 'cancel') endMission(false, '📋 Auftrag abgebrochen');
    else if (j !== 'close') startMission(j);
  });
  $('.pay').addEventListener('pointerdown', e => { e.preventDefault(); closeTicket(); });
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  for (const b of ui.ctls) {
    b.style.display = touch ? '' : 'none';
    const set = on => { if (city) city.input[b.dataset.k] = on; b.classList.toggle('on', on); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* geht auch so */ } set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  }
  if (touch) ui.hint.style.display = 'none';
  $('.quit').addEventListener('pointerdown', e => { e.preventDefault(); if (city) endCity(); });
  $('.cam').addEventListener('pointerdown', e => { e.preventDefault(); nextCam(); });
  // Karte: antippen = gross; gross: ziehen = verschieben, Mausrad oder zwei Finger = zoomen, kurz antippen oder ✕ = schliessen
  const mcv = $('.minimap'), touches = new Map();
  let mdrag = null;
  mcv.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!city) return;
    if (!city.bigMap) { setBigMap(true); return; }
    try { mcv.setPointerCapture(e.pointerId); } catch (err) { /* ohne Zeiger */ }
    touches.set(e.pointerId, mapPoint(e));
    mdrag = { moved: 0, t: performance.now(), p: mapPoint(e) };
  });
  mcv.addEventListener('pointermove', e => {
    if (!city || !city.bigMap || !touches.has(e.pointerId)) return;
    const p = mapPoint(e), old = touches.get(e.pointerId);
    if (touches.size >= 2) { // zwei Finger: zoomen um die Mitte zwischen den Fingern
      const [a, b] = [...touches.entries()].map(([id, q]) => (id === e.pointerId ? p : q)), [a0, b0] = [...touches.values()];
      const d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]), d1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d0 > 5) zoomMap(d1 / d0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    } else panMap(p[0] - old[0], p[1] - old[1]);
    if (mdrag) mdrag.moved += Math.hypot(p[0] - old[0], p[1] - old[1]);
    touches.set(e.pointerId, p);
  });
  const up = e => {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (mdrag && !touches.size) { if (mdrag.moved < 8 && performance.now() - mdrag.t < 400) mapTap(mdrag.p); mdrag = null; } // kurz angetippt: Ziel setzen (oder zu)
    if (touches.size) mdrag = null; // zweiter Finger: nicht schliessen
  };
  mcv.addEventListener('pointerup', up); mcv.addEventListener('pointercancel', up);
  mcv.addEventListener('wheel', e => { if (!city || !city.bigMap) return; e.preventDefault(); const p = mapPoint(e); zoomMap(e.deltaY < 0 ? 1.25 : 0.8, p[0], p[1]); }, { passive: false });
  $('.mapzoom').addEventListener('pointerdown', e => {
    const b = e.target.closest('button'); if (!b || !city) return; e.preventDefault(); e.stopPropagation();
    const cv = S.ui.minimap;
    if (b.dataset.z === 'close') setBigMap(false); else zoomMap(b.dataset.z === 'in' ? 1.5 : 1 / 1.5, cv.width / 2, cv.height / 2);
  });
  $('.gfx').addEventListener('pointerdown', e => { // Grafik umschalten (wird gemerkt)
    e.preventDefault(); if (!S.look) return;
    S.look.on = !S.look.on; setLookWanted(S.look.on); showGfx();
    showMsg(S.look.on ? '✨ Grafik: schön' : '⚡ Grafik: schnell', 1.4);
  });
  $('.horn').addEventListener('pointerdown', e => { e.preventDefault(); honk(); });
  for (const b of root.querySelectorAll('.blinkers button')) b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setBlink(b.dataset.b); });
  $('.walkbtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleWalk(); });
  $('.bail').addEventListener('pointerdown', e => { e.preventDefault(); bail(); });
  $('.flybtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleFly(); });
  $('.basebtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleBase(); });
  ui.basepanel.addEventListener('click', onBaseClick);
  ui.dealpanel.addEventListener('click', onDealerClick);
  ui.cruise.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { cruiseCmd(b.dataset.cr); b.blur(); } });
  ui.talkpanel.addEventListener('click', onTalkClick);
  $('.talkbtn').addEventListener('pointerdown', e => { e.preventDefault(); startTalk(); });
  $('.shopbtn').addEventListener('pointerdown', e => { e.preventDefault(); openDealer(); });
  // Liste mit dem Finger schieben (von Hand: im Hochformat ist alles um 90° gedreht)
  let drag = null;
  ui.basepanel.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, top: ui.basepanel.scrollTop }; baseDragged = false; });
  ui.basepanel.addEventListener('pointermove', e => {
    if (!drag) return;
    const d = window.innerHeight > window.innerWidth ? drag.x - e.clientX : e.clientY - drag.y;
    if (Math.abs(d) > 8) baseDragged = true;
    if (baseDragged) ui.basepanel.scrollTop = drag.top - d;
  });
  for (const ev of ['pointerup', 'pointercancel']) ui.basepanel.addEventListener(ev, () => { drag = null; });
  ui.dest.addEventListener('pointerdown', e => { e.preventDefault(); if (city) { clearDest(); showMsg('📍 Ziel gelöscht', 1.2); } });
  root.addEventListener('contextmenu', e => e.preventDefault());
  return ui;
}

function toggleFly() {
  if (!city || !city.canFly || city.walk || city.jail || city.plane || city.boat) return;
  const me = city.me;
  if (!me.fly && (city.pulled > 0 || city.ticket || (city.police && city.police.state === 'stop'))) return;
  flyToggle(me, me.alt);
  if (!me.landing) showMsg(flyHelp(), 2);
}

function honk() {
  if (!city || city.hornT > 0) return;
  city.hornT = 0.5;
  horn(1, 0.45);
  for (const c of city.cars) { // Autos vor dir erschrecken und bremsen kurz
    const dx = c.x - city.me.pos.x, dz = c.z - city.me.pos.z;
    if (Math.hypot(dx, dz) < 20) c.blocked = Math.max(c.blocked, 0.6);
  }
  for (const p of city.peds || []) if (!(p.down > 0) && p.sayT <= 0 && Math.hypot(p.x - city.me.pos.x, p.z - city.me.pos.z) < 18) { // Fussgänger antworten
    pedSay(p, PED_TYPES[p.type].honk);
    if (p.type === 'dog' && window.beep) { window.beep(520, 0.07, 'square', 0.04); window.beep(480, 0.07, 'square', 0.04, 0.16); }
  }
}

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift', ...FLY_KEYS };
function onKey(e) {
  if (!city || (e.target && e.target.tagName === 'INPUT')) return; // im Chat wird geschrieben, nicht gefahren
  if (e.code === 'KeyH' && e.type === 'keydown') { honk(); e.preventDefault(); return; }
  if (e.type === 'keydown' && !e.repeat && (e.code === 'Comma' || e.code === 'Period' || e.code === 'KeyG')) { // Blinker , . und Warnblinker G
    setBlink(e.code === 'Comma' ? 'left' : e.code === 'Period' ? 'right' : 'hazard'); e.preventDefault(); return; }
  if (e.code === 'KeyJ' && e.type === 'keydown') { toggleJobs(); e.preventDefault(); return; }
  if (e.code === 'KeyV' && e.type === 'keydown') { nextCam(); e.preventDefault(); return; }
  if (e.code === 'KeyF' && e.type === 'keydown' && !e.repeat) { toggleFly(); e.preventDefault(); return; }
  if (e.code === 'KeyB' && e.type === 'keydown' && !e.repeat) { toggleBase(); e.preventDefault(); return; }
  if (e.code === 'KeyX' && e.type === 'keydown' && !e.repeat) { toggleWalk(); e.preventDefault(); return; }
  if (e.code === 'KeyT' && e.type === 'keydown' && !e.repeat) { startTalk(); e.preventDefault(); return; }
  const k = KEYS[e.code];
  if (!k) return;
  city.input[k] = e.type === 'keydown';
  e.preventDefault();
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight, rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  const st = S.ui.root.style;
  st.width = w + 'px'; st.height = h + 'px';
  st.left = (vw - w) / 2 + 'px'; st.top = (vh - h) / 2 + 'px';
  st.transform = rotated ? 'rotate(90deg)' : 'none';
  S.renderer.setSize(w, h, false);
  if (S.look) S.look.setSize(w, h);
  S.camera.aspect = w / h;
  S.camera.updateProjectionMatrix();
}

function showMsg(text, secs = 1.6) {
  S.ui.msg.textContent = text;
  city.msgT = secs;
}

// Minikarte: Strassen grau, Parks grün, Brunnen blau, Autos weiss, du gelb
const MAP = 190, mapScale = (MAP - 12) / (2 * (HALF + 12));
const mx = x => MAP / 2 + x * mapScale;
const _mp = { x: 0, z: 0 }, mp = (x, z) => warpXZ(x, z, _mp); // Karte zeigt die Stadt verbogen wie im Bild
const mpx = (x, z) => mx(mp(x, z).x), mpz = (x, z) => mx(mp(x, z).z);
// ---------- Karte ----------
// Eine Weltkarte für alles: Stadt (verbogen wie im Bild), Vororte, Autobahn, Hafen, Flughafen, Strand, Pass, Alp, Skigebiet,
// Raumbahnhof. Das feste Bild (S.worldMap) wird nur neu gemalt, wenn sich Schlüssel ändern (gesperrte Gebiete grau).
// Oben rechts: runder Ausschnitt um dich (vorne = oben); antippen = ganze Karte mit Namen (city.bigMap). Auf dem Mond eigene Karte.
const WM = { x0: -2700, x1: 1800, z0: -1650, z1: 3300, K: 0.45 }; // ganze Insel mit Meer drumherum; Bildpunkte pro Meter
const WMW = Math.round((WM.x1 - WM.x0) * WM.K), WMH = Math.round((WM.z1 - WM.z0) * WM.K);
const DM = { x0: -720, x1: 800, z0: -330, z1: 420, K: 1.1 }; // Stadt und Vororte genauer (eigenes Bild darüber)
const SEA_COL = '#2f74b5';
const _wq = { x: 0, z: 0 };
const wmPt = (x, z) => { warpXZ(x, z, _wq); return [(_wq.x - WM.x0) * WM.K, (_wq.z - WM.z0) * WM.K]; };
const PLACE_ICONS = [['gas', '⛽'], ['wash', '🫧'], ['pizza', '🍕'], ['jail', '🔒'], ['repair', '🔧'], ['dealer', '🚗'], ['hospital', '🏥'], ['house', '🏡'], ['blue', '🅿️'], ['park', '🅿️'], ['order', '🍔'], ['kino', '🎬'], ['stadium', '⚽']];
// Insel und Meer Punkt für Punkt: tiefes Meer, helles Wasser an der Küste, Sand, Wiese
function paintIsland(g, x0, z0, W, H, K) {
  const img = g.createImageData(W, H), d = img.data, sea = [47, 116, 181], shallow = [92, 168, 214], sand = [233, 216, 166], grass = [63, 110, 58];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = x0 + (px + 0.5) / K, z = z0 + (py + 0.5) / K, t = landDist(x, z), i = (py * W + px) * 4;
    const c = t > 14 ? grass : t > 0 ? sand : t > -40 ? shallow : sea, f = t <= 0 && t > -40 ? -t / 40 : 0;
    d[i] = f ? shallow[0] + (sea[0] - shallow[0]) * f : c[0]; d[i + 1] = f ? shallow[1] + (sea[1] - shallow[1]) * f : c[1]; d[i + 2] = f ? shallow[2] + (sea[2] - shallow[2]) * f : c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
// Alles auf der Insel malen; P(x, z) → Bildpunkt, K = Bildpunkte pro Meter
function paintWorld(g, P, K) {
  const keys = city.keys.size;
  const rect = (b, col) => { const [x0, y0] = P(b.x0, b.z0), [x1, y1] = P(b.x1, b.z1); g.fillStyle = col; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const line = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, z], k) => { const [a, b] = P(x, z); k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
  rect({ x0: -702, x1: -646, z0: -660, z1: -170 }, '#ecd9a0'); line([[-646, -192], [-HALF, -192]], '#cbd5e1', 14 * K); // Strand und Strasse
  for (const A of Object.values(AREAS)) { rect(A.rect, keys >= A.need ? '#a3aab4' : '#4b5563'); rect(A.road, '#cbd5e1'); }
  rect({ x0: -270, x1: 310, z0: 605, z1: 655 }, '#e5e7eb'); // Piste
  { const [x, y] = P(SKI.x, SKI.z); g.fillStyle = '#eef4fa'; g.beginPath(); g.arc(x, y, SKI.r * K, 0, 7); g.fill(); } // Skigebiet
  rect(FARM, '#8fb04a'); // Alp
  line(passPoints().filter((p, i) => i % 3 === 0).map(p => [p.x, p.z]), keys >= PASS_AREA.need ? '#d4d8de' : '#6b7280', 10 * K);
  line([[HALF + 7, 192], [SPACE.x, SPACE.z]], '#cbd5e1', 14 * K); { const [x, y] = P(SPACE.x, SPACE.z); g.fillStyle = '#cbd5e1'; g.beginPath(); g.arc(x, y, SPACE.r * K, 0, 7); g.fill(); }
  const hw = []; for (let s = 0; s <= HW_LEN; s += 30) { const p = hwPoint(s); hw.push([p.x, p.z]); }
  line(hw, '#e2e5ea', Math.max(3, 30 * K)); line(hw, '#facc15', 1); // Autobahn mit Mittellinie
  for (const b of ROADS) rect(b, '#d4d8de'); // Zubringer (Flughafenstrasse, Raumbahnhof)
  for (const sl of SLIPS) line(sl.map(p => [p.x, p.z]), '#d4d8de', Math.max(2, 9 * K)); // geschwungene Aus- und Einfahrten
  for (const e of EXITS) { const p = hwPoint(e.s), [x, y] = P(p.x - p.tz * 24, p.z + p.tx * 24); g.fillStyle = '#1d4ed8'; g.beginPath(); g.arc(x, y, Math.max(3, 12 * K), 0, 7); g.fill(); } // Ausfahrten
  rect({ x0: REST.x - 150, x1: REST.x + 150, z0: REST.z + 20, z1: REST.z + 130 }, '#f59e0b'); // Raststätte
  drawSuburbs(g, P, K); // Vororte
  // Diamantinsel: Fährlinie, Strassen, Villen, Kai, Piste, Palast
  g.save(); g.setLineDash([8 * K, 8 * K]); line(FERRY_PATH, 'rgba(255,255,255,0.75)', Math.max(1.5, 3 * K)); g.restore();
  for (const R of MON_ROADS) line(R.line, '#dfe3ea', 9 * K);
  g.fillStyle = '#f5f5f4'; for (const v of S.monaco.villas) { const [x, y] = P(v.x, v.z); g.fillRect(x - 6 * K, y - 6 * K, 12 * K, 12 * K); }
  rect({ x0: MONACO.x + 225, x1: MONACO.x + 290, z0: MONACO.z - 70, z1: MONACO.z + 70 }, '#cbd5e1');
  rect({ x0: MONACO.x - 160, x1: MONACO.x + 140, z0: MONACO.z + 255, z1: MONACO.z + 285 }, '#9ca3af');
  { const [x, y] = P(MONACO.x - 4, MONACO.z - 14); g.fillStyle = '#f9a8d4'; g.fillRect(x - 17 * K, y - 7 * K, 34 * K, 14 * K); }
  // Stadt: Fläche (verbogen), Parks, Strassen, Fussgängerzonen, Kreisel
  g.fillStyle = '#7b8490'; g.beginPath();
  for (let k = 0; k < 64; k++) { const t = (k % 16) / 16 * 2 - 1, side = k >> 4, q = P(...[[t * HALF, -HALF], [HALF, t * HALF], [-t * HALF, HALF], [-HALF, -t * HALF]][side]); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
  g.closePath(); g.fill();
  for (const key of MASK) { // freie Blöcke am Rand: Grün (Umriss wie eine echte Stadt)
    const [bi, bj] = key.split(',').map(Number);
    const x0 = node(bi) - ROAD / 2, z0 = node(bj) - ROAD / 2, L = BLOCK + ROAD, ring = [];
    for (let k = 0; k < 4; k++) ring.push([x0 + L * k / 4, z0]); for (let k = 0; k < 4; k++) ring.push([x0 + L, z0 + L * k / 4]);
    for (let k = 0; k < 4; k++) ring.push([x0 + L - L * k / 4, z0 + L]); for (let k = 0; k < 4; k++) ring.push([x0, z0 + L - L * k / 4]);
    g.fillStyle = '#3f7a33'; g.beginPath(); ring.forEach(([x, z], k) => { const q = P(x, z); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.fill();
  }
  drawSuburbs(g, P, K); // Quartiere mit Gassen in der Stadt (über dem Grün)
  for (const key of S.parks) {
    const [bi, bj] = key.split(',').map(Number), x0 = node(bi) + 7, z0 = node(bj) + 7, L = BLOCK - 14, pts = [];
    for (let k = 0; k < 4; k++) pts.push([x0 + L * k / 4, z0]); for (let k = 0; k < 4; k++) pts.push([x0 + L, z0 + L * k / 4]);
    for (let k = 0; k < 4; k++) pts.push([x0 + L - L * k / 4, z0 + L]); for (let k = 0; k < 4; k++) pts.push([x0, z0 + L - L * k / 4]);
    g.fillStyle = '#4a8f3c'; g.beginPath(); pts.forEach(([x, z], k) => { const q = P(x, z); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.fill();
  }
  for (let i = 0; i <= N; i++) for (const ax of [0, 1]) for (let k = 0; k < N; k++) {
    if (ax ? !segOn(k, i, 0) : !segOn(i, k, 1)) continue; // keine Strasse (freier Block)
    const ped = ax ? isPed(k, i, 0) : isPed(i, k, 1), pts = [];
    for (let t = node(k); t <= node(k + 1) + 0.1; t += 8) pts.push(ax ? [t, node(i)] : [node(i), t]);
    line(pts, ped ? '#e8d6aa' : '#dfe3ea', ped ? 6 * K : ROAD * K);
  }
  for (const key of ROUND) { const [i, j] = key.split(',').map(Number), q = P(node(i), node(j)); g.fillStyle = '#4a9b3f'; g.beginPath(); g.arc(q[0], q[1], 3.5 * K, 0, 7); g.fill(); }
  { const q = P(32, 32); g.fillStyle = '#4aa3ff'; g.beginPath(); g.arc(q[0], q[1], 4 * K, 0, 7); g.fill(); } // Brunnen
}
const CPU2D = { willReadFrequently: true };
const mapBlank = cv => { try { const d = cv.getContext('2d', CPU2D).getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data; return d[3] === 0; } catch (e) { return false; } }; // Mitte ist immer Land (gemalt)
function drawWorldMap() {
  const c = S.worldMap || (S.worldMap = document.createElement('canvas'));
  c.width = WMW; c.height = WMH;
  // Karten-Bilder im Arbeitsspeicher malen (nicht auf der Grafikkarte): dort blieben sie bei knappem Grafikspeicher leer (Karte ganz blau)
  const g = c.getContext('2d', CPU2D);
  if (!S.islandImg) { // Insel und Meer ändern sich nie: einmal rechnen
    const ic = document.createElement('canvas'); ic.width = WMW; ic.height = WMH; paintIsland(ic.getContext('2d', CPU2D), WM.x0, WM.z0, WMW, WMH, WM.K); S.islandImg = ic;
    const dc = document.createElement('canvas'); dc.width = Math.round((DM.x1 - DM.x0) * DM.K); dc.height = Math.round((DM.z1 - DM.z0) * DM.K);
    paintIsland(dc.getContext('2d', CPU2D), DM.x0, DM.z0, dc.width, dc.height, DM.K); S.islandDet = dc;
  }
  g.drawImage(S.islandImg, 0, 0);
  paintWorld(g, wmPt, WM.K);
  // genaueres Bild für Stadt und Vororte (wird beim Zeichnen über die Weltkarte gelegt)
  const d = S.worldDet || (S.worldDet = document.createElement('canvas'));
  d.width = S.islandDet.width; d.height = S.islandDet.height;
  const dg = d.getContext('2d', CPU2D); dg.drawImage(S.islandDet, 0, 0);
  paintWorld(dg, (x, z) => { warpXZ(x, z, _wq); return [(_wq.x - DM.x0) * DM.K, (_wq.z - DM.z0) * DM.K]; }, DM.K);
  S.worldMapKey = city.keys.size;
}
// Weltkarte zeichnen (im aktuellen Koordinatensystem = Bildpunkte der Weltkarte); das genaue Stadtbild liegt darüber
function blitWorld(g) {
  g.drawImage(S.worldMap, 0, 0);
  g.drawImage(S.worldDet, (DM.x0 - WM.x0) * WM.K, (DM.z0 - WM.z0) * WM.K, (DM.x1 - DM.x0) * WM.K, (DM.z1 - DM.z0) * WM.K);
}
const mapWho = () => { const w = city.walk, me = city.me; return w ? { x: w.x, z: w.z, h: w.h } : { x: me.pos.x, z: me.pos.z, h: me.heading }; };
function mapArrow(g, x, y, h, k = 1) {
  g.fillStyle = '#ffe066'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + Math.cos(h) * 8 * k, y + Math.sin(h) * 8 * k);
  g.lineTo(x + Math.cos(h + 2.5) * 6 * k, y + Math.sin(h + 2.5) * 6 * k);
  g.lineTo(x + Math.cos(h - 2.5) * 6 * k, y + Math.sin(h - 2.5) * 6 * k);
  g.closePath(); g.fill(); g.stroke();
}
// Grosse Karte: Zoom (1 = ganze Insel) und Mitte (in Bildpunkten der Weltkarte); Verschieben bleibt innerhalb der Karte
function mapView(W, H) {
  const z = city.mapZoom || 1, scale = Math.min(W / WMW, H / WMH) * z, hw = W / 2 / scale, hh = H / 2 / scale;
  const cx = WMW > 2 * hw ? Math.max(hw, Math.min(WMW - hw, city.mapCX ?? WMW / 2)) : WMW / 2;
  const cy = WMH > 2 * hh ? Math.max(hh, Math.min(WMH - hh, city.mapCY ?? WMH / 2)) : WMH / 2;
  city.mapCX = cx; city.mapCY = cy;
  return { scale, ox: W / 2 - cx * scale, oy: H / 2 - cy * scale };
}
function setBigMap(on) {
  city.bigMap = on;
  const cv = S.ui.minimap; // gross: hochkant wie die ganze Welt (WMW × WMH)
  cv.width = on ? 620 : MAP; cv.height = on ? Math.round(620 * WMH / WMW) : MAP; cv.classList.toggle('big', on);
  S.ui.mapzoom.hidden = !on;
  if (on) { city.mapZoom = 1; city.mapCX = city.mapCY = null; }
  drawMinimap();
}
function zoomMap(f, px, py) { // um den Punkt (px, py) auf der Karte zoomen: er bleibt unter dem Finger
  const cv = S.ui.minimap, W = cv.width, H = cv.height, v = mapView(W, H), mx = (px - v.ox) / v.scale, my = (py - v.oy) / v.scale;
  city.mapZoom = Math.max(1, Math.min(10, (city.mapZoom || 1) * f));
  const s2 = Math.min(W / WMW, H / WMH) * city.mapZoom;
  city.mapCX = mx - (px - W / 2) / s2; city.mapCY = my - (py - H / 2) / s2;
  drawMinimap();
}
function panMap(dx, dy) {
  const cv = S.ui.minimap, v = mapView(cv.width, cv.height);
  city.mapCX -= dx / v.scale; city.mapCY -= dy / v.scale;
  drawMinimap();
}
// Bildschirm → Bildpunkt auf der Karte (auch wenn das Spiel auf dem Handy hochkant um 90° gedreht ist)
function mapPoint(e) {
  const cv = S.ui.minimap, r = cv.getBoundingClientRect(), rot = (S.ui.root.style.transform || '').includes('rotate');
  return rot ? [(e.clientY - r.top) * cv.width / r.height, (r.right - e.clientX) * cv.height / r.width]
    : [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
}
// ---------- Navi ----------
// Auf der grossen Karte antippen = Ziel (📍) setzen; beim eigenen Pfeil antippen = Karte zu; aufs Ziel antippen = Ziel weg.
// Der Weg führt durch die Strassen der Stadt (Breitensuche über die Kreuzungen, bfs), draussen in gerader Linie zum Ziel.
// Zu sehen: Linie auf Karte und Minikarte, Lichtstrahl am Ziel, Abstand oben links (antippen = Ziel löschen).
function unwarpXZ(x, z) { // Bild → Gitter (Umkehrung von warpXZ, ein paar Schritte genügen)
  let gx = x, gz = z;
  for (let k = 0; k < 8; k++) { warpXZ(gx, gz, _wq2); gx += x - _wq2.x; gz += z - _wq2.z; }
  return { x: gx, z: gz };
}
const _wq2 = { x: 0, z: 0 };
function mapTap(p) {
  const cv = S.ui.minimap, v = mapView(cv.width, cv.height), K = WM.K;
  const W = unwarpXZ((p[0] - v.ox) / v.scale / K + WM.x0, (p[1] - v.oy) / v.scale / K + WM.z0);
  const toS = (x, z) => { const [a, b] = wmPt(x, z); return [v.ox + a * v.scale, v.oy + b * v.scale]; }, P = mapWho();
  const [pa, pb] = toS(P.x, P.z);
  if (Math.hypot(p[0] - pa, p[1] - pb) < 22) { setBigMap(false); return; } // beim eigenen Pfeil: einfach zu
  if (city.dest) { const [da, db] = toS(city.dest.x, city.dest.z); if (Math.hypot(p[0] - da, p[1] - db) < 18) { clearDest(); setBigMap(false); return; } }
  setDest(W.x, W.z);
  setBigMap(false);
}
function setDest(x, z) {
  city.dest = { x, z }; city.routeT = 0;
  if (!S.destBeam) {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xff3df5, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 16, 1, true), m); beam.position.y = 80; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 32).rotateX(-Math.PI / 2), m); ring.position.y = 0.3; g.add(ring);
    S.destBeam = g; S.scene.add(g);
  }
  S.destBeam.visible = true;
  showMsg('📍 Ziel gesetzt – folge der leuchtenden Linie auf der Karte', 2.4);
}
function clearDest() { city.dest = null; city.route = null; if (S.destBeam) S.destBeam.visible = false; S.ui.dest.hidden = true; }
function nearNode(x, z) { // nächste Kreuzung mit Strassen
  let best = null, bd = Infinity;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { if (!nodeSegs(i, j)) continue; const d = Math.hypot(node(i) - x, node(j) - z); if (d < bd) { bd = d; best = [i, j]; } }
  return best;
}
function makeRoute(P, D) {
  const inC = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < HALF + 40, pts = [[P.x, P.z]];
  if (inC(P.x, P.z) || inC(D.x, D.z)) { // durch die Stadt: von der Kreuzung bei dir zur Kreuzung beim Ziel (oder zum Stadtrand Richtung Ziel)
    const a = nearNode(P.x, P.z), b = nearNode(D.x, D.z);
    for (const [i, j] of bfs(a, b)) pts.push([node(i), node(j)]);
  }
  pts.push([D.x, D.z]);
  return pts;
}
function stepRoute(dt) {
  const D = city.dest;
  if (!D) return;
  const P = mapWho(), d = Math.hypot(P.x - D.x, P.z - D.z);
  if (d < 14) { clearDest(); showMsg('🏁 Angekommen!', 2); window.beep && window.beep(1047, 0.2, 'triangle', 0.07); return; }
  if ((city.routeT -= dt) <= 0) { city.routeT = 0.6; city.route = makeRoute(P, D); }
  S.destBeam.position.set(D.x, groundAt(D.x, D.z), D.z);
  S.destBeam.children[0].material.opacity = 0.28 + Math.sin(city.t * 4) * 0.08;
  const ui = S.ui.dest; ui.hidden = false;
  ui.textContent = '📍 ' + (d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d / 10) * 10 + ' m') + '  ✕';
}
function drawRoute(g, toS, big) {
  const R = city.route, D = city.dest;
  if (!R || !D) return;
  g.lineJoin = g.lineCap = 'round';
  for (const [w, col] of [[big ? 6 : 8, 'rgba(0,0,0,0.45)'], [big ? 3.5 : 5, '#ff3df5']]) {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    R.forEach(([x, z], k) => { const [a, b] = toS(x, z); k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
  }
  const [a, b] = toS(D.x, D.z); g.font = (big ? 20 : 22) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('📍', a, b + 3);
}
// Alle Menschen, mit denen man zusammenstossen kann (Auto und zu Fuss)
function people() {
  const out = city.peds ? city.peds.slice() : [];
  for (const v of city.victims || []) out.push(v);
  if (city.police && city.police.cop) out.push(city.police.cop);
  return out;
}
// Spielfigur von oben (zu Fuss): Schultern im Pulli, Kopf mit Kappe, gelber Pfeil zeigt, wohin sie schaut
function mapPerson(g, x, y, h, k = 1) {
  g.save(); g.translate(x, y); g.rotate(h); g.lineWidth = 1.5; g.strokeStyle = '#000';
  g.fillStyle = '#ffe066'; g.beginPath(); g.moveTo(12 * k, 0); g.lineTo(7 * k, -3.5 * k); g.lineTo(7 * k, 3.5 * k); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#dc2626'; g.beginPath(); g.ellipse(-0.5 * k, 0, 3.6 * k, 6.5 * k, 0, 0, 7); g.fill(); g.stroke(); // Schultern
  g.fillStyle = '#facc15'; g.fillRect(-4.6 * k, -2.6 * k, 2.4 * k, 5.2 * k); // Rucksack
  g.fillStyle = '#1d4ed8'; g.beginPath(); g.arc(0.6 * k, 0, 3.4 * k, 0, 7); g.fill(); g.stroke(); // Kopf mit Kappe
  g.fillStyle = '#1d4ed8'; g.fillRect(3 * k, -2 * k, 2.4 * k, 4 * k); // Schirm
  g.restore();
}
// Auto von oben (geparkte Autos und dein Auto, wenn du zu Fuss bist)
function mapCar(g, x, y, h, col, k = 1) {
  g.save(); g.translate(x, y); g.rotate(h); g.fillStyle = col || '#888'; g.strokeStyle = '#fff'; g.lineWidth = 1.2;
  g.beginPath(); g.roundRect(-4.5 * k, -2.4 * k, 9 * k, 4.8 * k, 1.6 * k); g.fill(); g.stroke();
  g.fillStyle = 'rgba(15,23,42,0.75)'; g.fillRect(0.6 * k, -1.7 * k, 1.8 * k, 3.4 * k); // Frontscheibe
  g.restore();
}
// Namen auf der grossen Karte (gesperrte Gebiete mit Schloss und Anzahl Schlüssel)
function mapLabels() {
  const keys = city.keys.size, lock = (name, need) => (keys >= need ? name : '🔒 ' + name + ' (' + need + ' 🔑)');
  const L = [['🏙️ Stadt', 0, -HALF - 40], ['⛷️ Skigebiet', SKI.x, SKI.z], ['🐄 Alp', (FARM.x0 + FARM.x1) / 2, FARM.z0 - 30], ['🚀 Raumbahnhof', SPACE.x, SPACE.z + 50],
    ['🛣️ Raststätte', REST.x, REST.z + 170], ['🏖️ Strand', -674, -700], [lock('⛰️ Pass', PASS_AREA.need), SUMMIT.x, SUMMIT.z + 60], ['🛣️ Autobahn', -HW.half - HW.R + 80, 1500], ['🌉 Brücke', -HW.half - HW.R + 90, -160]];
  L.push([MON_NAME, MONACO.x, MONACO.z - 330]);
  for (const S2 of SUBURBS) L.push([S2.name, (S2.rect.x0 + S2.rect.x1) / 2, S2.rect.z0 - 25]);
  for (const A of Object.values(AREAS)) L.push([lock(A.name, A.need), (A.rect.x0 + A.rect.x1) / 2, (A.rect.z0 + A.rect.z1) / 2]);
  return L;
}
function drawMinimap() {
  const cv = S.ui.minimap, g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  if (city.moonOn) { // Mond: eigene kleine Karte
    if (!S.mapFull) { S.mapFull = document.createElement('canvas'); S.mapFull.width = S.mapFull.height = MAP * 3; }
    const fg = S.mapFull.getContext('2d'); fg.setTransform(3, 0, 0, 3, 0, 0); fg.clearRect(0, 0, MAP, MAP);
    const p = drawMoonMap(fg), sq = Math.min(W, H);
    g.drawImage(S.mapFull, (W - sq) / 2, (H - sq) / 2, sq, sq); mapArrow(g, (W - sq) / 2 + p.x * sq / MAP, (H - sq) / 2 + p.y * sq / MAP, p.h, 1.2);
    return;
  }
  // Kartenbilder können leer werden (Browser wirft bei knappem Grafikspeicher den Inhalt weg: Karte ganz blau) → alle 2 s prüfen, sonst neu malen
  const nowT = performance.now();
  if (S.worldMap && !(nowT - S.mapCheckT < 2000)) { S.mapCheckT = nowT; if (mapBlank(S.worldMap) || mapBlank(S.worldDet)) { S.islandImg = null; S.worldMapKey = -1; } }
  if (!S.worldMap || S.worldMapKey !== city.keys.size) drawWorldMap();
  const P = mapWho(), K = WM.K, [pbx, pby] = wmPt(P.x, P.z), [hx, hy] = wmPt(P.x + Math.cos(P.h), P.z + Math.sin(P.h)), hd = Math.atan2(hy - pby, hx - pbx);
  // Abbildung Welt → Bildschirm: gross = ganze Karte eingepasst; klein = um dich herum, gedreht, gezoomt (in der Stadt näher)
  let toS, scale;
  if (city.bigMap) {
    const v = mapView(W, H); scale = v.scale; const ox = v.ox, oy = v.oy;
    toS = (x, z) => { const [a, b] = wmPt(x, z); return [ox + a * scale, oy + b * scale]; };
    g.fillStyle = SEA_COL; g.fillRect(0, 0, W, H); // Meer bis zum Rand: kein Ende zu sehen
    g.save(); g.translate(ox, oy); g.scale(scale, scale); blitWorld(g); g.restore();
  } else {
    const near = Math.max(Math.abs(P.x), Math.abs(P.z)) < LIMIT + 20 || inSuburb(P.x, P.z) || inMonaco(P.x, P.z);
    city.mapS = (city.mapS || 0.9) + ((near ? 0.9 : 0.35) - (city.mapS || 0.9)) * 0.08; // Meter → Bildpunkte, sanft
    scale = city.mapS / K; const a = -hd - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    toS = (x, z) => { const [u, v] = wmPt(x, z), dx = (u - pbx) * scale, dy = (v - pby) * scale; return [W / 2 + dx * ca - dy * sa, H / 2 + dx * sa + dy * ca]; };
    g.save(); g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); g.clip();
    g.fillStyle = SEA_COL; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.rotate(a); g.scale(scale, scale); g.translate(-pbx, -pby); blitWorld(g);
    g.restore();
    g.save(); g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); g.clip();
  }
  const big = city.bigMap, dot = (x, z, col, r) => { const [a, b] = toS(x, z); g.fillStyle = col; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); };
  const icon = (t, x, z, size = 13) => { const [a, b] = toS(x, z); g.font = size + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, a, b); };
  for (const [k, ic] of PLACE_ICONS) { const p = S.places[k]; if (p) icon(ic, p.x ?? p.cx, p.z ?? p.cz, big ? 11 : 13); }
  for (const q of SUB_PLACES) icon(q.icon, q.x, q.z, big ? 10 : 13);
  for (const q of S.places.services) icon('⛽', q.x, q.z, big ? 11 : 13); // Tankstellen mit Werkstatt
  if (city.works) { const W2 = city.works, [a, b] = toS(node(W2.a[0]), node(W2.a[1])), [c2, d2] = toS(node(W2.b[0]), node(W2.b[1])); g.strokeStyle = '#f97316'; g.lineWidth = 4; g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke(); }
  for (const c of city.cars) if (!c.off) dot(c.x, c.z, '#ffffff', big ? 1.3 : 1.8);
  for (const c of city.hw || []) if (c.dir) dot(c.x, c.z, '#fde047', big ? 1 : 1.6);
  for (const c of S.monCars || []) dot(c.x, c.z, '#facc15', big ? 1.3 : 1.8); // teure Autos auf der Diamantinsel
  if (city.ferry) icon('⛴️', city.ferry.pose.x, city.ferry.pose.z, big ? 13 : 15);
  S.places.bases.forEach((B, s) => { if (s === city.baseSlot) icon('🏠', B.x, B.z, big ? 12 : 14); else if (baseOwner(s)) dot(B.x, B.z, BASE_COLORS[s], 3.5); });
  if (city.police) dot(city.police.pos.x, city.police.pos.z, Math.floor(city.t * 6) % 2 ? '#3b82f6' : '#ef4444', 4.5);
  const it = city.net ? tagState() : null;
  if (city.netCars) for (const o of city.netCars.list()) { // Mitspieler, wer bei Fangis dran ist, mit rotem Ring
    const [a, b] = toS(o.x, o.z); g.fillStyle = o.color; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(a, b, 5, 0, 7); g.fill(); g.stroke();
    if (it && it.it === o.slot) { g.strokeStyle = Math.floor(city.t * 4) % 2 ? '#ff2020' : '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(a, b, 9, 0, 7); g.stroke(); }
  }
  const dirS = (x, z, h) => { const [a, b] = toS(x, z), [c2, d2] = toS(x + Math.cos(h) * 3, z + Math.sin(h) * 3); return [a, b, Math.atan2(d2 - b, c2 - a)]; };
  for (const P of city.parked) { const [a, b, hh] = dirS(P.x, P.z, P.h); mapCar(g, a, b, hh, P.v.color, big ? 0.8 : 1); } // geparkte Autos
  if (city.walk && !city.boat) { const me = city.me, [a, b, hh] = dirS(me.pos.x, me.pos.z, me.heading); mapCar(g, a, b, hh, me.v.color, big ? 1 : 1.25); } // dein Auto
  for (const c of city.cars) if (c.wreck > 0) icon('⚠️', c.x, c.z, 11); // Unfälle
  if (city.truck) icon('🚚', city.truck.x, city.truck.z, 11);
  drawRoute(g, toS, big); // Navi
  const M = city.mission;
  if (M && M.target) { const [a, b] = toS(M.target.x, M.target.z); g.fillStyle = Math.floor(city.t * 4) % 2 ? M.color : '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(a, b, 5.5, 0, 7); g.fill(); g.stroke(); }
  if (big) {
    g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.fillStyle = '#fff';
    for (const [t, x, z] of mapLabels()) { const [a, b] = toS(x, z); g.strokeText(t, a, b); g.fillText(t, a, b); }
    const [a, b] = toS(P.x, P.z); if (city.walk) mapPerson(g, a, b, hd, 1.2); else mapArrow(g, a, b, hd, 1.4);
    g.font = 'bold 14px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = '#fff'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)';
    const help = (city.mapZoom > 1.01 ? 'ziehen = verschieben · ' + city.mapZoom.toFixed(1) + '×' : 'zoomen: ＋ − · Mausrad · zwei Finger') + ' · antippen = 📍 Ziel'; g.strokeText(help, W - 10, H - 12); g.fillText(help, W - 10, H - 12);
    return;
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); g.stroke();
  const na = -hd - Math.PI, nr = W / 2 - 12; // Norden am Rand
  g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText('N', W / 2 + Math.cos(na) * nr, H / 2 + Math.sin(na) * nr);
  if (city.walk) mapPerson(g, W / 2, H / 2, -Math.PI / 2, 1.1); else mapArrow(g, W / 2, H / 2, -Math.PI / 2, 1.1); // zu Fuss: Spielfigur
}

// ---------- Start, Schleife, Ende ----------
// net (nur online): Mitspieler fahren mit (netcars.js); Verkehr und Polizei rechnet jedes Gerät für sich
// Werte, die vom Fahrzeug abhängen (beim Start und beim Wechseln in der Base)
// Höchstens 198 km/h – ausser LIONEL X: 300 km/h (und zieht entsprechend kräftiger an)
const LIONEL_MAX = 300 / 3.6;
function carStats(v, mesh, kinds, topSpeed) {
  const lionel = v.kind === 'lionelx';
  return { maxV: lionel ? LIONEL_MAX : Math.min(55, topSpeed(v.ps)), acc: (4 + v.ps * 0.06) * (lionel ? 2 : 1),
    radius: Math.max(1.3, mesh.userData.radius * 0.8), len: mesh.userData.length };
}

export function startCity({ player, kinds, topSpeed, onExit, pay = () => 0, earn = () => {}, net = null, garage = null, dealer = null }) {
  if (!S) {
    S = buildWorld();
    S.ui = buildDom();
    S.ui.root.prepend(S.renderer.domElement);
    const fx0 = makeEffects(S.scene), wp = { x: 0, z: 0 }; // Rauch und Bremsspuren liegen in der verbogenen Stadt
    loadLook().then(ok => { // schöne Grafik (Bibliotheken aus dem Netz), kommt dazu, sobald geladen
      if (!ok || !S || S.look) return;
      S.look = makeLook(S.renderer, S.scene, S.camera, { ao: 3.4 });
      if (!S.look) return;
      S.look.on = lookWanted(); layout(); showGfx();
    });
    S.fx = { ...fx0, puff(x, y, z, vx, vz) { warpXZ(x, z, wp); fx0.puff(wp.x, y, wp.z, vx, vz); }, mark(k, x, y, z, on) { warpXZ(x, z, wp); fx0.mark(k, wp.x, y, wp.z, on); } };
    window.addEventListener('resize', () => S && !S.ui.root.hidden && layout());
  }
  if (PARTY && !S.party) S.party = makeParty(S.scene); // Geburtstag: Ballone, Konfetti, nachts Feuerwerk
  const mesh = buildCar(player, kinds);
  if (player.ghost) ghostLook(mesh); // Geist-Cayenne: für die anderen unsichtbar, selber nur feine Linien
  mesh.rotation.order = 'YZX';
  // Start: auf der rechten Spur einer Strasse am Stadtrand, Richtung Zentrum
  // online starten alle auf einer anderen Strasse am Stadtrand
  const me = { v: player, mesh, pos: new THREE.Vector3(node(1 + (net ? net.mySlot : 0)) + 20, 0, node(0) + LANE), heading: 0, speed: 0, vl: 0, steer: 0,
    ...carStats(player, mesh, kinds, topSpeed), slip: 0, surface: 'asphalt', alt: 0, fly: false, landing: false };
  city = { me, cars: spawnTraffic(kinds), input: {}, t: Math.random() * CYCLE, msgT: 0, crashT: 0, hornT: 0, inCross: false, tod: 0.02, turbo: 0, fuelT: 0, washT: 0, mission: null, accT: 25 + Math.random() * 30, fuel: 1, damage: 0, scratches: [], dented: [], repairT: 0, wx: { kind: 'sun', t: 60 + Math.random() * 60, i: 0 }, wGrip: 1, dealT: 0, dealOpen: false, dealer, customers: [], custT: 4, custMsgT: 0, talk: null, okPos: { x: me.pos.x, z: me.pos.z }, hw: [], hwMsgT: 0, onHw: false, eventT: 50 + Math.random() * 40, gy: 0, see: SEE, perfT: 0, perfN: 0,
    gears: gearbox(player.kind), onExit, last: performance.now(), kinds, pay, gripBoost: (kinds[player.kind] && kinds[player.kind].grip) || 1, canFly: !!(kinds[player.kind] && kinds[player.kind].fly), fines: 0, police: null, pulled: 0, ticket: false,
    earn, net, topSpeed, garage, baseSlot: net ? net.mySlot : 0, baseT: 0, atBase: -1, baseEdit: false, netCars: net ? makeNetCars({ scene: S.scene, kinds, net, ghost: !!player.ghost }) : null, drift: 0, driftT: 0, driftBest: (() => { try { return +localStorage.getItem('autoRetterDriftBest') || 0; } catch (e) { return 0; } })() };
  S.fx.clear();
  S.ui.minimap.width = S.ui.minimap.height = MAP; S.ui.minimap.classList.remove('big'); S.ui.mapzoom.hidden = true; // Karte wieder klein
  S.scene.add(mesh);
  mesh.traverse(o => { const m = o.material; if (m && m.name === 'headlight') city.headMat = m; }); // Scheinwerfer (gemeinsam für alle Autos)
  for (const c of city.cars) S.scene.add(c.mesh);
  warmUp(S.renderer, S.scene, S.camera);
  if (!S.quality) S.quality = makeQuality(S.renderer, layout, MOBILE ? { min: 1, slow: 1 / 30 } : {});
  S.ui.tagbtn.hidden = !net; S.ui.tagbar.hidden = true;
  S.ui.flybtn.hidden = !city.canFly;
  S.ui.basepanel.hidden = S.ui.basebtn.hidden = true;
  loadBase();
  if (net) city.chat = makeChat({ parent: S.ui.root, net, mode: 'city', onSay: (slot, text) => city.netCars.say(slot, text) });
  S.ui.root.hidden = false;
  S.ui.ps.textContent = '⚡ ' + player.ps + ' PS';
  layout();
  showMsg(net ? '🏙️ Stadt online – such deine Freunde!' : '🏙️ Fahr, wohin du willst!', 2.5);
  S.ui.jail.hidden = true;
  if (jailUntil() > Date.now()) { goToJail(jailUntil()); showMsg('🔒 Du sitzt noch im Gefängnis!', 2.4); } // Zeit läuft weiter
  parkLotCars();
  setupBlue();
  if (S.places.park && !S.parkCars) { // Autos im Parkhaus (einmal gebaut, bleiben stehen)
    S.parkCars = S.places.park.parked.map(q => {
      const kind = LOT_KINDS[Math.floor(Math.random() * LOT_KINDS.length)], m = buildCar({ kind, color: COLORS[Math.floor(Math.random() * COLORS.length)], special: null }, kinds);
      noShadow(m); m.position.set(q.x, q.L * PK_LV + 0.05, q.z); m.rotation.y = -q.h; S.scene.add(m); return m;
    });
  }
  city.pkL = 0; city.pkR = null; city.dOrder = null; city.movie = null;
  setupTrafficSpecials(kinds);
  setupStadium();
  if (S.places.kino && !S.kinoCrowd) { // Leute vor dem Kino (abends)
    const K = S.places.kino; S.kinoCrowd = [];
    for (let k = 0; k < 7; k++) { const mesh = makePerson(SHIRTS[k % SHIRTS.length], HAIRS[k % HAIRS.length], SKINS[k % SKINS.length]); mesh.traverse(o => { o.castShadow = false; });
      const p = { mesh, h: Math.PI / 2 + (Math.random() - 0.5), phase: k }; mesh.position.set(K.door.x - 6 + k * 1.8, 0.16, K.door.z - 3 - (k % 2) * 1.2); mesh.visible = false; S.scene.add(mesh); S.kinoCrowd.push(p); }
  }
  city.peds = makePeds();
  city.works = null; city.worksT = 30 + Math.random() * 40;
  city.house = loadHouse(); city.houseOpen = false; showHouse();
  city.rides = []; city.boat = null; city.bales = 0; city.moonOn = false; city.launch = null;
  city.parked = []; for (const P of loadParked()) { parkCols(P); city.parked.push(P); } // geparkte Autos vom letzten Mal
  S.scene.background = null; S.clouds.visible = true; S.moon.group.visible = false;
  for (const r of S.moon.rocks) { r.got = false; r.mesh.visible = true; } // Mondsteine liegen wieder da
  if (kinds[MOON_BUGGY.v.kind]) { // Mond-Buggy bei der Basis
    const bm = buildCar({ ...MOON_BUGGY.v, special: null }, kinds); bm.position.set(MOON_BUGGY.x, moonGround(MOON_BUGGY.x, MOON_BUGGY.z), MOON_BUGGY.z); bm.rotation.y = -MOON_BUGGY.h;
    if (bm.userData.driver) bm.userData.driver.visible = false;
    S.scene.add(bm); city.rides.push({ v: { ...MOON_BUGGY.v }, x: MOON_BUGGY.x, z: MOON_BUGGY.z, h: MOON_BUGGY.h, mesh: bm });
  }
  city.cruise = null; // Tempomat/Begrenzer abgeschafft (Wunsch Lionel); Code bleibt, falls er zurück soll
  const TR = RIDES_INFO.tractor;
  if (kinds.tractor) { // Traktor auf dem Bauernhof: zu Fuss hin und einsteigen
    const mesh = buildCar({ ...TR.v, special: null }, kinds); mesh.position.set(TR.x, groundAt(TR.x, TR.z), TR.z); mesh.rotation.y = -TR.h;
    if (mesh.userData.driver) mesh.userData.driver.visible = false;
    S.scene.add(mesh); city.rides.push({ v: { ...TR.v }, x: TR.x, z: TR.z, h: TR.h, mesh });
  }
  if (!S.ferryMesh) { S.ferryMesh = makeFerry(); S.scene.add(S.ferryMesh); }
  city.ferry = { s: 0, at: 'A', moving: false, dir: 1, rider: null, wait: 0, pose: ferryAt(0) }; city.ferryRide = false; city.boatAt = null;
  if (!S.monCars) S.monCars = makeMonacoTraffic(kinds, buildCar, S.scene);
  for (const [kind, color, dz] of [['hyper', '#facc15', -45], ['cabrio', '#dc2626', -30], ['limo', '#f8fafc', 30]]) { // am Jachthafen: einsteigen und losfahren
    if (!kinds[kind]) continue;
    const v = { id: 'mon-' + kind, kind, color, ps: kind === 'hyper' ? 900 : 420, special: null }, x = MONACO.x + 236, z = MONACO.z + dz, h = -Math.PI / 2;
    const mesh = buildCar(v, kinds); mesh.position.set(x, monGround(x, z), z); mesh.rotation.y = -h; if (mesh.userData.driver) mesh.userData.driver.visible = false;
    S.scene.add(mesh); city.rides.push({ v, x, z, h, mesh });
  }
  setupKeys();
  city.hw = makeHighwayTraffic(S.scene, kinds);
  for (const m of city.hw.meshes) noShadow(m);
  setupDealer();
  // Fahrzeuge, die erst später auftauchen, schon jetzt einmal bauen (danach nur noch kopieren – sonst ruckelt es dann)
  for (const v of [...city.base, { kind: 'police', color: kinds.police.color }, { kind: 'sports', color: '#18181b' }, { kind: 'muscle', color: '#18181b' },
    { kind: 'carrier', color: '#f59e0b' }]) if (kinds[v.kind]) buildCar({ special: null, ...v }, kinds);
  // Alle echten Autos (jede Variante) einmal bauen und mitzeichnen: Shader und Bilder sind dann fertig (sonst Ruckler von 1–2 s, wenn eines zum ersten Mal auftaucht)
  const warmCars = new THREE.Group(); warmCars.position.set(me.pos.x, -50, me.pos.z); warmCars.userData.noWarp = true;
  for (const [kind, n] of modelVariants()) for (let i = 0; i < n; i++) if (kinds[kind]) { const m = buildCar({ kind, variant: i, special: null }, kinds); setLod(m, false); warmCars.add(m); }
  S.scene.add(warmCars);
  prewarm();
  S.scene.remove(warmCars);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  S.snd = createCarSound({ kind: player.kind });
  S.camera.position.set(me.pos.x - 9, 3.4, me.pos.z);
  camLook.set(me.pos.x, 1.2, me.pos.z);
  window.__city = () => city; // für Tests im Browser
  window.__cityS = () => S;
  window.__citySwitch = v => switchCar(v, true); window.__cityCam = m => { camMode = m; }; window.__cityHurt = (i, x, z) => hurt(i, x, z); // Tests: Auto wechseln, Kamera, Unfall
  window.__cityTick = n => { for (let k = 0; k < n && city; k++) step(city.last + 1000 / 60); }; // Tests: Bilder rechnen, auch im Hintergrund
  window.__cityWarp = (x, z) => warpXZ(x, z, { x: 0, z: 0 }); // Tests: wo liegt ein Punkt im Bild
  window.__cityMission = type => startMission(type); // Aufträge und Überraschungen direkt starten
  requestAnimationFrame(loop);
}

// Spar-Modus für langsame Geräte: ist es auch mit wenig Pixeln (makeQuality) noch unter 40 Bildern pro Sekunde,
// zuerst die Schatten aus, danach die Autos nur noch in der Nähe zeichnen
function showGfx() {
  S.ui.gfx.hidden = !S.look;
  S.ui.gfx.classList.toggle('off', !(S.look && S.look.on));
}
function saveGpu(frame) {
  if (frame > 0.1) return; // Tab im Hintergrund o. ä.
  city.perfT += frame; city.perfN++;
  if (city.perfT < 3) return;
  const slow = city.perfT / city.perfN > 1 / 40;
  city.perfT = city.perfN = 0;
  if (slow && S.look && S.look.on) { S.look.on = false; showGfx(); showMsg('⚡ Grafik auf schnell gestellt (✨ = wieder schön)', 2.2); return; }
  if (!slow || S.renderer.getPixelRatio() > (MOBILE ? 1.01 : 0.61)) return; // Bild schon am kleinsten: dann Schatten aus, weniger weit sehen
  if (S.sun.castShadow) { S.sun.castShadow = false; return; }
  city.see = Math.max(80, city.see - 30);
}
// Ein Fehler in einem einzelnen Bild soll das Spiel nicht einfrieren: melden und weitermachen
function loop(now) {
  if (!city) return;
  try { step(now); } catch (err) { console.error(err); city && (city.last = now); }
  if (city) requestAnimationFrame(loop);
}
function step(now) {
  const dt = Math.max(0, Math.min(0.05, (now - city.last) / 1000)); // nie rückwärts (Uhr springt)
  S.quality((now - city.last) / 1000);
  saveGpu((now - city.last) / 1000);
  city.last = now;
  city.t += dt;
  if (city.msgT > 0 && (city.msgT -= dt) <= 0) S.ui.msg.textContent = '';
  city.hornT -= dt;
  stepLights();
  stepDayNight(dt);
  stepWeather(dt);
  stepMoonEnv(dt);
  stepLaunch(dt);
  if (city.pulled > 0) city.pulled -= dt;
  stepFerry(dt);
  if (city.ferryRide) { /* auf der Fähre: nicht selber fahren */ } else if (city.walk) stepWalk(dt); else if (city.plane) stepPlane(dt); else stepMe(dt);
  stepMonaco(dt);
  stepJail();
  stepRules(dt);
  stepDamage(dt);
  stepDealer(dt);
  stepShop(dt);
  if (city.dealer) stepDelivery(dt);
  stepDrift(dt);
  stepPolice(dt);
  stepWanted(dt);
  stepRoute(dt);
  stepChunks();
  stepPlaces(dt);
  stepBases(dt);
  stepParked(dt);
  if (!city.moonOn) stepGrass(); else if (S.grassPatch) { S.grassPatch.count = 0; city.grassAt = null; }
  stepMission(dt);
  stepTraffic(dt);
  stepBlue(dt);
  stepPeds(dt);
  stepTrafficSpecials(dt);
  stepWorks(dt);
  stepHouse(dt);
  stepSleep(dt);
  stepStations();
  stepKino(dt);
  stepStadium(dt);
  stepAccidents(dt);
  stepHw(dt);
  if (S.areas.pass && S.areas.pass.flag && Math.hypot(S.camera.position.x - SUMMIT.x, S.camera.position.z - SUMMIT.z) < 400) waveFlag(S.areas.pass.flag, city.t); // Fahne auf dem Gipfel
  stepCountry(S.country, dt, { t: city.t, me: { x: city.me.pos.x, z: city.me.pos.z }, cam: S.camera.position, tractor: city.me.v.kind === 'tractor' && !city.walk, onBale });
  stepAreas(S.areas, dt, city.keys.size, {
    start: () => { if (Math.hypot(city.me.pos.x - 600, city.me.pos.z + 150) < 450) showMsg('✈️ Ein Flugzeug startet!', 1.8); },
    danger: (x, y, z, v) => { // auf der Piste vom Flugzeug erwischt
      const me = city.me;
      if (y < 4 && Math.abs(me.pos.x - x) < 19 && Math.abs(me.pos.z - z) < 16 && me.alt < 4 && city.crashT <= 0) {
        crash(0.9, 'car'); hurt(0.8, x, z); city.crashT = 1; me.speed = -8; me.pos.z += me.pos.z > z ? 6 : -6;
        showMsg('💥 Vorsicht, die Piste ist für Flugzeuge!', 2);
      }
    },
  });
  stepEvents(dt);
  stepKeys(dt);
  if (city.netCars) { // Mitspieler: zeigen, eigene Position senden, nicht durcheinander durchfahren
    const me = city.me, o = { x: me.pos.x, y: me.alt, z: me.pos.z };
    if (city.netCars.bump(o, me.radius)) {
      me.pos.x = o.x; me.pos.z = o.z; me.speed *= 0.95;
      if (Math.abs(me.speed) > 5 && city.crashT <= 0) { crash(0.25, 'car'); hurt(0.25); city.crashT = 0.5; }
    }
    city.netCars.update(dt, city.t, { x: me.pos.x, y: me.alt + city.gy, z: me.pos.z, h: me.heading, v: me.speed, a: me.fly ? me.flyPitch : 0, b: me.fly ? me.flyRoll : 0 });
    city.chat.update(dt);
    stepTag(dt);
  }
  updateHud(dt);
  render(dt);
}

// ---------- Tag und Nacht ----------
// Ein Tag dauert 6 Minuten; die Sonne steht meist über dem Horizont (Nacht etwa ein Drittel).
const DAY = 360;
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C_DAY = new THREE.Color(0xc6d6e6), C_NIGHT = new THREE.Color(0x0b1222), C_SKY_D = new THREE.Color(0xd6e8ff), C_SKY_N = new THREE.Color(0x2a3a66);
function stepDayNight(dt) {
  const n = S.night;
  city.tod = (city.tod + dt / DAY) % 1;
  const a = city.tod * Math.PI * 2, elev = Math.sin(a) * 0.9 + 0.3; // > 0: Tag
  const day = smooth01(-0.12, 0.3, elev), night = 1 - day;
  n.sky.sunPosition.value.setFromSphericalCoords(1, Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, elev)) * 0.95), 3.66);
  S.sun.intensity = 3.1 * day;
  n.hemi.intensity = 0.32 - 0.14 * day; // am Tag kommt das meiste Umgebungslicht schon vom Himmel (scene.environment)
  n.hemi.color.lerpColors(C_SKY_N, C_SKY_D, day);
  n.fog.color.lerpColors(C_NIGHT, C_DAY, day);
  S.renderer.toneMappingExposure = 0.9 + 0.05 * day;
  if (S.look) S.look.night(night);
  const env = day > 0.6 ? n.envs.day : day > 0.2 ? n.envs.dusk : n.envs.night;
  if (S.scene.environment !== env) S.scene.environment = env;
  n.heads.emissiveIntensity = 0.6 + 3 * night;
  for (const m of n.walls) m.emissiveIntensity = 1.1 * night;
  n.pools.visible = night > 0.05; n.pools.material.opacity = 0.75 * night;
  n.stars.material.opacity = night;
  if (S.clouds.material && S.clouds.material.color) S.clouds.material.color.setScalar(0.25 + 0.75 * day);
  if (city.headMat) city.headMat.emissiveIntensity = 0.35 + 3.3 * night; // Scheinwerfer aller Autos: am Tag klares Glas, nachts hell
  for (const m of MODEL_LAMPS) m.emissiveIntensity = 1.4 * night; // Lichter der echten Automodelle
  city.night = night;
  stepCarLights(n, night);
  // Uhr: Mittag = höchster Sonnenstand
  const mins = Math.floor(((city.tod - 0.25 + 1) % 1) * 24 * 60 + 12 * 60) % (24 * 60);
  const clock = '🔑 ' + city.keys.size + '/' + KEY_COUNT + '  ' + (city.wx.kind !== 'sun' && city.wx.i > 0.3 ? WX[city.wx.kind].icon + ' ' : night > 0.5 ? '🌙 ' : '☀️ ') + String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  if (S.ui.clock.textContent !== clock) S.ui.clock.textContent = clock;
}

// ---------- Wetter ----------
// Sonne, Regen oder Schnee, wechselt alle paar Minuten. Regen: nasse, glänzende Strasse, Autos rutschen mehr;
// Schnee: alles wird weiss und noch rutschiger. Tropfen und Flocken fallen in einer Kiste rund um die Kamera.
const WX = { sun: { icon: '☀️', grip: 1, msg: '☀️ Die Sonne kommt wieder raus' }, rain: { icon: '🌧️', grip: 0.72, msg: '🌧️ Es regnet – die Strasse ist rutschig!' },
  snow: { icon: '❄️', grip: 0.55, msg: '❄️ Es schneit – fahr vorsichtig!' } };
const C_GREY = new THREE.Color(0x8a96a3), C_WHITE = new THREE.Color(0xf4f7fb);
function makeWeatherFx() {
  const box = (n, per) => { const a = new Float32Array(n * per * 3); for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 70, y = Math.random() * 34, z = (Math.random() - 0.5) * 70; for (let k = 0; k < per; k++) a.set([x, y - k * 1.1, z], (i * per + k) * 3); } return a; };
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(box(1500, 2), 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xe2e9f2, transparent: true, opacity: 0, depthWrite: false }));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const g = dot.getContext('2d'), r = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(box(1800, 1), 3));
  const snow = new THREE.Points(sg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), size: 0.35, transparent: true, opacity: 0, depthWrite: false }));
  for (const o of [rain, snow]) { o.frustumCulled = false; o.visible = false; o.userData.noWarp = true; S.scene.add(o); }
  const G = S.ground;
  return { rain, snow, base: { asphalt: G.asphalt.color.clone(), grass: G.grass.color.clone(), pave: G.pave.color.clone(), land: G.land.color.clone(), rough: G.asphalt.roughness } };
}
function stepWeather(dt) {
  const W = city.wx;
  if (!S.wxFx) S.wxFx = makeWeatherFx();
  const F = S.wxFx;
  if ((W.t -= dt) <= 0) { // Zeit für anderes Wetter: erst ausklingen lassen, dann wechseln
    if (W.i > 0.01 && W.kind !== 'sun') W.i = Math.max(0, W.i - dt * 0.2);
    else {
      const r = Math.random(), next = r < 0.5 ? 'sun' : r < 0.82 ? 'rain' : 'snow';
      if (next !== W.kind) showMsg(WX[next].msg, 2.6);
      W.kind = next; W.t = 90 + Math.random() * 90;
    }
  } else if (W.kind !== 'sun') W.i = Math.min(1, W.i + dt * 0.15);
  const i = W.kind === 'sun' ? 0 : W.i, rainI = W.kind === 'rain' ? i : 0, snowI = W.kind === 'snow' ? i : 0;
  city.wGrip = 1 - (1 - WX[W.kind].grip) * i;
  // Himmel und Licht: trüber, Nebel näher
  S.sun.intensity *= 1 - 0.65 * i;
  S.night.hemi.intensity *= 1 - 0.2 * i;
  const fog = S.night.fog;
  fog.color.lerp(snowI ? C_WHITE : C_GREY, 0.55 * i);
  fog.near = 160 - 130 * i; fog.far = 1100 - (snowI ? 850 : 700) * i;
  // Boden: nass glänzend oder verschneit (Schnee hellt die Texturen auf: weisses Eigenleuchten, Farbe dunkler)
  const G = S.ground, B = F.base;
  G.asphalt.roughness = B.rough - 0.6 * rainI;
  G.asphalt.color.copy(B.asphalt).multiplyScalar(1 - 0.3 * rainI - 0.3 * snowI);
  for (const [m, base, k] of [[G.asphalt, null, 0.35], [G.grass, B.grass, 0.75], [G.pave, B.pave, 0.5], [G.land, B.land, 0.75]]) {
    m.emissive.setScalar(k * snowI * (0.35 + 0.65 * S.sun.intensity / 3.1)); // nachts leuchtet der Schnee weniger
    if (base) m.color.copy(base).lerp(C_GREY, 0.8 * snowI * k);
  }
  // Tropfen und Flocken fallen um die Kamera herum
  const cam = S.camera.position;
  for (const [o, I, speed, per] of [[F.rain, rainI, 24, 2], [F.snow, snowI, 2.4, 1]]) {
    o.visible = I > 0.02;
    if (!o.visible) continue;
    o.material.opacity = (per === 2 ? 0.85 : 0.95) * I;
    o.position.set(cam.x, cam.y - 14, cam.z);
    const a = o.geometry.attributes.position, arr = a.array;
    for (let k = 0; k < arr.length; k += 3 * per) {
      let y = arr[k + 1] - speed * dt;
      if (per === 1) arr[k] += Math.sin(city.t * 1.3 + k) * dt * 0.6; // Flocken tanzen
      if (y < 0) y += 34;
      for (let q = 0; q < per; q++) arr[k + q * 3 + 1] = y - q * 1.1;
    }
    a.needsUpdate = true;
  }
}

function updateHud(dt) {
  const me = city.me, F = S.ui.fuel;
  F.hidden = !needsFuel(me.v.kind) || !!city.walk;
  if (!F.hidden) {
    S.ui.fuelIcon.textContent = isElectric(me.v.kind) ? '🔋' : '⛽';
    S.ui.fuelBar.style.width = Math.round(city.fuel * 100) + '%';
    F.classList.toggle('low', city.fuel < 0.15);
  }
  S.ui.dmg.hidden = city.damage < 0.02 || !!city.walk;
  S.ui.dmgBar.style.width = Math.round(city.damage * 100) + '%';
  S.ui.kmh.textContent = Math.round(Math.abs(me.speed) * 3.6);
  S.ui.flybtn.textContent = me.fly && !me.landing ? '🛬' : '✈️';
  S.ui.flyctl.hidden = city.walk ? !!(city.walk.lift || city.sleep || city.movie) : city.plane ? (!city.plane.air && me.speed < 30) : (!me.fly || me.landing); // zu Fuss: ▲ springen, ▼ Backflip
  S.ui.cruise.hidden = true;
  drawMinimap();
  if (!S.snd) return;
  let near = null, nd = Infinity;
  for (const c of city.cars) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < nd) { nd = d; near = c; } }
  const g = city.gears(me.speed, me.maxV);
  if (g.shifted && city.input.gas && !city.walk) S.snd.shift(); // Hochschalten: Pschh (und bei manchen Autos ein Knall)
  S.snd.update({ frac: g.frac, throttle: city.input.gas ? 1 : 0.15, speed: me.speed, slip: me.slip,
    surface: ['sand', 'mud', 'snow', 'gravel', 'moon'].includes(me.surface) ? 'gravel' : me.surface === 'water' ? 'grass' : me.surface,
    other: near ? { dist: nd, frac: 0.2 + near.speed / 30, kind: near.v.kind } : null, dt });
}

const camWant = new THREE.Vector3(), camLook = new THREE.Vector3(), camAhead = new THREE.Vector3();
// Kamera wechseln (bleibt eingestellt)
let camMode = 0;
function nextCam() {
  if (!city) return;
  camMode = (camMode + 1) % CAM_NAMES.length;
  showMsg(CAM_NAMES[camMode], 1);
}
function render(dt) {
  const me = city.me, cam = S.camera, w = city.walk;
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const back = 8.5 + Math.abs(me.speed) * 0.03;
  warpFrame(S.scene); // ab hier bis nach dem Zeichnen steht alles in der verbogenen Stadt
  if (city.launch) { // Raketenstart: von der Seite zuschauen
    const L = city.launch, ry = L.R.position.y;
    camWant.set(L.x + 34, L.y0 + 6 + Math.min(40, (ry - L.y0) * 0.35), L.z + 30); camAhead.set(L.x, ry + 14, L.z);
  } else if (city.plane && !w) { // Flugzeug: weit hinten und oben
    const pb = 46 + Math.abs(me.speed) * 0.1, y = me.mesh.position.y;
    camWant.set(me.pos.x - fx * pb, Math.max(y + 11, groundAt(me.pos.x - fx * pb, me.pos.z - fz * pb) + 4), me.pos.z - fz * pb);
    camAhead.set(me.pos.x + fx * 25, y + 4, me.pos.z + fz * 25);
  } else if (w) { // zu Fuss: Kamera hinter dem Kopf
    const wx = Math.cos(w.h), wz = Math.sin(w.h);
    const gy = (w.gy || 0) + (w.jy || 0) * 0.6;
    camWant.set(w.x - wx * 4.2, gy + 2.4, w.z - wz * 4.2);
    camAhead.set(w.x + wx * 3, gy + 1.3, w.z + wz * 3);
    const KI = S.places.kino;
    if (city.movie && KI) { camWant.set(KI.x, 2.6, KI.z - 7); camAhead.set(KI.x, 5, KI.z + 13); }
    else if (KI && w.x > KI.inside.x0 && w.x < KI.inside.x1 && w.z > KI.inside.z0 && w.z < KI.inside.z1) { // im Kino: Kamera bleibt drinnen
      camWant.x = Math.max(KI.inside.x0 + 0.5, Math.min(KI.inside.x1 - 0.5, camWant.x)); camWant.z = Math.max(KI.inside.z0 + 0.5, Math.min(KI.inside.z1 - 0.5, camWant.z));
    }
    const HI = S.places.house && S.places.house.inside;
    if (HI && w.x > HI.x0 && w.x < HI.x1 && w.z > HI.z0 && w.z < HI.z1) { // im Haus: Kamera bleibt drinnen, unter der Decke
      camWant.x = Math.max(HI.x0 + 0.4, Math.min(HI.x1 - 0.4, camWant.x)); camWant.z = Math.max(HI.z0 + 0.4, Math.min(HI.z1 - 0.4, camWant.z));
      camWant.y = Math.min(camWant.y, 3.2);
      if (city.sleep) { const B = S.places.house.bed; camWant.set(B.x + 3, 3.1, B.z - 3.5); camAhead.set(B.x, 0.9, B.z); }
    }
  } else if (!camView(camMode, me.pos.x, me.alt + city.gy, me.pos.z, me.heading, camWant, camAhead)) {
    const y = me.alt + city.gy, hy = (groundAt(me.pos.x - fx * back, me.pos.z - fz * back) || y) ; // hinter dir am Hang nicht in den Boden
    camWant.set(me.pos.x - fx * back, Math.max(y, hy) + 3.3 + Math.abs(me.speed) * 0.01, me.pos.z - fz * back);
    if (pkIn(me.pos.x, me.pos.z) && ((city.pkR != null && city.pkR < 2) || (city.pkR == null && (city.pkL || 0) < 3))) camWant.y = Math.min(camWant.y, y + 2.9); // Parkhaus: unter der Decke
    camAhead.set(me.pos.x + fx * 6, y + 1.2, me.pos.z + fz * 6);
  }
  warpV(camWant); warpV(camAhead);
  if (!cockpit(me.mesh, cam, camMode === COCKPIT && !w)) {
    if (w && me.mesh.userData.driver) me.mesh.userData.driver.visible = false; // ausgestiegen: Sitz bleibt leer
    cam.position.lerp(camWant, 1 - Math.exp(-dt * 6));
    camLook.lerp(camAhead, 1 - Math.exp(-dt * 10));
    cam.lookAt(camLook);
  }
  cam.fov = 62 + Math.min(16, Math.abs(me.speed) * 0.15);
  cam.updateProjectionMatrix();
  // Schatten nur jedes zweite Bild neu rechnen (spart viel); die Sonne wandert nur dann mit, sonst verrutschen die Schatten
  S.renderer.shadowMap.autoUpdate = false;
  if ((city.shadowF = (city.shadowF || 0) + 1) % 2 === 0 || dt > 0.045) {
    const sp = warpV(_sunP.set(me.pos.x, 0, me.pos.z));
    S.sun.position.set(sp.x + 70, 110 + city.gy, sp.z - 40);
    S.sun.target.position.set(sp.x, city.gy, sp.z);
    S.renderer.shadowMap.needsUpdate = true;
  }
  S.clouds.position.set(cam.position.x, 0, cam.position.z);
  S.skyMesh.position.set(cam.position.x, 0, cam.position.z); S.stars.position.set(cam.position.x, 0, cam.position.z);
  S.fx.update(dt, cam, S.renderer);
  if (S.party) { S.party.root.visible = !city.moonOn; if (!city.moonOn) S.party.update(dt, cam, city.night || 0, (city.gy || 0) + groundAt(me.pos.x, me.pos.z)); } // auf dem Mond keine Luft für Ballone
  if (S.look && S.look.on) S.look.render(dt); else S.renderer.render(S.scene, cam);
  unwarpFrame();
}
const _sunP = new THREE.Vector3();

function endCity() {
  removePolice();
  S.scene.background = null; S.clouds.visible = true; S.moon.group.visible = false;
  if (S.ui.sleep) S.ui.sleep.style.opacity = 0;
  endWorks();
  if (city.plane) { // Flugzeug zurück an seinen Platz
    const F = S.areas.flyer; Object.assign(F, F.home); F.mesh.position.set(F.x, 0, F.z); F.mesh.rotation.set(0, -F.h, 0);
    city.me.mesh = city.plane.car; city.plane = null;
  }
  if (city.boat) { // Boot zurück an den Steg, Auto wieder als eigenes Auto
    S.scene.remove(city.boat.car);
    S.country.boat.position.set(BOAT_HOME.x, BOAT_Y, BOAT_HOME.z); S.country.boat.rotation.set(0, -BOAT_HOME.h, 0);
    city.me.mesh = city.boat.car; city.boat = null;
  }
  for (const R of city.rides || []) S.scene.remove(R.mesh);
  for (const P of city.parked || []) { if (P.mesh) S.scene.remove(P.mesh); for (const o of P.cols) { const k = S.round.indexOf(o); if (k >= 0) S.round.splice(k, 1); } } // bleiben gespeichert
  if (city.hwSiren) city.hwSiren.stop();
  endMission(false);
  S.ui.jobpanel.hidden = true;
  S.ui.ticket.hidden = true;
  for (const B of S.places.bases) for (const b of B.bays) clearBay(B, b);
  for (const v of city.victims || []) S.scene.remove(v.mesh);
  if (city.police && city.police.cop) { S.scene.remove(city.police.cop.mesh); city.police.cop = null; }
  S.ui.wanted.hidden = true;
  clearDest();
  const c = city;
  city = null;
  if (S.snd) { S.snd.stop(); S.snd = null; }
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  S.scene.remove(c.me.mesh);
  if (c.walk) S.scene.remove(c.walk.mesh);
  for (const cu of c.customers || []) S.scene.remove(cu.mesh);
  for (const p of c.peds || []) S.scene.remove(p.mesh);
  for (const g of S.stopMeshes || []) S.scene.remove(g); S.stopMeshes = [];
  if (c.ambSiren) c.ambSiren.stop();
  if (c.truck) S.scene.remove(c.truck.mesh);
  if (c.hw && c.hw.meshes) { // Autobahn: Vorrat, Klötze, Unfallstelle
    for (const m of c.hw.meshes) S.scene.remove(m);
    S.scene.remove(c.hw.far.body, c.hw.far.cab, c.hw.props.smoke, c.hw.props.tri);
  }
  S.ui.talkpanel.hidden = true; S.ui.dealpanel.hidden = true; S.ui.talkbtn.hidden = true;
  S.ui.walkbtn.textContent = '🚪';
  S.ui.walkbtn.classList.remove('ready');
  S.ui.hint.textContent = HINT;
  for (const car of c.cars) { S.scene.remove(car.mesh); if (car.tri) S.scene.remove(car.tri); } // Formen gehören den Vorlagen in cars3d.js
  if (c.headMat) c.headMat.emissiveIntensity = 0.35; // Scheinwerfer wieder wie am Tag (gilt auch fürs Rennen)
  for (const m of MODEL_LAMPS) m.emissiveIntensity = 0;
  if (c.netCars) c.netCars.dispose();
  if (c.chat) c.chat.dispose();
  S.ui.root.hidden = true;
  c.onExit();
}

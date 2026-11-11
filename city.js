// Stadt zum freien Herumfahren (three.js): Strassen im Gitter, Häuser, Parks, Ampeln und viel Verkehr.
// Wird von game.js erst geladen, wenn man in die Stadt fährt.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic } from './cars3d.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';
import { createCarSound, crash, gearbox, horn, createSiren } from './sound.js';
import { buildCountry, stepCountry, countryDist, countryDrivable, countrySurface, inCountry, inWater, nearPier, BOAT_Y, BOAT_HOME, RIDES_INFO, FARM, countryBlocked, LIFT } from './country.js';
import { makeNetCars } from './netcars.js';
import { makeChat } from './chat.js';
import { buildHighway, outskirtsDist, hwDrivable, onHighway, makeHighwayTraffic, stepHighway, hwProject, hwPoint, HW, HW_LEN, HW_LIMIT, REST, REST_ZONES, makePath, pathAt, turnTo,
  AREAS, buildAreas, stepAreas, groundShape, areaDrivable, inArea, lockedGate, offroadWhy,
  PASS_AREA, buildPass, passGround, passDrivable, onPass, passTerrain, passNearest, inPassRegion, passPoints, SUMMIT, slideInside, waveFlag } from './outskirts.js';
import { makeEffects, camView, cockpit, COCKPIT, CAM_NAMES, FLY_HTML, FLY_KEYS, flyCss, flyHelp, flyToggle, flyStep } from './fx.js';

const N = 8;                    // Blöcke pro Seite
const BLOCK = 64;               // Abstand der Kreuzungen (Meter)
const ROAD = 14;                // Strassenbreite: eine Spur je Richtung
const LANE = 3.5;               // Spurmitte rechts neben der Strassenmitte
const HALF = N * BLOCK / 2;     // halbe Stadtgrösse
const LIMIT = HALF + 70;        // so weit darf man fahren
const FLY_MAX = 100, FLY_SPEED = 1.25; // Fliegen: höchste Höhe (über dem höchsten Haus), schneller als am Boden
const STOP = BLOCK - 12;        // Haltelinie (Abstand von der vorigen Kreuzung); die Wagenmitte hält eine halbe Länge davor
const CYCLE = 22;               // Ampelzyklus in Sekunden
const TRAFFIC = 46;             // so viele Autos fahren herum
const SEE = 140;                // weiter weg werden Autos nicht gezeichnet
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, −x, −z
const SPECIAL = { '2,5': 'gas', '5,2': 'wash', '5,5': 'pizza', '2,2': 'jail', '6,3': 'workshop', '1,3': 'dealer', '6,6': 'hospital', '3,6': 'blue', '7,5': 'house', '4,2': 'park', '2,6': 'drive', '6,4': 'kino', '5,6': 'stadium' }; // Blöcke mit Tankstelle, Waschanlage, Pizzeria, Gefängnis, Werkstatt, Autohändler, Spital, Blauer Zone
// Basen: sechs Blöcke nebeneinander am oberen Stadtrand, Platz s im Block (s + 1, 0); Einfahrt von der Strasse, an der man startet
const BASES = 6, BASE_CARS = 10, BASE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
const baseOf = key => { const [i, j] = key.split(',').map(Number); return j === 0 && i >= 1 && i <= BASES ? i - 1 : -1; };
const POOL = ('car mini kombi kompakt taxi police van delivery pickup hatch coupe smart ecar minivan jeep postauto ' +
  'schoolbus ambulance garbage beetle cabrio sports muscle offroad parcel bakery icecream oldtimer limo firetruck').split(' ');
const COLORS = ['#c0392b', '#2563eb', '#f4f4f4', '#22232b', '#9aa0aa', '#16a34a', '#f59e0b', '#7c3aed', '#0e7490', '#b45309'];

const node = i => (i - N / 2) * BLOCK;
const inGrid = (i, j) => i >= 0 && i <= N && j >= 0 && j <= N;
const hasLights = (i, j) => !((i === 0 || i === N) && (j === 0 || j === N)); // Ecken: nur Kurve, keine Ampel
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

// Hausfassade: 4 × 4 Fenster auf 12 × 12 Meter, manche Fenster hell, manche mit Vorhang
function facade(wall, frame, r) {
  const glowWins = []; // welche Fenster nachts leuchten
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = x * 64 + 12, py = y * 64 + 14;
      g.fillStyle = frame; g.fillRect(px - 3, py - 3, 46, 42);
      const lit = r() < 0.15, grad = g.createLinearGradient(px, py, px + 40, py + 36);
      grad.addColorStop(0, lit ? '#fff1c4' : '#7fa3c2'); grad.addColorStop(1, lit ? '#f5c46b' : '#26384f');
      g.fillStyle = grad; g.fillRect(px, py, 40, 36);
      if (r() < 0.25) { g.fillStyle = 'rgba(240,235,225,0.85)'; g.fillRect(px, py, 40, 10 + r() * 20); } // Vorhang
      g.fillStyle = frame; g.fillRect(px + 19, py, 2, 36);
      if (r() < 0.55) glowWins.push([px, py]);
    }
  });
  tex.glow = canvasTex(256, 256, g => { // Leuchtbild für die Nacht: schwarz, nur die beleuchteten Fenster gelb
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (const [px, py] of glowWins) { g.fillStyle = Math.random() < 0.3 ? '#bfe4ff' : '#ffd38a'; g.fillRect(px, py, 40, 36); }
  });
  return tex;
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

// ---------- Stadt bauen ----------
function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'c3d';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc6d6e6, 160, 1100);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
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
  const envs = { day: null, dusk: envOf(0x3a4562), night: envOf(0x0d1426) };
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 400 });
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
  const grassDetail = surface(256, (u, v) => {
    const n = NZ.fbm(u * 16, v * 16, 4, 16), b = r();
    const k = 200 + n * 40 + b * 15;
    return [k, k + 3, k - 8, n * 0.6 + b * 0.5];
  }, 3);
  const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const asphaltMat = mat({ map: asphalt.map, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.85 });
  const paveMat = mat({ map: pave.map, normalMap: pave.normalMap });
  pave.map.repeat.set(12.5, 12.5); pave.normalMap.repeat.set(12.5, 12.5);
  const lineMat = mat({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const grassMat = mat({ color: 0x5f9a45, map: grassDetail.map, roughness: 1 });
  grassDetail.map.repeat.set(8, 8);

  // Gelände rundherum: in der Stadt flach, draussen Hügel
  const natural = (x, z) => smoothstep(HALF + 90, HALF + 500, Math.max(Math.abs(x), Math.abs(z))) * NZ.fbm(x / 260, z / 260, 4) * 190 - 0.06;
  const height = (x, z) => {
    const rr = Math.max(Math.abs(x), Math.abs(z));
    if (rr <= HALF + 60) return -0.06;
    if (inPassRegion(x, z)) return passTerrain(x, z, natural(x, z), 15); // am Berg: das feinere Gelände liegt darüber
    let gs = groundShape(x, z); const cd = countryDist(x, z); if (cd < gs.d) gs = { d: cd, y: 0 }; // auch Bauernhof und Strand eben
    const f = smoothstep(24, 100, gs.d); // unter Autobahn, Hafen und Flughafen eben (Hafenbecken tiefer); breiter
    // ebener Rand, sonst ragt das grobe Gelände (20-m-Raster) über die äusserste Spur
    return smoothstep(HALF + 90, HALF + 500, rr) * NZ.fbm(x / 260, z / 260, 4) * 190 * f + gs.y * (1 - f) - 0.06;
  };
  const C = h => new THREE.Color(h), gA = C(0x5e9142), gB = C(0x4a7c35), rock = C(0x857b70);
  const land = terrain({ size: 2200, segments: 110, height, detail: grassDetail, detailRepeat: 260,
    color: (x, z, y, steep, c) => { c.lerpColors(gA, gB, NZ.fbm(x / 80, z / 80, 3)); c.lerp(rock, smoothstep(0.2, 0.4, steep)); } });
  land.material.normalScale.set(0.35, 0.35);
  scene.add(land);
  // Süden: ein zweites Stück Gelände für die lange Autobahn und die Raststätte (gleiches Material, gleiches Raster)
  const landS = terrain({ size: 2200, segments: 110, center: [0, 2200], height, detail: grassDetail, detailRepeat: 260,
    color: (x, z, y, steep, c) => { c.lerpColors(gA, gB, NZ.fbm(x / 80, z / 80, 3)); c.lerp(rock, smoothstep(0.2, 0.4, steep)); } });
  landS.material.dispose(); landS.material = land.material;
  scene.add(landS);

  // Strassen, Kreuzungen, Mittellinien, Haltelinien, Zebrastreifen
  const roads = quads(1 / 8), lines = quads();
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = node(i), z = node(j);
    roads.rect(x, z, ROAD, ROAD, 0.02);
    if (i < N) roads.add(x + ROAD / 2, z - ROAD / 2, node(i + 1) - ROAD / 2, z + ROAD / 2, 0.02);
    if (j < N) roads.add(x - ROAD / 2, z + ROAD / 2, x + ROAD / 2, node(j + 1) - ROAD / 2, 0.02);
    for (let s = 12; s < BLOCK - 12; s += 6) { // gestrichelte Mittellinie
      if (i < N) lines.add(x + s, z - 0.08, x + s + 3, z + 0.08, 0.03);
      if (j < N) lines.add(x - 0.08, z + s, x + 0.08, z + s + 3, 0.03);
    }
    if (!hasLights(i, j)) continue;
    for (let d = 0; d < 4; d++) { // jede Zufahrt: Haltelinie auf der rechten Spur und Zebrastreifen
      const [fx, fz] = DIRS[d];
      if (!inGrid(i - fx, j - fz)) continue;
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
    .map(([wall, frame]) => { const f = facade(wall, frame, r); return mat({ map: f, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 0, roughness: 0.75 }); });
  const roofMat = mat({ color: 0x4b4f57, roughness: 0.9 }), metal = mat({ color: 0x9aa0aa, metalness: 0.6, roughness: 0.4 });
  const plaza = (N >> 1) + ',' + (N >> 1);
  const parks = new Set(); // sieben Parks, über die Stadt verteilt
  while (parks.size < 7) { const k = Math.floor(r() * N) + ',' + Math.floor(r() * N); if (k !== plaza && !SPECIAL[k] && baseOf(k) < 0) parks.add(k); }
  const places = { bases: [] }; // Tankstelle, Waschanlage, Pizzeria: Mitte des Blocks; Basen
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
    .map(([wall, frame]) => { const f = facade(wall, frame, r); return mat({ map: f, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 0, roughness: 0.8 }); });
  const block = 50, inner = 44, curbMat = mat({ color: 0xc9ccd1, roughness: 0.9 });
  const trees = [];
  for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
    const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2;
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
      for (let k = 0; k < 14; k++) {
        const tx = cx + (r() - 0.5) * (inner - 6), tz = cz + (r() - 0.5) * (inner - 6);
        if (Math.abs(tx - cx) < 4 || Math.abs(tz - cz) < 4) continue;
        trees.push([tx, 0.16, tz, 0.8 + r() * 0.6]);
      }
      continue;
    }
    // Aussenquartier: Einfamilienhäuser mit Giebeldach und Garten
    const edge = bi === 0 || bj === 0 || bi === N - 1 || bj === N - 1;
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
      continue;
    }
    // Häuser: 2 × 2 Bauplätze; in der Mitte der Stadt höher (Skyline)
    const center = 1 - Math.hypot(cx, cz) / (HALF * 1.3);
    for (const k of [-16, -8, 8, 16]) for (const [tx, tz] of [[cx + k, cz - 22.2], [cx + k, cz + 22.2], [cx - 22.2, cz + k], [cx + 22.2, cz + k]])
      trees.push([tx, 0.16, tz, 0.55 + r() * 0.2]); // Strassenbäume auf dem Trottoir
    for (const k of [-12, 12]) street.push([cx + k, cz - 22.6, 0], [cx + k, cz + 22.6, Math.PI], [cx - 22.6, cz + k, Math.PI / 2], [cx + 22.6, cz + k, -Math.PI / 2]); // Bänke
    for (const ox of [-11, 11]) for (const oz of [-11, 11]) {
      const w = 14 + r() * 5, d = 14 + r() * 5, hgt = 7 + r() * (8 + 42 * Math.max(0, center) ** 1.4);
      const bx = cx + ox, bz = cz + oz;
      // Läden im Erdgeschoss (zur Strasse): Schaufenster und farbige Markise; niedrigere Häuser mit Balkonen
      const sx = Math.sign(ox), sz = Math.sign(oz);
      shops.push([bx + sx * (w / 2 + 0.05), bz, d - 3, Math.PI / 2], [bx, bz + sz * (d / 2 + 0.05), w - 3, 0]);
      if (hgt < 26) for (let fy = 4.6; fy < hgt - 1.5; fy += 3.2) for (const f of [-0.3, 0, 0.3]) {
        balcs.push([bx + sx * (w / 2 + 0.55), 0.16 + fy, bz + f * d, Math.PI / 2, sx], [bx + f * w, 0.16 + fy, bz + sz * (d / 2 + 0.55), 0, sz]);
      }
      const b = wallBox(w, hgt, d, walls[Math.floor(r() * walls.length)]);
      b.position.set(bx, 0.16 + hgt / 2, bz);
      decor.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), roofMat); // Dach mit Rand
      roof.position.set(bx, 0.16 + hgt + 0.3, bz); roof.castShadow = true;
      decor.add(roof);
      if (r() < 0.6) { // Lüftung oder Wassertank auf dem Dach
        const a = new THREE.Mesh(new THREE.BoxGeometry(2 + r() * 2, 1.2, 2 + r() * 2), metal);
        a.position.set(bx + (r() - 0.5) * (w - 5), 0.16 + hgt + 1.2, bz + (r() - 0.5) * (d - 5)); a.castShadow = true;
        decor.add(a);
      }
      solid.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h: hgt + 2 });
    }
  }

  // Bäume: in den Parks und als Waldgürtel rund um die Stadt
  // (die Stadt ist quadratisch: Bäume aus einem Kreis landeten sonst in den Ecken auf Strassen und Häusern)
  for (let k = 0; k < 360;) {
    const a = r() * Math.PI * 2, rr = HALF + 30 + r() * 150;
    const tx = Math.cos(a) * rr * 1.1, tz = Math.sin(a) * rr * 1.1;
    if (Math.max(Math.abs(tx), Math.abs(tz)) < HALF + ROAD / 2 + 12 || groundShape(tx, tz).d < 14 || countryDist(tx, tz) < 14 || (inPassRegion(tx, tz) && passNearest(tx, tz).d < 16)) continue; // nicht auf Strassen und Plätzen
    trees.push([tx, height(tx, tz), tz, 0.9 + r() * 0.9]);
    k++;
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
    inst(new THREE.BoxGeometry(2.4, 0.12, 1.1), mat({ color: 0xd6d3d1, roughness: 0.85 }), balcs,
      ([x, y, z, ry], d) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(1, 1, 1); });
    inst(new THREE.BoxGeometry(2.4, 0.5, 0.06), mat({ color: 0x334155, metalness: 0.5, roughness: 0.4 }), balcs,
      ([x, y, z, ry, out], d) => { d.position.set(x + (ry ? out * 0.52 : 0), y + 0.3, z + (ry ? 0 : out * 0.52)); d.rotation.set(0, ry, 0); }); // Geländer aussen
    const benchM = mat({ color: 0x8b5a2b, roughness: 0.8 });
    inst(new THREE.BoxGeometry(1.8, 0.1, 0.5), benchM, street, ([x, z, ry], d) => { d.position.set(x, 0.62, z); d.rotation.set(0, ry, 0); });
    inst(new THREE.BoxGeometry(1.8, 0.45, 0.08), benchM, street, ([x, z, ry], d) => { d.position.set(x - Math.sin(ry) * 0.22, 0.9, z - Math.cos(ry) * 0.22); d.rotation.set(0, ry, 0); });
    inst(new THREE.CylinderGeometry(0.25, 0.22, 0.8, 10), mat({ color: 0x166534, roughness: 0.6 }), street, ([x, z, ry], d) => { d.position.set(x + Math.cos(ry) * 1.6, 0.56, z - Math.sin(ry) * 1.6); d.rotation.set(0, 0, 0); }); // Abfalleimer
  }
  const trunkM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.35, 3, 6), mat({ color: 0x5b4030, roughness: 1 }), trees.length);
  const crownM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1), mat({ color: 0xffffff, roughness: 0.95, flatShading: true }), trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach(([x, y, z, s], k) => {
    trunkM.setMatrixAt(k, m4.compose(p3.set(x, y + 1.5 * s, z), q, sc.set(s, s, s)));
    crownM.setMatrixAt(k, m4.compose(p3.set(x, y + 4.6 * s, z), q, sc.set(s, s * 1.1, s)));
    crownM.setColorAt(k, col.setHSL(0.24 + r() * 0.08, 0.5, 0.09 + r() * 0.06));
    round.push({ x, z, r: 0.7 * s, h: 7.5 * s });
  });
  trunkM.castShadow = crownM.castShadow = true;
  decor.add(trunkM, crownM);

  // Strassenlampen auf den Trottoirs
  const lampPos = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (const s of [20, 44]) {
    if (i < N) for (const side of [-1, 1]) lampPos.push([node(i) + s, node(j) + side * 8.3]);
    if (j < N) for (const side of [-1, 1]) lampPos.push([node(i) + side * 8.3, node(j) + s]);
  }
  const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 6, 8), mat({ color: 0x3a3f4b, metalness: 0.6, roughness: 0.4 }), lampPos.length);
  const headM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), mat({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.6 }), lampPos.length);
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
  const headlight = new THREE.SpotLight(0xfff2d6, 0, 70, 0.55, 0.5, 1.2);
  scene.add(headlight, headlight.target);

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
      if (!inGrid(i - fx, j - fz)) continue;
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
      if (!inGrid(i - fx, j - fz) || nLight++ % 10 !== 4) continue;
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
    if (!inGrid(i + fx, j + fz)) continue;
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
  const country = buildCountry({ scene, group: decor, asphaltMat, grassMat, sign, natural, makePerson }); // Bauernhof, Strand, Skigebiet
  round.push(...(country.round || [])); // Tannen und Felsen am Berg sind fest
  solid.push(...areas.solids);
  areas.pass = buildPass({ scene, group: decor, asphaltMat, lineMat, sign, natural, // Passstrasse im Norden
    terrainMesh: o => terrain({ ...o, detail: grassDetail, detailRepeat: 100 }) });
  scene.add(decor);
  mergeStatic(decor);
  const clouds = cloudDome({ radius: 2600, coverage: 0.52, shade: '#aebccd', seed: 9 });
  clouds.layers.set(1);
  scene.add(clouds);
  warmUp(renderer, scene, camera);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  flash.visible = false;
  scene.add(flash);
  return { renderer, scene, camera, sun, clouds, lamps, solid, round, parks, places, sign, country, height, redCams, speedCams, flash, areas, ground: { asphalt: asphaltMat, grass: grassMat, pave: paveMat, land: land.material },
    night: { sky: su, hemi, envs: { ...envs, day: dayEnv }, walls: [...walls, ...homeWalls], heads: headM.material, pools, stars, headlight, fog: scene.fog } };
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
  const rt = new THREE.WebGLRenderTarget(64, 64);
  S.renderer.setRenderTarget(rt);
  S.renderer.render(S.scene, S.camera);
  S.renderer.setRenderTarget(null);
  rt.dispose();
  for (const o of shown) o.visible = false;
  for (const o of culled) o.frustumCulled = true;
}
// Bot-Autos werfen keinen echten Schatten (der weiche Schatten darunter reicht): spart viel Arbeit pro Bild
const noShadow = m => m.traverse(o => { o.castShadow = false; });
function makeCar(kinds, i, j, d, s, given = null) {
  const kind = POOL[Math.floor(Math.random() * POOL.length)];
  const v = given || { kind, color: kinds[kind].color || COLORS[Math.floor(Math.random() * COLORS.length)], special: null };
  const mesh = buildCar(v, kinds);
  noShadow(mesh);
  return { v, mesh, i, j, d, s, speed: 6 + Math.random() * 4, cruise: 10 + Math.random() * 4, turn: null,
    len: mesh.userData.length, x: 0, z: 0, h: 0, blocked: 0, waitMe: 0, honkT: 0 };
}

function spawnTraffic(kinds) {
  const cars = [];
  for (let tries = 0; cars.length < TRAFFIC && tries < 500; tries++) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1)), d = Math.floor(Math.random() * 4);
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1])) continue;
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
  c.x = node(c.i) + fx * c.s - fz * LANE;
  c.z = node(c.j) + fz * c.s + fx * LANE;
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
  const P1 = d2 === c.d ? [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2] : [bx - fz * LANE - gz * LANE, bz + fx * LANE + gx * LANE];
  let len = 0, prev = P0;
  for (let k = 1; k <= 8; k++) { const p = bez(P0, P1, P2, k / 8); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  c.turn = { P0, P1, P2, len, t: 0, d2, bi, bj, straight: d2 === c.d };
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
  for (const o of city.cars) if (o !== c) check(o.x, o.z, o.len, false, o.wreck > 0 || o.jam);
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
    const B = S.places.blue;
    if (B && !c.turn && c.i === B.seg.i && c.j === B.seg.j && c.d === B.seg.d && c.s > 12 && c.s < 18 && !c.lotAsk && !c.rush && !c.reckless && c.len < 5.6) {
      c.lotAsk = true; // an der Einfahrt: hinein? (meist, wenn viel los ist; immer, wenn es extra dafür kam)
      const q = c.blueGo || Math.random() < (city.blue.busy ? 0.6 : 0.12) ? freeBlue() : null;
      c.blueGo = false;
      if (q) { enterLot(c, q); showCar(c, dt); continue; }
    }
    if (c.s < 10) c.lotAsk = false;
    let limit = c.turn ? c.cruise * (c.turn.straight ? 1 : 0.55) : c.cruise;
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
    const f = followLimit(c, me);
    c.jam = f.byWreck && f.lim < 1; // steht im Stau hinter einem Unfall: Stau wächst nach hinten
    // Steckt ein Auto lange fest (z.B. zwei Abbieger in der Kreuzung), fährt es vorsichtig weiter (nicht im Stau)
    c.stuck = !atLight && !f.byMe && !f.byWreck && f.lim < 0.5 ? (c.stuck || 0) + dt : 0;
    if (c.stuck > 6) { c.ghost = 2.5; c.stuck = 0; }
    if (c.ghost > 0) c.ghost -= dt;
    else if (!c.rush && !c.reckless) limit = Math.min(limit, f.lim); // Raser bremsen nicht
    if (c.blocked > 0) { c.blocked -= dt; limit = 0; } // nach einem Rempler kurz stehen
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
    if (!c.turn) {
      c.s += c.speed * dt;
      if (c.s >= BLOCK - 7) planTurn(c);
      else placeOnSegment(c);
    }
    if (c.turn) {
      const T = c.turn;
      T.t = Math.min(1, T.t + c.speed * dt / T.len);
      const p = bez(T.P0, T.P1, T.P2, T.t), p2 = bez(T.P0, T.P1, T.P2, Math.min(1, T.t + 0.02));
      if (p2[0] !== p[0] || p2[1] !== p[1]) c.h = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      c.x = p[0]; c.z = p[1];
      if (T.t >= 1) { c.i = T.bi; c.j = T.bj; c.d = T.d2; c.s = 7; c.turn = null; c.reckless = c.rush = false; placeOnSegment(c); }
    }
    showCar(c, dt);
  }
}
function showCar(c, dt) {
  const m = c.mesh, seen = Math.hypot(c.x - S.camera.position.x, c.z - S.camera.position.z) < city.see;
  m.visible = seen;
  if (!seen) return;
  const B = S.places.blue, onLot = c.lot && B && Math.abs(c.x - B.cx) < 23 && Math.abs(c.z - B.cz) < 23;
  m.position.set(c.x, onLot ? 0.18 : 0, c.z);
  m.rotation.y = -c.h;
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
  if (id === 'paint') return { title: '🎨 Lackieren (' + ((K[me.v.kind] || {}).name || '') + ')', rows: () => PAINT.map(([c, name]) => ({ id: c, label: name, price: 20, color: c, done: (me.v.color || '').toLowerCase() === c })),
    buy: c => modMe({ color: c }, 20, '🎨 Frisch lackiert: ' + PAINT.find(x => x[0] === c)[1] + '!') };
  if (id === 'tuning') return { title: '🔧 Tuning (' + ((K[me.v.kind] || {}).name || '') + ')', rows: () => {
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

// ---------- Skifahren (Skigebiet am Pass) ----------
// Zu Fuss zur Talstation, X: im Sessellift hinauf. Oben bekommt man Ski: ⬅️➡️ lenken, ⬆️ anschieben, ⬇️ bremsen (Pflug),
// bergab wird man von selber schneller. Unten an der Talstation wieder X = nochmals hinauf; sonst X = Ski aus.
function startLift(w) {
  const T = S.country.lift.towers;
  w.lift = { u: 0, len: Math.hypot(T[T.length - 1].x - T[0].x, T[T.length - 1].z - T[0].z) };
  w.target = null;
  if (!w.chair) { // Sessel unter dir
    const ch = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x2563eb });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.6), m); seat.position.y = 0.45; ch.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 1.6), m); back.position.set(-0.4, 0.85, 0); ch.add(back);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), new THREE.MeshStandardMaterial({ color: 0x374151 })); bar.position.set(-0.3, 1.9, 0); ch.add(bar);
    w.chair = ch;
  }
  w.mesh.add(w.chair);
  showMsg('🚡 Es geht hinauf! Leertaste (DRIFT) = schneller', 2.2);
}
function stepLift(w, dt) {
  const L = w.lift, C = S.country, T = C.lift.towers, n = T.length - 1;
  L.u = Math.min(1, L.u + dt * (city.input.drift ? 36 : 9) / L.len); // Leertaste (oder DRIFT): viermal so schnell
  const f = Math.min(n - 1e-6, L.u * n), k = Math.floor(f), q = f - k, a = T[k], b = T[k + 1];
  w.x = a.x + (b.x - a.x) * q + C.lift.sx; w.z = a.z + (b.z - a.z) * q + C.lift.sz;
  w.gy = a.y + (b.y - a.y) * q - 2.9;
  w.h = Math.atan2(T[n].z - T[0].z, T[n].x - T[0].x);
  w.mesh.position.set(w.x, w.gy, w.z); w.mesh.rotation.set(0, -w.h, 0);
  w.mesh.userData.legs.forEach(l => { l.rotation.z = 1.4; }); // sitzen
  w.mesh.userData.arms.forEach(a => { a.rotation.z = 0.3; });
  if (L.u >= 1) { // oben: aussteigen, Ski an
    w.lift = null; w.mesh.remove(w.chair);
    const back = Math.atan2(T[0].z - T[n].z, T[0].x - T[n].x); // die Abfahrt beginnt nach der Kuppe oben (ab da geht es nur noch hinunter)
    w.x = T[0].x + (T[n].x - T[0].x) * 0.54 - C.lift.sx * 3; w.z = T[0].z + (T[n].z - T[0].z) * 0.54 - C.lift.sz * 3; w.h = back; w.speed = 3;
    skiOn(w);
  }
}
function skiOn(w) {
  if (!w.skis) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
    for (const z of [-0.12, 0.12]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.11), m); s.position.set(0.15, 0.03, z); g.add(s); }
    w.skis = g;
  }
  w.mesh.add(w.skis);
  w.ski = true; w.speed = 0;
  S.ui.hint.textContent = '⛷️ ⬅️ ➡️ lenken · ⬆️ anschieben · ⬇️ bremsen · X Ski aus (unten an der Talstation: X = Lift)';
  showMsg('⛷️ Ski an! Fahr hinunter – ⬅️➡️ lenken, ⬇️ bremsen', 2.6);
}
function skiOff(w) {
  w.ski = false; w.speed = 0;
  if (w.skis) w.mesh.remove(w.skis);
  w.mesh.rotation.set(0, -w.h, 0);
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen · Leertaste rennen · X einsteigen';
  showMsg('🚶 Ski aus', 1.2);
}
function stepSki(w, dt) {
  const input = city.input, G = (x, z) => groundAt(x, z), steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  w.h += steer * 1.7 * dt;
  const fx = Math.cos(w.h), fz = Math.sin(w.h);
  const slope = (G(w.x + fx, w.z + fz) - G(w.x - fx, w.z - fz)) / 2; // > 0: bergauf
  let v = w.speed - 9.81 * slope * 0.85 * dt;
  if (input.gas && v < 6) v += 3 * dt; // mit den Stöcken anschieben
  if (input.brake) v -= Math.sign(v) * Math.min(Math.abs(v), 7 * dt); // Pflug
  v -= v * 0.05 * dt + Math.sign(v) * Math.min(Math.abs(v), 0.4 * dt); // Schnee bremst ein wenig
  if (steer) v *= 1 - 0.2 * dt;
  v = Math.max(-2, Math.min(26, v));
  const nx = w.x + fx * v * dt, nz = w.z + fz * v * dt;
  if (allowedAt(nx, nz, 0.5)) { w.x = nx; w.z = nz; } else { v = 0; if (city.msgT <= 0) showMsg('⛷️ Hier geht es nicht weiter', 1.2); }
  w.speed = v; w.gy = G(w.x, w.z);
  if (Math.abs(v) > 8 && steer && Math.random() < dt * 30) S.fx.puff(w.x - fx, w.gy + 0.2, w.z - fz, 0, 0); // Schnee stäubt
  w.mesh.position.set(w.x, w.gy, w.z); w.mesh.rotation.set(-steer * Math.min(0.4, Math.abs(v) / 40), -w.h, 0);
  w.mesh.userData.legs.forEach(l => { l.rotation.z = 0.35; });
  w.mesh.userData.arms.forEach((a, i) => { a.rotation.z = 0.5 + (input.gas ? Math.sin(city.t * 8 + i) * 0.5 : 0); });
  const atLift = Math.hypot(w.x - LIFT.A.x, w.z - LIFT.A.z) < 14;
  if (atLift && !(w.target && w.target.lift)) showMsg('🚡 Talstation – X: nochmals hinauf', 1.6);
  w.target = atLift ? { lift: true } : null;
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
  const w = city.walk = { x: px, z: pz, h: me.heading, speed: 0, phase: 0, mesh: makePerson(), target: null };
  w.mesh.position.set(w.x, 0, w.z); S.scene.add(w.mesh);
  S.ui.walkbtn.textContent = '🚗';
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen · Leertaste rennen · X einsteigen';
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
    if (nx < -1080 || nx > 1080 || nz < -1080 || nz > 3280) { // Ende der Welt: umkehren
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
  Object.assign(me.pos, { x: BOAT_HOME.x, z: BOAT_HOME.z }); me.heading = BOAT_HOME.h;
  Object.assign(me, { speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  S.ui.flybtn.hidden = true;
  showMsg('🚤 Leinen los! Zum Aussteigen zurück zum Steg und 🚪', 2.6);
}
function leaveBoat() {
  const me = city.me, B = city.boat, C = S.country;
  C.boat.position.set(BOAT_HOME.x, BOAT_Y, BOAT_HOME.z); C.boat.rotation.set(0, -BOAT_HOME.h, 0);
  me.mesh = B.car;
  Object.assign(me.pos, B.carPos); me.heading = B.carH;
  Object.assign(me, { speed: 0, vl: 0, alt: 0 });
  city.boat = null;
  const w = city.walk = { x: -768, z: -420, h: 0, speed: 0, phase: 0, mesh: makePerson(), target: null };
  w.mesh.position.set(w.x, 0, w.z);
  S.scene.add(w.mesh);
  S.ui.walkbtn.textContent = '🚗';
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen · Leertaste rennen · X einsteigen';
  showMsg('🚶 Am Steg ausgestiegen – geh zu deinem Auto', 2);
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
const PEDS = 28, RING = 23.5;
const SHIRTS = [0x2563eb, 0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0xec4899, 0x0e7490, 0xf4f4f5, 0x1f2937], HAIRS = [0x5a3a1e, 0x1b1b1b, 0xd4a017, 0x8b4513, 0x9ca3af];
const SKINS = [0xf2c9a0, 0xe0ac69, 0x8d5524, 0xc68642, 0xffdbac];
const pedBlockOk = (bi, bj) => bi >= 0 && bj >= 0 && bi < N && bj < N && baseOf(bi + ',' + bj) < 0;
const corner = (bi, bj, k) => { const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2; return [cx + (k === 1 || k === 2 ? RING : -RING), cz + (k >= 2 ? RING : -RING)]; };
function makePeds() {
  const peds = [];
  for (let n = 0; n < PEDS; n++) {
    let bi, bj; do { bi = Math.floor(Math.random() * N); bj = Math.floor(Math.random() * N); } while (!pedBlockOk(bi, bj));
    const k = Math.floor(Math.random() * 4), [x, z] = corner(bi, bj, k), pk = SHIRTS.length;
    const mesh = makePerson(SHIRTS[Math.floor(Math.random() * pk)], HAIRS[Math.floor(Math.random() * HAIRS.length)], SKINS[Math.floor(Math.random() * SKINS.length)]);
    mesh.traverse(o => { o.castShadow = false; });
    S.scene.add(mesh);
    peds.push({ mesh, bi, bj, k, rot: Math.random() < 0.5 ? 1 : -1, x, z, h: 0, speed: 0, want: 1.1 + Math.random() * 0.5, phase: Math.random() * 6,
      tx: x, tz: z, cross: null, wait: 0, down: 0, gy: 0.16 });
  }
  return peds;
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
    } else if (d > 0.01 && !(C && !C.go)) {
      p.speed = C && C.go ? 1.7 : p.want;
      p.h = Math.atan2(dz, dx);
      const st = Math.min(d, p.speed * dt);
      p.x += dx / d * st; p.z += dz / d * st;
    }
    p.onZebra = !!(C && C.go);
    // angefahren?
    const md = Math.hypot(me.pos.x - p.x, me.pos.z - p.z);
    if (!city.walk && me.alt < 1.5 && md < me.radius * 0.6 + 0.4 && Math.abs(me.speed) > 1.5) {
      p.down = 3.2; p.speed = 0;
      crash(0.15, 'car');
      if (p.onZebra && !city.ticket && !city.police) { city.reason = { kind: 'zebra', text: '🚸 Fussgänger auf dem Zebrastreifen angefahren' }; giveTicket(); }
      else showMsg('😵 Pass auf – ein Fussgänger!', 1.8);
      me.speed *= 0.5;
      continue;
    }
    const seen = Math.hypot(p.x - cam.x, p.z - cam.z) < city.see;
    p.mesh.visible = seen;
    if (seen) { p.gy = p.onZebra ? 0.02 : 0.16; animatePerson(p, dt); }
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
    if (!inGrid(i + DIRS[d][0], j + DIRS[d][1])) continue;
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

function stepMe(dt) {
  const stopped = city.pulled > 0 || city.ticket || (city.police && city.police.state === 'stop');
  if (!stopped) city.me.pullT = 0;
  if (stopped && city.me.fly) city.me.landing = true; // die Polizei holt dich herunter
  const me = city.me, input = stopped ? pullOver(me, dt) : city.input; // von der Polizei angehalten: rechts ranfahren
  const cr = city.cruise && city.cruise.on && input === city.input; // Tempomat: fährt selber (ausser beim Bremsen)
  const brake = input.brake, gas = input.gas || (cr && !brake), hand = !!input.drift && !stopped && !me.fly; // Handbremse zum Driften
  const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  me.steer += (steerTarget - me.steer) * Math.min(1, dt * 7);
  me.surface = me.fly ? 'asphalt' : surfaceAt(me.pos.x, me.pos.z);
  const boost = city.turbo > 0 ? 1.3 : 1; // Turbo-Benzin von der Tankstelle
  const offroad = ['tractor', 'offroad', 'jeep', 'monster', 'rally'].includes(me.v.kind); // im Matsch und Sand besser
  const SURF = { grass: 0.55, sand: offroad ? 0.8 : 0.5, mud: offroad ? 0.75 : 0.32, gravel: 0.85, snow: 0.8, water: 1 };
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
  const SURF_GRIP = { grass: 4, sand: 3.5, mud: 2.5, gravel: 6, snow: 3, water: 1.6 };
  const grip = (hand ? 0.8 : sliding ? (gas ? 1.3 : 2.4) : SURF_GRIP[me.surface] || 9) * city.wGrip; // Regen und Schnee: rutschiger
  me.vl *= Math.exp(-grip * dt);
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  me.pos.x += (fx * me.speed - fz * me.vl) * dt;
  me.pos.z += (fz * me.speed + fx * me.vl) * dt;
  me.drifting = Math.abs(me.vl) > 2.5 && Math.abs(me.speed) > 5;
  const latA = Math.abs(me.steer) * yawMax * Math.abs(me.speed);
  me.slip = 0.7 * Math.min(1, Math.max(0, (latA - 10.8 * gb) / 1.2)) * Math.min(1, Math.max(0, (Math.abs(me.speed) - 16) / 8));
  if (brake && me.speed > 6) me.slip = Math.max(me.slip, 0.45 + 0.55 * Math.min(1, me.speed / 40));
  if (me.drifting) me.slip = Math.max(me.slip, Math.min(1, Math.abs(me.vl) / 7));
  if (me.fly) me.slip = 0;

  // Häuser, Bäume und der Brunnen sind fest (wer höher fliegt, kommt darüber hinweg)
  const R = me.radius;
  let hit = 0, floor = 0;
  for (const b of S.solid) {
    const qx = Math.max(b.x0, Math.min(me.pos.x, b.x1)), qz = Math.max(b.z0, Math.min(me.pos.z, b.z1));
    const dx = me.pos.x - qx, dz = me.pos.z - qz, dd = Math.hypot(dx, dz);
    if (dd < R) {
      if (me.alt > b.h - 0.4) { floor = Math.max(floor, b.h + 0.5); continue; }
      if (dd > 0.001) { me.pos.x += dx / dd * (R - dd); me.pos.z += dz / dd * (R - dd); }
      else { me.pos.x -= Math.cos(me.heading) * R; me.pos.z -= Math.sin(me.heading) * R; }
      hit = Math.max(hit, Math.abs(me.speed)); city.hitAt = [qx, qz];
      if (b.lot && Math.abs(me.speed) > 0.8) city.touchLot = true; // beim Einparken ein Auto angefahren
    }
  }
  for (const o of S.round) {
    const dx = me.pos.x - o.x, dz = me.pos.z - o.z, dd = Math.hypot(dx, dz), min = R * 0.7 + o.r;
    if (dd < min && me.alt > (o.h || 6) - 0.4) { floor = Math.max(floor, (o.h || 6) + 0.5); continue; }
    if (dd < min && dd > 0.001) { me.pos.x += dx / dd * (min - dd); me.pos.z += dz / dd * (min - dd); hit = Math.max(hit, Math.abs(me.speed)); city.hitAt = [o.x, o.z]; }
  }
  // Mit Autos zusammenstossen: du wirst weggeschoben, das andere Auto bleibt kurz stehen
  for (const c of city.cars) {
    const dx = me.pos.x - c.x, dz = me.pos.z - c.z, dd = Math.hypot(dx, dz), min = (R + c.mesh.userData.radius) * 0.8;
    if (dd < min && dd > 0.001 && me.alt < 2.5) {
      me.pos.x += dx / dd * (min - dd); me.pos.z += dz / dd * (min - dd);
      const rel = Math.abs(me.speed - c.speed);
      if (rel > 2 && city.crashT <= 0) { crash(0.15 + rel / 18, 'car'); hurt(rel / 18, c.x, c.z); city.crashT = 0.5; c.blocked = 2; c.honkT = 0.4; c.waitMe = 2; }
      me.speed *= 0.6; me.vl *= 0.5;
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
  let slope = 0;
  if (!city.boat && (city.gy || Math.abs(me.pos.z) > LIMIT || Math.abs(me.pos.x) > LIMIT)) {
    const hx = Math.cos(me.heading) * me.len * 0.4, hz = Math.sin(me.heading) * me.len * 0.4;
    slope = (groundAt(me.pos.x + hx, me.pos.z + hz) - groundAt(me.pos.x - hx, me.pos.z - hz)) / (me.len * 0.8 || 1);
    if (!me.fly) me.speed -= 9.81 * slope * 0.7 * dt;
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
  bump: c => {
    const me = city.me, dx = me.pos.x - c.x, dz = me.pos.z - c.z, d = Math.hypot(dx, dz) || 1, min = (me.radius + c.radius) * 0.75;
    me.pos.x += dx / d * (min - d); me.pos.z += dz / d * (min - d);
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
  if (city.boat && !city.walk) return inWater(x, z, r);
  const keys = city.keys ? city.keys.size : 0;
  if ((Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT) || hwDrivable(x, z, r) || countryDrivable(x, z, r) || areaDrivable(x, z, r, keys) || passDrivable(x, z, r, keys)) return true;
  return !offroadWhy(x, z, r, keys) && !countryBlocked(x, z, r);
};
// Bodenhöhe unter einem Punkt: in der Stadt 0, auf der Passstrasse ihre Höhe, am Berg das feine Gelände, sonst genau
// wie das Gelände-Netz (20-m-Dreiecke, sonst schwebt man oder versinkt zwischen den Ecken)
const groundMemo = new Map();
function landAt(i, j) { const k = i * 100000 + j; let h = groundMemo.get(k); if (h === undefined) { h = S.height(-1100 + i * 20, -1100 + j * 20); groundMemo.set(k, h); } return h; }
function groundAt(x, z) {
  if (pkIn(x, z)) return parkY(x, z);
  const pg = passGround(x, z);
  if (pg) return pg;
  if (Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT) return 0;
  if (inPassRegion(x, z)) return Math.max(0, S.country.ground(x, z));
  if (onHighway(x, z) || inArea(x, z) || inCountry(x, z)) return 0;
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
  const y = !inCity ? 0.01 : Math.abs(me.pos.x - ni) < ROAD / 2 || Math.abs(me.pos.z - nj) < ROAD / 2 ? 0.035 : 0.175;
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
  const RZ = REST_ZONES, Pl = inZone(RZ.gas, x, z, 10) || inZone(RZ.charge, x, z, 10) ? RZ : P; // Tankstelle in der Stadt oder an der Raststätte
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
const UNBREAKABLE = ['lionelx']; // geht nie kaputt (muss nie in die Werkstatt)
function hurt(intensity, fromX, fromZ) {
  if (city.mission && city.mission.type === 'school') failSchool('💥 Unfall gebaut');
  if (city.mission && city.mission.type === 'park') endMission(false, '💥 Angefahren! Einparken nicht bestanden.');
  if (UNBREAKABLE.includes(city.me.v.kind) || city.boat) return;
  city.damage = Math.min(1, city.damage + Math.min(0.3, intensity * 0.28));
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
  const hit = ray.intersectObject(m, true).find(h => h.face && !h.object.isSprite && h.object.visible && !h.object.material.transparent && !h.object.material.side
    && h.object.name !== 'caliper' && !(h.object.parent && h.object.parent.name === 'wheel'));
  if (!hit) return;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + Math.random() * 0.4, 0.36), scratchMat);
  sc.position.copy(hit.point).addScaledVector(n, 0.03); // über den Türlinien-Aufklebern
  sc.lookAt(hit.point.clone().add(n));
  sc.rotation.z += (Math.random() - 0.5) * 0.5;
  S.scene.add(sc);
  m.attach(sc); // fährt mit
  city.scratches.push(sc);
}
function repairAll() {
  for (const sc of city.scratches) sc.parent && sc.parent.remove(sc);
  city.scratches = [];
  city.damage = 0;
}
function stepDamage(dt) {
  const me = city.me;
  if (city.damage > 0.5 && !city.walk && Math.random() < dt * city.damage * 10) { // Motor qualmt
    const fx = Math.cos(me.heading), fz = Math.sin(me.heading), f = me.len * 0.38;
    S.fx.puff(me.pos.x + fx * f, me.alt + 1.1, me.pos.z + fz * f, fx * me.speed * 0.5, fz * me.speed * 0.5);
  }
  // Werkstatt: in der Halle anhalten
  const P = S.places.repair;
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
      const gone = !!driven && v.kind === driven.kind && v.color === driven.color && (v.special || null) === (driven.special || null);
      if (gone) driven = null;
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
    name.textContent = (K[v.kind] || {}).name || v.kind;
    ps.textContent = '⚡ ' + v.ps;
    b.append(dot, name, ps);
    grid.append(b);
  }
  const row = document.createElement('div'); row.className = 'row';
  for (const [act, text] of edit ? [['done', '✅ Fertig']] : [['edit', '✏️ Autos wählen'], ['close', '✕ Schliessen']]) {
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
// Anderes Auto nehmen: gleiche Stelle, neue Werte, online sehen es alle
function switchCar(v) {
  const me = city.me;
  if (v.id === me.v.id) return;
  const mesh = buildCar(v, city.kinds), M = city.mission;
  mesh.rotation.order = 'YZX';
  if (M && M.pizzaBox) { me.mesh.remove(M.pizzaBox); mesh.add(M.pizzaBox); }
  S.scene.remove(me.mesh);
  S.scene.add(mesh);
  Object.assign(me, carStats(v, mesh, city.kinds, city.topSpeed), { v: { ...v, name: me.v.name }, mesh, speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  city.fuel = 1; // aus der Base kommt es vollgetankt und ganz
  city.damage = 0; city.scratches = [];
  city.gears = gearbox(v.kind);
  city.gripBoost = (city.kinds[v.kind] && city.kinds[v.kind].grip) || 1;
  if (city.cruise) showCruise(); // anderes Auto: höchstens so schnell, wie es kann
  city.canFly = !!(city.kinds[v.kind] && city.kinds[v.kind].fly);
  S.ui.flybtn.hidden = !city.canFly;
  S.ui.ps.textContent = '⚡ ' + v.ps + ' PS';
  if (S.snd) { S.snd.stop(); S.snd = createCarSound({ kind: v.kind }); }
  if (city.net) city.net.setCar(v);
  showMsg('🔑 ' + ((city.kinds[v.kind] || {}).name || v.kind), 1.6);
}

// ---------- Aussteigen und zu Fuss gehen ----------
// 🚪 oder X: anhalten, aussteigen (links, auf der Fahrerseite), herumlaufen (⬆️ gehen, Leertaste/DRIFT rennen) und
// wieder einsteigen: ins eigene Auto oder in ein Auto der eigenen Base. Online sehen die anderen nur das parkierte Auto.
function makePerson(shirtColor = 0x2563eb, hairColor = 0x5a3a1e, skinColor = 0xf2c9a0) {
  const g = new THREE.Group(), M = (color, r = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: r });
  const skin = M(skinColor), shirt = M(shirtColor), jeans = M(0x1e3a5f, 0.85), shoe = M(0x1b1b1b, 0.6);
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const limb = (r, len, m, x, y, z) => { // Arm oder Bein: dreht sich in der Schulter bzw. Hüfte
    const p = new THREE.Group();
    p.position.set(x, y, z);
    add(new THREE.CapsuleGeometry(r, len, 4, 10), m, 0, -len / 2 - r * 0.5, 0, p);
    g.add(p);
    return p;
  };
  const legs = [-1, 1].map(s => { const l = limb(0.075, 0.72, jeans, 0, 0.92, s * 0.11); add(new THREE.BoxGeometry(0.26, 0.09, 0.12), shoe, 0.05, -0.87, 0, l); return l; });
  const arms = [-1, 1].map(s => { const a = limb(0.055, 0.5, shirt, 0, 1.47, s * 0.26); add(new THREE.SphereGeometry(0.055, 10, 8), skin, 0, -0.62, 0, a); return a; });
  add(new THREE.CapsuleGeometry(0.17, 0.42, 4, 12), shirt, 0, 1.2, 0).scale.set(0.75, 1, 1.2); // Oberkörper
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin, 0, 1.58, 0); // Hals
  add(new THREE.SphereGeometry(0.12, 18, 14), skin, 0, 1.72, 0).scale.set(1, 1.1, 0.95); // Kopf
  add(new THREE.SphereGeometry(0.125, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(hairColor, 0.9), -0.01, 1.75, 0); // Haare
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.018, 8, 6), M(0x111111, 0.4), 0.11, 1.74, s * 0.045); // Augen
  g.userData = { legs, arms };
  return g;
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
  if (city.boat) { if (nearPier(me.pos.x, me.pos.z) && Math.abs(me.speed) < 5) leaveBoat(); else showMsg('🚤 Fahr zurück zum Steg, dort kannst du aussteigen', 1.8); return; }
  if (city.police || city.ticket || city.pulled > 0) { showMsg('🚔 Nicht jetzt – die Polizei!', 1.4); return; }
  if (tagState()) { showMsg('🏃 Nicht während Fangis', 1.4); return; }
  if (Math.abs(me.speed) > 3 || me.alt > 0.5) { showMsg('Zuerst anhalten', 1.2); return; }
  Object.assign(me, { speed: 0, vl: 0, steer: 0, fly: false, landing: false, alt: 0 });
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading), side = me.radius * 0.6 + 0.9; // links = Fahrerseite
  const w = city.walk = { x: me.pos.x + fz * side + fx * 0.3, z: me.pos.z - fx * side + fz * 0.3, h: me.heading - Math.PI / 2, speed: 0, phase: 0, mesh: makePerson(), target: null };
  w.mesh.position.set(w.x, 0, w.z);
  S.scene.add(w.mesh);
  if (me.mesh.userData.driver) me.mesh.userData.driver.visible = false; // der Fahrer ist ja ausgestiegen
  S.ui.walkbtn.textContent = '🚗';
  S.ui.flybtn.hidden = true;
  S.ui.hint.textContent = '⬅️ ➡️ drehen · ⬆️ gehen · Leertaste rennen · X einsteigen';
  showMsg('🚶 Ausgestiegen!', 1.4);
}
function getIn() {
  const w = city.walk, t = w.target;
  if (city.movie) { city.movie = null; w.mesh.visible = true; showMsg('🎬 Aufgestanden', 1.2); return; }
  if (t && t.movie) { city.movie = { t: 0 }; w.mesh.visible = false; showMsg('🍿 Film läuft – X zum Aufstehen', 2.4); return; }
  if (t && t.lift) { startLift(w); return; }
  if (t && t.bed) { goSleep(w); return; }
  if (w.ski) { skiOff(w); return; }
  if (!t) { showMsg('🚗 Geh näher zu einem Auto', 1.4); return; }
  S.scene.remove(w.mesh);
  city.walk = null;
  if (t.boat) enterBoat();
  else if (t.plane) enterPlane();
  else if (t.ride) { // Fahrzeug tauschen: dein Auto bleibt stehen, wo es ist (und man kann wieder zurücktauschen)
    const me = city.me, R = t.ride, old = { v: me.v, x: me.pos.x, z: me.pos.z, h: me.heading };
    switchCar(R.v);
    Object.assign(me.pos, { x: R.x, z: R.z }); me.heading = R.h;
    S.scene.remove(R.mesh);
    R.mesh = buildCar({ ...old.v, special: null }, city.kinds);
    R.mesh.position.set(old.x, 0, old.z); R.mesh.rotation.y = -old.h; S.scene.add(R.mesh);
    if (R.mesh.userData.driver) R.mesh.userData.driver.visible = false;
    Object.assign(R, old);
  } else if (t.v) { // Auto aus der Base: das alte Auto fährt zurück in die Base
    switchCar(t.v);
    Object.assign(city.me.pos, { x: t.x, z: t.z });
    city.me.heading = t.h;
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
  if (city.sleep || city.movie) return; // schläft oder schaut einen Film
  if (w.lift) { stepLift(w, dt); return; }
  if (w.ski) { stepSki(w, dt); return; }
  w.h += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 2.6 * dt;
  const want = input.gas ? (input.drift ? 7 : 3.6) : input.brake ? -1.8 : 0;
  w.speed += (want - w.speed) * Math.min(1, dt * 8);
  const fx = Math.cos(w.h), fz = Math.sin(w.h);
  w.x += fx * w.speed * dt; w.z += fz * w.speed * dt;
  const R = 0.35, push = (ox, oz, min) => {
    const dx = w.x - ox, dz = w.z - oz, dd = Math.hypot(dx, dz);
    if (dd < min && dd > 0.001) { w.x += dx / dd * (min - dd); w.z += dz / dd * (min - dd); }
  };
  for (const b of S.solid) { // Häuser, Bäume, Mauern, parkierte Autos
    const qx = Math.max(b.x0, Math.min(w.x, b.x1)), qz = Math.max(b.z0, Math.min(w.z, b.z1));
    push(qx, qz, R);
  }
  for (const o of S.round) push(o.x, o.z, R + o.r);
  for (const c of city.cars) push(c.x, c.z, R + c.mesh.userData.radius * 0.7); // Autos schieben einen weg
  push(me.pos.x, me.pos.z, R + me.radius * 0.6);
  if (!allowedAt(w.x, w.z, 0.5)) { w.x = w.okX ?? w.x; w.z = w.okZ ?? w.z; } else { w.okX = w.x; w.okZ = w.z; }
  // Laufen: Beine und Arme schwingen
  w.gy = groundAt(w.x, w.z);
  animatePerson(w, dt);
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
  for (const R of city.rides || []) { // Traktor (oder dein dafür abgestelltes Auto)
    const d = Math.hypot(R.x - w.x, R.z - w.z) - R.mesh.userData.length * 0.35;
    if (d < 1.6 && d < bd) { bd = d; best = { v: R.v, x: R.x, z: R.z, h: R.h, ride: R }; }
  }
  if (!city.boat && nearPier(w.x, w.z) && Math.hypot(w.x - BOAT_HOME.x, w.z - BOAT_HOME.z) < 12.5) { best = { boat: true }; bd = 0; } // Boot am Steg
  if (Math.hypot(w.x - LIFT.A.x, w.z - LIFT.A.z) < 14) { best = { lift: true }; bd = 0; } // Sessellift (Talstation)
  const KS = S.places.kino && S.places.kino.seats;
  if (KS && w.x > KS.x0 && w.x < KS.x1 && w.z > KS.z0 && w.z < KS.z1) { best = { movie: true }; bd = 0; } // im Kino bei den Sitzen
  const FL = S.areas.flyer;
  if (FL && !city.plane && Math.hypot(w.x - FL.x, w.z - FL.z) < 16) { best = { plane: true }; bd = 0; } // Flugzeug
  const HB = S.places.house && S.places.house.bed;
  if (HB && city.house.owned && Math.hypot(w.x - HB.x, w.z - HB.z) < 3) { best = { bed: true }; bd = 0; } // Bett im eigenen Haus
  if (best && (!w.target || w.target.v !== best.v || !!w.target.boat !== !!best.boat || !!w.target.lift !== !!best.lift || !!w.target.bed !== !!best.bed || !!w.target.plane !== !!best.plane || !!w.target.movie !== !!best.movie))
    showMsg(best.movie ? '🍿 Film schauen – X' : best.plane ? '✈️ Flugzeug – X: einsteigen und fliegen' : best.bed ? '🛏️ Bett – X: schlafen' : best.lift ? '🚡 Sessellift – X: einsteigen und hinauffahren' : best.boat ? '🚤 Boot – einsteigen' : best.v ? '🔑 ' + ((city.kinds[best.v.kind] || {}).name || '') + ' – 🚗 einsteigen' : '🚗 Einsteigen?', 1.2);
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
    name.textContent = (K[o.v.kind] || {}).name + ' · ⚡ ' + o.v.ps;
    ps.textContent = o.sold ? 'verkauft' : o.price + ' 🪙';
    b.append(dot, name, ps); grid.append(b);
  });
  const row = document.createElement('div'); row.className = 'row';
  const value = D.value(city.me.v.id), sell = document.createElement('button'), close = document.createElement('button');
  sell.dataset.act = 'sell'; sell.disabled = !value;
  sell.textContent = value ? '💰 ' + ((K[city.me.v.kind] || {}).name || '') + ' verkaufen: +' + value + ' 🪙' : '💰 Dieses Auto kann man nicht verkaufen';
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
    showMsg('💰 ' + ((city.kinds[old.kind] || {}).name || '') + ' verkauft: +' + res + ' 🪙', 2.4);
    return;
  }
  const o = city.offers[+b.dataset.buy];
  if (!o || o.sold || !city.dealer.buy(o)) return;
  o.sold = true;
  if (o.mesh) o.mesh.parent.remove(o.mesh);
  closeDealer();
  switchCar(o.v); out();
  showMsg('🔑 Gekauft! Dein neuer ' + ((city.kinds[o.v.kind] || {}).name || '') + ' gehört dir.', 2.6);
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
  if (sh.orders.length) p.append(el('p', 'note', '🚚 Bestellt, der Lieferant bringt sie bald: ' + sh.orders.map(o => (K[o.v.kind] || {}).name).join(', ')));
  const mine = el('div', 'cars');
  sh.stock.forEach((o, k) => {
    if (!o) return;
    const b = el('button'), dot = el('i');
    b.dataset.back = k; dot.style.background = o.v.color;
    b.append(dot, el('span', '', (K[o.v.kind] || {}).name + ' · ⚡ ' + o.v.ps), el('small', '', '↩ ' + o.cost + ' 🪙'));
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
    b.append(dot, el('span', '', (K[o.v.kind] || {}).name + ' · ⚡ ' + o.v.ps), el('small', '', o.sold ? 'gekauft' : o.cost + ' 🪙'));
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
      b.append(dot, el('span', '', (K[o.v.kind] || {}).name + ' · ⚡ ' + o.v.ps), el('small', '', colorName(o.v.color)));
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
const LOT_KINDS = ['car', 'kompakt', 'kombi', 'hatch', 'coupe', 'minivan', 'pickup', 'smart'];
const LOT_TAKEN = [0, 1, 3, 5, 6];
function parkLotCars() {
  if (S.lotCars) return;
  S.lotCars = [];
  for (const k of LOT_TAKEN) {
    const b = S.places.lot.bays[k], kind = LOT_KINDS[Math.floor(Math.random() * LOT_KINDS.length)];
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
  for (const [s, lat] of [[300, 16], [1500, -16], [2600, 16], [3500, -16], [4400, 16]]) { // Autobahn: auf dem Pannenstreifen
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
    if (!inGrid(i + fx, j + fz)) continue;
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
function startChase() {
  if (city.police || city.ticket) return;
  const me = city.me, fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  // Kreuzung etwa 70 m hinter dir
  let best = null, bd = Infinity;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = node(i), z = node(j), dx = x - me.pos.x, dz = z - me.pos.z, dist = Math.hypot(dx, dz);
    const behind = -(dx * fx + dz * fz);
    const score = Math.abs(dist - 75) + (behind > 0 ? 0 : 200);
    if (score < bd) { bd = score; best = [i, j]; }
  }
  const mesh = buildCar({ kind: 'police', color: city.kinds.police.color, special: null }, city.kinds);
  const pos = new THREE.Vector3(node(best[0]), 0, node(best[1]));
  S.scene.add(mesh);
  city.police = { mesh, pos, heading: Math.atan2(me.pos.z - pos.z, me.pos.x - pos.x), speed: 8, state: 'chase', closeT: 0, farT: 0, t: 0,
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
    for (const [dx, dz] of DIRS) {
      const ni = i + dx, nj = j + dz;
      if (!inGrid(ni, nj) || prev.has(key(ni, nj))) continue;
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
  const me = city.me;
  P.t += dt;
  const dx = me.pos.x - P.pos.x, dz = me.pos.z - P.pos.z, dist = Math.hypot(dx, dz) + (me.alt > 4 ? 200 : 0); // in der Luft kommt sie nicht hin
  let tx, tz, want = P.maxV;
  if (P.state === 'leave') { // fährt davon und verschwindet
    tx = P.pos.x + Math.cos(P.heading) * 50; tz = P.pos.z + Math.sin(P.heading) * 50;
    want = 16;
    if (P.t > 6) { removePolice(); return; }
  } else if (P.state === 'stop') {
    tx = me.pos.x; tz = me.pos.z; want = 0;
  } else if (dist < 40) { // nah: direkt hinter dir her, etwas vorausschauend
    tx = me.pos.x + Math.cos(me.heading) * me.speed * 0.4; tz = me.pos.z + Math.sin(me.heading) * me.speed * 0.4;
    want = dist < 9 ? Math.max(0, Math.abs(me.speed) - 1) : Math.min(P.maxV, Math.abs(me.speed) + 8 + dist * 0.4);
  } else { // weit: von Kreuzung zu Kreuzung
    if ((P.pathT = (P.pathT || 0) - dt) <= 0 || !P.path.length) { P.path = pathTo(P.pos.x, P.pos.z, me.pos.x, me.pos.z); P.pathT = 1; }
    while (P.path.length > 1 && Math.hypot(P.path[0][0] - P.pos.x, P.path[0][1] - P.pos.z) < 9) P.path.shift();
    [tx, tz] = P.path[0] || [me.pos.x, me.pos.z];
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
      if (o.me && Math.abs(P.speed - me.speed) > 4 && city.crashT <= 0) { crash(0.3, 'car'); hurt(0.3, P.pos.x, P.pos.z); city.crashT = 0.5; }
    }
  }
  // Erwischt? Dicht dran bleiben = rausziehen; freiwillig anhalten geht auch
  if (P.state === 'chase') {
    P.closeT = dist < 9 ? P.closeT + dt : Math.max(0, P.closeT - dt * 0.5);
    P.farT = dist > 160 ? P.farT + dt : 0;
    if (P.closeT > 3 || (dist < 14 && Math.abs(me.speed) < 1.5 && P.t > 2)) {
      P.state = 'stop';
      city.pulled = 1.4;
      showMsg('🚓 Rechts ranfahren und anhalten!', 1.8);
      horn(0.8, 0.3, 0.8);
    } else if (P.farT > 8) {
      showMsg('😎 Entkommen! Die Polizei gibt auf.', 2.5);
      P.state = 'leave'; P.t = 0;
      S.ui.chase.hidden = true;
      P.siren.set(0);
    }
  }
  if (P.state === 'stop' && city.pulled <= 0 && Math.abs(me.speed) < 0.5 && !city.ticket) giveTicket();
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
  const R = city.reason || {}, amount = R.kind === 'speed' ? speedFine(R.kmh) : R.kind === 'gasse' ? 50 : R.kind === 'blue' ? 20 : R.kind === 'zebra' ? 30 : Math.min(50, 10 * city.fines), paid = city.pay(amount);
  city.ticket = true;
  const T = S.ui.ticket;
  T.querySelector('.amount').textContent = paid ? paid + ' 🪙' : 'Verwarnung';
  T.querySelector('.reason').textContent = (city.reason || {}).text || 'Über Rot gefahren 🚦';
  T.querySelector('.jailnote').hidden = !R.jail;
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
  if (P) { P.state = 'leave'; P.t = 0; P.siren.set(0); }
  if ((city.reason || {}).jail) { city.reason = null; goToJail(); return; }
  const kind = (city.reason || {}).kind;
  showMsg(kind === 'speed' ? 'Gute Fahrt! Und nicht zu schnell 😉' : kind === 'gasse' ? 'Bei Blaulicht immer Platz machen 🚑' : kind === 'blue' ? 'Parkscheibe nicht vergessen 🕐' : kind === 'zebra' ? 'Am Zebrastreifen immer anhalten 🚸' : 'Gute Fahrt! Und bei Rot anhalten 😉', 2);
  if (kind === 'gasse' || kind === 'blue' || kind === 'zebra') city.reason = null;
}
function removePolice() {
  const P = city.police;
  if (!P) return;
  P.siren.stop();
  S.scene.remove(P.mesh);
  city.police = null;
  S.ui.chase.hidden = true;
}

function surfaceAt(x, z) {
  if (city && city.boat && !city.walk) return 'water';
  if (Math.abs(x) > HALF + ROAD / 2 || Math.abs(z) > HALF + ROAD / 2) {
    if (onHighway(x, z) || inArea(x, z)) return 'asphalt';
    return countrySurface(x, z) || (onPass(x, z) ? 'asphalt' : 'grass');
  }
  const bi = Math.floor(x / BLOCK + N / 2), bj = Math.floor(z / BLOCK + N / 2);
  const nx = node(Math.round(x / BLOCK + N / 2)), nz = node(Math.round(z / BLOCK + N / 2));
  if (Math.abs(x - nx) < ROAD / 2 || Math.abs(z - nz) < ROAD / 2) return 'asphalt';
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
#city .minimap { position: absolute; top: 10px; right: 62px; background: rgba(0,0,0,.45); border-radius: 10px; }
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
#city .ticket[hidden], #city .chase[hidden] { display: none; }
#city .ticket .card { background: #fff8dc; color: #222; border-radius: 16px; padding: 18px 26px; width: min(420px, 80%);
  box-shadow: 0 10px 40px rgba(0,0,0,.6); transform: rotate(-2deg); font-size: 18px; border-top: 14px solid #1d4ed8; }
#city .ticket h2 { margin: 0 0 10px; font-size: 28px; letter-spacing: 1px; }
#city .ticket p { margin: 6px 0; } #city .ticket .note { color: #555; font-size: 15px; } #city .ticket .count { color: #b91c1c; font-weight: 800; }
#city .ticket .pay { margin-top: 10px; font: 800 20px system-ui, sans-serif; color: #fff; background: #16a34a; border: none; border-radius: 12px; padding: 10px 22px; }
#city .hint { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); font-size: 15px; opacity: .85;
  background: rgba(0,0,0,.45); padding: 4px 12px; border-radius: 10px; white-space: nowrap; }
`;

const HINT = '⬅️ ➡️ lenken · ⬆️ Gas · ⬇️ Bremse/rückwärts · Leertaste driften · H hupen · X aussteigen';
function buildDom() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'city';
  root.hidden = true;
  root.innerHTML = `
    <canvas class="minimap" width="190" height="190"></canvas>
    <div class="clock"></div>
    <button class="quit" title="Stadt verlassen">✕</button>
    <button class="cam" title="Kamera wechseln (V)">📷</button>
    <button class="horn" title="Hupen (H)">📯</button>
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
    <button class="ctl hand" data-k="drift" style="right:70px; bottom:120px">DRIFT</button>
    ${FLY_HTML}`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), hint: $('.hint'), minimap: $('.minimap'), ctls: [...root.querySelectorAll('.ctl')],
    speed: $('.speed'), cruise: $('.cruise'), cruiseVal: $('.cruise b'), cruiseOn: $('.cruise .cron'), limit: $('.limit'), fuel: $('.fuel'), fuelIcon: $('.fuel b'), fuelBar: $('.fuel i'), dmg: $('.dmg'), dmgBar: $('.dmg i'), jail: $('.jailbar'), jailtime: $('.jailbar .jt'), bail: $('.bail'), flash: $('.flash'), flybtn: $('.flybtn'), flyctl: $('.flyctl'), basebtn: $('.basebtn'), walkbtn: $('.walkbtn'), basepanel: $('.basepanel'), dealpanel: $('.dealpanel'), talkpanel: $('.talkpanel'), talkbtn: $('.talkbtn'), shopbtn: $('.shopbtn'),
    chase: $('.chase'), ticket: $('.ticket'), drift: $('.drift'), clock: $('.clock'),
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
  $('.horn').addEventListener('pointerdown', e => { e.preventDefault(); honk(); });
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
}

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift', ...FLY_KEYS };
function onKey(e) {
  if (!city || (e.target && e.target.tagName === 'INPUT')) return; // im Chat wird geschrieben, nicht gefahren
  if (e.code === 'KeyH' && e.type === 'keydown') { honk(); e.preventDefault(); return; }
  if (e.code === 'KeyJ' && e.type === 'keydown') { toggleJobs(); e.preventDefault(); return; }
  if (e.code === 'KeyV' && e.type === 'keydown') { nextCam(); e.preventDefault(); return; }
  if (e.code === 'KeyF' && e.type === 'keydown' && !e.repeat) { toggleFly(); e.preventDefault(); return; }
  if (e.code === 'KeyB' && e.type === 'keydown' && !e.repeat) { toggleBase(); e.preventDefault(); return; }
  if (e.code === 'KeyX' && e.type === 'keydown' && !e.repeat) { toggleWalk(); e.preventDefault(); return; }
  if (e.code === 'KeyT' && e.type === 'keydown' && !e.repeat) { startTalk(); e.preventDefault(); return; }
  if (e.type === 'keydown' && (e.code === 'KeyC' || e.key === '+' || e.key === '-')) { // Tempomat (Taste + und − je nach Tastatur)
    cruiseCmd(e.code === 'KeyC' ? 'on' : e.key === '-' ? '-' : '+'); e.preventDefault(); return; }
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
function drawMinimapBase() {
  const c = document.createElement('canvas');
  c.width = c.height = MAP;
  const g = c.getContext('2d');
  for (const key of S.parks) {
    const [bi, bj] = key.split(',').map(Number);
    g.fillStyle = '#3f7d34';
    g.fillRect(mx(node(bi) + 7), mx(node(bj) + 7), (BLOCK - 14) * mapScale, (BLOCK - 14) * mapScale);
  }
  g.fillStyle = '#4aa3ff';
  g.beginPath(); g.arc(mx(0), mx(0), 3, 0, Math.PI * 2); g.fill();
  g.font = '13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [k, icon] of [['gas', '⛽'], ['wash', '🫧'], ['pizza', '🍕'], ['jail', '🔒'], ['repair', '🔧'], ['dealer', '🚗'], ['hospital', '🏥'], ['house', '🏡'], ['blue', '🅿️'], ['park', '🅿️'], ['order', '🍔'], ['kino', '🎬'], ['stadium', '⚽']]) { const p = S.places[k] && { x: S.places[k].x ?? S.places[k].cx, z: S.places[k].z ?? S.places[k].cz }; if (p) g.fillText(icon, mx(p.x), mx(p.z)); }
  g.strokeStyle = 'rgba(220,225,235,0.85)'; g.lineWidth = Math.max(2, ROAD * mapScale);
  for (let i = 0; i <= N; i++) {
    g.beginPath(); g.moveTo(mx(node(i)), mx(-HALF)); g.lineTo(mx(node(i)), mx(HALF)); g.stroke();
    g.beginPath(); g.moveTo(mx(-HALF), mx(node(i))); g.lineTo(mx(HALF), mx(node(i))); g.stroke();
  }
  return c;
}
// Draussen: Übersicht mit Stadt, Zufahrt und Autobahn
function drawWideMap(g) {
  const sc = (MAP - 12) / 3700, wx = x => MAP / 2 + x * sc, wz = z => MAP / 2 + (z - 820) * sc, me = city.me;
  g.fillStyle = 'rgba(32,62,38,0.92)'; g.fillRect(0, 0, MAP, MAP);
  const rect = (b, col) => { g.fillStyle = col; g.fillRect(wx(b.x0), wz(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc); };
  rect({ x0: -1100, x1: -702, z0: -700, z1: 700 }, '#1e5a8a'); // Wasser
  for (const A of Object.values(AREAS)) { rect(A.rect, city.keys.size >= A.need ? '#9ca3af' : '#4b5563'); rect(A.road, '#9ca3af'); }
  rect({ x0: 400, x1: 980, z0: -175, z1: -125 }, '#e5e7eb'); // Piste
  g.strokeStyle = city.keys.size >= PASS_AREA.need ? '#e5e7eb' : '#6b7280'; g.lineWidth = 2; g.beginPath(); // Passstrasse
  passPoints().forEach((p, i) => (i % 6 ? 0 : i ? g.lineTo(wx(p.x), wz(p.z)) : g.moveTo(wx(p.x), wz(p.z))));
  g.stroke();
  rect(FARM, '#8a9a3a'); rect({ x0: 316, x1: 512, z0: -287, z1: -273 }, '#a47b4f'); rect({ x0: 250, x1: 330, z0: -263, z1: -249 }, '#a47b4f'); // Bauernhof
  rect({ x0: -702, x1: -646, z0: -660, z1: -170 }, '#e8d39a'); rect({ x0: -646, x1: -250, z0: -200, z1: -184 }, '#9ca3af'); // Strand
  g.fillStyle = '#7b8490'; g.fillRect(wx(-HALF), wz(-HALF), 2 * HALF * sc, 2 * HALF * sc);
  g.strokeStyle = '#e5e7eb'; g.lineWidth = 3; g.beginPath();
  for (let s = 0; s <= HW_LEN; s += 40) { const p = hwPoint(s); if (s) g.lineTo(wx(p.x), wz(p.z)); else g.moveTo(wx(p.x), wz(p.z)); }
  g.stroke();
  g.beginPath(); g.moveTo(wx(0), wz(HALF)); g.lineTo(wx(0), wz(HW.cz - HW.R)); g.stroke();
  g.fillStyle = '#fde047';
  for (const c of city.hw) if (c.dir) g.fillRect(wx(c.x) - 1, wz(c.z) - 1, 2, 2);
  g.fillStyle = '#f59e0b'; g.fillRect(wx(REST.x - 150), wz(REST.z + 20), 300 * sc, 110 * sc); // Raststätte
  g.fillStyle = '#ef4444'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(wx(me.pos.x), wz(me.pos.z), 5, 0, Math.PI * 2); g.fill(); g.stroke();
}
function drawMinimap() {
  const g = S.ui.minimap.getContext('2d');
  g.clearRect(0, 0, MAP, MAP);
  if (Math.max(Math.abs(city.me.pos.x), Math.abs(city.me.pos.z)) > LIMIT) { drawWideMap(g); return; }
  g.drawImage(S.mapBase, 0, 0);
  if (city.works) { const W = city.works; g.strokeStyle = '#f97316'; g.lineWidth = 4; g.beginPath(); g.moveTo(mx(node(W.a[0])), mx(node(W.a[1]))); g.lineTo(mx(node(W.b[0])), mx(node(W.b[1]))); g.stroke(); }
  g.fillStyle = '#ffffff';
  for (const c of city.cars) g.fillRect(mx(c.x) - 1.5, mx(c.z) - 1.5, 3, 3);
  S.places.bases.forEach((B, s) => { // eigene Base und die der Mitspieler
    if (s === city.baseSlot) { g.font = '13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏠', mx(B.x), mx(B.z)); }
    else if (baseOwner(s)) { g.fillStyle = BASE_COLORS[s]; g.fillRect(mx(B.x) - 3, mx(B.z) - 3, 6, 6); }
  });
  g.fillStyle = '#ffffff';
  if (city.police) {
    g.fillStyle = Math.floor(city.t * 6) % 2 ? '#3b82f6' : '#ef4444';
    g.beginPath(); g.arc(mx(city.police.pos.x), mx(city.police.pos.z), 4.5, 0, Math.PI * 2); g.fill();
  }
  const it = city.net ? tagState() : null;
  if (city.netCars) for (const o of city.netCars.list()) { // Mitspieler als farbige Punkte, wer bei Fangis dran ist, mit rotem Ring
    g.fillStyle = o.color; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx(o.x), mx(o.z), 5, 0, Math.PI * 2); g.fill(); g.stroke();
    if (it && it.it === o.slot) { g.strokeStyle = Math.floor(city.t * 4) % 2 ? '#ff2020' : '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(mx(o.x), mx(o.z), 9, 0, Math.PI * 2); g.stroke(); }
  }
  g.font = '11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const c of city.cars) if (c.wreck > 0) g.fillText('⚠️', mx(c.x), mx(c.z)); // Unfälle
  if (city.truck) g.fillText('🚚', mx(city.truck.x), mx(city.truck.z));
  const M = city.mission;
  if (M && M.target) { // Ziel des Auftrags blinkt
    g.fillStyle = Math.floor(city.t * 4) % 2 ? M.color : '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx(M.target.x), mx(M.target.z), 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const me = city.me, x = mx(me.pos.x), y = mx(me.pos.z), h = me.heading;
  g.fillStyle = '#ffe066'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + Math.cos(h) * 7, y + Math.sin(h) * 7);
  g.lineTo(x + Math.cos(h + 2.5) * 5, y + Math.sin(h + 2.5) * 5);
  g.lineTo(x + Math.cos(h - 2.5) * 5, y + Math.sin(h - 2.5) * 5);
  g.closePath(); g.fill(); g.stroke();
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
    S.mapBase = drawMinimapBase();
    S.fx = makeEffects(S.scene);
    window.addEventListener('resize', () => S && !S.ui.root.hidden && layout());
  }
  const mesh = buildCar(player, kinds);
  mesh.rotation.order = 'YZX';
  // Start: auf der rechten Spur einer Strasse am Stadtrand, Richtung Zentrum
  // online starten alle auf einer anderen Strasse am Stadtrand
  const me = { v: player, mesh, pos: new THREE.Vector3(node(1 + (net ? net.mySlot : 0)) + 20, 0, node(0) + LANE), heading: 0, speed: 0, vl: 0, steer: 0,
    ...carStats(player, mesh, kinds, topSpeed), slip: 0, surface: 'asphalt', alt: 0, fly: false, landing: false };
  city = { me, cars: spawnTraffic(kinds), input: {}, t: Math.random() * CYCLE, msgT: 0, crashT: 0, hornT: 0, inCross: false, tod: 0.02, turbo: 0, fuelT: 0, washT: 0, mission: null, accT: 25 + Math.random() * 30, fuel: 1, damage: 0, scratches: [], repairT: 0, wx: { kind: 'sun', t: 60 + Math.random() * 60, i: 0 }, wGrip: 1, dealT: 0, dealOpen: false, dealer, customers: [], custT: 4, custMsgT: 0, talk: null, okPos: { x: me.pos.x, z: me.pos.z }, hw: [], hwMsgT: 0, onHw: false, eventT: 50 + Math.random() * 40, gy: 0, see: SEE, perfT: 0, perfN: 0,
    gears: gearbox(player.kind), onExit, last: performance.now(), kinds, pay, gripBoost: (kinds[player.kind] && kinds[player.kind].grip) || 1, canFly: !!(kinds[player.kind] && kinds[player.kind].fly), fines: 0, police: null, pulled: 0, ticket: false,
    earn, net, topSpeed, garage, baseSlot: net ? net.mySlot : 0, baseT: 0, atBase: -1, baseEdit: false, netCars: net ? makeNetCars({ scene: S.scene, kinds, net }) : null, drift: 0, driftT: 0, driftBest: (() => { try { return +localStorage.getItem('autoRetterDriftBest') || 0; } catch (e) { return 0; } })() };
  S.fx.clear();
  S.scene.add(mesh);
  mesh.traverse(o => { const m = o.material; if (m && m.emissive && m.emissiveIntensity === 1.2 && m.color.getHex() === 0xffffff) city.headMat = m; }); // Scheinwerfer (gemeinsam für alle Autos)
  for (const c of city.cars) S.scene.add(c.mesh);
  warmUp(S.renderer, S.scene, S.camera);
  if (!S.quality) S.quality = makeQuality(S.renderer, layout);
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
  setupStadium();
  if (S.places.kino && !S.kinoCrowd) { // Leute vor dem Kino (abends)
    const K = S.places.kino; S.kinoCrowd = [];
    for (let k = 0; k < 7; k++) { const mesh = makePerson(SHIRTS[k % SHIRTS.length], HAIRS[k % HAIRS.length], SKINS[k % SKINS.length]); mesh.traverse(o => { o.castShadow = false; });
      const p = { mesh, h: Math.PI / 2 + (Math.random() - 0.5), phase: k }; mesh.position.set(K.door.x - 6 + k * 1.8, 0.16, K.door.z - 3 - (k % 2) * 1.2); mesh.visible = false; S.scene.add(mesh); S.kinoCrowd.push(p); }
  }
  city.peds = makePeds();
  city.works = null; city.worksT = 30 + Math.random() * 40;
  city.house = loadHouse(); city.houseOpen = false; showHouse();
  city.rides = []; city.boat = null; city.bales = 0;
  city.cruise = { on: false, kmh: Math.min(80, cruiseMax()) }; showCruise();
  const TR = RIDES_INFO.tractor;
  if (kinds.tractor) { // Traktor auf dem Bauernhof: zu Fuss hin und einsteigen
    const mesh = buildCar({ ...TR.v, special: null }, kinds); mesh.position.set(TR.x, 0, TR.z); mesh.rotation.y = -TR.h;
    if (mesh.userData.driver) mesh.userData.driver.visible = false;
    S.scene.add(mesh); city.rides.push({ v: { ...TR.v }, x: TR.x, z: TR.z, h: TR.h, mesh });
  }
  setupKeys();
  city.hw = makeHighwayTraffic(S.scene, kinds);
  for (const m of city.hw.meshes) noShadow(m);
  setupDealer();
  // Fahrzeuge, die erst später auftauchen, schon jetzt einmal bauen (danach nur noch kopieren – sonst ruckelt es dann)
  for (const v of [...city.base, { kind: 'police', color: kinds.police.color }, { kind: 'sports', color: '#18181b' }, { kind: 'muscle', color: '#18181b' },
    { kind: 'carrier', color: '#f59e0b' }]) if (kinds[v.kind]) buildCar({ special: null, ...v }, kinds);
  prewarm();
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  S.snd = createCarSound({ kind: player.kind });
  S.camera.position.set(me.pos.x - 9, 3.4, me.pos.z);
  camLook.set(me.pos.x, 1.2, me.pos.z);
  window.__city = () => city; // für Tests im Browser
  window.__cityS = () => S;
  window.__cityTick = n => { for (let k = 0; k < n && city; k++) step(city.last + 1000 / 60); }; // Tests: Bilder rechnen, auch im Hintergrund
  window.__cityMission = type => startMission(type); // Aufträge und Überraschungen direkt starten
  requestAnimationFrame(loop);
}

// Spar-Modus für langsame Geräte: ist es auch mit wenig Pixeln (makeQuality) noch unter 40 Bildern pro Sekunde,
// zuerst die Schatten aus, danach die Autos nur noch in der Nähe zeichnen
function saveGpu(frame) {
  if (frame > 0.1) return; // Tab im Hintergrund o. ä.
  city.perfT += frame; city.perfN++;
  if (city.perfT < 3) return;
  const slow = city.perfT / city.perfN > 1 / 40;
  city.perfT = city.perfN = 0;
  if (!slow || S.renderer.getPixelRatio() > 0.61) return;
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
  const dt = Math.min(0.05, (now - city.last) / 1000);
  S.quality((now - city.last) / 1000);
  saveGpu((now - city.last) / 1000);
  city.last = now;
  city.t += dt;
  if (city.msgT > 0 && (city.msgT -= dt) <= 0) S.ui.msg.textContent = '';
  city.hornT -= dt;
  stepLights();
  stepDayNight(dt);
  stepWeather(dt);
  if (city.pulled > 0) city.pulled -= dt;
  if (city.walk) stepWalk(dt); else if (city.plane) stepPlane(dt); else stepMe(dt);
  stepJail();
  stepRules(dt);
  stepDamage(dt);
  stepDealer(dt);
  stepShop(dt);
  if (city.dealer) stepDelivery(dt);
  stepDrift(dt);
  stepPolice(dt);
  stepPlaces(dt);
  stepBases(dt);
  stepMission(dt);
  stepTraffic(dt);
  stepBlue(dt);
  stepPeds(dt);
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
  S.sun.intensity = 2.4 * day;
  n.hemi.intensity = 0.32 + 0.43 * day;
  n.hemi.color.lerpColors(C_SKY_N, C_SKY_D, day);
  n.fog.color.lerpColors(C_NIGHT, C_DAY, day);
  S.renderer.toneMappingExposure = 0.9 + 0.05 * day;
  const env = day > 0.6 ? n.envs.day : day > 0.2 ? n.envs.dusk : n.envs.night;
  if (S.scene.environment !== env) S.scene.environment = env;
  n.heads.emissiveIntensity = 0.6 + 3 * night;
  for (const m of n.walls) m.emissiveIntensity = 1.1 * night;
  n.pools.visible = night > 0.05; n.pools.material.opacity = 0.75 * night;
  n.stars.material.opacity = night;
  if (S.clouds.material && S.clouds.material.color) S.clouds.material.color.setScalar(0.25 + 0.75 * day);
  if (city.headMat) city.headMat.emissiveIntensity = 1.2 + 2.5 * night; // Scheinwerfer aller Autos
  const me = city.me, fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  n.headlight.intensity = 90 * night;
  n.headlight.position.set(me.pos.x + fx * 1.5, 1.1, me.pos.z + fz * 1.5);
  n.headlight.target.position.set(me.pos.x + fx * 25, 0, me.pos.z + fz * 25);
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
  for (const o of [rain, snow]) { o.frustumCulled = false; o.visible = false; S.scene.add(o); }
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
    m.emissive.setScalar(k * snowI * (0.35 + 0.65 * S.sun.intensity / 2.4)); // nachts leuchtet der Schnee weniger
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
  S.ui.flyctl.hidden = city.plane ? (!city.plane.air && me.speed < 30) : (!me.fly || me.landing);
  S.ui.cruise.hidden = !!(city.walk || city.plane);
  drawMinimap();
  if (!S.snd) return;
  let near = null, nd = Infinity;
  for (const c of city.cars) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < nd) { nd = d; near = c; } }
  const g = city.gears(me.speed, me.maxV);
  S.snd.update({ frac: g.frac, throttle: city.input.gas ? 1 : 0.15, speed: me.speed, slip: me.slip,
    surface: ['sand', 'mud', 'snow', 'gravel'].includes(me.surface) ? 'gravel' : me.surface === 'water' ? 'grass' : me.surface,
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
  if (city.plane && !w) { // Flugzeug: weit hinten und oben
    const pb = 46 + Math.abs(me.speed) * 0.1, y = me.mesh.position.y;
    camWant.set(me.pos.x - fx * pb, Math.max(y + 11, groundAt(me.pos.x - fx * pb, me.pos.z - fz * pb) + 4), me.pos.z - fz * pb);
    camAhead.set(me.pos.x + fx * 25, y + 4, me.pos.z + fz * 25);
  } else if (w) { // zu Fuss: Kamera hinter dem Kopf
    const wx = Math.cos(w.h), wz = Math.sin(w.h);
    const gy = w.gy || 0;
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
  if (!cockpit(me.mesh, cam, camMode === COCKPIT && !w)) {
    if (w && me.mesh.userData.driver) me.mesh.userData.driver.visible = false; // ausgestiegen: Sitz bleibt leer
    cam.position.lerp(camWant, 1 - Math.exp(-dt * 6));
    camLook.lerp(camAhead, 1 - Math.exp(-dt * 10));
    cam.lookAt(camLook);
  }
  cam.fov = 62 + Math.min(16, Math.abs(me.speed) * 0.15);
  cam.updateProjectionMatrix();
  S.sun.position.set(me.pos.x + 70, 110, me.pos.z - 40);
  S.sun.position.y = 110 + city.gy;
  S.sun.target.position.set(me.pos.x, city.gy, me.pos.z);
  S.clouds.position.set(cam.position.x, 0, cam.position.z);
  S.fx.update(dt, cam, S.renderer);
  S.renderer.render(S.scene, cam);
}

function endCity() {
  removePolice();
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
  if (city.hwSiren) city.hwSiren.stop();
  endMission(false);
  S.ui.jobpanel.hidden = true;
  S.ui.ticket.hidden = true;
  for (const B of S.places.bases) for (const b of B.bays) clearBay(B, b);
  const c = city;
  city = null;
  if (S.snd) { S.snd.stop(); S.snd = null; }
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  S.scene.remove(c.me.mesh);
  if (c.walk) S.scene.remove(c.walk.mesh);
  for (const cu of c.customers || []) S.scene.remove(cu.mesh);
  for (const p of c.peds || []) S.scene.remove(p.mesh);
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
  if (c.headMat) c.headMat.emissiveIntensity = 1.2; // Scheinwerfer wieder wie am Tag (gilt auch fürs Rennen)
  if (c.netCars) c.netCars.dispose();
  if (c.chat) c.chat.dispose();
  S.ui.root.hidden = true;
  c.onExit();
}

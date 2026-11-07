// Stadt zum freien Herumfahren (three.js): Strassen im Gitter, Häuser, Parks, Ampeln und viel Verkehr.
// Wird von game.js erst geladen, wenn man in die Stadt fährt.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic } from './cars3d.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';
import { createCarSound, crash, gearbox, horn, createSiren } from './sound.js';
import { makeNetCars } from './netcars.js';
import { makeChat } from './chat.js';
import { makeEffects, camView, CAM_NAMES, FLY_HTML, FLY_KEYS, flyCss, flyHelp, flyToggle, flyStep } from './fx.js';

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
const SPECIAL = { '2,5': 'gas', '5,2': 'wash', '5,5': 'pizza' }; // Blöcke mit Tankstelle, Waschanlage, Pizzeria
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
  const height = (x, z) => {
    const rr = Math.max(Math.abs(x), Math.abs(z));
    return smoothstep(HALF + 90, HALF + 500, rr) * NZ.fbm(x / 260, z / 260, 4) * 190 - 0.06;
  };
  const C = h => new THREE.Color(h), gA = C(0x5e9142), gB = C(0x4a7c35), rock = C(0x857b70);
  const land = terrain({ size: 2200, segments: 110, height, detail: grassDetail, detailRepeat: 260,
    color: (x, z, y, steep, c) => { c.lerpColors(gA, gB, NZ.fbm(x / 80, z / 80, 3)); c.lerp(rock, smoothstep(0.2, 0.4, steep)); } });
  land.material.normalScale.set(0.35, 0.35);
  scene.add(land);

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
  const box = (w, h, d, m, x, y, z, solidToo) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; decor.add(b);
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
  // Base: ummauerter Parkplatz mit Einfahrt und Torbogen, je fünf Parkfelder links und rechts der Fahrgasse.
  // Die Autos und das Schild kommen erst beim Spielen dazu (stepBases); bay.solid ist weit weg, solange das Feld leer ist
  function buildBase(cx, cz, s) {
    const col = new THREE.Color(BASE_COLORS[s]), wallM = mat({ color: 0x2b2f3a }), neon = mat({ color: col, emissive: col, emissiveIntensity: 1.3 });
    const floor = quads(1 / 8), marks = quads();
    floor.add(cx - 24, cz - 24, cx + 24, cz + 24, 0.17);
    for (const sx of [-1, 1]) for (let k = 0; k <= 5; k++) marks.rect(cx + sx * 15, cz - 20 + k * 8, 18, 0.2, 0.18);
    decor.add(floor.mesh(asphaltMat), marks.mesh(lineMat));
    for (const sx of [-1, 1]) {
      box(1, 2.6, 49, wallM, cx + sx * 24.5, 1.46, cz, true);
      box(1.05, 0.14, 49, neon, cx + sx * 24.5, 2.8, cz);
      box(17, 2.6, 1, wallM, cx + sx * 15.5, 1.46, cz - 24.5, true);
      box(17, 0.14, 1.05, neon, cx + sx * 15.5, 2.8, cz - 24.5);
      box(1.2, 6.8, 1.2, wallM, cx + sx * 7.6, 3.56, cz - 24.5, true);
    }
    box(48, 2.6, 1, wallM, cx, 1.46, cz + 24.5, true);
    box(48, 0.14, 1.05, neon, cx, 2.8, cz + 24.5);
    box(16.4, 2, 1, wallM, cx, 6.4, cz - 24.5);
    // Schild am Torbogen (von der Strasse und von innen lesbar), Text wechselt im Spiel
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 });
    for (const [z, ry] of [[-25.06, Math.PI], [-23.94, 0]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 1.95), sm);
      p.position.set(cx, 6.4, cz + z); p.rotation.y = ry; scene.add(p);
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
    scene.add(group);
    places.bases[s] = { x: cx, z: cz, w: 49, d: 49, bays, group, setSign, sign: '' };
  }
  const roofTiles = [mat({ color: 0x9b3b2b, roughness: 0.85 }), mat({ color: 0x5a4e4a, roughness: 0.85 }), mat({ color: 0xb4532a, roughness: 0.85 })];
  const homeWalls = [['#f3eadb', '#7a6a55'], ['#e8d9b8', '#5b4a35'], ['#dfe7ea', '#4a5560'], ['#f0d9d0', '#7a4a3a']]
    .map(([wall, frame]) => { const f = facade(wall, frame, r); return mat({ map: f, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 0, roughness: 0.8 }); });
  const block = 50, inner = 44;
  const trees = [];
  for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
    const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(block, 0.16, block), paveMat);
    slab.position.set(cx, 0.08, cz); slab.receiveShadow = true;
    decor.add(slab);
    const key = bi + ',' + bj;
    if (key === plaza) { buildPlaza(decor, cx, cz, round); continue; }
    if (baseOf(key) >= 0) { buildBase(cx, cz, baseOf(key)); continue; }
    if (SPECIAL[key]) { ({ gas: buildGas, wash: buildWash, pizza: buildPizza })[SPECIAL[key]](cx, cz); continue; }
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
    for (const ox of [-11, 11]) for (const oz of [-11, 11]) {
      const w = 14 + r() * 5, d = 14 + r() * 5, hgt = 7 + r() * (8 + 42 * Math.max(0, center) ** 1.4);
      const bx = cx + ox, bz = cz + oz;
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
    if (Math.max(Math.abs(tx), Math.abs(tz)) < HALF + ROAD / 2 + 12) continue;
    trees.push([tx, height(tx, tz), tz, 0.9 + r() * 0.9]);
    k++;
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

  scene.add(decor);
  mergeStatic(decor);
  const clouds = cloudDome({ radius: 2600, coverage: 0.52, shade: '#aebccd', seed: 9 });
  clouds.layers.set(1);
  scene.add(clouds);
  warmUp(renderer, scene, camera);
  return { renderer, scene, camera, sun, clouds, lamps, solid, round, parks, places,
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
function makeCar(kinds, i, j, d, s) {
  const kind = POOL[Math.floor(Math.random() * POOL.length)];
  const v = { kind, color: kinds[kind].color || COLORS[Math.floor(Math.random() * COLORS.length)], special: null };
  const mesh = buildCar(v, kinds);
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
  const options = [0, 1, 3].map(k => (c.d + k) % 4).filter(d => inGrid(bi + DIRS[d][0], bj + DIRS[d][1])); // geradeaus, rechts, links
  const weights = options.map(d => (d === c.d ? 3 : 1));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0), d2 = options[0];
  for (let k = 0; k < options.length; k++) { pick -= weights[k]; if (pick <= 0) { d2 = options[k]; break; } }
  if (!options.length) d2 = (c.d + 2) % 4;
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
  let lim = Infinity, byMe = false;
  const fx = Math.cos(c.h), fz = Math.sin(c.h);
  const check = (ox, oz, olen, isMe) => {
    const dx = ox - c.x, dz = oz - c.z, along = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
    if (along <= 0 || along > 18 || lat > 2.6) return;
    const gap = along - (c.len + olen) / 2 - 2;
    const v = Math.max(0, gap * 1.3);
    if (v < lim) { lim = v; byMe = isMe; }
  };
  for (const o of city.cars) if (o !== c) check(o.x, o.z, o.len, false);
  if (city.police) check(city.police.pos.x, city.police.pos.z, 5, false);
  if (me.alt < 2.5) check(me.pos.x, me.pos.z, me.len, true); // wer darüber fliegt, stört nicht
  return { lim, byMe };
}

function stepTraffic(dt) {
  const t = city.t, me = city.me;
  for (const c of city.cars) {
    let limit = c.turn ? c.cruise * (c.turn.straight ? 1 : 0.55) : c.cruise;
    let atLight = false;
    if (!c.turn) { // rote oder gelbe Ampel vorne?
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
    // Steckt ein Auto lange fest (z.B. zwei Abbieger in der Kreuzung), fährt es vorsichtig weiter
    c.stuck = !atLight && !f.byMe && f.lim < 0.5 ? (c.stuck || 0) + dt : 0;
    if (c.stuck > 6) { c.ghost = 2.5; c.stuck = 0; }
    if (c.ghost > 0) c.ghost -= dt;
    else limit = Math.min(limit, f.lim);
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
      if (T.t >= 1) { c.i = T.bi; c.j = T.bj; c.d = T.d2; c.s = 7; c.turn = null; placeOnSegment(c); }
    }
    const m = c.mesh, seen = Math.hypot(c.x - S.camera.position.x, c.z - S.camera.position.z) < SEE;
    m.visible = seen;
    if (seen) {
      m.position.set(c.x, 0, c.z);
      m.rotation.y = -c.h;
      for (const w of m.userData.wheels) w.rotation.z -= c.speed * dt / 0.35;
      animateCar(m, t, null);
    }
  }
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
  const gas = input.gas, brake = input.brake, hand = !!input.drift && !stopped && !me.fly; // Handbremse zum Driften
  const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  me.steer += (steerTarget - me.steer) * Math.min(1, dt * 7);
  me.surface = me.fly ? 'asphalt' : surfaceAt(me.pos.x, me.pos.z);
  const boost = city.turbo > 0 ? 1.3 : 1; // Turbo-Benzin von der Tankstelle
  const maxV = (me.fly ? me.maxV * FLY_SPEED : me.surface === 'grass' ? me.maxV * 0.55 : me.maxV) * boost;
  if (gas) {
    if (me.speed < 0) me.speed = Math.min(0, me.speed + BRAKE * dt);
    else me.speed += me.acc * boost * Math.max(0, 1 - me.speed / maxV) * dt;
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
  const yawMax = hand || sliding ? Math.min(1.9, 30 / Math.max(total, 0.1)) : Math.min(1.6 * city.gripBoost, GRIP * city.gripBoost / Math.max(Math.abs(me.speed), 0.1));
  const turn = Math.abs(me.speed) > 0.3 ? me.steer * yawMax * dt * Math.sign(me.speed) : 0;
  me.heading += turn;
  // Die Bewegung bleibt in der alten Richtung (Trägheit): vorwärts (speed) und seitwärts (vl) neu aufteilen
  const c = Math.cos(turn), s = Math.sin(turn), vf = me.speed * c + me.vl * s;
  me.vl = -me.speed * s + me.vl * c;
  me.speed = vf;
  // Reifen greifen: seitliches Rutschen wird abgebaut – normal schnell, im Drift mit Gas langsam, mit Handbremse kaum
  const grip = hand ? 0.8 : sliding ? (gas ? 1.3 : 2.4) : me.surface === 'grass' ? 4 : 9;
  me.vl *= Math.exp(-grip * dt);
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  me.pos.x += (fx * me.speed - fz * me.vl) * dt;
  me.pos.z += (fz * me.speed + fx * me.vl) * dt;
  me.drifting = Math.abs(me.vl) > 2.5 && Math.abs(me.speed) > 5;
  const latA = Math.abs(me.steer) * yawMax * Math.abs(me.speed);
  me.slip = 0.7 * Math.min(1, Math.max(0, (latA - 10.8 * city.gripBoost) / 1.2)) * Math.min(1, Math.max(0, (Math.abs(me.speed) - 16) / 8));
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
      hit = Math.max(hit, Math.abs(me.speed));
    }
  }
  for (const o of S.round) {
    const dx = me.pos.x - o.x, dz = me.pos.z - o.z, dd = Math.hypot(dx, dz), min = R * 0.7 + o.r;
    if (dd < min && me.alt > (o.h || 6) - 0.4) { floor = Math.max(floor, (o.h || 6) + 0.5); continue; }
    if (dd < min && dd > 0.001) { me.pos.x += dx / dd * (min - dd); me.pos.z += dz / dd * (min - dd); hit = Math.max(hit, Math.abs(me.speed)); }
  }
  // Mit Autos zusammenstossen: du wirst weggeschoben, das andere Auto bleibt kurz stehen
  for (const c of city.cars) {
    const dx = me.pos.x - c.x, dz = me.pos.z - c.z, dd = Math.hypot(dx, dz), min = (R + c.mesh.userData.radius) * 0.8;
    if (dd < min && dd > 0.001 && me.alt < 2.5) {
      me.pos.x += dx / dd * (min - dd); me.pos.z += dz / dd * (min - dd);
      const rel = Math.abs(me.speed - c.speed);
      if (rel > 2 && city.crashT <= 0) { crash(0.15 + rel / 18, 'car'); city.crashT = 0.5; c.blocked = 2; c.honkT = 0.4; c.waitMe = 2; }
      me.speed *= 0.6; me.vl *= 0.5;
    }
  }
  if (hit > 3) {
    if (city.crashT <= 0) { crash(hit / 25, 'car'); city.crashT = 0.5; }
    me.speed *= -0.15; // abprallen
    me.vl *= 0.2;
    if (city.drift > 0) bankDrift(true);
  }
  city.crashT -= dt;
  if (me.fly) {
    me.alt = flyStep(me, input, dt, me.alt, floor, FLY_MAX);
    if (me.landing && me.alt <= 0.03) { me.fly = me.landing = false; me.alt = 0; showMsg('🛬 Gelandet', 1.2); }
  }
  // Am Stadtrand ist Schluss
  if (Math.abs(me.pos.x) > LIMIT || Math.abs(me.pos.z) > LIMIT) {
    me.pos.x = Math.max(-LIMIT, Math.min(LIMIT, me.pos.x)); me.pos.z = Math.max(-LIMIT, Math.min(LIMIT, me.pos.z));
    me.speed *= 0.5;
    if (city.msgT <= 0) showMsg('🌲 Hier ist die Stadt zu Ende', 1.5);
  }
  // Über eine rote Ampel gefahren?
  const ni = Math.round(me.pos.x / BLOCK + N / 2), nj = Math.round(me.pos.z / BLOCK + N / 2);
  const inX = inGrid(ni, nj) && Math.abs(me.pos.x - node(ni)) < ROAD / 2 && Math.abs(me.pos.z - node(nj)) < ROAD / 2;
  if (inX && !city.inCross && hasLights(ni, nj) && Math.abs(me.speed) > 5 && me.alt < 2.5) {
    const ax = Math.abs(Math.cos(me.heading)) > Math.abs(Math.sin(me.heading)) ? 'x' : 'z';
    if (lightState(ax, city.t) === 'red' && !POLICE_KINDS.includes(me.v.kind)) { showMsg('🚦 Über Rot gefahren!', 1.6); startChase(); } // Polizei darf (im Einsatz)
  }
  city.inCross = inX;
  const m = me.mesh;
  m.position.set(me.pos.x, me.alt, me.pos.z);
  m.rotation.set(me.fly ? me.flyRoll : 0, -me.heading, me.fly ? me.flyPitch : 0);
  for (const w of m.userData.wheels) {
    w.rotation.z -= me.speed * dt / 0.35;
    if (w.position.x > 0) w.rotation.y = -me.steer * 0.4;
  }
  animateCar(m, city.t, me.v.special, me.fly);
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
  // Tankstelle: unter dem Dach anhalten = Turbo-Benzin (30 s schneller), kostet 3 Münzen (ohne Münzen gratis)
  if (inZone(P.gas, x, z) && Math.abs(me.speed) < 1.5 && me.alt < 2) {
    if (city.fuelT >= 0) {
      if (city.fuelT === 0) showMsg('⛽ Tanken …', 1.6);
      city.fuelT += dt;
      if (city.fuelT > 1.5) {
        const paid = city.pay(3);
        city.turbo = 30; city.fuelT = -1; // erst nach dem Wegfahren wieder
        showMsg('⛽ Turbo-Benzin! 30 Sekunden schneller' + (paid ? '  (−' + paid + ' 🪙)' : ''), 2.6);
        window.beep && window.beep(660, 0.1, 'triangle', 0.06); window.beep && window.beep(990, 0.18, 'triangle', 0.06, 0.1);
      }
    }
  } else if (!inZone(P.gas, x, z, 3)) city.fuelT = 0;
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
    if (inZone(B, x, z)) at = s;
    B.group.visible = Math.hypot(B.x - x, B.z - z) < 130;
    if (B.group.visible) for (const b of B.bays) if (b.anim && b.mesh && b.mesh.visible) animateCar(b.mesh, city.t, null);
  });
  if (at !== city.atBase) {
    city.atBase = at;
    if (at >= 0) showMsg(at === city.baseSlot ? '🏠 Deine Base' : baseOwner(at) ? '🏠 Base von ' + baseOwner(at) : '🏠 Diese Base ist frei', 1.6);
  }
  const mine = at === city.baseSlot && me.alt < 2;
  S.ui.basebtn.hidden = !mine;
  if (!mine) S.ui.basepanel.hidden = true;
  if ((city.baseT -= dt) > 0) return;
  city.baseT = 0.1;
  let built = false; // höchstens ein Auto pro Durchgang aufbauen, sonst ruckelt es
  S.places.bases.forEach((B, s) => {
    const owner = baseOwner(s), text = owner === 'Du' ? '🏠 MEINE BASE' : owner ? '🏠 BASE VON ' + owner.toUpperCase() : '🏠 FREI';
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
  city.gears = gearbox(v.kind);
  city.gripBoost = (city.kinds[v.kind] && city.kinds[v.kind].grip) || 1;
  city.canFly = !!(city.kinds[v.kind] && city.kinds[v.kind].fly);
  S.ui.flybtn.hidden = !city.canFly;
  S.ui.ps.textContent = '⚡ ' + v.ps + ' PS';
  if (S.snd) { S.snd.stop(); S.snd = createCarSound({ kind: v.kind }); }
  if (city.net) city.net.setCar(v);
  showMsg('🔑 ' + ((city.kinds[v.kind] || {}).name || v.kind), 1.6);
}

// ---------- Fangis (nur online) ----------
// Im Raum steht tag = { it: Platz, der dran ist (−1 = kein Spiel), by: wer zuletzt gefangen hat, t }.
// Wer dran ist, prüft selbst, ob er jemanden berührt, und gibt „dran“ weiter (zurückfangen erst nach 3 s).
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
  if (tag && me.fly) me.landing = true; // Fangis spielt man am Boden
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

// ---------- Aufträge: Taxi, Pizza, Dieb jagen ----------
const POLICE_KINDS = ['police', 'policebike', 'policebus'];
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
  else if (type === 'thief') {
    const p = roadPoint(90, 160, from);
    const mesh = buildCar({ kind: 'sports', color: '#18181b', special: null }, city.kinds);
    S.scene.add(mesh);
    city.mission = { type, step: 'chase', color: '#a855f7', target: p, text: '🚓 Fang den Dieb!', close: 0, far: 0,
      thief: { mesh, pos: new THREE.Vector3(p.x, 0, p.z), heading: 0, speed: 6, path: [], pathT: 0, maxV: Math.max(18, Math.min(34, me.maxV * 0.78)), radius: Math.max(1.3, mesh.userData.radius * 0.8) } };
    showMsg('🚨 Ein Dieb flüchtet! Bleib dicht hinter ihm.', 2.4);
  }
  const M = city.mission;
  if (type !== 'thief') showMsg(M.text + '!', 2);
  marker().set(M.target.x, M.target.z, M.color);
  S.ui.goal.hidden = false;
}
function endMission(ok, text, coins = 0) {
  const M = city.mission;
  if (!M) return;
  if (M.thief) S.scene.remove(M.thief.mesh);
  if (M.pizzaBox) city.me.mesh.remove(M.pizzaBox);
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
  if (M.type !== 'thief' && d < 7 && stopped && me.alt < 2) {
    if (M.step === 'pick') {
      M.step = 'drop';
      M.target = M.type === 'taxi' ? roadPoint(220, 420, M.target) : roadPoint(180, 380, M.target);
      M.timer = Math.round(Math.hypot(M.target.x - x, M.target.z - z) / 10 + 25);
      M.text = M.type === 'taxi' ? '🚕 Bring den Fahrgast ans Ziel' : '🍕 Liefere die Pizza aus';
      if (M.type === 'pizza') { // Pizzaschachtel aufs Dach
        const b = new THREE.Box3().setFromObject(me.mesh);
        M.pizzaBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0xf5deb3 }));
        M.pizzaBox.position.set(0, b.max.y - me.mesh.position.y + 0.06, 0);
        me.mesh.add(M.pizzaBox);
      }
      showMsg(M.type === 'taxi' ? '🧍 Eingestiegen! Bring ihn hin.' : '🍕 Pizza eingepackt! Schnell ausliefern.', 2.2);
      marker().set(M.target.x, M.target.z, M.color);
    } else {
      const coins = Math.min(12, (M.type === 'taxi' ? 5 : 6) + Math.floor(M.timer / 10));
      endMission(true, M.type === 'taxi' ? '🚕 Angekommen! Danke fürs Fahren.' : '🍕 Pizza geliefert! Mmmh.', coins);
      return;
    }
  }
  if (M.thief) { // Dieb: dicht dranbleiben = erwischt, zu weit weg = entkommen
    M.target = { x: M.thief.pos.x, z: M.thief.pos.z };
    marker().set(M.target.x, M.target.z, M.color);
    M.close = d < 10 ? M.close + dt : Math.max(0, M.close - dt * 0.5);
    M.far = d > 380 ? M.far + dt : 0;
    M.text = M.close > 0.2 ? '🚓 Dranbleiben! ' + '█'.repeat(Math.ceil(M.close / 0.5)) + '░'.repeat(Math.max(0, 5 - Math.ceil(M.close / 0.5))) : '🚓 Fang den Dieb!';
    if (M.close > 2.5) { endMission(true, '🚓 Erwischt! Der Dieb ist gefasst.', 12); return; }
    if (M.far > 8) { endMission(false, '💨 Der Dieb ist entkommen …'); return; }
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

// ---------- Polizei ----------
// Über Rot gefahren: hinter dir taucht ein Streifenwagen auf und folgt dir über die Strassen (Weg über die
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
      if (o.me && Math.abs(P.speed - me.speed) > 4 && city.crashT <= 0) { crash(0.3, 'car'); city.crashT = 0.5; }
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

// Strafzettel: 10 Münzen, bei jedem weiteren Mal 10 mehr (höchstens 50); ohne Münzen nur eine Verwarnung
function giveTicket() {
  city.fines++;
  const amount = Math.min(50, 10 * city.fines), paid = city.pay(amount);
  city.ticket = true;
  const T = S.ui.ticket;
  T.querySelector('.amount').textContent = paid ? paid + ' 🪙' : 'Verwarnung';
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
  showMsg('Gute Fahrt! Und bei Rot anhalten 😉', 2);
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
  if (Math.abs(x) > HALF + ROAD / 2 || Math.abs(z) > HALF + ROAD / 2) return 'grass';
  const bi = Math.floor(x / BLOCK + N / 2), bj = Math.floor(z / BLOCK + N / 2);
  const nx = node(Math.round(x / BLOCK + N / 2)), nz = node(Math.round(z / BLOCK + N / 2));
  if (Math.abs(x - nx) < ROAD / 2 || Math.abs(z - nz) < ROAD / 2) return 'asphalt';
  if (S.parks.has(bi + ',' + bj)) {
    const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2;
    if (Math.abs(x - cx) < 22 && Math.abs(z - cz) < 22 && Math.abs(x - cx) > 1.6 && Math.abs(z - cz) > 1.6) return 'grass';
  }
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
    <button class="jobs" title="Aufträge (J)">📋</button>
    <button class="tagbtn" title="Fangis (online)" hidden>🏃</button>
    <button class="basebtn" title="Base (B)" hidden>🏠</button>
    <div class="basepanel" hidden></div>
    <div class="tagbar" hidden></div>
    <div class="jobpanel" hidden><b>📋 Aufträge</b>
      <button data-job="taxi">🚕 Taxi: Fahrgast abholen und hinbringen</button>
      <button data-job="pizza">🍕 Pizza: bei der Pizzeria abholen und ausliefern</button>
      <button data-job="thief">🚓 Dieb jagen (nur mit Polizeiauto)</button>
      <button data-job="cancel" class="grey">Auftrag abbrechen</button>
      <button data-job="close" class="grey">Schliessen</button></div>
    <div class="goal" hidden><span class="arrow">➤</span> <span class="gtext"></span></div>
    <div class="msg"></div>
    <div class="chase" hidden>🚨 Polizei!</div>
    <div class="drift" hidden></div>
    <div class="ticket" hidden><div class="card">
      <h2>🚔 STRAFZETTEL</h2>
      <p>Grund: <b>Über Rot gefahren 🚦</b></p>
      <p>Busse: <b class="amount"></b></p>
      <p class="note"></p><p class="count"></p>
      <button class="pay">Okay 👍</button></div></div>
    <div class="speed"><span class="kmh">0</span> km/h<small class="ps"></small></div>
    <div class="hint">⬅️ ➡️ lenken · ⬆️ Gas · ⬇️ Bremse/rückwärts · Leertaste driften · H hupen</div>
    <button class="ctl" data-k="left" style="left:16px">◀</button>
    <button class="ctl" data-k="right" style="left:124px">▶</button>
    <button class="ctl brake" data-k="brake" style="right:124px">BREMSE</button>
    <button class="ctl gas" data-k="gas" style="right:16px">GAS</button>
    <button class="ctl hand" data-k="drift" style="right:70px; bottom:120px">DRIFT</button>
    ${FLY_HTML}`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), hint: $('.hint'), minimap: $('.minimap'), ctls: [...root.querySelectorAll('.ctl')],
    flybtn: $('.flybtn'), flyctl: $('.flyctl'), basebtn: $('.basebtn'), basepanel: $('.basepanel'),
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
  $('.flybtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleFly(); });
  $('.basebtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleBase(); });
  ui.basepanel.addEventListener('click', onBaseClick);
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
  if (!city || !city.canFly) return;
  const me = city.me;
  if (!me.fly && (city.pulled > 0 || city.ticket || (city.police && city.police.state === 'stop'))) return;
  if (!me.fly && tagState()) { showMsg('🏃 Fangis spielt man am Boden', 1.6); return; }
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
  for (const [k, icon] of [['gas', '⛽'], ['wash', '🫧'], ['pizza', '🍕']]) { const p = S.places[k]; if (p) g.fillText(icon, mx(p.x), mx(p.z)); }
  g.strokeStyle = 'rgba(220,225,235,0.85)'; g.lineWidth = Math.max(2, ROAD * mapScale);
  for (let i = 0; i <= N; i++) {
    g.beginPath(); g.moveTo(mx(node(i)), mx(-HALF)); g.lineTo(mx(node(i)), mx(HALF)); g.stroke();
    g.beginPath(); g.moveTo(mx(-HALF), mx(node(i))); g.lineTo(mx(HALF), mx(node(i))); g.stroke();
  }
  return c;
}
function drawMinimap() {
  const g = S.ui.minimap.getContext('2d');
  g.clearRect(0, 0, MAP, MAP);
  g.drawImage(S.mapBase, 0, 0);
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
function carStats(v, mesh, kinds, topSpeed) {
  return { maxV: Math.min(55, topSpeed(v.ps)), acc: 4 + v.ps * 0.06, radius: Math.max(1.3, mesh.userData.radius * 0.8), len: mesh.userData.length };
}

export function startCity({ player, kinds, topSpeed, onExit, pay = () => 0, earn = () => {}, net = null, garage = null }) {
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
  city = { me, cars: spawnTraffic(kinds), input: {}, t: Math.random() * CYCLE, msgT: 0, crashT: 0, hornT: 0, inCross: false, tod: 0.02, turbo: 0, fuelT: 0, washT: 0, mission: null,
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
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  S.snd = createCarSound({ kind: player.kind });
  S.camera.position.set(me.pos.x - 9, 3.4, me.pos.z);
  camLook.set(me.pos.x, 1.2, me.pos.z);
  window.__city = () => city; // für Tests im Browser
  window.__cityS = () => S;
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!city) return;
  const dt = Math.min(0.05, (now - city.last) / 1000);
  S.quality((now - city.last) / 1000);
  city.last = now;
  city.t += dt;
  if (city.msgT > 0 && (city.msgT -= dt) <= 0) S.ui.msg.textContent = '';
  city.hornT -= dt;
  stepLights();
  stepDayNight(dt);
  if (city.pulled > 0) city.pulled -= dt;
  stepMe(dt);
  stepDrift(dt);
  stepPolice(dt);
  stepPlaces(dt);
  stepBases(dt);
  stepMission(dt);
  stepTraffic(dt);
  if (city.netCars) { // Mitspieler: zeigen, eigene Position senden, nicht durcheinander durchfahren
    const me = city.me, o = { x: me.pos.x, y: me.alt, z: me.pos.z };
    if (city.netCars.bump(o, me.radius)) {
      me.pos.x = o.x; me.pos.z = o.z; me.speed *= 0.95;
      if (Math.abs(me.speed) > 5 && city.crashT <= 0) { crash(0.25, 'car'); city.crashT = 0.5; }
    }
    city.netCars.update(dt, city.t, { x: me.pos.x, y: me.alt, z: me.pos.z, h: me.heading, v: me.speed, a: me.fly ? me.flyPitch : 0, b: me.fly ? me.flyRoll : 0 });
    city.chat.update(dt);
    stepTag(dt);
  }
  updateHud(dt);
  render(dt);
  requestAnimationFrame(loop);
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
  const clock = (night > 0.5 ? '🌙 ' : '☀️ ') + String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  if (S.ui.clock.textContent !== clock) S.ui.clock.textContent = clock;
}

function updateHud(dt) {
  const me = city.me;
  S.ui.kmh.textContent = Math.round(Math.abs(me.speed) * 3.6);
  S.ui.flybtn.textContent = me.fly && !me.landing ? '🛬' : '✈️';
  S.ui.flyctl.hidden = !me.fly || me.landing;
  drawMinimap();
  if (!S.snd) return;
  let near = null, nd = Infinity;
  for (const c of city.cars) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < nd) { nd = d; near = c; } }
  const g = city.gears(me.speed, me.maxV);
  S.snd.update({ frac: g.frac, throttle: city.input.gas ? 1 : 0.15, speed: me.speed, slip: me.slip, surface: me.surface,
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
  const me = city.me, cam = S.camera;
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const back = 8.5 + Math.abs(me.speed) * 0.03;
  if (!camView(camMode, me.pos.x, me.alt, me.pos.z, me.heading, camWant, camAhead)) {
    camWant.set(me.pos.x - fx * back, me.alt + 3.3 + Math.abs(me.speed) * 0.01, me.pos.z - fz * back);
    camAhead.set(me.pos.x + fx * 6, me.alt + 1.2, me.pos.z + fz * 6);
  }
  cam.position.lerp(camWant, 1 - Math.exp(-dt * 6));
  camLook.lerp(camAhead, 1 - Math.exp(-dt * 10));
  cam.lookAt(camLook);
  cam.fov = 62 + Math.min(16, Math.abs(me.speed) * 0.15);
  cam.updateProjectionMatrix();
  S.sun.position.set(me.pos.x + 70, 110, me.pos.z - 40);
  S.sun.target.position.set(me.pos.x, 0, me.pos.z);
  S.clouds.position.set(cam.position.x, 0, cam.position.z);
  S.fx.update(dt, cam, S.renderer);
  S.renderer.render(S.scene, cam);
}

function endCity() {
  removePolice();
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
  for (const car of c.cars) S.scene.remove(car.mesh); // Formen gehören den Vorlagen in cars3d.js
  if (c.headMat) c.headMat.emissiveIntensity = 1.2; // Scheinwerfer wieder wie am Tag (gilt auch fürs Rennen)
  if (c.netCars) c.netCars.dispose();
  if (c.chat) c.chat.dispose();
  S.ui.root.hidden = true;
  c.onExit();
}

// Stadt zum freien Herumfahren (three.js): Strassen im Gitter, Häuser, Parks, Ampeln und viel Verkehr.
// Wird von game.js erst geladen, wenn man in die Stadt fährt.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic } from './cars3d.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';
import { createCarSound, crash, gearbox, horn, createSiren } from './sound.js';

const N = 8;                    // Blöcke pro Seite
const BLOCK = 64;               // Abstand der Kreuzungen (Meter)
const ROAD = 14;                // Strassenbreite: eine Spur je Richtung
const LANE = 3.5;               // Spurmitte rechts neben der Strassenmitte
const HALF = N * BLOCK / 2;     // halbe Stadtgrösse
const LIMIT = HALF + 70;        // so weit darf man fahren
const STOP = BLOCK - 12;        // Haltelinie (Abstand von der vorigen Kreuzung); die Wagenmitte hält eine halbe Länge davor
const CYCLE = 22;               // Ampelzyklus in Sekunden
const TRAFFIC = 46;             // so viele Autos fahren herum
const SEE = 140;                // weiter weg werden Autos nicht gezeichnet
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, −x, −z
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
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = x * 64 + 12, py = y * 64 + 14;
      g.fillStyle = frame; g.fillRect(px - 3, py - 3, 46, 42);
      const lit = r() < 0.15, grad = g.createLinearGradient(px, py, px + 40, py + 36);
      grad.addColorStop(0, lit ? '#fff1c4' : '#7fa3c2'); grad.addColorStop(1, lit ? '#f5c46b' : '#26384f');
      g.fillStyle = grad; g.fillRect(px, py, 40, 36);
      if (r() < 0.25) { g.fillStyle = 'rgba(240,235,225,0.85)'; g.fillRect(px, py, 40, 10 + r() * 20); } // Vorhang
      g.fillStyle = frame; g.fillRect(px + 19, py, 2, 36);
    }
  });
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
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 5000);
  camera.layers.enable(1);

  const sky = new Sky();
  sky.scale.setScalar(4000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.3; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(210));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x55604a, 0.75));
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
    .map(([wall, frame]) => mat({ map: facade(wall, frame, r), roughness: 0.75 }));
  const roofMat = mat({ color: 0x4b4f57, roughness: 0.9 }), metal = mat({ color: 0x9aa0aa, metalness: 0.6, roughness: 0.4 });
  const plaza = (N >> 1) + ',' + (N >> 1);
  const parks = new Set(); // sieben Parks, über die Stadt verteilt
  while (parks.size < 7) { const k = Math.floor(r() * N) + ',' + Math.floor(r() * N); if (k !== plaza) parks.add(k); }
  const roofTiles = [mat({ color: 0x9b3b2b, roughness: 0.85 }), mat({ color: 0x5a4e4a, roughness: 0.85 }), mat({ color: 0xb4532a, roughness: 0.85 })];
  const homeWalls = [['#f3eadb', '#7a6a55'], ['#e8d9b8', '#5b4a35'], ['#dfe7ea', '#4a5560'], ['#f0d9d0', '#7a4a3a']]
    .map(([wall, frame]) => mat({ map: facade(wall, frame, r), roughness: 0.8 }));
  const block = 50, inner = 44;
  const trees = [];
  for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
    const cx = (node(bi) + node(bi + 1)) / 2, cz = (node(bj) + node(bj + 1)) / 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(block, 0.16, block), paveMat);
    slab.position.set(cx, 0.08, cz); slab.receiveShadow = true;
    decor.add(slab);
    const key = bi + ',' + bj;
    if (key === plaza) { buildPlaza(decor, cx, cz, round); continue; }
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
        solid.push({ x0: bx - W / 2, x1: bx + W / 2, z0: bz - D / 2, z1: bz + D / 2 });
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
      solid.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
    }
  }

  // Bäume: in den Parks und als Waldgürtel rund um die Stadt
  for (let k = 0; k < 360; k++) {
    const a = r() * Math.PI * 2, rr = HALF + 30 + r() * 150;
    const tx = Math.cos(a) * rr * 1.1, tz = Math.sin(a) * rr * 1.1;
    trees.push([tx, height(tx, tz), tz, 0.9 + r() * 0.9]);
  }
  const trunkM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.35, 3, 6), mat({ color: 0x5b4030, roughness: 1 }), trees.length);
  const crownM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1), mat({ color: 0xffffff, roughness: 0.95, flatShading: true }), trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach(([x, y, z, s], k) => {
    trunkM.setMatrixAt(k, m4.compose(p3.set(x, y + 1.5 * s, z), q, sc.set(s, s, s)));
    crownM.setMatrixAt(k, m4.compose(p3.set(x, y + 4.6 * s, z), q, sc.set(s, s * 1.1, s)));
    crownM.setColorAt(k, col.setHSL(0.24 + r() * 0.08, 0.5, 0.09 + r() * 0.06));
    round.push({ x, z, r: 0.7 * s });
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
  return { renderer, scene, camera, sun, clouds, lamps, solid, round, parks };
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
  check(me.pos.x, me.pos.z, me.len, true);
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
function stepMe(dt) {
  const stopped = city.pulled > 0 || city.ticket || (city.police && city.police.state === 'stop');
  const me = city.me, input = stopped ? { brake: true } : city.input; // von der Polizei angehalten: nur bremsen
  const gas = input.gas, brake = input.brake, hand = !!input.drift && !stopped; // Handbremse zum Driften
  const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  me.steer += (steerTarget - me.steer) * Math.min(1, dt * 7);
  me.surface = surfaceAt(me.pos.x, me.pos.z);
  const maxV = me.surface === 'grass' ? me.maxV * 0.55 : me.maxV;
  if (gas) {
    if (me.speed < 0) me.speed = Math.min(0, me.speed + BRAKE * dt);
    else me.speed += me.acc * Math.max(0, 1 - me.speed / maxV) * dt;
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
  const yawMax = hand || sliding ? Math.min(1.9, 30 / Math.max(total, 0.1)) : Math.min(1.6, GRIP / Math.max(Math.abs(me.speed), 0.1));
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
  me.slip = 0.7 * Math.min(1, Math.max(0, (latA - 10.8) / 1.2)) * Math.min(1, Math.max(0, (Math.abs(me.speed) - 16) / 8));
  if (brake && me.speed > 6) me.slip = Math.max(me.slip, 0.45 + 0.55 * Math.min(1, me.speed / 40));
  if (me.drifting) me.slip = Math.max(me.slip, Math.min(1, Math.abs(me.vl) / 7));

  // Häuser, Bäume und der Brunnen sind fest
  const R = me.radius;
  let hit = 0;
  for (const b of S.solid) {
    const qx = Math.max(b.x0, Math.min(me.pos.x, b.x1)), qz = Math.max(b.z0, Math.min(me.pos.z, b.z1));
    const dx = me.pos.x - qx, dz = me.pos.z - qz, dd = Math.hypot(dx, dz);
    if (dd < R) {
      if (dd > 0.001) { me.pos.x += dx / dd * (R - dd); me.pos.z += dz / dd * (R - dd); }
      else { me.pos.x -= Math.cos(me.heading) * R; me.pos.z -= Math.sin(me.heading) * R; }
      hit = Math.max(hit, Math.abs(me.speed));
    }
  }
  for (const o of S.round) {
    const dx = me.pos.x - o.x, dz = me.pos.z - o.z, dd = Math.hypot(dx, dz), min = R * 0.7 + o.r;
    if (dd < min && dd > 0.001) { me.pos.x += dx / dd * (min - dd); me.pos.z += dz / dd * (min - dd); hit = Math.max(hit, Math.abs(me.speed)); }
  }
  // Mit Autos zusammenstossen: du wirst weggeschoben, das andere Auto bleibt kurz stehen
  for (const c of city.cars) {
    const dx = me.pos.x - c.x, dz = me.pos.z - c.z, dd = Math.hypot(dx, dz), min = (R + c.mesh.userData.radius) * 0.8;
    if (dd < min && dd > 0.001) {
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
  // Am Stadtrand ist Schluss
  if (Math.abs(me.pos.x) > LIMIT || Math.abs(me.pos.z) > LIMIT) {
    me.pos.x = Math.max(-LIMIT, Math.min(LIMIT, me.pos.x)); me.pos.z = Math.max(-LIMIT, Math.min(LIMIT, me.pos.z));
    me.speed *= 0.5;
    if (city.msgT <= 0) showMsg('🌲 Hier ist die Stadt zu Ende', 1.5);
  }
  // Über eine rote Ampel gefahren?
  const ni = Math.round(me.pos.x / BLOCK + N / 2), nj = Math.round(me.pos.z / BLOCK + N / 2);
  const inX = inGrid(ni, nj) && Math.abs(me.pos.x - node(ni)) < ROAD / 2 && Math.abs(me.pos.z - node(nj)) < ROAD / 2;
  if (inX && !city.inCross && hasLights(ni, nj) && Math.abs(me.speed) > 5) {
    const ax = Math.abs(Math.cos(me.heading)) > Math.abs(Math.sin(me.heading)) ? 'x' : 'z';
    if (lightState(ax, city.t) === 'red') { showMsg('🚦 Über Rot gefahren!', 1.6); startChase(); }
  }
  city.inCross = inX;
  const m = me.mesh;
  m.position.set(me.pos.x, 0, me.pos.z);
  m.rotation.y = -me.heading;
  for (const w of m.userData.wheels) {
    w.rotation.z -= me.speed * dt / 0.35;
    if (w.position.x > 0) w.rotation.y = -me.steer * 0.4;
  }
  animateCar(m, city.t, me.v.special);
}

// ---------- Reifenrauch und Bremsspuren ----------
function makeEffects(scene) {
  // Rauch: Punkte mit eigener Grösse und Durchsichtigkeit (kleiner eigener Shader)
  const MAXP = 180, pos = new Float32Array(MAXP * 3), alpha = new Float32Array(MAXP), size = new Float32Array(MAXP);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const dg = dot.getContext('2d'), rg = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = rg; dg.fillRect(0, 0, 64, 64);
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: new THREE.CanvasTexture(dot) }, scale: { value: 600 } },
    vertexShader: `attribute float alpha; attribute float psize; uniform float scale; varying float vA;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA;
      void main() { float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.86, 0.86, 0.88, a); }`,
  });
  const smoke = new THREE.Points(geo, smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);
  const parts = Array.from({ length: MAXP }, () => ({ life: 1, max: 1, x: 0, y: -50, z: 0, vx: 0, vz: 0 }));
  let next = 0;
  // Bremsspuren: Ringspeicher aus dunklen Streifen auf dem Boden (älteste werden überschrieben)
  const MAXS = 1200, sp = new Float32Array(MAXS * 12), sIdx = [];
  for (let k = 0; k < MAXS; k++) { const b = k * 4; sIdx.push(b, b + 2, b + 1, b, b + 3, b + 2); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sGeo.setIndex(sIdx);
  const marks = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  marks.frustumCulled = false;
  scene.add(marks);
  let sNext = 0;
  const last = [null, null];
  return {
    puff(x, y, z, vx, vz) {
      const p = parts[next]; next = (next + 1) % MAXP;
      Object.assign(p, { life: 0, max: 1 + Math.random() * 0.8, x, y, z, vx: vx * 0.3 + (Math.random() - 0.5), vz: vz * 0.3 + (Math.random() - 0.5) });
    },
    // k: 0 = linkes, 1 = rechtes Hinterrad; on = Reifen rutschen gerade
    mark(k, x, y, z, on) {
      const L = last[k];
      if (!on) { last[k] = null; return; }
      if (L && Math.hypot(x - L[0], z - L[2]) < 0.35) return;
      if (L && Math.hypot(x - L[0], z - L[2]) < 3) {
        const dx = x - L[0], dz = z - L[2], d = Math.hypot(dx, dz), nx = -dz / d * 0.16, nz = dx / d * 0.16, o = sNext * 12;
        sp.set([L[0] - nx, L[1], L[2] - nz, L[0] + nx, L[1], L[2] + nz, x + nx, y, z + nz, x - nx, y, z - nz], o);
        sNext = (sNext + 1) % MAXS;
        sGeo.attributes.position.needsUpdate = true;
      }
      last[k] = [x, y, z];
    },
    update(dt, camera, renderer) {
      for (let i = 0; i < MAXP; i++) {
        const p = parts[i];
        p.life += dt;
        const t = Math.min(1, p.life / p.max);
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += 0.7 * dt;
        p.vx *= 0.97; p.vz *= 0.97;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        alpha[i] = t >= 1 ? 0 : 0.55 * (1 - t);
        size[i] = 1.2 + t * 3.5;
      }
      geo.attributes.position.needsUpdate = geo.attributes.alpha.needsUpdate = geo.attributes.psize.needsUpdate = true;
      smokeMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    },
    clear() { sp.fill(0); sGeo.attributes.position.needsUpdate = true; for (const p of parts) p.life = p.max; last[0] = last[1] = null; },
  };
}

// Rauch, Spuren und Drift-Punkte nach jedem Schritt
function stepDrift(dt) {
  const me = city.me, fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const skid = me.drifting || (city.input.brake && me.speed > 10) || (city.input.drift && Math.abs(me.speed) > 6);
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
  const dx = me.pos.x - P.pos.x, dz = me.pos.z - P.pos.z, dist = Math.hypot(dx, dz);
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
    <button class="quit" title="Stadt verlassen">✕</button>
    <button class="horn" title="Hupen (H)">📯</button>
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
    <button class="ctl hand" data-k="drift" style="right:70px; bottom:120px">DRIFT</button>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), hint: $('.hint'), minimap: $('.minimap'), ctls: [...root.querySelectorAll('.ctl')],
    chase: $('.chase'), ticket: $('.ticket'), drift: $('.drift') };
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
  $('.horn').addEventListener('pointerdown', e => { e.preventDefault(); honk(); });
  root.addEventListener('contextmenu', e => e.preventDefault());
  return ui;
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
  Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift' };
function onKey(e) {
  if (!city) return;
  if (e.code === 'KeyH' && e.type === 'keydown') { honk(); e.preventDefault(); return; }
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
  if (city.police) {
    g.fillStyle = Math.floor(city.t * 6) % 2 ? '#3b82f6' : '#ef4444';
    g.beginPath(); g.arc(mx(city.police.pos.x), mx(city.police.pos.z), 4.5, 0, Math.PI * 2); g.fill();
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
export function startCity({ player, kinds, topSpeed, onExit, pay = () => 0, earn = () => {} }) {
  if (!S) {
    S = buildWorld();
    S.ui = buildDom();
    S.ui.root.prepend(S.renderer.domElement);
    S.mapBase = drawMinimapBase();
    S.fx = makeEffects(S.scene);
    window.addEventListener('resize', () => S && !S.ui.root.hidden && layout());
  }
  const mesh = buildCar(player, kinds);
  // Start: auf der rechten Spur einer Strasse am Stadtrand, Richtung Zentrum
  const me = { v: player, mesh, pos: new THREE.Vector3(node(1) + 20, 0, node(0) + LANE), heading: 0, speed: 0, vl: 0, steer: 0,
    maxV: Math.min(55, topSpeed(player.ps)), acc: 4 + player.ps * 0.06, radius: Math.max(1.3, mesh.userData.radius * 0.8),
    len: mesh.userData.length, slip: 0, surface: 'asphalt' };
  city = { me, cars: spawnTraffic(kinds), input: {}, t: Math.random() * CYCLE, msgT: 0, crashT: 0, hornT: 0, inCross: false,
    gears: gearbox(player.kind), onExit, last: performance.now(), kinds, pay, fines: 0, police: null, pulled: 0, ticket: false,
    earn, drift: 0, driftT: 0, driftBest: (() => { try { return +localStorage.getItem('autoRetterDriftBest') || 0; } catch (e) { return 0; } })() };
  S.fx.clear();
  S.scene.add(mesh);
  for (const c of city.cars) S.scene.add(c.mesh);
  warmUp(S.renderer, S.scene, S.camera);
  if (!S.quality) S.quality = makeQuality(S.renderer, layout);
  S.ui.root.hidden = false;
  S.ui.ps.textContent = '⚡ ' + player.ps + ' PS';
  layout();
  showMsg('🏙️ Fahr, wohin du willst!', 2.5);
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
  if (city.pulled > 0) city.pulled -= dt;
  stepMe(dt);
  stepDrift(dt);
  stepPolice(dt);
  stepTraffic(dt);
  updateHud(dt);
  render(dt);
  requestAnimationFrame(loop);
}

function updateHud(dt) {
  const me = city.me;
  S.ui.kmh.textContent = Math.round(Math.abs(me.speed) * 3.6);
  drawMinimap();
  if (!S.snd) return;
  let near = null, nd = Infinity;
  for (const c of city.cars) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < nd) { nd = d; near = c; } }
  const g = city.gears(me.speed, me.maxV);
  S.snd.update({ frac: g.frac, throttle: city.input.gas ? 1 : 0.15, speed: me.speed, slip: me.slip, surface: me.surface,
    other: near ? { dist: nd, frac: 0.2 + near.speed / 30, kind: near.v.kind } : null, dt });
}

const camWant = new THREE.Vector3(), camLook = new THREE.Vector3(), camAhead = new THREE.Vector3();
function render(dt) {
  const me = city.me, cam = S.camera;
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const back = 8.5 + Math.abs(me.speed) * 0.03;
  cam.position.lerp(camWant.set(me.pos.x - fx * back, 3.3 + Math.abs(me.speed) * 0.01, me.pos.z - fz * back), 1 - Math.exp(-dt * 6));
  camLook.lerp(camAhead.set(me.pos.x + fx * 6, 1.2, me.pos.z + fz * 6), 1 - Math.exp(-dt * 10));
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
  S.ui.ticket.hidden = true;
  const c = city;
  city = null;
  if (S.snd) { S.snd.stop(); S.snd = null; }
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  S.scene.remove(c.me.mesh);
  for (const car of c.cars) S.scene.remove(car.mesh); // Formen gehören den Vorlagen in cars3d.js
  S.ui.root.hidden = true;
  c.onExit();
}

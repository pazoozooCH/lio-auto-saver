// Stuntpark (three.js): grosser Platz mit Schanzen, Weitsprung, Mega-Rampe, Looping, Halfpipe-Wänden und Feuerringen.
// Eigene Physik mit Höhe: auf Rampen fahren, abheben, in der Luft drehen (Salto, Schraube), landen oder Bruchlandung.
// Wird von game.js erst geladen, wenn man in den Stuntpark fährt; online zeigt netcars.js die Mitspieler.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar, warmUp, makeQuality } from './cars3d.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';
import { createCarSound, crash, gearbox } from './sound.js';
import { makeNetCars } from './netcars.js';
import { makeChat } from './chat.js';

const G = 9.81;
const EDGE = 188;               // so weit geht der Platz (±)
const GRIP = 11;
const BRAKE = 14;
const LITE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
const BEST_KEY = 'autoRetterStuntBest';
const deg = d => d * Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- Hindernisse ----------
// Jedes Teil steht auf dem Boden, beginnt bei (x, z) und steigt in Richtung ang (0 = +x) über die Länge len an.
// ramp: gerade von h0 auf h1 · box: flach auf h0 · curve: Kreisbogen mit Radius R bis zum Winkel max (Schanze, Halfpipe-Wand)
function curveLen(R, max) { return R * Math.sin(max); }
const SHAPES = [];
const add = s => { if (s.kind === 'curve') { s.len = curveLen(s.R, s.max); s.h1 = (s.h0 || 0) + s.R * (1 - Math.cos(s.max)); } SHAPES.push({ h0: 0, ang: 0, color: 0xf97316, ...s }); };
// Schanzen-Reihe mit Tabletop
add({ kind: 'curve', x: -120, z: -50, w: 8, R: 10, max: deg(28) });
add({ kind: 'curve', x: -75, z: -50, w: 8, R: 12, max: deg(32) });
add({ kind: 'curve', x: -25, z: -50, w: 8, R: 14, max: deg(36) });
add({ kind: 'ramp', x: 25, z: -50, w: 10, len: 10, h0: 0, h1: 3, color: 0x2563eb });
add({ kind: 'box', x: 35, z: -50, w: 10, len: 14, h0: 3, color: 0x1d4ed8 });
add({ kind: 'ramp', x: 49, z: -50, w: 10, len: 12, h0: 3, h1: 0, color: 0x2563eb });
// Weitsprung mit Landehügel und Feuerring
add({ kind: 'curve', x: -60, z: 10, w: 10, R: 22, max: deg(34), color: 0xdc2626 });
add({ kind: 'ramp', x: -40, z: 10, w: 14, len: 20, h0: 0, h1: 5, color: 0x15803d }); // Landehügel: flach hinauf …
add({ kind: 'ramp', x: -20, z: 10, w: 14, len: 60, h0: 5, h1: 0, color: 0x16a34a });   // … und lang hinunter
// Mega-Rampe: hoch auf den Turm, steil hinunter, riesige Schanze, langer Landehügel
add({ kind: 'ramp', x: -150, z: -130, w: 12, len: 70, h0: 0, h1: 15, color: 0x7c3aed });
add({ kind: 'box', x: -80, z: -130, w: 12, len: 20, h0: 15, color: 0x6d28d9 });
add({ kind: 'ramp', x: -60, z: -130, w: 12, len: 10, h0: 15, h1: 13.6, color: 0x7c3aed });
add({ kind: 'ramp', x: -50, z: -130, w: 12, len: 10, h0: 13.6, h1: 10.9, color: 0x7c3aed });
add({ kind: 'ramp', x: -40, z: -130, w: 12, len: 25, h0: 10.9, h1: 0, color: 0x7c3aed });
add({ kind: 'curve', x: 5, z: -130, w: 12, R: 26, max: deg(38), color: 0xdc2626 });
add({ kind: 'ramp', x: 28, z: -130, w: 18, len: 32, h0: 0, h1: 7, color: 0x15803d });
add({ kind: 'ramp', x: 60, z: -130, w: 18, len: 70, h0: 7, h1: 0, color: 0x16a34a });
// Wellenbahn
for (let k = 0; k < 6; k++) {
  add({ kind: 'ramp', x: -100 + k * 12, z: 130, w: 9, len: 4, h0: 0, h1: 1.1, color: 0xfacc15 });
  add({ kind: 'ramp', x: -96 + k * 12, z: 130, w: 9, len: 4, h0: 1.1, h1: 0, color: 0xfacc15 });
}
// Halfpipe-Wände an zwei Seiten (mit Plattform oben)
add({ kind: 'curve', x: 158, z: 0, w: 360, R: 10, max: deg(75), color: 0xc8924f });
add({ kind: 'box', x: 158 + curveLen(10, deg(75)), z: 0, w: 360, len: 12, h0: 10 * (1 - Math.cos(deg(75))), color: 0x64748b });
add({ kind: 'curve', x: 0, z: 158, ang: Math.PI / 2, w: 300, R: 10, max: deg(75), color: 0xc8924f });
add({ kind: 'box', x: 0, z: 158 + curveLen(10, deg(75)), ang: Math.PI / 2, w: 300, len: 12, h0: 10 * (1 - Math.cos(deg(75))), color: 0x64748b });
for (const s of SHAPES) { s.c = Math.cos(s.ang); s.s = Math.sin(s.ang); }

// Looping: Einfahrt bei (x, z) in Richtung ang, Ausfahrt um shift seitlich versetzt (Schraube, damit sich die Bahn nicht kreuzt)
const LOOP = { x: 0, z: 70, ang: 0, R: 9, w: 8, shift: 10 };
LOOP.c = Math.cos(LOOP.ang); LOOP.s = Math.sin(LOOP.ang);
// Feuerringe: Mitte und Radius; man fliegt in x-Richtung hindurch
const RINGS = [{ x: -30, y: 10, z: 10, r: 4.5 }, { x: 40, y: 17, z: -130, r: 6 }, { x: 42, y: 7, z: -50, r: 4 }];

function shapeHeight(s, x, z) {
  const dx = x - s.x, dz = z - s.z, u = dx * s.c + dz * s.s, v = -dx * s.s + dz * s.c;
  if (u < 0 || u > s.len || Math.abs(v) > s.w / 2) return -Infinity;
  if (s.kind === 'box') return s.h0;
  if (s.kind === 'ramp') return s.h0 + (s.h1 - s.h0) * u / s.len;
  return s.h0 + s.R - Math.sqrt(Math.max(0, s.R * s.R - u * u));
}
function groundAt(x, z) {
  let h = 0;
  for (const s of SHAPES) { const y = shapeHeight(s, x, z); if (y > h) h = y; }
  return h;
}
function shapeAt(x, z) { // oberstes Teil an dieser Stelle (oder null)
  let h = 0.01, top = null;
  for (const s of SHAPES) { const y = shapeHeight(s, x, z); if (y > h) { h = y; top = s; } }
  return top;
}
// Steigung in Fahrtrichtung (pitch, bergauf positiv) und Seitenneigung (roll) – direkt aus der Form des obersten Teils,
// so stimmt sie auch genau an Kanten (dort würden Messpunkte vor und hinter dem Auto auf verschiedenen Teilen liegen)
function slopeAt(x, z, heading) {
  const s = shapeAt(x, z);
  if (!s || s.kind === 'box') return { pitch: 0, roll: 0 };
  const dx = x - s.x, dz = z - s.z, u = dx * s.c + dz * s.s;
  const gu = s.kind === 'ramp' ? (s.h1 - s.h0) / s.len : u / Math.sqrt(Math.max(0.01, s.R * s.R - u * u));
  const gx = gu * s.c, gz = gu * s.s, fx = Math.cos(heading), fz = Math.sin(heading);
  return { pitch: Math.atan(gx * fx + gz * fz), roll: -Math.atan(gx * -fz + gz * fx) };
}

let S = null;   // Szene, Renderer, Oberfläche (einmal gebaut)
let P = null;   // laufende Fahrt

// ---------- Welt ----------
function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'c3d';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfdcea, 220, 1400);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 5000);
  camera.layers.enable(1);
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const su = sky.material.uniforms;
  su.turbidity.value = 3; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.setFromSphericalCoords(1, deg(45), deg(150));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x5a5f50, 0.8));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 450 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const r = rng(77), NZ = makeNoise(12);
  const mat = o => new THREE.MeshStandardMaterial({ roughness: 0.75, ...o });
  // Betonplatz mit Fugen
  const concrete = surface(256, (u, v) => {
    const joint = (u * 4) % 1 < 0.012 || (v * 4) % 1 < 0.012, n = NZ.fbm(u * 10, v * 10, 4, 10), gr = r();
    const k = joint ? 105 : 150 + n * 26 + gr * 10;
    return [k, k, k + 3, joint ? 0 : 0.4 + n * 0.4];
  }, 2);
  concrete.map.repeat.set(24, 24); concrete.normalMap.repeat.set(24, 24);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * EDGE + 20, 2 * EDGE + 20),
    mat({ map: concrete.map, normalMap: concrete.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Hügel rundherum
  const grass = surface(256, (u, v) => { const n = NZ.fbm(u * 16, v * 16, 4, 16), b = r(); const k = 200 + n * 40 + b * 15; return [k, k + 3, k - 8, n * 0.6 + b * 0.5]; }, 3);
  const height = (x, z) => smoothstep(EDGE + 20, EDGE + 400, Math.max(Math.abs(x), Math.abs(z))) * NZ.fbm(x / 240, z / 240, 4) * 220 - 0.3;
  const C = h => new THREE.Color(h), gA = C(0x5e9142), gB = C(0x4a7c35), rock = C(0x857b70);
  const land = terrain({ size: 2400, segments: LITE ? 90 : 120, height, detail: grass, detailRepeat: 260,
    color: (x, z, y, steep, c) => { c.lerpColors(gA, gB, NZ.fbm(x / 80, z / 80, 3)); c.lerp(rock, smoothstep(0.2, 0.4, steep)); } });
  scene.add(land);
  const clouds = cloudDome({ radius: 2600, coverage: 0.45, shade: '#aebccd', seed: 21 });
  clouds.layers.set(1);
  scene.add(clouds);

  // Rampen, Kästen und Bögen: Seitenprofil (u, Höhe) in die Breite gezogen
  const sideMat = mat({ color: 0x8b6b4a, roughness: 0.9 });
  const mats = new Map();
  const topMat = col => { if (!mats.has(col)) mats.set(col, mat({ color: col, roughness: 0.55 })); return mats.get(col); };
  for (const s of SHAPES) {
    const pts = [];
    if (s.kind === 'curve') for (let k = 0; k <= 16; k++) { const u = s.len * k / 16; pts.push([u, shapeHeight(s, s.x + s.c * u, s.z + s.s * u)]); }
    else pts.push([0, s.h0], [s.len, s.kind === 'box' ? s.h0 : s.h1]);
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), ...pts.map(([u, y]) => new THREE.Vector2(u, Math.max(0.02, y))), new THREE.Vector2(s.len, 0)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: s.w, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -s.w / 2);
    const m = new THREE.Mesh(geo, [sideMat, topMat(s.color)]);
    m.position.set(s.x, 0, s.z);
    m.rotation.y = -s.ang;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (s.kind === 'curve' && s.w <= 20) { // weisse Kante an der Schanze
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, s.w + 0.02), mat({ color: 0xffffff }));
      lip.position.set(s.x + s.c * (s.len - 0.12), s.h1 + 0.02, s.z + s.s * (s.len - 0.12));
      lip.rotation.y = -s.ang;
      scene.add(lip);
    }
  }

  // Looping: Fahrbahn auf der Innenseite eines senkrechten Kreises, seitlich versetzt
  const L = LOOP, steps = 140, pos = [], idx = [], uvs = [];
  for (let k = 0; k <= steps; k++) {
    const th = (k / steps) * Math.PI * 2;
    for (const side of [-1, 1]) {
      for (const rr of [L.R + 0.02, L.R + 0.5]) {
        const v = L.shift * th / (Math.PI * 2) + side * L.w / 2, u = rr * Math.sin(th), y = L.R - rr * Math.cos(th);
        pos.push(L.x + L.c * u - L.s * v, y, L.z + L.s * u + L.c * v);
        uvs.push(side > 0 ? 1 : 0, k / 8);
      }
    }
  }
  for (let k = 0; k < steps; k++) {
    const a = k * 4, b = (k + 1) * 4; // je Schritt: links innen, links aussen, rechts innen, rechts aussen
    idx.push(a, b, a + 2, a + 2, b, b + 2); // Fahrbahn innen
    idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1); // aussen
    idx.push(a, a + 1, b, a + 1, b + 1, b); idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3); // Seiten
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  lg.setIndex(idx);
  lg.computeVertexNormals();
  const loopTex = surface(64, (u, v) => { const st = Math.floor(v * 4) % 2; return st ? [230, 40, 40, 0] : [245, 245, 245, 0]; });
  loopTex.map.wrapT = THREE.RepeatWrapping;
  const loop = new THREE.Mesh(lg, mat({ map: loopTex.map, side: THREE.DoubleSide, roughness: 0.5 }));
  loop.castShadow = loop.receiveShadow = true;
  scene.add(loop);
  for (const v of [L.shift + L.w / 2 + 1.2]) { // Stütze auf der Ausfahrtseite (die Kamera schaut von der anderen Seite)
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2 * L.R + 1, 0.8), mat({ color: 0x475569, metalness: 0.5 }));
    p.position.set(L.x - L.s * v, L.R + 0.5, L.z + L.c * v);
    p.castShadow = true;
    scene.add(p);
  }

  // Feuerringe
  const fire = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff4500, emissiveIntensity: 1.6, roughness: 0.4 });
  const rings = RINGS.map(R => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R.r, 0.35, 10, 40), fire.clone());
    m.position.set(R.x, R.y, R.z);
    m.rotation.y = Math.PI / 2; // Ring steht quer zur x-Richtung
    scene.add(m);
    for (const s of [-1, 1]) { // Masten
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, R.y, 8), mat({ color: 0x334155, metalness: 0.6 }));
      pole.position.set(R.x, R.y / 2, R.z + s * (R.r + 0.3));
      scene.add(pole);
    }
    return m;
  });

  // Rand: rot-weisse Betonmauer und Tribüne
  const wallTex = surface(64, u => (Math.floor(u * 2) % 2 ? [220, 38, 38, 0] : [245, 245, 245, 0]));
  wallTex.map.wrapS = THREE.RepeatWrapping;
  for (const [x, z, w, d] of [[0, -EDGE - 1, 2 * EDGE + 4, 1], [0, EDGE + 1, 2 * EDGE + 4, 1], [-EDGE - 1, 0, 1, 2 * EDGE + 4], [EDGE + 1, 0, 1, 2 * EDGE + 4]]) {
    const t = wallTex.map.clone(); t.needsUpdate = true; t.repeat.set(Math.max(w, d) / 4, 1);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), mat({ map: t }));
    wall.position.set(x, 0.6, z);
    wall.receiveShadow = true;
    scene.add(wall);
  }
  const stand = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 3), mat({ color: k % 2 ? 0x94a3b8 : 0xcbd5e1 }));
    step.position.set(-60, 0.5 + k, -EDGE - 4 - k * 3);
    step.receiveShadow = true;
    stand.add(step);
  }
  for (let k = 0; k < 140; k++) { // Zuschauer
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.5), mat({ color: new THREE.Color().setHSL(r(), 0.6, 0.5) }));
    const row = Math.floor(r() * 6);
    p.position.set(-98 + r() * 76, 1.55 + row, -EDGE - 4 - row * 3);
    stand.add(p);
  }
  scene.add(stand);
  // Startbogen
  const banner = new THREE.Group();
  const bannerTex = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = '#111827'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#facc15'; g.font = 'bold 60px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🤸 STUNTPARK', 256, 50); return c;
  })());
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const dark = mat({ color: 0x111827 }), print = mat({ map: bannerTex });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 14), [print, print, dark, dark, dark, dark]);
  board.position.set(0, 6.5, 0);
  banner.add(board);
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.6, 0.5), mat({ color: 0x334155 })); post.position.set(0, 3.8, s * 7.2); banner.add(post); }
  banner.position.set(-150, 0, 0);
  banner.rotation.y = Math.PI; // Schrift zeigt zur Startrichtung
  scene.add(banner);

  return { renderer, scene, camera, sun, clouds, rings };
}

// ---------- Fahren ----------
function resetCar(me, x = -170, z = 0, heading = 0) {
  Object.assign(me, { x, z, y: groundAt(x, z), heading, speed: 0, air: false, loop: null, vx: 0, vy: 0, vz: 0, vyG: 0,
    pitch: 0, roll: 0, airT: 0, flip: 0, spin: 0, camH: heading, frozen: 0, ringsNow: [], wallAir: null });
}

function stepMe(dt) {
  const me = P.me, input = me.frozen > 0 ? {} : P.input;
  if (me.frozen > 0) me.frozen -= dt;
  if (me.loop) { stepLoop(me, input, dt); return; }
  if (me.air) { stepAir(me, input, dt); return; }

  // --- auf dem Boden ---
  const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  me.steer += (steerTarget - me.steer) * Math.min(1, dt * 7);
  if (input.gas) {
    if (me.speed < 0) me.speed = Math.min(0, me.speed + BRAKE * dt);
    else me.speed += me.acc * Math.max(0, 1 - me.speed / me.maxV) * dt;
  } else if (!input.brake) me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 1.8 * dt);
  if (input.brake) me.speed = me.speed > 0 ? Math.max(0, me.speed - BRAKE * dt) : Math.max(-8, me.speed - 6 * dt);
  const yawMax = Math.min(1.6, GRIP / Math.max(Math.abs(me.speed), 0.1));
  if (Math.abs(me.speed) > 0.3) me.heading += me.steer * yawMax * dt * Math.sign(me.speed);
  const sl = slopeAt(me.x, me.z, me.heading);
  me.speed -= G * Math.sin(sl.pitch) * dt; // bergauf langsamer, an der Halfpipe-Wand rollt man zurück
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading), dist = me.speed * Math.cos(sl.pitch) * dt;
  const nx = me.x + fx * dist, nz = me.z + fz * dist, h = groundAt(nx, nz);
  if (h > me.y + 0.7) { // seitlich gegen einen Kasten oder eine Rampe: abprallen
    if (Math.abs(me.speed) > 6) crash(Math.abs(me.speed) / 40, 'tyres');
    me.speed *= -0.25;
    return;
  }
  // Abheben: der Boden fällt schneller weg, als das Auto fallen würde (Schanzenkante, Kante oben auf dem Turm)
  me.vyG = me.speed * Math.sin(sl.pitch); // senkrechtes Tempo auf der Rampe
  const ballistic = me.y + me.vyG * dt - 0.5 * G * dt * dt;
  if (h < ballistic - (0.02 + 0.25 * Math.abs(dist)) && Math.abs(me.speed) > 2) {
    me.air = true;
    const vh = me.speed * Math.cos(sl.pitch), wall = shapeAt(me.x, me.z);
    me.vx = fx * vh; me.vz = fz * vh; me.vy = me.vyG;
    // über die Kante einer Halfpipe-Wand: senkrecht hoch und wieder zurück in die Wand (nicht auf die Plattform)
    me.wallAir = wall && wall.kind === 'curve' && wall.max > 1.2 && me.speed > 0 ? wall : null;
    if (me.wallAir) { me.vx = -wall.c * 0.4; me.vz = -wall.s * 0.4; me.vy = Math.min(me.vy, 13); } // höchstens etwa 8 m über die Kante
    me.x = nx; me.z = nz; me.y = ballistic;
    me.pitch = Math.atan2(me.vyG, Math.abs(vh)) * Math.sign(me.speed || 1); // Neigung = Flugbahn (nicht über die Kante gemessen)
    startAir(me, input);
    return;
  }
  me.x = nx; me.z = nz; me.y = h;
  const ns = slopeAt(me.x, me.z, me.heading);
  me.pitch = ns.pitch; me.roll = ns.roll;
  me.camH = me.heading;
  tryLoop(me);
}

// Abheben: Tasten, die man schon vorher gedrückt hat (z.B. Gas), zählen in der Luft erst nach neuem Drücken
function startAir(me, input) {
  me.air = true;
  me.airT = 0; me.flip = 0; me.spin = 0; me.ringsNow = [];
  me.held = { gas: !!input.gas, brake: !!input.brake, left: !!input.left, right: !!input.right };
}
// In der Luft: fliegen wie ein Ball; links/rechts = Schraube, Gas = Salto vorwärts, Bremse = Salto rückwärts
function stepAir(me, input, dt) {
  me.airT += dt;
  me.vy -= G * dt;
  const ox = me.x, oy = me.y, oz = me.z;
  const nx = me.x + me.vx * dt, nz = me.z + me.vz * dt;
  if (groundAt(nx, nz) > me.y + 1) { me.vx *= -0.3; me.vz *= -0.3; } // gegen eine Wand geflogen
  else { me.x = nx; me.z = nz; }
  me.y += me.vy * dt;
  for (const k in me.held) if (!input[k]) me.held[k] = false;
  const on = k => input[k] && !me.held[k];
  const turn = ((on('right') ? 1 : 0) - (on('left') ? 1 : 0)) * 3.2 * dt;
  me.heading += turn; me.spin += turn;
  const flipIn = (on('brake') ? 1 : 0) - (on('gas') ? 1 : 0);
  if (flipIn) { me.pitch += flipIn * 3.6 * dt; me.flip += flipIn * 3.6 * dt; }
  else if (!me.wallAir && Math.hypot(me.vx, me.vz) > 3) { // ohne Eingabe richtet sich das Auto langsam nach der Flugbahn aus (macht das Landen leichter)
    const path = Math.atan2(me.vy, Math.hypot(me.vx, me.vz));
    me.pitch += wrap(path - me.pitch) * Math.min(1, dt * 1.4); // zählt nicht als Salto
  }
  me.roll *= Math.exp(-dt * 2);
  if (Math.hypot(me.vx, me.vz) > 3) me.camH = me.camH + wrap(Math.atan2(me.vz, me.vx) - me.camH) * Math.min(1, dt * 3);
  // Feuerringe: durch die Ebene geflogen und nahe genug an der Mitte?
  RINGS.forEach((R, i) => {
    if (me.ringsNow.includes(i) || (ox - R.x) * (me.x - R.x) > 0) return;
    const t = (R.x - ox) / ((me.x - ox) || 1e-6), y = oy + (me.y - oy) * t, z = oz + (me.z - oz) * t;
    if (Math.hypot(y - R.y, z - R.z) < R.r - 0.3) { me.ringsNow.push(i); addPoints(300, '🔥 FEUERRING! +300'); S.rings[i].userData.flash = 1; }
  });
  const h = groundAt(me.x, me.z);
  if (me.y > h || me.vy > 0) return;
  if (me.wallAir) { // Halfpipe-Air: immer vorwärts zurück in die Wand, Drehungen zählen
    const w = me.wallAir, spins = Math.floor((Math.abs(me.spin) + 0.7) / (Math.PI * 2));
    me.wallAir = null; me.air = false; me.vyG = 0; me.y = h;
    me.heading = w.ang + Math.PI; me.camH = me.heading;
    me.speed = Math.abs(me.vy) * 0.9;
    const s2 = slopeAt(me.x, me.z, me.heading);
    me.pitch = s2.pitch; me.roll = s2.roll;
    let pts = Math.round(me.airT * 120);
    if (spins) pts += spins * 300;
    if (me.airT > 0.5) addPoints(pts, '🛹 Halfpipe-Air +' + pts + (spins ? ' (' + spins + '× Schraube)' : ''), spins > 0);
    return;
  }
  // Landen: Auto muss ungefähr gleich geneigt sein wie der Boden
  const sl = slopeAt(me.x, me.z, me.heading);
  const ok = Math.abs(wrap(me.pitch - sl.pitch)) < 1.05 && Math.abs(wrap(me.roll - sl.roll)) < 1.05;
  me.y = h; me.air = false; me.vyG = 0;
  if (!ok) { crashLand(me); return; }
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  me.speed = (me.vx * fx + me.vz * fz) * Math.cos(sl.pitch) + me.vy * Math.sin(sl.pitch);
  me.pitch = sl.pitch; me.roll = sl.roll;
  const flips = Math.floor((Math.abs(me.flip) + 0.9) / (Math.PI * 2)), spins = Math.floor((Math.abs(me.spin) + 0.7) / (Math.PI * 2));
  const parts = [];
  let pts = 0;
  if (me.airT > 0.6) { const p = Math.round(me.airT * 100); pts += p; parts.push('✈️ ' + me.airT.toFixed(1) + ' s +' + p); }
  if (flips) { pts += flips * 500; parts.push((flips > 1 ? flips + '× ' : '') + (me.flip > 0 ? 'Rückwärts-Salto' : 'Salto') + ' +' + flips * 500); }
  if (spins) { pts += spins * 300; parts.push((spins > 1 ? spins + '× ' : '') + 'Schraube +' + spins * 300); }
  if (pts) addPoints(pts, parts.join(' · '), flips + spins > 0);
}

function crashLand(me) {
  crash(0.9, 'car');
  me.speed = 0; me.frozen = 1.2;
  const sl = slopeAt(me.x, me.z, me.heading);
  me.pitch = sl.pitch; me.roll = sl.roll;
  P.combo = 0;
  showMsg('💥 Bruchlandung!', 1.6);
}

// Looping: Einfahrt erkennen (richtig ausgerichtet, schnell genug unterwegs)
function tryLoop(me) {
  const L = LOOP, dx = me.x - L.x, dz = me.z - L.z, u = dx * L.c + dz * L.s, v = -dx * L.s + dz * L.c;
  if (u < -0.3 || u > 1.2 || Math.abs(v) > L.w / 2 || me.speed < 3 || Math.abs(wrap(me.heading - L.ang)) > 0.6) return;
  me.loop = { th: Math.max(0, u) / L.R, v0: v };
}
function stepLoop(me, input, dt) {
  const L = me.loop, R = LOOP.R;
  if (input.gas) me.speed += me.acc * 0.4 * dt;
  me.speed -= G * Math.sin(L.th) * dt;
  L.th += me.speed / R * dt;
  const th = L.th, v = L.v0 + LOOP.shift * Math.max(0, th) / (Math.PI * 2), u = R * Math.sin(th);
  me.x = LOOP.x + LOOP.c * u - LOOP.s * v; me.z = LOOP.z + LOOP.s * u + LOOP.c * v; me.y = R * (1 - Math.cos(th));
  me.heading = LOOP.ang; me.pitch = th; me.roll = 0; me.camH = LOOP.ang;
  // oben zu langsam? Dann fällt man herunter
  if (th > Math.PI / 2 && th < Math.PI * 1.5 && me.speed * me.speed / R < -G * Math.cos(th) * 0.85) {
    me.loop = null; me.air = true;
    me.vx = LOOP.c * me.speed * Math.cos(th); me.vz = LOOP.s * me.speed * Math.cos(th); me.vy = me.speed * Math.sin(th);
    startAir(me, input);
    showMsg('😱 Zu langsam für den Looping!', 1.6);
    return;
  }
  if (th <= 0) { me.loop = null; me.y = 0; me.pitch = 0; showMsg('😅 Mehr Schwung für den Looping!', 1.6); return; } // zurückgerollt
  if (th >= Math.PI * 2) {
    me.loop = null; me.y = 0; me.pitch = 0; me.vyG = 0;
    addPoints(800, '🎢 LOOPING! +800', true);
  }
}

function addPoints(n, text, big = false) {
  P.combo++;
  const total = P.combo > 1 ? Math.round(n * (1 + (P.combo - 1) * 0.25)) : n;
  P.score += total;
  showMsg(text + (P.combo > 1 ? '  (Combo ×' + (1 + (P.combo - 1) * 0.25).toFixed(2).replace(/\.?0+$/, '') + ')' : ''), big ? 2.4 : 1.8);
  if (P.score > P.best) { P.best = P.score; try { localStorage.setItem(BEST_KEY, String(P.best)); } catch (e) { /* egal */ } }
  P.comboT = 6;
  window.beep && window.beep(big ? 880 : 660, 0.12, 'triangle', 0.05);
}

// ---------- Oberfläche ----------
const CSS = `
#stunt { position: fixed; overflow: hidden; background: #000; z-index: 10; transform-origin: center center;
  font-family: system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; touch-action: none; }
#stunt canvas.c3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#stunt .speed { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); text-align: center;
  background: rgba(0,0,0,.55); border-radius: 14px; padding: 6px 16px; font-weight: 800; font-size: 26px; }
#stunt .speed small { display: block; font-size: 13px; font-weight: 600; opacity: .8; }
#stunt .score { position: absolute; top: 10px; left: 80px; background: rgba(0,0,0,.55); border-radius: 12px; padding: 6px 14px; font-weight: 900; font-size: 24px; }
#stunt .score small { display: block; font-size: 13px; font-weight: 700; opacity: .85; }
#stunt .board { position: absolute; top: 76px; left: 12px; background: rgba(0,0,0,.45); border-radius: 10px; padding: 4px 10px; font-size: 14px; }
#stunt .board[hidden] { display: none; }
#stunt .air { position: absolute; top: 22%; width: 100%; text-align: center; font-size: 24px; font-weight: 900; text-shadow: 0 2px 8px rgba(0,0,0,.7); pointer-events: none; }
#stunt .quit { position: absolute; top: 10px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#stunt .reset { position: absolute; top: 10px; left: 12px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.4); font-size: 26px; }
#stunt .msg { position: absolute; top: 30%; width: 100%; text-align: center; font-size: 34px; font-weight: 900;
  text-shadow: 0 3px 10px rgba(0,0,0,.7); pointer-events: none; padding: 0 20px; box-sizing: border-box; }
#stunt .ctl { position: absolute; bottom: 16px; width: 94px; height: 94px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.35); color: #fff; font-size: 30px; font-weight: 900; touch-action: none; }
#stunt .ctl.on { background: rgba(255,255,255,.4); }
#stunt .ctl.gas { border-color: #4ade80; font-size: 20px; } #stunt .ctl.brake { border-color: #f87171; font-size: 16px; }
#stunt .hint { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); font-size: 15px; opacity: .85;
  background: rgba(0,0,0,.45); padding: 4px 12px; border-radius: 10px; white-space: nowrap; }
`;

function buildDom() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'stunt';
  root.hidden = true;
  root.innerHTML = `
    <button class="reset" title="Zurück zum Start (R)">🔄</button>
    <div class="score">⭐ <span class="pts">0</span><small class="best"></small></div>
    <div class="board" hidden></div>
    <button class="quit" title="Stuntpark verlassen">✕</button>
    <div class="air"></div>
    <div class="msg"></div>
    <div class="speed"><span class="kmh">0</span> km/h<small class="ps"></small></div>
    <div class="hint">⬅️ ➡️ lenken (in der Luft: Schraube) · ⬆️ Gas (Salto vorwärts) · ⬇️ Bremse (Salto rückwärts) · R Neustart</div>
    <button class="ctl" data-k="left" style="left:16px">◀</button>
    <button class="ctl" data-k="right" style="left:124px">▶</button>
    <button class="ctl brake" data-k="brake" style="right:124px">BREMSE<br>↺</button>
    <button class="ctl gas" data-k="gas" style="right:16px">GAS<br>↻</button>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), air: $('.air'), pts: $('.pts'), best: $('.best'), board: $('.board'),
    hint: $('.hint'), ctls: [...root.querySelectorAll('.ctl')] };
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  for (const b of ui.ctls) {
    b.style.display = touch ? '' : 'none';
    const set = on => { if (P) P.input[b.dataset.k] = on; b.classList.toggle('on', on); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* geht auch so */ } set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  }
  if (touch) ui.hint.style.display = 'none';
  $('.quit').addEventListener('pointerdown', e => { e.preventDefault(); if (P) endStunt(); });
  $('.reset').addEventListener('pointerdown', e => { e.preventDefault(); if (P) { resetCar(P.me); P.combo = 0; } });
  root.addEventListener('contextmenu', e => e.preventDefault());
  return ui;
}

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake' };
function onKey(e) {
  if (!P) return;
  if (e.code === 'KeyR' && e.type === 'keydown') { resetCar(P.me); P.combo = 0; return; }
  const k = KEYS[e.code];
  if (!k) return;
  P.input[k] = e.type === 'keydown';
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
  P.msgT = secs;
}

// ---------- Start, Schleife, Ende ----------
// net (nur online): siehe netcars.js; earn(n) schreibt Münzen gut (nur offline)
export function startStunt({ player, kinds, topSpeed, onExit, earn = () => {}, net = null }) {
  if (!S) {
    S = buildWorld();
    S.ui = buildDom();
    S.ui.root.prepend(S.renderer.domElement);
    window.addEventListener('resize', () => S && !S.ui.root.hidden && layout());
  }
  const mesh = buildCar(player, kinds);
  mesh.rotation.order = 'YZX';
  const me = { mesh, special: player.special || null, steer: 0, maxV: Math.min(36, topSpeed(player.ps)), acc: 6 + player.ps * 0.07, radius: Math.max(1.3, mesh.userData.radius * 0.8) };
  // online starten alle etwas versetzt, damit sie nicht aufeinander stehen
  resetCar(me, -170, net ? (net.mySlot - 2.5) * 6 : 0);
  let best = 0;
  try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* egal */ }
  P = { me, input: {}, t: 0, msgT: 0, last: performance.now(), onExit, earn, score: 0, best, combo: 0, comboT: 0, gears: gearbox(player.kind), net,
    netCars: net ? makeNetCars({ scene: S.scene, kinds, net }) : null };
  window.__stunt = () => P; // für Tests im Browser
  window.__stuntS = () => S;
  S.scene.add(mesh);
  warmUp(S.renderer, S.scene, S.camera);
  if (!S.quality) S.quality = makeQuality(S.renderer, layout);
  S.ui.root.hidden = false;
  S.ui.ps.textContent = '⚡ ' + player.ps + ' PS';
  S.ui.board.hidden = !net;
  if (net) P.chat = makeChat({ parent: S.ui.root, net, mode: 'stunt', onSay: (slot, text) => P.netCars.say(slot, text) });
  layout();
  showMsg(net ? '🤸 Stuntpark online – zeig, was du kannst!' : '🤸 Rampen, Schanzen, Looping – los geht’s!', 2.6);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  S.snd = createCarSound({ kind: player.kind });
  S.camera.position.set(me.x - 10, 4, me.z);
  camLook.set(me.x, 1.2, me.z);
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!P) return;
  const dt = Math.min(0.05, Math.max(0, (now - P.last) / 1000));
  S.quality((now - P.last) / 1000);
  P.last = now;
  P.t += dt;
  if (P.msgT > 0 && (P.msgT -= dt) <= 0) S.ui.msg.textContent = '';
  if (P.comboT > 0 && (P.comboT -= dt) <= 0) P.combo = 0;
  const n = Math.max(1, Math.ceil(dt / (1 / 120))); // kleine Schritte: genauer an Kanten und im Looping
  for (let k = 0; k < n; k++) stepMe(dt / n);
  const me = P.me;
  me.x = Math.max(-EDGE + 1.5, Math.min(EDGE - 1.5, me.x)); me.z = Math.max(-EDGE + 1.5, Math.min(EDGE - 1.5, me.z));
  if (P.netCars) {
    const o = { x: me.x, y: me.y, z: me.z };
    if (!me.air && !me.loop && P.netCars.bump(o, me.radius)) { me.x = o.x; me.z = o.z; me.speed *= 0.97; }
    P.netCars.update(dt, P.t, { x: me.x, y: me.y, z: me.z, h: me.heading, v: me.speed, a: me.pitch, b: me.roll, p: P.score });
    P.chat.update(dt);
  }
  updateHud(dt);
  render(dt);
  requestAnimationFrame(loop);
}

function updateHud(dt) {
  const me = P.me, ui = S.ui;
  ui.kmh.textContent = Math.round(Math.abs(me.air ? Math.hypot(me.vx, me.vz, me.vy) : me.speed) * 3.6);
  ui.pts.textContent = P.score;
  ui.best.textContent = '🏆 Rekord ' + P.best;
  ui.air.textContent = me.air && me.airT > 0.4 ? '✈️ ' + me.airT.toFixed(1) + ' s' + (Math.abs(me.flip) > 3 ? '  🔄' : '') + (Math.abs(me.spin) > 3 ? '  🌀' : '') : '';
  if (P.net) { // Punkte aller Mitspieler (aus den Live-Daten, Feld p)
    const players = P.net.players() || {};
    const rows = Object.keys(players).map(s => ({ name: players[s].name, pts: +s === P.net.mySlot ? P.score : ((P.net.latest(+s) || {}).p || 0), me: +s === P.net.mySlot }))
      .sort((a, b) => b.pts - a.pts);
    const html = rows.map(r => `<div>${r.me ? '👉 ' : ''}${esc(r.name)}: <b>${r.pts}</b></div>`).join('');
    if (html !== P.boardHtml) { ui.board.innerHTML = html; P.boardHtml = html; }
  }
  if (S.snd) {
    const g = P.gears(Math.abs(me.speed), me.maxV);
    S.snd.update({ frac: me.air ? Math.min(1, g.frac + 0.2) : g.frac, throttle: P.input.gas ? 1 : 0.15, speed: me.air ? 0 : me.speed,
      slip: !me.air && P.input.brake && me.speed > 6 ? 0.6 : 0, surface: 'asphalt', other: null, dt });
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const camWant = new THREE.Vector3(), camLook = new THREE.Vector3(), camAt = new THREE.Vector3();
function render(dt) {
  const me = P.me, cam = S.camera, m = me.mesh;
  m.position.set(me.x, me.y, me.z);
  m.rotation.set(me.roll, -me.heading, me.pitch);
  for (const w of m.userData.wheels) w.rotation.z -= (me.air ? 0.4 : me.speed * dt / 0.35);
  for (const w of m.userData.wheels) if (w.position.x > 0) w.rotation.y = -me.steer * 0.4;
  animateCar(m, P.t, me.special, me.air || !!me.loop);
  if (me.loop) { // Looping von der Seite zeigen
    const L = LOOP;
    camWant.set(L.x - L.s * -28, L.R * 0.9, L.z + L.c * -28);
    camAt.set(L.x, L.R * 0.9, L.z + L.c * L.shift / 2);
  } else {
    const fx = Math.cos(me.camH), fz = Math.sin(me.camH), back = 9 + Math.abs(me.speed) * 0.03;
    camWant.set(me.x - fx * back, me.y + 3.6, me.z - fz * back);
    camAt.set(me.x + fx * 5, me.y + 1.2, me.z + fz * 5);
  }
  cam.position.lerp(camWant, 1 - Math.exp(-dt * (me.loop ? 3 : 5)));
  cam.position.y = Math.max(cam.position.y, groundAt(cam.position.x, cam.position.z) + 1.2);
  camLook.lerp(camAt, 1 - Math.exp(-dt * 8));
  cam.lookAt(camLook);
  cam.fov += (62 + Math.min(12, Math.abs(me.speed) * 0.12) - cam.fov) * (1 - Math.exp(-dt * 1.5));
  cam.updateProjectionMatrix();
  for (const ring of S.rings) { // Feuerringe flackern, aufleuchten beim Durchfliegen
    ring.userData.flash = Math.max(0, (ring.userData.flash || 0) - dt);
    ring.material.emissiveIntensity = 1.3 + Math.sin(P.t * 9 + ring.position.x) * 0.3 + ring.userData.flash * 4;
  }
  S.sun.position.set(me.x + 80, me.y + 120, me.z + 50);
  S.sun.target.position.set(me.x, me.y, me.z);
  S.clouds.position.set(cam.position.x, 0, cam.position.z);
  S.renderer.render(S.scene, cam);
}

function endStunt() {
  const p = P;
  P = null;
  if (S.snd) { S.snd.stop(); S.snd = null; }
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  S.scene.remove(p.me.mesh);
  if (p.netCars) p.netCars.dispose();
  if (p.chat) p.chat.dispose();
  S.ui.root.hidden = true;
  const coins = p.net ? 0 : Math.floor(p.score / 250); // offline: Punkte geben Münzen
  if (coins) p.earn(coins);
  p.onExit({ score: p.score, coins });
}

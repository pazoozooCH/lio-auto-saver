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
import { makeEffects, camView, CAM_NAMES, FLY_HTML, FLY_KEYS, flyCss, flyHelp, flyToggle, flyStep } from './fx.js';

const G = 9.81;
const EDGE = 188;               // so weit geht der Platz (±)
const FLY_MAX = 70, FLY_SPEED = 1.25; // Fliegen: höchste Höhe, schneller als am Boden
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
// Bus-Sprung: Schanze, fünf Schulbusse (darauf kann man auch landen), Landehügel
add({ kind: 'curve', x: 50, z: -90, w: 10, R: 18, max: deg(35), color: 0xdc2626 });
const BUSES = [66.5, 69.4, 72.3, 75.2, 78.1];
for (const bx of BUSES) add({ kind: 'box', x: bx, z: -90 - 3.45, ang: Math.PI / 2, w: 2.6, len: 6.9, h0: 2.9, hidden: true });
add({ kind: 'ramp', x: 84, z: -90, w: 16, len: 14, h0: 0, h1: 4.5, color: 0x15803d });
add({ kind: 'ramp', x: 98, z: -90, w: 16, len: 44, h0: 4.5, h1: 0, color: 0x16a34a });
// Halfpipe: zwei Wände gegenüber, dazwischen 15 m Boden (man fährt der Länge nach hinein)
const HP_R = 9, HP_LEN = curveLen(HP_R, deg(75)), HP_H = HP_R * (1 - Math.cos(deg(75)));
add({ kind: 'curve', x: 100, z: 40, ang: -Math.PI / 2, w: 70, R: HP_R, max: deg(75), color: 0xc8924f });
add({ kind: 'box', x: 100, z: 40 - HP_LEN, ang: -Math.PI / 2, w: 70, len: 6, h0: HP_H, color: 0x64748b });
add({ kind: 'curve', x: 100, z: 55, ang: Math.PI / 2, w: 70, R: HP_R, max: deg(75), color: 0xc8924f });
add({ kind: 'box', x: 100, z: 55 + HP_LEN, ang: Math.PI / 2, w: 70, len: 6, h0: HP_H, color: 0x64748b });
// Funbox: Kasten mit Rampen auf allen vier Seiten
add({ kind: 'box', x: 54, z: 120, w: 12, len: 12, h0: 3, color: 0x9333ea });
add({ kind: 'ramp', x: 47.5, z: 120, w: 12, len: 6.5, h0: 0, h1: 3, color: 0xa855f7 });
add({ kind: 'ramp', x: 66, z: 120, w: 12, len: 6.5, h0: 3, h1: 0, color: 0xa855f7 });
add({ kind: 'ramp', x: 60, z: 107.5, ang: Math.PI / 2, w: 12, len: 6.5, h0: 0, h1: 3, color: 0xa855f7 });
add({ kind: 'ramp', x: 60, z: 126, ang: Math.PI / 2, w: 12, len: 6.5, h0: 3, h1: 0, color: 0xa855f7 });
// Trampoline: schleudern dich hoch in die Luft (drei hintereinander)
const TRAMPS = [-125, -100, -75];
for (const tx of TRAMPS) add({ kind: 'tramp', x: tx - 5, z: 60, w: 10, len: 10, h0: 0.45 });
for (const s of SHAPES) { s.c = Math.cos(s.ang); s.s = Math.sin(s.ang); }

// Turbo-Felder: drüberfahren = Vollgas und mehr (vor Looping, Bus-Sprung und grossem Looping)
const BOOSTS = [{ x: -40, z: 70 }, { x: 50, z: -30 }];

// Looping: Einfahrt bei (x, z) in Richtung ang, Ausfahrt um shift seitlich versetzt (Schraube, damit sich die Bahn nicht kreuzt)
const LOOPS = [{ x: 0, z: 70, ang: 0, R: 9, w: 8, shift: 10 }, { x: 95, z: -30, ang: 0, R: 13, w: 8, shift: 11 }];
for (const L of LOOPS) { L.c = Math.cos(L.ang); L.s = Math.sin(L.ang); }
// Feuerringe: Mitte und Radius; man fliegt in x-Richtung hindurch
const RINGS = [{ x: -30, y: 10, z: 10, r: 4.5 }, { x: 40, y: 17, z: -130, r: 6 }, { x: 42, y: 7, z: -50, r: 4 },
  { x: 72, y: 11, z: -90, r: 5 }, { x: -87.5, y: 16, z: 60, r: 5 }, { x: 62, y: 7, z: 120, r: 4 }];

function shapeHeight(s, x, z) {
  const dx = x - s.x, dz = z - s.z, u = dx * s.c + dz * s.s, v = -dx * s.s + dz * s.c;
  if (u < 0 || u > s.len || Math.abs(v) > s.w / 2) return -Infinity;
  if (s.kind === 'box' || s.kind === 'tramp') return s.h0;
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
function buildWorld(kinds) {
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
  const tramp = mat({ color: 0x111827, roughness: 0.6 }), trampFrame = mat({ color: 0x2563eb, metalness: 0.4, roughness: 0.4 });
  for (const s of SHAPES) {
    if (s.hidden) continue; // z.B. unter den Bussen
    if (s.kind === 'tramp') { // Trampolin: blauer Rahmen, schwarzes Sprungtuch, Federn
      const cx = s.x + s.c * s.len / 2, cz = s.z + s.s * s.len / 2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(s.len, s.h0 - 0.05, s.w), trampFrame);
      frame.position.set(cx, (s.h0 - 0.05) / 2, cz); frame.castShadow = frame.receiveShadow = true; scene.add(frame);
      const top = new THREE.Mesh(new THREE.BoxGeometry(s.len - 0.8, 0.08, s.w - 0.8), tramp);
      top.position.set(cx, s.h0, cz); top.receiveShadow = true; scene.add(top);
      continue;
    }
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

  // Schulbusse für den Bus-Sprung (stehen quer zur Sprungrichtung)
  for (const bx of BUSES) {
    const bus = buildCar({ kind: 'schoolbus', color: '#f5b700', special: null }, kinds);
    bus.position.set(bx, 0, -90); bus.rotation.y = -Math.PI / 2;
    scene.add(bus);
  }
  // Turbo-Felder: leuchtende Pfeile am Boden
  const boostTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = '#0b1120'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#facc15';
    for (let k = 0; k < 3; k++) { const y = 200 - k * 75; g.beginPath(); g.moveTo(14, y); g.lineTo(64, y - 50); g.lineTo(114, y); g.lineTo(114, y + 26); g.lineTo(64, y - 24); g.lineTo(14, y + 26); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const boostMat = new THREE.MeshStandardMaterial({ map: boostTex, emissive: 0xffffff, emissiveMap: boostTex, emissiveIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const b of BOOSTS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), boostMat);
    m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); // Pfeile zeigen in +x
    m.position.set(b.x, 0.03, b.z);
    scene.add(m);
  }

  // Loopings: Fahrbahn auf der Innenseite eines senkrechten Kreises, seitlich versetzt
  for (const L of LOOPS) buildLoop(L);
  function buildLoop(L) {
  const steps = 140, pos = [], idx = [], uvs = [];
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
  Object.assign(me, { x, z, y: groundAt(x, z), heading, speed: 0, vl: 0, driftMode: false, drifting: false, air: false, loop: null, vx: 0, vy: 0, vz: 0, vyG: 0,
    pitch: 0, roll: 0, airT: 0, flip: 0, spin: 0, camH: heading, frozen: 0, ringsNow: [], wallAir: null, fly: false, landing: false });
}

function stepMe(dt) {
  const me = P.me, input = me.frozen > 0 ? {} : P.input;
  if (me.frozen > 0) me.frozen -= dt;
  if (me.fly) { stepFly(me, input, dt); return; }
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
  // Driften (wie in der Stadt): Handbremse lässt das Heck ausbrechen, das Auto rutscht quer weiter
  const hand = !!input.drift;
  if (hand) me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 3.5 * dt);
  if ((hand && Math.abs(me.speed) > 8) || Math.abs(me.vl) > 3.5) me.driftMode = true;
  else if (Math.abs(me.vl) < 1.2 || Math.abs(me.speed) < 5) me.driftMode = false;
  const sliding = me.driftMode || hand;
  const yawMax = sliding ? Math.min(1.9, 30 / Math.max(Math.hypot(me.speed, me.vl), 0.1)) : Math.min(1.6 * P.gripBoost, GRIP * P.gripBoost / Math.max(Math.abs(me.speed), 0.1));
  const turn = Math.abs(me.speed) > 0.3 ? me.steer * yawMax * dt * Math.sign(me.speed) : 0;
  me.heading += turn;
  if (sliding) { const c = Math.cos(turn), sn = Math.sin(turn), vf = me.speed * c + me.vl * sn; me.vl = -me.speed * sn + me.vl * c; me.speed = vf; }
  me.vl *= Math.exp(-(hand ? 0.8 : me.driftMode ? (input.gas ? 1.3 : 2.4) : 9) * dt);
  me.drifting = Math.abs(me.vl) > 2.5 && Math.abs(me.speed) > 5;
  const sl = slopeAt(me.x, me.z, me.heading);
  me.speed -= G * Math.sin(sl.pitch) * dt; // bergauf langsamer, an der Halfpipe-Wand rollt man zurück
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading), dist = me.speed * Math.cos(sl.pitch) * dt;
  const nx = me.x + fx * dist - fz * me.vl * dt, nz = me.z + fz * dist + fx * me.vl * dt, h = groundAt(nx, nz);
  if (h > me.y + 0.7) { // seitlich gegen einen Kasten oder eine Rampe: abprallen
    if (Math.abs(me.speed) > 6) crash(Math.abs(me.speed) / 40, 'tyres');
    me.speed *= -0.25; me.vl *= -0.3;
    return;
  }
  // Abheben: der Boden fällt schneller weg, als das Auto fallen würde (Schanzenkante, Kante oben auf dem Turm)
  // senkrechtes Tempo auf der Rampe; an einer Kante zählt auch der Schwung vom Schritt davor
  // (sonst hängt das Abheben davon ab, wo genau ein Rechenschritt über die Kante fällt)
  const vyPrev = me.vyG || 0, shapePrev = me.shapePrev;
  me.vyG = me.speed * Math.sin(sl.pitch);
  me.shapePrev = shapeAt(me.x, me.z);
  const vyT = Math.max(vyPrev, me.vyG);
  const ballistic = me.y + vyT * dt - 0.5 * G * dt * dt;
  if (h < ballistic - (0.02 + 0.25 * Math.abs(dist)) && Math.abs(me.speed) > 2) {
    me.air = true;
    const isWall = w => w && w.kind === 'curve' && w.max > 1.2, here = shapeAt(me.x, me.z);
    const wall = isWall(here) ? here : isWall(shapePrev) ? shapePrev : null;
    const vh = Math.sqrt(Math.max(0, me.speed * me.speed - vyT * vyT)) * Math.sign(me.speed || 1);
    me.vx = fx * vh - fz * me.vl; me.vz = fz * vh + fx * me.vl; me.vy = vyT; // im Drift fliegt man schräg ab
    me.vl = 0; me.drifting = false;
    // über die Kante einer Halfpipe-Wand: senkrecht hoch und wieder zurück in die Wand (nicht auf die Plattform)
    me.wallAir = wall && me.speed > 0 ? wall : null;
    if (me.wallAir) { me.vx = -wall.c * 0.4; me.vz = -wall.s * 0.4; me.vy = Math.min(me.vy, 13); } // höchstens etwa 8 m über die Kante
    me.x = nx; me.z = nz; me.y = ballistic;
    me.pitch = Math.atan2(vyT, Math.abs(vh)) * Math.sign(me.speed || 1); // Neigung = Flugbahn (nicht über die Kante gemessen)
    startAir(me, input);
    return;
  }
  me.x = nx; me.z = nz; me.y = h;
  const top = shapeAt(me.x, me.z);
  if (top && top.kind === 'tramp' && Math.abs(me.speed) > 1) { // aufs Trampolin gefahren: hoch hinaus!
    me.vx = fx * me.speed - fz * me.vl; me.vz = fz * me.speed + fx * me.vl; me.pitch = 0.15;
    trampBounce(me, input);
    return;
  }
  boostCheck(me);
  const ns = slopeAt(me.x, me.z, me.heading);
  me.pitch = ns.pitch; me.roll = ns.roll;
  me.camH = me.heading;
  tryLoop(me);
}

// Fliegen: lenken und Gas wie am Boden, ohne Saltos; gibt keine Punkte (Feuerringe zählen nur beim Springen)
function toggleFly() {
  const me = P && P.me;
  if (!me || !P.canFly || me.loop || me.frozen > 0) return;
  if (!me.fly && me.air) { // Schwung vom Sprung mitnehmen
    me.speed = Math.hypot(me.vx, me.vz);
    if (me.speed > 3) me.heading = Math.atan2(me.vz, me.vx);
    me.wallAir = null;
  }
  flyToggle(me, me.y);
  if (!me.landing) showMsg(flyHelp(), 2);
}
function stepFly(me, input, dt) {
  me.air = true; me.airT = 0; me.vl = 0; me.drifting = false;
  me.steer += ((input.left ? -1 : 0) + (input.right ? 1 : 0) - me.steer) * Math.min(1, dt * 7);
  const maxV = me.maxV * FLY_SPEED;
  if (input.gas) me.speed += me.acc * Math.max(0, 1 - me.speed / maxV) * dt;
  else if (!input.brake) me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 1.8 * dt);
  if (input.brake) me.speed = me.speed > 0 ? Math.max(0, me.speed - BRAKE * dt) : Math.max(-8, me.speed - 6 * dt);
  const yawMax = Math.min(1.6 * P.gripBoost, GRIP * P.gripBoost / Math.max(Math.abs(me.speed), 0.1));
  if (Math.abs(me.speed) > 0.3) me.heading += me.steer * yawMax * dt * Math.sign(me.speed);
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading), nx = me.x + fx * me.speed * dt, nz = me.z + fz * me.speed * dt;
  if (groundAt(nx, nz) > me.y + 0.7) { // gegen eine Wand geflogen
    if (Math.abs(me.speed) > 6) crash(Math.abs(me.speed) / 40, 'tyres');
    me.speed *= -0.25;
  } else { me.x = nx; me.z = nz; }
  const h = groundAt(me.x, me.z);
  me.y = flyStep(me, input, dt, me.y, h, FLY_MAX);
  me.vx = fx * me.speed; me.vz = fz * me.speed; me.vy = me.flyVy;
  me.pitch += (me.flyPitch - wrap(me.pitch)) * Math.min(1, dt * 6);
  me.roll += (me.flyRoll - wrap(me.roll)) * Math.min(1, dt * 6);
  me.camH = me.heading;
  if (me.landing && me.y <= h + 0.03) {
    const sl = slopeAt(me.x, me.z, me.heading);
    Object.assign(me, { fly: false, landing: false, air: false, y: h, vyG: 0, pitch: sl.pitch, roll: sl.roll });
    showMsg('🛬 Gelandet', 1.2);
  }
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
  const top = shapeAt(me.x, me.z);
  if (top && top.kind === 'tramp') { // auf dem Trampolin gelandet: Punkte, und gleich wieder hoch (egal wie man landet)
    const sc = landPoints(me);
    if (sc.pts) addPoints(sc.pts + 50, '🦘 Trampolin +50' + (sc.parts.length ? ' · ' + sc.parts.join(' · ') : ''), sc.big);
    me.y = h; me.pitch = 0.15; me.roll = 0;
    trampBounce(me, input);
    return;
  }
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
  const sc = landPoints(me);
  if (sc.pts) addPoints(sc.pts, sc.parts.join(' · '), sc.big);
}

// Trampolin: hoch hinaus, und wenn vorne ein weiteres Trampolin steht, genau dorthin (boing, boing, boing)
const TRAMP_VY = 19;
function trampBounce(me, input) {
  const t = 2 * TRAMP_VY / G; // Flugzeit bis zur gleichen Höhe
  let vx = me.vx, vz = me.vz, vh = Math.hypot(vx, vz);
  const dir = vh > 0.5 ? Math.atan2(vz, vx) : me.heading;
  let next = null, best = Infinity;
  for (const s of SHAPES) {
    if (s.kind !== 'tramp') continue;
    const cx = s.x + s.c * s.len / 2, cz = s.z + s.s * s.len / 2, d = Math.hypot(cx - me.x, cz - me.z);
    if (d < 8 || d > 45 || Math.abs(wrap(Math.atan2(cz - me.z, cx - me.x) - dir)) > 0.6) continue;
    if (d < best) { best = d; next = [cx, cz]; }
  }
  if (next) { vx = (next[0] - me.x) / t; vz = (next[1] - me.z) / t; }
  else if (vh > 8) { vx *= 8 / vh; vz *= 8 / vh; }
  me.vx = vx; me.vz = vz; me.vy = TRAMP_VY; me.vl = 0; me.drifting = false;
  startAir(me, input);
  window.beep && window.beep(330 + Math.random() * 60, 0.18, 'sine', 0.08);
}

// Punkte für einen Flug: Flugzeit, Saltos, Schrauben
function landPoints(me) {
  const flips = Math.floor((Math.abs(me.flip) + 0.9) / (Math.PI * 2)), spins = Math.floor((Math.abs(me.spin) + 0.7) / (Math.PI * 2));
  const parts = [];
  let pts = 0;
  if (me.airT > 0.6) { const p = Math.round(me.airT * 100); pts += p; parts.push('✈️ ' + me.airT.toFixed(1) + ' s +' + p); }
  if (flips) { pts += flips * 500; parts.push((flips > 1 ? flips + '× ' : '') + (me.flip > 0 ? 'Rückwärts-Salto' : 'Salto') + ' +' + flips * 500); }
  if (spins) { pts += spins * 300; parts.push((spins > 1 ? spins + '× ' : '') + 'Schraube +' + spins * 300); }
  return { pts, parts, big: flips + spins > 0 };
}

// Turbo-Feld: kurz Vollgas und noch mehr (einmal pro Überfahren)
function boostCheck(me) {
  const on = BOOSTS.some(b => Math.abs(me.x - b.x) < 4 && Math.abs(me.z - b.z) < 2.2);
  if (on && !me.boostIn && me.speed > 0) {
    me.speed = Math.max(me.speed, me.maxV * 1.25);
    showMsg('⚡ TURBO!', 0.9);
    window.beep && window.beep(988, 0.12, 'sawtooth', 0.04);
  }
  me.boostIn = on;
}

function crashLand(me) {
  crash(0.9, 'car');
  P.drift = 0;
  me.speed = 0; me.frozen = 1.2;
  const sl = slopeAt(me.x, me.z, me.heading);
  me.pitch = sl.pitch; me.roll = sl.roll;
  P.combo = 0;
  showMsg('💥 Bruchlandung!', 1.6);
}

// Looping: Einfahrt erkennen (richtig ausgerichtet, schnell genug unterwegs)
function tryLoop(me) {
  for (const LP of LOOPS) {
    const dx = me.x - LP.x, dz = me.z - LP.z, u = dx * LP.c + dz * LP.s, v = -dx * LP.s + dz * LP.c;
    if (u < -0.3 || u > 1.2 || Math.abs(v) > LP.w / 2 || me.speed < 3 || Math.abs(wrap(me.heading - LP.ang)) > 0.6) continue;
    me.loop = { th: Math.max(0, u) / LP.R, v0: v, L: LP };
    me.vl = 0; me.drifting = false;
    return;
  }
}
function stepLoop(me, input, dt) {
  const L = me.loop, LOOP = L.L, R = LOOP.R;
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
    const pts = LOOP.R > 10 ? 1200 : 800;
    addPoints(pts, (LOOP.R > 10 ? '🎢 MEGA-LOOPING! +' : '🎢 LOOPING! +') + pts, true);
  }
}

// Bremsspuren und Rauch; Drift-Punkte: je schneller und je quer, desto mehr (nach dem Drift gutgeschrieben)
function stuntDrift(dt) {
  const me = P.me, fx = Math.cos(me.heading), fz = Math.sin(me.heading), ground = !me.air && !me.loop;
  const skid = ground && (me.drifting || (P.input.drift && Math.abs(me.speed) > 6) || (P.input.brake && me.speed > 12));
  const back = me.mesh.userData.length * 0.32, y = me.y + 0.04;
  for (const k of [0, 1]) {
    const sx = k ? 1 : -1, wx = me.x - fx * back - fz * 0.8 * sx, wz = me.z - fz * back + fx * 0.8 * sx;
    S.fx.mark(k, wx, y, wz, skid);
    if (ground && me.drifting && Math.random() < dt * 22) S.fx.puff(wx, y + 0.3, wz, fx * me.speed - fz * me.vl, fz * me.speed + fx * me.vl);
  }
  if (ground && me.drifting) {
    P.drift += Math.abs(me.vl) * Math.abs(me.speed) * dt * 0.8;
    P.driftT = 0.7;
  } else if (P.drift > 0 && (P.driftT -= dt) <= 0) {
    const pts = Math.round(P.drift);
    P.drift = 0;
    if (pts >= 60) addPoints(pts, '🔥 Drift +' + pts);
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
#stunt .cam { position: absolute; top: 58px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#stunt .quit { position: absolute; top: 10px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#stunt .reset { position: absolute; top: 10px; left: 12px; width: 58px; height: 58px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.4); font-size: 26px; }
#stunt .msg { position: absolute; top: 30%; width: 100%; text-align: center; font-size: 34px; font-weight: 900;
  text-shadow: 0 3px 10px rgba(0,0,0,.7); pointer-events: none; padding: 0 20px; box-sizing: border-box; }
#stunt .ctl { position: absolute; bottom: 16px; width: 94px; height: 94px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.35); color: #fff; font-size: 30px; font-weight: 900; touch-action: none; }
#stunt .ctl.on { background: rgba(255,255,255,.4); }
#stunt .ctl.hand { width: 84px; height: 84px; font-size: 16px; border-color: #fb923c; }
${flyCss('stunt')}#stunt .ctl.gas { border-color: #4ade80; font-size: 20px; } #stunt .ctl.brake { border-color: #f87171; font-size: 16px; }
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
    <button class="cam" title="Kamera wechseln (V)">📷</button>
    <div class="air"></div>
    <div class="msg"></div>
    <div class="speed"><span class="kmh">0</span> km/h<small class="ps"></small></div>
    <div class="hint">⬅️ ➡️ lenken (in der Luft: Schraube) · ⬆️ Gas (Salto vorwärts) · ⬇️ Bremse (Salto rückwärts) · Leertaste driften · R Neustart</div>
    <button class="ctl" data-k="left" style="left:16px">◀</button>
    <button class="ctl" data-k="right" style="left:124px">▶</button>
    <button class="ctl brake" data-k="brake" style="right:124px">BREMSE<br>↺</button>
    <button class="ctl gas" data-k="gas" style="right:16px">GAS<br>↻</button>
    <button class="ctl hand" data-k="drift" style="right:70px; bottom:120px">DRIFT</button>
    ${FLY_HTML}`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), air: $('.air'), pts: $('.pts'), best: $('.best'), board: $('.board'),
    flybtn: $('.flybtn'), flyctl: $('.flyctl'),
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
  $('.cam').addEventListener('pointerdown', e => { e.preventDefault(); nextCam(); });
  $('.flybtn').addEventListener('pointerdown', e => { e.preventDefault(); toggleFly(); });
  $('.reset').addEventListener('pointerdown', e => { e.preventDefault(); if (P) { resetCar(P.me); P.combo = 0; } });
  root.addEventListener('contextmenu', e => e.preventDefault());
  return ui;
}

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift', ...FLY_KEYS };
// Kamera wechseln (bleibt eingestellt)
let camMode = 0;
function nextCam() {
  if (!P) return;
  camMode = (camMode + 1) % CAM_NAMES.length;
  showMsg(CAM_NAMES[camMode], 1);
}
function onKey(e) {
  if (!P || (e.target && e.target.tagName === 'INPUT')) return; // im Chat wird geschrieben, nicht gefahren
  if (e.code === 'KeyR' && e.type === 'keydown') { resetCar(P.me); P.combo = 0; return; }
  if (e.code === 'KeyV' && e.type === 'keydown') { nextCam(); e.preventDefault(); return; }
  if (e.code === 'KeyF' && e.type === 'keydown' && !e.repeat) { toggleFly(); e.preventDefault(); return; }
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
    S = buildWorld(kinds);
    S.ui = buildDom();
    S.ui.root.prepend(S.renderer.domElement);
    S.fx = makeEffects(S.scene);
    window.addEventListener('resize', () => S && !S.ui.root.hidden && layout());
  }
  S.fx.clear();
  const mesh = buildCar(player, kinds);
  mesh.rotation.order = 'YZX';
  const me = { mesh, special: player.special || null, steer: 0, maxV: Math.min(36, topSpeed(player.ps)), acc: 6 + player.ps * 0.07, radius: Math.max(1.3, mesh.userData.radius * 0.8) };
  // online starten alle etwas versetzt, damit sie nicht aufeinander stehen
  resetCar(me, -170, net ? (net.mySlot - 2.5) * 6 : 0);
  let best = 0;
  try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* egal */ }
  P = { me, input: {}, t: 0, msgT: 0, last: performance.now(), onExit, earn, score: 0, best, combo: 0, comboT: 0, drift: 0, driftT: 0,
    gripBoost: (kinds[player.kind] && kinds[player.kind].grip) || 1, canFly: !!(kinds[player.kind] && kinds[player.kind].fly), gears: gearbox(player.kind), net,
    netCars: net ? makeNetCars({ scene: S.scene, kinds, net }) : null };
  window.__stunt = () => P; // für Tests im Browser
  window.__stuntS = () => S;
  S.scene.add(mesh);
  warmUp(S.renderer, S.scene, S.camera);
  if (!S.quality) S.quality = makeQuality(S.renderer, layout);
  S.ui.root.hidden = false;
  S.ui.ps.textContent = '⚡ ' + player.ps + ' PS';
  S.ui.board.hidden = !net;
  S.ui.flybtn.hidden = !P.canFly;
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
  stuntDrift(dt);
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
  ui.flybtn.textContent = me.fly && !me.landing ? '🛬' : '✈️';
  ui.flyctl.hidden = !me.fly || me.landing;
  ui.best.textContent = '🏆 Rekord ' + P.best;
  ui.air.textContent = P.drift > 20 ? '🔥 DRIFT ' + Math.round(P.drift) : me.air && me.airT > 0.4 ? '✈️ ' + me.airT.toFixed(1) + ' s' + (Math.abs(me.flip) > 3 ? '  🔄' : '') + (Math.abs(me.spin) > 3 ? '  🌀' : '') : '';
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
      slip: me.air ? 0 : me.drifting ? Math.min(1, Math.abs(me.vl) / 7) : P.input.brake && me.speed > 6 ? 0.6 : 0, surface: 'asphalt', other: null, dt });
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
    const L = me.loop.L, far = -28 * L.R / 9;
    camWant.set(L.x - L.s * far, L.R * 0.9, L.z + L.c * far);
    camAt.set(L.x, L.R * 0.9, L.z + L.c * L.shift / 2);
  } else if (!camView(camMode, me.x, me.y, me.z, me.camH, camWant, camAt)) {
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
  S.fx.update(dt, cam, S.renderer);
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

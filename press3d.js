// Presse in 3D: eine Fabrikhalle mit hydraulischen Pressen (three.js).
// Die Spiellogik bleibt in game.js (2D-Koordinaten); hier wird sie nur in 3D gezeichnet.
// Wird beim Start geladen; ohne Internet bleibt die Presse in 2D.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic } from './cars3d.js';
import { makeNoise, rng, surface, dust } from './world3d.js';

let G = null;        // Spielkonstanten aus game.js
let renderer, scene, camera, sun, quality, lastLayout, lastFrame = 0, dustCloud = null;
const SX = 1 / 22, SY = 1 / 24;  // Pixel der 2D-Spielwelt → Meter
const COIN_Z = 3.6;              // Münzen liegen vor der Fahrbahn
const CAM = new THREE.Vector3(0, 7.5, 46), LOOK = new THREE.Vector3(0, 6.8, 0);
const tmp = new THREE.Vector3();

const X = lx => (lx - G.W / 2) * SX;
const Y = ly => (G.ROAD_Y - ly) * SY;

// ---------- Texturen ----------
function canvasTexture(w, h, paint, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeTextures() {
  const N = makeNoise(31), r = rng(17);
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  // Glatter Industrieboden: wolkig, kleine Poren, Fugen am Plattenrand
  const concrete = surface(512, (u, v) => {
    const n = N.fbm(u * 6, v * 6, 5, 6), pore = r() > 0.985 ? 1 : 0;
    const joint = Math.min(u, 1 - u, v, 1 - v) < 0.004 ? 1 : 0;
    const k = 84 + n * 56 + r() * 8 - pore * 30 - joint * 40;
    return [k, k, k - 3, 1 - joint - pore * 0.5 + n * 0.3];
  }, 2.5);
  // Backstein: einzelne Steine mit Farbunterschieden und vertieften Mörtelfugen
  const bricks = surface(512, (u, v) => {
    const rows = 16, cols = 8, row = Math.floor(v * rows), shift = row % 2 ? 0.5 : 0;
    const cu = u * cols + shift, col = Math.floor(cu) % cols;
    const fu = cu - Math.floor(cu), fv = v * rows - row;
    const mortar = fu < 0.045 || fv < 0.09;
    const n = N.fbm(u * 24, v * 24, 3, 24), h = hash(row, col);
    if (mortar) { const k = 128 + n * 30; return [k, k - 4, k - 10, 0.1 + n * 0.1]; }
    const l = 0.62 + h * 0.3 + n * 0.25 - (hash(col, row + 7) > 0.85 ? 0.22 : 0);
    return [168 * l, (78 + h * 22) * l, (58 + h * 10) * l, 0.9 + n * 0.25];
  }, 5);
  // Fahrspur: dunkler Asphalt mit Reifenspuren
  const lane = surface(256, (u, v) => {
    const n = N.fbm(u * 4, v * 4, 4, 4), grain = r();
    const k = 52 + n * 20 + grain * 14 - (Math.abs(((v * 2) % 1) - 0.5) < 0.12 ? 10 : 0);
    return [k, k + 1, k + 4, grain * 0.5 + n * 0.4];
  }, 2);
  // Fabrikfenster: viele kleine Scheiben, manche heller oder milchig
  const panes = canvasTexture(128, 192, (g, w, h) => {
    g.fillStyle = '#20242c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) {
      const l = 72 + r() * 22;
      g.fillStyle = `hsl(205, 35%, ${l}%)`;
      g.fillRect(x * 32 + 3, y * 32 + 3, 26, 26);
    }
  }, false);
  return {
    concrete: concrete.map, concreteN: concrete.normalMap, bricks: bricks.map, bricksN: bricks.normalMap,
    lane: lane.map, laneN: lane.normalMap, panes,
    hazard: canvasTexture(128, 32, (g, w, h) => {
      g.fillStyle = '#f1c40f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d1d1d';
      for (let x = -32; x < w + 32; x += 32) {
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill();
      }
    }),
    wood: canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#b07d48';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        g.fillStyle = `hsl(30, 45%, ${38 + Math.random() * 8}%)`;
        g.fillRect(0, y + 2, w, 28);
      }
      g.strokeStyle = '#6b4a2b'; g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.stroke();
    }),
  };
}

function signTexture(text, bg, fg, w = 512, h = 128, size = 64) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `bold ${size}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, false);
}

// ---------- Halle ----------
const steelMat = () => new THREE.MeshStandardMaterial({ color: 0x5c6475, metalness: 0.75, roughness: 0.38 });

function box(w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function buildHall(tex) {
  // Boden und Fahrspur
  for (const t of [tex.concrete, tex.concreteN]) t.repeat.set(32, 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshStandardMaterial({
    map: tex.concrete, normalMap: tex.concreteN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.42, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  for (const t of [tex.lane, tex.laneN]) t.repeat.set(15, 1);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(90, 6), new THREE.MeshStandardMaterial({
    map: tex.lane, normalMap: tex.laneN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.8 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.y = 0.01;
  lane.receiveShadow = true;
  scene.add(lane);
  tex.hazard.repeat.set(70, 1);
  for (const z of [-3.2, 3.2]) { // Warnstreifen am Rand
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.45), new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.7 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.02, z);
    stripe.receiveShadow = true;
    scene.add(stripe);
  }

  // Rückwand aus Backstein mit hohen Fenstern
  for (const t of [tex.bricks, tex.bricksN]) t.repeat.set(35, 8.5);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 34), new THREE.MeshStandardMaterial({
    map: tex.bricks, normalMap: tex.bricksN, roughness: 0.95 }));
  wall.position.set(0, 17, -12);
  wall.receiveShadow = true;
  scene.add(wall);
  const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.panes, emissive: 0xffffff, emissiveMap: tex.panes, emissiveIntensity: 1.0, roughness: 0.2 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.6, roughness: 0.5 });
  for (let x = -54; x <= 54; x += 12) {
    box(5.2, 8.2, 0.2, frame, x, 18.5, -11.85, false);
    box(4.6, 7.6, 0.2, glow, x, 18.5, -11.7, false);
    box(0.18, 7.6, 0.25, frame, x, 18.5, -11.6, false);
    box(4.6, 0.18, 0.25, frame, x, 18.5, -11.6, false);
  }
  buildDetails(tex, frame);

  // Grosser Schriftzug an der Wand
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshStandardMaterial({ map: signTexture('CAR-SAVER WERK', '#1f2430', '#f1c40f', 1024, 150, 96), roughness: 0.6 }));
  logo.position.set(0, 11.2, -11.7);
  scene.add(logo);

  // Stahlstützen und Dachträger
  const steel = steelMat();
  for (let x = -60; x <= 60; x += 12) box(0.8, 30, 0.8, steel, x + 6, 15, -11.2);
  for (let x = -60; x <= 60; x += 12) box(0.5, 0.9, 30, steel, x + 6, 27, 3, false);
  box(140, 0.9, 0.6, steel, 0, 26, -6, false);

  // Hängelampen
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff2d0, emissiveIntensity: 1.4 });
  for (let x = -30; x <= 30; x += 15) {
    box(0.06, 6, 0.06, frame, x, 23, 0, false);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.9, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x3b4150, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.set(x, 19.7, 0);
    scene.add(shade);
    box(0.9, 0.12, 0.9, lampMat, x, 19.3, 0, false);
  }

  // Einfahrt links (dunkler Tunnel) und Ausgang rechts (grün beleuchtet)
  const dark = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
  box(1.2, 6.5, 8, frame, X(0) - 3.2, 3.25, 0);
  box(6, 0.8, 8, frame, X(0) - 5.6, 6.9, 0);
  box(4, 6.5, 0.2, dark, X(0) - 6, 3.25, -3.9, false);
  const exitGlow = new THREE.MeshStandardMaterial({ color: 0x1f6b3e, emissive: 0x2ecc71, emissiveIntensity: 0.8 });
  box(1.2, 6.8, 8, frame, X(G.W) + 2.8, 3.4, 0);
  box(4, 6.8, 0.2, exitGlow, X(G.W) + 5, 3.4, -3.9, false);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.5, 0.3), [frame, frame, frame, frame,
    new THREE.MeshStandardMaterial({ map: signTexture('AUSGANG ➜', '#2ecc71', '#fff'), emissive: 0xffffff, emissiveMap: signTexture('AUSGANG ➜', '#2ecc71', '#fff'), emissiveIntensity: 0.6 }), frame]);
  sign.position.set(X(G.W) - 3.6, 8.4, 0.5);
  scene.add(sign);

  // Deko: Kisten, Fässer, Paletten an der Wand
  const crate = new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.85 });
  const crates = [[-9.5, 0, -8.5], [-8.1, 0, -8.6], [-8.8, 1.4, -8.5], [7.6, 0, -8.8], [21.5, 0, -8], [-21, 0, -8]];
  for (const [x, y, z] of crates) box(1.4, 1.4, 1.4, crate, x, y + 0.7, z).rotation.y = Math.random() * 0.4;
  const barrelMats = [0xc0392b, 0x1d4ed8, 0x2a9d8f].map(c => new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.45 }));
  for (let i = 0; i < 7; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 20), barrelMats[i % 3]);
    barrel.position.set(i < 4 ? 3.2 + i * 1.05 : 17.6 + (i - 4) * 1.05, 0.65, -8.2 + (i % 2) * 0.6);
    barrel.castShadow = barrel.receiveShadow = true;
    scene.add(barrel);
  }
}

// Wandschmutz, Rohre, Sockel, Lichtstrahlen, Ölflecken, Regal, Gabelstapler und Schilder
function buildDetails(tex, frame) {
  const r = rng(77);
  // Russ und Regenspuren auf dem Backstein (oben dunkler, Streifen unter den Fenstern, unten Strassenschmutz)
  const grime = canvasTexture(1024, 256, (g, w, h) => {
    const top = g.createLinearGradient(0, 0, 0, h);
    top.addColorStop(0, 'rgba(10,8,6,0.55)'); top.addColorStop(0.35, 'rgba(10,8,6,0.12)');
    top.addColorStop(0.85, 'rgba(10,8,6,0.05)'); top.addColorStop(1, 'rgba(25,20,15,0.5)');
    g.fillStyle = top; g.fillRect(0, 0, w, h);
    for (let x = -54; x <= 54; x += 12) { // unter jedem Fenster
      const px = (x + 70) / 140 * w;
      for (let k = 0; k < 9; k++) {
        const sx = px + (r() - 0.5) * 30, len = 30 + r() * 70;
        const st = g.createLinearGradient(0, 105, 0, 105 + len);
        st.addColorStop(0, 'rgba(15,12,10,0.35)'); st.addColorStop(1, 'rgba(15,12,10,0)');
        g.fillStyle = st; g.fillRect(sx, 105, 1.5 + r() * 3, len);
      }
    }
  }, false);
  const grimeMesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 34), new THREE.MeshBasicMaterial({ map: grime, transparent: true, depthWrite: false }));
  grimeMesh.position.set(0, 17, -11.97);
  scene.add(grimeMesh);

  // Betonsockel unten an der Wand
  const plinth = new THREE.MeshStandardMaterial({ color: 0x55605c, roughness: 0.8 });
  box(140, 1.3, 0.35, plinth, 0, 0.65, -11.85, false);
  // Gelbe Gehweg-Linien auf dem Boden
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const z of [-5.4, 5.4]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(140, 0.16), paint);
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.015, z);
    scene.add(l);
  }

  // Rohrleitungen mit Halterungen zwischen Schriftzug und Fenstern, ein Rohr führt zu einem Ventil
  const red = new THREE.MeshStandardMaterial({ color: 0xa8281e, metalness: 0.3, roughness: 0.45 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.35 });
  const pipe = (rad, mat, x0, y0, z0, x1, y1, z1) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, a.distanceTo(b), 14), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    scene.add(m);
  };
  pipe(0.24, grey, -70, 13.7, -11.35, 70, 13.7, -11.35);
  pipe(0.16, red, -70, 14.3, -11.45, 70, 14.3, -11.45);
  for (let x = -66; x <= 66; x += 6) box(0.12, 1.1, 0.5, frame, x, 13.95, -11.6, false);
  pipe(0.16, red, -19.5, 14.3, -11.45, -19.5, 1.6, -11.45);
  pipe(0.3, red, -19.5, 1.6, -11.45, -19.5, 0.8, -11.45);
  box(0.9, 0.12, 0.12, grey, -19.5, 2.1, -11.2, false); // Ventilrad

  // Lichtstrahlen von den Fenstern schräg zum Boden, dort helle Flecken
  const shaftTex = canvasTexture(64, 128, (g, w, h) => {
    const gv = g.createLinearGradient(0, 0, 0, h);
    gv.addColorStop(0, 'rgba(255,255,255,1)'); gv.addColorStop(1, 'rgba(255,255,255,0.15)');
    g.fillStyle = gv; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const gu = g.createLinearGradient(0, 0, w, 0);
    gu.addColorStop(0, 'rgba(0,0,0,0)'); gu.addColorStop(0.25, 'rgba(0,0,0,1)'); gu.addColorStop(0.75, 'rgba(0,0,0,1)'); gu.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gu; g.fillRect(0, 0, w, h);
  }, false);
  const beamMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffe9c4, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const patchMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffe2b0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const dir = new THREE.Vector3(0.32, -0.8, 0.5).normalize();
  for (let x = -42; x <= 42; x += 12) {
    const top = new THREE.Vector3(x, 20.5, -11.6), t = top.y / -dir.y, foot = top.clone().addScaledVector(dir, t);
    const half = 2.3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      top.x - half, top.y, top.z, top.x + half, top.y, top.z, foot.x + half, 0.05, foot.z, foot.x - half, 0.05, foot.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, beamMat));
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.5), patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(foot.x, 0.03, foot.z - 1.5);
    scene.add(patch);
  }

  // Ölflecken auf dem Boden
  const oilTex = canvasTexture(128, 128, (g, w, h) => {
    for (let k = 0; k < 6; k++) {
      const x = 40 + r() * 48, y = 40 + r() * 48, rad = 14 + r() * 26;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, 'rgba(8,8,10,0.55)'); rg.addColorStop(1, 'rgba(8,8,10,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
  }, false);
  const oilMat = new THREE.MeshStandardMaterial({ map: oilTex, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const [x, z, s] of [[-14, -1.5, 3], [-1, 1, 3.5], [13, -0.5, 3], [-5, -7, 2.5], [9, -6.5, 3.5], [-24, 4, 3], [24, -2, 2.5], [4, 7, 2]]) {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(s, s), oilMat);
    o.rotation.set(-Math.PI / 2, 0, r() * 6);
    o.position.set(x, 0.025, z);
    scene.add(o);
  }

  // Hochregal mit Paletten und Kartons links
  const orange = new THREE.MeshStandardMaterial({ color: 0xd9611c, roughness: 0.55, metalness: 0.4 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f4f9c, roughness: 0.5, metalness: 0.4 });
  const carton = new THREE.MeshStandardMaterial({ color: 0xa47b4c, roughness: 0.9 });
  const pallet = new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.9 });
  for (const x of [-24.6, -21.8, -19]) for (const z of [-10.8, -9.4]) box(0.14, 6.4, 0.14, orange, x, 3.2, z, true);
  for (const y of [0.25, 2.25, 4.25]) {
    for (const z of [-10.8, -9.4]) box(5.8, 0.18, 0.12, blue, -21.8, y, z, false);
    for (const x of [-23.2, -20.4]) {
      box(2.4, 0.14, 1.3, pallet, x, y + 0.16, -10.1, false);
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = 0.6 + r() * 0.4, h = 0.5 + r() * 0.6;
        box(w, h, 0.9, carton, x - 0.8 + k * 0.8, y + 0.23 + h / 2, -10.1, true);
      }
    }
  }

  // Gabelstapler, der gerade eine Kiste holt
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.45, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.8 });
  const fl = new THREE.Group();
  const part = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; fl.add(m); };
  part(2.0, 0.9, 1.3, yellow, 0, 0.85, 0);          // Körper
  part(0.7, 1.0, 1.3, yellow, 0.75, 1.45, 0);        // Gegengewicht hinten
  part(0.6, 0.5, 0.8, black, -0.1, 1.55, 0);         // Sitz
  for (const [x, z] of [[-0.75, -0.6], [-0.75, 0.6], [0.55, -0.6], [0.55, 0.6]]) part(0.08, 1.6, 0.08, black, x, 2.05, z); // Schutzdach-Stangen
  part(1.45, 0.08, 1.35, black, -0.1, 2.85, 0);      // Schutzdach
  for (const z of [-0.4, 0.4]) part(0.12, 2.9, 0.12, frame, -1.1, 1.45, z); // Hubmast
  for (const z of [-0.3, 0.3]) part(1.2, 0.06, 0.14, frame, -1.75, 0.5, z);  // Gabeln
  part(0.9, 0.9, 0.9, pallet, -1.75, 0.98, 0);       // Kiste auf der Gabel
  for (const [x, z] of [[-0.6, -0.68], [-0.6, 0.68], [0.65, -0.68], [0.65, 0.68]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16), black);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.38, z);
    fl.add(w);
  }
  fl.position.set(10.4, 0, -7.6);
  fl.rotation.y = 0.35;
  scene.add(fl);

  // Warnschilder an den Stützen und ein Feuerlöscher
  const warn = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#f2c200'; g.strokeStyle = '#111'; g.lineWidth = 8; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(64, 10); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#111'; g.font = '900 64px system-ui'; g.textAlign = 'center'; g.fillText('!', 64, 100);
  }, false);
  const warnMat = new THREE.MeshStandardMaterial({ map: warn, transparent: true, alphaTest: 0.5, roughness: 0.6 });
  for (const x of [-6, 18]) {
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), warnMat);
    sgn.position.set(x, 6, -10.78);
    scene.add(sgn);
  }
  const ext = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.35, metalness: 0.2 });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.75, 14), ext);
  bottle.position.set(-6, 1.5, -10.6);
  scene.add(bottle);
  box(0.1, 0.18, 0.1, black, -6, 1.95, -10.6, false);
}

// ---------- Pressen ----------
const pressViews = [];

function buildPress(tex) {
  const g = new THREE.Group();
  const steel = steelMat();
  const plateW = G.PRESS_W * SX + 0.6;
  const crownBottom = Y(G.PLATE_UP) + G.PLATE_H * SY + 3.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // vier Säulen
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.75, crownBottom + 1.6, 0.75), steel);
    col.position.set(sx * (plateW / 2 + 0.7), (crownBottom + 1.6) / 2, sz * 3.4);
    col.castShadow = col.receiveShadow = true;
    g.add(col);
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(plateW + 2.6, 2.2, 8), steel);
  crown.position.y = crownBottom + 1.1;
  crown.castShadow = true;
  g.add(crown);
  const crownStripe = new THREE.Mesh(new THREE.PlaneGeometry(plateW + 2.6, 0.5), new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.6 }));
  crownStripe.position.set(0, crownBottom + 0.35, 4.01);
  g.add(crownStripe);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.6, 24), new THREE.MeshStandardMaterial({ color: 0x3d4350, metalness: 0.7, roughness: 0.4 }));
  sleeve.position.y = crownBottom - 1.3;
  sleeve.castShadow = true;
  g.add(sleeve);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24), new THREE.MeshStandardMaterial({ color: 0xe4e8ef, metalness: 1, roughness: 0.12 }));
  rod.castShadow = true;
  g.add(rod);
  // Pressplatte mit Warnstreifen vorne
  tex.hazard.repeat.set(4, 1);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x4b5260, metalness: 0.7, roughness: 0.35, emissive: 0x000000 });
  const stripeMat = new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.55, emissive: 0x000000 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, G.PLATE_H * SY, 6.6), [plateMat, plateMat, plateMat, plateMat, stripeMat, plateMat]);
  plate.castShadow = true;
  g.add(plate);
  // Stahlboden unter der Presse und rote Gefahrenzone
  const bed = new THREE.Mesh(new THREE.BoxGeometry(plateW + 1.2, 0.08, 6.6), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.8, roughness: 0.4 }));
  bed.position.y = 0.04;
  bed.receiveShadow = true;
  g.add(bed);
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(plateW, 6.4), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2;
  zone.position.y = 0.1;
  g.add(zone);
  // Warnlampe oben mit Licht
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2ecc71, emissiveIntensity: 1.5 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), lampMat);
  lamp.position.y = crownBottom + 2.75;
  g.add(lamp);
  const light = new THREE.PointLight(0xff2a2a, 0, 26, 1.6);
  light.position.set(0, crownBottom - 0.5, 3);
  g.add(light);
  scene.add(g);
  return { g, rod, plate, plateMat, stripeMat, zone, lampMat, light, crownBottom };
}

const LAMP_COLORS = { idle: 0x2ecc71, rise: 0xf39c12, ice: 0xd9f7ff, water: 0x3b9cff, lift: 0xf6b500, fire: 0xff7b2e, firework: 0xd58bff, time: 0x5eead4 };
const OFF_TINT = { ice: 0x6fc7e8, water: 0x1d4f9a, fire: 0xff6a00, firework: 0x7c3aed, time: 0x0e7490, lift: 0x000000 };

function updatePresses(presses, t) {
  pressViews.forEach((v, i) => {
    const p = presses[i];
    // Unbenutzte Pressen nur verstecken (unter den Boden), nicht ausblenden: so bleibt die Zahl
    // der Lichter gleich und die Grafikkarte muss nichts neu übersetzen
    for (const ch of v.g.children) if (!ch.isLight) ch.visible = !!p;
    if (!p) { v.light.intensity = 0; return; }
    v.g.position.set(X(p.x + G.PRESS_W / 2), 0, 0);
    const bottom = Y(p.y), plateH = G.PLATE_H * SY;
    v.plate.position.y = bottom + plateH / 2;
    const rodTop = v.crownBottom - 2.6, rodBottom = bottom + plateH;
    v.rod.scale.y = Math.max(0.01, rodTop - rodBottom);
    v.rod.position.y = (rodTop + rodBottom) / 2;
    const danger = p.phase === 'warn' || p.phase === 'slam' || p.phase === 'hold';
    const blink = Math.floor(t * 10) % 2 === 0;
    v.lampMat.emissive.setHex(danger ? (blink ? 0xff2a2a : 0x330000) : LAMP_COLORS[p.phase === 'off' ? p.off : p.phase] || 0x2ecc71);
    v.light.intensity = danger && blink ? 60 : 0;
    v.zone.visible = p.phase === 'warn' && Math.floor(t * 8) % 2 === 0;
    const tint = p.phase === 'off' ? OFF_TINT[p.off] : 0x000000;
    v.plateMat.emissive.setHex(tint);
    v.stripeMat.emissive.setHex(tint);
    v.plateMat.emissiveIntensity = v.stripeMat.emissiveIntensity = p.phase === 'off' ? 0.5 : 0;
  });
}

// ---------- Autos, Wracks, Münzen ----------
const carViews = new Map(), wreckViews = new Map(), coinViews = new Map();
let coinGeo, coinMat;

function updateCars(cars, t) {
  for (const c of cars) {
    let m = carViews.get(c);
    if (!m) {
      m = buildCar({ kind: c.kind, color: c.color, special: c.special }, G.KINDS, 24);
      m.userData.lastX = c.x;
      scene.add(m);
      carViews.set(c, m);
    }
    m.position.set(X(c.x + c.w / 2), (c.alt || 0) * SY, 0);
    m.scale.y = c.h / G.KINDS[c.kind].h[1]; // der Jeep wird bei einem Schlag flacher
    m.rotation.z = c.fly ? 0.15 : 0;
    m.visible = !(c.ghost > 0 && Math.floor(t * 12) % 2);
    const spin = (c.x - m.userData.lastX) * SX / 0.35;
    m.userData.lastX = c.x;
    for (const w of m.userData.wheels) w.rotation.z -= spin;
    animateCar(m, t, c.special, c.fly);
  }
  for (const [c, m] of carViews) {
    if (cars.includes(c)) continue;
    scene.remove(m); // Formen gehören der Vorlage in cars3d.js: nicht freigeben
    carViews.delete(c);
  }
}

function updateWrecks(wrecks) {
  for (const wk of wrecks) {
    let m = wreckViews.get(wk);
    if (!m) {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(wk.special ? { gold: '#d4a017', diamond: '#cdefff', obsidian: '#140b20' }[wk.special] || '#e63946' : wk.color), metalness: 0.5, roughness: 0.5, transparent: true });
      m = new THREE.Mesh(new THREE.BoxGeometry(wk.w * SX, 0.35, 1.9), mat);
      m.position.set(X(wk.x + wk.w / 2), 0.18, 0);
      m.rotation.y = (Math.random() - 0.5) * 0.15;
      m.castShadow = true;
      scene.add(m);
      wreckViews.set(wk, m);
    }
    m.material.opacity = Math.min(1, (2.5 - wk.t) / 0.6);
  }
  for (const [wk, m] of wreckViews) {
    if (wrecks.includes(wk)) continue;
    scene.remove(m);
    m.geometry.dispose();
    wreckViews.delete(wk);
  }
}

function coinWorld(k) {
  return tmp.set(X(k.x), Math.max(0.5, (G.COIN_GROUND - k.y) * SY + 0.5), COIN_Z);
}

function updateCoins(coins, t) {
  for (const k of coins) {
    let m = coinViews.get(k);
    if (!m) {
      m = new THREE.Mesh(coinGeo, coinMat);
      m.castShadow = true;
      scene.add(m);
      coinViews.set(k, m);
    }
    m.position.copy(coinWorld(k));
    m.rotation.set(Math.PI / 2, 0, t * 4 + k.seed);
    m.visible = !(k.landed && k.t > 3.5 && Math.floor(k.t * 8) % 2 === 0);
  }
  for (const [k, m] of coinViews) {
    if (coins.includes(k)) continue;
    scene.remove(m);
    coinViews.delete(k);
  }
}

// ---------- Öffentliche Schnittstelle ----------
export function init(consts) {
  G = consts;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const el = renderer.domElement;
  el.style.position = 'absolute';
  el.style.transformOrigin = 'center center';
  el.style.display = 'none';
  G.canvas.parentNode.insertBefore(el, G.canvas); // liegt unter dem 2D-Canvas

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2028);
  scene.fog = new THREE.Fog(0x1d2028, 70, 140);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  camera = new THREE.PerspectiveCamera(30, G.W / G.H, 0.5, 400);
  camera.position.copy(CAM);
  camera.lookAt(LOOK);
  camera.updateMatrixWorld();

  scene.add(new THREE.HemisphereLight(0xe6edf8, 0x4a4238, 1.1));
  sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-18, 34, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 24, bottom: -18, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  G.tex = makeTextures();
  buildHall(G.tex);
  const hall = new THREE.Group(); // die ganze Halle ist unbewegt: zu wenigen Stücken verschmelzen
  for (const o of [...scene.children]) if (o.isMesh) hall.add(o);
  scene.add(hall);
  mergeStatic(hall);
  dustCloud = dust({ count: 420, box: [-26, 0.4, -10, 26, 21, 6], size: 0.14, opacity: 0.4 });
  scene.add(dustCloud);
  coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.09, 28);
  coinMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.22, emissive: 0x5a3d00, emissiveIntensity: 0.4 });
  quality = makeQuality(renderer, () => lastLayout && layout(...lastLayout));
  // Halle, Pressen, Münze und Wrack vorab an die Grafikkarte schicken
  const extras = [new THREE.Mesh(coinGeo, coinMat), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ transparent: true }))];
  extras.forEach(m => { m.position.y = -20; scene.add(m); });
  for (let i = 0; i < 3; i++) { // höchstens drei Pressen: alle gleich bauen
    const v = buildPress(G.tex);
    v.g.position.y = -100;
    pressViews.push(v);
  }
  warmUp(renderer, scene, camera);
  window.__press3d = () => ({ scene, renderer }); // für Tests im Browser
  extras.forEach(m => scene.remove(m));
}

// Vor einer Runde: die Fahrzeuge dieser Runde schon einmal bauen und an die Grafikkarte schicken,
// damit es beim Erscheinen nicht ruckelt
export function prepare(vehicles) {
  const tmp = vehicles.map(v => {
    const m = buildCar({ kind: v.kind, color: v.color, special: v.special }, G.KINDS, 24);
    m.position.y = -20;
    scene.add(m);
    return m;
  });
  warmUp(renderer, scene, camera);
  tmp.forEach(m => scene.remove(m));
}

// Lage und Grösse wie der 2D-Canvas (inklusive Drehung im Hochformat)
export function layout(cssW, cssH, left, top, transform) {
  lastLayout = [cssW, cssH, left, top, transform];
  const st = renderer.domElement.style;
  st.width = cssW + 'px'; st.height = cssH + 'px';
  st.left = left + 'px'; st.top = top + 'px';
  st.transform = transform;
  renderer.setSize(Math.round(cssW), Math.round(cssH), false);
}

export function setVisible(on) {
  renderer.domElement.style.display = on ? 'block' : 'none';
}

export function render({ cars, presses, wrecks, coins, time, shake }) {
  const now = performance.now();
  if (lastFrame) quality((now - lastFrame) / 1000);
  dustCloud.userData.update(Math.min(0.1, lastFrame ? (now - lastFrame) / 1000 : 0));
  lastFrame = now;
  setVisible(true);
  updatePresses(presses, time);
  updateCars(cars, time);
  updateWrecks(wrecks);
  updateCoins(coins, time);
  camera.position.set(CAM.x + (Math.random() - 0.5) * shake * 0.03, CAM.y + (Math.random() - 0.5) * shake * 0.03, CAM.z);
  camera.lookAt(LOOK);
  renderer.render(scene, camera);
}

// 2D-Spielkoordinaten → Bildschirmposition im 2D-Canvas (für Texte, Symbole und Antippen)
export function project(lx, ly) {
  tmp.set(X(lx), Y(ly), 0).project(camera);
  return { x: (tmp.x + 1) / 2 * G.W, y: (1 - tmp.y) / 2 * G.H };
}

export function projectCoin(k) {
  coinWorld(k).project(camera);
  return { x: (tmp.x + 1) / 2 * G.W, y: (1 - tmp.y) / 2 * G.H };
}

// Höhe der Warnlampe als 2D-Koordinate (für den Countdown-Ring)
export function lampY() {
  return G.ROAD_Y - (Y(G.PLATE_UP) + G.PLATE_H * SY + 3.2 + 2.75) / SY;
}

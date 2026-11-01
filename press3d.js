// Presse in 3D: eine Fabrikhalle mit hydraulischen Pressen (three.js).
// Die Spiellogik bleibt in game.js (2D-Koordinaten); hier wird sie nur in 3D gezeichnet.
// Wird beim Start geladen; ohne Internet bleibt die Presse in 2D.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar } from './cars3d.js';

let G = null;        // Spielkonstanten aus game.js
let renderer, scene, camera, sun;
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

function speckle(g, w, h, base, spots, count) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    g.fillStyle = spots[i % spots.length];
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function makeTextures() {
  return {
    concrete: canvasTexture(512, 512, (g, w, h) => {
      speckle(g, w, h, '#8b8e93', ['#93969b', '#83868b', '#7c7f84', '#9a9da2'], 30000);
      g.globalAlpha = 0.12; // Flecken
      for (let i = 0; i < 14; i++) {
        g.fillStyle = '#4a4d52';
        g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 10 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(40,40,45,0.5)'; // Fugen der Bodenplatten
      g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
    }),
    lane: canvasTexture(256, 256, (g, w, h) => speckle(g, w, h, '#3d4046', ['#44474d', '#36393e', '#4a4d53'], 9000)),
    bricks: canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#6f645b';
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < h / 32; row++) {
        for (let col = -1; col < w / 64 + 1; col++) {
          const x = col * 64 + (row % 2) * 32, y = row * 32;
          const l = 32 + Math.random() * 10;
          g.fillStyle = `hsl(${10 + Math.random() * 8}, ${35 + Math.random() * 15}%, ${l}%)`;
          g.fillRect(x + 2, y + 2, 60, 28);
        }
      }
    }),
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
  tex.concrete.repeat.set(20, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  tex.lane.repeat.set(30, 2);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(90, 6), new THREE.MeshStandardMaterial({ map: tex.lane, roughness: 0.85 }));
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
  tex.bricks.repeat.set(14, 5);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 34), new THREE.MeshStandardMaterial({ map: tex.bricks, roughness: 0.95 }));
  wall.position.set(0, 17, -12);
  wall.receiveShadow = true;
  scene.add(wall);
  const glow = new THREE.MeshStandardMaterial({ color: 0xbcd6f0, emissive: 0xd8ecff, emissiveIntensity: 0.9, roughness: 0.2 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.6, roughness: 0.5 });
  for (let x = -54; x <= 54; x += 12) {
    box(5.2, 8.2, 0.2, frame, x, 18.5, -11.85, false);
    box(4.6, 7.6, 0.2, glow, x, 18.5, -11.7, false);
    box(0.18, 7.6, 0.25, frame, x, 18.5, -11.6, false);
    box(4.6, 0.18, 0.25, frame, x, 18.5, -11.6, false);
  }
  // Grosser Schriftzug an der Wand
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshStandardMaterial({ map: signTexture('AUTO-RETTER WERK', '#1f2430', '#f1c40f', 1024, 150, 96), roughness: 0.6 }));
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
  while (pressViews.length < presses.length) pressViews.push(buildPress(G.tex));
  pressViews.forEach((v, i) => {
    const p = presses[i];
    v.g.visible = !!p;
    if (!p) return;
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
    scene.remove(m);
    m.traverse(o => o.geometry && o.geometry.dispose());
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 24, bottom: -18, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  G.tex = makeTextures();
  buildHall(G.tex);
  coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.09, 28);
  coinMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.22, emissive: 0x5a3d00, emissiveIntensity: 0.4 });
}

// Lage und Grösse wie der 2D-Canvas (inklusive Drehung im Hochformat)
export function layout(cssW, cssH, left, top, transform) {
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

// 3D-Fahrzeuge für Rennstrecke und Presse (three.js).
// Jedes Fahrzeug hat eine eigene Bauanleitung (BUILD), angelehnt an seine 2D-Zeichnung in game.js.
// Koordinaten: Länge entlang +X (vorne), Höhe Y, Breite Z (rechte Seite = +Z), Meter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

// Seitenprofile: Anteile von Länge und Höhe (hinten → vorne); Kabine = [hinten unten, hinten oben, vorne oben, vorne unten, unten, oben]
const PROFILE = {
  sedan: { body: [[0, .22], [0, .48], [.03, .56], [.12, .59], [.8, .58], [.93, .55], [.99, .47], [1, .3], [.98, .22]], cabin: [.2, .3, .64, .8, .56, .96], width: 1.85 },
  compact: { body: [[0, .22], [0, .56], [.1, .6], [.9, .58], [1, .46], [1, .22]], cabin: [.08, .14, .6, .78, .57, .97], width: 1.75, twoDoor: true },
  kombi: { body: [[0, .22], [0, .52], [.04, .58], [.86, .58], [.97, .52], [1, .32], [.98, .22]], cabin: [.03, .06, .66, .8, .56, .96], width: 1.85 },
  sport: { body: [[0, .2], [0, .48], [.05, .55], [.3, .57], [.72, .5], [.92, .4], [1, .3], [1, .2]], cabin: [.3, .42, .6, .78, .51, .86], width: 1.95, twoDoor: true },
  suv: { body: [[0, .26], [0, .58], [.82, .58], [1, .5], [1, .26]], cabin: [.05, .08, .7, .82, .56, .97], width: 1.95 },
  pickup: { body: [[0, .26], [0, .56], [1, .54], [1, .26]], cabin: [.52, .54, .74, .86, .54, .97], width: 1.95 },
  box: { body: [[0, .18], [0, 1], [.74, 1], [.76, .74], [.9, .72], [1, .46], [1, .18]], glass: [[.77, .7], [.89, .68], [.97, .48], [.77, .48]], width: 2.25, tall: true },
  bus: { body: [[0, .14], [0, 1], [1, 1], [1, .14]], glass: [[.03, .56], [.03, .9], [.97, .9], [.97, .56]], width: 2.45, tall: true },
  hatch: { body: [[0, .22], [0, .58], [.05, .62], [.86, .58], [1, .46], [1, .22]], cabin: [.04, .1, .62, .8, .58, .98], width: 1.75 },
  coupe: { body: [[0, .22], [0, .5], [.05, .56], [.75, .56], [.93, .5], [1, .32], [.98, .22]], cabin: [.2, .38, .6, .76, .54, .9], width: 1.85, twoDoor: true },
  microbus: { body: [[0, .16], [0, .88], [.05, 1], [.9, 1], [1, .86], [1, .16]], glass: [[.03, .62], [.04, .9], [.95, .9], [.99, .62]], width: 2.0, tall: true },
};

// Lava: dunkles Gestein mit glühenden Rissen (einmal gezeichnet, für alle Lava-Autos)
let lavaTex = null;
function lavaTexture() {
  if (lavaTex) return lavaTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1c0d08'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ff6a00'; g.lineCap = 'round';
  for (let k = 0; k < 26; k++) { // Risse: Zickzack-Linien
    let x = Math.random() * 256, y = Math.random() * 256;
    g.lineWidth = 1.5 + Math.random() * 3;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 6; i++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  lavaTex = new THREE.CanvasTexture(c);
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  return lavaTex;
}

function paintMaterial(v) {
  const base = { clearcoat: 1, clearcoatRoughness: 0.06 };
  const finish = v.tune && v.tune.finish; // Tuning-Lack geht vor
  if (finish === 'chrome') return new THREE.MeshPhysicalMaterial({ ...base, color: 0xf2f4f8, metalness: 0.85, roughness: 0.16, envMapIntensity: 1.6 });
  if (finish === 'neon') {
    const col = new THREE.Color((v.tune && v.tune.neon) || '#39ff14');
    return new THREE.MeshPhysicalMaterial({ ...base, color: col, emissive: col, emissiveIntensity: 0.75, metalness: 0.2, roughness: 0.3 });
  }
  if (finish === 'lava') return new THREE.MeshPhysicalMaterial({ ...base, color: 0xffffff, map: lavaTexture(), emissive: 0xffffff,
    emissiveMap: lavaTexture(), emissiveIntensity: 1.1, metalness: 0.1, roughness: 0.7 });
  switch (v.special) {
    case 'gold': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xffc83d, metalness: 0.9, roughness: 0.26, emissive: 0x3a2600, emissiveIntensity: 0.6 });
    case 'diamond': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xcdefff, metalness: 0.2, roughness: 0.03, iridescence: 1, iridescenceIOR: 1.8 });
    case 'obsidian': return new THREE.MeshPhysicalMaterial({ ...base, color: 0x120a1c, metalness: 0.7, roughness: 0.12, emissive: 0x2a0f45, emissiveIntensity: 0.35 });
    case 'rainbow': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xff0000, metalness: 0.4, roughness: 0.25 });
    default: return new THREE.MeshPhysicalMaterial({ ...base, color: new THREE.Color(v.color), metalness: 0.45, roughness: 0.32 });
  }
}

const MAT = {};
function shared() {
  if (MAT.glass) return MAT;
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0x1e2a36, metalness: 0.35, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 });
  MAT.tyre = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.92, side: THREE.DoubleSide });
  MAT.rim = new THREE.MeshStandardMaterial({ color: 0xd3d8e0, metalness: 1, roughness: 0.22 });
  MAT.rimDark = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.6, roughness: 0.5 });
  MAT.plate = new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.4 });
  MAT.shadow = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: 0x1f2026, roughness: 0.6 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0x8a919e, metalness: 0.8, roughness: 0.35 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.12 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 1.2 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.9 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0xa0703c, roughness: 0.85 });
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.22 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  MAT.glassClear = new THREE.MeshPhysicalMaterial({ color: 0x1c2a38, metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.42,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4, depthWrite: false });
  MAT.glassTint = new THREE.MeshPhysicalMaterial({ color: 0x0b1016, metalness: 0.4, roughness: 0.04, transparent: true, opacity: 0.86,
    clearcoat: 1, envMapIntensity: 2.2, depthWrite: false });
  // Innenverkleidung: bekommt drinnen kaum Sonne, darum leuchtet sie etwas von selbst
  MAT.cabinIn = new THREE.MeshStandardMaterial({ color: 0xa9abb0, emissive: 0x5a5c61, roughness: 0.9, side: THREE.BackSide });
  MAT.cabinInDark = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, emissive: 0x1c1d20, roughness: 0.7, side: THREE.BackSide });
  MAT.seam = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.6 });
  MAT.seat = new THREE.MeshStandardMaterial({ color: 0x232428, roughness: 0.7 });
  MAT.trim = new THREE.MeshStandardMaterial({ color: 0x1d1e22, emissive: 0x0d0e10, roughness: 0.55 });
  MAT.headliner = new THREE.MeshStandardMaterial({ color: 0xa9abb0, emissive: 0x5a5c61, roughness: 0.9 });
  MAT.tyreReal = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tyreTexture(), bumpMap: tyreTexture(), bumpScale: 3, roughness: 0.9, side: THREE.DoubleSide });
  MAT.barrel = new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  MAT.disc = new THREE.MeshStandardMaterial({ color: 0x9a9fa6, metalness: 0.9, roughness: 0.38 });
  return MAT;
}
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts });

// Schweizer Nummernschild: weiss, schwarze Schrift, kleines Wappen
function plateTexture(text = 'AR 2026') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 256, 56);
  g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 50);
  g.fillStyle = '#d52b1e'; g.fillRect(14, 12, 30, 32);
  g.fillStyle = '#fff'; g.fillRect(25, 17, 8, 22); g.fillRect(18, 24, 22, 8);
  g.fillStyle = '#111'; g.font = 'bold 38px system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText(text, 56, 30, 192);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Weicher Schatten direkt unter dem Fahrzeug (macht es "schwer" und steht fest auf dem Boden)
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.55, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Ecken eines Umrisses abrunden (wie gepresstes Blech): rad in Metern
function roundPoly(pts, rad, seg = 3) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    if (la < 1e-6 || lb < 1e-6) continue;
    const d = Math.min(rad, la / 2.2, lb / 2.2);
    const st = [p[0] + (a[0] - p[0]) / la * d, p[1] + (a[1] - p[1]) / la * d];
    const en = [p[0] + (b[0] - p[0]) / lb * d, p[1] + (b[1] - p[1]) / lb * d];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, u = 1 - t;
      out.push([u * u * st[0] + 2 * u * t * p[0] + t * t * en[0], u * u * st[1] + 2 * u * t * p[1] + t * t * en[1]]);
    }
  }
  return out;
}
// Vorderste (front) oder hinterste Stelle eines Umrisses auf Höhe y
function edgeAt(pts, y, front) {
  let best = front ? -Infinity : Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    const x = ax + (bx - ax) * (y - ay) / (by - ay);
    best = front ? Math.max(best, x) : Math.min(best, x);
  }
  return best;
}

function extrude(points, depth, material, bevel = 0.14) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 4, steps: 1, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

// Rad: Reifen mit runder Flanke, dunkles Felgenbett, glänzende Speichen mit Felgenhorn und Nabendeckel.
// Die Formen werden je Grösse nur einmal gebaut.
const wheelGeos = new Map();
function wheelGeometry(r, w, spokes) {
  const key = r.toFixed(3) + '|' + w.toFixed(3) + '|' + spokes;
  let g = wheelGeos.get(key);
  if (g) return g;
  const inner = r * 0.66, sh = Math.min(0.08, w * 0.25);
  const prof = [[inner, -w / 2], [r - sh, -w / 2], [r - sh * 0.25, -w / 2 + sh * 0.35], [r, -w / 2 + sh], [r, w / 2 - sh],
    [r - sh * 0.25, w / 2 - sh * 0.35], [r - sh, w / 2], [inner, w / 2]].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.LatheGeometry(prof, 30).rotateX(PI / 2);
  const dark = new THREE.CylinderGeometry(r * 0.66, r * 0.66, w * 0.94, 24).rotateX(PI / 2);
  const bright = [];
  for (const sg of [-1, 1]) {
    bright.push(new THREE.TorusGeometry(r * 0.63, r * 0.045, 6, 28).translate(0, 0, sg * w * 0.47));
    for (let i = 0; i < spokes; i++) {
      bright.push(new THREE.BoxGeometry(r * 0.56, r * (spokes > 6 ? 0.06 : 0.13), 0.04).translate(r * 0.31, 0, 0)
        .rotateZ(i / spokes * PI * 2).translate(0, 0, sg * w * 0.475));
    }
    bright.push(new THREE.CylinderGeometry(r * 0.15, r * 0.18, 0.05, 14).rotateX(PI / 2).translate(0, 0, sg * w * 0.49));
  }
  g = { tyre, dark, bright: mergeGeometries(bright) };
  wheelGeos.set(key, g);
  return g;
}

// Reifen mit Profil: drei Längsrillen und schräge Lamellen auf der Lauffläche, Flanke mit feinem Ring
let tyreTex = null;
function tyreTexture() {
  if (tyreTex) return tyreTex;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, 1024, 224);
  const t0 = 224 * (1 - 4 / 7), t1 = 224 * (1 - 3 / 7); // Lauffläche (zwischen Punkt 3 und 4 des Reifenprofils)
  g.fillStyle = '#202123'; g.fillRect(0, t0, 1024, t1 - t0);
  g.fillStyle = '#0b0b0c';
  for (const f of [0.25, 0.5, 0.75]) g.fillRect(0, t0 + (t1 - t0) * f - 2, 1024, 4);
  g.strokeStyle = '#0d0d0e'; g.lineWidth = 3;
  for (let x = 0; x < 1024; x += 16) { g.beginPath(); g.moveTo(x, t0); g.lineTo(x + 8, t1); g.stroke(); }
  g.fillStyle = '#36373b'; // Ring auf der Flanke
  g.fillRect(0, 224 * (1 - 1.5 / 7) - 2, 1024, 3); g.fillRect(0, 224 * (1 - 5.5 / 7) - 2, 1024, 3);
  tyreTex = new THREE.CanvasTexture(c);
  tyreTex.colorSpace = THREE.SRGBColorSpace;
  tyreTex.anisotropy = 4;
  return tyreTex;
}
// Echtes Rad: flacher Reifen, Doppelspeichen-Felge mit Radmuttern; dahinter sieht man die Bremsscheibe
const realWheelGeos = new Map();
function realWheelGeometry(r, w) {
  const key = r.toFixed(3) + '|' + w.toFixed(3);
  let g = realWheelGeos.get(key);
  if (g) return g;
  const inner = r * 0.72, sh = Math.min(0.07, w * 0.22);
  const prof = [[inner, -w / 2], [r - sh, -w / 2 - 0.005], [r - sh * 0.2, -w / 2 + sh * 0.4], [r, -w / 2 + sh], [r, w / 2 - sh],
    [r - sh * 0.2, w / 2 - sh * 0.4], [r - sh, w / 2 + 0.005], [inner, w / 2]].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.LatheGeometry(prof, 36).rotateX(PI / 2);
  const dark = mergeGeometries([
    new THREE.CylinderGeometry(inner * 0.97, inner * 0.97, w * 0.9, 28, 1, true).rotateX(PI / 2), // Felgenbett
    new THREE.CylinderGeometry(r * 0.12, r * 0.12, w * 0.9, 12).rotateX(PI / 2), // Nabe
  ]);
  const disc = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.03, 28).rotateX(PI / 2);
  const bright = [];
  for (const sg of [-1, 1]) {
    const zf = sg * w * 0.44;
    bright.push(new THREE.TorusGeometry(inner * 0.98, r * 0.035, 6, 32).translate(0, 0, sg * w * 0.47)); // Felgenhorn
    for (let i = 0; i < 5; i++) for (const off of [-0.13, 0.13]) { // Doppelspeichen
      bright.push(new THREE.BoxGeometry(inner * 0.86, r * 0.07, 0.035).translate(inner * 0.53, 0, 0)
        .rotateZ(i / 5 * PI * 2 + off * (1 - 0.3)).translate(0, 0, zf));
    }
    bright.push(new THREE.CylinderGeometry(r * 0.17, r * 0.19, 0.05, 20).rotateX(PI / 2).translate(0, 0, zf + sg * 0.01)); // Nabendeckel
    for (let i = 0; i < 5; i++) { // Radmuttern
      const a = i / 5 * PI * 2 + PI / 5;
      bright.push(new THREE.CylinderGeometry(r * 0.025, r * 0.025, 0.03, 8).rotateX(PI / 2).translate(Math.cos(a) * r * 0.11, Math.sin(a) * r * 0.11, zf + sg * 0.035));
    }
  }
  g = { tyre, dark, disc, bright: mergeGeometries(bright) };
  realWheelGeos.set(key, g);
  return g;
}

function realWheel(r, width, parent, x, z, rimMat, caliper) {
  const M = shared();
  const G = realWheelGeometry(r, width);
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(G.tyre, M.tyreReal);
  tyre.castShadow = true;
  g.add(tyre, new THREE.Mesh(G.dark, M.barrel), new THREE.Mesh(G.disc, M.disc), new THREE.Mesh(G.bright, rimMat || M.rim));
  g.position.set(x, r, z);
  g.name = 'wheel';
  parent.add(g);
  // Bremssattel: dreht sich nicht mit, sitzt oben hinten über der Scheibe
  const cal = new THREE.Mesh(new THREE.TorusGeometry(r * 0.46, r * 0.075, 6, 8, 0.8), caliper);
  cal.scale.z = 1.6;
  cal.rotation.z = PI * 0.55;
  cal.position.set(x, r, z);
  cal.name = 'caliper';
  parent.add(cal);
  return g;
}

function wheel(r, width, parent, x, z, rimMat, spokes) {
  const M = shared();
  const G = wheelGeometry(r, width, spokes || (rimMat ? 8 : 5));
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(G.tyre, M.tyre);
  tyre.castShadow = true;
  g.add(tyre, new THREE.Mesh(G.dark, M.rimDark), new THREE.Mesh(G.bright, rimMat || M.rim));
  g.position.set(x, r, z);
  g.name = 'wheel';
  parent.add(g);
  return g;
}

// Werkzeugkasten zum Bauen: Teile werden am Fahrzeugkörper angebracht
function kit(v, kinds, hDiv, spec) {
  const k = kinds[v.kind], shM = shared(), tune = v.tune || {};
  // eigenes Nummernschild (Tuning): nur für dieses Auto ein eigenes Material
  const M = tune.plate ? { ...shM, plate: new THREE.MeshStandardMaterial({ map: plateTexture(tune.plate), roughness: 0.4 }) } : shM;
  const tall = spec.tall || (PROFILE[spec.arch] && PROFILE[spec.arch].tall);
  const C = {
    v, k, M, L: k.w[1] / 22, H: k.h[1] / (hDiv || (tall ? 20 : 27)), W: spec.width || (PROFILE[spec.arch] || {}).width || 1.85,
    r: (k.wheel || 11) * 0.032, group: new THREE.Group(), body: new THREE.Group(), wheels: [], axles: [], paint: paintMaterial(v),
  };
  C.body.name = 'body';
  C.group.add(C.body);
  C.X = f => f * C.L - C.L / 2;
  C.add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; C.body.add(m); return m; };
  C.box = (w, h, d, m, x, y, z) => C.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
  C.cyl = (r1, r2, len, m, x, y, z, rot = [0, 0, 0], seg = 20) => {
    const o = C.add(new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m), x, y, z);
    o.rotation.set(...rot);
    return o;
  };
  C.sph = (r, m, x, y, z, s = [1, 1, 1], part) => {
    const geo = part === 'top' ? new THREE.SphereGeometry(r, 32, 16, 0, PI * 2, 0, PI / 2) : new THREE.SphereGeometry(r, 28, 18);
    const o = C.add(new THREE.Mesh(geo, m), x, y, z);
    o.scale.set(...s);
    return o;
  };
  C.ext = (pts, depth, m, bevel = 0.14, z = 0) => { const o = extrude(pts, depth, m, bevel); o.position.z = z; C.body.add(o); return o; };
  C.wheelPair = (x, r = C.r, w = 0.32, rimMat, spokes) => {
    C.axles.push([x, r]);
    for (const s of [-1, 1]) {
      const z = s * (C.W / 2 - w / 2 + (C.wheelOut ?? 0.04));
      C.wheels.push(C.caliper ? realWheel(r, w, C.group, x, z, rimMat, C.caliper) : wheel(r, w, C.group, x, z, rimMat, spokes));
    }
  };
  // Aufkleber auf beiden Seiten (paint zeichnet auf ein Canvas der Grösse cw × ch)
  C.decal = (w, h, x, y, paint, zExtra = 0) => {
    const cw = Math.min(1024, Math.max(64, Math.round(w * 140))), ch = Math.max(16, Math.round(cw * h / w));
    const cvs = document.createElement('canvas');
    cvs.width = cw; cvs.height = ch;
    paint(cvs.getContext('2d'), cw, ch);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [1, -1]) {
      if (C.surfZ) { // echte Karosserie: Aufkleber schmiegt sich an die gewölbte Seite
        const geo = new THREE.PlaneGeometry(w, h, Math.max(2, Math.round(w / 0.08)), Math.max(1, Math.round(h / 0.08)));
        if (s < 0) geo.rotateY(PI);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i) + x, py = pos.getY(i) + y, sz = C.surfZ(px, py);
          if (sz > 0) pos.setXYZ(i, px, py, s * (sz + Math.max(0.006, 0.016 + zExtra)));
          else pos.setXYZ(i, px, (C.side ? C.side.bottom : 0) + 0.25, 0); // ausserhalb der Karosserie: nach innen, unsichtbar
        }
        geo.computeVertexNormals();
        C.body.add(new THREE.Mesh(geo, m));
        continue;
      }
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(x, y, s * (C.W / 2 + 0.015 + zExtra));
      p.rotation.y = s > 0 ? 0 : PI;
      C.body.add(p);
    }
  };
  // Scheinwerfer mit Chromrand, Rücklichter mit dunklem Gehäuse
  C.lights = (front, rear, y, yRear = y, inset = 0.35) => {
    for (const s of [-1, 1]) {
      C.box(0.06, 0.2, 0.44, M.chrome, front - 0.02, y, s * (C.W / 2 - inset));
      C.box(0.06, 0.15, 0.36, M.head, front, y, s * (C.W / 2 - inset));
      C.box(0.06, 0.17, 0.48, M.dark, rear + 0.015, yRear, s * (C.W / 2 - inset + 0.03));
      C.box(0.06, 0.12, 0.42, M.tail, rear, yRear, s * (C.W / 2 - inset + 0.03));
    }
  };
  C.blueLights = (x, y, spread = 0.3) => {
    for (const s of [-1, 1]) {
      const l = C.box(0.32, 0.16, 0.42, new THREE.MeshStandardMaterial({ color: 0x0b1a40, emissive: 0x2f6bff, emissiveIntensity: 0 }), x, y, s * spread);
      l.userData.blink = s;
    }
  };
  return C;
}

// ---------- Echte Karosserien ----------
// Die Form entsteht aus vielen Querschnitten entlang der Länge (wie die Spanten beim Modellbau):
// runde Nase und rundes Heck von oben gesehen, echte Radkästen, Kotflügel über den Rädern, Kabine mit Säulen.
// x: Anteil der Länge (hinten 0 → vorne 1), y: Anteil der Höhe H.
// top/bot: Ober- und Unterkante des Unterbaus, gh: Kabine [hinten unten, hinten oben, vorne oben, vorne unten],
// roof: Dachhöhe, pf/pr: wie rund Nase/Heck von oben sind (klein = runder), cp: Bereich mit Blech statt Seitenfenster
// (C-/D-Säule), posts: schmale Säulen [Mitte, Breite, 'dark'|'paint'].
const REAL = {
  sedan: { top: [[0, .42], [.015, .52], [.05, .57], [.16, .59], [.45, .6], [.74, .585], [.85, .56], [.95, .52], [1, .43]],
    bot: [[0, .24], [.04, .13], [.08, .1], [.92, .1], [.97, .14], [1, .24]], axles: [.2, .79], gh: [.15, .36, .58, .74], roof: .93,
    pf: 4.5, pr: 5, cp: [.15, .31], posts: [[.5, .02, 'dark']] },
  compact: { top: [[0, .45], [.015, .58], [.05, .62], [.72, .61], [.86, .58], [.96, .53], [1, .44]],
    bot: [[0, .24], [.04, .12], [.96, .12], [1, .24]], axles: [.16, .82], gh: [.03, .12, .53, .72], roof: .95,
    pf: 4, pr: 6, cp: [.03, .17], posts: [[.44, .02, 'dark']], twoDoor: true },
  kombi: { top: [[0, .44], [.012, .58], [.04, .6], [.7, .6], [.85, .57], [.95, .53], [1, .43]],
    bot: [[0, .24], [.04, .13], [.08, .1], [.92, .1], [.97, .14], [1, .24]], axles: [.18, .8], gh: [.025, .05, .57, .73], roof: .92,
    pf: 4.5, pr: 7, cp: [.025, .075], posts: [[.26, .02, 'dark'], [.48, .02, 'dark']] },
  sport: { top: [[0, .44], [.02, .54], [.08, .58], [.28, .59], [.72, .57], [.84, .56], [.95, .48], [1, .36]],
    bot: [[0, .22], [.04, .1], [.95, .1], [1, .2]], axles: [.18, .81], gh: [.2, .44, .58, .73], roof: .9,
    pf: 3.2, pr: 4.5, cp: [.2, .38], posts: [], twoDoor: true, redCaliper: true },
  coupe: { top: [[0, .43], [.02, .53], [.06, .565], [.2, .575], [.72, .56], [.86, .53], [.96, .48], [1, .4]],
    bot: [[0, .24], [.04, .13], [.08, .1], [.92, .1], [.97, .14], [1, .24]], axles: [.19, .8], gh: [.18, .4, .58, .73], roof: .88,
    pf: 4, pr: 5, cp: [.18, .34], posts: [], twoDoor: true, redCaliper: true },
  suv: { top: [[0, .44], [.012, .6], [.04, .62], [.74, .62], [.88, .6], [.96, .55], [1, .46]],
    bot: [[0, .26], [.04, .18], [.96, .18], [1, .26]], axles: [.18, .81], gh: [.025, .05, .62, .76], roof: .95,
    pf: 5, pr: 7, cp: [.025, .08], posts: [[.28, .02, 'dark'], [.5, .02, 'dark']], clad: true },
  hatch: { top: [[0, .45], [.015, .58], [.05, .61], [.72, .6], [.86, .57], [.96, .52], [1, .43]],
    bot: [[0, .24], [.04, .12], [.96, .12], [1, .24]], axles: [.17, .81], gh: [.04, .13, .58, .73], roof: .94,
    pf: 4, pr: 6, cp: [.04, .18], posts: [[.45, .02, 'dark']] },
  pickup: { top: [[0, .5], [.01, .56], [.5, .565], [.52, .57], [.82, .565], [.92, .55], [.98, .5], [1, .42]],
    bot: [[0, .26], [.03, .17], [.97, .17], [1, .26]], axles: [.18, .82], gh: [.5, .53, .71, .82], roof: .95,
    pf: 6, pr: 9, cp: [.5, .535], posts: [[.62, .02, 'dark']], bed: [.025, .48], clad: true },
};

// Glatte Linie durch Punkte [x, y] (0…1): erst gerade Stücke, dann mehrmals weichgezeichnet
function smoothLine(pts, n = 200) {
  const ys = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    let k = 0;
    while (k < pts.length - 2 && pts[k + 1][0] < x) k++;
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    ys.push(y0 + (y1 - y0) * Math.min(1, Math.max(0, (x - x0) / (x1 - x0 || 1))));
  }
  for (let pass = 0; pass < 4; pass++) for (let i = 1; i < n; i++) ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
  return f => { const t = Math.min(n, Math.max(0, f * n)), i = Math.min(n - 1, Math.floor(t)); return ys[i] + (ys[i + 1] - ys[i]) * (t - i); };
}
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

// Fläche aus Querschnitten: rows = Liste von Punktreihen (alle gleich lang); matOf(i, j) wählt für jedes Viereck
// das Material (0 … nMat-1). Gibt je Material eine eigene Form zurück (mit gemeinsamen, weichen Normalen).
function loftGeos(rows, closed, nMat, matOf) {
  const n = rows.length, m = rows[0].length, pos = [], uv = [], idx = Array.from({ length: nMat }, () => []);
  rows.forEach((row, i) => row.forEach(([x, y, z], j) => { pos.push(x, y, z); uv.push(i / (n - 1), j / (m - 1)); }));
  const segs = closed ? m : m - 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * m + j, b = i * m + (j + 1) % m, c = a + m, d = b + m;
    idx[matOf(i, j)].push(a, c, b, b, c, d);
  }
  const full = new THREE.BufferGeometry();
  full.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  full.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  full.setIndex(idx.flat());
  full.computeVertexNormals();
  return idx.map(ix => {
    if (!ix.length) return null;
    const g = new THREE.BufferGeometry();
    for (const a of ['position', 'normal', 'uv']) g.setAttribute(a, full.attributes[a]);
    g.setIndex(ix);
    return g;
  });
}
function loftMeshes(geos, mats) {
  return geos.map((g, k) => {
    if (!g) return null;
    const o = new THREE.Mesh(g, mats[k]);
    o.castShadow = true; o.receiveShadow = true;
    o.userData.whole = true; // grosse Teile nicht mit mergeStatic zerlegen (bleiben mit Index, sparsam)
    return o;
  });
}
// Formen der echten Karosserien hängen nicht von der Farbe ab: einmal rechnen, für alle Farben brauchen
const shapeCache = new Map();
function memo(key, make) {
  let v = shapeCache.get(key);
  if (!v && make) { if (shapeCache.size > 400) shapeCache.clear(); shapeCache.set(key, v = make()); }
  return v;
}

// Innenraum (sieht man durch die Scheiben): Boden, Armaturenbrett, Lenkrad, Sitze mit Kopfstützen, Himmel, Innenspiegel
// und ein Fahrer. Links sitzt der Fahrer (Schweiz), links = −Z.
const SHIRTS = [0x1d4ed8, 0xdc2626, 0x16a34a, 0x334155, 0xf59e0b, 0x7c3aed, 0xf4f4f4];
const HAIR = [0x2b1a10, 0x6b4423, 0xd9b26f, 0x111111, 0x8a3b12];
function interior(C, { rb, rt, ft, fb, belt, ghTop, gw, seats2, rear }) {
  const M = C.M, cl = fb - rb;
  // Boden über dem Unterbau (sonst sähe man den Lack)
  const f0 = (rb + rt) / 2, f1 = (ft + fb) / 2;
  let fy = 0;
  for (let k = 0; k <= 10; k++) fy = Math.max(fy, belt(f0 + (f1 - f0) * k / 10));
  C.box(f1 - f0, 0.03, gw((f0 + f1) / 2) * 2 - 0.08, M.trim, (f0 + f1) / 2, fy + 0.01, 0);
  // Himmel unter dem Dach
  const h0 = rt + 0.08, h1 = ft - 0.08;
  if (h1 > h0) C.box(h1 - h0, 0.02, gw((h0 + h1) / 2) * 1.0, M.headliner, (h0 + h1) / 2, Math.min(ghTop(h0), ghTop(h1)) - 0.08, 0);
  // Armaturenbrett unter der Frontscheibe
  const dx1 = fb - 0.22, dx0 = fb - 0.62, dTop = Math.min(belt(dx1) + 0.14, ghTop(dx1) - 0.03);
  C.box(dx1 - dx0, dTop - fy, gw(dx0) * 2 - 0.1, M.trim, (dx0 + dx1) / 2, (dTop + fy) / 2, 0);
  C.box(0.05, 0.05, 0.22, mat(0x0a1a2e, { emissive: 0x2b6cb0, emissiveIntensity: 0.7 }), dx0 + 0.02, dTop - 0.03, 0); // Bildschirm
  // Sitze: Lehne, Kopfstütze
  const zs = gw(fb - 1) * 0.47, xs = fb - Math.min(1.35, cl * 0.5);
  const seat = (x, z, w) => {
    const top = Math.min(belt(x) + 0.36, ghTop(x) - 0.2);
    const back = C.box(0.13, top - fy + 0.05, w, M.seat, x, (top + fy) / 2, z);
    back.rotation.z = 0.18;
    C.box(0.1, 0.15, Math.min(w, 0.26), M.seat, x - 0.06, top + 0.1, z);
    return top;
  };
  const top = seat(xs, -zs, 0.46);
  seat(xs, zs, 0.46);
  if (rear && !seats2) { const xr = xs - 0.85; if (xr > rb + 0.3) for (const z of [-zs, zs]) seat(xr, z, 0.44); }
  // Lenkrad vor dem Fahrer
  const wx = xs + 0.68, wy = Math.min(belt(wx) + 0.12, ghTop(wx) - 0.12);
  const wheel = C.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 24), M.trim), wx, wy, -zs);
  wheel.rotation.set(0, PI / 2, 0.45);
  C.cyl(0.03, 0.03, 0.3, M.trim, wx + 0.12, wy - 0.06, -zs, [0, 0, PI / 2 + 0.45], 8);
  // Fahrer: Kopf mit Haaren, Oberkörper, Arme zum Lenkrad
  const hsh = [...C.v.kind].reduce((a, ch) => a * 31 + ch.charCodeAt(0) >>> 0, 7);
  const shirt = mat(SHIRTS[hsh % SHIRTS.length], { roughness: 0.8 }), hy = top + 0.06;
  const drv = new THREE.Group(); // eigene Gruppe: wird in der Fahrersitz-Kamera ausgeblendet
  drv.name = 'driver';
  drv.userData.driver = true;
  C.body.add(drv);
  const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; drv.add(o); return o; };
  part(new THREE.SphereGeometry(0.1, 20, 14), M.skin, xs + 0.12, hy, -zs).scale.set(1, 1.12, 0.95);
  part(new THREE.SphereGeometry(0.105, 20, 10, 0, PI * 2, 0, PI / 2), mat(HAIR[(hsh >> 3) % HAIR.length], { roughness: 0.9 }), xs + 0.1, hy + 0.035, -zs).scale.set(1, 0.8, 1);
  part(new THREE.CapsuleGeometry(0.13, 0.16, 4, 10), shirt, xs + 0.08, hy - 0.3, -zs).scale.set(0.75, 1, 1.15); // Oberkörper
  const sx = xs + 0.1, sy = hy - 0.2, len = Math.hypot(wx - 0.06 - sx, wy - sy);
  for (const s of [-1, 1]) { // Arme zum Lenkrad
    const arm = part(new THREE.CapsuleGeometry(0.035, len - 0.07, 3, 8), shirt, (sx + wx - 0.06) / 2, (sy + wy) / 2, -zs + s * 0.14);
    arm.rotation.z = Math.atan2(wy - sy, wx - 0.06 - sx) - PI / 2;
  }
  C.eye = [xs + 0.14, hy - 0.03, -zs]; // Augen des Fahrers (Fahrersitz-Kamera)
  // Innenspiegel oben an der Frontscheibe
  C.box(0.03, 0.06, 0.22, M.trim, ft - 0.02, ghTop(ft) - 0.1, 0);
}
function realBody(C, name, opts = {}) {
  const S = REAL[name], { L, W, M, r, X } = C, H = Math.min(C.H, L * 0.31), hw0 = W / 2, N = 6; // nicht zu hoch: echte Autos sind etwa 3× so lang wie hoch
  const topF = smoothLine(S.top), botF = smoothLine(S.bot), frac = x => x / L + 0.5;
  C.topAt = f => topF(f) * H; // Oberkante des Unterbaus (Haube, Gurtlinie, Kofferraum) an der Stelle f
  const rw = C.v.tune && C.v.tune.wheels ? r * 1.22 : r; // grosse Tuning-Räder brauchen grössere Radkästen
  const axles = (opts.wheels || S.axles).map(X), R = rw + 0.08;
  const plan = u => { const p = u > 0 ? S.pf : S.pr; return Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(u)), p)), 1 / p); };
  const archTop = x => { let y = 0; for (const a of axles) { const d = x - a; if (Math.abs(d) < R) y = Math.max(y, rw + Math.sqrt(R * R - d * d)); } return y; };
  // Werte eines Querschnitts an der Stelle x (Meter)
  const station = x => {
    const f = plan(x / (L / 2)), e = 0.3 + 0.7 * Math.sqrt(f);
    let yt = topF(frac(x)) * H, yb = botF(frac(x)) * H;
    const ym = (yt + yb) / 2;
    yt = ym + (yt - ym) * e; yb = ym + (yb - ym) * e;
    const at = archTop(x);
    return { hw: hw0 * f, yt, yb, lift: Math.max(0, at - yb), bulge: at ? Math.max(0, at + 0.05 - yt) : 0 };
  };
  // Sicke: scharfe Kante oben an der Seite (fängt das Licht), darunter leicht eingezogen – wie gepresstes Blech
  const crease = (st, y) => {
    const h = st.yt - st.yb, yc = st.yb + 0.74 * h, yl = st.yb + 0.36 * h;
    return 0.016 * Math.exp(-(((y - yc) / 0.045) ** 2)) - 0.012 * Math.exp(-(((y - yl) / 0.1) ** 2));
  };
  const ringPt = (st, th) => {
    const zf = spow(Math.cos(th), 2 / N), yf = spow(Math.sin(th), 2 / N), a = Math.abs(zf);
    const lo = st.yb + st.lift * smoothstep(0.42, 0.58, a), hi = st.yt + st.bulge * smoothstep(0.45, 0.85, a);
    const y = lo + (yf + 1) / 2 * (hi - lo);
    return [zf * st.hw * (1 + crease(st, y) * smoothstep(0.85, 0.97, a)), y];
  };
  // Punkte rund um den Querschnitt gleichmässig verteilen (sonst hätten die Seitenwände kaum Punkte)
  const NS = 110, NR = 96, xs = [], rows = [], ths = [];
  {
    const n = 960, cum = [0];
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const th = -PI / 2 + k / n * PI * 2, pt = [spow(Math.cos(th), 2 / N), spow(Math.sin(th), 2 / N) * 0.8];
      if (prev) cum.push(cum[cum.length - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1]));
      prev = pt;
    }
    for (let j = 0, k = 0; j < NR; j++) {
      const want = cum[n] * j / NR;
      while (cum[k + 1] < want) k++;
      ths.push(-PI / 2 + (k + (want - cum[k]) / (cum[k + 1] - cum[k] || 1)) / n * PI * 2);
    }
    ths.push(ths[0] + PI * 2);
  }
  for (let i = 0; i <= NS; i++) xs.push(Math.sin((i / NS * 2 - 1) * PI / 2) * L / 2); // an den Enden dichter
  const key = [name, L, H, W, r, rw, JSON.stringify(opts.wheels || ''), !!opts.noCabin, !!opts.noGrille].join('|');
  // Unterbau: Lack, unten dunkel (Unterboden und Radhäuser); SUV und Pickup unten mit Kunststoff beplankt
  const under = mat(0x111215, { roughness: 0.8 }), clad = mat(0x2a2c31, { roughness: 0.75 });
  const [bodyMesh, bottomMesh, cladMesh] = loftMeshes(memo(key + '|body', () => {
    for (const x of xs) {
      const st = station(x), row = [];
      for (let j = 0; j < NR; j++) { const [z, y] = ringPt(st, ths[j]); row.push([x, y, z]); }
      rows.push(row);
    }
    return loftGeos(rows, true, 3, (i, j) => {
      const th = (ths[j] + ths[j + 1]) / 2, d = Math.min(Math.abs(th + PI / 2), Math.abs(th - 3 * PI / 2));
      if (d < 0.95) return 1;
      if (S.clad) {
        const st = station(xs[i]), [, y, z] = rows[i][j];
        if (Math.abs(z) > st.hw * 0.8 && (y < st.yb + 0.24 * (st.yt - st.yb) || (st.lift > 0.02 && y < st.yb + st.lift + 0.07))) return 2; // nur an der Seite
      }
      return 0;
    });
  }), [C.paint, under, clad]);
  C.bodyMesh = bodyMesh;
  C.body.add(bodyMesh, bottomMesh);
  if (cladMesh) C.body.add(cladMesh);

  // Halbe Breite der Oberfläche an der Stelle (x, y) – für Aufkleber, Lichter, Spiegel
  const [rb, rt, ft, fb] = S.gh.map(X), roofY = S.roof * H, ghPts = [];
  const lowerZ = (x, y) => {
    const st = station(x);
    if (st.hw <= 0) return 0;
    const lo = st.yb + st.lift, hi = st.yt + st.bulge, yf = 2 * (y - lo) / (hi - lo || 1) - 1;
    return Math.abs(yf) >= 1 ? 0 : st.hw * Math.pow(1 - Math.pow(Math.abs(yf), N), 1 / N) * (1 + crease(st, y));
  };
  // Kabine: Seitenansicht als abgerundetes Viereck, Querschnitt schmaler nach oben (wie echte Autos)
  if (!opts.noCabin) {
    const poly = roundPoly([[rb, topF(frac(rb)) * H - 0.02], [rt, roofY], [(rt + ft) / 2, roofY + 0.03], [ft, roofY], [fb, topF(frac(fb)) * H - 0.02]], 0.4, 6);
    const ghTop = x => edgeTop(poly, x);
    const NG = 56, NGR = 30, gx = [];
    for (let i = 0; i <= NG; i++) gx.push(rb + (fb - rb) * i / NG);
    const gst = x => {
      const yb = topF(frac(x)) * H - 0.09, gwb = station(x).hw * 0.87;
      return { yb, yt: Math.max(yb, ghTop(x)), gwb, gwt: gwb * 0.78 };
    };
    const ghRows = () => gx.map(x => {
      const g = gst(x), row = [];
      for (let j = 0; j <= NGR; j++) {
        const th = j / NGR * PI, zf = spow(Math.cos(th), 0.5), yf = Math.pow(Math.sin(th), 0.5);
        row.push([x, g.yb + yf * (g.yt - g.yb), zf * (g.gwb + (g.gwt - g.gwb) * yf)]);
      }
      return row;
    });
    C.ghZ = (x, y) => {
      if (x < rb || x > fb) return 0;
      const g = gst(x), yf = (y - g.yb) / (g.yt - g.yb || 1);
      return yf < 0 || yf > 1 ? 0 : Math.pow(1 - Math.pow(yf, 4), 0.25) * (g.gwb + (g.gwt - g.gwb) * yf);
    };
    const glass = opts.tinted ? M.glassTint : M.glassClear; // durchsichtig: man sieht hinein
    const xr0 = rt + 0.05, xr1 = ft - 0.05, inX = (x, [a, b]) => x >= X(a) && x <= X(b);
    const parts = loftMeshes(memo(key + '|cabin', () => loftGeos(ghRows(), false, 3, (i, j) => {
      const x = (gx[i] + gx[i + 1]) / 2, th = (j + 0.5) / NGR * PI, e = Math.min(th, PI - th);
      if (e < 0.07) return 2; // Gummidichtung unten
      const roof = x > xr0 && x < xr1;
      if (e > 0.75) return roof || e < 1.05 ? 0 : 1; // Dach, A-/C-Säulen, Front- und Heckscheibe
      if (inX(x, S.cp)) return 0;
      for (const [c, w, kind] of S.posts) if (Math.abs(x - X(c)) < w * L / 2) return kind === 'dark' ? 2 : 0;
      return 1;
    })), [C.paint, glass, M.dark]);
    for (const p of parts) if (p) C.body.add(p);
    // von innen: Dach und Säulen verkleidet (sonst sähe man vom Fahrersitz durchs Dach in den Himmel)
    const geos = memo(key + '|cabin');
    for (const [k, m] of [[0, M.cabinIn], [2, M.cabinInDark]]) if (geos[k]) {
      const o = new THREE.Mesh(geos[k], m);
      o.userData.whole = true;
      C.body.add(o);
    }
    C.roofY = roofY + 0.03;
    C.roofX = (rt + ft) / 2;
    if (!opts.noMirrors) for (const s of [-1, 1]) { // Aussenspiegel: schwarzer Fuss, Gehäuse in Wagenfarbe, Glas nach hinten, Blinker
      const mx = fb - 0.2, my = topF(frac(mx)) * H + 0.09, mz = station(mx).hw * 0.86;
      C.box(0.12, 0.035, 0.1, M.dark, mx, my - 0.03, s * (mz + 0.04));
      C.sph(1, C.paint, mx, my, s * (mz + 0.15), [0.07, 0.06, 0.12]);
      C.box(0.01, 0.075, 0.17, M.glass, mx - 0.065, my, s * (mz + 0.15));
      C.box(0.03, 0.015, 0.1, new THREE.MeshStandardMaterial({ color: 0xffa31a, emissive: 0xff8a00, emissiveIntensity: 0.6 }), mx + 0.035, my - 0.035, s * (mz + 0.18));
    }
    // Scheibenwischer unten an der Frontscheibe
    const wy = topF(frac(fb)) * H + 0.03, slope = Math.atan2(roofY - wy, ft - fb);
    for (const z of [-0.32, 0.2]) {
      const wp = C.box(0.025, 0.02, 0.62, M.dark, fb - 0.07, wy + 0.03, z);
      wp.rotation.set(0, 0.12, -slope * 0.25);
    }
    interior(C, { rb, rt, ft, fb, belt: x => topF(frac(x)) * H, ghTop, gw: x => gst(x).gwb, seats2: S.twoDoor && S.redCaliper, rear: !(opts.twoDoor || S.twoDoor) });
    // Haifischflossen-Antenne hinten auf dem Dach
    const ax = rt + 0.18;
    C.ext([[ax, 0], [ax + 0.18, 0], [ax + 0.03, 0.06]], 0.045, M.dark, 0.012).position.y = ghTop(ax) - 0.01;
    const front = Math.min(fb - 0.03, axles[axles.length - 1] - R - 0.02);
    C.side = { doors: [front, ...S.posts.filter(p => p[2] === 'dark' && X(p[0]) > X(S.cp[1])).map(p => X(p[0]))], doorTop: 0 };
    if (!(opts.twoDoor || S.twoDoor)) C.side.doors.push(Math.max(X(S.cp[1]), axles[0] + R * 0.6));
    else C.side.doors.splice(1);
    C.side.doorTop = topF(frac(C.side.doors[0])) * H - 0.06;
  }
  C.surfZ = (x, y) => Math.max(lowerZ(x, y), C.ghZ ? C.ghZ(x, y) : 0);

  // Umriss von der Seite (für Aufkleber, Spoiler); Radkästen ausgespart
  const pts = [], bots = [];
  for (let i = 0; i <= 80; i++) {
    const x = -L / 2 + L * i / 80, st = station(x);
    pts.push([x, st.yt]);
    bots.unshift([x, st.yb + st.lift]);
  }
  C.side = { ...(C.side || {}), pts: pts.concat(bots), bottom: Math.min(...bots.map(p => p[1])), top: Math.max(...pts.map(p => p[1])), real: true };

  if (S.bed) { // Ladefläche mit Abdeckung und Rand
    const [b0, b1] = S.bed.map(X), y = topF(frac((b0 + b1) / 2)) * H;
    C.box(b1 - b0, 0.03, W * 0.84, mat(0x18191c, { roughness: 0.7 }), (b0 + b1) / 2, y + 0.005, 0);
    for (const s of [-1, 1]) C.box(b1 - b0, 0.05, 0.05, M.dark, (b0 + b1) / 2, y + 0.02, s * W * 0.43);
  }
  C.wheelOut = -0.03;
  C.caliper = mat(S.redCaliper ? 0xc8161d : 0x55595f, { roughness: 0.45, metalness: 0.3 });
  for (const a of axles) C.wheelPair(a, r, 0.3, opts.rim, opts.spokes);

  // Front und Heck: Bild auf die gerundete Fläche gemalt (Scheinwerfer, Grill, Rücklichter); was leuchtet, steht in glow
  const endX = (y, z, front) => { // vorderste/hinterste Stelle der Oberfläche auf Höhe y, im Abstand z von der Mitte
    const sg = front ? 1 : -1, need = Math.max(Math.abs(z), 1e-4);
    let lo = Math.min(L / 2 - 0.1, Math.abs(front ? axles[axles.length - 1] : axles[0]) + R + 0.02), hi = L / 2; // vor/hinter dem Radkasten anfangen
    if (lowerZ(sg * lo, y) <= need) return null;
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (lowerZ(sg * m, y) > need) lo = m; else hi = m; }
    return sg * lo;
  };
  const fascia = (front, y0, y1, w, draw) => {
    const made = memo(key + (front ? '|front' : '|rear'), () => makeFascia(front, y0, y1, w, draw));
    const o = new THREE.Mesh(made.geometry, made.material);
    o.userData.whole = true;
    C.body.add(o);
  };
  const makeFascia = (front, y0, y1, w, draw) => {
    const cw = 512, ch = Math.max(64, Math.round(cw * (y1 - y0) / w));
    const base = document.createElement('canvas'), glow = document.createElement('canvas');
    base.width = glow.width = cw; base.height = glow.height = ch;
    const gg = glow.getContext('2d');
    gg.fillStyle = '#000'; gg.fillRect(0, 0, cw, ch);
    draw(base.getContext('2d'), gg, cw, ch);
    const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const m = new THREE.MeshStandardMaterial({ map: tex(base), emissiveMap: tex(glow), emissive: 0xffffff, emissiveIntensity: 1.3,
      transparent: true, alphaTest: 0.05, roughness: 0.25, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(w, y1 - y0, 48, 16);
    geo.rotateY(front ? PI / 2 : -PI / 2);
    const pos = geo.attributes.position, inner = (front ? 1 : -1) * L * 0.2;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + (y0 + y1) / 2, z = pos.getZ(i), x = endX(y, z, front);
      pos.setXYZ(i, x === null ? inner : x + (front ? 0.012 : -0.012), y, z);
    }
    geo.computeVertexNormals();
    return { geometry: geo, material: m };
  };
  const poly = (g, w, h, pts, mirror) => { g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo']((mirror ? 1 - x : x) * w, y * h)); g.closePath(); };
  const sF = station(L / 2 * 0.9), sR = station(-L / 2 * 0.9);
  fascia(true, sF.yb + 0.03, sF.yt - 0.03, W * 0.98, (g, gl, w, h) => {
    for (const mi of [false, true]) {
      poly(g, w, h, [[.04, .1], [.3, .26], [.29, .44], [.06, .36]], mi); // Scheinwerfer: Gehäuse
      g.fillStyle = '#1b2027'; g.fill();
      poly(g, w, h, [[.07, .15], [.27, .29], [.265, .39], [.08, .32]], mi); // Glas
      g.fillStyle = '#dfe8f3'; g.fill();
      poly(gl, w, h, [[.07, .15], [.27, .29], [.265, .39], [.08, .32]], mi);
      gl.fillStyle = '#8a8f96'; gl.fill();
      for (const lx of [.13, .21]) { // Linsen (Projektoren) mit Chromring
        const cx = (mi ? 1 - lx : lx) * w, cy = (.25 + (lx - .13) * .45) * h, rr = .028 * w;
        g.beginPath(); g.arc(cx, cy, rr, 0, PI * 2); g.fillStyle = '#9aa5b3'; g.fill();
        g.beginPath(); g.arc(cx, cy, rr * 0.7, 0, PI * 2); g.fillStyle = '#30363f'; g.fill();
        g.beginPath(); g.arc(cx - rr * 0.2, cy - rr * 0.2, rr * 0.3, 0, PI * 2); g.fillStyle = '#ffffff'; g.fill();
        gl.beginPath(); gl.arc(cx, cy, rr * 0.7, 0, PI * 2); gl.fillStyle = '#e8eef8'; gl.fill();
      }
      poly(gl, w, h, [[.07, .14], [.27, .28], [.27, .31], [.07, .18]], mi); // Tagfahrlicht
      gl.fillStyle = '#ffffff'; gl.fill();
      poly(g, w, h, [[.07, .14], [.27, .28], [.27, .31], [.07, .18]], mi); g.fillStyle = '#ffffff'; g.fill();
      g.beginPath(); g.arc((mi ? .88 : .12) * w, .8 * h, .035 * w, 0, PI * 2); g.fillStyle = '#20252c'; g.fill(); // Nebellicht
      gl.beginPath(); gl.arc((mi ? .88 : .12) * w, .8 * h, .022 * w, 0, PI * 2); gl.fillStyle = '#c8c8c0'; gl.fill();
    }
    if (!opts.noGrille) {
      poly(g, w, h, [[.35, .3], [.65, .3], [.69, .64], [.31, .64]]); // Kühlergrill mit Wabenmuster und Chromrahmen
      g.fillStyle = '#0c0d10'; g.fill();
      g.save(); g.clip();
      g.strokeStyle = '#30343b'; g.lineWidth = 2;
      const cs = w * 0.022;
      for (let yy = 0, row = 0; yy < h; yy += cs * 0.9, row++) for (let xx = (row % 2) * cs / 2; xx < w; xx += cs) { g.beginPath(); g.arc(xx, yy, cs * 0.38, 0, PI * 2); g.stroke(); }
      g.restore();
      poly(g, w, h, [[.35, .3], [.65, .3], [.69, .64], [.31, .64]]);
      g.strokeStyle = '#d5dbe3'; g.lineWidth = 5; g.stroke();
    }
    poly(g, w, h, [[.2, .74], [.8, .74], [.84, .92], [.16, .92]]); // Lufteinlass unten
    g.fillStyle = '#0c0d10'; g.fill();
  });
  fascia(false, sR.yb + 0.03, sR.yt - 0.03, W * 0.98, (g, gl, w, h) => {
    for (const mi of [false, true]) {
      for (const c of [g, gl]) { poly(c, w, h, [[.02, .12], [.3, .14], [.29, .34], [.05, .32]], mi); c.fillStyle = c === g ? '#b3121b' : '#ff2a2a'; c.fill(); }
      poly(g, w, h, [[.1, .2], [.26, .21], [.25, .28], [.1, .27]], mi); g.fillStyle = '#ff6b6b'; g.fill(); // heller Streifen
      poly(g, w, h, [[.06, .86], [.14, .86], [.14, .9], [.06, .9]], mi); g.fillStyle = '#c0161f'; g.fill(); // Rückstrahler
    }
    for (const c of [g, gl]) { c.fillStyle = c === g ? '#8a0c12' : '#b01818'; c.fillRect(.3 * w, .2 * h, .4 * w, .05 * h); } // Lichtband
    poly(g, w, h, [[.22, .8], [.78, .8], [.8, 1], [.2, 1]]); g.fillStyle = '#121316'; g.fill(); // Diffusor
  });
  // Fugen von Motorhaube und Kofferraum: dünne dunkle Linien knapp über der Oberfläche
  const topY = (x, z) => {
    const st = station(x), zf = Math.min(0.999, Math.abs(z) / (st.hw || 1)), yf = Math.pow(1 - Math.pow(zf, N), 1 / N);
    const lo = st.yb + st.lift * smoothstep(0.42, 0.58, zf), hi = st.yt + st.bulge * smoothstep(0.45, 0.85, zf);
    return lo + (yf + 1) / 2 * (hi - lo);
  };
  const seam = pts => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, topY(x, z) + 0.004, z)));
    C.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, 0.006, 4), M.seam));
  };
  const lid = (x0, x1, k) => { // Deckel als Rechteck mit leicht runden Ecken (k: Anteil der halben Breite)
    const z0 = station(x0).hw * k, z1 = station(x1).hw * k, line = (xa, za, xb, zb, n = 8) => Array.from({ length: n + 1 }, (_, i) => [xa + (xb - xa) * i / n, za + (zb - za) * i / n]);
    for (const sg of [-1, 1]) seam(line(x0, sg * z0, x1, sg * z1));
    seam(line(x0, -z0, x0, z0, 12));
    seam(line(x1, -z1, x1, z1, 12));
  };
  lid(fb + 0.07, L / 2 * 0.9, 0.74); // Motorhaube
  if (S.gh[0] > 0.1) lid(-L / 2 * 0.9, rb - 0.06, 0.74); // Kofferraumdeckel (nur mit Stufenheck)
  // Nummernschilder
  const own = C.v.tune && C.v.tune.plate, ph = own ? 0.17 : 0.11, pw = own ? 0.72 : 0.5;
  const py = sF.yb + (sF.yt - sF.yb) * 0.25, pyR = sR.yb + (sR.yt - sR.yb) * 0.45;
  C.box(0.02, ph, pw, M.plate, endX(py, pw / 2, true) + 0.03, py, 0);
  C.box(0.02, ph, pw, M.plate, endX(pyR, pw / 2, false) - 0.03, pyR, 0);
  if (!opts.noExhaust) {
    const ey = sR.yb + 0.06, ez = W * 0.27, ex = -(L / 2) * Math.pow(1 - Math.pow(ez / hw0, S.pr), 1 / S.pr);
    C.cyl(0.04, 0.045, 0.2, M.chrome, ex + 0.03, ey, ez, [0, 0, PI / 2], 12);
  }
}
// Höchste Stelle eines Umrisses an der Stelle x
function edgeTop(pts, x) {
  let best = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
    best = Math.max(best, ay + (by - ay) * (x - ax) / (bx - ax));
  }
  return best;
}

// Karosserie nach Seitenprofil (Limousine, Kombi, Sportwagen, Kastenwagen, Bus …) mit runden Kanten,
// Kühlergrill, Stossstangen, Nummernschildern, Spiegeln, Auspuff; Türfugen und Radkästen kommen am Schluss (sideDetails)
function profileBody(C, name, opts = {}) {
  if (REAL[name] && !opts.classic) return realBody(C, name, opts);
  const P = PROFILE[name], { X, L, H, W, M } = C;
  const pts = roundPoly(P.body.map(([x, y]) => [X(x), y * H]), P.tall ? 0.22 : 0.16);
  C.bodyMesh = C.ext(pts, W - 0.28, C.paint);
  const bottom = Math.min(...P.body.map(p => p[1])) * H;
  C.side = { pts, bottom, top: Math.max(...P.body.map(p => p[1])) * H, tall: P.tall };
  if (P.cabin && !opts.noCabin) {
    const [rb, rt, ft, fb, by, ty] = P.cabin, cw = W * 0.78;
    C.ext(roundPoly([[X(rb), by * H], [X(rt), ty * H], [X(ft), ty * H], [X(fb), by * H]], 0.1), cw, opts.tinted ? mat(0x10161e, { metalness: 0.7, roughness: 0.05 }) : M.glass, 0.04);
    C.ext(roundPoly([[X(rt + 0.02), ty * H - 0.05], [X(rt + 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H - 0.05]], 0.03), cw + 0.04, C.paint, 0.03);
    C.box(0.1, (ty - by) * H * 0.92, cw + 0.1, M.dark, X((rt + ft) / 2), (by + ty) / 2 * H, 0); // B-Säule
    C.roofY = ty * H + 0.07;
    C.roofX = X((rt + ft) / 2);
    C.side.doors = [X(fb) - 0.08, X((rt + ft) / 2), opts.twoDoor || P.twoDoor ? null : X(rb) + 0.12].filter(v => v !== null);
    C.side.doorTop = by * H - 0.06;
    if (!opts.noMirrors) for (const s of [-1, 1]) { // Aussenspiegel
      C.box(0.14, 0.1, 0.22, C.paint, X(fb) - 0.02, by * H + 0.1, s * (W / 2 + 0.04));
      C.box(0.02, 0.08, 0.18, M.glass, X(fb) - 0.1, by * H + 0.1, s * (W / 2 + 0.04));
    }
  }
  if (P.glass) C.ext(roundPoly(P.glass.map(([x, y]) => [X(x), y * H]), 0.08), W, M.glass, 0.02); // etwas breiter als die Karosserie, damit man die Scheiben sieht
  if (P.tall) for (const s of [-1, 1]) C.box(0.08, 0.34, 0.1, M.dark, L / 2 - 0.3, H * 0.62, s * (W / 2 + 0.1)); // grosse Spiegel
  C.roofY = C.roofY || H + 0.05;
  C.roofX = C.roofX === undefined ? X(0.4) : C.roofX;
  C.wheelPair(X(opts.wheels ? opts.wheels[0] : P.tall ? 0.16 : 0.18), C.r, 0.32, opts.rim, opts.spokes);
  C.wheelPair(X(opts.wheels ? opts.wheels[1] : P.tall ? 0.84 : 0.82), C.r, 0.32, opts.rim, opts.spokes);
  const ly = P.tall ? 0.45 * H : 0.42 * H, lyRear = P.tall ? 0.3 * H : 0.46 * H;
  C.lights(edgeAt(pts, ly, true) + 0.02, edgeAt(pts, lyRear, false) - 0.02, ly, lyRear);
  // Stossstangen unten, Kühlergrill und Nummernschilder
  const by = bottom + 0.09, fx = edgeAt(pts, by, true), rx = edgeAt(pts, by, false);
  C.box(0.12, 0.12, W * 0.9, M.dark, fx - 0.02, by, 0);
  C.box(0.12, 0.12, W * 0.9, M.dark, rx + 0.02, by, 0);
  if (!opts.noGrille) {
    const gy = (ly + bottom) / 2 + 0.04, gx = edgeAt(pts, gy, true);
    C.box(0.06, 0.2, W * 0.46, M.chrome, gx - 0.01, gy, 0);
    C.box(0.06, 0.15, W * 0.42, mat(0x0d0e10, { roughness: 0.35, metalness: 0.4 }), gx + 0.005, gy, 0);
  }
  // Nummernschilder: vor die abgerundete Kante der Karosserie (die ist um bevelSize ≈ 0,08 m grösser als das Profil);
  // eigene Schilder (Tuning) etwas grösser, damit man den Text lesen kann
  const own = C.v.tune && C.v.tune.plate, ph = own ? 0.17 : 0.12, pw = own ? 0.72 : 0.5;
  const py = bottom + 0.2;
  C.box(0.03, ph, pw, M.plate, edgeAt(pts, py, true) + 0.1, py, 0);
  const pyR = P.tall ? bottom + 0.25 : lyRear - 0.18;
  C.box(0.03, ph, pw, M.plate, edgeAt(pts, pyR, false) - 0.1, pyR, 0);
  if (!opts.noExhaust) C.cyl(0.045, 0.05, 0.22, M.chrome, rx - 0.02, bottom + 0.03, W * 0.28, [0, 0, PI / 2], 12);
  C.box(L * 0.84, 0.16, W * 0.8, M.dark, 0, bottom - 0.03, 0); // Unterboden
}

// Seitenteile als Aufkleber: dunkle Radkästen über allen Achsen, Schwellerleiste, Türfugen und Griffe
function sideDetails(C) {
  const { L, side } = C, y0 = side.bottom, y1 = side.tall ? side.top * 0.62 + y0 * 0.38 : side.top;
  C.decal(L, y1 - y0, 0, (y0 + y1) / 2, (g, cw, ch) => {
    const sc = cw / L, px = x => (x + L / 2) * sc, py = y => (y1 - y) * sc;
    g.beginPath(); // nur innerhalb der Karosserie malen
    side.pts.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))));
    g.clip();
    g.fillStyle = 'rgba(0,0,0,0.28)'; // Schwellerleiste
    g.fillRect(px(-L / 2 + 0.2), py(y0 + 0.12), (L - 0.4) * sc, 0.1 * sc);
    if (side.doors) {
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = Math.max(1.5, 0.014 * sc);
      for (const x of side.doors) { g.beginPath(); g.moveTo(px(x), py(side.doorTop)); g.lineTo(px(x), py(y0 + 0.14)); g.stroke(); }
      g.fillStyle = 'rgba(225,228,234,0.9)'; // Türgriffe
      for (const x of side.doors.slice(0, 2)) g.fillRect(px(x - 0.36), py(side.doorTop - 0.12), 0.17 * sc, 0.04 * sc);
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = Math.max(1, 0.01 * sc); // Sicke
      g.beginPath(); g.moveTo(px(-L / 2 + 0.25), py(side.doorTop - 0.24)); g.lineTo(px(L / 2 - 0.3), py(side.doorTop - 0.2)); g.stroke();
    }
    const shade = g.createLinearGradient(0, 0, 0, ch); // unten etwas dunkler (wie echtes Licht von oben)
    shade.addColorStop(0, 'rgba(255,255,255,0.06)'); shade.addColorStop(0.5, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = shade; g.fillRect(0, 0, cw, ch);
    if (!side.real) for (const [x, r] of C.axles) { // Radkästen mit Kante (echte Karosserien haben richtige)
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(px(x), py(r), (r + 0.2) * sc, 0, PI * 2); g.fill();
      g.fillStyle = 'rgba(10,10,12,0.96)'; g.beginPath(); g.arc(px(x), py(r), (r + 0.15) * sc, 0, PI * 2); g.fill();
    }
  }, -0.006);
}

// ---------- Kleine Aufkleber-Malfunktionen ----------
const text = (t, color, font) => (g, w, h) => {
  g.fillStyle = color; g.font = `bold ${font || Math.round(h * 0.62)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h / 2 + 2);
};
const band = (bg, t, fg) => (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); if (t) text(t, fg)(g, w, h); };
const stripes = (colors, diagonal) => (g, w, h) => {
  const n = colors.length, sw = h / 2;
  for (let x = -h, i = 0; x < w + h; x += sw, i++) {
    g.fillStyle = colors[i % n];
    if (diagonal) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + sw, h); g.lineTo(x + sw + h * 0.6, 0); g.lineTo(x + h * 0.6, 0); g.fill(); } else g.fillRect(x, 0, sw, h);
  }
};

// ---------- Bauanleitungen für alle Fahrzeuge ----------
const BUILD = {
  car: C => profileBody(C, 'sedan'),
  mini: C => profileBody(C, 'compact', { wheels: [0.17, 0.83] }),
  kompakt: C => profileBody(C, 'compact'),
  kombi: C => {
    profileBody(C, 'kombi');
    roofRails(C, 0.42, 0.27);
  },
  limo: C => {
    profileBody(C, 'sedan', { tinted: true, wheels: [0.12, 0.88] });
    C.decal(C.L * 0.9, 0.06, 0, C.H * 0.5, band('#e8ecf2'));
  },
  ghost: C => {
    profileBody(C, 'sedan');
    C.paint.emissive = new THREE.Color(0x6d5bd0); C.paint.emissiveIntensity = 0.25;
    C.decal(C.L * 0.45, C.H * 0.3, C.X(0.47), C.H * 0.38, (g, w, h) => { // Geistergesicht
      g.fillStyle = '#2b2350';
      g.beginPath(); g.ellipse(w * 0.3, h * 0.38, w * 0.07, h * 0.3, 0, 0, PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.62, h * 0.38, w * 0.07, h * 0.3, 0, 0, PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.46, h * 0.82, w * 0.08, h * 0.13, 0, 0, PI * 2); g.fill();
    });
  },
  taxi: C => {
    profileBody(C, 'sedan');
    C.decal(C.L * 0.92, 0.22, 0, C.H * 0.4, (g, w, h) => { // Schachbrett-Streifen
      const s = h / 2;
      for (let x = 0; x < w; x += s) for (let y = 0; y < 2; y++) { g.fillStyle = (x / s + y) % 2 < 1 ? '#111' : '#ffc61a'; g.fillRect(x, y * s, s, s); }
    });
    const sign = C.box(0.42, 0.24, 0.8, new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffc61a, emissiveIntensity: 0.5 }), C.roofX, C.roofY + 0.1, 0);
    sign.castShadow = false;
  },
  police: C => {
    profileBody(C, 'sedan');
    C.decal(C.L * 0.9, 0.34, 0, C.H * 0.42, band('#1d4ed8', 'POLIZEI', '#fff'));
    C.blueLights(C.roofX, C.roofY + 0.1);
  },
  cabrio: C => {
    profileBody(C, 'sedan', { noCabin: true });
    const { X, M } = C, belt = C.topAt(0.5);
    const ws = C.box(0.05, 0.42, C.W * 0.78, M.glass, X(0.7), C.topAt(0.7) + 0.16, 0); // Windschutzscheibe
    ws.rotation.z = -0.9;
    for (const z of [-0.42, 0.42]) C.box(0.5, 0.5, 0.55, mat(0x2b2b30), X(0.4), belt - 0.05, z); // Sitze
    C.sph(0.2, M.skin, X(0.47), belt + 0.4, -0.42); // Fahrer mit Sonnenbrille
    C.sph(0.21, mat(0x5a3a1e), X(0.46), belt + 0.47, -0.42, [1, 0.7, 1]);
    C.box(0.06, 0.07, 0.34, M.dark, X(0.47) + 0.18, belt + 0.42, -0.42);
  },
  oldtimer: C => {
    profileBody(C, 'sedan', { wheels: [0.2, 0.8], classic: true }); // Oldtimer: alte Form mit runden Kotflügeln
    const { X, r, M, W } = C;
    for (const x of [X(0.2), X(0.8)]) for (const s of [-1, 1]) { // runde Kotflügel
      const f = C.cyl(r + 0.16, r + 0.16, 0.42, C.paint, x, r, s * (W / 2 - 0.12), [PI / 2, 0, 0], 24);
      f.scale.set(1, 1, 0.75);
    }
    for (const s of [-1, 1]) {
      C.box(C.L * 0.42, 0.05, 0.3, M.dark, X(0.5), r * 0.75, s * (W / 2 + 0.05)); // Trittbrett
      C.sph(0.16, M.head, X(0.97), C.H * 0.55, s * 0.6); // runde Scheinwerfer
    }
  },
  muscle: C => {
    profileBody(C, 'sport');
    C.decal(C.L * 0.96, 0.12, 0, C.topAt(0.5) - 0.2, band('#f4f4f4')); // Rennstreifen
    C.box(0.6, 0.14, 0.5, C.M.dark, C.X(0.82), C.topAt(0.82) + 0.03, 0); // Lufthutze
  },
  sports: C => {
    profileBody(C, 'sport');
    const { X, H, M, W } = C;
    C.box(0.35, 0.05, W * 0.95, M.dark, X(0.02), H * 0.78, 0); // Heckspoiler
    for (const s of [-1, 1]) C.box(0.08, H * 0.25, 0.08, M.dark, X(0.03), H * 0.64, s * W * 0.3);
    C.decal(C.L * 0.95, 0.1, 0, H * 0.35, band('#ffffff'));
  },
  rocketcar: C => {
    profileBody(C, 'sport');
    const { X, H, M } = C;
    const y = H * 0.95;
    C.cyl(0.24, 0.24, C.L * 0.5, M.steel, X(0.25), y, 0, [0, 0, PI / 2]); // Rakete
    C.cyl(0, 0.24, 0.55, mat(0xe02424), X(0.5) + 0.27, y, 0, [0, 0, -PI / 2]);
    for (const [ry, rz] of [[0, 0], [PI / 2, 0]]) { const fin = C.box(0.4, 0.45, 0.04, mat(0xe02424), X(0.02), y + 0.15, 0); fin.rotation.set(rz, ry, 0); }
    const flame = C.cyl(0, 0.18, 0.8, new THREE.MeshBasicMaterial({ color: 0xffa020 }), X(0) - 0.4, y, 0, [0, 0, PI / 2]);
    flame.userData.flame = true;
  },
  timemachine: C => {
    profileBody(C, 'sport', { tinted: true });
    const { X, H, L } = C;
    const neon = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 2 });
    for (const s of [-1, 1]) { // Leuchtröhren an der Seite (liegen auf der gewölbten Karosserie)
      C.box(L * 0.5, 0.05, 0.03, neon, X(0.5), H * 0.38, s * (C.surfZ(X(0.5), H * 0.38) + 0.02));
      C.box(0.05, H * 0.2, 0.03, neon, X(0.22), H * 0.45, s * (C.surfZ(X(0.22), H * 0.45) + 0.02));
    }
    for (const y of [0.42, 0.52]) C.cyl(0.08, 0.08, 0.4, C.M.chrome, X(0) - 0.15, H * y, 0, [0, 0, PI / 2]); // Rohre hinten
  },
  beetle: C => {
    const { X, L, H, W, r, M } = C;
    C.sph(1, C.paint, 0, r * 0.5, 0, [L / 2, H - r * 0.5, W / 2], 'top'); // Kuppel
    C.sph(1, M.glass, X(0.55), r * 0.5 + H * 0.28, 0, [L * 0.28, (H - r * 0.5) * 0.66, W * 0.505], 'top'); // Fenster
    for (const x of [X(0.2), X(0.8)]) for (const s of [-1, 1]) C.cyl(r + 0.12, r + 0.12, 0.4, C.paint, x, r, s * (W / 2 - 0.1), [PI / 2, 0, 0], 24);
    for (const s of [-1, 1]) C.sph(0.13, M.head, X(0.92), H * 0.4, s * 0.55);
    C.wheelPair(X(0.2)); C.wheelPair(X(0.8));
  },
  isetta: C => {
    const { X, L, H, W, r, M } = C;
    const h = H - r * 0.4;
    C.sph(1, C.paint, 0, r * 0.4 + h / 2, 0, [L / 2, h / 2, W / 2]); // Ei-Form
    C.sph(1, M.glass, X(0.68), r * 0.4 + h * 0.62, 0, [L * 0.22, h * 0.3, W * 0.42]); // grosses Frontfenster
    C.lights(L / 2 - 0.05, -L / 2 + 0.05, H * 0.45);
    C.wheelPair(X(0.22), r, 0.24); C.wheelPair(X(0.78), r, 0.24);
  },
  golfcart: C => {
    const { X, L, H, W, M } = C;
    C.box(L, H * 0.32, W - 0.2, C.paint, 0, H * 0.28, 0);
    C.box(L * 0.8, 0.08, W - 0.1, M.white, X(0.5), H, 0); // Dach
    for (const x of [X(0.14), X(0.86)]) for (const s of [-1, 1]) C.cyl(0.04, 0.04, H * 0.55, M.steel, x, H * 0.72, s * (W / 2 - 0.2));
    C.box(L * 0.3, 0.4, W * 0.7, mat(0x2b2b30), X(0.4), H * 0.55, 0); // Sitzbank
    C.cyl(0.18, 0.18, H * 0.55, mat(0x7a4a22), X(0.04), H * 0.62, 0); // Golfbag mit Schlägern
    for (let i = 0; i < 3; i++) C.cyl(0.02, 0.02, 0.4, M.chrome, X(0.04) + (i - 1) * 0.06, H * 0.98, 0.05 * i);
    const ws = C.box(0.04, H * 0.4, W * 0.75, M.glass, X(0.88), H * 0.7, 0);
    ws.rotation.z = -0.15;
    C.lights(L / 2, -L / 2, H * 0.3);
    C.wheelPair(X(0.2)); C.wheelPair(X(0.8));
  },
  tuktuk: C => {
    const { X, L, H, W, r, M } = C;
    C.box(L * 0.82, H * 0.42, W - 0.2, C.paint, X(0.42), H * 0.36, 0); // Kabine unten
    C.box(L * 0.24, H * 0.36, W * 0.45, C.paint, X(0.88), H * 0.36, 0); // Nase vorne
    C.box(L * 0.86, 0.12, W, C.paint, X(0.45), H * 0.98, 0); // Dach
    for (const x of [X(0.06), X(0.78)]) for (const s of [-1, 1]) C.cyl(0.04, 0.04, H * 0.42, M.dark, x, H * 0.76, s * (W / 2 - 0.1));
    C.sph(0.2, M.skin, X(0.66), H * 0.72, 0);
    C.box(L * 0.7, 0.07, 0.03, mat(0xffd166), X(0.42), H * 0.42, W / 2 - 0.08);
    C.box(L * 0.7, 0.07, 0.03, mat(0xffd166), X(0.42), H * 0.42, -W / 2 + 0.08);
    C.sph(0.13, M.head, L / 2 - 0.02, H * 0.45, 0);
    C.wheelPair(X(0.18)); // zwei Räder hinten …
    C.wheels.push(wheel(r, 0.22, C.group, X(0.88), 0)); // … und eins vorne
  },
  pickup: C => {
    profileBody(C, 'pickup');
    const { X, H } = C;
    C.box(0.6, 0.55, 0.6, C.M.wood, X(0.14), H * 0.56 + 0.28, -0.3); // Kisten auf der Ladefläche
    C.box(0.48, 0.42, 0.48, C.M.wood, X(0.3), H * 0.56 + 0.21, 0.35);
  },
  firework: C => {
    profileBody(C, 'pickup');
    const { X, H } = C;
    ['#e63946', '#f4a261', '#2a9d8f', '#9b5de5', '#00bbf9'].forEach((col, i) => { // Raketen
      const x = X(0.08 + (i % 3) * 0.12), z = (i < 3 ? -0.35 : 0.35), y = H * 0.56;
      C.cyl(0.08, 0.08, 0.8, mat(col), x, y + 0.4, z);
      C.cyl(0, 0.11, 0.22, mat(col), x, y + 0.91, z);
    });
  },
  towtruck: C => {
    profileBody(C, 'pickup');
    const { X, H, M } = C;
    const boom = C.box(C.L * 0.5, 0.18, 0.18, M.steel, X(0.25), H * 0.85, 0); // Ausleger
    boom.rotation.z = -0.35;
    C.cyl(0.02, 0.02, 0.8, M.dark, X(0.03), H * 0.55, 0); // Seil und Haken
    const hook = C.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16, PI * 1.4), M.steel), X(0.03), H * 0.2, 0);
    hook.rotation.z = PI * 0.8;
    const amber = C.box(0.3, 0.12, 0.7, new THREE.MeshStandardMaterial({ color: 0x7a5200, emissive: 0xffb020, emissiveIntensity: 0 }), C.roofX, C.roofY + 0.06, 0);
    amber.userData.blink = 1;
  },
  dumper: C => {
    profileBody(C, 'pickup', { wheels: [0.16, 0.85], classic: true });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.38));
    C.box(L * 0.5, H * 0.38, 0.08, C.paint, X(0.26), H * 0.75, C.W / 2 - 0.06); // Mulde
    C.box(L * 0.5, H * 0.38, 0.08, C.paint, X(0.26), H * 0.75, -C.W / 2 + 0.06);
    C.box(0.08, H * 0.38, C.W, C.paint, X(0.01), H * 0.75, 0);
    C.sph(1, mat(0xd9b26f, { roughness: 1 }), X(0.26), H * 0.56, 0, [L * 0.24, H * 0.5, C.W * 0.42], 'top'); // Sand
  },
  snowplow: C => {
    profileBody(C, 'pickup');
    const { X, H, L, W, M } = C;
    C.sph(1, M.white, X(0.25), H * 0.56, 0, [L * 0.22, H * 0.42, W * 0.4], 'top'); // Schnee
    const blade = C.box(0.12, H * 0.5, W * 1.25, M.steel, L / 2 + 0.35, H * 0.25, 0); // Pflugschild
    blade.rotation.y = 0.25;
    const amber = C.box(0.3, 0.12, 0.7, new THREE.MeshStandardMaterial({ color: 0x7a5200, emissive: 0xffb020, emissiveIntensity: 0 }), C.roofX, C.roofY + 0.06, 0);
    amber.userData.blink = 1;
  },
  cement: C => {
    profileBody(C, 'pickup', { wheels: [0.16, 0.85], classic: true });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.38));
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; stripes([C.v.special ? '#ffd34d' : C.v.color, '#f4f4f4'], true)(c.getContext('2d'), 128, 64); return c; })());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const drum = C.cyl(H * 0.42, H * 0.28, L * 0.5, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.4, roughness: 0.4 }), X(0.27), H * 0.95, 0, [0, 0, PI / 2 + 0.12], 24);
    drum.userData.roll = true; // dreht sich
  },
  crane: C => {
    profileBody(C, 'pickup', { wheels: [0.12, 0.88], classic: true });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.3)); C.wheelPair(X(0.7));
    C.cyl(0.55, 0.6, 0.35, C.paint, X(0.25), H * 0.64, 0); // Drehteller
    const boom = C.box(L * 0.85, 0.32, 0.32, C.paint, X(0.55), H * 0.95 + 0.4, 0); // Ausleger
    boom.rotation.z = 0.12;
    C.cyl(0.02, 0.02, 1.2, M.dark, X(0.95), H * 0.95, 0);
    C.box(0.2, 0.18, 0.2, M.dark, X(0.95), H * 0.6, 0);
  },
  jeep: C => jeepBody(C),
  safari: C => {
    jeepBody(C);
    C.decal(C.L * 0.92, C.H * 0.38, 0, C.H * 0.42, (g, w, h) => { // Zebrastreifen
      g.fillStyle = 'rgba(25,25,25,0.85)';
      for (let x = 10; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 4, h); g.lineTo(x - 12, h); g.fill(); }
    });
  },
  minivan: C => {
    profileBody(C, 'suv');
    C.decal(0.04, C.H * 0.32, C.X(0.42), C.H * 0.42, band('rgba(0,0,0,0.35)')); // Schiebetür
  },
  monster: C => {
    const lift = liftedTruck(C);
    C.decal(C.L * 0.5, 0.35, C.X(0.4), lift + 0.2, (g, w, h) => { // Flammen
      g.fillStyle = '#ff8c1a';
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i <= 6; i++) g.lineTo(w * i / 6, i % 2 ? h * 0.1 : h * 0.7);
      g.lineTo(w, h); g.fill();
    }, -0.05);
  },
  buggy: C => {
    const { X, H, L, W, r, M } = C;
    C.ext([[X(0), H * 0.3], [X(0), H * 0.55], [X(0.85), H * 0.55], [X(1), H * 0.35], [X(0.9), H * 0.25], [X(0.1), H * 0.25]], W - 0.5, C.paint);
    for (const s of [-1, 1]) { // Überrollbügel
      const a = C.box(0.07, H * 0.55, 0.07, M.dark, X(0.3), H * 0.82, s * 0.6); a.rotation.z = 0.25;
      const b = C.box(0.07, H * 0.55, 0.07, M.dark, X(0.62), H * 0.82, s * 0.6); b.rotation.z = -0.25;
      C.box(L * 0.32, 0.07, 0.07, M.dark, X(0.46), H * 1.06, s * 0.6);
    }
    C.sph(0.2, M.skin, X(0.48), H * 0.75, 0);
    C.lights(L / 2, -L / 2, H * 0.42);
    C.wheelPair(X(0.18), r, 0.4); C.wheelPair(X(0.82), r, 0.4);
  },
  tractor: C => {
    C.W = 2.2; // breite Spur: die grossen Räder stehen aussen neben der Kabine
    const { X, H, L, W, M } = C;
    C.box(L * 0.42, H * 0.75, 1.15, C.paint, X(0.29), H * 0.62, 0); // Kabine
    C.box(L * 0.32, H * 0.36, 1.2, M.glass, X(0.29), H * 0.8, 0);
    for (const s of [-1, 1]) C.box(L * 0.42, 0.08, 0.45, C.paint, X(0.29), 1.25, s * 0.8); // Kotflügel über den Hinterrädern
    C.box(L * 0.58, H * 0.34, 0.9, C.paint, X(0.71), H * 0.42, 0); // Motorhaube
    C.decal(L * 0.3, 0.2, X(0.75), H * 0.4, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 4; x < w; x += 14) g.fillRect(x, 4, 6, h - 8); }, 0.45 - W / 2);
    C.cyl(0.07, 0.07, 0.7, M.dark, X(0.78), H * 0.58 + 0.35, 0.25); // Auspuff
    C.lights(L / 2, -L / 2 + 0.05, H * 0.45);
    C.wheelPair(X(0.28), 0.6, 0.45); // grosse Hinterräder
    C.wheelPair(X(0.84), C.r, 0.3);
  },
  excavator: C => {
    const { X, H, L, W, M } = C;
    for (const s of [-1, 1]) { // Raupenketten
      C.box(L * 0.68, 0.5, 0.55, mat(0x1d1d1f, { roughness: 0.9 }), X(0.35), 0.25, s * (W / 2 - 0.25));
      for (let i = 0; i < 4; i++) C.cyl(0.18, 0.18, 0.58, M.steel, X(0.08 + i * 0.18), 0.25, s * (W / 2 - 0.25), [PI / 2, 0, 0]);
    }
    C.box(L * 0.7, H * 0.28, W - 0.2, C.paint, X(0.35), 0.5 + H * 0.14, 0); // Oberwagen
    C.box(L * 0.3, H * 0.45, W * 0.55, C.paint, X(0.5), 0.5 + H * 0.5, -0.2); // Kabine
    C.box(L * 0.24, H * 0.25, W * 0.57, M.glass, X(0.52), 0.5 + H * 0.55, -0.2);
    const arm = new THREE.Group(); // Arm mit Schaufel
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, 0.25, 0.3), C.paint); a1.position.x = L * 0.2; a1.rotation.z = 0.5;
    const a2 = new THREE.Mesh(new THREE.BoxGeometry(L * 0.3, 0.22, 0.28), C.paint); a2.position.set(L * 0.42, L * 0.08, 0); a2.rotation.z = -0.7;
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.7), M.steel); bucket.position.set(L * 0.53, -L * 0.04, 0);
    for (const m of [a1, a2, bucket]) { m.castShadow = true; arm.add(m); }
    arm.position.set(X(0.65), 0.5 + H * 0.35, 0.3);
    C.body.add(arm);
    C.arm = arm;
  },
  train: C => {
    const { X, H, L, W, M } = C;
    C.box(L * 0.3, H * 0.75, W - 0.2, C.paint, X(0.15), H * 0.5, 0); // Führerhaus
    C.box(L * 0.34, 0.12, W, mat(0xb5382f), X(0.15), H * 0.9, 0);
    C.box(L * 0.18, H * 0.25, W - 0.18, M.glass, X(0.15), H * 0.62, 0);
    C.cyl(H * 0.24, H * 0.24, L * 0.62, C.paint, X(0.6), H * 0.48, 0, [0, 0, PI / 2], 24); // Kessel
    for (const f of [0.45, 0.65]) C.cyl(H * 0.25, H * 0.25, 0.08, M.gold, X(f), H * 0.48, 0, [0, 0, PI / 2], 24);
    C.cyl(0.18, 0.12, H * 0.32, M.dark, X(0.8), H * 0.86, 0); // Schornstein
    C.cyl(0.26, 0.26, 0.1, M.dark, X(0.8), H * 1.03, 0);
    C.sph(0.22, M.gold, X(0.56), H * 0.7, 0, [1, 1, 1], 'top'); // Dampfdom
    const cow = C.add(new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 4), mat(0xb5382f)), X(0.97), 0.3, 0); // Schienenräumer
    cow.rotation.set(0, PI / 4, -PI / 2, 'ZYX');
    C.sph(0.15, M.head, X(0.92), H * 0.55, 0);
    const red = mat(0xc0392b, { metalness: 0.5 });
    for (const f of [0.25, 0.47, 0.69]) C.wheelPair(X(f), 0.45, 0.2, red);
    C.wheelPair(X(0.9), 0.26, 0.2, red);
  },
  van: C => profileBody(C, 'bus'),
  postauto: C => {
    profileBody(C, 'bus');
    C.decal(C.L * 0.98, 0.14, 0, C.H * 0.38, band('#2b2b2b'));
  },
  doubledecker: C => {
    profileBody(C, 'bus');
    C.ext([[C.X(0.03), C.H * 0.28], [C.X(0.03), C.H * 0.46], [C.X(0.97), C.H * 0.46], [C.X(0.97), C.H * 0.28]], C.W, C.M.glass, 0.02);
    C.decal(C.L * 0.98, 0.1, 0, C.H * 0.52, band('#f5d000'));
  },
  delivery: C => {
    profileBody(C, 'box');
    C.decal(1.0, 0.8, C.X(0.36), C.H * 0.6, (g, w, h) => { g.fillStyle = '#c8955a'; g.fillRect(0, 0, w, h); g.fillStyle = '#8d5a2b'; g.fillRect(w * 0.44, 0, w * 0.12, h); });
  },
  umzug: C => {
    profileBody(C, 'box');
    C.decal(C.L * 0.6, 0.5, C.X(0.36), C.H * 0.75, band('#ffffff', 'UMZUG', '#333'));
    C.decal(0.8, 0.5, C.X(0.36), C.H * 0.45, text('🛋️', '#000'));
  },
  bakery: C => {
    profileBody(C, 'box');
    C.decal(1.4, 0.7, C.X(0.36), C.H * 0.6, (g, w, h) => {
      g.fillStyle = '#c8955a'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.35, -0.1, 0, PI * 2); g.fill();
      g.strokeStyle = '#8d5a2b'; g.lineWidth = w * 0.03;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(w / 2 + i * w * 0.2 - w * 0.04, h * 0.3); g.lineTo(w / 2 + i * w * 0.2 + w * 0.04, h * 0.7); g.stroke(); }
    });
  },
  armored: C => {
    profileBody(C, 'box');
    C.decal(C.L * 0.72, C.H * 0.7, C.X(0.36), C.H * 0.6, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 10; x < w; x += 24) { g.beginPath(); g.arc(x, 8, 3, 0, PI * 2); g.arc(x, h - 8, 3, 0, PI * 2); g.fill(); }
      g.fillStyle = '#1f2937'; g.fillRect(w * 0.1, h * 0.15, w * 0.15, h * 0.08); g.fillRect(w * 0.7, h * 0.15, w * 0.15, h * 0.08);
      g.fillStyle = '#b8860b'; g.beginPath(); g.arc(w / 2, h * 0.55, h * 0.2, 0, PI * 2); g.fill();
      g.fillStyle = '#ffd700'; g.beginPath(); g.arc(w / 2, h * 0.55, h * 0.16, 0, PI * 2); g.fill();
    });
  },
  treasure: C => {
    profileBody(C, 'box');
    const { X, H } = C;
    C.decal(0.8, 0.8, X(0.36), H * 0.55, text('☠', '#ffd700'));
    C.box(1.1, 0.5, 0.75, mat(0x8b5a2b), X(0.36), H + 0.3, 0); // Schatztruhe
    C.box(1.12, 0.08, 0.77, C.M.gold, X(0.36), H + 0.4, 0);
    for (const [dx, dz] of [[-0.35, 0.2], [0.3, -0.15], [0, 0.1]]) C.sph(0.14, C.M.gold, X(0.36) + dx, H + 0.62, dz, [1, 0.35, 1]);
  },
  hotdog: C => {
    profileBody(C, 'box');
    const { X, H, L } = C;
    C.decal(L * 0.4, H * 0.3, X(0.36), H * 0.62, band('#bfe3ff'));
    const bun = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.3, L * 0.45, 6, 16), mat(0xe3a857, { roughness: 0.8 })), X(0.36), H + 0.3, 0);
    bun.rotation.z = PI / 2; bun.scale.set(1, 1, 1.4);
    const sausage = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, L * 0.55, 6, 16), mat(0xb4432c, { roughness: 0.5 })), X(0.36), H + 0.55, 0);
    sausage.rotation.z = PI / 2;
    C.box(L * 0.5, 0.04, 0.08, mat(0xffd60a), X(0.36), H + 0.73, 0); // Senf
  },
  icecream: C => {
    profileBody(C, 'box');
    const { X, H } = C;
    C.decal(C.L * 0.55, 0.35, X(0.36), H * 0.82, stripes(['#ff5fa2', '#ffffff'])); // Markise
    C.decal(C.L * 0.5, H * 0.3, X(0.36), H * 0.58, band('#bfe3ff'));
    C.cyl(0.32, 0.02, 0.8, mat(0xd9a25f), X(0.36), H + 0.4, 0); // Cornet
    C.sph(0.34, mat(0x8ef0c8), X(0.36), H + 0.85, 0);
    C.sph(0.26, mat(0xff7eb6), X(0.36) + 0.05, H + 1.15, 0);
  },
  ambulance: C => {
    profileBody(C, 'box');
    const { X, H } = C;
    C.decal(C.L, 0.22, 0, H * 0.42, band('#e02424'));
    C.decal(0.8, 0.8, X(0.36), H * 0.7, (g, w, h) => { g.fillStyle = '#e02424'; g.fillRect(w * 0.36, 0, w * 0.28, h); g.fillRect(0, h * 0.36, w, h * 0.28); });
    C.blueLights(X(0.1), H + 0.1, 0.6);
    C.blueLights(X(0.65), H + 0.1, 0.6);
  },
  garbage: C => {
    profileBody(C, 'box');
    const { X, H } = C;
    C.decal(C.L * 0.7, C.H * 0.6, X(0.36), H * 0.6, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 8; x < w; x += 40) g.fillRect(x, 6, 14, h - 12);
      text('♻', '#fff', Math.round(h * 0.6))(g, w, h);
    });
    C.box(0.4, H * 0.45, C.W * 0.9, C.M.dark, -C.L / 2 - 0.15, H * 0.42, 0); // Schüttung hinten
  },
  camper: C => {
    profileBody(C, 'box');
    C.bodyMesh.material = mat(0xf5f1e6, { roughness: 0.4 });
    const stripe = C.v.special ? '#ffc83d' : C.v.color;
    C.decal(C.L * 0.98, 0.35, 0, C.H * 0.38, (g, w, h) => { g.fillStyle = stripe; g.fillRect(0, 0, w, h * 0.55); g.fillRect(0, h * 0.7, w, h * 0.3); });
    C.decal(C.L * 0.18, C.H * 0.25, C.X(0.16), C.H * 0.72, band('#bfe3ff'));
    C.decal(C.L * 0.16, C.H * 0.25, C.X(0.56), C.H * 0.72, band('#bfe3ff'));
    C.decal(C.L * 0.1, C.H * 0.6, C.X(0.38), C.H * 0.52, band('#c9c2b0'));
  },
  firetruck: C => {
    profileBody(C, 'box', { wheels: [0.14, 0.86] });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.36));
    C.decal(L * 0.72, H * 0.45, X(0.36), H * 0.6, (g, w, h) => { // Rolltore
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < 3; i++) g.fillRect(i * w / 3 + 6, 4, w / 3 - 12, h - 8);
    });
    C.decal(L * 0.74, 0.1, X(0.36), H * 0.3, band('#f4f4f4'));
    for (const s of [-1, 1]) C.box(L * 0.72, 0.07, 0.07, M.steel, X(0.37), H + 0.25, s * 0.45); // Leiter
    for (let f = 0.04; f < 0.72; f += 0.05) C.box(0.05, 0.05, 0.9, M.steel, X(f), H + 0.25, 0);
    C.blueLights(X(0.82), H * 0.75, 0.6);
  },
  heli: C => {
    const { X, L, M } = C;
    C.W = 2;
    const cab = C.sph(1, C.paint, X(0.62), 1.4, 0, [L * 0.28, 1.0, 0.95]);
    C.sph(0.75, M.glass, X(0.8), 1.55, 0, [1, 0.8, 0.9]);
    C.cyl(0.12, 0.3, L * 0.5, C.paint, X(0.2), 1.6, 0, [0, 0, PI / 2]);
    C.box(0.5, 0.6, 0.06, C.paint, X(0.02), 1.95, 0);
    const rotor = C.box(L * 1.1, 0.04, 0.22, M.dark, X(0.6), 2.55, 0);
    rotor.userData.spin = true;
    C.cyl(0.06, 0.06, 0.25, M.dark, X(0.6), 2.42, 0);
    for (const s of [-1, 1]) C.box(L * 0.55, 0.08, 0.08, M.dark, X(0.62), 0.25, s * 0.8);
    cab.castShadow = true;
  },
  ufo: C => {
    const { L, M } = C;
    C.W = L * 0.9;
    C.sph(L / 2, C.paint, 0, 1.0, 0, [1, 0.18, 0.9]);
    C.sph(L * 0.2, M.glass, 0, 1.15, 0, [1, 1, 1], 'top');
    C.sph(0.28, mat(0x6fdc5a), 0, 1.35, 0);
    for (let i = 0; i < 8; i++) {
      const lamp = C.sph(0.12, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color().setHSL(i / 8, 1, 0.5), emissiveIntensity: 1.5 }),
        Math.cos(i / 8 * PI * 2) * L * 0.42, 0.95, Math.sin(i / 8 * PI * 2) * L * 0.38);
      lamp.castShadow = false;
    }
  },
  hovercraft: C => {
    const { X, H, L, W, M } = C;
    C.W = 2.2;
    const skirt = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.35, L - 0.8, 6, 16), mat(0x1d1d1f, { roughness: 0.9 })), 0, 0.35, 0);
    skirt.rotation.z = PI / 2; skirt.scale.set(1, 1, 3);
    C.box(L * 0.9, 0.35, 2, C.paint, 0, 0.85, 0);
    C.box(L * 0.38, H * 0.35, 1.5, C.paint, X(0.62), 1.2, 0);
    C.box(L * 0.18, H * 0.2, 1.52, M.glass, X(0.7), 1.25, 0);
    const cage = C.add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 24), M.steel), X(0.14), 1.6, 0);
    cage.rotation.y = PI / 2;
    const fan = C.box(0.06, 1.3, 0.16, M.dark, X(0.14), 1.6, 0);
    fan.userData.fan = true;
  },
  amphibian: C => {
    const { X, H, L, W, r, M } = C;
    C.ext([[X(0), H * 0.25], [X(0), H * 0.62], [X(0.8), H * 0.62], [X(1.02), H * 0.75], [X(0.92), H * 0.25]], W - 0.3, C.paint); // Bootsrumpf
    C.decal(L * 0.85, 0.1, X(0.42), H * 0.5, band('#ffffff'));
    const ws = C.box(0.05, 0.42, W * 0.7, M.glass, X(0.6), H * 0.62 + 0.24, 0); ws.rotation.z = -0.4;
    C.sph(0.2, M.skin, X(0.42), H * 0.62 + 0.3, 0);
    for (const s of [-1, 1]) {
      const ring = C.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 20), mat(0xe02424)), X(0.25), H * 0.45, s * (W / 2 + 0.03));
      ring.rotation.y = 0;
    }
    const prop = C.box(0.06, 0.5, 0.12, M.steel, X(0) - 0.15, r * 0.9, 0);
    prop.userData.fan = true;
    C.lights(L / 2, -L / 2, H * 0.55);
    C.wheelPair(X(0.22)); C.wheelPair(X(0.8));
  },
  royal: C => {
    const { X, H, L, W, M } = C;
    C.W = 1.7;
    const box = C.ext([[X(0.08), H * 0.3], [X(0.08), H * 0.78], [X(0.2), H * 0.92], [X(0.68), H * 0.92], [X(0.8), H * 0.78], [X(0.8), H * 0.3]], 1.4, C.paint, 0.12);
    box.material.metalness = Math.max(box.material.metalness, 0.6);
    C.decal(L * 0.28, H * 0.3, X(0.44), H * 0.62, band('#bfe3ff'), -0.02);
    C.box(L * 0.2, 0.08, 1.2, mat(0x5b3a1a), X(0.9), H * 0.45, 0); // Kutschbock
    const crown = C.cyl(0.32, 0.32, 0.3, M.gold, X(0.44), H * 0.92 + 0.35, 0, [0, 0, 0], 16); // Krone
    for (let i = 0; i < 5; i++) C.cyl(0, 0.09, 0.25, M.gold, X(0.44) + Math.cos(i / 5 * PI * 2) * 0.28, H * 0.92 + 0.62, Math.sin(i / 5 * PI * 2) * 0.28);
    C.sph(0.07, mat(0xe11d48), X(0.44), H * 0.92 + 0.4, 0.33);
    crown.castShadow = true;
    for (const s of [-1, 1]) C.sph(0.1, M.head, X(0.82), H * 0.85, s * 0.75); // Laternen
    C.wheelPair(X(0.2), 0.62, 0.12, M.gold); C.wheelPair(X(0.78), 0.62, 0.12, M.gold);
  },
  shuttle: C => {
    const { X, H, L, M } = C;
    C.W = 2.4;
    const by = H * 0.55;
    C.cyl(0.65, 0.7, L * 0.78, M.white, X(0.4), by, 0, [0, 0, PI / 2], 24); // Rumpf
    C.add(new THREE.Mesh(new THREE.SphereGeometry(0.65, 24, 16, 0, PI * 2, 0, PI / 2), M.white), X(0.79), by, 0).rotation.z = -PI / 2;
    C.box(L * 0.7, 0.1, 1.2, M.dark, X(0.42), by - 0.6, 0); // Hitzeschild
    const wing = extrude([[X(0.62), 0], [X(0.12), 1.7], [X(0.12), -1.7]], 0.08, M.white, 0.03); // Deltaflügel
    wing.rotation.x = -PI / 2;
    C.add(wing, 0, by - 0.35, 0);
    C.ext([[X(0.02), by + 0.5], [X(0.14), by + 1.9], [X(0.24), by + 1.9], [X(0.3), by + 0.5]], 0.12, M.white, 0.03); // Leitwerk
    C.box(0.35, 0.22, 0.9, M.dark, X(0.82), by + 0.38, 0); // Cockpit
    C.decal(1.2, 0.3, X(0.45), by + 0.1, text('SAVER', '#e11d48'), 0.45);
    const flame = C.cyl(0, 0.4, 1.4, new THREE.MeshBasicMaterial({ color: 0xffa020 }), X(0) - 0.7, by, 0, [0, 0, PI / 2]);
    flame.userData.flame = true;
    for (const f of [0.2, 0.8]) C.box(0.06, by - 0.6, 0.06, M.dark, X(f), (by - 0.6) / 2 + C.r, 0);
    C.wheelPair(X(0.2), C.r, 0.2); C.wheelPair(X(0.8), C.r, 0.2);
  },
  dragon: C => {
    profileBody(C, 'sedan');
    const { X, H, L, W } = C;
    const scale = mat(0x1b7a33, { roughness: 0.6 });
    // Kopf mit Maul, Hörnern und Augen vorne auf der Haube
    const head = C.sph(1, C.paint, L / 2 + 0.15, H * 0.75, 0, [0.6, 0.38, 0.45]);
    head.castShadow = true;
    C.sph(1, C.paint, L / 2 + 0.55, H * 0.68, 0, [0.4, 0.22, 0.32]); // Schnauze
    for (const s of [-1, 1]) {
      C.cyl(0, 0.08, 0.5, mat(0xffd166), L / 2 + 0.05, H * 0.75 + 0.42, s * 0.22, [0, 0, 0.5]); // Hörner
      C.sph(0.09, mat(0xffffff, { emissive: 0xfff3a0, emissiveIntensity: 0.4 }), L / 2 + 0.42, H * 0.82, s * 0.28);
      C.sph(0.05, mat(0x111111), L / 2 + 0.48, H * 0.82, s * 0.3);
      // Flügel auf dem Dach (schlagen)
      const wingGroup = new THREE.Group();
      const wing = extrude([[0, 0], [-1.2, 1.4], [-0.4, 0.9], [0.3, 1.6], [0.9, 0]], 0.04, scale, 0.02);
      wing.rotation.x = s * PI / 2;
      wingGroup.add(wing);
      wingGroup.position.set(C.roofX, C.roofY - 0.05, s * 0.3);
      wingGroup.userData.flap = -s; // nach oben schlagen
      C.body.add(wingGroup);
    }
    // Schwanz hinten
    // flach nach hinten, damit er auf der Rennstrecke nicht die Sicht versperrt
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-L / 2, H * 0.5, 0), new THREE.Vector3(-L / 2 - 0.7, H * 0.42, 0.15), new THREE.Vector3(-L / 2 - 1.3, H * 0.55, -0.15), new THREE.Vector3(-L / 2 - 1.7, H * 0.8, 0)]);
    C.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.11, 8), C.paint));
    const tip = C.add(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 4), mat(0xffd166)), -L / 2 - 1.8, H * 0.92, 0);
    tip.rotation.z = 0.6;
    for (let i = 0; i < 5; i++) C.add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), scale), X(0.08 + i * 0.12), C.roofY + 0.05, 0); // Rückenstacheln
  },
  unicorn: C => {
    profileBody(C, 'sedan');
    const { H, L } = C;
    C.cyl(0, 0.12, 0.8, C.M.gold, C.roofX + 0.6, C.roofY + 0.4, 0, [0, 0, -0.5]); // goldenes Horn
    [0, 35, 55, 120, 210, 275].forEach((hue, i) => { // Regenbogen-Mähne
      C.sph(0.16, mat(new THREE.Color().setHSL(hue / 360, 0.9, 0.6)), C.roofX - 0.6 + i * 0.22, C.roofY + 0.08, 0, [1, 0.7, 1.4]);
    });
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-L / 2, H * 0.55, 0), new THREE.Vector3(-L / 2 - 0.5, H * 0.5, 0), new THREE.Vector3(-L / 2 - 0.7, H * 0.2, 0)]);
    const tail = C.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.12, 8), mat(0xff7eb6)));
    tail.userData.rainbow = true;
    for (const s of [-1, 1]) C.sph(0.07, mat(0x6d28d9), L / 2 - 0.25, H * 0.5, s * (C.W / 2 - 0.05));
  },
  racer: C => {
    formula(C, 0.42, 0.34);
    C.decal(0.34, 0.32, C.X(0.36), 0.38, (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.45, 0, PI * 2); g.fill(); text('7', '#111')(g, w, h); }, -0.16);
  },
  dragster: C => formula(C, 0.62, 0.26),
  pizza: C => {
    bike(C);
    C.box(0.5, 0.42, 0.5, mat(0xe8d3a6), C.X(0.1), 1.05, 0); // Pizzaschachtel
    C.decal(0.48, 0.14, C.X(0.1), 1.05, text('PIZZA', '#c0392b'), -0.1);
  },
  scooter: C => bike(C),
  policebike: C => {
    bike(C);
    C.blueLights(C.X(0.1), 1.1, 0.15);
  },
};

// Hochgelegter Pickup auf Riesenrädern (Monstertruck, Polar-Truck)
function liftedTruck(C, rimMat) {
  const { X, H, L, W, r, M } = C;
  const lift = r * 1.5;
  const P = PROFILE.pickup;
  const body = P.body.map(([x, y]) => [X(x), lift + (y - 0.26) * H * 0.75]);
  C.bodyMesh = C.ext(roundPoly(body, 0.16), W - 0.4, C.paint);
  const [rb, rt, ft, fb, by, ty] = P.cabin;
  C.ext(roundPoly([[X(rb - 0.25), lift + (by - 0.26) * H * 0.75], [X(rt - 0.22), lift + (ty - 0.26) * H * 0.75], [X(ft - 0.1), lift + (ty - 0.26) * H * 0.75], [X(fb - 0.05), lift + (by - 0.26) * H * 0.75]], 0.08), W * 0.7, M.glass, 0.04);
  for (const x of [X(0.2), X(0.8)]) for (const s of [-1, 1]) C.box(0.12, lift, 0.12, M.dark, x, lift * 0.75, s * 0.6); // Federbeine
  C.box(L * 0.8, 0.2, 0.9, M.dark, 0, lift * 0.85, 0); // Rahmen
  C.lights(L / 2 + 0.03, -L / 2 - 0.03, lift + 0.15);
  C.wheelPair(X(0.2), r, 0.7, rimMat, 6); C.wheelPair(X(0.8), r, 0.7, rimMat, 6);
  C.roofY = lift + (ty - 0.26) * H * 0.75 + 0.1;
  C.roofX = X((rt + ft) / 2 - 0.15);
  C.bedY = lift + (0.56 - 0.26) * H * 0.75;
  return lift;
}

// Dachreling auf Füssen (len: Anteil der Länge, z: Abstand von der Mitte als Anteil der Breite)
function roofRails(C, len, z) {
  const x = C.roofX, l = C.L * len, y = C.roofY - 0.02;
  for (const s of [-1, 1]) {
    C.box(l, 0.04, 0.045, C.M.dark, x, y + 0.04, s * C.W * z);
    for (const f of [-0.48, 0.48]) C.box(0.08, 0.06, 0.06, C.M.dark, x + f * l, y + 0.01, s * C.W * z);
  }
}

function jeepBody(C) {
  profileBody(C, 'suv');
  const { H, M } = C;
  C.cyl(C.r * 0.95, C.r * 0.95, 0.3, M.tyre, -C.L / 2 - 0.18, H * 0.55, 0, [0, 0, PI / 2], 20); // Reserverad
  roofRails(C, 0.45, 0.28);
}

function formula(C, rearR, frontR) {
  const { X, M } = C;
  C.W = 1.9;
  C.ext([[X(0), .18], [X(0), .5], [X(.28), .55], [X(.38), .9], [X(.48), .62], [X(1), .3], [X(1), .18]], 0.85, C.paint);
  for (const s of [-1, 1]) C.box(C.L * 0.32, 0.38, 0.38, C.paint, X(.36), 0.38, s * 0.6); // Seitenkästen
  C.box(0.5, 0.08, 1.8, M.dark, X(.03), 1.05, 0); // Heckflügel
  for (const s of [-1, 1]) C.box(0.08, 0.5, 0.08, M.dark, X(.05), 0.8, s * 0.5);
  C.box(0.45, 0.06, 1.9, M.dark, X(.98), 0.2, 0); // Frontflügel
  C.sph(0.26, mat(0xffffff, { roughness: 0.3 }), X(.4), 0.95, 0); // Helm
  for (const s of [-1, 1]) {
    C.wheels.push(wheel(rearR, 0.45, C.group, X(.14), s * 0.95));
    C.wheels.push(wheel(frontR, 0.36, C.group, X(.86), s * 0.9));
  }
}

function bike(C) {
  const { X, M } = C;
  C.W = 0.7;
  C.ext([[X(.08), .49], [X(.55), .59], [X(.8), 1.05], [X(.95), .7], [X(.85), .42], [X(.2), .42]], 0.45, C.paint);
  C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), mat(0x1f3b73, { roughness: 0.7 })), X(.45), 1.25, 0);
  C.sph(0.2, mat(0xffffff, { roughness: 0.3 }), X(.47), 1.75, 0);
  C.box(0.06, 0.06, 0.6, M.dark, X(.82), 1.15, 0); // Lenker
  C.wheels.push(wheel(0.3, 0.14, C.group, X(.15), 0));
  C.wheels.push(wheel(0.3, 0.14, C.group, X(.85), 0));
}

// Baut ein 3D-Fahrzeug. hDiv: Pixel der 2D-Höhe pro Meter (Standard: hohe Fahrzeuge 20, sonst 27)
// Jedes Fahrzeug (Typ, Lack, Farbe) wird nur einmal gebaut und danach kopiert: Kopien teilen sich
// Formen und Materialien, das spart beim Erscheinen eines Autos viel Zeit. Geteilte Formen nie freigeben!
// ---------- Tuning (Werkstatt in game.js): grosse Räder, Spoiler, Neonlicht, Sticker ----------
const STICKERS = {
  flames: (g, w, h) => { // Flammen von vorne nach hinten
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#dc2626'); gr.addColorStop(0.6, '#f97316'); gr.addColorStop(1, '#facc15');
    g.fillStyle = gr; g.beginPath(); g.moveTo(w, h * 0.2);
    for (let i = 0; i <= 10; i++) g.lineTo(w - w * i / 10, i % 2 ? h * 0.5 : h * (0.05 + 0.1 * Math.sin(i)));
    g.lineTo(0, h * 0.95); g.lineTo(w, h * 0.8); g.fill();
  },
  stripes: (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.18, w, h * 0.22); g.fillRect(0, h * 0.6, w, h * 0.22); },
  stars: (g, w, h) => {
    g.fillStyle = '#facc15';
    for (let k = 0; k < 5; k++) {
      const cx = w * (0.12 + k * 0.19), cy = h * (k % 2 ? 0.35 : 0.65), r = h * 0.3;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.fill();
    }
  },
  lightning: (g, w, h) => {
    g.fillStyle = '#facc15'; g.strokeStyle = '#111'; g.lineWidth = h * 0.05;
    g.beginPath(); g.moveTo(w * 0.05, h * 0.5); g.lineTo(w * 0.45, h * 0.1); g.lineTo(w * 0.42, h * 0.42); g.lineTo(w * 0.95, h * 0.5);
    g.lineTo(w * 0.55, h * 0.9); g.lineTo(w * 0.58, h * 0.58); g.closePath(); g.fill(); g.stroke();
  },
};
function applyTune(C, tune) {
  const { L, W, M } = C;
  if (tune.wheels) for (const w of [...C.wheels, ...C.group.getObjectsByProperty('name', 'caliper')]) { const r = w.position.y; w.scale.multiplyScalar(1.22); w.position.y = r * 1.22; }
  if (tune.spoiler) { // Heckflügel über dem Heck: Höhe des Hecks aus dem Seitenprofil (sonst aus den Teilen hinten)
    let top = 0.6;
    if (C.side) for (const [x, y] of C.side.pts) { if (x < -L / 2 + L * 0.18) top = Math.max(top, y); }
    else {
      C.body.updateMatrixWorld(true);
      const box = new THREE.Box3();
      C.body.traverse(o => { if (!o.isMesh) return; box.setFromObject(o); if (box.max.x < -L / 2 + L * 0.3 && box.max.y < 3.5) top = Math.max(top, box.max.y); });
    }
    const carbon = mat(0x111214, { roughness: 0.35, metalness: 0.3 });
    C.box(0.55, 0.06, Math.min(W, 2.2) * 0.95, carbon, -L / 2 + 0.35, top + 0.32, 0);
    for (const sz of [-1, 1]) C.box(0.1, 0.34, 0.06, carbon, -L / 2 + 0.4, top + 0.15, sz * Math.min(W, 2.2) * 0.3);
  }
  if (tune.neon) { // Neonlicht unter dem Auto: leuchtender Schein am Boden und Leuchtstreifen an der Seite
    const col = new THREE.Color(tune.neon);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.05, Math.max(1, W) * 1.35),
      new THREE.MeshBasicMaterial({ color: col, map: M.shadow.map, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -PI / 2; glow.position.y = 0.07; glow.renderOrder = 1;
    C.group.add(glow);
    const strip = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5 });
    for (const sz of [-1, 1]) C.box(L * 0.7, 0.05, 0.05, strip, 0, 0.22, sz * (Math.min(W, 2.2) / 2 - 0.12));
  }
  if (tune.sticker && STICKERS[tune.sticker]) {
    const s = C.side, y0 = s ? s.bottom : 0.3, y1 = s ? (s.tall ? s.top * 0.55 + s.bottom * 0.45 : s.top) : C.H * 0.6;
    C.decal(L * 0.66, (y1 - y0) * 0.58, 0, y0 + (y1 - y0) * 0.42, STICKERS[tune.sticker], -0.004);
  }
}

const templates = new Map();
export function buildCar(v, kinds, hDiv) {
  const tune = v.tune || {};
  const key = [v.kind, v.special || '', v.color || '', hDiv || '', JSON.stringify(tune)].join('|');
  let t = templates.get(key);
  if (!t) {
    if (templates.size > 150) templates.clear();
    const C = kit(v, kinds, hDiv, BUILD[v.kind] ? SPEC_HINT[v.kind] || {} : {});
    (BUILD[v.kind] || BUILD.car)(C);
    if (C.side) sideDetails(C);
    applyTune(C, tune);
    mergeStatic(C.body);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), C.M.shadow); // weicher Schatten am Boden
    sh.rotation.x = -PI / 2;
    sh.scale.set(C.L * 1.12, Math.max(1, C.W) * 1.3, 1);
    sh.position.y = 0.05;
    sh.name = 'shadow';
    C.group.add(sh);
    // Augen für die Fahrersitz-Kamera; Fahrzeuge ohne Innenraum: knapp über dem Dach
    const eye = C.eye || [(C.roofX ?? 0) + 0.3, (C.roofY ?? C.H) + 0.3, 0];
    t = { group: C.group, paint: C.paint, radius: Math.max(1.2, Math.min(C.L, 4) / 2), length: C.L, eye };
    templates.set(key, t);
  }
  const g = t.group.clone();
  g.userData = { wheels: g.getObjectsByProperty('name', 'wheel'), paint: t.paint, body: g.getObjectByName('body'), shadow: g.getObjectByName('shadow'), radius: t.radius, length: t.length,
    eye: t.eye, driver: g.getObjectByName('driver'),
    finish: tune.finish || null };
  return g;
}

// Verschmilzt alle unbewegten Teile mit gleichem Material zu einem einzigen Stück: die Grafikkarte
// zeichnet dann ein Stück statt dutzender Einzelteile (bewegte Teile mit userData bleiben einzeln)
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map(), done = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.isSky) return;
    for (let q = o; q && q !== root; q = q.parent) if (Object.keys(q.userData).length) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    let e = byMat.get(o.material);
    if (!e) byMat.set(o.material, e = { geos: [], cast: false, receive: false });
    e.geos.push(g);
    e.cast = e.cast || o.castShadow;
    e.receive = e.receive || o.receiveShadow;
    done.push(o);
  });
  for (const o of done) o.parent.remove(o);
  for (const [material, e] of byMat) {
    const geo = mergeGeometries(e.geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = e.cast;
    m.receiveShadow = e.receive;
    root.add(m);
  }
}

// Alles vorab an die Grafikkarte schicken (Materialien übersetzen, Bilder hochladen),
// damit es nicht ruckelt, wenn etwas zum ersten Mal ins Bild kommt
export function warmUp(renderer, scene, camera) {
  renderer.compile(scene, camera);
  scene.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k]) renderer.initTexture(m[k]);
  });
}

// Wird das Gerät zu langsam, rechnet es mit weniger Pixeln (onChange setzt dann die Grösse neu)
export function makeQuality(renderer, onChange) {
  let acc = 0, n = 0;
  return dt => {
    if (dt > 0.1) return; // Tab im Hintergrund o. ä.: nicht mitzählen
    acc += dt; n++;
    if (acc < 2) return;
    const avg = acc / n;
    acc = 0; n = 0;
    const ratio = renderer.getPixelRatio();
    if (avg > 1 / 45 && ratio > 0.6) {
      renderer.setPixelRatio(Math.max(0.6, ratio - 0.2));
      onChange();
    }
  };
}
// Hohe Fahrzeuge (Kastenwagen, Busse) werden mit anderem Höhenmassstab gebaut
const SPEC_HINT = Object.fromEntries(
  ['delivery', 'umzug', 'bakery', 'armored', 'treasure', 'hotdog', 'icecream', 'ambulance', 'garbage', 'camper', 'firetruck', 'van', 'postauto', 'doubledecker']
    .map(kd => [kd, { arch: ['van', 'postauto', 'doubledecker'].includes(kd) ? 'bus' : 'box' }]));
for (const kd of ['pickup', 'firework', 'towtruck', 'dumper', 'snowplow', 'cement', 'crane']) SPEC_HINT[kd] = { arch: 'pickup' };
for (const kd of ['jeep', 'safari', 'minivan']) SPEC_HINT[kd] = { arch: 'suv' };
for (const kd of ['sports', 'muscle', 'rocketcar', 'timemachine']) SPEC_HINT[kd] = { arch: 'sport' };
for (const kd of ['mini', 'kompakt']) SPEC_HINT[kd] = { arch: 'compact' };
SPEC_HINT.kombi = { arch: 'kombi' };

// ---------- Runde 4: 40 neue Fahrzeuge ----------
// Rohr zwischen zwei Punkten in der Seitenansicht (x, y)
function tube(C, x0, y0, x1, y1, r, m, z = 0) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const o = C.cyl(r, r, len, m, (x0 + x1) / 2, (y0 + y1) / 2, z, [0, 0, Math.atan2(x0 - x1, y1 - y0)], 10);
  return o;
}
// Fahrer mit Helm (sitzt bei x auf Sitzhöhe y)
function rider(C, x, y, z = 0, helmet = 0xffffff) {
  C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 10), mat(0x1f3b73, { roughness: 0.7 })), x, y + 0.38, z);
  C.sph(0.16, C.M.skin, x + 0.02, y + 0.82, z);
  C.sph(0.19, mat(helmet, { roughness: 0.25, metalness: 0.2 }), x, y + 0.86, z, [1, 1, 1], 'top');
}
function beacon(C, x, y) {
  const b = C.box(0.3, 0.14, 0.5, new THREE.MeshStandardMaterial({ color: 0x7a5200, emissive: 0xffb020, emissiveIntensity: 0 }), x, y, 0);
  b.userData.blink = 1;
  return b;
}
// Raupenketten mit Laufrollen
function tracks(C, x, len, width = 0.55, h = 0.55) {
  for (const s of [-1, 1]) {
    const z = s * (C.W / 2 - width / 2);
    const t = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(h / 2, len - h, 4, 14), mat(0x1d1d1f, { roughness: 0.95 })), x, h / 2, z);
    t.rotation.z = PI / 2;
    t.scale.z = width / h;
    for (let i = 0; i < 4; i++) C.cyl(h * 0.34, h * 0.34, width + 0.04, C.M.steel, x - (len - h) / 2 + i * (len - h) / 3, h / 2, z, [PI / 2, 0, 0], 14);
  }
}
// Kleines Auto (für den Autotransporter)
function miniCar(C, x, y, color) {
  const m = mat(color, { metalness: 0.45, roughness: 0.28 });
  C.ext(roundPoly([[-0.8, 0.12], [-0.8, 0.34], [-0.42, 0.38], [-0.26, 0.6], [0.3, 0.6], [0.46, 0.38], [0.8, 0.32], [0.8, 0.12]].map(([a, b]) => [a + x, b + y]), 0.08), 0.9, m, 0.05);
  C.ext([[x - 0.36, y + 0.38], [x - 0.23, y + 0.56], [x + 0.27, y + 0.56], [x + 0.4, y + 0.38]], 0.96, C.M.glass, 0.01);
  for (const fx of [-0.5, 0.5]) for (const s of [-1, 1]) C.cyl(0.15, 0.15, 0.12, C.M.tyre, x + fx, y + 0.13, s * 0.47, [PI / 2, 0, 0], 14);
}
// Streifen-Material für Rundes (Popcorn-Becher, Zirkuszelt)
function stripeMat(colors, n = 8) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(i * 128 / n, 0, 128 / n, 8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
}
const numberDisc = n => (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.46, 0, PI * 2); g.fill(); text(n, '#111')(g, w, h); };

Object.assign(BUILD, {
  hatch: C => {
    profileBody(C, 'hatch');
  },
  coupe: C => {
    profileBody(C, 'coupe');
    C.box(0.3, 0.04, C.W * 0.7, C.paint, C.X(0.04), C.topAt(0.04) + 0.02, 0); // Abrisskante
  },
  schoolbus: C => {
    profileBody(C, 'bus');
    const { X, H, L, W } = C;
    C.decal(L * 0.98, 0.1, 0, H * 0.5, band('#111'));
    C.decal(L * 0.98, 0.1, 0, H * 0.3, band('#111'));
    C.decal(L * 0.5, 0.3, X(0.45), H * 0.95, text('SCHULBUS', '#111'));
    C.cyl(0.26, 0.26, 0.04, mat(0xd62828), X(0.8), H * 0.45, -(W / 2 + 0.08), [PI / 2, 0, 0], 8); // Stopp-Schild
    C.box(0.3, 0.04, 0.02, C.M.white, X(0.8), H * 0.45, -(W / 2 + 0.11));
  },
  smart: C => {
    profileBody(C, 'compact', { wheels: [0.15, 0.85] });
    C.decal(C.L * 0.9, C.H * 0.34, 0, C.H * 0.58, (g, w, h) => { g.strokeStyle = '#1f2937'; g.lineWidth = h * 0.14; g.strokeRect(w * 0.12, h * 0.1, w * 0.56, h * 0.84); }, 0.004);
  },
  cargobike: C => {
    C.W = 0.8;
    const { X, M } = C;
    C.box(0.75, 0.5, 0.72, M.wood, X(0.77), 0.8, 0); // Holzkiste vorne
    C.box(0.78, 0.04, 0.75, M.dark, X(0.77), 1.06, 0);
    for (const [x0, y0, x1, y1] of [[0.2, 0.33, 0.45, 0.95], [0.45, 0.95, 0.55, 0.45], [0.2, 0.33, 0.55, 0.45], [0.55, 0.45, 0.92, 0.45], [0.55, 0.45, 0.6, 1.2]]) tube(C, X(x0), y0, X(x1), y1, 0.035, M.dark);
    C.box(0.35, 0.08, 0.22, mat(0x111111), X(0.42), 0.98, 0); // Sattel
    rider(C, X(0.42), 0.98, 0, 0xfacc15);
    C.box(0.06, 0.06, 0.6, M.dark, X(0.6), 1.22, 0);
    C.wheels.push(wheel(0.33, 0.1, C.group, X(0.2), 0, null, 12));
    C.wheels.push(wheel(0.24, 0.1, C.group, X(0.85), 0, null, 12));
  },
  ecar: C => {
    profileBody(C, 'coupe', { noGrille: true, noExhaust: true, tinted: true, spokes: 10 });
    const { X, H, L } = C;
    C.decal(L * 0.88, 0.05, 0, H * 0.3, band('#38bdf8'));
    C.decal(0.3, 0.3, X(0.12), H * 0.42, text('⚡', '#0ea5e9'), 0.004);
  },
  quad: C => {
    C.W = 1.3;
    const { X, L, r, M } = C;
    C.ext(roundPoly([[X(0.12), r + 0.1], [X(0.1), r + 0.42], [X(0.3), r + 0.52], [X(0.62), r + 0.48], [X(0.9), r + 0.42], [X(0.95), r + 0.12]], 0.1), 0.6, C.paint, 0.08);
    for (const x of [X(0.17), X(0.83)]) C.box(0.8, 0.08, 1.3, C.paint, x, 2 * r + 0.08, 0); // Kotflügel
    C.box(0.75, 0.14, 0.45, mat(0x111111), X(0.42), r + 0.6, 0); // Sitz
    tube(C, X(0.62), r + 0.5, X(0.7), r + 0.85, 0.04, M.dark);
    C.box(0.06, 0.06, 0.85, M.dark, X(0.7), r + 0.87, 0);
    rider(C, X(0.42), r + 0.62, 0, 0xe11d48);
    C.lights(L / 2 - 0.12, -L / 2 + 0.1, r + 0.42, r + 0.42, 0.42);
    C.wheelPair(X(0.17), r, 0.4, null, 6); C.wheelPair(X(0.83), r, 0.4, null, 6);
  },
  moped: C => {
    bike(C);
    C.box(0.35, 0.25, 0.35, mat(0x9aa0aa, { metalness: 0.6, roughness: 0.4 }), C.X(0.95), 0.95, 0); // Körbchen
    C.sph(0.1, C.M.head, C.X(0.98), 1.2, 0);
  },
  offroad: C => {
    jeepBody(C);
    const { H, L, W, M } = C;
    for (const y of [H * 0.32, H * 0.5]) C.box(0.07, 0.07, W * 0.8, M.steel, L / 2 + 0.16, y, 0); // Rammschutz
    for (const s of [-1, 1]) C.box(0.07, H * 0.3, 0.07, M.steel, L / 2 + 0.16, H * 0.41, s * W * 0.32);
    C.box(0.12, 0.12, W * 0.7, M.dark, C.roofX + 0.5, C.roofY + 0.12, 0); // Lichtbalken
    for (let i = 0; i < 4; i++) C.cyl(0.07, 0.07, 0.05, M.head, C.roofX + 0.57, C.roofY + 0.12, (i - 1.5) * 0.3, [0, 0, PI / 2], 12);
    C.cyl(0.05, 0.05, H * 0.45, M.dark, C.X(0.78), H * 0.78, W / 2 + 0.03); // Schnorchel
  },
  roadster: C => {
    profileBody(C, 'coupe', { noCabin: true });
    const { X, M, W } = C, belt = C.topAt(0.45);
    const ws = C.box(0.05, 0.36, W * 0.78, M.glass, X(0.66), C.topAt(0.66) + 0.14, 0);
    ws.rotation.z = -0.9;
    for (const z of [-0.4, 0.4]) C.box(0.45, 0.42, 0.5, mat(0x6b2d14, { roughness: 0.6 }), X(0.42), belt - 0.05, z); // Ledersitze
    for (const z of [-0.4, 0.4]) C.sph(0.2, C.paint, X(0.3), C.topAt(0.3) - 0.02, z, [1.2, 1, 1], 'top'); // Höcker hinter den Sitzen
    C.sph(0.18, M.skin, X(0.45), belt + 0.37, -0.4);
    C.sph(0.19, mat(0x3b2a1a), X(0.44), belt + 0.42, -0.4, [1, 0.6, 1]);
  },
  rally: C => {
    profileBody(C, 'hatch', { spokes: 6, rim: mat(0xf4f4f4, { metalness: 0.3, roughness: 0.4 }) });
    const { X, H, L, W, M } = C;
    C.decal(L * 0.95, H * 0.16, 0, H * 0.3, stripes(['#e11d48', '#ffffff', '#1d4ed8'], true));
    C.decal(0.55, 0.55, X(0.48), H * 0.46, numberDisc('23'), 0.004);
    C.box(0.3, 0.05, W * 0.9, M.dark, X(0.02), H * 0.66, 0); // Heckflügel
    for (const s of [-1, 1]) C.box(0.06, 0.12, 0.06, M.dark, X(0.03), H * 0.61, s * W * 0.3);
    C.box(0.35, 0.1, 0.3, C.paint, C.roofX, C.roofY + 0.04, 0); // Dachhutze
    for (let i = 0; i < 4; i++) C.cyl(0.11, 0.11, 0.06, M.head, L / 2 + 0.05, H * 0.5, (i - 1.5) * 0.3, [0, 0, PI / 2], 14); // Zusatzscheinwerfer
    for (const s of [-1, 1]) for (const x of [X(0.18) - C.r - 0.12, X(0.82) - C.r - 0.12]) C.box(0.03, 0.32, 0.3, M.dark, x, 0.22, s * (W / 2 - 0.16)); // Schmutzfänger
  },
  sweeper: C => {
    profileBody(C, 'box', { wheels: [0.22, 0.8] });
    const { X, H, L, W } = C;
    for (const s of [-1, 1]) {
      const br = C.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.14, 16), mat(0x2b2b30, { roughness: 1 })), L / 2 - 0.25, 0.08, s * (W / 2 - 0.15));
      br.userData.spin = true; // drehende Bürsten
    }
    C.decal(L * 0.6, 0.14, X(0.36), H * 0.36, stripes(['#111111', '#facc15'], true));
    C.decal(0.7, 0.7, X(0.36), H * 0.66, text('🧹', '#000'));
    beacon(C, X(0.86), H * 0.74 + 0.08);
  },
  taco: C => {
    profileBody(C, 'box');
    const { X, H, L } = C;
    C.decal(L * 0.38, H * 0.28, X(0.38), H * 0.62, band('#1f2937'));
    C.decal(L * 0.46, 0.28, X(0.38), H * 0.82, stripes(['#f59e0b', '#ffffff']));
    const shell = C.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 20, 1, false, 0, PI), mat(0xf2c14e, { roughness: 0.8, side: THREE.DoubleSide })), X(0.36), H + 0.6, 0);
    shell.rotation.z = -PI / 2;
    C.sph(0.45, mat(0x4d9b3a, { roughness: 0.9 }), X(0.36), H + 0.55, 0, [1, 0.45, 0.9]); // Salat
    for (const dx of [-0.25, 0, 0.25]) C.sph(0.12, mat(0xd62828), X(0.36) + dx, H + 0.75, 0.05); // Tomaten
  },
  hippie: C => {
    profileBody(C, 'microbus', { wheels: [0.17, 0.83], noGrille: true });
    const { X, H, L, W, M } = C;
    C.decal(L * 0.98, H * 0.12, 0, H * 0.56, band('#f4f1e8'), -0.004); // weisse Zweifarben-Lackierung (Fenster frei lassen)
    C.decal(L * 0.92, H * 0.08, 0, H * 0.95, band('#f4f1e8'), -0.004);
    C.decal(L * 0.7, H * 0.3, X(0.45), H * 0.38, (g, w, h) => { // Blumen
      ['#f472b6', '#facc15', '#a78bfa', '#fb923c'].forEach((col, i) => {
        const cx = w * (0.12 + i * 0.25), cy = h * (i % 2 ? 0.35 : 0.6), rr = h * 0.2;
        g.fillStyle = col;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + Math.cos(k * 1.26) * rr, cy + Math.sin(k * 1.26) * rr, rr * 0.6, 0, PI * 2); g.fill(); }
        g.fillStyle = '#fff7d6'; g.beginPath(); g.arc(cx, cy, rr * 0.5, 0, PI * 2); g.fill();
      });
    }, 0.004);
    C.box(L * 0.6, 0.05, W * 0.8, M.dark, X(0.45), H + 0.08, 0); // Dachträger
    const board = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.28, L * 0.6, 4, 12), mat(0xfb923c, { roughness: 0.3 })), X(0.45), H + 0.2, 0);
    board.rotation.z = PI / 2; board.scale.x = 0.15; // Surfbrett
  },
  parcel: C => {
    profileBody(C, 'box');
    const { X, H, L } = C;
    C.decal(L * 0.66, 0.45, X(0.36), H * 0.72, text('PAKET', '#7c2d12'));
    C.decal(0.9, 0.6, X(0.36), H * 0.42, (g, w, h) => { g.fillStyle = '#c8955a'; g.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8); g.fillStyle = '#8d5a2b'; g.fillRect(w * 0.45, h * 0.1, w * 0.1, h * 0.8); });
  },
  rescue: C => {
    jeepBody(C);
    const { X, H, L, M } = C;
    C.decal(L * 0.9, 0.16, 0, H * 0.36, band('#ffffff'));
    C.decal(0.5, 0.5, X(0.52), H * 0.44, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#dc2626'; g.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.76); g.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.24); }, 0.004);
    C.blueLights(C.roofX + 0.45, C.roofY + 0.12, 0.35);
    C.box(L * 0.25, 0.22, 0.8, mat(0x111111), C.roofX - 0.45, C.roofY + 0.2, 0); // Dachbox
    for (const z of [-0.2, 0.2]) C.box(L * 0.42, 0.03, 0.08, mat(0xf97316), C.roofX - 0.4, C.roofY + 0.33, z); // Ski
  },
  gokart: C => {
    C.W = 1.3;
    const { X, L, M } = C;
    C.box(L * 0.9, 0.06, 1.0, M.dark, 0, 0.18, 0); // Rahmen
    C.ext([[X(0.58), 0.18], [X(0.64), 0.38], [X(0.98), 0.3], [X(1.0), 0.18]], 0.8, C.paint, 0.05); // Nase
    for (const s of [-1, 1]) C.box(L * 0.34, 0.16, 0.16, C.paint, X(0.42), 0.28, s * 0.52); // Seitenkästen
    C.box(0.45, 0.4, 0.5, mat(0x111111), X(0.36), 0.42, 0); // Sitz
    C.box(0.4, 0.3, 0.35, M.steel, X(0.12), 0.38, 0.32); // Motor
    rider(C, X(0.4), 0.36, 0, 0xfacc15);
    const sw = C.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 18), M.dark), X(0.58), 0.72, 0);
    sw.rotation.y = PI / 2; sw.rotation.x = 0.5;
    C.box(0.1, 0.12, 1.25, M.dark, X(0.0), 0.24, 0); // Heckstossstange
    C.wheelPair(X(0.15), 0.21, 0.26, null, 6); C.wheelPair(X(0.85), 0.18, 0.2, null, 6);
  },
  lowrider: C => {
    profileBody(C, 'sedan', { wheels: [0.16, 0.84], rim: C.M.chrome, spokes: 16 });
    const { L, H } = C;
    C.decal(L * 0.9, H * 0.14, 0, H * 0.44, (g, w, h) => { // Zierlinien
      g.strokeStyle = '#fbbf24'; g.lineWidth = Math.max(2, h * 0.06);
      for (const k of [0.3, 0.7]) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * k + Math.sin(x / w * PI * 6) * h * 0.12); g.stroke(); }
    }, 0.004);
  },
  tanker: C => {
    profileBody(C, 'pickup', { wheels: [0.12, 0.86], classic: true });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.3));
    const steel = mat(0xe8ecf1, { metalness: 0.8, roughness: 0.28 });
    const y = H * 0.56 + H * 0.33;
    C.cyl(H * 0.34, H * 0.34, L * 0.46, steel, X(0.26), y, 0, [0, 0, PI / 2], 28); // Tank
    for (const f of [0.03, 0.49]) C.sph(H * 0.34, steel, X(f), y, 0, [0.25, 1, 1]);
    for (const f of [0.1, 0.26, 0.42]) C.cyl(H * 0.345, H * 0.345, 0.06, M.dark, X(f), y, 0, [0, 0, PI / 2], 28);
    C.decal(0.5, 0.4, X(0.26), H * 0.42, text('⛽', '#000'), 0.004);
    C.box(0.6, 0.06, 0.4, M.dark, X(0.26), y + H * 0.34, 0); // Einstieg oben
  },
  policebus: C => {
    profileBody(C, 'bus');
    const { X, H, L } = C;
    C.decal(L * 0.98, 0.32, 0, H * 0.4, band('#1d4ed8', 'POLIZEI', '#fff'));
    C.decal(L * 0.92, H * 0.3, 0, H * 0.73, (g, w, h) => { g.fillStyle = 'rgba(40,40,45,0.55)'; for (let x = 4; x < w; x += 14) g.fillRect(x, 0, 3, h); }, 0.03); // Gitter
    C.blueLights(X(0.85), H + 0.1, 0.5);
    C.blueLights(X(0.12), H + 0.1, 0.5);
  },
  dozer: C => {
    const { X, H, L, W, M } = C;
    tracks(C, X(0.42), L * 0.72, 0.6, 0.6);
    C.box(L * 0.4, H * 0.32, W - 0.4, C.paint, X(0.62), 0.6 + H * 0.16, 0); // Motor
    C.box(L * 0.3, H * 0.26, W - 0.4, C.paint, X(0.28), 0.6 + H * 0.13, 0);
    C.box(L * 0.26, H * 0.36, W * 0.7, M.glass, X(0.28), 0.6 + H * 0.44, 0); // Kabine
    C.box(L * 0.32, 0.08, W * 0.8, C.paint, X(0.28), 0.6 + H * 0.64, 0);
    for (const x of [X(0.16), X(0.4)]) for (const s of [-1, 1]) C.box(0.08, H * 0.38, 0.08, M.dark, x, 0.6 + H * 0.44, s * W * 0.38);
    C.cyl(0.07, 0.07, 0.7, M.dark, X(0.72), 0.6 + H * 0.48, 0.35); // Auspuff
    const bladeMat = C.paint.clone(); bladeMat.side = THREE.DoubleSide;
    const blade = C.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, W * 1.12, 16, 1, true, PI * 1.25, PI * 0.5).rotateX(PI / 2), bladeMat), L / 2 + 1.05, 0.55, 0); // Schild
    blade.castShadow = true;
    for (const s of [-1, 1]) tube(C, X(0.7), 0.5, L / 2 + 0.25, 0.5, 0.08, M.dark, s * (W / 2 - 0.2)); // Schubarme
    C.box(0.1, 0.6, 0.1, M.steel, X(0) - 0.15, 0.4, 0); // Aufreisser
    C.lights(X(0.82), X(0.1), 0.6 + H * 0.3, 0.6 + H * 0.24, 0.4);
  },
  forklift: C => {
    C.W = 1.3;
    const { X, H, L, M } = C;
    C.box(L * 0.55, 0.6, 1.1, C.paint, X(0.45), 0.55, 0); // Körper
    C.box(L * 0.2, 0.8, 1.15, C.paint, X(0.12), 0.65, 0); // Gegengewicht
    C.box(0.5, 0.3, 0.6, mat(0x111111), X(0.38), 1.0, 0); // Sitz
    for (const x of [X(0.24), X(0.62)]) for (const s of [-1, 1]) C.box(0.07, H * 0.5, 0.07, M.dark, x, 0.85 + H * 0.25, s * 0.5); // Schutzdach
    C.box(L * 0.45, 0.07, 1.1, M.dark, X(0.43), 0.85 + H * 0.5, 0);
    rider(C, X(0.4), 1.05, 0, 0xfacc15);
    const mx = X(0.78);
    for (const s of [-1, 1]) C.box(0.1, H * 0.95, 0.1, M.dark, mx, H * 0.475, s * 0.32); // Hubmast
    C.box(0.06, 0.55, 0.8, M.dark, mx + 0.1, 0.5, 0);
    for (const s of [-1, 1]) C.box(0.95, 0.05, 0.12, M.steel, mx + 0.6, 0.25, s * 0.25); // Gabeln
    C.box(0.9, 0.12, 0.9, M.wood, mx + 0.6, 0.34, 0); // Palette
    C.box(0.75, 0.6, 0.75, mat(0xa47b4c, { roughness: 0.9 }), mx + 0.6, 0.7, 0); // Karton
    C.wheelPair(X(0.2), C.r, 0.3); C.wheelPair(X(0.68), C.r * 1.1, 0.3);
  },
  carrier: C => {
    const { X, H, L, W, M } = C;
    C.ext(roundPoly([[X(0.78), 0.45], [X(0.78), H * 0.64], [X(0.86), H * 0.68], [X(0.96), H * 0.64], [X(1), H * 0.4], [X(1), 0.45]], 0.14), W - 0.28, C.paint); // Fahrerhaus
    C.ext([[X(0.86), H * 0.44], [X(0.87), H * 0.62], [X(0.95), H * 0.6], [X(0.99), H * 0.44]], W - 0.18, M.glass, 0.02);
    C.box(L * 0.98, 0.25, W * 0.8, M.dark, 0, 0.55, 0); // Rahmen
    C.box(L * 0.76, 0.08, W, M.steel, X(0.38), 0.78, 0); // unteres Deck
    C.box(L * 0.97, 0.08, W, M.steel, X(0.5), H * 0.74, 0); // oberes Deck
    for (const f of [0.02, 0.26, 0.5, 0.74]) for (const s of [-1, 1]) C.box(0.08, H * 0.74 - 0.78, 0.08, M.steel, X(f), (0.78 + H * 0.74) / 2, s * (W / 2 - 0.05));
    miniCar(C, X(0.18), 0.82, '#e11d48'); miniCar(C, X(0.55), 0.82, '#16a34a');
    miniCar(C, X(0.3), H * 0.74 + 0.04, '#f59e0b'); miniCar(C, X(0.7), H * 0.74 + 0.04, '#0ea5e9');
    C.lights(L / 2 + 0.02, -L / 2 - 0.02, 0.8, 0.7);
    C.box(0.03, 0.12, 0.5, M.plate, L / 2 + 0.04, 0.6, 0);
    C.wheelPair(X(0.1)); C.wheelPair(X(0.24)); C.wheelPair(X(0.88));
  },
  groomer: C => {
    C.W = 2.4;
    const { X, H, L, W, M } = C;
    tracks(C, X(0.48), L * 0.66, 0.75, 0.7);
    C.box(L * 0.64, H * 0.22, W - 0.5, C.paint, X(0.5), 0.75 + H * 0.11, 0);
    C.box(L * 0.32, H * 0.4, W - 0.9, C.paint, X(0.6), 0.75 + H * 0.42, 0); // Kabine
    C.box(L * 0.26, H * 0.26, W - 0.85, M.glass, X(0.63), 0.75 + H * 0.46, 0);
    C.box(0.15, 0.12, W * 0.55, M.dark, X(0.6), 0.75 + H * 0.66, 0); // Lichtbalken
    for (let i = 0; i < 4; i++) C.cyl(0.07, 0.07, 0.05, M.head, X(0.6) + 0.08, 0.75 + H * 0.66, (i - 1.5) * 0.28, [0, 0, PI / 2], 12);
    beacon(C, X(0.5), 0.75 + H * 0.66);
    const blade = C.box(0.14, H * 0.38, W * 1.15, M.steel, L / 2 + 0.25, H * 0.2, 0); // Räumschild
    blade.rotation.z = 0.2;
    C.sph(0.45, M.white, L / 2 + 0.05, 0.25, 0, [0.5, 0.5, 2.4], 'top'); // Schnee vor dem Schild
    C.cyl(0.35, 0.35, W * 0.95, M.dark, X(0) - 0.3, 0.35, 0, [PI / 2, 0, 0], 16); // Fräse hinten
  },
  watercannon: C => {
    profileBody(C, 'box');
    const { X, H, L, M } = C;
    C.decal(L * 0.98, 0.3, 0, H * 0.4, band('#1d4ed8', 'POLIZEI', '#fff'));
    C.cyl(0.42, 0.48, 0.3, mat(0x2b2f38, { metalness: 0.5 }), X(0.45), H + 0.15, 0, [0, 0, 0], 18); // Turm
    C.cyl(0.07, 0.1, 1.3, M.steel, X(0.45) + 0.6, H + 0.42, 0, [0, 0, -PI / 2 + 0.25], 12); // Rohr
    C.blueLights(X(0.86), H * 0.74 + 0.1, 0.5);
  },
  stockcar: C => {
    profileBody(C, 'coupe', { tinted: true, rim: mat(0x111111, { metalness: 0.5, roughness: 0.4 }) });
    const { X, H, L, W, M } = C;
    C.decal(0.7, 0.7, X(0.5), H * 0.4, numberDisc('42'), 0.004);
    C.decal(L * 0.26, 0.18, X(0.2), H * 0.3, band('#facc15', 'TURBO', '#111'), 0.004);
    C.decal(L * 0.24, 0.18, X(0.82), H * 0.3, band('#111111', 'PS+', '#fff'), 0.004);
    C.box(0.08, 0.24, W * 0.95, M.dark, X(0.01), H * 0.62, 0); // Heckspoiler
  },
  popcorn: C => {
    profileBody(C, 'box');
    const { X, H, L } = C;
    C.decal(L * 0.72, H * 0.6, X(0.36), H * 0.62, stripes(['#ef4444', '#ffffff']));
    C.decal(L * 0.52, 0.42, X(0.36), H * 0.62, band('rgba(255,255,255,0.95)', 'POPCORN', '#dc2626'), 0.004);
    C.cyl(0.6, 0.45, 0.9, stripeMat(['#ef4444', '#ffffff'], 12), X(0.36), H + 0.45, 0, [0, 0, 0], 24); // Becher
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, rr = 0.15 + (i % 3) * 0.17;
      C.sph(0.16, mat(i % 4 ? 0xfff7d6 : 0xfde68a, { roughness: 0.95 }), X(0.36) + Math.cos(a) * rr, H + 0.95 + (i % 2) * 0.1, Math.sin(a) * rr);
    }
  },
  circus: C => {
    profileBody(C, 'box');
    const { X, H, L, M } = C;
    C.decal(L * 0.72, H * 0.16, X(0.36), H * 0.9, stripes(['#facc15', '#b91c1c'], true));
    C.decal(L * 0.6, 0.48, X(0.36), H * 0.62, text('ZIRKUS', '#facc15'), 0.004);
    C.decal(L * 0.6, 0.35, X(0.36), H * 0.38, text('★ ★ ★', '#fde047'), 0.004);
    C.cyl(0.02, 0.85, 0.9, stripeMat(['#facc15', '#b91c1c']), X(0.36), H + 0.45, 0, [0, 0, 0], 16); // Zeltdach
    C.cyl(0.02, 0.02, 0.6, M.dark, X(0.36), H + 1.1, 0);
    C.box(0.35, 0.22, 0.02, mat(0xfacc15), X(0.36) + 0.18, H + 1.3, 0); // Fähnchen
  },
  tram: C => {
    profileBody(C, 'bus', { wheels: [0.14, 0.86], noExhaust: true, noGrille: true });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.5));
    C.decal(L * 0.98, H * 0.18, 0, H * 0.3, band('#f8fafc'));
    for (const f of [0.28, 0.62]) C.decal(0.9, H * 0.66, X(f), H * 0.5, (g, w, h) => { g.fillStyle = 'rgba(20,30,50,0.9)'; g.fillRect(0, 0, w, h); g.fillStyle = '#9aa0aa'; g.fillRect(w * 0.48, 0, w * 0.04, h); }, 0.03); // Türen
    C.box(0.9, 0.14, 0.9, M.dark, X(0.5), H + 0.07, 0); // Stromabnehmer
    for (const s of [-1, 1]) { const rod = C.box(0.05, 0.9, 0.05, M.dark, X(0.5) + s * 0.2, H + 0.5, 0); rod.rotation.z = s * 0.5; }
    C.box(0.1, 0.05, 1.3, M.dark, X(0.5), H + 0.9, 0);
    C.box(L * 0.2, 0.25, 1.4, mat(0xcbd5e1), X(0.2), H + 0.12, 0); // Technik auf dem Dach
  },
  sub: C => {
    C.W = 1.9;
    const { X, H, L, M } = C;
    const y = H * 0.48, rad = H * 0.33;
    const hull = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(rad, L * 0.6, 10, 24), C.paint), 0, y, 0);
    hull.rotation.z = PI / 2;
    C.ext(roundPoly([[X(0.45), y + rad * 0.6], [X(0.48), y + rad + 0.45], [X(0.66), y + rad + 0.45], [X(0.7), y + rad * 0.6]], 0.1), 0.5, C.paint, 0.05); // Turm
    C.cyl(0.05, 0.05, 0.6, M.dark, X(0.6), y + rad + 0.7, 0); // Periskop
    C.box(0.22, 0.09, 0.09, M.dark, X(0.6) + 0.08, y + rad + 1.0, 0);
    for (const f of [0.3, 0.5, 0.7]) for (const s of [-1, 1]) { // Bullaugen
      C.add(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), M.gold), X(f), y + 0.05, s * (rad - 0.01));
      C.cyl(0.12, 0.12, 0.02, M.glass, X(f), y + 0.05, s * (rad - 0.02), [PI / 2, 0, 0], 16);
    }
    const prop = C.box(0.06, 0.7, 0.16, M.gold, X(0) - 0.3, y, 0); // Propeller
    prop.userData.fan = true;
    C.cyl(0, 0.15, 0.3, M.gold, X(0) - 0.15, y, 0, [0, 0, PI / 2], 12);
    C.box(0.5, 0.05, 1.3, C.paint, X(0.06), y, 0); // Flossen
    C.box(0.5, 0.9, 0.05, C.paint, X(0.06), y, 0);
    C.sph(0.14, M.head, L / 2 - 0.05, y, 0);
    C.wheelPair(X(0.22), C.r, 0.26); C.wheelPair(X(0.78), C.r, 0.26);
  },
  jet: C => {
    C.W = 2.4;
    const { X, H, L, M } = C;
    const y = H * 0.55;
    C.cyl(0.42, 0.52, L * 0.68, C.paint, X(0.42), y, 0, [0, 0, PI / 2], 24); // Rumpf
    C.cyl(0, 0.52, L * 0.24, C.paint, X(0.88), y, 0, [0, 0, -PI / 2], 24); // Nase
    C.sph(0.4, M.glass, X(0.72), y + 0.38, 0, [1.9, 0.75, 0.9]); // Cockpit
    const wing = extrude([[X(0.6), 0], [X(0.3), 2.1], [X(0.2), 2.1], [X(0.26), 0], [X(0.2), -2.1], [X(0.3), -2.1]], 0.08, C.paint, 0.03);
    wing.rotation.x = -PI / 2;
    C.add(wing, 0, y - 0.15, 0);
    C.ext([[X(0.02), y + 0.3], [X(0.06), y + 1.5], [X(0.16), y + 1.5], [X(0.24), y + 0.3]], 0.08, C.paint, 0.03); // Leitwerk
    const tail = extrude([[X(0.16), 0], [X(0.04), 0.9], [X(0.0), 0.9], [X(0.02), 0], [X(0.0), -0.9], [X(0.04), -0.9]], 0.06, C.paint, 0.02);
    tail.rotation.x = -PI / 2;
    C.add(tail, 0, y + 0.1, 0);
    C.cyl(0.36, 0.3, 0.35, M.dark, X(0.08) - 0.15, y, 0, [0, 0, PI / 2], 18); // Düse
    const flame = C.cyl(0, 0.3, 1.6, new THREE.MeshBasicMaterial({ color: 0xffa020 }), X(0) - 1.0, y, 0, [0, 0, PI / 2]);
    flame.userData.flame = true;
    C.decal(0.6, 0.5, X(0.12), y + 0.9, text('AR', '#e11d48'), 0.04 - C.W / 2);
    for (const s of [-1, 1]) C.box(0.08, y - 0.4, 0.08, M.dark, X(0.32), (y - 0.4) / 2 + 0.3, s * 0.9); // Fahrwerk
    C.box(0.08, y - 0.4, 0.08, M.dark, X(0.82), (y - 0.4) / 2 + 0.25, 0);
    C.wheelPair(X(0.32), 0.3, 0.22);
    C.wheels.push(wheel(0.25, 0.18, C.group, X(0.82), 0));
  },
  robot: C => {
    const { X, H, L, W, r, M } = C;
    const lift = r * 1.3, base = lift + 0.5;
    C.box(L * 0.82, 0.5, W - 0.5, C.paint, 0, lift + 0.25, 0); // Fahrgestell
    for (const x of [X(0.2), X(0.8)]) for (const s of [-1, 1]) C.box(0.12, lift, 0.12, M.dark, x, lift * 0.7, s * 0.6);
    C.box(L * 0.36, H * 0.34, W - 0.8, C.paint, X(0.45), base + H * 0.17, 0); // Oberkörper
    const glow = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0ea5e9, emissiveIntensity: 1.2 });
    C.box(0.04, H * 0.16, 0.6, glow, X(0.45) + L * 0.18 + 0.02, base + H * 0.2, 0);
    C.box(0.7, 0.5, 0.75, M.steel, X(0.47), base + H * 0.34 + 0.27, 0); // Kopf
    const eye = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 });
    for (const s of [-1, 1]) {
      C.box(0.05, 0.1, 0.16, eye, X(0.47) + 0.36, base + H * 0.34 + 0.32, s * 0.18);
      C.sph(0.2, M.steel, X(0.5), base + H * 0.3, s * (W / 2 - 0.35)); // Schultern
      const arm = C.box(0.22, 0.9, 0.22, M.steel, X(0.6), base + H * 0.15, s * (W / 2 - 0.3));
      arm.rotation.z = -0.9;
      C.box(0.3, 0.3, 0.3, M.dark, X(0.6) + 0.45, base + H * 0.05, s * (W / 2 - 0.3)); // Greifer
    }
    C.cyl(0.03, 0.03, 0.5, M.dark, X(0.47), base + H * 0.34 + 0.75, 0); // Antenne
    C.sph(0.07, eye, X(0.47), base + H * 0.34 + 1.0, 0);
    C.lights(L / 2 + 0.02, -L / 2 - 0.02, lift + 0.3);
    C.wheelPair(X(0.2), r, 0.65, null, 6); C.wheelPair(X(0.8), r, 0.65, null, 6);
    C.roofY = base + H * 0.34 + 0.55;
  },
  nightracer: C => {
    profileBody(C, 'sport', { tinted: true, rim: mat(0x1f1f23, { metalness: 0.8, roughness: 0.3 }) });
    const { X, H, L, W } = C;
    const neon = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 2.2 });
    for (const s of [-1, 1]) C.box(L * 0.7, 0.04, 0.04, neon, 0, C.H * 0.2, s * (W / 2 - 0.12)); // Unterboden-Licht
    for (const s of [-1, 1]) C.ext([[X(0.0), H * 0.48], [X(0.04), H * 0.95], [X(0.1), H * 0.8], [X(0.16), H * 0.92], [X(0.24), H * 0.52]], 0.05, C.paint, 0.02, s * 0.6); // Fledermaus-Flossen
    C.decal(0.5, 0.35, X(0.5), H * 0.38, text('🦇', '#000'), 0.004);
  },
  zeppelin: C => {
    C.W = 2.4;
    const { X, H, L, M } = C;
    const y = H * 0.64, ry = H * 0.34;
    C.paint.metalness = Math.max(C.paint.metalness, 0.6);
    C.sph(1, C.paint, 0, y, 0, [L * 0.48, ry, 1.1]); // Hülle
    for (const f of [0.3, 0.5, 0.7]) { // Ringe
      const k = Math.sqrt(1 - (2 * f - 1) ** 2);
      const ring = C.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 6, 32), M.dark), X(f), y, 0);
      ring.rotation.y = PI / 2; ring.scale.set(1.1 * k + 0.01, ry * k + 0.01, 1);
    }
    C.box(L * 0.28, 0.42, 0.62, mat(0x7c4a1e, { roughness: 0.7 }), X(0.55), y - ry - 0.12, 0); // Gondel
    C.box(L * 0.22, 0.14, 0.64, M.glass, X(0.56), y - ry - 0.06, 0);
    C.box(0.9, 1.0, 0.05, C.paint, X(0.05), y, 0); // Leitwerk
    C.box(0.9, 0.05, 1.4, C.paint, X(0.05), y, 0);
    for (const s of [-1, 1]) {
      C.sph(0.16, M.dark, X(0.4), y - ry * 0.6, s * 0.95, [1.8, 1, 1]);
      const p = C.box(0.05, 0.7, 0.1, M.dark, X(0.4) - 0.3, y - ry * 0.6, s * 0.95);
      p.userData.fan = true;
    }
  },
  pirate: C => {
    C.W = 2.0;
    const { X, H, L, r, M } = C;
    const deck = H * 0.42;
    C.bodyMesh = C.ext(roundPoly([[X(0.02), r * 0.9], [X(-0.02), H * 0.5], [X(0.12), H * 0.52], [X(0.16), deck], [X(0.85), deck], [X(1.05), H * 0.54], [X(0.9), r * 0.9]], 0.1), C.W - 0.3, C.paint);
    C.decal(L * 0.8, deck - r * 0.9 - 0.1, X(0.48), (deck + r * 0.9) / 2, (g, w, h) => { // Planken und Kanonenluken
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(0, h * k / 4); g.lineTo(w, h * k / 4); g.stroke(); }
      g.fillStyle = '#1b1208';
      for (const f of [0.25, 0.5, 0.75]) g.fillRect(w * f - h * 0.15, h * 0.2, h * 0.3, h * 0.3);
    });
    for (const f of [0.38, 0.6, 0.82]) for (const s of [-1, 1]) C.cyl(0.08, 0.1, 0.4, M.dark, X(f), deck - 0.3, s * (C.W / 2 + 0.12), [PI / 2, 0, 0], 10); // Kanonen
    for (const s of [-1, 1]) C.box(L * 0.7, 0.12, 0.06, mat(0x4a2c12), X(0.5), deck + 0.2, s * (C.W / 2 - 0.2)); // Reling
    const wood = mat(0x5b3a1a, { roughness: 0.85 });
    C.cyl(0.07, 0.09, H * 1.0, wood, X(0.52), deck + H * 0.5, 0); // Mast
    C.box(L * 0.34, H * 0.42, 0.03, mat(0xf3ead8, { roughness: 0.9 }), X(0.52), deck + H * 0.5, 0); // Segel
    C.decal(L * 0.22, H * 0.3, X(0.52), deck + H * 0.5, text('☠', '#111'), 0.03 - C.W / 2);
    C.cyl(0.24, 0.18, 0.25, wood, X(0.52), deck + H * 0.95, 0); // Ausguck
    C.box(0.45, 0.28, 0.02, mat(0x111111), X(0.52) - 0.22, deck + H * 1.08, 0); // Flagge
    C.sph(0.1, M.head, X(0.02), H * 0.6, 0); // Laterne
    C.wheelPair(X(0.22), r, 0.25, M.wood, 8); C.wheelPair(X(0.78), r, 0.25, M.wood, 8);
  },
  polar: C => {
    liftedTruck(C, mat(0xbfe9ff, { metalness: 0.6, roughness: 0.2 }));
    const { X, L, M } = C;
    const ice = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x3aa8ff, emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.05 });
    for (const [f, z, s] of [[0.12, -0.3, 0.45], [0.25, 0.25, 0.55], [0.38, -0.2, 0.4], [0.18, 0.35, 0.3]]) {
      const c = C.add(new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), ice), X(f), C.bedY + s * 0.9, z); // Eiskristalle
      c.scale.y = 1.6;
    }
    C.decal(L * 0.4, 0.35, X(0.75), C.bedY - 0.25, text('❄ ❄ ❄', '#38bdf8'), -0.045);
    const fur = mat(0xf8fafc, { roughness: 0.95 });
    C.sph(0.32, fur, C.roofX, C.roofY + 0.28, 0); // Eisbär auf dem Dach
    C.sph(0.16, fur, C.roofX + 0.28, C.roofY + 0.22, 0);
    C.sph(0.05, mat(0x111111), C.roofX + 0.43, C.roofY + 0.24, 0);
    for (const s of [-1, 1]) { C.sph(0.09, fur, C.roofX - 0.05, C.roofY + 0.56, s * 0.2); C.sph(0.04, mat(0x111111), C.roofX + 0.25, C.roofY + 0.38, s * 0.12); }
    const blade = C.box(0.12, 0.6, C.W * 1.1, M.steel, L / 2 + 0.3, C.r * 0.9, 0); // Pflug
    blade.rotation.y = 0.2;
  },
  phoenix: C => {
    profileBody(C, 'sport', { rim: C.M.gold });
    const { X, H, L } = C;
    const fire = new THREE.MeshStandardMaterial({ color: 0xffa31a, emissive: 0xff5a00, emissiveIntensity: 1.1, roughness: 0.4, side: THREE.DoubleSide });
    C.decal(L * 0.7, H * 0.26, X(0.5), H * 0.34, (g, w, h) => { // Flammen
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#facc15'); gr.addColorStop(1, '#dc2626');
      g.fillStyle = gr; g.beginPath(); g.moveTo(w, h);
      for (let i = 0; i <= 8; i++) g.lineTo(w - w * i / 8, i % 2 ? h * 0.05 : h * 0.6);
      g.lineTo(0, h); g.fill();
    }, 0.004);
    for (const s of [-1, 1]) { // Feuerflügel (schlagen)
      const wg = new THREE.Group();
      const wing = extrude([[0, 0], [-1.4, 1.0], [-1.0, 1.1], [-0.9, 1.6], [-0.5, 1.3], [-0.2, 1.8], [0.2, 1.2], [0.7, 0]], 0.04, fire, 0.02);
      wing.rotation.x = s * PI / 2;
      wg.add(wing);
      wg.position.set(C.roofX, C.roofY - 0.05, s * 0.3);
      wg.userData.flap = -s;
      C.body.add(wg);
    }
    C.cyl(0, 0.14, 0.4, C.M.gold, L / 2 + 0.15, H * 0.55, 0, [0, 0, -PI / 2], 8); // Schnabel
    for (let i = 0; i < 3; i++) C.cyl(0, 0.07, 0.45, fire, X(0.85) - i * 0.15, H * 0.62, 0, [0, 0, 0.5 + i * 0.2], 6); // Federkrone
    for (let i = 0; i < 5; i++) { // Schwanzfedern
      const f = C.cyl(0, 0.12, 1.1, fire, X(0) - 0.45, H * 0.55, (i - 2) * 0.2, [0, (i - 2) * 0.25, PI / 2 + 0.3], 6);
      f.castShadow = false;
    }
  },
  rover: C => {
    C.W = 2.2;
    const { X, H, L, r, M } = C;
    const fy = r + 0.3;
    C.box(L * 0.86, 0.1, 1.5, M.steel, 0, fy, 0); // Rahmen
    for (const s of [-1, 1]) tube(C, X(0.04), fy, X(0.96), fy, 0.05, M.chrome, s * 0.78);
    for (const x of [X(0.15), X(0.5), X(0.85)]) for (const s of [-1, 1]) C.box(0.7, 0.05, 0.35, M.gold, x, 2 * r + 0.08, s * 0.95); // Kotflügel aus Goldfolie
    for (const z of [-0.38, 0.38]) C.box(0.5, 0.45, 0.5, mat(0x334155), X(0.45), fy + 0.28, z); // Sitze
    C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.35, 4, 10), M.white), X(0.45), fy + 0.75, -0.38); // Astronaut
    C.sph(0.26, M.white, X(0.46), fy + 1.22, -0.38);
    C.sph(0.2, M.gold, X(0.5), fy + 1.22, -0.38, [0.8, 0.8, 1]); // Visier
    const dish = C.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 8, 0, PI * 2, 0, PI * 0.32), mat(0xf4f4f4, { side: THREE.DoubleSide })), X(0.82), H * 0.95, 0);
    dish.rotation.z = -0.9;
    C.cyl(0.03, 0.03, H * 0.95 - fy, M.dark, X(0.82), (H * 0.95 + fy) / 2, 0);
    C.box(L * 0.32, 0.04, 1.4, mat(0x1e3a8a, { metalness: 0.6, roughness: 0.2 }), X(0.14), H * 0.72, 0); // Solarzellen
    C.cyl(0.03, 0.03, H * 0.72 - fy, M.dark, X(0.14), (H * 0.72 + fy) / 2, 0);
    C.cyl(0.015, 0.015, 0.8, M.dark, X(0.02), fy + 0.4, 0.6); // Fähnchen
    C.box(0.3, 0.3, 0.02, mat(0xd52b1e), X(0.02) + 0.15, fy + 0.65, 0.6);
    C.box(0.2, 0.06, 0.025, C.M.white, X(0.02) + 0.15, fy + 0.65, 0.6);
    C.box(0.06, 0.2, 0.025, C.M.white, X(0.02) + 0.15, fy + 0.65, 0.6);
    for (const f of [0.15, 0.5, 0.85]) C.wheelPair(X(f), r, 0.32, M.chrome, 12);
  },
  shark: C => {
    profileBody(C, 'sport', { noGrille: true });
    const { X, H, L, W, M } = C;
    C.decal(L * 0.95, H * 0.16, 0, H * 0.3, band('#e2e8f0'));
    C.decal(0.5, 0.35, X(0.74), H * 0.4, (g, w, h) => { g.strokeStyle = '#1f2937'; g.lineWidth = w * 0.05; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w * (0.2 + i * 0.25), h * 0.1); g.lineTo(w * (0.1 + i * 0.25), h * 0.9); g.stroke(); } }, 0.004); // Kiemen
    for (const s of [-1, 1]) { C.sph(0.1, mat(0x111111, { roughness: 0.1 }), L / 2 - 0.35, H * 0.45, s * (W / 2 - 0.12)); }
    C.box(0.1, 0.12, W * 0.7, mat(0x3b0d0d), L / 2 - 0.02, H * 0.3, 0); // Maul
    for (let i = 0; i < 9; i++) { const t = C.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), M.white), L / 2 + 0.02, H * 0.34, -0.6 + i * 0.15); t.rotation.z = PI; }
    C.ext([[X(0.3), C.roofY - 0.08], [X(0.42), C.roofY + 0.9], [X(0.5), C.roofY + 0.85], [X(0.56), C.roofY - 0.08]], 0.08, C.paint, 0.03); // Rückenflosse
    C.ext([[X(0) + 0.05, H * 0.45], [X(0) - 0.65, H * 1.1], [X(0) - 0.4, H * 0.55], [X(0) - 0.6, H * 0.1], [X(0) + 0.05, H * 0.35]], 0.08, C.paint, 0.03); // Schwanzflosse
    for (const s of [-1, 1]) { const fin = C.box(0.5, 0.05, 0.4, C.paint, X(0.6), H * 0.25, s * (W / 2 + 0.15)); fin.rotation.x = s * 0.4; }
  },
  pumpkin: C => {
    C.W = 2.4;
    const { X, H, L, M } = C;
    const cy = H * 0.56, R = H * 0.38, cx = X(0.48);
    for (let i = 0; i < 6; i++) { const rib = C.sph(R, C.paint, cx, cy, 0, [1.15, 0.85, 0.5]); rib.rotation.y = i / 6 * PI; } // Kürbis-Rippen
    const stem = C.cyl(0.08, 0.13, 0.45, mat(0x3f6212, { roughness: 0.9 }), cx, cy + R * 0.85 + 0.18, 0);
    stem.rotation.z = 0.3;
    const vine = new THREE.CatmullRomCurve3([new THREE.Vector3(cx, cy + R * 0.85, 0), new THREE.Vector3(cx + 0.4, cy + R * 0.8, 0.3), new THREE.Vector3(cx + 0.6, cy + R * 0.6, 0.1), new THREE.Vector3(cx + 0.5, cy + R * 0.5, -0.2)]);
    C.add(new THREE.Mesh(new THREE.TubeGeometry(vine, 16, 0.035, 6), mat(0x4d7c0f)));
    for (const s of [-1, 1]) { // runde Fenster mit Goldrahmen
      C.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 8, 24), M.gold), cx, cy + 0.05, s * R * 1.13);
      C.cyl(0.31, 0.31, 0.02, M.glass, cx, cy + 0.05, s * R * 1.12, [PI / 2, 0, 0], 20);
    }
    C.box(L * 0.75, 0.08, 0.3, M.gold, X(0.5), 0.62, 0); // Goldgestell
    C.box(L * 0.18, 0.1, 1.1, M.wood, X(0.92), H * 0.5, 0); // Kutschbock
    for (const s of [-1, 1]) C.sph(0.1, M.head, X(0.86), H * 0.75, s * 0.6); // Laternen
    C.wheelPair(X(0.2), 0.62, 0.14, M.gold, 10); C.wheelPair(X(0.8), 0.62, 0.14, M.gold, 10);
  },
});

for (const kd of ['schoolbus', 'policebus', 'tram']) SPEC_HINT[kd] = { arch: 'bus' };
for (const kd of ['sweeper', 'taco', 'parcel', 'watercannon', 'popcorn', 'circus']) SPEC_HINT[kd] = { arch: 'box' };
SPEC_HINT.hippie = { arch: 'microbus' };
for (const kd of ['tanker']) SPEC_HINT[kd] = { arch: 'pickup' };
for (const kd of ['offroad', 'rescue']) SPEC_HINT[kd] = { arch: 'suv' };
for (const kd of ['nightracer', 'phoenix', 'shark']) SPEC_HINT[kd] = { arch: 'sport' };
for (const kd of ['coupe', 'ecar', 'roadster', 'stockcar']) SPEC_HINT[kd] = { arch: 'coupe' };
for (const kd of ['hatch', 'rally']) SPEC_HINT[kd] = { arch: 'hatch' };
SPEC_HINT.smart = { arch: 'compact' };

// ---------- Runde 5 ----------
// Spirale (Schneckenhaus) als Aufkleber
const spiral = color => (g, w, h) => {
  g.strokeStyle = color; g.lineWidth = w * 0.045; g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < PI * 6; a += 0.1) {
    const r = w * 0.46 * a / (PI * 6);
    g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  }
  g.stroke();
};

Object.assign(BUILD, {
  bobbycar: C => {
    C.W = 0.9;
    const { X, L, M } = C, r = 0.17;
    C.bodyMesh = C.ext(roundPoly([[X(0.02), r + 0.05], [X(0), 0.5], [X(0.2), 0.56], [X(0.3), 0.46], [X(0.7), 0.46], [X(0.9), 0.62], [X(1), 0.46], [X(0.98), r + 0.05]], 0.08), 0.6, C.paint, 0.08);
    C.box(0.4, 0.1, 0.44, mat(0x111111), X(0.2), 0.6, 0); // Sitz
    tube(C, X(0.82), 0.6, X(0.74), 0.85, 0.025, M.dark);
    C.cyl(0.14, 0.14, 0.04, mat(0x111111), X(0.74), 0.87, 0, [0, 0, 0.7], 16); // Lenkrad
    rider(C, X(0.24), 0.62, 0, 0xfacc15);
    for (const s of [-1, 1]) { // runde Scheinwerfer wie Augen
      C.sph(0.08, M.white, L / 2 - 0.04, 0.5, s * 0.2);
      C.sph(0.04, mat(0x111111), L / 2 + 0.03, 0.5, s * 0.2);
    }
    C.wheelPair(X(0.18), r, 0.12, M.white, 5); C.wheelPair(X(0.84), r, 0.12, M.white, 5);
  },
  mower: C => {
    C.W = 1.3;
    const { X, L, M } = C, yellow = mat(0xfacc15);
    C.bodyMesh = C.ext(roundPoly([[X(0.04), 0.4], [X(0.04), 0.66], [X(0.42), 0.68], [X(0.56), 0.9], [X(0.98), 0.84], [X(1), 0.4]], 0.08), 0.95, C.paint, 0.08);
    C.box(L * 0.46, 0.2, 1.4, M.dark, X(0.55), 0.24, 0); // Mähwerk
    C.decal(L * 0.44, 0.16, X(0.55), 0.24, stripes(['#4d7c0f', '#65a30d']), 0.05);
    C.box(0.45, 0.25, 0.3, C.paint, X(0.55), 0.3, C.W / 2 + 0.12); // Grasauswurf
    C.box(0.5, 0.12, 0.6, mat(0x111111), X(0.24), 0.98, 0); // Sitz
    C.box(0.1, 0.5, 0.6, mat(0x111111), X(0.1), 1.2, 0); // Lehne
    tube(C, X(0.6), 0.85, X(0.52), 1.3, 0.03, M.dark);
    C.cyl(0.2, 0.2, 0.04, mat(0x111111), X(0.52), 1.32, 0, [0, 0, 0.6], 16); // Lenkrad
    rider(C, X(0.26), 1.0, 0, 0xf97316);
    C.box(0.06, 0.1, 0.7, M.head, L / 2 + 0.01, 0.7, 0); // Lampe
    C.wheelPair(X(0.2), 0.45, 0.32, yellow, 6); C.wheelPair(X(0.86), 0.28, 0.22, yellow, 6);
  },
  caravan: C => {
    // vorne ein Kombi, hinten der Wohnwagen an der Deichsel
    const L = C.L, body = C.body, X0 = C.X, Lc = L * 0.48, off = L / 2 - Lc / 2;
    const car = new THREE.Group();
    car.position.x = off;
    body.add(car);
    const nW = C.wheels.length;
    Object.assign(C, { body: car, L: Lc, X: f => f * Lc - Lc / 2 });
    profileBody(C, 'kombi');
    sideDetails(C);
    for (const k of ['side', 'surfZ', 'ghZ', 'caliper', 'wheelOut']) delete C[k]; // der Wohnwagen ist keine echte Karosserie
    for (const w of [...C.wheels.slice(nW), ...C.group.getObjectsByProperty('name', 'caliper')]) w.position.x += off;
    if (C.eye) C.eye[0] += off;
    C.axles = C.axles.map(([x, r]) => [x + off, r]);
    Object.assign(C, { body, L, X: X0, roofX: C.roofX + off });
    const { M } = C, cl = L * 0.45, cx = -L / 2 + cl / 2, y0 = 0.42, ch = 2.3, white = mat(0xf8fafc, { roughness: 0.5 });
    C.ext(roundPoly([[cx - cl / 2, y0], [cx - cl / 2, y0 + ch - 0.1], [cx - cl / 2 + 0.25, y0 + ch], [cx + cl / 2 - 0.4, y0 + ch], [cx + cl / 2, y0 + ch - 0.45], [cx + cl / 2, y0]], 0.2), 2.0, white, 0.1);
    const zw = 1.12 - C.W / 2; // Aufkleber aussen am Wohnwagen
    C.decal(cl * 0.96, 0.14, cx, y0 + 0.75, band('#0ea5e9'), zw);
    C.decal(cl * 0.96, 0.06, cx, y0 + 0.95, band('#38bdf8'), zw);
    C.decal(cl * 0.9, 1.1, cx, y0 + 1.5, (g, w, h) => { // Fenster und Tür
      const sc = w / (cl * 0.9);
      g.fillStyle = '#1e293b';
      for (const fx of [0.12, 0.62]) { g.beginPath(); g.roundRect(w * fx, h * 0.12, w * 0.26, h * 0.42, 6); g.fill(); }
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
      g.strokeRect(w * 0.44, h * 0.08, w * 0.13, h * 0.95);
      g.fillStyle = '#1e293b'; g.fillRect(w * 0.465, h * 0.18, w * 0.08, h * 0.25);
      g.fillStyle = '#cbd5e1'; g.fillRect(w * 0.53, h * 0.55, 0.12 * sc, 0.04 * sc);
    }, zw);
    C.box(0.6, 0.15, 0.6, M.glass, cx, y0 + ch + 0.06, 0); // Dachluke
    tube(C, cx + cl / 2, 0.55, off - Lc / 2 + 0.05, 0.5, 0.05, M.dark); // Deichsel
    C.box(0.35, 0.3, 0.6, mat(0x9ca3af), cx + cl / 2 + 0.2, 0.75, 0); // Gasflaschen-Kasten
    for (const s of [-1, 1]) C.box(0.06, 0.16, 0.3, M.tail, -L / 2 - 0.02, y0 + 0.3, s * 0.75);
    const W = C.W;
    C.W = 2.5; C.wheelPair(cx + 0.2, C.r, 0.28); C.W = W;
  },
  snowmobile: C => {
    C.W = 1.1;
    const { X, L, M } = C;
    C.bodyMesh = C.ext(roundPoly([[X(0.06), 0.45], [X(0.06), 0.78], [X(0.55), 0.82], [X(0.74), 1.08], [X(0.98), 0.78], [X(1), 0.48], [X(0.7), 0.38]], 0.1), 0.85, C.paint, 0.1);
    C.box(L * 0.42, 0.16, 0.62, mat(0x111111), X(0.32), 0.9, 0); // Sitzbank
    C.ext([[X(0.68), 1.02], [X(0.62), 1.5], [X(0.7), 1.5], [X(0.8), 1.04]], 0.7, M.glass, 0.02); // Windschild
    rider(C, X(0.38), 0.95, 0, 0x0ea5e9);
    C.box(0.06, 0.06, 0.85, M.dark, X(0.64), 1.25, 0); // Lenker
    tracks(C, X(0.32), L * 0.5, 0.5, 0.45); // Raupe
    for (const s of [-1, 1]) { // Kufen vorne
      C.box(1.2, 0.05, 0.2, M.steel, X(0.86), 0.05, s * 0.5);
      const tip = C.box(0.35, 0.05, 0.2, M.steel, X(0.86) + 0.7, 0.13, s * 0.5);
      tip.rotation.z = 0.5;
      tube(C, X(0.86), 0.08, X(0.82), 0.5, 0.04, M.dark, s * 0.45);
    }
    C.box(0.06, 0.14, 0.5, M.head, L / 2 + 0.01, 0.68, 0);
    C.decal(L * 0.4, 0.2, X(0.8), 0.62, text('❄ ❄', '#ffffff'), -0.02);
  },
  candy: C => {
    profileBody(C, 'box');
    const { X, H, L, M } = C;
    C.decal(L * 0.72, H * 0.6, X(0.36), H * 0.62, stripes(['#f9a8d4', '#ffffff']));
    C.decal(L * 0.6, 0.42, X(0.36), H * 0.62, band('rgba(255,255,255,0.95)', 'ZUCKERWATTE', '#db2777'), 0.004);
    const pink = mat(0xf9a8d4, { roughness: 1 }), x0 = X(0.36), y0 = H + 1.25;
    C.cyl(0.04, 0.04, 1.1, mat(0xf5f5f4), x0, H + 0.55, 0); // Stab
    for (let i = 0; i < 12; i++) { // Wolke aus Zuckerwatte
      const a = i * 2.4, rr = 0.2 + (i % 3) * 0.2;
      C.sph(0.3 + (i % 2) * 0.1, i % 3 ? pink : mat(0xfbcfe8, { roughness: 1 }), x0 + Math.cos(a) * rr, y0 + (i % 4) * 0.12 - 0.15, Math.sin(a) * rr * 0.9);
    }
    for (const [x, col] of [[X(0.08), 0x38bdf8], [X(0.64), 0xfacc15]]) { // Lutscher auf dem Dach
      C.cyl(0.025, 0.025, 0.6, M.white, x, H + 0.3, 0);
      C.cyl(0.28, 0.28, 0.08, mat(col), x, H + 0.75, 0, [PI / 2, 0, 0], 24);
      C.decal(0.5, 0.5, x, H + 0.75, spiral('#ffffff'), 0.045 - C.W / 2);
    }
  },
  racetruck: C => {
    profileBody(C, 'pickup', { classic: true }); // Sattelschlepper: kantig wie ein Lastwagen
    const { X, H, L, W, M } = C, deck = H * 0.56;
    C.cyl(0.5, 0.5, 0.08, M.dark, X(0.25), deck + 0.04, 0, [0, 0, 0], 24); // Sattelplatte
    C.ext([[X(0.5), C.roofY - 0.05], [X(0.53), C.roofY + 0.6], [X(0.72), C.roofY - 0.05]], W - 0.5, C.paint, 0.06); // Windabweiser
    for (const s of [-1, 1]) {
      C.cyl(0.08, 0.08, 1.6, M.chrome, X(0.49), C.roofY + 0.1, s * 0.75, [0, 0, 0], 12); // Auspuffrohre
      C.box(L * 0.38, 0.22, 0.08, M.dark, X(0.3), H * 0.3, s * (W / 2 + 0.02)); // Seitenschweller
    }
    C.box(0.12, 0.35, W * 0.95, M.chrome, L / 2 + 0.04, H * 0.38, 0); // Frontbügel
    C.decal(L * 0.98, 0.16, 0, H * 0.33, band('#facc15'), 0.004);
    C.decal(0.75, 0.75, X(0.66), H * 0.48, numberDisc('7'), 0.004);
  },
  dino: C => {
    liftedTruck(C, mat(0x3f3f46, { metalness: 0.6, roughness: 0.3 }));
    const { X, L, M } = C, y = C.bedY;
    const skin = mat(0x3f6212, { roughness: 0.7 }), belly = mat(0xa3b86c, { roughness: 0.8 });
    C.sph(0.75, skin, X(0.22), y + 0.8, 0, [1.25, 0.85, 0.75]); // Körper
    C.sph(0.62, belly, X(0.26), y + 0.66, 0, [1.1, 0.7, 0.68]);
    for (const s of [-1, 1]) C.box(0.4, 0.7, 0.22, skin, X(0.2), y + 0.3, s * 0.42); // Beine
    C.cyl(0.3, 0.42, 1.0, skin, X(0.32), y + 1.4, 0, [0, 0, -0.6]); // Hals
    const hx = X(0.38) + 0.35, hy = y + 2.0;
    C.box(1.0, 0.48, 0.62, skin, hx, hy, 0); // Kopf
    C.box(0.7, 0.14, 0.46, mat(0x7f1d1d), hx + 0.1, hy - 0.26, 0); // Maul
    const jaw = C.box(0.85, 0.16, 0.52, skin, hx + 0.02, hy - 0.42, 0); // Unterkiefer
    jaw.rotation.z = -0.22;
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const t = C.add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), M.white), hx - 0.2 + i * 0.13, hy - 0.27, s * 0.24);
      t.rotation.z = PI;
    }
    for (const s of [-1, 1]) {
      C.sph(0.09, mat(0xfacc15, { emissive: 0x7a5200, emissiveIntensity: 0.4 }), hx + 0.12, hy + 0.17, s * 0.29); // Augen
      C.sph(0.045, mat(0x111111), hx + 0.17, hy + 0.18, s * 0.33);
      const arm = C.box(0.4, 0.1, 0.1, skin, X(0.32), y + 0.95, s * 0.4); // kleine Ärmchen
      arm.rotation.z = -0.7;
    }
    for (let i = 0; i < 6; i++) C.add(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 4), mat(0xea580c)), X(0.06) + i * 0.3, y + 1.35 - Math.abs(i - 2.5) * 0.07, 0); // Rückenzacken
    C.cyl(0.05, 0.42, 1.6, skin, X(0.02) - 0.45, y + 0.85, 0, [0, 0, PI / 2 - 0.15], 12); // Schwanz
    C.decal(L * 0.4, 0.35, X(0.75), y - 0.25, text('ROAAAR!', '#facc15'), -0.045);
  },
  snail: C => {
    C.W = 1.8;
    const { X, H, M } = C;
    const slug = mat(0x9fae7a, { roughness: 0.45 }); // glänzt ein bisschen schleimig
    C.bodyMesh = C.ext(roundPoly([[X(-0.02), 0.3], [X(0), 0.55], [X(0.6), 0.75], [X(0.84), 1.15], [X(1), 1.08], [X(1.02), 0.6], [X(0.96), 0.3]], 0.2), 1.3, slug, 0.15);
    // Schneckenhaus: dicker Ring mit gefüllter Mitte, Spirale auf beiden Seiten
    const cx = X(0.38), R = Math.min(1.05, H * 0.45), cy = 0.75 + R * 0.9, t = 0.55;
    C.add(new THREE.Mesh(new THREE.TorusGeometry(R - t, t, 16, 40), C.paint), cx, cy, 0);
    C.cyl(R - t + 0.02, R - t + 0.02, 2 * t, C.paint, cx, cy, 0, [PI / 2, 0, 0], 32);
    C.decal(2 * R * 0.95, 2 * R * 0.95, cx, cy, spiral('rgba(70,30,0,0.75)'), t + 0.01 - C.W / 2);
    for (const s of [-1, 1]) { // Fühler mit Augen
      tube(C, X(0.9), 1.0, X(0.98), 1.85, 0.045, slug, s * 0.25);
      C.sph(0.12, M.white, X(0.98), 1.9, s * 0.25);
      C.sph(0.06, mat(0x111111), X(0.98) + 0.08, 1.92, s * 0.27);
      tube(C, X(0.97), 0.75, X(1.04), 0.98, 0.035, slug, s * 0.3);
    }
    C.decal(0.5, 0.2, X(0.97), 0.6, (g, w, h) => { g.strokeStyle = '#3f3f2a'; g.lineWidth = h * 0.18; g.beginPath(); g.arc(w / 2, 0, h * 0.8, 0.5, PI - 0.5); g.stroke(); }, -0.09); // Lächeln
    C.wheelPair(X(0.2), C.r, 0.3); C.wheelPair(X(0.82), C.r, 0.3);
  },
  hyper: C => {
    profileBody(C, 'sport', { tinted: true, noGrille: true, spokes: 10, rim: mat(0x1f1f23, { metalness: 0.8, roughness: 0.3 }) });
    const { X, H, L, W } = C;
    const carbon = mat(0x111214, { roughness: 0.35, metalness: 0.3 });
    for (const s of [-1, 1]) {
      C.box(0.12, 0.45, 0.06, carbon, X(0.06), H * 0.68, s * 0.5); // Flügelstützen
      C.box(0.6, 0.3, 0.04, carbon, X(0.05), H * 0.92, s * (W / 2 + 0.06)); // Endplatten
    }
    C.box(0.6, 0.06, W + 0.1, carbon, X(0.05), H * 0.95, 0); // Heckflügel
    C.box(0.4, 0.05, W * 0.95, carbon, L / 2 - 0.05, H * 0.13, 0); // Frontsplitter
    for (let i = -2; i <= 2; i++) C.box(0.4, 0.2, 0.03, carbon, -L / 2 + 0.15, H * 0.24, i * 0.3); // Diffusor
    C.decal(L * 0.28, H * 0.2, X(0.3), H * 0.36, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0.85)'; g.beginPath(); g.moveTo(0, h); g.lineTo(w, h * 0.15); g.lineTo(w, h); g.fill(); }, 0.004); // Lufteinlass
    C.decal(L * 0.92, 0.05, 0, H * 0.27, band('#f43f5e'), 0.004);
    C.box(0.04, 0.04, W * 0.75, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe0f2fe, emissiveIntensity: 1.5 }), L / 2 - 0.12, H * 0.4, 0); // Lichtband
    C.box(0.6, 0.16, 0.35, carbon, C.roofX - 0.25, C.roofY + 0.04, 0); // Dachhutze
  },
  sleigh: C => {
    C.W = 1.5;
    const { X, M } = C, gold = M.gold, red = mat(0xc81e1e, { roughness: 0.6 }), white = mat(0xf8fafc, { roughness: 0.9 });
    // Schlitten mit hoher Lehne und Goldkufen
    C.bodyMesh = C.ext(roundPoly([[X(0.02), 0.5], [X(0), 1.75], [X(0.07), 1.9], [X(0.13), 1.65], [X(0.2), 1.1], [X(0.42), 1.0], [X(0.49), 1.3], [X(0.55), 1.22], [X(0.5), 0.5]], 0.14), 1.3, C.paint, 0.1);
    C.decal(1.6, 0.4, X(0.3), 0.8, text('✦ ✦ ✦', '#facc15'), 0.004);
    for (const s of [-1, 1]) {
      const runner = new THREE.CatmullRomCurve3([[-0.02, 0.18], [0.02, 0.06], [0.44, 0.06], [0.54, 0.2], [0.53, 0.44], [0.48, 0.4]].map(([f, y]) => new THREE.Vector3(X(f), y, s * 0.6)));
      C.add(new THREE.Mesh(new THREE.TubeGeometry(runner, 48, 0.05, 8), gold));
      for (const f of [0.1, 0.25, 0.4]) C.box(0.06, 0.45, 0.06, gold, X(f), 0.3, s * 0.6);
    }
    C.box(0.7, 0.2, 1.2, mat(0x14532d, { roughness: 0.9 }), X(0.25), 1.08, 0); // Sitzkissen
    // Samichlaus
    const sx = X(0.27);
    C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.4, 4, 12), red), sx, 1.5, 0);
    C.cyl(0.33, 0.33, 0.1, mat(0x111111), sx, 1.35, 0);
    C.box(0.1, 0.12, 0.12, gold, sx + 0.33, 1.35, 0); // Gürtelschnalle
    C.sph(0.22, M.skin, sx + 0.02, 2.05, 0);
    C.sph(0.2, white, sx + 0.1, 1.9, 0, [0.8, 1.15, 1.1]); // Bart
    C.cyl(0.24, 0.24, 0.09, white, sx + 0.02, 2.2, 0); // Mützenrand
    C.cyl(0, 0.22, 0.48, red, sx + 0.06, 2.45, 0, [0, 0, -0.35]);
    C.sph(0.08, white, sx + 0.14, 2.68, 0);
    // Sack mit Geschenken
    C.sph(0.55, mat(0x7c4a1e, { roughness: 0.95 }), X(0.08), 1.75, 0, [0.85, 1.05, 0.95]);
    [[0x22c55e, 0.1, 0.25], [0x3b82f6, -0.1, -0.2], [0xfacc15, 0.05, 0.02]].forEach(([col, dx, z], i) => {
      const b = C.box(0.32, 0.32, 0.32, mat(col), X(0.08) + dx, 2.3 + i * 0.06, z);
      b.rotation.y = i * 0.5;
      C.box(0.34, 0.06, 0.34, red, X(0.08) + dx, 2.3 + i * 0.06, z).rotation.y = i * 0.5;
    });
    // Rentier mit roter Nase
    const fur = mat(0x7c4a1e, { roughness: 0.85 }), rx = X(0.8);
    for (const s of [-1, 1]) tube(C, X(0.53), 0.55, rx - 0.4, 1.15, 0.035, mat(0x5b3a1a), s * 0.3); // Deichsel
    tube(C, sx + 0.3, 1.55, rx + 0.6, 1.7, 0.015, M.dark, 0.12); // Zügel
    const torso = C.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 12), fur), rx, 1.25, 0);
    torso.rotation.z = PI / 2;
    for (const dx of [-0.42, 0.42]) for (const s of [-1, 1]) C.cyl(0.07, 0.06, 1.0, fur, rx + dx, 0.5, s * 0.17, [0, 0, dx * 0.15]);
    C.cyl(0.13, 0.17, 0.65, fur, rx + 0.6, 1.62, 0, [0, 0, -0.6]); // Hals
    C.sph(0.2, fur, rx + 0.85, 1.92, 0, [1.4, 0.9, 0.9]); // Kopf
    C.sph(0.1, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.4 }), rx + 1.13, 1.88, 0); // rote Nase
    C.sph(0.12, white, rx - 0.75, 1.35, 0); // Schwänzchen
    const antler = mat(0xd6c29a, { roughness: 0.8 });
    for (const s of [-1, 1]) {
      C.sph(0.04, mat(0x111111), rx + 0.98, 1.98, s * 0.13);
      tube(C, rx + 0.78, 2.05, rx + 0.62, 2.55, 0.03, antler, s * 0.14);
      tube(C, rx + 0.69, 2.3, rx + 0.85, 2.52, 0.025, antler, s * 0.16);
      tube(C, rx + 0.65, 2.45, rx + 0.5, 2.62, 0.025, antler, s * 0.15);
    }
  },
});
// Sonderfahrzeug LIONEL X: eigener flacher Supersportwagen (Keil mit einer Glaskuppel in einem Bogen), knallrot
// mit pulsierendem Leuchten, Y-Lichter vorne und hinten, eckige Lufteinlässe, vier Auspuffrohre (kein Markenlogo)
Object.assign(BUILD, {
  lionelx: C => {
    C.W = 2.0;
    const { X, H, L, W, M } = C, r = 0.4;
    const plain = !C.v.special && !(C.v.tune && C.v.tune.finish);
    if (plain) { // glänzendes Rot, das leicht von innen leuchtet (pulsiert in animateCar)
      Object.assign(C.paint, { metalness: 0.55, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 });
      C.paint.emissive = new THREE.Color(0xff1a00); C.paint.emissiveIntensity = 0.25;
      C.paint.userData.pulse = true;
    }
    // Seitenprofil: Heckkante, kurzer Motordeckel, Gürtellinie, lange flache Haube, spitze Nase
    const body = [[0, 0.2], [0, 0.48], [0.02, 0.53], [0.2, 0.56], [0.32, 0.6], [0.6, 0.6], [0.78, 0.5], [0.92, 0.38], [0.995, 0.27],
      [1, 0.2], [0.97, 0.12], [0.03, 0.12]].map(([x, y]) => [X(x), y * H]);
    const pts = roundPoly(body, 0.06);
    C.bodyMesh = C.ext(pts, W - 0.16, C.paint, 0.08);
    const dark = mat(0x0a0b0e, { roughness: 0.35, metalness: 0.4 }), glassM = mat(0x0c1118, { metalness: 0.75, roughness: 0.04 });
    // Kuppel: ein Bogen vom Motordeckel über das Dach bis zur flachen Frontscheibe
    // flacher Bogen; hinten in Wagenfarbe (Dach), vorne aus dunklem Glas (Front- und Seitenscheiben)
    const arc = f => [X(0.27 + f * 0.5), (0.6 + Math.sin(Math.PI * Math.pow(f, 0.8)) * 0.25) * H];
    const cut = 0.42, cw = W * 0.74, base = 0.6 * H;
    const part = (f0, f1) => { const p = []; for (let k = 0; k <= 8; k++) p.push(arc(f0 + (f1 - f0) * k / 8)); return [[p[0][0], base], ...p, [p[8][0], base]]; };
    C.ext(part(0, cut), cw, C.paint, 0.04);
    C.ext(part(cut, 1), cw, glassM, 0.04);
    { // kleines Seitenfenster hinten, steigt nach vorne zur Glaskuppel an (als Teil, damit beide Seiten gleich sind)
      const x0 = X(0.3), x1 = arc(cut)[0], ww = x1 - x0, y0 = 0.62 * H, y1 = 0.81 * H, win = [[x0 + ww * 0.15, y0]];
      for (let k = 1; k <= 8; k++) { // Bogen wie quadraticCurveTo
        const t = k / 8, a0 = (1 - t) * (1 - t), a1 = 2 * t * (1 - t), a2 = t * t;
        win.push([a0 * (x0 + ww * 0.15) + a1 * (x0 + ww * 0.55) + a2 * x1, a0 * y0 + a1 * y1 + a2 * y1]);
      }
      win.push([x1, y0]);
      C.ext(win, cw + 0.05, glassM, 0.01);
    }
    C.roofY = 0.86 * H; C.roofX = arc(0.45)[0];
    // grosser Lufteinlass an der Seite (vor dem Hinterrad) und Kante darunter
    C.ext([[X(0.27), 0.25 * H], [X(0.4), 0.5 * H], [X(0.47), 0.5 * H], [X(0.43), 0.25 * H]], W + 0.02, dark, 0.02);
    // Front: drei eckige Lufteinlässe unten, Splitter
    for (const [z, w] of [[0, 0.5], [-0.62, 0.42], [0.62, 0.42]]) C.box(0.08, 0.13, w, dark, L / 2 + 0.06, 0.2 * H, z);
    C.box(0.45, 0.04, W * 0.9, dark, L / 2 - 0.12, 0.11 * H, 0);
    // Scheinwerfer: dunkles Glas an den vorderen Ecken, darin ein leuchtendes „Y“
    const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 2.4 });
    const tailM = new THREE.MeshStandardMaterial({ color: 0x500000, emissive: 0xff1010, emissiveIntensity: 2.4 });
    const slope = Math.atan2((0.38 - 0.27) * H, 0.075 * L), hy = 0.33 * H + 0.08;
    for (const sz of [-1, 1]) {
      const zc = sz * (W / 2 - 0.34);
      const housing = C.box(0.4, 0.025, 0.14, glassM, X(0.955), hy, zc); // schmales, schräges Scheinwerferglas
      housing.rotation.set(0, sz * 1.05, -slope);
      const led = C.box(0.38, 0.02, 0.035, head, X(0.955), hy + 0.012, zc); // Lichtstreifen darin
      led.rotation.set(0, sz * 1.05, -slope);
      const led2 = C.box(0.16, 0.02, 0.03, head, X(0.94), hy + 0.01, zc + sz * 0.08); // kurzer Strich: Pfeil-Form
      led2.rotation.set(0, sz * 0.1, -slope);
      // Rücklicht: dunkles Band mit rotem Y
      const tz = sz * (W / 2 - 0.36);
      for (const [h, rx, dy] of [[0.24, 0, 0], [0.14, 0.8, 0.05], [0.14, -0.8, -0.05]]) {
        const b = C.box(0.03, 0.035, h, tailM, -L / 2 + 0.06, 0.43 * H + dy, tz + (rx ? sz * 0.12 : 0));
        b.rotation.x = rx * sz;
      }
    }
    C.box(0.04, 0.16, W * 0.9, dark, -L / 2 + 0.04, 0.43 * H, 0); // dunkles Heckband
    // Diffusor mit Rippen, vier Auspuffrohre in der Mitte
    for (let i = -3; i <= 3; i++) C.box(0.32, 0.16, 0.025, dark, -L / 2 + 0.14, 0.2 * H, i * 0.24);
    for (const z of [-0.33, -0.17, 0.17, 0.33]) {
      C.box(0.18, 0.09, 0.13, M.chrome, -L / 2 + 0.03, 0.28 * H, z);
      C.box(0.05, 0.06, 0.1, mat(0x111111), -L / 2 - 0.04, 0.28 * H, z);
    }
    C.box(0.36, 0.035, W * 0.7, dark, X(0.03), 0.56 * H + 0.03, 0); // kleiner Spoiler an der Heckkante
    // Seitenschweller mit roter Leuchtlinie, Name, Unterboden
    const glow = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff1a1a, emissiveIntensity: 2.2 });
    for (const sz of [-1, 1]) { C.box(L * 0.56, 0.1, 0.06, dark, X(0.5), 0.15 * H, sz * (W / 2 - 0.01)); C.box(L * 0.52, 0.025, 0.03, glow, X(0.5), 0.205 * H, sz * (W / 2 + 0.025)); }
    C.decal(L * 0.28, H * 0.11, X(0.58), H * 0.36, text('LIONEL X', '#ffffff'), 0.004);
    C.box(L * 0.86, 0.1, W * 0.8, M.dark, 0, 0.08 * H, 0);
    // grosse Räder: helle Felgen, rote Bremssättel
    const rim = mat(0xd9dee6, { metalness: 1, roughness: 0.2 });
    C.wheelPair(X(0.2), r, 0.4, rim, 10); C.wheelPair(X(0.82), r * 0.95, 0.34, rim, 10);
    for (const [x, rr] of [[X(0.2), r], [X(0.82), r * 0.95]]) for (const sz of [-1, 1]) C.box(0.22, 0.14, 0.05, mat(0xd10000), x + 0.12, rr + 0.08, sz * (W / 2 - 0.2));
    C.side = { pts, bottom: 0.12 * H, top: 0.6 * H, tall: false, doors: [X(0.68), X(0.4)], doorTop: 0.57 * H };
    const under = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.1, W * 1.45), // rotes Leuchten unter dem Auto (pulsiert)
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, map: M.shadow.map, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    under.rotation.x = -PI / 2; under.position.y = 0.07; under.renderOrder = 1;
    under.userData.pulse = true;
    C.group.add(under);
    // Düsen zum Fliegen: zwei nach hinten, vier nach unten (nur in der Luft sichtbar, siehe animateCar)
    const jet = new THREE.MeshBasicMaterial({ color: 0xffa020 }), lift = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    for (const z of [-0.25, 0.25]) C.cyl(0, 0.15, 1.1, jet, -L / 2 - 0.6, 0.28 * H, z, [0, 0, PI / 2]).userData.flame = true;
    for (const [x, sz] of [[X(0.2), -1], [X(0.2), 1], [X(0.82), -1], [X(0.82), 1]]) C.cyl(0.17, 0, 0.9, lift, x, -0.3, sz * (W / 2 - 0.35)).userData.flame = true;
    // links und rechts je ein galoppierender Stier, darüber schwebt „ADMIN“
    for (const sz of [-1, 1]) C.body.add(bull(X(0.55), 0.7 * H, sz * (W / 2 + 0.55), sz)); // schweben neben dem Fenster
    C.body.add(floatingLabel('ADMIN', 0.94 * H + 1.3));
  },
});

// Stier (eigene einfache Form): Körper, Kopf mit Hörnern, glühende Augen, vier Beine mit Gelenk oben, Schwanz.
// Beine, Kopf und Schwanz bewegen sich in animateCar (userData.gallop / bob / tail)
function bull(x, y, z, side) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(0.18);
  g.userData.bob = { base: y, phase: side > 0 ? 0 : 1.6 };
  const hide = mat(0xc8100a, { roughness: 0.45, metalness: 0.2 }), dark = mat(0x3a0503, { roughness: 0.8 }), horn = mat(0xf1e4c8, { roughness: 0.5 });
  const add = (m, x, y, zz) => { m.position.set(x, y, zz); m.castShadow = true; g.add(m); return m; };
  const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 12), hide), 0, 1.15, 0);
  body.rotation.z = PI / 2;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), hide), 0.38, 1.28, 0).scale.set(1, 1, 0.85); // Buckel vorne
  const head = new THREE.Group(); head.position.set(0.95, 1.32, 0); g.add(head);
  head.userData.nod = side > 0 ? 0 : 1.6;
  const hm = (m, x, y, zz) => { m.position.set(x, y, zz); m.castShadow = true; head.add(m); return m; };
  hm(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), hide), 0.18, -0.05, 0);
  hm(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.34), dark), 0.48, -0.14, 0); // Schnauze
  for (const s2 of [-1, 1]) {
    const h1 = hm(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 8), horn), 0.12, 0.2, s2 * 0.3);
    h1.rotation.set(s2 * 1.1, 0, -0.3); // Horn zur Seite und nach vorne
    hm(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x302000, emissive: 0xffd000, emissiveIntensity: 2.5 })), 0.38, 0.06, s2 * 0.16);
  }
  const ring = hm(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), mat(0xd4af37, { metalness: 1, roughness: 0.3 })), 0.6, -0.2, 0); // Nasenring
  ring.rotation.y = PI / 2;
  // Beine: Drehpunkt an der Hüfte, damit sie schwingen
  [[0.5, 0.25, 0], [0.5, -0.25, Math.PI], [-0.5, 0.25, Math.PI], [-0.5, -0.25, 0]].forEach(([x, zz, ph]) => {
    const hip = new THREE.Group(); hip.position.set(x, 0.95, zz); g.add(hip);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.85, 8), hide); leg.position.y = -0.42; leg.castShadow = true; hip.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 8), dark); hoof.position.y = -0.88; hip.add(hoof);
    hip.userData.gallop = ph + (side > 0 ? 0 : 1.6);
  });
  const tail = new THREE.Group(); tail.position.set(-0.9, 1.3, 0); g.add(tail);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.6, 6), hide); tm.position.y = -0.3; tail.add(tm);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), dark); tuft.position.y = -0.62; tail.add(tuft);
  tail.rotation.z = 0.5; tail.userData.tail = side > 0 ? 0 : 1.6;
  return g;
}

// Leuchtende Schrift, die in der Luft schwebt (wippt in animateCar)
function floatingLabel(textStr, y) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2a1a'; g.shadowBlur = 28;
  g.lineWidth = 10; g.strokeStyle = '#7f0000'; g.strokeText(textStr, 256, 66);
  g.fillStyle = '#ffd5cc'; g.fillText(textStr, 256, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(3.2, 0.8, 1);
  s.position.y = y;
  s.userData.float = y;
  return s;
}
SPEC_HINT.lionelx = { width: 2.0 };
SPEC_HINT.candy = { arch: 'box' };
SPEC_HINT.racetruck = { arch: 'pickup' };
SPEC_HINT.hyper = { arch: 'sport' };

// Bewegte Details: Rotor, Propeller, Mischtrommel, Drachenflügel, Blaulicht, Regenbogen-Lack
export function animateCar(mesh, t, special, flying = false) {
  mesh.userData.body.traverse(o => {
    const u = o.userData;
    if (u.spin) o.rotation.y += 0.6;
    if (u.fan) o.rotation.x += 0.5;
    if (u.roll) o.rotation.x += 0.06;
    if (u.flap) o.rotation.x = u.flap * (0.25 + Math.sin(t * 7) * 0.35);
    if (u.flame) { o.visible = flying; o.scale.set(1, 0.8 + Math.random() * 0.5, 1); }
    if (u.rainbow) o.material.color.setHSL((t * 0.3) % 1, 0.85, 0.6);
    if (u.blink) o.material.emissiveIntensity = Math.floor(t * 6 + (u.blink > 0 ? 1 : 0)) % 2 ? 3 : 0;
    if (u.gallop !== undefined) o.rotation.z = Math.sin(t * 11 + u.gallop) * 0.65; // Stier: Beine im Galopp
    if (u.bob) o.position.y = u.bob.base + Math.sin(t * 2.5 + u.bob.phase) * 0.06; // Stier schwebt sanft auf und ab
    if (u.nod !== undefined) o.rotation.z = Math.sin(t * 11 + u.nod) * 0.12;
    if (u.tail !== undefined) o.rotation.x = Math.sin(t * 7 + u.tail) * 0.5;
    if (u.float !== undefined) o.position.y = u.float + Math.sin(t * 2) * 0.15; // schwebende Schrift
  });
  if (special === 'rainbow' && !mesh.userData.finish) mesh.userData.paint.color.setHSL((t * 0.25) % 1, 0.85, 0.5);
  const paint = mesh.userData.paint; // Sonderfahrzeug: Lack und Unterboden-Leuchten pulsieren
  if (paint && paint.userData.pulse) paint.emissiveIntensity = 0.2 + 0.18 * (1 + Math.sin(t * 3));
  for (const o of mesh.children) if (o.userData.pulse) o.material.opacity = 0.6 + 0.35 * (1 + Math.sin(t * 3)) / 2;
  if (mesh.userData.shadow) mesh.userData.shadow.visible = !flying && mesh.position.y < 0.3;
}

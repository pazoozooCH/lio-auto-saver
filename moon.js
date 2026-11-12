// Der Mond (für city.js): eine eigene kleine Welt weit weg von der Stadt (MOON.x, MOON.z), man kommt nur mit der
// Mondrakete hin (Startplatz in country.js). Grauer Boden mit Kratern (moonGround), schwarzer Himmel mit Sternen,
// die Erde am Himmel, Mondbasis mit Kuppeln, Landefähre, Schweizer Fahne, Mondsteine zum Sammeln und ein Mond-Buggy.
// Wenig Schwerkraft (MOON_G): city.js lässt Auto und Figur damit hoch springen.
import * as THREE from 'three';
import { makeRocket } from './country.js';

export const MOON = { x: 0, z: -30000, r: 480 }; // Mitte und befahrbarer Radius
export const MOON_G = 1.62;
export const MOON_ROCKET = { x: MOON.x, z: MOON.z + 40 }; // dort landet die Rakete
export const MOON_BUGGY = { x: MOON.x + 22, z: MOON.z + 52, h: -Math.PI / 2, v: { id: 'moon-buggy', kind: 'offroad', color: '#e5e7eb', ps: 70, name: 'Mond-Buggy' } };
const BASE = { x: MOON.x + 70, z: MOON.z + 20 };
const LANDER = { x: MOON.x - 60, z: MOON.z + 70 };

// Krater: [x, z, Radius, Tiefe] (relativ zur Mondmitte)
const rng = (() => { let q = 11; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
const CRATERS = [[-120, -80, 60, 9], [150, -150, 45, 7], [-200, 160, 70, 10], [60, 200, 35, 5], [230, 60, 28, 4], [-60, -260, 50, 7], [300, -280, 55, 8]];
for (let k = 0; k < 40; k++) {
  const x = (rng() - 0.5) * 900, z = (rng() - 0.5) * 900;
  if (Math.hypot(x, z - 40) < 70 || Math.hypot(x - 70, z - 20) < 50) continue; // nicht beim Landeplatz und der Basis
  CRATERS.push([x, z, 6 + rng() * 18, 1 + rng() * 3]);
}
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export const inMoon = (x, z) => Math.hypot(x - MOON.x, z - MOON.z) < MOON.r + 120;
export function moonGround(x, z) {
  const u = x - MOON.x, v = z - MOON.z;
  let h = Math.sin(u * 0.013) * Math.cos(v * 0.011) * 3 + Math.sin(u * 0.041 + v * 0.03) * 0.8;
  for (const [cx, cz, R, D] of CRATERS) {
    const d = Math.hypot(u - cx, v - cz);
    if (d > R * 1.8) continue;
    h += d < R ? -D * (1 - (d / R) ** 2) : 0;
    h += D * 0.45 * Math.exp(-(((d - R) / (R * 0.3)) ** 2)); // Kraterrand
  }
  const flat = smooth(1 - Math.min(Math.hypot(u - (MOON_ROCKET.x - MOON.x), v - (MOON_ROCKET.z - MOON.z)), Math.hypot(u - (BASE.x - MOON.x), v - (BASE.z - MOON.z))) / 45);
  h *= 1 - flat; // Landeplatz und Basis eben
  const rr = Math.hypot(u, v);
  h += smooth((rr - MOON.r) / 90) * 60; // Berge am Rand
  return h;
}
const SOLIDS = [{ x: BASE.x, z: BASE.z, r: 11 }, { x: BASE.x + 22, z: BASE.z + 6, r: 8 }, { x: BASE.x + 6, z: BASE.z - 20, r: 7 }, { x: LANDER.x, z: LANDER.z, r: 4.5 }, { x: MOON_ROCKET.x, z: MOON_ROCKET.z, r: 3 }];
export function moonAllowed(x, z, r = 1) {
  if (Math.hypot(x - MOON.x, z - MOON.z) > MOON.r) return false;
  return !SOLIDS.some(o => Math.hypot(x - o.x, z - o.z) < o.r + r * 0.6);
}

export function buildMoon({ scene }) {
  const out = { rocks: [], group: new THREE.Group() }, G = out.group;
  scene.add(G);
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
  const add = (geo, m, x, y, z, parent = G) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // Boden: Netz mit Kratern, Farbe von hell (Ränder) bis dunkel (Kraterboden)
  const geo = new THREE.PlaneGeometry(1300, 1300, 170, 170).rotateX(-Math.PI / 2).translate(MOON.x, 0, MOON.z);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = moonGround(x, z); pos.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 0.07) * Math.cos(z * 0.05);
    c.setRGB(0.4, 0.4, 0.43).lerp(new THREE.Color(0.22, 0.22, 0.25), Math.min(1, Math.max(0, -y / 8)) * 0.8 + n * 0.12);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); ground.receiveShadow = true; G.add(ground);
  // Steine
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M(0x6b6b70, { flatShading: true }), 160), d0 = new THREE.Object3D();
  for (let k = 0; k < 160; k++) {
    const a = rng() * Math.PI * 2, r = 30 + rng() * 440, x = MOON.x + Math.cos(a) * r, z = MOON.z + Math.sin(a) * r, s = 0.3 + rng() * 1.4;
    d0.position.set(x, moonGround(x, z) + s * 0.3, z); d0.rotation.set(rng() * 3, rng() * 3, 0); d0.scale.set(s, s * 0.7, s); d0.updateMatrix(); rocks.setMatrixAt(k, d0.matrix);
  }
  rocks.castShadow = true; G.add(rocks);
  // Sterne und die Erde
  const sp = [];
  for (let k = 0; k < 1500; k++) { const a = rng() * Math.PI * 2, e = rng() * 1.5; sp.push(MOON.x + Math.cos(a) * Math.cos(e) * 2600, Math.sin(e) * 2600 - 200, MOON.z + Math.sin(a) * Math.cos(e) * 2600); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  G.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
  const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256; const eg = ec.getContext('2d');
  eg.fillStyle = '#1d4ed8'; eg.fillRect(0, 0, 512, 256);
  eg.fillStyle = '#16a34a'; for (const [x, y, w, h] of [[60, 60, 90, 70], [120, 140, 60, 80], [250, 50, 110, 60], [280, 120, 50, 70], [390, 80, 80, 90]]) { eg.beginPath(); eg.ellipse(x, y, w / 2, h / 2, 0.4, 0, 7); eg.fill(); }
  eg.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < 40; k++) { eg.beginPath(); eg.ellipse(rng() * 512, rng() * 256, 20 + rng() * 40, 5 + rng() * 8, 0, 0, 7); eg.fill(); }
  eg.fillStyle = '#f8fafc'; eg.fillRect(0, 0, 512, 14); eg.fillRect(0, 242, 512, 14);
  const et = new THREE.CanvasTexture(ec); et.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(150, 40, 24), new THREE.MeshBasicMaterial({ map: et, fog: false }));
  earth.position.set(MOON.x - 900, 700, MOON.z - 1800); G.add(earth); out.earth = earth;
  // Mondbasis: Kuppeln, Röhren, Antenne, Solarzellen
  const white = M(0xf1f5f9, { roughness: 0.4 }), glass = M(0x93c5fd, { metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.6 }), gold = M(0xd4a017, { metalness: 0.8, roughness: 0.3 });
  for (const [dx, dz, r] of [[0, 0, 10], [22, 6, 7], [6, -20, 6]]) {
    const y = moonGround(BASE.x + dx, BASE.z + dz);
    add(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), white, BASE.x + dx, y, BASE.z + dz);
    add(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.3, 20), glass, BASE.x + dx, y + r * 0.98, BASE.z + dz);
  }
  for (const [x0, z0, x1, z1] of [[0, 0, 22, 6], [0, 0, 6, -20]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), t = add(new THREE.CylinderGeometry(1.6, 1.6, len, 14).rotateZ(Math.PI / 2), white, BASE.x + (x0 + x1) / 2, moonGround(BASE.x, BASE.z) + 1.6, BASE.z + (z0 + z1) / 2);
    t.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  }
  const by = moonGround(BASE.x, BASE.z);
  add(new THREE.CylinderGeometry(0.2, 0.2, 14, 8), white, BASE.x - 14, by + 7, BASE.z - 8);
  const dish = add(new THREE.SphereGeometry(3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3), white, BASE.x - 14, by + 14, BASE.z - 8); dish.rotation.x = 0.8;
  for (let k = 0; k < 4; k++) { const p = add(new THREE.BoxGeometry(6, 0.15, 3), M(0x1e3a8a, { metalness: 0.5, roughness: 0.2 }), BASE.x + 30 + k * 7, by + 2.2, BASE.z - 18); p.rotation.x = -0.5; add(new THREE.BoxGeometry(0.2, 2, 0.2), white, BASE.x + 30 + k * 7, by + 1, BASE.z - 18); }
  const label = (text, x, y, z, ry = 0, w = 12, h = 2) => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const g = cv.getContext('2d');
    g.fillStyle = '#111827'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#fde047'; g.font = 'bold ' + Math.round(cv.height * 0.55) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cv.width / 2, cv.height / 2 + 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; G.add(m); return m;
  };
  label('🌙 MONDBASIS CAR-SAVER', BASE.x, by + 13, BASE.z + 0.5, 0, 16, 2.2);
  // Landefähre (golden), Schweizer Fahne, die Rakete
  const ly = moonGround(LANDER.x, LANDER.z);
  add(new THREE.BoxGeometry(4, 3, 4), gold, LANDER.x, ly + 3.5, LANDER.z);
  add(new THREE.CylinderGeometry(2, 2.4, 2.4, 8), M(0xd1d5db, { metalness: 0.5 }), LANDER.x, ly + 6.2, LANDER.z);
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { const l = add(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6), M(0x9ca3af), LANDER.x + dx * 0.7, ly + 1.8, LANDER.z + dz * 0.7); l.rotation.set(dz * 0.12, 0, -dx * 0.12); add(new THREE.CylinderGeometry(0.6, 0.6, 0.15, 12), M(0x9ca3af), LANDER.x + dx, ly + 0.08, LANDER.z + dz); }
  const fx = MOON_ROCKET.x - 14, fz = MOON_ROCKET.z - 4, fy = moonGround(fx, fz);
  add(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), M(0xd1d5db, { metalness: 0.6 }), fx, fy + 2.5, fz);
  const fc = document.createElement('canvas'); fc.width = fc.height = 128; const fg = fc.getContext('2d'); fg.fillStyle = '#da291c'; fg.fillRect(0, 0, 128, 128); fg.fillStyle = '#fff'; fg.fillRect(24, 52, 80, 24); fg.fillRect(52, 24, 24, 80);
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8).translate(0.9, 0, 0), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide })); flag.position.set(fx + 0.08, fy + 4.1, fz); G.add(flag); // weht nicht (kein Wind)
  add(new THREE.BoxGeometry(2, 0.06, 0.06), M(0xd1d5db), fx + 1, fy + 5, fz); // Querstange
  out.rocket = makeRocket(); out.rocket.position.set(MOON_ROCKET.x, moonGround(MOON_ROCKET.x, MOON_ROCKET.z), MOON_ROCKET.z); G.add(out.rocket);
  label('🚀 ZURÜCK ZUR ERDE – X', MOON_ROCKET.x + 10, moonGround(MOON_ROCKET.x, MOON_ROCKET.z) + 4, MOON_ROCKET.z, -Math.PI / 2, 9, 1.4);
  // Mondsteine (leuchten blau): einsammeln = Münzen
  const crystal = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.2, roughness: 0.3, flatShading: true });
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + rng() * 0.4, r = 90 + rng() * 330, x = MOON.x + Math.cos(a) * r, z = MOON.z + Math.sin(a) * r;
    const m = add(new THREE.OctahedronGeometry(0.8, 0), crystal, x, moonGround(x, z) + 1.2, z); m.scale.y = 1.6;
    out.rocks.push({ mesh: m, x, z, got: false });
  }
  G.visible = false;
  return out;
}

// Mondsteine drehen sich; nah genug (zu Fuss oder im Auto) = einsammeln
export function stepMoon(Mo, dt, t, px, pz, onRock) {
  for (const r of Mo.rocks) {
    if (r.got) continue;
    r.mesh.rotation.y += dt * 1.5; r.mesh.position.y = moonGround(r.x, r.z) + 1.2 + Math.sin(t * 2 + r.x) * 0.25;
    if (Math.hypot(px - r.x, pz - r.z) < 3) { r.got = true; r.mesh.visible = false; onRock(Mo.rocks.filter(q => q.got).length, Mo.rocks.length); }
  }
  Mo.earth.rotation.y += dt * 0.02;
}

// Schrottplatz (für city.js): abseits der Stadt an der Flughafenstrasse (Zufahrt in ROADS, outskirts.js). Zaun, Berge von
// Schrottautos, Reifenstapel, Kran, Hütte des Schrotthändlers. Überall liegen Autoteile (SPOTS) – hinfahren oder hingehen
// = einsammeln; beim Händler (HUT) Teile kaufen und mit allen sechs Teilen ein Eigenbau-Auto zusammensetzen
// (cityDealer.junkBuild in game.js). Gesammelte Teile: Spielstand autoRetterJunk = { parts: { id: Anzahl } }.
import * as THREE from 'three';

export const JUNK = { x0: -990, x1: -890, z0: 500, z1: 592 }; // Gelände (eben, Kies)
const GATE = { x0: -940, x1: -920 }; // Tor im Norden (z = 500), davor die Zufahrt von der Flughafenstrasse
export const HUT = { x: -980, z: 515, w: 12, d: 9 }; // Hütte des Händlers (Nordwest-Ecke)
export const BENCH = { x: -962, z: 530, r: 6 }; // gelbes Feld davor: hier öffnet sich der Laden, hier steht der fertige Eigenbau
export const BUILT = { x: -938, z: 538, h: Math.PI / 2 }; // hier steht der fertige Eigenbau
export const PARTS = [
  ['body', '🚗', 'Karosserie', 40], ['engine', '⚙️', 'Motor', 35], ['wheels', '🛞', 'Räder', 25],
  ['steer', '🎡', 'Lenkrad', 10], ['seats', '💺', 'Sitze', 15], ['lights', '💡', 'Lichter', 10],
];
export const inJunk = (x, z, m = 0) => x > JUNK.x0 - m && x < JUNK.x1 + m && z > JUNK.z0 - m && z < JUNK.z1 + m;

const KEY = 'autoRetterJunk';
export function loadJunk() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.parts) return j; } catch (e) { /* neu */ }
  return { parts: {} };
}
export function saveJunk(j) { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) { /* ohne Speicher */ } }
export const missingParts = j => PARTS.filter(([id]) => !(j.parts[id] > 0));

// Sprite mit einem Bildchen (Teil zum Einsammeln), leuchtet ein wenig
const icons = new Map();
function iconSprite(emoji) {
  let mat = icons.get(emoji);
  if (!mat) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(250,204,21,0.92)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
    g.font = '70px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.SpriteMaterial({ map: t, depthWrite: false });
    icons.set(emoji, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(1.6, 1.6, 1);
  return s;
}

// Bauen: carMesh(kind, color) liefert ein (einfaches) Auto für die Schrottberge
export function buildJunkyard({ scene, sign, solid, carMesh }) {
  const g = new THREE.Group(), M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const cx = (JUNK.x0 + JUNK.x1) / 2, cz = (JUNK.z0 + JUNK.z1) / 2, W = JUNK.x1 - JUNK.x0, D = JUNK.z1 - JUNK.z0;
  // Kiesboden
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), M(0x8d8172, { roughness: 1 }));
  ground.position.set(cx, 0.04, cz); ground.receiveShadow = true; g.add(ground);
  // Zaun aus Wellblech (mit Lücke für das Tor im Norden)
  const fence = M(0x9ca3af, { metalness: 0.4, roughness: 0.6 }), H = 2.6;
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), o = add(new THREE.BoxGeometry(len, H, 0.15), fence, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0));
    solid.push({ x0: Math.min(x0, x1) - 0.2, x1: Math.max(x0, x1) + 0.2, z0: Math.min(z0, z1) - 0.2, z1: Math.max(z0, z1) + 0.2, h: H });
    return o;
  };
  wall(JUNK.x0, JUNK.z0, GATE.x0, JUNK.z0); wall(GATE.x1, JUNK.z0, JUNK.x1, JUNK.z0);
  wall(JUNK.x0, JUNK.z1, JUNK.x1, JUNK.z1); wall(JUNK.x0, JUNK.z0, JUNK.x0, JUNK.z1); wall(JUNK.x1, JUNK.z0, JUNK.x1, JUNK.z1);
  for (const x of [GATE.x0, GATE.x1]) add(new THREE.BoxGeometry(0.4, 3.4, 0.4), M(0x374151), x, 1.7, JUNK.z0);
  const sg = sign('🔧 SCHROTTPLATZ · Teile & Eigenbau', '#92400e', '#fef3c7', 10, 1.6);
  sg.position.set((GATE.x0 + GATE.x1) / 2, 4.2, JUNK.z0 - 0.1); sg.rotation.y = Math.PI; g.add(sg);
  const sg2 = sg.clone(); sg2.position.z = JUNK.z0 + 0.1; sg2.rotation.y = 0; g.add(sg2);
  // Hütte des Händlers mit Vordach und gelbem Feld davor
  add(new THREE.BoxGeometry(HUT.w, 3.4, HUT.d), M(0x78716c), HUT.x, 1.7, HUT.z);
  add(new THREE.BoxGeometry(HUT.w + 1, 0.3, HUT.d + 3), M(0x7c2d12), HUT.x, 3.55, HUT.z + 1.2);
  add(new THREE.BoxGeometry(2.4, 2.2, 0.1), M(0x1f2937), HUT.x + 2, 1.1, HUT.z + HUT.d / 2 + 0.05);
  const hs = sign('🛠️ Schrotthändler', '#fef3c7', '#7c2d12', 6, 1.2); hs.position.set(HUT.x, 4.4, HUT.z + HUT.d / 2 + 1.5); g.add(hs);
  solid.push({ x0: HUT.x - HUT.w / 2, x1: HUT.x + HUT.w / 2, z0: HUT.z - HUT.d / 2, z1: HUT.z + HUT.d / 2, h: 3.6 });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(BENCH.r, 28).rotateX(-Math.PI / 2), M(0xfacc15, { roughness: 0.7 }));
  pad.position.set(BENCH.x, 0.06, BENCH.z); g.add(pad);
  const ps = sign('🔧 Hier anhalten: Teile kaufen & zusammenbauen', '#facc15', '#111827', 9, 1.2); ps.position.set(BENCH.x, 2.6, BENCH.z - BENCH.r - 0.5); g.add(ps);
  // Kran (Gerüst, Ausleger, Magnet)
  const crane = M(0xf59e0b, { metalness: 0.3 });
  add(new THREE.BoxGeometry(1.2, 14, 1.2), crane, JUNK.x1 - 18, 7, JUNK.z1 - 20);
  add(new THREE.BoxGeometry(22, 1, 1), crane, JUNK.x1 - 26, 14, JUNK.z1 - 20);
  add(new THREE.CylinderGeometry(0.03, 0.03, 6, 4), M(0x111827), JUNK.x1 - 34, 11, JUNK.z1 - 20);
  add(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 16), M(0x374151, { metalness: 0.7 }), JUNK.x1 - 34, 7.8, JUNK.z1 - 20);
  // Reifenstapel (ein Zeichen-Befehl)
  const tyres = [];
  for (let k = 0; k < 12; k++) { const x = JUNK.x0 + 6 + (k % 4) * 3.5, z = JUNK.z1 - 6 - Math.floor(k / 4) * 3.5; for (let h = 0; h < 2 + (k % 3); h++) tyres.push([x, 0.25 + h * 0.42, z]); }
  const tm = new THREE.InstancedMesh(new THREE.TorusGeometry(0.55, 0.22, 8, 16).rotateX(Math.PI / 2), M(0x1f2937), tyres.length), m4 = new THREE.Matrix4();
  tyres.forEach(([x, y, z], k) => tm.setMatrixAt(k, m4.makeTranslation(x, y, z))); tm.castShadow = true; g.add(tm);
  // Schrottberge: rostige Autos, schief, teils gestapelt (einfache Fassung: wenige Zeichen-Befehle)
  const rust = ['#7c2d12', '#9a3412', '#78716c', '#57534e', '#a16207', '#44403c', '#7f1d1d'], kinds = ['car', 'kombi', 'kompakt', 'hatch', 'van', 'pickup', 'beetle', 'mini'];
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rows = [[JUNK.x0 + 25, 560, 0], [JUNK.x0 + 25, 578, 0], [JUNK.x1 - 15, 518, Math.PI / 2]];
  for (const [rx, rz, rot] of rows) for (let k = 0; k < 7; k++) {
    const x = rx + Math.cos(rot) * k * 5.5, z = rz + Math.sin(rot) * k * 5.5;
    for (let h = 0; h < (k % 2 ? 2 : 1); h++) {
      const m = carMesh(kinds[Math.floor(rnd() * kinds.length)], rust[Math.floor(rnd() * rust.length)]);
      m.position.set(x, h * 1.45, z); m.rotation.set((rnd() - 0.5) * 0.15, rot + Math.PI / 2 + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.12);
      g.add(m);
    }
    solid.push({ x0: x - 2.6, x1: x + 2.6, z0: z - 2.6, z1: z + 2.6, h: 3 });
  }
  scene.add(g);
  // Stellen, an denen Teile liegen (frei zwischen den Bergen)
  const spots = [[-972, 545], [-950, 550], [-925, 560], [-905, 582], [-918, 525], [-945, 518], [-925, 587], [-955, 569], [-895, 575], [-980, 568]]
    .map(([x, z]) => ({ x, z, part: null, t: 0, mesh: null }));
  return { group: g, spots, iconSprite };
}

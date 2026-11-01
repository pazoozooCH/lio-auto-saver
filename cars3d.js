// 3D-Fahrzeuge für Rennstrecke und Presse (three.js).
// Jedes Fahrzeug hat eine eigene Bauanleitung (BUILD), angelehnt an seine 2D-Zeichnung in game.js.
// Koordinaten: Länge entlang +X (vorne), Höhe Y, Breite Z (rechte Seite = +Z), Meter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;

// Seitenprofile: Anteile von Länge und Höhe (hinten → vorne); Kabine = [hinten unten, hinten oben, vorne oben, vorne unten, unten, oben]
const PROFILE = {
  sedan: { body: [[0, .22], [0, .48], [.03, .56], [.12, .59], [.8, .58], [.93, .55], [.99, .47], [1, .3], [.98, .22]], cabin: [.2, .3, .64, .8, .56, .96], width: 1.85 },
  compact: { body: [[0, .22], [0, .56], [.1, .6], [.9, .58], [1, .46], [1, .22]], cabin: [.08, .14, .6, .78, .57, .97], width: 1.75 },
  kombi: { body: [[0, .22], [0, .52], [.04, .58], [.86, .58], [.97, .52], [1, .32], [.98, .22]], cabin: [.03, .06, .66, .8, .56, .96], width: 1.85 },
  sport: { body: [[0, .2], [0, .48], [.05, .55], [.3, .57], [.72, .5], [.92, .4], [1, .3], [1, .2]], cabin: [.3, .42, .6, .78, .51, .86], width: 1.95 },
  suv: { body: [[0, .26], [0, .58], [.82, .58], [1, .5], [1, .26]], cabin: [.05, .08, .7, .82, .56, .97], width: 1.95 },
  pickup: { body: [[0, .26], [0, .56], [1, .54], [1, .26]], cabin: [.52, .54, .74, .86, .54, .97], width: 1.95 },
  box: { body: [[0, .18], [0, 1], [.74, 1], [.76, .74], [.9, .72], [1, .46], [1, .18]], glass: [[.77, .7], [.89, .68], [.97, .48], [.77, .48]], width: 2.25, tall: true },
  bus: { body: [[0, .14], [0, 1], [1, 1], [1, .14]], glass: [[.03, .56], [.03, .9], [.97, .9], [.97, .56]], width: 2.45, tall: true },
};

function paintMaterial(v) {
  const base = { clearcoat: 1, clearcoatRoughness: 0.06 };
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
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0x3a5068, metalness: 0.55, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.6 });
  MAT.tyre = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.85 });
  MAT.rim = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 1, roughness: 0.25 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: 0x1f2026, roughness: 0.6 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0x8a919e, metalness: 0.8, roughness: 0.35 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.12 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 1.2 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.9 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0xa0703c, roughness: 0.85 });
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.22 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  return MAT;
}
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts });

function extrude(points, depth, material, bevel = 0.14) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 4, steps: 1, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

function wheel(r, width, parent, x, z, rimMat) {
  const M = shared();
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 24), M.tyre);
  tyre.rotation.x = PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 14), rimMat || M.rim);
  rim.rotation.x = PI / 2;
  g.add(tyre, rim);
  for (let i = 0; i < (rimMat ? 4 : 2); i++) { // Speichen
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.15, r * 0.14, width + 0.04), M.dark);
    spoke.rotation.z = (i / (rimMat ? 4 : 2)) * PI;
    g.add(spoke);
  }
  tyre.castShadow = true;
  g.position.set(x, r, z);
  g.name = 'wheel';
  parent.add(g);
  return g;
}

// Werkzeugkasten zum Bauen: Teile werden am Fahrzeugkörper angebracht
function kit(v, kinds, hDiv, spec) {
  const k = kinds[v.kind], M = shared();
  const tall = spec.tall || (PROFILE[spec.arch] && PROFILE[spec.arch].tall);
  const C = {
    v, k, M, L: k.w[1] / 22, H: k.h[1] / (hDiv || (tall ? 20 : 27)), W: spec.width || (PROFILE[spec.arch] || {}).width || 1.85,
    r: (k.wheel || 11) * 0.032, group: new THREE.Group(), body: new THREE.Group(), wheels: [], paint: paintMaterial(v),
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
  C.wheelPair = (x, r = C.r, w = 0.32, rimMat) => {
    for (const s of [-1, 1]) C.wheels.push(wheel(r, w, C.group, x, s * (C.W / 2 - w / 2 + 0.04), rimMat));
  };
  // Aufkleber auf beiden Seiten (paint zeichnet auf ein Canvas der Grösse cw × ch)
  C.decal = (w, h, x, y, paint, zExtra = 0) => {
    const cw = Math.min(1024, Math.max(64, Math.round(w * 140))), ch = Math.max(16, Math.round(cw * h / w));
    const cvs = document.createElement('canvas');
    cvs.width = cw; cvs.height = ch;
    paint(cvs.getContext('2d'), cw, ch);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(x, y, s * (C.W / 2 + 0.015 + zExtra));
      p.rotation.y = s > 0 ? 0 : PI;
      C.body.add(p);
    }
  };
  C.lights = (front, rear, y, yRear = y, inset = 0.35) => {
    for (const s of [-1, 1]) {
      C.box(0.08, 0.15, 0.34, M.head, front, y, s * (C.W / 2 - inset));
      C.box(0.08, 0.15, 0.38, M.tail, rear, yRear, s * (C.W / 2 - inset + 0.03));
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

// Karosserie nach Seitenprofil (Limousine, Kombi, Sportwagen, Kastenwagen, Bus …)
function profileBody(C, name, opts = {}) {
  const P = PROFILE[name], { X, L, H, W, M } = C;
  C.bodyMesh = C.ext(P.body.map(([x, y]) => [X(x), y * H]), W - 0.28, C.paint);
  if (P.cabin && !opts.noCabin) {
    const [rb, rt, ft, fb, by, ty] = P.cabin, cw = W * 0.78;
    C.ext([[X(rb), by * H], [X(rt), ty * H], [X(ft), ty * H], [X(fb), by * H]], cw, opts.tinted ? mat(0x1c2633, { metalness: 0.7, roughness: 0.08 }) : M.glass, 0.04);
    C.ext([[X(rt + 0.02), ty * H - 0.05], [X(rt + 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H - 0.05]], cw + 0.04, C.paint, 0.03);
    C.roofY = ty * H + 0.07;
    C.roofX = X((rt + ft) / 2);
  }
  if (P.glass) C.ext(P.glass.map(([x, y]) => [X(x), y * H]), W, M.glass, 0.02); // etwas breiter als die Karosserie, damit man die Scheiben sieht
  C.roofY = C.roofY || H + 0.05;
  C.roofX = C.roofX === undefined ? X(0.4) : C.roofX;
  C.wheelPair(X(opts.wheels ? opts.wheels[0] : P.tall ? 0.16 : 0.18));
  C.wheelPair(X(opts.wheels ? opts.wheels[1] : P.tall ? 0.84 : 0.82));
  const tallish = P.tall;
  C.lights(L / 2 + 0.03, -L / 2 - 0.03, tallish ? 0.45 * H : 0.42 * H, tallish ? 0.3 * H : 0.46 * H);
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
    for (const s of [-1, 1]) C.box(C.L * 0.6, 0.06, 0.06, C.M.dark, C.X(0.36), C.roofY + 0.06, s * C.W * 0.34); // Dachreling
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
    const { X, H, M } = C;
    const ws = C.box(0.06, 0.38, C.W * 0.8, M.glass, X(0.66), H * 0.62 + 0.18, 0); // Windschutzscheibe
    ws.rotation.z = -0.5;
    for (const z of [-0.42, 0.42]) C.box(0.5, 0.5, 0.55, mat(0x2b2b30), X(0.38), H * 0.62, z); // Sitze
    C.sph(0.2, M.skin, X(0.45), H * 0.62 + 0.45, -0.42); // Fahrer mit Sonnenbrille
    C.sph(0.21, mat(0x5a3a1e), X(0.44), H * 0.62 + 0.52, -0.42, [1, 0.7, 1]);
    C.box(0.06, 0.07, 0.34, M.dark, X(0.45) + 0.18, H * 0.62 + 0.47, -0.42);
  },
  oldtimer: C => {
    profileBody(C, 'sedan', { wheels: [0.2, 0.8] });
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
    const top = new THREE.Mesh(new THREE.PlaneGeometry(C.L * 0.98, 0.5), mat(0xf4f4f4)); // Rennstreifen
    top.rotation.x = -PI / 2;
    C.add(top, 0, C.H * 0.575, 0);
    C.box(0.5, 0.14, 0.45, C.M.dark, C.X(0.82), C.H * 0.52, 0); // Lufthutze
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
    for (const s of [-1, 1]) {
      C.box(L * 0.9, 0.05, 0.03, neon, 0, H * 0.38, s * (C.W / 2 + 0.02));
      C.box(0.05, H * 0.3, 0.03, neon, X(0.08), H * 0.5, s * (C.W / 2 + 0.02));
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
    profileBody(C, 'pickup', { wheels: [0.16, 0.85] });
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
    profileBody(C, 'pickup', { wheels: [0.16, 0.85] });
    const { X, H, L, M } = C;
    C.wheelPair(X(0.38));
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; stripes([C.v.special ? '#ffd34d' : C.v.color, '#f4f4f4'], true)(c.getContext('2d'), 128, 64); return c; })());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const drum = C.cyl(H * 0.42, H * 0.28, L * 0.5, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.4, roughness: 0.4 }), X(0.27), H * 0.95, 0, [0, 0, PI / 2 + 0.12], 24);
    drum.userData.roll = true; // dreht sich
  },
  crane: C => {
    profileBody(C, 'pickup', { wheels: [0.12, 0.88] });
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
    const { X, H, L, W, r, M } = C;
    const lift = r * 1.5; // hochgelegt
    const P = PROFILE.pickup;
    C.bodyMesh = C.ext(P.body.map(([x, y]) => [X(x), lift + (y - 0.26) * H * 0.75]), W - 0.4, C.paint);
    const [rb, rt, ft, fb, by, ty] = P.cabin;
    C.ext([[X(rb - 0.25), lift + (by - 0.26) * H * 0.75], [X(rt - 0.22), lift + (ty - 0.26) * H * 0.75], [X(ft - 0.1), lift + (ty - 0.26) * H * 0.75], [X(fb - 0.05), lift + (by - 0.26) * H * 0.75]], W * 0.7, M.glass, 0.04);
    C.decal(L * 0.5, 0.35, X(0.4), lift + 0.2, (g, w, h) => { // Flammen
      g.fillStyle = '#ff8c1a';
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i <= 6; i++) g.lineTo(w * i / 6, i % 2 ? h * 0.1 : h * 0.7);
      g.lineTo(w, h); g.fill();
    }, -0.05);
    for (const x of [X(0.2), X(0.8)]) for (const s of [-1, 1]) C.box(0.12, lift, 0.12, M.dark, x, lift * 0.75, s * 0.6); // Federbeine
    C.lights(L / 2 + 0.03, -L / 2 - 0.03, lift + 0.15);
    C.wheelPair(X(0.2), r, 0.7); C.wheelPair(X(0.8), r, 0.7);
    C.roofY = lift + (ty - 0.26) * H * 0.75 + 0.1;
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
    C.decal(1.2, 0.3, X(0.45), by + 0.1, text('RETTER', '#e11d48'), 0.45);
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

function jeepBody(C) {
  profileBody(C, 'suv');
  const { X, H, M } = C;
  C.cyl(C.r * 0.95, C.r * 0.95, 0.3, M.tyre, -C.L / 2 - 0.18, H * 0.55, 0, [0, 0, PI / 2], 20); // Reserverad
  for (const s of [-1, 1]) C.box(C.L * 0.6, 0.06, 0.06, M.dark, X(0.4), C.roofY + 0.08, s * C.W * 0.35); // Dachträger
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
const templates = new Map();
export function buildCar(v, kinds, hDiv) {
  const key = [v.kind, v.special || '', v.color || '', hDiv || ''].join('|');
  let t = templates.get(key);
  if (!t) {
    if (templates.size > 150) templates.clear();
    const C = kit(v, kinds, hDiv, BUILD[v.kind] ? SPEC_HINT[v.kind] || {} : {});
    (BUILD[v.kind] || BUILD.car)(C);
    mergeStatic(C.body);
    t = { group: C.group, paint: C.paint, radius: Math.max(1.2, Math.min(C.L, 4) / 2), length: C.L };
    templates.set(key, t);
  }
  const g = t.group.clone();
  g.userData = { wheels: g.getObjectsByProperty('name', 'wheel'), paint: t.paint, body: g.getObjectByName('body'), radius: t.radius, length: t.length };
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
  });
  if (special === 'rainbow') mesh.userData.paint.color.setHSL((t * 0.25) % 1, 0.85, 0.5);
}

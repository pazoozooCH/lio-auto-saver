// Rennstrecke in 3D (three.js). Wird von game.js erst geladen, wenn ein Rennen startet.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const LAPS = 3;
const TRACK_W = 14;          // Fahrbahnbreite in Metern
const GRIP = 13;             // so viel Querbeschleunigung (m/s²) halten die Reifen in Kurven
const BRAKE = 22;            // Bremsverzögerung in m/s²
const WALL = TRACK_W / 2 + 16; // Abstand der Reifenstapel von der Mitte

// Mittellinie der Strecke (Meter, von oben gesehen). Start/Ziel liegt beim ersten Punkt auf der langen Geraden.
const CONTROL = [
  [0, 0], [250, 0], [330, 40], [340, 130], [290, 190], [200, 200], [140, 170], [100, 210], [40, 230],
  [-60, 240], [-160, 300], [-230, 300], [-260, 250], [-220, 200], [-140, 170], [-110, 110], [-180, 70],
  [-250, 50], [-270, 10], [-230, -10], [-150, 0],
];

// Fahrzeugformen: Seitenprofil (Anteile von Länge und Höhe, hinten → vorne), Kabine, Radpositionen, Breite
const ARCH = {
  sedan: { body: [[0, .22], [0, .48], [.03, .56], [.12, .59], [.8, .58], [.93, .55], [.99, .47], [1, .3], [.98, .22]], cabin: [.2, .3, .64, .8, .56, .96], wheels: [.18, .82], width: 1.85 },
  compact: { body: [[0, .22], [0, .56], [.1, .6], [.9, .58], [1, .46], [1, .22]], cabin: [.08, .14, .6, .78, .57, .97], wheels: [.17, .83], width: 1.75 },
  sport: { body: [[0, .2], [0, .48], [.05, .55], [.3, .57], [.72, .5], [.92, .4], [1, .3], [1, .2]], cabin: [.3, .42, .6, .78, .51, .86], wheels: [.18, .8], width: 1.95 },
  suv: { body: [[0, .26], [0, .58], [.82, .58], [1, .5], [1, .26]], cabin: [.05, .08, .7, .82, .56, .97], wheels: [.19, .81], width: 1.95 },
  pickup: { body: [[0, .26], [0, .56], [1, .54], [1, .26]], cabin: [.52, .54, .74, .86, .54, .97], wheels: [.18, .82], width: 1.95 },
  van: { body: [[0, .18], [0, 1], [.74, 1], [.76, .74], [.9, .72], [1, .46], [1, .18]], glass: [[.77, .7], [.89, .68], [.97, .48], [.77, .48]], wheels: [.16, .84], width: 2.25, tall: true },
  bus: { body: [[0, .14], [0, 1], [1, 1], [1, .14]], glass: [[.03, .56], [.03, .9], [.97, .9], [.97, .56]], wheels: [.16, .84], width: 2.45, tall: true },
};
const ARCH_OF = {
  formula: ['racer', 'dragster'],
  sport: ['sports', 'muscle', 'rocketcar', 'timemachine', 'shuttle'],
  compact: ['mini', 'isetta', 'kompakt', 'beetle', 'golfcart', 'tuktuk'],
  suv: ['jeep', 'safari', 'monster', 'buggy', 'minivan', 'tractor'],
  pickup: ['pickup', 'firework', 'towtruck', 'dumper', 'snowplow', 'cement'],
  van: ['delivery', 'icecream', 'ambulance', 'garbage', 'camper', 'umzug', 'bakery', 'armored', 'hotdog', 'treasure', 'firetruck', 'crane', 'royal'],
  bus: ['van', 'postauto', 'doubledecker', 'train'],
  bike: ['pizza', 'scooter', 'policebike'],
  ufo: ['ufo', 'hovercraft'],
  heli: ['heli'],
};
function archOf(kind) {
  for (const [arch, kinds] of Object.entries(ARCH_OF)) if (kinds.includes(kind)) return arch;
  return 'sedan';
}

let R = null;      // Renderer, Szene und Strecke (einmal aufgebaut, für alle Rennen benutzt)
let race = null;   // das laufende Rennen

// ---------- Strecke ----------
function makeTrack() {
  const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const pts = curve.getSpacedPoints(1400);
  pts.pop();
  const n = pts.length;
  const tan = [], nor = [], dist = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const t = pts[(i + 1) % n].clone().sub(pts[(i - 1 + n) % n]).normalize();
    tan.push(t);
    nor.push(new THREE.Vector3(-t.z, 0, t.x));
    if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
    dist[i] = acc;
  }
  const length = acc + pts[n - 1].distanceTo(pts[0]);
  const ds = length / n;

  // Krümmung, Kurveninnenseite und Kurventempo
  const curv = new Float32Array(n), side = new Float32Array(n), safe = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t0 = tan[(i - 4 + n) % n], t1 = tan[(i + 4) % n];
    const turn = t1.clone().sub(t0);
    curv[i] = turn.length() / (8 * ds);
    side[i] = Math.sign(turn.dot(nor[i]));
    safe[i] = Math.min(120, Math.sqrt(GRIP / Math.max(curv[i], 1e-4)));
  }
  // Bremspunkte: rückwärts durchgehen, damit die Gegner rechtzeitig vor Kurven bremsen
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) safe[i] = Math.min(safe[i], Math.sqrt(safe[(i + 1) % n] ** 2 + 2 * BRAKE * 0.75 * ds));
  }
  // Reifenstapel: an Kurveninnenseiten näher an die Strecke, damit sie sich nicht überschlagen
  const wallOff = [new Float32Array(n), new Float32Array(n)]; // [Seite −1, Seite +1]
  for (let i = 0; i < n; i++) {
    for (const [k, sgn] of [[0, -1], [1, 1]]) {
      const inner = side[i] === sgn && curv[i] > 1e-4;
      wallOff[k][i] = inner ? Math.max(TRACK_W / 2 + 3, Math.min(WALL, 0.75 / curv[i])) : WALL;
    }
  }
  for (const arr of wallOff) { // glätten
    const copy = arr.slice();
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let k = -25; k <= 25; k++) m = Math.min(m, copy[(i + k + n) % n]);
      arr[i] = m;
    }
  }
  return { pts, tan, nor, dist, curv, safe, wallOff, n, length, ds };
}

function trackPoint(T, s) {
  const u = (((s % T.length) + T.length) % T.length) / T.ds;
  const i = Math.floor(u) % T.n, j = (i + 1) % T.n, f = u - Math.floor(u);
  return { i, p: T.pts[i].clone().lerp(T.pts[j], f), t: T.tan[i].clone().lerp(T.tan[j], f).normalize(), nrm: T.nor[i] };
}

function nearestIndex(T, pos, hint) {
  let best = hint, bd = Infinity;
  for (let k = -80; k <= 80; k++) {
    const i = (hint + k + T.n) % T.n;
    const d = (T.pts[i].x - pos.x) ** 2 + (T.pts[i].z - pos.z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Band entlang der Strecke zwischen zwei seitlichen Abständen (für Asphalt, Linien, Randsteine, Kies)
function stripGeometry(T, offA, offB, y, vPerMeter, include = () => true) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= T.n; i++) {
    const j = i % T.n, p = T.pts[j], q = T.nor[j];
    const a = typeof offA === 'function' ? offA(j) : offA, b = typeof offB === 'function' ? offB(j) : offB;
    pos.push(p.x + q.x * a, y, p.z + q.z * a, p.x + q.x * b, y, p.z + q.z * b);
    const v = (i === T.n ? T.length : T.dist[j]) * vPerMeter;
    uv.push(0, v, 1, v);
    if (i < T.n && include(j)) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(T, k, sgn, height) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= T.n; i++) {
    const j = i % T.n, p = T.pts[j], q = T.nor[j], o = T.wallOff[k][j] * sgn;
    const x = p.x + q.x * o, z = p.z + q.z * o, v = (i === T.n ? T.length : T.dist[j]) / 1.2;
    pos.push(x, 0, z, x, height, z);
    uv.push(v, 0, v, 1);
    if (i < T.n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Texturen (alle selbst gemalt) ----------
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

function noise(g, w, h, base, spots, count) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    g.fillStyle = spots[Math.floor(Math.random() * spots.length)];
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function makeTextures() {
  return {
    asphalt: canvasTexture(512, 512, (g, w, h) => noise(g, w, h, '#44474d', ['#494c52', '#404349', '#4d5056', '#3d4046'], 26000)),
    grass: canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#5a9440'; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = '#4f873a'; g.fillRect(0, h / 2, w, h / 2);
      g.globalAlpha = 0.35;
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = ['#66a34a', '#47803a', '#5c9a44'][i % 3];
        g.fillRect(Math.random() * w, Math.random() * h, 1, 2);
      }
      g.globalAlpha = 1;
    }),
    gravel: canvasTexture(128, 128, (g, w, h) => noise(g, w, h, '#cdb98f', ['#bba77e', '#ddc9a0', '#a8946c'], 4000)),
    kerb: canvasTexture(16, 64, (g) => {
      g.fillStyle = '#d62828'; g.fillRect(0, 0, 16, 32);
      g.fillStyle = '#f5f5f5'; g.fillRect(0, 32, 16, 32);
    }),
    tyres: canvasTexture(64, 32, (g) => {
      g.fillStyle = '#1b1c20'; g.fillRect(0, 0, 64, 32);
      g.fillStyle = '#e63946'; g.fillRect(0, 10, 64, 6);
      g.fillStyle = '#f5f5f5'; g.fillRect(32, 10, 32, 6);
      g.fillStyle = '#2a2b30';
      for (let x = 0; x < 64; x += 16) { g.beginPath(); g.arc(x + 8, 24, 5, 0, Math.PI * 2); g.fill(); }
    }),
    checker: canvasTexture(64, 16, (g) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
        g.fillRect(x * 4, y * 4, 4, 4);
      }
    }, false),
    crowd: canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = '#2b2f3a'; g.fillRect(0, 0, w, h);
      const cols = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#ffd166', '#f15bb5', '#fff', '#06d6a0', '#00bbf9'];
      for (let y = 6; y < h; y += 10) for (let x = 3; x < w; x += 7) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.beginPath(); g.arc(x + Math.random() * 2, y, 2.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2c9a0'; g.fillRect(x - 1, y - 5, 2.5, 2.5);
      }
    }),
  };
}

function billboardTexture(text, bg, fg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, false);
}

// ---------- Szene aufbauen ----------
function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbcd3e6, 250, 1500);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 20000);

  // Himmel mit Sonne
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(140));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a6b3a, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 400 });
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const T = makeTrack();
  const tex = makeTextures();

  // Wiese
  tex.grass.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: tex.grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const curvy = i => T.curv[i] > 0.012;
  const strip = (a, b, y, v, mat, inc) => {
    const m = new THREE.Mesh(stripGeometry(T, a, b, y, v, inc), mat);
    m.receiveShadow = true;
    scene.add(m);
  };
  const side = THREE.DoubleSide;
  // Kies in den Kurven, Asphalt, Randsteine, weisse Linien
  strip(TRACK_W / 2 + 1.4, i => Math.min(T.wallOff[1][i] - 0.5, TRACK_W / 2 + 9), 0.008, 0.2,
    new THREE.MeshStandardMaterial({ map: tex.gravel, roughness: 1, side }), curvy);
  strip(-TRACK_W / 2 - 1.4, i => -Math.min(T.wallOff[0][i] - 0.5, TRACK_W / 2 + 9), 0.008, 0.2,
    new THREE.MeshStandardMaterial({ map: tex.gravel, roughness: 1, side }), curvy);
  tex.asphalt.repeat.set(1, 1);
  strip(-TRACK_W / 2, TRACK_W / 2, 0.02, 1 / 14, new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.88, side }));
  const kerbMat = new THREE.MeshStandardMaterial({ map: tex.kerb, roughness: 0.7, side });
  strip(TRACK_W / 2, TRACK_W / 2 + 1.4, 0.03, 1 / 3, kerbMat, curvy);
  strip(-TRACK_W / 2 - 1.4, -TRACK_W / 2, 0.03, 1 / 3, kerbMat, curvy);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side });
  strip(TRACK_W / 2 - 0.55, TRACK_W / 2 - 0.25, 0.03, 0.1, lineMat);
  strip(-TRACK_W / 2 + 0.25, -TRACK_W / 2 + 0.55, 0.03, 0.1, lineMat);

  // Reifenstapel
  tex.tyres.repeat.set(1, 1);
  const tyreMat = new THREE.MeshStandardMaterial({ map: tex.tyres, roughness: 0.9, side });
  for (const [k, sgn] of [[0, -1], [1, 1]]) {
    const w = new THREE.Mesh(wallGeometry(T, k, sgn, 1.0), tyreMat);
    w.castShadow = true;
    scene.add(w);
  }

  // Start/Ziel: Schachbrett, Startplätze und Startampel
  const s0 = trackPoint(T, 0);
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 2.4), new THREE.MeshStandardMaterial({ map: tex.checker, roughness: 0.7 }));
  finish.rotation.x = -Math.PI / 2;
  finish.rotation.z = -Math.atan2(s0.t.z, s0.t.x) + Math.PI / 2;
  finish.position.set(s0.p.x, 0.035, s0.p.z);
  scene.add(finish);
  for (let k = 0; k < 6; k++) {
    const g = gridSlot(T, k);
    const box = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.2), lineMat);
    box.rotation.x = -Math.PI / 2;
    box.position.set(g.pos.x + g.fwd.x * 3, 0.035, g.pos.z + g.fwd.z * 3);
    box.rotation.z = -Math.atan2(g.fwd.z, g.fwd.x);
    scene.add(box);
  }
  const lights = buildGantry(scene, s0);

  // Tribüne aussen an der Start-Ziel-Geraden, Boxengebäude innen
  buildGrandstand(scene, tex, s0, -1);
  buildPits(scene, s0, 1);

  // Werbetafeln
  const ads = [['AUTO-RETTER GP', '#c0392b', '#fff'], ['TURBO-PS', '#ffd166', '#222'], ['PRESSE CUP', '#1d4ed8', '#fff'], ['VOLLGAS!', '#21a35b', '#fff']];
  ads.forEach(([text, bg, fg], i) => {
    const tp = trackPoint(T, T.length * (0.12 + i * 0.22));
    const o = (T.wallOff[0][tp.i] + 3) * -1;
    const board = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.3), [
      new THREE.MeshStandardMaterial({ color: 0x333333 }), new THREE.MeshStandardMaterial({ color: 0x333333 }),
      new THREE.MeshStandardMaterial({ color: 0x333333 }), new THREE.MeshStandardMaterial({ color: 0x333333 }),
      new THREE.MeshStandardMaterial({ map: billboardTexture(text, bg, fg) }), new THREE.MeshStandardMaterial({ map: billboardTexture(text, bg, fg) }),
    ]);
    board.position.set(tp.p.x + tp.nrm.x * o, 3.2, tp.p.z + tp.nrm.z * o);
    board.rotation.y = -Math.atan2(tp.t.z, tp.t.x);
    board.castShadow = true;
    scene.add(board);
    for (const dx of [-4.5, 4.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 }));
      post.position.set(board.position.x + tp.t.x * dx, 0.9, board.position.z + tp.t.z * dx);
      scene.add(post);
    }
  });

  buildTrees(scene, T);
  buildHills(scene);

  return { renderer, scene, camera, sun, T, lights };
}

function gridSlot(T, k) {
  // Startaufstellung hinter der Linie, abwechselnd links und rechts
  const tp = trackPoint(T, -10 - k * 9);
  const lat = k % 2 ? -3.4 : 3.4;
  return { s: -10 - k * 9, lat, pos: tp.p.clone().addScaledVector(tp.nrm, lat), fwd: tp.t };
}

function buildGantry(scene, s0) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, metalness: 0.7, roughness: 0.4 });
  for (const sgn of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel);
    post.position.set(0, 3.5, sgn * (TRACK_W / 2 + 1.5));
    post.castShadow = true;
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, TRACK_W + 3.5), steel);
  beam.position.y = 7;
  beam.castShadow = true;
  g.add(beam);
  const lights = [];
  for (let k = 0; k < 5; k++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 0 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat);
    lamp.position.set(-0.45, 7, (k - 2) * 1.6);
    g.add(lamp);
    lights.push(mat);
  }
  g.position.copy(s0.p);
  g.rotation.y = -Math.atan2(s0.t.z, s0.t.x);
  scene.add(g);
  return lights;
}

function buildGrandstand(scene, tex, s0, sgn) {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.9 });
  for (let r = 0; r < 7; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(120, 0.7 * (r + 1), 2.4), concrete);
    step.position.set(0, 0.35 * (r + 1), (WALL + 6 + r * 2.4) * sgn);
    step.receiveShadow = true;
    g.add(step);
  }
  tex.crowd.repeat.set(6, 1);
  const crowd = new THREE.Mesh(new THREE.PlaneGeometry(120, 18), new THREE.MeshStandardMaterial({ map: tex.crowd, roughness: 1 }));
  crowd.position.set(0, 3.0, (WALL + 13) * sgn);
  crowd.rotation.set(-1.29, sgn < 0 ? 0 : Math.PI, 0, 'YXZ'); // schräg nach hinten, Zuschauer schauen zur Strecke
  g.add(crowd);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(124, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.5, metalness: 0.3 }));
  roof.position.set(0, 10, (WALL + 13) * sgn);
  roof.castShadow = true;
  g.add(roof);
  for (let x = -60; x <= 60; x += 20) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10, 0.5), concrete);
    post.position.set(x, 5, (WALL + 22) * sgn);
    g.add(post);
  }
  g.position.set(s0.p.x - 20, 0, s0.p.z);
  g.rotation.y = -Math.atan2(s0.t.z, s0.t.x);
  scene.add(g);
}

function buildPits(scene, s0, sgn) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0xf1f3f6, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.9, roughness: 0.1 });
  const building = new THREE.Mesh(new THREE.BoxGeometry(110, 7, 12), wall);
  building.position.set(0, 3.5, (WALL + 10) * sgn);
  building.castShadow = building.receiveShadow = true;
  g.add(building);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(108, 2.2, 0.2), glass);
  windows.position.set(0, 5, (WALL + 4) * sgn - 0.1 * sgn);
  g.add(windows);
  for (let x = -50; x < 50; x += 10) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x2b2f3a }));
    door.position.set(x + 5, 1.6, (WALL + 4) * sgn - 0.12 * sgn);
    g.add(door);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(30, 3, 0.4), [
    wall, wall, wall, wall,
    new THREE.MeshStandardMaterial({ map: billboardTexture('AUTO-RETTER GP', '#c0392b', '#fff') }),
    new THREE.MeshStandardMaterial({ map: billboardTexture('AUTO-RETTER GP', '#c0392b', '#fff') }),
  ]);
  sign.position.set(0, 9, (WALL + 4) * sgn);
  g.add(sign);
  g.position.set(s0.p.x - 30, 0, s0.p.z);
  g.rotation.y = -Math.atan2(s0.t.z, s0.t.x);
  scene.add(g);
}

function buildTrees(scene, T) {
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), 500);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 500);
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 7, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 500);
  trunks.castShadow = crowns.castShadow = pines.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const color = new THREE.Color();
  let nT = 0, nC = 0, nP = 0;
  for (let tries = 0; tries < 6000 && nT < 500; tries++) {
    const x = (Math.random() - 0.5) * 1100, z = (Math.random() - 0.5) * 900 + 140;
    let near = false;
    for (let i = 0; i < T.n && !near; i += 6) {
      if ((T.pts[i].x - x) ** 2 + (T.pts[i].z - z) ** 2 < (WALL + 8) ** 2) near = true;
    }
    if (near || (Math.abs(z) < 75 && x > -170 && x < 120)) continue; // nicht auf Strecke, Tribüne oder Boxen
    const s = 0.8 + Math.random() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
    m.compose(pos.set(x, 1.5 * s, z), q, sc.set(s, s, s));
    trunks.setMatrixAt(nT++, m);
    if (Math.random() < 0.55) {
      m.compose(pos.set(x, 4.6 * s, z), q, sc.set(s, s * 1.1, s));
      crowns.setMatrixAt(nC, m);
      crowns.setColorAt(nC++, color.setHSL(0.27 + Math.random() * 0.06, 0.45, 0.28 + Math.random() * 0.1));
    } else {
      m.compose(pos.set(x, 5.5 * s, z), q, sc.set(s, s, s));
      pines.setMatrixAt(nP, m);
      pines.setColorAt(nP++, color.setHSL(0.32 + Math.random() * 0.05, 0.4, 0.22 + Math.random() * 0.08));
    }
  }
  trunks.count = nT; crowns.count = nC; pines.count = nP;
  scene.add(trunks, crowns, pines);
}

function buildHills(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f7f55, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2, r = 1100 + Math.random() * 500;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(180 + Math.random() * 160, 90 + Math.random() * 160, 7), mat);
    hill.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + 140);
    hill.rotation.y = Math.random() * 3;
    scene.add(hill);
  }
}

// ---------- Fahrzeuge in 3D ----------
function paintMaterial(v) {
  const base = { clearcoat: 1, clearcoatRoughness: 0.06 };
  switch (v.special) {
    case 'gold': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xd4a017, metalness: 1, roughness: 0.18 });
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
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 1.2 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.9 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
  return MAT;
}

function extrude(points, depth, mat, bevel = 0.14) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 4, steps: 1, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function wheel(r, width, parent, x, z) {
  const M = shared();
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 24), M.tyre);
  tyre.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 12), M.rim);
  rim.rotation.x = Math.PI / 2;
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.18, width + 0.04), M.dark);
  tyre.castShadow = true;
  g.add(tyre, rim, spoke);
  g.position.set(x, r, z);
  parent.add(g);
  return g;
}

// Baut ein 3D-Fahrzeug; Länge entlang +X (vorne), Breite entlang Z
function buildCar(v, kinds) {
  const M = shared();
  const k = kinds[v.kind];
  const arch = archOf(v.kind);
  const group = new THREE.Group();
  const paint = paintMaterial(v);
  const wheels = [];
  const L = k.w[1] / 22;
  const a = ARCH[arch];
  const H = k.h[1] / (a && a.tall ? 20 : 27);
  const r = (k.wheel || 11) * 0.032;
  let width = a ? a.width : 1.8;
  const body = new THREE.Group();
  group.add(body);
  const X = f => f * L - L / 2;

  if (a) {
    body.add(extrude(a.body.map(([x, y]) => [X(x), y * H]), width - 0.28, paint));
    if (a.cabin) {
      const [rb, rt, ft, fb, by, ty] = a.cabin;
      const cw = width * 0.78;
      body.add(extrude([[X(rb), by * H], [X(rt), ty * H], [X(ft), ty * H], [X(fb), by * H]], cw, M.glass, 0.04));
      body.add(extrude([[X(rt + 0.02), ty * H - 0.05], [X(rt + 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H - 0.05]], cw + 0.04, paint, 0.03));
    }
    if (a.glass) body.add(extrude(a.glass.map(([x, y]) => [X(x), y * H]), width - 0.06, M.glass, 0.02));
    for (const f of a.wheels) for (const sgn of [-1, 1]) wheels.push(wheel(r, 0.32, group, X(f), sgn * (width / 2 - 0.12)));
    // Scheinwerfer und Rücklichter
    for (const sgn of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.34), M.head);
      hl.position.set(L / 2 + 0.03, a.tall ? 0.45 * H : 0.42 * H, sgn * (width / 2 - 0.35));
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.38), M.tail);
      tl.position.set(-L / 2 - 0.03, a.tall ? 0.3 * H : 0.46 * H, sgn * (width / 2 - 0.32));
      body.add(hl, tl);
    }
  } else if (arch === 'formula') {
    width = 1.9;
    body.add(extrude([[X(0), .18], [X(0), .5], [X(.28), .55], [X(.38), .9], [X(.48), .62], [X(1), .3], [X(1), .18]], 0.85, paint));
    for (const sgn of [-1, 1]) { // Seitenkästen
      const pod = new THREE.Mesh(new THREE.BoxGeometry(L * 0.32, 0.38, 0.38), paint);
      pod.position.set(X(.36), 0.38, sgn * 0.6);
      pod.castShadow = true;
      body.add(pod);
    }
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.8), M.dark);
    rearWing.position.set(X(.03), 1.05, 0);
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 1.9), M.dark);
    frontWing.position.set(X(.98), 0.2, 0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    helmet.position.set(X(.4), 0.95, 0);
    body.add(rearWing, frontWing, helmet);
    for (const sgn of [-1, 1]) {
      wheels.push(wheel(0.42, 0.45, group, X(.14), sgn * 0.95));
      wheels.push(wheel(0.34, 0.36, group, X(.86), sgn * 0.9));
    }
  } else if (arch === 'bike') {
    width = 0.7;
    body.add(extrude([[X(.08), .35], [X(.55), .42], [X(.8), .75], [X(.95), .5], [X(.85), .3], [X(.2), .3]].map(([x, y]) => [x, y * 1.4]), 0.45, paint));
    const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1f3b73, roughness: 0.7 }));
    rider.position.set(X(.45), 1.25, 0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    helmet.position.set(X(.47), 1.75, 0);
    body.add(rider, helmet);
    wheels.push(wheel(0.3, 0.14, group, X(.15), 0));
    wheels.push(wheel(0.3, 0.14, group, X(.85), 0));
  } else if (arch === 'ufo') {
    width = L * 0.9;
    const disc = new THREE.Mesh(new THREE.SphereGeometry(L / 2, 32, 12), paint);
    disc.scale.set(1, 0.18, 0.9);
    disc.position.y = 1.0;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(L * 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
    dome.position.y = 1.15;
    const alien = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0x6fdc5a }));
    alien.position.y = 1.35;
    disc.castShadow = true;
    body.add(disc, dome, alien);
    for (let i = 0; i < 8; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color().setHSL(i / 8, 1, 0.5), emissiveIntensity: 1.5 }));
      lamp.position.set(Math.cos(i / 8 * Math.PI * 2) * L * 0.42, 0.95, Math.sin(i / 8 * Math.PI * 2) * L * 0.38);
      body.add(lamp);
    }
  } else if (arch === 'heli') {
    width = 2;
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), paint);
    cab.scale.set(L * 0.28, 1.0, 0.95);
    cab.position.set(X(.62), 1.4, 0);
    const glassNose = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 12), M.glass);
    glassNose.scale.set(1, 0.8, 0.9);
    glassNose.position.set(X(.8), 1.55, 0);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, L * 0.5, 8), paint);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(X(.2), 1.6, 0);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(L * 1.1, 0.04, 0.22), M.dark);
    rotor.position.set(X(.6), 2.55, 0);
    rotor.userData.spin = true;
    body.add(cab, glassNose, tail, rotor);
    for (const sgn of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 0.08, 0.08), M.dark);
      skid.position.set(X(.62), 0.25, sgn * 0.8);
      body.add(skid);
    }
  }

  // Kleine Extras für bekannte Fahrzeuge
  const roofY = a ? (a.cabin ? a.cabin[5] : 1) * H + 0.05 : 1.6;
  if (['police', 'ambulance', 'firetruck', 'policebike'].includes(v.kind) && a) {
    const bar = new THREE.Group();
    for (const sgn of [-1, 1]) {
      const m = new THREE.MeshStandardMaterial({ color: 0x0b1a40, emissive: 0x2f6bff, emissiveIntensity: 0 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), m);
      lamp.position.set(0, roofY + 0.08, sgn * 0.3);
      lamp.userData.blink = sgn;
      bar.add(lamp);
    }
    bar.position.x = a.cabin ? X((a.cabin[1] + a.cabin[2]) / 2) : X(.85);
    body.add(bar);
  }
  if (v.kind === 'taxi' && a) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.7), new THREE.MeshStandardMaterial({ color: 0xffe7a0, emissive: 0xffc61a, emissiveIntensity: 0.6 }));
    sign.position.set(X((a.cabin[1] + a.cabin[2]) / 2), roofY + 0.11, 0);
    body.add(sign);
  }

  group.userData = { wheels, paint, body, radius: Math.max(1.2, Math.min(L, 4) / 2), length: L };
  return group;
}

// ---------- Bedienoberfläche (HUD, Knöpfe) ----------
const CSS = `
#race { position: fixed; overflow: hidden; background: #000; z-index: 10; transform-origin: center center;
  font-family: system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; touch-action: none; }
#race canvas.r3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#race .top { position: absolute; top: 10px; left: 12px; display: flex; gap: 8px; }
#race .pill { background: rgba(0,0,0,.55); border-radius: 12px; padding: 6px 12px; font-weight: 800; font-size: 20px; }
#race .speed { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); text-align: center;
  background: rgba(0,0,0,.55); border-radius: 14px; padding: 6px 16px; font-weight: 800; font-size: 26px; }
#race .speed small { display: block; font-size: 13px; font-weight: 600; opacity: .8; }
#race .minimap { position: absolute; top: 10px; right: 62px; background: rgba(0,0,0,.4); border-radius: 10px; }
#race .quit { position: absolute; top: 10px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#race .lights { position: absolute; top: 18%; left: 50%; transform: translateX(-50%); display: flex; gap: 12px;
  padding: 12px 16px; background: #15161a; border-radius: 16px; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
#race .lights span { width: 38px; height: 38px; border-radius: 50%; background: #3a0b0b; box-shadow: inset 0 0 8px #000; }
#race .lights span.on { background: #ff2a2a; box-shadow: 0 0 22px #ff2a2a; }
#race .msg { position: absolute; top: 34%; width: 100%; text-align: center; font-size: 52px; font-weight: 900;
  text-shadow: 0 3px 10px rgba(0,0,0,.7); pointer-events: none; }
#race .ctl { position: absolute; bottom: 16px; width: 94px; height: 94px; border-radius: 50%; border: 3px solid rgba(255,255,255,.65);
  background: rgba(0,0,0,.35); color: #fff; font-size: 30px; font-weight: 900; touch-action: none; }
#race .ctl.on { background: rgba(255,255,255,.4); }
#race .ctl.gas { border-color: #4ade80; } #race .ctl.brake { border-color: #f87171; font-size: 18px; }
#race .hint { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); font-size: 15px; opacity: .85;
  background: rgba(0,0,0,.45); padding: 4px 12px; border-radius: 10px; white-space: nowrap; }
`;

function buildDom() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'race';
  root.hidden = true;
  root.innerHTML = `
    <div class="top"><div class="pill pos">P6/6</div><div class="pill lap">Runde 1/${LAPS}</div></div>
    <canvas class="minimap" width="170" height="120"></canvas>
    <button class="quit" title="Rennen beenden">✕</button>
    <div class="lights"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="msg"></div>
    <div class="speed"><span class="kmh">0</span> km/h<small class="ps"></small></div>
    <div class="hint">⬅️ ➡️ lenken · ⬆️ Gas · ⬇️ Bremse</div>
    <button class="ctl left" data-k="left" style="left:16px">◀</button>
    <button class="ctl right" data-k="right" style="left:124px">▶</button>
    <button class="ctl brake" data-k="brake" style="right:124px">BREMSE</button>
    <button class="ctl gas" data-k="gas" style="right:16px">GAS</button>`;
  document.body.appendChild(root);
  const $ = sel => root.querySelector(sel);
  const ui = {
    root, pos: $('.pos'), lap: $('.lap'), kmh: $('.kmh'), ps: $('.ps'), msg: $('.msg'), hint: $('.hint'),
    lights: [...root.querySelectorAll('.lights span')], lightBox: $('.lights'), minimap: $('.minimap'), quit: $('.quit'),
    ctls: [...root.querySelectorAll('.ctl')],
  };
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  for (const b of ui.ctls) {
    b.style.display = touch ? '' : 'none';
    const set = on => { if (race) race.input[b.dataset.k] = on; b.classList.toggle('on', on); };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ohne Festhalten geht es auch */ }
      set(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  }
  if (touch) ui.hint.style.display = 'none';
  ui.quit.addEventListener('pointerdown', e => { e.preventDefault(); if (race) endRace(true); });
  root.addEventListener('contextmenu', e => e.preventDefault());
  return ui;
}

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'brake' };
function onKey(e) {
  const k = KEYS[e.code];
  if (!k || !race) return;
  race.input[k] = e.type === 'keydown';
  e.preventDefault();
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight, rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  const st = R.ui.root.style;
  st.width = w + 'px'; st.height = h + 'px';
  st.left = (vw - w) / 2 + 'px'; st.top = (vh - h) / 2 + 'px';
  st.transform = rotated ? 'rotate(90deg)' : 'none';
  R.renderer.setSize(w, h, false);
  R.camera.aspect = w / h;
  R.camera.updateProjectionMatrix();
}

// ---------- Rennen ----------
export function startRace({ player, opponents, kinds, topSpeed, onFinish }) {
  if (!R) {
    R = buildWorld();
    R.ui = buildDom();
    R.renderer.domElement.className = 'r3d';
    R.ui.root.prepend(R.renderer.domElement);
    window.addEventListener('resize', () => R && !R.ui.root.hidden && layout());
  }
  const T = R.T;
  const accelFor = ps => 4 + ps * 0.06;

  // Startaufstellung: der Stärkste auf der Pole, du ganz hinten
  const grid = [...opponents].sort((a, b) => b.ps - a.ps);
  const cars = grid.map((v, k) => {
    const g = gridSlot(T, k);
    return { v, name: v.name, ai: true, prog: g.s, lat: g.lat, laneTarget: g.lat, laneT: 2 + Math.random() * 3,
      speed: 0, maxV: topSpeed(v.ps) * (0.94 + Math.random() * 0.05), acc: accelFor(v.ps) * (0.9 + Math.random() * 0.1),
      corner: 0.9 + Math.random() * 0.07, mesh: buildCar(v, kinds), finished: null, color: v.special ? '#ffd700' : v.color };
  });
  const pg = gridSlot(T, grid.length);
  const me = { v: player, name: player.name, ai: false, pos: pg.pos.clone(), heading: Math.atan2(pg.fwd.z, pg.fwd.x),
    speed: 0, steer: 0, idx: nearestIndex(T, pg.pos, 0), prog: pg.s, maxV: topSpeed(player.ps), acc: accelFor(player.ps),
    mesh: buildCar(player, kinds), finished: null, wrongT: 0 };
  cars.push(me);
  for (const c of cars) R.scene.add(c.mesh);

  window.__race = () => race; // für Tests im Browser
  race = { cars, me, T, t: 0, phase: 'lights', lightsOut: 3.4 + Math.random() * 0.8, clock: 0, input: {}, onFinish,
    lastLights: 0, msgT: 0, endT: 0, lastLap: 1, last: performance.now() };
  R.ui.root.hidden = false;
  R.ui.lightBox.style.display = '';
  R.ui.lights.forEach(l => l.classList.remove('on'));
  R.ui.ps.textContent = '⚡ ' + player.ps + ' PS';
  R.ui.msg.textContent = '';
  for (const m of R.lights) m.emissiveIntensity = 0;
  drawMinimapBase();
  layout();
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  startEngine();
  placeCars();
  snapCamera();
  requestAnimationFrame(loop);
}

function showMsg(text, secs = 1.6) {
  R.ui.msg.textContent = text;
  race.msgT = secs;
}

function loop(now) {
  if (!race) return;
  const dt = Math.min(0.05, (now - race.last) / 1000);
  race.last = now;
  step(dt);
  if (!race) return; // Rennen ist gerade zu Ende gegangen
  render(dt);
  requestAnimationFrame(loop);
}

function step(dt) {
  const { T, me, input } = race;
  race.t += dt;
  if (race.msgT > 0 && (race.msgT -= dt) <= 0) R.ui.msg.textContent = '';

  // Startampel: fünf rote Lichter gehen an, dann alle aus = LOS!
  if (race.phase === 'lights') {
    const on = Math.min(5, Math.floor(race.t / 0.6));
    if (on > race.lastLights) { race.lastLights = on; window.beep && window.beep(440, 0.15, 'square', 0.05); }
    R.ui.lights.forEach((l, i) => l.classList.toggle('on', i < on));
    R.lights.forEach((m, i) => { m.emissiveIntensity = i < on ? 3 : 0; });
    if (race.t >= race.lightsOut) {
      race.phase = 'race';
      R.ui.lights.forEach(l => l.classList.remove('on'));
      R.lights.forEach(m => { m.emissiveIntensity = 0; });
      R.ui.lightBox.style.display = 'none';
      showMsg('LOS!', 1);
      window.beep && window.beep(880, 0.4, 'square', 0.06);
    }
    placeCars();
    updateHud();
    return;
  }
  race.clock += dt;

  // --- Spieler: lenken, Gas, Bremse ---
  const driving = !me.finished;
  const gas = driving && input.gas, brake = driving && input.brake;
  const steerTarget = driving ? (input.left ? -1 : 0) + (input.right ? 1 : 0) : 0;
  me.steer += (steerTarget - me.steer) * Math.min(1, dt * 7);
  const lat = (me.pos.x - T.pts[me.idx].x) * T.nor[me.idx].x + (me.pos.z - T.pts[me.idx].z) * T.nor[me.idx].z;
  const offTrack = Math.abs(lat) > TRACK_W / 2 + 1.4;
  const maxV = offTrack ? me.maxV * 0.42 : me.maxV;
  if (gas) {
    if (me.speed < 0) me.speed = Math.min(0, me.speed + BRAKE * dt);
    else me.speed += me.acc * Math.max(0, 1 - me.speed / maxV) * dt;
  } else if (!brake) {
    me.speed -= Math.sign(me.speed) * Math.min(Math.abs(me.speed), 2.5 * dt);
  }
  if (brake) me.speed = me.speed > 0 ? Math.max(0, me.speed - BRAKE * dt) : Math.max(-7, me.speed - 6 * dt);
  if (offTrack && me.speed > maxV) me.speed = Math.max(maxV, me.speed - 14 * dt);
  // Kurven: bei hohem Tempo kann man weniger stark einlenken (die Reifen halten nur so viel)
  const yawMax = Math.min(1.5, GRIP / Math.max(Math.abs(me.speed), 0.1));
  if (Math.abs(me.speed) > 0.3) me.heading += me.steer * yawMax * dt * Math.sign(me.speed);
  me.pos.x += Math.cos(me.heading) * me.speed * dt;
  me.pos.z += Math.sin(me.heading) * me.speed * dt;

  const before = me.idx;
  me.idx = nearestIndex(T, me.pos, me.idx);
  let d = T.dist[me.idx] - T.dist[before];
  if (d < -T.length / 2) d += T.length;
  if (d > T.length / 2) d -= T.length;
  me.prog += d;

  // Reifenstapel: nicht durchfahren
  const nrm = T.nor[me.idx], p = T.pts[me.idx];
  const lat2 = (me.pos.x - p.x) * nrm.x + (me.pos.z - p.z) * nrm.z;
  const limit = lat2 > 0 ? T.wallOff[1][me.idx] - 1.2 : -(T.wallOff[0][me.idx] - 1.2);
  if (Math.abs(lat2) > Math.abs(limit)) {
    me.pos.x -= nrm.x * (lat2 - limit);
    me.pos.z -= nrm.z * (lat2 - limit);
    if (Math.abs(me.speed) > 8) window.beep && window.beep(90, 0.15, 'sawtooth', 0.05);
    me.speed *= 0.55;
  }

  // Falsche Richtung?
  const fwdDot = Math.cos(me.heading) * T.tan[me.idx].x + Math.sin(me.heading) * T.tan[me.idx].z;
  me.wrongT = fwdDot < -0.3 && me.speed > 2 ? me.wrongT + dt : 0;
  if (me.wrongT > 1.2 && race.msgT <= 0) showMsg('⚠️ Falsche Richtung!', 1.2);

  // --- Gegner: fahren die Strecke ab und bremsen vor Kurven ---
  for (const c of race.cars) {
    if (!c.ai) continue;
    const tp = trackPoint(T, c.prog);
    let target = Math.min(c.maxV, T.safe[tp.i] * c.corner);
    for (const o of race.cars) { // nicht auffahren
      if (o === c) continue;
      const gap = (o.ai ? o.prog : o.prog) - c.prog;
      const olat = o.ai ? o.lat : latOf(o);
      if (gap > 0 && gap < 9 && Math.abs(olat - c.lat) < 2.6) {
        target = Math.min(target, (o.speed || 0) - 0.5);
        if (c.laneT > 0.6) { c.laneTarget = Math.max(-4.5, Math.min(4.5, c.lat + (c.lat > olat ? 3.5 : -3.5))); c.laneT = 0.6; }
      }
    }
    if (c.speed < target) c.speed += c.acc * Math.max(0, 1 - c.speed / c.maxV) * dt;
    else c.speed = Math.max(target, c.speed - BRAKE * 0.8 * dt);
    c.speed = Math.max(0, c.speed);
    c.prog += c.speed * dt;
    if ((c.laneT -= dt) <= 0) { c.laneTarget = (Math.random() - 0.5) * 8; c.laneT = 3 + Math.random() * 4; }
    c.lat += Math.sign(c.laneTarget - c.lat) * Math.min(Math.abs(c.laneTarget - c.lat), 1.6 * dt);
  }

  // Zusammenstoss mit Gegnern: wegschieben und abbremsen
  for (const c of race.cars) {
    if (!c.ai) continue;
    const cp = aiPos(c);
    const dx = me.pos.x - cp.x, dz = me.pos.z - cp.z, dd = Math.hypot(dx, dz);
    const minD = (me.mesh.userData.radius + c.mesh.userData.radius) * 0.85;
    if (dd < minD && dd > 0.01) {
      me.pos.x += dx / dd * (minD - dd);
      me.pos.z += dz / dd * (minD - dd);
      if (me.prog < c.prog) me.speed *= 0.97; else c.speed *= 0.97;
    }
  }

  // Runden und Ziel
  const total = LAPS * T.length;
  for (const c of race.cars) {
    if (!c.finished && c.prog >= total) {
      c.finished = race.clock;
      if (c === me) {
        const place = race.cars.filter(o => o.finished && o.finished <= race.clock).length;
        showMsg(place === 1 ? '🏆 SIEG!' : '🏁 ZIEL! Platz ' + place, 4);
        race.endT = 3.2;
      }
    }
  }
  const lapNow = Math.min(LAPS, Math.max(1, Math.floor(me.prog / T.length) + 1));
  if (lapNow > race.lastLap && !me.finished) {
    race.lastLap = lapNow;
    showMsg(lapNow === LAPS ? 'Letzte Runde!' : 'Runde ' + lapNow, 1.6);
  }
  if (race.endT > 0 && (race.endT -= dt) <= 0) { endRace(false); return; }

  placeCars();
  updateHud();
}

function latOf(c) {
  const T = race.T, p = T.pts[c.idx], q = T.nor[c.idx];
  return (c.pos.x - p.x) * q.x + (c.pos.z - p.z) * q.z;
}

function aiPos(c) {
  const tp = trackPoint(race.T, c.prog);
  return { x: tp.p.x + tp.nrm.x * c.lat, z: tp.p.z + tp.nrm.z * c.lat, t: tp.t };
}

function placeCars() {
  for (const c of race.cars) {
    const m = c.mesh;
    let x, z, heading;
    if (c.ai) {
      const p = aiPos(c);
      x = p.x; z = p.z; heading = Math.atan2(p.t.z, p.t.x);
    } else {
      x = c.pos.x; z = c.pos.z; heading = c.heading;
    }
    m.position.set(x, 0, z);
    m.rotation.y = -heading;
    const spin = (c.speed || 0) * 0.016 / 0.35;
    for (const w of m.userData.wheels) w.rotation.z -= spin;
    if (c === race.me) { // Vorderräder lenken mit
      for (const w of m.userData.wheels) if (w.position.x > 0) w.rotation.y = -c.steer * 0.4;
    }
    m.userData.body.traverse(o => {
      if (o.userData.spin) o.rotation.y += 0.6;
      if (o.userData.blink) o.material.emissiveIntensity = Math.floor(race.t * 6 + (o.userData.blink > 0 ? 1 : 0)) % 2 ? 3 : 0;
    });
    if (c.v.special === 'rainbow') m.userData.paint.color.setHSL((race.t * 0.25) % 1, 0.85, 0.5);
  }
}

function standings() {
  return [...race.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finished - b.finished;
    if (a.finished || b.finished) return a.finished ? -1 : 1;
    return b.prog - a.prog;
  });
}

function updateHud() {
  const order = standings();
  R.ui.pos.textContent = 'P' + (order.indexOf(race.me) + 1) + '/' + order.length;
  R.ui.lap.textContent = 'Runde ' + Math.min(LAPS, Math.max(1, Math.floor(race.me.prog / race.T.length) + 1)) + '/' + LAPS;
  R.ui.kmh.textContent = Math.round(Math.abs(race.me.speed) * 3.6);
  engineSound();
  drawMinimapCars();
}

// ---------- Kamera und Zeichnen ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function snapCamera() {
  const { me } = race;
  camPos.set(me.pos.x - Math.cos(me.heading) * 9, 3.4, me.pos.z - Math.sin(me.heading) * 9);
  camLook.set(me.pos.x, 1.2, me.pos.z);
  R.camera.position.copy(camPos);
}

function render(dt) {
  const { me } = race;
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const back = 8.5 + Math.abs(me.speed) * 0.03;
  const want = new THREE.Vector3(me.pos.x - fx * back, 3.2 + Math.abs(me.speed) * 0.01, me.pos.z - fz * back);
  R.camera.position.lerp(want, 1 - Math.exp(-dt * 6));
  camLook.lerp(new THREE.Vector3(me.pos.x + fx * 6, 1.2, me.pos.z + fz * 6), 1 - Math.exp(-dt * 10));
  R.camera.lookAt(camLook);
  R.camera.fov = 62 + Math.min(18, Math.abs(me.speed) * 0.16);
  R.camera.updateProjectionMatrix();
  // Sonne folgt dem Spieler, damit Schatten scharf bleiben
  R.sun.position.set(me.pos.x + 60, 110, me.pos.z + 40);
  R.sun.target.position.set(me.pos.x, 0, me.pos.z);
  R.renderer.render(R.scene, R.camera);
}

let mapInfo = null;
function drawMinimapBase() {
  const T = race.T, cvs = R.ui.minimap, g = cvs.getContext('2d');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of T.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = Math.min((cvs.width - 16) / (maxX - minX), (cvs.height - 16) / (maxZ - minZ));
  const ox = (cvs.width - (maxX - minX) * sc) / 2, oz = (cvs.height - (maxZ - minZ) * sc) / 2;
  mapInfo = { map: (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc] };
  const base = document.createElement('canvas');
  base.width = cvs.width; base.height = cvs.height;
  const b = base.getContext('2d');
  b.strokeStyle = 'rgba(255,255,255,0.85)';
  b.lineWidth = 4;
  b.lineJoin = 'round';
  b.beginPath();
  T.pts.forEach((p, i) => { const [x, y] = mapInfo.map(p.x, p.z); if (i) b.lineTo(x, y); else b.moveTo(x, y); });
  b.closePath();
  b.stroke();
  mapInfo.base = base;
  g.clearRect(0, 0, cvs.width, cvs.height);
  g.drawImage(base, 0, 0);
}

function drawMinimapCars() {
  const cvs = R.ui.minimap, g = cvs.getContext('2d');
  g.clearRect(0, 0, cvs.width, cvs.height);
  g.drawImage(mapInfo.base, 0, 0);
  for (const c of race.cars) {
    const p = c.ai ? aiPos(c) : c.pos;
    const [x, y] = mapInfo.map(p.x, p.z);
    g.fillStyle = c.ai ? c.color : '#ffe066';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, c.ai ? 4 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

// ---------- Motorgeräusch ----------
let engine = null;
function startEngine() {
  const a = window.audio && window.audio();
  if (!a || engine) return;
  const osc = a.createOscillator(), filter = a.createBiquadFilter(), gain = a.createGain();
  osc.type = 'sawtooth';
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  gain.gain.value = 0.03;
  osc.connect(filter).connect(gain).connect(a.destination);
  osc.start();
  engine = { osc, gain, a };
}
function engineSound() {
  if (!engine) return;
  const v = Math.abs(race.me.speed), gearV = race.me.maxV / 6;
  const gear = Math.min(5, Math.floor(v / gearV));
  const rpm = (v - gear * gearV) / gearV;
  engine.osc.frequency.setTargetAtTime(70 + gear * 10 + rpm * 120, engine.a.currentTime, 0.05);
}
function stopEngine() {
  if (!engine) return;
  engine.gain.gain.setTargetAtTime(0, engine.a.currentTime, 0.05);
  engine.osc.stop(engine.a.currentTime + 0.3);
  engine = null;
}

// ---------- Ende ----------
function endRace(quit) {
  const r = race;
  race = null;
  stopEngine();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  for (const c of r.cars) {
    R.scene.remove(c.mesh);
    c.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  R.ui.root.hidden = true;
  if (quit) { r.onFinish({ quit: true }); return; }
  const order = [...r.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finished - b.finished;
    if (a.finished || b.finished) return a.finished ? -1 : 1;
    return b.prog - a.prog;
  });
  r.onFinish({
    place: order.indexOf(r.me) + 1,
    order: order.map(c => ({ name: c.name, kind: c.v.kind, ps: c.v.ps, isPlayer: c === r.me, time: c.finished })),
  });
}

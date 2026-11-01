// Dragster-Bahn in 3D (three.js): 402 m geradeaus, 1 gegen 1, Startampel und selber schalten.
// Wird von game.js erst geladen, wenn ein Dragrace startet.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic } from './cars3d.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';

const DIST = 402;                 // eine Viertelmeile
const LANE = 3.2;                 // Abstand der Spurmitte von der Mittelmauer
const GEARS = [0.28, 0.45, 0.6, 0.74, 0.87, 1.0];   // Gangende als Anteil der Höchstgeschwindigkeit
const GEAR_PULL = [1.6, 1.25, 1.0, 0.82, 0.66, 0.52]; // Zugkraft je Gang
const SHIFT_TIME = 0.22;          // so lange zieht beim Schalten nichts

let W3 = null;    // Szene, Renderer und HUD (einmal gebaut)
let drag = null;  // laufendes Rennen

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
function label(text, bg, fg, w = 512, h = 128, size = 70) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `900 ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, false);
}

// ---------- Strecke und Landschaft ----------
function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'r3d';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe9b98a, 300, 2200);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 8000);

  // Abendhimmel mit tiefer Sonne
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const su = sky.material.uniforms;
  su.turbidity.value = 9; su.rayleigh.value = 2.4; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.85;
  su.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(83), THREE.MathUtils.degToRad(-60));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x8a6a4a, 0.9));
  const sun = new THREE.DirectionalLight(0xffc48a, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Wüste mit Sanddünen (Tafelberge, Felsen und Kakteen kommen weiter unten)
  const land = makeDesert();

  // Fahrbahn: zwei Spuren, Startbereich dunkel vom Gummi
  const N = makeNoise(6), rnd = rng(3);
  const asphalt = surface(512, (u, v) => {
    const n = N.fbm(u * 8, v * 8, 5, 8), grain = rnd(), stone = grain > 0.94 ? 1 : 0;
    const k = 46 + n * 24 + grain * 12 + stone * 28;
    return [k, k + 1, k + 4, grain * 0.4 + stone * 0.9 + n * 0.5];
  }, 3);
  const len = DIST + 420, x0 = -80;
  for (const t of [asphalt.map, asphalt.normalMap]) t.repeat.set(len / 12, 15 / 12);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(len, 15), new THREE.MeshStandardMaterial({
    map: asphalt.map, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.8 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(x0 + len / 2, 0.02, 0);
  road.receiveShadow = true;
  scene.add(road);
  for (const z of [-LANE, LANE]) { // Gummispuren vom Burnout
    const rubber = new THREE.Mesh(new THREE.PlaneGeometry(140, 2.2), new THREE.MeshStandardMaterial({ color: 0x15161a, transparent: true, opacity: 0.55, roughness: 0.6 }));
    rubber.rotation.x = -Math.PI / 2;
    rubber.position.set(40, 0.03, z);
    scene.add(rubber);
  }
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  for (const z of [-7, 7, -0.9, 0.9]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.18), white);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x0 + len / 2, 0.035, z);
    scene.add(line);
  }
  // Start- und Ziellinie
  const checker = canvasTexture(128, 16, (g) => { for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 4, y * 4, 4, 4); } }, false);
  for (const [x, m] of [[0, white], [DIST, new THREE.MeshStandardMaterial({ map: checker })]]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(x ? 3 : 0.4, 14), m);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.04, 0);
    scene.add(l);
  }

  // Betonmauern: Mitte und aussen, mit Werbestreifen
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 });
  const adTex = canvasTexture(1024, 64, (g, w, h) => {
    const ads = [['CAR-SAVER', '#c0392b'], ['DRAG CUP', '#1d4ed8'], ['VOLLGAS', '#21a35b'], ['TURBO-PS', '#f39c12']];
    ads.forEach(([t, c], i) => { g.fillStyle = c; g.fillRect(i * w / 4, 0, w / 4, h); g.fillStyle = '#fff'; g.font = '900 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, i * w / 4 + w / 8, h / 2 + 2); });
  });
  adTex.repeat.set(len / 60, 1);
  const adMat = new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.6 });
  const wall = (z, h, w) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), [concrete, concrete, concrete, concrete, adMat, adMat]);
    m.position.set(x0 + len / 2, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  wall(0, 0.9, 0.6);
  wall(-7.6, 1.2, 0.5);
  wall(7.6, 1.2, 0.5);

  // Startampel ("Christbaum") zwischen den Spuren
  const tree = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.7, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), steel);
  pole.position.y = 2.1;
  tree.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 1.6), steel);
  head.position.y = 4.6;
  tree.add(head);
  const bulbs = { stage: [], amber: [], green: [], red: [] };
  const colors = { stage: 0x60a5fa, amber: 0xffb020, green: 0x22ff66, red: 0xff2222 };
  const rows = [['stage', 5.9], ['stage', 5.55], ['amber', 5.05], ['amber', 4.6], ['amber', 4.15], ['green', 3.6], ['red', 3.15]];
  rows.forEach(([kind, y]) => {
    for (const z of [-0.45, 0.45]) {
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: colors[kind], emissiveIntensity: 0 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), m);
      b.position.set(-0.25, y, z);
      tree.add(b);
      bulbs[kind].push(m);
    }
  });
  tree.position.set(-2, 0, 0); // die Lichter (bei x −0.25) schauen zu den Autos
  scene.add(tree);

  // Ziel-Portal und Distanztafeln
  const gantry = new THREE.Group();
  for (const z of [-8, 8]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), steel);
    p.position.set(0, 4.5, z);
    p.castShadow = true;
    gantry.add(p);
  }
  const zielMat = new THREE.MeshStandardMaterial({ map: label('ZIEL', '#c0392b', '#fff') });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 17), [zielMat, zielMat, steel, steel, steel, steel]);
  banner.position.y = 9;
  gantry.add(banner);
  gantry.position.x = DIST;
  scene.add(gantry);
  for (const m of [100, 200, 300]) {
    for (const z of [-9.5, 9.5]) {
      const mMat = new THREE.MeshStandardMaterial({ map: label(m + ' m', '#111', '#ffd166', 256, 128, 64) });
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 3), [mMat, mMat, steel, steel, steel, steel]);
      board.position.set(m, 2.4, z);
      scene.add(board);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6), steel);
      post.position.set(m, 0.8, z);
      scene.add(post);
    }
  }

  // Tribünen links und rechts, Lichtmasten
  const crowdTex = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#2b2f3a'; g.fillRect(0, 0, w, h);
    const cols = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#ffd166', '#f15bb5', '#fff', '#06d6a0'];
    for (let y = 6; y < h; y += 10) for (let x = 3; x < w; x += 7) {
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2c9a0'; g.fillRect(x - 1, y - 5, 2.5, 2.5);
    }
  });
  crowdTex.repeat.set(5, 1);
  for (const [x0s, x1s] of [[-40, 120], [300, 440]]) {
    for (const sgn of [-1, 1]) {
      const g = new THREE.Group();
      const stepsMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.9 });
      for (let r = 0; r < 6; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(x1s - x0s, 0.7 * (r + 1), 2.4), stepsMat);
        step.position.set(0, 0.35 * (r + 1), sgn * (11 + r * 2.4));
        step.receiveShadow = true;
        g.add(step);
      }
      const crowd = new THREE.Mesh(new THREE.PlaneGeometry(x1s - x0s, 15), new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1 }));
      crowd.position.set(0, 2.6, sgn * 17);
      crowd.rotation.set(-1.29, sgn < 0 ? 0 : Math.PI, 0, 'YXZ');
      g.add(crowd);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(x1s - x0s + 4, 0.4, 17), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.3, roughness: 0.5 }));
      roof.position.set(0, 9.5, sgn * 17.5);
      roof.castShadow = true;
      g.add(roof);
      g.position.x = (x0s + x1s) / 2;
      scene.add(g);
    }
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 1.5 });
  // Lichtmasten und Kakteen als Instanzen: alle gleichen Teile in einem Rutsch zeichnen
  const spots = [];
  for (let x = -40; x <= DIST + 300; x += 60) for (const z of [-30, 30]) spots.push([x, z]);
  const masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 18, 8), steel, spots.length);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.2, 0.4), lampMat, spots.length);
  const mtx = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    masts.setMatrixAt(i, mtx.makeTranslation(x, 9, z));
    lamps.setMatrixAt(i, mtx.makeTranslation(x, 18, z * 0.97));
  });
  scene.add(masts, lamps);

  // Kakteen, Felsbrocken und trockene Büsche in der Wüste
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3f7d34, roughness: 0.8 });
  const trunks = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 1, 4, 8), cactusMat, 120);
  const arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 1, 4, 8), cactusMat, 240);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  let nArms = 0;
  for (let i = 0; i < 120; i++) {
    const x = -300 + Math.random() * 1200, z = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 300);
    const h = 2 + Math.random() * 3, y = land.height(x, z);
    trunks.setMatrixAt(i, mtx.compose(pos.set(x, y + h / 2 + 0.3, z), quat, scl.set(1, h, 1)));
    for (const sgn of [-1, 1]) if (Math.random() < 0.7) {
      arms.setMatrixAt(nArms++, mtx.compose(pos.set(x, y + h * (0.4 + Math.random() * 0.3), z + sgn * 0.55), quat, scl.set(1, h * 0.35, 1)));
    }
  }
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), 260);
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), 320);
  const col = new THREE.Color(), e = new THREE.Euler();
  for (let i = 0; i < 260; i++) {
    const x = -400 + Math.random() * 1400, z = (Math.random() < 0.5 ? -1 : 1) * (38 + Math.random() * 500);
    const s = 0.5 + Math.random() ** 3 * 5;
    quat.setFromEuler(e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3));
    boulders.setMatrixAt(i, mtx.compose(pos.set(x, land.height(x, z) + s * 0.3, z), quat, scl.set(s * (1 + Math.random()), s * (0.6 + Math.random() * 0.4), s * (1 + Math.random()))));
    boulders.setColorAt(i, col.setHSL(0.04 + Math.random() * 0.03, 0.45, 0.16 + Math.random() * 0.12));
  }
  quat.identity();
  for (let i = 0; i < 320; i++) {
    const x = -400 + Math.random() * 1400, z = (Math.random() < 0.5 ? -1 : 1) * (36 + Math.random() * 400);
    const s = 0.6 + Math.random() * 1.2;
    shrubs.setMatrixAt(i, mtx.compose(pos.set(x, land.height(x, z) + s * 0.3, z), quat, scl.set(s * 1.3, s * 0.7, s * 1.3)));
    shrubs.setColorAt(i, col.setHSL(0.13 + Math.random() * 0.08, 0.3, 0.07 + Math.random() * 0.06));
  }
  boulders.castShadow = shrubs.castShadow = true;
  scene.add(boulders, shrubs);
  arms.count = nArms;
  trunks.castShadow = arms.castShadow = true;
  scene.add(trunks, arms);
  const lift = (m, by) => { m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -by; };
  lift(road.material, 1);
  scene.traverse(o => { if (o.isMesh && o.position.y > 0.025 && o.position.y < 0.05 && o.material !== road.material) lift(o.material, 3); });
  const decor = new THREE.Group(); // unbewegte Kulisse zu wenigen Stücken verschmelzen (Himmel ausgenommen)
  for (const o of [...scene.children]) if ((o.isMesh || o.isGroup) && o !== sky) decor.add(o);
  scene.add(decor);
  mergeStatic(decor);
  scene.add(land.mesh, buildMesas()); // eigene Farben: nicht mit den anderen Teilen verschmelzen
  const clouds = cloudDome({ radius: 3500, coverage: 0.55, tint: '#ffdcb4', shade: '#9a6a78', seed: 5 });
  scene.add(clouds);
  warmUp(renderer, scene, camera);
  return { renderer, scene, camera, sun, bulbs, clouds };
}

// ---------- Wüste ----------
function makeDesert() {
  const N = makeNoise(12);
  // Um die Bahn herum flach, weiter draussen wellige Sanddünen
  const height = (x, z) => {
    const f = smoothstep(20, 110, Math.hypot(Math.max(0, -150 - x, x - (DIST + 330)), Math.max(0, Math.abs(z) - 35)));
    if (f <= 0) return 0;
    const warp = N.fbm(x / 400, z / 400, 3) * 7;
    const dune = Math.pow(0.5 + 0.5 * Math.sin((x * 0.35 + z * 0.94) / 38 + warp), 2.2) * (3 + 16 * N.fbm(x / 600 + 3, z / 600, 3));
    return f * (dune + (N.fbm(x / 150, z / 150, 3) - 0.5) * 3);
  };
  const C = hex => new THREE.Color(hex);
  const sandA = C(0xe0ac70), sandB = C(0xc98f58), sandDark = C(0xa9713f), pale = C(0xead0a6);
  const color = (x, z, y, steep, c) => {
    c.lerpColors(sandA, sandB, N.fbm(x / 120, z / 120, 3));
    c.lerp(sandDark, smoothstep(0.6, 0.75, N.fbm(x / 300 + 4, z / 300, 3)) * 0.55);
    c.lerp(pale, smoothstep(6, 18, y) * 0.35); // Dünenkämme heller
  };
  // Sand mit feinen Windrippeln
  const r = rng(5);
  const detail = surface(256, (u, v) => {
    const ripple = Math.sin(2 * Math.PI * (v * 24 + N.fbm(u * 4, v * 4, 3, 4) * 1.5));
    const k = 222 + ripple * 10 + r() * 20;
    return [k, k - 4, k - 12, ripple * 0.5 + r() * 0.15];
  }, 2);
  const mesh = terrain({ size: 6000, segments: 220, center: [200, 0], height, color, detail, detailRepeat: 600 });
  mesh.material.normalScale.set(0.6, 0.6);
  return { mesh, height };
}

// Tafelberge: steile Felswände mit Gesteinsschichten, unten ein Schuttkegel, oben flach
function buildMesas() {
  const N = makeNoise(21), r = rng(9);
  const strata = [0xb0583a, 0xc8794a, 0xe2b487, 0x9a4a32, 0xd08e5c, 0xbf6a44].map(h => new THREE.Color(h));
  const top = new THREE.Color(0xb88a5e), col = new THREE.Color();
  const geos = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + r() * 0.25, dist = 850 + r() * 900;
    const rad = 100 + r() * 170, h = 100 + r() * 170, seed = r() * 50;
    const g = new THREE.CylinderGeometry(rad, rad, h, 48, 28);
    const pos = g.attributes.position, nrm = g.attributes.normal, colors = [];
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k), t = y / h + 0.5;
      const ang = Math.atan2(z, x), capTop = nrm.getY(k) > 0.9;
      const rough = 1 + 0.32 * (N.fbm(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2 + t * 1.5, 4) - 0.5);
      const flare = 1 + 0.75 * (1 - smoothstep(0, 0.38, t)) ** 1.6 + (t < 0.62 ? 0.07 : 0); // Schuttkegel und Felsband
      const f = rough * flare;
      pos.setXYZ(k, x * f, y, z * f);
      const yy = y + h / 2 + (N.noise(ang * 3 + seed, 0) - 0.5) * 8;
      if (capTop) col.copy(top);
      else if (t < 0.3) col.copy(strata[1]).lerp(top, 0.35 + (1 - t / 0.3) * 0.3);
      else col.copy(strata[Math.floor(yy / 9) % strata.length]).lerp(strata[Math.floor(yy / 9 + 1) % strata.length], (yy / 9) % 1 * 0.3);
      colors.push(col.r, col.g, col.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.translate(200 + Math.cos(a) * dist, h / 2 - 10, Math.sin(a) * dist);
    geos.push(g);
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- Bedienoberfläche ----------
const CSS = `
#drag { position: fixed; overflow: hidden; background: #000; z-index: 10; transform-origin: center center;
  font-family: system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; touch-action: none; }
#drag canvas.r3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#drag .bars { position: absolute; top: 10px; left: 12px; right: 64px; display: grid; gap: 6px; }
#drag .bar { position: relative; height: 24px; background: rgba(0,0,0,.5); border-radius: 12px; overflow: hidden; font-weight: 800; font-size: 14px; }
#drag .bar i { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: 12px; }
#drag .bar span { position: relative; padding-left: 10px; line-height: 24px; text-shadow: 0 1px 3px #000; }
#drag .quit { position: absolute; top: 10px; right: 12px; width: 42px; height: 42px; border-radius: 50%; border: none;
  background: rgba(0,0,0,.55); color: #fff; font-size: 20px; }
#drag .tacho { position: absolute; bottom: 10px; left: 12px; }
#drag .msg { position: absolute; top: 30%; width: 100%; text-align: center; font-size: 50px; font-weight: 900;
  text-shadow: 0 3px 10px rgba(0,0,0,.7); pointer-events: none; }
#drag .sub { position: absolute; top: 44%; width: 100%; text-align: center; font-size: 22px; font-weight: 700;
  text-shadow: 0 2px 6px rgba(0,0,0,.8); pointer-events: none; }
#drag .lights { position: absolute; top: 70px; right: 16px; display: grid; gap: 6px; padding: 10px; background: #15161a; border-radius: 12px; }
#drag .lights span { width: 26px; height: 26px; border-radius: 50%; background: #222; }
#drag .lights span.on.amber { background: #ffb020; box-shadow: 0 0 14px #ffb020; }
#drag .lights span.on.green { background: #22ff66; box-shadow: 0 0 16px #22ff66; }
#drag .lights span.on.red { background: #ff2222; box-shadow: 0 0 16px #ff2222; }
#drag .go { position: absolute; bottom: 18px; right: 18px; width: 150px; height: 150px; border-radius: 50%;
  border: 4px solid rgba(255,255,255,.75); background: radial-gradient(circle at 40% 35%, #ff6a3d, #b91c1c);
  color: #fff; font-size: 24px; font-weight: 900; box-shadow: 0 6px 18px rgba(0,0,0,.5); touch-action: none; }
#drag .go:active { transform: scale(.95); }
#drag .hint { position: absolute; bottom: 30px; right: 184px; font-size: 14px; opacity: .85; background: rgba(0,0,0,.45);
  padding: 4px 10px; border-radius: 10px; }
`;

function buildDom() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'drag';
  root.hidden = true;
  root.innerHTML = `
    <div class="bars"><div class="bar me"><i></i><span></span></div><div class="bar opp"><i></i><span></span></div></div>
    <button class="quit" title="Rennen abbrechen">✕</button>
    <canvas class="tacho" width="230" height="150"></canvas>
    <div class="lights"><span class="amber"></span><span class="amber"></span><span class="amber"></span><span class="green"></span><span class="red"></span></div>
    <div class="msg"></div><div class="sub"></div>
    <div class="hint">Leertaste oder Knopf</div>
    <button class="go">GAS!</button>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const ui = { root, meBar: $('.bar.me i'), meName: $('.bar.me span'), oppBar: $('.bar.opp i'), oppName: $('.bar.opp span'),
    tacho: $('.tacho'), lights: [...root.querySelectorAll('.lights span')], lightBox: $('.lights'), msg: $('.msg'), sub: $('.sub'), go: $('.go'), quit: $('.quit') };
  ui.go.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) root.querySelector('.hint').style.display = 'none';
  ui.quit.addEventListener('pointerdown', e => { e.preventDefault(); if (drag) endDrag(true); });
  root.addEventListener('contextmenu', e => e.preventDefault());
  return ui;
}

function onKey(e) {
  if (!drag || e.repeat) return;
  if (['Space', 'ArrowUp', 'KeyW', 'Enter', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { e.preventDefault(); press(); }
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight, rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  const st = W3.ui.root.style;
  st.width = w + 'px'; st.height = h + 'px';
  st.left = (vw - w) / 2 + 'px'; st.top = (vh - h) / 2 + 'px';
  st.transform = rotated ? 'rotate(90deg)' : 'none';
  W3.renderer.setSize(w, h, false);
  W3.camera.aspect = w / h;
  W3.camera.updateProjectionMatrix();
}

// ---------- Rennen ----------
// player/opponent: Fahrzeuge aus dem Fahrzeugpark ({ kind, color, special, ps, name }); skill: wie gut der Gegner schaltet
// net (nur online): { startAt, serverNow(), send(state), latest() } – der Gegner ist dann ein Mitspieler (siehe online.js)
export function startDrag({ player, opponent, skill, kinds, topSpeed, onFinish, net = null }) {
  if (!W3) {
    W3 = buildWorld();
    W3.ui = buildDom();
    W3.ui.root.prepend(W3.renderer.domElement);
    window.addEventListener('resize', () => W3 && !W3.ui.root.hidden && layout());
  }
  const mk = (v, lane, ai) => ({
    v, ai, x: -4, z: lane, speed: 0, gear: 0, shiftT: 0, boost: 0, started: false, finish: null, react: null,
    maxV: topSpeed(v.ps) * 1.35, acc: 3 + v.ps * 0.07, mesh: buildCar(v, kinds),
    aiShift: 0.62 + skill * 0.35, aiReact: 0.45 - skill * 0.25 + Math.random() * 0.1,
  });
  const me = mk(player, -LANE, false), opp = mk(opponent, LANE, true);
  for (const c of [me, opp]) { c.mesh.position.set(c.x, 0, c.z); W3.scene.add(c.mesh); }
  warmUp(W3.renderer, W3.scene, W3.camera);
  if (!W3.quality) W3.quality = makeQuality(W3.renderer, layout);
  drag = { me, opp, t: 0, phase: 'stage', greenAt: 0, onFinish, endT: 0, msgT: 0, last: performance.now(), lightStep: 0, net, sendT: 0, waitT: 0 };
  if (net) opp.ai = false;
  W3.ui.root.hidden = false;
  W3.ui.meName.textContent = 'Du · ' + kinds[player.kind].name + ' · ' + player.ps + ' PS';
  W3.ui.oppName.textContent = opponent.name + ' · ' + kinds[opponent.kind].name + ' · ' + opponent.ps + ' PS';
  W3.ui.meBar.style.background = '#ffd166';
  W3.ui.oppBar.style.background = '#60a5fa';
  W3.ui.go.textContent = 'GAS!';
  W3.ui.lightBox.style.display = '';
  setMsg('Bereit…', 'Gib Gas, sobald es GRÜN wird!');
  layout();
  window.addEventListener('keydown', onKey);
  startEngine();
  resetLights();
  requestAnimationFrame(loop);
}

function setMsg(text, sub = '', secs = 0) {
  W3.ui.msg.textContent = text;
  W3.ui.sub.textContent = sub;
  drag.msgT = secs;
}

function resetLights() {
  for (const k in W3.bulbs) for (const m of W3.bulbs[k]) m.emissiveIntensity = 0;
  for (const m of W3.bulbs.stage) m.emissiveIntensity = 2.5;
  W3.ui.lights.forEach(l => l.classList.remove('on'));
}

// Ein Knopf für alles: beim Start Gas geben, danach schalten
function press() {
  const d = drag;
  if (!d || d.me.finish) return;
  const me = d.me;
  if ((d.phase === 'stage' || d.phase === 'tree') && d.net) { // online: Frühstart kostet 1 Sekunde
    if (!me.penalty) { me.penalty = 1; setMsg('FRÜHSTART! ❌', '1 Sekunde Strafe', 1.6); window.beep && window.beep(160, 0.4, 'square', 0.06); }
    return;
  }
  if (d.phase === 'stage' || d.phase === 'tree') {
    // Frühstart: nochmal von vorne
    setMsg('FRÜHSTART! ❌', 'Warte auf Grün – nochmal!', 0);
    for (const m of W3.bulbs.red) m.emissiveIntensity = 3;
    W3.ui.lights[4].classList.add('on');
    window.beep && window.beep(160, 0.4, 'square', 0.06);
    d.phase = 'foul';
    d.t = 0;
    return;
  }
  if (d.phase !== 'go') return;
  if (!me.started) {
    if (me.penalty && d.t < me.penalty) return; // Strafzeit abwarten
    me.started = true;
    me.react = d.t - d.greenAt;
    setMsg('', 'Reaktion: ' + me.react.toFixed(3) + ' s' + (me.react < 0.25 ? '  ⚡ Super!' : ''), 1.4);
    W3.ui.go.textContent = 'SCHALTEN ⬆';
    window.beep && window.beep(220, 0.3, 'sawtooth', 0.05);
    return;
  }
  shift(me);
}

function rpmOf(c) { return Math.max(0.2, c.speed / (c.maxV * GEARS[c.gear])); }

function shift(c) {
  if (c.gear >= GEARS.length - 1 || c.shiftT > 0) return;
  const rpm = rpmOf(c);
  c.gear++;
  c.shiftT = SHIFT_TIME;
  if (c.ai) return;
  if (rpm >= 0.86 && rpm < 0.99) { c.boost = 0.7; setMsg('PERFEKT! ✨', '', 0.7); window.beep && window.beep(880, 0.1, 'triangle', 0.06); }
  else if (rpm >= 0.99) setMsg('Zu spät!', '', 0.6);
  else if (rpm < 0.72) setMsg('Zu früh!', '', 0.6);
}

function physics(c, dt) {
  if (!c.started || c.finish && c.speed <= 0) return;
  if (c.finish) { c.speed = Math.max(0, c.speed - 14 * dt); c.x += c.speed * dt; return; } // ausrollen
  const rpm = rpmOf(c);
  if (c.shiftT > 0) c.shiftT -= dt;
  else if (rpm < 1) {
    const torque = Math.max(0.35, 1 - (rpm - 0.78) ** 2 * 1.6);
    let a = c.acc * GEAR_PULL[c.gear] * torque;
    if (c.boost > 0) { a *= 1.18; c.boost -= dt; }
    c.speed = Math.min(c.maxV * GEARS[c.gear], c.speed + a * dt);
  }
  if (c.ai && rpm >= c.aiShift) shift(c);
  c.x += c.speed * dt;
}

function loop(now) {
  if (!drag) return;
  const dt = Math.min(0.05, (now - drag.last) / 1000);
  W3.quality((now - drag.last) / 1000);
  drag.last = now;
  step(dt);
  if (!drag) return;
  render(dt);
  requestAnimationFrame(loop);
}

function step(dt) {
  const d = drag, { me, opp } = d;
  if (d.net) { // gemeinsame Uhr: 0–1,2 s bereit, 1,2–3,2 s gelbe Lichter, dann grün
    const t = (d.net.serverNow() - d.net.startAt) / 1000;
    d.t = d.phase === 'stage' ? t : d.phase === 'tree' ? t - 1.2 : t - 3.2;
    if (t < 0 && d.msgT <= 0) setMsg('Bereit…', 'Gleich geht es los …');
    netTick(dt);
  } else d.t += dt;
  if (d.msgT > 0 && (d.msgT -= dt) <= 0) setMsg('', '');

  if (d.phase === 'foul' && d.t > 1.6) { d.phase = 'stage'; d.t = 0; d.lightStep = 0; resetLights(); setMsg('Bereit…', 'Gib Gas, sobald es GRÜN wird!'); }
  if (d.phase === 'stage' && d.t > 1.2) { d.phase = 'tree'; d.t = 0; setMsg('', ''); }
  if (d.phase === 'tree') { // drei gelbe Lichter, dann grün
    const step = Math.floor(d.t / 0.5);
    if (step > d.lightStep && step <= 3) {
      d.lightStep = step;
      W3.bulbs.amber[(step - 1) * 2].emissiveIntensity = W3.bulbs.amber[(step - 1) * 2 + 1].emissiveIntensity = 3;
      W3.ui.lights[step - 1].classList.add('on');
      window.beep && window.beep(520, 0.1, 'square', 0.05);
    }
    if (d.t >= 2.0) {
      d.phase = 'go'; d.t = 0; d.greenAt = 0;
      for (const m of W3.bulbs.amber) m.emissiveIntensity = 0;
      for (const m of W3.bulbs.green) m.emissiveIntensity = 3.5;
      W3.ui.lights.forEach((l, i) => l.classList.toggle('on', i === 3));
      setMsg('GRÜN! 🟢', '', 0.8);
      window.beep && window.beep(1040, 0.3, 'square', 0.06);
    }
  }
  if (d.phase === 'go') {
    if (!d.net && !opp.started && d.t >= opp.aiReact) { opp.started = true; opp.react = d.t; }
    physics(me, dt);
    if (!d.net) physics(opp, dt);
    for (const c of d.net ? [me] : [me, opp]) {
      if (!c.finish && c.x >= DIST) {
        c.finish = d.t - (c.react !== null ? 0 : 0);
        if (c === me && d.net) { // online: Sieger erst, wenn beide Zeiten da sind
          setMsg('🏁 IM ZIEL!', 'Deine Zeit: ' + d.t.toFixed(2) + ' s · ' + Math.round(me.speed * 3.6) + ' km/h', 0);
          d.waitT = 10;
          W3.ui.go.textContent = '🏁';
        } else if (c === me) {
          const won = !opp.finish;
          setMsg(won ? '🏆 GEWONNEN!' : '😢 VERLOREN', 'Deine Zeit: ' + (d.t).toFixed(2) + ' s · ' + Math.round(me.speed * 3.6) + ' km/h', 0);
          d.endT = 3;
          W3.ui.go.textContent = '🏁';
        }
      }
    }
    if (d.net && me.finish && !d.endT && (opp.finish || (d.waitT -= dt) <= 0)) {
      const won = !opp.finish || me.finish <= opp.finish;
      setMsg(won ? '🏆 GEWONNEN!' : '😢 VERLOREN', 'Du: ' + me.finish.toFixed(2) + ' s · ' + opp.v.name + ': ' + (opp.finish ? opp.finish.toFixed(2) + ' s' : '–'), 0);
      d.endT = 3;
    }
    if (opp.finish && !me.finish && !d.oppMsg) { d.oppMsg = true; setMsg('', opp.v.name + ' ist im Ziel!', 1.5); }
    if (opp.finish && !me.finish && d.t > opp.finish + 8) { endDrag(false); return; } // nie losgefahren oder viel zu langsam
  }
  if (d.endT > 0 && (d.endT -= dt) <= 0) { endDrag(false); return; }
  updateHud();
}

// Online: eigenen Stand senden, Gegner aus den gemeldeten Daten bewegen
function netTick(dt) {
  const d = drag, { me, opp } = d, n = d.net;
  if ((d.sendT -= dt) <= 0) {
    d.sendT = 0.1;
    n.send({ x: +me.x.toFixed(2), v: +me.speed.toFixed(2), g: me.gear, fin: me.finish ? +me.finish.toFixed(3) : 0 });
  }
  const s = n.latest();
  if (!s || n.serverNow() - s.t > 6000) return;
  const age = Math.min(0.5, Math.max(0, (n.serverNow() - s.t) / 1000));
  const tx = s.fin ? Math.max(s.x, DIST) : s.x + s.v * age;
  opp.x += (tx - opp.x) * (1 - Math.exp(-dt * 12));
  opp.speed = s.v;
  opp.gear = s.g || 0;
  opp.started = opp.started || s.v > 0;
  if (s.fin && !opp.finish) opp.finish = s.fin;
}

function updateHud() {
  const { me, opp } = drag, ui = W3.ui;
  ui.meBar.style.width = Math.min(100, Math.max(0, me.x / DIST * 100)) + '%';
  ui.oppBar.style.width = Math.min(100, Math.max(0, opp.x / DIST * 100)) + '%';
  // Drehzahlmesser mit grünem Schaltbereich
  const g = ui.tacho.getContext('2d'), cx = 115, cy = 120, R = 92;
  g.clearRect(0, 0, 230, 150);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.arc(cx, cy, R + 14, Math.PI, 0); g.lineTo(cx + R + 14, cy + 24); g.lineTo(cx - R - 14, cy + 24); g.fill();
  const arc = (a0, a1, col) => { g.strokeStyle = col; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, R, Math.PI + a0 * Math.PI, Math.PI + a1 * Math.PI); g.stroke(); };
  arc(0, 0.86, '#4b5563'); arc(0.86, 0.99, '#22c55e'); arc(0.99, 1, '#ef4444');
  const rpm = Math.min(1, me.started ? rpmOf(me) : 0.2 + Math.random() * 0.03);
  const a = Math.PI + rpm * Math.PI;
  g.strokeStyle = '#fff'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); g.stroke();
  g.fillStyle = '#fff'; g.font = '900 30px system-ui'; g.textAlign = 'center';
  g.fillText(Math.round(me.speed * 3.6) + ' km/h', cx, cy - 18);
  g.font = '800 16px system-ui';
  g.fillText('Gang ' + (me.gear + 1), cx, cy + 16);
  engineSound(rpm, me.gear);
}

// ---------- Kamera ----------
const camWant = new THREE.Vector3();
function render(dt) {
  const { me, opp } = drag;
  for (const c of [me, opp]) {
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.z = c.started && c.speed < c.maxV * 0.3 && !c.finish ? 0.03 : 0; // Front hebt sich beim Start
    for (const w of c.mesh.userData.wheels) w.rotation.z -= c.speed * dt / 0.35;
    animateCar(c.mesh, drag.t, c.v.special);
  }
  const cam = W3.camera, speed = me.speed;
  const want = camWant.set(me.x - 9 - speed * 0.02, 2.6 + speed * 0.006, me.z + 2.2);
  cam.position.lerp(want, 1 - Math.exp(-dt * 5));
  if (speed > 30) cam.position.y += (Math.random() - 0.5) * speed * 0.0012; // Zittern bei Höchsttempo
  cam.lookAt(me.x + 10, 1.0, me.z + 1.2);
  cam.fov = 60 + Math.min(22, speed * 0.18);
  cam.updateProjectionMatrix();
  W3.sun.position.set(me.x - 60, 70, -50);
  W3.sun.target.position.set(me.x + 10, 0, 0);
  W3.clouds.position.set(cam.position.x, 0, cam.position.z);
  W3.renderer.render(W3.scene, cam);
}

// ---------- Motorgeräusch ----------
let engine = null;
function startEngine() {
  const a = window.audio && window.audio();
  if (!a || engine) return;
  const osc = a.createOscillator(), filter = a.createBiquadFilter(), gain = a.createGain();
  osc.type = 'sawtooth'; filter.type = 'lowpass'; filter.frequency.value = 900; gain.gain.value = 0.035;
  osc.connect(filter).connect(gain).connect(a.destination);
  osc.start();
  engine = { osc, gain, a };
}
function engineSound(rpm, gear) {
  if (engine) engine.osc.frequency.setTargetAtTime(60 + gear * 8 + rpm * 230, engine.a.currentTime, 0.04);
}
function stopEngine() {
  if (!engine) return;
  engine.gain.gain.setTargetAtTime(0, engine.a.currentTime, 0.05);
  engine.osc.stop(engine.a.currentTime + 0.3);
  engine = null;
}

function endDrag(quit) {
  const d = drag;
  drag = null;
  stopEngine();
  window.removeEventListener('keydown', onKey);
  for (const c of [d.me, d.opp]) W3.scene.remove(c.mesh); // Formen gehören der Vorlage in cars3d.js
  W3.ui.root.hidden = true;
  if (quit) { d.onFinish({ quit: true }); return; }
  d.onFinish({ win: !!d.me.finish && (!d.opp.finish || d.me.finish <= d.opp.finish), myTime: d.me.finish, oppTime: d.opp.finish,
    react: d.me.react, topKmh: Math.round(d.me.maxV * 3.6) });
}

window.__drag = () => drag; // für Tests im Browser
window.__dragW = () => W3;

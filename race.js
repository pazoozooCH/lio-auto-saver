// Rennstrecke in 3D (three.js). Wird von game.js erst geladen, wenn ein Rennen startet.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCar, animateCar, warmUp, makeQuality, mergeStatic } from './cars3d.js';
import { makeNoise, rng, smoothstep, surface, terrain, cloudDome } from './world3d.js';
import { createCarSound, crash, gearbox } from './sound.js';
import { TRACKS, THEMES, buildTheme } from './tracks.js';

const TRACK_W = 14;          // Fahrbahnbreite in Metern
const GRIP = 13;             // so viel Querbeschleunigung (m/s²) halten die Reifen in Kurven
const BRAKE = 22;            // Bremsverzögerung in m/s²
const WALL = TRACK_W / 2 + 16; // Abstand der Reifenstapel von der Mitte

let R = null;      // Renderer und Bedienoberfläche; R.worlds: je Strecke Szene und Strecke (einmal gebaut)
let race = null;   // das laufende Rennen

// ---------- Strecke ----------
function makeTrack(def) {
  const curve = new THREE.CatmullRomCurve3(def.control.map(([x, z, h = 0]) => new THREE.Vector3(x, h, z)), true, 'centripetal');
  const pts = curve.getSpacedPoints(Math.max(1400, Math.round(curve.getLength() / 1.5)));
  pts.pop();
  const n = pts.length;
  const h = new Float32Array(n); // Höhe der Fahrbahnmitte; die Punkte selbst liegen flach (Fahrphysik von oben)
  for (let i = 0; i < n; i++) { h[i] = Math.max(0, pts[i].y); pts[i].y = 0; }
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
  }
  // Steilkurven: in engen Kurven ist die Fahrbahn zur Innenseite geneigt (aussen höher) – so hält man mehr Tempo
  const maxBank = (def.bank || 0) * Math.PI / 180, bankRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) bankRaw[i] = maxBank * smoothstep(0.003, 0.014, curv[i]) * side[i];
  const slope = new Float32Array(n), grade = new Float32Array(n), gripEff = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -18; k <= 18; k++) sum += bankRaw[(i + k + n) % n];
    const bank = sum / 37;
    slope[i] = -Math.tan(bank); // Höhe ändert sich um slope pro Meter nach rechts
    grade[i] = (h[(i + 1) % n] - h[(i - 1 + n) % n]) / (2 * ds);
    gripEff[i] = GRIP * (def.grip || 1) + 9.81 * Math.abs(Math.tan(bank)) * 0.9;
    safe[i] = Math.min(120, Math.sqrt(gripEff[i] / Math.max(curv[i], 1e-4)));
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
  // Tunnel: Wände nah an der Fahrbahn
  const tunnels = (def.tunnels || []).map(([c0, c1]) => [c0, c1].map(ci => {
    const [cx, cz] = def.control[ci];
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = (pts[i].x - cx) ** 2 + (pts[i].z - cz) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }));
  const inTunnel = new Uint8Array(n);
  for (const [i0, i1] of tunnels) for (let i = i0; i !== i1; i = (i + 1) % n) { inTunnel[i] = 1; wallOff[0][i] = wallOff[1][i] = TRACK_W / 2 + 3; }
  for (let i = 0; i < n; i++) if (h[i] > 5) wallOff[0][i] = wallOff[1][i] = Math.min(wallOff[0][i], TRACK_W / 2 + 4.5); // Brücken: Geländer nah an der Fahrbahn
  for (const arr of wallOff) { // glätten
    const copy = arr.slice();
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let k = -25; k <= 25; k++) m = Math.min(m, copy[(i + k + n) % n]);
      arr[i] = m;
    }
  }
  // Liegt ein anderer Streckenteil darüber oder darunter (Brücken-Kreuzung)? Dort keine Pfeiler und Seitenwände
  const over = new Uint8Array(n);
  for (let i = 0; i < n; i += 3) for (let j = 0; j < n; j += 3) {
    const dsn = Math.min(Math.abs(dist[i] - dist[j]), length - Math.abs(dist[i] - dist[j]));
    if (dsn > 80 && (pts[i].x - pts[j].x) ** 2 + (pts[i].z - pts[j].z) ** 2 < 28 * 28) { for (let k = -3; k <= 3; k++) over[(i + k + n) % n] = 1; }
  }
  return { pts, tan, nor, dist, curv, safe, wallOff, n, length, ds, h, slope, grade, gripEff, over, tunnels, inTunnel, laps: def.laps || 3 };
}

// Höhe der Fahrbahn bei Index i und o Metern rechts der Mitte (Steilkurven heben die Aussenseite an)
const groundY = (T, i, o) => T.h[i] + o * T.slope[i];

function trackPoint(T, s) {
  const u = (((s % T.length) + T.length) % T.length) / T.ds;
  const i = Math.floor(u) % T.n, j = (i + 1) % T.n, f = u - Math.floor(u);
  return { i, p: T.pts[i].clone().lerp(T.pts[j], f), t: T.tan[i].clone().lerp(T.tan[j], f).normalize(), nrm: T.nor[i], y: T.h[i] + (T.h[j] - T.h[i]) * f };
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
    pos.push(p.x + q.x * a, groundY(T, j, a) + y, p.z + q.z * a, p.x + q.x * b, groundY(T, j, b) + y, p.z + q.z * b);
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

// Senkrechtes Band an der Wandlinie: von bottom bis top über der Fahrbahn (bottom = null: bis zum Boden);
// include(j) wählt die Abschnitte aus (z.B. nur Brücken)
function wallGeometry(T, k, sgn, height, bottom = 0, include = () => true, groundBottom = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= T.n; i++) {
    const j = i % T.n, p = T.pts[j], q = T.nor[j], o = T.wallOff[k][j] * sgn;
    const x = p.x + q.x * o, z = p.z + q.z * o, v = (i === T.n ? T.length : T.dist[j]) / 1.2, g = groundY(T, j, o);
    pos.push(x, groundBottom ? bottom : g + bottom, z, x, g + height, z);
    uv.push(v, 0, v, 1);
    if (i < T.n && include(j)) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
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

function makeTextures() {
  const N = makeNoise(2), r = rng(4);
  // Asphalt: feine Körnung mit einzelnen hellen Steinchen, in der Mitte dunkler abgefahren
  const asphalt = surface(512, (u, v) => {
    const n = N.fbm(u * 12, v * 12, 5, 12), grain = r(), stone = grain > 0.94 ? 1 : 0;
    const worn = 1 - 0.2 * Math.exp(-(((u - 0.5) / 0.2) ** 2));
    const k = (50 + n * 26 + grain * 12 + stone * 30) * worn;
    return [k, k + 1, k + 4, grain * 0.4 + stone * 0.9 + n * 0.5];
  }, 3);
  // Kies: runde Steinchen in Beige- und Grautönen
  const gravel = surface(256, (u, v) => {
    const n = N.noise(u * 40, v * 40, 40), m = N.noise(u * 13 + 4, v * 13, 13), g = r();
    const k = 0.62 + n * 0.3 + g * 0.12;
    return [212 * k, (190 - m * 25) * k, (150 - m * 30) * k, n + g * 0.25];
  }, 4);
  return {
    asphalt: asphalt.map, asphaltN: asphalt.normalMap, gravel: gravel.map, gravelN: gravel.normalMap,
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
// Handys und Tablets: weniger Bäume, Felsen und Flocken, gröberes Gelände (weniger Speicher und Rechenarbeit)
const LITE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);

// Strecke freigeben (Formen, Materialien, Bilder), damit nur die aktuelle Strecke Speicher braucht
function disposeWorld(w) {
  const done = new Set();
  w.scene.traverse(o => {
    if (o.geometry && !done.has(o.geometry)) { done.add(o.geometry); o.geometry.dispose(); }
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (done.has(m)) continue;
      done.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture && !done.has(v)) { done.add(v); v.dispose(); }
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) u.value.dispose();
      m.dispose();
    }
  });
}

function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

// Szene für eine Strecke bauen: Himmel und Licht der Landschaft, Fahrbahn mit Steilkurven, Brücken, Tunnel, Kulisse
function buildWorld(def, renderer) {
  const TH = THEMES[def.theme], alps = def.theme === 'alps';
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(...TH.fog);
  scene.environment = R.env; // Umgebungslicht für alle Strecken gemeinsam (spart Grafikspeicher)

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 8000);
  camera.layers.enable(1); // Ebene 1: ferne Kulisse (Bäume weit weg, Wolken), die der Rückspiegel weglässt

  // Himmel mit Sonne
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const su = sky.material.uniforms, [turb, ray, elev, azim] = TH.sky;
  su.turbidity.value = turb; su.rayleigh.value = ray; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(...TH.hemi));
  const sun = new THREE.DirectionalLight(...TH.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 10, far: 400 });
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const sunDir = su.sunPosition.value.clone();

  const T = makeTrack(def);
  const tex = makeTextures();
  const { trackDist, cx, cz } = makeTrackDist(T);
  const theme = alps ? null : buildTheme(def.theme, { T, trackDist, cx, cz, mergeGeometries, lite: LITE });
  const land = alps ? makeLand(T) : { mesh: theme.land };

  const curvy = i => T.curv[i] > 0.012;
  const strip = (a, b, y, v, mat, inc) => {
    const m = new THREE.Mesh(stripGeometry(T, a, b, y, v, inc), mat);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const side = THREE.DoubleSide;
  const wl = i => -T.wallOff[0][i], wr = i => T.wallOff[1][i];
  if (!alps) { // Randstreifen bis zu den Wänden (folgt Höhe und Neigung der Fahrbahn), darunter Brückenboden
    theme.shoulder.side = side;
    strip(wl, wr, -0.012, 0.25, theme.shoulder);
    theme.skirt.side = side;
    strip(wl, wr, -1.1, 0.25, theme.skirt, i => T.h[i] > 1.2);
  }
  // Kies in den Kurven, Asphalt, Randsteine, weisse Linien
  const gravelMat = new THREE.MeshStandardMaterial({ map: tex.gravel, normalMap: tex.gravelN, roughness: 1, side });
  const gravelIn = i => curvy(i) && !T.inTunnel[i];
  strip(TRACK_W / 2 + 1.4, i => Math.min(T.wallOff[1][i] - 0.5, TRACK_W / 2 + 9), 0.008, 0.2, gravelMat, gravelIn);
  strip(-TRACK_W / 2 - 1.4, i => -Math.min(T.wallOff[0][i] - 0.5, TRACK_W / 2 + 9), 0.008, 0.2, gravelMat, gravelIn);
  strip(-TRACK_W / 2, TRACK_W / 2, 0.02, 1 / 14, new THREE.MeshStandardMaterial({
    map: tex.asphalt, normalMap: tex.asphaltN, normalScale: new THREE.Vector2(0.4, 0.4), roughness: def.theme === 'snow' ? 0.55 : 0.78, side }));
  const kerbMat = new THREE.MeshStandardMaterial({ map: tex.kerb, roughness: 0.7, side });
  strip(TRACK_W / 2, TRACK_W / 2 + 1.4, 0.03, 1 / 3, kerbMat, curvy);
  strip(-TRACK_W / 2 - 1.4, -TRACK_W / 2, 0.03, 1 / 3, kerbMat, curvy);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side });
  strip(TRACK_W / 2 - 0.55, TRACK_W / 2 - 0.25, 0.03, 0.1, lineMat);
  strip(-TRACK_W / 2 + 0.25, -TRACK_W / 2 + 0.55, 0.03, 0.1, lineMat);

  // Wände: Reifenstapel (Alpen) oder die Wand der Landschaft
  tex.tyres.repeat.set(1, 1);
  const wallMat = alps ? new THREE.MeshStandardMaterial({ map: tex.tyres, roughness: 0.9, side }) : theme.wall;
  for (const [k, sgn] of [[0, -1], [1, 1]]) {
    const w = new THREE.Mesh(wallGeometry(T, k, sgn, 1.0), wallMat);
    w.castShadow = true;
    scene.add(w);
    if (!alps) { // Seitenwand der Dämme und Brücken bis zum Boden (bei Kreuzungen nur ein kurzer Brückenrand)
      scene.add(new THREE.Mesh(wallGeometry(T, k, sgn, 0, -3, i => T.h[i] > 0.4 && !T.over[i], true), theme.skirt));
      scene.add(new THREE.Mesh(wallGeometry(T, k, sgn, 0, -1.1, i => T.h[i] > 1.2 && T.over[i]), theme.skirt));
    }
  }
  if (!alps) { // Pfeiler unter hohen Brücken
    for (let i = 0; i < T.n; i += Math.round(18 / T.ds)) {
      if (T.h[i] < 3 || T.over[i] || T.inTunnel[i]) continue;
      const hh = T.h[i] - 1;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.6, hh + 3, 2.6), theme.skirt);
      pillar.position.set(T.pts[i].x, (hh - 3) / 2, T.pts[i].z);
      pillar.castShadow = true;
      scene.add(pillar);
    }
  }
  buildTunnels(scene, T);

  // Start/Ziel: Schachbrett, Startplätze und Startampel
  const s0 = trackPoint(T, 0);
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 2.4), new THREE.MeshStandardMaterial({ map: tex.checker, roughness: 0.7 }));
  finish.rotation.x = -Math.PI / 2;
  finish.rotation.z = -Math.atan2(s0.t.z, s0.t.x) + Math.PI / 2;
  finish.position.set(s0.p.x, s0.y + 0.035, s0.p.z);
  scene.add(finish);
  for (let k = 0; k < 6; k++) {
    const g = gridSlot(T, k);
    const box = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.2), lineMat);
    box.rotation.x = -Math.PI / 2;
    box.position.set(g.pos.x + g.fwd.x * 3, g.y + 0.035, g.pos.z + g.fwd.z * 3);
    box.rotation.z = -Math.atan2(g.fwd.z, g.fwd.x);
    scene.add(box);
  }
  const lights = buildGantry(scene, s0);

  // Tribüne aussen an der Start-Ziel-Geraden, Boxengebäude innen
  buildGrandstand(scene, tex, s0, -1);
  buildPits(scene, s0, 1);

  // Werbetafeln
  const ads = [['CAR-SAVER GP', '#c0392b', '#fff'], ['TURBO-PS', '#ffd166', '#222'], ['PRESSE CUP', '#1d4ed8', '#fff'], ['VOLLGAS!', '#21a35b', '#fff']];
  ads.forEach(([text, bg, fg], i) => {
    const tp = trackPoint(T, T.length * (0.12 + i * 0.22));
    if (T.inTunnel[tp.i] || T.h[tp.i] > 0.5) return; // nur auf ebener Erde
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

  if (alps) buildTrees(scene, land);
  else for (const o of theme.add) scene.add(o);

  // Flache Schichten (Wiese < Asphalt/Kies < Linien/Randsteine) sauber übereinander zeichnen
  const lift = (m, by) => { m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -by; };
  scene.traverse(o => { if (o.material && (o.material.map === tex.asphalt || o.material.map === tex.gravel)) lift(o.material, 1); });
  for (const m of [kerbMat, lineMat, finish.material]) lift(m, 3);
  scene.traverse(o => { if (o.isMesh && o.geometry.attributes.color && !o.isInstancedMesh) o.userData.keep = true; }); // eigene Farben behalten
  const decor = new THREE.Group(); // unbewegte Kulisse zu wenigen Stücken verschmelzen (Himmel ausgenommen)
  for (const o of [...scene.children]) if ((o.isMesh || o.isGroup) && o !== sky && !o.userData.keep) decor.add(o);
  scene.add(decor);
  mergeStatic(decor);
  scene.add(land.mesh); // Gelände mit eigenen Farben: nicht mit den anderen Teilen verschmelzen
  const clouds = cloudDome({ radius: 3000, seed: 3, ...TH.clouds });
  clouds.layers.set(1);
  scene.add(clouds);
  warmUp(renderer, scene, camera);
  return { scene, camera, sun, sunDir, T, lights, clouds, update: theme ? theme.update : () => {} };
}

// Tunnel: gewölbte Röhre über der Fahrbahn mit Lampen an der Decke, aussen Fels
function buildTunnels(scene, T) {
  if (!T.tunnels.length) return;
  const inner = new THREE.MeshStandardMaterial({ color: 0x8d8f94, roughness: 0.9, side: THREE.DoubleSide });
  const rock = new THREE.MeshStandardMaterial({ color: 0x6f737a, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 1.6 });
  const SEG = 14;
  for (const [i0, i1] of T.tunnels) {
    const idxs = [];
    for (let i = i0; i !== i1; i = (i + 2) % T.n) idxs.push(i);
    for (const [radius, m, lift] of [[T.wallOff[0][idxs[0]] + 0.3, inner, 0], [T.wallOff[0][idxs[0]] + 5, rock, 0]]) {
      const pos = [], idx = [];
      idxs.forEach((i, k) => {
        const p = T.pts[i], q = T.nor[i];
        for (let a = 0; a <= SEG; a++) {
          const ang = Math.PI * a / SEG, o = Math.cos(ang) * radius;
          pos.push(p.x + q.x * o, groundY(T, i, o) + Math.sin(ang) * radius * 0.75 + lift, p.z + q.z * o);
        }
        if (k > 0) for (let a = 0; a < SEG; a++) {
          const b0 = (k - 1) * (SEG + 1) + a, b1 = k * (SEG + 1) + a;
          idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = m === rock;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    for (let k = 0; k < idxs.length; k += 6) { // Lampen an der Decke
      const i = idxs[k], p = T.pts[i];
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.5), lamp);
      l.position.set(p.x, T.h[i] + (T.wallOff[0][i] + 0.3) * 0.75 - 0.2, p.z);
      l.rotation.y = -Math.atan2(T.tan[i].z, T.tan[i].x);
      scene.add(l);
    }
  }
}

function gridSlot(T, k) {
  // Startaufstellung hinter der Linie, abwechselnd links und rechts
  const tp = trackPoint(T, -10 - k * 9);
  const lat = k % 2 ? -3.4 : 3.4;
  return { s: -10 - k * 9, lat, pos: tp.p.clone().addScaledVector(tp.nrm, lat), fwd: tp.t, y: groundY(T, tp.i, lat) };
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
    new THREE.MeshStandardMaterial({ map: billboardTexture('CAR-SAVER GP', '#c0392b', '#fff') }),
    new THREE.MeshStandardMaterial({ map: billboardTexture('CAR-SAVER GP', '#c0392b', '#fff') }),
  ]);
  sign.position.set(0, 9, (WALL + 4) * sgn);
  g.add(sign);
  g.position.set(s0.p.x - 30, 0, s0.p.z);
  g.rotation.y = -Math.atan2(s0.t.z, s0.t.x);
  scene.add(g);
}

// ---------- Landschaft: Wiesen, Wälder, Hügel und Berge mit Schnee ----------
const CX = 35, CZ = 140; // ungefähre Mitte der Strecke

// Abstand eines Punktes zur Strecke (höchstens 200 m) und Mitte der Strecke
function makeTrackDist(T) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of T.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const FAR = 200, step = Math.max(4, Math.round(T.n / 900));
  const trackDist = (x, z) => {
    if (x < x0 - FAR || x > x1 + FAR || z < z0 - FAR || z > z1 + FAR) return FAR;
    let best = Infinity;
    for (let i = 0; i < T.n; i += step) best = Math.min(best, (T.pts[i].x - x) ** 2 + (T.pts[i].z - z) ** 2);
    return Math.min(FAR, Math.sqrt(best));
  };
  return { trackDist, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

function makeLand(T) {
  const N = makeNoise(5);
  const { trackDist } = makeTrackDist(T);
  const forest = (x, z) => N.fbm(x / 220 + 5, z / 220 + 9, 3);
  // Rund um die Strecke flach, dahinter sanfte Hügel, ganz aussen hohe Berge
  const height = (x, z) => {
    const r = Math.hypot(x - CX, z - CZ);
    const roll = (N.fbm(x / 260, z / 260, 4) - 0.42) * (12 + 55 * smoothstep(250, 1000, r));
    const ridge = 1 - Math.abs(2 * N.fbm(x / 520 + 7, z / 520 + 3, 4) - 1);
    const mount = ridge * ridge * 520 * smoothstep(850, 1750, r);
    return (roll + mount) * smoothstep(55, 175, trackDist(x, z));
  };
  const C = hex => new THREE.Color(hex);
  const grassA = C(0x5e9142), grassB = C(0x4a7c35), dry = C(0x9a965a), wood = C(0x2e5a2c),
    rock = C(0x857b70), rockDark = C(0x5e5852), snow = C(0xf3f6fa), alpine = C(0x7d8a5a);
  const color = (x, z, y, steep, c) => {
    c.lerpColors(grassA, grassB, N.fbm(x / 90, z / 90, 3));
    c.lerp(dry, smoothstep(0.55, 0.75, N.fbm(x / 400 + 11, z / 400, 3)) * 0.6);
    c.lerp(wood, smoothstep(0.48, 0.58, forest(x, z)) * 0.85 * (1 - smoothstep(160, 260, y)));
    c.lerp(alpine, smoothstep(150, 260, y) * 0.7);
    const rk = smoothstep(0.16, 0.34, steep) + smoothstep(260, 380, y) * 0.6;
    if (rk > 0) c.lerp(rock.clone().lerp(rockDark, N.noise(x / 40, z / 40)), Math.min(1, rk));
    const line = 330 + (N.noise(x / 120, z / 120) - 0.5) * 120;
    c.lerp(snow, smoothstep(line, line + 50, y) * (1 - smoothstep(0.4, 0.6, steep)));
  };
  // Feine Grashalme als Detail (wird mit den Geländefarben eingefärbt)
  const r = rng(8);
  const detail = surface(256, (u, v) => {
    const n = N.fbm(u * 16, v * 16, 4, 16), blade = r();
    const k = 200 + n * 40 + blade * 15;
    return [k, k + 3, k - 8, n * 0.6 + blade * 0.5];
  }, 3);
  const mesh = terrain({ size: 4600, segments: 220, center: [CX, CZ], height, color, detail, detailRepeat: 300 });
  mesh.material.normalScale.set(0.35, 0.35);
  return { mesh, height, trackDist, forest };
}

// Bäume (Laub- und Nadelbäume) und Büsche. Nahe Bäume werfen Schatten, ferne nicht (spart Rechenzeit).
function treeSet(max, shadow, detail) {
  const crownGeo = mergeGeometries([[0, 0, 0, 2.6], [1.3, -0.6, 0.6, 1.9], [-1.1, -0.4, -0.8, 2.0], [0.2, 1.4, -0.3, 1.8]]
    .map(([x, y, z, rad]) => new THREE.IcosahedronGeometry(rad, detail).translate(x, y, z)));
  const pineGeo = mergeGeometries([[2.6, 4.2, 0], [2.0, 3.6, 2.4], [1.3, 3.0, 4.6]]
    .map(([rad, h, y]) => new THREE.ConeGeometry(rad, h, detail ? 8 : 6, 1, true).translate(0, y, 0).toNonIndexed()));
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true });
  const set = {
    trunks: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 3, 6), mat(0x5b4030), max),
    crowns: new THREE.InstancedMesh(crownGeo, mat(0xffffff), max),
    pines: new THREE.InstancedMesh(pineGeo, mat(0xffffff), max),
    bushes: new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.2, detail), mat(0xffffff), max),
  };
  for (const m of Object.values(set)) { m.castShadow = shadow; m.count = 0; }
  return set;
}

function buildTrees(scene, land) {
  const near = treeSet(1400, true, 1), far = treeSet(2200, false, 0);
  const r = rng(21), N = makeNoise(9);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const put = (mesh, x, y, z, sx, sy, sz, h, s, l) => {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    m.compose(pos.set(x, y, z), q, sc.set(sx, sy, sz));
    mesh.setMatrixAt(mesh.count, m);
    if (h !== undefined) mesh.setColorAt(mesh.count, color.setHSL(h, s, l));
    mesh.count++;
  };
  for (let tries = 0; tries < 40000; tries++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 1500;
    const x = CX + Math.cos(a) * rad, z = CZ + Math.sin(a) * rad;
    const d = land.trackDist(x, z);
    if (d < WALL + 4 || (Math.abs(z) < 75 && x > -170 && x < 120)) continue; // nicht auf Strecke, Tribüne oder Boxen
    const inWood = land.forest(x, z) > 0.52;
    const nearTrack = d < 150;
    if (r() > (inWood ? 0.9 : nearTrack ? 0.12 : 0.03)) continue;
    const y = land.height(x, z);
    if (y > 240) continue;
    if (y > 15 && Math.abs(land.height(x + 6, z) - y) + Math.abs(land.height(x, z + 6) - y) > 7) continue; // zu steil
    const set = nearTrack ? near : far;
    if (set.trunks.count >= set.trunks.instanceMatrix.count) continue;
    q.setFromAxisAngle(up, r() * 6.3);
    const s = 0.9 + r() * 0.9;
    if (d < WALL + 30 && r() < 0.5) { // Büsche am Streckenrand
      const b = 0.7 + r() * 0.9;
      put(set.bushes, x, y + 0.5 * b, z, b * 1.3, b * 0.8, b * 1.1, 0.24 + r() * 0.08, 0.45, 0.08 + r() * 0.05);
      continue;
    }
    const pine = y > 90 || r() < (N.noise(x / 300, z / 300) > 0.5 ? 0.7 : 0.25);
    put(set.trunks, x, y + 1.4 * s, z, s, s, s);
    if (pine) put(set.pines, x, y + 3.0 * s, z, s, s * (1 + r() * 0.3), s, 0.31 + r() * 0.05, 0.4, 0.06 + r() * 0.04);
    else put(set.crowns, x, y + 5.2 * s, z, s, s * (0.9 + r() * 0.3), s, 0.22 + r() * 0.09, 0.5, 0.09 + r() * 0.06);
  }
  for (const mesh of Object.values(far)) mesh.layers.set(1);
  for (const set of [near, far]) for (const mesh of Object.values(set)) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
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
#race .mirror { position: absolute; top: 10px; border: 3px solid #15161a; border-radius: 10px; margin: -3px;
  box-shadow: 0 2px 10px rgba(0,0,0,.5); pointer-events: none; }
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
    <div class="top"><div class="pill pos">P6/6</div><div class="pill lap">Runde 1/3</div></div>
    <canvas class="minimap" width="170" height="120"></canvas>
    <button class="quit" title="Rennen beenden">✕</button>
    <div class="lights"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="mirror"></div>
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
    lights: [...root.querySelectorAll('.lights span')], lightBox: $('.lights'), minimap: $('.minimap'), quit: $('.quit'), mirror: $('.mirror'),
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
// net (nur online): { mySlot, startAt, serverNow(), remotes: [{ slot, name, v }], send(state), latest(slot) } – siehe online.js
export function startRace({ player, opponents, kinds, topSpeed, onFinish, net = null, track = 'gp' }) {
  if (R && R.lost) { // Grafik ist abgestürzt (z.B. zu wenig Speicher auf dem Handy): alles neu aufbauen
    R.renderer.domElement.remove();
    R.ui.root.remove();
    R = null;
  }
  if (!R) {
    R = { renderer: makeRenderer(), worlds: {} };
    R.env = new THREE.PMREMGenerator(R.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    R.ui = buildDom();
    R.renderer.domElement.className = 'r3d';
    R.ui.root.prepend(R.renderer.domElement);
    R.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      R.lost = true;
      if (race) endRace(true);
    });
    window.addEventListener('resize', () => R && !R.ui.root.hidden && layout());
  }
  const def = TRACKS.find(t => t.id === track) || TRACKS[0];
  for (const id of Object.keys(R.worlds)) if (id !== def.id) { disposeWorld(R.worlds[id]); delete R.worlds[id]; } // nur eine Strecke im Speicher
  if (!R.worlds[def.id]) R.worlds[def.id] = buildWorld(def, R.renderer);
  Object.assign(R, R.worlds[def.id]); // aktuelle Strecke: Szene, Kamera, Sonne, Strecke …
  R.renderer.toneMappingExposure = THEMES[def.theme].exposure;
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
  if (net) for (const p of net.remotes) { // Mitspieler: Position kommt übers Netz
    const g = gridSlot(T, p.slot);
    cars.push({ v: p.v, name: p.name, isRemote: true, slot: p.slot, pos: g.pos.clone(), heading: Math.atan2(g.fwd.z, g.fwd.x),
      speed: 0, idx: nearestIndex(T, g.pos, 0), prog: g.s, mesh: buildCar(p.v, kinds), finished: null, color: p.v.special ? '#ffd700' : p.v.color });
  }
  const pg = gridSlot(T, net ? net.mySlot : grid.length);
  const me = { v: player, name: player.name, ai: false, pos: pg.pos.clone(), heading: Math.atan2(pg.fwd.z, pg.fwd.x),
    speed: 0, steer: 0, idx: nearestIndex(T, pg.pos, 0), prog: pg.s, maxV: topSpeed(player.ps), acc: accelFor(player.ps),
    mesh: buildCar(player, kinds), finished: null, wrongT: 0 };
  cars.push(me);
  for (const c of cars) R.scene.add(c.mesh);
  warmUp(R.renderer, R.scene, R.camera);
  if (!R.quality) R.quality = makeQuality(R.renderer, layout);

  window.__race = () => race; // für Tests im Browser
  window.__raceR = () => R;
  race = { cars, me, T, t: 0, phase: 'lights', lightsOut: net ? 4 : 3.4 + Math.random() * 0.8, clock: 0, input: {}, onFinish,
    lastLights: 0, msgT: 0, endT: 0, lastLap: 1, last: performance.now(), net, sendT: 0, bumpT: 0, waitT: 0, crashT: 0, gears: gearbox(player.kind), laps: T.laps };
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
  const dt = Math.max(0, Math.min(0.05, (now - race.last) / 1000));
  R.quality((now - race.last) / 1000);
  race.last = now;
  step(dt);
  if (!race) return; // Rennen ist gerade zu Ende gegangen
  render(dt);
  requestAnimationFrame(loop);
}

function step(dt) {
  const { T, me, input } = race;
  if (race.net) race.t = (race.net.serverNow() - race.net.startAt) / 1000; // gemeinsame Uhr: Ampel überall gleichzeitig
  else race.t += dt;
  if (race.msgT > 0 && (race.msgT -= dt) <= 0) R.ui.msg.textContent = '';
  if (race.net) netTick(dt);

  // Startampel: fünf rote Lichter gehen an, dann alle aus = LOS!
  if (race.phase === 'lights') {
    if (race.t < 0 && race.msgT <= 0) showMsg('Gleich geht es los …', 0.5);
    const on = Math.max(0, Math.min(5, Math.floor(race.t / 0.6)));
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
  if (race.net) race.clock = race.t - race.lightsOut; else race.clock += dt;
  race.crashT -= dt;

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
  const grip = T.gripEff[me.idx];
  const yawMax = Math.min(1.5, grip / Math.max(Math.abs(me.speed), 0.1));
  // Für die Geräusche: Untergrund und wie stark die Reifen rutschen (Kurve am Limit oder Vollbremsung)
  const al = Math.abs(lat), curvyHere = T.curv[me.idx] > 0.012;
  me.surface = al <= TRACK_W / 2 ? 'asphalt' : curvyHere && al <= TRACK_W / 2 + 1.4 ? 'kerb' : curvyHere && al <= TRACK_W / 2 + 9 ? 'gravel' : 'grass';
  // Randsteine: die Räder (0,9 m neben der Mitte) berühren sie schon, bevor das Auto ganz drauf ist
  me.kerb = curvyHere && al > TRACK_W / 2 - 0.9 && al < TRACK_W / 2 + 2.3;
  // In Kurven quietscht es erst ganz am Limit der Reifen (GRIP), beim Bremsen sofort
  const latA = Math.abs(me.steer) * yawMax * Math.abs(me.speed);
  me.slip = 0.7 * Math.min(1, Math.max(0, (latA - (grip - 1.2)) / 1.2)) * Math.min(1, Math.max(0, (Math.abs(me.speed) - 18) / 8));
  if (brake && me.speed > 6) me.slip = Math.max(me.slip, 0.45 + 0.55 * Math.min(1, me.speed / 45));
  if (Math.abs(me.speed) > 0.3) me.heading += me.steer * yawMax * dt * Math.sign(me.speed);
  me.pos.x += Math.cos(me.heading) * me.speed * dt;
  me.pos.z += Math.sin(me.heading) * me.speed * dt;
  me.speed -= 9.81 * 0.6 * tilt(me).grade * dt; // bergauf langsamer, bergab schneller

  const before = me.idx;
  me.idx = nearestIndex(T, me.pos, me.idx);
  let d = T.dist[me.idx] - T.dist[before];
  if (d < -T.length / 2) d += T.length;
  if (d > T.length / 2) d -= T.length;
  me.prog += d;

  if (race.net) bumpRemotes(dt);

  // Reifenstapel: nicht durchfahren
  const nrm = T.nor[me.idx], p = T.pts[me.idx];
  const lat2 = (me.pos.x - p.x) * nrm.x + (me.pos.z - p.z) * nrm.z;
  const limit = lat2 > 0 ? T.wallOff[1][me.idx] - 1.2 : -(T.wallOff[0][me.idx] - 1.2);
  if (Math.abs(lat2) > Math.abs(limit)) {
    me.pos.x -= nrm.x * (lat2 - limit);
    me.pos.z -= nrm.z * (lat2 - limit);
    if (Math.abs(me.speed) > 8 && race.crashT <= 0) { crash(Math.abs(me.speed) / 35, 'tyres'); race.crashT = 0.4; }
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
    c.wp = aiPos(c);
  }

  // Zusammenstoss mit Gegnern: wegschieben und abbremsen
  for (const c of race.cars) {
    if (!c.ai) continue;
    const cp = c.wp;
    if (Math.abs((cp.y || 0) - (me.y || 0)) > 3) continue; // z.B. unter der Brücke
    const dx = me.pos.x - cp.x, dz = me.pos.z - cp.z, dd = Math.hypot(dx, dz);
    const minD = (me.mesh.userData.radius + c.mesh.userData.radius) * 0.85;
    if (dd < minD && dd > 0.01) {
      me.pos.x += dx / dd * (minD - dd);
      me.pos.z += dz / dd * (minD - dd);
      if (me.prog < c.prog) me.speed *= 0.97; else c.speed *= 0.97;
      if (race.crashT <= 0) { crash(0.15 + Math.abs(me.speed - c.speed) / 20, 'car'); race.crashT = 0.5; }
    }
  }

  // Runden und Ziel
  const total = race.laps * T.length;
  for (const c of race.cars) {
    if (c.isRemote) continue; // Mitspieler melden ihre Zielzeit selbst
    if (!c.finished && c.prog >= total) {
      c.finished = race.clock;
      if (c === me) {
        const place = race.cars.filter(o => o.finished && o.finished <= race.clock).length;
        showMsg(place === 1 ? '🏆 SIEG!' : '🏁 ZIEL! Platz ' + place, 4);
        if (race.net) race.waitT = 25; else race.endT = 3.2;
      }
    }
  }
  if (race.net && me.finished && !race.endT) { // online: warten, bis alle im Ziel sind (höchstens 25 s)
    race.waitT -= dt;
    const open = race.cars.some(c => c.isRemote && !c.finished && !c.gone);
    if (!open || race.waitT <= 0) race.endT = 2.5;
  }
  const lapNow = Math.min(race.laps, Math.max(1, Math.floor(me.prog / T.length) + 1));
  if (lapNow > race.lastLap && !me.finished) {
    race.lastLap = lapNow;
    showMsg(lapNow === race.laps ? 'Letzte Runde!' : 'Runde ' + lapNow, 1.6);
  }
  if (race.endT > 0 && (race.endT -= dt) <= 0) { endRace(false); return; }

  placeCars();
  updateHud();
}

// ---------- Online: Mitspieler ----------
// Eigenen Zustand 10× pro Sekunde senden; Mitspieler weich zur gemeldeten (und vorausberechneten) Position ziehen
function netTick(dt) {
  const n = race.net, me = race.me;
  if ((race.sendT -= dt) <= 0) {
    race.sendT = 0.1;
    n.send({ x: +me.pos.x.toFixed(2), z: +me.pos.z.toFixed(2), h: +me.heading.toFixed(3), v: +me.speed.toFixed(2),
      p: +me.prog.toFixed(1), fin: me.finished ? +me.finished.toFixed(3) : 0 });
  }
  const now = n.serverNow(), k = 1 - Math.exp(-dt * 12);
  for (const c of race.cars) {
    if (!c.isRemote) continue;
    const s = n.latest(c.slot);
    const stale = !s || now - s.t > 6000;
    if (stale) {
      if (race.phase === 'race' && race.clock > 6 && !c.finished && !c.gone) { c.gone = true; showMsg('📡 ' + c.name + ' ist weg', 2); }
      continue;
    }
    c.gone = false;
    const age = Math.min(0.5, Math.max(0, (now - s.t) / 1000));
    const tx = s.x + Math.cos(s.h) * s.v * age, tz = s.z + Math.sin(s.h) * s.v * age;
    if (Math.hypot(tx - c.pos.x, tz - c.pos.z) > 15) c.pos.set(tx, 0, tz);
    else { c.pos.x += (tx - c.pos.x) * k; c.pos.z += (tz - c.pos.z) * k; }
    const dh = Math.atan2(Math.sin(s.h - c.heading), Math.cos(s.h - c.heading));
    c.heading += dh * k;
    c.speed = s.v;
    c.prog = s.p + s.v * age;
    c.idx = nearestIndex(race.T, c.pos, c.idx);
    if (s.fin) c.finished = s.fin;
  }
}

// Zusammenstoss mit Mitspielern: jedes Gerät schiebt sein eigenes Auto weg, beide gleich stark.
// Wer auffährt, wird langsamer; wer angeschoben wird, bekommt etwas Schwung.
function bumpRemotes(dt) {
  const me = race.me;
  race.bumpT -= dt;
  for (const c of race.cars) {
    if (!c.isRemote || c.gone || Math.abs((c.y || 0) - (me.y || 0)) > 3) continue;
    const dx = me.pos.x - c.pos.x, dz = me.pos.z - c.pos.z, dd = Math.hypot(dx, dz);
    const minD = (me.mesh.userData.radius + c.mesh.userData.radius) * 0.85;
    if (dd >= minD || dd < 0.01) continue;
    const push = (minD - dd) * 0.6;
    me.pos.x += dx / dd * push;
    me.pos.z += dz / dd * push;
    const ahead = -(Math.cos(me.heading) * dx + Math.sin(me.heading) * dz); // > 0: der andere ist vor mir
    if (ahead > 0 && me.speed > c.speed) me.speed = Math.max(0, me.speed * 0.55 + c.speed * 0.45 - 1);
    else if (ahead < 0 && c.speed > me.speed) me.speed += (c.speed - me.speed) * 0.35;
    if (race.bumpT <= 0) { race.bumpT = 0.5; crash(0.15 + Math.abs(me.speed - c.speed) / 20, 'car'); }
  }
}

function latOf(c) {
  const T = race.T, p = T.pts[c.idx], q = T.nor[c.idx];
  return (c.pos.x - p.x) * q.x + (c.pos.z - p.z) * q.z;
}

function aiPos(c) {
  const tp = trackPoint(race.T, c.prog);
  return { x: tp.p.x + tp.nrm.x * c.lat, z: tp.p.z + tp.nrm.z * c.lat, t: tp.t, y: tp.y + c.lat * race.T.slope[tp.i], i: tp.i };
}

// Neigung unter einem Auto: grade = Steigung in Fahrtrichtung, right = Neigung nach rechts
function tilt(c, idx = c.idx, heading = c.heading) {
  const T = race.T, i = idx, d = heading - Math.atan2(T.tan[i].z, T.tan[i].x);
  const cd = Math.cos(d), sd = Math.sin(d);
  return { grade: T.grade[i] * cd + T.slope[i] * sd, right: -T.grade[i] * sd + T.slope[i] * cd };
}

function placeCars() {
  for (const c of race.cars) {
    const m = c.mesh;
    let x, z, heading, y, idx;
    if (c.ai) {
      const p = c.wp || (c.wp = aiPos(c));
      x = p.x; z = p.z; heading = Math.atan2(p.t.z, p.t.x); y = p.y; idx = p.i;
    } else {
      x = c.pos.x; z = c.pos.z; heading = c.heading; idx = c.idx;
      y = c.y = groundY(race.T, idx, latOf(c));
    }
    const tl = tilt(c, idx, heading);
    m.position.set(x, y, z);
    m.rotation.order = 'YZX';
    m.rotation.set(-Math.atan(tl.right), -heading, Math.atan(tl.grade));
    const spin = (c.speed || 0) * 0.016 / 0.35;
    for (const w of m.userData.wheels) w.rotation.z -= spin;
    if (c === race.me) { // Vorderräder lenken mit
      for (const w of m.userData.wheels) if (w.position.x > 0) w.rotation.y = -c.steer * 0.4;
    }
    animateCar(m, race.t, c.v.special, c.fly);
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
  R.ui.lap.textContent = 'Runde ' + Math.min(race.laps, Math.max(1, Math.floor(race.me.prog / race.T.length) + 1)) + '/' + race.laps;
  R.ui.kmh.textContent = Math.round(Math.abs(race.me.speed) * 3.6);
  engineSound();
  drawMinimapCars();
}

// ---------- Kamera und Zeichnen ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camWant = new THREE.Vector3(), camAhead = new THREE.Vector3();
function snapCamera() {
  const { me } = race;
  const my = groundY(race.T, me.idx, 0);
  camPos.set(me.pos.x - Math.cos(me.heading) * 9, my + 3.4, me.pos.z - Math.sin(me.heading) * 9);
  camLook.set(me.pos.x, my + 1.2, me.pos.z);
  R.camera.position.copy(camPos);
}

function render(dt) {
  const { me } = race;
  const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
  const back = 8.5 + Math.abs(me.speed) * 0.03;
  const my = me.y || 0;
  const want = camWant.set(me.pos.x - fx * back, my + 3.2 + Math.abs(me.speed) * 0.01, me.pos.z - fz * back);
  R.camera.position.lerp(want, 1 - Math.exp(-dt * 6));
  camLook.lerp(camAhead.set(me.pos.x + fx * 6, my + 1.2, me.pos.z + fz * 6), 1 - Math.exp(-dt * 10));
  R.camera.lookAt(camLook);
  R.camera.fov = 62 + Math.min(18, Math.abs(me.speed) * 0.16);
  R.camera.updateProjectionMatrix();
  // Sonne folgt dem Spieler, damit Schatten scharf bleiben
  R.sun.position.set(me.pos.x + R.sunDir.x * 150, my + Math.max(40, R.sunDir.y * 150), me.pos.z + R.sunDir.z * 150);
  R.sun.target.position.set(me.pos.x, my, me.pos.z);
  R.clouds.position.set(R.camera.position.x, 0, R.camera.position.z);
  R.update(dt, race.t, R.camera);
  R.renderer.render(R.scene, R.camera);
  renderMirror(me);
}

// ---------- Rückspiegel ----------
// Kleines Bild nach hinten, oben in der Mitte: gespiegelt wie ein echter Spiegel, ohne ferne Kulisse,
// mit kleiner Auflösung und nur jedes zweite Bild neu berechnet (spart Rechenzeit).
const mirrorSize = new THREE.Vector2();
function renderMirror(me) {
  const r = R.renderer;
  if (!R.mirror) {
    const rt = new THREE.WebGLRenderTarget(360, 120, { type: THREE.HalfFloatType });
    rt.texture.repeat.x = -1; rt.texture.offset.x = 1; // links und rechts tauschen = Spiegel
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: rt.texture })));
    const cam = new THREE.PerspectiveCamera(50, 3, 0.5, 6000); // nur Ebene 0: ohne ferne Bäume und Wolken
    R.mirror = { rt, scene, cam, flat: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), frame: 0 };
  }
  const M = R.mirror;
  if (M.frame++ % 2 === 0) {
    const fx = Math.cos(me.heading), fz = Math.sin(me.heading);
    const my = me.y || 0;
    M.cam.position.set(me.pos.x + fx * 0.4, my + 1.45, me.pos.z + fz * 0.4);
    M.cam.lookAt(me.pos.x - fx * 40, my + 0.9, me.pos.z - fz * 40);
    me.mesh.visible = false; // das eigene Auto nicht im Spiegel
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(M.rt);
    r.render(R.scene, M.cam);
    r.setRenderTarget(null);
    r.shadowMap.autoUpdate = true;
    me.mesh.visible = true;
  }
  r.getSize(mirrorSize);
  const w = Math.round(Math.min(330, mirrorSize.x * 0.3)), h = Math.round(w / 3);
  const x = Math.round((mirrorSize.x - w) / 2), y = mirrorSize.y - h - 10;
  r.autoClear = false;
  r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.setScissorTest(true);
  r.render(M.scene, M.flat);
  r.setScissorTest(false); r.setViewport(0, 0, mirrorSize.x, mirrorSize.y);
  r.autoClear = true;
  const st = R.ui.mirror.style;
  if (st.width !== w + 'px') Object.assign(st, { width: w + 'px', height: h + 'px', left: x + 'px' });
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
  // Ziel: schwarz-weisser Balken quer über die Strecke und eine Zielflagge daneben
  const [fx, fy] = mapInfo.map(T.pts[0].x, T.pts[0].z), n = T.nor[0], len = 16;
  const ux = n.x, uy = n.z; // Querrichtung (auf der Karte gleich wie in der Welt)
  b.lineWidth = 5; b.lineCap = 'butt';
  for (let k = 0; k < 4; k++) {
    const a0 = -len / 2 + k * len / 4, a1 = a0 + len / 4;
    b.strokeStyle = k % 2 ? '#111' : '#fff';
    b.beginPath(); b.moveTo(fx + ux * a0, fy + uy * a0); b.lineTo(fx + ux * a1, fy + uy * a1); b.stroke();
  }
  b.strokeStyle = '#111'; b.lineWidth = 1;
  b.strokeRect(Math.min(fx - ux * len / 2, fx + ux * len / 2) - 2.5 * Math.abs(uy), Math.min(fy - uy * len / 2, fy + uy * len / 2) - 2.5 * Math.abs(ux),
    Math.abs(ux * len) + 5 * Math.abs(uy), Math.abs(uy * len) + 5 * Math.abs(ux));
  b.font = '15px system-ui, sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle';
  b.fillText('🏁', fx + ux * (len / 2 + 10), fy + uy * (len / 2 + 10));
  mapInfo.base = base;
  g.clearRect(0, 0, cvs.width, cvs.height);
  g.drawImage(base, 0, 0);
}

function drawMinimapCars() {
  const cvs = R.ui.minimap, g = cvs.getContext('2d');
  g.clearRect(0, 0, cvs.width, cvs.height);
  g.drawImage(mapInfo.base, 0, 0);
  for (const c of race.cars) {
    const p = c.ai ? c.wp : c.pos;
    const [x, y] = mapInfo.map(p.x, p.z);
    const mine = c === race.me;
    g.fillStyle = mine ? '#ffe066' : c.color;
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, mine ? 6 : 4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

// ---------- Motorgeräusch ----------
// Geräusche: eigener Motor mit Gängen, Reifen, Untergrund, Wind und der Motor des nächsten Gegners (sound.js)
function startEngine() {
  if (R.snd) R.snd.stop();
  R.snd = createCarSound({ kind: race.me.v.kind });
}
function engineSound() {
  if (!R.snd) return;
  const me = race.me, g = race.gears(me.speed, me.maxV);
  let near = null, nd = Infinity;
  for (const c of race.cars) {
    if (c === me) continue;
    const p = c.ai ? c.wp : c.pos;
    if (!p) continue;
    const d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
    if (d < nd) { nd = d; near = c; }
  }
  const otherFrac = near ? 0.15 + 0.8 * ((Math.abs(near.speed || 0) / ((near.maxV || 50) / 6)) % 1) : 0.1;
  R.snd.update({
    frac: race.phase === 'lights' ? 0.05 + (race.input.gas ? 0.5 : 0) : g.frac, kerb: race.phase === 'race' && !!me.kerb,
    throttle: race.input.gas && !me.finished ? 1 : 0.15,
    speed: me.speed, slip: race.phase === 'race' ? me.slip || 0 : 0, surface: me.surface || 'asphalt',
    other: near ? { dist: nd, frac: otherFrac, kind: near.v.kind } : null, dt: 1 / 60,
  });
}
function stopEngine() {
  if (R.snd) { R.snd.stop(); R.snd = null; }
}

// ---------- Ende ----------
function endRace(quit) {
  const r = race;
  race = null;
  stopEngine();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  for (const c of r.cars) {
    R.scene.remove(c.mesh); // Formen gehören der Vorlage in cars3d.js: nicht freigeben
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

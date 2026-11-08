// Fotos der 3D-Fahrzeuge für die Menüs (Fahrzeugpark, Shop, Garage, Dragster …): jedes Fahrzeug wird einmal
// schräg von vorne gerendert und danach als Bild gezeichnet. Wird von game.js nachgeladen; ohne three.js bleibt 2D.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar } from './cars3d.js';

const SIZES = { small: [320, 160], big: [640, 320] }; // Seitenverhältnis 2:1
const MAX = 90; // so viele Bilder bleiben im Speicher (wichtig auf dem Handy)
const GROUND = 0.94; // dort (Anteil der Bildhöhe) stehen die Räder

let R = null, scene, cam;
function setup() {
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.35; // die Menüs sind dunkel: Fotos etwas heller
  R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x50505a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 9, 7);
  scene.add(sun);
  cam = new THREE.PerspectiveCamera(22, 2, 0.1, 400);
}

const cache = new Map(), queue = [];
const keyOf = (v, size) => [size, v.kind, v.special || '', v.color || '', JSON.stringify(v.tune || {})].join('|');

// Liefert das Foto (Canvas) oder null, solange es noch nicht fertig ist (es kommt dann in die Warteschlange)
export function photo(v, kinds, size = 'small') {
  const k = keyOf(v, size), c = cache.get(k);
  if (c) { cache.delete(k); cache.set(k, c); return c; } // zuletzt gebraucht = hinten
  if (!queue.some(q => q.k === k)) queue.push({ k, v: { ...v }, kinds, size });
  return null;
}

// Fotos machen, aber pro Bildschirmbild nur ein paar Millisekunden lang (sonst ruckelt das Menü)
export function work(budgetMs = 10) {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < budgetMs) {
    const q = queue.shift();
    try { cache.set(q.k, shoot(q.v, q.kinds, q.size)); } catch (err) { console.warn('Foto ging nicht', err); cache.set(q.k, null); }
    while (cache.size > MAX) cache.delete(cache.keys().next().value);
  }
}

const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };

function shoot(v, kinds, size) {
  if (!R) setup();
  const [pw, ph] = SIZES[size];
  R.setSize(pw, ph, false);
  const car = buildCar(v, kinds);
  animateCar(car, 0, v.special || null, false); // Flammen aus, Teile in Ruhestellung
  car.rotation.y = -0.6; // schräg von vorne
  scene.add(car);
  car.updateMatrixWorld(true);
  // Rahmen um die sichtbaren Teile (ohne Bodenschatten und schwebende Schilder)
  const box = new THREE.Box3(), part = new THREE.Box3();
  car.traverse(o => { if (o.isMesh && o.name !== 'shadow' && shown(o)) box.union(part.setFromObject(o)); });
  const ctr = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length() / 2;
  cam.aspect = pw / ph;
  cam.position.set(ctr.x, ctr.y + rad * 1.2, ctr.z + rad * 4.4);
  cam.lookAt(ctr);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  // Wo landen die Punkte des Fahrzeugs im Bild? Daraus den Ausschnitt wählen: Fahrzeug in der Mitte, Räder unten auf GROUND
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const p = new THREE.Vector3();
  car.traverse(o => {
    if (!o.isMesh || o.name === 'shadow' || !shown(o)) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(cam);
      const px = (p.x + 1) / 2 * pw, py = (1 - p.y) / 2 * ph;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
  });
  const cw = Math.max((x1 - x0) * 1.06, (y1 - y0) * 1.12 * (pw / ph)), ch = cw * ph / pw;
  cam.setViewOffset(pw, ph, (x0 + x1) / 2 - cw / 2, y1 - ch * GROUND, cw, ch);
  R.render(scene, cam);
  cam.clearViewOffset();
  scene.remove(car);
  const out = document.createElement('canvas');
  out.width = pw; out.height = ph;
  out.getContext('2d').drawImage(R.domElement, 0, 0);
  out.ground = GROUND;
  out.fill = (x1 - x0) / cw; // so viel der Bildbreite nimmt das Fahrzeug ein
  return out;
}

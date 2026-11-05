// 3D-Ansicht eines Fahrzeugs: steht auf einer Drehscheibe, dreht sich langsam; mit dem Finger (oder der Maus)
// rundherum drehen, mit zwei Fingern oder dem Mausrad zoomen. Wird von game.js erst beim Öffnen geladen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, animateCar } from './cars3d.js';

const CSS = `
#viewer3d { position: fixed; z-index: 60; background: radial-gradient(circle at 50% 40%, #2a3146, #0d0f15 75%); touch-action: none;
  font-family: system-ui, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; transform-origin: center center; }
#viewer3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#viewer3d .vtitle { position: absolute; top: 14px; left: 0; right: 0; text-align: center; font-weight: 900; font-size: 26px; pointer-events: none; }
#viewer3d .vtitle small { display: block; font-size: 15px; font-weight: 700; opacity: .8; margin-top: 4px; }
#viewer3d .vclose { position: absolute; top: 12px; right: 14px; width: 46px; height: 46px; border-radius: 50%; border: none;
  background: rgba(255,255,255,.15); color: #fff; font-size: 22px; }
#viewer3d .vhint { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; font-size: 15px; opacity: .7; pointer-events: none; }
`;

let V = null; // offene Ansicht

export function openViewer({ v, kinds, title = '', sub = '', onClose = () => {} }) {
  if (V) closeViewer();
  if (!document.getElementById('viewer3d-css')) {
    const st = document.createElement('style'); st.id = 'viewer3d-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.id = 'viewer3d';
  root.innerHTML = `<div class="vtitle"></div><button class="vclose" title="Schliessen">✕</button>
    <div class="vhint">👆 Mit dem Finger drehen · zwei Finger oder Mausrad: zoomen</div>`;
  root.querySelector('.vtitle').textContent = title;
  if (sub) { const sm = document.createElement('small'); sm.textContent = sub; root.querySelector('.vtitle').append(sm); }
  document.body.appendChild(root);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  root.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x30303a, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(sun);
  // Drehscheibe
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 64), new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: 0.6, roughness: 0.35 }));
  disk.position.y = -0.125; disk.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.05, 8, 80), new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.5 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
  const table = new THREE.Group();
  table.add(disk, ring);
  scene.add(table);
  const car = buildCar(v, kinds);
  car.traverse(o => { if (o.isMesh) o.castShadow = true; });
  // Auto auf die Mitte stellen
  const box = new THREE.Box3().setFromObject(car), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  car.position.x -= ctr.x; car.position.z -= ctr.z;
  table.add(car);
  const span = Math.max(size.x, size.z, size.y * 1.6);
  table.scale.setScalar(Math.min(1.6, 6 / Math.max(span, 1))); // grosse Fahrzeuge etwas kleiner
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  const look = new THREE.Vector3(0, size.y * table.scale.y * 0.45, 0);
  let yaw = 0.7, pitch = 0.32, dist = 11, spin = 0.25, idle = 0, last = performance.now(), running = true;

  // Bedienung: ziehen = drehen, zwei Finger / Mausrad = zoomen
  const pointers = new Map();
  let pinch = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); idle = 0; });
  el.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const [px, py] = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) {
      let dx = e.clientX - px, dy = e.clientY - py;
      if (rotated) [dx, dy] = [dy, -dx]; // Ansicht ist gedreht (Hochformat)
      yaw -= dx * 0.008; pitch = Math.max(0.02, Math.min(1.35, pitch + dy * 0.006));
      spin = 0; idle = 0;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) dist = Math.max(5, Math.min(22, dist * pinch / d));
      pinch = d;
    }
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
  el.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(5, Math.min(22, dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  const close = () => closeViewer();
  root.querySelector('.vclose').addEventListener('pointerdown', e => { e.preventDefault(); close(); });
  const onKey = e => { if (e.code === 'Escape') close(); };
  window.addEventListener('keydown', onKey);

  // wie das Spiel: im Hochformat um 90° gedreht
  let rotated = false;
  const layout = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    rotated = vh > vw;
    const w = rotated ? vh : vw, h = rotated ? vw : vh;
    Object.assign(root.style, { width: w + 'px', height: h + 'px', left: (vw - w) / 2 + 'px', top: (vh - h) / 2 + 'px', transform: rotated ? 'rotate(90deg)' : 'none' });
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  layout();
  window.addEventListener('resize', layout);

  const frame = now => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if ((idle += dt) > 3) spin = Math.min(0.25, spin + dt * 0.1); // nach einer Weile dreht es sich wieder von selbst
    yaw += spin * dt;
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, Math.sin(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(look);
    animateCar(car, now / 1000, v.special, false);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  V = { root, renderer, scene, onClose, stop() { running = false; window.removeEventListener('keydown', onKey); window.removeEventListener('resize', layout); } };
}

export function closeViewer() {
  if (!V) return;
  const v = V;
  V = null;
  v.stop();
  v.renderer.dispose();
  v.renderer.forceContextLoss(); // Grafikspeicher sofort freigeben (wichtig auf dem Handy)
  v.root.remove();
  v.onClose();
}

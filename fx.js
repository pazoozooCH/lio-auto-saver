// Fahr-Effekte für Stadt, Rennen und Stuntpark: Reifenrauch (Punkte mit eigenem kleinen Shader) und Bremsspuren
// (Ringspeicher aus dunklen Streifen auf dem Boden). puff() bläst eine Rauchwolke, mark() zieht eine Spur.
import * as THREE from 'three';

export function makeEffects(scene) {
  // Rauch: Punkte mit eigener Grösse und Durchsichtigkeit (kleiner eigener Shader)
  const MAXP = 180, pos = new Float32Array(MAXP * 3), alpha = new Float32Array(MAXP), size = new Float32Array(MAXP);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const dg = dot.getContext('2d'), rg = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = rg; dg.fillRect(0, 0, 64, 64);
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: new THREE.CanvasTexture(dot) }, scale: { value: 600 } },
    vertexShader: `attribute float alpha; attribute float psize; uniform float scale; varying float vA;
      void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA;
      void main() { float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.86, 0.86, 0.88, a); }`,
  });
  const smoke = new THREE.Points(geo, smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);
  const parts = Array.from({ length: MAXP }, () => ({ life: 1, max: 1, x: 0, y: -50, z: 0, vx: 0, vz: 0 }));
  let next = 0;
  // Bremsspuren: Ringspeicher aus dunklen Streifen auf dem Boden (älteste werden überschrieben)
  const MAXS = 1200, sp = new Float32Array(MAXS * 12), sIdx = [];
  for (let k = 0; k < MAXS; k++) { const b = k * 4; sIdx.push(b, b + 2, b + 1, b, b + 3, b + 2); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sGeo.setIndex(sIdx);
  const marks = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  marks.frustumCulled = false;
  scene.add(marks);
  let sNext = 0;
  const last = [null, null];
  return {
    puff(x, y, z, vx, vz) {
      const p = parts[next]; next = (next + 1) % MAXP;
      Object.assign(p, { life: 0, max: 1 + Math.random() * 0.8, x, y, z, vx: vx * 0.3 + (Math.random() - 0.5), vz: vz * 0.3 + (Math.random() - 0.5) });
    },
    // k: 0 = linkes, 1 = rechtes Hinterrad; on = Reifen rutschen gerade
    mark(k, x, y, z, on) {
      const L = last[k];
      if (!on) { last[k] = null; return; }
      if (L && Math.hypot(x - L[0], z - L[2]) < 0.35) return;
      if (L && Math.hypot(x - L[0], z - L[2]) < 3) {
        const dx = x - L[0], dz = z - L[2], d = Math.hypot(dx, dz), nx = -dz / d * 0.16, nz = dx / d * 0.16, o = sNext * 12;
        sp.set([L[0] - nx, L[1], L[2] - nz, L[0] + nx, L[1], L[2] + nz, x + nx, y, z + nz, x - nx, y, z - nz], o);
        sNext = (sNext + 1) % MAXS;
        sGeo.attributes.position.needsUpdate = true;
      }
      last[k] = [x, y, z];
    },
    update(dt, camera, renderer) {
      for (let i = 0; i < MAXP; i++) {
        const p = parts[i];
        p.life += dt;
        const t = Math.min(1, p.life / p.max);
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += 0.7 * dt;
        p.vx *= 0.97; p.vz *= 0.97;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        alpha[i] = t >= 1 ? 0 : 0.55 * (1 - t);
        size[i] = 1.2 + t * 3.5;
      }
      geo.attributes.position.needsUpdate = geo.attributes.alpha.needsUpdate = geo.attributes.psize.needsUpdate = true;
      smokeMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    },
    clear() { sp.fill(0); sGeo.attributes.position.needsUpdate = true; for (const p of parts) p.life = p.max; last[0] = last[1] = null; },
  };
}

// Kamera beim Fahren: 0 = hinter dem Auto, 1 = seitlich, 2 = von vorne, 3 = von oben (Taste 📷 oder V wechselt)
export const CAM_NAMES = ['📷 Kamera: hinten', '🪑 Kamera: Fahrersitz', '📷 Kamera: Seite', '📷 Kamera: vorne', '📷 Kamera: oben'];
export const COCKPIT = 1; // Kamera im Kopf des Fahrers (siehe cockpit)
// Wohin die Kamera soll (want) und wohin sie schaut (look) für ein Auto bei (x, y, z) mit Richtung heading.
// back: Abstand für die normale Ansicht; gibt null für Modus 0 zurück (dann rechnet der Modus selbst)
export function camView(mode, x, y, z, heading, want, look) {
  const fx = Math.cos(heading), fz = Math.sin(heading);
  if (mode === 2) { want.set(x - fz * 7.5, y + 2.2, z + fx * 7.5); look.set(x, y + 0.7, z); return true; }
  if (mode === 3) { want.set(x + fx * 8.5, y + 2.4, z + fz * 8.5); look.set(x, y + 0.8, z); return true; }
  if (mode === 4) { want.set(x - fx * 3, y + 26, z - fz * 3); look.set(x + fx * 3, y, z + fz * 3); return true; }
  return false;
}

// Fahrersitz: die Kamera sitzt im Kopf des Fahrers (der ist dann unsichtbar) und schaut durch die Frontscheibe.
// Gibt true zurück, wenn die Kamera gesetzt ist (dann nicht mehr nachführen). eye kommt aus buildCar (cars3d.js).
const eyeV = new THREE.Vector3(), lookV = new THREE.Vector3();
export function cockpit(mesh, cam, on) {
  const u = mesh.userData;
  if (u.driver) u.driver.visible = !on;
  if (cam.userData.near === undefined) cam.userData.near = cam.near;
  const near = on ? 0.12 : cam.userData.near; // Lenkrad und Armaturenbrett sind ganz nah
  if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
  if (!on || !u.eye) return false;
  mesh.updateMatrixWorld(true);
  const [x, y, z] = u.eye;
  cam.position.copy(eyeV.set(x, y, z).applyMatrix4(mesh.matrixWorld));
  cam.lookAt(lookV.set(x + 10, y - 1.5, z).applyMatrix4(mesh.matrixWorld));
  return true;
}

// Fliegen (Fahrzeuge mit fly in KINDS, z.B. LIONEL X; Stadt und Stuntpark): ✈️ oder F hebt ab und landet, ▲ ▼ oder E Q = höher, tiefer.
// Der Modus prüft Hindernisse selbst; hier steckt nur, was überall gleich ist. me: fly, landing, flyWant, flyVy, flyRoll, flyPitch
export const FLY_HTML = `<button class="flybtn" title="Fliegen (F)" hidden>✈️</button>
    <div class="flyctl" hidden><button class="ctl" data-k="up" style="left:16px; bottom:120px">▲</button>
    <button class="ctl" data-k="down" style="left:124px; bottom:120px">▼</button></div>`;
export const flyCss = id => `#${id} .flybtn { position: absolute; right: 228px; bottom: 21px; width: 84px; height: 84px; border-radius: 50%;
  border: 3px solid #7dd3fc; background: rgba(0,0,0,.35); color: #fff; font-size: 34px; touch-action: none; }
#${id} .flybtn[hidden], #${id} .flyctl[hidden] { display: none; }
`;
export const FLY_KEYS = { KeyE: 'up', KeyQ: 'down' };
export const flyHelp = () => '✈️ Abheben! ' + ('ontouchstart' in window ? '▲ ▼' : 'E / Q') + ' = höher / tiefer';
// Abheben, landen oder das Landen abbrechen; y: jetzige Höhe
export function flyToggle(me, y) {
  if (!me.fly) Object.assign(me, { fly: true, landing: false, flyWant: y + 14, flyVy: 0, flyRoll: 0, flyPitch: 0 });
  else if (me.landing) { me.landing = false; me.flyWant = y; }
  else me.landing = true;
}
// Ein Schritt in der Höhe: gibt die neue Höhe zurück; floor = tiefste erlaubte Höhe an dieser Stelle
export function flyStep(me, input, dt, y, floor, max) {
  if (!me.landing) me.flyWant = Math.max(floor + 1, Math.min(max, me.flyWant + ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * 16 * dt));
  let v = Math.max(-16, Math.min(16, ((me.landing ? floor : me.flyWant) - y) * 2.5));
  if (me.landing) v = Math.min(-1.5, Math.max(-9, v)); // am Boden nicht ewig schweben
  me.flyVy += (v - me.flyVy) * Math.min(1, dt * 5);
  me.flyRoll += (me.steer * 0.4 - me.flyRoll) * Math.min(1, dt * 5); // in die Kurve legen
  me.flyPitch += (Math.max(-0.3, Math.min(0.3, me.flyVy * 0.03)) - me.flyPitch) * Math.min(1, dt * 5);
  return Math.max(floor, y + me.flyVy * dt);
}

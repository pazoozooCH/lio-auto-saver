// Lichter und Beulen an einem Auto (für die Stadt und die Review-Seite): Leuchtpunkte und die echten Lampenformen
// (Scheinwerfer, Rück-/Bremslicht, Blinker) sowie Beulen ins Blech. Gleicher Code überall: die Review-Seite zeigt, was die Stadt zeigt.
import * as THREE from 'three';

let lampTexture = null;
function lampTex() {
  if (lampTexture) return lampTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.85)'); r.addColorStop(0.6, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  lampTexture = new THREE.CanvasTexture(c); lampTexture.colorSpace = THREE.SRGBColorSpace;
  return lampTexture;
}
export function makeLamps(mesh) {
  const g = new THREE.Group(); g.name = 'lamps';
  mesh.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert(), b = new THREE.Box3(), m4 = new THREE.Matrix4();
  (mesh.userData.body || mesh).traverseVisible(o => {
    if (!o.isMesh || o.name === 'shadow' || (o.material && o.material.transparent)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.union(o.geometry.boundingBox.clone().applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)));
  });
  if (b.isEmpty()) b.set(new THREE.Vector3(-2.2, 0, -0.9), new THREE.Vector3(2.2, 1.4, 0.9));
  const H = b.max.y - b.min.y, hw = (b.max.z - b.min.z) / 2, zc = (b.max.z + b.min.z) / 2;
  const yh = b.min.y + H * 0.42, yt = b.min.y + H * 0.55, sides = [-1, 1]; // -z = links (Nase zeigt nach +x)
  const spr = (color, size, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.scale.set(size, size, 1); s.position.set(x, y, z); g.add(s); return s;
  };
  // Echte Modelle: Lampen genau dort, wo sie im Modell sitzen (lampPos aus cars3d.js), sonst aus dem Umriss geschätzt
  const lp = mesh.userData.lampPos || {}, pick = (k, i, fb, dx) => {
    let p = lp[k] && lp[k][i]; if (!p) return fb;
    const front = dx > 0, s = sides[i];
    if (front ? p[0] < b.max.x - 0.9 : p[0] > b.min.x + 0.9) return fb; // nicht ganz vorne/hinten: dann lieber aus dem Umriss
    let z = p[2]; if (Math.abs(z - zc) < 0.45) z = zc + s * Math.max(0.45, hw - 0.3); // Lichtband quer über das Auto: an die Seiten
    return [p[0] + dx, p[1], z];
  };
  const head = sides.map((s, i) => pick('head', i, [b.max.x + 0.04, yh, zc + s * (hw - 0.32)], 0.06));
  const tail = sides.map((s, i) => pick('tail', i, [b.min.x - 0.04, yt, zc + s * (hw - 0.3)], -0.06));
  const blF = sides.map((s, i) => pick('blinkF', i, [b.max.x - 0.08, yh, zc + s * (hw - 0.02)], 0.06));
  const blR = sides.map((s, i) => pick('blinkR', i, [b.min.x - 0.02, yt + 0.06, zc + s * (hw - 0.02)], -0.06));
  // Die echten Lampenformen des Modells (lampShapes aus cars3d.js) leuchten selbst: ein leuchtender Überzug genau auf der Lampe
  const shp = mesh.userData.lampShapes, body = mesh.userData.body, shapes = { head: [], tail: [], blinkF: [], blinkR: [] };
  if (shp && body) for (const [k, col] of [['head', 0xfff6e0], ['tail', 0xff1a0a], ['blinkF', 0xff9a10], ['blinkR', 0xff9a10]]) (shp[k] || []).forEach((geo, i) => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide, toneMapped: false }));
    m.scale.setScalar(mesh.userData.lampScale || 1); m.userData.noWarp = true; m.frustumCulled = false; body.add(m); shapes[k][i] = m;
  });
  const L = {
    mesh, g, shapes,
    head: head.map(p => spr(0xfff3d6, 0.55, ...p)),
    tail: tail.map(p => spr(0xff2a14, 0.55, ...p)),
    blinkF: blF.map(p => spr(0xffa21a, 0.5, ...p)),
    blinkR: blR.map(p => spr(0xffa21a, 0.55, ...p)),
    headPos: head.map(p => new THREE.Vector3(p[0] + 0.05, p[1], p[2])), tailX: (tail[0][0] + tail[1][0]) / 2 - 0.5, tailY: (tail[0][1] + tail[1][1]) / 2,
  };
  return L;
}
// Lampen schalten: night 0…1, braking, blink null|'left'|'right'|'hazard', phase (Blinker gerade an), driving (Motor an)
export function setLamps(L, { night = 0, braking = false, blink = null, phase = false, driving = true }) {
  // Leuchtpunkte nur, wo das Modell keine echte Lampenform hat (sonst leuchtet die Lampe selbst; Punkte sassen oft daneben)
  const has = (k, i) => !!(L.shapes[k] && L.shapes[k][i]);
  L.head.forEach((s, i) => { s.material.opacity = driving && !has('head', i) ? night : 0; });
  L.tail.forEach((s, i) => { s.material.opacity = driving && !has('tail', i) ? Math.min(1, night * 0.55 + (braking ? 0.9 : 0)) : 0; s.scale.setScalar(braking ? 0.8 : 0.55); });
  const on = side => phase && (blink === 'hazard' || blink === side);
  [['blinkF', L.blinkF], ['blinkR', L.blinkR]].forEach(([k, pair]) => pair.forEach((s, i) => { s.material.opacity = on(i ? 'right' : 'left') && !has(k, i) ? 1 : 0; }));
  // die echten Lampenformen: Scheinwerfer nachts, Rücklicht nachts schwach / beim Bremsen hell, Blinker im Takt
  const S2 = L.shapes, set = (a, v) => a.forEach(s => { if (s) s.material.opacity = v; });
  set(S2.head, driving ? night * 0.9 : 0);
  set(S2.tail, driving ? Math.min(1, night * 0.45 + (braking ? 0.95 : 0)) : 0);
  [S2.blinkF, S2.blinkR].forEach(pair => pair.forEach((s, i) => { if (s) s.material.opacity = on(i ? 'right' : 'left') ? 1 : 0; }));
}
export function removeLamps(L) {
  if (!L) return;
  L.g.parent && L.g.parent.remove(L.g);
  for (const a of Object.values(L.shapes)) for (const s of a) if (s) { s.parent && s.parent.remove(s); s.material.dispose(); }
}

// Beule: Ecken des getroffenen Teils um den Aufprall nach innen drücken (nur beim eigenen Auto: eigene Kopie der Form)
export function dentAt(hit, strength, dented) {
  const h = hit.object, ws = h.getWorldScale(new THREE.Vector3()).x; // alle Modell-Teile liegen gleich (Kinder derselben Gruppe)
  const c = h.worldToLocal(hit.point.clone()), nl = hit.face.normal, v = new THREE.Vector3();
  const D = (0.05 + 0.07 * strength) * (0.8 + Math.random() * 0.4), R = (0.28 + 0.2 * strength) / ws, Dl = D / ws;
  for (const o of h.parent.children) { // auch Zierleisten, Lichter usw. an der Stelle (sonst Lücken)
    if (!o.isMesh || !o.name.startsWith('part:') || o.material.transparent) continue;
    const gs = o.geometry; if (!gs.boundingSphere) gs.computeBoundingSphere();
    if (gs.boundingSphere.center.distanceTo(c) > gs.boundingSphere.radius + R) continue;
    if (!o.userData.origGeo) {
      o.userData.origGeo = gs; o.geometry = gs.clone(); dented.push(o);
      const na = o.geometry.attributes.normal; // gepackte Richtungen (cars3d.js) zum Neu-Rechnen wieder genau machen
      if (na && na.normalized) { const f = new Float32Array(na.count * 3); for (let i = 0; i < na.count; i++) { f[i * 3] = na.getX(i); f[i * 3 + 1] = na.getY(i); f[i * 3 + 2] = na.getZ(i); } o.geometry.setAttribute('normal', new THREE.BufferAttribute(f, 3)); }
    }
    const g = o.geometry, pos = g.attributes.position; let moved = false;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const d = v.distanceTo(c); if (d >= R) continue;
      const f = (1 - d / R) ** 2; pos.setXYZ(i, v.x - nl.x * Dl * f, v.y - nl.y * Dl * f, v.z - nl.z * Dl * f); moved = true;
    }
    if (moved) { pos.needsUpdate = true; g.computeVertexNormals(); }
  }
  return D * 0.85;
}
export function dropDents(dented) { // Form wieder wie neu (Werkstatt, anderes Auto)
  for (const o of dented) if (o.userData.origGeo) { o.geometry.dispose(); o.geometry = o.userData.origGeo; delete o.userData.origGeo; }
  dented.length = 0;
}

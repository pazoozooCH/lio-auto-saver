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

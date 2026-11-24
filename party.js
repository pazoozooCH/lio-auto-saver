// Geburtstag (Version 200, Wunsch Lionel): alles ist festlich geschmückt, solange das Spiel Version 200 ist –
// mit Version 201 ist es von selbst wieder weg. Testen: ?party an die Adresse hängen.
// makeParty(scene): Ballone steigen auf, Konfetti fällt (wandern mit der Kamera mit), nachts Feuerwerk – für Stadt, Stuntpark, Rennen.
// partyGeo(): Wimpelketten, Ballon-Sträusse, Pfosten als EINE Form mit Ecken-Farben (für die Stadt, wird wie alles verbogen).
// birthdayBanner / birthdayCake: Banner und Torte für die Stadt.
import * as THREE from 'three';

export const PARTY = (() => {
  try { return (window.GAME_VERSION && window.GAME_VERSION.number === 200) || /[?&#]party\b/.test(location.search + location.hash); }
  catch (e) { return false; }
})();
const MOBILE = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
export const PARTY_COLORS = [0xef4444, 0xf59e0b, 0xfacc15, 0x22c55e, 0x06b6d4, 0x3b82f6, 0xa855f7, 0xec4899, 0xffffff];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- Ballone, Konfetti, Feuerwerk rund um die Kamera ----------
export function makeParty(scene, opt = {}) {
  const root = new THREE.Group(); root.userData.noWarp = true; scene.add(root);
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  // Konfetti: kleine bunte Blättchen, fallen und drehen sich; was zu weit weg ist, kommt auf der anderen Seite wieder
  const NC = MOBILE ? 160 : 320, CB = 16, CH = 14;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), NC);
  conf.frustumCulled = false; conf.userData.noWarp = true; root.add(conf);
  const C = [];
  for (let i = 0; i < NC; i++) { C.push({ x: rnd(-CB, CB), y: rnd(-3, CH), z: rnd(-CB, CB), vy: rnd(0.9, 1.8), ph: rnd(0, 6.3), sp: rnd(2, 6), ax: rnd(0, 6.3) }); conf.setColorAt(i, col.setHex(pick(PARTY_COLORS))); }
  // Ballone: glänzend, steigen auf und schaukeln, mit Schnur
  const NB = MOBILE ? 22 : 40, BB = 60;
  const bgeo = new THREE.SphereGeometry(0.45, 16, 12); bgeo.scale(1, 1.18, 1);
  const balls = new THREE.InstancedMesh(bgeo, new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.05 }), NB);
  balls.frustumCulled = false; balls.userData.noWarp = true; root.add(balls);
  const strPos = new Float32Array(NB * 6), str = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.7 }));
  str.geometry.setAttribute('position', new THREE.BufferAttribute(strPos, 3)); str.frustumCulled = false; str.userData.noWarp = true; root.add(str);
  const B = [];
  for (let i = 0; i < NB; i++) { B.push({ x: rnd(-BB, BB), y: rnd(-4, 40), z: rnd(-BB, BB), vy: rnd(1, 2.2), ph: rnd(0, 6.3) }); balls.setColorAt(i, col.setHex(pick(PARTY_COLORS))); }
  // Feuerwerk (nur nachts): ein paar Bündel aus Leuchtpunkten
  const fw = [], FWN = 110, glow = document.createElement('canvas'); glow.width = glow.height = 32;
  { const g = glow.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }
  const glowT = new THREE.CanvasTexture(glow);
  for (let k = 0; k < 4; k++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FWN * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, map: glowT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; pts.userData.noWarp = true; root.add(pts);
    fw.push({ pts, t: 99, v: new Float32Array(FWN * 3), o: new THREE.Vector3() });
  }
  let fwT = 1, first = true; const fwd = new THREE.Vector3();
  const wrap = (v, c, r) => (v - c > r ? v - 2 * r : v - c < -r ? v + 2 * r : v);
  return {
    root,
    update(dt, cam, night = 0, ground = null) {
      const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, t = performance.now() / 1000;
      const gy = ground != null ? ground : cy - 3.5; // Boden ungefähr unter der Kamera
      if (first) { first = false; for (const c of C) { c.x += cx; c.z += cz; c.y += cy; } for (const b of B) { b.x += cx; b.z += cz; b.y += gy; } }
      for (let i = 0; i < NC; i++) {
        const c = C[i];
        c.y -= c.vy * dt; c.x += Math.sin(t * 1.3 + c.ph) * 0.6 * dt; c.z += Math.cos(t * 1.1 + c.ph) * 0.6 * dt;
        c.x = wrap(c.x, cx, CB); c.z = wrap(c.z, cz, CB);
        if (c.y < cy - 5 || c.y > cy + CH + 2) { c.y = cy + CH - Math.random() * 2; }
        e.set(t * c.sp + c.ax, t * c.sp * 0.7, c.ax); q.setFromEuler(e);
        m4.compose(p.set(c.x, c.y, c.z), q, s.set(1, 1, 1)); conf.setMatrixAt(i, m4);
      }
      conf.instanceMatrix.needsUpdate = true;
      q.identity();
      for (let i = 0; i < NB; i++) {
        const b = B[i];
        b.y += b.vy * dt;
        const ox = Math.sin(t * 0.8 + b.ph) * 0.5, oz = Math.cos(t * 0.6 + b.ph) * 0.5;
        const bx = wrap(b.x, cx, BB), bz = wrap(b.z, cz, BB);
        if (bx !== b.x || bz !== b.z || b.y > gy + 55) { b.x = bx; b.z = bz; if (b.y > gy + 55) b.y = gy - 1; }
        m4.compose(p.set(b.x + ox, b.y, b.z + oz), q, s.set(1, 1, 1)); balls.setMatrixAt(i, m4);
        const k = i * 6; strPos[k] = b.x + ox; strPos[k + 1] = b.y - 0.52; strPos[k + 2] = b.z + oz;
        strPos[k + 3] = b.x + ox * 0.4; strPos[k + 4] = b.y - 2.1; strPos[k + 5] = b.z + oz * 0.4;
      }
      balls.instanceMatrix.needsUpdate = true; str.geometry.attributes.position.needsUpdate = true;
      // Feuerwerk
      if (night > 0.35 && (fwT -= dt) <= 0) {
        fwT = rnd(0.7, 2.2);
        const f = fw.find(x => x.t > 2.4);
        if (f) {
          cam.getWorldDirection(fwd); // vor der Kamera (sonst sieht man es kaum)
          const a = Math.atan2(fwd.z, fwd.x) + rnd(-0.7, 0.7), d = rnd(60, 110);
          f.o.set(cx + Math.cos(a) * d, cy + rnd(18, 40), cz + Math.sin(a) * d); f.t = 0;
          f.pts.material.color.setHex(pick(PARTY_COLORS.slice(0, 8)));
          for (let k = 0; k < FWN; k++) { // Kugel: gleichmässig in alle Richtungen
            const u = rnd(-1, 1), w = rnd(0, 6.3), r = Math.sqrt(1 - u * u), sp = rnd(13, 17);
            f.v[k * 3] = Math.cos(w) * r * sp; f.v[k * 3 + 1] = u * sp; f.v[k * 3 + 2] = Math.sin(w) * r * sp;
          }
        }
      }
      for (const f of fw) {
        if (f.t > 2.4) { f.pts.material.opacity = 0; continue; }
        f.t += dt;
        const P = f.pts.geometry.attributes.position, tt = f.t, drag = (1 - Math.exp(-tt * 1.6)) / 1.6;
        for (let k = 0; k < FWN; k++) P.setXYZ(k, f.o.x + f.v[k * 3] * drag, f.o.y + f.v[k * 3 + 1] * drag - 2.5 * tt * tt, f.o.z + f.v[k * 3 + 2] * drag);
        P.needsUpdate = true;
        f.pts.material.opacity = Math.max(0, 1 - tt / 2.4) * night;
      }
    },
    dispose() {
      scene.remove(root);
      root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    },
  };
}

// ---------- Fester Schmuck (eine Form mit Ecken-Farben) ----------
export function partyGeo() {
  const P = [], N = [], Co = [], c = new THREE.Color();
  const tri = (a, b, d, hex) => {
    c.setHex(hex);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, d]) { P.push(v[0], v[1], v[2]); N.push(nx, ny, nz); Co.push(c.r, c.g, c.b); }
  };
  const quad = (a, b, d, e2, hex) => { tri(a, b, d, hex); tri(a, d, e2, hex); };
  const box = (x, y, z, w, h, d, hex) => { // achsenparallel
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex);
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], hex);
  };
  const sphere = (x, y, z, r, hex, sy = 1.18) => { // kleine Kugel (8 × 6)
    const S = 8, R = 6, pt = (i, j) => { const th = (i / S) * Math.PI * 2, ph = (j / R) * Math.PI; return [x + Math.cos(th) * Math.sin(ph) * r, y - Math.cos(ph) * r * sy, z + Math.sin(th) * Math.sin(ph) * r]; };
    for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
      const a = pt(i, j), b = pt(i + 1, j), d = pt(i + 1, j + 1), e2 = pt(i, j + 1);
      if (j > 0) tri(a, d, b, hex); if (j < R - 1) tri(a, e2, d, hex);
    }
  };
  const rope = (a, b, hex, w = 0.035) => { // dünnes Band (von unten und oben sichtbar: Material zweiseitig)
    quad([a[0], a[1] - w, a[2]], [b[0], b[1] - w, b[2]], [b[0], b[1] + w, b[2]], [a[0], a[1] + w, a[2]], hex);
  };
  return {
    pole(x, z, h = 6.4, hex = 0xf8fafc) { box(x, 0, z, 0.14, h, 0.14, hex); },
    // Wimpelkette von (ax, az) nach (bx, bz) in Höhe h, hängt in der Mitte durch
    bunting(ax, az, bx, bz, h = 6.2, sag = 0.9) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(4, Math.round(L / 1.15)), at = u => [ax + (bx - ax) * u, h - sag * 4 * u * (1 - u), az + (bz - az) * u];
      for (let k = 0; k < n; k++) rope(at(k / n), at((k + 1) / n), 0x334155);
      for (let k = 0; k < n; k++) {
        const u0 = (k + 0.12) / n, u1 = (k + 0.88) / n, a = at(u0), b = at(u1), m = at((u0 + u1) / 2);
        tri(a, [m[0], m[1] - 0.75, m[2]], b, PARTY_COLORS[k % 8]);
      }
    },
    // Ballon-Strauss an einem kurzen Pfosten (Schnüre als dünne Bänder)
    bunch(x, z, y0 = 0, n = 5) {
      box(x, y0, z, 0.1, 1.6, 0.1, 0xf8fafc);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + x * 0.1, r = k === 0 ? 0 : 0.55, bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, by = y0 + 3.4 + (k === 0 ? 0.6 : Math.sin(k * 2.3) * 0.25);
        rope([x, y0 + 1.6, z], [bx, by - 0.5, bz], 0xf8fafc, 0.015);
        sphere(bx, by, bz, 0.42, PARTY_COLORS[(k + Math.round(Math.abs(x + z))) % 8]);
      }
    },
    sphere, box, tri, quad,
    mesh() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Co, 3));
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.05 }));
      m.castShadow = false; m.receiveShadow = false; m.name = 'party';
      return m;
    },
  };
}

// ---------- Banner „Happy Birthday“ (zwei Seiten, beide richtig herum lesbar) ----------
function bannerTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'].forEach((h, i, a) => gr.addColorStop(i / (a.length - 1), h));
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 40; k++) { g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 256, 3 + Math.random() * 6, 0, 7); g.fill(); }
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(5, 5, 1014, 246);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = '900 92px system-ui, sans-serif'; g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeText('🎉 HAPPY BIRTHDAY 🎂', 512, 92, 980); g.fillStyle = '#fff'; g.fillText('🎉 HAPPY BIRTHDAY 🎂', 512, 92, 980);
  g.font = '800 58px system-ui, sans-serif'; g.lineWidth = 8; g.strokeText('CAR-SAVER · VERSION 200 🎈', 512, 192, 980); g.fillStyle = '#fef08a'; g.fillText('CAR-SAVER · VERSION 200 🎈', 512, 192, 980);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let bannerT = null;
// Banner auf zwei Pfosten (Breite w, Unterkante y), Mitte (x, z), Blick in Richtung rot (0 = Schrift zeigt nach +z und −z)
export function birthdayBanner(parent, x, z, rot = 0, w = 14, y = 5.2) {
  if (!bannerT) bannerT = bannerTex();
  const h = w / 4, mat = new THREE.MeshStandardMaterial({ map: bannerT, emissive: 0xffffff, emissiveMap: bannerT, emissiveIntensity: 0.3, roughness: 0.6 });
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const side of [0, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x + s * (side ? -0.04 : 0.04), y + h / 2, z + c * (side ? -0.04 : 0.04)); m.rotation.y = rot + (side ? Math.PI : 0); parent.add(m);
  }
  const poleM = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  for (const k of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, y + h + 0.3, 10), poleM); p.position.set(x + c * k * (w / 2 + 0.15), (y + h + 0.3) / 2, z - s * k * (w / 2 + 0.15)); p.castShadow = true; parent.add(p); }
}

// ---------- Riesige Geburtstagstorte mit Kerzen ----------
export function birthdayCake(parent, x, z, r = 3.4) {
  const mat = o => new THREE.MeshStandardMaterial({ roughness: 0.6, ...o });
  const tiers = [[r, 1.5, 0xf9a8d4], [r * 0.74, 1.3, 0xfdf2f8], [r * 0.48, 1.2, 0x8b5a2b]];
  let y = 0;
  for (const [rr, h, col] of tiers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, h, 32), mat({ color: col })); t.position.set(x, y + h / 2, z); t.castShadow = t.receiveShadow = true; parent.add(t);
    const icing = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.13, 8, 32).rotateX(Math.PI / 2), mat({ color: 0xffffff })); icing.position.set(x, y + h, z); parent.add(icing);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat({ color: PARTY_COLORS[k % 8] })); d.position.set(x + Math.cos(a) * rr, y + h * 0.5, z + Math.sin(a) * rr); parent.add(d); } // Zuckerperlen
    y += h;
  }
  const candleM = mat({ color: 0x60a5fa }), flameM = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffa500, emissiveIntensity: 2.2 });
  const top = r * 0.48;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, cx = x + Math.cos(a) * top * 0.65, cz = z + Math.sin(a) * top * 0.65;
    const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), k % 2 ? candleM : mat({ color: 0xf472b6 })); cd.position.set(cx, y + 0.35, cz); parent.add(cd);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8), flameM); fl.position.set(cx, y + 0.84, cz); parent.add(fl);
  }
  return y;
}

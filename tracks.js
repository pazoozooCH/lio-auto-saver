// Rennstrecken: Form (Kontrollpunkte [x, z, Höhe] in Metern), Runden, Steilkurven und die Landschaft drumherum.
// race.js baut daraus Fahrbahn, Wände, Brücken und Tunnel; die Landschaften (Vulkan, Gletscher, Wüste, Dschungel)
// entstehen hier in buildTheme(). Die Alpen-Strecke baut race.js selbst (makeLand, buildTrees).
import * as THREE from 'three';
import { makeNoise, rng, smoothstep, surface, terrain } from './world3d.js';

// Wüste: liegende Acht, die bei der Kreuzung oben auf einer Brücke über sich selbst fährt
function figureEight() {
  const a = 1050, n = 28, t0 = 3 * Math.PI / 2 + 0.55, wrap = v => ((v + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Array.from({ length: n }, (_, k) => {
    const t = t0 + 2 * Math.PI * k / n, d = 1 + Math.sin(t) ** 2;
    const up = wrap(t - Math.PI / 2), low = wrap(t - 3 * Math.PI / 2);
    const h = 17 * Math.exp(-((up / 0.5) ** 2)) + 5 * Math.sin(2 * t) ** 2 * (1 - Math.exp(-((low / 0.6) ** 2)));
    const flatStart = smoothstep(1, 3.5, Math.min(k, n - k)); // Start und Ziel liegen eben
    return [Math.round(a * Math.cos(t) / d), Math.round(a * Math.sin(t) * Math.cos(t) / d * 1.25), Math.round(h * flatStart * 10) / 10];
  });
}

// bank = grösste Neigung in engen Kurven (Grad); grip = Haftung (Schnee rutschiger); tunnels = [von, bis] Kontrollpunkt
export const TRACKS = [
  { id: 'gp', name: 'Alpen-Grand-Prix', emoji: '🏔️', laps: 3, bank: 0, grip: 1, theme: 'alps', control: [
    [0, 0], [250, 0], [330, 40], [340, 130], [290, 190], [200, 200], [140, 170], [100, 210], [40, 230],
    [-60, 240], [-160, 300], [-230, 300], [-260, 250], [-220, 200], [-140, 170], [-110, 110], [-180, 70],
    [-250, 50], [-270, 10], [-230, -10], [-150, 0]] },
  { id: 'lava', name: 'Vulkan-Ring', emoji: '🌋', laps: 2, bank: 34, grip: 1, theme: 'lava', control: [
    [0, 0, 0], [300, 0, 0], [520, 40, 2], [640, 160, 8], [660, 330, 14], [580, 470, 16], [430, 520, 14], [300, 470, 10],
    [220, 380, 8], [120, 360, 6], [40, 430, 8], [0, 560, 12], [-80, 680, 16], [-240, 720, 18], [-400, 660, 14], [-480, 520, 8],
    [-430, 380, 4], [-560, 300, 6], [-700, 200, 10], [-720, 40, 8], [-620, -80, 4], [-460, -90, 2], [-300, -40, 0], [-150, 0, 0]] },
  { id: 'snow', name: 'Gletscher-Pass', emoji: '❄️', laps: 2, bank: 26, grip: 0.9, theme: 'snow', tunnels: [[12, 14]], control: [
    [0, 0, 0], [350, 0, 0], [620, 40, 3], [780, 180, 8], [790, 380, 12], [660, 520, 14], [480, 540, 12], [360, 440, 8],
    [300, 280, 6], [150, 240, 4], [30, 330, 6], [-20, 500, 10], [-140, 640, 14], [-340, 680, 16], [-520, 600, 14], [-600, 440, 10],
    [-520, 300, 6], [-640, 180, 8], [-760, 60, 10], [-700, -100, 6], [-520, -140, 2], [-320, -80, 0], [-160, -20, 0]] },
  { id: 'desert', name: 'Wüsten-Canyon', emoji: '🏜️', laps: 2, bank: 24, grip: 1, theme: 'desert', control: figureEight() },
  { id: 'jungle', name: 'Dschungel-Schlucht', emoji: '🌴', laps: 2, bank: 30, grip: 1, theme: 'jungle', control: [
    [0, 0, 0], [300, 0, 0], [480, 80, 4], [560, 240, 6], [500, 400, 4], [340, 470, 2], [230, 580, 6], [270, 730, 10],
    [430, 810, 12], [610, 770, 10], [730, 650, 6], [870, 570, 4], [970, 410, 6], [930, 230, 8], [810, 110, 6], [700, -50, 4],
    [520, -160, 2], [300, -210, 0], [60, -230, 2], [-170, -210, 4], [-330, -120, 2], [-350, 20, 0], [-210, 40, 0]] },
];

// Himmel, Licht und Nebel je Landschaft (Sonne: Höhe über dem Horizont und Richtung in Grad)
export const THEMES = {
  alps: { sky: [4, 1.2, 35, 140], fog: [0xbfd4e6, 250, 2900], hemi: [0xcfe6ff, 0x4a6b3a, 0.7], sun: [0xfff1dc, 2.4], exposure: 0.9,
    clouds: { coverage: 0.5, shade: '#aebccd' } },
  lava: { sky: [10, 3.2, 6, 250], fog: [0x4a2418, 180, 1900], hemi: [0xffb08a, 0x3a1d16, 0.85], sun: [0xff9a66, 2.2], exposure: 0.85,
    clouds: { coverage: 0.42, tint: '#ff9a6a', shade: '#3a2626' } },
  snow: { sky: [2, 0.9, 30, 200], fog: [0xdce7f2, 220, 2000], hemi: [0xe8f2ff, 0x9fb0c4, 0.95], sun: [0xffffff, 2.1], exposure: 0.8,
    clouds: { coverage: 0.55, shade: '#c3cfdc' } },
  desert: { sky: [6, 1.6, 40, 120], fog: [0xe9cba2, 300, 2800], hemi: [0xffe6c0, 0xa3794d, 0.85], sun: [0xfff0d6, 2.5], exposure: 0.85,
    clouds: { coverage: 0.62, tint: '#fff1dc', shade: '#d8b48c' } },
  jungle: { sky: [7, 2, 45, 160], fog: [0xa8bba2, 150, 1400], hemi: [0xd9f2d0, 0x2f4a2a, 0.8], sun: [0xfff2d0, 2.3], exposure: 0.9,
    clouds: { coverage: 0.48, shade: '#9fb0a0' } },
};

const C = h => new THREE.Color(h);
const mat = o => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Viele gleiche Dinge (Bäume, Felsen, Kakteen) als Instanzen: list = [{ x, y, z, s, sy?, ry?, color? }]
function instances(geo, material, list, shadow = true) {
  const m = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  list.forEach((o, i) => {
    q.setFromEuler(e.set(o.rx || 0, o.ry || 0, o.rz || 0));
    m.setMatrixAt(i, m4.compose(p.set(o.x, o.y, o.z), q, sc.set(o.sx || o.s, o.sy || o.s, o.sz || o.s)));
    if (o.color) m.setColorAt(i, o.color);
  });
  m.count = list.length;
  m.castShadow = shadow;
  m.computeBoundingSphere();
  return m;
}

// Zufällige Plätze neben der Strecke (zwischen dmin und dmax Meter weg)
function scatter(ctx, r, count, dmin, dmax, radius, tries) {
  if (ctx.lite) count = Math.round(count * 0.45);
  tries = tries || count * 20;
  const out = [], { cx, cz } = ctx;
  for (let k = 0; k < tries && out.length < count; k++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * radius;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, d = ctx.trackDist(x, z);
    if (d < dmin || d > dmax) continue;
    out.push({ x, z, y: ctx.height(x, z), d });
  }
  return out;
}

// Wand-Textur je Landschaft (statt der Reifenstapel)
function wallTex(kind) {
  return canvasTex(128, 32, (g, w, h) => {
    if (kind === 'lava') { // Beton mit schwarz-orangen Warnstreifen
      g.fillStyle = '#5b5550'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f97316'; for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h * 0.75); g.lineTo(x + 16, h * 0.75); g.lineTo(x + 24, h * 0.35); g.lineTo(x + 8, h * 0.35); g.fill(); }
    } else if (kind === 'snow') { // Schneewall
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c9d6e6');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(150,170,200,0.35)'; for (let x = 0; x < w; x += 9) g.fillRect(x, h * 0.6 + (x % 4), 6, 2);
    } else if (kind === 'desert') { // Sandstein mit roten Streifen
      g.fillStyle = '#d6b07a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b0402c'; g.fillRect(0, h * 0.42, w, h * 0.18);
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    } else { // Dschungel: Holzstämme
      for (let y = 0; y < 2; y++) { const gr = g.createLinearGradient(0, y * 16, 0, y * 16 + 16); gr.addColorStop(0, '#8a5a32'); gr.addColorStop(0.5, '#6b4424'); gr.addColorStop(1, '#3f2814'); g.fillStyle = gr; g.fillRect(0, y * 16, w, 16); }
      g.fillStyle = 'rgba(40,25,10,0.5)'; for (let x = 0; x < w; x += 23) g.fillRect(x, 0, 2, h);
    }
  });
}

// Flüsse (Lava oder Wasser) unter den Brücken durch: Band quer zur Strecke, folgt dem Gelände.
// Es reicht nur so weit, bis es einem anderen Streckenteil zu nahe käme.
function rivers(ctx, material, width = 18, len = 110) {
  const { T } = ctx, out = [], used = [];
  for (let i = 0; i < T.n; i += 10) {
    if (!(T.h[i] > 7 && !T.over[i] && T.h[i] >= T.h[(i - 20 + T.n) % T.n] && T.h[i] >= T.h[(i + 20) % T.n])) continue;
    if (used.some(j => Math.abs(T.dist[j] - T.dist[i]) < 400)) continue;
    used.push(i);
    const p = T.pts[i], n = T.nor[i], t = T.tan[i];
    const line = [];
    for (let s = -len; s <= len; s += 4) {
      const wob = Math.sin(s / 23) * 6, x = p.x + n.x * s + t.x * wob, z = p.z + n.z * s + t.z * wob;
      line.push({ s, x, z, ok: Math.abs(s) <= 30 || ctx.trackDist(x, z) >= 26 });
    }
    const mid = line.findIndex(q => q.s >= 0);
    let a = mid, b = mid;
    while (a > 0 && line[a - 1].ok) a--;
    while (b < line.length - 1 && line[b + 1].ok) b++;
    const run = line.slice(a, b + 1);
    if (run.length < 4) continue;
    const pos = [], uv = [], idx = [];
    run.forEach((q, k) => {
      for (const side of [-1, 1]) {
        const xx = q.x + t.x * side * width / 2, zz = q.z + t.z * side * width / 2;
        pos.push(xx, ctx.height(xx, zz) + 0.12, zz);
        uv.push(side > 0 ? 1 : 0, q.s / 30);
      }
      if (k > 0) { const c = (k - 1) * 2; idx.push(c, c + 1, c + 2, c + 1, c + 3, c + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}

// Schneefall oder Asche: Flocken in einer Kiste um die Kamera, die langsam fallen
function flakes(color, count, size, fall, opacity, lite) {
  if (lite) count = Math.round(count * 0.4);
  const pos = new Float32Array(count * 3), r = rng(5);
  for (let i = 0; i < count; i++) { pos[i * 3] = (r() - 0.5) * 160; pos[i * 3 + 1] = r() * 60; pos[i * 3 + 2] = (r() - 0.5) * 160; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const dg = dot.getContext('2d'), rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = rg; dg.fillRect(0, 0, 32, 32);
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: new THREE.CanvasTexture(dot), transparent: true, opacity, depthWrite: false }));
  p.frustumCulled = false;
  let t = 0;
  p.userData.update = (dt, cam) => {
    t += dt;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= fall * dt; pos[i * 3] += Math.sin(t + i) * 0.4 * dt;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] += 60;
    }
    g.attributes.position.needsUpdate = true;
    p.position.set(cam.position.x, cam.position.y - 25, cam.position.z);
  };
  return p;
}

// Tafelberge mit Gesteinsschichten (wie bei der Dragster-Bahn)
function mesas(ctx, r, count) {
  const N = makeNoise(21), strata = [0xb0583a, 0xc8794a, 0xe2b487, 0x9a4a32, 0xd08e5c, 0xbf6a44].map(C), top = C(0xb88a5e), col = new THREE.Color();
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, dist = 1300 + r() * 900, rad = 110 + r() * 170, h = 110 + r() * 180, seed = r() * 50;
    const g = new THREE.CylinderGeometry(rad, rad, h, 40, 24);
    const p = g.attributes.position, nrm = g.attributes.normal, cols = [];
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), t = y / h + 0.5, ang = Math.atan2(z, x), capTop = nrm.getY(k) > 0.9;
      const f = (1 + 0.3 * (N.fbm(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2 + t * 1.5, 4) - 0.5)) * (1 + 0.75 * (1 - smoothstep(0, 0.38, t)) ** 1.6);
      p.setXYZ(k, x * f, y, z * f);
      const yy = y + h / 2 + (N.noise(ang * 3 + seed, 0) - 0.5) * 8;
      if (capTop) col.copy(top); else if (t < 0.3) col.copy(strata[1]).lerp(top, 0.4); else col.copy(strata[Math.floor(yy / 9) % strata.length]);
      cols.push(col.r, col.g, col.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.translate(ctx.cx + Math.cos(a) * dist, h / 2 - 10, ctx.cz + Math.sin(a) * dist);
    geos.push(g);
  }
  const { mergeGeometries } = ctx;
  return new THREE.Mesh(mergeGeometries(geos), mat({ vertexColors: true, roughness: 1, flatShading: true }));
}

// ---------- Landschaften ----------
// ctx: { T, trackDist(x, z), cx, cz (Mitte der Strecke), mergeGeometries }
// Liefert: land (Gelände), add (Teile für die Szene), shoulder/skirt/wall (Materialien), update(dt, t, camera)
export function buildTheme(id, ctx) {
  const r = rng(id.length * 7919), N = makeNoise(id.length * 13);
  const flat = (x, z) => smoothstep(55, 175, ctx.trackDist(x, z)); // neben der Strecke flach
  const add = [], updates = [];
  let land, shoulder, skirt;
  const detailTex = (base, vary, relief = 3) => surface(256, (u, v) => {
    const n = N.fbm(u * 16, v * 16, 4, 16), b = r();
    const k = base + n * vary + b * 15;
    return [k, k, k - 4, n * 0.6 + b * 0.5];
  }, relief);

  if (id === 'lava') {
    const height = ctx.height = (x, z) => {
      const rr = Math.hypot(x - ctx.cx, z - ctx.cz);
      const rough = (N.fbm(x / 140, z / 140, 5) - 0.42) * (18 + 70 * smoothstep(300, 1100, rr));
      const ridge = (1 - Math.abs(2 * N.fbm(x / 420 + 3, z / 420, 4) - 1)) ** 2 * 300 * smoothstep(1000, 1800, rr);
      return (rough + ridge) * flat(x, z) - 0.08;
    };
    const basaltA = C(0x2b2724), basaltB = C(0x463a32), ember = C(0x8a2e10), ash = C(0x6e6660);
    land = terrain({ size: 4800, segments: ctx.lite ? 150 : 230, center: [ctx.cx, ctx.cz], height, detail: detailTex(190, 50), detailRepeat: 380,
      color: (x, z, y, steep, c) => {
        c.lerpColors(basaltA, basaltB, N.fbm(x / 60, z / 60, 3));
        c.lerp(ember, smoothstep(0.62, 0.7, N.fbm(x / 25 + 9, z / 25, 3)) * 0.6); // glühende Risse
        c.lerp(ash, smoothstep(140, 260, y) * 0.6);
      } });
    // Lavaflüsse unter den Brücken und Lavaseen
    const lavaTex = canvasTex(128, 256, (g, w, h) => {
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const n = N.fbm(x / 40, y / 40, 4, 0), k = n > 0.55 ? 0 : 1;
        g.fillStyle = k ? `hsl(${18 + n * 30}, 100%, ${45 + n * 25}%)` : '#2a1610';
        g.fillRect(x, y, 2, 2);
      }
    });
    const lava = new THREE.MeshStandardMaterial({ map: lavaTex, emissive: 0xffffff, emissiveMap: lavaTex, emissiveIntensity: 1.3, roughness: 0.6 });
    add.push(...rivers(ctx, lava, 20, 130));
    for (const p of scatter(ctx, r, 6, 90, 260, 1400)) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(14 + r() * 18, 28), lava);
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.y + 0.25, p.z); pool.scale.set(1, 0.6 + r() * 0.4, 1);
      add.push(pool);
    }
    updates.push(dt => { lavaTex.offset.y -= dt * 0.04; });
    // Vulkan in der Ferne mit glühendem Krater und Rauchsäule
    const vx = ctx.cx + 300, vz = ctx.cz - 1500;
    const prof = [[0, 0], [520, 0], [420, 120], [260, 300], [150, 430], [110, 450], [95, 420]].map(([a, b]) => new THREE.Vector2(a, b));
    const volcano = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), mat({ color: 0x2f2925, flatShading: true }));
    volcano.position.set(vx, -10, vz);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(100, 32), new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(vx, 432, vz);
    add.push(volcano, glow);
    const smoke = flakes(0x3a3330, 260, 60, -8, 0.5, ctx.lite); // steigt (negativer Fall)
    smoke.userData.update = (() => {
      const pp = smoke.geometry.attributes.position.array;
      for (let i = 0; i < pp.length; i += 3) { pp[i] = (Math.random() - 0.5) * 120; pp[i + 1] = Math.random() * 500; pp[i + 2] = (Math.random() - 0.5) * 120; }
      return dt => {
        for (let i = 0; i < pp.length; i += 3) { pp[i + 1] += 18 * dt; pp[i] += (8 + pp[i + 1] * 0.02) * dt; if (pp[i + 1] > 600) { pp[i + 1] = 0; pp[i] = (Math.random() - 0.5) * 60; } }
        smoke.geometry.attributes.position.needsUpdate = true;
      };
    })();
    smoke.position.set(vx, 440, vz);
    smoke.material.size = 70;
    add.push(smoke);
    updates.push(dt => smoke.userData.update(dt));
    // Asche, die vom Himmel rieselt
    const ash2 = flakes(0x6a5a52, 500, 0.35, 1.2, 0.7, ctx.lite);
    add.push(ash2); updates.push((dt, t, cam) => ash2.userData.update(dt, cam));
    // Felsnadeln und tote Bäume
    const spires = scatter(ctx, r, 160, 40, 600, 1500).map(p => ({ x: p.x, y: p.y + 2, z: p.z, s: 2 + r() * 4, sy: 4 + r() * 10, ry: r() * 6 }));
    add.push(instances(new THREE.ConeGeometry(1, 2, 6), mat({ color: 0x1f1b19, flatShading: true }), spires));
    const dead = scatter(ctx, r, 120, 32, 300, 1200).map(p => ({ x: p.x, y: p.y + 2.5, z: p.z, s: 0.8 + r() * 0.6, ry: r() * 6, rz: (r() - 0.5) * 0.3 }));
    add.push(instances(new THREE.CylinderGeometry(0.15, 0.3, 5, 5), mat({ color: 0x241c17 }), dead));
    shoulder = mat({ color: 0x3a332e, map: detailTex(170, 60).map });
    skirt = mat({ color: 0x2a2523, flatShading: true });
  } else if (id === 'snow') {
    const height = ctx.height = (x, z) => {
      const rr = Math.hypot(x - ctx.cx, z - ctx.cz);
      const roll = (N.fbm(x / 220, z / 220, 4) - 0.42) * (16 + 60 * smoothstep(250, 1000, rr));
      const peaks = (1 - Math.abs(2 * N.fbm(x / 480 + 7, z / 480 + 3, 4) - 1)) ** 2 * 620 * smoothstep(900, 1800, rr);
      return (roll + peaks) * flat(x, z) - 0.08;
    };
    const snowA = C(0xf6f9fc), snowB = C(0xdbe5ef), rock = C(0x6b6f76), rockD = C(0x4a4e55);
    land = terrain({ size: 5200, segments: ctx.lite ? 150 : 240, center: [ctx.cx, ctx.cz], height, detail: detailTex(225, 30, 2), detailRepeat: 420,
      color: (x, z, y, steep, c) => {
        c.lerpColors(snowA, snowB, N.fbm(x / 90, z / 90, 3));
        c.lerp(rock.clone().lerp(rockD, N.noise(x / 40, z / 40)), smoothstep(0.22, 0.42, steep));
      } });
    // verschneite Tannen: dunkelgrün mit weisser Haube
    const firs = scatter(ctx, r, 1600, 30, 900, 1700);
    const green = firs.map(p => ({ x: p.x, y: p.y + 4.5 * (p.s = 0.9 + r() * 0.9), z: p.z, s: p.s, ry: r() * 6 }));
    add.push(instances(new THREE.ConeGeometry(2.4, 8, 7), mat({ color: 0x24402c, flatShading: true }), green));
    add.push(instances(new THREE.ConeGeometry(1.5, 3.2, 7), mat({ color: 0xf4f8fc, flatShading: true }), green.map(g => ({ ...g, y: g.y + 2.6 * g.s }))));
    // zugefrorene Seen unter den Brücken
    const ice = new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.08, metalness: 0.2 });
    add.push(...rivers(ctx, ice, 26, 70));
    const fall = flakes(0xffffff, 1400, 0.45, 3, 0.9, ctx.lite);
    add.push(fall); updates.push((dt, t, cam) => fall.userData.update(dt, cam));
    shoulder = mat({ color: 0xf1f5fa, map: detailTex(220, 35).map });
    skirt = mat({ color: 0x8b9099, flatShading: true });
  } else if (id === 'desert') {
    const height = ctx.height = (x, z) => {
      const warp = N.fbm(x / 400, z / 400, 3) * 7;
      const dune = Math.pow(0.5 + 0.5 * Math.sin((x * 0.35 + z * 0.94) / 38 + warp), 2.2) * (3 + 16 * N.fbm(x / 600 + 3, z / 600, 3));
      return (dune + (N.fbm(x / 150, z / 150, 3) - 0.5) * 3) * flat(x, z) - 0.08;
    };
    const sandA = C(0xe0ac70), sandB = C(0xc98f58), sandD = C(0xa9713f), pale = C(0xead0a6);
    const sandDetail = surface(256, (u, v) => {
      const ripple = Math.sin(2 * Math.PI * (v * 24 + N.fbm(u * 4, v * 4, 3, 4) * 1.5));
      const k = 222 + ripple * 10 + r() * 20;
      return [k, k - 4, k - 12, ripple * 0.5 + r() * 0.15];
    }, 2);
    land = terrain({ size: 5600, segments: ctx.lite ? 150 : 240, center: [ctx.cx, ctx.cz], height, detail: sandDetail, detailRepeat: 560,
      color: (x, z, y, steep, c) => {
        c.lerpColors(sandA, sandB, N.fbm(x / 120, z / 120, 3));
        c.lerp(sandD, smoothstep(0.6, 0.75, N.fbm(x / 300 + 4, z / 300, 3)) * 0.55);
        c.lerp(pale, smoothstep(6, 18, y) * 0.35);
      } });
    add.push(mesas(ctx, r, 18));
    const cacti = scatter(ctx, r, 220, 30, 500, 1500);
    const cMat = mat({ color: 0x3f7d34, roughness: 0.8 });
    add.push(instances(new THREE.CapsuleGeometry(0.35, 1, 4, 8), cMat, cacti.map(p => ({ x: p.x, y: p.y + 2, z: p.z, s: 1, sy: 2 + r() * 2.5 }))));
    add.push(instances(new THREE.CapsuleGeometry(0.22, 1, 4, 8), cMat, cacti.filter(() => r() < 0.7).map(p => ({ x: p.x + 0.6, y: p.y + 3, z: p.z, s: 1, sy: 1.2 }))));
    const rocks = scatter(ctx, r, 260, 28, 700, 1600).map(p => ({ x: p.x, y: p.y + 0.4, z: p.z, s: 0.8 + r() ** 3 * 6, sy: 0.6 + r() * 2, ry: r() * 6,
      color: new THREE.Color().setHSL(0.05 + r() * 0.03, 0.45, 0.18 + r() * 0.12) }));
    add.push(instances(new THREE.DodecahedronGeometry(1, 0), mat({ color: 0xffffff, flatShading: true }), rocks));
    shoulder = mat({ color: 0xd9a86c, map: sandDetail.map });
    skirt = mat({ color: 0xc7965c, flatShading: true });
  } else { // jungle
    const height = ctx.height = (x, z) => {
      const rr = Math.hypot(x - ctx.cx, z - ctx.cz);
      const hills = (N.fbm(x / 200, z / 200, 5) - 0.38) * (30 + 110 * smoothstep(200, 900, rr));
      return hills * flat(x, z) - 0.08;
    };
    const gA = C(0x3f7a2e), gB = C(0x2d5e22), moss = C(0x5a7a2a), mud = C(0x5b4632);
    land = terrain({ size: 4800, segments: ctx.lite ? 150 : 230, center: [ctx.cx, ctx.cz], height, detail: detailTex(200, 40), detailRepeat: 380,
      color: (x, z, y, steep, c) => {
        c.lerpColors(gA, gB, N.fbm(x / 70, z / 70, 3));
        c.lerp(moss, smoothstep(0.55, 0.7, N.fbm(x / 200 + 5, z / 200, 3)) * 0.5);
        c.lerp(mud, smoothstep(0.25, 0.45, steep) * 0.8);
      } });
    // Urwaldbäume (gross, dicht) und Palmen nahe der Strecke
    const big = scatter(ctx, r, 1700, 32, 900, 1600);
    const crowns = big.map(p => ({ x: p.x, y: p.y + 9 * (p.s = 1 + r() * 1.2), z: p.z, s: p.s * 1.6, sy: p.s * 1.1, ry: r() * 6,
      color: new THREE.Color().setHSL(0.27 + r() * 0.07, 0.55, 0.08 + r() * 0.07) }));
    add.push(instances(new THREE.CylinderGeometry(0.4, 0.7, 9, 6), mat({ color: 0x4a3626 }), big.map(p => ({ x: p.x, y: p.y + 4.5 * p.s, z: p.z, s: p.s }))));
    add.push(instances(new THREE.IcosahedronGeometry(3, 1), mat({ color: 0xffffff, flatShading: true }), crowns));
    const palms = scatter(ctx, r, 260, 26, 90, 1300);
    const fronds = [];
    for (let k = 0; k < 7; k++) fronds.push(new THREE.BoxGeometry(4.2, 0.12, 0.9).translate(2.1, 0, 0).rotateZ(-0.35).rotateY(k / 7 * Math.PI * 2));
    const frondGeo = ctx.mergeGeometries(fronds);
    add.push(instances(new THREE.CylinderGeometry(0.22, 0.32, 9, 6), mat({ color: 0x7a5a3a }), palms.map(p => ({ x: p.x, y: p.y + 4.5, z: p.z, s: 1, rz: (r() - 0.5) * 0.25 }))));
    add.push(instances(frondGeo, mat({ color: 0x3f8f2f, roughness: 0.8 }), palms.map(p => ({ x: p.x, y: p.y + 9, z: p.z, s: 1, ry: r() * 6 }))));
    // Flüsse unter den Brücken
    const water = new THREE.MeshStandardMaterial({ color: 0x2f6f73, roughness: 0.05, metalness: 0.3 });
    add.push(...rivers(ctx, water, 22, 120));
    shoulder = mat({ color: 0x3f6f2a, map: detailTex(200, 40).map });
    skirt = mat({ color: 0x4a4a3a, flatShading: true });
  }
  shoulder.map.repeat.set(1, 1);
  return {
    land, add, shoulder, skirt,
    wall: new THREE.MeshStandardMaterial({ map: wallTex(id), roughness: 0.85, side: THREE.DoubleSide }),
    update: (dt, t, cam) => { for (const u of updates) u(dt, t, cam); },
  };
}

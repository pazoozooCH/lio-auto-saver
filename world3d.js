// Baukasten für realistische Landschaften: Rauschen, Oberflächen mit Relief, Gelände, Wolken, Staub.
import * as THREE from 'three';

// Zufallszahlen mit Startwert (gleiche Landschaft bei jedem Laden)
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weiches Rauschen (Value-Noise) und mehrere Lagen davon (fbm); period macht es kachelbar
export function makeNoise(seed = 1) {
  const r = rng(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const hash = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y, period = 0) => {
    let ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    let ix1 = ix + 1, iy1 = iy + 1;
    if (period) {
      ix = ((ix % period) + period) % period; iy = ((iy % period) + period) % period;
      ix1 = (ix + 1) % period; iy1 = (iy + 1) % period;
    }
    const a = hash(ix, iy), b = hash(ix1, iy), c = hash(ix, iy1), d = hash(ix1, iy1);
    const u = smooth(fx), v = smooth(fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, oct = 5, period = 0) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * noise(x * f, y * f, period ? period * f : 0);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  };
  return { noise, fbm };
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Kachelbare Oberfläche: fn(u, v) liefert [r, g, b, höhe]; aus der Höhe wird ein Relief (normalMap)
export function surface(size, fn, reliefStrength = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, gg, b, h] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      height[y * size + x] = h || 0;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return { map, normalMap: reliefStrength ? reliefMap(height, size, reliefStrength) : null };
}

function reliefMap(h, size, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Gelände mit Höhen und Farben: height(x, z) → Meter, color(x, z, y, steil, farbe) setzt die Farbe
export function terrain({ size, segments, center = [0, 0], height, color, detail, detailRepeat = 200 }) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center[0], 0, center[1]);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, cols = new Float32Array(pos.count * 3), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    color(pos.getX(i), pos.getZ(i), pos.getY(i), 1 - nrm.getY(i), col);
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * detailRepeat, uv.getY(i) * detailRepeat);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail.map, normalMap: detail.normalMap, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Wolkenkuppel: eine halbe Kugel mit durchsichtigen Wolken (ein einziger Zeichen-Befehl)
export function cloudDome({ radius = 2400, coverage = 0.5, tint = '#ffffff', shade = '#c9d3e0', seed = 7 }) {
  const N = makeNoise(seed), w = 1024, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const top = new THREE.Color(tint), low = new THREE.Color(shade), tmp = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 = oben, 1 = Horizont
    for (let x = 0; x < w; x++) {
      const d = N.fbm(x / w * 8, v * 3.2, 6, 8);
      const dens = Math.min(1, Math.max(0, (d - coverage) * 3.2));
      const fade = smoothstep(1, 0.72, v) * smoothstep(0, 0.12, v);
      const lit = N.fbm(x / w * 8 + 3.1, v * 3.2 + 1.7, 4, 8);
      tmp.copy(low).lerp(top, Math.min(1, 0.35 + lit));
      const i = (y * w + x) * 4;
      img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255;
      img.data[i + 3] = dens * fade * 235;
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false }));
  dome.renderOrder = -1;
  return dome;
}

// Schwebende Staubkörner im Licht (ein Zeichen-Befehl); update(dt) bewegt sie langsam
export function dust({ count = 300, box, color = 0xfff1d0, size = 0.09, opacity = 0.55 }) {
  const r = rng(11), pos = new Float32Array(count * 3), vel = new Float32Array(count * 3);
  const [x0, y0, z0, x1, y1, z1] = box;
  for (let i = 0; i < count; i++) {
    pos[i * 3] = x0 + r() * (x1 - x0); pos[i * 3 + 1] = y0 + r() * (y1 - y0); pos[i * 3 + 2] = z0 + r() * (z1 - z0);
    vel[i * 3] = (r() - 0.5) * 0.3; vel[i * 3 + 1] = (r() - 0.5) * 0.12; vel[i * 3 + 2] = (r() - 0.5) * 0.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dg = dot.getContext('2d');
  const grad = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = grad; dg.fillRect(0, 0, 32, 32);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: new THREE.CanvasTexture(dot), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.userData.update = dt => {
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] += vel[i] * dt; pos[i + 1] += vel[i + 1] * dt; pos[i + 2] += vel[i + 2] * dt;
      if (pos[i] < x0) pos[i] = x1; else if (pos[i] > x1) pos[i] = x0;
      if (pos[i + 1] < y0) pos[i + 1] = y1; else if (pos[i + 1] > y1) pos[i + 1] = y0;
      if (pos[i + 2] < z0) pos[i + 2] = z1; else if (pos[i + 2] > z1) pos[i + 2] = z0;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}

// Lichtstrahl (z.B. durch ein Fenster): helles, nach unten auslaufendes Band
export function lightShaft(width, length, opacity = 0.12, color = 0xfff4dc) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 128);
  return new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
}

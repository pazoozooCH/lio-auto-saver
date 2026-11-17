// Die Insel: alles Land (Stadt, Vororte, Autobahn, Pass, Skigebiet …) liegt darauf, rundherum Meer bis zum Horizont.
// Die Küste wird um alles gelegt, was es gibt (setIsland mit Punkten), mit Abstand und unregelmässigen Buchten und
// Landzungen (nicht symmetrisch). Im Westen eine grosse Bucht mit Strand und Hafen (wie früher das Wasser dort).
// islandDist(x, z): ungefähr Meter bis zur Küste, > 0 auf dem Land, < 0 im Meer.
export const SEA_Y = -1.2;
export const ISLAND_C = { x: 0, z: 820 }; // Mitte, von hier aus wird die Küste je Richtung bestimmt
const BINS = 720;
let R = null; // Küstenabstand je Richtung (Meter von der Mitte)
const BAY = { x1: -702, z0: -700, z1: 380, r: 110 }; // Bucht im Westen (Wasser westlich von x1)

// pts: [[x, z], ...] = alles, was auf der Insel liegen muss
export function setIsland(pts) {
  const far = new Float32Array(BINS);
  for (const [x, z] of pts) {
    const dx = x - ISLAND_C.x, dz = z - ISLAND_C.z, a = Math.atan2(dz, dx), b = ((Math.round(a / (Math.PI * 2) * BINS) % BINS) + BINS) % BINS;
    far[b] = Math.max(far[b], Math.hypot(dx, dz));
  }
  // Lücken füllen: je Richtung das Weiteste in der Nähe (±8°), dann weich machen
  const wide = new Float32Array(BINS), out = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) { let m = 0; for (let k = -16; k <= 16; k++) m = Math.max(m, far[(i + k + BINS) % BINS]); wide[i] = m; }
  for (let i = 0; i < BINS; i++) { let s = 0; for (let k = -10; k <= 10; k++) s += wide[(i + k + BINS) % BINS]; out[i] = s / 21; }
  // Abstand zur Küste: mindestens 90 m, dazu Wellen in verschiedener Grösse (Buchten, Landzungen)
  for (let i = 0; i < BINS; i++) {
    const a = i / BINS * Math.PI * 2;
    out[i] += 185 + 70 * Math.sin(3 * a + 1.1) + 40 * Math.sin(5 * a + 2.4) + 22 * Math.sin(11 * a + 0.4) + 12 * Math.sin(17 * a + 2.9);
  }
  R = out;
}
function radial(x, z) {
  if (!R) return 1e6;
  const dx = x - ISLAND_C.x, dz = z - ISLAND_C.z, a = Math.atan2(dz, dx), f = ((a / (Math.PI * 2)) * BINS + BINS) % BINS, i = Math.floor(f), t = f - i;
  return R[i] * (1 - t) + R[(i + 1) % BINS] * t - Math.hypot(dx, dz);
}
function bayDist(x, z) { // > 0 ausserhalb der Bucht (Rechteck mit runden Ecken, nach Westen offen)
  const cz = (BAY.z0 + BAY.z1) / 2, hz = (BAY.z1 - BAY.z0) / 2 - BAY.r, qx = x - (BAY.x1 - BAY.r), qz = Math.abs(z - cz) - hz;
  if (qx <= 0 && qz <= 0) return Math.max(qx, qz) - BAY.r; // innen
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - BAY.r;
}
export function islandDist(x, z) { return Math.min(radial(x, z), bayDist(x, z)); }
export const onIsland = (x, z, m = 0) => islandDist(x, z) > m;
export const islandReady = () => !!R;

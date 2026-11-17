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

// ---------- Diamantinsel (kleine Insel wie Monaco, im Westen vor der Bucht) ----------
// Rund mit Wellen, im Osten ein Hafenbecken (Jachthafen mit Fährsteg), im Süden eine flache Landzunge mit Piste.
export const MONACO = { x: -2150, z: -180, r: 300 };
export const MON_HARBOR = { x0: MONACO.x + 225, x1: MONACO.x + 290, z0: MONACO.z - 70, z1: MONACO.z + 70 }; // flacher Kai
export const MON_STRIP = { x0: MONACO.x - 160, x1: MONACO.x + 140, z0: MONACO.z + 255, z1: MONACO.z + 285 }; // Piste
const MON_SPIT = { x0: MONACO.x - 185, x1: MONACO.x + 165, z0: MONACO.z + 225, z1: MONACO.z + 305 }; // Landzunge
const MON_BASIN = { x0: MONACO.x + 290, x1: MONACO.x + 2000, z0: MONACO.z - 75, z1: MONACO.z + 75, r: 25 }; // Hafenbecken
const sdBox = (x, z, b, r = 0) => { // < 0 innen, > 0 aussen (Meter)
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, qx = Math.abs(x - cx) - ((b.x1 - b.x0) / 2 - r), qz = Math.abs(z - cz) - ((b.z1 - b.z0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
};
export const monRadius = a => MONACO.r * (1 + 0.12 * Math.sin(2 * a + 0.7) + 0.08 * Math.sin(3 * a + 2) + 0.05 * Math.sin(7 * a + 1));
// > 0 auf der Diamantinsel, < 0 im Wasser (ungefähr Meter)
export function monacoDist(x, z) {
  const dx = x - MONACO.x, dz = z - MONACO.z;
  if (dx * dx + dz * dz > 700 * 700) return -700;
  let d = monRadius(Math.atan2(dz, dx)) - Math.hypot(dx, dz);
  d = Math.min(Math.max(d, -sdBox(x, z, MON_SPIT, 20), -sdBox(x, z, MON_HARBOR)), sdBox(x, z, MON_BASIN, MON_BASIN.r));
  return Math.max(d, -sdBox(x, z, MON_PIER)); // Bootssteg im Hafenbecken
}
export const MON_PIER = { x0: MONACO.x + 286, x1: MONACO.x + 320, z0: MONACO.z + 55, z1: MONACO.z + 59 }; // Steg fürs Boot
export const MON_BOAT = { x: MONACO.x + 313, z: MONACO.z + 66, h: 0 }; // dort liegt das Boot, wenn man hier aussteigt
export const inBox = (x, z, b, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
// Land irgendwo (Hauptinsel oder Diamantinsel): für Wasser, Boot und Auto
export const landDist = (x, z) => Math.max(islandDist(x, z), monacoDist(x, z));

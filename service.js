// Tankstellen mit Werkstatt (Wunsch Lionel: mehr davon, überall und an der Autobahn) – für city.js.
// Eine Station: rotes Dach mit zwei Zapfsäulen (tanken), grüne Ladesäulen (Elektroautos), offene Werkstatt-Halle mit
// Hebebühne (reparieren), kleiner Shop und hohes Schild. Logik wie bei der Tankstelle (stepPlaces) und der Werkstatt
// (stepDamage) in der Stadt: dort anhalten. Zonen in Welt- bzw. Gitter-Koordinaten (S.places.services).
// Lage: CITY_SERVICES = freie Waldstücke am Stadtrand (Block, Richtung zur Strasse); SERVICES = draussen an jeder
// Autobahn-Ausfahrt (am Zubringer, ROADS in outskirts.js), dort ist das Gelände eben (serviceDist in height()).
import * as THREE from 'three';

// face: wo die Strasse liegt ('-z' = Einfahrt von −z usw.)
export const CITY_SERVICES = { '9,3': '-x', '0,6': '+x', '7,9': '-z' };
export const SERVICES = [
  { x: 250, z: 488, face: '-z' },    // Flughafenstrasse (Ausfahrt Süd / Flughafen)
  { x: 1133, z: 530, face: '-x' },   // Zubringer Ost (Ausfahrt Flughafen · Skigebiet)
  { x: 950, z: 274, face: '+z' },    // Strasse zum Raumbahnhof
  { x: 1000, z: 1224, face: '+z' },  // Strasse zum Skidorf
  { x: -626, z: -900, face: '+x' },  // Nordstrasse (Strand, Hafen)
  { x: -424, z: 1500, face: '-x' },  // Südstrasse
  { x: 476, z: -800, face: '-x' },   // Zubringer Bergpass
  { x: -1126, z: 650, face: '+x' },  // Zubringer West (vor der Brücke)
];
const PAD = { x0: -22, x1: 22, z0: -16, z1: 12 }; // Platz der Station (lokal: Strasse bei −z)
const ANG = { '-z': 0, '+x': -Math.PI / 2, '+z': Math.PI, '-x': Math.PI / 2 };
// lokal → Welt (Drehung um 0/90/180/270°)
const toWorld = (S, lx, lz) => { const a = ANG[S.face], c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return [S.x + lx * c + lz * s, S.z - lx * s + lz * c]; };
const rectWorld = (S, x0, z0, x1, z1) => { const [ax, az] = toWorld(S, x0, z0), [bx, bz] = toWorld(S, x1, z1); return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }; };
const zone = (S, lx, lz, w, d) => { const [x, z] = toWorld(S, lx, lz), side = S.face === '+x' || S.face === '-x'; return { x, z, w: side ? d : w, d: side ? w : d }; };

const padRects = SERVICES.map(S => rectWorld(S, PAD.x0, PAD.z0, PAD.x1, PAD.z1));
// Abstand zum nächsten Platz einer Station draussen (für das ebene Gelände, den Wald und den Boden)
export function serviceDist(x, z) {
  let d = 1e9;
  for (const b of padRects) d = Math.min(d, Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1)));
  return d;
}
export const inService = (x, z) => serviceDist(x, z) < 1;

let M = null;
const mats = () => M || (M = {
  tarmac: new THREE.MeshStandardMaterial({ color: 0x45484e, roughness: 0.92 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 }),
  redGlow: new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.25 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x22d3ee, emissiveIntensity: 0.6 }),
  green: new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }),
  greenScreen: new THREE.MeshStandardMaterial({ color: 0x0b1a10, emissive: 0x22c55e, emissiveIntensity: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.8 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }),
  lift: new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4, roughness: 0.5 }),
  shop: new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x7dd3fc, metalness: 0.3, roughness: 0.15 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }),
  line: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
});

// Baut eine Station in parent (Welt- bzw. Gitter-Koordinaten). y = Bodenhöhe. Gibt die Zonen zurück.
export function buildService(parent, S, { sign, solid, round, y = 0 }) {
  const m = mats(), rot = ANG[S.face];
  const box = (w, h, d, mat, lx, ly, lz, solidToo = false, shadow = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), [x, z] = toWorld(S, lx, lz);
    b.position.set(x, y + ly, z); b.rotation.y = rot; b.castShadow = shadow; b.receiveShadow = true; parent.add(b);
    if (solidToo) solid.push({ ...rectWorld(S, lx - w / 2, lz - d / 2, lx + w / 2, lz + d / 2), h: y + ly + h / 2 });
    return b;
  };
  const plate = (text, bg, fg, w, h, lx, ly, lz, back = true) => { // Schild, von vorne (und hinten) lesbar
    for (const side of back ? [0, 1] : [0]) {
      const s = sign(text, bg, fg, w, h), [x, z] = toWorld(S, lx, lz - (side ? 0.06 : 0)); // die zur Strasse schauende Seite liegt vorne
      s.position.set(x, y + ly, z); s.rotation.y = rot + (side ? Math.PI : 0); parent.add(s);
    }
  };
  box(PAD.x1 - PAD.x0, 0.1, PAD.z1 - PAD.z0, m.tarmac, 0, 0.05, (PAD.z0 + PAD.z1) / 2, false, false);
  // Tankstelle: Dach auf vier Säulen, zwei Zapfsäulen (Autos halten daneben)
  box(16, 0.6, 11, m.white, -10, 5.6, -5);
  box(16.2, 0.45, 11.2, m.redGlow, -10, 5.08, -5);
  for (const [lx, lz] of [[-17.4, -10], [-2.6, -10], [-17.4, 0], [-2.6, 0]]) { box(0.5, 5.2, 0.5, m.metal, lx, 2.7, lz); const [x, z] = toWorld(S, lx, lz); round.push({ x, z, r: 0.45 }); }
  for (const lx of [-13, -7]) { box(1, 1.8, 0.7, m.red, lx, 0.95, -5, true); box(0.05, 0.5, 0.5, m.screen, lx + 0.53, 1.4, -5, false, false); }
  plate('⛽ TANKEN', '#dc2626', '#ffffff', 9, 1.6, -10, 6.4, -10.7);
  // Ladesäulen für Elektroautos
  for (const lz of [-8, -2]) { box(0.6, 1.7, 0.45, m.green, 0.6, 0.9, lz, true); box(0.05, 0.4, 0.3, m.greenScreen, 0.95, 1.3, lz, false, false); }
  plate('⚡ LADEN', '#16a34a', '#ffffff', 4, 1, 0.6, 2.4, -10.4);
  // Werkstatt: offene Halle (nach −z), Hebebühne, Reifen
  for (const lx of [6.5, 19.5]) box(0.5, 6, 15, m.wall, lx, 3, -0.5, true);
  box(13.6, 0.5, 15, m.blue, 13, 6.2, -0.5);
  box(13, 6, 0.5, m.wall, 13, 3, 7, true);
  box(3.6, 0.2, 5.4, m.lift, 13, 0.2, -1.5, false, false);
  for (const s of [-1, 1]) box(0.25, 2.2, 0.25, m.metal, 13 + s * 2.3, 1.2, -1.5, true);
  for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.2, 8, 16).rotateX(Math.PI / 2), m.tire), [x, z] = toWorld(S, 18, 5); t.position.set(x, y + 0.3 + k * 0.4, z); parent.add(t); }
  plate('🔧 WERKSTATT', '#1d4ed8', '#ffffff', 10, 1.6, 13, 7.3, -8.3);
  // kleiner Shop hinter dem Dach
  box(14, 3.6, 6, m.shop, -10, 1.85, 7.5, true);
  box(8, 1.6, 0.1, m.glass, -10, 1.8, 4.47, false, false);
  // hohes Schild an der Strasse (von weitem sichtbar)
  box(0.4, 9, 0.4, m.metal, -20, 4.5, -14.5, true);
  plate('⛽ 🔧', '#111827', '#facc15', 4, 2.4, -20, 9.5, -14.8);
  // Ein- und Ausfahrt: Haltelinien vor der Station
  box(40, 0.02, 0.25, m.line, 0, 0.11, -15.6, false, false);
  return { x: S.x, z: S.z, pad: rectWorld(S, PAD.x0, PAD.z0, PAD.x1, PAD.z1), gas: zone(S, -10, -5, 14, 8), charge: zone(S, 3, -5, 4.5, 10), repair: zone(S, 13, -1.5, 8, 9) };
}

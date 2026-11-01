// 3D-Fahrzeuge für Rennstrecke und Presse (three.js), aus wenigen Grundformen gebaut
import * as THREE from 'three';

// Fahrzeugformen: Seitenprofil (Anteile von Länge und Höhe, hinten → vorne), Kabine, Radpositionen, Breite
const ARCH = {
  sedan: { body: [[0, .22], [0, .48], [.03, .56], [.12, .59], [.8, .58], [.93, .55], [.99, .47], [1, .3], [.98, .22]], cabin: [.2, .3, .64, .8, .56, .96], wheels: [.18, .82], width: 1.85 },
  compact: { body: [[0, .22], [0, .56], [.1, .6], [.9, .58], [1, .46], [1, .22]], cabin: [.08, .14, .6, .78, .57, .97], wheels: [.17, .83], width: 1.75 },
  sport: { body: [[0, .2], [0, .48], [.05, .55], [.3, .57], [.72, .5], [.92, .4], [1, .3], [1, .2]], cabin: [.3, .42, .6, .78, .51, .86], wheels: [.18, .8], width: 1.95 },
  suv: { body: [[0, .26], [0, .58], [.82, .58], [1, .5], [1, .26]], cabin: [.05, .08, .7, .82, .56, .97], wheels: [.19, .81], width: 1.95 },
  pickup: { body: [[0, .26], [0, .56], [1, .54], [1, .26]], cabin: [.52, .54, .74, .86, .54, .97], wheels: [.18, .82], width: 1.95 },
  van: { body: [[0, .18], [0, 1], [.74, 1], [.76, .74], [.9, .72], [1, .46], [1, .18]], glass: [[.77, .7], [.89, .68], [.97, .48], [.77, .48]], wheels: [.16, .84], width: 2.25, tall: true },
  bus: { body: [[0, .14], [0, 1], [1, 1], [1, .14]], glass: [[.03, .56], [.03, .9], [.97, .9], [.97, .56]], wheels: [.16, .84], width: 2.45, tall: true },
};
const ARCH_OF = {
  formula: ['racer', 'dragster'],
  sport: ['sports', 'muscle', 'rocketcar', 'timemachine', 'shuttle'],
  compact: ['mini', 'isetta', 'kompakt', 'beetle', 'golfcart', 'tuktuk'],
  suv: ['jeep', 'safari', 'monster', 'buggy', 'minivan', 'tractor'],
  pickup: ['pickup', 'firework', 'towtruck', 'dumper', 'snowplow', 'cement'],
  van: ['delivery', 'icecream', 'ambulance', 'garbage', 'camper', 'umzug', 'bakery', 'armored', 'hotdog', 'treasure', 'firetruck', 'crane', 'royal'],
  bus: ['van', 'postauto', 'doubledecker', 'train'],
  bike: ['pizza', 'scooter', 'policebike'],
  ufo: ['ufo', 'hovercraft'],
  heli: ['heli'],
};
function archOf(kind) {
  for (const [arch, kinds] of Object.entries(ARCH_OF)) if (kinds.includes(kind)) return arch;
  return 'sedan';
}

function paintMaterial(v) {
  const base = { clearcoat: 1, clearcoatRoughness: 0.06 };
  switch (v.special) {
    case 'gold': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xffc83d, metalness: 0.9, roughness: 0.26, emissive: 0x3a2600, emissiveIntensity: 0.6 });
    case 'diamond': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xcdefff, metalness: 0.2, roughness: 0.03, iridescence: 1, iridescenceIOR: 1.8 });
    case 'obsidian': return new THREE.MeshPhysicalMaterial({ ...base, color: 0x120a1c, metalness: 0.7, roughness: 0.12, emissive: 0x2a0f45, emissiveIntensity: 0.35 });
    case 'rainbow': return new THREE.MeshPhysicalMaterial({ ...base, color: 0xff0000, metalness: 0.4, roughness: 0.25 });
    default: return new THREE.MeshPhysicalMaterial({ ...base, color: new THREE.Color(v.color), metalness: 0.45, roughness: 0.32 });
  }
}

const MAT = {};
function shared() {
  if (MAT.glass) return MAT;
  MAT.glass = new THREE.MeshPhysicalMaterial({ color: 0x3a5068, metalness: 0.55, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.6 });
  MAT.tyre = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.85 });
  MAT.rim = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 1, roughness: 0.25 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: 0x1f2026, roughness: 0.6 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 1.2 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.9 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
  return MAT;
}

function extrude(points, depth, mat, bevel = 0.14) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 4, steps: 1, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function wheel(r, width, parent, x, z) {
  const M = shared();
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 24), M.tyre);
  tyre.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 12), M.rim);
  rim.rotation.x = Math.PI / 2;
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.18, width + 0.04), M.dark);
  tyre.castShadow = true;
  g.add(tyre, rim, spoke);
  g.position.set(x, r, z);
  parent.add(g);
  return g;
}

// Baut ein 3D-Fahrzeug; Länge entlang +X (vorne), Breite entlang Z.
// hDiv: Pixel der 2D-Höhe pro Meter (Standard: hohe Fahrzeuge 20, sonst 27)
export function buildCar(v, kinds, hDiv) {
  const M = shared();
  const k = kinds[v.kind];
  const arch = archOf(v.kind);
  const group = new THREE.Group();
  const paint = paintMaterial(v);
  const wheels = [];
  const L = k.w[1] / 22;
  const a = ARCH[arch];
  const H = k.h[1] / (hDiv || (a && a.tall ? 20 : 27));
  const r = (k.wheel || 11) * 0.032;
  let width = a ? a.width : 1.8;
  const body = new THREE.Group();
  group.add(body);
  const X = f => f * L - L / 2;

  if (a) {
    body.add(extrude(a.body.map(([x, y]) => [X(x), y * H]), width - 0.28, paint));
    if (a.cabin) {
      const [rb, rt, ft, fb, by, ty] = a.cabin;
      const cw = width * 0.78;
      body.add(extrude([[X(rb), by * H], [X(rt), ty * H], [X(ft), ty * H], [X(fb), by * H]], cw, M.glass, 0.04));
      body.add(extrude([[X(rt + 0.02), ty * H - 0.05], [X(rt + 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H + 0.03], [X(ft - 0.02), ty * H - 0.05]], cw + 0.04, paint, 0.03));
    }
    if (a.glass) body.add(extrude(a.glass.map(([x, y]) => [X(x), y * H]), width - 0.06, M.glass, 0.02));
    for (const f of a.wheels) for (const sgn of [-1, 1]) wheels.push(wheel(r, 0.32, group, X(f), sgn * (width / 2 - 0.12)));
    // Scheinwerfer und Rücklichter
    for (const sgn of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.34), M.head);
      hl.position.set(L / 2 + 0.03, a.tall ? 0.45 * H : 0.42 * H, sgn * (width / 2 - 0.35));
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.38), M.tail);
      tl.position.set(-L / 2 - 0.03, a.tall ? 0.3 * H : 0.46 * H, sgn * (width / 2 - 0.32));
      body.add(hl, tl);
    }
  } else if (arch === 'formula') {
    width = 1.9;
    body.add(extrude([[X(0), .18], [X(0), .5], [X(.28), .55], [X(.38), .9], [X(.48), .62], [X(1), .3], [X(1), .18]], 0.85, paint));
    for (const sgn of [-1, 1]) { // Seitenkästen
      const pod = new THREE.Mesh(new THREE.BoxGeometry(L * 0.32, 0.38, 0.38), paint);
      pod.position.set(X(.36), 0.38, sgn * 0.6);
      pod.castShadow = true;
      body.add(pod);
    }
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.8), M.dark);
    rearWing.position.set(X(.03), 1.05, 0);
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 1.9), M.dark);
    frontWing.position.set(X(.98), 0.2, 0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    helmet.position.set(X(.4), 0.95, 0);
    body.add(rearWing, frontWing, helmet);
    for (const sgn of [-1, 1]) {
      wheels.push(wheel(0.42, 0.45, group, X(.14), sgn * 0.95));
      wheels.push(wheel(0.34, 0.36, group, X(.86), sgn * 0.9));
    }
  } else if (arch === 'bike') {
    width = 0.7;
    body.add(extrude([[X(.08), .35], [X(.55), .42], [X(.8), .75], [X(.95), .5], [X(.85), .3], [X(.2), .3]].map(([x, y]) => [x, y * 1.4]), 0.45, paint));
    const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1f3b73, roughness: 0.7 }));
    rider.position.set(X(.45), 1.25, 0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    helmet.position.set(X(.47), 1.75, 0);
    body.add(rider, helmet);
    wheels.push(wheel(0.3, 0.14, group, X(.15), 0));
    wheels.push(wheel(0.3, 0.14, group, X(.85), 0));
  } else if (arch === 'ufo') {
    width = L * 0.9;
    const disc = new THREE.Mesh(new THREE.SphereGeometry(L / 2, 32, 12), paint);
    disc.scale.set(1, 0.18, 0.9);
    disc.position.y = 1.0;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(L * 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
    dome.position.y = 1.15;
    const alien = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0x6fdc5a }));
    alien.position.y = 1.35;
    disc.castShadow = true;
    body.add(disc, dome, alien);
    for (let i = 0; i < 8; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color().setHSL(i / 8, 1, 0.5), emissiveIntensity: 1.5 }));
      lamp.position.set(Math.cos(i / 8 * Math.PI * 2) * L * 0.42, 0.95, Math.sin(i / 8 * Math.PI * 2) * L * 0.38);
      body.add(lamp);
    }
  } else if (arch === 'heli') {
    width = 2;
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), paint);
    cab.scale.set(L * 0.28, 1.0, 0.95);
    cab.position.set(X(.62), 1.4, 0);
    const glassNose = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 12), M.glass);
    glassNose.scale.set(1, 0.8, 0.9);
    glassNose.position.set(X(.8), 1.55, 0);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, L * 0.5, 8), paint);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(X(.2), 1.6, 0);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(L * 1.1, 0.04, 0.22), M.dark);
    rotor.position.set(X(.6), 2.55, 0);
    rotor.userData.spin = true;
    body.add(cab, glassNose, tail, rotor);
    for (const sgn of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 0.08, 0.08), M.dark);
      skid.position.set(X(.62), 0.25, sgn * 0.8);
      body.add(skid);
    }
  }

  // Kleine Extras für bekannte Fahrzeuge
  const roofY = a ? (a.cabin ? a.cabin[5] : 1) * H + 0.05 : 1.6;
  if (['police', 'ambulance', 'firetruck', 'policebike'].includes(v.kind) && a) {
    const bar = new THREE.Group();
    for (const sgn of [-1, 1]) {
      const m = new THREE.MeshStandardMaterial({ color: 0x0b1a40, emissive: 0x2f6bff, emissiveIntensity: 0 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), m);
      lamp.position.set(0, roofY + 0.08, sgn * 0.3);
      lamp.userData.blink = sgn;
      bar.add(lamp);
    }
    bar.position.x = a.cabin ? X((a.cabin[1] + a.cabin[2]) / 2) : X(.85);
    body.add(bar);
  }
  if (v.kind === 'taxi' && a) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.7), new THREE.MeshStandardMaterial({ color: 0xffe7a0, emissive: 0xffc61a, emissiveIntensity: 0.6 }));
    sign.position.set(X((a.cabin[1] + a.cabin[2]) / 2), roofY + 0.11, 0);
    body.add(sign);
  }

  group.userData = { wheels, paint, body, radius: Math.max(1.2, Math.min(L, 4) / 2), length: L };
  return group;
}

// Bewegte Details: Rotor, Blaulicht und Regenbogen-Lack
export function animateCar(mesh, t, special) {
  mesh.userData.body.traverse(o => {
    if (o.userData.spin) o.rotation.y += 0.6;
    if (o.userData.blink) o.material.emissiveIntensity = Math.floor(t * 6 + (o.userData.blink > 0 ? 1 : 0)) % 2 ? 3 : 0;
  });
  if (special === 'rainbow') mesh.userData.paint.color.setHSL((t * 0.25) % 1, 0.85, 0.5);
}

// Mitspieler beim freien Fahren online (Stadt, Stuntpark): eigene Position senden, die anderen geglättet zeigen.
// Wer kommt oder geht, erscheint bzw. verschwindet von selbst (es gibt keinen Start, man fährt einfach los).
// net (von online.js): { mySlot, players() → { slot: { name, kind, color, special, ps } }, latest(slot), send(state), serverNow() }
import * as THREE from 'three';
import { buildCar, animateCar } from './cars3d.js';

// Namensschild über dem Auto
function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px system-ui, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 14); g.fill();
  g.fillStyle = color; g.fillRect((256 - w) / 2 + 10, 26, 10, 10);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128 + 8, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(4, 1, 1);
  s.renderOrder = 10;
  return s;
}

// Sprechblase (Chat) über dem Namensschild
function bubble(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  let size = 40; // lange Texte: kleiner schreiben, notfalls kürzen
  for (; size > 22; size -= 2) { g.font = `bold ${size}px system-ui, sans-serif`; if (g.measureText(text).width <= 460) break; }
  while (g.measureText(text).width > 460 && text.length > 4) text = text.slice(0, -2) + '…';
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect((512 - w) / 2, 6, w, 68, 22); g.fill();
  g.beginPath(); g.moveTo(240, 72); g.lineTo(272, 72); g.lineTo(256, 92); g.fill();
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(6, 1.125, 1);
  s.renderOrder = 11;
  return s;
}

export function makeNetCars({ scene, kinds, net }) {
  const cars = new Map(); // slot → { mesh, tag, x, y, z, h, a, b, v, key }
  let sendT = 0;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  let itSlot = null, itSign = null; // Fangis: wer dran ist, bekommt ein rotes Schild
  const dropBubble = c => { if (!c.bubble) return; scene.remove(c.bubble); c.bubble.material.map.dispose(); c.bubble.material.dispose(); c.bubble = null; };

  function remove(slot) {
    const c = cars.get(slot);
    if (!c) return;
    scene.remove(c.mesh, c.tag);
    c.tag.material.map.dispose(); c.tag.material.dispose();
    dropBubble(c);
    cars.delete(slot);
  }

  return {
    // me: { x, y, z, h (Richtung), v (Tempo), a (Neigung vorne/hinten), b (Seitenneigung) }
    update(dt, t, me) {
      if ((sendT -= dt) <= 0) {
        sendT = 0.1; // 10× pro Sekunde
        const r = n => Math.round(n * 100) / 100;
        const st = { x: r(me.x), y: r(me.y || 0), z: r(me.z), h: r(wrap(me.h)), v: r(me.v), a: r(wrap(me.a || 0)), b: r(wrap(me.b || 0)) };
        if (typeof me.p === 'number') st.p = Math.min(99999, Math.round(me.p)); // Punkte (Stuntpark; die Regeln erlauben bis 99999)
        net.send(st);
      }
      const players = net.players() || {}, now = net.serverNow(), k = 1 - Math.exp(-dt * 12);
      for (const slot of [...cars.keys()]) if (!players[slot]) remove(slot);
      for (const s of Object.keys(players)) {
        const slot = +s, p = players[s];
        if (slot === net.mySlot) continue;
        const l = net.latest(slot);
        const fresh = l && now - l.t < 5000;
        let c = cars.get(slot);
        const key = p.kind + '|' + p.color + '|' + (p.special || '') + '|' + JSON.stringify(p.tune || {});
        if (c && c.key !== key) { remove(slot); c = null; } // anderes Auto gewählt
        if (!fresh) { if (c) c.mesh.visible = c.tag.visible = false; continue; }
        if (!c) {
          const mesh = buildCar({ kind: kinds[p.kind] ? p.kind : 'car', color: p.color, special: p.special || null, tune: p.tune || undefined }, kinds);
          mesh.rotation.order = 'YZX';
          const tag = nameTag(p.name, p.color || '#fff');
          scene.add(mesh, tag);
          c = { mesh, tag, key, x: l.x, y: l.y || 0, z: l.z, h: l.h, a: l.a || 0, b: l.b || 0, v: l.v };
          cars.set(slot, c);
        }
        c.mesh.visible = c.tag.visible = true;
        // dorthin, wo das Auto jetzt etwa ist (Meldung ist ein paar Hundertstel alt)
        const age = Math.min(0.4, Math.max(0, (now - l.t) / 1000));
        const tx = l.x + Math.cos(l.h) * l.v * age, tz = l.z + Math.sin(l.h) * l.v * age, ty = l.y || 0;
        if (Math.hypot(tx - c.x, tz - c.z) > 20) { c.x = tx; c.z = tz; c.y = ty; } // weit weg (z.B. neu gestartet): hinspringen
        else { c.x += (tx - c.x) * k; c.z += (tz - c.z) * k; c.y += (ty - c.y) * k; }
        c.h += wrap(l.h - c.h) * k;
        c.a += wrap((l.a || 0) - c.a) * k;
        c.b += wrap((l.b || 0) - c.b) * k;
        c.v = l.v;
        c.mesh.position.set(c.x, c.y, c.z);
        c.mesh.rotation.set(c.b, -c.h, c.a);
        for (const w of c.mesh.userData.wheels) w.rotation.z -= c.v * dt / 0.35;
        animateCar(c.mesh, t, p.special || null, c.y > 2); // hoch oben: Düsen an
        c.tag.position.set(c.x, c.y + 4, c.z);
        if (itSign && slot === itSlot) itSign.position.set(c.x, c.y + (c.bubble ? 6.8 : 5.5), c.z);
        if (c.bubble) {
          c.bubble.position.set(c.x, c.y + 5.4, c.z);
          if ((c.bubbleT -= dt) <= 0) dropBubble(c);
        }
      }
    },
    // Mitspieler in der Nähe (für Zusammenstösse und die Karte)
    list() {
      return [...cars.entries()].filter(([, c]) => c.mesh.visible)
        .map(([slot, c]) => ({ slot, x: c.x, y: c.y, z: c.z, h: c.h, v: c.v, r: Math.max(1.2, c.mesh.userData.radius * 0.8),
          color: (net.players()[slot] || {}).color || '#fff', name: (net.players()[slot] || {}).name || '' }));
    },
    // Eigenes Auto aus Mitspielern herausschieben; gibt true zurück, wenn es gerade zusammenstösst
    bump(me, radius) {
      let hit = false;
      for (const o of this.list()) {
        if (Math.abs((me.y || 0) - o.y) > 2.5) continue;
        const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz), min = (radius + o.r) * 0.85;
        if (d >= min || d < 0.01) continue;
        me.x += dx / d * (min - d) * 0.6; me.z += dz / d * (min - d) * 0.6;
        hit = true;
      }
      return hit;
    },
    // Chat-Nachricht als Sprechblase über dem Auto (5 Sekunden)
    say(slot, text) {
      const c = cars.get(slot);
      if (!c) return;
      dropBubble(c);
      c.bubble = bubble(text);
      c.bubbleT = 5;
      scene.add(c.bubble);
    },
    // Fangis: Schild „DRAN“ über diesem Mitspieler (null = keiner)
    setIt(slot) {
      if (slot === itSlot) return;
      itSlot = slot;
      if (!itSign) { itSign = bubble('🏃 DRAN!'); itSign.material.color.set('#ff6b6b'); itSign.visible = false; scene.add(itSign); }
      itSign.visible = slot !== null && cars.has(slot);
    },
    dispose() { for (const slot of [...cars.keys()]) remove(slot); if (itSign) { scene.remove(itSign); itSign = null; } itSlot = null; },
  };
}

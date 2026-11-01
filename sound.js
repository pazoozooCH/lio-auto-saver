// Geräusche aus dem Synthesizer (WebAudio, keine Tondateien): Motor mit Gängen, Reifenquietschen,
// Gras, Kies, Randsteine, Fahrtwind und Crashs. Benutzt das AudioContext aus game.js (window.audio).
let A = null; // { ctx, out, white, brown }

function setup() {
  const ctx = window.audio && window.audio();
  if (!ctx) return null;
  if (A && A.ctx === ctx) return A;
  const out = ctx.createDynamicsCompressor(); // nichts übersteuert, auch wenn vieles gleichzeitig klingt
  out.threshold.value = -16; out.knee.value = 12; out.ratio.value = 5;
  const hp = ctx.createBiquadFilter(); // tiefer als 40 Hz hört man nicht, kostet aber Lautstärke
  hp.type = 'highpass'; hp.frequency.value = 40; hp.Q.value = 0.7;
  hp.connect(out);
  out.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  const white = ctx.createBuffer(1, len, ctx.sampleRate), brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0), b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    w[i] = Math.random() * 2 - 1;
    last = (last + 0.02 * w[i]) / 1.02; // braunes Rauschen: tief und rumpelig
    b[i] = last * 3.5;
  }
  A = { ctx, out: hp, white, brown };
  return A;
}

const now = () => A.ctx.currentTime;
const smooth = (param, v, tc = 0.05) => param.setTargetAtTime(v, now(), tc);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function loopNoise(buf) {
  const s = A.ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.start(0, Math.random() * 1.9);
  return s;
}
function filter(type, freq, q = 1) {
  const f = A.ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}
function gain(v = 0) { const g = A.ctx.createGain(); g.gain.value = v; return g; }
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

// ---------- Motor ----------
// Klang: Zündfrequenz = Drehzahl/60 × Zylinder/2, viele Obertöne (Auspuff), leicht verstimmt (rau),
// Verbrennungsrauschen, sanft verzerrt und je nach Gas heller.
function engineVoice(cyl, dest) {
  const { ctx } = A;
  const n = 28, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.55) / Math.pow(k, 0.85) * (k === 2 || k === 4 ? 1.4 : 1);
  const o1 = ctx.createOscillator(); o1.setPeriodicWave(ctx.createPeriodicWave(re, im));
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 9;
  const sub = ctx.createOscillator(); sub.type = 'sine';
  const comb = loopNoise(A.white), combF = filter('bandpass', 300, 1.4), combG = gain(0.2);
  const mix = gain(1), shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 511.5 - 1) * 2.2);
  shaper.curve = curve;
  const lp = filter('lowpass', 600, 0.9), vol = gain(0);
  o1.connect(mix);
  chain(o2, gain(0.3), mix);
  chain(sub, gain(0.6), mix);
  chain(comb, combF, combG, mix);
  chain(mix, gain(0.45), shaper, lp, vol, dest);
  for (const o of [o1, o2, sub]) o.start();
  return {
    set(rpm, throttle, level, tc = 0.04) {
      const f = rpm / 60 * cyl / 2;
      smooth(o1.frequency, f, tc); smooth(o2.frequency, f, tc); smooth(sub.frequency, f / 2, tc);
      smooth(combF.frequency, f * 3, tc);
      smooth(lp.frequency, 220 + rpm * 0.3 + throttle * 1500, 0.06);
      smooth(combG.gain, 0.1 + throttle * 0.4, 0.06);
      smooth(vol.gain, level * (0.4 + throttle * 0.6), 0.06);
    },
    stop() {
      vol.gain.setTargetAtTime(0, now(), 0.05);
      for (const o of [o1, o2, sub, comb]) o.stop(now() + 0.4);
    },
  };
}

// Automatikgetriebe für den Klang: aus Tempo und Höchsttempo Gang und Drehzahl
export function gearbox(G = [0.24, 0.39, 0.54, 0.69, 0.84, 1.0]) {
  let gear = 0;
  return (v, maxV) => {
    v = Math.abs(v);
    let shifted = false;
    if (gear < G.length - 1 && v > maxV * G[gear] * 0.97) { gear++; shifted = true; }
    else if (gear > 0 && v < maxV * G[gear - 1] * 0.72) gear--;
    const rpm = 900 + 6400 * Math.max(0.1, Math.min(1, v / (maxV * G[gear])));
    return { rpm, gear, shifted };
  };
}

// ---------- Ein Auto mit allen Dauergeräuschen ----------
// update({ rpm, throttle, speed, slip, surface, other: { dist, rpm } }) jedes Bild aufrufen
export function createCarSound({ cyl = 6, level = 0.5 } = {}) {
  if (!setup()) return null;
  const { ctx, out } = A;
  const bus = gain(1); // eigener Regler für dieses Auto (beim Stoppen wird nur er getrennt)
  bus.connect(out);
  const engine = engineVoice(cyl, bus);
  const other = engineVoice(6, bus); // der nächste Gegner, leiser je weiter weg
  const srcs = []; // alles, was beim Stoppen angehalten werden muss
  const noiseSrc = buf => { const n = loopNoise(buf); srcs.push(n); return n; };

  // Reifenquietschen: zwei schmale Rauschbänder mit leichtem Flattern
  const sqSrc = noiseSrc(A.white), sqG = gain(0);
  const sq1 = filter('bandpass', 1350, 6), sq2 = filter('bandpass', 2450, 8);
  chain(sqSrc, sq1, gain(1), sqG); chain(sqSrc, sq2, gain(0.6), sqG); chain(sqG, bus);
  const lfo = ctx.createOscillator(), lfoG = gain(120);
  lfo.frequency.value = 7; chain(lfo, lfoG, sq1.frequency); lfo.start(); srcs.push(lfo);

  // Untergrund
  const grassG = gain(0), gravelG = gain(0), kerbG = gain(0), windG = gain(0), roadG = gain(0);
  chain(noiseSrc(A.brown), filter('lowpass', 260, 0.7), grassG, bus);                     // Rumpeln
  chain(noiseSrc(A.white), filter('bandpass', 1700, 0.5), gain(0.5), grassG);             // Halme rascheln
  chain(noiseSrc(A.white), filter('highpass', 2200, 0.7), gravelG, bus);                  // Kies
  const kerbO = ctx.createOscillator(); kerbO.type = 'square'; kerbO.start(); srcs.push(kerbO);
  chain(kerbO, filter('lowpass', 380, 1), kerbG, bus);                                      // Randstein-Rattern
  chain(noiseSrc(A.white), filter('bandpass', 650, 0.4), windG, bus);                     // Fahrtwind
  chain(noiseSrc(A.brown), filter('lowpass', 500, 0.6), roadG, bus);                      // Abrollen auf Asphalt
  let gravelT = 0;

  return {
    update({ rpm, throttle = 0, speed = 0, slip = 0, surface = 'asphalt', other: o = null, dt = 0.016 }) {
      const v = Math.abs(speed), vn = clamp(v / 55);
      engine.set(rpm, throttle, level);
      if (o && o.dist < 45) other.set(o.rpm, 0.7, level * 0.55 * (1 - o.dist / 45) ** 2);
      else other.set(1000, 0, 0);
      smooth(sqG.gain, surface === 'asphalt' || surface === 'kerb' ? slip * 1.6 : slip * 0.15, 0.04);
      smooth(sq1.frequency, 1200 + slip * 350, 0.1);
      smooth(grassG.gain, surface === 'grass' ? 0.25 + vn * 0.9 : 0, 0.05);
      smooth(gravelG.gain, surface === 'gravel' ? 0.15 + vn * 0.55 : 0, 0.05);
      smooth(kerbG.gain, surface === 'kerb' && v > 3 ? 0.35 : 0, 0.03);
      smooth(kerbO.frequency, Math.max(4, v / 1.5), 0.03);
      smooth(windG.gain, vn * vn * 0.35, 0.1);
      smooth(roadG.gain, surface === 'asphalt' ? vn * 0.3 : 0, 0.1);
      if (surface === 'gravel' && v > 2) { // einzelne Steinchen, die gegen das Auto spritzen
        gravelT -= dt * v * 0.6;
        while (gravelT < 0) { gravelT += 0.3 + Math.random(); click(2500 + Math.random() * 3500, 0.03 + vn * 0.05); }
      }
    },
    shift() { blowOff(); },
    stop() {
      engine.stop(); other.stop();
      for (const n of srcs) n.stop(now() + 0.4);
      bus.gain.setTargetAtTime(0, now(), 0.05);
      setTimeout(() => bus.disconnect(), 600);
    },
  };
}

// ---------- Einzelgeräusche ----------
function burst(dur, f0, f1, vol, q = 0.7, buf = A.white) {
  const { ctx } = A, t = now();
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = filter('lowpass', f0, q), g = gain(0);
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  chain(s, f, g, A.out);
  s.start(t, Math.random() * 1.5, dur + 0.05);
}
function tone(freq, dur, vol, type = 'sine', endFreq = null, delay = 0) {
  const { ctx } = A, t = now() + delay;
  const o = ctx.createOscillator(), g = gain(0);
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  chain(o, g, A.out);
  o.start(t); o.stop(t + dur + 0.02);
}
function click(freq, vol) { tone(freq, 0.03, vol, 'triangle'); }
function blowOff() { // „Pschh“ beim Schalten
  if (!setup()) return;
  const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.white;
  const f = filter('bandpass', 3200, 0.8), g = gain(0);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.28);
  chain(s, f, g, A.out); s.start(t, Math.random(), 0.32);
}

// Crash: intensity 0…1; kind: 'car' (Blech gegen Blech), 'tyres' (Reifenstapel), 'crush' (Presse), 'slam' (Pressplatte)
export function crash(intensity, kind = 'car') {
  if (!setup()) return;
  const I = clamp(intensity, 0.08, 1);
  if (kind === 'tyres') { // dumpf und gummiartig
    tone(85, 0.3, 0.8 * I, 'sine', 38);
    burst(0.22, 900, 150, 0.6 * I, 0.8, A.brown);
    return;
  }
  if (kind === 'slam') { // schwere Stahlplatte schlägt auf
    tone(70, 0.45, 0.9 * I, 'sine', 32);
    burst(0.3, 1400, 120, 0.7 * I);
    tone(180, 0.6, 0.06 * I, 'triangle', 170);
    return;
  }
  const crush = kind === 'crush';
  tone(crush ? 95 : 120, crush ? 0.6 : 0.3, 0.9 * I, 'sine', 35); // Schlag
  burst(crush ? 0.7 : 0.4, 3200, 300, 0.9 * I);                   // Blech knirscht
  burst(crush ? 0.5 : 0.25, 800, 120, 0.7 * I, 1, A.brown);
  for (const f of [430, 1010, 1730, 2480, 3300]) { // metallisches Nachklingen
    const ff = f * (0.88 + Math.random() * 0.24);
    tone(ff, 0.25 + Math.random() * 0.6, 0.05 * I, 'sine', ff * 0.97);
  }
  if (crush) { // Ächzen und Knacken, während die Presse zudrückt
    tone(62, 0.8, 0.25, 'sawtooth', 34);
    for (let k = 0; k < 7; k++) setTimeout(() => A && burst(0.08, 2600, 600, 0.35), 60 + k * 70 + Math.random() * 40);
  }
  if (I > 0.55 || crush) { // Glas klirrt
    for (let k = 0; k < 9; k++) tone(2600 + Math.random() * 3800, 0.08 + Math.random() * 0.15, 0.04, 'sine', null, 0.04 + Math.random() * 0.35);
  }
}

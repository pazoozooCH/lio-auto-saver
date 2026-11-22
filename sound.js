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

// ---------- Klangprofile: jedes Fahrzeug klingt nach seiner Antriebsart ----------
// engine: Zylinder, Leerlauf- und Höchstdrehzahl, Helligkeit, Nageln (Diesel), Bass (Brabbeln)
const PROFILES = {
  car: { type: 'engine', cyl: 4, idle: 800, red: 5600, bright: 0.8, knock: 0.15, sub: 0.5 },
  small: { type: 'engine', cyl: 3, idle: 900, red: 5800, bright: 0.75, knock: 0.2, sub: 0.35 },
  boxer: { type: 'engine', cyl: 4, idle: 750, red: 4800, bright: 0.6, knock: 0.35, sub: 0.9 },
  muscle: { type: 'engine', cyl: 8, idle: 650, red: 5600, bright: 0.7, knock: 0.2, sub: 1.1 },
  race: { type: 'engine', cyl: 8, idle: 1300, red: 8200, bright: 1.05, knock: 0.12, sub: 0.45 },
  diesel: { type: 'engine', cyl: 6, idle: 600, red: 2500, bright: 0.45, knock: 0.65, sub: 0.9 },
  heavy: { type: 'engine', cyl: 6, idle: 520, red: 2100, bright: 0.38, knock: 0.75, sub: 1.0 },
  bike: { type: 'engine', cyl: 2, idle: 1200, red: 8500, bright: 0.85, knock: 0.3, sub: 0.25 },
  twostroke: { type: 'engine', cyl: 2, idle: 1700, red: 9000, bright: 0.9, knock: 0.5, sub: 0.15 },
  electric: { type: 'electric' },
  magic: { type: 'electric', magic: true },
  turbine: { type: 'turbine' },
  rotor: { type: 'rotor', rate: 16 },
  prop: { type: 'rotor', rate: 28 },
  steam: { type: 'steam' },
  carriage: { type: 'carriage' },
  // Echte Autos (Wunsch Lionel: jedes klingt anders); pops = „Klepfen“ (Knallen im Auspuff beim Gaswegnehmen und Hochschalten)
  bmw6: { type: 'engine', cyl: 6, idle: 820, red: 7300, bright: 0.95, knock: 0.12, sub: 0.55, pops: 1 },      // BMW Reihensechser
  amg8: { type: 'engine', cyl: 8, idle: 700, red: 7000, bright: 0.85, knock: 0.18, sub: 1.15, pops: 0.8 },   // AMG-V8: tief, brabbelt
  usv8: { type: 'engine', cyl: 8, idle: 600, red: 6200, bright: 0.7, knock: 0.22, sub: 1.25, pops: 0.35 },   // amerikanischer V8
  softv8: { type: 'engine', cyl: 8, idle: 650, red: 6000, bright: 0.55, knock: 0.1, sub: 0.8 },             // leiser Luxus-V8
  v10: { type: 'engine', cyl: 10, idle: 1050, red: 8700, bright: 1.1, knock: 0.1, sub: 0.45, pops: 0.4 },    // Audi R8
  v12: { type: 'engine', cyl: 12, idle: 1000, red: 9200, bright: 1.2, knock: 0.08, sub: 0.35, pops: 0.25 },  // Lamborghini, Ferrari, Pagani
  softv12: { type: 'engine', cyl: 12, idle: 600, red: 5800, bright: 0.5, knock: 0.05, sub: 0.7 },           // Rolls-Royce: fast lautlos
  flat6: { type: 'engine', cyl: 6, idle: 950, red: 9000, bright: 1.05, knock: 0.2, sub: 0.4, pops: 0.3 },    // Porsche-Boxer
  w16: { type: 'engine', cyl: 16, idle: 850, red: 7000, bright: 0.95, knock: 0.08, sub: 0.9, pops: 0.2 },    // Bugatti
  turbo4: { type: 'engine', cyl: 4, idle: 850, red: 6800, bright: 0.9, knock: 0.15, sub: 0.45, pops: 0.6 },  // Golf GTI
  twinv8: { type: 'engine', cyl: 8, idle: 1000, red: 8500, bright: 1.05, knock: 0.12, sub: 0.6, pops: 0.5 }, // McLaren, Koenigsegg, Ferrari 488
};
const KIND_SOUND = {};
const group = (name, kinds) => { for (const k of kinds.split(' ')) KIND_SOUND[k] = name; };
group('diesel', 'van postauto doubledecker schoolbus policebus delivery umzug bakery armored treasure hotdog icecream ambulance garbage camper firetruck dumper cement crane tanker carrier sweeper taco parcel watercannon popcorn circus candy towtruck snowplow jeep safari offroad rescue pirate');
group('heavy', 'tractor excavator dozer groomer');
group('muscle', 'muscle pickup monster polar dragon limo lowrider firework robot dino racetruck');
group('race', 'racer dragster stockcar rally sports nightracer shark phoenix policebike hyper lionelx');
group('small', 'mini smart isetta hatch kompakt');
group('boxer', 'beetle buggy hippie snail');
group('twostroke', 'scooter pizza moped tuktuk gokart quad snowmobile mower');
group('electric', 'ecar tram golfcart forklift cargobike rover sub bobbycar');
group('magic', 'ufo timemachine unicorn ghost');
group('turbine', 'jet shuttle rocketcar');
group('rotor', 'heli');
group('prop', 'hovercraft zeppelin');
group('steam', 'train');
group('carriage', 'royal pumpkin sleigh');
// Echte Autos: jedes mit eigenem Motor (überschreibt die Gruppen oben)
group('bmw6', 'offroad coupe hatch'); group('amg8', 'jeep e63 muscle kombi pickupxl mansory'); group('usv8', 'roadster trackhawk police oldtimer');
group('softv8', 'limo bentley car luxlimo'); group('v10', 'racer'); group('v12', 'hyperev hyper musclegt'); group('softv12', 'luxsuv');
group('flat6', 'sports gt3rs gtcar'); group('w16', 'luxlimo'); group('turbo4', 'kompakt tiguanx q5 kodiaq minivan'); group('twinv8', 'supercar stockcar formula lemans gtlegend');
group('diesel', 'safari delivery ambulance'); group('small', 'mini smart'); group('electric', 'ecar tiguan24');
// Jedes echte Auto mit seinem eigenen Motor (Daten wie beim echten Auto): cyl Zylinder, idle/red Leerlauf/Höchstdrehzahl,
// bright Helligkeit, sub Tiefe, knock Nageln, turbo Pfeifen, sc Kompressor-Heulen, burble V8-Blubbern (ungleichmässig),
// rasp Kreischen (V10/V12), res Auspuff-Resonanz (Hz), pops Klepfen
const E = (cyl, idle, red, bright, sub, o = {}) => ({ type: 'engine', cyl, idle, red, bright, sub, knock: 0.12, ...o });
const KIND_PROFILE = {
  offroad: E(6, 750, 7000, 0.85, 0.55, { turbo: 0.35, pops: 0.5, res: 220 }),            // BMW X4 (Reihensechser Turbo)
  coupe: E(6, 850, 7600, 1.0, 0.5, { turbo: 0.5, pops: 1, res: 260, rasp: 0.3 }),         // BMW M4
  hatch: E(4, 800, 4600, 0.5, 0.7, { knock: 0.55, turbo: 0.4 }),                          // BMW X2 20d (Diesel)
  minivan: E(4, 800, 6000, 0.7, 0.5, { turbo: 0.2 }), kodiaq: E(4, 780, 6500, 0.75, 0.55, { turbo: 0.3 }),
  q5: E(4, 760, 6500, 0.8, 0.55, { turbo: 0.35, res: 200 }), tiguanx: E(4, 800, 6500, 0.78, 0.5, { turbo: 0.3 }),
  tiguan24: E(4, 820, 6300, 0.7, 0.5, { turbo: 0.25 }), ecar: E(6, 650, 6500, 0.6, 0.7, { res: 170 }), // Cadillac V6
  kompakt: E(4, 850, 6800, 0.95, 0.5, { turbo: 0.5, pops: 0.6, res: 240 }),              // Golf GTI
  car: E(8, 700, 6800, 0.8, 1.0, { turbo: 0.4, burble: 0.25, pops: 0.3 }),               // Cayenne Turbo
  kombi: E(8, 750, 6800, 0.9, 1.1, { turbo: 0.45, burble: 0.35, pops: 0.7 }),            // Audi RS6
  e63: E(8, 750, 7000, 0.9, 1.2, { turbo: 0.4, burble: 0.5, pops: 0.9 }),                // AMG E63
  jeep: E(8, 620, 6200, 0.7, 1.2, { burble: 0.45, pops: 0.5 }),                          // G 550
  muscle: E(8, 800, 7200, 0.95, 1.15, { burble: 0.55, pops: 0.8, rasp: 0.25 }),          // SLS AMG (Sauger)
  pickupxl: E(8, 800, 6800, 0.9, 1.0, { turbo: 0.45, burble: 0.3, pops: 0.7 }),          // Urus
  mansory: E(8, 700, 6500, 0.85, 1.2, { sc: 0.5, burble: 0.5, pops: 1 }),                // Range Rover SVR (Kompressor)
  trackhawk: E(8, 650, 6200, 0.75, 1.3, { sc: 0.9, burble: 0.6, pops: 0.4 }),            // Trackhawk (Kompressor)
  police: E(8, 650, 6200, 0.75, 1.25, { sc: 0.7, burble: 0.55, pops: 0.3 }),             // Charger Hellcat
  roadster: E(8, 650, 6600, 0.85, 1.2, { burble: 0.6, pops: 0.5 }),                      // Corvette C8
  oldtimer: E(8, 550, 4800, 0.5, 1.1, { burble: 0.5, knock: 0.25 }),                     // Suburban 1989
  delivery: E(8, 600, 5200, 0.55, 1.0, { burble: 0.35, knock: 0.2 }),                    // Chevrolet Express
  safari: E(6, 700, 4500, 0.55, 0.8, { knock: 0.5, turbo: 0.3 }),                        // Defender (Diesel)
  ambulance: E(4, 750, 4200, 0.45, 0.8, { knock: 0.7, turbo: 0.25 }),                    // Sprinter (Diesel)
  limo: E(12, 600, 6000, 0.5, 0.7, { knock: 0.05 }), bentley: E(8, 700, 6800, 0.85, 1.0, { turbo: 0.3, burble: 0.4, pops: 0.5 }),
  luxsuv: E(12, 550, 5200, 0.45, 0.7, { knock: 0.04 }),                                  // Cullinan: fast lautlos
  luxlimo: E(16, 900, 9000, 1.15, 0.7, { rasp: 0.35 }),                                  // Bugatti Tourbillon V16
  hyperev: E(12, 1000, 9500, 1.25, 0.35, { rasp: 0.5, pops: 0.3 }),                      // Revuelto
  hyper: E(12, 1100, 9250, 1.3, 0.3, { rasp: 0.55, pops: 0.2 }),                         // LaFerrari
  musclegt: E(12, 900, 6800, 1.0, 0.6, { turbo: 0.5, rasp: 0.3, pops: 0.4 }),            // Pagani (AMG-V12 Turbo)
  supercar: E(8, 1000, 8000, 1.1, 0.45, { turbo: 0.4, rasp: 0.4, pops: 0.3 }),           // Ferrari 488 Pista
  stockcar: E(8, 1000, 8100, 1.05, 0.4, { turbo: 0.55, rasp: 0.35, pops: 0.5 }),         // McLaren 765LT
  formula: E(8, 1050, 8500, 1.1, 0.4, { turbo: 0.6, rasp: 0.35, pops: 0.4 }),            // McLaren P1
  lemans: E(8, 1000, 8500, 1.15, 0.5, { turbo: 0.7, rasp: 0.3, pops: 0.6 }),             // Koenigsegg Jesko
  gtlegend: E(8, 1000, 8250, 1.1, 0.5, { turbo: 0.75, pops: 0.6 }),                      // Koenigsegg One:1
  racer: E(10, 1100, 8700, 1.15, 0.45, { rasp: 0.45, pops: 0.5 }),                       // Audi R8 V10
  sports: E(6, 850, 7500, 0.95, 0.45, { turbo: 0.35, rasp: 0.25, knock: 0.2 }),          // 911 Carrera 4S
  gt3rs: E(6, 950, 9000, 1.2, 0.35, { rasp: 0.5, pops: 0.4 }),                           // 911 GT3 RS (Sauger)
  gtcar: E(6, 900, 7200, 1.0, 0.45, { turbo: 0.8, pops: 0.5 }),                          // 911 GT2 RS
  smart: E(4, 900, 8200, 1.0, 0.4, { sc: 0.5, rasp: 0.25 }),                             // Lotus Exige (Kompressor)
  mini: E(4, 800, 6200, 0.7, 0.45, { turbo: 0.2 }),                                      // Jeep Renegade
};
export const soundOf = kind => KIND_PROFILE[kind] || PROFILES[KIND_SOUND[kind] || 'car'];
// Knall im Auspuff („Klepfen“): kurzer Rauschstoss und tiefer Wumms
function pop(level) {
  if (!setup()) return;
  const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.white;
  const f = filter('bandpass', 500 + Math.random() * 900, 1.1), g = gain(0), v = 0.12 + Math.random() * 0.22 * level;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.05);
  chain(s, f, g, A.out); s.start(t, Math.random(), 0.12);
  const o = A.ctx.createOscillator(), og = gain(0); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
  og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.005); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  chain(o, og, A.out); o.start(t); o.stop(t + 0.12);
}

// Verbrennungsmotor: Zündfrequenz = Drehzahl/60 × Zylinder/2, viele Obertöne (Auspuff), leicht verstimmt,
// Diesel „nageln“ (Rauschen im Takt der Zündung), V8 „brabbeln“ (halbe Zündfrequenz), je nach Gas heller.
function engineVoice(P, dest) {
  const { ctx } = A;
  const n = 24, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.6) / Math.pow(k, 1.05) * (k === 2 ? 1.5 : 1);
  const o1 = ctx.createOscillator(); o1.setPeriodicWave(ctx.createPeriodicWave(re, im));
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 8;
  const sub = ctx.createOscillator(); sub.type = 'triangle';
  const comb = loopNoise(A.white), combF = filter('bandpass', 300, 1.2), combG = gain(0.15);
  const knock = loopNoise(A.white), knockF = filter('bandpass', 1400, 1.5), knockGate = gain(0), knockO = ctx.createOscillator();
  knockO.type = 'square';
  chain(knockO, gain(1), knockGate.gain); // Rauschen im Takt der Zündung = Nageln
  const mix = gain(1), shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 511.5 - 1) * 2);
  shaper.curve = curve;
  const lp = filter('lowpass', 500, 0.8), vol = gain(0);
  o1.connect(mix);
  chain(o2, gain(0.25), mix);
  chain(sub, gain(P.sub), mix);
  chain(comb, combF, combG, mix);
  chain(knock, knockF, knockGate, gain(P.knock * 1.2), mix);
  // Auspuff-Resonanz (jedes Auto anders), V8-Blubbern (Lautstärke schwankt im Takt), Turbo-Pfeifen, Kompressor-Heulen, Kreischen
  const res = filter('peaking', P.res || 200, 1.2); res.gain.value = P.res ? 7 : 0;
  const am = gain(1), amO = ctx.createOscillator(), amG = gain((P.burble || 0) * 0.12); amO.type = 'sine'; // nur ein leichtes Blubbern (stark = Dampflok)
  chain(amO, amG, am.gain); am.gain.value = 1 - (P.burble || 0) * 0.08;
  chain(mix, gain(0.42), shaper, res, lp, am, vol, dest);
  const tw = ctx.createOscillator(), twG = gain(0); tw.type = 'sine'; chain(tw, twG, dest);
  const scO = ctx.createOscillator(), scG = gain(0); scO.type = 'triangle'; chain(scO, filter('lowpass', 3000, 0.7), scG, dest);
  const rasp = loopNoise(A.white), raspF = filter('bandpass', 2600, 1.6), raspGate = gain(0), raspG = gain(0);
  raspGate.gain.value = 1; chain(rasp, raspF, raspGate, raspG, dest); // gleichmässiges Kreischen, nicht in Stössen
  for (const o of [o1, o2, sub, knockO, amO, tw, scO]) o.start();
  let lastThr = 0, popT = 0, popWait = 0;
  return {
    pops(n = 3) { if (P.pops) popT = Math.max(popT, 0.12 * n); }, // beim Hochschalten
    set(frac, throttle, level, dt = 0.016) {
      if (P.pops) { // Gas weg bei hoher Drehzahl: es knallt und klepft im Auspuff
        if (throttle < 0.2 && lastThr > 0.5 && frac > 0.35) popT = 0.5 + 0.6 * P.pops;
        lastThr = throttle;
        if (popT > 0) { popT -= dt; popWait -= dt; if (popWait <= 0) { pop(level * 2 * P.pops); popWait = 0.04 + Math.random() * (0.16 / P.pops); } }
      }
      const wob = frac < 0.15 ? 1 + 0.018 * Math.sin(now() * 7.3) + 0.01 * Math.sin(now() * 2.1) : 1; // Leerlauf schwankt leicht
      const rpm = (P.idle + (P.red - P.idle) * frac) * wob, f = rpm / 60 * P.cyl / 2, tc = 0.04;
      smooth(amO.frequency, f / 2, tc); // Blubbern
      smooth(tw.frequency, 1500 + frac * 6500 * (0.4 + throttle * 0.6), 0.15); smooth(twG.gain, (P.turbo || 0) * 0.035 * level * throttle * frac * frac, 0.12);
      smooth(scO.frequency, rpm * 0.32, tc); smooth(scG.gain, (P.sc || 0) * 0.05 * level * (0.25 + throttle) * frac, 0.06);
      smooth(raspF.frequency, 2000 + frac * 3200, tc); smooth(raspG.gain, (P.rasp || 0) * 0.22 * level * (0.3 + throttle * 0.7) * frac, 0.05);
      smooth(o1.frequency, f, tc); smooth(o2.frequency, f, tc); smooth(sub.frequency, f / 2, tc);
      smooth(knockO.frequency, f, tc);
      smooth(combF.frequency, f * 2, tc);
      smooth(lp.frequency, (180 + frac * 900 + throttle * 500) * P.bright, 0.06);
      smooth(combG.gain, 0.08 + throttle * 0.3, 0.06);
      smooth(vol.gain, level * (0.4 + throttle * 0.6), 0.06);
    },
    stop() {
      vol.gain.setTargetAtTime(0, now(), 0.05);
      for (const o of [o1, o2, sub, comb, knock, knockO, amO, tw, scO, rasp]) o.stop(now() + 0.4);
      for (const gnode of [twG, scG, raspG]) gnode.gain.setTargetAtTime(0, now(), 0.05);
    },
  };
}

// Elektromotor: tiefes Summen und ein Surren, das mit dem Tempo steigt („magic“: schwebend mit Vibrato)
function electricVoice(P, dest) {
  const { ctx } = A;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), hum = ctx.createOscillator();
  o1.type = 'sine'; o2.type = 'triangle'; hum.type = 'sine'; hum.frequency.value = P.magic ? 110 : 60;
  const vib = ctx.createOscillator(), vibG = gain(P.magic ? 14 : 0);
  vib.frequency.value = 5.5; chain(vib, vibG, o1.frequency);
  const vol = gain(0), lp = filter('lowpass', 1600, 0.7);
  chain(o1, gain(0.6), lp); chain(o2, gain(P.magic ? 0.3 : 0.15), lp); chain(hum, gain(0.4), lp);
  chain(lp, vol, dest);
  for (const o of [o1, o2, hum, vib]) o.start();
  return {
    set(frac, throttle, level) {
      const f = 90 + frac * 520;
      smooth(o1.frequency, f, 0.05); smooth(o2.frequency, f * (P.magic ? 1.5 : 2.02), 0.05);
      smooth(vol.gain, level * (0.18 + throttle * 0.35 + frac * 0.2), 0.08);
    },
    stop() { vol.gain.setTargetAtTime(0, now(), 0.05); for (const o of [o1, o2, hum, vib]) o.stop(now() + 0.4); },
  };
}

// Düse: Rauschen, das mit dem Schub heller wird, dazu ein leises Pfeifen und tiefes Grollen
function turbineVoice(P, dest) {
  const { ctx } = A;
  const roar = loopNoise(A.white), roarF = filter('bandpass', 400, 0.8), rumble = loopNoise(A.brown);
  const whine = ctx.createOscillator(); whine.type = 'sine';
  const vol = gain(0), whineG = gain(0.05);
  chain(roar, roarF, gain(0.9), vol); chain(rumble, filter('lowpass', 180, 0.7), gain(0.8), vol); chain(whine, whineG, vol);
  vol.connect(dest);
  whine.start();
  return {
    set(frac, throttle, level) {
      smooth(roarF.frequency, 250 + frac * 900 + throttle * 300, 0.1);
      smooth(whine.frequency, 700 + frac * 900, 0.15);
      smooth(vol.gain, level * (0.25 + throttle * 0.55), 0.1);
    },
    stop() { vol.gain.setTargetAtTime(0, now(), 0.05); for (const o of [roar, rumble, whine]) o.stop(now() + 0.4); },
  };
}

// Rotor oder Propeller: dumpfes „Wopp-wopp“
function rotorVoice(P, dest) {
  const { ctx } = A;
  const src = loopNoise(A.brown), f = filter('lowpass', 420, 0.8), gate = gain(0.5), lfo = ctx.createOscillator(), vol = gain(0);
  lfo.type = 'triangle'; lfo.frequency.value = P.rate;
  chain(lfo, gain(0.5), gate.gain);
  const motor = ctx.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 80;
  chain(src, f, gate, vol); chain(motor, filter('lowpass', 300, 0.7), gain(0.15), vol);
  vol.connect(dest);
  lfo.start(); motor.start();
  return {
    set(frac, throttle, level) {
      smooth(lfo.frequency, P.rate * (0.85 + frac * 0.3), 0.2);
      smooth(motor.frequency, 70 + frac * 60, 0.1);
      smooth(vol.gain, level * (0.5 + throttle * 0.5), 0.1);
    },
    stop() { vol.gain.setTargetAtTime(0, now(), 0.05); for (const o of [src, lfo, motor]) o.stop(now() + 0.4); },
  };
}

// Dampflok: „Tschu“-Stösse im Takt der Räder und leises Zischen
function steamVoice(P, dest) {
  const vol = gain(0), hiss = loopNoise(A.white), hissG = gain(0.06);
  chain(hiss, filter('highpass', 2500, 0.7), hissG, vol);
  vol.connect(dest);
  let t = 0, lastLevel = 0;
  return {
    set(frac, throttle, level, dt = 1 / 60) {
      lastLevel = level;
      smooth(vol.gain, level, 0.1);
      t -= dt * (0.8 + frac * 7);
      if (t < 0) { t += 1; chuff(level * (0.35 + throttle * 0.5)); }
    },
    stop() { vol.gain.setTargetAtTime(0, now(), 0.05); hiss.stop(now() + 0.4); },
  };
}
function chuff(vol) {
  const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.white;
  const f = filter('bandpass', 700, 0.9), g = gain(0);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.015); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
  chain(s, f, g, A.out); s.start(t, Math.random(), 0.25);
}

// Kutsche: kein Motor, nur Holzräder, die über den Boden rumpeln
function carriageVoice(P, dest) {
  const src = loopNoise(A.brown), vol = gain(0);
  chain(src, filter('lowpass', 320, 0.8), vol, dest);
  return {
    set(frac, throttle, level) { smooth(vol.gain, level * frac * 1.2, 0.1); },
    stop() { vol.gain.setTargetAtTime(0, now(), 0.05); src.stop(now() + 0.4); },
  };
}

function makeVoice(kind, dest) {
  const P = soundOf(kind);
  const v = ({ engine: engineVoice, electric: electricVoice, turbine: turbineVoice, rotor: rotorVoice, steam: steamVoice, carriage: carriageVoice })[P.type](P, dest);
  return SAMPLES[kind] && P.type === 'engine' ? recordedVoice(P, dest, SAMPLES[kind], v) : v;
}

// ---------- Echte Motor-Aufnahmen (freesound.org, Namen in der Danke-Zeile) ----------
// Je Auto eine ruhige Leerlauf-Stelle (sounds/<typ>_idle.wav, 1,5–3 s).
// Nicht als kurze Schleife (klang wie eine Dampflok) und nicht in winzigen Körnchen (rauschte), sondern lange, sanft überblendete
// Stücke von zufälligen Stellen (pieceLayer) – nur im Leerlauf; beim Hochdrehen übernimmt der nachgebaute Motor (dreht sauber hoch).
const SAMPLES = {
  coupe: {}, jeep: {}, muscle: {}, roadster: {}, car: {}, sports: {}, gt3rs: {},
  supercar: {}, hyperev: {}, racer: {}, kombi: {}, luxsuv: {}, kompakt: {}, offroad: {},
};
const bufCache = new Map();
function loadBuf(url) {
  if (!bufCache.has(url)) bufCache.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(url)))).then(b => A.ctx.decodeAudioData(b)).catch(() => null));
  return bufCache.get(url);
}
export function preloadEngineSounds(kinds) { if (!setup()) return; for (const k of kinds) if (SAMPLES[k]) loadBuf('sounds/' + k + '_idle.wav'); }
// Lange Stücke (1–2,5 s) von zufälligen Stellen, sanft überblendet (gleich laut): klingt wie der echte Motor, ohne Takt
function pieceLayer(buf, dest) {
  const g = gain(0); g.connect(dest);
  const len = Math.max(0.6, Math.min(2.5, buf.duration * 0.8)), F = 0.35, hop = len * (1 - F);
  const curve = new Float32Array(128); for (let i = 0; i < 128; i++) { const x = i / 127; curve[i] = x < F ? Math.sin(Math.PI / 2 * x / F) : x > 1 - F ? Math.cos(Math.PI / 2 * (x - (1 - F)) / F) : 1; }
  let next = 0, last = -1;
  return {
    g,
    run(rate) {
      const t = now(); if (next < t) next = t + 0.02;
      while (next < t + 0.3) {
        const s = A.ctx.createBufferSource(), e = A.ctx.createGain(); s.buffer = buf; s.playbackRate.value = rate;
        e.gain.value = 0; s.connect(e); e.connect(g);
        const span = Math.max(0.01, buf.duration - len * rate - 0.01);
        let off = Math.random() * span; if (last >= 0 && Math.abs(off - last) < span * 0.25) off = (off + span / 2) % span; last = off;
        e.gain.setValueCurveAtTime(curve, next, len);
        s.start(next, off); s.stop(next + len + 0.05);
        next += hop;
      }
    },
  };
}
function recordedVoice(P, dest, spec, synth) {
  // Echte Aufnahme nur im Leerlauf und bei wenig Gas (dort klingt sie echt); beim Hochdrehen übernimmt der nachgebaute Motor
  const kind = Object.keys(SAMPLES).find(k => SAMPLES[k] === spec), out = gain(1); chain(out, dest);
  let idle = null, ready = false, stopped = false;
  loadBuf('sounds/' + kind + '_idle.wav').then(bi => { if (stopped || !bi) return; idle = pieceLayer(bi, out); ready = true; });
  return {
    pops: n => synth.pops && synth.pops(n),
    set(frac, throttle, level, dt = 0.016) {
      const rpm = P.idle + (P.red - P.idle) * frac;
      const w = ready ? 1 - Math.max(0, Math.min(1, (rpm / P.idle - 1.15) / 0.8)) : 0, ws = w * w * (3 - 2 * w); // 1 = nur Aufnahme
      synth.set(frac, throttle, level * (1 - ws * 0.8), dt);
      if (!ready || stopped) return;
      idle.run(Math.max(0.9, Math.min(1.5, rpm / P.idle)));
      smooth(idle.g.gain, level * (0.75 + throttle * 0.35) * ws * 1.1, 0.08);
    },
    stop() { stopped = true; synth.stop(); out.gain.setTargetAtTime(0, now(), 0.05); },
  };
}

// Automatikgetriebe für den Klang: aus Tempo und Höchsttempo Gang und Drehzahl (0 = Leerlauf, 1 = Höchstdrehzahl).
// Elektro, Düse, Rotor, Dampf und Kutsche haben keine Gänge.
export function gearbox(kind, G = [0.24, 0.39, 0.54, 0.69, 0.84, 1.0]) {
  const geared = soundOf(kind).type === 'engine';
  let gear = 0;
  return (v, maxV) => {
    v = Math.abs(v);
    if (!geared) return { frac: Math.min(1, v / maxV), gear: 0, shifted: false };
    let shifted = false;
    if (gear < G.length - 1 && v > maxV * G[gear] * 0.97) { gear++; shifted = true; }
    else if (gear > 0 && v < maxV * G[gear - 1] * 0.72) gear--;
    return { frac: Math.max(0.06, Math.min(1, v / (maxV * G[gear]))), gear, shifted };
  };
}

// ---------- Ein Auto mit allen Dauergeräuschen ----------
// update({ frac, throttle, speed, slip, surface, kerb, other: { dist, frac, kind } }) jedes Bild aufrufen
export function createCarSound({ kind = 'car', level = 0.5 } = {}) {
  if (!setup()) return null;
  const { ctx, out } = A;
  const bus = gain(1); // eigener Regler für dieses Auto (beim Stoppen wird nur er getrennt)
  bus.connect(out);
  const engine = makeVoice(kind, bus);
  let other = null, otherKind = null; // der nächste Gegner, leiser je weiter weg
  const srcs = []; // alles, was beim Stoppen angehalten werden muss
  const noiseSrc = buf => { const n = loopNoise(buf); srcs.push(n); return n; };

  // Reifenquietschen: zwei Rauschbänder mit leichtem Flattern
  const sqSrc = noiseSrc(A.white), sqG = gain(0);
  const sq1 = filter('bandpass', 950, 6), sq2 = filter('bandpass', 1750, 8);
  chain(sqSrc, sq1, gain(1), sqG); chain(sqSrc, sq2, gain(0.5), sqG); chain(sqG, bus);
  const lfo = ctx.createOscillator(), lfoG = gain(70);
  lfo.frequency.value = 6; chain(lfo, lfoG, sq1.frequency); lfo.start(); srcs.push(lfo);

  // Untergrund
  const grassG = gain(0), gravelG = gain(0), windG = gain(0), roadG = gain(0);
  chain(noiseSrc(A.brown), filter('lowpass', 240, 0.7), grassG, bus);                     // Rumpeln
  chain(noiseSrc(A.white), filter('bandpass', 1300, 0.5), gain(0.45), grassG);            // Halme rascheln
  chain(noiseSrc(A.white), filter('bandpass', 2600, 0.6), gravelG, bus);                  // Kies
  chain(noiseSrc(A.white), filter('bandpass', 420, 0.5), windG, bus);                     // Fahrtwind
  chain(noiseSrc(A.brown), filter('lowpass', 400, 0.6), roadG, bus);                      // Abrollen auf Asphalt
  // Randsteine (Curbs): „Brrrrr“ – dumpfe Stösse, eins pro Streifen
  const kerbG = gain(0), kerbGate = gain(0.5), kerbO = ctx.createOscillator(), kerbTone = ctx.createOscillator();
  kerbO.type = 'square'; kerbTone.type = 'square'; kerbO.start(); kerbTone.start(); srcs.push(kerbO, kerbTone);
  chain(kerbO, gain(0.5), kerbGate.gain);
  chain(noiseSrc(A.brown), filter('lowpass', 520, 0.9), gain(1.6), kerbGate);
  chain(kerbTone, filter('lowpass', 220, 1.2), gain(0.35), kerbGate);
  chain(kerbGate, kerbG, bus);
  let gravelT = 0;

  return {
    update({ frac, throttle = 0, speed = 0, slip = 0, surface = 'asphalt', kerb = false, other: o = null, dt = 0.016 }) {
      const v = Math.abs(speed), vn = clamp(v / 55);
      engine.set(frac, throttle, level, dt);
      if (o && o.dist < 45) {
        if (o.kind !== otherKind) { if (other) other.stop(); other = makeVoice(o.kind, bus); otherKind = o.kind; }
        other.set(o.frac, 0.7, level * 0.55 * (1 - o.dist / 45) ** 2, dt);
      } else if (other) { other.set(0.1, 0, 0, dt); }
      smooth(sqG.gain, surface === 'asphalt' || kerb ? slip * 1.4 : slip * 0.12, 0.05);
      smooth(sq1.frequency, 880 + slip * 220, 0.1);
      smooth(grassG.gain, surface === 'grass' ? 0.25 + vn * 0.9 : 0, 0.05);
      smooth(gravelG.gain, surface === 'gravel' ? 0.15 + vn * 0.5 : 0, 0.05);
      smooth(windG.gain, vn * vn * 0.35, 0.1);
      smooth(roadG.gain, surface === 'asphalt' ? vn * 0.3 : 0, 0.1);
      const onKerb = kerb && v > 3;
      smooth(kerbG.gain, onKerb ? 0.55 + vn * 0.5 : 0, 0.03);
      smooth(kerbO.frequency, Math.max(4, v / 0.75), 0.03);
      smooth(kerbTone.frequency, Math.max(20, v / 0.75), 0.03);
      if (surface === 'gravel' && v > 2) { // einzelne Steinchen, die gegen das Auto spritzen
        gravelT -= dt * v * 0.6;
        while (gravelT < 0) { gravelT += 0.3 + Math.random(); click(1800 + Math.random() * 2400, 0.03 + vn * 0.05); }
      }
    },
    shift() { if (soundOf(kind).type === 'engine') { blowOff(); if (engine.pops) engine.pops(3); } },
    stop() {
      engine.stop(); if (other) other.stop();
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

// Hupe: zwei leicht verstimmte Töne (wie eine echte Autohupe); vol 0…1, z.B. leiser für ferne Autos
export function horn(vol = 1, dur = 0.45, pitch = 1) {
  if (!setup()) return;
  const t = now(), g = gain(0), f = filter('bandpass', 900 * pitch, 0.9);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.02);
  g.gain.setValueAtTime(0.22 * vol, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  chain(f, g, A.out);
  for (const hz of [410 * pitch, 518 * pitch]) {
    const o = A.ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz;
    o.connect(f); o.start(t); o.stop(t + dur + 0.02);
  }
}

// Polizeisirene „Tatü-tata“: zwei Töne im Wechsel; set(0…1) = Lautstärke (z.B. nach Entfernung)
export function createSiren() {
  if (!setup()) return null;
  const { ctx } = A;
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), vol = gain(0);
  o.type = 'square'; o.frequency.value = 544;
  lfo.type = 'square'; lfo.frequency.value = 0.8;
  chain(lfo, gain(78), o.frequency); // 466 Hz ↔ 622 Hz
  chain(o, filter('lowpass', 1700, 0.7), vol, A.out);
  o.start(); lfo.start();
  return {
    set(v) { smooth(vol.gain, clamp(v) * 0.13, 0.15); },
    stop() { vol.gain.setTargetAtTime(0, now(), 0.05); o.stop(now() + 0.4); lfo.stop(now() + 0.4); },
  };
}

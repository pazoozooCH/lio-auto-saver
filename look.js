// Schöne Grafik: Nachbearbeitung des Bildes mit den Bibliotheken „postprocessing“ und „N8AO“ (beide per Import-Map).
// - N8AO: weiche Schatten in Ecken, unter Autos, zwischen Häusern (Umgebungsverdeckung)
// - Leuchten (Bloom) für Lampen, Scheinwerfer und die Sonne in Spiegelungen
// - Kantenglättung (SMAA), Farbe/Kontrast, leicht dunklere Ränder (Vignette), Filmlook (ACES)
// Dazu skyEnvironment: Spiegelungen (Autolack, Fenster) zeigen den echten Himmel statt eines Fotostudios.
// Ohne Internet (Bibliotheken fehlen) gibt makeLook null zurück; dann zeichnet der Modus wie früher.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

let PP = null, AO = null;
export async function loadLook() {
  if (PP) return true;
  try {
    const [pp, ao] = await Promise.all([import('postprocessing'), import('n8ao')]);
    PP = pp; AO = ao.N8AOPostPass;
    return true;
  } catch (e) { console.warn('Schöne Grafik nicht verfügbar:', e); return false; }
}

// Spielstand: 'schoen' (Standard) oder 'schnell'
const KEY = 'autoRetterGfx';
export const lookWanted = () => { try { return localStorage.getItem(KEY) !== 'schnell'; } catch { return true; } };
export const setLookWanted = on => { try { localStorage.setItem(KEY, on ? 'schoen' : 'schnell'); } catch {} };

// opts.ao: Radius der weichen Schatten in Metern
export function makeLook(renderer, scene, camera, opts = {}) {
  if (!PP) return null;
  const { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode,
    VignetteEffect, BrightnessContrastEffect, HueSaturationEffect } = PP;
  const size = renderer.getSize(new THREE.Vector2());
  const autoClear = renderer.autoClear;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  renderer.autoClear = autoClear; // der Composer stellt das ab; normales Zeichnen (ohne Nachbearbeitung, Rückspiegel) braucht es
  const rp = new RenderPass(scene, camera);
  composer.addPass(rp);
  const ao = new AO(scene, camera, size.x, size.y);
  Object.assign(ao.configuration, { aoRadius: opts.ao || 3, distanceFalloff: 1, intensity: 3.1, halfRes: true, color: new THREE.Color(0, 0, 0), gammaCorrection: false,
    transparencyAware: false }); // sonst zeichnet N8AO alles Durchsichtige nochmals
  ao.setQualityMode('Low');
  composer.addPass(ao);
  const bloom = new BloomEffect({ luminanceThreshold: 1.0, luminanceSmoothing: 0.25, intensity: 0.55, mipmapBlur: true, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const grade = new HueSaturationEffect({ saturation: 0.13 }), bc = new BrightnessContrastEffect({ contrast: 0.1 }); // farbig, kräftig
  const vig = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
  composer.addPass(new EffectPass(camera, bloom, tone, grade, bc, vig));
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }))); // Kantenglättung nach dem Tonwert
  let acc = 0, n = 0;
  const L = {
    on: true, composer, ao, bloom, scene,
    setCamera(cam) { rp.mainCamera = cam; composer.setMainCamera(cam); },
    setSize(w, h) { composer.setSize(w, h, false); },
    render(dt) { const a = renderer.autoClear; renderer.autoClear = false; composer.render(dt); renderer.autoClear = a; },
    // nachts mehr Leuchten (Lampen, Fenster), am Tag weniger
    night(k) { bloom.intensity = 0.5 + k * 0.9; ao.configuration.intensity = 3.1 - k * 1.5; },
    dispose() { composer.dispose(); },
    // für Modi ohne eigenen Sparmodus: ist es 3 Sekunden lang unter 40 Bildern pro Sekunde, schaltet es sich ab (gibt dann true)
    watch(dt) { if (dt > 0.1 || !L.on) return false; acc += dt; n++; if (acc < 3) return false; const slow = acc / n > 1 / 40; acc = n = 0; if (slow) L.on = false; return slow; },
  };
  return L;
}

// Umgebung (für Spiegelungen und weiches Licht) aus einem Himmel mit Sonne und Boden machen
export function skyEnvironment(renderer, { elevation = 50, azimuth = 210, turbidity = 4, rayleigh = 1.3, ground = 0x56604c } = {}) {
  const sc = new THREE.Scene(), sky = new Sky();
  sky.scale.setScalar(40);
  const u = sky.material.uniforms;
  u.turbidity.value = turbidity; u.rayleigh.value = rayleigh; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(elevation), THREE.MathUtils.degToRad(azimuth));
  sc.add(sky);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ground }));
  floor.position.y = -1.5; sc.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.02, 0.1, 100).texture;
  pm.dispose(); sky.material.dispose(); floor.geometry.dispose(); floor.material.dispose();
  return tex;
}

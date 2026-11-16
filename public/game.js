import * as THREE from './vendor/three.module.js';
import {
  PLANETS, QUALITY_PRESETS, createFlight, getRenderSize, loadGame, loadSettings,
  nearestPlanet, readControls, saveGame, saveSettings, stepFlight, validateSettings,
} from './core.mjs';

const byId = (doc, id) => doc?.getElementById?.(id) || null;
const setText = (doc, id, text) => { const node = byId(doc, id); if (node) node.textContent = text; };
const listen = (node, event, fn, options) => node?.addEventListener?.(event, fn, options);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function randomSource(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function planetTexture(planet) {
  const width = 256, height = 128, pixels = new Uint8Array(width * height * 4);
  const base = new THREE.Color(planet.color), accent = new THREE.Color(planet.accent);
  const rnd = randomSource(planet.seed);
  for (let y = 0; y < height; y++) {
    const latitude = (y / height - 0.5) * Math.PI;
    for (let x = 0; x < width; x++) {
      const longitude = x / width * Math.PI * 2;
      const sx = Math.cos(longitude) * Math.cos(latitude), sy = Math.sin(latitude), sz = Math.sin(longitude) * Math.cos(latitude);
      const noise = Math.sin(sx * 8 + Math.sin(sz * 6) + planet.seed) * Math.cos(sz * 9 + sy * 5) + Math.sin(sy * 14 + sx * 7) * 0.4;
      let blend = 0.5 + noise * 0.3;
      if (planet.kind === 'gas') blend = 0.48 + Math.sin(latitude * 38 + noise * 2) * 0.25 + Math.sin(latitude * 13) * 0.17;
      else if (planet.kind === 'terrestrial') blend = noise > 0.12 ? 0.82 : 0.08;
      else if (planet.kind === 'ocean') blend = noise > 0.8 ? 0.75 : 0.12;
      else if (planet.kind === 'volcanic') blend = Math.abs(noise) < 0.08 ? 1 : 0.06;
      if (planet.kind === 'ice' || planet.kind === 'terrestrial') blend = Math.max(blend, Math.pow(Math.abs(sy), 16));
      blend = clamp(blend, 0, 1);
      const grain = 0.84 + rnd() * 0.16;
      const offset = (y * width + x) * 4;
      pixels[offset] = Math.round((base.r * (1 - blend) + accent.r * blend) * grain * 255);
      pixels[offset + 1] = Math.round((base.g * (1 - blend) + accent.g * blend) * grain * 255);
      pixels[offset + 2] = Math.round((base.b * (1 - blend) + accent.b * blend) * grain * 255);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.encoding = THREE.sRGBEncoding;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function nebulaTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x / size - 0.5) * 2, dy = (y / size - 0.5) * 2;
    const ridge = Math.exp(-((dy + Math.sin(dx * 4) * 0.15) ** 2) * 18);
    const fade = Math.max(0, 1 - dx * dx - dy * dy);
    const cloud = 0.6 + Math.sin(x * 0.13 + Math.sin(y * 0.1) * 2) * Math.cos(y * 0.16) * 0.3;
    const i = (y * size + x) * 4;
    pixels[i] = 170; pixels[i + 1] = 185; pixels[i + 2] = 255;
    pixels[i + 3] = Math.floor(fade * fade * ridge * cloud * 100);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.encoding = THREE.sRGBEncoding; texture.needsUpdate = true;
  return texture;
}

export function createWorld(quality = 'low') {
  const preset = Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, quality) ? QUALITY_PRESETS[quality] : QUALITY_PRESETS.low;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050814');
  scene.add(new THREE.HemisphereLight('#bed7f8', '#151527', 0.6));
  const sun = new THREE.DirectionalLight('#ffebcf', 1.35);
  sun.position.set(-600, 650, 900); scene.add(sun);
  const geometry = new THREE.SphereGeometry(1, preset.segments, Math.floor(preset.segments * 0.65));
  const planets = PLANETS.map(planet => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ map: planetTexture(planet), shininess: planet.kind === 'ocean' ? 28 : 8, specular: '#263645' }));
    mesh.position.copy(planet.position); mesh.scale.setScalar(planet.radius);
    mesh.name = planet.id; mesh.userData.planet = planet; scene.add(mesh);
    if (planet.rings) {
      const ringGeometry = new THREE.RingGeometry(planet.radius * 1.32, planet.radius * 2.05, 72, 10);
      const positions = ringGeometry.attributes.position, colors = [];
      for (let i = 0; i < positions.count; i++) {
        const band = 0.6 + Math.sin(Math.hypot(positions.getX(i), positions.getY(i)) * 0.6) * 0.14;
        colors.push(band, band * 0.85, band * 0.7);
      }
      ringGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false }));
      ring.position.copy(planet.position); ring.rotation.set(1.12, 0.13, -0.26); scene.add(ring);
    }
    return mesh;
  });
  const random = randomSource(907), positions = [], colors = [];
  for (let i = 0; i < preset.stars; i++) {
    const azimuth = random() * Math.PI * 2, y = random() * 2 - 1;
    const radius = 3300 + random() * 1800, ring = Math.sqrt(1 - y * y);
    positions.push(Math.cos(azimuth) * ring * radius, y * radius, Math.sin(azimuth) * ring * radius);
    const light = 0.4 + random() * 0.6;
    colors.push(light * (0.8 + random() * 0.2), light * 0.9, light);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 1.65, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);
  const nebula = new THREE.Group(), map = nebulaTexture();
  [[-1500, 450, -2400, '#718fae'], [1200, -400, -3000, '#8672a7'], [800, 600, 2600, '#557c94']].forEach(([x, y, z, color]) => {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    cloud.position.set(x, y, z); cloud.scale.set(3000, 1300, 1); nebula.add(cloud);
  });
  scene.add(nebula);
  return { scene, planets, stars, nebula };
}

export function createShip(model = 'ship_01') {
  const ship = new THREE.Group();
  ship.userData.model = model;
  const manta = model === 'ship_02', dart = model === 'ship_03';
  const width = manta ? 2.5 : dart ? 0.95 : 1.7;
  const length = dart ? 4.8 : manta ? 2.7 : 3.8;
  const hull = new THREE.MeshPhongMaterial({ color: manta ? '#d6d5c7' : dart ? '#bcb5bf' : '#a4c2cc', flatShading: true, shininess: 55 });
  const dark = new THREE.MeshPhongMaterial({ color: '#243d52', flatShading: true, shininess: 70 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, length, 5), hull);
  body.rotation.x = -Math.PI / 2; body.scale.y = 1; ship.add(body);
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -width, -0.12, 1.0, width, -0.12, 1.0, 0, -0.12, -length * 0.35,
    -width, 0.05, 1.0, width, 0.05, 1.0, 0, 0.28, -length * 0.35,
  ], 3));
  wingGeometry.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
  wingGeometry.computeVertexNormals(); ship.add(new THREE.Mesh(wingGeometry, hull));
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 5), new THREE.MeshPhongMaterial({ color: '#5ed6ea', emissive: '#12313a', shininess: 90, flatShading: true }));
  cockpit.position.set(0, 0.3, -0.36); cockpit.scale.set(0.7, 0.65, 1.4); ship.add(cockpit);
  const glow = new THREE.MeshBasicMaterial({ color: '#9cecf4', transparent: true, opacity: 0.9, depthWrite: false });
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.4, 6), dark);
    engine.rotation.x = Math.PI / 2; engine.position.set(side * width * 0.55, -0.03, 0.83); ship.add(engine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.19, 1.1, 6), glow);
    flame.name = 'thruster'; flame.rotation.x = Math.PI / 2; flame.position.set(engine.position.x, -0.03, 1.75); ship.add(flame);
  }
  return ship;
}

const cameraOffset = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
export function updateChaseCamera(camera, ship, flight, dt, snap = false) {
  ship.position.copy(flight.position);
  ship.rotation.set(flight.rotation.x, flight.rotation.y, flight.rotation.z, 'YXZ');
  cameraOffset.set(0, 3.8, 12.5).applyQuaternion(ship.quaternion).add(ship.position);
  if (snap) camera.position.copy(cameraOffset);
  else camera.position.lerp(cameraOffset, 1 - Math.exp(-dt * 8));
  cameraTarget.set(0, 0.9, -18).applyQuaternion(ship.quaternion).add(ship.position);
  camera.lookAt(cameraTarget);
}

function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export function createEngineAudio(win) {
  let context = null, oscillator = null, gain = null, failed = false;
  return {
    unlock(enabled) {
      if (!enabled || failed) return;
      try {
        if (!context) {
          const AudioContext = win?.AudioContext || win?.webkitAudioContext;
          if (!AudioContext) return;
          context = new AudioContext(); oscillator = context.createOscillator(); gain = context.createGain();
          oscillator.type = 'sine'; gain.gain.value = 0;
          oscillator.connect(gain); gain.connect(context.destination); oscillator.start();
        }
        if (context.state === 'suspended') context.resume()?.catch?.(() => {});
      } catch { failed = true; }
    },
    update({ enabled, active, speed = 0, boost = false }) {
      if (!context || !gain || failed) return;
      const audible = enabled && active;
      const level = audible ? 0.008 + Math.min(speed / 260, 1) * 0.018 : 0;
      try {
        gain.gain.setTargetAtTime(level, context.currentTime, 0.12);
        oscillator.frequency.setTargetAtTime(36 + speed * 0.22 + (boost ? 12 : 0), context.currentTime, 0.12);
      } catch { failed = true; }
    },
    destroy() {
      try { oscillator?.stop(); context?.close()?.catch?.(() => {}); } catch { /* Context already closed. */ }
      context = null; oscillator = null; gain = null;
    },
  };
}

export function bootGame(doc = globalThis.document, win = globalThis.window, dependencies = {}) {
  const launch = byId(doc, 'startNew');
  if (launch) launch.disabled = true;
  const reportError = message => {
    const panel = byId(doc, 'errorPanel');
    if (panel) panel.hidden = false;
    setText(doc, 'errorText', message);
  };
  const canvas = byId(doc, 'universe');
  if (!canvas || !win) { reportError('Canvas WebGL tidak ditemukan. Muat ulang halaman.'); return null; }
  let renderer;
  try {
    const attributes = { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
    // Passing this explicit WebGL1 context prevents Three r128 from selecting WebGL2.
    const context = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);
    if (!context) throw new Error('WebGL 1 tidak tersedia. Aktifkan akselerasi grafis atau coba browser lain.');
    renderer = (dependencies.createRenderer || (options => new THREE.WebGLRenderer(options)))({ canvas, context, ...attributes });
    renderer.outputEncoding = THREE.sRGBEncoding;
  } catch (error) { reportError(error.message || 'WebGL gagal dimulai.'); return null; }
  let storage;
  try { storage = win.localStorage; } catch { storage = null; }
  let settings = loadSettings(storage), saved = loadGame(storage), flight = createFlight();
  let world = createWorld(settings.quality), ship = createShip(settings.shipModel);
  world.scene.add(ship);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 8000);
  const input = { keys: new Set(), touch: new Set(), stick: { x: 0, y: 0 } };
  const audio = createEngineAudio(win);
  const pointerHolds = new Map();
  let joystickPointer = null, drag = null, destroyed = false, request = null;
  let lastFrame = null, lastHUD = -Infinity, lastSave = 0, fps = 0, fpsFrames = 0, fpsStart = 0;
  let renderSize = { width: 1, height: 1, pixelRatio: 1 };
  const removers = [];
  const on = (node, event, callback, options) => {
    listen(node, event, callback, options);
    removers.push(() => node?.removeEventListener?.(event, callback, options));
  };
  const debug = { firstPerson: false, position: { ...flight.position }, rotation: { ...flight.rotation }, speed: 0,
    nearest: nearestPlanet(flight.position), paused: true, started: false, render: renderSize, fps: 0, calls: 0, triangles: 0, quality: settings.quality, webgl: 'WebGL 1' };
  win.__spaceDebug = debug;
  function clearInput() {
    input.keys.clear(); input.touch.clear(); pointerHolds.clear();
    input.stick.x = 0; input.stick.y = 0; joystickPointer = null; drag = null;
    const knob = byId(doc, 'stickKnob');
    if (knob?.style) knob.style.transform = 'translate(-50%, -50%)';
  }
  function persist() {
    if (!ui.state.started) return false;
    const success = saveGame(storage, flight);
    if (success) { saved = loadGame(storage); hooks.hasSave = Boolean(saved); }
    setText(doc, 'saveStatus', success ? 'Tersimpan di perangkat ini' : 'Penyimpanan lokal tidak tersedia');
    return success;
  }
  const hooks = {
    hasSave: Boolean(saved),
    onStart(resume) {
      audio.unlock(settings.sound);
      flight = createFlight(resume ? saved : null);
      // Resolve old or hand-edited poses before the first render.
      stepFlight(flight, {}, 1 / 120);
      clearInput();
      updateChaseCamera(camera, ship, flight, 0, true);
      saveGame(storage, flight);
      lastSave = lastFrame || 0;
    },
    onPause() { clearInput(); audio.update({ enabled: false, active: false }); persist(); },
    onContinue() { clearInput(); audio.unlock(settings.sound); lastFrame = null; },
    onSave: persist,
    onChange(state) {
      debug.started = state.started; debug.paused = state.paused;
      if (state.paused) clearInput();
      setText(doc, 'travelStatus', state.started ? state.paused ? 'PENERBANGAN DIJEDA' : 'JELAJAH BEBAS' : 'SIAP UNTUK MENJELAJAH');
    },
  };
  const ui = createInterface(doc, hooks);
  function resize() {
    const width = Math.max(1, win.innerWidth || canvas.clientWidth || 1);
    const height = Math.max(1, win.innerHeight || canvas.clientHeight || 1);
    renderSize = getRenderSize(width, height, win.devicePixelRatio || 1, settings.quality);
    renderer.setPixelRatio(renderSize.pixelRatio); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    debug.render = { ...renderSize };
  }
  function applySettings(previous = settings, save = false) {
    if (previous.quality !== settings.quality) {
      world.scene.remove(ship); disposeObject(world.scene);
      world = createWorld(settings.quality); world.scene.add(ship);
    }
    if (previous.shipModel !== settings.shipModel) {
      world.scene.remove(ship); disposeObject(ship);
      ship = createShip(settings.shipModel); world.scene.add(ship);
    }
    const select = byId(doc, 'shipSelect'), quality = byId(doc, 'quality');
    const sound = byId(doc, 'sound'), opacity = byId(doc, 'opacity'), hud = byId(doc, 'hud');
    if (select) select.value = settings.shipModel;
    if (quality) quality.value = settings.quality;
    if (sound) sound.checked = settings.sound;
    if (opacity) opacity.value = String(settings.hudOpacity);
    if (hud?.style) hud.style.opacity = String(settings.hudOpacity);
    setText(doc, 'qualityLabel', QUALITY_PRESETS[settings.quality].label);
    debug.quality = settings.quality;
    if (save && !saveSettings(storage, settings)) setText(doc, 'saveStatus', 'Pengaturan tidak dapat disimpan');
    resize(); updateChaseCamera(camera, ship, flight, 0, true);
  }
  for (const [id, field, event] of [['shipSelect', 'shipModel', 'change'], ['quality', 'quality', 'change'], ['sound', 'sound', 'change'], ['opacity', 'hudOpacity', 'input']]) {
    on(byId(doc, id), event, () => {
      const node = byId(doc, id), previous = settings;
      settings = validateSettings({ ...settings, [field]: field === 'sound' ? node.checked : field === 'hudOpacity' ? Number(node.value) : node.value });
      if (field === 'sound') audio.unlock(settings.sound);
      applySettings(previous, true);
    });
  }
  const flightKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
  on(win, 'keydown', event => {
    if (event.code === 'Escape') { if (!event.repeat) ui.escape(); return; }
    if (!ui.state.started || ui.state.paused || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return;
    if (flightKeys.has(event.code)) { event.preventDefault(); input.keys.add(event.code); }
  });
  on(win, 'keyup', event => { input.keys.delete(event.code); });
  on(win, 'blur', () => { clearInput(); ui.pause(); });
  on(doc, 'visibilitychange', () => { if (doc.hidden) { clearInput(); ui.pause(); } });
  on(win, 'pagehide', persist); on(win, 'beforeunload', persist); on(win, 'resize', resize);
  for (const button of doc?.querySelectorAll?.('[data-control]') || []) {
    const control = button.dataset.control;
    if (!['forward', 'backward', 'left', 'right', 'up', 'down', 'boost', 'brake'].includes(control)) continue;
    if (button.style) button.style.touchAction = 'none';
    const release = event => {
      pointerHolds.delete(event.pointerId);
      if (![...pointerHolds.values()].includes(control)) input.touch.delete(control);
    };
    on(button, 'pointerdown', event => {
      if (!ui.state.started || ui.state.paused) return;
      event.preventDefault(); pointerHolds.set(event.pointerId, control); input.touch.add(control);
      try { button.setPointerCapture?.(event.pointerId); } catch { /* Detached touch target. */ }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(button, type, release);
    on(button, 'contextmenu', event => event.preventDefault());
  }
  const stickZone = byId(doc, 'stickZone'), stickKnob = byId(doc, 'stickKnob');
  if (stickZone?.style) stickZone.style.touchAction = 'none';
  function moveStick(event) {
    const rect = stickZone?.getBoundingClientRect?.();
    if (!rect) return;
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y)); x /= length; y /= length;
    input.stick.x = Math.abs(x) < 0.08 ? 0 : x; input.stick.y = Math.abs(y) < 0.08 ? 0 : y;
    if (stickKnob?.style) stickKnob.style.transform = `translate(calc(-50% + ${x * radius}px), calc(-50% + ${y * radius}px))`;
  }
  on(stickZone, 'pointerdown', event => {
    if (!ui.state.started || ui.state.paused || joystickPointer !== null) return;
    event.preventDefault(); joystickPointer = event.pointerId; moveStick(event);
    try { stickZone.setPointerCapture?.(event.pointerId); } catch { /* Pointer already ended. */ }
  });
  on(stickZone, 'pointermove', event => { if (event.pointerId === joystickPointer) { event.preventDefault(); moveStick(event); } });
  function releasePointer(event) {
    if (event.pointerId === joystickPointer) {
      joystickPointer = null; input.stick.x = 0; input.stick.y = 0;
      if (stickKnob?.style) stickKnob.style.transform = 'translate(-50%, -50%)';
    }
    if (event.pointerId === drag?.id) drag = null;
    const control = pointerHolds.get(event.pointerId); pointerHolds.delete(event.pointerId);
    if (control && ![...pointerHolds.values()].includes(control)) input.touch.delete(control);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) { on(stickZone, type, releasePointer); on(canvas, type, releasePointer); on(win, type, releasePointer); }
  if (canvas.style) canvas.style.touchAction = 'none';
  on(canvas, 'pointerdown', event => {
    if (!ui.state.started || ui.state.paused || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Pointer already ended. */ }
  });
  on(canvas, 'pointermove', event => {
    if (!drag || drag.id !== event.pointerId || ui.state.paused) return;
    flight.rotation.x = clamp(flight.rotation.x - (event.clientY - drag.y) * 0.0035, -1.45, 1.45);
    const yaw = flight.rotation.y - (event.clientX - drag.x) * 0.0035;
    flight.rotation.y = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    drag.x = event.clientX; drag.y = event.clientY;
  });
  on(canvas, 'contextmenu', event => event.preventDefault());
  on(canvas, 'webglcontextlost', event => { event.preventDefault(); ui.pause(); reportError('Koneksi grafis terhenti. Posisi disimpan; muat ulang untuk melanjutkan.'); });
  function updateHUD(now) {
    const nearest = nearestPlanet(flight.position);
    const info = renderer.info.render;
    Object.assign(debug, { position: { ...flight.position }, rotation: { ...flight.rotation }, speed: flight.speed,
      nearest, paused: ui.state.paused, started: ui.state.started, fps, calls: info.calls, triangles: info.triangles });
    if (now - lastHUD < 100) return;
    lastHUD = now;
    setText(doc, 'speedValue', flight.speed.toFixed(1));
    setText(doc, 'coordsValue', `${flight.position.x.toFixed(0)} · ${flight.position.y.toFixed(0)} · ${flight.position.z.toFixed(0)}`);
    const heading = ((-flight.rotation.y * 180 / Math.PI) % 360 + 360) % 360;
    setText(doc, 'headingValue', `${heading.toFixed(0)}°`);
    setText(doc, 'nearestName', nearest?.name || 'Ruang terbuka');
    setText(doc, 'nearestDistance', nearest ? `${nearest.distance.toFixed(0)} u` : '—');
    setText(doc, 'fpsValue', String(Math.round(fps)));
    setText(doc, 'drawValue', `${info.calls} calls`);
    if (!ui.state.paused) setText(doc, 'travelStatus', flight.lastCollision ? 'BATAS PERMUKAAN • ARAHKAN KEMBALI' : input.keys.has('ShiftLeft') || input.touch.has('boost') ? 'BOOST AKTIF' : 'JELAJAH BEBAS');
  }
  function frame(now) {
    if (destroyed) return;
    const dt = lastFrame === null ? 0 : clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;
    fpsFrames++;
    if (now - fpsStart >= 500) { fps = fpsFrames * 1000 / (now - fpsStart); fpsFrames = 0; fpsStart = now; }
    const controls = readControls(input.keys, input.touch, input.stick);
    audio.update({ enabled: settings.sound, active: ui.state.started && !ui.state.paused, speed: flight.speed, boost: controls.boost });
    if (ui.state.started && !ui.state.paused) {
      stepFlight(flight, controls, dt);
      for (const planet of world.planets) planet.rotation.y += dt * 0.012;
      if (now - lastSave >= 10000) { persist(); lastSave = now; }
    }
    updateChaseCamera(camera, ship, flight, dt);
    for (const part of ship.children) if (part.name === 'thruster') part.scale.y = ui.state.paused ? 0.25 : controls.boost ? 2.8 : 0.4 + flight.speed / 110;
    world.stars.position.copy(camera.position); world.nebula.position.copy(camera.position);
    renderer.render(world.scene, camera); updateHUD(now);
  }
  function animate(now) { if (destroyed) return; frame(now); request = win.requestAnimationFrame?.(animate); }
  applySettings(); frame(0); ui.ready();
  request = win.requestAnimationFrame?.(animate);
  return { get flight() { return flight; }, get ship() { return ship; }, get settings() { return settings; }, ui, input, frame, renderer,
    destroy() { if (destroyed) return; destroyed = true; clearInput(); audio.destroy(); win.cancelAnimationFrame?.(request); for (const remove of removers) remove(); disposeObject(world.scene); renderer.dispose(); },
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => {
    try { bootGame(document, window); }
    catch (error) {
      const panel = byId(document, 'errorPanel'); if (panel) panel.hidden = false;
      setText(document, 'errorText', `Game gagal dimuat: ${error.message}`);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

// This small state machine owns all overlays, including help opened from settings/pause.
export function createInterface(doc, hooks = {}) {
  const state = { ready: false, started: false, paused: true, screen: 'welcome' };
  let helpReturn = 'welcome';
  function paint() {
    for (const [id, screen] of [['welcome', 'welcome'], ['pausePanel', 'pause'], ['helpPanel', 'help']]) {
      const node = byId(doc, id);
      if (node) node.hidden = state.screen !== screen;
    }
    const controls = byId(doc, 'touchControls');
    if (controls) controls.hidden = !state.started || state.paused;
    const start = byId(doc, 'startNew');
    if (start) { start.disabled = !state.ready; start.textContent = state.ready ? 'Mulai jelajah ↗' : 'Menyiapkan mesin…'; }
    const resume = byId(doc, 'resume');
    if (resume) { resume.hidden = !state.ready || (!state.started && !hooks.hasSave); resume.textContent = state.started ? 'Kembali terbang ↗' : 'Lanjutkan petualangan ↗'; }
    const pause = byId(doc, 'pauseButton');
    if (pause) pause.disabled = !state.started;
    hooks.onChange?.(state);
  }
  function show(screen) {
    const wasPaused = state.paused;
    state.screen = screen;
    state.paused = screen !== 'flight';
    if (state.started && !wasPaused && state.paused) hooks.onPause?.();
    if (state.started && wasPaused && !state.paused) hooks.onContinue?.();
    paint();
  }
  function start(resume = false) {
    if (!state.ready) return;
    if (resume && state.started) { show('flight'); return; }
    if (resume && !hooks.hasSave) return;
    hooks.onStart?.(resume);
    state.started = true;
    state.paused = false;
    state.screen = 'flight';
    paint();
  }
  function togglePause() {
    if (!state.started) return;
    show(state.paused ? 'flight' : 'pause');
  }
  function help() { if (state.screen === 'help') return; helpReturn = state.screen; show('help'); }
  listen(byId(doc, 'startNew'), 'click', () => start(false));
  listen(byId(doc, 'resume'), 'click', () => start(true));
  listen(byId(doc, 'pauseButton'), 'click', togglePause);
  listen(byId(doc, 'continueButton'), 'click', () => { if (state.started) show('flight'); });
  listen(byId(doc, 'saveButton'), 'click', () => { if (state.started) hooks.onSave?.(); });
  listen(byId(doc, 'settingsButton'), 'click', () => show('welcome'));
  listen(byId(doc, 'helpButton'), 'click', help);
  listen(byId(doc, 'closeHelp'), 'click', () => show(helpReturn));
  paint();
  return { state, ready() { state.ready = true; paint(); }, start, togglePause,
    pause() { if (state.started && !state.paused) show('pause'); },
    escape() { if (state.screen === 'help') show(helpReturn); else togglePause(); },
  };
}

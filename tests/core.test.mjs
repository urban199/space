import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';

// Dynamic loading keeps the first RED failure a clear missing-feature assertion.
const core = await import('../public/core.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

const game = await import('../public/game.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

function uiDocument() {
  const ids = ['welcome', 'startNew', 'resume', 'pausePanel', 'continueButton', 'saveButton', 'settingsButton', 'helpPanel', 'closeHelp', 'pauseButton', 'helpButton', 'touchControls', 'hud', 'universe', 'shipSelect', 'quality', 'sound', 'opacity', 'errorPanel', 'errorText', 'speedValue', 'coordsValue', 'headingValue', 'nearestName', 'nearestDistance', 'fpsValue', 'drawValue', 'saveStatus', 'qualityLabel', 'travelStatus', 'stickZone', 'stickKnob'];
  const nodes = Object.fromEntries(ids.map(id => [id, Object.assign(new EventTarget(), { hidden: false, disabled: false, textContent: '', style: {} })]));
  return { nodes, getElementById: id => nodes[id] || null };
}

function fire(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}

function runtimeFixture() {
  const doc = Object.assign(new EventTarget(), uiDocument());
  const memory = new Map([['gameState', 'untouched']]);
  const win = Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });
  const controls = ['forward', 'backward', 'left', 'right', 'up', 'down', 'boost', 'brake'].map(control => Object.assign(new EventTarget(), { dataset: { control }, style: {} }));
  doc.querySelectorAll = () => controls;
  doc.nodes.stickZone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const contexts = [];
  const context = {};
  doc.nodes.universe.getContext = name => { contexts.push(name); return context; };
  let rendererOptions;
  const renderer = {
    capabilities: { isWebGL2: false }, info: { render: { calls: 12, triangles: 7000 } },
    setPixelRatio(value) { this.pixelRatio = value; }, setSize(width, height) { this.width = width; this.height = height; },
    render(scene, camera) { assert.ok(scene.isScene && camera.isCamera); }, dispose() {},
  };
  return { doc, win, memory, controls, contexts, context, renderer, options: () => rendererOptions,
    deps: { createRenderer: options => { rendererOptions = options; return renderer; } } };
}

test('reopening help cannot trap the pilot on the help overlay', () => {
  const doc = uiDocument();
  game.createInterface(doc).ready();
  fire(doc.nodes.startNew, 'click');
  fire(doc.nodes.helpButton, 'click');
  fire(doc.nodes.helpButton, 'click');
  fire(doc.nodes.closeHelp, 'click');
  assert.equal(doc.nodes.helpPanel.hidden, true);
  assert.equal(doc.nodes.touchControls.hidden, false);
});

test('unknown inherited quality names fall back to a finite low-GPU render size', () => {
  for (const quality of ['__proto__', 'constructor', 'toString']) {
    assert.deepEqual(core.getRenderSize(1280, 720, 2, quality), core.getRenderSize(1280, 720, 2, 'low'));
  }
});

test('engine audio starts on user gesture, follows thrust and becomes silent when disabled or paused', () => {
  assert.equal(typeof game.createEngineAudio, 'function');
  const values = { gain: 0, frequency: 0, created: 0, started: false, closed: false };
  class AudioContext {
    constructor() { values.created++; this.currentTime = 1; this.state = 'running'; this.destination = {}; }
    createOscillator() { return { type: '', frequency: { setTargetAtTime: value => { values.frequency = value; } }, connect() {}, start() { values.started = true; }, stop() {} }; }
    createGain() { return { gain: { value: 0, setTargetAtTime: value => { values.gain = value; } }, connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { values.closed = true; return Promise.resolve(); }
  }
  const audio = game.createEngineAudio({ AudioContext });
  assert.equal(values.created, 0);
  audio.unlock(true);
  assert.equal(values.created, 1);
  assert.equal(values.started, true);
  audio.update({ enabled: true, active: true, speed: 180, boost: true });
  assert.ok(values.gain > 0 && values.gain < 0.05);
  assert.ok(values.frequency > 50);
  audio.update({ enabled: false, active: true, speed: 180 });
  assert.equal(values.gain, 0);
  audio.update({ enabled: true, active: false, speed: 180 });
  assert.equal(values.gain, 0);
  audio.destroy();
  assert.equal(values.closed, true);
  assert.doesNotThrow(() => game.createEngineAudio({}).unlock(true));
});

test('every ship hull fits within the physics collision radius', () => {
  for (const model of core.SHIP_MODELS) {
    const ship = game.createShip(model); ship.updateMatrixWorld(true);
    ship.traverse(part => {
      if (!part.isMesh || part.name === 'thruster') return;
      const positions = part.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
        assert.ok(vertex.length() <= core.SHIP_RADIUS, `${model} hull exceeds collision radius`);
      }
    });
  }
});

test('runtime requests WebGL1 and connects flight, settings, HUD, pause and namespaced saving', () => {
  assert.equal(typeof game.bootGame, 'function');
  const fixture = runtimeFixture();
  const { doc, win, memory, renderer } = fixture;
  const runtime = game.bootGame(doc, win, fixture.deps);
  assert.deepEqual(fixture.contexts, ['webgl']);
  assert.equal(fixture.options().context, fixture.context);
  assert.equal(renderer.outputEncoding, THREE.sRGBEncoding);
  assert.equal(doc.nodes.startNew.disabled, false);
  assert.equal(win.__spaceDebug.firstPerson, false);
  assert.equal(win.__spaceDebug.webgl, 'WebGL 1');
  fire(doc.nodes.startNew, 'click');
  fire(win, 'keydown', { code: 'KeyW' });
  for (let i = 0; i < 90; i++) runtime.frame(i * 1000 / 60);
  assert.ok(runtime.flight.position.z < 120);
  assert.ok(Number(doc.nodes.speedValue.textContent) > 0);
  assert.ok(doc.nodes.nearestName.textContent.length > 0);
  assert.equal(win.__spaceDebug.started, true);
  assert.equal(win.__spaceDebug.calls, 12);
  assert.equal(win.__spaceDebug.triangles, 7000);
  assert.ok(win.__spaceDebug.render.width > 0 && win.__spaceDebug.fps > 0);
  fire(win, 'keyup', { code: 'KeyW' });
  fire(doc.nodes.pauseButton, 'click');
  const position = { ...runtime.flight.position };
  runtime.frame(2000); runtime.frame(2100);
  assert.deepEqual(runtime.flight.position, position);
  assert.equal(win.__spaceDebug.paused, true);
  assert.ok(memory.has('spaceExplorer.gameState'));
  assert.equal(memory.get('gameState'), 'untouched');
  fire(doc.nodes.settingsButton, 'click');
  doc.nodes.shipSelect.value = 'ship_03'; fire(doc.nodes.shipSelect, 'change');
  doc.nodes.quality.value = 'hd'; fire(doc.nodes.quality, 'change');
  doc.nodes.sound.checked = false; fire(doc.nodes.sound, 'change');
  doc.nodes.opacity.value = '0.5'; fire(doc.nodes.opacity, 'input');
  const settings = JSON.parse(memory.get('spaceExplorer.playerSettings'));
  assert.deepEqual(settings, { selectedShip: 'ship_03', quality: 'hd', soundEnabled: false, hudOpacity: 0.5 });
  assert.equal(runtime.ship.userData.model, 'ship_03');
  assert.equal(doc.nodes.hud.style.opacity, '0.5');
  assert.equal(win.__spaceDebug.quality, 'hd');
  fire(doc.nodes.resume, 'click');
  fire(win, 'blur');
  assert.equal(runtime.ui.state.paused, true);
  runtime.destroy();
});

test('touch holds, pointer cancellation and drag look control the actual flight without stuck keys', () => {
  assert.equal(typeof game.bootGame, 'function');
  const fixture = runtimeFixture();
  const { doc, win, controls } = fixture;
  const runtime = game.bootGame(doc, win, fixture.deps);
  fire(doc.nodes.startNew, 'click');
  fire(controls[0], 'pointerdown', { pointerId: 1 });
  for (let i = 0; i < 30; i++) runtime.frame(i * 1000 / 60);
  assert.ok(runtime.flight.position.z < 125);
  fire(controls[0], 'pointercancel', { pointerId: 1 });
  assert.equal(runtime.input.touch.has('forward'), false);
  fire(doc.nodes.stickZone, 'pointerdown', { pointerId: 2, clientX: 90, clientY: 25 });
  runtime.frame(510); runtime.frame(530);
  assert.ok(runtime.flight.rotation.y < 0 && runtime.flight.rotation.x > 0);
  fire(doc.nodes.stickZone, 'lostpointercapture', { pointerId: 2 });
  assert.deepEqual(runtime.input.stick, { x: 0, y: 0 });
  const beforeDrag = runtime.flight.rotation.y;
  fire(doc.nodes.universe, 'pointerdown', { pointerId: 3, button: 0, clientX: 100, clientY: 100 });
  fire(doc.nodes.universe, 'pointermove', { pointerId: 3, clientX: 160, clientY: 100 });
  assert.ok(runtime.flight.rotation.y < beforeDrag);
  fire(win, 'keydown', { code: 'KeyW' });
  fire(win, 'keydown', { code: 'Escape' });
  assert.equal(runtime.input.keys.size, 0);
  runtime.destroy();
});

test('missing WebGL or DOM reports a guarded error without enabling launch', () => {
  assert.equal(typeof game.bootGame, 'function');
  const fixture = runtimeFixture();
  fixture.doc.nodes.universe.getContext = () => null;
  assert.equal(game.bootGame(fixture.doc, fixture.win, fixture.deps), null);
  assert.equal(fixture.doc.nodes.errorPanel.hidden, false);
  assert.equal(fixture.doc.nodes.startNew.disabled, true);
  assert.ok(fixture.doc.nodes.errorText.textContent.includes('WebGL'));
  assert.doesNotThrow(() => game.bootGame(null, null));
});

test('three selectable low-poly ships have distinct visible geometry and thrusters', () => {
  assert.equal(typeof game.createShip, 'function');
  const sizes = core.SHIP_MODELS.map(model => {
    const ship = game.createShip(model);
    assert.equal(ship.userData.model, model);
    assert.ok(ship.children.some(part => part.name === 'thruster'));
    let vertices = 0;
    ship.traverse(part => { if (part.isMesh) vertices += part.geometry.attributes.position.count; });
    assert.ok(vertices > 20 && vertices < 3000);
    return new THREE.Box3().setFromObject(ship).getSize(new THREE.Vector3()).toArray().join(',');
  });
  assert.equal(new Set(sizes).size, 3);
});

test('scene contains six textured planets, stars and nebula with a third-person chase camera', () => {
  assert.equal(typeof game.createWorld, 'function');
  const world = game.createWorld('low');
  assert.equal(world.planets.length, core.PLANETS.length);
  for (const mesh of world.planets) {
    assert.ok(mesh.material.map?.isDataTexture);
    assert.equal(mesh.material.map.encoding, THREE.sRGBEncoding);
    assert.ok(new Set(mesh.material.map.image.data).size > 30);
  }
  assert.equal(world.stars.geometry.attributes.position.count, core.QUALITY_PRESETS.low.stars);
  assert.ok(world.nebula.children.length >= 2);
  assert.equal(world.scene.children.filter(node => node.isLight).length, 2);
  const flight = core.createFlight();
  const camera = new THREE.PerspectiveCamera();
  const ship = game.createShip('ship_01');
  game.updateChaseCamera(camera, ship, flight, 1, true);
  assert.ok(camera.position.distanceTo(ship.position) > 8);
  assert.ok(camera.position.z > ship.position.z, 'camera stays behind the visible ship');
  const forward = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(forward.z < -0.8);
});

test('UI enables start only when ready and shows exactly the active overlay through all navigation', () => {
  assert.equal(typeof game.createInterface, 'function', 'UI controller must exist');
  const doc = uiDocument();
  const events = [];
  const ui = game.createInterface(doc, { hasSave: true, onStart: resume => events.push(['start', resume]), onPause: () => events.push(['pause']), onContinue: () => events.push(['continue']), onSave: () => events.push(['save']) });
  const click = id => doc.nodes[id].dispatchEvent(new Event('click'));
  assert.equal(doc.nodes.startNew.disabled, true);
  assert.equal(doc.nodes.touchControls.hidden, true);
  click('startNew');
  assert.equal(ui.state.started, false);
  ui.ready();
  assert.equal(doc.nodes.startNew.disabled, false);
  assert.equal(doc.nodes.resume.hidden, false);
  click('resume');
  assert.deepEqual(events.at(-1), ['start', true]);
  assert.equal(ui.state.started, true);
  assert.equal(ui.state.paused, false);
  assert.equal(doc.nodes.welcome.hidden, true);
  assert.equal(doc.nodes.touchControls.hidden, false);
  click('pauseButton');
  assert.equal(ui.state.paused, true);
  assert.equal(doc.nodes.pausePanel.hidden, false);
  assert.equal(doc.nodes.touchControls.hidden, true);
  click('saveButton');
  assert.deepEqual(events.at(-1), ['save']);
  click('settingsButton');
  assert.equal(doc.nodes.welcome.hidden, false);
  assert.equal(doc.nodes.pausePanel.hidden, true);
  click('resume');
  assert.equal(ui.state.paused, false);
  assert.deepEqual(events.at(-1), ['continue']);
  click('helpButton');
  assert.equal(ui.state.paused, true);
  assert.equal(doc.nodes.helpPanel.hidden, false);
  click('closeHelp');
  assert.equal(ui.state.paused, false);
  assert.equal(doc.nodes.helpPanel.hidden, true);
  click('pauseButton');
  click('helpButton');
  click('closeHelp');
  assert.equal(doc.nodes.pausePanel.hidden, false, 'closing help from pause returns to pause');
  click('continueButton');
  assert.equal(ui.state.paused, false);
  assert.doesNotThrow(() => game.createInterface(null).ready());
});

test('keyboard and touch use the same six-axis input with boost, brake and arrow look', () => {
  assert.equal(typeof core.readControls, 'function');
  const keys = new Set(['KeyW', 'KeyD', 'KeyQ', 'ShiftLeft', 'ArrowLeft', 'ArrowUp']);
  assert.deepEqual(core.readControls(keys, new Set()), { forward: 1, strafe: 1, vertical: 1, yaw: 1, pitch: 1, boost: true, brake: false });
  const touch = new Set(['backward', 'left', 'down', 'brake']);
  assert.deepEqual(core.readControls(new Set(), touch, { x: 0.6, y: -0.4 }), { forward: -1, strafe: -1, vertical: -1, yaw: -0.6, pitch: 0.4, boost: false, brake: true });
  assert.equal(core.readControls(new Set(['KeyW', 'KeyS']), new Set()).forward, 0);
  assert.equal(core.readControls(new Set(['ArrowUp']), new Set(), { x: 90, y: -90 }).pitch, 1);
});

test('flight thrust, boost, brake and orientation behave consistently over time', () => {
  assert.equal(typeof core.stepFlight, 'function', 'flight integration must exist');
  const fly = (controls, frames = 120, dt = 1 / 60) => {
    const state = core.createFlight();
    for (let i = 0; i < frames; i++) core.stepFlight(state, controls, dt, []);
    return state;
  };
  const normal = fly({ forward: 1 });
  const boosted = fly({ forward: 1, boost: true });
  assert.ok(normal.position.z < 125 && normal.speed > 30);
  assert.ok(boosted.speed > normal.speed * 1.5);
  const beforeBrake = boosted.speed;
  for (let i = 0; i < 60; i++) core.stepFlight(boosted, { brake: true }, 1 / 60, []);
  assert.ok(boosted.speed < beforeBrake * 0.01);
  const diagonal = fly({ forward: 1, strafe: 1, vertical: 1 });
  assert.ok(diagonal.position.x > 0 && diagonal.position.y > 0);
  assert.ok(Math.abs(diagonal.speed - normal.speed) < 1e-8, 'diagonal input is normalized');
  assert.ok(fly({ forward: -1 }).position.z > 125);
  const rotated = core.createFlight();
  rotated.rotation.y = Math.PI / 2;
  core.stepFlight(rotated, { forward: 1 }, 0.1, []);
  assert.ok(rotated.position.x < 0);
  assert.ok(Math.abs(rotated.position.z - 125) < 1e-8);
  const thirty = fly({ forward: 1 }, 60, 1 / 30);
  assert.ok(Math.abs(thirty.position.z - normal.position.z) < 0.1, 'fixed substeps stabilize frame rates');
  for (let i = 0; i < 100; i++) core.stepFlight(rotated, { pitch: 1, yaw: 1 }, 0.1, []);
  assert.ok(rotated.rotation.x <= 1.45 && Math.abs(rotated.rotation.y) <= Math.PI);
  const unchanged = structuredClone(normal);
  core.stepFlight(normal, { forward: 1 }, NaN, []);
  assert.deepEqual(normal, unchanged);
});

test('real flight integration cannot penetrate a nearby surface at boost speed', () => {
  assert.equal(typeof core.stepFlight, 'function');
  const planet = core.PLANETS[0];
  const state = core.createFlight();
  state.position = { x: planet.position.x, y: planet.position.y, z: planet.position.z + planet.radius + core.SHIP_RADIUS + 0.01 };
  state.velocity = { x: 0, y: 0, z: -260 };
  core.stepFlight(state, { forward: 1, boost: true }, 0.1, [planet]);
  assert.equal(state.lastCollision, planet.id);
  assert.ok(state.position.z >= planet.position.z + planet.radius + core.SHIP_RADIUS);
  assert.ok(state.velocity.z >= 0);
  state.position = { ...planet.position };
  core.stepFlight(state, {}, 1 / 60, [planet]);
  assert.ok(Math.hypot(state.position.x - planet.position.x, state.position.y - planet.position.y, state.position.z - planet.position.z) > planet.radius + core.SHIP_RADIUS);
});

test('nearest destination is selected by surface distance rather than center distance', () => {
  assert.equal(typeof core.nearestPlanet, 'function');
  const planets = [
    { id: 'small', name: 'Small', position: { x: 20, y: 0, z: 0 }, radius: 1 },
    { id: 'large', name: 'Large', position: { x: 30, y: 0, z: 0 }, radius: 20 },
  ];
  const nearest = core.nearestPlanet({ x: 0, y: 0, z: 0 }, planets);
  assert.equal(nearest.name, 'Large');
  assert.equal(nearest.distance, 10);
  assert.equal(core.nearestPlanet({ x: 0, y: 0, z: 0 }, []), null);
});

test('swept collision stops a boosted ship that crosses an entire planet in one frame', () => {
  assert.equal(typeof core.sweepPlanets, 'function', 'continuous planet collision must exist');
  const planet = { id: 'test', name: 'Test', position: { x: 0, y: 0, z: 0 }, radius: 10 };
  const hit = core.sweepPlanets({ x: -100, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, [planet], 2);
  assert.equal(hit.planet.id, 'test');
  assert.ok(Math.abs(hit.time - 0.44) < 1e-10);
  assert.ok(hit.position.x <= -12);
  assert.deepEqual(hit.normal, { x: -1, y: 0, z: 0 });
});

test('surface sweeps distinguish a near miss, grazing impact, and motion away from contact', () => {
  assert.equal(typeof core.sweepPlanets, 'function');
  const planet = { id: 'test', position: { x: 0, y: 0, z: 0 }, radius: 10 };
  assert.equal(core.sweepPlanets({ x: -30, y: 12.001, z: 0 }, { x: 30, y: 12.001, z: 0 }, [planet], 2), null);
  const grazing = core.sweepPlanets({ x: -30, y: 11.999, z: 0 }, { x: 30, y: 11.999, z: 0 }, [planet], 2);
  assert.ok(grazing.time > 0 && grazing.time < 0.5);
  assert.ok(Math.hypot(grazing.position.x, grazing.position.y) >= 12);
  assert.equal(core.sweepPlanets({ x: 12, y: 0, z: 0 }, { x: 13, y: 0, z: 0 }, [planet], 2), null);
  const inward = core.sweepPlanets({ x: 12, y: 0, z: 0 }, { x: 11, y: 0, z: 0 }, [planet], 2);
  assert.equal(inward.time, 0);
  const embedded = core.sweepPlanets({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, [planet], 2);
  assert.ok(Math.hypot(embedded.position.x, embedded.position.y, embedded.position.z) > 12);
});

test('a sweep returns the first impact even if a farther planet was listed first', () => {
  assert.equal(typeof core.sweepPlanets, 'function');
  const far = { id: 'far', position: { x: 40, y: 0, z: 0 }, radius: 10 };
  const near = { id: 'near', position: { x: -40, y: 0, z: 0 }, radius: 10 };
  assert.equal(core.sweepPlanets({ x: -100, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, [far, near], 2).planet.id, 'near');
});

test('stored payload follows PRD setting names and uses an ISO lastSaved timestamp', () => {
  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v) };
  assert.equal(core.saveSettings(storage, {shipModel:'ship_02',sound:false,quality:'balanced',hudOpacity:0.6}), true);
  assert.deepEqual(JSON.parse(memory.get(core.STORAGE_KEYS.playerSettings)), {selectedShip:'ship_02',soundEnabled:false,quality:'balanced',hudOpacity:0.6});
  assert.equal(core.loadSettings(storage).shipModel,'ship_02');
  assert.equal(core.loadSettings(storage).sound,false);
  assert.equal(core.saveGame(storage,core.createFlight(),1700000000000),true);
  assert.equal(JSON.parse(memory.get(core.STORAGE_KEYS.gameState)).lastSaved,'2023-11-14T22:13:20.000Z');
});

test('flight saves preserve pose and reject invalid or foreign payloads safely', () => {
  assert.equal(typeof core.saveGame, 'function', 'flight persistence must exist');
  const memory = new Map([['gameState', 'palm-save']]);
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const flight = core.createFlight();
  flight.position = { x: 120, y: -70, z: 220 };
  flight.rotation = { x: 0.2, y: 0.8, z: 0 };
  assert.equal(core.saveGame(storage, flight, 1700000000000), true);
  const saved = core.loadGame(storage);
  assert.deepEqual(saved.position, flight.position);
  assert.deepEqual(saved.rotation, flight.rotation);
  assert.equal(saved.lastSaved, new Date(1700000000000).toISOString());
  assert.equal(saved.world, core.WORLD_ID);
  assert.equal(memory.get('gameState'), 'palm-save');
  const resumed = core.createFlight(saved);
  assert.deepEqual(resumed.position, flight.position);
  assert.deepEqual(resumed.velocity, { x: 0, y: 0, z: 0 });
  for (const invalid of [null, [], {}, { ...saved, world: 'palm-grove' }, { ...saved, position: { x: 1e12, y: 0, z: 0 } }, { ...saved, rotation: { x: NaN, y: 0, z: 0 } }, { ...saved, lastSaved: 'yesterday' }]) {
    assert.equal(core.validateGameState(invalid), null);
  }
  storage.setItem('spaceExplorer.gameState', '{bad');
  assert.equal(core.loadGame(storage), null);
  assert.equal(core.loadGame({ getItem() { throw new Error('blocked'); } }), null);
  assert.equal(core.saveGame({ setItem() { throw new Error('quota'); } }, flight), false);
  assert.equal(core.saveGame(storage, { position: { x: Infinity, y: 0, z: 0 } }), false);
});

test('settings round-trip independently without touching another game’s storage', () => {
  assert.equal(typeof core.saveSettings, 'function', 'settings storage must exist');
  const memory = new Map([['gameState', 'palm-save'], ['playerSettings', 'palm-settings']]);
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  for (const shipModel of ['ship_01', 'ship_02', 'ship_03']) {
    const settings = { shipModel, quality: 'hd', sound: false, hudOpacity: 0.6 };
    assert.equal(core.saveSettings(storage, settings), true);
    assert.deepEqual(core.loadSettings(storage), settings);
  }
  assert.ok(memory.has('spaceExplorer.playerSettings'));
  assert.equal(memory.get('playerSettings'), 'palm-settings');
  assert.equal(memory.get('gameState'), 'palm-save');
  storage.setItem('spaceExplorer.playerSettings', '{bad json');
  assert.deepEqual(core.loadSettings(storage), core.DEFAULT_SETTINGS);
  assert.deepEqual(core.validateSettings({ shipModel: 'fake', quality: '__proto__', sound: 'false', hudOpacity: Infinity }), core.DEFAULT_SETTINGS);
  assert.equal(core.validateSettings({ hudOpacity: -100 }).hudOpacity, 0.35);
  assert.equal(core.saveSettings({ setItem() { throw new Error('quota'); } }, {}), false);
});

test('render sizing caps GPU load at every quality and tolerates malformed viewport values', () => {
  assert.equal(typeof core.getRenderSize, 'function', 'getRenderSize must exist');
  const low = core.getRenderSize(1920, 1080, 3, 'low');
  const balanced = core.getRenderSize(1920, 1080, 3, 'balanced');
  const hd = core.getRenderSize(1920, 1080, 3, 'hd');
  assert.ok(low.width * low.height <= 800000);
  assert.ok(balanced.width * balanced.height <= 1500000);
  assert.ok(hd.width * hd.height <= 3000000);
  assert.ok(low.pixelRatio < balanced.pixelRatio);
  assert.ok(balanced.pixelRatio < hd.pixelRatio);
  assert.deepEqual(core.getRenderSize(NaN, 0, Infinity, 'unknown'), core.getRenderSize(1, 1, 1, 'low'));
  const phone = core.getRenderSize(390, 844, 3, 'low');
  assert.ok(phone.pixelRatio <= 1);
});

test('a new flight starts outside every planet in a world with six distinct destinations', () => {
  assert.equal(typeof core.createFlight, 'function', 'createFlight must exist');
  const flight = core.createFlight();
  assert.ok(core.PLANETS.length >= 6);
  assert.equal(new Set(core.PLANETS.map(planet => planet.id)).size, core.PLANETS.length);
  for (const planet of core.PLANETS) {
    assert.ok(planet.radius > 0);
    assert.ok(Math.hypot(
      flight.position.x - planet.position.x,
      flight.position.y - planet.position.y,
      flight.position.z - planet.position.z,
    ) > planet.radius + core.SHIP_RADIUS);
  }
  assert.deepEqual(flight.velocity, { x: 0, y: 0, z: 0 });
  assert.notEqual(core.createFlight().position, flight.position, 'new flights must not share mutable position');
});

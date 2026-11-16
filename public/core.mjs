// Browser-independent flight rules, shared by the renderer and node:test.
export const SHIP_RADIUS = 2.8;
export const WORLD_ID = 'astra-space-explorer';
export const STORAGE_KEYS = Object.freeze({ gameState: 'spaceExplorer.gameState', playerSettings: 'spaceExplorer.playerSettings' });
export const SHIP_MODELS = Object.freeze(['ship_01', 'ship_02', 'ship_03']);
export const DEFAULT_SETTINGS = Object.freeze({ shipModel: 'ship_01', quality: 'low', sound: true, hudOpacity: 0.82 });
export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ label: 'LOW GPU', scale: 0.72, maxDpr: 1, maxPixels: 800000, stars: 750, segments: 24 }),
  balanced: Object.freeze({ label: 'BALANCED', scale: 0.9, maxDpr: 1.25, maxPixels: 1500000, stars: 1500, segments: 32 }),
  hd: Object.freeze({ label: 'HD', scale: 1, maxDpr: 1.5, maxPixels: 3000000, stars: 2400, segments: 48 }),
});
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function validateSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    shipModel: SHIP_MODELS.includes(source.shipModel ?? source.selectedShip) ? (source.shipModel ?? source.selectedShip) : DEFAULT_SETTINGS.shipModel,
    quality: Object.hasOwn(QUALITY_PRESETS, source.quality) ? source.quality : DEFAULT_SETTINGS.quality,
    sound: typeof source.sound === 'boolean' ? source.sound : typeof source.soundEnabled === 'boolean' ? source.soundEnabled : DEFAULT_SETTINGS.sound,
    hudOpacity: clamp(finite(source.hudOpacity, DEFAULT_SETTINGS.hudOpacity), 0.35, 1),
  };
}

function readStored(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
}

function writeStored(storage, key, value) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function loadSettings(storage) { return validateSettings(readStored(storage, STORAGE_KEYS.playerSettings)); }
export function saveSettings(storage, settings) {
  const clean = validateSettings(settings);
  return writeStored(storage, STORAGE_KEYS.playerSettings, {selectedShip:clean.shipModel,soundEnabled:clean.sound,quality:clean.quality,hudOpacity:clean.hudOpacity});
}

export function getRenderSize(width, height, dpr = 1, quality = 'low') {
  const preset = Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, quality) ? QUALITY_PRESETS[quality] : QUALITY_PRESETS.low;
  width = Math.max(1, finite(width, 1));
  height = Math.max(1, finite(height, 1));
  const pixelRatio = Math.min(clamp(finite(dpr, 1), 0.5, preset.maxDpr) * preset.scale,
    Math.sqrt(preset.maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * pixelRatio)), height: Math.max(1, Math.floor(height * pixelRatio)), pixelRatio };
}
export const PLANETS = Object.freeze([
  { id: 'aurelia', name: 'Aurelia', kind: 'terrestrial', position: { x: 95, y: 22, z: -320 }, radius: 72, color: '#629e99', accent: '#d2b582', seed: 17 },
  { id: 'vesper', name: 'Vesper', kind: 'gas', position: { x: -410, y: 100, z: -760 }, radius: 136, color: '#b99375', accent: '#f0c9a0', seed: 31, rings: true },
  { id: 'nivalis', name: 'Nivalis', kind: 'ice', position: { x: 600, y: 210, z: -1120 }, radius: 108, color: '#83c2d9', accent: '#e2edf4', seed: 51 },
  { id: 'ignis', name: 'Ignis', kind: 'volcanic', position: { x: -730, y: -190, z: 130 }, radius: 95, color: '#653b37', accent: '#ed8051', seed: 73 },
  { id: 'thalassa', name: 'Thalassa', kind: 'ocean', position: { x: 510, y: -280, z: 620 }, radius: 122, color: '#356caa', accent: '#84c9d3', seed: 97 },
  { id: 'umbra', name: 'Umbra', kind: 'rock', position: { x: -270, y: 310, z: 1190 }, radius: 158, color: '#686078', accent: '#aba4bc', seed: 113 },
].map(planet => Object.freeze({ ...planet, position: Object.freeze(planet.position) })));

export function readControls(keys = new Set(), touch = new Set(), stick = { x: 0, y: 0 }) {
  const held = (key, control) => Number(keys.has(key) || touch.has(control));
  return {
    forward: held('KeyW', 'forward') - held('KeyS', 'backward'),
    strafe: held('KeyD', 'right') - held('KeyA', 'left'),
    vertical: held('KeyQ', 'up') - held('KeyE', 'down'),
    yaw: clamp(Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight')) - finite(stick.x), -1, 1),
    pitch: clamp(Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')) - finite(stick.y), -1, 1),
    boost: keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.has('boost'),
    brake: keys.has('Space') || touch.has('brake'),
  };
}

export function nearestPlanet(position, planets = PLANETS) {
  let nearest = null;
  for (const planet of planets) {
    const centerDistance = Math.hypot(position.x - planet.position.x, position.y - planet.position.y, position.z - planet.position.z);
    const distance = Math.max(0, centerDistance - planet.radius);
    if (!nearest || distance < nearest.distance) nearest = { id: planet.id, name: planet.name, distance, centerDistance };
  }
  return nearest;
}

export function stepFlight(state, input = {}, seconds, planets = PLANETS) {
  const total = clamp(finite(seconds), 0, 0.1);
  if (!total) return state;
  const steps = Math.ceil(total / (1 / 120));
  const dt = total / steps;
  state.lastCollision = null;
  for (let step = 0; step < steps; step++) {
    state.rotation.x = clamp(state.rotation.x + clamp(finite(input.pitch), -1, 1) * dt * 1.1, -1.45, 1.45);
    const yaw = state.rotation.y + clamp(finite(input.yaw), -1, 1) * dt * 1.35;
    state.rotation.y = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    let x = finite(input.strafe), y = finite(input.vertical), z = -finite(input.forward);
    const magnitude = Math.max(1, Math.hypot(x, y, z));
    x /= magnitude; y /= magnitude; z /= magnitude;
    const cy = Math.cos(state.rotation.y), sy = Math.sin(state.rotation.y);
    const cp = Math.cos(state.rotation.x), sp = Math.sin(state.rotation.x);
    const tiltedY = y * cp - z * sp, tiltedZ = y * sp + z * cp;
    const acceleration = input.brake ? 0 : input.boost ? 135 : 46;
    const drag = Math.exp(-(input.brake ? 7.5 : 0.46) * dt);
    state.velocity.x = (state.velocity.x + (x * cy + tiltedZ * sy) * acceleration * dt) * drag;
    state.velocity.y = (state.velocity.y + tiltedY * acceleration * dt) * drag;
    state.velocity.z = (state.velocity.z + (-x * sy + tiltedZ * cy) * acceleration * dt) * drag;
    const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
    const cap = input.boost ? 260 : 105;
    if (speed > cap) for (const axis of ['x', 'y', 'z']) state.velocity[axis] *= cap / speed;
    const end = {
      x: state.position.x + state.velocity.x * dt,
      y: state.position.y + state.velocity.y * dt,
      z: state.position.z + state.velocity.z * dt,
    };
    const hit = sweepPlanets(state.position, end, planets);
    if (hit) {
      Object.assign(state.position, hit.position);
      const inward = state.velocity.x * hit.normal.x + state.velocity.y * hit.normal.y + state.velocity.z * hit.normal.z;
      if (inward < 0) for (const axis of ['x', 'y', 'z']) state.velocity[axis] -= inward * hit.normal[axis];
      state.lastCollision = hit.planet.id;
    } else Object.assign(state.position, end);
  }
  state.speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
  return state;
}

// Segment versus expanded spheres; catches tunnelling even when both ends are outside.
export function sweepPlanets(start, end, planets = PLANETS, shipRadius = SHIP_RADIUS) {
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const a = dx * dx + dy * dy + dz * dz;
  let first = null;
  for (const planet of planets) {
    const radius = planet.radius + shipRadius;
    const ox = start.x - planet.position.x, oy = start.y - planet.position.y, oz = start.z - planet.position.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const b = ox * dx + oy * dy + oz * dz;
    let time;
    if (c < -1e-9) time = 0; // A stale save inside terrain must be depenetrated.
    else {
      if (a < 1e-18 || b >= 0) continue;
      const discriminant = b * b - a * c;
      if (discriminant < 0) continue;
      time = (-b - Math.sqrt(discriminant)) / a;
      if (time < -1e-9 || time > 1) continue;
      time = Math.max(0, time);
    }
    if (first && time >= first.time) continue;
    let nx = ox + dx * time, ny = oy + dy * time, nz = oz + dz * time;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) { nx = 0; ny = 1; nz = 0; }
    else { nx /= length; ny /= length; nz /= length; }
    const clearance = radius + 0.002;
    first = { time, planet, normal: { x: nx, y: ny, z: nz }, position: {
      x: planet.position.x + nx * clearance,
      y: planet.position.y + ny * clearance,
      z: planet.position.z + nz * clearance,
    } };
  }
  return first;
}

const isVector = (value, bound) => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]) && Math.abs(value[axis]) <= bound);

export function validateGameState(value) {
  if (!value || value.version !== 1 || value.world !== WORLD_ID ||
    !isVector(value.position, 10000000) || !isVector(value.rotation, Math.PI * 4)) return null;
  // Accept the older numeric prototype timestamp, normalize to PRD ISO format.
  const timestamp = typeof value.lastSaved === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value.lastSaved) ? Date.parse(value.lastSaved) : value.lastSaved;
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 8640000000000000) return null;
  return { version: 1, world: WORLD_ID, position: { ...value.position }, rotation: { ...value.rotation }, lastSaved: new Date(timestamp).toISOString() };
}

export function loadGame(storage) { return validateGameState(readStored(storage, STORAGE_KEYS.gameState)); }
export function saveGame(storage, flight, now = Date.now()) {
  const saved = validateGameState({ version: 1, world: WORLD_ID, position: flight?.position, rotation: flight?.rotation, lastSaved: now });
  return saved ? writeStored(storage, STORAGE_KEYS.gameState, saved) : false;
}

export function createFlight(saved) {
  const valid = validateGameState(saved);
  return {
    position: valid ? { ...valid.position } : { x: 0, y: 0, z: 125 },
    rotation: valid ? { ...valid.rotation } : { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    lastCollision: null,
  };
}

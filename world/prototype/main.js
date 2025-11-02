import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import nacl from 'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm';

const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(256, 256) },
    pixelSize: { value: 1.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;

    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor( vUv / dxy ) + dxy * 0.5;
      gl_FragColor = texture2D( tDiffuse, coord );
    }
  `,
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const inferredBase = window.location.hostname
  ? `${window.location.protocol}//${window.location.hostname}:8080`
  : 'http://127.0.0.1:8080';
const storedApiBase = localStorage.getItem('virtual_farm_api_base');
let apiBase = window.__FARM_CONFIG?.apiBase ?? inferredBase;
if (storedApiBase) {
  apiBase = storedApiBase;
}
const WORKER_ID = window.__FARM_CONFIG?.workerId ?? 'virtual-presenter';
const CAPABILITIES = ['math:basic', 'math:advanced', 'analytics:vector', 'script:sandbox'];
const MOVE_SPEED = 4.5;
const INTERACTION_RADIUS = 1.6;
const REFRESH_INTERVAL_MS = 5_000;
const PLAYER_HEIGHT = 1.2;

const pixelTextures = {};

function makeCheckerTexture(key, colorA, colorB, size = 32, scale = 4) {
  if (pixelTextures[key]) return pixelTextures[key];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cell = size / scale;
  for (let y = 0; y < scale; y += 1) {
    for (let x = 0; x < scale; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  pixelTextures[key] = texture;
  return texture;
}

function makeStripTexture(key, colorA, colorB, size = 32, scale = 4) {
  if (pixelTextures[key]) return pixelTextures[key];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cell = size / scale;
  for (let y = 0; y < scale; y += 1) {
    ctx.fillStyle = y % 2 === 0 ? colorA : colorB;
    ctx.fillRect(0, y * cell, size, cell);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  pixelTextures[key] = texture;
  return texture;
}

function createBlockMaterials({ top, bottom, side }) {
  const topTex = top.clone ? top.clone() : top;
  const bottomTex = bottom.clone ? bottom.clone() : bottom;
  const sideTex = side.clone ? side.clone() : side;
  [topTex, bottomTex, sideTex].forEach((tex) => {
    if (!tex) return;
    tex.needsUpdate = true;
    if (tex.repeat) tex.repeat.set(1, 1);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });
  const topMat = new THREE.MeshStandardMaterial({
    map: topTex,
    roughness: 0.5,
    metalness: 0.0,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    map: bottomTex,
    roughness: 0.6,
    metalness: 0.0,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    map: sideTex,
    roughness: 0.55,
    metalness: 0.0,
  });
  return [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
}

// ---------------------------------------------------------------------------
// DOM hooks
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const statusEl = document.getElementById('status');
const balanceEl = document.getElementById('balance');
const selectionEl = document.getElementById('selection');
const claimBtn = document.getElementById('claim-btn');
const shopBtn = document.getElementById('shop-btn');
const overlay = document.getElementById('lock-overlay');
const enterBtn = document.getElementById('enter-btn');
const toastEl = document.getElementById('toast');
const crosshairEl = document.getElementById('crosshair');
const shopPanel = document.getElementById('shop-panel');
const shopInfo = document.getElementById('shop-info');
const scriptInput = document.getElementById('script-input');
const bountyInput = document.getElementById('bounty-input');
const apiInput = document.getElementById('api-input');
const connectBtn = document.getElementById('connect-btn');
const plantBtn = document.getElementById('plant-btn');
const seedClassicBtn = document.getElementById('seed-classic');
const closePanelBtn = document.getElementById('close-panel');
shopBtn.dataset.mode = 'balance';

if (apiInput) {
  apiInput.value = apiBase;
}

// ---------------------------------------------------------------------------
// Scene bootstrap
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.autoClear = false;

const scene = new THREE.Scene();
const daySkyColor = new THREE.Color(0x1b3d6d);
const nightSkyColor = new THREE.Color(0x050910);
scene.background = nightSkyColor.clone();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, PLAYER_HEIGHT, 5);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const pixelPass = new ShaderPass(PixelShader);
pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
pixelPass.uniforms.pixelSize.value = 2.0;
composer.addPass(pixelPass);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const playerMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.4, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.4, transparent: true })
);
playerMarker.rotation.x = -Math.PI / 2;
scene.add(playerMarker);

const ambient = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xd4f0ff, 0.85);
sun.position.set(8, 12, 10);
scene.add(sun);

const grassTopTex = makeCheckerTexture('grassTop', '#4caf4f', '#3a8c3b');
const grassSideTex = makeStripTexture('grassSide', '#3f7f35', '#2c5a24');
const dirtTex = makeCheckerTexture('dirt', '#7a4a29', '#60371d');
const pathTex = makeStripTexture('path', '#6d5438', '#5a452d');
const waterTex = makeCheckerTexture('water', '#3c7bd6', '#2b5ea3', 32, 8);
const verifiedTopTex = makeCheckerTexture('verifiedTop', '#2fcd7c', '#26a965');
const pendingTopTex = makeCheckerTexture('pendingTop', '#f4c542', '#dba32c');
const scriptTopTex = makeCheckerTexture('scriptTop', '#5a9ee6', '#4a81c2');
const coopTopTex = makeCheckerTexture('coopTop', '#8c5cf4', '#6b43d0');
const coopSideTex = makeCheckerTexture('coopSide', '#41276f', '#2e184e');

const groundGeo = new THREE.CircleGeometry(40, 64);
grassTopTex.repeat.set(48, 48);
const groundMat = new THREE.MeshStandardMaterial({ map: grassTopTex, roughness: 0.85, metalness: 0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const path = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 18),
  new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.9, metalness: 0 })
);
path.rotation.x = -Math.PI / 2;
path.position.set(0, 0.01, -2);
scene.add(path);

const farmBorder = new THREE.Mesh(
  new THREE.TorusGeometry(40, 0.2, 16, 64),
  new THREE.MeshStandardMaterial({ color: 0x1f6f43, emissive: 0x062d18, emissiveIntensity: 0.6 })
);
farmBorder.rotation.x = Math.PI / 2;
scene.add(farmBorder);

const plotGroup = new THREE.Group();
scene.add(plotGroup);

const decorGroup = new THREE.Group();
scene.add(decorGroup);

const animatedProps = [];

const shop = buildShop();
scene.add(shop);

buildFarmDecor();

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const keyState = { forward: false, backward: false, left: false, right: false };

let focusTarget = null;
let taskLookup = new Map();
let latestTasks = [];
let refreshTimer = null;
let dayTimer = Math.random() * Math.PI * 2;

const encoder = new TextEncoder();
const keyPair = loadOrCreateKeyPair();
let pendingShopUnlock = false;

// ---------------------------------------------------------------------------
// Coordinator integration
// ---------------------------------------------------------------------------
async function ensureRegistration() {
  try {
    const res = await fetch(`${apiBase}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: WORKER_ID,
        pub_key: keyPair.publicKeyBase64,
        capabilities: CAPABILITIES,
      }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    try {
      await updateBalance();
    } catch (balanceErr) {
      console.warn('Unable to pull balance after registration', balanceErr);
    }
  } catch (err) {
    console.error('Failed to register virtual worker', err);
    showToast(`Registration failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Scene builders & ambience
// ---------------------------------------------------------------------------
function buildShop() {
  const group = new THREE.Group();
  group.position.set(-6, 0, -4);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 2.2),
    createBlockMaterials({ top: coopTopTex, bottom: dirtTex, side: coopSideTex })
  );
  base.position.y = 0.7;
  group.add(base);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 1.4, 4),
    new THREE.MeshStandardMaterial({
      map: coopSideTex.clone(),
      roughness: 0.5,
      metalness: 0.0,
      emissive: new THREE.Color(0x2a1554),
      emissiveIntensity: 0.4,
    })
  );
  roof.position.y = 1.7;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  const sig = buildBillboard('Compute Coop');
  sig.position.set(0, 2.4, 0);
  group.add(sig);

  group.userData = { type: 'shop' };
  return group;
}

function buildBillboard(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f3f4f6';
  ctx.font = 'bold 36px Inter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), material);
  mesh.rotation.y = Math.PI;
  return mesh;
}

function buildFarmDecor() {
  const treeSpots = [
    new THREE.Vector3(-9, 0, -2),
    new THREE.Vector3(-11, 0, 5),
    new THREE.Vector3(10, 0, 6),
    new THREE.Vector3(8, 0, -8),
  ];
  treeSpots.forEach((pos, idx) => {
    const tree = createTree(idx * 17.3);
    tree.position.copy(pos);
    decorGroup.add(tree);
  });

  const windmill = createWindmill();
  windmill.group.position.set(7.5, 0, -6.5);
  decorGroup.add(windmill.group);
  animatedProps.push({ kind: 'windmill', blades: windmill.blades });

  const drone = createSurveyDrone();
  drone.group.position.set(0, 3.2, 0);
  decorGroup.add(drone.group);
  animatedProps.push({ kind: 'drone', group: drone.group, phase: 0 });

  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 32),
    new THREE.MeshStandardMaterial({
      map: waterTex,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
      metalness: 0.1,
    })
  );
  waterTex.repeat.set(2, 2);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-4, 0.02, 6);
  decorGroup.add(pond);

  const duck = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x332100 })
  );
  duck.position.set(-4, 0.35, 6.4);
  decorGroup.add(duck);

  const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0xd7c59f, roughness: 0.7 });
  const fenceHeight = 0.45;
  const fenceNorth = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 0.2), fenceMaterial);
  fenceNorth.position.set(0, fenceHeight, 4.8);
  decorGroup.add(fenceNorth);

  const fenceSouth = fenceNorth.clone();
  fenceSouth.position.set(0, fenceHeight, -7.2);
  decorGroup.add(fenceSouth);

  const fenceWest = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 12), fenceMaterial);
  fenceWest.position.set(-8.5, fenceHeight, -1.2);
  decorGroup.add(fenceWest);

  const fenceEast = fenceWest.clone();
  fenceEast.position.set(8.5, fenceHeight, -1.2);
  decorGroup.add(fenceEast);

  const coopPath = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 6),
    new THREE.MeshStandardMaterial({ color: 0x46311f })
  );
  coopPath.rotation.x = -Math.PI / 2;
  coopPath.position.set(-6, 0.015, -1.2);
  decorGroup.add(coopPath);

}

function createTree(seed = 0) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 2.4, 12),
    new THREE.MeshStandardMaterial({ color: 0x8d5524 })
  );
  trunk.position.y = 1.2;
  group.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.4, 0),
    new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.4 })
  );
  foliage.position.y = 2.6;
  foliage.scale.setScalar(1 + 0.1 * Math.sin(seed));
  group.add(foliage);

  return group;
}

function createWindmill() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.8, 4.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 })
  );
  base.position.y = 2.1;
  group.add(base);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 0.8, 16),
    new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.3 })
  );
  head.position.y = 4.5;
  group.add(head);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.7, roughness: 0.2 })
  );
  hub.rotation.z = Math.PI / 2;
  hub.position.y = 4.8;
  hub.position.x = 0.5;
  group.add(hub);

  const blades = new THREE.Group();
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  for (let i = 0; i < 4; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.05), bladeMaterial);
    blade.position.y = 1.1;
    blade.position.x = 0.05;
    const holder = new THREE.Group();
    holder.rotation.z = (Math.PI / 2) * i;
    holder.add(blade);
    blades.add(holder);
  }
  blades.position.copy(hub.position).add(new THREE.Vector3(0.15, 0, 0));
  group.add(blades);

  return { group, blades };
}

function createSurveyDrone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x8ab4f8, emissive: 0x1a3b8a, emissiveIntensity: 0.9 })
  );
  group.add(body);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.06, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x3d8bfd, emissiveIntensity: 0.6 })
  );
  group.add(ring);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x72d5ff, emissiveIntensity: 0.8 })
  );
  eye.position.z = 0.4;
  group.add(eye);

  return { group };
}

// ---------------------------------------------------------------------------
// Task fetching & plot rendering
// ---------------------------------------------------------------------------
function buildPlot(task, position) {
  const height = task.completed ? 0.6 : 0.9;
  const geometry = new THREE.BoxGeometry(1.6, height, 1.6);
  const isScript = task.kind === 'script';
  const topTexture = task.completed
    ? task.verified
      ? verifiedTopTex
      : pendingTopTex
    : isScript
    ? scriptTopTex
    : grassTopTex;
  const sideTexture = task.completed ? dirtTex : grassSideTex;
  const materials = createBlockMaterials({ top: topTexture, bottom: dirtTex, side: sideTexture });
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.copy(position);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'plot', taskId: task.id };
  return mesh;
}

function clearPlots() {
  while (plotGroup.children.length) {
    const child = plotGroup.children.pop();
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => mat.dispose());
    } else {
      child.material?.dispose();
    }
  }
  taskLookup = new Map();
}

function layoutPlots(tasks) {
  clearPlots();
  if (!Array.isArray(tasks) || tasks.length === 0) {
    statusEl.textContent = 'No tasks available. Visit the Coop to plant new workloads.';
    return;
  }
  const spacingX = 2.6;
  const spacingZ = 2.8;
  const cols = 5;
  const rows = Math.max(1, Math.ceil(tasks.length / cols));
  const startX = -((cols - 1) * spacingX) / 2;
  const startZ = -((rows - 1) * spacingZ) / 2 - 1.2;

  tasks.forEach((task, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const position = new THREE.Vector3(startX + col * spacingX, 0, startZ + row * spacingZ);
    const mesh = buildPlot(task, position);
    plotGroup.add(mesh);
    taskLookup.set(mesh.id, task);
  });

  statusEl.textContent = `Plots: ${tasks.length} | Open: ${
    tasks.filter((t) => !t.completed).length
  } | Verified: ${tasks.filter((t) => t.verified).length}`;
}

async function fetchTasks() {
  try {
    const res = await fetch(`${apiBase}/tasks_overview`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    showToast(`Failed to load tasks: ${err.message}`);
    return [];
  }
}

async function refreshScene() {
  latestTasks = await fetchTasks();
  layoutPlots(latestTasks);
  return latestTasks;
}

function loadOrCreateKeyPair() {
  const stored = localStorage.getItem('virtual_farm_ed25519');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        publicKey: fromBase64(parsed.publicKey),
        secretKey: fromBase64(parsed.secretKey),
        publicKeyBase64: parsed.publicKey,
      };
    } catch (err) {
      console.warn('Failed to parse stored keypair; regenerating', err);
    }
  }
  const generated = nacl.sign.keyPair();
  const record = {
    publicKey: toBase64(generated.publicKey),
    secretKey: toBase64(generated.secretKey),
  };
  localStorage.setItem('virtual_farm_ed25519', JSON.stringify(record));
  return {
    publicKey: generated.publicKey,
    secretKey: generated.secretKey,
    publicKeyBase64: record.publicKey,
  };
}

function toBase64(bytes) {
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getPlayerPosition() {
  return controls.getObject().position;
}

function computeNearestTarget() {
  const position = getPlayerPosition();
  let nearest = { distance: Infinity, object: null, task: null };

  for (const mesh of plotGroup.children) {
    const dist = mesh.position.distanceTo(position);
    if (dist < INTERACTION_RADIUS && dist < nearest.distance) {
      nearest = { distance: dist, object: mesh, task: taskLookup.get(mesh.id) };
    }
  }

  const shopDist = shop.position.distanceTo(position);
  if (shopDist < INTERACTION_RADIUS && shopDist < nearest.distance) {
    nearest = { distance: shopDist, object: shop, task: null };
  }

  return nearest.object ? nearest : null;
}

function updateFocus() {
  const nearest = computeNearestTarget();
  if (nearest?.object === focusTarget?.object) {
    return;
  }
  focusTarget = nearest;
  if (!focusTarget) {
    selectionEl.textContent = 'Walk to a plot or shop to interact.';
    claimBtn.disabled = true;
    shopBtn.dataset.mode = 'balance';
    shopBtn.textContent = 'Open Shop Panel';
    hideShopPanel();
    return;
  }

  if (focusTarget.object.userData.type === 'plot') {
    const task = focusTarget.task;
    if (!task) return;
    const caps = task.required_capabilities?.length ? task.required_capabilities.join(', ') : 'None';
    selectionEl.textContent = `Plot ${task.id}
Operation: ${task.operation} (${task.kind})
Required: ${caps}
Status: ${task.completed ? (task.verified ? 'Verified ✅' : 'Pending review') : 'Ready to harvest'}
Press E or use the button to claim & solve.`;
    claimBtn.disabled = task.completed;
    shopBtn.dataset.mode = 'balance';
    shopBtn.textContent = 'Open Shop Panel';
    hideShopPanel();
  } else if (focusTarget.object.userData.type === 'shop') {
    if (!shopBtn.dataset.mode) {
      shopBtn.dataset.mode = 'balance';
    }
    shopBtn.textContent = shopPanel.classList.contains('visible')
      ? 'Close Shop Panel'
      : 'Open Shop Panel';
    selectionEl.textContent = `Compute Coop
Check balances or seed new tasks for the farm.
Press E or use the button to open shop menu.`;
    claimBtn.disabled = true;
  }
}

// ---------------------------------------------------------------------------
// Task execution & signing
// ---------------------------------------------------------------------------
async function requestTaskAssignment() {
  try {
    const res = await fetch(`${apiBase}/get_task`, {
      headers: { 'X-Worker-Id': WORKER_ID },
    });
    if (res.status === 204) {
      showToast('No tasks available right now — try seeding new plots at the shop.');
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to request task', err);
    showToast(
      `Failed to request task: ${err.message}. Check that the coordinator is running and reachable.`
    );
    return null;
  }
}

function computeTask(task) {
  switch (task.operation) {
    case 'square':
      return { output: task.input * task.input };
    case 'sqrt':
      return { output: Math.sqrt(task.input) };
    case 'double':
      return { output: task.input * 2 };
    case 'factorial': {
      const n = task.input < 0 ? 0 : Math.floor(task.input);
      let acc = 1;
      for (let i = 2; i <= n; i += 1) {
        acc *= i;
      }
      return { output: acc, metadata: { n } };
    }
    case 'vector_sum': {
      const values = task.payload?.values ?? [];
      if (!Array.isArray(values) || values.length === 0) {
        return { output: task.input, metadata: { warning: 'vector_sum payload missing values' } };
      }
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      values.forEach((val) => {
        const value = typeof val === 'number' ? val : Number(val);
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      });
      return {
        output: sum,
        metadata: {
          count: values.length,
          min,
          max,
          average: sum / values.length,
        },
      };
    }
    case 'mean': {
      const values = task.payload?.values ?? [];
      if (!Array.isArray(values) || values.length === 0) {
        return { output: task.input, metadata: { warning: 'mean payload missing values' } };
      }
      const sum = values.reduce((acc, val) => acc + Number(val), 0);
      return { output: sum / values.length, metadata: { count: values.length } };
    }
    case 'script_eval': {
      const source = `${task.payload?.source ?? ''}`.trim();
      if (!source) {
        return { output: task.input, metadata: { warning: 'script payload missing source' } };
      }
      try {
        return evaluateScriptSnippet(source);
      } catch (err) {
        return { output: task.input, metadata: { error: err.message, source } };
      }
    }
    default:
      return { output: task.input, metadata: { warning: `unhandled op ${task.operation}` } };
  }
}

function evaluateScriptSnippet(source) {
  const trimmed = source.trim();
  const match = trimmed.match(/^print\s*\((.*)\)\s*$/i);
  if (!match) {
    throw new Error('Only print(expression) scripts are supported');
  }
  const expression = match[1];
  if (!/^[0-9+\-*/%.()\s]+$/.test(expression)) {
    throw new Error('Expression contains unsupported characters');
  }
  let value;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expression});`);
    value = fn();
  } catch (err) {
    throw new Error('Failed to evaluate expression');
  }
  if (!Number.isFinite(value)) {
    throw new Error('Expression did not produce a finite number');
  }
  return {
    output: Number(value),
    metadata: {
      expression: expression.trim(),
      source: trimmed,
    },
  };
}

function signResultPayload(result) {
  const message = {
    id: result.id,
    worker: result.worker,
    output: result.output,
  };
  const messageBytes = encoder.encode(JSON.stringify(message));
  const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
  return {
    signatureBase64: toBase64(signature),
    message,
  };
}

async function submitResult(task, output, metadata) {
  const payload = {
    id: task.id,
    worker: WORKER_ID,
    output,
    pub_key: keyPair.publicKeyBase64,
    kind: task.kind,
    payload: metadata ?? undefined,
  };
  const { signatureBase64 } = signResultPayload(payload);
  payload.signature = signatureBase64;

  try {
    const res = await fetch(`${apiBase}/submit_result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    showToast(`Submitted result for ${task.id} (${task.operation})`);
    await updateBalance();
  } catch (err) {
    showToast(`Submit failed: ${err.message}`);
  }
}

async function claimAndSolveCurrentTask() {
  if (!focusTarget || focusTarget.object.userData.type !== 'plot') {
    showToast('Walk onto a plot first');
    return;
  }

  claimBtn.disabled = true;
  selectionEl.textContent = 'Connecting to coordinator…';
  await ensureRegistration();

  const task = await requestTaskAssignment();
  if (!task) {
    selectionEl.textContent = 'No assignment received. Try another plot soon.';
    claimBtn.disabled = false;
    return;
  }

  const result = computeTask(task);
  selectionEl.textContent = `Assigned ${task.id}. Solving ${task.operation}…`;
  if (result.metadata?.error) {
    showToast(`Task error: ${result.metadata.error}`);
    claimBtn.disabled = false;
    await refreshScene();
    return;
  }
  await submitResult(task, result.output, result.metadata);
  await refreshScene();
  claimBtn.disabled = false;
}

// ---------------------------------------------------------------------------
// Coop panel helpers
// ---------------------------------------------------------------------------
async function openShopMenu() {
  if (!focusTarget || focusTarget.object.userData.type !== 'shop') {
    showToast('Head over to the glowing purple Coop to open the panel.');
    return;
  }

  if (controls.isLocked) {
    pendingShopUnlock = true;
    controls.unlock();
  } else if (!shopPanel.classList.contains('visible')) {
    showShopPanel();
  }
  selectionEl.textContent = 'Syncing balances…';

  try {
    const balance = await updateBalance(true);
    selectionEl.textContent = 'Welcome to the Compute Coop. Plant scripts or cash in your tokens.';
  } catch (err) {
    shopInfo.textContent = `Failed to load balance: ${err.message}`;
    selectionEl.textContent = 'The Coop ledger is asleep. Try again in a moment.';
  }
}

async function seedNewTasks() {
  if (!shopPanel.classList.contains('visible')) {
    showToast('Open the Coop console to plant workloads.');
    return;
  }
  seedClassicBtn.disabled = true;
  selectionEl.textContent = 'Planting new tasks…';
  shopInfo.textContent = 'Sprinkling compute seeds across the field…';
  try {
    await seedTasksDirect();
    showToast('Seeded fresh workloads across the farm!');
    await refreshScene();
    await updateBalance();
    selectionEl.textContent = 'Fresh workloads sprouted! Time to harvest.';
  } catch (err) {
    showToast(`Seeding failed: ${err.message}`);
  } finally {
    setTimeout(() => (seedClassicBtn.disabled = false), 600);
  }
}

async function seedTasksDirect() {
  const res = await fetch(`${apiBase}/generate_tasks`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function handleShopAction() {
  if (!focusTarget || focusTarget.object.userData.type !== 'shop') {
    showToast('Walk onto the purple Coop to open its console.');
    return;
  }
  if (shopPanel.classList.contains('visible')) {
    hideShopPanel();
    selectionEl.textContent = 'Closed the Coop panel.';
    lockPointer();
    return;
  }
  openShopMenu();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove('visible'), 3200);
}

async function onPlantTask() {
  const source = scriptInput.value.trim();
  if (!source) {
    showToast('Enter a script like print(5 + 6) first.');
    return;
  }
  const bounty = Math.max(0, Math.min(20, Number(bountyInput.value) || 0));
  plantBtn.disabled = true;
  try {
    await createScriptTask(source, bounty);
    showToast('Script workload planted!');
    scriptInput.value = '';
    await refreshScene();
    await updateBalance();
  } catch (err) {
    showToast(`Failed to plant: ${err.message}`);
  } finally {
    setTimeout(() => {
      plantBtn.disabled = false;
    }, 300);
  }
}

async function createScriptTask(source, price) {
  const body = {
    operation: 'script_eval',
    input: 0,
    price,
    kind: 'script',
    payload: { source },
    required_capabilities: ['script:sandbox'],
  };
  const res = await fetch(`${apiBase}/create_task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`HTTP ${res.status} ${msg}`);
  }
  return res.json().catch(() => ({}));
}

function normalizeApiBase(url) {
  let candidate = url.trim();
  if (!candidate) {
    throw new Error('Coordinator URL is required');
  }
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  const parsed = new URL(candidate);
  return parsed.href.replace(/\/$/, '');
}

async function updateBalance(showPanel = false) {
  try {
    const res = await fetch(`${apiBase}/balance?worker=${encodeURIComponent(WORKER_ID)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const balance = await res.json();
    balanceEl.textContent = `Trust: ${balance.trust ?? 0} | Tokens: ${balance.token ?? 0}`;
    if (showPanel) {
      showShopPanel(balance);
    } else if (shopPanel.classList.contains('visible')) {
      renderShopInfo(balance);
    }
    return balance;
  } catch (err) {
    balanceEl.textContent = 'Trust: -- | Tokens: --';
    if (showPanel || shopPanel.classList.contains('visible')) {
      shopInfo.textContent = `Connection error: ${err.message}`;
    }
    throw err;
  }
}

function renderShopInfo(balance) {
  const trust = balance?.trust ?? 0;
  const tokens = balance?.token ?? 0;
  shopInfo.textContent = `Your on-chain reputation is ${trust} trust and ${tokens} token${
    tokens === 1 ? '' : 's'
  }.
Offer your machine to help neighbours or plant new jobs.`;
}

function showShopPanel(balance) {
  shopPanel.classList.add('visible');
  shopBtn.textContent = 'Close Shop Panel';
  shopBtn.dataset.mode = 'close';
  if (balance) {
    renderShopInfo(balance);
  } else {
    shopInfo.textContent = 'Linking to Coop ledger…';
  }
  overlay.classList.add('hidden');
}

function hideShopPanel() {
  shopPanel.classList.remove('visible');
  shopBtn.textContent = 'Open Shop Panel';
  shopBtn.dataset.mode = 'balance';
  shopInfo.textContent = 'Step inside the Coop to trade compute or plant new workloads.';
  if (!controls.isLocked) {
    overlay.classList.remove('hidden');
  }
}

async function onConnectCoordinator() {
  try {
    const normalized = normalizeApiBase(apiInput.value || '');
    if (normalized === apiBase) {
      showToast('Already connected to this coordinator.');
      return;
    }
    apiBase = normalized;
    localStorage.setItem('virtual_farm_api_base', apiBase);
    apiInput.value = apiBase;
    showToast(`Coordinator set to ${apiBase}`);
    await ensureRegistration();
    await refreshScene();
    await updateBalance(shopPanel.classList.contains('visible'));
    selectionEl.textContent = `Connected to ${apiBase}. Head to the fields to contribute compute.`;
  } catch (err) {
    showToast(`Failed to connect: ${err.message}`);
  }
}
function updateMovement(delta) {
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();

  direction.z = Number(keyState.forward) - Number(keyState.backward);
  direction.x = Number(keyState.right) - Number(keyState.left);
  direction.normalize();

  if (keyState.forward || keyState.backward) velocity.z -= direction.z * MOVE_SPEED * delta;
  if (keyState.left || keyState.right) velocity.x -= direction.x * MOVE_SPEED * delta;

  controls.moveRight(-velocity.x);
  controls.moveForward(-velocity.z);

  const position = controls.getObject().position;
  position.y = PLAYER_HEIGHT;

  const radius = 38;
  const distance = Math.sqrt(position.x ** 2 + position.z ** 2);
  if (distance > radius) {
    const scale = radius / distance;
    position.x *= scale;
    position.z *= scale;
  }

  playerMarker.position.set(position.x, 0.02, position.z);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (controls.isLocked) {
    updateMovement(delta);
    updateFocus();
  }
  dayTimer += delta * 0.2;
  const lightStrength = 0.55 + Math.max(0, Math.sin(dayTimer)) * 0.35;
  ambient.intensity = lightStrength;
  const skyMix = (Math.sin(dayTimer) + 1) / 2;
  scene.background.copy(nightSkyColor).lerp(daySkyColor, skyMix);
  sun.intensity = 0.6 + Math.max(0, Math.sin(dayTimer + Math.PI / 3)) * 0.4;
  sun.position.set(Math.cos(dayTimer) * 10, 8 + Math.sin(dayTimer) * 3, Math.sin(dayTimer) * 10);
  animatedProps.forEach((prop) => {
    if (prop.kind === 'windmill') {
      prop.blades.rotation.z -= delta * 2.2;
    } else if (prop.kind === 'drone') {
      prop.phase += delta;
      const bob = Math.sin(prop.phase * 2.2) * 0.3;
      prop.group.position.y = 3.2 + bob;
      prop.group.rotation.y += delta * 0.6;
    }
  });
  composer.render();
}

function onKeyDown(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      keyState.forward = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keyState.left = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keyState.backward = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keyState.right = true;
      break;
    case 'KeyE':
      if (!controls.isLocked) return;
      if (focusTarget?.object.userData.type === 'plot') claimAndSolveCurrentTask();
      else if (focusTarget?.object.userData.type === 'shop') handleShopAction();
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      keyState.forward = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keyState.left = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keyState.backward = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keyState.right = false;
      break;
    default:
      break;
  }
}

function lockPointer() {
  const element = renderer.domElement;
  overlay.classList.add('hidden');
  crosshairEl.classList.remove('hidden');
  if (element.focus) {
    element.focus({ preventScroll: true });
  }
  const request =
    element.requestPointerLock ||
    element.mozRequestPointerLock ||
    element.webkitRequestPointerLock;
  if (request) {
    request.call(element);
  }
  controls.lock();
  setTimeout(() => {
    if (document.pointerLockElement !== element) {
      overlay.classList.remove('hidden');
      crosshairEl.classList.add('hidden');
      showToast('Click directly on the world, then press Enter Farm again to lock the cursor.');
    }
  }, 250);
}

controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  crosshairEl.classList.remove('hidden');
});

controls.addEventListener('unlock', () => {
  keyState.forward = keyState.backward = keyState.left = keyState.right = false;
  crosshairEl.classList.add('hidden');
  if (pendingShopUnlock) {
    overlay.classList.add('hidden');
    if (!shopPanel.classList.contains('visible')) {
      showShopPanel();
    }
  } else {
    overlay.classList.remove('hidden');
    hideShopPanel();
  }
  pendingShopUnlock = false;
});

document.addEventListener('pointerlockerror', () => {
  overlay.classList.remove('hidden');
  crosshairEl.classList.add('hidden');
  showToast('Pointer lock was blocked. Try clicking directly on the scene and press Enter Farm again.');
});

renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked) {
    lockPointer();
  }
});

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  pixelPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});
enterBtn.addEventListener('click', lockPointer);

claimBtn.addEventListener('click', () => claimAndSolveCurrentTask());
shopBtn.addEventListener('click', () => handleShopAction());
plantBtn.addEventListener('click', () => onPlantTask());
seedClassicBtn.addEventListener('click', () => seedNewTasks());
connectBtn.addEventListener('click', () => onConnectCoordinator());
apiInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    onConnectCoordinator();
  }
});
closePanelBtn.addEventListener('click', () => {
  hideShopPanel();
  lockPointer();
  selectionEl.textContent = 'Back in the field—find a plot to harvest or plant more jobs.';
});

async function bootstrap() {
  await ensureRegistration();
  const tasks = await refreshScene();
  await updateBalance(false).catch(() => {});
  if (!tasks || tasks.length === 0) {
    try {
      await seedTasksDirect();
      await refreshScene();
      showToast('Planted fresh tasks for the farm.');
    } catch (err) {
      console.warn('Unable to auto-seed tasks', err);
      showToast('Coordinator has no tasks yet. Visit the shop to plant some.');
    }
  }
  refreshTimer = setInterval(refreshScene, REFRESH_INTERVAL_MS);
}

bootstrap();
animate();

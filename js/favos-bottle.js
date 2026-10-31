import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ITEMS = window.FAVOS_ITEMS || [];
const TURN = 9.5;
const HERO_PAD = 1.2;
const THUMB_PAD = 1.28;

const heroCanvas = document.getElementById("favos-hero");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
const tilt = new THREE.Group();
const spin = new THREE.Group();
tilt.rotation.set(-0.42, 0, 0.16);
tilt.add(spin);
scene.add(tilt);

scene.add(new THREE.AmbientLight(0xffffff, 0.72));
const key = new THREE.DirectionalLight(0xffffff, 1.55);
key.position.set(2.4, 3.6, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xfff4ea, 0.55);
fill.position.set(-3.2, 1.2, 1.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.45);
rim.position.set(-1.5, 2.4, -3.2);
scene.add(rim);

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

const heroRenderer = makeRenderer(heroCanvas);
const thumbRenderer = makeRenderer(document.createElement("canvas"));
thumbRenderer.setPixelRatio(1);
thumbRenderer.setSize(256, 320, false);

let canEnv = null;

function canEnvironment() {
  if (canEnv) return canEnv;
  const room = new THREE.Scene();
  const panel = (color, x, y, z, w, h) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  };
  panel(0xffffff, 0, 6, 0, 14, 14);
  panel(0xffffff, 8, 2, 4, 2.5, 8);
  panel(0xf4f4f4, -7, 1, 5, 4, 7);
  panel(0xffffff, 0, 3, -8, 12, 5);
  panel(0xbdbdbd, 0, -6, 2, 14, 14);
  const pmrem = new THREE.PMREMGenerator(heroRenderer);
  const target = pmrem.fromScene(room, 0);
  pmrem.dispose();
  canEnv = target.texture;
  return canEnv;
}

function shineCan(root) {
  if (root.userData.asahiShine) return;
  root.userData.asahiShine = true;
  const raw = localStorage.getItem("cookz-asahi-shine");
  const t = Math.min(1, Math.max(0, raw == null ? 0.31 : Number(raw) || 0));
  const env = canEnvironment();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    list.forEach((mat) => {
      if (!mat) return;
      mat.color.setScalar(1);
      mat.metalness = 1;
      mat.roughness = 0.32 - 0.3 * t;
      mat.envMap = env;
      mat.envMapIntensity = 1.15 + 1.05 * t;
      mat.needsUpdate = true;
    });
  });
}

const loader = new GLTFLoader();
const cache = new Map();
const thumbAngles = ITEMS.map(() => 0);
let heroAngle = 0;
let currentRoot = null;
let pickIndex = 0;
let ready = false;
let motionOn = false;
let last = 0;
let loadingPick = -1;
let rafId = 0;

function resetRootTransform(root) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
}

function meshBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let hasMesh = false;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geom = obj.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    const part = geom.boundingBox.clone().applyMatrix4(obj.matrixWorld);
    box.union(part);
    hasMesh = true;
  });
  if (!hasMesh) box.setFromObject(root);
  return box;
}

function poseRoot(root, item) {
  resetRootTransform(root);
  const pitch = item?.pitch || 0;
  const yaw = item?.yaw || 0;
  if (!pitch && !yaw) return;
  let inner = root.userData.pose;
  if (!inner) {
    inner = new THREE.Group();
    inner.name = "pose";
    while (root.children.length) inner.add(root.children[0]);
    root.add(inner);
    root.userData.pose = inner;
  }
  inner.rotation.set(pitch, yaw, 0);
}

const STAGE_CM = 20.5;
const STAGE_H = 1.62;

function scatterFall(root, count, height) {
  if (!count || count < 2 || root.userData.stacked) return;
  root.userData.stacked = true;
  const layout = [
    { x: -0.46, y: 1, z: 0.1, rx: 0.32, rz: -0.38, phase: 0.5, speed: 1 },
    { x: 0.4, y: 0, z: -0.18, rx: -0.18, rz: 0.26, phase: 2.3, speed: 1.16 },
    { x: 0.06, y: -1, z: 0.16, rx: 0.46, rz: 0.14, phase: 4.0, speed: 0.84 },
  ];
  const source = [...root.children];
  const packs = [source];
  for (let i = 1; i < count; i += 1) {
    packs.push(source.map((child) => child.clone(true)));
  }
  source.forEach((child) => root.remove(child));
  const gap = height * 1.7;
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    const slot = layout[i] || layout[layout.length - 1];
    const holder = new THREE.Group();
    const spinner = new THREE.Group();
    holder.add(spinner);
    packs[i].forEach((child) => spinner.add(child));
    spinner.updateMatrixWorld(true);
    const center = meshBounds(spinner).getCenter(new THREE.Vector3());
    spinner.children.forEach((child) => child.position.sub(center));
    holder.position.set(
      slot.x * height,
      ((count - 1) * gap) / 2 - i * gap,
      slot.z * height,
    );
    holder.rotation.x = slot.rx;
    holder.rotation.z = slot.rz;
    spinner.userData.phase = slot.phase;
    spinner.userData.speed = slot.speed;
    root.add(holder);
    pieces.push(spinner);
  }
  root.userData.spinPieces = pieces;
}

function computeFit(root, item) {
  const parent = root.parent;
  if (parent) parent.remove(root);
  poseRoot(root, item);
  root.updateMatrixWorld(true);
  const box = meshBounds(root);
  const size = box.getSize(new THREE.Vector3());
  const upright = Math.max(size.y, 0.0001);
  const cm = item?.cm || STAGE_CM;
  if (item?.fall) scatterFall(root, item.stack || 3, upright);
  root.updateMatrixWorld(true);
  const scale = (STAGE_H * (cm / STAGE_CM)) / upright;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const position = meshBounds(root).getCenter(new THREE.Vector3()).multiplyScalar(-1);
  if (item?.nudge) {
    position.x += item.nudge.x || 0;
    position.y += item.nudge.y || 0;
    position.z += item.nudge.z || 0;
  }
  root.position.copy(position);
  root.updateMatrixWorld(true);
  const sizeAfter = meshBounds(root).getSize(new THREE.Vector3());
  const radiusFinal = Math.max(sizeAfter.x, sizeAfter.y, sizeAfter.z) * 0.5;
  if (parent) parent.add(root);
  return {
    position,
    scale: root.scale.clone(),
    radius: radiusFinal,
  };
}

function fitCacheKey(item) {
  return item?.id || "default";
}

function heroScaleOf(item) {
  return item?.heroScale ?? item?.scaleMul ?? 1;
}

function paddingFor(item, basePad, { thumb = false } = {}) {
  const pad = thumb ? basePad : (item?.heroPad ?? basePad);
  const mul = heroScaleOf(item);
  return mul === 1 ? pad : pad / mul;
}

function applyFit(root, item) {
  const key = fitCacheKey(item);
  if (!root.userData.favosFits) root.userData.favosFits = {};
  if (!root.userData.favosFits[key]) {
    root.userData.favosFits[key] = computeFit(root, item);
  }
  const fit = root.userData.favosFits[key];
  poseRoot(root, item);
  root.scale.copy(fit.scale);
  root.position.copy(fit.position);
  root.updateMatrixWorld(true);
  return fit.radius;
}

function applySceneTilt(item) {
  if (item?.view === "picado") {
    tilt.rotation.set(-0.22, 0, 0.08);
  } else {
    tilt.rotation.set(-0.42, 0, 0.16);
  }
}

function setCameraDistance(aspect) {
  const size = STAGE_H * 1.42;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const distV = size / (2 * Math.tan(vFov / 2));
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distH = size / (2 * Math.tan(hFov / 2));
  const dist = Math.max(distV, distH);
  camera.position.set(0, 0, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
}

function frameModel(root, aspect, padding, item) {
  applySceneTilt(item);
  applyFit(root, item);
  setCameraDistance(aspect);
}

const THUMB_FB = { w: 288, h: 352 };

function loadModel(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        cache.set(url, root);
        resolve(root);
      },
      undefined,
      reject,
    );
  });
}

function mountRoot(root) {
  if (currentRoot && currentRoot !== root) spin.remove(currentRoot);
  currentRoot = root;
  if (!root.parent) spin.add(root);
}

function setSpin(y) {
  const pieces = currentRoot?.userData.spinPieces;
  if (pieces?.length) {
    spin.rotation.y = 0;
    pieces.forEach((piece) => {
      piece.rotation.y = y * (piece.userData.speed || 1) + (piece.userData.phase || 0);
    });
    return;
  }
  spin.rotation.y = y;
}

async function preloadAll() {
  await Promise.all(ITEMS.map((item) => loadModel(item.model)));
  ready = true;
}

async function showPick(index) {
  if (!ITEMS.length) return;
  const i = Math.max(0, Math.min(index, ITEMS.length - 1));
  pickIndex = i;
  loadingPick = i;
  const item = ITEMS[i];
  try {
    const root = await loadModel(item.model);
    if (loadingPick !== i) return;
    if (item.id === "asahi") shineCan(root);
    mountRoot(root);
    if (heroCanvas) heroCanvas.setAttribute("aria-label", item.label);
    if (!motionOn) paintStatic();
  } catch (err) {
    console.error("favos model", item?.model, err);
  }
}

function paintThumbAt(index) {
  const canvas = document.querySelectorAll(".favos-thumb")[index];
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, bw, bh);
  ctx.drawImage(thumbRenderer.domElement, 0, 0, bw, bh);
}

function renderThumbStrip() {
  const canvases = document.querySelectorAll(".favos-thumb");
  if (!ready || !ITEMS.length || !canvases.length) return;

  const savedPick = pickIndex;

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    const root = cache.get(item.model);
    if (!root) continue;
    thumbRenderer.setSize(THUMB_FB.w, THUMB_FB.h, false);
    const thumbAspect = THUMB_FB.w / THUMB_FB.h;
    mountRoot(root);
    frameModel(root, thumbAspect, THUMB_PAD, item, { thumb: true });
    setSpin(thumbAngles[i]);
    thumbRenderer.render(scene, camera);
    paintThumbAt(i);
  }

  const heroItem = ITEMS[savedPick];
  const heroRoot = cache.get(heroItem.model);
  if (heroRoot) mountRoot(heroRoot);
  setSpin(heroAngle);
}

let heroW = 0;
let heroH = 0;

function resizeHero() {
  const w = heroCanvas.clientWidth;
  const h = heroCanvas.clientHeight;
  if (!w || !h || (w === heroW && h === heroH)) return;
  heroW = w;
  heroH = h;
  const phone = matchMedia("(max-width: 820px)").matches;
  const dpr = phone ? 1 : Math.min(devicePixelRatio || 1, 2);
  heroRenderer.setPixelRatio(dpr);
  heroRenderer.setSize(w, h, false);
}

function renderHero() {
  resizeHero();
  if (!heroW || !heroH || !currentRoot) return;
  const item = ITEMS[pickIndex];
  frameModel(currentRoot, heroW / heroH, HERO_PAD, item);
  setSpin(heroAngle);
  heroRenderer.render(scene, camera);
}

function paintStatic() {
  renderHero();
  renderThumbStrip();
}

function tick(now) {
  rafId = 0;
  if (!motionOn) return;

  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;

  if (!reduceMotion) {
    heroAngle += dt * ((Math.PI * 2) / TURN);
    for (let i = 0; i < thumbAngles.length; i++) {
      thumbAngles[i] += dt * ((Math.PI * 2) / TURN);
    }
  }

  renderHero();
  renderThumbStrip();
  rafId = requestAnimationFrame(tick);
}

function startMotion() {
  if (!ready) return;
  if (rafId) return;
  last = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopMotion() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function favosViewOn() {
  const view = document.querySelector('[data-kview="favos"]');
  return view && view.classList.contains("is-on");
}

function setActive(on) {
  const next = !!on;
  if (next === motionOn) return;
  motionOn = next;
  if (motionOn && ready) startMotion();
  else {
    stopMotion();
    if (ready) paintStatic();
  }
}

function setPick(index) {
  showPick(index);
}

function syncActive() {
  setActive(favosViewOn());
}

function refreshThumbs() {
  paintStatic();
}

window.favosBottle = {
  setActive,
  setPick,
  getPick: () => pickIndex,
  bakeThumbnails: refreshThumbs,
  syncActive,
};

let favosBoot = null;
function bootFavosModels() {
  if (favosBoot) return favosBoot;
  favosBoot = preloadAll()
    .then(() => showPick(0))
    .then(() => {
      refreshThumbs();
      if (motionOn) startMotion();
      else if (favosViewOn()) {
        motionOn = true;
        startMotion();
      }
    })
    .catch((err) => console.error("favos preload", err));
  return favosBoot;
}

function maybeBootFavos() {
  if (location.pathname.includes("/favos")) bootFavosModels();
}

window.addEventListener("cookz-nav", maybeBootFavos);
maybeBootFavos();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopMotion();
  else if (motionOn) startMotion();
});

addEventListener("resize", () => {
  heroW = 0;
  heroH = 0;
  if (!ready) return;
  if (motionOn) return;
  paintStatic();
});

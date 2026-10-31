import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.getElementById("home-plate");
const panel = document.querySelector(".home__metal");
if (canvas && panel) {
  const KEY = "cookz-plate-finish";
  const DEFAULTS = {
    metal: 0.86,
    grano: 0.22,
    reflejo: 1.35,
    laca: 0.28,
    luz: 42,
    aire: 1.05,
    inclina: 16,
  };

  const fields = {};
  panel.querySelectorAll("[data-plate]").forEach((input) => {
    fields[input.dataset.plate] = input;
  });

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    saved = {};
  }
  const read = (name) => {
    const input = fields[name];
    const fallback = DEFAULTS[name];
    const raw = saved[name];
    const value = Number.isFinite(Number(raw)) ? Number(raw) : fallback;
    if (input) input.value = String(value);
    return value;
  };
  const state = {};
  Object.keys(DEFAULTS).forEach((name) => {
    state[name] = read(name);
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  camera.position.set(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const hemi = new THREE.HemisphereLight(0xfff8f2, 0x2a2a2a, 0.45);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6ee, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd7dde8, 0.7);
  fill.position.set(-2.4, 0.4, 2.2);
  scene.add(fill);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioRoom(), 0.04).texture;
  pmrem.dispose();

  const face = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(face);
  scene.add(pivot);

  let fitted = false;
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  const plateCenter = canvas.closest(".home__center");
  const explore = plateCenter?.querySelector(".home__explore");
  let spin = 0;
  let spinTarget = 0;
  const lean = THREE.MathUtils.degToRad(20);
  const phone = () => matchMedia("(max-width: 820px)").matches;
  let goTimer = 0;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;

  function studioRoom() {
    const room = new THREE.Scene();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 10), [
      new THREE.MeshBasicMaterial({ color: 0xb7b2a8, side: THREE.BackSide }),
      new THREE.MeshBasicMaterial({ color: 0x3a3834, side: THREE.BackSide }),
      new THREE.MeshBasicMaterial({ color: 0xf7f4ee, side: THREE.BackSide }),
      new THREE.MeshBasicMaterial({ color: 0x2c2a28, side: THREE.BackSide }),
      new THREE.MeshBasicMaterial({ color: 0x6e6a64, side: THREE.BackSide }),
      new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide }),
    ]);
    room.add(shell);
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 5.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    streak.position.set(1.15, 0.7, 4.15);
    streak.lookAt(0, 0, 0);
    room.add(streak);
    const windowPane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 3.2),
      new THREE.MeshBasicMaterial({ color: 0xfffaf4 }),
    );
    windowPane.position.set(3.1, 1.6, -0.4);
    windowPane.lookAt(0, 0.2, 0);
    room.add(windowPane);
    return room;
  }

  function applyFinish() {
    const rad = THREE.MathUtils.degToRad(state.luz);
    key.position.set(Math.cos(rad) * 4.2, 2.4, Math.sin(rad) * 4.2);
    renderer.toneMappingExposure = state.aire;
    fit();
    paint();
  }

  function pose() {
    const front = 1 - spin;
    pivot.rotation.x = THREE.MathUtils.degToRad(state.inclina) + tilt.x * front + spin * Math.PI;
    pivot.rotation.y = tilt.y * front;
    pivot.rotation.z = 0;
    const showBack = spin > 0.62;
    plateCenter?.classList.toggle("is-back", showBack);
    if (explore) explore.style.opacity = showBack ? "1" : "0";
  }

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height || !fitted) return;
    const keepX = tilt.x;
    const keepY = tilt.y;
    tilt.x = 0;
    tilt.y = 0;
    pose();
    pivot.scale.setScalar(1);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y) || 1;
    const aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const dist = camera.position.z;
    const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    const viewW = viewH * aspect;
    pivot.scale.setScalar((Math.min(viewW, viewH) * 0.94) / span);
    tilt.x = keepX;
    tilt.y = keepY;
    pose();
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
    }
    fit();
    paint();
  }

  function paint() {
    pose();
    if (!canvas.clientWidth) return;
    renderer.render(scene, camera);
  }

  function homeOn() {
    return !home || home.classList.contains("is-on");
  }

  function tick() {
    raf = 0;
    if (!homeOn() || document.hidden) return;
    const goalX = reduceMotion ? 0 : -pointer.y * lean;
    const goalY = reduceMotion ? 0 : pointer.x * lean;
    tilt.x += (goalX - tilt.x) * 0.18;
    tilt.y += (goalY - tilt.y) * 0.18;
    spin += (spinTarget - spin) * (reduceMotion ? 1 : 0.09);
    paint();
    const moving = Math.abs(goalX - tilt.x) + Math.abs(goalY - tilt.y) + Math.abs(spinTarget - spin);
    if (moving > 0.0003) raf = requestAnimationFrame(tick);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function persist() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  panel.addEventListener("input", (event) => {
    const input = event.target.closest("[data-plate]");
    if (!input) return;
    state[input.dataset.plate] = Number(input.value);
    applyFinish();
    persist();
  });

  const toggle = panel.querySelector(".home__metal-toggle");
  toggle?.addEventListener("click", () => {
    const open = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  new ResizeObserver(() => resize()).observe(canvas);
  window.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = THREE.MathUtils.clamp((event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth * 0.22), -1, 1);
    pointer.y = THREE.MathUtils.clamp((event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight * 0.22), -1, 1);
    kick();
  });
  window.addEventListener("pointerleave", () => {
    pointer.x = 0;
    pointer.y = 0;
    if (!phone()) spinTarget = 0;
    kick();
  });
  function overPlate(event) {
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.5);
    const ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.5);
    return (nx * nx) / (0.72 * 0.72) + (ny * ny) / (0.7 * 0.7) <= 1;
  }

  function goJapan() {
    clearTimeout(goTimer);
    goTimer = 0;
    if (window.cookzGo) window.cookzGo("japan2026");
    else history.pushState(null, "", "/japan2026");
  }

  canvas.addEventListener("pointermove", (event) => {
    if (phone()) return;
    const onPlate = overPlate(event);
    canvas.style.cursor = onPlate ? "pointer" : "default";
    const next = onPlate ? 1 : 0;
    if (next === spinTarget) return;
    spinTarget = next;
    kick();
  });
  canvas.addEventListener("pointerleave", () => {
    canvas.style.cursor = "default";
    if (phone()) return;
    spinTarget = 0;
    kick();
  });
  canvas.addEventListener("click", (event) => {
    if (!overPlate(event)) return;
    if (!phone()) {
      goJapan();
      return;
    }
    if (spinTarget < 1) {
      spinTarget = 1;
      kick();
      clearTimeout(goTimer);
      goTimer = setTimeout(goJapan, 3000);
      return;
    }
    goJapan();
  });
  document.addEventListener("click", (event) => {
    if (!goTimer) return;
    if (canvas.contains(event.target) && overPlate(event)) return;
    clearTimeout(goTimer);
    goTimer = 0;
  });
  window.addEventListener("cookz-nav", () => {
    const path = location.pathname.replace(/\/$/, "") || "/";
    if (path === "/" || path === "/lescookz") return;
    clearTimeout(goTimer);
    goTimer = 0;
    if (spinTarget === 0) return;
    spinTarget = 0;
    kick();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) paint();
  });

  const home = canvas.closest('[data-screen="home"]');
  if (home) {
    new MutationObserver(() => paint()).observe(home, { attributes: true, attributeFilter: ["class"] });
  }

  new GLTFLoader().load("media/model/favos/plate.glb?v=mesh", (gltf) => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    root.position.sub(center);
    face.rotation.y = -Math.PI / 2;
    face.add(root);
    fitted = true;
    applyFinish();
  });
}

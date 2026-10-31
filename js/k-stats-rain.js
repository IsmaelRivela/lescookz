import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODELS = [
  "media/model/favos/famichiki.glb",
  "media/model/favos/apple-slices.glb",
  "media/model/favos/asahi.glb",
  "media/model/favos/crepe-matcha.glb",
  "media/model/favos/felix.glb",
  "media/model/favos/pocari.glb",
  "media/model/favos/royal-milk-tea.glb",
  "media/model/favos/tuna-mayo-onigiri.glb",
  "media/model/favos/vitamin-c.glb",
];
const SHINE_KEY = "cookz-asahi-shine";

const canvas = document.querySelector("#k-fall");
const link = document.querySelector('.k-menu a[data-extra="tracker"]');
const frame = document.querySelector('.frame[data-screen="konbini"]');
const hub = document.querySelector(".k-hub");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && link && frame && hub && !reduce) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  camera.position.set(0, 0, 11);

  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(2.6, 4.2, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4ea, 0.5);
  fill.position.set(-3.4, 1.4, 2);
  scene.add(fill);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const loader = new GLTFLoader();
  const drops = [];
  let templates = [];
  let ready = false;
  let wants = false;
  let raf = 0;
  let last = 0;
  let spawnIn = 0;
  let canEnv = null;
  const counts = {};
  const tally = document.createElement("div");
  tally.className = "k-fall-count";
  tally.setAttribute("aria-hidden", "true");
  hub.append(tally);

  const rand = (a, b) => a + Math.random() * (b - a);
  const modelId = (url) => url.split("/").pop().replace(/\.glb.*$/, "");

  function shineAmount() {
    const n = Number(localStorage.getItem(SHINE_KEY));
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.31;
  }

  function canEnvironment() {
    if (canEnv) return canEnv;
    const room = new THREE.Scene();
    const panel = (color, x, y, z, w, h) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color })
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
    const pmrem = new THREE.PMREMGenerator(renderer);
    canEnv = pmrem.fromScene(room, 0).texture;
    pmrem.dispose();
    return canEnv;
  }

  function shineCan(root) {
    const t = shineAmount();
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

  function viewSize() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return { halfH, halfW: halfH * camera.aspect };
  }

  function menuBand(halfW) {
    const host = canvas.getBoundingClientRect();
    const menu = link.closest(".k-menu").getBoundingClientRect();
    const gap = 56;
    const toX = (px) => ((px - host.left) / Math.max(host.width, 1) - 0.5) * halfW * 2;
    return { left: toX(menu.left - gap), right: toX(menu.right + gap) };
  }

  function pickX(halfW) {
    const band = menuBand(halfW);
    const edge = 0.45;
    for (let n = 0; n < 16; n += 1) {
      const x = rand(-halfW + edge, halfW - edge);
      if (x < band.left - 0.4 || x > band.right + 0.4) return x;
    }
    return Math.random() < 0.5 ? band.left - rand(0.6, halfW * 0.35) : band.right + rand(0.6, halfW * 0.35);
  }

  function fit(root) {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(1.15 / span);
    root.position.sub(new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()));
    return root;
  }

  function resetCounts() {
    templates.forEach((item) => {
      counts[item.id] = 0;
      const num = tally.querySelector(`[data-id="${item.id}"] .k-fall-count__n`);
      if (!num) return;
      num.textContent = "0";
      num.classList.remove("is-pop");
    });
  }

  function bump(id) {
    counts[id] = (counts[id] || 0) + 1;
    const num = tally.querySelector(`[data-id="${id}"] .k-fall-count__n`);
    if (!num) return;
    num.textContent = String(counts[id]);
    num.classList.remove("is-pop");
    void num.offsetWidth;
    num.classList.add("is-pop");
  }

  function buildTally(icons) {
    tally.replaceChildren();
    templates.forEach((item) => {
      counts[item.id] = 0;
      const row = document.createElement("div");
      row.className = "k-fall-count__row";
      row.dataset.id = item.id;
      const img = document.createElement("img");
      img.className = "k-fall-count__icon";
      img.alt = "";
      img.src = icons[item.id] || "";
      const num = document.createElement("span");
      num.className = "k-fall-count__n";
      num.textContent = "0";
      row.append(img, num);
      tally.append(row);
    });
  }

  function makeThumbs() {
    const thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const light = new THREE.DirectionalLight(0xffffff, 1.35);
    light.position.set(2.4, 3.6, 4.2);
    thumbScene.add(light);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 40);
    renderer.setPixelRatio(1);
    renderer.setSize(96, 96, false);
    const icons = {};
    templates.forEach((item) => {
      const model = item.root.clone(true);
      thumbScene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) * 0.62 || 0.4;
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(center.x + dist * 0.38, center.y + dist * 0.06, center.z + dist);
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      renderer.render(thumbScene, cam);
      icons[item.id] = renderer.domElement.toDataURL("image/png");
      thumbScene.remove(model);
    });
    return icons;
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function removeDrop(drop) {
    scene.remove(drop.root);
    const i = drops.indexOf(drop);
    if (i >= 0) drops.splice(i, 1);
  }

  function spawn(y) {
    const item = templates[Math.floor(Math.random() * templates.length)];
    const { halfH, halfW } = viewSize();
    const spin = new THREE.Group();
    spin.rotation.z = rand(-0.35, 0.35);
    spin.rotation.x = rand(-0.12, 0.12);
    const model = item.root.clone(true);
    model.rotation.y = rand(0, Math.PI * 2);
    model.scale.multiplyScalar(rand(0.82, 1.18));
    spin.add(model);
    const root = new THREE.Group();
    root.add(spin);
    root.position.set(pickX(halfW), y == null ? halfH + rand(0.15, 0.8) : y, rand(-0.35, 0.7));
    scene.add(root);
    drops.push({
      id: item.id,
      root,
      spin,
      seen: false,
      speed: rand(3.4, 5.6),
      spinSpeed: rand(3.2, 6.4) * (Math.random() < 0.5 ? -1 : 1),
    });
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    spawnIn = 0;
    drops.forEach((drop) => scene.remove(drop.root));
    drops.length = 0;
    canvas.classList.remove("is-on");
    frame.classList.remove("is-stats-rain");
    tally.classList.remove("is-on");
  }

  function frameStep(now) {
    raf = requestAnimationFrame(frameStep);
    const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (!hub.classList.contains("is-on")) {
      stop();
      return;
    }
    const { halfH } = viewSize();
    if (wants && drops.length < 46) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = rand(0.1, 0.2);
      }
    }
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const drop = drops[i];
      if (!wants && drop.root.position.y > halfH + 0.05) {
        removeDrop(drop);
        continue;
      }
      drop.spin.rotation.y += drop.spinSpeed * dt;
      drop.root.position.y -= drop.speed * dt;
      if (!drop.seen && drop.root.position.y < halfH - 0.05) {
        drop.seen = true;
        bump(drop.id);
      }
      if (drop.root.position.y < -halfH - 1) removeDrop(drop);
    }
    renderer.render(scene, camera);
    if (!wants && drops.length === 0) stop();
  }

  function start() {
    if (!ready) return;
    const fresh = !raf && drops.length === 0;
    if (fresh) resetCounts();
    resize();
    canvas.classList.add("is-on");
    frame.classList.add("is-stats-rain");
    tally.classList.add("is-on");
    if (fresh) {
      const { halfH } = viewSize();
      for (let i = 0; i < 6; i += 1) spawn(halfH + rand(0.05, 1.6));
      spawnIn = rand(0.08, 0.16);
    }
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frameStep);
    }
  }

  let rainBooted = false;
  function bootRain() {
    if (rainBooted) return;
    rainBooted = true;
    Promise.all(
      MODELS.map((url) =>
        loader.loadAsync(url).then((gltf) => ({ id: modelId(url), root: fit(gltf.scene) })).catch(() => null)
      )
    ).then((list) => {
      templates = list.filter(Boolean);
      const asahi = templates.find((item) => item.id === "asahi");
      if (asahi) shineCan(asahi.root);
      buildTally(makeThumbs());
      ready = templates.length > 0;
      if (wants) start();
    });
  }

  link.addEventListener("mouseenter", () => {
    wants = true;
    bootRain();
    start();
  });
  link.addEventListener("focus", () => {
    wants = true;
    bootRain();
    start();
  });
  link.addEventListener("mouseleave", () => {
    wants = false;
  });
  link.addEventListener("blur", () => {
    wants = false;
  });
  window.addEventListener("resize", () => {
    if (canvas.classList.contains("is-on")) resize();
  });
}

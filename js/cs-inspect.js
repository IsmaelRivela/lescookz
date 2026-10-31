import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * CS 1.6 viewmodel, read from the GoldSrc .mdl.
 * Skinning stays in the engine's space (one bone per vertex, AngleQuaternion).
 * Euler channels are not lerped: some frames wrap by ~π while the matrix
 * stays put. Playback slerps the matrices instead.
 */

const MDL_URL = "media/model/tracker/v_knife_inspect.mdl";
const SNACKS = [
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
const KNIFE_BONE = "v_weapon.knife";
const IDLE_SEQ = "idle";
const INSPECT_SEQ = "inspect_1";
const DRAW_SEQ = "draw";
const GRIP_KEY = "cookz-grips";
const SHINE_KEY = "cookz-asahi-shine";
// Grip editing stays off the page. Add ?grip before the hash to open it:
// http://127.0.0.1:5176/figma-web/?grip#/konbini/tracker
const GRIP_DEV = new URLSearchParams(location.search).has("grip");
// The eye stays at the origin and looks at the snack, so it stays in the
// middle of the frame at any screen size. Inspect can lift it without
// sending it off the top.

// span: longest side, in the same units as the viewmodel.
// pos: where that center sits on the knife (y runs along the blade, 0 is the fist).
// rot: degrees. face is ry, tilt is rx, roll is rz.
const GRIPS = {
  famichiki: { span: 5.5, pos: [0.2, 1.3, 0.85], rot: [-5, -6, 0], palm: 0.79 },
  "apple-slices": { span: 4.4, pos: [0, 0.8, 0.15], rot: [0, 7, 0], palm: 0.3 },
  asahi: { span: 6.55, pos: [-0.15, 1.4, 0.05], rot: [-7, 84, 4], palm: 0.3 },
  "crepe-matcha": { span: 5.2, pos: [0.05, 0.4, -0.3], rot: [75, 10, 0], palm: 0.32 },
  felix: { span: 2.25, pos: [0.1, 0.15, -0.2], rot: [-34, 0, -93], palm: 0 },
  pocari: { span: 8, pos: [0, 0.55, -0.25], rot: [0, 80, 0], palm: 0 },
  "royal-milk-tea": { span: 7.35, pos: [0, 0.5, -0.25], rot: [0, 100, 0], palm: 0.28 },
  "tuna-mayo-onigiri": { span: 3.85, pos: [0.05, 0.3, -0.25], rot: [-16, 0, 2], palm: 0.31 },
  "vitamin-c": { span: 4.2, pos: [0, 0.6, -0.2], rot: [0, 30, 0], palm: 0 },
};

const canvas = document.getElementById("cs-inspect");
const view = canvas?.closest("[data-kview]");
if (!canvas || !view) {
  window.csInspect = { setActive() {} };
} else {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 400);
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key = new THREE.DirectionalLight(0xfff4ea, 1.35);
  key.position.set(8, 18, 10);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-12, 6, -8);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);
  const meshes = [];
  let knifeMesh = null;
  const attach = new THREE.Object3D();
  root.add(attach);

  let clips = null;
  let bones = null;
  let playing = false;
  let raf = 0;
  let clock = 0;
  let last = 0;
  let mode = "idle";
  const snacks = [];
  let snackIndex = 0;
  let gripOn = false;
  let gripOverrides = {};
  const lookTarget = new THREE.Vector3();
  const gripPanel = document.getElementById("k-grip");

  function cstr(bytes, start, len) {
    let end = start;
    const stop = start + len;
    while (end < stop && bytes[end] !== 0) end += 1;
    return new TextDecoder("latin1").decode(bytes.subarray(start, end));
  }

  function angleQuat(ax, ay, az) {
    const sy = Math.sin(az * 0.5);
    const cy = Math.cos(az * 0.5);
    const sp = Math.sin(ay * 0.5);
    const cp = Math.cos(ay * 0.5);
    const sr = Math.sin(ax * 0.5);
    const cr = Math.cos(ax * 0.5);
    return new THREE.Quaternion(
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
      cr * cp * cy + sr * sp * sy,
    );
  }

  function gsToThree(x, y, z, target) {
    target.set(x, z, -y);
    return target;
  }

  function animValue(bytes, aoff, offset, frame, base, scale) {
    if (offset === 0) return base;
    let p = aoff + offset;
    let k = frame;
    for (let guard = 0; guard < 10000; guard += 1) {
      const valid = bytes[p];
      const total = bytes[p + 1];
      if (total > k) {
        const sample = valid > k ? k : valid - 1;
        const raw = new DataView(bytes.buffer, bytes.byteOffset + p + 2 + sample * 2, 2).getInt16(0, true);
        return raw * scale + base;
      }
      k -= total;
      p += 2 + valid * 2;
    }
    return base;
  }

  function parse(buffer) {
    const bytes = new Uint8Array(buffer);
    const viewDv = new DataView(buffer);
    if (cstr(bytes, 0, 4) !== "IDST" || viewDv.getInt32(4, true) !== 10) {
      throw new Error("not a GoldSrc mdl");
    }
    const numbones = viewDv.getInt32(140, true);
    const boneindex = viewDv.getInt32(144, true);
    const numseq = viewDv.getInt32(164, true);
    const seqindex = viewDv.getInt32(168, true);
    const numtex = viewDv.getInt32(180, true);
    const texindex = viewDv.getInt32(184, true);
    const numskinref = viewDv.getInt32(192, true);
    const skinindex = viewDv.getInt32(200, true);
    const numbody = viewDv.getInt32(204, true);
    const bodyindex = viewDv.getInt32(208, true);

    const boneList = [];
    for (let i = 0; i < numbones; i += 1) {
      const o = boneindex + i * 112;
      const value = [];
      const scale = [];
      for (let j = 0; j < 6; j += 1) {
        value.push(viewDv.getFloat32(o + 64 + j * 4, true));
        scale.push(viewDv.getFloat32(o + 88 + j * 4, true));
      }
      boneList.push({
        name: cstr(bytes, o, 32),
        parent: viewDv.getInt32(o + 32, true),
        value,
        scale,
      });
    }

    const seqs = [];
    for (let i = 0; i < numseq; i += 1) {
      const o = seqindex + i * 176;
      seqs.push({
        label: cstr(bytes, o, 32),
        fps: viewDv.getFloat32(o + 32, true),
        frames: viewDv.getInt32(o + 56, true),
        blends: viewDv.getInt32(o + 120, true),
        animindex: viewDv.getInt32(o + 124, true),
        seqgroup: viewDv.getInt32(o + 148, true),
      });
    }

    const textures = [];
    for (let i = 0; i < numtex; i += 1) {
      const o = texindex + i * 80;
      const flags = viewDv.getInt32(o + 64, true);
      const w = viewDv.getInt32(o + 68, true);
      const h = viewDv.getInt32(o + 72, true);
      const index = viewDv.getInt32(o + 76, true);
      const rgba = new Uint8Array(w * h * 4);
      const pal = index + w * h;
      for (let p = 0; p < w * h; p += 1) {
        const idx = bytes[index + p];
        rgba[p * 4] = bytes[pal + idx * 3];
        rgba[p * 4 + 1] = bytes[pal + idx * 3 + 1];
        rgba[p * 4 + 2] = bytes[pal + idx * 3 + 2];
        rgba[p * 4 + 3] = 255;
      }
      const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.flipY = false;
      tex.needsUpdate = true;
      textures.push({ name: cstr(bytes, o, 64), flags, w, h, tex });
    }

    const skin = [];
    for (let i = 0; i < numskinref; i += 1) skin.push(viewDv.getUint16(skinindex + i * 2, true));

    const parts = [];
    for (let i = 0; i < numbody; i += 1) {
      const o = bodyindex + i * 76;
      const nummodels = viewDv.getInt32(o + 64, true);
      const modelindex = viewDv.getInt32(o + 72, true);
      for (let m = 0; m < nummodels; m += 1) {
        const mo = modelindex + m * 112;
        const nummesh = viewDv.getInt32(mo + 72, true);
        const meshindex = viewDv.getInt32(mo + 76, true);
        const numverts = viewDv.getInt32(mo + 80, true);
        const vertinfoindex = viewDv.getInt32(mo + 84, true);
        const vertindex = viewDv.getInt32(mo + 88, true);
        const numnorms = viewDv.getInt32(mo + 92, true);
        const normindex = viewDv.getInt32(mo + 100, true);
        const verts = [];
        const norms = [];
        const vinfo = [];
        for (let v = 0; v < numverts; v += 1) {
          verts.push([
            viewDv.getFloat32(vertindex + v * 12, true),
            viewDv.getFloat32(vertindex + v * 12 + 4, true),
            viewDv.getFloat32(vertindex + v * 12 + 8, true),
          ]);
          vinfo.push(bytes[vertinfoindex + v]);
        }
        for (let v = 0; v < numnorms; v += 1) {
          norms.push([
            viewDv.getFloat32(normindex + v * 12, true),
            viewDv.getFloat32(normindex + v * 12 + 4, true),
            viewDv.getFloat32(normindex + v * 12 + 8, true),
          ]);
        }
        const meshList = [];
        for (let k = 0; k < nummesh; k += 1) {
          const mso = meshindex + k * 20;
          meshList.push({
            triindex: viewDv.getInt32(mso + 4, true),
            skinref: viewDv.getInt32(mso + 8, true),
          });
        }
        parts.push({
          name: cstr(bytes, mo, 64),
          verts,
          norms,
          vinfo,
          meshes: meshList,
        });
      }
    }
    return { bytes, boneList, seqs, textures, skin, parts };
  }

  function expandMesh(bytes, mesh, part, tex) {
    const corners = [];
    let p = mesh.triindex;
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    for (let guard = 0; guard < 100000; guard += 1) {
      const n = dv.getInt16(p, true);
      p += 2;
      if (n === 0) break;
      const fan = n < 0;
      const count = fan ? -n : n;
      const tri = [];
      for (let i = 0; i < count; i += 1) {
        const vert = dv.getInt16(p, true);
        const norm = dv.getInt16(p + 2, true);
        const s = dv.getInt16(p + 4, true);
        const t = dv.getInt16(p + 6, true);
        p += 8;
        // GoldSrc stores the sheet top-down and t grows down the image.
        // DataTexture with flipY false puts row 0 at v = 0, so v is t / height.
        tri.push({ vert, norm, u: s / tex.w, v: t / tex.h });
      }
      const push = (a, b, c) => {
        corners.push(tri[a], tri[b], tri[c]);
      };
      if (fan) {
        for (let k = 2; k < count; k += 1) push(0, k, k - 1);
      } else {
        for (let k = 2; k < count; k += 1) {
          if (k % 2 === 0) push(k - 2, k, k - 1);
          else push(k - 1, k, k - 2);
        }
      }
    }
    return { corners, part };
  }

  function bakeClip(mdl, seq) {
    if (seq.seqgroup !== 0 || seq.blends !== 1) {
      throw new Error(`${seq.label} is not a single in-file clip`);
    }
    const { bytes, boneList } = mdl;
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    const frames = [];
    for (let f = 0; f < seq.frames; f += 1) {
      const pose = [];
      for (let i = 0; i < boneList.length; i += 1) {
        const aoff = seq.animindex + i * 12;
        const bone = boneList[i];
        const ch = [];
        for (let j = 0; j < 6; j += 1) {
          const offset = dv.getUint16(aoff + j * 2, true);
          ch.push(animValue(bytes, aoff, offset, f, bone.value[j], bone.scale[j]));
        }
        pose.push({
          pos: new THREE.Vector3(ch[0], ch[1], ch[2]),
          quat: angleQuat(ch[3], ch[4], ch[5]),
        });
      }
      frames.push(pose);
    }
    return { fps: seq.fps, frames };
  }

  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  const quatA = new THREE.Quaternion();
  const quatB = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const basisX = new THREE.Vector3();
  const basisY = new THREE.Vector3();
  const basisZ = new THREE.Vector3();
  const origin = new THREE.Vector3();

  function localMatrix(pos, quat, out) {
    const te = new THREE.Matrix4().makeRotationFromQuaternion(quat).elements;
    out[0][0] = te[0];
    out[1][0] = te[1];
    out[2][0] = te[2];
    out[0][1] = te[4];
    out[1][1] = te[5];
    out[2][1] = te[6];
    out[0][2] = te[8];
    out[1][2] = te[9];
    out[2][2] = te[10];
    out[0][3] = pos.x;
    out[1][3] = pos.y;
    out[2][3] = pos.z;
  }

  function concat(a, b, o) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        o[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
      o[i][3] = a[i][0] * b[0][3] + a[i][1] * b[1][3] + a[i][2] * b[2][3] + a[i][3];
    }
  }

  function samplePose(time, clip, loop) {
    const { frames, fps } = clip;
    const span = Math.max(frames.length - 1, 1);
    const f = loop ? (time * fps) % frames.length : Math.min(time * fps, span);
    const i0 = Math.floor(f);
    const i1 = (i0 + 1) % frames.length;
    const u = f - i0;
    const pose = [];
    for (let i = 0; i < bones.length; i += 1) {
      posA.copy(frames[i0][i].pos);
      posB.copy(frames[i1][i].pos);
      quatA.copy(frames[i0][i].quat);
      quatB.copy(frames[i1][i].quat);
      tmpPos.lerpVectors(posA, posB, u);
      tmpQuat.copy(quatA).slerp(quatB, u);
      pose.push({ pos: tmpPos.clone(), quat: tmpQuat.clone() });
    }
    return pose;
  }

  function worldMatrices(pose) {
    const locals = pose.map((p) => {
      const m = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      localMatrix(p.pos, p.quat, m);
      return m;
    });
    const worlds = new Array(bones.length);
    const build = (i) => {
      if (worlds[i]) return worlds[i];
      const parent = bones[i].parent;
      if (parent < 0) {
        worlds[i] = locals[i];
      } else {
        const o = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
        concat(build(parent), locals[i], o);
        worlds[i] = o;
      }
      return worlds[i];
    };
    for (let i = 0; i < bones.length; i += 1) build(i);
    return worlds;
  }

  const scratch = new THREE.Vector3();

  function currentClip() {
    if (mode === "draw") return clips.draw;
    if (mode === "inspect") return clips.inspect;
    return clips.idle;
  }

  let openQuats = [];
  let rightHand = [];

  function cacheOpenHand() {
    openQuats = bones.map((b) => angleQuat(b.value[3], b.value[4], b.value[5]));
    // Wrist stays on the animated pose. Only the fingers open.
    rightHand = bones.map((b) => /Bip01_R_Finger/.test(b.name));
  }

  function blendPalm(pose) {
    const name = snacks[snackIndex]?.userData.gripName;
    // 0 keeps the animated fist. 1 straightens the right fingers.
    // The wrist bone is left on the clip so the forearm stays put.
    const open = name ? (gripFor(name).palm ?? 0) : 0;
    if (open <= 0.001) return;
    const t = 1 - Math.min(1, Math.max(0, open));
    for (let i = 0; i < rightHand.length; i += 1) {
      if (!rightHand[i]) continue;
      tmpQuat.copy(openQuats[i]).slerp(pose[i].quat, t);
      pose[i].quat.copy(tmpQuat);
    }
  }

  function applyPose(time) {
    const clip = currentClip();
    const pose = reduceMotion
      ? clip.frames[0].map((b) => ({ pos: b.pos.clone(), quat: b.quat.clone() }))
      : samplePose(time, clip, mode === "idle");
    blendPalm(pose);
    const worlds = worldMatrices(pose);
    for (const mesh of meshes) {
      if (mesh === knifeMesh) continue;
      const attr = mesh.geometry.attributes.position;
      const norm = mesh.geometry.attributes.normal;
      const src = mesh.userData.corners;
      const part = mesh.userData.part;
      for (let i = 0; i < src.length; i += 1) {
        const c = src[i];
        const m = worlds[part.vinfo[c.vert]];
        const v = part.verts[c.vert];
        const x = m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + m[0][3];
        const y = m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + m[1][3];
        const z = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + m[2][3];
        gsToThree(x, y, z, scratch);
        attr.setXYZ(i, scratch.x, scratch.y, scratch.z);
        const n = part.norms[c.norm];
        const nx = m[0][0] * n[0] + m[0][1] * n[1] + m[0][2] * n[2];
        const ny = m[1][0] * n[0] + m[1][1] * n[1] + m[1][2] * n[2];
        const nz = m[2][0] * n[0] + m[2][1] * n[1] + m[2][2] * n[2];
        gsToThree(nx, ny, nz, scratch);
        norm.setXYZ(i, scratch.x, scratch.y, scratch.z);
      }
      attr.needsUpdate = true;
      norm.needsUpdate = true;
    }
    const knife = bones.findIndex((b) => b.name === KNIFE_BONE);
    const m = worlds[knife];
    gsToThree(m[0][0], m[1][0], m[2][0], basisX);
    gsToThree(m[0][1], m[1][1], m[2][1], basisY);
    gsToThree(m[0][2], m[1][2], m[2][2], basisZ);
    gsToThree(m[0][3], m[1][3], m[2][3], origin);
    attach.matrix.makeBasis(basisX, basisY, basisZ);
    attach.matrix.setPosition(origin);
    attach.matrixWorldNeedsUpdate = true;
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // CS 1.6 horizontal FOV is 90. Three.js takes the vertical angle.
    // The phone keeps that same rig. Only the framing changes, so the
    // forearms are not pulled or scaled.
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    const hFov = THREE.MathUtils.degToRad(90);
    camera.fov = mobile
      ? 70
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hFov / 2) / camera.aspect));
    camera.near = 1;
    camera.position.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    frameSnack();
  }

  function frameSnack() {
    const snack = snacks[snackIndex];
    camera.position.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    if (!snack) lookTarget.set(16, -2, 4);
    else {
      snack.updateWorldMatrix(true, false);
      snack.getWorldPosition(lookTarget);
    }
    camera.lookAt(lookTarget);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!playing) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!reduceMotion) clock += dt;
    if ((mode === "draw" || mode === "inspect") && clips) {
      const clip = currentClip();
      const dur = (clip.frames.length - 1) / clip.fps;
      if (clock >= dur) {
        mode = "idle";
        clock = 0;
      }
    }
    applyPose(clock);
    frameSnack();
    renderer.render(scene, camera);
  }

  function showSnack(index) {
    snackIndex = (index + snacks.length) % snacks.length;
    snacks.forEach((obj, i) => {
      obj.visible = i === snackIndex;
    });
    syncGripPanel();
    syncMetalPanel();
  }

  function cycleSnack() {
    if (!snacks.length || !clips) return;
    showSnack(snackIndex + 1);
    if (!reduceMotion) {
      mode = "draw";
      clock = 0;
    }
  }

  function playInspect() {
    if (!clips || reduceMotion) return;
    mode = "inspect";
    clock = 0;
  }

  function setActive(on) {
    playing = Boolean(on) && Boolean(clips);
    if (playing) {
      last = 0;
      if (!raf) raf = requestAnimationFrame(tick);
      resize();
    }
  }

  function snackName(url) {
    return url.split("/").pop().replace(/\.glb$/, "");
  }

  function loadGripOverrides() {
    try {
      const raw = localStorage.getItem(GRIP_KEY);
      gripOverrides = raw ? JSON.parse(raw) : {};
    } catch {
      gripOverrides = {};
    }
  }

  function saveGripOverrides() {
    localStorage.setItem(GRIP_KEY, JSON.stringify(gripOverrides));
  }

  function gripFor(name) {
    const base = GRIPS[name] || GRIPS.famichiki;
    const over = gripOverrides[name];
    if (!over) return { ...base, palm: Number.isFinite(base.palm) ? base.palm : 0 };
    const palm = Number.isFinite(over.palm) ? over.palm : base.palm;
    return {
      span: Number.isFinite(over.span) ? over.span : base.span,
      pos: Array.isArray(over.pos) ? over.pos : base.pos,
      rot: Array.isArray(over.rot) ? over.rot : base.rot,
      palm: Number.isFinite(palm) ? palm : 0,
    };
  }

  const HEIGHT_KEY = "cookz-osaka-height";
  let canEnv = null;
  let shineAmount = 0.31;
  let osakaApi = null;
  let osakaBase = null;
  const osakaDepth = 0.22;
  let osakaHeight = 0.06;

  function norm3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function applyEyeLift() {
    if (!osakaApi || !osakaBase) return;
    const eye = osakaBase.eye.slice();
    const target = osakaBase.target.slice();
    const depth = osakaBase.dist * osakaDepth;
    eye[1] += depth;
    target[1] += depth;
    const forward = norm3([
      target[0] - eye[0],
      target[1] - eye[1],
      target[2] - eye[2],
    ]);
    const worldUp = Math.abs(forward[1]) > 0.75 ? [0, 0, 1] : [0, 1, 0];
    const right = norm3(cross3(forward, worldUp));
    const up = norm3(cross3(right, forward));
    const hop = osakaBase.dist * osakaHeight;
    for (let i = 0; i < 3; i += 1) {
      eye[i] += up[i] * hop;
      target[i] += up[i] * hop;
    }
    osakaApi.setCameraLookAt(eye, target, 0);
  }

  function setEyeLift(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return;
    osakaHeight = Math.min(0.2, Math.max(-0.2, n));
    const val = document.getElementById("k-eye-val");
    const input = document.getElementById("k-eye-range");
    const shown = osakaHeight.toFixed(2);
    if (val) val.textContent = shown;
    if (input) input.value = shown;
    localStorage.setItem(HEIGHT_KEY, shown);
    applyEyeLift();
  }

  function loadHeight() {
    const raw = localStorage.getItem(HEIGHT_KEY);
    if (raw == null) return;
    setEyeLift(raw);
  }

  function loadShine() {
    const raw = localStorage.getItem(SHINE_KEY);
    if (raw == null) return;
    const n = Number(raw);
    if (Number.isFinite(n)) shineAmount = Math.min(1, Math.max(0, n));
  }

  function shineParams(amount) {
    const t = Math.min(1, Math.max(0, amount));
    return {
      metalness: 1,
      roughness: 0.32 - 0.3 * t,
      envMapIntensity: 1.15 + 1.05 * t,
    };
  }

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
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(room, 0);
    pmrem.dispose();
    canEnv = target.texture;
    return canEnv;
  }

  function applyShine(root, amount) {
    const env = canEnvironment();
    const p = shineParams(amount);
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      list.forEach((mat) => {
        if (!mat) return;
        mat.color.setScalar(1);
        mat.metalness = p.metalness;
        mat.roughness = p.roughness;
        mat.envMap = env;
        mat.envMapIntensity = p.envMapIntensity;
        mat.needsUpdate = true;
      });
    });
  }

  function shineCan(root) {
    applyShine(root, shineAmount);
  }

  function syncMetalPanel() {
    const panel = document.getElementById("k-metal");
    if (!panel) return;
    const on = GRIP_DEV && snacks[snackIndex]?.userData.gripName === "asahi";
    panel.hidden = !on;
    const input = document.getElementById("k-metal-range");
    if (input && document.activeElement !== input) input.value = String(shineAmount);
  }

  function setShine(amount) {
    shineAmount = Math.min(1, Math.max(0, amount));
    localStorage.setItem(SHINE_KEY, String(shineAmount));
    const holder = snacks.find((s) => s.userData.gripName === "asahi");
    if (holder) applyShine(holder, shineAmount);
  }

  function mountProduct(object, name) {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z) || 1;
    object.scale.setScalar(1 / span);
    object.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(object);
    object.position.sub(fitted.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group();
    holder.name = name;
    holder.userData.gripName = name;
    holder.add(object);
    holder.frustumCulled = false;
    applyGrip(holder);
    return holder;
  }

  function applyGrip(holder) {
    const g = gripFor(holder.userData.gripName);
    holder.scale.setScalar(g.span);
    holder.position.set(g.pos[0], g.pos[1], g.pos[2]);
    holder.rotation.set(
      THREE.MathUtils.degToRad(g.rot[0]),
      THREE.MathUtils.degToRad(g.rot[1]),
      THREE.MathUtils.degToRad(g.rot[2]),
    );
  }

  function gripField(key) {
    return gripPanel?.querySelector(`[data-grip="${key}"]`);
  }

  function syncGripPanel() {
    if (!gripPanel) return;
    const holder = snacks[snackIndex];
    const name = holder?.userData.gripName;
    if (!name) return;
    const nameEl = document.getElementById("k-grip-name");
    if (nameEl) nameEl.textContent = name.replace(/-/g, " ");
    const g = gripFor(name);
    const values = {
      span: g.span,
      x: g.pos[0],
      y: g.pos[1],
      z: g.pos[2],
      rx: g.rot[0],
      ry: g.rot[1],
      rz: g.rot[2],
      palm: g.palm,
    };
    Object.entries(values).forEach(([key, value]) => {
      const input = gripField(key);
      if (input) input.value = String(value);
    });
  }

  function readGripPanel() {
    const holder = snacks[snackIndex];
    const name = holder?.userData.gripName;
    if (!name) return;
    const num = (key) => Number(gripField(key).value);
    gripOverrides[name] = {
      span: num("span"),
      pos: [num("x"), num("y"), num("z")],
      rot: [num("rx"), num("ry"), num("rz")],
      palm: num("palm"),
    };
    saveGripOverrides();
    applyGrip(holder);
  }

  function toggleGrip() {
    gripOn = !gripOn;
    if (!gripPanel) return;
    gripPanel.hidden = !gripOn;
    if (gripOn) syncGripPanel();
  }

  async function start() {
    const buffer = await fetch(MDL_URL).then((r) => {
      if (!r.ok) throw new Error(`mdl ${r.status}`);
      return r.arrayBuffer();
    });
    const mdl = parse(buffer);
    bones = mdl.boneList;
    cacheOpenHand();
    const idle = mdl.seqs.find((s) => s.label === IDLE_SEQ);
    const inspect = mdl.seqs.find((s) => s.label === INSPECT_SEQ);
    const draw = mdl.seqs.find((s) => s.label === DRAW_SEQ);
    if (!idle || !inspect || !draw) throw new Error("idle, inspect or draw clip missing");
    clips = {
      idle: bakeClip(mdl, idle),
      inspect: bakeClip(mdl, inspect),
      draw: bakeClip(mdl, draw),
    };

    for (const part of mdl.parts) {
      const isKnife = part.name === "knife_16cz";
      for (const mesh of part.meshes) {
        const tex = mdl.textures[mdl.skin[mesh.skinref]];
        const built = expandMesh(mdl.bytes, mesh, part, tex);
        const geo = new THREE.BufferGeometry();
        const position = new Float32Array(built.corners.length * 3);
        const normal = new Float32Array(built.corners.length * 3);
        const uv = new Float32Array(built.corners.length * 2);
        built.corners.forEach((c, i) => {
          uv[i * 2] = c.u;
          uv[i * 2 + 1] = c.v;
        });
        geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        const mat = new THREE.MeshLambertMaterial({ map: tex.tex });
        const obj = new THREE.Mesh(geo, mat);
        obj.userData.corners = built.corners;
        obj.userData.part = part;
        obj.frustumCulled = false;
        if (isKnife) {
          obj.visible = false;
          knifeMesh = obj;
        }
        root.add(obj);
        meshes.push(obj);
      }
    }

    loadGripOverrides();
    loadShine();
    loadHeight();
    const eyePanel = document.getElementById("k-eye");
    if (eyePanel) eyePanel.hidden = !GRIP_DEV;
    const loader = new GLTFLoader();
    const loaded = await Promise.all(SNACKS.map((url) => new Promise((resolve) => {
      loader.load(url, (gltf) => resolve({ url, scene: gltf.scene }), undefined, () => resolve(null));
    })));
    loaded.forEach((product) => {
      if (!product) return;
      const holder = mountProduct(product.scene, snackName(product.url));
      if (holder.userData.gripName === "asahi") shineCan(holder);
      holder.visible = snacks.length === 0;
      attach.add(holder);
      snacks.push(holder);
    });
    attach.matrixAutoUpdate = false;
    syncMetalPanel();

    applyPose(0);
    resize();
    view.classList.add("is-live");
    const on = `${location.pathname}${location.hash}`.includes("/konbini/tracker");
    setActive(on);
    if (!on) renderer.render(scene, camera);
  }

  document.getElementById("k-eye-range")?.addEventListener("input", (e) => {
    setEyeLift(e.target.value);
  });
  document.getElementById("k-metal-range")?.addEventListener("input", (e) => {
    setShine(Number(e.target.value));
  });
  gripPanel?.addEventListener("input", (e) => {
    if (!e.target.matches("[data-grip]")) return;
    readGripPanel();
  });
  document.getElementById("k-grip-reset")?.addEventListener("click", () => {
    const name = snacks[snackIndex]?.userData.gripName;
    if (!name) return;
    delete gripOverrides[name];
    saveGripOverrides();
    applyGrip(snacks[snackIndex]);
    syncGripPanel();
  });

  window.csInspect = { setActive, cycleSnack, playInspect };
  const snackBtn = document.getElementById("k-snack");
  const lookBtn = document.getElementById("k-look");
  snackBtn?.addEventListener("click", () => {
    if (!playing) return;
    cycleSnack();
  });
  lookBtn?.addEventListener("click", () => {
    if (!playing) return;
    playInspect();
  });
  addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key !== "q" && key !== "f" && !(key === "g" && GRIP_DEV)) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = e.target;
    const typing = target && (
      target.isContentEditable
      || target.tagName === "TEXTAREA"
      || (target.tagName === "INPUT" && target.type !== "range")
    );
    if (typing) return;
    if (!playing) return;
    e.preventDefault();
    if (key === "q") cycleSnack();
    else if (key === "f") playInspect();
    else if (GRIP_DEV) toggleGrip();
  });
  addEventListener("resize", () => {
    if (!clips) return;
    resize();
    if (playing) renderer.render(scene, camera);
  });
  let inspectBooted = false;
  function maybeBootInspect() {
    if (inspectBooted) return;
    if (!location.pathname.includes("/konbini/tracker")) return;
    inspectBooted = true;
    start().catch((err) => console.error("cs inspect", err));
  }
  window.addEventListener("cookz-nav", maybeBootInspect);
  maybeBootInspect();
}

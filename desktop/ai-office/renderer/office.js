// Isometric 3D office. Agents are low-poly people who sit at their desks,
// walk to the meeting room when they need an approval, and rest in the lounge
// when they have nothing to do. Name tags and bubbles are HTML on top.
import * as THREE from "./vendor/three/three.module.js";

const { STATES, deriveAgents, ago, label } = window.OfficeState;
const POLL_MS = 10000;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const host = document.getElementById("stage");
const tagLayer = document.getElementById("tags");
const tooltip = document.getElementById("tooltip");

// ---------- renderer, camera, lights ----------
// Without WebGL the side panel still works; only the floor is replaced by a note.
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch {
  renderer = { domElement: document.createElement("canvas"), setSize() {}, setPixelRatio() {}, render() {}, shadowMap: {} };
  host.append(Object.assign(document.createElement("p"), { className: "no-3d", textContent: "呢部機開唔到 3D 畫面，右邊嘅狀態照常更新。" }));
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#101318");
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(26, 24, 26);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight("#ffffff", "#b9a58c", 1.6));
const sun = new THREE.DirectionalLight("#fff4e0", 2.2);
sun.position.set(12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.radius = 4;
scene.add(sun);

// ---------- materials ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02, ...extra });
const M = {
  wall: mat("#f4f2ee"), wallEdge: mat("#d9d4cc"), deskTop: mat("#fbfaf7", { roughness: 0.5 }), wood: mat("#c79a62", { roughness: 0.6 }),
  dark: mat("#2b2d33", { roughness: 0.5 }), chair: mat("#3a3d45", { roughness: 0.6 }), metal: mat("#9aa0a8", { metalness: 0.6, roughness: 0.35 }),
  carpet: mat("#6f747c", { roughness: 0.95 }), leaf: mat("#4f8f4a"), leafLight: mat("#6aab5c"), pot: mat("#f1efe9"),
  glass: new THREE.MeshPhysicalMaterial({ color: "#cfe8f3", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false }),
  sofa: mat("#4f6d8f"), sky: new THREE.MeshBasicMaterial({ color: "#bfe3f6" }), frame: mat("#e9e6e0"), paper: mat("#ffffff"), art: [mat("#3b6ea5"), mat("#e2a54b"), mat("#7a9d6b")],
};

function box(w, h, d, material, x = 0, y = 0, z = 0, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(rTop, rBottom, h, material, x = 0, y = 0, z = 0, parent = scene, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ---------- room ----------
const ROOM = { minX: -11, maxX: 11, minZ: -8, maxZ: 8 };
function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const shades = ["#d4ab7a", "#c99f6d", "#dbb586", "#c3976a", "#cfa575"];
  ctx.fillStyle = "#9c7550"; ctx.fillRect(0, 0, 512, 512);
  const s = 16, n = 4;
  for (let k = -40; k < 40; k++) for (let m = -12; m < 12; m++) {
    const y = (k + n * m) * s;
    ctx.fillStyle = shades[(k * 7 + m * 3 + 400) % shades.length]; ctx.fillRect(k * s + 0.5, y + 0.5, n * s - 1, s - 1);
    ctx.fillStyle = shades[(k * 3 + m * 5 + 401) % shades.length]; ctx.fillRect(k * s + 0.5, y + s + 0.5, s - 1, n * s - 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.rotation = Math.PI / 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
box(22.4, 0.4, 16.4, M.wallEdge, 0, -0.21, 0);

// Back walls with windows and art.
box(22, 4, 0.3, M.wall, 0, 2, ROOM.minZ - 0.15);
box(0.3, 4, 16.3, M.wall, ROOM.minX - 0.15, 2, -0.15);
box(22, 0.12, 0.34, M.wallEdge, 0, 0.06, ROOM.minZ - 0.12);
box(0.34, 0.12, 16.3, M.wallEdge, ROOM.minX - 0.12, 0.06, -0.15);
for (const x of [-7, -2.6]) { box(3.2, 2, 0.06, M.frame, x, 2.4, ROOM.minZ + 0.02); box(3, 1.8, 0.04, M.sky, x, 2.4, ROOM.minZ + 0.06); box(0.06, 1.8, 0.06, M.frame, x, 2.4, ROOM.minZ + 0.08); }
for (const [i, z] of [-5, -1.5, 2].entries()) { box(0.05, 1.3, 1, M.frame, ROOM.minX + 0.03, 2.4, z); box(0.04, 1.1, 0.8, M.art[i], ROOM.minX + 0.07, 2.4, z); }

// Wall sign with the company name.
function textPanel(textValue, w, h, color, background) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = Math.round(1024 * h / w);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color; ctx.font = `700 ${canvas.height * 0.42}px -apple-system, "PingFang HK", "Helvetica Neue", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(textValue, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
}
const sign = textPanel("UNDERSTORY & CO.", 5, 0.7, "#432560", "rgba(255,255,255,0)");
sign.position.set(2, 3.1, ROOM.minZ + 0.02); scene.add(sign);

// Carpet zones under the desk clusters.
for (const x of [-5, -1.4, 2.2]) { const rug = box(3, 0.02, 6.4, M.carpet, x, 0.01, -3); rug.castShadow = false; }

// ---------- furniture ----------
function plant(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
  cylinder(0.32, 0.25, 0.6, M.pot, 0, 0.3, 0, group);
  cylinder(0.04, 0.05, 0.9, mat("#6b4f2a"), 0, 0.9, 0, group, 8);
  [[0, 1.55, 0, 0.45, M.leaf], [0.25, 1.3, 0.15, 0.32, M.leafLight], [-0.22, 1.35, -0.1, 0.34, M.leaf], [0.05, 1.85, 0.05, 0.3, M.leafLight]].forEach(([px, py, pz, r, material]) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material); leaf.position.set(px, py, pz); leaf.castShadow = true; group.add(leaf);
  });
}
function chair(x, z, rotation) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; scene.add(group);
  box(0.6, 0.1, 0.6, M.chair, 0, 0.5, 0, group);
  box(0.6, 0.7, 0.1, M.chair, 0, 0.9, -0.3, group);
  cylinder(0.04, 0.04, 0.45, M.metal, 0, 0.25, 0, group, 8);
  for (let i = 0; i < 5; i++) { const leg = box(0.32, 0.04, 0.06, M.dark, Math.cos(i * 1.256) * 0.16, 0.04, Math.sin(i * 1.256) * 0.16, group); leg.rotation.y = -i * 1.256; }
  return group;
}
// A workstation faces -x: the agent sits on the +x side looking at the screen.
const SCREEN = { off: "#1d2027", working: "#58c98a", waiting: "#f2c14e", queued: "#7fa7ff", failed: "#ff6b6b", idle: "#2b3a52", paused: "#1d2027" };
function workstation(x, z, flipped = false) {
  const group = new THREE.Group(); group.position.set(x, 0, z); if (flipped) group.rotation.y = Math.PI; scene.add(group);
  box(1.0, 0.06, 1.7, M.deskTop, 0, 0.78, 0, group);
  box(0.9, 0.74, 0.05, M.wood, 0, 0.38, -0.8, group); box(0.9, 0.74, 0.05, M.wood, 0, 0.38, 0.8, group);
  box(0.05, 0.42, 1.6, M.wood, -0.47, 0.55, 0, group);
  cylinder(0.03, 0.03, 0.25, M.dark, -0.32, 0.93, 0, group, 8);
  box(0.16, 0.02, 0.22, M.dark, -0.32, 0.82, 0, group);
  box(0.04, 0.46, 0.8, M.dark, -0.32, 1.22, 0, group);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.4), new THREE.MeshBasicMaterial({ color: flipped ? "#2a2f3a" : SCREEN.off }));
  screen.position.set(-0.295, 1.22, 0); screen.rotation.y = Math.PI / 2; group.add(screen);
  box(0.18, 0.02, 0.5, M.paper, 0.1, 0.82, 0, group);
  box(0.12, 0.14, 0.12, mat("#e8e2d8"), 0.15, 0.88, 0.6, group);
  const side = flipped ? -1 : 1;
  chair(x + 0.85 * side, z, -Math.PI / 2 * side);
  return { screen, seatPosition: new THREE.Vector3(x + 0.85, 0, z) };
}

const desks = [[-4.5, -4.8], [-4.5, -1.2], [-0.9, -4.8], [-0.9, -1.2], [2.7, -4.8], [2.7, -1.2]].map(([x, z]) => workstation(x, z));
// Back-to-back partner desks on the other side of each cluster, for atmosphere.
for (const [x, z] of [[-5.5, -4.8], [-5.5, -1.2], [-1.9, -4.8], [-1.9, -1.2], [1.7, -4.8], [1.7, -1.2]]) workstation(x, z, true);

// Meeting room with glass walls, a table and chairs.
const MEET = { minX: 5, maxX: 10.8, minZ: -7.8, maxZ: -2.2 };
box(MEET.maxX - MEET.minX - 1.8, 2.6, 0.06, M.glass, (MEET.minX + 1.8 + MEET.maxX) / 2, 1.3, MEET.maxZ);
box(0.06, 2.6, MEET.maxZ - MEET.minZ, M.glass, MEET.minX, 1.3, (MEET.minZ + MEET.maxZ) / 2);
box(MEET.maxX - MEET.minX - 1.8, 0.08, 0.1, M.metal, (MEET.minX + 1.8 + MEET.maxX) / 2, 2.6, MEET.maxZ);
box(0.1, 0.08, MEET.maxZ - MEET.minZ, M.metal, MEET.minX, 2.6, (MEET.minZ + MEET.maxZ) / 2);
box(3.6, 0.08, 1.6, M.deskTop, 8, 0.78, -5); cylinder(0.08, 0.12, 0.74, M.dark, 7, 0.38, -5); cylinder(0.08, 0.12, 0.74, M.dark, 9, 0.38, -5);
for (const x of [6.9, 8, 9.1]) { chair(x, -6.2, 0); chair(x, -3.8, Math.PI); }
const meetingSign = textPanel("會議室", 2.2, 0.5, "#2a2f3a", "rgba(255,255,255,0.85)");
meetingSign.position.set(7.9, 3.1, ROOM.minZ + 0.02); scene.add(meetingSign);

// Lounge: sofa, coffee table, water cooler, bookshelf, reception counter.
function sofa(x, z, rotation) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; scene.add(group);
  box(3, 0.45, 1, M.sofa, 0, 0.3, 0, group); box(3, 0.7, 0.25, M.sofa, 0, 0.75, -0.4, group);
  box(0.25, 0.6, 1, M.sofa, -1.5, 0.45, 0, group); box(0.25, 0.6, 1, M.sofa, 1.5, 0.45, 0, group);
}
const loungeRug = box(5, 0.02, 3.6, mat("#e7ddd0", { roughness: 0.95 }), -7.6, 0.01, 5); loungeRug.castShadow = false;
sofa(-7.6, 3.9, 0);
box(1.8, 0.08, 0.9, M.deskTop, -7.6, 0.45, 5.6); cylinder(0.05, 0.05, 0.42, M.metal, -7.6, 0.22, 5.6);
cylinder(0.25, 0.25, 0.9, M.paper, -10.4, 0.45, 0.6); cylinder(0.22, 0.22, 0.55, mat("#9fd3f0", { transparent: true, opacity: 0.8 }), -10.4, 1.2, 0.6);
box(0.5, 2.2, 3.2, M.wood, -10.65, 1.1, -5.6);
for (let shelf = 0; shelf < 4; shelf++) for (let book = 0; book < 8; book++) box(0.12, 0.38, 0.3, M.art[(shelf + book) % 3], -10.35, 0.45 + shelf * 0.52, -6.8 + book * 0.34);
box(3.2, 0.08, 1.2, M.wood, 4, 0.9, 6.2); box(3.2, 0.86, 0.08, M.wood, 4, 0.45, 5.65);
box(0.5, 0.3, 0.4, M.dark, 3.3, 1.1, 6.3); box(0.3, 0.2, 0.3, M.paper, 4.6, 1.04, 6.3);
plant(-10.2, -2.6); plant(4.3, -7.3); plant(10.3, -1.4, 0.9); plant(-10.2, 7.3); plant(10.3, 7.3); plant(-4.6, 7.3, 0.8); plant(0.2, 2.6, 0.7); plant(10.3, 3.2, 0.8);

// ---------- people ----------
const looks = {
  operations: { shirt: "#3d4f7a", pants: "#2a2d36", hair: "#2b1e1a", skin: "#f1c9a5", prop: "headset" },
  content: { shirt: "#d2648a", pants: "#3a3340", hair: "#6b3a22", skin: "#e8b48e", prop: "longHair" },
  research: { shirt: "#f2f2f2", pants: "#3f5b73", hair: "#1f1b24", skin: "#f4d3b5", prop: "glasses" },
  creative: { shirt: "#e0913f", pants: "#2f3a4a", hair: "#3b2a4a", skin: "#c98e66", prop: "beret" },
  growth: { shirt: "#2f6f4f", pants: "#2a2d36", hair: "#8a5a2b", skin: "#f0c29c", prop: "tie" },
};
const spareLooks = [{ shirt: "#5c7bd6", pants: "#2a2d36", hair: "#3a2a1e", skin: "#e9be98", prop: "" }, { shirt: "#8e5aa8", pants: "#2a2d36", hair: "#151018", skin: "#d6a07a", prop: "" }];

function limb(w, h, d, material, parent, x, y, z) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.y = -h / 2; pivot.add(mesh);
  return pivot;
}
function makePerson(look) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const shirt = mat(look.shirt), pants = mat(look.pants), skin = mat(look.skin, { roughness: 0.6 }), hair = mat(look.hair, { roughness: 0.9 });
  const legL = limb(0.2, 0.78, 0.22, pants, body, -0.12, 0.8, 0), legR = limb(0.2, 0.78, 0.22, pants, body, 0.12, 0.8, 0);
  for (const leg of [legL, legR]) box(0.21, 0.08, 0.32, M.dark, 0, -0.76, 0.05, leg);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 4, 12), shirt); torso.position.y = 1.14; torso.scale.set(1.15, 1, 0.75); body.add(torso);
  const armL = limb(0.14, 0.62, 0.16, shirt, body, -0.33, 1.42, 0), armR = limb(0.14, 0.62, 0.16, shirt, body, 0.33, 1.42, 0);
  for (const arm of [armL, armR]) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin); hand.position.y = -0.66; arm.add(hand); }
  const head = new THREE.Group(); head.position.y = 1.7; body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16), skin));
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hairCap.rotation.x = -0.35; hairCap.position.set(0, 0.02, -0.02); head.add(hairCap);
  for (const side of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M.dark); eye.position.set(side * 0.075, 0.02, 0.195); head.add(eye); }
  if (look.prop === "glasses") for (const side of [-1, 1]) { const lens = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), M.dark); lens.position.set(side * 0.075, 0.02, 0.21); head.add(lens); }
  if (look.prop === "headset") { const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20, Math.PI), M.dark); band.rotation.y = Math.PI / 2; head.add(band); box(0.06, 0.1, 0.1, M.dark, 0.23, -0.02, 0, head); }
  if (look.prop === "beret") { const beret = cylinder(0.24, 0.22, 0.08, mat("#c0394b"), 0.03, 0.18, -0.02, head); beret.rotation.z = -0.2; }
  if (look.prop === "longHair") box(0.42, 0.42, 0.12, hair, 0, -0.12, -0.15, head);
  if (look.prop === "tie") box(0.07, 0.4, 0.02, mat("#1d2f4d"), 0, 1.2, 0.2, body);
  root.traverse((node) => { if (node.isMesh) node.castShadow = true; });
  return { root, body, legL, legR, armL, armR, head };
}

// Places people go, and waypoints that keep them out of desks and glass.
const AISLE_Z = 1.2;
const lounge = [[-8.3, 4.05, 0, "sit"], [-6.9, 4.05, 0, "sit"], [-9.7, 0.6, -Math.PI / 2, "stand"], [3.4, 5.1, 0, "stand"], [4.6, 5.1, 0, "stand"], [-5, 5.6, -1.2, "stand"]];
const meeting = [[6.9, -6.2, 0], [8, -6.2, 0], [9.1, -6.2, 0], [6.9, -3.8, Math.PI], [8, -3.8, Math.PI], [9.1, -3.8, Math.PI]];
const MEETING_DOOR = new THREE.Vector3(5.9, 0, -1.6);

const people = new Map();
let desksState = [], snapshot = null, hoveredKey = null, selectedKey = null;

// Each agent keeps its own meeting chair and lounge spot, so one agent
// changing state never makes another one get up and move.
function targetFor(info, index) {
  if (info.state === "paused") return { position: new THREE.Vector3(-10.4, 0, 7.6), facing: 0, pose: "away" };
  if (info.state === "waiting") { const [x, z, facing] = meeting[index % meeting.length]; return { position: new THREE.Vector3(x, 0, z), facing, pose: "sit", room: "meeting" }; }
  if (info.state === "idle" || !desks[index]) { const [x, z, facing, pose] = lounge[index % lounge.length]; return { position: new THREE.Vector3(x, 0, z), facing, pose }; }
  return { position: desks[index].seatPosition.clone(), facing: -Math.PI / 2, pose: "sit", desk: index };
}

function routeTo(person, target) {
  const from = person.root.position.clone();
  const points = [];
  if (person.room === "meeting") points.push(new THREE.Vector3(from.x, 0, MEETING_DOOR.z - 0.6), MEETING_DOOR.clone());
  else if (person.target.desk !== undefined) points.push(new THREE.Vector3(from.x + 0.6, 0, from.z));
  const start = points.at(-1) ?? from;
  points.push(new THREE.Vector3(start.x, 0, AISLE_Z));
  if (target.room === "meeting") points.push(new THREE.Vector3(MEETING_DOOR.x, 0, AISLE_Z), MEETING_DOOR.clone(), new THREE.Vector3(target.position.x, 0, MEETING_DOOR.z - 0.6));
  else if (target.desk !== undefined) points.push(new THREE.Vector3(target.position.x + 0.6, 0, AISLE_Z), new THREE.Vector3(target.position.x + 0.6, 0, target.position.z));
  else points.push(new THREE.Vector3(target.position.x, 0, AISLE_Z));
  points.push(target.position.clone());
  person.path = points;
  person.target = target;
  person.room = target.room;
}

const BUBBLES = { working: "⌨ 做緊", waiting: "! 等你批", failed: "× 出錯", idle: "☕ 得閒", paused: "暫停" };
function syncPeople() {
  const seen = new Set();
  desksState.forEach((info, index) => {
    seen.add(info.key);
    const target = targetFor(info, index);
    let person = people.get(info.key);
    if (!person) {
      person = { ...makePerson(looks[info.visual_key] ?? looks[info.key] ?? spareLooks[index % spareLooks.length]), key: info.key, path: [], target, room: target.room };
      person.root.position.copy(target.position); person.root.rotation.y = target.facing;
      person.root.traverse((node) => { node.userData.key = info.key; });
      scene.add(person.root);
      person.tag = document.createElement("div"); person.tag.className = "tag"; tagLayer.append(person.tag);
      people.set(info.key, person);
    } else if (!person.target.position.equals(target.position)) routeTo(person, target);
    else person.target = target;
    Object.assign(person, { info, index });
    const bubble = document.createElement("span"); bubble.className = `bubble ${info.state}`;
    bubble.textContent = BUBBLES[info.state] ?? `⏳ 排隊 ${info.queued}`;
    const name = document.createElement("span"); name.className = "name"; name.textContent = info.name.replace(/ Agent$/, "");
    person.tag.replaceChildren(bubble, name);
  });
  for (const [key, person] of people) if (!seen.has(key)) { scene.remove(person.root); person.tag.remove(); people.delete(key); }
  desks.forEach((desk, index) => desk.screen.material.color.set(SCREEN[desksState[index]?.state] ?? SCREEN.off));
}

// ---------- animation ----------
const timer = new THREE.Timer();
function animate() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
  for (const person of people.values()) {
    const next = person.path[0];
    const { root, body, legL, legR, armL, armR, head } = person;
    if (next) {
      const delta = next.clone().sub(root.position); delta.y = 0;
      const step = reducedMotion ? Infinity : 3.2 * dt;
      if (delta.length() <= step) { root.position.copy(next); person.path.shift(); }
      else { root.position.addScaledVector(delta.normalize(), step); root.rotation.y = Math.atan2(delta.x, delta.z); }
      const swing = Math.sin(t * 10) * 0.6;
      body.position.y = Math.abs(Math.sin(t * 10)) * 0.04;
      legL.rotation.x = swing; legR.rotation.x = -swing; armL.rotation.x = -swing * 0.8; armR.rotation.x = swing * 0.8; head.rotation.set(0, 0, 0);
      root.visible = true;
      continue;
    }
    const target = person.target;
    root.rotation.y = target.facing;
    root.visible = target.pose !== "away";
    const state = person.info?.state;
    if (target.pose === "sit") {
      body.position.y = -0.3; legL.rotation.x = legR.rotation.x = -Math.PI / 2;
      if (state === "working" && !reducedMotion) { armL.rotation.x = -1.1 + Math.sin(t * 14) * 0.08; armR.rotation.x = -1.1 + Math.sin(t * 14 + 1.4) * 0.08; head.rotation.set(0.12, 0, 0); }
      else if (state === "idle") { armL.rotation.x = armR.rotation.x = -0.2; head.rotation.set(0.35, 0, 0.25); }
      else if (state === "failed") { armL.rotation.x = armR.rotation.x = -0.4; head.rotation.set(0.2, reducedMotion ? 0 : Math.sin(t * 2) * 0.4, 0); }
      else { armL.rotation.x = armR.rotation.x = -0.9; head.rotation.set(0, reducedMotion ? 0 : Math.sin(t * 0.8) * 0.25, 0); }
    } else {
      body.position.y = reducedMotion ? 0 : Math.sin(t * 2) * 0.01; legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = 0; armR.rotation.x = state === "idle" ? -1.4 : 0; head.rotation.set(0, reducedMotion ? 0 : Math.sin(t * 0.6) * 0.3, 0);
    }
  }
  renderer.render(scene, camera);
  placeTags();
  requestAnimationFrame(animate);
}

const projected = new THREE.Vector3();
function placeTags() {
  const { width, height } = host.getBoundingClientRect();
  for (const person of people.values()) {
    if (!person.root.visible) { person.tag.hidden = true; continue; }
    projected.set(0, 2.2 + person.body.position.y, 0).applyMatrix4(person.root.matrixWorld).project(camera);
    person.tag.hidden = false;
    person.tag.style.transform = `translate(${(projected.x + 1) / 2 * width}px, ${(1 - projected.y) / 2 * height}px) translate(-50%, -100%)`;
    person.tag.classList.toggle("active", hoveredKey === person.key || selectedKey === person.key);
  }
}

function resize() {
  const { width, height } = host.getBoundingClientRect();
  renderer.setSize(width, height);
  // Keep the whole floor in view at any window shape.
  const aspect = width / height;
  const halfH = Math.max(8.3, 14.2 / aspect);
  camera.left = -halfH * aspect; camera.right = halfH * aspect; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

// ---------- interaction ----------
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
function personAt(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...people.values()].filter((person) => person.root.visible).map((person) => person.root), true);
  return hits.length ? people.get(hits[0].object.userData.key) ?? null : null;
}
function openAgent(key) {
  const info = desksState.find((item) => item.key === key);
  if (!info) return;
  selectedKey = key; renderPanel();
  void window.office.open(info.current?.portal_deep_link ?? `/team-hub/ai-workspace/tasks?agent=${encodeURIComponent(info.key)}`);
}
function showTooltip(info, x, y) {
  tooltip.replaceChildren();
  const title = document.createElement("strong"); title.textContent = `${info.name} · ${STATES[info.state].label}`;
  const body = document.createElement("div");
  body.textContent = info.current ? `${info.current.title}${info.current.current_stage ? ` — ${label(info.current.current_stage)}` : ""}` : info.state === "paused" ? "暫停中" : "冇手頭嘢做";
  tooltip.append(title, body);
  const rect = host.getBoundingClientRect();
  tooltip.style.left = `${Math.min(x - rect.left + 16, rect.width - 280)}px`;
  tooltip.style.top = `${y - rect.top + 16}px`;
  tooltip.hidden = false;
}
renderer.domElement.addEventListener("mousemove", (event) => {
  const person = personAt(event);
  hoveredKey = person?.key ?? null;
  renderer.domElement.style.cursor = person ? "pointer" : "default";
  if (person?.info) showTooltip(person.info, event.clientX, event.clientY); else tooltip.hidden = true;
});
renderer.domElement.addEventListener("mouseleave", () => { hoveredKey = null; tooltip.hidden = true; });
renderer.domElement.addEventListener("click", (event) => { const person = personAt(event); if (person) openAgent(person.key); });

// ---------- side panel ----------
const el = (tag, className, content) => { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = content; return node; };
function renderPanel() {
  document.getElementById("agents").replaceChildren(...desksState.map((info) => {
    const item = el("li");
    const button = el("button", `agent${selectedKey === info.key ? " selected" : ""}`); button.type = "button";
    const top = el("span", "agent-top"); top.append(el("span", "", info.name));
    const state = el("span", "agent-state"); const swatch = el("i"); swatch.style.background = STATES[info.state].color; state.append(swatch, STATES[info.state].label); top.append(state);
    const taskLine = el("span", "agent-task", info.current ? info.current.title : info.state === "paused" ? "暫停中，唔會接新 task" : "冇手頭嘢做");
    const meta = el("span", "agent-meta", [info.current?.current_stage ? label(info.current.current_stage) : null, `排隊 ${info.queued}`, `今日完成 ${info.doneToday}`].filter(Boolean).join(" · "));
    button.append(top, taskLine, meta);
    button.addEventListener("click", () => openAgent(info.key));
    button.addEventListener("mouseenter", () => { hoveredKey = info.key; });
    button.addEventListener("mouseleave", () => { hoveredKey = null; });
    item.append(button);
    return item;
  }));
  const working = desksState.filter((info) => info.state === "working").length;
  document.getElementById("summary").textContent = snapshot ? `${working} / ${desksState.length} 個 AI 員工做緊嘢` : "";
  const pending = snapshot?.pending_approvals?.length ?? 0;
  const approvals = document.getElementById("approvals");
  approvals.hidden = !pending; approvals.textContent = `有 ${pending} 樣嘢等你批，撳入去睇`;
  const tasks = new Map((snapshot?.tasks ?? []).map((task) => [task.id, task]));
  const names = new Map(desksState.map((info) => [info.key, info.name]));
  const events = (snapshot?.events ?? []).slice(0, 15);
  document.getElementById("feed").replaceChildren(...(events.length ? events.map((event) => {
    const task = tasks.get(event.task_id);
    const item = el("li"); const button = el("button", "", event.summary);
    button.type = "button"; button.addEventListener("click", () => void window.office.open(task?.portal_deep_link ?? `/team-hub/ai-workspace/tasks/${event.task_id}`));
    item.append(button, el("small", "", [names.get(task?.assigned_agent) ?? "AI", task?.title, ago(event.created_at)].filter(Boolean).join(" · ")));
    return item;
  }) : [el("li", "", "未有 activity。")]));
}
document.getElementById("approvals").addEventListener("click", () => void window.office.open("/team-hub/ai-workspace/approvals"));

// ---------- data ----------
function setStatus(kind, message) {
  document.getElementById("status").className = `status ${kind}`;
  document.getElementById("status-text").textContent = message;
}
async function refresh() {
  const result = await window.office.snapshot();
  if (result.error === "not_configured") { setStatus("bad", "未連接"); void showSettings(); return; }
  if (result.error === "bad_token") { setStatus("bad", "Token 唔啱"); void showSettings("Token 唔啱，請再貼一次。"); return; }
  if (result.error) { setStatus("bad", `連唔到 portal（${result.error}）`); return; }
  snapshot = result.data;
  desksState = deriveAgents(snapshot);
  syncPeople();
  renderPanel();
  setStatus("ok", `每 10 秒更新 · ${new Date().toLocaleTimeString("en-GB")}`);
}

const settings = document.getElementById("settings");
async function showSettings(message = "") {
  const config = await window.office.getConfig();
  document.getElementById("portal-url").value = config.portalUrl;
  document.getElementById("token").placeholder = config.hasToken ? "已儲存（留空就唔改）" : "AI_OFFICE_TOKEN";
  const error = document.getElementById("settings-error");
  error.textContent = message; error.hidden = !message;
  settings.hidden = false;
}
document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("settings-error");
  try {
    await window.office.saveConfig({ portalUrl: document.getElementById("portal-url").value, token: document.getElementById("token").value });
    document.getElementById("token").value = "";
    settings.hidden = true;
    await refresh();
  } catch (caught) { error.textContent = String(caught?.message ?? caught).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); error.hidden = false; }
});
document.getElementById("settings-cancel").addEventListener("click", () => { settings.hidden = true; });
document.getElementById("settings-button").addEventListener("click", () => void showSettings());
window.office.onShowSettings(() => void showSettings());
window.office.onRefresh(() => void refresh());

new ResizeObserver(resize).observe(host);
window.addEventListener("focus", () => void refresh());
resize();
animate();
void refresh();
setInterval(() => void refresh(), POLL_MS);

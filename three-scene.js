/* 金鳄会 · 3D 牌桌与 3D 荷官舞台
 * 纯本地 Three.js（离线可用）：椭圆绒面桌、木质包边、8 张座椅、
 * 3D 公共牌 / 手牌 / 筹码、赌场暖光、GLB 写实荷官模型、可拖拽旋转视角。
 * 通过 window.Table3D 与 game.js 同步状态。
 */
'use strict';

import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const RANK_TXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_TXT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLOR = { s: '#20293c', h: '#c62b3d', d: '#c62b3d', c: '#20293c' };
const rankTxt = (r) => RANK_TXT[r] || String(r);

const RX = 4.35;          // 桌面椭圆半长轴（X）
const RZ = 2.45;          // 桌面椭圆半短轴（Z）
const TABLE_Y = 0.98;     // 桌面高度
const SEAT_ANG = [0, 38, 76, 122, 158, 202, 238, 284].map(d => d * Math.PI / 180);
const MODEL_URL = 'models/dealer.glb';
const MODEL_YAW = 0;         // GLB 正面朝 +Z，正好面对玩家视角
const DEALER_Z = -4.0;       // 站在牌桌正对面
const DEALER_H = 4.0;        // 模型高度（站在桌后，下半身自然被桌面遮住）
const VIEW_WIDE = { pos: [0, 5.1, 10.4], target: [0, 1.3, -.9] };
const VIEW_FACE = { pos: [0, 2.95, -.55], target: [0, 2.15, DEALER_Z] };

/* 8 位牌手的独立 3D 角色（虚构致敬形象，非真人肖像） */
const PLAYER_MODELS = [
  'models/players/hero.glb', 'models/players/yara.glb',
  'models/players/siaqiu.glb', 'models/players/britney.glb',
  'models/players/tanxuan.glb', 'models/players/dwan.glb',
  'models/players/fox.glb', 'models/players/math.glb',
];
const PLAYER_COLORS = [0x2b3444, 0x2a1d2e, 0xb88094, 0x9a8ac2, 0x223a5e, 0x454b52, 0x5a2a2a, 0x2f4a4a];
const PLAYER_H = 1.55;      // 坐姿角色高度（腰部以下被桌面自然遮住）
const PLAYER_Y = 0.52;      // 椅面高度

const cardTexCache = new Map();
const state = {
  on: false, ready: false, failed: false,
  board: [], players: [], pot: 0, activeSeat: -1, winner: -1,
  act: null, confetti: [], flying: [], lastSync: 0,
  focus: false, viewTween: null, viewTo: null, targetTo: null, log: [],
  playersReady: 0,
};

let renderer, scene, camera, controls, canvas, wrap;
let dealerRig, dealerModel, seatRings = [], boardCards = [], boardSlots = [], holeCards = [], chipStacks = [], potStack;
let playerRigs = [], playerModels = [], playerInfo = [];
let clock = 0;

/* ---------------- 工具：Canvas 纹理 ---------------- */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function texFrom(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function cardFaceTexture(c) {
  const key = 'f' + c.r + c.s;
  if (cardTexCache.has(key)) return cardTexCache.get(key);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 368;
  const g = cv.getContext('2d');
  g.fillStyle = '#fdfcf6'; roundRect(g, 5, 5, 246, 358, 20); g.fill();
  g.strokeStyle = '#d8d2c4'; g.lineWidth = 3; roundRect(g, 8, 8, 240, 352, 18); g.stroke();
  const col = SUIT_COLOR[c.s] || '#20293c';
  g.fillStyle = col;
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.font = 'bold 88px Georgia, serif'; g.fillText(rankTxt(c.r), 20, 16);
  g.font = '62px Georgia, serif'; g.fillText(SUIT_TXT[c.s] || '♠', 22, 104);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '168px Georgia, serif'; g.fillText(SUIT_TXT[c.s] || '♠', 128, 190);
  g.save(); g.translate(236, 352); g.rotate(Math.PI);
  g.textAlign = 'left'; g.textBaseline = 'top'; g.font = 'bold 78px Georgia, serif';
  g.fillText(rankTxt(c.r), 0, 0); g.restore();
  const t = texFrom(cv); cardTexCache.set(key, t); return t;
}
function cardBackTexture() {
  if (cardTexCache.has('back')) return cardTexCache.get('back');
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 368;
  const g = cv.getContext('2d');
  g.fillStyle = '#7d1730'; roundRect(g, 5, 5, 246, 358, 20); g.fill();
  g.strokeStyle = '#f0c45b'; g.lineWidth = 7; roundRect(g, 14, 14, 228, 340, 14); g.stroke();
  g.strokeStyle = 'rgba(240,196,91,.30)'; g.lineWidth = 2;
  for (let i = -360; i < 620; i += 22) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 360, 368); g.stroke();
    g.beginPath(); g.moveTo(i + 360, 0); g.lineTo(i, 368); g.stroke();
  }
  g.fillStyle = '#f0c45b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 76px Georgia, serif'; g.fillText('GC', 128, 184);
  const t = texFrom(cv); cardTexCache.set('back', t); return t;
}
function feltTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 640;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(512, 300, 40, 512, 320, 580);
  grad.addColorStop(0, '#217056'); grad.addColorStop(0.62, '#15543e'); grad.addColorStop(1, '#0a3025');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 30000; i++) {
    const a = Math.random() * 0.09;
    g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    g.fillRect(Math.random() * 1024, Math.random() * 640, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(245,196,81,.30)'; g.lineWidth = 6;
  g.beginPath(); g.ellipse(512, 320, 430, 258, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(245,196,81,.16)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(512, 320, 410, 240, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(245,196,81,.22)'; g.textAlign = 'center';
  g.font = 'bold 54px Georgia, serif'; g.fillText('GOLDEN CROC CLUB', 512, 300);
  g.font = '26px Georgia, serif'; g.fillText('·  T E X A S   H O L D \' E M  ·', 512, 350);
  return texFrom(cv);
}
function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  const r = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,216,150,.55)'); r.addColorStop(.45, 'rgba(255,190,110,.18)'); r.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return texFrom(cv);
}

/* ---------------- 场景搭建 ---------------- */
function ellipseRail(rx, rz, tube, y, material, segments, radial) {
  // 手工生成椭圆截环：直接缩放 TorusGeometry 会把管壁一起拉扁，粗细不均
  const verts = [], norms = [], uvs = [], idx = [];
  segments = segments || 120; radial = radial || 12;
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    const cx = Math.sin(a) * rx, cz = Math.cos(a) * rz;
    let ox = Math.sin(a) / rx, oz = Math.cos(a) / rz;
    const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
    for (let j = 0; j <= radial; j++) {
      const b = j / radial * Math.PI * 2;
      const cb = Math.cos(b), sb = Math.sin(b);
      verts.push(cx + ox * cb * tube, sb * tube, cz + oz * cb * tube);
      norms.push(ox * cb, sb, oz * cb);
      uvs.push(i / segments, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const p = i * (radial + 1) + j, q = p + radial + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const mat = material.clone(); mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y; m.castShadow = true; m.receiveShadow = true;
  return m;
}
function buildRoom() {
  scene.background = new THREE.Color(0x080a10);
  scene.fog = new THREE.FogExp2(0x080a10, 0.026);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x1b1116, roughness: .92, metalness: .04 })
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
  scene.add(floor);

  const carpet = new THREE.Mesh(
    new THREE.CircleGeometry(8.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x3a1420, roughness: .98 })
  );
  carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.005; carpet.receiveShadow = true;
  scene.add(carpet);

  // 远处墙面与壁灯：给荷官一个暖色赌场背景
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x141019, roughness: .9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 9, .4), wallMat);
  wall.position.set(0, 4.4, -9.5); wall.receiveShadow = true; scene.add(wall);
  for (let i = -2; i <= 2; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(.17, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffcf85 })
    );
    lamp.position.set(i * 5.2, 4.1, -9.1); scene.add(lamp);
    const pl = new THREE.PointLight(0xffb877, 9, 13, 2);
    pl.position.set(i * 5.2, 4.1, -8.6); scene.add(pl);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(.55, 1.5, .12),
      new THREE.MeshStandardMaterial({ color: 0x6a4a22, metalness: .65, roughness: .4 })
    );
    frame.position.set(i * 5.2, 4.1, -9.22); scene.add(frame);
  }
}
function buildTable() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x402318, roughness: .42, metalness: .12 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a271c, roughness: .62, metalness: .06 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a63e, roughness: .28, metalness: .85 });

  const bodyGeo = new THREE.CylinderGeometry(1, 1, .26, 96);
  bodyGeo.scale(RX, 1, RZ);
  const body = new THREE.Mesh(bodyGeo, wood);
  body.position.y = TABLE_Y - .13; body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  const feltGeo = new THREE.CircleGeometry(1, 96);
  feltGeo.scale(RX * .965, RZ * .94, 1);
  feltGeo.rotateX(-Math.PI / 2);
  const felt = new THREE.Mesh(feltGeo, new THREE.MeshStandardMaterial({
    map: feltTexture(), roughness: .96, metalness: 0,
  }));
  felt.position.y = TABLE_Y + .006; felt.receiveShadow = true;
  group.add(felt);

  group.add(ellipseRail(RX, RZ, .135, TABLE_Y + .02, leather, 120, 14));
  const goldLine = ellipseRail(RX * 1.012, RZ * 1.012, .018, TABLE_Y + .055, gold, 120, 8);
  group.add(goldLine);

  const leg = new THREE.Mesh(new THREE.CylinderGeometry(.5, .78, TABLE_Y - .2, 32), wood);
  leg.position.y = (TABLE_Y - .2) / 2; leg.castShadow = true; group.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, .12, 40), wood);
  foot.position.y = .06; foot.castShadow = true; foot.receiveShadow = true; group.add(foot);

  scene.add(group);
}
function seatAnchor(i) {
  const t = SEAT_ANG[i];
  return { x: Math.sin(t) * RX, z: Math.cos(t) * RZ, t };
}
function buildSeats() {
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x4a1524, roughness: .72 });
  const chairWood = new THREE.MeshStandardMaterial({ color: 0x33200f, roughness: .5, metalness: .1 });
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xf5c451, transparent: true, opacity: 0, side: THREE.DoubleSide });

  for (let i = 0; i < 8; i++) {
    const a = seatAnchor(i);
    const nx = Math.sin(a.t), nz = Math.cos(a.t);
    const cx = nx * (RX + 1.05), cz = nz * (RZ + 1.05);

    const chair = new THREE.Group();
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(.52, .55, .16, 24), chairMat);
    cushion.position.y = .52; cushion.castShadow = true; chair.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.02, .9, .16), chairMat);
    back.position.set(0, 1.05, .46 * Math.sign(nz || 1)); back.castShadow = true; chair.add(back);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.09, .14, .48, 16), chairWood);
    stem.position.y = .26; chair.add(stem);
    chair.position.set(cx, 0, cz);
    chair.rotation.y = Math.atan2(-nx, -nz) + Math.PI;
    scene.add(chair);

    // 座位前的行动光环
    const ringGeo = new THREE.TorusGeometry(.42, .022, 8, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat());
    ring.position.set(a.x * .74, TABLE_Y + .03, a.z * .74);
    scene.add(ring); seatRings.push(ring);
  }
}
function makeCard(w, h) {
  const geo = new THREE.BoxGeometry(w, .016, h);
  const edge = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: .8 });
  const face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .62, map: cardBackTexture() });
  const back = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .62, map: cardBackTexture() });
  const m = new THREE.Mesh(geo, [edge, edge, face, back, edge, edge]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function buildCards() {
  // 公共牌 5 个空槽 + 5 张牌
  for (let i = 0; i < 5; i++) {
    const slot = new THREE.Mesh(
      new THREE.PlaneGeometry(.66, .94),
      new THREE.MeshBasicMaterial({ color: 0x0a3a2a, transparent: true, opacity: .32, side: THREE.DoubleSide })
    );
    slot.rotation.x = -Math.PI / 2;
    slot.position.set((i - 2) * .78, TABLE_Y + .014, -.52);
    scene.add(slot); boardSlots.push(slot);

    const card = makeCard(.64, .92);
    card.position.set((i - 2) * .78, TABLE_Y + .03, -.52);
    card.visible = false;
    scene.add(card); boardCards.push(card);
  }
  // 8 家手牌（每家 2 张）
  for (let i = 0; i < 8; i++) {
    const a = seatAnchor(i);
    const pair = [];
    for (let k = 0; k < 2; k++) {
      const c = makeCard(.38, .54);
      const off = (k - .5) * .30;
      // 沿切线方向摆放，靠近各自座位而不是挤在桌心
      const tx = Math.cos(a.t), tz = -Math.sin(a.t);
      c.position.set(a.x * .66 + tx * off, TABLE_Y + .026, a.z * .66 + tz * off);
      c.rotation.y = -a.t;
      c.visible = false;
      scene.add(c); pair.push(c);
    }
    holeCards.push(pair);
  }
}
function chipMesh(color, radius) {
  const geo = new THREE.CylinderGeometry(radius || .155, radius || .155, .034, 24);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .18 });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
const CHIP_COLORS = [0xc72f3e, 0x2450a8, 0x1f8a54, 0xd9a52e, 0x8d4bb1, 0xe8e2d2];
function buildChips() {
  for (let i = 0; i < 8; i++) {
    const a = seatAnchor(i);
    const stack = new THREE.Group();
    stack.position.set(a.x * .42, TABLE_Y + .02, a.z * .42);
    for (let k = 0; k < 6; k++) {
      const c = chipMesh(CHIP_COLORS[i % CHIP_COLORS.length]);
      c.position.y = k * .037; c.visible = false; stack.add(c);
    }
    scene.add(stack); chipStacks.push(stack);
  }
  potStack = new THREE.Group();
  potStack.position.set(0, TABLE_Y + .02, .62);
  for (let k = 0; k < 12; k++) {
    const c = chipMesh(CHIP_COLORS[k % CHIP_COLORS.length]);
    c.position.set(((k % 3) - 1) * .17, Math.floor(k / 3) * .037, ((k % 2) - .5) * .1);
    c.visible = false; potStack.add(c);
  }
  scene.add(potStack);
}
function buildLights() {
  scene.add(new THREE.AmbientLight(0x8d9ab8, 1.05));
  scene.add(new THREE.HemisphereLight(0xffd8a8, 0x1a1020, 1.1));

  const key = new THREE.SpotLight(0xffd9a4, 85, 32, Math.PI / 4.2, .55, 1.2);
  key.position.set(-3.5, 9.5, 5);
  key.target.position.set(0, TABLE_Y, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  scene.add(key); scene.add(key.target);

  const fill = new THREE.PointLight(0xffb678, 26, 18, 2);
  fill.position.set(4.6, 4.2, -2.2); scene.add(fill);

  const dealerLight = new THREE.SpotLight(0xffe6bf, 70, 15, Math.PI / 5, .7, 1.1);
  dealerLight.position.set(0, 6.2, -1.6);
  dealerLight.target.position.set(0, 1.8, DEALER_Z);
  scene.add(dealerLight); scene.add(dealerLight.target);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.rotation.x = -Math.PI / 2; halo.position.set(0, .012, DEALER_Z);
  scene.add(halo);
}

/* ---------------- 荷官：GLB 模型 + 程序化备用 ---------------- */
function fallbackDealer() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c3a6, roughness: .68 });
  const dress = new THREE.MeshStandardMaterial({ color: 0x8c1234, roughness: .32, metalness: .12 });
  const satin = new THREE.MeshStandardMaterial({ color: 0xb21f45, roughness: .28, metalness: .14 });
  const silk = new THREE.MeshStandardMaterial({ color: 0x14131a, roughness: .25, metalness: .18 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1720, roughness: .55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c75c, roughness: .2, metalness: .9, emissive: 0x5a3c00, emissiveIntensity: .3 });

  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.115, .085, 1.12, 20), silk);
    leg.position.set(sx * .15, .62, 0); leg.castShadow = true; g.add(leg);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(.19, .1, .34), silk);
    heel.position.set(sx * .15, .05, .06); g.add(heel);
  }
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(.32, .54, 1.02, 28), dress);
  skirt.position.y = 1.62; skirt.castShadow = true; g.add(skirt);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.30, .33, .62, 24), satin);
  torso.position.y = 2.32; torso.castShadow = true; g.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.105, .12, .22, 16), skin);
  neck.position.y = 2.72; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.245, 24, 20), skin);
  head.scale.set(.9, 1.12, .9); head.position.y = 2.98; head.castShadow = true; g.add(head);
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(.29, 24, 20), hair);
  hairBack.scale.set(1.0, 1.22, .95); hairBack.position.set(0, 3.0, -.07); g.add(hairBack);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(.25, 20, 16), hair);
  fringe.scale.set(1.02, .48, .96); fringe.position.set(0, 3.14, .02); g.add(fringe);
  for (const sx of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.CylinderGeometry(.115, .075, .85, 14), hair);
    lock.position.set(sx * .25, 2.72, -.05); g.add(lock);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.026, 10, 8), new THREE.MeshBasicMaterial({ color: 0x241a22 }));
    eye.position.set(sx * .085, 3.0, .215); g.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), gold);
    ear.position.set(sx * .225, 2.9, 0); g.add(ear);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.075, .065, .82, 14), skin);
    arm.position.set(sx * .38, 2.28, .05); arm.rotation.z = sx * .22; arm.castShadow = true; g.add(arm);
  }
  const lips = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc02042, roughness: .35 }));
  lips.scale.set(1.5, .5, .35); lips.position.set(0, 2.89, .218); g.add(lips);
  // 手中扇形扑克
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(.22, .32), new THREE.MeshStandardMaterial({
      color: 0xf7f4ea, side: THREE.DoubleSide, roughness: .7,
    }));
    c.position.set(-.18 + i * .09, 2.02 + Math.abs(i - 2) * .012, .28);
    c.rotation.z = (i - 2) * .22; c.rotation.x = -.35;
    g.add(c);
  }
  return g;
}
function fitModel(model, height) {
  const b1 = new THREE.Box3().setFromObject(model);
  const s1 = new THREE.Vector3(); b1.getSize(s1);
  const s = height / Math.max(.001, s1.y);
  model.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(model);
  const c = new THREE.Vector3(); b2.getCenter(c);
  model.position.set(-c.x, -b2.min.y, -c.z);
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace; });
    }
  });
  return model;
}
function buildDealer() {
  dealerRig = new THREE.Group();
  dealerRig.position.set(0, 0, DEALER_Z);
  dealerRig.rotation.y = MODEL_YAW;
  dealerRig.userData.dealer = true;
  scene.add(dealerRig);

  state.log = [];
  const place = (obj, isFallback) => {
    // GLB 晚于备用模型到达时，替换而不是叠加
    while (dealerRig.children.length) dealerRig.remove(dealerRig.children[0]);
    fitModel(obj, DEALER_H);
    dealerModel = obj;
    dealerRig.add(obj);
    state.ready = true;
    state.failed = !!isFallback;
    state.log.push(isFallback ? 'fallback' : 'glb-loaded');
    notifyReady();
  };
  const loader = new GLTFLoader();
  loader.load(MODEL_URL,
    (gltf) => { place(gltf.scene || gltf.scenes[0], false); },
    (ev) => { if (ev && ev.total) state.log.push('progress ' + Math.round(ev.loaded / ev.total * 100) + '%'); },
    (err) => { state.log.push('glb-error ' + (err && err.message ? err.message : 'unknown')); place(fallbackDealer(), true); }
  );
  // 模型较大时先放程序化备用，避免长时间空白；真模型到达后自动替换
  setTimeout(() => {
    if (!dealerModel) { state.log.push('timeout-fallback'); place(fallbackDealer(), true); }
  }, 5000);
}

/* ---------------- 8 位牌手：独立 3D 角色 + 程序化备用胸像 ---------------- */
/* 程序化 3D 坐姿牌手：8 套不同发型 / 服装 / 配饰，云端 GLB 未到位时也能完整成桌 */
function fallbackBust(i) {
  const g = new THREE.Group();
  const SKIN = [0xecc4a8, 0xf1cbb2, 0xf4d3bf, 0xf7d6c4, 0xe9bd9c, 0xf0c8ad, 0xe4b698, 0xecc4a8];
  const HAIR = [0x201820, 0x191320, 0x6b3b2a, 0xd9b45c, 0x1a1a22, 0x3a2a20, 0xb9b6b0, 0x241a20];
  const OUT = PLAYER_COLORS;
  const skinCol = SKIN[i] || 0xecc4a8;
  const mk = (col, rough, metal) => new THREE.MeshStandardMaterial({
    color: col, roughness: rough === undefined ? .65 : rough, metalness: metal || 0,
  });
  const skin = mk(skinCol, .72);
  const suit = mk(OUT[i], i === 3 ? .34 : .62, i === 3 ? .22 : .06);
  const hair = mk(HAIR[i], .58);
  const dark = mk(0x1d1b24, .5);
  const white = mk(0xf7f4ec, .6);
  const gold = mk(0xe8be5a, .25, .8);
  const add = (geo, mat, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (sx) m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };

  // 躯干 / 肩 / 手臂
  add(new THREE.CylinderGeometry(.26, .36, .62, 24), suit, 0, .31, 0);
  const sh = add(new THREE.SphereGeometry(.33, 22, 16), suit, 0, .57, 0);
  sh.scale.set(1.28, .46, .80);
  for (const s of [-1, 1]) {
    const arm = add(new THREE.CylinderGeometry(.085, .072, .5, 14), suit, s * .33, .33, .05);
    arm.rotation.z = s * .20;
    add(new THREE.SphereGeometry(.073, 12, 10), skin, s * .38, .11, .13);
  }
  // 领口细节
  if (i === 4 || i === 6 || i === 7) {
    add(new THREE.BoxGeometry(.13, .34, .03), white, 0, .45, .265);
    add(new THREE.BoxGeometry(.055, .28, .035), i === 6 ? mk(0x8e1f32, .4) : dark, 0, .42, .285);
  }
  if (i === 3) for (let k = 0; k < 12; k++) {
    add(new THREE.SphereGeometry(.016, 8, 6), gold,
      (Math.random() - .5) * .5, .25 + Math.random() * .4, .29);
  }
  if (i === 0 || i === 5) {
    const hood = add(new THREE.SphereGeometry(.29, 18, 14), suit, 0, .62, -.10);
    hood.scale.set(1.22, .78, .9);
  }
  // 脖 / 头 / 五官
  add(new THREE.CylinderGeometry(.085, .10, .16, 14), skin, 0, .69, 0);
  const head = add(new THREE.SphereGeometry(.185, 26, 20), skin, 0, .88, 0);
  head.scale.set(.88, 1.10, .90);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(.031, 12, 10), white, s * .068, .895, .158);
    add(new THREE.SphereGeometry(.016, 10, 8), dark, s * .068, .895, .184);
    const brow = add(new THREE.BoxGeometry(.075, .012, .014), hair, s * .068, .945, .164);
    brow.rotation.z = s * .10;
  }
  add(new THREE.ConeGeometry(.026, .07, 10), skin, 0, .855, .178).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(.036, 12, 8), mk(i === 1 || i === 3 ? 0xc32448 : 0xa85a5c, .4),
    0, .805, .168, 1.35, .34, .28);

  // 发型 / 配饰：每位一套
  if (i === 0) { // 英雄：短发 + 墨镜
    const cap = add(new THREE.SphereGeometry(.192, 22, 16), hair, 0, .965, -.01); cap.scale.set(1.02, .62, 1.0);
    add(new THREE.BoxGeometry(.29, .062, .035), dark, 0, .895, .183);
    add(new THREE.BoxGeometry(.03, .05, .16), dark, -.145, .895, .11);
    add(new THREE.BoxGeometry(.03, .05, .16), dark, .145, .895, .11);
  } else if (i === 1) { // Yara：长直发 + 金耳环
    const cap = add(new THREE.SphereGeometry(.196, 22, 16), hair, 0, .97, -.015); cap.scale.set(1.04, .66, 1.02);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(.085, .062, .52, 12), hair, s * .175, .58, -.03);
      add(new THREE.SphereGeometry(.026, 10, 8), gold, s * .17, .78, .01);
    }
  } else if (i === 2) { // Siaqiu：波浪短发 + 刘海
    const cap = add(new THREE.SphereGeometry(.205, 22, 16), hair, 0, .97, -.01); cap.scale.set(1.08, .70, 1.02);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(.085, 12, 10), hair, s * .17, .82, .01);
    add(new THREE.BoxGeometry(.30, .055, .10), hair, 0, .99, .13);
  } else if (i === 3) { // 布兰妮：高马尾 + 亮片
    const cap = add(new THREE.SphereGeometry(.192, 22, 16), hair, 0, .97, -.01); cap.scale.set(1.02, .62, 1.0);
    const tail = add(new THREE.CylinderGeometry(.055, .035, .34, 12), hair, 0, 1.13, -.16);
    tail.rotation.x = -.5;
    add(new THREE.TorusGeometry(.045, .012, 8, 16), gold, 0, 1.05, -.07);
  } else if (i === 4) { // Tanxuan：短发 + 无框眼镜
    const cap = add(new THREE.SphereGeometry(.19, 22, 16), hair, 0, .965, -.01); cap.scale.set(1.01, .58, 1.0);
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(.055, .006, 6, 20), dark, s * .068, .895, .192);
    add(new THREE.BoxGeometry(.025, .006, .006), dark, 0, .895, .192);
  } else if (i === 5) { // Dwan：棒球帽 + 胡茬
    const cap = add(new THREE.SphereGeometry(.196, 22, 14), dark, 0, .99, -.005); cap.scale.set(1.05, .58, 1.02);
    add(new THREE.BoxGeometry(.30, .018, .18), dark, 0, .965, .19);
    const jaw = add(new THREE.SphereGeometry(.13, 16, 12), mk(0x5a4a42, .8), 0, .79, .07);
    jaw.scale.set(1, .55, .85);
  } else if (i === 6) { // 老狐狸：银背头 + 细框眼镜
    const cap = add(new THREE.SphereGeometry(.192, 22, 16), hair, 0, .97, -.02); cap.scale.set(1.04, .60, 1.0);
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(.055, .007, 6, 20), gold, s * .068, .895, .192);
    add(new THREE.BoxGeometry(.025, .007, .007), gold, 0, .895, .192);
  } else { // 算牌师：黑框眼镜 + 耳机
    const cap = add(new THREE.SphereGeometry(.19, 22, 16), hair, 0, .965, -.01); cap.scale.set(1.01, .58, 1.0);
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(.058, .010, 6, 20), dark, s * .068, .895, .192);
    add(new THREE.BoxGeometry(.03, .01, .008), dark, 0, .895, .192);
    add(new THREE.TorusGeometry(.20, .017, 8, 24, Math.PI), dark, 0, .96, 0).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(.045, .09, .05), dark, s * .185, .86, 0);
  }
  return g;
}
/* 写实脸部贴图：贴到程序化 3D 头部正面，云端 GLB 到位后自动不用 */
const FACE_TEX = [];
function attachFace(i) {
  const g = playerModels[i], tex = FACE_TEX[i];
  if (!g || !tex || g.userData.faceAttached || !playerInfo[i] || !playerInfo[i].fallback) return;
  g.userData.faceAttached = true;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(.34, .39),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    })
  );
  plane.position.set(0, .885, .225);
  plane.renderOrder = 3;
  g.add(plane);
}
function loadFaceTextures() {
  const loader = new THREE.TextureLoader();
  for (let i = 0; i < 8; i++) {
    loader.load('models/players/face' + i + '.png', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      FACE_TEX[i] = t;
      attachFace(i);
    }, undefined, () => {});
  }
}
function placePlayer(i, obj, isFallback) {
  const rig = playerRigs[i];
  if (!rig) return;
  while (rig.children.length) rig.remove(rig.children[0]);
  fitModel(obj, PLAYER_H);
  obj.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace; });
    }
  });
  rig.add(obj);
  playerModels[i] = obj;
  playerInfo[i].ready = true;
  playerInfo[i].fallback = isFallback;
  state.playersReady = playerModels.filter(Boolean).length;
  if (isFallback) attachFace(i);
}
function buildPlayers() {
  const loader = new GLTFLoader();
  loadFaceTextures();
  playerRigs = []; playerModels = []; playerInfo = [];
  for (let i = 0; i < 8; i++) {
    const a = seatAnchor(i);
    const rig = new THREE.Group();
    rig.position.set(a.x * .93, PLAYER_Y, a.z * .93);
    rig.rotation.y = Math.atan2(-a.x, -a.z);   // 面朝桌心
    rig.userData.seat = i;
    scene.add(rig);
    playerRigs.push(rig);
    playerModels.push(null);
    playerInfo.push({ folded: false, active: false, winner: false, thinking: false, ready: false, pulse: 0 });
  }
  // 2 路懒加载，避免 8 个 GLB 同时抢带宽/显存
  let next = 0, inflight = 0;
  const pump = () => {
    while (inflight < 2 && next < 8) {
      const i = next++;
      inflight++;
      loader.load(PLAYER_MODELS[i],
        (gltf) => { placePlayer(i, gltf.scene || gltf.scenes[0], false); inflight--; pump(); },
        undefined,
        () => { state.log.push('player-fallback ' + i); placePlayer(i, fallbackBust(i), true); inflight--; pump(); }
      );
    }
  };
  pump();
  setTimeout(() => {
    for (let i = 0; i < 8; i++) if (!playerModels[i]) placePlayer(i, fallbackBust(i), true);
  }, 14000);
}

/* ---------------- 动作 / 特效 ---------------- */
const ACT = {
  greet:   { d: 1.3, rz: .10, ry: -.24, bob: .05 },
  deal:    { d: 1.4, rx: .18, pz: .30 },
  shuffle: { d: 1.6, rz: .15, ry: .12 },
  cheer:   { d: 1.5, bob: .26, ry: .20 },
  think:   { d: 1.8, rz: .12, rx: .07 },
  wow:     { d: 1.2, sc: .07, rx: -.10 },
  heart:   { d: 1.6, bob: .14, ry: .14 },
  cheers:  { d: 1.5, rz: -.15, ry: -.12 },
};
function playAction(key) {
  const cfg = ACT[key] || ACT.greet;
  state.act = { key, t0: performance.now(), cfg };
  if (key === 'cheer' || key === 'heart') celebrate(-1);
}
function celebrate(seat) {
  if (!scene) return;
  // 无指定座位时（打赏 / 荷官动作）在近端桌面上方喷彩带，不挡住对面荷官的脸
  const a = seat >= 0 ? seatAnchor(seat) : { x: 0, z: 1.2 };
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(.075, .14),
      new THREE.MeshBasicMaterial({
        color: [0xf5c451, 0xe84d6a, 0x6fe0a0, 0x7fa8ff, 0xffffff][i % 5],
        side: THREE.DoubleSide, transparent: true,
      })
    );
    m.position.set(a.x * .5 + (Math.random() - .5) * 1.4, 2.4 + Math.random() * .7, a.z * .5 + (Math.random() - .5) * 1.0);
    m.userData.v = new THREE.Vector3((Math.random() - .5) * 1.7, 1.2 + Math.random() * 2.1, (Math.random() - .5) * 1.7);
    m.userData.life = 3.4;
    scene.add(m); state.confetti.push(m);
  }
}

/* ---------------- 状态同步 ---------------- */
function sync(s) {
  // 牌桌状态与荷官模型加载互不依赖：模型慢/失败时桌面、牌、筹码仍需正常同步
  if (!s || !scene) return;
  state.lastSync = performance.now();
  const now = performance.now();

  // 公共牌
  const board = s.board || [];
  for (let i = 0; i < 5; i++) {
    const card = boardCards[i];
    const c = board[i];
    if (!c) { card.visible = false; boardSlots[i].visible = true; continue; }
    const wasVisible = card.visible;
    card.visible = true; boardSlots[i].visible = false;
    card.material[2].map = cardFaceTexture(c);
    card.material[2].needsUpdate = true;
    card.material[3].map = cardBackTexture();
    card.material[3].needsUpdate = true;
    if (!wasVisible) {
      card.userData.fly = {
        from: new THREE.Vector3(0, 2.0, -4.2),
        to: new THREE.Vector3((i - 2) * .78, TABLE_Y + .03, -.52),
        t0: now, dur: .58 + i * .06,
      };
      state.flying.push(card);
    }
  }

  // 手牌 / 筹码 / 高亮
  const ps = s.players || [];
  for (let i = 0; i < 8; i++) {
    const p = ps[i];
    const pair = holeCards[i];
    if (!p) { pair.forEach(c => c.visible = false); continue; }
    const show = !p.folded && (p.hole || []).length === 2;
    for (let k = 0; k < 2; k++) {
      const c = pair[k];
      c.visible = show;
      if (!show) continue;
      const hc = p.hole[k];
      const faceUp = !!(p.isHero || p.revealed);
      c.material[2].map = faceUp ? cardFaceTexture(hc) : cardBackTexture();
      c.material[2].needsUpdate = true;
      c.material[3].map = cardBackTexture();
      c.material[3].needsUpdate = true;
      c.rotation.x = 0;
    }
    const n = p.bet > 0 ? Math.min(6, Math.max(1, Math.round(p.bet / Math.max(20, (s.bb || 20))))) : 0;
    chipStacks[i].children.forEach((chip, k) => { chip.visible = k < n; });
  }
  const potN = Math.min(12, Math.max(0, Math.round((s.pot || 0) / 120)));
  potStack.children.forEach((chip, k) => { chip.visible = k < potN; });

  // 行动者 / 赢家
  let active = -1, winner = -1;
  try {
    document.querySelectorAll('.seat .plate.active').forEach(el => {
      const sEl = el.closest('.seat'); if (sEl) active = +sEl.dataset.seat;
    });
    document.querySelectorAll('.seat .plate.winner').forEach(el => {
      const sEl = el.closest('.seat'); if (sEl) winner = +sEl.dataset.seat;
    });
  } catch (e) { /* 非浏览器环境忽略 */ }
  state.activeSeat = active;
  if (winner >= 0 && winner !== state.winner) { state.winner = winner; celebrate(winner); }
  if (winner < 0) state.winner = -1;

  // 8 位 3D 牌手：弃牌下沉、行动前倾、思考歪头、赢家弹跳
  for (let i = 0; i < 8; i++) {
    const p = ps[i], info = playerInfo[i];
    if (!info) continue;
    info.folded = !!(p && p.folded);
    info.active = i === state.activeSeat;
    info.winner = !!(p && p.won > 0);
    info.thinking = !!(p && p.thinking);
  }
  state.board = board; state.players = ps; state.pot = s.pot || 0;
}

/* ---------------- 渲染循环 ---------------- */
function tick() {
  requestAnimationFrame(tick);
  if (!state.on || !renderer) return;
  const now = performance.now();
  clock = now / 1000;

  if (state.viewTween && state.viewTo && state.targetTo) {
    camera.position.lerp(state.viewTo, .075);
    controls.target.lerp(state.targetTo, .075);
    if (camera.position.distanceTo(state.viewTo) < .03 && controls.target.distanceTo(state.targetTo) < .03) {
      state.viewTween = false;
    }
  }
  controls.update();

  // 荷官 idle + 动作
  if (dealerRig && dealerModel) {
    const breathe = Math.sin(clock * 1.5) * .012;
    let rx = 0, rz = 0, ry = MODEL_YAW, bob = 0, sc = 1, pz = 0;
    ry += Math.sin(clock * .6) * .035;
    if (state.act) {
      const a = state.act;
      const t = (now - a.t0) / (a.cfg.d * 1000);
      if (t >= 1) state.act = null;
      else {
        const k = Math.sin(Math.PI * t);
        rx += (a.cfg.rx || 0) * k; rz += (a.cfg.rz || 0) * k;
        ry += (a.cfg.ry || 0) * k; bob += (a.cfg.bob || 0) * k;
        sc += (a.cfg.sc || 0) * k; pz += (a.cfg.pz || 0) * k;
      }
    }
    dealerRig.rotation.set(rx, ry, rz);
    dealerRig.position.set(0, bob, DEALER_Z + pz);
    dealerModel.scale.setScalar(dealerModel.userData.baseScale || (dealerModel.userData.baseScale = dealerModel.scale.x));
    dealerModel.scale.multiplyScalar(sc * (1 + breathe));
  }

  // 行动光环脉冲
  seatRings.forEach((ring, i) => {
    const on = i === state.activeSeat;
    ring.material.opacity += ((on ? .55 + Math.sin(clock * 5) * .25 : 0) - ring.material.opacity) * .16;
    ring.scale.setScalar(on ? 1 + Math.sin(clock * 5) * .07 : 1);
  });

  // 8 位 3D 牌手的姿态反馈
  for (let i = 0; i < 8; i++) {
    const rig = playerRigs[i], info = playerInfo[i];
    if (!rig || !info || !playerModels[i]) continue;
    let targetY = PLAYER_Y, tilt = 0, roll = 0, targetScale = 1;
    if (info.folded) { targetY = PLAYER_Y - .24; tilt = -.12; targetScale = .93; }
    else if (info.winner) { targetY = PLAYER_Y + Math.abs(Math.sin(clock * 6)) * .16; }
    else if (info.active) { targetY = PLAYER_Y + .05 + Math.sin(clock * 3) * .02; }
    if (info.thinking) roll = Math.sin(clock * 1.8) * .055;
    if (info.pulse > 0) { targetY += info.pulse * .18; info.pulse *= .90; if (info.pulse < .01) info.pulse = 0; }
    rig.position.y += (targetY - rig.position.y) * .12;
    rig.rotation.x += (tilt - rig.rotation.x) * .10;
    rig.rotation.z += (roll - rig.rotation.z) * .10;
    const sc = rig.scale.x + (targetScale - rig.scale.x) * .12;
    rig.scale.setScalar(sc);
  }

  // 发牌飞入
  for (let i = state.flying.length - 1; i >= 0; i--) {
    const card = state.flying[i], f = card.userData.fly;
    const t = Math.min(1, (now - f.t0) / (f.dur * 1000));
    const e = 1 - Math.pow(1 - t, 3);
    card.position.lerpVectors(f.from, f.to, e);
    card.position.y += Math.sin(Math.PI * t) * .45;
    card.rotation.x = (1 - e) * Math.PI * 1.3;
    card.rotation.z = (1 - e) * .5;
    if (t >= 1) { card.position.copy(f.to); card.rotation.set(0, 0, 0); delete card.userData.fly; state.flying.splice(i, 1); }
  }

  // 彩带
  for (let i = state.confetti.length - 1; i >= 0; i--) {
    const m = state.confetti[i];
    m.userData.v.y -= .032;
    m.position.addScaledVector(m.userData.v, .016);
    m.rotation.x += .08; m.rotation.y += .11;
    m.userData.life -= .016;
    m.material.opacity = Math.min(1, m.userData.life);
    if (m.userData.life <= 0) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); state.confetti.splice(i, 1); }
  }

  renderer.render(scene, camera);
}

/* ---------------- 对外 API ---------------- */
function resize() {
  if (!renderer || !wrap) return;
  const w = wrap.clientWidth || 900, h = wrap.clientHeight || 600;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function setOn(flag) {
  state.on = !!flag;
  document.body.classList.toggle('t3d', state.on);
  if (canvas) canvas.style.display = state.on ? 'block' : 'none';
  try { localStorage.setItem('poker_3d', state.on ? '1' : '0'); } catch (e) {}
  if (state.on) { resize(); sync({ board: state.board, players: state.players, pot: state.pot }); }
}
function notifyReady() {
  try {
    if (typeof window.Table3DReady === 'function') {
      window.Table3DReady({ on: state.on, focus: state.focus, model: state.failed ? 'fallback' : 'glb' });
    }
  } catch (e) {}
}
function focusDealer(on) {
  state.focus = !!on;
  const v = state.focus ? VIEW_FACE : VIEW_WIDE;
  state.viewTo = new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]);
  state.targetTo = new THREE.Vector3(v.target[0], v.target[1], v.target[2]);
  state.viewTween = true;
  if (controls) controls.enabled = !state.focus;
}
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}
function init() {
  wrap = document.getElementById('table-wrap');
  if (!wrap || !webglOK()) { state.failed = true; notifyReady(); return; }
  canvas = document.createElement('canvas');
  canvas.id = 'table3d';
  wrap.insertBefore(canvas, wrap.firstChild);

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { state.failed = true; notifyReady(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, .1, 120);
  camera.position.set(0, 5.1, 10.4);

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.3, -.9);
  controls.enableDamping = true; controls.dampingFactor = .07;
  controls.enablePan = false;
  controls.minDistance = 8.5; controls.maxDistance = 17;
  controls.minPolarAngle = .72; controls.maxPolarAngle = 1.32;
  controls.minAzimuthAngle = -.65; controls.maxAzimuthAngle = .65;
  controls.update();

  buildRoom(); buildTable(); buildSeats(); buildCards(); buildChips(); buildLights();
  buildDealer(); buildPlayers();

  let wantOn = true;
  try { const v = localStorage.getItem('poker_3d'); if (v !== null) wantOn = v === '1'; } catch (e) {}
  setOn(wantOn);
  try { if (new URLSearchParams(location.search).get('face') === '1') focusDealer(true); } catch (e) {}

  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(wrap);

  // 点击 3D 荷官 → 交互
  const ray = new THREE.Raycaster();
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects([dealerRig, ...playerRigs].filter(Boolean), true);
    if (!hits.length) return;
    let o = hits[0].object, kind = null, seat = -1;
    while (o) {
      if (o.userData && o.userData.seat !== undefined) { kind = 'player'; seat = o.userData.seat; break; }
      if (o.userData && o.userData.dealer) { kind = 'dealer'; break; }
      o = o.parent;
    }
    if (kind === 'player') {
      if (playerInfo[seat]) playerInfo[seat].pulse = 1;
      try { if (typeof window.Table3DPlayerClick === 'function') window.Table3DPlayerClick(seat); } catch (err) {}
      return;
    }
    if (kind === 'dealer') {
      const keys = Object.keys(ACT);
      playAction(keys[Math.floor(Math.random() * keys.length)]);
      try { if (typeof window.Table3DDealerClick === 'function') window.Table3DDealerClick(); } catch (err) {}
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', notifyReady);
  else notifyReady();
  // 诊断入口：?debug3d=1 时把 3D 运行状态写进标题，便于无头浏览器核验
  try {
    if (new URLSearchParams(location.search).get('debug3d') === '1') {
      const dbg = () => {
        let bbox = null;
        try {
          if (dealerModel) {
            const b = new THREE.Box3().setFromObject(dealerModel);
            bbox = [b.min.toArray().map(v => +v.toFixed(2)), b.max.toArray().map(v => +v.toFixed(2))];
          }
        } catch (e) {}
        document.title = 'T3D:' + JSON.stringify({
          on: state.on, ready: state.ready,
          model: state.failed ? 'fallback' : 'glb',
          canvas: !!canvas, webgl: !!renderer,
          board: state.board.length, players: state.players.length,
          bodyClass: document.body.className,
          log: state.log, bbox,
          tris: renderer ? renderer.info.render.triangles : 0,
          children: dealerModel ? dealerModel.children.length : 0,
          playerModels: state.playersReady,
          faces: FACE_TEX.filter(Boolean).length,
          facePlanes: playerModels.filter(m => m && m.userData.faceAttached).length,
        });
      };
      setTimeout(dbg, 1000);
      setInterval(dbg, 1500);
    }
  } catch (e) {}
  tick();
}

window.Table3D = {
  init, setOn, sync, playAction, celebrate, resize, focusDealer,
  isOn: () => state.on,
  isFocus: () => state.focus,
  isReady: () => state.ready,
  modelType: () => state.failed ? 'fallback' : 'glb',
};

init();

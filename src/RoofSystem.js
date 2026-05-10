/**
 * RoofSystem.js
 * Builds 4 roof types on a parametric house footprint.
 *
 * Coordinate system: +X=East, +Y=Up, +Z=South
 *
 * Each builder accepts a params object:
 *   { width, depth, wallHeight, pitchDeg, ridgeLen }
 *
 * Returns: { group, faces }
 *   group  – THREE.Group containing all meshes
 *   faces  – Array<{ mesh, normal, center, rightDir, upDir, width, height, orientation }>
 */

import * as THREE from 'three';

// Default house dimensions (exported for reference)
export const DEFAULT_W = 10;
export const DEFAULT_D = 10;
export const DEFAULT_H = 3;

// ─── Procedural textures ─────────────────────────────────────────────────────
function _makeWallTex() {
  const W = 512, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  
  // Moderná omietka s prírodným vzhľadom
  // Základný tón: svetlá piesková/béžová farba
  cx.fillStyle = '#d9cfc5'; cx.fillRect(0, 0, W, H);
  
  // Perlin-like šum pre prírodný vzhľad
  const imageData = cx.getImageData(0, 0, W, H);
  const data = imageData.data;
  
  // Vrstvy textúry pre hĺbku
  for (let i = 0; i < W * H; i++) {
    const offset = i * 4;
    // Podkladový šum
    const noise1 = Math.sin(i * 0.01) * Math.cos(i * 0.007) * 20;
    // Jemnejší šum
    const noise2 = Math.random() * 30 - 15;
    const totalNoise = noise1 + noise2;
    
    data[offset] += totalNoise;      // R
    data[offset + 1] += totalNoise * 0.95; // G
    data[offset + 2] += totalNoise * 0.9;  // B
  }
  cx.putImageData(imageData, 0, 0);
  
  // Väčšie nečistoty a textúra povrchu
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const size = Math.random() * 8 + 2;
    const opacity = Math.random() * 0.15;
    cx.fillStyle = `rgba(${150 + Math.random() * 50}, ${140 + Math.random() * 40}, ${130 + Math.random() * 30}, ${opacity})`;
    cx.beginPath();
    cx.arc(x, y, size, 0, 6.28);
    cx.fill();
  }
  
  // Jemné praskliny a línie od vody
  for (let i = 0; i < 300; i++) {
    const x1 = Math.random() * W;
    const y1 = Math.random() * H;
    const x2 = x1 + (Math.random() - 0.5) * 30;
    const y2 = y1 + (Math.random() - 0.5) * 30;
    cx.strokeStyle = `rgba(100, 80, 60, ${Math.random() * 0.1})`;
    cx.lineWidth = 0.5 + Math.random() * 1;
    cx.beginPath();
    cx.moveTo(x1, y1);
    cx.lineTo(x2, y2);
    cx.stroke();
  }
  
  // Spodná časť: tmavší kameň/betón
  const stoneGrad = cx.createLinearGradient(0, H * 0.6, 0, H);
  stoneGrad.addColorStop(0, 'rgba(0,0,0,0)');
  stoneGrad.addColorStop(0.3, 'rgba(80, 70, 60, 0.2)');
  stoneGrad.addColorStop(1, 'rgba(60, 50, 40, 0.35)');
  cx.fillStyle = stoneGrad;
  cx.fillRect(0, H * 0.6, W, H * 0.4);
  
  // Prírodný kameň efekt v dolnej časti
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * W;
    const y = H * 0.6 + Math.random() * (H * 0.4);
    const size = Math.random() * 3;
    cx.fillStyle = `rgba(${80 + Math.random() * 40}, ${60 + Math.random() * 30}, ${40 + Math.random() * 20}, ${Math.random() * 0.2})`;
    cx.beginPath();
    cx.arc(x, y, size, 0, 6.28);
    cx.fill();
  }
  
  // Patina a vlhkosť v spodnej časti (ako v starom kovu)
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * W;
    const y = H * 0.65 + Math.random() * (H * 0.35);
    const size = 1 + Math.random() * 2.5;
    const hue = 30 + Math.random() * 20; // Okrovo/zeleno
    cx.fillStyle = `hsla(${hue}, 60%, 40%, ${Math.random() * 0.15})`;
    cx.beginPath();
    cx.arc(x, y, size, 0, 6.28);
    cx.fill();
  }
  
  // Zvislé línie od zrážok
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * W;
    const startY = Math.random() * H * 0.6;
    const len = 50 + Math.random() * 100;
    cx.strokeStyle = `rgba(0, 0, 0, ${Math.random() * 0.08})`;
    cx.lineWidth = 0.5 + Math.random() * 0.8;
    cx.beginPath();
    cx.moveTo(x, startY);
    cx.lineTo(x + (Math.random() - 0.5) * 3, startY + len);
    cx.stroke();
  }
  
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.5);
  return t;
}

function _makeRoofTileTex() {
  const W = 512, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');

  // Tmavé pozadie — medzery medzi taškami
  cx.fillStyle = '#2e0f08';
  cx.fillRect(0, 0, W, H);

  const tileW = 64, tileH = 48;
  const cols = Math.ceil(W / tileW) + 2;
  const rows = Math.ceil(H / tileH) + 2;

  // Terakotová paleta — prirodzená variácia vypálených tašiek
  const palette = [
    [148, 60, 40], [162, 68, 46], [135, 52, 34],
    [155, 72, 50], [142, 58, 38], [170, 75, 52],
    [128, 48, 32], [158, 65, 44],
  ];

  for (let r = 0; r < rows; r++) {
    const offX = (r % 2) * (tileW / 2);
    for (let c = 0; c < cols; c++) {
      const x = c * tileW - offX;
      const y = r * tileH;
      const [br, bg, bb] = palette[(r * 7 + c * 3) % palette.length];
      const v = (Math.sin(r * 1.9 + c * 2.3) * 0.5 + 0.5) * 18 - 9;

      // Oblúkový profil tašky — gradient simuluje zaoblený tvar
      const arcGrad = cx.createLinearGradient(x, y, x + tileW, y);
      const clamp = (val) => Math.max(0, Math.min(255, val));
      arcGrad.addColorStop(0,    `rgb(${clamp(br*0.55+v)},${clamp(bg*0.55+v)},${clamp(bb*0.55+v)})`);
      arcGrad.addColorStop(0.18, `rgb(${clamp(br*0.78+v)},${clamp(bg*0.78+v)},${clamp(bb*0.78+v)})`);
      arcGrad.addColorStop(0.42, `rgb(${clamp(br*1.18+v)},${clamp(bg*1.08+v)},${clamp(bb*1.0+v)})`);
      arcGrad.addColorStop(0.65, `rgb(${clamp(br*0.95+v)},${clamp(bg*0.92+v)},${clamp(bb*0.88+v)})`);
      arcGrad.addColorStop(1,    `rgb(${clamp(br*0.6+v)},${clamp(bg*0.6+v)},${clamp(bb*0.6+v)})`);
      cx.fillStyle = arcGrad;
      cx.fillRect(x + 1, y + 2, tileW - 2, tileH - 5);

      // Svetlý vrchol — odraz svetla na hrane tašky
      const topGrad = cx.createLinearGradient(x, y + 2, x, y + tileH * 0.28);
      topGrad.addColorStop(0, `rgba(255,210,170,0.32)`);
      topGrad.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = topGrad;
      cx.fillRect(x + 1, y + 2, tileW - 2, tileH * 0.28);

      // Tieň pod presahom — spodná taška vrháva tieň
      const shadowGrad = cx.createLinearGradient(x, y + tileH * 0.72, x, y + tileH - 3);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0.42)');
      cx.fillStyle = shadowGrad;
      cx.fillRect(x + 1, y + tileH * 0.72, tileW - 2, tileH * 0.28 - 2);

      // Mach / patina na ~15 % tašiek
      if ((r * 11 + c * 7) % 13 < 2) {
        cx.fillStyle = `rgba(${35+Math.random()*20},${75+Math.random()*35},${28+Math.random()*18},${0.18+Math.random()*0.22})`;
        cx.fillRect(x + 4, y + tileH * 0.35, tileW * 0.55, tileH * 0.38);
      }
    }
  }

  // Jemný šum pre detailnosť povrchu
  const imgData = cx.getImageData(0, 0, W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i]     = Math.max(0, Math.min(255, d[i]     + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.88));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.78));
  }
  cx.putImageData(imgData, 0, 0);

  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 4);
  return t;
}

function _makeFlatRoofTex() {
  const W = 512, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  // Realistický asfalt/bitúmen
  // Základný tón s variáciou
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = 35 + Math.random() * 35;
      cx.fillStyle = `rgb(${Math.floor(v * 0.7)}, ${Math.floor(v * 0.65)}, ${Math.floor(v * 0.6)})`;
      cx.fillRect(x, y, 1, 1);
    }
  }
  // Väčšie agregáty a štruktúra
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const size = Math.random() * 3.5;
    const v = 30 + Math.random() * 40;
    cx.fillStyle = `rgba(${Math.floor(v)}, ${Math.floor(v * 0.9)}, ${Math.floor(v * 0.85)}, ${0.6 + Math.random() * 0.4})`;
    cx.beginPath();
    cx.arc(x, y, size, 0, 6.28);
    cx.fill();
  }
  // Mikro prasklinky a štruktúra asfaltového povrchu
  cx.strokeStyle = 'rgba(20,20,20,0.4)';
  cx.lineWidth = 0.5;
  for (let i = 0; i < 1500; i++) {
    const x1 = Math.random() * W, y1 = Math.random() * H;
    const x2 = x1 + (Math.random() - 0.5) * 20, y2 = y1 + (Math.random() - 0.5) * 20;
    cx.beginPath();
    cx.moveTo(x1, y1);
    cx.lineTo(x2, y2);
    cx.stroke();
  }
  // Vlhkosť a znečistenie
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const v = Math.random() * 50;
    cx.fillStyle = `rgba(${Math.floor(v)}, ${Math.floor(v * 0.95)}, ${Math.floor(v * 0.9)}, ${Math.random() * 0.25})`;
    cx.beginPath();
    cx.arc(x, y, 0.8 + Math.random() * 2, 0, 6.28);
    cx.fill();
  }
  // Väčšie praskliny a staré ryhy
  for (let i = 0; i < 120; i++) {
    const x1 = Math.random() * W, y1 = Math.random() * H;
    const len = 30 + Math.random() * 80;
    const ang = Math.random() * Math.PI * 2;
    const x2 = x1 + Math.cos(ang) * len;
    const y2 = y1 + Math.sin(ang) * len;
    cx.strokeStyle = `rgba(10,10,10,${0.15 + Math.random() * 0.25})`;
    cx.lineWidth = 1 + Math.random() * 1.5;
    cx.beginPath();
    cx.moveTo(x1, y1);
    cx.lineTo(x2, y2);
    cx.stroke();
  }
  // Vlhkosť v rohoch a spodnej časti
  const waterGrad = cx.createRadialGradient(W * 0.2, H * 0.2, 10, W * 0.5, H * 0.5, 400);
  waterGrad.addColorStop(0, 'rgba(80,100,120,0.15)');
  waterGrad.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = waterGrad;
  cx.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t;
}

export function makeGroundTexture() {
  const W = 512, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#3d6e40'; cx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7000; i++) {
    const r = Math.floor(45 + Math.random() * 55);
    const g = Math.floor(88 + Math.random() * 72);
    const b = Math.floor(35 + Math.random() * 35);
    cx.fillStyle = `rgba(${r},${g},${b},0.35)`;
    cx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(25, 25); return t;
}

// Materials (textures created lazily on first roof build)
let _wallTex = null, _roofTileTex = null, _flatRoofTex = null;

const wallMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.85, metalness: 0.0, side: THREE.FrontSide
});
const roofMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.80, metalness: 0.04, side: THREE.DoubleSide
});
const flatRoofMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.94, metalness: 0.0
});

function _ensureTextures() {
  if (!_wallTex) { _wallTex = _makeWallTex(); wallMat.map = _wallTex; wallMat.needsUpdate = true; }
  if (!_roofTileTex) { _roofTileTex = _makeRoofTileTex(); roofMat.map = _roofTileTex; roofMat.needsUpdate = true; }
  if (!_flatRoofTex) { _flatRoofTex = _makeFlatRoofTex(); flatRoofMat.map = _flatRoofTex; flatRoofMat.needsUpdate = true; }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function buildQuadFace(v0, v1, v2, v3) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    v0.x, v0.y, v0.z,  v1.x, v1.y, v1.z,  v2.x, v2.y, v2.z,
    v0.x, v0.y, v0.z,  v2.x, v2.y, v2.z,  v3.x, v3.y, v3.z
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.computeVertexNormals();

  // Compute proper UVs using face tangent space so trapezoids (hip roof) don't stretch
  const e1     = new THREE.Vector3().subVectors(v1, v0);
  const e2     = new THREE.Vector3().subVectors(v3, v0);
  const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let right;
  if (Math.abs(normal.dot(worldUp)) > 0.99) {
    right = new THREE.Vector3(1, 0, 0);
  } else {
    right = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
  }
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const verts = [v0, v1, v2, v3];
  const pts   = verts.map(v => {
    const d = v.clone().sub(v0);
    return { r: d.dot(right), u: d.dot(up) };
  });
  const maxR = Math.max(...pts.map(p => p.r));
  const maxU = Math.max(...pts.map(p => p.u));
  const minU = Math.min(...pts.map(p => p.u));
  const scR  = maxR || 1;
  const scU  = (maxU - minU) || 1;
  const uvs  = pts.map(p => [(p.r) / scR, (p.u - minU) / scU]);
  const uvArr = new Float32Array([
    ...uvs[0], ...uvs[1], ...uvs[2],
    ...uvs[0], ...uvs[2], ...uvs[3]
  ]);
  geom.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const center = new THREE.Vector3().addVectors(v0, v1).add(v2).add(v3).multiplyScalar(0.25);
  return { geom, normal, center };
}

function buildTriFace(v0, v1, v2) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    v0.x, v0.y, v0.z,  v1.x, v1.y, v1.z,  v2.x, v2.y, v2.z
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.computeVertexNormals();

  // Compute proper UVs using face tangent space to avoid stretching
  const e1     = new THREE.Vector3().subVectors(v1, v0);
  const e2     = new THREE.Vector3().subVectors(v2, v0);
  const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let right;
  if (Math.abs(normal.dot(worldUp)) > 0.99) {
    right = new THREE.Vector3(1, 0, 0);
  } else {
    right = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
  }
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const pts = [v0, v1, v2].map(v => {
    const d = v.clone().sub(v0);
    return { r: d.dot(right), u: d.dot(up) };
  });
  const maxR = Math.max(...pts.map(p => p.r));
  const maxU = Math.max(...pts.map(p => p.u));
  const minU = Math.min(...pts.map(p => p.u));
  const scR  = maxR || 1;
  const scU  = (maxU - minU) || 1;
  const uvArr = new Float32Array(pts.flatMap(p => [p.r / scR, (p.u - minU) / scU]));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const center = new THREE.Vector3().addVectors(v0, v1).add(v2).multiplyScalar(1 / 3);
  return { geom, normal, center };
}

function computeFaceDirs(normal) {
  const worldUp = new THREE.Vector3(0, 1, 0);
  let rightDir;
  if (Math.abs(normal.dot(worldUp)) > 0.99) {
    rightDir = new THREE.Vector3(1, 0, 0);
  } else {
    rightDir = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
  }
  const upDir = new THREE.Vector3().crossVectors(normal, rightDir).normalize();
  return { rightDir, upDir };
}

function measureFace(vertices, center, rightDir, upDir) {
  let minR = Infinity, maxR = -Infinity;
  let minU = Infinity, maxU = -Infinity;
  for (const v of vertices) {
    const d = v.clone().sub(center);
    const r = d.dot(rightDir);
    const u = d.dot(upDir);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
  }
  return {
    width:      maxR - minR,
    height:     maxU - minU,
    faceCenter: center.clone()
      .addScaledVector(rightDir, (minR + maxR) / 2)
      .addScaledVector(upDir,    (minU + maxU) / 2)
  };
}

function buildWalls(group, W, D, Wh) {
  _ensureTextures();
  const geom = new THREE.BoxGeometry(W, Wh, D);
  const mesh = new THREE.Mesh(geom, wallMat);
  mesh.position.set(0, Wh / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'walls';
  group.add(mesh);
}

function registerFace(faces, mesh, normal, center, vertices, orientation) {
  const { rightDir, upDir } = computeFaceDirs(normal);
  const dims = measureFace(vertices, center, rightDir, upDir);

  // Project face vertices to local 2D relative to dims.faceCenter.
  // Used by SolarPanels for polygon containment checks on triangular faces.
  const verts2d = vertices.map(v => {
    const d = v.clone().sub(dims.faceCenter);
    return { r: d.dot(rightDir), u: d.dot(upDir) };
  });

  faces.push({
    mesh,
    normal:    normal.clone().normalize(),
    center:    dims.faceCenter,
    rightDir,
    upDir,
    width:     dims.width,
    height:    dims.height,
    orientation,
    verts2d
  });
}

// ─── Flat Roof ────────────────────────────────────────────────────────────────
export function createFlatRoof({
  width = DEFAULT_W, depth = DEFAULT_D, wallHeight = DEFAULT_H,
  pitchDeg = 0, ridgeLen = 0
} = {}) {
  const group = new THREE.Group();
  group.name  = 'flatRoof';
  const faces = [];

  buildWalls(group, width, depth, wallHeight);

  const hw = width / 2, hd = depth / 2;
  const y  = wallHeight + 0.2;
  const geom = new THREE.BoxGeometry(width, 0.25, depth);
  const mesh = new THREE.Mesh(geom, flatRoofMat);
  mesh.position.set(0, y, 0);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'roof_flat';
  group.add(mesh);

  const center = new THREE.Vector3(0, y + 0.125, 0);
  const normal = new THREE.Vector3(0, 1, 0);
  const verts  = [
    new THREE.Vector3(-hw, y + 0.125, -hd),
    new THREE.Vector3( hw, y + 0.125, -hd),
    new THREE.Vector3( hw, y + 0.125,  hd),
    new THREE.Vector3(-hw, y + 0.125,  hd)
  ];
  registerFace(faces, mesh, normal, center, verts, 'flat');

  return { group, faces };
}

// ─── Gable Roof ───────────────────────────────────────────────────────────────
export function createGableRoof({
  width = DEFAULT_W, depth = DEFAULT_D, wallHeight = DEFAULT_H,
  pitchDeg = 30, ridgeLen = 0
} = {}) {
  const group = new THREE.Group();
  group.name  = 'gableRoof';
  const faces = [];

  buildWalls(group, width, depth, wallHeight);

  const hw = width / 2, hd = depth / 2;
  const h  = Math.tan(pitchDeg * Math.PI / 180) * hd;

  const A = new THREE.Vector3(-hw, wallHeight, -hd);
  const B = new THREE.Vector3( hw, wallHeight, -hd);
  const C = new THREE.Vector3( hw, wallHeight,  hd);
  const D = new THREE.Vector3(-hw, wallHeight,  hd);
  const E = new THREE.Vector3(-hw, wallHeight + h, 0);
  const F = new THREE.Vector3( hw, wallHeight + h, 0);

  // South face: D, C, F, E
  {
    const { geom, normal, center } = buildQuadFace(D, C, F, E);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'roof_south';
    group.add(mesh);
    registerFace(faces, mesh, normal, center, [D, C, F, E], 'south');
  }

  // North face: B, A, E, F
  {
    const { geom, normal, center } = buildQuadFace(B, A, E, F);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'roof_north';
    group.add(mesh);
    registerFace(faces, mesh, normal, center, [B, A, E, F], 'north');
  }

  // West gable triangle (no panels)
  {
    const { geom } = buildTriFace(A, D, E);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'gable_west';
    group.add(mesh);
  }

  // East gable triangle (no panels)
  {
    const { geom } = buildTriFace(C, B, F);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'gable_east';
    group.add(mesh);
  }

  return { group, faces };
}

// ─── Hip Roof ─────────────────────────────────────────────────────────────────
export function createHipRoof({
  width = DEFAULT_W, depth = DEFAULT_D, wallHeight = DEFAULT_H,
  pitchDeg = 30, ridgeLen = 4
} = {}) {
  const group = new THREE.Group();
  group.name  = 'hipRoof';
  const faces = [];

  buildWalls(group, width, depth, wallHeight);

  const hw = width / 2, hd = depth / 2;
  const h  = Math.tan(pitchDeg * Math.PI / 180) * hd;
  const rl = Math.min(ridgeLen, width - 0.5) / 2;

  const A = new THREE.Vector3(-hw, wallHeight, -hd);
  const B = new THREE.Vector3( hw, wallHeight, -hd);
  const C = new THREE.Vector3( hw, wallHeight,  hd);
  const D = new THREE.Vector3(-hw, wallHeight,  hd);
  const E = new THREE.Vector3(-rl, wallHeight + h, 0);
  const F = new THREE.Vector3( rl, wallHeight + h, 0);

  // South face (trapezoid): D, C, F, E
  {
    const { geom, normal, center } = buildQuadFace(D, C, F, E);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'roof_south';
    group.add(mesh);
    registerFace(faces, mesh, normal, center, [D, C, F, E], 'south');
  }

  // North face (trapezoid): B, A, E, F
  {
    const { geom, normal, center } = buildQuadFace(B, A, E, F);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'roof_north';
    group.add(mesh);
    registerFace(faces, mesh, normal, center, [B, A, E, F], 'north');
  }

  // West hip (triangle): A, D, E
  {
    const { geom, normal, center } = buildTriFace(A, D, E);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'hip_west';
    group.add(mesh);
    registerFace(faces, mesh, normal, center, [A, D, E], 'west');
  }

  // East hip (triangle): C, B, F
  {
    const { geom, normal, center } = buildTriFace(C, B, F);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'hip_east';
    group.add(mesh);
    registerFace(faces, mesh, normal, center, [C, B, F], 'east');
  }

  return { group, faces };
}

// ─── Pyramid Roof ─────────────────────────────────────────────────────────────
export function createPyramidRoof({
  width = DEFAULT_W, depth = DEFAULT_D, wallHeight = DEFAULT_H,
  pitchDeg = 35, ridgeLen = 0
} = {}) {
  const group = new THREE.Group();
  group.name  = 'pyramidRoof';
  const faces = [];

  buildWalls(group, width, depth, wallHeight);

  const hw = width / 2, hd = depth / 2;
  const h  = Math.tan(pitchDeg * Math.PI / 180) * Math.min(hw, hd);

  const A = new THREE.Vector3(-hw, wallHeight, -hd);
  const B = new THREE.Vector3( hw, wallHeight, -hd);
  const C = new THREE.Vector3( hw, wallHeight,  hd);
  const D = new THREE.Vector3(-hw, wallHeight,  hd);
  const P = new THREE.Vector3(  0, wallHeight + h, 0);

  const faceData = [
    { v: [D, C, P], name: 'roof_south', orient: 'south' },
    { v: [B, A, P], name: 'roof_north', orient: 'north' },
    { v: [A, D, P], name: 'roof_west',  orient: 'west'  },
    { v: [C, B, P], name: 'roof_east',  orient: 'east'  },
  ];

  for (const f of faceData) {
    const { geom, normal, center } = buildTriFace(...f.v);
    const mesh = new THREE.Mesh(geom, roofMat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = f.name;
    group.add(mesh);
    registerFace(faces, mesh, normal, center, f.v, f.orient);
  }

  return { group, faces };
}

// ─── Ground plane ─────────────────────────────────────────────────────────────
export function createGround() {
  const geom = new THREE.PlaneGeometry(200, 200, 1, 1);
  const mat  = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0.0,
    map: makeGroundTexture()
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// Map of roof builder functions
export const ROOF_BUILDERS = {
  flat:    createFlatRoof,
  gable:   createGableRoof,
  hip:     createHipRoof,
  pyramid: createPyramidRoof
};

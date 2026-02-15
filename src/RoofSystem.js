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
  cx.fillStyle = '#eee8d8'; cx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    cx.fillStyle = `rgba(100,75,45,${Math.random() * 0.07})`;
    cx.beginPath(); cx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.8, 0, 6.28); cx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return t;
}

function _makeRoofTileTex() {
  const W = 512, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  const tw = 64, th = 40, nc = Math.ceil(W / tw) + 1, nr = Math.ceil(H / th) + 1;
  cx.fillStyle = '#7a3a1a'; cx.fillRect(0, 0, W, H);
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      const xo = (r % 2) * (tw / 2), x = c * tw - xo, y = r * th;
      const g = cx.createLinearGradient(x, y, x + tw, y + th);
      g.addColorStop(0, '#c8652a'); g.addColorStop(0.5, '#a04a1e'); g.addColorStop(1, '#7a3a14');
      cx.fillStyle = g; cx.fillRect(x + 1, y + 1, tw - 2, th - 4);
      cx.fillStyle = 'rgba(0,0,0,0.22)'; cx.fillRect(x + 1, y + th - 5, tw - 2, 4);
      cx.fillStyle = 'rgba(255,255,255,0.07)'; cx.fillRect(x + 1, y + 1, tw - 2, 4);
    }
  }
  cx.strokeStyle = '#5a2a0e'; cx.lineWidth = 1.5;
  for (let r = 0; r <= nr; r++) { cx.beginPath(); cx.moveTo(0, r * th); cx.lineTo(W, r * th); cx.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 4); return t;
}

function _makeFlatRoofTex() {
  const W = 512, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#565656'; cx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2800; i++) {
    const gv = Math.floor(55 + Math.random() * 90);
    cx.fillStyle = `rgb(${gv},${gv},${gv})`;
    cx.beginPath(); cx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 2.5, 0, 6.28); cx.fill();
  }
  cx.strokeStyle = 'rgba(25,25,25,0.5)'; cx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    cx.beginPath(); cx.moveTo(0, i * H / 4); cx.lineTo(W, i * H / 4); cx.stroke();
    cx.beginPath(); cx.moveTo(i * W / 4, 0); cx.lineTo(i * W / 4, H); cx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); return t;
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
  color: 0xffffff, roughness: 0.88, metalness: 0.0, side: THREE.FrontSide
});
const roofMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide
});
const flatRoofMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.96, metalness: 0.0
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

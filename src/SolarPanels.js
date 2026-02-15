/**
 * SolarPanels.js
 * Manages solar panel placement on roof faces.
 * Supports auto and manual placement modes.
 */

import * as THREE from 'three';
import { PANEL_W, PANEL_H } from './EnergyCalc.js';

const PANEL_THICKNESS = 0.04;
const SURFACE_OFFSET  = 0.025;
const EDGE_MARGIN     = 0.05;   // safe clearance from roof edges (metres)

/**
 * Convex polygon containment test in 2D.
 * Returns true if (pr, pu) is inside the convex polygon by at least `margin`.
 * Handles triangles and quads.  Winding order is auto-detected via centroid.
 */
function insideConvex2D(pr, pu, verts2d, margin) {
  const n = verts2d.length;
  let cr = 0, cu = 0;
  for (const v of verts2d) { cr += v.r; cu += v.u; }
  cr /= n; cu /= n;

  for (let i = 0; i < n; i++) {
    const a = verts2d[i];
    const b = verts2d[(i + 1) % n];
    const ex = b.r - a.r, ey = b.u - a.u;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-6) continue;
    // Inward normal: perpendicular, oriented toward centroid
    let nx = -ey / len, ny = ex / len;
    if ((cr - a.r) * nx + (cu - a.u) * ny < 0) { nx = -nx; ny = -ny; }
    const dot = (pr - a.r) * nx + (pu - a.u) * ny;
    if (dot < margin) return false;
  }
  return true;
}

// Photovoltaic cell texture (canvas-generated)
let _panelTexture = null;
function getPanelTexture() {
  if (_panelTexture) return _panelTexture;

  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d1b4b';
  ctx.fillRect(0, 0, W, H);

  const cols = 6, rows = 10;
  const cellW = W / cols, cellH = H / rows;
  const pad = 3;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + pad, y = r * cellH + pad;
      const cw = cellW - pad * 2, ch = cellH - pad * 2;
      const grad = ctx.createLinearGradient(x, y, x + cw, y + ch);
      grad.addColorStop(0,   '#1a2f7a');
      grad.addColorStop(0.4, '#0d1b5c');
      grad.addColorStop(1,   '#0a1540');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = 'rgba(100,150,255,0.06)';
      ctx.fillRect(x, y, cw * 0.4, ch * 0.35);
    }
  }

  ctx.strokeStyle = '#4466cc';
  ctx.lineWidth = pad;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * cellW, 0); ctx.lineTo(c * cellW, H); ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * cellH); ctx.lineTo(W, r * cellH); ctx.stroke();
  }

  const sheen = ctx.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0,   'rgba(120,160,255,0.04)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1,   'rgba(0,0,50,0.04)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  _panelTexture = new THREE.CanvasTexture(canvas);
  _panelTexture.anisotropy = 8;
  return _panelTexture;
}

let _panelMat = null;
function getPanelMaterial() {
  if (_panelMat) return _panelMat;
  _panelMat = new THREE.MeshStandardMaterial({
    map: getPanelTexture(),
    roughness: 0.1, metalness: 0.7, envMapIntensity: 1.0, color: 0xffffff
  });
  return _panelMat;
}

const frameMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.8 });

export class SolarPanels {
  constructor(scene) {
    this.scene  = scene;
    this.group  = new THREE.Group();
    this.group.name = 'solarPanels';
    scene.add(this.group);
    this.panels = [];
  }

  clear() {
    for (const mesh of this.panels) {
      mesh.geometry.dispose();
      if (mesh.userData.ownMat) mesh.userData.ownMat.dispose();
    }
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.panels = [];
  }

  /**
   * Place panels on a set of faces.
   * @param {Array} faces
   * @param {Object} config
   *   efficiency, gapSize, panelW, panelH, placementMode, gridData,
   *   flatTiltDeg, equatorDir
   *   gridData[faceIdx] = { enabledCells: Set|null, blockedCells: Set }
   */
  placePanels(faces, config) {
    this.clear();
    const {
      efficiency,
      gapSize,
      panelW        = PANEL_W,
      panelH        = PANEL_H,
      placementMode = 'auto',
      gridData      = {},
      flatTiltDeg   = 0,
      equatorDir    = null,
      flatLayout    = 'south',
    } = config;

    for (let i = 0; i < faces.length; i++) {
      const gd = gridData[i] || {};
      this._placePanelsOnFace(
        faces[i], efficiency, gapSize, panelW, panelH,
        placementMode,
        gd.enabledCells  || null,
        gd.blockedCells  || new Set(),
        flatTiltDeg, equatorDir, flatLayout
      );
    }
    return this.panels;
  }

  _placePanelsOnFace(face, efficiency, gapSize, panelW, panelH,
                     placementMode, enabledCells, blockedCells,
                     flatTiltDeg = 0, equatorDir = null, flatLayout = 'south') {
    const { center, normal, rightDir, upDir, width, height, orientation, energyNormal, verts2d } = face;

    // Tilt is only meaningful on truly flat faces — use a strict threshold
    // (flat roof normal.y ≈ 1.0, whereas a 30° slope has normal.y = cos30° ≈ 0.866)
    const isFlatRoof = Math.abs(normal.y) > 0.97;
    const tiltRad    = (isFlatRoof && flatTiltDeg > 0 && equatorDir)
      ? flatTiltDeg * Math.PI / 180 : 0;
    const cosT = Math.cos(tiltRad);
    const sinT = Math.sin(tiltRad);

    const polyMargin    = EDGE_MARGIN + Math.max(panelW, panelH) / 2;
    const mat           = getPanelMaterial();
    const area          = panelW * panelH;
    // Height above roof surface to panel center (rises with tilt)
    const normalOffset  = SURFACE_OFFSET + PANEL_THICKNESS / 2 + panelH / 2 * sinT;

    // ── E/W (East-West) layout ───────────────────────────────────────────────
    // Pairs of panels share a central ridge running N-S.
    // One panel tilts east, the other west — compact N-S spacing.
    if (isFlatRoof && flatLayout === 'east-west') {
      // At 0° tilt both panels are flat; pair footprint = 2 × panelH
      const pairFoot  = 2 * panelH * cosT;
      const pairStepR = pairFoot + gapSize;
      const pairStepU = panelW  + gapSize;

      const cols   = Math.max(1, Math.floor(width  / pairStepR));
      const rows   = Math.max(1, Math.floor(height / pairStepU));
      const totalW = cols * pairStepR - gapSize;
      const totalU = rows * pairStepU - gapSize;
      const startR = -totalW / 2 + pairFoot / 2;
      const startU = -totalU / 2 + panelW   / 2;

      const tiltAxisEW = upDir;  // (0,0,-1) for standard flat roof
      // Build orientation quaternion for E/W panels; handles 0° tilt gracefully
      const mkQuat = (angle) => {
        if (Math.abs(angle) < 1e-6) {
          // Flat: same orientation as untilted south panel
          const lz = new THREE.Vector3().crossVectors(rightDir, normal).normalize();
          const m  = new THREE.Matrix4().makeBasis(rightDir, normal, lz);
          return { quat: new THREE.Quaternion().setFromRotationMatrix(m), n: normal.clone() };
        }
        const q = new THREE.Quaternion().setFromAxisAngle(tiltAxisEW, angle);
        const n = normal.clone().applyQuaternion(q).normalize();
        const z = new THREE.Vector3().crossVectors(upDir, n).normalize();
        const m = new THREE.Matrix4().makeBasis(upDir, n, z);
        return { quat: new THREE.Quaternion().setFromRotationMatrix(m), n };
      };
      const east = mkQuat( tiltRad);
      const west = mkQuat(-tiltRad);

      const addMesh = (pr, pu, q, pnormal) => {
        if (verts2d && !insideConvex2D(pr, pu, verts2d, polyMargin)) return;
        const pos = center.clone()
          .addScaledVector(rightDir, pr)
          .addScaledVector(upDir,    pu)
          .addScaledVector(normal,   normalOffset);
        const geom      = new THREE.BoxGeometry(panelW, PANEL_THICKNESS, panelH);
        const materials = [frameMat, frameMat, mat, frameMat, frameMat, frameMat];
        const mesh      = new THREE.Mesh(geom, materials);
        mesh.position.copy(pos);
        mesh.quaternion.copy(q);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name       = `panel_${orientation}_ew`;
        mesh.userData   = { normal: pnormal.clone(), efficiency, area, shadingFactor: 0, faceOrientation: orientation };
        this.group.add(mesh);
        this.panels.push(mesh);
      };

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cellIdx = r * cols + c;
          if (blockedCells.has(cellIdx)) continue;
          if (placementMode === 'manual' && enabledCells !== null && !enabledCells.has(cellIdx)) continue;
          const pu = startU + r * pairStepU;
          const ridgeR = startR + c * pairStepR;
          addMesh(ridgeR + panelH / 2 * cosT, pu, east.quat, east.n);  // east panel
          addMesh(ridgeR - panelH / 2 * cosT, pu, west.quat, west.n);  // west panel
        }
      }
      return;
    }

    // ── South / single-tilt layout (default) ────────────────────────────────
    // Row pitch is always constant — tilt only changes the physical angle of panels,
    // not the grid layout. This keeps the panel count stable across all tilt angles.
    const stepW = panelW + gapSize;
    const stepH = panelH + gapSize;

    // Stable row/col counts derived from the face dimensions and the margin constraint.
    // Formula ensures the last row's panel center fits within the polygon boundary.
    const cols   = Math.max(1, Math.floor(width  / stepW));
    const rows   = Math.max(1, Math.floor(height / stepH));
    const totalW = cols * stepW - gapSize;
    const startR = -totalW / 2 + panelW / 2;

    // Center the grid vertically on the face
    const totalH = rows * stepH - gapSize;
    let startU   = -totalH / 2 + panelH / 2;

    // Panel rotation
    let quat, panelNormal;
    if (tiltRad > 0 && equatorDir) {
      const tiltSign = equatorDir.dot(upDir) < 0 ? 1 : -1;
      const q        = new THREE.Quaternion().setFromAxisAngle(rightDir, tiltSign * tiltRad);
      panelNormal    = normal.clone().applyQuaternion(q).normalize();
      const localZ   = new THREE.Vector3().crossVectors(rightDir, panelNormal).normalize();
      quat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(rightDir, panelNormal, localZ));
    } else {
      panelNormal = energyNormal || normal;
      const localZ = new THREE.Vector3().crossVectors(rightDir, normal).normalize();
      quat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(rightDir, normal, localZ));
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellIdx = r * cols + c;
        const pr = startR + c * stepW;
        const pu = startU + r * stepH;

        if (verts2d && !insideConvex2D(pr, pu, verts2d, polyMargin)) continue;
        if (blockedCells.has(cellIdx)) continue;
        if (placementMode === 'manual' && enabledCells !== null && !enabledCells.has(cellIdx)) continue;

        const pos = center.clone()
          .addScaledVector(rightDir, pr)
          .addScaledVector(upDir,    pu)
          .addScaledVector(normal,   normalOffset);

        const geom      = new THREE.BoxGeometry(panelW, PANEL_THICKNESS, panelH);
        const materials = [frameMat, frameMat, mat, frameMat, frameMat, frameMat];
        const mesh      = new THREE.Mesh(geom, materials);
        mesh.position.copy(pos);
        mesh.quaternion.copy(quat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name       = `panel_${orientation}_r${r}_c${c}`;
        mesh.userData   = { normal: panelNormal.clone(), efficiency, area, shadingFactor: 0, faceOrientation: orientation };

        this.group.add(mesh);
        this.panels.push(mesh);
      }
    }
  }

  getPanelInfos() {
    return this.panels.map(m => ({
      normal:        m.userData.normal,
      efficiency:    m.userData.efficiency,
      area:          m.userData.area,
      shadingFactor: m.userData.shadingFactor || 0,
    }));
  }

  setVisible(visible) { this.group.visible = visible; }

  updateShading(panelData) {
    if (!panelData || panelData.length !== this.panels.length) return;
    const mat    = getPanelMaterial();
    const maxPOA = 1000;

    for (let i = 0; i < this.panels.length; i++) {
      const mesh = this.panels[i];
      const { poa } = panelData[i];
      const t = Math.min(1, poa / maxPOA);

      if (!mesh.userData.ownMat) {
        const clone = mat.clone();
        if (Array.isArray(mesh.material)) mesh.material[2] = clone;
        mesh.userData.ownMat = clone;
      }

      const r = 0.02 + t * 0.08;
      const g = 0.03 + t * 0.10;
      const b = 0.10 + t * 0.35;
      mesh.userData.ownMat.color.setRGB(r, g, b);
      mesh.userData.ownMat.emissive.setRGB(r * 0.1, g * 0.1, b * 0.2);
    }
  }

  get count()     { return this.panels.length; }
  get totalArea() { return this.panels.reduce((s, m) => s + m.userData.area, 0); }
}

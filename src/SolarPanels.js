/**
 * SolarPanels.js
 * Manages solar panel placement on roof faces.
 * Supports auto and manual placement modes.
 */

import * as THREE from 'three';
import { PANEL_W, PANEL_H } from './EnergyCalc.js';

const PANEL_THICKNESS = 0.04;
const SURFACE_OFFSET  = 0.025;
const EDGE_MARGIN     = 0.02;   // safe clearance from roof edges (metres)

/**
 * Checks whether a rectangular panel (centre pr,pu; half-sides pw/2, ph/2)
 * fits inside a convex polygon with at least edgeMargin clearance on every edge.
 * Per-edge margin = edgeMargin + |pw/2·nx| + |ph/2·ny|, which is the exact
 * clearance needed so every corner of the axis-aligned panel stays inside.
 */
function panelFitsInConvex2D(pr, pu, pw, ph, verts2d, edgeMargin) {
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
    let nx = -ey / len, ny = ex / len;
    if ((cr - a.r) * nx + (cu - a.u) * ny < 0) { nx = -nx; ny = -ny; }
    // Half-extent of the panel perpendicular to this edge (worst-case corner)
    const halfExtent = Math.abs(pw / 2 * nx) + Math.abs(ph / 2 * ny);
    const dot = (pr - a.r) * nx + (pu - a.u) * ny;
    if (dot < edgeMargin + halfExtent) return false;
  }
  return true;
}

// Photovoltaic cell texture (canvas-generated) — monocrystalline silicon
let _panelTexture = null;
function getPanelTexture() {
  if (_panelTexture) return _panelTexture;

  const W = 1024, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Anti-reflective coating base — deep blue-black
  ctx.fillStyle = '#060d1c';
  ctx.fillRect(0, 0, W, H);

  const cols = 6, rows = 10;
  const cellW = W / cols, cellH = H / rows;
  const pad = 7; // encapsulant grid lines

  const clamp = v => Math.max(0, Math.min(255, v));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + pad;
      const y = r * cellH + pad;
      const cw = cellW - pad * 2;
      const ch = cellH - pad * 2;

      // Per-cell slight variation (simulates wafer-to-wafer differences)
      const cellVar = Math.sin(r * 2.1 + c * 3.7) * 0.5 + 0.5;

      // Monocrystalline silicon base — dark navy with subtle blue shift
      const grad = ctx.createLinearGradient(x, y, x + cw * 0.7, y + ch * 0.7);
      const rb = clamp(6  + cellVar * 8);
      const gb = clamp(14 + cellVar * 14);
      const bb = clamp(42 + cellVar * 28);
      grad.addColorStop(0,   `rgb(${rb+4},${gb+8},${bb+12})`);
      grad.addColorStop(0.45,`rgb(${rb},${gb},${bb})`);
      grad.addColorStop(1,   `rgb(${clamp(rb-2)},${clamp(gb-4)},${clamp(bb-8)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cw, ch);

      // Anti-reflective coating iridescence — thin film interference effect
      const irid = ctx.createLinearGradient(x, y, x + cw, y + ch * 0.5);
      irid.addColorStop(0,   `rgba(${40+cellVar*30},${70+cellVar*50},${160+cellVar*40},${0.05+cellVar*0.07})`);
      irid.addColorStop(0.5, `rgba(20,50,120,0.02)`);
      irid.addColorStop(1,   `rgba(5,10,40,0.03)`);
      ctx.fillStyle = irid;
      ctx.fillRect(x, y, cw, ch);

      // Bus bars — 3 vertical silver conductors per cell
      ctx.strokeStyle = `rgba(210,220,228,${0.55 + cellVar * 0.1})`;
      ctx.lineWidth = 2.5;
      for (let b = 1; b <= 3; b++) {
        const bx = x + b * cw / 4;
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y + ch); ctx.stroke();
        // Busbar highlight
        ctx.strokeStyle = `rgba(240,248,255,${0.18 + cellVar * 0.08})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(bx - 1, y); ctx.lineTo(bx - 1, y + ch); ctx.stroke();
        ctx.strokeStyle = `rgba(210,220,228,${0.55 + cellVar * 0.1})`;
        ctx.lineWidth = 2.5;
      }

      // Fingers — thin horizontal silver lines (screen-printed contacts)
      ctx.strokeStyle = `rgba(190,205,215,0.22)`;
      ctx.lineWidth = 0.6;
      const numFingers = 14;
      for (let f = 1; f < numFingers; f++) {
        const fy = y + f * ch / numFingers;
        ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x + cw, fy); ctx.stroke();
      }
    }
  }

  // Encapsulant grid (EVA resin between cells) — dark blue-grey lines
  ctx.strokeStyle = 'rgba(4, 8, 20, 0.95)';
  ctx.lineWidth = pad;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * cellW, 0); ctx.lineTo(c * cellW, H); ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * cellH); ctx.lineTo(W, r * cellH); ctx.stroke();
  }

  // Tempered glass reflection — subtle diagonal sheen across whole panel
  const glassSheen = ctx.createLinearGradient(0, 0, W * 0.55, H * 0.55);
  glassSheen.addColorStop(0,   'rgba(160, 200, 255, 0.07)');
  glassSheen.addColorStop(0.25,'rgba(100, 150, 220, 0.03)');
  glassSheen.addColorStop(0.6, 'rgba(0, 10, 40, 0.02)');
  glassSheen.addColorStop(1,   'rgba(0, 0, 0, 0.04)');
  ctx.fillStyle = glassSheen;
  ctx.fillRect(0, 0, W, H);

  _panelTexture = new THREE.CanvasTexture(canvas);
  _panelTexture.anisotropy = 16;
  return _panelTexture;
}

let _panelMat = null;
function getPanelMaterial() {
  if (_panelMat) return _panelMat;
  _panelMat = new THREE.MeshStandardMaterial({
    map: getPanelTexture(),
    roughness: 0.06,       // tempered glass — very smooth
    metalness: 0.25,       // semiconductor/glass, nie kov
    envMapIntensity: 1.8,  // silný odraz okolia cez sklo
    color: 0xffffff
  });
  return _panelMat;
}

// Anodizovaný hliníkový rám
const frameMat = new THREE.MeshStandardMaterial({
  color: 0xa8aeb5, roughness: 0.3, metalness: 0.88
});

/**
 * Returns an iteration order for (row, col) pairs based on fill strategy.
 */
function getIterationOrder(strategy, rows, cols) {
  const cells = [];
  if (strategy === 'top-down') {
    for (let r = rows - 1; r >= 0; r--)
      for (let c = 0; c < cols; c++)
        cells.push([r, c]);
  } else if (strategy === 'center-out') {
    const cr = (rows - 1) / 2;
    const cc = (cols - 1) / 2;
    const all = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        all.push({ r, c, d: (r - cr) ** 2 + (c - cc) ** 2 });
    all.sort((a, b) => a.d - b.d);
    for (const { r, c } of all) cells.push([r, c]);
  } else {
    // bottom-up (default)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        cells.push([r, c]);
  }
  return cells;
}

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
      maxPanels     = Infinity,
      perFaceConfig = [],
      fillStrategy  = 'bottom-up',
      sideTiltDeg   = 0,
    } = config;

    for (let i = 0; i < faces.length; i++) {
      if (this.panels.length >= maxPanels) break;
      const gd = gridData[i] || {};
      const fc = perFaceConfig[i] || {};
      const orient = fc.panelOrientation || 'portrait';
      const strategy = fc.fillStrategy || fillStrategy;
      const isLandscape = orient === 'landscape';
      const isMixed = orient === 'alt-rows';
      const pw = isLandscape ? panelH : panelW;
      const ph = isLandscape ? panelW : panelH;
      const prevCount = this.panels.length;
      this._placePanelsOnFace(
        faces[i], efficiency, gapSize, pw, ph,
        placementMode,
        gd.enabledCells  || null,
        gd.blockedCells  || new Set(),
        flatTiltDeg, equatorDir, flatLayout,
        maxPanels, strategy, isMixed ? orient : null, panelW, panelH,
        sideTiltDeg
      );
      // Tag newly placed panels with their source face for boundary visualization
      for (let j = prevCount; j < this.panels.length; j++) {
        this.panels[j].userData.face = faces[i];
      }
    }
    return this.panels;
  }

  _placePanelsOnFace(face, efficiency, gapSize, panelW, panelH,
                     placementMode, enabledCells, blockedCells,
                     flatTiltDeg = 0, equatorDir = null, flatLayout = 'south',
                     maxPanels = Infinity, fillStrategy = 'bottom-up',
                     mixedLayout = null, basePanelW = panelW, basePanelH = panelH,
                     sideTiltDeg = 0) {
    const { center, normal, rightDir, upDir, width, height, orientation, energyNormal, verts2d } = face;

    // Tilt is only meaningful on truly flat faces — use a strict threshold
    // (flat roof normal.y ≈ 1.0, whereas a 30° slope has normal.y = cos30° ≈ 0.866)
    const isFlatRoof = Math.abs(normal.y) > 0.97;
    const tiltRad    = (isFlatRoof && flatTiltDeg > 0 && equatorDir)
      ? flatTiltDeg * Math.PI / 180 : 0;
    const cosT = Math.cos(tiltRad);
    const sinT = Math.sin(tiltRad);

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
        if (this.panels.length >= maxPanels) return;
        if (verts2d && !panelFitsInConvex2D(pr, pu, panelW, panelH, verts2d, EDGE_MARGIN)) return;
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

      const ewOrder = getIterationOrder(fillStrategy, rows, cols);
      for (const [r, c] of ewOrder) {
        const cellIdx = r * cols + c;
        if (blockedCells.has(cellIdx)) continue;
        if (placementMode === 'manual' && enabledCells !== null && !enabledCells.has(cellIdx)) continue;
        const pu = startU + r * pairStepU;
        const ridgeR = startR + c * pairStepR;
        addMesh(ridgeR + panelH / 2 * cosT, pu, east.quat, east.n);  // east panel
        addMesh(ridgeR - panelH / 2 * cosT, pu, west.quat, west.n);  // west panel
      }
      return;
    }

    // Panel rotation (shared by all south/single-tilt layouts)
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

      // Side tilt: rotate panel around the face's up-slope axis (tilts panel east/west)
      if (!isFlatRoof && sideTiltDeg !== 0) {
        const sideTiltRad = sideTiltDeg * Math.PI / 180;
        const sideTiltQ = new THREE.Quaternion().setFromAxisAngle(upDir.clone().normalize(), sideTiltRad);
        panelNormal = panelNormal.clone().applyQuaternion(sideTiltQ).normalize();
        quat.premultiply(sideTiltQ);
      }
    }

    // ── Max Fill layout: try every portrait/landscape split, pick best ────
    // Tries all combinations of N portrait rows + M landscape rows that fit
    // within the available height, and picks whichever yields the most panels.
    if (mixedLayout === 'alt-rows') {
      const pW = basePanelW, pH = basePanelH;  // portrait dims
      const lW = basePanelH, lH = basePanelW;  // landscape dims (swapped)

      const pStepW = pW + gapSize;
      const pStepH = pH + gapSize;
      const lStepW = lW + gapSize;
      const lStepH = lH + gapSize;
      const pCols  = Math.max(1, Math.floor(width / pStepW));
      const lCols  = Math.max(1, Math.floor(width / lStepW));

      const maxPortraitRows  = Math.floor(height / pStepH);
      const maxLandscapeRows = Math.floor(height / lStepH);

      // Evaluate every split: 0..maxPortraitRows portrait + fill rest with landscape
      let bestCount = 0;
      let bestNp = 0, bestNl = 0;
      for (let np = 0; np <= maxPortraitRows; np++) {
        const usedH = np * pStepH;
        const nl = Math.floor((height - usedH) / lStepH);
        const count = np * pCols + nl * lCols;
        if (count > bestCount) { bestCount = count; bestNp = np; bestNl = nl; }
      }
      // Also try all-landscape
      {
        const count = maxLandscapeRows * lCols;
        if (count > bestCount) { bestCount = count; bestNp = 0; bestNl = maxLandscapeRows; }
      }

      // Build row definitions — landscape rows at bottom, portrait rows on top
      const rowDefs = [];
      for (let r = 0; r < bestNl; r++) {
        rowDefs.push({ w: lW, h: lH, stepW: lStepW, cols: lCols, isLand: true });
      }
      for (let r = 0; r < bestNp; r++) {
        rowDefs.push({ w: pW, h: pH, stepW: pStepW, cols: pCols, isLand: false });
      }

      // Total height and row centers
      let totalH = 0;
      for (let r = 0; r < rowDefs.length; r++) {
        totalH += rowDefs[r].h;
        if (r < rowDefs.length - 1) totalH += gapSize;
      }

      const rowCenters = [];
      let curU = -totalH / 2;
      for (const rd of rowDefs) {
        curU += rd.h / 2;
        rowCenters.push(curU);
        curU += rd.h / 2 + gapSize;
      }

      // Place panels using fill strategy on portrait rows, then landscape
      const maxCols = Math.max(pCols, lCols);
      const order = getIterationOrder(fillStrategy, rowDefs.length, maxCols);
      for (const [r, c] of order) {
        if (this.panels.length >= maxPanels) return;
        if (r >= rowDefs.length) continue;
        const rd = rowDefs[r];
        if (c >= rd.cols) continue;

        const cellIdx = r * maxCols + c;
        const totalW  = rd.cols * rd.stepW - gapSize;
        const startR  = -totalW / 2 + rd.w / 2;
        const pr = startR + c * rd.stepW;
        const pu = rowCenters[r];

        if (verts2d && !panelFitsInConvex2D(pr, pu, rd.w, rd.h, verts2d, EDGE_MARGIN)) continue;
        if (blockedCells.has(cellIdx)) continue;
        if (placementMode === 'manual' && enabledCells !== null && !enabledCells.has(cellIdx)) continue;

        const pos = center.clone()
          .addScaledVector(rightDir, pr)
          .addScaledVector(upDir,    pu)
          .addScaledVector(normal,   normalOffset);

        const geom      = new THREE.BoxGeometry(rd.w, PANEL_THICKNESS, rd.h);
        const materials = [frameMat, frameMat, mat, frameMat, frameMat, frameMat];
        const mesh      = new THREE.Mesh(geom, materials);
        mesh.position.copy(pos);
        mesh.quaternion.copy(quat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name       = `panel_${orientation}_r${r}_c${c}`;
        mesh.userData   = { normal: panelNormal.clone(), efficiency, area: rd.w * rd.h, shadingFactor: 0, faceOrientation: orientation };
        this.group.add(mesh);
        this.panels.push(mesh);
      }
      return;
    }

    // ── Standard uniform grid (portrait / landscape) ──────────────────────
    const stepW = panelW + gapSize;
    const stepH = panelH + gapSize;

    const cols   = Math.max(1, Math.floor(width  / stepW));
    const rows   = Math.max(1, Math.floor(height / stepH));
    const totalW = cols * stepW - gapSize;
    const startR = -totalW / 2 + panelW / 2;

    const totalH = rows * stepH - gapSize;
    let startU   = -totalH / 2 + panelH / 2;

    const southOrder = getIterationOrder(fillStrategy, rows, cols);
    for (const [r, c] of southOrder) {
      if (this.panels.length >= maxPanels) return;
      const cellIdx = r * cols + c;
      const pr = startR + c * stepW;
      const pu = startU + r * stepH;

      if (verts2d && !panelFitsInConvex2D(pr, pu, panelW, panelH, verts2d, EDGE_MARGIN)) continue;
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

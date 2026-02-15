/**
 * PanelGrid.js
 * Manual panel placement grid overlay.
 * Shows colored cells on a selected roof face; numpad navigates and toggles cells.
 */

import * as THREE from 'three';

const CELL_EMPTY   = 0;
const CELL_ACTIVE  = 1;
const CELL_BLOCKED = 2;

const COL_EMPTY   = new THREE.Color(0.15, 0.15, 0.18);
const COL_ACTIVE  = new THREE.Color(0.10, 0.42, 0.90);
const COL_BLOCKED = new THREE.Color(0.80, 0.10, 0.10);
const COL_CURSOR  = new THREE.Color(0.95, 0.82, 0.10);

const CELL_THICK = 0.012; // overlay height above surface
const SURFACE_OFFSET = 0.036;

export class PanelGrid {
  constructor(scene) {
    this.scene        = scene;
    this._mesh        = null;
    this._face        = null;
    this._cols        = 0;
    this._rows        = 0;
    this._states      = [];         // flat [rows*cols] of CELL_* constants
    this._blocked     = new Set();  // blocked cell indices (by obstacles)
    this._cursorRow   = 0;
    this._cursorCol   = 0;
    this._active      = false;
    this._panelW      = 1.0;
    this._panelH      = 1.65;
    this._gapSize     = 0.10;
  }

  /**
   * Activate / re-activate on a face.
   * @param {Object} face - RoofSystem face descriptor
   * @param {Set<number>} enabledCells - previously enabled cell indices
   * @param {Set<number>} blockedCells - cells blocked by obstacles
   */
  activate(face, enabledCells = new Set(), blockedCells = new Set(), panelW = 1.0, panelH = 1.65, gapSize = 0.10) {
    this._face    = face;
    this._panelW  = panelW;
    this._panelH  = panelH;
    this._gapSize = gapSize;
    this._blocked = new Set(blockedCells);

    const stepW = panelW + gapSize;
    const stepH = panelH + gapSize;
    this._cols = Math.max(1, Math.floor((face.width  + gapSize) / stepW));
    this._rows = Math.max(1, Math.floor((face.height + gapSize) / stepH));

    const total = this._cols * this._rows;
    this._states = new Array(total).fill(CELL_EMPTY);

    for (const idx of enabledCells) {
      if (idx < total && !blockedCells.has(idx)) this._states[idx] = CELL_ACTIVE;
    }
    for (const idx of blockedCells) {
      if (idx < total) this._states[idx] = CELL_BLOCKED;
    }

    this._cursorRow = Math.min(this._cursorRow, this._rows - 1);
    this._cursorCol = Math.min(this._cursorCol, this._cols - 1);
    this._active = true;
    this._rebuild();
    return this;
  }

  deactivate() {
    this._removeMesh();
    this._active = false;
    return this;
  }

  isActive() { return this._active; }

  // ─── Navigation ───────────────────────────────────────────────────────────
  moveCursor(dr, dc) {
    if (!this._active) return;
    this._cursorRow = Math.max(0, Math.min(this._rows - 1, this._cursorRow + dr));
    this._cursorCol = Math.max(0, Math.min(this._cols - 1, this._cursorCol + dc));
    this._updateInstanceColors();
  }

  toggleCell() {
    if (!this._active) return;
    const idx = this._cursorRow * this._cols + this._cursorCol;
    if (this._blocked.has(idx)) return;
    this._states[idx] = this._states[idx] === CELL_ACTIVE ? CELL_EMPTY : CELL_ACTIVE;
    this._updateInstanceColors();
  }

  fillAll() {
    if (!this._active) return;
    for (let i = 0; i < this._states.length; i++) {
      if (!this._blocked.has(i)) this._states[i] = CELL_ACTIVE;
    }
    this._updateInstanceColors();
  }

  clearAll() {
    if (!this._active) return;
    for (let i = 0; i < this._states.length; i++) {
      if (!this._blocked.has(i)) this._states[i] = CELL_EMPTY;
    }
    this._updateInstanceColors();
  }

  updateBlockedCells(blockedCells) {
    this._blocked = new Set(blockedCells);
    for (let i = 0; i < this._states.length; i++) {
      if (this._blocked.has(i)) {
        this._states[i] = CELL_BLOCKED;
      } else if (this._states[i] === CELL_BLOCKED) {
        this._states[i] = CELL_EMPTY;
      }
    }
    this._updateInstanceColors();
  }

  /** Return Set of currently enabled cell indices */
  getEnabledCells() {
    const s = new Set();
    for (let i = 0; i < this._states.length; i++) {
      if (this._states[i] === CELL_ACTIVE) s.add(i);
    }
    return s;
  }

  get cols()      { return this._cols; }
  get rows()      { return this._rows; }
  get cellCount() { return this._cols * this._rows; }

  // ─── Internal ─────────────────────────────────────────────────────────────
  _rebuild() {
    this._removeMesh();
    if (!this._face) return;

    const count = this._rows * this._cols;
    if (count === 0) return;

    const cellGeom = new THREE.BoxGeometry(1, CELL_THICK, 1);
    const cellMat  = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.60,
      depthWrite: false,
    });

    this._mesh = new THREE.InstancedMesh(cellGeom, cellMat, count);
    this._mesh.name = 'panelGrid';
    this._mesh.frustumCulled = false;

    const { center, normal, rightDir, upDir } = this._face;
    const stepW = this._panelW + this._gapSize;
    const stepH = this._panelH + this._gapSize;

    const totalW = this._cols * stepW - this._gapSize;
    const totalH = this._rows * stepH - this._gapSize;
    const startR = -totalW / 2 + this._panelW / 2;
    const startU = -totalH / 2 + this._panelH / 2;

    const localZ  = new THREE.Vector3().crossVectors(rightDir, normal).normalize();
    const rotMat  = new THREE.Matrix4().makeBasis(rightDir, normal, localZ);
    const scaleW  = this._panelW  * 0.94;
    const scaleH  = this._panelH  * 0.94;

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        const pos = center.clone()
          .addScaledVector(rightDir, startR + c * stepW)
          .addScaledVector(upDir,    startU + r * stepH)
          .addScaledVector(normal,   SURFACE_OFFSET);

        dummy.position.copy(pos);
        dummy.quaternion.setFromRotationMatrix(rotMat);
        dummy.scale.set(scaleW, 1, scaleH);
        dummy.updateMatrix();
        this._mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }

    this._mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this._mesh);
    this._updateInstanceColors();
  }

  _updateInstanceColors() {
    if (!this._mesh) return;
    const col = new THREE.Color();
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        const idx     = r * this._cols + c;
        const isCursor = (r === this._cursorRow && c === this._cursorCol);
        const state    = this._states[idx] ?? CELL_EMPTY;

        if (isCursor) {
          col.copy(COL_CURSOR);
        } else if (state === CELL_ACTIVE) {
          col.copy(COL_ACTIVE);
        } else if (state === CELL_BLOCKED) {
          col.copy(COL_BLOCKED);
        } else {
          col.copy(COL_EMPTY);
        }

        this._mesh.setColorAt(idx, col);
      }
    }
    if (this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;
  }

  _removeMesh() {
    if (!this._mesh) return;
    this.scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh.material.dispose();
    this._mesh = null;
  }

  dispose() {
    this._removeMesh();
  }
}

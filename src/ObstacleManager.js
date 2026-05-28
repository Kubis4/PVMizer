/**
 * ObstacleManager.js
 * Manages obstacle placement (chimney, skylight, HVAC, tree, utility pole).
 * Handles raycasting placement, 3D model creation, exclusion zones, and shading.
 */

import * as THREE from 'three';

// Obstacle type definitions
// footprint = physical bounding radius of the obstacle model at scale 1.0
export const OBSTACLE_TYPES = {
  chimney:   { label: 'Chimney',      icon: '🧱', roofOnly: true,  footprint: 0.40, shadingFactor: 0.15 },
  skylight:  { label: 'Skylight',     icon: '🪟', roofOnly: true,  footprint: 0.42, shadingFactor: 0.05 },
  hvac:      { label: 'HVAC Unit',    icon: '❄',  roofOnly: true,  footprint: 0.72, shadingFactor: 0.10 },
  tree:      { label: 'Pine Tree',    icon: '🌲', roofOnly: false, footprint: 1.10, shadingFactor: 0.40 },
  leaftree:  { label: 'Leaf Tree',    icon: '🌳', roofOnly: false, footprint: 1.30, shadingFactor: 0.45 },
  pole:      { label: 'Utility Pole', icon: '⚡', roofOnly: false, footprint: 0.15, shadingFactor: 0.20 },
};

export class ObstacleManager {
  constructor(scene) {
    this.scene      = scene;
    this._obstacles = [];       // { id, type, group, position, footprint, shadingFactor }
    this._activeTool = null;    // current placement tool type string or null
    this._selected   = null;    // selected obstacle object
    this._nextId     = 1;
    this._previewGroup = null;  // preview ghost while placing

    // Drag state
    this._isDragging  = false;
    this._dragObs     = null;

    // Shared raycaster
    this._raycaster = new THREE.Raycaster();
  }

  // ─── Tool Management ────────────────────────────────────────────────────
  activateTool(type) {
    this._activeTool = OBSTACLE_TYPES[type] ? type : null;
    this._removePreview();
    document.body.style.cursor = this._activeTool ? 'crosshair' : '';
  }

  cancelTool() {
    this._activeTool = null;
    this._removePreview();
    document.body.style.cursor = '';
  }

  getActiveTool() { return this._activeTool; }

  // ─── Drag to move ────────────────────────────────────────────────────────
  /**
   * Begin dragging the given obstacle. Called when pointerdown hits a selected obstacle.
   */
  startDrag(obs) {
    this._isDragging = true;
    this._dragObs    = obs;
    document.body.style.cursor = 'grabbing';
  }

  /**
   * Update drag: move the obstacle to the cursor's raycast position.
   * @returns {boolean} true if a drag update occurred
   */
  updateDrag(ndc, camera, roofMeshes, groundMesh) {
    if (!this._isDragging || !this._dragObs) return false;
    const typeDef = OBSTACLE_TYPES[this._dragObs.type];
    const targets = typeDef.roofOnly ? roofMeshes : [groundMesh];
    this._raycaster.setFromCamera(ndc, camera);
    const hits = this._raycaster.intersectObjects(targets, false);
    if (!hits.length) return false;

    const pos = hits[0].point;
    const hitNormal = hits[0].face
      ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    this._dragObs.position.copy(pos);
    this._dragObs.group.position.copy(pos);
    // Compute pure surface alignment quaternion (without any spin)
    const surfaceQuat = this._computeSurfaceQuat(this._dragObs.type, hitNormal);
    this._dragObs._surfaceQuat   = surfaceQuat;
    this._dragObs._surfaceNormal = hitNormal.clone();
    // Apply surface alignment + existing rotation
    this._dragObs.group.quaternion.copy(surfaceQuat);
    if (this._dragObs.rotationY) {
      const spin = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, this._dragObs.rotationY * Math.PI / 180, 0));
      this._dragObs.group.quaternion.multiply(spin);
    }
    return true;
  }

  /**
   * End drag. Returns true if a drag was in progress (panels should be rebuilt).
   */
  endDrag() {
    const wasDragging = this._isDragging;
    this._isDragging  = false;
    this._dragObs     = null;
    document.body.style.cursor = this._activeTool ? 'crosshair' : '';
    return wasDragging;
  }

  isDragging() { return this._isDragging; }

  // ─── Mouse interaction ───────────────────────────────────────────────────
  /**
   * Call from main pointerdown. Returns placed obstacle or null.
   * @param {THREE.Vector2} ndc  Normalized device coords (-1 to 1)
   * @param {THREE.Camera}  camera
   * @param {THREE.Mesh[]}  roofMeshes  all roof face meshes
   * @param {THREE.Mesh}    groundMesh
   */
  handleClick(ndc, camera, roofMeshes, groundMesh) {
    // Check if clicking existing obstacle to select it
    if (!this._activeTool) {
      const obstacleMeshes = this._obstacles.flatMap(o => {
        const arr = [];
        o.group.traverse(m => { if (m.isMesh) arr.push(m); });
        return arr;
      });
      if (obstacleMeshes.length) {
        this._raycaster.setFromCamera(ndc, camera);
        const hits = this._raycaster.intersectObjects(obstacleMeshes, false);
        if (hits.length) {
          const hitMesh = hits[0].object;
          // Find which obstacle group this mesh belongs to
          for (const obs of this._obstacles) {
            let found = false;
            obs.group.traverse(m => { if (m === hitMesh) found = true; });
            if (found) {
              this._selectObstacle(obs);
              return null;
            }
          }
        }
      }
      // Click on empty space → deselect
      this._deselectObstacle();
      return null;
    }

    // Placement mode: raycast against appropriate surfaces
    const typeDef    = OBSTACLE_TYPES[this._activeTool];
    const targets    = typeDef.roofOnly ? roofMeshes : [groundMesh];
    this._raycaster.setFromCamera(ndc, camera);
    const hits = this._raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;

    const hitPoint = hits[0].point;
    const hitNormal = hits[0].face
      ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    const obs = this._placeObstacle(this._activeTool, hitPoint, hitNormal);
    return obs;
  }

  /** Update preview ghost on mouse move */
  handleMouseMove(ndc, camera, roofMeshes, groundMesh) {
    if (!this._activeTool) return;
    const typeDef = OBSTACLE_TYPES[this._activeTool];
    const targets = typeDef.roofOnly ? roofMeshes : [groundMesh];
    this._raycaster.setFromCamera(ndc, camera);
    const hits = this._raycaster.intersectObjects(targets, false);

    if (!hits.length) {
      this._removePreview();
      return;
    }

    const pos = hits[0].point;
    const hitNormal = hits[0].face
      ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    if (!this._previewGroup) {
      this._previewGroup = this._buildModel(this._activeTool, true);
      this.scene.add(this._previewGroup);
    }
    this._previewGroup.position.copy(pos);
    this._alignGroupToSurface(this._previewGroup, this._activeTool, hitNormal);
  }

  // ─── Obstacle operations ─────────────────────────────────────────────────
  // Compute pure surface alignment quaternion (without modifying any group)
  _computeSurfaceQuat(type, hitNormal) {
    if (['chimney', 'tree', 'leaftree', 'pole'].includes(type)) {
      return new THREE.Quaternion(); // identity — these stand upright
    }
    const up = new THREE.Vector3(0, 1, 0);
    if (hitNormal.dot(up) < 0.9999) {
      return new THREE.Quaternion().setFromUnitVectors(up, hitNormal);
    }
    return new THREE.Quaternion();
  }

  // Rotate group so its local +Y aligns with hitNormal (skip for chimney/tree/pole)
  _alignGroupToSurface(group, type, hitNormal) {
    const q = this._computeSurfaceQuat(type, hitNormal);
    group.quaternion.copy(q);
  }

  _placeObstacle(type, position, hitNormal) {
    const typeDef = OBSTACLE_TYPES[type];
    const group   = this._buildModel(type, false);
    group.position.copy(position);
    this._alignGroupToSurface(group, type, hitNormal);
    this.scene.add(group);

    const obs = {
      id:            this._nextId++,
      type,
      group,
      position:      position.clone(),
      footprint:     typeDef.footprint,
      shadingFactor: typeDef.shadingFactor,
      scale:         1.0,
      rotationY:     0,
      _surfaceQuat:  group.quaternion.clone(),   // surface alignment before any spin
      _surfaceNormal: hitNormal.clone(),          // normal of the surface it was placed on
    };
    this._obstacles.push(obs);
    this._selectObstacle(obs);
    return obs;
  }

  deleteSelected() {
    if (!this._selected) return;
    this._removeObstacle(this._selected);
    this._selected = null;
  }

  deleteAll() {
    for (const obs of [...this._obstacles]) {
      this._removeObstacle(obs);
    }
    this._selected = null;
  }

  _removeObstacle(obs) {
    this.scene.remove(obs.group);
    obs.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    this._obstacles = this._obstacles.filter(o => o !== obs);
    if (this._selected === obs) this._selected = null;
  }

  _selectObstacle(obs) {
    this._deselectObstacle();
    this._selected = obs;
    obs.group.traverse(m => {
      if (m.isMesh) {
        m.userData._origEmissive = m.material.emissive ? m.material.emissive.clone() : null;
        if (m.material.emissive) m.material.emissive.set(0x224422);
      }
    });
    if (typeof this.onSelect === 'function') this.onSelect(obs);
  }

  _deselectObstacle() {
    if (!this._selected) return;
    this._selected.group.traverse(m => {
      if (m.isMesh && m.userData._origEmissive && m.material.emissive) {
        m.material.emissive.copy(m.userData._origEmissive);
      }
    });
    this._selected = null;
    if (typeof this.onSelect === 'function') this.onSelect(null);
  }

  _removePreview() {
    if (!this._previewGroup) return;
    this.scene.remove(this._previewGroup);
    this._previewGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    this._previewGroup = null;
  }

  // ─── Exclusion zones ─────────────────────────────────────────────────────
  /**
   * For a given face, return the set of grid cell indices blocked by obstacles.
   * @param {Object} face - RoofSystem face descriptor
   * @param {number} panelW
   * @param {number} panelH
   * @param {number} gapSize
   * @returns {Set<number>}
   */
  /**
   * Returns the Set of cell indices blocked by obstacles on a face.
   * Options must mirror the parameters used by SolarPanels._placePanelsOnFace
   * so that cell indices match exactly (important when panels are tilted).
   */
  getBlockedCells(face, panelW = 1.0, panelH = 1.65, gapSize = 0.10, opts = {}) {
    const {
      isFlatRoof  = false,
      flatTiltDeg = 0,
      equatorDir  = null,
      flatLayout  = 'south',
    } = opts;

    const EDGE_MARGIN = 0.05;
    const tiltRad = (isFlatRoof && flatTiltDeg > 0 && equatorDir)
      ? flatTiltDeg * Math.PI / 180 : 0;
    const cosT = Math.cos(tiltRad);
    const sinT = Math.sin(tiltRad);

    const heightAbove = 0.025 + panelH / 2 * sinT;
    const panelHalf   = Math.min(panelW, panelH) * 0.5 + heightAbove * 0.5;

    let cols, rows, startR, startU, stepW, stepH;

    if (isFlatRoof && flatLayout === 'east-west') {
      // Mirror E-W grid from _placePanelsOnFace (handles 0° tilt too)
      const pairFoot = 2 * panelH * cosT;
      stepW  = pairFoot + gapSize;
      stepH  = panelW   + gapSize;
      cols   = Math.max(1, Math.floor(face.width  / stepW));
      rows   = Math.max(1, Math.floor(face.height / stepH));
      const totalW = cols * stepW - gapSize;
      const totalU = rows * stepH - gapSize;
      startR = -totalW / 2 + pairFoot / 2;
      startU = -totalU / 2 + panelW  / 2;
    } else {
      // Constant stepH regardless of tilt — matches SolarPanels behaviour
      stepW = panelW + gapSize;
      stepH = panelH + gapSize;
      cols  = Math.max(1, Math.floor(face.width  / stepW));
      rows  = Math.max(1, Math.floor(face.height / stepH));
      const totalW = cols * stepW - gapSize;
      startR = -totalW / 2 + panelW / 2;
      const totalH = rows * stepH - gapSize;
      startU = -totalH / 2 + panelH / 2;
    }

    const blocked = new Set();
    for (const obs of this._obstacles) {
      // Skip obstacles placed on a surface not aligned with this face (e.g. wall obstacle vs roof face)
      if (obs._surfaceNormal && obs._surfaceNormal.dot(face.normal) < 0.3) continue;

      const toObs = obs.position.clone().sub(face.center);
      const obsR  = toObs.dot(face.rightDir);
      const obsU  = toObs.dot(face.upDir);
      const dist  = Math.abs(toObs.dot(face.normal));
      if (dist > 3.0) continue;

      const blockR = obs.footprint + panelHalf;

      if (isFlatRoof && flatLayout === 'east-west') {
        // E-W pair cells span two individual panels side by side.
        // Check both individual panel centers so an obstacle near either panel of the pair is caught.
        const halfPairR = panelH * cosT / 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cellR = startR + c * stepW;   // center of the E-W pair
            const cellU = startU + r * stepH;
            for (const offsetR of [-halfPairR, halfPairR]) {
              const dr = (cellR + offsetR) - obsR;
              const du = cellU - obsU;
              if (Math.sqrt(dr * dr + du * du) < blockR) {
                blocked.add(r * cols + c);
                break;
              }
            }
          }
        }
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cellR = startR + c * stepW;
            const cellU = startU + r * stepH;
            const dr = cellR - obsR, du = cellU - obsU;
            if (Math.sqrt(dr * dr + du * du) < blockR) {
              blocked.add(r * cols + c);
            }
          }
        }
      }
    }
    return blocked;
  }

  /** Scale the currently selected obstacle and update its effective footprint. */
  setSelectedScale(scale) {
    if (!this._selected) return;
    this._selected.scale = scale;
    this._selected.group.scale.setScalar(scale);
    this._selected.footprint = OBSTACLE_TYPES[this._selected.type].footprint * scale;
  }

  getSelectedScale() {
    return this._selected ? (this._selected.scale || 1.0) : 1.0;
  }

  /** Scale skylight width (X) and length (Z) independently. */
  setSelectedScaleXZ(scaleX, scaleZ) {
    if (!this._selected) return;
    this._selected.scaleX = scaleX;
    this._selected.scaleZ = scaleZ;
    this._selected.group.scale.x = scaleX;
    this._selected.group.scale.z = scaleZ;
    this._selected.footprint = OBSTACLE_TYPES[this._selected.type].footprint * Math.max(scaleX, scaleZ);
  }

  getSelectedScaleX() { return this._selected ? (this._selected.scaleX || 1.0) : 1.0; }
  getSelectedScaleZ() { return this._selected ? (this._selected.scaleZ || 1.0) : 1.0; }

  /** Rotate the currently selected obstacle around its local Y axis (degrees). */
  setSelectedRotation(deg) {
    if (!this._selected) return;
    this._selected.rotationY = deg;
    // Apply rotation around world Y while preserving surface alignment quaternion
    const surface = this._selected._surfaceQuat || new THREE.Quaternion();
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, deg * Math.PI / 180, 0));
    this._selected.group.quaternion.copy(surface).multiply(spin);
  }

  getSelectedRotation() {
    return this._selected ? (this._selected.rotationY || 0) : 0;
  }

  /**
   * Check if a panel is shaded by any obstacle.
   * Returns shading factor (0 = no shade, 1 = fully shaded).
   * Uses raycasting from panel center toward sun.
   */
  getShadingFactor(panelWorldPos, sunDirection) {
    if (this._obstacles.length === 0 || sunDirection.y <= 0) return 0;

    const obstacleMeshes = [];
    for (const obs of this._obstacles) {
      obs.group.traverse(m => { if (m.isMesh) obstacleMeshes.push(m); });
    }
    if (!obstacleMeshes.length) return 0;

    this._raycaster.set(panelWorldPos, sunDirection);
    this._raycaster.far = 50;
    const hits = this._raycaster.intersectObjects(obstacleMeshes, false);
    if (!hits.length) return 0;

    // Return max shading factor of closest obstacle
    let maxFactor = 0;
    for (const obs of this._obstacles) {
      let belongs = false;
      obs.group.traverse(m => { if (hits.some(h => h.object === m)) belongs = true; });
      if (belongs) maxFactor = Math.max(maxFactor, obs.shadingFactor);
    }
    return maxFactor;
  }

  get obstacles() { return this._obstacles; }
  get selected()  { return this._selected; }

  /** Serialize all obstacles to plain objects for project save */
  serialize() {
    return this._obstacles.map(obs => ({
      type:        obs.type,
      position:    { x: obs.position.x, y: obs.position.y, z: obs.position.z },
      scale:       obs.scale,
      scaleX:      obs.scaleX,
      scaleZ:      obs.scaleZ,
      rotationY:   obs.rotationY,
      surfaceQuat: {
        x: obs._surfaceQuat.x, y: obs._surfaceQuat.y,
        z: obs._surfaceQuat.z, w: obs._surfaceQuat.w,
      },
    }));
  }

  /** Restore an obstacle from serialized data (project load) */
  loadObstacle(data) {
    const typeDef = OBSTACLE_TYPES[data.type];
    if (!typeDef) return;

    const group = this._buildModel(data.type, false);
    const pos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    group.position.copy(pos);

    // Restore surface alignment quaternion
    const surfQ = new THREE.Quaternion(
      data.surfaceQuat.x, data.surfaceQuat.y,
      data.surfaceQuat.z, data.surfaceQuat.w
    );

    // Apply scale (skylight supports independent X/Z scaling)
    const s  = data.scale  || 1.0;
    const sx = data.scaleX || s;
    const sz = data.scaleZ || s;
    group.scale.set(sx, s, sz);

    // Apply rotation: surface alignment + Y spin
    const spin = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, (data.rotationY || 0) * Math.PI / 180, 0)
    );
    group.quaternion.copy(surfQ).multiply(spin);

    this.scene.add(group);

    // Derive the surface normal from the saved surface quaternion (+Y rotated by surfQ)
    const surfaceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(surfQ).normalize();

    const obs = {
      id:            this._nextId++,
      type:          data.type,
      group,
      position:      pos,
      footprint:     typeDef.footprint * Math.max(sx, sz),
      shadingFactor: typeDef.shadingFactor,
      scale:         s,
      scaleX:        sx,
      scaleZ:        sz,
      rotationY:     data.rotationY || 0,
      _surfaceQuat:  surfQ,
      _surfaceNormal: surfaceNormal,
    };
    this._obstacles.push(obs);
  }

  // ─── 3D Model builders ───────────────────────────────────────────────────
  _buildModel(type, isPreview) {
    const group = new THREE.Group();
    group.name = type;

    const opac = isPreview ? 0.45 : 1.0;
    const transp = isPreview;

    switch (type) {
      case 'chimney':  this._buildChimney(group, opac, transp);  break;
      case 'skylight': this._buildSkylight(group, opac, transp); break;
      case 'hvac':     this._buildHVAC(group, opac, transp);     break;
      case 'tree':     this._buildTree(group, opac, transp);     break;
      case 'leaftree': this._buildLeafTree(group, opac, transp); break;
      case 'pole':     this._buildPole(group, opac, transp);     break;
    }

    group.traverse(m => {
      if (m.isMesh) {
        m.castShadow    = !isPreview;
        m.receiveShadow = !isPreview;
      }
    });

    return group;
  }

  _mat(color, roughness = 0.85, metalness = 0.0, opacity = 1.0, transparent = false) {
    return new THREE.MeshStandardMaterial({
      color, roughness, metalness,
      opacity, transparent: transparent || opacity < 1.0,
    });
  }

  _buildChimney(group, opacity, transparent) {
    // Main stack (slightly tapered)
    const body   = new THREE.BoxGeometry(0.55, 1.70, 0.55);
    const cap    = new THREE.BoxGeometry(0.72, 0.08, 0.72);
    const mat    = this._mat(0x8B4513, 0.9, 0.0, opacity, transparent);
    const capMat = this._mat(0x555555, 0.95, 0.0, opacity, transparent);

    // Body
    const bodyMesh = new THREE.Mesh(body, mat);
    bodyMesh.position.y = 0.85;
    group.add(bodyMesh);

    // Cap
    const capMesh = new THREE.Mesh(cap, capMat);
    capMesh.position.y = 1.74;
    group.add(capMesh);

    // Brick pattern: add thin overlay rectangles
    const brickMat = this._mat(0xa0522d, 0.95, 0.0, opacity * 0.5, true);
    for (let row = 0; row < 8; row++) {
      const brick = new THREE.BoxGeometry(0.56, 0.08, 0.01);
      const brickMesh = new THREE.Mesh(brick, brickMat);
      const offset = (row % 2) * 0.14;
      brickMesh.position.set(offset * 0.1, 0.12 + row * 0.20, 0.281);
      group.add(brickMesh);
    }
  }

  _buildSkylight(group, opacity, transparent) {
    // Glass box — solid geometry like HVAC body provides a reliable raycast target.
    // A flat BoxGeometry is more dependable than PlaneGeometry for click detection.
    const glassMat = this._mat(0x88ccff, 0.05, 0.3, opacity * 0.45, true);
    const glass    = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.82), glassMat);
    glass.position.y = 0.04;
    group.add(glass);

    // Metal frame (4 bars)
    const frameMat = this._mat(0x888888, 0.4, 0.8, opacity, transparent);
    const frY = 0.06;
    const frameConfigs = [
      { pos: [0, frY,  0.40], rot: [0,0,0],           scale: [0.82, 0.04, 0.04] },
      { pos: [0, frY, -0.40], rot: [0,0,0],           scale: [0.82, 0.04, 0.04] },
      { pos: [ 0.40, frY, 0], rot: [0, Math.PI/2, 0], scale: [0.82, 0.04, 0.04] },
      { pos: [-0.40, frY, 0], rot: [0, Math.PI/2, 0], scale: [0.82, 0.04, 0.04] },
    ];
    for (const fc of frameConfigs) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), frameMat);
      bar.position.set(...fc.pos);
      bar.rotation.set(...fc.rot);
      bar.scale.set(...fc.scale);
      group.add(bar);
    }
  }

  _buildHVAC(group, opacity, transparent) {
    const bodyMat  = this._mat(0xdddddd, 0.7, 0.2, opacity, transparent);
    const grillMat = this._mat(0xaaaaaa, 0.9, 0.1, opacity, transparent);
    const fanMat   = this._mat(0x777777, 0.6, 0.5, opacity, transparent);

    // Body box
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 1.0), bodyMat);
    body.position.y = 0.28;
    group.add(body);

    // Grill (front face overlay)
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.02), grillMat);
      slat.position.set(0, 0.10 + i * 0.085, 0.51);
      group.add(slat);
    }

    // Fan disc on top
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.04, 16), fanMat);
    fan.position.y = 0.58;
    group.add(fan);

    // Fan blades
    const bladeMat = this._mat(0x555555, 0.5, 0.4, opacity, transparent);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.06), bladeMat);
      blade.position.y = 0.60;
      blade.rotation.y = (i / 4) * Math.PI * 2;
      blade.position.x = Math.sin(blade.rotation.y) * 0.12;
      blade.position.z = Math.cos(blade.rotation.y) * 0.12;
      group.add(blade);
    }
  }

  _buildTree(group, opacity, transparent) {
    // Trunk
    const trunkMat  = this._mat(0x5c3a1e, 0.95, 0.0, opacity, transparent);
    const trunk     = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.18, 1.60, 8), trunkMat
    );
    trunk.position.y = 0.80;
    group.add(trunk);

    // Foliage (3 stacked cones, decreasing size upward)
    const foliageColors = [0x1a4a1a, 0x226622, 0x2d7a2d];
    const foliageData   = [
      { r: 1.10, h: 1.50, y: 1.40 },
      { r: 0.85, h: 1.30, y: 2.30 },
      { r: 0.60, h: 1.10, y: 3.10 },
    ];
    foliageData.forEach((fd, i) => {
      const mat  = this._mat(foliageColors[i], 0.95, 0.0, opacity, transparent);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(fd.r, fd.h, 8), mat);
      cone.position.y   = fd.y;
      cone.rotation.y   = (i * 0.7); // slight rotation per tier
      group.add(cone);
    });
  }

  _buildLeafTree(group, opacity, transparent) {
    // Trunk — taller and slightly thicker than pine
    const trunkMat = this._mat(0x6b4226, 0.95, 0.0, opacity, transparent);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.20, 2.40, 8), trunkMat
    );
    trunk.position.y = 1.20;
    group.add(trunk);

    // Canopy — rounded spheres for deciduous foliage
    const canopyColors = [0x2d6b2d, 0x3a8a3a, 0x278a27];
    const canopyData = [
      { r: 1.40, x:  0.0,  y: 3.40, z:  0.0  },
      { r: 1.10, x:  0.55, y: 3.90, z:  0.30 },
      { r: 1.10, x: -0.50, y: 3.80, z: -0.25 },
      { r: 0.85, x:  0.15, y: 4.50, z: -0.20 },
    ];
    canopyData.forEach((cd, i) => {
      const mat = this._mat(canopyColors[i % canopyColors.length], 0.95, 0.0, opacity, transparent);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(cd.r, 10, 8), mat);
      sphere.position.set(cd.x, cd.y, cd.z);
      group.add(sphere);
    });
  }

  _buildPole(group, opacity, transparent) {
    // Main pole
    const poleMat = this._mat(0x5a4a3a, 0.9, 0.0, opacity, transparent);
    const pole    = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 8.0, 8), poleMat
    );
    pole.position.y = 4.0;
    group.add(pole);

    // Cross-arm
    const armMat = this._mat(0x5a4a3a, 0.85, 0.1, opacity, transparent);
    const arm    = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.08), armMat);
    arm.position.y = 7.2;
    group.add(arm);

    // Insulators (3 small spheres)
    const insMat = this._mat(0xcccccc, 0.7, 0.0, opacity, transparent);
    for (let i = 0; i < 3; i++) {
      const ins = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), insMat);
      ins.position.set((i - 1) * 0.80, 7.30, 0);
      group.add(ins);
    }
  }
}

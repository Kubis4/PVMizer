/**
 * WeatherEffects.js
 * Particle systems for rain, snow, and visual atmosphere adjustments.
 */

import * as THREE from 'three';

const PARTICLE_COUNT = 4000;
const SPREAD = 40;
const HEIGHT = 30;

export class WeatherEffects {
  constructor(scene) {
    this.scene = scene;
    this._condition = 'clear';
    this._rainMesh = null;
    this._snowMesh = null;
    this._rainPositions = null;
    this._snowPositions = null;
    this._snowDrift = null;

    this._initRain();
    this._initSnow();
  }

  _initRain() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 1] = Math.random() * HEIGHT;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
    }
    this._rainPositions = positions;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._rainMesh = new THREE.Points(geom, mat);
    this._rainMesh.visible = false;
    this._rainMesh.frustumCulled = false;
    this.scene.add(this._rainMesh);
  }

  _initSnow() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const drift = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 1] = Math.random() * HEIGHT;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      drift[i] = Math.random() * Math.PI * 2;
    }
    this._snowPositions = positions;
    this._snowDrift = drift;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    this._snowMesh = new THREE.Points(geom, mat);
    this._snowMesh.visible = false;
    this._snowMesh.frustumCulled = false;
    this.scene.add(this._snowMesh);
  }

  setCondition(condition) {
    this._condition = condition;
    this._rainMesh.visible = (condition === 'rainy');
    this._snowMesh.visible = (condition === 'snowy');
  }

  update(dtMs) {
    const dt = dtMs / 1000;

    if (this._condition === 'rainy') {
      const pos = this._rainPositions;
      const speed = 18;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3 + 1] -= speed * dt;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3]     = (Math.random() - 0.5) * SPREAD;
          pos[i * 3 + 1] = HEIGHT;
          pos[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
        }
      }
      this._rainMesh.geometry.attributes.position.needsUpdate = true;
    }

    if (this._condition === 'snowy') {
      const pos = this._snowPositions;
      const drift = this._snowDrift;
      const speed = 2.5;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3 + 1] -= speed * dt;
        drift[i] += dt * 1.5;
        pos[i * 3]     += Math.sin(drift[i]) * 0.01;
        pos[i * 3 + 2] += Math.cos(drift[i] * 0.7) * 0.008;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3]     = (Math.random() - 0.5) * SPREAD;
          pos[i * 3 + 1] = HEIGHT;
          pos[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
          drift[i] = Math.random() * Math.PI * 2;
        }
      }
      this._snowMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    if (this._rainMesh) {
      this.scene.remove(this._rainMesh);
      this._rainMesh.geometry.dispose();
      this._rainMesh.material.dispose();
    }
    if (this._snowMesh) {
      this.scene.remove(this._snowMesh);
      this._snowMesh.geometry.dispose();
      this._snowMesh.material.dispose();
    }
  }
}

/**
 * GodRaysEffect.js
 * Screen-space sun shafts using bright-pass extraction + radial blur.
 * Single-pass shader — no separate occlusion render needed.
 * Extracts bright pixels from the scene (the sun) and blurs them
 * radially from the sun's screen-space position.
 */

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const SUN_SHAFT_SHADER = {
  uniforms: {
    tDiffuse:        { value: null },
    uSunScreenPos:   { value: new THREE.Vector2(0.5, 0.5) },
    uIntensity:      { value: 0.75 },
    uDecay:          { value: 0.95 },
    uDensity:        { value: 0.8 },
    uWeight:         { value: 0.12 },
    uBrightThreshold:{ value: 0.7 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2  uSunScreenPos;
    uniform float uIntensity;
    uniform float uDecay;
    uniform float uDensity;
    uniform float uWeight;
    uniform float uBrightThreshold;
    varying vec2 vUv;

    const int SAMPLES = 80;

    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);

      // Early-out when effect is disabled (intensity = 0)
      if (uIntensity <= 0.0) {
        gl_FragColor = sceneColor;
        return;
      }

      // Radial blur toward sun position, sampling only bright pixels
      vec2 deltaUV = (vUv - uSunScreenPos) * uDensity / float(SAMPLES);
      vec2 sampleUV = vUv;
      float illuminationDecay = 1.0;
      vec3 rays = vec3(0.0);

      for (int i = 0; i < SAMPLES; i++) {
        sampleUV -= deltaUV;
        vec3 s = texture2D(tDiffuse, clamp(sampleUV, 0.0, 1.0)).rgb;
        // Extract only bright pixels (the sun and sky glow)
        float brightness = dot(s, vec3(0.299, 0.587, 0.114));
        float mask = smoothstep(uBrightThreshold, uBrightThreshold + 0.2, brightness);
        s *= mask * illuminationDecay * uWeight;
        rays += s;
        illuminationDecay *= uDecay;
      }

      // Fade rays when sun is near/outside screen edge
      vec2 sunDist = abs(uSunScreenPos - vec2(0.5));
      float edgeFade = 1.0 - smoothstep(0.3, 0.6, max(sunDist.x, sunDist.y));

      gl_FragColor = sceneColor + vec4(rays * uIntensity * edgeFade, 0.0);
    }
  `
};

/* Weather attenuation factors */
const WEATHER_FACTOR = {
  clear: 1.0,
  partly_cloudy: 0.4,
  cloudy: 0.0,
  rainy: 0.0,
  snowy: 0.0
};

export class GodRaysEffect {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.Mesh} sunSphere  – the sun mesh from SunSimulation
   */
  constructor(renderer, scene, camera, sunSphere) {
    this.renderer  = renderer;
    this.scene     = scene;
    this.camera    = camera;
    this.sunSphere = sunSphere;
    this.enabled   = true;
    this.intensity = 0.10;

    // Shader pass (inserted into EffectComposer chain)
    this.shaderPass = new ShaderPass(SUN_SHAFT_SHADER);
    this.shaderPass.needsSwap = true;
  }

  /**
   * Call each frame BEFORE composer.render().
   * Updates shader uniforms (no separate render pass needed).
   */
  update(weatherCondition) {
    const wf = WEATHER_FACTOR[weatherCondition] ?? 1.0;

    // Skip when disabled, sun below horizon, or bad weather
    if (!this.enabled || !this.sunSphere.visible || wf <= 0) {
      this.shaderPass.uniforms.uIntensity.value = 0;
      return;
    }

    // Project sun to screen space
    const sunNDC = this.sunSphere.position.clone().project(this.camera);

    // Sun behind camera → no rays
    if (sunNDC.z > 1) {
      this.shaderPass.uniforms.uIntensity.value = 0;
      return;
    }

    const screenPos = new THREE.Vector2(
      sunNDC.x * 0.5 + 0.5,
      sunNDC.y * 0.5 + 0.5
    );

    this.shaderPass.uniforms.uSunScreenPos.value.copy(screenPos);
    this.shaderPass.uniforms.uIntensity.value = this.intensity * wf;
  }

  resize() {
    // No render targets to resize in this approach
  }

  dispose() {
    // Nothing to dispose
  }
}

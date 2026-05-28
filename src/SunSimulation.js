/**
 * SunSimulation.js
 * Solar position algorithm based on NOAA / Spencer (1971) & Iqbal (1983)
 * Coordinate system: +X=East, +Y=Up, +Z=North (consistent with geometry)
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const SOLAR_CONSTANT = 1361; // W/m²

export class SunSimulation {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // Sky (kept for uniform control; not rendered directly — background cubemap used instead)
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    // Don't add to scene — we render it into a cubemap for scene.background

    // Sun mesh (visual sphere)
    this.sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffdd })
    );
    this.sunSphere.name = 'sunSphere';
    scene.add(this.sunSphere);

    // PMREM generator for sky-to-background conversion
    this._pmremGenerator = new THREE.PMREMGenerator(renderer);
    this._pmremGenerator.compileCubemapShader();
    this._skyRenderTarget = null;
    this._skyScene = new THREE.Scene();
    this._skyCopy = new Sky();
    this._skyCopy.scale.setScalar(450000);
    this._skyScene.add(this._skyCopy);
    this._lastSkyElev = null;
    this._lastSkyAzim = null;
    this._lastSkyWeather = null;

    // Sun glow (sprite)
    const glowTex = this._createGlowTexture();
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffe870,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.sunGlow.scale.setScalar(18);
    scene.add(this.sunGlow);

    // Sun trajectory arc
    this.trajectoryLine = null;
    this.trajectoryPoints = [];

    // Sun light
    this.sunLight = new THREE.DirectionalLight(0xfffdf0, 1.8);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.camera.left = -20;
    this.sunLight.shadow.camera.right = 20;
    this.sunLight.shadow.camera.top = 20;
    this.sunLight.shadow.camera.bottom = -20;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Ambient / hemisphere
    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8B7355, 0.35);
    scene.add(this.hemiLight);

    // Current state
    this.sunPosition = { elevation: 45, azimuth: 180, elevationRad: 45 * DEG, azimuthRad: Math.PI };
    this.irradiance = 0;
    this.sunVector = new THREE.Vector3(0, 1, 0);
    this.SUN_DIST = 150;
  }

  // ───────── DST (Daylight Saving Time) Rules ─────────
  /**
   * DST rules for different regions.
   * Europe: Last Sunday of March (start) → Last Sunday of October (end), +1 hour
   * USA: 2nd Sunday of March (start) → 1st Sunday of November (end), +1 hour
   */
  static DST_RULES = {
    'europe': {
      startMonth: 3,  endMonth: 10,
      startWeek: 'last', endWeek: 'last',
      offset: 1
    },
    'usa': {
      startMonth: 3,  endMonth: 11,
      startWeek: 'second', endWeek: 'first',
      offset: 1
    },
    'none': {
      offset: 0
    }
  };

  /** Detect region based on coordinates */
  static getRegionForDST(lat, lon) {
    if (-10 <= lon && lon <= 40 && 35 <= lat && lat <= 70) return 'europe';
    if (-125 <= lon && lon <= -65 && 25 <= lat && lat <= 50) return 'usa';
    return 'none';
  }

  /** Find nth Sunday of a given month and year */
  static findSunday(year, month, position) {
    // position: 'first', 'second', or 'last'
    const d = new Date(year, month - 1, 1);
    
    if (position === 'first') {
      // Find first Sunday
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
      return new Date(d);
    } else if (position === 'second') {
      // Find second Sunday
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + 7);
      return new Date(d);
    } else if (position === 'last') {
      // Find last Sunday
      const daysInMonth = new Date(year, month, 0).getDate();
      d.setDate(daysInMonth);
      while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
      return new Date(d);
    }
    return null;
  }

  /** Check if DST is active on given date */
  static isDSTActive(date, lat, lon) {
    const region = SunSimulation.getRegionForDST(lat, lon);
    const rules = SunSimulation.DST_RULES[region];
    
    if (!rules || rules.offset === 0) return false;
    
    const year = date.getFullYear();
    const dstStart = SunSimulation.findSunday(year, rules.startMonth, rules.startWeek);
    const dstEnd = SunSimulation.findSunday(year, rules.endMonth, rules.endWeek);
    
    // Compare date values as numbers: YYYYMMDD format
    // This avoids timezone and UTC conversion issues
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const dateNum = y * 10000 + m * 100 + d;
    const startNum = dstStart.getFullYear() * 10000 + dstStart.getMonth() * 100 + dstStart.getDate();
    const endNum = dstEnd.getFullYear() * 10000 + dstEnd.getMonth() * 100 + dstEnd.getDate();
    
    // DST is active from start date (inclusive) until end date (exclusive)
    return dateNum >= startNum && dateNum < endNum;
  }

  /** Get DST offset in hours for given date and location */
  static getDSTOffset(date, lat, lon) {
    if (SunSimulation.isDSTActive(date, lat, lon)) {
      const rules = SunSimulation.DST_RULES[SunSimulation.getRegionForDST(lat, lon)];
      return rules ? rules.offset : 0;
    }
    return 0;
  }

  // ───────── Solar Position ─────────
  /**
   * Calculate solar position.
   * @param {number} lat  Latitude  (degrees)
   * @param {number} lon  Longitude (degrees)
   * @param {Date}   date JavaScript Date object
   * @param {number} timeHours  Local time in decimal hours (e.g. 13.5 = 13:30)
   * @returns {{ elevation, azimuth, elevationRad, azimuthRad }}
   */
  static calculateSolarPosition(lat, lon, date, timeHours) {
    const latRad = lat * DEG;
    const dayOfYear = SunSimulation.getDayOfYear(date);

    // Apply DST correction: convert local clock time to solar time
    // timeHours is expected to be "wall clock" time (already including DST)
    // So we don't adjust it, but we note it for reference
    const dstOffset = SunSimulation.getDSTOffset(date, lat, lon);

    // Equation of time (minutes) — Spencer formula
    const B = (360 / 365 * (dayOfYear - 81)) * DEG;
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

    // Using LOCAL CLOCK TIME (includes DST offset if applicable)
    // TC converts local clock time → local solar time
    const TC = EoT / 60; // hours; equates timeHours to local solar time
    const solarTime = timeHours + TC;

    // Hour angle: 0 at noon, ±15°/hr
    const hourAngle = (solarTime - 12) * 15 * DEG;

    // Declination (degrees) — Cooper equation
    const declinationDeg = 23.45 * Math.sin((360 / 365 * (284 + dayOfYear)) * DEG);
    const declination = declinationDeg * DEG;

    // Solar elevation
    const sinElev = Math.sin(latRad) * Math.sin(declination) +
                    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
    const elevation = Math.asin(Math.max(-1, Math.min(1, sinElev)));

    // Solar azimuth (measured from North, clockwise: 0=N, 90=E, 180=S, 270=W)
    // Use atan2 for correct quadrant handling in all hemispheres
    let azimuth = 0;
    const cosElev = Math.cos(elevation);
    if (Math.abs(cosElev) > 1e-6) {
      // Azimuth components using spherical trigonometry
      const sinAz = Math.cos(declination) * Math.sin(hourAngle) / cosElev;
      const cosAz = (Math.sin(declination) * Math.cos(latRad) - 
                     Math.cos(declination) * Math.sin(latRad) * Math.cos(hourAngle)) / cosElev;
      // atan2 returns [-π, π], convert to [0, 2π]
      azimuth = Math.atan2(sinAz, cosAz);
      if (azimuth < 0) azimuth += 2 * Math.PI;
    }

    return {
      elevation:    elevation * RAD,
      azimuth:      azimuth  * RAD,
      elevationRad: elevation,
      azimuthRad:   azimuth
    };
  }

  static getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / 86400000);
  }

  /** Convert solar pos to Three.js direction vector (sun→scene).
   *  Coordinate: +X=East, +Y=Up, +Z=North
   *  azimuth: 0=North, 90=East, 180=South, 270=West (clockwise)
   */
  static getSunVector(elevDeg, azDeg) {
    const el = elevDeg * DEG;
    const az = azDeg  * DEG;
    // Coordinate system: +X=East, +Y=Up, +Z=North (geometry convention)
    // az=0 → North (+Z), az=90 → East (+X), az=180 → South (-Z), az=270 → West (-X)
    return new THREE.Vector3(
       Math.sin(az) * Math.cos(el),   // East (+X)
       Math.sin(el),                   // Up  (+Y)
       Math.cos(az) * Math.cos(el)    // North (+Z): cos(0)=+1→N(+Z), cos(180)=-1→S(-Z)
    ).normalize();
  }

  /** Clear-sky Direct Normal Irradiance using Hottel model */
  static getDNI(elevationDeg) {
    if (elevationDeg <= 0) return 0;
    // Kasten-Young air mass
    const AM = 1 / (Math.sin(elevationDeg * DEG) + 0.50572 * Math.pow(elevationDeg + 6.07995, -1.6364));
    // Hottel simplified: DNI = I0 * 0.7^(AM^0.678)
    return SOLAR_CONSTANT * Math.pow(0.7, Math.pow(AM, 0.678));
  }

  /**
   * Diffuse Horizontal Irradiance (clear sky).
   * Uses Reindl model: DHI = Kd * GHI_beam, where Kd depends on clearness index.
   * More accurate than simple 12% model: captures clear vs cloudy sky variations.
   */
  static getDHI(elevationDeg) {
    if (elevationDeg <= 0) return 0;
    const sinEl = Math.sin(elevationDeg * DEG);
    const GHI_beam = SunSimulation.getDNI(elevationDeg) * sinEl;
    
    // Clear-sky DHI (simple model for reference)
    const DHI_clearSky = SOLAR_CONSTANT * 0.12 * sinEl;
    
    // Clear-sky GHI
    const GHI_clearSky = GHI_beam + DHI_clearSky;
    
    // Reindl diffuse fraction model (±8% accuracy)
    // Kc = clearness index, Kd = diffuse fraction
    const Kc = GHI_clearSky > 0 ? GHI_beam / GHI_clearSky : 0;
    const Kd = 1.020 - 0.254 * Kc + 0.0123 * sinEl;
    
    // Reindl DHI
    return Math.max(0, Kd * GHI_beam);
  }

  /** Global Horizontal Irradiance = DNI*sin(el) + DHI (Reindl) */
  static getGHI(elevationDeg) {
    if (elevationDeg <= 0) return 0;
    const sinEl = Math.sin(elevationDeg * DEG);
    return SunSimulation.getDNI(elevationDeg) * sinEl + SunSimulation.getDHI(elevationDeg);
  }

  // ───────── Sunrise/Sunset ─────────
  static getSunriseSunset(lat, lon, date) {
    const dayOfYear = SunSimulation.getDayOfYear(date);
    const B = (360 / 365 * (dayOfYear - 81)) * DEG;
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const decl = 23.45 * Math.sin((360 / 365 * (284 + dayOfYear)) * DEG) * DEG;
    const latRad = lat * DEG;

    const cosHA = -Math.tan(latRad) * Math.tan(decl);
    if (cosHA > 1)  return { sunrise: null, sunset: null, noon: 12 }; // polar night
    if (cosHA < -1) return { sunrise: 0,    sunset: 24,   noon: 12 }; // midnight sun

    const HA = Math.acos(cosHA) * RAD;
    // Use local solar time: noon ≈ 12 - EoT/60 (matches the solarTime in calculateSolarPosition)
    const noon = 12 - EoT / 60;
    const sunrise = noon - HA / 15;
    const sunset  = noon + HA / 15;
    return { sunrise, sunset, noon };
  }

  // ───────── Update Scene ─────────
  update(lat, lon, date, timeHours, shadowsEnabled, weatherCondition = 'clear') {
    const pos = SunSimulation.calculateSolarPosition(lat, lon, date, timeHours);
    this.sunPosition = pos;
    
    // Azimuth je absolútny bez ohľadu na hemisferu
    this.sunVector = SunSimulation.getSunVector(pos.elevation, pos.azimuth);
    this.irradiance = SunSimulation.getGHI(pos.elevation);

    const sunWorldPos = this.sunVector.clone().multiplyScalar(this.SUN_DIST);

    // Sun sphere/glow position
    this.sunSphere.position.copy(sunWorldPos);
    this.sunGlow.position.copy(sunWorldPos);

    const isDay = pos.elevation > -3;
    this.sunSphere.visible = isDay;
    this.sunGlow.visible   = isDay && pos.elevation > 0;

    // Weather-dependent visual parameters
    const weatherParams = {
      clear:         { turbidity: 2,  sunFactor: 1.0,  rayleigh: 3,   mie: 0.003, glowOp: 1.0 },
      partly_cloudy: { turbidity: 5,  sunFactor: 0.7,  rayleigh: 2,   mie: 0.01,  glowOp: 0.5 },
      cloudy:        { turbidity: 10, sunFactor: 0.35, rayleigh: 1,   mie: 0.02,  glowOp: 0.15 },
      rainy:         { turbidity: 14, sunFactor: 0.20, rayleigh: 0.5, mie: 0.03,  glowOp: 0.05 },
      snowy:         { turbidity: 8,  sunFactor: 0.25, rayleigh: 0.8, mie: 0.025, glowOp: 0.1 },
    };
    const wp = weatherParams[weatherCondition] || weatherParams.clear;

    // Directional light
    this.sunLight.position.copy(sunWorldPos);
    this.sunLight.visible = pos.elevation > 0;
    this.sunLight.castShadow = shadowsEnabled && pos.elevation > 0;

    // Light intensity / color based on elevation + weather
    const elevNorm = Math.max(0, Math.min(1, pos.elevation / 90));
    this.sunLight.intensity = (1.5 * Math.pow(elevNorm, 0.4) + 0.05) * wp.sunFactor;
    this.sunLight.color.set(this._sunColor(pos.elevation));

    // Sun glow opacity affected by weather
    if (this.sunGlow.material) {
      this.sunGlow.material.opacity = wp.glowOp;
    }

    // Sky parameters — match +Z=South convention
    const skyPhi   = Math.PI / 2 - pos.elevationRad;
    const skyTheta = Math.PI - pos.azimuthRad;
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = wp.turbidity;
    uniforms['rayleigh'].value  = isDay ? wp.rayleigh : 0.1;
    uniforms['mieCoefficient'].value = wp.mie;
    uniforms['mieDirectionalG'].value = 0.8;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, skyPhi, skyTheta);
    uniforms['sunPosition'].value.copy(sunDir);

    // Hemisphere light adapts to sky color + weather
    const skyColor = this._skyColor(pos.elevation);
    this.hemiLight.color.set(skyColor);
    this.hemiLight.groundColor.set(0x8B7355);
    this.hemiLight.intensity = (isDay ? 0.4 + elevNorm * 0.3 : 0.05) * wp.sunFactor;

    // Render Sky shader into cubemap and set as scene background
    // Only regenerate when sun position changes noticeably (saves GPU)
    const elevRound = Math.round(pos.elevation);
    const azimRound = Math.round(pos.azimuth);
    if (this._pmremGenerator &&
        (elevRound !== this._lastSkyElev || azimRound !== this._lastSkyAzim || weatherCondition !== this._lastSkyWeather)) {
      this._lastSkyElev = elevRound;
      this._lastSkyAzim = azimRound;
      this._lastSkyWeather = weatherCondition;
      // Copy uniforms to the separate sky scene
      const srcU = this.sky.material.uniforms;
      const dstU = this._skyCopy.material.uniforms;
      dstU['turbidity'].value = srcU['turbidity'].value;
      dstU['rayleigh'].value  = srcU['rayleigh'].value;
      dstU['mieCoefficient'].value  = srcU['mieCoefficient'].value;
      dstU['mieDirectionalG'].value = srcU['mieDirectionalG'].value;
      dstU['sunPosition'].value.copy(srcU['sunPosition'].value);
      if (this._skyRenderTarget) this._skyRenderTarget.dispose();
      this._skyRenderTarget = this._pmremGenerator.fromScene(this._skyScene, 0, 0.1, 1000);
      this.scene.background = this._skyRenderTarget.texture;
    }
  }

  updateTrajectory(lat, lon, date, visible) {
    // ── Cleanup old objects ──
    const dispose = (obj) => {
      if (!obj) return;
      this.scene.remove(obj);
      obj.geometry?.dispose();
      if (obj.material) {
        if (obj.material.dispose) obj.material.dispose();
      }
    };
    dispose(this.trajectoryLine);  this.trajectoryLine = null;
    dispose(this._twilightLine);   this._twilightLine  = null;

    // Markers + glow sprites
    for (const m of [this._sunriseMarker, this._sunsetMarker]) {
      if (m) {
        if (m.userData.glowSprite) { this.scene.remove(m.userData.glowSprite); }
        dispose(m);
      }
    }
    this._sunriseMarker = null;
    this._sunsetMarker  = null;

    // Hour tick marks
    if (this._hourMarkers) {
      for (const m of this._hourMarkers) dispose(m);
    }
    this._hourMarkers = [];

    if (!visible) return;

    // ── Compute trajectory points ──
    const dayPts      = [];   // elevation > 0
    const dayElev     = [];   // track elevation for color gradient
    const twilightPts = [];   // -6° < elevation <= 0

    for (let h = 0; h <= 24; h += 0.1) {
      const pos = SunSimulation.calculateSolarPosition(lat, lon, date, h);
      // Azimuth je absolútny bez ohľadu na hemisferu
      const v = SunSimulation.getSunVector(Math.max(pos.elevation, -6), pos.azimuth);
      const pt = v.clone().multiplyScalar(this.SUN_DIST * 0.85);
      if (pos.elevation > 0) {
        dayPts.push(pt);
        dayElev.push(pos.elevation);
      } else if (pos.elevation > -6) {
        twilightPts.push(pt);
      }
    }

    const res = new THREE.Vector2(window.innerWidth, window.innerHeight);

    // ── Twilight arc (dashed, dim orange, Line2) ──
    if (twilightPts.length >= 2) {
      const positions = [];
      for (const pt of twilightPts) positions.push(pt.x, pt.y, pt.z);
      const geom = new LineGeometry();
      geom.setPositions(positions);
      const mat = new LineMaterial({
        color: 0xff8c00,
        linewidth: 2,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        depthTest: false,
        worldUnits: false,
        dashed: true,
        dashSize: 3,
        gapSize: 2,
        resolution: res,
      });
      this._twilightLine = new Line2(geom, mat);
      this._twilightLine.computeLineDistances();
      this._twilightLine.renderOrder = 998;
      this.scene.add(this._twilightLine);
    }

    // ── Daylight arc (thick, gradient color, Line2) ──
    if (dayPts.length >= 2) {
      const positions = [];
      const colors    = [];
      const maxElev   = Math.max(...dayElev, 1);

      for (let i = 0; i < dayPts.length; i++) {
        const pt = dayPts[i];
        positions.push(pt.x, pt.y, pt.z);
        // Color gradient: warm orange at horizon → bright gold at peak
        const t = dayElev[i] / maxElev;  // 0 at horizon, 1 at peak
        colors.push(
          1.0,                   // R: always full
          0.55 + t * 0.35,      // G: 0.55 (orange) → 0.90 (gold)
          0.05 + t * 0.15       // B: dim warm
        );
      }

      const geom = new LineGeometry();
      geom.setPositions(positions);
      geom.setColors(colors);
      const mat = new LineMaterial({
        linewidth: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: false,
        worldUnits: false,
        resolution: res,
      });
      this.trajectoryLine = new Line2(geom, mat);
      this.trajectoryLine.computeLineDistances();
      this.trajectoryLine.renderOrder = 999;
      this.scene.add(this.trajectoryLine);
    }

    // ── Sunrise / sunset markers (glowing spheres) ──
    const { sunrise, sunset } = SunSimulation.getSunriseSunset(lat, lon, date);
    if (sunrise !== null && sunset !== null) {
      const addMarker = (timeH, color) => {
        const pos = SunSimulation.calculateSolarPosition(lat, lon, date, timeH);
        const v   = SunSimulation.getSunVector(0, pos.azimuth);
        const markerGeo = new THREE.SphereGeometry(0.6, 12, 12);
        const mat = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.9, depthTest: false
        });
        const m = new THREE.Mesh(markerGeo, mat);
        m.position.copy(v.multiplyScalar(this.SUN_DIST * 0.85));
        m.renderOrder = 1000;
        this.scene.add(m);

        // Glow sprite behind the marker
        const glowSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this._createGlowTexture(),
            color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.6,
          })
        );
        glowSprite.scale.setScalar(4);
        glowSprite.position.copy(m.position);
        glowSprite.renderOrder = 999;
        this.scene.add(glowSprite);
        m.userData.glowSprite = glowSprite;

        return m;
      };
      this._sunriseMarker = addMarker(sunrise, 0xff6600);
      this._sunsetMarker  = addMarker(sunset,  0xcc3300);

      // ── Hour tick marks along the daylight arc ──
      const tickGeo = new THREE.SphereGeometry(0.15, 6, 6);
      const tickMat = new THREE.MeshBasicMaterial({
        color: 0xffcc00, transparent: true, opacity: 0.5, depthTest: false
      });
      for (let h = Math.ceil(sunrise); h <= Math.floor(sunset); h++) {
        const pos = SunSimulation.calculateSolarPosition(lat, lon, date, h);
        if (pos.elevation <= 0) continue;
        const v = SunSimulation.getSunVector(pos.elevation, pos.azimuth);
        const tick = new THREE.Mesh(tickGeo, tickMat);
        tick.position.copy(v.multiplyScalar(this.SUN_DIST * 0.85));
        tick.renderOrder = 1001;
        this.scene.add(tick);
        this._hourMarkers.push(tick);
      }
    }
  }

  // ───────── Helpers ─────────
  _sunColor(elevDeg) {
    if (elevDeg <= 0)  return new THREE.Color(0x000020);
    if (elevDeg < 5)   return new THREE.Color(0xff4400);
    if (elevDeg < 15)  return new THREE.Color(0xff8c00);
    if (elevDeg < 30)  return new THREE.Color(0xffe0a0);
    return new THREE.Color(0xfffdf0);
  }

  _skyColor(elevDeg) {
    if (elevDeg <= 0)  return new THREE.Color(0x000520);
    if (elevDeg < 5)   return new THREE.Color(0x1a0a00);
    if (elevDeg < 15)  return new THREE.Color(0x3a2510);
    if (elevDeg < 30)  return new THREE.Color(0x4a90d9).multiplyScalar(0.6);
    return new THREE.Color(0x4a90d9);
  }

  _createGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0,   'rgba(255,255,200,1)');
    grad.addColorStop(0.2, 'rgba(255,220,100,0.6)');
    grad.addColorStop(0.6, 'rgba(255,150,50,0.2)');
    grad.addColorStop(1,   'rgba(255,100,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }
}

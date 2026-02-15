/**
 * SunSimulation.js
 * Solar position algorithm based on NOAA / Spencer (1971) & Iqbal (1983)
 * Coordinate system: +X=East, +Y=Up, +Z=South (camera on north side at -Z, looking toward +Z south)
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const SOLAR_CONSTANT = 1361; // W/m²

export class SunSimulation {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    // Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    scene.add(this.sky);

    // Sun mesh (visual sphere)
    this.sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff5c0 })
    );
    this.sunSphere.name = 'sunSphere';
    scene.add(this.sunSphere);

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
    this.sunGlow.scale.setScalar(12);
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

    // Equation of time (minutes) — Spencer formula
    const B = (360 / 365 * (dayOfYear - 81)) * DEG;
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

    // Using LOCAL CLOCK TIME (UTC + longitude/15 offset, typical timezone)
    // TC converts local clock time → local apparent solar time
    // LSTM = 15 * round(lon/15) ≈ lon, so longitude terms mostly cancel.
    // TC = 4*(lon - LSTM)/60 + EoT/60 ≈ EoT/60 for most locations.
    // This ensures 12:00 on the slider = close to solar noon everywhere.
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

    // Solar azimuth (measured from South toward West, then adjusted)
    let azimuth = 0;
    const cosElev = Math.cos(elevation);
    if (Math.abs(cosElev) > 1e-6) {
      const cosAz = (Math.sin(elevation) * Math.sin(latRad) - Math.sin(declination)) /
                    (cosElev * Math.cos(latRad));
      azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
      // Azimuth from North, measured clockwise
      // In the morning (hourAngle < 0) sun is east; afternoon (hourAngle > 0) sun is west
      if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
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
   *  Coordinate: +X=East, +Y=Up, +Z=South
   *  azimuth: 0=North, 90=East, 180=South, 270=West (clockwise)
   */
  static getSunVector(elevDeg, azDeg) {
    const el = elevDeg * DEG;
    const az = azDeg  * DEG;
    // Coordinate system: +X=East, +Y=Up, +Z=South (camera on north side looking south)
    // az=0 → North (-Z), az=90 → East (+X), az=180 → South (+Z), az=270 → West (-X)
    return new THREE.Vector3(
       Math.sin(az) * Math.cos(el),   // East (+X)
       Math.sin(el),                   // Up  (+Y)
      -Math.cos(az) * Math.cos(el)    // South (+Z): -cos(0)=-1→N(-Z), -cos(180)=+1→S(+Z)
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
   * Approximate as ~12% of extraterrestrial horizontal irradiance.
   */
  static getDHI(elevationDeg) {
    if (elevationDeg <= 0) return 0;
    const sinEl = Math.sin(elevationDeg * DEG);
    // Simplified: DHI ≈ 0.12 * I0 * sin(el) provides plausible diffuse sky radiation
    return SOLAR_CONSTANT * 0.12 * sinEl;
  }

  /** Global Horizontal Irradiance = DNI*sin(el) + DHI */
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
  update(lat, lon, date, timeHours, shadowsEnabled) {
    const pos = SunSimulation.calculateSolarPosition(lat, lon, date, timeHours);
    this.sunPosition = pos;
    this.sunVector = SunSimulation.getSunVector(pos.elevation, pos.azimuth);
    this.irradiance = SunSimulation.getGHI(pos.elevation);

    const sunWorldPos = this.sunVector.clone().multiplyScalar(this.SUN_DIST);

    // Sun sphere/glow position
    this.sunSphere.position.copy(sunWorldPos);
    this.sunGlow.position.copy(sunWorldPos);

    const isDay = pos.elevation > -3;
    this.sunSphere.visible = isDay;
    this.sunGlow.visible   = isDay && pos.elevation > 0;

    // Directional light
    this.sunLight.position.copy(sunWorldPos);
    this.sunLight.visible = pos.elevation > 0;
    this.sunLight.castShadow = shadowsEnabled && pos.elevation > 0;

    // Light intensity / color based on elevation
    const elevNorm = Math.max(0, Math.min(1, pos.elevation / 90));
    this.sunLight.intensity = 1.5 * Math.pow(elevNorm, 0.4) + 0.05;
    this.sunLight.color.set(this._sunColor(pos.elevation));

    // Sky parameters — match +Z=South convention
    // Three.js spherical: theta=0→+Z (+Z=South). skyTheta = π - az maps az=180(S)→theta=0→+Z ✓
    const skyPhi   = Math.PI / 2 - pos.elevationRad;
    const skyTheta = Math.PI - pos.azimuthRad;
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = 6;
    uniforms['rayleigh'].value  = isDay ? 2 : 0.1;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, skyPhi, skyTheta);
    uniforms['sunPosition'].value.copy(sunDir);

    // Hemisphere light adapts to sky color
    const skyColor = this._skyColor(pos.elevation);
    this.hemiLight.color.set(skyColor);
    this.hemiLight.groundColor.set(0x8B7355);
    this.hemiLight.intensity = isDay ? 0.4 + elevNorm * 0.3 : 0.05;
  }

  updateTrajectory(lat, lon, date, visible) {
    // Remove old trajectory lines
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine = null;
    }
    if (this._twilightLine) {
      this.scene.remove(this._twilightLine);
      this._twilightLine.geometry.dispose();
      this._twilightLine = null;
    }
    // Remove sunrise/sunset markers
    if (this._sunriseMarker) {
      this.scene.remove(this._sunriseMarker);
      this._sunriseMarker.geometry?.dispose();
      this._sunriseMarker = null;
    }
    if (this._sunsetMarker) {
      this.scene.remove(this._sunsetMarker);
      this._sunsetMarker.geometry?.dispose();
      this._sunsetMarker = null;
    }
    if (!visible) return;

    const dayPts     = [];   // elevation > 0
    const twilightPts = [];  // -6° < elevation <= 0 (civil twilight)

    for (let h = 0; h <= 24; h += 0.1) {
      const pos = SunSimulation.calculateSolarPosition(lat, lon, date, h);
      // Clamp elevation to 0 for horizon rendering of twilight
      const v = SunSimulation.getSunVector(Math.max(pos.elevation, -6), pos.azimuth);
      const pt = v.clone().multiplyScalar(this.SUN_DIST * 0.85);
      if (pos.elevation > 0) {
        dayPts.push(pt);
      } else if (pos.elevation > -6) {
        twilightPts.push(pt);
      }
    }

    // Twilight arc (dashed, dim orange)
    if (twilightPts.length >= 2) {
      const geom = new THREE.BufferGeometry().setFromPoints(twilightPts);
      const mat  = new THREE.LineDashedMaterial({
        color: 0xff8c00,
        transparent: true,
        opacity: 0.35,
        dashSize: 0.4,
        gapSize: 0.3,
        depthWrite: false,
        depthTest: false
      });
      this._twilightLine = new THREE.Line(geom, mat);
      this._twilightLine.computeLineDistances();
      this._twilightLine.renderOrder = 998;
      this.scene.add(this._twilightLine);
    }

    // Daylight arc (solid yellow)
    if (dayPts.length >= 2) {
      const geom = new THREE.BufferGeometry().setFromPoints(dayPts);
      const mat  = new THREE.LineBasicMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        depthTest: false
      });
      this.trajectoryLine = new THREE.Line(geom, mat);
      this.trajectoryLine.renderOrder = 999;
      this.scene.add(this.trajectoryLine);
    }

    // Sunrise / sunset markers (small spheres at horizon)
    const { sunrise, sunset } = SunSimulation.getSunriseSunset(lat, lon, date);
    const markerGeo = new THREE.SphereGeometry(0.3, 8, 8);
    if (sunrise !== null && sunset !== null) {
      const addMarker = (timeH, color) => {
        const pos = SunSimulation.calculateSolarPosition(lat, lon, date, timeH);
        const v   = SunSimulation.getSunVector(0, pos.azimuth);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false });
        const m   = new THREE.Mesh(markerGeo, mat);
        m.position.copy(v.multiplyScalar(this.SUN_DIST * 0.85));
        m.renderOrder = 1000;
        this.scene.add(m);
        return m;
      };
      this._sunriseMarker = addMarker(sunrise, 0xff6600);
      this._sunsetMarker  = addMarker(sunset,  0xcc3300);
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
    if (elevDeg < 15)  return new THREE.Color(0x4a3010);
    if (elevDeg < 30)  return new THREE.Color(0x87ceeb).multiplyScalar(0.5);
    return new THREE.Color(0x87ceeb);
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

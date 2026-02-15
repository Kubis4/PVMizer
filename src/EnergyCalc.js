/**
 * EnergyCalc.js
 * Solar energy calculations: POA irradiance, power output, daily/monthly totals.
 */

import { SunSimulation } from './SunSimulation.js';

// Panel dimensions — mutable so panel customization flows through all calculations
export let PANEL_W    = 1.0;
export let PANEL_H    = 1.65;
export let PANEL_AREA = PANEL_W * PANEL_H;

// Temperature model constants
const NOCT         = 45;    // Nominal Operating Cell Temperature (°C)
let   TEMP_COEFF   = 0.004; // Power temp coefficient (%/°C) — updated via setTempCoeff
const AMBIENT_TEMP = 25;    // °C assumed ambient

/** Update panel physical dimensions (call when user changes panel size) */
export function setPanelDimensions(w, h) {
  PANEL_W    = w;
  PANEL_H    = h;
  PANEL_AREA = w * h;
}

/** Update temperature coefficient */
export function setTempCoeff(coeff) {
  TEMP_COEFF = coeff;
}

export class EnergyCalc {
  /**
   * Calculate POA (Plane of Array) irradiance for a panel.
   * Combines beam, diffuse, and reflected components.
   * @param {THREE.Vector3} panelNormal  Unit normal of panel surface (world space)
   * @param {THREE.Vector3} sunVector    Unit vector pointing FROM origin TO sun
   * @param {number} ghi                Global Horizontal Irradiance (W/m²)
   * @param {number} elevationDeg       Solar elevation (degrees)
   * @param {number} shadingFactor      0 = no shade, 1 = fully shaded
   * @returns {number} POA irradiance (W/m²)
   */
  static calculatePOA(panelNormal, sunVector, ghi, elevationDeg, shadingFactor = 0) {
    if (elevationDeg <= 0 || ghi <= 0) return 0;

    const dni = SunSimulation.getDNI(elevationDeg);
    const dhi = SunSimulation.getDHI(elevationDeg);

    // Beam component: DNI * cos(angle of incidence), reduced by obstacle shading
    const cosAOI = Math.max(0, panelNormal.dot(sunVector));
    const beam   = dni * cosAOI * (1 - shadingFactor);

    // Tilt of panel from horizontal (0=flat, 90=vertical)
    const tilt    = Math.acos(Math.max(-1, Math.min(1, panelNormal.y)));
    const cosTilt = Math.cos(tilt);

    // Diffuse component (isotropic sky model): DHI * (1 + cos(tilt)) / 2
    const diffuse = dhi * (1 + cosTilt) / 2;

    // Ground-reflected component: GHI * albedo * (1 - cos(tilt)) / 2
    const albedo    = 0.2;
    const reflected = ghi * albedo * (1 - cosTilt) / 2;

    return beam + diffuse + reflected;
  }

  /**
   * Calculate DC power for a single panel.
   * @param {number} poaIrradiance  W/m²
   * @param {number} efficiency     Panel efficiency (0–1), e.g. 0.20
   * @param {number} area           Panel area (m²)
   * @returns {number} Power in Watts
   */
  static calculatePanelPower(poaIrradiance, efficiency, area) {
    if (poaIrradiance <= 0) return 0;
    const cellTemp   = AMBIENT_TEMP + (NOCT - 20) * (poaIrradiance / 800);
    const tempFactor = 1 - TEMP_COEFF * (cellTemp - 25);
    return poaIrradiance * efficiency * area * Math.max(0, tempFactor);
  }

  /**
   * Calculate total system power for all panels.
   * @param {Array} panels  Three.js mesh array
   * @param {THREE.Vector3} sunVector
   * @param {number} ghi
   * @param {number} elevationDeg
   * @returns {{ totalWatts, panelData: Array<{poa, power, efficiency}> }}
   */
  static calculateSystemPower(panels, sunVector, ghi, elevationDeg) {
    let totalWatts = 0;
    const panelData = [];

    for (const mesh of panels) {
      const { normal, efficiency, area, shadingFactor = 0 } = mesh.userData;
      if (!normal) continue;
      const poa   = EnergyCalc.calculatePOA(normal, sunVector, ghi, elevationDeg, shadingFactor);
      const power = EnergyCalc.calculatePanelPower(poa, efficiency, area);
      totalWatts += power;
      panelData.push({ poa, power, efficiency });
    }

    return { totalWatts, panelData };
  }

  /**
   * Calculate power output for every 10 minutes of the day (145 values, 0–24h).
   * @param {number} lat
   * @param {number} lon
   * @param {Date} date
   * @param {Array<{normal, efficiency, area, shadingFactor}>} panelInfos
   * @returns {Array<{hour, power}>}
   */
  static calculateDayCurve(lat, lon, date, panelInfos) {
    const result = [];
    for (let h = 0; h <= 24; h += 10 / 60) {
      const pos  = SunSimulation.calculateSolarPosition(lat, lon, date, h);
      const ghi  = SunSimulation.getGHI(pos.elevation);
      const sunV = SunSimulation.getSunVector(pos.elevation, pos.azimuth);
      let watts = 0;
      for (const p of panelInfos) {
        const poa = EnergyCalc.calculatePOA(p.normal, sunV, ghi, pos.elevation, p.shadingFactor || 0);
        watts += EnergyCalc.calculatePanelPower(poa, p.efficiency, p.area);
      }
      result.push({ hour: h, power: watts });
    }
    return result;
  }

  /** Integrate day curve to kWh using trapezoidal rule */
  static integrateDayCurve(dayCurve) {
    let kwh = 0;
    for (let i = 1; i < dayCurve.length; i++) {
      const dt = dayCurve[i].hour - dayCurve[i - 1].hour;
      kwh += (dayCurve[i].power + dayCurve[i - 1].power) / 2 * dt;
    }
    return kwh / 1000;
  }

  /**
   * Calculate monthly energy totals (12 values).
   * Uses ASHRAE representative days for each month.
   */
  static calculateMonthlyEnergy(lat, lon, year, panelInfos) {
    const repDayOfMonth = [17, 16, 16, 15, 15, 11, 17, 16, 15, 15, 14, 10];
    const daysInMonth   = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const monthly = [];

    for (let m = 0; m < 12; m++) {
      const date     = new Date(year, m, repDayOfMonth[m]);
      const curve    = EnergyCalc.calculateDayCurve(lat, lon, date, panelInfos);
      const dailyKwh = EnergyCalc.integrateDayCurve(curve);
      monthly.push(dailyKwh * daysInMonth[m]);
    }
    return monthly;
  }

  /** Peak power (kWp) for a set of panel infos */
  static peakPower(panelInfos) {
    return panelInfos.reduce((sum, p) => sum + p.efficiency * p.area * 1000, 0) / 1000;
  }

  /** CO2 savings (tonnes/year) — EU grid average ~0.275 kg CO2/kWh */
  static co2Savings(annualKwh) {
    return (annualKwh * 0.275) / 1000;
  }
}

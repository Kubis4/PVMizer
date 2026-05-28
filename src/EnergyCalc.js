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

    // Beam component: DNI * cos(angle of incidence), reduced by obstacle shading.
    // Without panel-level optimizers, even partial shading triggers the bypass diode,
    // shorting out the sub-string and causing disproportionate losses (string effect).
    // Non-linear model: effectiveLoss = 1 - (1 - sf)^3
    //   sf=0.15 (chimney) → 39% loss,  sf=0.20 (pole) → 49% loss,
    //   sf=0.40 (pine)    → 78% loss,  sf=0.45 (tree) → 83% loss
    const cosAOI            = Math.max(0, panelNormal.dot(sunVector));
    const effectiveBeamLoss = shadingFactor > 0
      ? 1 - Math.pow(1 - shadingFactor, 3)
      : 0;
    const beam = dni * cosAOI * (1 - effectiveBeamLoss);

    // Tilt of panel from horizontal (0=flat, 90=vertical)
    const tilt    = Math.acos(Math.max(-1, Math.min(1, panelNormal.y)));
    const cosTilt = Math.cos(tilt);

    // Diffuse component (isotropic sky model): DHI * (1 + cos(tilt)) / 2
    const diffuse = dhi * (1 + cosTilt) / 2;

    // Ground-reflected component: GHI * albedo * (1 - cos(tilt)) / 2
    const albedo    = 0.2;
    const reflected = ghi * albedo * (1 - cosTilt) / 2;

    return (beam + diffuse + reflected);
  }

  /**
   * Apply weather condition multiplier to POA irradiance.
   */
  static applyWeather(poa, weatherMultiplier = 1.0) {
    return poa * weatherMultiplier;
  }

  /**
   * Calculate DC power for a single panel.
   * @param {number} poaIrradiance  W/m²
   * @param {number} efficiency     Panel efficiency (0–1), e.g. 0.20
   * @param {number} area           Panel area (m²)
   * @returns {number} Power in Watts
   */
  static calculatePanelPower(poaIrradiance, efficiency, area, clipping = false) {
    if (poaIrradiance <= 0) return 0;
    const cellTemp   = AMBIENT_TEMP + (NOCT - 20) * (poaIrradiance / 800);
    const tempFactor = 1 - TEMP_COEFF * (cellTemp - 25);
    let power = poaIrradiance * efficiency * area * Math.max(0, tempFactor);
    if (clipping) {
      const nominalWp = efficiency * area * 1000; // STC nominal power
      power = Math.min(power, nominalWp);
    }
    return power;
  }

  /**
   * Calculate total system power for all panels.
   * @param {Array} panels  Three.js mesh array
   * @param {THREE.Vector3} sunVector
   * @param {number} ghi
   * @param {number} elevationDeg
   * @returns {{ totalWatts, panelData: Array<{poa, power, efficiency}> }}
   */
  static calculateSystemPower(panels, sunVector, ghi, elevationDeg, weatherMultiplier = 1.0, clipping = false) {
    let totalWatts = 0;
    const panelData = [];

    for (const mesh of panels) {
      const { normal, efficiency, area, shadingFactor = 0 } = mesh.userData;
      if (!normal) continue;
      const rawPoa = EnergyCalc.calculatePOA(normal, sunVector, ghi, elevationDeg, shadingFactor);
      const poa    = EnergyCalc.applyWeather(rawPoa, weatherMultiplier);
      const power  = EnergyCalc.calculatePanelPower(poa, efficiency, area, clipping);
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
  static calculateDayCurve(lat, lon, date, panelInfos, weatherMultiplier = 1.0, clipping = false) {
    const result = [];
    const dstOffset = SunSimulation.getDSTOffset(date, lat, lon);
    for (let h = 0; h <= 24; h += 10 / 60) {
      const solarTimeH = h + dstOffset;  // Apply DST offset
      const pos  = SunSimulation.calculateSolarPosition(lat, lon, date, solarTimeH);
      const ghi  = SunSimulation.getGHI(pos.elevation);
      const sunV = SunSimulation.getSunVector(pos.elevation, pos.azimuth);
      let watts = 0;
      for (const p of panelInfos) {
        const rawPoa = EnergyCalc.calculatePOA(p.normal, sunV, ghi, pos.elevation, p.shadingFactor || 0);
        const poa = EnergyCalc.applyWeather(rawPoa, weatherMultiplier);
        watts += EnergyCalc.calculatePanelPower(poa, p.efficiency, p.area, clipping);
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
  static calculateMonthlyEnergy(lat, lon, year, panelInfos, weatherMultiplier = 1.0, monthlyCorrections = null, clipping = false) {
    const repDayOfMonth = [17, 16, 16, 15, 15, 11, 17, 16, 15, 15, 14, 10];
    const daysInMonth   = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const monthly = [];

    for (let m = 0; m < 12; m++) {
      const correction       = monthlyCorrections ? (monthlyCorrections[m] ?? 1.0) : 1.0;
      const effectiveMultiplier = weatherMultiplier * correction;
      const date     = new Date(year, m, repDayOfMonth[m]);
      const curve    = EnergyCalc.calculateDayCurve(lat, lon, date, panelInfos, effectiveMultiplier, clipping);
      const dailyKwh = EnergyCalc.integrateDayCurve(curve);
      monthly.push(dailyKwh * daysInMonth[m]);
    }
    return monthly;
  }

  /** Peak power (kWp) for a set of panel infos */
  static peakPower(panelInfos) {
    return panelInfos.reduce((sum, p) => sum + p.efficiency * p.area * 1000, 0) / 1000;
  }

}

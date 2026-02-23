/**
 * PVGISClient.js
 * Fetches monthly solar irradiance data from the PVGIS API (EU JRC).
 * Computes per-month correction factors relative to the app's clear-sky model,
 * so real cloud cover is reflected in annual energy estimates.
 */

import { SunSimulation } from './SunSimulation.js';

// ASHRAE representative day of month (same as EnergyCalc.js)
const REP_DAY = [17, 16, 16, 15, 15, 11, 17, 16, 15, 15, 14, 10];

/**
 * Fetch monthly mean daily GHI from PVGIS (kWh/m²/day, 12 values).
 * Uses Electron IPC when available (no CORS), falls back to fetch().
 */
async function fetchPVGISMonthlyGHI(lat, lon) {
  let json;
  if (window.electronAPI?.fetchPVGIS) {
    // Electron path: request goes through Node.js main process — no CORS
    json = await window.electronAPI.fetchPVGIS(lat, lon);
  } else {
    // Browser fallback
    const url = `https://re.jrc.ec.europa.eu/api/v5_2/MRcalc?lat=${lat}&lon=${lon}&horirrad=1&outputformat=json&raddatabase=PVGIS-SARAH2`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PVGIS HTTP ${res.status}`);
    json = await res.json();
  }
  // PVGIS returns monthly data either as outputs.monthly (array) or outputs.monthly.fixed
  // depending on the endpoint parameters — handle both structures gracefully.
  const monthly = Array.isArray(json.outputs?.monthly)
    ? json.outputs.monthly
    : json.outputs?.monthly?.fixed;
  if (!Array.isArray(monthly) || monthly.length < 12) {
    throw new Error(`Unexpected PVGIS response: ${JSON.stringify(json.outputs ?? json).slice(0, 200)}`);
  }
  // H(h)_m = monthly mean daily sum of global horizontal irradiance (kWh/m²/day)
  return monthly.map(m => m['H(h)_m'] ?? 0);
}

/**
 * Compute clear-sky daily GHI (kWh/m²/day) for each month's representative day.
 * Integrates GHI over the day in 10-minute steps (same as EnergyCalc).
 */
function computeClearSkyMonthlyGHI(lat, lon, year) {
  const step = 10 / 60; // hours
  return REP_DAY.map((day, m) => {
    const date = new Date(year, m, day);
    let totalWh = 0;
    for (let h = 0; h <= 24; h += step) {
      const pos = SunSimulation.calculateSolarPosition(lat, lon, date, h);
      totalWh += SunSimulation.getGHI(pos.elevation) * step;
    }
    return totalWh / 1000; // Wh → kWh
  });
}

/**
 * Fetch PVGIS data and compute per-month correction factors vs the app's clear-sky model.
 * Returns an array of 12 multipliers (typically 0.4–0.9 for Central Europe).
 * A factor of 1.0 means PVGIS matches clear-sky perfectly (rare; indicates very sunny climate).
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} year
 * @returns {Promise<number[]>} 12 correction factors
 */
export async function fetchPVGISCorrections(lat, lon, year) {
  const [pvgisGHI, clearSkyGHI] = await Promise.all([
    fetchPVGISMonthlyGHI(lat, lon),
    Promise.resolve(computeClearSkyMonthlyGHI(lat, lon, year)),
  ]);
  return pvgisGHI.map((pvgis, i) =>
    clearSkyGHI[i] > 0 ? pvgis / clearSkyGHI[i] : 1.0
  );
}

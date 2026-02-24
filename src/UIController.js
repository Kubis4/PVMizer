/**
 * UIController.js
 * Manages all DOM interactions, chart rendering, stats updates,
 * and new controls: building dims, panel customize, placement toggle,
 * obstacle toolbar, project financial panel.
 */

import { SunSimulation }  from './SunSimulation.js';
import { OBSTACLE_TYPES } from './ObstacleManager.js';
import { setLanguage, getLanguage, t } from './i18n.js';

const fmt     = (v, d = 1) => Number(v).toFixed(d);
const fmtTime = h => {
  const hours = Math.floor(((h % 24) + 24) % 24);
  const mins  = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export class UIController {
  constructor(app) {
    this.app          = app;
    this.powerChart   = null;
    this.monthlyChart = null;
    this._initCharts();
    this._initEvents();
    this._bindSliders();
  }

  // ─── Charts ───────────────────────────────────────────────────────────────
  _initCharts() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color       = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
    Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size   = 10;

    const labels24 = Array.from({ length: 25 }, (_, i) => i % 3 === 0 ? `${i}h` : '');

    this.powerChart = new Chart(document.getElementById('powerChart'), {
      type: 'line',
      data: {
        labels: labels24,
        datasets: [
          {
            label: 'Power (kW)', data: Array(25).fill(0),
            borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',
            borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4
          },
          {
            label: 'Current', data: Array(25).fill(null),
            borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.3)',
            borderWidth: 0, pointRadius: 5,
            pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointBorderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${fmt(ctx.parsed.y, 2)} kW` } }
        },
        scales: {
          x: { ticks: { maxRotation: 0, font: { size: 9 } } },
          y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: v => `${fmt(v)}kW` } }
        }
      }
    });

    const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    this.monthlyChart = new Chart(document.getElementById('monthlyChart'), {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Energy (kWh)', data: Array(12).fill(0),
          backgroundColor: Array.from({ length: 12 }, (_, i) => {
            const t = Math.sin((i / 11) * Math.PI);
            return `rgba(${Math.round(59+t*186)},${Math.round(130+t*28)},${Math.round(246-t*235)},0.75)`;
          }),
          borderRadius: 3, borderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: v => `${fmt(v, 0)}` } }
        }
      }
    });
  }

  updateDayCurve(dayCurve, currentHour, peakKw) {
    if (!this.powerChart) return;
    const hourly = Array(25).fill(0);
    for (const { hour, power } of dayCurve) {
      const idx = Math.round(hour);
      if (idx >= 0 && idx < 25) hourly[idx] = Math.max(hourly[idx], power / 1000);
    }
    this.powerChart.data.datasets[0].data = hourly;

    const currIdx  = Math.round(currentHour);
    const currData = Array(25).fill(null);
    if (currIdx >= 0 && currIdx < 25) currData[currIdx] = hourly[currIdx];
    this.powerChart.data.datasets[1].data = currData;
    this.powerChart.update('none');
  }

  updateMonthlyChart(monthly) {
    if (!this.monthlyChart) return;
    const rounded = monthly.map(v => Math.round(v));
    const max = Math.max(...rounded, 1);
    this.monthlyChart.data.datasets[0].data = rounded;
    this.monthlyChart.data.datasets[0].backgroundColor = rounded.map(v => {
      const t = v / max;
      return `rgba(${Math.round(59+t*186)},${Math.round(130+t*28)},${Math.round(246-t*235)},0.75)`;
    });
    this.monthlyChart.update('none');
  }

  setPVGISStatus(status) {
    const el = document.getElementById('pvgisStatus');
    if (!el) return;
    if (status === 'loading') {
      el.style.display = '';
      el.textContent = '⏳ Loading climate data (PVGIS)…';
      el.className = 'pvgis-status pvgis-loading';
    } else if (status === 'loaded') {
      el.style.display = '';
      el.textContent = '✓ PVGIS climate data applied';
      el.className = 'pvgis-status pvgis-loaded';
    } else if (status === 'error') {
      el.style.display = '';
      el.textContent = '⚠ Climate data unavailable — using clear-sky model';
      el.className = 'pvgis-status pvgis-error';
    } else {
      el.style.display = 'none';
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  updateStats({ currentPowerKw, peakPowerKw, panelCount, totalAreaM2,
                dailyKwh, annualKwh, sunElevation, sunAzimuth, irradiance,
                sunrise, sunset, noon, timeHours, date, roofType }) {
    const pct = peakPowerKw > 0 ? Math.round((currentPowerKw / peakPowerKw) * 100) : 0;
    this._set('currentPower',    fmt(currentPowerKw, 2));
    this._set('powerPercent',    `${pct}%`);
    this._set('peakPower',       `${fmt(peakPowerKw, 2)} kWp`);
    this._set('totalPanels',     panelCount);
    this._set('totalArea',       `${fmt(totalAreaM2, 1)} m\u00b2`);
    this._set('dailyEnergy',     `${fmt(dailyKwh, 1)} kWh`);
    this._set('annualEnergy',    `${fmt(annualKwh / 1000, 2)} MWh`);

    const bar = document.getElementById('powerBar');
    if (bar) bar.style.width = `${Math.min(100, pct)}%`;

    this._set('solarIrradiance', `${Math.round(irradiance)} W/m\u00b2`);
    this._set('solarNoon',       fmtTime(noon));

    this._set('ibTime',          fmtTime(timeHours));
    this._set('ibDate',          date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    this._set('ibPower',         `${fmt(currentPowerKw, 2)} kW`);
    this._set('ibPanels',        panelCount);
    this._set('ibRoofType',      t(`roof.${roofType}`) || roofType.charAt(0).toUpperCase() + roofType.slice(1));

    // Sun dial widget
    this._set('dialTime',      fmtTime(timeHours));
    this._set('dialAzimuth',   `${Math.round(sunAzimuth)}\u00b0`);
    this._set('dialElevation', `${Math.round(sunElevation)}\u00b0`);
    this._set('sunriseTime',   sunrise !== null ? fmtTime(sunrise) : '--:--');
    this._set('sunsetTime',    sunset  !== null ? fmtTime(sunset)  : '--:--');

    // Day length
    if (sunrise !== null && sunset !== null) {
      const dayMin = Math.round((sunset - sunrise) * 60);
      const dh = Math.floor(dayMin / 60);
      const dm = dayMin % 60;
      this._set('dialDayLength', `${dh}h ${String(dm).padStart(2,'0')}m`);
    } else {
      this._set('dialDayLength', '--');
    }

    this._updateSunDial(sunAzimuth, sunElevation, sunrise, sunset, timeHours);
  }

  // ─── Sun Dial SVG update ──────────────────────────────────────────────────
  // Full semicircle = 24 hours: 0:00 (left) → 12:00 (top) → 24:00 (right)
  // Yellow segment = daylight (sunrise→sunset). Sun always ON the arc.
  _updateSunDial(azimuth, elevation, sunrise, sunset, timeHours) {
    const CX = 120, CY = 120, R = 100;

    // Map 0–24h linearly to arc angle PI→0 (left to right)
    const hourToAngle = (h) => Math.PI * (1 - h / 24);

    // Arc point from angle
    const arcPoint = (angle) => ({
      x: CX + R * Math.cos(angle),
      y: CY - R * Math.sin(angle)
    });

    // SVG arc from angle a1 to a2 (a1 > a2 = left to right)
    const makeArc = (a1, a2) => {
      if (a1 - a2 < 0.001) return '';
      const p1 = arcPoint(a1);
      const p2 = arcPoint(a2);
      const largeArc = (a1 - a2) > Math.PI ? 1 : 0;
      return `M ${p1.x},${p1.y} A ${R},${R} 0 ${largeArc},1 ${p2.x},${p2.y}`;
    };

    // Swap compass label for Southern hemisphere
    const compassTop = document.getElementById('dialCompassTop');
    if (compassTop) {
      compassTop.textContent = this.app.state.latitude >= 0 ? 'S' : 'N';
    }

    const isDay = elevation > 0;
    const sunAngle = hourToAngle(timeHours);
    const sunP = arcPoint(sunAngle);

    // Daylight arc (yellow segment from sunrise to sunset)
    const dayArc = document.getElementById('dialDayArc');
    if (dayArc) {
      if (sunrise !== null && sunset !== null && sunrise < sunset) {
        dayArc.setAttribute('d', makeArc(hourToAngle(sunrise), hourToAngle(sunset)));
      } else {
        dayArc.setAttribute('d', '');
      }
    }

    // Elapsed arc (orange, from sunrise to current time — only while daytime)
    const elapsedArc = document.getElementById('dialDayArcElapsed');
    if (elapsedArc) {
      if (sunrise !== null && sunset !== null) {
        if (isDay) {
          elapsedArc.setAttribute('d', makeArc(hourToAngle(sunrise), sunAngle));
        } else if (timeHours >= sunset) {
          elapsedArc.setAttribute('d', makeArc(hourToAngle(sunrise), hourToAngle(sunset)));
        } else {
          elapsedArc.setAttribute('d', '');
        }
      } else {
        elapsedArc.setAttribute('d', '');
      }
    }

    // Sunrise / sunset markers on the arc
    const srM = document.getElementById('dialSunriseMarker');
    const ssM = document.getElementById('dialSunsetMarker');
    if (sunrise !== null && sunset !== null) {
      const srP = arcPoint(hourToAngle(sunrise));
      const ssP = arcPoint(hourToAngle(sunset));
      if (srM) { srM.setAttribute('cx', srP.x); srM.setAttribute('cy', srP.y); }
      if (ssM) { ssM.setAttribute('cx', ssP.x); ssM.setAttribute('cy', ssP.y); }
    }

    // Clear twilight arcs (not needed with 24h arc)
    const twL = document.getElementById('dialTwilightLeft');
    const twR = document.getElementById('dialTwilightRight');
    if (twL) twL.setAttribute('d', '');
    if (twR) twR.setAttribute('d', '');

    // Sun icon — always ON the arc
    const sunIcon = document.getElementById('dialSunIcon');
    const sunGlow = document.getElementById('dialSunGlow');

    let sunColor = '#ffd700';
    let sunOpacity = 1;
    if (!isDay) {
      sunColor = '#4a6fa5';
      sunOpacity = 0.6;
    } else if (elevation < 10) {
      sunColor = elevation < 5 ? '#ff6600' : '#ffaa00';
    }

    if (sunIcon) {
      sunIcon.setAttribute('cx', sunP.x);
      sunIcon.setAttribute('cy', sunP.y);
      sunIcon.setAttribute('fill', sunColor);
      sunIcon.setAttribute('opacity', sunOpacity);
    }
    if (sunGlow) {
      sunGlow.setAttribute('cx', sunP.x);
      sunGlow.setAttribute('cy', sunP.y);
      sunGlow.setAttribute('opacity', isDay ? 0.6 : 0);
    }
  }

  updateProjectPanel(projectData, peakPowerKw, annualKwh) {
    if (!projectData) return;
    const savings  = projectData.getAnnualSavings(annualKwh);
    const cost     = projectData.getSystemCost(peakPowerKw);
    const payback  = projectData.getPaybackPeriod(peakPowerKw, annualKwh);
    const lifetime = projectData.getLifetimeSavings(peakPowerKw, annualKwh);
    const selfRate = projectData.getSelfConsumptionRate(annualKwh);

    this._set('projAnnualProd',  `${fmt(annualKwh / 1000, 1)} MWh`);
    this._set('projAnnualCons',  `${fmt(projectData.annualConsumption / 1000, 1)} MWh`);
    this._set('projSavings',     `\u20ac ${fmt(savings, 0)}`);
    this._set('projSystemCost',  `\u20ac ${fmt(cost, 0)}`);
    this._set('projPayback',     isFinite(payback) ? `${fmt(payback, 1)} yr` : '\u221e');
    this._set('projLifetime',    `\u20ac ${fmt(lifetime, 0)}`);
    this._set('projSelfConsume', `${fmt(selfRate, 0)}%`);
    this._set('projNameDisplay', projectData.name);
  }

  updateSelectedFace(idx, face) {
    const el = document.getElementById('selectedFaceInfo');
    if (!el) return;
    const name = face.orientation.charAt(0).toUpperCase() + face.orientation.slice(1);
    el.textContent = `Face: ${name}  ${fmt(face.width, 1)}m \u00d7 ${fmt(face.height, 1)}m`;
  }

  clearObstacleTool() {
    document.querySelectorAll('.obstacle-btn').forEach(b => b.classList.remove('active'));
  }

  showObstacleControls(obs) {
    this._setObstacleControlsVisible(false);
    if (!obs) return;

    const isSkylight = obs.type === 'skylight';

    if (isSkylight) {
      // Show independent width / length sliders for skylight
      const wRow = document.getElementById('skylightWidthRow');
      const lRow = document.getElementById('skylightLengthRow');
      if (wRow) wRow.style.display = '';
      if (lRow) lRow.style.display = '';
      const wSlider = document.getElementById('skylightWidth');
      const wVal    = document.getElementById('skylightWidthVal');
      const lSlider = document.getElementById('skylightLength');
      const lVal    = document.getElementById('skylightLengthVal');
      if (wSlider) wSlider.value = (obs.scaleX || 1.0).toFixed(1);
      if (wVal)    wVal.textContent = `${(obs.scaleX || 1.0).toFixed(1)}m`;
      if (lSlider) lSlider.value = (obs.scaleZ || 1.0).toFixed(1);
      if (lVal)    lVal.textContent = `${(obs.scaleZ || 1.0).toFixed(1)}m`;
    } else {
      // Show uniform size slider for all other obstacles
      const sizeRow = document.getElementById('obstacleSizeRow');
      if (sizeRow) sizeRow.style.display = '';
      const sizeSlider = document.getElementById('obstacleSize');
      const sizeVal    = document.getElementById('obstacleSizeVal');
      if (sizeSlider) sizeSlider.value = (obs.scale || 1.0).toFixed(1);
      if (sizeVal)    sizeVal.textContent = `${(obs.scale || 1.0).toFixed(1)}×`;
    }

    // Rotate row always shown when an obstacle is selected
    const rotRow  = document.getElementById('obstacleRotateRow');
    if (rotRow) rotRow.style.display = '';
    const rotSlider = document.getElementById('obstacleRotate');
    const rotVal    = document.getElementById('obstacleRotateVal');
    if (rotSlider) rotSlider.value = Math.round(obs.rotationY || 0);
    if (rotVal)    rotVal.textContent = `${Math.round(obs.rotationY || 0)}°`;

    // Show the controls wrapper row (sliders are now visible)
    const wrapper = document.getElementById('obstacleControlsRow');
    if (wrapper) wrapper.style.display = '';
  }

  _setObstacleControlsVisible(visible) {
    ['obstacleSizeRow', 'obstacleRotateRow', 'skylightWidthRow', 'skylightLengthRow'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? '' : 'none';
    });
    // Also hide/show the controls wrapper row
    const wrapper = document.getElementById('obstacleControlsRow');
    if (wrapper) wrapper.style.display = visible ? '' : 'none';
  }

  _set(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  _initEvents() {
    // Roof type buttons
    document.querySelectorAll('.roof-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.roof-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.setRoofType(btn.dataset.roof);
        this._updateRoofSpecificUI(btn.dataset.roof);
      });
    });

    // Location presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const lat = parseFloat(btn.dataset.lat);
        const lon = parseFloat(btn.dataset.lon);
        document.getElementById('latitude').value   = lat;
        document.getElementById('longitude').value  = lon;
        document.getElementById('latitudeVal').textContent  = `${lat.toFixed(1)}\u00b0`;
        document.getElementById('longitudeVal').textContent = `${lon.toFixed(1)}\u00b0`;
        this.app.state.latitude  = lat;
        this.app.state.longitude = lon;
        this.app.onLocationChange();
        this.updateEquatorLayoutLabel(lat);
      });
    });

    // Collapse buttons
    const controlPanel  = document.getElementById('controlPanel');
    const statsPanel    = document.getElementById('statsPanel');
    const restoreLeft   = document.getElementById('restoreLeft');
    const restoreRight  = document.getElementById('restoreRight');

    document.getElementById('collapseLeft')?.addEventListener('click', () => {
      const collapsed = controlPanel.classList.toggle('collapsed');
      restoreLeft?.classList.toggle('visible', collapsed);
    });
    document.getElementById('collapseRight')?.addEventListener('click', () => {
      const collapsed = statsPanel.classList.toggle('collapsed');
      restoreRight?.classList.toggle('visible', collapsed);
    });

    restoreLeft?.addEventListener('click', () => {
      controlPanel.classList.remove('collapsed');
      restoreLeft.classList.remove('visible');
    });
    restoreRight?.addEventListener('click', () => {
      statsPanel.classList.remove('collapsed');
      restoreRight.classList.remove('visible');
    });

    // Visual toggles
    document.getElementById('showShadows')?.addEventListener('change', e => {
      this.app.state.shadowsEnabled = e.target.checked;
      this.app.renderer.shadowMap.enabled = e.target.checked;
    });
    document.getElementById('showSunPath')?.addEventListener('change', e => {
      this.app.state.showSunPath = e.target.checked;
      this.app.sunSim.updateTrajectory(
        this.app.state.latitude, this.app.state.longitude,
        this.app.state.date, e.target.checked
      );
    });
    document.getElementById('showGround')?.addEventListener('change', e => {
      if (this.app.groundMesh) this.app.groundMesh.visible = e.target.checked;
    });
    // Heatmap toggle button in info bar
    document.getElementById('heatmapToggleBtn')?.addEventListener('click', () => {
      const on = !this.app.state.showHeatmap;
      this.app.state.showHeatmap = on;
      document.getElementById('heatmapToggleBtn')?.classList.toggle('active', on);
      const legend = document.getElementById('heatmapLegend');
      if (legend) legend.style.display = on ? '' : 'none';
    });
    document.getElementById('autoAdvance')?.addEventListener('change', e => {
      this.app.state.autoAdvance = e.target.checked;
    });

    // Panel tilt (flat roof only)
    document.getElementById('panelTilt')?.addEventListener('input', e => {
      this.app.state.panelTilt = parseFloat(e.target.value);
      document.getElementById('panelTiltVal').textContent = `${e.target.value}\u00b0`;
      this.app.rebuildPanels();
    });

    // Panel side tilt (pitched roofs only — gable, hip, pyramid)
    document.getElementById('panelSideTilt')?.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      this.app.state.panelSideTilt = v;
      const sign = v > 0 ? '+' : '';
      document.getElementById('panelSideTiltVal').textContent = `${sign}${v}\u00b0`;
      this.app.rebuildPanels();
    });

    // Panel customize toggle
    document.getElementById('customizeToggleBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('customizePanel');
      if (panel) {
        const open = panel.classList.toggle('expanded');
        document.getElementById('customizeToggleBtn').textContent = open ? '\u2699 Customize \u25b2' : '\u2699 Customize \u25bc';
      }
    });

    // Location Advanced toggle
    document.getElementById('locationAdvancedBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('locationAdvancedPanel');
      if (panel) {
        const open = panel.classList.toggle('expanded');
        document.getElementById('locationAdvancedBtn').textContent = open ? '\uD83D\uDCCD Advanced \u25b2' : '\uD83D\uDCCD Advanced \u25bc';
      }
    });

    // Panel orientation buttons (global — clears any per-face overrides so it applies uniformly)
    document.querySelectorAll('.orientation-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.orientation-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.state.panelOrientation = btn.dataset.orient;
        // Clear per-face orientation overrides so global setting takes effect on all faces
        for (const conf of Object.values(this.app.state.faceConfig)) {
          delete conf.panelOrientation;
        }
        this.app.rebuildPanels();
      });
    });

    // Flat-roof layout buttons (South / E-W)
    document.querySelectorAll('.layout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.state.flatLayout = btn.dataset.layout;
        this.app.rebuildPanels();
      });
    });

    // Fill strategy buttons (global default) — exclude per-face buttons
    document.querySelectorAll('.fill-btn:not(.face-fill-btn):not(.face-orient-btn)').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fill-btn:not(.face-fill-btn):not(.face-orient-btn)').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.state.fillStrategy = btn.dataset.fill;
        this.app.rebuildPanels();
      });
    });

    // Per-face fill strategy buttons
    document.querySelectorAll('.face-fill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = this.app.state.selectedFace;
        if (idx === null || idx === undefined) return;
        if (!this.app.state.faceConfig[idx]) this.app.state.faceConfig[idx] = {};
        this.app.state.faceConfig[idx].fillStrategy = btn.dataset.fill;
        document.querySelectorAll('.face-fill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.rebuildPanels();
      });
    });

    // Per-face reset button
    document.getElementById('faceConfigReset')?.addEventListener('click', () => {
      const idx = this.app.state.selectedFace;
      if (idx === null || idx === undefined) return;
      delete this.app.state.faceConfig[idx];
      this.app.rebuildPanels();
      this.showFaceConfig(idx, this.app.state.faceConfig, null, this.app.state);
    });

    // Weather selector
    document.getElementById('weatherSelect')?.addEventListener('change', e => {
      this.app.setWeather(e.target.value);
    });

    // Obstacle toolbar
    document.querySelectorAll('.obstacle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (this.app.obstacleManager.getActiveTool() === type) {
          this.app.obstacleManager.cancelTool();
          btn.classList.remove('active');
        } else {
          document.querySelectorAll('.obstacle-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.app.obstacleManager.activateTool(type);
        }
      });
    });

    document.getElementById('deleteAllObstaclesBtn')?.addEventListener('click', () => {
      this.app.obstacleManager.deleteAll();
      this.app.rebuildPanels();
      document.querySelectorAll('.obstacle-btn').forEach(b => b.classList.remove('active'));
      this._setObstacleControlsVisible(false);
    });

    // Obstacle size slider (non-skylight obstacles)
    document.getElementById('obstacleSize')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('obstacleSizeVal').textContent = `${v.toFixed(1)}×`;
      this.app.obstacleManager.setSelectedScale(v);
      this.app.rebuildPanels();
    });

    // Skylight width slider
    document.getElementById('skylightWidth')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('skylightWidthVal').textContent = `${v.toFixed(1)}m`;
      this.app.obstacleManager.setSelectedScaleXZ(v, this.app.obstacleManager.getSelectedScaleZ());
      this.app.rebuildPanels();
    });

    // Skylight length slider
    document.getElementById('skylightLength')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('skylightLengthVal').textContent = `${v.toFixed(1)}m`;
      this.app.obstacleManager.setSelectedScaleXZ(this.app.obstacleManager.getSelectedScaleX(), v);
      this.app.rebuildPanels();
    });

    // Obstacle rotate slider
    document.getElementById('obstacleRotate')?.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      document.getElementById('obstacleRotateVal').textContent = `${v}°`;
      this.app.obstacleManager.setSelectedRotation(v);
      this.app.rebuildPanels?.();
    });

    // Sandbox panel limit input
    document.getElementById('sandboxPanelLimit')?.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (this.app.state) this.app.state.manualPanelLimit = (v > 0) ? v : 0;
      this.app.rebuildPanels?.();
    });
    document.getElementById('clearSandboxLimit')?.addEventListener('click', () => {
      const inp = document.getElementById('sandboxPanelLimit');
      if (inp) inp.value = '';
      if (this.app.state) this.app.state.manualPanelLimit = 0;
      this.app.rebuildPanels?.();
    });

    // Help button
    document.getElementById('helpBtn')?.addEventListener('click', () => {
      this.app.helpModal.toggle();
    });

    // Home / back-to-project button
    document.getElementById('homeBtn')?.addEventListener('click', () => {
      if (this.app.resetToDefaults) this.app.resetToDefaults();
      if (this.app.startupScreen) this.app.startupScreen.show();
    });

    // Save project button (icon next to project name header)
    document.getElementById('saveProjectBtn')?.addEventListener('click', async () => {
      if (this.app.saveProject) await this.app.saveProject();
    });

    // Load project button (in sidebar header)
    document.getElementById('loadProjectBtn')?.addEventListener('click', async () => {
      if (this.app.loadProject) await this.app.loadProject();
    });

    // PDF export button (icon next to project name header)
    document.getElementById('exportPdfBtn')?.addEventListener('click', async () => {
      const { exportProjectPDF } = await import('./PdfExport.js');
      const stats = this.app.getCurrentStats();
      await exportProjectPDF(
        this.app.state.projectData,
        stats,
        this.app.renderer.domElement,
        this.app.getChartsForExport(),
        { renderer: this.app.renderer, composer: this.app.composer, camera: this.app.camera }
      );
    });

    // Clickable project name → edit project data
    document.getElementById('projectNameText')?.addEventListener('click', () => {
      if (!this.app.state.projectData || !this.app.startupScreen) return;
      const pd = this.app.state.projectData;
      this.app.startupScreen.showEditForm({
        name:              pd.name,
        roofType:          pd.roofType,
        houseWidth:        pd.houseWidth,
        houseDepth:        pd.houseDepth,
        wallHeight:        pd.wallHeight,
        roofPitch:         pd.roofPitch,
        annualConsumption: pd.annualConsumption,
        tariff:            pd.tariff,
        feedInTariff:      pd.feedInTariff,
        lifetime:          pd.lifetime,
        costPerKwp:        pd.costPerKwp,
      });
    });

    // Settings button + modal
    const settingsOverlay = document.getElementById('settingsOverlay');
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      if (settingsOverlay) settingsOverlay.style.display = 'flex';
    });
    document.getElementById('settingsClose')?.addEventListener('click', () => {
      if (settingsOverlay) settingsOverlay.style.display = 'none';
    });
    settingsOverlay?.addEventListener('click', e => {
      if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
    });

    // ── Language selector ────────────────────────────────────────────────────
    const langSelect = document.getElementById('languageSelect');
    // Sync select to the language already loaded from localStorage
    const savedLang = localStorage.getItem('pvmizer-lang');
    if (savedLang && langSelect) langSelect.value = savedLang;
    langSelect?.addEventListener('change', e => {
      setLanguage(e.target.value);
    });

    // ── Settings modal toggles ──────────────────────────────────────────────
    document.getElementById('showShadows')?.addEventListener('change', e => {
      this.app.state.shadowsEnabled = e.target.checked;
      this.app.renderer.shadowMap.enabled = e.target.checked;
    });
    document.getElementById('showGround')?.addEventListener('change', e => {
      if (this.app.groundMesh) this.app.groundMesh.visible = e.target.checked;
    });
    document.getElementById('showSunPath')?.addEventListener('change', e => {
      this.app.state.showSunPath = e.target.checked;
      this.app.sunSim.updateTrajectory(
        this.app.state.latitude, this.app.state.longitude,
        this.app.state.date, e.target.checked
      );
    });
    document.getElementById('showCompass')?.addEventListener('change', e => {
      const visible = e.target.checked;
      this.app.scene.traverse(obj => {
        if (obj.name && obj.name.startsWith('compass_')) obj.visible = visible;
      });
    });

    // ── Settings modal sliders ──────────────────────────────────────────────
    document.getElementById('exposureSlider')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('exposureVal').textContent = v.toFixed(2);
      this.app.renderer.toneMappingExposure = v;
    });
    document.getElementById('bloomSlider')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('bloomVal').textContent = v.toFixed(2);
      if (this.app.bloomPass) this.app.bloomPass.strength = v;
    });
    document.getElementById('fogDensity')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('fogDensityVal').textContent = v.toFixed(3);
      if (this.app.scene.fog) this.app.scene.fog.density = v;
    });
    // God rays toggle
    document.getElementById('showGodRays')?.addEventListener('change', e => {
      this.app.state.showGodRays = e.target.checked;
      if (this.app.godRays) this.app.godRays.enabled = e.target.checked;
    });
    // God ray intensity slider
    document.getElementById('godRaySlider')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('godRayVal').textContent = v.toFixed(2);
      this.app.state.godRayIntensity = v;
      if (this.app.godRays) this.app.godRays.intensity = v;
    });
  }

  _bindSliders() {
    const sliders = [
      // Roof
      { id: 'roofPitch',      valId: 'roofPitchVal',      fmt: v => `${Math.round(v)}\u00b0`,
        onChange: v => { this.app.state.roofPitch = v; this.app.rebuildRoof(); } },
      { id: 'ridgeLength',    valId: 'ridgeLengthVal',    fmt: v => `${parseFloat(v).toFixed(1)}m`,
        onChange: v => { this.app.state.ridgeLength = v; this.app.rebuildRoof(); } },
      // Building dims
      { id: 'houseWidth',       valId: 'houseWidthVal',       fmt: v => `${parseFloat(v).toFixed(1)}m`,
        onChange: v => { this.app.state.houseWidth = parseFloat(v); this.app.rebuildRoof(); } },
      { id: 'houseDepth',       valId: 'houseDepthVal',       fmt: v => `${parseFloat(v).toFixed(1)}m`,
        onChange: v => { this.app.state.houseDepth = parseFloat(v); this.app.rebuildRoof(); } },
      { id: 'wallHeight',       valId: 'wallHeightVal',       fmt: v => `${parseFloat(v).toFixed(2)}m`,
        onChange: v => { this.app.state.wallHeight = parseFloat(v); this.app.rebuildRoof(); } },
      { id: 'buildingRotation', valId: 'buildingRotationVal', fmt: v => `${Math.round(v)}\u00b0`,
        onChange: v => { this.app.setBuildingRotation(parseFloat(v)); } },
      // Panel basics
      { id: 'panelGap',         valId: 'panelGapVal',         fmt: v => `${parseFloat(v).toFixed(2)}m`,
        onChange: v => { this.app.state.panelGap = parseFloat(v); this.app.rebuildPanels(); } },
      { id: 'panelNominalWp',   valId: 'panelNominalWpVal',   fmt: v => `${Math.round(v)} Wp`,
        onChange: v => { this.app.state.panelNominalWp = parseInt(v, 10); this.app.rebuildPanels(); } },
      // Panel customize
      { id: 'panelWidth',     valId: 'panelWidthVal',     fmt: v => `${parseFloat(v).toFixed(2)}m`,
        onChange: v => { this.app.state.panelWidth = parseFloat(v); this.app.setPanelDimensions(); } },
      { id: 'panelHeight',    valId: 'panelHeightVal',    fmt: v => `${parseFloat(v).toFixed(2)}m`,
        onChange: v => { this.app.state.panelHeight = parseFloat(v); this.app.setPanelDimensions(); } },
      // Location
      { id: 'latitude',       valId: 'latitudeVal',       fmt: v => `${parseFloat(v).toFixed(1)}\u00b0`,
        onChange: v => { this.app.state.latitude = parseFloat(v); this.app.onLocationChange(); this.updateEquatorLayoutLabel(parseFloat(v)); } },
      { id: 'longitude',      valId: 'longitudeVal',      fmt: v => `${parseFloat(v).toFixed(1)}\u00b0`,
        onChange: v => { this.app.state.longitude = parseFloat(v); this.app.onLocationChange(); } },
      // Time
      { id: 'simTime',        valId: 'simTimeVal',        fmt: v => fmtTime(parseFloat(v)),
        onChange: v => { this.app.state.timeHours = parseFloat(v); } },
      { id: 'simSpeed',       valId: 'simSpeedVal',       fmt: v => `${Math.round(v)}x`,
        onChange: v => { this.app.state.simSpeed = parseFloat(v); } },
    ];

    for (const s of sliders) {
      const el    = document.getElementById(s.id);
      const valEl = document.getElementById(s.valId);
      if (!el) continue;
      el.addEventListener('input', () => {
        if (valEl) valEl.textContent = s.fmt(el.value);
        s.onChange(el.value);
      });
    }

    // Date picker
    const dateEl = document.getElementById('simDate');
    if (dateEl) {
      const today = new Date();
      dateEl.value = today.toISOString().split('T')[0];
      this.app.state.date = today;
      dateEl.addEventListener('change', e => {
        this.app.state.date = new Date(e.target.value + 'T12:00:00');
        this.app.onLocationChange();
      });
    }
  }

  showFaceConfig(faceIdx, faceConfig, roofFaces, appState) {
    const panel = document.getElementById('faceConfigPanel');
    if (!panel) return;
    if (faceIdx === null || faceIdx === undefined) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    // Show face name if roofFaces available
    const nameEl = document.getElementById('faceConfigName');
    if (nameEl && roofFaces && roofFaces[faceIdx]) {
      const orient = roofFaces[faceIdx].orientation;
      nameEl.textContent = `${faceIdx + 1} (${orient.charAt(0).toUpperCase() + orient.slice(1)})`;
    } else if (nameEl) {
      nameEl.textContent = `${faceIdx + 1}`;
    }
    // Highlight active fill strategy buttons based on per-face config or global default
    const conf = faceConfig[faceIdx] || {};
    const activeFill = conf.fillStrategy || (appState ? appState.fillStrategy : 'bottom-up');
    document.querySelectorAll('.face-fill-btn').forEach(b => {
      b.classList.toggle('active', activeFill === b.dataset.fill);
    });
  }

  /** Update the "South / North" single-tilt layout button label based on hemisphere. */
  updateEquatorLayoutLabel(latitude) {
    const btn = document.querySelector('.layout-btn[data-layout="south"]');
    if (!btn) return;
    btn.textContent = latitude >= 0 ? t('layout.south') : t('layout.north');
  }

  _updateRoofSpecificUI(roofType) {
    const ridgeRow      = document.getElementById('ridgeLengthRow');
    const pitchRow      = document.getElementById('pitchAngleRow');
    const flatOptions   = document.getElementById('flatRoofOptions');
    // Ridge Length: only visible for hip roofs
    if (ridgeRow) {
      ridgeRow.style.display = roofType === 'hip' ? '' : 'none';
      ridgeRow.classList.toggle('disabled', roofType !== 'hip');
      const input = ridgeRow.querySelector('input');
      if (input) input.disabled = roofType !== 'hip';
    }
    // Flat-roof layout options (tilt + layout toggle): only for flat roofs
    if (flatOptions) flatOptions.style.display = roofType === 'flat' ? '' : 'none';
    // Pitch angle: hidden for flat roofs (no slope)
    if (pitchRow) {
      pitchRow.style.display = roofType === 'flat' ? 'none' : '';
      const input = pitchRow.querySelector('input');
      if (input) input.disabled = roofType === 'flat';
    }
    // Side tilt: only meaningful for pitched roofs
    const sideTiltRow = document.getElementById('panelSideTiltRow');
    if (sideTiltRow) sideTiltRow.style.display = roofType === 'flat' ? 'none' : '';
  }

  init() {
    this._updateRoofSpecificUI(this.app.state.roofType);
    const dateEl = document.getElementById('simDate');
    if (dateEl && this.app.state.date) {
      dateEl.value = this.app.state.date.toISOString().split('T')[0];
    }
    this._setObstacleControlsVisible(false);

    // Sync time slider to default state
    const slider = document.getElementById('simTime');
    const valEl  = document.getElementById('simTimeVal');
    if (slider) slider.value = this.app.state.timeHours;
    if (valEl)  valEl.textContent = '10:00';

    // Sync autoAdvance checkbox
    const cb = document.getElementById('autoAdvance');
    if (cb) cb.checked = this.app.state.autoAdvance;

    // Mouse wheel on sun dial widget → adjust time
    const dialWidget = document.querySelector('.sun-dial-widget');
    if (dialWidget) {
      dialWidget.addEventListener('wheel', e => {
        e.preventDefault();
        e.stopPropagation();

        const step = 0.25; // 15-minute increments
        const delta = e.deltaY < 0 ? step : -step;
        this._adjustTime(delta);
      }, { passive: false });
    }

    // Draggable sun icon on the arc
    this._initSunDrag();
  }

  // ─── Helper: adjust time by delta hours ─────────────────────────────────
  _adjustTime(delta) {
    this.app.state.timeHours += delta;

    if (this.app.state.timeHours >= 24) {
      this.app.state.timeHours -= 24;
      this.app.state.date = new Date(this.app.state.date.getTime() + 86400000);
    } else if (this.app.state.timeHours < 0) {
      this.app.state.timeHours += 24;
      this.app.state.date = new Date(this.app.state.date.getTime() - 86400000);
    }

    this._syncTimeDisplay();
  }

  _setTime(hours) {
    this.app.state.timeHours = Math.max(0, Math.min(24, hours));
    this._syncTimeDisplay();
  }

  _syncTimeDisplay() {
    const tSlider = document.getElementById('simTime');
    const tVal    = document.getElementById('simTimeVal');
    if (tSlider) tSlider.value = this.app.state.timeHours;
    if (tVal)    tVal.textContent = fmtTime(this.app.state.timeHours);
  }

  // ─── Draggable sun on the arc ───────────────────────────────────────────
  _initSunDrag() {
    const svg = document.querySelector('.dial-svg');
    const sunIcon = document.getElementById('dialSunIcon');
    if (!svg || !sunIcon) return;

    let dragging = false;

    const svgPointFromEvent = (e) => {
      const pt = svg.createSVGPoint();
      const touch = e.touches ? e.touches[0] : e;
      pt.x = touch.clientX;
      pt.y = touch.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };

    const angleToTime = (arcAngle) => {
      // 24h linear mapping: PI=0:00(left), PI/2=12:00(top), 0=24:00(right)
      return 24 * (1 - arcAngle / Math.PI);
    };

    const mouseToArcAngle = (e) => {
      const p = svgPointFromEvent(e);
      const CX = 120, CY = 120;
      const dx = p.x - CX;
      const dy = CY - p.y;
      // atan2(dy, dx) where dx>0 is right (angle 0=W), dx<0 is left (angle PI=E)
      // For our arc: x = CX + R*cos(angle), so cos(angle) = dx/R
      let angle = Math.atan2(dy, dx);
      return Math.max(0, Math.min(Math.PI, angle));
    };

    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      const angle = mouseToArcAngle(e);
      this._setTime(angleToTime(angle));
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      sunIcon.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    const onStart = (e) => {
      dragging = true;
      sunIcon.style.cursor = 'grabbing';
      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    };

    sunIcon.addEventListener('mousedown', onStart);
    sunIcon.addEventListener('touchstart', onStart, { passive: false });

    // Click anywhere on the arc to set time
    svg.addEventListener('click', (e) => {
      if (dragging) return;
      const p = svgPointFromEvent(e);
      const CY = 120;
      if ((CY - p.y) < -5) return; // ignore clicks below horizon
      const angle = mouseToArcAngle(e);
      this._setTime(angleToTime(angle));
    });
  }
}

/**
 * UIController.js
 * Manages all DOM interactions, chart rendering, stats updates,
 * and new controls: building dims, panel customize, placement toggle,
 * obstacle toolbar, project financial panel.
 */

import { SunSimulation }  from './SunSimulation.js';
import { OBSTACLE_TYPES } from './ObstacleManager.js';

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
    this.monthlyChart.data.datasets[0].data = monthly.map(v => Math.round(v));
    this.monthlyChart.update('none');
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
    this._set('co2Saved',        `${fmt((annualKwh * 0.275) / 1000, 2)} t/yr`);

    const bar = document.getElementById('powerBar');
    if (bar) bar.style.width = `${Math.min(100, pct)}%`;

    this._set('solarIrradiance', `${Math.round(irradiance)} W/m\u00b2`);
    this._set('solarNoon',       fmtTime(noon));

    this._set('ibTime',          fmtTime(timeHours));
    this._set('ibDate',          date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    this._set('ibPower',         `${fmt(currentPowerKw, 2)} kW`);
    this._set('ibPanels',        panelCount);
    this._set('ibRoofType',      roofType.charAt(0).toUpperCase() + roofType.slice(1));

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
  _updateSunDial(azimuth, elevation, sunrise, sunset, timeHours) {
    // Arc geometry: semicircle from (20,120) to (220,120), center (120,120), r=100
    // Angle 0 = West (left), PI = East (right) — maps azimuth 270°→0, 180°→PI/2, 90°→PI
    const CX = 120, CY = 120, R = 100;

    // Convert azimuth (0=N, 90=E, 180=S, 270=W) to arc angle (0=W, PI/2=S, PI=E)
    const azToAngle = (az) => {
      // Normalize: W=270→0, S=180→PI/2, E=90→PI
      const a = ((270 - az + 360) % 360) * Math.PI / 180;
      return Math.max(0, Math.min(Math.PI, a));
    };

    const arcPoint = (angle) => ({
      x: CX - R * Math.cos(angle),
      y: CY - R * Math.sin(angle)
    });

    // Make SVG arc path from angle1 to angle2
    const makeArc = (a1, a2) => {
      if (a1 >= a2) return '';
      const p1 = arcPoint(a1);
      const p2 = arcPoint(a2);
      const largeArc = (a2 - a1) > Math.PI ? 1 : 0;
      return `M ${p1.x},${p1.y} A ${R},${R} 0 ${largeArc},1 ${p2.x},${p2.y}`;
    };

    // Daylight arc: sunrise to sunset
    if (sunrise !== null && sunset !== null) {
      const sunriseAngle = azToAngle(SunSimulation.calculateSolarPosition(
        this.app.state.latitude, this.app.state.longitude, this.app.state.date, sunrise).azimuth);
      const sunsetAngle  = azToAngle(SunSimulation.calculateSolarPosition(
        this.app.state.latitude, this.app.state.longitude, this.app.state.date, sunset).azimuth);

      const a1 = Math.min(sunriseAngle, sunsetAngle);
      const a2 = Math.max(sunriseAngle, sunsetAngle);

      const dayArc = document.getElementById('dialDayArc');
      if (dayArc) dayArc.setAttribute('d', makeArc(a1, a2) || `M 20,120 A 100,100 0 0,1 220,120`);

      // Sunrise / sunset marker positions
      const sp1 = arcPoint(sunriseAngle);
      const sp2 = arcPoint(sunsetAngle);
      const srM = document.getElementById('dialSunriseMarker');
      const ssM = document.getElementById('dialSunsetMarker');
      if (srM) { srM.setAttribute('cx', sp1.x); srM.setAttribute('cy', sp1.y); }
      if (ssM) { ssM.setAttribute('cx', sp2.x); ssM.setAttribute('cy', sp2.y); }

      // Twilight arcs (dawn before sunrise, dusk after sunset)
      const dawnStart = Math.max(0, sunrise - 1);   // ~1h before sunrise
      const duskEnd   = Math.min(24, sunset + 1);    // ~1h after sunset
      const dawnAngle = azToAngle(SunSimulation.calculateSolarPosition(
        this.app.state.latitude, this.app.state.longitude, this.app.state.date, dawnStart).azimuth);
      const duskAngle = azToAngle(SunSimulation.calculateSolarPosition(
        this.app.state.latitude, this.app.state.longitude, this.app.state.date, duskEnd).azimuth);

      const twL = document.getElementById('dialTwilightLeft');
      const twR = document.getElementById('dialTwilightRight');
      if (twL) twL.setAttribute('d', makeArc(Math.min(dawnAngle, sunriseAngle), Math.max(dawnAngle, sunriseAngle)));
      if (twR) twR.setAttribute('d', makeArc(Math.min(sunsetAngle, duskAngle), Math.max(sunsetAngle, duskAngle)));
    }

    // Sun position on the arc
    const sunAngle = azToAngle(azimuth);
    const sunP     = arcPoint(sunAngle);
    const sunIcon  = document.getElementById('dialSunIcon');
    const sunGlow  = document.getElementById('dialSunGlow');
    const isDay    = elevation > 0;

    if (sunIcon) {
      sunIcon.setAttribute('cx', sunP.x);
      sunIcon.setAttribute('cy', isDay ? sunP.y : CY);
      sunIcon.setAttribute('opacity', isDay ? '1' : '0.3');
      sunIcon.setAttribute('fill', isDay ? '#ffd700' : '#888');
    }
    if (sunGlow) {
      sunGlow.setAttribute('cx', sunP.x);
      sunGlow.setAttribute('cy', isDay ? sunP.y : CY);
      sunGlow.setAttribute('opacity', isDay ? '0.6' : '0');
    }
  }

  updateProjectPanel(projectData, peakPowerKw, annualKwh) {
    if (!projectData) return;
    const savings  = projectData.getAnnualSavings(annualKwh);
    const cost     = projectData.getSystemCost(peakPowerKw);
    const payback  = projectData.getPaybackPeriod(peakPowerKw, annualKwh);
    const lifetime = projectData.getLifetimeSavings(peakPowerKw, annualKwh);
    const co2      = projectData.getCO2Reduction(annualKwh);
    const selfRate = projectData.getSelfConsumptionRate(annualKwh);

    this._set('projAnnualProd',  `${fmt(annualKwh / 1000, 1)} MWh`);
    this._set('projAnnualCons',  `${fmt(projectData.annualConsumption / 1000, 1)} MWh`);
    this._set('projSavings',     `\u20ac ${fmt(savings, 0)}`);
    this._set('projSystemCost',  `\u20ac ${fmt(cost, 0)}`);
    this._set('projPayback',     isFinite(payback) ? `${fmt(payback, 1)} yr` : '\u221e');
    this._set('projLifetime',    `\u20ac ${fmt(lifetime, 0)}`);
    this._set('projCO2',         `${fmt(co2, 1)} t`);
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
    this._setObstacleControlsVisible(!!obs);
    if (obs) {
      const sizeSlider = document.getElementById('obstacleSize');
      const sizeVal    = document.getElementById('obstacleSizeVal');
      if (sizeSlider) sizeSlider.value = (obs.scale || 1.0).toFixed(1);
      if (sizeVal)    sizeVal.textContent = `${(obs.scale || 1.0).toFixed(1)}×`;

      const rotSlider = document.getElementById('obstacleRotate');
      const rotVal    = document.getElementById('obstacleRotateVal');
      if (rotSlider) rotSlider.value = Math.round(obs.rotationY || 0);
      if (rotVal)    rotVal.textContent = `${Math.round(obs.rotationY || 0)}°`;
    }
  }

  _setObstacleControlsVisible(visible) {
    const sizeRow = document.getElementById('obstacleSizeRow');
    const rotRow  = document.getElementById('obstacleRotateRow');
    if (sizeRow) sizeRow.style.display = visible ? '' : 'none';
    if (rotRow)  rotRow.style.display  = visible ? '' : 'none';
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

    // Panel orientation buttons
    document.querySelectorAll('.orientation-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.orientation-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.state.panelOrientation = btn.dataset.orient;
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

    // Obstacle size slider
    document.getElementById('obstacleSize')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      document.getElementById('obstacleSizeVal').textContent = `${v.toFixed(1)}×`;
      this.app.obstacleManager.setSelectedScale(v);
      this.app.rebuildPanels();
    });

    // Obstacle rotate slider
    document.getElementById('obstacleRotate')?.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      document.getElementById('obstacleRotateVal').textContent = `${v}°`;
      this.app.obstacleManager.setSelectedRotation(v);
    });

    // Help button
    document.getElementById('helpBtn')?.addEventListener('click', () => {
      this.app.helpModal.toggle();
    });

    // Home / back-to-project button
    document.getElementById('homeBtn')?.addEventListener('click', () => {
      if (this.app.startupScreen) this.app.startupScreen.show();
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

  /** Update the "South / North" single-tilt layout button label based on hemisphere. */
  updateEquatorLayoutLabel(latitude) {
    const btn = document.querySelector('.layout-btn[data-layout="south"]');
    if (!btn) return;
    btn.innerHTML = latitude >= 0 ? '&#x2600; South' : '&#x2600; North';
  }

  _updateRoofSpecificUI(roofType) {
    const ridgeRow      = document.getElementById('ridgeLengthRow');
    const pitchRow      = document.getElementById('pitchAngleRow');
    const flatOptions   = document.getElementById('flatRoofOptions');
    // Ridge Length: visible always, greyed out when not hip
    if (ridgeRow) {
      ridgeRow.classList.toggle('disabled', roofType !== 'hip');
      const input = ridgeRow.querySelector('input');
      if (input) input.disabled = roofType !== 'hip';
    }
    // Flat-roof layout options (tilt + layout toggle): only for flat roofs
    if (flatOptions) flatOptions.style.display = roofType === 'flat' ? '' : 'none';
    // Grey out pitch angle for flat roofs (no slope to configure)
    if (pitchRow) pitchRow.classList.toggle('disabled', roofType === 'flat');
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
  }
}

/**
 * main.js — Solar Panel Roof Simulation
 * Orchestrates scene, roof, panels, sun, energy, obstacles, grid & UI.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

import { SunSimulation }                   from './SunSimulation.js';
import { ROOF_BUILDERS, createGround }     from './RoofSystem.js';
import { SolarPanels }                     from './SolarPanels.js';
import { EnergyCalc, setPanelDimensions, setTempCoeff } from './EnergyCalc.js';
import { UIController }                    from './UIController.js';
import { StartupScreen }                   from './StartupScreen.js';
import { ProjectData }                     from './ProjectData.js';
import { HelpModal }                       from './HelpModal.js';
import { ObstacleManager, OBSTACLE_TYPES } from './ObstacleManager.js';
import { PanelRecommender }               from './PanelRecommender.js';
import { WeatherEffects }                from './WeatherEffects.js';
import { setLanguage }                   from './i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// Application state
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  // Roof & building
  roofType:      'flat',
  roofPitch:      30,
  ridgeLength:    4,
  houseWidth:     10,
  houseDepth:     10,
  wallHeight:     3,

  // Panel settings
  panelNominalWp:  440,     // Watts peak per panel (determines efficiency)
  panelEfficiency: 0.20,    // derived: panelNominalWp / (panelW * panelH * 1000)
  panelGap:        0.10,
  panelTilt:       15,
  panelWidth:      1.0,
  panelHeight:     1.65,
  panelTempCoeff:  0.004,

  // Panel orientation & flat-roof layout
  panelOrientation: 'portrait',  // 'portrait' | 'landscape'
  flatLayout:       'south',     // 'south' | 'east-west'  (flat roof only)

  // Face selection — user can click numbered face labels to toggle panels
  activeFaces:     new Set(), // face indices that have panels

  // Building
  buildingRotation: 0,        // degrees, Y axis

  // Location & time
  latitude:        48.3,
  longitude:       18.1,
  date:            new Date(),
  timeHours:       10,        // start at 10:00
  simSpeed:        60,
  autoAdvance:     false,     // manual time control by default

  // Visual
  shadowsEnabled:  true,
  showSunPath:     true,
  showHeatmap:     false,

  // App mode
  appMode:         'sandbox',  // 'sandbox' | 'project'
  projectData:     null,       // ProjectData instance when in project mode

  // Weather
  weatherCondition:  'clear',
  weatherMultiplier: 1.0,

  // PVGIS real irradiance data (project mode only)
  pvgisCorrections: null,  // Array<number>[12] | null
  pvgisLoading:     false,

  // Panel fill strategy
  fillStrategy:    'bottom-up',  // 'bottom-up' | 'top-down' | 'center-out'

  // Per-face overrides
  faceConfig:    {},    // { [faceIdx]: { fillStrategy?, panelOrientation? } }
  selectedFace:  null,  // index of face selected for per-face config
};

// Weather multiplier lookup
const WEATHER_MULTIPLIERS = {
  clear:          1.00,
  partly_cloudy:  0.75,
  cloudy:         0.45,
  rainy:          0.25,
  snowy:          0.20,
};

function getFaceConfig(faceIdx) {
  const override = state.faceConfig[faceIdx] || {};
  return {
    fillStrategy:     override.fillStrategy     || state.fillStrategy,
    panelOrientation: override.panelOrientation  || state.panelOrientation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Three.js setup
// ─────────────────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
scene.fog   = new THREE.FogExp2(0x87ceeb, 0.002);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(18, 14, 18);   // south side (+Z), looking toward north (-Z)
camera.lookAt(0, 3, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance    = 5;
controls.maxDistance    = 80;
controls.maxPolarAngle  = Math.PI / 2.05;
controls.update();

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.1, 0.6, 0.85
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ─────────────────────────────────────────────────────────────────────────────
// Subsystems
// ─────────────────────────────────────────────────────────────────────────────
const sunSim          = new SunSimulation(scene, renderer);
const solarPanels     = new SolarPanels(scene);
const obstacleManager = new ObstacleManager(scene);
// Notify UI when an obstacle is selected/deselected
obstacleManager.onSelect = (obs) => { if (ui) ui.showObstacleControls(obs); };
const weatherEffects  = new WeatherEffects(scene);
const helpModal      = new HelpModal();
const startupScreen  = new StartupScreen();
// Restore saved language after startup screen DOM is ready
{ const saved = localStorage.getItem('pvmizer-lang'); if (saved) setLanguage(saved); }

const groundMesh = createGround();
scene.add(groundMesh);

let roofGroup     = null;
let roofFaces     = [];
let roofMeshes    = [];  // flat list of roof meshes for raycasting
let dayCurve      = [];
let monthlyEnergy = Array(12).fill(0);
let peakPowerKw   = 0;

// Raycaster for face selection
const raycaster = new THREE.Raycaster();
const _ndc      = new THREE.Vector2();

// ─────────────────────────────────────────────────────────────────────────────
// App object (shared with UIController)
// ─────────────────────────────────────────────────────────────────────────────
function setBuildingRotation(deg) {
  // Rotate existing obstacles by the delta rotation so they stay with the building
  const deltaRad = (deg - state.buildingRotation) * Math.PI / 180;
  if (deltaRad !== 0) {
    const deltaQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, deltaRad, 0));
    for (const obs of obstacleManager.obstacles) {
      obs.position.applyQuaternion(deltaQ);
      obs.group.position.copy(obs.position);
      obs.group.quaternion.premultiply(deltaQ);
    }
  }
  state.buildingRotation = deg;
  rebuildRoof();
}

const app = {
  state, renderer, scene, camera, sunSim, solarPanels, groundMesh,
  obstacleManager, weatherEffects, helpModal, startupScreen, bloomPass, composer,
  setRoofType, rebuildRoof, rebuildPanels,
  onLocationChange, setPanelDimensions: applyPanelDimensions,
  updateProjectFinancials,
  setBuildingRotation,
  setWeather(condition) {
    state.weatherCondition  = condition;
    state.weatherMultiplier = WEATHER_MULTIPLIERS[condition] || 1.0;
    weatherEffects.setCondition(condition);
    recalcDayCurve();
  },
  applyMode(mode, data) { applyMode(mode, data); },

  resetToDefaults() {
    state.appMode = 'sandbox';
    state.projectData = null;
    state.roofType = 'flat';
    state.houseWidth = 10; state.houseDepth = 10;
    state.wallHeight = 3; state.roofPitch = 30;
    state.buildingRotation = 0;
    state._savedOrientations = null;
    obstacleManager.deleteAll();
    const finPanel = document.getElementById('financialSection');
    if (finPanel) finPanel.style.display = 'none';
    const fillToggle = document.getElementById('fillOrderToggle');
    if (fillToggle) fillToggle.style.display = 'none';
    const panelCountEl = document.getElementById('panelCountDisplay');
    if (panelCountEl) panelCountEl.style.display = 'none';
    const projHeader = document.getElementById('projectNameHeader');
    if (projHeader) projHeader.style.display = 'none';
    rebuildRoof();
    syncUIToState();
  },

  getChartsForExport() {
    return {
      powerChart:   ui?.powerChart,
      monthlyChart: ui?.monthlyChart,
    };
  },

  getCurrentStats() {
    return {
      panelCount: solarPanels.count,
      peakPowerKw,
      annualKwh: monthlyEnergy.reduce((a, b) => a + b, 0),
      monthlyEnergy,
      dayCurve,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Roof / Panel builders
// ─────────────────────────────────────────────────────────────────────────────
function setRoofType(type) {
  state.roofType = type;
  rebuildRoof();
}

function rebuildRoof() {
  // Save per-face config keyed by orientation name before clearing faces
  state._savedFaceConfigs = {};
  for (const [idx, conf] of Object.entries(state.faceConfig)) {
    const orient = roofFaces[idx]?.orientation;
    if (orient) state._savedFaceConfigs[orient] = conf;
  }
  state.selectedFace = null;

  if (roofGroup) {
    scene.remove(roofGroup);
    roofGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    roofGroup = null;
  }

  const builder = ROOF_BUILDERS[state.roofType];
  const result  = builder({
    width:      state.houseWidth,
    depth:      state.houseDepth,
    wallHeight: state.wallHeight,
    pitchDeg:   state.roofPitch,
    ridgeLen:   state.ridgeLength,
  });
  roofGroup  = result.group;
  roofFaces  = result.faces;

  // Apply Y rotation to the group and all face vectors so panel world positions match
  const rotY  = state.buildingRotation * Math.PI / 180;
  roofGroup.rotation.y = rotY;
  if (rotY !== 0) {
    const rotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    for (const face of roofFaces) {
      face.normal.applyQuaternion(rotQ);
      face.rightDir.applyQuaternion(rotQ);
      face.upDir.applyQuaternion(rotQ);
      face.center.applyQuaternion(rotQ);
    }
  }

  roofMeshes = [];
  roofGroup.traverse(o => { if (o.isMesh) roofMeshes.push(o); });

  // Apply panel tilt for flat roofs (sets face.energyNormal; doesn't mutate face.normal)
  if (state.roofType === 'flat') applyFlatRoofTilt(roofFaces, state.panelTilt);

  scene.add(roofGroup);

  // Preserve user's face selection across rebuilds by matching orientations.
  // If we have saved orientations from a previous build, restore them;
  // otherwise default to equator-facing faces.
  if (state._savedOrientations && state._savedOrientations.size > 0) {
    state.activeFaces = new Set();
    for (let i = 0; i < roofFaces.length; i++) {
      if (state._savedOrientations.has(roofFaces[i].orientation)) {
        state.activeFaces.add(i);
      }
    }
  } else {
    state.activeFaces = new Set(
      getSunFacingFaces(roofFaces, state.latitude).map(f => roofFaces.indexOf(f))
    );
  }

  // Restore per-face config from orientation names
  state.faceConfig = {};
  if (state._savedFaceConfigs) {
    for (let i = 0; i < roofFaces.length; i++) {
      const saved = state._savedFaceConfigs[roofFaces[i].orientation];
      if (saved) state.faceConfig[i] = { ...saved };
    }
  }

  rebuildPanels();
  updateFaceLabels();
  buildHeatmapOverlay();
}

function applyFlatRoofTilt(faces, tiltDeg) {
  // Panels stay physically flat on the roof surface.
  // We store a separate energyNormal (tilted south-facing) used only by energy calculations.
  const tiltRad = tiltDeg * Math.PI / 180;
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tiltRad);
  for (const face of faces) {
    if (tiltDeg > 0) {
      face.energyNormal = face.normal.clone().applyQuaternion(rot).normalize();
    } else {
      face.energyNormal = face.normal.clone();
    }
  }
}

/**
 * Returns faces that should receive solar panels.
 * Hemisphere-aware: south-facing slopes for NH, north-facing for SH.
 * Flat roofs are always included.
 * No sun-angle filtering — panels are placed on equator-facing faces regardless of season.
 */
function getSunFacingFaces(faces, latitude) {
  // Visual coordinate convention: +Z = North, -Z = South (matches compass labels).
  // NH: panels face south → normal.z < -0.1 (equatorSign = -1)
  // SH: panels face north → normal.z > +0.1 (equatorSign = +1)
  const equatorSign = (latitude >= 0) ? -1 : 1;

  return faces.filter(face => {
    if (face.normal.y > 0.97) return true;   // flat roof — always include
    if (face.normal.y < -0.1) return false;  // downward — skip
    return face.normal.z * equatorSign > 0.1;
  });
}

function rebuildPanels() {
  const activeFaceIndices = [...state.activeFaces].sort((a, b) => a - b);
  const facesToPlace = activeFaceIndices.map(i => roofFaces[i]);

  // Base panel dimensions (un-swapped — per-face orientation applied in SolarPanels)
  const basePanelW = state.panelWidth;
  const basePanelH = state.panelHeight;
  // Derive efficiency from nominal Wp and actual panel area
  state.panelEfficiency = state.panelNominalWp / (basePanelW * basePanelH * 1000);
  // Equator direction: south (-Z) for NH, north (+Z) for SH (matches visual compass)
  const equatorDir  = new THREE.Vector3(0, 0, state.latitude >= 0 ? -1 : 1);
  const isFlatRoof  = state.roofType === 'flat';
  // Tilt and layout only apply to flat roofs
  const flatTiltDeg = isFlatRoof ? state.panelTilt : 0;
  const flatLayout  = isFlatRoof ? state.flatLayout : 'south';

  // Build per-face configuration array (parallel to facesToPlace)
  const perFaceConfig = activeFaceIndices.map(faceIdx => getFaceConfig(faceIdx));

  // Build gridData — use same grid parameters as SolarPanels so cell indices match
  const gridData = {};
  for (let j = 0; j < facesToPlace.length; j++) {
    const fc = perFaceConfig[j];
    const orient = fc.panelOrientation;
    const isMixed = orient === 'alt-rows';
    const isLand  = orient === 'landscape';
    // Alt-rows uses max dimension for column spacing
    const pw = isMixed ? Math.max(basePanelW, basePanelH)
             : isLand  ? basePanelH : basePanelW;
    const ph = isMixed ? basePanelH
             : isLand  ? basePanelW : basePanelH;
    const blocked = obstacleManager.getBlockedCells(
      facesToPlace[j], pw, ph, state.panelGap,
      { isFlatRoof, flatTiltDeg, equatorDir, flatLayout }
    );
    gridData[j] = { blockedCells: blocked, enabledCells: null };
  }

  // In project mode, cap panel count to the recommended maximum
  let maxPanels = Infinity;
  if (state.appMode === 'project' && state.projectData) {
    const rec = PanelRecommender.recommend({
      roofType:     state.roofType,
      houseWidth:   state.houseWidth,
      houseDepth:   state.houseDepth,
      roofPitch:    state.roofPitch,
      panelWidth:   basePanelW,
      panelHeight:  basePanelH,
      panelGap:     state.panelGap,
      panelNominalWp:    state.panelNominalWp,
      annualConsumption: state.projectData.annualConsumption,
      latitude:          state.latitude,
    });
    maxPanels = rec.recommendedPanels;
  }

  solarPanels.placePanels(facesToPlace, {
    efficiency:    state.panelEfficiency,
    gapSize:       state.panelGap,
    panelW:        basePanelW,
    panelH:        basePanelH,
    gridData,
    flatTiltDeg,
    equatorDir,
    flatLayout,
    maxPanels,
    perFaceConfig,
  });

  peakPowerKw = EnergyCalc.peakPower(solarPanels.getPanelInfos());
  recalcDayCurve();

  // Update panel count overlay: show "placed / max" in project mode
  const ibPanels = document.getElementById('ibPanels');
  if (ibPanels) {
    ibPanels.textContent = maxPanels < Infinity
      ? `${solarPanels.count} / ${maxPanels}`
      : `${solarPanels.count}`;
  }

  // Update panel count display (placed / remaining)
  const countEl = document.getElementById('panelCountPlaced');
  if (countEl) countEl.textContent = solarPanels.count;
  const remWrap = document.getElementById('panelCountRemainingWrap');
  const remEl   = document.getElementById('panelCountRemaining');
  if (maxPanels < Infinity && remWrap && remEl) {
    remWrap.style.display = '';
    remEl.textContent = Math.max(0, maxPanels - solarPanels.count);
  } else if (remWrap) {
    remWrap.style.display = 'none';
  }

  if (state.appMode === 'project') updateProjectFinancials();
}

function applyPanelDimensions() {
  setPanelDimensions(state.panelWidth, state.panelHeight);
  setTempCoeff(state.panelTempCoeff);
  rebuildPanels();
}

// ─── Face label sprites — click to toggle panels on/off ──────────────────────
let _faceLabelSprites = [];

function toggleFace(faceIdx) {
  if (state.activeFaces.has(faceIdx)) {
    if (state.selectedFace === faceIdx) {
      // Third click: deactivate the face
      state.activeFaces.delete(faceIdx);
      state.selectedFace = null;
    } else {
      // Second click: select face for per-face config
      state.selectedFace = faceIdx;
    }
  } else {
    // First click: activate the face
    state.activeFaces.add(faceIdx);
    state.selectedFace = faceIdx;
  }
  // Save active orientations so they survive roof rebuilds
  state._savedOrientations = new Set(
    [...state.activeFaces].map(i => roofFaces[i]?.orientation).filter(Boolean)
  );
  rebuildPanels();
  updateFaceLabels();
  if (ui) ui.showFaceConfig(state.selectedFace, state.faceConfig, roofFaces, state);
}

function updateFaceLabels() {
  for (const s of _faceLabelSprites) { scene.remove(s); s.material.map.dispose(); }
  _faceLabelSprites = [];
  if (!roofFaces.length) return;

  for (let i = 0; i < roofFaces.length; i++) {
    const face   = roofFaces[i];
    // Skip faces that cannot receive panels (downward normals or near-vertical end gables)
    if (face.normal.y < -0.05) continue;

    const active = state.activeFaces.has(i);
    const W = 96, H = 96;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    ctx.beginPath(); ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2);
    ctx.fillStyle = active ? 'rgba(59,130,246,0.85)' : 'rgba(30,30,30,0.75)';
    ctx.fill();
    ctx.strokeStyle = active ? '#93c5fd' : '#555'; ctx.lineWidth = 3; ctx.stroke();

    ctx.fillStyle = active ? '#fff' : '#aaa';
    ctx.font = 'bold 44px Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), W / 2, H / 2 + 3);

    const tex  = new THREE.CanvasTexture(cv);
    const mat  = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const spr  = new THREE.Sprite(mat);
    spr.scale.set(0.9, 0.9, 1);
    spr.userData.faceIndex = i;
    spr.position.copy(face.center).addScaledVector(face.normal, 0.40);
    scene.add(spr);
    _faceLabelSprites.push(spr);
  }
}

function onLocationChange() {
  sunSim.updateTrajectory(state.latitude, state.longitude, state.date, state.showSunPath);

  // Flip camera to opposite side when hemisphere changes so sun trajectory is visible
  const southSide = state.latitude >= 0;  // Northern hemisphere: camera on south (+Z)
  const camZ = camera.position.z;
  if ((southSide && camZ < 0) || (!southSide && camZ > 0)) {
    camera.position.z = -camZ;
    controls.update();
  }

  // Reset saved orientations so hemisphere change picks correct default faces
  state._savedOrientations = null;
  state.activeFaces = new Set(
    getSunFacingFaces(roofFaces, state.latitude).map(f => roofFaces.indexOf(f))
  );
  rebuildPanels();
  updateFaceLabels();
  if (ui) ui.updateEquatorLayoutLabel(state.latitude);
  // Invalidate cached PVGIS data and re-fetch for new location (all modes)
  state.pvgisCorrections = null;
  loadPVGISData();
}

async function loadPVGISData() {
  if (state.pvgisLoading) return;
  state.pvgisLoading = true;
  ui?.setPVGISStatus('loading');
  try {
    const { fetchPVGISCorrections } = await import('./PVGISClient.js');
    state.pvgisCorrections = await fetchPVGISCorrections(
      state.latitude, state.longitude, state.date.getFullYear()
    );
    ui?.setPVGISStatus('loaded');
    recalcDayCurve();
  } catch (e) {
    console.warn('PVGIS fetch failed, using clear-sky model:', e);
    state.pvgisCorrections = null;
    ui?.setPVGISStatus('error');
  } finally {
    state.pvgisLoading = false;
  }
}

function recalcDayCurve() {
  const panelInfos = solarPanels.getPanelInfos();
  if (panelInfos.length === 0) return;

  setTimeout(() => {
    dayCurve = EnergyCalc.calculateDayCurve(
      state.latitude, state.longitude, state.date, panelInfos, state.weatherMultiplier
    );
    ui.updateDayCurve(dayCurve, state.timeHours, peakPowerKw);

    setTimeout(() => {
      // When PVGIS real climate data is available, use it directly (multiplier = 1.0)
      // because PVGIS already encodes actual cloud cover — don't double-apply the UI weather.
      // Without PVGIS, fall back to weatherMultiplier as a rough climate estimate.
      const annualMult = state.pvgisCorrections ? 1.0 : state.weatherMultiplier;
      monthlyEnergy = EnergyCalc.calculateMonthlyEnergy(
        state.latitude, state.longitude, state.date.getFullYear(), panelInfos,
        annualMult, state.pvgisCorrections
      );
      ui.updateMonthlyChart(monthlyEnergy);
      if (state.appMode === 'project') updateProjectFinancials();
    }, 100);
  }, 0);
}


// ─────────────────────────────────────────────────────────────────────────────
// Project financials
// ─────────────────────────────────────────────────────────────────────────────
function updateProjectFinancials() {
  if (!state.projectData || !ui) return;
  const annualKwh = monthlyEnergy.reduce((a, b) => a + b, 0);
  ui.updateProjectPanel(state.projectData, peakPowerKw, annualKwh);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync UI controls to current state (used when project mode pre-configures state)
// ─────────────────────────────────────────────────────────────────────────────
function syncUIToState() {
  const setSlider = (id, valId, value, fmt) => {
    const slider = document.getElementById(id);
    const display = document.getElementById(valId);
    if (slider) slider.value = value;
    if (display) display.textContent = fmt(value);
  };
  setSlider('houseWidth',  'houseWidthVal',  state.houseWidth,  v => `${v.toFixed(1)}m`);
  setSlider('houseDepth',  'houseDepthVal',  state.houseDepth,  v => `${v.toFixed(1)}m`);
  setSlider('wallHeight',  'wallHeightVal',  state.wallHeight,  v => `${v.toFixed(2)}m`);
  setSlider('roofPitch',   'roofPitchVal',   state.roofPitch,   v => `${v}\u00B0`);

  // Sync roof type buttons
  document.querySelectorAll('.roof-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.roof === state.roofType);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Compass N / S / E / W labels
// ─────────────────────────────────────────────────────────────────────────────
function createCompassLabels() {
  // +X=East, +Y=Up, +Z=South — camera is on north (-Z) side looking south (+Z)
  const dirs = [
    { letter: 'S', color: '#f59e0b', pos: new THREE.Vector3(0,    0.6, -20) },
    { letter: 'N', color: '#60a5fa', pos: new THREE.Vector3(0,    0.6,  20) },
    { letter: 'E', color: '#4ade80', pos: new THREE.Vector3( 20,  0.6,   0) },
    { letter: 'W', color: '#e879f9', pos: new THREE.Vector3(-20,  0.6,   0) },
  ];

  for (const d of dirs) {
    const W = 128, H = 128;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Circle background
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    ctx.strokeStyle = d.color; ctx.lineWidth = 4; ctx.stroke();

    // Letter
    ctx.fillStyle = d.color;
    ctx.font = 'bold 64px Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.letter, W / 2, H / 2 + 3);

    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 3, 1);
    sprite.position.copy(d.pos);
    sprite.name = `compass_${d.letter}`;
    scene.add(sprite);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Irradiance Heatmap
// ─────────────────────────────────────────────────────────────────────────────
let _heatmapMeshes = [];

/** Build a color (THREE.Color) from 0-1 irradiance value using a rich 7-stop scientific gradient */
function _irradianceColor(t) {
  const stops = [
    { t: 0.00, r: 0.04, g: 0.04, b: 0.28 },  // deep shadow indigo
    { t: 0.15, r: 0.08, g: 0.12, b: 0.65 },  // cool blue
    { t: 0.30, r: 0.00, g: 0.48, b: 0.68 },  // teal
    { t: 0.45, r: 0.08, g: 0.72, b: 0.22 },  // green
    { t: 0.60, r: 0.70, g: 0.85, b: 0.00 },  // yellow-green
    { t: 0.78, r: 1.00, g: 0.48, b: 0.00 },  // orange
    { t: 1.00, r: 1.00, g: 0.08, b: 0.00 },  // hot red
  ];
  const col = new THREE.Color();
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      col.setRGB(a.r + f * (b.r - a.r), a.g + f * (b.g - a.g), a.b + f * (b.b - a.b));
      return col;
    }
  }
  const last = stops[stops.length - 1];
  return col.setRGB(last.r, last.g, last.b);
}

/**
 * Build a BufferGeometry matching the exact polygon of a face (triangles for hip/pyramid, quads for gable/flat).
 * Uses face.verts2d (local {r, u} coords) to build the correct shape.
 */
function _facePolygonGeometry(face) {
  const verts = face.verts2d;
  if (!verts || verts.length < 3) {
    // Fallback to rectangular plane if no polygon data
    return new THREE.PlaneGeometry(face.width, face.height);
  }

  const geom = new THREE.BufferGeometry();
  // Build positions in face-local XY: x=rightDir offset, y=upDir offset, z=0
  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    positions[i * 3]     = verts[i].r;
    positions[i * 3 + 1] = verts[i].u;
    positions[i * 3 + 2] = 0;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Fan triangulation from vertex 0 (works for convex polygons)
  const indices = [];
  for (let i = 1; i < verts.length - 1; i++) {
    indices.push(0, i, i + 1);
  }
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** Build edge-loop LineLoop for a face polygon (perimeter outline) */
function _faceEdgeLoop(face) {
  const verts = face.verts2d;
  if (!verts || verts.length < 3) return null;
  const pts = verts.map(v => new THREE.Vector3(v.r, v.u, 0.002));
  pts.push(pts[0].clone()); // close loop
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** Create semi-transparent overlay polygons covering each roof face + edge outlines */
function buildHeatmapOverlay() {
  // Remove old
  for (const m of _heatmapMeshes) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
    if (m.userData.edgeLine) {
      scene.remove(m.userData.edgeLine);
      m.userData.edgeLine.geometry.dispose();
      m.userData.edgeLine.material.dispose();
    }
  }
  _heatmapMeshes = [];

  for (const face of roofFaces) {
    const geom = _facePolygonGeometry(face);
    const mat  = new THREE.MeshBasicMaterial({
      color: 0x0000ff, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);

    // Orient so face-local XY aligns with rightDir/upDir, Z with face normal
    const rotMat = new THREE.Matrix4().makeBasis(face.rightDir, face.upDir, face.normal);
    mesh.quaternion.setFromRotationMatrix(rotMat);
    mesh.position.copy(face.center).addScaledVector(face.normal, 0.04);
    mesh.visible = state.showHeatmap;
    mesh.userData.faceNormal = (face.energyNormal || face.normal).clone();
    scene.add(mesh);

    // Edge outline
    const edgeGeom = _faceEdgeLoop(face);
    let edgeLine = null;
    if (edgeGeom) {
      edgeLine = new THREE.Line(edgeGeom, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      edgeLine.quaternion.copy(mesh.quaternion);
      edgeLine.position.copy(mesh.position).addScaledVector(face.normal, 0.01);
      edgeLine.visible = state.showHeatmap;
      scene.add(edgeLine);
    }
    mesh.userData.edgeLine = edgeLine;
    _heatmapMeshes.push(mesh);
  }
}

/** Update heatmap colors based on current sun vector, with obstacle shadow detection */
function updateHeatmapColors(sunVector) {
  for (let i = 0; i < _heatmapMeshes.length; i++) {
    const mesh = _heatmapMeshes[i];
    mesh.visible = state.showHeatmap;
    if (!state.showHeatmap) continue;
    const dot = Math.max(0, sunVector.dot(mesh.userData.faceNormal));
    // Shadow detection: cast ray from face center toward sun, check obstacle hits
    let shadingMult = 1.0;
    if (dot > 0.01 && obstacleManager && obstacleManager.obstacles.length > 0) {
      const sf = obstacleManager.getShadingFactor(mesh.position.clone(), sunVector);
      // Same non-linear string-effect model as EnergyCalc: 1 - (1 - sf)^3
      const effectiveLoss = sf > 0 ? 1 - Math.pow(1 - sf, 3) : 0;
      shadingMult = 1.0 - effectiveLoss;
    }
    const effective = dot * shadingMult;
    mesh.material.color.copy(_irradianceColor(effective));
    mesh.material.opacity = 0.48 + (1.0 - effective) * 0.14;

    // Update edge line color and visibility
    const edge = mesh.userData.edgeLine;
    if (edge) {
      edge.visible = state.showHeatmap;
      // Edge color: brighter near hot faces, dimmer for cold/shadowed
      edge.material.opacity = 0.35 + effective * 0.45;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input handling
// ─────────────────────────────────────────────────────────────────────────────
function getNDC(event) {
  _ndc.set(
    (event.clientX / window.innerWidth)  * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  return _ndc;
}

// Canvas pointer events
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const ndc = getNDC(e);

  // If obstacle tool is active → place obstacle
  if (obstacleManager.getActiveTool()) {
    obstacleManager.handleClick(ndc.clone(), camera, roofMeshes, groundMesh);
    rebuildPanels();
    return;
  }

  // Check if clicking the already-selected obstacle → start drag
  const sel = obstacleManager.selected;
  if (sel) {
    const selMeshes = [];
    sel.group.traverse(m => { if (m.isMesh) selMeshes.push(m); });
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObjects(selMeshes, false).length) {
      obstacleManager.startDrag(sel);
      controls.enabled = false;  // disable orbit while dragging
      e.stopPropagation();
      return;
    }
  }

  // Click face-label sprite to toggle panels on that face
  if (_faceLabelSprites.length) {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(_faceLabelSprites, false);
    if (hits.length) {
      const faceIdx = hits[0].object.userData.faceIndex;
      if (faceIdx !== undefined) { toggleFace(faceIdx); return; }
    }
  }

  // Click obstacle to select/deselect
  obstacleManager.handleClick(ndc.clone(), camera, roofMeshes, groundMesh);
});

renderer.domElement.addEventListener('pointermove', e => {
  const ndc = getNDC(e);
  // Drag takes priority over normal mouse-move preview
  if (obstacleManager.isDragging()) {
    obstacleManager.updateDrag(ndc.clone(), camera, roofMeshes, groundMesh);
    return;
  }
  if (obstacleManager.getActiveTool()) {
    obstacleManager.handleMouseMove(ndc.clone(), camera, roofMeshes, groundMesh);
  }
});

renderer.domElement.addEventListener('pointerup', e => {
  if (e.button !== 0) return;
  if (obstacleManager.endDrag()) {
    controls.enabled = true;  // re-enable orbit after drag
    rebuildPanels();
  }
});

// Keyboard handler
window.addEventListener('keydown', e => {
  // Help modal
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    helpModal.toggle();
    return;
  }

  // Escape: cancel obstacle tool
  if (e.key === 'Escape') {
    obstacleManager.cancelTool();
    if (ui) ui.clearObstacleTool();
    return;
  }

  // Delete: remove selected obstacle
  if (e.key === 'Delete' || e.key === 'Backspace') {
    obstacleManager.deleteSelected();
    rebuildPanels();
    return;
  }

});

// Mouse wheel: adjust simulation time (scroll up = forward, scroll down = backward)
renderer.domElement.addEventListener('wheel', e => {
  // Only adjust time when Shift is held; otherwise let OrbitControls zoom
  if (!e.shiftKey) return;
  e.preventDefault();

  const step = 0.25; // 15-minute increments
  const delta = e.deltaY < 0 ? step : -step;
  state.timeHours += delta;

  // Wrap around midnight
  if (state.timeHours >= 24) {
    state.timeHours -= 24;
    state.date = new Date(state.date.getTime() + 86400000);
  } else if (state.timeHours < 0) {
    state.timeHours += 24;
    state.date = new Date(state.date.getTime() - 86400000);
  }

  // Sync slider and display
  const slider = document.getElementById('simTime');
  const valEl  = document.getElementById('simTimeVal');
  if (slider) slider.value = state.timeHours;
  if (valEl)  valEl.textContent = fmtTime(state.timeHours);
}, { passive: false });

// ─────────────────────────────────────────────────────────────────────────────
// Animation loop
// ─────────────────────────────────────────────────────────────────────────────
let ui = null;  // initialized after startup

let lastTime     = performance.now();
let statsThrottle = 0;
let shadingThrottle = 0;

function animate() {
  requestAnimationFrame(animate);

  const now  = performance.now();
  const dtMs = Math.min(now - lastTime, 100);
  lastTime   = now;

  // Advance simulation time
  if (state.autoAdvance) {
    state.timeHours += (state.simSpeed / 60) * (dtMs / 1000);
    if (state.timeHours >= 24) {
      state.timeHours -= 24;
      state.date = new Date(state.date.getTime() + 86400000);
    }
    const slider = document.getElementById('simTime');
    const valEl  = document.getElementById('simTimeVal');
    if (slider) slider.value = state.timeHours;
    if (valEl)  valEl.textContent = fmtTime(state.timeHours);
  }

  // Update sun (with weather condition)
  sunSim.update(state.latitude, state.longitude, state.date, state.timeHours, state.shadowsEnabled, state.weatherCondition);

  // Weather fog density
  const fogDensityMap = { clear: 0.002, partly_cloudy: 0.003, cloudy: 0.005, rainy: 0.008, snowy: 0.010 };
  if (scene.fog) scene.fog.density = fogDensityMap[state.weatherCondition] || 0.002;

  // Weather particle effects
  weatherEffects.update(dtMs);

  const { sunPosition, sunVector, irradiance } = sunSim;
  const { totalWatts, panelData } = EnergyCalc.calculateSystemPower(
    solarPanels.panels, sunVector, irradiance, sunPosition.elevation, state.weatherMultiplier
  );

  statsThrottle   += dtMs;
  shadingThrottle += dtMs;

  // Update heatmap colors every frame (cheap dot-product per face)
  if (_heatmapMeshes.length) updateHeatmapColors(sunVector);

  // Update obstacle shading factors on panels (~every 500ms)
  if (shadingThrottle > 500 && obstacleManager.obstacles.length > 0) {
    shadingThrottle = 0;
    for (const mesh of solarPanels.panels) {
      const panelPos = new THREE.Vector3();
      mesh.getWorldPosition(panelPos);
      mesh.userData.shadingFactor = obstacleManager.getShadingFactor(panelPos, sunVector);
    }
  }

  // Update stats & shading viz (~every 150ms)
  if (statsThrottle > 150) {
    statsThrottle = 0;
    solarPanels.updateShading(panelData);

    const ss         = SunSimulation.getSunriseSunset(state.latitude, state.longitude, state.date);
    const dailyKwh   = EnergyCalc.integrateDayCurve(dayCurve);
    const annualKwh  = monthlyEnergy.reduce((a, b) => a + b, 0);

    if (ui) {
      ui.updateStats({
        currentPowerKw: totalWatts / 1000,
        peakPowerKw,
        panelCount:     solarPanels.count,
        totalAreaM2:    solarPanels.totalArea,
        dailyKwh,
        annualKwh,
        sunElevation:   sunPosition.elevation,
        sunAzimuth:     sunPosition.azimuth,
        irradiance,
        sunrise: ss.sunrise,
        sunset:  ss.sunset,
        noon:    ss.noon,
        timeHours: state.timeHours,
        date:      state.date,
        roofType:  state.roofType
      });

      ui.updateDayCurve(dayCurve, state.timeHours, peakPowerKw);
    }
  }

  controls.update();
  composer.render();
}

function fmtTime(h) {
  const hours = Math.floor(((h % 24) + 24) % 24);
  const mins  = Math.floor(((h % 1) + 1) * 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Window resize
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  // Compass labels (built once, always visible)
  createCompassLabels();

  // Start render loop immediately (3D scene loads behind startup screen)
  animate();

  // Show startup screen
  startupScreen.show();
  startupScreen.onModeSelected((mode, projectFormData) => {
    applyMode(mode, projectFormData);
  });
}

/**
 * Insert (or remove) a project-specific location preset button in the sidebar.
 * When projectFormData is non-null and has geocoded lat/lon, a button is added
 * as the first preset (marked active). Passing null removes any existing button.
 */
function _updateProjectPresetButton(projectFormData) {
  const presets = document.querySelector('.location-presets');
  if (!presets) return;

  // Remove any old project button first
  const old = document.getElementById('projectPresetBtn');
  if (old) old.remove();

  if (!projectFormData) return;

  // Build a short label from the first segment of the address
  const address = projectFormData.address || '';
  const shortName = address
    ? address.split(',')[0].trim().slice(0, 22)   // max 22 chars
    : `${projectFormData.lat.toFixed(2)}°N`;

  const btn = document.createElement('button');
  btn.id = 'projectPresetBtn';
  btn.className = 'preset-btn preset-btn-project';
  btn.dataset.lat = projectFormData.lat;
  btn.dataset.lon = projectFormData.lon;
  btn.textContent = `📍 ${shortName}`;
  btn.title = address;   // full address as tooltip

  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const lat = projectFormData.lat;
    const lon = projectFormData.lon;
    document.getElementById('latitude').value  = lat;
    document.getElementById('longitude').value = lon;
    document.getElementById('latitudeVal').textContent  = `${lat.toFixed(1)}\u00b0`;
    document.getElementById('longitudeVal').textContent = `${lon.toFixed(1)}\u00b0`;
    state.latitude  = lat;
    state.longitude = lon;
    onLocationChange();
    ui?.updateEquatorLayoutLabel(lat);
  });

  // Insert as first item and mark active (location was just applied)
  presets.insertBefore(btn, presets.firstChild);
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function applyMode(mode, projectFormData) {
  state.appMode = mode;
  if (mode === 'project' && projectFormData) {
    state.projectData = new ProjectData(projectFormData);
    // Pre-configure scene from project form data
    state.roofType   = projectFormData.roofType   || state.roofType;
    state.houseWidth = projectFormData.houseWidth  || state.houseWidth;
    state.houseDepth = projectFormData.houseDepth  || state.houseDepth;
    state.wallHeight = projectFormData.wallHeight  || state.wallHeight;
    state.roofPitch  = projectFormData.roofPitch   || state.roofPitch;
    // Apply geocoded location if the user provided an address
    if (projectFormData.lat != null && projectFormData.lon != null) {
      state.latitude  = projectFormData.lat;
      state.longitude = projectFormData.lon;
    }
  }

  // Create UIController only once; reuse on subsequent launches
  if (!ui) {
    ui = new UIController(app);
    ui.init();
  }

  // Build initial scene
  setPanelDimensions(state.panelWidth, state.panelHeight);
  rebuildRoof();
  ui.updateEquatorLayoutLabel(state.latitude);
  sunSim.updateTrajectory(state.latitude, state.longitude, state.date, state.showSunPath);

  // Sync UI sliders/buttons to match state (important for project mode)
  syncUIToState();

  // Fetch real climate data from PVGIS (all modes — based on selected location)
  state.pvgisCorrections = null;
  loadPVGISData();

  // Show/hide financial panel, fill order, and project name based on mode
  const finPanel = document.getElementById('financialSection');
  if (finPanel) finPanel.style.display = mode === 'project' ? '' : 'none';

  // Hide fill order and panel count in sandbox — only meaningful in project mode
  const fillToggle = document.getElementById('fillOrderToggle');
  if (fillToggle) fillToggle.style.display = mode === 'project' ? '' : 'none';
  const panelCountEl = document.getElementById('panelCountDisplay');
  if (panelCountEl) panelCountEl.style.display = mode === 'project' ? '' : 'none';

  const projHeader = document.getElementById('projectNameHeader');
  const projNameText = document.getElementById('projectNameText');
  if (projHeader) {
    if (mode === 'project' && state.projectData) {
      if (projNameText) projNameText.textContent = state.projectData.name;
      projHeader.style.display = '';
    } else {
      projHeader.style.display = 'none';
    }
  }

  // Add / refresh the project location preset button in the sidebar
  _updateProjectPresetButton(
    mode === 'project' && projectFormData?.lat != null ? projectFormData : null
  );

  // Hide loading overlay
  setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }, 800);
}

init();

/**
 * StartupScreen.js
 * Full-screen startup overlay: Sandbox vs Project mode selection,
 * with project details form including building dimensions and panel recommendation.
 */

import { PanelRecommender } from './PanelRecommender.js';
import { t } from './i18n.js';

export class StartupScreen {
  constructor() {
    this._el = null;
    this._cb = null;
    this._geocodedLat = null;
    this._geocodedLon = null;
    this._geocodedName = null;
    this._create();
  }

  _create() {
    this._el = document.createElement('div');
    this._el.className = 'startup-overlay';
    this._el.innerHTML = `
      <div class="startup-inner">
        <div class="startup-header">
          <div class="startup-sun-icon">&#x2600;</div>
          <h1 data-i18n="startup.appTitle">PVMizer 2.0</h1>
          <p data-i18n="startup.subtitle">Plan your solar installation with precision</p>
        </div>

        <!-- Mode selection cards -->
        <div class="startup-modes" id="startupModes">
          <div class="mode-card sandbox-card" id="sandboxCard">
            <img class="mode-card-icon" src="assets/sandbox_icon.png" alt="Sandbox mode" />
            <h2 data-i18n="startup.sandbox">Sandbox</h2>
            <p data-i18n="startup.sandboxDesc">Freely explore roof types, panel orientations, obstacle shading and live sun trajectory simulation. No data entry — jump straight into the 3D scene.</p>
            <button class="mode-btn sandbox-btn" id="sandboxLaunchBtn" data-i18n="startup.sandboxBtn">Launch Sandbox</button>
          </div>
          <div class="mode-card project-card" id="projectCard">
            <img class="mode-card-icon" src="assets/project_icon.png" alt="Project mode" />
            <h2 data-i18n="startup.project">Project Mode</h2>
            <p data-i18n="startup.projectDesc">Plan a real PV installation. Enter building dimensions and annual consumption — the app recommends panel count, calculates yearly energy production, savings, payback period and generates a full PDF report.</p>
            <button class="mode-btn project-btn" id="projectSetupBtn" data-i18n="startup.projectBtn">Set Up Project →</button>
          </div>
        </div>

        <!-- Footer -->
        <div class="startup-footer">
          <p data-i18n="startup.credit">Created as diploma thesis by:<br>Bc. Vladimir Kubica</p>
        </div>

        <!-- Project form (hidden until project card clicked) -->
        <div class="startup-form" id="startupForm" style="display:none">
          <h2 data-i18n="startup.projectForm">Project Details</h2>
          <div class="form-grid">
            <div class="form-group form-full">
              <label for="projName" data-i18n="startup.projName">Project Name</label>
              <input type="text" id="projName" data-i18n="startup.projNamePlaceholder" data-i18n-attr="placeholder">
            </div>
            <div class="form-group form-full">
              <label for="projAddress" data-i18n="startup.address">Address / Location</label>
              <div class="address-input-wrap">
                <input type="text" id="projAddress" data-i18n="startup.addressPlaceholder" data-i18n-attr="placeholder" placeholder="e.g. Bratislava, Slovakia">
                <button type="button" id="locateBtn" class="locate-btn" data-i18n="startup.locateBtn">Locate</button>
              </div>
              <span id="locateStatus" class="locate-status"></span>
            </div>
            <div class="form-group">
              <label for="projRoofType" data-i18n="startup.roofType">Roof Type</label>
              <div class="roof-preview-wrap">
                <img id="projRoofPreview" src="assets/roof_flat.png" alt="Roof preview" class="roof-preview-img" />
                <select id="projRoofType">
                  <option value="flat" data-i18n="roof.flat">Flat</option>
                  <option value="gable" data-i18n="roof.gable">Gable</option>
                  <option value="hip" data-i18n="roof.hip">Hip</option>
                  <option value="pyramid" data-i18n="roof.pyramid">Pyramid</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="projPitch" data-i18n="startup.pitchAngle">Pitch Angle (°)</label>
              <input type="number" id="projPitch" value="30" min="5" max="60" step="1" disabled>
            </div>
            <div class="form-group">
              <label for="projWidth" data-i18n="startup.width">Building Width (m)</label>
              <input type="number" id="projWidth" value="10" min="5" max="30" step="0.5">
            </div>
            <div class="form-group">
              <label for="projDepth" data-i18n="startup.depth">Building Depth (m)</label>
              <input type="number" id="projDepth" value="10" min="5" max="30" step="0.5">
            </div>
            <div class="form-group">
              <label for="projWallHeight" data-i18n="startup.wallHeight">Wall Height (m)</label>
              <input type="number" id="projWallHeight" value="3" min="2" max="8" step="0.25">
            </div>
            <div class="form-group">
              <label for="projConsumption" data-i18n="startup.consumption">Annual Consumption (kWh/yr)</label>
              <input type="number" id="projConsumption" value="5000" min="100" max="500000" step="100">
            </div>
            <div class="form-group">
              <label for="projTariff" data-i18n="startup.tariff">Electricity Tariff (€/kWh)</label>
              <input type="number" id="projTariff" value="0.30" min="0.01" max="2.0" step="0.01">
            </div>
            <div class="form-group">
              <label for="projFeedIn" data-i18n="startup.feedIn">Feed-in Tariff (€/kWh)</label>
              <input type="number" id="projFeedIn" value="0.08" min="0" max="0.5" step="0.01">
            </div>
            <div class="form-group">
              <label for="projLifetime" data-i18n="startup.lifetime">System Lifetime (years)</label>
              <input type="number" id="projLifetime" value="25" min="5" max="40">
            </div>
            <div class="form-group">
              <label for="projCostPerKwp" data-i18n="startup.costPerKwp">Install Cost (€/kWp)</label>
              <input type="number" id="projCostPerKwp" value="1200" min="400" max="4000" step="50">
            </div>
          </div>

          <!-- Recommendation preview -->
          <div id="projRecommendBox" class="proj-recommend-box" style="display:none">
            <div class="recommend-title" data-i18n-html="startup.recTitle">&#x1F4CA; Panel Recommendation</div>
            <div class="recommend-grid">
              <span data-i18n="startup.recArea">Available Roof Area:</span> <span id="recRoofArea">--</span>
              <span data-i18n="startup.recMaxPanels">Max Panels That Fit:</span> <span id="recMaxPanels">--</span>
              <span data-i18n="startup.recPanels">Recommended Panels:</span>  <span id="recPanels" class="rec-highlight">--</span>
              <span data-i18n="startup.recProduction">Est. Annual Production:</span> <span id="recProduction">--</span>
              <span data-i18n="startup.recCoverage">Coverage of Consumption:</span> <span id="recCoverage">--</span>
            </div>
          </div>

          <div class="form-actions">
            <button class="form-back-btn" id="formBackBtn" data-i18n="startup.back">&larr; Back</button>
            <button class="form-recommend-btn" id="recommendBtn" data-i18n="startup.calculate">Calculate</button>
            <button class="form-launch-btn" id="projectLaunchBtn" data-i18n="startup.launchProject">Launch Project →</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this._el);
    // Set translated default project name (can't be done with a pure HTML attribute)
    document.getElementById('projName').value = t('startup.projNamePlaceholder');
    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('sandboxLaunchBtn').addEventListener('click', () => {
      this._launch('sandbox', null);
    });

    document.getElementById('projectSetupBtn').addEventListener('click', () => {
      document.getElementById('startupModes').style.display = 'none';
      document.getElementById('startupForm').style.display  = '';
      document.querySelector('.startup-footer').style.display = 'none';
    });

    document.getElementById('formBackBtn').addEventListener('click', () => {
      document.getElementById('startupForm').style.display  = 'none';
      document.getElementById('startupModes').style.display = '';
      document.querySelector('.startup-footer').style.display = '';
    });

    // Address geocoding
    document.getElementById('locateBtn').addEventListener('click', () => this._geocodeAddress());
    document.getElementById('projAddress').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._geocodeAddress(); }
    });

    // Roof type controls pitch availability and preview icon
    document.getElementById('projRoofType').addEventListener('change', e => {
      const pitchInput = document.getElementById('projPitch');
      if (e.target.value === 'flat') {
        pitchInput.disabled = true;
        pitchInput.value = 0;
      } else {
        pitchInput.disabled = false;
        if (parseFloat(pitchInput.value) === 0) pitchInput.value = 30;
      }
      document.getElementById('projRoofPreview').src = `assets/roof_${e.target.value}.png`;
      // Hide recommendation when form changes
      document.getElementById('projRecommendBox').style.display = 'none';
    });

    // Calculate recommendation button
    document.getElementById('recommendBtn').addEventListener('click', () => {
      this._showRecommendation();
    });

    // Launch project
    document.getElementById('projectLaunchBtn').addEventListener('click', () => {
      const data = this._collectFormData();
      this._launch('project', data);
    });
  }

  async _geocodeAddress() {
    const address = document.getElementById('projAddress').value.trim();
    if (!address) return;
    const statusEl = document.getElementById('locateStatus');
    const btn = document.getElementById('locateBtn');
    statusEl.textContent = t('startup.locating');
    statusEl.className = 'locate-status locating';
    btn.disabled = true;
    try {
      let result = null;
      if (window.electronAPI?.geocodeAddress) {
        result = await window.electronAPI.geocodeAddress(address);
      } else {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'PVMizer/2.0' } });
        const data = await res.json();
        if (data.length) result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display_name: data[0].display_name };
      }
      if (result) {
        this._geocodedLat  = result.lat;
        this._geocodedLon  = result.lon;
        this._geocodedName = result.display_name || `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`;
        statusEl.textContent = `📍 ${this._geocodedName}`;
        statusEl.className = 'locate-status located';
      } else {
        statusEl.textContent = t('startup.locateError');
        statusEl.className = 'locate-status locate-error';
      }
    } catch {
      statusEl.textContent = t('startup.locateError');
      statusEl.className = 'locate-status locate-error';
    } finally {
      btn.disabled = false;
    }
  }

  _collectFormData() {
    return {
      name:              document.getElementById('projName').value        || t('startup.projNamePlaceholder'),
      address:           document.getElementById('projAddress').value     || '',
      lat:               this._geocodedLat,
      lon:               this._geocodedLon,
      roofType:          document.getElementById('projRoofType').value,
      houseWidth:        parseFloat(document.getElementById('projWidth').value)       || 10,
      houseDepth:        parseFloat(document.getElementById('projDepth').value)       || 10,
      wallHeight:        parseFloat(document.getElementById('projWallHeight').value)  || 3,
      roofPitch:         parseFloat(document.getElementById('projPitch').value)       || 30,
      annualConsumption: parseFloat(document.getElementById('projConsumption').value) || 5000,
      tariff:            parseFloat(document.getElementById('projTariff').value)       || 0.30,
      feedInTariff:      parseFloat(document.getElementById('projFeedIn').value)       || 0.08,
      lifetime:          parseInt(document.getElementById('projLifetime').value)        || 25,
      costPerKwp:        parseFloat(document.getElementById('projCostPerKwp').value)   || 1200,
    };
  }

  _showRecommendation() {
    const data = this._collectFormData();
    const rec = PanelRecommender.recommend(data);

    document.getElementById('recRoofArea').textContent    = `${rec.usableAreaM2} m\u00B2`;
    document.getElementById('recMaxPanels').textContent   = `${rec.maxPanelsFit}`;
    document.getElementById('recPanels').textContent      = `${rec.recommendedPanels}`;
    document.getElementById('recProduction').textContent  = `${rec.estAnnualKwh.toLocaleString()} kWh`;
    document.getElementById('recCoverage').textContent    = `${rec.coveragePct}%`;
    document.getElementById('projRecommendBox').style.display = '';
  }

  _launch(mode, projectData) {
    this._el.classList.add('startup-fade-out');
    setTimeout(() => {
      this._el.style.display = 'none';
      if (this._cb) this._cb(mode, projectData);
    }, 600);
  }

  onModeSelected(cb) { this._cb = cb; }

  show() {
    this._el.style.display = '';
    this._el.classList.remove('startup-fade-out');
    // Reset to mode selection view
    document.getElementById('startupModes').style.display = '';
    document.getElementById('startupForm').style.display  = 'none';
    document.getElementById('projRecommendBox').style.display = 'none';
  }

  hide() {
    this._el.style.display = 'none';
  }

  /** Show the project form pre-filled with existing data for editing */
  showEditForm(projectFormData) {
    this._el.style.display = '';
    this._el.classList.remove('startup-fade-out');
    // Go straight to form view (skip mode selection)
    document.getElementById('startupModes').style.display = 'none';
    document.getElementById('startupForm').style.display  = '';
    document.getElementById('projRecommendBox').style.display = 'none';

    // Reset geocoded coords (re-geocode if user edits the address)
    this._geocodedLat  = projectFormData?.lat  ?? null;
    this._geocodedLon  = projectFormData?.lon  ?? null;
    this._geocodedName = null;

    // Pre-fill form fields
    if (projectFormData) {
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('projName',        projectFormData.name || t('startup.projNamePlaceholder'));
      set('projAddress',     projectFormData.address || '');
      const roofType = projectFormData.roofType || 'flat';
      set('projRoofType', roofType);
      const previewImg = document.getElementById('projRoofPreview');
      if (previewImg) previewImg.src = `assets/roof_${roofType}.png`;
      set('projWidth',       projectFormData.houseWidth || 10);
      set('projDepth',       projectFormData.houseDepth || 10);
      set('projWallHeight',  projectFormData.wallHeight || 3);
      set('projConsumption', projectFormData.annualConsumption || 5000);
      set('projTariff',      projectFormData.tariff || 0.30);
      set('projFeedIn',      projectFormData.feedInTariff || 0.08);
      set('projLifetime',    projectFormData.lifetime || 25);
      set('projCostPerKwp',  projectFormData.costPerKwp || 1200);

      const pitchInput = document.getElementById('projPitch');
      if (projectFormData.roofType === 'flat') {
        pitchInput.disabled = true;
        pitchInput.value = 0;
      } else {
        pitchInput.disabled = false;
        pitchInput.value = projectFormData.roofPitch || 30;
      }

      // Restore locate status if address was already geocoded
      const statusEl = document.getElementById('locateStatus');
      if (statusEl) {
        if (this._geocodedLat != null && projectFormData.address) {
          statusEl.textContent = `📍 ${projectFormData.address}`;
          statusEl.className = 'locate-status located';
        } else {
          statusEl.textContent = '';
          statusEl.className = 'locate-status';
        }
      }
    }
  }
}

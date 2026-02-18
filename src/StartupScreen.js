/**
 * StartupScreen.js
 * Full-screen startup overlay: Sandbox vs Project mode selection,
 * with project details form including building dimensions and panel recommendation.
 */

import { PanelRecommender } from './PanelRecommender.js';

export class StartupScreen {
  constructor() {
    this._el = null;
    this._cb = null;
    this._create();
  }

  _create() {
    this._el = document.createElement('div');
    this._el.className = 'startup-overlay';
    this._el.innerHTML = `
      <div class="startup-inner">
        <div class="startup-header">
          <div class="startup-sun-icon">&#x2600;</div>
          <h1>Solar Panel Simulation</h1>
          <p>Plan your solar installation with precision</p>
        </div>

        <!-- Mode selection cards -->
        <div class="startup-modes" id="startupModes">
          <div class="mode-card sandbox-card" id="sandboxCard">
            <img class="mode-card-icon" src="assets/sandbox_icon.png" alt="Sandbox mode" />
            <h2>Sandbox</h2>
            <p>Experiment freely with roof layouts, panel placement, obstacles and visual settings. No restrictions.</p>
            <button class="mode-btn sandbox-btn" id="sandboxLaunchBtn">Launch Sandbox</button>
          </div>
          <div class="mode-card project-card" id="projectCard">
            <img class="mode-card-icon" src="assets/project_icon.png" alt="Project mode" />
            <h2>Project Mode</h2>
            <p>Plan a real installation. Enter building details for ROI calculations, payback period and full financial analysis.</p>
            <button class="mode-btn project-btn" id="projectSetupBtn">Set Up Project &rarr;</button>
          </div>
        </div>

        <!-- Footer -->
        <div class="startup-footer">
          <p>Created as diploma thesis by:<br>Bc. Vladimir Kubica</p>
        </div>

        <!-- Project form (hidden until project card clicked) -->
        <div class="startup-form" id="startupForm" style="display:none">
          <h2>Project Details</h2>
          <div class="form-grid">
            <div class="form-group form-full">
              <label for="projName">Project Name</label>
              <input type="text" id="projName" placeholder="My Solar Project" value="My Solar Project">
            </div>
            <div class="form-group">
              <label for="projRoofType">Roof Type</label>
              <select id="projRoofType">
                <option value="flat">Flat</option>
                <option value="gable">Gable</option>
                <option value="hip">Hip</option>
                <option value="pyramid">Pyramid</option>
              </select>
            </div>
            <div class="form-group">
              <label for="projPitch">Pitch Angle (&deg;)</label>
              <input type="number" id="projPitch" value="30" min="5" max="60" step="1" disabled>
            </div>
            <div class="form-group">
              <label for="projWidth">Building Width (m)</label>
              <input type="number" id="projWidth" value="10" min="5" max="30" step="0.5">
            </div>
            <div class="form-group">
              <label for="projDepth">Building Depth (m)</label>
              <input type="number" id="projDepth" value="10" min="5" max="30" step="0.5">
            </div>
            <div class="form-group">
              <label for="projWallHeight">Wall Height (m)</label>
              <input type="number" id="projWallHeight" value="3" min="2" max="8" step="0.25">
            </div>
            <div class="form-group">
              <label for="projConsumption">Annual Consumption (kWh/yr)</label>
              <input type="number" id="projConsumption" value="5000" min="100" max="500000" step="100">
            </div>
            <div class="form-group">
              <label for="projTariff">Electricity Tariff (&#x20AC;/kWh)</label>
              <input type="number" id="projTariff" value="0.30" min="0.01" max="2.0" step="0.01">
            </div>
            <div class="form-group">
              <label for="projFeedIn">Feed-in Tariff (&#x20AC;/kWh)</label>
              <input type="number" id="projFeedIn" value="0.08" min="0" max="0.5" step="0.01">
            </div>
            <div class="form-group">
              <label for="projLifetime">System Lifetime (years)</label>
              <input type="number" id="projLifetime" value="25" min="5" max="40">
            </div>
            <div class="form-group">
              <label for="projCostPerKwp">Install Cost (&#x20AC;/kWp)</label>
              <input type="number" id="projCostPerKwp" value="1200" min="400" max="4000" step="50">
            </div>
          </div>

          <!-- Recommendation preview -->
          <div id="projRecommendBox" class="proj-recommend-box" style="display:none">
            <div class="recommend-title">&#x1F4CA; Panel Recommendation</div>
            <div class="recommend-grid">
              <span>Available Roof Area:</span> <span id="recRoofArea">--</span>
              <span>Max Panels That Fit:</span> <span id="recMaxPanels">--</span>
              <span>Recommended Panels:</span>  <span id="recPanels" class="rec-highlight">--</span>
              <span>Est. Annual Production:</span> <span id="recProduction">--</span>
              <span>Coverage of Consumption:</span> <span id="recCoverage">--</span>
            </div>
          </div>

          <div class="form-actions">
            <button class="form-back-btn" id="formBackBtn">&larr; Back</button>
            <button class="form-recommend-btn" id="recommendBtn">&#x1F4CA; Calculate</button>
            <button class="form-launch-btn" id="projectLaunchBtn">Launch Project &rarr;</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this._el);
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

    // Roof type controls pitch availability
    document.getElementById('projRoofType').addEventListener('change', e => {
      const pitchInput = document.getElementById('projPitch');
      if (e.target.value === 'flat') {
        pitchInput.disabled = true;
        pitchInput.value = 0;
      } else {
        pitchInput.disabled = false;
        if (parseFloat(pitchInput.value) === 0) pitchInput.value = 30;
      }
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

  _collectFormData() {
    return {
      name:              document.getElementById('projName').value        || 'My Project',
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

    // Pre-fill form fields
    if (projectFormData) {
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('projName',        projectFormData.name || 'My Solar Project');
      set('projRoofType',    projectFormData.roofType || 'flat');
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
    }
  }
}

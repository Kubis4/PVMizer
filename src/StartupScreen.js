/**
 * StartupScreen.js
 * Full-screen startup overlay: Sandbox vs Project mode selection,
 * with project details form for Project mode.
 */

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
          <div class="mode-card" id="sandboxCard">
            <div class="mode-card-icon">&#x1F3D6;</div>
            <h2>Sandbox</h2>
            <p>Experiment freely with roof layouts, panel placement, obstacles and visual settings. No restrictions.</p>
            <button class="mode-btn sandbox-btn" id="sandboxLaunchBtn">Launch Sandbox</button>
          </div>
          <div class="mode-card project-card" id="projectCard">
            <div class="mode-card-icon">&#x1F4CB;</div>
            <h2>Project Mode</h2>
            <p>Plan a real installation. Enter building details for ROI calculations, payback period and full financial analysis.</p>
            <button class="mode-btn project-btn" id="projectSetupBtn">Set Up Project &rarr;</button>
          </div>
        </div>

        <!-- Project form (hidden until project card clicked) -->
        <div class="startup-form" id="startupForm" style="display:none">
          <h2>Project Details</h2>
          <div class="form-grid">
            <div class="form-group">
              <label for="projName">Project Name</label>
              <input type="text" id="projName" placeholder="My Solar Project" value="My Solar Project">
            </div>
            <div class="form-group">
              <label for="projAddress">Address / Location</label>
              <input type="text" id="projAddress" placeholder="123 Main St, City">
            </div>
            <div class="form-group">
              <label for="projBuildingType">Building Type</label>
              <select id="projBuildingType">
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
              </select>
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
          <div class="form-actions">
            <button class="form-back-btn" id="formBackBtn">&larr; Back</button>
            <button class="form-launch-btn" id="projectLaunchBtn">Launch Project Simulation &rarr;</button>
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
    });

    document.getElementById('formBackBtn').addEventListener('click', () => {
      document.getElementById('startupForm').style.display  = 'none';
      document.getElementById('startupModes').style.display = '';
    });

    document.getElementById('projectLaunchBtn').addEventListener('click', () => {
      const data = {
        name:              document.getElementById('projName').value        || 'My Project',
        address:           document.getElementById('projAddress').value     || '',
        buildingType:      document.getElementById('projBuildingType').value,
        annualConsumption: parseFloat(document.getElementById('projConsumption').value) || 5000,
        tariff:            parseFloat(document.getElementById('projTariff').value)       || 0.30,
        feedInTariff:      parseFloat(document.getElementById('projFeedIn').value)       || 0.08,
        lifetime:          parseInt(document.getElementById('projLifetime').value)        || 25,
        costPerKwp:        parseFloat(document.getElementById('projCostPerKwp').value)   || 1200,
      };
      this._launch('project', data);
    });
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
  }

  hide() {
    this._el.style.display = 'none';
  }
}

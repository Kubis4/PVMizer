/**
 * HelpModal.js
 * Keyboard / mouse / numpad reference modal.
 */

export class HelpModal {
  constructor() {
    this._el = null;
    this._create();
  }

  _create() {
    this._el = document.createElement('div');
    this._el.className = 'help-overlay';
    this._el.style.display = 'none';
    this._el.innerHTML = `
      <div class="help-modal">
        <div class="help-header">
          <h2>Controls Reference</h2>
          <button class="help-close" id="helpClose">&#x2715;</button>
        </div>
        <div class="help-body">

          <div class="help-section">
            <h3>Numpad — Panel Grid (Manual Mode)</h3>
            <div class="numpad-grid">
              <div class="np-key dim">7<br><small>Prev Face</small></div>
              <div class="np-key move">8<br><small>&#x25B2; Up</small></div>
              <div class="np-key dim">9<br><small>Next Face</small></div>
              <div class="np-key move">4<br><small>&#x25C4; Left</small></div>
              <div class="np-key toggle">5<br><small>Toggle</small></div>
              <div class="np-key move">6<br><small>Right &#x25BA;</small></div>
              <div class="np-key fill">1<br><small>Fill All</small></div>
              <div class="np-key move">2<br><small>&#x25BC; Down</small></div>
              <div class="np-key clear">3<br><small>Clear All</small></div>
            </div>
            <p class="help-note">Click a roof face in the scene to select it for grid editing.</p>
          </div>

          <div class="help-section">
            <h3>Mouse</h3>
            <table class="help-table">
              <tr><td>Left drag</td><td>Rotate camera</td></tr>
              <tr><td>Right drag</td><td>Pan camera</td></tr>
              <tr><td>Scroll wheel</td><td>Zoom in / out</td></tr>
              <tr><td>Click roof face</td><td>Select face (manual mode)</td></tr>
              <tr><td>Click obstacle</td><td>Select obstacle</td></tr>
              <tr><td>Drag obstacle</td><td>Move obstacle</td></tr>
            </table>
          </div>

          <div class="help-section">
            <h3>Keyboard</h3>
            <table class="help-table">
              <tr><td><kbd>?</kbd></td><td>Show / hide this help</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Cancel placement / Deselect</td></tr>
              <tr><td><kbd>Del</kbd></td><td>Remove selected obstacle</td></tr>
              <tr><td><kbd>F11</kbd></td><td>Toggle fullscreen</td></tr>
              <tr><td><kbd>F12</kbd></td><td>Developer tools</td></tr>
            </table>
          </div>

          <div class="help-section">
            <h3>Obstacles Placement</h3>
            <table class="help-table">
              <tr><td>Chimney / Skylight / HVAC</td><td>Click on roof surface</td></tr>
              <tr><td>Tree / Utility Pole</td><td>Click on ground plane</td></tr>
            </table>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(this._el);
    document.getElementById('helpClose').addEventListener('click', () => this.hide());
    this._el.addEventListener('click', e => { if (e.target === this._el) this.hide(); });
  }

  show()   { this._el.style.display = 'flex'; }
  hide()   { this._el.style.display = 'none'; }
  toggle() { this._el.style.display === 'none' ? this.show() : this.hide(); }
}

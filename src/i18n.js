// ─── Internationalization (i18n) ──────────────────────────────────────────────
// Two languages: English (en) and Slovak (sk).
// Each translatable element in the HTML uses  data-i18n="key"  attribute.
// Call applyLanguage('sk') or applyLanguage('en') to switch.

const translations = {
  en: {
    // Left panel
    'panel.title':          'Solar Simulation',
    'section.roofType':     'Roof Type',
    'roof.flat':            'Flat',
    'roof.gable':           'Gable',
    'roof.hip':             'Hip',
    'roof.pyramid':         'Pyramid',
    'section.building':     'Building Dimensions',
    'label.width':          'Width',
    'label.depth':          'Depth',
    'label.wallHeight':     'Wall Height',
    'label.ridgeLength':    'Ridge Length',
    'label.pitchAngle':     'Pitch Angle',
    'label.rotation':       'Rotation',
    'label.date':           'Date:',
    'label.azimuth':        'Azimuth',
    'label.elevation':      'Elevation',
    'label.speed':          'Speed',
    'label.simulation':     'Simulation',
    'section.panels':       'Solar Panels',
    'label.layout':         'Layout',
    'layout.south':         '\u2600 South',
    'layout.north':         '\u2600 North',
    'layout.ew':            '\u21C4 E / W',
    'label.tiltAngle':      'Tilt Angle',
    'label.panelWidth':     'Panel Width',
    'label.panelHeight':    'Panel Height',
    'label.nominalPower':   'Nominal Power',
    'label.panelGap':       'Panel Gap',
    'label.orientation':    'Orientation',
    'orient.portrait':      'Portrait',
    'orient.landscape':     'Landscape',
    'section.location':     'Location',
    'label.advanced':       '\uD83D\uDCCD Advanced \u25BC',
    'label.latitude':       'Latitude',
    'label.longitude':      'Longitude',

    // Right panel
    'panel.energy':         'Energy Output',
    'section.currentPower': 'Current Power',
    'label.ofPeak':         'of peak capacity',
    'section.sunInfo':      'Sun Info',
    'label.irradiance':     'Irradiance',
    'label.solarNoon':      'Solar Noon',
    'section.system':       'System',
    'label.totalPanels':    'Total Panels',
    'label.totalArea':      'Total Area',
    'label.peakPower':      'Peak Power',
    'label.dailyEnergy':    'Daily Energy',
    'label.annualEnergy':   'Annual Energy',
    'label.co2Saved':       'CO\u2082 Saved',
    'section.financial':    '\uD83D\uDCB6 Financial Analysis',
    'label.annualProd':     'Annual Production',
    'label.annualCons':     'Annual Consumption',
    'label.annualSavings':  'Annual Savings',
    'label.systemCost':     'System Cost',
    'label.payback':        'Payback Period',
    'label.lifetimeSavings':'Lifetime Savings',
    'label.co2Reduction':   'CO\u2082 Reduction',
    'label.selfConsumption':'Self-Consumption',
    'section.powerCurve':   "Today's Power Curve",
    'section.monthlyEnergy':'Monthly Energy (kWh)',

    // Obstacle toolbar
    'toolbar.obstacles':    'Obstacles',
    'obs.chimney':          '\uD83E\uDDF1 Chimney',
    'obs.skylight':         '\uD83E\uDE9F Skylight',
    'obs.hvac':             '\u2744 HVAC',
    'obs.tree':             '\uD83C\uDF33 Tree',
    'obs.pole':             '\u26A1 Pole',
    'obs.clear':            '\uD83D\uDDD1 Clear',
    'label.size':           'Size',
    'label.rotate':         'Rotate',

    // Info bar
    'ib.roof':              'Roof',
    'ib.time':              'Time',
    'ib.date':              'Date',
    'ib.power':             'Power',
    'ib.panels':            'Panels',

    // Heatmap
    'heatmap.low':          'Low',
    'heatmap.mid':          'Mid',
    'heatmap.high':         'High',

    // Settings
    'settings.title':       '\u2699\uFE0F Settings',
    'settings.language':    'Language',
    'settings.scene':       'Scene',
    'settings.shadows':     'Shadows',
    'settings.sunTrajectory':'Sun Trajectory',
    'settings.showCompass': 'Show Compass',
    'settings.rendering':   'Rendering',
    'settings.exposure':    'Exposure',
    'settings.bloom':       'Bloom',
    'settings.fogDensity':  'Fog Density',

    // Loading
    'loading.text':         'Initializing Solar Simulation...',

    // Restore buttons
    'btn.showControls':     'Show controls',
    'btn.showEnergy':       'Show energy output',
  },

  sk: {
    // Left panel
    'panel.title':          'Sol\u00e1rna simul\u00e1cia',
    'section.roofType':     'Typ strechy',
    'roof.flat':            'Ploch\u00e1',
    'roof.gable':           '\u0160t\u00edtov\u00e1',
    'roof.hip':             'Valbov\u00e1',
    'roof.pyramid':         'Ihlanová',
    'section.building':     'Rozmery budovy',
    'label.width':          '\u0160\u00edrka',
    'label.depth':          'H\u013abka',
    'label.wallHeight':     'V\u00fd\u0161ka steny',
    'label.ridgeLength':    'D\u013a\u017eka hre\u0148a',
    'label.pitchAngle':     'Uhol sklonu',
    'label.rotation':       'Ot\u00e1\u010danie',
    'label.date':           'D\u00e1tum:',
    'label.azimuth':        'Azimut',
    'label.elevation':      'Elev\u00e1cia',
    'label.speed':          'R\u00fdchlos\u0165',
    'label.simulation':     'Simul\u00e1cia',
    'section.panels':       'Sol\u00e1rne panely',
    'label.layout':         'Rozlo\u017eenie',
    'layout.south':         '\u2600 Juh',
    'layout.north':         '\u2600 Sever',
    'layout.ew':            '\u21C4 V / Z',
    'label.tiltAngle':      'Uhol n\u00e1klonu',
    'label.panelWidth':     '\u0160\u00edrka panela',
    'label.panelHeight':    'V\u00fd\u0161ka panela',
    'label.nominalPower':   'Nomin\u00e1lny v\u00fdkon',
    'label.panelGap':       'Medzera',
    'label.orientation':    'Orient\u00e1cia',
    'orient.portrait':      'Na v\u00fd\u0161ku',
    'orient.landscape':     'Na \u0161\u00edrku',
    'section.location':     'Poloha',
    'label.advanced':       '\uD83D\uDCCD Pokro\u010dil\u00e9 \u25BC',
    'label.latitude':       'Zemepisn\u00e1 \u0161\u00edrka',
    'label.longitude':      'Zemepisn\u00e1 d\u013a\u017eka',

    // Right panel
    'panel.energy':         'Energetick\u00fd v\u00fdstup',
    'section.currentPower': 'Aktu\u00e1lny v\u00fdkon',
    'label.ofPeak':         'z maxim\u00e1lnej kapacity',
    'section.sunInfo':      'Info o slnku',
    'label.irradiance':     'Intenzita \u017eiarenia',
    'label.solarNoon':      'Slne\u010dn\u00fd poludnie',
    'section.system':       'Syst\u00e9m',
    'label.totalPanels':    'Po\u010det panelov',
    'label.totalArea':      'Celkov\u00e1 plocha',
    'label.peakPower':      '\u0160pi\u010dkov\u00fd v\u00fdkon',
    'label.dailyEnergy':    'Denn\u00e1 energia',
    'label.annualEnergy':   'Ro\u010dn\u00e1 energia',
    'label.co2Saved':       'CO\u2082 \u00faspora',
    'section.financial':    '\uD83D\uDCB6 Finan\u010dn\u00e1 anal\u00fdza',
    'label.annualProd':     'Ro\u010dn\u00e1 produkcia',
    'label.annualCons':     'Ro\u010dn\u00e1 spotreba',
    'label.annualSavings':  'Ro\u010dn\u00e9 \u00faspory',
    'label.systemCost':     'Cena syst\u00e9mu',
    'label.payback':        'N\u00e1vratnos\u0165',
    'label.lifetimeSavings':'\u017divotn\u00e9 \u00faspory',
    'label.co2Reduction':   'CO\u2082 redukcia',
    'label.selfConsumption':'Vlastn\u00e1 spotreba',
    'section.powerCurve':   'Dne\u0161n\u00fd v\u00fdkonov\u00fd priebeh',
    'section.monthlyEnergy':'Mesi\u0161n\u00e1 energia (kWh)',

    // Obstacle toolbar
    'toolbar.obstacles':    'Prek\u00e1\u017eky',
    'obs.chimney':          '\uD83E\uDDF1 Kom\u00edn',
    'obs.skylight':         '\uD83E\uDE9F Strešné okno',
    'obs.hvac':             '\u2744 Klimatiz\u00e1cia',
    'obs.tree':             '\uD83C\uDF33 Strom',
    'obs.pole':             '\u26A1 St\u013ap',
    'obs.clear':            '\uD83D\uDDD1 Vymaza\u0165',
    'label.size':           'Ve\u013ekos\u0165',
    'label.rotate':         'Ot\u00e1\u010danie',

    // Info bar
    'ib.roof':              'Strecha',
    'ib.time':              '\u010cas',
    'ib.date':              'D\u00e1tum',
    'ib.power':             'V\u00fdkon',
    'ib.panels':            'Panely',

    // Heatmap
    'heatmap.low':          'N\u00edzka',
    'heatmap.mid':          'Stredn\u00e1',
    'heatmap.high':         'Vysok\u00e1',

    // Settings
    'settings.title':       '\u2699\uFE0F Nastavenia',
    'settings.language':    'Jazyk',
    'settings.scene':       'Sc\u00e9na',
    'settings.shadows':     'Tiene',
    'settings.sunTrajectory':'Trajekt\u00f3ria slnka',
    'settings.showCompass': 'Zobrazi\u0165 kompas',
    'settings.rendering':   'Vykres\u013eovanie',
    'settings.exposure':    'Expoz\u00edcia',
    'settings.bloom':       'Bloom',
    'settings.fogDensity':  'Hustota hmly',

    // Loading
    'loading.text':         'Inicializ\u00e1cia sol\u00e1rnej simul\u00e1cie...',

    // Restore buttons
    'btn.showControls':     'Zobrazi\u0165 ovl\u00e1danie',
    'btn.showEnergy':       'Zobrazi\u0165 energiu',
  }
};

let currentLang = 'en';

export function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) ||
         (translations.en[key]) || key;
}

export function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const target = el.getAttribute('data-i18n-attr'); // e.g. "title", "placeholder"
    if (target) {
      el.setAttribute(target, t(key));
    } else {
      el.textContent = t(key);
    }
  });
  // Update elements with data-i18n-html (for innerHTML with entities)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
}

export function getLanguage() {
  return currentLang;
}

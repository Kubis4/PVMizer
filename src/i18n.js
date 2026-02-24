// ─── Internationalization (i18n) ──────────────────────────────────────────────
// Two languages: English (en) and Slovak (sk).
// Each translatable element in the HTML uses  data-i18n="key"  attribute.
// Call applyLanguage('sk') or applyLanguage('en') to switch.

const translations = {
  en: {
    // Startup screen
    'startup.appTitle':     'PVMizer 2.0',
    'startup.subtitle':     'Plan your solar installation with precision',
    'startup.sandbox':      'Sandbox',
    'startup.sandboxDesc':  'Freely explore roof types, panel orientations, obstacle shading and live sun trajectory simulation. No data entry — jump straight into the 3D scene.',
    'startup.sandboxBtn':   'Launch Sandbox',
    'startup.project':      'Project Mode',
    'startup.projectDesc':  'Plan a real PV installation. Enter building dimensions and annual consumption — the app recommends panel count, calculates yearly energy production, savings, payback period and generates a full PDF report.',
    'startup.projectBtn':   'Set Up Project →',
    'startup.loadProject':  'Load Saved Project',
    'startup.projectForm':  'Project Details',
    'startup.projName':            'Project Name',
    'startup.projNamePlaceholder': 'My Solar Project',
    'startup.address':             'Address / Location',
    'startup.addressPlaceholder':  'e.g. Bratislava, Slovakia',
    'startup.locateBtn':           'Locate',
    'startup.locating':            'Locating...',
    'startup.locateError':         'Address not found',
    'startup.roofType':            'Roof Type',
    'startup.pitchAngle':   'Pitch Angle (°)',
    'startup.width':        'Building Width (m)',
    'startup.depth':        'Building Depth (m)',
    'startup.wallHeight':   'Wall Height (m)',
    'startup.consumption':  'Annual Consumption (kWh/yr)',
    'startup.tariff':       'Electricity Tariff (€/kWh)',
    'startup.feedIn':       'Feed-in Tariff (€/kWh)',
    'startup.lifetime':     'System Lifetime (years)',
    'startup.costPerKwp':   'Install Cost (€/kWp)',
    'startup.launchProject':'Launch Project →',
    'startup.back':         '← Back',
    'startup.calculate':    'Calculate',
    'startup.recTitle':     '📊 Panel Recommendation',
    'startup.recArea':      'Available Roof Area:',
    'startup.recMaxPanels': 'Max Panels That Fit:',
    'startup.recPanels':    'Recommended Panels:',
    'startup.recProduction':'Est. Annual Production:',
    'startup.recCoverage':  'Coverage of Consumption:',
    'startup.credit':       'Created as diploma thesis by:\nBc. Vladimir Kubica',

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
    'layout.south':         '☀ South',
    'layout.north':         '☀ North',
    'layout.ew':            '⇄ E / W',
    'label.tiltAngle':      'Tilt Angle',
    'label.panelWidth':     'Panel Width',
    'label.panelHeight':    'Panel Height',
    'label.nominalPower':   'Nominal Power',
    'label.panelGap':       'Panel Gap',
    'label.orientation':    'Orientation',
    'orient.portrait':      'Portrait',
    'orient.landscape':     'Landscape',
    'orient.maxFill':       'Max Fill',
    'label.fillOrder':      'Fill Order',
    'fill.bottom':          '⬆ Bottom',
    'fill.top':             '⬇ Top',
    'fill.center':          '◎ Center',
    'label.placed':         'Placed',
    'label.remaining':      'Remaining',
    'label.face':           'Face',
    'btn.reset':            'Reset',
    'section.location':     'Location',
    'label.advanced':       '📍 Advanced ▼',
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
    'label.co2Saved':       'CO₂ Saved',
    'section.financial':    '💶 Financial Analysis',
    'label.annualProd':     'Annual Production',
    'label.annualCons':     'Annual Consumption',
    'label.annualSavings':  'Annual Savings',
    'label.systemCost':     'System Cost',
    'label.payback':        'Payback Period',
    'label.lifetimeSavings':'Lifetime Savings',
    'label.co2Reduction':   'CO₂ Reduction',
    'label.selfConsumption':'Self-Consumption',
    'section.powerCurve':   "Today's Power Curve",
    'section.monthlyEnergy':'Monthly Energy (kWh)',

    // Obstacle toolbar
    'toolbar.obstacles':    'Obstacles',
    'obs.chimney':          '🧱 Chimney',
    'obs.skylight':         '🪟 Skylight',
    'obs.hvac':             '❄ HVAC',
    'obs.tree':             '🌲 Pine',
    'obs.pole':             '⚡ Pole',
    'obs.clear':            '🗑 Clear',
    'obs.leaf':             '🌳 Leaf',
    'label.size':           'Size',
    'label.rotate':         'Rotate',

    // Info bar
    'ib.roof':              'Roof',
    'ib.time':              'Time',
    'ib.date':              'Date',
    'ib.power':             'Power',
    'ib.panels':            'Panels',
    'ib.weather':           'Weather',
    'weather.clear':        '☀️ Clear',
    'weather.partlyCloudy': '⛅ Partly Cloudy',
    'weather.cloudy':       '☁️ Cloudy',
    'weather.rainy':        '🌧️ Rainy',
    'weather.snowy':        '🌨️ Snowy',

    // Heatmap
    'heatmap.low':          'Low',
    'heatmap.mid':          'Mid',
    'heatmap.high':         'High',

    // Settings
    'settings.title':       '⚙️ Settings',
    'settings.language':    'Language',
    'settings.scene':       'Scene',
    'settings.shadows':     'Shadows',
    'settings.sunTrajectory':'Sun Trajectory',
    'settings.showCompass': 'Show Compass',
    'settings.rendering':   'Rendering',
    'settings.exposure':    'Exposure',
    'settings.bloom':       'Bloom',
    'settings.fogDensity':  'Fog Density',
    'settings.sunRays':     'Sun Rays',
    'settings.rayIntensity':'Ray Intensity',

    // Loading
    'loading.text':         'Initializing Solar Simulation...',

    // Restore buttons
    'btn.showControls':     'Show controls',
    'btn.showEnergy':       'Show energy output',

    // PDF export & project save/load
    'btn.exportPdf':        'Export PDF Report',
    'btn.homeTooltip':      'Back to project selection',
    'btn.saveProject':      'Save Project',
    'btn.loadProject':      'Load Project',
    'label.clickToEdit':    'Click to edit project',
  },

  sk: {
    // Startup screen
    'startup.appTitle':     'PVMizer 2.0',
    'startup.subtitle':     'Naplánujte svoju solárnu inštaláciu s presnosťou',
    'startup.sandbox':      'Sandbox',
    'startup.sandboxDesc':  'Preskúmajte typy striech, orientácie panelov, tienenie prekážkami a živú simuláciu slnečnej dráhy. Bez zadávania údajov — priamo do 3D scény.',
    'startup.sandboxBtn':   'Spustiť Sandbox',
    'startup.project':      'Projekt',
    'startup.projectDesc':  'Naplánujte skutočnú FV inštaláciu. Zadajte rozmery budovy a ročnú spotrebu — aplikácia odporučí počet panelov, vypočíta ročnú produkciu, úspory, dobu návratnosti a vygeneruje PDF správu.',
    'startup.projectBtn':   'Nastaviť projekt →',
    'startup.loadProject':  'Načítať uložený projekt',
    'startup.projectForm':  'Podrobnosti projektu',
    'startup.projName':            'Názov projektu',
    'startup.projNamePlaceholder': 'Môj solárny projekt',
    'startup.address':             'Adresa / Lokalita',
    'startup.addressPlaceholder':  'napr. Bratislava, Slovensko',
    'startup.locateBtn':           'Nájsť',
    'startup.locating':            'Hľadám...',
    'startup.locateError':         'Adresa nenájdená',
    'startup.roofType':            'Typ strechy',
    'startup.pitchAngle':   'Uhol sklonu (°)',
    'startup.width':        'Šírka budovy (m)',
    'startup.depth':        'Hĺbka budovy (m)',
    'startup.wallHeight':   'Výška steny (m)',
    'startup.consumption':  'Ročná spotreba (kWh/rok)',
    'startup.tariff':       'Cena elektriny (€/kWh)',
    'startup.feedIn':       'Spätná zmluvná cena (€/kWh)',
    'startup.lifetime':     'Životnosť systému (roky)',
    'startup.costPerKwp':   'Náklady na inštaláciu (€/kWp)',
    'startup.launchProject':'Spustiť projekt →',
    'startup.back':         '← Späť',
    'startup.calculate':    'Vypočítať',
    'startup.recTitle':     '📊 Odporúčanie panelov',
    'startup.recArea':      'Dostupná plocha strechy:',
    'startup.recMaxPanels': 'Max. panelov:',
    'startup.recPanels':    'Odporúčané panely:',
    'startup.recProduction':'Odh. ročná výroba:',
    'startup.recCoverage':  'Pokrytie spotreby:',
    'startup.credit':       'Vytvorené ako diplomová práca:\nBc. Vladimir Kubica',

    // Left panel
    'panel.title':          'Solárna simulácia',
    'section.roofType':     'Typ strechy',
    'roof.flat':            'Plochá',
    'roof.gable':           'Sedlová',
    'roof.hip':             'Valbová',
    'roof.pyramid':         'Pyramídová',
    'section.building':     'Rozmery budovy',
    'label.width':          'Šírka',
    'label.depth':          'Hĺbka',
    'label.wallHeight':     'Výška steny',
    'label.ridgeLength':    'Dĺžka hreňa',
    'label.pitchAngle':     'Uhol sklonu',
    'label.rotation':       'Otáčanie',
    'label.date':           'Dátum:',
    'label.azimuth':        'Azimut',
    'label.elevation':      'Elevácia',
    'label.speed':          'Rýchlosť',
    'label.simulation':     'Simulácia',
    'section.panels':       'Solárne panely',
    'label.layout':         'Rozloženie',
    'layout.south':         '☀ Juh',
    'layout.north':         '☀ Sever',
    'layout.ew':            '⇄ V / Z',
    'label.tiltAngle':      'Uhol náklonu',
    'label.panelWidth':     'Šírka panela',
    'label.panelHeight':    'Výška panela',
    'label.nominalPower':   'Nominálny výkon',
    'label.panelGap':       'Medzera',
    'label.orientation':    'Orientácia',
    'orient.portrait':      'Na výšku',
    'orient.landscape':     'Na šírku',
    'orient.maxFill':       'Max. výplň',
    'label.fillOrder':      'Poradie výplne',
    'fill.bottom':          '⬆ Zdola',
    'fill.top':             '⬇ Zhora',
    'fill.center':          '◎ Stred',
    'label.placed':         'Umiestnené',
    'label.remaining':      'Zostatok',
    'label.face':           'Plocha',
    'btn.reset':            'Resetovať',
    'section.location':     'Poloha',
    'label.advanced':       '📍 Pokročilé ▼',
    'label.latitude':       'Zemepisná šírka',
    'label.longitude':      'Zemepisná dĺžka',

    // Right panel
    'panel.energy':         'Energetický výstup',
    'section.currentPower': 'Aktuálny výkon',
    'label.ofPeak':         'z maximálnej kapacity',
    'section.sunInfo':      'Info o slnku',
    'label.irradiance':     'Intenzita žiarenia',
    'label.solarNoon':      'Slnečný poludnie',
    'section.system':       'Systém',
    'label.totalPanels':    'Počet panelov',
    'label.totalArea':      'Celková plocha',
    'label.peakPower':      'Špičkový výkon',
    'label.dailyEnergy':    'Denná energia',
    'label.annualEnergy':   'Ročná energia',
    'label.co2Saved':       'CO₂ úspora',
    'section.financial':    '💶 Finančná analýza',
    'label.annualProd':     'Ročná produkcia',
    'label.annualCons':     'Ročná spotreba',
    'label.annualSavings':  'Ročné úspory',
    'label.systemCost':     'Cena systému',
    'label.payback':        'Návratnosť',
    'label.lifetimeSavings':'Životné úspory',
    'label.co2Reduction':   'CO₂ redukcia',
    'label.selfConsumption':'Vlastná spotreba',
    'section.powerCurve':   'Dnešný výkonový priebeh',
    'section.monthlyEnergy':'Mesačná energia (kWh)',

    // Obstacle toolbar
    'toolbar.obstacles':    'Prekážky',
    'obs.chimney':          '🧱 Komín',
    'obs.skylight':         '🪟 Strešné okno',
    'obs.hvac':             '❄ Klimatizácia',
    'obs.tree':             '🌲 Ihličan',
    'obs.pole':             '⚡ Stĺp',
    'obs.clear':            '🗑 Vymazať',
    'obs.leaf':             '🌳 Listnatý',
    'label.size':           'Veľkosť',
    'label.rotate':         'Otáčanie',

    // Info bar
    'ib.roof':              'Strecha',
    'ib.time':              'Čas',
    'ib.date':              'Dátum',
    'ib.power':             'Výkon',
    'ib.panels':            'Panely',
    'ib.weather':           'Počasie',
    'weather.clear':        '☀️ Jasno',
    'weather.partlyCloudy': '⛅ Polojasno',
    'weather.cloudy':       '☁️ Oblačno',
    'weather.rainy':        '🌧️ Dažď',
    'weather.snowy':        '🌨️ Sneh',

    // Heatmap
    'heatmap.low':          'Nízka',
    'heatmap.mid':          'Stredná',
    'heatmap.high':         'Vysoká',

    // Settings
    'settings.title':       '⚙️ Nastavenia',
    'settings.language':    'Jazyk',
    'settings.scene':       'Scéna',
    'settings.shadows':     'Tiene',
    'settings.sunTrajectory':'Trajektória slnka',
    'settings.showCompass': 'Zobraziť kompas',
    'settings.rendering':   'Vykresľovanie',
    'settings.exposure':    'Expozícia',
    'settings.bloom':       'Bloom',
    'settings.fogDensity':  'Hustota hmly',
    'settings.sunRays':     'Slnečné lúče',
    'settings.rayIntensity':'Intenzita lúčov',

    // Loading
    'loading.text':         'Inicializácia solárnej simulácie...',

    // Restore buttons
    'btn.showControls':     'Zobraziť ovládanie',
    'btn.showEnergy':       'Zobraziť energiu',

    // PDF export & project save/load
    'btn.exportPdf':        'Exportovať PDF report',
    'btn.homeTooltip':      'Späť na výber projektu',
    'btn.saveProject':      'Uložiť projekt',
    'btn.loadProject':      'Načítať projekt',
    'label.clickToEdit':    'Kliknúť pre úpravu projektu',
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
  try { localStorage.setItem('pvmizer-lang', lang); } catch (_) {}
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

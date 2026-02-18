/**
 * PanelRecommender.js
 * Estimates optimal panel count based on roof geometry and consumption.
 */

export class PanelRecommender {

  /**
   * Calculate usable roof area (m²) for panel placement.
   */
  static _roofUsableArea(roofType, width, depth, pitchDeg) {
    const pitchRad = pitchDeg * Math.PI / 180;
    switch (roofType) {
      case 'flat':
        return width * depth * 0.70; // 70% utilization (setbacks, spacing)

      case 'gable': {
        // Two rectangular slope faces
        const slopeWidth = (depth / 2) / Math.cos(pitchRad);
        return 2 * slopeWidth * width * 0.75; // 75% after setbacks
      }

      case 'hip': {
        // Approximate as gable * 0.85 (hip cuts reduce area)
        const slopeWidth = (depth / 2) / Math.cos(pitchRad);
        return 2 * slopeWidth * width * 0.75 * 0.85;
      }

      case 'pyramid': {
        // Four triangular faces
        const halfBase = Math.min(width, depth) / 2;
        const slantHeight = halfBase / Math.cos(pitchRad);
        const faceArea = 0.5 * Math.min(width, depth) * slantHeight;
        return 4 * faceArea * 0.60; // 60% usable on triangular faces
      }

      default:
        return width * depth * 0.50;
    }
  }

  /**
   * Recommend panel count and estimated production.
   * @param {Object} params
   * @returns {{ usableAreaM2, maxPanelsFit, recommendedPanels, estAnnualKwh, coveragePct, panelsForFull100 }}
   */
  static recommend({
    roofType = 'flat',
    houseWidth = 10,
    houseDepth = 10,
    roofPitch = 30,
    panelWidth = 1.0,
    panelHeight = 1.65,
    panelGap = 0.10,
    panelNominalWp = 440,
    annualConsumption = 5000,
    latitude = 48.3,
  }) {
    const usableArea = PanelRecommender._roofUsableArea(roofType, houseWidth, houseDepth, roofPitch);

    // Max panels that fit (simple area packing)
    const panelArea = (panelWidth + panelGap) * (panelHeight + panelGap);
    const maxPanels = Math.max(1, Math.floor(usableArea / panelArea));

    // Latitude-based specific yield (kWh/kWp/year)
    // ~1800 at equator, ~950 at lat 50, ~650 at lat 70
    const specificYield = Math.max(600, 1800 - Math.abs(latitude) * 16);
    const panelKwp = panelNominalWp / 1000;
    const annualPerPanel = panelKwp * specificYield;

    // Panels needed to cover consumption
    const panelsForFull100 = Math.ceil(annualConsumption / annualPerPanel);

    // Recommended = min of what's needed and what fits
    const recommendedPanels = Math.min(panelsForFull100, maxPanels);

    const estProduction = recommendedPanels * annualPerPanel;
    const coverage = annualConsumption > 0
      ? Math.min(100, (estProduction / annualConsumption) * 100)
      : 100;

    return {
      usableAreaM2:     Math.round(usableArea * 10) / 10,
      maxPanelsFit:     maxPanels,
      recommendedPanels,
      estAnnualKwh:     Math.round(estProduction),
      coveragePct:      Math.round(coverage),
      panelsForFull100,
    };
  }
}

/**
 * ProjectData.js
 * Holds project settings and computes financial analysis.
 */

export class ProjectData {
  constructor(data = {}) {
    this.name              = data.name              || 'My Project';
    this.roofType          = data.roofType          || 'flat';
    this.houseWidth        = data.houseWidth        || 10;
    this.houseDepth        = data.houseDepth        || 10;
    this.wallHeight        = data.wallHeight        || 3;
    this.roofPitch         = data.roofPitch         || 30;
    this.annualConsumption = data.annualConsumption  || 5000;   // kWh/yr
    this.tariff            = data.tariff            || 0.30;   // €/kWh
    this.feedInTariff      = data.feedInTariff      || 0.08;   // €/kWh
    this.lifetime          = data.lifetime          || 25;     // years
    this.costPerKwp        = data.costPerKwp        || 1200;   // €/kWp
  }

  /** Estimated installation cost */
  getSystemCost(kWp) {
    return kWp * this.costPerKwp;
  }

  /**
   * Annual savings: self-consumption saves at full tariff, exported earns feed-in.
   * Assumes 70% self-consumption rate for residential, 50% for commercial/industrial.
   */
  getAnnualSavings(annualProductionKwh) {
    const selfRate     = 0.70;
    const selfConsumed = Math.min(annualProductionKwh, this.annualConsumption) * selfRate;
    const exported     = Math.max(0, annualProductionKwh - selfConsumed);
    return selfConsumed * this.tariff + exported * this.feedInTariff;
  }

  /** Self-consumption percentage (0–100) */
  getSelfConsumptionRate(annualProductionKwh) {
    if (annualProductionKwh <= 0) return 0;
    const selfRate = 0.70;
    const selfConsumed = Math.min(annualProductionKwh, this.annualConsumption) * selfRate;
    return Math.min(100, (selfConsumed / annualProductionKwh) * 100);
  }

  /** Payback period in years */
  getPaybackPeriod(kWp, annualProductionKwh) {
    const cost    = this.getSystemCost(kWp);
    const savings = this.getAnnualSavings(annualProductionKwh);
    if (savings <= 0) return Infinity;
    return cost / savings;
  }

  /** Lifetime net savings after subtracting system cost */
  getLifetimeSavings(kWp, annualProductionKwh) {
    const cost          = this.getSystemCost(kWp);
    const annualSavings = this.getAnnualSavings(annualProductionKwh);
    return annualSavings * this.lifetime - cost;
  }

  /** CO2 reduction over system lifetime (tonnes) — EU grid avg ~0.275 kg CO2/kWh */
  getCO2Reduction(annualProductionKwh) {
    return (annualProductionKwh * this.lifetime * 0.275) / 1000;
  }
}

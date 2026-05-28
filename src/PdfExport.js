/**
 * PdfExport.js
 * Generates a professional PDF report for a project: summary, 3D screenshot, charts.
 */

// ── Color palette ────────────────────────────────────────────────────────────
const C = {
  primary:    [30, 64, 175],    // blue-700
  dark:       [30, 30, 40],
  mid:        [80, 80, 100],
  light:      [140, 140, 160],
  accent:     [59, 130, 246],   // blue-500
  rowEven:    [245, 247, 255],
  rowOdd:     [255, 255, 255],
  headerBg:   [30, 64, 175],
  headerFg:   [255, 255, 255],
  border:     [210, 215, 230],
  footerText: [160, 160, 170],
};

/**
 * Capture a high-resolution snapshot of the 3D canvas.
 * Temporarily resizes the renderer, renders one frame, captures, then restores.
 */
function captureHighResScreenshot(canvasEl, renderer, composer, camera, scale = 2) {
  if (!renderer || !composer || !camera) {
    return canvasEl.toDataURL('image/png');
  }

  const origW = canvasEl.width;
  const origH = canvasEl.height;
  const newW  = origW * scale;
  const newH  = origH * scale;

  renderer.setSize(newW, newH, false);
  composer.setSize(newW, newH);
  camera.aspect = newW / newH;
  camera.updateProjectionMatrix();
  composer.render();

  const imgData = canvasEl.toDataURL('image/jpeg', 0.92);

  // Restore original size
  renderer.setSize(origW, origH, false);
  composer.setSize(origW, origH);
  camera.aspect = origW / origH;
  camera.updateProjectionMatrix();
  composer.render();

  return imgData;
}

/**
 * Capture a chart at higher resolution using Chart.js devicePixelRatio.
 * This is the correct approach — resizing the canvas directly fights Chart.js.
 */
function captureChartHighRes(chart, scale = 3) {
  if (!chart || !chart.canvas) return null;
  try {
    const origDPR = chart.options.devicePixelRatio;
    chart.options.devicePixelRatio = (window.devicePixelRatio || 1) * scale;
    chart.update('none');
    const imgData = chart.toBase64Image('image/png', 1);
    chart.options.devicePixelRatio = origDPR ?? (window.devicePixelRatio || 1);
    chart.update('none');
    return imgData;
  } catch (e) {
    try { return chart.toBase64Image('image/png', 1); } catch (_) { return null; }
  }
}

export async function exportProjectPDF(projectData, stats, canvasEl, charts, renderContext) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pw - margin * 2;
  let y = margin;

  // Pre-compute all financial values (used across pages)
  const annualKwh      = stats.annualKwh;
  const peakKwp        = stats.peakPowerKw;
  const selfConsume    = projectData.getSelfConsumptionRate(annualKwh);
  const systemCost     = projectData.getSystemCost(peakKwp);
  const annualSavings  = projectData.getAnnualSavings(annualKwh);
  const payback        = projectData.getPaybackPeriod(peakKwp, annualKwh);
  const lifetimeSavings = projectData.getLifetimeSavings(peakKwp, annualKwh);
  const fmtEur = v => `\u20AC ${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const addPageNumber = (pageNum) => {
    doc.setFontSize(8);
    doc.setTextColor(...C.footerText);
    doc.text(`Page ${pageNum}`, pw / 2, ph - 8, { align: 'center' });
    doc.text('PVMizer - Solar Panel Simulation', margin, ph - 8);
    doc.text(new Date().toLocaleDateString(), pw - margin, ph - 8, { align: 'right' });
  };

  // ── PAGE 1: 3D Screenshot + Key KPIs ─────────────────────────────────────

  // Header bar
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pw, 28, 'F');
  doc.setFontSize(18);
  doc.setTextColor(...C.headerFg);
  doc.text(projectData.name, pw / 2, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Solar Installation Report', pw / 2, 19, { align: 'center' });
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pw / 2, 25, { align: 'center' });
  y = 33;

  // ── 3D Screenshot ────────────────────────────────────────────────────────
  try {
    let imgData;
    if (renderContext && renderContext.renderer && renderContext.composer && renderContext.camera) {
      imgData = captureHighResScreenshot(
        canvasEl, renderContext.renderer, renderContext.composer, renderContext.camera, 2
      );
    } else {
      imgData = canvasEl.toDataURL('image/jpeg', 0.92);
    }

    // Reserve bottom ~90mm for KPI table — use the rest for the image
    const maxImgH = ph - y - 95;
    const naturalH = contentW * (canvasEl.height / canvasEl.width);
    const finalH = Math.min(naturalH, maxImgH);

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.rect(margin - 0.5, y - 0.5, contentW + 1, finalH + 1, 'S');
    doc.addImage(imgData, 'JPEG', margin, y, contentW, finalH);
    y += finalH + 6;
  } catch (e) {
    doc.setFontSize(10);
    doc.setTextColor(200, 50, 50);
    doc.text('Could not capture 3D view.', margin, y);
    y += 10;
  }

  // ── Key KPI summary table ─────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Project Summary', margin, y, contentW);

  const kpiRows = [
    ['Total Panels',       `${stats.panelCount}`],
    ['Peak Power',         `${peakKwp.toFixed(2)} kWp`],
    ['Annual Production',  `${annualKwh.toLocaleString()} kWh`],
    ['Self-Consumption',   `${selfConsume.toFixed(0)}%`],
    ['System Cost',        fmtEur(systemCost)],
    ['Annual Savings',     fmtEur(annualSavings)],
    ['Payback Period',     payback === Infinity ? 'N/A' : `${payback.toFixed(1)} years`],
  ];
  drawTable(doc, kpiRows, margin, y, contentW);

  addPageNumber(1);

  // ── PAGE 2: Full Installation Details ────────────────────────────────────
  doc.addPage();
  y = margin;

  // Section header bar
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pw, 16, 'F');
  doc.setFontSize(13);
  doc.setTextColor(...C.headerFg);
  doc.text('Installation Details', pw / 2, 11, { align: 'center' });
  y = 24;

  // ── Building Parameters ───────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Building Parameters', margin, y, contentW);
  const buildingRows = [
    ['Roof Type',     projectData.roofType.charAt(0).toUpperCase() + projectData.roofType.slice(1)],
    ['Width',         `${projectData.houseWidth} m`],
    ['Depth',         `${projectData.houseDepth} m`],
    ['Wall Height',   `${projectData.wallHeight} m`],
    ['Pitch Angle',   `${projectData.roofPitch}\u00B0`],
  ];
  y = drawTable(doc, buildingRows, margin, y, contentW);
  y += 6;

  // ── System Results ────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'System Results', margin, y, contentW);

  const systemRows = [
    ['Total Panels',       `${stats.panelCount}`],
    ['Peak Power',         `${peakKwp.toFixed(2)} kWp`],
    ['Annual Production',  `${annualKwh.toLocaleString()} kWh`],
    ['Annual Consumption', `${projectData.annualConsumption.toLocaleString()} kWh`],
    ['Self-Consumption',   `${selfConsume.toFixed(0)}%`],
  ];
  y = drawTable(doc, systemRows, margin, y, contentW);
  y += 6;

  // ── Financial Analysis ────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Financial Analysis', margin, y, contentW);

  const financialRows = [
    ['System Cost',      fmtEur(systemCost)],
    ['Annual Savings',   fmtEur(annualSavings)],
    ['Payback Period',   payback === Infinity ? 'N/A' : `${payback.toFixed(1)} years`],
    ['Lifetime Savings', fmtEur(lifetimeSavings)],
    ['Tariff',           `\u20AC${projectData.tariff}/kWh`],
    ['Feed-in Tariff',   `\u20AC${projectData.feedInTariff}/kWh`],
    ['System Lifetime',  `${projectData.lifetime} years`],
  ];
  drawTable(doc, financialRows, margin, y, contentW);

  addPageNumber(2);

  // ── PAGE 3: Charts ───────────────────────────────────────────────────
  doc.addPage();
  y = margin;

  // Section header bar
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, pw, 16, 'F');
  doc.setFontSize(13);
  doc.setTextColor(...C.headerFg);
  doc.text('Energy Production Analysis', pw / 2, 11, { align: 'center' });
  y = 24;

  // Monthly chart
  doc.setFontSize(12);
  doc.setTextColor(...C.dark);
  doc.text('Monthly Energy Production', margin, y);
  y += 5;

  if (charts.monthlyChart) {
    try {
      const chartImg = captureChartHighRes(charts.monthlyChart, 2);
      if (chartImg) {
        const chartCanvas = charts.monthlyChart.canvas;
        const cw = contentW;
        const ch = cw * (chartCanvas.height / chartCanvas.width);
        const maxCh = 80;
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.rect(margin - 0.5, y - 0.5, cw + 1, Math.min(ch, maxCh) + 1, 'S');
        doc.addImage(chartImg, 'PNG', margin, y, cw, Math.min(ch, maxCh));
        y += Math.min(ch, maxCh) + 10;
      }
    } catch (e) { y += 10; }
  }

  // Monthly data table
  if (stats.monthlyEnergy && stats.monthlyEnergy.length === 12) {
    doc.setFontSize(12);
    doc.setTextColor(...C.dark);
    doc.text('Monthly Breakdown', margin, y);
    y += 5;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthRows = months.map((m, i) => [m, `${Math.round(stats.monthlyEnergy[i]).toLocaleString()} kWh`]);
    drawTable(doc, monthRows, margin, y, contentW, true);
  }

  addPageNumber(3);

  // ── Save via Electron IPC ────────────────────────────────────────────
  const sanitizedName = projectData.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'project';
  const defaultName = `${sanitizedName} - Solar Report.pdf`;

  if (window.electronAPI && window.electronAPI.savePDF) {
    const arrayBuf = doc.output('arraybuffer');
    const result = await window.electronAPI.savePDF(arrayBuf, defaultName);
    return result;
  } else {
    doc.save(defaultName);
    return { success: true };
  }
}

// ── Helper: draw a section title with underline ─────────────────────────────
function drawSectionTitle(doc, title, x, y, width) {
  doc.setFontSize(12);
  doc.setTextColor(...C.primary);
  doc.text(title, x, y);
  y += 1.5;
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.6);
  doc.line(x, y, x + width, y);
  y += 4;
  return y;
}

// ── Helper: draw a styled key-value table ───────────────────────────────────
function drawTable(doc, rows, x, y, width, compact = false) {
  const rowH = compact ? 5.5 : 7;
  const colW = width / 2;

  // Table border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.rect(x, y - 4.5, width, rows.length * rowH + 0.5, 'S');

  doc.setFontSize(compact ? 9 : 10);
  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? C.rowEven : C.rowOdd;
    doc.setFillColor(...bg);
    doc.rect(x, y - 4.5, width, rowH, 'F');

    // Row divider line
    if (i > 0) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.1);
      doc.line(x, y - 4.5, x + width, y - 4.5);
    }

    doc.setTextColor(...C.mid);
    doc.text(rows[i][0], x + 4, y);

    doc.setTextColor(...C.dark);
    doc.setFont(undefined, 'bold');
    doc.text(rows[i][1], x + colW + 4, y);
    doc.setFont(undefined, 'normal');

    y += rowH;
  }
  return y;
}

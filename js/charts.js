/* ═══════════════════════════════════════════════════════
   NutriTrack — Canvas Chart Components
   Renders calorie rings, weight trends, macro bars
   ═══════════════════════════════════════════════════════ */

class NutriCharts {
  constructor() {
    this.dpr = window.devicePixelRatio || 1;
    this.colors = {
      accent:    '#00D4AA',
      accentDim: 'rgba(0, 212, 170, 0.15)',
      secondary: '#7C4DFF',
      protein:   '#FF6B6B',
      carbs:     '#4ECDC4',
      fat:       '#FFD93D',
      water:     '#42A5F5',
      success:   '#4CAF50',
      danger:    '#FF5252',
      warning:   '#FF9800',
      bg:        '#16161F',
      bgLine:    'rgba(255,255,255,0.04)',
      textMuted: '#5A5A6E',
      textSec:   '#9595AA',
      text:      '#F0F0F5'
    };
  }

  // ── Setup canvas for HiDPI ──────────────────────
  _setup(canvas) {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * this.dpr;
    canvas.height = rect.height * this.dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    return { ctx, w: rect.width, h: rect.height };
  }

  // ══════════════════════════════════════════════════
  // CALORIE RING (Dashboard hero)
  // ══════════════════════════════════════════════════
  drawCalorieRing(canvasId, consumed, target, protein, carbsVal, fat, proteinTarget, carbsTarget, fatTarget) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, w, h } = this._setup(canvas);
    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(cx, cy) - 8;
    const ringW = 12;

    ctx.clearRect(0, 0, w, h);

    // ── Calorie ring (outer) ──
    const calPct = Math.min(consumed / target, 1.2);
    this._drawRing(ctx, cx, cy, outerR, ringW,
      calPct > 1 ? this.colors.danger : this.colors.accent,
      calPct > 1 ? 'rgba(255,82,82,0.12)' : this.colors.accentDim,
      calPct
    );

    // ── Protein ring ──
    const protPct = proteinTarget > 0 ? Math.min(protein / proteinTarget, 1.2) : 0;
    this._drawRing(ctx, cx, cy, outerR - ringW - 6, ringW - 2,
      this.colors.protein, 'rgba(255,107,107,0.1)', protPct
    );

    // ── Carbs ring ──
    const carbsPct = carbsTarget > 0 ? Math.min(carbsVal / carbsTarget, 1.2) : 0;
    this._drawRing(ctx, cx, cy, outerR - (ringW - 2) * 2 - 12, ringW - 2,
      this.colors.carbs, 'rgba(78,205,196,0.1)', carbsPct
    );

    // ── Fat ring ──
    const fatPct = fatTarget > 0 ? Math.min(fat / fatTarget, 1.2) : 0;
    this._drawRing(ctx, cx, cy, outerR - (ringW - 2) * 3 - 18, ringW - 2,
      this.colors.fat, 'rgba(255,217,61,0.1)', fatPct
    );
  }

  _drawRing(ctx, cx, cy, radius, width, color, bgColor, pct) {
    const startAngle = -Math.PI / 2;

    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Foreground
    if (pct > 0) {
      const endAngle = startAngle + (Math.PI * 2 * Math.min(pct, 1));
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // ══════════════════════════════════════════════════
  // WEIGHT LINE CHART
  // ══════════════════════════════════════════════════
  drawWeightChart(canvasId, entries, goalWeight = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, w, h } = this._setup(canvas);

    const pad = { top: 20, right: 16, bottom: 30, left: 45 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    if (entries.length === 0) {
      ctx.fillStyle = this.colors.textMuted;
      ctx.font = '13px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No weight data yet', w / 2, h / 2);
      return;
    }

    // Sort by date ascending
    const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const values = sorted.map(e => e.valueKg);
    const dates = sorted.map(e => new Date(e.date));

    const minVal = Math.floor(Math.min(...values) - 1);
    const maxVal = Math.ceil(Math.max(...values) + 1);
    const range = maxVal - minVal || 1;

    const toX = (i) => pad.left + (i / (sorted.length - 1 || 1)) * plotW;
    const toY = (v) => pad.top + plotH - ((v - minVal) / range) * plotH;

    // ── Grid lines ──
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = minVal + (range / gridSteps) * i;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.strokeStyle = this.colors.bgLine;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = this.colors.textMuted;
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(1), pad.left - 8, y + 3);
    }

    // ── Goal line ──
    if (goalWeight && goalWeight >= minVal && goalWeight <= maxVal) {
      const gy = toY(goalWeight);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.strokeStyle = this.colors.success;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      ctx.fillStyle = this.colors.success;
      ctx.font = '9px Inter';
      ctx.textAlign = 'left';
      ctx.fillText('Goal', w - pad.right - 25, gy - 5);
    }

    // ── Area fill ──
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      const xc = (toX(i - 1) + toX(i)) / 2;
      const yc = (toY(values[i - 1]) + toY(values[i])) / 2;
      ctx.quadraticCurveTo(toX(i - 1), toY(values[i - 1]), xc, yc);
    }
    ctx.lineTo(toX(values.length - 1), toY(values[values.length - 1]));
    ctx.lineTo(toX(values.length - 1), pad.top + plotH);
    ctx.lineTo(toX(0), pad.top + plotH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(124, 77, 255, 0.2)');
    grad.addColorStop(1, 'rgba(124, 77, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Line ──
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      const xc = (toX(i - 1) + toX(i)) / 2;
      const yc = (toY(values[i - 1]) + toY(values[i])) / 2;
      ctx.quadraticCurveTo(toX(i - 1), toY(values[i - 1]), xc, yc);
    }
    ctx.lineTo(toX(values.length - 1), toY(values[values.length - 1]));
    ctx.strokeStyle = this.colors.secondary;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ── Data points ──
    for (let i = 0; i < values.length; i++) {
      const x = toX(i);
      const y = toY(values[i]);

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.secondary;
      ctx.fill();

      if (i === values.length - 1) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = this.colors.secondary;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Date labels ──
    ctx.fillStyle = this.colors.textMuted;
    ctx.font = '9px Inter';
    ctx.textAlign = 'center';
    const maxLabels = Math.min(sorted.length, 7);
    const step = Math.max(1, Math.floor(sorted.length / maxLabels));
    for (let i = 0; i < sorted.length; i += step) {
      const d = dates[i];
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      ctx.fillText(label, toX(i), h - 8);
    }
    // Always show last
    if (sorted.length > 1) {
      const last = dates[dates.length - 1];
      ctx.fillText(`${last.getMonth() + 1}/${last.getDate()}`, toX(sorted.length - 1), h - 8);
    }
  }

  // ══════════════════════════════════════════════════
  // CALORIE BAR CHART (Progress page)
  // ══════════════════════════════════════════════════
  drawCalorieBarChart(canvasId, dailyData, target) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, w, h } = this._setup(canvas);

    const pad = { top: 16, right: 10, bottom: 30, left: 40 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    if (dailyData.length === 0) {
      ctx.fillStyle = this.colors.textMuted;
      ctx.font = '13px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No data yet', w / 2, h / 2);
      return;
    }

    const maxCal = Math.max(target, ...dailyData.map(d => d.calories)) * 1.1;
    const barW = Math.min(28, (plotW / dailyData.length) * 0.65);
    const gap = (plotW - barW * dailyData.length) / (dailyData.length + 1);

    // Target line
    const targetY = pad.top + plotH - (target / maxCal) * plotH;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, targetY);
    ctx.lineTo(w - pad.right, targetY);
    ctx.strokeStyle = 'rgba(0, 212, 170, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Bars
    for (let i = 0; i < dailyData.length; i++) {
      const d = dailyData[i];
      const x = pad.left + gap * (i + 1) + barW * i;
      const barH = (d.calories / maxCal) * plotH;
      const y = pad.top + plotH - barH;

      const overTarget = d.calories > target;
      const color = overTarget ? this.colors.danger : this.colors.accent;

      // Bar
      const barGrad = ctx.createLinearGradient(0, y, 0, pad.top + plotH);
      barGrad.addColorStop(0, color);
      barGrad.addColorStop(1, overTarget ? 'rgba(255,82,82,0.3)' : 'rgba(0,212,170,0.3)');
      ctx.fillStyle = barGrad;
      this._roundRect(ctx, x, y, barW, barH, 4);
      ctx.fill();

      // Date label
      const date = new Date(d.date);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      ctx.fillStyle = this.colors.textMuted;
      ctx.font = '9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(dayNames[date.getDay()], x + barW / 2, h - 8);
    }

    // Y axis labels
    ctx.fillStyle = this.colors.textMuted;
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (maxCal / 4) * i;
      const y = pad.top + plotH - (val / maxCal) * plotH;
      ctx.fillText(Math.round(val).toString(), pad.left - 6, y + 3);
    }
  }

  // ══════════════════════════════════════════════════
  // MACRO DONUT (Progress page)
  // ══════════════════════════════════════════════════
  drawMacroDonut(canvasId, protein, carbs, fat) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, w, h } = this._setup(canvas);

    const cx = w / 2, cy = h / 2;
    const radius = Math.min(cx, cy) - 10;
    const ringW = 20;
    const total = protein + carbs + fat;

    ctx.clearRect(0, 0, w, h);

    if (total === 0) {
      this._drawRing(ctx, cx, cy, radius, ringW, this.colors.bgLine, 'transparent', 1);
      ctx.fillStyle = this.colors.textMuted;
      ctx.font = '12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No data', cx, cy + 4);
      return;
    }

    const segments = [
      { pct: protein / total, color: this.colors.protein, label: 'P' },
      { pct: carbs / total,   color: this.colors.carbs,   label: 'C' },
      { pct: fat / total,     color: this.colors.fat,     label: 'F' },
    ];

    let angle = -Math.PI / 2;
    for (const seg of segments) {
      const sweep = Math.PI * 2 * seg.pct;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, angle, angle + sweep);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = ringW;
      ctx.lineCap = 'butt';
      ctx.stroke();
      angle += sweep;
    }

    // Center text
    ctx.fillStyle = this.colors.text;
    ctx.font = '600 14px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(total * 4)}`, cx, cy - 2);
    ctx.fillStyle = this.colors.textMuted;
    ctx.font = '10px Inter';
    ctx.fillText('kcal', cx, cy + 14);
  }

  // ── Utility: rounded rect ──
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

window.nutriCharts = new NutriCharts();

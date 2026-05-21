const { iconUrls, types, data, getMultiplier, getAttackMultiplier } = require('../../utils/data');

const C = {
  chartBaseRing: 'rgba(255,255,255,0.04)',
  chartGreen: '#22C55E',
  chartGreenLight: '#4ADE80',
  chartRed: '#EF4444',
  chartRedLight: '#F87171',
  chartGray: '#5A5A7A',
  chartGrayLight: '#7A7A9A',
  chartFocusStroke: '#4ADE80',
  chartOuterFocus: '#22C55E',
  chartInnerFocus: '#4ADE80',
  chartStrokeSubtle: 'rgba(255,255,255,0.06)',
  chartCenterFill: 'rgba(255,255,255,0.05)',
  chartCenterFillFocus: 'rgba(255,255,255,0.1)',
  chartDotFill: 'rgba(255,255,255,0.06)',
  chartLabel: 'rgba(255,255,255,0.18)',
  chartLabelDim: 'rgba(255,255,255,0.05)',
  textLabel: '#787B90',
  textMuted: '#5A6280',
};

function cc(hex, a) {
  return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
}
function intensity(count) { return Math.min(0.12 + count * 0.22, 0.55); }

Page({
  data: {
    types,
    selectedTypes: [],
    selectedMap: {},
    mode: 'defense',
    chartFocus: null,
    showChart: false,
    canvasSize: 320,
    tooltip: { show: false, x: 0, y: 0, text: '' },
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const size = Math.min(sys.windowWidth - 32, 360);
    this.setData({ canvasSize: size });
  },

  onReady() {
    const query = wx.createSelectorQuery();
    query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      const size = this.data.canvasSize;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.scale(dpr, dpr);
      this.canvas = canvas;
      this.ctx = ctx;
      this.preloadImages(() => {
        this.ready = true;
        if (this.data.selectedTypes.length > 0) this.drawChart();
      });
      this.getCanvasRect();
    });
  },

  getCanvasRect() {
    const query = wx.createSelectorQuery();
    query.select('#chartCanvas').boundingClientRect((rect) => {
      if (rect) this.canvasRect = rect;
    }).exec();
  },

  preloadImages(callback) {
    const imgs = {};
    let loaded = 0;
    const total = types.length;
    types.forEach((t) => {
      const img = this.canvas.createImage();
      img.onload = () => { imgs[t] = img; loaded++; if (loaded >= total) callback(); };
      img.onerror = () => { loaded++; if (loaded >= total) callback(); };
      img.src = `/images/${t}.png`;
    });
    this.images = imgs;
  },

  toggleType(e) {
    const type = e.currentTarget.dataset.type;
    const st = [...this.data.selectedTypes];
    const i = st.indexOf(type);
    if (i !== -1) st.splice(i, 1); else st.push(type);
    const map = {};
    st.forEach((t) => map[t] = true);
    const show = st.length > 0;
    this.setData({ selectedTypes: st, selectedMap: map, chartFocus: null, showChart: show }, () => {
      if (show) {
        this.getCanvasRect();
        if (this.ready) this.drawChart();
      }
    });
  },

  switchMode(e) {
    const m = e.currentTarget.dataset.mode;
    this.setData({ mode: m, chartFocus: null }, () => {
      if (this.data.selectedTypes.length > 0 && this.ready) this.drawChart();
    });
  },

  getRadii() {
    const n = this.data.selectedTypes.length;
    const t = Math.min(n / 10, 1);
    return {
      iR: Math.round(65 + t * 50),
      oR: 165,
      centerR: Math.round(Math.max(12, 38 - t * 26)),
      gap: 2,
    };
  },

  buildItems(isD) {
    const st = this.data.selectedTypes;
    return types.map((t) => {
      const cells = st.map((s) => ({ type: s, val: isD ? data[s][t] : data[t][s] }));
      return {
        type: t,
        cells,
        effCount: cells.filter((c) => c.val === 1).length,
        resCount: cells.filter((c) => c.val === -1).length,
      };
    });
  },

  onCanvasTouch(e) {
    const touch = e.touches[0];
    const rect = this.canvasRect;
    if (!rect) return;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const size = this.data.canvasSize;
    const cx = size / 2, cy = size / 2;
    const { iR, oR } = this.getRadii();
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4 || dist > oR + 5) return;

    let angle = Math.atan2(dy, dx);
    let a = angle + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    if (a >= Math.PI * 2) a -= Math.PI * 2;

    if (dist >= iR - 4) {
      const seg = Math.PI * 2 / types.length;
      const idx = Math.floor(a / seg);
      if (idx >= 0 && idx < types.length) this.handleOuterTap(types[idx], e);
    } else {
      const st = this.data.selectedTypes;
      if (st.length === 0) return;
      const iSeg = Math.PI * 2 / st.length;
      const idx = Math.floor(a / iSeg);
      if (idx >= 0 && idx < st.length) this.handleInnerTap(st[idx]);
    }
  },

  handleOuterTap(type, e) {
    const focus = this.data.chartFocus;
    let next = (focus && focus.source === 'outer' && focus.type === type) ? null : { source: 'outer', type };
    this.setData({ chartFocus: next }, () => this.drawChart());
    this.showTooltip(type, e);
  },

  handleInnerTap(type) {
    const focus = this.data.chartFocus;
    let next = (focus && focus.source === 'inner' && focus.type === type) ? null : { source: 'inner', type };
    this.setData({ chartFocus: next }, () => this.drawChart());
  },

  showTooltip(type, e) {
    const isD = this.data.mode === 'defense';
    const items = this.buildItems(isD);
    const item = items.find((i) => i.type === type);
    if (!item) return;
    const focus = this.data.chartFocus;
    let good, bad;
    if (focus && focus.source === 'inner') {
      const c = item.cells.find((cc) => cc.type === focus.type);
      good = c && c.val === (isD ? -1 : 1) ? 1 : 0;
      bad = c && c.val === (isD ? 1 : -1) ? 1 : 0;
    } else {
      good = isD ? item.resCount : item.effCount;
      bad = isD ? item.effCount : item.resCount;
    }
    const p = [];
    if (good > 0) p.push(`+${good}`);
    if (bad > 0) p.push(`-${bad}`);
    if (!p.length) p.push('0');
    const text = `${item.type}  ${p.join(' ')}`;
    this.setData({
      tooltip: { show: true, x: e.touches[0].clientX + 10, y: e.touches[0].clientY - 20, text }
    });
    if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
    this.tooltipTimer = setTimeout(() => {
      this.setData({ tooltip: { show: false, x: 0, y: 0, text: '' } });
    }, 2000);
  },

  onUnload() {
    if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
  },

  drawChart() {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const size = this.data.canvasSize;
    const cx = size / 2, cy = size / 2;
    const { iR, oR, centerR, gap } = this.getRadii();
    const seg = Math.PI * 2 / types.length;
    const midR = iR + (oR - iR) / 2;
    const pad = gap / midR;
    const isD = this.data.mode === 'defense';
    const items = this.buildItems(isD);
    const focus = this.data.chartFocus;

    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cy, (iR + oR) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = C.chartBaseRing;
    ctx.lineWidth = oR - iR;
    ctx.stroke();

    items.forEach((item, i) => {
      const sA = -Math.PI / 2 + i * seg + pad / 2;
      const eA = sA + seg - pad;
      const isF = focus && focus.source === 'outer' && focus.type === item.type;
      const isDm = focus && focus.source === 'outer' && !isF;

      let good, bad;
      if (focus && focus.source === 'inner') {
        const cell = item.cells.find((c) => c.type === focus.type);
        good = cell && cell.val === (isD ? -1 : 1) ? 1 : 0;
        bad = cell && cell.val === (isD ? 1 : -1) ? 1 : 0;
      } else {
        good = isD ? item.resCount : item.effCount;
        bad = isD ? item.effCount : item.resCount;
      }

      let segColor, segLight;
      if (good > 0) {
        const t = intensity(good);
        segColor = cc(C.chartGreen, isDm ? 0.04 : t);
        segLight = cc(C.chartGreenLight, isDm ? 0.02 : t * 0.5);
      } else if (bad > 0) {
        const t = intensity(bad);
        segColor = cc(C.chartRed, isDm ? 0.04 : t);
        segLight = cc(C.chartRedLight, isDm ? 0.02 : t * 0.5);
      } else {
        segColor = cc(C.chartGray, isDm ? 0.02 : 0.12);
        segLight = cc(C.chartGrayLight, isDm ? 0.01 : 0.06);
      }

      ctx.beginPath();
      ctx.arc(cx, cy, oR, eA, sA, true);
      ctx.arc(cx, cy, iR, sA, eA, false);
      ctx.closePath();
      ctx.fillStyle = segColor;
      ctx.fill();

      ctx.strokeStyle = isF ? C.chartOuterFocus : C.chartStrokeSubtle;
      ctx.lineWidth = isF ? 3 : 0.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, iR + 20, eA - 0.03, sA + 0.03, true);
      ctx.arc(cx, cy, iR + 6, sA + 0.03, eA - 0.03, false);
      ctx.closePath();
      ctx.fillStyle = segLight;
      ctx.fill();

      const mA = sA + (eA - sA) / 2;
      const iconR = iR + (oR - iR) * 0.62;
      const img = this.images[item.type];
      if (img) {
        ctx.globalAlpha = isDm ? 0.2 : 0.8;
        ctx.drawImage(img, cx + iconR * Math.cos(mA) - 12, cy + iconR * Math.sin(mA) - 12, 24, 24);
        ctx.globalAlpha = 1;
      }

      const labelR = iR + (oR - iR) * 0.25;
      ctx.fillStyle = isDm ? C.chartLabelDim : C.chartLabel;
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.type, cx + labelR * Math.cos(mA), cy + labelR * Math.sin(mA));
    });

    if (this.data.selectedTypes.length > 0) {
      const st = this.data.selectedTypes;
      const iSeg = Math.PI * 2 / st.length;
      st.forEach((t, i) => {
        const sA = -Math.PI / 2 + i * iSeg + pad / 2;
        const eA = sA + iSeg - pad;
        const isF = focus && focus.source === 'inner' && focus.type === t;
        const isDm = focus && focus.source === 'inner' && !isF;

        let fill;
        if (isF) {
          fill = C.chartGreen;
        } else if (focus && focus.source === 'outer') {
          const item = items.find((ci) => ci.type === focus.type);
          const cell = item ? item.cells.find((c) => c.type === t) : null;
          if (cell && cell.val === 1) fill = cc(C.chartRed, 0.55);
          else if (cell && cell.val === -1) fill = cc(C.chartGreen, 0.55);
          else fill = cc(C.chartGray, isDm ? 0.08 : 0.25);
        } else {
          fill = cc(C.chartGray, isDm ? 0.1 : 0.28);
        }

        ctx.beginPath();
        ctx.moveTo(cx + (iR - 4) * Math.cos(sA), cy + (iR - 4) * Math.sin(sA));
        ctx.arc(cx, cy, iR - 4, sA, eA, false);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.strokeStyle = isF ? C.chartInnerFocus : C.chartStrokeSubtle;
        ctx.lineWidth = isF ? 3 : 0.5;
        ctx.stroke();

        const mA = sA + (eA - sA) / 2;
        const iR2 = iR / 1.35;
        const img = this.images[t];
        if (img) {
          ctx.drawImage(img, cx + iR2 * Math.cos(mA) - 10, cy + iR2 * Math.sin(mA) - 10, 20, 20);
        }
      });
    }

    ctx.beginPath();
    ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
    ctx.fillStyle = focus ? C.chartCenterFillFocus : C.chartCenterFill;
    ctx.fill();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = C.chartFocusStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    const dotCount = 8;
    for (let i = 0; i < dotCount; i++) {
      const a = Math.PI * 2 * i / dotCount;
      ctx.beginPath();
      ctx.arc(cx + centerR * 0.6 * Math.cos(a), cy + centerR * 0.6 * Math.sin(a), 2, 0, Math.PI * 2);
      ctx.fillStyle = C.chartDotFill;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textLabel;
    ctx.font = '700 13px system-ui';
    ctx.fillText(isD ? '防守' : '攻击', cx, cy - 8);

    ctx.fillStyle = C.textMuted;
    ctx.font = '700 17px system-ui';
    ctx.fillText(String(this.data.selectedTypes.length), cx, cy + 9);

    ctx.font = '10px system-ui';
    ctx.fillText('个属性', cx, cy + 22);
  },
});

// ============ ECharts 图表（v9 结构健康监测版） ============

// —— 预测算法：最小二乘线性外推（对最近 N 个点拟合直线，外推未来 steps 点） ——
function lsExtrapolate(seq, steps) {
  const n = seq.length;
  if (n < 3) return [];
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += seq[i]; sxy += i * seq[i]; sxx += i * i; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return [];
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  const out = [];
  for (let k = 1; k <= steps; k++) out.push(+(a + b * (n - 1 + k)).toFixed(2));
  return out;
}

// 传感器类型显示配置
const SENSOR_VIEW = {
  cable:  { name: '锚索张力', unit: 'kN' },
  strain: { name: '应变',     unit: 'με' },
  settle: { name: '沉降',     unit: 'mm' },
  gap:    { name: '开合度',   unit: 'mm' },
  tilt:   { name: '倾斜',     unit: '°' },
  vib:    { name: '振动',     unit: 'g' }
};
const LINE_COLORS = ['#5db0ff', '#ffd54f', '#3dd68c', '#ff8a65', '#ba68c8', '#4dd0e1', '#ef5350', '#aed581'];

// ============ 图1：结构监测 · 测点时序（实测多测点 + 预测虚线 + 阈值红线） ============
const chartTrend = echarts.init(document.getElementById('chartTrend'));
let trendType = 'cable';   // 当前监测类型

function tickTrend() {
  if (!window.TWIN_DATA || !window.TWIN_DATA.turbines || !window.TWIN_DATA.turbines.length) return;
  const list = window.TWIN_DATA.turbines;
  const d = list[window.SELECTED] || list[0];
  const st = d.sensors[trendType];
  if (!st) return;
  const cfg = SENSOR_VIEW[trendType];
  const nPts = st.points.length;
  const histLen = st.points[0].hist.length;
  // x 轴：相对时间（-39 ~ 0，0 为当前）
  const xs = st.points[0].hist.map((_, i) => i - histLen + 1);

  // 实测系列：每个测点一条线
  const series = st.points.map((p, i) => ({
    name: (window.POINT_NAME && window.POINT_NAME[trendType][i]) || ('测点' + (i + 1)),
    type: 'line', smooth: true, showSymbol: false,
    data: p.hist.map((v) => +v.toFixed(2)),
    lineStyle: { width: 1.8, color: LINE_COLORS[i % LINE_COLORS.length] },
    itemStyle: { color: LINE_COLORS[i % LINE_COLORS.length] }
  }));

  // 预测：全部测点均值序列 → 线性外推 5 点（虚线）
  const avgSeq = [];
  for (let i = 0; i < histLen; i++) {
    let s = 0;
    st.points.forEach((p) => { s += p.hist[i]; });
    avgSeq.push(+(s / nPts).toFixed(2));
  }
  const pred = lsExtrapolate(avgSeq, 5);
  const lastX = histLen - 1;
  const fullX = xs.concat(pred.map((_, k) => lastX + 1 + k));
  const fullY = avgSeq.concat(pred);

  chartTrend.setOption({
    animation: false,
    grid: { left: 48, right: 22, top: 34, bottom: 16 },
    legend: { data: series.map((s) => s.name).concat(['预测']),
      textStyle: { color: '#b8c8e0', fontSize: 9 }, top: 0, type: 'scroll' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 },
      valueFormatter: (v) => v + ' ' + cfg.unit
    },
    xAxis: { type: 'category', data: fullX,
      axisLabel: { color: '#9fb4cc', fontSize: 9, formatter: (v) => v <= 0 ? v : '+' + v },
      axisLine: { lineStyle: { color: 'rgba(80,160,255,.3)' } }, axisTick: { show: false } },
    yAxis: {
      type: 'value', name: cfg.unit, nameTextStyle: { color: '#7fd0ff', fontSize: 9 },
      scale: true, axisLabel: { color: '#9fb4cc', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } }
    },
    series: series.concat([
      {
        name: '预测',
        type: 'line', smooth: true, showSymbol: true, symbol: 'circle', symbolSize: 5,
        data: fullY,
        lineStyle: { width: 2, type: 'dashed', color: '#ffd54f' },
        itemStyle: { color: '#ffd54f' }
      },
      {
        name: '阈值', type: 'line',
        markLine: {
          symbol: 'none',
          data: [{ yAxis: st.limit, name: '告警阈值' }],
          lineStyle: { color: '#ff5252', type: 'dashed', width: 1.5 },
          label: { formatter: '阈值 ' + st.limit + cfg.unit, color: '#ff5252', fontSize: 9, position: 'insideEndTop' }
        },
        data: []
      }
    ])
  }, { notMerge: true });
}
tickTrend();
setInterval(tickTrend, 2000);

// 传感器类型切换（下拉 / 点击传感器表行）
window.onSensorTypeChange = function (key) {
  if (!SENSOR_VIEW[key]) return;
  trendType = key;
  tickTrend();
};

// ============ 图2：全场风机状态分布（右侧环形饼图） ============
const chartPie = echarts.init(document.getElementById('chartPie'));
function tickPie() {
  if (!window.TWIN_DATA || !window.TWIN_DATA.turbines || !window.TWIN_DATA.turbines.length) return;
  const list = window.TWIN_DATA.turbines;
  const runN = list.filter((t) => t.status === '运行').length;
  const idleN = list.filter((t) => t.status === '待机').length;
  const faultN = list.filter((t) => t.status === '故障').length;
  chartPie.setOption({
    color: ['#2e7d32', '#f9a825', '#c62828'],
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 } },
    legend: { bottom: 0, textStyle: { color: '#b8c8e0', fontSize: 9 }, itemWidth: 10, itemHeight: 7 },
    series: [{
      type: 'pie', radius: ['40%', '62%'], center: ['50%', '48%'],
      label: { position: 'outside', color: '#cfe3ff', fontSize: 9, formatter: '{b} {c} ({d}%)' },
      labelLine: { length: 8, length2: 6, lineStyle: { color: 'rgba(255,255,255,.35)' } },
      data: [
        { name: '运行', value: runN },
        { name: '待机', value: idleN },
        { name: '故障', value: faultN }
      ]
    }]
  }, { notMerge: true });
}
tickPie();
setInterval(tickPie, 2000);

// ============ 图3：月度发电量（全场/单机 + 未来3月预测，示例数据） ============
const chartBar = echarts.init(document.getElementById('chartBar'));
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月','预测1','预测2','预测3'];
const MONTH_VALS = [320, 288, 402, 418, 465, 502, 488, 471, 445, 398, 356, 330];   // 全场年度（示例）
const YEAR_SUM = MONTH_VALS.reduce((a, b) => a + b, 0);
const MONTH_AVG = Math.round(YEAR_SUM / 12);
const TURBINE_FACTOR = [0.108, 0.095, 0.103, 0.089, 0.112, 0.097, 0.105, 0.091, 0.098, 0.102];
const fmt = (n) => n.toLocaleString();

function renderBar() {
  const mode = document.getElementById('barMode') ? document.getElementById('barMode').value : 'all';
  const list = window.TWIN_DATA ? window.TWIN_DATA.turbines : [];
  const sel = list[window.SELECTED] || list[0];
  let hist, statText;
  if (mode === 'single' && sel) {
    const f = TURBINE_FACTOR[window.SELECTED] || 0.1;
    hist = MONTH_VALS.map((v) => Math.round(v * f));
    const sum = hist.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / 12);
    const maxV = Math.max.apply(null, hist);
    const maxM = MONTHS[hist.indexOf(maxV)];
    statText = sel.name + ' 年度发电量 <b>' + fmt(sum) + '</b> 万kWh · 月均 <b>' + avg + '</b> · 峰值 <b>' + maxV + '</b>（' + maxM + '）<span class="tag">示例数据</span>';
  } else {
    hist = MONTH_VALS;
    const maxV = Math.max.apply(null, hist);
    const maxM = MONTHS[hist.indexOf(maxV)];
    statText = '全场年度累计发电量 <b>' + fmt(YEAR_SUM) + '</b> 万kWh · 月均 <b>' + MONTH_AVG + '</b> · 峰值 <b>' + maxV + '</b>（' + maxM + '）<span class="tag">示例数据</span>';
  }
  const el = document.getElementById('statRow');
  if (el) el.innerHTML = '视图 <select id="barMode"><option value="all">全场汇总</option><option value="single">单机明细</option></select> · ' + statText;
  const bm = document.getElementById('barMode');
  if (bm) { bm.value = mode; bm.onchange = renderBar; }

  // 未来 3 个月预测（线性外推）
  const pred = lsExtrapolate(hist, 3);
  const full = hist.concat(pred);
  const histSum = hist.reduce((a, b) => a + b, 0);

  chartBar.setOption({
    grid: { left: 48, right: 20, top: 26, bottom: 20 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 },
      formatter: function (p) {
        const idx = p[0].dataIndex;
        if (idx < 12) return MONTHS[idx] + ' 发电量：<b>' + full[idx] + '</b> 万kWh';
        return MONTHS[idx] + '（预测）：<b>' + full[idx] + '</b> 万kWh · 全年累计 ' + fmt(histSum) + ' 万kWh';
      }
    },
    xAxis: { type: 'category', data: MONTHS,
      axisLabel: { color: '#9fb4cc', fontSize: 9 },
      axisLine: { lineStyle: { color: 'rgba(80,160,255,.3)' } }, axisTick: { show: false } },
    yAxis: { type: 'value', name: '万kWh', nameTextStyle: { color: '#7fd0ff', fontSize: 9 },
      axisLabel: { color: '#9fb4cc', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } } },
    series: [
      {
        type: 'bar', barWidth: '45%',
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          shadowBlur: 8, shadowColor: 'rgba(93,176,255,.25)',
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
            [{ offset: 0, color: '#5db0ff' }, { offset: 1, color: '#164a7a' }])
        },
        label: { show: true, position: 'top', color: '#9fc3e8', fontSize: 8, formatter: '{c}' },
        data: full.slice(0, 12),
        markLine: { symbol: 'none',
          data: [{ type: 'average', name: '月均' }],
          lineStyle: { color: '#ffd54f', type: 'dashed', width: 1.5 },
          label: { formatter: '月均 ' + Math.round(histSum / 12), color: '#ffd54f', fontSize: 9 } }
      },
      {
        type: 'bar', barWidth: '45%',
        itemStyle: { color: 'rgba(255,213,79,.35)', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: '#ffd54f', fontSize: 8, formatter: '{c}' },
        data: [null, null, null, null, null, null, null, null, null, null, null, null].concat(pred)
      }
    ]
  }, { notMerge: true });
}
renderBar();
setInterval(renderBar, 2000);

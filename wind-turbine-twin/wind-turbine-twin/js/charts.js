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

// ============ 图3：剩余寿命预测（损伤累积模型 · 设计寿命 25 年） ============
// 依据 structure.js 口径：塔体离散 14 段杆单元，应力比 maxRatio 驱动日损伤增量，
// 锚索超限放大弯矩（boost）；寿命 = (1 - 累积损伤) × 25 年设计寿命。
const chartBar = echarts.init(document.getElementById('chartBar'));
const DESIGN_LIFE = 25;                       // 设计寿命（年）
const FC_YEARS = 5;                           // 预测展望（年）

// 日损伤增量（与 computeStructure 内一致）
function dayDmg(ratio, boost) {
  return 0.0006 + 0.004 * Math.max(0, ratio - 0.6) * Math.max(0, ratio - 0.6) + 0.0015 * (boost || 0);
}
// 年均寿命衰减（年/年）：日损伤 × 365 天 × 设计寿命；限幅防止全部瞬间报废
function yearDecay(ratio, boost) {
  return Math.min(2.0, dayDmg(ratio, boost) * 365 * DESIGN_LIFE);
}

function renderLife() {
  const mode = document.getElementById('lifeMode') ? document.getElementById('lifeMode').value : 'all';
  const list = window.TWIN_DATA ? window.TWIN_DATA.turbines : [];
  if (!list || !list.length) return;
  const sel = list[window.SELECTED] || list[0];

  // 每台风机：当前剩余寿命 + 未来 FC_YEARS 年衰减预测
  const rows = list.map((t) => {
    const r = window.computeStructure(t.windSpeed, t.cableBoost);
    const dec = yearDecay(r.maxRatio, r.boost);
    const pred = [];
    for (let k = 1; k <= FC_YEARS; k++) pred.push(+(Math.max(0, r.lifeLeft - dec * k)).toFixed(1));
    return { t: t, life: r.lifeLeft, damage: r.damage, dec: dec, pred: pred };
  });

  let xData, curData, predData, statText;
  if (mode === 'single' && sel) {
    const r0 = rows[window.SELECTED] || rows[0];
    xData = ['当前'].concat(Array.from({ length: FC_YEARS }, (_, k) => '+' + (k + 1) + '年'));
    curData = [r0.life].concat(new Array(FC_YEARS).fill(null));   // 当前寿命柱
    predData = [null].concat(r0.pred);                            // 预测寿命柱（虚线）
    statText = sel.name + ' 剩余寿命 <b>' + r0.life.toFixed(1) + '</b> 年 · 损伤 <b>' +
      r0.damage.toFixed(3) + '</b> · 年均衰减 <b>' + r0.dec.toFixed(1) + '</b> 年/年 <span class="tag">损伤累积模型</span>';
  } else {
    xData = list.map((t) => t.name);
    curData = rows.map((r) => r.life);
    predData = rows.map((r) => r.pred[FC_YEARS - 1]);             // +5 年预测寿命
    const avg = rows.reduce((a, r) => a + r.life, 0) / rows.length;
    let minR = rows[0];
    rows.forEach((r) => { if (r.life < minR.life) minR = r; });
    statText = '全场剩余寿命：平均 <b>' + avg.toFixed(1) + '</b> 年 · 最短 <b>' + minR.t.name +
      ' ' + minR.life.toFixed(1) + '</b> 年 · 设计寿命 <b>' + DESIGN_LIFE + '</b> 年 <span class="tag">损伤累积模型</span>';
  }
  const el = document.getElementById('statRow');
  if (el) el.innerHTML = '寿命预测 <select id="lifeMode"><option value="all">全场汇总</option><option value="single">单机明细</option></select> · ' + statText;
  const lm = document.getElementById('lifeMode');
  if (lm) { lm.value = mode; lm.onchange = renderLife; }

  chartBar.setOption({
    grid: { left: 52, right: 24, top: 30, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 },
      formatter: function (p) {
        const idx = p[0].dataIndex;
        const nm = xData[idx];
        const cur = curData[idx];
        const fut = predData[idx];
        let s = nm + '：';
        if (cur != null) s += '剩余寿命 <b>' + cur.toFixed(1) + '</b> 年';
        if (fut != null) s += (cur != null ? ' · ' : '') + '预测 <b>' + fut.toFixed(1) + '</b> 年';
        return s;
      }
    },
    xAxis: { type: 'category', data: xData,
      axisLabel: { color: '#9fb4cc', fontSize: 9, interval: 0, rotate: mode === 'all' ? 40 : 0 },
      axisLine: { lineStyle: { color: 'rgba(80,160,255,.3)' } }, axisTick: { show: false } },
    yAxis: { type: 'value', name: '年', nameTextStyle: { color: '#7fd0ff', fontSize: 9 },
      max: function (v) { return Math.max(26, Math.ceil(v.max * 1.15)); },
      axisLabel: { color: '#9fb4cc', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } } },
    series: [
      {
        name: '当前剩余寿命', type: 'bar', barWidth: mode === 'all' ? '38%' : '26%',
        itemStyle: {
          borderRadius: [4, 4, 0, 0], shadowBlur: 8, shadowColor: 'rgba(93,176,255,.25)',
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
            [{ offset: 0, color: '#5db0ff' }, { offset: 1, color: '#164a7a' }])
        },
        label: { show: true, position: 'top', color: '#9fc3e8', fontSize: 9, formatter: (v) => v.value == null ? '' : v.value.toFixed(1) },
        data: curData,
        markLine: { symbol: 'none',
          data: [{ yAxis: DESIGN_LIFE, name: '设计寿命' }],
          lineStyle: { color: '#ff5252', type: 'dashed', width: 1.5 },
          label: { formatter: '设计寿命 ' + DESIGN_LIFE + ' 年', color: '#ff5252', fontSize: 9, position: 'insideEndTop' } }
      },
      {
        name: '预测寿命', type: 'bar', barWidth: mode === 'all' ? '38%' : '26%',
        itemStyle: { color: 'rgba(255,213,79,.4)', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: '#ffd54f', fontSize: 9, formatter: (v) => v.value == null ? '' : v.value.toFixed(1) },
        data: predData
      }
    ]
  }, { notMerge: true });
}
renderLife();
setInterval(renderLife, 2000);

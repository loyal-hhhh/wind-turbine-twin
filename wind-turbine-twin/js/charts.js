// ============ ECharts 图表（多风机大屏版） ============
// 图1：选中风机 风速(柱) + 功率(线) 实时趋势
const chartTrend = echarts.init(document.getElementById('chartTrend'));
const N = 30;
const buf = { ws: [], pw: [] };

function tickTrend() {
  const list = window.TWIN_DATA.turbines;
  const d = list[window.SELECTED] || list[0];
  buf.ws.push(+d.windSpeed);
  buf.pw.push(d.power);
  if (buf.ws.length > N) { buf.ws.shift(); buf.pw.shift(); }
  chartTrend.setOption({
    animation: false,
    grid: { left: 40, right: 50, top: 20, bottom: 14 },
    legend: { data: ['风速', '功率'], textStyle: { color: '#b8c8e0', fontSize: 10 }, top: 0 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 } },
    xAxis: { type: 'category', show: false, data: buf.ws.map((_, i) => i) },
    yAxis: [
      { type: 'value', name: 'm/s', nameTextStyle: { color: '#7fd0ff', fontSize: 9 },
        min: 0, max: 20, axisLabel: { color: '#9fb4cc', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } } },
      { type: 'value', name: 'kW', nameTextStyle: { color: '#ffd54f', fontSize: 9 },
        min: 0, max: 6000, axisLabel: { color: '#9fb4cc', fontSize: 9 }, splitLine: { show: false } }
    ],
    series: [
      { name: '风速', type: 'bar', data: buf.ws, yAxisIndex: 0, barWidth: '55%',
        itemStyle: { color: 'rgba(127,208,255,.65)' } },
      { name: '功率', type: 'line', smooth: true, showSymbol: false,
        data: buf.pw, yAxisIndex: 1, lineStyle: { width: 2, color: '#ffd54f' } }
    ]
  }, { notMerge: true });
}
tickTrend();
setInterval(tickTrend, 2000);

// 图2：全场风机运行状态分布（环形饼图，动态数据）
const chartPie = echarts.init(document.getElementById('chartPie'));
function tickPie() {
  const list = window.TWIN_DATA.turbines;
  const runN = list.filter((t) => t.status === '运行').length;
  const idleN = list.filter((t) => t.status === '待机').length;
  const faultN = list.filter((t) => t.status === '故障').length;
  chartPie.setOption({
    color: ['#2e7d32', '#f9a825', '#c62828'],
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 } },
    legend: { bottom: 2, textStyle: { color: '#b8c8e0', fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    title: { text: '全场风机状态分布（共' + list.length + '台）', left: 'center', top: 0,
      textStyle: { color: '#8fb3d9', fontSize: 11, fontWeight: 'normal' } },
    series: [{
      type: 'pie', radius: ['36%', '58%'], center: ['50%', '55%'],
      label: { position: 'outside', color: '#cfe3ff', fontSize: 10, formatter: '{b} {c} ({d}%)' },
      labelLine: { length: 10, length2: 8, lineStyle: { color: 'rgba(255,255,255,.35)' } },
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

// 图3：月度发电量（柱状图，示例数据 · 全场/单机双视图：数值标签/月均线/峰值标记）
const chartBar = echarts.init(document.getElementById('chartBar'));
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const MONTH_VALS = [320, 288, 402, 418, 465, 502, 488, 471, 445, 398, 356, 330];   // 全场年度（示例）
const YEAR_SUM = MONTH_VALS.reduce((a, b) => a + b, 0);   // 4883
const MONTH_AVG = Math.round(YEAR_SUM / 12);              // 407
// 每台风机的年度占比系数（示例，合计≈1.0，可换成真实统计）
const TURBINE_FACTOR = [0.108, 0.095, 0.103, 0.089, 0.112, 0.097, 0.105, 0.091, 0.098, 0.102];
const fmt = (n) => n.toLocaleString();

function renderBar() {
  const mode = document.getElementById('barMode') ? document.getElementById('barMode').value : 'all';
  const list = window.TWIN_DATA ? window.TWIN_DATA.turbines : [];
  const sel = list[window.SELECTED] || list[0];
  let data, statText;
  if (mode === 'single' && sel) {
    const f = TURBINE_FACTOR[window.SELECTED] || 0.1;
    data = MONTH_VALS.map((v) => Math.round(v * f));
    const sum = data.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / 12);
    const maxV = Math.max.apply(null, data);
    const maxM = MONTHS[data.indexOf(maxV)];
    statText = sel.name + ' 年度发电量 <b>' + fmt(sum) + '</b> 万kWh · 月均 <b>' + avg + '</b> 万kWh · 峰值 <b>' + maxV + '</b> 万kWh（' + maxM + '）<span class="tag">示例数据</span>';
  } else {
    data = MONTH_VALS;
    const maxV = Math.max.apply(null, data);
    const maxM = MONTHS[data.indexOf(maxV)];
    statText = '全场年度累计发电量 <b>' + fmt(YEAR_SUM) + '</b> 万kWh · 月均 <b>' + MONTH_AVG + '</b> 万kWh · 峰值 <b>' + maxV + '</b> 万kWh（' + maxM + '）<span class="tag">示例数据</span>';
  }
  const el = document.getElementById('statRow');
  if (el) el.innerHTML = '视图 <select id="barMode"><option value="all">全场汇总</option><option value="single">单机明细</option></select> · ' + statText;
  const bm = document.getElementById('barMode');
  if (bm) {
    bm.value = mode;
    bm.onchange = renderBar;
  }
  chartBar.setOption({
    grid: { left: 48, right: 20, top: 38, bottom: 22 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,35,60,.95)', textStyle: { color: '#e8f0fb', fontSize: 11 },
      formatter: function (p) {
        return p[0].name + ' 发电量：<b>' + p[0].value + '</b> 万kWh<br>年度累计：' +
          fmt(data.reduce((a, b) => a + b, 0)) + ' 万kWh · 月均：' + Math.round(data.reduce((a, b) => a + b, 0) / 12) + ' 万kWh';
      }
    },
    xAxis: { type: 'category', data: MONTHS,
      axisLabel: { color: '#9fb4cc', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(80,160,255,.3)' } }, axisTick: { show: false } },
    yAxis: { type: 'value', name: '万kWh', nameTextStyle: { color: '#7fd0ff', fontSize: 9 },
      axisLabel: { color: '#9fb4cc', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } } },
    series: [{
      type: 'bar', barWidth: '55%',
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        shadowBlur: 8, shadowColor: 'rgba(93,176,255,.25)',
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
          [{ offset: 0, color: '#5db0ff' }, { offset: 1, color: '#164a7a' }])
      },
      label: { show: true, position: 'top', color: '#9fc3e8', fontSize: 9, formatter: '{c}' },
      markLine: { symbol: 'none',
        data: [{ type: 'average', name: '月均' }],
        lineStyle: { color: '#ffd54f', type: 'dashed', width: 1.5 },
        label: { formatter: '月均 ' + Math.round(data.reduce((a, b) => a + b, 0) / 12), color: '#ffd54f', fontSize: 10 } },
      markPoint: { data: [{ type: 'max', name: '峰值' }],
        symbolSize: 36,
        label: { formatter: '峰值 {c}', color: '#fff', fontSize: 9 },
        itemStyle: { color: '#ffd54f' } },
      data: data
    }]
  }, { notMerge: true });
}
renderBar();
setInterval(renderBar, 2000);

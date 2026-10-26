// ============ 大屏 UI 更新（v9：结构健康监测版） ============
// 指标卡 / 运行参数 / 测点级传感器表 / 结构受力摘要 / 巡检表 / 时钟 / 导航
const SENSOR_META = [
  { key: 'cable',  name: '锚索张力', model: 'JQM10 ×4',     range: '0~3710.7kN', unit: 'kN' },
  { key: 'strain', name: '应变',     model: 'CK-BYB-230 ×4',range: '±3000με',    unit: 'με' },
  { key: 'settle', name: '沉降',     model: 'CK-CJ-100 ×3', range: '0~100mm',    unit: 'mm' },
  { key: 'gap',    name: '开合度',   model: 'CK-CF-5MM ×8', range: '5~100mm',    unit: 'mm' },
  { key: 'tilt',   name: '倾斜',     model: 'JQIN-04 ×2',   range: '±15°',       unit: '°' },
  { key: 'vib',    name: '振动',     model: 'JBA22 ×2',     range: '±2g',        unit: 'g' }
];

// 初始化风机选择器
(function initSel() {
  const sel = document.getElementById('turbineSel');
  if (!sel) return;
  (window.WIND_FARMS || []).forEach((wf, i) => {
    const op = document.createElement('option');
    op.value = String(i);
    op.textContent = wf.name;
    sel.appendChild(op);
  });
  sel.addEventListener('change', () => {
    window.SELECTED = Number(sel.value);
    // 选择风机 → 聚焦放大该机（指导要求：选择即放大）
    if (window.focusTurbine) window.focusTurbine(window.SELECTED);
    if (window.__invRefresh && document.getElementById('invPanel') && document.getElementById('invPanel').style.display !== 'none') window.__invRefresh();
    const hint = document.getElementById('selHint');
    hint.textContent = '已聚焦 ' + (window.WIND_FARMS[window.SELECTED] || {}).name + '（点击"退出聚焦"返回全场）';
    clearTimeout(selHintTimer);
    selHintTimer = setTimeout(() => { hint.textContent = ''; }, 3000);
  });
})();
let selHintTimer = null;

// 当前选中风机（带兜底）
function curTurbine() {
  const list = window.TWIN_DATA.turbines;
  return list[window.SELECTED] || list[0];
}

setInterval(() => {
  // 数据层未就绪时静默跳过（避免 js 文件新旧混杂时刷屏报错）
  if (!window.TWIN_DATA || !window.TWIN_DATA.turbines || !window.TWIN_DATA.turbines.length) return;
  const list = window.TWIN_DATA.turbines;
  const sel = curTurbine();
  const KEYS = ['vib', 'tilt', 'cable', 'strain', 'gap', 'settle'];
  const healthN = list.filter((t) => KEYS.every((k) => !window.sensorMax(t.sensors, k).over)).length;

  // —— 全场总览指标卡 ——
  const runN = list.filter((t) => t.status === '运行').length;
  const faultN = list.filter((t) => t.status === '故障').length;
  document.getElementById('c_total').textContent = list.length + ' 台';
  document.getElementById('c_run').textContent = runN + ' 台';
  document.getElementById('c_alarm').textContent = faultN + ' 台';
  document.getElementById('c_alarm').style.color = faultN > 0 ? '#ff5252' : '#7fd0ff';
  document.getElementById('c_health').textContent = Math.round(healthN / list.length * 100) + '%';
  document.getElementById('c_health').style.color = healthN === list.length ? '#3dd68c' : '#ffd54f';

  // —— 选中风机运行参数（功率作为观测之一） ——
  document.getElementById('d_ws').textContent  = sel.windSpeed;
  document.getElementById('d_pw').textContent = sel.power.toLocaleString();
  document.getElementById('d_rpm').textContent = sel.rotorSpeed;
  const st = document.getElementById('d_st');
  st.textContent = sel.status;
  st.style.background = sel.statusColor[sel.status] || '#4a6a8a';

  // —— 结构监测传感器表（测点级：显示每类最大测点值 + 超限） ——
  document.getElementById('sensorBody').innerHTML = SENSOR_META.map((m) => {
    const o = window.sensorMax(sel.sensors, m.key);
    const bad = o.over;
    return '<tr onclick="window.switchView && window.switchView(\'analysis\');window.onSensorTypeChange && window.onSensorTypeChange(\'' + m.key + '\');' +
      'document.getElementById(\'sensorSel\').value=\'' + m.key + '\'">' +
      '<td>' + m.name + '</td><td>' + ((window.POINT_NUM || {})[m.key] || 1) + ' 点</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + o.val + ' ' + m.unit + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + (bad ? '⚠ 超限' : '正常') + '</td></tr>';
  }).join('');

  // —— 统计页：全场传感器目录（10 台 × 6 类 = 60 行，点击行跳转主页时序） ——
  const statRows = [];
  let nOk = 0, nWarn = 0, nOver = 0;
  list.forEach((t, ti) => {
    SENSOR_META.forEach((m) => {
      const o = window.sensorMax(t.sensors, m.key);
      const over = o.val > o.limit;
      const warn = !over && o.val > o.limit * 0.85;
      if (over) nOver++; else if (warn) nWarn++; else nOk++;
      const cls = over ? 'bad' : (warn ? 'warn' : 'ok');
      const st = over ? '⚠ 超限' : (warn ? '预警' : '正常');
      statRows.push('<tr onclick="window.switchView&&window.switchView(\'analysis\');window.onSensorTypeChange&&window.onSensorTypeChange(\'' + m.key + '\');document.getElementById(\'sensorSel\').value=\'' + m.key + '\'">' +
        '<td style="color:#7fd0ff;font-weight:bold">' + t.name + '</td>' +
        '<td>' + m.name + '</td>' +
        '<td class="mm">' + m.model + ' · ' + m.range + '</td>' +
        '<td class="' + cls + '">' + o.val + ' ' + m.unit + '</td>' +
        '<td class="' + cls + '">' + st + '</td></tr>');
    });
  });
  const total = nOk + nWarn + nOver;
  document.getElementById('statSum').innerHTML =
    '全场传感器目录：<b>' + list.length + '</b> 台 × <b>' + SENSOR_META.length + '</b> 类 = <b>' + total +
    '</b> 项监测 · 正常 <b class="ok">' + nOk + '</b> · 预警 <b class="warn">' + nWarn +
    '</b> · 超限 <b class="bad">' + nOver + '</b>　<span style="color:#6f88a8">点击目录行 → 数据分析页看时序</span>';
  document.getElementById('statBody').innerHTML = statRows.join('');
  const sh = document.getElementById('statSumHealth');
  if (sh) sh.innerHTML = document.getElementById('statSum').innerHTML;

  // —— 页3 右栏：六类传感器状态分布条 ——
  const byType = SENSOR_META.map((m) => {
    let ok = 0, warn = 0, over = 0;
    list.forEach((t) => {
      const o = window.sensorMax(t.sensors, m.key);
      if (o.val > o.limit) over++; else if (o.val > o.limit * 0.85) warn++; else ok++;
    });
    return { name: m.name, ok: ok, warn: warn, over: over, total: ok + warn + over };
  });
  const hb = document.getElementById('healthBars');
  if (hb) hb.innerHTML = byType.map((t) => {
    const pct = (x) => (t.total ? ((x / t.total) * 100).toFixed(1) : 0) + '%';
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:10px;color:#8fa8c8;white-space:nowrap">' +
      '<span style="width:56px">' + t.name + '</span>' +
      '<div style="flex:1;height:11px;background:rgba(80,160,255,.1);border-radius:3px;overflow:hidden;display:flex">' +
      '<div style="width:' + pct(t.ok) + ';background:#3dd68c" title="正常 ' + t.ok + '"></div>' +
      '<div style="width:' + pct(t.warn) + ';background:#ffd54f" title="预警 ' + t.warn + '"></div>' +
      '<div style="width:' + pct(t.over) + ';background:#ff5252" title="超限 ' + t.over + '"></div>' +
      '</div><span style="width:38px;text-align:right">' + (t.over ? t.over + ' ⚠' : t.ok + ' ✓') + '</span></div>';
  }).join('');

  // —— 页4 左栏：巡检汇总卡片 ——
  const pc = document.getElementById('patrolCards');
  if (pc) pc.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
    [['测点总数', total, '#7fd0ff'], ['正常', nOk, '#3dd68c'], ['预警', nWarn, '#ffd54f'], ['超限', nOver, '#ff5252']]
      .map((x) => '<div style="background:rgba(80,160,255,.07);border:1px solid rgba(80,160,255,.14);border-radius:6px;padding:7px 4px;text-align:center">' +
        '<div style="font-size:17px;color:' + x[2] + ';font-weight:bold">' + x[1] + '</div>' +
        '<div style="font-size:9px;color:#8fa8c8;margin-top:2px">' + x[0] + '</div></div>').join('') + '</div>';

  // —— 结构受力摘要（杆系力学计算，实时） ——
  const res = window.computeStructure(sel.windSpeed, sel.cableBoost);
  document.getElementById('s_ratio').textContent = res.maxRatio;
  document.getElementById('s_ratio_pos').textContent = res.maxSeg;
  document.getElementById('s_ratio').style.color = res.maxRatio > 0.8 ? '#ff5252' : '#7fd0ff';
  document.getElementById('s_sigma').textContent = res.maxSigma;
  const dispOver = res.topDisp > res.dispAllow;
  document.getElementById('s_disp').textContent = res.topDisp;
  document.getElementById('s_dispA').textContent = res.dispAllow;
  document.getElementById('s_disp').style.color = dispOver ? '#ff5252' : '#7fd0ff';
  document.getElementById('s_dispSt').innerHTML = dispOver ? '<span class="bad">超限</span>' : '<span class="ok">满足</span>';
  document.getElementById('s_dmg').textContent = res.damage;
  document.getElementById('s_life').textContent = res.lifeLeft;
  document.getElementById('s_life').style.color = res.lifeLeft < 10 ? '#ff5252' : (res.lifeLeft < 20 ? '#ffd54f' : '#7fd0ff');
  document.getElementById('s_lifeSt').innerHTML = res.health ? '<span class="ok">健康</span>' : '<span class="bad">需关注</span>';

  // —— 逐杆件校核表（14 段：高程/材质/应力/应力比/状态，颜色分级） ——
  document.getElementById('segTableBody').innerHTML = res.segments.map((sg, k) => {
    const rc = sg.ratio > 0.8 ? '#ff5252' : (sg.ratio > 0.5 ? '#ffd54f' : '#3dd68c');
    return '<tr><td>' + (k + 1) + '</td><td>' + sg.zm.toFixed(1) + '</td><td>' +
      (sg.mat === 'c' ? '砼' : '钢') + '</td><td>' + sg.sigma.toFixed(1) + '</td>' +
      '<td style="color:' + rc + ';font-weight:bold">' + sg.ratio.toFixed(2) + '</td>' +
      '<td class="' + (sg.ratio > 0.8 ? 'bad' : 'ok') + '">' + sg.status + '</td></tr>';
  }).join('');

  // —— 页2：杆系应力比柱状图（页切换后由 switchView resize，数据随 500ms 定时器刷新） ——
  if (window.renderStructBar) window.renderStructBar(res);

  // —— 环段损伤分析面板（v10：经典梁理论） ——
  if (window.__dmgRender) window.__dmgRender(sel.windSpeed);

  // —— 全场结构健康统计（底部统计页第二行） ——
  const hEl = document.getElementById('hStat');
  if (hEl) {
    let overN = 0, totalN = 0, maxR = 0, lifeSum = 0;
    list.forEach((t) => {
      KEYS.forEach((k) => {
        totalN += window.POINT_NUM[k];
        if (window.sensorMax(t.sensors, k).over) overN++;
      });
      const r = window.computeStructure(t.windSpeed, t.cableBoost);
      maxR = Math.max(maxR, r.maxRatio);
      lifeSum += r.lifeLeft;
    });
    hEl.innerHTML = '结构健康统计：测点正常 <b class="ok">' + (totalN - overN) + '</b> / 超限 <b class="bad">' + overN +
      '</b> · 全场最大应力比 <b>' + maxR.toFixed(2) + '</b> · 平均剩余寿命 <b>' + (lifeSum / list.length).toFixed(1) + '</b> 年';
  }

  // —— 底部巡检页：本轮巡检汇总条 + 风机级巡检明细表 ——
  const abnormalN = list.filter((t) =>
    t.status === '故障' || KEYS.some((k) => window.sensorMax(t.sensors, k).over)).length;
  const patrolRow = document.getElementById('patrolRow');
  if (patrolRow) {
    patrolRow.innerHTML = '本轮巡检 <b>' + list.length + '/' + list.length + '</b> 台完成 · 正常 <b>' +
      (list.length - abnormalN) + '</b> · 异常 <b class="' + (abnormalN ? 'bad' : 'ok') + '">' + abnormalN + '</b> · 当前巡检 <b>' +
      (sel.name || '') + '</b><span class="tag">自动巡检 · 异常需人工复核</span>';
  }
  const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const nameMap = { vib: '振动', tilt: '倾斜', cable: '锚索张力', strain: '应变', gap: '开合度', settle: '沉降' };
  document.getElementById('detailBody').innerHTML = list.map((t) => {
    const overItems = [];
    KEYS.forEach((k) => {
      const o = window.sensorMax(t.sensors, k);
      if (o.over) overItems.push(nameMap[k] + ' ' + o.val);
    });
    const bad = t.status === '故障' || overItems.length > 0;
    return '<tr><td><b>' + t.name + '</b></td><td>' + t.status + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + (overItems.length ? overItems.join('、') : '无') + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + (bad ? '需人工复核' : '自动巡检通过') + '</td>' +
      '<td>' + nowStr + '</td></tr>';
  }).join('');

  // —— 时钟 ——
  const now = new Date();
  document.getElementById('clock').textContent =
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
}, 500);

// 底部导航切换：主页 / 统计 / 巡检
window.switchView = function (v) {
  // 页面显示：总览页 = #middle（含 3D），其余页 = 对应 .page
  const isOverview = v === 'overview';
  document.getElementById('middle').style.display = isOverview ? 'grid' : 'none';
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('on'));
  if (!isOverview) {
    const id = { structure: 'page-structure', analysis: 'page-analysis', inspect: 'page-inspect', model: 'page-model' }[v];
    if (id) document.getElementById(id).classList.add('on');
  }
  // 导航高亮
  const order = ['overview', 'structure', 'analysis', 'inspect', 'model'];
  document.querySelectorAll('#navBar .btn').forEach((b, i) => b.classList.toggle('on', order[i] === v));
  // 目标页图表 resize（隐藏容器初始化的 ECharts 需在显示后重算尺寸）
  setTimeout(() => {
    (window.__charts || []).forEach((c) => { if (c && c.__page === v) c.resize(); });
    if (isOverview && window.__resize3D) window.__resize3D();
    if (v === 'structure' && window.__invRefresh) window.__invRefresh();
    if (v === 'model') {
      if (window.__model3dResize) window.__model3dResize();
      if (window.__dmgRenderM) {
        const wt = window.TWIN_DATA && window.TWIN_DATA.turbines[window.SELECTED];
        window.__dmgRenderM(wt ? wt.windSpeed : 12);
      }
      // 二次刷新保险：确保沙盒三曲线在容器可见后完成初始化
      setTimeout(() => {
        if (window.__model3dResize) window.__model3dResize();
        if (window.__dmgRenderM) {
          const wt2 = window.TWIN_DATA && window.TWIN_DATA.turbines[window.SELECTED];
          window.__dmgRenderM(wt2 ? wt2.windSpeed : 12);
        }
      }, 250);
    }
  }, 80);
};

// ============================================================
// ===== 环段损伤分析面板（v10） ================================
// 滑块 ↔ DMG_OPTS ↔ computeDamageAnalysis ↔ 结果卡片 + 三条曲线
// ============================================================
(function damagePanel() {
  const IDS = {
    a: ['dmgA', 'dmgAv'], len: ['dmgLen', 'dmgLenV'], d: ['dmgD', 'dmgDV'],
    zeta: ['dmgZeta', 'dmgZetaV'], exc: ['dmgExc', 'dmgExcV']
  };
  // 滑块 → DMG_OPTS 双向同步（值标签格式化）
  const FM = {
    a: (v) => (+v).toFixed(1) + 'm',
    len: (v) => (+v).toFixed(1) + 'm',
    d: (v) => (+v).toFixed(2),
    zeta: (v) => (+v).toFixed(3),
    exc: (v) => (+v).toFixed(2) + 'Hz'
  };
  const DEFAULTS = { a: 66.75, len: 6.7, d: 0.3, zeta: 0.02, exc: 0.25 };
  Object.keys(IDS).forEach((k) => {
    const el = document.getElementById(IDS[k][0]);
    if (!el) return;
    el.value = window.DMG_OPTS[k];
    document.getElementById(IDS[k][1]).textContent = FM[k](el.value);
    el.addEventListener('input', () => {
      window.DMG_OPTS[k] = +el.value;
      document.getElementById(IDS[k][1]).textContent = FM[k](el.value);
    });
  });

  // 三条微型曲线（只初始化一次）
  const BASE = {
    grid: { show: true, lineStyle: { color: 'rgba(80,160,255,.15)' } },
    xAxis: { type: 'value', axisLabel: { color: '#6f88a8', fontSize: 8 }, splitLine: { show: false }, nameTextStyle: { color: '#8fa8c8' } },
    yAxis: { type: 'value', axisLabel: { color: '#6f88a8', fontSize: 8 }, splitLine: { lineStyle: { color: 'rgba(80,160,255,.08)' } }, nameTextStyle: { color: '#8fa8c8' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(8,22,40,.9)', borderColor: 'rgba(80,160,255,.3)', textStyle: { color: '#cfe3ff', fontSize: 10 } }
  };
  function mkChart(id, opts) {
    const el = document.getElementById(id);
    if (!el || !window.echarts) return null;
    const c = window.echarts.init(el);
    c.setOption(Object.assign({}, BASE, opts));
    return c;
  }
  const cDisp = mkChart('mcDisp', {
    title: { text: '位移比-损伤位置', textStyle: { color: '#8fb3d9', fontSize: 9 }, left: 4, top: 0 },
    grid: { left: 28, right: 8, top: 20, bottom: 16 },
    series: [{ type: 'line', name: '位移比', smooth: true, showSymbol: false, lineStyle: { color: '#ffd54f', width: 1.5 }, data: [] }]
  });
  const cFreq = mkChart('mcFreq', {
    title: { text: '频率比-退化率', textStyle: { color: '#8fb3d9', fontSize: 9 }, left: 4, top: 0 },
    grid: { left: 28, right: 8, top: 20, bottom: 16 },
    series: [{ type: 'line', name: '频率比', smooth: true, showSymbol: false, lineStyle: { color: '#3dd68c', width: 1.5 }, data: [] }]
  });
  const cDaf = mkChart('mcDaf', {
    title: { text: '动力放大-激励频率', textStyle: { color: '#8fb3d9', fontSize: 9 }, left: 4, top: 0 },
    grid: { left: 28, right: 8, top: 20, bottom: 16 },
    series: [
      { type: 'line', name: '完整塔', smooth: true, showSymbol: false, lineStyle: { color: '#7fd0ff', width: 1.5 }, data: [] },
      { type: 'line', name: '损伤塔', smooth: true, showSymbol: false, lineStyle: { color: '#ff5252', width: 1.5 }, data: [] }
    ]
  });

  // ===== v12 双模式：正向分析 / 损伤识别 =====
  const fwdPanel = document.getElementById('fwdPanel');
  const invPanel = document.getElementById('invPanel');
  const tFwd = document.getElementById('tabForward');
  const tInv = document.getElementById('tabInvert');
  const btnInv = document.getElementById('btnInvert');
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  // 识别面板实时读数刷新（切到识别模式或识别后调用）
  window.__invRefresh = function () {
    const t = window.TWIN_DATA.turbines[window.SELECTED];
    if (!t || !t.obs || !t.obs.f || !window.strainProfile) return;
    setTxt('invTurbine', t.id + '（当前聚焦）');
    const r0 = window.computeDamageAnalysis(t.windSpeed, { d: 0 });
    const eps0 = window.strainProfile(t.windSpeed, { d: 0 });
    // 应变比峰值（损伤定位的直接证据）
    let pkI = 0;
    t.obs.eps.forEach((e, i) => { if (e / eps0[i] > t.obs.eps[pkI] / eps0[pkI]) pkI = i; });
    setTxt('invF', t.obs.f.toFixed(4) + ' Hz');
    setTxt('invF0', '理论 ' + r0.f0.toFixed(4) + ' Hz');
    setTxt('invX', (t.obs.eps[pkI] / eps0[pkI]).toFixed(2) + '×');
    setTxt('invX0', '峰值 @ ' + window.STRAIN_Z[pkI] + ' m');
  };

  // 运行损伤识别：网格反演 → 结果卡片 + 同步 3D 损伤环 + 寿命预测
  // 识别值写入 DMG_OPTS 后，同步两套滑块控件（主面板 dmg- / 沙盒 m_dmg-）的显示
window.__syncDmgSliders = function () {
  const O = window.DMG_OPTS || {};
  const MAP = [['dmgA', 'dmgAv', 'a', (v) => (+v).toFixed(1) + 'm'], ['m_dmgA', 'm_dmgAv', 'a', (v) => (+v).toFixed(1) + 'm'],
               ['dmgD', 'dmgDV', 'd', (v) => (+v).toFixed(2)], ['m_dmgD', 'm_dmgDV', 'd', (v) => (+v).toFixed(2)],
               ['dmgLen', 'dmgLenV', 'len', (v) => (+v).toFixed(1) + 'm'], ['m_dmgLen', 'm_dmgLenV', 'len', (v) => (+v).toFixed(1) + 'm']];
  MAP.forEach(([si, tv, key, fm]) => {
    const el = document.getElementById(si);
    if (!el) return;
    el.value = O[key];
    const t = document.getElementById(tv);
    if (t) t.textContent = fm(O[key]);
  });
};

window.__runInvert = function (quiet) {
    const t = window.TWIN_DATA.turbines[window.SELECTED];
    if (!t || !window.invertDamage) return;
    const res = window.invertDamage(t.windSpeed, t.obs);
    if (!res) return;
    setTxt('invA', res.aHat + ' m');
    setTxt('invARange', '区间 [' + res.aRange.join(', ') + '] m');
    setTxt('invD', res.dHat.toFixed(2));
    setTxt('invDRange', '区间 [' + res.dRange.join(', ') + ']');
    const health = res.dHat < 0.08 || res.hitN > 40;   // 退化率过小或解不唯一 → 未检出损伤
    setTxt('invLife', health ? '健康' : res.life.toFixed(1) + ' 年');
    setTxt('invErr', res.err);
    setTxt('invHit', health ? '未检出损伤' : '应变峰 ' + res.peakZ + ' m·' + res.peakR + '×');
    // 同步到正向分析参数 → 3D 损伤环 + 结果卡（寿命预测切换到识别损伤）
    window.DMG_OPTS.a = res.aHat;
    window.DMG_OPTS.d = res.dHat;
    if (window.__dmgRender) window.__dmgRender(t.windSpeed);
    if (window.focusTurbine) window.focusTurbine(window.SELECTED);
    // 自动识别（quiet）不打扰独立沙盒滑块；手动"运行识别"才全量同步沙盒
    if (!quiet) {
      if (window.__syncDmgSliders) window.__syncDmgSliders();
      if (window.__dmgRenderM) window.__dmgRenderM(t.windSpeed);
      if (window.__model3dUpdate) window.__model3dUpdate();
    }
  };

  function switchDmgMode(mode) {
    const f = mode === 'forward';
    if (tFwd) tFwd.classList.toggle('on', f);
    if (tInv) tInv.classList.toggle('on', !f);
    if (fwdPanel) fwdPanel.style.display = f ? '' : 'none';
    if (invPanel) invPanel.style.display = f ? 'none' : '';
    if (!f && window.__invRefresh) window.__invRefresh();
  }
  if (tFwd) tFwd.addEventListener('click', function () { switchDmgMode('forward'); });
  if (tInv) tInv.addEventListener('click', function () { switchDmgMode('invert'); });
  if (btnInv) btnInv.addEventListener('click', () => window.__runInvert(false));

  // —— 实时自动识别：传感器数据每 2s 刷新，识别每 5s 自动运行 ——
  const autoEl = document.getElementById('autoInv');
  const invTimeEl = document.getElementById('invTime');
  let autoTick = 0;
  setInterval(() => {
    if (!autoEl || !autoEl.checked) return;
    if (window.__runInvert) window.__runInvert(true);       // 静默模式：不打扰沙盒滑块
    autoTick++;
    if (invTimeEl) invTimeEl.textContent = '第' + autoTick + '次 ' +
      new Date().toTimeString().slice(0, 8);
  }, 5000);
  if (autoEl) autoEl.addEventListener('change', () => {
    if (autoEl.checked && window.__runInvert) window.__runInvert(true);
  });

  window.__dmgRender = function (v) {
    if (!window.computeDamageAnalysis || !window.TWIN_DATA) return;
    const r = window.computeDamageAnalysis(v, window.DMG_OPTS);
    // 结果卡片
    const set = (id, txt, color) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = txt; if (color) el.style.color = color; }
    };
    set('d_dispR', r.dispRatio.toFixed(4), r.dispInc > 5 ? '#ff5252' : '#7fd0ff');
    set('d_dispInc', '(+' + r.dispInc + '%)');
    set('d_freqR', r.freqRatio.toFixed(4), r.freqRatio < 0.97 ? '#ffd54f' : '#7fd0ff');
    set('d_f0', 'f0=' + r.f0.toFixed(3) + 'Hz');
    set('d_daf', r.DAFd.toFixed(2), r.DAFd > 3 ? '#ffd54f' : '#7fd0ff');
    set('d_rd', 'r=Ω/ω=' + r.rd.toFixed(2));
    set('d_ds', r.dSd.toFixed(1) + ' / ' + r.dS0.toFixed(1), '');
    set('d_dyr', Number(r.Dyrd).toExponential(2) + '', '');
    set('d_dyrR', 'ΔD/D0=' + r.dRatio.toFixed(2) + '倍');
    const life = r.lifed;
    set('d_life', life.toFixed(1), life < 20 ? '#ff5252' : (life < 60 ? '#ffd54f' : '#3dd68c'));
    // 曲线（低频刷新，0.5s 一次太重 → 每 2.5s 更新一次）
    const now = Date.now();
    if (window.__dmgChartT && now - window.__dmgChartT < 2500) return;
    window.__dmgChartT = now;
    const cvs = window.damageCurves(v);
    if (cDisp) cDisp.setOption({ series: [{ data: cvs.c1 }] });
    if (cFreq) cFreq.setOption({ series: [{ data: cvs.c2 }] });
    if (cDaf) cDaf.setOption({ series: [{ data: cvs.c3i }, { data: cvs.c3d }] });
  };
})();

// ============================================================
// ===== 独立计算沙盒面板（v13 · 工程师计算模块） ==============
// 滑块 ↔ DMG_OPTS ↔ 结果卡 + 三条曲线 + 单风机 3D（model3d.js）
// 与平台主数据流完全隔离：仅消费 DMG_OPTS，不影响传感器/识别
// ============================================================
(function mSandboxPanel() {
  const IDS = {
    a: ['m_dmgA', 'm_dmgAv'], len: ['m_dmgLen', 'm_dmgLenV'], d: ['m_dmgD', 'm_dmgDV'],
    zeta: ['m_dmgZeta', 'm_dmgZetaV'], exc: ['m_dmgExc', 'm_dmgExcV']
  };
  const FM = {
    a: (v) => (+v).toFixed(1) + 'm',
    len: (v) => (+v).toFixed(1) + 'm',
    d: (v) => (+v).toFixed(2),
    zeta: (v) => (+v).toFixed(3),
    exc: (v) => (+v).toFixed(2) + 'Hz'
  };
  Object.keys(IDS).forEach((k) => {
    const el = document.getElementById(IDS[k][0]);
    if (!el) return;
    el.value = window.DMG_OPTS[k];
    document.getElementById(IDS[k][1]).textContent = FM[k](el.value);
    el.addEventListener('input', () => {
      window.DMG_OPTS[k] = +el.value;
      document.getElementById(IDS[k][1]).textContent = FM[k](el.value);
      if (window.__dmgRenderM) window.__dmgRenderM(window.SELECTED && window.TWIN_DATA.turbines[window.SELECTED].windSpeed || 12);
      if (window.__model3dUpdate) window.__model3dUpdate();
    });
  });

  // 沙盒三条微曲线（独立实例，避免与主面板实例冲突）
  const BASE = {
    grid: { show: true, lineStyle: { color: 'rgba(80,160,255,.15)' } },
    xAxis: { type: 'value', axisLabel: { color: '#6f88a8', fontSize: 8 }, splitLine: { show: false }, nameTextStyle: { color: '#8fa8c8' } },
    yAxis: { type: 'value', axisLabel: { color: '#6f88a8', fontSize: 8 }, splitLine: { lineStyle: { color: 'rgba(80,160,255,.08)' } }, nameTextStyle: { color: '#8fa8c8' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(8,22,40,.9)', borderColor: 'rgba(80,160,255,.3)', textStyle: { color: '#cfe3ff', fontSize: 10 } }
  };
  function mkMChart(id, opts) {
    const el = document.getElementById(id);
    if (!el || !window.echarts) return null;
    const c = window.echarts.init(el);
    c.setOption(Object.assign({}, BASE, opts));
    return c;
  }
  // 三图延迟初始化：容器隐藏（页面未显示）时宽度为 0，ECharts 会空白。
  // 首次在"损伤建模"页可见时创建，确保有实际宽度。
  let mC = { disp: null, freq: null, daf: null };
  let mInitTries = 0;
  function ensureMCharts() {
    if (mC.disp) return true;
    const el = document.getElementById('m_mcDisp');
    if (!el || el.clientWidth < 10) return false;
    mC = {
      disp: mkMChart('m_mcDisp', {
        title: { text: '位移比-损伤位置', textStyle: { color: '#8fb3d9', fontSize: 9 }, left: 4, top: 0 },
        grid: { left: 26, right: 6, top: 18, bottom: 14 },
        series: [{ type: 'line', name: '位移比', smooth: true, showSymbol: false, lineStyle: { color: '#ffd54f', width: 1.4 }, data: [] }]
      }),
      freq: mkMChart('m_mcFreq', {
        title: { text: '频率比-退化率', textStyle: { color: '#8fb3d9', fontSize: 9 }, left: 4, top: 0 },
        grid: { left: 26, right: 6, top: 18, bottom: 14 },
        series: [{ type: 'line', name: '频率比', smooth: true, showSymbol: false, lineStyle: { color: '#3dd68c', width: 1.4 }, data: [] }]
      }),
      daf: mkMChart('m_mcDaf', {
        title: { text: '动力放大-激励频率', textStyle: { color: '#8fb3d9', fontSize: 9 }, left: 4, top: 0 },
        grid: { left: 26, right: 6, top: 18, bottom: 14 },
        series: [
          { type: 'line', name: '完整塔', smooth: true, showSymbol: false, lineStyle: { color: '#7fd0ff', width: 1.4 }, data: [] },
          { type: 'line', name: '损伤塔', smooth: true, showSymbol: false, lineStyle: { color: '#ff5252', width: 1.4 }, data: [] }
        ]
      })
    };
    return true;
  }

  window.__dmgRenderM = function (v) {
    if (!window.computeDamageAnalysis) return;
    const wind = v || 12;
    const r = window.computeDamageAnalysis(wind, window.DMG_OPTS);
    const set = (id, txt, color) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = txt; if (color) el.style.color = color; }
    };
    set('m_dispR', r.dispRatio.toFixed(4), r.dispInc > 5 ? '#ff5252' : '#7fd0ff');
    set('m_dispInc', '(+' + r.dispInc + '%)');
    set('m_freqR', r.freqRatio.toFixed(4), r.freqRatio < 0.97 ? '#ffd54f' : '#7fd0ff');
    set('m_f0', 'f0=' + r.f0.toFixed(3) + 'Hz');
    set('m_daf', r.DAFd.toFixed(2), r.DAFd > 3 ? '#ffd54f' : '#7fd0ff');
    set('m_rd', 'r=Ω/ω=' + r.rd.toFixed(2));
    set('m_ds', r.dSd.toFixed(1) + ' / ' + r.dS0.toFixed(1), '');
    set('m_dyr', Number(r.Dyrd).toExponential(2) + '', '');
    set('m_dyrR', 'ΔD/D0=' + r.dRatio.toFixed(2) + '倍');
    const life = r.lifed;
    set('m_life', life.toFixed(1), life < 20 ? '#ff5252' : (life < 60 ? '#ffd54f' : '#3dd68c'));
    // 三条曲线（容器可见时才初始化；首次进入本页时延迟创建）
    if (!window.damageCurves) return;
    if (!ensureMCharts()) {
      if (mInitTries < 12) { mInitTries++; setTimeout(() => { if (window.__dmgRenderM) window.__dmgRenderM(wind); }, 400); }
      return;
    }
    const cv = window.damageCurves(wind);
    if (mC.disp && cv.disp) mC.disp.setOption({ series: [{ data: cv.disp }] });
    if (mC.freq && cv.freq) mC.freq.setOption({ series: [{ data: cv.freq }] });
    if (mC.daf) {
      mC.daf.setOption({ series: [{ data: cv.daf0 }, { data: cv.dafd }] });
    }
    // 注册跨页 resize（只注册一次）
    if (!window.__mSandboxChartsPushed) {
      window.__mSandboxChartsPushed = true;
      (window.__charts = window.__charts || []).push(
        { __page: 'model', resize: () => { Object.values(mC).forEach((c) => c && c.resize()); } }
      );
    }
  };

  // 初始化一次
  setTimeout(() => {
    if (window.__dmgRenderM) window.__dmgRenderM(window.TWIN_DATA && window.TWIN_DATA.turbines[window.SELECTED] ? window.TWIN_DATA.turbines[window.SELECTED].windSpeed : 12);
  }, 600);
})();

// ============================================================
// ===== 全场功率与发电（v13.2 · 总览页增强） ==================
// 功率模型：P = 0.5·ρ·A·Cp·V³（额定功率上限），实时滚动累计发电量
// ============================================================
(function powerBoard() {
  const R = 70, RHO = 1.225, CP = 0.44, PMAX = 4200;   // 叶片半径/空气密度/功率系数/额定功率kW
  let dayEnergy = 0;                                    // 今日累计 kWh（会话内滚动累计）
  let lastTick = Date.now();
  const PWR_HIST = [];
  let chartP = null;

  function powerOf(v) {
    if (v < 3) return 0;                                 // 切入风速 3m/s
    if (v > 25) return 0;                                // 切出风速
    const p = 0.5 * RHO * Math.PI * R * R * CP * Math.pow(v, 3) / 1000;  // kW
    return Math.min(p, PMAX);
  }

  function refresh() {
    const tds = window.TWIN_DATA && window.TWIN_DATA.turbines;
    if (!tds) return;
    const now = Date.now();
    const dt = (now - lastTick) / 3600 / 1000;           // 小时
    lastTick = now;
    let pSum = 0;
    tds.forEach((t) => { pSum += powerOf(t.windSpeed || 0); });
    dayEnergy += pSum * dt;                              // kWh
    const n = tds.length || 1;
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('p_total', (pSum / 1000).toFixed(2));
    set('p_today', (dayEnergy / 1000).toFixed(1));
    set('p_avg', (pSum / 1000 / n).toFixed(2));
    set('p_hrs', (dayEnergy / Math.max(pSum, 1)).toFixed(1));
    // 当前选中风机单机日发电（会话累计）
    const sel = window.TWIN_DATA.turbines[window.SELECTED];
    if (sel) set('d_day', ((dayEnergy * (powerOf(sel.windSpeed) / Math.max(pSum, 1))) / 1000).toFixed(2));
    // 功率趋势图（滚动 40 点）
    PWR_HIST.push(+ (pSum / 1000).toFixed(2));
    if (PWR_HIST.length > 40) PWR_HIST.shift();
    if (!chartP) {
      const el = document.getElementById('chartPower');
      if (!el || !window.echarts) return;
      if (el.clientWidth < 10) { setTimeout(refresh, 500); return; }
      chartP = window.echarts.init(el);
      chartP.setOption({
        grid: { left: 4, right: 4, top: 14, bottom: 4, containLabel: true },
        xAxis: { type: 'category', show: false, data: PWR_HIST.map((_, i) => i) },
        yAxis: { type: 'value', show: false, min: 0 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(8,22,40,.9)', borderColor: 'rgba(80,160,255,.3)', textStyle: { color: '#cfe3ff', fontSize: 10 } },
        series: [{
          type: 'line', smooth: true, showSymbol: false, data: PWR_HIST,
          lineStyle: { color: '#3dd68c', width: 1.4 },
          areaStyle: { color: 'rgba(61,214,140,.18)' }
        }]
      });
      (window.__charts = window.__charts || []).push({ __page: 'overview', resize: () => chartP && chartP.resize() });
    } else {
      chartP.setOption({ series: [{ data: PWR_HIST }] });
    }
  }
  setInterval(refresh, 2000);

  // —— 各风机实时出力柱状图（全场功率构成，告警风机红色） ——
  let pwrBar = null;
  function refreshPwrBar() {
    const tds = window.TWIN_DATA && window.TWIN_DATA.turbines;
    if (!tds) return;
    if (!pwrBar) {
      const el = document.getElementById('chartPwrBar');
      if (!el || !window.echarts) return;
      if (el.clientWidth < 10) { setTimeout(refreshPwrBar, 500); return; }
      pwrBar = window.echarts.init(el);
      pwrBar.setOption({
        grid: { left: 30, right: 6, top: 16, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: [], axisLabel: { fontSize: 8, color: '#8ab4d8' } },
        yAxis: { type: 'value', min: 0, max: 4.5, axisLabel: { fontSize: 8, color: '#8ab4d8', formatter: '{value}' } },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(8,22,40,.9)', borderColor: 'rgba(80,160,255,.3)', textStyle: { color: '#cfe3ff', fontSize: 10 }, valueFormatter: (v) => v + ' MW' },
        series: [{
          type: 'bar', barWidth: 8,
          itemStyle: { borderRadius: [2, 2, 0, 0] },
          data: []
        }]
      });
    }
    const names = [], vals = [], colors = [];
    tds.forEach((t) => {
      names.push(t.name);
      vals.push(+(powerOf(t.windSpeed || 0) / 1000).toFixed(2));
      colors.push((t.alarm && t.alarm.anchor) ? '#ff6b6b' : '#3dd68c');
    });
    pwrBar.setOption({
      xAxis: { data: names },
      series: [{ data: vals.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })) }]
    });
  }
  setInterval(refreshPwrBar, 2000);
  setTimeout(refreshPwrBar, 600);
})();

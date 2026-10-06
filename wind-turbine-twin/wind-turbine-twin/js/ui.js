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
    return '<tr onclick="window.onSensorTypeChange && window.onSensorTypeChange(\'' + m.key + '\');' +
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
      statRows.push('<tr onclick="window.switchView&&window.switchView(\'pie\');window.onSensorTypeChange&&window.onSensorTypeChange(\'' + m.key + '\');document.getElementById(\'sensorSel\').value=\'' + m.key + '\'">' +
        '<td style="color:#7fd0ff;font-weight:bold">' + t.name + '</td>' +
        '<td>' + m.name + '</td><td>' + m.model + '</td><td>' + m.range + '</td>' +
        '<td>' + ((window.POINT_NUM || {})[m.key] || 1) + ' 点</td>' +
        '<td class="' + cls + '">' + o.val + ' ' + m.unit + '</td>' +
        '<td class="' + cls + '">' + st + '</td></tr>');
    });
  });
  const total = nOk + nWarn + nOver;
  document.getElementById('statSum').innerHTML =
    '全场传感器目录：<b>' + list.length + '</b> 台 × <b>' + SENSOR_META.length + '</b> 类 = <b>' + total +
    '</b> 项监测 · 正常 <b class="ok">' + nOk + '</b> · 预警 <b class="warn">' + nWarn +
    '</b> · 超限 <b class="bad">' + nOver + '</b>　<span style="color:#6f88a8">点击任一行 → 切回主页查看该传感器时序</span>';
  document.getElementById('statBody').innerHTML = statRows.join('');

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
  ['chartBarBox', 'tableBox', 'statBox'].forEach((id) => {
    document.getElementById(id).classList.remove('on');
  });
  if (v === 'pie') document.getElementById('chartBarBox').classList.add('on');
  if (v === 'bar') document.getElementById('statBox').classList.add('on');
  if (v === 'table') document.getElementById('tableBox').classList.add('on');
  const btns = document.querySelectorAll('#navBar .btn');
  btns.forEach((b, i) => b.classList.toggle('on', ['pie', 'bar', 'table'][i] === v));
};

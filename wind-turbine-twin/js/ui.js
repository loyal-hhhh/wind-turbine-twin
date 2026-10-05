// ============ 大屏 UI 更新（全场总览/选中风机/传感器表/时钟/底部导航） ============
const SENSOR_META = [
  { key: 'vib',    name: '振动',     model: 'JBA22 ×2',     range: '±2g',        desc: '振动' },
  { key: 'tilt',   name: '倾斜',     model: 'JQIN-04 ×2',   range: '±15°',       desc: '倾斜' },
  { key: 'cable',  name: '锚索张力', model: 'JQM10 ×4',     range: '0~3710.7kN', desc: '锚索张力' },
  { key: 'strain', name: '应变',     model: 'CK-BYB-230 ×4',range: '±3000με',    desc: '应变' },
  { key: 'gap',    name: '开合度',   model: 'CK-CF-5MM ×8', range: '5~100mm',    desc: '开合度' },
  { key: 'settle', name: '沉降',     model: 'CK-CJ-100 ×3', range: '0~100mm',    desc: '沉降' }
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
    document.getElementById('selHint').textContent = '已切换到 ' + (window.WIND_FARMS[window.SELECTED] || {}).name;
    clearTimeout(selHintTimer);
    selHintTimer = setTimeout(() => { document.getElementById('selHint').textContent = ''; }, 2000);
  });
})();
let selHintTimer = null;

setInterval(() => {
  const td = window.TWIN_DATA;
  const list = td.turbines;
  const sel = list[window.SELECTED] || list[0];

  // —— 全场总览指标卡 ——
  const runN = list.filter((t) => t.status === '运行').length;
  const faultN = list.filter((t) => t.status === '故障').length;
  const avgWs = (list.reduce((a, t) => a + t.windSpeed, 0) / list.length).toFixed(1);
  document.getElementById('c_total').textContent = list.length + ' 台';
  document.getElementById('c_run').textContent = runN + ' 台';
  document.getElementById('c_alarm').textContent = faultN + ' 台';
  document.getElementById('c_alarm').style.color = faultN > 0 ? '#ff5252' : '#7fd0ff';
  document.getElementById('c_ws').textContent = avgWs + ' m/s';

  // —— 选中风机实时数据 ——
  document.getElementById('d_ws').textContent  = sel.windSpeed;
  document.getElementById('d_pw').textContent = sel.power.toLocaleString();
  document.getElementById('d_rpm').textContent = sel.rotorSpeed;
  const st = document.getElementById('d_st');
  st.textContent = sel.status;
  st.style.background = sel.statusColor[sel.status] || '#4a6a8a';

  // —— 选中风机传感器简表 ——
  const s = sel.sensors;
  document.getElementById('sensorBody').innerHTML = SENSOR_META.map((m) => {
    const o = s[m.key];
    const bad = o.val > o.limit;
    return '<tr><td>' + m.name + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + o.val + ' ' + o.unit + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + (bad ? '⚠ 超限' : '正常') + '</td></tr>';
  }).join('');

  // —— 底部巡检页：本轮巡检汇总条 + 巡检明细表（选中风机） ——
  const abnormalN = list.filter((t) =>
    t.status === '故障' || Object.values(t.sensors).some((o) => o.val > o.limit)).length;
  const patrolRow = document.getElementById('patrolRow');
  if (patrolRow) {
    patrolRow.innerHTML = '本轮巡检 <b>' + list.length + '/' + list.length + '</b> 台完成 · 正常 <b>' +
      (list.length - abnormalN) + '</b> · 异常 <b class="' + (abnormalN ? 'bad' : 'ok') + '">' + abnormalN + '</b> · 当前巡检 <b>' +
      (sel.name || '') + '</b><span class="tag">自动巡检 · 异常需人工复核</span>';
  }
  const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  document.getElementById('detailBody').innerHTML = SENSOR_META.map((m) => {
    const o = s[m.key];
    const bad = o.val > o.limit;
    return '<tr><td>' + m.name + '</td><td>' + m.model + '</td><td>' + m.range + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + o.val + ' ' + o.unit + '</td>' +
      '<td class="' + (bad ? 'bad' : 'ok') + '">' + (bad ? '⚠ 超限' : '正常') + '</td>' +
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

// 底部导航切换：主页(pie) / 统计(bar) / 巡检(table)
window.switchView = function (v) {
  const map = { pie: 'chartPieBox', bar: 'chartBarBox', table: 'tableBox' };
  ['chartPieBox', 'chartBarBox', 'tableBox'].forEach((id) => {
    document.getElementById(id).classList.remove('on');
  });
  document.getElementById(map[v]).classList.add('on');
  const btns = document.querySelectorAll('#bottomNav .btn');
  btns.forEach((b, i) => b.classList.toggle('on', ['pie', 'bar', 'table'][i] === v));
};

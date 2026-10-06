// ============ 多风机测点级数据模拟器（v9） ============
// 结构：每台风机 6 类传感器 × 全部测点（锚索4/应变4/沉降3/开合度8/振动2/倾斜2 = 23 个测点）
// 每个测点维护 40 点时间序列缓冲（hist），供时序图（实测+预测）使用
// 传感器量程来自《华能西安热工院风电塔筒监测方案》：limit = 量程的 80%
// 说明：模拟数据。接入真实数据时替换为 fetch(data.json)，字段结构与此一致。

const STATUS_COLOR = { '运行': '#2e7d32', '待机': '#f9a825', '故障': '#c62828' };
const HIST_LEN = 40;                    // 每个测点的时序缓冲长度
const POINT_NUM = { vib: 2, tilt: 2, cable: 4, strain: 4, gap: 8, settle: 3 };   // 各传感器测点数
// 测点名（用于图例/巡检）：锚索按方位，其余按部位
const POINT_NAME = {
  vib:    ['塔底', '塔顶'],
  tilt:   ['塔底', '过渡段'],
  cable:  ['北锚索', '南锚索', '东锚索', '西锚索'],
  strain: ['塔底A', '塔底B', '过渡段', '塔顶'],
  gap:    ['缝1', '缝2', '缝3', '缝4', '缝5', '缝6', '缝7', '缝8'],
  settle: ['基础1', '基础2', '基础3']
};

function rndVal(a, b) { return a + Math.random() * (b - a); }

function mkPoints(n, base, jitter) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const v = +(base + rndVal(-jitter, jitter)).toFixed(2);
    pts.push({ val: v, hist: new Array(HIST_LEN).fill(v) });
  }
  return pts;
}

function mkSensors() {
  return {
    vib:    { unit: 'g',  limit: 1.6,   points: mkPoints(2, 0.15, 0.2) },      // 振动 ±2g
    tilt:   { unit: '°',  limit: 12,    points: mkPoints(2, 0.3, 0.5) },       // 倾斜 ±15°
    cable:  { unit: 'kN', limit: 2968.6, points: mkPoints(4, 2000, 250) },     // 锚索张力 0~3710.7kN
    strain: { unit: 'με', limit: 2400,  points: mkPoints(4, 120, 80) },        // 应变 ±3000με
    gap:    { unit: 'mm', limit: 80,    points: mkPoints(8, 12.5, 5) },        // 开合度 5~100mm
    settle: { unit: 'mm', limit: 80,    points: mkPoints(3, 3.2, 1.5) }        // 沉降 0~100mm
  };
}

function mkTurbine(wf) {
  return {
    id: wf.id, name: wf.name,
    windSpeed: 8, power: 2000, rotorSpeed: 10,
    status: '运行', statusColor: STATUS_COLOR,
    sensors: mkSensors(),
    faultLeft: 0,        // 故障保持计数（8秒后自动恢复，方便演示）
    cableBoost: 0        // 锚索超限对结构应力的放大比例（0~0.6）
  };
}

window.TWIN_DATA = { turbines: window.WIND_FARMS.map(mkTurbine) };
window.POINT_NUM = POINT_NUM;   // 导出测点数量表（ui.js 传感器表要用）
window.SELECTED = 0;     // 当前选中风机索引（点击风机或下拉切换）

// 每个测点推一个新值并滚动进历史缓冲
function pushPoint(pt, v) {
  pt.val = +v.toFixed(2);
  pt.hist.push(pt.val);
  if (pt.hist.length > HIST_LEN) pt.hist.shift();
}

setInterval(() => {
  window.TWIN_DATA.turbines.forEach((t) => {
    // —— 全场共用一个风速场，各台加小幅偏差（更真实） ——
    const base = 5 + Math.random() * 10;
    t.windSpeed = +(base + rndVal(-0.7, 0.7)).toFixed(1);
    t.power = Math.round(Math.pow(Math.max(t.windSpeed, 0), 3) * 1.9);
    t.rotorSpeed = +(t.windSpeed * 1.8).toFixed(1);

    const s = t.sensors;

    // —— 锚索张力：正常波动；故障期间维持高位；超限事件触发 ——
    if (t.faultLeft > 0) {
      t.faultLeft--;
      t.cableBoost = 0.45 + Math.random() * 0.15;
      t.status = '故障';
      s.cable.points.forEach((p, i) => pushPoint(p, 3200 + Math.round(rndVal(0, 300)) + i * 60));
    } else {
      t.cableBoost = 0;
      t.status = Math.random() < 0.8 ? '运行' : '待机';
      s.cable.points.forEach((p, i) => pushPoint(p, 1800 + Math.round(rndVal(0, 500)) + i * 60));
      if (Math.random() < 0.08) {          // 约8%概率触发持续8秒超限告警
        t.faultLeft = 4;
        t.status = '故障';
        t.cableBoost = 0.45 + Math.random() * 0.15;
        s.cable.points.forEach((p, i) => pushPoint(p, 3200 + Math.round(rndVal(0, 300)) + i * 60));
      }
    }

    // —— 其余 5 类传感器：测点级波动 + 微弱漂移 ——
    s.vib.points.forEach((p, i) => pushPoint(p, 0.1 + rndVal(0, 0.4) + i * 0.1));
    s.tilt.points.forEach((p, i) => pushPoint(p, 0.2 + rndVal(0, 0.8) + i * 0.2));
    s.strain.points.forEach((p, i) => pushPoint(p, 80 + Math.round(rndVal(0, 150)) + i * 40));
    s.gap.points.forEach((p, i) => pushPoint(p, 8 + rndVal(0, 10) + i * 1.2));
    s.settle.points.forEach((p, i) => pushPoint(p, 2 + rndVal(0, 4) + i * 1.0));
  });
}, 2000);

// —— 工具：某传感器全部测点的"当前最大值/是否超限"（供 UI/告警/结构计算使用） ——
window.sensorMax = function (sensors, key) {
  const pts = sensors[key].points;
  const m = Math.max.apply(null, pts.map((p) => p.val));
  return { val: m, limit: sensors[key].limit, over: m > sensors[key].limit };
};

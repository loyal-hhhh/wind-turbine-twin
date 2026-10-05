// ============ 多风机数据模拟器（每台独立 6 类传感器 + 独立告警） ============
// 传感器量程来自《华能西安热工院风电塔筒监测方案》：
//   振动 JBA22×2（±2g）  倾斜 JQIN-04×2（±15°）
//   锚索张力 JQM10×4（0~3710.7kN）  应变 CK-BYB-230×4（±3000με）
//   开合度 CK-CF-5MM×8（5~100mm）   沉降 CK-CJ-100×3（0~100mm）
// limit = 量程的 80%（超过即告警变红）
// 说明：目前是模拟数据。接入真实数据时，把这里替换为 fetch(data.json) 即可，
//       字段结构与 window.TWIN_DATA.turbines 完全一致（见 README 数据模板）。

const STATUS_COLOR = { '运行': '#2e7d32', '待机': '#f9a825', '故障': '#c62828' };

function mkSensors() {
  return {
    vib:    { val: 0.15, unit: 'g',  limit: 1.6 },      // 振动
    tilt:   { val: 0.30, unit: '°',  limit: 12 },       // 倾斜
    cable:  { val: 2000, unit: 'kN', limit: 2968.6 },   // 锚索张力
    strain: { val: 120,  unit: 'με', limit: 2400 },     // 应变
    gap:    { val: 12.5, unit: 'mm', limit: 80 },       // 开合度
    settle: { val: 3.2,  unit: 'mm', limit: 80 }        // 沉降
  };
}

function mkTurbine(wf) {
  return {
    id: wf.id, name: wf.name,
    windSpeed: 8, power: 2000, rotorSpeed: 10,
    status: '运行', statusColor: STATUS_COLOR,
    sensors: mkSensors(),
    faultLeft: 0   // 故障保持计数（8秒后自动恢复，方便演示）
  };
}

window.TWIN_DATA = {
  turbines: window.WIND_FARMS.map(mkTurbine)
};
window.SELECTED = 0;   // 当前选中风机索引（点击风机或下拉切换）

setInterval(() => {
  window.TWIN_DATA.turbines.forEach((t) => {
    // 全场共用一个风速场，各台加小幅偏差（更真实）
    const base = 5 + Math.random() * 10;
    t.windSpeed = +(base + (Math.random() - 0.5) * 1.5).toFixed(1);
    t.power = Math.round(Math.pow(Math.max(t.windSpeed, 0), 3) * 1.9);
    t.rotorSpeed = +(t.windSpeed * 1.8).toFixed(1);

    // —— 传感器正常小幅波动 ——
    t.sensors.vib.val    = +(0.1 + Math.random() * 0.4).toFixed(2);
    t.sensors.tilt.val   = +(0.2 + Math.random() * 0.8).toFixed(2);
    t.sensors.strain.val = Math.round(80 + Math.random() * 150);
    t.sensors.gap.val    = +(8 + Math.random() * 10).toFixed(1);
    t.sensors.settle.val = +(2 + Math.random() * 4).toFixed(2);

    if (t.faultLeft > 0) {
      // 保持超限状态（锚索张力维持高位）
      t.faultLeft--;
      t.sensors.cable.val = 3200 + Math.round(Math.random() * 300);
      t.status = '故障';
    } else {
      t.sensors.cable.val = Math.round(1800 + Math.random() * 500);
      t.status = Math.random() < 0.8 ? '运行' : '待机';
      // 约8%概率触发一次持续8秒的锚索张力超限告警（演示用）
      if (Math.random() < 0.08) {
        t.faultLeft = 4;   // 4个周期 × 2秒 = 持续8秒
        t.sensors.cable.val = 3200 + Math.round(Math.random() * 300);
        t.status = '故障';
      }
    }
  });
}, 2000);

// AI 代理模型训练数据生成：复用正演力学模型（computeDamageAnalysis + strainProfile）
// 固定基准风速 12m/s；输入 = 13 测点应变比 + 基频比（14 维）；输出 = (a, d)
const fs = require('fs');
const path = require('path');
global.window = {};
const root = path.join(__dirname, '..', 'js');
eval(fs.readFileSync(path.join(root, 'structure_v13_5.js'), 'utf8'));

const V = 12;
const H = window.DAMAGE ? window.DAMAGE.H : 133.5;
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

// 健康塔基准（d=0）：应变剖面 + 基频
const eps0 = window.strainProfile(V, { d: 0 });
const f0 = window.computeDamageAnalysis(V, { d: 0 }).f0;

const NA = 41, ND = 31, NOISE = 5;   // d 步长 0.03（细分健康区间）
const X = [], Y = [];
for (let ia = 0; ia < NA; ia++) {
  const a = (H / (NA - 1)) * ia;
  for (let id = 0; id < ND; id++) {
    const d = (0.9 / (ND - 1)) * id;
    const r0 = window.computeDamageAnalysis(V, { a, d });
    const epsD = window.strainProfile(V, { a, d });
    for (let n = 0; n < NOISE; n++) {
      // 传感器噪声：应变 ±2%，频率 ±0.3%
      const epsN = epsD.map(e => e * (1 + rnd(-0.02, 0.02)));
      const fN = r0.fd * (1 + rnd(-0.003, 0.003));
      const x = [];
      const R = epsN.map((e, i) => e / eps0[i]);                         // 应变比剖面
      for (let i = 0; i < R.length; i++) x.push(R[i]);
      // 峰值派生特征：高度 / 位置 / 全局水平 / 平坦度
      const rmax = Math.max(...R) - 1;
      const imax = R.indexOf(Math.max(...R)) / (R.length - 1);
      const rmean = R.reduce((s, v) => s + v, 0) / R.length - 1;
      const rstd = Math.sqrt(R.reduce((s, v) => s + (v - 1 - rmean) ** 2, 0) / R.length);
      x.push(rmax, imax, rmean, rstd);
      x.push(fN / f0);                                                    // 基频比
      X.push(x);
      Y.push(d < 1e-6 ? [0, 0] : [a, d]);   // 健康样本位置输出 0（无损伤）
    }
  }
}
fs.writeFileSync(path.join(__dirname, 'train.json'), JSON.stringify({ X, Y }));
console.log('样本数:', X.length, '特征维:', X[0].length, '样本示例输出:', Y[0], Y[Y.length-1]);

// ============ 结构力学响应计算模块（v9 杆系单元法） ============
// 依据《蒙城F12风机混塔测试、计算与分析报告》：
//   混凝土塔筒 131m + 过渡段 1.8m + 钢塔筒 27m，塔架总高约 138.1m
//   混凝土段 35 节共 104.7m（底外径 8385mm → 顶外径 4540mm 渐变）
//   叶轮直径 166m，额定 4.2MW；混凝土 C75（设计抗压 33.8MPa）、钢材 Q355（屈服 355MPa）
// 简化模型（杆系单元法）：
//   塔体离散为 14 段杆单元（混凝土 10 段 + 过渡 1 段 + 钢 3 段），
//   按悬臂结构计算各段轴力 N、弯矩 M → 截面应力 σ = N/A + M/W → 应力比校核
//   荷载：顶部机舱轮毂自重 2500kN + 叶片推力（风） + 塔身分布风载
//   输出：各段应力比、塔顶位移、最大应力位置、剩余寿命估算
// 注：壁厚/钢段顶径图纸未给出处按工程典型值估算，已在代码中标注。

// —— 塔体几何（米） ——
const GEOM = {
  totalH: 138.1,          // 塔架总高（不含机舱）
  hubH: 142.0,            // 轮毂中心高度（估算：塔顶 + 机舱高约4m）
  concreteH: 104.7,       // 混凝土段高
  transH: 1.8,            // 过渡段高
  steelH: 27.0,           // 钢段高
  Dbase: 8.385,           // 混凝土底外径
  DtransTop: 4.54,        // 混凝土顶/过渡段外径
  DsteelTop: 3.2,         // 钢段顶外径（估算值）
  wallCbase: 0.35,        // 混凝土底壁厚（估算典型值）
  wallCtop: 0.18,         // 混凝土顶壁厚（估算典型值）
  wallTrans: 0.05,        // 过渡段壁厚（估算）
  wallSteel: 0.030,       // 钢段壁厚（估算典型值）
  topLoad: 2500           // 机舱+轮毂+叶片自重 kN（约250t）
};

// —— 材料（MPa） ——
const MAT = {
  fc: 33.8,               // C75 混凝土设计抗压强度
  fy: 355,                // Q355 屈服强度
  fcAllow: 18.6,          // 混凝土容许压应力（0.55×fc，长期荷载折减）
  steelAllow: 213,        // 钢材容许应力（0.6×fy）
  gc: 25.0,               // 混凝土容重 kN/m³
  gs: 78.5,               // 钢材容重 kN/m³
  Ec: 36000,              // C75 混凝土弹性模量 MPa（高强混凝土典型值）
  Es: 206000              // Q355 钢材弹性模量 MPa
};

// —— 风参数 ——
const WIND = {
  rho: 1.225,             // 空气密度 kg/m³
  Ct: 0.55,               // 叶片推力系数（估算）
  Cd: 0.7,                // 塔身阻力系数
  rotorA: Math.PI / 4 * 166 * 166   // 叶轮扫掠面积 m²
};

// —— 构建 14 段杆系（从底到顶） ——
function buildSegments() {
  const segs = [];
  let z0 = 0;
  // 混凝土 10 段
  const ch = GEOM.concreteH / 10;
  for (let i = 0; i < 10; i++) {
    const zc = (z0 + ch / 2) / GEOM.concreteH;            // 段内相对高度 0~1
    const D = GEOM.Dbase + (GEOM.DtransTop - GEOM.Dbase) * zc;
    const wall = GEOM.wallCbase + (GEOM.wallCtop - GEOM.wallCbase) * zc;
    segs.push({ z0: z0, z1: z0 + ch, D: D, wall: wall, mat: 'c' });
    z0 += ch;
  }
  // 过渡段 1 段
  segs.push({ z0: z0, z1: z0 + GEOM.transH, D: GEOM.DtransTop, wall: GEOM.wallTrans, mat: 's' });
  z0 += GEOM.transH;
  // 钢段 3 段
  const sh = GEOM.steelH / 3;
  for (let i = 0; i < 3; i++) {
    const zc = (z0 - GEOM.concreteH - GEOM.transH) / GEOM.steelH;   // 0~1
    const D = GEOM.DtransTop + (GEOM.DsteelTop - GEOM.DtransTop) * zc;
    segs.push({ z0: z0, z1: z0 + sh, D: D, wall: GEOM.wallSteel, mat: 's' });
    z0 += sh;
  }
  return segs;
}

// 环形截面特性
function ring(D, wall) {
  const d = D - 2 * wall;
  const A = Math.PI / 4 * (D * D - d * d);
  const I = Math.PI / 64 * (Math.pow(D, 4) - Math.pow(d, 4));
  const W = I / (D / 2);
  return { A: A, I: I, W: W };
}

// —— 主计算：输入风速 v（m/s）、锚索超限放大系数 cableBoost（0~1） ——
// 返回 { segments:[{z0,z1,D,wall,mat,N,M,sigma,ratio,allow,status}],
//         topDisp, dispAllow, maxRatio, maxSeg, lifeLeft, damage, health }
window.computeStructure = function (v, cableBoost) {
  const segs = buildSegments();
  const H = GEOM.totalH;

  // 1) 荷载
  const T = 0.5 * WIND.rho * v * v * WIND.rotorA * WIND.Ct / 1000;   // 叶片推力 kN（作用于轮毂）
  // 2) 每段几何 + 自重 + 塔身风载
  segs.forEach((sg) => {
    const r = ring(sg.D, sg.wall);
    sg.A = r.A; sg.I = r.I; sg.W = r.W;
    const dens = sg.mat === 'c' ? MAT.gc : MAT.gs;
    sg.selfW = dens * r.A * (sg.z1 - sg.z0) / 1000;        // 段自重 kN（A m² × 高 m × kN/m³）
    const zm = (sg.z0 + sg.z1) / 2;
    sg.q = 0.5 * WIND.rho * v * v * sg.D * WIND.Cd * (sg.z1 - sg.z0) / 1000;  // 段风载 kN
    sg.zm = zm;
  });

  // 3) 内力：自顶向下累计（悬臂）
  let N_top = GEOM.topLoad;          // 顶部集中（机舱+轮毂+叶片）
  let M_top = 0;
  let F_above = 0;                   // 该截面以上全部水平力（用于剪应力）
  // 先算各段中点以上累计
  const upN = new Array(segs.length).fill(0);
  const upM = new Array(segs.length).fill(0);
  const upF = new Array(segs.length).fill(0);
  // 从顶向下：N(截面 i 底) = topLoad + Σ自重(段 i..顶)
  let accN = N_top, accF = 0;
  // 弯矩：所有上部水平力 × 到截面 i 底的力臂
  // 逐段从顶向下累计（简化：把段风载集中到段中点）
  for (let i = segs.length - 1; i >= 0; i--) {
    const sg = segs[i];
    const zBot = sg.z0;
    // 截面 i 底的轴力 = 顶部集中 + 上方所有段自重（含本段）
    accN += sg.selfW;
    upN[i] = accN;
    // 截面 i 底的弯矩 = 叶片推力×力臂 + 上方各段风载×力臂
    let M = T * (GEOM.hubH - zBot);
    for (let j = segs.length - 1; j >= i; j--) {
      M += segs[j].q * (segs[j].zm - zBot);
    }
    upM[i] = M;
    accF += sg.q;
    upF[i] = accF;
  }
  // 总水平力（顶部）
  const totalF = T + segs.reduce((a, s) => a + s.q, 0);

  // 4) 应力：σ = N/A + M/W（kN/m² → MPa 需 ÷1000）；锚索超限 → 预应力损失放大弯矩
  const boost = 1 + 0.35 * (cableBoost || 0);
  let maxRatio = 0, maxSeg = null;
  segs.forEach((sg, i) => {
    sg.N = upN[i];
    sg.M = upM[i] * boost;
    sg.sigma = (sg.N / sg.A + sg.M / sg.W) / 1000;         // 压应力 MPa
    sg.tau = (T + upF[i]) / sg.A / 1000;                   // 平均剪应力 MPa（简化）
    sg.allow = sg.mat === 'c' ? MAT.fcAllow : MAT.steelAllow;
    sg.ratio = sg.sigma / sg.allow;
    sg.status = sg.ratio > 1 ? '超限' : (sg.ratio > 0.8 ? '预警' : '正常');
    if (sg.ratio > maxRatio) { maxRatio = sg.ratio; maxSeg = sg; }
  });

  // 5) 塔顶位移（悬臂挠度：集中力 + 分布力，等效 EI 取混凝土底部 5 段均值）
  //    E 单位 MPa = 1000 kN/m²，故 EI = E_MPa × 1000 × I(m⁴)
  const EI = (segs.slice(0, 5).reduce((a, s) => a + (s.mat === 'c' ? MAT.Ec : MAT.Es) * s.I, 0) / 5) * 1000;
  const qEq = segs.reduce((a, s) => a + s.q, 0) / H;       // 等效均布 kN/m
  const topDisp = (T * Math.pow(H, 3) / (3 * EI) + qEq * Math.pow(H, 4) / (8 * EI)) * 1000; // m→mm
  const dispAllow = H / 100 * 1000;                        // 容许位移 H/100（mm）

  // 6) 剩余寿命（简化疲劳损伤模型，演示用）：
  //    每个计算周期代表 1 天，损伤增量随应力比非线性增长；锚索超限加速
  const dmgInc = 0.0006 + 0.004 * Math.max(0, maxRatio - 0.6) * Math.max(0, maxRatio - 0.6)
    + 0.0015 * (cableBoost || 0);
  window._dmg = (window._dmg || 0) + dmgInc;
  const damage = Math.min(window._dmg, 1.2);
  const lifeLeft = Math.max(0, (1 - damage) * 25);        // 设计寿命 25 年
  const health = maxRatio < 0.8 && damage < 0.8;

  return {
    segments: segs, topDisp: +topDisp.toFixed(1), dispAllow: dispAllow,
    maxRatio: +maxRatio.toFixed(2), maxSeg: maxSeg ? '高程 ' + maxSeg.zm.toFixed(1) + 'm' : '--',
    maxSigma: maxSeg ? +maxSeg.sigma.toFixed(1) : 0,
    damage: +damage.toFixed(3), lifeLeft: +lifeLeft.toFixed(1), health: health,
    boost: boost
  };
};

// 应力比 → 颜色（供 3D 应力柱使用）
window.ratioColor = function (r) {
  if (r > 0.8) return 0xff5252;      // 红：超限/预警
  if (r > 0.5) return 0xffd54f;      // 黄：偏高
  return 0x3dd68c;                   // 绿：正常
};

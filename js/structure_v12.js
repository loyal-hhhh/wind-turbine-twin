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

// ============================================================
// ===== 环段损伤分析模块（v10 · 经典梁理论）====================
// 依据《风电混塔环段损伤后的响应与疲劳分析》方法论：
//   - 变截面悬臂梁（Euler–Bernoulli），塔底固接，钢/混连续
//   - 环段损伤 = 局部抗弯刚度退化 B(z)=B0(z)·(1−d)，起点 a、长度 ℓ
//   - 静力位移：单位荷载法（静定弯矩与损伤无关）
//   - 一阶频率：Rayleigh–Ritz 单模态（φ(ξ)=ξ², ξ=z/H）
//   - 风振响应：简谐脉动荷载稳态幅值（动力放大系数）
//   - 疲劳：选定钢段焊缝截面 → S–N（Δσ³·N=C）→ Miner 年消耗
// 单位统一 SI：m、N、Pa、kg、s
// ============================================================

// —— 沿高几何/材料网格（N 层，塔高取杆系结构高 133.5m） ——
const DAMAGE = {
  N: 240,                     // 网格层数
  H: GEOM.concreteH + GEOM.transH + GEOM.steelH,   // 结构塔高 133.5m
  zSteel: GEOM.concreteH + GEOM.transH,            // 钢段底高程（疲劳评价焊缝处）
  Mt: GEOM.topLoad * 1000 / 9.81,                  // 机舱+叶轮等效质量 kg
  hYear: 2500,                // 年等效运行小时（额定等效，h）
  C: 1.458e12,                // S–N 常数：90MPa 细节 @2e6 循环（C=Δσc³·Nc）
  m: 3.0,                     // S–N 斜率（钢焊缝典型 m=3）
  Dpast: 0.0                  // 既有累积损伤（Miner，未知时取 0）
};

// 环段损伤分析参数（UI 可调，默认：损伤从底部 0.5H 处、长 6.7m、退化 0.3）
window.DMG_OPTS = {
  a: 66.75,      // 损伤起点高程 m
  len: 6.7,      // 损伤环段长度 m
  d: 0.30,       // 刚度退化率 0~0.9
  zeta: 0.02,    // 阻尼比（混塔典型 2%）
  exc: 0.25,     // 激励频率 Hz（叶轮 1P 附近）
  vRatio: 0.12   // 脉动风幅值 / 平均风
};

// 沿高参数：外径 D(z)、壁厚 t(z)、材质（与 buildSegments 同一几何）
function geomAt(z) {
  const zc = Math.min(Math.max(z, 0), GEOM.concreteH);
  const zcR = zc / GEOM.concreteH;
  if (z <= GEOM.concreteH) {
    return { D: GEOM.Dbase + (GEOM.DtransTop - GEOM.Dbase) * zcR,
             t: GEOM.wallCbase + (GEOM.wallCtop - GEOM.wallCbase) * zcR, mat: 'c' };
  }
  if (z <= GEOM.concreteH + GEOM.transH) {
    return { D: GEOM.DtransTop, t: GEOM.wallTrans, mat: 's' };
  }
  const zs = Math.min(Math.max(z - GEOM.concreteH - GEOM.transH, 0), GEOM.steelH);
  const zsR = zs / GEOM.steelH;
  return { D: GEOM.DtransTop + (GEOM.DsteelTop - GEOM.DtransTop) * zsR, t: GEOM.wallSteel, mat: 's' };
}

// 构建沿高网格：B0(z)、μ(z)、A(z)、I(z)、W(z)（损伤前）
function buildB0Grid() {
  const H = DAMAGE.H, N = DAMAGE.N;
  const g = [];
  for (let i = 0; i <= N; i++) {
    const z = H * i / N;
    const gm = geomAt(z);
    const d = gm.D - 2 * gm.t;
    const A = Math.PI / 4 * (gm.D * gm.D - d * d);
    const I = Math.PI / 64 * (Math.pow(gm.D, 4) - Math.pow(d, 4));
    const E = gm.mat === 'c' ? MAT.Ec * 1e6 : MAT.Es * 1e6;   // MPa → Pa
    const rho = gm.mat === 'c' ? 2500 : 7850;                // kg/m³
    g.push({ z: z, D: gm.D, A: A, I: I, W: I / (gm.D / 2),
             B: E * I, mu: rho * A, mat: gm.mat });
  }
  return g;
}

// 梯形积分 ∫[0,H] f dz
function trapz(f, grid) {
  let s = 0;
  for (let i = 0; i < grid.length - 1; i++) {
    s += (f(grid[i], i) + f(grid[i + 1], i + 1)) / 2 * (grid[i + 1].z - grid[i].z);
  }
  return s;
}

// 外荷载（与 computeStructure 同口径）：塔顶推力 F(N) + 塔身分布风载 q(z)(N/m)
function windLoad(v, grid) {
  const F = 0.5 * WIND.rho * v * v * WIND.rotorA * WIND.Ct;              // N
  const q = grid.map((p) => { const g = geomAt(p.z); return 0.5 * WIND.rho * v * v * g.D * WIND.Cd; });
  return { F: F, q: q };
}

// 弯矩 M(z)（静定，由平衡确定，与损伤无关）N·m
function bendingMoment(F, q, grid) {
  const H = DAMAGE.H, N = DAMAGE.N;
  return grid.map((p, i) => {
    let M = F * (H - p.z);
    // ∫[z,H] q(s)(s-z) ds
    for (let j = i; j < N; j++) {
      const s1 = grid[j].z, s2 = grid[j + 1].z;
      const q1 = q[j], q2 = q[j + 1];
      const f1 = q1 * (s1 - p.z), f2 = q2 * (s2 - p.z);
      M += (f1 + f2) / 2 * (s2 - s1);
    }
    return M;
  });
}

// 损伤塔刚度 Bd(z)
function Bdamaged(grid, a, len, d) {
  return grid.map((p) => (p.z >= a && p.z <= a + len) ? p.B * (1 - d) : p.B);
}

// —— 主计算：环段损伤分析 ——
// v: 风速 m/s；opts 覆盖 DMG_OPTS 任意项
window.computeDamageAnalysis = function (v, opts) {
  const o = Object.assign({}, window.DMG_OPTS, opts || {});
  const grid = buildB0Grid();
  const H = DAMAGE.H;
  const a = Math.min(Math.max(o.a, 0), H - 0.01);
  const len = Math.min(Math.max(o.len, 0.1), H - a);
  const d = Math.min(Math.max(o.d, 0), 0.9);
  const zeta = Math.max(o.zeta, 0.001);
  const Om = 2 * Math.PI * Math.max(o.exc, 0.01);          // 激励圆频率
  const va = Math.min(Math.max(o.vRatio, 0), 1);

  // 1) 荷载与弯矩（静定）
  const { F, q } = windLoad(v, grid);
  const M = bendingMoment(F, q, grid);
  const m = grid.map((p) => H - p.z);                       // 虚荷载：塔顶单位力

  // 2) 静力位移（单位荷载法）δ=∫M·m/B dz
  const B0 = grid.map((p) => p.B);
  const Bd = Bdamaged(grid, a, len, d);
  const delta0 = trapz((p, i) => M[i] * m[i] / B0[i], grid);
  const deltad = trapz((p, i) => M[i] * m[i] / Bd[i], grid);
  const dispRatio = deltad / delta0;

  // 3) 一阶频率（Rayleigh–Ritz，φ=ξ²，ξ=z/H）
  const phi = (p) => { const xi = p.z / H; return xi * xi; };
  const phi2 = (p) => 2 / (H * H);                          // φ''
  // k* = ∫B(φ'')² dz = (2/H²)²·∫B dz
  const kB0 = Math.pow(2 / (H * H), 2) * trapz((p, i) => B0[i], grid);
  const kBd = Math.pow(2 / (H * H), 2) * trapz((p, i) => Bd[i], grid);
  // m* = ∫μ·φ² dz + Mt·φ(H)² = ∫μ·ξ⁴ dz + Mt
  const mStar = trapz((p, i) => p.mu * Math.pow(p.z / H, 4), grid) + DAMAGE.Mt;
  const w0 = Math.sqrt(kB0 / mStar), wd = Math.sqrt(kBd / mStar);
  const f0 = w0 / (2 * Math.PI), fd = wd / (2 * Math.PI);
  const freqRatio = fd / f0;                                // √(kBd/kB0)

  // 4) 风振响应（简谐脉动：q_a=va·q，F_a=va·F）
  const Qstar = trapz((p, i) => va * q[i] * phi(p), grid) + va * F * 1;  // 模态力（塔顶 φ(H)=1）
  const r0 = Om / w0, rd = Om / wd;                         // 频率比 Ω/ω
  const DAF0 = 1 / Math.sqrt(Math.pow(1 - r0 * r0, 2) + Math.pow(2 * zeta * r0, 2));
  const DAFd = 1 / Math.sqrt(Math.pow(1 - rd * rd, 2) + Math.pow(2 * zeta * rd, 2));
  const xa0 = Qstar / kB0 * DAF0;                           // 塔顶位移幅 m（完整塔）
  const xad = Qstar / kBd * DAFd;                           // 损伤塔

  // 5) 疲劳应力：钢段底焊缝 z_s（评价对象）
  const zs = DAMAGE.zSteel;
  // 找到 zs 处网格点（插值）
  let is = 0;
  for (let i = 0; i < grid.length - 1; i++) if (grid[i].z <= zs && grid[i + 1].z >= zs) { is = i; break; }
  const fz = (zs - grid[is].z) / (grid[is + 1].z - grid[is].z);
  const Bzs = B0[is] + (B0[is + 1] - B0[is]) * fz;          // 损伤段不含 zs（钢段底之上）则同
  const Wzs = grid[is].W + (grid[is + 1].W - grid[is].W) * fz;
  const phi2zs = phi2(grid[is]);                            // 2/H²
  // 应力幅 σ_amp = B·φ''·xa / W（Mb≈B·φ''·x）
  const sig0 = Bzs * phi2zs * xa0 / Wzs;                    // Pa
  const sigd = Bzs * phi2zs * xad / Wzs;
  const dS0 = 2 * sig0 / 1e6, dSd = 2 * sigd / 1e6;         // 应力范围 MPa

  // 6) S–N → Miner 年疲劳消耗
  const N0c = DAMAGE.C / Math.pow(dS0, DAMAGE.m);           // 循环数
  const Ndc = DAMAGE.C / Math.pow(dSd, DAMAGE.m);
  const nYr = o.exc * 3600 * DAMAGE.hYear;                  // 年循环数（按激励频率计）
  const Dyr0 = nYr / N0c;
  const Dyrd = nYr / Ndc;
  const life0 = Math.max(0, (1 - DAMAGE.Dpast) / Dyr0);
  const lifed = Math.max(0, (1 - DAMAGE.Dpast) / Dyrd);
  const Rsig = dSd / dS0;                                   // 应力范围比
  const dRatio = Math.pow(Rsig, DAMAGE.m);                  // Dd/D0 ≈ Rσ^m

  return {
    // 输入回显
    a: +a.toFixed(1), len: +len.toFixed(1), d: +d.toFixed(2),
    zeta: zeta, exc: o.exc, v: v,
    // 刚度
    kRatio: +(kBd / kB0).toFixed(4),
    // 静力
    delta0: +delta0.toFixed(3), deltad: +deltad.toFixed(3),
    dispRatio: +dispRatio.toFixed(4), dispInc: +((dispRatio - 1) * 100).toFixed(2),
    // 频率
    f0: +f0.toFixed(4), fd: +fd.toFixed(4), freqRatio: +freqRatio.toFixed(4),
    // 风振
    r0: +r0.toFixed(3), rd: +rd.toFixed(3),
    DAF0: +DAF0.toFixed(3), DAFd: +DAFd.toFixed(3),
    xa0: +(xa0 * 1000).toFixed(1), xad: +(xad * 1000).toFixed(1),  // mm
    // 疲劳
    dS0: +dS0.toFixed(2), dSd: +dSd.toFixed(2), Rsig: +Rsig.toFixed(4),
    Dyr0: +Dyr0.toExponential(3), Dyrd: +Dyrd.toExponential(3),
    dRatio: +dRatio.toFixed(3),
    life0: +life0.toFixed(1), lifed: +lifed.toFixed(1),
    // 校核算例（等截面·塔顶力·ℓ/H=0.05·d=0.30）
    check: +(1 + (d / (1 - d)) * (1 - Math.pow(1 - len / H, 3))).toFixed(4)
  };
};

// —— 三条分析曲线（供损伤面板 ECharts）——
// 1) 位移比-损伤起点：a 从 0→H（固定 ℓ、d）
// 2) 频率比-退化率：d 从 0→0.9（固定 a、ℓ）
// 3) 动力放大-激励频率：Ω 扫描（完整塔 vs 损伤塔）
window.damageCurves = function (v) {
  const o = window.DMG_OPTS;
  const H = DAMAGE.H;
  // 曲线1：位移比 vs 损伤起点
  const c1 = [];
  for (let a = 0; a <= H - 0.5; a += H / 30) {
    const r = window.computeDamageAnalysis(v, { a: a });
    c1.push([+a.toFixed(1), r.dispRatio]);
  }
  // 曲线2：频率比 vs 退化率
  const c2 = [];
  for (let d = 0; d <= 0.9; d += 0.05) {
    const r = window.computeDamageAnalysis(v, { d: d });
    c2.push([+d.toFixed(2), r.freqRatio]);
  }
  // 曲线3：动力放大 vs 激励频率（0.05~1.5Hz）
  const c3i = [], c3d = [];
  for (let f = 0.05; f <= 1.5; f += 0.025) {
    const r0 = window.computeDamageAnalysis(v, { exc: f });
    c3i.push([+f.toFixed(3), r0.DAF0]);
    const rd = window.computeDamageAnalysis(v, { exc: f });
    c3d.push([+f.toFixed(3), rd.DAFd]);
  }
  return { c1: c1, c2: c2, c3i: c3i, c3d: c3d };
};

// ============================================================
// ===== 损伤反演模块（v12 · 传感器实测 → 损伤定位）============
// 原理：损伤段抗弯刚度 B(z)=B0(z)(1−d) 降低，在弯矩不变时该段
//       应变 ε(z)=M(z)·y(z)/B(z) 局部放大 1/(1−d)——这是损伤
//       定位的最强特征。沿高布置分布式应变阵列（13 测点），
//       实测应变剖面 ε_m(z) 与完整塔理论剖面 ε0(z) 的比值曲线
//       在损伤段出现峰值；配合实测基频辅助约束退化率。
// 反演：加权最小二乘网格搜索 (a,d)，误差 =
//       wε·Σ(Rε_pred(zᵢ)−Rε_obs(zᵢ))²/N + wF·(freqRatio−rF_obs)²
// ============================================================

// 分布式应变阵列测点高程（m）——沿高每 10m 一个，覆盖全塔
window.STRAIN_Z = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125];

// 应变剖面：返回测点应变响应幅（με，含 DAF 动态放大）
// ε(z) = M(z)·y(z)/B(z) × DAF × va（va=脉动幅值比），M 为静定弯矩
window.strainProfile = function (v, opts) {
  const o = Object.assign({}, window.DMG_OPTS, opts || {});
  const grid = buildB0Grid();
  const H = DAMAGE.H;
  const a = Math.min(Math.max(o.a, 0), H - 0.01);
  const len = Math.min(Math.max(o.len, 0.1), H - a);
  const d = Math.min(Math.max(o.d, 0), 0.9);
  const va = Math.min(Math.max(o.vRatio || window.DMG_OPTS.vRatio, 0), 1);
  const { F, q } = windLoad(v, grid);
  const M = bendingMoment(F, q, grid);
  const B0 = grid.map((p) => p.B);
  const Bd = Bdamaged(grid, a, len, d);
  const rd = window.computeDamageAnalysis(v, { a: a, len: len, d: d });
  return window.STRAIN_Z.map((z) => {
    let i = 0;
    for (let k = 0; k < grid.length - 1; k++) if (grid[k].z <= z && grid[k + 1].z >= z) { i = k; break; }
    const fz = (z - grid[i].z) / (grid[i + 1].z - grid[i].z);
    const Mz = M[i] + (M[i + 1] - M[i]) * fz;
    const Bz = Bd[i] + (Bd[i + 1] - Bd[i]) * fz;
    const yz = (grid[i].D / 2) + ((grid[i + 1].D / 2) - grid[i].D / 2) * fz;
    return +(Mz * yz / Bz * rd.DAFd * va * 1e6).toFixed(1);   // με
  });
};

// 反演主函数：obs = {f: 实测基频Hz, eps: [应变阵列 με]}
window.invertDamage = function (v, obs) {
  if (!obs || !(obs.f > 0) || !obs.eps || !obs.eps.length) return null;
  const H = DAMAGE.H;
  const o = window.DMG_OPTS;
  // 1) 完整塔基准
  const r0 = window.computeDamageAnalysis(v, { d: 0 });
  const f0 = r0.f0;
  const eps0 = window.strainProfile(v, { d: 0 });            // 完整塔应变剖面
  const rF_obs = obs.f / f0;                                 // 实测频率比
  const R_obs = obs.eps.map((e, i) => e / eps0[i]);          // 实测应变比剖面
  // 2) 网格搜索 a∈[0,H] 41 点 × d∈[0,0.9] 19 点
  const wEps = 0.7, wF = 0.3;
  const NA = 41, ND = 19;
  let errMin = Infinity, best = null;
  const gridRes = [];
  for (let ia = 0; ia < NA; ia++) {
    const a = H * ia / (NA - 1);
    for (let id = 0; id < ND; id++) {
      const d = 0.9 * id / (ND - 1);
      const r = window.computeDamageAnalysis(v, { a: a, d: d });
      const DAFr = r.DAFd / r.DAF0;
      let se = 0;
      window.STRAIN_Z.forEach((z, i) => {
        const inDmg = z >= a && z <= a + o.len;
        const Rpred = DAFr * (inDmg ? 1 / (1 - d) : 1);
        se += Math.pow(Rpred - R_obs[i], 2);
      });
      const e = wEps * se / window.STRAIN_Z.length + wF * Math.pow(r.freqRatio - rF_obs, 2);
      gridRes.push({ a: a, d: d, e: e });
      if (e < errMin) { errMin = e; best = { a: a, d: d }; }
    }
  }
  // 3) 不确定区域
  const th = 1.15 * errMin;
  const hits = gridRes.filter((g) => g.e <= th);
  const aMin = Math.min.apply(null, hits.map((h) => h.a));
  const aMax = Math.max.apply(null, hits.map((h) => h.a));
  const dMin = Math.min.apply(null, hits.map((h) => h.d));
  const dMax = Math.max.apply(null, hits.map((h) => h.d));
  // 4) 识别参数重算响应与寿命（寿命/应力按标准额定工况 12m/s 评估，保证跨风机可比；
  //    位移比/频率比等无量纲量本身与风速无关）
  const r = window.computeDamageAnalysis(12, { a: best.a, d: best.d, len: o.len });
  // 应变峰值信息（用于 UI 展示）
  const Rpeaks = R_obs.map((v2, i) => ({ z: window.STRAIN_Z[i], r: +v2.toFixed(3) }));
  const pk = Rpeaks.slice().sort((p, q) => q.r - p.r)[0];
  return {
    ok: true,
    aHat: +best.a.toFixed(1), dHat: +best.d.toFixed(2), err: +errMin.toExponential(3),
    rFobs: +rF_obs.toFixed(4),
    fObs: +obs.f.toFixed(4), f0: +f0.toFixed(4),
    aRange: [+aMin.toFixed(1), +aMax.toFixed(1)], dRange: [+dMin.toFixed(2), +dMax.toFixed(2)],
    hitN: hits.length,
    peakZ: pk.z, peakR: pk.r,
    dispRatio: +r.dispRatio.toFixed(4), freqRatio: +r.freqRatio.toFixed(4),
    DAFd: +r.DAFd.toFixed(2), dSd: +r.dSd.toFixed(1),
    life: +r.lifed.toFixed(1)
  };
};

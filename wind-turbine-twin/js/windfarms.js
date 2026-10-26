// ============ 风机机位配置（v9 随机布局 · 固定种子可复现） ============
// 10 台风机在 ±1400m 范围内随机分布，最小间距 500m（拒绝采样）
// 使用固定种子：无论刷新多少次，布局保持不变（答辩/演示稳定）
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261005);   // 种子固定
const wfs = [];
let guard = 0;
while (wfs.length < 10 && guard < 3000) {
  guard++;
  const x = Math.round((rnd() * 2 - 1) * 1400);
  const z = Math.round((rnd() * 2 - 1) * 1400);
  if (wfs.every((w) => Math.hypot(w.x - x, w.z - z) > 500)) {
    const no = (wfs.length + 1).toString().padStart(2, '0');
    wfs.push({ id: 'F' + no, name: 'F' + no, x: x, z: z });
  }
}
window.WIND_FARMS = wfs;
console.log('✅ 随机机位布局：', wfs.map((w) => w.name + '(' + w.x + ',' + w.z + ')').join(' '));

// ============ 托塔天王风电混塔数字孪生平台 —— 多风机场景核心 ============
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// 1. 场景 / 相机 / 渲染器（挂载到 #center）
const scene = new THREE.Scene();
const container = document.getElementById('center');
const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 20000);
camera.position.set(2200, 1000, 2500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 150, 300);
controls.maxPolarAngle = Math.PI / 2.05;   // 不允许钻到地下
controls.minDistance = 200;
controls.maxDistance = 9000;

// 2. 真实天空（Preetham 大气散射模型，Three.js 官方 Sky 组件）
const sky = new Sky();
sky.scale.setScalar(8000);   // 足够大的天穹，把场景包住
scene.add(sky);
const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 3.5;      // 空气浑浊度（更低更通透）
skyUniforms['rayleigh'].value = 2.8;       // 瑞利散射（决定天空蓝度）
skyUniforms['mieCoefficient'].value = 0.003;
skyUniforms['mieDirectionalG'].value = 0.6;
const sunDir = new THREE.Vector3();
const sunPhi = THREE.MathUtils.degToRad(90 - 25);   // 太阳高度角 25°
const sunTheta = THREE.MathUtils.degToRad(200);     // 太阳方位角
sunDir.setFromSphericalCoords(1, sunPhi, sunTheta);
skyUniforms['sunPosition'].value.copy(sunDir);

// 2b. 程序化云层（fbm 噪声生成云纹理，贴在半透明天穹上，缓慢漂移）
function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(1024, 512);
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), cc = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  const fbm = (x, y) => {
    let v = 0, amp = 0.55, f = 4;
    for (let i = 0; i < 4; i++) { v += amp * noise(x * f, y * f); amp *= 0.5; f *= 2; }
    return v;
  };
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 1024; x++) {
      const n = fbm(x / 150 + 5, y / 150 + 5);
      const cloud = n > 0.62 ? Math.min(1, (n - 0.62) * 6) : 0;
      const i = (y * 1024 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(cloud * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const cloudMesh = new THREE.Mesh(
  new THREE.SphereGeometry(7900, 48, 24),
  new THREE.MeshBasicMaterial({ map: makeCloudTexture(), transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.BackSide, fog: false })
);
scene.add(cloudMesh);

// 3. 灯光（与太阳方向一致，白天光照）
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sunLight = new THREE.DirectionalLight(0xfff2dd, 1.7);
sunLight.position.copy(sunDir).multiplyScalar(900);
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.5);
fillLight.position.set(-900, 300, -700);
scene.add(fillLight);

// 4. 大气透视雾（远景微微发白，增强真实纵深）
scene.fog = new THREE.Fog(0xd9e7f3, 2500, 9000);

// 5. 真实地形（有厚度的土块）：
//    顶面 = 卫星影像 + 真实 DEM 高程起伏（CPU 顶点位移，与土体边缘精确贴合）
//    侧面 = 沿地形边缘一圈的土壁（厚 250m），底面 = 土层底部
//    侧视时是一块实心土体，不再是"一张纸"
const terrainTex = new THREE.TextureLoader().load('assets/terrain.jpg');
terrainTex.colorSpace = THREE.SRGBColorSpace;
terrainTex.anisotropy = 8;
const SOIL_DEPTH = 250;   // 土层厚度（米）
const RISE = 45;          // 顶面起伏幅度（真实±9m 放大 5 倍，答辩美观）

// 构建"顶面 + 侧面土壁 + 底面"的实心地形
function buildTerrain() {
  const imgLoader = new THREE.ImageLoader();
  imgLoader.load('assets/heightmap.png', (img) => {
    // 读高度图像素（0~255 灰度）
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    const hData = c2.getImageData(0, 0, img.width, img.height).data;

    const seg = 128;
    // —— 顶面：PlaneGeometry + 按高度图位移 z（几何 z 经旋转后=世界 y）——
    const topGeo = new THREE.PlaneGeometry(4300, 4300, seg, seg);
    const pos = topGeo.attributes.position;
    const uv = topGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const px = Math.min(img.width - 1, Math.max(0, Math.round(uv.getX(i) * (img.width - 1))));
      const py = Math.min(img.height - 1, Math.max(0, Math.round(uv.getY(i) * (img.height - 1))));
      const h01 = hData[(py * img.width + px) * 4] / 255;   // 0~1
      pos.setZ(i, (h01 - 0.5) * RISE);                       // 中心为0，±22.5m
    }
    topGeo.computeVertexNormals();
    const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: terrainTex, roughness: 1, metalness: 0 }));
    top.rotation.x = -Math.PI / 2;
    scene.add(top);

    // —— 侧面土壁：沿顶面边界一圈，从地表垂到底面 ——
    const sidePos = [];
    const sideIdx = [];
    const boundary = [];
    for (let j = 0; j <= seg; j++) boundary.push(j);                    // 北边 row0
    for (let i = 1; i <= seg; i++) boundary.push(i * (seg + 1) + seg);  // 东边 col=seg
    for (let j = seg - 1; j >= 0; j--) boundary.push(seg * (seg + 1) + j); // 南边 row=seg
    for (let i = seg - 1; i >= 1; i--) boundary.push(i * (seg + 1));    // 西边 col=0
    for (let k = 0; k < boundary.length - 1; k++) {
      const a = boundary[k], b = boundary[k + 1];
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
      const base = sidePos.length / 3;
      sidePos.push(ax, ay, az, bx, by, bz, bx, by, -SOIL_DEPTH, ax, ay, -SOIL_DEPTH);
      sideIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
    sideGeo.setIndex(sideIdx);
    sideGeo.computeVertexNormals();
    const side = new THREE.Mesh(sideGeo, new THREE.MeshStandardMaterial({
      color: 0x6b5236, roughness: 1, metalness: 0, side: THREE.DoubleSide
    }));
    side.rotation.x = -Math.PI / 2;
    scene.add(side);

    // —— 底面：土层底部 ——
    const bGeo = new THREE.PlaneGeometry(4300, 4300, seg, seg);
    const bPos = bGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) bPos.setZ(i, -SOIL_DEPTH);
    bGeo.computeVertexNormals();
    const bottom = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({
      color: 0x4a3a28, roughness: 1, metalness: 0, side: THREE.DoubleSide
    }));
    bottom.rotation.x = -Math.PI / 2;
    scene.add(bottom);

    console.log('✅ 实心地形构建完成（顶面起伏 ±' + (RISE / 2) + 'm，土层厚 ' + SOIL_DEPTH + 'm）');
  });
}
buildTerrain();

// 6. 多风机：加载一份 GLB，克隆到每个机位
const turbines = [];          // 每台：{ wf, group, bladeGroup, mats, model }
let bladesPaused = false;     // 空格键暂停/恢复
let bladeAxis = 'x';          // 全局旋转轴（可切换）
const loader = new GLTFLoader();
const modelCandidates = [
  'models/F12_turbine.glb',
  'models/F12-turbine.glb',
  'models/F12混塔.glb',
  'models/F12-混塔.glb'
];
let tryIdx = 0;

// 叶片识别：策略1按名字 → 策略2按几何形状（全部用【世界坐标】包围盒）
function findBladeMeshes(model, silent) {
  const named = [];
  model.traverse((o) => {
    if (o.isMesh && o.name && (o.name.includes('叶片') || o.name.includes('blade'))) named.push(o);
  });
  if (named.length) { if (!silent) console.log('✅ 按节点名识别叶片 ' + named.length + ' 个'); return named; }
  const geo = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const wb = new THREE.Box3().setFromObject(o);
    const sx = wb.max.x - wb.min.x, sy = wb.max.y - wb.min.y, sz = wb.max.z - wb.min.z;
    const len = Math.max(sx, sy, sz), wid = Math.min(sx, sy, sz);
    const worldY = (wb.max.y + wb.min.y) / 2;
    if (worldY > 90 && len > 50 && len > wid * 3) geo.push(o);
  });
  if (geo.length && !silent) console.log('✅ 按几何特征识别叶片 ' + geo.length + ' 个');
  return geo;
}

// 构建单台风机的叶片旋转组：旋转中心 = 轮毂（叶片包围盒最高点最小值 +1m）
// bladeGroup 直接挂 scene（世界坐标），x/z 取风机机位坐标
function buildBladeGroup(meshes, wf, tidx) {
  const g = new THREE.Group();
  let hubY = Infinity;
  meshes.forEach((m) => {
    const b = new THREE.Box3().setFromObject(m);
    hubY = Math.min(hubY, b.max.y);
  });
  hubY += 1;
  g.position.set(wf.x, hubY, wf.z);
  meshes.forEach((m) => g.attach(m));
  g.userData.tidx = tidx;   // 点击识别用
  scene.add(g);
  return g;
}

// 记录一台风机所有材质的原始颜色（超限变红后能恢复）
function collectMats(root) {
  const list = [];
  root.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m && !list.some((x) => x.mat === m)) list.push({ mat: m, color: m.color.getHex() });
      });
    }
  });
  return list;
}

function tryLoad() {
  if (tryIdx >= modelCandidates.length) {
    alert('模型加载失败！请确认 models 文件夹里有 .glb 文件（比如 F12_turbine.glb）');
    return;
  }
  const url = modelCandidates[tryIdx];
  loader.load(url, (gltf) => {
    const template = gltf.scene;
    const wfs = window.WIND_FARMS || [{ id: 1, name: 'F01', x: 0, z: 0 }];
    wfs.forEach((wf, i) => {
      const model = template.clone(true);        // 深克隆对象树（共享几何/材质）
      const group = new THREE.Group();
      group.position.set(wf.x, 0, wf.z);
      group.userData.tidx = i;
      group.add(model);
      scene.add(group);
      const bm = findBladeMeshes(model, i > 0);  // 只第一台打印识别日志
      let bladeGroup = null;
      if (bm.length) {
        bladeGroup = buildBladeGroup(bm, wf, i);
      } else if (i === 0) {
        console.warn('未找到叶片节点，模型不转。可告知我把叶片分组改名为"08_叶片"再导出');
      }
      turbines.push({ wf: wf, group: group, bladeGroup: bladeGroup, model: model, mats: collectMats(model) });
    });
    console.log('✅ 已部署 ' + turbines.length + ' 台风机（' + wfs.map((w) => w.name).join(' / ') + '）');
  }, undefined, () => {
    tryIdx++;
    tryLoad();
  });
}
tryLoad();

// 7. 动画循环：每台风机叶片独立旋转（转速随风速）+ 云层缓慢漂移
function animate() {
  requestAnimationFrame(animate);
  cloudMesh.rotation.y += 0.00004;   // 云层缓慢漂移
  if (!bladesPaused) {
    turbines.forEach((t) => {
      if (t.bladeGroup && window.TWIN_DATA) {
        const td = window.TWIN_DATA.turbines[t.wf.id - 1] || window.TWIN_DATA.turbines[0];
        t.bladeGroup.rotation[bladeAxis] += 0.01 * ((td.rotorSpeed || 10) / 10);
      }
    });
  }
  renderer.render(scene, camera);
}
animate();

// 调试工具（浏览器控制台直接输入）：
//   setBladeAxis("x"/"y"/"z")   —— 切换全局旋转轴
//   按空格键                    —— 暂停/恢复所有叶片
window.setBladeAxis = function (a) {
  if ('xyz'.indexOf(a) >= 0) { bladeAxis = a; console.log('🔧 旋转轴已切换为 ' + a); }
  else console.log('请输入 x / y / z');
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    bladesPaused = !bladesPaused;
    console.log(bladesPaused ? '⏸ 叶片已暂停（再按空格恢复）' : '▶ 叶片已恢复旋转');
  }
});

// 8. 窗口缩放自适应
window.addEventListener('resize', () => {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// 9. 点击任意风机 → 显示该机详情 + 切换为选中风机
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let partInfoTimer = null;

renderer.domElement.addEventListener('click', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length === 0) return;

  // 沿父链找到所属风机（group / bladeGroup 带 userData.tidx）
  let node = hits[0].object;
  let tidx = null;
  while (node) {
    if (node.userData && node.userData.tidx !== undefined) { tidx = node.userData.tidx; break; }
    node = node.parent;
  }
  if (tidx === null) return;

  const t = window.TWIN_DATA.turbines[tidx];
  const wf = window.WIND_FARMS[tidx];
  window.SELECTED = tidx;
  // 刷新下拉选择
  const sel = document.getElementById('turbineSel');
  if (sel) sel.value = String(tidx);

  const s = t.sensors;
  const over = [];
  if (s.vib.val > s.vib.limit) over.push('振动');
  if (s.tilt.val > s.tilt.limit) over.push('倾斜');
  if (s.cable.val > s.cable.limit) over.push('锚索张力');
  if (s.strain.val > s.strain.limit) over.push('应变');
  if (s.gap.val > s.gap.limit) over.push('开合度');
  if (s.settle.val > s.settle.limit) over.push('沉降');

  const card = document.getElementById('infoCard');
  card.innerHTML = '<b>' + wf.name + ' 风机</b><br><span>' +
    '状态：' + t.status + '（' + t.statusColor[t.status] + '）<br>' +
    '风速 ' + t.windSpeed + ' m/s · 功率 ' + t.power.toLocaleString() + ' kW · 转速 ' + t.rotorSpeed + ' rpm<br>' +
    '锚索张力 ' + s.cable.val + ' kN · 振动 ' + s.vib.val + ' g · 倾斜 ' + s.tilt.val + '°<br>' +
    (over.length ? '<span style="color:#ff5252">⚠ 超限项：' + over.join('、') + '</span>' : '<span style="color:#2e7d32">✔ 全部正常</span>') +
    '</span>';
  card.style.display = 'block';
  clearTimeout(partInfoTimer);
  partInfoTimer = setTimeout(() => { card.style.display = 'none'; }, 4000);
});

// 10. 多机告警联动：超限的风机变红 + 顶部横幅（带风机号）
const alertBar = document.getElementById('alertBar');
setInterval(() => {
  const td = window.TWIN_DATA.turbines;
  if (!td) return;
  const overList = [];
  turbines.forEach((t, i) => {
    const s = td[i].sensors;
    const items = [];
    if (s.vib.val > s.vib.limit) items.push('振动(' + s.vib.val + 'g)');
    if (s.tilt.val > s.tilt.limit) items.push('倾斜(' + s.tilt.val + '°)');
    if (s.cable.val > s.cable.limit) items.push('锚索张力(' + s.cable.val + 'kN)');
    if (s.strain.val > s.strain.limit) items.push('应变(' + s.strain.val + 'με)');
    if (s.gap.val > s.gap.limit) items.push('开合度(' + s.gap.val + 'mm)');
    if (s.settle.val > s.settle.limit) items.push('沉降(' + s.settle.val + 'mm)');
    if (items.length) overList.push({ name: td[i].name, items: items, tidx: i });
  });

  // 颜色恢复/变红
  turbines.forEach((t, i) => {
    const isOver = overList.some((o) => o.tidx === i);
    t.mats.forEach((x) => x.mat.color.set(isOver ? 0xff4444 : x.color));
  });

  if (overList.length) {
    alertBar.style.display = 'block';
    alertBar.innerHTML = '⚠ 告警：' + overList.map((o) => o.name + '-' + o.items.join('、')).join('；') + ' 超限，请立即检查！';
  } else {
    alertBar.style.display = 'none';
  }
}, 1000);

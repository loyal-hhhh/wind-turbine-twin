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
const RISE = 180;         // 顶面起伏幅度（丘陵草原：谷底~山脊高差约 140m，起伏明显）

// 地形高度采样（占位，heightmap 就绪后覆盖）：风机/名牌/应力柱按真实地表放置
window.TERRAIN = { getH: function () { return 0; } };

// 构建"顶面 + 侧面土壁 + 底面"的实心地形
function buildTerrain() {
  const imgLoader = new THREE.ImageLoader();
  imgLoader.load('assets/heightmap.png', (img) => {
    // 读取高度图像素（0~255 灰度）
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    const hData = c2.getImageData(0, 0, img.width, img.height).data;
    // 暴露地形高度采样：世界坐标 (x,z) → 地表 y（与顶面顶点位移同一公式）
    window.TERRAIN.getH = function (x, z) {
      const W = img.width, H = img.height;
      const px = Math.min(W - 1, Math.max(0, Math.round(((x / 2150 + 1) / 2) * (W - 1))));
      const py = Math.min(H - 1, Math.max(0, Math.round(((-z / 2150 + 1) / 2) * (H - 1))));
      const h01 = hData[(py * W + px) * 4] / 255;
      return (h01 - 0.5) * RISE;
    };

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
  g.position.set(wf.x, hubY + window.TERRAIN.getH(wf.x, wf.z), wf.z);
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
      const model = template.clone(true);        // 深克隆对象树（共享几何）
      // 材质独立克隆：每台风机可单独控制透明度/颜色（聚焦淡化、超限变红）
      model.traverse((o) => {
        if (o.isMesh) {
          if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
          else o.material = o.material.clone();
        }
      });
      const group = new THREE.Group();
      const terrainY = window.TERRAIN.getH(wf.x, wf.z);   // 塔底贴合地表
      group.position.set(wf.x, terrainY, wf.z);
      group.userData.tidx = i;
      group.add(model);
      // 隐形点击球：覆盖塔身+叶片范围（半径 115m），远景也能轻松点中风机
      // colorWrite:false → 渲染管线禁止写颜色，任何显卡下都绝对不可见（但射线可命中）
      const hitBall = new THREE.Mesh(
        new THREE.SphereGeometry(115, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          depthWrite: false, depthTest: false, colorWrite: false
        })
      );
      hitBall.position.set(0, 82, 0);
      group.add(hitBall);
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

// 7. 动画循环：每台风机叶片独立旋转（转速随风速）+ 云层缓慢漂移 + 聚焦相机平滑
function animate() {
  requestAnimationFrame(animate);
  cloudMesh.rotation.y += 0.00004;   // 云层缓慢漂移
  focusAnim();                       // 聚焦相机插值移动
  // 聚焦光环脉冲动画 + 名牌定时淡出
  if (focusMarker) {
    const t = Date.now() / 450;
    const s = 1 + 0.09 * Math.sin(t);
    focusMarker.ring2.scale.setScalar(s);
    focusMarker.ring2.material.opacity = 0.45 + 0.35 * Math.sin(t);
    if (focusMarker.label && focusMarker.fade > 0) {
      focusMarker.fade -= 0.03;   // 每帧 3%，约 0.5 秒淡完
      focusMarker.label.material.opacity = Math.max(0, focusMarker.fade);
    }
  }
  if (!bladesPaused) {
    turbines.forEach((t) => {
      if (t.bladeGroup && window.TWIN_DATA) {
        const td = window.TWIN_DATA.turbines[t.wf.id - 1] || window.TWIN_DATA.turbines[0];
        t.bladeGroup.rotation[bladeAxis] += 0.01 * ((td.rotorSpeed || 10) / 10);
      }
    });
  }
  controls.update();               // 每帧同步鼠标操作 → 聚焦/漫游全程可巡航
  renderer.render(scene, camera);
}
// 注意：animate() 启动移到文件末尾，避免聚焦变量声明前调用（TDZ 报错）

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

  // 单机聚焦：放大该风机，其余淡化，显示应力色柱
  if (window.focusTurbine) window.focusTurbine(tidx);

  const over = [];
  ['vib', 'tilt', 'cable', 'strain', 'gap', 'settle'].forEach((k) => {
    const m = window.sensorMax(t.sensors, k);
    if (m.over) over.push(k);
  });
  const nameMap = { vib: '振动', tilt: '倾斜', cable: '锚索张力', strain: '应变', gap: '开合度', settle: '沉降' };

  const card = document.getElementById('infoCard');
  card.innerHTML = '<b>' + wf.name + ' 风机（已聚焦）</b><br><span>' +
    '状态：' + t.status + '（' + t.statusColor[t.status] + '）<br>' +
    '风速 ' + t.windSpeed + ' m/s · 功率 ' + t.power.toLocaleString() + ' kW · 转速 ' + t.rotorSpeed + ' rpm<br>' +
    '锚索张力 ' + window.sensorMax(t.sensors, 'cable').val + ' kN · 应变 ' + window.sensorMax(t.sensors, 'strain').val + ' με · 沉降 ' + window.sensorMax(t.sensors, 'settle').val + ' mm<br>' +
    (over.length ? '<span style="color:#ff5252">⚠ 超限项：' + over.map((k) => nameMap[k]).join('、') + '</span>' : '<span style="color:#2e7d32">✔ 全部正常</span>') +
    '</span>';
  card.style.display = 'block';
  clearTimeout(partInfoTimer);
  partInfoTimer = setTimeout(() => { card.style.display = 'none'; }, 5000);
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
    const nm = { vib: '振动', tilt: '倾斜', cable: '锚索张力', strain: '应变', gap: '开合度', settle: '沉降' };
    const un = { vib: 'g', tilt: '°', cable: 'kN', strain: 'με', gap: 'mm', settle: 'mm' };
    ['vib', 'tilt', 'cable', 'strain', 'gap', 'settle'].forEach((k) => {
      const m = window.sensorMax(s, k);
      if (m.over) items.push(nm[k] + '(' + m.val + un[k] + ')');
    });
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

// 11. 单机聚焦：点击/选择风机 → 相机平滑放大聚焦 + 其余风机淡化 + 杆系应力色柱
let focusMode = false;
let focusIdx = -1;
let stressGroup = null;
let camTarget = null;
let lookTarget = null;

// 计算当前选中风机（或指定机）的结构响应
function computeNow(i) {
  const td = window.TWIN_DATA.turbines[i];
  if (!td) return null;
  return window.computeStructure(td.windSpeed, td.cableBoost);
}

// 单机透明度控制（材质已独立克隆）
function setTurbineOpacity(t, op) {
  t.group.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { m.transparent = true; m.opacity = op; });
    }
  });
}

// 构建杆系应力色柱（14 段，绿色→黄色→红色 按应力比）
function buildStressBar(i) {
  if (stressGroup) { scene.remove(stressGroup); stressGroup = null; }
  const res = computeNow(i);
  if (!res) return;
  const wf = window.WIND_FARMS[i];
  stressGroup = new THREE.Group();
  res.segments.forEach((sg, k) => {
    const h = sg.z1 - sg.z0;
    const geo = new THREE.CylinderGeometry(4.5, 4.5, h, 12);
    geo.translate(0, sg.z0 + h / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: window.ratioColor(sg.ratio), transparent: true, opacity: 0.78 });
    const m = new THREE.Mesh(geo, mat);
    m.userData.segIdx = k;
    stressGroup.add(m);
  });
  // 柱体放在风机旁 + 底座指示（贴地表）
  stressGroup.position.set(wf.x + 70, window.TERRAIN.getH(wf.x, wf.z), wf.z - 40);
  scene.add(stressGroup);
}

// 更新应力柱颜色（每 2s 调用）
function updateStressBar(i) {
  if (!stressGroup) return;
  const res = computeNow(i);
  if (!res) return;
  stressGroup.children.forEach((m) => {
    const sg = res.segments[m.userData.segIdx];
    if (sg) m.material.color.setHex(window.ratioColor(sg.ratio));
  });
}

// ===== 聚焦高亮标记：地面脉冲光环 + 空中风机名牌（Sprite 始终面向相机） =====
let focusMarker = null;   // { group, ring2, label }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 生成风机名牌文字（Sprite 贴图）
function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  // 半透明科技背景条
  ctx.fillStyle = 'rgba(8,32,66,0.82)';
  roundRect(ctx, 4, 4, 504, 88, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(93,176,255,0.95)';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, 504, 88, 14);
  ctx.stroke();
  // 左上角小发光点
  ctx.fillStyle = '#5db0ff';
  ctx.beginPath(); ctx.arc(28, 48, 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 46px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#7fd0ff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 262, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(180, 34, 1);   // 名牌缩小，不遮挡风机本体
  return sp;
}

function buildFocusMarker(i, showLabel) {
  removeFocusMarker();
  const wf = window.WIND_FARMS[i];
  const g = new THREE.Group();
  // 外光环（静态，科技蓝）
  const ring1 = new THREE.Mesh(
    new THREE.RingGeometry(48, 54, 64),
    new THREE.MeshBasicMaterial({ color: 0x5db0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.y = 1.6;
  // 内光环（脉冲动画）
  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(24, 29, 64),
    new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 2.2;
  g.add(ring1, ring2);
  const mk = { group: g, ring2: ring2, label: null, fade: 0 };
  // 空中名牌：只在"开始聚焦"（非聚焦→聚焦）时显示一次，聚焦中切换目标不再弹出
  if (showLabel) {
    const label = makeLabel(wf.name + ' 风机 · 聚焦中');
    label.position.set(0, 150, 0);
    g.add(label);
    mk.label = label;
    // 名牌 3 秒后自动淡出（地面光环常驻，避免长时间遮挡视线）
    mk.timer = setTimeout(() => {
      if (focusMarker === mk) mk.fade = 1;
    }, 3000);
  }
  g.position.set(wf.x, window.TERRAIN.getH(wf.x, wf.z), wf.z);
  scene.add(g);
  focusMarker = mk;
}

function removeFocusMarker() {
  if (focusMarker) {
    if (focusMarker.timer) clearTimeout(focusMarker.timer);
    scene.remove(focusMarker.group);
    focusMarker = null;
  }
}

// 聚焦到某台风机
window.focusTurbine = function (i) {
  if (i === undefined || !window.WIND_FARMS[i]) return;
  const first = !focusMode;        // 是否首次进入聚焦（名牌只显示这一次）
  focusMode = true; focusIdx = i;
  const wf = window.WIND_FARMS[i];
  // 相机目标：机位东南侧上方，拉近放大
  camTarget = new THREE.Vector3(wf.x + 620, 300, wf.z + 620);
  lookTarget = new THREE.Vector3(wf.x, 150, wf.z);
  document.getElementById('focusBtn').style.display = 'block';
  turbines.forEach((t, j) => setTurbineOpacity(t, j === i ? 1 : 0.28));
  buildStressBar(i);
  buildFocusMarker(i, first);   // 3D 高亮：光环常驻；名牌仅首次进入聚焦时出现一次
};

// 退出聚焦：相机回全景，恢复所有风机
window.exitFocus = function () {
  focusMode = false; focusIdx = -1;
  camTarget = new THREE.Vector3(2200, 1000, 2500);
  lookTarget = new THREE.Vector3(0, 150, 300);
  document.getElementById('focusBtn').style.display = 'none';
  turbines.forEach((t) => setTurbineOpacity(t, 1));
  if (stressGroup) { scene.remove(stressGroup); stressGroup = null; }
  removeFocusMarker();
};

// 相机平滑移动：快速过渡到位后释放控制权（不锁死鼠标漫游）
function focusAnim() {
  if (!camTarget) return;
  camera.position.lerp(camTarget, 0.15);       // 更快到位（每帧 15%）
  controls.target.lerp(lookTarget, 0.15);
  controls.update();
  // 距离足够近 → 释放插值，把相机完全交还给鼠标（OrbitControls）
  if (camera.position.distanceTo(camTarget) < 30 &&
      controls.target.distanceTo(lookTarget) < 30) {
    camTarget = null; lookTarget = null;
  }
}

// 聚焦状态下的应力柱实时刷新（每 2s）
setInterval(() => {
  if (focusMode && focusIdx >= 0) updateStressBar(focusIdx);
}, 2000);

// 启动动画循环（放到文件末尾：此时所有 let/const 声明均已初始化）
animate();

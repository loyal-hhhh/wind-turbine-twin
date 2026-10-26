// ============ 损伤建模 · 独立单风机 3D 沙盒（v13.2） ============
// 用途：工程师在滑块输入处直接查看"损伤情景"的三维可视化——
//      加载真实 F12 混塔 glb 模型，损伤段红色罩壳、起终点环线、
//      范围尺寸标注随 DMG_OPTS 实时联动。
// 边界：完全独立于平台主 3D 场景（#center）与传感器数据流，
//      仅消费全局参数 window.DMG_OPTS；不影响任何原有功能。
// =============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(function () {
  const container = document.getElementById('model3d');
  if (!container) return;

  // —— WebGL 不可用（如无 GPU 环境）时优雅降级，不影响页面 ——
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6f88a8;font-size:12px">当前环境不支持 WebGL，3D 沙盒不可用（请在浏览器中打开）</div>';
    window.__model3dUpdate = function () {
      const o = window.DMG_OPTS || {};
      const echo = document.getElementById('m_echo');
      if (echo) echo.textContent = 'a=' + (o.a || 66.75) + 'm · len=' + (o.len || 6.7) + 'm · d=' + (o.d || 0.3).toFixed(2) + ' · ζ=' + (o.zeta || 0.02) + ' · Ω=' + (o.exc || 0.25) + 'Hz';
    };
    window.__model3dResize = function () {};
    window.__model3dUpdate();
    return;
  }

  // 模型真实尺寸：塔高 H=133.5m；整体缩放 S（保持真实比例）
  const S = 0.085;
  const H = 133.5;
  const GEOM = { concreteH: 104.7, transH: 1.8, steelH: 27, Dbase: 8.385, DtransTop: 4.54, DsteelTop: 3.2 };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081528);
  scene.fog = new THREE.Fog(0x081528, 40, 90);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
  camera.position.set(16, 11, 22);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 4.6, 0);
  controls.maxPolarAngle = Math.PI / 2.02;
  controls.minDistance = 5;
  controls.maxDistance = 45;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  // —— 灯光 ——
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x22334a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(18, 30, 12);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5db0ff, 0.4);
  rim.position.set(-16, 10, -14);
  scene.add(rim);

  // —— 地面网格 + 基础盘 ——
  const grid = new THREE.GridHelper(22, 16, 0x2f5f9e, 0x1c3a63);
  grid.position.y = 0.02;
  scene.add(grid);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.2, 0.8, 32),
    new THREE.MeshStandardMaterial({ color: 0x3a5570, roughness: 0.85 })
  );
  base.position.y = 0.4;
  scene.add(base);

  // —— 加载真实 F12 混塔 glb 模型（与总览同源，候选回退一致） ——
  let modelRoot = null;
  const candidates = [
    'models/F12_turbine.glb',
    'models/F12-turbine.glb',
    'models/F12混塔.glb',
    'models/F12-混塔.glb'
  ];
  const loader = new GLTFLoader();
  const loadingHint = document.createElement('div');
  loadingHint.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6f88a8;font-size:12px;pointer-events:none';
  loadingHint.textContent = '正在加载 F12 风机模型…';
  container.style.position = 'relative';
  container.appendChild(loadingHint);

  let tryIdx = 0;
  function tryLoad() {
    if (tryIdx >= candidates.length) {
      loadingHint.textContent = '模型加载失败：请确认 models 文件夹含 .glb 文件';
      return;
    }
    const url = candidates[tryIdx];
    loader.load(url, (gltf) => {
      loadingHint.remove();
      modelRoot = gltf.scene;
      modelRoot.scale.set(S, S, S);
      modelRoot.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m && m.metalness !== undefined) m.roughness = 0.55; });
        }
      });
      scene.add(modelRoot);
      console.log('[损伤建模3D] 已加载模型: ' + url);
      const echo = document.getElementById('m_echo');
      if (echo) echo.textContent = '模型: ' + url.replace('models/', '') + '（与总览同源）';
      if (window.__model3dUpdate) window.__model3dUpdate();
    }, undefined, () => { tryIdx++; tryLoad(); });
  }
  tryLoad();

  // 塔筒某高程处外径（米）→ 场景单位
  function radiusAt(zM) {
    const z = Math.min(Math.max(zM, 0), H);
    const r = z <= GEOM.concreteH
      ? (GEOM.Dbase + (GEOM.DtransTop - GEOM.Dbase) * (z / GEOM.concreteH))
      : (z <= GEOM.concreteH + GEOM.transH
        ? GEOM.DtransTop
        : GEOM.DtransTop + (GEOM.DsteelTop - GEOM.DtransTop) * ((z - GEOM.concreteH - GEOM.transH) / GEOM.steelH));
    return r * S / 2;
  }

  // —— 损伤可视化组（滑块驱动） ——
  const dmgVis = new THREE.Group();
  scene.add(dmgVis);
  const labelTexCache = {};
  function makeLabel(text, color) {
    const key = text + color;
    if (labelTexCache[key]) return labelTexCache[key];
    const c = document.createElement('canvas');
    c.width = 320; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(8,22,40,.78)';
    const w = ctx.measureText(text).width;
    ctx.fillRect(8, 6, w + 20, 56);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.strokeRect(8, 6, w + 20, 56);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, 18, 46);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(2.8, 0.7, 1);
    labelTexCache[key] = sp;
    return sp;
  }

  window.__model3dUpdate = function () {
    const o = window.DMG_OPTS || {};
    const a = Math.min(Math.max(o.a || 66.75, 0), H - 0.1);
    const len = Math.min(Math.max(o.len || 6.7, 0.1), H - a);
    const d = Math.min(Math.max(o.d || 0.3, 0), 0.9);
    while (dmgVis.children.length) dmgVis.remove(dmgVis.children[0]);
    // 1) 损伤段半透明罩壳（不透明度 ∝ d）
    const Ra = radiusAt(a) + 0.16;
    const Rb = radiusAt(a + len) + 0.16;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(Rb, Ra, len * S, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.30 + 0.5 * d, side: THREE.DoubleSide, depthWrite: false })
    );
    shell.position.y = (a + len / 2) * S;
    dmgVis.add(shell);
    // 2) 起点/终点黄色环线
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.95 });
    [a, a + len].forEach((z) => {
      const R = radiusAt(z) + 0.26;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.1, 8, 40), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = z * S;
      dmgVis.add(ring);
    });
    // 3) 蓝色尺寸标注线（起点→终点）
    const pts = [new THREE.Vector3(radiusAt(a) + 1.6, a * S, 0), new THREE.Vector3(radiusAt(a + len) + 1.6, (a + len) * S, 0)];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.9 })
    );
    dmgVis.add(line);
    const ballMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff });
    pts.forEach((p) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), ballMat);
      ball.position.copy(p);
      dmgVis.add(ball);
    });
    // 4) 高程标签（起点 / 终点 / 退化率 / 全高）
    const labA = makeLabel('损伤起点 ' + a.toFixed(1) + 'm', '#ffd54f');
    labA.position.set(-radiusAt(a) - 1.8, a * S, 0);
    dmgVis.add(labA);
    const labE = makeLabel('终点 ' + (a + len).toFixed(1) + 'm', '#ffd54f');
    labE.position.set(-radiusAt(a + len) - 1.8, (a + len) * S, 0);
    dmgVis.add(labE);
    const labD = makeLabel('退化率 d=' + d.toFixed(2), '#ff8a8a');
    labD.position.set(radiusAt(a) + 1.8, (a + len / 2) * S, 0);
    dmgVis.add(labD);
    const labH = makeLabel('全高 ' + H.toFixed(1) + 'm', '#9fc3e8');
    labH.position.set(-radiusAt(H) - 1.8, H * S + 0.8, 0);
    dmgVis.add(labH);
    // 5) 参数回显（页面右栏）
    const echo = document.getElementById('m_echo');
    if (echo) echo.textContent = 'a=' + a.toFixed(1) + 'm · len=' + len.toFixed(1) + 'm · d=' + d.toFixed(2) + ' · ζ=' + (o.zeta || 0.02) + ' · Ω=' + (o.exc || 0.25) + 'Hz';
  };

  // —— 动画循环 ——
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // —— 尺寸自适应 ——
  function onResize() {
    if (!container.clientWidth) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);
  window.__model3dResize = onResize;

  // 初始渲染（等 DMG_OPTS 就绪）
  setTimeout(function () {
    onResize();
    if (window.__model3dUpdate) window.__model3dUpdate();
  }, 300);
})();

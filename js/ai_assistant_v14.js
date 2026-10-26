/* ============================================================
   AI 平台助手 v14：右下角悬浮智能助手
   - 点击浮窗弹出对话框，知识库问答（平台功能/识别原理/AI反演/寿命预测）
   - 快捷按键：导出维修指导书 / 损伤识别演示 / 平台使用指南 / AI 反演原理
   ============================================================ */
(function () {
  if (document.getElementById('aiFloatBtn')) return;
  var CSS = document.createElement('style');
  CSS.textContent = `
#aiFloatBtn{position:fixed;left:auto;top:auto;width:56px;height:56px;border-radius:50%;z-index:9999;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;
  background:radial-gradient(circle at 30% 25%,#3aa0ff,#0d5ecf 60%,#083a8c);border:1px solid rgba(120,200,255,.6);
  box-shadow:0 4px 18px rgba(20,90,200,.5),0 0 0 0 rgba(61,214,140,.5);display:flex;align-items:center;justify-content:center;transition:transform .15s}
#aiFloatBtn:hover{transform:scale(1.08)}
#aiFloatBtn.pulse{animation:aiPulse 2.4s infinite}
@keyframes aiPulse{0%{box-shadow:0 4px 18px rgba(20,90,200,.5),0 0 0 0 rgba(61,214,140,.45)}70%{box-shadow:0 4px 18px rgba(20,90,200,.5),0 0 0 16px rgba(61,214,140,0)}100%{box-shadow:0 4px 18px rgba(20,90,200,.5),0 0 0 0 rgba(61,214,140,0)}}
#aiFloatBtn .ico{font-size:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
#aiFloatBtn .dot{position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;background:#3dd68c;border:2px solid #06284e}
#aiChatBox{position:fixed;left:auto;top:auto;width:340px;max-height:430px;display:none;flex-direction:column;z-index:9998;
  background:linear-gradient(180deg,rgba(10,30,56,.98),rgba(6,20,40,.98));border:1px solid rgba(90,170,255,.45);border-radius:14px;
  box-shadow:0 8px 32px rgba(0,0,0,.55);overflow:hidden;font-size:12px;color:#cfe3ff}
#aiChatBox.open{display:flex}
#aiChatHead{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(90deg,rgba(21,74,140,.6),rgba(12,52,100,.4));border-bottom:1px solid rgba(90,170,255,.3)}
#aiChatHead .t{font-weight:bold;font-size:13px;color:#eaf6ff;letter-spacing:1px}
#aiChatHead .s{font-size:9px;color:#7fd0c0;border:1px solid rgba(61,214,140,.4);border-radius:8px;padding:0 6px}
#aiChatHead .x{margin-left:auto;cursor:pointer;color:#8fb3d9;font-size:14px;padding:0 4px}
#aiChatMsgs{flex:1;overflow-y:auto;padding:10px 12px;min-height:150px;max-height:230px;display:flex;flex-direction:column;gap:8px}
.aiMsg{max-width:86%;padding:7px 10px;border-radius:10px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.aiMsg.bot{background:rgba(14,48,90,.7);border:1px solid rgba(80,160,255,.25);align-self:flex-start;color:#d7e9ff}
.aiMsg.user{background:rgba(23,120,80,.55);border:1px solid rgba(61,214,140,.35);align-self:flex-end;color:#e6fff4}
#aiQuick{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-top:1px solid rgba(90,170,255,.22)}
#aiQuick .qk{font-size:10px;color:#9fd4ff;background:rgba(13,44,86,.75);border:1px solid rgba(80,160,255,.4);border-radius:12px;padding:3px 9px;cursor:pointer;transition:all .15s}
#aiQuick .qk:hover{background:rgba(29,78,140,.8);color:#fff;border-color:#5db0ff}
#aiChatInput{display:flex;gap:6px;padding:8px 10px;border-top:1px solid rgba(90,170,255,.22)}
#aiChatInput input{flex:1;background:rgba(6,24,46,.9);border:1px solid rgba(80,160,255,.35);border-radius:8px;color:#eaf6ff;font-size:12px;padding:7px 10px;outline:none}
#aiChatInput input:focus{border-color:#5db0ff}
#aiChatInput button{background:linear-gradient(180deg,#2f7fd0,#1f5f9e);border:1px solid #5db0ff;color:#fff;font-size:11px;padding:6px 12px;border-radius:8px;cursor:pointer}`;
  document.head.appendChild(CSS);

  var H = document.createElement('div');
  H.innerHTML = '<div id="aiFloatBtn" class="pulse" title="AI 平台助手"><span class="ico">🤖</span><span class="dot"></span></div>' +
    '<div id="aiChatBox">' +
    '<div id="aiChatHead"><span class="t">托塔·AI 助手</span><span class="s">在线</span><span class="x" id="aiChatClose">✕</span></div>' +
    '<div id="aiChatMsgs"></div>' +
    '<div id="aiQuick"></div>' +
    '<div id="aiChatInput"><input id="aiInp" placeholder="问我平台功能、识别原理…" /><button id="aiSend">发送</button></div>' +
    '</div>';
  document.body.appendChild(H);

  var btn = document.getElementById('aiFloatBtn'), box = document.getElementById('aiChatBox');
  var msgs = document.getElementById('aiChatMsgs'), inp = document.getElementById('aiInp');
  var quick = document.getElementById('aiQuick');

  // ===== 可拖拽浮窗（不吸附，自由移动；拖拽后单击仍可开合）=====
  var posX = window.innerWidth - 82, posY = window.innerHeight - 150;
  function clampPos() {
    posX = Math.max(6, Math.min(window.innerWidth - 62, posX));
    posY = Math.max(6, Math.min(window.innerHeight - 62, posY));
  }
  function applyPos() {
    clampPos();
    btn.style.left = posX + 'px';
    btn.style.top = posY + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    if (box.classList.contains('open')) {
      var bw = box.offsetWidth || 340, bh = box.offsetHeight || 320;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
      box.style.left = Math.max(6, posX - bw + 56) + 'px';
      box.style.top = Math.max(6, posY - bh - 10) + 'px';
      if (posX - bw + 56 < 6) box.style.left = '6px';
    }
  }
  window.addEventListener('resize', applyPos);
  applyPos();

  var dragging = false, moved = false, sx = 0, sy = 0;
  btn.addEventListener('pointerdown', function (e) {
    dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
  });
  btn.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    posX += dx; posY += dy;
    sx = e.clientX; sy = e.clientY;
    applyPos();
  });
  btn.addEventListener('pointerup', function (e) {
    dragging = false;
    if (!moved) { box.classList.contains('open') ? box.classList.remove('open') : openChat(); }
  });
  btn.addEventListener('click', function (e) { if (moved) e.preventDefault(); });

  function addMsg(who, text) {
    var d = document.createElement('div');
    d.className = 'aiMsg ' + who;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function openChat() { box.classList.add('open'); applyPos(); if (!msgs.children.length) welcome(); }
  document.getElementById('aiChatClose').onclick = function () { box.classList.remove('open'); };
  function send() {
    var q = inp.value.trim(); if (!q) return;
    addMsg('user', q); inp.value = '';
    setTimeout(function () { addMsg('bot', answer(q)); }, 260);
  }
  document.getElementById('aiSend').onclick = send;
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

  // ===== 快捷按键 =====
  var QUICK = [
    { t: '📄 导出维修指导书', fn: function () { addMsg('user', '导出维修指导书'); window.exportMaintenanceGuide ? window.exportMaintenanceGuide() : addMsg('bot', '正在生成维修指导书…'); } },
    { t: '🎯 损伤识别演示', fn: function () { addMsg('user', '运行损伤识别演示'); demoInvert(); } },
    { t: '📖 平台使用指南', fn: function () { addMsg('user', '平台使用指南'); addMsg('bot', KB.guide[0]); } },
    { t: '🤖 AI 反演原理', fn: function () { addMsg('user', 'AI反演原理'); addMsg('bot', KB.ai[0]); } }
  ];
  QUICK.forEach(function (q) {
    var b = document.createElement('span');
    b.className = 'qk'; b.textContent = q.t;
    b.onclick = q.fn;
    quick.appendChild(b);
  });

  function welcome() {
    addMsg('bot', '你好，我是托塔·AI 助手 🤖\n我可以帮你解答平台功能、损伤识别原理、AI 反演与寿命预测等问题，也可以直接为你导出维修指导书。\n\n试试下方的快捷按键，或直接输入问题：');
  }

  // ===== 知识库 =====
  var KB = {
    intro: ['托塔天王风电混塔数字孪生平台，面向风力发电机混凝土-钢混塔结构健康监测。\n\n包含五大模块：\n• 总览：全场 3D 场景、功率发电、风机状态\n• 结构监测：杆系力学响应 + 损伤识别（力学反演 & AI 反演）\n• 数据分析：全场健康统计、传感器状态分布\n• 设备巡检：六类传感器实时状态与目录\n• 损伤建模：独立计算沙盒 + 3D 损伤可视化'],
    invert: ['损伤识别原理：\n实测应变阵列剖面（沿塔高 13 个测点）＋基频，与力学模型预测网格（损伤起点 a × 退化率 d）做加权最小二乘反演（应变权重 0.7·频率 0.3），同时得到：\n• 损伤起点 a（m）\n• 退化率 d（刚度退化比例）\n• 剩余寿命（S-N 疲劳曲线 Δσ^m·N=C + Miner 累积）\n\n识别结果自动同步到 3D 损伤环与寿命预测。'],
    ai: ['AI 代理模型反演：\n18 维特征（13 测点应变比 + 峰值高度/位置/平坦度 + 基频比）输入 MLP 神经网络（18→96→96→2），毫秒级输出损伤起点与退化率，与力学网格反演形成双通道互校。\n\n模型由力学正演批量生成 6355 组样本训练，权重固化在前端，不依赖服务器。'],
    life: ['寿命预测口径：\n以 25 年设计寿命为基准，按 S-N 疲劳曲线 Δσ^m·N=C 与 Miner 线性累积计算等效剩余寿命；寿命统一按标准额定工况 12m/s 评估（跨风机可比），健康/低载工况按 25 年封顶。'],
    use: ['操作指南：\n• 底部五个按钮切换页面\n• 总览页顶部下拉框切换风机（选择即聚焦 3D）\n• 结构监测页「运行识别」手动反演，「实时自动」每 5 秒刷新\n• 结构监测页可查看 AI 代理模型反演对比卡片\n• 数据分析/设备巡检可看全场统计与传感器状态\n• 损伤建模页为独立计算沙盒（滑块输入 → 3D 可视化）\n• 总览页或 AI 助手可「导出维修指导书」'],
    guide: ['维修指导书导出：\n点击总览页「导出维修指导书」按钮，或 AI 助手快捷按键，系统会按当前聚焦风机的识别结果（损伤位置/退化率/剩余寿命/双通道判定）自动生成 Word 可打开的维修指导书并下载。'],
    data: ['传感器数据：\n平台模拟 10 台风机 × 六类传感器（应变/位移/加速度/锚索张力/基频/温湿度）实时监测，其中 F05、F07 预设了损伤工况（可通过风机下拉框切换到它们查看识别效果），其余风机为健康状态，识别结果会显示"未检出损伤"。'],
    health: ['健康判定标准：\n• 力学反演：退化率 dHat<0.10 或解不唯一 → 未检出损伤\n• AI 通道：应变剖面峰值信噪比门限（rmax<0.08）→ 未检出\n• 轻微（0.10~0.25）中度（0.25~0.45）重度（>0.45）'],
    export: ['导出命令已收到，正在按当前风机生成维修指导书…']
  };
  var RULES = [
    { k: ['导出', '维修指导书', '维修单', '指导书'], fn: function () { addMsg('bot', KB.export[0]); window.exportMaintenanceGuide ? window.exportMaintenanceGuide() : addMsg('bot', '导出功能不可用，请检查页面是否完整加载'); return null; } },
    { k: ['演示', '示例', '看效果', '识别一下'], fn: function () { demoInvert(); return null; } },
    { k: ['ai', 'AI', '智能', '神经网络', '机器学习', '代理'], a: KB.ai },
    { k: ['原理', '怎么识别', '识别原理', '反演', '反算', '定位'], a: KB.invert },
    { k: ['寿命', '还能用', '剩余', '多久'], a: KB.life },
    { k: ['数据', '传感器', '哪来', '来源', 'F05', 'F07', '健康'], a: KB.data },
    { k: ['健康', '判断', '标准', '阈值'], a: KB.health },
    { k: ['指南', '操作', '怎么用', '使用', '功能', '有哪些', '介绍'], a: KB.use },
    { k: ['介绍', '平台', '项目', '是什么', '托塔'], a: KB.intro }
  ];
  function answer(q) {
    for (var i = 0; i < RULES.length; i++) {
      var hit = false;
      for (var j = 0; j < RULES[i].k.length; j++) {
        if (q.indexOf(RULES[i].k[j]) !== -1) { hit = true; break; }
      }
      if (hit) {
        if (RULES[i].fn) { var r = RULES[i].fn(); return r === null ? null : r; }
        if (RULES[i].a) return RULES[i].a[0];
      }
    }
    return '我暂时没有理解这个问题。你可以试试：\n• 平台有哪些功能\n• 损伤识别原理\n• AI 反演是什么\n• 如何导出维修指导书\n• 运行损伤识别演示';
  }

  function demoInvert() {
    var sel = document.getElementById('turbineSel');
    if (sel) { sel.value = '6'; sel.dispatchEvent(new Event('change')); }
    if (window.switchView) window.switchView('structure');
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var ready = window.TWIN_DATA && window.TWIN_DATA.turbines && window.__runInvert && window.aiInvertDamage;
      if (ready && tries > 3) {
        clearInterval(timer);
        try { window.__runInvert(false); } catch (e) {}
        addMsg('bot', '已切换到 F07（预设损伤 20m · d=0.5）并运行识别。\n右侧识别面板可同时看到：\n• 力学反演：损伤起点/退化率/剩余寿命\n• AI 代理反演：毫秒级结果 + 双通道一致性');
      } else if (tries > 30) {
        clearInterval(timer);
        addMsg('bot', '演示环境未就绪，请稍后重试或手动切换到 F07 风机。');
      }
    }, 300);
  }
})();

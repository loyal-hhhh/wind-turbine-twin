/* ============================================================
   全局风机聚焦切换 v14：顶部下拉框，所有模块可用
   - 与总览页 turbineSel 双向同步
   - 默认聚焦 F07（演示损伤塔，打开即见 AI 反算数据）
   ============================================================ */
(function () {
  if (window.__globalFocusInit) return;
  window.__globalFocusInit = true;
  var DEMO_FOCUS = 6;            // F07 演示损伤塔（truth: a=20m, d=0.5）
  var timer = null;

  function syncFromGlobal() {
    var sel = document.getElementById('turbineSelG');
    if (!sel) return;
    var v = Number(sel.value);
    if (isNaN(v)) return;
    window.SELECTED = v;
    var s2 = document.getElementById('turbineSel');
    if (s2 && s2.options.length && s2.value !== String(v)) s2.value = String(v);
    if (window.focusTurbine) window.focusTurbine(v);
    // 结构监测页识别面板：切换风机后刷新实测读数（识别结果下次自动/手动运行更新）
    if (window.__invRefresh) window.__invRefresh();
    // 总览页聚焦提示
    var hint = document.getElementById('selHint');
    if (hint && window.WIND_FARMS) hint.textContent = '已聚焦 ' + (window.WIND_FARMS[v] || {}).name + '（点击"退出聚焦"返回全场）';
    // 刷新当前页图表数据
    if (window.__refreshCharts) window.__refreshCharts();
  }
  function syncToGlobal() {
    var s2 = document.getElementById('turbineSel');
    var sel = document.getElementById('turbineSelG');
    if (s2 && sel && s2.value !== sel.value) sel.value = s2.value;
  }

  function init() {
    var wf = window.WIND_FARMS;
    var sel = document.getElementById('turbineSelG');
    var s2 = document.getElementById('turbineSel');
    if (!wf || !sel) return false;
    if (!s2 || !s2.options.length) return false;      // 等总览下拉填充完成
    if (!sel.options.length) {
      wf.forEach(function (w, i) {
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = w.name;
        sel.appendChild(o);
      });
      sel.value = String(window.SELECTED || 0);
    }
    // 默认聚焦 F07 演示塔（仅在初始时）
    if (window.__demoApplied !== true) {
      window.__demoApplied = true;
      sel.value = String(DEMO_FOCUS);
      syncFromGlobal();
    }
    if (!sel.__bound) {
      sel.__bound = true;
      sel.addEventListener('change', syncFromGlobal);
      if (s2) s2.addEventListener('change', syncToGlobal);
      // 3D 点击风机时同步到全局下拉
      var orig = window.focusTurbine;
      if (orig && !window.__focusWrap) {
        window.__focusWrap = true;
        window.focusTurbine = function (idx) {
          var r = orig.apply(this, arguments);
          var g = document.getElementById('turbineSelG');
          if (g && g.value !== String(idx)) g.value = String(idx);
          return r;
        };
      }
    }
    return true;
  }
  document.addEventListener('DOMContentLoaded', function () {
    timer = setInterval(function () {
      if (init()) clearInterval(timer);
    }, 300);
    setTimeout(function () { if (timer) clearInterval(timer); }, 12000);   // 兜底停止
  });
})();

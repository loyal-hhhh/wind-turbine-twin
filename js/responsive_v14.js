/* ============================================================
   屏幕自适应 v14.4：极端小屏整体等比缩放兜底
   - 正常屏幕（≥1150×700）由 CSS 弹性布局自适应；
   - 过小屏幕按 1280×960 设计稿等比缩放，保证完整显示不截断。
   ============================================================ */
(function () {
  if (window.__respInit) return;
  window.__respInit = true;
  var app = document.getElementById('app');
  var DESIGN_W = 1280, DESIGN_H = 960;

  function apply() {
    var w = window.innerWidth, h = window.innerHeight;
    var s = 1;
    if (w < 1150 || h < 700) s = Math.min(w / DESIGN_W, h / DESIGN_H);
    s = Math.max(0.5, Math.min(1, s));
    if (app) {
      app.style.transformOrigin = 'top center';
      if (s < 1) {
        app.style.transform = 'scale(' + s + ')';
        app.style.margin = '0 auto';
        document.body.style.height = Math.round(DESIGN_H * s) + 'px';
        document.body.style.width = Math.round(DESIGN_W * s) + 'px';
      } else {
        app.style.transform = 'none';
        app.style.margin = '';
        document.body.style.height = '';
        document.body.style.width = '';
      }
      document.body.style.overflow = 'hidden';
    }
    // 触发图表 resize 重排
    window.dispatchEvent(new Event('resize'));
  }
  window.addEventListener('resize', apply);
  window.addEventListener('load', apply);
  setTimeout(apply, 600);
  setTimeout(apply, 1800);
})();

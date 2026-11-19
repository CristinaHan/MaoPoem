/* 星火 · 首次使用引导（三步：点诗句看详情 / 收藏 / 换一句）
   交互模型：遮罩挡住误触，高亮洞里露出真实按钮（点了就真的生效）；
   学习动作与推进解耦——点高亮诗句进详情时，由 app.js 的 show() 自动收起引导。 */
(function () {
  const DONE_KEY = "maoshi-guide-done";
  const phone = document.getElementById("app");
  const guide = document.getElementById("guide");
  if (!phone || !guide) return;

  const spot = document.getElementById("guide-spot");
  const finger = document.getElementById("guide-finger");
  const tip = document.getElementById("guide-tip");
  const textEl = document.getElementById("guide-text");
  const nextBtn = document.getElementById("guide-next");
  const skipBtn = document.getElementById("guide-skip");
  const shadeT = document.getElementById("shade-t");
  const shadeB = document.getElementById("shade-b");
  const shadeL = document.getElementById("shade-l");
  const shadeR = document.getElementById("shade-r");

  const PARTS = [spot, finger, tip, textEl, nextBtn, skipBtn, shadeT, shadeB, shadeL, shadeR];
  if (PARTS.some(function (el) { return !el; })) return; // HTML 与脚本对不上时整块跳过，不抛异常

  const STEPS = [
    { sel: "#excerpt-btn", text: "点击诗句，看全诗、写作背景与解读" },
    { sel: "#btn-home-save", text: "点这里，收藏正在读的这一句" },
    { sel: "#btn-next", text: "点「换一句」，就能读另一首" }
  ];
  let idx = -1;

  function homeVisible() {
    const home = document.getElementById("view-home");
    return !!home && !home.classList.contains("hidden");
  }

  function showHome() {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.add("hidden"); });
    const home = document.getElementById("view-home");
    if (home) home.classList.remove("hidden");
  }

  function place(i) {
    const target = document.querySelector(STEPS[i].sel);
    if (!target) return false;
    const pr = phone.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (!tr.width || !tr.height) return false;

    const pad = 10;
    const left = tr.left - pr.left - pad;
    const top = tr.top - pr.top - pad;
    const w = tr.width + pad * 2;
    const h = tr.height + pad * 2;

    spot.style.left = left + "px";
    spot.style.top = top + "px";
    spot.style.width = w + "px";
    spot.style.height = h + "px";
    finger.style.left = (left + w / 2) + "px";
    finger.style.top = (top + h / 2) + "px";

    // 四块遮罩拼出中间的洞（比超大 box-shadow 兼容，Android WebView 也稳）
    shadeT.style.height = Math.max(0, top) + "px";
    shadeB.style.top = (top + h) + "px";
    shadeL.style.top = top + "px";
    shadeL.style.height = h + "px";
    shadeL.style.width = Math.max(0, left) + "px";
    shadeR.style.top = top + "px";
    shadeR.style.height = h + "px";
    shadeR.style.left = (left + w) + "px";

    textEl.textContent = STEPS[i].text;
    nextBtn.textContent = i === STEPS.length - 1 ? "开始阅读" : "下一步";

    // 气泡：下方空间不足就放到目标上方
    const below = pr.height - (top + h);
    const above = below < 160;
    tip.classList.toggle("above", above);
    tip.style.top = above ? (top - 16) + "px" : (top + h + 16) + "px";
    tip.style.transform = above ? "translate(-50%, -100%)" : "translate(-50%, 0)";
    return true;
  }

  function showStep(i) {
    if (!homeVisible()) showHome();
    phone.scrollTop = 0; // 引导针对首页顶部区域，先归位再量尺寸
    // 等视图切换后的布局稳定，再量目标位置
    requestAnimationFrame(function () {
      if (!place(i)) return;
      idx = i;
      guide.classList.remove("hidden");
      guide.setAttribute("aria-hidden", "false");
    });
  }

  function finish() {
    guide.classList.add("hidden");
    guide.setAttribute("aria-hidden", "true");
    idx = -1;
    try { localStorage.setItem(DONE_KEY, "1"); } catch (e) { /* 隐私模式等：忽略 */ }
  }

  // 供 app.js 调用：视图切走 / 按返回键时收起引导
  window.XingHuoGuide = {
    active: function () { return !guide.classList.contains("hidden"); },
    close: finish
  };

  nextBtn.addEventListener("click", function () {
    if (idx < STEPS.length - 1) showStep(idx + 1);
    else finish();
  });
  skipBtn.addEventListener("click", finish);

  // 关于页「使用引导」：随时重看
  const replay = document.getElementById("about-guide");
  if (replay) {
    replay.addEventListener("click", function () {
      showHome();
      showStep(0);
    });
  }

  // 窗口尺寸变化 / 旋转时，重新对齐目标
  window.addEventListener("resize", function () {
    if (idx >= 0 && !guide.classList.contains("hidden")) place(idx);
  });

  // 首次打开自动播放：等字体就绪（诗句在字体就绪前 opacity: 0，指过去会指到空白）
  let done = false;
  try { done = localStorage.getItem(DONE_KEY) === "1"; } catch (e) { /* 忽略 */ }
  if (!done) {
    const fontsReady = (document.fonts && document.fonts.ready)
      ? document.fonts.ready.catch(function () {})
      : Promise.resolve();
    const timeout = new Promise(function (resolve) { setTimeout(resolve, 2000); });
    Promise.race([fontsReady, timeout]).then(function () {
      setTimeout(function () { showStep(0); }, 350);
    });
  }
})();

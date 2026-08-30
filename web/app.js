(function () {
  const poems = window.POEMS || [];
  const KEY = {
    font: "maoshi-font",
    size: "maoshi-size",
    skin: "maoshi-skin",
    bg: "maoshi-bg",
    customBg: "maoshi-custom-bg",
    opacity: "maoshi-bg-opacity",
    saved: "maoshi-saved"
  };

  const views = {
    home: document.getElementById("view-home"),
    search: document.getElementById("view-search"),
    saved: document.getElementById("view-saved"),
    mine: document.getElementById("view-mine"),
    "set-font": document.getElementById("view-set-font"),
    "set-size": document.getElementById("view-set-size"),
    "set-skin": document.getElementById("view-set-skin"),
    "set-bg": document.getElementById("view-set-bg"),
    about: document.getElementById("view-about"),
    privacy: document.getElementById("view-privacy"),
    help: document.getElementById("view-help"),
    detail: document.getElementById("view-detail")
  };

  let currentId = null;
  let lastHomeId = null;
  let lastHomeLineIndex = -1;
  let cameFrom = "home";

  // —— 收藏数据：{id, lineIndex, kind, time}
  // kind: "poem"（详情页收藏整首诗）| "line"（首页收藏当前句子）；lineIndex=-1 表示整首
  function readSaved() {
    try {
      const raw = localStorage.getItem(KEY.saved);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      // 老数据迁移：纯 id 字符串数组 → 结构化记录（旧收藏都是详情页收藏的全诗）
      if (list.length && typeof list[0] === "string") {
        const migrated = list.map(function (id) {
          return { id: id, lineIndex: -1, kind: "poem", time: 0 }; // time=0：老收藏无原始日期，显示"—"
        });
        writeSaved(migrated);
        return migrated;
      }
      return list.filter(function (r) {
        return r && typeof r.id === "string" && (r.kind === "poem" || r.kind === "line");
      });
    } catch (e) {
      return [];
    }
  }

  function writeSaved(list) {
    try {
      localStorage.setItem(KEY.saved, JSON.stringify(list));
      return true;
    } catch (e) {
      toast("收藏保存失败（存储空间不足或不可用）");
      return false;
    }
  }

  function savedKey(poemId, lineIndex) {
    return poemId + (lineIndex >= 0 ? ":" + lineIndex : "");
  }

  function findSaved(poemId, lineIndex) {
    const key = savedKey(poemId, lineIndex);
    return readSaved().find(function (r) {
      return savedKey(r.id, r.lineIndex) === key;
    }) || null;
  }

  // —— 收藏导出/导入（备份恢复，数据仅在用户主动操作时读写本机）
  function exportSaved() {
    const list = readSaved();
    if (!list.length) { toast("还没有收藏可导出"); return; }
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "星火收藏备份-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast("已导出 " + list.length + " 条收藏");
  }

  function importSaved(file) {
    const reader = new FileReader();
    reader.onerror = function () { toast("读取文件失败", 3000); };
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("not-array");
        // 严格校验：id 必须在诗库中；lineIndex 必须是整数且符合 kind 语义（poem=-1，line 在行数范围内）
        const valid = data.filter(function (r) {
          if (!r || typeof r.id !== "string" || (r.kind !== "poem" && r.kind !== "line")) return false;
          if (!poems.some(function (p) { return p.id === r.id; })) return false;
          if (!Number.isInteger(r.lineIndex)) return false;
          if (r.time !== undefined && (typeof r.time !== "number" || !isFinite(r.time))) return false;
          const poem = poems.find(function (p) { return p.id === r.id; });
          if (r.kind === "poem") return r.lineIndex === -1;
          return r.lineIndex >= 0 && r.lineIndex < (poem.lines || []).length;
        });
        if (!valid.length) { toast("文件里没有有效收藏", 3000); return; }
        const existing = readSaved();
        const keys = existing.map(function (r) { return r.id + ":" + r.lineIndex + ":" + r.kind; });
        let added = 0;
        valid.forEach(function (r) {
          const k = r.id + ":" + r.lineIndex + ":" + r.kind;
          if (keys.indexOf(k) < 0) { keys.push(k); existing.push(r); added++; }
        });
        if (!writeSaved(existing)) {
          toast("导入失败：存储空间不足", 3000);
          return;
        }
        updateMineSummaries();
        toast(added ? "已导入 " + added + " 条新收藏" : "这些收藏已存在", added ? 2200 : 3200);
      } catch (e) {
        toast("导入失败：文件格式不对", 3000);
      }
    };
    reader.readAsText(file);
  }

  function isSaved(poemId) {
    return !!findSaved(poemId, -1);
  }

  function isLineSaved(poemId, lineIndex) {
    return !!findSaved(poemId, lineIndex);
  }

  // 收藏/取消：lineIndex=-1 收藏整首诗，>=0 收藏单句。返回是否新增；写入失败返回 null
  function toggleSaved(poemId, lineIndex) {
    const list = readSaved();
    const key = savedKey(poemId, lineIndex);
    const i = list.findIndex(function (r) { return savedKey(r.id, r.lineIndex) === key; });
    if (i === -1) {
      list.unshift({
        id: poemId,
        lineIndex: lineIndex,
        kind: lineIndex >= 0 ? "line" : "poem",
        time: Date.now()
      });
    } else {
      list.splice(i, 1);
    }
    if (!writeSaved(list)) return null;
    return i === -1;
  }

  function removeSavedByKeys(keys) {
    const list = readSaved();
    writeSaved(list.filter(function (r) {
      return keys.indexOf(savedKey(r.id, r.lineIndex)) === -1;
    }));
  }

  let toastTimer = null;

  function toast(msg, duration) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, duration || 1600);
  }

  function applyPrefs() {
    let bg = localStorage.getItem(KEY.bg) || "none";
    if (bg === "xuan" || bg === "ink" || bg === "dan") {
      bg = "none";
      localStorage.setItem(KEY.bg, "none");
    }
    let font = localStorage.getItem(KEY.font) || "song";
    const FONTS = ["song", "kai", "fang", "hei", "huiwen"]; // 非法值回退宋体，避免 data-font 指向无规则名字
    if (FONTS.indexOf(font) === -1) font = "song";
    let skin = localStorage.getItem(KEY.skin) || "xuan";
    if (skin === "dan") { // 旧「丹笺」皮肤已下线，一次性迁移到最接近的暖棕
      skin = "zong";
      localStorage.setItem(KEY.skin, skin);
    }
    const SKINS = ["xuan", "bai", "lv", "zong", "qian", "ye", "hong"];
    if (SKINS.indexOf(skin) === -1) skin = "xuan";
    // 字号：12-24pt 滑块（名义 pt，以 17 为基准线性缩放）。旧档位值映射为对应 pt
    let size = localStorage.getItem(KEY.size);
    const LEGACY_PT = { xs: "12", sm: "14", md: "17", lg: "20", xl: "23" };
    if (LEGACY_PT[size]) {
      size = LEGACY_PT[size];
      localStorage.setItem(KEY.size, size);
    }
    let pt = parseInt(size, 10);
    if (isNaN(pt) || pt < 12 || pt > 24) {
      pt = 17;
      size = "17";
      localStorage.setItem(KEY.size, size); // 钳制后持久化，避免摘要显示脏值
    }
    const custom = localStorage.getItem(KEY.customBg) || "";
    const opacity = Number(localStorage.getItem(KEY.opacity) || 40);
    document.documentElement.setAttribute("data-font", font);
    document.documentElement.setAttribute("data-skin", skin);
    // 字号按 pt 缩放（以 17pt 为基准，pt 为名义单位），JS inline 覆盖默认变量。
    // 只缩放阅读区（首页诗句、两行小字）；详情页正文/标题固定字号，避免七绝七律提早换行。
    const s = pt / 17;
    const BASE = {
      "--fs-excerpt": 32, "--fs-poem": 17, "--fs-section": 18, "--fs-body": 15,
      "--fs-meta": 13, "--fs-date": 12
    };
    Object.keys(BASE).forEach(function (k) {
      let px = BASE[k];
      // 只对首页诗句、两行小字缩放；详情页使用固定字号
      if (k === "--fs-excerpt" || k === "--fs-meta" || k === "--fs-date") {
        px = Math.round(px * s);
      }
      if (k === "--fs-date") px = Math.max(px, 8); // 日期行最小 8px，避免最小档过小
      document.documentElement.style.setProperty(k, px + "px");
    });
    document.documentElement.style.setProperty("--bg-opacity", String(opacity / 100));
    const hasCustom = bg === "custom" && !!custom;
    if (hasCustom) {
      document.documentElement.style.setProperty("--custom-bg", "url(" + JSON.stringify(custom) + ")");
      document.documentElement.setAttribute("data-bg", "custom");
    } else {
      document.documentElement.style.removeProperty("--custom-bg");
      document.documentElement.setAttribute("data-bg", "none");
    }
    document.querySelectorAll("#font-chips button").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-font") === font);
    });
    document.querySelectorAll("#skin-chips button").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-skin") === skin);
    });
    document.querySelectorAll("#bg-chips button").forEach(function (btn) {
      const mode = btn.getAttribute("data-bg");
      btn.classList.toggle("on", hasCustom ? mode === "custom" : mode === "none");
    });
    const opacityRow = document.getElementById("opacity-row");
    if (opacityRow) opacityRow.classList.toggle("hidden", !hasCustom);
    const slider = document.getElementById("bg-opacity");
    if (slider) slider.value = String(opacity);
    const sizeSlider = document.getElementById("size-slider");
    if (sizeSlider) sizeSlider.value = String(pt);
    const sizeVal = document.getElementById("size-val");
    if (sizeVal) sizeVal.textContent = pt + "pt";
    const opacityVal = document.getElementById("opacity-val");
    if (opacityVal) opacityVal.textContent = opacity + "%";
    updateMineSummaries(); // 「我的」页四行摘要随设置实时刷新
  }

  // 「我的」页设置行摘要（字体/字号/皮肤/背景 当前值）
  function updateMineSummaries() {
    const FONT_NAMES = { song: "宋体", kai: "楷体", fang: "仿宋", hei: "黑体", huiwen: "汇文明朝" };
    const SKIN_NAMES = { xuan: "米白", bai: "素白", lv: "豆沙绿", zong: "暖棕", qian: "浅灰", ye: "夜读黑", hong: "绛红" };
    const font = localStorage.getItem(KEY.font) || "song";
    const size = localStorage.getItem(KEY.size) || "17";
    const skin = localStorage.getItem(KEY.skin) || "xuan";
    const bg = (localStorage.getItem(KEY.bg) === "custom" && localStorage.getItem(KEY.customBg)) ? "图片" : "无";
    const el = function (id) { return document.getElementById(id); };
    const v = el("set-font-val"); if (v) v.textContent = FONT_NAMES[font] || "宋体";
    const s = el("set-size-val"); if (s) s.textContent = size + "pt";
    const k = el("set-skin-val"); if (k) k.textContent = SKIN_NAMES[skin] || "米白";
    const b = el("set-bg-val"); if (b) b.textContent = bg;
    const ex = el("mine-export-val");
    if (ex) {
      const n = readSaved().length;
      ex.textContent = n ? n + " 条" : "";
    }
  }

  function show(name) {
    Object.keys(views).forEach(function (key) {
      views[key].classList.toggle("hidden", key !== name);
    });
  }

  function pickRandom(exceptId) {
    // P0-2: 只从已写全（complete）的诗里随机，未完成的只出现在搜索/收藏里
    const pool = poems.filter(function (p) { return p.complete && p.id !== exceptId; });
    const list = pool.length ? pool : poems.filter(function (p) { return p.complete; });
    return list[Math.floor(Math.random() * list.length)] || poems[0] || null;
  }

  function formatExcerpt(text) {
    // 按逗号/分号拆成短句行（保留原分隔符）；"一阵风雷惊世界，满街红绿走旌旗。" → 两行
    const parts = String(text).split(/([，；。])/).map(function (p) {
      return p.trim();
    }).filter(Boolean);
    if (parts.length < 2) {
      return '<span class="ex-line">' + escapeHtml(text) + "</span>";
    }
    const rows = [];
    for (let i = 0; i < parts.length; i += 2) {
      rows.push(parts[i] + (parts[i + 1] || ""));
    }
    return rows.map(function (l) {
      // 标点符号包在单独的 span 中，用于视觉平衡补偿
      return '<span class="ex-line">' + escapeHtml(l).replace(/([，；。])/g, '<span class="punct">$1</span>') + "</span>";
    }).join("");
  }

  // 写作日期转中文数字："1966年6月" → "一九六六年六月"；"1925年秋" → "一九二五年秋"（季节词保留）
  function toCnDate(date) {
    if (!date) return "";
    const CN = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    function num(s) { // 1-99 → 中文（含十位特例："十"、"十五"、"二十三"）
      const n = parseInt(s, 10);
      if (isNaN(n) || n < 0 || n > 99) return s;
      if (n < 10) return CN[n];
      if (n < 20) return n === 10 ? "十" : "十" + CN[n - 10];
      return CN[Math.floor(n / 10)] + "十" + (n % 10 ? CN[n % 10] : "");
    }
    function year(s) { // 四位年份逐位转："1935" → "一九三五"
      return String(s).split("").map(function (d) { return CN[parseInt(d, 10)] || d; }).join("");
    }
    return String(date)
      .replace(/(\d{4})年/, function (_, y) { return year(y) + "年"; })
      .replace(/(\d{1,2})月/, function (_, m) { return num(m) + "月"; })
      .replace(/(\d{1,2})日/, function (_, d) { return num(d) + "日"; });
  }

  let paintToken = 0; // 换一句快速连点时取消上一个待执行的 paint，避免旧句闪现
  let lastHomeKey = null; // 上次首页展示的 "诗id:行号"，避免完全重复

  function renderHome(poem, opts) {
    if (!poem) poem = pickRandom(lastHomeId);
    if (!poem) { // 诗库完全为空时的防御：显示提示，不崩溃
      document.getElementById("excerpt-text").innerHTML = "诗库尚空";
      document.getElementById("home-title").textContent = "";
      document.getElementById("home-date").textContent = "";
      show("home");
      return;
    }
    lastHomeId = poem.id;
    currentId = poem.id;
    // 随机拆句：以行为单位（每行一联、句号结尾），每句都有机会上首页
    const lines = Array.isArray(poem.lines) ? poem.lines : [];
    let lineIndex = -1;
    if (opts && opts.keep && lastHomeKey) { // 从详情/设置返回：保持刚才那句
      const m = String(lastHomeKey).split(":");
      if (m[0] === poem.id) {
        const keepIdx = parseInt(m[1], 10);
        if (keepIdx >= 0 && keepIdx < lines.length && lines[keepIdx]) lineIndex = keepIdx;
      }
    }
    if (lineIndex < 0) {
      const candidates = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] && poem.id + ":" + i !== lastHomeKey) candidates.push(i);
      }
      const pool = candidates.length ? candidates : lines.map(function (_, i) { return i; });
      lineIndex = lines.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
    }
    lastHomeKey = lineIndex >= 0 ? poem.id + ":" + lineIndex : null;
    lastHomeLineIndex = lineIndex;
    const line = lineIndex >= 0 ? lines[lineIndex] : "";
    const fade = opts && opts.fade;
    const el = document.getElementById("excerpt-text");
    const wrap = document.getElementById("excerpt-btn");
    const myToken = ++paintToken;
    function paint() {
      if (myToken !== paintToken) return; // 已被更新的请求取代
      el.innerHTML = formatExcerpt(line);
      wrap.classList.remove("is-fading");
      document.getElementById("home-meta").classList.remove("is-fading");
      // 两行小字：作品名《…》 + 中文数字写作日期
      document.getElementById("home-title").textContent = "《" + poem.title + "》";
      document.getElementById("home-date").textContent = toCnDate(poem.date);
      updateHomeSaveBtn();
    }
    if (fade && document.documentElement.classList.contains("fonts-ready")) {
      wrap.classList.add("is-fading");
      document.getElementById("home-meta").classList.add("is-fading");
      setTimeout(paint, 280);
    } else {
      paint();
    }
    show("home");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentPoem() {
    return poems.find(function (p) { return p.id === currentId; }) || null;
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function wrapCanvasText(ctx, text, maxW) {
    // 按字符换行（保留显式 \n）；返回行数组
    const out = [];
    let line = "";
    Array.from(String(text)).forEach(function (ch) {
      if (ch === "\n") {
        if (line) { out.push(line); line = ""; }
        return;
      }
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    });
    if (line) out.push(line);
    return out.length ? out : [""];
  }

  function savePoemCard() {
    const poem = currentPoem();
    if (!poem) return;
    const css = getComputedStyle(document.documentElement);
    const paper = css.getPropertyValue("--paper").trim() || "#f4efe4";
    const ink = css.getPropertyValue("--ink").trim() || "#1c1612";
    const red = css.getPropertyValue("--red").trim() || "#8b1e1e";
    const muted = css.getPropertyValue("--muted").trim() || "#6b5e52";
    const gold = css.getPropertyValue("--gold").trim() || "#b0894a";
    const reading = css.getPropertyValue("--font-reading").trim() || "serif";
    const brush = '"草檀斋毛泽东字体", "Liu Jian Mao Cao", "Huiwen-mincho", serif';
    const W = 780;
    const pad = 72;
    const maxW = W - pad * 2;
    const dpr = 2;

    // 整句一行（与详情页一致）：七绝七律等规整体裁整句不拆，词的长短句自然错落
    const poemLines = (poem.lines || []).filter(function (ln) {
      return ln.trim();
    });

    // 自定义背景图（与 .phone::before 相同来源）
    const hasCustomBg = localStorage.getItem(KEY.bg) === "custom";
    const bgData = hasCustomBg ? (localStorage.getItem(KEY.customBg) || "") : "";
    const bgOpacity = Number(localStorage.getItem(KEY.opacity) || 40) / 100;

    // 品牌图用 dataURL 内嵌（web/brand-data.js）：file:// 下本地图片会污染 canvas 导致 toBlob 报错，
    // dataURL 视为同源数据，绘制不会污染 canvas，file:// 与 http 均安全。
    const brandPromise = loadImage(typeof BRAND_DATA !== "undefined" ? BRAND_DATA : "brand.png");
    const bgPromise = bgData ? loadImage(bgData) : Promise.resolve(null);

    // 等字体就绪 + 两张图（都保证 settle：fonts.ready 永不 reject，loadImage 用 onload/onerror 兜底）。
    // 不用 document.fonts.load——它在字体被安全策略挂起时可能永不 settle，导致 Promise.all 卡死、点击无反应。
    Promise.all([
      document.fonts.ready,
      brandPromise,
      bgPromise
    ]).then(function (res) {
      const brandImg = res[1];
      const bgImg = res[2];

      // 第一遍：测量各段行数，算出总高
      const probe = document.createElement("canvas").getContext("2d");
      probe.font = "bold 20px " + reading; // 与标题绘制字体一致，否则换行测量不准
      const titleLines = wrapCanvasText(probe, poem.title, maxW);
      probe.font = "18px " + brush;
      const bodyLines = poemLines.length;
      probe.font = "18px " + reading;
      const bgPara = (poem.background || []).map(function (p) { return wrapCanvasText(probe, p, maxW); });
      const interPara = (poem.interpretation || []).map(function (p) { return wrapCanvasText(probe, p, maxW); });
      probe.font = "13px " + reading;
      const srcLines = (poem.sources || []).map(function (s) { return wrapCanvasText(probe, s, maxW); });

      // 字号层级统一：标题组（诗标题/小节标题）20px，正文组（诗/段落）18px
      const titleH = 30;   // 标题行高（20px）
      const poemH = 32;    // 诗行高（18px 毛体）
      const secH = 30;     // 小节标题行高（20px）
      const bodyH = 28;    // 正文行高（18px）
      const srcH = 20;     // 来源行高（13px）
      const brandFootH = 44;  // 底部小品牌图高度（落款）

      // 顶部不放大图：与底部星火重复，且挤占标题空间；标题直接从框内上方开始
      let H = pad + 8;
      H += titleLines.length * titleH + 6;
      H += 28;                 // meta（15px 行高 28）
      H += 16;
      H += bodyLines * poemH + 24;
      H += 40;                 // 分隔线区
      if (poem.complete) {
        H += secH + 14 + bgPara.reduce(function (n, a) { return n + a.length * bodyH + 12; }, 0);
        H += secH + 14 + interPara.reduce(function (n, a) { return n + a.length * bodyH + 12; }, 0);
        if (srcLines.length) {
          H += secH + 10 + srcLines.reduce(function (n, a) { return n + a.length * srcH; }, 0);
        }
      } else {
        H += secH + 14 + bodyH * 2;
      }
      H += 40 + brandFootH + pad;

      const canvas = document.createElement("canvas");
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // 背景：皮肤纸色 + 自定义背景图（半透明叠加，与页面一致）
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, H);
      if (bgImg) {
        const sc = Math.max(W / bgImg.width, H / bgImg.height);
        const bw = bgImg.width * sc, bh = bgImg.height * sc;
        ctx.globalAlpha = bgOpacity;
        ctx.drawImage(bgImg, (W - bw) / 2, (H - bh) / 2, bw, bh);
        ctx.globalAlpha = 1;
      }

      // 金线双框
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(28, 28, W - 56, H - 56);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(34, 34, W - 68, H - 68);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      let y = pad + 8;

      // 标题（与小节标题同字号：bold 20px，多行居中）
      ctx.fillStyle = ink;
      ctx.font = "bold 20px " + reading;
      titleLines.forEach(function (l) {
        ctx.fillText(l, W / 2, y);
        y += titleH;
      });
      y += 6;

      // 日期 · 地点
      const meta = poem.date
        ? (poem.place
          ? poem.date + "  ·  于" + poem.place
          : poem.date + "  ·  毛泽东")
        : "毛泽东";
      ctx.fillStyle = muted;
      ctx.font = "15px " + reading;
      ctx.fillText(meta, W / 2, y);
      y += 28 + 16;

      // 诗（毛体，整句一行，与正文同字号 18px）
      ctx.fillStyle = ink;
      ctx.font = "18px " + brush;
      poemLines.forEach(function (l) {
        ctx.fillText(l, W / 2, y);
        y += poemH;
      });
      y += 24;

      // 金色分隔线
      ctx.strokeStyle = gold;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 36, y);
      ctx.lineTo(W / 2 + 36, y);
      ctx.stroke();
      y += 40;

      function drawSection(title, paras) {
        // 小节标题：左侧红竖线 + 红字
        ctx.fillStyle = red;
        ctx.font = "bold 20px " + reading;
        ctx.textAlign = "left";
        ctx.fillRect(pad - 14, y + 5, 3, 20);
        ctx.fillText(title, pad, y);
        ctx.textAlign = "center";
        y += secH + 14;
        ctx.fillStyle = ink;
        ctx.font = "18px " + reading;  // 段落与诗正文同字号 18px
        ctx.textAlign = "left";
        paras.forEach(function (lines) {
          lines.forEach(function (l) {
            ctx.fillText(l, pad, y);
            y += bodyH;
          });
          y += 12;
        });
        ctx.textAlign = "center";
      }

      if (poem.complete) {
        drawSection("写作背景", bgPara);
        drawSection("诗词解读", interPara);
        if (srcLines.length) {
          ctx.fillStyle = red;
          ctx.font = "bold 20px " + reading;
          ctx.textAlign = "left";
          ctx.fillRect(pad - 14, y + 5, 3, 20);
          ctx.fillText("来源", pad, y);
          ctx.textAlign = "center";
          y += secH + 10;
          ctx.fillStyle = muted;
          ctx.font = "13px " + reading;
          ctx.textAlign = "left";
          srcLines.forEach(function (lines) {
            lines.forEach(function (l) {
              ctx.fillText(l, pad, y);
              y += srcH;
            });
          });
          ctx.textAlign = "center";
        }
      } else {
        drawSection("写作背景", [["这篇尚未写就。"]]);
        drawSection("诗词解读", [["这篇尚未写就。"]]);
      }

      y += 40;
      // 底部小品牌图
      if (brandImg) {
        const bw = Math.round(brandImg.width * brandFootH / brandImg.height);
        ctx.drawImage(brandImg, (W - bw) / 2, y, bw, brandFootH);
      }

      canvas.toBlob(function (blob) {
        if (!blob) {
          toast("这张图没能生成", 4000);
          return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = poem.title.replace(/[\\/:*?"<>|]/g, "") + ".png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        toast("已保存图片");
      }, "image/png");
    }).catch(function (err) {
      // 任何绘制/导出异常都可见，避免"点击无反应"（4s 足够读清错误）
      toast("存图失败：" + (err && err.message ? err.message : err), 4000);
    });
  }

  function updateSaveBtn() {
    const btn = document.getElementById("btn-save");
    const on = isSaved(currentId);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-label", on ? "取消收藏" : "收藏");
  }

  function renderDetail(poem) {
    currentId = poem.id;
    document.getElementById("detail-title").textContent = poem.title;
    updateSaveBtn();
    const meta = poem.date
      ? (poem.place
        ? poem.date + " · 于" + poem.place
        : poem.date + " · 毛泽东")
      : "毛泽东";
    const orig = poem.originalTitle
      ? '<p class="meta">原题《' + escapeHtml(poem.originalTitle) + "》</p>"
      : "";

    let bg = "";
    let inter = "";
    if (poem.complete) {
      bg = poem.background.map(function (p) {
        return "<p>" + escapeHtml(p) + "</p>";
      }).join("");
      inter = poem.interpretation.map(function (p) {
        return "<p>" + escapeHtml(p) + "</p>";
      }).join("");
    } else {
      bg = '<p class="pending">这篇尚未写就。</p>';
      inter = '<p class="pending">这篇尚未写就。</p>';
    }

    const sources = (poem.sources || []).map(function (s) {
      return "<div>" + escapeHtml(s) + "</div>";
    }).join("");

    document.getElementById("detail-body").innerHTML =
      '<p class="meta">' + escapeHtml(meta) + "</p>" + orig +
      '<div class="poem">' + poem.lines.map(function (line) {
        // 整句一行：七绝七律等规整体裁不拆（字号已固定为 17px，整句不提前换行）；
        // 词的长短句按原文自然排版
        return "<div>" + escapeHtml(line) + "</div>";
      }).join("") + "</div>" +
      '<div class="section-title">写作背景</div>' +
      '<div class="section-body">' + bg + "</div>" +
      '<div class="section-title">诗词解读</div>' +
      '<div class="section-body">' + inter + "</div>" +
      '<div class="sources">' + sources + "</div>";

    show("detail");
  }

  function resultItem(p) {
    const sub = p.excerpt || (Array.isArray(p.lines) && p.lines[0]) || ""; // excerpt 留空时兜底取首行
    return '<li><button type="button" data-id="' + p.id + '">' +
      '<span class="t">' + escapeHtml(p.title) + "</span>" +
      '<span class="e">' + escapeHtml(sub) + "</span>" +
      "</button></li>";
  }

  function search(q) {
    const key = (q || "").trim().toLowerCase();
    const box = document.getElementById("results");
    if (!key) {
      box.innerHTML = "";
      return;
    }
    const hits = poems.filter(function (p) {
      const sub = p.excerpt || (Array.isArray(p.lines) && p.lines[0]) || "";
      return (p.searchText + " " + sub + " " + p.title).toLowerCase().indexOf(key) !== -1;
    });
    if (!hits.length) {
      box.innerHTML = '<p class="empty">没有找到。换一句或换个词再搜。</p>';
      return;
    }
    box.innerHTML = hits.map(resultItem).join("");
  }

  // —— 收藏页（全诗/单句 Tab + 管理模式）
  let savedTab = "poem";
  let managing = false;
  let selected = {};

  function fmtDate(t) {
    if (!t) return "—"; // 老数据迁移的收藏无原始日期
    const d = new Date(t);
    const p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function renderSaved() {
    const list = readSaved();
    const items = list.map(function (r) {
      const p = poems.find(function (x) { return x.id === r.id; });
      return p ? { rec: r, poem: p } : null;
    }).filter(Boolean);
    const poemItems = items.filter(function (x) { return x.rec.kind === "poem"; });
    const lineItems = items.filter(function (x) { return x.rec.kind === "line"; });
    document.getElementById("tab-poem").textContent = "全诗 " + poemItems.length;
    document.getElementById("tab-line").textContent = "单句 " + lineItems.length;
    if (savedTab === "line" && !lineItems.length) savedTab = "poem";
    const cur = savedTab === "line" ? lineItems : poemItems;
    document.getElementById("tab-poem").classList.toggle("on", savedTab === "poem");
    document.getElementById("tab-line").classList.toggle("on", savedTab === "line");
    const box = document.getElementById("saved-list");
    if (!cur.length) {
      box.innerHTML = '<p class="empty">还没有收藏' + (savedTab === "poem" ? "全诗。" : "单句。") + "在详情页收藏整首诗，或在首页点右上角星标收藏单句。</p>";
    } else {
      box.innerHTML = cur.map(function (x) {
        const key = savedKey(x.rec.id, x.rec.lineIndex);
        const text = x.rec.kind === "line"
          ? (x.poem.lines[x.rec.lineIndex] || "")
          : (x.poem.excerpt || (x.poem.lines && x.poem.lines[0]) || "");
        return '<li data-key="' + escapeHtml(key) + '">' +
          (managing ? '<span class="check' + (selected[key] ? " on" : "") + '" aria-hidden="true"></span>' : "") +
          '<button type="button" data-id="' + escapeHtml(x.poem.id) + '" data-key="' + escapeHtml(key) + '">' +
          '<span class="t">' + escapeHtml(text) + "</span>" +
          '<span class="e">—— ' + escapeHtml(x.poem.title) + "</span>" +
          '<span class="d">' + fmtDate(x.rec.time) + "</span>" +
          "</button></li>";
      }).join("");
    }
    document.getElementById("manage-n").textContent = String(Object.keys(selected).length);
    document.getElementById("manage-bar").classList.toggle("hidden", !managing);
    document.getElementById("saved-manage").textContent = managing ? "退出管理" : "管理";
    show("saved");
  }

  // —— 我的页
  function renderMine() {
    updateMineSummaries();
    document.getElementById("mine-feedback-summary").textContent = CONTACT.email || "整理中";
    show("mine");
  }

  // —— 关于页
  var CONTACT = { email: "3280302235@qq.com", github: "https://github.com/CristinaHan/MaoPoem" };

  function renderAbout() {
    document.getElementById("about-github-summary").textContent = "";
    show("about");
  }

  var DOCS = {
    privacy: [
      "星火是一个本地阅读应用。所有诗词、背景、解读与字体均打包在应用内，阅读时不需要联网。",
      "你的设置（字体、字号、皮肤、背景）与收藏内容仅保存在本机浏览器存储中，应用不会上传、不会收集任何个人信息。",
      "若你上传背景图片，图片只存于本机，不会离开设备。",
      "存图与导出收藏由你主动触发：生成的图片与备份文件只写入你的设备，应用不经过任何服务器。",
      "本应用无广告、无统计、无第三方 SDK。"
    ],
    help: [
      "首页：每次打开随机展示一句完整诗句，点句子可看全诗。",
      "换一句：点右下角「换一句」，随机展示另一句；右上角星标可收藏当前句子。",
      "搜索：点左下角「搜索」，输入诗句或诗题找回诗作。",
      "收藏：详情页右上角星标收藏整首诗；「我的 → 收藏」可查看与管理，分「全诗」「单句」两类。",
      "备份：收藏不会离开你的设备；「我的 → 导出收藏」可下载备份文件，换设备后「导入收藏」恢复（合并去重）。",
      "设置：「我的 → 设置」可调字体（5 种）、字号（12–24pt）、皮肤（7 种配色）与背景图。",
      "离线可用：字体与数据全部本地，断网也能正常阅读。"
    ]
  };

  function renderDoc(kind) {
    document.getElementById(kind + "-body").innerHTML =
      DOCS[kind].map(function (p) { return "<p>" + escapeHtml(p) + "</p>"; }).join("");
    show(kind === "privacy" ? "privacy" : "help");
  }

  function openFromList(target, from) {
    const btn = target.closest("button[data-id]");
    if (!btn) return;
    const poem = poems.find(function (p) { return p.id === btn.getAttribute("data-id"); });
    if (!poem) return;
    cameFrom = from;
    renderDetail(poem);
  }

  document.getElementById("btn-next").addEventListener("click", function () {
    renderHome(pickRandom(lastHomeId), { fade: true });
  });
  document.getElementById("excerpt-btn").addEventListener("click", function () {
    const poem = poems.find(function (p) { return p.id === currentId; });
    if (poem) {
      cameFrom = "home";
      renderDetail(poem);
    }
  });
  document.getElementById("btn-search").addEventListener("click", function () {
    cameFrom = "home";
    document.getElementById("q").value = "";
    document.getElementById("results").innerHTML = "";
    show("search");
    document.getElementById("q").focus();
  });
  // 首页右上角：☆ 快速收藏当前句子；☰ 进入「我的」
  function updateHomeSaveBtn() {
    const btn = document.getElementById("btn-home-save");
    const on = currentId && lastHomeLineIndex >= 0 && isLineSaved(currentId, lastHomeLineIndex);
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-label", on ? "取消收藏此句" : "收藏此句");
  }
  document.getElementById("btn-home-save").addEventListener("click", function () {
    if (!currentId || lastHomeLineIndex < 0) return;
    const nowSaved = toggleSaved(currentId, lastHomeLineIndex);
    updateHomeSaveBtn();
    if (nowSaved !== null) toast(nowSaved ? "已收藏此句" : "已取消收藏此句");
  });
  document.getElementById("btn-menu").addEventListener("click", function () {
    renderMine();
  });
  document.getElementById("mine-back").addEventListener("click", function () {
    renderHome(poems.find(function (p) { return p.id === lastHomeId; }) || poems[0], { keep: true });
  });
  document.getElementById("mine-saved").addEventListener("click", function () {
    savedTab = "poem"; managing = false; selected = {};
    renderSaved();
  });
  // 收藏备份：导出（下载 JSON）与导入（合并去重）
  document.getElementById("mine-export").addEventListener("click", exportSaved);
  document.getElementById("mine-import").addEventListener("click", function () {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", function () {
    if (this.files && this.files[0]) importSaved(this.files[0]);
    this.value = "";
  });
  // 设置四行：跳转子页（与收藏/关于一致的导航方式）
  ["set-font", "set-size", "set-skin", "set-bg"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      show(this.getAttribute("data-view"));
    });
  });
  document.getElementById("setfont-back").addEventListener("click", function () { renderMine(); });
  document.getElementById("setsize-back").addEventListener("click", function () { renderMine(); });
  document.getElementById("setskin-back").addEventListener("click", function () { renderMine(); });
  document.getElementById("setbg-back").addEventListener("click", function () { renderMine(); });
  document.getElementById("mine-about").addEventListener("click", function () {
    renderAbout();
  });
  document.getElementById("about-back").addEventListener("click", function () {
    renderMine();
  });
  document.getElementById("about-privacy").addEventListener("click", function () {
    renderDoc("privacy");
  });
  document.getElementById("about-help").addEventListener("click", function () {
    renderDoc("help");
  });
  document.getElementById("privacy-back").addEventListener("click", function () {
    show("about");
  });
  document.getElementById("help-back").addEventListener("click", function () {
    show("about");
  });
  // 意见反馈入口在「我的」页
  document.getElementById("mine-feedback").addEventListener("click", function () {
    if (CONTACT.email) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(CONTACT.email).then(function () {
          toast("邮箱已复制：" + CONTACT.email);
        }, function () { toast("邮箱：" + CONTACT.email); });
      } else {
        toast("邮箱：" + CONTACT.email);
      }
    } else {
      toast("邮箱整理中，敬请期待");
    }
  });
  document.getElementById("about-github").addEventListener("click", function () {
    if (CONTACT.github) window.open(CONTACT.github, "_blank");
    else toast("仓库整理中，稍后开放");
  });
  document.getElementById("saved-back").addEventListener("click", function () {
    renderMine();
  });
  document.getElementById("saved-tabs").addEventListener("click", function (e) {
    const tab = e.target.closest("button[data-tab]");
    if (!tab) return;
    savedTab = tab.getAttribute("data-tab") === "line" ? "line" : "poem";
    selected = {};
    renderSaved();
  });
  document.getElementById("saved-manage").addEventListener("click", function () {
    managing = !managing;
    selected = {};
    renderSaved();
  });
  document.getElementById("manage-all").addEventListener("click", function () {
    const list = readSaved();
    selected = {};
    list.forEach(function (r) {
      const k = savedKey(r.id, r.lineIndex);
      const kind = r.kind;
      if (kind === savedTab) selected[k] = true;
    });
    renderSaved();
  });
  document.getElementById("manage-del").addEventListener("click", function () {
    const keys = Object.keys(selected);
    if (!keys.length) { toast("先选中要取消的条目"); return; }
    removeSavedByKeys(keys);
    selected = {};
    managing = false;
    renderSaved();
    toast("已取消收藏 " + keys.length + " 条");
  });
  document.getElementById("search-back").addEventListener("click", function () {
    renderHome(poems.find(function (p) { return p.id === lastHomeId; }) || poems[0], { keep: true });
  });
  document.getElementById("detail-back").addEventListener("click", function () {
    if (cameFrom === "search") show("search");
    else if (cameFrom === "saved") renderSaved();
    else renderHome(poems.find(function (p) { return p.id === lastHomeId; }) || poems[0], { keep: true });
  });
  document.getElementById("btn-save").addEventListener("click", function () {
    if (!currentId) return;
    const nowSaved = toggleSaved(currentId, -1); // 详情页收藏整首诗
    updateSaveBtn();
    if (nowSaved !== null) toast(nowSaved ? "已收藏全诗" : "已取消收藏");
  });
  document.getElementById("btn-card").addEventListener("click", function () {
    savePoemCard();
  });
  document.getElementById("q").addEventListener("input", function (e) {
    search(e.target.value);
  });
  document.getElementById("results").addEventListener("click", function (e) {
    openFromList(e.target, "search");
  });
  document.getElementById("saved-list").addEventListener("click", function (e) {
    if (managing) {
      const li = e.target.closest("li[data-key]");
      if (!li) return;
      const key = li.getAttribute("data-key");
      if (selected[key]) delete selected[key];
      else selected[key] = true;
      renderSaved();
      return;
    }
    openFromList(e.target, "saved");
  });
  document.getElementById("bg-chips").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-bg]");
    if (!btn) return;
    if (btn.getAttribute("data-bg") === "none") {
      localStorage.setItem(KEY.bg, "none");
      localStorage.removeItem(KEY.customBg);
      applyPrefs();
      return;
    }
    document.getElementById("bg-file").click();
  });
  document.getElementById("bg-file").addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      const max = 900;
      let w = img.width;
      let h = img.height;
      if (w > max) {
        h = Math.round(h * max / w);
        w = max;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL("image/jpeg", 0.72);
      try {
        localStorage.setItem(KEY.customBg, data);
        localStorage.setItem(KEY.bg, "custom");
        applyPrefs();
        toast("已换上自己的图");
      } catch (err) {
        toast("图片太大，换一张小一点的");
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast("这张图打不开");
    };
    img.src = url;
  });
  document.getElementById("bg-opacity").addEventListener("input", function (e) {
    localStorage.setItem(KEY.opacity, e.target.value);
    applyPrefs();
  });
  document.getElementById("font-chips").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-font]");
    if (!btn) return;
    localStorage.setItem(KEY.font, btn.getAttribute("data-font"));
    applyPrefs();
  });
  document.getElementById("size-slider").addEventListener("input", function (e) {
    localStorage.setItem(KEY.size, e.target.value);
    applyPrefs();
  });
  document.getElementById("skin-chips").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-skin]");
    if (!btn) return;
    localStorage.setItem(KEY.skin, btn.getAttribute("data-skin"));
    applyPrefs();
  });

  applyPrefs();
  renderHome(pickRandom(null)); // PRD F1: 每次打开随机一句（数据已全部完整）

  function markFontsReady() {
    document.documentElement.classList.add("fonts-ready");
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(markFontsReady).catch(markFontsReady);
    setTimeout(markFontsReady, 1800);
  } else {
    markFontsReady();
  }
})();

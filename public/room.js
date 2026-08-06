"use strict";

(function () {
  // WebGL 上下文劫持：强制 preserveDrawingBuffer，保证能读回画面帧（否则捕获全黑）
  (function patchWebGL() {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (typeof type === "string" && type.indexOf("webgl") === 0) {
        attrs = Object.assign({ preserveDrawingBuffer: true }, attrs || {});
      }
      return orig.call(this, type, attrs);
    };
  })();

  const params = new URLSearchParams(location.search);
  const gameId = params.get("game") || "46923";
  const roomName = params.get("room") || "lobby";

  if (!ensureName()) return;

  let gameMeta = null;
  let myId = null;
  let mySeat = null;
  let state = { members: [], seats: { 1: null, 2: null }, mouseOwner: null, hostId: null };
  let mode = "idle"; // "host" | "viewer"
  let playerEl = null;
  let canvasEl = null;
  let ruffleApi = null;
  let viewerCanvas = null;
  let viewerCtx = null;
  let tmpCanvas = null;
  let tmpCtx = null;
  let frameTimer = null;
  let currentMouse = null;
  let lastMoveSend = 0;
  const stageEl = document.getElementById("stage");

  document.getElementById("room-name").textContent = roomName;
  document.getElementById("my-name").textContent = arcadeName();

  fetch("/games.json")
    .then((r) => r.json())
    .then((games) => {
      gameMeta = games.find((g) => g.id === gameId);
      if (!gameMeta) {
        document.getElementById("game-title").textContent = "未知游戏";
        return;
      }
      document.title = gameMeta.title + " - ArcadeOnline";
      document.getElementById("game-title").textContent = gameMeta.title;
      setupInput();
      ArcadeNet.connect(wsUrl());
      ArcadeNet.on("welcome", (m) => {
        myId = m.id;
      });
      ArcadeNet.on("state", onState);
      ArcadeNet.on("in", onRemoteInput);
      ArcadeNet.on("clearKeys", onClearKeys);
      ArcadeNet.on("mouseOwner", onMouseOwner);
      ArcadeNet.on("sys", onSys);
      ArcadeNet.on("frame", onFrame);
      ArcadeNet.on("err", (m) => log("!! " + m.msg, "leave"));
      ArcadeNet.on("conn", onConn);
    });

  function wsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return proto + "://" + location.host;
  }

  function onConn(ok) {
    const badge = document.getElementById("conn-badge");
    badge.textContent = ok ? "已连接" : "已断开";
    badge.className = "badge " + (ok ? "ok" : "bad");
    if (ok) {
      ArcadeNet.send({ t: "join", name: arcadeName(), gameId, room: roomName });
    } else {
      myId = null;
      mySeat = null;
    }
  }

  /* ---------------- 模式切换：房主(唯一播放器) / 观战(收帧) ---------------- */

  function onState(s) {
    state = s;
    const me = state.members.find((m) => m.id === myId);
    mySeat = me ? me.seat : null;
    const shouldHost = state.hostId === myId;
    if (shouldHost) {
      if (mode !== "host") becomeHostMode();
    } else {
      if (mode !== "viewer") becomeViewerMode();
    }
    startStatusWatch();
    render();
  }

  function becomeHostMode() {
    mode = "host";
    log("你是房主：本机运行游戏，画面直播给全房间", "host");
    setupSw().then(() => {
      if (mode !== "host") return;
      destroyPlayer();
      setupRuffle();
      startFrameCapture();
    });
  }

  function becomeViewerMode() {
    mode = "viewer";
    stopFrameCapture();
    destroyPlayer();
    if (!viewerCanvas) {
      viewerCanvas = document.createElement("canvas");
      viewerCanvas.width = gameMeta.width;
      viewerCanvas.height = gameMeta.height;
      viewerCtx = viewerCanvas.getContext("2d");
      viewerCtx.fillStyle = "#000";
      viewerCtx.fillRect(0, 0, gameMeta.width, gameMeta.height);
    }
    stageEl.appendChild(viewerCanvas);
    lastFrameAt = 0;
  }

  let lastFrameAt = 0;
  let statusTimer = null;

  function startStatusWatch() {
    stopStatusWatch();
    statusTimer = setInterval(updateStageStatus, 1000);
    updateStageStatus();
  }

  function stopStatusWatch() {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  function updateStageStatus() {
    const el = document.getElementById("stage-status");
    if (!el) return;
    if (state.hostId == null) {
      el.textContent = "房间暂无房主，游戏未运行——点击右侧「成为房主」开始直播";
      el.classList.add("show");
      return;
    }
    if (mode === "viewer") {
      const hostMember = state.members.find((m) => m.id === state.hostId);
      const hostName = hostMember ? hostMember.name : "房主";
      if (Date.now() - lastFrameAt < 2500) {
        el.classList.remove("show");
      } else if (lastFrameAt > 0) {
        el.textContent = "画面中断：已停止收到 " + hostName + " 的直播，正在等待…";
        el.classList.add("show");
      } else {
        el.textContent = "正在等待 " + hostName + " 的直播画面…";
        el.classList.add("show");
      }
      return;
    }
    if (mode === "host") {
      el.classList.remove("show");
    }
  }

  function destroyPlayer() {
    stopFrameCapture();
    try {
      if (playerEl && playerEl.destroy) playerEl.destroy();
    } catch (e) {}
    if (playerEl && playerEl.parentNode) playerEl.parentNode.removeChild(playerEl);
    playerEl = null;
    canvasEl = null;
  }

  // Service Worker：拦截已死亡的 mochibot.com，用本地极简 SWF 冒充，
  // 使 4399 老游戏通过内置的反盗链校验（域名校验要求 URL 原样保留）。
  // 注意：SW 仅安全上下文可用（localhost / HTTPS），纯 HTTP 局域网不可用。
  // 关键：必须等页面被 SW 接管（controllerchange）后再加载游戏，
  // 否则首次访问时 mochibot 请求会逃逸到真实网络（域名已死 → 游戏永久卡死）。
  function setupSw() {
    if (!("serviceWorker" in navigator)) return Promise.resolve();
    return navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(function () {
        return navigator.serviceWorker.ready;
      })
      .catch(function () {
        return undefined;
      });
  }

  /* ---------------- 房主：Ruffle + 帧捕获直播 ---------------- */

  function setupRuffle() {
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      autoplay: "on",
      letterbox: "off",
      preferredRenderer: "webgl",
      preserveDrawingBuffer: true
    };
    const ruffle = window.RufflePlayer.newest();
    ruffleApi = ruffle;
    playerEl = ruffle.createPlayer();
    playerEl.config = {
      width: gameMeta.width,
      height: gameMeta.height,
      autoplay: "on",
      letterbox: "off",
      preserveDrawingBuffer: true
    };
    if (playerEl.tabIndex === -1 || playerEl.tabIndex === undefined) {
      playerEl.tabIndex = 0;
    }
    stageEl.appendChild(playerEl);
    playerEl.load(gameMeta.swf);
  }

  function getCanvas() {
    if (!canvasEl) {
      canvasEl =
        (playerEl.shadowRoot && playerEl.shadowRoot.querySelector("canvas")) ||
        playerEl.querySelector("canvas");
    }
    return canvasEl;
  }

  function startFrameCapture() {
    stopFrameCapture();
    frameTimer = setInterval(captureFrame, 100);
  }

  function stopFrameCapture() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  }

  function captureFrame() {
    const src = getCanvas();
    if (!src) return;
    if (!tmpCanvas) {
      tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = gameMeta.width;
      tmpCanvas.height = gameMeta.height;
      tmpCtx = tmpCanvas.getContext("2d");
    }
    tmpCtx.drawImage(src, 0, 0, gameMeta.width, gameMeta.height);
    if (currentMouse) {
      const x = currentMouse.x * gameMeta.width;
      const y = currentMouse.y * gameMeta.height;
      tmpCtx.fillStyle = "#ffe100";
      tmpCtx.fillRect(x - 7, y - 1, 14, 2);
      tmpCtx.fillRect(x - 1, y - 7, 2, 14);
    }
    tmpCanvas.toBlob(function (blob) {
      if (blob) ArcadeNet.sendBlob(blob);
    }, "image/jpeg", 0.6);
  }

  /* ---------------- 观战：渲染房主流帧 ---------------- */

  function onFrame(blob) {
    if (mode !== "viewer") return;
    if (!viewerCtx) return;
    lastFrameAt = Date.now();
    createImageBitmap(blob)
      .then(function (bmp) {
        if (mode !== "viewer" || !viewerCtx) {
          bmp.close();
          return;
        }
        viewerCtx.drawImage(bmp, 0, 0, gameMeta.width, gameMeta.height);
        bmp.close();
      })
      .catch(function () {});
  }

  /* ---------------- 输入：本地捕获 + 房主注入 ---------------- */

  function allGameCodes() {
    const set = new Set();
    for (const s of gameMeta.seats) for (const k of s.keys) set.add(k);
    return set;
  }

  function seatMeta(seat) {
    return gameMeta.seats.find((s) => s.seat === seat);
  }

  // 座位物理键集合 + 映射表：
  // 有 map 时（如 P2 也按 WASD）：物理键不在 map 里的游戏键一律挡掉，
  // 物理键被映射成该座位真正对应的游戏键（如 KeyD -> ArrowRight）。
  function seatKeys(seat) {
    const meta = seatMeta(seat);
    if (!meta) return null;
    if (meta.map) return { physical: new Set(Object.keys(meta.map)), map: meta.map };
    return { physical: new Set(meta.keys), map: null };
  }

  function onKey(ev) {
    if (!ev.isTrusted) return; // 合成注入事件直接放行（注入键已通过座位白名单+映射校验）
    if (mySeat == null) {
      // 观战：游戏键全部挡掉，不能污染游戏
      if (allGameCodes().has(ev.code)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
      return;
    }
    const m = seatKeys(mySeat);
    if (!m || !m.physical.has(ev.code)) {
      // 属于其他座位的键：彻底挡掉（房主的原生按键也不会漏给游戏）
      if (allGameCodes().has(ev.code)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
      return;
    }
    ev.preventDefault();
    const mapped = m.map ? m.map[ev.code] : null;
    const code = mapped ? mapped.code : ev.code;
    const key = mapped ? mapped.key : ev.key;
    const keyCode = mapped ? mapped.keyCode : ev.keyCode;
    if (mode === "host") {
      if (mapped) {
        // 映射键：挡掉原生事件，注入映射后的游戏键
        ev.stopImmediatePropagation();
        injectKey(ev.type, code, key, keyCode, ev.repeat);
      }
      return; // 自己的原生游戏键直通
    }
    ArcadeNet.send({
      t: "in",
      kind: "key",
      type: ev.type,
      code,
      key,
      keyCode,
      repeat: ev.repeat
    });
  }

  function onPointer(ev) {
    if (mySeat == null) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (!ev.isTrusted) return;
    const rect = stageEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
    if (ev.type === "pointermove") {
      const now = performance.now();
      if (now - lastMoveSend < 30) return;
      lastMoveSend = now;
    }
    if (mode === "host") {
      currentMouse = { x, y };
      return; // 房主本地直通
    }
    ArcadeNet.send({
      t: "in",
      kind: "mouse",
      type: ev.type,
      x,
      y,
      button: ev.button,
      buttons: ev.buttons
    });
  }

  function setupInput() {
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    stageEl.addEventListener("pointerdown", onPointer, true);
    stageEl.addEventListener("pointermove", onPointer, true);
    stageEl.addEventListener("pointerup", onPointer, true);
  }

  /* ---------------- 房主：注入远端输入（模拟按键/鼠标） ---------------- */

  function onRemoteInput(m) {
    if (mode !== "host") return;
    if (m.kind === "key") {
      injectKey(m.type, m.code, m.key, m.keyCode, m.repeat);
    } else if (m.kind === "mouse") {
      currentMouse = { x: m.x, y: m.y };
      injectPointer(m.type, m.x, m.y, m.button, m.buttons);
    }
  }

  function injectKey(type, code, key, keyCode, repeat) {
    if (!playerEl) return;
    try {
      // dispatch 到 window：Ruffle 的键盘监听可能挂在 window 捕获阶段，
      // 若只 dispatch 到 playerEl 则捕获阶段不会触发（注入会被静默忽略）
      window.dispatchEvent(
        new KeyboardEvent(type, {
          key: key || "",
          code: code || "",
          keyCode: keyCode || 0,
          which: keyCode || 0,
          repeat: !!repeat,
          bubbles: true,
          cancelable: true
        })
      );
    } catch (e) {
      console.error(e);
    }
  }

  let injectPointerId = null;
  let injectSeq = 0;

  function injectPointer(type, x, y, button, buttons) {
    const canvas = getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // 手势内（hover/down/up）使用同一个非 1 的稳定 pointerId：
    // 1. Ruffle 对 id=1 的指针状态会卡死（历史注入遗留问题）
    // 2. hover 与按下若用不同 id，Ruffle 按指针追踪按钮状态会错配
    if (injectPointerId == null) {
      injectPointerId = 1000 + ++injectSeq;
    }
    const pid = injectPointerId;
    if (type === "pointerup" || type === "pointercancel") {
      injectPointerId = null;
    }
    const clientX = rect.left + x * rect.width;
    const clientY = rect.top + y * rect.height;
    try {
      const ev = new PointerEvent(type, {
        clientX,
        clientY,
        button: button || 0,
        buttons: buttons || 0,
        pointerId: pid,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(ev, "offsetX", { value: x * gameMeta.width });
      Object.defineProperty(ev, "offsetY", { value: y * gameMeta.height });
      canvas.dispatchEvent(ev);
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------------- 座位边界 ---------------- */

  function onClearKeys(m) {
    if (mode !== "host") return;
    const meta = seatMeta(m.seat);
    if (!meta) return;
    for (const code of meta.keys) {
      injectKey("keyup", code, "", 0, false);
    }
  }

  /* ---------------- UI ---------------- */

  function render() {
    const me = state.members.find((m) => m.id === myId);
    mySeat = me ? me.seat : null;

    document.getElementById("spec-notice").style.display =
      mySeat != null ? "none" : "block";

    const hostMember = state.members.find((m) => m.id === state.hostId);
    const hostEl = document.getElementById("host-line");
    if (state.hostId === myId) {
      hostEl.textContent = "你是房主：本机运行游戏，画面直播中";
      document.getElementById("become-host").style.display = "none";
    } else if (state.hostId == null) {
      hostEl.textContent = "房间暂无房主（游戏未运行）";
      document.getElementById("become-host").style.display = "block";
    } else {
      hostEl.textContent = "房主：" + (hostMember ? hostMember.name : "?") + "（画面由房主直播）";
      document.getElementById("become-host").style.display = "none";
    }

    for (const seat of [1, 2]) {
      const meta = gameMeta.seats.find((s) => s.seat === seat);
      const row = document.getElementById("seat-" + seat);
      row.querySelector(".seat-name").textContent = meta.label + " " + meta.hint;
      const occupantId = state.seats[seat];
      const occupant = state.members.find((m) => m.id === occupantId);
      const who = row.querySelector(".who");
      const btn = row.querySelector(".btn");
      if (occupantId == null) {
        who.textContent = "空闲";
        who.classList.remove("mine");
        btn.textContent = "占座";
        btn.disabled = false;
      } else if (occupantId === myId) {
        who.textContent = occupant ? occupant.name + "（你）" : "你";
        who.classList.add("mine");
        btn.textContent = "离座";
        btn.disabled = false;
      } else {
        who.textContent = occupant ? occupant.name : "?";
        who.classList.remove("mine");
        btn.textContent = "已占用";
        btn.disabled = true;
      }
    }

    const specs = state.members.filter((m) => m.seat == null);
    document.getElementById("spec-count").textContent = "(" + specs.length + ")";
    const list = document.getElementById("spec-list");
    list.innerHTML = "";
    if (!specs.length) {
      const li = document.createElement("li");
      li.textContent = "暂无游客";
      list.appendChild(li);
    }
    for (const s of specs) {
      const li = document.createElement("li");
      li.textContent = s.name + (s.id === myId ? "（你）" : "");
      list.appendChild(li);
    }
  }

  function onMouseOwner(m) {
    document.getElementById("mouse-owner").textContent = m.name || "无人";
  }

  function onSys(m) {
    let text = "";
    if (m.action === "join") text = m.name + " 进入房间（观战）";
    else if (m.action === "leave") text = m.name + " 离开了房间";
    else if (m.action === "sit") text = m.name + " 坐上了 P" + m.seat;
    else if (m.action === "host") text = m.name + " 成为房主（唯一播放器）";
    else if (m.action === "hostLeft") text = m.name + "（房主）离开了，游戏已停止，可点击「成为房主」重启";
    log(text, m.action);
  }

  function log(text, cls) {
    const box = document.getElementById("log");
    const d = document.createElement("div");
    d.className = cls || "";
    d.textContent = new Date().toLocaleTimeString() + " " + text;
    box.appendChild(d);
    while (box.children.length > 40) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  /* ---------------- 按钮 ---------------- */

  document.querySelectorAll(".seat-row .btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const seat = Number(btn.dataset.seat);
      const me = state.members.find((x) => x.id === myId);
      if (me && me.seat === seat) {
        ArcadeNet.send({ t: "leave" });
      } else if (!state.seats[seat]) {
        ArcadeNet.send({ t: "sit", seat });
      }
    });
  });

  document.getElementById("become-host").addEventListener("click", () => {
    ArcadeNet.send({ t: "becomeHost" });
  });
})();

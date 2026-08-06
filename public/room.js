"use strict";

(function () {
  const params = new URLSearchParams(location.search);
  const gameId = params.get("game") || "46923";
  const roomName = params.get("room") || "lobby";

  if (!ensureName()) return;

  let gameMeta = null;
  let myId = null;
  let mySeat = null;
  let state = { members: [], seats: { 1: null, 2: null }, mouseOwner: null };
  let playerEl = null;
  let canvasEl = null;
  let stageEl = document.getElementById("stage");
  const heldKeys = new Set();
  let lastMoveSend = 0;

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
      setupRuffle();
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

  function onState(s) {
    state = s;
    render();
  }

  function onMouseOwner(m) {
    document.getElementById("mouse-owner").textContent = m.name || "无人";
  }

  function onSys(m) {
    let text = "";
    if (m.action === "join") text = m.name + " 进入房间（观战）";
    else if (m.action === "leave") text = m.name + " 离开了房间";
    else if (m.action === "sit") text = m.name + " 坐上了 P" + m.seat;
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

  function render() {
    const me = state.members.find((m) => m.id === myId);
    mySeat = me ? me.seat : null;

    const overlay = document.getElementById("overlay");
    if (mySeat != null) {
      overlay.classList.remove("show");
    } else {
      overlay.textContent =
        "观战中 · 点击右侧座位占座即可操作\n（游客输入不会进入游戏）";
      overlay.classList.add("show");
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
        who.textContent = "你";
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

  /* ---------------- Ruffle ---------------- */

  function setupRuffle() {
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      autoplay: "on",
      letterbox: "off",
      preferredRenderer: "webgl"
    };
    const ruffle = window.RufflePlayer.newest();
    playerEl = ruffle.createPlayer();
    playerEl.config = {
      width: gameMeta.width,
      height: gameMeta.height,
      autoplay: "on",
      letterbox: "off"
    };
    stageEl.appendChild(playerEl);
    playerEl.load(gameMeta.swf);
  }

  function getCanvas() {
    if (!canvasEl) canvasEl = playerEl.querySelector("canvas");
    return canvasEl;
  }

  /* ---------------- 输入捕获（真实键盘/鼠标 → 本地注入 + 上报） ---------------- */

  function allGameCodes() {
    const set = new Set();
    for (const s of gameMeta.seats) for (const k of s.keys) set.add(k);
    return set;
  }

  function seatMeta(seat) {
    return gameMeta.seats.find((s) => s.seat === seat);
  }

  function onKey(ev) {
    const codes = allGameCodes();
    if (!codes.has(ev.code)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!ev.isTrusted) return;
    if (mySeat == null) return;
    const meta = seatMeta(mySeat);
    if (!meta.keys.includes(ev.code)) return;
    if (ev.type === "keydown") heldKeys.add(ev.code);
    else heldKeys.delete(ev.code);
    ArcadeNet.send({
      t: "in",
      kind: "key",
      type: ev.type,
      code: ev.code,
      key: ev.key,
      keyCode: ev.keyCode,
      repeat: ev.repeat
    });
    injectKey(ev.type, ev.code, ev.key, ev.keyCode, ev.repeat);
  }

  function onPointer(ev) {
    if (mySeat == null) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const rect = stageEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
    if (ev.type === "pointermove") {
      const now = performance.now();
      if (now - lastMoveSend < 30) return;
      lastMoveSend = now;
    } else {
      ev.preventDefault();
    }
    ev.stopPropagation();
    if (!ev.isTrusted) return;
    ArcadeNet.send({
      t: "in",
      kind: "mouse",
      type: ev.type,
      x,
      y,
      button: ev.button,
      buttons: ev.buttons
    });
    injectPointer(ev.type, x, y, ev.button, ev.buttons);
  }

  function setupInput() {
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    stageEl.addEventListener("pointerdown", onPointer, true);
    stageEl.addEventListener("pointermove", onPointer, true);
    stageEl.addEventListener("pointerup", onPointer, true);
  }

  /* ---------------- 远程输入注入（模拟按键/鼠标进入 Ruffle） ---------------- */

  function onRemoteInput(m) {
    if (m.from === myId) return;
    if (m.kind === "key") {
      injectKey(m.type, m.code, m.key, m.keyCode, m.repeat);
    } else if (m.kind === "mouse") {
      injectPointer(m.type, m.x, m.y, m.button, m.buttons);
    }
  }

  function injectKey(type, code, key, keyCode, repeat) {
    if (!playerEl) return;
    try {
      playerEl.dispatchEvent(
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

  function injectPointer(type, x, y, button, buttons) {
    const canvas = getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clientX = rect.left + x * rect.width;
    const clientY = rect.top + y * rect.height;
    try {
      const ev = new PointerEvent(type, {
        clientX,
        clientY,
        button: button || 0,
        buttons: buttons || 0,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(ev, "offsetX", { value: x * rect.width });
      Object.defineProperty(ev, "offsetY", { value: y * rect.height });
      canvas.dispatchEvent(ev);
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------------- 座位边界：clearKeys 时松开该座位全部按键 ---------------- */

  function onClearKeys(m) {
    const meta = seatMeta(m.seat);
    if (!meta) return;
    for (const code of meta.keys) {
      injectKey("keyup", code, "", 0, false);
    }
    if (mySeat === m.seat) {
      heldKeys.clear();
    }
  }

  /* ---------------- 座位按钮 ---------------- */

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
})();

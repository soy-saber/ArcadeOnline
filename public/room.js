"use strict";

(function () {
  // WebGL 上下文劫持：强制 preserveDrawingBuffer，保证能读回画面帧（否则捕获全黑）
  (function patchWebGL() {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (typeof type === "string" && type.indexOf("webgl") === 0) {
        attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
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
  let viewerVideo = null;
  let viewerTransport = "ws";
  let viewerPeer = null;
  let viewerPeerHostId = null;
  let pendingViewerCandidates = [];
  let tmpCanvas = null;
  let tmpCtx = null;
  let broadcastStream = null;
  let broadcastRenderTimer = null;
  let frameTimer = null;
  let capturePending = false;
  let pendingViewerFrame = null;
  let viewerDecodePending = false;
  const hostPeers = new Map();
  const hostPeerRetryTimers = new Map();
  let currentMouse = null;
  let lastMoveSend = 0;
  const VIRTUAL_GAMEPAD_ID = "ArcadeOnline Remote Input";
  const VIRTUAL_GAMEPAD_MIN_PRESS_MS = 40;
  const virtualGamepadButtonByCode = Object.freeze({
    KeyS: 0,
    KeyD: 1,
    KeyA: 2,
    KeyW: 3,
    Space: 6,
    Enter: 7,
    ArrowUp: 12,
    ArrowDown: 13,
    ArrowLeft: 14,
    ArrowRight: 15
  });
  const ruffleGamepadButtonMapping = Object.freeze({
    south: 83,
    east: 68,
    west: 65,
    north: 87,
    "left-trigger-2": 32,
    "right-trigger-2": 13,
    "dpad-up": 38,
    "dpad-down": 40,
    "dpad-left": 37,
    "dpad-right": 39
  });
  const virtualKeyPressedAt = new Map();
  const virtualKeyReleaseTimers = new Map();
  let virtualGamepad = null;
  let nativeGetGamepads = null;
  let virtualGamepadInstalled = false;
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
        reportViewerTransport();
      });
      ArcadeNet.on("state", onState);
      ArcadeNet.on("in", onRemoteInput);
      ArcadeNet.on("clearKeys", onClearKeys);
      ArcadeNet.on("mouseOwner", onMouseOwner);
      ArcadeNet.on("sys", onSys);
      ArcadeNet.on("frame", onFrame);
      ArcadeNet.on("signal", onSignal);
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
      ArcadeNet.send({
        t: "join",
        name: arcadeName(),
        session: arcadeSession(),
        gameId,
        room: roomName,
        rtcCapable: supportsWebRtc()
      });
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
    if (mode === "host") {
      syncHostStreamingDemand();
      syncHostPeers();
      syncFallbackCapture();
    } else {
      syncViewerHost();
      reportViewerTransport();
    }
    startStatusWatch();
    render();
  }

  function becomeHostMode() {
    stopViewerPeer(false);
    stopHostStreaming();
    mode = "host";
    pendingViewerFrame = null;
    log("你是房主：本机运行游戏，画面直播给全房间", "host");
    setupSw();
    destroyPlayer();
    setupRuffle();
    startHostStreaming();
  }

  function becomeViewerMode() {
    stopHostStreaming();
    mode = "viewer";
    destroyPlayer();
    if (!viewerCanvas) {
      viewerCanvas = document.createElement("canvas");
      viewerCanvas.width = gameMeta.width;
      viewerCanvas.height = gameMeta.height;
      viewerCtx = viewerCanvas.getContext("2d");
      viewerCtx.fillStyle = "#000";
      viewerCtx.fillRect(0, 0, gameMeta.width, gameMeta.height);
    }
    if (!viewerVideo) {
      viewerVideo = document.createElement("video");
      viewerVideo.width = gameMeta.width;
      viewerVideo.height = gameMeta.height;
      viewerVideo.autoplay = true;
      viewerVideo.muted = true;
      viewerVideo.playsInline = true;
      viewerVideo.addEventListener("playing", markViewerFrame);
      viewerVideo.addEventListener("timeupdate", markViewerFrame);
    }
    stageEl.appendChild(viewerCanvas);
    stageEl.appendChild(viewerVideo);
    setViewerTransport("ws");
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
      if (viewerTransport === "webrtc" && lastFrameAt > 0 && Date.now() - lastFrameAt >= 2500) {
        setViewerTransport("ws");
      }
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
    releaseAllVirtualKeys();
    try {
      if (playerEl && playerEl.destroy) playerEl.destroy();
    } catch (e) {}
    if (playerEl && playerEl.parentNode) playerEl.parentNode.removeChild(playerEl);
    playerEl = null;
    canvasEl = null;
  }

  // URL 重写是主路径；Service Worker 仅作为 HTTPS/localhost 下的旧版兜底。
  // 因此通过局域网 HTTP 访问的客户端也可以成为房主。
  function setupSw() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(function () {});
  }

  /* ---------------- 房主：Ruffle + WebRTC/截帧直播 ---------------- */

  function createVirtualGamepadButton() {
    const button = Object.create(GamepadButton.prototype);
    Object.defineProperties(button, {
      pressed: { value: false, writable: true, configurable: true },
      touched: { value: false, writable: true, configurable: true },
      value: { value: 0, writable: true, configurable: true }
    });
    return button;
  }

  function setupVirtualGamepad() {
    if (virtualGamepadInstalled) return true;
    if (
      typeof Gamepad !== "function" ||
      typeof GamepadButton !== "function" ||
      typeof navigator.getGamepads !== "function"
    ) {
      return false;
    }

    try {
      const buttons = Array.from({ length: 17 }, createVirtualGamepadButton);
      virtualGamepad = Object.create(Gamepad.prototype);
      Object.defineProperties(virtualGamepad, {
        id: { value: VIRTUAL_GAMEPAD_ID, configurable: true },
        index: { value: 0, writable: true, configurable: true },
        connected: { value: true, configurable: true },
        timestamp: { value: performance.now(), writable: true, configurable: true },
        mapping: { value: "standard", configurable: true },
        axes: { value: [0, 0, 0, 0], configurable: true },
        buttons: { value: buttons, configurable: true }
      });

      nativeGetGamepads = navigator.getGamepads.bind(navigator);
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: function () {
          let gamepads = [];
          try {
            gamepads = Array.from(nativeGetGamepads() || []);
          } catch (e) {}
          let index = gamepads.findIndex((gamepad) => gamepad == null);
          if (index < 0) index = gamepads.length;
          virtualGamepad.index = index;
          gamepads[index] = virtualGamepad;
          return gamepads;
        }
      });
      virtualGamepadInstalled = true;
      return true;
    } catch (e) {
      virtualGamepad = null;
      return false;
    }
  }

  function releaseVirtualKey(code) {
    if (!virtualGamepad) return;
    const index = virtualGamepadButtonByCode[code];
    if (index == null) return;
    const button = virtualGamepad.buttons[index];
    button.pressed = false;
    button.touched = false;
    button.value = 0;
    virtualGamepad.timestamp = performance.now();
    virtualKeyPressedAt.delete(code);
    virtualKeyReleaseTimers.delete(code);
  }

  function setVirtualKey(code, pressed, immediate) {
    if (!virtualGamepadInstalled || !virtualGamepad) return false;
    const index = virtualGamepadButtonByCode[code];
    if (index == null) return false;
    const pendingRelease = virtualKeyReleaseTimers.get(code);
    if (pendingRelease) {
      clearTimeout(pendingRelease);
      virtualKeyReleaseTimers.delete(code);
    }

    const button = virtualGamepad.buttons[index];
    if (pressed) {
      if (!button.pressed) virtualKeyPressedAt.set(code, performance.now());
      button.pressed = true;
      button.touched = true;
      button.value = 1;
      virtualGamepad.timestamp = performance.now();
      return true;
    }

    const pressedAt = virtualKeyPressedAt.get(code);
    const remaining =
      immediate || pressedAt == null
        ? 0
        : VIRTUAL_GAMEPAD_MIN_PRESS_MS - (performance.now() - pressedAt);
    if (remaining <= 0) {
      releaseVirtualKey(code);
    } else {
      virtualKeyReleaseTimers.set(
        code,
        setTimeout(function () {
          releaseVirtualKey(code);
        }, remaining)
      );
    }
    return true;
  }

  function releaseAllVirtualKeys() {
    for (const timer of virtualKeyReleaseTimers.values()) clearTimeout(timer);
    virtualKeyReleaseTimers.clear();
    if (!virtualGamepad) {
      virtualKeyPressedAt.clear();
      return;
    }
    for (const code of Object.keys(virtualGamepadButtonByCode)) {
      releaseVirtualKey(code);
    }
  }

  function setupRuffle() {
    setupVirtualGamepad();
    const urlRewriteRules = [
      [/^https?:\/\/(?:www\.)?mochibot\.com(?:\/.*)?$/i, location.origin + "/mochibot.swf"]
    ];
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      autoplay: "on",
      letterbox: "off",
      preferredRenderer: "webgl",
      preserveDrawingBuffer: true,
      gamepadButtonMapping: ruffleGamepadButtonMapping,
      urlRewriteRules
    };
    const ruffle = window.RufflePlayer.newest();
    ruffleApi = ruffle;
    playerEl = ruffle.createPlayer();
    playerEl.setAttribute("width", String(gameMeta.width));
    playerEl.setAttribute("height", String(gameMeta.height));
    playerEl.config = {
      autoplay: "on",
      letterbox: "off",
      preserveDrawingBuffer: true,
      gamepadButtonMapping: ruffleGamepadButtonMapping,
      urlRewriteRules
    };
    if (playerEl.tabIndex === -1 || playerEl.tabIndex === undefined) {
      playerEl.tabIndex = 0;
    }
    stageEl.appendChild(playerEl);
    playerEl.load(gameMeta.swf);
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function getCanvas() {
    if (!canvasEl) {
      canvasEl =
        (playerEl.shadowRoot && playerEl.shadowRoot.querySelector("canvas")) ||
        playerEl.querySelector("canvas");
    }
    return canvasEl;
  }

  function supportsWebRtc() {
    return typeof RTCPeerConnection === "function";
  }

  function supportsHostCapture() {
    return (
      supportsWebRtc() &&
      typeof HTMLCanvasElement.prototype.captureStream === "function"
    );
  }

  function startHostStreaming() {
    stopHostStreaming();
    syncHostStreamingDemand();
  }

  function stopHostStreaming() {
    stopFrameCapture();
    stopWebRtcStreaming();
    tmpCanvas = null;
    tmpCtx = null;
  }

  function stopWebRtcStreaming() {
    if (broadcastRenderTimer) {
      clearInterval(broadcastRenderTimer);
      broadcastRenderTimer = null;
    }
    if (broadcastStream) {
      for (const track of broadcastStream.getTracks()) track.stop();
      broadcastStream = null;
    }
    closeAllHostPeers();
  }

  function syncHostStreamingDemand() {
    if (mode !== "host") return;
    const webRtcNeeded = state.members.some(
      (member) => member.id !== myId && member.rtcCapable
    );
    if (!webRtcNeeded || !supportsHostCapture()) {
      stopWebRtcStreaming();
      stageEl.dataset.hostStream = webRtcNeeded ? "fallback" : "idle";
      return;
    }
    if (broadcastRenderTimer) return;
    stageEl.dataset.hostStream = "starting";
    broadcastRenderTimer = setInterval(renderBroadcastFrame, 1000 / 60);
    renderBroadcastFrame();
  }

  function renderBroadcastFrame() {
    if (mode !== "host") return;
    const src = getCanvas();
    if (!src) return;
    if (!tmpCanvas) {
      tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = gameMeta.width;
      tmpCanvas.height = gameMeta.height;
      tmpCtx = tmpCanvas.getContext("2d", { alpha: false });
      tmpCtx.imageSmoothingEnabled = false;
    }
    tmpCtx.drawImage(src, 0, 0, gameMeta.width, gameMeta.height);
    drawMouseCursor(tmpCtx);
    if (broadcastStream || !supportsHostCapture()) return;
    try {
      broadcastStream = tmpCanvas.captureStream(60);
      const videoTrack = broadcastStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.contentHint = "motion";
      stageEl.dataset.hostStream = "webrtc-ready";
      syncHostPeers();
    } catch (e) {
      stageEl.dataset.hostStream = "fallback";
      if (broadcastRenderTimer) {
        clearInterval(broadcastRenderTimer);
        broadcastRenderTimer = null;
      }
      console.warn("WebRTC 画面捕获不可用，继续使用截帧直播", e);
    }
  }

  function drawMouseCursor(ctx) {
    if (!currentMouse) return;
    const x = currentMouse.x * gameMeta.width;
    const y = currentMouse.y * gameMeta.height;
    ctx.fillStyle = "#ffe100";
    ctx.fillRect(x - 7, y - 1, 14, 2);
    ctx.fillRect(x - 1, y - 7, 2, 14);
  }

  function syncFallbackCapture() {
    if (mode !== "host") {
      stopFrameCapture();
      return;
    }
    const fallbackNeeded = state.members.some(
      (member) => member.id !== myId && member.streamTransport !== "webrtc"
    );
    stageEl.dataset.fallbackNeeded = String(fallbackNeeded);
    if (fallbackNeeded && !frameTimer) {
      frameTimer = setInterval(captureFrame, 100);
      captureFrame();
    } else if (!fallbackNeeded) {
      stopFrameCapture();
    }
  }

  function stopFrameCapture() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    capturePending = false;
  }

  function captureFrame() {
    if (capturePending || mode !== "host") return;
    const src = getCanvas();
    if (!src) return;
    if (!tmpCanvas) {
      tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = gameMeta.width;
      tmpCanvas.height = gameMeta.height;
      tmpCtx = tmpCanvas.getContext("2d", { alpha: false });
      tmpCtx.imageSmoothingEnabled = false;
    }
    tmpCtx.drawImage(src, 0, 0, gameMeta.width, gameMeta.height);
    drawMouseCursor(tmpCtx);
    capturePending = true;
    tmpCanvas.toBlob(function (blob) {
      capturePending = false;
      if (blob && mode === "host") ArcadeNet.sendBlob(blob);
    }, "image/webp", 0.9);
  }

  function createPeerConnection() {
    return new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }]
    });
  }

  function sendSignal(to, kind, data) {
    ArcadeNet.send({ t: "signal", to, kind, data });
  }

  function serializeCandidate(candidate) {
    return candidate.toJSON
      ? candidate.toJSON()
      : {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment
        };
  }

  function serializeDescription(description) {
    return { type: description.type, sdp: description.sdp };
  }

  function syncHostPeers() {
    if (mode !== "host" || !broadcastStream || !supportsWebRtc()) return;
    const viewers = new Set(
      state.members
        .filter((member) => member.id !== myId && member.rtcCapable)
        .map((member) => member.id)
    );
    for (const id of hostPeers.keys()) {
      if (!viewers.has(id)) closeHostPeer(id);
    }
    for (const id of hostPeerRetryTimers.keys()) {
      if (!viewers.has(id)) clearHostPeerRetry(id);
    }
    for (const id of viewers) {
      if (!hostPeers.has(id) && !hostPeerRetryTimers.has(id)) createHostPeer(id);
    }
  }

  function createHostPeer(viewerId) {
    if (mode !== "host" || !broadcastStream || hostPeers.has(viewerId)) return;
    let pc;
    try {
      pc = createPeerConnection();
    } catch (e) {
      return;
    }
    const peer = { pc, pendingCandidates: [], disconnectTimer: null };
    hostPeers.set(viewerId, peer);
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(viewerId, "ice", serializeCandidate(event.candidate));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = null;
      } else if (pc.connectionState === "failed") {
        scheduleHostPeerRetry(viewerId);
      } else if (pc.connectionState === "disconnected" && !peer.disconnectTimer) {
        peer.disconnectTimer = setTimeout(() => {
          if (pc.connectionState === "disconnected") scheduleHostPeerRetry(viewerId);
        }, 3000);
      }
    };
    for (const track of broadcastStream.getTracks()) {
      const sender = pc.addTrack(track, broadcastStream);
      preferH264(pc, sender);
      const parameters = sender.getParameters();
      if (!parameters.encodings || !parameters.encodings.length) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = 4000000;
      parameters.encodings[0].maxFramerate = 60;
      sender.setParameters(parameters).catch(function () {});
    }
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => sendSignal(viewerId, "offer", serializeDescription(pc.localDescription)))
      .catch(() => scheduleHostPeerRetry(viewerId));
  }

  function preferH264(pc, sender) {
    if (
      typeof RTCRtpSender === "undefined" ||
      !RTCRtpSender.getCapabilities ||
      typeof RTCRtpTransceiver === "undefined" ||
      !RTCRtpTransceiver.prototype.setCodecPreferences
    ) return;
    const capabilities = RTCRtpSender.getCapabilities("video");
    if (!capabilities) return;
    const h264 = capabilities.codecs.filter(
      (codec) => codec.mimeType.toLowerCase() === "video/h264"
    );
    if (!h264.length) return;
    const others = capabilities.codecs.filter(
      (codec) => codec.mimeType.toLowerCase() !== "video/h264"
    );
    const transceiver = pc.getTransceivers().find((item) => item.sender === sender);
    if (transceiver) {
      try {
        transceiver.setCodecPreferences(h264.concat(others));
      } catch (e) {}
    }
  }

  function scheduleHostPeerRetry(viewerId) {
    closeHostPeer(viewerId);
    if (hostPeerRetryTimers.has(viewerId)) return;
    const timer = setTimeout(() => {
      hostPeerRetryTimers.delete(viewerId);
      if (
        mode === "host" &&
        state.members.some((member) => member.id === viewerId && member.rtcCapable)
      ) {
        createHostPeer(viewerId);
      }
    }, 1500);
    hostPeerRetryTimers.set(viewerId, timer);
  }

  function clearHostPeerRetry(viewerId) {
    const timer = hostPeerRetryTimers.get(viewerId);
    if (timer) clearTimeout(timer);
    hostPeerRetryTimers.delete(viewerId);
  }

  function closeHostPeer(viewerId) {
    const peer = hostPeers.get(viewerId);
    if (!peer) return;
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    peer.pc.onconnectionstatechange = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
    hostPeers.delete(viewerId);
  }

  function closeAllHostPeers() {
    for (const id of Array.from(hostPeers.keys())) closeHostPeer(id);
    for (const id of Array.from(hostPeerRetryTimers.keys())) clearHostPeerRetry(id);
  }

  function createViewerPeer(hostId) {
    const earlyCandidates = pendingViewerCandidates.splice(0);
    stopViewerPeer();
    let pc;
    try {
      pc = createPeerConnection();
    } catch (e) {
      return null;
    }
    const peer = { pc, pendingCandidates: earlyCandidates };
    viewerPeer = peer;
    viewerPeerHostId = hostId;
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(hostId, "ice", serializeCandidate(event.candidate));
    };
    pc.ontrack = (event) => {
      if (viewerPeer !== peer || !viewerVideo) return;
      viewerVideo.srcObject = event.streams[0] || new MediaStream([event.track]);
      viewerVideo.play().catch(function () {});
    };
    pc.onconnectionstatechange = () => {
      if (viewerPeer !== peer) return;
      if (pc.connectionState === "connected") {
        if (viewerVideo && viewerVideo.readyState >= 2) setViewerTransport("webrtc");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        setViewerTransport("ws");
      }
    };
    return peer;
  }

  function stopViewerPeer(reportFallback = true) {
    if (viewerPeer) {
      viewerPeer.pc.onconnectionstatechange = null;
      viewerPeer.pc.onicecandidate = null;
      viewerPeer.pc.ontrack = null;
      viewerPeer.pc.close();
    }
    viewerPeer = null;
    viewerPeerHostId = null;
    pendingViewerCandidates = [];
    if (viewerVideo) viewerVideo.srcObject = null;
    if (reportFallback && mode === "viewer") setViewerTransport("ws");
  }

  function syncViewerHost() {
    if (mode !== "viewer") return;
    if (viewerPeerHostId && viewerPeerHostId !== state.hostId) stopViewerPeer();
  }

  function setViewerTransport(transport) {
    const nextTransport = transport === "webrtc" ? "webrtc" : "ws";
    const changed = viewerTransport !== nextTransport;
    viewerTransport = nextTransport;
    stageEl.dataset.streamTransport = viewerTransport;
    if (viewerCanvas) viewerCanvas.style.display = viewerTransport === "ws" ? "block" : "none";
    if (viewerVideo) viewerVideo.style.display = viewerTransport === "webrtc" ? "block" : "none";
    if (viewerTransport === "webrtc") lastFrameAt = Date.now();
    if (changed) reportViewerTransport();
  }

  function reportViewerTransport() {
    if (mode !== "viewer" || !myId || !ArcadeNet.connected) return;
    ArcadeNet.send({ t: "streamTransport", transport: viewerTransport });
  }

  function markViewerFrame() {
    lastFrameAt = Date.now();
    if (
      mode === "viewer" &&
      viewerTransport !== "webrtc" &&
      viewerPeer &&
      viewerPeer.pc.connectionState === "connected" &&
      viewerVideo &&
      viewerVideo.readyState >= 2
    ) {
      setViewerTransport("webrtc");
    }
  }

  async function addPeerCandidate(peer, data) {
    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(data);
      return;
    }
    try {
      await peer.pc.addIceCandidate(data);
    } catch (e) {}
  }

  async function flushPeerCandidates(peer) {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) await addPeerCandidate(peer, candidate);
  }

  async function onSignal(message) {
    if (!supportsWebRtc() || !message || !message.from) return;
    if (mode === "host") {
      const peer = hostPeers.get(message.from);
      if (!peer) return;
      try {
        if (message.kind === "answer") {
          await peer.pc.setRemoteDescription(message.data);
          await flushPeerCandidates(peer);
        } else if (message.kind === "ice") {
          await addPeerCandidate(peer, message.data);
        }
      } catch (e) {
        scheduleHostPeerRetry(message.from);
      }
      return;
    }
    if (mode !== "viewer" || message.from !== state.hostId) return;
    try {
      if (message.kind === "offer") {
        const peer = createViewerPeer(message.from);
        if (!peer) return;
        await peer.pc.setRemoteDescription(message.data);
        await flushPeerCandidates(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        sendSignal(message.from, "answer", serializeDescription(peer.pc.localDescription));
      } else if (
        message.kind === "ice" &&
        viewerPeer &&
        viewerPeerHostId === message.from
      ) {
        await addPeerCandidate(viewerPeer, message.data);
      } else if (message.kind === "ice" && !viewerPeer) {
        pendingViewerCandidates.push(message.data);
      }
    } catch (e) {
      stopViewerPeer();
    }
  }

  /* ---------------- 观战：渲染房主流帧 ---------------- */

  function onFrame(blob) {
    if (mode !== "viewer" || viewerTransport === "webrtc") return;
    if (!viewerCtx) return;
    lastFrameAt = Date.now();
    pendingViewerFrame = blob;
    decodeLatestViewerFrame();
  }

  function decodeLatestViewerFrame() {
    if (viewerDecodePending || !pendingViewerFrame || mode !== "viewer" || !viewerCtx) return;
    const blob = pendingViewerFrame;
    pendingViewerFrame = null;
    viewerDecodePending = true;
    createImageBitmap(blob)
      .then(function (bmp) {
        if (mode !== "viewer" || !viewerCtx) {
          bmp.close();
          return;
        }
        viewerCtx.drawImage(bmp, 0, 0, gameMeta.width, gameMeta.height);
        bmp.close();
      })
      .catch(function () {})
      .finally(function () {
        viewerDecodePending = false;
        decodeLatestViewerFrame();
      });
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
    if (setVirtualKey(code, type === "keydown", false)) return;
    try {
      if (document.activeElement !== playerEl) {
        try {
          playerEl.focus({ preventScroll: true });
        } catch (e) {
          playerEl.focus();
        }
      }
      // Older browsers without Gamepad support retain the DOM event fallback.
      playerEl.dispatchEvent(
        new KeyboardEvent(type, {
          key: key || "",
          code: code || "",
          keyCode: keyCode || 0,
          which: keyCode || 0,
          repeat: !!repeat,
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window
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
      if (!setVirtualKey(code, false, true)) {
        injectKey("keyup", code, "", 0, false);
      }
    }
  }

  /* ---------------- UI ---------------- */

  function render() {
    const me = state.members.find((m) => m.id === myId);
    mySeat = me ? me.seat : null;

    document.getElementById("mouse-owner").textContent =
      state.mouseOwnerName || "无人";

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
      row.querySelector(".seat-name").textContent = meta.label + " · " + meta.hint;
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
    else if (m.action === "reconnect") text = m.name + " 已重新连接";
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
        ArcadeNet.send({ t: "leaveSeat" });
      } else if (!state.seats[seat]) {
        ArcadeNet.send({ t: "sit", seat });
      }
    });
  });

  document.getElementById("become-host").addEventListener("click", () => {
    ArcadeNet.send({ t: "becomeHost" });
  });

  document.getElementById("leave-room").addEventListener("click", (e) => {
    e.preventDefault();
    ArcadeNet.send({ t: "leave" });
    location.href = "/";
  });
})();

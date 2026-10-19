import { cloneState, createGame, DEFAULT_OPTIONS, EMPTY_INPUT, GameOptions, GameState, HZ, Input, ITEM_LABELS, position, reconcile, STEP_MS, step, validInput, validState } from "./core";
import { Network, Packet } from "./network";
import { GameView } from "./view";

declare function ensureName(next?: string): boolean;
declare function arcadeName(): string;
declare function arcadeSession(): string;

const params = new URLSearchParams(location.search);
if (ensureName()) start();

function start(): void {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const roomName = (params.get("room") || "lobby").slice(0, 20);
  const net = new Network(arcadeName(), arcadeSession(), roomName, "3881-native", params.get("debug") === "1" && params.get("turn") === "1");
  const view = new GameView(element<HTMLCanvasElement>("game-canvas"));
  let state: GameState | null = null, authority: GameState | null = null;
  let pending: Input[] = [], sequence = 0, bombCounter = 0, specialCounter = 0;
  let options: GameOptions = { ...DEFAULT_OPTIONS, mode: "online", bots: [], activeSeats: [1, 2] };
  let hostId: string | null = null, seat: number | null = null, roster = "";
  let lastSnapshotAt = 0, counter = 0, corrections = 0;
  let inputAt = 0, awaitingPaint = false;
  const responseSamples: number[] = [];
  const keys = new Map<string, number>();
  const remote = new Map<string, { input: Input; at: number }>();
  let byteSample = { at: performance.now(), bytes: 0, rate: 0 };
  const directions: Record<string, number> = { KeyA: 0, ArrowLeft: 0, KeyW: 1, ArrowUp: 1, KeyD: 2, ArrowRight: 2, KeyS: 3, ArrowDown: 3 };
  element("room-name").textContent = roomName;
  element("my-name").textContent = arcadeName();
  localStorage.setItem("arcade_recent_game", "3881-native");

  function notice(text: string): void { element("connection-note").textContent = text; }
  function clearInput(): void { keys.clear(); }
  function resetInput(): void { clearInput(); sequence = 0; bombCounter = 0; specialCounter = 0; pending = []; remote.clear(); }
  function newRound(playing: boolean): void {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    // Wall time identifies a new round only; it never enters simulation steps.
    // A host page reload must not restart IDs at 1 and strand existing peers.
    options.activeSeats = [1, 2, 3, 4].filter((number) => !!net.room.seats[number]);
    authority = createGame(seed, Math.max(Date.now(), (authority?.round || 0) + 1, (state?.round || 0) + 1), playing, options);
    state = authority; resetInput(); broadcast();
    if (playing) net.control({ t: "resetReady" });
    if (playing) notice("游戏进行中");
  }
  function broadcast(): void {
    if (!authority || !net.isHost) return;
    for (const member of net.room.members) if (member.id !== net.id) net.send(member.id, { type: "snapshot", state: authority });
    view.confirm(authority);
  }

  net.onStatus = (text) => {
    notice(text);
    if (!net.connected) clearInput();
    updateUi();
  };
  net.onRoom = (room) => {
    const changedHost = hostId !== room.hostId;
    const changedRoster = roster !== JSON.stringify(room.seats);
    hostId = room.hostId; roster = JSON.stringify(room.seats);
    if (seat !== net.seat || changedHost) resetInput();
    seat = net.seat;
    if (net.isHost && (changedHost || changedRoster || !authority)) {
      newRound(false);
      notice(changedHost ? "房主已就绪，请玩家入座并准备" : "席位已更新，等待准备");
    } else if (!net.isHost && changedHost) {
      state = null; authority = null; lastSnapshotAt = 0;
      notice("正在同步房间");
    }
    if (net.isHost && !changedRoster && authority?.phase !== "playing" &&
        room.members.filter((member) => member.seat != null).length >= 2 &&
        room.members.filter((member) => member.seat != null).every((member) => member.ready)) newRound(true);
    updateUi();
  };
  net.onPacket = (from: string, packet: Packet) => {
    if (packet.type === "input" && net.isHost && authority && packet.round === authority.round && validInput(packet.input)) {
      const member = net.room.members.find((member) => member.id === from);
      if (!member?.seat || member.seat < 1 || member.seat > 4) return;
      const previous = remote.get(from);
      if (packet.input.seq > (previous?.input.seq || 0)) remote.set(from, { input: packet.input, at: performance.now() });
    }
    if (packet.type === "snapshot" && !net.isHost && from === net.room.hostId && validState(packet.state)) {
      const snapshot = packet.state;
      if (authority && (snapshot.round < authority.round || (snapshot.round === authority.round && snapshot.tick < authority.tick))) return;
      const newGame = !authority || snapshot.round !== authority.round;
      const before = state && seat ? position(state.players[seat - 1]) : null;
      if (newGame) resetInput();
      authority = snapshot; lastSnapshotAt = performance.now();
      if (seat) {
        sequence = Math.max(sequence, snapshot.ack[seat - 1]);
        bombCounter = Math.max(bombCounter, snapshot.players[seat - 1].lastBomb);
        specialCounter = Math.max(specialCounter, snapshot.players[seat - 1].lastSpecial);
      }
      if (seat && !newGame) {
        const result = reconcile(snapshot, seat, pending);
        state = result.state; pending = result.pending;
      } else state = cloneState(snapshot);
      if (before && seat && !newGame) {
        const after = position(state.players[seat - 1]);
        if (Math.hypot(before.x - after.x, before.y - after.y) > .35) corrections++;
      }
      view.confirm(snapshot);
      if (newGame) {
        notice(snapshot.phase === "playing" ? "游戏进行中" : "同步完成，等待房主开始");
        updateUi();
      }
    }
  };

  function currentInput(): Input {
    let latest = -1, direction = -1;
    for (const [key, time] of keys) if (directions[key] !== undefined && time >= latest) { latest = time; direction = directions[key]; }
    return { seq: ++sequence, dir: direction as Input["dir"], bomb: bombCounter, special: specialCounter };
  }

  function tick(): void {
    counter++;
    if (!net.connected || !state || !authority) return;
    const input = seat && state.phase === "playing" ? currentInput() : { ...EMPTY_INPUT };
    if (net.isHost) {
      const inputs = [1, 2, 3, 4].map((number) => {
        const id = net.room.seats[number];
        if (id === net.id) return input;
        const item = id ? remote.get(id) : null;
        return item && performance.now() - item.at < 600 ? item.input :
          { ...(item?.input || EMPTY_INPUT), dir: -1 as const };
      });
      step(authority, inputs); state = authority;
      if (counter % 3 === 0) broadcast();
    } else if (seat && authority.phase === "playing") {
      // Input remains a full current state on every tick, so a lost key-up or
      // bomb-edge packet is repaired by subsequent packets.
      if (input.seq === 0) Object.assign(input, currentInput());
      net.send(net.room.hostId!, { type: "input", round: authority.round, input });
      if (performance.now() - lastSnapshotAt < 1800) {
        pending.push(input); pending = pending.slice(-HZ * 2);
        const inputs = state.inputs.map((value) => ({ ...value }));
        inputs[seat - 1] = input; step(state, inputs);
      }
    }
    if (inputAt) awaitingPaint = true;
  }

  function key(event: KeyboardEvent, pressed: boolean): void {
    if ((event.target as HTMLElement)?.matches("input, textarea, select, button")) return;
    if (!(event.code in directions) && !["Space", "Enter", "KeyE", "ShiftLeft", "ShiftRight"].includes(event.code)) return;
    event.preventDefault();
    if (!seat || state?.phase !== "playing") return;
    if (pressed) {
      if (!keys.has(event.code)) {
        if (event.code === "Space" || event.code === "Enter") bombCounter++;
        if (["KeyE", "ShiftLeft", "ShiftRight"].includes(event.code)) specialCounter++;
        keys.set(event.code, performance.now()); inputAt = performance.now();
      }
    } else keys.delete(event.code);
  }
  window.addEventListener("keydown", (event) => key(event, true));
  window.addEventListener("keyup", (event) => key(event, false));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
    const code = button.dataset.key!;
    button.onpointerdown = (event) => {
      if (!seat || state?.phase !== "playing") return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      if (code === "Space" && !keys.has(code)) bombCounter++;
      if (code === "KeyE" && !keys.has(code)) specialCounter++;
      keys.set(code, performance.now()); inputAt = performance.now();
    };
    const release = () => keys.delete(code);
    button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-seat]")) button.onclick = () => {
    const requested = Number(button.dataset.seat);
    net.control(seat === requested ? { t: "leaveSeat" } : { t: "sit", seat: requested });
    button.blur();
  };
  for (const key of ["map", "loadout"] as const) {
    element<HTMLSelectElement>(`game-${key}`).onchange = (event) => {
      if (!net.isHost || authority?.phase === "playing") return;
      options = { ...options, [key]: (event.target as HTMLSelectElement).value };
      newRound(false); net.control({ t: "resetReady" }); updateUi();
    };
  }
  element<HTMLButtonElement>("start-game").onclick = () => {
    if (seat && authority?.phase !== "playing") {
      const mine = net.room.members.find((member) => member.id === net.id);
      net.control({ t: "ready", ready: !mine?.ready });
    }
    element("start-game").blur();
    updateUi();
  };
  element("copy-invite").onclick = async () => {
    const invite = new URL(location.href); invite.searchParams.delete("debug");
    invite.searchParams.delete("turn");
    try { await navigator.clipboard.writeText(invite.href); notice("邀请链接已复制"); }
    catch { const field = element<HTMLInputElement>("invite-link"); field.hidden = false; field.value = invite.href; field.select(); notice("复制下方链接即可邀请好友"); }
  };
  element("sound-toggle").onclick = () => { view.sound = !view.sound; element("sound-toggle").textContent = view.sound ? "音效：开" : "音效：关"; };
  element("fullscreen-stage").onclick = () => { void element("native-stage").requestFullscreen().catch(() => {}); };
  element("leave-room").onclick = (event) => { event.preventDefault(); net.stop(); location.href = "/"; };

  function updateUi(): void {
    element("role-status").textContent = seat ? `P${seat} 玩家` : "观战";
    element("member-count").textContent = `${net.room.members.length} 人`;
    element("conn-badge").textContent = net.connected ? "已连接" : "重连中";
    element("conn-badge").className = `badge ${net.connected ? "ok" : "bad"}`;
    const host = net.room.members.find((member) => member.id === net.room.hostId);
    element("host-line").textContent = net.isHost ? "你是房主" : `房主：${host?.name || "等待中"}`;
    for (const number of [1, 2, 3, 4]) {
      const row = element(`seat-${number}`), member = net.room.members.find((value) => value.id === net.room.seats[number]);
      row.querySelector(".who")!.textContent = member ? `${member.name} · ${member.ready ? "已准备" : "未准备"}` : "空闲";
      const button = row.querySelector("button")!;
      button.textContent = seat === number ? "离座" : "入座";
      button.disabled = !!member && member.id !== net.id;
      row.classList.toggle("occupied", !!member);
      const player = state?.players[number - 1];
      row.querySelector(".player-stats")!.textContent = player && member ? `生命 ${player.life} · 炸弹 ${player.capacity} · 火力 ${player.range} · 速度 ${7 - player.speed}${player.shield ? " · 护盾" : ""}${player.push ? " · 推弹" : ""}${player.weapon ? ` · ${ITEM_LABELS[player.weapon]} ×${player.ammo}` : ""}${player.frozen ? " · 冻结" : player.slow ? " · 减速" : ""}` : "";
    }
    for (const key of ["map", "loadout"] as const) {
      const select = element<HTMLSelectElement>(`game-${key}`);
      select.disabled = !net.isHost || authority?.phase === "playing";
      if (state) select.value = state.options[key];
    }
    const inventory = seat && state ? state.players[seat - 1] : null;
    const weapon = inventory?.weapon;
    element("weapon-status-text").textContent = weapon ? `${ITEM_LABELS[weapon]} ×${inventory.ammo} · E / Shift 使用` : "尚未拾取特殊武器";
    element("special-button-text").textContent = weapon ? `${ITEM_LABELS[weapon]} ×${inventory.ammo}` : "特殊武器";
    for (const id of ["weapon-icon", "special-button-icon"]) {
      const icon = element<HTMLImageElement>(id);
      icon.hidden = !weapon;
      if (weapon) icon.src = `/native/assets/item-${weapon}.png`;
    }
    element("mode-note").textContent = `已入座 ${net.room.members.filter((member) => member.seat != null).length}/4 人；至少 2 人且所有已入座玩家准备后自动开局，最后存活者获胜。`;
    const startButton = element<HTMLButtonElement>("start-game");
    startButton.disabled = !net.connected || !seat || authority?.phase === "playing";
    startButton.textContent = net.room.members.find((member) => member.id === net.id)?.ready ? "取消准备" : "准备";
    element("seat-caption").textContent = seat ? "WASD / 方向键移动 · 空格放炸弹 · E / Shift 特殊武器" : "入座后即可操作，双方都使用自己的键盘";
    const other = net.isHost ? net.room.members.find((member) => member.id !== net.id && member.seat)?.id : net.room.hostId;
    const transport = other ? net.transport(other) : "waiting";
    element("transport-status").textContent = transport === "p2p" ? "对等连接" : transport === "relay" ? "中继连接" : "等待好友";
    const rtt = other ? net.rtt.get(other) : undefined;
    element("latency-status").textContent = rtt == null ? "—" : `${Math.round(rtt)} ms`;
    element("render-status").textContent = `${view.fps} FPS`;
    element("metrics-rtt").textContent = rtt == null ? "等待采样" : `${rtt.toFixed(1)} ms`;
    element("metrics-predict").textContent = responseSamples.length ? `${Math.max(...responseSamples.slice(-20)).toFixed(1)} ms（最近 20 次最大）` : "操作后采样";
    element("metrics-correction").textContent = String(corrections);
    element("metrics-age").textContent = net.isHost ? "本机权威" : lastSnapshotAt ? `${Math.round(performance.now() - lastSnapshotAt)} ms` : "等待同步";
    const now = performance.now(), bytes = net.sentBytes + net.receivedBytes;
    if (now - byteSample.at > 1000) byteSample = { at: now, bytes, rate: (bytes - byteSample.bytes) / (now - byteSample.at) };
    element("metrics-bandwidth").textContent = `${byteSample.rate.toFixed(1)} KB/s`;
    const stale = !net.connected || (!net.isHost && lastSnapshotAt > 0 && now - lastSnapshotAt > 1800);
    element("connection-overlay").hidden = !stale;
    element("connection-overlay").textContent = "连接恢复中，正在等待最新状态…";
    element("native-stage").dataset.transport = transport;
  }

  const clockUrl = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${STEP_MS});`], { type: "text/javascript" }));
  const worker = new Worker(clockUrl); URL.revokeObjectURL(clockUrl);
  let clockAt = performance.now(), accumulator = 0;
  worker.onmessage = () => {
    const now = performance.now(); accumulator += Math.min(now - clockAt, STEP_MS * 5); clockAt = now;
    while (accumulator >= STEP_MS) { tick(); accumulator -= STEP_MS; }
  };
  const render = () => {
    view.render(state, seat);
    if (awaitingPaint && inputAt) {
      responseSamples.push(performance.now() - inputAt);
      if (responseSamples.length > 100) responseSamples.shift();
      inputAt = 0; awaitingPaint = false;
    }
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
  window.setInterval(updateUi, 250);
  window.addEventListener("pagehide", () => { worker.terminate(); net.stop(false); });
  if (params.get("debug") === "1") {
    Object.assign(window, { __nativeTest: {
      get state() { return state && cloneState(state); },
      get authority() { return authority && cloneState(authority); },
      get pending() { return pending.length; },
      get seat() { return seat; },
      get responseSamples() { return [...responseSamples]; },
      get corrections() { return corrections; },
      network: net
    } });
  }
  void net.start();
}

import { cloneState, createGame, EMPTY_INPUT, GameState, HZ, Input, reconcile, STEP_MS, step, validInput, validState } from "./core";
import { Network, Packet } from "../native/network";
import { BadmintonView } from "./view";

declare function ensureName(next?: string): boolean;
declare function arcadeName(): string;
declare function arcadeSession(): string;

const params = new URLSearchParams(location.search);
if (ensureName()) start();

function start(): void {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const roomName = (params.get("room") || "lobby").slice(0, 20);
  const net = new Network(arcadeName(), arcadeSession(), roomName, "46923-native", params.get("turn") === "1");
  const view = new BadmintonView(el<HTMLCanvasElement>("game-canvas"));
  let soundEnabled = localStorage.getItem("arcade_native_sound") !== "off";
  let volume = Math.max(0, Math.min(100, Number(localStorage.getItem("arcade_native_volume") ?? "24"))) / 100;
  if (!Number.isFinite(volume)) volume = .24;
  const sounds: Record<string, string> = { whoosh: "/native/assets/badminton-whoosh.mp3", hit: "/native/assets/badminton-hit.mp3", score: "/native/assets/badminton-score.mp3", cheer: "/native/assets/badminton-cheer.mp3" };
  function playSound(name: keyof typeof sounds): void {
    if (!soundEnabled || volume <= 0) return;
    const audio = new Audio(sounds[name]); audio.volume = volume;
    void audio.play().catch(() => {});
  }
  let heard: { round: number; score: string; hitter: number; winner: number } | null = null;
  function soundEvents(current: GameState | null): void {
    if (!current) return;
    const next = { round: current.round, score: current.score.join(":"), hitter: current.birdie.lastHitter, winner: current.winner };
    if (heard?.round === current.round) {
      if (next.score !== heard.score) playSound("score");
      else if (next.hitter !== heard.hitter && next.hitter) playSound("hit");
      if (next.winner && next.winner !== heard.winner) playSound("cheer");
    }
    heard = next;
  }
  let state: GameState | null = null, authority: GameState | null = null;
  let pending: Input[] = [], sequence = 0, jumpCount = 0, hitCount = 0, lastHitTick = 0;
  let seat: number | null = null, hostId: string | null = null, roster = "";
  let lastSnapshotAt = 0, frame = 0, correctionCount = 0;
  const keys = new Set<string>();
  const remote = new Map<string, { input: Input; at: number }>();
  const directions: Record<string, string> = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "jump", ArrowUp: "jump", KeyS: "hit", ArrowDown: "hit" };
  el("room-name").textContent = roomName;
  el("my-name").textContent = arcadeName();
  localStorage.setItem("arcade_recent_game", "46923-native");

  function notice(message: string): void { el("connection-note").textContent = message; }
  function resetInput(): void { keys.clear(); remote.clear(); pending = []; sequence = 0; jumpCount = 0; hitCount = 0; lastHitTick = 0; }
  function broadcast(): void {
    if (!authority || !net.isHost) return;
    for (const member of net.room.members) if (member.id !== net.id) net.send(member.id, { type: "snapshot", state: authority });
  }
  function newRound(playing: boolean): void {
    authority = createGame(Math.max(Date.now(), (authority?.round || 0) + 1), playing);
    state = authority; resetInput(); broadcast();
    if (playing) { net.control({ t: "resetReady" }); notice("比赛开始"); }
  }
  net.onStatus = (message) => { notice(message); if (!net.connected) keys.clear(); updateUi(); };
  net.onRoom = (room) => {
    const changedHost = hostId !== room.hostId;
    const nextRoster = JSON.stringify(room.seats);
    const changedRoster = roster !== nextRoster;
    hostId = room.hostId; roster = nextRoster;
    if (seat !== net.seat || changedHost) resetInput();
    seat = net.seat;
    if (net.isHost && (changedHost || changedRoster || !authority)) {
      newRound(false);
      notice("双人入座并准备即可开始");
    } else if (!net.isHost && changedHost) {
      state = null; authority = null; lastSnapshotAt = 0;
      notice("正在同步房间");
    }
    const players = room.members.filter((member) => member.seat != null);
    if (net.isHost && !changedRoster && authority?.phase !== "playing" && players.length === 2 && players.every((member) => member.ready)) newRound(true);
    updateUi();
  };
  net.onPacket = (from: string, packet: Packet) => {
    if (packet.type === "input" && net.isHost && authority && packet.round === authority.round && validInput(packet.input)) {
      const member = net.room.members.find((item) => item.id === from);
      if (!member?.seat || member.seat > 2) return;
      const previous = remote.get(from);
      if (packet.input.seq > (previous?.input.seq || 0)) remote.set(from, { input: packet.input, at: performance.now() });
    }
    if (packet.type === "snapshot" && !net.isHost && from === net.room.hostId && validState(packet.state)) {
      const snapshot = packet.state;
      if (authority && (snapshot.round < authority.round || (snapshot.round === authority.round && snapshot.tick < authority.tick))) return;
      const newGame = !authority || snapshot.round !== authority.round;
      const before = seat && state ? state.players[seat - 1].x : null;
      if (newGame) resetInput();
      authority = snapshot; lastSnapshotAt = performance.now();
      if (seat) {
        sequence = Math.max(sequence, snapshot.ack[seat - 1]);
        jumpCount = Math.max(jumpCount, snapshot.players[seat - 1].lastJump);
        hitCount = Math.max(hitCount, snapshot.players[seat - 1].lastHit);
      }
      if (seat && !newGame) {
        const result = reconcile(snapshot, seat, pending);
        state = result.state; pending = result.pending;
      } else state = cloneState(snapshot);
      if (before !== null && seat && !newGame && Math.abs(before - state.players[seat - 1].x) > 1) correctionCount++;
      if (newGame) updateUi();
    }
  };

  function currentInput(): Input {
    if ((keys.has("KeyS") || keys.has("ArrowDown")) && frame - lastHitTick >= 12) {
      hitCount++; lastHitTick = frame;
    }
    return { seq: ++sequence,
      left: keys.has("KeyA") || keys.has("ArrowLeft"),
      right: keys.has("KeyD") || keys.has("ArrowRight"),
      jump: jumpCount, hit: hitCount };
  }
  function tick(): void {
    frame++;
    if (!net.connected || !state || !authority) return;
    const input = seat && state.phase === "playing" ? currentInput() : { ...EMPTY_INPUT };
    if (net.isHost) {
      const inputs = [1, 2].map((number) => {
        const id = net.room.seats[number];
        if (id === net.id) return input;
        const item = id ? remote.get(id) : null;
        return item && performance.now() - item.at < 600 ? item.input :
          { ...(item?.input || EMPTY_INPUT), left: false, right: false };
      });
      step(authority, inputs); state = authority;
      if (frame % 3 === 0) broadcast();
    } else if (seat && authority.phase === "playing") {
      net.send(net.room.hostId!, { type: "input", round: authority.round, input });
      if (performance.now() - lastSnapshotAt < 1800) {
        pending.push(input); pending = pending.slice(-HZ * 2);
        const player = state.players[seat - 1];
        player.x = Math.max(seat === 1 ? 22 : 297, Math.min(seat === 1 ? 253 : 528,
          player.x + (Number(input.right) - Number(input.left)) * 5.9));
      }
    }
  }
  function key(event: KeyboardEvent, down: boolean): void {
    if ((event.target as HTMLElement)?.matches("input, textarea, select, button")) return;
    if (!directions[event.code]) return;
    event.preventDefault();
    if (!seat || state?.phase !== "playing") return;
    if (down) {
      if (!keys.has(event.code)) {
        if (directions[event.code] === "jump") jumpCount++;
        if (directions[event.code] === "hit") { hitCount++; lastHitTick = frame; playSound("whoosh"); }
        keys.add(event.code);
      }
    } else keys.delete(event.code);
  }
  window.addEventListener("keydown", (event) => key(event, true));
  window.addEventListener("keyup", (event) => key(event, false));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => { if (document.hidden) keys.clear(); });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
    const code = button.dataset.key!;
    button.onpointerdown = (event) => {
      if (!seat || state?.phase !== "playing") return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      if (!keys.has(code)) {
        if (directions[code] === "jump") jumpCount++;
        if (directions[code] === "hit") { hitCount++; lastHitTick = frame; playSound("whoosh"); }
        keys.add(code);
      }
    };
    const release = () => keys.delete(code);
    button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-seat]")) button.onclick = () => {
    const requested = Number(button.dataset.seat);
    net.control(seat === requested ? { t: "leaveSeat" } : { t: "sit", seat: requested });
    button.blur();
  };
  el<HTMLButtonElement>("start-game").onclick = () => {
    if (seat && authority?.phase !== "playing") {
      const me = net.room.members.find((member) => member.id === net.id);
      net.control({ t: "ready", ready: !me?.ready });
    }
    el("start-game").blur();
  };
  el<HTMLButtonElement>("copy-invite").onclick = async () => {
    const invite = new URL(location.href); invite.searchParams.delete("debug"); invite.searchParams.delete("turn");
    try { await navigator.clipboard.writeText(invite.href); notice("邀请链接已复制"); }
    catch { const field = el<HTMLInputElement>("invite-link"); field.hidden = false; field.value = invite.href; field.select(); notice("复制下方链接邀请好友"); }
  };
  el<HTMLButtonElement>("fullscreen-stage").onclick = () => { void el("native-stage").requestFullscreen().catch(() => {}); };
  el<HTMLAnchorElement>("leave-room").onclick = (event) => { event.preventDefault(); net.stop(); location.href = "/"; };
  const soundToggle = el<HTMLButtonElement>("sound-toggle"), soundVolume = el<HTMLInputElement>("sound-volume");
  const updateSoundUi = () => {
    soundToggle.textContent = soundEnabled ? "音效：开" : "音效：关";
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundVolume.value = String(Math.round(volume * 100));
    el("sound-volume-value").textContent = `${soundVolume.value}%`;
  };
  soundToggle.onclick = () => { soundEnabled = !soundEnabled; localStorage.setItem("arcade_native_sound", soundEnabled ? "on" : "off"); updateSoundUi(); };
  soundVolume.oninput = () => { volume = Number(soundVolume.value) / 100; localStorage.setItem("arcade_native_volume", soundVolume.value); updateSoundUi(); };
  updateSoundUi();

  function updateUi(): void {
    el("role-status").textContent = seat ? `P${seat} 玩家` : "观战";
    el("member-count").textContent = `${net.room.members.length} 人`;
    el("conn-badge").textContent = net.connected ? "已连接" : "重连中";
    el("conn-badge").className = `badge ${net.connected ? "ok" : "bad"}`;
    const host = net.room.members.find((member) => member.id === net.room.hostId);
    el("host-line").textContent = net.isHost ? "你是房主" : `房主：${host?.name || "等待中"}`;
    for (const number of [1, 2]) {
      const row = el(`seat-${number}`);
      const member = net.room.members.find((item) => item.id === net.room.seats[number]);
      row.querySelector(".who")!.textContent = member ? `${member.name} · ${member.ready ? "已准备" : "未准备"}` : "空闲";
      const button = row.querySelector("button")!;
      button.textContent = seat === number ? "离座" : "入座";
      button.disabled = !!member && member.id !== net.id;
      row.classList.toggle("occupied", !!member);
    }
    el("score-line").textContent = state ? `比分 ${state.score[0]} : ${state.score[1]} · ${state.phase === "finished" ? `P${state.winner} 获胜` : `P${state.serve} 发球`}` : "等待比赛";
    const button = el<HTMLButtonElement>("start-game");
    button.disabled = !net.connected || !seat || authority?.phase === "playing";
    button.textContent = net.room.members.find((member) => member.id === net.id)?.ready ? "取消准备" : "准备";
    const other = net.isHost ? net.room.members.find((member) => member.id !== net.id && member.seat)?.id : net.room.hostId;
    const transport = other ? net.transport(other) : "waiting";
    el("transport-status").textContent = transport === "p2p" ? "对等连接" : transport === "relay" ? "中继连接" : "等待好友";
    const rtt = other ? net.rtt.get(other) : undefined;
    el("latency-status").textContent = rtt == null ? "—" : `${Math.round(rtt)} ms`;
    el("render-status").textContent = `${view.fps} FPS`;
    const stale = !net.connected || (!net.isHost && !!lastSnapshotAt && performance.now() - lastSnapshotAt > 1800);
    el("connection-overlay").hidden = !stale;
    el("connection-overlay").textContent = "连接恢复中，正在等待最新状态…";
  }
  const clockUrl = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${STEP_MS});`], { type: "text/javascript" }));
  const worker = new Worker(clockUrl); URL.revokeObjectURL(clockUrl);
  let clockAt = performance.now(), accumulator = 0;
  worker.onmessage = () => {
    const now = performance.now(); accumulator += Math.min(now - clockAt, STEP_MS * 5); clockAt = now;
    while (accumulator >= STEP_MS) { tick(); accumulator -= STEP_MS; }
  };
  const render = () => { soundEvents(state); view.render(state, seat); requestAnimationFrame(render); };
  requestAnimationFrame(render);
  window.setInterval(updateUi, 250);
  window.addEventListener("pagehide", () => { worker.terminate(); net.stop(false); });
  if (params.get("debug") === "1") Object.assign(window, { __badmintonTest: {
    get state() { return state && cloneState(state); }, get authority() { return authority && cloneState(authority); },
    get seat() { return seat; }, get corrections() { return correctionCount; }, network: net
  } });
  void net.start();
}

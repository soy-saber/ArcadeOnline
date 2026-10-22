import { AuthorityClient } from "./client";
import { Presentation, Input, isBomb, PREDICTION_MS, INTERPOLATION_MS } from "./presentation";
import { GameView } from "./bomb-view";
import { ORIGINAL_MAPS } from "./maps";
import { HZ as BOMB_HZ, Input as BombInput, ITEM_LABELS } from "./bomb-core";
import { BadmintonView } from "../badminton/view";
import { GameState as BadmintonState, Input as BadmintonInput, HZ as BADMINTON_HZ } from "../badminton/core";
import { State, hashState } from "./protocol";
import { getAdapter } from "../expanded/registry";
import type { State as ExpandedState } from "../expanded/types";
import { Nameplates } from "./nameplates";
import { weaponLabel as bomb2WeaponLabel } from "../expanded/bomb2";

declare function ensureName(next?: string): boolean;
declare function arcadeName(): string;
declare function arcadeSession(): string;

if (ensureName()) start();

function start(): void {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const params = new URLSearchParams(location.search), badminton = params.get("game") === "46923-server";
  const adapter = getAdapter(params.get("game") || "");
  const recordsEnabled = !badminton && adapter?.id !== "fbw_forest-server";
  const gameId = adapter?.id || (badminton ? "46923-server" : "3881-server"), title = adapter?.title || (badminton ? "火柴人打羽毛球" : "Q版泡泡堂");
  const room = (params.get("room") || "lobby").slice(0, 20), hz = adapter?.hz || (badminton ? BADMINTON_HZ : BOMB_HZ);
  const net = new AuthorityClient(arcadeName(), arcadeSession(), room, gameId);
  const presentation = new Presentation(() => net.requestFull());
  const canvas = el<HTMLCanvasElement>("game-canvas");
  const nameplates = new Nameplates(el("native-stage"));
  const bombView = badminton || adapter ? null : new GameView(canvas), badmintonView = badminton ? new BadmintonView(canvas) : null;
  let seat: number | null = null, round = -1, seq = 0, bomb = 0, jump = 0, hit = 0;
  let held: Input | null = null, lastHitAt = 0, lastFrameAt = performance.now();
  let inputEnabled = true, uiAt = 0, confirmedRound = -1, confirmedTick = -1;
  let inputAt = 0, responseMs = 0, maxFrameMs = 0;
  let adapterFrames = 0, adapterFps = 0, fpsAt = performance.now();
  const keys = new Map<string, number>();
  const bombDirections: Record<string, BombInput["dir"]> = { KeyA: 0, ArrowLeft: 0, KeyW: 1, ArrowUp: 1, KeyD: 2, ArrowRight: 2, KeyS: 3, ArrowDown: 3 };
  const tank = adapter?.id === "137953-server", bomb2 = adapter?.id === "9109-server", shooters = adapter?.id === "50737-server" || adapter?.id === "97734-server";
  const actions = badminton ? ["KeyS", "ArrowDown", "Space", "Enter"] : adapter ? ["Space", "Enter", "KeyE", ...(tank || bomb2 ? [] : ["KeyJ", "KeyZ"])] : ["Space", "Enter", "KeyE", "ShiftLeft", "ShiftRight"];
  const jumps = adapter ? ["KeyK", "KeyX", ...(tank || bomb2 ? ["KeyJ", "ShiftLeft", "ShiftRight"] : [])] : ["KeyW", "ArrowUp"];
  let sound = localStorage.getItem("arcade_native_sound") !== "off";
  let volume = Math.max(0, Math.min(100, Number(localStorage.getItem("arcade_native_volume") ?? 24)));
  if (!Number.isFinite(volume)) volume = 24;
  let heard: { round: number; score: string; hitter: number; winner: number | null } | null = null;
  const sounds: Record<string, string> = { whoosh: "badminton-whoosh", hit: "badminton-hit", score: "badminton-score", cheer: "badminton-cheer" };

  document.title = `${title} · 在线联机 - ArcadeOnline`;
  document.body.classList.toggle("badminton-page", badminton);
  el("game-title").textContent = title; el("room-name").textContent = room; el("my-name").textContent = arcadeName();
  localStorage.setItem("arcade_recent_game", gameId);
  if (badminton) {
    el("battle-records").hidden = true;
    el("round-options").hidden = true; el("seat-3").hidden = true; el("seat-4").hidden = true;
    el("weapon-status").hidden = true;
    el("controls-guide").textContent = "A/D 或 ←/→ 移动，W/↑ 跳跃，S/↓ 发球和挥拍。先得 7 分获胜。";
    el("mode-note").textContent = "两人入座并准备后开始。比赛结束 3 秒后自动开下一局；取消准备可退出下一局。";
    el("attack-button-text").textContent = "发球 / 挥拍";
    el<HTMLButtonElement>("attack-button").dataset.key = "KeyS";
    el<HTMLButtonElement>("touch-down").hidden = true;
    el<HTMLButtonElement>("touch-up").setAttribute("aria-label", "跳跃");
  }
  if (adapter) {
    canvas.width = adapter.width; canvas.height = adapter.height;
    el("battle-records").hidden = !recordsEnabled; el("weapon-status").hidden = true;
    el("records-note").textContent = adapter.id === "50737-server" ? "击杀统计包含僵尸；合作通关计双方胜场。" : "按造成击杀的玩家计分；自杀只计死亡，换座与续局保留战绩。";
    el("controls-guide").textContent = adapter.controls;
    el("mode-note").textContent = "至少两人入座，全员准备开局；结束后自动继续下一局。";
    el("attack-button-text").textContent = "攻击 / 操作";
    el("alt-button").hidden = !(tank || bomb2 || shooters);
    el("alt-button").textContent = tank ? "副操作" : bomb2 ? "武器" : adapter.id === "50737-server" ? "换武器" : "手雷";
    for (let number = adapter.seats + 1; number <= 4; number++) el(`seat-${number}`).hidden = true;
    el("round-options").hidden = !adapter.maps?.length;
    el<HTMLSelectElement>("game-loadout").parentElement!.hidden = true;
    el("sound-toggle").parentElement!.hidden = true;
  }
  canvas.style.setProperty("--game-aspect", String(canvas.width / canvas.height));
  const mapSelect = el<HTMLSelectElement>("game-map");
  const modeSelect = el<HTMLSelectElement>("game-mode");
  if (adapter?.modes) {
    modeSelect.parentElement!.hidden = false;
    for (const mode of adapter.modes) { const option = document.createElement("option"); option.value = mode.id; option.textContent = mode.label; modeSelect.append(option); }
  }
  for (const map of adapter?.maps || ORIGINAL_MAPS) { const option = document.createElement("option"); option.value = map.id; option.textContent = map.label; mapSelect.append(option); }
  function notice(message: string): void { el("connection-note").textContent = message; }
  function clearInput(): void { keys.clear(); held = null; presentation.clearPrediction(); }
  function resetRound(next: number): void {
    round = next; seq = 0; bomb = 0; jump = 0; hit = 0; lastHitAt = 0; clearInput();
  }
  function alignCounters(state: State): void {
    if (!seat) return;
    seq = Math.max(seq, state.ack[seat - 1]);
    const player = "gameId" in state ? state.players.find((player) => player.seat === seat) : state.players[seat - 1];
    if (!player) return;
    if ("gameId" in state) { bomb = Math.max(bomb, player.lastAttack || 0); jump = Math.max(jump, player.lastAlt || 0); }
    else if (isBomb(state)) bomb = Math.max(bomb, player.lastBomb);
    else { jump = Math.max(jump, player.lastJump); hit = Math.max(hit, player.lastHit); }
  }
  net.onRoom = () => {
    if (seat !== net.seat) { seat = net.seat; clearInput(); if (net.authority) alignCounters(net.authority); }
    updateUi();
  };
  net.onStatus = (message) => { notice(message); if (!net.connected) clearInput(); updateUi(); };
  net.onSnapshot = (state, time, receivedAt) => {
    if (round !== state.round) {
      resetRound(state.round);
      notice(state.phase === "playing" ? "比赛进行中" : state.phase === "finished" ? "本局结束" : "同步完成，入座并准备即可开始");
    }
    alignCounters(state); presentation.receive(state, time, receivedAt);
  };
  function play(name: string): void {
    if (!sound || volume <= 0) return;
    const audio = new Audio(`/authority/assets/${sounds[name]}.mp3`); audio.volume = volume / 100; void audio.play().catch(() => {});
  }
  function confirm(state: State): void {
    if (state.round === confirmedRound && state.tick === confirmedTick) return;
    confirmedRound = state.round; confirmedTick = state.tick;
    if ("gameId" in state) return;
    if (isBomb(state)) bombView!.confirm(state);
    else {
      const next = { round: state.round, score: state.score.join(":"), hitter: state.birdie.lastHitter, winner: state.winner };
      if (heard?.round === state.round) {
        if (next.score !== heard.score) play("score");
        else if (next.hitter && next.hitter !== heard.hitter) play("hit");
        if (next.winner && next.winner !== heard.winner) play("cheer");
      }
      heard = next;
    }
  }
  function currentInput(now: number): Input {
    if (adapter && (shooters || tank) && actions.some((code) => keys.has(code)) && now - lastHitAt >= 1000 / hz) { bomb++; lastHitAt = now; }
    if (adapter) return { seq: ++seq, left: keys.has("KeyA") || keys.has("ArrowLeft"), right: keys.has("KeyD") || keys.has("ArrowRight"),
      up: keys.has("KeyW") || keys.has("ArrowUp"), down: keys.has("KeyS") || keys.has("ArrowDown"), attack: bomb, alt: jump };
    if (badminton) {
      if (actions.some((code) => keys.has(code)) && now - lastHitAt >= 500) { hit++; lastHitAt = now; }
      return { seq: ++seq, left: keys.has("KeyA") || keys.has("ArrowLeft"), right: keys.has("KeyD") || keys.has("ArrowRight"), jump, hit };
    }
    let dir: BombInput["dir"] = -1, time = -1;
    for (const [code, at] of keys) if (bombDirections[code] !== undefined && at >= time) { dir = bombDirections[code]; time = at; }
    return { seq: ++seq, dir, bomb, special: 0 };
  }
  const timer = window.setInterval(() => {
    if (!inputEnabled || !net.connected || !seat || net.authority?.phase !== "playing") return;
    const now = performance.now(); held = currentInput(now);
    if (net.control({ t: "authInput", round, input: held, serverTime: net.serverNow(now) })) presentation.input(held, now);
  }, 1000 / hz);
  function press(code: string, down: boolean): void {
    if (!down) { keys.delete(code); return; }
    if (!seat || net.authority?.phase !== "playing" || keys.has(code)) return;
    const now = performance.now(); keys.set(code, now); inputAt = now;
    if (actions.includes(code)) { if (badminton) { hit++; lastHitAt = now; play("whoosh"); } else { bomb++; lastHitAt = now; } }
    if ((badminton || adapter) && jumps.includes(code)) jump++;
  }
  function keyboard(event: KeyboardEvent, down: boolean): void {
    if ((event.target as HTMLElement)?.matches("input, textarea, select, button")) return;
    if (bombDirections[event.code] === undefined && !actions.includes(event.code) && !jumps.includes(event.code)) return;
    event.preventDefault(); press(event.code, down);
  }
  window.addEventListener("keydown", (event) => keyboard(event, true));
  window.addEventListener("keyup", (event) => keyboard(event, false));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { clearInput(); if (!document.hidden) net.requestFull(); });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
    button.onpointerdown = (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); press(button.dataset.key!, true); };
    const release = () => { press(button.dataset.key!, false); button.blur(); };
    button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-seat]")) button.onclick = () => {
    const requested = Number(button.dataset.seat); net.control(seat === requested ? { t: "leaveSeat" } : { t: "sit", seat: requested }); button.blur();
  };
  function toggleReady(autoSit = false): void {
    if (!net.connected) return;
    if (seat) {
      const mine = net.room.members.find((member) => member.id === net.id);
      net.control({ t: "ready", ready: !mine?.ready });
    } else if (autoSit) {
      const available = Object.keys(net.room.seats).map(Number).find(number => !net.room.seats[number]);
      if (!available) return;
      net.control({ t: "sit", seat: available });
      net.control({ t: "ready", ready: true });
    }
    canvas.focus({ preventScroll: true });
  }
  el<HTMLButtonElement>("start-game").onclick = () => toggleReady();
  el<HTMLButtonElement>("fullscreen-ready").onclick = () => toggleReady(true);
  for (const key of ["map", "mode", "loadout"] as const) el<HTMLSelectElement>(`game-${key}`).onchange = () => {
    if (net.isController) net.control({ t: "authOptions", map: mapSelect.value, ...(adapter?.modes ? { gameMode: modeSelect.value } : {}), loadout: el<HTMLSelectElement>("game-loadout").value });
  };
  el("copy-invite").onclick = async () => {
    const invite = new URL(location.href); invite.searchParams.delete("debug");
    try { await navigator.clipboard.writeText(invite.href); notice("邀请链接已复制"); }
    catch { const field = el<HTMLInputElement>("invite-link"); field.hidden = false; field.value = invite.href; field.select(); notice("复制下方链接即可邀请好友"); }
  };
  el("leave-room").onclick = (event) => { event.preventDefault(); net.control({ t: "leave" }); net.close(); location.href = "/"; };
  function soundUi(): void {
    el("sound-toggle").textContent = sound ? "音效：开" : "音效：关";
    el("sound-toggle").setAttribute("aria-pressed", String(sound));
    el<HTMLInputElement>("sound-volume").value = String(volume); el("sound-volume-value").textContent = `${volume}%`;
    bombView?.setSound(sound); bombView?.setVolume(volume / 100);
  }
  el("sound-toggle").onclick = () => { sound = !sound; localStorage.setItem("arcade_native_sound", sound ? "on" : "off"); soundUi(); el("sound-toggle").blur(); };
  el<HTMLInputElement>("sound-volume").oninput = (event) => { volume = Number((event.target as HTMLInputElement).value); localStorage.setItem("arcade_native_volume", String(volume)); soundUi(); };
  soundUi();
  const fullscreen = el("fullscreen-room");
  function fullscreenUi(): void {
    const active = !!document.fullscreenElement || fullscreen.classList.contains("fullscreen-fallback");
    document.documentElement.classList.toggle("game-fullscreen", active);
    document.body.classList.toggle("game-fullscreen", active);
    el("fullscreen-stage").textContent = active ? "退出全屏" : "全屏";
    clearInput();
    canvas.focus({ preventScroll: true });
  }
  async function exitFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen();
    fullscreen.classList.remove("fullscreen-fallback");
    fullscreenUi();
  }
  el("fullscreen-stage").onclick = async () => {
    if (document.fullscreenElement || fullscreen.classList.contains("fullscreen-fallback")) { await exitFullscreen(); return; }
    try { await fullscreen.requestFullscreen(); }
    catch { fullscreen.classList.add("fullscreen-fallback"); }
    fullscreenUi();
  };
  el("exit-fullscreen").onclick = exitFullscreen;
  document.addEventListener("fullscreenchange", fullscreenUi);
  window.addEventListener("keydown", event => {
    if (event.code === "Escape" && fullscreen.classList.contains("fullscreen-fallback")) void exitFullscreen();
  });
  function updateUi(): void {
    const state = net.authority, mine = net.room.members.find((member) => member.id === net.id);
    el("conn-badge").textContent = net.connected ? "已连接" : "连接中";
    el("role-status").textContent = seat ? `P${seat}` : "观战";
    el("transport-status").textContent = "服务器连接";
    el("latency-status").textContent = net.rtt ? `${Math.round(net.rtt)} ms` : "采样中";
    el("render-status").textContent = `${bombView?.fps ?? badmintonView?.fps ?? adapterFps} FPS`;
    el("member-count").textContent = `${net.room.members.length} 人`;
    el("host-line").textContent = adapter ? net.isController ? `你可以选择下一局的${adapter.modes ? "模式和" : ""}地图` : `房间管理者可选择${adapter.modes ? "模式和" : ""}地图` : net.isController ? "你可以选择下一局的地图和开局武器" : "房间管理者可选择地图和开局武器";
    for (let number = 1; number <= (adapter?.seats || (badminton ? 2 : 4)); number++) {
      const row = el(`seat-${number}`), member = net.room.members.find((member) => member.seat === number);
      row.querySelector<HTMLElement>(".who")!.textContent = member ? `${member.name}${member.id === net.id ? "（你）" : ""} · ${member.ready ? "已准备" : "未准备"}` : "空闲";
      const button = row.querySelector<HTMLButtonElement>("button")!;
      button.textContent = seat === number ? "离座" : "入座"; button.disabled = !net.connected || !!member && member.id !== net.id;
      row.classList.toggle("mine", seat === number); row.classList.toggle("ready", !!member?.ready);
    }
    const ready = el<HTMLButtonElement>("start-game"); ready.disabled = !net.connected || !seat;
    if (recordsEnabled) {
      const body = el("records-body"); body.replaceChildren();
      const records = net.room.auth?.records || [];
      if (!records.length) {
        const row = document.createElement("tr"), cell = document.createElement("td");
        cell.setAttribute("colspan", "5"); cell.textContent = "开局后开始统计"; row.append(cell); body.append(row);
      }
      for (const record of records) {
        const row = document.createElement("tr"); row.classList.toggle("mine", record.id === net.id);
        const name = `${record.name}${record.id === net.id ? "（你）" : ""}${net.room.members.some((member) => member.id === record.id) ? "" : " · 已离开"}`;
        for (const value of [name, record.kills, record.deaths, record.wins, record.rounds]) {
          const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell);
        }
        body.append(row);
      }
    }
    ready.textContent = mine?.ready ? "取消准备" : "准备";
    ready.setAttribute("aria-pressed", String(!!mine?.ready));
    const fullscreenReady = el<HTMLButtonElement>("fullscreen-ready");
    const hasOpenSeat = Object.values(net.room.seats).some(id => !id);
    fullscreenReady.disabled = !net.connected || !seat && !hasOpenSeat;
    fullscreenReady.textContent = seat ? ready.textContent : hasOpenSeat ? "入座并准备" : "席位已满";
    fullscreenReady.setAttribute("aria-pressed", String(!!mine?.ready));
    if (state && isBomb(state)) {
      mapSelect.value = state.options.map; el<HTMLSelectElement>("game-loadout").value = state.options.loadout;
      const player = seat ? state.players[seat - 1] : null;
      el("weapon-status").textContent = player?.weapon && player.ammo > 0 ? `${ITEM_LABELS[player.weapon]} · ${player.ammo} 发` : "空格 / 回车 放炸弹";
      el("attack-button-text").textContent = player?.weapon && player.ammo > 0 ? ITEM_LABELS[player.weapon] : "放炸弹";
    }
    if (adapter && net.room.auth?.options?.map) mapSelect.value = net.room.auth.options.map;
    if (adapter?.modes) {
      modeSelect.value = net.room.auth?.options?.gameMode || adapter.modes[0].id;
      const mode = adapter.modes.find(item => item.id === modeSelect.value);
      el("mode-note").textContent = `${mode?.description || ""} 至少两人入座，全员准备开局；结束 3 秒后自动续局。`;
      const playingKill = bomb2 && state && "gameId" in state && state.mode === "kill";
      el("attack-button-text").textContent = playingKill ? "使用武器" : "放炸弹";
      el("controls-guide").textContent = playingKill ? "方向键 / WASD 移动；空格 / J / Shift 使用当前武器；基础锤子可反复使用。" : adapter.controls;
      const player = bomb2 && state && "gameId" in state ? state.players.find(p => p.seat === seat) : null;
      if (player) { el("weapon-status").hidden = false; el("weapon-status").textContent = bomb2WeaponLabel(state as ExpandedState, player); }
      else el("weapon-status").hidden = true;
      if (bomb2 && state && "gameId" in state) el("score-line").textContent = state.mode === "kill" ? state.players.map(p => `P${p.seat} ${p.points}/10 分${p.points >= 8 ? " · 即将获胜" : ""}`).join("　") : "";
    }
    mapSelect.disabled = !net.isController || state?.phase === "playing";
    modeSelect.disabled = mapSelect.disabled;
    el<HTMLSelectElement>("game-loadout").disabled = mapSelect.disabled;
    const nextAt = net.room.auth?.nextRoundAt;
    if (!net.connected) el("round-status").textContent = "连接中";
    else if (state?.phase === "playing") el("round-status").textContent = "比赛进行中";
    else if (state?.phase === "finished" && nextAt) el("round-status").textContent = `${Math.max(0, Math.ceil((nextAt - net.serverNow()) / 1000))} 秒后开始下一局`;
    else el("round-status").textContent = "入座并准备后自动开始";
    if (badminton && state && !isBomb(state)) el("score-line").textContent = `P1 ${state.score[0]} : ${state.score[1]} P2`;
    el("metrics-age").textContent = Number.isFinite(net.snapshotAge) ? `${Math.round(net.snapshotAge)} ms` : "等待同步";
    el("metrics-bandwidth").textContent = `${Math.round(net.receivedBytes / 1024)} KB 收 / ${Math.round(net.sentBytes / 1024)} KB 发`;
    el("metrics-predict").textContent = responseMs ? `${Math.round(responseMs)} ms` : "操作后采样";
  }
  function render(now: number): void {
    adapterFrames++;
    if (now - fpsAt >= 1000) { adapterFps = Math.round(adapterFrames * 1000 / (now - fpsAt)); adapterFrames = 0; fpsAt = now; }
    const gap = now - lastFrameAt; lastFrameAt = now; maxFrameMs = Math.max(maxFrameMs, gap);
    if (gap > 350) { presentation.clearPrediction(); net.requestFull(); }
    const state = presentation.render(now, net.serverNow(now), seat, held, hz);
    if (net.authority) confirm(net.authority);
    if (adapter) adapter.render(canvas, state as ExpandedState | null, seat);
    else if (badminton) badmintonView!.render(state as BadmintonState | null, seat);
    else bombView!.render(state && isBomb(state) ? state : null, seat);
    nameplates.render(state, canvas, net.room.members, seat);
    if (inputAt && presentation.predictionSteps > 0) { responseMs = now - inputAt; inputAt = 0; }
    if (now - uiAt >= 150) { uiAt = now; updateUi(); }
    requestAnimationFrame(render);
  }
  if (params.get("debug") === "1") Object.assign(window, { __authorityTest: {
    network: net, client: net, presentation,
    get authority() { return net.authority; }, get state() { return presentation.state; }, get seat() { return seat; },
    get transport() { return net.transport; }, get hash() { return net.authority ? hashState(net.authority) : null; },
    get maxFrameMs() { return maxFrameMs; }, get predictionMs() { return PREDICTION_MS; }, get interpolationMs() { return INTERPOLATION_MS; },
    get inputEnabled() { return inputEnabled; }, set inputEnabled(value: boolean) { inputEnabled = value; clearInput(); },
    resync: () => net.requestFull(), input: (code: string, down: boolean) => press(code, down),
    clearInput, snapshot: () => net.authority ? JSON.parse(JSON.stringify(net.authority)) : null
  } });
  window.addEventListener("pagehide", () => { window.clearInterval(timer); net.close(); });
  updateUi(); net.start(); requestAnimationFrame(render);
}

import { AuthorityClient } from "./client";
import { Presentation, Input, isBomb, PREDICTION_MS, INTERPOLATION_MS } from "./presentation";
import { GameView } from "./bomb-view";
import { ORIGINAL_MAPS } from "./maps";
import { HZ as BOMB_HZ, Input as BombInput, ITEM_LABELS } from "./bomb-core";
import { BadmintonView } from "../badminton/view";
import { GameState as BadmintonState, Input as BadmintonInput, HZ as BADMINTON_HZ,MODES,canControl } from "../badminton/core";
import { State, hashState } from "./protocol";
import { getAdapter } from "../expanded/registry";
import type { State as ExpandedState } from "../expanded/types";
import { Nameplates } from "./nameplates";
import { weaponLabel as bomb2WeaponLabel } from "../expanded/bomb2";
import {directionKeys,directionState,heldDirectionAt} from './key-bindings';
import {CONTROL_LABELS,readBindings,bindingError,extraControl,keyLabel,type Control} from '../expanded/boxhead-controls';

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
  const room = (params.get("room") || "lobby").slice(0, 20);let hz = adapter?.hz || (badminton ? BADMINTON_HZ : BOMB_HZ);
  const net = new AuthorityClient(arcadeName(), arcadeSession(), room, gameId);
  const presentation = new Presentation(() => net.requestFull());
  const canvas = el<HTMLCanvasElement>("game-canvas");
  const nameplates = new Nameplates(el("native-stage"));
  const bombView = badminton || adapter ? null : new GameView(canvas), badmintonView = badminton ? new BadmintonView(canvas) : null;
  let seat: number | null = null, round = -1, seq = 0, bomb = 0, jump = 0, hit = 0;
  let held: Input | null = null, lastHitAt = 0, lastFrameAt = performance.now();
  let selectedWeapon: number | undefined;
  let weaponStep = 1;
  let cancelledAttack = 0;
  let cancelledJump=0,cancelledHit=0,cancelledAlt=0;
  let brawlerJump=0,brawlerUpperAttack=0,brawlerUpperAlt=0;
  let pointer:{x:number;y:number}|null=null,actionSequence=0;
  let inputEnabled = true, uiAt = 0, confirmedRound = -1, confirmedTick = -1;
  let inputAt = 0, responseMs = 0, maxFrameMs = 0;
  let adapterFrames = 0, adapterFps = 0, fpsAt = performance.now();
  const keys = new Map<string, number>();
  const bombDirections=directionKeys;
  const tank = adapter?.id === "137953-server", bomb2 = adapter?.id === "9109-server", shooters = adapter?.id === "50737-server" || adapter?.id === "97734-server";
  const boxhead = adapter?.id === '50737-server';
  const brawler = adapter?.id === '6232-server';
  let bindings=readBindings(boxhead?localStorage.getItem('arcade_boxhead_bindings'):null);
  const extra=(code:string)=>boxhead?extraControl(bindings,code):undefined;
  const attackKey=(code:string)=>extra(code)?extra(code)==='attack':actions.includes(code);
  const attackHeld=()=>[...keys.keys()].some(attackKey);
  const directionFor=(code:string)=>{const role=extra(code);return role&&['left','up','right','down'].includes(role)?(['left','up','right','down'].indexOf(role)as 0|1|2|3):directionKeys[code];};
  const actions = badminton ? ["KeyS", "ArrowDown", "Space", "Enter"] : adapter ? ["Space", "Enter", ...(boxhead?[]:["KeyE"]), ...(tank || bomb2 ? [] : ["KeyJ", "KeyZ"])] : ["Space", "Enter", "KeyE", "ShiftLeft", "ShiftRight"];
  const jumps = adapter ? ["KeyK", "KeyX", ...(boxhead?["KeyQ","KeyE"]:[]), ...(tank || bomb2 ? ["KeyJ", "ShiftLeft", "ShiftRight"] : [])] : ["KeyW", "ArrowUp"];
  let sound = localStorage.getItem("arcade_native_sound") !== "off";
  let volume = Math.max(0, Math.min(100, Number(localStorage.getItem("arcade_native_volume") ?? 24)));
  if (!Number.isFinite(volume)) volume = 24;
  let heard: { round: number; score: number; hits: number; winner: number | null; strokes:number[] } | null = null;
  const sounds: Record<string, string> = { whoosh: "badminton-whoosh", hit: "badminton-hit", score: "badminton-score", cheer: "badminton-cheer",sigh:'badminton-sigh',next:'badminton-next' };

  document.title = `${title} · 在线联机 - ArcadeOnline`;
  document.body.classList.toggle("badminton-page", badminton);
  el("game-title").textContent = title; el("room-name").textContent = room; el("my-name").textContent = arcadeName();
  localStorage.setItem("arcade_recent_game", gameId);
  if (badminton) {
    el('badminton-actions').hidden=false;
    el("battle-records").hidden = true;
    el("round-options").hidden = false; el("seat-3").hidden = true; el("seat-4").hidden = true;
    el("weapon-status").hidden = true;
    el("controls-guide").textContent = "A/D 或 ←/→ 移动，W/↑ 跳跃，S/↓ 发球和挥拍。先得 7 分获胜。";
    el("mode-note").textContent = "两人入座并准备后开始。比赛结束 3 秒后自动开下一局；取消准备可退出下一局。";
    el("attack-button-text").textContent = "发球 / 挥拍";
    el<HTMLButtonElement>("attack-button").dataset.key = "KeyS";
    el<HTMLButtonElement>("touch-down").hidden = true;
    el<HTMLButtonElement>("touch-up").setAttribute("aria-label", "跳跃");
  }
  if (adapter) {
    if(boxhead){el('badminton-actions').hidden=false;el('fullscreen-pause').hidden=false;}
    canvas.width = adapter.width; canvas.height = adapter.height;
    el("battle-records").hidden = !recordsEnabled; el("weapon-status").hidden = true;
    el("records-note").textContent = adapter.id === "50737-server" ? "原版持续生存：记录击杀与倒地次数；队伍全灭结束。" : "按造成击杀的玩家计分；自杀只计死亡，换座与续局保留战绩。";
    el("controls-guide").textContent = adapter.controls;
    el("mode-note").textContent = "至少两人入座，全员准备开局；结束后自动继续下一局。";
    el("attack-button-text").textContent = "攻击 / 操作";
    el("alt-button").hidden = !(tank || bomb2 || shooters || brawler);
    el("alt-button").textContent = brawler ? "特技" : tank ? "副操作" : bomb2 ? "武器" : adapter.id === "50737-server" ? "换武器" : "手雷";
    if(brawler){const button=document.createElement('button');button.id='brawler-shield';button.textContent='防御';button.dataset.key='ShiftLeft';el('alt-button').after(button);}
    if(boxhead)el<HTMLButtonElement>('alt-button').dataset.key='TouchNext';
    for (let number = adapter.seats + 1; number <= 4; number++) el(`seat-${number}`).hidden = true;
    el("round-options").hidden = !adapter.maps?.length;
    el<HTMLSelectElement>("game-loadout").parentElement!.hidden = true;
    el("sound-toggle").parentElement!.hidden = !adapter.setSound;
  }
  canvas.style.setProperty("--game-aspect", String(canvas.width / canvas.height));
  const mapSelect = el<HTMLSelectElement>("game-map");
  const modeSelect = el<HTMLSelectElement>("game-mode");
  const characterSelect=el<HTMLSelectElement>('game-character'),difficultySelect=el<HTMLSelectElement>('game-difficulty');
  const bombSettings=gameId==='3881-server'||gameId==='9109-server';
  const characterSettings=bombSettings||!!adapter?.characters;
  el('boxhead-options').hidden=!boxhead;
  el('boxhead-controls').hidden=!boxhead;
  const difficultySettings=bombSettings||!!adapter?.difficulties;
  characterSelect.parentElement!.hidden=!characterSettings;difficultySelect.parentElement!.hidden=!difficultySettings;
  if(adapter?.characters){characterSelect.replaceChildren();for(const [index,label]of adapter.characters.entries()){const option=document.createElement('option');option.value=String(index+1);option.textContent=label;characterSelect.append(option);}}
  if(adapter?.difficulties){difficultySelect.replaceChildren();for(const d of adapter.difficulties){const option=document.createElement('option');option.value=d.id;option.textContent=d.label;difficultySelect.append(option);}}
  if (adapter?.modes) {
    modeSelect.parentElement!.hidden = false;
    for (const mode of adapter.modes) { const option = document.createElement("option"); option.value = mode.id; option.textContent = mode.label; modeSelect.append(option); }
  }
  if(badminton){
    mapSelect.parentElement!.hidden=true;el<HTMLSelectElement>('game-loadout').parentElement!.hidden=true;modeSelect.parentElement!.hidden=false;
    for(const mode of MODES){const option=document.createElement('option');option.value=mode.id;option.textContent=mode.label;modeSelect.append(option);}
  }
  for (const map of adapter?.maps || ORIGINAL_MAPS) { const option = document.createElement("option"); option.value = map.id; option.textContent = map.label; mapSelect.append(option); }
  if(!adapter&&!badminton)mapSelect.title='每完成5局随机切换一个不同的原作场景；手动换图重新计数';
  function notice(message: string): void { el("connection-note").textContent = message; }
  function bindingUi():void {for(const input of document.querySelectorAll<HTMLInputElement>('[data-boxhead-binding]'))input.value=bindings[input.dataset.boxheadBinding as Control]?keyLabel(bindings[input.dataset.boxheadBinding as Control]!):'';}
  if(boxhead){
    for(const [role,label]of Object.entries(CONTROL_LABELS)){
      const field=document.createElement('label'),input=document.createElement('input');field.textContent=label;input.readOnly=true;input.placeholder='点击后按键';input.dataset.boxheadBinding=role;input.setAttribute('aria-label','额外'+label+'按键');
      input.onkeydown=event=>{event.preventDefault();event.stopPropagation();clearInput();if(event.code==='Escape'){input.blur();return;}const control=role as Control;if(event.code==='Backspace'||event.code==='Delete'){delete bindings[control];el('boxhead-binding-note').textContent='已清除该额外按键。';}else{const error=bindingError(bindings,control,event.code);if(error){el('boxhead-binding-note').textContent=error;return;}bindings[control]=event.code;el('boxhead-binding-note').textContent=`${label}：${keyLabel(event.code)}；额外按键优先于原快捷键。`;}localStorage.setItem('arcade_boxhead_bindings',JSON.stringify(bindings));bindingUi();};field.append(input);el('boxhead-binding-fields').append(field);
    }
    el('boxhead-reset-controls').onclick=()=>{clearInput();bindings={};localStorage.removeItem('arcade_boxhead_bindings');bindingUi();el('boxhead-binding-note').textContent='已清除额外按键，默认按键保持可用。';};bindingUi();
  }
  function availableSeat(number:number):boolean {
    if(badminton)return ((net.authority as BadmintonState|null)?.options.mode??'versus')==='versus'||number===1;
    const mode=adapter?.modes?.find(m=>m.id===(net.room.auth?.options?.gameMode??adapter.modes?.[0]?.id));
    return number<=(mode?.maxPlayers??adapter?.seats??4);
  }
  function clearInput(): void {
    if((boxhead||brawler)&&attackHeld())cancelledAttack=bomb;
    if(brawler)cancelledAlt=jump;
    if(badminton){cancelledJump=jump;cancelledHit=hit;}if(brawler)cancelledJump=brawlerJump;
    keys.clear();held=null;presentation.clearPrediction();
  }
  function resetRound(next: number): void {
    round = next; seq = 0; bomb = 0; jump = 0; hit = 0; lastHitAt = 0; selectedWeapon=undefined; cancelledAttack=0;cancelledJump=0;cancelledHit=0;cancelledAlt=0;clearInput();
    brawlerJump=0;brawlerUpperAttack=0;brawlerUpperAlt=0;cancelledJump=0;
  }
  function alignCounters(state: State): void {
    if (!seat) return;
    seq = Math.max(seq, state.ack[seat - 1]);
    const player = "gameId" in state ? state.players.find((player) => player.seat === seat) : state.players[seat - 1];
    if (!player) return;
    if ("gameId" in state) { bomb = Math.max(bomb, player.lastAttack || 0); jump = Math.max(jump, player.lastAlt || 0);if(brawler)brawlerJump=Math.max(brawlerJump,player.lastJump||0);if(boxhead)actionSequence=Math.max(actionSequence,state.actionAck[seat-1]); }
    else if (isBomb(state)) bomb = Math.max(bomb, player.lastBomb);
    else { jump = Math.max(jump, player.lastJump); hit = Math.max(hit, player.lastHit);actionSequence=Math.max(actionSequence,state.actionAck[seat-1]); }
  }
  net.onRoom = () => {
    if (seat !== net.seat) { seat = net.seat; clearInput(); if (net.authority) alignCounters(net.authority); }
    updateUi();
  };
  net.onStatus = (message) => { notice(message); if (!net.connected) clearInput(); updateUi(); };
  net.onSnapshot = (state, time, receivedAt) => {
    if(boxhead&&'gameId'in state&&state.paused)clearInput();
    if(boxhead&&adapter?.rate){const rate=adapter.rate(state as ExpandedState);if(hz!==rate){hz=rate;window.clearInterval(timer);timer=window.setInterval(sendInput,1000/hz);}}
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
    if ("gameId" in state) { adapter?.confirm?.(state as ExpandedState); return; }
    if (isBomb(state)) bombView!.confirm(state);
    else {
      const next = { round: state.round, score: state.scoreEvents, hits: state.hits, winner: state.winner, strokes:state.players.map(p=>p.racket.strokes) };
      if (heard?.round === state.round) {
        state.players.forEach((p,i)=>{if(next.strokes[i]>heard!.strokes[i]&&state.tick-p.racket.strokeAt<=3)play('whoosh');});
        if (next.score>heard.score&&state.tick-state.scoreAt<=3) play("score");
        if (next.hits > heard.hits && state.tick-state.hitAt<=3) play("hit");
        if (next.winner && next.winner !== heard.winner) play(state.options.mode!=='versus'&&next.winner===2?'sigh':'cheer');
      }
      heard = next;
    }
  }
  function currentInput(now: number): Input {
    const directions=directionState(keys);
    if(boxhead)for(const [code]of keys){const role=extra(code);if(role&&['left','up','right','down'].includes(role))directions[role as keyof typeof directions]=true;}
    let preferredDirection=-1,lastDirectionAt=-1;
    if(bomb2)for(const [code,at]of keys)if(bombDirections[code]!==undefined&&at>=lastDirectionAt){preferredDirection=bombDirections[code];lastDirectionAt=at;}
    if (adapter && !boxhead && (shooters || tank) && actions.some((code) => keys.has(code)) && now - lastHitAt >= 1000 / hz) { bomb++; lastHitAt = now; }
    if (adapter) return { seq: ++seq, ...directions, attack: bomb, alt: jump,
      ...(brawler?{shield:keys.has('ShiftLeft')||keys.has('ShiftRight'),cancelledAttack,cancelledAlt,jump:brawlerJump,cancelledJump,upperAttack:brawlerUpperAttack,upperAlt:brawlerUpperAlt}:{}),
      ...(bomb2?{direction:preferredDirection}:{}),
      ...(boxhead ? {trigger:attackHeld(),cancelledAttack,weaponStep,...(selectedWeapon!==undefined?{weapon:selectedWeapon}:{})} : {}) };
    if (badminton) {
      return { seq: ++seq, left: directions.left, right: directions.right, jump, hit,
        jumpHeld:jumps.some(code=>keys.has(code))||keys.has('RobotJump'),hitHeld:actions.some(code=>keys.has(code))||keys.has('MouseHit'),cancelledJump,cancelledHit,...(pointer?{pointerX:pointer.x,pointerY:pointer.y}:{}) };
    }
    let dir: BombInput["dir"] = -1, time = -1;
    for (const [code, at] of keys) if (bombDirections[code] !== undefined && at >= time) { dir = bombDirections[code]; time = at; }
    return { seq: ++seq, dir, bomb, special: 0 };
  }
  function sendInput():void {
    if(boxhead&&net.authority&&'gameId'in net.authority&&net.authority.paused)return;
    if (!inputEnabled || !net.connected || !seat || !(badminton&&net.authority?canControl(net.authority as BadmintonState):net.authority?.phase==='playing')) return;
    const now = performance.now(); held = currentInput(now);
    if (net.control({ t: "authInput", round, input: held, serverTime: net.serverNow(now) })) presentation.input(held, now);
  }
  let timer = window.setInterval(sendInput, 1000 / hz);
  function press(code: string, down: boolean): void {
    if (!down) { const was=keys.has(code);keys.delete(code);if(brawler&&was&&directionKeys[code]===1&&!directionState(keys).up)brawlerJump++;return; }
    if(boxhead&&(net.authority as ExpandedState|null)?.paused)return;
    if (!seat || !(badminton&&net.authority?canControl(net.authority as BadmintonState):net.authority?.phase==='playing') || keys.has(code)) return;
    const now = performance.now(),direction=directionFor(code),aliasAt=boxhead&&direction!==undefined?[...keys].find(([held])=>directionFor(held)===direction)?.[1]:heldDirectionAt(keys,code);keys.set(code,aliasAt??now);inputAt=now;
    // Pressing the alternative for an already-held direction is not a second
    // jump/swing, and does not steal the latest-direction priority.
    if(aliasAt!==undefined)return;
    const role=extra(code);
    if (attackKey(code)) { if (badminton) hit++; else { bomb++; lastHitAt = now; } }
    if ((badminton || adapter) && (role?role==='previous'||role==='next':jumps.includes(code))) { jump++; selectedWeapon=undefined; weaponStep=role==='previous'||!role&&code==='KeyQ'?-1:1; }
    if(brawler){const upAt=[...keys].filter(([k])=>directionKeys[k]===1).map(([,at])=>at);if(upAt.length&&now-Math.min(...upAt)<50){if(attackKey(code))brawlerUpperAttack=bomb;if(jumps.includes(code))brawlerUpperAlt=jump;}}
    if (adapter?.id === "50737-server" && /^Digit[0-9]$/.test(code)) { selectedWeapon=(Number(code.slice(-1))+9)%10; jump++; }
  }
  function keyboard(event: KeyboardEvent, down: boolean): void {
    if((badminton||boxhead)&&event.code==='KeyP'&&down&&!event.repeat&&!(event.target as HTMLElement)?.matches('input,textarea,select,button')){event.preventDefault();gameCommand('pause');return;}
    if(badminton&&event.code==='Space'&&(net.authority as BadmintonState|null)?.robot){
      if(!down){keys.delete('RobotJump');return;}
      if(seat!==1||!canControl(net.authority as BadmintonState)||(event.target as HTMLElement)?.matches('input,textarea,select,button'))return;
      event.preventDefault();if(!keys.has('RobotJump'))jump++;keys.set('RobotJump',performance.now());return;
    }
    if(!down&&keys.has(event.code)){press(event.code,false);return;}
    if ((event.target as HTMLElement)?.matches("input, textarea, select, button")) return;
    if (bombDirections[event.code] === undefined && !actions.includes(event.code) && !jumps.includes(event.code) && !extra(event.code)&&!(brawler&&['ShiftLeft','ShiftRight'].includes(event.code))&&!(adapter?.id === "50737-server" && /^Digit[0-9]$/.test(event.code))) return;
    event.preventDefault(); press(event.code, down);
  }
  window.addEventListener("keydown", (event) => keyboard(event, true));
  window.addEventListener("keyup", (event) => keyboard(event, false));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { clearInput(); if (!document.hidden) net.requestFull(); });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-key]")) {
    button.onpointerdown = (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); press(button.dataset.key!, true); };
    const release = () => { press(button.dataset.key!, false); button.blur(); };
    const cancel=()=>{const code=button.dataset.key!;if((boxhead||brawler)&&keys.has(code)&&attackKey(code))cancelledAttack=bomb;if(brawler&&keys.has(code)&&jumps.includes(code))cancelledAlt=jump;if(badminton&&keys.has(code)){if(jumps.includes(code))cancelledJump=jump;if(actions.includes(code))cancelledHit=hit;}release();};
    button.onpointerup = release; button.onpointercancel = cancel; button.onlostpointercapture = cancel;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-seat]")) button.onclick = () => {
    const requested = Number(button.dataset.seat); net.control(seat === requested ? { t: "leaveSeat" } : { t: "sit", seat: requested }); button.blur();
  };
  function gameCommand(action:string):void {
    if((!badminton&&!boxhead)||!seat||!net.authority)return;
    net.control({t:'authGameAction',round:net.authority.round,seq:++actionSequence,action});
    if(action==='next'||action==='retry')play('next');
  }
  const pauseGame=()=>{gameCommand('pause');canvas.focus();};
  const gameMenu=()=>{gameCommand('menu');clearInput();canvas.focus();};
  if(badminton||boxhead){el('badminton-pause').onclick=pauseGame;el('badminton-menu').onclick=gameMenu;}
  function finishedAction():string|null {
    const s=badminton?net.authority as BadmintonState|null:null;
    return s?.phase==='finished'&&s.options.mode!=='versus'?s.winner===2?'retry':s.level<6?'next':'menu':null;
  }
  if(badminton){
    const aim=(event:PointerEvent)=>{const r=canvas.getBoundingClientRect();pointer={x:(event.clientX-r.left)*550/r.width,y:(event.clientY-r.top)*400/r.height};};
    canvas.addEventListener('pointermove',aim);
    canvas.addEventListener('pointerdown',event=>{
      if(event.button===0&&seat&&net.authority?.phase!=='waiting'){
        const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*550/r.width,y=(event.clientY-r.top)*400/r.height;
        // Functional hit areas for the MENU/P labels already in the court.
        // They stay usable when fullscreen hides the room controls.
        if(x>=0&&x<=50&&y>=0&&y<=25){event.preventDefault();gameMenu();return;}
        if(x>=0&&x<=28&&y>=50&&y<=75){event.preventDefault();pauseGame();return;}
      }
      if(!(net.authority as BadmintonState|null)?.robot||seat!==1||event.button!==0||!canControl(net.authority as BadmintonState))return;
      event.preventDefault();aim(event);canvas.focus();canvas.setPointerCapture(event.pointerId);if(!keys.has('MouseHit'))hit++;keys.set('MouseHit',performance.now());
    });
    const release=()=>keys.delete('MouseHit'),cancel=()=>{if(keys.has('MouseHit')){cancelledHit=hit;release();}};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  }
  function toggleReady(autoSit = false): void {
    if (!net.connected) return;
    if(adapter?.assetsReady&&(!net.authority||!adapter.assetsReady(net.authority as ExpandedState))&&!net.room.members.find(m=>m.id===net.id)?.ready)return;
    if (seat) {
      const mine = net.room.members.find((member) => member.id === net.id);
      net.control({ t: "ready", ready: !mine?.ready });
    } else if (autoSit) {
      const available = Object.keys(net.room.seats).map(Number).find(number => !net.room.seats[number]&&availableSeat(number));
      if (!available) return;
      net.control({ t: "sit", seat: available });
      net.control({ t: "ready", ready: true });
    }
    canvas.focus({ preventScroll: true });
  }
  el<HTMLButtonElement>("start-game").onclick = () => {const action=finishedAction();if(action)gameCommand(action);else toggleReady();};
  el<HTMLButtonElement>("fullscreen-ready").onclick = () => {if(boxhead&&(net.authority as ExpandedState|null)?.paused){pauseGame();return;}const action=finishedAction();if(action)gameCommand(action);else toggleReady(true);};
  el('fullscreen-pause').onclick=()=>{const s=net.authority as ExpandedState|null;if(s?.paused||s?.phase==='finished')gameMenu();else pauseGame();};
  function optionsChanged(event?:Event):void {
    if(boxhead){
      if(!net.isController)return;
      const target=event?.target as HTMLInputElement|HTMLSelectElement|null;
      if(!target)return;
      const fields:Record<string,string>={'game-map':'map','game-mode':'gameMode','game-difficulty':'difficulty','boxhead-speed':'speed','boxhead-death-limit':'deathLimit','boxhead-devils':'devils','boxhead-collisions':'collisions','boxhead-damage':'damage'};
      const field=fields[target.id];if(!field)return;
      const value=target instanceof HTMLInputElement?target.checked:['speed','deathLimit'].includes(field)?Number(target.value):target.value;
      net.control({t:'authOptions',[field]:value});return;
    }
    if (net.isController) net.control(badminton?{t:'authOptions',gameMode:modeSelect.value}:{ t: "authOptions", map: mapSelect.value, ...(adapter?.modes ? { gameMode: modeSelect.value } : {}), ...(difficultySettings?{difficulty:difficultySelect.value}:{}), loadout: el<HTMLSelectElement>("game-loadout").value,
    });
  }
  for (const key of ["map", "mode", "loadout", "difficulty"] as const) el<HTMLSelectElement>(`game-${key}`).onchange = optionsChanged;
  for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('#boxhead-options input,#boxhead-options select'))control.onchange=optionsChanged;
  el('boxhead-reset-options').onclick=()=>{if(boxhead&&net.isController&&net.authority?.phase!=='playing')net.control({t:'authOptions',map:mapSelect.value,gameMode:modeSelect.value,difficulty:'beginner',speed:1,devils:true,collisions:true,damage:true,deathLimit:10});};
  characterSelect.onchange=()=>{net.control({t:'authCharacter',character:Number(characterSelect.value)});characterSelect.blur();};
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
    adapter?.setSound?.(sound); adapter?.setVolume?.(volume / 100);
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
      if(!availableSeat(number)){button.disabled=true;button.textContent='未开放';row.querySelector<HTMLElement>('.who')!.textContent='当前模式不开放此席位';}
      row.classList.toggle("mine", seat === number); row.classList.toggle("ready", !!member?.ready);
      if(badminton&&number===2&&net.authority&&(net.authority as BadmintonState).options.mode!=='versus'){
        const s=net.authority as BadmintonState|null;row.querySelector<HTMLElement>('.who')!.textContent=`电脑 · 第 ${s?.level??1} 级`;button.textContent='电脑';button.disabled=true;
      }
    }
    const loadingAssets=!!adapter?.assetsReady&&(!state||!adapter.assetsReady(state as ExpandedState))&&!mine?.ready;
    const ready = el<HTMLButtonElement>("start-game"); ready.disabled = !net.connected || !seat || loadingAssets;
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
    ready.textContent = loadingAssets ? "素材加载中…" : mine?.ready ? "取消准备" : "准备";
    ready.setAttribute("aria-pressed", String(!!mine?.ready));
    const fullscreenReady = el<HTMLButtonElement>("fullscreen-ready");
    const hasOpenSeat = Object.entries(net.room.seats).some(([number,id]) => !id&&availableSeat(Number(number)));
    fullscreenReady.disabled = !net.connected || !seat && !hasOpenSeat || loadingAssets;
    fullscreenReady.textContent = seat ? ready.textContent : hasOpenSeat ? "入座并准备" : "席位已满";
    fullscreenReady.setAttribute("aria-pressed", String(!!mine?.ready));
    if(badminton){
      const s=net.authority as BadmintonState|null,mode=s?.options.mode??'versus',action=finishedAction();modeSelect.value=mode;
      el('host-line').textContent=net.isController?'你可以选择单人角色或双人对战；切换前请让P2离座':'房间管理者可选择单人角色或双人对战';
      el('mode-note').textContent=mode==='versus'?'两人入座并准备后开始；结束3秒后继续下一局。':'P1准备后挑战六级电脑；胜利后进入下一级，失败可重试当前级。';
      el('controls-guide').textContent=mode==='robot'?'鼠标或触摸拖动，按住左键、触点或S/↓发球和击球，P暂停。':'A/D 或 ←/→ 移动，W/↑跳跃，S/↓发球和挥拍，P暂停。'+(mode==='human'?'人类可下手接低球。':'');
      (document.querySelector('.direction-pad') as HTMLElement).hidden=mode==='robot';
      if(action){const label=action==='next'?'下一关':action==='retry'?'再试一次':'返回准备';ready.textContent=fullscreenReady.textContent=label;ready.disabled=fullscreenReady.disabled=!net.connected||seat!==1;}
      el('round-status').textContent=s?.paused?'已暂停 · P继续':s?.phase==='finished'?mode==='versus'?'比赛结束':s.winner===1&&s.level===6?'六级挑战完成':`第 ${s.level} 级结束`:mode==='versus'?'双人对战':`第 ${s?.level??1} / 6 级`;
    }
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
      el("mode-note").textContent = `${mode?.description || ""} ${mode?.minPlayers===1?'P1':'至少两人入座，全员'}准备开局；结束 3 秒后自动续局。`;
      if(boxhead)el('host-line').textContent=net.isController?'你可选择地图、模式和难度；单人模式只开放P1':'房间管理者可选地图、模式和难度；人物由本人选择';
      for(const option of modeSelect.options){const config=adapter.modes.find(m=>m.id===option.value);option.disabled=!!config?.maxPlayers&&Object.entries(net.room.seats).some(([seat,id])=>!!id&&Number(seat)>config.maxPlayers!);}
      const playingKill = bomb2 && state && "gameId" in state && state.mode === "kill";
      el("attack-button-text").textContent = boxhead ? "射击" : playingKill ? "使用武器" : "放炸弹";
      el("controls-guide").textContent = playingKill ? "方向键 / WASD 移动；空格 / J / Shift 使用当前武器；基础锤子可反复使用。" : adapter.controls;
      const player = bomb2 && state && "gameId" in state ? state.players.find(p => p.seat === seat) : null;
      if (player) { el("weapon-status").hidden = false; el("weapon-status").textContent = bomb2WeaponLabel(state as ExpandedState, player); }
      else el("weapon-status").hidden = true;
      if (bomb2 && state && "gameId" in state) el("score-line").textContent = state.mode === "kill" ? state.players.map(p => `P${p.seat} ${p.points}/10 分${p.points >= 8 ? " · 即将获胜" : ""}`).join("　") : "";
    }
    mapSelect.disabled = !net.isController || state?.phase === "playing";
    modeSelect.disabled = mapSelect.disabled;
    el<HTMLSelectElement>("game-loadout").disabled = mapSelect.disabled;
    difficultySelect.disabled=mapSelect.disabled;
    if(boxhead&&state&&'gameId'in state){
      const settings=state.options,deathmatch=state.mode==='deathmatch',locked=!net.isController||state.phase==='playing';
      el<HTMLSelectElement>('boxhead-speed').value=String(settings.speed);el<HTMLSelectElement>('boxhead-death-limit').value=String(settings.deathLimit);el('boxhead-death-limit-label').hidden=!deathmatch;
      for(const key of ['devils','collisions','damage'] as const){const control=el<HTMLInputElement>('boxhead-'+key);control.checked=settings[key];control.disabled=locked||deathmatch&&key==='damage';}
      for(const key of ['speed','death-limit'])el<HTMLSelectElement>('boxhead-'+key).disabled=locked;
      el<HTMLButtonElement>('boxhead-reset-options').disabled=locked;
      if(deathmatch)el('score-line').textContent=state.players.map(p=>`P${p.seat} 剩余 ${Math.max(0,settings.deathLimit-p.deaths)} 次`).join('　');else el('score-line').textContent='';
      const fullPause=el<HTMLButtonElement>('fullscreen-pause');fullPause.disabled=!net.connected||!seat||state.phase==='waiting';fullPause.textContent=state.paused||state.phase==='finished'?'返回准备':'暂停';
      if(state.paused){fullscreenReady.textContent='继续';fullscreenReady.disabled=!net.connected||!seat;}
      const custom=Object.entries(bindings).map(([role,code])=>`${CONTROL_LABELS[role as Control]} ${keyLabel(code)}`).join('，');if(custom)el('controls-guide').textContent=`WASD／方向键移动，空格射击，数字选枪，P暂停。额外按键优先：${custom}`;
    }
    if(badminton||boxhead){
      const s=state as BadmintonState|ExpandedState|null,pauseButton=el<HTMLButtonElement>('badminton-pause'),menuButton=el<HTMLButtonElement>('badminton-menu');
      pauseButton.textContent=s?.paused?'继续':'暂停';pauseButton.setAttribute('aria-pressed',String(!!s?.paused));pauseButton.disabled=!net.connected||!seat||s?.phase!=='playing';menuButton.disabled=!net.connected||!seat||!s||s.phase==='waiting';
    }
    if(characterSettings){
      const people=(state?.players||[]) as {seat?:number;character?:number|string}[];
      const me=people.find(p=>p.seat===seat);
      if(me?.character!==undefined)characterSelect.value=String(adapter?.characterIds?adapter.characterIds.indexOf(me.character)+1:me.character);
      characterSelect.disabled=!seat||state?.phase==='playing';
      for(const option of characterSelect.options)option.disabled=!adapter?.duplicateCharacters&&people.some(p=>p.seat!==seat&&net.room.members.some(m=>m.seat===p.seat)&&p.character===(adapter?.characterIds?adapter.characterIds[Number(option.value)-1]:Number(option.value)));
      difficultySelect.value=(net.room.auth?.options as {difficulty?:string})?.difficulty||adapter?.difficulties?.[0]?.id||'normal';
      if(bomb2&&state&&'gameId'in state){
        const p=state.players.find(p=>p.seat===seat);
        el('attack-button-text').textContent=p&&(p.weapon||p.attack||state.mode==='kill'||state.bombs.some((b:any)=>b.owner===seat&&b.kind==='remote'))?'使用武器':'放炸弹';
      }
    }
    const nextAt = net.room.auth?.nextRoundAt;
    if (!net.connected) el("round-status").textContent = "连接中";
    else if(!badminton){
      if(boxhead&&state&&'gameId'in state&&state.paused)el('round-status').textContent='已暂停 · P继续';
      else if (state?.phase === "playing") { const rotation=net.room.auth?.mapRotation;el("round-status").textContent = "比赛进行中"+(rotation?` · 本图第 ${Math.min(rotation.every,rotation.completed+1)}/${rotation.every} 局`:''); }
      else if (state?.phase === "finished" && nextAt) { const rotation=net.room.auth?.mapRotation;el("round-status").textContent = `${Math.max(0, Math.ceil((nextAt - net.serverNow()) / 1000))} 秒后${rotation&&rotation.completed>=rotation.every?'换图并':''}开始下一局`; }
      else el("round-status").textContent = "入座并准备后自动开始";
    }
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

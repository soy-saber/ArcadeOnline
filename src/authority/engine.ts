import * as bomb from "./bomb-core";
import * as badminton from "../badminton/core";
import { ORIGINAL_MAPS } from './maps';
import { createUpdate, State, Update } from "./protocol";
import { getAdapter } from "../expanded/registry";
import { State as ExpandedState, Input as ExpandedInput, EMPTY_INPUT as EXPANDED_EMPTY, validInput as validExpandedInput } from "../expanded/types";
import {SPEEDS as BOXHEAD_SPEEDS,DEATH_LIMITS} from '../expanded/boxhead-options';

interface Socket { readyState: number; bufferedAmount: number; send(text: string): void; close(code: number, reason: string): void }
interface Member { id: string; name?: string; seat: number | null; ready: boolean; ws: Socket | null }
export interface RecordRow { id: string; name: string; kills: number; deaths: number; wins: number; rounds: number }
export interface Room {
  gameId: string; seats: Record<number, string | null>; members: Map<string, Member>;
  controllerId?: string | null; auth?: Match;
}
interface Delivery { base: State | null; outstanding: Update | null; sentAt: number; fullAt: number; forceFull: boolean }
interface RemoteInput { input: bomb.Input | badminton.Input | ExpandedInput; at: number; receivedAt: number }
interface Match {
  state: State; roster: string; clock: number; accumulator: number; nextRoundAt: number;
  completedOnMap: number;
  lastPublish: number; options: Partial<bomb.GameOptions> & { gameMode?: string;speed?:number;devils?:boolean;collisions?:boolean;damage?:boolean;deathLimit?:number }; inputs: Map<string, RemoteInput>; deliveries: Map<string, Delivery>;
  records: Map<string, RecordRow>; roundMembers: Map<number, string>;
}
const isBomb = (room: Room) => room.gameId === "3881-server";
const isSolo=(room:Room)=>room.gameId==='46923-server'&&(room.auth?.options.gameMode??'versus')!=='versus';
const modeSettings=(room:Room)=>getAdapter(room.gameId)?.modes?.find(m=>m.id===room.auth?.options.gameMode);
const hasRecords = (room: Room) => isBomb(room) || !!getAdapter(room.gameId) && room.gameId !== "fbw_forest-server";
const activeSeats = (room: Room) => Object.keys(room.seats).map(Number).filter((seat) => !!room.seats[seat]);
const allReady = (room: Room) => {
  const players = [...room.members.values()].filter((member) => member.seat != null);
  const mode=modeSettings(room),minimum=isSolo(room)?1:mode?.minPlayers??2,maximum=isSolo(room)?1:mode?.maxPlayers??Infinity;
  return players.length>=minimum&&players.length<=maximum&&(!isSolo(room)||players[0].seat===1)&&players.every((member) => member.ready);
};
let roundId = Date.now();
function newState(room: Room, playing: boolean): State {
  const round = roundId = Math.max(Date.now(), roundId + 1);
  const adapter = getAdapter(room.gameId);
  if (adapter) return { ...adapter.create(round, playing, activeSeats(room), Math.floor(Math.random() * 0x100000000), room.auth?.options.map, room.auth?.options.gameMode,room.auth?.options), gameId: adapter.id };
  return isBomb(room) ? bomb.createGame(Math.floor(Math.random() * 0x100000000), round, playing,
    { ...room.auth?.options, mode: "online", bots: [], activeSeats: activeSeats(room) }) : badminton.createGame(round, playing,(room.auth?.options.gameMode??'versus')as badminton.GameMode);
}
const copy = (state: State) => JSON.parse(JSON.stringify(state)) as State;
function expireAction(room: Room, seat: number, input: bomb.Input | badminton.Input | ExpandedInput): void {
  const adapter = getAdapter(room.gameId);
  const player = adapter ? room.auth!.state.players.find((player) => player.seat === seat) : room.auth!.state.players[seat - 1];
  if (adapter) {
    if (adapter.consumeInput) adapter.consumeInput(room.auth!.state as ExpandedState, seat, input as ExpandedInput);
    else if (player) { player.lastAttack = Math.max(player.lastAttack || 0, (input as ExpandedInput).attack); player.lastAlt = Math.max(player.lastAlt || 0, (input as ExpandedInput).alt); }
  }
  else if (isBomb(room)) (player as bomb.Player).lastBomb = Math.max((player as bomb.Player).lastBomb, (input as bomb.Input).bomb);
  else badminton.consumeInput(room.auth!.state as badminton.GameState,seat,input as badminton.Input);
}

export class AuthorityEngine {
  constructor(private changed: (room: Room) => void) {}

  onRoom(room: Room): void {
    if (!room.auth) {
      room.auth = { state: newState(room, false), roster: "", clock: Date.now(), accumulator: 0, nextRoundAt: 0,
        completedOnMap: 0, lastPublish: 0, options: {}, inputs: new Map(), deliveries: new Map(), records: new Map(), roundMembers: new Map() };
      if (isBomb(room)) room.auth.options = { ...(room.auth.state as bomb.GameState).options };
      if(room.gameId==='46923-server')room.auth.options.gameMode='versus';
      const adapter = getAdapter(room.gameId);
      if (adapter?.maps?.length) room.auth.options.map = adapter.maps[0].id as bomb.GameOptions["map"];
      if (adapter?.modes?.length) room.auth.options.gameMode = adapter.modes[0].id;
      if(adapter?.difficulties?.length)room.auth.options.difficulty=((room.auth.state as ExpandedState).options?.difficulty??adapter.difficulties[0].id)as bomb.GameOptions['difficulty'];
    }
    const match = room.auth;
    for (const member of room.members.values()) {
      const record = match.records.get(member.id);
      if (record) record.name = member.name || record.name;
    }
    const roster = JSON.stringify(room.seats);
    if (!room.controllerId || !room.members.has(room.controllerId)) room.controllerId = room.members.keys().next().value || null;
    for (const id of match.deliveries.keys()) if (!room.members.has(id)) match.deliveries.delete(id);
    for (const id of match.inputs.keys()) if (!room.members.has(id)) match.inputs.delete(id);
    if (roster !== match.roster) {
      match.roster = roster; this.begin(room, false);
    }
    if (match.state.phase === "waiting" && allReady(room)) this.begin(room, true);
    // Becoming unready never interrupts an active round; it gates the next one.
  }

  info(room: Room): object {
    const match = room.auth!;
    return { phase: match.state.phase, round: match.state.round, nextRoundAt: match.nextRoundAt, options: match.options,
      ...(isBomb(room)?{mapRotation:{every:5,completed:match.completedOnMap}}:{}),
      ...(hasRecords(room) ? { records: [...match.records.values()].sort((a, b) => b.kills - a.kills || b.wins - a.wins || a.deaths - b.deaths) } : {}) };
  }

  private begin(room: Room, playing: boolean): void {
    const match = room.auth!;
    if(isBomb(room)&&match.completedOnMap>=5){
      const choices=ORIGINAL_MAPS.filter(map=>map.id!==match.options.map);
      match.options.map=choices[Math.floor(Math.random()*choices.length)].id;
      match.completedOnMap=0;
    }
    match.state = newState(room, playing); match.inputs.clear(); match.nextRoundAt = 0;
    match.roundMembers = new Map(activeSeats(room).map((seat) => [seat, room.seats[seat]!]));
    if (hasRecords(room) && playing) for (const id of match.roundMembers.values()) {
      if (!match.records.has(id)) match.records.set(id, { id, name: room.members.get(id)?.name || id, kills: 0, deaths: 0, wins: 0, rounds: 0 });
    }
    match.clock = Date.now(); match.accumulator = 0; match.lastPublish = 0;
    for (const delivery of match.deliveries.values()) {
      delivery.base = null; delivery.outstanding = null; delivery.forceFull = true;
    }
  }

  reconnect(room: Room, member: Member): void {
    if (room.auth && member.seat) {
      const pending = room.auth.inputs.get(member.id)?.input || room.auth.state.inputs?.[member.seat - 1];
      if (pending) expireAction(room, member.seat, pending);
    }
    room.auth?.deliveries.delete(member.id); room.auth?.inputs.delete(member.id);
  }

  publish(room: Room, now = Date.now()): void {
    const match = room.auth; if (!match) return;
    for (const member of room.members.values()) {
      const ws = member.ws;
      if (!ws || ws.readyState !== 1) continue;
      let delivery = match.deliveries.get(member.id);
      if (!delivery) { delivery = { base: null, outstanding: null, sentAt: 0, fullAt: 0, forceFull: true }; match.deliveries.set(member.id, delivery); }
      // Do not build a TCP queue while a browser/network is stalled. Only one
      // update is in flight; after a long stall reconnect with a full baseline.
      if (delivery.outstanding) {
        if (now - delivery.sentAt > 2000) ws.close(4002, "state acknowledgement timeout");
        continue;
      }
      if (ws.bufferedAmount > 16 * 1024) { delivery.forceFull = true; continue; }
      if (delivery.base?.round === match.state.round && delivery.base.tick === match.state.tick && !delivery.forceFull && now - delivery.fullAt < 5000) continue;
      const full = delivery.forceFull || !delivery.base || now - delivery.fullAt >= 5000;
      const view = isBomb(room) ? { ...match.state, specials: bomb.visibleSpecials(match.state as bomb.GameState, member.seat) } as State : match.state;
      const update = createUpdate(delivery.base, view, now, full);
      delivery.outstanding = { ...update, state: copy(view) };
      delivery.sentAt = now; delivery.forceFull = false;
      if (full) delivery.fullAt = now;
      ws.send(JSON.stringify(update));
    }
  }

  ack(room: Room, member: Member, message: Record<string, unknown>): void {
    const delivery = room.auth?.deliveries.get(member.id), sent = delivery?.outstanding;
    if (!delivery || !sent || message.round !== sent.round || message.tick !== sent.tick) return;
    if (message.hash !== sent.hash) { delivery.base = null; delivery.forceFull = true; }
    else delivery.base = sent.state!;
    delivery.outstanding = null;
  }

  resync(room: Room, member: Member): void {
    const delivery = room.auth?.deliveries.get(member.id);
    if (delivery) { delivery.outstanding = null; delivery.base = null; delivery.forceFull = true; }
    this.publish(room);
  }

  input(room: Room, member: Member, message: Record<string, unknown>, now = Date.now()): void {
    const match = room.auth;
    if (!match || !member.seat || message.round !== match.state.round || !(match.state.phase==='playing'||isSolo(room)&&badminton.canControl(match.state as badminton.GameState))||isSolo(room)&&member.seat!==1) return;
    const input = message.input;
    const adapter = getAdapter(room.gameId);
    if (!(adapter ? validExpandedInput(input) : isBomb(room) ? bomb.validInput(input) : badminton.validInput(input))) return;
    const incoming = input as bomb.Input | badminton.Input | ExpandedInput;
    const previous = match.inputs.get(member.id);
    if (incoming.seq <= (previous?.input.seq || 0)) return;
    const timestamp = Number(message.serverTime);
    if (!Number.isFinite(timestamp) || timestamp > now + 250 || now - timestamp > 250) {
      // Expired button presses must not reappear in the next full input packet.
      expireAction(room, member.seat, incoming);
      const neutral = adapter ? { ...incoming, left: false, right: false, up: false, down: false } : isBomb(room) ? { ...incoming, dir: -1 as const } : { ...incoming, left: false, right: false, jumpHeld:false,hitHeld:false };
      match.inputs.set(member.id, { input: neutral, at: now - 251, receivedAt: now });
      return;
    }
    if(room.gameId==='50737-server'&&(match.state as ExpandedState).paused){
      expireAction(room,member.seat,incoming);match.inputs.set(member.id,{input:{...incoming,left:false,right:false,up:false,down:false,trigger:false},at:now-251,receivedAt:now});return;
    }
    if (now - (previous?.receivedAt || 0) < 5) return;
    match.inputs.set(member.id, { input: { ...incoming }, at: timestamp, receivedAt: now });
  }

  options(room: Room, member: Member, message: Record<string, unknown>): boolean {
    const match = room.auth;
    if (!match || room.controllerId !== member.id || match.state.phase === "playing") return false;
    const adapter = getAdapter(room.gameId);
    if(room.gameId==='46923-server'){
      if(!badminton.MODES.some(m=>m.id===message.gameMode)||message.gameMode!=='versus'&&!!room.seats[2])return false;
      match.options.gameMode=message.gameMode as string;for(const m of room.members.values())m.ready=false;this.begin(room,false);return true;
    }
    const difficulty=message.difficulty??match.options.difficulty??adapter?.difficulties?.[0]?.id??'normal';
    if(adapter?.difficulties?!adapter.difficulties.some(d=>d.id===difficulty):isBomb(room)&&(typeof difficulty!=='string'||!['easy','normal','hard'].includes(difficulty)))return false;
    if (adapter) {
      const map = message.map ?? match.options.map, requestedMode = message.gameMode ?? match.options.gameMode;
      if (requestedMode !== undefined && typeof requestedMode !== "string") return false;
      const mode = requestedMode as string | undefined;
      if (typeof map !== "string" || !adapter.maps?.some((item) => item.id === map)) return false;
      if (adapter.modes && !adapter.modes.some((item) => item.id === mode)) return false;
      const requested=adapter.modes?.find(m=>m.id===mode);
      if(requested?.maxPlayers&&Object.entries(room.seats).some(([seat,id])=>!!id&&Number(seat)>requested.maxPlayers!))return false;
      const boxheadSettings:Record<string,number|boolean>={};
      if(room.gameId==='50737-server'){
        for(const key of ['devils','collisions','damage']as const){const value=message[key]===undefined?match.options[key]??true:message[key];if(typeof value!=='boolean')return false;boxheadSettings[key]=value;}
        const speed=message.speed===undefined?match.options.speed??1:message.speed,deathLimit=message.deathLimit===undefined?match.options.deathLimit??10:message.deathLimit;
        if(typeof speed!=='number'||!BOXHEAD_SPEEDS.includes(speed)||typeof deathLimit!=='number'||!DEATH_LIMITS.includes(deathLimit))return false;
        boxheadSettings.speed=speed;boxheadSettings.deathLimit=deathLimit;
      }
      if (!adapter.modes && message.gameMode !== undefined) return false;
      const candidate = adapter.create(match.state.round, false, activeSeats(room), 123, map, mode,{...match.options,...boxheadSettings,difficulty:String(difficulty)});
      if (!adapter.valid(candidate)) return false;
      match.options.map = map as bomb.GameOptions["map"];
      if (adapter.modes) {if(room.gameId==='50737-server'&&match.options.gameMode!==mode)for(const m of room.members.values())m.ready=false;match.options.gameMode = mode;}
      if(adapter.difficulties)match.options.difficulty=difficulty as bomb.GameOptions['difficulty'];
      Object.assign(match.options,boxheadSettings);
      this.begin(room, false); return true;
    }
    if (!isBomb(room)) return false;
    const options: Partial<bomb.GameOptions> = { ...match.options };
    // createGame/validState jointly enforce the map and loadout allowlists.
    if (typeof message.map === "string") options.map = message.map as bomb.GameOptions["map"];
    if (typeof message.loadout === "string") options.loadout = message.loadout as bomb.GameOptions["loadout"];
    options.difficulty=difficulty as bomb.GameOptions['difficulty'];
    const candidate = bomb.createGame(123, match.state.round, false, { ...options, mode: "online", activeSeats: activeSeats(room) });
    if (!bomb.validState(candidate)) return false;
    if(options.map!==match.options.map)match.completedOnMap=0;
    match.options = options; this.begin(room, false); return true;
  }

  character(room:Room,member:Member,value:unknown):boolean {
    const match=room.auth,adapter=getAdapter(room.gameId);
    if(!match||member.seat==null||room.seats[member.seat]!==member.id||match.state.phase==='playing'||(!isBomb(room)&&!adapter?.characters)||!Number.isInteger(value)||Number(value)<1||Number(value)>4)return false;
    const character=Number(value);
    const ids=adapter?.characterIds,selected=ids?ids[character-1]:character;
    if(!adapter?.duplicateCharacters&&match.state.players.some(p=>p.seat!==member.seat&&room.seats[p.seat]&&p.character===selected))return false;
    const characters=match.options.characters?[...match.options.characters]:[1,2,3,4];for(const p of match.state.players)if(room.seats[p.seat])characters[p.seat-1]=ids?ids.indexOf(p.character)+1:p.character;
    characters[member.seat-1]=character;match.options.characters=characters;
    this.begin(room,false);return true;
  }

  canSit(room:Room,seat:number):boolean {return isSolo(room)?seat===1:seat<=(modeSettings(room)?.maxPlayers??Infinity);}
  gameAction(room:Room,member:Member,message:Record<string,unknown>):boolean {
    if(room.gameId==='46923-server')return this.badmintonAction(room,member,message);
    const match=room.auth;
    if(room.gameId!=='50737-server'||!match||!member.seat||room.seats[member.seat]!==member.id||message.round!==match.state.round)return false;
    const state=match.state as ExpandedState,seq=message.seq;
    if(typeof seq!=='number'||!Number.isSafeInteger(seq)||seq<=state.actionAck[member.seat-1]||seq>=1e9)return false;
    if(message.action==='menu'){
      if(state.phase==='waiting')return false;for(const m of room.members.values())m.ready=false;this.begin(room,false);
    }else if(message.action==='pause'&&state.phase==='playing'){
      state.paused=!state.paused;state.actionAck[member.seat-1]=seq;
      for(const m of room.members.values())if(m.seat){const pending=match.inputs.get(m.id)?.input??state.inputs[m.seat-1];if(pending)expireAction(room,m.seat,pending);match.inputs.delete(m.id);state.inputs[m.seat-1]={...state.inputs[m.seat-1],left:false,right:false,up:false,down:false,trigger:false};}
      match.accumulator=0;
    }else return false;
    for(const delivery of match.deliveries.values())delivery.forceFull=true;this.publish(room);return true;
  }
  badmintonAction(room:Room,member:Member,message:Record<string,unknown>):boolean {
    const match=room.auth;
    if(room.gameId!=='46923-server'||!match||!member.seat||room.seats[member.seat]!==member.id||message.round!==match.state.round)return false;
    const state=match.state as badminton.GameState,seq=message.seq;
    if(typeof seq!=='number'||!Number.isSafeInteger(seq)||seq<=state.actionAck[member.seat-1]||seq>=1e9)return false;
    if(message.action==='menu'){
      if(isSolo(room)&&member.seat!==1)return false;
      for(const m of room.members.values())m.ready=false;this.begin(room,false);
    }else if(!badminton.action(state,member.seat,seq,message.action))return false;
    for(const d of match.deliveries.values())d.forceFull=true;
    this.publish(room);return true;
  }

  pump(room: Room, now = Date.now()): void {
    const match = room.auth; if (!match || room.members.size === 0) return;
    const adapter = getAdapter(room.gameId);
    const stepMs = adapter ? 1000 / (adapter.rate?.(match.state as ExpandedState)??adapter.hz) : isBomb(room) ? bomb.STEP_MS : badminton.STEP_MS;
    const elapsed = Math.max(0, now - match.clock); match.clock = now;
    // Bound work per event-loop turn; a machine stall pauses match time instead
    // of replaying seconds of rules in a single burst.
    match.accumulator += Math.min(elapsed, stepMs * 2);
    let changed = false;
    while ((match.state.phase === "playing"||isSolo(room)&&match.state.phase==='finished') && match.accumulator >= stepMs) {
      const previousPhase=match.state.phase;
      const inputs = Object.keys(room.seats).map(Number).map((seat) => {
        const id = room.seats[seat], remote = id ? match.inputs.get(id) : null;
        const empty = adapter ? EXPANDED_EMPTY : isBomb(room) ? bomb.EMPTY_INPUT : badminton.EMPTY_INPUT;
        if (!remote) {
          // The badminton core retains held input when a lower sequence is
          // supplied. Neutralize using the current sequence after reconnect.
          const current = match.state.inputs?.[seat - 1] || empty;
          return adapter ? { ...current, left: false, right: false, up: false, down: false, trigger: false } : isBomb(room) ? { ...current, dir: -1 } : { ...current, left: false, right: false, jumpHeld:false,hitHeld:false };
        }
        if (now - remote.at <= 250) return remote.input;
        expireAction(room, seat, remote.input);
        return adapter ? { ...remote.input, left: false, right: false, up: false, down: false, trigger: false } : isBomb(room) ? { ...remote.input, dir: -1 } : { ...remote.input, left: false, right: false, jumpHeld:false,hitHeld:false };
      });
      if (adapter) {
        const game = match.state as ExpandedState;
        const counts = (p: any) => ({ kills: p.kills ?? p.kos ?? 0, deaths: p.deaths ?? 0, lives: p.stocks ?? p.lives ?? null, alive: p.alive });
        const before = new Map(game.players.map((p) => [p.seat, counts(p)]));
        adapter.step(game, inputs as ExpandedInput[]);
        if (hasRecords(room)) {
          for (const player of game.players) {
            const previous = before.get(player.seat), id = match.roundMembers.get(player.seat), record = id ? match.records.get(id) : null;
            if (!previous || !record) continue;
            const current = counts(player);
            const kills = Math.max(0, current.kills - previous.kills);
            const deaths = Math.max(0, current.deaths - previous.deaths, previous.lives === null ? 0 : previous.lives - (current.lives ?? previous.lives), previous.alive && !current.alive ? 1 : 0);
            record.kills += kills; record.deaths += deaths;
            if (kills || deaths) changed = true;
          }
          if (game.phase === "finished") for (const [seat, id] of match.roundMembers) {
            const record = match.records.get(id); if (!record) continue;
            record.rounds++;
            if (game.winner === seat || room.gameId === "50737-server" && game.mode==='coop'&&game.winner === 1) record.wins++;
          }
        }
      }
      else if (isBomb(room)) {
        const game = match.state as bomb.GameState;
        const alive = game.players.map((player) => player.alive);
        bomb.step(game, inputs as bomb.Input[]);
        for (let i = 0; i < game.players.length; i++) if (alive[i] && !game.players[i].alive) {
          const player = game.players[i], victimId = match.roundMembers.get(player.seat), killerId = match.roundMembers.get(player.killedBy);
          const victim = victimId ? match.records.get(victimId) : null;
          if (victim) victim.deaths++;
          if (killerId && killerId !== victimId) { const killer = match.records.get(killerId); if (killer) killer.kills++; }
          changed = true;
        }
        if (game.phase === "finished") for (const [seat, id] of match.roundMembers) {
          const record = match.records.get(id); if (!record) continue;
          record.rounds++; if (game.winner === seat) record.wins++;
        }
        if(game.phase==='finished')match.completedOnMap++;
      }
      else badminton.step(match.state as badminton.GameState, inputs as badminton.Input[]);
      match.accumulator -= stepMs;
      if ((match.state.phase as string) === "finished"&&previousPhase!=='finished') { if(!isSolo(room))match.nextRoundAt = now + 3000; changed = true; }
    }
    if (match.state.phase !== "playing"&&!(isSolo(room)&&match.state.phase==='finished')) match.accumulator = 0;
    if (match.state.phase === "finished"&&!isSolo(room) && now >= match.nextRoundAt) {
      this.begin(room, allReady(room)); changed = true;
    }
    if (changed) this.changed(room);
    if (now - match.lastPublish >= 50 || changed) { match.lastPublish = now; this.publish(room, now); }
  }
}

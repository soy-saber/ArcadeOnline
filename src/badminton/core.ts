// Stage geometry and frame cadence come from the original SWF (550×400, 30 FPS).
import { racketFrameContains, racketFramePose, servePoint,type ActorKey } from './geometry';
import { controlState, advanceRacket, startRacket, syncControl, validControl } from './control';
import { setMotion } from './motion';
import {birdie,fly,type Birdie} from './ball';
import {spawnTrail,spawnRobotTrail,advanceTrails,type Particle} from './particles';
import {boundsContains,shapeContains} from './collision';
import {cpuState,runCPU,type CPUState} from './cpu';
import {runRobot,type RobotState} from './robot';
import {HZ,GROUND,NET_X,TARGET,LEFT_WALL,RIGHT_WALL,NET_LIMIT_X,NET_LIMIT_HALF_WIDTH,NET_LIMIT_TOP,NET_LIMIT_BOTTOM,pixel,SPAWN1,SPAWN2} from './stage';
export {HZ,STEP_MS,WIDTH,HEIGHT,GROUND,NET_X,NET_TOP,TARGET,LEFT_WALL,RIGHT_WALL} from './stage';
export {birdie} from './ball';
export type {Birdie} from './ball';

export type GameMode='versus'|'human'|'robot';
export const MODES=[{id:'versus',label:'双人对战'},{id:'human',label:'单人 · 人类'},{id:'robot',label:'单人 · 机器人'}] as const;
export interface Input { seq: number; left: boolean; right: boolean; jump: number; hit: number; jumpHeld?:boolean; hitHeld?:boolean; cancelledJump?:number; cancelledHit?:number;pointerX?:number;pointerY?:number }
export interface Player extends ReturnType<typeof controlState> { x: number; y: number; vy: number; swing: number; swingHit:boolean; servePose: number; underhand: number; lastJump: number; lastHit: number; facing: number }
export interface GameState {
  round: number; tick: number; phase: "waiting" | "playing" | "finished";
  rally: "serve" | "flight" | "point"; serve: 0 | 1 | 2; winner: 0 | 1 | 2;
  score: [number, number]; players: [Player, Player]; birdie: Birdie;
  ack: [number, number]; inputs: [Input, Input]; pointTicks: number; lastPoint: 0 | 1 | 2;
  resetAt:number|null; finishAt:number|null; lastResetAt:number|null;
  rng:number;servingSpot:number;chance1:number|null;particles:Particle[];nextParticle:number;
  net:{frame:number;playing:boolean;hits:number;at:number};hits:number;hitAt:number;
  options:{mode:GameMode};level:number;paused:boolean;cpu:CPUState|null;robot:(RobotState&{pointerX:number;pointerY:number})|null;actionAck:[number,number];scoreEvents:number;scoreAt:number;
}
export const EMPTY_INPUT: Input = { seq: 0, left: false, right: false, jump: 0, hit: 0 };
function random(s:GameState):number {s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}

export function actorKey(s:GameState,seat:number):ActorKey {return seat===1?(s.options.mode==='robot'?'robot':'p1'):s.options.mode==='versus'?'p2':('cpu-'+s.level)as ActorKey;}
export function canControl(s:GameState):boolean {return s.phase==='playing'||s.phase==='finished'&&s.options.mode!=='versus';}
const nowMs=(s:GameState)=>Math.floor(s.tick*1000/HZ);
export function createGame(round: number, playing: boolean,mode:GameMode='versus'): GameState {
  const players: [Player, Player] = [
    { ...controlState(), x: SPAWN1.x, y: SPAWN1.y, vy: 0, swing: 0, swingHit:false, servePose: 0, underhand: 0, lastJump: 0, lastHit: 0, facing: 1 },
    { ...controlState(), x: SPAWN2.x, y: SPAWN2.y, vy: 0, swing: 0, swingHit:false, servePose: 0, underhand: 0, lastJump: 0, lastHit: 0, facing: -1 }
  ];
  const point=servePoint(1,1);
  const state:GameState={ round, tick: 0, phase: playing ? "playing" : "waiting", rally: "serve", serve: 1,
    winner: 0, score: [0, 0], players, birdie: birdie(players[0].x+point.x,players[0].y+point.y),
    ack: [0, 0], inputs: [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }], pointTicks: 0, lastPoint: 0, resetAt:null, finishAt:null, lastResetAt:null,
    rng:round>>>0,servingSpot:0,chance1:null,particles:[],nextParticle:0,net:{frame:1,playing:false,hits:0,at:-1},hits:0,hitAt:-1,
    options:{mode},level:1,paused:false,cpu:mode==='versus'?null:cpuState(),robot:mode==='robot'?{phase:0,pointerX:SPAWN1.x+30,pointerY:SPAWN1.y-20}:null,actionAck:[0,0],scoreEvents:0,scoreAt:-1};
  if(mode==='robot'){players[0].x=pixel(players[0].x+30);players[0].y=pixel(players[0].y-20);const marker=servePoint(1,1,'robot');state.birdie=birdie(players[0].x+marker.x,players[0].y+marker.y);}
  state.servingSpot=Math.ceil(random(state)*3);return state;
}

export function cloneState(state: GameState): GameState { return JSON.parse(JSON.stringify(state)) as GameState; }

export function validInput(input: unknown): input is Input {
  if (!input || typeof input !== "object") return false;
  const item = input as Input;
  return Number.isSafeInteger(item.seq) && item.seq >= 0 && item.seq < 1e9 &&
    Number.isSafeInteger(item.jump) && item.jump >= 0 && item.jump < 1e9 &&
    Number.isSafeInteger(item.hit) && item.hit >= 0 && item.hit < 1e9 &&
    typeof item.left === "boolean" && typeof item.right === "boolean" &&
    [item.jumpHeld,item.hitHeld].every(v=>v===undefined||typeof v==='boolean') &&
    [item.pointerX,item.pointerY].every(v=>v===undefined||typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e4)&&
    [[item.cancelledJump,item.jump],[item.cancelledHit,item.hit]].every(([v,max])=>v===undefined||(Number.isSafeInteger(v)&&v>=0&&v<=max!));
}

export function validState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const s = value as GameState;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e15;
  return finite(s.round) && finite(s.tick) && ["waiting", "playing", "finished"].includes(s.phase) &&
    !!s.options&&MODES.some(m=>m.id===s.options.mode)&&Number.isInteger(s.level)&&s.level>=1&&s.level<=6&&typeof s.paused==='boolean'&&
    (s.options.mode==='versus'?s.cpu===null:!!s.cpu&&typeof s.cpu.serveReady==='boolean'&&Number.isSafeInteger(s.cpu.serveSinceMs)&&s.cpu.serveSinceMs>=0&&s.cpu.serveSinceMs<=nowMs(s)&&[5,-10,10].includes(s.cpu.numVar2)&&finite(s.cpu.chance3)&&s.cpu.chance3>=0&&s.cpu.chance3<=100&&[null,0,40].includes(s.cpu.swingVar)&&[null,0,20].includes(s.cpu.swingVar2))&&
    (s.options.mode==='robot'?!!s.robot&&[s.robot.phase,s.robot.pointerX,s.robot.pointerY].every(finite)&&s.robot.phase>=0&&Math.abs(s.robot.pointerX)<=1e4&&Math.abs(s.robot.pointerY)<=1e4:s.robot===null)&&Array.isArray(s.actionAck)&&s.actionAck.length===2&&s.actionAck.every(v=>Number.isSafeInteger(v)&&v>=0&&v<1e9)&&
    ["serve", "flight", "point"].includes(s.rally) && [0, 1, 2].includes(s.serve) &&
    [0, 1, 2].includes(s.winner) && [0, 1, 2].includes(s.lastPoint) && finite(s.pointTicks) &&
    [s.resetAt,s.finishAt].every(v=>v===null||(Number.isSafeInteger(v)&&v>s.tick)) &&
    (s.lastResetAt===null||(Number.isSafeInteger(s.lastResetAt)&&s.lastResetAt>=0&&s.lastResetAt<=s.tick)) &&
    Array.isArray(s.score) && s.score.length === 2 && s.score.every((n) => finite(n) && n >= 0 && n <= TARGET) &&
    Array.isArray(s.players) && s.players.length === 2 && s.players.every((p,i) => p && validControl(p,s.tick)&&(i===0||p.racket.frame<=15)&&[p.x, p.y, p.vy, p.lastJump, p.lastHit, p.facing].every(finite)) &&
    !!s.birdie && [s.birdie.x,s.birdie.y,s.birdie.vx,s.birdie.vy,s.birdie.rotation,s.birdie.speed].every(finite) &&
    [0,1,2].includes(s.birdie.lastHitter)&&[0,1,2].includes(s.birdie.contactBy)&&Number.isSafeInteger(s.birdie.born)&&s.birdie.born>=0&&s.birdie.born<=s.tick&&
    ['leftSide','rightSide','topSide','bottomSide'].every(k=>typeof s.birdie[k as keyof Birdie]==='boolean')&&
    !(s.birdie.leftSide&&s.birdie.rightSide)&&!(s.birdie.topSide&&s.birdie.bottomSide)&&
    Number.isInteger(s.rng)&&s.rng>=0&&s.rng<=0xffffffff&&Number.isInteger(s.servingSpot)&&s.servingSpot>=0&&s.servingSpot<=3&&
    (s.chance1===null||finite(s.chance1)&&s.chance1>=0&&s.chance1<100)&&
    !!s.net&&Number.isInteger(s.net.frame)&&s.net.frame>=1&&s.net.frame<=12&&typeof s.net.playing==='boolean'&&
    Number.isSafeInteger(s.net.hits)&&s.net.hits>=0&&Number.isInteger(s.net.at)&&s.net.at>=-1&&s.net.at<=s.tick&&
    Number.isSafeInteger(s.hits)&&s.hits>=0&&Number.isInteger(s.hitAt)&&s.hitAt>=-1&&s.hitAt<=s.tick&&
    Number.isSafeInteger(s.scoreEvents)&&s.scoreEvents>=0&&Number.isInteger(s.scoreAt)&&s.scoreAt>=-1&&s.scoreAt<=s.tick&&
    Number.isInteger(s.nextParticle)&&s.nextParticle>=0&&s.nextParticle<1000&&Array.isArray(s.particles)&&s.particles.length<=(s.robot?2000:1000)&&
    s.particles.every(p=>p&&(p.kind==='ball'||s.robot&&p.kind==='robot')&&Number.isInteger(p.id)&&p.id>=0&&p.id<1000&&Number.isInteger(p.born)&&p.born>=0&&p.born<=s.tick&&[p.x,p.y,p.vx,p.vy,p.rotation,p.spin,p.scale,p.shrink,p.width].every(finite)&&p.scale>0&&p.scale<=1&&p.shrink>=.85&&p.shrink<.95)&&new Set(s.particles.map(p=>p.kind+':'+p.id)).size===s.particles.length&&
    Array.isArray(s.ack) && s.ack.length === 2 && s.ack.every(finite) &&
    Array.isArray(s.inputs) && s.inputs.length === 2 && s.inputs.every(validInput);
}

function beginServe(state: GameState): void {
  if (state.lastPoint) state.serve = state.lastPoint;
  state.rally = "serve";
  // The original reset moves the server away from the net before the next serve.
  const server = state.players[state.serve - 1];
  if(state.serve===1||state.options.mode==='versus')server.x = pixel(state.serve === 1
    ? Math.min(server.x, NET_LIMIT_X - NET_LIMIT_HALF_WIDTH - 65)
    : Math.max(server.x, NET_LIMIT_X + NET_LIMIT_HALF_WIDTH + 65));
  const point=servePoint(state.serve,1,actorKey(state,state.serve));
  state.birdie=birdie(server.x+point.x,server.y+point.y,0,0,0,state.tick);
  state.servingSpot=Math.ceil(random(state)*3);
  if(state.cpu){state.cpu.serveReady=false;state.cpu.serveSinceMs=nowMs(state);state.cpu.chance3=100;}
  state.resetAt=null;state.pointTicks=0;state.lastResetAt=state.tick;
}

function award(state: GameState, player: 1 | 2): void {
  if (state.rally !== "flight") return;
  state.score[player - 1]++;
  state.scoreEvents++;state.scoreAt=state.tick;
  state.lastPoint = player;
  state.rally = "point";
  state.pointTicks = Math.round(HZ * 1.5);
  if (state.score[player - 1] >= TARGET) {
    if(player===1)state.finishAt=state.tick+state.pointTicks;
    else finish(state,2);
  } else state.resetAt=state.tick+state.pointTicks;
}

export function movePlayer(state: GameState, seat: 1 | 2, direction: number): void {
  if (!direction) return;
  const player = state.players[seat - 1];
  const towardNet = seat === 1 ? direction > 0 : direction < 0;
  if (towardNet) {
    const reach = state.serve === seat ? (seat === 1 ? 65 : -60) : 0;
    const testX = player.x + reach;
    if (player.y >= NET_LIMIT_TOP && player.y <= NET_LIMIT_BOTTOM &&
      testX >= NET_LIMIT_X - NET_LIMIT_HALF_WIDTH && testX <= NET_LIMIT_X + NET_LIMIT_HALF_WIDTH) return;
  }
  // Original transparent wall is a rotated 21px square. It tests the current
  // registration point before moving, allowing the native one-step overshoot.
  if (!towardNet&&(seat===1?shapeContains('leftWall',player.x,player.y):boundsContains('rightWall',player.x,player.y)))return;
  player.x=pixel(player.x+Math.sign(direction)*5.9);
  player.facing=direction>0?1:-1;
  if(!player.jumping)setMotion(player,towardNet?'walkforward':'walkbackward',state.tick);
}

export function moveControls(state:GameState,seat:1|2,left:boolean,right:boolean):void {
  // Both original callbacks test right before left, even with both keys held.
  if(right)movePlayer(state,seat,1);
  if(left)movePlayer(state,seat,-1);
}

export function consumeInput(state:GameState,seat:number,input:Input):void {
  const p=state.players[seat-1];if(!p)return;
  p.lastJump=Math.max(p.lastJump,input.jump);p.lastHit=Math.max(p.lastHit,input.hit);
}

function finish(state:GameState,winner:1|2):void {
  state.finishAt=null;state.pointTicks=0;state.winner=winner;state.phase='finished';
  state.players.forEach(p=>{if(!p.jumping)setMotion(p,'normal',state.tick);});
}

export function step(state: GameState, incoming: readonly Input[]): void {
  if (!canControl(state)) return;
  state.tick++;
  if(state.finishAt!==null&&state.tick>=state.finishAt){finish(state,1);if(state.options.mode==='versus')return;}
  if(state.resetAt!==null&&state.tick>=state.resetAt)beginServe(state);
  // Native clip actions precede onEnterFrame. Newly attached bird/particles
  // enter the callback list on the next frame; the bird runs before players.
  if(state.net.playing){
    if(state.net.frame===12){state.net.frame=1;state.net.playing=false;}
    else state.net.frame++;
  }
  advanceTrails(state);
  const order=state.options.mode!=='versus'&&state.level===1?[0,1]:[1,0];
  for(const i of order){
    const p=state.players[i];
    advanceRacket(p,()=>{
      if(state.rally!=='serve'||state.serve!==i+1)return;
      const point=servePoint(i+1,4,actorKey(state,i+1));state.rally='flight';
      state.birdie=birdie(p.x+point.x,p.y+point.y,i===0?30:-30,-30,i+1,state.tick);
      // Native service frame4 sets p1Hit/p2Hit after setupBirdie returns.
      state.birdie.contactBy=i+1;
      state.hits++;state.hitAt=state.tick;
      state.players.forEach(player=>player.racket.active=false);
    },()=>{state.serve=0;});
  }
  const bird=state.birdie;
  if(!state.paused&&(state.rally==='flight'||state.rally==='point')&&bird.born<state.tick){
    for(let i=0;i<2;i++){
      const p=state.players[i],r=p.racket;
      if(!r.active||r.consumed||bird.contactBy===i+1||!racketFrameContains(p,i+1,r.frame,bird.x,bird.y,actorKey(state,i+1)))continue;
      state.hits++;state.hitAt=state.tick;
      if(i===0)state.chance1=random(state)*100;
      const degrees=i===0?r.angle+122:-r.angle-302,radians=degrees/180*3.141593;
      bird.vx=-Math.cos(radians)*50;if(i===0)bird.vx*=1.04;bird.vy=-Math.sin(radians)*40;
      bird.lastHitter=i+1;bird.contactBy=i+1;r.consumed=true;r.active=false;
    }
    fly(bird,{
      random:()=>random(state),trail:(x,y)=>spawnTrail(state,x,y,()=>random(state)),
      net:()=>{state.net.playing=true;state.net.hits++;state.net.at=state.tick;},
      ground:()=>{if(state.rally==='flight')award(state,bird.x<NET_X?2:1);}
    });
  }
  // The original creation order dispatches P2's gun/hero before P1's. A
  // racket's direction is cached here for the next bird callback, even hidden.
  for(const i of order){
    const input=validInput(incoming[i])?incoming[i]:EMPTY_INPUT,player=state.players[i],current=state.inputs[i];
    if(input.seq>=current.seq){state.inputs[i]={...input};state.ack[i]=input.seq;}
    const held=state.inputs[i];
    player.racket.angle=racketFramePose(i+1,player.racket.frame,actorKey(state,i+1)).rotation+random(state)*5-2.5;
    if(i===1&&state.cpu){
      runCPU({tick:state.tick,nowMs:nowMs(state),level:state.level,paused:state.paused,pointOver:state.rally==='point',serve:state.serve,servingSpot:state.servingSpot,chance1:state.chance1,player,bird:state.rally==='serve'?null:{x:bird.x,y:bird.y,vx:bird.vx,direction:bird.rotation},cpu:state.cpu},()=>random(state));continue;
    }
    player.lastJump=Math.max(player.lastJump,held.cancelledJump||0);player.lastHit=Math.max(player.lastHit,held.cancelledHit||0);
    const jump=held.jumpHeld||held.jump>player.lastJump,hit=held.hitHeld||held.hit>player.lastHit;
    player.lastJump=Math.max(player.lastJump,held.jump);player.lastHit=Math.max(player.lastHit,held.hit);
    if(i===0&&state.robot){
      if(held.pointerX!==undefined)state.robot.pointerX=pixel(held.pointerX);if(held.pointerY!==undefined)state.robot.pointerY=pixel(held.pointerY);
      runRobot({tick:state.tick,started:true,paused:state.paused,over:state.phase==='finished',serve:state.serve,player,robot:state.robot,pointer:{x:state.robot.pointerX,y:state.robot.pointerY},hit,jump},(x,y)=>spawnRobotTrail(state,x,y,()=>random(state)));continue;
    }
    player.vy++;player.y=pixel(player.y+player.vy);
    if(player.y>=GROUND){player.y=GROUND;player.jumping=false;}
    if(state.paused)continue;
    if(hit&&!player.racket.active&&player.racket.ready)startRacket(player,state.serve===i+1,state.tick,i===0&&state.options.mode==='human'&&state.rally!=='serve'&&bird.y>player.y-40);
    if(jump&&!player.jumping&&state.serve!==i+1){player.jumping=true;player.jumps++;setMotion(player,'walkup',state.tick);player.vy=-12;}
    moveControls(state,(i+1)as 1|2,held.left,held.right);
    if(!held.left&&!held.right&&!jump&&!player.jumping)setMotion(player,'normal',state.tick);
  }
  if(state.rally==='serve'){
    const p=state.players[state.serve-1],point=servePoint(state.serve,p.racket.serveFrame,actorKey(state,state.serve));
    bird.x=pixel(p.x+point.x);bird.y=pixel(p.y+point.y);
  }

  state.pointTicks=Math.max(0,(state.resetAt??state.finishAt??state.tick)-state.tick);
  state.players.forEach(syncControl);
}

export type Action='pause'|'next'|'retry';
export function action(state:GameState,seat:number,seq:number,kind:unknown):boolean {
  if(!Number.isInteger(seat)||seat<1||seat>2||!Number.isSafeInteger(seq)||seq<=state.actionAck[seat-1]||seq>=1e9)return false;
  if(kind==='pause'){
    if(state.phase!=='playing'||state.options.mode!=='versus'&&seat!==1)return false;
    state.paused=!state.paused;state.actionAck[seat-1]=seq;return true;
  }
  if(seat!==1||state.options.mode==='versus'||state.phase!=='finished'||(kind!=='next'&&kind!=='retry'))return false;
  if(kind==='next'&&(state.winner!==1||state.level===6)||kind==='retry'&&state.winner!==2)return false;
  if(kind==='next'){
    state.level++;const old=state.players[1],vars=state.cpu!;
    state.players[1]={...old,...controlState(),x:SPAWN2.x,y:SPAWN2.y,vy:0,lastJump:0,lastHit:0,motionAt:state.tick,facing:-1};
    state.cpu={...cpuState(nowMs(state)),swingVar:vars.swingVar,swingVar2:vars.swingVar2};
  }
  state.actionAck[seat-1]=seq;state.paused=false;state.phase='playing';state.winner=0;state.score=[0,0];state.lastPoint=1;state.resetAt=state.finishAt=null;beginServe(state);state.players.forEach(syncControl);return true;
}

export function reconcile(snapshot: GameState, seat: number, pending: Input[]): { state: GameState; pending: Input[] } {
  const next = cloneState(snapshot);
  const remaining = pending.filter((input) => input.seq > snapshot.ack[seat - 1]).slice(-HZ * 2);
  if(snapshot.paused||snapshot.options.mode==='robot'||snapshot.options.mode!=='versus'&&seat!==1)return {state:next,pending:remaining};
  const player=next.players[seat-1],{motion,motionAt,facing}=player;
  // Prediction replays local movement only; scoring and ball physics stay authoritative.
  for (const input of remaining) {
    moveControls(next,seat as 1|2,input.left,input.right);
  }
  Object.assign(player,{motion,motionAt,facing});
  return { state: next, pending: remaining };
}

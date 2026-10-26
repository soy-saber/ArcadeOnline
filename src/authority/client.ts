import { applyUpdate, State, Update } from "./protocol";
import type { RecordRow } from "./engine";

export interface Member { id: string; name: string; seat: number | null; ready: boolean }
export interface AuthorityRoom {
  t: "state"; gameId: string; room: string; hostId: null; controllerId: string | null;
  seats: Record<number, string | null>; members: Member[];
  auth?: { phase: State["phase"]; round: number; nextRoundAt: number | null; options?: { map?: string; loadout?: string; gameMode?: string;difficulty?:string;speed?:number;devils?:boolean;collisions?:boolean;damage?:boolean;deathLimit?:number }; records?: RecordRow[]; mapRotation?: { every:number; completed:number } };
}

// The transport applies and acknowledges snapshots immediately. Rendering only
// reads the most recent applied state, so queued TCP updates never cause replay.
export class AuthorityClient {
  id = "";
  connected = false;
  authority: State | null = null;
  room: AuthorityRoom;
  rtt = 0;
  sentBytes = 0;
  receivedBytes = 0;
  fullUpdates = 0;
  deltaUpdates = 0;
  resyncs = 0;
  lastSnapshotAt = 0;
  lastServerTime = 0;
  transport = "server";
  onRoom: (room: AuthorityRoom) => void = () => {};
  onSnapshot: (state: State, serverTime: number, receivedAt: number) => void = () => {};
  onStatus: (message: string) => void = () => {};
  private ws: WebSocket | null = null;
  private stopped = false;
  private heartbeat = 0;
  private lastResyncAt = -Infinity;
  private clockAt = 0;
  private clockServerTime = 0;

  constructor(private name: string, private session: string, private roomName: string, private gameId: string) {
    this.room = { t: "state", gameId, room: roomName, hostId: null, controllerId: null,
      seats: { 1: null, 2: null, 3: null, 4: null }, members: [] };
  }
  get seat(): number | null { return this.room.members.find((member) => member.id === this.id)?.seat ?? null; }
  get isController(): boolean { return !!this.id && this.room.controllerId === this.id; }
  get isHost(): boolean { return false; }
  get snapshotAge(): number { return this.lastSnapshotAt ? performance.now() - this.lastSnapshotAt : Infinity; }
  serverNow(at = performance.now()): number {
    return this.clockServerTime ? this.clockServerTime + Math.max(0, at - this.clockAt) : Date.now();
  }
  start(): void {
    this.connect();
    this.heartbeat = window.setInterval(() => {
      if (this.connected) this.control({ t: "authPing", at: performance.now() });
    }, 1000);
  }
  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.authority = null;
      this.control({ t: "join", gameId: this.gameId, room: this.roomName, name: this.name, session: this.session, rtcCapable: false });
      this.onStatus("已连接，正在同步房间");
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws || typeof event.data !== "string") return;
      this.receivedBytes += event.data.length;
      try {
        const message = JSON.parse(event.data);
        if (message.t === "welcome") this.id = message.id;
        else if (message.t === "state") { this.room = message; this.onRoom(this.room); }
        else if (message.t === "auth") this.receive(message as Update);
        else if (message.t === "authPong" && Number.isFinite(message.at) && Number.isFinite(message.serverTime)) {
          const now = performance.now(), rtt = now - message.at;
          if (rtt >= 0 && rtt < 10000) {
            this.rtt = rtt;
            // A pong queued during a browser freeze is not a clock sample.
            if (rtt <= 250) { this.clockServerTime = message.serverTime + rtt / 2; this.clockAt = now; }
          }
        } else if (message.t === "err") this.onStatus(String(message.msg || "房间请求未完成"));
      } catch { this.requestFull(); }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.connected = false; this.onStatus("连接中断，正在重连");
      if (!this.stopped) window.setTimeout(() => this.connect(), 1000);
    };
    ws.onerror = () => {};
  }
  private receive(message: Update): void {
    const next = applyUpdate(this.authority, message);
    if (!next) { this.requestFull(); return; }
    const now = performance.now();
    // A frozen/background page must discard its old presentation before it
    // accepts a delta; ask for the server's current full state immediately.
    const longGap = !!this.lastSnapshotAt && now - this.lastSnapshotAt > 350;
    this.authority = next; this.lastSnapshotAt = now; this.lastServerTime = message.serverTime;
    if (!this.clockServerTime || this.serverNow(now) < message.serverTime) {
      this.clockServerTime = message.serverTime; this.clockAt = now;
    }
    if (message.kind === "full") this.fullUpdates++; else this.deltaUpdates++;
    this.control({ t: "authAck", round: message.round, tick: message.tick, hash: message.hash });
    this.onSnapshot(next, message.serverTime, now);
    if (longGap && message.kind !== "full" || this.serverNow(now) - message.serverTime > 350) this.requestFull();
  }
  control(message: object): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN || this.ws.bufferedAmount > 64 * 1024) return false;
    const value = JSON.stringify(message); this.ws.send(value); this.sentBytes += value.length; return true;
  }
  requestFull(): void {
    const now = performance.now();
    if (now - this.lastResyncAt < 250) return;
    if (this.control({ t: "authResync" })) { this.resyncs++; this.lastResyncAt = now; }
  }
  close(): void { this.stopped = true; window.clearInterval(this.heartbeat); this.ws?.close(); }
}

export interface Member { id: string; name: string; seat: number | null }
export interface RoomState { t: "state"; gameId: string; room: string; hostId: string | null; seats: Record<number, string | null>; members: Member[] }
export type Packet = Record<string, unknown> & { type: string };
interface Peer { pc: RTCPeerConnection; channel: RTCDataChannel | null; candidates: RTCIceCandidateInit[] }

// Unreliable, unordered messages carry replaceable full input/state, with
// sequence numbers interpreted by the game. WS only relays when RTC is unavailable.
export class Network {
  id = "";
  connected = false;
  room: RoomState = { t: "state", gameId: "3881-native", room: "", hostId: null, seats: { 1: null, 2: null }, members: [] };
  rtt = new Map<string, number>();
  lastTransport = new Map<string, string>();
  sentBytes = 0;
  receivedBytes = 0;
  delayMs = 0;
  lossRate = 0;
  forceRelay = false;
  onRoom: (room: RoomState) => void = () => {};
  onPacket: (from: string, packet: Packet) => void = () => {};
  onStatus: (text: string) => void = () => {};
  private ws: WebSocket | null = null;
  private peers = new Map<string, Peer>();
  private early = new Map<string, RTCIceCandidateInit[]>();
  private nextAttempt = new Map<string, number>();
  private iceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  private stopped = false;
  private nextIceRefresh = 0;
  private interval: number;

  constructor(private name: string, private session: string, private roomName: string, private gameId = "3881-native", private turnOnly = false) {
    this.room.gameId = gameId;
    this.interval = window.setInterval(() => {
      if (!this.connected) return;
      if (performance.now() >= this.nextIceRefresh) void this.refreshIce();
      this.syncPeers();
      for (const member of this.room.members) if (member.id !== this.id && (this.isHost || member.id === this.room.hostId)) {
        this.send(member.id, { type: "ping", at: performance.now() });
      }
    }, 1000);
  }

  get isHost(): boolean { return this.id !== "" && this.room.hostId === this.id; }
  get seat(): number | null { return this.room.members.find((member) => member.id === this.id)?.seat ?? null; }

  async start(): Promise<void> {
    await this.refreshIce();
    this.connect();
  }

  private async refreshIce(): Promise<void> {
    this.nextIceRefresh = performance.now() + 60000;
    try {
      const response = await fetch("/rtc-config", { signal: AbortSignal.timeout(2500) });
      const config = await response.json();
      if (Array.isArray(config.iceServers)) {
        this.iceServers = config.iceServers;
        this.nextIceRefresh = performance.now() + 20 * 60 * 1000;
        for (const peer of this.peers.values()) peer.pc.setConfiguration({ iceServers: this.iceServers, iceTransportPolicy: this.turnOnly ? "relay" : "all" });
      }
    } catch { /* STUN plus WS relay remains available. */ }
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.control({ t: "join", gameId: this.gameId, room: this.roomName, name: this.name, session: this.session, rtcCapable: true });
      this.onStatus("已连接");
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data);
        if (message.t === "welcome") this.id = message.id;
        if (message.t === "state") {
          const previousHost = this.room.hostId;
          this.room = message;
          if (previousHost !== message.hostId) this.closePeers();
          this.onRoom(message);
          this.syncPeers();
        }
        if (message.t === "signal") void this.signal(message.from, message.kind, message.data);
        if (message.t === "native") this.receive(message.from, message.data, "relay");
        if (message.t === "err") this.onStatus(message.msg);
      } catch { /* Ignore malformed messages without stopping input/rendering. */ }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.connected = false;
      this.closePeers();
      this.onStatus("连接中断，正在重连");
      if (!this.stopped) window.setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => {};
  }

  control(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  transport(to: string): string {
    if (!this.forceRelay && this.peers.get(to)?.channel?.readyState === "open") return "p2p";
    return "relay";
  }

  send(to: string, packet: Packet): void {
    if (!this.connected || to === this.id) return;
    if (this.lossRate > 0 && Math.random() < this.lossRate) return;
    const text = JSON.stringify(packet);
    const transmit = () => {
      if (!this.connected || !this.room.members.some((member) => member.id === to)) return;
      const channel = this.peers.get(to)?.channel;
      try {
        if (!this.forceRelay && channel?.readyState === "open" && channel.bufferedAmount < 64 * 1024) {
          channel.send(text);
          this.sentBytes += text.length;
        } else if ((!channel || channel.readyState !== "open" || this.forceRelay) && (this.ws?.bufferedAmount || 0) < 128 * 1024) {
          this.control({ t: "native", to, data: JSON.parse(text) });
          this.sentBytes += text.length;
        }
        // Congested RTC replaces old state with the next packet; do not queue it on TCP.
      } catch { /* A reconnect will resend current input/state. */ }
    };
    if (this.delayMs > 0) window.setTimeout(transmit, this.delayMs);
    else transmit();
  }

  private receive(from: string, packet: Packet, transport: string): void {
    if (!packet || typeof packet.type !== "string" || !this.room.members.some((member) => member.id === from)) return;
    if (!this.isHost && from !== this.room.hostId) return;
    this.receivedBytes += JSON.stringify(packet).length;
    this.lastTransport.set(from, transport);
    if (packet.type === "ping" && typeof packet.at === "number") {
      this.send(from, { type: "pong", at: packet.at });
    } else if (packet.type === "pong" && typeof packet.at === "number") {
      const elapsed = performance.now() - packet.at;
      if (elapsed >= 0 && elapsed < 10000) this.rtt.set(from, elapsed);
    } else this.onPacket(from, packet);
  }

  private syncPeers(): void {
    const wanted = new Set(this.room.members.filter((member) => member.id !== this.id &&
      (this.isHost || member.id === this.room.hostId)).map((member) => member.id));
    for (const id of this.peers.keys()) if (!wanted.has(id)) this.closePeer(id);
    if (!this.isHost || typeof RTCPeerConnection !== "function") return;
    for (const id of wanted) if (!this.peers.has(id) && performance.now() >= (this.nextAttempt.get(id) || 0)) {
      const peer = this.createPeer(id);
      if (!peer) continue;
      this.bindChannel(id, peer, peer.pc.createDataChannel("arcade-native-v1", { ordered: false, maxRetransmits: 0 }));
      void peer.pc.createOffer().then((offer) => peer.pc.setLocalDescription(offer)).then(() => {
        if (this.peers.get(id) === peer) this.control({ t: "signal", to: id, kind: "offer", data: peer.pc.localDescription });
      }).catch(() => this.closePeer(id));
    }
  }

  private createPeer(id: string): Peer | null {
    try {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: this.turnOnly ? "relay" : "all" });
      const peer: Peer = { pc, channel: null, candidates: this.early.get(id) || [] };
      this.early.delete(id);
      this.peers.set(id, peer);
      pc.onicecandidate = (event) => {
        if (event.candidate) this.control({ t: "signal", to: id, kind: "ice", data: event.candidate.toJSON() });
      };
      pc.ondatachannel = (event) => this.bindChannel(id, peer, event.channel);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") this.closePeer(id);
        if (pc.connectionState === "disconnected") window.setTimeout(() => {
          if (this.peers.get(id) === peer && pc.connectionState === "disconnected") this.closePeer(id);
        }, 2500);
      };
      // A stalled negotiation also needs retrying, not only an ICE failure.
      window.setTimeout(() => {
        if (this.peers.get(id) === peer && peer.channel?.readyState !== "open") this.closePeer(id);
      }, 12000);
      return peer;
    } catch { this.nextAttempt.set(id, performance.now() + 5000); return null; }
  }

  private bindChannel(id: string, peer: Peer, channel: RTCDataChannel): void {
    if (channel.label !== "arcade-native-v1") { channel.close(); return; }
    peer.channel = channel;
    channel.onmessage = (event) => {
      if (this.peers.get(id) !== peer || typeof event.data !== "string" || event.data.length > 64 * 1024) return;
      try { this.receive(id, JSON.parse(event.data), "p2p"); } catch { /* Bad peer payload. */ }
    };
    channel.onclose = () => { if (this.peers.get(id) === peer) this.closePeer(id); };
    channel.onerror = () => {};
  }

  private async signal(from: string, kind: string, data: RTCSessionDescriptionInit & RTCIceCandidateInit): Promise<void> {
    if (!this.room.members.some((member) => member.id === from)) return;
    if (!this.isHost && from !== this.room.hostId) return;
    try {
      let peer = this.peers.get(from);
      if (kind === "offer" && !this.isHost) {
        this.closePeer(from);
        peer = this.createPeer(from) || undefined;
        if (!peer) return;
        await peer.pc.setRemoteDescription(data);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        this.control({ t: "signal", to: from, kind: "answer", data: peer.pc.localDescription });
      } else if (kind === "answer" && this.isHost && peer) await peer.pc.setRemoteDescription(data);
      else if (kind === "ice") {
        if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(data);
        else if (peer) peer.candidates.push(data);
        else {
          const pending = this.early.get(from) || [];
          if (pending.length < 64) pending.push(data);
          this.early.set(from, pending);
        }
      }
      if (peer?.pc.remoteDescription) for (const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
    } catch { this.closePeer(from); }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    this.peers.delete(id);
    this.nextAttempt.set(id, performance.now() + 1500);
    if (peer) { peer.pc.onconnectionstatechange = null; if (peer.channel) peer.channel.onclose = null; peer.pc.close(); }
  }
  private closePeers(): void {
    for (const id of this.peers.keys()) this.closePeer(id);
    this.early.clear(); this.rtt.clear(); this.lastTransport.clear();
  }
  stop(leave = true): void {
    this.stopped = true;
    if (leave) this.control({ t: "leave" });
    window.clearInterval(this.interval); this.closePeers(); this.ws?.close();
  }
}

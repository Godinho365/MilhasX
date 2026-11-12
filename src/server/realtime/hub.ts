// Chat Balcões em tempo real: o lado do site. Cada aba aberta do Chat Balcões mantém um WebSocket (/ws); o hub
// assina no Redis o canal do usuário (tg:user:<id>) enquanto ele tiver alguma aba aberta e repassa cada evento a
// todas as abas dele. O evento só diz o que mudou (chat, número da mensagem); a aba busca a mensagem no banco.
// Também: batimento (derruba conexão morta), relógio (a aba acerta a diferença de hora para medir a latência) e as
// amostras de latência que as abas mandam (P50/P95 no log).
import type { WebSocket } from "ws";
import { prisma, log } from "../db";

/** Assinante do Redis (ioredis em modo subscribe) ou um simulado nos testes. */
export interface Subscriber {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: "message", fn: (channel: string, message: string) => void): unknown;
}
/** Status de cada conta do Telegram que o gateway deixa no Redis (tg:status:<conta>). */
export type StatusReader = (linkIds: string[]) => Promise<Record<string, { state: string } | null>>;

const CHANNEL = (userId: string) => `tg:user:${userId}`;
const HEARTBEAT_MS = 25_000;
const LAT_WINDOW = 1000;

type Client = { ws: WebSocket; userId: string; alive: boolean };

export class RealtimeHub {
  private byUser = new Map<string, Set<Client>>();
  private samples: { net: number; visible: number }[] = [];
  private sinceLog = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(private sub: Subscriber, private statuses: StatusReader, heartbeatMs = HEARTBEAT_MS) {
    sub.on("message", (channel, message) => this.relay(channel, message));
    this.timer = setInterval(() => this.heartbeat(), heartbeatMs);
    this.timer.unref?.();
  }

  /** Aba conectada (usuário já autenticado pela sessão). */
  async attach(ws: WebSocket, userId: string) {
    const c: Client = { ws, userId, alive: true };
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
      await this.sub.subscribe(CHANNEL(userId));
    }
    set.add(c);
    ws.on("pong", () => { c.alive = true; });
    ws.on("message", (raw) => this.fromClient(c, raw.toString()));
    ws.on("close", () => void this.detach(c));
    ws.on("error", () => ws.terminate());
    // o último evento (a aba pede "desde aqui" quando reconectar) e como estão as contas do Telegram
    const [last, links] = await Promise.all([
      prisma.telegramEvent.findFirst({ where: { userId }, orderBy: { id: "desc" }, select: { id: true } }),
      prisma.telegramLink.findMany({ where: { userId, status: "ACTIVE" }, select: { id: true } }),
    ]);
    const st = await this.statuses(links.map((l) => l.id)).catch(() => ({}) as Record<string, null>);
    this.send(c, { type: "hello", lastEventId: last?.id.toString() ?? "0", server: Date.now(), links: Object.fromEntries(links.map((l) => [l.id, st[l.id]?.state ?? "unknown"])) });
  }

  private async detach(c: Client) {
    const set = this.byUser.get(c.userId);
    if (!set) return;
    set.delete(c);
    if (!set.size) {
      this.byUser.delete(c.userId);
      await this.sub.unsubscribe(CHANNEL(c.userId)).catch(() => {});
    }
  }

  private send(c: Client, payload: unknown) {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(payload));
  }

  /** Evento do gateway: para todas as abas do usuário, com a hora em que saiu daqui (para medir cada trecho). */
  private relay(channel: string, message: string) {
    const userId = channel.startsWith("tg:user:") ? channel.slice(8) : null;
    const set = userId ? this.byUser.get(userId) : undefined;
    if (!set?.size) return;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(message);
    } catch {
      return;
    }
    const out = JSON.stringify({ ...ev, relayAt: Date.now() });
    for (const c of set) if (c.ws.readyState === 1) c.ws.send(out);
  }

  /** Da aba: acerto do relógio (ping/pong) e amostras de latência (do gateway até a mensagem aparecer na tela). */
  private fromClient(c: Client, raw: string) {
    if (raw.length > 1000) return;
    let m: { type?: string; t?: number; net?: number; visible?: number };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.type === "ping" && typeof m.t === "number") this.send(c, { type: "pong", t: m.t, server: Date.now() });
    else if (m.type === "lat" && Number.isFinite(m.net) && Number.isFinite(m.visible) && m.visible! >= 0 && m.visible! < 120_000) this.sample(Math.max(0, m.net!), m.visible!);
  }

  sample(net: number, visible: number) {
    this.samples.push({ net, visible });
    if (this.samples.length > LAT_WINDOW) this.samples.shift();
    if (++this.sinceLog >= 20) {
      this.sinceLog = 0;
      log("info", "rt.latency", this.stats());
    }
  }

  /** P50/P95/P99 das últimas amostras: net = gateway → aba; visible = gateway → mensagem na tela. */
  stats() {
    const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : null);
    const net = this.samples.map((s) => s.net).sort((a, b) => a - b);
    const vis = this.samples.map((s) => s.visible).sort((a, b) => a - b);
    return { n: this.samples.length, netP50: pct(net, 0.5), netP95: pct(net, 0.95), visibleP50: pct(vis, 0.5), visibleP95: pct(vis, 0.95), visibleP99: pct(vis, 0.99), visibleMax: vis.at(-1) ?? null };
  }

  /** Conexão que não respondeu ao último ping cai (a aba reconecta sozinha); as vivas recebem um aviso de vida. */
  private heartbeat() {
    for (const set of this.byUser.values())
      for (const c of set) {
        if (!c.alive) { c.ws.terminate(); continue; }
        c.alive = false;
        c.ws.ping();
        this.send(c, { type: "hb", server: Date.now() });
      }
  }

  connections() {
    let n = 0;
    for (const s of this.byUser.values()) n += s.size;
    return { users: this.byUser.size, tabs: n };
  }

  close() {
    clearInterval(this.timer);
    for (const set of this.byUser.values()) for (const c of set) c.ws.close(1001, "servidor reiniciando");
    this.byUser.clear();
  }
}

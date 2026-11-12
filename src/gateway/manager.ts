// Gateway do Chat Balcões: mantém uma conexão permanente por conta do Telegram conectada no app, grava o que chega
// (store.ts) e atende os pedidos do site (rpc). Só o líder conecta: a trava no Redis garante uma conexão por sessão
// mesmo se subirem dois gateways (duas conexões com a mesma sessão derrubam as duas).
//
// Cada conta tem uma fila: eventos e recuperação passam por ela, um de cada vez, então uma edição nunca é gravada
// antes da mensagem nova a que ela se refere. A recuperação roda ao conectar, depois de cada reconexão e a cada
// 10 minutos (rede de segurança: os eventos são o caminho principal).
import { randomUUID } from "node:crypto";
import { prisma, log, DomainError } from "@/server/db";
import { decrypt } from "@/server/services/accounts";
import { SESSION_ENDED, type TgClient, type TgMessage, type TgPeer } from "@/server/services/telegram";
import { RPC_METHODS, type RpcMethod } from "@/server/telegram-rpc";
import { userChannel, type Bus } from "./bus";
import { peerKey, type LiveClient, type LiveEvent, type LiveFactory, type LiveMessage } from "./live";
import { Router, catchUpChat, ingestDelete, ingestMessage, prune, type ChatTarget } from "./store";

export type LinkState = "starting" | "connected" | "backoff" | "revoked" | "stopped";
export type LinkStatus = { state: LinkState; since: string; lastEventAt: string | null; lastCatchupAt: string | null; reconnects: number; error: string | null };

/** Esperas entre tentativas de reconectar (a última se repete). */
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
export type Timings = { leaderTtlMs: number; leaderEveryMs: number; refreshEveryMs: number; pingEveryMs: number; pingTimeoutMs: number; catchupEveryMs: number; statusEveryMs: number; pruneEveryMs: number; startTimeoutMs: number; backoffMs: number[]; channelMinMs: number; channelMaxMs: number; channelPushedMs: number; channelStatsEveryMs: number };
export const DEFAULT_TIMINGS: Timings = {
  leaderTtlMs: 30_000, leaderEveryMs: 10_000, refreshEveryMs: 15_000, pingEveryMs: 60_000, pingTimeoutMs: 20_000,
  catchupEveryMs: 10 * 60_000, statusEveryMs: 30_000, pruneEveryMs: 3600_000, startTimeoutMs: 45_000, backoffMs: BACKOFF_MS,
  // diferença de supergrupo: entre 1 e 2 s quando o Telegram não está empurrando os eventos do chat; 15 s (só rede de
  // segurança) quando está. TG_CHANNEL_MIN_MS ajusta o mínimo.
  channelMinMs: Number(process.env.TG_CHANNEL_MIN_MS) || 1000, channelMaxMs: 2000, channelPushedMs: 15_000, channelStatsEveryMs: 5 * 60_000,
};
/** Sem evento empurrado de um supergrupo há este tempo: o Telegram não está empurrando; a diferença acelera. */
const PUSH_FRESH_MS = 60_000;

/** Um supergrupo acompanhado pela diferença de canal: o contador, quando chegou o último evento empurrado e os números
 *  do período (para o log). */
type ChannelSync = { chat: ChatTarget; pts: number | null; lastPushAt: number; minMs: number; timer?: ReturnType<typeof setTimeout>; stats: { calls: number; viaDiff: number; viaPush: number; floods: number; lastTimeout: number | null } };

const errMsg = (e: unknown) => (e && typeof e === "object" && "errorMessage" in e ? String((e as { errorMessage: unknown }).errorMessage) : e instanceof Error ? e.message : String(e));
const withTimeout = <T>(p: Promise<T>, ms: number, what: string) => {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: sem resposta em ${ms / 1000}s`)), ms); })]).finally(() => clearTimeout(t));
};
/** Chats acompanhados na recuperação: os grupos e as conversas no privado abertas ou com contraproposta recente. */
const DM_CATCHUP_DAYS = 3;

/** Uma conta conectada: a conexão, a fila e o estado. */
class LinkRunner {
  live: LiveClient | null = null;
  status: LinkStatus = { state: "starting", since: new Date().toISOString(), lastEventAt: null, lastCatchupAt: null, reconnects: 0, error: null };
  private queue: Promise<unknown> = Promise.resolve();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private attempt = 0;
  private gen = 0; // cada (re)conexão tem um número: timers e eventos da anterior são ignorados
  ready: Promise<void>;
  private resolveReady!: () => void;
  private channels = new Map<string, ChannelSync>();
  private initialDone = false; // a recuperação inicial desta conexão terminou (antes disso não confere grupos)
  private syncing: Promise<void> | null = null;

  constructor(private gw: Gateway, readonly linkId: string, readonly userId: string, readonly sessionEnc: string) {
    this.ready = new Promise((r) => { this.resolveReady = r; });
  }

  private setState(state: LinkState, error: string | null = null) {
    if (this.status.state !== state || this.status.error !== error) {
      this.status = { ...this.status, state, error, since: new Date().toISOString() };
      log(state === "connected" ? "info" : "warn", "tg.link", { linkId: this.linkId, state, error });
      this.gw.reportStatus(this, true);
    }
  }
  /** Coloca na fila da conta (um de cada vez); erro de um não trava os outros. */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }
  private every(ms: number, fn: () => void) {
    const t = setInterval(fn, ms);
    t.unref?.();
    this.timers.push(t as unknown as ReturnType<typeof setTimeout>);
  }

  async start() {
    const gen = ++this.gen;
    this.setState("starting");
    const t = this.gw.timings;
    try {
      const live = this.gw.factory(decrypt(this.sessionEnc));
      this.live = live;
      await withTimeout(live.start((e) => { if (gen === this.gen) void this.enqueue(() => this.onEvent(e)); }), t.startTimeoutMs, "conectar");
      if (gen !== this.gen) return;
      this.attempt = 0;
      this.setState("connected");
      this.resolveReady();
      this.every(t.pingEveryMs, () => void this.watchdog(gen));
      this.every(t.catchupEveryMs, () => void this.catchUp(gen));
      this.every(t.channelStatsEveryMs, () => this.logChannelStats());
      this.initialDone = false;
      void this.catchUp(gen).then(() => { this.initialDone = true; return this.syncChannels(gen); });
    } catch (e) {
      if (gen === this.gen) await this.fail(e);
    }
  }

  private async watchdog(gen: number) {
    if (gen !== this.gen || this.status.state !== "connected" || !this.live) return;
    try {
      await withTimeout(this.live.ping(), this.gw.timings.pingTimeoutMs, "ping");
    } catch (e) {
      if (gen === this.gen) await this.fail(e);
    }
  }

  /** Caiu: sessão encerrada não volta (até mudar a sessão); o resto tenta de novo com espera crescente. */
  async fail(e: unknown) {
    const msg = errMsg(e);
    await this.teardown();
    if (SESSION_ENDED.includes(msg)) return this.setState("revoked", msg);
    const waits = this.gw.timings.backoffMs;
    const wait = msg === "AUTH_KEY_DUPLICATED" ? Math.max(60_000, waits[0]!) : waits[Math.min(this.attempt, waits.length - 1)]!;
    this.attempt++;
    this.status.reconnects++;
    this.setState("backoff", msg);
    const gen = this.gen;
    const t = setTimeout(() => { if (gen === this.gen && this.status.state === "backoff") void this.start(); }, wait);
    t.unref?.();
    this.timers.push(t);
  }

  private async teardown() {
    this.gen++;
    for (const ch of this.channels.values()) clearTimeout(ch.timer);
    this.channels.clear();
    for (const t of this.timers.splice(0)) clearTimeout(t); // no Node serve para setTimeout e setInterval
    const live = this.live;
    this.live = null;
    if (live) await live.stop().catch(() => {});
  }

  async stop(state: LinkState = "stopped") {
    await this.teardown();
    this.setState(state);
  }

  private async onEvent(e: LiveEvent) {
    this.status.lastEventAt = new Date().toISOString();
    if (e.kind === "delete") return void (await ingestDelete(this.gw.bus, this.gw.router, this.linkId, e.peerId, e.ids, e.receivedAt));
    const chat = await this.gw.router.route(this.linkId, e.peerId);
    if (!chat) return; // chat que o app não acompanha
    const ch = this.channels.get(chat.id);
    if (ch) { ch.lastPushAt = Date.now(); ch.stats.viaPush++; } // o Telegram está empurrando este supergrupo
    if (e.kind === "read") {
      // checks de leitura: só avisa (a tela pergunta de novo ao abrir a conversa)
      if (chat.kind === "DM") await this.gw.bus.publish(userChannel(chat.userId), { type: "dm.read", chatKind: "DM", chatId: chat.id, maxId: e.maxId, receivedAt: e.receivedAt }).catch(() => {});
      return;
    }
    await ingestMessage(this.gw.bus, chat, e.message, e.kind, e.receivedAt);
  }

  /** Recuperação de todos os chats da conta, cada um como um item da fila (eventos novos passam no meio). */
  async catchUp(gen = this.gen) {
    if (gen !== this.gen || !this.live) return;
    const { groups, dms } = await this.gw.router.chats(this.linkId);
    const since = new Date(Date.now() - DM_CATCHUP_DAYS * 86_400_000);
    const watched = new Set((await prisma.telegramDm.findMany({ where: { linkId: this.linkId, OR: [{ closed: false }, { offerAt: { gte: since } }] }, select: { id: true } })).map((d) => d.id));
    let created = 0, updated = 0, deleted = 0;
    for (const chat of [...groups, ...dms.filter((d) => watched.has(d.id))]) {
      if (gen !== this.gen || !this.live) return;
      const live = this.live;
      try {
        const r = await this.enqueue(() => catchUpChat(this.gw.bus, live, chat));
        created += r.created; updated += r.updated; deleted += r.deleted;
      } catch (e) {
        log("warn", "tg.catchup_failed", { linkId: this.linkId, chatKind: chat.kind, error: errMsg(e) });
        if (SESSION_ENDED.includes(errMsg(e))) return void (await this.fail(e));
      }
    }
    this.status.lastCatchupAt = new Date().toISOString();
    log("info", "tg.catchup", { linkId: this.linkId, chats: groups.length + watched.size, created, updated, deleted });
    this.gw.reportStatus(this);
    if (this.initialDone) void this.syncChannels(gen); // grupo novo no app desde a última vez
  }

  /* ---------- Diferença de supergrupo (o Telegram não empurra tudo de grupo grande) ---------- */

  /** Começa a acompanhar cada supergrupo da conta que ainda não está sendo acompanhado (e larga os que saíram). Uma
   *  conferência por vez, e só depois da recuperação inicial (senão relê à toa um grupo que ela já pôs em dia). */
  async syncChannels(gen = this.gen): Promise<void> {
    if (!this.initialDone) return;
    if (this.syncing) return this.syncing;
    this.syncing = this.doSyncChannels(gen).finally(() => { this.syncing = null; });
    return this.syncing;
  }
  private async doSyncChannels(gen: number) {
    if (gen !== this.gen || !this.live?.channelDiff || !this.live.channelPts) return;
    const { groups } = await this.gw.router.chats(this.linkId);
    const ids = new Set(groups.map((g) => g.id));
    for (const [id, ch] of this.channels) if (!ids.has(id)) { clearTimeout(ch.timer); this.channels.delete(id); }
    for (const chat of groups) {
      if (chat.peer.kind !== "channel" || this.channels.has(chat.id)) continue;
      const ch: ChannelSync = { chat, pts: null, lastPushAt: 0, minMs: this.gw.timings.channelMinMs, stats: { calls: 0, viaDiff: 0, viaPush: 0, floods: 0, lastTimeout: null } };
      this.channels.set(chat.id, ch);
      // grupo escolhido agora no app (nunca sincronizado; grupo vazio também conta pela data): grava as últimas
      // mensagens antes de acompanhar
      const live = this.live;
      const first = chat.syncedAt == null && live ? this.enqueue(() => catchUpChat(this.gw.bus, live, chat)).catch(() => {}) : Promise.resolve();
      void first.then(() => this.channelTick(ch, gen));
    }
  }

  private scheduleChannel(ch: ChannelSync, gen: number, ms: number) {
    clearTimeout(ch.timer);
    ch.timer = setTimeout(() => void this.channelTick(ch, gen), ms);
    ch.timer.unref?.();
  }

  /** Uma volta: pede o que mudou desde o contador, grava (pela fila da conta) e marca a próxima volta. */
  private async channelTick(ch: ChannelSync, gen: number) {
    const live = this.live;
    if (gen !== this.gen || !live?.channelDiff || !live.channelPts || this.channels.get(ch.chat.id) !== ch) return;
    const t = this.gw.timings;
    try {
      if (ch.pts == null) {
        ch.pts = await live.channelPts(ch.chat.peer);
        if (ch.pts == null) return this.scheduleChannel(ch, gen, 60_000); // sem contador: tenta de novo depois
      }
      ch.stats.calls++;
      const d = await live.channelDiff(ch.chat.peer, ch.pts);
      const receivedAt = Date.now();
      if (gen !== this.gen) return;
      ch.stats.lastTimeout = d.timeout;
      if (d.tooLong) {
        await this.enqueue(() => catchUpChat(this.gw.bus, live, ch.chat)); // ficou atrás demais: relê o chat
      } else if (d.newMessages.length || d.edits.length || d.deleted.length) {
        await this.enqueue(async () => {
          for (const m of d.newMessages) if ((await ingestMessage(this.gw.bus, ch.chat, m, "new", receivedAt)) === "created") ch.stats.viaDiff++;
          for (const m of d.edits) await ingestMessage(this.gw.bus, ch.chat, m, "edit", receivedAt);
          if (d.deleted.length) await ingestDelete(this.gw.bus, this.gw.router, this.linkId, peerKey(ch.chat.peer), d.deleted, receivedAt);
        });
      }
      ch.pts = d.pts;
      if (!d.final) return this.scheduleChannel(ch, gen, 0); // tem mais: continua já
      const pushed = Date.now() - ch.lastPushAt < PUSH_FRESH_MS;
      // o ritmo que o Telegram sugere, limitado a 2 s; nunca abaixo do mínimo (que sobe se ele pedir calma)
      const suggested = (d.timeout ?? 0) * 1000;
      const wait = pushed ? t.channelPushedMs : Math.min(Math.max(ch.minMs, suggested), Math.max(ch.minMs, t.channelMaxMs));
      this.scheduleChannel(ch, gen, wait);
    } catch (e) {
      const msg = errMsg(e);
      if (SESSION_ENDED.includes(msg)) return void (await this.fail(e));
      const seconds = e && typeof e === "object" && "seconds" in e ? Number((e as { seconds: unknown }).seconds) || 0 : 0;
      if (seconds || msg.startsWith("FLOOD")) {
        // o Telegram pediu calma: espera o que ele mandou e volta mais devagar neste chat
        ch.stats.floods++;
        ch.minMs = Math.min(ch.minMs * 2, 30_000);
        log("warn", "tg.channel_flood", { linkId: this.linkId, seconds, minMs: ch.minMs });
        return this.scheduleChannel(ch, gen, Math.max(seconds * 1000, ch.minMs));
      }
      if (msg === "CHANNEL_INVALID" || msg === "CHANNEL_PRIVATE") ch.pts = null;
      log("warn", "tg.channel_diff_failed", { linkId: this.linkId, error: msg });
      this.scheduleChannel(ch, gen, 5_000);
    }
  }

  /** De quantos em quantos minutos: por supergrupo, quantas mensagens vieram pela diferença e quantas empurradas. */
  private logChannelStats() {
    for (const ch of this.channels.values()) {
      log("info", "tg.channel_stats", { linkId: this.linkId, chatId: ch.chat.id, ...ch.stats, minMs: ch.minMs, pushing: Date.now() - ch.lastPushAt < PUSH_FRESH_MS });
      ch.stats = { calls: 0, viaDiff: 0, viaPush: 0, floods: 0, lastTimeout: ch.stats.lastTimeout };
    }
  }

  /** O que a mensagem mandada pelo app vira no banco na hora (sem esperar o evento do Telegram voltar). */
  async recordOwn(peer: TgPeer, m: TgMessage, mode: "new" | "edit") {
    const chat = await this.gw.router.route(this.linkId, peerKey(peer));
    if (!chat) return;
    const lm: LiveMessage = { ...m, editDate: mode === "edit" ? new Date().toISOString() : null, senderId: null };
    await this.enqueue(() => ingestMessage(this.gw.bus, chat, lm, mode));
  }
}

export type GatewayDeps = { factory: LiveFactory; bus: Bus; timings?: Partial<Timings>; nodeId?: string };

export class Gateway {
  readonly factory: LiveFactory;
  readonly bus: Bus;
  readonly router = new Router();
  readonly timings: Timings;
  readonly nodeId: string;
  private runners = new Map<string, LinkRunner>();
  private timers: ReturnType<typeof setInterval>[] = [];
  leader = false;
  private stopping = false;

  constructor(deps: GatewayDeps) {
    this.factory = deps.factory;
    this.bus = deps.bus;
    this.timings = { ...DEFAULT_TIMINGS, ...deps.timings };
    this.nodeId = deps.nodeId ?? randomUUID();
  }

  /** Começa: pega a liderança e conecta as contas; segue vigiando. */
  async start() {
    await this.tickLeader();
    const every = (ms: number, fn: () => Promise<unknown>) => { const t = setInterval(() => void fn().catch((e) => log("error", "tg.gateway_tick", { error: errMsg(e) })), ms); t.unref?.(); this.timers.push(t); };
    every(this.timings.leaderEveryMs, () => this.tickLeader());
    every(this.timings.refreshEveryMs, () => this.refresh());
    every(this.timings.statusEveryMs, async () => { for (const r of this.runners.values()) this.reportStatus(r); });
    every(this.timings.pruneEveryMs, async () => { if (this.leader) log("info", "tg.prune", await prune()); });
  }

  /** Pega ou renova a trava. Redis fora: mantém como está (não larga as conexões por um soluço do Redis; outro
   *  gateway também não consegue pegar a trava). Outro é o líder: desconecta tudo. */
  async tickLeader() {
    let ok: boolean;
    try {
      ok = await this.bus.leader(this.nodeId, this.timings.leaderTtlMs);
    } catch (e) {
      log("warn", "tg.leader_unknown", { error: errMsg(e), leader: this.leader });
      return;
    }
    if (ok && !this.leader) {
      this.leader = true;
      log("info", "tg.leader", { nodeId: this.nodeId });
      await this.refresh();
    } else if (!ok && this.leader) {
      this.leader = false;
      log("warn", "tg.leader_lost", { nodeId: this.nodeId });
      await this.stopRunners();
    }
  }

  /** Confere as contas ativas: conecta as novas, troca a conexão de quem entrou de novo e larga as que saíram. */
  async refresh() {
    if (!this.leader || this.stopping) return;
    const links = await prisma.telegramLink.findMany({ where: { status: "ACTIVE" }, select: { id: true, userId: true, sessionEnc: true } });
    const ids = new Set(links.map((l) => l.id));
    for (const [id, r] of this.runners) if (!ids.has(id)) { this.runners.delete(id); this.router.forget(id); await r.stop(); }
    for (const l of links) {
      const cur = this.runners.get(l.id);
      if (cur && cur.sessionEnc === l.sessionEnc) {
        if (cur.status.state === "connected") void cur.syncChannels().catch(() => {}); // grupo novo ou tirado no app
        continue;
      }
      if (cur) await cur.stop();
      this.launch(l);
    }
  }

  private launch(l: { id: string; userId: string; sessionEnc: string }) {
    const r = new LinkRunner(this, l.id, l.userId, l.sessionEnc);
    this.runners.set(l.id, r);
    this.router.forget(l.id);
    void r.start();
    return r;
  }

  /** A conta para atender um pedido do site: conectada agora, ou espera conectar (conta que acabou de entrar). */
  private async runnerFor(linkId: string): Promise<LinkRunner> {
    if (!this.leader) throw new DomainError(503, "O serviço do Telegram está em espera: tente de novo em instantes");
    let r = this.runners.get(linkId);
    if (!r) {
      const l = await prisma.telegramLink.findFirst({ where: { id: linkId, status: "ACTIVE" }, select: { id: true, userId: true, sessionEnc: true } });
      if (!l) throw new DomainError(404, "Conta do Telegram não encontrada");
      r = this.launch(l);
    }
    if (r.status.state === "revoked") throw Object.assign(new Error(r.status.error ?? "AUTH_KEY_UNREGISTERED"), { errorMessage: r.status.error ?? "AUTH_KEY_UNREGISTERED" });
    if (r.status.state !== "connected") {
      await withTimeout(r.ready, 20_000, "conectar").catch(() => {});
      if ((r.status.state as LinkState) !== "connected") throw new DomainError(503, "Conectando ao Telegram: tente de novo em instantes"); // mudou durante a espera
    }
    return r;
  }

  /** Um pedido do site (mesma interface do Telegram). Mensagem mandada, editada ou apagada pelo app entra no banco
   *  e vira evento na hora. */
  async rpc(linkId: string, method: RpcMethod, args: unknown[]) {
    if (!(RPC_METHODS as readonly string[]).includes(method)) throw new DomainError(400, "Pedido desconhecido");
    const r = await this.runnerFor(linkId);
    const tg = r.live!.tg as unknown as Record<RpcMethod, (...a: unknown[]) => Promise<unknown>>;
    let result: unknown;
    try {
      result = await tg[method](...args);
    } catch (e) {
      if (SESSION_ENDED.includes(errMsg(e))) void r.stop("revoked");
      throw e;
    }
    try {
      if (method === "send" || method === "sendFile") await r.recordOwn(args[0] as TgPeer, result as TgMessage, "new");
      else if (method === "forward") await r.recordOwn(args[2] as TgPeer, result as TgMessage, "new");
      else if (method === "edit") await r.recordOwn(args[0] as TgPeer, result as TgMessage, "edit");
      else if (method === "remove") {
        const peer = args[0] as TgPeer;
        await r.enqueue(() => ingestDelete(this.bus, this.router, linkId, peer.kind === "channel" ? peerKey(peer) : null, [args[1] as number]));
      } else if (method === "logOut") void r.stop("revoked");
    } catch (e) {
      log("warn", "tg.record_own_failed", { method, error: errMsg(e) }); // o pedido deu certo; a recuperação acerta depois
    }
    return result;
  }

  /** Status da conta no Redis (renovado de tempos em tempos); changed = mudou agora: avisa as abas. */
  reportStatus(r: LinkRunner, changed = false) {
    void this.bus.setStatus(r.linkId, r.status, Math.ceil((this.timings.statusEveryMs * 4) / 1000)).catch(() => {});
    if (changed) void this.bus.publish(userChannel(r.userId), { type: "status", linkId: r.linkId, state: r.status.state, at: Date.now() }).catch(() => {});
  }

  health() {
    return {
      leader: this.leader,
      nodeId: this.nodeId,
      links: [...this.runners.values()].map((r) => ({ linkId: r.linkId, ...r.status })),
    };
  }
  runner(linkId: string) {
    return this.runners.get(linkId);
  }

  private async stopRunners() {
    const all = [...this.runners.values()];
    this.runners.clear();
    await Promise.all(all.map((r) => r.stop()));
  }
  async stop() {
    this.stopping = true;
    for (const t of this.timers.splice(0)) clearInterval(t);
    await this.stopRunners();
    if (this.leader) await this.bus.release(this.nodeId);
    this.leader = false;
  }
}

export type { TgClient };

// Telegram simulado para o gateway do Chat Balcões (e os testes de tempo real): o histórico de cada chat e os eventos
// mandados a quem está conectado. Nada sai para o Telegram de verdade.
import type { TgClient, TgPeer } from "@/server/services/telegram";
import { peerKey, type ChannelDiff, type LiveClient, type LiveEvent, type LiveMessage } from "@/gateway/live";

export const rpcErr = (errorMessage: string, seconds?: number) => Object.assign(new Error(errorMessage), { errorMessage, ...(seconds ? { seconds } : {}) });
export const iso = (min: number) => new Date(Date.UTC(2026, 10, 11, 12, min)).toISOString();
export const lm = (id: number, text: string, extra: Partial<LiveMessage> = {}): LiveMessage => ({ id, date: iso(id % 600), sender: "Bia", text, media: null, mediaKind: null, mediaName: null, out: false, fromUser: true, replyTo: null, editDate: null, senderId: "55", ...extra });

export async function waitFor(cond: () => boolean | Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("esperou demais");
}

/** Telegram simulado: o histórico de cada chat (pelo id com a marca de tipo) e os eventos mandados aos conectados. */
export class FakeTelegram {
  chats = new Map<string, LiveMessage[]>();
  listeners = new Set<(e: LiveEvent) => void>();
  starts = 0;
  failStart: string | null = null;
  failPing = false;
  failMessages: Error | null = null;
  calls: string[] = [];
  /** Supergrupo: cada mudança aumenta o contador (pts); a diferença devolve as mudanças depois de um contador. */
  ops = new Map<string, { pts: number; kind: "new" | "edit" | "delete"; m?: LiveMessage; ids?: number[] }[]>();
  diffCalls = 0;
  diffTimeout = 1;
  private bump(peer: TgPeer, op: { kind: "new" | "edit" | "delete"; m?: LiveMessage; ids?: number[] }) {
    if (peer.kind !== "channel") return;
    const k = peerKey(peer);
    const list = this.ops.get(k) ?? [];
    list.push({ pts: (list.at(-1)?.pts ?? 100) + 1, ...op, ...(op.m ? { m: { ...op.m } } : {}) });
    this.ops.set(k, list);
  }
  files: { name: string; size: number }[] = [];
  private nextId = 5000;

  list(peer: TgPeer) {
    const k = peerKey(peer);
    if (!this.chats.has(k)) this.chats.set(k, []);
    return this.chats.get(k)!;
  }
  /** Mensagem chega no Telegram; emit = o evento chega na conexão (false = chegou com o gateway fora). */
  add(peer: TgPeer, m: LiveMessage, emit = true) {
    this.list(peer).push(m);
    this.list(peer).sort((a, b) => a.id - b.id);
    this.bump(peer, { kind: "new", m });
    if (emit) for (const l of this.listeners) l({ kind: "new", peerId: peerKey(peer), message: { ...m }, receivedAt: Date.now() }); // como o GramJS: um objeto por evento
  }
  edit(peer: TgPeer, id: number, text: string, editDate: string, emit = true) {
    const m = this.list(peer).find((x) => x.id === id)!;
    Object.assign(m, { text, editDate });
    this.bump(peer, { kind: "edit", m });
    if (emit) for (const l of this.listeners) l({ kind: "edit", peerId: peerKey(peer), message: { ...m }, receivedAt: Date.now() });
  }
  remove(peer: TgPeer, ids: number[], emit = true) {
    this.chats.set(peerKey(peer), this.list(peer).filter((m) => !ids.includes(m.id)));
    this.bump(peer, { kind: "delete", ids });
    if (emit) for (const l of this.listeners) l({ kind: "delete", peerId: peer.kind === "channel" ? peerKey(peer) : null, ids, receivedAt: Date.now() });
  }

  factory = (session: string): LiveClient => {
    let mine: ((e: LiveEvent) => void) | null = null;
    const self = this;
    const loginOnly = () => { throw new Error("login não passa pelo gateway"); };
    const tg: TgClient = {
      connect: async () => {}, close: async () => {}, saveSession: () => session, sendCode: loginOnly, signIn: loginOnly, checkPassword: loginOnly,
      me: async () => "Conta",
      groups: async () => [],
      messages: async (peer, { limit, minId }) => {
        if (self.failMessages) throw self.failMessages;
        return self.list(peer).filter((m) => !minId || m.id > minId).slice(-limit);
      },
      send: async (peer, text, replyTo) => {
        const m = lm(self.nextId++, text, { out: true, sender: "Você", replyTo: replyTo ?? null, senderId: null });
        self.list(peer).push(m);
        self.calls.push(`send ${peerKey(peer)} ${text}`);
        return m;
      },
      edit: async (peer, id, text) => {
        const m = self.list(peer).find((x) => x.id === id)!;
        m.text = text;
        return { ...m };
      },
      remove: async (peer, id) => { self.chats.set(peerKey(peer), self.list(peer).filter((m) => m.id !== id)); },
      forward: async () => { throw rpcErr("CHAT_FORWARDS_RESTRICTED"); },
      author: async () => null,
      sendFile: async (peer, file, caption) => {
        self.files.push({ name: file.name, size: file.bytes.length });
        return self.tgSend(peer, caption ?? "", file.name);
      },
      downloadMedia: async (_peer, id) => ({ bytes: Buffer.from(`PDF-${id}-\u0000ÿ`), mime: "application/pdf", name: `bilhete-${id}.pdf` }),
      readOutboxMaxId: async () => 0,
      logOut: async () => { self.calls.push("logOut"); },
    };
    return {
      tg,
      start: async (on) => {
        self.starts++;
        if (self.failStart) throw rpcErr(self.failStart);
        mine = on;
        self.listeners.add(on);
      },
      ping: async () => { if (self.failPing) throw new Error("rede caiu"); },
      history: async (peer, { limit, minId, reverse }) => {
        const all = self.list(peer);
        if (reverse) return all.filter((m) => m.id > (minId ?? 0)).slice(0, limit).map((m) => ({ ...m }));
        return all.filter((m) => !minId || m.id > minId).slice(-limit).map((m) => ({ ...m }));
      },
      channelPts: async (peer) => self.ops.get(peerKey(peer))?.at(-1)?.pts ?? 100,
      channelDiff: async (peer, pts): Promise<ChannelDiff> => {
        self.diffCalls++;
        const list = (self.ops.get(peerKey(peer)) ?? []).filter((o) => o.pts > pts);
        const page = list.slice(0, 100);
        return {
          pts: page.at(-1)?.pts ?? pts, timeout: self.diffTimeout, final: list.length <= 100, tooLong: false,
          newMessages: page.filter((o) => o.kind === "new").map((o) => ({ ...o.m! })),
          edits: page.filter((o) => o.kind === "edit").map((o) => ({ ...o.m! })),
          deleted: page.filter((o) => o.kind === "delete").flatMap((o) => o.ids!),
        };
      },
      stop: async () => { if (mine) self.listeners.delete(mine); },
    };
  };
  private tgSend(peer: TgPeer, text: string, mediaName: string) {
    const m = lm(this.nextId++, text, { out: true, sender: "Você", media: "arquivo", mediaKind: "file", mediaName, senderId: null });
    this.list(peer).push(m);
    return m;
  }
}


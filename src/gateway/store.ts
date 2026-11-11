// Gateway do Chat Balcões: grava no Postgres o que chega do Telegram e, só depois de gravado, avisa os navegadores
// (Redis). Cada mudança vira uma linha em TelegramEvent (o id é a ordem); quem reconecta pede "desde o id X".
// - Mensagem nova repetida (do listener e da recuperação) não duplica: a chave é (chat, número da mensagem).
// - Edição mais velha que a gravada é ignorada (evento fora de ordem).
// - Exclusão marca deletedAt (a linha fica; a tela some com a mensagem).
import { Prisma } from "@prisma/client";
import { prisma, log } from "@/server/db";
import type { TgPeer } from "@/server/services/telegram";
import { userChannel, type Bus } from "./bus";
import type { LiveClient, LiveMessage } from "./live";

export type ChatKind = "GROUP" | "DM";
/** Um chat do app (grupo do Chat Balcões ou conversa no privado) de uma conta conectada. */
export type ChatTarget = { kind: ChatKind; id: string; userId: string; linkId: string; peer: TgPeer; syncedUpTo: number | null };

/** Evento publicado para o navegador (o id vira texto: BigInt não vai no JSON). */
export type PublishedEvent = { id: string; type: string; chatKind: ChatKind; chatId: string; msgId: number; date?: string; receivedAt?: number };

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/* ---------------- Para que chat do app vai cada mensagem ---------------- */

/** Grupos e conversas do app de cada conta, pelo id do chat no Telegram. Relê de tempos em tempos e quando chega
 *  mensagem de um chat desconhecido (uma conversa aberta agora no app), no máximo a cada 5 s por conta. */
export class Router {
  private byLink = new Map<string, { at: number; userId: string; groups: Map<string, ChatTarget>; dms: Map<string, ChatTarget> }>();
  constructor(private maxAgeMs = 60_000, private missRetryMs = 5_000) {}

  async load(linkId: string) {
    const [link, groups, dms] = await Promise.all([
      prisma.telegramLink.findUnique({ where: { id: linkId }, select: { userId: true } }),
      prisma.telegramGroup.findMany({ where: { linkId }, select: { id: true, userId: true, groupId: true, peer: true, syncedUpTo: true } }),
      prisma.telegramDm.findMany({ where: { linkId }, select: { id: true, userId: true, peerId: true, peerHash: true, syncedUpTo: true } }),
    ]);
    const entry = {
      at: Date.now(),
      userId: link?.userId ?? "",
      groups: new Map(groups.filter((g) => g.peer).map((g) => [g.groupId, { kind: "GROUP" as const, id: g.id, userId: g.userId, linkId, peer: g.peer as TgPeer, syncedUpTo: g.syncedUpTo }])),
      dms: new Map(dms.map((d) => [d.peerId, { kind: "DM" as const, id: d.id, userId: d.userId, linkId, peer: { kind: "user" as const, id: d.peerId, hash: d.peerHash }, syncedUpTo: d.syncedUpTo }])),
    };
    this.byLink.set(linkId, entry);
    return entry;
  }
  private async entry(linkId: string) {
    const e = this.byLink.get(linkId);
    return e && Date.now() - e.at < this.maxAgeMs ? e : this.load(linkId);
  }
  /** O chat do app de uma mensagem; null = chat que o app não acompanha (fica de fora, nada é gravado). */
  async route(linkId: string, peerId: string): Promise<ChatTarget | null> {
    let e = await this.entry(linkId);
    let hit = e.groups.get(peerId) ?? e.dms.get(peerId);
    if (!hit && Date.now() - e.at >= this.missRetryMs) {
      e = await this.load(linkId);
      hit = e.groups.get(peerId) ?? e.dms.get(peerId);
    }
    return hit ?? null;
  }
  async chats(linkId: string) {
    const e = await this.load(linkId);
    return { groups: [...e.groups.values()], dms: [...e.dms.values()] };
  }
  forget(linkId: string) {
    this.byLink.delete(linkId);
  }
}

/* ---------------- Gravação ---------------- */

async function publish(bus: Bus, userId: string, ev: PublishedEvent) {
  try {
    await bus.publish(userChannel(userId), ev);
  } catch (e) {
    // já está no banco: o navegador recupera pelo "desde o id X" ao reconectar
    log("warn", "tg.publish_failed", { type: ev.type, error: e instanceof Error ? e.message : String(e) });
  }
}

const fields = (m: LiveMessage) => ({
  date: new Date(m.date),
  editDate: m.editDate ? new Date(m.editDate) : null,
  senderId: m.senderId,
  senderName: m.sender,
  out: m.out,
  fromUser: m.fromUser,
  text: m.text,
  replyTo: m.replyTo,
  fwd: !!m.fwd,
  media: m.media,
  mediaKind: m.mediaKind ?? null,
  mediaName: m.mediaName ?? null,
});

/**
 * Grava uma mensagem do chat. mode: "new" (chegou agora), "edit" (foi editada) ou "sync" (vista na recuperação).
 * Devolve o que aconteceu: created (nova no banco), updated (mudou: edição) ou same (já estava assim, ou é uma
 * edição mais velha que a gravada).
 */
export async function ingestMessage(bus: Bus, chat: ChatTarget, m: LiveMessage, mode: "new" | "edit" | "sync", receivedAt = Date.now()): Promise<"created" | "updated" | "same"> {
  const where = chat.kind === "GROUP" ? { groupId_msgId: { groupId: chat.id, msgId: m.id } } : { dmId_msgId: { dmId: chat.id, msgId: m.id } };
  const data = fields(m);
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await prisma.$transaction(async (tx) => {
        const cur = await tx.telegramMessage.findUnique({ where });
        if (!cur) {
          await tx.telegramMessage.create({ data: { userId: chat.userId, linkId: chat.linkId, ...(chat.kind === "GROUP" ? { groupId: chat.id } : { dmId: chat.id }), msgId: m.id, ...data } });
          const ev = await tx.telegramEvent.create({ data: { userId: chat.userId, type: mode === "edit" ? "message.edit" : "message.new", chatKind: chat.kind, chatId: chat.id, msgId: m.id } });
          return { result: "created" as const, ev };
        }
        const incoming = data.editDate?.getTime() ?? 0;
        const stored = cur.editDate?.getTime() ?? 0;
        if (incoming < stored) return { result: "same" as const, ev: null }; // edição atrasada: a gravada é mais nova
        const changed = cur.text !== data.text || incoming !== stored || cur.media !== data.media || cur.mediaName !== data.mediaName || cur.replyTo !== data.replyTo;
        if (!changed) return { result: "same" as const, ev: null };
        await tx.telegramMessage.update({ where, data: { text: data.text, editDate: data.editDate, media: data.media, mediaKind: data.mediaKind, mediaName: data.mediaName, replyTo: data.replyTo } });
        const ev = await tx.telegramEvent.create({ data: { userId: chat.userId, type: "message.edit", chatKind: chat.kind, chatId: chat.id, msgId: m.id } });
        return { result: "updated" as const, ev };
      });
      if (r.ev) {
        await publish(bus, chat.userId, { id: r.ev.id.toString(), type: r.ev.type, chatKind: chat.kind, chatId: chat.id, msgId: m.id, date: m.date, receivedAt });
        if (mode !== "sync") log("info", "tg.message", { type: r.ev.type, chatKind: chat.kind, lagMs: receivedAt - Date.parse(m.editDate ?? m.date), storeMs: Date.now() - receivedAt });
      }
      return r.result;
    } catch (e) {
      // o listener e a recuperação gravaram a mesma mensagem ao mesmo tempo: na segunda volta ela já existe
      if (attempt < 2 && isUnique(e)) continue;
      throw e;
    }
  }
}

/**
 * Mensagens apagadas no Telegram. Com peerId (supergrupo/canal), só as daquele chat; sem peerId (privado ou grupo
 * pequeno, onde o número é único na conta), as da conta que não são de supergrupo.
 */
export async function ingestDelete(bus: Bus, router: Router, linkId: string, peerId: string | null, ids: number[], receivedAt = Date.now()) {
  if (!ids.length) return 0;
  let where: Prisma.TelegramMessageWhereInput;
  if (peerId) {
    const chat = await router.route(linkId, peerId);
    if (!chat || chat.kind !== "GROUP") return 0;
    where = { groupId: chat.id, msgId: { in: ids }, deletedAt: null };
  } else {
    where = { linkId, msgId: { in: ids }, deletedAt: null, OR: [{ dmId: { not: null } }, { group: { groupId: { not: { startsWith: "-100" } } } }] };
  }
  return markDeleted(bus, where, receivedAt);
}

async function markDeleted(bus: Bus, where: Prisma.TelegramMessageWhereInput, receivedAt = Date.now()) {
  const evs = await prisma.$transaction(async (tx) => {
    const rows = await tx.telegramMessage.findMany({ where, select: { id: true, userId: true, groupId: true, dmId: true, msgId: true } });
    if (!rows.length) return [];
    await tx.telegramMessage.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: new Date() } });
    const out: PublishedEvent[] = [];
    for (const r of rows) {
      const chatKind: ChatKind = r.groupId ? "GROUP" : "DM";
      const chatId = (r.groupId ?? r.dmId)!;
      const ev = await tx.telegramEvent.create({ data: { userId: r.userId, type: "message.delete", chatKind, chatId, msgId: r.msgId } });
      out.push({ id: ev.id.toString(), type: ev.type, chatKind, chatId, msgId: r.msgId, receivedAt });
    }
    return out.map((e, i) => ({ userId: rows[i]!.userId, e }));
  });
  for (const { userId, e } of evs) await publish(bus, userId, e);
  return evs.length;
}

/* ---------------- Recuperação (depois de uma queda, ao conectar e de tempos em tempos) ---------------- */

/** Mensagens lidas por página e o máximo de páginas para trás numa recuperação (o resto fica de fora). */
export const CATCHUP_PAGE = 100;
export const CATCHUP_MAX_PAGES = 10;

/**
 * Põe o chat em dia: lê as últimas 100 mensagens (as novas que faltaram, as editadas e, pela ausência, as apagadas
 * nesse trecho); se ficou buraco entre o que estava gravado e essas 100, lê o buraco em páginas, do mais velho para o
 * mais novo. Marca até onde o chat ficou em dia.
 */
export async function catchUpChat(bus: Bus, live: LiveClient, chat: ChatTarget) {
  const recent = await live.history(chat.peer, { limit: CATCHUP_PAGE });
  let created = 0;
  let updated = 0;
  const count = (r: "created" | "updated" | "same") => { if (r === "created") created++; else if (r === "updated") updated++; };
  // buraco: o que ficou entre o último gravado e as 100 mais novas
  const firstRecent = recent[0]?.id;
  if (chat.syncedUpTo != null && firstRecent != null && firstRecent - 1 > chat.syncedUpTo) {
    let minId = chat.syncedUpTo;
    for (let page = 0; page < CATCHUP_MAX_PAGES; page++) {
      const list = await live.history(chat.peer, { limit: CATCHUP_PAGE, minId, reverse: true });
      for (const m of list) if (m.id < firstRecent) count(await ingestMessage(bus, chat, m, "sync"));
      if (list.length < CATCHUP_PAGE || list.at(-1)!.id >= firstRecent) break;
      minId = list.at(-1)!.id;
    }
  }
  for (const m of recent) count(await ingestMessage(bus, chat, m, "sync"));
  // apagadas: gravadas dentro do trecho das 100 mais novas que não vieram nele
  let deleted = 0;
  if (recent.length) {
    const ids = new Set(recent.map((m) => m.id));
    const lo = recent[0]!.id;
    const hi = recent.at(-1)!.id;
    const stored = await prisma.telegramMessage.findMany({
      where: { ...(chat.kind === "GROUP" ? { groupId: chat.id } : { dmId: chat.id }), msgId: { gte: lo, lte: hi }, deletedAt: null },
      select: { msgId: true },
    });
    const gone = stored.map((s) => s.msgId).filter((id) => !ids.has(id));
    if (gone.length) deleted = await markDeleted(bus, { ...(chat.kind === "GROUP" ? { groupId: chat.id } : { dmId: chat.id }), msgId: { in: gone }, deletedAt: null });
  }
  const upTo = Math.max(chat.syncedUpTo ?? 0, recent.at(-1)?.id ?? 0) || null;
  const data = { syncedUpTo: upTo, syncedAt: new Date() };
  if (chat.kind === "GROUP") await prisma.telegramGroup.updateMany({ where: { id: chat.id }, data });
  else await prisma.telegramDm.updateMany({ where: { id: chat.id }, data });
  chat.syncedUpTo = upTo;
  return { created, updated, deleted };
}

/* ---------------- Limpeza ---------------- */

/** Apaga eventos velhos (quem reconecta só precisa dos recentes) e mensagens além do prazo de guarda. */
export async function prune(now = Date.now(), opts: { eventHours?: number; messageDays?: number } = {}) {
  const eventHours = opts.eventHours ?? 48;
  const messageDays = opts.messageDays ?? (Number(process.env.TG_MESSAGE_RETENTION_DAYS) || 90);
  const [ev, msg] = await Promise.all([
    prisma.telegramEvent.deleteMany({ where: { createdAt: { lt: new Date(now - eventHours * 3600_000) } } }),
    prisma.telegramMessage.deleteMany({ where: { date: { lt: new Date(now - messageDays * 86_400_000) } } }),
  ]);
  return { events: ev.count, messages: msg.count };
}

// Telegram: o usuário conecta a própria conta (pela API oficial de clientes) para o app ler o grupo do balcão.
// O login é em etapas, uma por requisição: enviar o código → confirmar o código → (senha de duas etapas). Entre
// uma etapa e outra a sessão fica no banco, criptografada (ela dá acesso à conta). O app só lê: nunca envia nada.
// O servidor precisa de TELEGRAM_API_ID e TELEGRAM_API_HASH (my.telegram.org) e de CREDENTIALS_KEY.
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { computeCheck } from "telegram/Password";
import { LogLevel } from "telegram/extensions/Logger";
import { returnBigInt } from "telegram/Helpers";
import type { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { encrypt, decrypt, credentialsEnabled } from "./accounts";
import { matchAlerts, parseAlertWords, type AlertRule } from "@/domain/telegram-alerts";

/** Como chegar no grupo direto (sem listar os chats da conta): supergrupo/canal precisa do hash de acesso. */
export type TgPeer = { kind: "channel"; id: string; hash: string } | { kind: "chat"; id: string };
export type TgGroup = { id: string; title: string; channel: boolean; peer?: TgPeer };
/** Mensagem do grupo: quem mandou, quando, o texto e, se tiver, o tipo de anexo (foto, arquivo...). */
export type TgMessage = { id: number; date: string; sender: string; text: string; media: string | null };
export type SignInResult = "OK" | "PASSWORD_NEEDED" | "SIGN_UP_REQUIRED";

/** O que o app usa do Telegram (nos testes, um Telegram simulado). */
export interface TgClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  saveSession(): string;
  sendCode(phone: string): Promise<{ phoneCodeHash: string; viaApp: boolean }>;
  signIn(phone: string, phoneCodeHash: string, code: string): Promise<SignInResult>;
  checkPassword(password: string): Promise<void>;
  me(): Promise<string>;
  groups(): Promise<TgGroup[]>;
  /** Últimas mensagens do grupo, da mais antiga para a mais nova; minId = só as mais novas que ela. */
  messages(peer: TgPeer, opts: { limit: number; minId?: number }): Promise<TgMessage[]>;
  logOut(): Promise<void>;
}

/** Nome de quem mandou: pessoa (nome ou @usuário) ou o próprio grupo/canal. */
function senderName(s: unknown) {
  if (s instanceof Api.User) return [s.firstName, s.lastName].filter(Boolean).join(" ") || (s.username ? `@${s.username}` : "Alguém");
  if (s instanceof Api.Channel || s instanceof Api.Chat) return s.title;
  return "Alguém";
}
/** Tipo do anexo para mostrar no lugar dele (prévia de link não conta: o link já está no texto). */
function mediaLabel(m: Api.TypeMessageMedia | undefined) {
  if (!m || m instanceof Api.MessageMediaWebPage) return null;
  if (m instanceof Api.MessageMediaPhoto) return "foto";
  if (m instanceof Api.MessageMediaDocument) {
    const mime = m.document instanceof Api.Document ? m.document.mimeType : "";
    return mime.startsWith("video/") ? "vídeo" : mime.startsWith("audio/") ? "áudio" : mime.startsWith("image/") ? "imagem" : "arquivo";
  }
  if (m instanceof Api.MessageMediaPoll) return "enquete";
  return "anexo";
}

function apiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  return apiId && apiHash ? { apiId, apiHash } : null;
}
/** O servidor tem as chaves do Telegram e a chave de criptografia das sessões. */
export const telegramEnabled = () => !!apiCredentials() && credentialsEnabled();

function gramClient(session: string): TgClient {
  const creds = apiCredentials();
  if (!creds) throw new DomainError(503, "Telegram desativado: defina TELEGRAM_API_ID e TELEGRAM_API_HASH no servidor");
  const c = new TelegramClient(new StringSession(session), creds.apiId, creds.apiHash, { connectionRetries: 2 });
  c.setLogLevel(LogLevel.ERROR);
  return {
    connect: async () => { await c.connect(); },
    close: async () => { await c.destroy().catch(() => {}); },
    saveSession: () => (c.session as StringSession).save(),
    sendCode: async (phone) => {
      const r = await c.sendCode(creds, phone);
      return { phoneCodeHash: r.phoneCodeHash, viaApp: r.isCodeViaApp };
    },
    signIn: async (phone, phoneCodeHash, code) => {
      try {
        const r = await c.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }));
        return r instanceof Api.auth.AuthorizationSignUpRequired ? "SIGN_UP_REQUIRED" : "OK";
      } catch (e) {
        if (rpcMessage(e) === "SESSION_PASSWORD_NEEDED") return "PASSWORD_NEEDED";
        throw e;
      }
    },
    checkPassword: async (password) => {
      const srp = await c.invoke(new Api.account.GetPassword());
      await c.invoke(new Api.auth.CheckPassword({ password: await computeCheck(srp, password) }));
    },
    me: async () => {
      const u = await c.getMe();
      return [[u.firstName, u.lastName].filter(Boolean).join(" "), u.username ? `@${u.username}` : ""].filter(Boolean).join(" ") || "Conta do Telegram";
    },
    groups: async () =>
      (await c.getDialogs({ limit: 300 }))
        .filter((d) => d.isGroup || d.isChannel)
        .map((d) => {
          const e = d.entity;
          const peer: TgPeer | undefined = e instanceof Api.Channel ? { kind: "channel", id: e.id.toString(), hash: (e.accessHash ?? 0).toString() } : e instanceof Api.Chat ? { kind: "chat", id: e.id.toString() } : undefined;
          return { id: String(d.id), title: d.title || "(sem nome)", channel: d.isChannel && !d.isGroup, peer };
        }),
    messages: async (peer, { limit, minId }) => {
      const input = peer.kind === "channel"
        ? new Api.InputPeerChannel({ channelId: returnBigInt(peer.id), accessHash: returnBigInt(peer.hash) })
        : new Api.InputPeerChat({ chatId: returnBigInt(peer.id) });
      const list = await c.getMessages(input, { limit, ...(minId ? { minId } : {}) });
      return list
        .filter((m) => m instanceof Api.Message)
        .map((m) => ({ id: m.id, date: new Date(m.date * 1000).toISOString(), sender: senderName(m.sender), text: m.message ?? "", media: mediaLabel(m.media) }))
        .reverse();
    },
    logOut: async () => { await c.invoke(new Api.auth.LogOut()); },
  };
}

let makeClient: (session: string) => TgClient = gramClient;
/** Só para os testes: troca o Telegram de verdade por um simulado (sem argumento, volta ao de verdade). */
export function setTelegramClientFactory(f?: (session: string) => TgClient) {
  makeClient = f ?? gramClient;
  for (const id of [...pool.keys()]) dropPooled(id);
}

const rpcMessage = (e: unknown) => (e && typeof e === "object" && "errorMessage" in e ? String((e as { errorMessage: unknown }).errorMessage) : "");

/** Erros do Telegram em mensagens para o usuário; sessão encerrada no app do Telegram desfaz a conexão. */
function tgError(e: unknown): never {
  if (e instanceof DomainError) throw e;
  const msg = rpcMessage(e);
  const seconds = e && typeof e === "object" && "seconds" in e ? Number((e as { seconds: unknown }).seconds) : 0;
  if (seconds) throw new DomainError(429, `O Telegram pediu para esperar ${seconds >= 120 ? `${Math.ceil(seconds / 60)} minutos` : `${seconds} segundos`} antes de tentar de novo`);
  const known: Record<string, [number, string]> = {
    PHONE_NUMBER_INVALID: [400, "Número inválido: use o DDI, o DDD e o número (ex.: +55 11 99999-8888)"],
    PHONE_NUMBER_BANNED: [400, "Este número está bloqueado no Telegram"],
    PHONE_CODE_INVALID: [400, "Código errado: confira o código que chegou no Telegram"],
    PHONE_CODE_EMPTY: [400, "Informe o código"],
    PHONE_CODE_EXPIRED: [400, "O código expirou: cancele e peça outro"],
    PASSWORD_HASH_INVALID: [400, "Senha de duas etapas errada"],
    API_ID_INVALID: [503, "TELEGRAM_API_ID ou TELEGRAM_API_HASH inválidos no servidor"],
  };
  const k = known[msg];
  if (k) throw new DomainError(k[0], k[1]);
  if (["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "SESSION_EXPIRED", "USER_DEACTIVATED", "AUTH_KEY_DUPLICATED"].includes(msg)) throw new SessionEnded();
  if (!msg) throw e; // não veio do Telegram (rede, banco...): erro interno, registrado no log
  throw new DomainError(502, `O Telegram recusou (${msg}): tente de novo`);
}
class SessionEnded extends Error {}

/** Conecta, faz o que precisa e fecha a conexão (cada etapa é curta); demora demais = 504. */
async function withClient<T>(session: string, fn: (c: TgClient) => Promise<T>): Promise<T> {
  const c = makeClient(session);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DomainError(504, "O Telegram demorou para responder: tente de novo")), 45_000); });
  try {
    return await Promise.race([(async () => { await c.connect(); return fn(c); })(), timeout]);
  } catch (e) {
    return tgError(e);
  } finally {
    clearTimeout(timer);
    await c.close();
  }
}

/** Conexões para ler os chats (a tela pergunta de tempos em tempos): uma por conta, reaproveitada e fechada depois
 *  de 2 minutos sem uso. Muda a sessão (entrou de novo), abre outra. Fica no globalThis para sobreviver ao recarregar
 *  do servidor de desenvolvimento. */
type Pooled = { c: TgClient; key: string; ready: Promise<void>; idle?: ReturnType<typeof setTimeout> };
const g = globalThis as unknown as { __tgPool?: Map<string, Pooled> };
const pool: Map<string, Pooled> = (g.__tgPool ??= new Map());
function dropPooled(id: string) {
  const p = pool.get(id);
  if (!p) return;
  pool.delete(id);
  clearTimeout(p.idle);
  void p.c.close();
}
async function withPooled<T>(link: { id: string; sessionEnc: string }, fn: (c: TgClient) => Promise<T>): Promise<T> {
  let p = pool.get(link.id);
  if (p && p.key !== link.sessionEnc) {
    dropPooled(link.id);
    p = undefined;
  }
  if (!p) {
    const c = makeClient(decrypt(link.sessionEnc));
    p = { c, key: link.sessionEnc, ready: c.connect() };
    pool.set(link.id, p);
  }
  const cur = p;
  clearTimeout(cur.idle);
  cur.idle = setTimeout(() => dropPooled(link.id), 120_000);
  cur.idle.unref?.();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DomainError(504, "O Telegram demorou para responder: tente de novo")), 45_000); });
  try {
    await Promise.race([cur.ready, timeout]);
    return await Promise.race([fn(cur.c), timeout]);
  } catch (e) {
    dropPooled(link.id); // na próxima, conecta de novo
    return tgError(e);
  } finally {
    clearTimeout(timer);
  }
}

/** Número no formato do Telegram: +DDI e dígitos; sem "+" e com 10 ou 11 dígitos (DDD e número), é do Brasil. */
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (!raw.trim().startsWith("+") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  if (d.length < 11 || d.length > 15) throw new DomainError(400, "Número inválido: use o DDI, o DDD e o número (ex.: +55 11 99999-8888)");
  return `+${d}`;
}
/** Número com o meio escondido: +55 •••• 8888. */
export const maskPhone = (p: string) => `${p.slice(0, 3)} •••• ${p.slice(-4)}`;

/** Até quantas contas do Telegram um usuário conecta. */
export const MAX_TELEGRAM_ACCOUNTS = 10;

type Link = NonNullable<Awaited<ReturnType<typeof prisma.telegramLink.findFirst>>>;
async function own(userId: string, id: string): Promise<Link> {
  const l = await prisma.telegramLink.findFirst({ where: { id, userId } });
  if (!l) throw new DomainError(404, "Conta do Telegram não encontrada");
  return l;
}
function requireEnabled() {
  if (!apiCredentials()) throw new DomainError(503, "Telegram desativado: defina TELEGRAM_API_ID e TELEGRAM_API_HASH no servidor");
  if (!credentialsEnabled()) throw new DomainError(503, "Telegram desativado: defina CREDENTIALS_KEY no servidor");
}

const view = (l: Link) => ({
  id: l.id,
  status: l.status as "CODE_SENT" | "PASSWORD_NEEDED" | "ACTIVE",
  phone: maskPhone(l.phone),
  codeViaApp: l.codeViaApp,
  accountName: l.accountName,
  group: l.groupId ? { id: l.groupId, title: l.groupTitle ?? "" } : null,
});
export type TelegramAccountView = ReturnType<typeof view>;

/** As contas conectadas (e as que estão no meio do login), da mais antiga para a mais nova. */
export async function telegramStatus(userId: string) {
  const links = await prisma.telegramLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return { enabled: telegramEnabled(), max: MAX_TELEGRAM_ACCOUNTS, accounts: links.map(view) };
}

/** 1ª etapa: o Telegram manda o código (no app do Telegram ou por SMS). Cada número é uma conta; o mesmo número
 *  no meio do login recomeça. */
export async function startTelegramLogin(userId: string, rawPhone: string) {
  requireEnabled();
  const phone = normalizePhone(rawPhone);
  const same = await prisma.telegramLink.findUnique({ where: { userId_phone: { userId, phone } } });
  if (same?.status === "ACTIVE") throw new DomainError(409, "Esta conta do Telegram já está conectada");
  if (!same && (await prisma.telegramLink.count({ where: { userId } })) >= MAX_TELEGRAM_ACCOUNTS) throw new DomainError(409, `Limite de ${MAX_TELEGRAM_ACCOUNTS} contas do Telegram: desconecte uma antes`);
  const sent = await withClient("", async (c) => ({ ...(await c.sendCode(phone)), session: c.saveSession() }));
  const data = { sessionEnc: encrypt(sent.session), status: "CODE_SENT", phoneCodeHash: sent.phoneCodeHash, codeViaApp: sent.viaApp, accountName: null, groupId: null, groupTitle: null };
  await prisma.telegramLink.upsert({ where: { userId_phone: { userId, phone } }, create: { userId, phone, ...data }, update: data });
  return telegramStatus(userId);
}

/** Login concluído: guarda a sessão já autorizada e o nome da conta. */
async function activate(id: string, c: TgClient) {
  const accountName = await c.me();
  await prisma.telegramLink.update({ where: { id }, data: { sessionEnc: encrypt(c.saveSession()), status: "ACTIVE", phoneCodeHash: null, accountName } });
}

/** 2ª etapa: o código. Com senha de duas etapas, falta a senha. */
export async function confirmTelegramCode(userId: string, id: string, rawCode: string) {
  requireEnabled();
  const l = await own(userId, id);
  if (l.status !== "CODE_SENT" || !l.phoneCodeHash) throw new DomainError(409, "Peça o código primeiro");
  const code = rawCode.replace(/\D/g, "");
  if (!code) throw new DomainError(400, "Informe o código");
  await withClient(decrypt(l.sessionEnc), async (c) => {
    const r = await c.signIn(l.phone, l.phoneCodeHash!, code);
    if (r === "SIGN_UP_REQUIRED") throw new DomainError(400, "Este número não tem conta no Telegram");
    if (r === "PASSWORD_NEEDED") {
      await prisma.telegramLink.update({ where: { id }, data: { sessionEnc: encrypt(c.saveSession()), status: "PASSWORD_NEEDED" } });
      return;
    }
    await activate(id, c);
  });
  return telegramStatus(userId);
}

/** 3ª etapa (se a conta tiver): a senha de duas etapas. Ela não é guardada em lugar nenhum. */
export async function confirmTelegramPassword(userId: string, id: string, password: string) {
  requireEnabled();
  const l = await own(userId, id);
  if (l.status !== "PASSWORD_NEEDED") throw new DomainError(409, "Esta etapa não pede senha");
  if (!password) throw new DomainError(400, "Informe a senha de duas etapas");
  await withClient(decrypt(l.sessionEnc), async (c) => {
    await c.checkPassword(password);
    await activate(id, c);
  });
  return telegramStatus(userId);
}

/** Sessão encerrada no app do Telegram: a conta sai daqui e o usuário conecta de novo. */
async function guardSession<T>(l: Link, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof SessionEnded)) throw e;
    dropPooled(l.id);
    await prisma.telegramLink.deleteMany({ where: { id: l.id, userId: l.userId } });
    throw new DomainError(409, `A conexão da conta ${maskPhone(l.phone)} foi encerrada (pelo app do Telegram?): conecte de novo`);
  }
}
async function activeLink(userId: string, id: string) {
  requireEnabled();
  const l = await own(userId, id);
  if (l.status !== "ACTIVE") throw new DomainError(409, "Termine de conectar esta conta do Telegram primeiro");
  return l;
}

/** Grupos e canais da conta, com o acesso direto a cada um (uso interno). */
async function accountGroups(l: Link) {
  return guardSession(l, () => withPooled(l, (c) => c.groups()));
}

/** Grupos e canais da conta, para escolher o do balcão. */
export async function listTelegramGroups(userId: string, id: string) {
  return (await accountGroups(await activeLink(userId, id))).map(({ id: gid, title, channel }) => ({ id: gid, title, channel }));
}

/** Escolhe o grupo do balcão da conta (precisa ser um dos grupos dela); guarda o acesso direto a ele. */
export async function chooseTelegramGroup(userId: string, id: string, groupId: string) {
  const g = (await accountGroups(await activeLink(userId, id))).find((x) => x.id === groupId);
  if (!g) throw new DomainError(404, "Grupo não encontrado nesta conta do Telegram");
  await prisma.telegramLink.update({ where: { id }, data: { groupId: g.id, groupTitle: g.title, groupPeer: (g.peer ?? null) as Prisma.InputJsonValue } });
  return telegramStatus(userId);
}

/** Acesso direto ao grupo do balcão; conta que escolheu o grupo antes de guardar o acesso busca uma vez e guarda. */
async function groupPeer(l: Link): Promise<TgPeer> {
  if (!l.groupId) throw new DomainError(409, "Escolha o grupo do balcão desta conta em Configurações › Telegram");
  if (l.groupPeer) return l.groupPeer as TgPeer;
  const g = (await accountGroups(l)).find((x) => x.id === l.groupId);
  if (!g?.peer) throw new DomainError(404, "O grupo do balcão não está mais nesta conta do Telegram: escolha outro em Configurações › Telegram");
  await prisma.telegramLink.update({ where: { id: l.id }, data: { groupPeer: g.peer as Prisma.InputJsonValue } });
  return g.peer;
}

const activeAlerts = (userId: string): Promise<AlertRule[]> =>
  prisma.telegramAlert.findMany({ where: { userId, active: true }, select: { id: true, name: true, words: true, active: true } });

/** Mensagens do grupo do balcão da conta (da mais antiga para a mais nova), com os alertas que cada uma dispara.
 *  minId = só as que chegaram depois dela. Ler pelo app não marca nada como lido no Telegram. */
export async function chatMessages(userId: string, id: string, opts: { limit?: number; minId?: number } = {}) {
  const l = await activeLink(userId, id);
  const peer = await groupPeer(l);
  const [msgs, rules] = await Promise.all([
    guardSession(l, () => withPooled(l, (c) => c.messages(peer, { limit: Math.min(Math.max(opts.limit ?? 50, 1), 100), minId: opts.minId }))),
    activeAlerts(userId),
  ]);
  return msgs.map((m) => ({ ...m, alerts: m.text ? matchAlerts(m.text, rules) : [] }));
}

/** Aba Alertas: as mensagens recentes de todos os chats que dispararam algum alerta, da mais nova para a mais
 *  antiga. Um chat que falhar não derruba os outros (vai em errors). */
export async function alertFeed(userId: string) {
  requireEnabled();
  const links = await prisma.telegramLink.findMany({ where: { userId, status: "ACTIVE", groupId: { not: null } }, orderBy: { createdAt: "asc" } });
  const results = await Promise.all(links.map(async (l) => {
    try {
      const msgs = await chatMessages(userId, l.id, { limit: 100 });
      return { items: msgs.filter((m) => m.alerts.length).map((m) => ({ ...m, chatId: l.id, chat: l.groupTitle ?? "" })), error: null };
    } catch (e) {
      return { items: [], error: { chatId: l.id, chat: l.groupTitle ?? "", erro: e instanceof DomainError ? e.message : "Não deu para ler este chat agora" } };
    }
  }));
  return {
    items: results.flatMap((r) => r.items).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100),
    errors: results.flatMap((r) => (r.error ? [r.error] : [])),
  };
}

/* ---------------- Alertas ---------------- */

/** Até quantos alertas um usuário cadastra. */
export const MAX_TELEGRAM_ALERTS = 50;

export const listTelegramAlerts = (userId: string) =>
  prisma.telegramAlert.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, words: true, active: true } });

/** Cria (id null) ou muda um alerta. Sem nome, o nome são as palavras. */
export async function saveTelegramAlert(userId: string, id: string | null, input: { name?: string; words: string[]; active?: boolean }) {
  const words = parseAlertWords(input.words.join(","));
  if (!words.length) throw new DomainError(400, "Informe ao menos uma palavra");
  const name = input.name?.trim() || words.join(" + ");
  if (!id) {
    if ((await prisma.telegramAlert.count({ where: { userId } })) >= MAX_TELEGRAM_ALERTS) throw new DomainError(409, `Limite de ${MAX_TELEGRAM_ALERTS} alertas`);
    await prisma.telegramAlert.create({ data: { userId, name, words, active: input.active ?? true } });
  } else {
    const { count } = await prisma.telegramAlert.updateMany({ where: { id, userId }, data: { name, words, ...(input.active !== undefined ? { active: input.active } : {}) } });
    if (!count) throw new DomainError(404, "Alerta não encontrado");
  }
  return listTelegramAlerts(userId);
}

export async function deleteTelegramAlert(userId: string, id: string) {
  const { count } = await prisma.telegramAlert.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Alerta não encontrado");
  return listTelegramAlerts(userId);
}

/** Desconecta a conta: encerra a sessão no Telegram (some de Dispositivos) e apaga daqui. No meio do login, só
 *  cancela. */
export async function disconnectTelegram(userId: string, id: string) {
  const l = await own(userId, id);
  dropPooled(l.id);
  if (l.status === "ACTIVE" && telegramEnabled()) {
    await withClient(decrypt(l.sessionEnc), (c) => c.logOut()).catch(() => {}); // já encerrada lá: só apaga aqui
  }
  await prisma.telegramLink.deleteMany({ where: { id, userId } });
  return telegramStatus(userId);
}
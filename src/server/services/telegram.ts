// Telegram: o usuário conecta a própria conta (pela API oficial de clientes) para ler o grupo do balcão, mandar
// mensagem nele e conversar no privado com quem postou (Chat Balcões).
// O login é em etapas, uma por requisição: enviar o código → confirmar o código → (senha de duas etapas). Entre
// uma etapa e outra a sessão fica no banco, criptografada (ela dá acesso à conta). O app só manda o que o usuário
// escreveu e mandou: nunca envia nada sozinho.
// O servidor precisa de TELEGRAM_API_ID e TELEGRAM_API_HASH (my.telegram.org) e de CREDENTIALS_KEY.
import { TelegramClient, Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { StringSession } from "telegram/sessions";
import { computeCheck } from "telegram/Password";
import { LogLevel } from "telegram/extensions/Logger";
import { returnBigInt } from "telegram/Helpers";
import type { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { encrypt, decrypt, credentialsEnabled } from "./accounts";
import { matchAlerts, parseAlertWords, hasAdCriteria, hasProfitCriteria, describeAlert, type AlertRule } from "@/domain/telegram-alerts";
import { parseBalcaoAd, parseCounterOffer, emissionAnalysis, type EmissionAccount } from "@/domain/balcao-ads";
import { balcaoForGroup, buyerDataFromMessages } from "@/domain/miles-deals";
import { createDeal, markDealTermsSent, moveDeal } from "./miles-deals";
import { emissionAccounts } from "./capacity";
import { gatewayUrl, remoteClient } from "../telegram-rpc";

/** Como chegar no chat direto (sem listar os chats da conta): supergrupo/canal e pessoa precisam do hash de acesso. */
export type TgPeer = { kind: "channel"; id: string; hash: string } | { kind: "chat"; id: string } | { kind: "user"; id: string; hash: string };
export type TgGroup = { id: string; title: string; channel: boolean; peer?: TgPeer };
/** Mensagem: quem mandou ("Você" se foi a conta), quando, o texto e, se tiver, o tipo de anexo (foto, arquivo...).
 *  out = mandada pela conta; fromUser = a mensagem é de uma pessoa (dá para chamar no privado); replyTo = é resposta
 *  a esta mensagem (contraproposta a um pedido, por exemplo); fwd = encaminhada (o pedido levado para o privado). */
export type TgMessage = { id: number; date: string; sender: string; text: string; media: string | null; mediaKind?: "photo" | "file" | null; mediaName?: string | null; out: boolean; fromUser: boolean; replyTo: number | null; fwd?: boolean };
/** Pessoa que mandou uma mensagem no grupo, com o acesso para conversar com ela no privado. */
export type TgUser = { id: string; hash: string; name: string; username: string | null; self: boolean; bot: boolean };
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
  /** Últimas mensagens do chat (grupo ou privado), da mais antiga para a mais nova; minId = só as mais novas. */
  messages(peer: TgPeer, opts: { limit: number; minId?: number }): Promise<TgMessage[]>;
  /** Manda a mensagem no chat (replyTo = como resposta a uma mensagem) e devolve como ela ficou. */
  send(peer: TgPeer, text: string, replyTo?: number): Promise<TgMessage>;
  /** Troca o texto de uma mensagem da conta. */
  edit(peer: TgPeer, id: number, text: string): Promise<TgMessage>;
  /** Apaga uma mensagem da conta para todos. */
  remove(peer: TgPeer, id: number): Promise<void>;
  /** Encaminha a mensagem do grupo para outro chat (o pedido para o privado de quem postou) e devolve a encaminhada. */
  forward(from: TgPeer, messageId: number, to: TgPeer): Promise<TgMessage>;
  /** Quem mandou a mensagem do grupo, com o acesso para o privado (null = não é de uma pessoa). */
  author(group: TgPeer, messageId: number): Promise<TgUser | null>;
  /** Manda um arquivo (documento, ex.: o bilhete em PDF) no chat, com legenda opcional, e devolve a mensagem. */
  sendFile(peer: TgPeer, file: { name: string; mime: string; bytes: Buffer }, caption?: string): Promise<TgMessage>;
  /** Baixa a foto ou o arquivo de uma mensagem; null = essa mensagem não tem anexo para baixar. */
  downloadMedia(peer: TgPeer, messageId: number): Promise<{ bytes: Buffer; mime: string; name: string } | null>;
  /** Até que mensagem sua (de saída) a pessoa já leu no chat (read_outbox_max_id); 0 = sem info. */
  readOutboxMaxId(peer: TgPeer): Promise<number>;
  logOut(): Promise<void>;
}

/** O chat no formato da API do Telegram. */
export function inputPeer(p: TgPeer) {
  if (p.kind === "channel") return new Api.InputPeerChannel({ channelId: returnBigInt(p.id), accessHash: returnBigInt(p.hash) });
  if (p.kind === "user") return new Api.InputPeerUser({ userId: returnBigInt(p.id), accessHash: returnBigInt(p.hash) });
  return new Api.InputPeerChat({ chatId: returnBigInt(p.id) });
}
export function toMessage(m: Api.Message): TgMessage {
  const mm = mediaMeta(m.media);
  return {
    id: m.id, date: new Date(m.date * 1000).toISOString(), sender: m.out ? "Você" : senderName(m.sender), text: m.message ?? "",
    media: mediaLabel(m.media), mediaKind: mm.kind, mediaName: mm.name, out: !!m.out, fromUser: m.fromId instanceof Api.PeerUser || (!m.fromId && m.peerId instanceof Api.PeerUser),
    replyTo: m.replyTo instanceof Api.MessageReplyHeader ? m.replyTo.replyToMsgId ?? null : null,
    fwd: !!m.fwdFrom,
  };
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
/** Teto de memória ao abrir/baixar a mídia recebida: acima disso não baixa (evita DoS com um arquivo gigante do grupo). */
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
/** O que dá para fazer com a mídia na tela: "photo" mostra a imagem, "file" baixa o arquivo, null = nada para baixar
 *  (prévia de link ou enquete). Imagem mandada como arquivo (print) conta como "photo" só se couber no teto — assim
 *  um "image/*" gigante não vira uma <img> que baixa sozinha ao abrir o chat; vira botão de baixar (que também barra). */
function mediaMeta(m: Api.TypeMessageMedia | undefined): { kind: "photo" | "file" | null; name: string | null } {
  if (m instanceof Api.MessageMediaPhoto) return { kind: "photo", name: null };
  if (m instanceof Api.MessageMediaDocument && m.document instanceof Api.Document) {
    const mime = m.document.mimeType || "";
    const attr = m.document.attributes.find((a) => a instanceof Api.DocumentAttributeFilename);
    const name = attr instanceof Api.DocumentAttributeFilename ? attr.fileName : null;
    const fits = Number(m.document.size) <= MAX_MEDIA_BYTES;
    return { kind: mime.startsWith("image/") && fits ? "photo" : "file", name };
  }
  return { kind: null, name: null };
}

export function apiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  return apiId && apiHash ? { apiId, apiHash } : null;
}
/** O servidor tem as chaves do Telegram e a chave de criptografia das sessões. */
export const telegramEnabled = () => !!apiCredentials() && credentialsEnabled();

/** Cliente GramJS da sessão (sem conectar). O gateway do tempo real cria o dele com mais tentativas de reconexão. */
export function newGramClient(session: string, opts: { connectionRetries?: number } = {}) {
  const creds = apiCredentials();
  if (!creds) throw new DomainError(503, "Telegram desativado: defina TELEGRAM_API_ID e TELEGRAM_API_HASH no servidor");
  const c = new TelegramClient(new StringSession(session), creds.apiId, creds.apiHash, { connectionRetries: opts.connectionRetries ?? 2 });
  c.setLogLevel(LogLevel.ERROR);
  return c;
}

function gramClient(session: string): TgClient {
  return wrapGram(newGramClient(session));
}

/** O que o app usa do Telegram em cima de um cliente GramJS (o do pool do site ou o permanente do gateway). */
export function wrapGram(c: TelegramClient): TgClient {
  const creds = apiCredentials()!;
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
      const list = await c.getMessages(inputPeer(peer), { limit, ...(minId ? { minId } : {}) });
      return list.filter((m) => m instanceof Api.Message).map(toMessage).reverse();
    },
    send: async (peer, text, replyTo) => toMessage(await c.sendMessage(inputPeer(peer), { message: text, ...(replyTo ? { replyTo } : {}) })),
    edit: async (peer, id, text) => toMessage(await c.editMessage(inputPeer(peer), { message: id, text })),
    remove: async (peer, id) => { await c.deleteMessages(inputPeer(peer), [id], { revoke: true }); },
    forward: async (from, messageId, to) => {
      const [res] = await c.forwardMessages(inputPeer(to), { messages: [messageId], fromPeer: inputPeer(from) });
      // o número que volta do encaminhar nem sempre é o da mensagem na conversa: pega a encaminhada mais nova de lá
      const recent = await c.getMessages(inputPeer(to), { limit: 5 });
      const m = recent.find((x) => x instanceof Api.Message && x.out && x.fwdFrom) ?? res;
      if (!(m instanceof Api.Message)) throw new DomainError(404, "Não deu para encaminhar o pedido");
      return toMessage(m);
    },
    author: async (group, messageId) => {
      const [m] = await c.getMessages(inputPeer(group), { ids: [messageId] });
      if (!(m instanceof Api.Message) || !(m.fromId instanceof Api.PeerUser)) return null;
      // em grupo grande o Telegram manda a pessoa sem o acesso completo: pede o contato dela a partir da mensagem
      const [u] = await c.invoke(new Api.users.GetUsers({ id: [new Api.InputUserFromMessage({ peer: inputPeer(group), msgId: messageId, userId: m.fromId.userId })] }));
      if (!(u instanceof Api.User)) return null;
      return { id: u.id.toString(), hash: (u.accessHash ?? 0).toString(), name: senderName(u), username: u.username ?? null, self: !!u.self, bot: !!u.bot };
    },
    sendFile: async (peer, file, caption) => {
      const upload = new CustomFile(file.name, file.bytes.length, "", file.bytes);
      // foto/print vai como foto (abre com prévia no Telegram); PDF e o resto vai como arquivo com o nome
      const asPhoto = ["image/jpeg", "image/png", "image/webp"].includes(file.mime);
      const m = await c.sendFile(inputPeer(peer), {
        file: upload, caption, forceDocument: !asPhoto,
        ...(asPhoto ? {} : { attributes: [new Api.DocumentAttributeFilename({ fileName: file.name })] }),
      });
      return toMessage(m);
    },
    downloadMedia: async (peer, messageId) => {
      const [m] = await c.getMessages(inputPeer(peer), { ids: [messageId] });
      if (!(m instanceof Api.Message)) return null;
      const meta = mediaMeta(m.media);
      if (!meta.kind) return null;
      const doc = m.media instanceof Api.MessageMediaDocument && m.media.document instanceof Api.Document ? m.media.document : null;
      const photo = m.media instanceof Api.MessageMediaPhoto;
      // trava de memória: não baixa arquivo acima do teto (foto do Telegram já é pequena, por isso só checa documento)
      if (doc && Number(doc.size) > MAX_MEDIA_BYTES) throw new DomainError(413, "Arquivo grande demais para abrir aqui (mais de 20 MB) — baixe pelo app do Telegram");
      const data = await c.downloadMedia(m);
      if (!data) return null;
      const bytes = typeof data === "string" ? Buffer.from(data, "binary") : Buffer.from(data);
      const mime = doc?.mimeType || (photo ? "image/jpeg" : "application/octet-stream");
      const name = meta.name ?? (photo ? `foto-${messageId}.jpg` : `arquivo-${messageId}`);
      return { bytes, mime, name };
    },
    readOutboxMaxId: async (peer) => {
      const r = await c.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: inputPeer(peer) })] }));
      const d = r.dialogs.find((x) => x instanceof Api.Dialog);
      return d instanceof Api.Dialog ? d.readOutboxMaxId : 0;
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
    // envio
    PEER_FLOOD: [429, "O Telegram limitou esta conta para mensagens no privado com quem não tem você nos contatos (muitas conversas novas). Tente mais tarde ou pelo app do Telegram."],
    USER_PRIVACY_RESTRICTED: [403, "Esta pessoa não aceita mensagens de quem não é contato dela"],
    USER_IS_BLOCKED: [403, "Esta pessoa bloqueou a sua conta"],
    YOU_BLOCKED_USER: [403, "Você bloqueou esta pessoa no Telegram: desbloqueie para conversar"],
    INPUT_USER_DEACTIVATED: [404, "Esta conta do Telegram foi apagada"],
    CHAT_WRITE_FORBIDDEN: [403, "Esta conta não pode escrever neste grupo"],
    CHAT_SEND_PLAIN_FORBIDDEN: [403, "Este grupo não aceita mensagens de texto desta conta"],
    USER_BANNED_IN_CHANNEL: [403, "Esta conta está proibida de escrever neste grupo"],
    MESSAGE_TOO_LONG: [400, "Mensagem longa demais para o Telegram"],
    MESSAGE_EMPTY: [400, "Escreva a mensagem"],
    // editar e excluir
    MESSAGE_AUTHOR_REQUIRED: [403, "Só dá para editar as suas mensagens"],
    MESSAGE_DELETE_FORBIDDEN: [403, "Só dá para excluir as suas mensagens"],
    MESSAGE_EDIT_TIME_EXPIRED: [400, "Passou o prazo do Telegram para editar esta mensagem"],
    MESSAGE_NOT_MODIFIED: [400, "A mensagem ficou igual"],
    MESSAGE_ID_INVALID: [404, "Mensagem não encontrada no Telegram"],
    CHAT_FORWARDS_RESTRICTED: [403, "Este grupo não deixa encaminhar as mensagens"],
  };
  const k = known[msg];
  if (k) throw new DomainError(k[0], k[1]);
  if (SESSION_ENDED.includes(msg)) throw new SessionEnded();
  // a mesma sessão usada por duas conexões ao mesmo tempo: o Telegram derruba esta conexão, mas a conta continua
  // valendo (não apaga a conta do app; a próxima tentativa conecta de novo)
  if (msg === "AUTH_KEY_DUPLICATED") throw new DomainError(503, "A conexão com o Telegram caiu (sessão usada em outro lugar ao mesmo tempo): tente de novo em instantes");
  if (!msg) throw e; // não veio do Telegram (rede, banco...): erro interno, registrado no log
  throw new DomainError(502, `O Telegram recusou (${msg}): tente de novo`);
}
class SessionEnded extends Error {}
/** Erros do Telegram que querem dizer "esta sessão não vale mais" (encerrada no app do Telegram, conta apagada...). */
export const SESSION_ENDED = ["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "SESSION_EXPIRED", "USER_DEACTIVATED"];

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
// código recarregado (servidor de desenvolvimento): a conexão aberta pela versão anterior não serve mais
const LOADED_AT = Date.now();
const poolKey = (sessionEnc: string) => `${LOADED_AT}:${sessionEnc}`;
function dropPooled(id: string) {
  const p = pool.get(id);
  if (!p) return;
  pool.delete(id);
  clearTimeout(p.idle);
  void p.c.close();
}
async function withPooled<T>(link: { id: string; sessionEnc: string }, fn: (c: TgClient) => Promise<T>): Promise<T> {
  // tempo real ligado: quem conecta no Telegram é só o gateway (uma conexão por conta); o site pede a ele
  const gw = gatewayUrl();
  if (gw) return withGateway(gw, link.id, fn);
  let p = pool.get(link.id);
  if (p && p.key !== poolKey(link.sessionEnc)) {
    dropPooled(link.id);
    p = undefined;
  }
  if (!p) {
    const c = makeClient(decrypt(link.sessionEnc));
    p = { c, key: poolKey(link.sessionEnc), ready: c.connect() };
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

/** O Telegram pelo gateway: mesma interface, cada chamada vira um pedido HTTP na rede interna. */
async function withGateway<T>(url: string, linkId: string, fn: (c: TgClient) => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DomainError(504, "O Telegram demorou para responder: tente de novo")), 45_000); });
  try {
    return await Promise.race([fn(remoteClient(url, linkId)), timeout]);
  } catch (e) {
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

type LinkWithGroups = Link & { groups: { id: string; groupId: string; title: string; clearedUpTo: number | null }[] };
const view = (l: LinkWithGroups) => ({
  id: l.id,
  status: l.status as "CODE_SENT" | "PASSWORD_NEEDED" | "ACTIVE",
  phone: maskPhone(l.phone),
  codeViaApp: l.codeViaApp,
  accountName: l.accountName,
  // grupos de balcão no Chat Balcões (id = o do chat; groupId = o do grupo no Telegram; clearedUpTo = limpo no app)
  groups: l.groups.map((g) => ({ id: g.id, groupId: g.groupId, title: g.title, clearedUpTo: g.clearedUpTo })),
});
export type TelegramAccountView = ReturnType<typeof view>;

/** As contas conectadas (e as que estão no meio do login), da mais antiga para a mais nova, com os grupos. */
export async function telegramStatus(userId: string) {
  const links = await prisma.telegramLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, include: { groups: { orderBy: { createdAt: "asc" } } } });
  return { enabled: telegramEnabled(), max: MAX_TELEGRAM_ACCOUNTS, maxGroups: MAX_TELEGRAM_GROUPS, accounts: links.map(view) };
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
  const data = { sessionEnc: encrypt(sent.session), status: "CODE_SENT", phoneCodeHash: sent.phoneCodeHash, codeViaApp: sent.viaApp, accountName: null };
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

/* ---------------- Grupos (chats do Chat Balcões) ---------------- */

/** Até quantos grupos de balcão cada conta tem no Chat Balcões. */
export const MAX_TELEGRAM_GROUPS = 10;

/** Grupo escolhido (um chat do Chat Balcões) com a conta dele, que precisa estar conectada. */
async function ownChat(userId: string, chatId: string) {
  requireEnabled();
  const c = await prisma.telegramGroup.findFirst({ where: { id: chatId, userId }, include: { link: true } });
  if (!c) throw new DomainError(404, "Grupo não encontrado no Chat Balcões");
  if (c.link.status !== "ACTIVE") throw new DomainError(409, "A conta do Telegram deste grupo não está conectada");
  return c;
}
type Chat = Awaited<ReturnType<typeof ownChat>>;

/** Grupos e canais da conta, com o acesso direto a cada um (uso interno). */
async function accountGroups(l: Link) {
  return guardSession(l, () => withPooled(l, (c) => c.groups()));
}

/** Grupos e canais da conta, para escolher os de balcão (chosen = já está no Chat Balcões). */
export async function listTelegramGroups(userId: string, id: string) {
  const l = await activeLink(userId, id);
  const [all, chosen] = await Promise.all([accountGroups(l), prisma.telegramGroup.findMany({ where: { linkId: l.id }, select: { groupId: true } })]);
  const set = new Set(chosen.map((c) => c.groupId));
  return all.map(({ id: gid, title, channel }) => ({ id: gid, title, channel, chosen: set.has(gid) }));
}

/** Põe um grupo da conta no Chat Balcões (vira uma aba), guardando o acesso direto a ele. */
export async function addTelegramGroup(userId: string, id: string, groupId: string) {
  const l = await activeLink(userId, id);
  const g = (await accountGroups(l)).find((x) => x.id === groupId);
  if (!g) throw new DomainError(404, "Grupo não encontrado nesta conta do Telegram");
  if (await prisma.telegramGroup.count({ where: { linkId: l.id, groupId } })) throw new DomainError(409, "Este grupo já está no Chat Balcões");
  if ((await prisma.telegramGroup.count({ where: { linkId: l.id } })) >= MAX_TELEGRAM_GROUPS) throw new DomainError(409, `Limite de ${MAX_TELEGRAM_GROUPS} grupos por conta: tire um antes`);
  await prisma.telegramGroup.create({ data: { userId, linkId: l.id, groupId: g.id, title: g.title, peer: (g.peer ?? undefined) as Prisma.InputJsonValue | undefined } });
  return telegramStatus(userId);
}

/** Tira o grupo do Chat Balcões (no Telegram você continua no grupo). */
export async function removeTelegramGroup(userId: string, chatId: string) {
  const { count } = await prisma.telegramGroup.deleteMany({ where: { id: chatId, userId } });
  if (!count) throw new DomainError(404, "Grupo não encontrado no Chat Balcões");
  return telegramStatus(userId);
}

/** Acesso direto ao grupo; sem ele guardado, busca nos chats da conta uma vez e guarda. */
async function chatPeer(c: Chat): Promise<TgPeer> {
  if (c.peer) return c.peer as TgPeer;
  const g = (await accountGroups(c.link)).find((x) => x.id === c.groupId);
  if (!g?.peer) throw new DomainError(404, "O grupo não está mais nesta conta do Telegram: tire e escolha de novo em Configurações › Telegram");
  await prisma.telegramGroup.update({ where: { id: c.id }, data: { peer: g.peer as Prisma.InputJsonValue } });
  return g.peer;
}

/** Campos do alerta (o que ele pede). */
const ALERT_SELECT = { id: true, name: true, words: true, active: true, program: true, maxCpfs: true, minMiles: true, maxMiles: true, minCpmCents: true, minProfitCents: true, minProfitPerCpfCents: true } as const;
const activeAlerts = (userId: string): Promise<AlertRule[]> => prisma.telegramAlert.findMany({ where: { userId, active: true }, select: ALERT_SELECT });

/** Referência do pedido na negociação do CRM Milhas: conta, grupo e mensagem (o número da mensagem é por grupo). */
const adRef = (linkId: string, groupId: string, messageId: number) => `tg:${linkId}:${groupId}:${messageId}`;
const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Mensagens do grupo (da mais antiga para a mais nova), com o pedido lido, os alertas que disparam e, se o pedido
 *  já foi registrado, a negociação do CRM Milhas. minId = só as que chegaram depois dela (e nada do que foi limpo
 *  no app). Ler pelo app não marca nada como lido no Telegram. */
export async function chatMessages(userId: string, chatId: string, opts: { limit?: number; minId?: number; ids?: number[]; rules?: AlertRule[]; accounts?: EmissionAccount[] } = {}) {
  const c = await ownChat(userId, chatId);
  const minId = Math.max(opts.minId ?? 0, c.clearedUpTo ?? 0) || undefined;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const fetching = fromStore(c)
    ? storedMessages({ groupId: c.id }, { limit, minId, ids: opts.ids?.filter((id) => id > (c.clearedUpTo ?? 0)) })
    : chatPeer(c).then((peer) => guardSession(c.link, () => withPooled(c.link, (cl) => cl.messages(peer, { limit, minId }))));
  const [msgs, rules] = await Promise.all([
    fetching,
    opts.rules ?? activeAlerts(userId),
  ]);
  // as suas contas só quando algum alerta olha o lucro
  const accounts = opts.accounts ?? (rules.some(hasProfitCriteria) ? await emissionAccounts(userId) : []);
  const read = msgs.map((m) => {
    const ad = m.text ? parseBalcaoAd(m.text) : null; // pedido de compra/venda lido da mensagem (contraproposta não é)
    return { ...m, ad, alerts: m.text ? matchAlerts(m.text, rules, ad, accounts) : [] };
  });
  const refs = read.filter((m) => m.ad).map((m) => adRef(c.linkId, c.groupId, m.id));
  const deals = refs.length ? await prisma.milesDeal.findMany({ where: { userId, sourceRef: { in: refs } }, select: { id: true, number: true, stage: true, sourceRef: true, accountId: true } }) : [];
  const byRef = new Map(deals.map((d) => [d.sourceRef, { id: d.id, number: d.number, stage: d.stage, accountId: d.accountId }]));
  return read.map((m) => ({ ...m, crm: m.ad ? byRef.get(adRef(c.linkId, c.groupId, m.id)) ?? null : null }));
}

/**
 * Registra o pedido do grupo no CRM Milhas: negociação de balcão (o da lista que bate com o nome do grupo, ou o
 * próprio grupo) com as milhas, os CPFs e o milheiro (o da sua contraproposta, se houver, senão o do pedido), na
 * conta mais barata que consegue emitir, e o texto do pedido nas observações. Com contraproposta, já vai para
 * "Negociação". Um pedido vira uma negociação só.
 */
export async function registerAdInCrm(userId: string, chatId: string, input: { messageId: number; text: string; sender: string; cpmCents?: number | null }) {
  const c = await prisma.telegramGroup.findFirst({ where: { id: chatId, userId } });
  if (!c) throw new DomainError(404, "Grupo não encontrado no Chat Balcões");
  const ad = parseBalcaoAd(input.text);
  if (!ad) throw new DomainError(400, "Esta mensagem não é um pedido");
  const sourceRef = adRef(c.linkId, c.groupId, input.messageId);
  const existing = await prisma.milesDeal.findFirst({ where: { userId, sourceRef }, select: { number: true } });
  if (existing) throw new DomainError(409, `Este pedido já está no CRM Milhas (#${existing.number})`);
  const cpmCents = input.cpmCents ?? ad.cpmCents;
  const profit = emissionAnalysis(ad, cpmCents, await emissionAccounts(userId)); // mesma conta que a tela sugere (regra da negociação)
  const group = c.title.trim() || "Balcão";
  const used = await prisma.milesDeal.findMany({ where: { userId, buyerType: "BALCAO" }, select: { customerName: true }, distinct: ["customerName"] });
  const balcao = balcaoForGroup(group, used.map((u) => u.customerName));
  const notes = [
    `Pedido de ${input.sender} no grupo ${group}:`,
    input.text.trim().slice(0, 1500),
    input.cpmCents != null ? `Minha contraproposta: ${brl(input.cpmCents)} o milheiro` : null,
  ].filter(Boolean).join("\n");
  const deal = await createDeal(userId, {
    buyerType: "BALCAO", customerName: balcao, accountId: profit?.covers ? profit.accountId : null, points: ad.miles, saleCpmCents: cpmCents ?? null,
    passengers: ad.cpfs ?? 1, notes, sourceRef, sourceContact: input.sender,
  });
  return input.cpmCents != null ? moveDeal(userId, deal.id, "NEGOTIATION") : deal;
}

/** Texto para mandar: sem espaços sobrando; o Telegram aceita até 4.096 caracteres. */
function messageText(raw: string) {
  const text = raw.trim();
  if (!text) throw new DomainError(400, "Escreva a mensagem");
  if (text.length > 4096) throw new DomainError(400, "Mensagem longa demais (até 4.096 caracteres)");
  return text;
}
const plain = (m: TgMessage) => ({ ...m, ad: null, alerts: [] as string[] });

/* ---------------- Tempo real: leitura pelo banco ---------------- */

/** Com o gateway ligado, o chat que ele já sincronizou é lido do banco (rápido, sem consultar o Telegram). */
const fromStore = (chat: { syncedAt: Date | null }) => !!gatewayUrl() && chat.syncedAt != null;

/** Mensagens gravadas pelo gateway, no mesmo formato das lidas do Telegram (da mais antiga para a mais nova).
 *  ids = só essas (a tela relê uma mensagem editada); senão as `limit` mais novas depois de minId. */
async function storedMessages(where: { groupId: string } | { dmId: string }, opts: { limit?: number; minId?: number; ids?: number[] }): Promise<TgMessage[]> {
  const rows = await prisma.telegramMessage.findMany({
    where: { ...where, deletedAt: null, ...(opts.ids ? { msgId: { in: opts.ids } } : opts.minId ? { msgId: { gt: opts.minId } } : {}) },
    orderBy: { msgId: "desc" },
    take: Math.min(Math.max(opts.limit ?? 50, 1), 100),
  });
  return rows.reverse().map((r) => ({
    id: r.msgId, date: r.date.toISOString(), sender: r.out ? "Você" : r.senderName, text: r.text, media: r.media,
    mediaKind: (r.mediaKind as "photo" | "file" | null) ?? null, mediaName: r.mediaName, out: r.out, fromUser: r.fromUser, replyTo: r.replyTo, fwd: r.fwd,
  }));
}

/** Eventos do Chat Balcões depois do id `after` (a aba que reconectou pede o que perdeu). reset = perdeu demais (ou os
 *  eventos já foram limpos): a aba recarrega tudo. */
export async function telegramEventsSince(userId: string, after: string) {
  const from = /^\d{1,19}$/.test(after) ? BigInt(after) : 0n;
  const MAX = 500;
  const [items, oldest] = await Promise.all([
    prisma.telegramEvent.findMany({ where: { userId, id: { gt: from } }, orderBy: { id: "asc" }, take: MAX + 1 }),
    prisma.telegramEvent.findFirst({ where: { userId }, orderBy: { id: "asc" }, select: { id: true } }),
  ]);
  const reset = items.length > MAX || (oldest != null && from > 0n && oldest.id > from + 1n);
  return {
    reset,
    items: reset ? [] : items.map((e) => ({ id: e.id.toString(), type: e.type, chatKind: e.chatKind, chatId: e.chatId, msgId: e.msgId })),
    lastId: (items.at(-1)?.id ?? from).toString(),
  };
}

/** Manda a mensagem no grupo (escrita e enviada pelo usuário); replyTo = como resposta a uma mensagem do grupo
 *  (a contraproposta a um pedido). */
export async function sendToGroup(userId: string, chatId: string, raw: string, replyTo?: number) {
  const text = messageText(raw);
  const c = await ownChat(userId, chatId);
  const peer = await chatPeer(c);
  const m = await guardSession(c.link, () => withPooled(c.link, (cl) => cl.send(peer, text, replyTo)));
  return { ...m, ad: parseBalcaoAd(m.text), alerts: [] as string[] };
}

/** Manda um arquivo (foto, print ou PDF) no grupo. */
export async function sendTelegramChatFile(userId: string, chatId: string, file: { name: string; mime: string; bytes: Buffer }, caption?: string) {
  const c = await ownChat(userId, chatId);
  const peer = await chatPeer(c);
  return plain(await guardSession(c.link, () => withPooled(c.link, (cl) => cl.sendFile(peer, file, caption))));
}

/** Baixa a foto ou o arquivo de uma mensagem do grupo (para mostrar ou baixar no Chat Balcões). */
export async function telegramChatMedia(userId: string, chatId: string, messageId: number) {
  const c = await ownChat(userId, chatId);
  const peer = await chatPeer(c);
  return guardSession(c.link, () => withPooled(c.link, (cl) => cl.downloadMedia(peer, messageId)));
}

/** Edita a sua mensagem no grupo (a contraproposta, por exemplo). */
export async function editGroupMessage(userId: string, chatId: string, messageId: number, raw: string) {
  const text = messageText(raw);
  const c = await ownChat(userId, chatId);
  const peer = await chatPeer(c);
  const m = await guardSession(c.link, () => withPooled(c.link, (cl) => cl.edit(peer, messageId, text)));
  return { ...m, ad: parseBalcaoAd(m.text), alerts: [] as string[] };
}

/** Exclui a sua mensagem no grupo, para todos. */
export async function deleteGroupMessage(userId: string, chatId: string, messageId: number) {
  const c = await ownChat(userId, chatId);
  const peer = await chatPeer(c);
  await guardSession(c.link, () => withPooled(c.link, (cl) => cl.remove(peer, messageId)));
}

/** Limpa o chat do grupo só no app (até a mensagem upTo; null = mostra tudo de novo). No Telegram nada muda. */
export async function clearGroupChat(userId: string, chatId: string, upTo: number | null) {
  const { count } = await prisma.telegramGroup.updateMany({ where: { id: chatId, userId }, data: { clearedUpTo: upTo } });
  if (!count) throw new DomainError(404, "Grupo não encontrado no Chat Balcões");
}

/* ---------------- Privado ---------------- */

/** O pedido a que você mandou a contraproposta no privado (a conversa fica ligada a ele). */
export type DmOffer = { chatId: string; messageId: number; text: string; sender: string; group: string; cpmCents: number | null; at: string };

const dmView = (d: { id: string; linkId: string; name: string; username: string | null; groupTitle: string | null; clearedUpTo: number | null; offer: Prisma.JsonValue | null; link: { accountName: string | null; phone: string } }) => ({
  id: d.id, linkId: d.linkId, name: d.name, username: d.username, via: d.link.accountName ?? maskPhone(d.link.phone), group: d.groupTitle, clearedUpTo: d.clearedUpTo,
  offer: (d.offer as DmOffer | null) ?? null,
});
export type DmView = ReturnType<typeof dmView>;
const DM_INCLUDE = { link: { select: { accountName: true, phone: true, status: true } } } as const;

/** Conversas no privado abertas (das contas conectadas), da mais antiga para a mais nova. */
export async function listTelegramDms(userId: string) {
  const dms = await prisma.telegramDm.findMany({ where: { userId, closed: false, link: { status: "ACTIVE" } }, include: DM_INCLUDE, orderBy: { createdAt: "asc" } });
  const views = dms.map(dmView);
  // conversa ligada a um pedido: a negociação do CRM Milhas dele, se já foi registrado
  const chatIds = [...new Set(views.flatMap((v) => (v.offer ? [v.offer.chatId] : [])))];
  if (!chatIds.length) return views.map((v) => ({ ...v, crm: null }));
  const groups = await prisma.telegramGroup.findMany({ where: { userId, id: { in: chatIds } }, select: { id: true, linkId: true, groupId: true } });
  const refOf = (o: DmOffer) => { const g = groups.find((x) => x.id === o.chatId); return g ? adRef(g.linkId, g.groupId, o.messageId) : null; };
  const refs = views.flatMap((v) => { const r = v.offer && refOf(v.offer); return r ? [r] : []; });
  const deals = await prisma.milesDeal.findMany({ where: { userId, sourceRef: { in: refs } }, select: { id: true, number: true, stage: true, sourceRef: true, accountId: true } });
  return views.map((v) => {
    const r = v.offer && refOf(v.offer);
    const d = r ? deals.find((x) => x.sourceRef === r) : undefined;
    return { ...v, crm: d ? { id: d.id, number: d.number, stage: d.stage, accountId: d.accountId } : null };
  });
}

/** Abre (ou reabre) a conversa no privado com quem mandou a mensagem do grupo, pela conta do grupo. */
export async function openTelegramDm(userId: string, chatId: string, messageId: number) {
  const c = await ownChat(userId, chatId);
  const peer = await chatPeer(c);
  const u = await guardSession(c.link, () => withPooled(c.link, (cl) => cl.author(peer, messageId)));
  if (!u) throw new DomainError(400, "Esta mensagem não é de uma pessoa");
  if (u.self) throw new DomainError(400, "Esta mensagem é sua");
  if (u.bot) throw new DomainError(400, "Esta mensagem é de um robô do grupo");
  const data = { peerHash: u.hash, name: u.name, username: u.username, groupTitle: c.title };
  const d = await prisma.telegramDm.upsert({
    where: { linkId_peerId: { linkId: c.linkId, peerId: u.id } },
    create: { userId, linkId: c.linkId, peerId: u.id, ...data },
    update: { ...data, closed: false },
    include: DM_INCLUDE,
  });
  return dmView(d);
}

/** Chamar no privado quem postou o pedido de uma negociação registrada pelo Chat Balcões (pela conta do grupo). */
export async function openDmFromDeal(userId: string, dealId: string) {
  const d = await prisma.milesDeal.findFirst({ where: { id: dealId, userId }, select: { sourceRef: true } });
  if (!d) throw new DomainError(404, "Negociação não encontrada");
  const ref = d.sourceRef?.match(/^tg:([^:]+):(-?\d+):(\d+)$/);
  if (!ref) throw new DomainError(400, "Esta negociação não veio de um pedido do Chat Balcões");
  const chat = await prisma.telegramGroup.findFirst({ where: { userId, linkId: ref[1], groupId: ref[2] }, select: { id: true } });
  if (!chat) throw new DomainError(409, "O grupo deste pedido não está mais no Chat Balcões: adicione de novo em Configurações › Telegram");
  return openTelegramDm(userId, chat.id, Number(ref[3]));
}

/** A conversa no privado com quem postou o pedido da negociação, achada pelo banco (o autor do pedido gravado pelo
 *  gateway); null = ainda não dá (sem tempo real, pedido não gravado ou conversa nunca aberta). */
async function storedDealDm(userId: string, dealId: string) {
  if (!gatewayUrl()) return null;
  const d = await prisma.milesDeal.findFirst({ where: { id: dealId, userId }, select: { sourceRef: true } });
  const ref = d?.sourceRef?.match(/^tg:([^:]+):(-?\d+):(\d+)$/);
  if (!ref) return null;
  const group = await prisma.telegramGroup.findFirst({ where: { userId, linkId: ref[1], groupId: ref[2] }, select: { id: true } });
  const ad = group ? await prisma.telegramMessage.findUnique({ where: { groupId_msgId: { groupId: group.id, msgId: Number(ref[3]) } }, select: { senderId: true } }) : null;
  if (!ad?.senderId) return null;
  const dm = await prisma.telegramDm.findFirst({ where: { userId, linkId: ref[1], peerId: ad.senderId }, select: { id: true, name: true, closed: true } });
  if (!dm) return null;
  if (dm.closed) await prisma.telegramDm.update({ where: { id: dm.id }, data: { closed: false } }); // como o abrir faz
  return dm;
}

/** Quanto antes da negociação ser criada ainda conta como conversa dela (o pedido às vezes é registrado depois de
 *  ele já ter mandado os dados). */
const DEAL_CHAT_MARGIN_MS = 3 * 3600_000;

/** Dados dos passageiros que o comprador mandou no privado (negociação registrada pelo Chat Balcões): as
 *  mensagens dele desde pouco antes da negociação, juntas para o leitor de passageiros, e o último link da LATAM
 *  (o pedido pronto). Só lê; nada é mandado. */
export async function dealBuyerData(userId: string, dealId: string) {
  const deal = await prisma.milesDeal.findFirst({ where: { id: dealId, userId }, select: { createdAt: true } });
  if (!deal) throw new DomainError(404, "Negociação não encontrada");
  // com o tempo real, a conversa sai do banco (quem postou o pedido e as mensagens dele), sem consultar o Telegram
  const dm = (await storedDealDm(userId, dealId)) ?? (await openDmFromDeal(userId, dealId));
  const d = await ownDm(userId, dm.id);
  const peer: TgPeer = { kind: "user", id: d.peerId, hash: d.peerHash };
  const since = new Date(deal.createdAt.getTime() - DEAL_CHAT_MARGIN_MS);
  const msgs = fromStore(d) ? await storedMessages({ dmId: d.id }, { limit: 100 }) : await guardSession(d.link, () => withPooled(d.link, (c) => c.messages(peer, { limit: 100 })));
  const theirs = msgs.filter((m) => !m.out && m.text.trim() && new Date(m.date) >= since);
  return { dmId: dm.id, contact: dm.name, since: since.toISOString(), messages: theirs.length, ...buyerDataFromMessages(theirs.map((m) => m.text)) };
}

/** Manda um texto no privado para quem está negociando (pedido do Chat Balcões), pela conta do grupo.
 *  attachTicket: manda também o bilhete (PDF) anexado à negociação, logo depois do texto. */
export async function sendDealDm(userId: string, dealId: string, raw: string, opts: { attachTicket?: boolean } = {}) {
  const dm = await openDmFromDeal(userId, dealId);
  const sent = await sendTelegramDm(userId, dm.id, raw);
  if (opts.attachTicket) {
    const ticket = await prisma.milesDealTicket.findUnique({ where: { dealId }, select: { name: true, mime: true, data: true } });
    if (ticket) await sendTelegramDmFile(userId, dm.id, { name: ticket.name, mime: ticket.mime, bytes: Buffer.from(ticket.data) }, "📄 Segue o bilhete da sua emissão.");
  }
  return sent;
}

/** Manda o termo de emissão (o texto que o usuário conferiu) no privado para quem está negociando e anota quando. */
export async function sendDealTerms(userId: string, dealId: string, raw: string) {
  await sendDealDm(userId, dealId, raw);
  return markDealTermsSent(userId, dealId);
}

async function ownDm(userId: string, dmId: string) {
  const d = await prisma.telegramDm.findFirst({ where: { id: dmId, userId }, include: { link: true } });
  if (!d) throw new DomainError(404, "Conversa não encontrada");
  if (d.link.status !== "ACTIVE") throw new DomainError(409, "A conta do Telegram desta conversa não está conectada");
  requireEnabled();
  return d;
}

/** Mensagens da conversa no privado (minId = só as novas; nada do que foi limpo no app). O pedido encaminhado do
 *  grupo vem lido, como no grupo. */
export async function dmMessages(userId: string, dmId: string, opts: { limit?: number; minId?: number; ids?: number[] } = {}) {
  const d = await ownDm(userId, dmId);
  const peer: TgPeer = { kind: "user", id: d.peerId, hash: d.peerHash };
  const minId = Math.max(opts.minId ?? 0, d.clearedUpTo ?? 0) || undefined;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const { msgs, readMax } = fromStore(d)
    ? {
        msgs: await storedMessages({ dmId: d.id }, { limit, minId, ids: opts.ids?.filter((id) => id > (d.clearedUpTo ?? 0)) }),
        // os checks de leitura: uma pergunta ao Telegram (os eventos de leitura chegam pelo tempo real depois)
        readMax: opts.ids ? undefined : await guardSession(d.link, () => withPooled(d.link, (c) => c.readOutboxMaxId(peer))).catch(() => 0),
      }
    : await guardSession(d.link, () => withPooled(d.link, async (c) => ({
        msgs: await c.messages(peer, { limit, minId }),
        readMax: await c.readOutboxMaxId(peer).catch(() => 0), // até onde a pessoa já leu as suas mensagens
      })));
  // pedido encaminhado: de qual mensagem do grupo veio (os antigos, sem o registro, só se for o pedido da contraproposta)
  const links = offerLinksOf(d.offerLinks);
  const offer = d.offer as DmOffer | null;
  const originOf = (m: TgMessage): DmOrigin | null => {
    const l = links.find((x) => x.fwdId === m.id);
    if (l) return { chatId: l.chatId, messageId: l.messageId };
    return offer && m.text.trim() === offer.text.trim() ? { chatId: offer.chatId, messageId: offer.messageId } : null;
  };
  const items = msgs.map((m) => (m.fwd && m.text ? { ...m, ad: parseBalcaoAd(m.text), alerts: [] as string[], origin: originOf(m) } : plain(m)));
  return { items, readMax };
}

/** De onde veio o pedido encaminhado para o privado: o grupo (no Chat Balcões) e a mensagem lá. */
export type DmOrigin = { chatId: string; messageId: number };
type OfferLink = DmOrigin & { fwdId: number };
/** Quantos pedidos encaminhados a conversa lembra (os mais novos). */
const MAX_OFFER_LINKS = 50;
const offerLinksOf = (v: Prisma.JsonValue | null): OfferLink[] =>
  (Array.isArray(v) ? v : []).filter((x): x is OfferLink => !!x && typeof x === "object" && typeof (x as OfferLink).fwdId === "number" && typeof (x as OfferLink).chatId === "string" && typeof (x as OfferLink).messageId === "number");

/**
 * Contraproposta no privado de quem postou o pedido, pela conta do grupo: encaminha o pedido para a conversa e manda
 * a contraproposta como resposta a ele (a pessoa vê no Telegram a que pedido é). Se o grupo não deixa encaminhar,
 * manda só a contraproposta. A conversa fica ligada ao pedido e a aba volta sozinha quando a pessoa responder.
 */
export async function sendOfferDm(userId: string, chatId: string, messageId: number, raw: string, adText = "") {
  const text = messageText(raw);
  const c = await ownChat(userId, chatId);
  const groupPeer = await chatPeer(c);
  const opened = await openTelegramDm(userId, chatId, messageId);
  const d = await ownDm(userId, opened.id);
  const peer: TgPeer = { kind: "user", id: d.peerId, hash: d.peerHash };
  let fwd: TgMessage | null = null;
  try {
    fwd = await guardSession(d.link, () => withPooled(d.link, (cl) => cl.forward(groupPeer, messageId, peer)));
  } catch (e) {
    // grupo que não deixa encaminhar (ou o pedido sumiu): segue só com a contraproposta
    if (!(e instanceof DomainError) || ![400, 403, 404].includes(e.status)) throw e;
  }
  const sent = await guardSession(d.link, () => withPooled(d.link, (cl) => cl.send(peer, text, fwd?.id)));
  const offer: DmOffer = { chatId, messageId, text: (fwd?.text || adText).slice(0, 1500), sender: d.name, group: c.title, cpmCents: parseCounterOffer(text), at: sent.date };
  const updated = await prisma.telegramDm.update({
    where: { id: d.id },
    data: {
      offer: offer as unknown as Prisma.InputJsonValue, offerAt: new Date(), closed: false, seenUpTo: sent.id,
      // o pedido encaminhado lembra de onde veio (botão "Ver no grupo" e as contrapropostas dos outros no privado)
      ...(fwd ? { offerLinks: [...offerLinksOf(d.offerLinks).filter((l) => l.fwdId !== fwd!.id), { fwdId: fwd.id, chatId, messageId }].slice(-MAX_OFFER_LINKS) as unknown as Prisma.InputJsonValue } : {}),
    },
    include: DM_INCLUDE,
  });
  return { dm: dmView(updated), forwarded: !!fwd, message: plain(sent) };
}

/** Até quantas conversas o app confere de uma vez (as com contraproposta mais recente primeiro). */
const UNREAD_MAX_DMS = 20;
/** Por quanto tempo depois da contraproposta a conversa fechada volta sozinha quando a pessoa responde. */
const OFFER_WATCH_MS = 3 * 24 * 3600_000;

/**
 * Mensagens não vistas no privado: as que a pessoa mandou depois da última vista no app (ou da sua contraproposta).
 * Conversa fechada com contraproposta recente volta a abrir quando a pessoa responde (reopened). Conversa aberta que
 * nunca foi vista no app não conta. Uma que falhar não derruba as outras.
 */
export async function dmUnread(userId: string) {
  requireEnabled();
  const since = new Date(Date.now() - OFFER_WATCH_MS);
  const dms = await prisma.telegramDm.findMany({
    where: { userId, link: { status: "ACTIVE" }, OR: [{ closed: false, seenUpTo: { not: null } }, { offerAt: { gte: since } }] },
    include: { link: true },
    orderBy: [{ offerAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: UNREAD_MAX_DMS,
  });
  const items = await Promise.all(dms.map(async (d) => {
    const from = Math.max(d.seenUpTo ?? 0, d.clearedUpTo ?? 0) || undefined;
    try {
      const msgs = fromStore(d)
        ? await storedMessages({ dmId: d.id }, { limit: 50, minId: from })
        : await guardSession(d.link, () => withPooled(d.link, (c) => c.messages({ kind: "user", id: d.peerId, hash: d.peerHash }, { limit: 50, minId: from })));
      const theirs = msgs.filter((m) => !m.out && (!d.offerAt || new Date(m.date) >= d.offerAt));
      if (!theirs.length) return d.closed ? null : { id: d.id, unread: 0, reopened: false, last: null, dm: dmView(d) };
      const reopened = d.closed;
      if (reopened) await prisma.telegramDm.update({ where: { id: d.id }, data: { closed: false } });
      const last = theirs.at(-1)!;
      return { id: d.id, unread: theirs.length, reopened, last: { id: last.id, text: last.text || (last.media ? `[${last.media}]` : ""), date: last.date }, dm: dmView(d) };
    } catch {
      return null;
    }
  }));
  return items.filter((x) => x != null);
}

/**
 * Mensagens não vistas em cada grupo: as dos outros depois da última vista no app (até 100; mais que isso, a tela
 * mostra 99+). Grupo nunca visto começa do zero a partir de agora. Um grupo que falhar não derruba os outros.
 */
export async function groupUnread(userId: string) {
  requireEnabled();
  const chats = await prisma.telegramGroup.findMany({ where: { userId, link: { status: "ACTIVE" } }, include: { link: true }, orderBy: { createdAt: "asc" } });
  const items = await Promise.all(chats.map(async (c) => {
    try {
      if (fromStore(c)) {
        // pelo banco: as dos outros depois da última vista (nunca visto: começa do zero a partir da mais nova)
        if (c.seenUpTo == null) {
          const last = await prisma.telegramMessage.findFirst({ where: { groupId: c.id }, orderBy: { msgId: "desc" }, select: { msgId: true } });
          if (last) await prisma.telegramGroup.update({ where: { id: c.id }, data: { seenUpTo: last.msgId } });
          return { id: c.id, unread: 0 };
        }
        const from = Math.max(c.seenUpTo, c.clearedUpTo ?? 0);
        return { id: c.id, unread: await prisma.telegramMessage.count({ where: { groupId: c.id, msgId: { gt: from }, out: false, deletedAt: null } }) };
      }
      const peer = await chatPeer(c);
      const from = Math.max(c.seenUpTo ?? 0, c.clearedUpTo ?? 0) || undefined;
      const msgs = await guardSession(c.link, () => withPooled(c.link, (cl) => cl.messages(peer, { limit: c.seenUpTo == null ? 1 : 100, minId: from })));
      if (c.seenUpTo == null) {
        // nunca visto: a mensagem mais nova vira o ponto de partida
        const last = msgs.at(-1)?.id;
        if (last) await prisma.telegramGroup.update({ where: { id: c.id }, data: { seenUpTo: last } });
        return { id: c.id, unread: 0 };
      }
      return { id: c.id, unread: msgs.filter((m) => !m.out).length };
    } catch {
      return null;
    }
  }));
  return items.filter((x) => x != null);
}

/** Marca o grupo como visto no app até a mensagem upTo (nunca volta para trás). */
export async function markGroupSeen(userId: string, chatId: string, upTo: number) {
  const c = await prisma.telegramGroup.findFirst({ where: { id: chatId, userId }, select: { seenUpTo: true } });
  if (!c) throw new DomainError(404, "Grupo não encontrado no Chat Balcões");
  if ((c.seenUpTo ?? 0) < upTo) await prisma.telegramGroup.update({ where: { id: chatId }, data: { seenUpTo: upTo } });
}

/** Marca a conversa como vista no app até a mensagem upTo (nunca volta para trás). */
export async function markDmSeen(userId: string, dmId: string, upTo: number) {
  const d = await prisma.telegramDm.findFirst({ where: { id: dmId, userId }, select: { seenUpTo: true } });
  if (!d) throw new DomainError(404, "Conversa não encontrada");
  if ((d.seenUpTo ?? 0) < upTo) await prisma.telegramDm.update({ where: { id: dmId }, data: { seenUpTo: upTo } });
}

/** Manda a mensagem no privado (escrita e enviada pelo usuário); replyTo = como resposta a uma mensagem da conversa. */
export async function sendTelegramDm(userId: string, dmId: string, raw: string, replyTo?: number) {
  const text = messageText(raw);
  const d = await ownDm(userId, dmId);
  return plain(await guardSession(d.link, () => withPooled(d.link, (c) => c.send({ kind: "user", id: d.peerId, hash: d.peerHash }, text, replyTo))));
}

/** Manda um arquivo no privado (ex.: o bilhete da emissão em PDF), com legenda opcional. */
export async function sendTelegramDmFile(userId: string, dmId: string, file: { name: string; mime: string; bytes: Buffer }, caption?: string) {
  const d = await ownDm(userId, dmId);
  return plain(await guardSession(d.link, () => withPooled(d.link, (c) => c.sendFile({ kind: "user", id: d.peerId, hash: d.peerHash }, file, caption))));
}

/** Baixa a foto ou o arquivo de uma mensagem da conversa no privado. */
export async function telegramDmMedia(userId: string, dmId: string, messageId: number) {
  const d = await ownDm(userId, dmId);
  return guardSession(d.link, () => withPooled(d.link, (c) => c.downloadMedia({ kind: "user", id: d.peerId, hash: d.peerHash }, messageId)));
}

/** Edita ou exclui (text null) uma mensagem sua na conversa no privado. */
export async function changeDmMessage(userId: string, dmId: string, messageId: number, raw: string | null) {
  const d = await ownDm(userId, dmId);
  const peer: TgPeer = { kind: "user", id: d.peerId, hash: d.peerHash };
  if (raw == null) {
    await guardSession(d.link, () => withPooled(d.link, (c) => c.remove(peer, messageId)));
    return null;
  }
  const text = messageText(raw);
  return plain(await guardSession(d.link, () => withPooled(d.link, (c) => c.edit(peer, messageId, text))));
}

/** Limpa a conversa no privado só no app (até a mensagem upTo; null = mostra tudo de novo). */
export async function clearDmChat(userId: string, dmId: string, upTo: number | null) {
  const { count } = await prisma.telegramDm.updateMany({ where: { id: dmId, userId }, data: { clearedUpTo: upTo } });
  if (!count) throw new DomainError(404, "Conversa não encontrada");
}

/** Fecha a conversa aqui (no Telegram ela continua). Com contraproposta recente, volta sozinha se a pessoa responder. */
export async function closeTelegramDm(userId: string, dmId: string) {
  const { count } = await prisma.telegramDm.updateMany({ where: { id: dmId, userId }, data: { closed: true } });
  if (!count) throw new DomainError(404, "Conversa não encontrada");
}

/** Aba Alertas: as mensagens recentes de todos os chats que dispararam algum alerta, da mais nova para a mais
 *  antiga. Um chat que falhar não derruba os outros (vai em errors). */
export async function alertFeed(userId: string) {
  requireEnabled();
  const chats = await prisma.telegramGroup.findMany({ where: { userId, link: { status: "ACTIVE" } }, orderBy: { createdAt: "asc" } });
  // alertas e contas lidos uma vez para todos os chats
  const rules = await activeAlerts(userId);
  const accounts = rules.some(hasProfitCriteria) ? await emissionAccounts(userId) : [];
  const results = await Promise.all(chats.map(async (c) => {
    try {
      const msgs = await chatMessages(userId, c.id, { limit: 100, rules, accounts });
      return { items: msgs.filter((m) => m.alerts.length).map((m) => ({ ...m, chatId: c.id, chat: c.title })), error: null };
    } catch (e) {
      return { items: [], error: { chatId: c.id, chat: c.title, erro: e instanceof DomainError ? e.message : "Não deu para ler este chat agora" } };
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
  prisma.telegramAlert.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: ALERT_SELECT });

export type AlertInput = { name?: string; words?: string[]; program?: string | null; maxCpfs?: number | null; minMiles?: number | null; maxMiles?: number | null; minCpmCents?: number | null; minProfitCents?: number | null; minProfitPerCpfCents?: number | null; active?: boolean };

/** Cria (id null) ou muda um alerta: pelo pedido de compra (programa, CPFs, milhas, milheiro) e/ou por palavras.
 *  Sem nome, o nome é o que ele pede. */
export async function saveTelegramAlert(userId: string, id: string | null, input: AlertInput) {
  const words = parseAlertWords((input.words ?? []).join(","));
  const criteria = {
    program: input.program || null, maxCpfs: input.maxCpfs ?? null, minMiles: input.minMiles ?? null, maxMiles: input.maxMiles ?? null, minCpmCents: input.minCpmCents ?? null,
    minProfitCents: input.minProfitCents ?? null, minProfitPerCpfCents: input.minProfitPerCpfCents ?? null,
  };
  const byAd = hasAdCriteria({ id: "", name: "", active: true, words, ...criteria });
  if (!byAd && !words.length) throw new DomainError(400, "Escolha o que o alerta procura: programa, CPFs, milhas, milheiro, lucro ou palavras");
  const name = input.name?.trim() || (byAd ? describeAlert({ words, ...criteria }) : words.join(" + "));
  if (!id) {
    if ((await prisma.telegramAlert.count({ where: { userId } })) >= MAX_TELEGRAM_ALERTS) throw new DomainError(409, `Limite de ${MAX_TELEGRAM_ALERTS} alertas`);
    await prisma.telegramAlert.create({ data: { userId, name, words, ...criteria, active: input.active ?? true } });
  } else {
    const { count } = await prisma.telegramAlert.updateMany({ where: { id, userId }, data: { name, words, ...criteria, ...(input.active !== undefined ? { active: input.active } : {}) } });
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
    // com o gateway, sai pela conexão dele (abrir outra com a mesma sessão derrubaria as duas)
    const gw = gatewayUrl();
    const out = gw ? withGateway(gw, l.id, (c) => c.logOut()) : withClient(decrypt(l.sessionEnc), (c) => c.logOut());
    await out.catch(() => {}); // já encerrada lá: só apaga aqui
  }
  await prisma.telegramLink.deleteMany({ where: { id, userId } });
  return telegramStatus(userId);
}
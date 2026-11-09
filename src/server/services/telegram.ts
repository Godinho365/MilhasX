// Telegram: o usuário conecta a própria conta (pela API oficial de clientes) para o app ler o grupo do balcão.
// O login é em etapas, uma por requisição: enviar o código → confirmar o código → (senha de duas etapas). Entre
// uma etapa e outra a sessão fica no banco, criptografada (ela dá acesso à conta). O app só lê: nunca envia nada.
// O servidor precisa de TELEGRAM_API_ID e TELEGRAM_API_HASH (my.telegram.org) e de CREDENTIALS_KEY.
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { computeCheck } from "telegram/Password";
import { LogLevel } from "telegram/extensions/Logger";
import { prisma, DomainError } from "../db";
import { encrypt, decrypt, credentialsEnabled } from "./accounts";

export type TgGroup = { id: string; title: string; channel: boolean };
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
  logOut(): Promise<void>;
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
        .map((d) => ({ id: String(d.id), title: d.title || "(sem nome)", channel: d.isChannel && !d.isGroup })),
    logOut: async () => { await c.invoke(new Api.auth.LogOut()); },
  };
}

let makeClient: (session: string) => TgClient = gramClient;
/** Só para os testes: troca o Telegram de verdade por um simulado (sem argumento, volta ao de verdade). */
export function setTelegramClientFactory(f?: (session: string) => TgClient) {
  makeClient = f ?? gramClient;
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

/** Número no formato do Telegram: +DDI e dígitos; sem "+" e com 10 ou 11 dígitos (DDD e número), é do Brasil. */
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (!raw.trim().startsWith("+") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  if (d.length < 11 || d.length > 15) throw new DomainError(400, "Número inválido: use o DDI, o DDD e o número (ex.: +55 11 99999-8888)");
  return `+${d}`;
}
/** Número com o meio escondido: +55 •••• 8888. */
export const maskPhone = (p: string) => `${p.slice(0, 3)} •••• ${p.slice(-4)}`;

async function link(userId: string) {
  return prisma.telegramLink.findUnique({ where: { userId } });
}
function requireEnabled() {
  if (!apiCredentials()) throw new DomainError(503, "Telegram desativado: defina TELEGRAM_API_ID e TELEGRAM_API_HASH no servidor");
  if (!credentialsEnabled()) throw new DomainError(503, "Telegram desativado: defina CREDENTIALS_KEY no servidor");
}

/** Situação da conexão para a tela. */
export async function telegramStatus(userId: string) {
  const l = await link(userId);
  return {
    enabled: telegramEnabled(),
    status: (l?.status ?? "NONE") as "NONE" | "CODE_SENT" | "PASSWORD_NEEDED" | "ACTIVE",
    phone: l ? maskPhone(l.phone) : null,
    codeViaApp: l?.codeViaApp ?? true,
    accountName: l?.accountName ?? null,
    group: l?.groupId ? { id: l.groupId, title: l.groupTitle ?? "" } : null,
  };
}

/** 1ª etapa: o Telegram manda o código (no app do Telegram ou por SMS). */
export async function startTelegramLogin(userId: string, rawPhone: string) {
  requireEnabled();
  const phone = normalizePhone(rawPhone);
  const current = await link(userId);
  if (current?.status === "ACTIVE") throw new DomainError(409, "Já há uma conta do Telegram conectada: desconecte antes de entrar com outra");
  const sent = await withClient("", async (c) => ({ ...(await c.sendCode(phone)), session: c.saveSession() }));
  const data = { sessionEnc: encrypt(sent.session), status: "CODE_SENT", phone, phoneCodeHash: sent.phoneCodeHash, codeViaApp: sent.viaApp, accountName: null, groupId: null, groupTitle: null };
  await prisma.telegramLink.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return telegramStatus(userId);
}

/** Login concluído: guarda a sessão já autorizada e o nome da conta. */
async function activate(userId: string, c: TgClient) {
  const accountName = await c.me();
  await prisma.telegramLink.update({ where: { userId }, data: { sessionEnc: encrypt(c.saveSession()), status: "ACTIVE", phoneCodeHash: null, accountName } });
}

/** 2ª etapa: o código. Com senha de duas etapas, falta a senha. */
export async function confirmTelegramCode(userId: string, rawCode: string) {
  requireEnabled();
  const l = await link(userId);
  if (l?.status !== "CODE_SENT" || !l.phoneCodeHash) throw new DomainError(409, "Peça o código primeiro");
  const code = rawCode.replace(/\D/g, "");
  if (!code) throw new DomainError(400, "Informe o código");
  await withClient(decrypt(l.sessionEnc), async (c) => {
    const r = await c.signIn(l.phone, l.phoneCodeHash!, code);
    if (r === "SIGN_UP_REQUIRED") throw new DomainError(400, "Este número não tem conta no Telegram");
    if (r === "PASSWORD_NEEDED") {
      await prisma.telegramLink.update({ where: { userId }, data: { sessionEnc: encrypt(c.saveSession()), status: "PASSWORD_NEEDED" } });
      return;
    }
    await activate(userId, c);
  });
  return telegramStatus(userId);
}

/** 3ª etapa (se a conta tiver): a senha de duas etapas. Ela não é guardada em lugar nenhum. */
export async function confirmTelegramPassword(userId: string, password: string) {
  requireEnabled();
  const l = await link(userId);
  if (l?.status !== "PASSWORD_NEEDED") throw new DomainError(409, "Esta etapa não pede senha");
  if (!password) throw new DomainError(400, "Informe a senha de duas etapas");
  await withClient(decrypt(l.sessionEnc), async (c) => {
    await c.checkPassword(password);
    await activate(userId, c);
  });
  return telegramStatus(userId);
}

/** Conta ativa: conecta com a sessão dela; sessão encerrada no app do Telegram desfaz a conexão aqui. */
async function withActive<T>(userId: string, fn: (c: TgClient) => Promise<T>) {
  requireEnabled();
  const l = await link(userId);
  if (l?.status !== "ACTIVE") throw new DomainError(409, "Conecte a sua conta do Telegram primeiro");
  try {
    return await withClient(decrypt(l.sessionEnc), fn);
  } catch (e) {
    if (!(e instanceof SessionEnded)) throw e;
    await prisma.telegramLink.deleteMany({ where: { userId } });
    throw new DomainError(409, "A conexão com o Telegram foi encerrada (pelo app do Telegram?): conecte de novo");
  }
}

/** Grupos e canais da conta, para escolher o do balcão. */
export const listTelegramGroups = (userId: string) => withActive(userId, (c) => c.groups());

/** Escolhe o grupo do balcão (precisa ser um dos grupos da conta). */
export async function chooseTelegramGroup(userId: string, groupId: string) {
  const g = (await listTelegramGroups(userId)).find((x) => x.id === groupId);
  if (!g) throw new DomainError(404, "Grupo não encontrado na sua conta do Telegram");
  await prisma.telegramLink.update({ where: { userId }, data: { groupId: g.id, groupTitle: g.title } });
  return telegramStatus(userId);
}

/** Desconecta: encerra a sessão no Telegram (some de Dispositivos) e apaga daqui. No meio do login, só cancela. */
export async function disconnectTelegram(userId: string) {
  const l = await link(userId);
  if (!l) return;
  if (l.status === "ACTIVE" && telegramEnabled()) {
    await withClient(decrypt(l.sessionEnc), (c) => c.logOut()).catch(() => {}); // já encerrada lá: só apaga aqui
  }
  await prisma.telegramLink.deleteMany({ where: { userId } });
}

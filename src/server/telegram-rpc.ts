// Chat Balcões em tempo real: o site não conecta no Telegram quando o gateway está ligado (TG_GATEWAY_URL). Ele pede
// ao gateway, pela rede interna do Docker, o que antes fazia pela conexão própria: ler o histórico, mandar, editar,
// apagar, encaminhar, baixar mídia... Assim cada sessão do Telegram tem uma conexão só (duas ao mesmo tempo com a
// mesma sessão derrubam a conexão: AUTH_KEY_DUPLICATED).
// O pedido leva um token derivado da CREDENTIALS_KEY (os dois lados têm a chave; nada novo para configurar). Arquivos
// (mandar e baixar) vão em base64 dentro do JSON.
import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "./db";
import type { TgClient } from "./services/telegram";

/** Endereço do gateway (vazio = o site conecta no Telegram sozinho, como antes; é o modo dos testes e do dev). */
export const gatewayUrl = () => process.env.TG_GATEWAY_URL?.trim().replace(/\/+$/, "") || "";

/** Token dos pedidos ao gateway: HMAC da CREDENTIALS_KEY (a chave em si nunca trafega). */
export function rpcToken() {
  const key = process.env.CREDENTIALS_KEY;
  if (!key) throw new DomainError(503, "Telegram desativado: defina CREDENTIALS_KEY no servidor");
  return createHmac("sha256", key).update("milhasx:tg-gateway:rpc:v1").digest("hex");
}
export function rpcTokenOk(got: string | null | undefined) {
  if (!got) return false;
  const want = Buffer.from(rpcToken());
  const have = Buffer.from(got);
  return have.length === want.length && timingSafeEqual(have, want);
}

/** O que o site pode pedir ao gateway (o login continua no site, com sessões que ainda não estão ativas). */
export const RPC_METHODS = ["me", "groups", "messages", "send", "edit", "remove", "forward", "author", "sendFile", "downloadMedia", "readOutboxMaxId", "logOut"] as const;
export type RpcMethod = (typeof RPC_METHODS)[number];

/** Erro como volta do gateway: DomainError (status e mensagem) ou erro do Telegram (o código e a espera pedida). */
export type RpcError = { domain?: { status: number; message: string }; errorMessage?: string; seconds?: number; message?: string };

/** Erro do Telegram vindo do gateway, no mesmo formato que o GramJS lança (o tgError do site traduz igual). */
export class RemoteTelegramError extends Error {
  constructor(public errorMessage: string, public seconds?: number) {
    super(errorMessage);
  }
}

const B64 = "__b64";
/** Buffer → { __b64: "..." } (e de volta), em qualquer lugar dos argumentos ou do resultado. */
export function encodeBytes(v: unknown): unknown {
  if (Buffer.isBuffer(v)) return { [B64]: v.toString("base64") };
  if (Array.isArray(v)) return v.map(encodeBytes);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeBytes(x)]));
  return v;
}
export function decodeBytes(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeBytes);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o[B64] === "string" && Object.keys(o).length === 1) return Buffer.from(o[B64] as string, "base64");
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodeBytes(x)]));
  }
  return v;
}

/** Converte o erro do gateway no erro que o site já sabe tratar. */
export function rpcErrorToThrow(e: RpcError): Error {
  if (e.domain) return new DomainError(e.domain.status, e.domain.message);
  if (e.errorMessage) return new RemoteTelegramError(e.errorMessage, e.seconds);
  return new DomainError(502, e.message || "O gateway do Telegram não respondeu direito: tente de novo");
}

/** Converte o erro lançado no gateway no formato que vai para o site. */
export function errorToRpc(e: unknown): RpcError {
  if (e instanceof DomainError) return { domain: { status: e.status, message: e.message } };
  if (e && typeof e === "object" && "errorMessage" in e) {
    const seconds = "seconds" in e ? Number((e as { seconds: unknown }).seconds) || undefined : undefined;
    return { errorMessage: String((e as { errorMessage: unknown }).errorMessage), seconds };
  }
  return { message: "Erro interno no gateway do Telegram" };
}

async function call(url: string, linkId: string, method: RpcMethod, args: unknown[]) {
  let res: Response;
  try {
    res = await fetch(`${url}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gateway-token": rpcToken() },
      body: JSON.stringify({ linkId, method, args: encodeBytes(args) }),
    });
  } catch {
    throw new DomainError(503, "O serviço do Telegram está fora do ar: tente de novo em instantes");
  }
  const j = (await res.json().catch(() => null)) as { ok: boolean; result?: unknown; error?: RpcError } | null;
  if (!j) throw new DomainError(502, "O serviço do Telegram respondeu errado: tente de novo");
  if (!j.ok) throw rpcErrorToThrow(j.error ?? {});
  return decodeBytes(j.result);
}

/** O Telegram de uma conta, pelo gateway. Conectar e fechar são do gateway; o login não passa por aqui. */
export function remoteClient(url: string, linkId: string): TgClient {
  const r = <T>(method: RpcMethod) => (...args: unknown[]) => call(url, linkId, method, args) as Promise<T>;
  const loginOnly = () => { throw new DomainError(500, "O login no Telegram não passa pelo gateway"); };
  return {
    connect: async () => {},
    close: async () => {},
    saveSession: loginOnly,
    sendCode: loginOnly,
    signIn: loginOnly,
    checkPassword: loginOnly,
    me: r("me"),
    groups: r("groups"),
    messages: r("messages"),
    send: r("send"),
    edit: r("edit"),
    remove: r("remove"),
    forward: r("forward"),
    author: r("author"),
    sendFile: r("sendFile"),
    downloadMedia: r("downloadMedia"),
    readOutboxMaxId: r("readOutboxMaxId"),
    logOut: r("logOut"),
  };
}

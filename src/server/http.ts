import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import type { User } from "@prisma/client";
import { DomainError, log } from "./db";
import { getUserByToken, SESSION_COOKIE } from "./auth";
import { resolveWorkspace, type WorkspaceUser } from "./workspace";
import { allowed, apiRequirement } from "@/domain/permissions";

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

export function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]!.trim() || req.headers.get("x-real-ip") || "local";

/** CSRF: em métodos que alteram estado, a origem precisa ser a própria aplicação. */
function checkOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // requisições sem Origin (ex.: testes, curl) dependem do cookie SameSite=Lax
  const allowed = new Set([new URL(req.url).origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  if (!allowed.has(origin)) throw new DomainError(403, "Origem não permitida");
}

/** O usuário das rotas: os dados são da conta da agência (o dono); `actor` é quem entrou (o dono ou um membro). */
export type SessionUser = WorkspaceUser;

/**
 * Sessão + conta da agência + permissão da rota. Para membro da equipe, a rota precisa estar liberada pela função
 * dele (GET = ver; o resto = editar); rota que não está no mapa de permissões é negada para membro.
 */
export async function requireUser(req: Request): Promise<SessionUser> {
  const person = await getUserByToken(readCookie(req, SESSION_COOKIE));
  if (!person) throw new DomainError(401, "Não autenticado");
  const ws = await resolveWorkspace(person);
  if (!ws) throw new DomainError(401, "Seu acesso à equipe foi encerrado: fale com o dono da conta");
  if (!ws.actor.isOwner && !allowed(apiRequirement(new URL(req.url).pathname, req.method), ws.actor.permissions, false)) {
    throw new DomainError(403, "Sua função na equipe não dá acesso a isto");
  }
  return ws;
}

/** A pessoa que entrou (para o que é dela: senha, nome, foto, sair). Membro com acesso encerrado não passa. */
export async function requireActor(req: Request): Promise<Omit<User, "avatar">> {
  const person = await getUserByToken(readCookie(req, SESSION_COOKIE));
  if (!person) throw new DomainError(401, "Não autenticado");
  if (!(await resolveWorkspace(person))) throw new DomainError(401, "Seu acesso à equipe foi encerrado: fale com o dono da conta");
  return person;
}

export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new DomainError(403, "Acesso restrito a administradores");
  return user;
}

/**
 * Lê o corpo binário (upload) parando com 413 assim que passar de `max` bytes: não confia no
 * Content-Length (um envio "chunked" não tem) e nunca guarda mais que o limite na memória.
 */
export async function readBodyLimited(req: Request, max: number, tooBig: string): Promise<Buffer> {
  if (Number(req.headers.get("content-length") || 0) > max) throw new DomainError(413, tooBig);
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new DomainError(413, tooBig);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function parseBody<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new DomainError(400, "JSON inválido");
  }
  return schema.parse(body);
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Envolve um handler: CSRF, erros de domínio/validação → respostas JSON, log sem dados sensíveis. */
export function route(fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      checkOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof DomainError) return json({ ok: false, erro: e.message }, e.status);
      if (e instanceof ZodError) {
        return json({ ok: false, erro: e.issues[0]?.message ?? "Dados inválidos", campos: e.flatten().fieldErrors }, 400);
      }
      log("error", "http.unhandled", { method: req.method, path: new URL(req.url).pathname, err: String(e) });
      return json({ ok: false, erro: "Erro interno" }, 500);
    }
  };
}

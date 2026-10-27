import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import type { User } from "@prisma/client";
import { DomainError, log } from "./db";
import { getUserByToken, SESSION_COOKIE } from "./auth";

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

export type SessionUser = Omit<User, "avatar">;

export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getUserByToken(readCookie(req, SESSION_COOKIE));
  if (!user) throw new DomainError(401, "Não autenticado");
  return user;
}

export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new DomainError(403, "Acesso restrito a administradores");
  return user;
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

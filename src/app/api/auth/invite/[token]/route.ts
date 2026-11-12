import { z } from "zod";
import { route, json, parseBody, sessionCookie } from "@/server/http";
import { DomainError } from "@/server/db";
import { acceptInvite, invitePreview } from "@/server/services/team-access";

const schema = z.object({ name: z.string().trim().min(1, "Informe o seu nome").max(120), password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(128) });

// Convite para a equipe (link de uso único): GET mostra de quem é o convite; POST cria o login e já entra
export const GET = route(async (_req, { params }) => {
  const item = await invitePreview((await params).token!);
  if (!item) throw new DomainError(410, "Este convite não vale mais: peça um novo ao dono da conta");
  return json({ ok: true, item }, 200, { "cache-control": "no-store", "referrer-policy": "no-referrer" });
});

export const POST = route(async (req, { params }) => {
  const b = await parseBody(req, schema);
  const { token, expiresAt } = await acceptInvite((await params).token!, b);
  return json({ ok: true }, 201, { "set-cookie": sessionCookie(token, expiresAt), "cache-control": "no-store" });
});

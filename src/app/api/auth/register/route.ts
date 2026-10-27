import { route, json, parseBody, sessionCookie } from "@/server/http";
import { registerSchema } from "@/server/schemas";
import { registerUser, createSession } from "@/server/auth";
import { isRegistrationOpen } from "@/server/services/admin";
import { DomainError } from "@/server/db";

export const POST = route(async (req) => {
  if (!(await isRegistrationOpen())) throw new DomainError(403, "Cadastro temporariamente fechado");
  const body = await parseBody(req, registerSchema);
  const user = await registerUser(body);
  const { token, expiresAt } = await createSession(user.id);
  return json({ ok: true, user: { id: user.id, name: user.name } }, 201, { "set-cookie": sessionCookie(token, expiresAt) });
});

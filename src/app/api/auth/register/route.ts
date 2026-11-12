import { route, json, parseBody, sessionCookie, clientIp } from "@/server/http";
import { registerSchema } from "@/server/schemas";
import { registerUser, createSession } from "@/server/auth";
import { verifyTurnstile } from "@/server/captcha";
import { isRegistrationOpen } from "@/server/services/admin";
import { DomainError } from "@/server/db";

export const POST = route(async (req) => {
  if (!(await isRegistrationOpen())) throw new DomainError(403, "Cadastro temporariamente fechado");
  const body = await parseBody(req, registerSchema);
  if (body.acceptTerms === false) throw new DomainError(400, "Aceite os Termos de Serviço e a Política de Privacidade");
  await verifyTurnstile(body.captcha, clientIp(req));
  const user = await registerUser(body);
  const { token, expiresAt } = await createSession(user.id);
  return json({ ok: true, user: { id: user.id, name: user.name } }, 201, { "set-cookie": sessionCookie(token, expiresAt) });
});

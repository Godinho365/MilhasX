import { route, json, parseBody, sessionCookie, clientIp } from "@/server/http";
import { registerSchema } from "@/server/schemas";
import { registerUser, createSession, validatePassword } from "@/server/auth";
import { verifyTurnstile } from "@/server/captcha";
import { isRegistrationOpen } from "@/server/services/admin";
import { consumeSignupCode, signupCodeRequired } from "@/server/services/email-code";
import { DomainError, prisma } from "@/server/db";

export const POST = route(async (req) => {
  if (!(await isRegistrationOpen())) throw new DomainError(403, "Cadastro temporariamente fechado");
  const body = await parseBody(req, registerSchema);
  if (body.acceptTerms === false) throw new DomainError(400, "Aceite os Termos de Serviço e a Política de Privacidade");
  if (signupCodeRequired()) {
    // A Cloudflare já foi conferida no envio do código; aqui vale o código mandado ao e-mail.
    // Confere o que pode falhar antes de gastar o código.
    validatePassword(body.password);
    if (await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true } })) {
      throw new DomainError(409, "E-mail já cadastrado");
    }
    await consumeSignupCode(body.email, body.code);
  } else {
    await verifyTurnstile(body.captcha, clientIp(req));
  }
  const user = await registerUser(body);
  const { token, expiresAt } = await createSession(user.id);
  return json({ ok: true, user: { id: user.id, name: user.name } }, 201, { "set-cookie": sessionCookie(token, expiresAt) });
});

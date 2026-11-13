import { route, json, parseBody, clientIp } from "@/server/http";
import { privacyRequestSchema } from "@/server/schemas";
import { createPrivacyRequest } from "@/server/services/privacy";
import { verifyTurnstile } from "@/server/captcha";

// Pedido de titular de dados (LGPD): sem login, pelo corpo da requisição (nada de dado pessoal no endereço),
// limitado por IP e, com o Turnstile configurado, com a verificação anti-robô.
export const POST = route(async (req) => {
  const b = await parseBody(req, privacyRequestSchema);
  if (b.website) return json({ ok: true, protocol: "" }, 201); // armadilha para robôs: finge que deu certo
  const ip = clientIp(req);
  await verifyTurnstile(b.captchaToken, ip);
  const r = await createPrivacyRequest({ name: b.name, email: b.email, kind: b.kind, message: b.message }, ip);
  return json({ ok: true, protocol: r.protocol }, 201);
});

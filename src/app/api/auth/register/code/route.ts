import { z } from "zod";
import { route, json, parseBody, clientIp } from "@/server/http";
import { verifyTurnstile } from "@/server/captcha";
import { isRegistrationOpen } from "@/server/services/admin";
import { CODE_MINUTES, RESEND_SECONDS, requestSignupCode } from "@/server/services/email-code";
import { DomainError } from "@/server/db";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(200),
  captcha: z.string().max(4096).optional(),
});

/** Cadastro, passo 1: confere a Cloudflare e manda o código de 6 dígitos para o e-mail. */
export const POST = route(async (req) => {
  if (!(await isRegistrationOpen())) throw new DomainError(403, "Cadastro temporariamente fechado");
  const body = await parseBody(req, schema);
  const ip = clientIp(req);
  await verifyTurnstile(body.captcha, ip);
  await requestSignupCode(body.email, ip, process.env.APP_NAME || "MilhasX");
  return json({ ok: true, minutes: CODE_MINUTES, resendSeconds: RESEND_SECONDS });
});

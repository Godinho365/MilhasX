import { route, json, parseBody } from "@/server/http";
import { forgotSchema } from "@/server/schemas";
import { requestPasswordReset } from "@/server/auth";
import { sendEmail } from "@/server/mailer";
import { brandFromEnv } from "@/server/emails/layout";
import { passwordResetEmail } from "@/server/emails/templates";
import { log } from "@/server/db";

export const POST = route(async (req) => {
  const { email } = await parseBody(req, forgotSchema);
  const token = await requestPasswordReset(email);
  if (token) {
    // Origem do link vem só da configuração; nunca do cabeçalho Host (evita "reset poisoning")
    const base = process.env.APP_URL;
    if (!base) log("error", "auth.forgot.app_url_missing");
    else await sendEmail(email, passwordResetEmail({ appName: brandFromEnv().appName, link: `${new URL(base).origin}/reset-password?token=${token}` }));
  }
  // Mesma resposta exista ou não a conta
  return json({ ok: true, mensagem: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." });
});

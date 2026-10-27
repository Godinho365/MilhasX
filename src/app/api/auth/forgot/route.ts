import { route, json, parseBody } from "@/server/http";
import { forgotSchema } from "@/server/schemas";
import { requestPasswordReset } from "@/server/auth";
import { sendMail } from "@/server/mailer";
import { log } from "@/server/db";

export const POST = route(async (req) => {
  const { email } = await parseBody(req, forgotSchema);
  const token = await requestPasswordReset(email);
  if (token) {
    // Origem do link vem só da configuração; nunca do cabeçalho Host (evita "reset poisoning")
    const base = process.env.APP_URL;
    if (!base) log("error", "auth.forgot.app_url_missing");
    else await sendMail(email, "Redefinição de senha", `Para criar uma nova senha, acesse (válido por 1 hora):\n${new URL(base).origin}/reset-password?token=${token}`);
  }
  // Mesma resposta exista ou não a conta
  return json({ ok: true, mensagem: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." });
});

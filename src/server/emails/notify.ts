import { log } from "../db";
import { sendEmail } from "../mailer";
import { brandFromEnv, type EmailContent } from "./layout";
import { googleLinkedEmail, passwordChangedEmail, welcomeEmail } from "./templates";

/**
 * E-mails que saem depois de uma ação da conta. Não seguram a resposta da requisição (o envio pelo
 * SMTP leva alguns segundos) e nunca derrubam a ação: falha vira log.
 */
type Who = { email: string; name: string };

function fire(to: string, build: (b: { appName: string; appUrl: string }) => EmailContent) {
  const b = brandFromEnv();
  if (!b.appUrl) {
    log("warn", "mail.skipped_no_app_url");
    return;
  }
  void sendEmail(to, build(b)).catch((e) => log("error", "mail.failed", { err: String(e) }));
}

export function notifyWelcome(u: Who & { trialEndsAt?: Date | null }) {
  const trialDays = u.trialEndsAt ? Math.round((u.trialEndsAt.getTime() - Date.now()) / 86_400_000) : 0;
  fire(u.email, (b) => welcomeEmail({ ...b, name: u.name, trialDays }));
}

export function notifyPasswordChanged(u: Who, viaReset: boolean) {
  fire(u.email, (b) => passwordChangedEmail({ ...b, name: u.name, when: new Date(), viaReset }));
}

export function notifyGoogleLinked(u: Who) {
  fire(u.email, (b) => googleLinkedEmail({ ...b, name: u.name, when: new Date() }));
}

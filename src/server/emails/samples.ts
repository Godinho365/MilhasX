import type { EmailBrand, EmailContent } from "./layout";
import * as t from "./templates";

/** Um exemplo de cada e-mail, com dados fictícios (prévia e teste de envio). */
export function sampleEmails(b: EmailBrand): EmailContent[] {
  const base = { appName: b.appName, appUrl: b.appUrl };
  const now = new Date();
  return [
    t.signupCodeEmail({ appName: b.appName, code: "482913", minutes: 10 }),
    t.welcomeEmail({ ...base, name: "Ana Souza", trialDays: 15 }),
    t.passwordResetEmail({ appName: b.appName, link: `${b.appUrl}/reset-password?token=exemplo` }),
    t.passwordChangedEmail({ ...base, name: "Ana Souza", when: now, viaReset: false }),
    t.googleLinkedEmail({ ...base, name: "Ana Souza", when: now }),
    t.trialEndingEmail({ ...base, name: "Ana Souza", endsAt: new Date(now.getTime() + 3 * 86_400_000), daysLeft: 3 }),
    t.trialEndingEmail({ ...base, name: "Ana Souza", endsAt: new Date(now.getTime() + 20 * 3_600_000), daysLeft: 1 }),
    t.teamInviteEmail({ appName: b.appName, name: "Carlos", agencyName: "Agência Exemplo", roleLabel: "Vendedor", link: `${b.appUrl}/convite/exemplo`, days: 7 }),
    t.holderAccessEmail({ appName: b.appName, name: "Maria", link: `${b.appUrl}/api/holder-access/exemplo`, hours: 24 }),
    t.signupRecoveryEmail({ appName: b.appName, link: `${b.appUrl}/register` }),
    t.accountFollowUpEmail({ ...base, name: "Ana Souza", reason: "request", plan: "Gestor" }),
    t.accountFollowUpEmail({ ...base, name: "Ana Souza", reason: "trial", days: 2 }),
  ];
}

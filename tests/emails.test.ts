import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import { prisma } from "@/server/db";
import { testOutbox } from "@/server/mailer";
import { renderEmail } from "@/server/emails/layout";
import { passwordResetEmail, signupCodeEmail, trialEndingEmail, welcomeEmail } from "@/server/emails/templates";
import { sendTrialReminders } from "@/server/emails/jobs";
import { changePassword, loginWithGoogle, registerUser, requestPasswordReset, resetPassword } from "@/server/auth";
import * as sendCode from "@/app/api/auth/register/code/route";

const brand = { appName: "MilhasX", appUrl: "https://gomilhasx.com", contactEmail: "contato@gomilhasx.com" };
const HOUR = 3_600_000;
const subjects = () => testOutbox.map((m) => m.subject);

beforeEach(async () => {
  await resetDb();
  testOutbox.length = 0;
  vi.stubEnv("APP_URL", "https://gomilhasx.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("modelo dos e-mails", () => {
  it("tem botão, link alternativo, rodapé com termos e versão em texto", () => {
    const r = renderEmail(passwordResetEmail({ appName: "MilhasX", link: "https://gomilhasx.com/reset-password?token=a&b" }), brand);
    expect(r.subject).toBe("Redefinição de senha do MilhasX");
    expect(r.html).toContain('href="https://gomilhasx.com/reset-password?token=a&amp;b"');
    expect(r.html).toContain("https://gomilhasx.com/termos");
    expect(r.html).toContain("https://gomilhasx.com/icon.png");
    expect(r.html).toContain("mailto:contato@gomilhasx.com");
    expect(r.html).toContain("<strong");
    expect(r.text).toContain("Criar nova senha: https://gomilhasx.com/reset-password?token=a&b");
    expect(r.text).not.toContain("**");
  });

  it("código em destaque e nome escapado", () => {
    const r = renderEmail(signupCodeEmail({ appName: "MilhasX", code: "042917", minutes: 10 }), brand);
    expect(r.subject).toBe("042917 é o seu código de verificação do MilhasX");
    expect(r.html).toContain(">042917</span>");
    const w = renderEmail(welcomeEmail({ appName: "MilhasX", appUrl: brand.appUrl, name: "<Ana> Souza", trialDays: 15 }), brand);
    expect(w.html).toContain("Olá, &lt;Ana&gt;!");
    expect(w.text).toContain("15 dias");
  });

  it("aviso do fim do teste: últimos dias e último dia", () => {
    const base = { appName: "MilhasX", appUrl: brand.appUrl, name: "Ana", endsAt: new Date("2026-11-27T15:00:00Z") };
    expect(trialEndingEmail({ ...base, daysLeft: 3 }).subject).toBe("Seu teste grátis no MilhasX termina em 3 dias");
    expect(trialEndingEmail({ ...base, daysLeft: 1 }).subject).toBe("Último dia do seu teste grátis no MilhasX");
    expect(renderEmail(trialEndingEmail({ ...base, daysLeft: 3 }), brand).text).toContain("27 de novembro");
  });
});

describe("e-mails da conta", () => {
  const input = { name: "Ana Souza", email: "ana@exemplo.test", password: "senha-forte-1", acceptTerms: true };

  it("boas-vindas no cadastro por e-mail e pelo Google", async () => {
    await registerUser(input);
    await loginWithGoogle({ sub: "g-1", email: "bia@exemplo.test", emailVerified: true, name: "Bia" }, { allowCreate: true });
    expect(testOutbox.map((m) => m.to)).toEqual(["ana@exemplo.test", "bia@exemplo.test"]);
    expect(subjects()).toEqual(["Boas-vindas ao MilhasX", "Boas-vindas ao MilhasX"]);
    expect(testOutbox[0]!.text).toContain("15 dias");
  });

  it("aviso quando uma conta Google é conectada a uma conta que já existe", async () => {
    await registerUser(input);
    testOutbox.length = 0;
    await loginWithGoogle({ sub: "g-2", email: input.email, emailVerified: true, name: "Ana" }, { allowCreate: true });
    await loginWithGoogle({ sub: "g-2", email: input.email, emailVerified: true, name: "Ana" }, { allowCreate: true });
    expect(subjects()).toEqual(["Conta Google conectada ao MilhasX"]);
  });

  it("aviso de senha alterada (troca na conta e pelo link)", async () => {
    const u = await registerUser(input);
    testOutbox.length = 0;
    await changePassword(u.id, input.password, "outra-senha-2");
    const token = (await requestPasswordReset(input.email))!;
    await resetPassword(token, "mais-uma-senha-3");
    expect(subjects()).toEqual(["Sua senha do MilhasX foi alterada", "Sua senha do MilhasX foi alterada"]);
    expect(testOutbox[1]!.text).toContain("encerramos as sessões");
  });

  it("código de verificação sai no modelo novo", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.exemplo.test");
    vi.stubEnv("SMTP_USER", "u@exemplo.test");
    vi.stubEnv("SMTP_PASS", "x");
    const r = await new Client().call(sendCode.POST, "POST", "/api/auth/register/code", { email: "cleo@exemplo.test" });
    expect(r.status).toBe(200);
    expect(testOutbox[0]!.subject).toMatch(/^\d{6} é o seu código de verificação do MilhasX$/);
    expect(testOutbox[0]!.html).toContain("Confirme o seu e-mail");
  });
});

describe("aviso do fim do teste grátis", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  async function user(email: string, endsInHours: number, extra: object = {}) {
    return prisma.user.create({
      data: { name: "Teste", email, passwordHash: "x", createdAt: new Date(now.getTime() - 14 * 24 * HOUR), trialEndsAt: new Date(now.getTime() + endsInHours * HOUR), ...extra },
    });
  }

  it("manda uma vez quando faltam 3 dias e outra no último dia", async () => {
    await user("a@exemplo.test", 60);
    expect(await sendTrialReminders(now)).toEqual({ sent: 1 });
    expect(await sendTrialReminders(now)).toEqual({ sent: 0 });
    expect(subjects()).toEqual(["Seu teste grátis no MilhasX termina em 3 dias"]);
    expect(await sendTrialReminders(new Date(now.getTime() + 40 * HOUR))).toEqual({ sent: 1 });
    expect(subjects()[1]).toBe("Último dia do seu teste grátis no MilhasX");
  });

  it("não manda para quem já assina, conta desativada, membro de equipe, teste longe ou já acabado", async () => {
    await user("pago@exemplo.test", 30, { plan: "PRO" });
    await user("off@exemplo.test", 30, { status: "DISABLED" });
    const owner = await user("dono@exemplo.test", 24 * 10);
    await user("membro@exemplo.test", 30, { workspaceOwnerId: owner.id });
    await user("acabou@exemplo.test", -2);
    expect(await sendTrialReminders(now)).toEqual({ sent: 0 });
  });

  it("respeita a preferência de e-mail da Assinatura, mas avisa no app", async () => {
    const u = await user("semmail@exemplo.test", 30);
    await prisma.userPreference.create({ data: { userId: u.id, notifications: { billing: { email: false } } } });
    expect(await sendTrialReminders(now)).toEqual({ sent: 0 });
    expect(testOutbox).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(1);
    await sendTrialReminders(now);
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(1);
  });
});

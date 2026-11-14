// Admin: e-mail mandado pelo próprio MilhasX (Leads "Sem conta", Recuperação e ficha do usuário), no lugar do mailto.
// Nada sai de verdade: no NODE_ENV=test o mailer guarda as mensagens em testOutbox.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as recoveryEmail from "@/app/api/admin/leads/recovery-email/route";
import * as userEmail from "@/app/api/admin/users/[id]/email/route";
import { createAdmin } from "../scripts/create-admin-lib";
import { prisma } from "@/server/db";
import { testOutbox } from "@/server/mailer";
import { renderEmail } from "@/server/emails/layout";
import { accountFollowUpEmail, signupRecoveryEmail } from "@/server/emails/templates";
import { leadRef } from "@/server/services/admin-email";
import { leadsData } from "@/server/services/admin-leads";
import { recoveryData } from "@/server/services/admin-dashboard";
import { emailSentState, signupRecoveryOpen } from "@/domain/admin-contact";

// Falha de envio simulada (SMTP fora do ar): o resto do mailer continua o de verdade
const mail = vi.hoisted(() => ({ fail: false }));
vi.mock("@/server/mailer", async (orig) => {
  const m = await orig<typeof import("@/server/mailer")>();
  return { ...m, sendEmail: vi.fn(async (...a: Parameters<typeof m.sendEmail>) => (mail.fail ? false : m.sendEmail(...a))) };
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LEAD = "lead.parado@x.test";
const brand = { appName: "MilhasX", appUrl: "https://gomilhasx.com", contactEmail: "contato@gomilhasx.com" };

let admin: Client, normal: Client, normalId: string;

const signupCode = (email: string, at = new Date()) =>
  prisma.emailCode.create({ data: { email, codeHash: "0".repeat(64), ip: "127.0.0.1", expiresAt: new Date(at.getTime() + 10 * 60_000), createdAt: at } });
const sendRecovery = (c: Client, codeId: string) => c.call(recoveryEmail.POST, "POST", "/api/admin/leads/recovery-email", { codeId });
const sendFollowUp = (c: Client, id: string, reason: string) => c.call(userEmail.POST, "POST", `/api/admin/users/${id}/email`, { reason }, { id });
const sentAudits = () => prisma.auditLog.findMany({ where: { action: "admin.contact" }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  await resetDb();
  testOutbox.length = 0;
  mail.fail = false;
  vi.stubEnv("APP_URL", "https://gomilhasx.com");
  vi.stubEnv("CONTACT_EMAIL", "contato@gomilhasx.com");
  await createAdmin({ email: "admin@x.test", name: "Admin", password: "senha-admin-123" });
  admin = new Client();
  expect((await admin.call(login.POST, "POST", "/l", { email: "admin@x.test", password: "senha-admin-123" })).status).toBe(200);
  normal = new Client();
  normalId = (await normal.call(register.POST, "POST", "/r", { name: "Nina Souza", email: "n@x.test", password: "senha-forte-1" })).data.user.id;
  testOutbox.length = 0; // o cadastro acima manda as boas-vindas
});
afterEach(() => vi.unstubAllEnvs());

describe("modelos e regras", () => {
  it("recuperação do cadastro: visual da marca, link para o cadastro e contato no rodapé", () => {
    const r = renderEmail(signupRecoveryEmail({ appName: "MilhasX", link: "https://gomilhasx.com/register?utm_source=email" }), brand);
    expect(r.subject).toBe("Falta pouco para concluir o seu cadastro no MilhasX");
    expect(r.html).toContain('href="https://gomilhasx.com/register?utm_source=email"');
    expect(r.html).toContain("Concluir meu cadastro");
    expect(r.html).toContain("mailto:contato@gomilhasx.com");
    expect(r.html).toContain("https://gomilhasx.com/privacidade");
    expect(r.text).toContain("Você recebeu este e-mail porque alguém começou um cadastro no MilhasX com este endereço e não concluiu.");
    expect(r.text).toContain("nenhuma conta foi criada");
  });

  it("acompanhamento da conta: texto de cada motivo e o teste que já acabou", () => {
    const t = (days: number | null) => accountFollowUpEmail({ ...brand, name: "Ana Souza", reason: "trial", days }).heading;
    expect(t(2)).toBe("Seu teste grátis acaba em 2 dias");
    expect(t(1)).toBe("Seu teste grátis acaba amanhã");
    expect(t(0)).toBe("Seu teste grátis acaba hoje");
    expect(t(-2)).toBe("Seu teste grátis acabou");
    const req = accountFollowUpEmail({ ...brand, name: "Ana Souza", reason: "request", plan: "Gestor" });
    expect(req.paragraphs[0]).toBe("Olá, Ana! Vimos que você pediu o plano **Gestor** e a ativação ainda não foi concluída.");
    expect(req.button!.url).toBe("https://gomilhasx.com/app/settings?tab=billing");
    expect(accountFollowUpEmail({ ...brand, name: "Ana", reason: "risk" }).button!.url).toBe("https://gomilhasx.com/app");
  });

  it("enviado em dd/mm, bloqueado por 24 h e cadastro parado há até 30 dias", () => {
    const at = new Date("2026-11-14T13:00:00Z"); // 10:00 em Brasília
    expect(emailSentState(null)).toBeNull();
    expect(emailSentState(at, new Date(at.getTime() + 23 * HOUR))).toEqual({ sentOn: "14/11", blocked: true, again: "15/11, 10:00" });
    expect(emailSentState(at, new Date(at.getTime() + 24 * HOUR))!.blocked).toBe(false);
    expect(signupRecoveryOpen(new Date(at.getTime() - 30 * DAY), at)).toBe(true);
    expect(signupRecoveryOpen(new Date(at.getTime() - 31 * DAY), at)).toBe(false);
  });
});

describe("e-mail de recuperação do lead sem conta", () => {
  it("só admin envia", async () => {
    const c = await signupCode(LEAD);
    expect((await sendRecovery(normal, c.id)).status).toBe(403);
    expect((await sendRecovery(new Client(), c.id)).status).toBe(401);
    expect(testOutbox).toHaveLength(0);
  });

  it("envia uma vez, registra na Auditoria sem o e-mail e bloqueia o reenvio por 24 h", async () => {
    const c = await signupCode(LEAD);
    const r = await sendRecovery(admin, c.id);
    expect(r.status).toBe(200);

    expect(testOutbox).toHaveLength(1);
    const m = testOutbox[0]!;
    expect(m.to).toBe(LEAD);
    expect(m.subject).not.toContain(LEAD);
    expect(m.html).toContain("https://gomilhasx.com/register?utm_source=email&amp;utm_medium=admin&amp;utm_campaign=recuperar-cadastro");
    expect(m.html).not.toContain(encodeURIComponent(LEAD)); // o link não leva o e-mail
    expect(m.html).toContain("mailto:contato@gomilhasx.com");

    const [a] = await sentAudits();
    expect(a).toMatchObject({ targetType: "Lead", targetId: leadRef(LEAD), meta: { channel: "email", reason: "signup", sent: true } });
    expect(JSON.stringify(a)).not.toContain("lead.parado");

    // segundo clique: bloqueado, nada sai
    const again = await sendRecovery(admin, c.id);
    expect(again.status).toBe(429);
    expect(again.data.erro).toMatch(/^E-mail já enviado em \d{2}\/\d{2}, \d{2}:\d{2}\. Dá para mandar de novo a partir de/);
    expect(testOutbox).toHaveLength(1);

    // a tela mostra o envio
    const d = await leadsData("30d", "unfinished");
    expect(d.list).toHaveLength(1);
    expect(d.list[0]).toMatchObject({ codeId: c.id, userId: null });
    expect(d.list[0]!.emailSentAt).toEqual(a!.createdAt);

    // passadas 24 h, libera de novo
    await prisma.auditLog.update({ where: { id: a!.id }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } });
    expect((await sendRecovery(admin, c.id)).status).toBe(200);
    expect(testOutbox).toHaveLength(2);
  });

  it("dois cliques ao mesmo tempo mandam um e-mail só", async () => {
    const c = await signupCode(LEAD);
    const rs = await Promise.all([sendRecovery(admin, c.id), sendRecovery(admin, c.id), sendRecovery(admin, c.id)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 429, 429]);
    expect(testOutbox).toHaveLength(1);
    expect(await sentAudits()).toHaveLength(1);
  });

  it("se o envio falhar, nada fica registrado e dá para tentar de novo", async () => {
    const c = await signupCode(LEAD);
    mail.fail = true;
    const r = await sendRecovery(admin, c.id);
    expect(r.status).toBe(503);
    expect(await sentAudits()).toHaveLength(0);
    mail.fail = false;
    expect((await sendRecovery(admin, c.id)).status).toBe(200);
    expect(await sentAudits()).toHaveLength(1);
  });

  it("recusa quem já tem conta, cadastro de mais de 30 dias e código que não existe", async () => {
    const done = await signupCode("n@x.test");
    expect((await sendRecovery(admin, done.id)).status).toBe(409);
    const old = await signupCode("antigo@x.test", new Date(Date.now() - 31 * DAY));
    const r = await sendRecovery(admin, old.id);
    expect(r.status).toBe(409);
    expect(r.data.erro).toContain("mais de 30 dias");
    expect((await sendRecovery(admin, "nao-existe")).status).toBe(404);
    expect(testOutbox).toHaveLength(0);
    expect(await sentAudits()).toHaveLength(0);
  });
});

describe("e-mail para quem já tem conta (Recuperação, Leads e ficha)", () => {
  it("manda a mensagem do motivo, conta como contato da Recuperação e bloqueia por 24 h", async () => {
    await prisma.user.update({ where: { id: normalId }, data: { trialEndsAt: new Date(Date.now() + 2 * DAY - HOUR) } });
    expect((await sendFollowUp(normal, normalId, "trial")).status).toBe(403);

    const r = await sendFollowUp(admin, normalId, "trial");
    expect(r.status).toBe(200);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]).toMatchObject({ to: "n@x.test", subject: "Seu teste grátis do MilhasX acaba em 2 dias" });
    expect(testOutbox[0]!.text).toContain("Olá, Nina!");

    const [a] = await sentAudits();
    expect(a).toMatchObject({ targetType: "User", targetId: normalId, meta: { channel: "email", reason: "trial", sent: true } });

    const item = (await recoveryData()).find((i) => i.userId === normalId)!;
    expect(item.kind).toBe("trial");
    expect(item.contact).toMatchObject({ channel: "email", sent: true });
    expect(item.emailSentAt).toEqual(a!.createdAt);

    expect((await sendFollowUp(admin, normalId, "trial")).status).toBe(429);
    expect(testOutbox).toHaveLength(1);
  });

  it("o mailto registrado não conta como e-mail enviado (não bloqueia)", async () => {
    await prisma.auditLog.create({ data: { action: "admin.contact", targetType: "User", targetId: normalId, meta: { channel: "email", reason: "risk" } } });
    expect((await sendFollowUp(admin, normalId, "risk")).status).toBe(200);
    expect(testOutbox[0]!.subject).toBe("Está tudo certo com a sua conta no MilhasX?");
  });

  it("recusa motivo sem mensagem pronta, conta desativada e quem pediu exclusão", async () => {
    expect((await sendFollowUp(admin, normalId, "generic")).status).toBe(400);
    await prisma.user.update({ where: { id: normalId }, data: { deletionRequestedAt: new Date() } });
    expect((await sendFollowUp(admin, normalId, "risk")).status).toBe(409);
    await prisma.user.update({ where: { id: normalId }, data: { deletionRequestedAt: null, status: "DISABLED" } });
    expect((await sendFollowUp(admin, normalId, "risk")).status).toBe(409);
    expect((await sendFollowUp(admin, "nao-existe", "risk")).status).toBe(404);
    expect(testOutbox).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as sendCode from "@/app/api/auth/register/code/route";
import { createSignupCode, consumeSignupCode, MAX_ATTEMPTS } from "@/server/services/email-code";
import { prisma } from "@/server/db";
import { cleanCode } from "@/app/(auth)/register/form";

const email = "ana@exemplo.test";
const creds = { name: "Ana Teste", email, password: "senha-forte-1", acceptTerms: true };

/** Liga o "SMTP" (o envio em si não acontece nos testes) para o cadastro exigir o código. */
function smtpOn() {
  vi.stubEnv("SMTP_HOST", "smtp.exemplo.test");
  vi.stubEnv("SMTP_USER", "naoresponda@exemplo.test");
  vi.stubEnv("SMTP_PASS", "x");
}

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

describe("código de verificação do e-mail", () => {
  it("gera 6 dígitos e grava só o hash", async () => {
    const code = await createSignupCode("ANA@exemplo.test", "1.1.1.1");
    expect(code).toMatch(/^\d{6}$/);
    const rec = await prisma.emailCode.findFirstOrThrow({ where: { email } });
    expect(rec.codeHash).not.toContain(code);
    expect(rec.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("aceita o código certo uma vez só", async () => {
    const code = await createSignupCode(email, "ip");
    await consumeSignupCode(email, ` ${code.slice(0, 3)}-${code.slice(3)} `);
    await expect(consumeSignupCode(email, code)).rejects.toThrow(/expirado|novo/);
  });

  it("conta as tentativas erradas e bloqueia depois do limite", async () => {
    const code = await createSignupCode(email, "ip");
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(consumeSignupCode(email, wrong)).rejects.toThrow(`Restam ${MAX_ATTEMPTS - 1} tentativas`);
    for (let i = 1; i < MAX_ATTEMPTS; i++) await consumeSignupCode(email, wrong).catch(() => {});
    await expect(consumeSignupCode(email, code)).rejects.toThrow(/Muitas tentativas/);
  });

  it("código vencido não vale", async () => {
    const code = await createSignupCode(email, "ip");
    await prisma.emailCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeSignupCode(email, code)).rejects.toThrow(/expirado/);
  });

  it("espera 60s para reenviar e o código novo invalida o anterior", async () => {
    const first = await createSignupCode(email, "ip");
    await expect(createSignupCode(email, "ip")).rejects.toThrow(/Aguarde \d+s/);
    await prisma.emailCode.updateMany({ data: { createdAt: new Date(Date.now() - 61_000) } });
    const second = await createSignupCode(email, "ip");
    if (first !== second) await expect(consumeSignupCode(email, first)).rejects.toThrow();
    await consumeSignupCode(email, second);
  });

  it("não manda código para e-mail que já tem conta", async () => {
    await new Client().call(register.POST, "POST", "/r", creds);
    await expect(createSignupCode(email, "ip")).rejects.toThrow(/já cadastrado/);
  });

  it("limpa o que a pessoa cola no campo", () => {
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("12-34-56-7")).toBe("123456");
  });
});

describe("cadastro com o e-mail configurado", () => {
  it("rota de envio responde com o tempo para reenviar", async () => {
    smtpOn();
    const r = await new Client().call(sendCode.POST, "POST", "/api/auth/register/code", { email });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, minutes: 10, resendSeconds: 60 });
    expect(await prisma.emailCode.count({ where: { email } })).toBe(1);
  });

  it("exige o código certo para criar a conta", async () => {
    smtpOn();
    const code = await createSignupCode(email, "ip");
    expect((await new Client().call(register.POST, "POST", "/r", creds)).status).toBe(400);
    expect((await new Client().call(register.POST, "POST", "/r", { ...creds, code: code === "999999" ? "000000" : "999999" })).status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
    const ok = await new Client().call(register.POST, "POST", "/r", { ...creds, code });
    expect(ok.status).toBe(201);
    expect(await prisma.user.count()).toBe(1);
  });

  it("senha inválida não gasta o código", async () => {
    smtpOn();
    const code = await createSignupCode(email, "ip");
    expect((await new Client().call(register.POST, "POST", "/r", { ...creds, password: "curta", code })).status).toBe(400);
    expect((await new Client().call(register.POST, "POST", "/r", { ...creds, code })).status).toBe(201);
  });

  it("sem e-mail configurado o cadastro segue sem código", async () => {
    expect((await new Client().call(register.POST, "POST", "/r", creds)).status).toBe(201);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as me from "@/app/api/auth/me/route";
import * as forgot from "@/app/api/auth/forgot/route";
import * as reset from "@/app/api/auth/reset/route";
import * as password from "@/app/api/auth/password/route";
import { requestPasswordReset } from "@/server/auth";
import { prisma } from "@/server/db";

beforeEach(resetDb);
const creds = { name: "Ana Teste", email: "ana@exemplo.test", password: "senha-forte-1" };

describe("cadastro e autenticação", () => {
  it("cadastra, entra, consulta /me e sai", async () => {
    const c = new Client();
    const r = await c.call(register.POST, "POST", "/api/auth/register", creds);
    expect(r.status).toBe(201);
    expect((await c.call(me.GET, "GET", "/api/auth/me")).data.user.email).toBe(creds.email);
    await c.call(logout.POST, "POST", "/api/auth/logout");
    expect((await c.call(me.GET, "GET", "/api/auth/me")).status).toBe(401);
    const l = await c.call(login.POST, "POST", "/api/auth/login", { email: "ANA@exemplo.test", password: creds.password });
    expect(l.status).toBe(200);
    expect((await c.call(me.GET, "GET", "/api/auth/me")).status).toBe(200);
  });

  it("guarda a senha só como hash", async () => {
    await new Client().call(register.POST, "POST", "/api/auth/register", creds);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(u.passwordHash).not.toContain(creds.password);
    expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("cadastro público nunca cria administrador", async () => {
    await new Client().call(register.POST, "POST", "/api/auth/register", { ...creds, role: "ADMIN" });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: creds.email } })).role).toBe("USER");
  });

  it("rejeita e-mail duplicado e senha curta", async () => {
    const c = new Client();
    await c.call(register.POST, "POST", "/api/auth/register", creds);
    expect((await new Client().call(register.POST, "POST", "/api/auth/register", creds)).status).toBe(409);
    expect((await new Client().call(register.POST, "POST", "/api/auth/register", { ...creds, email: "b@x.test", password: "123" })).status).toBe(400);
  });

  it("senha errada → 401 e bloqueio após tentativas excessivas", async () => {
    await new Client().call(register.POST, "POST", "/api/auth/register", creds);
    const c = new Client();
    for (let i = 0; i < 5; i++) {
      expect((await c.call(login.POST, "POST", "/api/auth/login", { email: creds.email, password: "errada" })).status).toBe(401);
    }
    const blocked = await c.call(login.POST, "POST", "/api/auth/login", creds);
    expect(blocked.status).toBe(429);
  });

  it("altera a senha exigindo a senha atual", async () => {
    const c = new Client();
    await c.call(register.POST, "POST", "/api/auth/register", creds);
    expect((await c.call(password.POST, "POST", "/api/auth/password", { current: "x", next: "nova-senha-123" })).status).toBe(400);
    expect((await c.call(password.POST, "POST", "/api/auth/password", { current: creds.password, next: "nova-senha-123" })).status).toBe(200);
    expect((await new Client().call(login.POST, "POST", "/api/auth/login", { email: creds.email, password: "nova-senha-123" })).status).toBe(200);
  });
});

describe("recuperação de senha", () => {
  it("responde igual para e-mail existente ou não", async () => {
    await new Client().call(register.POST, "POST", "/api/auth/register", creds);
    const a = await new Client().call(forgot.POST, "POST", "/api/auth/forgot", { email: creds.email });
    const b = await new Client().call(forgot.POST, "POST", "/api/auth/forgot", { email: "ninguem@x.test" });
    expect(a).toEqual(b);
  });

  it("redefine com token válido, encerra sessões e não reaproveita o token", async () => {
    const c = new Client();
    await c.call(register.POST, "POST", "/api/auth/register", creds);
    const token = (await requestPasswordReset(creds.email))!;
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);

    expect((await new Client().call(reset.POST, "POST", "/api/auth/reset", { token, password: "outra-senha-9" })).status).toBe(200);
    expect((await c.call(me.GET, "GET", "/api/auth/me")).status).toBe(401); // sessão antiga encerrada
    expect((await new Client().call(reset.POST, "POST", "/api/auth/reset", { token, password: "mais-uma-123" })).status).toBe(400);
    expect((await new Client().call(login.POST, "POST", "/api/auth/login", { email: creds.email, password: "outra-senha-9" })).status).toBe(200);
  });

  it("token expirado é rejeitado", async () => {
    await new Client().call(register.POST, "POST", "/api/auth/register", creds);
    const token = (await requestPasswordReset(creds.email))!;
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await new Client().call(reset.POST, "POST", "/api/auth/reset", { token, password: "outra-senha-9" })).status).toBe(400);
  });
});

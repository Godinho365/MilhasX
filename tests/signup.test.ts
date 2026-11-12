import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as googleStart from "@/app/api/auth/google/route";
import * as googleCallback from "@/app/api/auth/google/callback/route";
import { loginWithGoogle } from "@/server/auth";
import { prisma } from "@/server/db";
import { maskPhone } from "@/app/(auth)/register/form";

beforeEach(resetDb);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const creds = { name: "Ana Teste", email: "ana@exemplo.test", password: "senha-forte-1" };

describe("cadastro: telefone, termos e Cloudflare", () => {
  it("guarda o telefone só com dígitos e a data do aceite dos termos", async () => {
    const r = await new Client().call(register.POST, "POST", "/api/auth/register", { ...creds, phone: "(11) 98765-4321", acceptTerms: true });
    expect(r.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(u.phone).toBe("11987654321");
    expect(u.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("recusa telefone sem DDD e cadastro sem aceitar os termos", async () => {
    expect((await new Client().call(register.POST, "POST", "/r", { ...creds, phone: "98765" })).status).toBe(400);
    const r = await new Client().call(register.POST, "POST", "/r", { ...creds, acceptTerms: false });
    expect(r.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("com a chave do Turnstile, exige e confere o token na Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "segredo");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const ok = (init.body as URLSearchParams).get("response") === "token-bom";
      return new Response(JSON.stringify({ success: ok }));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await new Client().call(register.POST, "POST", "/r", creds)).status).toBe(400);
    expect((await new Client().call(register.POST, "POST", "/r", { ...creds, captcha: "token-ruim" })).status).toBe(400);
    expect((await new Client().call(register.POST, "POST", "/r", { ...creds, captcha: "token-bom", acceptTerms: true })).status).toBe(201);
    expect(fetchMock.mock.calls[0]![0]).toContain("challenges.cloudflare.com/turnstile");
  });

  it("máscara do telefone", () => {
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
    expect(maskPhone("1134567890")).toBe("(11) 3456-7890");
    expect(maskPhone("119")).toBe("(11) 9");
  });
});

describe("Continuar com Google", () => {
  const profile = { sub: "g-123", email: "Bia@Gmail.test", emailVerified: true, name: "Bia" };

  it("cria a conta na primeira vez e reutiliza depois", async () => {
    const a = await loginWithGoogle(profile, { allowCreate: true });
    expect(a.user.email).toBe("bia@gmail.test");
    expect(a.user.googleId).toBe("g-123");
    expect(a.user.termsAcceptedAt).toBeInstanceOf(Date);
    const b = await loginWithGoogle(profile, { allowCreate: true });
    expect(b.user.id).toBe(a.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("vincula a conta que já existe com o mesmo e-mail", async () => {
    await new Client().call(register.POST, "POST", "/r", { ...creds, email: "bia@gmail.test" });
    const r = await loginWithGoogle(profile, { allowCreate: true });
    expect(r.user.name).toBe("Ana Teste");
    expect(r.user.googleId).toBe("g-123");
  });

  it("recusa e-mail não verificado, cadastro fechado e conta desativada", async () => {
    await expect(loginWithGoogle({ ...profile, emailVerified: false }, { allowCreate: true })).rejects.toThrow(/verificado/);
    await expect(loginWithGoogle(profile, { allowCreate: false })).rejects.toThrow(/fechado/);
    const { user } = await loginWithGoogle(profile, { allowCreate: true });
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await expect(loginWithGoogle(profile, { allowCreate: true })).rejects.toThrow(/desativada/);
  });

  it("início manda para o Google com state em cookie; retorno com state errado não entra", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
    const start = await googleStart.GET(new Request("http://localhost:3100/api/auth/google?mode=signin"));
    expect(start.status).toBe(303);
    const loc = new URL(start.headers.get("location")!);
    expect(loc.host).toBe("accounts.google.com");
    expect(loc.searchParams.get("client_id")).toBe("cid");
    const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
    const bad = await googleCallback.GET(new Request("http://localhost:3100/api/auth/google/callback?code=x&state=errado", { headers: { cookie } }));
    expect(bad.headers.get("location")).toMatch(/^\/login\?erro=/);
    expect(bad.headers.get("set-cookie")).not.toContain("mm_session=");
  });

  it("cadastro com Google exige aceitar os termos", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
    const r = await googleStart.GET(new Request("http://localhost:3100/api/auth/google?mode=signup"));
    expect(r.headers.get("location")).toMatch(/^\/register\?erro=/);
  });

  it("retorno completo: troca o código, cria a sessão e vai para o app", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
    const start = await googleStart.GET(new Request("http://localhost:3100/api/auth/google?mode=signin"));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/token")
        ? new Response(JSON.stringify({ access_token: "at" }))
        : new Response(JSON.stringify({ sub: "g-9", email: "caio@gmail.test", email_verified: true, name: "Caio" })),
    ));
    const res = await googleCallback.GET(new Request(`http://localhost:3100/api/auth/google/callback?code=c&state=${state}`, { headers: { cookie } }));
    expect(res.headers.get("location")).toBe("/app");
    expect(res.headers.get("set-cookie")).toContain("mm_session=");
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "caio@gmail.test" } })).googleId).toBe("g-9");
  });
});

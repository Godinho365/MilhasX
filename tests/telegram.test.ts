// Telegram: login da conta em etapas (número → código → senha de duas etapas), grupo do balcão e desconectar.
// Usa um Telegram simulado: nada sai para o Telegram de verdade.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as tg from "@/app/api/telegram/route";
import * as tgLogin from "@/app/api/telegram/login/route";
import * as tgCode from "@/app/api/telegram/code/route";
import * as tgPassword from "@/app/api/telegram/password/route";
import * as tgGroups from "@/app/api/telegram/groups/route";
import { setTelegramClientFactory, normalizePhone, maskPhone, type TgClient } from "@/server/services/telegram";
import { decrypt } from "@/server/services/accounts";
import { prisma } from "@/server/db";

process.env.TELEGRAM_API_ID ||= "1";
process.env.TELEGRAM_API_HASH ||= "teste";
process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");

const rpc = (errorMessage: string) => Object.assign(new Error(errorMessage), { errorMessage });
let calls: string[] = [];
/** Telegram simulado: a sessão muda a cada etapa (s-code → s-2fa → s-ok); código certo 12345. */
function fake(opts: { password?: string; revoked?: boolean } = {}) {
  return (session: string): TgClient => {
    let s = session;
    return {
      connect: async () => {},
      close: async () => {},
      saveSession: () => s,
      sendCode: async (phone) => { calls.push(`sendCode ${phone}`); s = "s-code"; return { phoneCodeHash: "hash1", viaApp: true }; },
      signIn: async (_phone, hash, code) => {
        if (session !== "s-code" || hash !== "hash1") throw rpc("PHONE_CODE_HASH_EMPTY");
        if (code !== "12345") throw rpc("PHONE_CODE_INVALID");
        s = opts.password ? "s-2fa" : "s-ok";
        return opts.password ? "PASSWORD_NEEDED" : "OK";
      },
      checkPassword: async (pw) => {
        if (session !== "s-2fa") throw rpc("AUTH_KEY_UNREGISTERED");
        if (pw !== opts.password) throw rpc("PASSWORD_HASH_INVALID");
        s = "s-ok";
      },
      me: async () => "Rafa Godinho (@rafa)",
      groups: async () => {
        if (opts.revoked) throw rpc("AUTH_KEY_UNREGISTERED");
        if (session !== "s-ok") throw rpc("AUTH_KEY_UNREGISTERED");
        return [{ id: "-1001234", title: "Balcão de Milhas ASM", channel: false }, { id: "-1009999", title: "Promoções", channel: true }];
      },
      logOut: async () => { calls.push("logOut"); },
    };
  };
}

let c: Client;
let userId: string;
beforeEach(async () => {
  await resetDb();
  calls = [];
  setTelegramClientFactory(fake());
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});
afterAll(() => setTelegramClientFactory());

const status = async () => (await c.call(tg.GET, "GET", "/x")).data.item;

describe("Telegram", () => {
  it("número, DDI do Brasil e número escondido", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("+55 11 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("+1 202 555 0100")).toBe("+12025550100");
    expect(() => normalizePhone("1234")).toThrow(/Número inválido/);
    expect(maskPhone("+5511999998888")).toBe("+55 •••• 8888");
  });

  it("entra com código e senha de duas etapas, escolhe o grupo e desconecta", async () => {
    setTelegramClientFactory(fake({ password: "segredo" }));
    expect(await status()).toMatchObject({ enabled: true, status: "NONE", group: null });
    // código antes de pedir
    expect((await c.call(tgCode.POST, "POST", "/x", { code: "12345" })).status).toBe(409);

    const sent = await c.call(tgLogin.POST, "POST", "/x", { phone: "(11) 99999-8888" });
    expect([sent.status, sent.data.item]).toEqual([200, expect.objectContaining({ status: "CODE_SENT", phone: "+55 •••• 8888", codeViaApp: true })]);
    expect(calls).toEqual(["sendCode +5511999998888"]);
    // a sessão fica criptografada no banco
    const row = await prisma.telegramLink.findUniqueOrThrow({ where: { userId } });
    expect(row.sessionEnc).not.toContain("s-code");
    expect(decrypt(row.sessionEnc)).toBe("s-code");

    expect((await c.call(tgCode.POST, "POST", "/x", { code: "11111" })).data.erro).toMatch(/Código errado/);
    const code = await c.call(tgCode.POST, "POST", "/x", { code: "12 345" });
    expect(code.data.item.status).toBe("PASSWORD_NEEDED");
    expect((await c.call(tgPassword.POST, "POST", "/x", { password: "errada" })).data.erro).toMatch(/Senha de duas etapas errada/);
    const ok = await c.call(tgPassword.POST, "POST", "/x", { password: "segredo" });
    expect(ok.data.item).toMatchObject({ status: "ACTIVE", accountName: "Rafa Godinho (@rafa)" });
    expect(await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).toMatchObject({ phoneCodeHash: null });

    // grupos da conta; só um deles pode ser o do balcão
    const groups = await c.call(tgGroups.GET, "GET", "/x");
    expect(groups.data.items.map((g: { title: string }) => g.title)).toEqual(["Balcão de Milhas ASM", "Promoções"]);
    expect((await c.call(tgGroups.POST, "POST", "/x", { groupId: "-1005555" })).status).toBe(404);
    expect((await c.call(tgGroups.POST, "POST", "/x", { groupId: "-1001234" })).data.item.group).toEqual({ id: "-1001234", title: "Balcão de Milhas ASM" });

    // conectada: outro login só depois de desconectar
    expect((await c.call(tgLogin.POST, "POST", "/x", { phone: "11999998888" })).status).toBe(409);
    const out = await c.call(tg.DELETE, "DELETE", "/x");
    expect(out.data.item.status).toBe("NONE");
    expect(calls).toContain("logOut");
    expect(await prisma.telegramLink.count()).toBe(0);
  });

  it("sem senha de duas etapas entra direto; sessão encerrada no app do Telegram desfaz a conexão", async () => {
    await c.call(tgLogin.POST, "POST", "/x", { phone: "+55 11 99999-8888" });
    expect((await c.call(tgCode.POST, "POST", "/x", { code: "12345" })).data.item.status).toBe("ACTIVE");
    expect((await c.call(tgPassword.POST, "POST", "/x", { password: "x" })).status).toBe(409);

    setTelegramClientFactory(fake({ revoked: true }));
    const r = await c.call(tgGroups.GET, "GET", "/x");
    expect([r.status, r.data.erro]).toEqual([409, expect.stringMatching(/conecte de novo/)]);
    expect((await status()).status).toBe("NONE");
  });

  it("cancelar no meio do login apaga a sessão pendente, sem sair de nada no Telegram", async () => {
    await c.call(tgLogin.POST, "POST", "/x", { phone: "11999998888" });
    await c.call(tg.DELETE, "DELETE", "/x");
    expect(calls).toEqual(["sendCode +5511999998888"]);
    expect(await prisma.telegramLink.count()).toBe(0);
  });

  it("isola por usuário e exige o servidor configurado", async () => {
    await c.call(tgLogin.POST, "POST", "/x", { phone: "11999998888" });
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await o.call(tg.GET, "GET", "/x")).data.item.status).toBe("NONE");
    expect((await o.call(tgCode.POST, "POST", "/x", { code: "12345" })).status).toBe(409);
    expect((await o.call(tgGroups.GET, "GET", "/x")).status).toBe(409);

    const id = process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_ID;
    try {
      expect((await o.call(tg.GET, "GET", "/x")).data.item.enabled).toBe(false);
      expect((await o.call(tgLogin.POST, "POST", "/x", { phone: "11999998888" })).status).toBe(503);
    } finally {
      process.env.TELEGRAM_API_ID = id;
    }
  });
});

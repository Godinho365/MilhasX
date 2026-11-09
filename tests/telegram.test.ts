// Telegram: uma ou mais contas, login em etapas (número → código → senha de duas etapas), grupo do balcão de cada
// conta e desconectar. Usa um Telegram simulado: nada sai para o Telegram de verdade.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as accounts from "@/app/api/telegram/accounts/route";
import * as account from "@/app/api/telegram/accounts/[id]/route";
import * as codeRoute from "@/app/api/telegram/accounts/[id]/code/route";
import * as passwordRoute from "@/app/api/telegram/accounts/[id]/password/route";
import * as groupsRoute from "@/app/api/telegram/accounts/[id]/groups/route";
import { setTelegramClientFactory, normalizePhone, maskPhone, MAX_TELEGRAM_ACCOUNTS, type TgClient } from "@/server/services/telegram";
import { decrypt } from "@/server/services/accounts";
import { prisma } from "@/server/db";

process.env.TELEGRAM_API_ID ||= "1";
process.env.TELEGRAM_API_HASH ||= "teste";
process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");

const rpc = (errorMessage: string) => Object.assign(new Error(errorMessage), { errorMessage });
let calls: string[] = [];
/** Telegram simulado. Sessão "etapa:número" (code → 2fa → ok); código certo 12345; senha só nos números em
 *  `withPassword`; `revoked` = sessões encerradas pelo app do Telegram. */
function fake(opts: { withPassword?: string[]; revoked?: boolean } = {}) {
  return (session: string): TgClient => {
    let s = session;
    const phone = () => s.split(":")[1] ?? "";
    return {
      connect: async () => {},
      close: async () => {},
      saveSession: () => s,
      sendCode: async (p) => { calls.push(`sendCode ${p}`); s = `code:${p}`; return { phoneCodeHash: `hash${p.slice(-4)}`, viaApp: true }; },
      signIn: async (p, hash, code) => {
        if (s !== `code:${p}` || hash !== `hash${p.slice(-4)}`) throw rpc("PHONE_CODE_HASH_EMPTY");
        if (code !== "12345") throw rpc("PHONE_CODE_INVALID");
        const twoStep = opts.withPassword?.includes(p);
        s = `${twoStep ? "2fa" : "ok"}:${p}`;
        return twoStep ? "PASSWORD_NEEDED" : "OK";
      },
      checkPassword: async (pw) => {
        if (!s.startsWith("2fa:")) throw rpc("AUTH_KEY_UNREGISTERED");
        if (pw !== "segredo") throw rpc("PASSWORD_HASH_INVALID");
        s = `ok:${phone()}`;
      },
      me: async () => `Conta ${phone().slice(-4)}`,
      groups: async () => {
        if (opts.revoked || !s.startsWith("ok:")) throw rpc("AUTH_KEY_UNREGISTERED");
        return [{ id: "-1001234", title: "Balcão de Milhas ASM", channel: false }, { id: "-1005678", title: "Balcão Milhas VIP", channel: false }, { id: "-1009999", title: "Promoções", channel: true }];
      },
      logOut: async () => { calls.push(`logOut ${phone()}`); },
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

const status = async () => (await c.call(accounts.GET, "GET", "/x")).data.item;
const start = (phone: string) => c.call(accounts.POST, "POST", "/x", { phone });
const idOf = async (last4: string) => (await prisma.telegramLink.findFirstOrThrow({ where: { userId, phone: { endsWith: last4 } } })).id;

describe("Telegram", () => {
  it("número, DDI do Brasil e número escondido", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("+55 11 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("+1 202 555 0100")).toBe("+12025550100");
    expect(() => normalizePhone("1234")).toThrow(/Número inválido/);
    expect(maskPhone("+5511999998888")).toBe("+55 •••• 8888");
  });

  it("conecta duas contas ao mesmo tempo, cada uma com o seu grupo, e desconecta uma sem mexer na outra", async () => {
    setTelegramClientFactory(fake({ withPassword: ["+5521977776666"] }));
    expect(await status()).toEqual({ enabled: true, max: MAX_TELEGRAM_ACCOUNTS, accounts: [] });

    // as duas pedem código juntas
    expect((await start("(11) 99999-8888")).data.item.accounts).toEqual([expect.objectContaining({ status: "CODE_SENT", phone: "+55 •••• 8888", codeViaApp: true, accountName: null })]);
    expect((await start("21 97777-6666")).data.item.accounts.map((a: { phone: string }) => a.phone)).toEqual(["+55 •••• 8888", "+55 •••• 6666"]);
    expect(calls).toEqual(["sendCode +5511999998888", "sendCode +5521977776666"]);
    const [a, b] = [await idOf("8888"), await idOf("6666")];
    // a sessão fica criptografada no banco
    const row = await prisma.telegramLink.findUniqueOrThrow({ where: { id: a } });
    expect(row.sessionEnc).not.toContain("+5511999998888");
    expect(decrypt(row.sessionEnc)).toBe("code:+5511999998888");

    // conta A: código direto; conta B: código e senha de duas etapas
    expect((await c.call(codeRoute.POST, "POST", "/x", { code: "11111" }, { id: a })).data.erro).toMatch(/Código errado/);
    expect((await c.call(codeRoute.POST, "POST", "/x", { code: "12 345" }, { id: a })).data.item.accounts[0]).toMatchObject({ status: "ACTIVE", accountName: "Conta 8888" });
    expect((await c.call(codeRoute.POST, "POST", "/x", { code: "12345" }, { id: b })).data.item.accounts[1].status).toBe("PASSWORD_NEEDED");
    expect((await c.call(passwordRoute.POST, "POST", "/x", { password: "errada" }, { id: b })).data.erro).toMatch(/Senha de duas etapas errada/);
    expect((await c.call(passwordRoute.POST, "POST", "/x", { password: "segredo" }, { id: b })).data.item.accounts[1]).toMatchObject({ status: "ACTIVE", accountName: "Conta 6666" });
    expect(await prisma.telegramLink.count({ where: { userId, phoneCodeHash: null, status: "ACTIVE" } })).toBe(2);

    // cada conta com o seu grupo do balcão (só um dos grupos dela)
    expect((await c.call(groupsRoute.GET, "GET", "/x", undefined, { id: a })).data.items).toHaveLength(3);
    expect((await c.call(groupsRoute.POST, "POST", "/x", { groupId: "-1000001" }, { id: a })).status).toBe(404);
    await c.call(groupsRoute.POST, "POST", "/x", { groupId: "-1001234" }, { id: a });
    const both = (await c.call(groupsRoute.POST, "POST", "/x", { groupId: "-1005678" }, { id: b })).data.item.accounts;
    expect(both.map((x: { group: { title: string } }) => x.group.title)).toEqual(["Balcão de Milhas ASM", "Balcão Milhas VIP"]);

    // o mesmo número de novo não duplica
    expect((await start("+55 11 99999-8888")).status).toBe(409);
    // desconectar uma: encerra a sessão dela no Telegram; a outra continua
    const out = await c.call(account.DELETE, "DELETE", "/x", undefined, { id: a });
    expect(out.data.item.accounts).toEqual([expect.objectContaining({ id: b, status: "ACTIVE" })]);
    expect(calls).toContain("logOut +5511999998888");
    expect(calls).not.toContain("logOut +5521977776666");
  });

  it("sessão encerrada no app do Telegram tira só aquela conta; cancelar o login não sai de nada no Telegram", async () => {
    await start("11999998888");
    await c.call(codeRoute.POST, "POST", "/x", { code: "12345" }, { id: await idOf("8888") });
    await start("21977776666"); // ainda esperando o código
    setTelegramClientFactory(fake({ revoked: true }));
    const r = await c.call(groupsRoute.GET, "GET", "/x", undefined, { id: await idOf("8888") });
    expect([r.status, r.data.erro]).toEqual([409, expect.stringMatching(/\+55 •••• 8888.*conecte de novo/)]);
    expect((await status()).accounts).toEqual([expect.objectContaining({ phone: "+55 •••• 6666", status: "CODE_SENT" })]);

    await c.call(account.DELETE, "DELETE", "/x", undefined, { id: await idOf("6666") });
    expect(calls.filter((x) => x.startsWith("logOut"))).toEqual([]);
    expect(await prisma.telegramLink.count()).toBe(0);
  });

  it("limite de contas", async () => {
    for (let i = 0; i < MAX_TELEGRAM_ACCOUNTS; i++) expect((await start(`1199999${String(i).padStart(4, "0")}`)).status).toBe(200);
    const r = await start("11988887777");
    expect([r.status, r.data.erro]).toEqual([409, expect.stringMatching(/Limite de 10 contas/)]);
    // o mesmo número que está no meio do login recomeça (não conta como outra)
    expect((await start("11999990003")).status).toBe(200);
  });

  it("isola por usuário e exige o servidor configurado", async () => {
    await start("11999998888");
    const id = await idOf("8888");
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await o.call(accounts.GET, "GET", "/x")).data.item.accounts).toEqual([]);
    expect((await o.call(codeRoute.POST, "POST", "/x", { code: "12345" }, { id })).status).toBe(404);
    expect((await o.call(groupsRoute.GET, "GET", "/x", undefined, { id })).status).toBe(404);
    expect((await o.call(account.DELETE, "DELETE", "/x", undefined, { id })).status).toBe(404);
    // o outro usuário pode conectar o mesmo número na conta dele
    expect((await o.call(accounts.POST, "POST", "/x", { phone: "11999998888" })).status).toBe(200);

    const apiId = process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_ID;
    try {
      expect((await o.call(accounts.GET, "GET", "/x")).data.item.enabled).toBe(false);
      expect((await o.call(accounts.POST, "POST", "/x", { phone: "11999997777" })).status).toBe(503);
    } finally {
      process.env.TELEGRAM_API_ID = apiId;
    }
  });
});

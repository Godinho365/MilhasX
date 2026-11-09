// Telegram: uma ou mais contas, login em etapas (número → código → senha de duas etapas), grupo do balcão de cada
// conta e desconectar. Usa um Telegram simulado: nada sai para o Telegram de verdade.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as accounts from "@/app/api/telegram/accounts/route";
import * as account from "@/app/api/telegram/accounts/[id]/route";
import * as codeRoute from "@/app/api/telegram/accounts/[id]/code/route";
import * as passwordRoute from "@/app/api/telegram/accounts/[id]/password/route";
import * as groupsRoute from "@/app/api/telegram/accounts/[id]/groups/route";
import * as messagesRoute from "@/app/api/telegram/accounts/[id]/messages/route";
import * as alertsRoute from "@/app/api/telegram/alerts/route";
import * as alertRoute from "@/app/api/telegram/alerts/[id]/route";
import * as feedRoute from "@/app/api/telegram/alerts/feed/route";
import * as dmOpenRoute from "@/app/api/telegram/accounts/[id]/dms/route";
import * as dmsRoute from "@/app/api/telegram/dms/route";
import * as dmRoute from "@/app/api/telegram/dms/[id]/route";
import * as dmMessagesRoute from "@/app/api/telegram/dms/[id]/messages/route";
import * as msgRoute from "@/app/api/telegram/accounts/[id]/messages/[msgId]/route";
import * as dmMsgRoute from "@/app/api/telegram/dms/[id]/messages/[msgId]/route";
import * as holders from "@/app/api/holders/route";
import * as milesAccounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import { emissionAccounts } from "@/server/services/capacity";
import { emissionProfit } from "@/domain/balcao-ads";
import { setTelegramClientFactory, normalizePhone, maskPhone, MAX_TELEGRAM_ACCOUNTS, type TgClient, type TgMessage } from "@/server/services/telegram";
import { matchAlerts, parseAlertWords } from "@/domain/telegram-alerts";
import { decrypt } from "@/server/services/accounts";
import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";

process.env.TELEGRAM_API_ID ||= "1";
process.env.TELEGRAM_API_HASH ||= "teste";
process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");

const rpc = (errorMessage: string) => Object.assign(new Error(errorMessage), { errorMessage });
/** Mensagens dos grupos simulados (pelo id do grupo), da mais antiga para a mais nova. */
const msg = (id: number, hour: number, sender: string, text: string, media: string | null = null): TgMessage => ({ id, date: `2026-11-08T${String(hour).padStart(2, "0")}:00:00.000Z`, sender, text, media, out: false, fromUser: true, replyTo: null });
/** O que foi mandado pelo app (no grupo ou no privado), pelo id do chat. */
let SENT: Record<string, TgMessage[]> = {};
const MSGS: Record<string, TgMessage[]> = {
  "1234": [msg(1, 10, "Ana", "Compro 100k LATAM a R$ 25"), msg(2, 11, "Bia", "Bom dia, pessoal"), msg(3, 12, "Caio", "", "foto"), msg(4, 13, "Duda", "Vendo Smiles 50k")],
  "5678": [msg(10, 12, "Eva", "compro latam 30K urgente"), msg(11, 14, "Fábio", "Promoção Azul")],
};
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
        calls.push(`groups ${phone()}`);
        return [
          { id: "-1001234", title: "Balcão de Milhas ASM", channel: false, peer: { kind: "channel", id: "1234", hash: "h1" } },
          { id: "-1005678", title: "Balcão Milhas VIP", channel: false, peer: { kind: "channel", id: "5678", hash: "h2" } },
          { id: "-1009999", title: "Promoções", channel: true, peer: { kind: "channel", id: "9999", hash: "h3" } },
        ];
      },
      messages: async (peer, { limit, minId }) => {
        if (opts.revoked || !s.startsWith("ok:")) throw rpc("AUTH_KEY_UNREGISTERED");
        calls.push(`messages ${peer.id}`);
        return [...(MSGS[peer.id] ?? []), ...(SENT[peer.id] ?? [])].filter((m) => !minId || m.id > minId).slice(-limit);
      },
      send: async (peer, text, replyTo) => {
        if (opts.revoked || !s.startsWith("ok:")) throw rpc("AUTH_KEY_UNREGISTERED");
        calls.push(`send ${peer.kind}:${peer.id} ${text}${replyTo ? ` ↩${replyTo}` : ""}`);
        const m: TgMessage = { ...msg(100 + calls.length, 15, "Você", text), out: true, replyTo: replyTo ?? null };
        (SENT[peer.id] ??= []).push(m);
        return m;
      },
      edit: async (peer, id, text) => {
        const m = (SENT[peer.id] ?? []).find((x) => x.id === id);
        if (!m) throw rpc("MESSAGE_AUTHOR_REQUIRED");
        if (m.text === text) throw rpc("MESSAGE_NOT_MODIFIED");
        calls.push(`edit ${peer.kind}:${peer.id} #${id} ${text}`);
        m.text = text;
        return { ...m };
      },
      remove: async (peer, id) => {
        if (!(SENT[peer.id] ?? []).some((x) => x.id === id)) throw rpc("MESSAGE_DELETE_FORBIDDEN");
        calls.push(`remove ${peer.kind}:${peer.id} #${id}`);
        SENT[peer.id] = SENT[peer.id]!.filter((x) => x.id !== id);
      },
      author: async (group, messageId) => {
        const m = (MSGS[group.id] ?? []).find((x) => x.id === messageId);
        return m ? { id: `u-${m.sender}`, hash: `h-${m.sender}`, name: m.sender, username: null, self: false, bot: messageId === 11 } : null;
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
  SENT = {};
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

/** Conecta a conta (código 12345, sem senha) e escolhe o grupo; devolve o id da conta. */
async function connected(phone: string, groupId: string) {
  await start(phone);
  const id = await idOf(phone.slice(-4));
  await c.call(codeRoute.POST, "POST", "/x", { code: "12345" }, { id });
  await c.call(groupsRoute.POST, "POST", "/x", { groupId }, { id });
  return id;
}

describe("Chat Balcões", () => {
  it("alertas: todas as palavras, sem diferenciar maiúsculas e acentos; pausado não dispara", () => {
    expect(parseAlertWords(" latam, compro ,, LATAM\nurgente;30k")).toEqual(["latam", "compro", "urgente", "30k"]);
    const rules = [
      { id: "1", name: "Compra LATAM", words: ["latam", "compro"], active: true },
      { id: "2", name: "Promoção", words: ["promocao"], active: true },
      { id: "3", name: "Pausado", words: ["latam"], active: false },
    ];
    expect(matchAlerts("Compro 100k LATAM a R$ 25", rules)).toEqual(["Compra LATAM"]);
    expect(matchAlerts("Vendo LATAM", rules)).toEqual([]);
    expect(matchAlerts("PROMOÇÃO Azul", rules)).toEqual(["Promoção"]);
  });

  it("mensagens do grupo de cada conta, só as novas depois, com os alertas destacados", async () => {
    const a = await connected("11999998888", "-1001234");
    // o acesso direto ao grupo fica guardado ao escolher
    expect((await prisma.telegramLink.findUniqueOrThrow({ where: { id: a } })).groupPeer).toEqual({ kind: "channel", id: "1234", hash: "h1" });
    await c.call(alertsRoute.POST, "POST", "/x", { words: ["latam", "compro"] });

    const all = (await c.call(messagesRoute.GET, "GET", "/api/telegram/accounts/x/messages?limit=60", undefined, { id: a })).data.items;
    expect(all.map((m: { id: number }) => m.id)).toEqual([1, 2, 3, 4]);
    expect(all[0]).toMatchObject({ sender: "Ana", text: "Compro 100k LATAM a R$ 25", alerts: ["latam + compro"] });
    expect(all[2]).toMatchObject({ text: "", media: "foto", alerts: [] });
    const newer = (await c.call(messagesRoute.GET, "GET", "/api/telegram/accounts/x/messages?minId=2", undefined, { id: a })).data.items;
    expect(newer.map((m: { id: number }) => m.id)).toEqual([3, 4]);

    // conta que escolheu o grupo antes de existir o acesso direto: busca nos chats uma vez e guarda
    await prisma.telegramLink.update({ where: { id: a }, data: { groupPeer: Prisma.DbNull } });
    calls = [];
    await c.call(messagesRoute.GET, "GET", "/x", undefined, { id: a });
    await c.call(messagesRoute.GET, "GET", "/x", undefined, { id: a });
    expect(calls).toEqual(["groups +5511999998888", "messages 1234", "messages 1234"]);

    // sem grupo escolhido
    await start("21977776666");
    const b = await idOf("6666");
    await c.call(codeRoute.POST, "POST", "/x", { code: "12345" }, { id: b });
    expect((await c.call(messagesRoute.GET, "GET", "/x", undefined, { id: b })).data.erro).toMatch(/Escolha o grupo do balcão/);
  });

  it("cadastra, pausa e exclui alertas; a aba Alertas junta as mensagens de todos os chats", async () => {
    const a = await connected("11999998888", "-1001234");
    const b = await connected("21977776666", "-1005678");
    let r = await c.call(alertsRoute.POST, "POST", "/x", { name: "Compra LATAM", words: ["latam", " compro ", "LATAM"] });
    expect([r.status, r.data.items]).toEqual([201, [expect.objectContaining({ name: "Compra LATAM", words: ["latam", "compro"], active: true })]]);
    r = await c.call(alertsRoute.POST, "POST", "/x", { words: ["smiles"] });
    const [latam, smiles] = r.data.items;
    expect(smiles.name).toBe("smiles");
    expect((await c.call(alertsRoute.POST, "POST", "/x", { words: [] })).status).toBe(400);

    const feed = (await c.call(feedRoute.GET, "GET", "/x")).data;
    expect(feed.errors).toEqual([]);
    expect(feed.items.map((m: { chat: string; id: number; alerts: string[] }) => [m.chat, m.id, m.alerts])).toEqual([
      ["Balcão de Milhas ASM", 4, ["smiles"]],
      ["Balcão Milhas VIP", 10, ["Compra LATAM"]],
      ["Balcão de Milhas ASM", 1, ["Compra LATAM"]],
    ]);
    expect(feed.items[1].chatId).toBe(b);

    // pausar tira do feed; excluir some
    await c.call(alertRoute.PUT, "PUT", "/x", { name: latam.name, words: latam.words, active: false }, { id: latam.id });
    expect((await c.call(feedRoute.GET, "GET", "/x")).data.items.map((m: { id: number }) => m.id)).toEqual([4]);
    expect((await c.call(alertRoute.DELETE, "DELETE", "/x", undefined, { id: smiles.id })).data.items).toHaveLength(1);

    // um chat com a sessão encerrada não derruba a aba: aparece em errors
    await c.call(alertRoute.PUT, "PUT", "/x", { name: latam.name, words: latam.words, active: true }, { id: latam.id });
    await prisma.telegramLink.update({ where: { id: a }, data: { sessionEnc: (await prisma.telegramLink.findUniqueOrThrow({ where: { id: b } })).sessionEnc.replace(/./, "x") } });
    const partial = (await c.call(feedRoute.GET, "GET", "/x")).data;
    expect(partial.items.map((m: { id: number }) => m.id)).toEqual([10]);
    expect(partial.errors).toEqual([expect.objectContaining({ chatId: a, chat: "Balcão de Milhas ASM" })]);

    // de outro usuário: nada
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await o.call(alertsRoute.GET, "GET", "/x")).data.items).toEqual([]);
    expect((await o.call(alertRoute.DELETE, "DELETE", "/x", undefined, { id: latam.id })).status).toBe(404);
    expect((await o.call(messagesRoute.GET, "GET", "/x", undefined, { id: a })).status).toBe(404);
    expect((await o.call(feedRoute.GET, "GET", "/x")).data).toEqual({ ok: true, items: [], errors: [] });
  });
});

describe("alerta pelo pedido de compra (API)", () => {
  it("cria com programa e milheiro mínimo, com o nome descrevendo o pedido, e a mensagem traz o pedido lido", async () => {
    const a = await connected("11999998888", "-1001234");
    await connected("21977776666", "-1005678");
    const r = await c.call(alertsRoute.POST, "POST", "/x", { program: "LATAM", minCpmCents: 2000, maxCpfs: 2 });
    expect([r.status, r.data.items[0].name]).toEqual([201, "LATAM · até 2 CPFs · CPM a partir de R$ 20,00"]);
    expect((await c.call(alertsRoute.POST, "POST", "/x", { program: "Gol" })).status).toBe(400);
    expect((await c.call(alertsRoute.POST, "POST", "/x", { minMiles: 300_000, maxMiles: 100_000 })).status).toBe(400);
    // "compro latam 30K urgente" não tem preço: não passa no milheiro mínimo
    expect((await c.call(feedRoute.GET, "GET", "/x")).data.items.map((m: { id: number }) => m.id)).toEqual([1]);
    const msgs = (await c.call(messagesRoute.GET, "GET", "/x", undefined, { id: a })).data.items;
    expect(msgs[0].ad).toEqual({ kind: "COMPRA", program: "LATAM", miles: 100_000, cpfs: null, cpmCents: 2500 });
    expect(msgs[1].ad).toBeNull(); // conversa
  });
});

describe("mandar mensagem e conversar no privado", () => {
  it("manda no grupo, abre o privado com quem postou, conversa e fecha", async () => {
    const a = await connected("11999998888", "-1001234");
    // no grupo
    expect((await c.call(messagesRoute.POST, "POST", "/x", { text: "   " }, { id: a })).status).toBe(400);
    const sent = await c.call(messagesRoute.POST, "POST", "/x", { text: " Faço 24 " }, { id: a });
    expect([sent.status, sent.data.item]).toEqual([201, expect.objectContaining({ text: "Faço 24", sender: "Você", out: true })]);
    expect(calls).toContain("send channel:1234 Faço 24");
    expect((await c.call(messagesRoute.GET, "GET", "/x", undefined, { id: a })).data.items.at(-1)).toMatchObject({ text: "Faço 24", out: true, replyTo: null });
    // contraproposta: resposta ao pedido
    const offer = await c.call(messagesRoute.POST, "POST", "/x", { text: "24,50", replyTo: 1 }, { id: a });
    expect([offer.status, offer.data.item.replyTo]).toEqual([201, 1]);
    expect(calls).toContain("send channel:1234 24,50 ↩1");
    expect((await c.call(messagesRoute.POST, "POST", "/x", { text: "24,50", replyTo: -3 }, { id: a })).status).toBe(400);

    // chamar no privado quem mandou o pedido; abrir de novo não duplica
    const dm = (await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 1 }, { id: a })).data.item;
    expect(dm).toMatchObject({ name: "Ana", via: "Conta 8888", group: "Balcão de Milhas ASM" });
    expect((await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 1 }, { id: a })).data.item.id).toBe(dm.id);
    expect(await prisma.telegramDm.findUniqueOrThrow({ where: { id: dm.id } })).toMatchObject({ peerId: "u-Ana", peerHash: "h-Ana" });
    expect((await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 999 }, { id: a })).data.erro).toMatch(/não é de uma pessoa/);

    // conversa no privado
    expect((await c.call(dmMessagesRoute.GET, "GET", "/x", undefined, { id: dm.id })).data.items).toEqual([]);
    expect((await c.call(dmMessagesRoute.POST, "POST", "/x", { text: "Oi! Tenho LATAM" }, { id: dm.id })).status).toBe(201);
    expect(calls).toContain("send user:u-Ana Oi! Tenho LATAM");
    expect((await c.call(dmMessagesRoute.GET, "GET", "/x", undefined, { id: dm.id })).data.items).toEqual([expect.objectContaining({ text: "Oi! Tenho LATAM", out: true, ad: null, alerts: [] })]);
    expect((await c.call(dmsRoute.GET, "GET", "/x")).data.items).toHaveLength(1);

    // outro usuário não vê nem manda
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await o.call(dmMessagesRoute.GET, "GET", "/x", undefined, { id: dm.id })).status).toBe(404);
    expect((await o.call(dmMessagesRoute.POST, "POST", "/x", { text: "x" }, { id: dm.id })).status).toBe(404);
    expect((await o.call(messagesRoute.POST, "POST", "/x", { text: "x" }, { id: a })).status).toBe(404);
    expect((await o.call(dmRoute.DELETE, "DELETE", "/x", undefined, { id: dm.id })).status).toBe(404);

    // fechar aqui; desconectar a conta leva as conversas dela
    expect((await c.call(dmRoute.DELETE, "DELETE", "/x", undefined, { id: dm.id })).status).toBe(200);
    expect((await c.call(dmsRoute.GET, "GET", "/x")).data.items).toEqual([]);
    await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 2 }, { id: a });
    await c.call(account.DELETE, "DELETE", "/x", undefined, { id: a });
    expect(await prisma.telegramDm.count()).toBe(0);
  });

  it("não abre privado com robô do grupo", async () => {
    const b = await connected("21977776666", "-1005678");
    expect((await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 11 }, { id: b })).data.erro).toMatch(/robô/);
    expect((await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 10 }, { id: b })).status).toBe(201);
  });
});

describe("editar e excluir a sua mensagem", () => {
  it("edita e exclui a sua contraproposta no grupo e a sua mensagem no privado; a dos outros não", async () => {
    const a = await connected("11999998888", "-1001234");
    const offer = (await c.call(messagesRoute.POST, "POST", "/x", { text: "27", replyTo: 1 }, { id: a })).data.item;
    const edited = await c.call(msgRoute.PATCH, "PATCH", "/x", { text: "26,50" }, { id: a, msgId: String(offer.id) });
    expect([edited.status, edited.data.item]).toEqual([200, expect.objectContaining({ id: offer.id, text: "26,50", replyTo: 1 })]);
    expect((await c.call(msgRoute.PATCH, "PATCH", "/x", { text: "26,50" }, { id: a, msgId: String(offer.id) })).data.erro).toMatch(/ficou igual/);
    // mensagem de outra pessoa
    expect((await c.call(msgRoute.PATCH, "PATCH", "/x", { text: "x" }, { id: a, msgId: "1" })).status).toBe(403);
    expect((await c.call(msgRoute.DELETE, "DELETE", "/x", undefined, { id: a, msgId: "1" })).status).toBe(403);
    expect((await c.call(msgRoute.DELETE, "DELETE", "/x", undefined, { id: a, msgId: "abc" })).status).toBe(400);
    expect((await c.call(msgRoute.DELETE, "DELETE", "/x", undefined, { id: a, msgId: String(offer.id) })).status).toBe(200);
    expect(calls).toEqual(expect.arrayContaining([`edit channel:1234 #${offer.id} 26,50`, `remove channel:1234 #${offer.id}`]));
    expect((await c.call(messagesRoute.GET, "GET", "/x", undefined, { id: a })).data.items.some((m: { id: number }) => m.id === offer.id)).toBe(false);

    // no privado
    const dm = (await c.call(dmOpenRoute.POST, "POST", "/x", { messageId: 1 }, { id: a })).data.item;
    const sent = (await c.call(dmMessagesRoute.POST, "POST", "/x", { text: "Oi" }, { id: dm.id })).data.item;
    expect((await c.call(dmMsgRoute.PATCH, "PATCH", "/x", { text: "Oi, Ana!" }, { id: dm.id, msgId: String(sent.id) })).data.item.text).toBe("Oi, Ana!");
    expect((await c.call(dmMsgRoute.DELETE, "DELETE", "/x", undefined, { id: dm.id, msgId: String(sent.id) })).status).toBe(200);
    // outro usuário não mexe
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await o.call(msgRoute.DELETE, "DELETE", "/x", undefined, { id: a, msgId: "1" })).status).toBe(404);
    expect((await o.call(dmMsgRoute.PATCH, "PATCH", "/x", { text: "x" }, { id: dm.id, msgId: "1" })).status).toBe(404);
  });
});

describe("contas para emitir os pedidos (lucro)", () => {
  it("saldo livre sem o reservado em negociações abertas e custo médio do milheiro", async () => {
    const p = await seedPrograms();
    const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
    const lat = (await c.call(milesAccounts.POST, "POST", "/a", { holderId: h, programId: p.latam.id })).data.item.id;
    await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 100_000, occurredAt: "2026-11-01", costs: [{ type: "PONTOS", amountCents: 200_000 }] });
    await prisma.milesDeal.create({ data: { userId, number: 1, buyerType: "BALCAO", customerName: "Balcão", stage: "NEGOTIATION", accountId: lat, points: 30_000 } });
    // conta sem saldo não entra
    await c.call(milesAccounts.POST, "POST", "/a", { holderId: h, programId: p.livelo.id });
    const accs = await emissionAccounts(userId);
    expect(accs).toEqual([expect.objectContaining({ id: lat, programCode: "LATAM", available: 70_000, costCpmCents: 2000 })]);
    // lucro do pedido "Compro 50k LATAM 1 CPF 25" pela conta: 50 × (25 − 20) = R$ 250
    expect(emissionProfit({ program: "LATAM", miles: 50_000, cpfs: 1 }, 2500, accs)).toMatchObject({ accountId: lat, profitCents: 25_000, perCpfCents: 25_000, costCpmCents: 2000, leftoverMiles: 20_000, leftoverCostCents: 40_000, cpfLeft: accs[0]!.cpfFree == null ? null : accs[0]!.cpfFree - 1 });
    // 2 CPFs: o lucro por CPF é a metade
    expect(emissionProfit({ program: "LATAM", miles: 50_000, cpfs: 2 }, 2500, accs)).toMatchObject({ profitCents: 25_000, perCpfCents: 12_500 });
    // não cabe no saldo livre: nada
    expect(emissionProfit({ program: "LATAM", miles: 80_000, cpfs: 1 }, 2500, accs)).toBeNull();
  });
});

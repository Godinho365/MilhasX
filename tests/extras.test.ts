import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as suppliers from "@/app/api/suppliers/route";
import * as supplierAccounts from "@/app/api/supplier-accounts/route";
import * as supplierAccount from "@/app/api/supplier-accounts/[id]/route";
import * as cards from "@/app/api/cards/route";
import * as invoices from "@/app/api/cards/[id]/invoices/route";
import * as invoiceClose from "@/app/api/invoices/[id]/close/route";
import * as invoice from "@/app/api/invoices/[id]/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as summary from "@/app/api/summary/route";
import * as alerts from "@/app/api/alerts/route";
import * as notifications from "@/app/api/notifications/route";
import * as promotions from "@/app/api/promotions/route";
import * as adminPromotions from "@/app/api/admin/promotions/route";
import * as adminGuides from "@/app/api/admin/guides/route";
import * as adminNews from "@/app/api/admin/news/route";
import * as news from "@/app/api/news/route";
import * as newsRead from "@/app/api/news/read/route";
import * as avatar from "@/app/api/me/avatar/route";
import * as preferences from "@/app/api/preferences/route";
import * as login from "@/app/api/auth/login/route";
import { expectedCardPoints, detectImage } from "@/server/services/extras";
import { createAdmin } from "../scripts/create-admin-lib";
import { prisma } from "@/server/db";

let a: Client, b: Client, admin: Client;
let p: Awaited<ReturnType<typeof seedPrograms>>;
let accA: string;
const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  await resetDb();
  p = await seedPrograms();
  a = new Client();
  b = new Client();
  await a.call(register.POST, "POST", "/r", { name: "Ana", email: "a@x.test", password: "senha-forte-1" });
  await b.call(register.POST, "POST", "/r", { name: "Bia", email: "b@x.test", password: "senha-forte-1" });
  const h = (await a.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  accA = (await a.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.livelo.id })).data.item.id;
  await createAdmin({ email: "adm@x.test", name: "Adm", password: "senha-admin-123" });
  admin = new Client();
  await admin.call(login.POST, "POST", "/l", { email: "adm@x.test", password: "senha-admin-123" });
});

describe("fornecedores", () => {
  it("cria fornecedor e conta; outro usuário não vê nem altera", async () => {
    const s = await a.call(suppliers.POST, "POST", "/s", { name: "Forn", contact: "x" });
    expect(s.status).toBe(201);
    const acc = await a.call(supplierAccounts.POST, "POST", "/sa", { supplierId: s.data.item.id, programId: p.latam.id, balance: 50000, priceCpmCents: 1900 });
    expect(acc.status).toBe(201);
    const body = { supplierId: s.data.item.id, programId: p.latam.id, balance: 1, priceCpmCents: 1 };
    expect((await b.call(supplierAccounts.GET, "GET", "/sa")).data.items).toHaveLength(0);
    expect((await b.call(supplierAccounts.POST, "POST", "/sa", body)).status).toBe(404);
    expect((await b.call(supplierAccount.PATCH, "PATCH", "/x", body, { id: acc.data.item.id })).status).toBe(404);
    expect((await b.call(supplierAccount.DELETE, "DELETE", "/x", undefined, { id: acc.data.item.id })).status).toBe(404);
  });
});

describe("cartões e faturas", () => {
  it("estima pontos pela cotação", () => {
    expect(expectedCardPoints(450000, 220, 550)).toBe(1800); // R$ 4.500 / 5,50 = US$ 818,18 × 2,2
  });

  it("fechar fatura cria pontos a receber; excluir fatura remove o lançamento", async () => {
    const c = await a.call(cards.POST, "POST", "/c", { accountId: accA, name: "Black", pointsPerDollar: 220, dollarRateCents: 550, closingDay: 3, dueDay: 10 });
    expect(c.status).toBe(201);
    const inv = await a.call(invoices.POST, "POST", "/i", { closingDate: "2026-10-03", dueDate: "2026-10-10", amountCents: 450000 }, { id: c.data.item.id });
    expect(inv.status).toBe(201);
    expect(inv.data.item.expectedPoints).toBe(1800);
    expect((await a.call(invoices.POST, "POST", "/i", { closingDate: "2026-11-10", dueDate: "2026-11-03", amountCents: 100 }, { id: c.data.item.id })).status).toBe(400);
    expect((await b.call(invoiceClose.POST, "POST", "/x", undefined, { id: inv.data.item.id })).status).toBe(404);

    const closed = await a.call(invoiceClose.POST, "POST", "/x", undefined, { id: inv.data.item.id });
    expect(closed.status).toBe(200);
    expect((await a.call(invoiceClose.POST, "POST", "/x", undefined, { id: inv.data.item.id })).status).toBe(409);
    expect((await a.call(summary.GET, "GET", "/s")).data.totals).toMatchObject({ balance: 0, pendingPoints: 1800 });
    expect((await a.call(cards.GET, "GET", "/c")).data.stats.expectedPoints).toBe(1800);

    await a.call(entry.PATCH, "PATCH", "/e", { status: "CONFIRMED" }, { id: closed.data.item.entryId });
    expect((await a.call(cards.GET, "GET", "/c")).data.stats.receivedPoints).toBe(1800);
    expect((await a.call(summary.GET, "GET", "/s")).data.totals.balance).toBe(1800);

    expect((await a.call(invoice.DELETE, "DELETE", "/x", undefined, { id: inv.data.item.id })).status).toBe(200);
    expect((await a.call(summary.GET, "GET", "/s")).data.totals.balance).toBe(0);
  });

  it("não cria cartão em conta de outro usuário", async () => {
    expect((await b.call(cards.POST, "POST", "/c", { accountId: accA, name: "X", pointsPerDollar: 100, dollarRateCents: 550, closingDay: 1, dueDay: 8 })).status).toBe(404);
  });
});

describe("promoções", () => {
  it("só admin cria; quem tem alerta compatível é avisado; ativas × histórico", async () => {
    const body = { kind: "TRANSFER_BONUS", title: "Bônus de 80%", fromProgramId: p.livelo.id, toProgramId: p.latam.id, bonusPercent: 80, startsAt: day(0), endsAt: day(5), active: true };
    expect((await a.call(adminPromotions.POST, "POST", "/p", body)).status).toBe(403);

    await a.call(alerts.POST, "POST", "/al", { type: "PROMOTION", programId: p.latam.id, threshold: 50 });
    await b.call(alerts.POST, "POST", "/al", { type: "PROMOTION", programId: p.latam.id, threshold: 100 });
    expect((await admin.call(adminPromotions.POST, "POST", "/p", body)).status).toBe(201);
    expect((await a.call(notifications.GET, "GET", "/n")).data.unread).toBe(1);
    expect((await b.call(notifications.GET, "GET", "/n")).data.unread).toBe(0);

    await admin.call(adminPromotions.POST, "POST", "/p", { ...body, title: "Antiga", startsAt: day(-10), endsAt: day(-3) });
    expect((await a.call(promotions.GET, "GET", "/api/promotions")).data.items).toHaveLength(1);
    expect((await a.call(promotions.GET, "GET", "/api/promotions?history=1")).data.items).toHaveLength(1);
    expect((await admin.call(adminPromotions.POST, "POST", "/p", { ...body, url: "javascript:alert(1)" })).status).toBe(400);
  });
});

describe("guias e novidades", () => {
  it("só admin publica; contador de não lidas zera ao ler", async () => {
    const g = { slug: "teste", kind: "ARTICLE", title: "Teste", summary: "Resumo", body: "Texto", level: "BEGINNER", minutes: 3, tags: ["x"], order: 0, published: true };
    expect((await a.call(adminGuides.POST, "POST", "/g", g)).status).toBe(403);
    expect((await admin.call(adminGuides.POST, "POST", "/g", g)).status).toBe(201);
    expect((await admin.call(adminGuides.POST, "POST", "/g", g)).status).toBe(409);

    const n = { title: "Novidade", body: "Texto", publishedAt: day(-1), published: true };
    expect((await a.call(adminNews.POST, "POST", "/n", n)).status).toBe(403);
    expect((await admin.call(adminNews.POST, "POST", "/n", n)).status).toBe(201);
    expect((await a.call(news.GET, "GET", "/n")).data.unread).toBe(1);
    await a.call(newsRead.POST, "POST", "/r");
    expect((await a.call(news.GET, "GET", "/n")).data.unread).toBe(0);
  });
});

describe("foto de perfil", () => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4170000000049454e44ae426082",
    "hex",
  );
  const ctx = { params: Promise.resolve({}) };
  const put = async (c: Client, body: Buffer) =>
    (await avatar.PUT(new Request("http://localhost:3100/api/me/avatar", { method: "PUT", headers: { cookie: c.cookie, "content-type": "image/png" }, body: new Uint8Array(body) }), ctx)).status;
  const get = (c: Client) => avatar.GET(new Request("http://localhost:3100/api/me/avatar", { headers: { cookie: c.cookie } }), ctx);

  it("detecta o tipo pelo conteúdo", () => {
    expect(detectImage(png)).toBe("image/png");
    expect(detectImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });

  it("aceita imagem válida, recusa outros arquivos e excesso de tamanho", async () => {
    expect(await put(a, png)).toBe(200);
    expect(await put(a, Buffer.from("<html><script>alert(1)</script></html>"))).toBe(415);
    expect(await put(a, Buffer.concat([png, Buffer.alloc(600 * 1024)]))).toBe(413);
    expect((await get(a)).headers.get("content-type")).toBe("image/png");
    expect((await get(b)).status).toBe(404);
  });
});

describe("preferência do painel", () => {
  it("salva o modo e recusa valores fora da lista", async () => {
    expect((await a.call(preferences.PATCH, "PATCH", "/p", { dashboardView: "vendas" })).status).toBe(200);
    expect((await a.call(preferences.PATCH, "PATCH", "/p", { dashboardView: "hack" })).status).toBe(400);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "a@x.test" }, include: { preference: true } });
    expect(u.preference?.dashboardView).toBe("vendas");
  });
});

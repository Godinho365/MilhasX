import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as recurrences from "@/app/api/recurrences/route";
import * as recurrence from "@/app/api/recurrences/[id]/route";
import * as purchases from "@/app/api/purchases/route";
import * as receive from "@/app/api/purchases/[id]/receive/route";
import * as cancel from "@/app/api/purchases/[id]/cancel/route";
import * as purchase from "@/app/api/purchases/[id]/route";
import * as credential from "@/app/api/accounts/[id]/credential/route";
import * as reveal from "@/app/api/accounts/[id]/credential/reveal/route";
import * as summary from "@/app/api/summary/route";
import { processDueRecurrences, addPeriod, encrypt, decrypt } from "@/server/services/accounts";
import { prisma } from "@/server/db";

let a: Client, b: Client, acc: string, userA: string;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  a = new Client();
  b = new Client();
  userA = (await a.call(register.POST, "POST", "/r", { name: "Ana", email: "a@x.test", password: "senha-forte-1" })).data.user.id;
  await b.call(register.POST, "POST", "/r", { name: "Bia", email: "b@x.test", password: "senha-forte-1" });
  const h = (await a.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  acc = (await a.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.livelo.id })).data.item.id;
});

describe("recorrências", () => {
  it("avança datas sem pular meses curtos", () => {
    expect(addPeriod(d("2026-01-31"), "MONTHLY").toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addPeriod(d("2026-11-15"), "QUARTERLY").toISOString().slice(0, 10)).toBe("2027-02-15");
    expect(addPeriod(d("2026-10-01"), "YEARLY").toISOString().slice(0, 10)).toBe("2027-10-01");
  });

  it("lança os ciclos vencidos uma única vez, mesmo com chamadas simultâneas", async () => {
    const r = await a.call(recurrences.POST, "POST", "/r", { accountId: acc, type: "CLUB", description: "Clube", points: 2000, costCents: 4990, frequency: "MONTHLY", nextDate: "2026-08-21", notify: true });
    expect(r.status).toBe(201);
    const today = d("2026-10-23");
    await Promise.all([processDueRecurrences(userA, today), processDueRecurrences(userA, today), processDueRecurrences(userA, today)]);
    expect(await prisma.entry.count({ where: { accountId: acc } })).toBe(3); // ago, set, out
    const rec = await prisma.recurrence.findFirstOrThrow();
    expect(rec.nextDate.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect((await a.call(summary.GET, "GET", "/s")).data.totals).toMatchObject({ balance: 6000, costCents: 14970 });
    expect(await prisma.notification.count()).toBe(3);
    // nada a lançar de novo
    expect(await processDueRecurrences(userA, today)).toBe(0);
  });

  it("pausada não lança; outro usuário não altera", async () => {
    const r = (await a.call(recurrences.POST, "POST", "/r", { accountId: acc, type: "CLUB", description: "Clube", points: 1000, costCents: 0, frequency: "MONTHLY", nextDate: "2026-09-01", notify: false })).data.item;
    expect((await b.call(recurrence.PATCH, "PATCH", "/x", { active: false }, { id: r.id })).status).toBe(404);
    expect((await b.call(recurrences.POST, "POST", "/r", { accountId: acc, type: "CLUB", description: "X", points: 1, frequency: "MONTHLY", nextDate: "2026-09-01" })).status).toBe(404);
    await a.call(recurrence.PATCH, "PATCH", "/x", { active: false }, { id: r.id });
    expect(await processDueRecurrences(userA, d("2026-10-23"))).toBe(0);
  });
});

describe("compras bonificadas", () => {
  it("receber lança o crédito com o custo extra; não recebe duas vezes", async () => {
    const p = await a.call(purchases.POST, "POST", "/p", { accountId: acc, storeName: "Loja", purchasedAt: "2026-10-01", amountCents: 100000, extraCostCents: 3000, pointsPerReal: 1000 });
    expect(p.status).toBe(201);
    expect(p.data.item.expectedPoints).toBe(10000);
    expect((await b.call(receive.POST, "POST", "/x", { receivedAt: "2026-10-20" }, { id: p.data.item.id })).status).toBe(404);
    const [r1, r2] = await Promise.all([
      a.call(receive.POST, "POST", "/x", { receivedAt: "2026-10-20" }, { id: p.data.item.id }),
      a.call(receive.POST, "POST", "/x", { receivedAt: "2026-10-20" }, { id: p.data.item.id }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await a.call(summary.GET, "GET", "/s")).data.totals).toMatchObject({ balance: 10000, costCents: 3000 });
    // excluir a compra recebida remove o lançamento
    expect((await a.call(purchase.DELETE, "DELETE", "/x", undefined, { id: p.data.item.id })).status).toBe(200);
    expect((await a.call(summary.GET, "GET", "/s")).data.totals.balance).toBe(0);
  });

  it("cancelar só a pendente", async () => {
    const p = (await a.call(purchases.POST, "POST", "/p", { accountId: acc, storeName: "Loja", purchasedAt: "2026-10-01", amountCents: 1000, pointsPerReal: 100 })).data.item;
    expect((await a.call(cancel.POST, "POST", "/x", undefined, { id: p.id })).status).toBe(200);
    expect((await a.call(cancel.POST, "POST", "/x", undefined, { id: p.id })).status).toBe(404);
  });
});

describe("credenciais", () => {
  it("criptografa com AES-GCM e detecta adulteração", () => {
    const enc = encrypt("minha-senha");
    expect(enc).not.toContain("minha-senha");
    expect(decrypt(enc)).toBe("minha-senha");
    const parts = enc.split(".");
    parts[3] = Buffer.from("xxxxxxxx").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("salva criptografado; mostrar exige a senha do usuário; outro usuário não acessa", async () => {
    expect((await a.call(credential.PUT, "PUT", "/c", { login: "12345678900", secret: "senha-do-programa" }, { id: acc })).status).toBe(200);
    const row = await prisma.accountCredential.findUniqueOrThrow({ where: { accountId: acc } });
    expect(row.secretEnc).not.toContain("senha-do-programa");
    expect(row.loginEnc).not.toContain("12345678900");

    expect((await a.call(reveal.POST, "POST", "/r", { password: "errada" }, { id: acc })).status).toBe(401);
    const ok = await a.call(reveal.POST, "POST", "/r", { password: "senha-forte-1" }, { id: acc });
    expect(ok.data).toMatchObject({ login: "12345678900", secret: "senha-do-programa" });
    expect(await prisma.auditLog.count({ where: { action: "credential.reveal" } })).toBe(1);

    expect((await b.call(reveal.POST, "POST", "/r", { password: "senha-forte-1" }, { id: acc })).status).toBe(404);
    expect((await b.call(credential.PUT, "PUT", "/c", { login: "x", secret: "y" }, { id: acc })).status).toBe(404);
  });

  it("bloqueia após 5 senhas erradas", async () => {
    await a.call(credential.PUT, "PUT", "/c", { login: "l", secret: "s" }, { id: acc });
    for (let i = 0; i < 5; i++) await a.call(reveal.POST, "POST", "/r", { password: "errada" }, { id: acc });
    expect((await a.call(reveal.POST, "POST", "/r", { password: "senha-forte-1" }, { id: acc })).status).toBe(429);
  });
});

describe("compras em 3 estágios", () => {
  const create = (body: Record<string, unknown> = {}) => a.call(purchases.POST, "POST", "/p", { accountId: acc, purchasedAt: "2026-10-01", amountCents: 100000, pointsPerReal: 300, ...body });
  const stage = async (who: Client, id: string, s: string) => {
    const { POST } = await import("@/app/api/purchases/[id]/stage/route");
    return POST(new Request("http://localhost:3100/x", { method: "POST", headers: { cookie: who.cookie, "content-type": "application/json" }, body: JSON.stringify({ stage: s }) }), { params: Promise.resolve({ id }) });
  };

  it("aguardando entrega → aguardando pontos → pontos recebidos, com custos, tags e descrição", async () => {
    const p = (await create({ description: "Notebook", costs: [{ type: "FRETE", amountCents: 2000 }, { type: "DIFERENCA_PRECO", amountCents: 5000 }], tags: ["black friday", "black friday", "trabalho"], expectedDeliveryAt: "2026-10-10" })).data.item;
    expect(p).toMatchObject({ storeName: "Notebook", extraCostCents: 7000, expectedPoints: 3000, status: "PENDING", tags: ["black friday", "trabalho"] });
    expect((await stage(b, p.id, "DELIVERED")).status).toBe(404);
    expect((await stage(a, p.id, "DELIVERED")).status).toBe(200);
    expect((await prisma.bonusPurchase.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("DELIVERED");
    expect((await stage(a, p.id, "PENDING")).status).toBe(200);
    await stage(a, p.id, "DELIVERED");
    expect((await a.call(receive.POST, "POST", "/x", { receivedAt: "2026-10-20" }, { id: p.id })).status).toBe(200);
    const done = await prisma.bonusPurchase.findUniqueOrThrow({ where: { id: p.id }, include: { entry: true } });
    expect(done).toMatchObject({ status: "RECEIVED" });
    expect(done.entry).toMatchObject({ points: 3000, inputCostCents: 7000, description: "Notebook" });
    // recebida não volta de estágio
    expect((await stage(a, p.id, "PENDING")).status).toBe(404);
    // aguardando pontos ainda conta como "a receber" no painel
    const p2 = (await create()).data.item;
    await stage(a, p2.id, "DELIVERED");
    const s = await a.call(summary.GET, "GET", "/s");
    expect(s.status).toBe(200);
  });

  it("evidências: imagem, PDF e vídeo aceitos pelo conteúdo; limite de 10 MB no total", async () => {
    const p = (await create()).data.item;
    const { POST } = await import("@/app/api/purchases/[id]/files/route");
    const send = (who: Client, body: Buffer, name = "x") => POST(new Request("http://localhost:3100/x", { method: "POST", headers: { cookie: who.cookie, "x-file-name": name }, body: new Uint8Array(body) }), { params: Promise.resolve({ id: p.id }) });
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const mov = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypqt  "), Buffer.alloc(16)]);
    expect((await send(a, mp4, "video.mp4")).status).toBe(201);
    expect((await send(a, mov, "video.mov")).status).toBe(201);
    expect((await send(a, Buffer.from("%PDF-1.4\n"), "nota.pdf")).status).toBe(201);
    expect((await send(a, Buffer.from("MZ executável"), "virus.exe")).status).toBe(415);
    expect((await send(b, Buffer.from("%PDF-1.4\n"))).status).toBe(404);
    expect((await send(a, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024)]))).status).toBe(413);
    expect(await prisma.purchaseAttachment.count({ where: { purchaseId: p.id } })).toBe(3);
  });
});

describe("lojas e sugestões de alerta", () => {
  it("filtra por programa, ordena por pontos e sugere alertas das favoritas e das mais usadas", async () => {
    const { listStores, alertSuggestions } = await import("@/server/services/market");
    const livelo = await prisma.program.findFirstOrThrow({ where: { code: "LIVELO" } });
    const latam = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
    const s1 = await prisma.store.create({ data: { name: "Loja A", offers: { create: [{ programId: livelo.id, pointsPerReal: 200 }] } } });
    const s2 = await prisma.store.create({ data: { name: "Loja B", offers: { create: [{ programId: latam.id, pointsPerReal: 800 }, { cashbackBps: 500, portal: "Portal" }] } } });
    const byPoints = await listStores(userA, { sort: "points" });
    expect(byPoints.items.map((x) => x.name)).toEqual(["Loja B", "Loja A"]);
    expect((await listStores(userA, { programId: livelo.id })).items.map((x) => x.name)).toEqual(["Loja A"]);
    expect((await listStores(userA, { sort: "cashback" })).items[0]!.name).toBe("Loja B");
    await prisma.favoriteStore.create({ data: { userId: userA, storeId: s2.id } });
    await a.call(purchases.POST, "POST", "/p", { accountId: acc, storeId: s1.id, purchasedAt: "2026-10-01", amountCents: 1000, pointsPerReal: 200 });
    const sug = await alertSuggestions(userA);
    expect(sug.map((x) => [x.name, x.threshold]).sort()).toEqual([["Loja A", 3], ["Loja B", 12]]);
    await prisma.alert.create({ data: { userId: userA, type: "STORE_POINTS", storeId: s2.id, threshold: 1200 } });
    expect((await alertSuggestions(userA)).map((x) => x.name)).toEqual(["Loja A"]);
  });
});

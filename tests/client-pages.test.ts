// Páginas do cliente por pedido: Cotação, Reserva confirmada e Termo de compra e venda (link com
// token + 4 últimos dígitos do telefone), e a ativação da página nas configurações.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as share from "@/app/api/orders/[id]/share/route";
import * as access from "@/app/api/public/order-access/[slug]/[token]/route";
import * as contract from "@/app/api/public/contract/[slug]/[token]/route";
import * as orderFile from "@/app/api/public/order-file/[token]/[fid]/route";
import { publicOrder, hasOrderAccess, listSignatures } from "@/server/services/client-pages";
import { resolveProposal } from "@/domain/proposal";
import { prisma } from "@/server/db";

let c: Client;
let userId: string;
let orderId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  const r = await c.call(register.POST, "POST", "/r", { name: "Ana Souza", email: "ana@x.test", password: "senha-forte-1" });
  userId = r.data.user.id;
  const o = await prisma.travelOrder.create({
    data: { userId, number: 7, customerName: "Maria Cliente", customerPhone: "(11) 99999-1234", segments: [{ origin: "GRU", destination: "LIS", date: "2027-03-10" }], notes: "anotação interna", budgetCents: 900000 },
  });
  orderId = o.id;
  await prisma.flightQuote.create({ data: { userId, orderId, program: "smiles", origin: "GRU", destination: "LIS", departDate: new Date("2027-03-10"), miles: 120000, taxesCents: 50000, cashCents: 450000 } });
  await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: true });
});

const tokenOf = async () => (await c.call(share.POST, "POST", "/x", undefined, { id: orderId })).data.token as string;
const verify = (token: string, digits: string, ip = "1.1.1.1") =>
  access.POST(new Request("http://localhost:3100/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ digits }) }), { params: Promise.resolve({ slug: "ana-milhas", token }) });
const sessionOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!.split("=")[1]!;

describe("ativação nas configurações", () => {
  it("PATCH só liga a página e define o endereço, com nome padrão do usuário", async () => {
    const r = await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: true });
    expect(r.status).toBe(200);
    expect(r.data.item).toMatchObject({ slug: "ana-milhas", published: true, displayName: "Ana Souza" });
    expect((await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: false })).data.item.published).toBe(false);
  });
});

describe("acesso pelos 4 últimos dígitos do telefone", () => {
  it("só libera com os dígitos certos, limita tentativas e aceita pedido sem telefone", async () => {
    const token = await tokenOf();
    expect(await hasOrderAccess("ana-milhas", token, undefined)).toBe(false);
    expect(await hasOrderAccess("outra", token, undefined)).toBeNull();
    expect((await verify(token, "0000")).status).toBe(401);
    expect((await verify(token, "12a4")).status).toBe(400);
    const ok = await verify(token, "1234");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(await hasOrderAccess("ana-milhas", token, sessionOf(ok))).toBe(true);
    expect(await hasOrderAccess("ana-milhas", token, "sessao-falsa")).toBe(false);
    for (let i = 0; i < 4; i++) await verify(token, "9999");
    expect((await verify(token, "1234")).status).toBe(429); // 5 erros em 15 min bloqueiam

    await prisma.travelOrder.update({ where: { id: orderId }, data: { customerPhone: null } });
    expect(await hasOrderAccess("ana-milhas", token, undefined)).toBe(true);
  });
});

describe("cotação e reserva", () => {
  it("cliente vê a proposta e a reserva, sem milhas, orçamento nem anotações", async () => {
    const token = await tokenOf();
    const r = await c.call(share.PATCH, "PATCH", "/x", {
      locator: "abc123",
      clientNotes: "Bagagem incluída",
      reservation: { program: "LATAM Pass", airline: "LATAM", lastName: "cliente", passengers: ["Maria Cliente", ""] },
      proposal: { legs: [{ origin: "gru", destination: "LIS", date: "2027-03-10", departTime: "22:05", arriveTime: "25:99", airline: "TAP", flight: "tp092", stops: 0 }, { origin: "xx", destination: "LIS" }], pixCents: 438000, fullCents: 489000, cardInstallments: 10, cardTotalCents: 459000 },
    }, { id: orderId });
    expect(r.status).toBe(200);
    const pub = await publicOrder("ana-milhas", token);
    expect(pub?.order).toMatchObject({ number: 7, locator: "ABC123", clientNotes: "Bagagem incluída", reservation: { lastName: "CLIENTE", passengers: ["Maria Cliente"] } });
    expect(pub?.order.proposal.legs).toEqual([expect.objectContaining({ origin: "GRU", flight: "TP092", departTime: "22:05", arriveTime: "" })]);
    expect(pub?.order.proposal.pixCents).toBe(438000);
    const json = JSON.stringify(pub?.order);
    for (const leak of ["120000", "anotação interna", "900000"]) expect(json).not.toContain(leak);
    expect(await publicOrder("outra-pagina", token)).toBeNull();
    expect(await publicOrder("ana-milhas", "token-errado")).toBeNull();

    // outro usuário não vê nem altera o pedido
    const b = new Client();
    await b.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await b.call(share.GET, "GET", "/x", undefined, { id: orderId })).status).toBe(404);
    expect((await b.call(share.PATCH, "PATCH", "/x", { locator: "ZZZ" }, { id: orderId })).status).toBe(404);
    expect((await c.call(share.GET, "GET", "/x", undefined, { id: orderId })).data.item).toMatchObject({ slug: "ana-milhas", token, locator: "ABC123", signed: null });
  });

  it("documento só baixa pelo link se estiver visível ao cliente", async () => {
    const token = await tokenOf();
    const f = await prisma.orderAttachment.create({ data: { orderId, name: "bilhete.pdf", mime: "application/pdf", size: 4, data: new Uint8Array(Buffer.from("%PDF")) } });
    const get = () => orderFile.GET(new Request("http://localhost:3100/x"), { params: Promise.resolve({ token, fid: f.id }) });
    expect((await get()).status).toBe(404);
    await prisma.orderAttachment.update({ where: { id: f.id }, data: { visibleToClient: true } });
    expect((await get()).status).toBe(200);
    expect((await publicOrder("ana-milhas", token))?.order.files).toEqual([{ id: f.id, name: "bilhete.pdf" }]);
  });

  it("resolveProposal descarta o que está fora do formato", () => {
    const p = resolveProposal({ legs: Array.from({ length: 9 }, () => ({ origin: "GRU", destination: "LIS" })), baggage: { checked: 50 }, pixCents: -5, cardInstallments: 99 });
    expect(p.legs).toHaveLength(6);
    expect(p.baggage.checked).toBe(9);
    expect(p.pixCents).toBeNull();
    expect(p.cardInstallments).toBe(24);
  });
});

describe("termo de compra e venda", () => {
  it("exige o acesso, preenche o termo com os dados do cliente, assina uma vez e avisa o dono", async () => {
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { slug: "ana-milhas", displayName: "Ana Viagens", programIds: [], published: true, design: { contrato: { terms: "Termo: {{AGENCIA}} ({{AGENCIA_DOCUMENTO}}) e {{CLIENTE}}, CPF {{CLIENTE_CPF}}, trechos {{TRECHOS}}, valor {{VALOR}}.", agencyDoc: "12.345.678/0001-90" } } });
    const token = await tokenOf();
    await c.call(share.PATCH, "PATCH", "/x", { proposal: { pixCents: 438000 } }, { id: orderId });
    const body = { name: "Maria Cliente", cpf: "123.456.789-09", birthDate: "1990-05-01", address: "Rua A, 10, São Paulo/SP", accepted: true };
    const sign = (b: unknown, cookie?: string) =>
      contract.POST(new Request("http://localhost:3100/x", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) }), { params: Promise.resolve({ slug: "ana-milhas", token }) });
    expect((await sign(body)).status).toBe(403);
    const ok = await verify(token, "1234");
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
    expect((await sign({ ...body, cpf: "123" }, cookie)).status).toBe(400);
    expect((await sign({ ...body, accepted: false }, cookie)).status).toBe(400);
    expect((await sign(body, cookie)).status).toBe(201);
    expect((await sign(body, cookie)).status).toBe(409);
    const row = await prisma.contractSignature.findFirstOrThrow({ where: { orderId } });
    expect(row.terms.replace(/\s/g, " ")).toBe("Termo: Ana Viagens (12.345.678/0001-90) e Maria Cliente, CPF 123.456.789-09, trechos GRU → LIS (10/03/2027), valor R$ 4.380,00.");
    expect(row.cpf).toBe("12345678909");
    expect((await publicOrder("ana-milhas", token))?.order.signed).toMatchObject({ name: "Maria Cliente" });
    expect((await listSignatures(userId))[0]).toMatchObject({ name: "Maria Cliente", orderNumber: 7 });
    expect(await prisma.notification.count({ where: { userId, title: "Termo assinado" } })).toBe(1);
  });
});

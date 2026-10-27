// Páginas do cliente: Cotação e Reserva confirmada (link por pedido), Assinatura de contrato e ativação
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as share from "@/app/api/orders/[id]/share/route";
import * as contract from "@/app/api/public/contract/[slug]/route";
import * as orderFile from "@/app/api/public/order-file/[token]/[fid]/route";
import { publicOrder, listSignatures, ownerBranding } from "@/server/services/client-pages";
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
    data: { userId, number: 7, customerName: "Maria Cliente", customerPhone: "11999990000", segments: [{ origin: "GRU", destination: "LIS", date: "2027-03-10" }], notes: "anotação interna", budgetCents: 900000 },
  });
  orderId = o.id;
  await prisma.flightQuote.create({ data: { userId, orderId, program: "smiles", origin: "GRU", destination: "LIS", departDate: new Date("2027-03-10"), miles: 120000, taxesCents: 50000, cashCents: 450000, notes: "Voo direto" } });
});

describe("ativação nas configurações", () => {
  it("PATCH só liga a página e define o endereço, com nome padrão do usuário", async () => {
    const r = await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: true });
    expect(r.status).toBe(200);
    expect(r.data.item).toMatchObject({ slug: "ana-milhas", published: true, displayName: "Ana Souza" });
    expect((await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: false })).data.item.published).toBe(false);
  });
});

describe("cotação e reserva por link", () => {
  it("o link só abre com o endereço do dono e não mostra milhas, orçamento nem anotações", async () => {
    await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: false });
    const s = await c.call(share.POST, "POST", `/api/orders/${orderId}/share`, undefined, { id: orderId });
    expect(s.status).toBe(200);
    expect(s.data.slug).toBe("ana-milhas");
    const again = await c.call(share.POST, "POST", `/api/orders/${orderId}/share`, undefined, { id: orderId });
    expect(again.data.token).toBe(s.data.token);
    expect(await c.call(share.PATCH, "PATCH", "/x", { locator: "abc123", clientNotes: "Bagagem incluída" }, { id: orderId })).toMatchObject({ status: 200 });

    const pub = await publicOrder("ana-milhas", s.data.token);
    expect(pub?.order).toMatchObject({ number: 7, locator: "ABC123", clientNotes: "Bagagem incluída", quotes: [{ origin: "GRU", cashCents: 450000, notes: "Voo direto" }] });
    const json = JSON.stringify(pub?.order);
    expect(json).not.toContain("120000");
    expect(json).not.toContain("anotação interna");
    expect(json).not.toContain("900000");
    expect(await publicOrder("outra-pagina", s.data.token)).toBeNull();
    expect(await publicOrder("ana-milhas", "token-errado")).toBeNull();

    // outro usuário não gera link nem edita o pedido
    const b = new Client();
    await b.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await b.call(share.POST, "POST", "/x", undefined, { id: orderId })).status).toBe(404);
    expect((await b.call(share.PATCH, "PATCH", "/x", { locator: "ZZZ" }, { id: orderId })).status).toBe(404);
  });

  it("documento só baixa pelo link se estiver visível ao cliente", async () => {
    await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: true });
    const token = (await c.call(share.POST, "POST", "/x", undefined, { id: orderId })).data.token;
    const f = await prisma.orderAttachment.create({ data: { orderId, name: "bilhete.pdf", mime: "application/pdf", size: 4, data: new Uint8Array(Buffer.from("%PDF")) } });
    const get = () => orderFile.GET(new Request("http://localhost:3100/x"), { params: Promise.resolve({ token, fid: f.id }) });
    expect((await get()).status).toBe(404);
    expect((await publicOrder("ana-milhas", token))?.order.files).toEqual([]);
    await prisma.orderAttachment.update({ where: { id: f.id }, data: { visibleToClient: true } });
    const ok = await get();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("bilhete.pdf");
    expect((await publicOrder("ana-milhas", token))?.order.files).toEqual([{ id: f.id, name: "bilhete.pdf" }]);
  });
});

describe("assinatura de contrato", () => {
  it("exige página publicada e aceite, guarda os termos aceitos e avisa o dono", async () => {
    const sign = (body: unknown, ip = "1.1.1.1") =>
      contract.POST(new Request("http://localhost:3100/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "ana-milhas" }) });
    const body = { name: "Carlos Cliente", phone: "(11) 98888-0000", accepted: true };
    expect((await sign(body)).status).toBe(404);
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { slug: "ana-milhas", displayName: "Ana", programIds: [], published: true, design: { contrato: { terms: "Termos versão 1" } } });
    expect((await sign({ ...body, accepted: false })).status).toBe(400);
    expect((await sign({ name: "Carlos Cliente", accepted: true })).status).toBe(400);
    expect((await sign({ ...body, website: "spam" })).status).toBe(400);
    expect((await sign(body)).status).toBe(201);
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { slug: "ana-milhas", displayName: "Ana", programIds: [], published: true, design: { contrato: { terms: "Termos versão 2" } } });
    const rows = await prisma.contractSignature.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.terms).toBe("Termos versão 1");
    expect((await listSignatures(userId))[0]).toMatchObject({ name: "Carlos Cliente", phone: "(11) 98888-0000" });
    expect(await prisma.notification.count({ where: { userId, title: "Contrato assinado" } })).toBe(1);
    for (let i = 0; i < 5; i++) await sign(body, "2.2.2.2");
    expect((await sign(body, "2.2.2.2")).status).toBe(429);
    expect((await ownerBranding(userId)).design.contrato.terms).toBe("Termos versão 2");
  });
});

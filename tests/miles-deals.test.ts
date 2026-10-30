// CRM Milhas: negociações de venda de milhas, Kanban e venda lançada ao chegar em "Pago".
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sale from "@/app/api/sales/[id]/route";
import * as deals from "@/app/api/miles-deals/route";
import * as deal from "@/app/api/miles-deals/[id]/route";
import * as move from "@/app/api/miles-deals/[id]/move/route";
import * as share from "@/app/api/miles-deals/[id]/share/route";
import * as paxRoute from "@/app/api/miles-deals/[id]/passengers/route";
import * as ticket from "@/app/api/miles-deals/[id]/ticket/route";
import * as receipt from "@/app/api/miles-deals/[id]/receipt/route";
import * as pubTicketRoute from "@/app/api/public/miles-deal/[slug]/[token]/ticket/route";
import * as pub from "@/app/api/public/miles-deal/[slug]/[token]/route";
import { parseDealPaste } from "@/domain/miles-deals";
import { publicDeal } from "@/server/services/miles-deals";
import { prisma } from "@/server/db";

let c: Client;
let lat: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  const h = await c.call(holders.POST, "POST", "/h", { name: "Ana" });
  lat = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
  // 20.000 pontos por R$ 500,00 → CPM R$ 25,00
  await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 20000, occurredAt: "2026-10-01", costs: [{ type: "PONTOS", amountCents: 50000 }] });
});

const acc = (id: string) => prisma.account.findUniqueOrThrow({ where: { id } });
const newDeal = (body: Record<string, unknown> = {}) => c.call(deals.POST, "POST", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", ...body });

type Upload = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const sendFile = (post: Upload, id: string, body: Buffer, name: string) =>
  post(new Request("http://localhost:3100/x", { method: "POST", headers: { cookie: c.cookie, "x-file-name": name }, body: new Uint8Array(body) }), { params: Promise.resolve({ id }) });

describe("CRM Milhas", () => {
  it("cria com número sequencial, total e lucro estimado pelo CPM da conta", async () => {
    const a = (await newDeal({ accountId: lat, points: 10000, saleCpmCents: 3000 })).data.item;
    const b = (await newDeal({ buyerType: "BALCAO", customerName: "HotMilhas" })).data.item;
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a).toMatchObject({ stage: "NEW", totalCents: 30000, costCpmCents: 2500, profitCents: 5000 }); // 10 mil × (R$ 30 − R$ 25)
    expect(b).toMatchObject({ totalCents: null, profitCents: null, accountId: null });
    expect((await newDeal({ customerName: " " })).status).toBe(400);

    // Lucro digitado à mão vale no lugar do estimado (inclusive negativo); vazio volta ao estimado
    const manual = (await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 10000, saleCpmCents: 3000, profitCents: 7500 }, { id: a.id })).data.item;
    expect(manual).toMatchObject({ profitCents: 7500, profitManual: true, estimatedProfitCents: 5000 });
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "BALCAO", customerName: "HotMilhas", profitCents: -2000 }, { id: b.id })).data.item).toMatchObject({ profitCents: -2000, customerName: "HotMilhas" });
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 10000, saleCpmCents: 3000, profitCents: null }, { id: a.id })).data.item).toMatchObject({ profitCents: 5000, profitManual: false });
  });

  it("ao mover para Pago lança a venda uma vez, baixa os pontos e trava a negociação", async () => {
    const d = (await newDeal({ customerName: "Agência Voa" })).data.item;
    // Sem comprovante de pagamento não vai para Pago
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(409);
    const rec = await sendFile(receipt.POST, d.id, Buffer.from("%PDF-1.4\n"), "comprovante.pdf");
    expect(rec.status).toBe(201);
    const recBody = await rec.json();
    expect(recBody.aviso).toMatch(/venda não foi lançada.*conta/);
    expect(recBody.item).toMatchObject({ stage: "NEW", receipt: { name: "comprovante.pdf" }, saleId: null });
    // Sem conta, pontos e milheiro não fecha
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(400);
    await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 30000, saleCpmCents: 3000 }, { id: d.id });
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(422); // só há 20.000 pontos
    await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 10000, saleCpmCents: 3000 }, { id: d.id });

    expect((await c.call(move.POST, "POST", "/x", { stage: "NEGOTIATION" }, { id: d.id })).data.item.stage).toBe("NEGOTIATION");
    const paid = (await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).data.item;
    expect(paid.saleId).toBeTruthy();
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 25000 });
    const s = await prisma.sale.findUniqueOrThrow({ where: { id: paid.saleId }, include: { items: true } });
    expect(s).toMatchObject({ points: 10000, totalCents: 30000 });
    expect(s.items[0]).toMatchObject({ kind: "OTHER", clientType: "AGENCY", points: 10000, salePriceCents: 30000 });
    expect(await prisma.saleAttachment.findMany({ where: { saleId: paid.saleId }, select: { name: true } })).toEqual([{ name: "comprovante.pdf" }]);
    // venda lançada: o comprovante não sai mais da negociação (está nos anexos da venda)
    const delRec = await receipt.DELETE(new Request("http://localhost:3100/x", { method: "DELETE", headers: { cookie: c.cookie } }), { params: Promise.resolve({ id: d.id }) });
    expect(delRec.status).toBe(409);

    // De novo em Pago não duplica; voltar de etapa, mudar a venda ou excluir é bloqueado
    await c.call(move.POST, "POST", "/x", { stage: "PAID", position: 0 }, { id: d.id });
    expect(await prisma.sale.count()).toBe(1);
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).status).toBe(409);
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 5000, saleCpmCents: 3000 }, { id: d.id })).status).toBe(409);
    expect((await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa Ltda", accountId: lat, points: 10000, saleCpmCents: 3000 }, { id: d.id })).status).toBe(200);
    expect((await c.call(deal.DELETE, "DELETE", "/x", undefined, { id: d.id })).status).toBe(409);

    // Excluindo a venda em Vendas, os pontos voltam e a negociação pode reabrir
    expect((await c.call(sale.DELETE, "DELETE", "/x", undefined, { id: paid.saleId })).status).toBe(200);
    expect(await acc(lat)).toMatchObject({ balance: 20000 });
    expect((await c.call(move.POST, "POST", "/x", { stage: "AWAITING" }, { id: d.id })).data.item).toMatchObject({ stage: "AWAITING", saleId: null });
  });

  it("colar o pedido do comprador: link, milhares com K, CPFs e taxas", () => {
    expect(parseDealPaste("https://www.latamairlines.com/br/pt/v2/passageiros?orderId=LA9571716CUFU\n8.673K\n1CPF\nTaxas: R$35,75")).toEqual({
      orderLink: "https://www.latamairlines.com/br/pt/v2/passageiros?orderId=LA9571716CUFU", points: 8673, passengers: 1, taxesCents: 3575,
    });
    expect(parseDealPaste("12K 2 CPFs taxas R$ 1.071,50")).toEqual({ points: 12000, passengers: 2, taxesCents: 107150 });
    expect(parseDealPaste("8,7k")).toEqual({ points: 8700 });
    expect(parseDealPaste("41.000 milhas 3 passageiros")).toEqual({ points: 41000, passengers: 3 });
  });

  it("taxas entram no total e na venda como custo repassado; página do comprador recebe os passageiros", async () => {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
    const d = (await newDeal({ accountId: lat, points: 8673, saleCpmCents: 2600, passengers: 1, taxesCents: 3575, orderLink: "https://www.latamairlines.com/br/pt/v2/passageiros?orderId=LA9571716CUFU" })).data.item;
    expect(d).toMatchObject({ totalCents: 22550, chargeCents: 26125, taxesCents: 3575 }); // 8.673 × R$ 26 = R$ 225,50 + R$ 35,75

    // Sem página "Sua MilhasX" não há slug para o link
    expect((await c.call(share.POST, "POST", "/x", undefined, { id: d.id })).data).toMatchObject({ slug: null });
    await prisma.salesProfile.create({ data: { userId, slug: "ana", displayName: "Ana Milhas" } });
    const { token, slug } = (await c.call(share.POST, "POST", "/x", undefined, { id: d.id })).data;
    expect(slug).toBe("ana");
    expect((await c.call(share.POST, "POST", "/x", undefined, { id: d.id })).data.token).toBe(token); // mesmo link sempre
    expect(await publicDeal("outra", token)).toBeNull();
    const page = (await publicDeal("ana", token))!.deal;
    expect(page).toMatchObject({ points: 8673, passengers: 1, chargeCents: 26125, passengersAt: null, locator: null });
    expect(page).not.toHaveProperty("profitCents");

    const anon = new Client();
    const send = (passengers: unknown[]) => anon.call(pub.POST, "POST", "/x", { passengers }, { slug: "ana", token });
    const ana = { name: "Ana Souza Lima", cpf: "123.456.789-09", birthDate: "1990-05-20", email: "ana@x.test" };
    expect((await send([ana, { ...ana, name: "Bia Souza" }])).status).toBe(400); // combinado: 1 CPF
    expect((await send([{ ...ana, cpf: "123" }])).status).toBe(400);
    expect((await send([ana])).status).toBe(201);
    const got = (await c.call(deals.GET, "GET", "/x")).data.items[0];
    expect(got.passengersData).toEqual([{ name: "Ana Souza Lima", cpf: "12345678909", birthDate: "1990-05-20", email: "ana@x.test" }]);
    expect(got.passengersAt).toBeTruthy();
    // a janela aberta busca a negociação de novo e já vê os passageiros
    const one = (await c.call(deal.GET, "GET", "/x", undefined, { id: d.id })).data.item;
    expect(one.passengersData).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId, title: "Passageiros recebidos" } })).toBe(1);

    // Só o localizador (pode vir do link do pedido) não é emissão: a página não mostra e o comprador ainda corrige
    await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, points: 8673, saleCpmCents: 2600, passengers: 1, taxesCents: 3575, locator: "abc123" }, { id: d.id });
    expect((await publicDeal("ana", token))!.deal).toMatchObject({ issued: false, locator: null });
    expect((await send([ana])).status).toBe(201);
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).status).toBe(409); // sem bilhete

    // Com o bilhete anexado: emitida, a página mostra o localizador, deixa baixar o bilhete e não aceita mais mudanças
    const up = (body: Buffer) => ticket.POST(new Request("http://localhost:3100/x", { method: "POST", headers: { cookie: c.cookie, "x-file-name": "bilhete.pdf" }, body: new Uint8Array(body) }), { params: Promise.resolve({ id: d.id }) });
    expect((await up(Buffer.from("texto qualquer"))).status).toBe(415);
    const att = await up(Buffer.from("%PDF-1.4\n"));
    expect(att.status).toBe(201);
    expect((await att.json()).item).toMatchObject({ stage: "ISSUED", ticket: { name: "bilhete.pdf" } });
    expect((await publicDeal("ana", token))!.deal).toMatchObject({ issued: true, locator: "ABC123", ticketName: "bilhete.pdf" });
    const pubTicket = await pubTicketRoute.GET(new Request("http://localhost:3100/x"), { params: Promise.resolve({ slug: "ana", token }) });
    expect(pubTicket.status).toBe(200);
    expect(Buffer.from(await pubTicket.arrayBuffer()).toString()).toBe("%PDF-1.4\n");
    expect((await send([ana])).status).toBe(409);
    // tirar o bilhete volta para "Aguardando"; anexar de novo emite outra vez
    const del = await ticket.DELETE(new Request("http://localhost:3100/x", { method: "DELETE", headers: { cookie: c.cookie } }), { params: Promise.resolve({ id: d.id }) });
    expect((await del.json()).item).toMatchObject({ stage: "AWAITING", ticket: null });
    expect((await up(Buffer.from("%PDF-1.4\n"))).status).toBe(201);

    // Em Pago, a venda cobra milhas + taxas e as taxas são custo repassado (não mudam o lucro)
    const paidRes = await sendFile(receipt.POST, d.id, Buffer.from("%PDF-1.5\n"), "pix.pdf");
    const { item: paid, aviso } = await paidRes.json();
    expect(aviso).toBeNull();
    expect(paid.stage).toBe("PAID");
    const s = await prisma.sale.findUniqueOrThrow({ where: { id: paid.saleId }, include: { items: true, attachments: { select: { name: true } } } });
    expect(s.attachments.map((a) => a.name).sort()).toEqual(["bilhete.pdf", "pix.pdf"]);
    expect(s.totalCents).toBe(26125);
    expect(s.items[0]).toMatchObject({ salePriceCents: 22550, reservation: "ABC123", costs: [{ type: "TAXA_EMBARQUE", amountCents: 3575 }] });
  });

  it("usuário informa os passageiros que o comprador mandou pelo WhatsApp (e pode limpar)", async () => {
    const d = (await newDeal({ accountId: lat, points: 8673, saleCpmCents: 2600, passengers: 1 })).data.item;
    const r = await c.call(paxRoute.PUT, "PUT", "/x", { passengers: [{ name: "Nicolas Eduardo Amaral", firstName: "Nicolas", lastName: "Eduardo Amaral", cpf: "037.355.180-01", birthDate: "2002-03-23", gender: "M", phone: "(21) 99493-4776" }] }, { id: d.id });
    expect(r.status).toBe(200);
    expect(r.data.item.passengersData).toEqual([{ name: "Nicolas Eduardo Amaral", firstName: "Nicolas", lastName: "Eduardo Amaral", cpf: "03735518001", birthDate: "2002-03-23", gender: "M", phone: "(21) 99493-4776" }]);
    expect(r.data.item.passengersAt).toBeTruthy();
    expect((await c.call(paxRoute.PUT, "PUT", "/x", { passengers: [{ name: "Ana", cpf: "123", birthDate: "2002-03-23" }] }, { id: d.id })).status).toBe(400);
    const cleared = await c.call(paxRoute.PUT, "PUT", "/x", { passengers: [] }, { id: d.id });
    expect(cleared.data.item).toMatchObject({ passengersData: [], passengersAt: null });
  });

  it("isola por usuário", async () => {
    const d = (await newDeal()).data.item;
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-1" });
    expect((await o.call(deals.GET, "GET", "/x")).data.items).toEqual([]);
    expect((await o.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).status).toBe(404);
    expect((await o.call(deals.POST, "POST", "/x", { buyerType: "FINAL", customerName: "X", accountId: lat })).status).toBe(404);
  });
});

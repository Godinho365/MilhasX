// CRM Milhas: negociações de venda de milhas, Kanban, venda a receber ao emitir e paga ao chegar em "Pago".
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
import * as archiveRoute from "@/app/api/miles-deals/[id]/archive/route";
import * as faceRoute from "@/app/api/miles-deals/[id]/face-check/route";
import { listDeals, milesDealsDashboard } from "@/server/services/miles-deals";
import * as cardsRoute from "@/app/api/cards/route";
import { listCardBills } from "@/server/services/finance";
import * as pubTicketRoute from "@/app/api/public/miles-deal/[slug]/[token]/ticket/route";
import * as pub from "@/app/api/public/miles-deal/[slug]/[token]/route";
import { balcaoForGroup, balcaoOptions, parseDealPaste } from "@/domain/miles-deals";
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

  it("ao mover para Pago lança a venda uma vez, já paga, baixa os pontos e trava a negociação", async () => {
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
    // o pagamento entra na conta do Financeiro (a primeira ativa)
    const userId = (await prisma.milesDeal.findUniqueOrThrow({ where: { id: d.id } })).userId;
    const pj = await prisma.finAccount.create({ data: { userId, name: "Nubank PJ" } });
    await c.call(faceRoute.POST, "POST", "/x", { status: "NOT_NEEDED" }, { id: d.id });
    expect((await sendFile(ticket.POST, d.id, Buffer.from("%PDF-1.4\n"), "bilhete.pdf")).status).toBe(201); // para poder voltar a Emitido
    const paid =(await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).data.item;
    expect(paid.saleId).toBeTruthy();
    expect(await acc(lat)).toMatchObject({ balance: 10000, costCents: 25000 });
    const s = await prisma.sale.findUniqueOrThrow({ where: { id: paid.saleId }, include: { items: true } });
    expect(s).toMatchObject({ points: 10000, totalCents: 30000, finAccountId: pj.id });
    expect(s.paidAt).toBeTruthy(); // com o comprovante a venda já entra paga
    expect(paid).toMatchObject({ paidAt: s.paidAt!.toISOString(), paidAccount: "Nubank PJ" });
    // de volta para Emitido: a receber, sai da conta; em Pago de novo, volta para ela
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).data.item).toMatchObject({ paidAt: null, paidAccount: null });
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: paid.saleId } })).finAccountId).toBeNull();
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).data.item.paidAccount).toBe("Nubank PJ");
    expect(s.items[0]).toMatchObject({ kind: "OTHER", clientType: "AGENCY", points: 10000, salePriceCents: 30000 });
    expect(await prisma.saleAttachment.findMany({ where: { saleId: paid.saleId }, select: { name: true }, orderBy: { name: "asc" } })).toEqual([{ name: "bilhete.pdf" }, { name: "comprovante.pdf" }]);
    // venda lançada: o comprovante não sai mais da negociação (está nos anexos da venda)
    const delRec = await receipt.DELETE(new Request("http://localhost:3100/x", { method: "DELETE", headers: { cookie: c.cookie } }), { params: Promise.resolve({ id: d.id }) });
    expect(delRec.status).toBe(409);

    // De novo em Pago não duplica; voltar de etapa, mudar a venda ou excluir é bloqueado
    await c.call(move.POST, "POST", "/x", { stage: "PAID", position: 0 }, { id: d.id });
    expect(await prisma.sale.count()).toBe(1);
    expect((await c.call(move.POST, "POST", "/x", { stage: "AWAITING" }, { id: d.id })).status).toBe(409);
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
    // verificação antes da emissão: sem ela o bilhete não entra
    expect((await up(Buffer.from("%PDF-1.4\n"))).status).toBe(409);
    const ID = "61020a77-74a6-4600-ae39-77e74b1828aa";
    expect((await c.call(faceRoute.POST, "POST", "/x", { link: "https://outro.site/flow/intro?id=" + ID, status: "PENDING" }, { id: d.id })).status).toBe(400);
    const fc = (await c.call(faceRoute.POST, "POST", "/x", { link: `https://cadastro.unico.app/flow/intro?collect-data=true&id=${ID}`, status: "PENDING" }, { id: d.id })).data.item.faceCheck;
    expect(fc).toMatchObject({ url: `https://cadastro.unico.app/process/${ID}?collect-data=true`, status: "PENDING" });
    expect((await up(Buffer.from("%PDF-1.4\n"))).status).toBe(409); // ainda aguardando o titular
    expect((await c.call(faceRoute.POST, "POST", "/x", { status: "DONE" }, { id: d.id })).data.item.faceCheck).toMatchObject({ status: "DONE", url: `https://cadastro.unico.app/process/${ID}?collect-data=true` });
    expect((await up(Buffer.from("texto qualquer"))).status).toBe(415);
    const att = await up(Buffer.from("%PDF-1.4\n"));
    expect(att.status).toBe(201);
    // emitida: vira venda a receber em Vendas (baixa os pontos), com o bilhete nos anexos
    const issued = await att.json();
    expect(issued.aviso).toBeNull();
    expect(issued.item).toMatchObject({ stage: "ISSUED", ticket: { name: "bilhete.pdf" }, paidAt: null });
    expect(issued.item.saleId).toBeTruthy();
    expect(await acc(lat)).toMatchObject({ balance: 20000 - 8673 });
    const open = await prisma.sale.findUniqueOrThrow({ where: { id: issued.item.saleId }, include: { attachments: { select: { name: true } } } });
    expect(open.paidAt).toBeNull();
    expect(open.attachments.map((a) => a.name)).toEqual(["bilhete.pdf"]);
    expect((await publicDeal("ana", token))!.deal).toMatchObject({ issued: true, locator: "ABC123", ticketName: "bilhete.pdf" });
    const pubTicket = await pubTicketRoute.GET(new Request("http://localhost:3100/x"), { params: Promise.resolve({ slug: "ana", token }) });
    expect(pubTicket.status).toBe(200);
    expect(Buffer.from(await pubTicket.arrayBuffer()).toString()).toBe("%PDF-1.4\n");
    expect((await send([ana])).status).toBe(409);
    // virou venda: o bilhete não sai mais (só troca), trocar não duplica a venda e não volta para antes de Emitido
    const del = await ticket.DELETE(new Request("http://localhost:3100/x", { method: "DELETE", headers: { cookie: c.cookie } }), { params: Promise.resolve({ id: d.id }) });
    expect(del.status).toBe(409);
    expect((await up(Buffer.from("%PDF-1.4\n"))).status).toBe(201);
    expect(await prisma.sale.count()).toBe(1);
    expect((await c.call(move.POST, "POST", "/x", { stage: "AWAITING" }, { id: d.id })).status).toBe(409);

    // Em Pago (com o comprovante) a mesma venda fica paga; ela cobra milhas + taxas e as taxas são custo repassado
    const paidRes = await sendFile(receipt.POST, d.id, Buffer.from("%PDF-1.5\n"), "pix.pdf");
    const { item: paid, aviso } = await paidRes.json();
    expect(aviso).toBeNull();
    expect(paid.stage).toBe("PAID");
    expect(paid.saleId).toBe(issued.item.saleId);
    expect(paid.paidAt).toBeTruthy();
    const s = await prisma.sale.findUniqueOrThrow({ where: { id: paid.saleId }, include: { items: true, attachments: { select: { name: true } } } });
    expect(s.paidAt).toBeTruthy();
    expect(s.attachments.map((a) => a.name).sort()).toEqual(["bilhete.pdf", "pix.pdf"]);
    // quem ocupa vaga no limite de CPFs é o passageiro emitido, não o comprador (Agência Voa)
    expect(await prisma.accountBeneficiary.findMany({ where: { saleId: s.id }, select: { name: true, document: true, accountId: true } })).toEqual([{ name: "Ana Souza Lima", document: "12345678909", accountId: lat }]);
    expect(s.totalCents).toBe(26125);
    expect(s.items[0]).toMatchObject({ salePriceCents: 22550, reservation: "ABC123", costs: [{ type: "TAXA_EMBARQUE", amountCents: 3575 }] });

    // Pago de volta para Emitido: a venda volta a receber; em Pago de novo, quita (sempre a mesma venda)
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).data.item).toMatchObject({ stage: "ISSUED", paidAt: null });
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: s.id } })).paidAt).toBeNull();
    expect((await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).data.item.paidAt).toBeTruthy();
    expect(await prisma.sale.count()).toBe(1);
  });

  it("bilhete sem conta fica salvo com aviso; completando a negociação, Emitido lança a venda a receber", async () => {
    const d = (await newDeal({ buyerType: "BALCAO", customerName: "Balcão X" })).data.item;
    await c.call(faceRoute.POST, "POST", "/x", { status: "NOT_NEEDED" }, { id: d.id });
    const r = await (await sendFile(ticket.POST, d.id, Buffer.from("%PDF-1.4\n"), "bilhete.pdf")).json();
    expect(r.aviso).toMatch(/Bilhete salvo.*Emitido.*conta/);
    expect(r.item).toMatchObject({ stage: "NEW", ticket: { name: "bilhete.pdf" }, saleId: null });
    // negociação que já estava em Emitido sem venda (de antes desta regra): lança ao mover, mesmo na mesma coluna
    await prisma.milesDeal.update({ where: { id: d.id }, data: { stage: "ISSUED" } });
    expect((await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).status).toBe(400); // falta a conta
    await c.call(deal.PUT, "PUT", "/x", { buyerType: "BALCAO", customerName: "Balcão X", accountId: lat, points: 5000, saleCpmCents: 2800 }, { id: d.id });
    const item = (await c.call(move.POST, "POST", "/x", { stage: "ISSUED" }, { id: d.id })).data.item;
    expect(item).toMatchObject({ stage: "ISSUED", paidAt: null });
    expect(item.saleId).toBeTruthy();
    expect(await acc(lat)).toMatchObject({ balance: 15000 });
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: item.saleId } })).paidAt).toBeNull();
  });

  it("sem a quantidade de CPFs a venda conta 1 CPF; mudando os CPFs depois, a venda e o limite da conta acompanham", async () => {
    const body = { buyerType: "BALCAO", customerName: "Balcão X", accountId: lat, points: 5000, saleCpmCents: 2800 };
    const d = (await newDeal(body)).data.item;
    await c.call(faceRoute.POST, "POST", "/x", { status: "NOT_NEEDED" }, { id: d.id });
    const { item } = await (await sendFile(ticket.POST, d.id, Buffer.from("%PDF-1.4\n"), "bilhete.pdf")).json();
    expect(item).toMatchObject({ stage: "ISSUED", passengers: null, passengersData: [] });
    const cpfs = async () => ({
      venda: (await prisma.saleItem.findFirstOrThrow({ where: { saleId: item.saleId } })).passengers,
      conta: (await prisma.accountBeneficiary.findMany({ where: { saleId: item.saleId, accountId: lat }, select: { name: true }, orderBy: { name: "asc" } })).map((b) => b.name),
    });
    // toda emissão usa ao menos um CPF: entra no lucro por CPF e ocupa vaga na conta
    expect(await cpfs()).toEqual({ venda: 1, conta: ["Anônimo"] });
    // combinou 2 CPFs depois de lançar: a venda passa a contar 2
    expect((await c.call(deal.PUT, "PUT", "/x", { ...body, passengers: 2 }, { id: d.id })).status).toBe(200);
    expect(await cpfs()).toEqual({ venda: 2, conta: ["Anônimo", "Anônimo"] });
    // passageiro informado ocupa a vaga com o nome; o outro CPF combinado segue anônimo
    await c.call(paxRoute.PUT, "PUT", "/x", { passengers: [{ name: "Ana Souza Lima", cpf: "123.456.789-09", birthDate: "1990-05-20" }] }, { id: d.id });
    expect(await cpfs()).toEqual({ venda: 2, conta: ["Ana Souza Lima", "Anônimo"] });
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

  it("arquivar tira do Kanban e o dashboard soma as vendas pagas", async () => {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
    const a = (await newDeal({ customerName: "Comprador A", accountId: lat, points: 10000, saleCpmCents: 3000 })).data.item;
    const b = (await newDeal({ customerName: "Comprador B" })).data.item;
    expect((await sendFile(receipt.POST, a.id, Buffer.from("%PDF-1.4\n"), "pix.pdf")).status).toBe(201); // paga: vira venda
    expect((await c.call(archiveRoute.POST, "POST", "/x", { archived: true }, { id: b.id })).data.item.archivedAt).toBeTruthy();
    expect((await listDeals(userId)).map((d) => d.customerName)).toEqual(["Comprador A"]);
    expect((await listDeals(userId, { archived: true })).map((d) => d.customerName)).toEqual(["Comprador B"]);
    const dash = await milesDealsDashboard(userId, 30);
    expect(dash.totals).toMatchObject({ created: 2, paid: 1, conversionPct: 50, points: 10000, revenueCents: 30000, archived: 1, saleCpmCents: 3000 });
    expect(dash.topBuyers[0]).toMatchObject({ name: "Comprador A", deals: 1, revenueCents: 30000 });
    expect(dash.pipeline.find((p) => p.stage === "PAID")).toMatchObject({ count: 1, points: 10000 });
    // reabrir volta para o Kanban
    await c.call(archiveRoute.POST, "POST", "/x", { archived: false }, { id: b.id });
    expect(await listDeals(userId)).toHaveLength(2);
  });

  it("sugestão de conta: passageiro repetido não gasta CPF e negociação aberta reserva milhas", async () => {
    const { accountsCapacity, dealAccountFit } = await import("@/server/services/capacity");
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
    await prisma.accountBeneficiary.create({ data: { userId, accountId: lat, name: "Ana Souza Lima", document: "12345678909", usedAt: new Date() } });
    const d = (await newDeal({ accountId: lat, points: 8000, saleCpmCents: 2600, passengers: 1 })).data.item;
    await c.call(paxRoute.PUT, "PUT", "/x", { passengers: [{ name: "Ana Souza Lima", cpf: "123.456.789-09", birthDate: "1990-05-20" }] }, { id: d.id });
    const fit = await dealAccountFit(userId, d.id);
    const mine = fit.accounts.find((a) => a.id === lat)!;
    expect(mine).toMatchObject({ already: 1, fit: { newCpfs: 0, enough: true } });
    // a negociação aberta reserva as milhas dela no espaço da conta (fora da própria sugestão)
    expect((await accountsCapacity(userId)).rows.find((r) => r.id === lat)!.load.reserved).toBe(8000);
    expect(mine.load.reserved).toBe(0);
    // negociação nova, pelo que está digitado: 30 CPFs não cabem numa conta com limite de 25
    const typed = await dealAccountFit(userId, null, { points: 1000, cpfs: 30 });
    expect(typed).toMatchObject({ points: 1000, cpfsNeeded: 30 });
    expect(typed.accounts.find((a) => a.id === lat)!.fit.cpfShort).toBe(true);
    expect((await dealAccountFit(userId, null, { points: 1000, cpfs: 2 })).accounts.find((a) => a.id === lat)!.fit).toMatchObject({ cpfShort: false, enough: true, newCpfs: 2 });
  });

  it("taxas pagas no cartão: vão na venda com o cartão e entram na fatura dele; trocar o cartão depois leva a taxa junto", async () => {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).id;
    const card = async (name: string) => (await c.call(cardsRoute.POST, "POST", "/c", { accountId: lat, name, pointsPerDollar: 220, dollarRateCents: 550, closingDay: 25, dueDay: 5 })).data.item.id as string;
    const cardA = await card("Cartão A");
    const cardB = await card("Cartão B");
    const body = { buyerType: "BALCAO", customerName: "balcao", accountId: lat, points: 10000, saleCpmCents: 3000, taxesCents: 17808 };
    expect((await newDeal({ ...body, taxesCardId: "nao-existe" })).status).toBe(404);
    const d = (await newDeal({ ...body, taxesCardId: cardA })).data.item;
    expect(d.taxesCardId).toBe(cardA);

    await sendFile(receipt.POST, d.id, Buffer.from("%PDF-1.4\n"), "comprovante.pdf");
    const paid = (await c.call(move.POST, "POST", "/x", { stage: "PAID" }, { id: d.id })).data.item;
    const costs = async () => (await prisma.saleItem.findFirstOrThrow({ where: { saleId: paid.saleId } })).costs;
    expect(await costs()).toEqual([{ type: "TAXA_EMBARQUE", amountCents: 17808, cardId: cardA }]);
    const billOf = async (id: string) => (await listCardBills(userId)).find((x) => x.id === id)!;
    expect((await billOf(cardA)).openCents).toBe(17808);

    // venda lançada: a taxa não muda, mas o cartão sim (a taxa muda de fatura)
    const moved = await c.call(deal.PUT, "PUT", "/x", { ...body, taxesCardId: cardB }, { id: d.id });
    expect(moved.status).toBe(200);
    expect(moved.data.item.taxesCardId).toBe(cardB);
    expect(await costs()).toEqual([{ type: "TAXA_EMBARQUE", amountCents: 17808, cardId: cardB }]);
    expect([(await billOf(cardA)).openCents, (await billOf(cardB)).openCents]).toEqual([0, 17808]);
    // salvar sem o campo não mexe no cartão; nenhum tira a taxa do cartão
    expect((await c.call(deal.PUT, "PUT", "/x", body, { id: d.id })).data.item.taxesCardId).toBe(cardB);
    expect((await c.call(deal.PUT, "PUT", "/x", { ...body, taxesCardId: null }, { id: d.id })).data.item.taxesCardId).toBeNull();
    expect(await costs()).toEqual([{ type: "TAXA_EMBARQUE", amountCents: 17808, cardId: null }]);
    // mudado em Vendas, a negociação mostra o cartão da venda
    await prisma.saleItem.updateMany({ where: { saleId: paid.saleId }, data: { costs: [{ type: "TAXA_EMBARQUE", amountCents: 17808, cardId: cardA }] } });
    expect((await listDeals(userId)).find((x) => x.id === d.id)!.taxesCardId).toBe(cardA);
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

describe("balcões da negociação", () => {
  it("lista os balcões padrão e os já usados, sem repetir, em ordem alfabética", () => {
    expect(balcaoOptions([])).toEqual(["Balcão de Milhas ASM", "Balcão Milhas VIP", "Balcão MilhasX"]);
    expect(balcaoOptions(["HotMilhas", " Balcão Milhas VIP ", "", "HotMilhas"])).toEqual(["Balcão de Milhas ASM", "Balcão Milhas VIP", "Balcão MilhasX", "HotMilhas"]);
  });
});

describe("balcão do grupo do Telegram", () => {
  it("o da lista que está inteiro no nome do grupo, o mais completo; nome genérico não vale", () => {
    const used = ["balcao", "Balcao", "HotMilhas"];
    expect(balcaoForGroup("BALCÃO MILHAS VIP PRO", used)).toBe("Balcão Milhas VIP");
    expect(balcaoForGroup("Balcão de Milhas ASM - Oficial", used)).toBe("Balcão de Milhas ASM");
    expect(balcaoForGroup("Balcão de Milhas ASM", used)).toBe("Balcão de Milhas ASM");
    // "balcao" sozinho não casa: fica o nome do grupo
    expect(balcaoForGroup("Balcão Turbo", used)).toBe("Balcão Turbo");
    // palavra inteira: "Milhas VIPs" não é "Milhas VIP"
    expect(balcaoForGroup("Balcão Milhas VIPs", used)).toBe("Balcão Milhas VIPs");
  });
});

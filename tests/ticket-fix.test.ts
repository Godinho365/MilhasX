// Bilhete da LATAM no CRM Milhas: as milhas e a taxa de embarque valem o que está no bilhete. Diferentes da
// negociação, são corrigidas antes de lançar a venda; com a venda já lançada pela negociação, ela acompanha
// (pontos, valor e taxa); reembolsada, não mexe e avisa. O texto do PDF é simulado.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import { prisma } from "@/server/db";
import { brDay } from "@/domain/brasilia";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as deals from "@/app/api/miles-deals/route";
import * as deal from "@/app/api/miles-deals/[id]/route";
import * as ticket from "@/app/api/miles-deals/[id]/ticket/route";
import * as faceRoute from "@/app/api/miles-deals/[id]/face-check/route";
import * as refund from "@/app/api/sales/[id]/refund/route";

const pdf = vi.hoisted(() => ({ text: "" }));
vi.mock("@/server/services/pdf", () => ({ extractPdfText: async () => pdf.text }));

/** Texto do bilhete como o pdf-parse devolve (dados fictícios). */
const ticketText = (miles: string, taxes: string) => [
  "Código da reservaJFKAKSNª de ordenLA9999999XXXX",
  "emissão", "São Paulo, Brasil 12/11/26",
  "Nome do PassageiroTipo de passageiroDocumento de Identificação",
  "FULANO DE TAL SILVAAdulto12345678901",
  "Taxas e/ou impostos(2)", `Millas ${miles}`, "Total pago", `BRL ${taxes}`, `Millas ${miles}`, `(2)BR: BRL ${taxes}`,
].join("\n");

let c: Client, lat: string;
beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  const h = await c.call(holders.POST, "POST", "/h", { name: "Ana" });
  lat = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
  await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 50000, occurredAt: "2026-10-01", costs: [{ type: "PONTOS", amountCents: 125000 }] });
});

const balance = async () => (await prisma.account.findUniqueOrThrow({ where: { id: lat } })).balance;
async function newDeal(fields: Record<string, unknown>) {
  const d = (await c.call(deals.POST, "POST", "/x", { buyerType: "AGENCY", customerName: "Agência Voa" })).data.item;
  await c.call(deal.PUT, "PUT", "/x", { buyerType: "AGENCY", customerName: "Agência Voa", accountId: lat, saleCpmCents: 2550, passengers: 1, ...fields }, { id: d.id });
  await c.call(faceRoute.POST, "POST", "/x", { status: "NOT_NEEDED" }, { id: d.id });
  return d.id as string;
}
async function attach(id: string, miles: string, taxes: string) {
  pdf.text = ticketText(miles, taxes);
  const r = await ticket.POST(new Request("http://localhost:3100/x", { method: "POST", headers: { cookie: c.cookie, "x-file-name": "bilhete.pdf" }, body: new Uint8Array(Buffer.from("%PDF-1.4\n")) }), { params: Promise.resolve({ id }) });
  expect(r.status).toBe(201);
  return (await r.json()) as { item: { points: number; taxesCents: number; saleId: string; stage: string; locator: string }; aviso: string };
}
const saleOf = (id: string) => prisma.sale.findUniqueOrThrow({ where: { id }, include: { items: true } });

describe("bilhete corrige milhas e taxa", () => {
  it("antes de lançar a venda: corrige a negociação e a venda já nasce com os números do bilhete", async () => {
    const id = await newDeal({ points: 43768, taxesCents: 11776 });
    const r = await attach(id, "45.120", "120,50");
    expect(r.aviso).toBe("📄 Bilhete LA9999999XXXX lido. Preenchi: localizador JFKAKS, 1 passageiro. Corrigi pelo bilhete: milhas 43.768 → 45.120; taxa de embarque R$ 117,76 → R$ 120,50.");
    expect(r.item).toMatchObject({ points: 45120, taxesCents: 12050, stage: "ISSUED", locator: "JFKAKS" });
    const s = await saleOf(r.item.saleId);
    expect(s.points).toBe(45120);
    expect(s.items[0]).toMatchObject({ points: 45120, salePriceCents: Math.round((45120 * 2550) / 1000), costs: [{ type: "TAXA_EMBARQUE", amountCents: 12050, cardId: null }] });
    expect(await balance()).toBe(50000 - 45120);
  });

  it("igual ao bilhete: não muda nada; vazio: preenche", async () => {
    const same = await newDeal({ points: 30000, taxesCents: 5562 });
    expect((await attach(same, "30.000", "55,62")).aviso).toBe("📄 Bilhete LA9999999XXXX lido. Preenchi: localizador JFKAKS, 1 passageiro.");
    const empty = await newDeal({});
    const r = await attach(empty, "12.000", "40,00");
    expect(r.aviso).toContain("Preenchi: localizador JFKAKS, 12.000 milhas, taxa R$ 40,00, 1 passageiro.");
    expect(r.item).toMatchObject({ points: 12000, taxesCents: 4000 });
  });

  it("venda já lançada: o bilhete trocado corrige a venda (pontos, valor e taxa) e a conta; reembolsada, só avisa", async () => {
    const id = await newDeal({ points: 20000, taxesCents: 5000 });
    const first = await attach(id, "20.000", "50,00");
    expect(await balance()).toBe(30000);
    const r = await attach(id, "21.500", "62,30");
    expect(r.aviso).toContain("Corrigi pelo bilhete: milhas 20.000 → 21.500; taxa de embarque R$ 50,00 → R$ 62,30; a venda foi atualizada.");
    expect(r.item).toMatchObject({ points: 21500, taxesCents: 6230, saleId: first.item.saleId });
    const s = await saleOf(first.item.saleId);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ points: 21500, salePriceCents: Math.round((21500 * 2550) / 1000), costs: [{ type: "TAXA_EMBARQUE", amountCents: 6230 }] });
    expect(await balance()).toBe(50000 - 21500);

    expect((await c.call(refund.POST, "POST", "/x", { feeCents: 0, date: brDay() }, { id: first.item.saleId })).status).toBe(200);
    const w = await attach(id, "22.000", "70,00");
    expect(w.aviso).toContain("⚠️ o bilhete tem 22.000 milhas e taxa R$ 70,00, mas não corrigi porque a venda foi reembolsada; corrija em Vendas.");
    expect(w.item).toMatchObject({ points: 21500, taxesCents: 6230 });
  });
});

// Acompanhamentos renderizados no servidor: indicadores, períodos com contagem, as linhas por dia, a marcação,
// "Sem companhia" com o programa da emissão, os botões conforme a função; o mapa com a legenda, os clientes
// ativos, as bolinhas por cidade e o aviso das viagens sem lugar; o formulário de venda com os tipos novos.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rowsOf, mapTrips, trackKpis, type TrackItem } from "@/domain/tracking";
import type { TrackingList } from "@/server/services/tracking";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() }));
const { TrackingClient } = await import("@/app/app/acompanhamentos/[tipo]/client");
const { TravelMap } = await import("@/app/app/acompanhamentos/mapa/client");
const { SaleDialog } = await import("@/app/app/sales/sale-dialog");

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/\u00a0/g, " ");
const T = "2026-11-12";
const item = (o: Partial<TrackItem> & Pick<TrackItem, "id" | "kind">): TrackItem => ({
  saleId: `s-${o.id}`, origin: null, destination: null, departureDate: null, returnDate: null, departureTime: null, returnTime: null, provider: null,
  reservation: null, passengers: 1, description: null, customers: [], issuerIds: [], valueCents: 10_000, program: null, doneOutAt: null, doneRetAt: null, ...o,
});
const rows = [
  ...rowsOf(item({ id: "a", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: T, departureTime: "22:10", returnDate: "2026-11-20", provider: "LATAM", reservation: "ABC123", passengers: 2, customers: [{ id: "c1", name: "Maria Souza" }], doneOutAt: "2026-11-11T10:00:00Z" })),
  ...rowsOf(item({ id: "b", kind: "FLIGHT", origin: "CNF", destination: "MIA", departureDate: "2026-11-13", program: "Smiles" })),
];
const data = (o: Partial<TrackingList> = {}): TrackingList => ({
  tab: "voos", period: "proximos", range: { from: T, to: null }, today: T, rows, counts: { proximos: 3, "7": 2, "30": 3, todos: 5 }, undated: 1,
  kpis: trackKpis(rows, T), prevValueCents: null, ...o,
});

describe("Acompanhamentos: lista", () => {
  it("indicadores, períodos com contagem, linhas por dia, marcação e pendências", () => {
    const h = html(createElement(TrackingClient, { tab: "voos", initial: data(), members: [{ id: "m1", name: "Bia", color: "#fff" }], canEdit: true, me: null }));
    expect(h).toContain("Valor total");
    expect(h).toContain("R$ 200,00");
    expect(h).toContain("Voos no período");
    expect(h).toContain("Check-in pendente");
    expect(h).toContain("Sem companhia");
    expect(h).toMatch(/Próximos <span[^>]*>3</);
    expect(h).toMatch(/Todos <span[^>]*>5</);
    expect(h).toContain(">Hoje<");
    expect(h).toContain(">Amanhã<");
    expect(h.indexOf(">Hoje<")).toBeLessThan(h.indexOf(">Amanhã<")); // dias em ordem, mesmo com as linhas fora de ordem
    expect(h.indexOf(">Amanhã<")).toBeLessThan(h.indexOf("Sexta-feira, 20 de novembro"));
    expect(h).toContain("GRU → LIS");
    expect(h).toContain("São Paulo → Lisboa");
    expect(h).toContain("Hoje, 22:10");
    expect(h).toContain("Maria Souza");
    expect(h).toContain("2 passageiros");
    expect(h).toContain("ABC123");
    expect(h).toMatch(/aria-pressed="true"[^>]*>.*Check-in feito/);
    expect(h).toContain("Sem companhia aérea");
    expect(h).toContain("(emitido com Smiles)");
    expect(h).toContain("1 voo sem data não aparece");
    expect(h).toContain('href="/app/sales?edit=s-a"');
    expect(h).toContain("Completar GRU → LIS");
    const ro = html(createElement(TrackingClient, { tab: "voos", initial: data(), members: [], canEdit: false, me: null }));
    expect(ro).not.toContain("Completar GRU → LIS");
    expect(ro).toContain("Só quem edita vendas pode marcar");
  });

  it("vazio e as outras abas", () => {
    const empty = html(createElement(TrackingClient, { tab: "hospedagens", initial: data({ tab: "hospedagens", rows: [], counts: { proximos: 0, "7": 0, "30": 0, todos: 0 }, undated: 0, kpis: trackKpis([], T) }), members: [], canEdit: true, me: null }));
    expect(empty).toContain("Nenhuma hospedagem encontrada");
    expect(empty).toContain("Hóspedes");
    expect(empty).toContain("Sem hotel");
    expect(empty).toContain("data de entrada");
  });
});

describe("Acompanhamentos: mapa", () => {
  it("legenda com contagem, clientes ativos, bolinhas por cidade e viagens sem lugar", () => {
    const now = { day: T, time: "09:00" };
    const trips = mapTrips([
      item({ id: "a", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-10", returnDate: "2026-11-17", customers: [{ id: "c1", name: "Maria" }] }),
      item({ id: "b", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-09", returnDate: "2026-11-19", customers: [{ id: "c2", name: "João" }] }),
      item({ id: "c", kind: "FLIGHT", origin: "CNF", destination: "MIA", departureDate: "2026-11-13" }),
      item({ id: "d", kind: "FLIGHT", origin: "GRU", destination: "XYZ", departureDate: "2026-11-01", returnDate: "2026-11-30" }),
    ], now);
    const h = html(createElement(TravelMap, { now, trips }));
    expect(h).toMatch(/Em viagem<span class="tabular-nums text-muted">3</);
    expect(h).toMatch(/Embarque em 48h<span class="tabular-nums text-muted">1</);
    expect(h).toContain("4 clientes ativos");
    expect(h).toContain('aria-label="Lisboa: 2 viagens"');
    expect(h).toContain('aria-label="Belo Horizonte: 1 viagem"');
    expect(h).toContain("1 viagem não aparece no mapa");
    expect(h).toContain("Clique em uma bolinha");
    const none = html(createElement(TravelMap, { now, trips: [] }));
    expect(none).toContain("0 clientes ativos");
    expect(none).toContain("Ninguém viajando agora");
  });
});

describe("Formulário de venda", () => {
  it("tipos novos com os campos de viagem de cada um (lugar, fornecedor, datas e horários)", () => {
    const it0 = { issuedWith: "CASH", points: 0, salePriceCents: 10_000, cashCostCents: 0, costs: [], clientType: "FINAL", customerIds: [], customers: [], passengers: 1, reservation: null, origin: null, description: null, observation: null, doneOutAt: null, doneRetAt: null };
    const editing = {
      id: "s1", origin: "OWN", accountId: null, supplierAccountId: null, date: "2026-11-12T00:00:00.000Z", points: 0,
      items: [
        { ...it0, id: "i1", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-20T00:00:00.000Z", returnDate: null, departureTime: "10:30", returnTime: null, provider: "LATAM" },
        { ...it0, id: "i2", kind: "HOTEL", destination: "LIS", departureDate: "2026-11-20T00:00:00.000Z", returnDate: "2026-11-25T00:00:00.000Z", departureTime: null, returnTime: null, provider: "Hotel Avenida" },
        { ...it0, id: "i3", kind: "CRUISE", destination: "RIO", departureDate: "2026-12-01T00:00:00.000Z", returnDate: "2026-12-08T00:00:00.000Z", departureTime: "16:00", returnTime: null, provider: "MSC Seaview" },
        { ...it0, id: "i4", kind: "INSURANCE", destination: "LIS", departureDate: "2026-11-20T00:00:00.000Z", returnDate: "2026-11-25T00:00:00.000Z", departureTime: null, returnTime: null, provider: null },
      ],
    };
    const h = html(createElement(SaleDialog, { onClose() {}, accounts: [], suppliers: [], customers: [], cards: [], editing } as never));
    expect(h).toContain("Item 3: Cruzeiro");
    expect(h).toContain("Item 4: Seguro viagem");
    expect(h).toContain('aria-label="Companhia aérea do item 1"');
    expect(h).toContain('value="LATAM"');
    expect(h).toContain('aria-label="Horário de ida do item 1"');
    expect(h).toContain('value="10:30"');
    expect(h).toContain('aria-label="Hotel do item 2"');
    expect(h).toContain('aria-label="Entrada do item 2"');
    expect(h).not.toContain("Horário de entrada"); // hospedagem sem horário
    expect(h).toContain('aria-label="Porto de embarque"');
    expect(h).toContain('aria-label="Navio ou companhia do item 3"');
    expect(h).toContain('aria-label="Horário de embarque do item 3"');
    expect(h).toContain('aria-label="Seguradora do item 4"');
    expect(h).toContain('aria-label="Fim da vigência do item 4"');
  });
});

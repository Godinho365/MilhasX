import { describe, it, expect } from "vitest";
import { replayLedger, cpmCents, marketValueCents, type LedgerEntry } from "@/domain/ledger";

let seq = 0;
const d = (day: number) => new Date(Date.UTC(2026, 9, day));
function e(p: Partial<LedgerEntry> & Pick<LedgerEntry, "accountId" | "type" | "points">): LedgerEntry {
  seq++;
  return {
    id: `e${String(seq).padStart(4, "0")}`,
    status: "CONFIRMED",
    inputCostCents: 0,
    occurredAt: d(1),
    createdAt: new Date(1_700_000_000_000 + seq),
    groupId: null,
    ...p,
  };
}

describe("custo do milheiro", () => {
  it("CPM = valor / quantidade × 1000", () => {
    expect(cpmCents(55800, 18000)).toBe(3100); // R$ 558,00 / 18.000 = R$ 31,00
    expect(cpmCents(0, 0)).toBeNull();
  });

  it("média ponderada entre compras", () => {
    const r = replayLedger([
      e({ accountId: "A", type: "PURCHASE", points: 10000, inputCostCents: 30000 }),
      e({ accountId: "A", type: "PURCHASE", points: 30000, inputCostCents: 60000 }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.accounts.get("A")!;
    expect(a.balance).toBe(40000);
    expect(a.costCents).toBe(90000);
    expect(cpmCents(a.costCents, a.balance)).toBe(2250);
    expect(a.investedCents).toBe(90000);
  });

  it("créditos gratuitos diluem o custo médio", () => {
    const r = replayLedger([
      e({ accountId: "A", type: "PURCHASE", points: 10000, inputCostCents: 30000 }),
      e({ accountId: "A", type: "CARD", points: 10000 }),
    ]);
    if (!r.ok) throw new Error(r.erro);
    expect(cpmCents(r.accounts.get("A")!.costCents, 20000)).toBe(1500);
  });

  it("valor de mercado é separado do custo", () => {
    expect(marketValueCents(10000, 2450)).toBe(24500);
  });
});

describe("transferência bonificada (bate com o extrato observado)", () => {
  it("18.000 pts por R$ 558,00 + 2.000 de clube por R$ 49,90 → 20.000 com 25% de bônus", () => {
    const g = "g1";
    const r = replayLedger([
      e({ accountId: "LIV", type: "CLUB", points: 2000, inputCostCents: 4990, occurredAt: d(21) }),
      e({ accountId: "LIV", type: "PURCHASE", points: 18000, inputCostCents: 55800, occurredAt: d(22) }),
      e({ accountId: "LIV", type: "TRANSFER_OUT", points: -20000, groupId: g, occurredAt: d(23) }),
      e({ accountId: "LAT", type: "TRANSFER_IN", points: 20000, groupId: g, occurredAt: d(23) }),
      e({ accountId: "LAT", type: "TRANSFER_BONUS", points: 5000, groupId: g, occurredAt: d(23) }),
    ]);
    if (!r.ok) throw new Error(r.erro);
    const costs = [...r.entryCosts.values()];
    expect(costs.slice(3)).toEqual([48632, 12158]); // R$ 486,32 e R$ 121,58
    const lat = r.accounts.get("LAT")!;
    expect(lat.balance).toBe(25000);
    expect(lat.costCents).toBe(60790);
    expect(cpmCents(lat.costCents, lat.balance)).toBe(2432); // R$ 24,32
    expect(r.accounts.get("LIV")).toMatchObject({ balance: 0, costCents: 0 });
  });

  it("o custo total é preservado (sem perder centavos no arredondamento)", () => {
    const g = "g2";
    const r = replayLedger([
      e({ accountId: "A", type: "PURCHASE", points: 3333, inputCostCents: 10001 }),
      e({ accountId: "A", type: "TRANSFER_OUT", points: -3333, groupId: g, occurredAt: d(2) }),
      e({ accountId: "B", type: "TRANSFER_IN", points: 3333, groupId: g, occurredAt: d(2) }),
      e({ accountId: "B", type: "TRANSFER_BONUS", points: 1111, groupId: g, occurredAt: d(2) }),
    ]);
    if (!r.ok) throw new Error(r.erro);
    expect(r.accounts.get("B")!.costCents).toBe(10001);
  });
});

describe("débitos e consistência", () => {
  it("débito remove custo proporcional e mantém o CPM", () => {
    const r = replayLedger([
      e({ accountId: "A", type: "PURCHASE", points: 10000, inputCostCents: 25000 }),
      e({ accountId: "A", type: "SALE", points: -4000, occurredAt: d(2) }),
    ]);
    if (!r.ok) throw new Error(r.erro);
    const a = r.accounts.get("A")!;
    expect(a).toMatchObject({ balance: 6000, costCents: 15000 });
    expect(cpmCents(a.costCents, a.balance)).toBe(2500);
  });

  it("rejeita débito maior que o saldo", () => {
    const r = replayLedger([
      e({ accountId: "A", type: "CARD", points: 100 }),
      e({ accountId: "A", type: "EXPIRATION", points: -101, occurredAt: d(2) }),
    ]);
    expect(r.ok).toBe(false);
  });

  it("ordem cronológica importa: débito antes do crédito falha", () => {
    const r = replayLedger([
      e({ accountId: "A", type: "OTHER_DEBIT", points: -50, occurredAt: d(1) }),
      e({ accountId: "A", type: "CARD", points: 100, occurredAt: d(2) }),
    ]);
    expect(r.ok).toBe(false);
  });

  it("pontos a receber (pendentes) não entram no saldo", () => {
    const r = replayLedger([
      e({ accountId: "A", type: "CARD", points: 100 }),
      e({ accountId: "A", type: "PURCHASE", points: 900, inputCostCents: 100, status: "PENDING" }),
    ]);
    if (!r.ok) throw new Error(r.erro);
    expect(r.accounts.get("A")).toMatchObject({ balance: 100, pendingPoints: 900, costCents: 0 });
  });

  it("rejeita sinal incompatível com o tipo", () => {
    expect(replayLedger([e({ accountId: "A", type: "CARD", points: -5 })]).ok).toBe(false);
    expect(replayLedger([e({ accountId: "A", type: "SALE", points: 5 })]).ok).toBe(false);
  });

  // Caso real: compra e transferência no dia 27, mas a entrada no destino ficou com data 26.
  // A entrada era processada antes da saída e chegava sem custo ("Orgânico").
  it("transferência leva o custo mesmo com a entrada datada antes da saída", () => {
    const groupId = "g1";
    const at = new Date(1_700_000_100_000);
    const r = replayLedger([
      e({ accountId: "LIV", type: "OTHER_CREDIT", points: 5500, occurredAt: d(24) }),
      e({ accountId: "LIV", type: "PURCHASE", points: 45000, inputCostCents: 139050, occurredAt: d(27) }),
      e({ accountId: "LIV", type: "TRANSFER_OUT", points: -50000, occurredAt: d(27), createdAt: at, groupId }),
      e({ accountId: "LAT", type: "TRANSFER_IN", points: 50000, occurredAt: d(26), createdAt: at, groupId }),
      e({ accountId: "LAT", type: "TRANSFER_BONUS", points: 12500, occurredAt: d(26), createdAt: at, groupId }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = Math.round((139050 * 50000) / 50500);
    expect(r.accounts.get("LAT")).toMatchObject({ balance: 62500, costCents: out });
    expect(r.accounts.get("LIV")).toMatchObject({ balance: 500, costCents: 139050 - out });
  });
});

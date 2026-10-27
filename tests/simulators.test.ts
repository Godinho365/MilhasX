import { describe, it, expect } from "vitest";
import {
  simulateBonusPurchase, simulateStoreComparison, simulateBuyPoints, simulateTransfer, simulateFlight, simulateHotel,
  simulateSale, simulateMilesSale, rankSuppliers, simulationTitle,
} from "@/domain/simulators";

describe("simuladores", () => {
  it("compra bonificada: custo dos pontos é o extra; CPM da conta antes e depois", () => {
    const r = simulateBonusPurchase({ valueCents: 100000, pointsPerReal: 12, extraCostCents: 5000, account: { balance: 10000, costCents: 30000 } });
    expect(r).toMatchObject({ points: 12000, cpmExtraCents: 417, cpmTotalCents: 8750, accountCpmBefore: 3000, accountCpmAfter: 1591 });
  });

  it("pontos vs cashback: custo efetivo, vencedor e ponto de empate", () => {
    const r = simulateStoreComparison({ milheiroCents: 2000, pointsPriceCents: 100000, pointsPerReal: 5, cashbackPriceCents: 98000, cashbackPercent: 10 });
    expect(r).toMatchObject({ points: 5000, pointsValueCents: 10000, pointsEffectiveCents: 90000, cashbackCents: 9800, cashbackEffectiveCents: 88200, winner: "cashback", savingCents: 1800, breakEvenCpmCents: 2360 });
    expect(simulateStoreComparison({ milheiroCents: 3000, pointsPriceCents: 100000, pointsPerReal: 5, cashbackPriceCents: 98000, cashbackPercent: 10 }).winner).toBe("points");
  });

  it("compra de pontos: CPM da compra, da conta e comparação com o mercado", () => {
    const r = simulateBuyPoints({ points: 10000, costCents: 28000, account: { balance: 20000, costCents: 40000 }, marketCpmCents: 2500 });
    expect(r).toMatchObject({ purchaseCpmCents: 2800, accountCpmBefore: 2000, accountCpmAfter: 2267, newBalance: 30000, vsMarketCents: -300 });
  });

  it("transferência: mesmas regras do lançamento (bônus, paridade, taxas, carrinho)", () => {
    expect(simulateTransfer({ points: 20000, bonusPercent: 25, source: { balance: 20000, costCents: 60800 } })).toMatchObject({ basePoints: 20000, bonusPoints: 5000, totalPoints: 25000, costCents: 60800, destCpmCents: 2432, enough: true });
    expect(simulateTransfer({ points: 6000, bonusPercent: 50, parityFrom: 3, parityTo: 2, feeCents: 1000, source: { balance: 10000, costCents: 30000 } })).toMatchObject({ basePoints: 4000, bonusPoints: 2000, costCents: 19000 });
    expect(simulateTransfer({ points: 10000, bonusPercent: 0, source: { balance: 10000, costCents: 30000 }, purchase: { points: 5000, priceCents: 25000, applyAll: true } }).costCents).toBe(40000);
    expect(simulateTransfer({ points: 10000, bonusPercent: 0, source: { balance: 10000, costCents: 30000 }, purchase: { points: 5000, priceCents: 25000, applyAll: false } }).costCents).toBe(36667);
    const short = simulateTransfer({ points: 50000, bonusPercent: 0, source: { balance: 10000, costCents: 30000 }, destination: { balance: 0, costCents: 0 } });
    expect(short.enough).toBe(false);
  });

  it("passagem aérea e hospedagem: pontos pelo CPM da conta + taxas", () => {
    expect(simulateFlight({ outboundPoints: 15000, returnPoints: 10000, taxesCents: 30000, account: { balance: 50000, costCents: 100000 } })).toMatchObject({ points: 25000, accountCpmCents: 2000, pointsCostCents: 50000, totalCostCents: 80000, enough: true, balanceAfter: 25000 });
    expect(simulateHotel({ points: 60000, discountPercent: 20, taxesCents: 5000, account: { balance: 100000, costCents: 250000 } })).toMatchObject({ points: 48000, savedPoints: 12000, pointsCostCents: 120000, totalCostCents: 125000 });
  });

  it("venda: lucro, margem e preço por milheiro", () => {
    expect(simulateSale({ points: 25000, saleCents: 75000, extraCostsCents: 5000, costCpmCents: 2000 })).toMatchObject({ pointsCostCents: 50000, profitCents: 20000, marginPct: 26.7, saleCpmCents: 3000 });
    expect(simulateMilesSale({ points: 10000, priceCpmCents: 2800, feesCents: 1000, avgCpmCents: 2200 })).toMatchObject({ grossCents: 28000, netCents: 27000, costCents: 22000, profitCents: 5000 });
  });

  it("melhor fornecedor: elegíveis primeiro, do mais barato ao mais caro", () => {
    const r = rankSuppliers(
      [
        { id: "a", supplier: "A", identifier: null, balance: 50000, priceCpmCents: 1700, cpfAvailable: 1 },
        { id: "b", supplier: "B", identifier: null, balance: 50000, priceCpmCents: 1600, cpfAvailable: 0 },
        { id: "c", supplier: "C", identifier: null, balance: 10000, priceCpmCents: 1500, cpfAvailable: null },
      ],
      30000,
      1,
    );
    expect(r.map((x) => [x.id, x.eligible, x.costCents])).toEqual([["a", true, 51000], ["c", false, 45000], ["b", false, 48000]]);
    expect(r[2]!.reasons).toEqual(["CPFs insuficientes"]);
  });

  it("título das simulações recentes", () => {
    expect(simulationTitle({ from: "Livelo", to: "LATAM PASS", points: 2000 })).toBe("Livelo → LATAM PASS · 2 mil pts");
    expect(simulationTitle({ label: "Compra Bonificada", points: 1500 })).toBe("Compra Bonificada · 1,5 mil pts");
  });
});

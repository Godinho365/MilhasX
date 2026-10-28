import { describe, it, expect } from "vitest";
import { usdToBrlCents, quoteCost, cheapestQuote, routesTo, projectClub, bonusTransfer, directCpm, bonusLimit, cartBug } from "@/domain/calculators";

describe("calculadoras", () => {
  it("comparador: custo dos pontos + taxas, lucro, margem e a mais barata", () => {
    expect(quoteCost({ points: 50000, cpmCents: 1600, boardingCents: 10000, otherCents: 2000, saleCents: 150000 }))
      .toEqual({ pointsCostCents: 80000, feesCents: 12000, totalCents: 92000, profitCents: 58000, marginPct: 38.7 });
    expect(quoteCost({ points: 10000, cpmCents: 2000, boardingCents: 0, otherCents: 0 }).profitCents).toBeNull();
    const a = { points: 50000, cpmCents: 1600, boardingCents: 1000, otherCents: 0 };
    const b = { points: 40000, cpmCents: 1600, boardingCents: 1000, otherCents: 0 };
    expect(cheapestQuote([a, b, { points: 0, cpmCents: 0, boardingCents: 0, otherCents: 0 }])).toBe(1);
    expect(cheapestQuote([])).toBeNull();
    // US$ 100 a R$ 5,50 com IOF 3,5% = R$ 569,25
    expect(usdToBrlCents(10000, 5500, 3.5)).toBe(56925);
  });

  it("rotas: diretas e com uma escala, com a paridade acumulada", () => {
    const p = [
      { fromId: "livelo", toId: "azul", fromUnits: 1, toUnits: 1 },
      { fromId: "azul", toId: "accor", fromUnits: 1, toUnits: 5.5 },
      { fromId: "esfera", toId: "accor", fromUnits: 3, toUnits: 1 },
    ];
    const r = routesTo(p, "accor");
    expect(r.map((x) => [x.path.join(">"), x.ratio])).toEqual([["azul>accor", 5.5], ["esfera>accor", 1 / 3], ["livelo>azul>accor", 5.5]]);
    expect(routesTo(p, "accor", 0)).toHaveLength(2);
  });

  it("assinatura: bônus de adesão, por X meses, permanência e descontos", () => {
    const r = projectClub({ miles: 1000, monthlyCents: 5000, months: 3, signupBonus: 1000, bonusPct: { pct: 100, months: 1 }, bonusEvery: { miles: 500, every: 3 }, discountPctFor: { pct: 50, months: 1 } });
    expect(r.rows.map((x) => [x.miles, x.paidCents])).toEqual([[3000, 2500], [1000, 5000], [1500, 5000]]);
    expect(r).toMatchObject({ totalMiles: 5500, totalPaidCents: 12500, avgCpmCents: 2273 });
    expect(projectClub({ miles: 1000, monthlyCents: 1000, months: 1, discountCents: 5000 }).rows[0]!.paidCents).toBe(0);
  });

  it("transferência bonificada com pointsback e CPM", () => {
    expect(bonusTransfer({ points: 50000, bonusPct: 80 })).toMatchObject({ bonus: 40000, received: 90000, finalCpmCents: null });
    expect(bonusTransfer({ points: 50000, bonusPct: 80, pointsbackPct: 10, cpmCents: 3000 }))
      .toEqual({ bonus: 40000, received: 90000, pointsback: 5000, costCents: 150000, netCostCents: 135000, finalCpmCents: 1500 });
  });

  it("CPM da compra direta e limite de bonificação", () => {
    expect(directCpm(10000, 15000)).toBe(1500);
    expect(directCpm(0, 15000)).toBeNull();
    expect(bonusLimit({ maxBonus: 300000, bonusPct: 80 })).toEqual({ origin: 375000, destBase: 375000, bonus: 300000, received: 675000 });
    expect(bonusLimit({ maxBonus: 100000, bonusPct: 100, parityFrom: 3, parityTo: 1 })).toMatchObject({ origin: 300000, destBase: 100000 });
    expect(bonusLimit({ maxBonus: 1, bonusPct: 0 })).toBeNull();
  });

  it("bug do carrinho: pontos + dinheiro, depois bônus", () => {
    expect(cartBug({ miles: 20000, bonusPct: 100, pointsUsed: 10000, pointsCpmCents: 2000, cashCents: 20000 }))
      .toEqual({ received: 40000, pointsCostCents: 20000, costCents: 40000, cpmWithoutBonusCents: 2000, finalCpmCents: 1000 });
  });
});

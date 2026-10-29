// Compra parcelada com antecipação das n−1 parcelas (exemplo real da Livelo: R$ 3.080 em 12x).
import { describe, it, expect } from "vitest";
import { planCost, scaleCosts } from "@/domain/installments";

describe("parcelamento e antecipação", () => {
  it("12x antecipando 11 parcelas por R$ 2.685,75", () => {
    const r = planCost(308_000, { installments: 12, anticipate: true, payoffCents: 268_575 });
    expect(r).toMatchObject({ firstCents: 25_674, installmentCents: 25_666, restCents: 282_326, effectiveCents: 294_249, discountCents: 13_751 });
    expect(r.discountPct).toBe(4.87);
    expect(r.discountTotalPct).toBe(4.46);
    expect(r.monthlyRatePct).toBeGreaterThan(0.8);
    expect(r.monthlyRatePct).toBeLessThan(0.9);
  });

  it("à vista ou parcelado sem antecipar mantém o valor cheio", () => {
    expect(planCost(308_000, { installments: 1, anticipate: false, payoffCents: null }).effectiveCents).toBe(308_000);
    expect(planCost(308_000, { installments: 6, anticipate: false, payoffCents: null }).effectiveCents).toBe(308_000);
  });

  it("quitação maior que as parcelas é ignorada", () => {
    expect(planCost(308_000, { installments: 12, anticipate: true, payoffCents: 300_000 }).effectiveCents).toBe(308_000);
  });

  it("distribui o custo real entre as linhas de custo", () => {
    const rows = scaleCosts([{ type: "PONTOS", amountCents: 300_000 }, { type: "IOF", amountCents: 8_000 }], 294_249);
    expect(rows.reduce((t, c) => t + c.amountCents, 0)).toBe(294_249);
    expect(rows[0].amountCents).toBe(286_606);
  });
});

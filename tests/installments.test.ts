// Compra parcelada com antecipação das n−1 parcelas (exemplo real da Livelo: R$ 3.080 em 12x).
import { describe, it, expect } from "vitest";
import { ANTICIPATION_MONTHLY_RATE, planCost, scaleCosts } from "@/domain/installments";

describe("parcelamento e antecipação", () => {
  it("12x antecipando 11 parcelas por R$ 2.685,75", () => {
    const r = planCost(308_000, { installments: 12, anticipate: true, payoffCents: 268_575 });
    expect(r).toMatchObject({ firstCents: 25_674, installmentCents: 25_666, restCents: 282_326, effectiveCents: 294_249, discountCents: 13_751 });
    expect(r.discountPct).toBe(4.87);
    expect(r.discountTotalPct).toBe(4.46);
    expect(r.monthlyRatePct).toBeGreaterThan(0.8);
    expect(r.monthlyRatePct).toBeLessThan(0.9);
  });

  it("antecipando sem informar o valor para quitar, o desconto sai estimado pela taxa da Livelo", () => {
    // o próprio exemplo da Livelo: estimado dá o mesmo valor que ela cobrou para quitar
    expect(planCost(308_000, { installments: 12, anticipate: true, payoffCents: null })).toMatchObject({ payoffCents: 268_575, estimated: true, discountCents: 13_751, effectiveCents: 294_249, discountPct: 4.87 });
    expect(ANTICIPATION_MONTHLY_RATE).toBeGreaterThan(0.0083);
    expect(ANTICIPATION_MONTHLY_RATE).toBeLessThan(0.0086);
    // outra compra em 12x: o mesmo % nas parcelas antecipadas
    const r12 = planCost(623_700, { installments: 12, anticipate: true, payoffCents: null });
    expect(r12).toMatchObject({ restCents: 571_725, estimated: true, discountPct: 4.87 });
    expect(r12.effectiveCents).toBe(623_700 - r12.discountCents);
    // em 6x são só 5 parcelas a antecipar: desconto menor
    const r6 = planCost(308_000, { installments: 6, anticipate: true, payoffCents: null });
    expect(r6.discountPct).toBeGreaterThan(2);
    expect(r6.discountPct).toBeLessThan(r12.discountPct!);
  });

  it("o valor para quitar informado vale no lugar do estimado", () => {
    expect(planCost(308_000, { installments: 12, anticipate: true, payoffCents: 270_000 })).toMatchObject({ payoffCents: 270_000, estimated: false, discountCents: 12_326, effectiveCents: 295_674 });
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

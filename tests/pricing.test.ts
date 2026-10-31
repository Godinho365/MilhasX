// Milheiro sugerido por ROE (lucro ÷ custo dos pontos).
import { describe, it, expect } from "vitest";
import { priceForRoe, priceOptions, roeOf } from "@/domain/pricing";

describe("milheiro sugerido", () => {
  it("preço para um ROE e ROE de um preço", () => {
    expect(priceForRoe(2353, 10)).toBe(2588); // R$ 23,53 + 10% = R$ 25,88
    expect(roeOf(2532, 2353)).toBe(7.6);
    expect(roeOf(2353, 2353)).toBe(0);
  });

  it("opções em ordem de preço, com lucro e lucro por CPF", () => {
    const o = priceOptions({ costCpmCents: 2353, avgSaleCpmCents: 2532, points: 40_000, cpfs: 1 });
    expect(o.map((x) => x.key)).toEqual(["zero", "avg", "roe10", "roe15", "roe20"]);
    expect(o[0]).toMatchObject({ cpmCents: 2353, roePct: 0, profitCents: 0 });
    expect(o.find((x) => x.key === "avg")).toMatchObject({ cpmCents: 2532, roePct: 7.6, profitCents: 7160, profitPerCpfCents: 7160 });
    expect(o.find((x) => x.key === "roe20")).toMatchObject({ cpmCents: 2824, profitCents: 18840 });
  });

  it("sem média de venda, mostra só o mínimo e as metas de ROE", () => {
    expect(priceOptions({ costCpmCents: 2000, avgSaleCpmCents: null, points: 10_000, cpfs: 2 }).map((x) => x.key)).toEqual(["zero", "roe10", "roe15", "roe20"]);
  });
});

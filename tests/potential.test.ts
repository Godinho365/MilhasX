// Potencial de lucro: histórico aplicado ao estoque, com gargalo de pontos ou de CPFs.
import { describe, it, expect } from "vitest";
import { programPotential } from "@/domain/potential";

const hist = { points: 160_000, pointsValueCents: 400_000, cpfs: 5, sales: 4 }; // R$ 25/milheiro, 32.000 pts por CPF

describe("potencial de lucro", () => {
  it("pontos acabam antes dos CPFs", () => {
    const p = programPotential({ stockPoints: 320_000, stockCostCents: 640_000, cpfFree: 90, hist }); // custo R$ 20
    expect(p).toMatchObject({ saleCpmCents: 2500, costCpmCents: 2000, profitPerMilCents: 500, ptsPerCpf: 32_000, emissions: 10, bottleneck: "PONTOS", usedPoints: 320_000 });
    expect(p.revenueCents).toBe(800_000);
    expect(p.profitCents).toBe(160_000);
    expect(p.roePct).toBe(25);
    expect(p.marginPct).toBe(20);
  });

  it("CPFs acabam antes dos pontos", () => {
    const p = programPotential({ stockPoints: 320_000, stockCostCents: 640_000, cpfFree: 2, hist });
    expect(p).toMatchObject({ bottleneck: "CPFS", usedPoints: 64_000, emissions: 2, profitCents: 32_000 });
  });

  it("sem histórico: só o preço mínimo (custo atual)", () => {
    const p = programPotential({ stockPoints: 90_000, stockCostCents: 261_000, cpfFree: null, hist: { points: 0, pointsValueCents: 0, cpfs: 0, sales: 0 } });
    expect(p).toMatchObject({ costCpmCents: 2900, profitCents: null, bottleneck: null });
  });

  it("custo acima do preço histórico dá prejuízo", () => {
    const p = programPotential({ stockPoints: 100_000, stockCostCents: 290_000, cpfFree: null, hist });
    expect(p.profitCents).toBe(-40_000);
  });
});

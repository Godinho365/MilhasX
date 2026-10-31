// Espaço por conta e sugestão de conta para emitir (milhas × CPFs livres).
import { describe, it, expect } from "vitest";
import { accountSpace, capacityPotential, emissionFit, maxTransferForSpace, rankForEmission } from "@/domain/capacity";

const m = 32_000;

describe("espaço por conta", () => {
  it("capacidade, espaço e emissões que o saldo paga (milhas reservadas descontadas)", () => {
    expect(accountSpace({ balance: 81_137, reserved: 0, cpfFree: 21, ptsPerCpf: m })).toEqual({ capacity: 672_000, space: 590_863, emissionsLeft: 2.5 });
    expect(accountSpace({ balance: 300_000, reserved: 20_000, cpfFree: 6, ptsPerCpf: m }).space).toBe(192_000 - 280_000); // encalhe
  });

  it("potencial: capacidade × preço médio de venda; lucro pelo custo atual da conta", () => {
    expect(capacityPotential(807_208, 2532, 2287)).toEqual({ revenueCents: 2_043_851, profitCents: 197_766 });
    expect(capacityPotential(500_000, null, 2000)).toEqual({ revenueCents: null, profitCents: null }); // sem vendas ainda
    expect(capacityPotential(500_000, 2500, null)).toEqual({ revenueCents: 1_250_000, profitCents: null }); // conta sem custo
  });

  it("até quanto transferir: 1:1 com 30% de bônus", () => {
    expect(maxTransferForSpace(130_000, 1, 1, 30)).toBe(100_000);
    expect(maxTransferForSpace(-5, 1, 1, 30)).toBe(0);
  });
});

describe("sugestão de conta para emitir", () => {
  const acc = (name: string, balance: number, cpfFree: number) => ({ name, load: { balance, reserved: 0, cpfFree, ptsPerCpf: m } });
  const contas = [acc("poucos CPFs", 300_000, 6), acc("muitos CPFs", 180_000, 16), acc("meio", 250_000, 12)];

  it("emissão pesada vai para a conta com milhas sobrando; leve, para a com CPFs sobrando", () => {
    const rank = (points: number) => rankForEmission(contas.map((c) => ({ ...c, fit: emissionFit(c.load, points, 1) })), points, 1).map((c) => c.name);
    expect(rank(80_000)[0]).toBe("poucos CPFs");
    expect(rank(15_000)[0]).toBe("muitos CPFs");
  });

  it("passageiro que já é beneficiário (0 CPF novo) vem primeiro; sem saldo ou sem CPF vai para o fim", () => {
    const list = [
      { name: "sem saldo", load: { balance: 10_000, reserved: 0, cpfFree: 20, ptsPerCpf: m } },
      { name: "sem CPF", load: { balance: 200_000, reserved: 0, cpfFree: 0, ptsPerCpf: m } },
      { name: "normal", load: { balance: 200_000, reserved: 0, cpfFree: 10, ptsPerCpf: m } },
      { name: "já beneficiário", load: { balance: 200_000, reserved: 0, cpfFree: 10, ptsPerCpf: m } },
    ].map((c) => ({ ...c, fit: emissionFit(c.load, 30_000, c.name === "já beneficiário" ? 0 : 1) }));
    const order = rankForEmission(list, 30_000, 1).map((c) => c.name);
    expect(order.slice(0, 2)).toEqual(["já beneficiário", "normal"]);
    expect(order.slice(2).sort()).toEqual(["sem CPF", "sem saldo"]);
    const f = emissionFit({ balance: 200_000, reserved: 0, cpfFree: 0, ptsPerCpf: m }, 30_000, 1);
    expect(f).toMatchObject({ enough: true, cpfShort: true, cpfAfter: -1 });
  });
});

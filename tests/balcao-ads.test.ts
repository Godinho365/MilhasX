// Leitor dos anúncios dos grupos de balcão, com os jeitos de escrever que aparecem nos grupos.
import { describe, it, expect } from "vitest";
import { parseBalcaoAd } from "@/domain/balcao-ads";
import { matchAlerts, describeAlert, type AlertRule } from "@/domain/telegram-alerts";

const ad = (text: string) => parseBalcaoAd(text);

describe("anúncios do balcão", () => {
  it("lê programa, milhas, CPFs e milheiro nos formatos dos grupos", () => {
    expect(ad("SMILES\n169 K\n1 CPF\n15,50 REAIS O MILHEIRO")).toEqual({ kind: "COMPRA", program: "Smiles", miles: 169_000, cpfs: 1, cpmCents: 1550 });
    expect(ad("COMPRO 197,6K SMILES \n1 CPF\n15")).toEqual({ kind: "COMPRA", program: "Smiles", miles: 197_600, cpfs: 1, cpmCents: 1500 });
    expect(ad("Compro 135k latam \n4 cpf \n25 reais")).toEqual({ kind: "COMPRA", program: "LATAM", miles: 135_000, cpfs: 4, cpmCents: 2500 });
    expect(ad("LATAM\n72k \n2 CPFS\nR$25,25")).toEqual({ kind: "COMPRA", program: "LATAM", miles: 72_000, cpfs: 2, cpmCents: 2525 });
    expect(ad("Latam\n79.644\n3 cpf\n25")).toEqual({ kind: "COMPRA", program: "LATAM", miles: 79_644, cpfs: 3, cpmCents: 2500 });
    expect(ad("125 k smiles\n1 cpf\n14,50")).toMatchObject({ program: "Smiles", miles: 125_000, cpfs: 1, cpmCents: 1450 });
    expect(ad("Compro Smiles\n219k\n2cpf\n15.5")).toMatchObject({ program: "Smiles", miles: 219_000, cpfs: 2, cpmCents: 1550 });
    expect(ad("Compro\n410k\nSmiles\n5 CPF\n15")).toMatchObject({ program: "Smiles", miles: 410_000, cpfs: 5, cpmCents: 1500 });
    expect(ad("COMPRO \n156k latam \n1 pax \nVoo dia 10/11\nR$: 24,50")).toMatchObject({ program: "LATAM", miles: 156_000, cpfs: 1, cpmCents: 2450 });
    expect(ad("Compro smiles \n\n70.000\n2 cpf \n17,00")).toMatchObject({ program: "Smiles", miles: 70_000, cpfs: 2, cpmCents: 1700 });
    expect(ad("Compro Latam\n50 k\n1 cpf \n25,00")).toMatchObject({ program: "LATAM", miles: 50_000, cpfs: 1, cpmCents: 2500 });
    expect(ad("LATAM\n8.033\n1 CPF\nR$ 26")).toMatchObject({ program: "LATAM", miles: 8033, cpfs: 1, cpmCents: 2600 });
    expect(ad("C>Latam\n66.177 \n3 cpfs\nR$ 25,00")).toMatchObject({ kind: "COMPRA", program: "LATAM", miles: 66_177, cpfs: 3, cpmCents: 2500 });
    // sem CPF (costuma ser 1) e milheiro alto do AAdvantage, com texto depois
    expect(ad("Compro AA\n28k\n85 voo amanhã")).toEqual({ kind: "COMPRA", program: "AAdvantage", miles: 28_000, cpfs: null, cpmCents: 8500 });
    // sem preço: pede propostas
    expect(ad("Compro LATAM 100k 2 CPF")).toMatchObject({ program: "LATAM", miles: 100_000, cpfs: 2, cpmCents: null });
    expect(ad("Vendo Azul 200k 26")).toMatchObject({ kind: "VENDA", program: "Azul", miles: 200_000, cpmCents: 2600 });
  });

  it("contraproposta, conversa, bot do grupo e crédito não são anúncio", () => {
    for (const t of ["17", "24,5", "16,75", "24?75", "95 voo próximo", "24,5 conta própria", "R$ 105,00, e comigo o compromisso é com a sua emissão garantida",
      "Emitido para @fulano", "✅ Negociação registrada com sucesso!\n\n💰 Fulano vendeu para Beltrano", "Compro 9.200,00 credito Gol- 20%", "Bom dia, pessoal", "Promoção Azul", ""]) {
      expect(ad(t), t).toBeNull();
    }
  });
});

describe("alertas pelo pedido de compra", () => {
  const rule = (o: Partial<AlertRule>): AlertRule => ({ id: "1", name: "A", words: [], active: true, ...o });
  it("programa, até N CPFs, faixa de milhas e milheiro mínimo; só pedidos de compra", () => {
    const smiles = "Compro Smiles\n219k\n2cpf\n15.5";
    expect(matchAlerts(smiles, [rule({ program: "Smiles", maxCpfs: 2, minMiles: 100_000, maxMiles: 300_000, minCpmCents: 1500 })])).toEqual(["A"]);
    expect(matchAlerts(smiles, [rule({ maxCpfs: 1 })])).toEqual([]);
    expect(matchAlerts(smiles, [rule({ minCpmCents: 1600 })])).toEqual([]);
    expect(matchAlerts(smiles, [rule({ maxMiles: 200_000 })])).toEqual([]);
    expect(matchAlerts(smiles, [rule({ program: "LATAM" })])).toEqual([]);
    // sem CPF no anúncio conta 1; sem preço não passa no milheiro mínimo
    expect(matchAlerts("Compro AA\n28k\n85 voo amanhã", [rule({ maxCpfs: 1 })])).toEqual(["A"]);
    expect(matchAlerts("Compro LATAM 100k 2 CPF", [rule({ minCpmCents: 2000 })])).toEqual([]);
    // contraproposta e venda não disparam; palavras juntas com o pedido
    expect(matchAlerts("17", [rule({ minCpmCents: 1000 })])).toEqual([]);
    expect(matchAlerts("Vendo Azul 200k 26", [rule({ program: "Azul" })])).toEqual([]);
    expect(matchAlerts("Compro 135k latam\n4 cpf\n25 reais urgente", [rule({ program: "LATAM", words: ["urgente"] })])).toEqual(["A"]);
  });
  it("descreve o alerta em uma linha", () => {
    expect(describeAlert({ words: ["urgente"], program: "Smiles", maxCpfs: 2, minMiles: 100_000, maxMiles: 300_000, minCpmCents: 1600 })).toBe('Smiles · até 2 CPFs · 100k a 300k milhas · CPM a partir de R$ 16,00 · "urgente"');
    expect(describeAlert({ words: [], maxCpfs: 1, minMiles: 79_644 })).toBe("até 1 CPF · a partir de 79.644 milhas");
  });
});

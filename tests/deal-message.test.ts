// Mensagem de emissão do CRM Milhas: agradecimento, localizador e cobrança pelo PIX.
import { describe, it, expect } from "vitest";
import { formatPixKey, issuedMessage } from "@/domain/deal-message";

const pix = { keyType: "CPF" as const, key: "15526547701", name: "Fulano de Tal", bank: "Nubank" };

describe("mensagem de emissão", () => {
  it("agradece, passa o localizador e cobra pelo PIX", () => {
    const m = issuedMessage({ buyerName: "Nicolas Amaral", locator: "ABC123", passengers: ["Nicolas Eduardo Amaral"], points: 58898, chargeCents: 171230, pix });
    expect(m).toContain("Olá, Nicolas!");
    expect(m).toContain("Muito obrigado pela sua compra!");
    expect(m).toContain("*Localizador:* ABC123");
    expect(m).toContain("*Passageiro:* Nicolas Eduardo Amaral");
    expect(m).toContain("*Milhas:* 58.898");
    expect(m).toContain("💰 Valor: R$ 1.712,30");
    expect(m).toContain("🔑 Chave PIX (CPF): 155.265.477-01");
    expect(m).toContain("👤 Fulano de Tal");
    expect(m).toContain("🏦 Nubank");
  });

  it("com taxas: linha de taxas e o pagamento separa milhas, taxas e total", () => {
    const m = issuedMessage({ buyerName: "Ana", locator: "LA1", passengers: ["Ana Lima"], points: 8673, taxesCents: 3575, chargeCents: 26125, pix });
    expect(m).toContain("*Taxas de embarque:* R$ 35,75");
    expect(m).toContain("✈️ Milhas: R$ 225,50");
    expect(m).toContain("🧾 Taxas: R$ 35,75");
    expect(m).toContain("💰 *Total: R$ 261,25*");
    expect(m).not.toContain("💰 Valor:");
  });

  it("sem PIX nem valor, não mostra a parte de pagamento", () => {
    const m = issuedMessage({ buyerName: "", locator: "XYZ9", passengers: ["A B", "C D"], points: null, chargeCents: null, pix: null });
    expect(m).toContain("*Passageiros:* A B, C D");
    expect(m).not.toContain("Pagamento");
    expect(m.startsWith("Olá! 😊")).toBe(true);
  });

  it("formata CPF e CNPJ; outras chaves como foram digitadas", () => {
    expect(formatPixKey({ keyType: "CNPJ", key: "12345678000199" })).toBe("12.345.678/0001-99");
    expect(formatPixKey({ keyType: "EMAIL", key: " a@b.com " })).toBe("a@b.com");
  });
});

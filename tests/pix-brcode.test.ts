// PIX copia e cola (BR Code): confere contra o exemplo oficial do Banco Central e as regras da chave.
import { describe, it, expect } from "vitest";
import { pixBrCode, pixKeyValue, crc16 } from "@/domain/pix-brcode";
import type { PixInfo } from "@/domain/deal-message";

const BCB = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

describe("PIX copia e cola", () => {
  it("monta igual ao exemplo do Banco Central (CRC 1D3D)", () => {
    const pix: PixInfo = { keyType: "ALEATORIA", key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", bank: "", city: "BRASILIA" };
    expect(pixBrCode({ pix })).toBe(BCB);
  });

  it("o CRC16 do exemplo é 1D3D", () => {
    expect(crc16(BCB.slice(0, -4))).toBe("1D3D");
  });

  it("inclui o valor e fecha com um CRC válido", () => {
    const pix: PixInfo = { keyType: "CPF", key: "111.444.777-35", name: "João da Silva", bank: "Nubank", city: "São Paulo" };
    const code = pixBrCode({ pix, amountCents: 123456 })!;
    expect(code).toContain("54071234.56"); // campo 54: tamanho 07, valor 1234.56
    expect(code).toContain("0014br.gov.bcb.pix0111" + "11144477735"); // chave só com dígitos
    expect(code).toContain("6009Sao Paulo"); // cidade sem acento, cortada em 15
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });

  it("formata a chave conforme o tipo", () => {
    expect(pixKeyValue({ keyType: "CPF", key: "111.444.777-35" })).toBe("11144477735");
    expect(pixKeyValue({ keyType: "TELEFONE", key: "(11) 99999-8888" })).toBe("+5511999998888");
    expect(pixKeyValue({ keyType: "TELEFONE", key: "+55 11 99999-8888" })).toBe("+5511999998888");
    expect(pixKeyValue({ keyType: "EMAIL", key: "eu@exemplo.com" })).toBe("eu@exemplo.com");
  });

  it("sem chave não gera código", () => {
    expect(pixBrCode({ pix: { keyType: "CPF", key: "", name: "x", bank: "" } })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { fmtCpf, fmtPhone, holderPending } from "@/domain/holder-pending";

describe("pendências do titular", () => {
  it("CPF e telefone primeiro, como importantes", () => {
    const p = holderPending({ documents: [], phone: null });
    expect(p.map((x) => x.key)).toEqual(["cpf", "phone", "birth", "email", "address"]);
    expect(p.filter((x) => x.important).map((x) => x.key)).toEqual(["cpf", "phone"]);
  });
  it("cadastro completo não tem pendência", () => {
    expect(holderPending({ documents: [{ type: "CPF", number: "123.456.789-01" }], phone: "61 99999-8888", birthDate: "1997-05-06", accessEmail: "a@b.com", address: "Rua 1" })).toEqual([]);
    expect(holderPending({ documents: [{ type: "CPF", number: "12345678901" }], phone: "6199998888", birthDate: "1997-05-06", accessEmail: "a@b.com", addressParts: { cep: "70000000" } })).toEqual([]);
  });
  it("telefone curto conta como faltando; RG não vale como CPF", () => {
    expect(holderPending({ documents: [{ type: "RG", number: "123" }], phone: "9999" }).slice(0, 2).map((x) => x.key)).toEqual(["cpf", "phone"]);
  });
  it("formata CPF e telefone", () => {
    expect(fmtCpf("12345678901")).toBe("123.456.789-01");
    expect(fmtPhone("61999998888")).toBe("(61) 99999-8888");
    expect(fmtPhone("6133334444")).toBe("(61) 3333-4444");
    expect(fmtPhone("+55 61 99999-8888")).toBe("+55 (61) 99999-8888");
  });
});

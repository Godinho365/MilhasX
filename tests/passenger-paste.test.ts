// Colar passageiros enviados pelo WhatsApp/Telegram.
import { describe, it, expect } from "vitest";
import { parsePassengersText } from "@/domain/miles-deals";

describe("colar passageiros", () => {
  it("um passageiro com rótulos", () => {
    const p = parsePassengersText("Nome: Nicolas Eduardo Amaral\nCPF: 037.355.180-01\nNascimento: 23/03/2002\nSexo: Masculino\nE-mail: nico@x.com\nTel: (21) 99493-4776");
    expect(p).toEqual([{ name: "Nicolas Eduardo Amaral", cpf: "03735518001", birthDate: "2002-03-23", gender: "M", email: "nico@x.com", phone: "(21) 99493-4776" }]);
  });

  it("vários passageiros sem rótulo, separados por linha em branco", () => {
    const p = parsePassengersText("Maria Clara Souza\n123.456.789-09\n20/05/1990\nfeminino\n\nJoão Pedro Lima\n98765432100\n01/01/1985");
    expect(p.map((x) => [x.name, x.cpf, x.birthDate, x.gender])).toEqual([
      ["Maria Clara Souza", "12345678909", "1990-05-20", "F"],
      ["João Pedro Lima", "98765432100", "1985-01-01", ""],
    ]);
  });

  it("vários passageiros colados sem linha em branco", () => {
    const p = parsePassengersText("Ana Lima\nCPF 12345678909\n10/10/2000\nBia Rocha\nCPF 98765432100\n11/11/2001");
    expect(p.map((x) => x.name)).toEqual(["Ana Lima", "Bia Rocha"]);
    expect(p[1]!.birthDate).toBe("2001-11-11");
  });

  it("texto sem passageiro não gera nada", () => {
    expect(parsePassengersText("bom dia, segue os dados")).toEqual([]);
  });
});

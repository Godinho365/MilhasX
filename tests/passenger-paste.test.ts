// Colar passageiros enviados pelo WhatsApp/Telegram.
import { describe, it, expect } from "vitest";
import { buyerDataFromMessages, parsePassengersText, validCpf } from "@/domain/miles-deals";

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

  // formatos das conversas no privado do Chat Balcões (dados inventados)
  it("blocos com rótulo e o contato de todos no fim", () => {
    const p = parsePassengersText(
      "*Nome:* Ana Lima Souza\nCPF: 111.444.777-35\nData de nascimento: 05/06/1990\n\nNome: Bruno Costa\nCPF: 529.982.247-25\nData de nascimento: 12/01/1987\n\nana.lima@exemplo.com\n(21) 99493-4776",
    );
    expect(p).toEqual([
      { name: "Ana Lima Souza", cpf: "11144477735", birthDate: "1990-06-05", gender: "", email: "ana.lima@exemplo.com", phone: "(21) 99493-4776" },
      { name: "Bruno Costa", cpf: "52998224725", birthDate: "1987-01-12", gender: "", email: "ana.lima@exemplo.com", phone: "(21) 99493-4776" },
    ]);
  });

  it("nome, nascimento e CPF sem rótulo, colados", () => {
    const p = parsePassengersText("Carla Dias\n03/04/1995\n39053344705\nDavi Rocha\n10/11/2001\n71460238001");
    expect(p.map((x) => [x.name, x.cpf, x.birthDate])).toEqual([
      ["Carla Dias", "39053344705", "1995-04-03"],
      ["Davi Rocha", "71460238001", "2001-11-10"],
    ]);
  });

  it("celular de 11 dígitos não vira CPF nem outro passageiro", () => {
    const p = parsePassengersText("Eva Martins\n11144477735\n05/06/1990\neva@exemplo.com\n21994934776");
    expect(p).toEqual([{ name: "Eva Martins", cpf: "11144477735", birthDate: "1990-06-05", gender: "", email: "eva@exemplo.com", phone: "21994934776" }]);
  });

  it("CPF com o nome na mesma linha e lista numerada", () => {
    const p = parsePassengersText("1) Ana Lima, CPF 111.444.777-35, 05/06/1990\n2) Bruno Costa 529.982.247-25 12/01/1987");
    expect(p.map((x) => [x.name, x.cpf])).toEqual([["Ana Lima", "11144477735"], ["Bruno Costa", "52998224725"]]);
  });

  it("data futura (a do voo) não é nascimento", () => {
    expect(parsePassengersText("Ana Lima\n111.444.777-35\nvoo 10/12/2099")[0]!.birthDate).toBe("");
  });

  it("CPF válido confere os dígitos verificadores", () => {
    expect(validCpf("111.444.777-35")).toBe(true);
    expect(validCpf("111.444.777-36")).toBe(false);
    expect(validCpf("21994934776")).toBe(false);
    expect(validCpf("00000000000")).toBe(false);
  });
});

describe("dados do comprador na conversa do Telegram", () => {
  it("junta os dados mandados em várias mensagens e deixa o papo de fora", () => {
    const r = buyerDataFromMessages(["Bom dia", "Segue os dados", "Ana Lima Souza", "111.444.777-35", "05/06/1990", "Fico no aguardo", "Bruno Costa\n529.982.247-25\n12/01/1987"]);
    expect(r.latamLink).toBeNull();
    expect(parsePassengersText(r.text).map((x) => [x.name, x.cpf, x.birthDate])).toEqual([
      ["Ana Lima Souza", "11144477735", "1990-06-05"],
      ["Bruno Costa", "52998224725", "1987-01-12"],
    ]);
  });

  it("pega o link pronto da LATAM (o último) e ignora outros sites", () => {
    const r = buyerDataFromMessages([
      "https://www.latamairlines.com/br/pt/v2/passageiros?orderId=LA111",
      "corrigi: https://www.latamairlines.com/br/pt/v2/passageiros?orderId=LA222 pronto",
      "https://falso-latamairlines.com/x",
    ]);
    expect(r.latamLink).toBe("https://www.latamairlines.com/br/pt/v2/passageiros?orderId=LA222");
    expect(r.text).toBe("");
  });
});

// Leitor do bilhete de emissão da LATAM (texto do PDF). Os textos abaixo imitam a saída do pdf-parse (rótulo
// colado no valor), com dados fictícios.
import { describe, it, expect } from "vitest";
import { parseLatamTicket, mergeTicketPassengers } from "@/domain/latam-ticket";

const ticket1 = [
  "Informação sobre sua passagem",
  "Informação da viagem",
  "Código da reservaABC123Nª de ordenLA9999999XXXX",
  "Cidade e Data de ",
  "emissão",
  "Rio do janeiro, Brasil 09/11/26",
  "Nome do PassageiroTipo de passageiroDocumento de Identificação",
  "FULANO DE TAL SILVAAdulto12345678901",
  "Detalhe do pagamentoForma de pagamento",
  "9572310312686",
  "Voo",
  "Taxas e/ou impostos(2)",
  "BRL 55,62",
  "Millas 19.247",
  "Total pago",
  "BRL 55,62",
  "Millas 19.247",
  " LATAM PassCP: ",
  "4541352627691",
  "(2)BR: BRL 55,62",
].join("\n");

const ticketDoisPax = [
  "Código da reservaGDDPKTNª de ordenLA9570306DMZA",
  "emissão",
  "Rio do janeiro, Brasil 08/11/26",
  "Nome do PassageiroTipo de passageiroDocumento de Identificação",
  "LUCAS DUARTEAdulto04011122233",
  "PEDRO DUARTECriança08022233344",
  "Taxas e/ou impostos(2)",
  "Millas 128.472",
  "Total pago",
  "BRL 178,08",
  "Millas 128.472",
  "(2)BR: BRL 178,08",
].join("\n");

describe("bilhete de emissão da LATAM", () => {
  it("tira localizador, serial, passageiro (nome+CPF), milhas e taxa", () => {
    expect(parseLatamTicket(ticket1)).toEqual({
      locator: "ABC123",
      orderNumber: "LA9999999XXXX",
      passengers: [{ name: "FULANO DE TAL SILVA", cpf: "12345678901" }],
      milesPoints: 19247,
      taxesCents: 5562,
      issuedAt: "Rio do janeiro, Brasil 09/11/26",
      latamPassCp: "4541352627691",
    });
  });

  it("lê vários passageiros (nome em maiúsculas + tipo + CPF), com milhas e taxa em milhares", () => {
    const t = parseLatamTicket(ticketDoisPax)!;
    expect(t.locator).toBe("GDDPKT");
    expect(t.orderNumber).toBe("LA9570306DMZA");
    expect(t.milesPoints).toBe(128472);
    expect(t.taxesCents).toBe(17808);
    expect(t.passengers).toEqual([
      { name: "LUCAS DUARTE", cpf: "04011122233" },
      { name: "PEDRO DUARTE", cpf: "08022233344" },
    ]);
  });

  it("não é bilhete da LATAM (ou texto solto): null", () => {
    expect(parseLatamTicket("Qualquer texto sem os campos do bilhete")).toBeNull();
    expect(parseLatamTicket("Código da reserva ABC123 mas sem número de orden")).toBeNull();
  });
});

describe("juntar passageiros do bilhete com os da negociação", () => {
  const pax = [{ name: "FULANO DE TAL", cpf: "12345678901" }];
  it("sem passageiros: acrescenta os do bilhete", () => {
    const r = mergeTicketPassengers(null, pax);
    expect(r.changed).toBe(true);
    expect(r.filled).toBe(1);
    expect(r.list).toEqual([{ name: "FULANO DE TAL", cpf: "12345678901" }]);
  });
  it("mesmo CPF sem nome: completa o nome e preserva nascimento", () => {
    const r = mergeTicketPassengers([{ name: "", cpf: "123.456.789-01", birthDate: "1990-01-01" }], pax);
    expect(r.filled).toBe(1);
    expect(r.list).toEqual([{ name: "FULANO DE TAL", cpf: "123.456.789-01", birthDate: "1990-01-01" }]);
  });
  it("slot vazio: preenche nome e CPF", () => {
    const r = mergeTicketPassengers([{ name: "", cpf: "" }], pax);
    expect(r.list).toEqual([{ name: "FULANO DE TAL", cpf: "12345678901" }]);
  });
  it("passageiro já completo (mesmo CPF e nome): não mexe", () => {
    const r = mergeTicketPassengers([{ name: "JÁ TINHA", cpf: "12345678901", email: "a@b.com" }], pax);
    expect(r.changed).toBe(false);
    expect(r.filled).toBe(0);
    expect(r.list).toEqual([{ name: "JÁ TINHA", cpf: "12345678901", email: "a@b.com" }]);
  });
});

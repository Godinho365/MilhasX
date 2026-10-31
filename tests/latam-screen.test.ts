// Leitura da tela da LATAM (texto ou print por OCR) para o primeiro passo do CRM Milhas.
import { describe, it, expect } from "vitest";
import { parseLatamScreen } from "@/domain/latam-screen";

const today = new Date("2026-10-31T12:00:00Z");

// Print 1: ida e volta CNF ⇄ POA, 2 passageiros, tela de opções de pagamento
const idaVolta = `Belo Horizonte Porto Alegre seg. 30 nov - dom. 06 dez 2 Passageiros Economy Atualizar busca
Belo Horizonte a Porto Alegre seg., 30 de nov.
Tarifa sem reembolso
7:55 CNF Direto 2 h 15 min. 10:10 POA Operado pela LATAM Airlines Brasil
Light Preço por passageiro 13.858 milhas + BRL 35,15 Alterar sua seleção
Porto Alegre a Belo Horizonte dom., 06 de dez.
5:00 POA Direto 2 h 10 min. 7:10 CNF
Light Preço por passageiro 15.591 milhas + BRL 62,69
Selecione a opção que preferir para pagar sua passagem:
29.449 milhas + BRL 97,84
26.505 milhas + BRL 250,93
20.615 milhas + BRL 477,70
14.725 milhas + BRL 672,08
Os preços são por passageiro e incluem taxas e impostos.`;

// Print 2: só o trecho de ida BSB → XAP, sem a quantidade de passageiros
const soIda = `Brasília a Chapecó qui., 26 de nov.
12:25 BSB 1 parada 6 h 30 min. 18:55 XAP Operado pela LATAM Airlines Brasil
Light Preço por passageiro 39.109 milhas + BRL 34,55`;

describe("tela da LATAM", () => {
  it("ida e volta: trecho, datas com o ano pelo dia da semana, passageiros e a 1ª opção × passageiros", () => {
    const r = parseLatamScreen(idaVolta, today)!;
    expect(r.params).toEqual({ origin: "CNF", destination: "POA", departDate: "2026-11-30", returnDate: "2026-12-06", adults: 2, cabin: "ECONOMY" });
    expect(r).toMatchObject({ pointsPerPax: 29_449, taxesPerPaxCents: 9_784, points: 58_898, taxesCents: 19_568, passengersShown: true, yearGuessed: false });
    expect(r.link).toBe("https://www.latamairlines.com/br/pt/oferta-voos?origin=CNF&outbound=2026-11-30T12%3A00%3A00.000Z&destination=POA&inbound=2026-12-06T12%3A00%3A00.000Z&adt=2&chd=0&inf=0&trip=RT&cabin=Economy&redemption=true&sort=RECOMMENDED");
  });

  it("só ida, print cortado: sem volta e sem passageiros na tela (conta 1 e avisa)", () => {
    const r = parseLatamScreen(soIda, today)!;
    expect(r.params).toEqual({ origin: "BSB", destination: "XAP", departDate: "2026-11-26", returnDate: null });
    expect(r).toMatchObject({ points: 39_109, taxesCents: 3_455, passengersShown: false });
    expect(r.link).toContain("origin=BSB&outbound=2026-11-26T12%3A00%3A00.000Z&destination=XAP&inbound=null&adt=1");
    expect(r.link).toContain("trip=OW");
  });

  it("ano: sem dia da semana vai para a próxima data futura; com ele, o ano em que o dia bate", () => {
    expect(parseLatamScreen("10:00 GRU 12:00 SDU 15 de jan 20.000 milhas + BRL 50,00", today)!.params.departDate).toBe("2027-01-15");
    expect(parseLatamScreen("10:00 GRU 12:00 SDU 15 de jan 20.000 milhas + BRL 50,00", today)!.yearGuessed).toBe(true);
    expect(parseLatamScreen("10:00 GRU 12:00 SDU sex. 13 nov 20.000 milhas", today)!.params.departDate).toBe("2026-11-13");
  });

  it("dois trechos sem opções de pagamento: soma os trechos por passageiro", () => {
    const r = parseLatamScreen("1 Passageiro 7:55 CNF 10:10 POA seg. 30 nov 13.858 milhas + BRL 35,15 5:00 POA 7:10 CNF dom. 06 dez 15.591 milhas + BRL 62,69", today)!;
    expect(r).toMatchObject({ points: 29_449, taxesCents: 9_784 });
  });

  // Texto real do OCR (tesseract.js, português) dos dois prints: cabeçalho das opções ilegível, vírgula
  // perdida ("BRL 9784") e 14.725 lido como 147725 — o preço sai da soma dos trechos
  it("print real pelo OCR: ida e volta CNF ⇄ POA", () => {
    const r = parseLatamScreen("> Belo Horizonte => Porto Alegre | [3 seg. 30 nov - dom. 06 dez | 2 2 Passageiros | OS Economy = Anslzarbua v\nERIERA E ESES coa\nreto\n7:55 CNF 2615mo. 10:10 POA ma PE\nOperado pela 9 LAIAM Aidines Brasi 13.858 milhas + BRL 35,15\nCârsito 26 condições (4\nO Pata Nogres Boto Hartisana dom. DA de der\noieto\n5:00 POA o 7:10 CNF Preço por passageiro Alterar sua seleção\nOperado pela (O LAIAM Airlines Bras: 15.591 milhas + BRL 62,69\nCos SSE\nSESSÃO e pe pag Sa pair\n(O) 29449 milhas + BRL 9784\n(O 26.505 milhas + BRL 250,93\nO 20615 milhas + BRL 477,70\nO 147725 milhas + BRL 672,08\nO) 0 preços são por passageiro e incluem taxes e impostos,\nCo a de So Eboaa [o do EESC oc eat", today)!;
    expect(r.params).toEqual({ origin: "CNF", destination: "POA", departDate: "2026-11-30", returnDate: "2026-12-06", adults: 2, cabin: "ECONOMY" });
    expect(r).toMatchObject({ pointsPerPax: 29_449, taxesPerPaxCents: 9_784, points: 58_898, taxesCents: 19_568 });
  });

  it("print real pelo OCR: só ida BSB → XAP", () => {
    const r = parseLatamScreen("O Brasília a Chapecó qui., 26 de nov.\n1.parad\n12:25 BSB  EEAA 18:55 XAP\nPreço por passageiro\nOperado pela 9 LATAM Airines Brasi 39.109 milhas + BRL 34,55", today)!;
    expect(r.params).toEqual({ origin: "BSB", destination: "XAP", departDate: "2026-11-26", returnDate: null });
    expect(r).toMatchObject({ points: 39_109, taxesCents: 3_455, passengersShown: false });
  });

  it("texto sem nada da LATAM não vira busca", () => {
    expect(parseLatamScreen("oi, tudo bem?", today)).toBeNull();
  });
});

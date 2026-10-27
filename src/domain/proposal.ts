// Cotação (proposta) e reserva que o cliente vê por link, e o termo de compra e venda.
// Funções puras: servem ao servidor, ao CRM e à prévia do editor.
import { AIRPORTS } from "./airports";
import { fmtBRL } from "@/lib/format";

export type Leg = {
  label: string; // Ida, Volta, Trecho 2...
  origin: string;
  destination: string;
  date: string | null; // AAAA-MM-DD
  departTime: string; // HH:MM
  arriveTime: string;
  arriveDayOffset: number; // +1 quando chega no dia seguinte
  duration: string; // ex.: 11h 15m
  airline: string;
  flight: string;
  stops: number;
};
export type Proposal = {
  legs: Leg[];
  baggage: { personal: number; carryOn: number; checked: number };
  pixCents: number | null; // valor no Pix
  fullCents: number | null; // "de" (riscado), opcional
  cardInstallments: number | null;
  cardTotalCents: number | null;
  change: string; // remarcação e cancelamento
  payment: string;
  notes: string;
  sentAt: string | null;
};
export type Reservation = { program: string; airline: string; lastName: string; passengers: string[] };

export const EMPTY_PROPOSAL: Proposal = {
  legs: [],
  baggage: { personal: 1, carryOn: 1, checked: 0 },
  pixCents: null,
  fullCents: null,
  cardInstallments: null,
  cardTotalCents: null,
  change: "Remarcação e cancelamento conforme as regras da tarifa da companhia aérea.",
  payment: "Pix à vista ou cartão de crédito parcelado.",
  notes: "Valores e disponibilidade podem mudar até a emissão.",
  sentAt: null,
};

const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.trim().slice(0, max) : d);
const int = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000_000 ? Math.round(v) : null);
const time = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const iata = (v: unknown) => (typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : "");

/** Normaliza o JSON salvo/recebido: nunca devolve campo ausente nem valor fora do formato. */
export function resolveProposal(raw: unknown): Proposal {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legs = (Array.isArray(o.legs) ? o.legs : []).slice(0, 6).map((l, i) => {
    const r = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    return {
      label: str(r.label, 20, i === 0 ? "Ida" : "Volta") || (i === 0 ? "Ida" : "Volta"),
      origin: iata(r.origin), destination: iata(r.destination), date: day(r.date),
      departTime: time(r.departTime), arriveTime: time(r.arriveTime), arriveDayOffset: int(r.arriveDayOffset, 0, 2, 0),
      duration: str(r.duration, 12), airline: str(r.airline, 40), flight: str(r.flight, 12).toUpperCase(), stops: int(r.stops, 0, 3, 0),
    };
  }).filter((l) => l.origin && l.destination);
  const b = (o.baggage && typeof o.baggage === "object" ? o.baggage : {}) as Record<string, unknown>;
  return {
    legs,
    baggage: { personal: int(b.personal, 0, 9, 1), carryOn: int(b.carryOn, 0, 9, 1), checked: int(b.checked, 0, 9, 0) },
    pixCents: cents(o.pixCents), fullCents: cents(o.fullCents),
    cardInstallments: o.cardInstallments == null ? null : int(o.cardInstallments, 1, 24, 1), cardTotalCents: cents(o.cardTotalCents),
    change: str(o.change, 300, EMPTY_PROPOSAL.change), payment: str(o.payment, 300, EMPTY_PROPOSAL.payment), notes: str(o.notes, 500, EMPTY_PROPOSAL.notes),
    sentAt: typeof o.sentAt === "string" && !Number.isNaN(Date.parse(o.sentAt)) ? o.sentAt : null,
  };
}

export function resolveReservation(raw: unknown): Reservation {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    program: str(o.program, 40), airline: str(o.airline, 40), lastName: str(o.lastName, 60).toUpperCase(),
    passengers: (Array.isArray(o.passengers) ? o.passengers : []).map((p) => str(p, 120)).filter(Boolean).slice(0, 9),
  };
}

export const cityOf = (code: string) => AIRPORTS.find((a) => a.code === code)?.city ?? code;

/** Código curto mostrado ao cliente (derivado do número do pedido, sem revelar o token). */
export const proposalCode = (orderNumber: number) => `COT-${String(orderNumber).padStart(4, "0")}`;

// Sites oficiais das companhias, para "Acompanhar no site da companhia"
const AIRLINE_SITES: [RegExp, string, string][] = [
  [/latam/i, "LATAM", "https://www.latamairlines.com/br/pt"],
  [/gol|smiles/i, "GOL", "https://www.voegol.com.br"],
  [/azul/i, "Azul", "https://www.voeazul.com.br"],
  [/tap/i, "TAP", "https://www.flytap.com/pt-br"],
  [/american/i, "American Airlines", "https://www.aa.com"],
  [/iberia/i, "Iberia", "https://www.iberia.com/br/"],
  [/air france/i, "Air France", "https://wwws.airfrance.com.br"],
  [/klm/i, "KLM", "https://www.klm.com.br"],
  [/copa/i, "Copa Airlines", "https://www.copaair.com/pt-br/"],
];
export function airlineSite(airline: string, program = ""): { name: string; url: string } | null {
  for (const [re, name, url] of AIRLINE_SITES) if (re.test(airline) || re.test(program)) return { name, url };
  return null;
}

// ---------- Termo de compra e venda de passagem aérea ----------

/** Texto padrão do termo (próprio da MilhasX). Os campos entre {{ }} são preenchidos na hora. */
export const DEFAULT_CONTRACT = `TERMO DE COMPRA E VENDA DE PASSAGEM AÉREA

De um lado, {{AGENCIA}}, inscrita sob o nº {{AGENCIA_DOCUMENTO}}, com endereço em {{AGENCIA_ENDERECO}}, aqui chamada AGÊNCIA; e, de outro lado, {{CLIENTE}}, CPF nº {{CLIENTE_CPF}}, nascido(a) em {{CLIENTE_NASCIMENTO}}, com endereço em {{CLIENTE_ENDERECO}}, aqui chamado(a) CLIENTE, acertam este termo nas condições abaixo.

1. PARTES
1.1. As partes estão identificadas no início deste termo e declaram que os dados informados são verdadeiros.

2. O QUE ESTÁ SENDO CONTRATADO
2.1. A AGÊNCIA fará a emissão da(s) passagem(ns) aérea(s) para o(s) passageiro(s) indicado(s) pelo CLIENTE, nos trechos: {{TRECHOS}}.
2.2. A passagem é nominal e só pode ser usada pelo passageiro que consta nela.
2.3. A emissão pode ser feita com milhas ou pontos de programas de fidelidade, inclusive de terceiros que autorizaram o uso. Isso não cria nenhuma relação entre o CLIENTE e o dono das milhas.

3. VALOR E PAGAMENTO
3.1. O CLIENTE pagará à AGÊNCIA {{VALOR}}, na forma: {{PAGAMENTO}}.
3.2. A emissão só acontece depois da confirmação do pagamento combinado.

4. MEIO DE PAGAMENTO
4.1. O CLIENTE declara que é o titular do cartão, conta ou chave usada no pagamento, ou que tem autorização do titular para usá-lo.

5. CONTESTAÇÃO DE PAGAMENTO
5.1. Com o serviço prestado, o CLIENTE se compromete a não pedir o estorno (chargeback) do pagamento junto ao banco ou à operadora do cartão.
5.2. Se houver estorno de um serviço já prestado, o CLIENTE deverá devolver à AGÊNCIA o valor estornado, com as despesas de cobrança.

6. CANCELAMENTO, REMARCAÇÃO E REEMBOLSO
6.1. Cancelamentos, remarcações e reembolsos seguem as regras da tarifa e da companhia aérea, e podem ter multas ou não ser possíveis.
6.2. O CLIENTE pode desistir da compra sem custo com a AGÊNCIA antes da emissão. Depois da emissão, valem as regras do item 6.1.

7. CONFERÊNCIA DOS DADOS
7.1. Antes da emissão, o CLIENTE confere nome completo (igual ao documento), data de nascimento, trechos, datas e horários.
7.2. Correções depois da emissão dependem da companhia aérea e podem gerar custos.
7.3. Documentos de viagem (RG, passaporte, vistos, vacinas) são de responsabilidade do passageiro.

8. DADOS PESSOAIS
8.1. Os dados do CLIENTE e dos passageiros serão usados só para a emissão e o atendimento desta compra, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

9. ASSINATURA ELETRÔNICA
9.1. As partes aceitam a assinatura eletrônica deste termo, com registro de data, hora e endereço IP, como válida para todos os fins (Lei nº 14.063/2020).

10. LEIS E FORO
10.1. Este termo segue as leis brasileiras, em especial o Código de Defesa do Consumidor.
10.2. Fica eleito o foro do domicílio do CLIENTE.

{{DATA}}`;

export type ContractFields = {
  agency: string; agencyDoc: string; agencyAddress: string;
  client: string; clientCpf: string; clientBirth: string; clientAddress: string;
  legs: string; value: string; payment: string; date: string;
};

/** Preenche o modelo; o que estiver vazio fica como linha para preencher. */
export function fillContract(template: string, f: Partial<ContractFields>) {
  const blank = "____________";
  const map: Record<string, string | undefined> = {
    AGENCIA: f.agency, AGENCIA_DOCUMENTO: f.agencyDoc, AGENCIA_ENDERECO: f.agencyAddress,
    CLIENTE: f.client, CLIENTE_CPF: f.clientCpf, CLIENTE_NASCIMENTO: f.clientBirth, CLIENTE_ENDERECO: f.clientAddress,
    TRECHOS: f.legs, VALOR: f.value, PAGAMENTO: f.payment, DATA: f.date,
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in map ? map[k]?.trim() || blank : m));
}

export const legsText = (legs: Pick<Leg, "origin" | "destination" | "airline" | "date">[]) =>
  legs.map((l) => `${l.origin} → ${l.destination}${l.airline || l.date ? ` (${[l.airline, l.date ? l.date.split("-").reverse().join("/") : ""].filter(Boolean).join(", ")})` : ""}`).join(" · ");

const fmtLongDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Texto do termo para um pedido, com os dados do cliente quando já informados na assinatura. */
export function contractText(
  template: string,
  agency: { name: string; doc: string; address: string },
  o: { customerName: string; customerCpf: string | null; proposal: Proposal; segments: { origin: string; destination: string; date: string | null }[] },
  signer?: { name: string; cpf: string; birthDate: string; address: string },
  when = new Date(),
) {
  const legs = o.proposal.legs.length ? o.proposal.legs : o.segments.map((s) => ({ ...s, airline: "" }));
  const p = o.proposal;
  const payment = p.pixCents != null ? `Pix${p.cardInstallments && p.cardTotalCents != null ? ` (ou ${p.cardInstallments}x no cartão, total de ${fmtBRL(p.cardTotalCents)})` : ""}` : p.payment;
  return fillContract(template, {
    agency: agency.name, agencyDoc: agency.doc, agencyAddress: agency.address,
    client: signer?.name ?? o.customerName, clientCpf: signer?.cpf ?? o.customerCpf ?? "", clientBirth: signer?.birthDate ? signer.birthDate.split("-").reverse().join("/") : "", clientAddress: signer?.address ?? "",
    legs: legsText(legs), value: p.pixCents != null ? fmtBRL(p.pixCents) : "", payment, date: `Data: ${fmtLongDate(when)}`,
  });
}

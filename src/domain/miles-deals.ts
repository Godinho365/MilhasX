// CRM Milhas: etapas da negociação de venda de milhas e tipos de comprador.

export const DEAL_STAGES = ["NEW", "NEGOTIATION", "AWAITING", "ISSUED", "PAID"] as const;
export type DealStageKey = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStageKey, string> = {
  NEW: "Novo interesse",
  NEGOTIATION: "Negociação",
  AWAITING: "Aguardando dados / emissão",
  ISSUED: "Emitido",
  PAID: "Pago",
};

export const BUYER_TYPES = ["AGENCY", "BALCAO", "FINAL"] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];
export const BUYER_LABELS: Record<BuyerType, string> = { AGENCY: "Agência / revendedor", BALCAO: "Balcão / plataforma", FINAL: "Cliente final" };

/** Balcões que já vêm na lista ao criar a negociação. */
export const DEFAULT_BALCOES = ["Balcão de Milhas ASM", "Balcão Milhas VIP", "Balcão MilhasX"];

/** Balcões para escolher: os que já vêm na lista e os usados nas negociações (um balcão novo entra na lista
 *  quando a negociação é salva), sem repetir, em ordem alfabética. */
export function balcaoOptions(usedNames: string[]) {
  return [...new Set([...DEFAULT_BALCOES, ...usedNames].map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Palavras do nome, minúsculas e sem acentos ("BALCÃO Milhas VIP - Pro" → ["balcao", "milhas", "vip", "pro"]). */
const nameWords = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Balcão da negociação vinda de um grupo do Telegram: o da lista (padrões e já usados) cujo nome está inteiro no
 *  nome do grupo, o mais completo ("BALCÃO MILHAS VIP PRO" → "Balcão Milhas VIP"); nome de uma palavra só
 *  ("balcao") não vale. Sem nenhum, o nome do grupo. */
export function balcaoForGroup(groupTitle: string, usedNames: string[]) {
  const g = ` ${nameWords(groupTitle).join(" ")} `;
  const match = balcaoOptions(usedNames)
    .map((b) => ({ b, w: nameWords(b) }))
    .filter(({ w }) => w.length >= 2 && g.includes(` ${w.join(" ")} `))
    .sort((x, y) => y.w.length - x.w.length)[0];
  return match?.b ?? groupTitle.trim();
}

/** Valor da venda: pontos pelo preço do milheiro. */
export const dealTotalCents = (points: number | null, saleCpmCents: number | null) => (points && saleCpmCents ? Math.round((points * saleCpmCents) / 1000) : null);

/** Lucro estimado: diferença entre o milheiro de venda e o custo médio da conta. */
export const dealProfitCents = (points: number | null, saleCpmCents: number | null, costCpmCents: number | null) =>
  points && saleCpmCents && costCpmCents != null ? Math.round((points * (saleCpmCents - costCpmCents)) / 1000) : null;

/** Valor cobrado do comprador: pontos pelo milheiro + taxas da emissão (pagas por mim e repassadas). */
export const dealChargeCents = (points: number | null, saleCpmCents: number | null, taxesCents: number | null) => {
  const miles = dealTotalCents(points, saleCpmCents);
  return miles == null ? (taxesCents ?? null) : miles + (taxesCents ?? 0);
};

/** CPFs que a emissão usa: o combinado ou os passageiros informados (o maior); sem nenhum, 1,
 *  porque toda emissão usa ao menos um CPF. Vale para a venda, o limite de CPFs da conta e o lucro por CPF. */
export const dealCpfs = (d: { passengers: number | null; passengersData: unknown }) =>
  Math.max(d.passengers ?? 0, Array.isArray(d.passengersData) ? d.passengersData.length : 0, 1);

export type DealPaste = { orderLink?: string; points?: number; passengers?: number; taxesCents?: number };

/**
 * Lê o que o comprador manda para a emissão, por exemplo:
 * "https://www.latamairlines.com/br/pt/v2/passageiros?orderId=… 8.673K 1CPF Taxas: R$35,75".
 * "8.673K", "8,7K" e "12K" são milhares (8.673, 8.700 e 12.000); "8.673 milhas" também vale.
 */
export function parseDealPaste(text: string): DealPaste {
  const out: DealPaste = {};
  const url = text.match(/https?:\/\/[^\s"'<>]+/);
  if (url) out.orderLink = url[0];
  const rest = text.replace(/https?:\/\/[^\s"'<>]+/g, " ");
  const k = rest.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  const miles = rest.match(/(\d{1,3}(?:\.\d{3})+|\d{3,})\s*(?:milhas|pontos|pts|miles)\b/i);
  if (k) out.points = Math.round(Number(k[1]!.replace(",", ".")) * 1000);
  else if (miles) out.points = Number(miles[1]!.replace(/\D/g, ""));
  const cpf = rest.match(/(\d{1,2})\s*(?:cpfs?|passageiros?|pax)\b/i);
  if (cpf) out.passengers = Number(cpf[1]);
  const tax = rest.match(/taxas?\s*:?\s*(?:R\$|BRL)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})?)/i);
  if (tax) out.taxesCents = Math.round(Number(tax[1]!.replace(/\./g, "").replace(",", ".")) * 100);
  return out;
}

export type Passenger = { name: string; firstName?: string; lastName?: string; cpf: string; birthDate: string; gender?: "M" | "F" | ""; email?: string; phone?: string };

/** CPF de verdade: 11 dígitos com os dois dígitos verificadores certos (um celular de 11 dígitos quase nunca fecha). */
export function validCpf(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+\s?55\s?)?\(?\d{2}\)?\s?9?\s?\d{4}[-\s]?\d{4}/;
const PHONE_LABEL = /^(tel|telefone|cel|celular|fone|whats|whatsapp|zap|contato)(?![\p{L}])/iu;
const FIELD_LABEL = /^(cpf|rg|nasc|nascimento|data|dt|dn|e-?mail|tel|telefone|cel|celular|fone|whats|whatsapp|zap|contato|sexo|g[eê]nero)(?![\p{L}])/iu;
const NAME_LABEL = /^(?:nome(?:\s+completo)?|passageir[oa](?:\s*\d+)?)\s*[:\-–]\s*(.+)$/i;
// conversa, não nome: "bom dia", "segue os dados", "fico no aguardo", "pode emitir"…
const CHAT_WORDS = /(?<![\p{L}])(segue|seguem|dados|bo[am]\s+(?:dia|tarde|noite)|ok|oi|ol[aá]|obrigad[oa]|valeu|vlw|blz|beleza|pronto|aqui|favor|emiss[aã]o|emitir|emite|passage[mn]s?|voo|reserva|pagamento|pago|pix|link|confirm\w*|autoriz\w*|certo|perfeito|show|top|sim|n[aã]o|t[aá]|tudo|bem|aguardo|entendi|combinado|valor|quanto|desculp\w*|momento|minuto|agora|depois|hoje|amanh[aã]|ent[aã]o|vou|pode|mando|mandei|esse|essa|isso|outro|outra|faltou|falta)(?![\p{L}])/iu;

/** Uma linha da conversa, sem o negrito do WhatsApp/Telegram (*…*) e sem marcador de lista ("1)", "•", emoji)
 *  no começo. */
const cleanLine = (l: string) => l.replace(/[*~`]/g, "").trim().replace(/^(?:[^\p{L}\p{N}+(]+|\d{1,2}\s*[.)ºª\-–]\s+)/u, "").trim();

/** CPF da linha. Número solto de 11 dígitos que não fecha os dígitos verificadores e tem cara de celular
 *  (DDD + 9…) é telefone, não CPF; escrito como CPF (com pontos/traço) ou na linha "CPF" vale sempre. */
function cpfOf(line: string): string | null {
  if (PHONE_LABEL.test(line)) return null;
  for (const m of line.matchAll(CPF_RE)) {
    const d = m[0].replace(/\D/g, "");
    if (/[.-]/.test(m[0]) || /cpf/i.test(line) || validCpf(d) || !/^[1-9]{2}9/.test(d)) return d;
  }
  return null;
}

/** Data de nascimento (DD/MM/AAAA, também com . ou -) em AAAA-MM-DD; data futura (a do voo) não é nascimento. */
function dateOf(line: string): string | null {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900) return null;
  const iso = `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${iso}T12:00:00Z`) > new Date() ? null : iso;
}

/** Telefone da linha (fora o CPF e a data dela). */
function phoneOf(line: string, cpf: string | null): string | null {
  let rest = line.replace(EMAIL_RE, " ").replace(DATE_RE, " ");
  if (cpf) rest = rest.replace(CPF_RE, (m) => (m.replace(/\D/g, "") === cpf ? " " : m));
  return rest.match(PHONE_RE)?.[0].trim() ?? null;
}

/** Nome na linha: o que vem depois de "Nome:" ou uma linha de 2 a 8 palavras só com letras que não é conversa;
 *  numa linha com o CPF/data junto ("Ana Lima 123.456.789-09"), o que vem antes dos números. */
function nameOf(line: string): string | null {
  const labeled = line.match(NAME_LABEL)?.[1];
  // antes dos números, sem o rótulo que ficou no fim ("Ana Lima, CPF 123…" → "Ana Lima")
  const cand = (labeled ?? line)
    .split(/\d/)[0]!
    .replace(/(?:[\s,;:|/(–-]|(?<![\p{L}])(?:cpf|rg|dn|nasc\.?|nascimento|data(?:\s+de\s+nascimento)?)(?![\p{L}]))+$/iu, "")
    .trim();
  if (!cand || /@/.test(cand) || FIELD_LABEL.test(cand) || /^(masculino|feminino|masc|fem)$/i.test(cand)) return null;
  if (!/^[\p{L}\s.'’-]+$/u.test(cand)) return null;
  if (labeled) return cand;
  const words = cand.split(/\s+/).length;
  return words >= 2 && words <= 8 && !CHAT_WORDS.test(cand) ? cand : null;
}

type PaxLine = { cpf: string | null; date: string | null; email: string | null; phone: string | null; name: string | null; labeled: boolean; gender: "M" | "F" | "" };
function paxLine(raw: string): PaxLine {
  const l = cleanLine(raw);
  const cpf = cpfOf(l);
  const date = dateOf(l);
  const email = l.match(EMAIL_RE)?.[0] ?? null;
  const phone = phoneOf(l, cpf);
  const gender = /(?<![\p{L}])(feminino|fem|mulher)(?![\p{L}])|sexo\s*:?\s*f(?![\p{L}])/iu.test(l) ? "F" : /(?<![\p{L}])(masculino|masc|homem)(?![\p{L}])|sexo\s*:?\s*m(?![\p{L}])/iu.test(l) ? "M" : "";
  return { cpf, date, email, phone, name: nameOf(l), labeled: NAME_LABEL.test(l), gender };
}
const isData = (x: PaxLine) => !!(x.cpf || x.date);
const nameOnly = (x: PaxLine) => !!x.name && !x.cpf && !x.date && !x.email && !x.phone;

/** Passageiros colados de uma conversa (WhatsApp/Telegram): um bloco por passageiro, separado por linha em
 *  branco; sem linha em branco, um CPF ou uma data de nascimento repetidos começam outro passageiro (levando o
 *  nome escrito logo antes). Reconhece CPF (com dígito verificador, para não confundir com celular), data,
 *  e-mail, telefone e sexo; o nome é o de "Nome:" ou a linha de nome mais perto antes dos dados. Um bloco só
 *  com e-mail/telefone (o contato mandado no fim) vale para quem ficou sem. */
export function parsePassengersText(text: string): Passenger[] {
  const blocks: PaxLine[][] = [];
  let cur: PaxLine[] = [];
  const flush = () => { if (cur.length) blocks.push(cur); cur = []; };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) { flush(); continue; }
    const l = paxLine(raw);
    if ((l.cpf && cur.some((x) => x.cpf)) || (l.date && cur.some((x) => x.date))) {
      // outro passageiro: o nome escrito logo antes é dele
      let k = cur.length;
      while (k > 0 && nameOnly(cur[k - 1]!)) k--;
      const carry = cur.splice(k);
      flush();
      cur = carry;
    }
    cur.push(l);
  }
  flush();
  const passengers: Passenger[] = [];
  let shared: { email: string; phone: string } = { email: "", phone: "" };
  for (const b of blocks) {
    const first = <K extends keyof PaxLine>(k: K) => b.map((x) => x[k]).find(Boolean) ?? null;
    if (!b.some(isData)) {
      // sem CPF nem data: o contato do fim vale para todos; o resto ("bom dia, segue os dados") não é passageiro
      shared = { email: (first("email") as string | null) ?? shared.email, phone: (first("phone") as string | null) ?? shared.phone };
      continue;
    }
    const firstData = b.findIndex(isData);
    const before = b.slice(0, firstData).filter((x) => x.name);
    const name = b.find((x) => x.labeled && x.name)?.name ?? before[before.length - 1]?.name ?? b.find((x) => x.name)?.name ?? "";
    passengers.push({
      name,
      cpf: (first("cpf") as string | null) ?? "",
      birthDate: (first("date") as string | null) ?? "",
      gender: (first("gender") as Passenger["gender"]) || "",
      email: (first("email") as string | null) ?? "",
      phone: (first("phone") as string | null) ?? "",
    });
  }
  return passengers.map((p) => ({ ...p, email: p.email || shared.email, phone: p.phone || shared.phone }));
}

/** Junta o que o comprador mandou no privado (as mensagens dele, da mais antiga para a mais nova) num texto só
 *  para o leitor de passageiros: só as mensagens com dado de passageiro (CPF, nascimento, e-mail, telefone) ou
 *  que parecem um nome; papo ("bom dia", "segue os dados") e links ficam de fora. latamLink = o último link da
 *  LATAM que ele mandou (o pedido pronto, com os passageiros já preenchidos). */
export function buyerDataFromMessages(texts: string[]): { text: string; latamLink: string | null } {
  let latamLink: string | null = null;
  const out: string[] = [];
  for (const t of texts) {
    for (const u of t.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
      try {
        if (/(^|\.)latamairlines\.com$/i.test(new URL(u).hostname)) latamLink = u;
      } catch { /* link quebrado */ }
    }
    const lines = t.replace(/https?:\/\/[^\s"'<>]+/g, " ").split(/\r?\n/);
    const useful = lines.some((raw) => {
      const l = paxLine(raw);
      return isData(l) || l.email || l.phone || l.name;
    });
    if (useful) out.push(lines.map((l) => l.trim()).join("\n").trim());
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), latamLink };
}

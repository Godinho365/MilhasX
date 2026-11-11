// Lê o bilhete de emissão da LATAM (o "comprovante de compra", cuv.pdf) a partir do TEXTO extraído do PDF.
// Tira o localizador (código da reserva), o nº de orden (serial de compra), os passageiros (nome + CPF), as milhas
// e a taxa de embarque, para preencher os campos vazios da negociação e validar milhas/taxa. Só LATAM: sem o
// cabeçalho característico, devolve null (outros programas são ignorados).

export type LatamTicketPassenger = { name: string; cpf: string | null };
export type LatamTicket = {
  locator: string | null; // Código da reserva (PNR), ex.: NATJVM
  orderNumber: string | null; // Nº de orden / serial de compra, ex.: LA9579881THMN
  passengers: LatamTicketPassenger[]; // nome (e CPF, quando o documento é CPF) de cada passageiro
  milesPoints: number | null; // Millas (pontos da emissão)
  taxesCents: number | null; // taxa de embarque (BRL)
  issuedAt: string | null; // cidade e data de emissão, como está no bilhete
  latamPassCp: string | null; // conta LATAM Pass do titular (CP)
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");
/** "55,62" → 5562; "1.234,56" → 123456. */
function brlToCents(v: string): number | null {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Tira do texto os passageiros: "NOME EM MAIÚSCULAS" + tipo (Adulto/Criança/…) + CPF (11 dígitos), coladinhos
 *  como o PDF exporta ("CAROLINE DA SILVA LIMAAdulto05495231546"). Nomes repetidos entram uma vez só. */
function parsePassengers(t: string): LatamTicketPassenger[] {
  const out: LatamTicketPassenger[] = [];
  const seen = new Set<string>();
  const re = /\b([A-ZÀ-Ý][A-ZÀ-Ý'´`-]*(?: [A-ZÀ-Ý'´`-]+)+?)(?:Adulto|Crian[çc]a|Beb[êe]|Infante|Menor)(\d{11})/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const name = m[1]!.replace(/\s+/g, " ").trim();
    const cpf = m[2]!;
    const key = `${name}|${cpf}`;
    if (name.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, cpf });
  }
  return out;
}

/** O bilhete da LATAM a partir do texto extraído do PDF, ou null quando não é um bilhete da LATAM. */
export function parseLatamTicket(text: string): LatamTicket | null {
  const t = text.replace(/ /g, " ");
  // precisa ser o comprovante da LATAM: tem "Código da reserva" e "Nº de orden"
  if (!/C[óo]digo da reserva/i.test(t) || !/de\s*orden/i.test(t)) return null;

  const locator = t.match(/C[óo]digo da reserva\s*([A-Z0-9]{6})/i)?.[1]?.toUpperCase() ?? null;
  const orderNumber = (t.match(/de\s*orden\s*(LA[A-Z0-9]{8,})/i)?.[1] ?? t.match(/\bLA\d[A-Z0-9]{9,}\b/)?.[0] ?? null)?.toUpperCase() ?? null;
  if (!orderNumber) return null; // sem o Nº de orden (LA...), não é um comprovante de emissão da LATAM

  const miles = t.match(/Millas\s*([\d.]+)/i)?.[1];
  const milesPoints = miles ? Number(onlyDigits(miles)) || null : null;

  const taxes = t.match(/\(2\)\s*BR:\s*BRL\s*([\d.,]+)/i)?.[1] ?? t.match(/Total pago\s*BRL\s*([\d.,]+)/i)?.[1] ?? t.match(/BRL\s*([\d.,]+)/i)?.[1];
  const taxesCents = taxes ? brlToCents(taxes) : null;

  const issuedAt = t.match(/emiss[ãa]o\s*(.+?\d{2}\/\d{2}\/\d{2,4})/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const latamPassCp = t.match(/LATAM\s*Pass\s*CP:?\s*(\d{6,})/i)?.[1] ?? null;

  return { locator, orderNumber, passengers: parsePassengers(t), milesPoints, taxesCents, issuedAt, latamPassCp };
}

/** Junta os passageiros do bilhete com os que já estão na negociação, sem apagar nada do que o comprador mandou
 *  (nascimento, e-mail, telefone). Por CPF: completa o nome que faltava. Senão: preenche um passageiro vazio ou
 *  acrescenta um novo. Devolve a lista nova e quantos campos preencheu. */
export function mergeTicketPassengers(existing: unknown, ticket: LatamTicketPassenger[]) {
  type P = { name?: string; cpf?: string; birthDate?: string; email?: string; phone?: string; [k: string]: unknown };
  const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const list: P[] = Array.isArray(existing) ? existing.map((p) => ({ ...(p as P) })) : [];
  let filled = 0;
  for (const tp of ticket) {
    const byCpf = tp.cpf ? list.find((p) => digits(p.cpf) === tp.cpf) : null;
    if (byCpf) {
      if (!String(byCpf.name ?? "").trim()) { byCpf.name = tp.name; filled++; }
      continue;
    }
    const empty = list.find((p) => !String(p.name ?? "").trim() && !digits(p.cpf));
    if (empty) { empty.name = tp.name; if (tp.cpf) empty.cpf = tp.cpf; filled++; continue; }
    list.push({ name: tp.name, ...(tp.cpf ? { cpf: tp.cpf } : {}) });
    filled++;
  }
  return { list, filled, changed: filled > 0 };
}

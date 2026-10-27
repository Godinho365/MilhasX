// Limite de beneficiários (CPFs) por conta: os programas limitam para quantas pessoas diferentes dá
// para emitir num período. Conta CPFs distintos (pelo documento; sem documento, pelo nome).

export type BeneficiaryWindow = "ROLLING_12M" | "CALENDAR_YEAR";
export const WINDOW_LABELS: Record<BeneficiaryWindow, string> = { ROLLING_12M: "Últimos 12 meses", CALENDAR_YEAR: "Ano civil" };

/**
 * Sugestão inicial por programa (código). Confira as regras atuais do programa e ajuste na conta:
 * o valor salvo na conta sempre vale mais que esta sugestão.
 */
export const DEFAULT_LIMITS: Record<string, { limit: number; window: BeneficiaryWindow }> = {
  LATAM: { limit: 25, window: "ROLLING_12M" },
  SMILES: { limit: 25, window: "ROLLING_12M" },
};

export function windowStart(window: BeneficiaryWindow, now = new Date()) {
  return window === "CALENDAR_YEAR"
    ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    : new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
}

export const beneficiaryKey = (b: { name: string; document: string | null }) => {
  const doc = (b.document ?? "").replace(/\D/g, "");
  return doc ? `cpf:${doc}` : `nome:${b.name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ")}`;
};

/** Beneficiários distintos usados desde o início da janela. */
export function countDistinct(list: { name: string; document: string | null; usedAt: Date | string }[], since: Date) {
  const seen = new Set<string>();
  for (const b of list) if (new Date(b.usedAt) >= since) seen.add(beneficiaryKey(b));
  return seen.size;
}

export function effectiveLimit(account: { beneficiaryLimit: number | null; beneficiaryWindow: string }, programCode: string) {
  const d = DEFAULT_LIMITS[programCode];
  const window = (account.beneficiaryLimit != null ? account.beneficiaryWindow : d?.window ?? account.beneficiaryWindow) as BeneficiaryWindow;
  return { limit: account.beneficiaryLimit ?? d?.limit ?? null, window: window === "CALENDAR_YEAR" ? window : "ROLLING_12M", suggested: account.beneficiaryLimit == null && !!d } as const;
}

/** Quando o CPF volta a ficar livre: 12 meses depois da emissão (ou na virada do ano, no ano civil). */
export function beneficiaryExpiry(window: BeneficiaryWindow, usedAt: Date | string) {
  const d = new Date(usedAt);
  return window === "CALENDAR_YEAR"
    ? new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1))
    : new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
}

/** CPF do titular (primeiro documento CPF do cadastro), só dígitos. */
export function holderCpf(documents: unknown): string | null {
  if (!Array.isArray(documents)) return null;
  const cpf = documents.find((x) => x && typeof x === "object" && (x as { type?: string }).type === "CPF") as { number?: string } | undefined;
  return cpf?.number?.replace(/\D/g, "") || null;
}

/** O titular emite para si sem gastar vaga: tira da lista quem é o próprio titular. */
export function withoutHolder<T extends { name: string; document: string | null }>(list: T[], holder: { name: string; document: string | null }) {
  const hk = beneficiaryKey(holder);
  const hn = beneficiaryKey({ name: holder.name, document: null });
  return list.filter((b) => beneficiaryKey(b) !== hk && beneficiaryKey({ name: b.name, document: null }) !== hn);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR");

export const fmtBRL = (cents: number | null | undefined) => (cents == null ? "-" : brl.format(cents / 100));
export const fmtPts = (n: number) => int.format(n);
export const fmtSignedPts = (n: number) => (n > 0 ? "+" : "") + int.format(n);
export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/** "1.234,56" ou "1234.56" → centavos. Retorna null se inválido. */
export function parseBRLToCents(v: string): number | null {
  const s = v.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Formatação pt-BR de dinheiro (centavos), pontos e datas. Funciona no servidor e no cliente. */

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos → "R$ 1.234,56". Nulo/indefinido → "R$ 0,00". */
export function fmtBRL(cents: number | null | undefined): string {
  const v = Number.isFinite(cents as number) ? (cents as number) : 0;
  return brl.format(v / 100).replace(/ /g, " ");
}

/** Pontos → "1.250". */
export function fmtPts(n: number | null | undefined): string {
  return nf.format(Math.round(Number.isFinite(n as number) ? (n as number) : 0));
}

/** Pontos com sinal → "+1.250" / "-300". */
export function fmtSignedPts(n: number): string {
  const v = Math.round(n || 0);
  return v > 0 ? `+${nf.format(v)}` : v < 0 ? `-${nf.format(-v)}` : "0";
}

/**
 * Data → "dd/mm/aaaa". Aceita Date, ISO completo ou só "AAAA-MM-DD" (sem deslocar o dia
 * por fuso horário). Valores vazios/inválidos → "-".
 */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.000)?Z$)/.exec(d);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

/**
 * "R$ 1.234,56" / "1234,56" / "1234.56" → centavos (inteiro). Vazio ou inválido → null.
 */
export function parseBRLToCents(v: string | null | undefined): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return neg ? -cents : cents;
}

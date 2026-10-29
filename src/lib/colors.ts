/** Paleta das séries dos gráficos e dos avatares (cores estáveis por nome). */

export const PALETTE = ["#a3e635", "#38bdf8", "#f472b6", "#fbbf24", "#a78bfa", "#34d399", "#fb923c", "#60a5fa", "#f87171", "#2dd4bf"] as const;

/** Cor da i-ésima série de um gráfico. */
export function seriesColor(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}

/** Cor determinística para um nome (titular, loja, programa). */
export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

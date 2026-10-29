const PALETTE = ["#f87171", "#a78bfa", "#2dd4bf", "#fb923c", "#60a5fa", "#f472b6", "#facc15", "#4ade80", "#38bdf8", "#c084fc"];

/** Cor estável derivada do texto (avatares e séries de gráfico). */
export function colorFor(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export const seriesColor = (i: number) => PALETTE[(i + 4) % PALETTE.length]!;

// Visual da Central de atendimento (/p/[slug]) a partir do tema do site: as páginas do cliente
// usam as mesmas cores, fontes e cantos. Vira variáveis CSS na moldura (PageShell), por cima do
// tema base claro ("client") ou escuro ("dark"); as regras de [data-look] ficam em globals.css.
import { themeForBg } from "./page-design";
import type { SiteTheme } from "./site-themes";

export type CentralLook = { base: "client" | "dark"; name: string; vars: Record<string, string> };

const HEX = /^#[0-9a-fA-F]{6}$/;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const triplet = (hex: string) => rgb(hex).join(" ");
/** Cor entre `a` e `b` (t = 0 é `a`, t = 1 é `b`), no formato "R G B" das variáveis do app. */
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(" ");
};

/** `accent` é a cor de destaque escolhida na aba Marca do site (vazio: a do tema). */
export function centralLook(t: SiteTheme, accent?: string | null): CentralLook {
  const c = t.colors;
  const acc = accent && HEX.test(accent) ? accent : c.accent;
  const btnRadius = t.button === "pill" ? "999px" : t.button === "square" ? `${Math.min(t.radius, 4)}px` : "6px";
  return {
    base: themeForBg(c.bg),
    name: t.name,
    vars: {
      "--bg": triplet(c.bg), "--side": triplet(c.surface), "--panel": triplet(c.surface), "--panel2": mix(c.surface, c.text, 0.05), "--line": triplet(c.line), "--muted": triplet(c.muted),
      "--white": triplet(c.text), "--zinc-50": triplet(c.text), "--zinc-100": triplet(c.text), "--zinc-200": mix(c.text, c.bg, 0.12), "--zinc-300": mix(c.text, c.bg, 0.25),
      "--zinc-400": triplet(c.muted), "--zinc-500": mix(c.text, c.bg, 0.5), "--zinc-600": mix(c.text, c.bg, 0.65), "--zinc-700": mix(c.text, c.bg, 0.8),
      "--zinc-800": mix(c.text, c.bg, 0.88), "--zinc-900": mix(c.text, c.bg, 0.94), "--zinc-950": triplet(c.onAccent),
      "--accent": triplet(acc), "--accent-light": triplet(acc), "--accent-soft": mix(acc, c.bg, 0.85),
      "--lime": triplet(acc), "--lime-ink": triplet(c.onAccent), "--hero": triplet(c.band),
      "--look-font": t.body, "--look-head": t.heading.family, "--look-head-weight": String(t.heading.weight),
      "--look-head-style": t.heading.italic ? "italic" : "normal", "--look-head-case": t.heading.upper ? "uppercase" : "none", "--look-head-tracking": t.heading.tracking,
      "--look-radius": `${Math.min(t.radius, 24)}px`, "--look-field-radius": `${Math.min(t.radius, 10)}px`, "--look-btn-radius": btnRadius,
    },
  };
}

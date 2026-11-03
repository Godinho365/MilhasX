// Estilos do tema do site (cores por variáveis --s-*, definidas no SiteView): títulos, botões, cards e
// a largura do conteúdo. Comuns às seções e aos formulários do site.
import type { SiteTheme } from "@/domain/site-themes";

export const headingStyle = (t: SiteTheme, size: string): React.CSSProperties => ({
  fontFamily: t.heading.family, fontWeight: t.heading.weight, fontStyle: t.heading.italic ? "italic" : "normal",
  textTransform: t.heading.upper ? "uppercase" : "none", letterSpacing: t.heading.tracking, fontSize: size, lineHeight: 1.08, margin: 0,
});

export function btnStyle(t: SiteTheme, kind: "primary" | "ghost" | "light" = "primary"): React.CSSProperties {
  const radius = t.button === "pill" ? 999 : t.button === "square" ? Math.min(t.radius, 4) : 6;
  const base: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0.85rem 1.4rem", borderRadius: radius, fontWeight: 600, fontSize: 15, textDecoration: "none", cursor: "pointer", textTransform: t.heading.upper ? "uppercase" : "none", letterSpacing: t.heading.upper ? "0.04em" : 0 };
  if (kind === "light") return { ...base, backgroundColor: "#fff", color: "#111" };
  if (kind === "ghost") return { ...base, border: "1px solid currentColor", color: "inherit", backgroundColor: "transparent" };
  return { ...base, backgroundColor: "var(--s-accent)", color: "var(--s-on-accent)" };
}

export function cardStyle(t: SiteTheme): React.CSSProperties {
  if (t.cards === "shadow") return { backgroundColor: "var(--s-surface)", borderRadius: t.radius, boxShadow: "0 10px 30px -12px rgba(0,0,0,0.18)" };
  if (t.cards === "line") return { backgroundColor: "var(--s-surface)", borderRadius: t.radius, border: "1px solid var(--s-line)" };
  return { borderTop: "1px solid var(--s-line)", borderRadius: 0 };
}

export const wrap: React.CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: "0 24px" };

/** Campo de formulário no visual do tema. */
export function inputStyle(t: SiteTheme): React.CSSProperties {
  return { width: "100%", padding: "0.8rem 0.9rem", borderRadius: Math.min(t.radius, 10), border: "1px solid var(--s-line)", backgroundColor: "var(--s-bg)", color: "var(--s-text)", fontSize: 15, fontFamily: "inherit" };
}

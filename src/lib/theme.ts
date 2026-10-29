/** Tema visual: guardado em cookie e aplicado em <html data-theme>. */

export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "mx_theme";

export const THEMES: readonly { key: Theme; label: string }[] = [
  { key: "light", label: "Claro" },
  { key: "dark", label: "Escuro" },
  { key: "system", label: "Sistema" },
];

export function parseTheme(v: string | null | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}

export type Theme = "light" | "dark" | "system";
export const THEME_COOKIE = "mm_theme";
export const THEMES: { key: Theme; label: string }[] = [
  { key: "light", label: "Claro" },
  { key: "dark", label: "Escuro" },
  { key: "system", label: "Sistema" },
];
export const parseTheme = (v: string | undefined | null): Theme => (v === "light" || v === "dark" ? v : "system");

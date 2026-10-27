"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { THEMES, THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";

const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** Troca o tema na hora (atributo no <html>) e guarda num cookie para a próxima carga já vir certa. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(parseTheme(document.documentElement.dataset.theme)), []);
  function pick(t: Theme) {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `${THEME_COOKIE}=${t}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }
  return (
    <div role="radiogroup" aria-label="Tema" className={`inline-flex gap-1 rounded-xl border border-line bg-panel p-1 ${compact ? "w-full" : ""}`}>
      {THEMES.map((t) => {
        const I = ICON[t.key];
        return (
          <button
            key={t.key}
            role="radio"
            aria-checked={theme === t.key}
            onClick={() => pick(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${theme === t.key ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}
          >
            <I className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Linha do menu do usuário: "Tema: Claro" — cada clique passa para o próximo (Claro → Escuro → Sistema). */
export function ThemeMenuItem() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(parseTheme(document.documentElement.dataset.theme)), []);
  function next() {
    const t = THEMES[(THEMES.findIndex((x) => x.key === theme) + 1) % THEMES.length]!.key;
    setTheme(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `${THEME_COOKIE}=${t}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }
  const I = ICON[theme];
  return (
    <button role="menuitem" onClick={next} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line">
      <I className="h-4 w-4" />Tema: {THEMES.find((x) => x.key === theme)!.label}
    </button>
  );
}

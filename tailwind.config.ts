import type { Config } from "tailwindcss";
import defaults from "tailwindcss/colors";

// Cores vindas de variáveis CSS (globals.css) para o tema claro/escuro trocar sem recompilar
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const ZINC = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
const tone = (name: keyof typeof defaults & string) => ({ ...(defaults[name] as Record<string, string>), 300: v(`${name}-300`), 400: v(`${name}-400`) });

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        bg: v("bg"),
        side: v("side"),
        panel: v("panel"),
        panel2: v("panel2"),
        line: v("line"),
        muted: v("muted"),
        white: v("white"),
        zinc: Object.fromEntries(ZINC.map((k) => [k, v(`zinc-${k}`)])),
        accent: { DEFAULT: v("accent"), light: v("accent-light"), soft: v("accent-soft") },
        ok: v("ok"),
        bad: v("bad"),
        red: tone("red"),
        green: tone("green"),
        amber: tone("amber"),
        blue: tone("blue"),
        violet: tone("violet"),
        orange: tone("orange"),
        sky: tone("sky"),
        emerald: tone("emerald"),
        teal: tone("teal"),
        fuchsia: tone("fuchsia"),
      },
      borderRadius: { card: "16px" },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(8px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
        "slide-up": { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in .15s ease-out",
        "pop-in": "pop-in .18s ease-out",
        "slide-up": "slide-up .22s ease-out",
      },
    },
  },
} satisfies Config;

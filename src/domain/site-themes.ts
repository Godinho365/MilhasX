// Temas do site da agência. O conteúdo é o mesmo para todos (domain/site.ts); o tema define cores,
// tipografia, formato de botões e cards e o estilo da capa. O "sample" só aparece na galeria de temas.
import { defaultContent, type SiteContent } from "./site";

const SANS = '"Inter Variable", "Segoe UI", system-ui, sans-serif';
const SERIF = 'Georgia, "Times New Roman", "Iowan Old Style", serif';

export type HeroStyle = "cover" | "split" | "editorial" | "framed" | "centered";
export type SiteTheme = {
  id: string; name: string; category: string; description: string;
  colors: { bg: string; surface: string; text: string; muted: string; accent: string; onAccent: string; line: string; band: string; onBand: string };
  heading: { family: string; weight: number; upper: boolean; italic: boolean; tracking: string };
  body: string;
  radius: number;
  button: "pill" | "square" | "soft";
  hero: HeroStyle;
  cards: "shadow" | "line" | "flat";
  /** Fundo usado no lugar da foto enquanto o dono não envia uma. */
  placeholder: string;
  sample: { name: string; tagline: string; eyebrow: string; title: string; text: string; city: string };
};

export const SITE_THEMES: SiteTheme[] = [
  {
    id: "atlantico", name: "Atlântico", category: "Praias e ilhas",
    description: "Claro e ensolarado, com capa de foto inteira e cards arredondados. Para quem vende sol, mar e resorts.",
    colors: { bg: "#fbf7f0", surface: "#ffffff", text: "#0f2a33", muted: "#5b6b70", accent: "#0e7490", onAccent: "#ffffff", line: "#e8e0d2", band: "#0e7490", onBand: "#ffffff" },
    heading: { family: SANS, weight: 800, upper: false, italic: false, tracking: "-0.02em" }, body: SANS,
    radius: 20, button: "pill", hero: "cover", cards: "shadow",
    placeholder: "radial-gradient(120% 90% at 80% 10%, #fde68a 0%, rgba(253,230,138,0) 45%), linear-gradient(180deg, #38bdf8 0%, #0e7490 55%, #134e4a 100%)",
    sample: { name: "Maré Alta Viagens", tagline: "Praias, ilhas e resorts", eyebrow: "Caribe, Nordeste e Maldivas", title: "O mar mais bonito está a uma conversa de distância", text: "Pacotes com aéreo, hotel e traslado para as praias que você sempre quis conhecer.", city: "Salvador, BA" },
  },
  {
    id: "prestige", name: "Prestige", category: "Luxo",
    description: "Escuro e elegante, com títulos em serifa e detalhes dourados. Para viagens de alto padrão e lua de mel.",
    colors: { bg: "#0f0d0b", surface: "#1a1714", text: "#f3ece1", muted: "#a89f91", accent: "#c9a45c", onAccent: "#15120e", line: "#2c2722", band: "#1a1714", onBand: "#f3ece1" },
    heading: { family: SERIF, weight: 400, upper: false, italic: false, tracking: "0" }, body: SANS,
    radius: 2, button: "square", hero: "editorial", cards: "line",
    placeholder: "radial-gradient(80% 60% at 50% 0%, rgba(201,164,92,0.35) 0%, rgba(201,164,92,0) 60%), linear-gradient(180deg, #2a2420 0%, #0f0d0b 100%)",
    sample: { name: "Aurum Travel", tagline: "Viagens de alto padrão", eyebrow: "Concierge de viagens", title: "Experiências raras, planejadas nos mínimos detalhes", text: "Hotéis icônicos, voos em executiva e roteiros privativos para quem não abre mão do extraordinário.", city: "São Paulo, SP" },
  },
  {
    id: "trilha", name: "Trilha", category: "Aventura e natureza",
    description: "Terroso e forte, com títulos em caixa alta e capa dividida entre texto e foto. Para ecoturismo e expedições.",
    colors: { bg: "#f2efe6", surface: "#ffffff", text: "#1d2a21", muted: "#5e6a5f", accent: "#c2571a", onAccent: "#ffffff", line: "#ddd6c5", band: "#1d2a21", onBand: "#f2efe6" },
    heading: { family: SANS, weight: 900, upper: true, italic: false, tracking: "0.01em" }, body: SANS,
    radius: 6, button: "square", hero: "split", cards: "line",
    placeholder: "linear-gradient(160deg, #86a789 0%, #3f6b4f 45%, #1d2a21 100%)",
    sample: { name: "Rumo Norte Expedições", tagline: "Aventura e natureza", eyebrow: "Chapada, Patagônia e Atacama", title: "Pegue a mochila. O resto é com a gente", text: "Expedições em grupos pequenos, com guias experientes e logística resolvida do começo ao fim.", city: "Curitiba, PR" },
  },
  {
    id: "caderno", name: "Caderno de Viagem", category: "Roteiros autorais",
    description: "Editorial, em papel creme, com serifa itálica e foto emoldurada. Para quem vende roteiros pensados à mão.",
    colors: { bg: "#f6f1e7", surface: "#fffdf8", text: "#2b2622", muted: "#6f655b", accent: "#9b2c2c", onAccent: "#fffdf8", line: "#dcd2c2", band: "#2b2622", onBand: "#f6f1e7" },
    heading: { family: SERIF, weight: 400, upper: false, italic: true, tracking: "-0.01em" }, body: SERIF,
    radius: 0, button: "soft", hero: "framed", cards: "flat",
    placeholder: "linear-gradient(135deg, #d6c3a5 0%, #b08d6a 50%, #7c5a43 100%)",
    sample: { name: "Atlas & Pena", tagline: "Roteiros autorais", eyebrow: "Viagens escritas à mão", title: "Roteiros que parecem ter sido feitos só para você", text: "Cada viagem nasce de uma conversa: o seu ritmo, os seus gostos e os lugares que só quem mora lá conhece.", city: "Belo Horizonte, MG" },
  },
  {
    id: "ciranda", name: "Ciranda", category: "Família",
    description: "Colorido e acolhedor, com formas arredondadas e capa centralizada. Para parques, cruzeiros e férias em família.",
    colors: { bg: "#fffaf3", surface: "#ffffff", text: "#2a2238", muted: "#6b6478", accent: "#f25f4c", onAccent: "#ffffff", line: "#f1e6d8", band: "#2a2238", onBand: "#fffaf3" },
    heading: { family: SANS, weight: 800, upper: false, italic: false, tracking: "-0.015em" }, body: SANS,
    radius: 28, button: "pill", hero: "centered", cards: "shadow",
    placeholder: "radial-gradient(40% 50% at 15% 25%, #ffc93c 0%, rgba(255,201,60,0) 70%), radial-gradient(45% 55% at 85% 70%, #7cc6fe 0%, rgba(124,198,254,0) 70%), linear-gradient(135deg, #ffd8cc 0%, #f25f4c 100%)",
    sample: { name: "Turma da Mala", tagline: "Férias em família", eyebrow: "Orlando, cruzeiros e resorts", title: "Férias que a família inteira vai lembrar", text: "Parques, navios e resorts com tudo planejado para crianças, pais e avós aproveitarem juntos.", city: "Campinas, SP" },
  },
];

export const themeById = (id: string | null | undefined) => SITE_THEMES.find((t) => t.id === id) ?? SITE_THEMES[0]!;

/** Conteúdo de vitrine do tema (galeria): textos de exemplo, sem dados reais. */
export function sampleContent(t: SiteTheme): SiteContent {
  const c = defaultContent({ name: t.sample.name, whatsapp: "11900000000", email: "contato@exemplo.com.br", instagram: "suaagencia" });
  c.brand.tagline = t.sample.tagline;
  c.brand.city = t.sample.city;
  const hero = c.pages.inicio.sections.find((s) => s.type === "hero");
  if (hero && hero.type === "hero") Object.assign(hero, { eyebrow: t.sample.eyebrow, title: t.sample.title, text: t.sample.text });
  for (const s of c.pages.inicio.sections) if (s.type === "numeros" || s.type === "depoimentos") s.on = true;
  return c;
}

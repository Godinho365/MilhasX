// Personalização da Central de Atendimento (/p/[slug]): textos de cada página, botões,
// cor de fundo e prévia do link. Guardado como JSON em SalesProfile.design e sempre lido
// por resolveDesign, que completa o que faltar com os textos padrão.
import { DEFAULT_CONTRACT } from "./proposal";

export type ButtonKind = "cotacao" | "gestao" | "whatsapp" | "link";
export type PageButton = { kind: ButtonKind; label: string; description: string; url?: string };

export type PageDesign = {
  bgColor: string | null;
  buttons: PageButton[];
  captacao: { title: string; text: string; submit: string; thanksTitle: string; thanks: string; askBudget: boolean; askBaggage: boolean; askDirect: boolean; askFlexible: boolean };
  gestao: { kicker: string; title: string; text: string; submit: string; thanks: string; askPrograms: boolean; askIncome: boolean };
  cotacao: { text: string; cta: string; footer: string };
  reserva: { title: string; text: string; tips: string };
  gestaoMilhas: { title: string; text: string };
  contrato: { title: string; text: string; terms: string; submit: string; thanks: string; agencyDoc: string; agencyAddress: string };
  share: { title: string; description: string };
};

/** As páginas que o editor personaliza, na ordem das abas. */
export const DESIGN_PAGES = [
  { key: "home", label: "Página Principal (Bio)" },
  { key: "captacao", label: "Captação de Viagens" },
  { key: "gestao", label: "Interesse em Gestão" },
  { key: "cotacao", label: "Cotação" },
  { key: "reserva", label: "Reserva Confirmada" },
  { key: "gestaoMilhas", label: "Gestão de Milhas" },
  { key: "contrato", label: "Assinatura de Contrato" },
] as const;
export type DesignPage = (typeof DESIGN_PAGES)[number]["key"];


export const BUILTIN_BUTTONS: Record<Exclude<ButtonKind, "link">, { label: string; description: string }> = {
  cotacao: { label: "Pedir cotação de viagem", description: "Envie trecho, datas e passageiros para cotarmos com milhas" },
  gestao: { label: "Interesse em gestão de milhas", description: "Assessoria para acumular, multiplicar e emitir passagens" },
  whatsapp: { label: "Falar no WhatsApp", description: "Tire dúvidas direto comigo pelo WhatsApp" },
};

export const DEFAULT_DESIGN: PageDesign = {
  bgColor: null,
  buttons: (["cotacao", "gestao", "whatsapp"] as const).map((kind) => ({ kind, ...BUILTIN_BUTTONS[kind] })),
  captacao: { title: "Solicite sua cotação", text: "Conte para onde quer ir. Cotamos com milhas e respondemos pelo WhatsApp.", submit: "Enviar solicitação", thanksTitle: "Solicitação enviada!", thanks: "Recebemos seu pedido e vamos falar com você pelo WhatsApp em breve.", askBudget: false, askBaggage: true, askDirect: true, askFlexible: true },
  gestao: { kicker: "Assessoria & Gestão", title: "Interesse em Gestão de Milhas", text: "Preencha seus dados para avaliarmos o potencial das suas milhas e como viajar mais gastando menos.", submit: "Enviar interesse", thanks: "Recebemos seu interesse! Em breve entraremos em contato.", askPrograms: true, askIncome: true },
  cotacao: { text: "Preparamos esta cotação para você. Confira os voos, o que está incluso e o valor.", cta: "WhatsApp", footer: "Valores e disponibilidade podem mudar até a emissão." },
  reserva: { title: "Reserva confirmada", text: "", tips: "Faça o check-in online a partir de 48h antes do voo e chegue ao aeroporto com antecedência." },
  gestaoMilhas: { title: "Seu painel de milhas", text: "Saldo e movimentações das suas contas, atualizados pela nossa equipe." },
  contrato: { title: "Termo de Compra e Venda de Passagem Aérea", text: "", terms: DEFAULT_CONTRACT, submit: "Assinar termo", thanks: "Termo assinado! Uma cópia fica disponível na página da sua reserva.", agencyDoc: "", agencyAddress: "" },
  share: { title: "", description: "" },
};

export const BG_PRESETS = ["#09090b", "#0f172a", "#1e1b4b", "#052e16", "#3b0764", "#7c2d12", "#f8fafc", "#fef3c7", "#e0f2fe", "#fce7f3"] as const;
export const MAX_LINK_BUTTONS = 6;

const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const safeUrl = (v: unknown) => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Normaliza o JSON salvo (ou o rascunho do editor): nunca devolve campo ausente nem URL perigosa. */
export function resolveDesign(raw: unknown): PageDesign {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Cada campo de texto: limite de tamanho e, se vier vazio, o padrão (menos os opcionais)
  const LIMITS: Record<string, number> = { title: 80, kicker: 40, text: 300, submit: 40, thanksTitle: 60, thanks: 200, cta: 40, footer: 200, tips: 500, terms: 8000, agencyDoc: 30, agencyAddress: 200 };
  const OPTIONAL = new Set(["text", "footer", "tips", "kicker", "agencyDoc", "agencyAddress"]);
  const sect = <K extends "captacao" | "gestao" | "cotacao" | "reserva" | "gestaoMilhas" | "contrato">(k: K): PageDesign[K] => {
    const s = (o[k] && typeof o[k] === "object" ? o[k] : {}) as Record<string, unknown>;
    const d = DEFAULT_DESIGN[k] as Record<string, string | boolean>;
    return Object.fromEntries(Object.keys(d).map((f) => {
      if (typeof d[f] === "boolean") return [f, typeof s[f] === "boolean" ? s[f] : d[f]];
      const v = str(s[f], LIMITS[f] ?? 200, d[f] as string);
      return [f, v || (OPTIONAL.has(f) ? "" : d[f])];
    })) as PageDesign[K];
  };
  // Botões: a ordem vem do salvo; os três fixos aparecem uma vez cada, os links até o limite
  const seen = new Set<ButtonKind>();
  const buttons: PageButton[] = [];
  let links = 0;
  for (const b of Array.isArray(o.buttons) ? o.buttons : []) {
    if (!b || typeof b !== "object") continue;
    const r = b as Record<string, unknown>;
    const kind = r.kind as ButtonKind;
    if (kind === "link") {
      const url = safeUrl(r.url);
      const label = str(r.label, 60, "");
      if (!url || !label || links >= MAX_LINK_BUTTONS) continue;
      links++;
      buttons.push({ kind, label, description: str(r.description, 120, ""), url });
    } else if (kind in BUILTIN_BUTTONS && !seen.has(kind)) {
      seen.add(kind);
      const d = BUILTIN_BUTTONS[kind as Exclude<ButtonKind, "link">];
      buttons.push({ kind, label: str(r.label, 60, d.label) || d.label, description: str(r.description, 120, d.description) });
    }
  }
  for (const b of DEFAULT_DESIGN.buttons) if (!seen.has(b.kind)) buttons.push({ ...b });
  const share = (o.share && typeof o.share === "object" ? o.share : {}) as Record<string, unknown>;
  return {
    bgColor: typeof o.bgColor === "string" && HEX.test(o.bgColor) ? o.bgColor.toLowerCase() : null,
    buttons,
    captacao: sect("captacao"),
    gestao: sect("gestao"),
    cotacao: sect("cotacao"),
    reserva: sect("reserva"),
    gestaoMilhas: sect("gestaoMilhas"),
    contrato: sect("contrato"),
    share: { title: str(share.title, 80, ""), description: str(share.description, 200, "") },
  };
}

/** Sem cor escolhida, ou com fundo claro, usa o tema claro das páginas do cliente; fundo escuro pede texto claro. */
export function themeForBg(hex: string | null): "dark" | "client" {
  if (!hex || !HEX.test(hex)) return "client";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "client" : "dark";
}

/** Os recursos marcados PRO (cor, banner, prévia do link) foram mudados em relação ao padrão? */
export function usesBranding(d: PageDesign, hasBanner: boolean) {
  return d.bgColor !== null || hasBanner || d.share.title !== "" || d.share.description !== "";
}

/** Endereço do banner (com versão para não usar cache velho); `override` é o da prévia do editor. */
export const bannerUrl = (slug: string, version: string | null, override?: string | null) =>
  override !== undefined ? override : version ? `/api/public/banner/${encodeURIComponent(slug)}?v=${version}` : null;

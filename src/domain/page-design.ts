// Personalização da Central de Atendimento (/p/[slug]): textos de cada página, botões,
// cor de fundo e prévia do link. Guardado como JSON em SalesProfile.design e sempre lido
// por resolveDesign, que completa o que faltar com os textos padrão.

export type ButtonKind = "cotacao" | "gestao" | "whatsapp" | "link";
export type PageButton = { kind: ButtonKind; label: string; description: string; url?: string };

export type PageDesign = {
  bgColor: string | null;
  buttons: PageButton[];
  captacao: { title: string; text: string; submit: string; thanks: string };
  gestao: { title: string; text: string; submit: string; thanks: string };
  cotacao: { title: string; text: string; cta: string; footer: string };
  reserva: { title: string; text: string; tips: string };
  gestaoMilhas: { title: string; text: string };
  contrato: { title: string; text: string; terms: string; submit: string; thanks: string };
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

const DEFAULT_TERMS = `1. Objeto: assessoria na gestão de milhas e pontos do CLIENTE (acúmulo, transferências bonificadas e emissões).
2. O CLIENTE continua titular das suas contas e senhas; a assessoria só age com autorização prévia para cada operação.
3. Remuneração: conforme proposta combinada pelo WhatsApp ou e-mail.
4. Qualquer parte pode encerrar a assessoria a qualquer momento, avisando a outra por escrito.
5. Os dados do CLIENTE são usados só para prestar este serviço.`;

export const BUILTIN_BUTTONS: Record<Exclude<ButtonKind, "link">, { label: string; description: string }> = {
  cotacao: { label: "Pedir cotação de viagem", description: "Envie trecho, datas e passageiros para cotarmos com milhas" },
  gestao: { label: "Interesse em gestão de milhas", description: "Assessoria para acumular, multiplicar e emitir passagens" },
  whatsapp: { label: "Falar no WhatsApp", description: "Tire dúvidas direto comigo pelo WhatsApp" },
};

export const DEFAULT_DESIGN: PageDesign = {
  bgColor: null,
  buttons: (["cotacao", "gestao", "whatsapp"] as const).map((kind) => ({ kind, ...BUILTIN_BUTTONS[kind] })),
  captacao: { title: "Pedir cotação de viagem", text: "Conte para onde quer ir. Cotamos com milhas e respondemos pelo WhatsApp ou e-mail.", submit: "Pedir cotação", thanks: "Pedido enviado! Em breve entraremos em contato com a sua cotação." },
  gestao: { title: "Interesse em gestão de milhas", text: "Deixe seu contato para conversarmos sobre como acumular e usar melhor seus pontos.", submit: "Quero saber mais", thanks: "Recebemos seu interesse! Em breve entraremos em contato." },
  cotacao: { title: "Sua cotação", text: "Separei as melhores opções para a sua viagem. Os valores podem mudar até a emissão.", cta: "Aprovar pelo WhatsApp", footer: "Cotação válida enquanto houver disponibilidade de assentos." },
  reserva: { title: "Reserva confirmada!", text: "Sua passagem foi emitida. Guarde o localizador abaixo.", tips: "Faça o check-in online a partir de 48h antes do voo e chegue ao aeroporto com antecedência." },
  gestaoMilhas: { title: "Suas milhas", text: "Acompanhe aqui o saldo das suas contas, atualizado pela nossa equipe." },
  contrato: { title: "Contrato de gestão de milhas", text: "Leia os termos abaixo e confirme para começarmos.", terms: DEFAULT_TERMS, submit: "Li e aceito", thanks: "Contrato assinado! Você receberá a confirmação pelo WhatsApp ou e-mail." },
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
  const LIMITS: Record<string, number> = { title: 80, text: 300, submit: 40, thanks: 200, cta: 40, footer: 200, tips: 500, terms: 5000 };
  const OPTIONAL = new Set(["text", "footer", "tips"]);
  const sect = <K extends "captacao" | "gestao" | "cotacao" | "reserva" | "gestaoMilhas" | "contrato">(k: K): PageDesign[K] => {
    const s = (o[k] && typeof o[k] === "object" ? o[k] : {}) as Record<string, unknown>;
    const d = DEFAULT_DESIGN[k] as Record<string, string>;
    return Object.fromEntries(Object.keys(d).map((f) => {
      const v = str(s[f], LIMITS[f] ?? 200, d[f]!);
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

/** Fundo claro pede texto escuro: escolhe o tema da página pela luminância da cor. */
export function themeForBg(hex: string | null): "dark" | "light" {
  if (!hex || !HEX.test(hex)) return "dark";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "light" : "dark";
}

/** Os recursos marcados PRO (cor, banner, prévia do link) foram mudados em relação ao padrão? */
export function usesBranding(d: PageDesign, hasBanner: boolean) {
  return d.bgColor !== null || hasBanner || d.share.title !== "" || d.share.description !== "";
}

/** Endereço do banner (com versão para não usar cache velho); `override` é o da prévia do editor. */
export const bannerUrl = (slug: string, version: string | null, override?: string | null) =>
  override !== undefined ? override : version ? `/api/public/banner/${encodeURIComponent(slug)}?v=${version}` : null;

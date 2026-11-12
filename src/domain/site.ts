// Site da agência: o mesmo conteúdo (marca, páginas e seções) vale para todos os temas, então trocar
// de tema não perde nada. Cada página é uma lista de seções que o dono liga, desliga, ordena e edita.

export const SITE_PAGES = ["inicio", "destinos", "sobre", "contato"] as const;
export type SitePage = (typeof SITE_PAGES)[number];
export const PAGE_LABELS: Record<SitePage, string> = { inicio: "Início", destinos: "Destinos", sobre: "Sobre nós", contato: "Contato" };
export const pagePath = (p: SitePage) => (p === "inicio" ? "" : `/${p}`);

export type Item = { title: string; text: string };
export type Stat = { value: string; label: string };
export type Quote = { text: string; author: string; place: string };
export type Faq = { q: string; a: string };

/** Tipos de seção que existem em qualquer tema (o tema só muda o visual). */
export type Section =
  | { type: "hero"; on: boolean; eyebrow: string; title: string; text: string; button: string; button2: string; note: string; imageId: string | null }
  | { type: "selos"; on: boolean; items: Item[] }
  | { type: "cotacao"; on: boolean; title: string; text: string; button: string }
  | { type: "milhas"; on: boolean; title: string; text: string; button: string }
  | { type: "numeros"; on: boolean; items: Stat[] }
  | { type: "pacotes"; on: boolean; title: string; text: string; limit: number }
  | { type: "diferenciais"; on: boolean; title: string; items: Item[] }
  | { type: "passos"; on: boolean; title: string; items: Item[] }
  | { type: "depoimentos"; on: boolean; title: string; items: Quote[] }
  | { type: "texto"; on: boolean; title: string; text: string; imageId: string | null }
  | { type: "galeria"; on: boolean; title: string; imageIds: string[] }
  | { type: "faq"; on: boolean; title: string; items: Faq[] }
  | { type: "chamada"; on: boolean; title: string; text: string; button: string }
  | { type: "contato"; on: boolean; title: string; text: string };
export type SectionType = Section["type"];

export const SECTION_LABELS: Record<SectionType, { label: string; help: string }> = {
  hero: { label: "Capa", help: "Título, frase, botão de cotação, botão de WhatsApp e foto de fundo" },
  selos: { label: "Selos de confiança", help: "Faixa logo abaixo da capa: Cadastur, CNPJ e garantias (até 6)" },
  cotacao: { label: "Pedir cotação", help: "Formulário de cotação da Central: cada envio vira um pedido no CRM" },
  milhas: { label: "Gestão de milhas", help: "Formulário de interesse em gestão de milhas: vira um interessado no CRM" },
  numeros: { label: "Números", help: "Até 4 números que passam confiança (anos, viajantes, nota)" },
  pacotes: { label: "Pacotes da Vitrine", help: "Os cards visíveis da sua Vitrine, com o botão de WhatsApp" },
  diferenciais: { label: "Diferenciais", help: "Por que viajar com a agência (até 6 itens)" },
  passos: { label: "Como funciona", help: "As etapas, do primeiro contato ao embarque (até 5)" },
  depoimentos: { label: "Depoimentos", help: "O que os clientes dizem (até 6)" },
  texto: { label: "Texto com foto", help: "Bloco livre: história, missão, uma viagem especial" },
  galeria: { label: "Galeria de fotos", help: "Até 8 fotos de viagens e clientes" },
  faq: { label: "Perguntas frequentes", help: "Dúvidas comuns e respostas (até 8)" },
  chamada: { label: "Chamada final", help: "Faixa com convite e botão para falar com a agência" },
  contato: { label: "Contato", help: "WhatsApp, e-mail, Instagram, cidade e o pedido de cotação" },
};

export type SiteBrand = {
  name: string; tagline: string; logoId: string | null; city: string; accent: string | null;
  /** ícone do site (favicon): aba do navegador e atalho na tela do celular */
  iconId: string | null;
  whatsapp: string; email: string; instagram: string; facebook: string; tiktok: string;
  /** confiança: aparecem no rodapé e nos selos */
  cnpj: string; cadastur: string; hours: string; responseTime: string;
};
export type SitePageContent = { on: boolean; sections: Section[] };
export type SiteContent = { brand: SiteBrand; pages: Record<SitePage, SitePageContent> };

const LIMITS: Record<string, number> = { numeros: 4, diferenciais: 6, passos: 5, depoimentos: 6, faq: 8, galeria: 8, selos: 6 };

/** Seção nova em branco (com textos de exemplo para o dono trocar). */
export function blankSection(type: SectionType): Section {
  switch (type) {
    case "hero": return { type, on: true, eyebrow: "", title: "Sua próxima viagem começa aqui", text: "Conte para onde quer ir e a gente cuida do resto.", button: "Pedir minha cotação", button2: "Chamar no WhatsApp", note: "Resposta rápida · sem compromisso", imageId: null };
    case "selos": return { type, on: true, items: [{ title: "Atendimento humano", text: "Gente de verdade do orçamento à volta" }, { title: "Cotação sem compromisso", text: "Você só fecha se gostar" }, { title: "Milhas ou tarifa", text: "Emitimos o que sair melhor" }] };
    case "cotacao": return { type, on: true, title: "Peça sua cotação", text: "Conte o destino e as datas. A gente responde com as melhores opções.", button: "Receber minha cotação" };
    case "milhas": return { type, on: true, title: "Gestão de milhas", text: "Quer juntar mais pontos e viajar pagando menos? Deixe seu contato e a gente explica como funciona.", button: "Quero saber mais" };
    case "numeros": return { type, on: true, items: [{ value: "10+", label: "anos de estrada" }, { value: "2.000", label: "viajantes atendidos" }, { value: "4,9", label: "nota dos clientes" }] };
    case "pacotes": return { type, on: true, title: "Pacotes em destaque", text: "Valores por pessoa, sujeitos a disponibilidade.", limit: 6 };
    case "diferenciais": return { type, on: true, title: "Por que viajar com a gente", items: [{ title: "Atendimento de verdade", text: "Uma pessoa acompanha você do orçamento à volta." }, { title: "Passagens com milhas", text: "Emitimos com milhas ou tarifa, o que sair melhor." }, { title: "Suporte na viagem", text: "Plantão no WhatsApp enquanto você estiver fora." }] };
    case "passos": return { type, on: true, title: "Como funciona", items: [{ title: "Conte sua ideia", text: "Destino, datas e quem vai." }, { title: "Receba a proposta", text: "Voos, hotéis e valores em um link." }, { title: "Embarque tranquilo", text: "Cuidamos das reservas e do acompanhamento." }] };
    case "depoimentos": return { type, on: true, title: "Quem já viajou", items: [{ text: "Tudo funcionou do jeito que combinamos. Recomendo!", author: "Cliente", place: "São Paulo" }] };
    case "texto": return { type, on: true, title: "Nossa história", text: "Escreva aqui como a agência começou e o que a move.", imageId: null };
    case "galeria": return { type, on: true, title: "Momentos de viagem", imageIds: [] };
    case "faq": return { type, on: true, title: "Perguntas frequentes", items: [{ q: "As passagens estão incluídas?", a: "Sim. Cotamos com milhas ou tarifa e mostramos o que sair melhor." }] };
    case "chamada": return { type, on: true, title: "Vamos planejar a sua viagem?", text: "Fale com a gente e receba uma proposta sem compromisso.", button: "Falar no WhatsApp" };
    case "contato": return { type, on: true, title: "Fale com a gente", text: "Respondemos rapidinho em horário comercial." };
  }
}

/**
 * Páginas padrão: as mesmas em todos os temas. Números e depoimentos começam desligados: os textos
 * de exemplo não podem ir ao ar como se fossem dados reais da agência.
 */
export function defaultPages(): Record<SitePage, SitePageContent> {
  const s = (t: SectionType) => ({ ...blankSection(t), on: t !== "numeros" && t !== "depoimentos" }) as Section;
  return {
    // início: promessa + 2 botões, prova de confiança logo abaixo, oferta, objeções (FAQ) e o formulário antes do fim
    inicio: { on: true, sections: [s("hero"), s("selos"), s("pacotes"), s("diferenciais"), s("passos"), s("numeros"), s("depoimentos"), s("cotacao"), s("faq"), s("chamada")] },
    destinos: { on: true, sections: [{ ...(s("hero") as Extract<Section, { type: "hero" }>), title: "Destinos e pacotes", text: "Roteiros prontos para embarcar. Não achou o seu? A gente monta sob medida." }, { ...(s("pacotes") as Extract<Section, { type: "pacotes" }>), limit: 24 }, s("cotacao"), s("chamada")] },
    sobre: { on: true, sections: [{ ...(s("hero") as Extract<Section, { type: "hero" }>), title: "Sobre a agência", text: "Gente que viaja, planejando viagens para quem quer aproveitar." }, s("texto"), s("selos"), s("numeros"), s("diferenciais"), s("depoimentos"), s("chamada")] },
    contato: { on: true, sections: [{ ...(s("hero") as Extract<Section, { type: "hero" }>), title: "Contato", text: "Escolha o canal que preferir." }, s("cotacao"), s("contato"), s("milhas"), s("faq")] },
  };
}

export function defaultContent(agency: { name: string; whatsapp?: string | null; email?: string | null; instagram?: string | null }): SiteContent {
  return {
    brand: { name: agency.name, tagline: "", logoId: null, iconId: null, city: "", accent: null, whatsapp: agency.whatsapp ?? "", email: agency.email ?? "", instagram: agency.instagram ?? "", facebook: "", tiktok: "", cnpj: "", cadastur: "", hours: "", responseTime: "" },
    pages: defaultPages(),
  };
}

// ---------- Normalização: o que vem do banco ou do editor nunca sai do formato ----------

const ID = /^[a-z0-9]{10,40}$/;
const str = (v: unknown, max: number, dflt = "") => (typeof v === "string" ? v.trim().slice(0, max) : dflt);
const img = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : null);
const arr = <T>(v: unknown, max: number, map: (x: Record<string, unknown>) => T, keep: (t: T) => boolean) =>
  (Array.isArray(v) ? v : []).filter((x) => x && typeof x === "object").map((x) => map(x as Record<string, unknown>)).filter(keep).slice(0, max);
/** Perfil de rede social: aceita @usuario ou o link inteiro e guarda só o usuário. */
const handle = (v: unknown) => str(v, 120).replace(/^https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.com|tiktok\.com)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").slice(0, 60);
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);

export function normalizeSection(raw: unknown): Section | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = o.type as SectionType;
  if (!(type in SECTION_LABELS)) return null;
  const on = o.on !== false;
  const items2 = (max: number) => arr(o.items, max, (x) => ({ title: str(x.title, 80), text: str(x.text, 300) }), (x) => !!(x.title || x.text));
  switch (type) {
    case "hero": return { type, on, eyebrow: str(o.eyebrow, 60), title: str(o.title, 120), text: str(o.text, 300), button: str(o.button, 40), button2: str(o.button2, 40), note: str(o.note, 80), imageId: img(o.imageId) };
    case "selos": return { type, on, items: items2(LIMITS.selos!) };
    case "cotacao": return { type, on, title: str(o.title, 80), text: str(o.text, 300), button: str(o.button, 40) };
    case "milhas": return { type, on, title: str(o.title, 80), text: str(o.text, 300), button: str(o.button, 40) };
    case "numeros": return { type, on, items: arr(o.items, LIMITS.numeros!, (x) => ({ value: str(x.value, 12), label: str(x.label, 40) }), (x) => !!x.value) };
    case "pacotes": return { type, on, title: str(o.title, 80), text: str(o.text, 200), limit: Math.min(24, Math.max(1, Number(o.limit) || 6)) };
    case "diferenciais": return { type, on, title: str(o.title, 80), items: items2(LIMITS.diferenciais!) };
    case "passos": return { type, on, title: str(o.title, 80), items: items2(LIMITS.passos!) };
    case "depoimentos": return { type, on, title: str(o.title, 80), items: arr(o.items, LIMITS.depoimentos!, (x) => ({ text: str(x.text, 400), author: str(x.author, 60), place: str(x.place, 60) }), (x) => !!x.text) };
    case "texto": return { type, on, title: str(o.title, 100), text: str(o.text, 3000), imageId: img(o.imageId) };
    case "galeria": return { type, on, title: str(o.title, 80), imageIds: (Array.isArray(o.imageIds) ? o.imageIds : []).map(img).filter((x): x is string => !!x).slice(0, LIMITS.galeria) };
    case "faq": return { type, on, title: str(o.title, 80), items: arr(o.items, LIMITS.faq!, (x) => ({ q: str(x.q, 160), a: str(x.a, 800) }), (x) => !!x.q) };
    case "chamada": return { type, on, title: str(o.title, 100), text: str(o.text, 300), button: str(o.button, 40) };
    case "contato": return { type, on, title: str(o.title, 80), text: str(o.text, 300) };
  }
}

export function normalizeContent(raw: unknown, fallback: SiteContent): SiteContent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (o.brand && typeof o.brand === "object" ? o.brand : {}) as Record<string, unknown>;
  const pagesIn = (o.pages && typeof o.pages === "object" ? o.pages : {}) as Record<string, unknown>;
  const pages = {} as Record<SitePage, SitePageContent>;
  for (const p of SITE_PAGES) {
    const pg = pagesIn[p] as Record<string, unknown> | undefined;
    if (!pg || !Array.isArray(pg.sections)) { pages[p] = fallback.pages[p]; continue; }
    pages[p] = { on: p === "inicio" ? true : pg.on !== false, sections: pg.sections.map(normalizeSection).filter((x): x is Section => !!x).slice(0, 20) };
  }
  return {
    brand: {
      // nome e frase são opcionais: vazio fica vazio (o site mostra a logo, se houver)
      name: typeof b.name === "string" ? str(b.name, 60) : fallback.brand.name, tagline: str(b.tagline, 100), logoId: img(b.logoId), iconId: img(b.iconId), city: str(b.city, 60),
      whatsapp: str(b.whatsapp, 30), email: str(b.email, 120), instagram: handle(b.instagram), facebook: handle(b.facebook), tiktok: handle(b.tiktok), accent: color(b.accent),
      cnpj: str(b.cnpj, 20), cadastur: str(b.cadastur, 30), hours: str(b.hours, 80), responseTime: str(b.responseTime, 60),
    },
    pages,
  };
}

/** Fotos usadas no conteúdo (para saber o que pode ficar público). */
export function imageIdsOf(c: SiteContent) {
  const ids = new Set<string>();
  if (c.brand.logoId) ids.add(c.brand.logoId);
  if (c.brand.iconId) ids.add(c.brand.iconId);
  for (const p of SITE_PAGES) for (const s of c.pages[p].sections) {
    if ((s.type === "hero" || s.type === "texto") && s.imageId) ids.add(s.imageId);
    if (s.type === "galeria") s.imageIds.forEach((i) => ids.add(i));
  }
  return ids;
}

/** Link do WhatsApp com a mensagem pronta (DDI 55 quando vem só com DDD). */
export function siteWhatsapp(phone: string, text: string) {
  const d = phone.replace(/\D/g, "");
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(text)}` : null;
}

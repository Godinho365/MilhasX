// Ponto único de controle do que roda no navegador além do próprio app: scripts de terceiros e dados guardados no
// navegador por categoria de consentimento. Para incluir uma ferramenta nova (analytics, pixel de anúncios...),
// cadastre aqui com a categoria certa: ela só carrega depois da escolha afirmativa, e a central de preferências
// passa a controlá-la. Nunca coloque <script> de terceiro direto numa página.
import { allows, type Consent, type ConsentCategory, type OptionalCategory } from "@/domain/consent";
import { getConsent } from "./store";

export type ThirdPartyScript = {
  id: string;
  category: ConsentCategory;
  vendor: string;
  /** para que serve, em linguagem simples (mostrado na central de preferências) */
  purpose: string;
  src: string;
  /** true = carrega sozinho em todas as páginas quando a categoria é permitida; false = só quando um componente pede */
  autoload: boolean;
};

export const THIRD_PARTY_SCRIPTS: ThirdPartyScript[] = [
  {
    id: "turnstile",
    category: "necessary",
    vendor: "Cloudflare Turnstile",
    purpose: "Verificação anti-robô nos formulários de cadastro e de pedidos de privacidade. Só carrega nessas páginas.",
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    autoload: false,
  },
  // Nenhuma ferramenta de analytics ou de marketing de terceiros está instalada hoje. Exemplo de cadastro:
  // { id: "meta-pixel", category: "marketing", vendor: "Meta", purpose: "...", src: "https://connect.facebook.net/...", autoload: true },
];

/**
 * Dados que o próprio app guarda no navegador para uma categoria opcional. São apagados quando a pessoa retira o
 * consentimento da categoria.
 */
export const FIRST_PARTY_STORAGE: Record<OptionalCategory, { sessionStorage: string[]; localStorage: string[] }> = {
  analytics: { sessionStorage: [], localStorage: [] },
  // origem da visita (utm_* e fbclid) guardada nas páginas da agência para ligar o pedido ao anúncio
  marketing: { sessionStorage: ["mx_utm"], localStorage: [] },
};

const loaded = new Map<string, Promise<void>>();

/** Scripts de uma categoria que já foram carregados nesta página (para recarregar a página se o consentimento sair). */
export const loadedCategories = () => new Set(THIRD_PARTY_SCRIPTS.filter((s) => loaded.has(s.id)).map((s) => s.category));

/** Carrega um script cadastrado, se a categoria dele estiver permitida. Rejeita se não estiver. */
export function loadThirdParty(id: string, consent: Consent | null = getConsent()): Promise<void> {
  const s = THIRD_PARTY_SCRIPTS.find((x) => x.id === id);
  if (!s) return Promise.reject(new Error(`script não cadastrado: ${id}`));
  if (!allows(consent, s.category)) return Promise.reject(new Error(`sem consentimento para ${s.category}`));
  let p = loaded.get(id);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = s.src;
      el.async = true;
      el.dataset.consent = s.category;
      el.onload = () => resolve();
      el.onerror = () => {
        loaded.delete(id);
        el.remove();
        reject(new Error(id));
      };
      document.head.appendChild(el);
    });
    loaded.set(id, p);
  }
  return p;
}

/** Carrega os scripts automáticos permitidos pela escolha atual. */
export function autoloadAllowed(consent: Consent | null) {
  for (const s of THIRD_PARTY_SCRIPTS) if (s.autoload && allows(consent, s.category)) loadThirdParty(s.id, consent).catch(() => {});
}

/** Apaga o que o app guardou no navegador para as categorias não permitidas (inclusive o que ficou de antes do aviso). */
export function clearNotAllowed(consent: Consent | null) {
  for (const cat of ["analytics", "marketing"] as const) {
    if (allows(consent, cat)) continue;
    const { sessionStorage: ss, localStorage: ls } = FIRST_PARTY_STORAGE[cat];
    try {
      for (const k of ss) window.sessionStorage.removeItem(k);
      for (const k of ls) window.localStorage.removeItem(k);
    } catch { /* navegador sem armazenamento */ }
  }
}

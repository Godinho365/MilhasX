// Consentimento de cookies e tecnologias parecidas (LGPD). O que o visitante escolheu, quando e em qual versão do
// aviso. Os necessários valem sempre; analíticos e marketing só depois de uma escolha afirmativa. Trocar a versão
// do aviso (CONSENT_VERSION) faz todo mundo escolher de novo: a escolha antiga deixa de valer.

/** Cookie que guarda a escolha (o próprio cookie é necessário: sem ele a escolha não é respeitada). */
export const CONSENT_COOKIE = "mx_consent";
/** Versão do aviso de cookies. Mude quando as categorias, as ferramentas ou o texto do aviso mudarem. */
export const CONSENT_VERSION = "2026-11-13";
/**
 * Por quanto tempo o navegador guarda a escolha. Escolha técnica (12 meses) a confirmar pelo responsável:
 * depois desse prazo o aviso volta a aparecer.
 */
export const CONSENT_MAX_AGE_DAYS = 365;

export type ConsentCategory = "necessary" | "analytics" | "marketing";
export type OptionalCategory = Exclude<ConsentCategory, "necessary">;

export type Consent = {
  version: string;
  analytics: boolean;
  marketing: boolean;
  /** quando a escolha foi feita (ISO, em segundos inteiros) */
  decidedAt: string;
};

export const CONSENT_CATEGORIES: { key: ConsentCategory; title: string; description: string; required: boolean }[] = [
  {
    key: "necessary",
    title: "Necessários",
    description:
      "Fazem o site funcionar: manter você conectado, proteger o login e os formulários contra robôs, guardar o tema e as preferências de tela e lembrar esta escolha. Não podem ser desligados.",
    required: true,
  },
  {
    key: "analytics",
    title: "Analíticos",
    description:
      "Ajudam a entender como o site é usado (quais páginas são visitadas, por quanto tempo), de forma agregada, para melhorar a experiência.",
    required: false,
  },
  {
    key: "marketing",
    title: "Marketing",
    description:
      "Medem os resultados de anúncios: guardam de qual campanha você chegou (parâmetros do link, como utm e fbclid) para que o pedido enviado seja ligado ao anúncio, e permitem ferramentas de anúncios de terceiros, quando houver.",
    required: false,
  },
];

const secondsIso = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString();

/** Uma escolha nova, na versão atual do aviso. */
export function newConsent(choice: { analytics: boolean; marketing: boolean }, now = Date.now()): Consent {
  return { version: CONSENT_VERSION, analytics: !!choice.analytics, marketing: !!choice.marketing, decidedAt: secondsIso(now) };
}

/** Valor do cookie: "<versão>.<analíticos><marketing>.<segundos>", por exemplo "2026-11-13.01.1763000000". */
export function encodeConsent(c: Consent): string {
  return `${c.version}.${c.analytics ? 1 : 0}${c.marketing ? 1 : 0}.${Math.floor(Date.parse(c.decidedAt) / 1000)}`;
}

/** Lê o cookie. Nulo se não existe, está malformado ou é de outra versão do aviso (aí o aviso aparece de novo). */
export function decodeConsent(raw: string | null | undefined): Consent | null {
  const m = /^([0-9A-Za-z-]{1,32})\.([01])([01])\.(\d{9,11})$/.exec(raw?.trim() ?? "");
  if (!m || m[1] !== CONSENT_VERSION) return null;
  const ms = Number(m[4]) * 1000;
  if (!Number.isFinite(ms) || ms > Date.now() + 86400_000) return null;
  return { version: m[1], analytics: m[2] === "1", marketing: m[3] === "1", decidedAt: new Date(ms).toISOString() };
}

/** Lê a escolha guardada na conta (JSON). Mesmas regras do cookie. */
export function storedConsent(v: unknown): Consent | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.version !== CONSENT_VERSION || typeof o.decidedAt !== "string" || !Number.isFinite(Date.parse(o.decidedAt))) return null;
  return { version: CONSENT_VERSION, analytics: o.analytics === true, marketing: o.marketing === true, decidedAt: secondsIso(Date.parse(o.decidedAt)) };
}

/** A escolha mais recente entre duas (do navegador e da conta). */
export function newestConsent(a: Consent | null, b: Consent | null): Consent | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.decidedAt) > Date.parse(a.decidedAt) ? b : a;
}

export const sameConsent = (a: Consent | null, b: Consent | null) => (a && b ? encodeConsent(a) === encodeConsent(b) : a === b);

/** Pode usar a categoria? Necessários sempre; os outros só com a escolha afirmativa (sem escolha = não). */
export function allows(c: Consent | null, cat: ConsentCategory): boolean {
  if (cat === "necessary") return true;
  return !!c && c[cat] === true;
}

/** Set-Cookie da escolha. HttpOnly: a página recebe a escolha do servidor, nenhum script precisa ler o cookie. */
export function consentCookieHeader(c: Consent | null, secure: boolean) {
  const flags = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  if (!c) return `${CONSENT_COOKIE}=; ${flags}; Max-Age=0`;
  return `${CONSENT_COOKIE}=${encodeConsent(c)}; ${flags}; Max-Age=${CONSENT_MAX_AGE_DAYS * 86400}`;
}

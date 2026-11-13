// Balcão MilhasX: cliente da API de parceiro do Balcão (bot/partner_api.py, no projeto balcaogomilhasx-app).
// Só pela rede interna do Docker (BALCAO_API_URL=http://balcao-bot:8080): o Balcão recusa o que chega pela internet.
// Cada chamada leva o segredo de serviço (BALCAO_API_SECRET, o PARTNER_API_SECRET de lá) e, menos a de vincular,
// o token do vínculo do membro. Repetição automática (uma vez) só no que é seguro repetir: GET e o PUT da proposta
// (o Balcão não avisa o comprador de novo quando o valor é o mesmo).
import { log } from "./db";

export const balcaoApiUrl = () => process.env.BALCAO_API_URL?.trim().replace(/\/+$/, "") || "";
export const balcaoEnabled = () => !!(balcaoApiUrl() && process.env.BALCAO_API_SECRET?.trim());

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 300;

/** Erro devolvido pelo Balcão: status HTTP, o código estável dele ({"erro": {"codigo", "mensagem"}}) e, no 429, a espera. */
export class BalcaoApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly retryAfter: number | null = null) {
    super(message);
  }
  /** O token não vale mais (desvinculado no bot, conta excluída ou outro código usado). */
  get unlinked() { return this.status === 401 && this.code === "vinculo_invalido"; }
  get limited() { return this.status === 429; }
}

export type BalcaoMember = {
  nome: string | null; usuario: string | null; perfil: string | null;
  pode_ver_ofertas: boolean; pode_vender: boolean; plano_vence_em: string | null;
};
export type BalcaoBuyer = {
  perfil: string | null; verificado: boolean; negociacoes: number; intermediacoes: number;
  nota: number | null; avaliacoes: number; membro_desde: string | null;
};
export type BalcaoOffer = {
  id: number; status: "open" | "awaiting_payment" | "matched" | "completed" | "cancelled" | "expired";
  programa: string; programa_nome: string; milhas: number; cpfs: number;
  milheiro_centavos: number; total_centavos: number; urgente: boolean; intermediada: boolean; observacao: string | null;
  criada_em: string; valida_ate: string; atualizada_em: string | null; sua_oferta: boolean;
  comprador: BalcaoBuyer; link_bot: string | null;
};
export type BalcaoProposal = {
  id: number; oferta_id: number; valor_centavos: number; total_centavos: number | null; contraproposta: boolean;
  status: "pending" | "chosen" | "rejected"; via: string | null; criada_em: string; atualizada_em: string | null;
};
export type BalcaoLinkInfo = { id: number; criado_em: string; referencia: string | null };

type Opts = { token?: string; body?: unknown; retry?: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  const url = `${balcaoApiUrl()}/api/parceiro/v1${path}`;
  const headers: Record<string, string> = { "x-partner-secret": process.env.BALCAO_API_SECRET?.trim() ?? "" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const where = path.split("?")[0]; // para o log: sem a query (filtros e cursor)
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (opts.retry && attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
      log("warn", "balcao.unreachable", { method, path: where });
      throw new BalcaoApiError("O Balcão não respondeu: tente de novo em instantes", 503, "sem_resposta");
    }
    if (res.status >= 500 && opts.retry && attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
    break;
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as ({ erro?: { codigo?: string; mensagem?: string } } & T) | null;
  if (!res.ok) {
    const code = body?.erro?.codigo ?? "erro";
    log(res.status >= 500 ? "error" : "warn", "balcao.api_error", { method, path: where, status: res.status, code });
    const wait = Number(res.headers.get("retry-after"));
    throw new BalcaoApiError(body?.erro?.mensagem ?? `O Balcão respondeu ${res.status}`, res.status >= 500 ? 502 : res.status, code, Number.isFinite(wait) && wait > 0 ? wait : null);
  }
  if (!body || typeof body !== "object") throw new BalcaoApiError("O Balcão respondeu num formato inesperado", 502, "resposta_invalida");
  return body;
}

const qs = (p: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};

export const balcaoApi = {
  createLink: (codigo: string, referencia: string) =>
    request<{ token: string; vinculo: BalcaoLinkInfo; membro: BalcaoMember }>("POST", "/vinculos", { body: { codigo, referencia } }),
  deleteLink: (token: string) => request<void>("DELETE", "/vinculo", { token }),
  me: (token: string) => request<{ vinculo: BalcaoLinkInfo; membro: BalcaoMember }>("GET", "/eu", { token, retry: true }),
  offers: (token: string, p: { programa?: string | null; pagina?: number | null } = {}) =>
    request<{ ofertas: BalcaoOffer[]; pagina: number; mais: boolean }>("GET", `/ofertas${qs(p)}`, { token, retry: true }),
  offer: (token: string, id: number) =>
    request<{ oferta: BalcaoOffer; minha_proposta: BalcaoProposal | null }>("GET", `/ofertas/${id}`, { token, retry: true }),
  propose: (token: string, id: number, valorCentavos: number) =>
    request<{ proposta: BalcaoProposal; mudou: boolean }>("PUT", `/ofertas/${id}/proposta`, { token, body: { valor_centavos: valorCentavos }, retry: true }),
  proposals: (token: string, status?: string | null) =>
    request<{ propostas: (BalcaoProposal & { oferta: BalcaoOffer })[] }>("GET", `/propostas${qs({ status })}`, { token, retry: true }),
  changes: (token: string, desde?: string | null) =>
    request<{ ofertas: BalcaoOffer[]; propostas: BalcaoProposal[]; cursor: string; mais: boolean }>("GET", `/mudancas${qs({ desde })}`, { token, retry: true }),
};

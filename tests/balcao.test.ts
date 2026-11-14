// Balcão MilhasX: vínculo, ofertas com a análise de emissão, proposta escolhida que vira negociação no CRM Milhas, sincronização
// (escolhido / recusado / expirado) e as falhas do Balcão (fora do ar, erro 500, limite, vínculo desfeito). O Balcão é
// um falso em memória no lugar do fetch: nada sai para a rede.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as balcao from "@/app/api/balcao/route";
import * as offers from "@/app/api/balcao/offers/route";
import * as proposal from "@/app/api/balcao/offers/[id]/proposal/route";
import * as proposals from "@/app/api/balcao/proposals/route";
import * as sync from "@/app/api/balcao/sync/route";
import * as buyRules from "@/app/api/balcao/buy/route";
import * as myOffers from "@/app/api/balcao/my-offers/route";
import * as myOffer from "@/app/api/balcao/my-offers/[id]/route";
import * as choose from "@/app/api/balcao/my-offers/[id]/choose/route";
import * as dealsRoute from "@/app/api/balcao/deals/route";
import * as dealRoute from "@/app/api/balcao/deals/[id]/route";
import * as dealMsg from "@/app/api/balcao/deals/[id]/messages/route";
import * as dealFiles from "@/app/api/balcao/deals/[id]/files/route";
import * as dealFile from "@/app/api/balcao/deals/[id]/messages/[mid]/file/route";
import * as dealAct from "@/app/api/balcao/deals/[id]/actions/[action]/route";
import * as dealRate from "@/app/api/balcao/deals/[id]/rating/route";
import * as dealReport from "@/app/api/balcao/deals/[id]/report/route";
import * as dealPix from "@/app/api/balcao/deals/[id]/pix/route";
import * as dealPixProof from "@/app/api/balcao/deals/[id]/pix/proof/route";
import * as members from "@/app/api/team/members/route";
import * as inviteRoute from "@/app/api/team/members/[id]/invite/route";
import * as acceptRoute from "@/app/api/auth/invite/[token]/route";
import { prisma } from "@/server/db";
import type { BalcaoOffer, BalcaoProposal } from "@/server/balcao-api";
import { BalcaoWatcher, type BalcaoEvent } from "@/server/realtime/balcao-watch";

process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");
const SECRET = "segredo-de-servico";
const BASE = "http://balcao-bot:8080";

const SELLER_REP = { perfil: "milheiro", verificado: true, negociacoes: 12, intermediacoes: 3, nota: 4.9, avaliacoes: 10, membro_desde: null };
type Member = { nome: string; usuario: string; perfil: string; pode_ver_ofertas: boolean; pode_vender: boolean; plano_vence_em: null };

/** Balcão falso, com as mesmas regras e respostas da API de parceiro de lá (bot/partner_api.py). */
function fakeBalcao() {
  let seq = 0;
  const s = {
    codes: new Set(["ABCDEF23", "GHJKLM45"]),
    tokens: new Map<string, Member>(),
    member: { nome: "Rafa Milheiro", usuario: "rafa", perfil: "milheiro", pode_ver_ofertas: true, pode_vender: true, plano_vence_em: null } as Member,
    offers: new Map<number, BalcaoOffer & { v: number }>(),
    props: new Map<number, BalcaoProposal & { v: number; received?: boolean }>(),
    calls: [] as { method: string; path: string; secret: string | null; auth: string | null; body: any }[],
    down: 0, // próximas N chamadas sem resposta (rede)
    fail500: 0, // próximas N chamadas com erro 500
    limited: false,
    mine: new Set<number>(), // ofertas abertas por este membro (quem compra)
    msgsSeen: 0,
    deals: new Map<number, { id: number; papel: "comprador" | "vendedor"; status: string; emitida_em: string | null; rated: number | null; v: number; pix?: number; inter?: boolean }>(),
    pixPaid: false, proofs: [] as string[],
    msgs: [] as Record<string, any>[],
    files: new Map<number, { data: Buffer; mime: string; name: string }>(),
    chosenCents: new Map<number, number>(),
  };
  const offer = (id: number, o: Partial<BalcaoOffer> = {}) => {
    s.offers.set(id, {
      id, status: "open", programa: "latam", programa_nome: "Latam Pass", milhas: 50_000, cpfs: 1, milheiro_centavos: 2500, total_centavos: 125_000,
      urgente: false, intermediada: true, observacao: null, criada_em: "2026-11-13T10:00:00Z", valida_ate: "2026-11-14T10:00:00Z", atualizada_em: null,
      sua_oferta: false, comprador: { perfil: "agente", verificado: true, negociacoes: 3, intermediacoes: 1, nota: 4.8, avaliacoes: 3, membro_desde: null },
      link_bot: `https://t.me/BalcaoBot?start=offer_${id}`, ...o, v: ++seq,
    });
  };
  const set = (id: number, status: BalcaoOffer["status"]) => Object.assign(s.offers.get(id)!, { status, v: ++seq });
  const setProp = (offerId: number, status: BalcaoProposal["status"]) => {
    const p = [...s.props.values()].find((x) => x.oferta_id === offerId)!;
    Object.assign(p, { status, v: ++seq });
  };
  const res = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const err = (status: number, codigo: string, mensagem: string, headers?: Record<string, string>) => res(status, { erro: { codigo, mensagem } }, headers);
  // como lá: cada mudança tem a sua hora (atualizada_em)
  const clean = ({ v, received: _r, ...x }: { v: number; received?: boolean } & Record<string, unknown>) => ({ ...x, atualizada_em: `2026-11-13T12:00:00.${String(v).padStart(3, "0")}Z` });

  const fetch = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const h = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    s.calls.push({ method: init.method ?? "GET", path: u.pathname + u.search, secret: h.get("x-partner-secret"), auth: h.get("authorization"), body });
    if (s.down > 0) { s.down--; throw new TypeError("fetch failed"); }
    if (s.fail500 > 0) { s.fail500--; return err(500, "erro_interno", "Erro interno no Balcão"); }
    if (u.origin !== BASE || !u.pathname.startsWith("/api/parceiro/v1/")) return err(404, "nao_encontrado", "Não encontrado.");
    if (h.get("x-partner-secret") !== SECRET) return err(401, "segredo_invalido", "Segredo de serviço ausente ou errado.");
    if (s.limited) return err(429, "limite", "Muitas chamadas: espere um pouco.", { "retry-after": "17" });
    const path = u.pathname.slice("/api/parceiro/v1".length);
    const method = init.method ?? "GET";
    if (method === "POST" && path === "/vinculos") {
      const code = String(body?.codigo ?? "");
      if (!s.codes.delete(code)) return err(400, "codigo_invalido", "Código inválido, vencido ou já usado: gere outro no bot com /milhasx.");
      const token = `tok-${randomBytes(6).toString("hex")}`;
      s.tokens.set(token, s.member);
      return res(201, { token, vinculo: { id: s.tokens.size, criado_em: "2026-11-13T10:00:00Z", referencia: body.referencia }, membro: s.member });
    }
    const token = (h.get("authorization") ?? "").replace(/^Bearer /, "");
    const m = s.tokens.get(token);
    if (!m) return err(401, "vinculo_invalido", "Vínculo inexistente ou desfeito: vincule de novo pelo bot.");
    if (method === "DELETE" && path === "/vinculo") { s.tokens.delete(token); return res(204); }
    if (method === "GET" && path === "/eu") return res(200, { vinculo: { id: 1, criado_em: "", referencia: null }, membro: m });
    if (path === "/propostas") {
      const st = u.searchParams.get("status");
      return res(200, { propostas: [...s.props.values()].filter((p) => !st || p.status === st).map((p) => ({ ...clean(p), oferta: clean(s.offers.get(p.oferta_id)!) })) });
    }
    if (!m.pode_ver_ofertas) return err(403, "sem_plano", "Seu plano no Balcão não está ativo: renove no bot para ver as ofertas.");
    if (method === "GET" && path === "/ofertas") {
      const prog = u.searchParams.get("programa");
      return res(200, { ofertas: [...s.offers.values()].filter((o) => o.status === "open" && (!prog || o.programa === prog)).map(clean), pagina: 1, mais: false });
    }
    if (method === "GET" && path === "/mudancas") {
      const since = Number(u.searchParams.get("desde") ?? -1);
      const pick = <T extends { v: number }>(xs: Iterable<T>) => (since < 0 ? [] : [...xs].filter((x) => x.v > since).map(clean));
      return res(200, {
        ofertas: pick(s.offers.values()), propostas: pick([...s.props.values()].filter((p) => !p.received)),
        propostas_recebidas: pick([...s.props.values()].filter((p) => p.received)).map((p) => ({ ...p, vendedor: SELLER_REP })),
        negociacoes: since < 0 ? [] : [...s.deals.values()].filter((d) => d.v > since).map(dealJson),
        mensagens: since < 0 ? [] : s.msgs.filter((m) => s.deals.get(m.negociacao_id)!.v > since && m.id > (s.msgsSeen ?? 0)),
        cursor: String(seq), mais: false,
      });
    }
    // a negociação (as regras de lá: só o vendedor emite, só o comprador conclui, conversa só em andamento)
    const dealM = path.match(/^\/negociacoes(?:\/(\d+))?(?:\/(mensagens|emitida|concluida|cancelar-emissao|cancelar|avaliacao|reclamacao|pix\/verificar|pix\/comprovante))?(?:\/(\d+)\/arquivo)?$/);
    if (dealM) {
      if (!dealM[1]) return res(200, { negociacoes: [...s.deals.values()].map(dealJson) });
      const d = s.deals.get(Number(dealM[1]));
      if (!d) return err(404, "negociacao_nao_encontrada", "Negociação não encontrada.");
      const what = dealM[2];
      if (!what && method === "GET") return res(200, { negociacao: dealJson(d), mensagens: s.msgs.filter((x) => x.negociacao_id === d.id) });
      if (what === "mensagens" && dealM[3]) {
        const f = s.files.get(Number(dealM[3]));
        return f ? new Response(new Uint8Array(f.data), { status: 200, headers: { "content-type": f.mime, "content-disposition": `inline; filename="${f.name}"` } }) : err(404, "arquivo_nao_encontrado", "Arquivo não encontrado.");
      }
      if (what === "mensagens") {
        if (d.status !== "matched") return err(409, "conversa_fechada", "A conversa só funciona com a negociação em andamento.");
        const isForm = init.body instanceof FormData;
        const texto = isForm ? ((init.body as FormData).get("texto") as string | null) : body?.texto;
        const arq = isForm ? ((init.body as FormData).get("arquivo") as File | null) : null;
        const id = s.msgs.length + 1;
        const m = { id, negociacao_id: d.id, minha: true, via: "milhasx", texto: texto ?? null, entregue: true, criada_em: "2026-11-14T12:00:00Z",
          arquivo: arq ? { tipo: arq.type === "application/pdf" ? "document" : "photo", nome: arq.name, mime: arq.type, tamanho: arq.size } : null };
        if (arq) s.files.set(id, { data: Buffer.from(await arq.arrayBuffer()), mime: arq.type, name: arq.name });
        s.msgs.push(m);
        d.v = ++seq;
        return res(201, { mensagem: m });
      }
      if (what === "emitida") { if (d.papel !== "vendedor") return err(403, "so_vendedor", "Só o vendedor pode marcar a emissão."); d.emitida_em = "2026-11-14T12:00:00Z"; }
      if (what === "concluida") { if (d.papel !== "comprador") return err(403, "so_comprador", "Só o comprador pode concluir a negociação."); d.status = "completed"; }
      if (what === "cancelar") { if (d.emitida_em) return err(409, "ja_emitida", "A passagem já foi emitida: não dá mais para desistir."); d.status = "cancelled"; }
      if (what === "avaliacao") { if (d.status !== "completed") return err(409, "etapa_invalida", "Essa ação não está disponível nesta etapa da negociação."); d.rated = body.estrelas; }
      if (what === "reclamacao") return res(201, { reclamacao: { id: 7, criada_em: "2026-11-14T12:00:00Z" } });
      if (what?.startsWith("pix/") || what === "cancelar-emissao") {
        if (d.papel !== "comprador") return err(403, "so_comprador", "Só quem compra paga o PIX da intermediação.");
        if (what === "cancelar-emissao") {
          if (!d.inter || !d.emitida_em) return err(403, "so_comprador", "Esse cancelamento é só para o comprador, depois da emissão, na intermediação.");
          d.status = "cancelled";
        } else {
          if (d.status !== "awaiting_payment") return err(409, "etapa_invalida", "Essa ação não está disponível nesta etapa da negociação.");
          if (what === "pix/comprovante") {
            const arq = init.body instanceof FormData ? (init.body.get("arquivo") as File | null) : null;
            if (!arq) return err(400, "corpo_invalido", "Falta o arquivo do comprovante.");
            s.proofs.push(arq.name);
          } else {
            const resultado = s.pixPaid ? "pago" : "pendente";
            if (s.pixPaid) d.status = "matched";
            d.v = ++seq;
            return res(200, { resultado, negociacao: dealJson(d) });
          }
        }
      }
      d.v = ++seq;
      return res(200, { negociacao: dealJson(d) });
    }
    // quem compra (as regras de lá: limite de 5 abertas, Viajante sempre com intermediação)
    const myJson = (o: BalcaoOffer & { v: number }) => ({
      ...clean(o), sua_oferta: true,
      propostas_pendentes: [...s.props.values()].filter((p) => p.oferta_id === o.id && p.received && p.status === "pending").length,
      negociacao: o.status === "open" ? null : { milheiro_centavos: s.chosenCents.get(o.id) ?? o.milheiro_centavos, total_centavos: 0, taxa_centavos: o.intermediada ? 1000 : 0, voce_paga_centavos: 0, escolhida_em: null, pago_em: null, emitida_em: null, concluida_em: null },
    });
    if (method === "GET" && path === "/compra") {
      return res(200, { regras: { pode_comprar: true, ofertas_abertas: s.mine.size, limite_ofertas: 5, intermediacao_obrigatoria: m.perfil === "viajante", taxa_milheiro_centavos: 25, taxa_paga_por: "comprador", repasse_dias: 3, validade_horas: 24, programas: [{ chave: "latam", nome: "Latam Pass" }] }, sugestao_centavos: u.searchParams.get("programa") ? 2100 : null });
    }
    if (method === "POST" && path === "/minhas-ofertas") {
      const open = [...s.mine].filter((id) => s.offers.get(id)!.status === "open").length;
      if (open >= 5) return err(409, "limite_ofertas", "Você já tem 5 ofertas abertas. Cancele alguma antes de abrir outra.");
      if (body.milhas < 1000) return err(400, "milhas_invalidas", "Quantidade de milhas inválida: de 1.000 a 5.000.000.");
      const id = 100 + s.mine.size;
      offer(id, { programa: body.programa, milhas: body.milhas, cpfs: body.cpfs, milheiro_centavos: body.milheiro_centavos, urgente: body.urgente, intermediada: m.perfil === "viajante" || body.intermediada, observacao: body.observacao ?? null, sua_oferta: true });
      s.mine.add(id);
      return res(201, { oferta: myJson(s.offers.get(id)!), alertados: 2 });
    }
    if (method === "GET" && path === "/minhas-ofertas") {
      const all = u.searchParams.get("status") === "todas";
      return res(200, { ofertas: [...s.mine].map((id) => s.offers.get(id)!).filter((o) => all || o.status === "open").map(myJson) });
    }
    const own = path.match(/^\/minhas-ofertas\/(\d+)(\/escolher)?$/);
    if (own) {
      const o = s.mine.has(Number(own[1])) ? s.offers.get(Number(own[1])) : undefined;
      if (!o) return err(404, "oferta_nao_encontrada", "Oferta não encontrada.");
      if (method === "GET") return res(200, { oferta: myJson(o), propostas: [...s.props.values()].filter((p) => p.oferta_id === o.id && p.received && p.status === "pending").map((p) => ({ ...clean(p), vendedor: SELLER_REP })) });
      if (o.status !== "open") return err(409, "oferta_indisponivel", "Essa oferta não está mais aberta.");
      if (method === "DELETE") { set(o.id, "cancelled"); return res(200, { oferta: myJson(o) }); }
      const p = s.props.get(body?.proposta_id);
      if (!p || p.oferta_id !== o.id) return err(404, "proposta_nao_encontrada", "Proposta não encontrada.");
      Object.assign(p, { status: "chosen", v: ++seq });
      s.chosenCents.set(o.id, p.valor_centavos);
      set(o.id, o.intermediada ? "awaiting_payment" : "matched");
      return res(200, { oferta: myJson(o) });
    }
    const one = path.match(/^\/ofertas\/(\d+)(\/proposta)?$/);
    const o = one ? s.offers.get(Number(one[1])) : undefined;
    if (!one || !o) return err(404, "oferta_nao_encontrada", "Oferta não encontrada.");
    const mine = [...s.props.values()].find((p) => p.oferta_id === o.id);
    if (method === "GET" && !one[2]) return res(200, { oferta: clean(o), minha_proposta: mine ? clean(mine) : null });
    if (method === "PUT" && one[2]) {
      if (!m.pode_vender) return err(403, "nao_pode_vender", "Você precisa do Módulo Milheiro para vender.");
      if (o.status !== "open") return err(409, "oferta_indisponivel", "Essa oferta não está mais disponível.");
      const cents = body?.valor_centavos;
      if (mine && mine.status !== "pending") return err(409, "proposta_encerrada", "Sua proposta para essa oferta já foi encerrada.");
      if (mine && mine.valor_centavos === cents) return res(200, { proposta: clean(mine), mudou: false });
      const p = mine ?? { id: s.props.size + 1, oferta_id: o.id, criada_em: "2026-11-13T10:00:00Z", via: "milhasx", status: "pending" as const, v: 0, atualizada_em: null, total_centavos: null, contraproposta: false, valor_centavos: 0 };
      Object.assign(p, { valor_centavos: cents, contraproposta: cents !== o.milheiro_centavos, v: ++seq });
      s.props.set(p.id, p);
      return res(200, { proposta: clean(p), mudou: true });
    }
    return err(405, "metodo", "Método não permitido");
  };
  const dealJson = (d: { id: number; papel: string; status: string; emitida_em: string | null; rated: number | null; v: number; pix?: number; inter?: boolean }) => ({
    id: d.id, papel: d.papel, status: d.status, programa: "latam", programa_nome: "Latam Pass", milhas: 50_000, cpfs: 1, intermediada: !!d.inter,
    observacao: null, milheiro_centavos: 2000, total_centavos: 100_000, taxa_centavos: 0, comprador_paga_centavos: 100_000,
    escolhida_em: "2026-11-14T10:00:00Z", paga_em: null, emitida_em: d.emitida_em, concluida_em: d.status === "completed" ? "2026-11-14T13:00:00Z" : null,
    atualizada_em: `2026-11-14T12:00:00.${String(d.v).padStart(3, "0")}Z`, cancelada_por: d.status === "cancelled" ? "voce" : null,
    outra_parte: { ...SELLER_REP, nome: "Rafa", usuario: "rafa" },
    acoes: { conversar: d.status === "matched", emitida: d.papel === "vendedor" && d.status === "matched" && !d.emitida_em, concluida: d.papel === "comprador" && d.status === "matched", cancelar: d.status === "matched" && !d.emitida_em, reclamar: true, avaliar: d.status === "completed" && d.rated == null,
      cancelar_emissao: d.papel === "comprador" && !!d.inter && d.status === "matched" && !!d.emitida_em, pagar: d.papel === "comprador" && d.status === "awaiting_payment" },
    minha_avaliacao: d.rated ? { estrelas: d.rated, comentario: null } : null, link_bot: "https://t.me/BalcaoBot",
    pix: d.papel === "comprador" && d.status === "awaiting_payment" && d.pix
      ? { id: d.pix, valor_centavos: 101_000, automatico: true, copia_e_cola: `000201PIX${d.pix}`, expira_em: "2026-11-14T13:00:00Z", vencido: false, chave_pix: null, favorecido: null, criado_em: null } : null,
    cancelamento_emissao: d.papel === "comprador" && d.inter && d.status === "matched" && d.emitida_em
      ? { pago_centavos: 101_000, taxa_servico_centavos: 5000, taxa_intermediacao_centavos: 1000, estorno_centavos: 95_000, prazo_ate: "2026-11-15T12:00:00Z" } : null,
  });
  /** Uma negociação em andamento em que este membro é comprador ou vendedor. */
  const deal = (id: number, papel: "comprador" | "vendedor") => { s.deals.set(id, { id, papel, status: "matched", emitida_em: null, rated: null, v: ++seq }); };
  /** Uma negociação intermediada esperando o PIX do comprador (este membro). */
  const pixDeal = (id: number) => { s.deals.set(id, { id, papel: "comprador", status: "awaiting_payment", emitida_em: null, rated: null, v: ++seq, pix: 1, inter: true }); };
  /** A outra parte responde pelo bot. */
  const reply = (dealId: number, texto: string) => {
    s.msgs.push({ id: s.msgs.length + 1, negociacao_id: dealId, minha: false, via: "bot", texto, entregue: true, criada_em: "2026-11-14T12:01:00Z", arquivo: null });
    s.deals.get(dealId)!.v = ++seq;
  };
  /** Um milheiro de lá manda proposta numa oferta deste membro. */
  const receive = (offerId: number, cents: number) => {
    const id = s.props.size + 1;
    s.props.set(id, { id, oferta_id: offerId, valor_centavos: cents, total_centavos: null, contraproposta: true, status: "pending", via: null, criada_em: "", atualizada_em: null, received: true, v: ++seq });
    return id;
  };
  return { s, fetch, offer, set, setProp, receive, deal, pixDeal, reply };
}

let c: Client;
let userId: string;
let b: ReturnType<typeof fakeBalcao>;
const env = { ...process.env };

async function enable() {
  process.env.BALCAO_API_URL = `${BASE}/`;
  process.env.BALCAO_API_SECRET = SECRET;
}
const link = () => c.call(balcao.POST, "POST", "/api/balcao", { code: "abcd-ef23" });

beforeEach(async () => {
  await resetDb();
  b = fakeBalcao();
  vi.stubGlobal("fetch", vi.fn(b.fetch));
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("Balcão MilhasX", () => {
  it("desligado sem BALCAO_API_URL/BALCAO_API_SECRET: a tela avisa e nada vai para o Balcão", async () => {
    delete process.env.BALCAO_API_URL;
    delete process.env.BALCAO_API_SECRET;
    expect((await c.call(balcao.GET, "GET", "/api/balcao")).data.item).toMatchObject({ enabled: false, linked: false });
    expect((await link()).status).toBe(503);
    expect(b.s.calls).toHaveLength(0);
  });

  it("vincula com o código do bot, guarda o token criptografado e mostra o membro", async () => {
    await enable();
    expect((await c.call(balcao.POST, "POST", "/api/balcao", { code: "abc" })).status).toBe(400); // curto: nem chama o Balcão
    expect(b.s.calls).toHaveLength(0);
    const bad = await c.call(balcao.POST, "POST", "/api/balcao", { code: "ZZZZ-ZZZZ" });
    expect(bad.status).toBe(400);
    expect(bad.data.erro).toMatch(/gere outro no bot/);
    const r = await link();
    expect(r.status).toBe(201);
    expect(r.data.item).toMatchObject({ enabled: true, linked: true, member: { name: "Rafa Milheiro", role: "milheiro", canSell: true } });
    const call = b.s.calls.findLast((x) => x.path.endsWith("/vinculos"))!;
    expect(call).toMatchObject({ method: "POST", secret: SECRET, body: { codigo: "ABCDEF23", referencia: userId } });
    const row = await prisma.balcaoLink.findUniqueOrThrow({ where: { userId } });
    const token = [...b.s.tokens.keys()][0]!;
    expect(row.tokenEnc).not.toContain(token);
    expect(row.cursor).not.toBeNull(); // já começa com o cursor das mudanças
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(token);
    // um código novo substitui o vínculo: o anterior é desfeito no Balcão
    expect((await c.call(balcao.POST, "POST", "/api/balcao", { code: "GHJKLM45" })).status).toBe(201);
    expect(b.s.tokens.has(token)).toBe(false);
    expect(await prisma.balcaoLink.count()).toBe(1);
  });

  it("lista as ofertas com a conta que emitiria e o lucro; a proposta só vira negociação no CRM Milhas quando o comprador escolhe", async () => {
    await enable();
    const p = await seedPrograms();
    const holder = (await c.call(holders.POST, "POST", "/api/holders", { name: "Ana" })).data.item.id;
    const acc = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: holder, programId: p.latam.id })).data.item.id;
    await prisma.account.update({ where: { id: acc }, data: { balance: 200_000, costCents: 3_600_00 } }); // R$ 18,00 o milheiro
    b.offer(1);
    b.offer(2, { programa: "smiles", programa_nome: "Smiles" });
    await link();

    const list = await c.call(offers.GET, "GET", "/api/balcao/offers?programa=latam");
    expect(list.status).toBe(200);
    expect(list.data.item.offers).toHaveLength(1);
    const o = list.data.item.offers[0];
    expect(o.analysis).toMatchObject({ accountId: acc, covers: true, profitCents: 50_000 * (2500 - 1800) / 1000 });
    expect(o.myProposal).toBeNull();
    expect(o.deal).toBeNull();
    expect(b.s.calls.find((x) => x.path.startsWith("/api/parceiro/v1/ofertas?"))!.path).toContain("programa=latam");

    // valores fora da faixa nem chegam ao Balcão
    expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 50 }, { id: "1" })).status).toBe(400);
    expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2600 }, { id: "abc" })).status).toBe(404);

    // a proposta vai ao Balcão, mas não entra no CRM Milhas enquanto o comprador não escolher
    const r = await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2600 }, { id: "1" });
    expect(r.status).toBe(200);
    expect(r.data.item).toMatchObject({ changed: true, proposal: { status: "pending", contraproposta: true }, deal: null });
    expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2600 }, { id: "1" })).data.item.changed).toBe(false);
    await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2500 }, { id: "1" });
    expect(await prisma.milesDeal.count({ where: { userId } })).toBe(0);
    const listed = (await c.call(offers.GET, "GET", "/api/balcao/offers")).data.item.offers.find((x: { id: number }) => x.id === 1);
    expect(listed.myProposal.valor_centavos).toBe(2500);
    expect(listed.deal).toBeNull();

    // escolhida: entra no CRM Milhas em "Aguardando", com o valor da proposta e a conta que emitiria (uma vez só)
    b.setProp(1, "chosen"); b.set(1, "matched");
    expect((await c.call(sync.POST, "POST", "/api/balcao/sync")).data.item.moved).toBe(1);
    const deal = await prisma.milesDeal.findFirstOrThrow({ where: { userId } });
    expect(deal).toMatchObject({ buyerType: "BALCAO", customerName: "Balcão MilhasX", sourceRef: "balcao:1", stage: "AWAITING", points: 50_000, saleCpmCents: 2500, passengers: 1, accountId: acc });
    expect(deal.notes).toContain("start=offer_1");
    expect(deal.notes).toContain("escolheu a minha proposta");
    expect((await c.call(sync.POST, "POST", "/api/balcao/sync")).data.item.moved).toBe(0);
    expect(await prisma.milesDeal.count({ where: { userId } })).toBe(1);
    expect((await c.call(proposals.GET, "GET", "/api/balcao/proposals")).data.items[0].deal.id).toBe(deal.id);
  });

  it("sincroniza: só a proposta escolhida entra no CRM Milhas, em Aguardando; recusada e expirada não; repetir não muda nada", async () => {
    await enable();
    b.offer(1); b.offer(2); b.offer(3);
    await link();
    for (const id of ["1", "2", "3"]) expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2500 }, { id })).status).toBe(200);
    b.setProp(1, "chosen"); b.set(1, "matched");
    b.setProp(2, "rejected"); b.set(2, "matched");
    b.set(3, "expired");
    const r = await c.call(sync.POST, "POST", "/api/balcao/sync");
    expect(r.status).toBe(200);
    expect(r.data.item.moved).toBe(1);
    // só a escolhida entra no CRM Milhas; recusada e expirada nem chegam a ele
    const by = Object.fromEntries((await prisma.milesDeal.findMany({ where: { userId } })).map((d) => [d.sourceRef, d]));
    expect(Object.keys(by)).toEqual(["balcao:1"]);
    expect(by["balcao:1"]).toMatchObject({ stage: "AWAITING", archivedAt: null });
    expect((await c.call(sync.POST, "POST", "/api/balcao/sync")).data.item.moved).toBe(0);
    expect((await prisma.balcaoLink.findUniqueOrThrow({ where: { userId } })).syncedAt).not.toBeNull();
  });

  it("falhas do Balcão: fora do ar, erro 500 com nova tentativa, limite e segredo errado", async () => {
    await enable();
    b.offer(1);
    await link();
    b.s.down = 99; // fora do ar: a tentativa e a repetição falham
    const down = await c.call(offers.GET, "GET", "/api/balcao/offers");
    expect(down.status).toBe(503);
    expect(down.data.erro).toMatch(/não respondeu/);
    b.s.down = 1; // caiu uma vez só: a repetição automática resolve
    expect((await c.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(200);
    b.s.fail500 = 1; // um 500 isolado: a repetição resolve
    expect((await c.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(200);
    b.s.fail500 = 99;
    expect((await c.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(502);
    b.s.fail500 = 0;
    // a proposta é repetida só uma vez (o Balcão não avisa o comprador de novo com o mesmo valor)
    const before = b.s.calls.length;
    b.s.down = 0;
    expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2500 }, { id: "1" })).status).toBe(200);
    expect(b.s.calls.slice(before).filter((x) => x.method === "PUT")).toHaveLength(1);
    b.s.limited = true;
    const lim = await c.call(offers.GET, "GET", "/api/balcao/offers");
    expect(lim.status).toBe(429);
    expect(lim.data.erro).toMatch(/17 segundos/);
    b.s.limited = false;
    process.env.BALCAO_API_SECRET = "outro";
    const sec = await c.call(offers.GET, "GET", "/api/balcao/offers");
    expect(sec.status).toBe(503);
    expect(sec.data.erro).toMatch(/segredo de serviço/);
    expect(await prisma.balcaoLink.count()).toBe(1); // segredo errado não desfaz o vínculo
  });

  it("vínculo desfeito no Balcão some daqui; desvincular daqui desfaz lá", async () => {
    await enable();
    b.offer(1);
    await link();
    b.s.tokens.clear(); // desvinculado pelo bot
    const r = await c.call(offers.GET, "GET", "/api/balcao/offers");
    expect(r.status).toBe(409);
    expect(r.data.erro).toMatch(/\/milhasx/);
    expect(await prisma.balcaoLink.count()).toBe(0);
    expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2500 }, { id: "1" })).data.erro).toMatch(/Vincule/);

    await c.call(balcao.POST, "POST", "/api/balcao", { code: "GHJKLM45" });
    expect(b.s.tokens.size).toBe(1);
    expect((await c.call(balcao.DELETE, "DELETE", "/api/balcao")).data.item.linked).toBe(false);
    expect(b.s.tokens.size).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "balcao.link" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "balcao.unlink" } })).toBe(1);
  });

  it("plano vencido ou sem Módulo Milheiro: vê o que pode, e o Balcão decide a proposta", async () => {
    await enable();
    b.offer(1);
    b.s.member = { ...b.s.member, perfil: "agente", pode_vender: false };
    expect((await link()).data.item.member).toMatchObject({ role: "agente", canSell: false, canView: true });
    expect((await c.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(200);
    const r = await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2500 }, { id: "1" });
    expect(r.status).toBe(403);
    expect(await prisma.milesDeal.count()).toBe(0);
    b.s.member.pode_ver_ofertas = false;
    const st = (await c.call(sync.POST, "POST", "/api/balcao/sync")).data.item.status;
    expect(st.member.canView).toBe(false);
    expect((await c.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(403);
  });

  it("cada conta só usa o próprio vínculo; membro da equipe com 'ver' não vincula nem propõe", async () => {
    await enable();
    b.offer(1);
    await link();
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Beto", email: "beto@x.test", password: "senha-forte-2" });
    expect((await other.call(balcao.GET, "GET", "/api/balcao")).data.item.linked).toBe(false);
    expect((await other.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(409);

    const mid = (await c.call(members.POST, "POST", "/api/team/members", { name: "Bia", email: "bia@x.test" })).data.id as string;
    const inv = await c.call(inviteRoute.POST, "POST", `/api/team/members/${mid}/invite`, { role: "CUSTOM", permissions: ["chat:view"] }, { id: mid });
    const bia = new Client();
    await bia.call(acceptRoute.POST, "POST", "/api/auth/invite/x", { name: "Bia Souza", password: "senha-da-bia-1" }, { token: inv.data.item.link.split("/convite/")[1] });
    expect((await bia.call(offers.GET, "GET", "/api/balcao/offers")).status).toBe(200); // usa o vínculo do dono
    expect((await bia.call(proposal.PUT, "PUT", "/api/balcao/offers/1/proposal", { cpmCents: 2500 }, { id: "1" })).status).toBe(403);
    expect((await bia.call(balcao.DELETE, "DELETE", "/api/balcao")).status).toBe(403);
    expect(await prisma.balcaoLink.count()).toBe(1);
  });
});

describe("Balcão MilhasX em tempo real", () => {
  it("o vigia manda só o que mudou, com a análise; repetido não sai de novo; anda com o CRM e para no vínculo desfeito", async () => {
    await enable();
    b.offer(1);
    await link();
    const sent: { userId: string; ev: BalcaoEvent }[] = [];
    const w = new BalcaoWatcher(async (uid, ev) => { sent.push({ userId: uid, ev }); });
    await w.tick(); // primeira volta: só pega o cursor
    expect(sent).toHaveLength(0);

    b.offer(2, { programa: "smiles", programa_nome: "Smiles" });
    await w.tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.userId).toBe(userId);
    expect(sent[0]!.ev.offers.map((o) => o.id)).toEqual([2]);
    expect(sent[0]!.ev.offers[0]).toHaveProperty("analysis");
    await w.tick(); // nada novo
    expect(sent).toHaveLength(1);

    // o Balcão repete o que já mandou (cursor volta no tempo): não sai de novo
    const calls = b.s.calls.length;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/mudancas")) u.searchParams.set("desde", "1"); // volta até antes da oferta 2
      return b.fetch(u.toString(), init);
    }));
    await w.tick();
    expect(sent).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn(b.fetch));
    expect(b.s.calls.length).toBeGreaterThan(calls);

    // proposta escolhida: a negociação anda na hora, sem a página aberta
    expect((await c.call(proposal.PUT, "PUT", "/x", { cpmCents: 2500 }, { id: "1" })).status).toBe(200);
    await w.tick(); // a própria proposta (pendente)
    b.setProp(1, "chosen"); b.set(1, "matched");
    await w.tick();
    const last = sent.at(-1)!.ev;
    expect(last.moved).toBe(1);
    expect(last.offers.find((o) => o.id === 1)!.status).toBe("matched");
    expect((await prisma.milesDeal.findFirstOrThrow({ where: { userId, sourceRef: "balcao:1" } })).stage).toBe("AWAITING");

    // limite do Balcão: espera o que ele pediu, sem insistir
    b.s.limited = true;
    const before = b.s.calls.length;
    await w.tick();
    await w.tick();
    expect(b.s.calls.length).toBe(before + 1);
    b.s.limited = false;

    // vínculo desfeito no bot: o vigia apaga o vínculo daqui
    b.s.tokens.clear();
    await w.tick(Date.now() + 60_000);
    expect(await prisma.balcaoLink.count({ where: { userId } })).toBe(0);
  });
});

describe("Balcão MilhasX: quem compra", () => {
  const NEW = { programa: "latam", milhas: 85_000, cpfs: 2, milheiro_centavos: 1850, urgente: false, intermediada: false, observacao: "GRU-LIS" };

  it("abre oferta, vê a proposta recebida ao vivo, escolhe o vendedor e cancela; tudo auditado", async () => {
    await enable();
    await link();
    const rules = await c.call(buyRules.GET, "GET", "/api/balcao/buy?programa=latam");
    expect(rules.status).toBe(200);
    expect(rules.data.item).toMatchObject({ regras: { limite_ofertas: 5, intermediacao_obrigatoria: false }, sugestao_centavos: 2100 });

    // validação daqui (antes de ir ao Balcão) e a de lá (repassada)
    expect((await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", { ...NEW, programa: "xpto" })).status).toBe(400);
    expect((await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", { ...NEW, milhas: 500 })).status).toBe(400);

    const created = await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", NEW);
    expect(created.status).toBe(201);
    const oid = created.data.item.offer.id as number;
    expect(created.data.item).toMatchObject({ alerted: 2, offer: { status: "open", milhas: 85_000, sua_oferta: true } });
    expect(b.s.calls.find((x) => x.method === "POST" && x.path === "/api/parceiro/v1/minhas-ofertas")!.body).toMatchObject({ programa: "latam", milheiro_centavos: 1850 });

    // vigia: a proposta recebida sai no evento, com a reputação de quem vende
    const sent: BalcaoEvent[] = [];
    const w = new BalcaoWatcher(async (_u, ev) => { sent.push(ev); });
    await w.tick();
    const pid = b.receive(oid, 1900);
    await w.tick();
    expect(sent.at(-1)!.received.map((p) => p.id)).toEqual([pid]);
    expect(sent.at(-1)!.received[0]!.vendedor).toMatchObject({ nota: 4.9 });

    const view = await c.call(myOffer.GET, "GET", "/x", undefined, { id: String(oid) });
    expect(view.data.item.offer.propostas_pendentes).toBe(1);
    expect(view.data.item.proposals[0]).toMatchObject({ id: pid, valor_centavos: 1900, vendedor: { perfil: "milheiro" } });
    const list = await c.call(myOffers.GET, "GET", "/api/balcao/my-offers");
    expect(list.data.items.map((o: { id: number }) => o.id)).toEqual([oid]);

    const chosen = await c.call(choose.POST, "POST", "/x", { proposalId: pid }, { id: String(oid) });
    expect(chosen.status).toBe(200);
    expect(chosen.data.item).toMatchObject({ status: "matched", negociacao: { milheiro_centavos: 1900 } });
    const again = await c.call(choose.POST, "POST", "/x", { proposalId: pid }, { id: String(oid) });
    expect(again.status).toBe(409);

    const second = (await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", NEW)).data.item.offer.id as number;
    const cancelled = await c.call(myOffer.DELETE, "DELETE", "/x", undefined, { id: String(second) });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.item.status).toBe("cancelled");
    expect((await c.call(myOffer.DELETE, "DELETE", "/x", undefined, { id: String(second) })).status).toBe(409);
    expect((await c.call(myOffer.GET, "GET", "/x", undefined, { id: "999" })).status).toBe(404);

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: "balcao.offer_" } }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["balcao.offer_create", "balcao.offer_choose", "balcao.offer_create", "balcao.offer_cancel"]);
  });

  it("o limite de 5 ofertas abertas é o do Balcão; sem vínculo, nada vai para lá", async () => {
    await enable();
    expect((await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", NEW)).status).toBe(409); // sem vínculo
    await link();
    for (let i = 0; i < 5; i++) expect((await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", NEW)).status).toBe(201);
    const r = await c.call(myOffers.POST, "POST", "/api/balcao/my-offers", NEW);
    expect(r.status).toBe(409);
    expect(r.data.erro).toContain("5 ofertas abertas");
  });
});

describe("Balcão MilhasX: a negociação", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const upload = (id: number, data: Buffer, mime: string, q = "nome=reserva.png") =>
    dealFiles.POST(new Request(`http://localhost:3100/api/balcao/deals/${id}/files?${q}`, {
      method: "POST", body: new Uint8Array(data), headers: { "content-type": mime, cookie: (c as any).cookie ?? "", origin: "http://localhost:3100" },
    }), { params: Promise.resolve({ id: String(id) }) });

  it("conversa (texto e arquivo, nos dois sentidos), etapas, avaliação e reclamação; ao vivo pelo vigia", async () => {
    await enable();
    await link();
    b.deal(500, "comprador");
    b.deal(501, "vendedor");
    const list = await c.call(dealsRoute.GET, "GET", "/api/balcao/deals?todas=1");
    expect(list.data.items.map((d: { id: number }) => d.id)).toEqual([500, 501]);

    const w = new BalcaoWatcher(async (_u, ev) => { sent.push(ev); });
    const sent: BalcaoEvent[] = [];
    await w.tick();

    // texto daqui; resposta pelo bot chega no evento (com a negociação atualizada)
    const t = await c.call(dealMsg.POST, "POST", "/x", { text: "Oi! Voo GRU-LIS dia 10/03." }, { id: "500" });
    expect(t.status).toBe(201);
    expect(t.data.item).toMatchObject({ minha: true, via: "milhasx" });
    expect((await c.call(dealMsg.POST, "POST", "/x", { text: "   " }, { id: "500" })).status).toBe(400);
    b.reply(500, "Manda os dados do passageiro.");
    await w.tick();
    const ev = sent.at(-1)!;
    expect(ev.messages.map((m) => m.texto)).toContain("Manda os dados do passageiro.");
    expect(ev.deals.map((d) => d.id)).toContain(500);
    const detail = await c.call(dealRoute.GET, "GET", "/x", undefined, { id: "500" });
    expect(detail.data.item.messages.map((m: { texto: string }) => m.texto)).toEqual(["Oi! Voo GRU-LIS dia 10/03.", "Manda os dados do passageiro."]);

    // arquivo: o tipo é conferido pelo conteúdo (não pela extensão), e volta pelo MilhasX
    const bad = await upload(500, Buffer.from("MZ executável"), "image/png");
    expect(bad.status).toBe(400);
    expect((await upload(500, PNG, "application/x-msdownload")).status).toBe(400);
    const up = await upload(500, PNG, "image/png", "nome=reserva.png&texto=Segue%20o%20print");
    expect(up.status).toBe(201);
    const fm = (await up.json()).item;
    expect(fm).toMatchObject({ texto: "Segue o print", arquivo: { tipo: "photo", nome: "reserva.png" } });
    const dl = await dealFile.GET(new Request(`http://localhost:3100/x`, { headers: { cookie: (c as any).cookie ?? "" } }), { params: Promise.resolve({ id: "500", mid: String(fm.id) }) });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("image/png");
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await dl.arrayBuffer()).equals(PNG)).toBe(true);

    // etapas: quem pode é o Balcão que decide (o erro de lá volta igual)
    const wrong = await c.call(dealAct.POST, "POST", "/x", undefined, { id: "500", action: "emitida" });
    expect(wrong.status).toBe(403);
    expect(wrong.data.erro).toContain("Só o vendedor");
    expect((await c.call(dealAct.POST, "POST", "/x", undefined, { id: "500", action: "xpto" })).status).toBe(404);
    const issued = await c.call(dealAct.POST, "POST", "/x", undefined, { id: "501", action: "emitida" });
    expect(issued.status).toBe(200);
    expect(issued.data.item.emitida_em).toBeTruthy();
    expect((await c.call(dealAct.POST, "POST", "/x", undefined, { id: "501", action: "cancelar" })).status).toBe(409);
    const done = await c.call(dealAct.POST, "POST", "/x", undefined, { id: "500", action: "concluida" });
    expect(done.data.item).toMatchObject({ status: "completed", acoes: { avaliar: true } });
    expect((await c.call(dealMsg.POST, "POST", "/x", { text: "oi" }, { id: "500" })).status).toBe(409);

    expect((await c.call(dealRate.POST, "POST", "/x", { stars: 6 }, { id: "500" })).status).toBe(400);
    const rated = await c.call(dealRate.POST, "POST", "/x", { stars: 5, comment: "Rápido!" }, { id: "500" });
    expect(rated.data.item.minha_avaliacao).toMatchObject({ estrelas: 5 });
    expect((await c.call(dealReport.POST, "POST", "/x", { text: "curto" }, { id: "501" })).status).toBe(400);
    expect((await c.call(dealReport.POST, "POST", "/x", { text: "O comprador sumiu depois da emissão." }, { id: "501" })).status).toBe(201);
    expect((await c.call(dealRoute.GET, "GET", "/x", undefined, { id: "abc" })).status).toBe(404);

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: "balcao.deal_" } }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["balcao.deal_emitida", "balcao.deal_concluida", "balcao.deal_rate", "balcao.deal_report"]);
  });

  it("PIX da intermediação pelo MilhasX (Já paguei e comprovante) e cancelamento depois da emissão; tudo auditado", async () => {
    await enable();
    await link();
    b.pixDeal(600);
    b.deal(601, "vendedor");

    // o comprador vê o PIX (copia e cola) na negociação
    const d = (await c.call(dealRoute.GET, "GET", "/x", undefined, { id: "600" })).data.item.deal;
    expect(d).toMatchObject({ status: "awaiting_payment", acoes: { pagar: true }, pix: { automatico: true, copia_e_cola: "000201PIX1" } });

    // "Já paguei": ainda não caiu; depois caiu e a negociação libera
    const pend = await c.call(dealPix.POST, "POST", "/x", undefined, { id: "600" });
    expect(pend.status).toBe(200);
    expect(pend.data.item.result).toBe("pendente");
    b.s.pixPaid = true;
    const paid = await c.call(dealPix.POST, "POST", "/x", undefined, { id: "600" });
    expect(paid.data.item).toMatchObject({ result: "pago", deal: { status: "matched", pix: null } });
    expect((await c.call(dealPix.POST, "POST", "/x", undefined, { id: "601" })).status).toBe(403); // vendedor não paga

    // comprovante: o tipo é conferido aqui antes de ir ao Balcão
    b.pixDeal(602);
    const proof = (data: Buffer, mime: string) => dealPixProof.POST(new Request("http://localhost:3100/x?nome=comprovante.png", {
      method: "POST", body: new Uint8Array(data), headers: { "content-type": mime, cookie: (c as any).cookie ?? "", origin: "http://localhost:3100" },
    }), { params: Promise.resolve({ id: "602" }) });
    expect((await proof(Buffer.from("MZ executável"), "image/png")).status).toBe(400);
    expect(b.s.proofs).toEqual([]);
    const ok = await proof(PNG, "image/png");
    expect(ok.status).toBe(200);
    expect(b.s.proofs).toEqual(["comprovante.png"]);

    // cancelar a emissão: só depois de emitida, com o estorno que o Balcão calcula
    expect((await c.call(dealAct.POST, "POST", "/x", undefined, { id: "600", action: "cancelar-emissao" })).status).toBe(403);
    b.s.deals.get(600)!.emitida_em = "2026-11-14T12:00:00Z";
    const q = (await c.call(dealRoute.GET, "GET", "/x", undefined, { id: "600" })).data.item.deal;
    expect(q).toMatchObject({ acoes: { cancelar_emissao: true }, cancelamento_emissao: { estorno_centavos: 95_000 } });
    const cancelled = await c.call(dealAct.POST, "POST", "/x", undefined, { id: "600", action: "cancelar-emissao" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.item.status).toBe("cancelled");

    const actions = (await prisma.auditLog.findMany({ where: { action: { startsWith: "balcao.deal_" } }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["balcao.deal_pix_check", "balcao.deal_pix_check", "balcao.deal_pix_proof", "balcao.deal_cancelar-emissao"]);
  });
});

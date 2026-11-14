// Balcão MilhasX: as ofertas de compra do Balcão (o nosso balcão no Telegram) dentro do MilhasX. A conta se vincula
// a um membro do Balcão com o código que o bot dá (/milhasx); daí em diante dá para ver as ofertas abertas (com a
// conta que emitiria e o lucro, como no Chat Balcões) e mandar proposta. Cada proposta vira uma negociação do CRM
// Milhas (balcão "Balcão MilhasX", sourceRef "balcao:<oferta>"), que anda sozinha conforme o Balcão responde:
// escolhido → "Aguardando"; recusado, expirado ou cancelado → arquivada. O resto (contato, PIX, emissão) continua
// no bot do Balcão.
import type { MilesDealStage } from "@prisma/client";
import { prisma, DomainError, audit, log } from "../db";
import { balcaoApi, balcaoEnabled, BalcaoApiError, type BalcaoMember, type BalcaoNewOffer, type BalcaoOffer, type BalcaoProposal } from "../balcao-api";
import { encrypt, decrypt, credentialsEnabled } from "./accounts";
import { emissionAccounts } from "./capacity";
import { archiveDeal, createDeal, moveDeal } from "./miles-deals";
import { emissionAnalysis, type BalcaoProgram } from "@/domain/balcao-ads";

export const BALCAO_NAME = "Balcão MilhasX"; // o mesmo nome da lista de balcões do CRM Milhas (DEFAULT_BALCOES)
export const balcaoRef = (offerId: number) => `balcao:${offerId}`;
const SYNC_PAGES = 5; // páginas de "mudanças" por sincronização (200 itens cada)

/** Programa do Balcão (chave dele) → programa das contas do MilhasX (o mesmo dos anúncios do Chat Balcões). */
export const BALCAO_PROGRAMS: Record<string, BalcaoProgram> = {
  latam: "LATAM", smiles: "Smiles", azul: "Azul", azul_mundo: "Azul", iberia: "Avios", tap: "TAP",
  aadvantage: "AAdvantage", flyingblue: "Flying Blue",
};

const OPEN: MilesDealStage[] = ["NEW", "NEGOTIATION"]; // etapas que o Balcão ainda pode mudar

function requireEnabled() {
  if (!balcaoEnabled()) throw new DomainError(503, "Balcão MilhasX desativado: defina BALCAO_API_URL e BALCAO_API_SECRET no servidor");
  if (!credentialsEnabled()) throw new DomainError(503, "Balcão MilhasX desativado: defina CREDENTIALS_KEY no servidor");
}

/** Erro do Balcão no formato do app. O vínculo desfeito lá some daqui (a tela volta para "vincular"). */
async function translate(userId: string, e: unknown): Promise<never> {
  if (!(e instanceof BalcaoApiError)) throw e;
  if (e.unlinked) {
    await prisma.balcaoLink.deleteMany({ where: { userId } });
    throw new DomainError(409, "O vínculo com o Balcão foi desfeito (no bot ou no Balcão). Gere um código novo no bot com /milhasx e vincule de novo.");
  }
  if (e.limited) throw new DomainError(429, `Muitas chamadas ao Balcão: espere ${e.retryAfter ?? 60} segundos.`);
  throw new DomainError(e.status === 401 ? 503 : e.status, e.status === 401 ? "O MilhasX não está autorizado no Balcão (segredo de serviço): avise o suporte." : e.message);
}

async function withLink<T>(userId: string, fn: (token: string) => Promise<T>): Promise<T> {
  requireEnabled();
  const row = await prisma.balcaoLink.findUnique({ where: { userId } });
  if (!row) throw new DomainError(409, "Vincule sua conta do Balcão primeiro");
  try {
    return await fn(decrypt(row.tokenEnc));
  } catch (e) {
    return translate(userId, e);
  }
}

const memberData = (m: BalcaoMember) => ({
  memberName: m.nome, memberUsername: m.usuario, memberRole: m.perfil, canView: m.pode_ver_ofertas, canSell: m.pode_vender,
});

/** Situação da tela: desligado no servidor, sem vínculo ou vinculado (com o que o membro pode fazer). Não chama o Balcão. */
export async function balcaoStatus(userId: string) {
  const enabled = balcaoEnabled() && credentialsEnabled();
  const row = enabled ? await prisma.balcaoLink.findUnique({ where: { userId } }) : null;
  return {
    enabled,
    linked: !!row,
    member: row && { name: row.memberName, username: row.memberUsername, role: row.memberRole, canView: row.canView, canSell: row.canSell },
    linkedAt: row?.createdAt.toISOString() ?? null,
    syncedAt: row?.syncedAt?.toISOString() ?? null,
  };
}

/** Vincula com o código do bot. Um vínculo por conta: o novo substitui o anterior (que é desfeito no Balcão). */
export async function linkBalcao(userId: string, actorId: string, rawCode: string) {
  requireEnabled();
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) throw new DomainError(400, "O código tem 8 letras e números (ex.: ABCD-EF23). Gere no bot com /milhasx.");
  const res = await balcaoApi.createLink(code, userId).catch((e) => translate(userId, e));
  const old = await prisma.balcaoLink.findUnique({ where: { userId } });
  if (old) await balcaoApi.deleteLink(decrypt(old.tokenEnc)).catch(() => undefined); // já desfeito lá: tudo bem
  const cursor = res.membro.pode_ver_ofertas ? (await balcaoApi.changes(res.token).catch(() => null))?.cursor ?? null : null;
  const data = { tokenEnc: encrypt(res.token), ...memberData(res.membro), cursor, syncedAt: null };
  const row = await prisma.balcaoLink.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  await audit(prisma, actorId, "balcao.link", "BalcaoLink", row.id, { role: res.membro.perfil });
  return balcaoStatus(userId);
}

export async function unlinkBalcao(userId: string, actorId: string) {
  const row = await prisma.balcaoLink.findUnique({ where: { userId } });
  if (!row) return balcaoStatus(userId);
  if (balcaoEnabled()) await balcaoApi.deleteLink(decrypt(row.tokenEnc)).catch(() => undefined);
  await prisma.balcaoLink.delete({ where: { id: row.id } });
  await audit(prisma, actorId, "balcao.unlink", "BalcaoLink", row.id);
  return balcaoStatus(userId);
}

const dealSelect = { id: true, number: true, stage: true, archivedAt: true, saleId: true, sourceRef: true, notes: true } as const;

/** Ofertas abertas com a análise de emissão (conta mais próxima do limite que cobre, lucro pelo milheiro da oferta),
 *  a minha proposta (se houver) e a negociação do CRM Milhas ligada a ela. */
export async function balcaoOffers(userId: string, opts: { program?: string | null; page?: number | null } = {}) {
  return withLink(userId, async (token) => {
    const [list, mine] = await Promise.all([
      balcaoApi.offers(token, { programa: opts.program, pagina: opts.page }),
      balcaoApi.proposals(token, "pending"),
    ]);
    return { page: list.pagina, more: list.mais, offers: await enrichOffers(userId, list.ofertas, mine.propostas) };
  });
}

/** A oferta como a tela mostra: com a análise de emissão, a minha proposta e a negociação do CRM Milhas. */
export async function enrichOffers(userId: string, offers: BalcaoOffer[], proposals: BalcaoProposal[]) {
  if (!offers.length) return [];
  const accounts = await emissionAccounts(userId);
  const proposalBy = new Map(proposals.map((p) => [p.oferta_id, p]));
  const deals = await prisma.milesDeal.findMany({ where: { userId, sourceRef: { in: offers.map((o) => balcaoRef(o.id)) } }, select: dealSelect });
  const dealBy = new Map(deals.map((d) => [d.sourceRef, d]));
  return offers.map((o) => ({
    ...o,
    analysis: analysisFor(o, proposalBy.get(o.id)?.valor_centavos ?? o.milheiro_centavos, accounts),
    myProposal: proposalBy.get(o.id) ?? null,
    deal: dealView(dealBy.get(balcaoRef(o.id))),
  }));
}

function analysisFor(o: Pick<BalcaoOffer, "programa" | "milhas" | "cpfs">, cpmCents: number, accounts: Awaited<ReturnType<typeof emissionAccounts>>) {
  const program = BALCAO_PROGRAMS[o.programa];
  return program ? emissionAnalysis({ program, miles: o.milhas, cpfs: o.cpfs }, cpmCents, accounts) : null;
}

const dealView = (d: { id: string; number: number; stage: MilesDealStage; archivedAt: Date | null } | undefined) =>
  d ? { id: d.id, number: d.number, stage: d.stage, archived: !!d.archivedAt } : null;

/** Minhas propostas no Balcão (todas as situações), com a oferta e a negociação do CRM Milhas. */
export async function balcaoProposals(userId: string) {
  return withLink(userId, async (token) => {
    const { propostas } = await balcaoApi.proposals(token);
    const deals = await prisma.milesDeal.findMany({ where: { userId, sourceRef: { in: propostas.map((p) => balcaoRef(p.oferta_id)) } }, select: dealSelect });
    const dealBy = new Map(deals.map((d) => [d.sourceRef, d]));
    return propostas.map((p) => ({ ...p, deal: dealView(dealBy.get(balcaoRef(p.oferta_id))) }));
  });
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Manda (ou atualiza) a proposta e cria/atualiza a negociação no CRM Milhas, já em "Negociação". */
export async function proposeBalcao(userId: string, offerId: number, cpmCents: number) {
  return withLink(userId, async (token) => {
    const { oferta } = await balcaoApi.offer(token, offerId);
    const { proposta, mudou } = await balcaoApi.propose(token, offerId, cpmCents);
    const ref = balcaoRef(offerId);
    let deal = await prisma.milesDeal.findFirst({ where: { userId, sourceRef: ref }, select: dealSelect });
    if (!deal) {
      const analysis = analysisFor(oferta, cpmCents, await emissionAccounts(userId));
      const notes = [
        `Oferta #${oferta.id} do ${BALCAO_NAME}: ${oferta.milhas.toLocaleString("pt-BR")} milhas ${oferta.programa_nome}, ${oferta.cpfs} CPF(s); o comprador oferece ${brl(oferta.milheiro_centavos)} o milheiro.`,
        `Minha proposta: ${brl(cpmCents)} o milheiro${proposta.contraproposta ? " (contraproposta)" : ""}.`,
        oferta.link_bot ? `Continuar no bot do Balcão: ${oferta.link_bot}` : null,
      ].filter(Boolean).join("\n");
      const created = await createDeal(userId, {
        buyerType: "BALCAO", customerName: BALCAO_NAME, accountId: analysis?.covers ? analysis.accountId : null,
        points: oferta.milhas, saleCpmCents: cpmCents, passengers: oferta.cpfs, notes, sourceRef: ref,
      });
      await moveDeal(userId, created.id, "NEGOTIATION");
      deal = await prisma.milesDeal.findUniqueOrThrow({ where: { id: created.id }, select: dealSelect });
    } else if (mudou && !deal.saleId) {
      await prisma.milesDeal.update({
        where: { id: deal.id },
        data: { saleCpmCents: cpmCents, archivedAt: null, notes: appendNote(deal.notes, `Proposta atualizada: ${brl(cpmCents)} o milheiro.`) },
      });
    }
    return { proposal: proposta, changed: mudou, deal: dealView(deal) };
  });
}

function appendNote(notes: string | null, line: string) {
  const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return [notes?.trim(), `[${stamp}] ${line}`].filter(Boolean).join("\n");
}

const CLOSED_OFFER: Partial<Record<BalcaoOffer["status"], string>> = {
  expired: "A oferta expirou no Balcão.",
  cancelled: "A oferta foi cancelada no Balcão.",
};

/** Traz o que mudou no Balcão desde a última vez e anda com as negociações do CRM Milhas. Repetir não faz mal: o
 *  Balcão pode devolver algo de novo (o cursor volta alguns segundos) e aqui só se muda o que ainda não mudou. */
export async function syncBalcao(userId: string) {
  return withLink(userId, async (token) => {
    const row = await prisma.balcaoLink.findUniqueOrThrow({ where: { userId } });
    const { membro } = await balcaoApi.me(token);
    let cursor = row.cursor;
    let moved = 0;
    if (membro.pode_ver_ofertas) {
      for (let page = 0; page < SYNC_PAGES; page++) {
        const ch = await balcaoApi.changes(token, cursor);
        if (cursor) moved += await applyChanges(userId, ch.ofertas, ch.propostas);
        cursor = ch.cursor;
        if (!ch.mais) break;
      }
    }
    await prisma.balcaoLink.update({ where: { id: row.id }, data: { ...memberData(membro), cursor, syncedAt: new Date() } });
    if (moved) log("info", "balcao.sync", { moved });
    return { moved, status: await balcaoStatus(userId) };
  });
}

export async function applyChanges(userId: string, offers: BalcaoOffer[], proposals: BalcaoProposal[]) {
  const refs = [...new Set([...offers.map((o) => o.id), ...proposals.map((p) => p.oferta_id)])].map(balcaoRef);
  if (!refs.length) return 0;
  const deals = await prisma.milesDeal.findMany({ where: { userId, sourceRef: { in: refs }, saleId: null }, select: dealSelect });
  const dealBy = new Map(deals.map((d) => [d.sourceRef!, d]));
  let moved = 0;
  for (const p of proposals) {
    const d = dealBy.get(balcaoRef(p.oferta_id));
    if (!d || d.archivedAt || !OPEN.includes(d.stage)) continue;
    if (p.status === "chosen") {
      await prisma.milesDeal.update({ where: { id: d.id }, data: { notes: appendNote(d.notes, "O comprador escolheu a sua proposta: continue a negociação no bot do Balcão.") } });
      await moveDeal(userId, d.id, "AWAITING");
      d.stage = "AWAITING";
      moved++;
    } else if (p.status === "rejected") {
      await closeDeal(userId, d, "O comprador escolheu outra proposta ou a oferta fechou no Balcão.");
      moved++;
    }
  }
  for (const o of offers) {
    const why = CLOSED_OFFER[o.status];
    const d = dealBy.get(balcaoRef(o.id));
    if (!why || !d || d.archivedAt || !OPEN.includes(d.stage)) continue;
    await closeDeal(userId, d, why);
    moved++;
  }
  return moved;
}

async function closeDeal(userId: string, d: { id: string; notes: string | null; archivedAt: Date | null }, why: string) {
  await prisma.milesDeal.update({ where: { id: d.id }, data: { notes: appendNote(d.notes, why) } });
  await archiveDeal(userId, d.id, true);
  d.archivedAt = new Date();
}

// ---------- Quem compra: abrir oferta, ver as propostas recebidas, escolher o vendedor e cancelar ----------
// As regras (limite de 5 abertas, faixas, Viajante sempre com intermediação, PIX e liberação do contato) são as do
// bot do Balcão (buying.py); aqui só se repassa e se registra quem fez o quê.

export async function balcaoBuyRules(userId: string, program?: string | null) {
  return withLink(userId, (token) => balcaoApi.buyRules(token, program));
}

export async function balcaoCreateOffer(userId: string, actorId: string, input: BalcaoNewOffer) {
  return withLink(userId, async (token) => {
    const r = await balcaoApi.createOffer(token, input);
    await audit(prisma, actorId, "balcao.offer_create", "BalcaoOffer", String(r.oferta.id), {
      program: input.programa, miles: input.milhas, cpmCents: input.milheiro_centavos, intermediated: r.oferta.intermediada,
    });
    return { offer: r.oferta, alerted: r.alertados };
  });
}

export async function balcaoMyOffers(userId: string, all = false) {
  return withLink(userId, async (token) => (await balcaoApi.myOffers(token, all ? "todas" : "abertas")).ofertas);
}

export async function balcaoMyOffer(userId: string, offerId: number) {
  return withLink(userId, async (token) => {
    const r = await balcaoApi.myOffer(token, offerId);
    return { offer: r.oferta, proposals: r.propostas };
  });
}

export async function balcaoCancelOffer(userId: string, actorId: string, offerId: number) {
  return withLink(userId, async (token) => {
    const r = await balcaoApi.cancelOffer(token, offerId);
    await audit(prisma, actorId, "balcao.offer_cancel", "BalcaoOffer", String(offerId));
    return r.oferta;
  });
}

export async function balcaoChooseProposal(userId: string, actorId: string, offerId: number, proposalId: number) {
  return withLink(userId, async (token) => {
    const r = await balcaoApi.choose(token, offerId, proposalId);
    await audit(prisma, actorId, "balcao.offer_choose", "BalcaoOffer", String(offerId), { proposalId, status: r.oferta.status });
    return r.oferta;
  });
}

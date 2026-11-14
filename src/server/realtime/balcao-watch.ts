// Balcão MilhasX em tempo real: o servidor do site pergunta ao Balcão "o que mudou?" a cada 2 s por vínculo (a API de
// parceiro não empurra eventos) e manda o que mudou pelo mesmo canal do Chat Balcões (Redis → WebSocket /ws), já com
// a análise de emissão. A tela só aplica: nenhuma chamada ao Balcão por evento, nem por aba aberta. De quebra, as
// negociações do CRM Milhas andam na hora, mesmo com a página fechada.
//
// O Balcão devolve algo repetido (o cursor volta 30 s para não perder transação lenta): cada item é guardado pela
// hora em que mudou e só sai de novo se mudou de novo.
import { prisma, log } from "../db";
import { balcaoApi, balcaoEnabled, BalcaoApiError, type BalcaoOffer, type BalcaoProposal, type BalcaoReceivedProposal } from "../balcao-api";
import { decrypt, credentialsEnabled } from "../services/accounts";
import { applyChanges, enrichOffers } from "../services/balcao";

export type BalcaoEvent = {
  type: "balcao";
  offers: Awaited<ReturnType<typeof enrichOffers>>;
  proposals: BalcaoProposal[];
  /** Propostas novas ou mudadas nas minhas ofertas (quem compra). */
  received: BalcaoReceivedProposal[];
  moved: number;
};
type Publish = (userId: string, ev: BalcaoEvent) => Promise<unknown>;
type LinkState = { cursor: string | null; seen: Map<string, number>; pausedUntil: number; failures: number };

const EVERY_MS = 2000;
const SEEN_TTL_MS = 5 * 60_000; // bem mais que os 30 s que o Balcão repete
const MAX_PAGES = 5;

/** Itens que ainda não saíram (ou mudaram desde então). Marca os novos como vistos. */
export function unseen<T extends { id: number; atualizada_em: string | null }>(kind: string, items: T[], seen: Map<string, number>, now: number): T[] {
  return items.filter((i) => {
    const key = `${kind}:${i.id}:${i.atualizada_em ?? ""}`;
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  });
}

export class BalcaoWatcher {
  private links = new Map<string, LinkState>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private publish: Publish, private everyMs = EVERY_MS) {}

  start() {
    this.stopped = false;
    this.schedule();
    log("info", "balcao.watch_up", { everyMs: this.everyMs });
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick().finally(() => this.schedule()), this.everyMs);
    this.timer.unref?.();
  }

  /** Uma volta por todos os vínculos (em paralelo; cada um tem o seu limite no Balcão). */
  async tick(now = Date.now()) {
    if (!balcaoEnabled() || !credentialsEnabled()) return;
    const rows = await prisma.balcaoLink.findMany({ where: { canView: true }, select: { id: true, userId: true, tokenEnc: true } }).catch(() => []);
    const alive = new Set(rows.map((r) => r.id));
    for (const id of this.links.keys()) if (!alive.has(id)) this.links.delete(id);
    await Promise.all(rows.map((r) => this.poll(r, now)));
  }

  private async poll(row: { id: string; userId: string; tokenEnc: string }, now: number) {
    let st = this.links.get(row.id);
    if (!st) this.links.set(row.id, (st = { cursor: null, seen: new Map(), pausedUntil: 0, failures: 0 }));
    if (st.pausedUntil > now) return;
    try {
      const token = decrypt(row.tokenEnc);
      const offers: BalcaoOffer[] = [];
      const proposals: BalcaoProposal[] = [];
      const received: BalcaoReceivedProposal[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const ch = await balcaoApi.changes(token, st.cursor);
        const first = st.cursor == null;
        st.cursor = ch.cursor;
        if (!first) {
          offers.push(...unseen("o", ch.ofertas, st.seen, now));
          proposals.push(...unseen("p", ch.propostas, st.seen, now));
          received.push(...unseen("r", ch.propostas_recebidas ?? [], st.seen, now));
        }
        if (!ch.mais) break;
      }
      for (const [k, t] of st.seen) if (now - t > SEEN_TTL_MS) st.seen.delete(k);
      st.failures = 0;
      if (!offers.length && !proposals.length && !received.length) return;
      const moved = await applyChanges(row.userId, offers, proposals);
      await this.publish(row.userId, { type: "balcao", offers: await enrichOffers(row.userId, offers, proposals), proposals, received, moved });
    } catch (e) {
      if (e instanceof BalcaoApiError && e.unlinked) {
        await prisma.balcaoLink.deleteMany({ where: { id: row.id } }).catch(() => {});
        this.links.delete(row.id);
        return;
      }
      // limite do Balcão: espera o que ele pediu; fora do ar: espera crescente até 1 min
      st.failures++;
      const wait = e instanceof BalcaoApiError && e.limited ? (e.retryAfter ?? 30) * 1000 : Math.min(60_000, 2000 * 2 ** Math.min(st.failures, 5));
      st.pausedUntil = now + wait;
      if (st.failures === 1 || st.failures % 30 === 0) log("warn", "balcao.watch_fail", { link: row.id, error: e instanceof Error ? e.message : String(e), waitMs: wait });
    }
  }
}

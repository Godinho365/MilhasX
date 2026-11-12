import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Coins, Crown, Wallet } from "lucide-react";
import { requirePageUser, selectedHolderId, holderScopeLabel } from "@/server/session";
import { clubCalendar } from "@/server/services/miles";
import { yearMonths } from "@/domain/club-calendar";
import { PageHeader, Stat } from "@/components/stat";
import { Empty } from "@/components/ui";
import { fmtBRL, fmtDate, fmtPts } from "@/lib/format";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Calendário dos clubes: os planos de cada conta (LATAM Pass, Livelo...) e as cobranças dos 12 meses numa página. */
export default async function ClubCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const nowYear = new Date().getUTCFullYear();
  const year = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : nowYear;
  const holderId = await selectedHolderId(user.id);
  const [cal, scope] = await Promise.all([clubCalendar(user.id, holderId, year), holderScopeLabel(holderId)]);
  const programs = [...new Set(cal.clubs.map((c) => c.program))];
  const prog = sp.programa && programs.includes(sp.programa) ? sp.programa : null;
  const clubs = prog ? cal.clubs.filter((c) => c.program === prog) : cal.clubs;
  const ids = new Set(clubs.map((c) => c.id));
  const events = cal.events.filter((e) => ids.has(e.clubId));
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const months = yearMonths(year, events);
  const link = (p: { ano?: number; programa?: string | null }) => {
    const q = new URLSearchParams();
    const a = p.ano ?? year;
    if (a !== nowYear) q.set("ano", String(a));
    const pr = p.programa === undefined ? prog : p.programa;
    if (pr) q.set("programa", pr);
    const s = q.toString();
    return `/app/milhas/calendario${s ? `?${s}` : ""}`;
  };
  const active = clubs.filter((c) => c.active);
  const yearCents = events.reduce((t, e) => t + e.costCents, 0);
  const yearPts = events.reduce((t, e) => t + e.points, 0);
  const curMonth = cal.today.slice(0, 7);

  return (
    <>
      <PageHeader title="Calendário de clubes" subtitle={`Planos de cada conta e as cobranças do ano, mês a mês · ${scope}`}>
        <div className="flex items-center gap-1">
          <Link href={link({ ano: year - 1 })} className="btn-subtle h-9 w-9 px-0" aria-label="Ano anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-14 text-center text-lg font-semibold tabular-nums">{year}</span>
          <Link href={link({ ano: year + 1 })} className="btn-subtle h-9 w-9 px-0" aria-label="Próximo ano"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </PageHeader>

      {cal.clubs.length === 0 ? (
        <Empty title="Nenhum clube cadastrado" icon={<Crown className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Na página da conta, em Lançamentos Recorrentes, cadastre o clube (tipo Clube) com os pontos, a mensalidade e o dia da cobrança.</p>
          <Link href="/app/programs" className="btn-primary">Ir para as contas</Link>
        </Empty>
      ) : (
        <>
          {programs.length > 1 && (
            <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar por programa">
              <Link href={link({ programa: null })} className={`rounded-full border px-3 py-1 text-sm ${!prog ? "border-accent bg-accent/15 text-white" : "border-line text-muted hover:text-white"}`}>Todos</Link>
              {programs.map((p) => (
                <Link key={p} href={link({ programa: p })} className={`rounded-full border px-3 py-1 text-sm ${prog === p ? "border-accent bg-accent/15 text-white" : "border-line text-muted hover:text-white"}`}>{p}</Link>
              ))}
            </nav>
          )}

          <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <Stat icon={<Crown className="h-4 w-4" />} label="Clubes ativos" value={String(active.length)} hint={`${clubs.length} no calendário`} />
            <Stat icon={<Wallet className="h-4 w-4" />} label="Mensalidades por mês" value={fmtBRL(active.reduce((t, c) => t + c.costCents, 0))} hint="clubes ativos" />
            <Stat icon={<CalendarDays className="h-4 w-4" />} label={`Total em ${year}`} value={fmtBRL(yearCents)} hint="pago + previsto no ano" />
            <Stat icon={<Coins className="h-4 w-4" />} label={`Pontos em ${year}`} value={fmtPts(yearPts)} hint="pago + previsto no ano" accent />
          </div>

          <section className="card mb-5 overflow-hidden" aria-label="Planos das contas">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Conta</th><th>Plano</th><th className="text-right">Mensalidade</th><th>Assinatura</th><th>Vencimento</th><th>Próxima cobrança</th><th>Fim do plano</th><th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((c) => (
                    <tr key={c.id}>
                      <td className="max-w-[240px]">
                        <Link href={`/app/programs/${c.accountId}`} className="flex items-center gap-2 font-medium hover:underline">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden /><span className="truncate">{c.program}</span>
                        </Link>
                        <span className="block truncate text-xs text-muted">{c.holder}</span>
                      </td>
                      <td className="max-w-[220px]"><span className="block truncate">{c.points ? `${fmtPts(c.points)} pts` : "-"}</span><span className="block truncate text-xs text-muted">{c.description}</span></td>
                      <td className="text-right tabular-nums">{c.costCents ? fmtBRL(c.costCents) : "-"}</td>
                      <td className="whitespace-nowrap tabular-nums">{c.signedAt ? fmtDate(c.signedAt) : "-"}</td>
                      <td className="whitespace-nowrap">{c.chargeDay ? `todo dia ${c.chargeDay}` : "-"}</td>
                      <td className="whitespace-nowrap tabular-nums">{c.nextDate && c.active ? fmtDate(c.nextDate) : c.fromEntries ? <Link href={`/app/programs/${c.accountId}`} className="text-xs font-medium text-accent-light hover:underline">Cadastrar recorrência</Link> : "-"}</td>
                      <td className="whitespace-nowrap tabular-nums">{c.endDate ? fmtDate(c.endDate) : <span className="text-muted">sem fim</span>}</td>
                      <td>{c.active ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Ativo</span> : <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">{c.fromEntries ? "Pelo extrato" : "Pausado"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden" aria-label={`Calendário de ${year}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {months.map((m, mi) => (
                <div key={m.month} className="border-b border-r border-line p-3" aria-label={`${MONTHS[mi]} de ${year}`}>
                  <h2 className={`mb-2 rounded-md py-1 text-center text-sm font-semibold uppercase tracking-wider ${m.month === curMonth ? "bg-accent text-zinc-950" : "bg-accent/15 text-accent-light"}`}>
                    {MONTHS[mi]}
                  </h2>
                  <table className="w-full table-fixed text-center text-[13px]">
                    <thead><tr>{WEEK.map((w, i) => <th key={i} className={`pb-1 text-[11px] font-semibold ${i === 0 || i === 6 ? "text-accent-light" : ""}`}>{w}</th>)}</tr></thead>
                    <tbody>
                      {m.weeks.map((wk, wi) => (
                        <tr key={wi}>
                          {wk.map((d, di) => {
                            if (!d) return <td key={di} />;
                            const evs = m.byDay.get(d) ?? [];
                            const title = evs.map((e) => { const c = byId.get(e.clubId); return `${c?.program} · ${c?.holder} · ${fmtBRL(e.costCents)}${e.projected ? " (previsto)" : ""}`; }).join("\n");
                            const color = evs.length ? byId.get(evs[0]!.clubId)?.color ?? "#a1a1aa" : undefined;
                            const done = evs.some((e) => !e.projected);
                            const weekend = di === 0 || di === 6;
                            return (
                              <td key={di} className="py-0.5" title={title || undefined}>
                                <span
                                  className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full tabular-nums ${evs.length ? "font-semibold text-white" : weekend ? "text-accent-light" : "text-muted"} ${d === cal.today ? "ring-1 ring-white" : ""}`}
                                  style={evs.length ? (done ? { backgroundColor: color } : { boxShadow: `inset 0 0 0 1.5px ${color}` }) : undefined}
                                >
                                  {Number(d.slice(8))}
                                  {evs.length > 1 && <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold leading-[14px] text-zinc-950">{evs.length}</span>}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-center text-[11px] tabular-nums text-muted">{m.events.length ? `${m.events.length} ${m.events.length === 1 ? "cobrança" : "cobranças"} · ${fmtBRL(m.totalCents)}` : "\u00a0"}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-zinc-300" aria-hidden />cobrado (Extrato)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-[1.5px] border-zinc-300" aria-hidden />previsto (recorrência)</span>
            {programs.map((pr) => { const c = cal.clubs.find((x) => x.program === pr); return <span key={pr} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: c?.color }} aria-hidden />{pr}</span>; })}
            <span>número no canto = mais de um clube no dia (passe o mouse para ver)</span>
          </div>

          {(() => {
            const limit = new Date(Date.parse(`${cal.today}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
            const next = events.filter((e) => e.day >= cal.today && e.day <= limit).sort((a, b) => a.day.localeCompare(b.day));
            if (!next.length) return null;
            return (
              <section className="card card-pad mt-5" aria-label="Próximas cobranças">
                <h2 className="mb-2 font-semibold">Próximas cobranças <span className="text-sm font-normal text-muted">(45 dias)</span></h2>
                <ul className="divide-y divide-line text-sm">
                  {next.map((e, i) => {
                    const c = byId.get(e.clubId);
                    return (
                      <li key={i} className="flex items-center gap-3 py-1.5">
                        <span className="w-12 shrink-0 tabular-nums text-muted">{fmtDate(e.day).slice(0, 5)}</span>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c?.color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{c?.program} · {c?.holder}</span>
                        <span className="tabular-nums text-muted">{fmtPts(e.points)} pts</span>
                        <span className="w-24 text-right tabular-nums">{fmtBRL(e.costCents)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })()}
          <p className="mt-3 text-xs text-muted">Cobrado = pontos de clube lançados no Extrato. Previsto = próximas cobranças pela recorrência do clube (dia da cobrança e fim do plano ficam no lançamento recorrente da conta). Assinatura = primeiro crédito de clube da conta.</p>
        </>
      )}
    </>
  );
}

import Link from "next/link";
import { Mail, MailCheck, Target, TrendingUp, UserX } from "lucide-react";
import { leadsData, LEAD_FILTERS } from "@/server/services/admin-leads";
import { parsePeriod, LEAD_STATUS_LABEL, type LeadStatus } from "@/domain/admin-metrics";
import { contactText, mailLink, waLink } from "@/domain/admin-contact";
import { PageHeader } from "@/components/stat";
import { Pagination } from "@/components/pagination";
import { pageHref, pageParam } from "@/lib/paging";
import { fmtBRL, fmtDay, fmtPts } from "@/lib/format";
import { Chips, Kpi, Panel, Pill, Section, TableCard } from "../dashboard-ui";
import { ContactButtons } from "../users/[id]/actions";

const pct = (n: number, d: number) => (d ? `${(Math.round((n / d) * 1000) / 10).toLocaleString("pt-BR")}%` : "—");
const TONE: Record<LeadStatus, "zinc" | "green" | "red" | "amber" | "blue"> = { unfinished: "red", trial: "amber", trial_over: "zinc", asked: "blue", paid: "green", free: "zinc" };

export default async function AdminLeads({ searchParams }: { searchParams: Promise<{ p?: string; s?: string; page?: string }> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp.p);
  const d = await leadsData(period, sp.s ?? null, undefined, pageParam(sp.page));
  const w = d.window;
  const accounts = d.funnel[1]!.count;
  const href = (s: string | null) => `/admin/leads?${new URLSearchParams({ ...(sp.p ? { p: sp.p } : {}), ...(s ? { s } : {}) })}`;
  const top = Math.max(d.funnel[0]!.count, 1);

  return (
    <>
      <PageHeader title="Leads" subtitle={`Quem chegou ${w.phrase}: contas criadas e cadastros que pararam no código do e-mail.`}>
        <a className="btn-ghost h-9 bg-panel" href={`/api/admin/export?kind=leads&p=${period}`}>Exportar CSV</a>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Target className="h-4 w-4" />} label={`Leads · ${w.label}`} value={fmtPts(d.total)} hint={`${accounts} contas · ${d.counts.unfinished} não concluíram`} />
        <Kpi tone="hl" icon={<TrendingUp className="h-4 w-4" />} label="Conversão em pagante" value={pct(d.counts.paid, accounts)} hint={`${d.counts.paid} de ${accounts} contas pagam`} />
        <Kpi icon={<MailCheck className="h-4 w-4" />} label="Aceitaram marketing" value={fmtPts(d.marketing)} hint={`${d.withPhone} deixaram WhatsApp · MRR ${fmtBRL(d.mrrCents)}`} />
        <Kpi tone={d.counts.unfinished ? "warn" : undefined} icon={<UserX className="h-4 w-4" />} label="Não concluíram o cadastro" value={fmtPts(d.counts.unfinished)} hint="Pediram o código e não criaram a conta" href={href("unfinished")} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Funil comercial" subtitle={w.label[0]!.toUpperCase() + w.label.slice(1)}>
          <div className="grid gap-3 sm:grid-cols-5">
            {d.funnel.map((s, i) => (
              <div key={s.key} className="rounded-xl border border-line p-3">
                <p className="text-xs font-medium text-muted">{s.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{fmtPts(s.count)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full" style={{ width: `${(s.count / top) * 100}%`, background: i === d.funnel.length - 1 ? "#E6A51C" : "#102A50" }} /></div>
                <p className="mt-1.5 text-[11px] text-muted">{i === 0 ? "entrada do funil" : `${s.pctOfPrev.toLocaleString("pt-BR")}% da anterior`}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="min-w-0" title="Desempenho por origem" subtitle={`utm_source do anúncio ou indicação · ${d.tracked} de ${accounts} com origem`}>
          {d.origins.length === 0 ? <p className="py-4 text-center text-sm text-muted">Sem contas no período.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="pb-1 font-medium">Origem</th><th className="pb-1 text-right font-medium">Leads</th><th className="pb-1 text-right font-medium">Pagaram</th><th className="pb-1 text-right font-medium">Conversão</th><th className="pb-1 text-right font-medium">MRR</th></tr></thead>
              <tbody>{d.origins.slice(0, 10).map((o) => <tr key={o.origin} className="border-t border-line"><td className="py-1.5 font-medium">{o.origin}</td><td className="text-right tabular-nums">{o.leads}</td><td className="text-right tabular-nums">{o.paid}</td><td className="text-right tabular-nums">{pct(o.paid, o.leads)}</td><td className="text-right tabular-nums">{fmtBRL(o.mrrCents)}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="mt-3 break-words text-xs text-muted">A origem vem dos parâmetros utm_* do link (ex.: <code>?utm_source=instagram&amp;utm_campaign=black</code>) e só é guardada quando a pessoa aceita os cookies de marketing.</p>
        </Panel>
      </div>

      <Section id="lista" title="Lista de leads" subtitle="Do mais recente para o mais antigo">
        <Chips active={d.filter ?? "all"} items={[{ key: "all", label: "Todos", href: href(null), n: d.total }, ...LEAD_FILTERS.map((f) => ({ key: f, label: LEAD_STATUS_LABEL[f], href: href(f), n: d.counts[f] }))]} />
        <TableCard colSpan={5} minW={880} empty={d.list.length === 0 && "Nenhum lead aqui."} head={<><th>Lead</th><th>Origem</th><th>Situação</th><th>Chegou</th><th className="text-right">Chamar</th></>}>
          {d.list.map((l) => {
            const reason = l.status === "trial" ? "trial" : l.status === "asked" ? "request" : "generic";
            const text = l.userId ? contactText(reason, l.name, { days: l.trialDaysLeft }) : "Oi! Aqui é da equipe MilhasX. Vi que você começou o cadastro e não concluiu. Posso te ajudar?";
            return (
              <tr key={l.key}>
                <td>{l.userId ? <Link href={`/admin/users/${l.userId}`} className="font-semibold hover:underline">{l.name}</Link> : <span className="font-semibold text-muted">Sem conta</span>}<span className="block text-xs text-muted">{l.email}{l.userId && ` · ${l.method}`}{l.marketing && " · aceita marketing"}</span></td>
                <td>{l.origin}{l.campaign && <span className="block text-xs text-muted">{l.campaign}</span>}</td>
                <td><Pill tone={TONE[l.status]}>{LEAD_STATUS_LABEL[l.status]}{l.status === "trial" && ` · ${l.trialDaysLeft}d`}</Pill>{l.userId && !l.used && l.status !== "paid" && <span className="mt-1 block text-xs text-muted">ainda não lançou nada</span>}</td>
                <td className="text-muted">{fmtDay(l.createdAt)}</td>
                <td className="text-right">{l.userId
                  ? <ContactButtons compact userId={l.userId} reason={reason} wa={waLink(l.phone, text)} mail={mailLink(l.email, "MilhasX", text)} />
                  : <a className="btn-ghost h-8 px-2.5 text-xs" href={mailLink(l.email, "Seu cadastro no MilhasX", text)}><Mail className="h-4 w-4" />E-mail</a>}</td>
              </tr>
            );
          })}
        </TableCard>
        <Pagination {...d.paging} href={pageHref("/admin/leads", sp, "page", "lista")} noun={["lead", "leads"]} />
      </Section>
    </>
  );
}

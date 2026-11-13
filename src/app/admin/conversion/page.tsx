import { conversionData } from "@/server/services/admin-dashboard";
import { parsePeriod } from "@/domain/admin-metrics";
import { PageHeader } from "@/components/stat";
import { fmtDay, fmtPts } from "@/lib/format";
import { DeltaBadge, Kpi, Panel, Section, TableCard } from "../dashboard-ui";

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const rate = (n: number, d: number) => (d ? pct(Math.round((n / d) * 1000) / 10) : "—");

function CohortTable({ rows, first }: { rows: { key: string; signups: number; activated: number; asked: number; paid: number; rate: number }[]; first: string }) {
  return (
    <TableCard colSpan={6} empty={rows.every((r) => !r.signups) && "Nenhum cadastro no período."} head={<><th>{first}</th><th className="text-right">Cadastros</th><th className="text-right">Ativaram</th><th className="text-right">Pediram plano</th><th className="text-right">Pagantes</th><th className="text-right">Conversão</th></>}>
      {rows.map((r) => (
        <tr key={r.key}>
          <td className="font-medium">{/^\d{4}-\d{2}-\d{2}$/.test(r.key) ? (first === "Mês" ? new Date(`${r.key}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }) : `Semana de ${fmtDay(`${r.key}T12:00:00Z`)}`) : r.key}</td>
          <td className="text-right tabular-nums">{fmtPts(r.signups)}</td>
          <td className="text-right tabular-nums">{fmtPts(r.activated)} <span className="text-xs text-muted">{rate(r.activated, r.signups)}</span></td>
          <td className="text-right tabular-nums">{fmtPts(r.asked)} <span className="text-xs text-muted">{rate(r.asked, r.signups)}</span></td>
          <td className="text-right tabular-nums font-semibold">{fmtPts(r.paid)}</td>
          <td className="text-right"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${r.rate > 0 ? "bg-green-500/15 text-green-300" : "bg-panel2 text-muted"}`}>{pct(r.rate)}</span></td>
        </tr>
      ))}
    </TableCard>
  );
}

export default async function AdminConversion({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const d = await conversionData(parsePeriod((await searchParams).p));
  const w = d.window;
  const f = d.funnel;
  const first = f[0]!.count;

  return (
    <>
      <PageHeader title="Conversão" subtitle={`Do cadastro ao plano pago · quem se cadastrou nos últimos ${w.label}, comparado aos ${w.label} anteriores`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {f.map((s, i) => (
          <Kpi key={s.key} tone={i === f.length - 1 ? "hl" : undefined} label={s.label} value={fmtPts(s.count)} delta={s.delta} hint={i === 0 ? `${s.prev} no período anterior` : `${pct(s.pctOfPrev)} da etapa anterior · ${pct(s.pctOfFirst)} do total`} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Funil" subtitle="Cada barra é a parte dos cadastros que chegou à etapa">
          <ol className="space-y-4">
            {f.map((s, i) => (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{s.label}</span><span className="tabular-nums"><b>{fmtPts(s.count)}</b> <span className="text-xs text-muted">{first ? pct(s.pctOfFirst) : "—"}</span></span></div>
                <div className="mt-1.5 h-7 overflow-hidden rounded-lg bg-panel2" aria-hidden>
                  <div className="flex h-full items-center rounded-lg px-2 text-[11px] font-semibold text-white" style={{ width: `${Math.max(s.pctOfFirst, s.count ? 3 : 0)}%`, background: i === f.length - 1 ? "#E6A51C" : `rgb(16 42 80 / ${1 - i * 0.2})` }} />
                </div>
                {i > 0 && <p className="mt-1 text-xs text-muted">{pct(s.pctOfPrev)} de quem {f[i - 1]!.label.toLowerCase()} · perda de {fmtPts(f[i - 1]!.count - s.count)}</p>}
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Testes que terminaram" subtitle="Testes grátis encerrados no período e quantos assinaram">
          <p className="text-3xl font-bold tabular-nums tracking-tight">{pct(d.trial.cur.rate)}</p>
          <p className="mt-1 text-sm text-muted">{d.trial.cur.converted} de {d.trial.cur.ended} testes viraram pagantes</p>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm">
            <span className="text-muted">Antes: {pct(d.trial.prev.rate)} ({d.trial.prev.converted} de {d.trial.prev.ended})</span>
            <span className="ml-auto"><DeltaBadge d={{ pct: d.trial.prev.rate ? Math.round(((d.trial.cur.rate - d.trial.prev.rate) / d.trial.prev.rate) * 100) : d.trial.cur.rate ? null : 0, dir: d.trial.cur.rate > d.trial.prev.rate ? "up" : d.trial.cur.rate < d.trial.prev.rate ? "down" : "flat" }} /></span>
          </div>
        </Panel>
      </div>

      <Section title={w.bucket === "month" ? "Coortes por mês" : "Coortes por semana"} subtitle="Cada linha é um grupo de cadastros. Ativou = fez o primeiro lançamento em até 7 dias.">
        <CohortTable rows={d.cohorts} first={w.bucket === "month" ? "Mês" : "Semana"} />
      </Section>
      <Section title="Por origem do cadastro" subtitle="Indicação de cliente, login com Google ou e-mail e senha">
        <CohortTable rows={d.sources} first="Origem" />
      </Section>
    </>
  );
}

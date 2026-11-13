import { CalendarRange, Download, FileSpreadsheet } from "lucide-react";
import { REPORTS } from "@/server/services/admin-reports";
import { parsePeriod, periodWindow } from "@/domain/admin-metrics";
import { PageHeader } from "@/components/stat";
import { fmtDay } from "@/lib/format";

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const period = parsePeriod((await searchParams).p);
  const w = periodWindow(period);
  return (
    <>
      <PageHeader title="Relatórios" subtitle={`Planilhas CSV (abrem no Excel e no Google Planilhas). Os marcados com período usam os últimos ${w.label}: ${fmtDay(w.from)} a ${fmtDay(w.to)}.`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <a key={r.kind} href={`/api/admin/export?kind=${r.kind}${r.period ? `&p=${period}` : ""}`} className="card group flex items-start gap-3 p-4 transition hover:-translate-y-px hover:shadow-[0_6px_18px_rgb(15_27_45/0.07)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[rgb(var(--brand)/0.06)] text-[rgb(var(--brand))]"><FileSpreadsheet className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm">{r.label}</b>
              <span className="block text-xs text-muted">{r.detail}</span>
              {r.period && <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#E6A51C1A] px-2 py-0.5 text-[11px] font-semibold text-[#B7800F]"><CalendarRange className="h-3 w-3" />Últimos {w.label}</span>}
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted group-hover:text-[rgb(var(--brand))]" />
          </a>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Cada download fica registrado na Auditoria. As planilhas têm dados pessoais: guarde e compartilhe com cuidado.</p>
    </>
  );
}

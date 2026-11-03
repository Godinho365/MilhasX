import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { listGoals, listMembers, periodStart, periodEnd } from "@/server/services/team";
import { PageHeader } from "@/components/stat";
import { brDay } from "@/domain/brasilia";
import { GoalsClient } from "./client";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
type Period = "MONTH" | "QUARTER" | "YEAR";
const label = (p: Period, d: Date) => p === "YEAR" ? String(d.getUTCFullYear()) : p === "QUARTER" ? `${Math.floor(d.getUTCMonth() / 3) + 1}º tri/${d.getUTCFullYear()}` : `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ periodo?: string; inicio?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const period: Period = sp.periodo === "QUARTER" || sp.periodo === "YEAR" ? sp.periodo : "MONTH";
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(sp.inicio ?? "") ? new Date(`${sp.inicio}T00:00:00Z`) : new Date(`${brDay()}T00:00:00Z`);
  const start = periodStart(period, ref);
  const prev = periodStart(period, new Date(start.getTime() - 86_400_000));
  const next = periodEnd(period, start);
  const href = (p: Period, d: Date) => `/app/equipe/metas?periodo=${p}&inicio=${d.toISOString().slice(0, 10)}`;
  const [goals, members] = await Promise.all([listGoals(user.id, period, start), listMembers(user.id)]);
  return (
    <>
      <PageHeader title="Metas" subtitle="Objetivos da empresa e de cada pessoa, com resultados-chave e check-in">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Período">
          {([["MONTH", "Mês"], ["QUARTER", "Trimestre"], ["YEAR", "Ano"]] as const).map(([k, l]) => (
            <Link key={k} href={href(k, start)} aria-pressed={period === k} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</Link>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1">
          <Link href={href(period, prev)} className="btn-subtle h-9 w-9 px-0" aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[90px] text-center text-sm font-semibold">{label(period, start)}</span>
          <Link href={href(period, next)} className="btn-subtle h-9 w-9 px-0" aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </PageHeader>
      <GoalsClient goals={goals} members={members.filter((m) => m.active)} period={period} start={start.toISOString().slice(0, 10)} />
    </>
  );
}

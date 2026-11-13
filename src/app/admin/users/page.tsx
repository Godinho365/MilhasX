import Link from "next/link";
import { Search } from "lucide-react";
import { requirePageAdmin } from "@/server/session";
import { listUsers, userFilterCounts, USER_FILTERS } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { UserRow } from "./client";
import { effectivePlan } from "@/domain/plans";

const FILTER_LABELS: Record<(typeof USER_FILTERS)[number] | "all", string> = {
  all: "Todos", paid: "Pagantes", trial: "Em teste", request: "Pediram plano", deletion: "Pediram exclusão", disabled: "Desativados", admin: "Admins",
};

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const admin = await requirePageAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const f = (USER_FILTERS as readonly string[]).includes(sp.f ?? "") ? sp.f! : "all";
  const [users, counts] = await Promise.all([listUsers(q, f === "all" ? null : f), userFilterCounts()]);
  const href = (key: string) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(key !== "all" ? { f: key } : {}) })}`;
  return (
    <>
      <PageHeader title="Usuários" subtitle={`${counts.all} contas · ${counts.paid} pagantes · ${counts.trial} em teste`}>
        <a className="btn-ghost h-9" href="/api/admin/export?kind=users">Exportar CSV</a>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtros">
        {(["all", ...USER_FILTERS] as const).map((k) => (
          <Link key={k} href={href(k)} role="tab" aria-selected={f === k} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${f === k ? "border-zinc-500 bg-panel2 text-white" : "border-line text-muted hover:text-zinc-100"}`}>
            {FILTER_LABELS[k]}<span className="tabular-nums text-muted">{counts[k]}</span>
          </Link>
        ))}
      </div>
      <form className="mb-3 flex gap-2">
        {f !== "all" && <input type="hidden" name="f" value={f} />}
        <div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-9" name="q" defaultValue={q} placeholder="Nome ou e-mail" aria-label="Buscar usuário" /></div>
        <button className="btn-ghost">Buscar</button>
        {q && <Link href={href(f)} className="btn-ghost">Limpar</Link>}
      </form>
      <div className="card overflow-x-auto">
        <table className="table-base min-w-[720px]">
          <thead><tr><th>Usuário</th><th>Papel</th><th>Plano</th><th>Status</th><th className="hidden text-right sm:table-cell">Contas</th><th className="hidden text-right sm:table-cell">Lançamentos</th><th className="hidden md:table-cell">Desde</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} self={u.id === admin.id} u={{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, accounts: u._count.accounts, entries: u._count.entries, createdAt: u.createdAt.toISOString(), plan: u.plan, planInterval: u.planInterval, trialDaysLeft: effectivePlan(u).trialDaysLeft, planRequest: u.planRequest, planRequestInterval: u.planRequestInterval, deletionRequested: !!u.deletionRequestedAt }} />
            ))}
            {users.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-sm text-muted">Nenhum usuário encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {users.length >= 200 && <p className="mt-2 text-xs text-muted">Mostrando os 200 cadastros mais recentes. Use a busca ou os filtros para achar os demais.</p>}
    </>
  );
}

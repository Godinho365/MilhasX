import Link from "next/link";
import { Search } from "lucide-react";
import { requirePageAdmin } from "@/server/session";
import { listUsersPage, userFilterCounts, USER_FILTERS } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { Pagination } from "@/components/pagination";
import { pageHref, pageParam } from "@/lib/paging";
import { UserRow } from "./client";
import { effectivePlan } from "@/domain/plans";
import { Chips } from "../dashboard-ui";

const FILTER_LABELS: Record<(typeof USER_FILTERS)[number] | "all", string> = {
  all: "Todos", paid: "Pagantes", trial: "Em teste", request: "Pediram plano", deletion: "Pediram exclusão", disabled: "Desativados", admin: "Admins",
};

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  const admin = await requirePageAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const f = (USER_FILTERS as readonly string[]).includes(sp.f ?? "") ? sp.f! : "all";
  const [res, counts] = await Promise.all([listUsersPage(q, f === "all" ? null : f, pageParam(sp.page)), userFilterCounts()]);
  const users = res.items;
  const href = (key: string) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(key !== "all" ? { f: key } : {}) })}`;
  return (
    <>
      <PageHeader title="Usuários" subtitle={`${counts.all} contas · ${counts.paid} pagantes · ${counts.trial} em teste`}>
        <a className="btn-ghost h-9 bg-panel" href="/api/admin/export?kind=users">Exportar CSV</a>
      </PageHeader>
      <Chips active={f} items={(["all", ...USER_FILTERS] as const).map((k) => ({ key: k, label: FILTER_LABELS[k], href: href(k), n: counts[k] }))} />
      <form className="mb-3 flex gap-2">
        {f !== "all" && <input type="hidden" name="f" value={f} />}
        <div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input bg-panel pl-9" name="q" defaultValue={q} placeholder="Nome ou e-mail" aria-label="Buscar usuário" /></div>
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
      <Pagination {...res} href={pageHref("/admin/users", sp)} noun={["usuário", "usuários"]} />
    </>
  );
}

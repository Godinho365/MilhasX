import { Search } from "lucide-react";
import { requirePageAdmin } from "@/server/session";
import { listUsers } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { UserRow } from "./client";
import { effectivePlan } from "@/domain/plans";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requirePageAdmin();
  const q = (await searchParams).q;
  const users = await listUsers(q);
  return (
    <>
      <PageHeader title="Usuários" subtitle={`${users.length} ${users.length === 1 ? "usuário" : "usuários"}`} />
      <form className="mb-3 flex gap-2">
        <div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-9" name="q" defaultValue={q} placeholder="Nome ou e-mail" aria-label="Buscar usuário" /></div>
        <button className="btn-ghost">Buscar</button>
      </form>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Usuário</th><th>Papel</th><th>Plano</th><th>Status</th><th className="hidden text-right sm:table-cell">Contas</th><th className="hidden text-right sm:table-cell">Lançamentos</th><th className="hidden md:table-cell">Desde</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} self={u.id === admin.id} u={{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, accounts: u._count.accounts, entries: u._count.entries, createdAt: u.createdAt.toISOString(), plan: u.plan, planInterval: u.planInterval, trialDaysLeft: effectivePlan(u).trialDaysLeft, planRequest: u.planRequest, planRequestInterval: u.planRequestInterval, deletionRequested: !!u.deletionRequestedAt }} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

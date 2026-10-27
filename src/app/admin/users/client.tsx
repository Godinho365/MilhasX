"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Avatar } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";

type PlanCode = "PESSOAL" | "PRO" | "GESTOR";
const PLAN_NAMES: Record<PlanCode, string> = { PESSOAL: "Pessoal", PRO: "PRO", GESTOR: "Gestor" };

export function UserRow({ u, self }: { self: boolean; u: { id: string; name: string; email: string; role: string; status: string; accounts: number; entries: number; createdAt: string; plan: PlanCode; planInterval: string | null; trialDaysLeft: number; planRequest: PlanCode | null; planRequestInterval: string | null; deletionRequested: boolean } }) {
  const router = useRouter();
  async function setPlan(plan: PlanCode, interval: string | null) {
    const r = await api(`/api/admin/users/${u.id}/plan`, "PUT", { plan, interval: plan === "PESSOAL" ? null : interval ?? "MENSAL" });
    if (!r.ok) return toast(r.erro, "error");
    toast(`Plano ${PLAN_NAMES[plan]} ativado`);
    refreshSafe(router);
  }
  async function toggle() {
    const next = u.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (next === "DISABLED" && !(await confirmDialog({ title: `Desativar ${u.email}?`, body: "As sessões abertas serão encerradas e o login ficará bloqueado.", confirmLabel: "Desativar", danger: true }))) return;
    const r = await api(`/api/admin/users/${u.id}`, "PATCH", { status: next });
    if (!r.ok) return toast(r.erro, "error");
    toast(next === "DISABLED" ? "Conta desativada" : "Conta reativada");
    refreshSafe(router);
  }
  return (
    <tr>
      <td><span className="flex items-center gap-3"><Avatar name={u.name} /><span className="min-w-0"><span className="block truncate font-semibold">{u.name}</span><span className="block truncate text-xs text-muted">{u.email}</span></span></span></td>
      <td>{u.role === "ADMIN" ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">Admin</span> : <span className="text-muted">Cliente</span>}</td>
      <td>
        <select className="input h-8 w-28 py-0 text-xs" value={u.plan} onChange={(e) => setPlan(e.target.value as PlanCode, u.planInterval)} aria-label={`Plano de ${u.email}`}>
          {(Object.keys(PLAN_NAMES) as PlanCode[]).map((p) => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}
        </select>
        {u.trialDaysLeft > 0 && <span className="mt-1 block text-[11px] text-amber-300">Teste: {u.trialDaysLeft}d</span>}
        {u.planRequest && (
          <button className="mt-1 block text-left text-[11px] text-accent-light hover:underline" onClick={() => setPlan(u.planRequest!, u.planRequestInterval)}>
            Pediu {PLAN_NAMES[u.planRequest]}{u.planRequestInterval === "ANUAL" ? " anual" : ""}: ativar
          </button>
        )}
      </td>
      <td>{u.deletionRequested && <span className="mb-1 block w-fit rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">Pediu exclusão</span>}{u.status === "ACTIVE" ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-300">Ativo</span> : <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">Desativado</span>}</td>
      <td className="hidden text-right tabular-nums sm:table-cell">{u.accounts}</td>
      <td className="hidden text-right tabular-nums sm:table-cell">{u.entries}</td>
      <td className="hidden text-muted md:table-cell">{fmtDate(u.createdAt)}</td>
      <td className="text-right">{!self && <button className={u.status === "ACTIVE" ? "btn-ghost h-8 text-red-300" : "btn-ghost h-8 text-green-300"} onClick={toggle}>{u.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>}</td>
    </tr>
  );
}

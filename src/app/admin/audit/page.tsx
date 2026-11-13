import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { listAudit } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { Pagination } from "@/components/pagination";
import { Chips, Pill } from "../dashboard-ui";

// Filtros rápidos pelo prefixo da ação e a cor de cada grupo
const GROUPS = [
  { prefix: "admin.", label: "Administração", tone: "amber" },
  { prefix: "billing.", label: "Assinatura", tone: "green" },
  { prefix: "user.", label: "Conta", tone: "blue" },
  { prefix: "credential", label: "Credenciais", tone: "red" },
] as const;
const toneOf = (action: string) => GROUPS.find((g) => action.startsWith(g.prefix))?.tone ?? "zinc";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const data = await listAudit({ action: sp.action, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Auditoria" subtitle={`${data.total.toLocaleString("pt-BR")} ${data.total === 1 ? "registro" : "registros"}${sp.action ? ` com "${sp.action}"` : ""}`}>
        <a className="btn-ghost h-9 bg-panel" href="/api/admin/export?kind=audit">Exportar CSV</a>
      </PageHeader>
      <Chips active={sp.action ?? "all"} items={[{ key: "all", label: "Tudo", href: "/admin/audit" }, ...GROUPS.map((g) => ({ key: g.prefix, label: g.label, href: `/admin/audit?action=${encodeURIComponent(g.prefix)}` }))]} />
      <form className="mb-3 flex gap-2"><input className="input max-w-xs bg-panel" name="action" defaultValue={sp.action} placeholder="Filtrar ação (ex.: admin.)" aria-label="Ação" /><button className="btn-ghost">Filtrar</button><Link href="/admin/audit" className="btn-ghost">Limpar</Link></form>
      <div className="card overflow-x-auto">
        <table className="table-base min-w-[640px]">
          <thead><tr><th>Data</th><th>Ator</th><th>Ação</th><th>Alvo</th></tr></thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.id}><td className="whitespace-nowrap text-muted tabular-nums">{fmtDateTime(l.createdAt)}</td><td>{l.actor?.email ?? <span className="text-muted">sistema</span>}</td><td><Pill tone={toneOf(l.action)}><code>{l.action}</code></Pill></td><td className="text-muted">{l.targetType} <code className="text-xs">{l.targetId?.slice(0, 10)}</code></td></tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-sm text-muted">Nenhum registro.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={50} href={(p) => `/admin/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), page: String(p) })}`} />
    </>
  );
}

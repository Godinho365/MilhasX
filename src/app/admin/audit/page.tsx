import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { listAudit } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { Pagination } from "@/components/pagination";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const data = await listAudit({ action: sp.action, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Auditoria" />
      <form className="mb-3 flex gap-2"><input className="input max-w-xs" name="action" defaultValue={sp.action} placeholder="Filtrar ação (ex.: admin.)" aria-label="Ação" /><button className="btn-ghost">Filtrar</button><Link href="/admin/audit" className="btn-ghost">Limpar</Link></form>
      <div className="card overflow-x-auto">
        <table className="table-base min-w-[640px]">
          <thead><tr><th>Data</th><th>Ator</th><th>Ação</th><th>Alvo</th></tr></thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.id}><td className="whitespace-nowrap text-muted">{fmtDateTime(l.createdAt)}</td><td>{l.actor?.email ?? "sistema"}</td><td><code className="text-xs">{l.action}</code></td><td className="text-muted">{l.targetType} {l.targetId?.slice(0, 10)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={50} href={(p) => `/admin/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), page: String(p) })}`} />
    </>
  );
}

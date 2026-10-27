import { metrics } from "@/server/services/admin";
import { PageHeader, Stat } from "@/components/stat";
import { fmtBRL, fmtPts } from "@/lib/format";

export default async function AdminHome() {
  const m = await metrics();
  return (
    <>
      <PageHeader title="Indicadores" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuários" value={fmtPts(m.users)} hint={`${m.activeUsers} ativos`} />
        <Stat label="Novos (30 dias)" value={fmtPts(m.newUsers)} />
        <Stat label="Lançamentos" value={fmtPts(m.entries)} hint={`${m.entries30} nos últimos 30 dias`} />
        <Stat label="Programas ativos" value={fmtPts(m.programs)} />
        <Stat label="Vendas registradas" value={fmtPts(m.salesCount)} />
        <Stat label="Volume vendido" value={fmtBRL(m.salesTotalCents)} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <a className="btn-ghost" href="/api/admin/export?kind=users">Exportar usuários (CSV)</a>
        <a className="btn-ghost" href="/api/admin/export?kind=programs">Exportar programas (CSV)</a>
        <a className="btn-ghost" href="/api/admin/export?kind=audit">Exportar auditoria (CSV)</a>
      </div>
    </>
  );
}

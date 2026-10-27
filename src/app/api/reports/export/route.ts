import { route, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { selectedHolderId } from "@/server/session";
import { csvCell } from "@/server/services/ledger";
import { REPORT_TABS, type ReportTab, resolvePeriod, exportReportCsv } from "@/server/services/reports";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  if (!REPORT_TABS.includes(sp.tab as ReportTab)) throw new DomainError(400, "Relatório inválido");
  const { name, rows } = await exportReportCsv(sp.tab as ReportTab, { userId: u.id, holderId: await selectedHolderId(u.id), programId: sp.programa || undefined, period: resolvePeriod(sp) });
  return new Response("\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="relatorio-${name}.csv"` },
  });
});

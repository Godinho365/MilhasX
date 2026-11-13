import { route, requireAdmin } from "@/server/http";
import { reportCsv, isReportKind } from "@/server/services/admin-reports";
import { parsePeriod } from "@/domain/admin-metrics";
import { DomainError } from "@/server/db";

export const GET = route(async (req) => {
  const admin = await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind");
  if (!isReportKind(kind)) throw new DomainError(400, "Relatório inválido");
  const period = parsePeriod(sp.get("p"));
  const csv = await reportCsv(admin.id, kind, period);
  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${day}.csv"` },
  });
});

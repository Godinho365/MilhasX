import { route, requireAdmin } from "@/server/http";
import { exportCsv } from "@/server/services/admin";
import { DomainError } from "@/server/db";

export const GET = route(async (req) => {
  const admin = await requireAdmin(req);
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "users" && kind !== "programs" && kind !== "audit") throw new DomainError(400, "Relatório inválido");
  const csv = await exportCsv(admin.id, kind);
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}.csv"` },
  });
});

import { route, requireUser } from "@/server/http";
import { entryQuerySchema, queryObject } from "@/server/schemas";
import { exportEntriesCsv } from "@/server/services/ledger";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const f = entryQuerySchema.parse(queryObject(req));
  const csv = await exportEntriesCsv(u.id, f);
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="extrato.csv"' },
  });
});

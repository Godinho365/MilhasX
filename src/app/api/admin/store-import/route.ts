import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { importFromSource, importCsv, importSavedPage, importStatus, SOURCES, PAGE_SOURCES, type SourceKey, type PageSourceKey } from "@/server/services/store-import";

const schema = z.union([
  z.object({ source: z.enum(Object.keys(SOURCES) as [SourceKey, ...SourceKey[]]) }),
  z.object({ programId: z.string().min(1).max(40), csv: z.string().min(1).max(500_000) }),
  // Página de parceiros salva no navegador (fontes que bloqueiam robôs)
  z.object({ page: z.enum(Object.keys(PAGE_SOURCES) as [PageSourceKey, ...PageSourceKey[]]), html: z.string().min(1).max(8_000_000) }),
]);

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ ok: true, items: await importStatus() });
});

// Importa uma fonte automática ou uma planilha (CSV) colada pelo admin
export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, schema);
  const result = "source" in b ? await importFromSource(admin.id, b.source) : "page" in b ? await importSavedPage(admin.id, b.page, b.html) : await importCsv(admin.id, b.programId, b.csv);
  return json({ ok: true, result });
});

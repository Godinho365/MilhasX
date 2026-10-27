import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { importFromSource, importCsv, importSavedPage, importStatus, importMeliuz, importCashbackFile, importRunReport, SOURCES, PAGE_SOURCES, FILE_SOURCES, type SourceKey, type PageSourceKey, type FileSourceKey } from "@/server/services/store-import";

const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const schema = z.union([
  z.object({ source: z.enum([...keys(SOURCES), "meliuz"] as [SourceKey | "meliuz", ...(SourceKey | "meliuz")[]]) }),
  z.object({ programId: z.string().min(1).max(40), csv: z.string().min(1).max(500_000) }),
  // Página de parceiros salva no navegador (fontes que bloqueiam robôs)
  z.object({ page: z.enum(keys(PAGE_SOURCES)), html: z.string().min(1).max(8_000_000) }),
  // Planilha de cashback de um portal (fontes sem API/feed que bloqueiam robôs)
  z.object({ file: z.enum(keys(FILE_SOURCES)), csv: z.string().min(1).max(2_000_000) }),
]);

// Estado de cada fonte, ou o relatório de uma execução (?run=<id>)
export const GET = route(async (req) => {
  await requireAdmin(req);
  const run = new URL(req.url).searchParams.get("run");
  if (run) return json({ ok: true, item: await importRunReport(run.slice(0, 40)) });
  return json({ ok: true, items: await importStatus() });
});

// Importa uma fonte automática, uma página salva, uma planilha de pontos ou de cashback
export const POST = route(async (req) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, schema);
  const result =
    "source" in b ? (b.source === "meliuz" ? await importMeliuz(admin.id, { manual: true }) : await importFromSource(admin.id, b.source))
    : "page" in b ? await importSavedPage(admin.id, b.page as PageSourceKey, b.html)
    : "file" in b ? await importCashbackFile(admin.id, b.file as FileSourceKey, b.csv)
    : await importCsv(admin.id, b.programId, b.csv);
  return json({ ok: true, result });
});

import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DomainError } from "@/server/db";
import { MAX_BYTES } from "@/server/services/holder-files";
import { addTaskFile } from "@/server/services/team";

// Corpo = bytes do arquivo; o nome vem no cabeçalho x-file-name (codificado em URI)
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) throw new DomainError(413, "Arquivo maior que 10 MB");
  let name = "arquivo";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "arquivo");
  } catch {}
  await addTaskFile(u.id, (await params).id!, name, await readBodyLimited(req, 10 * 1024 * 1024, "Arquivo maior que 10 MB"));
  return json({ ok: true }, 201);
});

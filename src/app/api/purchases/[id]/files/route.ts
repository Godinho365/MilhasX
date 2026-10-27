import { route, json, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { listPurchaseFiles, addPurchaseFile, PURCHASE_MAX_TOTAL } from "@/server/services/accounts";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listPurchaseFiles(u.id, (await params).id!) });
});
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  if (Number(req.headers.get("content-length") || 0) > PURCHASE_MAX_TOTAL) throw new DomainError(413, "Arquivo maior que 10 MB");
  let name = "arquivo";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "arquivo");
  } catch {}
  return json({ ok: true, item: await addPurchaseFile(u.id, (await params).id!, name, Buffer.from(await req.arrayBuffer())) }, 201);
});

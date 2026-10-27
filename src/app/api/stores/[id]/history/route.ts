import { route, json, requireUser } from "@/server/http";
import { storeParityHistory } from "@/server/services/store-import";

export const GET = route(async (req, { params }) => {
  await requireUser(req);
  return json({ ok: true, items: await storeParityHistory((await params).id!, 30) });
});

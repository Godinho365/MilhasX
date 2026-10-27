import { route, json, requireUser } from "@/server/http";
import { storeCashbackHistory, storeParityHistory } from "@/server/services/store-import";

export const GET = route(async (req, { params }) => {
  await requireUser(req);
  const id = (await params).id!;
  const [items, cashback] = await Promise.all([storeParityHistory(id, 30), storeCashbackHistory(id, 30)]);
  return json({ ok: true, items, cashback });
});

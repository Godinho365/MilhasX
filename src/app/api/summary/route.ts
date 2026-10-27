import { route, json, requireUser } from "@/server/http";
import { walletSummary, balanceEvolution } from "@/server/services/wallet";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const holderId = new URL(req.url).searchParams.get("holderId") || undefined;
  const [summary, evolution] = await Promise.all([walletSummary(u.id, holderId), balanceEvolution(u.id, { holderId })]);
  return json({ ok: true, ...summary, evolution });
});

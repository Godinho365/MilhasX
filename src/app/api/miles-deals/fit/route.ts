import { z } from "zod";
import { route, json, requireUser } from "@/server/http";
import { queryObject } from "@/server/schemas";
import { dealAccountFit } from "@/server/services/capacity";

const q = z.object({
  dealId: z.string().max(40).optional(),
  points: z.coerce.number().int().min(0).max(100_000_000).optional(),
  cpfs: z.coerce.number().int().min(1).max(99).optional(),
  accountId: z.string().max(40).optional(),
  orderLink: z.string().max(500).optional(),
});

/** Sugestão de conta pelos valores digitados na negociação (nova ou salva). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const p = q.parse(queryObject(req));
  return json({ ok: true, ...(await dealAccountFit(u.id, p.dealId ?? null, { points: p.points, cpfs: p.cpfs, accountId: p.accountId ?? null, orderLink: p.orderLink ?? null })) });
});

import { route, json, parseBody, requireUser } from "@/server/http";
import { overviewWidgetsSchema } from "@/server/schemas";
import { prisma } from "@/server/db";
import { OVERVIEW_WIDGETS } from "@/domain/overview";

/** Blocos da Visão geral de quem entrou (na ordem; os que não estão na lista ficam escondidos). */
export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const { widgets } = await parseBody(req, overviewWidgetsSchema);
  const valid = [...new Set(widgets.filter((w) => w in OVERVIEW_WIDGETS))];
  await prisma.userPreference.upsert({ where: { userId: u.actor.id }, create: { userId: u.actor.id, overviewWidgets: valid }, update: { overviewWidgets: valid } });
  return json({ ok: true, widgets: valid });
});

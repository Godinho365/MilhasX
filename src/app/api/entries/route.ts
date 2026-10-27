import { route, json, parseBody, requireUser } from "@/server/http";
import { entrySchema, entryQuerySchema, queryObject } from "@/server/schemas";
import { createEntry, listEntries } from "@/server/services/ledger";
import { upsertRecurrence, addPeriod } from "@/server/services/accounts";
import { DomainError } from "@/server/db";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const f = entryQuerySchema.parse(queryObject(req));
  return json({ ok: true, ...(await listEntries(u.id, f)) });
});
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const { recurrence, ...b } = await parseBody(req, entrySchema);
  if (recurrence && b.type !== "CLUB") throw new DomainError(400, "Repetição automática só para pontos de clube");
  const { entry, duplicated } = await createEntry(u.id, b);
  // "Repetir automaticamente": este lançamento é a primeira ocorrência; a recorrência começa na próxima
  if (recurrence && !duplicated) {
    await upsertRecurrence(u.id, null, {
      accountId: b.accountId,
      type: b.type,
      description: entry.description.replace(/ \(\d{2}\/\d{2}\/\d{4}\)$/, ""),
      points: b.points,
      costCents: entry.inputCostCents,
      frequency: recurrence.frequency,
      interval: recurrence.interval,
      dayOfMonth: recurrence.dayOfMonth ?? null,
      endDate: recurrence.endDate ?? null,
      skipWeekends: recurrence.skipWeekends,
      nextDate: addPeriod(b.occurredAt, recurrence.frequency, recurrence.interval, recurrence.dayOfMonth),
      notify: true,
    });
  }
  return json({ ok: true, item: entry, duplicated }, duplicated ? 200 : 201);
});

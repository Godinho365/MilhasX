import { requirePageUser, selectedHolderId, holderScopeLabel } from "@/server/session";
import { listEntries } from "@/server/services/ledger";
import { listPrograms } from "@/server/services/admin";
import { listAccounts } from "@/server/services/wallet";
import { prisma } from "@/server/db";
import { entryQuerySchema } from "@/server/schemas";
import { PageHeader } from "@/components/stat";
import { Pagination } from "@/components/pagination";
import { EntriesView } from "./client";

export default async function EntriesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const holderId = await selectedHolderId(user.id);
  const parsed = entryQuerySchema.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)));
  const f = parsed.success ? parsed.data : {};
  const [data, programs, accounts, cards] = await Promise.all([
    listEntries(user.id, { ...f, holderId }),
    listPrograms(false),
    listAccounts(user.id, holderId),
    prisma.creditCard.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const qs = (p: number) => {
    const u = new URLSearchParams(sp);
    u.set("page", String(p));
    return `/app/entries?${u.toString()}`;
  };
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k]) => !["page", "pageSize", "novo"].includes(k)));
  if (holderId) exportQs.set("holderId", holderId);
  return (
    <>
      <PageHeader title="Extrato" subtitle={`${data.total} ${data.total === 1 ? "lançamento" : "lançamentos"} · ${await holderScopeLabel(holderId)}`} />
      <EntriesView
        programs={programs.map((p) => ({ id: p.id, name: p.name }))}
        accounts={accounts.map((a) => ({ id: a.id, name: `${a.program.name} ${a.holder.name}` }))}
        cards={cards}
        exportHref={`/api/entries/export?${exportQs.toString()}`}
        openNew={sp.novo}
        sp={sp}
        items={data.items.map((e) => ({
          id: e.id,
          date: e.occurredAt.toISOString(),
          program: e.account.program.name,
          holder: e.account.holder.name,
          color: e.account.program.color,
          type: e.type,
          description: e.description,
          points: e.points,
          costCents: e.costCents,
          inputCostCents: e.inputCostCents,
          status: e.status,
          grouped: !!e.groupId,
          groupId: e.groupId,
          ignored: e.ignored,
        }))}
      />
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} href={qs} />
    </>
  );
}

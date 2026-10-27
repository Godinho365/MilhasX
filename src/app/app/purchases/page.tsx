import { requirePageUser } from "@/server/session";
import { listStores, listAlerts, alertSuggestions } from "@/server/services/market";
import { listAccounts } from "@/server/services/wallet";
import { listPrograms } from "@/server/services/admin";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { StoresGrid, StoresToolbar, AlertsPanel } from "./client";
import { PurchasesPanel } from "./purchases";
import { listPurchases } from "@/server/services/accounts";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; fav?: string; page?: string; programa?: string; ordem?: string; loja?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = sp.tab === "alertas" ? "alertas" : sp.tab === "compras" ? "compras" : "lojas";
  return (
    <>
      <PageHeader title="Compras" subtitle="Lojas parceiras, ofertas de pontos e cashback e seus alertas" />
      <Segmented center active={tab} items={[{ key: "lojas", label: "Lojas", href: "/app/purchases" }, { key: "compras", label: "Compras", href: "/app/purchases?tab=compras" }, { key: "alertas", label: "Alertas", href: "/app/purchases?tab=alertas" }]} />
      {tab === "lojas" ? <Stores userId={user.id} sp={sp} /> : tab === "compras" ? <Purchases userId={user.id} /> : <Alerts userId={user.id} />}
    </>
  );
}

async function Stores({ userId, sp }: { userId: string; sp: { q?: string; fav?: string; page?: string; programa?: string; ordem?: string; loja?: string } }) {
  const sort = (["popular", "points", "cashback", "name"] as const).find((x) => x === sp.ordem) ?? "popular";
  const [data, programs] = await Promise.all([
    listStores(userId, { q: sp.q, favorites: sp.fav === "1", page: Number(sp.page) || 1, programId: sp.programa || undefined, sort }),
    listPrograms(false),
  ]);
  const href = (p: number) => `/app/purchases?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.fav ? { fav: sp.fav } : {}), ...(sp.programa ? { programa: sp.programa } : {}), ...(sp.ordem ? { ordem: sp.ordem } : {}), page: String(p) })}`;
  return (
    <>
      <StoresToolbar q={sp.q ?? ""} fav={sp.fav === "1"} programId={sp.programa ?? ""} sort={sort} programs={programs.map((p) => ({ id: p.id, name: p.name }))} />
      <StoresGrid items={data.items} openId={sp.loja} />
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={18} href={href} />
      <p className="mt-4 text-xs text-muted">Pontos e cashback lidos automaticamente nos sites dos programas e portais que permitem (Esfera, Méliuz) e nas páginas enviadas pelo administrador (Livelo). Confira sempre no site antes de comprar.</p>
    </>
  );
}

async function Alerts({ userId }: { userId: string }) {
  const [alerts, stores, programs, accounts, suggestions] = await Promise.all([
    listAlerts(userId),
    prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listPrograms(false),
    listAccounts(userId),
    alertSuggestions(userId),
  ]);
  return (
    <AlertsPanel
      suggestions={suggestions}
      alerts={alerts.map((a) => ({
        id: a.id,
        kind: a.type,
        title: a.type === "STORE_POINTS" ? a.store?.name ?? "" : `${a.account?.program.name} · ${a.account?.holder.name}`,
        text: a.type === "STORE_POINTS"
          ? `${a.program ? a.program.name : "Qualquer programa"} a partir de ${(a.threshold / 100).toLocaleString("pt-BR")} pts/R$`
          : `Saldo abaixo de ${a.threshold.toLocaleString("pt-BR")} pts`,
        triggered: !!a.lastTriggeredAt,
      }))}
      stores={stores}
      programs={programs.map((p) => ({ id: p.id, name: p.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: `${a.program.name} · ${a.holder.name}` }))}
    />
  );
}

async function Purchases({ userId }: { userId: string }) {
  const [items, stores, accounts] = await Promise.all([
    listPurchases(userId),
    prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { offers: { where: { programId: { not: null } }, orderBy: { pointsPerReal: "desc" }, take: 1 } } }),
    listAccounts(userId),
  ]);
  return (
    <PurchasesPanel
      stores={stores.map((s) => ({ id: s.id, name: s.name, bestPointsPerReal: s.offers[0] ? s.offers[0].pointsPerReal / 100 : null }))}
      accounts={accounts.map((a) => ({ id: a.id, label: `${a.program.name} ${a.holder.name}` }))}
      tagSuggestions={[...new Set(items.flatMap((p) => p.tags))].sort()}
      items={items.map((p) => ({
        id: p.id, store: p.storeName, description: p.description, account: `${p.account.program.name} ${p.account.holder.name}`, color: p.account.program.color,
        purchasedAt: p.purchasedAt.toISOString(), expectedAt: p.expectedAt?.toISOString() ?? null, expectedDeliveryAt: p.expectedDeliveryAt?.toISOString() ?? null,
        deliveredAt: p.deliveredAt?.toISOString() ?? null, amountCents: p.amountCents, extraCostCents: p.extraCostCents, pointsPerReal: p.pointsPerReal / 100,
        expectedPoints: p.expectedPoints, status: p.status, tags: p.tags, files: p._count.attachments,
      }))}
    />
  );
}

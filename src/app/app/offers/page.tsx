import Link from "next/link";
import type { PromotionKind } from "@prisma/client";
import { requirePageUser } from "@/server/session";
import { listPromotions, type PromotionSort } from "@/server/services/extras";
import { listAlerts } from "@/server/services/market";
import { listPrograms } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { PromotionGrid, PromotionAlerts, PromotionToolbar } from "./client";

const KINDS = ["TRANSFER_BONUS", "PURCHASE_BONUS", "CLUB", "SHOPPING", "OTHER"] as const;
const SORTS = ["ending", "recent", "bonus"] as const;

type Row = Awaited<ReturnType<typeof listPromotions>>[number];
const present = (now: number) => (p: Row) => ({
  id: p.id, kind: p.kind, title: p.title, description: p.description, bonusPercent: p.bonusPercent, url: p.url,
  from: p.fromProgram ? { name: p.fromProgram.name, color: p.fromProgram.color } : null,
  to: p.toProgram ? { name: p.toProgram.name, color: p.toProgram.color } : null,
  endsAt: p.endsAt.toISOString(),
  daysLeft: Math.max(0, Math.ceil((p.endsAt.getTime() + 86400_000 - now) / 86400_000) - 1),
});

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; categoria?: string; programa?: string; ordem?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  // "Histórico" virou a seção "Encerradas" da aba Ofertas; o endereço antigo continua abrindo a lista completa
  const tab = sp.tab === "historico" ? "historico" : sp.tab === "alertas" ? "alertas" : "ofertas";
  const kind = KINDS.find((k) => k === sp.categoria) as PromotionKind | undefined;
  const sort: PromotionSort = SORTS.find((s) => s === sp.ordem) ?? "ending";
  const filters = { q: sp.q, kind, programId: sp.programa || undefined };
  const programs = await listPrograms(false);
  const now = Date.now();
  if (tab === "alertas") {
    const alerts = await listAlerts(user.id);
    return (
      <>
        <PageHeader title="Promoções" subtitle="Bônus de transferência, compra de pontos, clubes e outras oportunidades" />
        <Tabs tab={tab} />
        <PromotionAlerts
          programs={programs.map((p) => ({ id: p.id, name: p.name }))}
          alerts={alerts.filter((a) => a.type === "PROMOTION").map((a) => ({ id: a.id, program: a.program?.name ?? "Qualquer programa", threshold: a.threshold }))}
        />
      </>
    );
  }
  const [active, ended] = await Promise.all([
    tab === "historico" ? Promise.resolve([]) : listPromotions({ ...filters, sort }),
    listPromotions({ ...filters, history: true, take: tab === "historico" ? 100 : 6 }),
  ]);
  return (
    <>
      <PageHeader title="Promoções" subtitle="Bônus de transferência, compra de pontos, clubes e outras oportunidades" />
      <Tabs tab={tab} />
      <PromotionToolbar q={sp.q ?? ""} kind={kind ?? ""} programId={sp.programa ?? ""} sort={sort} history={tab === "historico"} programs={programs.map((p) => ({ id: p.id, name: p.name }))} />
      {tab === "ofertas" && <PromotionGrid items={active.map(present(now))} history={false} />}
      {ended.length > 0 && (
        <section className="mt-8" aria-label="Encerradas">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Encerradas</h2>
            {tab === "ofertas" && ended.length >= 6 && <Link href="/app/offers?tab=historico" className="ml-auto text-sm text-accent-light hover:underline">Ver todas</Link>}
          </div>
          <div className="opacity-75"><PromotionGrid items={ended.map(present(now))} history /></div>
        </section>
      )}
      {tab === "historico" && ended.length === 0 && <PromotionGrid items={[]} history />}
    </>
  );
}

function Tabs({ tab }: { tab: string }) {
  return (
    <Segmented center active={tab === "historico" ? "ofertas" : tab} items={[
      { key: "ofertas", label: "Ofertas", href: "/app/offers" },
      { key: "alertas", label: "Alertas", href: "/app/offers?tab=alertas" },
    ]} />
  );
}

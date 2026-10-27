import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingBag, Store, Coins, ArrowLeftRight, Plane, BedDouble, HandCoins, Trophy, History } from "lucide-react";
import { requirePageUser, selectedHolderId } from "@/server/session";
import { listAccounts } from "@/server/services/wallet";
import { listSupplierAccounts } from "@/server/services/extras";
import { listSimulations, getSimulation } from "@/server/services/simulations";
import { PageHeader } from "@/components/stat";
import { KIND_LABELS, type SimulatorKind } from "@/domain/simulators";
import { SimulatorView } from "../client";
import { DeleteSimulation } from "../recent";

const ROUTES: Record<string, SimulatorKind> = {
  purchase: "bonificada",
  "purchase/bonificada": "bonificada",
  "purchase/store-comparison": "store-comparison",
  "purchase/pontos": "pontos",
  transfer: "transfer",
  flight: "flight",
  hotel: "hotel",
  sale: "sale",
  "supplier-ranking": "supplier-ranking",
};
const PATHS: Record<SimulatorKind, string> = {
  bonificada: "purchase/bonificada",
  "store-comparison": "purchase/store-comparison",
  pontos: "purchase/pontos",
  transfer: "transfer",
  flight: "flight",
  hotel: "hotel",
  sale: "sale",
  "supplier-ranking": "supplier-ranking",
};
const ICONS: Record<SimulatorKind, React.ElementType> = {
  bonificada: ShoppingBag, "store-comparison": Store, pontos: Coins, transfer: ArrowLeftRight, flight: Plane, hotel: BedDouble, sale: HandCoins, "supplier-ranking": Trophy,
};
const SUBTITLES: Record<SimulatorKind, string> = {
  bonificada: "Quanto custa cada milheiro ganho numa compra em loja parceira",
  "store-comparison": "Compare comprar numa loja que dá pontos ou numa que dá cashback",
  pontos: "CPM de uma compra de pontos e como fica o custo da conta",
  transfer: "Pontos que chegam e o custo no destino, com bônus, paridade e taxas",
  flight: "Custo real de uma passagem emitida com pontos",
  hotel: "Custo real de uma hospedagem paga com pontos",
  sale: "Lucro e margem de uma venda de emissão",
  "supplier-ranking": "Qual fornecedor sai mais barato para uma emissão",
};

export default async function SimulatorPage({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<{ sim?: string }> }) {
  const path = (await params).slug.join("/");
  const kind = ROUTES[path];
  if (!kind) notFound();
  const user = await requirePageUser();
  const holderId = await selectedHolderId(user.id);
  const simId = (await searchParams).sim;
  const [accounts, suppliers, recent, sim] = await Promise.all([
    listAccounts(user.id, holderId),
    listSupplierAccounts(user.id),
    listSimulations(user.id),
    simId ? getSimulation(user.id, simId) : null,
  ]);
  const initial = sim && sim.kind === kind ? (sim.input as Record<string, string | boolean>) : null;
  const item = (k: SimulatorKind) => {
    const Icon = ICONS[k];
    const on = k === kind;
    return (
      <Link key={k} href={`/app/simulators/${PATHS[k]}`} aria-current={on ? "page" : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-panel2 text-white" : "text-zinc-300 hover:bg-panel2/60"}`}>
        <Icon className="h-4 w-4 text-muted" />{KIND_LABELS[k]}
      </Link>
    );
  };

  return (
    <>
      <PageHeader title={KIND_LABELS[kind]} subtitle={SUBTITLES[kind]} />
      <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
        <aside className="mb-4 lg:mb-0">
          <nav aria-label="Simuladores" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            <p className="kicker hidden px-3 pb-1 pt-1 lg:block">Compras</p>
            {(["bonificada", "store-comparison", "pontos"] as const).map(item)}
            <div className="my-1 hidden border-t border-line lg:block" />
            {(["transfer", "flight", "hotel", "sale", "supplier-ranking"] as const).map(item)}
          </nav>
          {recent.length > 0 && (
            <div className="mt-4 hidden lg:block">
              <p className="kicker flex items-center gap-1.5 px-3 pb-1"><History className="h-3.5 w-3.5" />Recentes</p>
              <ul aria-label="Simulações recentes">
                {recent.map((r) => (
                  <li key={r.id} className={`group flex items-center rounded-lg ${r.id === simId ? "bg-panel2" : "hover:bg-panel2/60"}`}>
                    <Link href={`/app/simulators/${PATHS[r.kind as SimulatorKind] ?? "purchase/bonificada"}?sim=${r.id}`} className="min-w-0 flex-1 truncate px-3 py-1.5 text-sm text-zinc-300" title={r.title}>{r.title}</Link>
                    <DeleteSimulation id={r.id} title={r.title} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
        <SimulatorView
          key={`${kind}-${sim?.id ?? "novo"}`}
          kind={kind}
          simId={sim?.id ?? null}
          initial={initial}
          accounts={accounts.map((a) => ({ id: a.id, label: `${a.program.name} ${a.holder.name}`, programId: a.programId, program: a.program.name, balance: a.balance, costCents: a.costCents, marketCpm: a.program.marketValueCpmCents }))}
          suppliers={suppliers.map((s) => ({ id: s.id, supplier: s.supplier.name, identifier: s.identifier, programId: s.programId, program: s.program.name, balance: s.balance, priceCpmCents: s.priceCpmCents, cpfAvailable: s.cpfAvailable }))}
        />
      </div>
    </>
  );
}

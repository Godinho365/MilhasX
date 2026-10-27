import { prisma } from "@/server/db";
import { listPrograms } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { OfferForm, ImportPanel } from "./client";
import { SOURCES, PAGE_SOURCES, importStatus } from "@/server/services/store-import";

export default async function AdminOffers() {
  const [programs, offers, runs] = await Promise.all([
    listPrograms(false),
    prisma.storeOffer.findMany({ include: { store: true, program: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
    importStatus(),
  ]);
  return (
    <>
      <PageHeader title="Lojas e ofertas" />
      <ImportPanel
        programs={programs.map((p) => ({ id: p.id, name: p.name }))}
        sources={Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, url: s.url, last: runs.find((r) => r.source === key) ?? null }))}
        lastCsv={runs.find((r) => r.source === "csv") ?? null}
        pageSources={Object.entries(PAGE_SOURCES).map(([key, s]) => ({ key, label: s.label, url: s.url, last: runs.find((r) => r.source === key) ?? null }))}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <OfferForm programs={programs.map((p) => ({ id: p.id, name: p.name }))} />
        <div className="card overflow-x-auto lg:col-span-2">
          <table className="table-base">
            <thead><tr><th>Loja</th><th>Programa / portal</th><th className="text-right">Pts/R$</th><th className="text-right">Cashback</th><th>Fonte</th><th>Atualizado</th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>{o.store.name}</td><td className="text-muted">{o.program?.name ?? o.portal ?? "-"}</td>
                  <td className="text-right">{o.pointsPerReal ? `${o.upTo ? "até " : ""}${(o.pointsPerReal / 100).toLocaleString("pt-BR")}${o.perDollar ? " /US$" : ""}` : "-"}</td>
                  <td className="text-right">{o.cashbackBps ? `${(o.cashbackBps / 100).toLocaleString("pt-BR")}%` : "-"}</td>
                  <td className="text-muted">{o.source === "csv" ? "Planilha" : o.source ? (SOURCES[o.source as keyof typeof SOURCES]?.label ?? PAGE_SOURCES[o.source as keyof typeof PAGE_SOURCES]?.label ?? o.source) : "Manual"}</td>
                  <td className="text-muted">{o.updatedAt.toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

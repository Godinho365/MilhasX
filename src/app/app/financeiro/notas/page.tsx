import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { salesForInvoices } from "@/server/services/finance";
import { PageHeader } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { brDay } from "@/domain/brasilia";
import { addMonths } from "@/domain/finance";
import { InvoicesClient } from "./client";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : brDay().slice(0, 7);
  const filter = sp.filtro === "pendentes" || sp.filtro === "emitidas" ? sp.filtro : "todas";
  const href = (patch: Record<string, string>) => `/app/financeiro/notas?${new URLSearchParams({ mes: month, filtro: filter, ...patch })}`;
  const items = await salesForInvoices(user.id, month, filter);
  return (
    <>
      <PageHeader title="Notas Fiscais" subtitle="Notas de serviço das vendas: o valor do serviço é o lucro da venda">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1">
          <Link href={href({ mes: addMonths(month, -1) })} className="btn-subtle h-9 w-9 px-0" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[130px] text-center text-sm font-semibold first-letter:uppercase">{`${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`}</span>
          <Link href={href({ mes: addMonths(month, 1) })} className="btn-subtle h-9 w-9 px-0" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </PageHeader>
      <Segmented active={filter} items={[["todas", "Todas"], ["pendentes", "Sem nota"], ["emitidas", "Com nota"]].map(([k, l]) => ({ key: k!, label: l!, href: href({ filtro: k! }) }))} />
      <InvoicesClient items={items} />
    </>
  );
}

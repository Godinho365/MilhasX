import Link from "next/link";
import { TrendingUp, KeyRound, BarChart3 } from "lucide-react";
import { requirePageUser } from "@/server/session";

// Tráfego: resultado dos anúncios do Meta (Facebook/Instagram) dentro do app, só leitura.
// Depende de um app de desenvolvedor no Meta aprovado para ler dados de anúncios; até lá a tela
// explica o que falta.
export default async function TrafegoPage() {
  await requirePageUser();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel2 text-muted"><TrendingUp className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tráfego</h1>
          <p className="text-sm text-muted">Resultado dos seus anúncios do Meta (Facebook e Instagram) ao lado dos pedidos e vendas.</p>
        </div>
      </div>
      <section className="card card-pad space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-muted" />Falta conectar o Meta</h2>
        <p className="text-sm text-muted">Para ler os anúncios é preciso um app de desenvolvedor no Meta com permissão de leitura de anúncios aprovada, e depois conectar a sua conta de anúncios por aqui. Só leitura: nada é publicado nem alterado nos anúncios.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Investimento, alcance e cliques por campanha, conjunto e anúncio.</li>
          <li>Conversas e pedidos que cada anúncio trouxe, lado a lado com o investimento.</li>
          <li>Filtro por hoje, ontem, 7 dias, 30 dias ou período escolhido.</li>
        </ul>
      </section>
      <section className="card card-pad"><p className="flex items-center gap-2 font-medium"><BarChart3 className="h-4 w-4 text-muted" />Enquanto isso</p><p className="mt-1 text-sm text-muted">Os pedidos que chegam pela sua página aparecem no <Link href="/app/crm" className="text-accent-light hover:underline">CRM</Link> com a origem “Página pública”.</p></section>
    </div>
  );
}

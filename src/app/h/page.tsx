import { cookies } from "next/headers";
import { holderView, HOLDER_COOKIE } from "@/server/services/holder-access";
import { appName, publicBrand } from "@/server/session";
import { ownerBranding } from "@/server/services/client-pages";
import { PageShell } from "@/app/p/[slug]/central";
import { bannerUrl } from "@/domain/page-design";
import { GestaoMilhasView } from "@/app/p/[slug]/pages";
import { fmtPts, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Página do titular", robots: { index: false } };

// Página só de leitura que o titular abre pelo link recebido por e-mail
export default async function HolderPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const view = await holderView((await cookies()).get(HOLDER_COOKIE)?.value);
  const invalid = (await searchParams).link === "invalido";
  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <div className="card card-pad w-full space-y-2 text-center">
          <h1 className="text-lg font-semibold">{invalid ? "Link inválido ou expirado" : "Acesso encerrado"}</h1>
          <p className="text-sm text-muted">{invalid ? "Este link já foi usado ou passou da validade. " : ""}Peça a quem gerencia suas contas um novo link de acesso.</p>
        </div>
      </main>
    );
  }
  // "Gestão de Milhas": mesma personalização (cor, banner, textos) da página Sua MilhasX do gestor
  const b = await ownerBranding(view.ownerId);
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={b.slug ? bannerUrl(b.slug, b.bannerVersion) : null}>
      <div className="mb-2 flex justify-end">
        <form action="/api/holder-access/logout" method="post"><button className="btn-ghost h-9">Sair</button></form>
      </div>
      <GestaoMilhasView design={b.design.gestaoMilhas} data={{ holderName: view.holder, accounts: view.accounts }} />
      <div className="mt-4">
        <section className="card overflow-hidden" aria-label="Últimas movimentações">
          <h2 className="border-b border-line px-5 py-3 font-semibold">Últimas movimentações</h2>
          {view.entries.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Sem movimentações.</p> : (
            <ul className="divide-y divide-line text-sm">
              {view.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-20 shrink-0 text-muted">{fmtDate(e.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.label} · {e.program}{e.pending && <span className="ml-1.5 text-xs text-amber-300">(a receber)</span>}</span>
                  <span className={`tabular-nums ${e.points < 0 ? "text-red-300" : "text-green-300"}`}>{e.points > 0 ? "+" : ""}{fmtPts(e.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="mt-6 text-center text-xs text-muted">Acesso válido até {new Date(view.sessionExpiresAt).toLocaleDateString("pt-BR")}. Somente leitura.</p>
    </PageShell>
  );
}

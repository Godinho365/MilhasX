import { cookies } from "next/headers";
import { holderView, HOLDER_COOKIE } from "@/server/services/holder-access";
import { appName } from "@/server/session";
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
  const total = view.accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="kicker">{appName()} · Página do titular</p>
          <h1 className="text-2xl font-semibold">{view.holder}</h1>
        </div>
        <form action="/api/holder-access/logout" method="post"><button className="btn-ghost h-9">Sair</button></form>
      </div>
      <section className="card card-pad mb-4">
        <p className="kicker">Saldo total</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{fmtPts(total)} pts</p>
      </section>
      <section className="card mb-4 overflow-hidden" aria-label="Contas">
        <h2 className="border-b border-line px-5 py-3 font-semibold">Contas</h2>
        {view.accounts.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nenhuma conta cadastrada.</p> : (
          <ul className="divide-y divide-line">
            {view.accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                <span className="flex-1 font-medium">{a.program}</span>
                <span className="tabular-nums">{fmtPts(a.balance)} pts</span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
      <p className="mt-6 text-center text-xs text-muted">Acesso válido até {new Date(view.sessionExpiresAt).toLocaleDateString("pt-BR")}. Somente leitura.</p>
    </main>
  );
}

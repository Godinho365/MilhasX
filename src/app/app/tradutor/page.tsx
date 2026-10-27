import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { translateRoute, quotedRoutes } from "@/server/services/flight-quotes";
import { PageHeader } from "@/components/stat";
import { fmtBRL, fmtDate } from "@/lib/format";
import { AIRPORTS } from "@/domain/airports";
import { CABIN_LABELS, type Cabin } from "@/domain/flight-search";
import { TranslatorForm } from "./client";

const city = (c: string) => AIRPORTS.find((a) => a.code === c)?.city ?? c;
const CABINS = Object.keys(CABIN_LABELS) as Cabin[];

export default async function TradutorPage({ searchParams }: { searchParams: Promise<{ de?: string; para?: string; tipo?: string; classe?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const origin = /^[A-Z]{3}$/.test(sp.de ?? "") ? sp.de! : "";
  const destination = /^[A-Z]{3}$/.test(sp.para ?? "") ? sp.para! : "";
  const roundTrip = sp.tipo !== "so-ida";
  const cabin = CABINS.find((c) => c === sp.classe) ?? "ECONOMY";
  const [result, routes] = await Promise.all([
    origin && destination ? translateRoute(user.id, { origin, destination, roundTrip, cabin }) : Promise.resolve(null),
    quotedRoutes(user.id),
  ]);
  return (
    <>
      <PageHeader title="Tradutor de milhas" subtitle="Quantas milhas uma viagem costuma custar em cada programa, conforme a antecedência da compra, a partir das cotações que você anotou." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <TranslatorForm origin={origin} destination={destination} roundTrip={roundTrip} cabin={cabin} />
          {result && (
            <section className="space-y-3" aria-label="Resultado da análise">
              <h2 className="text-lg font-semibold">{city(origin)} ({origin}) → {city(destination)} ({destination}) <span className="text-sm font-normal text-muted">· {roundTrip ? "ida e volta" : "só ida"} · {CABIN_LABELS[cabin]}</span></h2>
              {result.programs.length === 0 ? (
                <div className="card card-pad text-sm text-muted">
                  Ainda não há cotações anotadas para este trecho. Pesquise no <Link href="/app/buscador" className="text-accent-light hover:underline">Buscador</Link> e use “Comparar cotações” para anotar o que encontrar; a análise aparece aqui.
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted">Com base em {result.samples} {result.samples === 1 ? "cotação anotada" : "cotações anotadas"}. Valores por adulto; “típico” é a mediana.</p>
                  {result.programs.map((p, i) => (
                    <article key={p.key} className="card card-pad" aria-label={`Programa ${p.label}`}>
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">{p.label}{i === 0 && <span className="ml-2 rounded bg-green-500/15 px-1.5 text-xs font-medium text-green-300">mais barato</span>}</h3>
                          <p className="text-xs text-muted">{p.samples} {p.samples === 1 ? "cotação" : "cotações"} · última em {fmtDate(p.lastAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold tabular-nums">{p.typical.toLocaleString("pt-BR")} <span className="text-sm font-normal text-muted">milhas</span></p>
                          <p className="text-xs text-muted">de {p.min.toLocaleString("pt-BR")} a {p.max.toLocaleString("pt-BR")}{p.taxesCents != null ? ` · + ${fmtBRL(p.taxesCents)} de taxas` : ""}</p>
                          {p.marketCents != null && <p className="text-xs text-muted">≈ {fmtBRL(p.marketCents)} em milhas (valor de mercado)</p>}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-5 gap-1.5 text-center" role="table" aria-label={`Antecedência em ${p.label}`}>
                        {p.byLead.map((b) => (
                          <div key={b.key} role="cell" className={`rounded-lg px-1 py-2 ${b.typical == null ? "bg-panel2/40 text-muted" : "bg-panel2"}`}>
                            <p className="text-[11px] text-muted">{b.label}</p>
                            <p className="text-sm font-semibold tabular-nums">{b.typical == null ? "—" : b.typical.toLocaleString("pt-BR")}</p>
                            <p className="text-[10px] text-muted">{b.samples ? `${b.samples} cot.` : "sem dados"}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </>
              )}
            </section>
          )}
        </div>
        <aside className="card card-pad h-fit" aria-label="Trechos com cotações">
          <h2 className="mb-2 font-semibold">Trechos com cotações</h2>
          {routes.length === 0 ? <p className="text-sm text-muted">Nenhuma cotação anotada ainda.</p> : (
            <ul className="space-y-1">
              {routes.map((r) => (
                <li key={`${r.origin}-${r.destination}-${r.cabin}`}>
                  <Link href={`/app/tradutor?de=${r.origin}&para=${r.destination}&classe=${r.cabin}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
                    <span>{r.origin} → {r.destination} <span className="text-xs text-muted">{CABIN_LABELS[r.cabin as Cabin] ?? r.cabin}</span></span>
                    <span className="text-xs text-muted">{r.samples}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

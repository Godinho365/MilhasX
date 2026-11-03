// Card de pacote da Vitrine: o mesmo no app e na página pública.
import { fmtBRL } from "@/lib/format";

type Pkg = { title: string; destination: string; period: string | null; includes: string[]; priceCents: number | null; priceNote: string | null; installments: string | null };

/** Card do pacote, igual ao que o cliente vê na vitrine pública. */
export function PackageCard({ it, img, children }: { it: Pkg; img: string | null; children?: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
      <div className="relative aspect-[16/10] bg-gradient-to-br from-sky-600 via-indigo-600 to-fuchsia-600">
        {img && <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur" style={{ color: "#fff" }}>{it.destination || "Destino"}</span>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="font-semibold leading-snug">{it.title || "Título do pacote"}</h3>
        {it.period && <p className="text-xs text-muted">{it.period}</p>}
        {it.includes.length > 0 && <div className="flex flex-wrap gap-1">{it.includes.map((x) => <span key={x} className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">{x}</span>)}</div>}
        {it.priceCents != null && (
          <p className="pt-1"><span className="block text-[11px] uppercase tracking-wide text-muted">a partir de</span><span className="text-xl font-bold tabular-nums">{fmtBRL(it.priceCents)}</span>{it.priceNote && <span className="ml-1 text-xs text-muted">{it.priceNote}</span>}{it.installments && <span className="block text-xs text-muted">{it.installments}</span>}</p>
        )}
        {children}
      </div>
    </article>
  );
}


// Peças do painel da administração (sem estado: rodam no servidor).
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Minus } from "lucide-react";

type Delta = { pct: number | null; dir: "up" | "down" | "flat" };

/** Variação contra o período anterior. `inverse` quando subir é ruim (churn, falhas). */
export function DeltaBadge({ d, inverse = false, title = "em relação ao período anterior" }: { d: Delta; inverse?: boolean; title?: string }) {
  if (d.dir === "flat") return <span className="inline-flex items-center gap-0.5 rounded-full bg-panel2 px-1.5 py-0.5 text-[11px] font-medium text-muted" title={title}><Minus className="h-3 w-3" />0%</span>;
  const good = (d.dir === "up") !== inverse;
  const Icon = d.dir === "up" ? ArrowUpRight : ArrowDownRight;
  const text = d.pct === null ? "novo" : `${d.pct > 0 ? "+" : ""}${d.pct.toLocaleString("pt-BR")}%`;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${good ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`} title={title}>
      <Icon className="h-3 w-3" />{text}
    </span>
  );
}

export function Kpi({ label, value, hint, delta, inverse, icon, href, tone }: { label: string; value: string; hint?: React.ReactNode; delta?: Delta; inverse?: boolean; icon?: React.ReactNode; href?: string; tone?: "hl" | "warn" }) {
  const hl = tone === "hl";
  const body = (
    <>
      <div className={`flex items-center justify-between gap-2 text-[13px] font-medium ${hl ? "text-[#C7D2E3]" : "text-muted"}`}>
        <span>{label}</span>
        {icon && <span className={hl ? "text-[#C7D2E3]" : "text-zinc-500"}>{icon}</span>}
      </div>
      <div className="mb-0.5 mt-2 flex flex-wrap items-baseline gap-2">
        <p className={`text-2xl font-bold tabular-nums tracking-tight ${hl ? "text-[rgb(var(--gold))]" : ""}`}>{value}</p>
        {delta && <DeltaBadge d={delta} inverse={inverse} />}
      </div>
      {hint && <p className={`text-xs ${hl ? "text-[#C7D2E3]" : "text-muted"}`}>{hint}</p>}
    </>
  );
  const cls = `block rounded-card border px-[18px] py-4 shadow-[0_1px_2px_rgb(15_27_45/0.04)] ${hl ? "border-0 bg-gradient-to-br from-[#102A50] to-[#1B3B6F]" : tone === "warn" ? "border-[#E6A51C88] bg-[#FFFBEF]" : "border-line bg-panel"}`;
  return href ? <Link href={href} className={`${cls} transition hover:-translate-y-px hover:shadow-[0_6px_18px_rgb(15_27_45/0.07)]`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Cartão da Central de pendências: título com ícone, contador e algumas linhas com "Ver tudo". */
export function PendCard({ title, icon, href, total, empty, children }: { title: string; icon: React.ReactNode; href: string; total: number; empty: string; children?: React.ReactNode }) {
  return (
    <section className="card flex flex-col p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#E6A51C1A] text-[#B7800F]">{icon}</span>
        <b className="text-sm">{title}</b>
        <span className={`ml-auto min-w-[26px] rounded-full px-2 py-0.5 text-center text-xs font-bold ${total ? "bg-[rgb(var(--brand))] text-white" : "bg-panel2 text-muted"}`}>{total}</span>
      </div>
      <div className="flex-1">
        {total ? children : <p className="flex items-center gap-2 py-3.5 text-[13px] text-muted"><CheckCircle2 className="h-4 w-4 text-green-400" />{empty}</p>}
      </div>
      <Link href={href} className="mt-2.5 inline-flex items-center gap-1 border-t border-line pt-2.5 text-[13px] font-semibold text-[rgb(var(--brand))] hover:text-[rgb(var(--gold))]">Ver tudo <ArrowRight className="h-3.5 w-3.5" /></Link>
    </section>
  );
}

export function PendRow({ href, title, meta, bad }: { href: string; title: string; meta: string; bad?: boolean }) {
  return (
    <Link href={href} className="flex justify-between gap-2.5 border-t border-line py-2 text-[13.5px] first:border-t-0 hover:text-[rgb(var(--brand))]">
      <span className="truncate">{title}</span><small className={`whitespace-nowrap ${bad ? "font-semibold text-red-400" : "text-muted"}`}>{meta}</small>
    </Link>
  );
}

export function Section({ title, subtitle, children, action, id }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-7 scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card card-pad ${className}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Pill({ tone = "zinc", children }: { tone?: "zinc" | "green" | "red" | "amber" | "blue"; children: React.ReactNode }) {
  const cls = { zinc: "bg-panel2 text-zinc-300", green: "bg-green-500/15 text-green-300", red: "bg-red-500/15 text-red-300", amber: "bg-amber-500/15 text-amber-300", blue: "bg-blue-500/15 text-blue-300" }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

/** Abas de filtro em forma de pílula, com contador opcional. */
export function Chips({ items, active }: { items: { key: string; label: string; href: string; n?: number }[]; active: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
      {items.map((i) => (
        <Link key={i.key} href={i.href} role="tab" aria-selected={active === i.key}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active === i.key ? "border-[rgb(var(--brand))] bg-[rgb(var(--brand))] text-[#fff]" : "border-line bg-panel text-muted hover:text-zinc-100"}`}>
          {i.label}{i.n !== undefined && <span className={`tabular-nums ${active === i.key ? "text-[#C7D2E3]" : "text-zinc-500"}`}>{i.n}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Tabela dentro de cartão, com estado vazio. */
export function TableCard({ head, children, empty, colSpan, minW = 640 }: { head: React.ReactNode; children: React.ReactNode; empty?: string | false; colSpan: number; minW?: number }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table-base" style={{ minWidth: minW }}>
        <thead><tr>{head}</tr></thead>
        <tbody>
          {children}
          {empty && <tr><td colSpan={colSpan} className="py-10 text-center text-sm text-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

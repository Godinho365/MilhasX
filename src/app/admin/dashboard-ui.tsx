// Peças do painel da administração (sem estado: rodam no servidor).
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

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

export function Kpi({ label, value, hint, delta, inverse, icon, href }: { label: string; value: string; hint?: React.ReactNode; delta?: Delta; inverse?: boolean; icon?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-panel2 text-muted">{icon}</span>}
        <p className="kicker">{label}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {delta && <DeltaBadge d={delta} inverse={inverse} />}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  return href ? <Link href={href} className="card card-pad block transition-colors hover:border-zinc-600">{body}</Link> : <div className="card card-pad">{body}</div>;
}

export function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
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

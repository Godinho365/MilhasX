import { colorFor } from "@/lib/colors";

export function Stat({ label, value, hint, accent, icon }: { label: string; value: string; hint?: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center gap-2">
        <p className="kicker">{label}</p>
        {icon && <span className="ml-auto text-muted">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px] ${accent ? "text-accent-light" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const c = colorFor(name);
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dim}`} style={{ backgroundColor: `${c}26`, color: c }} aria-hidden>
      {ini}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function ProgramDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />;
}

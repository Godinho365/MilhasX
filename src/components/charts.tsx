"use client";
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";
import { seriesColor } from "@/lib/colors";
import { SegmentedButtons } from "./ui";

const nf = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const tooltipStyle = { background: "rgb(var(--panel2))", border: "1px solid rgb(var(--line))", borderRadius: 12, fontSize: 12, color: "rgb(var(--zinc-50))" };
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function HolderEvolution({ holders, points, costs }: { holders: { id: string; name: string }[]; points: Record<string, number | string>[]; costs: Record<string, number | string>[] }) {
  const [metric, setMetric] = useState<"points" | "cost">("points");
  const data = metric === "points" ? points : costs;
  const fmt = (v: number) => (metric === "points" ? `${nf.format(v)} pts` : brl.format(v / 100));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-lg font-semibold">Evolução por titular</h2>
          <p className="text-sm text-muted">{metric === "points" ? "Saldo em pontos" : "Custo de aquisição"} de cada titular nos últimos 3 meses</p>
        </div>
        <SegmentedButtons items={[{ key: "points", label: "Saldo" }, { key: "cost", label: "Custo" }]} value={metric} onChange={setMetric} />
      </div>
      {data.length === 0 ? <p className="py-10 text-center text-sm text-muted">Sem lançamentos no período.</p> : (
        <div className="h-72 w-full" role="img" aria-label="Gráfico da evolução por titular">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                {holders.map((h, i) => (
                  <linearGradient key={h.id} id={`g-${h.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={seriesColor(i)} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={seriesColor(i)} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={ddmm} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v: number) => (metric === "points" ? nf.format(v) : brl.format(v / 100))} width={metric === "points" ? 64 : 84} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => ddmm(String(d))} formatter={(v: number, k) => [fmt(v), holders.find((h) => h.id === k)?.name ?? k]} />
              <Legend formatter={(k: string) => <span className="text-xs text-zinc-300">{holders.find((h) => h.id === k)?.name ?? k}</span>} iconType="circle" iconSize={8} />
              {holders.map((h, i) => (
                <Area key={h.id} type="stepAfter" dataKey={h.id} stroke={seriesColor(i)} fill={`url(#g-${h.id})`} strokeWidth={2} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

export function HBar({ data, unit = "pts" }: { data: { name: string; value: number; color?: string }[]; unit?: string }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted">Sem dados no período.</p>;
  return (
    <div className="chart-strong w-full" style={{ height: Math.max(120, data.length * 38) }} role="img" aria-label="Gráfico de barras">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={150} tick={{ fill: "#d4d4d8", fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#18181b" }} contentStyle={tooltipStyle} formatter={(v: number) => [`${nf.format(v)} ${unit}`, ""]} />
          <Bar dataKey="value" fill="#60a5fa" radius={[0, 6, 6, 0]} isAnimationActive={false} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TotalEvolution({ data }: { data: { date: string; balance: number }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted">Sem lançamentos no período.</p>;
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico da evolução do saldo total">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="g-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={ddmm} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v: number) => nf.format(v)} width={64} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => ddmm(String(d))} formatter={(v: number) => [`${nf.format(v)} pts`, "Saldo"]} />
          <Area type="stepAfter" dataKey="balance" stroke="#60a5fa" fill="url(#g-total)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function MonthlySales({ data }: { data: { month: string; revenue: number; profit: number }[] }) {
  const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
  return (
    <div className="h-72 w-full" role="img" aria-label="Gráfico de faturamento e lucro por mês">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="month" tickFormatter={label} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => brl.format(v / 100)} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={84} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#18181b" }} contentStyle={tooltipStyle} labelFormatter={(m) => label(String(m))} formatter={(v: number, k) => [brl.format(v / 100), k === "revenue" ? "Faturamento" : "Lucro"]} />
          <Legend formatter={(k: string) => <span className="text-xs text-zinc-300">{k === "revenue" ? "Faturamento" : "Lucro"}</span>} iconType="circle" iconSize={8} />
          <Bar dataKey="revenue" fill="#60a5fa" radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={28} />
          <Bar dataKey="profit" fill="#4ade80" radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CreditsDebits({ data }: { data: { month: string; credits: number; debits: number }[] }) {
  const label = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`;
  if (data.every((d) => !d.credits && !d.debits)) return <p className="py-10 text-center text-sm text-muted">Sem lançamentos no período.</p>;
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de créditos e débitos por mês">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="month" tickFormatter={label} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => nf.format(v)} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={64} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgb(var(--panel2))" }} contentStyle={tooltipStyle} labelFormatter={(m) => label(String(m))} formatter={(v: number, k) => [`${nf.format(v)} pts`, k === "credits" ? "Créditos" : "Débitos"]} />
          <Bar dataKey="credits" fill="#22c55e" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={36} />
          <Bar dataKey="debits" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT_COLORS = ["#2563eb", "#16a34a", "#f97316", "#db2777", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5", "#059669"];

/** Rosca com rótulo de % nas fatias maiores e legenda embaixo (como os relatórios da referência). */
export function Donut({ data, unit = "pts", money = false, label }: { data: { name: string; value: number; color?: string }[]; unit?: string; money?: boolean; label: string }) {
  const total = data.reduce((t, d) => t + d.value, 0);
  if (total <= 0) return <p className="py-16 text-center text-sm text-muted">Sem dados no período.</p>;
  const fmt = (v: number) => (money ? brl.format(v / 100) : `${nf.format(v)} ${unit}`);
  const colored = data.map((d, i) => ({ ...d, color: d.color ?? DONUT_COLORS[i % DONUT_COLORS.length]! }));
  const pct = (v: number) => `${((v / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label={label}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={1}
              stroke="rgb(var(--panel))"
              strokeWidth={2}
              isAnimationActive={false}
              labelLine={{ stroke: "#a1a1aa" }}
              label={({ value }: { value: number }) => (value / total >= 0.05 ? pct(value) : "")}
            >
              {colored.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [`${fmt(v)} (${pct(v)})`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-zinc-300">
        {colored.map((d) => (
          <li key={d.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />{d.name}</li>
        ))}
      </ul>
    </div>
  );
}

const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Barras mensais de uma série em reais. */
export function MonthlyMoney({ data, dataKey, name, color = "#60a5fa" }: { data: Record<string, number | string>[]; dataKey: string; name: string; color?: string }) {
  if (data.every((d) => !Number(d[dataKey]))) return <p className="py-16 text-center text-sm text-muted">Sem dados no período.</p>;
  return (
    <div className="h-64 w-full" role="img" aria-label={`Gráfico de ${name.toLowerCase()} por mês`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => brl.format(v / 100)} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={84} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgb(var(--panel2))" }} contentStyle={tooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: number) => [brl.format(v / 100), name]} />
          <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Saldo de cada programa ao fim de cada mês (áreas empilhadas). */
export function ProgramEvolution({ programs, data }: { programs: { id: string; name: string; color: string }[]; data: Record<string, number | string>[] }) {
  if (data.length === 0 || programs.length === 0) return <p className="py-16 text-center text-sm text-muted">Sem lançamentos no período.</p>;
  return (
    <div className="h-80 w-full" role="img" aria-label="Gráfico da evolução do saldo por programa">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => nf.format(v)} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={72} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: number, id) => [`${nf.format(v)} pts`, programs.find((p) => p.id === id)?.name ?? id]} />
          <Legend formatter={(id: string) => <span className="text-xs text-zinc-300">{programs.find((p) => p.id === id)?.name ?? id}</span>} iconType="circle" iconSize={8} />
          {programs.map((p) => <Area key={p.id} type="monotone" dataKey={p.id} stackId="1" stroke={p.color} fill={p.color} fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const SERIES = ["#2563eb", "#16a34a", "#f97316", "#db2777", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5", "#059669"];

/** Uma linha por série ao fim de cada mês (saldo em pontos ou CPM em reais). */
export function SeriesLines({ series, data, money = false, label }: { series: { id: string; name: string; color?: string }[]; data: Record<string, number | string>[]; money?: boolean; label: string }) {
  if (data.length === 0 || series.length === 0) return <p className="py-16 text-center text-sm text-muted">Sem dados para o período selecionado.</p>;
  const fmt = (v: number) => (money ? brl.format(v / 100) : `${nf.format(v)} pts`);
  return (
    <div className="h-80 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => (money ? brl.format(v / 100) : nf.format(v))} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={money ? 84 : 72} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: number, id) => [fmt(v), series.find((s) => s.id === id)?.name ?? id]} />
          <Legend formatter={(id: string) => <span className="text-xs text-zinc-300">{series.find((s) => s.id === id)?.name ?? id}</span>} iconType="circle" iconSize={8} />
          {series.map((s, i) => <Area key={s.id} type="monotone" dataKey={s.id} stroke={SERIES[i % SERIES.length]} fill="transparent" strokeWidth={2} isAnimationActive={false} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras empilhadas por mês, uma cor por categoria. */
export function StackedMonthly({ series, data, label, empty }: { series: { name: string; value: number }[]; data: Record<string, number | string>[]; label: string; empty: string }) {
  if (series.length === 0) return <p className="py-16 text-center text-sm text-muted">{empty}</p>;
  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label={label}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v: number) => nf.format(v)} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={64} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "rgb(var(--panel2))" }} contentStyle={tooltipStyle} labelFormatter={(m) => monthLabel(String(m))} formatter={(v: number, k) => [`${nf.format(v)} pts`, k]} />
            {series.map((s, i) => <Bar key={s.name} dataKey={s.name} stackId="a" fill={SERIES[i % SERIES.length]} isAnimationActive={false} maxBarSize={36} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {series.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SERIES[i % SERIES.length] }} aria-hidden /><span className="flex-1 truncate">{s.name}</span><span className="tabular-nums text-muted">{nf.format(s.value)} pts</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Pontos previstos × recebidos de cada fatura. */
export function ExpectedVsReceived({ data }: { data: { label: string; expected: number; received: number }[] }) {
  if (data.length === 0) return <p className="py-16 text-center text-sm text-muted">Sem faturas no período.</p>;
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de pontos previstos e recebidos por fatura">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => nf.format(v)} tick={{ fill: "#a1a1aa", fontSize: 11 }} width={64} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgb(var(--panel2))" }} contentStyle={tooltipStyle} formatter={(v: number, k) => [`${nf.format(v)} pts`, k === "expected" ? "Previstos" : "Recebidos"]} />
          <Legend formatter={(k: string) => <span className="text-xs text-zinc-300">{k === "expected" ? "Previstos" : "Recebidos"}</span>} iconType="circle" iconSize={8} />
          <Bar dataKey="expected" fill="#60a5fa" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28} />
          <Bar dataKey="received" fill="#22c55e" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Paridade de cada programa por dia (histórico da loja). */
export function DailyParity({ data }: { data: { day: string; program: string; value: number; max: number }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted">Ainda sem histórico: ele começa na primeira leitura da fonte.</p>;
  const programs = [...new Set(data.map((d) => d.program))];
  const days = [...new Set(data.map((d) => d.day))].sort();
  const rows = days.map((day) => Object.fromEntries([["day", day], ...programs.map((p) => [p, data.find((d) => d.day === day && d.program === p)?.max ?? null])]));
  return (
    <div className="h-56 w-full" role="img" aria-label="Gráfico do histórico de pontos por real">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="day" tickFormatter={ddmm} tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} width={36} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => ddmm(String(d))} formatter={(v: number, k) => [`${nf.format(v)} pts (máx. do dia)`, k]} />
          <Legend iconType="circle" iconSize={8} formatter={(k: string) => <span className="text-xs text-zinc-300">{k}</span>} />
          {programs.map((p, i) => <Area key={p} type="stepAfter" dataKey={p} stroke={SERIES[i % SERIES.length]} fill="transparent" strokeWidth={2} connectNulls isAnimationActive={false} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

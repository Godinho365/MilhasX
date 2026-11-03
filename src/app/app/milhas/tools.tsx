"use client";
// Sugerir Conta (melhor conta para uma emissão) e Sugestor de Compra (quanto comprar para usar todos os CPFs livres).
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, AlertTriangle } from "lucide-react";
import { Field } from "@/components/ui";
import { toast } from "@/components/feedback";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { emissionFit, rankForEmission, purchaseLine, type AccountLoad } from "@/domain/capacity";

export type CapacityRow = { id: string; label: string; program: string; programCode: string; holder: string; cpfUsed: number; cpfLimit: number; load: AccountLoad; costCpmCents: number | null };

const pts = (v: string) => Number(v.replace(/\D/g, "")) || 0;
const cents = (v: string) => (v.trim() ? parseBRLToCents(v) : null);

function ProgramSelect({ rows, value, onChange }: { rows: CapacityRow[]; value: string; onChange: (v: string) => void }) {
  const programs = [...new Map(rows.map((r) => [r.programCode, r.program])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <Field label="Programa" required>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Programa">
        {programs.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </Field>
  );
}

function NoAccounts() {
  return (
    <div className="card card-pad text-sm text-muted">
      Nenhuma conta com limite de CPFs. Defina o limite na página de cada conta (Limite de beneficiários) para ver as sugestões.{" "}
      <Link href="/app/programs" className="font-medium text-accent-light hover:underline">Ir para as contas</Link>
    </div>
  );
}

/* ---------------- Sugerir Conta ---------------- */

export function SuggestAccount({ rows, avgPtsPerCpf }: { rows: CapacityRow[]; avgPtsPerCpf: number }) {
  const [program, setProgram] = useState(rows[0]?.programCode ?? "");
  const [perCpf, setPerCpf] = useState("");
  const [cpfs, setCpfs] = useState("1");
  const points = pts(perCpf) * Math.max(1, pts(cpfs));
  const n = Math.max(1, pts(cpfs));
  const list = useMemo(() => {
    const inProgram = rows.filter((r) => r.programCode === program).map((r) => ({ ...r, fit: emissionFit(r.load, points, n) }));
    return points > 0 ? rankForEmission(inProgram, points, n) : [];
  }, [rows, program, points, n]);
  if (!rows.length) return <NoAccounts />;
  return (
    <div className="space-y-4">
      <div className="card card-pad grid gap-3 sm:grid-cols-3">
        <ProgramSelect rows={rows} value={program} onChange={setProgram} />
        <Field label="Milhas por CPF" required hint={`Sua média: ${fmtPts(avgPtsPerCpf)}`}><input className="input" inputMode="numeric" value={perCpf} onChange={(e) => setPerCpf(e.target.value)} placeholder="Ex.: 35.000" aria-label="Milhas por CPF" /></Field>
        <Field label="CPFs (passageiros)" required><input className="input" inputMode="numeric" value={cpfs} onChange={(e) => setCpfs(e.target.value)} aria-label="CPFs" /></Field>
      </div>
      {points === 0 ? <p className="card card-pad text-sm text-muted">Informe as milhas por CPF para ver as sugestões.</p> : (
        <section className="card overflow-hidden" aria-label="Contas sugeridas">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Emissão de {fmtPts(points)} milhas em {n} {n === 1 ? "CPF" : "CPFs"} · {list.length} {list.length === 1 ? "conta" : "contas"}</h2>
          <ol className="divide-y divide-line">
            {list.map((r, i) => {
              const ok = r.fit.enough && !r.fit.cpfShort;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok && i === 0 ? "bg-accent-light text-zinc-950" : "bg-panel2 text-muted"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/programs/${r.id}`} className="truncate font-semibold hover:underline">{r.label}</Link>
                    <p className="text-xs text-muted">Saldo livre {fmtPts(r.load.balance - r.load.reserved)} · {r.load.cpfFree} de {r.cpfLimit} CPFs livres{r.costCpmCents ? ` · milheiro ${fmtBRL(r.costCpmCents)}` : ""}</p>
                  </div>
                  <div className="text-right text-xs">
                    {ok ? <p className="flex items-center justify-end gap-1 font-medium text-emerald-300"><Check className="h-3.5 w-3.5" />Dá para emitir</p>
                      : !r.fit.enough ? <p className="font-medium text-amber-300">Faltam {fmtPts(-r.fit.balanceAfter)} milhas</p>
                      : <p className="font-medium text-amber-300">Faltam {-r.fit.cpfAfter} {r.fit.cpfAfter === -1 ? "CPF" : "CPFs"}</p>}
                    {ok && <p className="text-muted">Depois: {fmtPts(r.fit.balanceAfter)} milhas · {r.fit.cpfAfter} CPFs</p>}
                    {ok && r.fit.excessAfter > 0 && <p className="flex items-center justify-end gap-1 text-amber-300"><AlertTriangle className="h-3 w-3" />{fmtPts(r.fit.excessAfter)} milhas sem CPF</p>}
                  </div>
                </li>
              );
            })}
            {list.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nenhuma conta com limite de CPFs neste programa.</li>}
          </ol>
        </section>
      )}
      <p className="text-xs text-muted">Ordem: primeiro as contas que têm saldo e CPFs para a emissão; emissão com mais milhas que a média vai para a conta com milhas sobrando, e a mais leve para a conta com CPFs sobrando. As milhas já reservadas em negociações abertas do CRM Milhas não contam como saldo livre.</p>
    </div>
  );
}

/* ---------------- Sugestor de Compra ---------------- */

export function PurchaseSuggest({ rows, avgPtsPerCpf, saleCpmCents }: { rows: CapacityRow[]; avgPtsPerCpf: number; saleCpmCents: number | null }) {
  const [program, setProgram] = useState(rows[0]?.programCode ?? "");
  const [perCpf, setPerCpf] = useState("");
  const [buyCpm, setBuyCpm] = useState("");
  const [sellCpm, setSellCpm] = useState(saleCpmCents ? (saleCpmCents / 100).toFixed(2).replace(".", ",") : "");
  const [off, setOff] = useState<string[]>([]); // contas desmarcadas
  const per = pts(perCpf);
  const buyC = cents(buyCpm) ?? 0;
  const sellC = cents(sellCpm);
  const lines = useMemo(
    () => rows.filter((r) => r.programCode === program).map((r) => ({ ...r, line: purchaseLine(r.load, per, buyC, sellC) })).filter((r) => r.line.buy > 0).sort((a, b) => b.line.buy - a.line.buy),
    [rows, program, per, buyC, sellC],
  );
  const chosen = lines.filter((r) => !off.includes(r.id));
  const total = chosen.reduce((t, r) => t + r.line.buy, 0);
  const cost = chosen.reduce((t, r) => t + r.line.costCents, 0);
  const revenue = sellC == null ? null : chosen.reduce((t, r) => t + (r.line.revenueCents ?? 0), 0);
  const profit = revenue == null ? null : revenue - cost;
  function copy() {
    const text = chosen.map((r) => `${r.label}: comprar ${fmtPts(r.line.buy)} pts (${r.load.cpfFree} CPFs livres × ${fmtPts(per)})`).join("\n") + `\nTotal: ${fmtPts(total)} pts · custo ${fmtBRL(cost)}`;
    navigator.clipboard.writeText(text).then(() => toast("Lista copiada"), () => toast("Não deu para copiar", "error"));
  }
  if (!rows.length) return <NoAccounts />;
  return (
    <div className="space-y-4">
      <div className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgramSelect rows={rows} value={program} onChange={(v) => { setProgram(v); setOff([]); }} />
        <Field label="Milhas por CPF (vendas)" required hint={`Sua média: ${fmtPts(avgPtsPerCpf)}`}><input className="input" inputMode="numeric" value={perCpf} onChange={(e) => setPerCpf(e.target.value)} placeholder="Ex.: 30.000" aria-label="Milhas por CPF" /></Field>
        <Field label="Milheiro de compra (R$)" required><input className="input" inputMode="decimal" value={buyCpm} onChange={(e) => setBuyCpm(e.target.value)} placeholder="15,00" aria-label="Milheiro de compra" /></Field>
        <Field label="Milheiro de venda (R$)" hint="Opcional: mostra receita e lucro"><input className="input" inputMode="decimal" value={sellCpm} onChange={(e) => setSellCpm(e.target.value)} placeholder="26,00" aria-label="Milheiro de venda" /></Field>
      </div>
      {per === 0 ? <p className="card card-pad text-sm text-muted">Informe as milhas por CPF para calcular quanto comprar em cada conta.</p> : lines.length === 0 ? (
        <p className="card card-pad text-sm text-muted">Nenhuma compra necessária: as contas deste programa já têm milhas para todos os CPFs livres.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card card-pad"><p className="kicker">Total a comprar</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtPts(total)}</p><p className="mt-1 text-xs text-muted">em {chosen.length} {chosen.length === 1 ? "conta" : "contas"}</p></div>
            <div className="card card-pad"><p className="kicker">Custo da compra</p><p className="mt-2 text-2xl font-semibold tabular-nums">{fmtBRL(cost)}</p><p className="mt-1 text-xs text-muted">{buyC ? `a ${fmtBRL(buyC)} o milheiro` : "informe o milheiro de compra"}</p></div>
            <div className="card card-pad"><p className="kicker">Receita prevista</p><p className="mt-2 text-2xl font-semibold tabular-nums">{revenue == null ? "-" : fmtBRL(revenue)}</p><p className="mt-1 text-xs text-muted">{sellC ? `a ${fmtBRL(sellC)} o milheiro` : "informe o milheiro de venda"}</p></div>
            <div className="card card-pad"><p className="kicker">Lucro previsto</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${profit != null && profit < 0 ? "text-red-400" : "text-accent-light"}`}>{profit == null ? "-" : fmtBRL(profit)}</p><p className="mt-1 text-xs text-muted">{profit != null && revenue ? `margem ${((profit / revenue) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : " "}</p></div>
          </div>
          <section className="card overflow-hidden" aria-label="Compras por conta">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <h2 className="flex-1 text-sm font-semibold">Comprar em cada conta</h2>
              <button type="button" className="btn-ghost h-8" onClick={() => setOff(off.length ? [] : lines.map((r) => r.id))}>{off.length ? "Marcar todas" : "Desmarcar todas"}</button>
              <button type="button" className="btn-ghost h-8" onClick={copy} disabled={!chosen.length}><Copy className="h-4 w-4" />Copiar tudo</button>
            </div>
            <ul className="divide-y divide-line">
              {lines.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${off.includes(r.id) ? "opacity-50" : ""}`}>
                  <input type="checkbox" checked={!off.includes(r.id)} onChange={(e) => setOff(e.target.checked ? off.filter((x) => x !== r.id) : [...off, r.id])} aria-label={`Incluir ${r.label}`} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/programs/${r.id}`} className="truncate font-semibold hover:underline">{r.label}</Link>
                    <p className="text-xs text-muted">{r.load.cpfFree} CPFs livres · saldo livre {fmtPts(r.line.available)} → meta {fmtPts(r.line.target)} ({r.load.cpfFree} × {fmtPts(per)})</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">Comprar {fmtPts(r.line.buy)}</p>
                    <p className="text-xs tabular-nums text-muted">custo {fmtBRL(r.line.costCents)}{r.line.revenueCents != null && ` · lucro ${fmtBRL(r.line.revenueCents - r.line.costCents)}`}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="text-xs text-muted">Meta de cada conta = CPFs livres × milhas por CPF. A compra é o que falta entre o saldo livre (sem as milhas reservadas no CRM Milhas) e a meta.</p>
    </div>
  );
}

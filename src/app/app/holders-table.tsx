"use client";
import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/stat";
import { ProgramLogo } from "@/components/program-logo";
import { fmtBRL, fmtPts } from "@/lib/format";

type H = { id: string; name: string; accounts: number; balance: number; cpmCents: number | null; valueCents: number };
type A = { holderId: string; programId: string; logo: string | null; program: string; color: string; balance: number; cpmCents: number | null; pending: number };
type Key = "name" | "accounts" | "balance" | "cpmCents" | "valueCents";

export function HoldersTable({ holders, accounts, hide }: { holders: H[]; accounts: A[]; hide: boolean }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "balance", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const money = (c: number | null) => (hide ? "R$ •••" : fmtBRL(c));
  const rows = [...holders].sort((a, b) => {
    const x = a[sort.key] ?? -1;
    const y = b[sort.key] ?? -1;
    return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir;
  });
  const th = (key: Key, label: string, right = true) => (
    <th className={right ? "text-right" : ""} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className={`inline-flex items-center gap-1 hover:text-white ${right ? "flex-row-reverse" : ""}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {sort.key === key ? (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />}
        {label}
      </button>
    </th>
  );
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              {th("name", "Titular", false)}
              <th className="hidden text-right sm:table-cell">Contas</th>
              {th("balance", "Saldo")}
              {th("cpmCents", "CPM")}
              <th className="hidden text-right md:table-cell">
                <button className="inline-flex flex-row-reverse items-center gap-1 hover:text-white" onClick={() => setSort((s) => ({ key: "valueCents", dir: s.key === "valueCents" ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                  {sort.key === "valueCents" ? (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />}Valor
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <Fragment key={h.id}>
                <tr className="cursor-pointer" onClick={() => toggle(h.id)} aria-expanded={open.has(h.id)}>
                  <td>
                    <span className="flex items-center gap-3">
                      <ChevronRight className={`h-4 w-4 shrink-0 text-muted transition-transform ${open.has(h.id) ? "rotate-90" : ""}`} />
                      <Avatar name={h.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{h.name}</span>
                        <span className="block text-xs text-muted sm:hidden">{h.accounts} {h.accounts === 1 ? "conta" : "contas"}</span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden text-right tabular-nums text-muted sm:table-cell">{h.accounts} {h.accounts === 1 ? "conta" : "contas"}</td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">{fmtPts(h.balance)}<span className="hidden text-muted sm:inline"> pts</span></td>
                  <td className="whitespace-nowrap text-right tabular-nums">{money(h.cpmCents)}</td>
                  <td className="hidden text-right tabular-nums md:table-cell">{money(h.valueCents)}</td>
                </tr>
                {open.has(h.id) && accounts.filter((a) => a.holderId === h.id).map((a) => (
                  <tr key={`${h.id}-${a.program}`} className="bg-panel2/40">
                    <td className="pl-16"><span className="flex items-center gap-2 text-sm"><ProgramLogo programId={a.programId} name={a.program} color={a.color} version={a.logo} size={22} />{a.program}{a.pending > 0 && <span className="text-xs text-amber-300">+{fmtPts(a.pending)} a receber</span>}</span></td>
                    <td className="hidden sm:table-cell" />
                    <td className="text-right text-sm tabular-nums">{fmtPts(a.balance)}</td>
                    <td className="text-right text-sm tabular-nums text-muted">{money(a.cpmCents)}</td>
                    <td className="hidden md:table-cell" />
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";
// Metas e comissões: as abas Visão geral, Comissões (regras), Parceiros e Extrato. Os números vêm prontos do
// servidor (src/server/services/commissions.ts); aqui só mostra e lança (regras, bônus, ajustes e pagamentos).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Percent, HandCoins, Gift, X, Receipt, Users, Handshake } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe, useNav } from "@/lib/nav";
import { fmtBRL, fmtDate, fmtPts, monthLabel, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { Stat } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";
import { COMMISSION_BASES, COMMISSION_KINDS, describeRule, type CommissionBase, type CommissionKind, type CommissionPeriod } from "@/domain/commissions";
import type { commissionsOverview, listRules, statement } from "@/server/services/commissions";

type Overview = Awaited<ReturnType<typeof commissionsOverview>>;
type TeamRow = Overview["team"][number];
type PartnerRow = Overview["partners"][number];
type RuleRow = Awaited<ReturnType<typeof listRules>>[number];
type St = Awaited<ReturnType<typeof statement>>;
type Acc = { id: string; name: string };
type Owner = { memberId: string } | { partnerId: string };
type Target = Owner & { name: string; dueCents: number };

const BASE = "/app/equipe/metas";
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const extratoHref = (o: Owner) => `${BASE}?aba=extrato&${"memberId" in o ? `membro=${o.memberId}` : `parceiro=${o.partnerId}`}`;
const dueTone = (c: number) => (c > 0 ? "text-amber-300" : c < 0 ? "text-red-300" : "text-muted");
const centsText = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/* ---------------- Visão geral ---------------- */

export function OverviewTab({ o, canEdit, accounts }: { o: Overview; canEdit: boolean; accounts: Acc[] | null }) {
  const [paying, setPaying] = useState<Target | null>(null);
  const t = o.totals;
  const pct = t.goalCents ? Math.round((t.achievedCents / t.goalCents) * 100) : null;
  const month = monthLabel(o.month);
  const team = o.team.filter((m) => m.active || m.dueCents !== 0);
  const partners = o.partners.filter((p) => p.active || p.dueCents !== 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Meta do mês" value={t.goalCents ? fmtBRL(t.goalCents) : "Sem meta"} hint={t.goalCents ? `Metas de faturamento de ${month}` : "Crie uma meta de faturamento na aba Metas"} />
        <Stat label="Realizado" value={fmtBRL(t.achievedCents)} hint={pct != null ? `${pct}% da meta` : `Vendas de ${month}`} accent />
        <Stat label="Comissões a pagar" value={fmtBRL(t.dueCents)} hint="Saldo de todos: equipe e parceiros" />
        <Stat label="Pagas no mês" value={fmtBRL(t.paidMonthCents)} hint={month} />
      </div>
      {pct != null && (
        <div className="card card-pad mt-3" aria-label="Progresso da meta do mês">
          <div className="flex items-center justify-between text-sm"><span className="text-muted">Progresso da meta de {month}</span><span className="font-semibold tabular-nums">{pct}%</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 60 ? "bg-accent-light" : pct >= 30 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden" aria-label="Equipe">
          <h2 className="flex items-center gap-2 px-4 pt-4 font-semibold"><Users className="h-4 w-4 text-muted" />Equipe</h2>
          {team.length === 0 ? <p className="px-4 py-6 text-sm text-muted">Ninguém na equipe ainda. Cadastre em <Link href="/app/equipe" className="text-accent-light hover:underline">Equipe</Link> e crie as regras na aba Comissões.</p> : (
            <PeopleTable rows={team.map((m) => ({ owner: { memberId: m.id }, name: m.name, color: m.color, note: m.rules ? `${m.rules} ${m.rules === 1 ? "regra" : "regras"}` : "sem regra", monthCents: m.monthCents, dueCents: m.dueCents, paidMonthCents: m.paidMonthCents }))} canEdit={canEdit} onPay={setPaying} />
          )}
        </section>
        <section className="card overflow-hidden" aria-label="Parceiros">
          <h2 className="flex items-center gap-2 px-4 pt-4 font-semibold"><Handshake className="h-4 w-4 text-muted" />Parceiros</h2>
          {partners.length === 0 ? <p className="px-4 py-6 text-sm text-muted">Nenhum parceiro. Os parceiros (e a comissão de cada um) ficam em Equipe › Parceiros.</p> : (
            <PeopleTable rows={partners.map((p) => ({ owner: { partnerId: p.id }, name: p.name, color: null, note: `${p.monthSales} ${p.monthSales === 1 ? "venda" : "vendas"} no mês`, monthCents: p.monthCents, dueCents: p.dueCents, paidMonthCents: p.paidMonthCents }))} canEdit={canEdit} onPay={setPaying} />
          )}
        </section>
      </div>
      {paying && <PayDialog target={paying} accounts={accounts} onClose={() => setPaying(null)} />}
    </>
  );
}

type PRow = { owner: Owner; name: string; color: string | null; note: string; monthCents: number; dueCents: number; paidMonthCents: number };

function PeopleTable({ rows, canEdit, onPay }: { rows: PRow[]; canEdit: boolean; onPay: (t: Target) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base whitespace-nowrap">
        <thead><tr><th>Nome</th><th className="text-right">No mês</th><th className="text-right">A pagar</th><th className="hidden text-right sm:table-cell">Pago no mês</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={"memberId" in r.owner ? r.owner.memberId : r.owner.partnerId}>
              <td>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? "#94a3b8" }} aria-hidden />
                  <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="block text-xs text-muted">{r.note}</span></span>
                </span>
              </td>
              <td className="text-right tabular-nums">{fmtBRL(r.monthCents)}</td>
              <td className={`text-right font-semibold tabular-nums ${dueTone(r.dueCents)}`}>{fmtBRL(r.dueCents)}</td>
              <td className="hidden text-right tabular-nums text-muted sm:table-cell">{fmtBRL(r.paidMonthCents)}</td>
              <td className="text-right">
                <span className="inline-flex gap-1">
                  <Link href={extratoHref(r.owner)} className="btn-ghost h-8 px-2 text-xs" aria-label={`Extrato de ${r.name}`}><Receipt className="h-3.5 w-3.5" />Extrato</Link>
                  {canEdit && r.dueCents > 0 && <button className="btn-ghost h-8 px-2 text-xs" onClick={() => onPay({ ...r.owner, name: r.name, dueCents: r.dueCents })} aria-label={`Pagar ${r.name}`}><HandCoins className="h-3.5 w-3.5" />Pagar</button>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Comissões (regras) ---------------- */

const isPct = (k: CommissionKind) => k === "SALE_PCT" || k === "PROFIT_PCT";
const valueText = (k: CommissionKind, v: number) => (isPct(k) ? String(v / 100).replace(".", ",") : centsText(v));
const parseValue = (k: CommissionKind, t: string) => {
  if (!isPct(k)) return parseBRLToCents(t);
  const n = Number(t.trim().replace("%", "").replace(",", "."));
  return t.trim() && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
};
const minIsMoney = isPct;
const minText = (k: CommissionKind, v: number) => (minIsMoney(k) ? centsText(v) : String(v));
const parseMin = (k: CommissionKind, t: string) => (minIsMoney(k) ? parseBRLToCents(t) : t.trim() ? Number(t.replace(/\D/g, "")) : null);
const showMin = (k: CommissionKind, v: number) => (minIsMoney(k) ? fmtBRL(v) : k === "FIXED" ? `${fmtPts(v)} ${v === 1 ? "venda" : "vendas"}` : `${fmtPts(v)} milhas`);
const showValue = (k: CommissionKind, v: number) => (isPct(k) ? `${String(v / 100).replace(".", ",")}%` : fmtBRL(v));
const VALUE_LABEL: Record<CommissionKind, string> = { SALE_PCT: "Porcentagem (%)", PROFIT_PCT: "Porcentagem (%)", FIXED: "Valor por venda (R$)", PER_K_MILES: "Valor por mil milhas (R$)" };
const MIN_LABEL: Record<CommissionKind, string> = { SALE_PCT: "Faturamento a partir de (R$)", PROFIT_PCT: "Lucro a partir de (R$)", FIXED: "A partir de (vendas)", PER_K_MILES: "A partir de (milhas)" };
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const since = (d: string, p: CommissionPeriod) => (p === "QUARTER" ? `${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}º tri/${d.slice(0, 4)}` : `${MONTHS[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}`);

export function RulesTab({ rules, members, team, canEdit }: { rules: RuleRow[]; members: { id: string; name: string }[]; team: TeamRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const byMember = new Map<string, RuleRow[]>();
  for (const r of rules) byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r]);
  async function remove(r: RuleRow) {
    if (!(await confirmDialog({ title: "Excluir regra?", body: `${r.member}: ${describeRule(r)}. As comissões calculadas por ela saem do extrato (bônus, ajustes e pagamentos ficam).`, confirmLabel: "Excluir", danger: true }))) return;
    const res = await api(`/api/commissions/rules/${r.id}`, "DELETE");
    if (!res.ok) return toast(res.erro, "error");
    toast("Regra excluída");
    refreshSafe(router);
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-sm text-muted">Cada regra diz como o membro ganha: % do faturamento ou do lucro, R$ por venda ou por mil milhas, sobre as vendas que ele emitiu ou as da agência toda. A venda conta para quem a lançou ou emitiu (em <span className="text-zinc-200">Emissores</span> na venda).</p>
        <span className="flex-1" />
        {canEdit && <button className="btn-primary" onClick={() => setEditing("new")} disabled={!members.length}><Plus className="h-4 w-4" />Nova regra</button>}
      </div>
      {rules.length === 0 ? (
        <Empty title="Nenhuma regra de comissão" icon={<Percent className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{members.length ? "Crie uma regra para um membro da equipe (ex.: 5% do lucro das vendas que ele emitiu, mensal). A comissão de cada mês sai sozinha das vendas." : "Cadastre a equipe em Equipe primeiro."}</p>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...byMember.entries()].map(([memberId, list]) => {
            const m = team.find((t) => t.id === memberId);
            return (
              <section key={memberId} className="card card-pad" aria-label={list[0]!.member}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: list[0]!.memberColor ?? "#94a3b8" }} aria-hidden />
                  <h2 className="min-w-0 flex-1 truncate font-semibold">{list[0]!.member}</h2>
                  {m && <span className="text-right text-xs text-muted">No mês <span className="block text-sm font-semibold tabular-nums text-white">{fmtBRL(m.monthCents)}</span></span>}
                </div>
                <ul className="mt-3 space-y-2">
                  {list.map((r) => (
                    <li key={r.id} className={`rounded-xl border border-line p-3 text-sm ${r.active ? "" : "opacity-60"}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{describeRule(r)}</p>
                          <p className="text-xs text-muted">Desde {since(r.startsAt, r.period)}{r.active ? "" : " · pausada"}</p>
                        </div>
                        {canEdit && <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(r)} aria-label={`Editar regra de ${r.member}`}><Pencil className="h-4 w-4" /></button>}
                        {canEdit && <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(r)} aria-label={`Excluir regra de ${r.member}`}><Trash2 className="h-4 w-4" /></button>}
                      </div>
                      {r.tiers.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                          <li className="rounded-lg bg-panel2 px-2 py-1">Base: {showValue(r.kind, r.value)}</li>
                          {r.tiers.map((t) => <li key={t.min} className="rounded-lg bg-panel2 px-2 py-1">{showMin(r.kind, t.min)}+: {showValue(r.kind, t.value)}</li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                <Link href={extratoHref({ memberId })} className="mt-3 inline-flex text-xs text-accent-light hover:underline">Ver extrato</Link>
              </section>
            );
          })}
        </div>
      )}
      {editing && <RuleDialog r={editing === "new" ? null : editing} members={members} onClose={() => setEditing(null)} />}
    </>
  );
}

type TierRow = { min: string; value: string };

function RuleDialog({ r, members, onClose }: { r: RuleRow | null; members: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(r?.memberId ?? members[0]?.id ?? "");
  const [kind, setKind] = useState<CommissionKind>(r?.kind ?? "PROFIT_PCT");
  const [value, setValue] = useState(r ? valueText(r.kind, r.value) : "");
  const [base, setBase] = useState<CommissionBase>(r?.base ?? "INDIVIDUAL");
  const [period, setPeriod] = useState<CommissionPeriod>(r?.period ?? "MONTH");
  const [startsAt, setStartsAt] = useState((r?.startsAt ?? todayStr()).slice(0, 7));
  const [active, setActive] = useState(r?.active ?? true);
  const [tiers, setTiers] = useState<TierRow[]>(r?.tiers.map((t) => ({ min: minText(r.kind, t.min), value: valueText(r.kind, t.value) })) ?? []);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  // trocar o tipo pode mudar as unidades (% ou R$; faturamento, vendas ou milhas): o que não serve mais é limpo
  const changeKind = (k: CommissionKind) => {
    if (k !== kind && !(isPct(k) && isPct(kind))) setTiers([]);
    if (isPct(k) !== isPct(kind)) setValue("");
    setKind(k);
  };
  const setTier = (i: number, p: Partial<TierRow>) => setTiers(tiers.map((t, j) => (j === i ? { ...t, ...p } : t)));
  // inclui o membro da regra mesmo que ele esteja inativo
  const options = r && !members.some((m) => m.id === r.memberId) ? [...members, { id: r.memberId, name: r.member }] : members;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValue(kind, value);
    if (v == null) return setErro(isPct(kind) ? "Informe a porcentagem (0 a 100)" : "Informe o valor em R$");
    const ts = [];
    for (const [i, t] of tiers.entries()) {
      const min = parseMin(kind, t.min), tv = parseValue(kind, t.value);
      if (min == null || tv == null) return setErro(`Complete a faixa ${i + 1}`);
      ts.push({ min, value: tv });
    }
    setBusy(true);
    const body = { memberId, kind, value: v, base, tiers: ts, period, startsAt: `${startsAt}-01`, active };
    const res = r ? await api(`/api/commissions/rules/${r.id}`, "PUT", body) : await api("/api/commissions/rules", "POST", body);
    setBusy(false);
    if (!res.ok) return setErro(res.erro);
    toast(r ? "Regra atualizada" : "Regra criada");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={r ? "Editar regra de comissão" : "Nova regra de comissão"} size="lg" icon={<Percent className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="rule-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="rule-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Membro" required><select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} required aria-label="Membro">{options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Como ganha" required><select className="input" value={kind} onChange={(e) => changeKind(e.target.value as CommissionKind)} aria-label="Como ganha">{Object.entries(COMMISSION_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={VALUE_LABEL[kind]} required hint={kind === "PROFIT_PCT" ? "Lucro = resultado da venda (venda − custo das milhas − custos). Lucro negativo não gera comissão." : undefined}>
            <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={isPct(kind) ? "Ex.: 5" : "Ex.: 10,00"} aria-label={VALUE_LABEL[kind]} required />
          </Field>
          <Field label="Sobre quais vendas"><select className="input" value={base} onChange={(e) => setBase(e.target.value as CommissionBase)} aria-label="Sobre quais vendas">{Object.entries(COMMISSION_BASES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Período"><select className="input" value={period} onChange={(e) => setPeriod(e.target.value as CommissionPeriod)} aria-label="Período"><option value="MONTH">Mensal</option><option value="QUARTER">Trimestral</option></select></Field>
          <Field label="Vale a partir de" hint="As vendas desde este mês entram no extrato."><input type="month" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required aria-label="Vale a partir de" /></Field>
        </div>
        <div>
          <p className="label">Faixas (opcional)</p>
          <p className="mb-2 text-xs text-muted">Ao passar de uma faixa no período, o valor dela vale para o período todo (ex.: 5% até R$ 50 mil de lucro; a partir de R$ 50 mil, 7% sobre tudo).</p>
          <ul className="space-y-2">
            {tiers.map((t, i) => (
              <li key={i} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label={MIN_LABEL[kind]}><input className="input" inputMode="decimal" value={t.min} onChange={(e) => setTier(i, { min: e.target.value })} aria-label={`Faixa ${i + 1}: a partir de`} /></Field>
                <Field label={VALUE_LABEL[kind]}><input className="input" inputMode="decimal" value={t.value} onChange={(e) => setTier(i, { value: e.target.value })} aria-label={`Faixa ${i + 1}: valor`} /></Field>
                <button type="button" className="btn-subtle mb-0.5 h-9 w-9 px-0" onClick={() => setTiers(tiers.filter((_, j) => j !== i))} aria-label={`Tirar a faixa ${i + 1}`}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          {tiers.length < 10 && <button type="button" className="btn-ghost mt-2 h-8 text-xs" onClick={() => setTiers([...tiers, { min: "", value: "" }])}><Plus className="h-3.5 w-3.5" />Faixa</button>}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Regra ativa (pausada não calcula comissão)</label>
      </form>
    </Modal>
  );
}

/* ---------------- Parceiros ---------------- */

export function PartnersTab({ partners, canEdit, accounts, manageLink }: { partners: PartnerRow[]; canEdit: boolean; accounts: Acc[] | null; manageLink: boolean }) {
  const [paying, setPaying] = useState<Target | null>(null);
  return (
    <>
      <p className="mb-3 max-w-2xl text-sm text-muted">A comissão de cada parceiro é a do cadastro dele (% do lucro, % da venda ou R$ por venda) e sai em cada venda que ele indicou.{manageLink && <> Mude em <Link href="/app/equipe" className="text-accent-light hover:underline">Equipe › Parceiros</Link>.</>}</p>
      {partners.length === 0 ? (
        <Empty title="Nenhum parceiro" icon={<Handshake className="h-5 w-5" />}><p className="max-w-sm text-sm text-muted">Cadastre parceiros (indicadores, revendedores) em Equipe e escolha o parceiro na venda.</p></Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base whitespace-nowrap">
              <thead><tr><th>Parceiro</th><th className="text-right">Vendas no mês</th><th className="hidden text-right md:table-cell">Faturamento no mês</th><th className="text-right">Comissão no mês</th><th className="text-right">A pagar</th><th className="hidden text-right sm:table-cell">Pago no mês</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                    <td className="font-medium">{p.name}{!p.active && <span className="ml-2 text-xs text-muted">inativo</span>}</td>
                    <td className="text-right tabular-nums">{p.monthSales}</td>
                    <td className="hidden text-right tabular-nums md:table-cell">{fmtBRL(p.monthRevenueCents)}</td>
                    <td className="text-right tabular-nums">{fmtBRL(p.monthCents)}</td>
                    <td className={`text-right font-semibold tabular-nums ${dueTone(p.dueCents)}`}>{fmtBRL(p.dueCents)}</td>
                    <td className="hidden text-right tabular-nums text-muted sm:table-cell">{fmtBRL(p.paidMonthCents)}</td>
                    <td className="text-right">
                      <span className="inline-flex gap-1">
                        <Link href={extratoHref({ partnerId: p.id })} className="btn-ghost h-8 px-2 text-xs" aria-label={`Extrato de ${p.name}`}><Receipt className="h-3.5 w-3.5" />Extrato</Link>
                        {canEdit && p.dueCents > 0 && <button className="btn-ghost h-8 px-2 text-xs" onClick={() => setPaying({ partnerId: p.id, name: p.name, dueCents: p.dueCents })} aria-label={`Pagar ${p.name}`}><HandCoins className="h-3.5 w-3.5" />Pagar</button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {paying && <PayDialog target={paying} accounts={accounts} onClose={() => setPaying(null)} />}
    </>
  );
}

/* ---------------- Extrato ---------------- */

type Person = { kind: "member" | "partner"; id: string; name: string; active: boolean };
const KIND_LABEL = { COMMISSION: "Comissão", BONUS: "Bônus", ADJUST: "Ajuste", PAYMENT: "Pagamento" } as const;

export function StatementTab({ people, selected, st, canEdit, accounts }: { people: Person[]; selected: Person | null; st: St | null; canEdit: boolean; accounts: Acc[] | null }) {
  const router = useRouter();
  const nav = useNav();
  const [dialog, setDialog] = useState<"pay" | "entry" | null>(null);
  const owner: Owner | null = selected ? (selected.kind === "member" ? { memberId: selected.id } : { partnerId: selected.id }) : null;
  const value = selected ? `${selected.kind === "member" ? "m" : "p"}:${selected.id}` : "";
  function pick(v: string) {
    if (!v) return nav(`${BASE}?aba=extrato`);
    const [k, id] = v.split(":");
    nav(extratoHref(k === "m" ? { memberId: id! } : { partnerId: id! }));
  }
  async function remove(row: St["rows"][number]) {
    if (!row.id) return;
    const body = row.finTransactionId ? "A despesa que ele criou no Financeiro também será apagada." : `${KIND_LABEL[row.kind]} de ${fmtBRL(row.amountCents)} em ${fmtDate(row.date)}.`;
    if (!(await confirmDialog({ title: `Excluir ${KIND_LABEL[row.kind].toLowerCase()}?`, body, confirmLabel: "Excluir", danger: true }))) return;
    const res = await api(`/api/commissions/entries/${row.id}`, "DELETE");
    if (!res.ok) return toast(res.erro, "error");
    toast("Lançamento excluído");
    refreshSafe(router);
  }
  const members = people.filter((p) => p.kind === "member"), partners = people.filter((p) => p.kind === "partner");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="De quem" className="w-full sm:w-72">
          <select className="input" value={value} onChange={(e) => pick(e.target.value)} aria-label="De quem é o extrato">
            <option value="">Escolha um membro ou parceiro</option>
            {members.length > 0 && <optgroup label="Equipe">{members.map((p) => <option key={p.id} value={`m:${p.id}`}>{p.name}{p.active ? "" : " (inativo)"}</option>)}</optgroup>}
            {partners.length > 0 && <optgroup label="Parceiros">{partners.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}{p.active ? "" : " (inativo)"}</option>)}</optgroup>}
          </select>
        </Field>
        <span className="flex-1" />
        {canEdit && selected && st && (
          <>
            <button className="btn-ghost" onClick={() => setDialog("entry")}><Gift className="h-4 w-4" />Bônus ou ajuste</button>
            <button className="btn-primary" onClick={() => setDialog("pay")}><HandCoins className="h-4 w-4" />Registrar pagamento</button>
          </>
        )}
      </div>
      {!selected || !st ? (
        <Empty title="Escolha de quem é o extrato" icon={<Receipt className="h-5 w-5" />}><p className="max-w-sm text-sm text-muted">O extrato mostra a comissão de cada período, os bônus, os ajustes e os pagamentos, com o saldo a pagar.</p></Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Ganho" value={fmtBRL(st.earnedCents)} hint="Comissões, bônus e ajustes" />
            <Stat label="Pago" value={fmtBRL(st.paidCents)} />
            <Stat label="Saldo a pagar" value={fmtBRL(st.balanceCents)} accent={st.balanceCents > 0} negative={st.balanceCents < 0} hint={st.balanceCents < 0 ? "Pago a mais: desconta nas próximas" : undefined} />
          </div>
          {st.rows.length === 0 ? (
            <p className="card card-pad mt-4 text-sm text-muted">Nada no extrato ainda.{selected.kind === "member" ? " Crie uma regra na aba Comissões: a comissão de cada mês aparece aqui sozinha." : " A comissão aparece quando houver vendas com este parceiro."}</p>
          ) : (
            <div className="card mt-4 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Data</th><th>Lançamento</th><th className="text-right">Valor</th><th><span className="sr-only">Ações</span></th></tr></thead>
                  <tbody>
                    {st.rows.map((row, i) => (
                      <tr key={row.id ?? `c${i}`}>
                        <td className="whitespace-nowrap tabular-nums text-muted">{row.kind === "COMMISSION" ? row.label.replace(/^Comissão /, "") : fmtDate(row.date)}</td>
                        <td>
                          <span className="font-medium">{row.kind === "COMMISSION" ? "Comissão do período" : row.label}</span>
                          {row.kind === "COMMISSION" && <span className="ml-2 rounded-md bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">calculada</span>}
                          {row.finTransactionId && <span className="ml-2 rounded-md bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">no Financeiro</span>}
                          {row.note && <span className="block text-xs text-muted">{row.note}</span>}
                        </td>
                        <td className={`whitespace-nowrap text-right font-semibold tabular-nums ${row.kind === "PAYMENT" ? "text-emerald-300" : row.amountCents < 0 ? "text-red-300" : ""}`}>{row.kind === "PAYMENT" ? `− ${fmtBRL(row.amountCents)}` : fmtBRL(row.amountCents)}</td>
                        <td className="w-10 text-right">{canEdit && row.id && <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(row)} aria-label={`Excluir ${KIND_LABEL[row.kind].toLowerCase()} de ${fmtDate(row.date)}`}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {dialog === "pay" && owner && selected && st && <PayDialog target={{ ...owner, name: selected.name, dueCents: st.balanceCents }} accounts={accounts} onClose={() => setDialog(null)} />}
      {dialog === "entry" && owner && selected && <EntryDialog owner={owner} name={selected.name} onClose={() => setDialog(null)} />}
    </>
  );
}

/* ---------------- Lançamentos ---------------- */

function PayDialog({ target, accounts, onClose }: { target: Target; accounts: Acc[] | null; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(target.dueCents > 0 ? centsText(target.dueCents) : "");
  const [date, setDate] = useState(todayStr());
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRLToCents(amount);
    if (!cents) return setErro("Informe o valor pago");
    setBusy(true);
    const owner = "memberId" in target ? { memberId: target.memberId } : { partnerId: target.partnerId };
    const res = await api("/api/commissions/pay", "POST", { ...owner, amountCents: cents, date, finAccountId: account || null, note: note || null });
    setBusy(false);
    if (!res.ok) return setErro(res.erro);
    toast(account ? "Pagamento registrado e lançado no Financeiro" : "Pagamento registrado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={`Pagar comissão · ${target.name}`} size="sm" icon={<HandCoins className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="pay-form" className="btn-primary" disabled={busy}>Registrar</button></>}>
      <form id="pay-form" onSubmit={save} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Saldo a pagar: <span className={`font-semibold tabular-nums ${dueTone(target.dueCents)}`}>{fmtBRL(target.dueCents)}</span></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor pago (R$)" required><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required aria-label="Valor pago" /></Field>
          <Field label="Data" required><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Data do pagamento" /></Field>
        </div>
        {accounts && (
          <Field label="Saiu da conta" hint={account ? "Vira uma despesa paga em Pessoal › Comissões no Financeiro." : "Sem conta, fica só no extrato da comissão."}>
            <select className="input" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta do Financeiro"><option value="">Não lançar no Financeiro</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
        )}
        <Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex.: Pix, comissão de outubro" aria-label="Observação" /></Field>
      </form>
    </Modal>
  );
}

function EntryDialog({ owner, name, onClose }: { owner: Owner; name: string; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<"BONUS" | "ADJUST_PLUS" | "ADJUST_MINUS">("BONUS");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRLToCents(amount);
    if (!cents) return setErro("Informe o valor");
    setBusy(true);
    const res = await api("/api/commissions/entries", "POST", { ...owner, kind: kind === "BONUS" ? "BONUS" : "ADJUST", amountCents: kind === "ADJUST_MINUS" ? -cents : cents, date, note: note || null });
    setBusy(false);
    if (!res.ok) return setErro(res.erro);
    toast(kind === "BONUS" ? "Bônus lançado" : "Ajuste lançado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={`Bônus ou ajuste · ${name}`} size="sm" icon={<Gift className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="entry-form" className="btn-primary" disabled={busy}>Lançar</button></>}>
      <form id="entry-form" onSubmit={save} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Tipo">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo de lançamento">
            <option value="BONUS">Bônus (soma no saldo)</option>
            <option value="ADJUST_PLUS">Ajuste a mais (soma)</option>
            <option value="ADJUST_MINUS">Ajuste a menos (desconta)</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" required><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required aria-label="Valor" /></Field>
          <Field label="Data" required><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Data" /></Field>
        </div>
        <Field label="Motivo"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex.: Bateu a meta do trimestre" aria-label="Motivo" /></Field>
      </form>
    </Modal>
  );
}

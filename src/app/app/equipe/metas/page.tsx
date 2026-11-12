import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { listGoals, listMembers, listPartners, periodStart, periodEnd } from "@/server/services/team";
import { commissionsOverview, listRules, payAccounts, statement } from "@/server/services/commissions";
import { PageHeader } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { brDay } from "@/domain/brasilia";
import { can } from "@/domain/permissions";
import { GoalsClient } from "./client";
import { OverviewTab, PartnersTab, RulesTab, StatementTab } from "./commissions";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
type Period = "MONTH" | "QUARTER" | "YEAR";
const label = (p: Period, d: Date) => p === "YEAR" ? String(d.getUTCFullYear()) : p === "QUARTER" ? `${Math.floor(d.getUTCMonth() / 3) + 1}º tri/${d.getUTCFullYear()}` : `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;

const TABS = [
  ["visao", "Visão geral"], ["comissoes", "Comissões"], ["metas", "Metas"], ["parceiros", "Parceiros"], ["extrato", "Extrato"],
] as const;
type Tab = (typeof TABS)[number][0];
const BASE = "/app/equipe/metas";

type SP = { aba?: string; periodo?: string; inicio?: string; membro?: string; parceiro?: string };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.aba) ? (sp.aba as Tab) : "visao";
  const perms = user.actor.permissions;
  const canEdit = can(perms, "metas", "edit");
  const accounts = canEdit && can(perms, "financeiro", "edit") ? payAccounts(user.id) : Promise.resolve(null);
  return (
    <>
      <PageHeader title="Metas e comissões" subtitle="Metas da equipe, regras de comissão, extrato e pagamentos de membros e parceiros" />
      <Segmented items={TABS.map(([k, l]) => ({ key: k, label: l, href: k === "visao" ? BASE : `${BASE}?aba=${k}` }))} active={tab} />
      {tab === "visao" && <OverviewTab o={await commissionsOverview(user.id)} canEdit={canEdit} accounts={await accounts} />}
      {tab === "comissoes" && <Rules userId={user.id} canEdit={canEdit} />}
      {tab === "metas" && <Goals userId={user.id} sp={sp} canEdit={canEdit} />}
      {tab === "parceiros" && <PartnersTab partners={(await commissionsOverview(user.id)).partners} canEdit={canEdit} accounts={await accounts} manageLink={can(perms, "equipe", "view")} />}
      {tab === "extrato" && <Statement userId={user.id} sp={sp} canEdit={canEdit} accounts={await accounts} />}
    </>
  );
}

async function Rules({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const [rules, members, o] = await Promise.all([listRules(userId), listMembers(userId), commissionsOverview(userId)]);
  return <RulesTab rules={rules} members={members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))} team={o.team} canEdit={canEdit} />;
}

async function Statement({ userId, sp, canEdit, accounts }: { userId: string; sp: SP; canEdit: boolean; accounts: { id: string; name: string }[] | null }) {
  const [members, partners] = await Promise.all([listMembers(userId), listPartners(userId)]);
  const people = [
    ...members.map((m) => ({ kind: "member" as const, id: m.id, name: m.name, active: m.active })),
    ...partners.map((p) => ({ kind: "partner" as const, id: p.id, name: p.name, active: p.active })),
  ];
  const selected = (sp.membro && people.find((p) => p.kind === "member" && p.id === sp.membro))
    || (sp.parceiro && people.find((p) => p.kind === "partner" && p.id === sp.parceiro)) || null;
  const st = selected ? await statement(userId, selected.kind === "member" ? { memberId: selected.id } : { partnerId: selected.id }) : null;
  return <StatementTab people={people} selected={selected} st={st} canEdit={canEdit} accounts={accounts} />;
}

async function Goals({ userId, sp, canEdit }: { userId: string; sp: SP; canEdit: boolean }) {
  const period: Period = sp.periodo === "QUARTER" || sp.periodo === "YEAR" ? sp.periodo : "MONTH";
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(sp.inicio ?? "") ? new Date(`${sp.inicio}T00:00:00Z`) : new Date(`${brDay()}T00:00:00Z`);
  const start = periodStart(period, ref);
  const prev = periodStart(period, new Date(start.getTime() - 86_400_000));
  const next = periodEnd(period, start);
  const href = (p: Period, d: Date) => `${BASE}?aba=metas&periodo=${p}&inicio=${d.toISOString().slice(0, 10)}`;
  const [goals, members] = await Promise.all([listGoals(userId, period, start), listMembers(userId)]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Período">
          {([["MONTH", "Mês"], ["QUARTER", "Trimestre"], ["YEAR", "Ano"]] as const).map(([k, l]) => (
            <Link key={k} href={href(k, start)} aria-pressed={period === k} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</Link>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-panel px-1">
          <Link href={href(period, prev)} className="btn-subtle h-9 w-9 px-0" aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[90px] text-center text-sm font-semibold">{label(period, start)}</span>
          <Link href={href(period, next)} className="btn-subtle h-9 w-9 px-0" aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>
      <GoalsClient goals={goals} members={members.filter((m) => m.active)} period={period} start={start.toISOString().slice(0, 10)} canEdit={canEdit} />
    </>
  );
}

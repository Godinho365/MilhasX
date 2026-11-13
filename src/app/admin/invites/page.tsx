import Link from "next/link";
import { headers } from "next/headers";
import { MessageCircle } from "lucide-react";
import { brDay } from "@/domain/brasilia";
import { listInvites } from "@/server/services/promo";
import { INVITE_STATE_LABEL } from "@/domain/promo";
import { PageHeader } from "@/components/stat";
import { fmtDay, fmtPts } from "@/lib/format";
import { Kpi, Pill, TableCard } from "../dashboard-ui";
import { ActiveSwitch, CopyButton } from "../coupons/client";
import { InviteForm } from "./client";

const TONE = { active: "green", paused: "zinc", expired: "red", full: "amber" } as const;

export default async function AdminInvites() {
  const [invites, h] = await Promise.all([listInvites(), headers()]);
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : `https://${h.get("host")}`;
  return (
    <>
      <PageHeader title="Convites" subtitle="Links que dão dias de teste do Gestor ou um plano de cortesia. Cada pessoa usa um convite uma vez.">
        <a className="btn-ghost h-9 bg-panel" href="/api/admin/export?kind=invites">Exportar CSV</a>
        <InviteForm />
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Convites ativos" value={fmtPts(invites.filter((i) => i.state === "active").length)} hint={`${invites.length} no total`} />
        <Kpi label="Usos" value={fmtPts(invites.reduce((t, i) => t + i.uses, 0))} hint="Contas que usaram um convite" />
        <Kpi label="Cortesias de plano" value={fmtPts(invites.filter((i) => i.kind === "PLAN").reduce((t, i) => t + i.uses, 0))} hint="Fora do MRR" />
        <Kpi label="Testes dados" value={fmtPts(invites.filter((i) => i.kind === "TRIAL").reduce((t, i) => t + i.uses, 0))} hint="Pessoas com dias extras" />
      </div>
      <TableCard colSpan={6} minW={900} empty={invites.length === 0 && "Nenhum convite ainda. Crie o primeiro em \"Novo convite\"."} head={<><th>Convite</th><th>Dá</th><th>Usos</th><th>Validade</th><th>Situação</th><th className="text-right">Compartilhar</th></>}>
        {invites.map((i) => {
          const link = `${origin}/convite/${encodeURIComponent(i.code)}`;
          const wa = `https://wa.me/?text=${encodeURIComponent(`Você ganhou ${i.label.charAt(0).toLowerCase()}${i.label.slice(1)} no MilhasX! Ative aqui: ${link}`)}`;
          return (
            <tr key={i.id}>
              <td><code className="rounded bg-panel2 px-1.5 py-0.5 text-[13px] font-semibold">{i.code}</code>{i.note && <span className="mt-1 block text-xs text-muted">{i.note}</span>}</td>
              <td className="font-medium">{i.label}</td>
              <td className="tabular-nums">
                {i.uses}{i.maxUses !== null && <span className="text-muted"> / {i.maxUses}</span>}
                {i.redemptions.length > 0 && <span className="block max-w-[220px] truncate text-xs text-muted">{i.redemptions.slice(0, 3).map((r, k) => <span key={r.id}>{k > 0 && ", "}<Link className="hover:underline" href={`/admin/users/${r.user.id}`}>{r.user.name}</Link></span>)}{i.redemptions.length > 3 && ` +${i.redemptions.length - 3}`}</span>}
              </td>
              <td className="text-muted">{i.expiresAt ? fmtDay(i.expiresAt) : "Sem validade"}</td>
              <td><Pill tone={TONE[i.state]}>{INVITE_STATE_LABEL[i.state]}</Pill></td>
              <td>
                <span className="flex items-center justify-end gap-2">
                  <CopyButton text={link} label="Link" />
                  <a className="btn-ghost h-8 px-2.5 text-xs text-green-400" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
                  <InviteForm initial={{ id: i.id, code: i.code, kind: i.kind as "PLAN" | "TRIAL", plan: i.plan === "PRO" || i.plan === "GESTOR" ? i.plan : null, interval: i.interval === "ANUAL" ? "ANUAL" : i.interval === "MENSAL" ? "MENSAL" : null, days: i.days, maxUses: i.maxUses, expiresAt: i.expiresAt ? brDay(i.expiresAt) : null, note: i.note }} />
                  <ActiveSwitch url={`/api/admin/invites/${i.id}`} active={i.active} name={`Convite ${i.code}`} />
                </span>
              </td>
            </tr>
          );
        })}
      </TableCard>
    </>
  );
}

import Link from "next/link";
import { recoveryData } from "@/server/services/admin-dashboard";
import { contactText, mailLink, waLink, CONTACT_LABELS } from "@/domain/admin-contact";
import { PLANS } from "@/domain/plans";
import { PageHeader } from "@/components/stat";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { Chips, Pill, TableCard } from "../dashboard-ui";
import { ContactButtons } from "../users/[id]/actions";

const TABS = [
  { key: "all", label: "Todos" },
  { key: "request", label: "Pediram plano" },
  { key: "checkout", label: "Checkout abandonado" },
  { key: "trial", label: "Teste acabando" },
  { key: "risk", label: "Sem uso" },
] as const;
const TONE = { request: "blue", checkout: "amber", trial: "amber", risk: "red" } as const;
const SUBJECT = { request: "Seu pedido de plano no MilhasX", checkout: "Sua assinatura do MilhasX", trial: "Seu teste grátis do MilhasX", risk: "Sentimos sua falta no MilhasX" } as const;

export default async function AdminRecovery({ searchParams }: { searchParams: Promise<{ t?: string; c?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.t) ? sp.t! : "all";
  const hideContacted = sp.c === "0";
  const all = await recoveryData();
  const weekAgo = Date.now() - 7 * 86400_000;
  const rows = all.filter((i) => (tab === "all" || i.kind === tab) && !(hideContacted && i.contact && i.contact.at.getTime() > weekAgo));
  const href = (t: string, c = hideContacted) => `/admin/recovery?${new URLSearchParams({ ...(t !== "all" ? { t } : {}), ...(c ? { c: "0" } : {}) })}`;

  return (
    <>
      <PageHeader title="Recuperação" subtitle="Quem está perto de virar cliente ou de ir embora. Chame pelo WhatsApp ou e-mail com a mensagem pronta; o contato fica registrado." />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Chips active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key), n: t.key === "all" ? all.length : all.filter((i) => i.kind === t.key).length }))} />
        <Link href={href(tab, !hideContacted)} className={`mb-3 rounded-full border px-3 py-1 text-xs font-medium ${hideContacted ? "border-[rgb(var(--brand))] text-[rgb(var(--brand))]" : "border-line bg-panel text-muted"}`}>
          {hideContacted ? "✓ " : ""}Esconder chamados nos últimos 7 dias
        </Link>
      </div>
      <TableCard colSpan={5} minW={820} empty={rows.length === 0 && "Ninguém para chamar aqui agora."} head={<><th>Usuário</th><th>Motivo</th><th>Último uso</th><th>Último contato</th><th className="text-right">Chamar</th></>}>
        {rows.map((i) => {
          const text = contactText(i.kind, i.user.name, { plan: i.plan ? PLANS[i.plan].name : undefined, days: i.days ?? undefined });
          return (
            <tr key={i.userId}>
              <td><Link href={`/admin/users/${i.userId}`} className="font-semibold hover:underline">{i.user.name}</Link><span className="block text-xs text-muted">{i.user.email}</span></td>
              <td><Pill tone={TONE[i.kind]}>{CONTACT_LABELS[i.kind]}</Pill><span className="mt-1 block text-xs text-muted">{i.detail}</span></td>
              <td className="text-muted">{i.lastActivity ? fmtDay(i.lastActivity) : "Nunca"}</td>
              <td className="text-muted">{i.contact ? <>{fmtDateTime(i.contact.at)}<span className="block text-xs">{i.contact.channel === "whatsapp" ? "WhatsApp" : "E-mail"}</span></> : "—"}</td>
              <td className="text-right"><ContactButtons compact userId={i.userId} reason={i.kind} wa={waLink(i.user.phone, text)} mail={mailLink(i.user.email, SUBJECT[i.kind], text)} /></td>
            </tr>
          );
        })}
      </TableCard>
    </>
  );
}

import Link from "next/link";
import { listPrivacyRequests, PRIVACY_STATUSES, PRIVACY_DEADLINE_DAYS } from "@/server/services/admin";
import { protocolOf } from "@/server/services/privacy";
import { PRIVACY_REQUEST_KINDS } from "@/domain/privacy";
import { PageHeader } from "@/components/stat";
import { Pagination } from "@/components/pagination";
import { pageHref, pageParam } from "@/lib/paging";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { Chips, TableCard } from "../dashboard-ui";
import { PrivacyStatus } from "./client";

const LABELS = { NEW: "Novos", IN_PROGRESS: "Em andamento", DONE: "Concluídos" } as const;
const kindLabel = (k: string) => PRIVACY_REQUEST_KINDS.find((x) => x.key === k)?.label ?? k;

export default async function AdminPrivacy({ searchParams }: { searchParams: Promise<{ s?: string; page?: string }> }) {
  const sp = await searchParams;
  const d = await listPrivacyRequests(sp.s ?? null, pageParam(sp.page));
  const now = Date.now();
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title="Solicitações LGPD" subtitle={`Pedidos de titulares de dados enviados em /privacidade/solicitacao. Prazo de resposta: ${PRIVACY_DEADLINE_DAYS} dias. Confirme a identidade antes de entregar ou apagar dados.`} />
      <Chips active={d.status ?? "all"} items={[{ key: "all", label: "Todos", href: "/admin/privacy", n: total }, ...PRIVACY_STATUSES.map((s) => ({ key: s, label: LABELS[s], href: `/admin/privacy?s=${s}`, n: d.counts[s] }))]} />
      <TableCard colSpan={5} minW={900} empty={d.items.length === 0 && "Nenhum pedido aqui."} head={<><th>Protocolo</th><th>Titular</th><th>Pedido</th><th>Prazo</th><th>Situação</th></>}>
        {d.items.map((r) => {
          const late = r.status !== "DONE" && r.dueAt.getTime() < now;
          return (
            <tr key={r.id} className="align-top">
              <td><code className="text-xs font-semibold">{protocolOf(r.id)}</code><span className="block text-xs text-muted">{fmtDateTime(r.createdAt)}</span></td>
              <td>
                {r.userId ? <Link href={`/admin/users/${r.userId}`} className="font-semibold hover:underline">{r.name}</Link> : <span className="font-semibold">{r.name}</span>}
                <span className="block text-xs text-muted">{r.email}{!r.userId && " · sem conta"}</span>
              </td>
              <td className="max-w-[360px]">
                <span className="font-medium">{kindLabel(r.kind)}</span>
                {r.message && <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Ver mensagem</summary><p className="mt-1 whitespace-pre-wrap">{r.message}</p></details>}
              </td>
              <td className={late ? "font-semibold text-red-400" : "text-muted"}>{fmtDay(r.dueAt)}{late && <span className="block text-xs">atrasado</span>}</td>
              <td><PrivacyStatus id={r.id} status={r.status} /></td>
            </tr>
          );
        })}
      </TableCard>
      <Pagination {...d.paging} href={pageHref("/admin/privacy", sp)} noun={["pedido", "pedidos"]} />
    </>
  );
}

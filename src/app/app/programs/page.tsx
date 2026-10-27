import { requirePageUser } from "@/server/session";
import { listHolders, walletSummary } from "@/server/services/wallet";
import { listPrograms } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { prisma } from "@/server/db";
import { Segmented } from "@/components/ui";
import { ProgramsClient } from "./client";

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePageUser();
  const view = (await searchParams).view === "titulares" ? "titulares" : "programas";
  const [holders, summary, programs, cards] = await Promise.all([
    listHolders(user.id), walletSummary(user.id), listPrograms(false),
    prisma.creditCard.findMany({ where: { userId: user.id }, select: { accountId: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Cartões cadastrados em cada conta (titular × programa), para o ícone na lista
  const cardsByAccount: Record<string, string[]> = {};
  for (const c of cards) (cardsByAccount[c.accountId] ??= []).push(c.name);
  return (
    <>
      <PageHeader title="Programas" subtitle="Suas contas em cada programa de fidelidade, por titular" />
      <Segmented center active={view} items={[{ key: "programas", label: "Programas", href: "/app/programs" }, { key: "titulares", label: "Titulares", href: "/app/programs?view=titulares" }]} />
      <ProgramsClient
        view={view}
        holders={holders.map((h) => ({
          id: h.id,
          name: h.name,
          isSelf: h.isSelf,
          active: h.active,
          birthDate: h.birthDate?.toISOString() ?? null,
          documents: (h.documents as { type: string; number: string }[] | null) ?? [],
          address: h.address,
          addressParts: (h.addressParts as Record<string, string> | null) ?? null,
          accessEmail: h.accessEmail,
          attributes: (h.attributes as { key: string; value: string }[] | null) ?? [],
          notes: h.notes,
        }))}
        programs={programs.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
        accounts={summary.accounts.map((a) => ({ ...a, cards: cardsByAccount[a.id] ?? [] }))}
        byProgram={summary.programs.map((p) => ({ ...p, color: programs.find((x) => x.id === p.id)?.color ?? "#60a5fa", logo: summary.accounts.find((a) => a.programId === p.id)?.programLogo ?? null, holders: summary.accounts.filter((a) => a.programId === p.id).length }))}
      />
    </>
  );
}

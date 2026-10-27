import { prisma } from "@/server/db";
import { listPrograms } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { PromotionsAdmin } from "./client";

export default async function AdminPromotions() {
  const [items, programs] = await Promise.all([
    prisma.promotion.findMany({ include: { fromProgram: true, toProgram: true }, orderBy: { endsAt: "desc" }, take: 200 }),
    listPrograms(false),
  ]);
  return (
    <>
      <PageHeader title="Promoções" subtitle="Promoções exibidas aos usuários. Criar uma promoção avisa quem tem alerta para o programa." />
      <PromotionsAdmin
        programs={programs.map((p) => ({ id: p.id, name: p.name }))}
        items={items.map((p) => ({
          id: p.id, kind: p.kind, title: p.title, description: p.description ?? "", fromProgramId: p.fromProgramId ?? "", toProgramId: p.toProgramId ?? "",
          from: p.fromProgram?.name ?? "", to: p.toProgram?.name ?? "", bonusPercent: p.bonusPercent, url: p.url ?? "",
          startsAt: p.startsAt.toISOString().slice(0, 10), endsAt: p.endsAt.toISOString().slice(0, 10), active: p.active,
        }))}
      />
    </>
  );
}

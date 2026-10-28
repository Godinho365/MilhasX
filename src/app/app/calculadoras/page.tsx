import { requirePageUser, selectedHolderId } from "@/server/session";
import { prisma } from "@/server/db";
import { listPartners, listClubPlans, cpmReferences } from "@/server/services/calculators";
import { PageHeader } from "@/components/stat";
import { Calculators } from "./client";

export default async function CalculatorsPage() {
  const user = await requirePageUser();
  const holderId = await selectedHolderId(user.id);
  const [programs, partners, clubs, refs] = await Promise.all([
    prisma.program.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    listPartners(true),
    listClubPlans(true),
    cpmReferences(user.id, holderId),
  ]);
  return (
    <>
      <PageHeader title="Calculadoras" subtitle="Ferramentas pra planejar transferência e acúmulo de pontos" />
      <Calculators
        programs={programs}
        partners={partners.map((p) => ({ fromId: p.fromProgramId, toId: p.toProgramId, fromUnits: p.fromUnits, toUnits: p.toUnits }))}
        clubs={clubs.map((c) => ({ id: c.id, programId: c.programId, name: c.name, modality: c.modality, miles: c.miles, monthlyCents: c.monthlyCents, signupBonus: c.signupBonus }))}
        refs={refs}
      />
    </>
  );
}

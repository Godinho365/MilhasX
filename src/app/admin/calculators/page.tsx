import { listPrograms } from "@/server/services/admin";
import { listPartners, listClubPlans } from "@/server/services/calculators";
import { PageHeader } from "@/components/stat";
import { CalculatorsAdmin } from "./client";

export default async function AdminCalculators() {
  const [programs, partners, clubs] = await Promise.all([listPrograms(true), listPartners(), listClubPlans()]);
  return (
    <>
      <PageHeader title="Calculadoras" subtitle="Parcerias de transferência e catálogo de clubes usados nas calculadoras" />
      <CalculatorsAdmin
        programs={programs.map((p) => ({ id: p.id, name: p.name }))}
        partners={partners.map((x) => ({ id: x.id, fromProgramId: x.fromProgramId, toProgramId: x.toProgramId, from: x.fromProgram.name, to: x.toProgram.name, fromUnits: x.fromUnits, toUnits: x.toUnits, active: x.active }))}
        clubs={clubs.map((x) => ({ id: x.id, programId: x.programId, program: x.program.name, name: x.name, modality: x.modality, miles: x.miles, monthlyCents: x.monthlyCents, signupBonus: x.signupBonus, active: x.active }))}
      />
    </>
  );
}

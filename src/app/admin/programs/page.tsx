import { listPrograms } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { ProgramsAdmin } from "./client";

export default async function AdminPrograms() {
  const programs = await listPrograms(true);
  return (
    <>
      <PageHeader title="Programas de fidelidade" />
      <ProgramsAdmin programs={programs.map((p) => ({ id: p.id, name: p.name, code: p.code, kind: p.kind, active: p.active, marketValueCpmCents: p.marketValueCpmCents, color: p.color, logoVersion: p.logoUpdatedAt?.getTime().toString() ?? null }))} />
    </>
  );
}

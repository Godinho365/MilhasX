// Dados das calculadoras: parcerias de transferência e catálogo de clubes (admin) e referências de CPM do usuário.
import { prisma, DomainError, audit } from "../db";

export type PartnerInput = { fromProgramId: string; toProgramId: string; fromUnits: number; toUnits: number; active: boolean };
export type ClubPlanInput = { programId: string; name: string; modality: string; miles: number; monthlyCents: number; signupBonus: number; active: boolean };

export async function listPartners(onlyActive = false) {
  return prisma.transferPartner.findMany({
    where: onlyActive ? { active: true, fromProgram: { active: true }, toProgram: { active: true } } : undefined,
    include: { fromProgram: { select: { name: true } }, toProgram: { select: { name: true } } },
    orderBy: [{ fromProgram: { name: "asc" } }, { toProgram: { name: "asc" } }],
  });
}

export async function upsertPartner(actorId: string, id: string | null, b: PartnerInput) {
  if (b.fromProgramId === b.toProgramId) throw new DomainError(400, "Origem e destino precisam ser diferentes");
  const dup = await prisma.transferPartner.findUnique({ where: { fromProgramId_toProgramId: { fromProgramId: b.fromProgramId, toProgramId: b.toProgramId } } });
  if (dup && dup.id !== id) throw new DomainError(409, "Essa parceria já está cadastrada");
  const row = id ? await prisma.transferPartner.update({ where: { id }, data: b }) : await prisma.transferPartner.create({ data: b });
  await audit(prisma, actorId, id ? "admin.partner_update" : "admin.partner_create", "TransferPartner", row.id);
  return row;
}

export async function deletePartner(actorId: string, id: string) {
  await prisma.transferPartner.deleteMany({ where: { id } });
  await audit(prisma, actorId, "admin.partner_delete", "TransferPartner", id);
}

export async function listClubPlans(onlyActive = false) {
  return prisma.clubPlan.findMany({
    where: onlyActive ? { active: true, program: { active: true } } : undefined,
    include: { program: { select: { name: true } } },
    orderBy: [{ program: { name: "asc" } }, { monthlyCents: "asc" }],
  });
}

export async function upsertClubPlan(actorId: string, id: string | null, b: ClubPlanInput) {
  const data = { ...b, name: b.name.trim(), modality: b.modality.trim() || "Mensal" };
  const dup = await prisma.clubPlan.findUnique({ where: { programId_name_modality: { programId: data.programId, name: data.name, modality: data.modality } } });
  if (dup && dup.id !== id) throw new DomainError(409, "Esse plano já está cadastrado");
  const row = id ? await prisma.clubPlan.update({ where: { id }, data }) : await prisma.clubPlan.create({ data });
  await audit(prisma, actorId, id ? "admin.club_plan_update" : "admin.club_plan_create", "ClubPlan", row.id);
  return row;
}

export async function deleteClubPlan(actorId: string, id: string) {
  await prisma.clubPlan.deleteMany({ where: { id } });
  await audit(prisma, actorId, "admin.club_plan_delete", "ClubPlan", id);
}

export type CpmRef = { label: string; detail: string; cpmCents: number };

/** "Buscar" CPM: custo médio das contas do usuário, preço dos fornecedores e o valor de mercado de cada programa. */
export async function cpmReferences(userId: string, holderId?: string): Promise<CpmRef[]> {
  const [accounts, suppliers, programs] = await Promise.all([
    prisma.account.findMany({ where: { userId, holderId, balance: { gt: 0 } }, include: { program: true, holder: true } }),
    prisma.supplierAccount.findMany({ where: { supplier: { userId }, priceCpmCents: { gt: 0 } }, include: { program: true, supplier: true } }),
    prisma.program.findMany({ where: { active: true, marketValueCpmCents: { gt: 0 } }, orderBy: { name: "asc" } }),
  ]);
  return [
    ...accounts.filter((a) => a.costCents > 0).map((a) => ({ label: `${a.program.name} · ${a.holder.name}`, detail: "Seu custo médio", cpmCents: Math.round((a.costCents * 1000) / a.balance) })),
    ...suppliers.map((s) => ({ label: `${s.program.name} · ${s.supplier.name}`, detail: "Fornecedor", cpmCents: s.priceCpmCents })),
    ...programs.map((p) => ({ label: p.name, detail: "Valor de mercado", cpmCents: p.marketValueCpmCents })),
  ];
}

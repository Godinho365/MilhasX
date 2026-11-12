import { requirePageUser } from "@/server/session";
import { listMembers, listPartners } from "@/server/services/team";
import { PageHeader } from "@/components/stat";
import { MembersClient } from "./client";
import { can } from "@/domain/permissions";

export default async function TeamPage() {
  const user = await requirePageUser();
  const [members, partners] = await Promise.all([listMembers(user.id), listPartners(user.id)]);
  return (
    <>
      <PageHeader title="Equipe" subtitle="Sua equipe, os parceiros e as regras de comissão" />
      <MembersClient members={members} partners={partners} owner={{ name: user.name, email: user.email }} manage={can(user.actor.permissions, "equipe", "edit")} me={user.actor.memberId} />
    </>
  );
}

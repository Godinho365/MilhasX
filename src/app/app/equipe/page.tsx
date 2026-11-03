import { requirePageUser } from "@/server/session";
import { listMembers, listPartners } from "@/server/services/team";
import { PageHeader } from "@/components/stat";
import { MembersClient } from "./client";

export default async function TeamPage() {
  const user = await requirePageUser();
  const [members, partners] = await Promise.all([listMembers(user.id), listPartners(user.id)]);
  return (
    <>
      <PageHeader title="Equipe" subtitle="Sua equipe, os parceiros e as regras de comissão" />
      <MembersClient members={members} partners={partners} owner={{ name: user.name, email: user.email }} />
    </>
  );
}

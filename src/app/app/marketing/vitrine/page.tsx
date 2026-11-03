import { requirePageUser } from "@/server/session";
import { listShowcase, showcaseCandidates, showcaseSettings } from "@/server/services/showcase";
import { ShowcaseClient } from "./client";

export default async function VitrinePage() {
  const user = await requirePageUser();
  const [items, settings, candidates] = await Promise.all([listShowcase(user.id), showcaseSettings(user.id), showcaseCandidates(user.id)]);
  return <ShowcaseClient items={items} settings={settings} candidates={candidates} />;
}

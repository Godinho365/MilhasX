import { requirePageUser } from "@/server/session";
import { getSite } from "@/server/services/site";
import { listShowcase } from "@/server/services/showcase";
import { SiteBuilder } from "./client";

// Marketing › Site: escolher o tema e montar as páginas do site da agência
export default async function SitePage() {
  const user = await requirePageUser();
  const [site, packages] = await Promise.all([getSite(user.id), listShowcase(user.id)]);
  return <SiteBuilder initial={site} packages={packages.filter((p) => p.active)} />;
}

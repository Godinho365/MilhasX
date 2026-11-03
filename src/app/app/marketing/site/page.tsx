import { requirePageUser, appName, publicBrand } from "@/server/session";
import { getSite } from "@/server/services/site";
import { listShowcase } from "@/server/services/showcase";
import { getSalesProfile } from "@/server/services/settings";
import { listPrograms } from "@/server/services/admin";
import { hasFeature } from "@/server/services/plan-limits";
import { listSignatures } from "@/server/services/client-pages";
import { effectivePlan, PLANS } from "@/domain/plans";
import { SiteAndCentral } from "./tabs";

// Marketing › Site: o site da agência (tema e páginas) e, na outra aba, a Central de atendimento
export default async function SitePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requirePageUser();
  const [site, packages, profile, programs, canBrand, signatures] = await Promise.all([
    getSite(user.id), listShowcase(user.id), getSalesProfile(user.id), listPrograms(false), hasFeature(user.id, "pageBranding"), listSignatures(user.id),
  ]);
  const eff = effectivePlan(user);
  const planNote = eff.trialDaysLeft > 0
    ? `Teste do plano ${PLANS[eff.plan].name}: cor de fundo, banner e prévia do link liberados por mais ${eff.trialDaysLeft} ${eff.trialDaysLeft === 1 ? "dia" : "dias"}. Depois disso, eles voltam ao padrão, a menos que você assine o PRO.`
    : canBrand ? null : "Cor de fundo, banner e prévia do link fazem parte do plano PRO.";
  return (
    <SiteAndCentral
      tab={(await searchParams).aba === "central" ? "central" : "site"}
      site={site}
      packages={packages.filter((p) => p.active)}
      central={{
        profile, defaultName: user.name, programs: programs.map((p) => ({ id: p.id, name: p.name })), brand: publicBrand(), appName: appName(),
        canBrand, planNote: user.role === "ADMIN" ? null : planNote, signatures,
      }}
    />
  );
}

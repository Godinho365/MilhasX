import { requirePageUser, appName, publicBrand } from "@/server/session";
import { getSalesProfile } from "@/server/services/settings";
import { listPrograms } from "@/server/services/admin";
import { hasFeature } from "@/server/services/plan-limits";
import { listSignatures } from "@/server/services/client-pages";
import { effectivePlan, PLANS } from "@/domain/plans";
import { PageEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personalizar página", robots: { index: false } };

// Editor "Personalizar" da Sua MilhasX em página própria (fora do menu do app), como na simbora.la.
export default async function EditorPage() {
  const user = await requirePageUser();
  const canBrand = await hasFeature(user.id, "pageBranding");
  const eff = effectivePlan(user);
  const planNote = eff.trialDaysLeft > 0
    ? `Teste do plano ${PLANS[eff.plan].name}: cor de fundo, banner e prévia do link liberados por mais ${eff.trialDaysLeft} ${eff.trialDaysLeft === 1 ? "dia" : "dias"}. Depois disso, eles voltam ao padrão, a menos que você assine o PRO.`
    : canBrand ? null : "Cor de fundo, banner e prévia do link fazem parte do plano PRO.";
  return (
    <PageEditor
      profile={await getSalesProfile(user.id)}
      defaultName={user.name}
      programs={(await listPrograms(false)).map((p) => ({ id: p.id, name: p.name }))}
      brand={publicBrand()}
      appName={appName()}
      canBrand={canBrand}
      planNote={user.role === "ADMIN" ? null : planNote}
      signatures={await listSignatures(user.id)}
    />
  );
}

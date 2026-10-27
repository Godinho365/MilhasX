import Link from "next/link";
import { requirePageUser, publicBrand } from "@/server/session";
import { PageHeader } from "@/components/stat";
import { getPreferences, billingState, referralState, getSalesProfile } from "@/server/services/settings";
import { mpEnabled, syncSubscription } from "@/server/services/billing-mp";
import { GeneralTab, ProfileTab } from "./client";
import { BillingTab, ReferralsTab, SalesProfileTab } from "./tabs";

const TABS = [
  ["", "Geral"],
  ["profile", "Perfil"],
  ["billing", "Assinatura"],
  ["referrals", "Indicações"],
  ["sales-profile", `Sua ${publicBrand()}`],
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; preapproval_id?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  let checkout: "ok" | "pendente" | "erro" | null = null;
  if (sp.preapproval_id && mpEnabled()) {
    try {
      checkout = (await syncSubscription(sp.preapproval_id, user.id)).status === "AUTHORIZED" ? "ok" : "pendente";
    } catch {
      checkout = "erro";
    }
  }
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "";
  return (
    <>
      <PageHeader title="Configurações" />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Seções das configurações">
        {TABS.map(([k, l]) => (
          <Link
            key={k}
            href={k ? `/app/settings?tab=${k}` : "/app/settings"}
            aria-current={tab === k ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-accent-light text-white" : "border-transparent text-muted hover:text-zinc-100"}`}
          >
            {l}
          </Link>
        ))}
      </nav>
      <div className="mx-auto w-full max-w-2xl">
        {tab === "" && <GeneralTab prefs={await getPreferences(user.id)} />}
        {tab === "profile" && <ProfileTab name={user.name} email={user.email} avatarVersion={user.avatarUpdatedAt?.getTime().toString() ?? null} deletionRequestedAt={user.deletionRequestedAt?.toISOString() ?? null} />}
        {tab === "billing" && <BillingTab state={await billingState(user.id)} checkout={checkout} />}
        {tab === "referrals" && <ReferralsTab state={await referralState(user.id)} />}
        {tab === "sales-profile" && <SalesProfileTab profile={await getSalesProfile(user.id)} defaultName={user.name} brand={publicBrand()} />}
      </div>
    </>
  );
}

import Link from "next/link";
import { requirePageUser, publicBrand } from "@/server/session";
import { PageHeader } from "@/components/stat";
import { getPreferences, billingState, referralState, getSalesProfile } from "@/server/services/settings";
import { mpEnabled, syncSubscription } from "@/server/services/billing-mp";
import { GeneralTab, ProfileTab } from "./client";
import { BillingTab, ReferralsTab, SalesProfileTab } from "./tabs";
import { TelegramTab } from "./telegram";
import { telegramStatus } from "@/server/services/telegram";
import { can, type AreaKey } from "@/domain/permissions";

// Abas e quem vê: as pessoais (geral, perfil) todo mundo; assinatura e indicações só o dono; as da agência pela
// função do membro da equipe
const TABS: readonly (readonly [string, string, "any" | "owner" | AreaKey])[] = [
  ["", "Geral", "any"],
  ["profile", "Perfil", "any"],
  ["billing", "Assinatura", "owner"],
  ["referrals", "Indicações", "owner"],
  ["sales-profile", `Sua ${publicBrand()}`, "marketing"],
  ["telegram", "Telegram", "configuracoes"],
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; preapproval_id?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const me = user.actor;
  const tabs = TABS.filter(([, , who]) => who === "any" || me.isOwner || (who !== "owner" && can(me.permissions, who)));
  let checkout: "ok" | "pendente" | "erro" | null = null;
  if (sp.preapproval_id && mpEnabled() && me.isOwner) {
    try {
      checkout = (await syncSubscription(sp.preapproval_id, user.id)).status === "AUTHORIZED" ? "ok" : "pendente";
    } catch {
      checkout = "erro";
    }
  }
  const tab = tabs.find(([k]) => k === sp.tab)?.[0] ?? "";
  // preferências: as pessoais de quem entrou; as da agência (avisos, PIX, termo) da conta do dono
  const personal = await getPreferences(me.id);
  const prefs = me.isOwner ? personal : await getPreferences(user.id).then((a) => ({ ...personal, notifications: a.notifications, pix: a.pix, emissionTerms: a.emissionTerms }));
  return (
    <>
      <PageHeader title="Configurações" />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Seções das configurações">
        {tabs.map(([k, l]) => (
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
        {tab === "" && <GeneralTab prefs={prefs} />}
        {tab === "profile" && <ProfileTab name={me.name} email={me.email} avatarVersion={me.avatarUpdatedAt?.getTime().toString() ?? null} deletionRequestedAt={me.isOwner ? user.deletionRequestedAt?.toISOString() ?? null : null} canDelete={me.isOwner} />}
        {tab === "billing" && <BillingTab state={await billingState(user.id)} checkout={checkout} />}
        {tab === "referrals" && <ReferralsTab state={await referralState(user.id)} />}
        {tab === "sales-profile" && <SalesProfileTab profile={await getSalesProfile(user.id)} defaultName={user.name} brand={publicBrand()} />}
        {tab === "telegram" && <TelegramTab initial={await telegramStatus(user.id)} />}
      </div>
    </>
  );
}

import { getSettings } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { SettingsForm } from "./client";

export default async function AdminSettings() {
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Parâmetros da aplicação" />
      <SettingsForm registrationOpen={s.registrationOpen !== false} supportEmail={String(s.supportEmail ?? "")} announcement={String(s.announcement ?? "")} />
    </>
  );
}

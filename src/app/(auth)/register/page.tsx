import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { googleEnabled } from "@/server/google-oauth";
import { turnstileSiteKey } from "@/server/captcha";
import { signupCodeRequired } from "@/server/services/email-code";
import { RegisterForm } from "./form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect("/app");
  const sp = await searchParams;
  return <RegisterForm google={googleEnabled()} siteKey={turnstileSiteKey()} initialError={sp.erro?.slice(0, 200) ?? ""} codeRequired={signupCodeRequired()} />;
}

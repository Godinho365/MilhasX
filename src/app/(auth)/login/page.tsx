import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { googleEnabled } from "@/server/google-oauth";
import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect("/app");
  const sp = await searchParams;
  return <LoginForm google={googleEnabled()} initialError={sp.erro?.slice(0, 200) ?? ""} />;
}

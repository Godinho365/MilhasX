import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { LoginForm } from "./form";

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");
  return <LoginForm />;
}

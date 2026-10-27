import { redirect } from "next/navigation";

// /app/simulators abre a Compra Bonificada, como na referência
export default function SimulatorsIndex() {
  redirect("/app/simulators/purchase/bonificada");
}

import { redirect } from "next/navigation";

// O editor da Central de atendimento agora fica em Marketing › Site, na aba ao lado do site
// (mesmo tema nas duas). Este endereço continua valendo para links antigos.
export default function EditorPage() {
  redirect("/app/marketing/site?aba=central");
}

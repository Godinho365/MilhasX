import type { Metadata } from "next";
import Link from "next/link";
import { turnstileSiteKey } from "@/server/captcha";
import { contactEmail } from "@/server/contact";
import { PrivacyRequestForm } from "./form";

export const metadata: Metadata = { title: "Pedidos sobre seus dados" };

export default function PrivacyRequestPage() {
  const contact = contactEmail();
  return (
    <>
      <h1>Pedidos sobre seus dados</h1>
      <p className="updated">LGPD, art. 18</p>
      <p>
        Use este formulário para pedir acesso, correção, eliminação, portabilidade ou outras informações sobre os seus dados pessoais. Os dados que
        você informar aqui servem só para responder ao pedido. Veja a <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
      </p>
      <p>
        Se o pedido for sobre dados que uma agência de viagens cadastrou ou recebeu pela página dela, fale também diretamente com a agência: ela é a
        responsável por esses dados.
      </p>
      {contact && <p>Se preferir, escreva para <a href={`mailto:${contact}`} className="underline">{contact}</a>.</p>}
      <PrivacyRequestForm siteKey={turnstileSiteKey()} />
    </>
  );
}

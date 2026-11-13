import Link from "next/link";
import { UtmKeeper } from "@/components/utm-keeper";
import { CookiePreferencesLink } from "@/components/consent/link";

// Guarda os parâmetros do link do anúncio (UTM) na chegada, para o pedido de cotação levar junto (só com o
// consentimento de marketing). Rodapé discreto com a privacidade e as preferências de cookies.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <UtmKeeper />
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-24 pt-6 text-center text-xs text-muted">
        <Link href="/privacidade" className="hover:underline">Privacidade</Link>
        <CookiePreferencesLink className="hover:underline" />
      </p>
    </>
  );
}

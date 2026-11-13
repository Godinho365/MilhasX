import { UtmKeeper } from "@/components/utm-keeper";

// Guarda os parâmetros do link do anúncio (UTM) na chegada, para o pedido de cotação levar junto (só com o
// consentimento de marketing). O link das preferências de cookies fica no rodapé do site (site-view).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<UtmKeeper /></>;
}

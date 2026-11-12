import { UtmKeeper } from "@/components/utm-keeper";

// Guarda os parâmetros do link do anúncio (UTM) na chegada, para o pedido de cotação levar junto.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<UtmKeeper /></>;
}

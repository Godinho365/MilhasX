import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "@fontsource-variable/inter";
import "./globals.css";
import { FeedbackHost } from "@/components/feedback";
import { RenderStamp } from "@/components/render-stamp";
import { ConsentProvider } from "@/components/consent/consent";
import { CONSENT_COOKIE, decodeConsent } from "@/domain/consent";
import { SESSION_COOKIE } from "@/server/auth";

export const metadata: Metadata = {
  title: process.env.APP_NAME || "MilhasX",
  description: "Gestão de milhas e pontos: carteiras, custo do milheiro, extrato, compras e vendas.",
  // Endereço absoluto das imagens de prévia de link (Open Graph)
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema vem do cookie já no HTML do servidor: a página abre no tema certo, sem piscar
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  // Escolha de cookies deste navegador (a da conta chega pelo ConsentProvider, sem consulta ao banco aqui)
  const consent = decodeConsent(jar.get(CONSENT_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme} suppressHydrationWarning>
      <body>
        {children}
        <FeedbackHost />
        <RenderStamp value={Date.now()} />
        <ConsentProvider initial={consent} signedIn={jar.has(SESSION_COOKIE)} />
      </body>
    </html>
  );
}

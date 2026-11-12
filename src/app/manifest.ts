import type { MetadataRoute } from "next";

/** App instalável ("Adicionar à tela inicial"). No iPhone, o push só funciona com o app instalado. */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.APP_NAME || "MilhasX";
  return {
    name,
    short_name: name,
    description: "Gestão de milhas e pontos: carteiras, custo do milheiro, extrato, compras e vendas.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

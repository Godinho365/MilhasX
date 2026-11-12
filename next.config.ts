import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  // Permite um build separado (ex.: testes E2E) sem conflitar com o servidor de desenvolvimento
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Cliente do Telegram (GramJS): roda só no servidor, como pacote do Node, sem passar pelo empacotador
  serverExternalPackages: ["telegram"],
  async headers() {
    return [
      // A prévia do editor da página pública roda num iframe do próprio app; o resto nunca é emoldurado
      { source: "/((?!preview/).*)", headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }] },
      { source: "/preview/:path*", headers: [...securityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // O service worker precisa ser relido a cada visita para as atualizações chegarem
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
};

export default config;

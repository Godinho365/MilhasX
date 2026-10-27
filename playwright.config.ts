import { defineConfig } from "@playwright/test";

// Testes de ponta a ponta pela interface. Precisa do banco no ar e dos programas do seed
// (npm run db:up && npm run db:seed). Faz um build de produção próprio (.next-e2e) e sobe na porta 3200.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "e2e/.results",
  use: {
    baseURL: "http://localhost:3200",
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next build && npx next start -p 3200",
    url: "http://localhost:3200/login",
    env: { NEXT_DIST_DIR: ".next-e2e", APP_URL: "http://localhost:3200" },
    reuseExistingServer: false,
    timeout: 400_000,
  },
});

import { defineConfig } from "@playwright/test";
import { useE2eDatabase } from "./e2e/db";

// Nunca o banco do .env (no servidor é o de produção): banco próprio, criado e preparado no globalSetup.
const DATABASE_URL = useE2eDatabase();

// Testes de ponta a ponta pela interface. Precisa do banco no ar e dos programas do seed
// (npm run db:up; o banco do E2E, E2E_DATABASE_URL ou "<TEST_DATABASE_URL>_e2e", é criado e semeado sozinho). Faz um build de produção próprio (.next-e2e) e sobe na porta 3200.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
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
    env: { NEXT_DIST_DIR: ".next-e2e", APP_URL: "http://localhost:3200", DATABASE_URL },
    reuseExistingServer: false,
    timeout: 400_000,
  },
});

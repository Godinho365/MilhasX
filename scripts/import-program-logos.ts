// Aplica os ícones de prisma/program-logos aos programas cadastrados.
// Uso: npm run db:logos            (só programas sem logo)
//      npm run db:logos -- --force  (substitui também os logos já enviados)
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const { prisma } = await import("../src/server/db");
  const { importProgramLogos } = await import("../prisma/program-logos");
  const done = await importProgramLogos(prisma, { force: process.argv.includes("--force") });
  console.log(done.length ? `Logos aplicados: ${done.join(", ")}` : "Nenhum programa precisava de logo.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

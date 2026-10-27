// Coleta o catálogo de lojas das fontes automáticas (para agendar de hora em hora, ex.: cron).
// Uso: npm run stores:import            (todas as fontes)
//      npm run stores:import -- esfera  (só uma; "meliuz" = cashback da Méliuz)
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const { prisma } = await import("../src/server/db");
  const { importFromSource, importMeliuz, SOURCES } = await import("../src/server/services/store-import");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  let failed = false;
  for (const key of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
    if (only.length && !only.includes(key)) continue;
    try {
      const r = await importFromSource(null, key);
      console.log(`${SOURCES[key].label}: ${r.status} · ${r.total} lojas (${r.created} novas, ${r.updated} alteradas, ${r.ignored} ignoradas, ${r.removed} removidas)`);
    } catch (e) {
      failed = true;
      console.error(`${SOURCES[key].label}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!only.length || only.includes("meliuz")) {
    try {
      const r = await importMeliuz(null);
      console.log(`Méliuz: ${r.status} · ${r.total} lojas com cashback (${r.created} novas, ${r.updated} alteradas, ${r.ignored} com falha de leitura, ${r.removed} removidas)`);
    } catch (e) {
      failed = true;
      console.error(`Méliuz: ${e instanceof Error ? e.message : e}`);
    }
  }
  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main();

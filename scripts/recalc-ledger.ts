// Recalcula custos e saldos refazendo o extrato (replay) — útil depois de corrigir uma regra do ledger.
// Uso: npm run ledger:recalc -- usuario@exemplo.com   (um usuário)
//      npm run ledger:recalc -- --all                 (todos)
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const { prisma } = await import("../src/server/db");
  const { withLedger } = await import("../src/server/services/ledger");
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const emails = args.filter((a) => !a.startsWith("-"));
  if (!all && emails.length === 0) throw new Error("Informe um e-mail ou --all");
  const users = await prisma.user.findMany({ where: all ? {} : { email: { in: emails } }, select: { id: true, email: true } });
  let failed = false;
  for (const u of users) {
    try {
      await withLedger(u.id, async () => {});
      console.log(`${u.email}: recalculado`);
    } catch (e) {
      failed = true;
      console.error(`${u.email}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await prisma.$disconnect();
  if (failed) process.exitCode = 1;
}

main();

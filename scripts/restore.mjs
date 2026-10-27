// Restaura um backup gerado por backup.mjs. SUBSTITUI os dados atuais do banco "milheiro".
// Uso: npm run db:restore -- backups/arquivo.dump --yes
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Informe o arquivo: npm run db:restore -- backups/arquivo.dump --yes");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("A restauração apaga os dados atuais. Pare a aplicação e rode de novo com --yes para confirmar.");
  process.exit(1);
}
const p = spawn(
  "docker",
  ["compose", "exec", "-T", "db", "pg_restore", "-U", "milheiro", "-d", "milheiro", "--clean", "--if-exists", "--no-owner"],
  { stdio: ["pipe", "inherit", "inherit"] },
);
createReadStream(file).pipe(p.stdin);
p.on("close", (code) => {
  console.log(code === 0 ? "Restauração concluída." : `pg_restore terminou com código ${code}`);
  process.exit(code ?? 1);
});

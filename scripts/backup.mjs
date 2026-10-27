// Backup do PostgreSQL via docker compose (pg_dump em formato custom).
// Uso: npm run db:backup  →  backups/milheiro-AAAA-MM-DDTHH-MM.dump
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

const dir = path.resolve("backups");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `milheiro-${new Date().toISOString().slice(0, 16).replace(/:/g, "-")}.dump`);
const out = createWriteStream(file, { mode: 0o600 });
const p = spawn("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", "milheiro", "-d", "milheiro", "-Fc"], { stdio: ["ignore", "pipe", "inherit"] });
p.stdout.pipe(out);
p.on("close", (code) => {
  if (code !== 0) {
    console.error(`pg_dump falhou (código ${code})`);
    process.exit(code ?? 1);
  }
  console.log(`Backup salvo em ${file}`);
});

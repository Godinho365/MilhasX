// Gera a prévia de todos os e-mails num arquivo HTML para abrir no navegador.
// Uso: npm run mail:preview   (gera email-preview.html na pasta do projeto)
import { existsSync, writeFileSync } from "node:fs";
import { brandFromEnv, escapeHtml, renderEmail } from "../src/server/emails/layout";
import { sampleEmails } from "../src/server/emails/samples";

if (existsSync(".env")) process.loadEnvFile(".env");
const brand = { ...brandFromEnv(), appUrl: brandFromEnv().appUrl || "https://gomilhasx.com" };
const items = sampleEmails(brand).map((c) => renderEmail(c, brand));
const page = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prévia dos e-mails</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#e5e7eb}h2{font-size:14px;margin:0;padding:12px 16px;background:#18181b;color:#fff}
section{max-width:680px;margin:24px auto;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px #0002;background:#fff}iframe{width:100%;height:760px;border:0;display:block}</style></head><body>
${items.map((r) => `<section><h2>${escapeHtml(r.subject)}</h2><iframe srcdoc="${escapeHtml(r.html)}"></iframe></section>`).join("\n")}
</body></html>`;
writeFileSync("email-preview.html", page);
console.log(`Prévia com ${items.length} e-mails em email-preview.html`);

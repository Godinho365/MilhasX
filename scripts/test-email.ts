// Testa o envio de e-mail pelo SMTP configurado no .env.
// Uso: npm run mail:test -- destino@exemplo.com
import { existsSync } from "node:fs";
import { sendMail, verifySmtp } from "../src/server/mailer";

async function main() {
  if (existsSync(".env") && !process.env.SMTP_HOST) process.loadEnvFile(".env");
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Uso: npm run mail:test -- destino@exemplo.com");
    process.exit(1);
  }
  const smtp = await verifySmtp();
  console.log(`Login no SMTP ${smtp.host}:${smtp.port} como ${smtp.user}: ok`);
  const ok = await sendMail(to, "Teste de e-mail", "Este é um e-mail de teste do envio pelo SMTP.\n\nSe você recebeu, o envio está funcionando.");
  console.log(ok ? `E-mail de teste enviado para ${to}` : "Falha no envio (veja o log acima)");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`Falha: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

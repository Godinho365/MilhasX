import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "./db";

/**
 * Envio de e-mail. Sem provedor configurado, as mensagens vão para a "caixa de saída" local
 * (pasta MAIL_OUTBOX_DIR, padrão ./.outbox), fora do git e fora dos logs.
 * Para produção, troque esta função por um provedor (SMTP/API) — ver docs/deploy.md.
 */
export async function sendMail(to: string, subject: string, body: string) {
  if (process.env.NODE_ENV === "test") return;
  const dir = process.env.MAIL_OUTBOX_DIR || path.join(process.cwd(), ".outbox");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`);
  await writeFile(file, `Para: ${to}\nAssunto: ${subject}\n\n${body}\n`, { mode: 0o600 });
  log("info", "mail.queued_to_outbox", { subject });
}

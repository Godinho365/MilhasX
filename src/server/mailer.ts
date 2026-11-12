import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { log } from "./db";
import { brandFromEnv, renderEmail, type EmailContent } from "./emails/layout";
import { plainEmail } from "./emails/templates";

/**
 * Envio de e-mail. Com SMTP_HOST/SMTP_USER/SMTP_PASS configurados, envia pelo servidor SMTP
 * (ex.: Hostinger: smtp.hostinger.com, porta 465). Sem eles, as mensagens vão para a "caixa de
 * saída" local (pasta MAIL_OUTBOX_DIR, padrão ./.outbox), fora do git e fora dos logs.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS ?? "";
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT) || 465;
  const appName = env.APP_NAME?.trim() || "MilhasX";
  // O remetente precisa ser a própria caixa (ou um alias dela): o provedor recusa outros endereços
  const from = env.MAIL_FROM?.trim() || `"${appName.replace(/"/g, "")}" <${user}>`;
  return { host, port, user, pass, from };
}

let cached: { key: string; transporter: Transporter } | null = null;
function transporterFor(c: SmtpConfig) {
  const key = `${c.host}:${c.port}:${c.user}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.port === 465, // 465 = TLS direto; 587 = STARTTLS
        requireTLS: c.port !== 465,
        auth: { user: c.user, pass: c.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return cached.transporter;
}

export interface SentMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Nos testes nada sai: as mensagens ficam aqui para conferir. */
export const testOutbox: SentMail[] = [];

/** Envia o e-mail já montado. Nunca lança erro: falha de envio vira log (quem chama não deve vazar o motivo). */
async function deliver(m: SentMail): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    testOutbox.push(m);
    return true;
  }
  const smtp = smtpConfig();
  if (smtp) {
    try {
      const replyTo = brandFromEnv().contactEmail || undefined;
      await transporterFor(smtp).sendMail({ from: smtp.from, replyTo, to: m.to, subject: m.subject, text: m.text, html: m.html });
      log("info", "mail.sent", { subject: m.subject });
      return true;
    } catch (e) {
      log("error", "mail.failed", { subject: m.subject, err: String(e) });
      return false;
    }
  }
  const dir = process.env.MAIL_OUTBOX_DIR || path.join(process.cwd(), ".outbox");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${m.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}`);
  await writeFile(`${file}.txt`, `Para: ${m.to}\nAssunto: ${m.subject}\n\n${m.text}\n`, { mode: 0o600 });
  await writeFile(`${file}.html`, m.html, { mode: 0o600 });
  log("info", "mail.queued_to_outbox", { subject: m.subject });
  return true;
}

/** Envia um e-mail no modelo visual padrão (src/server/emails). */
export async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const r = renderEmail(content, brandFromEnv());
  return deliver({ to, ...r });
}

/** Mensagem avulsa em texto: sai no modelo padrão, com os parágrafos separados por linha em branco. */
export async function sendMail(to: string, subject: string, body: string): Promise<boolean> {
  return sendEmail(to, plainEmail({ subject, text: body, reason: `você tem uma conta no ${brandFromEnv().appName}` }));
}

/** Confere a conexão e o login no SMTP (usado pelo script de teste de e-mail). */
export async function verifySmtp() {
  const smtp = smtpConfig();
  if (!smtp) throw new Error("SMTP não configurado (SMTP_HOST, SMTP_USER, SMTP_PASS)");
  await transporterFor(smtp).verify();
  return smtp;
}

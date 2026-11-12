import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { log } from "./db";

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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Versão HTML simples do texto: quebras de linha e links clicáveis. */
export function textToHtml(text: string, appName: string) {
  const body = escapeHtml(text)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#2563eb;word-break:break-all">${url}</a>`)
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="font-size:20px;font-weight:bold;margin:0 0 16px">${escapeHtml(appName)}</p>
<div style="background:#fff;border:1px solid #e2e4e9;border-radius:12px;padding:24px;font-size:15px;line-height:1.6">${body}</div>
<p style="font-size:12px;color:#646874;margin:16px 0 0">E-mail automático. Não responda esta mensagem.</p>
</div></body></html>`;
}

/** Envia o e-mail. Nunca lança erro: falha de envio vira log (quem chama não deve vazar o motivo). */
export async function sendMail(to: string, subject: string, body: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") return true;
  const smtp = smtpConfig();
  if (smtp) {
    try {
      const appName = process.env.APP_NAME?.trim() || "MilhasX";
      await transporterFor(smtp).sendMail({ from: smtp.from, to, subject, text: body, html: textToHtml(body, appName) });
      log("info", "mail.sent", { subject });
      return true;
    } catch (e) {
      log("error", "mail.failed", { subject, err: String(e) });
      return false;
    }
  }
  const dir = process.env.MAIL_OUTBOX_DIR || path.join(process.cwd(), ".outbox");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`);
  await writeFile(file, `Para: ${to}\nAssunto: ${subject}\n\n${body}\n`, { mode: 0o600 });
  log("info", "mail.queued_to_outbox", { subject });
  return true;
}

/** Confere a conexão e o login no SMTP (usado pelo script de teste de e-mail). */
export async function verifySmtp() {
  const smtp = smtpConfig();
  if (!smtp) throw new Error("SMTP não configurado (SMTP_HOST, SMTP_USER, SMTP_PASS)");
  await transporterFor(smtp).verify();
  return smtp;
}

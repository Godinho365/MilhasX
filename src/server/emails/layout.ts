/**
 * Modelo visual único dos e-mails. Feito com tabelas e estilos inline (o que Gmail, Outlook e o
 * Mail do celular entendem), com versão em texto puro para quem não abre HTML.
 */

export interface EmailContent {
  subject: string;
  /** Linha cinza que aparece ao lado do assunto na caixa de entrada. */
  preheader: string;
  heading: string;
  /** Parágrafos. **texto** vira negrito. */
  paragraphs: string[];
  /** Código em destaque (ex.: verificação do e-mail). */
  code?: string;
  button?: { label: string; url: string };
  /** Lista de itens (ex.: primeiros passos). */
  steps?: { title: string; text: string }[];
  /** Aviso menor depois do botão (validade do link, "se não foi você"...). */
  note?: string;
  /** Completa "Você recebeu este e-mail porque ...". */
  reason: string;
}

export interface EmailBrand {
  appName: string;
  appUrl: string;
  contactEmail: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const C = {
  bg: "#f3f4f6",
  card: "#ffffff",
  line: "#e5e7eb",
  text: "#18181b",
  muted: "#6b7280",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Escapa e aplica o **negrito**. */
const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.text}">$1</strong>`);
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

export function brandFromEnv(env: NodeJS.ProcessEnv = process.env): EmailBrand {
  const appName = env.APP_NAME?.trim() || "MilhasX";
  let appUrl = "";
  try {
    appUrl = env.APP_URL ? new URL(env.APP_URL).origin : "";
  } catch {
    appUrl = "";
  }
  const contact = env.CONTACT_EMAIL?.trim() ?? "";
  return { appName, appUrl, contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : "" };
}

export function renderEmail(e: EmailContent, b: EmailBrand): RenderedEmail {
  return { subject: e.subject, text: renderText(e, b), html: renderHtml(e, b) };
}

function renderText(e: EmailContent, b: EmailBrand) {
  const out: string[] = [e.heading, ""];
  for (const p of e.paragraphs) out.push(plain(p), "");
  if (e.code) out.push(e.code, "");
  if (e.steps?.length) {
    e.steps.forEach((s, i) => out.push(`${i + 1}. ${s.title}: ${s.text}`));
    out.push("");
  }
  if (e.button) out.push(`${e.button.label}: ${e.button.url}`, "");
  if (e.note) out.push(plain(e.note), "");
  out.push("—", b.appName);
  if (b.appUrl) out.push(b.appUrl);
  out.push(`Você recebeu este e-mail porque ${e.reason}.`);
  if (b.contactEmail) out.push(`Dúvidas: ${b.contactEmail}`);
  return out.join("\n");
}

function renderHtml(e: EmailContent, b: EmailBrand) {
  const name = escapeHtml(b.appName);
  const logo = b.appUrl
    ? `<img src="${b.appUrl}/icon.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px">`
    : "";
  const paragraphs = e.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46">${inline(p)}</p>`)
    .join("");
  const code = e.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td align="center" style="background:${C.accentSoft};border-radius:12px;padding:20px 12px">
<span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${C.text}">${escapeHtml(e.code)}</span>
</td></tr></table>`
    : "";
  const steps = e.steps?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px">${e.steps
        .map(
          (s, i) => `<tr><td valign="top" width="36" style="padding:0 0 14px">
<div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${C.accentSoft};color:${C.accent};font-size:13px;font-weight:700;text-align:center">${i + 1}</div></td>
<td valign="top" style="padding:2px 0 14px;font-size:15px;line-height:1.5;color:#3f3f46"><strong style="color:${C.text}">${escapeHtml(s.title)}</strong><br>${inline(s.text)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const button = e.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:${C.accent}">
<a href="${escapeHtml(e.button.url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(e.button.label)}</a>
</td></tr></table>
<p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:${C.muted}">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${escapeHtml(e.button.url)}" style="color:${C.accent};word-break:break-all">${escapeHtml(e.button.url)}</a></p>`
    : "";
  const note = e.note
    ? `<p style="margin:0;padding-top:16px;border-top:1px solid ${C.line};font-size:13px;line-height:1.5;color:${C.muted}">${inline(e.note)}</p>`
    : "";
  const link = (path: string, label: string) => (b.appUrl ? `<a href="${b.appUrl}${path}" style="color:${C.muted};text-decoration:underline">${label}</a>` : "");
  const footerLinks = [link("", name), link("/termos", "Termos de Serviço"), link("/privacidade", "Política de Privacidade")].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const contact = b.contactEmail
    ? `<br>Dúvidas? Fale com a gente em <a href="mailto:${escapeHtml(b.contactEmail)}" style="color:${C.muted}">${escapeHtml(b.contactEmail)}</a>.`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(e.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(e.preheader)}${"&#8199;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT}">
<tr><td style="padding:0 4px 20px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${logo ? `<td style="padding-right:10px">${logo}</td>` : ""}<td style="font-size:20px;font-weight:700;color:${C.text};letter-spacing:-0.2px">${name}</td>
</tr></table>
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:32px 28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${C.text}">${escapeHtml(e.heading)}</h1>
${paragraphs}${code}${steps}${button}${note}
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
Você recebeu este e-mail porque ${escapeHtml(e.reason)}.${contact}
${footerLinks ? `<br><br>${footerLinks}` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

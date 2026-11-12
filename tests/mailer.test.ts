import { describe, it, expect } from "vitest";
import { smtpConfig } from "@/server/mailer";
import { renderEmail } from "@/server/emails/layout";
import { plainEmail } from "@/server/emails/templates";

describe("envio de e-mail (SMTP)", () => {
  it("só liga o SMTP com host, usuário e senha", () => {
    expect(smtpConfig({ SMTP_HOST: "smtp.hostinger.com", SMTP_USER: "a@x.test" } as never)).toBeNull();
    const c = smtpConfig({ SMTP_HOST: "smtp.hostinger.com", SMTP_USER: "naoresponda@x.test", SMTP_PASS: "s", APP_NAME: "MilhasX" } as never)!;
    expect(c.port).toBe(465);
    expect(c.from).toBe('"MilhasX" <naoresponda@x.test>');
    expect(smtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.test", SMTP_PASS: "s", SMTP_PORT: "587", MAIL_FROM: "Equipe <c@x.test>" } as never)).toMatchObject({ port: 587, from: "Equipe <c@x.test>" });
  });

  it("mensagem avulsa sai no modelo, com o conteúdo escapado", () => {
    const r = renderEmail(plainEmail({ subject: "Teste", text: "Olá <b>Ana</b>\n\nSegundo parágrafo", reason: "é um teste" }), { appName: "MilhasX", appUrl: "https://gomilhasx.com", contactEmail: "" });
    expect(r.html).toContain("Olá &lt;b&gt;Ana&lt;/b&gt;");
    expect(r.html).not.toContain("<b>Ana</b>");
    expect(r.text).toContain("Segundo parágrafo");
  });
});

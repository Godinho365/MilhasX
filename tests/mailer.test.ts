import { describe, it, expect } from "vitest";
import { smtpConfig, textToHtml } from "@/server/mailer";

describe("envio de e-mail (SMTP)", () => {
  it("só liga o SMTP com host, usuário e senha", () => {
    expect(smtpConfig({ SMTP_HOST: "smtp.hostinger.com", SMTP_USER: "a@x.test" } as never)).toBeNull();
    const c = smtpConfig({ SMTP_HOST: "smtp.hostinger.com", SMTP_USER: "naoresponda@x.test", SMTP_PASS: "s", APP_NAME: "MilhasX" } as never)!;
    expect(c.port).toBe(465);
    expect(c.from).toBe('"MilhasX" <naoresponda@x.test>');
    expect(smtpConfig({ SMTP_HOST: "h", SMTP_USER: "u@x.test", SMTP_PASS: "s", SMTP_PORT: "587", MAIL_FROM: "Equipe <c@x.test>" } as never)).toMatchObject({ port: 587, from: "Equipe <c@x.test>" });
  });

  it("monta o HTML com link clicável e escapa o conteúdo", () => {
    const html = textToHtml("Olá <b>Ana</b>\nAcesse https://gomilhasx.com/reset-password?token=abc&x=1", "MilhasX");
    expect(html).toContain("Olá &lt;b&gt;Ana&lt;/b&gt;<br>");
    expect(html).toContain('<a href="https://gomilhasx.com/reset-password?token=abc&amp;x=1"');
  });
});

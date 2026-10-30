// Favorito "Preencher LATAM": texto copiado e código do favorito.
import { describe, it, expect } from "vitest";
import { LATAM_BOOKMARKLET, latamPayload, latamPhone, splitName } from "@/domain/latam-fill";

describe("preencher LATAM", () => {
  it("separa nome e sobrenome como a LATAM pede", () => {
    expect(splitName("  Nicolas  Eduardo Amaral ")).toEqual({ firstName: "Nicolas", lastName: "Eduardo Amaral" });
    expect(splitName("Ana")).toEqual({ firstName: "Ana", lastName: "" });
  });

  it("texto copiado: data DD/MM/AAAA, CPF só números e a marca do MilhasX", () => {
    const d = JSON.parse(latamPayload([{ name: "Nicolas Eduardo Amaral", cpf: "037.355.180-01", birthDate: "2002-03-23" }]));
    expect(d).toEqual({ milhasx: "latam", passengers: [{ firstName: "Nicolas", lastName: "Eduardo Amaral", birthDate: "23/03/2002", cpf: "03735518001" }] });
  });

  it("usa nome e sobrenome informados separados pelo comprador", () => {
    const d = JSON.parse(latamPayload([{ name: "Maria Clara Souza", firstName: "Maria Clara", lastName: "Souza", cpf: "12345678909", birthDate: "1990-05-20" }]));
    expect(d.passengers[0]).toMatchObject({ firstName: "Maria Clara", lastName: "Souza" });
  });

  it("sexo, e-mail e telefone (sem o +55) quando o comprador informou", () => {
    const d = JSON.parse(latamPayload([{ name: "Ana Lima", cpf: "12345678909", birthDate: "1990-05-20", gender: "F", email: " ana@x.test ", phone: "+55 (11) 98888-7777" }]));
    expect(d.passengers[0]).toMatchObject({ gender: "Feminino", email: "ana@x.test", phone: "11988887777" });
    expect(latamPhone("(11) 98888-7777")).toBe("11988887777");
    expect(latamPhone("")).toBe("");
  });

  it("só roda no domínio da LATAM por HTTPS (site falso não recebe os dados)", async () => {
    const body = LATAM_BOOKMARKLET.slice("javascript:".length);
    const run = async (protocol: string, hostname: string) => {
      const msgs: string[] = [];
      let readClipboard = false;
      const nav = { clipboard: { readText: async () => { readClipboard = true; return ""; } } };
      await new Function("location", "alert", "navigator", "prompt", `return ${body}`)({ protocol, hostname }, (m: string) => msgs.push(m), nav, () => "");
      return { readClipboard, msgs };
    };
    expect((await run("https:", "falso-latamairlines.com")).readClipboard).toBe(false);
    expect((await run("http:", "www.latamairlines.com")).readClipboard).toBe(false);
    expect((await run("https:", "www.latamairlines.com")).readClipboard).toBe(true);
  });

  it("o código do favorito é JavaScript válido", () => {
    expect(LATAM_BOOKMARKLET.startsWith("javascript:")).toBe(true);
    expect(() => new Function(LATAM_BOOKMARKLET.slice("javascript:".length))).not.toThrow();
  });
});

// Favorito "Preencher LATAM": texto copiado e código do favorito.
import { describe, it, expect } from "vitest";
import { LATAM_BOOKMARKLET, LATAM_COPY_BOOKMARKLET, fromLatamPayload, latamPayload, latamPhone, splitName } from "@/domain/latam-fill";

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

describe("copiar da LATAM", () => {
  it("lê o texto copiado de volta para o formato dos passageiros", () => {
    const t = JSON.stringify({ milhasx: "latam", passengers: [{ firstName: "SUZINEI", lastName: "SCHNEIDER", birthDate: "18/04/1978", cpf: "95768599053", gender: "Feminino", email: "x@y.com", phone: "49999053238" }] });
    expect(fromLatamPayload(t)).toEqual([{ name: "SUZINEI SCHNEIDER", firstName: "SUZINEI", lastName: "SCHNEIDER", cpf: "95768599053", birthDate: "1978-04-18", gender: "F", email: "x@y.com", phone: "49999053238" }]);
    expect(fromLatamPayload("Nicolas\nCPF 037.355.180-01")).toBeNull();
  });

  it("o favorito lê os campos da tela da LATAM e só roda nela", async () => {
    const body = LATAM_COPY_BOOKMARKLET.slice("javascript:".length);
    const fields: Record<string, string> = { firstName: "Nicolas", lastName: "Eduardo Amaral", dateOfBirth: "23/03/2002", taxDocument: "037.355.180-01", passengerInfo_email: "n@x.com", passengerInfo_number: "(21) 99493-4776" };
    const doc = {
      getElementById: (id: string) => { const m = /^passenger-(\d+)_(.+)$/.exec(id); return m && m[1] === "0" && m[2]! in fields ? { value: fields[m[2]!] } : null; },
      querySelector: () => ({ innerText: "Masculino" }),
    };
    const run = async (hostname: string) => {
      let copied = "";
      const nav = { clipboard: { writeText: async (t: string) => { copied = t; } } };
      await new Function("location", "alert", "navigator", "document", "prompt", `return ${body}`)({ protocol: "https:", hostname }, () => {}, nav, doc, () => "");
      return copied;
    };
    expect(await run("falso-latamairlines.com")).toBe("");
    expect(fromLatamPayload(await run("www.latamairlines.com"))).toEqual([{ name: "Nicolas Eduardo Amaral", firstName: "Nicolas", lastName: "Eduardo Amaral", cpf: "03735518001", birthDate: "2002-03-23", gender: "M", email: "n@x.com", phone: "21994934776" }]);
  });
});

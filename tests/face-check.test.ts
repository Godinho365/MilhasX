// Verificação (validação facial LATAM): link novo do cadastro.unico.app.
import { describe, it, expect } from "vitest";
import { faceCheckMessage, unicoProcessLink } from "@/domain/face-check";

const ID = "61020a77-74a6-4600-ae39-77e74b1828aa";
const NEW = `https://cadastro.unico.app/process/${ID}?collect-data=true`;

describe("link da validação facial", () => {
  it("troca o link recebido pelo formato novo", () => {
    expect(unicoProcessLink(`https://cadastro.unico.app/flow/intro?collect-data=true&id=${ID}`)).toEqual({ id: ID, url: NEW });
    expect(unicoProcessLink(`  https://cadastro.unico.app/flow/intro?id=${ID.toUpperCase()}&collect-data=true `)).toEqual({ id: ID, url: NEW });
  });

  it("aceita o link já convertido ou só o ID", () => {
    expect(unicoProcessLink(NEW)).toEqual({ id: ID, url: NEW });
    expect(unicoProcessLink(ID)).toEqual({ id: ID, url: NEW });
  });

  it("recusa outro site, http, ID inválido ou texto qualquer", () => {
    expect(unicoProcessLink(`https://cadastro.unico.app.golpe.com/flow/intro?id=${ID}`)).toBeNull();
    expect(unicoProcessLink(`https://outro.site/flow/intro?id=${ID}`)).toBeNull();
    expect(unicoProcessLink(`http://cadastro.unico.app/flow/intro?id=${ID}`)).toBeNull();
    expect(unicoProcessLink("https://cadastro.unico.app/flow/intro?id=123")).toBeNull();
    expect(unicoProcessLink("bom dia")).toBeNull();
  });

  it("mensagem para o titular com o link", () => {
    const m = faceCheckMessage("Eliane Godinho", NEW);
    expect(m.startsWith("Olá, Eliane!")).toBe(true);
    expect(m).toContain(NEW);
  });
});

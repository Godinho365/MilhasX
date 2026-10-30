// Favorito "Preencher LATAM": texto copiado e código do favorito.
import { describe, it, expect } from "vitest";
import { LATAM_BOOKMARKLET, latamPayload, splitName } from "@/domain/latam-fill";

describe("preencher LATAM", () => {
  it("separa nome e sobrenome como a LATAM pede", () => {
    expect(splitName("  Nicolas  Eduardo Amaral ")).toEqual({ firstName: "Nicolas", lastName: "Eduardo Amaral" });
    expect(splitName("Ana")).toEqual({ firstName: "Ana", lastName: "" });
  });

  it("texto copiado: data DD/MM/AAAA, CPF só números e a marca do MilhasX", () => {
    const d = JSON.parse(latamPayload([{ name: "Nicolas Eduardo Amaral", cpf: "037.355.180-01", birthDate: "2002-03-23" }]));
    expect(d).toEqual({ milhasx: "latam", passengers: [{ firstName: "Nicolas", lastName: "Eduardo Amaral", birthDate: "23/03/2002", cpf: "03735518001" }] });
  });

  it("o código do favorito é JavaScript válido", () => {
    expect(LATAM_BOOKMARKLET.startsWith("javascript:")).toBe(true);
    expect(() => new Function(LATAM_BOOKMARKLET.slice("javascript:".length))).not.toThrow();
  });
});

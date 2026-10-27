// Ícones dos programas: casamento pelo nome, arquivos válidos e sem sobrescrever o logo do admin
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resetDb } from "./helpers";
import { PROGRAM_LOGOS, logoFileFor, importProgramLogos } from "../prisma/program-logos";
import { detectImage } from "@/server/services/extras";
import { prisma } from "@/server/db";

beforeEach(resetDb);

describe("logos dos programas", () => {
  it("todos os arquivos do manifesto são PNG pequenos", () => {
    for (const file of Object.values(PROGRAM_LOGOS)) {
      const buf = readFileSync(path.join("prisma", "program-logos", file));
      expect(detectImage(buf), file).toBe("image/png");
      expect(buf.length, file).toBeLessThan(64 * 1024);
    }
  });

  it("acha o programa pelo nome sem diferenciar maiúsculas, acentos e pontuação", () => {
    expect(logoFileFor("LATAM PASS")).toBe("latam-pass.png");
    expect(logoFileFor("Itau")).toBe("itau.png");
    expect(logoFileFor("tap miles & go")).toBe("tap-miles-go.png");
    expect(logoFileFor("Programa Desconhecido")).toBeNull();
  });

  it("aplica só a quem não tem logo, a menos que force", async () => {
    const livelo = await prisma.program.create({ data: { name: "Livelo", code: "LIVELO", kind: "POINTS", marketValueCpmCents: 2800 } });
    await prisma.program.create({ data: { name: "Outro", code: "OUTRO", kind: "POINTS", marketValueCpmCents: 1000 } });
    expect(await importProgramLogos(prisma)).toEqual(["Livelo"]);
    expect((await prisma.programLogo.findUniqueOrThrow({ where: { programId: livelo.id } })).mime).toBe("image/png");
    // logo enviado pelo admin fica
    await prisma.programLogo.update({ where: { programId: livelo.id }, data: { data: new Uint8Array([1, 2, 3]) } });
    expect(await importProgramLogos(prisma)).toEqual([]);
    expect(Buffer.from((await prisma.programLogo.findUniqueOrThrow({ where: { programId: livelo.id } })).data).length).toBe(3);
    expect(await importProgramLogos(prisma, { force: true })).toEqual(["Livelo"]);
  });
});

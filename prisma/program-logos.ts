// Ícones dos programas de fidelidade (marcas dos próprios programas, usadas só para identificá-los).
// Os arquivos ficam em prisma/program-logos (PNG 128×128). O programa é achado pelo nome,
// sem diferenciar maiúsculas, acentos ou pontuação. Logo enviado pelo admin não é sobrescrito.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

export const PROGRAM_LOGOS: Record<string, string> = {
  "ALL Accor": "all-accor.png",
  "Azul Fidelidade": "azul-fidelidade.png",
  "BTG Pactual": "btg-pactual.png",
  "C6 Bank": "c6-bank.png",
  ConnectMiles: "connectmiles.png",
  Coopera: "coopera.png",
  Curtaí: "curtai.png",
  Esfera: "esfera.png",
  "Flying Blue": "flying-blue.png",
  Iberia: "iberia.png",
  "Inter Loop": "inter-loop.png",
  Itaú: "itau.png",
  "LATAM Pass": "latam-pass.png",
  Livelo: "livelo.png",
  Nubank: "nubank.png",
  PortoPlus: "portoplus.png",
  Sicredi: "sicredi.png",
  Smiles: "smiles.png",
  "TAP Miles&Go": "tap-miles-go.png",
  "Uau Caixa": "uau-caixa.png",
  Unicred: "unicred.png",
};

export const normalizeProgramName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const BY_NAME = new Map(Object.entries(PROGRAM_LOGOS).map(([name, file]) => [normalizeProgramName(name), file]));

export function logoFileFor(programName: string) {
  return BY_NAME.get(normalizeProgramName(programName)) ?? null;
}

/** Grava o ícone de cada programa que ainda não tem logo. Devolve os nomes atualizados. */
export async function importProgramLogos(prisma: PrismaClient, opts: { force?: boolean; dir?: string } = {}) {
  const dir = opts.dir ?? path.join(process.cwd(), "prisma", "program-logos");
  const programs = await prisma.program.findMany({ select: { id: true, name: true, logoUpdatedAt: true } });
  const done: string[] = [];
  for (const p of programs) {
    const file = logoFileFor(p.name);
    if (!file || (p.logoUpdatedAt && !opts.force)) continue;
    const data = new Uint8Array(readFileSync(path.join(dir, file)));
    await prisma.$transaction([
      prisma.programLogo.upsert({ where: { programId: p.id }, update: { data, mime: "image/png" }, create: { programId: p.id, data, mime: "image/png" } }),
      prisma.program.update({ where: { id: p.id }, data: { logoUpdatedAt: new Date() } }),
    ]);
    done.push(p.name);
  }
  return done;
}

import { DomainError } from "@/server/db";

/** Número da negociação (ou da mensagem) vindo da URL. */
export async function dealId(params: Promise<Record<string, string>>, key = "id") {
  const id = Number((await params)[key]);
  if (!Number.isInteger(id) || id <= 0 || id >= 2 ** 31) throw new DomainError(404, "Negociação não encontrada");
  return id;
}

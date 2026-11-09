// Verificação antes da emissão (CRM Milhas): a LATAM pede validação facial do titular da conta por um link
// do cadastro.unico.app. O link recebido (…/flow/intro?collect-data=true&id=<ID>) é trocado pelo formato
// novo …/process/<ID>?collect-data=true, que o titular abre para fazer a validação.

export const FACE_CHECK_STATUS = ["PENDING", "DONE", "NOT_NEEDED"] as const;
export type FaceCheckStatus = (typeof FACE_CHECK_STATUS)[number];
export const FACE_CHECK_LABELS: Record<FaceCheckStatus, string> = { PENDING: "Aguardando o titular", DONE: "Validação concluída", NOT_NEEDED: "Não foi pedida" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link da validação no formato novo. Aceita o link recebido, o já convertido ou só o ID; só do cadastro.unico.app. */
export function unicoProcessLink(input: string): { id: string; url: string } | null {
  const text = input.trim();
  let id: string | null = null;
  if (UUID.test(text)) id = text;
  else {
    let u: URL;
    try {
      u = new URL(text);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || u.hostname !== "cadastro.unico.app") return null;
    id = u.searchParams.get("id") ?? u.pathname.match(/^\/process\/([^/]+)\/?$/)?.[1] ?? null;
  }
  if (!id || !UUID.test(id)) return null;
  const clean = id.toLowerCase();
  return { id: clean, url: `https://cadastro.unico.app/process/${clean}?collect-data=true` };
}

const cpfDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** CPFs (11 dígitos) da lista de documentos do titular `[{ type, number }]`. */
export function holderCpfs(documents: unknown): string[] {
  if (!Array.isArray(documents)) return [];
  return documents
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .filter((d) => String(d.type ?? "").toUpperCase() === "CPF")
    .map((d) => cpfDigits(d.number))
    .filter((c) => c.length === 11);
}

/**
 * Palpite de quando a LATAM pede validação facial: só quando a emissão é para um terceiro
 * (CPF diferente do titular da conta). Compara o CPF do titular com os CPFs dos passageiros.
 * - `NOT_NEEDED`: todos os passageiros são o próprio titular (auto-emissão).
 * - `PENDING`: há pelo menos um passageiro com CPF diferente do titular.
 * - `null`: sem CPF do titular ou sem passageiros com CPF — não dá para decidir.
 * Palpite da regra da LATAM, não garantia: o operador pode sobrescrever e o link real da LATAM sempre vence.
 */
export function suggestFaceCheck(documents: unknown, passengers: unknown): FaceCheckStatus | null {
  const titular = new Set(holderCpfs(documents));
  if (titular.size === 0) return null;
  const pax = (Array.isArray(passengers) ? passengers : [])
    .map((p) => cpfDigits((p as Record<string, unknown> | null)?.cpf))
    .filter((c) => c.length === 11);
  if (pax.length === 0) return null;
  return pax.every((c) => titular.has(c)) ? "NOT_NEEDED" : "PENDING";
}

/** Mensagem para o titular fazer a validação. */
export function faceCheckMessage(holderName: string | null, url: string) {
  const first = holderName?.trim().split(/\s+/)[0];
  return [
    `Olá${first ? `, ${first}` : ""}! 😊`,
    "",
    "A LATAM pediu a validação facial da sua conta para concluir a emissão. Abra o link abaixo pelo celular e siga os passos (leva 1 minuto):",
    "",
    url,
    "",
    "Me avise quando terminar, por favor. Obrigado!",
  ].join("\n");
}

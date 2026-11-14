import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DEAL_FILE_MAX, balcaoPixProof } from "@/server/services/balcao";
import { dealId } from "../../../ids";

// Balcão MilhasX: comprovante do PIX (chave manual). Corpo = bytes do arquivo; tipo no content-type, conferido pelo
// conteúdo; ?nome= opcional.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  const data = await readBodyLimited(req, DEAL_FILE_MAX, "Arquivo grande demais: até 10 MB");
  const mime = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const name = (new URL(req.url).searchParams.get("nome") || "comprovante").replace(/[\\/"]/g, "").slice(0, 160);
  return json({ ok: true, item: await balcaoPixProof(u.id, u.actor.id, id, { data, name, mime }) });
});

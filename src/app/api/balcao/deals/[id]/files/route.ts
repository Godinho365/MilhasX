import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { DEAL_FILE_MAX, balcaoSendMessage } from "@/server/services/balcao";
import { dealId } from "../../ids";

// Balcão MilhasX: arquivo na conversa (PDF ou imagem, até 10 MB). Corpo = bytes do arquivo; o tipo vem no
// content-type e é conferido pelo conteúdo; ?nome= e ?texto= (legenda) opcionais.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = await dealId(params);
  const q = new URL(req.url).searchParams;
  const data = await readBodyLimited(req, DEAL_FILE_MAX, "Arquivo grande demais: até 10 MB");
  const mime = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const name = (q.get("nome") || "arquivo").replace(/[\\/"]/g, "").slice(0, 160);
  return json({ ok: true, item: await balcaoSendMessage(u.id, id, q.get("texto"), { data, name, mime }) }, 201);
});

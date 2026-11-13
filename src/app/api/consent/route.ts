import { z } from "zod";
import { route, json, parseBody, readCookie } from "@/server/http";
import { getUserByToken, SESSION_COOKIE } from "@/server/auth";
import { consentCookieHeader, newConsent } from "@/domain/consent";
import { saveAccountConsent } from "@/server/services/privacy";

// Escolha de cookies (aviso e central de preferências). Grava no navegador e, para quem está logado, na conta,
// para valer nos outros aparelhos. Sem login também funciona: nada além da escolha é guardado.
const schema = z.object({ analytics: z.boolean(), marketing: z.boolean() });

export const POST = route(async (req) => {
  const b = await parseBody(req, schema);
  const consent = newConsent(b);
  const person = await getUserByToken(readCookie(req, SESSION_COOKIE));
  if (person) await saveAccountConsent(person.id, consent);
  return json({ ok: true, consent }, 200, { "set-cookie": consentCookieHeader(consent, process.env.NODE_ENV === "production") });
});

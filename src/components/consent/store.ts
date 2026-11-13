// Estado da escolha de cookies no navegador (um por página). O ConsentProvider preenche; o resto do app só lê,
// com hasConsent() fora do React ou useConsent() dentro dele. No servidor fica sempre vazio.
import { useSyncExternalStore } from "react";
import { allows, type Consent, type ConsentCategory } from "@/domain/consent";

let current: Consent | null = null;
const listeners = new Set<() => void>();

export function setConsentState(c: Consent | null) {
  if (typeof window === "undefined") return; // o módulo é compartilhado entre requisições no servidor
  current = c;
  for (const l of listeners) l();
}
export const getConsent = () => current;
/** A categoria está permitida agora? (necessários sempre; os outros só com a escolha afirmativa) */
export const hasConsent = (cat: ConsentCategory) => allows(current, cat);

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
export const useConsent = () => useSyncExternalStore(subscribe, getConsent, () => null);

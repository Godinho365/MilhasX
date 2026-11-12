"use client";
// Guarda de onde o cliente veio (parâmetros do link do anúncio: utm_* e o fbclid do Meta) durante a visita, para o
// pedido de cotação levar junto mesmo quando ele navega do site para a página de cotação da Central.
import { useEffect } from "react";
import { pickUtm, type Utm } from "@/domain/traffic";

const KEY = "mx_utm";

export function UtmKeeper() {
  useEffect(() => {
    const utm = pickUtm(window.location.search);
    if (!utm) return;
    try { sessionStorage.setItem(KEY, JSON.stringify(utm)); } catch { /* navegação privada sem armazenamento */ }
  }, []);
  return null;
}

/** Os parâmetros desta visita: os do endereço atual ou, sem eles, os guardados na chegada. */
export function readUtm(): Utm | null {
  if (typeof window === "undefined") return null;
  const now = pickUtm(window.location.search);
  if (now) return now;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? pickUtm(JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

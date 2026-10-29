"use client";
import { useEffect, useState } from "react";

/**
 * true só depois que o React assumiu a página. Usado para manter o botão de envio desabilitado
 * até lá: sem isso, um envio antes da hidratação vira GET nativo e coloca a senha na URL.
 */
export function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

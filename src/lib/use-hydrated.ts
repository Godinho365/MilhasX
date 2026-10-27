"use client";
import { useEffect, useState } from "react";

/** `true` só depois da hidratação: evita enviar formulários antes do JS assumir. */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

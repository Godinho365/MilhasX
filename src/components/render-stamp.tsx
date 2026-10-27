"use client";
import { useEffect } from "react";

/** Marca no <html> o instante da última renderização do servidor (usado por refreshSafe). */
export function RenderStamp({ value }: { value: number }) {
  useEffect(() => {
    document.documentElement.dataset.rendered = String(value);
  }, [value]);
  return null;
}

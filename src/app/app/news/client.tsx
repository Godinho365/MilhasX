"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Marca as novidades como lidas quando a página é realmente aberta (não no pré-carregamento).
 * Não recarrega a página: os selos "novo" continuam visíveis nesta visita e o contador zera na próxima navegação.
 */
export function MarkNewsRead() {
  useEffect(() => {
    void api("/api/news/read", "POST");
  }, []);
  return null;
}

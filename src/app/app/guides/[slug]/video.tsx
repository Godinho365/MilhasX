"use client";
// Vídeo do YouTube/Vimeo só carrega quando a pessoa clica: antes disso nenhum conteúdo do terceiro é pedido ao
// navegador (o player deles pode guardar dados no navegador e medir a reprodução).
import { useState } from "react";
import { Play } from "lucide-react";

export function GuideVideo({ src, title }: { src: string; title: string }) {
  const [on, setOn] = useState(false);
  const vendor = src.includes("vimeo.com") ? "Vimeo" : "YouTube";
  return (
    <div className="mt-6 aspect-video overflow-hidden rounded-card border border-line">
      {on ? (
        <iframe src={`${src}${src.includes("?") ? "&" : "?"}autoplay=1`} title={title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
      ) : (
        <button type="button" onClick={() => setOn(true)} className="flex h-full w-full flex-col items-center justify-center gap-3 bg-panel2 p-6 text-center hover:bg-panel">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-zinc-950"><Play className="h-6 w-6" /></span>
          <span className="font-semibold">Assistir o vídeo</span>
          <span className="max-w-md text-xs text-muted">O vídeo é exibido pelo {vendor}. Ao tocar para assistir, o player do {vendor} é carregado e pode guardar dados no seu navegador, conforme a política de privacidade dele.</span>
        </button>
      )}
    </div>
  );
}

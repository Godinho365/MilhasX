"use client";
// Vigia de navegação. No Next 15 a requisição de uma navegação do cliente às vezes é abortada
// (ERR_ABORTED) e a tela fica parada, sem erro (medido: ~1 em 6 buscas no extrato). Se a URL não
// mudar a tempo, repete a navegação; se ainda assim não mudar, navega por completo.
import { useRouter } from "next/navigation";
import { useCallback } from "react";

// Espera generosa: repetir uma navegação que só estava lenta recria a página (o loading.tsx
// suspende de novo) e apaga o que o usuário já digitou.
const RETRY_MS = 5000;
const HARD_MS = 3000;
const here = () => window.location.pathname + window.location.search;

export function watchNavigation(href: string, retry: () => void) {
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) return;
  const start = here();
  // Link para a própria página: nada a vigiar
  if (target.pathname + target.search === start) return;
  const arrived = () => here() !== start;
  window.setTimeout(() => {
    if (arrived()) return;
    retry();
    window.setTimeout(() => {
      if (!arrived()) window.location.assign(target.pathname + target.search);
    }, HARD_MS);
  }, RETRY_MS);
}

/** router.push / router.replace com o vigia. */
export function useNav() {
  const router = useRouter();
  return useCallback(
    (href: string, opts: { replace?: boolean; scroll?: boolean } = {}) => {
      const go = () => (opts.replace ? router.replace(href, { scroll: opts.scroll }) : router.push(href, { scroll: opts.scroll }));
      watchNavigation(href, go);
      go();
    },
    [router],
  );
}

/** Para cliques em links internos (<Link> e <a>): instalado uma vez no layout do app. */
export function watchLinkClicks(push: (href: string) => void) {
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const href = a.getAttribute("href")!;
    if (!href.startsWith("/") || href.startsWith("/api/")) return;
    watchNavigation(href, () => push(href));
  };
  // Fase de captura: o <Link> do Next cancela o clique para navegar por conta própria
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

/**
 * router.refresh com o mesmo vigia: o refresh também pode ser abortado em silêncio. Confere se o
 * servidor renderizou de novo (carimbo do RenderStamp); se não, repete e, em último caso, recarrega.
 */
export function refreshSafe(router: { refresh: () => void }) {
  const stamp = () => document.documentElement.dataset.rendered;
  const before = stamp();
  router.refresh();
  window.setTimeout(() => {
    if (stamp() !== before) return;
    router.refresh();
    window.setTimeout(() => {
      if (stamp() === before) window.location.reload();
    }, 4000);
  }, 4000);
}

"use client";
/**
 * Vigia de navegação. O App Router às vezes descarta um `router.push` (ou um `refresh`) quando
 * ele coincide com outra atualização; aqui a navegação é verificada e repetida quando se perde.
 */
import { useCallback } from "react";
import { useRouter } from "next/navigation";

type Router = { push: (href: string) => void; refresh: () => void };

const current = () => window.location.pathname + window.location.search;

function sameUrl(href: string) {
  const u = new URL(href, window.location.href);
  return u.pathname + u.search === current();
}

/** Empurra a rota e, se o endereço não mudar, tenta de novo; por fim, carrega a página inteira. */
export function navigateSafe(router: Router, href: string) {
  if (sameUrl(href)) {
    router.refresh();
    return;
  }
  router.push(href);
  let tries = 0;
  const check = () => {
    if (sameUrl(href)) return;
    tries += 1;
    if (tries === 1) {
      router.push(href);
      setTimeout(check, 900);
    } else {
      window.location.assign(href);
    }
  };
  setTimeout(check, 700);
}

/** `const nav = useNav(); nav("/app/entries?x=1")` */
export function useNav() {
  const router = useRouter();
  return useCallback((href: string) => navigateSafe(router, href), [router]);
}

/**
 * Recarrega os dados do servidor e confere, pelo carimbo `data-rendered` no <html>
 * (ver RenderStamp), que uma nova renderização chegou; senão repete e, por fim, recarrega a página.
 */
export function refreshSafe(router: Router) {
  const before = document.documentElement.dataset.rendered;
  router.refresh();
  let tries = 0;
  const check = () => {
    if (document.documentElement.dataset.rendered !== before) return;
    tries += 1;
    if (tries === 1) {
      router.refresh();
      setTimeout(check, 1200);
    } else {
      window.location.reload();
    }
  };
  setTimeout(check, 1000);
}

/**
 * Observa cliques em links internos e, se a navegação não acontecer em pouco tempo, repete com `go`.
 * Devolve a função de limpeza (para usar direto em useEffect).
 */
export function watchLinkClicks(go: (href: string) => void) {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noWatch !== undefined) return;
    const u = new URL(a.href, window.location.href);
    if (u.origin !== window.location.origin || u.pathname.startsWith("/api/")) return;
    const href = u.pathname + u.search;
    if (href === current() && u.hash) return;
    setTimeout(() => {
      if (current() === href) return;
      // ainda não navegou: repete uma vez
      go(href);
      setTimeout(() => {
        if (current() !== href) window.location.assign(href);
      }, 1500);
    }, 800);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

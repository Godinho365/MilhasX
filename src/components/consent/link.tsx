// Link "Preferências de cookies" para rodapés. Sem "use client": serve em componentes do servidor e do cliente;
// o ConsentProvider (layout raiz) percebe o clique pelo atributo data-cookie-preferences e abre a central.
export function CookiePreferencesLink({ className, style, label = "Preferências de cookies" }: { className?: string; style?: React.CSSProperties; label?: string }) {
  return <a href="#preferencias-de-cookies" data-cookie-preferences="" className={className} style={style}>{label}</a>;
}

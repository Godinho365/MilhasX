// Ícones das redes sociais do site (desenhados aqui, sem pacote externo). Herdam a cor do texto.
type P = { size?: number; className?: string; style?: React.CSSProperties };

export function WhatsappIcon({ size = 20, className, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="currentColor" aria-hidden>
      <path d="M12 2.2a9.7 9.7 0 0 0-8.36 14.63L2.2 21.8l5.1-1.4A9.7 9.7 0 1 0 12 2.2Zm0 17.6c-1.5 0-2.95-.4-4.22-1.17l-.3-.18-3.03.83.81-2.95-.2-.31A7.9 7.9 0 1 1 12 19.8Zm4.33-5.92c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06a6.47 6.47 0 0 1-3.2-2.8c-.24-.41.24-.38.69-1.27.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46a.89.89 0 0 0-.64.3c-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.47-.07 1.4-.57 1.6-1.12.2-.55.2-1.02.14-1.12-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

export function InstagramIcon({ size = 20, className, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ size = 20, className, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.87.25-1.46 1.5-1.46h1.6V4.36A21 21 0 0 0 14.27 4.2c-2.3 0-3.87 1.4-3.87 3.98v2.22H7.8v3h2.6V21h3.1Z" />
    </svg>
  );
}

export function TiktokIcon({ size = 20, className, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="currentColor" aria-hidden>
      <path d="M16.6 3h-3.1v12.2a2.7 2.7 0 1 1-2.7-2.7c.28 0 .55.04.8.12V9.45a5.85 5.85 0 0 0-.8-.05 5.8 5.8 0 1 0 5.8 5.8V9.03a7.2 7.2 0 0 0 4.2 1.35V7.3a4.2 4.2 0 0 1-4.2-4.2Z" />
    </svg>
  );
}

export function MailIcon({ size = 20, className, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function CheckBadgeIcon({ size = 20, className, style }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5 14.6 4l3-.2.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3-.2L12 21.5 9.4 20l-3 .2-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3 .2Z" />
      <path d="m8.5 12 2.4 2.4L15.5 9.8" />
    </svg>
  );
}

/** Links das redes da agência (só as preenchidas). */
export function socialLinks(b: { whatsapp: string; instagram: string; facebook: string; tiktok: string; email: string }, waHref: string | null) {
  return [
    waHref && { key: "whatsapp", label: "WhatsApp", href: waHref, Icon: WhatsappIcon },
    b.instagram && { key: "instagram", label: "Instagram", href: `https://instagram.com/${b.instagram}`, Icon: InstagramIcon },
    b.facebook && { key: "facebook", label: "Facebook", href: `https://facebook.com/${b.facebook}`, Icon: FacebookIcon },
    b.tiktok && { key: "tiktok", label: "TikTok", href: `https://www.tiktok.com/@${b.tiktok}`, Icon: TiktokIcon },
    b.email && { key: "email", label: "E-mail", href: `mailto:${b.email}`, Icon: MailIcon },
  ].filter(Boolean) as { key: string; label: string; href: string; Icon: (p: P) => React.JSX.Element }[];
}

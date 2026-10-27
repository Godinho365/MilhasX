// Ícone do programa: a imagem enviada pelo admin ou, sem ela, o monograma na cor do programa.
export function ProgramLogo({ programId, name, color, version, size = 32, className = "" }: { programId: string; name: string; color: string; version?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (version) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/programs/${programId}/logo?v=${version}`} alt="" width={size} height={size} style={style} className={`shrink-0 rounded-full bg-white object-contain ring-1 ring-line ${className}`} />
    );
  }
  return (
    <span aria-hidden style={{ ...style, backgroundColor: `${color}33`, color, fontSize: Math.max(9, Math.round(size * 0.31)) }} className={`flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-line ${className}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

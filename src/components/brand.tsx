import Image from "next/image";
import icon from "@/assets/brand/icon.png";
import logo from "@/assets/brand/logo.png";

/**
 * Marca do app. No tema claro só o logotipo (ele já tem o avião e o X); no escuro, como as letras
 * do logotipo são azul-escuras, entra o ícone com o nome em texto (o "X" dourado).
 */
export function BrandMark({ name, size = 28 }: { name: string; size?: number }) {
  const isMilhasX = /^milhasx$/i.test(name.trim());
  return (
    <span className="flex items-center gap-2">
      <Image src={icon} alt="" width={size} height={size} className={`shrink-0 rounded-[22%] ${isMilhasX ? "only-dark" : ""}`} priority />
      {isMilhasX ? (
        <>
          <Image src={logo} alt={name} height={Math.round(size * 1.15)} width={Math.round(size * 1.15 * 3)} className="only-light w-auto" priority />
          <span className="only-dark font-bold tracking-tight">Milhas<span className="text-amber-400">X</span></span>
        </>
      ) : (
        <span className="font-semibold tracking-tight">{name}</span>
      )}
    </span>
  );
}

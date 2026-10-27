"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { toast } from "@/components/feedback";

const SIZE = 128;

/** Reduz para 128×128 PNG (mantém proporção e transparência) antes de enviar. */
async function resize(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível ler essa imagem (use JPG, PNG ou WebP).");
  }
  const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha"))), "image/png"));
}

export function LogoUpload({ program }: { program: { id: string; name: string; color: string; logoVersion: string | null } }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(method: "PUT" | "DELETE", body?: Blob) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/programs/${program.id}/logo`, { method, body, headers: body ? { "content-type": "image/png" } : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || "Não foi possível salvar a imagem");
      toast(method === "PUT" ? "Imagem atualizada" : "Imagem removida");
      refreshSafe(router);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível salvar a imagem", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <ProgramLogo programId={program.id} name={program.name} color={program.color} version={program.logoVersion} size={48} />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={`Imagem do programa ${program.name}`}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            await send("PUT", await resize(file));
          } catch (err) {
            toast(err instanceof Error ? err.message : "Imagem inválida", "error");
          }
        }}
      />
      <button type="button" className="btn-ghost h-9" disabled={busy} onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" />{program.logoVersion ? "Trocar imagem" : "Enviar imagem"}</button>
      {program.logoVersion && <button type="button" className="btn-subtle h-9" disabled={busy} onClick={() => send("DELETE")}><Trash2 className="h-4 w-4" />Remover</button>}
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { toast } from "@/components/feedback";

const SIZE = 256;

/** Reduz a imagem no navegador (256×256, JPEG) antes de enviar: arquivo pequeno e sem metadados (EXIF/GPS). */
async function resize(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível ler essa imagem. Tente outra foto (JPG, PNG ou WebP).");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha"))), "image/jpeg", 0.85));
}

export function AvatarUpload({ name, version }: { name: string; version: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast("Escolha um arquivo de imagem", "error");
    setBusy(true);
    try {
      const blob = await resize(file);
      const res = await fetch("/api/me/avatar", { method: "PUT", body: blob, headers: { "content-type": "image/jpeg" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || "Não foi possível enviar a foto");
      toast("Foto atualizada");
      refreshSafe(router);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível enviar a foto", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove() {
    setBusy(true);
    const res = await fetch("/api/me/avatar", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast("Não foi possível remover a foto", "error");
    toast("Foto removida");
    refreshSafe(router);
  }

  return (
    <div className="flex items-center gap-4">
      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-panel2"><UserAvatar name={name} version={version} size="lg" /></span>
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="avatar-file" aria-label="Escolher foto de perfil" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <label htmlFor="avatar-file" className={`btn-ghost cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}><Camera className="h-4 w-4" />{version ? "Trocar foto" : "Enviar foto"}</label>
        {version && <button className="btn-subtle" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />Remover</button>}
      </div>
    </div>
  );
}

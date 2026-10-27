"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";

/** Remove uma simulação da lista "Recentes". */
export function DeleteSimulation({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="mr-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-white group-hover:flex focus-visible:flex"
      aria-label={`Remover simulação ${title}`}
      onClick={async () => {
        const r = await api(`/api/simulations/${id}`, "DELETE");
        if (!r.ok) return toast(r.erro, "error");
        refreshSafe(router);
      }}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { api } from "@/lib/api";
import { fmtBRL, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { ProgramLogo } from "@/components/program-logo";
import { LogoUpload } from "./logo-upload";

type P = { id: string; name: string; code: string; kind: "POINTS" | "MILES"; active: boolean; marketValueCpmCents: number; color: string; logoVersion: string | null };

export function ProgramsAdmin({ programs }: { programs: P[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<P | "new" | null>(null);
  const [erro, setErro] = useState("");
  const cur = edit && edit !== "new" ? edit : null;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const mv = parseBRLToCents(String(f.get("market") || "0"));
    if (mv === null) return setErro("Valor inválido");
    const body = { name: f.get("name"), code: f.get("code"), kind: f.get("kind"), active: f.get("active") === "on", marketValueCpmCents: mv, color: String(f.get("color") || "#3b82f6") };
    const r = cur ? await api(`/api/admin/programs/${cur.id}`, "PATCH", body) : await api("/api/admin/programs", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setEdit(null);
    setErro("");
    refreshSafe(router);
  }

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setEdit("new")}>+ Programa</button></div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Nome</th><th>Sigla</th><th>Tipo</th><th className="text-right">Valor estimado do milheiro</th><th>Status</th><th /></tr></thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td><span className="flex items-center gap-2"><ProgramLogo programId={p.id} name={p.name} color={p.color} version={p.logoVersion} size={28} />{p.name}</span></td><td className="text-muted">{p.code}</td><td>{p.kind === "MILES" ? "Milhas" : "Pontos"}</td>
                <td className="text-right tabular-nums">{fmtBRL(p.marketValueCpmCents)}</td>
                <td>{p.active ? <span className="text-ok">Ativo</span> : <span className="text-muted">Inativo</span>}</td>
                <td className="text-right"><button className="text-xs text-accent" onClick={() => setEdit(p)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={cur ? "Editar programa" : "Novo programa"}>
        <form onSubmit={save} className="space-y-3" key={cur?.id ?? "new"}>
          {erro && <Alert>{erro}</Alert>}
          {cur && <Field label="Imagem do programa" hint="PNG, JPG ou WebP. É reduzida para 128×128 antes de enviar."><LogoUpload program={programs.find((p) => p.id === cur.id) ?? cur} /></Field>}
          <Field label="Nome"><input className="input" name="name" defaultValue={cur?.name} required /></Field>
          <Field label="Sigla"><input className="input" name="code" defaultValue={cur?.code} required pattern="[A-Za-z0-9_\-]+" /></Field>
          <Field label="Tipo"><select className="input" name="kind" defaultValue={cur?.kind ?? "POINTS"}><option value="POINTS">Pontos</option><option value="MILES">Milhas</option></select></Field>
          <Field label="Valor estimado do milheiro (R$)" hint="Usado para o “valor estimado” das carteiras. Não é custo de aquisição.">
            <input className="input" name="market" inputMode="decimal" defaultValue={cur ? (cur.marketValueCpmCents / 100).toFixed(2).replace(".", ",") : ""} />
          </Field>
          <Field label="Cor"><input type="color" name="color" defaultValue={cur?.color ?? "#3b82f6"} className="h-10 w-20 cursor-pointer rounded-[10px] border border-line bg-transparent p-1" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={cur?.active ?? true} /> Ativo</label>
          <button className="btn-primary w-full">Salvar</button>
        </form>
      </Modal>
    </>
  );
}

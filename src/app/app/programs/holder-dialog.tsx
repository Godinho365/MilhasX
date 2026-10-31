"use client";
// "Novo titular" / "Editar titular", como na referência: dados básicos e seções recolhíveis
// (acesso, documentos, endereço, atributos, anexos) e observações. Anexos sobem ao salvar.
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { Mail, IdCard, MapPin, ListPlus, Paperclip, ShieldAlert, X, Eraser, FileText, Upload, Download } from "lucide-react";
import { api, today } from "@/lib/api";
import { Modal, Field, Alert } from "@/components/ui";
import { Collapsible } from "@/components/form-parts";
import { toast } from "@/components/feedback";

export type AddressParts = { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string };
export type HolderFull = {
  id: string;
  name: string;
  isSelf: boolean;
  active: boolean;
  birthDate: string | null;
  accessEmail: string | null;
  phone?: string | null;
  documents: { type: string; number: string }[];
  address: string | null;
  addressParts: AddressParts | null;
  attributes: { key: string; value: string }[];
  notes: string | null;
};
export type Attachment = { id: string; name: string; mime: string; size: number };

export const DOC_TYPES = [["CPF", "CPF"], ["CNPJ", "CNPJ"], ["RG", "RG"], ["PASSAPORTE", "Passaporte"]] as const;
export const docLabel = (t: string) => DOC_TYPES.find(([k]) => k === t)?.[1] ?? t;
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,application/pdf";

/** Máscara do número conforme o tipo do documento. */
export function maskDoc(type: string, v: string) {
  const d = v.replace(/\D/g, "");
  if (type === "CPF") return d.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  if (type === "CNPJ") return d.slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  return v.slice(0, 30);
}
const docPlaceholder = (t: string) => (t === "CPF" ? "000.000.000-00" : t === "CNPJ" ? "00.000.000/0000-00" : "Número do documento");
export const maskCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
export const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Linhas com uma linha em branco sempre no fim (como a referência): preencher a última cria a próxima. */
function withDraft<T extends Record<string, string>>(rows: T[], empty: T, isEmpty: (r: T) => boolean) {
  const filled = rows.filter((r) => !isEmpty(r));
  return [...filled, empty];
}

export function HolderDialog({ holder, onClose }: { holder: HolderFull | null; onClose: () => void }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const emptyDoc = { type: "CPF", number: "" };
  const emptyAttr = { key: "", value: "" };
  const [f, setF] = useState({
    name: holder?.name ?? "",
    birthDate: holder?.birthDate?.slice(0, 10) ?? "",
    accessEmail: holder?.accessEmail ?? "",
    phone: holder?.phone ?? "",
    notes: holder?.notes ?? "",
  });
  const [docs, setDocs] = useState(() => withDraft(holder?.documents ?? [], emptyDoc, (d) => !d.number.trim()));
  const [attrs, setAttrs] = useState(() => withDraft(holder?.attributes ?? [], emptyAttr, (a) => !a.key.trim() && !a.value.trim()));
  const [addr, setAddr] = useState<AddressParts>(holder?.addressParts ?? {});
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState({
    access: !!holder?.accessEmail,
    docs: !!holder?.documents.length,
    addr: !!holder?.address,
    attrs: !!holder?.attributes.length,
    files: false,
  });

  useEffect(() => {
    if (!holder) return;
    api<{ items: Attachment[] }>(`/api/holders/${holder.id}/attachments`).then((r) => {
      if (!r.ok) return;
      setExisting(r.data.items);
      if (r.data.items.length) setOpen((o) => ({ ...o, files: true }));
    });
  }, [holder]);

  const kept = existing.filter((a) => !removed.includes(a.id));
  const count = kept.length + pending.length;

  function addFiles(list: FileList | File[]) {
    const next = [...pending];
    for (const file of Array.from(list)) {
      if (kept.length + next.length >= MAX_FILES) { toast(`No máximo ${MAX_FILES} arquivos`, "error"); break; }
      if (file.size > MAX_BYTES) { toast(`${file.name}: maior que 10 MB`, "error"); continue; }
      if (file.type && !ACCEPT.split(",").includes(file.type)) { toast(`${file.name}: envie PNG, JPEG, WEBP, HEIC ou PDF`, "error"); continue; }
      next.push(file);
    }
    setPending(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErro("Informe o nome do titular");
    if (docs.some((d) => d.number.trim() && d.type === "CPF" && d.number.replace(/\D/g, "").length !== 11)) return setErro("CPF precisa ter 11 dígitos");
    if (docs.some((d) => d.number.trim() && d.type === "CNPJ" && d.number.replace(/\D/g, "").length !== 14)) return setErro("CNPJ precisa ter 14 dígitos");
    if (attrs.some((a) => (a.key.trim() && !a.value.trim()) || (!a.key.trim() && a.value.trim()))) return setErro("Preencha nome e valor dos atributos");
    setBusy(true);
    setErro("");
    const parts = Object.fromEntries(Object.entries(addr).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v));
    const body = {
      name: f.name,
      birthDate: f.birthDate || null,
      accessEmail: f.accessEmail || null,
      phone: f.phone || null,
      documents: docs.filter((d) => d.number.trim()),
      addressParts: Object.keys(parts).length ? parts : null,
      attributes: attrs.filter((a) => a.key.trim()),
      notes: f.notes || null,
    };
    const r = holder ? await api<{ item: { id: string } }>(`/api/holders/${holder.id}`, "PATCH", body) : await api<{ item: { id: string } }>("/api/holders", "POST", body);
    if (!r.ok) {
      setBusy(false);
      return setErro(r.erro);
    }
    // Anexos: só depois de o titular existir (as alterações valem ao salvar)
    const id = r.data.item.id;
    const failures: string[] = [];
    for (const aid of removed) if (!(await api(`/api/holders/${id}/attachments/${aid}`, "DELETE")).ok) failures.push("remover anexo");
    for (const file of pending) {
      const res = await fetch(`/api/holders/${id}/attachments`, { method: "POST", body: file, headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) } });
      if (!res.ok) failures.push(`${file.name}: ${(await res.json().catch(() => ({}))).erro ?? "falha no envio"}`);
    }
    setBusy(false);
    if (failures.length) toast(`Titular salvo, mas: ${failures.join("; ")}`, "error");
    else toast(holder ? "Titular atualizado" : "Titular cadastrado");
    onClose();
    refreshSafe(router);
  }

  const setAddrField = (k: keyof AddressParts, v: string) => setAddr({ ...addr, [k]: v });

  return (
    <Modal
      open
      onClose={onClose}
      title={holder ? "Editar titular" : "Novo titular"}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="holder-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : holder ? "Salvar alterações" : "Criar titular"}</button></>}
    >
      <form id="holder-form" onSubmit={save} className="space-y-4">
        <p className="flex items-center gap-2 rounded-xl border border-line bg-panel2/60 px-3 py-2.5 text-sm text-zinc-300"><ShieldAlert className="h-4 w-4 shrink-0" />Não armazene dados sensíveis como senhas neste cadastro.</p>
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Nome do titular" required><input className="input" name="name" required maxLength={80} placeholder="Ex: João da Silva" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Data de nascimento"><input className="input" type="date" value={f.birthDate} max={today()} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></Field>
          <Field label="Telefone (WhatsApp)" hint="Para enviar ao titular o link da validação facial da LATAM"><input className="input" type="tel" inputMode="tel" placeholder="(11) 90000-0000" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="Telefone do titular" /></Field>
        </div>

        <Collapsible icon={<Mail className="h-4 w-4" />} title="Acesso à página do titular" subtitle="Configure o e-mail autorizado" open={open.access} onToggle={() => setOpen({ ...open, access: !open.access })}>
          <Field label="E-mail autorizado" hint="Só este e-mail poderá abrir a página do titular quando ela for ativada.">
            <input className="input" type="email" placeholder="nome@exemplo.com" maxLength={120} value={f.accessEmail} onChange={(e) => setF({ ...f, accessEmail: e.target.value })} />
          </Field>
        </Collapsible>

        <Collapsible icon={<IdCard className="h-4 w-4" />} title="Documentos" subtitle="CPF, CNPJ, RG ou Passaporte" open={open.docs} onToggle={() => setOpen({ ...open, docs: !open.docs })}>
          <div className="space-y-2">
            {docs.map((d, i) => {
              const draft = i === docs.length - 1;
              const update = (patch: Partial<typeof d>) => {
                const next = docs.map((x, j) => (j === i ? { ...x, ...patch } : x));
                setDocs(withDraft(next, emptyDoc, (x) => !x.number.trim()));
              };
              return (
                <div key={i} className="grid grid-cols-[130px_1fr_auto] items-end gap-2">
                  <Field label="Tipo" required>
                    <select className="input" value={d.type} onChange={(e) => update({ type: e.target.value, number: maskDoc(e.target.value, d.number) })} aria-label={`Tipo do documento ${i + 1}`}>
                      {DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Número" required>
                    <input className="input" placeholder={docPlaceholder(d.type)} value={d.number} onChange={(e) => update({ number: maskDoc(d.type, e.target.value) })} aria-label={`Número do documento ${i + 1}`} />
                  </Field>
                  <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => setDocs(draft ? [...docs.slice(0, -1), emptyDoc] : withDraft(docs.filter((_, j) => j !== i), emptyDoc, (x) => !x.number.trim()))} aria-label={draft ? "Limpar novo documento" : `Remover documento ${i + 1}`}>
                    {draft ? <Eraser className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        </Collapsible>

        <Collapsible icon={<MapPin className="h-4 w-4" />} title="Endereço" subtitle="Endereço residencial ou comercial" open={open.addr} onToggle={() => setOpen({ ...open, addr: !open.addr })}>
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="CEP" className="sm:col-span-2"><input className="input" inputMode="numeric" placeholder="00000-000" value={addr.cep ?? ""} onChange={(e) => setAddrField("cep", maskCep(e.target.value))} /></Field>
            <Field label="Logradouro" className="sm:col-span-4"><input className="input" placeholder="Rua, avenida..." maxLength={120} value={addr.logradouro ?? ""} onChange={(e) => setAddrField("logradouro", e.target.value)} /></Field>
            <Field label="Número" className="sm:col-span-2"><input className="input" placeholder="Ex: 123" maxLength={20} value={addr.numero ?? ""} onChange={(e) => setAddrField("numero", e.target.value)} /></Field>
            <Field label="Complemento" className="sm:col-span-4"><input className="input" placeholder="Apto, bloco..." maxLength={60} value={addr.complemento ?? ""} onChange={(e) => setAddrField("complemento", e.target.value)} /></Field>
            <Field label="Bairro" className="sm:col-span-2"><input className="input" maxLength={60} value={addr.bairro ?? ""} onChange={(e) => setAddrField("bairro", e.target.value)} /></Field>
            <Field label="Cidade" className="sm:col-span-3"><input className="input" maxLength={60} value={addr.cidade ?? ""} onChange={(e) => setAddrField("cidade", e.target.value)} /></Field>
            <Field label="UF" className="sm:col-span-1">
              <select className="input" value={addr.uf ?? ""} onChange={(e) => setAddrField("uf", e.target.value)} aria-label="UF">
                <option value="">Selecione</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
        </Collapsible>

        <Collapsible icon={<ListPlus className="h-4 w-4" />} title="Atributos personalizados" subtitle="Informações extras" open={open.attrs} onToggle={() => setOpen({ ...open, attrs: !open.attrs })}>
          <div className="space-y-2">
            {attrs.map((a, i) => {
              const draft = i === attrs.length - 1;
              const update = (patch: Partial<typeof a>) => setAttrs(withDraft(attrs.map((x, j) => (j === i ? { ...x, ...patch } : x)), emptyAttr, (x) => !x.key.trim() && !x.value.trim()));
              return (
                <div key={i} className="grid grid-cols-[1fr_1.3fr_auto] items-end gap-2">
                  <Field label="Nome" required><input className="input" placeholder="Ex: Instagram" maxLength={40} value={a.key} onChange={(e) => update({ key: e.target.value })} aria-label={`Nome do atributo ${i + 1}`} /></Field>
                  <Field label="Valor" required><input className="input" placeholder="Ex: @joaodasilva" maxLength={200} value={a.value} onChange={(e) => update({ value: e.target.value })} aria-label={`Valor do atributo ${i + 1}`} /></Field>
                  <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => setAttrs(draft ? [...attrs.slice(0, -1), emptyAttr] : withDraft(attrs.filter((_, j) => j !== i), emptyAttr, (x) => !x.key.trim() && !x.value.trim()))} aria-label={draft ? "Limpar novo atributo" : `Remover atributo ${i + 1}`}>
                    {draft ? <Eraser className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        </Collapsible>

        <Collapsible icon={<Paperclip className="h-4 w-4" />} title="Anexos" subtitle="Contratos, comprovantes e outros documentos" open={open.files} onToggle={() => setOpen({ ...open, files: !open.files })}>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              disabled={count >= MAX_FILES}
              className={`flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${drag ? "border-accent-light bg-accent-soft/30" : "border-line hover:bg-panel2/60"} disabled:opacity-50`}
            >
              <Upload className="h-5 w-5 text-muted" />
              <span className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</span>
              <span className="text-xs text-muted">PNG, JPEG, WEBP, HEIC, PDF</span>
              <span className="text-xs text-muted">{count} de {MAX_FILES} arquivos · até 10,0 MB por arquivo</span>
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Selecionar anexos" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            {(kept.length > 0 || pending.length > 0) && (
              <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Anexos do titular">
                {kept.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="text-xs text-muted">{fmtSize(a.size)}</span>
                    <a className="btn-subtle h-8 w-8 px-0" href={`/api/holders/${holder!.id}/attachments/${a.id}`} aria-label={`Baixar ${a.name}`}><Download className="h-4 w-4" /></a>
                    <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setRemoved([...removed, a.id])} aria-label={`Remover ${a.name}`}><X className="h-4 w-4" /></button>
                  </li>
                ))}
                {pending.map((file, i) => (
                  <li key={`p${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-accent-light" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted">{fmtSize(file.size)} · novo</span>
                    <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setPending(pending.filter((_, j) => j !== i))} aria-label={`Remover ${file.name}`}><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">As alterações são salvas quando você clicar em {holder ? "Salvar alterações" : "Criar titular"}.</p>
          </div>
        </Collapsible>

        <Field label="Observações">
          <textarea className="input min-h-[80px] py-2" maxLength={2000} placeholder="Anote detalhes úteis sobre este titular." value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} aria-label="Observações" />
        </Field>
      </form>
    </Modal>
  );
}

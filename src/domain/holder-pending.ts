// Cadastro do titular: o que falta preencher. CPF e telefone são os importantes (emissão, validação facial, contato).
import { holderCpf } from "./beneficiaries";

export type HolderLike = { documents: unknown; phone?: string | null; birthDate?: string | null; accessEmail?: string | null; address?: string | null; addressParts?: Record<string, string> | null };
export type Pending = { key: "cpf" | "phone" | "birth" | "email" | "address"; label: string; important: boolean };

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/** CPF formatado (000.000.000-00) quando tem 11 dígitos; senão, os dígitos como estão. */
export const fmtCpf = (cpf: string) => (cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf);

/** Telefone formatado: (61) 99999-9999, (61) 3333-4444 ou +55 (61) 99999-9999. */
export function fmtPhone(phone: string) {
  let d = digits(phone);
  const ddi = d.length > 11 && d.startsWith("55") ? "+55 " : "";
  if (ddi) d = d.slice(2);
  if (d.length === 11) return `${ddi}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${ddi}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone.trim();
}

/** O que falta no cadastro, com CPF e telefone primeiro (os importantes). */
export function holderPending(h: HolderLike): Pending[] {
  const out: Pending[] = [];
  if (!holderCpf(h.documents)) out.push({ key: "cpf", label: "CPF", important: true });
  if (digits(h.phone).length < 10) out.push({ key: "phone", label: "Telefone", important: true });
  if (!h.birthDate) out.push({ key: "birth", label: "Nascimento", important: false });
  if (!h.accessEmail?.trim()) out.push({ key: "email", label: "E-mail", important: false });
  const parts = h.addressParts ?? null;
  const hasAddress = !!h.address?.trim() || !!(parts && (parts.logradouro || parts.cep));
  if (!hasAddress) out.push({ key: "address", label: "Endereço", important: false });
  return out;
}

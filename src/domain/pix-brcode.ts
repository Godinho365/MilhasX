// PIX "copia e cola" (BR Code / EMV®) para o comprador pagar escaneando ou colando no banco, com o valor já
// preenchido. Montado e conferido no próprio navegador (nada é enviado): o código traz a chave, o nome, a
// cidade e o valor, e termina com o CRC16 que os bancos exigem. O QR na tela é só a imagem desse mesmo código.

import type { PixInfo } from "./deal-message";

/** Campo EMV: id + tamanho (2 dígitos) + valor. */
const emv = (id: string, value: string) => id + String(value.length).padStart(2, "0") + value;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o BR Code pede, em 4 hexadecimais maiúsculos. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const noAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Só caracteres simples (sem acento, sem emoji), cortado no tamanho máximo do campo. */
const field = (s: string, max: number) => noAccent(s).replace(/[^\x20-\x7E]/g, "").trim().slice(0, max).trim();

/** A chave do jeito que o PIX espera: CPF/CNPJ só com dígitos; telefone com +55; e-mail e aleatória como estão. */
export function pixKeyValue(p: Pick<PixInfo, "keyType" | "key">): string {
  const raw = p.key.trim();
  const digits = raw.replace(/\D/g, "");
  if (p.keyType === "CPF" || p.keyType === "CNPJ") return digits;
  if (p.keyType === "TELEFONE") return digits ? `+55${digits.replace(/^0+/, "").replace(/^55/, "")}` : "";
  return raw;
}

export type PixCharge = { pix: PixInfo; amountCents?: number | null; txid?: string | null };

/** O código PIX copia e cola. null se não houver chave. */
export function pixBrCode({ pix, amountCents, txid }: PixCharge): string | null {
  const key = pixKeyValue(pix);
  if (!key) return null;
  const name = field(pix.name || "", 25) || "RECEBEDOR";
  const city = field(pix.city || "", 15) || "BRASIL";
  const merchant = emv("26", emv("00", "br.gov.bcb.pix") + emv("01", key));
  const ref = (txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const amount = amountCents && amountCents > 0 ? emv("54", (amountCents / 100).toFixed(2)) : "";
  const payload =
    emv("00", "01") + // versão do formato
    merchant +
    emv("52", "0000") + // categoria
    emv("53", "986") + // moeda: BRL
    amount +
    emv("58", "BR") + // país
    emv("59", name) +
    emv("60", city) +
    emv("62", emv("05", ref)) + // dados adicionais: referência
    "6304"; // id + tamanho do CRC, que entra no cálculo
  return payload + crc16(payload);
}

// Mensagem para o comprador quando a emissão sai (CRM Milhas): agradece, passa o localizador e os
// passageiros e cobra pelo PIX. O usuário copia ou abre no WhatsApp e anexa o bilhete por lá.
// Duas versões: cliente final (quem viaja) e revendedor (balcão/agência que compra as milhas para
// emitir para o cliente dele — o tom é de parceria e o bilhete é para repassar).

export const PIX_KEY_TYPES = { CPF: "CPF", CNPJ: "CNPJ", EMAIL: "E-mail", TELEFONE: "Telefone", ALEATORIA: "Chave aleatória" } as const;
export type PixKeyType = keyof typeof PIX_KEY_TYPES;
export type PixInfo = { keyType: PixKeyType; key: string; name: string; bank: string };

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Chave formatada para leitura (CPF/CNPJ com pontuação); as outras como foram digitadas. */
export function formatPixKey(p: Pick<PixInfo, "keyType" | "key">) {
  const d = p.key.replace(/\D/g, "");
  if (p.keyType === "CPF" && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (p.keyType === "CNPJ" && d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return p.key.trim();
}

export function issuedMessage(i: { buyerName: string; reseller?: boolean; locator: string | null; passengers: string[]; points: number | null; taxesCents?: number | null; chargeCents: number | null; pix: PixInfo | null }) {
  const first = i.buyerName.trim().split(/\s+/)[0] ?? "";
  const lines = [
    `Olá${first ? `, ${first}` : ""}! 😊`,
    "",
    i.reseller ? "Emissão concluída com sucesso! ✅ Obrigado pela compra das milhas." : "Muito obrigado pela sua compra! Sua emissão foi concluída com sucesso. ✈️",
    "",
    ...(i.locator ? [`*Localizador:* ${i.locator}`] : []),
    ...(i.passengers.length ? [`*${i.passengers.length > 1 ? "Passageiros" : "Passageiro"}:* ${i.passengers.join(", ")}`] : []),
    ...(i.points ? [`*Milhas:* ${i.points.toLocaleString("pt-BR")}`] : []),
    ...(i.taxesCents ? [`*Taxas de embarque:* ${brl(i.taxesCents)}`] : []),
    "",
    i.reseller
      ? "Segue o bilhete em anexo para você repassar ao seu cliente. Confira os dados do passageiro e, se houver qualquer divergência, me avise o quanto antes."
      : "Segue o bilhete em anexo. Confira os dados e, se notar qualquer divergência, me avise.",
  ];
  if (i.chargeCents != null || i.pix) {
    lines.push("", "*Pagamento*");
    if (i.chargeCents != null && i.taxesCents) {
      // com taxas: mostra milhas + taxas e o total a pagar
      lines.push(`✈️ Milhas: ${brl(i.chargeCents - i.taxesCents)}`, `🧾 Taxas: ${brl(i.taxesCents)}`, `💰 *Total: ${brl(i.chargeCents)}*`);
    } else if (i.chargeCents != null) lines.push(`💰 Valor: ${brl(i.chargeCents)}`);
    if (i.pix) {
      lines.push(`🔑 Chave PIX (${PIX_KEY_TYPES[i.pix.keyType]}): ${formatPixKey(i.pix)}`);
      if (i.pix.name.trim()) lines.push(`👤 ${i.pix.name.trim()}`);
      if (i.pix.bank.trim()) lines.push(`🏦 ${i.pix.bank.trim()}`);
    }
    lines.push("", "Assim que fizer o PIX, me envie o comprovante, por favor.");
  }
  lines.push("", i.reseller ? "Obrigado pela parceria! Fico à disposição para as próximas emissões. 🤝" : "Qualquer dúvida, estou à disposição. Boa viagem! 🙌");
  return lines.join("\n");
}

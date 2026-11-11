// Extrai o texto de um PDF no servidor (para ler o bilhete de emissão). Usa pdf-parse; se o PDF não tiver texto
// (ex.: digitalizado como imagem) ou der erro, devolve string vazia — quem chama decide o que fazer.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const { text } = await pdfParse(buf);
    return text ?? "";
  } catch {
    return "";
  }
}

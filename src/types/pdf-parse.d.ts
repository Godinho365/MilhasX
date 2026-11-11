// pdf-parse não traz tipos. Importamos o lib direto (pdf-parse/lib/pdf-parse.js) para não disparar o modo de
// debug do index (que lê um PDF de teste no require).
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Buffer | Uint8Array, options?: unknown): Promise<{ text: string; numpages: number; info: unknown }>;
  export default pdfParse;
}

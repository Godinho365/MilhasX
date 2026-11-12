/**
 * Roda uma vez quando o servidor Next.js sobe. Liga as tarefas de e-mail agendadas (de hora em hora).
 * Só em produção (o next dev não manda e-mail para usuários reais). EMAIL_JOBS=off desliga (ex.: uma segunda instância do app, para não dividir o trabalho).
 */
export async function register() {
  // O teste direto de NEXT_RUNTIME deixa o import fora do pacote edge (lá não existe o módulo de e-mail)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV !== "production" || process.env.EMAIL_JOBS === "off") return;
    const { runEmailJobs } = await import("./server/emails/jobs");
    const first = setTimeout(() => void runEmailJobs(), 60_000);
    const every = setInterval(() => void runEmailJobs(), 60 * 60_000);
    first.unref?.();
    every.unref?.();
  }
}

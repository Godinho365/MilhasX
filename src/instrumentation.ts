// Agendador do coletor de lojas (como a referência, que relê as paridades de hora em hora).
// Liga só com STORE_SYNC_MINUTES no ambiente (ex.: 60) e só no servidor Node, nunca nos testes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const minutes = Number(process.env.STORE_SYNC_MINUTES);
  if (!Number.isFinite(minutes) || minutes < 15) return;
  const { collectAll } = await import("./server/services/store-import");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await collectAll();
    } catch {
      // erros de cada fonte já são registrados; o próximo ciclo tenta de novo
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000); // primeira coleta 1 min depois de subir
  setInterval(tick, minutes * 60_000);
}

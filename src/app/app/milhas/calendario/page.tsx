import { requirePageUser, selectedHolderId, holderScopeLabel } from "@/server/session";
import { clubCalendar } from "@/server/services/miles";
import { ClubCalendar } from "./client";

/** Calendário dos clubes: os planos de cada conta (LATAM Pass, Livelo...) e as cobranças dos 12 meses numa página.
 *  Carrega o ano pedido e os vizinhos, para o filtro e as setas de ano trocarem na hora, sem voltar ao servidor. */
export default async function ClubCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const nowYear = new Date().getUTCFullYear();
  const year = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : nowYear;
  const holderId = await selectedHolderId(user.id);
  const [cal, scope] = await Promise.all([clubCalendar(user.id, holderId, year - 1, year + 1), holderScopeLabel(holderId)]);
  return <ClubCalendar cal={cal} initialYear={year} initialProgram={sp.programa ?? null} scope={scope} />;
}

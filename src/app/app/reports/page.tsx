import { redirect } from "next/navigation";

// /app/reports abre a Visão Geral, mantendo os filtros da URL
export default async function ReportsIndex({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams);
  redirect(`/app/reports/overview${q.size ? `?${q}` : ""}`);
}

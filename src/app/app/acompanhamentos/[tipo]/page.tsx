import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { trackingList } from "@/server/services/tracking";
import { PageHeader } from "@/components/stat";
import { can } from "@/domain/permissions";
import { isDay } from "@/domain/calendar";
import { TRACK_TABS, isTrackTab, type Period } from "@/domain/tracking";
import { TrackingClient } from "./client";

const PERIOD_KEYS: Period[] = ["proximos", "7", "30", "todos", "custom"];

export default async function TrackingPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const { tipo } = await params;
  if (!isTrackTab(tipo)) notFound();
  const user = await requirePageUser();
  const sp = await searchParams;
  let period: Period = PERIOD_KEYS.includes(sp.periodo as Period) ? (sp.periodo as Period) : "proximos";
  if (period === "custom" && !(isDay(sp.de) && isDay(sp.ate) && sp.ate >= sp.de)) period = "proximos";
  const [data, members] = await Promise.all([
    trackingList(user.id, tipo, period, period === "custom" ? { from: sp.de, to: sp.ate } : {}),
    prisma.teamMember.findMany({ where: { userId: user.id, active: true }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  const t = TRACK_TABS[tipo];
  return (
    <>
      <PageHeader title={t.label} subtitle={t.subtitle} />
      <TrackingClient key={tipo} tab={tipo} initial={data} members={members} canEdit={can(user.actor.permissions, "vendas", "edit")} me={user.actor.memberId} />
    </>
  );
}

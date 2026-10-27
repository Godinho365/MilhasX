import { Megaphone } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { listNews } from "@/server/services/extras";
import { MarkNewsRead } from "./client";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/stat";
import { Empty } from "@/components/ui";

export default async function NewsPage() {
  const user = await requirePageUser();
  const [items, pref] = await Promise.all([listNews(), prisma.userPreference.findUnique({ where: { userId: user.id }, select: { newsReadAt: true } })]);
  const lastRead = pref?.newsReadAt ?? new Date(0);
  return (
    <>
      <PageHeader title="Novidades" subtitle="O que mudou no app" />
      <MarkNewsRead />
      {items.length === 0 ? <Empty title="Nenhuma novidade ainda" icon={<Megaphone className="h-5 w-5" />} /> : (
        <ol className="relative space-y-4 border-l border-line pl-6">
          {items.map((n) => (
            <li key={n.id} className="relative">
              <span className={`absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-bg ${n.publishedAt > lastRead ? "bg-accent-light" : "bg-zinc-700"}`} aria-hidden />
              <article className="card card-pad">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <time dateTime={n.publishedAt.toISOString()}>{n.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</time>
                  {n.publishedAt > lastRead && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-light">novo</span>}
                </div>
                <h2 className="text-lg font-semibold">{n.title}</h2>
                <div className="mt-2 space-y-2 text-sm leading-6 text-zinc-300">{n.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

import Link from "next/link";
import { PlayCircle, BookOpen, Clock, GraduationCap } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { listGuides } from "@/server/services/extras";
import { PageHeader } from "@/components/stat";
import { Empty } from "@/components/ui";

const LEVEL = { BEGINNER: "Iniciante", INTERMEDIATE: "Intermediário", ADVANCED: "Avançado" } as const;

export default async function GuidesPage() {
  await requirePageUser();
  const guides = await listGuides();
  const videos = guides.filter((g) => g.kind === "VIDEO");
  const articles = guides.filter((g) => g.kind === "ARTICLE");
  if (guides.length === 0) return <><PageHeader title="Guias" /><Empty title="Nenhum guia publicado ainda" icon={<GraduationCap className="h-5 w-5" />} /></>;
  return (
    <>
      <PageHeader title="Guias" subtitle="Aprenda a usar o app e os conceitos de milhas no seu ritmo" />
      {videos.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold">Tutoriais</h2>
          <p className="mb-4 text-sm text-muted">Passo a passo de cada parte do app.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((g) => (
              <Link key={g.id} href={`/app/guides/${g.slug}`} className="card flex gap-3 p-4 transition-colors hover:border-zinc-600">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-light"><PlayCircle className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block font-semibold">{g.title}</span><span className="line-clamp-2 text-sm text-muted">{g.summary}</span></span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {articles.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Guias</h2>
          <p className="mb-4 text-sm text-muted">Conceitos para tomar decisões melhores com seus pontos.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((g) => (
              <article key={g.id} className="card flex flex-col p-5">
                <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-panel2 px-2 py-0.5 font-medium text-zinc-200">{LEVEL[g.level]}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{g.minutes} min</span>
                </div>
                <h3 className="text-lg font-semibold">{g.title}</h3>
                <p className="mt-1 text-sm text-muted">{g.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{g.tags.map((t) => <span key={t} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t}</span>)}</div>
                <Link href={`/app/guides/${g.slug}`} prefetch={false} className="btn-ghost mt-4 self-start"><BookOpen className="h-4 w-4" />Começar</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

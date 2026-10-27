import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";

const LEVEL = { BEGINNER: "Iniciante", INTERMEDIATE: "Intermediário", ADVANCED: "Avançado" } as const;

/** Só aceita vídeos do YouTube/Vimeo em iframe; outros links viram um botão externo. */
function embedUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.get("v")) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.searchParams.get("v")!)}`;
    if (u.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    if (/(^|\.)vimeo\.com$/.test(u.hostname) && /^\/\d+$/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
  } catch {}
  return null;
}

/** "## " na primeira linha vira subtítulo; o restante vira lista (linhas com "- ") ou parágrafo. */
function Block({ text }: { text: string }) {
  const lines = text.split("\n");
  const title = lines[0]!.startsWith("## ") ? lines.shift()!.slice(3) : null;
  const body = lines.join("\n").trim();
  const isList = body !== "" && body.split("\n").every((l) => l.startsWith("- "));
  return (
    <>
      {title && <h2 className="pt-2 text-xl font-semibold text-white">{title}</h2>}
      {body &&
        (isList ? (
          <ul className="list-disc space-y-1 pl-6">{body.split("\n").map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>
        ) : (
          <p>{body}</p>
        ))}
    </>
  );
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePageUser();
  const { slug } = await params;
  const g = await prisma.guide.findFirst({ where: { slug, published: true } });
  if (!g) notFound();
  const embed = embedUrl(g.videoUrl);
  // Texto simples renderizado como React (sem HTML bruto): "## " vira subtítulo, linhas em branco separam parágrafos
  const blocks = g.body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/app/guides" className="btn-subtle mb-4 -ml-2"><ArrowLeft className="h-4 w-4" />Guias</Link>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-panel2 px-2 py-0.5 font-medium text-zinc-200">{LEVEL[g.level]}</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{g.minutes} min</span>
        {g.tags.map((t) => <span key={t} className="rounded-full border border-line px-2 py-0.5">{t}</span>)}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{g.title}</h1>
      <p className="mt-2 text-lg text-muted">{g.summary}</p>
      {embed && (
        <div className="mt-6 aspect-video overflow-hidden rounded-card border border-line">
          <iframe src={embed} title={g.title} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
        </div>
      )}
      {!embed && g.videoUrl && <a href={g.videoUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-6">Assistir o vídeo</a>}
      <div className="mt-8 space-y-4 text-[15px] leading-7 text-zinc-200">
        {blocks.map((b, i) => <Block key={i} text={b} />)}
      </div>
    </article>
  );
}

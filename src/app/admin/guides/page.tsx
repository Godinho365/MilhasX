import { listGuides } from "@/server/services/extras";
import { PageHeader } from "@/components/stat";
import { GuidesAdmin } from "./client";

export default async function AdminGuides() {
  const guides = await listGuides(true);
  return (
    <>
      <PageHeader title="Guias" subtitle="Tutoriais e guias exibidos na área Guias" />
      <GuidesAdmin items={guides.map((g) => ({ id: g.id, slug: g.slug, kind: g.kind, title: g.title, summary: g.summary, body: g.body, level: g.level, minutes: g.minutes, tags: g.tags.join(", "), videoUrl: g.videoUrl ?? "", order: g.order, published: g.published }))} />
    </>
  );
}

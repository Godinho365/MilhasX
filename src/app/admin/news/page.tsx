import { listNews } from "@/server/services/extras";
import { PageHeader } from "@/components/stat";
import { NewsAdmin } from "./client";

export default async function AdminNews() {
  const items = await listNews(true);
  return (
    <>
      <PageHeader title="Novidades" subtitle="Publicações exibidas em Novidades, com contador de não lidas" />
      <NewsAdmin items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, publishedAt: n.publishedAt.toISOString().slice(0, 10), published: n.published }))} />
    </>
  );
}

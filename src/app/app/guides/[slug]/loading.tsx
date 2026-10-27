import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Carregando guia">
      <Skeleton className="mb-4 h-8 w-24" />
      <Skeleton className="mb-3 h-10 w-2/3" />
      <Skeleton className="mb-8 h-6 w-full" />
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mb-3 h-4 w-full" />)}
    </div>
  );
}

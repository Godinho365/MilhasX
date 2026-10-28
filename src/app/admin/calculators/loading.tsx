import { PageSkeleton } from "@/components/skeleton";

// Fronteira de carregamento por página (uma no layout causava navegações descartadas no Next 15)
export default function Loading() {
  return <PageSkeleton cards={4} rows={5} />;
}

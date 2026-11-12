import { appName } from "@/server/session";
import { PublicFooter, PublicHeader } from "@/components/public-header";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const name = appName();
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader name={name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        <article className="legal card p-5 sm:p-8">{children}</article>
      </main>
      <PublicFooter name={name} />
    </div>
  );
}

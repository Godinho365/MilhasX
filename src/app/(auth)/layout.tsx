import { appName } from "@/server/session";
import { PublicHeader } from "@/components/public-header";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.10),transparent_60%)]">
      <PublicHeader name={appName()} />
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center sm:pt-0">
        <div className="card w-full max-w-[400px] p-5 sm:p-6">{children}</div>
      </main>
    </div>
  );
}

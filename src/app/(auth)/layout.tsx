import { appName } from "@/server/session";
import { BrandMark } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center text-xl">
          <BrandMark name={appName()} size={40} />
        </div>
        <div className="card p-6 sm:p-7">{children}</div>
      </div>
    </main>
  );
}

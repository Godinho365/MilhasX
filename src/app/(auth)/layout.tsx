import { appName } from "@/server/session";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-xl font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-violet-500 text-sm font-bold text-white">M</span>
          {appName()}
        </div>
        <div className="card p-6 sm:p-7">{children}</div>
      </div>
    </main>
  );
}

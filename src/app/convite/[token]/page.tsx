import { appName } from "@/server/session";
import { BrandMark } from "@/components/brand";
import { invitePreview } from "@/server/services/team-access";
import { InviteForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Convite para a equipe", referrer: "no-referrer", robots: { index: false } };

// Convite para entrar na equipe de uma agência: quem recebeu o link cria a senha e já entra.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await invitePreview(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center text-xl"><BrandMark name={appName()} size={40} /></div>
        <div className="card p-6 sm:p-7">
          {invite ? <InviteForm token={token} invite={invite} /> : (
            <div className="space-y-3">
              <h1 className="text-lg font-semibold">Convite inválido</h1>
              <p className="text-sm text-muted">Este link de convite não vale mais: ele já foi usado, venceu (vale 7 dias) ou foi cancelado. Peça um novo convite ao dono da conta.</p>
              <a className="btn-ghost w-full" href="/login">Ir para o login</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Gift } from "lucide-react";
import { currentUser } from "@/server/session";
import { publicInvite } from "@/server/services/promo";
import { INVITE_STATE_LABEL } from "@/domain/promo";
import { AuthTitle } from "../../parts";
import { RedeemButton } from "./redeem";

export const metadata = { title: "Convite", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code);
  const [inv, user] = await Promise.all([publicInvite(code), currentUser()]);
  if (!inv) {
    return (
      <div className="space-y-4 text-center">
        <AuthTitle title="Convite não encontrado" subtitle="Confira o link que você recebeu." />
        <Link href="/register" className="btn-ghost w-full">Criar conta sem convite</Link>
      </div>
    );
  }
  const q = `convite=${encodeURIComponent(inv.code)}`;
  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-300"><Gift className="h-7 w-7" /></span>
      <AuthTitle title="Você recebeu um convite" subtitle={inv.label} />
      {inv.state !== "active" ? (
        <p className="rounded-lg bg-panel2 px-3 py-2 text-sm text-muted">Este convite está {INVITE_STATE_LABEL[inv.state].toLowerCase()} e não pode mais ser usado.</p>
      ) : user ? (
        <>
          <p className="text-sm text-muted">Você entrou como <strong className="text-zinc-100">{user.name}</strong>. Confirme para aplicar na sua conta.</p>
          <RedeemButton code={inv.code} />
        </>
      ) : (
        <div className="space-y-2">
          <Link href={`/register?${q}`} className="btn-primary w-full">Criar minha conta</Link>
          <Link href={`/login?${q}`} className="btn-ghost w-full">Já tenho conta</Link>
        </div>
      )}
    </div>
  );
}

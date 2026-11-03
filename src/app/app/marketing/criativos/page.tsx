import Link from "next/link";
import { Sparkles, Image as ImageIcon, KeyRound, Palette } from "lucide-react";
import { requirePageUser } from "@/server/session";

// Criativos: artes para o Instagram geradas por IA a partir de uma oferta. A geração depende de um
// serviço de IA de imagem com chave de API própria; enquanto não houver chave configurada, a tela
// mostra o que falta (nada é gerado nem cobrado).
export default async function CriativosPage() {
  await requirePageUser();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel2 text-muted"><Sparkles className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Criativos</h1>
          <p className="text-sm text-muted">Artes para o Instagram da agência feitas por IA a partir de uma oferta: feed quadrado, feed retrato e story.</p>
        </div>
      </div>
      <section className="card card-pad space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-muted" />Falta ligar o serviço de IA de imagem</h2>
        <p className="text-sm text-muted">A arte é desenhada por um serviço de IA de imagem, que cobra por imagem gerada. Para ligar, é preciso uma conta nesse serviço e a chave de API dela configurada no servidor do app. Sem a chave, nada é gerado nem cobrado.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Briefing: destino, texto da oferta e o que destacar.</li>
          <li>Formatos 1:1, 4:5 e 9:16, com até 3 variações e clima da arte (praia, luxo, família…).</li>
          <li>Kit da marca: logo, cores e posts de referência para as artes saírem com a cara da agência.</li>
          <li>Galeria com as artes geradas, para baixar e publicar.</li>
        </ul>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card card-pad"><p className="flex items-center gap-2 font-medium"><ImageIcon className="h-4 w-4 text-muted" />Enquanto isso</p><p className="mt-1 text-sm text-muted">Monte os pacotes na <Link href="/app/marketing/vitrine" className="text-accent-light hover:underline">Vitrine</Link> e compartilhe o link no Instagram e no WhatsApp.</p></div>
        <div className="card card-pad"><p className="flex items-center gap-2 font-medium"><Palette className="h-4 w-4 text-muted" />Sua marca</p><p className="mt-1 text-sm text-muted">Logo e cores da agência ficam em <Link href="/app/marketing/site" className="text-accent-light hover:underline">Marketing › Site</Link>.</p></div>
      </section>
    </div>
  );
}

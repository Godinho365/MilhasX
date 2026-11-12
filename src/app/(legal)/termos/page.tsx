import type { Metadata } from "next";
import Link from "next/link";
import { appName } from "@/server/session";
import { contactEmail } from "@/server/contact";

export const metadata: Metadata = { title: "Termos de Serviço" };

export default function TermosPage() {
  const app = appName();
  const contact = contactEmail();
  return (
    <>
      <h1>Termos de Serviço</h1>
      <p className="updated">Última atualização: 12 de novembro de 2026</p>

      <p>
        Estes Termos de Serviço regulam o uso da plataforma {app} (&quot;plataforma&quot;, &quot;nós&quot;). Ao criar uma conta ou usar a plataforma,
        você declara que leu, entendeu e concorda com estes termos e com a <Link href="/privacidade" className="underline">Política de Privacidade</Link>.
        Se não concordar, não utilize o serviço.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O {app} é uma ferramenta de gestão de milhas e pontos: controle de carteiras e titulares, custo do milheiro, extratos, compras, vendas,
        clientes, financeiro e recursos relacionados. A plataforma organiza as informações que você cadastra; ela não é uma companhia aérea, programa
        de fidelidade, agência de viagens nem instituição financeira, e não garante preços, cotações, disponibilidade de emissões ou resultados.
      </p>

      <h2>2. Cadastro e conta</h2>
      <ul>
        <li>Você deve ter pelo menos 18 anos e fornecer dados verdadeiros, completos e atualizados.</li>
        <li>Você é responsável por manter sua senha em sigilo e por todas as atividades feitas na sua conta, inclusive por membros da equipe a quem der acesso.</li>
        <li>Ao entrar com Google, você autoriza que usemos nome e e-mail da sua conta Google para criar ou acessar sua conta.</li>
        <li>Avise-nos imediatamente se suspeitar de uso não autorizado da sua conta.</li>
      </ul>

      <h2>3. Uso permitido</h2>
      <p>Você concorda em não:</p>
      <ul>
        <li>usar a plataforma para fraudes, atividades ilegais ou que violem regras dos programas de fidelidade e de terceiros;</li>
        <li>cadastrar dados de terceiros sem base legal ou autorização deles;</li>
        <li>tentar acessar áreas, contas ou dados de outros usuários, burlar mecanismos de segurança ou sobrecarregar o serviço;</li>
        <li>copiar, revender ou fazer engenharia reversa da plataforma sem autorização.</li>
      </ul>
      <p>
        Você é o único responsável pelas operações com milhas e pontos que realizar, pelo cumprimento dos regulamentos de cada programa e pelas
        obrigações fiscais decorrentes das suas atividades.
      </p>

      <h2>4. Planos, período de teste e pagamentos</h2>
      <p>
        Alguns recursos podem exigir assinatura paga. Valores, períodos de teste e condições de cada plano são informados na própria plataforma antes
        da contratação. A assinatura é renovada automaticamente até ser cancelada; o cancelamento interrompe as próximas cobranças e o acesso aos
        recursos pagos ao fim do período já pago.
      </p>

      <h2>5. Seus dados e conteúdo</h2>
      <p>
        Os dados que você cadastra continuam sendo seus. Você nos concede apenas a permissão necessária para armazená-los e processá-los com o
        objetivo de prestar o serviço, conforme a <Link href="/privacidade" className="underline">Política de Privacidade</Link>. Recomendamos manter
        cópias das informações importantes.
      </p>

      <h2>6. Disponibilidade e alterações</h2>
      <p>
        Trabalhamos para manter a plataforma disponível e segura, mas ela pode passar por manutenções, falhas ou interrupções. Podemos alterar, incluir
        ou remover funcionalidades. Integrações com serviços de terceiros (por exemplo, Telegram, Google ou meios de pagamento) dependem desses
        serviços e de seus próprios termos.
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, não nos responsabilizamos por perdas decorrentes de decisões tomadas com base nas informações da
        plataforma, de dados cadastrados incorretamente, de bloqueios ou alterações feitas pelos programas de fidelidade, ou de falhas de serviços
        de terceiros. Nada nestes termos limita direitos garantidos pelo Código de Defesa do Consumidor quando aplicável.
      </p>

      <h2>8. Suspensão e encerramento</h2>
      <p>
        Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas que violem estes termos ou a lei, mediante aviso
        quando possível.
      </p>

      <h2>9. Mudanças nestes termos</h2>
      <p>
        Podemos atualizar estes termos. Mudanças relevantes serão comunicadas pela plataforma ou por e-mail; o uso continuado após a atualização
        significa concordância com a nova versão.
      </p>

      <h2>10. Lei aplicável</h2>
      <p>Estes termos são regidos pelas leis da República Federativa do Brasil.</p>

      <h2>11. Contato</h2>
      <p>
        Dúvidas sobre estes termos
        {contact ? (
          <>: <a href={`mailto:${contact}`} className="underline">{contact}</a>.</>
        ) : (
          " podem ser enviadas pelos canais de atendimento informados na plataforma."
        )}
      </p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { appName } from "@/server/session";
import { contactEmail } from "@/server/contact";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  const app = appName();
  const contact = contactEmail();
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="updated">Última atualização: 12 de novembro de 2026</p>

      <p>
        Esta política explica como o {app} coleta, usa, armazena e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados
        (Lei nº 13.709/2018 – LGPD). Ela complementa os <Link href="/termos" className="underline">Termos de Serviço</Link>.
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail, telefone e senha (guardada apenas de forma criptografada, com hash).</li>
        <li><strong>Login com Google:</strong> nome, e-mail e identificador da conta Google. Não recebemos sua senha do Google.</li>
        <li><strong>Dados que você cadastra:</strong> titulares, contas de programas de fidelidade, saldos, lançamentos, clientes, passageiros, vendas e demais registros da sua operação.</li>
        <li><strong>Dados técnicos:</strong> endereço IP, data e hora de acesso, navegador e registros de segurança (por exemplo, tentativas de login).</li>
        <li><strong>Pagamentos:</strong> processados pelo provedor de pagamento; não armazenamos dados completos de cartão.</li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>criar e manter sua conta e prestar as funcionalidades da plataforma (execução de contrato);</li>
        <li>proteger a plataforma contra fraudes, robôs e acessos indevidos (legítimo interesse);</li>
        <li>enviar comunicações sobre a conta, segurança e assinatura;</li>
        <li>cumprir obrigações legais e regulatórias.</li>
      </ul>
      <p>Não vendemos seus dados pessoais.</p>

      <h2>3. Dados da sua Conta Google</h2>
      <p>
        Se você escolher &quot;Continuar com Google&quot; ou &quot;Cadastrar com Google&quot;, o {app} solicita ao Google apenas os escopos básicos
        de login (<code>openid</code>, <code>email</code> e <code>profile</code>). Com eles recebemos somente:
      </p>
      <ul>
        <li><strong>nome</strong>, para preencher o nome da sua conta;</li>
        <li><strong>endereço de e-mail</strong> e a confirmação de que ele foi verificado pelo Google, para identificar sua conta;</li>
        <li><strong>identificador da Conta Google</strong>, para reconhecer você nos próximos acessos.</li>
      </ul>
      <p>
        Esses dados são usados exclusivamente para criar sua conta e permitir que você entre na plataforma. Não acessamos seus e-mails, contatos,
        arquivos, agenda nem qualquer outro dado da sua Conta Google, não usamos esses dados para publicidade, não os vendemos e não os
        compartilhamos com terceiros, exceto quando exigido por lei.
      </p>
      <p>
        O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google seguem a{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline">Política de dados do usuário dos serviços de API do Google</a>,
        incluindo os requisitos de Uso Limitado.
      </p>
      <p>
        Você pode desvincular o {app} da sua Conta Google a qualquer momento em{" "}
        <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" className="underline">myaccount.google.com/connections</a>.
        Para apagar também os dados guardados por nós, peça a exclusão da conta (veja &quot;Seus direitos&quot;).
      </p>

      <h2>4. Compartilhamento</h2>
      <p>Compartilhamos dados apenas com fornecedores necessários para operar o serviço, que tratam os dados segundo nossas instruções:</p>
      <ul>
        <li>hospedagem e infraestrutura;</li>
        <li>Cloudflare (verificação anti-robô Turnstile no cadastro);</li>
        <li>Google (quando você escolhe entrar com Google);</li>
        <li>provedor de pagamento das assinaturas;</li>
        <li>serviços que você mesmo conectar (por exemplo, Telegram);</li>
        <li>autoridades, quando exigido por lei ou ordem judicial.</li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        Usamos cookies essenciais para manter você conectado, lembrar preferências (como o tema) e proteger o login. A verificação da Cloudflare
        pode usar cookies próprios para diferenciar pessoas de robôs.
      </p>

      <h2>6. Armazenamento e segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger os dados, como conexão criptografada (HTTPS), senhas com hash, credenciais
        sensíveis criptografadas, controle de acesso e registros de auditoria. Mantemos os dados enquanto sua conta estiver ativa ou pelo prazo
        necessário para cumprir obrigações legais. Depois de um pedido de exclusão, os dados da conta são apagados ou anonimizados, salvo os que a lei
        obriga a guardar (como registros de acesso, mantidos por 6 meses conforme o Marco Civil da Internet).
      </p>
      <p>A plataforma não se destina a menores de 18 anos, e não coletamos conscientemente dados de menores.</p>

      <h2>7. Seus direitos</h2>
      <p>Pela LGPD, você pode solicitar a qualquer momento:</p>
      <ul>
        <li>confirmação e acesso aos seus dados;</li>
        <li>correção de dados incompletos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários;</li>
        <li>portabilidade dos dados;</li>
        <li>informação sobre com quem compartilhamos seus dados;</li>
        <li>revogação do consentimento, quando o tratamento se basear nele;</li>
        <li>exclusão da conta e dos dados, ressalvadas as hipóteses de guarda obrigatória por lei.</li>
      </ul>

      <h2>8. Dados de terceiros</h2>
      <p>
        Ao cadastrar dados de clientes, passageiros ou titulares, você é o controlador desses dados e deve ter base legal para tratá-los. Nós
        atuamos como operador, tratando-os apenas para prestar o serviço.
      </p>

      <h2>9. Alterações</h2>
      <p>Podemos atualizar esta política. Mudanças relevantes serão comunicadas pela plataforma ou por e-mail.</p>

      <h2>10. Contato</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre privacidade
        {contact ? (
          <>, escreva para <a href={`mailto:${contact}`} className="underline">{contact}</a>.</>
        ) : (
          ", fale conosco pelos canais de atendimento informados na plataforma."
        )}
      </p>
    </>
  );
}

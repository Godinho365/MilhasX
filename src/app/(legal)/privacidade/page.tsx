import type { Metadata } from "next";
import Link from "next/link";
import { appName } from "@/server/session";
import { contactEmail } from "@/server/contact";
import { CookiePreferencesLink } from "@/components/consent/link";
import { CONSENT_MAX_AGE_DAYS, CONSENT_VERSION } from "@/domain/consent";

export const metadata: Metadata = { title: "Política de Privacidade" };

/**
 * Campo que o responsável precisa preencher (dado da empresa, prazo, base legal, fornecedor...). Fica destacado na
 * página de propósito: nada aqui foi inventado para tapar lacuna. Procure por <Fill> para achar todos.
 */
function Fill({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-amber-400/25 px-1 font-medium text-inherit ring-1 ring-amber-500/50">[A preencher: {children}]</mark>;
}

const COOKIES: [string, string, string, string][] = [
  ["mm_session", "Necessário", "Mantém você conectado depois do login (HttpOnly).", "30 dias ou até sair da conta"],
  ["mm_theme", "Necessário", "Lembra o tema claro ou escuro escolhido.", "1 ano"],
  ["mm_holder", "Necessário", "Lembra o titular selecionado no seletor do app (área logada).", "1 ano"],
  ["mm_google", "Necessário", "Protege o login com Google contra falsificação (só durante o login).", "10 minutos"],
  ["mm_meta", "Necessário", "Protege a conexão com a conta de anúncios do Meta (só durante a conexão, na área Tráfego).", "10 minutos"],
  ["mx_consent", "Necessário", "Guarda sua escolha de cookies, a data e a versão do aviso.", `${Math.round(CONSENT_MAX_AGE_DAYS / 30)} meses`],
];

const STORAGE: [string, string, string][] = [
  ["Preferências de tela (localStorage, área logada)", "Necessário", "Lembram escolhas de exibição feitas por você: menu recolhido, modo de visualização, colunas visíveis, filtros e itens marcados como vistos. Ficam só no seu navegador."],
  ["mx_consent_sync (sessionStorage)", "Necessário", "Evita sincronizar sua escolha de cookies com a conta mais de uma vez por sessão do navegador."],
  ["mx_utm (sessionStorage, páginas das agências)", "Marketing", "Guarda de qual anúncio ou campanha você chegou (utm_* e fbclid) durante a visita, para o pedido enviado ser ligado ao anúncio. Só com o seu consentimento; é apagado se você retirar o consentimento."],
];

export default function PrivacidadePage() {
  const app = appName();
  const contact = contactEmail();
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="updated">Última atualização: 13 de novembro de 2026 · Versão do aviso de cookies: {CONSENT_VERSION}</p>

      <p>
        Esta política explica como o {app} trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD).
        Ela complementa os <Link href="/termos" className="underline">Termos de Serviço</Link>.
      </p>

      <h2>1. Quem é o controlador</h2>
      <ul>
        <li><strong>Controlador:</strong> <Fill>razão social, CNPJ e endereço da empresa responsável pelo {app}</Fill></li>
        <li><strong>Encarregado pelo tratamento de dados (DPO):</strong> <Fill>nome do encarregado e canal de contato dele</Fill></li>
        <li>
          <strong>Contato de privacidade:</strong>{" "}
          {contact ? <a href={`mailto:${contact}`} className="underline">{contact}</a> : <Fill>e-mail de contato de privacidade (variável CONTACT_EMAIL)</Fill>}
          {" "}ou o formulário de <Link href="/privacidade/solicitacao" className="underline">pedidos sobre seus dados</Link>.
        </li>
      </ul>

      <h2>2. Dados que tratamos</h2>
      <ul>
        <li><strong>Cadastro e conta:</strong> nome, e-mail, telefone, senha (guardada só como hash) e, se você enviar, foto de perfil.</li>
        <li><strong>Login com Google:</strong> nome, e-mail e identificador da Conta Google (detalhes na seção 4).</li>
        <li>
          <strong>Dados que você cadastra na plataforma:</strong> titulares (inclusive documentos como CPF, data de nascimento e telefone), contas de
          programas de fidelidade, saldos, lançamentos, cartões, clientes, passageiros, vendas, cotações e demais registros da sua operação.
        </li>
        <li>
          <strong>Integrações que você conecta:</strong> Telegram (número usado no login, sessão criptografada e mensagens dos grupos e conversas
          escolhidos, para o recurso de chat de balcões); Meta (token de acesso criptografado e métricas dos anúncios, para a área Tráfego);
          Balcão MilhasX (token do vínculo criptografado e, do membro do Balcão vinculado, o nome e o @ do Telegram, o perfil e a situação do
          plano; as ofertas abertas do Balcão, sem identificar quem comprou, e as propostas que você manda, para a página Balcão MilhasX);
          notificações push (endereço de inscrição do navegador no aparelho em que você ativou).
        </li>
        <li>
          <strong>Assistente com inteligência artificial:</strong> o texto que você envia ao assistente e os dados da sua conta necessários para
          responder.
        </li>
        <li>
          <strong>Visitantes das páginas das agências</strong> (endereços /p/… e /s/…): nome, telefone, e-mail, dados da viagem e dos passageiros e
          mensagens enviados nos formulários e, só com consentimento de marketing, a origem da visita (parâmetros do anúncio).
        </li>
        <li><strong>Pedidos sobre dados pessoais:</strong> nome, e-mail, tipo de pedido e mensagem enviados no formulário de privacidade.</li>
        <li>
          <strong>Dados técnicos e de segurança:</strong> endereço IP, data e hora de acesso, navegador e registros de segurança (por exemplo,
          tentativas de login). Nos formulários públicos, o IP é guardado apenas como um código (hash) para limitar envios repetidos.
        </li>
        <li><strong>Pagamentos:</strong> o pagamento da assinatura é feito no ambiente do Mercado Pago; não recebemos nem guardamos os dados do cartão.</li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>Criar e manter sua conta e prestar as funcionalidades contratadas — base legal: execução de contrato.</li>
        <li>Proteger a plataforma contra fraudes, robôs e acessos indevidos — base legal: legítimo interesse.</li>
        <li>Enviar comunicações sobre a conta, segurança e assinatura — base legal: <Fill>base legal (LGPD, art. 7º)</Fill>.</li>
        <li>Cobrar a assinatura — base legal: <Fill>base legal (LGPD, art. 7º)</Fill>.</li>
        <li>Cumprir obrigações legais e regulatórias — base legal: <Fill>obrigações aplicáveis e base legal</Fill>.</li>
        <li>Responder a pedidos de titulares de dados — base legal: <Fill>base legal (LGPD, art. 7º)</Fill>.</li>
        <li>Cookies e tecnologias analíticas e de marketing — base legal: consentimento, que você dá e retira na central de preferências de cookies.</li>
      </ul>
      <p>Não vendemos seus dados pessoais.</p>

      <h2>4. Dados da sua Conta Google</h2>
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
        Para apagar também os dados guardados por nós, peça a exclusão da conta (veja a seção 9).
      </p>

      <h2>5. Com quem compartilhamos</h2>
      <p>Compartilhamos dados apenas com quem é necessário para operar o serviço ou com quem você mesmo escolhe conectar:</p>
      <ul>
        <li>hospedagem e infraestrutura: <Fill>nome do provedor de hospedagem e local dos servidores</Fill>;</li>
        <li>envio de e-mails: <Fill>nome do provedor de e-mail (SMTP)</Fill>;</li>
        <li>Cloudflare (verificação anti-robô Turnstile nos formulários de cadastro e de pedidos de privacidade);</li>
        <li>Google (quando você escolhe entrar com Google);</li>
        <li>Mercado Pago (pagamento da assinatura);</li>
        <li>Anthropic (processamento das mensagens do assistente com inteligência artificial);</li>
        <li>Meta (quando você conecta a conta de anúncios na área Tráfego);</li>
        <li>Telegram (quando você conecta sua conta ao chat de balcões);</li>
        <li>
          Balcão MilhasX, o balcão de milhas no Telegram (quando você vincula a sua conta na página Balcão MilhasX): enviamos as propostas que você
          manda por aqui e um identificador da sua conta, e recebemos os dados do seu membro do Balcão e as ofertas abertas. O vínculo é desfeito
          na própria página ou no bot do Balcão;
        </li>
        <li>serviços de notificação push do navegador ou do sistema do aparelho (quando você ativa as notificações);</li>
        <li>YouTube ou Vimeo (somente quando você toca para assistir um vídeo dos guias);</li>
        <li>autoridades, quando exigido por lei ou ordem judicial.</li>
      </ul>
      <p><Fill>confirme a lista de fornecedores e se há contratos ou cláusulas de proteção de dados com cada um</Fill></p>

      <h2>6. Transferência internacional</h2>
      <p>
        Alguns dos fornecedores acima podem tratar dados fora do Brasil. <Fill>quais fornecedores tratam dados fora do Brasil, em quais países, e o
        mecanismo usado para a transferência (LGPD, art. 33)</Fill>
      </p>

      <h2>7. Cookies e tecnologias parecidas</h2>
      <p>
        Usamos cookies <strong>necessários</strong> para o site funcionar. Cookies e tecnologias <strong>analíticos</strong> e de <strong>marketing</strong> só
        são usados depois que você permite, na primeira visita ou a qualquer momento em <CookiePreferencesLink className="underline" />. Navegar
        pelo site sem escolher não conta como permissão. Hoje nenhuma ferramenta de analytics ou de anúncios de terceiros é carregada no site.
      </p>
      <div className="mb-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-1 pr-3 font-medium">Cookie</th><th className="py-1 pr-3 font-medium">Categoria</th><th className="py-1 pr-3 font-medium">Para que serve</th><th className="py-1 font-medium">Duração</th></tr></thead>
          <tbody className="divide-y divide-line text-zinc-300">
            {COOKIES.map(([name, cat, purpose, ttl]) => (
              <tr key={name}><td className="py-2 pr-3 font-mono text-xs">{name}</td><td className="py-2 pr-3">{cat}</td><td className="py-2 pr-3">{purpose}</td><td className="py-2">{ttl}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        {STORAGE.map(([name, cat, purpose]) => <li key={name}><strong>{name}</strong> — {cat}. {purpose}</li>)}
        <li>
          <strong>Cloudflare Turnstile</strong> — Necessário. A verificação anti-robô roda só nas páginas de cadastro e de pedidos de privacidade e pode
          usar cookies e dados do navegador da própria Cloudflare.
        </li>
        <li><strong>Vídeos dos guias (YouTube e Vimeo)</strong> — o player só é carregado quando você toca para assistir.</li>
      </ul>

      <h2>8. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados da conta e os que você cadastra: <Fill>prazo de retenção enquanto a conta está ativa e depois do encerramento</Fill>.</li>
        <li>Sessões de login: até 30 dias, ou até você sair da conta.</li>
        <li>Mensagens do Telegram usadas no chat de balcões: apagadas automaticamente depois de 90 dias (padrão do sistema, pode ser alterado pela administração).</li>
        <li>Vínculo com o Balcão MilhasX: até você desvincular ou o vínculo ser desfeito no Balcão. As negociações que ele cria no CRM Milhas seguem o prazo dos dados que você cadastra.</li>
        <li>Registros de acesso e de segurança: <Fill>prazo de guarda dos registros de acesso</Fill>.</li>
        <li>Dados de cobrança e notas: <Fill>prazo exigido pela legislação aplicável</Fill>.</li>
        <li>Pedidos sobre dados pessoais: <Fill>prazo de guarda dos pedidos e das respostas</Fill>.</li>
        <li>Escolha de cookies: no navegador, até {Math.round(CONSENT_MAX_AGE_DAYS / 30)} meses; na conta, enquanto ela existir.</li>
      </ul>
      <p>
        Adotamos medidas de segurança como conexão criptografada (HTTPS), senhas com hash, credenciais e tokens de integrações criptografados,
        controle de acesso por função da equipe e registros de auditoria.
      </p>

      <h2>9. Seus direitos</h2>
      <p>Pela LGPD (art. 18), você pode pedir:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;</li>
        <li>portabilidade dos dados;</li>
        <li>eliminação dos dados tratados com base no consentimento;</li>
        <li>informação sobre com quem compartilhamos seus dados;</li>
        <li>informação sobre a possibilidade de não consentir e as consequências da negativa;</li>
        <li>revogação do consentimento;</li>
        <li>revisão de decisões tomadas unicamente com base em tratamento automatizado.</li>
      </ul>
      <p>
        Faça o pedido pelo formulário de <Link href="/privacidade/solicitacao" className="underline">pedidos sobre seus dados</Link>
        {contact ? <> ou pelo e-mail <a href={`mailto:${contact}`} className="underline">{contact}</a></> : null}. Se você tem conta, também pode
        pedir a exclusão em Configurações › Perfil. Podemos pedir informações para confirmar sua identidade antes de atender. Prazo de resposta:{" "}
        <Fill>prazo de resposta aos pedidos</Fill>. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>10. Dados de clientes das agências</h2>
      <p>
        Ao cadastrar dados de clientes, passageiros ou titulares, ou ao receber pedidos pelas suas páginas públicas, a agência usuária do {app} é
        a controladora desses dados e deve ter base legal para tratá-los; o {app} os trata para prestar o serviço à agência. Pedidos sobre esses
        dados devem ser feitos diretamente à agência. <Fill>confirme os papéis de controlador e operador e as obrigações do contrato com as agências</Fill>
      </p>

      <h2>11. Crianças e adolescentes</h2>
      <p>
        A plataforma não se destina a menores de 18 anos, e não coletamos conscientemente dados de menores para criar contas.{" "}
        <Fill>como são tratados dados de crianças e adolescentes cadastrados pelas agências, como passageiros menores (LGPD, art. 14)</Fill>
      </p>

      <h2>12. Alterações</h2>
      <p>
        Podemos atualizar esta política. A data da última atualização fica no topo. Quando as categorias de cookies ou as ferramentas mudarem, o
        aviso de cookies aparece de novo para você escolher.
      </p>
    </>
  );
}

# Privacidade, cookies e LGPD

Como o aviso de cookies funciona, o que o app guarda no navegador e o que ainda depende do responsável.

## Como funciona o consentimento

- `src/domain/consent.ts`: categorias (necessários, analíticos, marketing), versão do aviso (`CONSENT_VERSION`), formato do cookie `mx_consent` (`<versão>.<analíticos><marketing>.<segundos>`) e a regra `allows()`. Sem escolha, só os necessários valem.
- `src/components/consent/consent.tsx` (`ConsentProvider`, no layout raiz): aviso na primeira visita com "Rejeitar não essenciais", "Personalizar" e "Aceitar todos", todos com o mesmo peso visual; central de preferências com as categorias opcionais desligadas por padrão. Fechar a central ou continuar navegando não conta como aceite. O aviso não aparece dentro da prévia do editor (iframe).
- Qualquer elemento com `data-cookie-preferences` reabre a central (`src/components/consent/link.tsx`). Está no rodapé do site público, das páginas das agências (`/p/...` e `/s/...`) e em Configurações › Preferências.
- `POST /api/consent` grava a escolha no cookie (HttpOnly, 12 meses) e, para quem está logado, na conta (`UserPreference.cookieConsent`). `POST /api/consent/sync` junta a escolha do navegador com a da conta (vale a mais recente), uma vez por sessão do navegador. Assim a escolha vale em todos os aparelhos da pessoa. Sem login nada além da escolha é guardado no servidor.
- Mudou ferramenta, categoria ou texto do aviso? Troque `CONSENT_VERSION`: todo mundo escolhe de novo.

## Carregamento central de scripts

`src/components/consent/registry.ts` é o único lugar para scripts de terceiros e para o que o app guarda no navegador por categoria:

- `THIRD_PARTY_SCRIPTS`: cada ferramenta com categoria, fornecedor e finalidade. `loadThirdParty(id)` só carrega se a categoria estiver permitida; `autoload: true` carrega sozinha em todas as páginas depois do aceite. A central de preferências lista as ferramentas de cada categoria.
- `FIRST_PARTY_STORAGE`: chaves de `sessionStorage`/`localStorage` de cada categoria opcional, apagadas quando a categoria não está permitida.
- Retirar o consentimento de uma categoria cujo script já rodou recarrega a página (não há outro jeito de parar um script carregado).

Para instalar, por exemplo, um pixel de anúncios: cadastre em `THIRD_PARTY_SCRIPTS` com `category: "marketing"`, troque `CONSENT_VERSION`, atualize a Política (seção 7) e nunca coloque o `<script>` direto numa página.

## Inventário (13/11/2026)

| Item | Onde | Categoria | Tratamento |
| --- | --- | --- | --- |
| `mm_session` (cookie) | login | Necessário | Mantido. HttpOnly, 30 dias. |
| `mm_theme` (cookie) | tema claro/escuro | Necessário | Mantido. 1 ano. |
| `mm_holder` (cookie) | seletor de titular, área logada | Necessário | Mantido. HttpOnly, 1 ano. |
| `mm_google` (cookie) | state do login com Google | Necessário | Mantido. 10 min, só em `/api/auth/google`. |
| `mm_meta` (cookie) | state da conexão com o Meta (Tráfego) | Necessário | Mantido. 10 min, só em `/api/traffic/meta`. |
| `mx_consent` (cookie, novo) | escolha de cookies | Necessário | Novo. HttpOnly, 12 meses. |
| `localStorage` `mm_sidebar`, `mm:cards-view`, `mm:tasks-view`, colunas de vendas, cartões fixados, buscador, calendário, alertas do chat | área logada | Necessário (preferência de tela pedida pela pessoa) | Mantidos. Só no navegador. |
| `sessionStorage` `mx_utm` | páginas das agências | Marketing | Agora só com consentimento de marketing; sem ele, a origem do anúncio não é guardada nem enviada com o pedido. Apagado ao retirar o consentimento. |
| `sessionStorage` `mx_consent_sync` (novo) | sincronização da escolha | Necessário | Novo. |
| Cloudflare Turnstile | cadastro e pedidos de privacidade | Necessário (segurança) | Passa a carregar pelo registro central. Só nessas páginas. |
| Login com Google | `/login`, `/register` | Necessário (a pessoa escolhe) | Sem mudança. Redirecionamento, sem script do Google nas páginas. |
| Mercado Pago | assinatura | Necessário (a pessoa escolhe) | Sem mudança. Redirecionamento ao checkout do MP, sem script nas páginas. |
| Meta Marketing API | área Tráfego | — (servidor) | Sem mudança. Só leitura de métricas pelo servidor; nenhum pixel é carregado nas páginas. |
| Web Push | Configurações › Notificações | — (permissão do navegador) | Sem mudança. Só depois de "Ativar neste aparelho". |
| Telegram | chat de balcões | — (servidor) | Sem mudança. Integração do servidor, nada no navegador. |
| Anthropic (assistente de IA) | assistente | — (servidor) | Sem mudança. Listado na Política. |
| YouTube/Vimeo | vídeos dos guias | Conteúdo de terceiro | Agora só carrega ao tocar para assistir; Vimeo com `dnt=1`. |
| Fontes e mapas | todo o app | — | Servidos pelo próprio app (sem Google Fonts nem tiles externos). |

Não há analytics nem pixels de terceiros instalados. A preferência "Análise de uso" (`UserPreference.usageAnalytics`) é guardada, mas nenhum código a usa hoje.

## Pedidos de titulares

`/privacidade/solicitacao` → `POST /api/public/privacy-requests` → tabela `PrivacyRequest` e e-mail para `CONTACT_EMAIL` (se configurado). Os dados vão no corpo da requisição, nunca no endereço. O log registra só protocolo e tipo. O IP fica só como hash, para limitar 5 pedidos por hora. Turnstile e campo armadilha contra robôs. Ainda não há tela no admin para acompanhar os pedidos: por enquanto, use o e-mail ou consulte a tabela.

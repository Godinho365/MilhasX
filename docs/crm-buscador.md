# CRM de pedidos e Buscador de passagens

Feitos a partir do Quero Milhas (telas lidas na conta do próprio usuário em 26/10/2026, só leitura).

## CRM (`/app/crm`)

- **Kanban** com as 7 etapas: Novos pedidos → Pesquisa e Cotação → Cotação enviada → Negociação e
  emissão → Emitido → Viagem em curso → Viagem concluída. Arraste o cartão entre colunas ou mude a
  etapa no detalhe.
- **Novo pedido** (botão flutuante): cliente cadastrado ou novo contato (nome, WhatsApp, e-mail),
  tipo de viagem (somente ida, ida e volta, múltiplos trechos), classe, origem/destino com inversão,
  datas, passageiros (adulto, criança, bebê), datas flexíveis, bagagem, prioridade, orçamento e
  observações. Cada pedido recebe um número sequencial.
- **Detalhe**: etapas clicáveis, dados da viagem, cotações anotadas, documentos (PNG/JPEG/WEBP/HEIC/PDF,
  até 10 de 10 MB, marcados como internos ou visíveis ao cliente), mensagens prontas de WhatsApp
  (`{nome}` e `{rota}` são trocados), histórico, “Buscar passagens”, arquivar com motivo e excluir.
- **Lista**: ativos e arquivados.
- **Dashboard** (7/30/90 dias, 12 meses, tudo): pedidos, valor orçado e médio, clientes, prioridade
  alta, arquivados; captação (visitas, pedidos, conversão); destinos, origens, meses e classes mais
  pedidos; comportamento (passageiros, formato, datas flexíveis, bagagem); pipeline; alertas de pedidos
  parados há mais de 2 dias; motivos de arquivamento.

### Sua MilhasX (Central de Atendimento) e captação

Como a página da agência na simbora.la do Quero Milhas: a página pública `/p/<nome>` é a **Central de
Atendimento** da agência, com a marca **MilhasX** no topo (troque com `PUBLIC_BRAND` no `.env`), o nome,
uma frase de abertura (padrão “Sua viagem começa aqui”) e três cartões:

- **Pedir cotação de viagem** → pedido em CRM › Novos pedidos;
- **Interesse em gestão de milhas** → contato em CRM › Lista › “Interessados em gestão de milhas”, com
  situação (novo, em contato, virou cliente, descartado) e botão de WhatsApp;
- **Falar no WhatsApp**.

O menu lateral **“Sua MilhasX”** abre o **editor em página própria** (`/editor`, fora do menu do app),
como o editor da simbora.la. Em Configurações › Sua MilhasX ficam só a **ativação** da página e o
**endereço**, com um botão “Personalizar página”.

**Barra “Personalizar:”** com 7 abas:
- **Página Principal (Bio)**: Cor de Fundo, Introdução, Banner no topo, Botões e Outros contatos.
  - **Botões**: mudar texto, descrição e ordem, e incluir até 6 links próprios (só `http`/`https`).
  - **Prévia do link ao compartilhar**: dados de Open Graph.
- **Captação de Viagens** e **Interesse em Gestão**: liga/desliga, título, apresentação, botão de envio e
  mensagem de confirmação.
- **Cotação**: página `/p/<nome>/cotacao/<token>` com as opções anotadas no pedido (valor em R$, sem
  milhas nem anotações internas) e o botão de aprovar pelo WhatsApp.
- **Reserva Confirmada**: página `/p/<nome>/reserva/<token>` com localizador, trechos, recado e documentos
  marcados como visíveis.
  - O link das duas páginas sai do CRM: pedido › “Para o cliente” › Copiar link.
  - É um token aleatório por pedido.
- **Gestão de Milhas**: a página de saldos do titular (`/h`), agora com o visual da página.
- **Assinatura de Contrato**: página `/p/<nome>/contrato`, onde o cliente lê os termos e aceita.
  - Cada assinatura guarda uma cópia dos termos aceitos.
  - As assinaturas aparecem na aba “Assinaturas recebidas”, e o dono recebe uma notificação.

**Prévia ao vivo** à esquerda, numa moldura de navegador com o endereço:
- Vem de um iframe de `/preview/central` (só para o dono logado), que recebe o rascunho por `postMessage` da
  mesma origem.
- Três tamanhos: computador (1280px), tablet (768px) e celular (390px).
- As páginas de cotação, reserva e saldo aparecem com dados de exemplo.

**Recursos PRO**: Cor de Fundo, Banner e Prévia do link são do plano PRO (`pageBranding`).
- Ao voltar para o Pessoal, as páginas voltam ao visual padrão.
- Fundo claro troca o texto para escuro (`themeForBg`).

**Onde fica salvo**:
- A personalização fica em `SalesProfile.design`, normalizada por `resolveDesign` em
  `src/domain/page-design.ts`.
- O banner fica em `SalesProfile.banner` e é servido por `/api/public/banner/<nome>`.

### Captação pela página pública

Com a página pública publicada (Configurações › Sua MilhasX) e “Receber pedidos de cotação” ligado,
`/p/<nome>` mostra o formulário **Pedir cotação**. O pedido cai em “Novos pedidos” e o dono recebe uma
notificação. Proteções: só página publicada e ativa, contato obrigatório, campo-armadilha para robôs e
no máximo 5 pedidos por hora por IP. As visitas da página contam para a conversão no dashboard.

## Buscador (`/app/buscador`)

Preenche uma vez e **abre o site de cada programa já com a busca feita** — uma aba por programa, com 2
segundos entre elas (como no Quero Milhas). O Milheiro **não lê** esses sites: quem pesquisa é o usuário,
no próprio navegador. Por isso funciona mesmo com Smiles, LATAM e Azul, que bloqueiam robôs.

- Milhas, nacionais: Smiles, LATAM Pass, Azul Fidelidade.
- Milhas, internacionais: Azul pelo Mundo, Iberia Plus, AAdvantage, ConnectMiles, MileagePlus, Aeroplan,
  Miles & More, Qatar Privilege Club, Virgin Atlantic Flying Club.
- Busca manual (o site não aceita a busca pelo endereço; abre a página de resgate): British Airways
  Club, Flying Blue, TAP Miles&Go, LifeMiles, Qantas.
- Em dinheiro: LATAM, Gol, Decolar, Skyscanner.

Os endereços ficam em `src/domain/flight-search.ts`. Se uma companhia mudar o formato do site, basta
ajustar a função daquele programa.

- **Preencher a partir de um pedido** do CRM.
- **Histórico**: as 30 últimas pesquisas; clicar repete a busca.
- **Comparar cotações**: anote milhas, taxas e valor em dinheiro do que encontrou em cada programa; a
  lista mostra a menor primeiro e, se a busca veio de um pedido, a cotação aparece no pedido.

## Tradutor de milhas (`/app/tradutor`)

Responde “quantas milhas este trecho costuma custar em cada programa, conforme a antecedência”, como o do
Quero Milhas — mas a partir das **cotações que você anotou** no Buscador (“Comparar cotações”), não de uma
base de terceiros.

- Escolha origem, destino, ida e volta ou só ida, e a classe; ou clique num dos “Trechos com cotações”.
- Para cada programa: milhas **típicas** (mediana) por adulto, faixa (mínimo e máximo), taxas típicas,
  quantas cotações e a data da última, e o valor em reais das milhas pelo preço de mercado do milheiro
  (quando o programa está cadastrado). O mais barato vem primeiro.
- **Antecedência**: as mesmas medidas separadas em até 7 dias, 8–30, 31–60, 61–120 e mais de 120 dias
  entre o dia em que a cotação foi anotada e o voo.

Quanto mais cotações você e sua equipe anotarem, mais confiável fica a análise.

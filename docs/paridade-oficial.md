# Paridade com o app de referência — auditoria de 24/10/2026, atualizada em 25/10/2026

Comparação tela por tela entre o app de referência (conta de cliente, plano de teste "Gestor") e o
MilhasX local. A referência foi só lida: nenhum dado foi salvo lá. Durante a varredura ela passou a
responder **429 (muitas requisições)**, então as páginas foram visitadas com pausas, e algumas
telas foram lidas pelo texto, sem captura.

Legenda: ✅ igual · 🟡 parcial (estrutura igual, faltam detalhes) · ❌ falta · ➕ só no MilhasX

## Resumo (atualizado em 25/10/2026)

| Área | Situação | Observações |
|---|---|---|
| Painel – Visão Geral | ✅ | No celular, abas “Visão Geral / Evolução / Recentes” como na referência |
| Painel – Gestão e Vendas | ✅ | — |
| Novo lançamento (Crédito, Débito, Transferência, Lote) | ✅ | Tipos de custo marcados como hipótese em `docs/novo-lancamento.md` |
| Extrato | ✅ | Filtros “Somente desatualizados” e “Excluir ignorados” e ação “Ignorar nos relatórios”. **Interpretação nossa** (a referência não mostrou o significado): *desatualizado* = pontos a receber cuja data já passou; *ignorado* = fica fora dos relatórios, mas continua no saldo |
| Relatórios | ✅ | As 7 abas conferidas uma a uma na referência (25/10/2026) e refeitas com os mesmos indicadores e seções — ver “Relatórios aba por aba” abaixo |
| Compras › Lojas | ✅ | Coletor como o da referência (oferta atual com Clube e promoção, histórico diário com máximo do dia, leitura agendada). Esfera automática; Livelo pela página salva pelo admin, porque o site bloqueia robôs; LATAM, Azul e Smiles por planilha — ver `docs/catalogo-lojas.md` |
| Compras › Compras | ✅ | Lista / Kanban com Aguardando entrega → Aguardando pontos → Pontos recebidos, custos, tags, previsão e comprovantes |
| Compras › Alertas | ✅ | “Monitore as melhores promoções” com sugestões “Ative em um clique” |
| Promoções | ✅ | Abas Ofertas / Alertas, ordenação “Encerrando primeiro / Mais recentes / Maior bônus”, filtro por categoria e programa, cards com categoria e “Termina em N dias”, seção “Encerradas”. Diferença: a promoção tem um programa de origem e um de destino (a referência mostra vários, “+11”) |
| Cartões de Crédito | ✅ | Abas Resumo / Faturas / Cartões, indicadores clicáveis, “Próximo passo” |
| Simuladores | ✅ | Os 8 da referência, mesmas rotas, “Recentes” |
| Vendas | ✅ | Venda de emissão completa (ver histórico do documento) |
| Fornecedores | ✅ | CPFs, Média de utilização, Disponível, Tags, “Saldo atual” com atalhos |
| Programas | ✅ | Nome da conta, CPFs, Atualizado, Fixar na barra lateral, Arquivar, “Mostrar contas arquivadas”, Tags |
| Página da conta | ✅ | — |
| Titulares | ✅ | Cadastro completo e **página do titular**: “Enviar acesso ao titular” manda ao e-mail autorizado um link de uso único (24 h) que abre uma página só de leitura com saldos e últimas movimentações, sem custos; trocar o e-mail ou “Revogar acessos” encerra o acesso. Sem provedor de e-mail, a mensagem vai para `.outbox/` |
| Seletor de titular | ✅ | Inclui “Gerenciar titulares” |
| Barra lateral | ✅ | Ícones de 21 programas (marcas dos próprios programas, usadas só para identificá-los) em `prisma/program-logos`, normalizados para PNG 128×128; o seed aplica pelo nome e `npm run db:logos` reaplica. Logo enviado pelo admin não é sobrescrito |
| Guias | ✅ | — |
| Menu do usuário | ✅ | Selo do plano e atalho “Valores: Visível / Parcial / Oculto” |
| Configurações | ✅ | Abas Geral / Perfil / Assinatura / Indicações / Perfil Público. Geral: efeitos sonoros, análise de uso, ocultar tutoriais, visibilidade dos valores, aparência, notificações por tipo (e-mail / push) e senha. Perfil: nome, foto e pedido de exclusão (LGPD). O conteúdo do Perfil Público foi **desenhado aqui** (a aba da referência não carregou): bio, nome, endereço `/p/<nome>`, programas, WhatsApp, Instagram, e-mail e publicar |
| Cabeçalho | ✅ | Botão “Tutorial” por página (abre o guia ligado à página; some com “Ocultar tutoriais”), botão “IA”, aviso do teste com “Assinar” |
| Assistente IA | 🟡 | Pronto, mas só funciona com `ANTHROPIC_API_KEY` no `.env` (sem a chave, a janela avisa que não está configurado). Limite de 30 perguntas por dia. **Não testado com a API real** (não há chave neste ambiente) |
| Assinatura / Indicações | ✅ | Planos Pessoal / PRO / Gestor, mensal ou anual (−16%), teste do Gestor (15 dias, 30 com indicação), link de indicação. **Pagamento pelo Mercado Pago** (assinatura recorrente; o plano só muda depois de o servidor consultar a assinatura na API; webhook com assinatura verificada; cancelar na aba Assinatura). **Limites por plano**: Pessoal 1 titular, 5 contas, 3 alertas de loja; PRO 2 titulares; fornecedores e página do titular só no Gestor. Sem `MP_ACCESS_TOKEN`, volta ao pedido com ativação pelo admin. **Testado com o Mercado Pago simulado; falta testar com credenciais de teste reais** |

**Contagem:** 24 ✅ · 1 🟡 · 0 ❌ (de 25 áreas). O 🟡 restante é o Assistente IA, que depende de uma chave.

## Relatórios aba por aba (conferido na referência em 25/10/2026)

| Aba | Indicadores | Seções |
|---|---|---|
| Visão Geral | — | Acúmulo por categoria · Pontos por programa |
| Compras | Pontos acumulados · Custo extra · CPM médio (“Orgânico” sem custo) · Compras (N parceiros) | Pontos por parceiro · Pontos por programa · Pontos por status de compra · Origem dos pontos de compra · Custo extra por categoria · Multiplicador médio por parceiro |
| Cartões | Pontos recebidos · Total em faturas (N faturas, N pendentes) · Anuidade · Pontos por real | Faturas por status · Pontos por programa · Top cartões (com total) · Pontos previstos vs recebidos · Anuidade ao longo do tempo |
| Economia | Total economizado (N resgates considerados) | Economia por programa · Economia por categoria · Detalhamento por resgate |
| Evolução | Δ Saldo · Créditos · Débitos | Evolução do Saldo (por conta) · Créditos vs Débitos · Evolução do CPM (por conta) · Créditos por Categoria · Débitos por Categoria |
| Vendas | Receita · Lucro · Margem · Pontos vendidos (N vendas) | Vendas por programa · Receita por programa · Lucro por programa · Top beneficiários · Evolução de vendas |
| Bens e Direitos | — (só filtro de programa) | Posição em 31/12 de cada ano e posição atual: Saldo, CPM e Custo de Aquisição por conta, com total e aviso para conferir com o contador |

Diferenças que ficaram, de propósito:
- **Evolução do CPM**: a referência diz usar **FIFO**; o MilhasX usa **custo médio ponderado** (ver “Decisão de regra pendente”).
- **Top beneficiários**: a referência não mostrou dados; no MilhasX são os clientes da venda (a receita é dividida entre eles).
- **Origem dos pontos de compra**: “acompanhamento” são as compras da aba Compras; “lançamento direto” são os créditos “Compra em parceiro” lançados no extrato.

## Decisão de regra pendente

O guia da referência “Entendendo o CPM” cita **FIFO** (os pontos mais antigos saem primeiro). O
MilhasX usa **custo médio ponderado**. Nos valores conferidos até aqui (transferências, CPM por conta)
os números batem com a referência, mas se a referência for FIFO puro, débitos e vendas podem
divergir em carteiras com compras a preços diferentes. Antes de mudar, é preciso confirmar com um
caso real na referência (uma conta com duas compras a CPMs diferentes e um débito parcial).

## O que o MilhasX tem a mais

Exportar CSV no extrato e em cada relatório, relatório Bens e Direitos com custo em 31/12,
economia por resgate, sino de notificações, credenciais de acesso criptografadas na página da conta,
painel administrativo com auditoria.

## O que falta

1. **Assistente IA**: testar com uma chave real.
2. **Assinatura**: testar o checkout com credenciais de TESTE do Mercado Pago e cadastrar o webhook.
3. **Push no celular** e **e-mail real**: hoje as preferências ficam guardadas e o e-mail vai para `.outbox/`.

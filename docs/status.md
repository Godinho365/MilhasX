# Status das funcionalidades

Verificação: **123 testes de API/domínio** (`npm test`) e **31 testes de ponta a ponta** pela
interface (`npm run test:e2e`, build de produção, desktop/tablet/celular), todos passando, três rodadas
seguidas, em 25/10/2026 (após assinatura pelo Mercado Pago e limites por plano).

## Implementado e verificado

| Área | Como foi verificado |
|---|---|
| Cadastro, login, logout, troca de senha, recuperação de senha por link | API + E2E |
| Limite de tentativas de login; senha só como hash; token de redefinição de uso único | API |
| Botões de autenticação só habilitam após carregar (sem envio nativo com senha na URL) | E2E |
| Titulares e contas por programa (cria, impede duplicada, exclui) | API + E2E |
| Novo lançamento: menu Crédito / Débito / Transferência / Lote, atalhos +100/+1k/+10k, chips de recentes, prévia de saldo e CPM | E2E |
| Categorias de crédito e débito iguais às da referência | E2E |
| Transferência bonificada levando o custo da origem (números batem com a referência) | domínio + API + E2E |
| Lote "tudo ou nada" e sem duplicar com a mesma chave | API + E2E |
| Crédito com custos detalhados (Tipo / Valor / Cartão, tipos por categoria, total), loja parceira, cartão só do próprio usuário | API + E2E |
| Clube com "Repetir automaticamente": mensal/semanal/diário/anual, dia do mês, intervalo, data de término, pular finais de semana | API + E2E |
| Débito com custos do resgate e "Mais informações" (referência em dinheiro, passageiros, reserva, origem/destino, datas) e valor obtido por milheiro | API |
| Transferência avançada: paridade, taxas, compra de pontos no carrinho (com prioridade), previsão de entrega (fica a receber e confirma o grupo) | API + E2E |
| Lote em dois passos (programa, depois registros Operação / Tipo / Pontos / Custo / Data / Descrição) | E2E |
| Fechar formulário preenchido pede "Descartar alterações?" | E2E |
| Painel Visão Geral como a referência: 4 indicadores com detalhamento (⇕) por titular e programa, Evolução do Saldo, Créditos vs Débitos por mês, Lançamentos Recentes e Compras Pendentes | E2E |
| Barra lateral “Programas”: atalhos das contas (titular × programa) levando à página da conta, seguindo o titular escolhido | E2E |
| Imagem do programa enviada pelo admin (PNG/JPG/WebP validados pelo conteúdo, auditado); monograma colorido quando não há imagem | API + navegador |
| Seletor de titular com avatar do escolhido; painel, extrato e relatórios mostram e respeitam o titular | E2E |
| Extrato: painel “Filtros e busca” (operação, programa, cartão, tipo, datas, faixas de pontos e custo, a receber), chips “Filtros ativos” com Limpar tudo, Ver detalhes, Editar com custos detalhados, Duplicar | API + E2E |
| Relatórios com submenu (Visão Geral, Compras, Cartões, Economia, Evolução, Vendas, Bens e Direitos), períodos 3M/6M/12M/ano/Tudo/Personalizado, filtro de programa, Exportar CSV e Limpar | E2E |
| Titulares: nascimento, e-mail autorizado, documentos, endereço em campos, atributos, anexos, observações, desativar; “Novo titular” no botão flutuante; “Gerenciar titulares” no seletor | API + E2E |
| Vendas de emissão: itens, origem dos pontos (conta ou fornecedor), custos repassados, clientes (cliente final / agência), viagem, anexos; vendas antigas convertidas mantendo o resultado | API + E2E |
| Simuladores: os 8 da referência com menu lateral, “Simular” e Recentes salvos | domínio + API + E2E |
| Compras em Lista / Kanban (Aguardando entrega → Aguardando pontos → Recebidos), comprovantes; lojas com ordenação e filtros; alertas “Ative em um clique” | API + E2E |
| Cartões em abas Resumo / Faturas / Cartões com indicadores clicáveis | E2E |
| Programas: nome da conta, fixar na barra lateral, arquivar, tags, CPFs; Fornecedores: tags, média de utilização, disponível | API + E2E |
| Configurações em abas: preferências (som, análise, tutoriais, valores Visível/Parcial/Oculto, tema), notificações por tipo, perfil e pedido de exclusão | API + E2E |
| Assinatura: pagamento recorrente pelo Mercado Pago (checkout, webhook verificado, cancelamento) ou, sem token, pedido com ativação pelo admin; teste do Gestor; link de indicação | API (Mercado Pago simulado) + E2E (modo sem token) |
| Coletor de lojas como a referência: Esfera automática (agendável de hora em hora), Livelo pela página salva no navegador, planilha e manual; Clube, promoção (“Era N”), link do parceiro e histórico diário com máximo do dia | API (amostras reais + rede simulada) + coleta real da Esfera em 25/10/2026 |
| CRM de pedidos (Kanban de 7 etapas, lista, dashboard, documentos, WhatsApp, arquivar) e captação pela página pública — ver `docs/crm-buscador.md` | API + E2E |
| Buscador de passagens: abre o site de cada programa já com a busca (21 sites), histórico e comparador de cotações | API (endereços) + E2E |
| Sua MilhasX: página pública da agência como Central de Atendimento (cotação, interesse em gestão de milhas, WhatsApp), interessados no CRM | API + E2E |
| Sua MilhasX › editor (/editor) e páginas do cliente no layout da simbora.la: Bio, captação em etapas, interesse em gestão, cotação e reserva por pedido (acesso pelos 4 últimos dígitos), painel de milhas do titular, termo de compra e venda assinado online | API + E2E |
| Tradutor de milhas: milhas típicas por programa e por antecedência, a partir das cotações anotadas | API + E2E |
| Limites por plano: Pessoal 1 titular / 5 contas / 3 alertas de loja, PRO 2 titulares, fornecedores e página do titular só no Gestor | API |
| Perfil público de vendas (`/p/<nome>`), só quando publicado | API + E2E |
| Página do titular: link de uso único por e-mail, sessão só de leitura sem custos, revogação | API |
| Extrato: “Ignorar nos relatórios”, filtros “Somente desatualizados” e “Excluir ignorados” | API |
| Promoções: ordenação, categoria, programa, seção “Encerradas” | E2E |
| Cabeçalho: botão Tutorial por página, Assistente IA (desativado sem `ANTHROPIC_API_KEY`; não testado com a API real), aviso do teste | só verificação de tipos (sem teste automático) |
| Painel no celular em abas Visão Geral / Evolução / Recentes | E2E |
| Vigia de navegação: clique ou busca cuja navegação o Next aborta é repetida (medido: 4/25 perdidas antes, 0/40 depois) | medição + E2E |
| Extrato: filtros, busca, ordenação, paginação, edição, seleção e exclusão em lote (com as pernas de transferência), exportação CSV, lista no celular | API + E2E |
| Pontos a receber e "marcar recebido" | API + E2E |
| Custo médio ponderado; custo, valor estimado e valor recebido separados | domínio + API |
| Vendas com taxas, líquido e lucro sobre o custo; clientes | API + E2E |
| Idempotência e operações concorrentes sem saldo negativo | API |
| Separação de dados entre usuários (inclusive lote e exclusão em lote) | API |
| Lojas com favoritos; alertas de oferta e de saldo mínimo → notificações | API + E2E |
| Simuladores (compra bonificada, transferência bonificada) | domínio + E2E |
| Relatórios por período, categoria e programa (sem contar transferência como acúmulo) | API + E2E |
| Painel: totais, tabela de titulares ordenável e expansível, evolução por titular (saldo/custo) | E2E |
| Seletor global de titular igual ao da referência: Visualizar (Todos os titulares / Minhas contas) e Titulares com avatar; “Sou eu” marcado em Programas › Titulares | API + E2E |
| Preferências (ocultar valores, checklist) | E2E |
| Painel em três modos: Visão Geral, Vendas (faturamento, lucro, margem, preço médio, gráfico mensal, principais clientes) e Gestão; seletor em menu no desktop e painel inferior no celular | API + E2E |
| Menu igual ao da referência: Compras, Promoções, Cartões de Crédito, Simuladores, Vendas, Fornecedores, Programas, Guias, Novidades, Fale com o suporte, usuário com foto | E2E |
| Barra inferior no celular (Painel, Compras, Extrato, Mais) com o botão “+” acima dela | E2E |
| Promoções: ofertas ativas com prazo, histórico, busca e alertas por programa e bônus mínimo → notificação | API + E2E |
| Cartões de crédito: cadastro, faturas, pontos estimados pela cotação, “fechar fatura” gera pontos a receber, totais (esperados, em aberto, recebidos, ação necessária) | API + E2E |
| Fornecedores: cadastro, contas por programa (identificação, saldo, preço combinado), filtros; nunca guarda senhas | API + E2E |
| Guias (tutoriais e guias com nível, duração e tags; vídeo do YouTube/Vimeo opcional) e Novidades com contador de não lidas | API + E2E |
| Página da conta (Programas › conta): saldo, CPM, a receber, valor em reais; lançamentos recentes (“Orgânico” quando sem custo); compras pendentes; lançamentos recorrentes; credenciais | API + E2E |
| Lançamentos recorrentes (clubes): mensal/trimestral/anual, gerados sozinhos no vencimento sem duplicar (inclusive com acessos simultâneos), aviso opcional, pausar/retomar | API + E2E |
| Compras bonificadas (aba Compras): registrar, pontos esperados, receber (lança o crédito com o custo extra), cancelar | API + E2E |
| Credenciais de acesso: AES-256-GCM com CREDENTIALS_KEY, ver exige a senha do usuário, 5 tentativas erradas bloqueiam por 15 min, cada visualização auditada | API + E2E |
| Tema claro, escuro ou do sistema, salvo em cookie (abre sem piscar) | E2E |
| Foto de perfil: reduzida para 256px no navegador (sem metadados), tipo validado pelo conteúdo, limite de 512 KB | API + E2E |
| Admin: indicadores, usuários (ativar/desativar), programas (cor, valor estimado), ofertas, promoções, guias, novidades, auditoria, parâmetros, CSV; cliente comum bloqueado | API + E2E |
| Primeiro admin só pelo script do operador | API |
| CSRF por origem, cabeçalhos de segurança, validação no servidor | API |
| Responsivo sem rolagem lateral em 375, 768 e 1280px (todas as páginas do app e do admin) | E2E |
| Backup e restauração | Executado localmente (contagem igual antes e depois) |
| Build de produção | Executado (o E2E roda sobre ele) |

## Implementado, não verificado de ponta a ponta

- Imagem Docker do app: o `docker build` falhou nesta máquina por rede/proxy do Docker Desktop ao baixar `node:22-alpine`

## Pendente / fora do escopo

- Envio real de e-mail (hoje vai para `.outbox/`)
- Assistente de IA (precisa de uma chave de API de um provedor de IA)
- Planos e assinatura (precisa de um provedor de pagamento)
- Promoções reais: o app tem a estrutura e o cadastro no admin, mas as promoções precisam ser cadastradas (as do seed são fictícias)
- Catálogo real de lojas e ofertas (o seed tem lojas fictícias; os dados da referência não foram copiados)
- Logos de lojas (programas: o admin envia a imagem em Admin › Programas; não copiamos as da referência)
- Conteúdo exato das abas de Relatórios além da Visão Geral: a referência não carregou os gráficos nesta máquina; as abas foram montadas com os dados do app e podem ser ajustadas com prints
- Titular: “página do titular” (acesso por e-mail autorizado) e anexos de documentos
- Extrato: “Somente desatualizados” e “Excluir ignorados” (conceitos que o app ainda não tem)

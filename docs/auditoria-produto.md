# Auditoria do produto (referência funcional)

Auditoria feita em 23/10/2026 navegando pelo app de referência com uma conta de **cliente**
(papel `user`, sem admin, plano de teste "Gestor"). Só foram lidos textos visíveis das telas.
Nenhum código-fonte, bundle, logo ou dado de terceiros foi copiado. Os dados pessoais vistos
não foram reproduzidos; o seed usa dados sintéticos.

Legenda de estado: **C** = confirmado, **P** = parcialmente observado, **H** = hipótese.

## Navegação observada (C)

Barra lateral agrupada:

- **Análise:** Painel (`/app`), Relatórios (`/app/reports/overview`), Extrato (`/app/entries`)
- **Ganhar pontos:** Compras (`/app/purchases`, abas Lojas / Compras / Alertas), Promoções, Cartões de crédito
- **Ferramentas:** Simuladores (`/app/simulators/purchase/bonificada`), Vendas (abas Vendas / Clientes), Fornecedores (abas Contas / Fornecedores)
- **Programas** (`/app/programs`, visões "por titular" e "por programa"), Guias, Novidades (contador de não lidas), suporte por e-mail
- Seletor global "Trocar titular" (todos ou um titular)
- Banner de assinatura em teste ("Assinar agora")
- Botão flutuante "Novo lançamento"

## Funcionalidades

| Área | Comportamento observado | Regras identificadas | Estado |
|---|---|---|---|
| Painel – Carteira | Cards: Saldo total, Custo do milheiro, Pontos a receber, Valor em reais. Lista de titulares com nº de contas, pontos e valor em R$ | Valor em reais ≈ pontos × valor estimado por milheiro (≈ R$ 24,50 no exemplo, não é o custo) | C (valor de mercado é **H**) |
| Painel – Evolução | Aba "Evolução" ao lado de "Carteira" | Gráfico do saldo ao longo do tempo | P |
| Primeiros passos | Checklist de 5 itens (favoritar lojas, alerta, registrar compra, registrar lançamento, usar IA), recolhível | Progresso "x de 5" | C |
| Titulares e contas | Cada titular tem contas (programa + nome), com saldo e CPM próprios | Conta = programa × titular | C |
| Extrato | Tabela: Data, Programa, Descrição, Pontos (±), Custo, CPM, Ações. Filtro por tipo de operação, busca, ordenação, paginação de 20, seleção em lote | Débitos aparecem sem custo; créditos gratuitos ("Cartão", "Saldo inicial") sem custo | C |
| Tipos de lançamento | Saldo inicial, Compra de pontos, Pontos de clube, Cartão, Bônus de transferência (%), Transferência (entrada/saída), Outros créditos | Categorias usadas também no relatório "Acúmulo por categoria" | C |
| Transferência entre programas | Débito na origem + crédito no destino + crédito de bônus (%) | Custo transferido = pontos × CPM da origem; o bônus divide o mesmo custo, então o CPM no destino = custo / (pontos + bônus) | C (conferido com números do extrato) |
| Custo do milheiro | CPM = custo / pontos × 1000 | Média ponderada por conta | C |
| Compras (lojas) | Catálogo de lojas com melhor oferta de pontos/R$ (programa) e de cashback (portal), paginado (336 lojas) | Catálogo é dado externo | C (os dados das lojas **não** foram copiados) |
| Alertas | Criar alerta de pontuação em loja | Dispara quando a oferta ≥ limite | P/H |
| Vendas | Lista de vendas + clientes, "Registrar venda" | Venda debita pontos e registra o valor recebido | P/H |
| Simuladores | Compra bonificada: programa, pontos por real, valor da compra, custo extra | CPM = (valor + extra) / (valor × pts/R$) × 1000 | C (campos) / H (fórmula) |
| Relatórios | Período (3M…), filtro de programa; acúmulo por categoria; pontos por programa | Agregação de créditos | C |
| Fornecedores | Contas de fornecedores por programa | Cadastro simples | P |
| Promoções, Cartões, Guias, Assistente IA, Novidades | Existem no menu | Não auditados em detalhe | H (fora do escopo inicial) |
| Admin | Não acessível com conta de cliente | Implementado do zero a partir dos requisitos | H |

## Identidade visual

Tema escuro, sidebar fixa, cards arredondados, destaque azul. A reimplementação usa um visual
**próprio** no mesmo estilo (Tailwind, tema escuro, azul como destaque) e **não** usa o logo
nem a marca. O nome exibido vem de `APP_NAME`.

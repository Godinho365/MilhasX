# Comparativo de interface — referência × MilhasX

Análise crítica feita em 23/10/2026, comparando o app de referência (conta de cliente) com a
versão 1 do MilhasX, em desktop (800px de painel) e celular (375px).

## Onde a v1 estava pior

| # | Item | Referência | MilhasX v1 | Ação |
|---|---|---|---|---|
| 1 | Tipografia | Inter | Fonte do sistema | Inter auto-hospedada (`@fontsource-variable/inter`) |
| 2 | Paleta | Neutra quase preta (zinc), bordas cinza discretas | Azul-marinho | Tokens neutros; azul só como destaque |
| 3 | Cards | Raio 16px, padding 24px | Raio 12px, padding 16px | Igualar |
| 4 | Ícones | Ícones de linha consistentes | Emojis e caracteres Unicode | Ícones SVG (`lucide-react`) |
| 5 | Cabeçalho | Botão de recolher menu, breadcrumb "Painel › Extrato", seletores em pílula | Só o seletor de titular | Breadcrumb, recolher menu, seletores em pílula |
| 6 | Rodapé do menu | Lista de programas com avatares, ajuda, usuário com menu suspenso | Nome + "Sair" | Programas, notificações com contador, menu do usuário |
| 7 | Painel | Cards com totais, **tabela de titulares** (contas, saldo, CPM, valor) e gráfico de evolução **por titular** com seletor de métrica | Cards de titular soltos, gráfico de uma série | Tabela de titulares ordenável + gráfico multissérie |
| 8 | Extrato no desktop | Seleção por checkbox, ícone por tipo, ponto colorido por programa | Tabela simples | Checkbox + exclusão em lote, ícones, cores por programa |
| 9 | Extrato no celular | Vira **lista** (descrição, data • programa, pontos, menu "…") | Tabela com rolagem lateral | Lista no celular, tabela no desktop |
| 10 | Novo lançamento | Botão abre menu (Crédito, Débito, Transferência, Lote) sobre fundo desfocado; um formulário por tipo, em 2 colunas, com atalhos +100/+1k/+10k e chips de lançamentos recentes | Um único modal com abas | Menu + formulários por tipo, atalhos, recentes, **Lote** |
| 11 | Categorias de crédito | Compra de pontos, cartão, compra em parceiro, clube, voo, hotel, bônus, outros | 5 tipos | Incluir parceiro, voo, hotel, bônus |
| 12 | Abas de página | Grupo segmentado centralizado | Links soltos | Componente segmentado |
| 13 | Carregamento | Skeletons | Tela em branco até carregar | `loading.tsx` com skeletons |
| 14 | Botão flutuante no celular | Redondo, só o "+" | Pílula com texto cobrindo conteúdo | Redondo no celular |
| 15 | Confirmações | Diálogos do próprio app | `window.confirm` / `alert` do navegador | Diálogo de confirmação e toasts |
| 16 | Lojas | Card com logo redondo, estrela e dois blocos com ícone | Card simples | Igualar o layout (com monograma, já que não usamos logos de terceiros) |

## Situação na v2

Todos os 16 itens acima foram implementados e verificados pelos testes E2E (`npm run test:e2e`) em 375px, 768px e 1280px, com capturas em `e2e/screenshots/`.

## Onde a v2 vai além da referência

- Exclusão em lote **com resumo** do que será apagado (incluindo pernas de transferência)
- Linhas de "titular" expansíveis no painel, mostrando as contas de cada um
- Gráfico de evolução com alternância Saldo / Custo e linha em degrau (saldo muda por lançamento, não em curva)
- Botões de login e cadastro só habilitam após a página carregar (evita envio nativo com a senha na URL)
- Seletor de titular gravado no servidor (cookie HttpOnly, validado por usuário)
- Exportar o extrato filtrado em CSV
- Prévia do CPM resultante em todos os formulários de crédito e transferência
- Tudo acessível por teclado (Esc fecha, foco no primeiro campo, `aria-*` nos diálogos e abas)

## Fora do escopo (não auditado ou depende de serviços externos)

Assinatura/planos, assistente de IA, promoções, cartões de crédito, guias, novidades, fornecedores
e o seletor "Gestão" do cabeçalho.

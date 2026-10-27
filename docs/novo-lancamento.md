# Novo lançamento — especificação (mapeada da referência em 23/10/2026)

Legenda: **C** confirmado na referência · **H** hipótese (não foi possível ler com certeza).

## Crédito ("Novo crédito")

- Chips de lançamentos recentes no topo (C)
- Programa* (lista única "Programa Titular") · Categoria* · Pontos* com +100/+1k/+10k · Data* · Descrição (C)
- **Compra em parceiro**: campo extra "Loja parceira" (C)
- Seção recolhível **Custos — "Quanto você pagou por estes pontos"**: linhas Tipo | Valor | Cartão | limpar, "+ Adicionar custo", "Total: R$" (C)
  - Tipos por categoria:
    - Compra de pontos: Pontos, IOF, Outros (C)
    - Compra em parceiro: Outros, Frete, Markup, IOF (C)
    - Pontos de clube: Mensalidade, IOF, Outros (C)
    - Pontos de voo, Pontos de hotel, Outros créditos: Outros, IOF (C)
    - Pontos cartão de crédito: Anuidade, IOF, Outros (H)
    - Bônus de pontos: Outros, IOF (H)
  - Cartão: "Nenhum" ou um dos cartões cadastrados (C)
- **Pontos de clube**: interruptor "Repetir automaticamente" ("Lança este crédito a cada renovação do clube" / "Todo dia N de cada mês"); Frequência: Mensal, Semanal, Diário, Anual; "Opções avançadas": Dia do mês, Intervalo, Data de término, Pular finais de semana. O botão vira "Criar recorrência" (C)
- Fechar com dados preenchidos pede "Descartar alterações?" (C)

## Débito ("Novo débito")

- Programa* · Categoria* · Pontos* com atalhos · Data* (C)
- Seção **Custos — "Detalhe os custos deste resgate"** (Tipo | Valor | Cartão):
  - Emissão de passagem: Taxa de embarque (padrão), Completar pontos, Outros (Taxa de embarque C; demais H)
  - Aluguel de veículo, Reserva de hotel, Resgate de produto: Completar pontos, Outros (C)
  - Outros resgates: Completar pontos, Outros (H)
  - Expiração de pontos: sem custos nem detalhes (H)
- Seção **Mais informações** (C):
  - Emissão de passagem: Valor de referência em dinheiro, Número de passageiros, Número da reserva, Origem e Destino (aeroportos), Descrição, Data de ida, Data de volta
  - Aluguel de veículo: Valor de referência, Descrição, Número da reserva, Data de retirada, Data de devolução
  - Reserva de hotel: Valor de referência, Descrição, Número da reserva, Data de entrada, Data de saída
  - Resgate de produto / Outros resgates: Valor de referência, Descrição

## Transferência ("Nova transferência")

- De* · Para* · Pontos* (+100/+1k/+10k) · Bônus % (+10/+50) · Data* · Descrição (C)
- **Configurações avançadas — "Paridade, taxas e compra de pontos"** (C):
  - Paridade: pontos de origem : pontos no destino (padrão 1:1)
  - Taxas adicionais (R$)
  - "Compra de pontos no carrinho": Quantidade*, Preço da compra (R$)*, "Aplicar todos os pontos comprados na transferência"
  - "Previsão de entrega diferente": Data de entrega no destino*

## Lote

1. "Selecionar programa": lista de contas com saldo e CPM (ou "Orgânico") (C)
2. "Registros em lote para {conta}": linhas Operação (Crédito/Débito) | Tipo | Pontos | Custo | Data | Descrição, com linha de rascunho e "Criar registros" (C)

# Catálogo de lojas: o coletor

O MilhasX mantém o catálogo de lojas do mesmo jeito que a referência: um **coletor** lê a paridade de
cada parceiro nas fontes dos próprios programas e guarda

- a **oferta atual** de cada loja em cada programa: pontos por real (ou por dólar), “até”, pontos para
  quem é do **Clube**, **promoção** com o valor de antes (“Era N”) e a data de fim, link para a página do
  parceiro no programa e a hora da última leitura;
- o **histórico diário** (tabela `ParityDay`): o último valor lido no dia e o **máximo do dia**. O
  histórico fica mesmo que a loja saia do catálogo.

Na tela de Lojas, cada cartão mostra o melhor programa, o Clube e a promoção; “Ver programas e histórico”
abre todos os programas da loja e o gráfico dos últimos 30 dias.

## O que a referência faz (lido em 25/10/2026)

337 lojas, logos próprios, ligação a cada programa (Livelo 252, Esfera 156, Azul 25, LATAM Pass 11,
Smiles 2), leitura de hora em hora (todas às :45) por API ou por página, histórico por dia com o máximo
do dia, e 199 lojas ligadas ao Comparemania. Não dá para saber como o coletor deles lê os sites que
bloqueiam robôs (acordo com o programa ou acesso que não é bloqueado).

## Fontes do MilhasX

| Programa | Como entra | Por quê |
|---|---|---|
| **Esfera** | **Automática** (agendada) | `robots.txt` permite e a API da própria página responde a um robô identificado |
| **Livelo** | **Página salva**: o admin abre “Todos os parceiros” no navegador, salva (Ctrl+S) e envia | Site, API e imagens recusam robôs (HTTP 403). A página traz os ~265 parceiros com Clube e promoção |
| LATAM Pass, Azul, Smiles | Planilha (CSV) | Recusam robôs (403) ou não têm lista pública de acúmulo |
| Qualquer loja | Cadastro manual | Também para cashback de portais |

Não contornamos bloqueios (fingir ser um navegador, burlar proteção contra robôs). A leitura se
identifica como `MilhasXBot/1.0` e há intervalo mínimo de 10 minutos por fonte.

Cada leitura só mexe nas ofertas da **mesma fonte e programa**: cria as novas, atualiza as que mudaram
e remove as que saíram (o histórico fica). Ofertas manuais e de outras fontes não são tocadas. Se a
fonte falhar ou vier vazia, nada é apagado. Toda leitura fica na auditoria e reavalia os alertas.

## Agendar

- **Dentro do servidor**: `STORE_SYNC_MINUTES=60` no `.env` (mínimo 15) — relê as fontes automáticas
  de hora em hora, como a referência.
- **Ou pelo cron**: `npm run stores:import` (ex.: `45 * * * * cd /caminho/do/milheiro && npm run stores:import >> logs/lojas.log 2>&1`).
- **Pelo painel**: Administração › Lojas e ofertas › “Importar agora” / “Enviar página” / “Importar planilha”.

## Formato da planilha

```csv
loja;pontos_por_real;ate;por_dolar
Loja Exemplo;3;sim;não
Outra Loja;0,5;;
```

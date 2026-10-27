# Modelo de dados

Definido em `prisma/schema.prisma`. As migrações versionadas ficam em `prisma/migrations/`.

| Entidade | Papel | Pontos importantes |
|---|---|---|
| `User` | Usuário | `email` único; `passwordHash` (bcrypt, custo 12); `role` USER/ADMIN; `status` ACTIVE/DISABLED |
| `Session` | Sessão de login | `id` = SHA-256 do token; expira em 30 dias |
| `LoginAttempt` | Limite de tentativas | 5 falhas por e-mail ou 20 por IP em 15 min → 429 |
| `PasswordResetToken` | Redefinição | Só o hash do token; 1 h de validade; uso único |
| `Program` | Programa de fidelidade | `code` único; `kind` POINTS/MILES; `marketValueCpmCents` = valor **estimado** por milheiro |
| `Holder` | Titular | Pessoa dona das contas (`userId`, `name` único por usuário) |
| `Account` | Carteira | Titular × programa (único). `balance`, `costCents` e `investedCents` são **derivados** do extrato |
| `Entry` | Lançamento | `points` com sinal; `inputCostCents` (informado) e `costCents` (calculado); `status` CONFIRMED/PENDING; `groupId` liga as pernas de transferências e vendas; `idempotencyKey` |
| `Sale` / `Customer` | Vendas e clientes | Venda = débito `SALE` + registro com preço do milheiro, taxas e valor líquido |
| `Store` / `StoreOffer` / `FavoriteStore` | Lojas parceiras | Ofertas em pts/R$ (×100) e cashback (pontos-base), mantidas pelo admin |
| `Alert` / `Notification` | Alertas | `STORE_POINTS` (oferta ≥ limite) e `MIN_BALANCE` (saldo < limite); disparam uma vez até a condição voltar ao normal |
| `UserPreference` | Preferências | Mostrar valores em R$, ocultar checklist |
| `AuditLog` | Auditoria | Ações administrativas, cadastro, troca e redefinição de senha |
| `AppSetting` | Parâmetros | `registrationOpen`, `supportEmail`, `announcement` (lista fechada) |

## Regras do extrato (`src/domain/ledger.ts`)

- **CPM** = custo / pontos × 1000.
- **Crédito com custo** (compra, clube, outros): soma pontos e custo, e o custo médio é ponderado.
- **Crédito sem custo** (cartão, saldo inicial): soma só pontos, o que dilui o custo médio.
- **Débito** (saída de transferência, venda, expiração, ajuste): remove o custo proporcional
  (`custo × qtd / saldo`), mantendo o CPM. Débito maior que o saldo é recusado.
- **Transferência**: o custo removido da origem vai para o destino e é dividido entre a entrada
  e o bônus na proporção dos pontos. A última perna recebe o resto do arredondamento, então
  nenhum centavo se perde. Isso reproduz os números observados no app de referência
  (ex.: 20.000 pts a R$ 30,395 o milheiro + 25% de bônus → R$ 486,32 + R$ 121,58, CPM R$ 24,32).
- **Pendentes (a receber)** não entram no saldo nem no custo até serem confirmados.
- **Venda**: lucro = valor líquido recebido − custo de aquisição dos pontos vendidos.
- **Três valores diferentes**, nunca misturados: custo de aquisição (`costCents`), valor
  estimado de mercado (`marketValueCpmCents`) e valor recebido em vendas (`Sale.totalCents`).

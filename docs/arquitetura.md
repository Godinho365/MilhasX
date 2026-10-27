# Arquitetura

## Visão geral

Monólito Next.js (App Router) em TypeScript: as páginas e a API ficam no mesmo projeto, e o
PostgreSQL é acessado via Prisma. Não há serviços extras. Uma aplicação com esse volume de
dados não precisa de filas, cache distribuído nem microsserviços.

```
navegador ──HTTP──▶ Next.js
                     ├─ páginas (Server Components) ──▶ serviços ──▶ Prisma ──▶ PostgreSQL
                     └─ /api/* (route handlers)    ──▶ serviços ──┘
```

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Domínio | `src/domain/` | Regras puras: replay do extrato, custo médio, simuladores. Sem I/O. Testado isoladamente. |
| Serviços | `src/server/services/` | Casos de uso (extrato, carteiras, mercado, admin). Sempre recebem `userId` e filtram por ele. |
| HTTP | `src/server/http.ts`, `src/app/api/**` | Autenticação, CSRF, validação (zod), tradução de erros em JSON. |
| Autenticação | `src/server/auth.ts`, `src/server/session.ts` | Senhas (bcrypt), sessões no banco, limite de tentativas, redefinição de senha. |
| Interface | `src/app/(auth)`, `src/app/app`, `src/app/admin`, `src/components` | Páginas do cliente, do admin e componentes compartilhados. |

## Decisões

- **Extrato como fonte da verdade.** Saldos e custos das contas são derivados por *replay* de
  todos os lançamentos do usuário (`src/domain/ledger.ts`). Toda escrita roda numa transação
  com `pg_advisory_xact_lock` por usuário: grava, refaz o replay e, se algo ficar inconsistente
  (por exemplo, saldo negativo), desfaz tudo. Isso permite editar ou excluir lançamentos antigos
  sem corromper custos posteriores.
- **Idempotência.** Os formulários enviam uma `idempotencyKey` (UUID por abertura do
  formulário). Há uma restrição única `(userId, idempotencyKey)`, e reenvios devolvem a
  operação já gravada.
- **Dinheiro em centavos inteiros** e pontos inteiros. Não se usa ponto flutuante em valores
  persistidos.
- **Sessões no banco**: o cookie `mm_session` (HttpOnly, SameSite=Lax, Secure em produção)
  guarda um token aleatório; no banco fica só o hash SHA-256. Desativar um usuário apaga as
  sessões dele.
- **CSRF**: cookie SameSite=Lax mais a checagem de `Origin` em métodos de escrita.
- **E-mail**: sem provedor configurado, as mensagens vão para `.outbox/` (local, fora do git e
  dos logs). Em produção, troque a função `sendMail` em `src/server/mailer.ts`.
- **Visual e marca**: identidade própria (tema escuro, destaque azul) e nome configurável por
  `APP_NAME`. Não usa o logo nem os ativos do produto de referência.

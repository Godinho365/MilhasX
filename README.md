# MilhasX — gestão de milhas e pontos

Aplicação independente para controlar carteiras de pontos e milhas por titular: custo médio
do milheiro, extrato, transferências bonificadas, vendas, alertas, simuladores, relatórios e
painel administrativo.

> Reimplementação feita a partir das **funcionalidades observáveis** de um produto de
> referência (ver `docs/auditoria-produto.md`), com código, visual e marca próprios.

## Requisitos

- Node.js 22+ (testado com 24)
- Docker (para o PostgreSQL)

## Rodando localmente

```
cp .env.example .env          # ajuste se quiser
npm install
npm run db:up                 # sobe o PostgreSQL na porta 5444
npx prisma migrate deploy     # aplica as migrações
npm run db:seed               # opcional: dados sintéticos e conta demo
npm run dev                   # http://localhost:3100
```

Conta demo do seed: `demo@milheiro.local`, com senha `demo12345` (só para uso local;
defina `DEMO_PASSWORD` para trocar).

Criar um administrador (a senha é pedida no terminal, sem eco):

```
npm run admin:create -- --email voce@dominio.com --name "Seu Nome"
```

Se o e-mail já existir, a conta é promovida a administrador. O painel fica em `/admin`.

## Testes

```
npm test
```

Testes de ponta a ponta pela interface (Playwright), que fazem um build de produção próprio na porta 3200:

```
npx playwright install chromium   # só na primeira vez
npm run test:e2e
```

O E2E cadastra um usuário novo e percorre todas as telas: cadastro, login, titulares e contas, crédito, débito, transferência, lote, extrato (filtros, edição, seleção e exclusão em lote, CSV), pontos a receber, vendas, lojas, alertas e notificações, simuladores, relatórios, preferências, troca de senha, painel admin e responsividade em 375, 768 e 1280px. As capturas ficam em `e2e/screenshots/`.

Usa o banco `milheiro_test` (criado pelo `docker-compose`), que é limpo a cada teste. Os testes
cobrem as regras do extrato, autenticação, recuperação de senha, isolamento entre usuários,
idempotência, concorrência, permissões de admin, CSRF, validação e migrações.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento / build / produção (porta 3100) |
| `npm run lint` | Checagem de tipos |
| `npm run db:up` | Sobe o PostgreSQL |
| `npm run db:migrate` | Cria uma nova migração (desenvolvimento) |
| `npm run db:deploy` | Aplica as migrações pendentes |
| `npm run db:seed` | Dados sintéticos |
| `npm run db:backup` / `db:restore` | Backup e restauração (ver `docs/backup-restauracao.md`) |
| `npm run admin:create` | Cria ou promove administrador |
| `npm run test:e2e` | Testes de ponta a ponta (Playwright) |

## Documentação

- `docs/auditoria-produto.md` — o que foi observado no produto de referência
- `docs/arquitetura.md` — camadas e decisões
- `docs/modelo-dados.md` — entidades e regras de cálculo
- `docs/deploy.md` — publicação em um novo ambiente
- `docs/backup-restauracao.md` — backup e restauração
- `docs/comparativo-ui.md` — comparação crítica da interface com a referência
- `docs/status.md` — o que foi implementado, verificado e o que falta

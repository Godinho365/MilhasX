# Publicação em um novo ambiente

## Opção A — Docker

1. Provisione um PostgreSQL 16 (gerenciado ou o `docker-compose.yml` com uma senha forte em
   `POSTGRES_PASSWORD`, sem expor a porta 5432 para a internet).
2. Construa a imagem: `docker build -t milheiro .`
3. Rode com as variáveis (nunca dentro da imagem):
   ```
   docker run -d -p 3100:3100 \
     -e DATABASE_URL="postgresql://usuario:senha@host:5432/milheiro?schema=public" \
     -e APP_URL="https://seu-dominio" -e APP_NAME="Seu nome" \
     milheiro
   ```
   O contêiner aplica as migrações (`prisma migrate deploy`) ao iniciar.
4. Coloque um proxy com HTTPS na frente (Caddy, Nginx ou Cloudflare). Com `NODE_ENV=production`
   o cookie de sessão só trafega por HTTPS.
5. Crie o primeiro administrador **no servidor**:
   `docker exec -it <contêiner> npm run admin:create -- --email voce@dominio --name "Seu Nome"`

## Opção B — Node direto

`npm ci && npx prisma migrate deploy && npm run build && npm start` (porta 3100), atrás de um
proxy HTTPS.

## Checklist de produção

- [ ] `APP_URL` com o domínio real (usado no link de redefinição de senha e na checagem de origem)
- [ ] Provedor de e-mail em `src/server/mailer.ts` (sem ele, os e-mails ficam em `.outbox/` no servidor)
- [ ] Não rodar `npm run db:seed` em produção (ele cria a conta demo)
- [ ] Backups agendados (ver `backup-restauracao.md`)
- [ ] Se estiver atrás de proxy, garantir que `x-forwarded-for` venha do proxy (usado no limite de tentativas por IP)

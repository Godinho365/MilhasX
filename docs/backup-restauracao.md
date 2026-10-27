# Backup e restauração

## Backup

```
npm run db:backup
```

Gera `backups/milheiro-AAAA-MM-DDTHH-MM.dump` (formato custom do `pg_dump`) a partir do
contêiner `db`. A pasta `backups/` fica fora do git. Copie os arquivos para fora do servidor
(armazenamento em nuvem, outro disco). Perder a VPS sem uma cópia externa é exatamente o que
este procedimento evita.

Sugestão: agende diariamente (cron no Linux ou Agendador de Tarefas no Windows) e mantenha
pelo menos 7 cópias diárias e 4 semanais.

## Restauração

1. Pare a aplicação.
2. `npm run db:restore -- backups/arquivo.dump --yes`
3. Suba a aplicação e confira o painel admin (indicadores e usuários).

A restauração **substitui** os dados atuais do banco `milheiro`. Teste a restauração
periodicamente num banco de teste: um backup que nunca foi restaurado não está comprovado.

Fora do Docker, use os mesmos comandos direto: `pg_dump -Fc "$DATABASE_URL" > arquivo.dump` e
`pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" arquivo.dump`.

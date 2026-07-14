# Operação — Backup e restore do banco

Fecha a pendência de produção "backup/restore" (Fase 2 / diagnóstico). Os scripts vivem em
`scripts/backup-db.mjs` e `scripts/restore-db.mjs` e operam sobre `DATABASE_URL` via `pg_dump`/
`pg_restore` (formato custom, comprimido). Dumps vão para `backups/` (gitignored).

## Backup

```bash
# onde houver pg_dump no PATH (servidor com postgres-client, container de deploy):
DATABASE_URL=postgresql://... npm run db:backup
# retenção (padrão 14 dumps mais recentes):
BACKUP_RETENCAO=30 npm run db:backup
```

**Dev** (banco no container, host sem `pg_dump`): rode através do container do Postgres dev:

```bash
docker exec padaria-db-dev-db-1 pg_dump --format=custom --no-owner --no-privileges -U padaria padaria > backups/dev_$(date +%Y%m%d).dump
```

Verificado: `pg_dump` do dev produz dump `PGDMP` válido com todos os dados (56 tabelas,
incluindo os 141 produtos importados do Pralis).

## Restore (DESTRUTIVO)

```bash
DATABASE_URL=postgresql://... npm run db:restore -- backups/padaria_<carimbo>.dump --confirmar
```

Sem `--confirmar` o script recusa (proteção contra apagar dados por engano). Usa
`--clean --if-exists`, recriando os objetos a partir do dump.

## Produção (Coolify)

- **Banco gerenciado no Coolify/provedor:** prefira o **backup automático do provedor** (snapshots
  point-in-time). Os scripts aqui servem para dump lógico portátil (migração, cópia, retenção
  própria) e para bancos self-hosted.
- **Banco self-hosted (`db:prod`):** agende `npm run db:backup` como cron (Coolify Scheduled Task
  ou cron do host) apontando `DATABASE_URL` para o banco de produção, com `BACKUP_RETENCAO`
  adequado, e replique os dumps para storage externo (o volume local não é durável o suficiente
  para DR sozinho).
- **Sempre teste o restore** periodicamente num banco descartável — backup não testado não é backup.

## Critério de pronto

- `npm run db:backup` gera dump com dados reais (verificado).
- `npm run db:restore ... --confirmar` recria o schema+dados a partir do dump.
- Retenção aplicada; `backups/` fora do git.
- Procedimento de produção documentado (provedor gerenciado vs self-hosted).

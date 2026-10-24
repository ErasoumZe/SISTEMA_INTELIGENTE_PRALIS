# Pralís — publicação segura

Este procedimento não executa deploy, migration ou restauração por conta própria. Cada comando de alteração exige confirmação do banco/volume de destino.

## Backup do PostgreSQL

```powershell
$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force backups\release | Out-Null
docker exec <container-postgres-autorizado> pg_dump -Fc -U <usuario> -d <banco> > "backups\release\postgres-$stamp.dump"
docker run --rm -v "${PWD}\backups\release:/backup:ro" postgres:16-alpine pg_restore --list "/backup/postgres-$stamp.dump" | Out-File "backups\release\postgres-$stamp.list.txt"
Get-FileHash "backups\release\postgres-$stamp.dump" -Algorithm SHA256
```

O arquivo de origem deve ser confirmado antes do comando. Nunca usar o `DATABASE_URL` de produção em uma restauração de teste.

## Backup do `/app/storage`

```powershell
$volume = "<volume-api-autorizado>"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
docker volume inspect $volume
New-Item -ItemType Directory -Force backups\release | Out-Null
docker run --rm -v "${volume}:/data:ro" -v "${PWD}\backups\release:/backup" alpine:3.20 sh -c "tar -czf /backup/storage-$stamp.tar.gz -C /data ."
docker run --rm -v "${PWD}\backups\release:/backup:ro" alpine:3.20 sh -c "tar -tzf /backup/storage-$stamp.tar.gz >/dev/null"
Get-FileHash "backups\release\storage-$stamp.tar.gz" -Algorithm SHA256
```

Se `docker volume inspect` falhar, o backup fica pendente; não criar um volume com o mesmo nome e não substituir a origem.

## Restauração descartável

1. Criar um PostgreSQL descartável com banco e volume novos.
2. Restaurar o dump somente nesse banco.
3. Extrair o arquivo de storage somente em volume descartável.
4. Comparar listagem, contagens técnicas, hashes e integridade do processo.
5. Descartar os recursos temporários somente após registrar o resultado.

Não restaurar sobre o banco operacional nem sobre o volume `padaria_api_storage`.

## Migrations em banco novo

O Coolify deve apontar o serviço `migrate` e a API para o mesmo `DATABASE_URL`. Antes de publicar um banco vazio, executar a sequência completa em um banco descartável e confirmar o histórico do Drizzle.

As migrations 0061 e 0062 têm dependência histórica: a FK composta de 0061 exige a UNIQUE que aparece em 0062. A migration 0062 atual possui guarda condicional que valida a definição da constraint antes de criá-la. O procedimento de homologação existente cria a UNIQUE no ponto correto, mas não deve ser usado automaticamente em produção.

Para produção, a decisão pendente é escolher uma correção versionada e compartilhada para bancos novos, sem editar migrations já aplicadas nem inserir registros artificiais no journal. Até essa validação, o deploy de um banco Coolify vazio fica bloqueado.

## Checklist Coolify

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_BASE_URL` e `WEB_ORIGIN` cadastrados como secrets.
- Variáveis Google cadastradas somente no ambiente do backend.
- `GOOGLE_ADMISSAO_SYNC_ENABLED=false` por padrão.
- `CONPLUS_GOOGLE_SYNC_ENABLED=false` por padrão.
- Volume persistente `/app/storage` criado e incluído no backup.
- Healthchecks da API e web aprovados.
- CORS limitado a `WEB_ORIGIN`.
- Imagem anterior e backups preservados para rollback.
- Nenhuma migration executada sem confirmar o banco de destino.

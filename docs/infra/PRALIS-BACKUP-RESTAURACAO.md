# Pralís — backup e restauração

Este procedimento cobre o PostgreSQL e os anexos locais usados pela API. O backup do banco não
contém os arquivos do diretório `/app/storage`; os dois artefatos devem ser tratados como um par.

## Backup do PostgreSQL

Execute somente contra o banco explicitamente identificado como desenvolvimento ou homologação.
Não reutilize a URL de produção sem autorização própria.

```powershell
$env:DATABASE_URL = "postgresql://<usuario>:<senha>@<host>:<porta>/<banco>"
npm run db:backup
Get-FileHash .\backups\padaria_*.dump -Algorithm SHA256
pg_restore --list .\backups\padaria_<timestamp>.dump | Out-File .\backups\padaria_<timestamp>.list.txt
```

O script usa formato customizado, não executa `DROP`, e mantém a retenção configurada por
`BACKUP_RETENCAO`. O arquivo `.dump` deve permanecer fora do Git.

## Backup dos anexos

No host que possui o volume persistente montado, crie um arquivo compactado sem alterar o volume:

```powershell
docker run --rm `
  -v padaria_api_storage:/data:ro `
  -v "${PWD}\backups:/backup" `
  alpine:3.20 `
  tar -czf /backup/padaria_storage_<timestamp>.tar.gz -C /data .

Get-FileHash .\backups\padaria_storage_<timestamp>.tar.gz -Algorithm SHA256
```

Antes de aceitar o backup, confirme tamanho maior que zero, hash registrado e leitura da listagem:

```powershell
docker run --rm `
  -v "${PWD}\backups:/backup:ro" `
  alpine:3.20 `
  tar -tzf /backup/padaria_storage_<timestamp>.tar.gz | Select-Object -First 20
```

## Restauração descartável

Nunca restaure sobre o banco ou volume operacional. Primeiro crie um PostgreSQL e um volume
descartáveis, separados dos nomes usados pelo desenvolvimento e pelo Coolify.

```powershell
$env:DATABASE_URL = "postgresql://<usuario>:<senha>@127.0.0.1:<porta-descartavel>/<banco-descartavel>"
pg_restore --clean --if-exists --no-owner --no-privileges `
  --dbname $env:DATABASE_URL .\backups\padaria_<timestamp>.dump

docker run --rm `
  -v padaria_api_storage_restore_<timestamp>:/data `
  -v "${PWD}\backups:/backup:ro" `
  alpine:3.20 `
  tar -xzf /backup/padaria_storage_<timestamp>.tar.gz -C /data
```

Valide no ambiente descartável: contagem técnica de tabelas, leitura de uma ficha de teste e
existência dos caminhos de anexos. Remova somente os recursos descartáveis depois da validação.
Não use `docker compose down -v` em ambientes compartilhados.

## Rollback

Em caso de falha de publicação, retire o tráfego da API, preserve logs e faça rollback para a
imagem anterior. Restauração de banco ou anexos é uma operação excepcional e destrutiva; exige
aprovação específica, janela de manutenção e verificação do backup correspondente.

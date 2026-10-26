# Homologação — aplicação das migrations 0064 a 0069 (22/10/2026)

Documento interno (não vai no pacote da Conplus). Registra o que foi feito no banco de homologação,
as evidências e como desfazer.

## Alvo, identificado antes de qualquer escrita

| Item            | Valor                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Container       | `padaria-db-homologacao` (postgres:16-alpine)                                            |
| Porta           | `127.0.0.1:5544`                                                                         |
| Banco / usuário | `padaria_homologacao` / `padaria_homologacao`                                            |
| Volume          | `padaria_postgres_homologacao_data`                                                      |
| Não é           | o dev (`padaria-db-dev-db-1`, 5543, banco `padaria`) nem produção (Coolify)              |
| Estado antes    | 64 migrations (0000–0063); histórico = prefixo exato do journal; 0 conexões de aplicação |

## Procedimento

1. **Backup** completo (`pg_dump -Fc`), fora do repositório:
   `%USERPROFILE%\backups\pralis-homologacao\2026-10-22\homologacao-antes-0064-0069.dump`
   — 504.408 bytes, SHA-256 `ea0a53c9d9abfac0cbc2a0bcac4486772b9eaac795ef03c1d19bfed13d4bd267`
   (arquivo `.sha256` ao lado). Contagem de linhas de cada tabela em `contagens-antes.txt`
   (116 tabelas, 368 linhas — dados fictícios de homologação).
2. **Restauração testada** em container descartável (`pg_restore --no-owner --exit-on-error`):
   116 tabelas com contagens idênticas às do original.
3. **Ensaio** no banco restaurado com `scripts/bootstrap-homologacao.mjs` (modo descartável):
   `estado=concluido|migrations=70`; nenhuma tabela existente mudou de contagem; 8 tabelas novas;
   segunda execução `ja_inicializado`.
4. **Estrutura** do ensaio comparada (`pg_dump --schema-only`) com um banco novo criado pelo
   `drizzle-kit migrate` oficial: idênticas (só o token aleatório do `\restrict` difere).
5. **Aplicação na homologação** com `scripts/bootstrap-homologacao.mjs` (modo homologação, porta 5544,
   confirmação explícita): `estado=concluido|banco=padaria_homologacao|migrations=70`. Contagens
   depois = contagens do ensaio.

## Verificações depois

- Estrutura da homologação = banco novo oficial (3.401 linhas de DDL, sem diferença).
- 0 constraints não validadas; 0 índices inválidos.
- Triggers novos presentes: `questor_configuracoes`, `questor_codigos`, `conplus_sincronizacao_estado`.
- Teste funcional em transação desfeita (`BEGIN … ROLLBACK`): gravou configuração Questor, evento do
  catálogo e estado de sincronização; os CHECKs de bloqueio (executando sem dono) e de código de evento
  recusaram dado inválido; depois do ROLLBACK, as três tabelas voltaram a 0 linhas.

## Como desfazer (rollback)

As migrations 0064–0069 só acrescentam (tabelas novas, colunas novas nulas ou com default), então a
homologação continua funcionando com o código antigo. Se mesmo assim for preciso voltar ao estado exato
de antes, recrie o banco vazio e restaure o dump. `pg_restore --clean` NÃO serve: as tabelas novas
têm FK para tabelas antigas (ex.: `empresas`) e não estão no dump, então o DROP das antigas falharia.

```bash
cd ~/backups/pralis-homologacao/2026-10-22
# 1. conferir o backup
sha256sum -c homologacao-antes-0064-0069.dump.sha256
# 2. parar a API que usa a homologação; recriar o banco vazio (conectado ao banco "postgres")
docker exec padaria-db-homologacao sh -c 'psql -U "$POSTGRES_USER" -d postgres   -c "drop database padaria_homologacao" -c "create database padaria_homologacao"'
# 3. restaurar
docker exec -i padaria-db-homologacao sh -c   'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error'   < homologacao-antes-0064-0069.dump
# 4. conferir: drizzle.__drizzle_migrations com 64 linhas e contagens iguais a contagens-antes.txt
```

Este é o mesmo procedimento usado no passo 2 (restauração testada), que reproduziu as 116 tabelas
com contagens idênticas.

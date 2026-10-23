# Plano — aplicar a migration 0070 na homologação (5544)

Documento interno. **Não executado.** A aplicação depende de autorização específica de Marco.
Ensaio completo feito em 23/10/2026 sobre uma cópia da homologação (resultados no fim).

## O que a 0070 faz

`db/migrations/0070_eventos_layout_oficial.sql` — eventos variáveis no layout oficial da Conplus:

- `questor_configuracoes`: `codigo_empresa_questor`, `razao_social_questor` (nulos).
- `questor_eventos_variaveis`: `sequencia_questor`, `filial_questor`, `natureza` (nulos).
- `questor_eventos_variaveis_lancamentos`: `cancelado_em`, `cancelado_por`, `motivo_cancelamento` (nulos);
  a unicidade (empresa, competência, vínculo, evento) passa a ignorar cancelados (troca da constraint
  por índice único parcial com o mesmo nome).
- `questor_exportacoes.codigo_periodo_calculo` e, em `questor_exportacoes_eventos_variaveis`,
  `codigo_periodo_calculo`, `codigo_contrato`, `sequencia` + índice único parcial da chave do Questor.
- Tabela nova `questor_auditoria` (downloads, recusas, cancelamentos).

Nenhuma linha existente é reescrita. Dependências: 0068 (tabelas de exportação) e 0064 (configuração).

## Pré-requisitos

1. Autorização de Marco para escrever na homologação.
2. Ninguém usando a homologação durante a janela (API de homologação parada ou sem uso).
3. Código com a 0070 e o journal na mesma versão do ensaio (`npm run check:migrations` → 71).
4. Espaço em disco para o backup (~0,6 MB hoje).

## Verificações antes (somente leitura)

```bash
# alvo certo
docker inspect padaria-db-homologacao --format '{{.Name}} {{range .Mounts}}{{.Name}}{{end}}'
#   esperado: /padaria-db-homologacao padaria_postgres_homologacao_data
docker exec padaria-db-homologacao sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select current_database(), inet_server_port()"'
#   esperado: padaria_homologacao (porta interna 5432; publicada em 127.0.0.1:5544)
# estado
docker exec padaria-db-homologacao sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*) from drizzle.__drizzle_migrations"'
#   esperado: 70  (se já for 71, PARE: já aplicada)
docker exec padaria-db-homologacao sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()"'
#   esperado: 0 conexões de aplicação
```

## Backup

```bash
D=~/backups/pralis-homologacao/AAAA-MM-DD; mkdir -p "$D"
docker exec padaria-db-homologacao sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6' > "$D/homologacao-antes-0070.dump"
(cd "$D" && sha256sum homologacao-antes-0070.dump > homologacao-antes-0070.dump.sha256)
# contagem por tabela (script de leitura usado no ensaio) → "$D/contagens-antes.txt"
# restaurar o dump num container descartável e conferir as mesmas contagens ANTES de seguir
```

## Aplicação

```bash
PRALIS_HOMOLOGACAO_BOOTSTRAP_CONFIRMADO=SIM DATABASE_URL="postgres://padaria_homologacao:<senha>@127.0.0.1:5544/padaria_homologacao" \
  node scripts/bootstrap-homologacao.mjs
#   esperado: estado=concluido|banco=padaria_homologacao|migrations=71
```

O script recusa qualquer banco que não seja `padaria_homologacao` na porta 5544, confere que o histórico
é prefixo exato do journal e que terminou na última migration.

## Verificações depois

1. `drizzle.__drizzle_migrations` = 71.
2. Contagens por tabela = antes, mais `questor_auditoria` com 0 linhas.
3. `select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated` = 0.
4. Índices inválidos = 0; `pg_get_indexdef` dos dois índices parciais conforme a seção acima.
5. Estrutura (`pg_dump --schema-only`) idêntica à de um banco novo criado pelo `drizzle-kit migrate`.
6. Teste funcional em transação desfeita (`BEGIN … ROLLBACK`): gravar configuração com código/razão
   social, cancelar um lançamento e inserir auditoria; depois do ROLLBACK, nada fica.

## Critérios de sucesso

Todos os itens acima conferem; a API de homologação sobe; `/conplus/exportar` mostra "Oficial bloqueado".

## Critérios para interromper (não aplicar ou desfazer)

- Alvo diferente do esperado, migrations ≠ 70 antes, conexões ativas, backup sem checksum ou que não
  restaura com as mesmas contagens.
- O bootstrap não termina em `estado=concluido|…|migrations=71`.
- Qualquer contagem de tabela existente diferente de antes, constraint não validada ou índice inválido.

## Rollback

Duas opções, ambas ensaiadas:

1. **Restaurar o backup** (estado exato de antes): recriar o banco vazio e `pg_restore --no-owner`
   do dump (procedimento de `HOMOLOGACAO_MIGRATIONS_0064_0069.md`).
2. **Script reverso** `docs/integracoes/conplus/homologacao-0070/rollback-0070.sql`: desfaz só a 0070
   numa transação; para sem alterar nada se houver lançamento cancelado e relançado na mesma chave
   (a unicidade antiga não caberia). Perde o que foi gravado nas estruturas novas.

## Ensaio executado em 23/10/2026 (cópia da homologação, banco descartável)

| Passo                                                         | Resultado                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Backup somente leitura da 5544                                | `homologacao-antes-0070.dump`, 542.239 bytes, SHA-256 `871eb280…46d2`; 124 tabelas, 374 linhas |
| Restauração em container descartável                          | contagens idênticas (124 tabelas)                                                              |
| Aplicação pelo `bootstrap-homologacao.mjs` (modo descartável) | `estado=concluido                                                                              | migrations=71`; nenhuma tabela existente mudou; +1 tabela |
| Integridade                                                   | 0 constraints não validadas; 0 índices inválidos; índices parciais corretos                    |
| Estrutura                                                     | idêntica a banco novo pelo `drizzle-kit migrate` (3.441 linhas de DDL)                         |
| Rollback pelo script reverso                                  | estrutura idêntica à de antes da 0070; contagens iguais às de antes                            |
| Reaplicação depois do rollback                                | `estado=concluido                                                                              | migrations=71`                                            |

A homologação 5544 e o desenvolvimento 5543 **não foram alterados** (70 e 64 migrations).

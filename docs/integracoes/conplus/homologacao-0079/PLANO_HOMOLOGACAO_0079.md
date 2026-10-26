# Plano — levar a homologação (5544) até a migration 0079

Documento interno. **Não executado.** Escrever na 5544 depende de autorização específica de Marco.
Ensaio completo feito em 26/10/2026 sobre cópias da homologação e do desenvolvimento (resultados no fim).

## Por que mudou desde a versão de 23/10

O merge da main (PR #203, 24/10) renumerou as migrations da integração: a main ocupou 0060–0068 com
Compras e as da integração viraram 0069–0079, **sem mudar o SQL** (a antiga 0070 é a atual 0079). O
`when` do journal também mudou.

A 5544 aplicou a numeração antiga (70 migrations: 0000–0059 + as antigas 0060–0069). O Drizzle decide
pelo `when`: um `migrate` direto **pularia em silêncio** as 0060–0067 de Compras (datas anteriores à
última aplicada) e tentaria reaplicar as da integração (datas novas), quebrando em `CREATE TABLE` de
tabela existente. O `bootstrap-homologacao.mjs` recusa esse banco por desenho (histórico não é prefixo
do journal). Por isso a aplicação agora tem duas etapas: **reconciliar** e depois **aplicar**.

O desenvolvimento (5543, 64 migrations: até a antiga 0063) tem o mesmo problema e a mesma solução.

## O que entra na 5544

1. **Compras da main (0060–0068)**, aplicadas pelo SQL versionado, sem alteração.
2. **Histórico renumerado:** as 10 linhas da integração recebem o `when` atual; as 9 da main são
   registradas. Resultado: histórico = prefixo exato do journal até a 0078.
3. **0079 (`0079_eventos_layout_oficial.sql`)** pelo caminho normal (`bootstrap-homologacao.mjs`):
   código e razão social da empresa no Questor, dados do catálogo oficial, período/contrato/sequência
   das linhas oficiais com a chave do Questor única, cancelamento lógico de lançamento e
   `questor_auditoria`. Nenhuma linha existente é reescrita.

Particularidade conhecida: a antiga 0061 (atual 0070) ganhou depois o bloco idempotente da UNIQUE; o
hash gravado na 5544 é o do arquivo anterior. O Drizzle não usa o hash; o script aceita essa única
diferença e recusa qualquer outra (SQL aplicado diferente do versionado).

## Pré-requisitos

1. Autorização de Marco para escrever na homologação (reconciliação altera o histórico do Drizzle).
2. Ninguém usando a homologação na janela (API de homologação parada).
3. Código na versão do ensaio: `npm run check:migrations` → 80.
4. Backup novo, com checksum e restauração conferida (abaixo).

## Verificações antes (somente leitura)

```bash
docker inspect padaria-db-homologacao --format '{{.Name}} {{range .Mounts}}{{.Name}}{{end}}'
#   esperado: /padaria-db-homologacao padaria_postgres_homologacao_data
docker exec padaria-db-homologacao sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*), max(created_at) from drizzle.__drizzle_migrations"'
#   esperado: 70|1792692289455   (qualquer outro valor: PARE e reavalie)
docker exec padaria-db-homologacao sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()"'
#   esperado: 0
# simulação da reconciliação (só lê; não grava nada)
DATABASE_URL="postgres://padaria_homologacao:<senha>@127.0.0.1:5544/padaria_homologacao" \
  node scripts/reconciliar-migrations-renumeradas.mjs
#   esperado: estado=simulacao|banco=padaria_homologacao|renomear=10|aplicar_sql=0060,...,0068|migrations_depois=79
```

## Backup

```bash
D=~/backups/pralis-homologacao/AAAA-MM-DD; mkdir -p "$D"
docker exec padaria-db-homologacao sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6' > "$D/homologacao-antes-0079.dump"
(cd "$D" && sha256sum homologacao-antes-0079.dump > homologacao-antes-0079.dump.sha256)
# restaurar o dump num container descartável e conferir as contagens por tabela ANTES de seguir
```

## Aplicação

```bash
# 1. Reconciliar (uma transação; recusa se o histórico não for exatamente o esperado)
PRALIS_RECONCILIACAO_CONFIRMADA=SIM DATABASE_URL="postgres://padaria_homologacao:<senha>@127.0.0.1:5544/padaria_homologacao" \
  node scripts/reconciliar-migrations-renumeradas.mjs --aplicar
#   esperado: estado=reconciliado|banco=padaria_homologacao|renomear=10|aplicar_sql=0060,...,0068|migrations_depois=79

# 2. Aplicar a 0079 pelo caminho oficial
PRALIS_HOMOLOGACAO_BOOTSTRAP_CONFIRMADO=SIM DATABASE_URL="postgres://padaria_homologacao:<senha>@127.0.0.1:5544/padaria_homologacao" \
  node scripts/bootstrap-homologacao.mjs
#   esperado: estado=concluido|banco=padaria_homologacao|migrations=80
```

Os dois scripts recusam host não local, porta/banco fora da lista, `NODE_ENV=production` e a falta da
confirmação explícita. A reconciliação roda em simulação sem `--aplicar` e não roda duas vezes
("historico ja segue a numeracao atual").

## Verificações depois

1. `drizzle.__drizzle_migrations` = 80, último `created_at` = 1792777123905.
2. Contagens por tabela = antes, mais as tabelas novas (Compras e `questor_auditoria`) vazias.
3. Constraints não validadas = 0; índices inválidos = 0.
4. Estrutura (`pg_dump --schema-only`, sem o schema `drizzle`) idêntica à de um banco novo criado
   pelo `drizzle-kit migrate`.
5. A API de homologação sobe; `/conplus/exportar` mostra "Oficial bloqueado".

## Critérios para interromper

- Alvo diferente do esperado, histórico ≠ `70|1792692289455`, conexões ativas, backup sem checksum ou
  que não restaura com as mesmas contagens.
- Simulação diferente do esperado, ou qualquer recusa dos scripts (eles param sem gravar).
- Qualquer contagem de tabela existente diferente de antes, constraint não validada ou índice inválido.

## Rollback

1. **Restaurar o backup** (estado exato de antes, inclusive da reconciliação): recriar o banco vazio e
   `pg_restore --no-owner` do dump. É a única volta para antes da reconciliação.
2. **Só a 0079:** `docs/integracoes/conplus/homologacao-0079/rollback-0079.sql`, numa transação. Para
   sem alterar nada se a 0079 não estiver registrada exatamente uma vez (banco na numeração antiga) ou
   se houver lançamento cancelado — sem a coluna, ele voltaria a valer e poderia entrar num arquivo
   oficial. Perde o que foi gravado nas estruturas da 0079.

## Ensaio executado em 26/10/2026 (bancos descartáveis, container na porta 5591)

Dumps somente leitura (fora do repositório, `~/backups/pralis-homologacao/2026-10-26/`):
`homologacao-5544-antes-reconciliacao.dump` (542.239 bytes, SHA-256 `749bd5f5…453a`) e
`dev-5543-antes-reconciliacao.dump` (497.530 bytes, SHA-256 `01292e66…59a9`).

| Passo                                         | Cópia da 5544                                  | Cópia da 5543                                              |
| --------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Antes                                         | 70 migrations                                  | 64 migrations                                              |
| Simulação                                     | renomear 10, aplicar 0060–0068, ficaria com 79 | renomear 4, aplicar 0060–0068, ficaria com 73              |
| `--aplicar` sem confirmação                   | recusado                                       | recusado                                                   |
| Reconciliação                                 | `estado=reconciliado`                          | `estado=reconciliado`                                      |
| Segunda reconciliação                         | recusada ("nada a reconciliar")                | recusada                                                   |
| Etapa final                                   | bootstrap: `estado=concluido`, 80              | `drizzle-kit migrate`: 80                                  |
| Contagens das tabelas existentes              | iguais; 27 tabelas novas                       | iguais; 35 tabelas novas                                   |
| Constraints não validadas / índices inválidos | 0 / 0                                          | 0 / 0                                                      |
| Estrutura × banco novo (80 migrations)        | **idêntica** (4.265 linhas de DDL)             | mesmo conjunto; só ordem de colunas e comentários diferem¹ |

¹ O 5543 nasceu por `db:push` (sem os `COMMENT ON COLUMN` e com outra ordem de colunas) — já era assim
antes; não vem da reconciliação.

Rollback da 0079 na cópia da 5544: recusado sem a 0079 registrada; recusado com lançamento cancelado
(nada alterado, 80 mantidas); sem cancelados, desfaz (79, `questor_auditoria` removida); reaplicado pelo
bootstrap, estrutura de novo idêntica à de banco novo.

A homologação 5544 e o desenvolvimento 5543 **não foram alterados** (70 e 64 migrations).

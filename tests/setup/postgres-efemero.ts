/**
 * O comando do Postgres DESCARTAVEL dos testes — fonte unica.
 *
 * Existem DOIS containers efemeros no repositorio: o da suite de integracao
 * (`tests/setup/testcontainers.ts`) e o dos testes de migration
 * (`tests/integration/migracoes/migracoes.test.ts`). Os parametros vivem aqui, e nao copiados nos
 * dois, pelo mesmo motivo de sempre nesta base: duas copias divergem no primeiro ajuste, e a
 * divergencia so aparece meses depois como "por que aquele container ficou lento".
 *
 * POR QUE DESLIGAR DURABILIDADE. Medindo `pg_stat_activity` durante o bootstrap, o laco de TRUNCATE
 * aparecia parado em `IO/WALSync` (69 s e 44 s) e `IO/DataFileImmediateSync` (21 s), sem UM
 * bloqueio de lock: era espera de `fsync` dentro da VM do Docker/WSL2. Essa espera nao tem teto — o
 * mesmo arquivo isolado ora custava ~50 s, ora estourava 120 s E TAMBEM 180 s. Subir o teto foi
 * medido e reprovado; desligar a durabilidade ataca a causa.
 *
 * POR QUE E SEGURO. O banco nasce e morre com a rodada: nao ha `withReuse`, nao ha volume, nao ha
 * o que recuperar. Nenhum dos tres parametros muda visibilidade MVCC, aquisicao de lock ou o
 * conteudo de `pg_locks`/`pg_stat_activity` — que sao memoria compartilhada. Os detectores de
 * corrida da suite leem justamente essas estruturas, e o unico advisory lock do sistema nunca e
 * gravado em WAL.
 *
 * POR QUE NAO VAZA. `withCommand` troca o **Cmd**, nunca o Entrypoint: a imagem oficial continua
 * rodando `docker-entrypoint.sh`, que cria usuario e base ANTES do `exec postgres "$@"`. E nenhum
 * `docker-compose` do repositorio tem chave `command:` — producao e Coolify sequer tem servico de
 * banco. Testcontainers fala direto com a API do Docker, fora do compose. Sao cadeias disjuntas, e
 * `scripts/verificar-texto.mjs` guarda essa fronteira.
 */
export const COMANDO_POSTGRES_SEM_DURABILIDADE = [
  "postgres",
  "-c",
  "fsync=off",
  "-c",
  "synchronous_commit=off",
  "-c",
  "full_page_writes=off",
  "-c",
  "shared_buffers=16MB",
  "-c",
  "work_mem=1MB",
  "-c",
  "max_connections=20"
] as const;

/** Os tres parametros que o comando acima desliga — para os testes afirmarem que ele CHEGOU. */
export const PARAMETROS_SEM_DURABILIDADE = ["fsync", "full_page_writes", "synchronous_commit"] as const;

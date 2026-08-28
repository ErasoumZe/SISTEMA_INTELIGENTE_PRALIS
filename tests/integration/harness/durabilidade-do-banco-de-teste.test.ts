import { describe, expect, it } from "vitest";
import { consultarUm } from "../../setup/integracao.js";

// O banco de integracao e DESCARTAVEL: nasce e morre com a rodada. Durabilidade nele nao protege
// nada — so cobra o preco.
//
// O que motivou desligar: medindo `pg_stat_activity` durante o bootstrap, o laco de TRUNCATE do
// `truncarBanco()` aparecia parado em `IO/WALSync` (69 s e 44 s) e `IO/DataFileImmediateSync`
// (21 s), sem UM bloqueio de lock. Era espera de `fsync` dentro da VM do Docker/WSL2 — e ela nao
// tem teto: o mesmo arquivo isolado ora custava ~50 s, ora estourava 120 s E 180 s.
//
// Este teste existe porque escrever o parametro no `withCommand` nao prova que ele CHEGOU. Se
// alguem trocar a imagem, mexer no encadeamento ou o entrypoint passar a ignorar o `Cmd`, a suite
// volta a ficar lenta e instavel em silencio — e ninguem liga uma coisa na outra meses depois.
//
// Nao ha risco de mascarar defeito: nenhum destes tres parametros muda visibilidade MVCC, lock ou
// `pg_locks`. Os detectores de corrida da suite leem memoria compartilhada
// (`pg_blocking_pids`/`pg_stat_activity`) e o unico advisory lock do sistema nunca e gravado em WAL.
describe("harness - o banco de teste roda sem durabilidade", () => {
  const desligados = ["fsync", "synchronous_commit", "full_page_writes"] as const;

  it.each(desligados)("%s esta desligado no Postgres efemero", async (parametro) => {
    // `show X` devolve a coluna com o NOME do parametro; `current_setting` deixa dar apelido e
    // aceita o parametro ligado, sem interpolar texto na consulta.
    const linha = await consultarUm<{ valor: string }>("select current_setting($1) as valor", [parametro]);
    expect(linha?.valor, `${parametro} deveria estar off no banco descartavel`).toBe("off");
  });

  // A contraprova: se o banco alvo NAO fosse efemero, desligar durabilidade seria grave. Amarrar o
  // nome aqui deixa explicito contra o que estes parametros valem — e faz o teste falhar se alguem
  // apontar a suite para um banco de verdade.
  it("e mesmo o banco descartavel da suite, nao um banco real", async () => {
    const linha = await consultarUm<{ nome: string }>("select current_database() as nome");
    expect(linha?.nome).toBe("padaria_test");
  });
});

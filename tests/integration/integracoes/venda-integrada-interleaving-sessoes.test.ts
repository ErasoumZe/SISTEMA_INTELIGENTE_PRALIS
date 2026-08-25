// RED-3 da #41 · INTERLEAVING CONTROLADO em duas conexoes Postgres independentes.
//
// Onde a barreira de lock do RED-1 nao da controle sobre QUEM COMMITA PRIMEIRO, duas sessoes `pg`
// dedicadas replicam o INSERT que `criarOuAtualizarVendaIntegradaRepository` faz e cruzam as duas
// ordens de forma explicita. E o unico jeito de afirmar, sem sorteio, o que acontece em cada uma.
//
// SINTOMA QUE ESTE ARQUIVO PRENDE: nas DUAS ordens, os dois commits passam — porque `vendas` nao
// tem UNIQUE em (empresa_id, identificador_externo). Duas linhas para o mesmo `idVenda`.
//
// DEPOIS DA #41 o comportamento vira: o segundo INSERT ESPERA o primeiro (o indice unico faz o
// Postgres segurar o inserter concorrente ate saber se a chave vai existir), acorda com 23505 e o
// commit dele nao entra. Uma linha, nas duas ordens.
//
// Por isso o segundo INSERT e disparado SEM await: hoje ele resolve na hora; depois da migration
// ele fica pendente ate o commit do primeiro. Um `await` direto aqui esconderia a diferenca e o
// teste passaria a medir outra coisa.
//
// `abrirBloqueador()` e reusado so como fabrica de conexao DEDICADA (client, nao pool): as funcoes
// de consulta deste projeto criam um pool por chamada e o `end()` derrubaria a transacao aberta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { idsTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  aindaPendente,
  consultarTodos,
  esperarBloqueioPor,
  fecharBloqueador,
  type ClienteBloqueador
} from "../../setup/integracao.js";

const VENDA_ORDEM_AB = "R41-SESSOES-ORDEM-AB";
const VENDA_ORDEM_BA = "R41-SESSOES-ORDEM-BA";
const VENDA_PENDENTE = "R41-SESSOES-PERDEDOR-PENDENTE";

// As colunas obrigatorias de `vendas` (as demais tem default). E o mesmo shape que
// `criarOuAtualizarVendaIntegradaRepository` monta em `valoresVenda`, reduzido ao que a chave
// unica da R-175 enxerga: empresa, chave da integracao e identificador externo.
const INSERT_VENDA = `
  insert into vendas (empresa_id, integracao_chave_id, data_referencia, descricao, valor_original, identificador_externo)
  values ($1, $2, '2026-06-30', $3, '19.00', $4)
  returning id
`;

describe("#41 · interleaving controlado em duas sessoes independentes", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    // Nao usa a API: o objeto do teste e o banco. O contexto existe para aplicar o seed (empresa e
    // chave de integracao precisam existir) e para fechar limpo no final.
    contexto = await criarContextoApiTeste();
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function vendasDe(identificadorExterno: string) {
    return consultarTodos<{ id: string }>("select id from vendas where identificador_externo = $1", [
      identificadorExterno
    ]);
  }

  function inserir(sessao: ClienteBloqueador, identificadorExterno: string, descricao: string) {
    return sessao.cliente.query(INSERT_VENDA, [
      idsTeste.empresaA,
      idsTeste.integracaoChave,
      descricao,
      identificadorExterno
    ]);
  }

  /**
   * Cruza as duas sessoes: as duas inserem a mesma venda antes de qualquer commit, e so entao a
   * PRIMEIRA commita. `segunda` volta como promessa nao resolvida de proposito.
   */
  async function cruzar(identificadorExterno: string) {
    const s1 = await abrirBloqueador();
    const s2 = await abrirBloqueador();
    try {
      await s1.cliente.query("begin");
      await s2.cliente.query("begin");

      await inserir(s1, identificadorExterno, "venda da sessao 1");

      // SEM await: depois da #41 esta promessa fica pendente ate o commit de s1.
      const segunda = inserir(s2, identificadorExterno, "venda da sessao 2").then(
        () => ({ aceita: true, erro: "" }),
        (erro: { code?: string; message?: string }) => ({
          aceita: false,
          erro: `${erro.code ?? "?"} ${erro.message ?? ""}`.trim()
        })
      );

      await s1.cliente.query("commit");
      const resultadoSegunda = await segunda;
      await s2.cliente.query(resultadoSegunda.aceita ? "commit" : "rollback").catch(() => undefined);

      return resultadoSegunda;
    } finally {
      await fecharBloqueador(s1);
      await fecharBloqueador(s2);
    }
  }

  it("ordem A->B: a sessao 2 tem de ser recusada pelo banco", async () => {
    const segunda = await cruzar(VENDA_ORDEM_AB);
    const linhas = await vendasDe(VENDA_ORDEM_AB);

    expect(
      segunda.aceita,
      `o banco deveria recusar o segundo INSERT do mesmo (empresa, identificador_externo) com 23505; ` +
        `hoje ele aceita, porque nao existe UNIQUE parcial em \`vendas\`. Retorno da sessao 2: ` +
        `${segunda.erro || "aceito sem erro"}`
    ).toBe(false);
    expect(segunda.erro, "o erro precisa ser violacao de unicidade (23505), nao outro qualquer").toContain("23505");
    expect(linhas.length, `esperada UMA venda para ${VENDA_ORDEM_AB}, encontradas ${linhas.length}`).toBe(1);
  });

  it("ordem B->A: invertida, o resultado tem de ser o mesmo", async () => {
    const segunda = await cruzar(VENDA_ORDEM_BA);
    const linhas = await vendasDe(VENDA_ORDEM_BA);

    expect(
      segunda.aceita,
      `invertida a ordem, o segundo INSERT continua tendo de ser recusado com 23505. ` +
        `Retorno da sessao 2: ${segunda.erro || "aceito sem erro"}`
    ).toBe(false);
    expect(segunda.erro).toContain("23505");
    expect(linhas.length, `esperada UMA venda para ${VENDA_ORDEM_BA}, encontradas ${linhas.length}`).toBe(1);
  });

  // T-9 · o perdedor precisa ESPERAR, nao estourar na hora.
  //
  // E a diferenca entre o indice ARBITRAR o conflito e a insercao simplesmente falhar: com o unique
  // parcial, o Postgres segura o segundo inserter ate saber se a chave do primeiro vai existir. Se
  // alguem tirar o predicado do `where` do ON CONFLICT (ou o proprio indice), some a espera e o
  // segundo INSERT falha de imediato — este caso pega isso.
  //
  // Duas provas somadas, porque `aindaPendente` sozinho seria fraco: uma promessa que resolve em 1ms
  // tambem "ainda esta pendente" num tick de macrotask. `esperarBloqueioPor` confirma no proprio
  // Postgres, por `pg_blocking_pids`, que a sessao 2 esta bloqueada PELA sessao 1.
  //
  // Este caso e propriedade do INDICE, nao do codigo: ele fica verde assim que a 0032 e aplicada,
  // antes de qualquer mudanca em `api/src`.
  it("T-9 · a sessao 2 fica PENDENTE enquanto a sessao 1 nao commita", async () => {
    const s1 = await abrirBloqueador();
    const s2 = await abrirBloqueador();
    try {
      await s1.cliente.query("begin");
      await s2.cliente.query("begin");

      await inserir(s1, VENDA_PENDENTE, "venda da sessao 1");

      // `.then(ok, err)` primeiro: transforma a rejeicao futura em valor e evita unhandled rejection
      // enquanto a promessa fica pendurada de proposito.
      const segunda = inserir(s2, VENDA_PENDENTE, "venda da sessao 2").then(
        () => "resolvida",
        () => "rejeitada"
      );

      expect(
        await esperarBloqueioPor(s1, 1),
        "o Postgres deveria mostrar a sessao 2 bloqueada PELA sessao 1 (pg_blocking_pids)"
      ).toBe(true);
      expect(await aindaPendente(segunda), "o segundo INSERT nao pode ter resolvido antes do commit do primeiro").toBe(
        true
      );

      await s1.cliente.query("commit");

      expect(await segunda, "solto o primeiro, o segundo tem de acordar REJEITADO").toBe("rejeitada");
      await s2.cliente.query("rollback").catch(() => undefined);
    } finally {
      await fecharBloqueador(s1);
      await fecharBloqueador(s2);
    }

    const linhas = await vendasDe(VENDA_PENDENTE);
    expect(linhas.length, `esperada UMA venda para ${VENDA_PENDENTE}, encontradas ${linhas.length}`).toBe(1);
  });

  it("venda de RETAGUARDA continua livre: o indice nao pode alcancar quem nao e da integracao", async () => {
    // Duas vendas manuais (sem chave de integracao e sem identificador externo) no mesmo dia sao
    // legitimas — e por isso o indice da R-175 e PARCIAL. Se alguem transformar em unique cheio,
    // este caso quebra.
    const sessao = await abrirBloqueador();
    try {
      for (const descricao of ["manual 1", "manual 2"]) {
        await sessao.cliente.query(
          `insert into vendas (empresa_id, data_referencia, descricao, valor_original)
           values ($1, '2026-06-30', $2, '19.00')`,
          [idsTeste.empresaA, descricao]
        );
      }
      const manuais = await sessao.cliente.query<{ total: string }>(
        `select count(*)::text as total from vendas
          where empresa_id = $1 and integracao_chave_id is null and descricao in ('manual 1', 'manual 2')`,
        [idsTeste.empresaA]
      );
      expect(manuais.rows[0]?.total, "duas vendas de retaguarda no mesmo dia continuam validas").toBe("2");
    } finally {
      await fecharBloqueador(sessao);
    }
  });
});

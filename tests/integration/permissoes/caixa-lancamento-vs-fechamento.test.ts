import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { abrirCaixaDoOperador, universoDoCaixa } from "../../setup/caixa.js";
import {
  abrirBloqueador,
  consultarUm,
  esperarBloqueioPor,
  esperarCadeiaDeBloqueio,
  fecharBloqueador,
  json,
  sessoesBloqueadasPor,
  snapshotDoLancamento,
  travasDeEscritaDaSessaoBloqueada,
  universoDeLancamentos,
  type ClienteBloqueador
} from "../../setup/integracao.js";

// P0 — concorrencia entre LANCAMENTO e FECHAMENTO do caixa.
//
// A causa: as rotas de lancamento resolviam o caixa com SELECT puro (sem lock) e o INSERT/UPDATE
// commitava DEPOIS do congelamento dos sete totais — write skew permitido por READ COMMITTED. A
// correcao poe um `FOR SHARE` na linha de `fechamentos_caixa` como PRIMEIRO lock de toda operacao
// que possa alterar totais, com revalidacao do status POS-lock (decisao homologada pelo Jose,
// 11/08/2026; plano em PLANO-P0-CONCORRENCIA-LANCAMENTO-FECHAMENTO.md).
//
// Determinismo sem sleep: o adversario e ou uma conexao dedicada segurando o MESMO lock da
// producao (bloqueador), ou um GATE por FK — trava-se a linha de uma tabela que a rota referencia
// por FK num INSERT posterior ao ponto de interesse; o `FOR KEY SHARE` implicito do RI check prende
// a rota exatamente ali, com a transacao viva e os locks ja adquiridos. A espera e observada pelo
// grafo de waits do banco (`pg_blocking_pids`), nunca por tempo.
//
// Gates usados aqui:
//   G-COFRE: `for update` na conta do cofre prende o INSERT do retorno final do fechamento
//            (exige saldo > 0; nesse ponto o fechamento JA segura o `for update` do caixa e JA
//            calculou os totais);
//   G-ITEM:  `for update` num item de patrimonio prende o INSERT de `despesas_itens` (a raiz ja
//            foi inserida/atualizada; na correcao, o lock do caixa ja foi tomado antes).

// Espelham os niveis de producao: `travarCaixaRepository` (fechamento) e o novo
// `travarCaixaCompartilhadoRepository` (lancamento). Para exercitar a mutacao do nivel, trocar
// aqui e em producao ao mesmo tempo.
const LOCK_DO_FECHAMENTO = "update";
const LOCK_DO_LANCAMENTO = "share";
// A divergencia contabil do RED tem de ser exatamente este valor.
const VALOR_INJETADO = 55;

type Fixture = { caixaId: string; contaId: string; pdvId: string; usuarioId: string };

describe("P0 - lancamento x fechamento do caixa", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  const hoje = "2026-08-01";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    // O operador do seed nao tem `entradas_editar` nem `transferencias_editar` — sem conceder, os
    // casos E1 de venda e transferencia morreriam num 403 de PERMISSAO e provariam a regra errada.
    // ACRESCENTA as regras atuais (substituir apagaria `caixa_operar`) e reloga: o perfil da sessao
    // so recomputa as permissoes efetivas ao logar.
    const operador = await consultarUm<{ usuario_id: string }>(
      "select usuario_id from perfis_usuarios where lower(email) = lower($1)",
      [usuariosTeste.caixa.email]
    );
    if (!operador) throw new Error("Usuario caixa nao encontrado");
    const regrasAtuais = await consultarUm<{ regras: Record<string, boolean> }>(
      "select regras from permissoes_usuarios where usuario_id = $1",
      [operador.usuario_id]
    );
    const concessao = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: {
        tipoPermissao: "usuario",
        usuarioId: operador.usuario_id,
        regras: {
          ...(regrasAtuais?.regras ?? {}),
          entradas_editar: true,
          transferencias_editar: true
        }
      }
    });
    expect([200, 201]).toContain(concessao.statusCode);
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function postOperador(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieCaixa }, payload });
  }
  function putOperador(url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie: cookieCaixa }, payload });
  }

  function corpoSaida(fx: Fixture, marcador: string, extras: Record<string, unknown> = {}) {
    return {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: marcador,
      valorOriginal: VALOR_INJETADO,
      contaOrigemId: fx.contaId,
      ...extras
    };
  }

  async function novaFixture(nome: string): Promise<Fixture> {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: `P0 ${nome} ${sequencia}`
    });
  }

  async function vendaManual(valor: number, marcador: string) {
    const venda = await postOperador("/api/vendas", {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      descricao: marcador,
      valorOriginal: valor
    });
    expect(venda.statusCode, venda.body).toBe(201);
    return json<{ data: { id: string } }>(venda).data.id;
  }

  function fecharCaixaInject(caixaId: string, payload: object = {}) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      headers: { cookie: cookieCaixa },
      payload
    });
  }

  async function segurarContaDoCofre(): Promise<ClienteBloqueador> {
    const bloqueador = await abrirBloqueador();
    await bloqueador.cliente.query("begin");
    await bloqueador.cliente.query("select id from contas where id = $1 for update", [idsTeste.contaCofre]);
    return bloqueador;
  }

  async function contarPorMarcador(tabela: "despesas" | "mercadorias" | "retiradas", marcador: string) {
    const linha = await consultarUm<{ total: string }>(
      `select count(*) as total from ${tabela} where descricao = $1 or observacao = $1`,
      [marcador]
    );
    return Number(linha?.total ?? "0");
  }

  // ------------------------------------------------------------------------------------------
  // B — o fechamento pega o lock primeiro; o lancamento espera, revalida e e RECUSADO sem escrita.
  // RED hoje: a rota espera na FK mas responde 201 e grava em caixa fechado, fora dos totais.
  // ------------------------------------------------------------------------------------------

  type CasoB = {
    nome: string;
    tabela: "despesas" | "mercadorias" | "retiradas" | null;
    disparar: (fx: Fixture, marcador: string) => ReturnType<typeof postOperador>;
    nadaGravado: (fx: Fixture, marcador: string) => Promise<void>;
  };

  const casosB: CasoB[] = [
    {
      nome: "despesa",
      tabela: "despesas",
      disparar: (fx, marcador) =>
        postOperador(
          "/api/despesas",
          corpoSaida(fx, marcador, {
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            fornecedorId: idsTeste.fornecedor
          })
        ),
      nadaGravado: async (_fx, marcador) => expect(await contarPorMarcador("despesas", marcador)).toBe(0)
    },
    {
      nome: "mercadoria",
      tabela: "mercadorias",
      disparar: (fx, marcador) =>
        postOperador(
          "/api/mercadorias",
          corpoSaida(fx, marcador, {
            grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
            fornecedorId: idsTeste.fornecedor
          })
        ),
      nadaGravado: async (_fx, marcador) => expect(await contarPorMarcador("mercadorias", marcador)).toBe(0)
    },
    {
      nome: "retirada",
      tabela: "retiradas",
      disparar: (fx, marcador) =>
        postOperador(
          "/api/retiradas",
          corpoSaida(fx, marcador, {
            grupoRetiradaId: idsTeste.grupoRetiradaSangria,
            fornecedorId: idsTeste.fornecedor
          })
        ),
      nadaGravado: async (_fx, marcador) => expect(await contarPorMarcador("retiradas", marcador)).toBe(0)
    },
    {
      nome: "venda manual",
      tabela: null,
      disparar: (_fx, marcador) =>
        postOperador("/api/vendas", {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          descricao: marcador,
          valorOriginal: VALOR_INJETADO
        }),
      nadaGravado: async (_fx, marcador) => {
        const linha = await consultarUm<{ total: string }>(
          "select count(*) as total from vendas where descricao = $1",
          [marcador]
        );
        expect(Number(linha?.total ?? "0")).toBe(0);
      }
    },
    {
      nome: "transferencia",
      tabela: null,
      disparar: (fx, marcador) =>
        postOperador("/api/transferencias", {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          descricao: marcador,
          valorOriginal: VALOR_INJETADO,
          contaOrigemId: fx.contaId,
          contaDestinoId: idsTeste.contaBanco,
          nLacreDoc: marcador
        }),
      nadaGravado: async (_fx, marcador) => {
        const transferencia = await consultarUm<{ total: string }>(
          "select count(*) as total from transferencias where n_lacre_doc = $1",
          [marcador]
        );
        expect(Number(transferencia?.total ?? "0")).toBe(0);
        const lacre = await consultarUm<{ total: string }>("select count(*) as total from lacres where numero = $1", [
          marcador
        ]);
        expect(Number(lacre?.total ?? "0")).toBe(0);
      }
    }
  ];

  for (const caso of casosB) {
    it(`Deve_Recusar400SemGravar_Quando_OFechamentoVenceACorridaDa_${caso.nome.replace(/ /g, "_")}`, async () => {
      const fx = await novaFixture(`B ${caso.nome}`);
      const marcador = `P0-B-${caso.nome.replace(/ /g, "-")}-${sequencia}`;
      // Entrada de 100 para o saldo ficar positivo: e o retorno final que da ao G-COFRE onde prender.
      await vendaManual(100, `${marcador}-venda-fixture`);
      const universoAntes = await universoDeLancamentos();

      const bloqueador = await segurarContaDoCofre();
      try {
        // O fechamento REAL parte primeiro: toma o `for update` do caixa, calcula os totais e
        // prende no INSERT do retorno final (FK conta_destino_id -> conta do cofre).
        const fechamento = fecharCaixaInject(fx.caixaId);
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);

        // O lancamento chega DEPOIS: precisa entrar na fila atras do fechamento (cadeia nivel 2 —
        // a contagem direta para em 1 porque ele espera o fechamento, nao o gate).
        const lancamento = caso.disparar(fx, marcador);
        expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

        await bloqueador.cliente.query("commit");
        expect((await fechamento).statusCode).toBe(204);

        // A espera sozinha NAO e prova (ja acontece hoje pela FK). Quem decide e o desfecho.
        const resposta = await lancamento;
        expect(resposta.statusCode, resposta.body).toBe(400);
        expect(resposta.body).toContain("Abra um caixa");
      } finally {
        await fecharBloqueador(bloqueador);
      }

      await caso.nadaGravado(fx, marcador);
      if (caso.tabela) expect(await universoDeLancamentos()).toEqual(universoAntes);
      // Os totais congelados nao podem conter o valor injetado em dominio nenhum.
      expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
        status: "fechado",
        total_entradas: "100.00",
        total_despesas: "0.00",
        total_mercadorias: "0.00",
        total_retiradas: "0.00"
      });
    });
  }

  // B-ordem — a SONDA que fixa a ordem "caixa PRIMEIRO, escrita depois" (mata a mutacao de mover o
  // lock para depois do INSERT). RED hoje: a rota ja esta parada no proprio INSERT, segurando
  // RowExclusiveLock em `despesas`.
  it("Deve_TravarOCaixaAntesDeEscrever_Quando_OFechamentoSeguraALinha", async () => {
    const fx = await novaFixture("B ordem");
    const marcador = `P0-B-ordem-${sequencia}`;

    const bloqueador = await abrirBloqueador();
    try {
      // O bloqueador FAZ o papel do fechamento: mesmo lock, mesma mutacao, mesmo commit.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from fechamentos_caixa where id = $1 for ${LOCK_DO_FECHAMENTO}`, [
        fx.caixaId
      ]);

      const lancamento = postOperador(
        "/api/despesas",
        corpoSaida(fx, marcador, {
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor
        })
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);
      // Parada no lock do caixa, a rota nao pode ja segurar lock de ESCRITA em tabela de lancamento.
      expect(await travasDeEscritaDaSessaoBloqueada(bloqueador)).not.toContain("despesas");

      await bloqueador.cliente.query(
        `update fechamentos_caixa
            set status = 'fechado', data_hora_fechamento = now(), fechado_em = now(), fechado_por = $2
          where id = $1 and status = 'aberto'`,
        [fx.caixaId, fx.usuarioId]
      );
      await bloqueador.cliente.query("commit");

      const resposta = await lancamento;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toContain("Abra um caixa");
    } finally {
      await fecharBloqueador(bloqueador);
    }
    expect(await contarPorMarcador("despesas", marcador)).toBe(0);
  });

  // ------------------------------------------------------------------------------------------
  // E1 — o fechamento vence a corrida contra a EDICAO. O RED mais puro de todos: hoje a edicao
  // responde 2xx sem nunca esperar, porque o UPDATE nao toca a linha do caixa.
  // ------------------------------------------------------------------------------------------

  type CasoE1 = {
    nome: string;
    dominio: "despesa" | "mercadoria" | "retirada" | "venda" | "transferencia";
    criar: (fx: Fixture, marcador: string) => Promise<string>;
    editar: (fx: Fixture, id: string, marcador: string) => ReturnType<typeof putOperador>;
    statusEsperado: number;
    // Regex nos casos com acento: a API reacentua o texto da resposta ("correcao" vira "correção").
    mensagemEsperada: string | RegExp;
    totalCongelado: Record<string, string>;
  };

  const casosE1: CasoE1[] = [
    {
      nome: "despesa",
      dominio: "despesa",
      criar: async (fx, marcador) => {
        const criada = await postOperador(
          "/api/despesas",
          corpoSaida(fx, marcador, {
            valorOriginal: 40,
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            fornecedorId: idsTeste.fornecedor
          })
        );
        expect(criada.statusCode, criada.body).toBe(201);
        return json<{ data: { id: string } }>(criada).data.id;
      },
      editar: (fx, id, marcador) =>
        putOperador(
          `/api/despesas/${id}`,
          corpoSaida(fx, `${marcador}-editada`, {
            valorOriginal: 99,
            grupoDespesaId: idsTeste.grupoDespesaOperacional,
            fornecedorId: idsTeste.fornecedor
          })
        ),
      statusEsperado: 403,
      mensagemEsperada: /Caixa fechado: corre/,
      totalCongelado: { total_despesas: "40.00" }
    },
    {
      nome: "mercadoria",
      dominio: "mercadoria",
      criar: async (fx, marcador) => {
        const criada = await postOperador(
          "/api/mercadorias",
          corpoSaida(fx, marcador, {
            valorOriginal: 40,
            grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
            fornecedorId: idsTeste.fornecedor
          })
        );
        expect(criada.statusCode, criada.body).toBe(201);
        return json<{ data: { id: string } }>(criada).data.id;
      },
      editar: (fx, id, marcador) =>
        putOperador(
          `/api/mercadorias/${id}`,
          corpoSaida(fx, `${marcador}-editada`, {
            valorOriginal: 99,
            grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
            fornecedorId: idsTeste.fornecedor
          })
        ),
      statusEsperado: 403,
      mensagemEsperada: /Caixa fechado: corre/,
      totalCongelado: { total_mercadorias: "40.00" }
    },
    {
      nome: "retirada",
      dominio: "retirada",
      criar: async (fx, marcador) => {
        const criada = await postOperador(
          "/api/retiradas",
          corpoSaida(fx, marcador, {
            valorOriginal: 40,
            grupoRetiradaId: idsTeste.grupoRetiradaSangria,
            fornecedorId: idsTeste.fornecedor
          })
        );
        expect(criada.statusCode, criada.body).toBe(201);
        return json<{ data: { id: string } }>(criada).data.id;
      },
      editar: (fx, id, marcador) =>
        putOperador(
          `/api/retiradas/${id}`,
          corpoSaida(fx, `${marcador}-editada`, {
            valorOriginal: 99,
            grupoRetiradaId: idsTeste.grupoRetiradaSangria,
            fornecedorId: idsTeste.fornecedor
          })
        ),
      statusEsperado: 403,
      mensagemEsperada: /Caixa fechado: corre/,
      totalCongelado: { total_retiradas: "40.00" }
    },
    {
      nome: "venda",
      dominio: "venda",
      criar: async (_fx, marcador) => {
        const criada = await postOperador("/api/vendas", {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          descricao: marcador,
          valorOriginal: 40
        });
        expect(criada.statusCode, criada.body).toBe(201);
        return json<{ data: { id: string } }>(criada).data.id;
      },
      editar: (_fx, id, marcador) =>
        putOperador(`/api/vendas/${id}`, {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          descricao: `${marcador}-editada`,
          valorOriginal: 99
        }),
      statusEsperado: 400,
      mensagemEsperada: "Abra um caixa",
      totalCongelado: { total_entradas: "140.00" }
    },
    {
      nome: "transferencia",
      dominio: "transferencia",
      criar: async (fx, marcador) => {
        const criada = await postOperador("/api/transferencias", {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          descricao: marcador,
          valorOriginal: 40,
          contaOrigemId: fx.contaId,
          contaDestinoId: idsTeste.contaBanco,
          nLacreDoc: marcador
        });
        expect(criada.statusCode, criada.body).toBe(201);
        return json<{ data: { id: string } }>(criada).data.id;
      },
      editar: (fx, id, marcador) =>
        putOperador(`/api/transferencias/${id}`, {
          empresaId: idsTeste.empresaA,
          dataReferencia: hoje,
          descricao: `${marcador}-editada`,
          valorOriginal: 99,
          contaOrigemId: fx.contaId,
          contaDestinoId: idsTeste.contaBanco,
          nLacreDoc: marcador
        }),
      statusEsperado: 400,
      mensagemEsperada: "Abra um caixa",
      totalCongelado: { total_transferencias_saida: "100.00" }
    }
  ];

  for (const caso of casosE1) {
    it(`Deve_RecusarSemEscrever_Quando_OFechamentoVenceAEdicaoDe_${caso.nome}`, async () => {
      const fx = await novaFixture(`E1 ${caso.nome}`);
      const marcador = `P0-E1-${caso.nome}-${sequencia}`;
      const id = await caso.criar(fx, marcador);
      // Entrada de 100 garante saldo > 0 (com a transferencia de 40 em saida, sobra 60).
      await vendaManual(100, `${marcador}-venda-fixture`);
      const snapshotAntes = await snapshotDoLancamento(caso.dominio, id);

      const bloqueador = await segurarContaDoCofre();
      try {
        const fechamento = fecharCaixaInject(fx.caixaId);
        expect(await esperarBloqueioPor(bloqueador)).toBe(true);

        const edicao = caso.editar(fx, id, marcador);
        // Hoje a edicao NEM espera (nao ha lock em comum) — esta linha e o RED mais direto.
        expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

        await bloqueador.cliente.query("commit");
        expect((await fechamento).statusCode).toBe(204);

        const resposta = await edicao;
        expect(resposta.statusCode, resposta.body).toBe(caso.statusEsperado);
        expect(resposta.body).toContain(caso.mensagemEsperada);
      } finally {
        await fecharBloqueador(bloqueador);
      }

      // O registro tem de sair da corrida EXATAMENTE como estava antes dela.
      expect(await snapshotDoLancamento(caso.dominio, id)).toEqual(snapshotAntes);
      expect(await universoDoCaixa(fx.caixaId)).toMatchObject({ status: "fechado", ...caso.totalCongelado });
    });
  }

  // ------------------------------------------------------------------------------------------
  // A — o lancamento pega o lock primeiro; o fechamento ESPERA e o INCLUI nos totais congelados.
  // Verde hoje por acidente (FK); existe para matar as mutacoes no lado do fechamento (remover o
  // `for update` ou calcular os totais antes do lock).
  // ------------------------------------------------------------------------------------------

  it("Deve_EsperarEIncluirNoTotal_Quando_OLancamentoVenceACorrida", async () => {
    const fx = await novaFixture("A despesa");
    const marcador = `P0-A-${sequencia}`;

    const bloqueador = await abrirBloqueador();
    try {
      // G-ITEM: prende o INSERT da FILHA (despesas_itens -> patrimonio_itens). A raiz ja foi
      // inserida e o lock do caixa ja foi tomado — determinismo independente da ordem dos RI checks.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from patrimonio_itens where id = $1 for update", [
        idsTeste.patrimonioItemForno
      ]);

      const lancamento = postOperador(
        "/api/despesas",
        corpoSaida(fx, marcador, {
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor,
          itensDespesa: [
            {
              descricao: "Item P0",
              valor: VALOR_INJETADO,
              quantidade: 1,
              valorUnitario: VALOR_INJETADO,
              patrimonioItemId: idsTeste.patrimonioItemForno
            }
          ]
        })
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      // O fechamento chega depois e tem de ENTRAR NA FILA atras do lancamento em voo.
      const fechamento = fecharCaixaInject(fx.caixaId, { observacao: "quebra do cenario A" });
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await lancamento).statusCode).toBe(201);
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // A assercao decisiva e o TOTAL (a espera sozinha nao mata a mutacao "calcular antes do lock").
    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_despesas: "55.00",
      saldo: "-55.00",
      quebras: 1
    });
  });

  // ------------------------------------------------------------------------------------------
  // E2 — a EDICAO vence a corrida; o fechamento espera e congela o valor EDITADO.
  // RED hoje: o fechamento nao espera e congela 40 enquanto a edicao commita 55.
  // ------------------------------------------------------------------------------------------

  it("Deve_CongelarOValorEditado_Quando_AEdicaoVenceACorrida", async () => {
    const fx = await novaFixture("E2 despesa");
    const marcador = `P0-E2-${sequencia}`;
    const criada = await postOperador(
      "/api/despesas",
      corpoSaida(fx, marcador, {
        valorOriginal: 40,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor,
        itensDespesa: [
          {
            descricao: "Item P0",
            valor: 40,
            quantidade: 1,
            valorUnitario: 40,
            patrimonioItemId: idsTeste.patrimonioItemForno
          }
        ]
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from patrimonio_itens where id = $1 for update", [
        idsTeste.patrimonioItemForno
      ]);

      const edicao = putOperador(
        `/api/despesas/${id}`,
        corpoSaida(fx, `${marcador}-editada`, {
          valorOriginal: VALOR_INJETADO,
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor,
          itensDespesa: [
            {
              descricao: "Item P0",
              valor: VALOR_INJETADO,
              quantidade: 1,
              valorUnitario: VALOR_INJETADO,
              patrimonioItemId: idsTeste.patrimonioItemForno
            }
          ]
        })
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      const fechamento = fecharCaixaInject(fx.caixaId, { observacao: "quebra do cenario E2" });
      expect(await esperarCadeiaDeBloqueio(bloqueador, 2)).toBe(true);

      await bloqueador.cliente.query("commit");
      expect((await edicao).statusCode).toBe(200);
      expect((await fechamento).statusCode).toBe(204);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(await universoDoCaixa(fx.caixaId)).toMatchObject({
      status: "fechado",
      total_despesas: "55.00",
      saldo: "-55.00"
    });
  });

  // ------------------------------------------------------------------------------------------
  // C — paralelismo preservado: `FOR SHARE` compartilha com `FOR SHARE`. Mata a mutacao que troca
  // o lock do lancamento por um exclusivo (serializaria lancamento x lancamento).
  // ------------------------------------------------------------------------------------------

  it("Deve_CompletarSemEsperar_Quando_OutrosDoisShareSeguramOCaixa", async () => {
    const fx = await novaFixture("C paralelo");
    const marcador = `P0-C-${sequencia}`;

    const primeiro = await abrirBloqueador();
    const segundo = await abrirBloqueador();
    try {
      await primeiro.cliente.query("begin");
      await primeiro.cliente.query(`select id from fechamentos_caixa where id = $1 for ${LOCK_DO_LANCAMENTO}`, [
        fx.caixaId
      ]);
      await segundo.cliente.query("begin");
      await segundo.cliente.query(`select id from fechamentos_caixa where id = $1 for ${LOCK_DO_LANCAMENTO}`, [
        fx.caixaId
      ]);
      // Os dois locks compartilhados foram CONCEDIDOS ao mesmo tempo.
      expect(await sessoesBloqueadasPor(primeiro)).toBe(0);
      expect(await sessoesBloqueadasPor(segundo)).toBe(0);

      const lancamento = postOperador(
        "/api/despesas",
        corpoSaida(fx, marcador, {
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor
        })
      );
      // Prova NEGATIVA: a rota completa sem entrar na fila de nenhum dos dois.
      expect(await esperarBloqueioPor(primeiro, 1, 3_000)).toBe(false);
      const resposta = await lancamento;
      expect(resposta.statusCode, resposta.body).toBe(201);
      expect(await sessoesBloqueadasPor(primeiro)).toBe(0);
      expect(await sessoesBloqueadasPor(segundo)).toBe(0);
    } finally {
      await fecharBloqueador(primeiro);
      await fecharBloqueador(segundo);
    }
  });

  // ------------------------------------------------------------------------------------------
  // G — o NIVEL do lock (mata a mutacao FOR SHARE -> FOR KEY SHARE, que o plano dava como
  // sobrevivente). `SHARE` conflita com `NO KEY UPDATE` (o nivel de alterarHorario/editarAbertura);
  // `KEY SHARE` — e o comportamento de hoje, sem lock nenhum — convive e nao espera.
  // ------------------------------------------------------------------------------------------

  it("Deve_EsperarPorNoKeyUpdate_Quando_OLancamentoTravaOCaixaComShare", async () => {
    const fx = await novaFixture("G nivel");
    const marcador = `P0-G-${sequencia}`;

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from fechamentos_caixa where id = $1 for no key update", [fx.caixaId]);

      const lancamento = postOperador(
        "/api/despesas",
        corpoSaida(fx, marcador, {
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor
        })
      );
      // So o `FOR SHARE` espera aqui; sem lock (hoje) ou com `KEY SHARE`, a rota passa direto.
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query("rollback");
      const resposta = await lancamento;
      expect(resposta.statusCode, resposta.body).toBe(201);
    } finally {
      await fecharBloqueador(bloqueador);
    }
    expect(await contarPorMarcador("despesas", marcador)).toBe(1);
  });
});

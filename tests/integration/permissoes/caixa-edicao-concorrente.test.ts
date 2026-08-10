import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  aindaPendente,
  consultarUm,
  esperarBloqueioPor,
  executarSql,
  fecharBloqueador,
  json,
  sessoesBloqueadasPor,
  snapshotDoLancamento
} from "../../setup/integracao.js";

// CX-M06 — a EXCECAO DE LEGADO tem de ser atomica.
//
// A excecao (retirada que conserva colaborador; despesa com o par de credores intacto) e decidida
// comparando o payload com o registro GRAVADO. Enquanto a leitura desse registro nao tinha lock, a
// janela era: T1 e T2 leem o mesmo legado → T1 moderniza e commita → T2 valida contra o retrato
// VELHO, passa, e reintroduz o credor legado por cima do registro ja saneado. Na retirada isso
// tambem RECRIA `debitos_colaboradores` — ressuscita divida de funcionario ja quitada.
//
// Aqui a corrida e deterministica: um cliente proprio segura a linha com o MESMO lock que a rota
// pega, e o bloqueio da rota e observado pelo banco (`pg_blocking_pids`), nao por sleep.

// Espelha o nivel usado por `travar*Repository`. Para exercitar a mutacao do NIVEL do lock, troque
// aqui e em producao ao mesmo tempo: com `update` dos dois lados, o teste do nivel fica vermelho.
const NIVEL_DO_LOCK = "no key update";

describe("CX-M06 - a excecao de legado e atomica", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieMultiempresa = "";
  let cookieCaixa = "";
  let contaDoPdv = "";
  const hoje = "2026-08-01";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieMultiempresa, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "multiempresa"),
      cookieSessao(contexto.app, "caixa")
    ]);

    // O operador PRECISA de caixa aberto proprio. Sem isto, `obterCaixaParaLancamento` estoura antes
    // de qualquer regra e todo 403 vira "Caixa fechado" — foi assim que o teste da mercadoria
    // passou verde sem nunca alcancar a checagem da conta gravada.
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario caixa nao encontrado");

    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta PDV concorrencia" }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    contaDoPdv = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV concorrencia", contaId: contaDoPdv, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);

    const abertura = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: json<{ data: { id: string } }>(pdv).data.id,
        usuarioCaixaId: usuario.id,
        dataHoraAbertura: "2026-07-31T08:00"
      }
    });
    expect(abertura.statusCode, abertura.body).toBe(201);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }
  function put(url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie: cookieAdmin }, payload });
  }

  const corpo = (descricao: string, extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao,
    valorOriginal: 10,
    contaOrigemId: idsTeste.contaBanco,
    ...extras
  });

  it("Deve_NaoReintroduzirColaborador_Quando_OutraTransacaoModernizaARetiradaLegada", async () => {
    const criada = await post(
      "/api/retiradas",
      corpo("CX-M06 corrida retirada", {
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Estado LEGADO: credor colaborador, como a 0020 permitia.
    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );

    const bloqueador = await abrirBloqueador();
    try {
      // T1 segura a linha com o MESMO lock da rota e ainda NAO commitou.
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from retiradas where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      // T2 chega pela rota real, mandando o colaborador que ainda esta gravado. Se a rota validasse
      // com um retrato lido antes do lock, isto passaria.
      const edicao = put(
        `/api/retiradas/${id}`,
        corpo("CX-M06 corrida retirada T2", {
          grupoRetiradaId: idsTeste.grupoRetiradaSangria,
          colaboradorId: idsTeste.colaboradorCaixa
        })
      );

      // A rota TEM de estar esperando pelo lock — provado pelo banco, e nao por tempo.
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);
      expect(await aindaPendente(edicao)).toBe(true);

      // T1 moderniza e commita: a retirada deixa de ser de colaborador.
      await bloqueador.cliente.query(
        "update retiradas set colaborador_id = null, fornecedor_id = $2, credor_tipo = 'fornecedor' where id = $1",
        [id, idsTeste.fornecedor]
      );
      await bloqueador.cliente.query("commit");

      // T2 so agora prossegue, e relê sob o lock: o registro nao e mais legado → R-128 recusa.
      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toContain("R-128");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // Estado final: modernizado, sem colaborador e SEM divida ressuscitada.
    expect(
      await consultarUm<{ colaborador_id: string | null; fornecedor_id: string; credor_tipo: string }>(
        "select colaborador_id, fornecedor_id, credor_tipo from retiradas where id = $1",
        [id]
      )
    ).toMatchObject({ colaborador_id: null, fornecedor_id: idsTeste.fornecedor, credor_tipo: "fornecedor" });

    const debitos = await consultarUm<{ total: string }>(
      "select count(*) as total from debitos_colaboradores where retirada_id = $1",
      [id]
    );
    expect(Number(debitos?.total ?? "0")).toBe(0);
  });

  it("Deve_NaoRecriarOParIncoerente_Quando_OutraTransacaoResolveADespesaLegada", async () => {
    const criada = await post(
      "/api/despesas",
      corpo("CX-M06 corrida despesa", {
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Estado LEGADO: os dois ids e `credor_tipo` nulo.
    await executarSql("update despesas set colaborador_id = $2, credor_tipo = null where id = $1", [
      id,
      idsTeste.colaboradorCaixa
    ]);

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from despesas where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      // T2 devolve o par intacto — o que a excecao de legado permite, contra o retrato VELHO.
      const edicao = put(
        `/api/despesas/${id}`,
        corpo("CX-M06 corrida despesa T2", {
          valorOriginal: 5000,
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor,
          colaboradorId: idsTeste.colaboradorCaixa
        })
      );

      expect(await esperarBloqueioPor(bloqueador)).toBe(true);
      expect(await aindaPendente(edicao)).toBe(true);

      // T1 resolve o par: fica so o fornecedor.
      await bloqueador.cliente.query(
        "update despesas set colaborador_id = null, credor_tipo = 'fornecedor' where id = $1",
        [id]
      );
      await bloqueador.cliente.query("commit");

      // Sob o lock, o par ja nao esta intacto → a despesa nao pode voltar a ter dois credores.
      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(400);
      expect(resposta.body).toContain("um credor so");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ colaborador_id: string | null; credor_tipo: string; valor_original: string }>(
        "select colaborador_id, credor_tipo, valor_original from despesas where id = $1",
        [id]
      )
    ).toMatchObject({ colaborador_id: null, credor_tipo: "fornecedor", valor_original: "10.00" });

    // A divida do colaborador que nao era credor nao pode ter sido recriada nem revalorada.
    const debitos = await consultarUm<{ total: string }>(
      "select count(*) as total from debitos_colaboradores where despesa_id = $1",
      [id]
    );
    expect(Number(debitos?.total ?? "0")).toBe(0);
  });

  // O lock e escopado por EMPRESA. Sem isso, um PUT que aponta outra empresa trava a linha alheia e
  // FICA ESPERANDO quando ela esta em edicao — os 404 sao iguais, mas a LATENCIA vira oraculo de
  // existencia cross-tenant.
  //
  // O ator e o `multiempresa`, ligado as DUAS empresas no seed: com o `admin` (so empresa A) o
  // controller responde 403 `FORBIDDEN_COMPANY` em `despesas.controller.ts` e a requisicao **nunca
  // chega ao repositorio** — foi assim que a primeira versao deste teste passou verde ate com o
  // escopo removido do lock. Aqui o controller libera, o service roda, e quem recusa e o proprio
  // lock escopado.
  it("Deve_Recusar404SemEsperarOLock_Quando_OPutApontaOutraEmpresa", async () => {
    const criada = await post(
      "/api/despesas",
      corpo("CX-M06 lock cross-tenant", {
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from despesas where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      // A despesa e da empresa A; o corpo diz empresa B. O lock escopado nao acha linha nenhuma.
      const invasao = contexto.app.inject({
        method: "PUT",
        url: `/api/despesas/${id}`,
        headers: { cookie: cookieMultiempresa },
        payload: corpo("CX-M06 invasao", {
          empresaId: idsTeste.empresaB,
          grupoDespesaId: idsTeste.grupoDespesaOperacional
        })
      });

      // A PROVA: ninguem chega a esperar por este bloqueador, e a resposta chega COM ele ainda
      // segurando a linha. Sem o escopo no `where`, o lock acharia a linha da empresa A, a sessao
      // apareceria em `pg_blocking_pids` e o `await` abaixo so voltaria depois do `commit`.
      //
      // `aindaPendente` NAO serve aqui: ela mede um unico tick de macrotask, e qualquer requisicao
      // com ida ao banco atravessa varios — daria "pendente" mesmo sem contencao nenhuma.
      expect(await esperarBloqueioPor(bloqueador, 1, 3_000)).toBe(false);
      const resposta = await invasao;
      expect(resposta.statusCode, resposta.body).toBe(404);
      expect(await sessoesBloqueadasPor(bloqueador)).toBe(0);
    } finally {
      await fecharBloqueador(bloqueador);
    }
  });

  // A DISCRIMINACAO escreve as mesmas tabelas e decide contra o registro gravado (a soma conferida e
  // a R-135). Sem lock, ela lia ANTES e desfazia por tras o que uma edicao concorrente saneou.
  //
  // "Esperar o lock" NAO prova nada aqui: sem o lock explicito a discriminacao espera do mesmo
  // jeito, porque termina com `UPDATE despesas`, que trava sozinho. O que distingue os dois casos e
  // QUANDO ela le o `valorOriginal` — antes ou depois da trava. Por isso a prova e a CONFERENCIA DA
  // SOMA: T1 sobe o valor para 500, e itens que somam 100 so podem ser recusados se a leitura tiver
  // acontecido sob o lock.
  it("Deve_ConferirASomaContraOValorPosLock_Quando_ADiscriminacaoConcorreComAEdicao", async () => {
    const criada = await post(
      "/api/despesas",
      corpo("CX-M06 discriminacao concorrente", {
        valorOriginal: 100,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from despesas where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      const discriminacao = contexto.app.inject({
        method: "PATCH",
        url: `/api/despesas/${id}/discriminar`,
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          itensDespesa: [
            {
              descricao: "Item",
              valor: 100,
              quantidade: 1,
              valorUnitario: 100,
              patrimonioItemId: idsTeste.patrimonioItemForno
            }
          ]
        }
      });

      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      // T1 sobe o valor do cabecalho e commita.
      await bloqueador.cliente.query("update despesas set valor_original = 500 where id = $1", [id]);
      await bloqueador.cliente.query("commit");

      // Sob o lock, a discriminacao le 500 e recusa a soma de 100. Sem o lock, ela ja tinha lido 100,
      // aprova, e grava itens que nao batem com o cabecalho — o D5 furado em silencio.
      // Nao basta "algum 4xx": tem de ser a CONFERENCIA DA SOMA, e contra o valor que so existe
      // depois do commit de T1. Sem afirmar o codigo e o `valorLancamento`, um 400 da R-135 ou de
      // referencia invalida satisfaria o teste sem provar leitura sob o lock.
      const resposta = await discriminacao;
      assertProblem(resposta, 422, "DISCRIMINACAO_DIVERGENTE");
      expect(json<{ details: { valorLancamento: number } }>(resposta).details.valorLancamento).toBe(500);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    // E nada de item gravado.
    const itens = await consultarUm<{ total: string }>(
      "select count(*) as total from despesas_itens where despesa_id = $1",
      [id]
    );
    expect(Number(itens?.total ?? "0")).toBe(0);
  });

  // A MERCADORIA nao tem excecao de credor legado, mas tem a mesma janela: a edicao valida
  // `dataPagamento` e a conta contra o registro gravado. Sem o lock, a linha continuaria sem teste
  // nenhum — remover a chamada deixava a suite inteira verde.
  /** Cria uma mercadoria do OPERADOR, na conta do PDV do caixa que ele tem aberto. */
  async function mercadoriaDoOperador(descricao: string) {
    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/mercadorias",
      headers: { cookie: cookieCaixa },
      payload: corpo(descricao, {
        contaOrigemId: contaDoPdv,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        fornecedorId: idsTeste.fornecedor
      })
    });
    expect(criada.statusCode, criada.body).toBe(201);
    return json<{ data: { id: string } }>(criada).data.id;
  }

  /** Sem `contaOrigemId` DE VERDADE: o helper `corpo` injeta uma conta por padrao. */
  function editarMercadoriaSemConta(id: string, descricao: string) {
    return contexto.app.inject({
      method: "PUT",
      url: `/api/mercadorias/${id}`,
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: hoje,
        dataVencimento: hoje,
        descricao,
        valorOriginal: 10,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        fornecedorId: idsTeste.fornecedor
      }
    });
  }

  it("Deve_ConferirAContaPosLock_Quando_AMercadoriaConcorreComOReapontamentoDoPdv", async () => {
    const id = await mercadoriaDoOperador("CX-M06 mercadoria concorrente");

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from mercadorias where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      const edicao = editarMercadoriaSemConta(id, "CX-M06 mercadoria concorrente alterada");
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      // T1 tira a conta gravada de baixo do registro. Sob o lock, a edicao le a conta NOVA.
      await bloqueador.cliente.query("update mercadorias set conta_origem_id = $2 where id = $1", [
        id,
        idsTeste.contaLivre
      ]);
      await bloqueador.cliente.query("commit");

      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(403);
      // A MENSAGEM importa: sem ela, o 403 de "Caixa fechado" satisfazia este teste — e foi o que
      // aconteceu enquanto o operador nao tinha caixa aberto neste arquivo. O prefixo vai ate antes
      // do primeiro acento porque a API reacentua o `title` da resposta.
      expect(resposta.body).toContain("Conta do lan");
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ conta_origem_id: string }>("select conta_origem_id from mercadorias where id = $1", [id])
    ).toMatchObject({ conta_origem_id: idsTeste.contaLivre });
  });

  // O CONTRASTE, que e o que torna o caso acima uma medida: mesmo fluxo, mesma espera pelo lock, e
  // T1 NAO mexe na conta. Se o 403 viesse de outra regra, este aqui tambem falharia.
  it("Deve_Aceitar_Quando_AMercadoriaEsperaOLockEAContaSegueSendoADoPdv", async () => {
    const id = await mercadoriaDoOperador("CX-M06 mercadoria sem reapontar");

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from mercadorias where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      const edicao = editarMercadoriaSemConta(id, "CX-M06 mercadoria sem reapontar corrigida");
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query("commit");

      const resposta = await edicao;
      expect(resposta.statusCode, resposta.body).toBe(200);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    expect(
      await consultarUm<{ conta_origem_id: string; descricao: string }>(
        "select conta_origem_id, descricao from mercadorias where id = $1",
        [id]
      )
    ).toMatchObject({ conta_origem_id: contaDoPdv, descricao: "CX-M06 mercadoria sem reapontar corrigida" });
  });

  // O NIVEL do lock, que ate aqui era so afirmacao no docstring: `NO KEY UPDATE` nao pode bloquear
  // quem escreve apenas nas FILHAS. Um INSERT em `debitos_colaboradores` referenciando a despesa
  // pega `FOR KEY SHARE` na raiz — que convive com `NO KEY UPDATE` e conflitaria com `FOR UPDATE`.
  // Trocar o nivel do lock em producao faz este teste travar ate o `lock_timeout`.
  it("Deve_NaoBloquearEscritaDeFilha_Quando_ARaizEstaTravadaPelaEdicao", async () => {
    const criada = await post(
      "/api/despesas",
      corpo("CX-M06 nivel do lock", {
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // A sessao segura `FOR KEY SHARE` — exatamente o lock que o Postgres toma ao inserir uma FILHA
    // (`debitos_colaboradores`) apontando esta despesa.
    const filha = await abrirBloqueador();
    try {
      await filha.cliente.query("begin");
      await filha.cliente.query("select id from despesas where id = $1 for key share", [id]);

      // A EDICAO REAL tem de passar por cima disso. `NO KEY UPDATE` convive com `KEY SHARE`;
      // `FOR UPDATE` conflitaria e a rota ficaria presa ate o commit da filha.
      const edicao = await put(
        `/api/despesas/${id}`,
        corpo("CX-M06 nivel do lock corrigido", {
          valorOriginal: 21,
          grupoDespesaId: idsTeste.grupoDespesaOperacional,
          fornecedorId: idsTeste.fornecedor
        })
      );
      expect(edicao.statusCode, edicao.body).toBe(200);
      expect(await sessoesBloqueadasPor(filha)).toBe(0);
    } finally {
      await fecharBloqueador(filha);
    }
  });

  // A recusa da corrida nao pode deixar rastro: o registro tem de sair EXATAMENTE como T1 o deixou.
  it("Deve_PreservarOSnapshotIntegral_Quando_ACorridaERecusada", async () => {
    const criada = await post(
      "/api/retiradas",
      corpo("CX-M06 corrida snapshot", {
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query(`select id from retiradas where id = $1 for ${NIVEL_DO_LOCK}`, [id]);

      const edicao = put(
        `/api/retiradas/${id}`,
        corpo("CX-M06 corrida snapshot T2", {
          grupoRetiradaId: idsTeste.grupoRetiradaSangria,
          colaboradorId: idsTeste.colaboradorCaixa
        })
      );
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      await bloqueador.cliente.query(
        "update retiradas set colaborador_id = null, fornecedor_id = $2, credor_tipo = 'fornecedor' where id = $1",
        [id, idsTeste.fornecedor]
      );
      await bloqueador.cliente.query("commit");
      expect((await edicao).statusCode).toBe(400);
    } finally {
      await fecharBloqueador(bloqueador);
    }

    const antes = await snapshotDoLancamento("retirada", id);
    // Uma segunda tentativa recusada nao pode mover nem `atualizado_em` nem as derivadas.
    const segunda = await put(
      `/api/retiradas/${id}`,
      corpo("CX-M06 corrida snapshot T3", {
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    expect(segunda.statusCode, segunda.body).toBe(400);
    expect(await snapshotDoLancamento("retirada", id)).toEqual(antes);
  });
});

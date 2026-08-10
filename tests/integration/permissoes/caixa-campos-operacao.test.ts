import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// CX-M06 — B-04 (credor conforme a categoria) e B-05 (conta do operador de Caixa, R-121) pela
// rota real.
//
// O que este arquivo acrescenta ao `caixa-lanca-saidas.test.ts`, que ja provava o caminho feliz e a
// recusa da conta errada:
//  - AUSENCIA DE ESCRITA em cada recusa (o outro so olhava o status);
//  - conta de OUTRA EMPRESA nas tres saidas (nao havia teste nenhum);
//  - o contrato real da mercadoria diante de colaborador / credor incompativel;
//  - a mensagem OFICIAL de "sem caixa aberto";
//  - o PUT que zerava a conta travada quando o corpo vinha sem `contaOrigemId`.
const CONTA_OUTRA_EMPRESA = "33333333-3333-4333-8333-333333333202";
const FORNECEDOR_OUTRA_EMPRESA = "33333333-3333-4333-8333-333333333203";

describe("CX-M06 - campos operacionais do caixa pela rota real", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let caixaId = "";
  let contaDoPdv = "";
  let pdvId = "";
  const hoje = "2026-08-01";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);

    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario caixa nao encontrado");

    // Conta + PDV proprios: o pdvA do seed ja tem caixa aberto e o periodo colidiria.
    const conta = await contexto.app.inject({
      method: "POST",
      url: "/api/contas",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Conta PDV CX-M06" }
    });
    expect(conta.statusCode, conta.body).toBe(201);
    contaDoPdv = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await contexto.app.inject({
      method: "POST",
      url: "/api/pdvs",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "PDV CX-M06", contaId: contaDoPdv, ativo: true }
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const abertura = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieCaixa },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId,
        usuarioCaixaId: usuario.id,
        dataHoraAbertura: "2026-07-31T08:00"
      }
    });
    expect(abertura.statusCode, abertura.body).toBe(201);
    caixaId = json<{ data: { id: string } }>(abertura).data.id;

    // Conta da empresa B: o seed nao tem nenhuma, e ela e a fixture do teste cross-tenant. Vai por
    // SQL para nao depender de o admin ter acesso de escrita na outra empresa.
    await executarSql("insert into contas (id, empresa_id, nome) values ($1, $2, $3)", [
      CONTA_OUTRA_EMPRESA,
      idsTeste.empresaB,
      "Conta da empresa B"
    ]);
    // Fornecedor da empresa B: a FK de `retiradas.fornecedor_id` e global, entao o id e valido e so
    // a checagem de empresa separa as duas padarias.
    await executarSql("insert into fornecedores (id, empresa_id, nome) values ($1, $2, $3)", [
      FORNECEDOR_OUTRA_EMPRESA,
      idsTeste.empresaB,
      "Fornecedor da empresa B"
    ]);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  function post(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }
  function put(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie }, payload });
  }

  /** Quantas linhas com esta descricao existem nas TRES saidas. Prova de ausencia de escrita. */
  async function gravadas(descricao: string) {
    const linhas = await consultarTodos<{ total: string }>(
      `select (select count(*) from despesas where descricao = $1)
            + (select count(*) from mercadorias where descricao = $1)
            + (select count(*) from retiradas where descricao = $1) as total`,
      [descricao]
    );
    return Number(linhas[0]?.total ?? "0");
  }

  const SAIDAS = [
    ["despesa", "/api/despesas", { grupoDespesaId: idsTeste.grupoDespesaOperacional }],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "retirada",
      "/api/retiradas",
      // R-128: retirada NOVA e de fornecedor ou socio/gestor. Criar as fixtures felizes com
      // colaborador transformava o caminho proibido em contrato de teste.
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const;

  const corpo = (descricao: string, extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao,
    valorOriginal: 10,
    ...extras
  });

  // ===== B-05 — a conta do operador vem do PDV ===============================================

  it.each(SAIDAS)("Deve_GravarComAContaDoPdv_Quando_OperadorTemCaixaAberto (%s)", async (nome, rota, extras) => {
    const descricao = `CX-M06 feliz ${nome}`;
    const resposta = await post(cookieCaixa, rota, corpo(descricao, { contaOrigemId: contaDoPdv, ...extras }));
    expect(resposta.statusCode, resposta.body).toBe(201);

    const { id } = json<{ data: { id: string } }>(resposta).data;
    const tabela = `${nome}s`;
    const gravado = await consultarUm<{ conta_origem_id: string; caixa_id: string }>(
      `select conta_origem_id, caixa_id from ${tabela} where id = $1`,
      [id]
    );
    expect(gravado).toMatchObject({ conta_origem_id: contaDoPdv, caixa_id: caixaId });
  });

  it.each(SAIDAS)("Deve_RecusarSemGravar_Quando_OperadorEnviaOutraConta (%s)", async (nome, rota, extras) => {
    const descricao = `CX-M06 outra conta ${nome}`;
    const resposta = await post(cookieCaixa, rota, corpo(descricao, { contaOrigemId: idsTeste.contaBanco, ...extras }));

    assertProblem(resposta, 400);
    expect(resposta.body).toContain("conta do PDV aberto");
    expect(await gravadas(descricao)).toBe(0);
  });

  // O cross-tenant tem de ser provado pela RETAGUARDA, e nao pelo operador: para o operador a trava
  // da R-121 recusa qualquer conta que nao seja a do PDV, e a conta da outra empresa morreria ali
  // sem nunca exercitar `validarConta`. Achado por mutacao — desligar a checagem de empresa deixava
  // a versao anterior deste teste, feita com o operador, passar do mesmo jeito.
  it.each(SAIDAS)("Deve_RecusarSemGravar_Quando_ContaEDeOutraEmpresa (%s)", async (nome, rota, extras) => {
    const descricao = `CX-M06 cross-tenant ${nome}`;
    const resposta = await post(cookieAdmin, rota, corpo(descricao, { contaOrigemId: CONTA_OUTRA_EMPRESA, ...extras }));

    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Conta de origem");
    expect(await gravadas(descricao)).toBe(0);
  });

  it("Deve_PreencherComAContaDoPdv_Quando_OperadorNaoInformaConta", async () => {
    const descricao = "CX-M06 sem conta no corpo";
    const resposta = await post(
      cookieCaixa,
      "/api/despesas",
      corpo(descricao, { grupoDespesaId: idsTeste.grupoDespesaOperacional })
    );
    expect(resposta.statusCode, resposta.body).toBe(201);

    const { id } = json<{ data: { id: string } }>(resposta).data;
    expect(
      await consultarUm<{ conta_origem_id: string }>("select conta_origem_id from despesas where id = $1", [id])
    ).toMatchObject({ conta_origem_id: contaDoPdv });
  });

  // O PUT nao pode ser a porta dos fundos: sem `contaOrigemId` no corpo o registro perdia a conta e
  // continuava com `caixa_id`. O valor sumia do saldo da conta e permanecia no fechamento do caixa —
  // a divergencia que a R-121 existe para impedir, invertida. As TRES saidas receberam a mesma
  // correcao, entao as tres sao provadas.
  it.each(SAIDAS)("Deve_ManterAContaDoPdv_Quando_OperadorEditaSemInformarConta (%s)", async (nome, rota, extras) => {
    const criada = await post(
      cookieCaixa,
      rota,
      corpo(`CX-M06 edicao sem conta ${nome}`, { contaOrigemId: contaDoPdv, ...extras })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieCaixa,
      `${rota}/${id}`,
      corpo(`CX-M06 edicao sem conta corrigida ${nome}`, { valorOriginal: 42, ...extras })
    );
    expect(editada.statusCode, editada.body).toBe(200);

    expect(
      await consultarUm<{ conta_origem_id: string | null }>(`select conta_origem_id from ${nome}s where id = $1`, [id])
    ).toMatchObject({ conta_origem_id: contaDoPdv });
  });

  it.each(SAIDAS)("Deve_RecusarSemAlterar_Quando_OperadorEditaApontandoOutraConta (%s)", async (nome, rota, extras) => {
    const criada = await post(
      cookieCaixa,
      rota,
      corpo(`CX-M06 put conta errada ${nome}`, { contaOrigemId: contaDoPdv, ...extras })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieCaixa,
      `${rota}/${id}`,
      corpo(`CX-M06 put conta errada alterada ${nome}`, { contaOrigemId: idsTeste.contaBanco, ...extras })
    );
    assertProblem(editada, 403);

    // Registro anterior INTEIRO, nao so a contagem.
    expect(
      await consultarUm<{ conta_origem_id: string; descricao: string }>(
        `select conta_origem_id, descricao from ${nome}s where id = $1`,
        [id]
      )
    ).toMatchObject({ conta_origem_id: contaDoPdv, descricao: `CX-M06 put conta errada ${nome}` });
  });

  // R-122 — o caso perigoso: o lancamento nasceu na conta A, o admin reaponta o PDV para a conta B e
  // o PUT vem sem conta. Antes, a normalizacao trocava A por B em silencio e o registro historico
  // mudava de conta. Agora a edicao para em 403 e nada muda.
  it.each(SAIDAS)("Deve_RecusarSemAlterar_Quando_OPdvFoiReapontado (%s)", async (nome, rota, extras) => {
    const criada = await post(
      cookieCaixa,
      rota,
      corpo(`CX-M06 pdv reapontado ${nome}`, { contaOrigemId: contaDoPdv, ...extras })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    await executarSql("update pdvs set conta_id = $2 where id = $1", [pdvId, idsTeste.contaLivre]);
    try {
      const editada = await put(cookieCaixa, `${rota}/${id}`, corpo(`CX-M06 pdv reapontado alterada ${nome}`, extras));
      assertProblem(editada, 403);
      expect(editada.body).toContain("Tesouraria");

      expect(
        await consultarUm<{ conta_origem_id: string; descricao: string }>(
          `select conta_origem_id, descricao from ${nome}s where id = $1`,
          [id]
        )
      ).toMatchObject({ conta_origem_id: contaDoPdv, descricao: `CX-M06 pdv reapontado ${nome}` });
    } finally {
      await executarSql("update pdvs set conta_id = $2 where id = $1", [pdvId, contaDoPdv]);
    }
  });

  // A retaguarda NAO tem conta travada: o corpo sem conta nao pode ser normalizado para a conta de
  // PDV nenhum — tem de gravar o que veio (nulo), e nao herdar a conta de um caixa alheio. E o caso
  // simetrico do bug que a rodada anterior fechou para o operador.
  it.each(SAIDAS)(
    "Deve_NaoHerdarContaDePdv_Quando_RetaguardaEditaSemInformarConta (%s)",
    async (nome, rota, extras) => {
      const criada = await post(
        cookieAdmin,
        rota,
        corpo(`CX-M06 put retaguarda ${nome}`, { contaOrigemId: idsTeste.contaBanco, ...extras })
      );
      expect(criada.statusCode, criada.body).toBe(201);
      const { id } = json<{ data: { id: string } }>(criada).data;

      const editada = await put(cookieAdmin, `${rota}/${id}`, corpo(`CX-M06 put retaguarda corrigida ${nome}`, extras));
      expect(editada.statusCode, editada.body).toBe(200);

      expect(
        await consultarUm<{ conta_origem_id: string | null }>(`select conta_origem_id from ${nome}s where id = $1`, [
          id
        ])
      ).toMatchObject({ conta_origem_id: null });
    }
  );

  // ===== B-04 — credor conforme a categoria ==================================================

  it("Deve_Criar_Quando_MercadoriaTemFornecedor", async () => {
    const resposta = await post(
      cookieCaixa,
      "/api/mercadorias",
      corpo("CX-M06 mercadoria com fornecedor", {
        contaOrigemId: contaDoPdv,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        fornecedorId: idsTeste.fornecedor,
        credorTipo: "fornecedor"
      })
    );
    expect(resposta.statusCode, resposta.body).toBe(201);

    const { id } = json<{ data: { id: string } }>(resposta).data;
    expect(
      await consultarUm<{ fornecedor_id: string; credor_tipo: string }>(
        "select fornecedor_id, credor_tipo from mercadorias where id = $1",
        [id]
      )
    ).toMatchObject({ fornecedor_id: idsTeste.fornecedor, credor_tipo: "fornecedor" });
  });

  it("Deve_RecusarSemGravar_Quando_MercadoriaDeclaraCredorColaborador", async () => {
    const descricao = "CX-M06 mercadoria credor colaborador";
    const resposta = await post(
      cookieCaixa,
      "/api/mercadorias",
      corpo(descricao, {
        contaOrigemId: contaDoPdv,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        fornecedorId: idsTeste.fornecedor,
        credorTipo: "colaborador"
      })
    );

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(await gravadas(descricao)).toBe(0);
  });

  it("Deve_RecusarSemGravar_Quando_MercadoriaNaoTemFornecedor", async () => {
    const descricao = "CX-M06 mercadoria sem fornecedor";
    const resposta = await post(
      cookieCaixa,
      "/api/mercadorias",
      corpo(descricao, { contaOrigemId: contaDoPdv, grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos })
    );

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(resposta.body).toContain("fornecedorId");
    expect(await gravadas(descricao)).toBe(0);
  });

  // P0 — a FK `retiradas.fornecedor_id` e global, nao por empresa. Despesa e mercadoria ja
  // validavam; a retirada era a unica fora. Provado pela RETAGUARDA, que escolhe a conta livremente:
  // com o operador a trava da R-121 recusaria antes, sem exercitar o validador.
  it("Deve_RecusarSemGravar_Quando_RetiradaTemFornecedorDeOutraEmpresa", async () => {
    const descricao = "CX-M06 retirada fornecedor cross-tenant";
    const resposta = await post(
      cookieAdmin,
      "/api/retiradas",
      corpo(descricao, {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: FORNECEDOR_OUTRA_EMPRESA
      })
    );

    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Fornecedor");
    expect(await gravadas(descricao)).toBe(0);
  });

  it("Deve_RecusarSemAlterar_Quando_PutDaRetiradaUsaFornecedorDeOutraEmpresa", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/retiradas",
      corpo("CX-M06 retirada para editar credor", {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieAdmin,
      `/api/retiradas/${id}`,
      corpo("CX-M06 retirada credor invadido", {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: FORNECEDOR_OUTRA_EMPRESA
      })
    );
    assertProblem(editada, 400);

    // O registro anterior fica INTEIRO, nao so a contagem.
    expect(
      await consultarUm<{ fornecedor_id: string; descricao: string }>(
        "select fornecedor_id, descricao from retiradas where id = $1",
        [id]
      )
    ).toMatchObject({ fornecedor_id: idsTeste.fornecedor, descricao: "CX-M06 retirada para editar credor" });
  });

  // R-128 no SERVIDOR: a tela ja nao oferece, mas qualquer outro cliente gravava.
  it("Deve_RecusarSemGravar_Quando_RetiradaNovaUsaColaborador", async () => {
    const descricao = "CX-M06 retirada nova com colaborador";
    const resposta = await post(
      cookieAdmin,
      "/api/retiradas",
      corpo(descricao, {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(resposta.body).toContain("R-128");
    expect(await gravadas(descricao)).toBe(0);
  });

  it("Deve_RecusarSemAlterar_Quando_PutTransformaRetiradaModernaEmColaborador", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/retiradas",
      corpo("CX-M06 retirada moderna", {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieAdmin,
      `/api/retiradas/${id}`,
      corpo("CX-M06 retirada virando colaborador", {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    assertProblem(editada, 400, "VALIDATION_ERROR");

    expect(
      await consultarUm<{ fornecedor_id: string; colaborador_id: string | null; credor_tipo: string }>(
        "select fornecedor_id, colaborador_id, credor_tipo from retiradas where id = $1",
        [id]
      )
    ).toMatchObject({ fornecedor_id: idsTeste.fornecedor, colaborador_id: null, credor_tipo: "fornecedor" });
  });

  // O legado tem de continuar editavel — a regra distingue "preservar" de "introduzir".
  it("Deve_PermitirEditarOutroCampo_Quando_RetiradaLegadaJaTemColaborador", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/retiradas",
      corpo("CX-M06 retirada legada", {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Vira o que o historico tem: credor colaborador, como a migration 0020 permitia.
    await executarSql(
      "update retiradas set fornecedor_id = null, colaborador_id = $2, credor_tipo = 'colaborador' where id = $1",
      [id, idsTeste.colaboradorCaixa]
    );

    const editada = await put(
      cookieAdmin,
      `/api/retiradas/${id}`,
      corpo("CX-M06 retirada legada corrigida", {
        valorOriginal: 77,
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    expect(editada.statusCode, editada.body).toBe(200);

    expect(
      await consultarUm<{
        colaborador_id: string;
        fornecedor_id: string | null;
        credor_tipo: string;
        descricao: string;
        valor_original: string;
      }>("select colaborador_id, fornecedor_id, credor_tipo, descricao, valor_original from retiradas where id = $1", [
        id
      ])
    ).toMatchObject({
      colaborador_id: idsTeste.colaboradorCaixa,
      fornecedor_id: null,
      credor_tipo: "colaborador",
      descricao: "CX-M06 retirada legada corrigida",
      valor_original: "77.00"
    });
  });

  // "Preservar" nao e "poder trocar". Sem esta prova, afrouxar a regra para "o existente tem ALGUM
  // colaborador" passaria na suite inteira — e um registro antigo viraria veiculo para reatribuir
  // quem recebeu o dinheiro.
  it("Deve_RecusarSemAlterar_Quando_PutTrocaOColaboradorDaRetiradaLegada", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/retiradas",
      corpo("CX-M06 legada troca de colaborador", {
        contaOrigemId: idsTeste.contaBanco,
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

    const editada = await put(
      cookieAdmin,
      `/api/retiradas/${id}`,
      corpo("CX-M06 legada com outro colaborador", {
        contaOrigemId: idsTeste.contaBanco,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorAdmin
      })
    );
    assertProblem(editada, 400, "VALIDATION_ERROR");

    expect(
      await consultarUm<{ colaborador_id: string; descricao: string }>(
        "select colaborador_id, descricao from retiradas where id = $1",
        [id]
      )
    ).toMatchObject({
      colaborador_id: idsTeste.colaboradorCaixa,
      descricao: "CX-M06 legada troca de colaborador"
    });
  });

  it("Deve_RecusarSemAlterar_Quando_PutDaDespesaIntroduzDoisCredores", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 despesa put dois credores", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 despesa put dois credores alterada", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    assertProblem(editada, 400, "VALIDATION_ERROR");

    expect(
      await consultarUm<{ colaborador_id: string | null; descricao: string }>(
        "select colaborador_id, descricao from despesas where id = $1",
        [id]
      )
    ).toMatchObject({ colaborador_id: null, descricao: "CX-M06 despesa put dois credores" });
  });

  // O atalho do historico vale para a CARDINALIDADE, nunca para a coerencia do tipo: sem isto o PUT
  // gravava `credor_tipo` sem credor nenhum, e o par legado somado a um `credorTipo` estourava o
  // CHECK no UPDATE, virando 500 de driver.
  it("Deve_RecusarSemAlterar_Quando_PutDaDespesaDeclaraCredorTipoSemOId", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 despesa sem credor", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 despesa sem credor alterada", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        credorTipo: "fornecedor"
      })
    );
    assertProblem(editada, 400, "VALIDATION_ERROR");

    expect(
      await consultarUm<{ credor_tipo: string | null; descricao: string }>(
        "select credor_tipo, descricao from despesas where id = $1",
        [id]
      )
    ).toMatchObject({ credor_tipo: null, descricao: "CX-M06 despesa sem credor" });
  });

  it("Deve_RecusarComQuatrocentos_Quando_DespesaHistoricaRecebeCredorTipoIncoerente", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 historica com tipo incoerente", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    await executarSql("update despesas set colaborador_id = $2, credor_tipo = null where id = $1", [
      id,
      idsTeste.colaboradorCaixa
    ]);

    // Par legado intacto + `credorTipo`: antes passava pelo atalho e violava o CHECK no UPDATE (500).
    const editada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 historica com tipo incoerente alterada", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor,
        colaboradorId: idsTeste.colaboradorCaixa,
        credorTipo: "fornecedor"
      })
    );
    assertProblem(editada, 400, "VALIDATION_ERROR");
  });

  it("Deve_RecusarSemGravar_Quando_RetiradaTemDoisCredores", async () => {
    const descricao = "CX-M06 retirada com dois credores";
    const resposta = await post(
      cookieCaixa,
      "/api/retiradas",
      corpo(descricao, {
        contaOrigemId: contaDoPdv,
        grupoRetiradaId: idsTeste.grupoRetiradaSangria,
        colaboradorId: idsTeste.colaboradorCaixa,
        fornecedorId: idsTeste.fornecedor
      })
    );

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(resposta.body).toContain("credor");
    expect(await gravadas(descricao)).toBe(0);
  });

  // ===== B-04 — a despesa tem UM tipo de credor por vez ======================================

  it("Deve_RecusarSemGravar_Quando_DespesaTemDoisCredores", async () => {
    const descricao = "CX-M06 despesa com dois credores";
    const resposta = await post(
      cookieAdmin,
      "/api/despesas",
      corpo(descricao, {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(resposta.body).toContain("um credor so");
    expect(await gravadas(descricao)).toBe(0);
    // Sem a regra, o repositorio ainda criava divida para um colaborador que nao era o credor. A
    // contagem e escopada pela DESPESA (join pela descricao): global, ela dependeria da ordem dos
    // testes e ficaria vermelha por motivo errado assim que outro caso gravasse divida.
    const divida = await consultarUm<{ total: string }>(
      `select count(*) as total from debitos_colaboradores d
         join despesas e on e.id = d.despesa_id
        where e.descricao = $1`,
      [descricao]
    );
    expect(Number(divida?.total ?? "0")).toBe(0);
  });

  it.each([
    ["fornecedor", { credorTipo: "fornecedor", colaboradorId: idsTeste.colaboradorCaixa }],
    ["colaborador", { credorTipo: "colaborador", fornecedorId: idsTeste.fornecedor }]
  ] as const)("Deve_RecusarSemGravar_Quando_CredorTipoEIncoerente (%s)", async (tipo, credor) => {
    const descricao = `CX-M06 despesa credorTipo incoerente ${tipo}`;
    const resposta = await post(
      cookieAdmin,
      "/api/despesas",
      corpo(descricao, {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        ...credor
      })
    );

    // Antes disto o CHECK do banco estourava no INSERT e o erro de driver virava 500.
    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(resposta.body).toContain("incoerente");
    expect(await gravadas(descricao)).toBe(0);
  });

  // O historico com os dois ids e `credor_tipo` nulo nao pode virar refem da regra nova.
  it("Deve_PermitirEditarOutroCampo_Quando_DespesaHistoricaTemOsDoisCredores", async () => {
    const criada = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 despesa historica", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    await executarSql("update despesas set colaborador_id = $2, credor_tipo = null where id = $1", [
      id,
      idsTeste.colaboradorCaixa
    ]);

    // O operador mexe no VALOR e devolve o par de credores como estava: tem de passar.
    const editada = await put(
      cookieAdmin,
      `/api/despesas/${id}`,
      corpo("CX-M06 despesa historica corrigida", {
        valorOriginal: 99,
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional,
        fornecedorId: idsTeste.fornecedor,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    expect(editada.statusCode, editada.body).toBe(200);
    expect(
      await consultarUm<{
        descricao: string;
        valor_original: string;
        fornecedor_id: string;
        colaborador_id: string;
      }>("select descricao, valor_original, fornecedor_id, colaborador_id from despesas where id = $1", [id])
    ).toMatchObject({
      descricao: "CX-M06 despesa historica corrigida",
      valor_original: "99.00",
      fornecedor_id: idsTeste.fornecedor,
      colaborador_id: idsTeste.colaboradorCaixa
    });

    // CONSEQUENCIA CONHECIDA, fixada aqui para nao ficar invisivel: o repositorio apaga e recria
    // `debitos_colaboradores` a cada PUT, entao editar o VALOR de uma despesa historica incoerente
    // REVALORA a divida de um colaborador que talvez nao seja o credor. E comportamento anterior a
    // esta entrega, preservado de proposito porque a OS manda o historico continuar editavel.
    // Corrigir exige saber quem e o credor de cada linha legada — decisao com migration, no relatorio.
    const divida = await consultarUm<{ valor: string }>(
      `select d.valor from debitos_colaboradores d
         join despesas e on e.id = d.despesa_id
        where e.id = $1`,
      [id]
    );
    expect(divida).toMatchObject({ valor: "99.00" });
  });

  // ===== Retaguarda e contrato de erro =======================================================

  // B-05: "o seletor de contas permitido atualmente deve continuar funcionando". A prova real e a
  // retaguarda gravando numa conta que NAO e a do PDV do caixa aberto.
  it("Deve_AceitarOutraConta_Quando_PerfilEDeRetaguarda", async () => {
    const resposta = await post(
      cookieAdmin,
      "/api/despesas",
      corpo("CX-M06 retaguarda escolhe a conta", {
        contaOrigemId: idsTeste.contaBanco,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      })
    );
    expect(resposta.statusCode, resposta.body).toBe(201);

    const { id } = json<{ data: { id: string } }>(resposta).data;
    expect(
      await consultarUm<{ conta_origem_id: string }>("select conta_origem_id from despesas where id = $1", [id])
    ).toMatchObject({ conta_origem_id: idsTeste.contaBanco });
  });

  // Contrato ja existente (api/src/caixa/caixa.service.ts): quem nao tem caixa aberto para em 400
  // com a mensagem oficial — e nao num 403 de permissao, que nao explica nada.
  //
  // O perfil e o `caixaCiclo`: tem `despesas_criar` e `caixa_operar` e NAO tem caixa aberto no seed.
  // A tesouraria nao serve — ela nao tem `despesas_criar` e pararia antes, no 403 de permissao,
  // provando outra regra.
  it("Deve_RecusarComAMensagemOficial_Quando_NaoHaCaixaAberto", async () => {
    const descricao = "CX-M06 sem caixa aberto";
    const cookieSemCaixa = await cookieSessao(contexto.app, "caixaCiclo");
    const resposta = await post(
      cookieSemCaixa,
      "/api/despesas",
      corpo(descricao, { grupoDespesaId: idsTeste.grupoDespesaOperacional })
    );

    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Abra um caixa");
    expect(resposta.body).not.toContain("INSUFFICIENT_PERMISSION");
    expect(await gravadas(descricao)).toBe(0);
  });
});

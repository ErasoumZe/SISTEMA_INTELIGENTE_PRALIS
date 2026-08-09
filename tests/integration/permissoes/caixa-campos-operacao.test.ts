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

describe("CX-M06 - campos operacionais do caixa pela rota real", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let caixaId = "";
  let contaDoPdv = "";
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
    caixaId = json<{ data: { id: string } }>(abertura).data.id;

    // Conta da empresa B: o seed nao tem nenhuma, e ela e a fixture do teste cross-tenant. Vai por
    // SQL para nao depender de o admin ter acesso de escrita na outra empresa.
    await executarSql("insert into contas (id, empresa_id, nome) values ($1, $2, $3)", [
      CONTA_OUTRA_EMPRESA,
      idsTeste.empresaB,
      "Conta da empresa B"
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
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, colaboradorId: idsTeste.colaboradorCaixa }
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

  it.each(SAIDAS)("Deve_RecusarSemGravar_Quando_ContaEDeOutraEmpresa (%s)", async (nome, rota, extras) => {
    const descricao = `CX-M06 cross-tenant ${nome}`;
    const resposta = await post(cookieCaixa, rota, corpo(descricao, { contaOrigemId: CONTA_OUTRA_EMPRESA, ...extras }));

    assertProblem(resposta, 400);
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
  // a divergencia que a R-121 existe para impedir, invertida.
  it("Deve_ManterAContaDoPdv_Quando_OperadorEditaSemInformarConta", async () => {
    const criada = await post(
      cookieCaixa,
      "/api/despesas",
      corpo("CX-M06 edicao sem conta", {
        contaOrigemId: contaDoPdv,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieCaixa,
      `/api/despesas/${id}`,
      corpo("CX-M06 edicao sem conta corrigida", {
        valorOriginal: 42,
        grupoDespesaId: idsTeste.grupoDespesaOperacional
      })
    );
    expect(editada.statusCode, editada.body).toBe(200);

    expect(
      await consultarUm<{ conta_origem_id: string | null }>("select conta_origem_id from despesas where id = $1", [id])
    ).toMatchObject({ conta_origem_id: contaDoPdv });
  });

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
    const descricao = "CX-M06 mercadoria so com colaborador";
    const resposta = await post(
      cookieCaixa,
      "/api/mercadorias",
      corpo(descricao, {
        contaOrigemId: contaDoPdv,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );

    assertProblem(resposta, 400, "VALIDATION_ERROR");
    expect(await gravadas(descricao)).toBe(0);
  });

  // Contrato REAL: `mercadoriaPayloadSchema` nao e `.strict()` e a tabela `mercadorias` nao tem
  // coluna de colaborador — a chave extra e descartada, nao recusada. O que o aceite exige e que ela
  // NAO seja persistida; o descarte silencioso esta registrado como achado fora de escopo.
  it("Deve_NaoPersistirColaborador_Quando_MercadoriaRecebeAChaveExtra", async () => {
    const resposta = await post(
      cookieCaixa,
      "/api/mercadorias",
      corpo("CX-M06 mercadoria com chave extra", {
        contaOrigemId: contaDoPdv,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        fornecedorId: idsTeste.fornecedor,
        colaboradorId: idsTeste.colaboradorCaixa
      })
    );
    expect(resposta.statusCode, resposta.body).toBe(201);

    const { id } = json<{ data: { id: string } }>(resposta).data;
    const colunas = await consultarTodos<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'mercadorias'"
    );
    expect(colunas.map((coluna) => coluna.column_name)).not.toContain("colaborador_id");
    expect(
      await consultarUm<{ credor_tipo: string }>("select credor_tipo from mercadorias where id = $1", [id])
    ).toMatchObject({ credor_tipo: "fornecedor" });
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

    assertProblem(resposta, 400);
    expect(await gravadas(descricao)).toBe(0);
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

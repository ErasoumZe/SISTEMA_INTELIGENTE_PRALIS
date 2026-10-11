import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, prepararFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// R-121/R-122/R-123 — "Operador de caixa deve ter permissao de lancar todas as saidas, desde que
// saia da conta do caixa aberto" (Jose, 01/08/2026).
//
// O buraco que isto fecha: o total do caixa soma despesa/mercadoria/retirada por `caixa_id` e
// IGNORA a conta; o saldo da conta soma por `conta_origem_id` e IGNORA o caixa. Sem amarrar os
// dois, uma despesa lancada dentro do caixa apontando outra conta debita as DUAS coisas ao mesmo
// tempo — divergencia silenciosa que volta como quebra de caixa falsa no operador (R-015).
describe("R-121 - operador de caixa lanca saidas amarradas a conta do PDV", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let caixaId = "";
  let contaDoPdv = "";
  let lacreFechamento = "";
  const hoje = "2026-08-01";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
    // O caso abre um caixa proprio pelo contrato fisico da operacao.
    // `beforeAll` nao possui um `it` ativo, entao a fixture nao pode registrar limpeza individual.
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "R-121 Saidas",
      dataHoraAbertura: "2026-07-31T08:00",
      // As saidas exercitadas abaixo somam R$ 102,00. O fundo precisa ser fisicamente suficiente
      // para que este caso prove a permissao de edicao pos-fechamento, e nao uma quebra artificial.
      valorAbertura: 102,
      registrarLimpeza: false
    });
    caixaId = caixa.caixaId;
    contaDoPdv = caixa.contaId;
    lacreFechamento = caixa.lacreFechamento;
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function post(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }
  function put(cookie: string, url: string, payload: object) {
    return contexto.app.inject({ method: "PUT", url, headers: { cookie }, payload });
  }

  const despesaBase = (extras: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    dataReferencia: hoje,
    dataVencimento: hoje,
    descricao: "Despesa do operador",
    valorOriginal: 10,
    grupoDespesaId: idsTeste.grupoDespesaOperacional,
    ...extras
  });

  // --- criacao das TRES saidas com a conta certa --------------------------------------------
  it.each([
    ["despesa", "/api/despesas", { grupoDespesaId: idsTeste.grupoDespesaOperacional }],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "retirada",
      "/api/retiradas",
      // R-128: retirada NOVA e de fornecedor ou socio/gestor. Usar colaborador aqui transformaria o
      // caminho que a regra proibe em contrato de teste.
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const)("Deve_Criar_Quando_OperadorUsaAContaDoPdv (%s)", async (_nome, rota, grupo) => {
    const resposta = await post(cookieCaixa, rota, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: `Saida do operador em ${rota}`,
      valorOriginal: 10,
      contaOrigemId: contaDoPdv,
      ...grupo
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  });

  it.each([
    ["despesa", "/api/despesas", { grupoDespesaId: idsTeste.grupoDespesaOperacional }],
    [
      "mercadoria",
      "/api/mercadorias",
      { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, fornecedorId: idsTeste.fornecedor }
    ],
    [
      "retirada",
      "/api/retiradas",
      // R-128: retirada NOVA e de fornecedor ou socio/gestor. Usar colaborador aqui transformaria o
      // caminho que a regra proibe em contrato de teste.
      { grupoRetiradaId: idsTeste.grupoRetiradaSangria, fornecedorId: idsTeste.fornecedor }
    ]
  ] as const)("Deve_Retornar400_Quando_OperadorUsaOutraConta (%s)", async (_nome, rota, grupo) => {
    const resposta = await post(cookieCaixa, rota, {
      empresaId: idsTeste.empresaA,
      dataReferencia: hoje,
      dataVencimento: hoje,
      descricao: "Saida apontando o Banco",
      valorOriginal: 10,
      // Conta que NAO e a do PDV aberto: e aqui que nascia a divergencia conta x caixa.
      contaOrigemId: idsTeste.contaBanco,
      ...grupo
    });
    assertProblem(resposta, 400);
    expect(resposta.body).toContain("conta do PDV aberto");
  });

  it("Deve_PreencherComAContaDoPdv_Quando_OperadorNaoInformaConta", async () => {
    const resposta = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Despesa sem conta" }));
    expect(resposta.statusCode, resposta.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(resposta).data;
    // Payload sem conta nao pode virar lancamento orfao: o servidor completa com a do PDV.
    const gravada = await consultarUm<{ conta_origem_id: string; caixa_id: string }>(
      "select conta_origem_id, caixa_id from despesas where id = $1",
      [id]
    );
    expect(gravada).toMatchObject({ conta_origem_id: contaDoPdv, caixa_id: caixaId });
  });

  // --- R-122: corrigir o proprio lancamento ---------------------------------------------------
  it("Deve_PermitirEditar_Quando_LancamentoDoProprioCaixaAberto", async () => {
    const criada = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Valor errado" }));
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(criada).data;

    const editada = await put(
      cookieCaixa,
      `/api/despesas/${id}`,
      despesaBase({ descricao: "Valor corrigido", valorOriginal: 42, contaOrigemId: contaDoPdv })
    );
    expect(editada.statusCode, editada.body).toBe(200);
    expect(
      await consultarUm<{ descricao: string }>("select descricao from despesas where id = $1", [id])
    ).toMatchObject({ descricao: "Valor corrigido" });
  });

  it("Deve_Retornar403_Quando_OperadorEditaTrocandoAConta", async () => {
    const criada = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Nao pode virar Banco" }));
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Editar nao pode ser a porta dos fundos para trocar a conta que a criacao travou.
    const editada = await put(
      cookieCaixa,
      `/api/despesas/${id}`,
      despesaBase({ descricao: "Nao pode virar Banco", contaOrigemId: idsTeste.contaBanco })
    );
    assertProblem(editada, 403);
    expect(editada.body).toContain("conta do PDV aberto");
  });

  // O `admin` faz o papel da retaguarda aqui: ele tem caixa aberto proprio no seed (pdvA, conta
  // `contaCaixa`), entao a despesa nasce presa a um caixa que NAO e o do operador. A tesouraria nao
  // serve — hoje ela tambem depende de caixa aberto (D-11) e o POST dela nao passa de 400, o que
  // antes fazia este teste sair pela porta dos fundos com um `if (...) return` e nao asserir nada.
  //
  // A conta e informada EXPLICITAMENTE desde a A-4. Sem ela o payload ia sem conta, `caixaIdDaSaida`
  // gravava `caixa_id` NULO e o 403 passava a vir de "lancamento sem caixa" — o teste continuava
  // verde provando outra regra, e o cenario "lancamento de OUTRO caixa" sumia da suite.
  it("Deve_Retornar403_Quando_OperadorEditaLancamentoDeOutroCaixa", async () => {
    const deOutro = await post(
      cookieAdmin,
      "/api/despesas",
      despesaBase({ descricao: "Despesa da retaguarda", contaOrigemId: idsTeste.contaCaixa })
    );
    expect(deOutro.statusCode, deOutro.body).toBe(201);
    const { id } = json<{ data: { id: string } }>(deOutro).data;
    // A pre-condicao do caso: o registro pertence mesmo a um caixa, e nao e o do operador.
    const gravado = await consultarUm<{ caixa_id: string | null }>("select caixa_id from despesas where id = $1", [id]);
    expect(gravado).toMatchObject({ caixa_id: idsTeste.caixaAberto });
    expect(gravado?.caixa_id).not.toBe(caixaId);

    const editada = await put(cookieCaixa, `/api/despesas/${id}`, despesaBase({ descricao: "Tentativa" }));
    assertProblem(editada, 403);

    // A recusa preserva o registro INTEIRO, nao so a contagem.
    expect(
      await consultarUm<{ descricao: string; caixa_id: string | null }>(
        "select descricao, caixa_id from despesas where id = $1",
        [id]
      )
    ).toMatchObject({ descricao: "Despesa da retaguarda", caixa_id: idsTeste.caixaAberto });
  });

  // --- R-123: recorrencia e ato de retaguarda --------------------------------------------------
  it("Deve_Retornar400_Quando_OperadorTentaLancamentoRecorrente", async () => {
    const resposta = await post(
      cookieCaixa,
      "/api/despesas",
      despesaBase({
        descricao: "Aluguel todo mes",
        recorrencia: { frequencia: "mes", repeticoes: 3 }
      })
    );
    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Tesouraria/Financeiro");
  });

  // --- R-122: fechado o caixa, acabou ---------------------------------------------------------
  it("Deve_Retornar403_Quando_OperadorEditaDepoisDeFecharOCaixa", async () => {
    const criada = await post(cookieCaixa, "/api/despesas", despesaBase({ descricao: "Antes do fechamento" }));
    const { id } = json<{ data: { id: string } }>(criada).data;

    // Zera o caixa e fecha. Depois disso corrigir vira ato de tesouraria — e o que protege os
    // totais congelados em `fechamentos_caixa`.
    // As saidas deste cenario consomem o fundo de abertura. A contagem fisica zero nao inventa
    // retorno e deixa este caso focado no bloqueio de edicao depois do fechamento.
    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieCaixa, caixaId });
    const fechar = await post(cookieCaixa, `/api/caixa/${caixaId}/fechar`, {
      lacreFechamento,
      caixaResponsavelNome: "Operador R-121",
      supervisorResponsavelNome: "Supervisor de teste",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0,
      observacao: "Contagem fisica zero no fechamento do teste"
    });
    expect(fechar.statusCode, fechar.body).toBe(204);

    const editada = await put(cookieCaixa, `/api/despesas/${id}`, despesaBase({ descricao: "Tarde demais" }));
    assertProblem(editada, 403);
    expect(editada.body).toContain("Tesouraria");
  });

  it("Deve_Retornar409_Quando_SaidasFisicasSuperamOSaldoAntesDoFechamento", async () => {
    // Apos o caso anterior, o operador pode abrir uma nova fixture propria. O objetivo e provar
    // que a protecao da composicao fisica devolve erro de dominio, sem vazar a restricao do banco
    // como 500.
    const caixaNegativo = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "R-121 Saldo Fisico Negativo",
      valorAbertura: 100
    });
    const saidaMaiorQueOFundo = await post(cookieCaixa, "/api/despesas", {
      ...despesaBase({ descricao: "Saida que excede o fundo", valorOriginal: 101 }),
      contaOrigemId: caixaNegativo.contaId
    });
    expect(saidaMaiorQueOFundo.statusCode, saidaMaiorQueOFundo.body).toBe(201);

    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieCaixa, caixaId: caixaNegativo.caixaId });
    const fechar = await post(cookieCaixa, `/api/caixa/${caixaNegativo.caixaId}/fechar`, {
      lacreFechamento: caixaNegativo.lacreFechamento,
      caixaResponsavelNome: "Operador R-121",
      supervisorResponsavelNome: "Supervisor de teste",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0,
      observacao: "Saldo fisico negativo deve ser corrigido antes do fechamento"
    });
    assertProblem(fechar, 409);
    expect(fechar.body).toContain("SALDO_FISICO_NEGATIVO");
  });
});

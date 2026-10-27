import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertProblem } from "../../setup/asserts.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";

type RespostaId = { data: { id: string } };

// Regras de entrada do app oficial portadas para o ERP (R-222, decisoes de Jose de 27/10/2026).
describe("produtos - regras de cadastro do app oficial", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieGerente = await cookieSessao(contexto.app, "gerente");
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const basico = (extra: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
    unidadeIndividualId: idsTeste.unidade,
    quantidadeIndividual: 1,
    conversoes: [],
    ...extra
  });

  function criar(payload: Record<string, unknown>, cookie = cookieAdmin) {
    return contexto.app.inject({ method: "POST", url: "/api/produtos", headers: { cookie }, payload });
  }

  async function lerProduto(id: string) {
    return consultarUm<{
      descricao: string;
      marca: string | null;
      pesavel: boolean | null;
      tecla_balanca: number | null;
      validade_balanca: number | null;
      codigo_barras: string | null;
      codigo_interno: string;
      quantidade_individual: string;
      status: string;
    }>(
      `select descricao, marca, pesavel, tecla_balanca, validade_balanca, codigo_barras, codigo_interno,
              quantidade_individual, status
         from produtos where id = $1`,
      [id]
    );
  }

  it("Deve_RecusarProdutoNovoSemGrupo", async () => {
    const resposta = await criar(basico({ grupoMercadoriaId: null, descricao: "Sem grupo novo" }));
    expect(resposta.statusCode).toBe(400);
    expect(resposta.body).toContain("Selecione o grupo de mercadorias");
  });

  it("Deve_DeixarEditarProdutoLegadoSemGrupo_MasNaoTirarGrupoDeQuemTem", async () => {
    const legado = await consultarUm<{ id: string }>(
      `insert into produtos (empresa_id, unidade_medida_id, unidade_individual_id, codigo, codigo_interno, descricao)
       values ($1, $2, $2, 'PR-LEG-0001', '90001', 'LEGADO SEM GRUPO') returning id`,
      [idsTeste.empresaA, idsTeste.unidade]
    );
    const edicaoLegado = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${legado!.id}`,
      headers: { cookie: cookieAdmin },
      payload: basico({ grupoMercadoriaId: null, descricao: "Legado sem grupo", pesavel: false })
    });
    expect(edicaoLegado.statusCode, edicaoLegado.body).toBe(204);

    const comGrupo = await criar(basico({ descricao: "Com grupo para tirar" }));
    expect(comGrupo.statusCode, comGrupo.body).toBe(201);
    const tirarGrupo = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${json<RespostaId>(comGrupo).data.id}`,
      headers: { cookie: cookieAdmin },
      payload: basico({ grupoMercadoriaId: null, descricao: "Com grupo para tirar" })
    });
    expect(tirarGrupo.statusCode).toBe(400);
  });

  it("Deve_GravarMaiusculas_EAN_DoCodigoInterno_E_NaoBalancaNaCriacao", async () => {
    const resposta = await criar(basico({ descricao: "pão de mel 50 g", marca: "casa nova" }));
    expect(resposta.statusCode, resposta.body).toBe(201);
    const produto = await lerProduto(json<RespostaId>(resposta).data.id);
    expect(produto).toMatchObject({
      descricao: "PÃO DE MEL 50 G",
      marca: "CASA NOVA",
      pesavel: false,
      tecla_balanca: null,
      validade_balanca: null
    });
    // Oficial: quem nasce sem EAN leva o proprio codigo interno no campo de barras.
    expect(produto?.codigo_barras).toBe(produto?.codigo_interno);
  });

  it("Deve_AceitarGramaturaZero", async () => {
    const resposta = await criar(basico({ descricao: "Bolo sem gramatura", quantidadeIndividual: 0 }));
    expect(resposta.statusCode, resposta.body).toBe(201);
    expect((await lerProduto(json<RespostaId>(resposta).data.id))?.quantidade_individual).toBe("0.000");
  });

  it("Deve_ExigirValidade_E_FixarTecla_Quando_VaiParaBalanca", async () => {
    const semValidade = await criar(basico({ descricao: "Balanca sem validade", pesavel: true }));
    expect(semValidade.statusCode).toBe(400);
    expect(semValidade.body).toContain("validade da balança");

    const foraDaFaixa = await criar(basico({ descricao: "Balanca 1000 dias", pesavel: true, validadeBalanca: 1000 }));
    expect(foraDaFaixa.statusCode).toBe(400);

    const certo = await criar(
      basico({ descricao: "Balanca certa", pesavel: true, validadeBalanca: 5, teclaBalanca: 123 })
    );
    expect(certo.statusCode, certo.body).toBe(201);
    const id = json<RespostaId>(certo).data.id;
    expect(await lerProduto(id)).toMatchObject({ pesavel: true, tecla_balanca: 0, validade_balanca: 5 });

    // Saiu da balanca: tecla e validade somem.
    const saiu = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieAdmin },
      payload: basico({ descricao: "Balanca certa", pesavel: false, validadeBalanca: 5 })
    });
    expect(saiu.statusCode, saiu.body).toBe(204);
    expect(await lerProduto(id)).toMatchObject({ pesavel: false, tecla_balanca: null, validade_balanca: null });
  });

  it("Deve_ValidarEstoquePorEmbalagem", async () => {
    const quebrado = await criar(
      basico({ descricao: "Caixa de 10 com minimo 15", quantidadeCaixa: 10, estoqueMin: 15, estoqueMax: 30 })
    );
    expect(quebrado.statusCode).toBe(400);
    expect(quebrado.body).toContain("múltiplo da Qt. embalagem (10)");

    const certo = await criar(
      basico({ descricao: "Caixa de 10 com minimo 10", quantidadeCaixa: 10, estoqueMin: 10, estoqueMax: 30 })
    );
    expect(certo.statusCode, certo.body).toBe(201);
  });

  describe("status: ativar/inativar e inativar em lote", () => {
    let produtoUm = "";
    let produtoDois = "";

    beforeAll(async () => {
      produtoUm = json<RespostaId>(await criar(basico({ descricao: "Status um" }))).data.id;
      produtoDois = json<RespostaId>(await criar(basico({ descricao: "Status dois" }))).data.id;
    });

    function alterarStatus(payload: Record<string, unknown>, cookie = cookieAdmin) {
      return contexto.app.inject({ method: "PATCH", url: "/api/produtos/status", headers: { cookie }, payload });
    }

    it("Deve_InativarEAtivarUmProduto", async () => {
      const inativar = await alterarStatus({ empresaId: idsTeste.empresaA, ids: [produtoUm], status: "inativo" });
      expect(inativar.statusCode, inativar.body).toBe(200);
      expect((await lerProduto(produtoUm))?.status).toBe("inativo");

      const ativar = await alterarStatus({ empresaId: idsTeste.empresaA, ids: [produtoUm], status: "ativo" });
      expect(ativar.statusCode).toBe(200);
      expect((await lerProduto(produtoUm))?.status).toBe("ativo");
    });

    it("Deve_RestringirLoteAoAdministrador_ComFrase_E_SoParaInativar", async () => {
      const ids = [produtoUm, produtoDois];
      const naoAdmin = await alterarStatus(
        { empresaId: idsTeste.empresaA, ids, status: "inativo", confirmacao: "INATIVAR 2 PRODUTOS" },
        cookieGerente
      );
      expect([403]).toContain(naoAdmin.statusCode);

      const ativarEmLote = await alterarStatus({
        empresaId: idsTeste.empresaA,
        ids,
        status: "ativo",
        confirmacao: "INATIVAR 2 PRODUTOS"
      });
      assertProblem(ativarEmLote, 403, "FORBIDDEN_BATCH");

      const semFrase = await alterarStatus({ empresaId: idsTeste.empresaA, ids, status: "inativo" });
      expect(semFrase.statusCode).toBe(400);
      expect(semFrase.body).toContain("INATIVAR 2 PRODUTOS");

      const certo = await alterarStatus({
        empresaId: idsTeste.empresaA,
        ids: [...ids, "00000000-0000-4000-8000-000000000009"],
        status: "inativo",
        confirmacao: "inativar 3 produtos"
      });
      expect(certo.statusCode, certo.body).toBe(200);
      const resultado = json<{ data: { alterados: string[]; ignorados: string[] } }>(certo).data;
      expect(resultado.alterados.sort()).toEqual([...ids].sort());
      expect(resultado.ignorados).toEqual(["00000000-0000-4000-8000-000000000009"]);
      expect((await lerProduto(produtoDois))?.status).toBe("inativo");
    });

    it("Deve_Recusar_Quando_EmpresaNaoPermitida", async () => {
      const resposta = await alterarStatus({ empresaId: idsTeste.empresaB, ids: [produtoUm], status: "ativo" });
      expect(resposta.statusCode).toBe(403);
    });
  });

  afterAll(async () => {
    await executarSql("delete from produtos where codigo = 'PR-LEG-0001'");
  });
});

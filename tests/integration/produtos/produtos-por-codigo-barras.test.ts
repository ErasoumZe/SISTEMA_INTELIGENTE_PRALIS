import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, json } from "../../setup/integracao.js";

type RespostaId = { data: { id: string } };
type Achados = { data: Array<{ id: string; nome: string; codigoInterno: string | null }> };

/**
 * F4/R2 (decisao D2): busca EXATA por EAN para o aviso ao digitar no formulario — igualdade com as
 * variantes do oficial (`barcodeCandidates` = `candidatosDeCodigo`): sem zeros a esquerda dos dois lados
 * e etiqueta de balanca achando o PLU. Pedaco de codigo nao acha.
 */
describe("produtos - busca exata por codigo de barras (aviso ao digitar)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let comZeros = "";
  let pesavel = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    const cadastrar = async (descricao: string, codigoBarras: string) => {
      const resposta = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
        empresaId: idsTeste.empresaA,
        grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
        unidadeIndividualId: idsTeste.unidade,
        descricao,
        nomeCatalogo: descricao,
        codigoBarras,
        quantidadeIndividual: 1,
        conversoes: []
      });
      expect(resposta.statusCode, resposta.body).toBe(201);
      return json<RespostaId>(resposta).data.id;
    };
    comZeros = await cadastrar("EAN AVISO COM ZEROS", "0007891234500017");
    pesavel = await cadastrar("EAN AVISO PLU BALANCA", "54321");
  }, 180_000);

  afterAll(async () => {
    await executarSql("delete from produtos where descricao like 'EAN AVISO %'");
    await executarSql("delete from produtos_catalogo_base where nome like 'EAN AVISO %'");
    await contexto.fechar();
  });

  async function buscar(parametros: Record<string, string>, cookie = cookieAdmin) {
    return contexto.app.inject({
      method: "GET",
      url: `/api/produtos/por-codigo-barras?${new URLSearchParams(parametros).toString()}`,
      headers: { cookie }
    });
  }
  const ids = async (parametros: Record<string, string>) => {
    const resposta = await buscar(parametros);
    assertOk(resposta);
    return json<Achados>(resposta).data.map((item) => item.id);
  };

  it("Deve_AcharNaLojaPeloEAN_ComESemZeros_EPelaEtiquetaDeBalanca", async () => {
    const naLoja = { empresaId: idsTeste.empresaA };
    expect(await ids({ ...naLoja, codigoBarras: "7891234500017" })).toContain(comZeros);
    expect(await ids({ ...naLoja, codigoBarras: "0007891234500017" })).toContain(comZeros);
    expect(await ids({ ...naLoja, codigoBarras: "2543210012345" })).toContain(pesavel);
    // Pedaco de EAN nao acha: e identidade, nao texto de busca.
    expect(await ids({ ...naLoja, codigoBarras: "78912345" })).not.toContain(comZeros);

    const resposta = await buscar({ ...naLoja, codigoBarras: "7891234500017" });
    expect(json<Achados>(resposta).data.find((item) => item.id === comZeros)?.nome).toBe("EAN AVISO COM ZEROS");
  });

  it("Deve_AcharNoCatalogoBase_QuandoOFormularioEDaBase", async () => {
    const naBase = await ids({ catalogo: "base", codigoBarras: "7891234500017" });
    expect(naBase.length).toBeGreaterThan(0);
    // A copia da loja nao aparece na busca da BASE (sao catalogos separados).
    expect(naBase).not.toContain(comZeros);
  });

  it("Deve_RecusarSemPermissao_EmpresaForaDoEscopo_E_LojaSemEmpresa", async () => {
    const cookieCaixa = await cookieSessao(contexto.app, "caixa");
    assertProblem(
      await buscar({ empresaId: idsTeste.empresaA, codigoBarras: "7891234500017" }, cookieCaixa),
      403,
      "INSUFFICIENT_PERMISSION"
    );
    assertProblem(
      await buscar({ empresaId: idsTeste.empresaB, codigoBarras: "7891234500017" }),
      403,
      "FORBIDDEN_COMPANY"
    );
    assertProblem(await buscar({ codigoBarras: "7891234500017" }), 400, "INVALID_COMPANY");
  });
});

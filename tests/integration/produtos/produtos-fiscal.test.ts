import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { definirFontesFiscaisParaTeste } from "../../../api/src/produtos/produtos-fiscal.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

type RespostaId = { data: { id: string } };

/**
 * Fiscal puxado pelo grupo — igual ao app oficial (R-222). A planilha e substituida por faixas fixas, como o
 * oficial faz no teste com um gateway falso: mesmas abas, mesmas faixas.
 */
const ABA_FISCAL = "'(TNP) FISCAL - DE PARA PRODUTOS'";
function planilhaFalsa(opcoes: { ecf?: string[][] } = {}) {
  return {
    async lerFaixasEmLote(faixas: string[]) {
      if (faixas.some((faixa) => faixa.includes("CADASTRO ECF"))) return [opcoes.ecf ?? []];
      if (faixas.some((faixa) => faixa.includes("M5:N130"))) return [[["MER FISCAL TESTE", "0,25"]]];
      return faixas.map((faixa) => {
        if (faixa === `${ABA_FISCAL}!AB4:AG79`) {
          return [
            ["MER FISCAL TESTE", "1", "TRIBUTADO INTEGRAL", "11,28%", "3,69%", "Regra geral"],
            ["MER OUTRO GRUPO", "6", "ALÍQUOTA ZERO", "7,40%", "0,00%", "Cesta básica"]
          ];
        }
        if (faixa === `${ABA_FISCAL}!A4:E2000`)
          return [["7891000000017", "19059090", "1", "3,69%", "PAO FISCAL TESTE"]];
        if (faixa === `${ABA_FISCAL}!O4:Q20`) {
          return [
            ["1", "TRIBUTADO INTEGRAL", "11,28%"],
            ["6", "ALÍQUOTA ZERO", "7,40%"]
          ];
        }
        return [];
      });
    }
  };
}

const LINHA_ECF = [
  "012658",
  "PAO FISCAL TESTE",
  "",
  "",
  "5333",
  "18000",
  "0000",
  "1",
  "00000000",
  "00000000",
  "18,00%",
  "03",
  "19059090",
  "PRODUTOS DA CASA",
  "",
  "",
  ""
];

describe("produtos - fiscal pelo grupo (igual ao app oficial)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let grupoFiscal = "";
  let gerenteId = "";
  let regrasOriginaisGerente = "{}";
  let outroGrupo = "";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    const criarGrupo = async (nome: string) =>
      json<RespostaId>(
        await contexto.app.inject({
          method: "POST",
          url: "/api/grupos-mercadorias",
          headers: { cookie: cookieAdmin },
          // O nome vem com o U+2060 da planilha: a regra casa pelo nome NORMALIZADO, como no oficial.
          payload: { empresaId: idsTeste.empresaA, tipoGrupo: "mercadoria", nome }
        })
      ).data.id;
    // O gerente edita produto (para provar que a regra fiscal, e nao a guarda de rota, e que o barra).
    const gerente = await consultarUm<{ id: string; regras: object }>(
      `select u.id, p.regras from "user" u join permissoes_usuarios p on p.usuario_id = u.id where u.email = $1`,
      ["gerente.integracao@padaria.local"]
    );
    gerenteId = gerente?.id ?? "";
    regrasOriginaisGerente = JSON.stringify(gerente?.regras ?? {});
    await executarSql(
      `update permissoes_usuarios set regras = regras || '{"cadastro_produtos_visualizar":true,"cadastro_produtos_editar":true}'::jsonb where usuario_id = $1`,
      [gerenteId]
    );
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    grupoFiscal = await criarGrupo("MER ⁠FISCAL TESTE");
    outroGrupo = await criarGrupo("MER OUTRO GRUPO");
  }, 180_000);

  afterAll(async () => {
    definirFontesFiscaisParaTeste({});
    if (gerenteId) {
      await executarSql("update permissoes_usuarios set regras = $2::jsonb where usuario_id = $1", [
        gerenteId,
        regrasOriginaisGerente
      ]);
    }
    await contexto.fechar();
  });

  const payload = (extra: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId: grupoFiscal,
    descricao: "PAO FISCAL TESTE",
    nomeCatalogo: "PAO FISCAL TESTE",
    codigoBarras: "7891000000017",
    unidadeIndividualId: idsTeste.unidade,
    quantidadeIndividual: 1,
    conversoes: [],
    ...extra
  });

  const fiscalDo = (produtoId: string) =>
    consultarUm<{
      ncm: string | null;
      cst_pis_cofins: string | null;
      tributacao_simples: string | null;
      aliquota_ecf: string | null;
      aliquota_ecf_id: string | null;
      reducao_icms: string | null;
      categoria_fiscal: string | null;
      origem_fiscal: string | null;
      estado: string | null;
      conferido_em: Date | null;
    }>("select * from produtos_fiscal where produto_id = $1", [produtoId]);

  /** Fiscal gravado na BASE, com as chaves do banco do app oficial. */
  const fiscalDaBase = async (produtoBaseId: string) =>
    (
      await consultarUm<{ dados_oficiais: Record<string, string | number | null> }>(
        "select dados_oficiais from produtos_catalogo_base where id = $1",
        [produtoBaseId]
      )
    )?.dados_oficiais;

  it("Deve_ClassificarPeloGrupo_DeParaEEcf_Quando_CriarProdutoNaBase", async () => {
    definirFontesFiscaisParaTeste({ leitor: planilhaFalsa({ ecf: [LINHA_ECF] }) });
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      // O cliente tenta impor o estado e um NCM: o NCM do de-para e o estado do servidor vencem.
      payload: payload({ fiscal: { ncm: "99999999", estado: "completo" } })
    });
    expect(criado.statusCode, criado.body).toBe(201);
    expect(await fiscalDaBase(json<RespostaId>(criado).data.id)).toMatchObject({
      ncm: "19059090",
      cst_pis_cofins: "1",
      tributacao_simples: "TRIBUTADO INTEGRAL",
      aliquota_ecf: "18,00%",
      aliquota_ecf_id: "03",
      reducao_icms: 53.33,
      categoria: "PRODUTOS DA CASA",
      origem_fiscal: "produto",
      estado_fiscal: "completo"
    });
  });

  it("Deve_UsarMargemDoGrupoDaPlanilha_NoPrecoAutomatico", async () => {
    definirFontesFiscaisParaTeste({ leitor: planilhaFalsa({ ecf: [LINHA_ECF] }) });
    const criado = await cadastrarProdutoNaLoja(
      contexto.app,
      cookieAdmin,
      payload({
        descricao: "PAO MARGEM",
        nomeCatalogo: "PAO MARGEM",
        codigoBarras: null,
        auto: true,
        custo: 40,
        quantidadeCaixa: 10
      })
    );
    expect(criado.statusCode, criado.body).toBe(201);
    const linha = await consultarUm<{ preco_venda: string }>("select preco_venda from produtos where id = $1", [
      json<RespostaId>(criado).data.id
    ]);
    // (40 / 10) * (1 + 0,25 da aba de grupos) = 5,00
    expect(Number(linha?.preco_venda)).toBe(5);
  });

  it("Deve_ListarRegrasPorGrupoComMargemDaPlanilha_E_Responder503SemFonte", async () => {
    definirFontesFiscaisParaTeste({ leitor: planilhaFalsa() });
    const lista = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/regras-fiscais",
      headers: { cookie: cookieAdmin }
    });
    expect(lista.statusCode, lista.body).toBe(200);
    expect(json<{ data: Array<{ grupo: string; margemPadrao: number | null }> }>(lista).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ grupo: "MER FISCAL TESTE", margemPadrao: 0.25 })])
    );

    definirFontesFiscaisParaTeste({});
    const semFonte = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/regras-fiscais",
      headers: { cookie: cookieAdmin }
    });
    assertProblem(semFonte, 503, "TAX_RULES_UNAVAILABLE");
  });

  it("Deve_MarcarFonteIndisponivel_SemDerrubarOCadastro", async () => {
    definirFontesFiscaisParaTeste({
      leitor: {
        async lerFaixasEmLote() {
          throw new Error("403 permission denied");
        }
      }
    });
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      payload: payload({ descricao: "PAO SEM PLANILHA", nomeCatalogo: "PAO SEM PLANILHA", codigoBarras: null })
    });
    expect(criado.statusCode, criado.body).toBe(201);
    expect((await fiscalDaBase(json<RespostaId>(criado).data.id))?.["estado_fiscal"]).toBe("fonte_indisponivel");
  });

  it("Deve_SoAdminAlterarFiscalManual_E_ReclassificarAoTrocarGrupo", async () => {
    definirFontesFiscaisParaTeste({ leitor: planilhaFalsa({ ecf: [LINHA_ECF] }) });
    const criado = await cadastrarProdutoNaLoja(
      contexto.app,
      cookieAdmin,
      payload({
        descricao: "PAO EDICAO FISCAL",
        nomeCatalogo: "PAO EDICAO FISCAL",
        codigoBarras: "7891000000024"
      })
    );
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<RespostaId>(criado).data.id;

    // Quem nao e admin nao altera campo fiscal digitavel.
    const gerente = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieGerente },
      payload: payload({
        descricao: "PAO EDICAO FISCAL",
        nomeCatalogo: "PAO EDICAO FISCAL",
        codigoBarras: "7891000000024",
        fiscal: { ncm: "12345678" }
      })
    });
    assertProblem(gerente, 403, "ONLY_ADMIN_FISCAL");

    // Trocar o grupo reclassifica pela regra nova.
    const troca = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieAdmin },
      payload: payload({
        grupoMercadoriaId: outroGrupo,
        descricao: "PAO EDICAO FISCAL",
        nomeCatalogo: "PAO EDICAO FISCAL",
        codigoBarras: "7891000000024"
      })
    });
    expect(troca.statusCode, troca.body).toBe(204);
    expect(await fiscalDo(id)).toMatchObject({ cst_pis_cofins: "6", tributacao_simples: "ALÍQUOTA ZERO" });
  });

  afterAll(async () => {
    await executarSql("delete from produtos where descricao like 'PAO %'");
    await executarSql("delete from produtos_catalogo_base where nome like 'PAO %'");
  });
});

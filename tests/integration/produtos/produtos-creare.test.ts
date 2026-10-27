import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../api/src/env.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";

/**
 * TXT do PDV CREARE (R-222, igual a `creare.integration.test.ts` do app oficial): desligado por padrao;
 * o lote se repete ate a entrega; so o que mudou entra no seguinte; hash errado nao registra nada.
 */
const TOKEN = "t".repeat(40);
const CONFIG = {
  TNP: {
    groupCodes: { Insumos: "0005" },
    categoryCodes: {},
    units: { UN: "UN", UCR: "UN", CX: "UN" },
    ecfTaxCodePadrao: "03",
    pisCofinsCstPadrao: "99",
    decimalPlaces: {
      unitPrice: 2,
      cost: 3,
      icmsReduction: 2,
      fullTaxRate: 2,
      fcpRate: 2,
      pisRate: 4,
      cofinsRate: 4,
      maximumQuantity: 3,
      minimumQuantity: 3
    },
    barcodeField: "extended",
    lineEnding: "CRLF",
    noPromotionDate: "30/12/99",
    iat: "A",
    ipptByProductType: { revenda: "T", transformacao: "P" },
    stockControlledByProductType: { revenda: "S", transformacao: "S" }
  }
};

describe("produtos - TXT do PDV CREARE", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let produtoId = "";
  const prefixosOriginais = new Map<string, string>();
  const original = {
    ligado: env.CREARE_EXPORT_ENABLED,
    config: env.CREARE_STORE_CONFIG_JSON,
    token: env.CREARE_EXPORT_TOKEN
  };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "multiempresa");
    // So a empresa A fica como TNP: o robo pede pela loja e a loja tem de ser unica.
    for (const empresa of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixosOriginais.set(empresa.id, empresa.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'OUTRA' where id <> $1", [idsTeste.empresaA]);
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    // O de-para da loja precisa existir (oficial: sem ele, 503). Uma linha alheia basta.
    await executarSql(
      `insert into sia_produto_depara (empresa_id, codigo_barras, chave_barras, coditem, pesavel)
       values ($1, '00000000999999', '999999', '999999', 'N')`,
      [idsTeste.empresaA]
    );
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      descricao: "CREARE PAO DE SAL",
      auto: false,
      precoVenda: 9.9,
      conversoes: []
    });
    expect(criado.statusCode, criado.body).toBe(201);
    produtoId = json<{ data: { id: string } }>(criado).data.id;
  }, 180_000);

  afterAll(async () => {
    env.CREARE_EXPORT_ENABLED = original.ligado;
    env.CREARE_STORE_CONFIG_JSON = original.config;
    env.CREARE_EXPORT_TOKEN = original.token;
    for (const [id, prefixo] of prefixosOriginais) {
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, prefixo]);
    }
    await executarSql("delete from creare_exportacao_entregas");
    await executarSql("delete from creare_exportacao_confirmacoes");
    await executarSql("delete from creare_exportacao_lotes");
    await executarSql("delete from sia_produto_depara where coditem = '999999'");
    await contexto.fechar();
  });

  const pedir = (url: string, opcoes: { token?: string; corpo?: object } = {}) =>
    contexto.app.inject({
      method: opcoes.corpo ? "POST" : "GET",
      url,
      headers: opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : { cookie: cookieAdmin },
      ...(opcoes.corpo ? { payload: opcoes.corpo } : {})
    });

  it("Deve_FicarDesligadoAteAVirada", async () => {
    env.CREARE_EXPORT_ENABLED = false;
    assertProblem(await pedir(`/api/creare/produtos.txt?empresaId=${idsTeste.empresaA}`), 503, "CREARE_DISABLED");
  });

  it("Deve_GerarOCatalogoCompleto_ComRegistrosDe363Posicoes", async () => {
    env.CREARE_EXPORT_ENABLED = true;
    env.CREARE_STORE_CONFIG_JSON = JSON.stringify(CONFIG);
    const resposta = await pedir(`/api/creare/produtos.txt?empresaId=${idsTeste.empresaA}`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(resposta.headers["content-type"]).toContain("text/plain");
    const linhas = resposta.body.split("\r\n").filter(Boolean);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((linha) => linha.length === 363)).toBe(true);
    expect(linhas.some((linha) => linha.includes("CREARE PAO DE SAL"))).toBe(true);
  });

  it("Deve_RepetirOLoteAteAEntrega_E_MandarSoOQueMudou", async () => {
    env.CREARE_EXPORT_TOKEN = TOKEN;
    assertProblem(await pedir("/api/creare/produtos.txt?loja=TNP&modo=pendentes", { token: "x".repeat(40) }), 401);
    const primeiro = await pedir("/api/creare/produtos.txt?loja=TNP&modo=pendentes", { token: TOKEN });
    expect(primeiro.statusCode, primeiro.body).toBe(200);
    const loteId = String(primeiro.headers["x-creare-lote-id"]);
    const sha256 = String(primeiro.headers["x-creare-sha256"]);
    // Sem entrega, o download devolve o MESMO lote (idempotente).
    const repetido = await pedir("/api/creare/produtos.txt?loja=TNP&modo=pendentes", { token: TOKEN });
    expect(repetido.headers["x-creare-lote-id"]).toBe(loteId);

    assertProblem(
      await pedir(`/api/creare/lotes/${loteId}/entrega?loja=TNP`, { token: TOKEN, corpo: { sha256: "0".repeat(64) } }),
      409,
      "CREARE_BATCH_HASH_MISMATCH"
    );
    const entrega = await pedir(`/api/creare/lotes/${loteId}/entrega?loja=TNP`, { token: TOKEN, corpo: { sha256 } });
    expect(entrega.statusCode, entrega.body).toBe(200);
    expect(json<{ data: { jaEntregue: boolean } }>(entrega).data.jaEntregue).toBe(false);

    // Tudo entregue: nada pendente.
    expect((await pedir("/api/creare/produtos.txt?loja=TNP&modo=pendentes", { token: TOKEN })).statusCode).toBe(204);

    // Mudou um produto: so ele entra no proximo lote.
    await executarSql("update produtos set marca = 'MARCA NOVA' where id = $1", [produtoId]);
    const seguinte = await pedir("/api/creare/produtos.txt?loja=TNP&modo=pendentes", { token: TOKEN });
    expect(seguinte.statusCode, seguinte.body).toBe(200);
    expect(seguinte.headers["x-creare-registros"]).toBe("1");
    expect(seguinte.body).toContain("MARCA NOVA");

    // Confirmar (auditoria) tambem avanca a entrega e e idempotente.
    const confirmar = (sha: string) =>
      pedir(`/api/creare/lotes/${String(seguinte.headers["x-creare-lote-id"])}/confirmar?loja=TNP`, {
        token: TOKEN,
        corpo: { sha256: sha }
      });
    const confirmado = await confirmar(String(seguinte.headers["x-creare-sha256"]));
    expect(json<{ data: { jaConfirmado: boolean } }>(confirmado).data.jaConfirmado).toBe(false);
    const deNovo = await confirmar(String(seguinte.headers["x-creare-sha256"]));
    expect(json<{ data: { jaConfirmado: boolean } }>(deNovo).data.jaConfirmado).toBe(true);
    const cursor = await consultarUm<{ total: number }>(
      "select count(*)::int as total from creare_exportacao_confirmacoes where produto_id = $1",
      [produtoId]
    );
    expect(cursor?.total).toBe(1);
  });

  it("Deve_MostrarASaudeDaExportacao_SoParaAdministrador", async () => {
    const saude = await pedir("/api/produtos/creare/saude");
    expect(saude.statusCode, saude.body).toBe(200);
    const dados = json<{ data: { ligado: boolean; lojas: Array<{ loja: string; casados: number }> } }>(saude).data;
    expect(dados.ligado).toBe(true);
    expect(dados.lojas.find((loja) => loja.loja === "TNP")?.casados).toBeGreaterThan(0);
  });
});

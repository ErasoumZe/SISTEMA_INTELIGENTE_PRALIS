import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../api/src/env.js";
import { definirLeitorDaDiscriminacaoParaTeste } from "../../../api/src/produtos/produtos-custo-mer.planilha.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * Custo pela discriminacao (R-222, DB-05; igual a `custo-mer` do app oficial): o custo da compra mais
 * recente, convertido para a embalagem (unitario x qtCad), gravado SO NA TNP (decisao de José, 28/10/2026).
 */
const FRASE = "ATUALIZAR CUSTO DA DISCRIMINACAO";

/** A aba como o Sheets devolve: titulo em cima, cabecalho na linha 3, um lancamento por compra. */
const ABA: string[][] = [
  ["DISCRIMINAÇÃO DE MERCADORIAS"],
  [],
  ["DATA REF", "FORNECEDOR", "PRODUTOS", "QTD", "VALOR CUSTO UN"],
  ["01/02/26", "X", "MER TESTE REFRI 600ML", "12", "3,90"],
  ["15/03/26", "X", "MER TESTE REFRI 600ML", "12", "4,10"],
  ["10/03/26", "X", "MER TESTE BISCOITO", "1", "2,50"],
  ["11/03/26", "X", "MER TESTE CHICLETE", "1", "0,004"],
  ["", "", "SUBTOTAL", "", ""]
];
const coluna = (indice: number) => ABA.slice(3).map((linha) => [linha[indice] ?? ""]);

describe("produtos - custo pela discriminacao (so TNP)", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  const prefixos = new Map<string, string>();
  const ids: Record<string, string> = {};
  const planilhaAntes = env.GOOGLE_PRODUTOS_MER_SPREADSHEET_ID;

  const inserir = async (empresaId: string, nome: string, quantidadeCaixa: number) =>
    (await consultarUm<{ id: string }>(
      "insert into produtos (empresa_id, descricao, nome_catalogo, quantidade_caixa) values ($1, $2, $2, $3) returning id",
      [empresaId, nome, quantidadeCaixa]
    ))!.id;
  const custo = async (id: string) =>
    (await consultarUm<{ custo: string | null }>("select custo from produtos where id = $1", [id]))?.custo ?? null;
  const previa = () =>
    contexto.app.inject({ method: "GET", url: "/api/produtos/custo-discriminacao/previa", headers: { cookie } });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'OUTRA' where id not in ($1, $2)", [
      idsTeste.empresaA,
      idsTeste.empresaB
    ]);
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    await executarSql("update empresas set matricula_prefixo = 'LI' where id = $1", [idsTeste.empresaB]);
    ids["refri"] = await inserir(idsTeste.empresaA, "MER TESTE REFRI 600ML", 12);
    ids["biscoito"] = await inserir(idsTeste.empresaA, "MER TESTE BISCOITO", 1);
    ids["chiclete"] = await inserir(idsTeste.empresaA, "MER TESTE CHICLETE", 1);
    ids["daLi"] = await inserir(idsTeste.empresaB, "MER TESTE REFRI 600ML", 12);
    definirLeitorDaDiscriminacaoParaTeste(async (_planilha, faixas) =>
      faixas.length === 1 ? [ABA.slice(0, 30)] : [coluna(2), coluna(4), coluna(0)]
    );
  }, 180_000);

  afterAll(async () => {
    env.GOOGLE_PRODUTOS_MER_SPREADSHEET_ID = planilhaAntes;
    definirLeitorDaDiscriminacaoParaTeste(null);
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await executarSql("delete from produtos where descricao like 'MER TESTE %'");
    await contexto.fechar();
  });

  it("Deve_ResponderSemDestino_QuandoAPlanilhaNaoEstaConfigurada", async () => {
    env.GOOGLE_PRODUTOS_MER_SPREADSHEET_ID = undefined;
    const resposta = await previa();
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(json<{ data: { estado: string; comCusto: number } }>(resposta).data).toMatchObject({
      estado: "sem-destino",
      comCusto: 0
    });
    assertProblem(
      await contexto.app.inject({
        method: "POST",
        url: "/api/produtos/custo-discriminacao",
        headers: { cookie },
        payload: { confirmacao: FRASE, hashPlano: "0".repeat(64) }
      }),
      503,
      "MER_INDISPONIVEL"
    );
  });

  it("Deve_GravarOCustoDaCompraMaisRecente_xEmbalagem_SoNaTnp", async () => {
    env.GOOGLE_PRODUTOS_MER_SPREADSHEET_ID = "planilha-mer-teste";
    const resposta = await previa();
    expect(resposta.statusCode, resposta.body).toBe(200);
    const dados = json<{
      data: {
        estado: string;
        linhaCabecalho: number;
        lancamentos: number;
        amostra: Array<{ productId: string; custoNovo: number }>;
        semCusto: Record<string, number>;
        hashPlano: string;
      };
    }>(resposta).data;
    expect(dados).toMatchObject({ estado: "ok", linhaCabecalho: 3, lancamentos: 4 });
    // 0,004 arredonda para zero: nao vira custo (preco automatico zero no PDV), conta como ilegivel.
    expect(dados.semCusto["custo-ilegivel"]).toBe(1);
    expect(dados.amostra.some((p) => p.productId === ids["chiclete"])).toBe(false);
    // Mais recente (15/03) e por embalagem: 4,10 x 12 = 49,20. A LI nao entra na previa.
    expect(dados.amostra.find((p) => p.productId === ids["refri"])?.custoNovo).toBe(49.2);
    expect(dados.amostra.some((p) => p.productId === ids["daLi"])).toBe(false);
    expect(await custo(ids["refri"]!)).toBeNull();

    assertProblem(
      await contexto.app.inject({
        method: "POST",
        url: "/api/produtos/custo-discriminacao",
        headers: { cookie },
        payload: { confirmacao: "SIM", hashPlano: dados.hashPlano }
      }),
      400,
      "CONFIRMACAO_INVALIDA"
    );
    // Gravar sobre outra previa: recusado, nada gravado.
    assertProblem(
      await contexto.app.inject({
        method: "POST",
        url: "/api/produtos/custo-discriminacao",
        headers: { cookie },
        payload: { confirmacao: FRASE, hashPlano: "f".repeat(64) }
      }),
      409,
      "PREVIA_DESATUALIZADA"
    );
    expect(await custo(ids["refri"]!)).toBeNull();
    const aplicado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/custo-discriminacao",
      headers: { cookie },
      payload: { confirmacao: FRASE, hashPlano: dados.hashPlano }
    });
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(await custo(ids["refri"]!)).toBe("49.20");
    expect(await custo(ids["biscoito"]!)).toBe("2.50");
    expect(await custo(ids["daLi"]!)).toBeNull();
    expect(await custo(ids["chiclete"]!)).toBeNull();
  });
});

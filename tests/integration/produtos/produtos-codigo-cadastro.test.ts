import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";

/**
 * Codigo de cadastro x SIA (R-222, igual a `codigo-cadastro` do app oficial): o lote adota so o balde de
 * certeza, a troca da BASE desce para a copia da loja, tudo com historico; decidir exige frase e o
 * codigo que a tela mostrava; cunhar so no balde "novo", acima do teto.
 */
const FRASE = "RECONCILIAR CODIGO DE CADASTRO";

/** EAN-13 valido a partir de 12 digitos. */
function ean13(doze: string): string {
  const soma = [...doze].reduce((total, digito, i) => total + Number(digito) * (i % 2 === 0 ? 1 : 3), 0);
  return `${doze}${(10 - (soma % 10)) % 10}`;
}

describe("produtos - codigo de cadastro x SIA", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  const prefixos = new Map<string, string>();
  const barras = ean13("789555000123");
  let copiaId = "";
  let baseId = "";

  const previa = async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/codigo-cadastro/previa",
      headers: { cookie }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{
      data: {
        teto: number;
        itens: Array<{ productId: string; balde: string; codigoAtual: string | null; codigoProposto: string | null }>;
      };
    }>(resposta).data;
  };
  const decidir = (payload: object) =>
    contexto.app.inject({ method: "POST", url: "/api/produtos/codigo-cadastro/decidir", headers: { cookie }, payload });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'OUTRA' where id <> $1", [idsTeste.empresaA]);
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    // O SIA da TNP conhece este EAN como coditem 10500.
    await executarSql(
      `insert into sia_produto_depara (empresa_id, codigo_barras, chave_barras, coditem, descricao, pesavel)
       values ($1, $2, $3, '10500', 'BOLO DE CENOURA', 'N')`,
      [idsTeste.empresaA, `0${barras}`, barras]
    );
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookie, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      descricao: "CODIGO BOLO CENOURA",
      codigoBarras: barras,
      conversoes: []
    });
    expect(criado.statusCode, criado.body).toBe(201);
    copiaId = json<{ data: { id: string } }>(criado).data.id;
    baseId =
      (await consultarUm<{ id: string }>("select produto_base_id as id from produtos where id = $1", [copiaId]))?.id ??
      "";
  }, 180_000);

  afterAll(async () => {
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await executarSql("delete from sia_produto_depara where coditem = '10500'");
    await executarSql("delete from produtos_historico_codigo_interno");
    await executarSql("delete from produtos_catalogo_base where id_origem = 'entrega-teste-codigo'");
    await contexto.fechar();
  });

  it("Deve_AdotarOExatoEmLote_PropagarParaALoja_E_GuardarHistorico", async () => {
    const antes = await previa();
    const item = antes.itens.find((i) => i.productId === baseId);
    expect(item).toMatchObject({ balde: "exato", codigoProposto: "10500" });
    const codigoAntigo = item!.codigoAtual;

    assertProblem(
      await contexto.app.inject({
        method: "POST",
        url: "/api/produtos/codigo-cadastro/adotar-exatos",
        headers: { cookie },
        payload: { confirmacao: "SIM" }
      }),
      400,
      "CONFIRMACAO_INVALIDA"
    );
    const lote = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/codigo-cadastro/adotar-exatos",
      headers: { cookie },
      payload: { confirmacao: FRASE }
    });
    expect(lote.statusCode, lote.body).toBe(200);
    expect(json<{ data: { aplicadas: number } }>(lote).data.aplicadas).toBeGreaterThanOrEqual(1);

    const base = await consultarUm<{ codigo: string; dados: string }>(
      "select codigo_interno as codigo, dados_oficiais->>'codigo_interno' as dados from produtos_catalogo_base where id = $1",
      [baseId]
    );
    expect(base).toEqual({ codigo: "10500", dados: "10500" });
    const copia = await consultarUm<{ codigo: string }>("select codigo_interno as codigo from produtos where id = $1", [
      copiaId
    ]);
    expect(copia?.codigo).toBe("10500");
    const historico = await consultarTodos<{
      produto_base_id: string | null;
      produto_id: string | null;
      codigo_anterior: string;
    }>(
      "select produto_base_id, produto_id, codigo_anterior from produtos_historico_codigo_interno where produto_base_id = $1 or produto_id = $2",
      [baseId, copiaId]
    );
    expect(historico).toHaveLength(2);
    expect(historico.find((h) => h.produto_base_id)?.codigo_anterior).toBe(codigoAntigo);

    // A tela velha (codigo antigo) nao sobrescreve a decisao ja tomada.
    assertProblem(
      await decidir({ productId: baseId, codigo: "10500", codigoAtualEsperado: codigoAntigo, confirmacao: FRASE }),
      409
    );
  });

  it("Deve_CunharSoNoBaldeNovo_AcimaDoTeto", async () => {
    // Codigo abaixo do piso do SIA e sem barras: "sem codigo da rede".
    await executarSql(
      "update produtos_catalogo_base set codigo_interno = '00077', codigo_barras = null where id = $1",
      [baseId]
    );
    await executarSql("update produtos set codigo_interno = '00077', codigo_barras = null where id = $1", [copiaId]);
    // Um codigo de entrega (>= 700000) gravado na BASE nao pode puxar a cunhagem para a faixa reservada.
    await executarSql(
      "insert into produtos_catalogo_base (id_origem, nome, codigo_interno, dados_oficiais) values ('entrega-teste-codigo', 'ENTREGA TESTE', '750001', '{}'::jsonb)"
    );
    const estado = await previa();
    expect(estado.itens.find((i) => i.productId === baseId)?.balde).toBe("novo");

    assertProblem(
      await decidir({
        productId: baseId,
        codigo: "10500",
        cunhar: true,
        codigoAtualEsperado: "00077",
        confirmacao: FRASE
      }),
      400
    );
    const cunhado = await decidir({
      productId: baseId,
      cunhar: true,
      codigoAtualEsperado: "00077",
      confirmacao: FRASE
    });
    expect(cunhado.statusCode, cunhado.body).toBe(200);
    const codigo = json<{ data: { codigo: string } }>(cunhado).data.codigo;
    expect(Number(codigo)).toBeGreaterThan(estado.teto);
    expect(Number(codigo)).toBeLessThan(700_000);
    const copia = await consultarUm<{ codigo: string }>("select codigo_interno as codigo from produtos where id = $1", [
      copiaId
    ]);
    expect(copia?.codigo).toBe(codigo);
  });
});

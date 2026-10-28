import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { definirLeitorDeGrupoIdsParaTeste } from "../../../api/src/produtos/produtos-grupo-id.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

type RespostaId = { data: { id: string } };

/**
 * F7 (doc 56): o ID do grupo no PDV segue o NOME do grupo, pela aba oficial AC/AD — como no paralelo.
 * O ID digitado nao entra; trocar o grupo troca o ID. A planilha e um leitor falso com a mesma faixa.
 */
describe("produtos - ID do grupo no PDV pelo nome (igual ao paralelo)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let grupoA = "";
  let grupoB = "";
  const faixas: string[][] = [];

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    const criarGrupo = async (nome: string) =>
      json<RespostaId>(
        await contexto.app.inject({
          method: "POST",
          url: "/api/grupos-mercadorias",
          headers: { cookie: cookieAdmin },
          payload: { empresaId: idsTeste.empresaA, tipoGrupo: "mercadoria", nome }
        })
      ).data.id;
    grupoA = await criarGrupo("MER GRUPO ID A");
    grupoB = await criarGrupo("MER GRUPO ID B");
    definirLeitorDeGrupoIdsParaTeste({
      async lerFaixasEmLote(lidas: string[]) {
        faixas.push(lidas);
        // A planilha traz o U+2060 invisivel no nome: casa pelo nome normalizado.
        return [
          [
            ["NOME GRUPO", "ID GRUPO"],
            ["MER ⁠GRUPO ID A", "61"],
            ["MER GRUPO ID B", "62"]
          ]
        ];
      }
    });
  }, 180_000);

  afterAll(async () => {
    definirLeitorDeGrupoIdsParaTeste(null);
    await contexto.fechar();
  });

  const payload = (descricao: string, grupoMercadoriaId: string, extra: Record<string, unknown> = {}) => ({
    empresaId: idsTeste.empresaA,
    grupoMercadoriaId,
    descricao,
    unidadeIndividualId: idsTeste.unidade,
    quantidadeIndividual: 1,
    conversoes: [],
    ...extra
  });

  it("Deve_GravarIdOficialDoGrupo_Quando_CriaNaBase_IgnorandoODigitado", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/base",
      headers: { cookie: cookieAdmin },
      payload: payload("PRODUTO GRUPO ID BASE", grupoA, { grupoIdExterno: "999" })
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const linha = await consultarUm<{ grupo_id_origem: string | null }>(
      "select grupo_id_origem from produtos_catalogo_base where id = $1",
      [json<RespostaId>(criado).data.id]
    );
    expect(linha?.grupo_id_origem).toBe("61");
    expect(faixas.flat()).toContain("'TNP/LI/HORA - VLD EXP -  GRUPOS/REF (VLD)'!AC5:AD");
  });

  it("Deve_TrocarOIdDoGrupo_Quando_LojaTrocaOGrupo", async () => {
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, payload("PRODUTO GRUPO ID LOJA", grupoA));
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<RespostaId>(criado).data.id;
    const idDoGrupo = async () =>
      (
        await consultarUm<{ grupo_id_externo: string | null }>("select grupo_id_externo from produtos where id = $1", [
          id
        ])
      )?.grupo_id_externo;
    expect(await idDoGrupo()).toBe("61");

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieAdmin }
    });
    const { codigo, codigoBarras } = json<{ data: { codigo: string | null; codigoBarras: string | null } }>(
      detalhe
    ).data;
    const trocado = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieAdmin },
      // O "61" velho continua indo do formulario: a troca de grupo manda, nao o campo digitado.
      payload: payload("PRODUTO GRUPO ID LOJA", grupoB, { codigo, codigoBarras, grupoIdExterno: "61" })
    });
    expect(trocado.statusCode, trocado.body).toBe(204);
    expect(await idDoGrupo()).toBe("62");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../api/src/env.js";
import { definirEscritorDaPlanilhaParaTeste } from "../../../api/src/produtos/produtos-planilha.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";

/**
 * Fila do espelho na planilha (R-222, oficial `product_sheet_sync` + reenvio): desligada nada entra;
 * ligada, a gravacao entra na fila na mesma transacao; falha espera e conta; sucesso ZERA o contador
 * (correcao do defeito do oficial, que contava a vida inteira do produto).
 */
describe("produtos - fila do espelho na planilha", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  const ligadoAntes = env.GOOGLE_PRODUTOS_ESPELHO_ENABLED;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 180_000);

  afterAll(async () => {
    env.GOOGLE_PRODUTOS_ESPELHO_ENABLED = ligadoAntes;
    definirEscritorDaPlanilhaParaTeste(null);
    await executarSql("delete from produtos_planilha_sincronizacoes");
    await contexto.fechar();
  });

  const criar = (descricao: string) =>
    cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      descricao,
      conversoes: []
    });
  const linhaDa = (produtoId: string) =>
    consultarUm<{ status: string; tentativas: number; ultimo_erro: string | null }>(
      "select status, tentativas, ultimo_erro from produtos_planilha_sincronizacoes where produto_id = $1",
      [produtoId]
    );
  const reenviar = () =>
    contexto.app.inject({
      method: "POST",
      url: "/api/produtos/planilha/reenvio",
      headers: { cookie: cookieAdmin },
      payload: { limite: 200 }
    });

  it("Deve_NaoEnfileirarNada_ComOEspelhoDesligado", async () => {
    env.GOOGLE_PRODUTOS_ESPELHO_ENABLED = false;
    const criado = await criar("FILA DESLIGADA");
    expect(criado.statusCode, criado.body).toBe(201);
    expect(await linhaDa(json<{ data: { id: string } }>(criado).data.id)).toBeNull();
    const resultado = await reenviar();
    expect(json<{ data: { ligado: boolean; tentados: number } }>(resultado).data).toMatchObject({
      ligado: false,
      tentados: 0
    });
  });

  it("Deve_Enfileirar_EsperarNaFalha_E_ZerarOContadorNoSucesso", async () => {
    env.GOOGLE_PRODUTOS_ESPELHO_ENABLED = true;
    const criado = await criar("FILA LIGADA");
    expect(criado.statusCode, criado.body).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;
    expect((await linhaDa(produtoId))?.status).toBe("pendente");

    definirEscritorDaPlanilhaParaTeste({
      async escrever() {
        throw new Error("Google fora do ar");
      }
    });
    await reenviar();
    expect(await linhaDa(produtoId)).toMatchObject({
      status: "falhou",
      tentativas: 1,
      ultimo_erro: "Error: Google fora do ar"
    });

    // Ainda na espera: a proxima rodada nao tenta de novo.
    const naEspera = await reenviar();
    expect(json<{ data: { tentados: number } }>(naEspera).data.tentados).toBe(0);

    // Espera vencida e Google de volta: sincroniza e o contador volta a zero.
    await executarSql(
      "update produtos_planilha_sincronizacoes set proxima_tentativa_em = now() - interval '1 minute' where produto_id = $1",
      [produtoId]
    );
    definirEscritorDaPlanilhaParaTeste({ escrever: async () => ({ linha: 12 }) });
    await reenviar();
    expect(await linhaDa(produtoId)).toMatchObject({ status: "sincronizado", tentativas: 0, ultimo_erro: null });

    // Edicao no MEIO do reenvio: a escrita termina, mas a pendencia nova nao pode virar "sincronizado".
    await executarSql("update produtos_planilha_sincronizacoes set status = 'pendente' where produto_id = $1", [
      produtoId
    ]);
    definirEscritorDaPlanilhaParaTeste({
      async escrever() {
        await executarSql(
          "update produtos_planilha_sincronizacoes set status = 'pendente', atualizado_em = now() + interval '1 second' where produto_id = $1",
          [produtoId]
        );
        return { linha: 12 };
      }
    });
    await reenviar();
    expect((await linhaDa(produtoId))?.status).toBe("pendente");

    const fila = await contexto.app.inject({
      method: "GET",
      url: "/api/produtos/planilha/fila",
      headers: { cookie: cookieAdmin }
    });
    expect(json<{ data: { ligado: boolean; porStatus: Record<string, number> } }>(fila).data.ligado).toBe(true);
  });
});

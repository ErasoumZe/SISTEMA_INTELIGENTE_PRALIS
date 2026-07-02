import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm } from "../../setup/integracao.js";

function payloadVendaIntegrada(idVenda: string) {
  return {
    DadosIntegracao: { origem: "vitest" },
    Venda: {
      idVenda,
      idCaixa: "PDV-EXT",
      nomeCaixa: "PDV Integracao",
      idCliente: "CLIENTE-EXT",
      nomeCliente: "Cliente Integracao",
      documentoCliente: "00000000000999",
      dataHoraVenda: "2026-06-30T10:30:00.000Z",
      valorOriginal: 15,
      desconto: 0,
      acrescimo: 0,
      valorTotal: 15,
      statusVenda: "aprovado",
      numeroNotaFiscal: "NF-INT"
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-ITEM-1`,
        idProduto: "PROD-EXT",
        descricaoProduto: "Produto Integracao",
        dataHoraItem: "2026-06-30T10:30:00.000Z",
        quantidade: 1,
        valorUnitario: 15,
        total: 15,
        itemCancelado: false
      }
    ],
    PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor: 15 }]
  };
}

describe("integracoes integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarChavesEConfigDaIntegracao_Quando_UsuarioTemPermissao", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/integracoes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain(idsTeste.integracaoCodigo);
  });

  it("Deve_ListarDicionarioDaIntegracao_Quando_UsuarioTemPermissao", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/integracoes/dicionario?empresaId=${idsTeste.empresaA}&tipo=vendas`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("produto");
    expect(JSON.stringify(resposta.json())).toContain("PROD-EXT");
  });

  it("Deve_CriarInativarChaveEProtegerInativacaoDeEmpresaNaoPermitida", async () => {
    const cookieAdmin = await cookieSessao(contexto.app, "admin");
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes/chaves",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, tipo: "vendas" }
    });
    expect(criar.statusCode).toBe(201);
    const chaveId = criar.json().data.id;

    const inativar = await contexto.app.inject({
      method: "POST",
      url: `/api/integracoes/chaves/${chaveId}/inativar`,
      headers: { cookie: cookieAdmin }
    });
    expect(inativar.statusCode).toBe(204);
    await expect(
      consultarUm("select id from integracoes_chaves where id = $1 and inativado_em is not null", [chaveId])
    ).resolves.toBeTruthy();

    const cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
    const chaveEmpresaB = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes/chaves",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaId: idsTeste.empresaB, tipo: "vendas" }
    });
    expect(chaveEmpresaB.statusCode).toBe(201);
    const chaveEmpresaBId = chaveEmpresaB.json().data.id;
    const inativarProibida = await contexto.app.inject({
      method: "POST",
      url: `/api/integracoes/chaves/${chaveEmpresaBId}/inativar`,
      headers: { cookie: cookieAdmin }
    });
    assertProblem(inativarProibida, 403);
  });

  it("Deve_AtualizarCampoESalvarVinculo_Quando_PayloadValido", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");
    const campo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/campos",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        campo: "cliente",
        criarAutomaticamente: false,
        vincularAutomaticamente: false
      }
    });
    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "cliente",
        identificadorExterno: "CLIENTE-EXT-2",
        descricaoExterna: "Cliente vinculado por teste",
        registroSistemaId: idsTeste.cliente
      }
    });

    expect(campo.statusCode).toBe(204);
    expect(vinculo.statusCode).toBe(204);
    await expect(
      consultarUm(
        "select campo from integracoes_campos_config where empresa_id = $1 and campo = 'cliente' and criar_automaticamente = false and vincular_automaticamente = false",
        [idsTeste.empresaA]
      )
    ).resolves.toBeTruthy();
    await expect(
      consultarUm(
        "select id from integracoes_vinculos where empresa_id = $1 and identificador_externo = $2 and registro_sistema_id = $3",
        [idsTeste.empresaA, "CLIENTE-EXT-2", idsTeste.cliente]
      )
    ).resolves.toBeTruthy();
  });

  it("Deve_Retornar403_Quando_GerenciarIntegracaoDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");
    const criarChave = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes/chaves",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaB, tipo: "vendas" }
    });
    const atualizarCampo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/campos",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaB,
        tipo: "vendas",
        campo: "produto",
        criarAutomaticamente: true,
        vincularAutomaticamente: true
      }
    });
    const salvarVinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie },
      payload: {
        empresaId: idsTeste.empresaB,
        tipo: "vendas",
        tipoRegistro: "produto",
        identificadorExterno: "PROD-PROIBIDO",
        descricaoExterna: "Produto proibido",
        registroSistemaId: idsTeste.produto
      }
    });

    assertProblem(criarChave, 403);
    assertProblem(atualizarCampo, 403);
    assertProblem(salvarVinculo, 403);
  });

  it("Deve_Retornar401_Quando_ChaveNaoForInformada", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      payload: payloadVendaIntegrada("VENDA-SEM-CHAVE")
    });

    assertProblem(resposta, 401, "INVALID_INTEGRATION_KEY");
  });

  it("Deve_Retornar401_Quando_ChaveForInvalida", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": "CHAVE-INVALIDA" },
      payload: payloadVendaIntegrada("VENDA-CHAVE-INVALIDA")
    });

    assertProblem(resposta, 401, "INVALID_INTEGRATION_KEY");
  });

  it("Deve_ReceberVendaIntegrada_Quando_ChaveRealForValida", async () => {
    const identificador = "VENDA-INTEGRADA-001";
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: payloadVendaIntegrada(identificador)
    });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ data: { status: "criado", identificadorExterno: identificador } });

    const registro = await consultarUm<{ registro_sistema_id: string }>(
      "select registro_sistema_id from integracoes_registros where identificador_externo = $1",
      [identificador]
    );
    const venda = await consultarUm<{ identificador_externo: string }>(
      "select identificador_externo from vendas where identificador_externo = $1",
      [identificador]
    );
    expect(registro?.registro_sistema_id).toBeTruthy();
    expect(venda?.identificador_externo).toBe(identificador);
  });

  it("Deve_RetornarSemNovidadeEAtualizado_Quando_ReenviarPayloadIntegrado", async () => {
    const identificador = "VENDA-INTEGRADA-REPLAY";
    const payload = payloadVendaIntegrada(identificador);
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
    const semNovidade = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
    const atualizadoPayload = payloadVendaIntegrada(identificador);
    atualizadoPayload.Venda.valorOriginal = 16;
    atualizadoPayload.Venda.valorTotal = 16;
    atualizadoPayload.ItensVenda[0]!.valorUnitario = 16;
    atualizadoPayload.ItensVenda[0]!.total = 16;
    atualizadoPayload.PagamentosVenda[0]!.valor = 16;
    const atualizado = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload: atualizadoPayload
    });

    expect(criado.json()).toMatchObject({ data: { status: "criado" } });
    expect(semNovidade.json()).toMatchObject({ data: { status: "sem_novidade" } });
    expect(atualizado.json()).toMatchObject({ data: { status: "atualizado" } });
  });

  it("Deve_ListarHistoricoDaIntegracao_AposIngestao", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/integracoes/historico?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    expect(JSON.stringify(resposta.json())).toContain("vendas");
  });
});

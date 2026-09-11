// RED-2 da #41 · REENVIO DEPOIS DE ROTACAO DE CREDENCIAL. Sem corrida, sem concorrencia.
//
// SINTOMA QUE ESTE ARQUIVO PRENDE: trocar a chave da integracao faz a MESMA venda ser ingerida de
// novo como se fosse inedita. Duas linhas em `vendas` para um unico `idVenda`, sequencialmente,
// sem nenhuma disputa.
//
// MECANISMO, verificado no codigo: `buscarRegistroIntegracaoRepository` filtra por
// `integracao_chave_id` (api/src/integracoes/integracoes.repository.ts), porque o unique de
// `integracoes_registros` e (empresa_id, integracao_chave_id, tipo_registro, identificador_externo).
// Com a chave nova, o registro da chave antiga nao e encontrado, `registro` volta nulo e o servico
// toma o caminho de INSERT para uma venda que JA EXISTE.
//
// POR QUE ESTE ARQUIVO E O QUE JUSTIFICA A R-175: a chave unica da #41 e
// (empresa_id, identificador_externo), com `integracao_chave_id` apenas no PREDICADO do indice
// parcial. Se alguem puser `integracao_chave_id` DENTRO da chave, a rotacao gera uma tupla nova, o
// indice deixa a segunda venda entrar e ESTE ARQUIVO CONTINUA VERMELHO depois da migration — que e
// exatamente o sinal de que a chave esta errada.
//
// A rotacao nao e hipotese: criar chave e inativar chave sao rotas normais
// (`POST /api/integracoes/chaves` e `POST /api/integracoes/chaves/:id/inativar`), e
// `buscarChavePorCodigoHashRepository` so aceita chave com `ativa = true`.
//
// A chave do seed NAO e tocada: este arquivo cria as duas chaves que usa, para nao derrubar os
// outros testes de integracao.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

const PDV_EXTERNO = "PDV-41-ROTACAO";
const DATA_VENDA = "2026-06-30T13:00:00.000Z";
const VENDA = "R41-ROTACAO-VENDA";

type Resposta = { statusCode: number; body: string; json: () => unknown };

function payloadVenda(idVenda: string) {
  return {
    DadosIntegracao: { origem: "vitest-r41-rotacao" },
    Venda: {
      idVenda,
      idCaixa: PDV_EXTERNO,
      nomeCaixa: "PDV 41 rotacao",
      idCliente: null,
      nomeCliente: null,
      documentoCliente: null,
      dataHoraVenda: DATA_VENDA,
      valorOriginal: 33,
      desconto: 0,
      acrescimo: 0,
      valorTotal: 33,
      statusVenda: "aprovado",
      numeroNotaFiscal: null
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-ITEM-1`,
        idProduto: "PROD-R41-ROT",
        descricaoProduto: "Sonho (R41 rotacao)",
        dataHoraItem: DATA_VENDA,
        quantidade: 1,
        valorUnitario: 33,
        total: 33,
        itemCancelado: false
      }
    ],
    PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor: 33 }]
  };
}

describe("#41 · reenvio depois de trocar a chave da integracao", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let chaveAntigaId: string;
  let codigoAntigo: string;
  let chaveNovaId: string;
  let codigoNovo: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");

    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: "Conta R41 rotacao" });
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV R41 rotacao",
      contaId,
      ativo: true
    });
    const pdvId = json<{ data: { id: string } }>(pdv).data.id;

    const vinculo = await contexto.app.inject({
      method: "PUT",
      url: "/api/integracoes/vinculos",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        tipo: "vendas",
        tipoRegistro: "pdv",
        identificadorExterno: PDV_EXTERNO,
        descricaoExterna: "PDV R41 rotacao",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: usuario.id,
      dataHoraAbertura: "2026-06-29T08:00",
      observacao: "Caixa R41 rotacao"
    });

    // O codigo cru nao volta na resposta da rota (so o id) — ele vive em `integracoes_chaves.codigo`.
    ({ id: chaveAntigaId, codigo: codigoAntigo } = await criarChave());
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criar(url: string, payload: object) {
    const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  async function criarChave() {
    const resposta = await criar("/api/integracoes/chaves", { empresaId: idsTeste.empresaA, tipo: "vendas" });
    const id = json<{ data: { id: string } }>(resposta).data.id;
    const linha = await consultarUm<{ codigo: string }>("select codigo from integracoes_chaves where id = $1", [id]);
    if (!linha) throw new Error("Chave criada nao encontrada");
    return { id, codigo: linha.codigo };
  }

  function enviarCom(codigo: string, payload: object): Promise<Resposta> {
    return contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": codigo },
      payload
    });
  }

  async function vendasDe(identificadorExterno: string) {
    return consultarTodos<{ id: string; integracao_chave_id: string | null; valor_original: string }>(
      "select id, integracao_chave_id, valor_original from vendas where identificador_externo = $1 order by criado_em",
      [identificadorExterno]
    );
  }

  it("a venda entra uma vez com a chave antiga", async () => {
    const resposta = await enviarCom(codigoAntigo, payloadVenda(VENDA));
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(json<{ data: { status: string } }>(resposta).data.status).toBe("criado");

    const linhas = await vendasDe(VENDA);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.integracao_chave_id).toBe(chaveAntigaId);
  });

  it("depois de trocar a credencial, o MESMO idVenda nao pode virar uma segunda venda", async () => {
    // Rotacao real: inativa a antiga, cria a nova.
    const inativacao = await contexto.app.inject({
      method: "POST",
      url: `/api/integracoes/chaves/${chaveAntigaId}/inativar`,
      headers: { cookie: cookieAdmin }
    });
    expect(inativacao.statusCode, inativacao.body).toBe(204);
    ({ id: chaveNovaId, codigo: codigoNovo } = await criarChave());
    expect(chaveNovaId).not.toBe(chaveAntigaId);

    // A chave antiga tem de estar mesmo fora do ar — senao a rotacao nao foi rotacao.
    const comAntiga = await enviarCom(codigoAntigo, payloadVenda(VENDA));
    expect(comAntiga.statusCode, `a chave inativada deveria ser recusada: ${comAntiga.body}`).toBe(401);

    // Payload IDENTICO, chave nova.
    const resposta = await enviarCom(codigoNovo, payloadVenda(VENDA));
    expect(resposta.statusCode, resposta.body).toBe(200);

    const linhas = await vendasDe(VENDA);
    expect(
      linhas.length,
      `trocar a chave nao pode duplicar a venda ${VENDA}: esperado 1, encontrado ${linhas.length}. ` +
        `Este e o caso que a R-175 protege — com \`integracao_chave_id\` DENTRO da chave unica, ` +
        `a tupla seria nova e a duplicata passaria mesmo depois da migration. ` +
        `Resposta=${resposta.body}`
    ).toBe(1);

    expect(
      json<{ data: { status: string } }>(resposta).data.status,
      "com a venda ja existente, a ingestao pela chave nova e uma ATUALIZACAO, nunca uma criacao"
    ).toBe("atualizado");

    expect(linhas[0]?.integracao_chave_id, "a venda passa a responder pela chave vigente").toBe(chaveNovaId);
  });

  it("os dois registros de integracao apontam para a MESMA venda", async () => {
    const linhas = await vendasDe(VENDA);
    const vendaId = linhas[0]?.id;

    const registros = await consultarTodos<{ integracao_chave_id: string; registro_sistema_id: string }>(
      `select integracao_chave_id, registro_sistema_id
         from integracoes_registros
        where identificador_externo = $1 and tipo_registro = 'venda'
        order by criado_em`,
      [VENDA]
    );

    expect(registros.map((linha) => linha.integracao_chave_id).sort()).toEqual([chaveAntigaId, chaveNovaId].sort());
    for (const registro of registros) {
      expect(
        registro.registro_sistema_id,
        "o historico da chave antiga continua valido e aponta para a mesma venda"
      ).toBe(vendaId);
    }
  });

  it("reenviar de novo pela chave nova nao cria uma terceira venda", async () => {
    const resposta = await enviarCom(codigoNovo, payloadVenda(VENDA));
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(json<{ data: { status: string } }>(resposta).data.status).toBe("sem_novidade");
    expect((await vendasDe(VENDA)).length).toBe(1);
  });
});

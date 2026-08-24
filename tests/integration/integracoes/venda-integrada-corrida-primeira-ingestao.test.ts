// RED-1 da #41 · CORRIDA NA PRIMEIRA INGESTAO da mesma venda (as duas ordens).
//
// SINTOMA QUE ESTE ARQUIVO PRENDE: duas entregas simultaneas do MESMO `idVenda` criam DUAS linhas
// em `vendas`. Uma delas fica orfa — com itens e pagamentos completos — porque `integracoes_registros`
// so aponta para uma. Hoje isso e invisivel para o saldo das contas (venda integrada nasce com
// `conta_origem_id` nulo); quando a #152 fizer a venda creditar conta, a orfa credita de novo.
//
// MECANISMO, verificado no codigo:
//   - `travarVendaRepository` — o UNICO ponto que serializa — vive dentro de
//     `if (registro?.registroSistemaId)` (api/src/integracoes/integracoes.service.ts). Sem registro
//     previo, ele nao roda: nada serializa a primeira ingestao;
//   - a trava do caixa e `FOR SHARE` (`travarCaixaCompartilhadoRepository`), que CONVIVE consigo
//     mesma — duas ingestoes passam juntas por ela;
//   - `vendas` nao tem UNIQUE em `identificador_externo` (db/src/schema/app.schema.ts), entao os
//     dois INSERT passam;
//   - so no fim `upsertRegistroIntegracaoRepository` serializa, no unique de
//     `integracoes_registros`, e o segundo faz `DO UPDATE` apontando o registro para a SUA venda.
//
// COMO A JANELA E FORCADA, sem sleep e sem sorteio: as duas requisicoes leem o registro ANTES de
// pedir a trava do caixa. Um cliente externo segurando a linha do caixa com `FOR UPDATE` enfileira
// as duas DEPOIS dessa leitura — as duas ja tem `registro = null` na mao. Soltando a trava, nada
// mais as separa ate o INSERT. O resultado de hoje e fixo em qualquer ordem: DUAS vendas.
//
// AQUECIMENTO OBRIGATORIO: uma venda previa, com outro `idVenda` mas o MESMO pdv/produto/forma,
// resolve todos os vinculos antes da corrida. Sem ela, as duas concorrentes disputariam o unique de
// `integracoes_vinculos` e serializariam ANTES do INSERT — o teste mediria outra coisa.
//
// As asserts descrevem o comportamento DESEJADO (uma venda, um 200 e um 5xx transitorio), entao o
// arquivo fica VERMELHO ate a #41 existir. E o RED de proposito.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  consultarTodos,
  consultarUm,
  esperarCadeiaDeBloqueio,
  fecharBloqueador,
  json
} from "../../setup/integracao.js";

const PDV_EXTERNO = "PDV-41-CORRIDA";
const DATA_VENDA = "2026-06-30T12:00:00.000Z";
const VENDA_AQUECIMENTO = "R41-CORRIDA-AQUECIMENTO";
const VENDA_ORDEM_AB = "R41-CORRIDA-ORDEM-AB";
const VENDA_ORDEM_BA = "R41-CORRIDA-ORDEM-BA";

type Resposta = { statusCode: number; body: string; json: () => unknown };

// Payload IDENTICO nas duas pontas de proposito: e o cenario real de entrega em duplicidade do
// agente (retry que cruza com a chamada original), nao dois payloads diferentes.
function payloadVenda(idVenda: string) {
  return {
    DadosIntegracao: { origem: "vitest-r41-corrida" },
    Venda: {
      idVenda,
      idCaixa: PDV_EXTERNO,
      nomeCaixa: "PDV 41 corrida",
      idCliente: null,
      nomeCliente: null,
      documentoCliente: null,
      dataHoraVenda: DATA_VENDA,
      valorOriginal: 25,
      desconto: 0,
      acrescimo: 0,
      valorTotal: 25,
      statusVenda: "aprovado",
      numeroNotaFiscal: null
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-ITEM-1`,
        idProduto: "PROD-R41",
        descricaoProduto: "Pao frances (R41)",
        dataHoraItem: DATA_VENDA,
        quantidade: 1,
        valorUnitario: 25,
        total: 25,
        itemCancelado: false
      }
    ],
    PagamentosVenda: [{ idVenda, idFormaPagamento: "DIN", descricaoFormaPagamento: "Dinheiro", valor: 25 }]
  };
}

describe("#41 · corrida na primeira ingestao da venda integrada", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let caixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");

    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: "Conta R41 corrida" });
    const contaId = json<{ data: { id: string } }>(conta).data.id;

    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV R41 corrida",
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
        descricaoExterna: "PDV R41 corrida",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    const abertura = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: usuario.id,
      dataHoraAbertura: "2026-06-29T08:00",
      observacao: "Caixa R41 corrida"
    });
    caixaId = json<{ data: { id: string } }>(abertura).data.id;

    // AQUECIMENTO: resolve produto e forma de pagamento fora da corrida.
    const aquecimento = await enviar(payloadVenda(VENDA_AQUECIMENTO));
    expect(aquecimento.statusCode, aquecimento.body).toBe(200);
    expect(
      (await vendasDe(VENDA_AQUECIMENTO)).length,
      "o aquecimento precisa gravar exatamente uma venda antes da corrida"
    ).toBe(1);
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criar(url: string, payload: object) {
    const resposta = await contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  function enviar(payload: object): Promise<Resposta> {
    return contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
  }

  async function vendasDe(identificadorExterno: string) {
    return consultarTodos<{ id: string; integracao_chave_id: string | null; caixa_id: string | null }>(
      "select id, integracao_chave_id, caixa_id from vendas where identificador_externo = $1 order by criado_em",
      [identificadorExterno]
    );
  }

  /**
   * Enfileira as duas ingestoes na trava do caixa e solta as duas de uma vez.
   *
   * `esperarCadeiaDeBloqueio` (e nao `esperarBloqueioPor`) porque a segunda requisicao espera o
   * `tuple` lock da PRIMEIRA, nao o bloqueador — a armadilha esta documentada em
   * tests/setup/integracao.ts. Condicao, nunca sleep.
   */
  async function corrida(idVenda: string): Promise<[Resposta, Resposta]> {
    const bloqueador = await abrirBloqueador();
    let primeira: Promise<Resposta>;
    let segunda: Promise<Resposta>;
    try {
      await bloqueador.cliente.query("begin");
      await bloqueador.cliente.query("select id from fechamentos_caixa where id = $1 for update", [caixaId]);

      primeira = enviar(payloadVenda(idVenda));
      expect(
        await esperarCadeiaDeBloqueio(bloqueador, 1),
        "a primeira ingestao deveria estar parada na trava do caixa"
      ).toBe(true);

      segunda = enviar(payloadVenda(idVenda));
      expect(
        await esperarCadeiaDeBloqueio(bloqueador, 2),
        "as DUAS ingestoes deveriam estar na fila da linha do caixa"
      ).toBe(true);
    } finally {
      await fecharBloqueador(bloqueador);
    }
    // Tupla, nao array: com `noUncheckedIndexedAccess` o indice de array e `T | undefined`.
    return await Promise.all([primeira!, segunda!]);
  }

  // O invariante e o MESMO nas duas ordens, e isso e mais forte que afirmar quem vence: seja quem
  // for o primeiro da fila FIFO do Postgres, tem de sobrar UMA venda.
  async function conferirInvariante(idVenda: string, respostas: [Resposta, Resposta]) {
    const [a, b] = respostas;
    const linhas = await vendasDe(idVenda);

    expect(
      linhas.length,
      `duas entregas simultaneas de ${idVenda} deveriam produzir UMA venda; ` +
        `hoje produzem ${linhas.length} (a excedente fica orfa, com itens e pagamentos completos). ` +
        `A=${a.statusCode} ${a.body} | B=${b.statusCode} ${b.body}`
    ).toBe(1);

    const aceitas = [a, b].filter((resposta) => resposta.statusCode === 200);
    const transitorias = [a, b].filter((resposta) => resposta.statusCode >= 500);
    expect(aceitas, `exatamente uma entrega deveria ser aceita. A=${a.body} | B=${b.body}`).toHaveLength(1);
    // 5xx, NUNCA 4xx: a R-013 proibe recusar venda integrada — um 4xx faria o agente DESCARTAR a
    // venda, enquanto o 5xx e re-tentado no ciclo seguinte.
    expect(
      transitorias,
      `a perdedora deveria receber erro TRANSITORIO 5xx (a R-013 proibe 4xx aqui). A=${a.statusCode} | B=${b.statusCode}`
    ).toHaveLength(1);

    const vendaId = linhas[0]?.id;
    const registro = await consultarUm<{ registro_sistema_id: string }>(
      "select registro_sistema_id from integracoes_registros where identificador_externo = $1 and tipo_registro = 'venda'",
      [idVenda]
    );
    expect(registro?.registro_sistema_id, "o registro da integracao deveria apontar para a venda que sobrou").toBe(
      vendaId
    );

    const filhas = await consultarUm<{ produtos: string; pagamentos: string }>(
      `select (select count(*) from vendas_produtos vp
                 join vendas v on v.id = vp.venda_id where v.identificador_externo = $1)::text as produtos,
              (select count(*) from vendas_pagamentos vp
                 join vendas v on v.id = vp.venda_id where v.identificador_externo = $1)::text as pagamentos`,
      [idVenda]
    );
    expect(filhas?.produtos, "um item so, sem empilhar a copia da venda orfa").toBe("1");
    expect(filhas?.pagamentos, "um pagamento so, sem empilhar a copia da venda orfa").toBe("1");
  }

  it("ordem A->B: primeira entrega na frente da fila", async () => {
    await conferirInvariante(VENDA_ORDEM_AB, await corrida(VENDA_ORDEM_AB));
  });

  // Mesma corrida com a ordem de entrada na fila invertida. A fila de locks do Postgres e FIFO,
  // entao trocar quem dispara primeiro troca quem chega primeiro ao INSERT.
  it("ordem B->A: a fila invertida tem de dar o mesmo invariante", async () => {
    const [b, a] = await corrida(VENDA_ORDEM_BA);
    await conferirInvariante(VENDA_ORDEM_BA, [a, b]);
  });

  it("o reenvio depois da corrida nao pode criar uma terceira venda", async () => {
    const antes = (await vendasDe(VENDA_ORDEM_AB)).length;
    const reenvio = await enviar(payloadVenda(VENDA_ORDEM_AB));
    expect(reenvio.statusCode, reenvio.body).toBe(200);
    const depois = await vendasDe(VENDA_ORDEM_AB);
    expect(depois.length, `o reenvio nao pode acrescentar venda: antes=${antes}, depois=${depois.length}`).toBe(antes);
    expect(json<{ data: { status: string } }>(reenvio).data.status).toMatch(/sem_novidade|atualizado/u);
  });
});

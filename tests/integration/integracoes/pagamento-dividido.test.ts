import { paraCentavos } from "@padaria/shared/dinheiro";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

// D-06 · Venda integrada com pagamento DIVIDIDO (2 e 3 formas).
// O bug historico mais citado: venda dividida contada 2x/3x no caixa (~R$1.000 de diferenca). Todo
// payload de teste ate aqui tinha UMA forma de pagamento, entao o caminho dividido nunca rodou.
//
// Valores ASSIMETRICOS de proposito (7,31 + 4,27 + 3,42 = 15,00): se o total do caixa multiplicar
// pela quantidade de formas, ou se um pagamento empilhar num reenvio, a conta nao fecha por acaso.
//
// Todos os casos usam UM caixa dedicado (PDV + conta proprios), aberto no beforeAll, para que
// `totalEntradas` do caixa contenha SOMENTE as vendas deste arquivo.

const PDV_EXTERNO = "PDV-D06-DIVIDIDO";
const DATA_VENDA = "2026-06-30T12:00:00.000Z";

const VENDA_2_FORMAS = "D06-DIVIDIDO-2FORMAS";
const VENDA_3_FORMAS = "D06-DIVIDIDO-3FORMAS";

interface FormaPagamento {
  id: string;
  descricao: string;
  valor: number;
}

interface PagamentoGravado {
  tipo_pagamento_automacao_id: string;
  tipo_pagamento_automacao: string;
  total_pago: string;
}

const RATEIO_2_FORMAS: FormaPagamento[] = [
  { id: "DIN", descricao: "Dinheiro", valor: 7.31 },
  { id: "D06-CARTAO", descricao: "Cartao D06", valor: 4.27 }
];

const RATEIO_3_FORMAS: FormaPagamento[] = [
  { id: "DIN", descricao: "Dinheiro", valor: 7.31 },
  { id: "D06-CARTAO", descricao: "Cartao D06", valor: 4.27 },
  { id: "D06-PIX", descricao: "Pix D06", valor: 3.42 }
];

// Mesmo total, rateio diferente e com MENOS formas: prova que o antigo sai e o novo entra inteiro.
const RATEIO_ALTERADO: FormaPagamento[] = [
  { id: "DIN", descricao: "Dinheiro", valor: 9.13 },
  { id: "D06-VOUCHER", descricao: "Voucher D06", valor: 5.87 }
];

// O total da venda e DERIVADO do rateio: constante mantida a mao poderia divergir da soma e deixar
// o teste "verde" com um payload incoerente.
function totalDoRateio(formas: FormaPagamento[]): number {
  return formas.reduce((total, forma) => total + paraCentavos(forma.valor), 0);
}

const TOTAL_2_FORMAS = totalDoRateio(RATEIO_2_FORMAS);
const TOTAL_3_FORMAS = totalDoRateio(RATEIO_3_FORMAS);

// Espelha a ordenacao da consulta (valor desc, depois identificador) para nao depender da ordem em
// que o rateio foi declarado aqui em cima.
function esperado(formas: FormaPagamento[]) {
  return formas
    .map((forma) => ({ forma: forma.id, descricao: forma.descricao, centavos: paraCentavos(forma.valor) }))
    .sort((a, b) => b.centavos - a.centavos || a.forma.localeCompare(b.forma));
}

function payloadDividido(idVenda: string, totalCentavos: number, formas: FormaPagamento[]) {
  const valorTotal = totalCentavos / 100;
  return {
    DadosIntegracao: { origem: "vitest-d06" },
    Venda: {
      idVenda,
      idCaixa: PDV_EXTERNO,
      nomeCaixa: "PDV D06 pagamento dividido",
      idCliente: null,
      nomeCliente: null,
      documentoCliente: null,
      dataHoraVenda: DATA_VENDA,
      valorOriginal: valorTotal,
      desconto: 0,
      acrescimo: 0,
      valorTotal,
      statusVenda: "aprovado",
      numeroNotaFiscal: null
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-ITEM-1`,
        idProduto: "PROD-D06",
        descricaoProduto: "Cesta variada (D06)",
        dataHoraItem: DATA_VENDA,
        quantidade: 1,
        valorUnitario: valorTotal,
        total: valorTotal,
        itemCancelado: false
      }
    ],
    PagamentosVenda: formas.map((forma) => ({
      idVenda,
      idFormaPagamento: forma.id,
      descricaoFormaPagamento: forma.descricao,
      valor: forma.valor
    }))
  };
}

describe("D-06 · venda integrada com pagamento dividido", () => {
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

    const conta = await criar("/api/contas", { empresaId: idsTeste.empresaA, nome: "Conta D06 dividido" });
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await criar("/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: "PDV D06 dividido",
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
        descricaoExterna: "PDV D06 dividido",
        registroSistemaId: pdvId
      }
    });
    expect(vinculo.statusCode, vinculo.body).toBe(204);

    const abertura = await criar("/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: usuario.id,
      dataHoraAbertura: "2026-06-29T08:00",
      observacao: "Caixa D06 pagamento dividido"
    });
    caixaId = json<{ data: { id: string } }>(abertura).data.id;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function criar(url: string, payload: object) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url,
      headers: { cookie: cookieAdmin },
      payload
    });
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return resposta;
  }

  async function enviarVenda(payload: object) {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/integracoes",
      headers: { "x-api-key": idsTeste.integracaoCodigo },
      payload
    });
    assertOk(resposta);
    return json<{ data: { status: string; vendaId: string | null; identificadorExterno: string } }>(resposta).data;
  }

  async function vendasGravadas(identificadorExterno: string) {
    return consultarTodos<{ id: string; valor_original: string; caixa_id: string | null }>(
      "select id, valor_original, caixa_id from vendas where identificador_externo = $1",
      [identificadorExterno]
    );
  }

  async function pagamentosGravados(identificadorExterno: string) {
    // Desempate por identificador: sem ele, dois pagamentos de mesmo valor sairiam em ordem indefinida.
    return consultarTodos<PagamentoGravado>(
      `select vp.tipo_pagamento_automacao_id, vp.tipo_pagamento_automacao, vp.total_pago
         from vendas_pagamentos vp
         join vendas v on v.id = vp.venda_id
        where v.identificador_externo = $1
        order by vp.total_pago desc, vp.tipo_pagamento_automacao_id`,
      [identificadorExterno]
    );
  }

  function conferidos(pagamentos: PagamentoGravado[]) {
    return pagamentos.map((linha) => ({
      forma: linha.tipo_pagamento_automacao_id,
      descricao: linha.tipo_pagamento_automacao,
      centavos: paraCentavos(linha.total_pago)
    }));
  }

  function somaEmCentavos(pagamentos: PagamentoGravado[]) {
    return pagamentos.reduce((total, linha) => total + paraCentavos(linha.total_pago), 0);
  }

  async function totaisDoCaixa() {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    const dados = json<{
      data: { caixaAberto: { id: string } | null; resumo: { totalEntradas: number; saldo: number } };
    }>(resposta).data;
    // O seed ja deixa o admin com um caixa aberto (idsTeste.caixaAberto) em outro PDV, e a rota
    // devolve o mais recente do usuario — travar o id aqui garante que o resumo e o deste arquivo.
    expect(dados.caixaAberto, "o caixa dedicado deste arquivo deveria estar aberto").not.toBeNull();
    expect(dados.caixaAberto?.id, "o resumo tem de ser do caixa dedicado deste arquivo").toBe(caixaId);
    return {
      entradas: paraCentavos(dados.resumo.totalEntradas),
      saldo: paraCentavos(dados.resumo.saldo)
    };
  }

  it("venda com DUAS formas: uma venda, dois pagamentos, soma igual ao total e caixa conta uma vez", async () => {
    const resultado = await enviarVenda(payloadDividido(VENDA_2_FORMAS, TOTAL_2_FORMAS, RATEIO_2_FORMAS));
    expect(resultado.status).toBe("criado");

    const vendas = await vendasGravadas(VENDA_2_FORMAS);
    expect(vendas).toHaveLength(1);
    expect(paraCentavos(vendas[0]!.valor_original)).toBe(TOTAL_2_FORMAS);
    expect(vendas[0]!.caixa_id).toBe(caixaId);

    const pagamentos = await pagamentosGravados(VENDA_2_FORMAS);
    expect(pagamentos).toHaveLength(2);
    expect(conferidos(pagamentos)).toEqual(esperado(RATEIO_2_FORMAS));
    expect(somaEmCentavos(pagamentos)).toBe(TOTAL_2_FORMAS);

    // Aceite do D-06: o total do caixa BATE COM A SOMA DOS PAGAMENTOS — a venda entra uma vez so,
    // nao uma vez por forma de pagamento.
    const totais = await totaisDoCaixa();
    expect(totais.entradas).toBe(somaEmCentavos(pagamentos));
    expect(totais.saldo).toBe(TOTAL_2_FORMAS);
  });

  it("venda com TRES formas: tres pagamentos com valores e formas preservados, sem multiplicar o caixa", async () => {
    const resultado = await enviarVenda(payloadDividido(VENDA_3_FORMAS, TOTAL_3_FORMAS, RATEIO_3_FORMAS));
    expect(resultado.status).toBe("criado");

    const vendas = await vendasGravadas(VENDA_3_FORMAS);
    expect(vendas).toHaveLength(1);
    expect(paraCentavos(vendas[0]!.valor_original)).toBe(TOTAL_3_FORMAS);
    expect(vendas[0]!.caixa_id).toBe(caixaId);

    const pagamentos = await pagamentosGravados(VENDA_3_FORMAS);
    expect(pagamentos).toHaveLength(3);
    expect(conferidos(pagamentos)).toEqual(esperado(RATEIO_3_FORMAS));
    expect(somaEmCentavos(pagamentos)).toBe(TOTAL_3_FORMAS);

    // 11,58 + 15,00 = 26,58. Multiplicando por forma daria 11,58*2 + 15,00*3 = 68,16.
    const totais = await totaisDoCaixa();
    const somaDasDuasVendas = somaEmCentavos(await pagamentosGravados(VENDA_2_FORMAS)) + somaEmCentavos(pagamentos);
    expect(totais.entradas).toBe(somaDasDuasVendas);
    expect(totais.saldo).toBe(TOTAL_2_FORMAS + TOTAL_3_FORMAS);
  });

  it("reenvio IDENTICO da venda dividida: sem_novidade, sem venda nova, sem pagamento empilhado", async () => {
    const antes = await totaisDoCaixa();

    const resultado = await enviarVenda(payloadDividido(VENDA_3_FORMAS, TOTAL_3_FORMAS, RATEIO_3_FORMAS));
    expect(resultado.status).toBe("sem_novidade");

    expect(await vendasGravadas(VENDA_3_FORMAS)).toHaveLength(1);

    const pagamentos = await pagamentosGravados(VENDA_3_FORMAS);
    expect(pagamentos, "reenvio nao pode empilhar linhas em vendas_pagamentos").toHaveLength(3);
    expect(conferidos(pagamentos), "reenvio nao pode redistribuir o rateio").toEqual(esperado(RATEIO_3_FORMAS));
    expect(somaEmCentavos(pagamentos)).toBe(TOTAL_3_FORMAS);

    const depois = await totaisDoCaixa();
    expect(depois.entradas).toBe(antes.entradas);
    expect(depois.saldo).toBe(antes.saldo);
  });

  it("alteracao do RATEIO no mesmo identificador: substitui os pagamentos e mantem o total do caixa", async () => {
    const antes = await totaisDoCaixa();

    // Mesmo idVenda e mesmo valor total; muda so a divisao (3 formas -> 2 formas, outros valores).
    const resultado = await enviarVenda(payloadDividido(VENDA_3_FORMAS, TOTAL_3_FORMAS, RATEIO_ALTERADO));
    expect(resultado.status).toBe("atualizado");

    const vendas = await vendasGravadas(VENDA_3_FORMAS);
    expect(vendas, "atualizar rateio nao pode criar uma segunda venda").toHaveLength(1);

    const pagamentos = await pagamentosGravados(VENDA_3_FORMAS);
    expect(pagamentos, "o rateio antigo tem de sair inteiro").toHaveLength(2);
    expect(conferidos(pagamentos)).toEqual(esperado(RATEIO_ALTERADO));
    expect(somaEmCentavos(pagamentos)).toBe(TOTAL_3_FORMAS);

    const depois = await totaisDoCaixa();
    expect(depois.entradas).toBe(antes.entradas);
    expect(depois.saldo).toBe(antes.saldo);
  });
});

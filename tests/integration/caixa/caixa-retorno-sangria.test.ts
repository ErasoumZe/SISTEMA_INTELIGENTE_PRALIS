import { diaNegocio } from "@padaria/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import {
  abrirCaixaDoOperador,
  criarRetornoValido,
  encerrarCaixaSeedAdminParaTeste,
  prepararFechamentoValido
} from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// M2 (R3/R4/R6/R-187): toda transferencia caixa -> cofre usa o tipo canonico `retorno`.
// Cobre: (a) o retorno so MOVE dinheiro, sem divida com o cofre (R-001); (b) retorno proposto pela
// sobra zera o saldo e libera o fechamento; (c) agregacao "aba TRANSFERENCIAS" por caixa+dia.
describe("caixa - transferencia de retorno (M2)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;
  const hoje = diaNegocio(new Date());

  function post(url: string, payload: object) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie: cookieAdmin }, payload });
  }

  async function criar(url: string, payload: object) {
    const r = await post(url, payload);
    expect(r.statusCode, `${url} -> ${r.body}`).toBe(201);
    return json<{ data: { id: string } }>(r).data.id;
  }

  // A fixture percorre a mesma abertura da porta 5174: malote Tesouraria -> PDV, composicao
  // fisica, lacres retornaveis, lacre final e maquininha. Caixa sem malote nao e mais um estado
  // valido para os cenarios de retorno.
  function abrir(nome: string, valorAbertura = 100, lacresRetorno?: string[]) {
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieRemetente: cookieTesouraria,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome,
      valorAbertura,
      ...(lacresRetorno ? { lacresRetorno } : {}),
      dataHoraAbertura: "2026-07-31T08:00"
    });
  }

  async function venda(contaId: string, pdvId: string, dataReferencia: string, valor: number) {
    await criar("/api/vendas", {
      empresaId,
      dataReferencia,
      dataPagamento: dataReferencia,
      descricao: "Venda",
      valorOriginal: valor,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        { produtoId: idsTeste.produto, descricaoProduto: "Pao", quantidade: 1, valorUnitario: valor, valorTotal: valor }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: valor }]
    });
  }

  async function transferenciaCofre(caixaId: string, valor: number) {
    return criarRetornoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId, valor });
  }

  async function resumoAtual() {
    const r = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(r);
    return json<{ data: { resumo: Record<string, number> } }>(r).data.resumo;
  }

  async function agregado(caixaId: string) {
    const r = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/transferencias`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(r);
    return json<{
      data: {
        itens: { tipo: string; ordem: number; valor: number; sentido: string }[];
        totalSaida: number;
        totalEntrada: number;
        saldo: number;
      };
    }>(r).data;
  }

  it("Retorno apenas MOVE dinheiro: o saldo fisico cai e nao ha divida com o cofre (R-001)", async () => {
    const { contaId, pdvId, caixaId } = await abrir("retorno", 490);

    await venda(contaId, pdvId, hoje, 490);
    // R-001: o fundo e fundo, nao emprestimo — dividaCofre = 0, sem deficit a rastrear.
    // saldo FISICO = 980 (490 de fundo + 490 de venda); saldoProprio e OPERACIONAL e exclui as
    // transferencias, entao conta so a venda: 490.
    expect(await resumoAtual()).toMatchObject({ dividaCofre: 0, saldoProprio: 490, saldo: 980 });

    // Retorno de 200: so MOVE dinheiro -> o fisico cai 200 e o operacional nao se mexe.
    await transferenciaCofre(caixaId, 200);
    expect(await resumoAtual()).toMatchObject({ dividaCofre: 0, saldoProprio: 490, saldo: 780 });
  });

  it("Vincula o suprimento da Tesouraria ao PDV aberto mesmo sem caixa do remetente", async () => {
    const { contaId, caixaId } = await abrir("suprimento da tesouraria");
    const envio = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieTesouraria },
      payload: {
        empresaId,
        dataReferencia: hoje,
        descricao: "Suprimento direto da Tesouraria",
        valorOriginal: 200,
        valorEspecieDeclarado: 200,
        valorMoedasDeclarado: 0,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: contaId,
        nLacreDoc: "LAC-SUPRIMENTO-TESOURARIA",
        lacresRetorno: ["RET-SUPRIMENTO-TESOURARIA"],
        lacreFechamentoPlanejado: "FCH-SUPRIMENTO-TESOURARIA"
      }
    });
    expect(envio.statusCode, envio.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(envio).data.id;
    expect(
      await consultarUm<{ caixa_id: string | null }>("select caixa_id from transferencias where id = $1", [
        transferenciaId
      ])
    ).toEqual({ caixa_id: caixaId });

    const conferencia = await contexto.app.inject({
      method: "POST",
      url: `/api/transferencias/${transferenciaId}/confirmar`,
      headers: { cookie: cookieAdmin },
      payload: { contaDestinoId: contaId, valorRecebido: 200, nLacreDoc: "LAC-SUPRIMENTO-TESOURARIA" }
    });
    expect(conferencia.statusCode, conferencia.body).toBe(200);
    expect(await resumoAtual()).toMatchObject({
      totalTransferencias: 300,
      totalTransferenciasEntrada: 300,
      saldo: 300
    });
  });

  it("Retorno da sobra zera o saldo e libera o fechamento", async () => {
    const { contaId, pdvId, caixaId, lacreFechamento } = await abrir("retorno-fechamento");
    await venda(contaId, pdvId, hoje, 300);

    const resumo = await resumoAtual();
    expect(resumo).toMatchObject({ saldo: 400, propostaRetorno: 400 });

    await transferenciaCofre(caixaId, resumo["propostaRetorno"] ?? 0);
    expect(await resumoAtual()).toMatchObject({ saldo: 0, propostaRetorno: 0 });

    // A transferencia continua pendente para auditoria, mas nao desaparece nem trava a conclusao
    // do turno: as provas e a contagem do fechamento sao a porta de fechamento.
    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId });
    const fechar = await post(`/api/caixa/${caixaId}/fechar`, {
      observacao: "Fechamento com retorno",
      lacreFechamento,
      caixaResponsavelNome: "Operador de teste",
      supervisorResponsavelNome: "Supervisor de teste",
      valorEspecieFechamento: 0,
      valorMoedasFechamento: 0
    });
    expect(fechar.statusCode, fechar.body).toBe(204);
  });

  it("Agrega por caixa+dia: 1a/2a saida (abertura+suprimento) e 1a/2a transferencia de retorno", async () => {
    const { contaId, caixaId } = await abrir("agrega", 490, ["RET-AGREGA-001", "RET-AGREGA-002"]);

    // 2o suprimento (cofre -> caixa) pela rota manual de transferencias.
    await criar("/api/transferencias", {
      empresaId,
      dataReferencia: hoje,
      descricao: "Suprimento reforco",
      valorOriginal: 100,
      valorEspecieDeclarado: 100,
      valorMoedasDeclarado: 0,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "RET-SUPRIMENTO-001",
      lacresRetorno: ["RET-SUPRIMENTO-002"],
      lacreFechamentoPlanejado: "FCH-SUPRIMENTO-002"
    });
    // Duas entradas (caixa -> cofre), ambas do tipo canonico retorno.
    await transferenciaCofre(caixaId, 200);
    await transferenciaCofre(caixaId, 150);

    const agg = await agregado(caixaId);
    // SAIDA do cofre = abertura(490) + suprimento(100) = 590; ENTRADA = retornos(200+150) = 350.
    expect(agg.totalSaida).toBe(590);
    expect(agg.totalEntrada).toBe(350);
    expect(agg.saldo).toBe(350 - 590); // -240

    const saidas = agg.itens.filter((i) => i.sentido === "saida");
    const entradas = agg.itens.filter((i) => i.sentido === "entrada");
    expect(saidas.map((i) => i.ordem)).toEqual([1, 2]); // abertura, suprimento
    expect(entradas.map((i) => i.ordem)).toEqual([1, 2]); // retorno, retorno
    expect(saidas.map((i) => i.tipo)).toEqual(["abertura", "suprimento"]);
    expect(entradas.map((i) => i.tipo)).toEqual(["retorno", "retorno"]);
  });
});

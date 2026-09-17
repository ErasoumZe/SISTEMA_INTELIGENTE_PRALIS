import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, encerrarCaixaSeedAdminParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// P1 da #101 — a segunda porta: a entrega ao cofre era EDITAVEL.
//
// `PUT /api/transferencias/:id` reescreve `conta_origem_id` e `conta_destino_id` com um UPDATE por
// id, sem olhar tipo nem status. Bastava apontar o destino de uma entrega ja entregue para outra
// conta qualquer: o predicado da guarda de fechamento (R-171) parava de casar, o fechamento
// liberava e o malote continuava na rua — sem turno aberto onde a divergencia do cofre pudesse
// cair. A mesma edicao ao contrario tambem servia: transformar uma transferencia comum do caixa em
// Caixa -> Cofre por fora do fluxo do proprio Caixa, contornando a porta que a correcao anterior
// fechou na CRIACAO.
//
// Quem alcanca: o PUT exige `transferencias_editar` E que a linha pertenca ao caixa aberto do
// proprio ator (`validarEdicaoNoCaixaAberto`). O cargo Caixa nao tem `transferencias_editar`; quem
// tem e Gerencia, Financeiro e Admin. O caso real e o gerente cobrindo o PDV — que e exatamente
// quem quer ir embora. Por isso a fixture aqui abre o caixa com o ADMIN como operador: e a unica
// combinacao que reproduz a mao que consegue fazer isso em producao.
//
// A regra que fica: entrega ao cofre e movimento IMUTAVEL (D5/D9) e transferencia vinculada a um
// caixa nao muda de conta de destino. Todo o resto da edicao continua igual.
describe("caixa - entrega ao cofre nao e editavel pelo PUT generico (P1/R-171)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 180_000);

  afterAll(async () => contexto.fechar());

  const empresaId = idsTeste.empresaA;
  // Posterior a abertura padrao da fixture (2026-07-31T08:00).
  const DIA = "2026-08-01";

  function inject(method: "GET" | "POST" | "PUT", url: string, cookie: string, payload?: object) {
    const corpo = url.endsWith("/fechar") ? { lacreFechamento: `FCH-EDICAO-${url}`, ...payload } : payload;
    return contexto.app.inject({ method, url, headers: { cookie }, ...(corpo ? { payload: corpo } : {}) });
  }

  // O ADMIN e o operador do caixa aqui: ele tem `caixa_operar` E `transferencias_editar`, que e a
  // combinacao necessaria para o PUT sequer chegar na regra em teste.
  async function novoCaixa(nome: string) {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome: `${nome} ${sequencia}`
    });
  }

  async function venda(valor: number) {
    const resposta = await inject("POST", "/api/vendas", cookieAdmin, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Venda do turno",
      valorOriginal: valor
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  }

  async function contaNova(nome: string) {
    sequencia += 1;
    const resposta = await inject("POST", "/api/contas", cookieAdmin, { empresaId, nome: `${nome} ${sequencia}` });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // Caminho canonico: o unico que grava `retorno`.
  async function entregarAoCofre(caixaId: string, valor: number, lacre: string) {
    const resposta = await inject("POST", `/api/caixa/${caixaId}/transferencia-cofre`, cookieAdmin, {
      valor,
      lacre,
      idempotenciaChave: randomUUID()
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const movimento = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and tipo = 'retorno' order by criado_em desc limit 1",
      [caixaId]
    );
    if (!movimento) throw new Error("Entrega ao cofre nao encontrada");
    return movimento.id;
  }

  async function transferenciaComum(contaOrigemId: string, contaDestinoId: string, valor = 50) {
    sequencia += 1;
    const resposta = await inject("POST", "/api/transferencias", cookieAdmin, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Transferencia comum do turno",
      valorOriginal: valor,
      contaOrigemId,
      contaDestinoId,
      nLacreDoc: `P1-PUT-${sequencia}`,
      tempoConfirmacao: "1dia"
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // O lacre e OBRIGATORIO no payload da transferencia: sem ele a recusa vem de `validarTransferencia`
  // e o caso ficaria vermelho pelo motivo errado — 400 que nao prova nada. A tela reenvia o lacre
  // carregado, entao o teste faz o mesmo: le o que esta gravado e devolve.
  async function editar(transferenciaId: string, payload: Record<string, unknown>) {
    const atual = await consultarUm<{ n_lacre_doc: string | null; tempo_confirmacao: string | null }>(
      "select n_lacre_doc, tempo_confirmacao from transferencias where id = $1",
      [transferenciaId]
    );
    return inject("PUT", `/api/transferencias/${transferenciaId}`, cookieAdmin, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Transferencia editada",
      tempoConfirmacao: atual?.tempo_confirmacao ?? null,
      nLacreDoc: atual?.n_lacre_doc ?? undefined,
      ...payload
    });
  }

  function contasDaTransferencia(transferenciaId: string) {
    return consultarUm<{ conta_origem_id: string; conta_destino_id: string; status: string; valor_original: string }>(
      "select conta_origem_id, conta_destino_id, status, valor_original from transferencias where id = $1",
      [transferenciaId]
    );
  }

  // ------------------------------------------------------------------------------------------
  // RED-1 · o bypass: mudar o destino da entrega desarma a guarda e o caixa fecha por cima do
  // malote. E o mesmo defeito da Fatia 1, alcancado por edicao em vez de criacao.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarAEdicao_Quando_OPUTTrocaODestinoDeUmaEntregaAoCofre", async () => {
    const fx = await novoCaixa("P1 PUT entrega");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `P1-PUT-ENTREGA-${sequencia}`);
    const destinoAlternativo = await contaNova("Conta desvio");

    const resposta = await editar(entrega, {
      valorOriginal: 200,
      contaOrigemId: fx.contaId,
      contaDestinoId: destinoAlternativo
    });

    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/cofre/iu);
    // A linha tem de continuar EXATAMENTE como estava: recusa que ja gravou metade e pior do que
    // nao ter recusado.
    expect(await contasDaTransferencia(entrega)).toMatchObject({
      conta_origem_id: fx.contaId,
      conta_destino_id: idsTeste.contaCofre,
      status: "pendente"
    });
    // E a consequencia que importa: o fechamento continua travado pela R-171.
    assertProblem(await inject("POST", `/api/caixa/${fx.caixaId}/fechar`, cookieAdmin, { observacao: "Turno" }), 400);
  });

  // ------------------------------------------------------------------------------------------
  // RED-2 · o caminho inverso: transformar uma transferencia comum do caixa em Caixa -> Cofre por
  // edicao, contornando a porta que ja foi fechada na criacao.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarAEdicao_Quando_OPUTApontaODestinoDeUmaTransferenciaDoCaixaParaOCofre", async () => {
    const fx = await novoCaixa("P1 PUT virada");
    await venda(500);
    const comum = await transferenciaComum(fx.contaId, await contaNova("Conta comum"), 50);

    const resposta = await editar(comum, {
      valorOriginal: 50,
      contaOrigemId: fx.contaId,
      contaDestinoId: idsTeste.contaCofre
    });

    assertProblem(resposta, 400);
    expect(await contasDaTransferencia(comum)).toMatchObject({ status: "pendente" });
    expect((await contasDaTransferencia(comum))?.conta_destino_id).not.toBe(idsTeste.contaCofre);
  });

  // ------------------------------------------------------------------------------------------
  // RED-3 · o limite: corrigir VALOR e texto de uma transferencia comum do caixa continua valendo.
  // Sem este caso, uma trava larga demais (qualquer PUT em linha com caixa) passaria despercebida.
  // ------------------------------------------------------------------------------------------
  it("Deve_PermitirAEdicaoComum_Quando_ODestinoNaoMuda", async () => {
    const fx = await novoCaixa("P1 PUT comum");
    await venda(500);
    const destino = await contaNova("Conta comum estavel");
    const comum = await transferenciaComum(fx.contaId, destino, 50);

    const resposta = await editar(comum, {
      valorOriginal: 70,
      contaOrigemId: fx.contaId,
      contaDestinoId: destino
    });

    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(await contasDaTransferencia(comum)).toMatchObject({
      conta_destino_id: destino,
      valor_original: "70.00"
    });
  });
});

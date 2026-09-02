import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, json } from "../../setup/integracao.js";

// Fatia 2 da #101 (R-181/R-183) — o desfecho que faltava.
//
// Ate aqui a recusa de conferencia registrava a divergencia e mantinha a entrega `pendente`: o
// dinheiro ficava fora do caixa e fora do cofre, e o turno nao fechava mais. A R-183 fecha o
// circuito com UMA formula, onde D e o valor declarado e C o valor fisicamente contado:
//
//     o Cofre credita C; se D > C a diferenca vira quebra de -(D - C); se C >= D nao ha quebra.
//
// `C = 0` (o "lacre violado, nao abro e nao conto") nao e ramo especial: e o extremo da mesma
// formula. E a entrega NUNCA termina em `recebido` quando houve divergencia — ela vai para
// `divergente`, que continua contando como saida do caixa. Cancelar esta proibido em todos os
// casos: `cancelada` nao conta como saida e faria o dinheiro reaparecer no caixa.
//
// Quem encerra e o COFRE, e nao o fechamento. Foi o que permitiu resolver o retorno final, que
// nasce dentro do proprio `fecharCaixa` e por construcao so e conferido com o caixa ja fechado.
describe("caixa - divergencia na entrega ao cofre (R-183)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let cookieGerente = "";
  let cookieTesouraria = "";
  let sequencia = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieGerente, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  const empresaId = idsTeste.empresaA;
  const DIA = "2026-08-01";

  function inject(method: "GET" | "POST", url: string, cookie: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  async function novoCaixa(nome: string) {
    sequencia += 1;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: `${nome} ${sequencia}`
    });
  }

  async function venda(valor: number) {
    const resposta = await inject("POST", "/api/vendas", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Venda do turno",
      valorOriginal: valor
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  }

  // Caminho canonico: o unico escritor de `sangria`/`retorno`.
  async function entregarAoCofre(caixaId: string, valor: number, lacre: string) {
    const resposta = await inject("POST", `/api/caixa/${caixaId}/transferencia-cofre`, cookieCaixa, {
      tipo: "sangria",
      valor,
      lacre,
      idempotenciaChave: randomUUID()
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const movimento = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and tipo = 'sangria' order by criado_em desc limit 1",
      [caixaId]
    );
    if (!movimento) throw new Error("Entrega ao cofre nao encontrada");
    return movimento.id;
  }

  // R-028: quem entrega nunca confere a propria entrega. O operador entrega, o gerente confere.
  function recusar(transferenciaId: string, payload: Record<string, unknown>) {
    return inject("POST", `/api/transferencias/${transferenciaId}/recusar-conferencia`, cookieGerente, {
      contaDestinoId: idsTeste.contaCofre,
      motivo: "Conferencia do cofre",
      ...payload
    });
  }

  function fechar(caixaId: string, observacao = "Fechamento do turno") {
    return inject("POST", `/api/caixa/${caixaId}/fechar`, cookieCaixa, { observacao });
  }

  function linha(transferenciaId: string) {
    return consultarUm<{ status: string; valor_original: string; valor_recebido: string | null }>(
      "select status, valor_original, valor_recebido from transferencias where id = $1",
      [transferenciaId]
    );
  }

  function quebrasDoFechamento(caixaId: string) {
    return consultarTodos<{ valor: string; transferencia_id: string | null; usuario_id: string }>(
      "select valor, transferencia_id, usuario_id from quebras_caixa where fechamento_caixa_id = $1 order by criado_em",
      [caixaId]
    );
  }

  // O saldo do cofre e derivado dos movimentos, e outros arquivos mexem nele: o que este teste mede
  // e sempre o DELTA da propria acao, nunca o valor absoluto.
  async function saldoDoCofre() {
    const resposta = await inject("GET", `/api/contas/saldos?empresaId=${empresaId}`, cookieAdmin);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const conta = json<{ data: Array<{ id: string; saldoAtual: number }> }>(resposta).data.find(
      (item) => item.id === idsTeste.contaCofre
    );
    if (!conta) throw new Error("Conta cofre nao encontrada nos saldos");
    return conta.saldoAtual;
  }

  // ------------------------------------------------------------------------------------------
  // RED-1 · FALTA. O cofre credita o contado e a diferenca vira quebra negativa.
  // ------------------------------------------------------------------------------------------
  it("Deve_CreditarOContadoEGerarQuebra_Quando_OCofreContaMenos", async () => {
    const fx = await novoCaixa("R183 falta");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-FALTA-${sequencia}`);
    const antes = await saldoDoCofre();

    const encerramento = await recusar(entrega, { valorRecebido: 180, encerrar: true });
    expect(encerramento.statusCode, encerramento.body).toBe(200);

    expect(await linha(entrega)).toMatchObject({
      status: "divergente",
      valor_original: "200.00",
      valor_recebido: "180.00"
    });
    // O cofre recebe EXATAMENTE o que foi contado — nunca o declarado.
    expect(await saldoDoCofre()).toBeCloseTo(antes + 180, 2);
    // A quebra e negativa (faltou), aponta a entrega e fica no nome de quem entregou.
    expect(await quebrasDoFechamento(fx.caixaId)).toEqual([
      { valor: "-20.00", transferencia_id: entrega, usuario_id: fx.usuarioId }
    ]);
    // E o fechamento destrava sozinho: a guarda da R-171 filtra `pendente`.
    expect((await fechar(fx.caixaId)).statusCode).toBe(204);
  });

  // ------------------------------------------------------------------------------------------
  // RED-2 · SOBRA. Credita o contado, e a D7 continua valendo: sobra NUNCA vira quebra positiva.
  // ------------------------------------------------------------------------------------------
  it("Deve_CreditarOContadoESemQuebra_Quando_OCofreContaMais", async () => {
    const fx = await novoCaixa("R183 sobra");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-SOBRA-${sequencia}`);
    const antes = await saldoDoCofre();

    // Sem o consentimento explicito, creditar o cofre a mais seria dinheiro entrando sem dono.
    assertProblem(await recusar(entrega, { valorRecebido: 220, encerrar: true }), 409, "SOBRA_NAO_CONFIRMADA");
    expect((await linha(entrega))?.status).toBe("pendente");

    const encerramento = await recusar(entrega, { valorRecebido: 220, encerrar: true, sobraConfirmada: true });
    expect(encerramento.statusCode, encerramento.body).toBe(200);

    expect(await linha(entrega)).toMatchObject({ status: "divergente", valor_recebido: "220.00" });
    expect(await saldoDoCofre()).toBeCloseTo(antes + 220, 2);
    expect(await quebrasDoFechamento(fx.caixaId)).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-3 · SEM CONTAGEM. "Lacre violado, nao abro": contado zero, cofre nao recebe nada, e o
  // declarado inteiro vira quebra.
  // ------------------------------------------------------------------------------------------
  it("Deve_NaoCreditarNadaEQuebrarOTotal_Quando_ARecusaNaoTemContagem", async () => {
    const fx = await novoCaixa("R183 sem contagem");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-ZERO-${sequencia}`);
    const antes = await saldoDoCofre();

    // Sem numero nenhum nao ha o que creditar nem o que quebrar: o zero precisa ser DITO.
    assertProblem(await recusar(entrega, { encerrar: true }), 400, "VALOR_CONTADO_OBRIGATORIO");

    const encerramento = await recusar(entrega, { valorRecebido: 0, encerrar: true });
    expect(encerramento.statusCode, encerramento.body).toBe(200);

    expect(await linha(entrega)).toMatchObject({ status: "divergente", valor_recebido: "0.00" });
    expect(await saldoDoCofre()).toBeCloseTo(antes, 2);
    expect(await quebrasDoFechamento(fx.caixaId)).toEqual([
      { valor: "-200.00", transferencia_id: entrega, usuario_id: fx.usuarioId }
    ]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-4 · SO O LACRE DIVERGIU. Diferenca zero: encerra sem quebra — e sem esbarrar no
  // `quebras_caixa_valor_nao_zero_check`, que era onde a proposta anterior morria.
  // ------------------------------------------------------------------------------------------
  it("Deve_EncerrarSemQuebra_Quando_SoOLacreDivergiu", async () => {
    const fx = await novoCaixa("R183 lacre");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-LACRE-${sequencia}`);
    const antes = await saldoDoCofre();

    const encerramento = await recusar(entrega, {
      valorRecebido: 200,
      nLacreDoc: "LACRE-QUE-CHEGOU",
      motivo: "Envelope chegou com outro lacre",
      encerrar: true
    });
    expect(encerramento.statusCode, encerramento.body).toBe(200);

    expect(await linha(entrega)).toMatchObject({ status: "divergente", valor_recebido: "200.00" });
    expect(await saldoDoCofre()).toBeCloseTo(antes + 200, 2);
    expect(await quebrasDoFechamento(fx.caixaId)).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-5 · a recusa SEM encerrar nao compra saida nenhuma. E o contrato que a Fatia 1 fixou e que
  // esta fatia precisa PRESERVAR: so o encerramento destrava.
  // ------------------------------------------------------------------------------------------
  it("Deve_ManterOFechamentoTravado_Quando_ARecusaNaoEncerra", async () => {
    const fx = await novoCaixa("R183 sem encerrar");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-ABERTA-${sequencia}`);

    const recusa = await recusar(entrega, { valorRecebido: 180 });
    expect(recusa.statusCode, recusa.body).toBe(200);

    expect((await linha(entrega))?.status).toBe("pendente");
    assertProblem(await fechar(fx.caixaId), 400);
  });

  // ------------------------------------------------------------------------------------------
  // RED-6 · `divergente` e TERMINAL. Nada mais alcanca a linha depois.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarNovaConferencia_Quando_AEntregaJaEstaDivergente", async () => {
    const fx = await novoCaixa("R183 terminal");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-TERMINAL-${sequencia}`);
    expect((await recusar(entrega, { valorRecebido: 150, encerrar: true })).statusCode).toBe(200);

    assertProblem(await recusar(entrega, { valorRecebido: 150, encerrar: true }), 400);
    const confirmacao = await inject("POST", `/api/transferencias/${entrega}/confirmar`, cookieGerente, {
      contaDestinoId: idsTeste.contaCofre,
      valorRecebido: 200
    });
    assertProblem(confirmacao, 400);
    expect((await linha(entrega))?.valor_recebido).toBe("150.00");
  });

  // ------------------------------------------------------------------------------------------
  // RED-7 · o RETORNO FINAL. Ele nasce DENTRO do fechamento e so pode ser conferido com o caixa ja
  // fechado — foi por isso que o encerramento nao pode morar no `fecharCaixa`. A quebra nasce
  // contra o fechamento a que a entrega pertence, que aqui ja esta fechado.
  // ------------------------------------------------------------------------------------------
  it("Deve_EncerrarEGerarQuebra_Quando_ORetornoFinalEhRecusadoDepoisDoFechamento", async () => {
    const fx = await novoCaixa("R183 retorno final");
    await venda(300);

    const fechamento = await fechar(fx.caixaId);
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    const retorno = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and tipo = 'retorno' order by criado_em desc limit 1",
      [fx.caixaId]
    );
    expect(retorno).not.toBeNull();
    const antes = await saldoDoCofre();

    const encerramento = await recusar(retorno!.id, { valorRecebido: 280, encerrar: true });
    expect(encerramento.statusCode, encerramento.body).toBe(200);

    expect(await linha(retorno!.id)).toMatchObject({ status: "divergente", valor_recebido: "280.00" });
    expect(await saldoDoCofre()).toBeCloseTo(antes + 280, 2);
    expect(await quebrasDoFechamento(fx.caixaId)).toEqual([
      { valor: "-20.00", transferencia_id: retorno!.id, usuario_id: fx.usuarioId }
    ]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-7b · a OUTRA metade da elegibilidade (R-028): quem ENTREGOU nao encerra a propria entrega.
  //
  // A fixture precisa de cuidado, e a versao anterior deste caso nao tinha: usar o operador de caixa
  // fazia a requisicao morrer no guard da rota (o cargo Caixa nao tem `transferencias_conferir`), e
  // o teste ficava verde sem nunca chegar a regra. Provava a ausencia de permissao, nao a R-028.
  //
  // Aqui o ator TEM a permissao e TEM vinculo com o cofre — e mesmo assim e recusado, porque foi ele
  // quem entregou. Montagem: o ADMIN programa (nao e vinculado ao cofre, entao o portao da D7 passa
  // deixando tesouraria e gerente elegiveis) e o GERENTE executa. Ao tentar encerrar, ele cai em
  // `candidatoConfirmacao` pelo ramo `executado_por` — 400 de dominio, nao 403 de permissao.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarOEncerramento_Quando_QuemEntregouTentaEncerrarAPropriaEntrega", async () => {
    const fx = await novoCaixa("R183 auto encerramento");
    await venda(500);

    const programacao = await inject("POST", `/api/caixa/${fx.caixaId}/solicitacoes-cofre`, cookieAdmin, {
      tipo: "sangria",
      valor: 200,
      idempotenciaChave: randomUUID()
    });
    expect(programacao.statusCode, programacao.body).toBe(200);
    const solicitacao = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and solicitacao_cofre_em is not null order by criado_em desc limit 1",
      [fx.caixaId]
    );

    const execucao = await inject(
      "POST",
      `/api/caixa/${fx.caixaId}/solicitacoes-cofre/${solicitacao!.id}/executar`,
      cookieGerente,
      { lacre: `R183-AUTO-${sequencia}` }
    );
    expect(execucao.statusCode, execucao.body).toBe(200);
    // O dinheiro saiu, e quem entregou foi o gerente.
    expect(await linha(solicitacao!.id)).toMatchObject({ status: "pendente" });

    const encerramentoProprio = await inject(
      "POST",
      `/api/transferencias/${solicitacao!.id}/recusar-conferencia`,
      cookieGerente,
      {
        contaDestinoId: idsTeste.contaCofre,
        motivo: "Tentando conferir o proprio envio",
        valorRecebido: 180,
        encerrar: true
      }
    );
    // 400 de DOMINIO — se viesse 403, a requisicao teria morrido no guard e o caso nao provaria nada.
    assertProblem(encerramentoProprio, 400);
    expect(encerramentoProprio.body).toMatch(/conta destino/iu);
    expect((await linha(solicitacao!.id))?.status).toBe("pendente");

    // E o contraste que fecha o caso: quem NAO entregou encerra normalmente. Sem isto, a recusa
    // acima poderia ser qualquer outra coisa quebrada no caminho.
    const encerramentoDeTerceiro = await inject(
      "POST",
      `/api/transferencias/${solicitacao!.id}/recusar-conferencia`,
      cookieTesouraria,
      {
        contaDestinoId: idsTeste.contaCofre,
        motivo: "Conferido pela Tesouraria",
        valorRecebido: 180,
        encerrar: true
      }
    );
    expect(encerramentoDeTerceiro.statusCode, encerramentoDeTerceiro.body).toBe(200);
    expect((await linha(solicitacao!.id))?.status).toBe("divergente");
  });

  // ------------------------------------------------------------------------------------------
  // RED-9 · duas quebras no MESMO fechamento: a de contagem (turno fechou negativo) e a de
  // divergencia (o cofre contou menos). E o caso que a migration 0034 destravou ao trocar o
  // `unique(fechamento_caixa_id)` por dois indices parciais — antes dela, a segunda batia no unique.
  // ------------------------------------------------------------------------------------------
  it("Deve_ConviverDuasQuebras_Quando_HaFaltaNaContagemEDivergenciaNoCofre", async () => {
    const fx = await novoCaixa("R183 duas quebras");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, `R183-DUAS-${sequencia}`);
    expect((await recusar(entrega, { valorRecebido: 180, encerrar: true })).statusCode).toBe(200);

    // Despesa acima do que sobrou em especie: o turno fecha NEGATIVO e gera a quebra de contagem.
    const despesa = await inject("POST", "/api/despesas", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      dataVencimento: DIA,
      descricao: "Despesa do turno",
      valorOriginal: 400,
      contaOrigemId: fx.contaId,
      grupoDespesaId: idsTeste.grupoDespesaOperacional
    });
    expect(despesa.statusCode, despesa.body).toBe(201);

    const fechamento = await fechar(fx.caixaId, "Fechou com quebra de contagem");
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    const quebras = await quebrasDoFechamento(fx.caixaId);
    expect(quebras).toHaveLength(2);
    // Uma aponta a entrega divergente; a outra e a do turno, sem ponteiro.
    expect(quebras.filter((q) => q.transferencia_id === entrega)).toEqual([
      { valor: "-20.00", transferencia_id: entrega, usuario_id: fx.usuarioId }
    ]);
    expect(quebras.filter((q) => q.transferencia_id === null)).toHaveLength(1);
  });

  // ------------------------------------------------------------------------------------------
  // RED-8 · elegibilidade nas DUAS copias. Numa solicitacao D4, quem programa e quem executa ficam
  // os dois fora da conferencia (R-028). Se isso nao deixar ninguem elegivel, a EXECUCAO tem de ser
  // recusada — antes de o dinheiro sair. Corrigir so uma das copias produzia o oposto: entrega que
  // ninguem pode conferir e caixa que nunca mais fecha.
  // ------------------------------------------------------------------------------------------
  it("Deve_RecusarAExecucao_Quando_ProgramadorEExecutorSaoOsUnicosVinculadosAoCofre", async () => {
    const fx = await novoCaixa("R183 elegibilidade");
    await venda(500);

    // Tesouraria PROGRAMA; gerente EXECUTA. Os dois sao os unicos vinculados a conta do cofre no
    // seed, entao a exclusao dos dois nao deixa confirmador possivel.
    const programacao = await inject("POST", `/api/caixa/${fx.caixaId}/solicitacoes-cofre`, cookieTesouraria, {
      tipo: "sangria",
      valor: 100,
      idempotenciaChave: randomUUID()
    });
    expect(programacao.statusCode, programacao.body).toBe(200);
    const solicitacao = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and solicitacao_cofre_em is not null order by criado_em desc limit 1",
      [fx.caixaId]
    );

    const execucao = await inject(
      "POST",
      `/api/caixa/${fx.caixaId}/solicitacoes-cofre/${solicitacao!.id}/executar`,
      cookieGerente,
      { lacre: `R183-D4-${sequencia}` }
    );

    assertProblem(execucao, 400);
    expect(execucao.body).toMatch(/elegivel|eleg[ií]vel/iu);
    // O dinheiro NAO saiu: a solicitacao continua agendada.
    expect((await linha(solicitacao!.id))?.status).toBe("agendada");
  });
});

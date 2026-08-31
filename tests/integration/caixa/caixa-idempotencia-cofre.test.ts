import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// B2 · idempotencia da entrega ao cofre, e D4 · solicitacao programada.
//
// Por que este arquivo existe: a trava da linha do caixa (B1) e o teto do saldo (D1) NAO resolvem
// repeticao. Com saldo 300, dois POSTs identicos de 100 passam os dois — o segundo ainda encontra
// 200 disponiveis. Isso e uma entrega de dinheiro duplicada com um envelope so, e quem paga a
// diferenca e o operador, na quebra do fechamento.
//
// A unica coisa que separa "intencao nova" de "retry" e uma chave carimbada pelo CLIENTE e
// protegida por UNIQUE parcial no banco. Estes testes provam os cinco comportamentos que essa
// chave tem de garantir, e provam a execucao programada em cima da mesma entidade.
describe("caixa - idempotencia da entrega ao cofre (B2) e solicitacao programada (D4)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  let cookieCaixa: string;
  // O gerente tambem responde pelo cofre no seed. Ele existe aqui porque quem CRIOU o movimento
  // nunca pode conferi-lo (R-028): quando a Tesouraria programa a entrega, quem confere e ele.
  let cookieGerente: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieTesouraria, cookieCaixa, cookieGerente] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente")
    ]);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  const empresaId = idsTeste.empresaA;

  async function usuarioAdminId() {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");
    return usuario.id;
  }

  function post(url: string, payload: object, cookie = cookieAdmin) {
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // Abre um caixa proprio (conta + PDV proprios) e injeta uma venda em dinheiro, que e o que
  // produz saldo fisico para entregar.
  async function abrirCaixaComSaldo(nome: string, dataHoraAbertura: string, valorVenda: number) {
    const contaId = await criar("/api/contas", { empresaId, nome: `Conta ${nome}` });
    const pdvId = await criar("/api/pdvs", { empresaId, nome: `PDV ${nome}`, contaId, ativo: true });
    const caixaId = await criar("/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura
    });
    const dataReferencia = dataHoraAbertura.slice(0, 10);
    await criar("/api/vendas", {
      empresaId,
      dataReferencia,
      dataPagamento: dataReferencia,
      descricao: `Venda ${nome}`,
      valorOriginal: valorVenda,
      contaOrigemId: contaId,
      pdvId,
      colaboradorId: idsTeste.colaboradorAdmin,
      itensVenda: [
        {
          produtoId: idsTeste.produto,
          descricaoProduto: "Pao",
          quantidade: 1,
          valorUnitario: valorVenda,
          valorTotal: valorVenda
        }
      ],
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: valorVenda }]
    });
    return { caixaId, contaId, pdvId };
  }

  async function saldoDoCaixa() {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${empresaId}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta);
    return json<{ data: { resumo: { saldo: number } } }>(resposta).data.resumo.saldo;
  }

  // O seed vincula Tesouraria E gerente ao cofre — sao dois porque quem cria nunca confirma
  // (R-028). Os testes de bloqueio mexem nesses vinculos e restauram por aqui.
  async function restaurarResponsaveisDoCofre() {
    for (const email of [usuariosTeste.tesouraria.email, usuariosTeste.gerente.email]) {
      await executarSql(
        `insert into contas_usuarios (empresa_id, conta_id, usuario_id)
         select $1, $2, id from "user" where lower(email) = lower($3)
         on conflict do nothing`,
        [empresaId, idsTeste.contaCofre, email]
      );
    }
  }

  function movimentosDoCaixa(caixaId: string) {
    return consultarTodos<{ id: string; valor_original: string; status: string; n_lacre_doc: string | null }>(
      "select id, valor_original, status, n_lacre_doc from transferencias where caixa_id = $1 order by criado_em",
      [caixaId]
    );
  }

  it("mesma chave + mesma intencao devolve o movimento vencedor sem duplicar", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-repeticao", "2026-06-01T08:00", 300);
    const chave = randomUUID();
    const entrega = {
      tipo: "retorno",
      valor: 100,
      lacre: "IDEM-REP-1",
      observacao: "Primeira",
      idempotenciaChave: chave
    };

    const primeira = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(primeira.statusCode, primeira.body).toBe(200);
    expect(await saldoDoCaixa()).toBe(200);

    // O retry e byte a byte o mesmo POST. Tem de responder 200 e NAO tirar mais 100 do caixa.
    const retry = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(await saldoDoCaixa()).toBe(200);

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "100.00", status: "pendente", n_lacre_doc: "IDEM-REP-1" });

    // E o lacre tambem nao pode ter sido consumido duas vezes.
    const lacres = await consultarTodos<{ numero: string }>(
      "select numero from lacres where empresa_id = $1 and numero = $2",
      [empresaId, "IDEM-REP-1"]
    );
    expect(lacres).toHaveLength(1);
  });

  // Este e o caso que so a ORDEM certa resolve. O retry carrega o mesmo lacre; se a unicidade do
  // lacre fosse checada antes da idempotencia, o retry morreria com "Lacre ja utilizado" — e o
  // operador, achando que falhou, lancaria de novo com outro lacre. Duas entregas, um envelope.
  it("retry com o mesmo lacre nao e confundido com lacre reutilizado", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-lacre", "2026-06-02T08:00", 150);
    const chave = randomUUID();
    const entrega = { tipo: "retorno", valor: 50, lacre: "IDEM-LACRE-1", idempotenciaChave: chave };

    expect((await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega)).statusCode).toBe(200);
    const retry = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);

    expect(retry.statusCode, retry.body).toBe(200);
    // A mensagem que NAO pode aparecer e a da unicidade do lacre. (Casar so por /lacre/ nao serve:
    // o nome do PDV do fixture contem "lacre" e o corpo de sucesso traz o PDV.)
    expect(retry.body).not.toMatch(/já utilizado em outro movimento/iu);
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
  });

  // O retry pode chegar quando o saldo ja foi zerado pela primeira tentativa. Se o teto rodasse
  // antes da idempotencia, este caso responderia "Caixa sem saldo" para um ato que DEU CERTO.
  it("retry que zerou o saldo continua respondendo 200, e nao 'sem saldo'", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-saldo-zero", "2026-06-03T08:00", 80);
    const entrega = { tipo: "retorno", valor: 80, idempotenciaChave: randomUUID() };

    expect((await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega)).statusCode).toBe(200);
    expect(await saldoDoCaixa()).toBe(0);

    const retry = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
  });

  it("mesma chave com intencao diferente e conflito explicito (409), sem criar movimento", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-conflito", "2026-06-04T08:00", 400);
    const chave = randomUUID();
    const original = {
      tipo: "retorno",
      valor: 100,
      lacre: "IDEM-CONF-1",
      observacao: "Original",
      idempotenciaChave: chave
    };
    expect((await post(`/api/caixa/${caixaId}/transferencia-cofre`, original)).statusCode).toBe(200);

    // Cada campo da intencao, sozinho, tem de derrubar a reutilizacao da chave.
    const divergentes = [
      { ...original, valor: 120 },
      { ...original, tipo: "sangria" },
      { ...original, lacre: "IDEM-CONF-2" },
      { ...original, observacao: "Outra coisa" }
    ];
    for (const payload of divergentes) {
      const resposta = await post(`/api/caixa/${caixaId}/transferencia-cofre`, payload);
      assertProblem(resposta, 409);
      expect(resposta.body).toMatch(/idempotencia/iu);
    }

    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
    expect(await saldoDoCaixa()).toBe(300);
  });

  it("chaves diferentes criam movimentos legitimos, cada um com o seu lacre", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-multiplo", "2026-06-05T08:00", 250);

    for (const [valor, lacre] of [
      [60, "IDEM-MULTI-1"],
      [40, "IDEM-MULTI-2"]
    ] as const) {
      const resposta = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
        tipo: "retorno",
        valor,
        lacre,
        idempotenciaChave: randomUUID()
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
    }

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(2);
    // D5: o parcial anterior NAO foi editado — sao dois movimentos imutaveis, com lacres proprios.
    expect(movimentos.map((m) => [m.valor_original, m.n_lacre_doc])).toEqual([
      ["60.00", "IDEM-MULTI-1"],
      ["40.00", "IDEM-MULTI-2"]
    ]);
    expect(await saldoDoCaixa()).toBe(150);
  });

  // Isolamento entre empresas: o UNIQUE e (empresa_id, chave). A mesma chave em outra empresa e um
  // ato novo e legitimo — nao pode colidir nem, muito menos, devolver o movimento da outra empresa.
  it("a mesma chave em empresas diferentes nao colide", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-empresa", "2026-06-06T08:00", 90);
    const chave = randomUUID();

    const resposta = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 30,
      idempotenciaChave: chave
    });
    expect(resposta.statusCode, resposta.body).toBe(200);

    const daOutraEmpresa = await consultarTodos<{ id: string }>(
      "select id from transferencias where empresa_id = $1 and idempotencia_chave = $2",
      [idsTeste.empresaB, chave]
    );
    expect(daOutraEmpresa).toHaveLength(0);

    const daEmpresaA = await consultarTodos<{ id: string }>(
      "select id from transferencias where empresa_id = $1 and idempotencia_chave = $2",
      [empresaId, chave]
    );
    expect(daEmpresaA).toHaveLength(1);
  });

  // B1 · concorrencia de verdade, nao repeticao sequencial. Os dois fechamentos partem JUNTOS: e
  // a trava `FOR UPDATE` que os serializa, e a guarda `status = 'aberto'` do UPDATE que impede o
  // perdedor de sobrescrever `fechado_por`, `fechado_em` e os sete totais do vencedor.
  //
  // Um teste sequencial nao prova isto: sequencialmente o segundo POST ja LE 'fechado' e para na
  // primeira validacao, sem nunca exercitar a corrida.
  it("dois fechamentos SIMULTANEOS: um vence, o outro falha, e so um retorno final e criado", async () => {
    const { caixaId } = await abrirCaixaComSaldo("b1-corrida", "2026-06-15T08:00", 90);

    const [a, b] = await Promise.all([
      post(`/api/caixa/${caixaId}/fechar`, { observacao: "Corrida A", lacreRetorno: "B1-CORRIDA-A" }),
      post(`/api/caixa/${caixaId}/fechar`, { observacao: "Corrida B" })
    ]);

    const codigos = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(codigos, `A=${a.body} | B=${b.body}`).toEqual([204, 400]);

    // O ponto que mais importa: UM retorno final, nao dois. Rollback integral do perdedor.
    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "90.00", status: "pendente" });

    // E os sete totais ficaram congelados uma unica vez, coerentes com o caixa.
    const fechado = await consultarUm<{ status: string; saldo: string; total_entradas: string }>(
      "select status, saldo, total_entradas from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00", total_entradas: "90.00" });
  });

  // B2 · a mesma corrida, agora na ENTREGA avulsa. Aqui quem decide e o `ON CONFLICT DO NOTHING`:
  // o perdedor nao insere, nao levanta 23505, nao derruba a transacao — le a linha vencedora e
  // responde 200. Com INSERT cru os dois teriam sucesso (a trava sozinha nao distingue retry).
  it("duas entregas SIMULTANEAS com a mesma chave criam um movimento so", async () => {
    const { caixaId } = await abrirCaixaComSaldo("b2-corrida", "2026-06-16T08:00", 300);
    const entrega = { tipo: "retorno", valor: 100, idempotenciaChave: randomUUID() };

    const respostas = await Promise.all([
      post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega),
      post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega)
    ]);

    for (const resposta of respostas) expect(resposta.statusCode, resposta.body).toBe(200);
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
    // 300 - 100 (uma vez so). Se a corrida tivesse furado, seria 100.
    expect(await saldoDoCaixa()).toBe(200);
  });

  // B2 x D6: o retorno final do fechamento NAO usa chave, e nao precisa. A trava da linha e a
  // guarda `status = 'aberto'` do UPDATE ja tornam o ato irrepetivel: o segundo fechamento nao
  // encontra caixa aberto e para antes de criar qualquer coisa.
  it("fechamento repetido nao cria um segundo retorno final", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-fechamento", "2026-06-07T08:00", 70);

    const primeiro = await post(`/api/caixa/${caixaId}/fechar`, {
      observacao: "Fechamento",
      lacreRetorno: "IDEM-FECHA-1"
    });
    expect(primeiro.statusCode, primeiro.body).toBe(204);

    const segundo = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Fechamento" });
    assertProblem(segundo, 400);

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "70.00", status: "pendente" });

    // Os sete totais ficam congelados no fechamento, e o segundo POST nao os reescreveu.
    const fechado = await consultarUm<{ status: string; saldo: string; total_entradas: string }>(
      "select status, saldo, total_entradas from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00", total_entradas: "70.00" });
  });

  // --- D4 ------------------------------------------------------------------------------------

  // Helper: programa uma solicitacao e devolve id + a chave K1 usada. K1 e a ancora da CRIACAO.
  async function programar(caixaId: string, corpo: { tipo: string; valor: number; observacao?: string }) {
    const chave = randomUUID();
    const resposta = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre`,
      { ...corpo, idempotenciaChave: chave },
      cookieTesouraria
    );
    expect(resposta.statusCode, resposta.body).toBe(200);
    const lista = json<{ data: { id: string; valor: number }[] }>(resposta).data;
    return { chave, lista, id: lista[lista.length - 1]!.id };
  }

  function chaveGravada(id: string) {
    return consultarUm<{ idempotencia_chave: string | null; status: string; valor_original: string }>(
      "select idempotencia_chave, status, valor_original from transferencias where id = $1",
      [id]
    );
  }

  it("a retaguarda programa, o saldo NAO se move, e o operador executa o valor programado", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-fluxo", "2026-06-08T08:00", 200);
    const { id, lista } = await programar(caixaId, {
      tipo: "sangria",
      valor: 120,
      observacao: "Recolher antes do pico"
    });
    expect(lista).toHaveLength(1);
    expect(lista[0]?.valor).toBe(120);

    // "Programada nao movimenta saldo": nasce 'agendada', que a formula do saldo nao conta.
    expect(await saldoDoCaixa()).toBe(200);
    expect((await chaveGravada(id))?.status).toBe("agendada");

    // O operador executa: a MESMA linha vira 'pendente'. Sem valor, sem observacao e sem chave no
    // payload — so o lacre do envelope.
    const executar = await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-EXEC-1" });
    expect(executar.statusCode, executar.body).toBe(200);
    expect(await saldoDoCaixa()).toBe(80);

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "120.00", status: "pendente", n_lacre_doc: "D4-EXEC-1" });
  });

  // Teste obrigatorio 1 e 2 — o BLOQUEADOR. A execucao nao pode carimbar chave propria: se ela
  // sobrescrevesse K1, o retry da programacao nao encontraria mais a linha e criaria OUTRA
  // solicitacao. Uma ordem de dinheiro duplicada por um retry de rede.
  it("programar K1 -> executar -> repetir K1: uma unica linha, e K1 continua gravada", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-retry-programacao", "2026-06-17T08:00", 300);
    const { chave, id } = await programar(caixaId, { tipo: "sangria", valor: 100, observacao: "Ordem 1" });

    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-RETRY-1" })).statusCode
    ).toBe(200);

    // Teste 2: a chave da CRIACAO sobrevive a execucao.
    expect((await chaveGravada(id))?.idempotencia_chave).toBe(chave);
    expect((await chaveGravada(id))?.status).toBe("pendente");

    // Teste 1: o retry da programacao reencontra a MESMA solicitacao. Nem 409 (o lacre e o status
    // vieram depois e nao fazem parte da intencao original), nem linha nova.
    const retry = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre`,
      { tipo: "sangria", valor: 100, observacao: "Ordem 1", idempotenciaChave: chave },
      cookieTesouraria
    );
    expect(retry.statusCode, retry.body).toBe(200);

    const doCaixa = await movimentosDoCaixa(caixaId);
    expect(doCaixa).toHaveLength(1);
    expect(doCaixa[0]!.id).toBe(id);
    expect(await saldoDoCaixa()).toBe(200);
  });

  // Teste obrigatorio 3.
  it("K1 com intencao diferente depois da execucao retorna 409", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-k1-divergente", "2026-06-18T08:00", 300);
    const { chave, id } = await programar(caixaId, { tipo: "sangria", valor: 100, observacao: "Ordem A" });
    expect((await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, {})).statusCode).toBe(200);

    for (const divergente of [
      { tipo: "sangria", valor: 150, observacao: "Ordem A" },
      { tipo: "retorno", valor: 100, observacao: "Ordem A" },
      { tipo: "sangria", valor: 100, observacao: "Outra ordem" }
    ]) {
      const resposta = await post(
        `/api/caixa/${caixaId}/solicitacoes-cofre`,
        { ...divergente, idempotenciaChave: chave },
        cookieTesouraria
      );
      assertProblem(resposta, 409);
    }
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
  });

  // Testes obrigatorios 4 e 5 — a execucao e idempotente por `solicitacaoId`, e o unico conteudo
  // proprio do ato fisico e o lacre.
  it("execucao repetida: mesmo lacre 200 sem duplicar, lacre diferente 409", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-repeticao", "2026-06-09T08:00", 200);
    const { id } = await programar(caixaId, { tipo: "retorno", valor: 50 });

    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-REP-1" })).statusCode
    ).toBe(200);

    const mesmoLacre = await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-REP-1" });
    expect(mesmoLacre.statusCode, mesmoLacre.body).toBe(200);

    const outroLacre = await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-REP-2" });
    assertProblem(outroLacre, 409);

    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
    expect(await saldoDoCaixa()).toBe(150);
  });

  // Teste obrigatorio 6.
  it("duas execucoes concorrentes produzem UMA transicao e UM lacre", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-corrida", "2026-06-19T08:00", 200);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 80 });

    const respostas = await Promise.all([
      post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-CORRIDA-1" }),
      post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-CORRIDA-1" })
    ]);
    for (const resposta of respostas) expect(resposta.statusCode, resposta.body).toBe(200);

    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
    const lacres = await consultarTodos<{ numero: string }>(
      "select numero from lacres where empresa_id = $1 and numero = $2",
      [empresaId, "D4-CORRIDA-1"]
    );
    expect(lacres).toHaveLength(1);
    expect(await saldoDoCaixa()).toBe(120);
  });

  // Testes obrigatorios 7 e 8 — decisao 1: o valor programado e imutavel.
  it("valor e observacao programados permanecem imutaveis, e o extra vira movimento avulso", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-imutavel", "2026-06-10T08:00", 300);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 200, observacao: "Ordem da tesouraria" });

    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-IMUT-1" })).statusCode
    ).toBe(200);

    const executada = await consultarUm<{ valor_original: string; observacao: string | null }>(
      "select valor_original, observacao from transferencias where id = $1",
      [id]
    );
    // A execucao nao reescreveu nem o valor nem a observacao da ordem.
    expect(executada).toMatchObject({ valor_original: "200.00", observacao: "Ordem da tesouraria" });

    // O que sobra sai por um movimento AVULSO proprio, com chave e lacre novos.
    const avulso = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "sangria",
      valor: 50,
      lacre: "D4-IMUT-2",
      idempotenciaChave: randomUUID()
    });
    expect(avulso.statusCode, avulso.body).toBe(200);

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos.map((m) => [m.valor_original, m.n_lacre_doc])).toEqual([
      ["200.00", "D4-IMUT-1"],
      ["50.00", "D4-IMUT-2"]
    ]);
    expect(await saldoDoCaixa()).toBe(50);
  });

  // Teste obrigatorio 9 — decisao 1: menos que o programado NAO executa (nem parcialmente).
  it("saldo insuficiente nao executa a solicitacao e nao a consome", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-insuficiente", "2026-06-11T08:00", 50);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 500 });

    const executar = await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, {});
    assertProblem(executar, 400);
    expect(executar.body).toMatch(/insuficiente/iu);

    // Rollback integral: continua 'agendada', com o valor original, e o saldo intacto.
    const depois = await chaveGravada(id);
    expect(depois).toMatchObject({ status: "agendada", valor_original: "500.00" });
    expect(await saldoDoCaixa()).toBe(50);
  });

  // R-028/R-036: a entrega nasce 'pendente' e so entra no cofre quando quem OPERA a conta de
  // destino conferir. Isso depende de `contas_usuarios` — sem vinculo nao existe quem confirme, e
  // o dinheiro fica pendente para sempre. Este teste prova o caminho inteiro.
  it("a entrega pendente e confirmada por quem opera a conta do cofre (contas_usuarios)", async () => {
    const { caixaId } = await abrirCaixaComSaldo("cofre-confirmacao", "2026-06-14T08:00", 120);

    const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 120,
      lacre: "CONF-COFRE-1",
      idempotenciaChave: randomUUID()
    });
    expect(entrega.statusCode, entrega.body).toBe(200);

    const movimento = (await movimentosDoCaixa(caixaId))[0]!;
    expect(movimento.status).toBe("pendente");

    // O candidato de destino ja nasce junto com o movimento — sem ele a confirmacao e impossivel.
    const candidatos = await consultarTodos<{ conta_id: string }>(
      "select conta_id from transferencias_destinos_candidatos where transferencia_id = $1",
      [movimento.id]
    );
    expect(candidatos.map((c) => c.conta_id)).toEqual([idsTeste.contaCofre]);

    // A Tesouraria ja e responsavel pela conta do cofre (vinculo do seed, decisao 7). Quem criou o
    // movimento foi o admin, e quem confirma nao pode ser quem criou (R-028) — dois usuarios.
    const tesourariaUsuario = await consultarUm<{ id: string }>(
      'select id from "user" where lower(email) = lower($1)',
      [usuariosTeste.tesouraria.email]
    );
    const vinculado = await consultarUm<{ total: string }>(
      "select count(*) as total from contas_usuarios where conta_id = $1 and usuario_id = $2",
      [idsTeste.contaCofre, tesourariaUsuario!.id]
    );
    expect(vinculado?.total).toBe("1");

    const confirmar = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "CONF-COFRE-1", valorRecebido: 120 },
      cookieTesouraria
    );
    expect(confirmar.statusCode, confirmar.body).toBe(200);

    const depois = await consultarUm<{ status: string; confirmado_por: string | null }>(
      "select status, confirmado_por from transferencias where id = $1",
      [movimento.id]
    );
    expect(depois?.status).toBe("recebido");
    expect(depois?.confirmado_por).toBe(tesourariaUsuario!.id);

    // O lacre da volta e rompido na conferencia — o envelope foi aberto.
    const lacre = await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [
      "CONF-COFRE-1"
    ]);
    expect(lacre?.rompido).toBe(true);

    // E o saldo do caixa NAO muda com a confirmacao: ele ja tinha sido abatido quando a entrega
    // virou 'pendente' (R-036). Confirmar move o dinheiro para o cofre, nao de volta.
    expect(await saldoDoCaixa()).toBe(0);
  });

  // Teste obrigatorio 11 — decisao 5.
  it("solicitacao agendada bloqueia o fechamento ate ser executada", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-bloqueia-fechamento", "2026-06-20T08:00", 150);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 100 });

    const bloqueado = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Tentativa" });
    assertProblem(bloqueado, 400);
    expect(bloqueado.body).toMatch(/execute ou cancele/iu);

    // Nada foi criado nem fechado: a ordem da retaguarda continua de pe.
    expect((await chaveGravada(id))?.status).toBe("agendada");
    const caixa = await consultarUm<{ status: string }>("select status from fechamentos_caixa where id = $1", [
      caixaId
    ]);
    expect(caixa?.status).toBe("aberto");

    // Executada a ordem, a trava da D12 sai — mas o dinheiro passa a estar NA RUA, e a G1/R-171
    // assume: `agendada` vira `pendente`, e pendente tambem nao deixa fechar.
    expect((await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, {})).statusCode).toBe(200);
    const aindaEmTransito = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Tentativa 2" });
    assertProblem(aindaEmTransito, 400);
    expect(aindaEmTransito.body).toMatch(/aguardando confer[eê]ncia/iu);

    // Conferida no cofre, o fechamento passa e devolve a sobra no mesmo ato (D6).
    const entregue = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and status = 'pendente' order by criado_em desc limit 1",
      [caixaId]
    );
    const conferencia = await post(
      `/api/transferencias/${entregue!.id}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, valorRecebido: 100 },
      cookieGerente
    );
    expect(conferencia.statusCode, conferencia.body).toBe(200);

    const fechar = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Fechamento" });
    expect(fechar.statusCode, fechar.body).toBe(204);
  });

  // Teste obrigatorio 12 — decisao 7. O bloqueio e por ATO, nao global: fechamento SEM retorno
  // fisico nao entrega nada e por isso nao pode ser barrado por falta de quem conferir.
  it("sem responsavel no Cofre bloqueia so os atos que entregariam dinheiro", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d7-sem-responsavel", "2026-06-21T08:00", 100);
    // Remove o vinculo do seed para simular a empresa mal configurada.
    await executarSql("delete from contas_usuarios where conta_id = $1", [idsTeste.contaCofre]);
    try {
      const avulsa = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
        tipo: "retorno",
        valor: 10,
        idempotenciaChave: randomUUID()
      });
      assertProblem(avulsa, 400);
      expect(avulsa.body).toMatch(/responsavel/iu);

      const programacao = await post(
        `/api/caixa/${caixaId}/solicitacoes-cofre`,
        { tipo: "sangria", valor: 10, idempotenciaChave: randomUUID() },
        cookieTesouraria
      );
      assertProblem(programacao, 400);

      // Fechamento COM sobra entrega dinheiro -> bloqueado.
      const comSobra = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Com sobra" });
      assertProblem(comSobra, 400);
      expect(comSobra.body).toMatch(/responsavel/iu);
      expect(await movimentosDoCaixa(caixaId)).toHaveLength(0);
    } finally {
      await restaurarResponsaveisDoCofre();
    }
  });

  // Decisao 7 · o caso que so a elegibilidade REAL pega: existe vinculo, mas o unico vinculado e
  // quem esta criando o movimento — e ele nao pode confirmar o proprio envio (R-028). Checar so a
  // existencia do vinculo liberaria a entrega e a confirmacao depois seria impossivel.
  it("unico responsavel do Cofre sendo o proprio criador bloqueia a entrega", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d7-criador-unico", "2026-07-09T08:00", 100);
    // Deixa SO a Tesouraria vinculada, e e ela quem vai programar.
    await executarSql(
      `delete from contas_usuarios
        where conta_id = $1
          and usuario_id <> (select id from "user" where lower(email) = lower($2))`,
      [idsTeste.contaCofre, usuariosTeste.tesouraria.email]
    );
    try {
      const programacao = await post(
        `/api/caixa/${caixaId}/solicitacoes-cofre`,
        { tipo: "sangria", valor: 20, idempotenciaChave: randomUUID() },
        cookieTesouraria
      );
      assertProblem(programacao, 400);
      expect(programacao.body).toMatch(/elegivel/iu);
      expect(await movimentosDoCaixa(caixaId)).toHaveLength(0);

      // E o vinculo continua la — o bloqueio nao e "falta vinculo", e "falta quem POSSA conferir".
      const vinculos = await consultarTodos<{ usuario_id: string }>(
        "select usuario_id from contas_usuarios where conta_id = $1",
        [idsTeste.contaCofre]
      );
      expect(vinculos).toHaveLength(1);
    } finally {
      await restaurarResponsaveisDoCofre();
    }
  });

  it("sem responsavel no Cofre o fechamento SEM sobra continua permitido", async () => {
    // Caixa sem venda nenhuma: saldo zero, nenhum retorno fisico a entregar.
    const contaId = await criar("/api/contas", { empresaId, nome: "Conta d7-sem-sobra" });
    const pdvId = await criar("/api/pdvs", { empresaId, nome: "PDV d7-sem-sobra", contaId, ativo: true });
    const caixaId = await criar("/api/caixa/abrir", {
      empresaId,
      pdvId,
      usuarioCaixaId: await usuarioAdminId(),
      dataHoraAbertura: "2026-06-22T08:00"
    });

    await executarSql("delete from contas_usuarios where conta_id = $1", [idsTeste.contaCofre]);
    try {
      const fechar = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Sem sobra" });
      expect(fechar.statusCode, fechar.body).toBe(204);
      expect(await movimentosDoCaixa(caixaId)).toHaveLength(0);
    } finally {
      await restaurarResponsaveisDoCofre();
    }
  });

  // Teste obrigatorio 14 — decisao 9/R-026. Antes disto um movimento sem lacre era INCONFIRMAVEL:
  // o payload exigia numero e o repositorio tentava romper um selo que nao existia.
  it("movimento sem lacre pode ser confirmado sem inventar um", async () => {
    const { caixaId } = await abrirCaixaComSaldo("conf-sem-lacre", "2026-06-23T08:00", 60);
    const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 60,
      idempotenciaChave: randomUUID()
    });
    expect(entrega.statusCode, entrega.body).toBe(200);
    const movimento = (await movimentosDoCaixa(caixaId))[0]!;
    expect(movimento.n_lacre_doc).toBeNull();

    const confirmar = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, valorRecebido: 60 },
      cookieTesouraria
    );
    expect(confirmar.statusCode, confirmar.body).toBe(200);
    expect((await chaveGravada(movimento.id))?.status).toBe("recebido");
  });

  // Teste obrigatorio 15 — decisao 8 (a parte que ja e possivel sem migration): lacre divergente
  // NAO confirma e NAO cancela. O movimento fica `pendente`, pronto para reconferencia.
  it("lacre divergente na conferencia mantem o movimento pendente", async () => {
    const { caixaId } = await abrirCaixaComSaldo("conf-lacre-divergente", "2026-06-24T08:00", 70);
    const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 70,
      lacre: "CONF-DIV-1",
      idempotenciaChave: randomUUID()
    });
    expect(entrega.statusCode, entrega.body).toBe(200);
    const movimento = (await movimentosDoCaixa(caixaId))[0]!;

    // Decisao 5: em Caixa -> Cofre a divergencia sai como 409 `CONFERENCIA_DIVERGENTE` e aponta o
    // caminho da recusa auditavel. Nao e mais um 400 generico do repositorio.
    const divergente = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "CONF-DIV-OUTRO", valorRecebido: 70 },
      cookieTesouraria
    );
    assertProblem(divergente, 409, "CONFERENCIA_DIVERGENTE");

    // Rollback integral: continua pendente, sem confirmante, e o lacre segue intacto.
    const depois = await consultarUm<{ status: string; confirmado_por: string | null }>(
      "select status, confirmado_por from transferencias where id = $1",
      [movimento.id]
    );
    expect(depois).toMatchObject({ status: "pendente", confirmado_por: null });
    const lacre = await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [
      "CONF-DIV-1"
    ]);
    expect(lacre?.rompido).toBe(false);

    // Depois da resolucao, a conferencia com o lacre certo passa normalmente.
    const correta = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      { contaDestinoId: idsTeste.contaCofre, nLacreDoc: "CONF-DIV-1", valorRecebido: 70 },
      cookieTesouraria
    );
    expect(correta.statusCode, correta.body).toBe(200);
  });

  // O gate de permissao sozinho NAO protege isto: o operador de caixa tambem tem
  // `transferencias_criar`. Quem barra e a segunda camada, no servico (`podeLancarSemCaixa`) — e e
  // por isso que ela existe. Se alguem um dia trocar as duas por uma so, este teste cai.
  it("o operador do caixa passa no gate de permissao mas nao pode programar (403 pelo papel)", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-papel", "2026-06-12T08:00", 100);

    const resposta = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre`,
      { tipo: "sangria", valor: 10, idempotenciaChave: randomUUID() },
      cookieCaixa
    );
    assertProblem(resposta, 403);
    expect(resposta.body).toMatch(/retaguarda/iu);
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(0);
  });

  // --- Isolamento entre o fluxo D4 e a transferencia GENERICA ---------------------------------
  //
  // `criarTransferencia` grava `caixa_id` quando a transferencia envolve a conta do PDV, e nasce
  // 'agendada' se tiver `agendadaPara`. Antes do marcador `solicitacao_cofre_em`, essa linha
  // aparecia como solicitacao, bloqueava o fechamento e podia ser executada pelo endpoint D4 —
  // corrompendo uma transferencia que nunca foi ordem de entrega ao cofre.
  it("transferencia generica agendada no mesmo caixa nao vaza para o fluxo D4", async () => {
    const { caixaId, contaId } = await abrirCaixaComSaldo("d4-isolamento", "2026-06-25T08:00", 200);

    // Generica AGENDADA envolvendo a conta do PDV: e o vetor exato do vazamento.
    //
    // Criada pelo ADMIN, e nao pela Tesouraria, de proposito: `criarTransferencia` so grava
    // `caixa_id` quando quem cria TEM caixa aberto e a transferencia envolve a conta do PDV. A
    // Tesouraria nao opera caixa, entao pela mao dela a linha nasceria com `caixa_id` nulo e o
    // vazamento que este teste precisa provar nem existiria.
    const generica = await post("/api/transferencias", {
      empresaId,
      dataReferencia: "2026-06-25",
      descricao: "Deposito programado no banco",
      valorOriginal: 30,
      contaOrigemId: contaId,
      contaDestinoId: idsTeste.contaBanco,
      nLacreDoc: "GEN-AGENDADA-1",
      agendadaPara: "2099-01-01T10:00:00.000Z",
      tempoConfirmacao: "1dia"
    });
    expect(generica.statusCode, generica.body).toBe(201);
    const genericaId = json<{ data: { id: string } }>(generica).data.id;
    const comoFicou = await consultarUm<{
      status: string;
      caixa_id: string | null;
      solicitacao_cofre_em: string | null;
    }>("select status, caixa_id, solicitacao_cofre_em from transferencias where id = $1", [genericaId]);
    // Precondicao do teste: se ela nao ficasse 'agendada' e ligada ao caixa, nao haveria vazamento
    // a provar e o teste passaria por acidente.
    expect(comoFicou).toMatchObject({ status: "agendada", caixa_id: caixaId, solicitacao_cofre_em: null });

    // 1) Nao aparece na lista D4.
    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/solicitacoes-cofre`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(lista);
    expect(json<{ data: { id: string }[] }>(lista).data).toHaveLength(0);

    // 2) Nao e executavel pelo endpoint D4 (404, e nao "executei sua transferencia generica").
    const executar = await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${genericaId}/executar`, {});
    assertProblem(executar, 404);

    // 3) Nao e cancelavel pelo endpoint D4.
    const cancelar = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre/${genericaId}/cancelar`,
      { motivo: "tentativa indevida" },
      cookieTesouraria
    );
    assertProblem(cancelar, 404);

    // 4) Nao bloqueia o fechamento.
    const fechar = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Fecha mesmo com generica agendada" });
    expect(fechar.statusCode, fechar.body).toBe(204);

    // E continua intacta: nada do D4 a tocou.
    const depois = await consultarUm<{ status: string; solicitacao_cofre_em: string | null }>(
      "select status, solicitacao_cofre_em from transferencias where id = $1",
      [genericaId]
    );
    expect(depois).toMatchObject({ status: "agendada", solicitacao_cofre_em: null });
  });

  // --- Identidade do executor -----------------------------------------------------------------
  it("programador e executor diferentes ficam auditados separadamente", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-executor", "2026-06-26T08:00", 200);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 60 });

    const tesourariaId = (await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.tesouraria.email
    ]))!.id;
    const adminId = await usuarioAdminId();

    // Quem programou foi a Tesouraria; quem executa e o admin (gerente do caixa neste fixture).
    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-EXEC-AUD" })).statusCode
    ).toBe(200);

    const auditoria = await consultarUm<{ criado_por: string; executado_por: string; executado_em: string | null }>(
      "select criado_por, executado_por, executado_em from transferencias where id = $1",
      [id]
    );
    expect(auditoria?.criado_por).toBe(tesourariaId);
    // O executor REAL — nao quem programou. Sem esta coluna, a recusa notificaria a pessoa errada.
    expect(auditoria?.executado_por).toBe(adminId);
    expect(auditoria?.executado_em).not.toBeNull();
  });

  it("retry e corrida nao trocam executado_por nem executado_em", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-executor-retry", "2026-06-27T08:00", 200);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 40 });

    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-RETRY-EXEC" })).statusCode
    ).toBe(200);
    const primeira = await consultarUm<{ executado_por: string; executado_em: string }>(
      "select executado_por, executado_em from transferencias where id = $1",
      [id]
    );

    // Retry com o mesmo lacre, e duas execucoes concorrentes por cima: nada pode reescrever.
    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-RETRY-EXEC" })).statusCode
    ).toBe(200);
    await Promise.all([
      post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-RETRY-EXEC" }),
      post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, { lacre: "D4-RETRY-EXEC" })
    ]);

    const depois = await consultarUm<{ executado_por: string; executado_em: string }>(
      "select executado_por, executado_em from transferencias where id = $1",
      [id]
    );
    expect(depois).toEqual(primeira);
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
  });

  // --- Cancelamento (decisao 2) ---------------------------------------------------------------
  it("cancelar agendada grava auditoria, mantem K1 e libera o fechamento", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-cancelar", "2026-06-28T08:00", 150);
    const { chave, id } = await programar(caixaId, { tipo: "sangria", valor: 90, observacao: "Ordem a revogar" });

    // Com solicitacao agendada, o caixa nao fecha.
    assertProblem(await post(`/api/caixa/${caixaId}/fechar`, { observacao: "x" }), 400);

    const cancelar = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre/${id}/cancelar`,
      { motivo: "Rodrigo pediu para nao recolher hoje" },
      cookieTesouraria
    );
    expect(cancelar.statusCode, cancelar.body).toBe(200);
    // Some da lista de agendadas...
    expect(json<{ data: unknown[] }>(cancelar).data).toHaveLength(0);

    // ...mas NAO some do banco: continua no historico auditavel, com autoria, data e motivo, e
    // preservando K1, valor, observacao, o marcador e os campos de execucao vazios.
    const linha = await consultarUm<{
      status: string;
      cancelado_por: string | null;
      cancelado_em: string | null;
      motivo_cancelamento: string | null;
      idempotencia_chave: string | null;
      valor_original: string;
      observacao: string | null;
      solicitacao_cofre_em: string | null;
      executado_por: string | null;
      executado_em: string | null;
    }>(
      `select status, cancelado_por, cancelado_em, motivo_cancelamento, idempotencia_chave, valor_original,
              observacao, solicitacao_cofre_em, executado_por, executado_em
         from transferencias where id = $1`,
      [id]
    );
    expect(linha).toMatchObject({
      status: "cancelada",
      motivo_cancelamento: "Rodrigo pediu para nao recolher hoje",
      idempotencia_chave: chave,
      valor_original: "90.00",
      observacao: "Ordem a revogar",
      executado_por: null,
      executado_em: null
    });
    expect(linha?.cancelado_por).not.toBeNull();
    expect(linha?.cancelado_em).not.toBeNull();
    expect(linha?.solicitacao_cofre_em).not.toBeNull();

    // Cancelada nao movimenta saldo e nao aparece como movimento ativo na aba do caixa.
    expect(await saldoDoCaixa()).toBe(150);
    const aba = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/transferencias`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(aba);
    expect(json<{ data: { itens: { id: string }[] } }>(aba).data.itens.some((item) => item.id === id)).toBe(false);

    // E o fechamento passa a ser permitido.
    const fechar = await post(`/api/caixa/${caixaId}/fechar`, { observacao: "Fechamento apos cancelar" });
    expect(fechar.statusCode, fechar.body).toBe(204);
  });

  it("retry do cancelamento nao duplica auditoria, e executada nao pode ser cancelada", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-cancelar-limites", "2026-06-29T08:00", 200);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 30 });

    const corpo = { motivo: "primeiro motivo" };
    expect(
      (await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/cancelar`, corpo, cookieTesouraria)).statusCode
    ).toBe(200);
    const primeira = await consultarUm<{ cancelado_em: string; motivo_cancelamento: string }>(
      "select cancelado_em, motivo_cancelamento from transferencias where id = $1",
      [id]
    );

    // Retry: idempotente, e nao reescreve a auditoria com o motivo novo.
    const retry = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre/${id}/cancelar`,
      { motivo: "outro motivo" },
      cookieTesouraria
    );
    expect(retry.statusCode, retry.body).toBe(200);
    expect(
      await consultarUm<{ cancelado_em: string; motivo_cancelamento: string }>(
        "select cancelado_em, motivo_cancelamento from transferencias where id = $1",
        [id]
      )
    ).toEqual(primeira);

    // Ja executada nao pode ser cancelada.
    const outra = await programar(caixaId, { tipo: "sangria", valor: 20 });
    expect((await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${outra.id}/executar`, {})).statusCode).toBe(200);
    const tardio = await post(
      `/api/caixa/${caixaId}/solicitacoes-cofre/${outra.id}/cancelar`,
      { motivo: "tarde demais" },
      cookieTesouraria
    );
    assertProblem(tardio, 409);

    // E cancelada nao pode ser executada (nunca sucesso silencioso).
    const executarCancelada = await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/executar`, {});
    assertProblem(executarCancelada, 409);
  });

  it("cancelar exige motivo e e exclusivo da retaguarda", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d4-cancelar-guardas", "2026-06-30T08:00", 100);
    const { id } = await programar(caixaId, { tipo: "sangria", valor: 10 });

    assertProblem(
      await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/cancelar`, { motivo: "   " }, cookieTesouraria),
      400
    );
    assertProblem(
      await post(`/api/caixa/${caixaId}/solicitacoes-cofre/${id}/cancelar`, { motivo: "pelo operador" }, cookieCaixa),
      403
    );
    expect((await chaveGravada(id))?.status).toBe("agendada");
  });
});

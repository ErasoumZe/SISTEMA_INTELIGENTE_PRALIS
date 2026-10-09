import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import {
  abrirCaixaDoOperador,
  criarRetornoValido,
  encerrarCaixaSeedAdminParaTeste,
  prepararFechamentoValido
} from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// B2 · idempotencia da entrega ao cofre.
//
// Por que este arquivo existe: a trava da linha do caixa (B1) e o teto do saldo (D1) NAO resolvem
// repeticao. Com saldo 300, dois POSTs identicos de 100 passam os dois — o segundo ainda encontra
// 200 disponiveis. Isso e uma entrega de dinheiro duplicada com um envelope so, e quem paga a
// diferenca e o operador, na quebra do fechamento.
//
// A unica coisa que separa "intencao nova" de "retry" e uma chave carimbada pelo CLIENTE e
// protegida por UNIQUE parcial no banco. Estes testes provam os comportamentos que essa chave tem
// de garantir, e as guardas da decisao 7 (sem quem conferir, o dinheiro nao sai).
//
// R-179/Fatia 3 · este arquivo tambem cobria a ordem programada (D4): programar, executar,
// cancelar, o isolamento contra a transferencia generica e a auditoria separada de programador e
// executor. O painel "Programar entrega ao cofre" e as quatro rotas dele foram removidos, e os
// casos sairam junto — pinar rota que nao existe transforma o gate num teatro. A prova de que a
// porta esta fechada esta em `entrega-cofre-caminho-unico.test.ts`.
describe("caixa - idempotencia da entrega ao cofre (B2)", () => {
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
  const lacresPorIntencao = new Map<string, { id: string; numero: string }>();
  const responsavelPorCaixa = new Map<string, string>();

  type EntregaLegada = {
    valor: number;
    lacre?: string;
    observacao?: string;
    idempotenciaChave?: string;
    responsavelNome?: string;
  };

  async function lacreParaEntrega(caixaId: string, chave: string, cookie: string) {
    const chaveDoLacre = `${caixaId}:${chave}`;
    const existente = lacresPorIntencao.get(chaveDoLacre);
    if (existente) return existente;

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/${caixaId}/lacres-retorno`,
      headers: { cookie }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const lacre = json<{ data: Array<{ id: string; numero: string }> }>(resposta).data[0];
    if (!lacre) throw new Error(`Caixa ${caixaId} sem lacre de retorno disponivel`);
    lacresPorIntencao.set(chaveDoLacre, lacre);
    return lacre;
  }

  async function post(url: string, payload: object, cookie = cookieAdmin) {
    let corpo = payload;
    const retorno = url.match(/^\/api\/caixa\/([^/]+)\/transferencia-cofre$/);
    if (retorno) {
      const entrega = payload as EntregaLegada;
      const chaveDoLacre = entrega.lacre ?? entrega.idempotenciaChave ?? "retorno-unico";
      const lacre = await lacreParaEntrega(retorno[1]!, chaveDoLacre, cookie);
      corpo = {
        valor: entrega.valor,
        valorEspecie: entrega.valor,
        valorMoedas: 0,
        lacreId: lacre.id,
        // A API grava o responsavel declarado na abertura, e nunca aceita que o
        // cliente o troque numa sangria. O retry deve carregar essa mesma autoria.
        responsavelNome: responsavelPorCaixa.get(retorno[1]!) ?? entrega.responsavelNome ?? null,
        observacao: entrega.observacao ?? "Retorno de teste",
        idempotenciaChave: entrega.idempotenciaChave
      };
    }
    return contexto.app.inject({ method: "POST", url, headers: { cookie }, payload: corpo });
  }

  async function criar(url: string, payload: object) {
    const resposta = await post(url, payload);
    expect(resposta.statusCode, `${url} -> ${resposta.body}`).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  // Abre um caixa proprio (conta + PDV proprios) e injeta uma venda em dinheiro, que e o que
  // produz saldo fisico para entregar.
  async function abrirCaixaComSaldo(nome: string, dataHoraAbertura: string, valorVenda: number) {
    // A fixture usa o mesmo malote fisico da abertura real: Tesouraria envia,
    // operador confirma com lacre, maquininha e responsaveis. Nao existe abertura
    // direta/zerada apenas para o teste.
    const abertura = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieRemetente: cookieTesouraria,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome,
      dataHoraAbertura,
      valorAbertura: 100,
      // Alguns cenarios provam reuso de chave e outros duas entregas distintas.
      // Cada retorno usa uma bolsa real, recebida no mesmo malote de abertura.
      lacresRetorno: [`IDEMP-RETORNO-${nome}-1`, `IDEMP-RETORNO-${nome}-2`]
    });
    const { caixaId, contaId, pdvId } = abertura;
    responsavelPorCaixa.set(caixaId, nome);
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
    return { caixaId, contaId, pdvId, lacreFechamento: abertura.lacreFechamento };
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
    return consultarTodos<{ id: string; tipo: string; valor_original: string; status: string; n_lacre_doc: string | null }>(
      "select id, tipo, valor_original, status, n_lacre_doc from transferencias where caixa_id = $1 and tipo in ('retorno', 'sangria') order by criado_em",
      [caixaId]
    );
  }

  it("mesma chave + mesma intencao devolve o movimento vencedor sem duplicar", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-repeticao", "2026-06-01T08:00", 300);
    const chave = randomUUID();
    const entrega = {
      valor: 100,
      lacre: "IDEM-REP-1",
      observacao: "Primeira",
      idempotenciaChave: chave
    };

    const primeira = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(primeira.statusCode, primeira.body).toBe(200);
    expect(await saldoDoCaixa()).toBe(300);

    // O retry e byte a byte o mesmo POST. Tem de responder 200 e NAO tirar mais 100 do caixa.
    const retry = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(await saldoDoCaixa()).toBe(300);

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "100.00", status: "pendente" });
    expect(movimentos[0]?.n_lacre_doc).toBeTruthy();

    // A bolsa real selecionada pela abertura tambem aparece uma unica vez.
    expect(movimentos[0]?.n_lacre_doc).toBeTruthy();
  });

  // Este e o caso que so a ORDEM certa resolve. O retry carrega o mesmo lacre; se a unicidade do
  // lacre fosse checada antes da idempotencia, o retry morreria com "Lacre ja utilizado" — e o
  // operador, achando que falhou, lancaria de novo com outro lacre. Duas entregas, um envelope.
  it("retry com o mesmo lacre nao e confundido com lacre reutilizado", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-lacre", "2026-06-02T08:00", 150);
    const chave = randomUUID();
    const entrega = { valor: 50, lacre: "IDEM-LACRE-1", idempotenciaChave: chave };

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
    // Fundo de abertura (100) + venda (80): devolver 180 e repetir a mesma chave
    // deve continuar encontrando o ato vencedor, mesmo sem saldo restante.
    const entrega = { valor: 180, idempotenciaChave: randomUUID() };

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
      valor: 100,
      lacre: "IDEM-CONF-1",
      observacao: "Original",
      idempotenciaChave: chave
    };
    expect((await post(`/api/caixa/${caixaId}/transferencia-cofre`, original)).statusCode).toBe(200);

    // Cada campo da intencao, sozinho, tem de derrubar a reutilizacao da chave.
    const divergentes = [
      { ...original, valor: 120 },
      { ...original, observacao: "Outra coisa" }
    ];
    for (const payload of divergentes) {
      const resposta = await post(`/api/caixa/${caixaId}/transferencia-cofre`, payload);
      assertProblem(resposta, 409);
      expect(resposta.body).toMatch(/idempotencia/iu);
    }

    // A bolsa e fisica e ja foi vinculada ao primeiro retorno. Trocar o lacre
    // mantendo a mesma chave e recusado antes da comparacao de intencao.
    const outroLacre = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      ...original,
      lacre: "IDEM-CONF-2"
    });
    assertProblem(outroLacre, 400);

    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
    expect(await saldoDoCaixa()).toBe(400);
  });

  it("chaves diferentes criam movimentos legitimos, cada um com o seu lacre", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-multiplo", "2026-06-05T08:00", 250);

    for (const [valor, lacre] of [
      [60, "IDEM-MULTI-1"],
      [40, "IDEM-MULTI-2"]
    ] as const) {
      const resposta = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
        valor,
        lacre,
        idempotenciaChave: randomUUID()
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
    }

    const movimentos = await movimentosDoCaixa(caixaId);
    expect(movimentos).toHaveLength(2);
    // D5: o parcial anterior NAO foi editado — sao dois movimentos imutaveis, com lacres proprios.
    expect(movimentos.map((m) => m.valor_original)).toEqual(["60.00", "40.00"]);
    expect(movimentos.every((m) => Boolean(m.n_lacre_doc))).toBe(true);
    expect(await saldoDoCaixa()).toBe(250);
  });

  // Isolamento entre empresas: o UNIQUE e (empresa_id, chave). A mesma chave em outra empresa e um
  // ato novo e legitimo — nao pode colidir nem, muito menos, devolver o movimento da outra empresa.
  it("a mesma chave em empresas diferentes nao colide", async () => {
    const { caixaId } = await abrirCaixaComSaldo("idem-empresa", "2026-06-06T08:00", 90);
    const chave = randomUUID();

    const resposta = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
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
    const fx = await abrirCaixaComSaldo("b1-corrida", "2026-06-15T08:00", 90);
    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: fx.caixaId });

    const [a, b] = await Promise.all([
      post(`/api/caixa/${fx.caixaId}/fechar`, {
        observacao: "Corrida A",
        lacreFechamento: fx.lacreFechamento,
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        valorEspecieFechamento: 190,
        valorMoedasFechamento: 0
      }),
      post(`/api/caixa/${fx.caixaId}/fechar`, {
        observacao: "Corrida B",
        lacreFechamento: fx.lacreFechamento,
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        valorEspecieFechamento: 190,
        valorMoedasFechamento: 0
      })
    ]);

    const codigos = [a.statusCode, b.statusCode].sort((x, y) => x - y);
    expect(codigos, `A=${a.body} | B=${b.body}`).toEqual([204, 409]);

    // O ponto que mais importa: UM retorno final, nao dois. Rollback integral do perdedor.
    const movimentos = await movimentosDoCaixa(fx.caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "190.00", status: "pendente" });

    // E os sete totais ficaram congelados uma unica vez, coerentes com o caixa.
    const fechado = await consultarUm<{ status: string; saldo: string; total_entradas: string }>(
      "select status, saldo, total_entradas from fechamentos_caixa where id = $1",
      [fx.caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00", total_entradas: "90.00" });
  });

  // B2 · a mesma corrida, agora na ENTREGA avulsa. Aqui quem decide e o `ON CONFLICT DO NOTHING`:
  // o perdedor nao insere, nao levanta 23505, nao derruba a transacao — le a linha vencedora e
  // responde 200. Com INSERT cru os dois teriam sucesso (a trava sozinha nao distingue retry).
  it("duas entregas SIMULTANEAS com a mesma chave criam um movimento so", async () => {
    const { caixaId } = await abrirCaixaComSaldo("b2-corrida", "2026-06-16T08:00", 300);
    const entrega = { valor: 100, idempotenciaChave: randomUUID() };

    const respostas = await Promise.all([
      post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega),
      post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega)
    ]);

    for (const resposta of respostas) expect(resposta.statusCode, resposta.body).toBe(200);
    expect(await movimentosDoCaixa(caixaId)).toHaveLength(1);
    // 300 - 100 (uma vez so). Se a corrida tivesse furado, seria 100.
    expect(await saldoDoCaixa()).toBe(300);
  });

  // B2 x D6: o retorno final do fechamento NAO usa chave, e nao precisa. A trava da linha e a
  // guarda `status = 'aberto'` do UPDATE ja tornam o ato irrepetivel: o segundo fechamento nao
  // encontra caixa aberto e para antes de criar qualquer coisa.
  it("fechamento repetido nao cria um segundo retorno final", async () => {
    const fx = await abrirCaixaComSaldo("idem-fechamento", "2026-06-07T08:00", 70);
    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: fx.caixaId });

    const primeiro = await post(`/api/caixa/${fx.caixaId}/fechar`, {
      observacao: "Fechamento",
      lacreFechamento: fx.lacreFechamento,
      caixaResponsavelNome: "Administrador de teste",
      supervisorResponsavelNome: "Supervisor de teste",
      valorEspecieFechamento: 170,
      valorMoedasFechamento: 0
    });
    expect(primeiro.statusCode, primeiro.body).toBe(204);

    const segundo = await post(`/api/caixa/${fx.caixaId}/fechar`, {
      observacao: "Fechamento",
      lacreFechamento: fx.lacreFechamento,
      caixaResponsavelNome: "Administrador de teste",
      supervisorResponsavelNome: "Supervisor de teste",
      valorEspecieFechamento: 170,
      valorMoedasFechamento: 0
    });
    assertProblem(segundo, 409, "FECHAMENTO_NAO_INICIADO");

    const movimentos = await movimentosDoCaixa(fx.caixaId);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({ valor_original: "170.00", status: "pendente" });

    // Os sete totais ficam congelados no fechamento, e o segundo POST nao os reescreveu.
    const fechado = await consultarUm<{ status: string; saldo: string; total_entradas: string }>(
      "select status, saldo, total_entradas from fechamentos_caixa where id = $1",
      [fx.caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00", total_entradas: "70.00" });
  });

  function chaveGravada(id: string) {
    return consultarUm<{ idempotencia_chave: string | null; status: string; valor_original: string }>(
      "select idempotencia_chave, status, valor_original from transferencias where id = $1",
      [id]
    );
  }

  // R-028/R-036: a entrega nasce 'pendente' e so entra no cofre quando quem OPERA a conta de
  // destino conferir. Isso depende de `contas_usuarios` — sem vinculo nao existe quem confirme, e
  // o dinheiro fica pendente para sempre. Este teste prova o caminho inteiro.
  it("a entrega pendente e confirmada por quem opera a conta do cofre (contas_usuarios)", async () => {
    const { caixaId } = await abrirCaixaComSaldo("cofre-confirmacao", "2026-06-14T08:00", 120);

    const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
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
      {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: movimento.n_lacre_doc,
        valorRecebido: 120,
        valorEspecieContado: 120,
        valorMoedasContado: 0
      },
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
    if (!movimento.n_lacre_doc) throw new Error("Retorno de teste sem lacre reservado");
    const lacre = await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [
      movimento.n_lacre_doc
    ]);
    expect(lacre?.rompido).toBe(true);

    // E o saldo do caixa NAO muda com a confirmacao: ele ja tinha sido abatido quando a entrega
    // virou 'pendente' (R-036). Confirmar move o dinheiro para o cofre, nao de volta.
    expect(await saldoDoCaixa()).toBe(100);
  });

  // B2 · o `status` NAO faz parte da intencao, e este e o caso que prova.
  //
  // `conferirIntencaoEntrega` compara caixa, tipo, valor, lacre e observacao — nunca o status, que
  // muda por atos POSTERIORES (conferencia, divergencia) e nao descreve o que foi pedido. E
  // `buscarTransferenciaPorIdempotenciaRepository` nao filtra status: acha a linha em qualquer um.
  //
  // O cenario real: o operador lanca a entrega, o POST estoura no cliente, o cofre confere (a linha
  // vira `recebido`) e o navegador reenvia com a MESMA chave. Tem de responder 200 sem duplicar. Se
  // alguem "endurecer" a comparacao incluindo status, este retry passaria a levar 409 — e o
  // operador, achando que falhou, lancaria de novo com outro lacre. Duas entregas, um envelope: o
  // modo de falha que este arquivo inteiro existe para impedir.
  it("retry da MESMA chave depois de o cofre confirmar continua 200, e nao duplica", async () => {
    const { caixaId } = await abrirCaixaComSaldo("b2-retry-pos-conferencia", "2026-07-15T08:00", 80);
    const entrega = {
      valor: 80,
      lacre: "B2-POS-CONF-1",
      idempotenciaChave: randomUUID()
    };

    const primeira = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(primeira.statusCode, primeira.body).toBe(200);
    const movimento = (await movimentosDoCaixa(caixaId))[0]!;

    // O cofre age: a linha sai de `pendente`.
    const confirmar = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: movimento.n_lacre_doc,
        valorRecebido: 80,
        valorEspecieContado: 80,
        valorMoedasContado: 0
      },
      cookieTesouraria
    );
    expect(confirmar.statusCode, confirmar.body).toBe(200);
    expect((await chaveGravada(movimento.id))?.status).toBe("recebido");

    // O retry chega depois. Mesma chave, mesma intencao: 200, e nada de novo no caixa.
    const retry = await post(`/api/caixa/${caixaId}/transferencia-cofre`, entrega);
    expect(retry.statusCode, retry.body).toBe(200);
    const depois = await movimentosDoCaixa(caixaId);
    expect(depois).toHaveLength(1);
    expect(depois[0]?.id).toBe(movimento.id);
    expect((await chaveGravada(movimento.id))?.status).toBe("recebido");
  });

  // Teste obrigatorio 12 — decisao 7. O bloqueio e por ATO, nao global: fechamento SEM retorno
  // fisico nao entrega nada e por isso nao pode ser barrado por falta de quem conferir.
  it("sem responsavel no Cofre bloqueia so os atos que entregariam dinheiro", async () => {
    const fx = await abrirCaixaComSaldo("d7-sem-responsavel", "2026-06-21T08:00", 100);
    // Remove o vinculo do seed para simular a empresa mal configurada.
    await executarSql("delete from contas_usuarios where conta_id = $1", [idsTeste.contaCofre]);
    try {
      const avulsa = await post(`/api/caixa/${fx.caixaId}/transferencia-cofre`, {
        valor: 10,
        idempotenciaChave: randomUUID()
      });
      assertProblem(avulsa, 400);
      expect(avulsa.body).toMatch(/responsavel/iu);

      // Fechamento COM sobra entrega dinheiro -> bloqueado.
      await prepararFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: fx.caixaId });
      const comSobra = await post(`/api/caixa/${fx.caixaId}/fechar`, {
        observacao: "Com sobra",
        lacreFechamento: fx.lacreFechamento,
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        valorEspecieFechamento: 200,
        valorMoedasFechamento: 0
      });
      assertProblem(comSobra, 400);
      expect(comSobra.body).toMatch(/responsavel/iu);
      expect(await movimentosDoCaixa(fx.caixaId)).toHaveLength(0);
    } finally {
      await restaurarResponsaveisDoCofre();
    }
  });

  // Decisao 7 · o caso que so a elegibilidade REAL pega: existe vinculo, mas o unico vinculado e
  // quem esta criando o movimento — e ele nao pode confirmar o proprio envio (R-028). Checar so a
  // existencia do vinculo liberaria a entrega e a confirmacao depois seria impossivel.
  //
  // R-179/Fatia 3 · o ator era a Tesouraria programando pelo painel. Com um caminho unico quem
  // entrega e quem tem a gaveta, entao o ator aqui e o ADMIN, que abriu o caixa: deixa-se so ele
  // vinculado ao cofre e a propria entrega dele fica sem conferente possivel.
  it("unico responsavel do Cofre sendo o proprio criador bloqueia a entrega", async () => {
    const { caixaId } = await abrirCaixaComSaldo("d7-criador-unico", "2026-07-09T08:00", 100);
    await executarSql("delete from contas_usuarios where conta_id = $1", [idsTeste.contaCofre]);
    await executarSql(
      `insert into contas_usuarios (empresa_id, conta_id, usuario_id)
       select $1, $2, id from "user" where lower(email) = lower($3)
       on conflict do nothing`,
      [empresaId, idsTeste.contaCofre, usuariosTeste.admin.email]
    );
    try {
      const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
        valor: 20,
        idempotenciaChave: randomUUID()
      });
      assertProblem(entrega, 400);
      expect(entrega.body).toMatch(/elegivel/iu);
      expect(await movimentosDoCaixa(caixaId)).toHaveLength(0);

      // E o vinculo continua la — o bloqueio nao e "falta vinculo", e "falta quem POSSA conferir".
      const vinculos = await consultarTodos<{ usuario_id: string }>(
        "select usuario_id from contas_usuarios where conta_id = $1",
        [idsTeste.contaCofre]
      );
      expect(vinculos).toHaveLength(1);
    } finally {
      await executarSql(
        `delete from contas_usuarios
          where conta_id = $1
            and usuario_id = (select id from "user" where lower(email) = lower($2))`,
        [idsTeste.contaCofre, usuariosTeste.admin.email]
      );
      await restaurarResponsaveisDoCofre();
    }
  });

  it("sem responsavel no Cofre o fechamento SEM sobra continua permitido", async () => {
    // Todo caixa nasce de malote. A bolsa retornavel devolve o fundo antes do
    // fechamento; assim nao sobra dinheiro fisico nem se reabre a abertura zerada.
    const fx = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieRemetente: cookieTesouraria,
      cookieOperador: cookieAdmin,
      emailOperador: usuariosTeste.admin.email,
      nome: "d7-sem-sobra",
      valorAbertura: 100
    });
    await criarRetornoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: fx.caixaId, valor: 100 });
    await prepararFechamentoValido(contexto.app, { cookieOperador: cookieAdmin, caixaId: fx.caixaId });

    await executarSql("delete from contas_usuarios where conta_id = $1", [idsTeste.contaCofre]);
    try {
      const fechar = await post(`/api/caixa/${fx.caixaId}/fechar`, {
        observacao: "Sem sobra",
        lacreFechamento: fx.lacreFechamento,
        caixaResponsavelNome: "Administrador de teste",
        supervisorResponsavelNome: "Supervisor de teste",
        valorEspecieFechamento: 0,
        valorMoedasFechamento: 0
      });
      expect(fechar.statusCode, fechar.body).toBe(204);
      expect(await movimentosDoCaixa(fx.caixaId)).toHaveLength(1);
    } finally {
      await restaurarResponsaveisDoCofre();
    }
  });

  // Teste obrigatorio 14 — decisao 9/R-026. Antes disto um movimento sem lacre era INCONFIRMAVEL:
  // o payload exigia numero e o repositorio tentava romper um selo que nao existia.
  it("movimento sem lacre pode ser confirmado sem inventar um", async () => {
    const { caixaId } = await abrirCaixaComSaldo("conf-sem-lacre", "2026-06-23T08:00", 60);
    const entrega = await post(`/api/caixa/${caixaId}/transferencia-cofre`, {
      valor: 60,
      idempotenciaChave: randomUUID()
    });
    expect(entrega.statusCode, entrega.body).toBe(200);
    const movimento = (await movimentosDoCaixa(caixaId))[0]!;
    expect(movimento.n_lacre_doc).toBeTruthy();

    const confirmar = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: movimento.n_lacre_doc,
        valorRecebido: 60,
        valorEspecieContado: 60,
        valorMoedasContado: 0
      },
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
      {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: "CONF-DIV-OUTRO",
        valorRecebido: 70,
        valorEspecieContado: 70,
        valorMoedasContado: 0
      },
      cookieTesouraria
    );
    assertProblem(divergente, 409, "CONFERENCIA_DIVERGENTE");

    // Rollback integral: continua pendente, sem confirmante, e o lacre segue intacto.
    const depois = await consultarUm<{ status: string; confirmado_por: string | null }>(
      "select status, confirmado_por from transferencias where id = $1",
      [movimento.id]
    );
    expect(depois).toMatchObject({ status: "pendente", confirmado_por: null });
    if (!movimento.n_lacre_doc) throw new Error("Retorno de teste sem lacre reservado");
    const lacre = await consultarUm<{ rompido: boolean }>("select rompido from lacres where numero = $1", [
      movimento.n_lacre_doc
    ]);
    expect(lacre?.rompido).toBe(false);

    // Depois da resolucao, a conferencia com o lacre certo passa normalmente.
    const correta = await post(
      `/api/transferencias/${movimento.id}/confirmar`,
      {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: movimento.n_lacre_doc,
        valorRecebido: 70,
        valorEspecieContado: 70,
        valorMoedasContado: 0
      },
      cookieTesouraria
    );
    expect(correta.statusCode, correta.body).toBe(200);
  });
});

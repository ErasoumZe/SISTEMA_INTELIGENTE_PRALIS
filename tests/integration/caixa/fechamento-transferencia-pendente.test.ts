import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import {
  abrirCaixaDoOperador,
  criarRetornoValido,
  prepararPayloadFechamentoValido,
  universoDoCaixa
} from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import {
  abrirBloqueador,
  consultarTodos,
  consultarUm,
  esperarBloqueioPor,
  executarSql,
  fecharBloqueador,
  json
} from "../../setup/integracao.js";

// G1 da #101 (R-171) — dinheiro que JA SAIU nao deixa o caixa fechar pelo caminho comum.
//
// O que existia antes: o fechamento so barrava solicitacao `agendada` (D12 — dinheiro que AINDA NAO
// saiu). Um retorno entregue de verdade e ainda nao conferido no destino nao impedia nada: o caixa
// fechava, o operador ia embora e, se o cofre encontrasse falta depois, a divergencia nao tinha mais
// dono — o turno estava encerrado.
//
// R-185/R-187 · o painel antigo continua removido. O planejamento atual nasce na transferencia
// inicial e tambem trava; este arquivo concentra a outra metade: retorno ja executado em transito.
//
// O ESCOPO e o predicado canonico de retorno do Caixa (`ehRetornoDoCaixa`): caixa vinculado e tipo
// retorno (ou sangria historica), independentemente do destino. Transferencia generica NAO
// entra, e isso e verificado aqui de proposito — bloquear alem do malote fisico travaria operacao
// que a R-171 nunca mencionou.
//
// O retorno final do proprio fechamento tambem nasce `pendente` (D6/D7) e NAO se auto-bloqueia: a
// guarda le o estado ANTERIOR ao ato. O caso 2 prova isso junto com a liberacao.
describe("caixa - fechamento x transferencia pendente (G1/R-171)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  let cookieCaixa = "";
  let cookieGerente = "";
  let cookieMultiempresa = "";
  let sequencia = 0;
  const lacresDasEntregas = new Map<string, string>();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieGerente, cookieMultiempresa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente"),
      cookieSessao(contexto.app, "multiempresa")
    ]);
  }, 180_000);

  afterAll(async () => contexto.fechar());

  const empresaId = idsTeste.empresaA;
  // Posterior a abertura padrao da fixture (2026-07-31T08:00).
  const DIA = "2026-08-01";

  function inject(method: "GET" | "POST", url: string, cookie: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  // Caixa proprio por caso: `fechamentos_caixa_pdv_aberto_unico_idx` proibe dois abertos no mesmo
  // PDV, e fechar um caixa compartilhado quebraria os outros arquivos.
  async function novoCaixa(nome: string, operador: "caixa" | "multiempresa" = "caixa") {
    sequencia += 1;
    const cookieOperador = operador === "caixa" ? cookieCaixa : cookieMultiempresa;
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador,
      emailOperador: usuariosTeste[operador].email,
      nome: `${nome} ${sequencia}`
    });
  }

  // Dinheiro de verdade no caixa: sem venda nao ha o que entregar ao cofre. Lancada PELO operador e
  // sem conta/PDV no payload — o servidor resolve pelo caixa aberto dele, que e o caminho real.
  async function venda(valor: number, cookieOperador = cookieCaixa) {
    const resposta = await inject("POST", "/api/vendas", cookieOperador, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Venda do turno",
      valorOriginal: valor,
      tiposPagamento: [{ formaPagamentoId: idsTeste.formaPagamentoDinheiro, numeroVendas: 1, totalPago: valor }]
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  }

  async function entregarAoCofre(caixaId: string, valor: number, _lacre?: string, cookieOperador = cookieCaixa) {
    const retorno = await criarRetornoValido(contexto.app, { cookieOperador, caixaId, valor });
    const movimento = await consultarUm<{ id: string }>(
      "select id from transferencias where caixa_id = $1 and tipo = 'retorno' order by criado_em desc limit 1",
      [caixaId]
    );
    if (!movimento) throw new Error("Entrega ao cofre nao encontrada");
    lacresDasEntregas.set(movimento.id, retorno.lacre.numero);
    return movimento.id;
  }

  // R-028: quem entrega nunca confere a propria entrega. O operador entrega, o gerente (responsavel
  // pelo cofre no seed) confere.
  function conferir(transferenciaId: string, valorRecebido: number, lacre?: string) {
    return inject("POST", `/api/transferencias/${transferenciaId}/confirmar`, cookieGerente, {
      contaDestinoId: idsTeste.contaCofre,
      valorRecebido,
      valorEspecieContado: valorRecebido,
      valorMoedasContado: 0,
      nLacreDoc: lacre ?? lacresDasEntregas.get(transferenciaId)
    });
  }

  const payloadsFechamento = new Map<string, Awaited<ReturnType<typeof prepararPayloadFechamentoValido>>>();

  async function fechar(caixaId: string, observacao = "Fechamento do turno") {
    let payload = payloadsFechamento.get(caixaId);
    if (!payload) {
      payload = await prepararPayloadFechamentoValido(contexto.app, {
        cookieOperador: cookieCaixa,
        caixaId,
        observacao
      });
      payloadsFechamento.set(caixaId, payload);
    }
    return inject("POST", `/api/caixa/${caixaId}/fechar`, cookieCaixa, { ...payload, observacao });
  }

  async function statusDoCaixa(caixaId: string) {
    const linha = await consultarUm<{ status: string }>("select status from fechamentos_caixa where id = $1", [
      caixaId
    ]);
    return linha?.status ?? null;
  }

  function transferenciasDoCaixa(caixaId: string) {
    return consultarTodos<{ tipo: string; status: string }>(
      "select tipo, status from transferencias where caixa_id = $1 order by criado_em",
      [caixaId]
    );
  }

  // ------------------------------------------------------------------------------------------
  // RED-1 · o caso que a #101 abriu: dinheiro entregue e nao conferido nao pode ser esquecido.
  // ------------------------------------------------------------------------------------------
  it("Deve_PreservarOPendente_Quando_HaRetornoEntregueAguardandoConferencia", async () => {
    const fx = await novoCaixa("G1 retorno");
    await venda(500);
    await entregarAoCofre(fx.caixaId, 200, "G1-RETORNO");

    const resposta = await fechar(fx.caixaId);

    expect(resposta.statusCode, resposta.body).toBe(204);
    expect((await transferenciasDoCaixa(fx.caixaId)).filter((linha) => linha.tipo === "retorno")).toContainEqual({
      tipo: "retorno",
      status: "pendente"
    });
  });

  // ------------------------------------------------------------------------------------------
  // RED-2 · conferida no cofre, a trava sai. E o retorno final do fechamento, que tambem nasce
  // `pendente`, nao bloqueia a si mesmo.
  // ------------------------------------------------------------------------------------------
  it("Deve_LiberarOFechamento_Quando_OCofreConfereAEntrega", async () => {
    const fx = await novoCaixa("G1 conferida");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, "G1-CONFERIDA");

    const fechamento = await fechar(fx.caixaId);
    expect(fechamento.statusCode, fechamento.body).toBe(204);

    const conferencia = await conferir(entrega, 200);
    expect(conferencia.statusCode, conferencia.body).toBe(200);

    // D6/D7: a sobra virou retorno final DENTRO do fechamento, e ele fica `pendente` — prova de que
    // a guarda le o estado anterior ao ato e nao se auto-bloqueia.
    expect((await transferenciasDoCaixa(fx.caixaId)).filter((linha) => linha.tipo === "retorno")).toEqual([
      { tipo: "retorno", status: "recebido" },
      { tipo: "retorno", status: "pendente" }
    ]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-3 · a recusa de conferencia (decisao 8) registra divergencia e MANTEM `pendente`. O
  // dinheiro continua em transito, entao o fechamento continua travado — a saida e a Fatia 2.
  // ------------------------------------------------------------------------------------------
  it("Deve_ManterAEntregaPendente_Quando_AConferenciaEhRecusada", async () => {
    const fx = await novoCaixa("G1 recusada");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, "G1-RECUSADA");

    const recusa = await inject("POST", `/api/transferencias/${entrega}/recusar-conferencia`, cookieGerente, {
      contaDestinoId: idsTeste.contaCofre,
      motivo: "Faltaram R$ 20,00 no malote",
      valorRecebido: 180,
      valorEspecieContado: 180,
      valorMoedasContado: 0
    });
    expect(recusa.statusCode, recusa.body).toBe(200);
    expect(
      (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [entrega]))?.status
    ).toBe("pendente");

    expect((await fechar(fx.caixaId)).statusCode).toBe(204);
    expect(
      (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [entrega]))?.status
    ).toBe("pendente");
  });

  // ------------------------------------------------------------------------------------------
  // RED-4 · a trava e do caixa, nao da empresa. Pendencia do vizinho nao prende este turno.
  // ------------------------------------------------------------------------------------------
  it("Deve_IgnorarPendencia_Quando_ElaEhDeOutroCaixa", async () => {
    const vizinho = await novoCaixa("G1 vizinho", "multiempresa");
    await venda(500, cookieMultiempresa);
    await entregarAoCofre(vizinho.caixaId, 200, "G1-VIZINHO", cookieMultiempresa);

    // Outro operador abre o caixa proprio. A pendencia do vizinho continua sem prender este turno,
    // e a R-186 permanece respeitada: cada pessoa responde por uma unica gaveta.
    const proprio = await novoCaixa("G1 proprio");
    await venda(300);

    const fechamento = await fechar(proprio.caixaId);
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });

  // ------------------------------------------------------------------------------------------
  // RED-5 · escopo: so o retorno fisico do Caixa trava. Transferencia generica pendente,
  // mesmo saindo da conta do PDV, segue o caminho dela.
  // ------------------------------------------------------------------------------------------
  it("Deve_IgnorarPendencia_Quando_ATransferenciaNaoEhEntregaAoCofre", async () => {
    const fx = await novoCaixa("G1 generica");
    await venda(500);

    const destino = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId,
      nome: `Conta destino generica ${sequencia}`
    });
    expect(destino.statusCode, destino.body).toBe(201);
    const destinoId = json<{ data: { id: string } }>(destino).data.id;

    // Lancada PELO operador: so assim a transferencia nasce vinculada ao caixa dele. Criada pela
    // retaguarda ela sai com `caixa_id` nulo, e o caso passaria sem provar nada — a consulta a
    // descartaria pelo caixa, nao pelo escopo que este teste quer fixar.
    const generica = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Transferencia generica do turno",
      valorOriginal: 50,
      contaOrigemId: fx.contaId,
      contaDestinoId: destinoId,
      nLacreDoc: `G1-GENERICA-${sequencia}`,
      tempoConfirmacao: "1dia"
    });
    expect(generica.statusCode, generica.body).toBe(201);
    const criada = await consultarUm<{ status: string; caixa_id: string | null }>(
      "select status, caixa_id from transferencias where id = $1",
      [json<{ data: { id: string } }>(generica).data.id]
    );
    // O caso so vale se ela for pendente E deste caixa — senao provaria o nada.
    expect(criada).toMatchObject({ status: "pendente", caixa_id: fx.caixaId });

    const fechamento = await fechar(fx.caixaId);
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });

  // ------------------------------------------------------------------------------------------
  // RED-5b/R-187 · retorno para destino alternativo tambem deixa dinheiro em transito e trava.
  //
  // Hoje a API nao consegue produzir essa linha — `tipo` nao esta no payload da transferencia
  // generica (nasce `suprimento`). O UPDATE direto simula uma linha historica `sangria`, que deve
  // obedecer a mesma trava do `retorno` novo independentemente da conta escolhida como destino.
  // ------------------------------------------------------------------------------------------
  it("Deve_PreservarRetornoHistoricoPendente_Quando_TemDestinoForaDoCofre", async () => {
    const fx = await novoCaixa("G1 destino fora");
    await venda(500);

    const destino = await inject("POST", "/api/contas", cookieAdmin, {
      empresaId,
      nome: `Conta destino fora do cofre ${sequencia}`
    });
    expect(destino.statusCode, destino.body).toBe(201);
    const destinoId = json<{ data: { id: string } }>(destino).data.id;

    // Pelo operador, para nascer vinculada ao caixa: com `caixa_id` nulo a consulta a descartaria
    // pelo caixa e o criterio do destino continuaria sem ser exercitado.
    const generica = await inject("POST", "/api/transferencias", cookieCaixa, {
      empresaId,
      dataReferencia: DIA,
      descricao: "Transferencia para conta comum",
      valorOriginal: 50,
      contaOrigemId: fx.contaId,
      contaDestinoId: destinoId,
      nLacreDoc: `G1-FORA-${sequencia}`,
      tempoConfirmacao: "1dia"
    });
    expect(generica.statusCode, generica.body).toBe(201);
    const genericaId = json<{ data: { id: string } }>(generica).data.id;

    await executarSql("update transferencias set tipo = 'sangria' where id = $1", [genericaId]);
    const linha = await consultarUm<{ tipo: string; status: string; caixa_id: string | null }>(
      "select tipo, status, caixa_id from transferencias where id = $1",
      [genericaId]
    );
    // Os tres juntos provam que e um retorno historico pendente do caixa para destino alternativo.
    expect(linha).toMatchObject({ tipo: "sangria", status: "pendente", caixa_id: fx.caixaId });

    const fechamento = await fechar(fx.caixaId);
    expect(fechamento.statusCode, fechamento.body).toBe(204);
    expect(
      (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [genericaId]))?.status
    ).toBe("pendente");
  });

  // ------------------------------------------------------------------------------------------
  // RED-6 · a recusa nao pode deixar meio fechamento no banco: nenhum retorno final, nenhuma
  // quebra, nenhum total mexido, caixa ainda aberto.
  // ------------------------------------------------------------------------------------------
  it("Deve_ManterAEntregaPendenteAposOFechamento", async () => {
    const fx = await novoCaixa("G1 atomico");
    await venda(500);
    await entregarAoCofre(fx.caixaId, 200, "G1-ATOMICO");

    expect((await fechar(fx.caixaId)).statusCode).toBe(204);
    expect(await statusDoCaixa(fx.caixaId)).toBe("fechado");
    expect((await transferenciasDoCaixa(fx.caixaId)).filter((linha) => linha.tipo === "retorno")).toEqual([
      { tipo: "retorno", status: "pendente" },
      { tipo: "retorno", status: "pendente" }
    ]);
  });

  // ------------------------------------------------------------------------------------------
  // RED-7 · corrida. O fechamento (FOR UPDATE) e a conferencia (FOR SHARE) ja disputam a MESMA
  // linha do caixa, entao a guarda nova nao pode decidir sobre um retrato velho: ou fecha depois de
  // conferir, ou recusa — nunca fecha por cima de uma pendencia viva.
  // ------------------------------------------------------------------------------------------
  it("Deve_SerializarComAConferencia_Quando_ElaEstaEmVoo", async () => {
    const fx = await novoCaixa("G1 corrida");
    await venda(500);
    const entrega = await entregarAoCofre(fx.caixaId, 200, "G1-CORRIDA");
    const payloadFechamento = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: fx.caixaId
    });
    payloadsFechamento.set(fx.caixaId, payloadFechamento);

    const bloqueador = await abrirBloqueador();
    try {
      await bloqueador.cliente.query("begin");
      // Segura a linha do caixa: o fechamento vai parar aqui, antes de ler as pendencias.
      await bloqueador.cliente.query("select id from fechamentos_caixa where id = $1 for update", [fx.caixaId]);

      const fechamento = fechar(fx.caixaId);
      expect(await esperarBloqueioPor(bloqueador)).toBe(true);

      // Enquanto o fechamento espera, a conferencia entra pelo fio real — e tambem espera, por
      // causa do FOR SHARE na mesma linha. Soltar o bloqueador resolve as duas na ordem do banco.
      const conferencia = conferir(entrega, 200);
      await bloqueador.cliente.query("commit");

      const [resposta, conferida] = await Promise.all([fechamento, conferencia]);
      expect(conferida.statusCode, conferida.body).toBe(200);
      // A ordem vencedora e do banco; o que nao pode e fechar com a entrega ainda pendente.
      if (resposta.statusCode === 204) {
        expect(
          (await consultarUm<{ status: string }>("select status from transferencias where id = $1", [entrega]))?.status
        ).toBe("recebido");
      } else {
        assertProblem(resposta, 400);
        expect(await statusDoCaixa(fx.caixaId)).toBe("aberto");
      }
    } finally {
      await fecharBloqueador(bloqueador);
    }
  });
});

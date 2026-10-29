import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, prepararPayloadFechamentoValido, registrarContagemFisica } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { confirmarTransferenciaPorLacreDireto, consultarUm, json } from "../../setup/integracao.js";

describe("Etapa 2 - transferencia, retorno, quebra, notificacao e maquininha", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let cookieGerente: string;
  let cookieTesouraria: string;
  let usuarioCaixaId: string;
  let usuarioGerenteId: string;
  let sequenciaLacre = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieGerente, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "gerente"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario Caixa nao encontrado");
    usuarioCaixaId = usuario.id;
    const gerente = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.gerente.email
    ]);
    if (!gerente) throw new Error("Usuario Gerente nao encontrado");
    usuarioGerenteId = gerente.id;
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function request(cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
    const corpo = url.endsWith("/fechar") ? { lacreFechamento: `FCH-ETAPA2-${url}`, ...payload } : payload;
    return contexto.app.inject({ method, url, headers: { cookie }, ...(corpo ? { payload: corpo } : {}) });
  }

  async function criarContaEPdv(sufixo: string) {
    // R-165: conta de PDV precisa de fundo para pagar saida. Nao muda o que este arquivo prova —
    // a quebra e apurada sobre o saldo do CAIXA (entradas - saidas), nao sobre o fundo da conta.
    const conta = await request(cookieAdmin, "POST", "/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: `Conta etapa2 ${sufixo}`,
      saldoInicial: 100_000
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await request(cookieAdmin, "POST", "/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: `PDV etapa2 ${sufixo}`,
      contaId,
      ativo: true
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    return { contaId, pdvId: json<{ data: { id: string } }>(pdv).data.id };
  }

  async function abrirCaixa(pdvId: string, maquininhaId?: string) {
    const pdv = await consultarUm<{ conta_id: string }>("select conta_id from pdvs where id = $1", [pdvId]);
    if (!pdv?.conta_id) throw new Error("PDV de etapa2 sem conta");
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa etapa2",
      dataHoraAbertura: "2026-07-30T08:00",
      contaId: pdv.conta_id,
      pdvId,
      ...(maquininhaId ? { maquininhaId } : {})
    });
  }

  async function transferir(cookie: string, contaOrigemId: string, contaDestinoId: string, valor: number) {
    return request(cookie, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-30",
      descricao: "Transferencia etapa 2",
      valorOriginal: valor,
      contaOrigemId,
      contaDestinoId,
      nLacreDoc: `E2-${++sequenciaLacre}`
    });
  }

  // R-232 · `contagem` (opcional) e o dinheiro contado registrado em Vendas; sem ela, a fixture conta o esperado.
  async function fecharCaixa(
    caixaId: string,
    payload: Record<string, unknown> & { contagem?: number } = {},
    cookie = cookieCaixa
  ) {
    const { contagem, ...resto } = payload;
    const fechamentoFisico = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId,
      caixaResponsavelNome: "Caixa etapa2"
    });
    if (contagem !== undefined) {
      await registrarContagemFisica(contexto.app, { cookieOperador: cookieCaixa, caixaId, valorEspecie: contagem });
    }
    return request(cookie, "POST", `/api/caixa/${caixaId}/fechar`, { ...fechamentoFisico, ...resto });
  }

  it("libera Tesouraria sem caixa e mantem o cargo Caixa bloqueado sem caixa", async () => {
    const tesouraria = await transferir(cookieTesouraria, idsTeste.contaBanco, idsTeste.contaLivre, 7);
    expect(tesouraria.statusCode, tesouraria.body).toBe(201);

    const caixa = await transferir(cookieCaixa, idsTeste.contaBanco, idsTeste.contaLivre, 7);
    assertProblem(caixa, 400);
    expect(caixa.body).toMatch(/abra um caixa/i);
  });

  it("cadastra maquininha e vincula a maquina selecionada na abertura", async () => {
    const cadastro = await request(cookieAdmin, "POST", "/api/maquininhas", {
      empresaId: idsTeste.empresaA,
      numeroSerie: "SERIE-E2-001",
      apelido: "Stone balcão",
      ativo: true
    });
    expect(cadastro.statusCode, cadastro.body).toBe(201);
    const maquininhaId = json<{ data: { id: string } }>(cadastro).data.id;

    const comMaquininha = await criarContaEPdv("com-maquininha");
    const caixaComMaquininha = await abrirCaixa(comMaquininha.pdvId, maquininhaId);
    const vinculo = await consultarUm<{ maquininha_id: string }>(
      "select maquininha_id from fechamentos_caixa where id = $1",
      [caixaComMaquininha.caixaId]
    );
    expect(vinculo?.maquininha_id).toBe(maquininhaId);
    expect((await fecharCaixa(caixaComMaquininha.caixaId)).statusCode).toBe(204);
  });

  it("D6: o fechamento devolve a sobra ao cofre no mesmo ato, sem segundo botao", async () => {
    const { contaId, pdvId } = await criarContaEPdv("retorno");
    const { caixaId } = await abrirCaixa(pdvId);
    expect((await transferir(cookieCaixa, idsTeste.contaBanco, contaId, 20)).statusCode).toBe(201);
    await confirmarTransferenciaPorLacreDireto(`E2-${sequenciaLacre}`, usuarioCaixaId);

    // Uma unica chamada devolve todo o físico contado: o fundo de abertura (100) e a entrada (20).
    const fechar = await fecharCaixa(caixaId, {
      lacreRetorno: `E2-FINAL-${sequenciaLacre}`
    });
    expect(fechar.statusCode, fechar.body).toBe(204);

    const retorno = await consultarUm<{ valor_original: string; status: string }>(
      "select valor_original, status from transferencias where caixa_id = $1 and tipo = 'retorno'",
      [caixaId]
    );
    // D3: nasce pendente de conferencia, mas ja abateu o saldo fisico — por isso o caixa fechou.
    expect(retorno).toMatchObject({ valor_original: "120.00", status: "pendente" });
    const fechado = await consultarUm<{ status: string; saldo: string }>(
      "select status, saldo from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(fechado).toMatchObject({ status: "fechado", saldo: "0.00" });
  });

  it("quebra com observacao grava fato e notifica Tesouraria", async () => {
    const { contaId, pdvId } = await criarContaEPdv("quebra");
    const { caixaId } = await abrirCaixa(pdvId);
    expect((await transferir(cookieCaixa, contaId, idsTeste.contaBanco, 12.34)).statusCode).toBe(201);

    const fechado = await fecharCaixa(caixaId, {
      observacao: "Faltou dinheiro na conferência",
      contagem: 75.32
    });
    expect(fechado.statusCode, fechado.body).toBe(204);

    const quebra = await consultarUm<{ id: string; empresa_id: string; valor: string; observacao: string }>(
      "select id, empresa_id, valor, observacao from quebras_caixa where fechamento_caixa_id = $1 and transferencia_id is null",
      [caixaId]
    );
    expect(quebra).toMatchObject({
      empresa_id: idsTeste.empresaA,
      valor: "-12.34",
      observacao: "Faltou dinheiro na conferência"
    });

    const lista = await request(cookieTesouraria, "GET", `/api/notificacoes?empresaId=${idsTeste.empresaA}`);
    expect(lista.statusCode, lista.body).toBe(200);
    const notificacao = json<{ data: Array<{ id: string; referenciaId: string; tipo: string; valor: number }> }>(
      lista
    ).data.find((item) => item.referenciaId === quebra?.id);
    expect(notificacao).toMatchObject({ tipo: "quebra_caixa", valor: -12.34 });

    const verificar = await request(
      cookieTesouraria,
      "PUT",
      `/api/notificacoes/${notificacao!.id}/verificar?empresaId=${idsTeste.empresaA}`,
      {}
    );
    expect(verificar.statusCode, verificar.body).toBe(204);
    expect(
      await consultarUm(
        "select id from notificacoes where id = $1 and verificado = true and verificado_em is not null",
        [notificacao!.id]
      )
    ).toBeTruthy();

    // O sino segue mostrando somente o que pede acao. A central de Pendencias tambem consulta o
    // historico, para que uma quebra nao desapareca da operacao logo depois de ser verificada.
    const pendentesAposVerificacao = await request(
      cookieTesouraria,
      "GET",
      `/api/notificacoes?empresaId=${idsTeste.empresaA}`
    );
    expect(json<{ data: Array<{ id: string }> }>(pendentesAposVerificacao).data).not.toContainEqual(
      expect.objectContaining({ id: notificacao!.id })
    );
    const historico = await request(
      cookieTesouraria,
      "GET",
      `/api/notificacoes?empresaId=${idsTeste.empresaA}&incluirVerificadas=true`
    );
    expect(historico.statusCode, historico.body).toBe(200);
    expect(
      json<{ data: Array<{ id: string; verificado: boolean; referenciaId: string }> }>(historico).data
    ).toContainEqual(expect.objectContaining({ id: notificacao!.id, verificado: true, referenciaId: quebra?.id }));
  });

  it("registra o gerente que fechou e mantem a quebra atribuida ao operador", async () => {
    const { contaId, pdvId } = await criarContaEPdv("fechado-por-gerente");
    const { caixaId } = await abrirCaixa(pdvId);
    expect((await transferir(cookieCaixa, contaId, idsTeste.contaBanco, 4.56)).statusCode).toBe(201);

    const fechado = await fecharCaixa(
      caixaId,
      { observacao: "Gerente conferiu a falta do operador", contagem: 90.88 },
      cookieGerente
    );
    expect(fechado.statusCode, fechado.body).toBe(204);

    const autoria = await consultarUm<{ fechado_por: string; usuario_id: string }>(
      `select f.fechado_por, q.usuario_id
         from fechamentos_caixa f
         join quebras_caixa q on q.fechamento_caixa_id = f.id
        where f.id = $1`,
      [caixaId]
    );
    expect(autoria).toEqual({ fechado_por: usuarioGerenteId, usuario_id: usuarioCaixaId });
  });
});

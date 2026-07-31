import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { confirmarTransferenciaPorLacreDireto, consultarUm, json } from "../../setup/integracao.js";

describe("Etapa 2 - transferencia, retorno, quebra, notificacao e maquininha", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let cookieTesouraria: string;
  let usuarioCaixaId: string;
  let sequenciaLacre = 0;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    if (!usuario) throw new Error("Usuario Caixa nao encontrado");
    usuarioCaixaId = usuario.id;
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function request(cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  async function criarContaEPdv(sufixo: string) {
    const conta = await request(cookieAdmin, "POST", "/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: `Conta etapa2 ${sufixo}`
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
    const resposta = await request(cookieCaixa, "POST", "/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId,
      dataHoraAbertura: "2026-07-30T08:00",
      maquininhaId: maquininhaId ?? null
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
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

  it("libera Tesouraria sem caixa e mantem o cargo Caixa bloqueado sem caixa", async () => {
    const tesouraria = await transferir(cookieTesouraria, idsTeste.contaBanco, idsTeste.contaLivre, 7);
    expect(tesouraria.statusCode, tesouraria.body).toBe(201);

    const caixa = await transferir(cookieCaixa, idsTeste.contaBanco, idsTeste.contaLivre, 7);
    assertProblem(caixa, 400);
    expect(caixa.body).toMatch(/abra um caixa/i);
  });

  it("cadastra maquininha, vincula na abertura e continua permitindo abertura sem ela", async () => {
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
      [caixaComMaquininha]
    );
    expect(vinculo?.maquininha_id).toBe(maquininhaId);
    expect((await request(cookieCaixa, "POST", `/api/caixa/${caixaComMaquininha}/fechar`, {})).statusCode).toBe(204);

    const semMaquininha = await criarContaEPdv("sem-maquininha");
    const caixaSemMaquininha = await abrirCaixa(semMaquininha.pdvId);
    const semVinculo = await consultarUm<{ maquininha_id: string | null }>(
      "select maquininha_id from fechamentos_caixa where id = $1",
      [caixaSemMaquininha]
    );
    expect(semVinculo?.maquininha_id).toBeNull();
    expect((await request(cookieCaixa, "POST", `/api/caixa/${caixaSemMaquininha}/fechar`, {})).statusCode).toBe(204);
  });

  it("exige retorno da sobra com valor explicito e fecha depois do movimento ao cofre", async () => {
    const { contaId, pdvId } = await criarContaEPdv("retorno");
    const caixaId = await abrirCaixa(pdvId);
    expect((await transferir(cookieCaixa, idsTeste.contaBanco, contaId, 20)).statusCode).toBe(201);
    await confirmarTransferenciaPorLacreDireto(`E2-${sequenciaLacre}`, usuarioCaixaId);

    const bloqueado = await request(cookieCaixa, "POST", `/api/caixa/${caixaId}/fechar`, {});
    assertProblem(bloqueado, 400);
    expect(bloqueado.body).toMatch(/R\$ 20\.00/);

    const retorno = await request(cookieCaixa, "POST", `/api/caixa/${caixaId}/transferencia-cofre`, {
      tipo: "retorno",
      valor: 20
    });
    expect(retorno.statusCode, retorno.body).toBe(200);
    expect((await request(cookieCaixa, "POST", `/api/caixa/${caixaId}/fechar`, {})).statusCode).toBe(204);
  });

  it("quebra sem observacao nao fecha; com observacao grava fato e notifica Tesouraria", async () => {
    const { contaId, pdvId } = await criarContaEPdv("quebra");
    const caixaId = await abrirCaixa(pdvId);
    expect((await transferir(cookieCaixa, contaId, idsTeste.contaBanco, 12.34)).statusCode).toBe(201);

    const semObservacao = await request(cookieCaixa, "POST", `/api/caixa/${caixaId}/fechar`, {});
    assertProblem(semObservacao, 400);
    expect(semObservacao.body).toMatch(/observacao obrigatoria/i);

    const fechado = await request(cookieCaixa, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "Faltou dinheiro na conferência"
    });
    expect(fechado.statusCode, fechado.body).toBe(204);

    const quebra = await consultarUm<{ id: string; empresa_id: string; valor: string; observacao: string }>(
      "select id, empresa_id, valor, observacao from quebras_caixa where fechamento_caixa_id = $1",
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
  });
});

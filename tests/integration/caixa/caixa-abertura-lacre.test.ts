import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste, registrarEncerramentoCaixaParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// R-040 — abrir o caixa informando o lacre E o ato de confirmar o recebimento da transferencia.
// Nao sao dois passos: o lacre identifica a transferencia pendente, o caixa que abre vence a
// disputa (R-030), data_recebimento/confirmado_por sao preenchidos (R-028), o dinheiro entra
// NAQUELE caixa (R-036) e o lacre e rompido (R-027) — tudo na MESMA transacao. Meia confirmacao
// (caixa aberto com transferencia ainda pendente, ou o contrario) some dinheiro do painel.
describe("R-040 - abrir caixa por lacre confirma a transferencia", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  let adminId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.admin.email
    ]);
    if (!usuario) throw new Error("Usuario admin nao encontrado");
    adminId = usuario.id;
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function request(cookie: string, method: "GET" | "POST", url: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  // Conta + PDV proprios por cenario: o PDV nao pode ter caixa aberto de outro teste.
  async function criarContaEPdv(nome: string) {
    const conta = await request(cookieAdmin, "POST", "/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: `Conta ${nome}`
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await request(cookieAdmin, "POST", "/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: `PDV ${nome}`,
      contaId,
      ativo: true
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    return { contaId, pdvId: json<{ data: { id: string } }>(pdv).data.id };
  }

  // A tesouraria envia (R-032: sem caixa aberto). Quem envia nunca confirma o proprio envio (R-028),
  // por isso a transferencia nasce pela tesouraria e o caixa e aberto pelo admin.
  async function criarTransferencia(lacre: string, valor: number, candidatos: string[]) {
    const [destinoPrincipal, ...demais] = candidatos;
    const resposta = await request(cookieTesouraria, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: `Fundo de troco ${lacre}`,
      valorOriginal: valor,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: destinoPrincipal,
      contasDestinoIds: demais,
      nLacreDoc: lacre,
      tempoConfirmacao: "1dia"
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: { id: string } }>(resposta).data.id;
  }

  async function abrir(pdvId: string, dataHoraAbertura: string, lacreAbertura?: string) {
    const resposta = await request(cookieAdmin, "POST", "/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: adminId,
      dataHoraAbertura,
      ...(lacreAbertura ? { lacreAbertura } : {})
    });
    if (resposta.statusCode === 201) {
      registrarEncerramentoCaixaParaTeste(json<{ data: { id: string } }>(resposta).data.id);
    }
    return resposta;
  }

  async function saldoConta(contaId: string) {
    const resposta = await request(cookieAdmin, "GET", `/api/contas/saldos?empresaId=${idsTeste.empresaA}`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const conta = json<{ data: Array<{ id: string; saldoAtual: number; saldoPendente: number }> }>(resposta).data.find(
      (item) => item.id === contaId
    );
    if (!conta) throw new Error(`Conta ${contaId} nao encontrada nos saldos`);
    return conta;
  }

  it("Deve levar TUDO para o caixa que abriu e deixar os outros candidatos sem nada", async () => {
    const a = await criarContaEPdv("r040-cand-a");
    const b = await criarContaEPdv("r040-cand-b");
    const c = await criarContaEPdv("r040-cand-c");
    const transferenciaId = await criarTransferencia("R040-TRES-CANDIDATOS", 490, [a.contaId, b.contaId, c.contaId]);

    const cofreAntes = await saldoConta(idsTeste.contaCofre);
    const aberta = await abrir(b.pdvId, "2026-06-01T08:00", "R040-TRES-CANDIDATOS");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;

    // A transferencia foi CONCLUIDA no ato da abertura: recebida, datada, com autor e ligada ao caixa.
    const transferencia = await consultarUm<{
      status: string;
      conta_destino_id: string;
      confirmado_por: string;
      caixa_id: string;
      data_recebimento: string | null;
    }>(
      "select status, conta_destino_id, confirmado_por, caixa_id, data_recebimento from transferencias where id = $1",
      [transferenciaId]
    );
    expect(transferencia).toMatchObject({
      status: "recebido",
      conta_destino_id: b.contaId,
      confirmado_por: adminId,
      caixa_id: caixaId
    });
    expect(transferencia?.data_recebimento).not.toBeNull();

    // R-027: o lacre foi rompido no mesmo ato.
    expect(
      await consultarUm("select id from lacres where transferencia_id = $1 and rompido = true", [transferenciaId])
    ).toBeTruthy();

    // R-036: o dinheiro sai do PENDENTE da origem e entra no caixa vencedor. A e C nao recebem nada.
    const cofreDepois = await saldoConta(idsTeste.contaCofre);
    expect(cofreDepois.saldoPendente - cofreAntes.saldoPendente).toBe(-490);
    expect(cofreDepois.saldoAtual).toBe(cofreAntes.saldoAtual);
    expect((await saldoConta(b.contaId)).saldoAtual).toBe(490);
    expect((await saldoConta(a.contaId)).saldoAtual).toBe(0);
    expect((await saldoConta(c.contaId)).saldoAtual).toBe(0);

    // O caixa guarda o lacre que o abriu; R-001: fundo nao e emprestimo, entao nao ha divida.
    const caixa = await consultarUm<{ lacre_abertura: string; divida_cofre: string }>(
      "select lacre_abertura, divida_cofre from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(caixa).toMatchObject({ lacre_abertura: "R040-TRES-CANDIDATOS", divida_cofre: "0.00" });
  });

  it("Deve RECUSAR com erro de negocio (nao 500) o segundo caixa que tentar o mesmo lacre", async () => {
    const a = await criarContaEPdv("r040-reuso-a");
    const b = await criarContaEPdv("r040-reuso-b");
    await criarTransferencia("R040-REUSO", 300, [a.contaId, b.contaId]);

    const primeira = await abrir(a.pdvId, "2026-06-02T08:00", "R040-REUSO");
    expect(primeira.statusCode, primeira.body).toBe(201);

    const segunda = await abrir(b.pdvId, "2026-06-02T09:00", "R040-REUSO");
    assertProblem(segunda, 400);
    expect(segunda.body).toMatch(/rompido|já utilizado/i);

    // O caixa perdedor NAO pode ter sido criado: a recusa derruba a transacao inteira.
    expect(await consultarUm("select id from fechamentos_caixa where pdv_id = $1", [b.pdvId])).toBeNull();
  });

  it("Deve eleger UM unico vencedor quando duas aberturas concorrem pelo mesmo lacre", async () => {
    const a = await criarContaEPdv("r040-corrida-a");
    const b = await criarContaEPdv("r040-corrida-b");
    const transferenciaId = await criarTransferencia("R040-CORRIDA", 250, [a.contaId, b.contaId]);

    const [primeira, segunda] = await Promise.all([
      abrir(a.pdvId, "2026-06-03T08:00", "R040-CORRIDA"),
      abrir(b.pdvId, "2026-06-03T08:00", "R040-CORRIDA")
    ]);
    expect([primeira.statusCode, segunda.statusCode].sort()).toEqual([201, 400]);

    // Uma unica atualizacao vencedora, um unico lacre rompido, um unico caixa aberto.
    const transferencia = await consultarUm<{ status: string; conta_destino_id: string }>(
      "select status, conta_destino_id from transferencias where id = $1",
      [transferenciaId]
    );
    expect(transferencia?.status).toBe("recebido");
    expect([a.contaId, b.contaId]).toContain(transferencia?.conta_destino_id);
    expect(
      await consultarUm<{ total: string }>(
        "select count(*)::text as total from fechamentos_caixa where pdv_id in ($1, $2)",
        [a.pdvId, b.pdvId]
      )
    ).toEqual({ total: "1" });
  });

  it("Deve recusar o lacre quando a conta do caixa nao e destino candidato (R-030)", async () => {
    const candidato = await criarContaEPdv("r040-fora-candidato");
    const forasteiro = await criarContaEPdv("r040-forasteiro");
    await criarTransferencia("R040-FORA-DA-LISTA", 120, [candidato.contaId]);

    const resposta = await abrir(forasteiro.pdvId, "2026-06-04T08:00", "R040-FORA-DA-LISTA");
    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/não é destino/i);
  });

  it("Deve recusar um lacre inexistente sem abrir o caixa", async () => {
    const { pdvId } = await criarContaEPdv("r040-lacre-inexistente");
    const resposta = await abrir(pdvId, "2026-06-05T08:00", "R040-NAO-EXISTE");
    assertProblem(resposta, 400);
    expect(resposta.body).toContain("Lacre inexistente");
    expect(await consultarUm("select id from fechamentos_caixa where pdv_id = $1", [pdvId])).toBeNull();
  });

  it("Deve impedir que quem ENVIOU confirme o proprio envio abrindo o caixa (R-028)", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r040-auto-confirma");
    // Aqui o proprio admin cria a transferencia e tenta abrir com ela.
    const criada = await request(cookieAdmin, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Fundo enviado pelo proprio operador",
      valorOriginal: 80,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "R040-AUTO-CONFIRMA",
      tempoConfirmacao: "1dia"
    });
    expect(criada.statusCode, criada.body).toBe(201);

    const resposta = await abrir(pdvId, "2026-06-06T08:00", "R040-AUTO-CONFIRMA");
    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/quem enviou/i);
  });

  it("Deve abrir ZERADO quando nenhum lacre e informado (R-033)", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r040-sem-lacre");
    const resposta = await abrir(pdvId, "2026-06-07T08:00");
    expect(resposta.statusCode, resposta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(resposta).data.id;

    const caixa = await consultarUm<{ lacre_abertura: string | null; divida_cofre: string }>(
      "select lacre_abertura, divida_cofre from fechamentos_caixa where id = $1",
      [caixaId]
    );
    expect(caixa).toMatchObject({ lacre_abertura: null, divida_cofre: "0.00" });
    expect(await consultarUm("select id from transferencias where caixa_id = $1", [caixaId])).toBeNull();
    expect((await saldoConta(contaId)).saldoAtual).toBe(0);
  });

  it("Deve recusar o lacre de uma transferencia AGENDADA ainda nao liberada", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r040-agendada");
    const transferenciaId = await criarTransferencia("R040-AGENDADA", 200, [contaId]);
    await executarSql("update transferencias set status = 'agendada' where id = $1", [transferenciaId]);

    const resposta = await abrir(pdvId, "2026-06-08T08:00", "R040-AGENDADA");
    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/agendada/i);
  });
});

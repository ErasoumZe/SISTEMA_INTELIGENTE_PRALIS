import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste, registrarEncerramentoCaixaParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// R-040 — abrir o caixa informando o lacre E o ato de confirmar o recebimento da transferencia.
// Nao sao dois passos: o lacre identifica a transferencia pendente, o caixa que abre vence a
// disputa (R-030), data_recebimento/confirmado_por sao preenchidos (R-028), o dinheiro entra
// NAQUELE caixa (R-036) e o lacre e rompido (R-027) — tudo na MESMA transacao. Meia confirmacao
// (caixa aberto com transferencia ainda pendente, ou o contrario) some dinheiro do painel.
describe("R-040 - abrir caixa por lacre confirma a transferencia", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieTesouraria: string;
  let cookieMultiempresa: string;
  let cookieGerente: string;
  let cookieCaixa: string;
  let adminId: string;
  let multiempresaId: string;
  let gerenteId: string;
  let tesourariaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await encerrarCaixaSeedAdminParaTeste();
    [cookieAdmin, cookieTesouraria, cookieMultiempresa, cookieGerente, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "multiempresa"),
      cookieSessao(contexto.app, "gerente"),
      cookieSessao(contexto.app, "caixa")
    ]);
    const [admin, multiempresa, gerente, tesouraria] = await Promise.all([
      consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [usuariosTeste.admin.email]),
      consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
        usuariosTeste.multiempresa.email
      ]),
      consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
        usuariosTeste.gerente.email
      ]),
      consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
        usuariosTeste.tesouraria.email
      ])
    ]);
    if (!admin || !multiempresa || !gerente || !tesouraria) throw new Error("Operadores de teste nao encontrados");
    adminId = admin.id;
    multiempresaId = multiempresa.id;
    gerenteId = gerente.id;
    tesourariaId = tesouraria.id;
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function request(cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
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

  async function abrir(pdvId: string, lacreAbertura?: string, ator = { cookie: cookieAdmin, usuarioId: adminId }) {
    const resposta = await request(ator.cookie, "POST", "/api/caixa/abrir", {
      empresaId: idsTeste.empresaA,
      pdvId,
      usuarioCaixaId: ator.usuarioId,
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
    const aberta = await abrir(b.pdvId, "R040-TRES-CANDIDATOS");
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

    const primeira = await abrir(a.pdvId, "R040-REUSO");
    expect(primeira.statusCode, primeira.body).toBe(201);

    const segunda = await abrir(b.pdvId, "R040-REUSO", {
      cookie: cookieMultiempresa,
      usuarioId: multiempresaId
    });
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
      abrir(a.pdvId, "R040-CORRIDA"),
      abrir(b.pdvId, "R040-CORRIDA", {
        cookie: cookieMultiempresa,
        usuarioId: multiempresaId
      })
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

    const resposta = await abrir(forasteiro.pdvId, "R040-FORA-DA-LISTA");
    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/não é destino/i);
  });

  it("Deve recusar um lacre inexistente sem abrir o caixa", async () => {
    const { pdvId } = await criarContaEPdv("r040-lacre-inexistente");
    const resposta = await abrir(pdvId, "R040-NAO-EXISTE");
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

    const resposta = await abrir(pdvId, "R040-AUTO-CONFIRMA");
    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/quem enviou/i);
  });

  it("Deve abrir ZERADO quando nenhum lacre e informado (R-033)", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r040-sem-lacre");
    const resposta = await abrir(pdvId);
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

  it("Deve permitir abrir pelo lacre vencido porque a abertura resolve a pendencia", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r040-prazo-vencido");
    const vinculo = await request(cookieAdmin, "POST", "/api/contas-usuarios", {
      empresaId: idsTeste.empresaA,
      contaId,
      usuarioId: adminId
    });
    expect(vinculo.statusCode, vinculo.body).toBe(201);
    const transferenciaId = await criarTransferencia("R040-PRAZO-VENCIDO", 50, [contaId]);
    await executarSql("update transferencias set prazo_confirmacao_em = now() - interval '1 minute' where id = $1", [
      transferenciaId
    ]);

    const semLacre = await abrir(pdvId);
    assertProblem(semLacre, 423);
    expect(semLacre.body).toMatch(/prazo de confirma[cç][aã]o estourado/iu);

    const aberta = await abrir(pdvId, "R040-PRAZO-VENCIDO");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;
    const fechamento = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "prazo resolvido pela abertura"
    });
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });

  it("Deve aceitar total planejado menor e recusar total maior que a transferencia inicial", async () => {
    const { contaId } = await criarContaEPdv("r185-limite");
    const base = {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Teste do limite dos retornos",
      valorOriginal: 1_000,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      tempoConfirmacao: "1dia"
    };

    const menor = await request(cookieTesouraria, "POST", "/api/transferencias", {
      ...base,
      nLacreDoc: "R185-LIMITE-IDA-1",
      retornosPlanejados: [
        { valor: 300, nLacreDoc: "R185-LIMITE-RET-1", contaDestinoId: idsTeste.contaCofre },
        { valor: 600, nLacreDoc: "R185-LIMITE-RET-2", contaDestinoId: idsTeste.contaCofre }
      ]
    });
    expect(menor.statusCode, menor.body).toBe(201);

    const operador = await request(cookieCaixa, "POST", "/api/transferencias", {
      ...base,
      nLacreDoc: "R185-OPERADOR-IDA",
      retornosPlanejados: [{ valor: 300, nLacreDoc: "R185-OPERADOR-RET", contaDestinoId: idsTeste.contaCofre }]
    });
    assertProblem(operador, 400);
    expect(operador.body).toMatch(/exclusivo da retaguarda/iu);

    const maior = await request(cookieTesouraria, "POST", "/api/transferencias", {
      ...base,
      nLacreDoc: "R185-LIMITE-IDA-2",
      retornosPlanejados: [
        { valor: 400, nLacreDoc: "R185-LIMITE-RET-3", contaDestinoId: idsTeste.contaCofre },
        { valor: 700, nLacreDoc: "R185-LIMITE-RET-4", contaDestinoId: idsTeste.contaCofre }
      ]
    });
    assertProblem(maior, 400);
    const outroPdv = await criarContaEPdv("r185-destino-pdv-invalido");
    const destinoPdv = await request(cookieTesouraria, "POST", "/api/transferencias", {
      ...base,
      nLacreDoc: "R185-DESTINO-PDV-IDA",
      retornosPlanejados: [{ valor: 300, nLacreDoc: "R185-DESTINO-PDV-RET", contaDestinoId: outroPdv.contaId }]
    });
    assertProblem(destinoPdv, 400);
    expect(destinoPdv.body).toMatch(/n[aã]o pode ser conta de PDV/iu);
    await executarSql("update pdvs set ativo = false where id = $1", [outroPdv.pdvId]);
    const destinoPdvInativo = await request(cookieTesouraria, "POST", "/api/transferencias", {
      ...base,
      nLacreDoc: "R185-DESTINO-PDV-INATIVO-IDA",
      retornosPlanejados: [{ valor: 300, nLacreDoc: "R185-DESTINO-PDV-INATIVO-RET", contaDestinoId: outroPdv.contaId }]
    });
    assertProblem(destinoPdvInativo, 400);
    expect(destinoPdvInativo.body).toMatch(/n[aã]o pode ser conta de PDV/iu);
    expect(maior.body).toMatch(/n[aã]o pode ultrapassar/iu);

    const contaOutraEmpresa = await request(cookieMultiempresa, "POST", "/api/contas", {
      empresaId: idsTeste.empresaB,
      nome: "Conta atomica empresa B"
    });
    expect(contaOutraEmpresa.statusCode, contaOutraEmpresa.body).toBe(201);
    const contaOutraEmpresaId = json<{ data: { id: string } }>(contaOutraEmpresa).data.id;
    const atomica = await request(cookieTesouraria, "POST", "/api/transferencias", {
      ...base,
      nLacreDoc: "R185-ATOMICA-IDA",
      retornosPlanejados: [
        { valor: 300, nLacreDoc: "R185-ATOMICA-RET-1", contaDestinoId: idsTeste.contaCofre },
        { valor: 600, nLacreDoc: "R185-ATOMICA-RET-2", contaDestinoId: contaOutraEmpresaId }
      ]
    });
    assertProblem(atomica, 400);
    expect(
      await consultarUm<{ total: string }>(
        "select count(*) as total from transferencias where n_lacre_doc in ($1, $2, $3)",
        ["R185-ATOMICA-IDA", "R185-ATOMICA-RET-1", "R185-ATOMICA-RET-2"]
      )
    ).toEqual({ total: "0" });
    expect(
      await consultarUm<{ total: string }>("select count(*) as total from lacres where numero in ($1, $2, $3)", [
        "R185-ATOMICA-IDA",
        "R185-ATOMICA-RET-1",
        "R185-ATOMICA-RET-2"
      ])
    ).toEqual({ total: "0" });
  });

  it("Deve impedir executar retorno quando so o planejador poderia conferir no destino", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r185-sem-conferente");
    const destino = await request(cookieAdmin, "POST", "/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: "Destino apenas do planejador"
    });
    expect(destino.statusCode, destino.body).toBe(201);
    const destinoId = json<{ data: { id: string } }>(destino).data.id;
    const vinculo = await request(cookieAdmin, "POST", "/api/contas-usuarios", {
      empresaId: idsTeste.empresaA,
      contaId: destinoId,
      usuarioId: tesourariaId
    });
    expect(vinculo.statusCode, vinculo.body).toBe(201);

    const inicial = await request(cookieTesouraria, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Retorno sem terceiro conferente",
      valorOriginal: 100,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "R185-SEM-CONF-IDA",
      retornosPlanejados: [{ valor: 100, nLacreDoc: "R185-SEM-CONF-RET", contaDestinoId: destinoId }]
    });
    expect(inicial.statusCode, inicial.body).toBe(201);
    const transferenciaInicialId = json<{ data: { id: string } }>(inicial).data.id;

    const planoAntesDaAbertura = await consultarUm<{ id: string }>(
      "select id from transferencias where planejamento_origem_transferencia_id = $1 order by valor_original limit 1",
      [transferenciaInicialId]
    );
    if (!planoAntesDaAbertura) throw new Error("Planejamento para teste de imutabilidade nao encontrado");
    const payloadEdicao = {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Tentativa de edicao",
      valorOriginal: 300,
      contaOrigemId: contaId,
      contaDestinoId: idsTeste.contaCofre,
      nLacreDoc: "NAO-DEVE-ALTERAR"
    };
    const [editarPai, editarFilha] = await Promise.all([
      request(cookieAdmin, "PUT", `/api/transferencias/${transferenciaInicialId}`, payloadEdicao),
      request(cookieAdmin, "PUT", `/api/transferencias/${planoAntesDaAbertura.id}`, payloadEdicao)
    ]);
    assertProblem(editarPai, 400);
    assertProblem(editarFilha, 400);
    expect(editarPai.body).toMatch(/retorno planejado n[aã]o pode ser editada/iu);
    expect(editarFilha.body).toMatch(/retorno planejado n[aã]o pode ser editada/iu);

    const aberta = await abrir(pdvId, "R185-SEM-CONF-IDA");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;
    const plano = await consultarUm<{ id: string }>(
      "select id from transferencias where planejamento_origem_transferencia_id = $1",
      [transferenciaInicialId]
    );
    if (!plano) throw new Error("Planejamento de teste nao encontrado");

    const executar = await request(
      cookieAdmin,
      "POST",
      `/api/caixa/${caixaId}/planejamentos-retorno/${plano.id}/executar`,
      {}
    );
    assertProblem(executar, 400);
    expect(executar.body).toMatch(/sem responsavel elegivel/iu);
    expect(
      await consultarUm<{ status: string }>("select status from transferencias where id = $1", [plano.id])
    ).toEqual({
      status: "agendada"
    });
  });

  it("Deve cancelar planejamento antes da abertura com auditoria, retry idempotente e liberar o fechamento", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r185-cancelamento");
    const inicial = await request(cookieTesouraria, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Fundo com retorno cancelavel",
      valorOriginal: 100,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "R185-CANCELA-IDA",
      retornosPlanejados: [{ valor: 100, nLacreDoc: "R185-CANCELA-RET", contaDestinoId: idsTeste.contaCofre }]
    });
    expect(inicial.statusCode, inicial.body).toBe(201);
    const transferenciaInicialId = json<{ data: { id: string } }>(inicial).data.id;

    const plano = await consultarUm<{ id: string }>(
      "select id from transferencias where planejamento_origem_transferencia_id = $1",
      [transferenciaInicialId]
    );
    if (!plano) throw new Error("Planejamento de teste nao encontrado");

    const rota = `/api/caixa/planejamentos-retorno/${plano.id}/cancelar`;
    const cancelamentoPeloOperador = await request(cookieCaixa, "POST", rota, { motivo: "Sem autoridade" });
    assertProblem(cancelamentoPeloOperador, 403);
    expect(cancelamentoPeloOperador.body).toMatch(/exclusivo da retaguarda/iu);

    const cancelada = await request(cookieAdmin, "POST", rota, { motivo: "Destino indisponivel no turno" });
    expect(cancelada.statusCode, cancelada.body).toBe(200);
    expect(
      await consultarUm<{
        status: string;
        cancelado_por: string | null;
        cancelado_em: Date | null;
        motivo_cancelamento: string | null;
      }>("select status, cancelado_por, cancelado_em, motivo_cancelamento from transferencias where id = $1", [
        plano.id
      ])
    ).toEqual({
      status: "cancelada",
      cancelado_por: adminId,
      cancelado_em: expect.any(Date),
      motivo_cancelamento: "Destino indisponivel no turno"
    });

    const retry = await request(cookieAdmin, "POST", rota, { motivo: "Nao deve sobrescrever" });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(
      await consultarUm<{ motivo_cancelamento: string | null }>(
        "select motivo_cancelamento from transferencias where id = $1",
        [plano.id]
      )
    ).toEqual({ motivo_cancelamento: "Destino indisponivel no turno" });

    const listaCancelada = await request(
      cookieAdmin,
      "GET",
      `/api/transferencias?empresaId=${idsTeste.empresaA}&status=cancelada&pageSize=100`
    );
    expect(listaCancelada.statusCode, listaCancelada.body).toBe(200);
    expect(
      json<{ data: Array<{ id: string; caixaId: string | null; ehPlanejamentoRetorno: boolean }> }>(listaCancelada).data
    ).toContainEqual(expect.objectContaining({ id: plano.id, caixaId: null, ehPlanejamentoRetorno: true }));

    const aberta = await abrir(pdvId, "R185-CANCELA-IDA");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;

    const executarCancelada = await request(
      cookieAdmin,
      "POST",
      `/api/caixa/${caixaId}/planejamentos-retorno/${plano.id}/executar`,
      {}
    );
    assertProblem(executarCancelada, 404);

    const fechamento = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "planejamento cancelado"
    });
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });

  it("Deve destravar o fechamento ao cancelar um planejamento ja vinculado", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r185-cancelamento-vinculado");
    const inicial = await request(cookieTesouraria, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Fundo com retorno cancelavel depois da abertura",
      valorOriginal: 100,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "R185-CANCELA-VINC-IDA",
      retornosPlanejados: [{ valor: 100, nLacreDoc: "R185-CANCELA-VINC-RET", contaDestinoId: idsTeste.contaCofre }]
    });
    expect(inicial.statusCode, inicial.body).toBe(201);
    const transferenciaInicialId = json<{ data: { id: string } }>(inicial).data.id;
    const aberta = await abrir(pdvId, "R185-CANCELA-VINC-IDA");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;
    const plano = await consultarUm<{ id: string; caixa_id: string | null }>(
      "select id, caixa_id from transferencias where planejamento_origem_transferencia_id = $1",
      [transferenciaInicialId]
    );
    expect(plano?.caixa_id).toBe(caixaId);

    const bloqueado = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "ainda planejado"
    });
    assertProblem(bloqueado, 400);
    const cancelada = await request(cookieAdmin, "POST", `/api/caixa/planejamentos-retorno/${plano!.id}/cancelar`, {
      motivo: "Plano retirado pela retaguarda"
    });
    expect(cancelada.statusCode, cancelada.body).toBe(200);
    const fechamento = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "planejamento cancelado"
    });
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });

  it("Deve serializar a corrida entre executar e cancelar sem movimentacao parcial", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r185-corrida-cancelar-executar");
    const inicial = await request(cookieTesouraria, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Fundo com corrida no retorno",
      valorOriginal: 100,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "R185-CORRIDA-IDA",
      retornosPlanejados: [{ valor: 100, nLacreDoc: "R185-CORRIDA-RET", contaDestinoId: idsTeste.contaCofre }]
    });
    expect(inicial.statusCode, inicial.body).toBe(201);
    const transferenciaInicialId = json<{ data: { id: string } }>(inicial).data.id;
    const aberta = await abrir(pdvId, "R185-CORRIDA-IDA");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;
    const plano = await consultarUm<{ id: string }>(
      "select id from transferencias where planejamento_origem_transferencia_id = $1",
      [transferenciaInicialId]
    );
    if (!plano) throw new Error("Planejamento da corrida nao encontrado");

    const respostas = await Promise.all([
      request(cookieAdmin, "POST", `/api/caixa/${caixaId}/planejamentos-retorno/${plano.id}/executar`, {}),
      request(cookieTesouraria, "POST", `/api/caixa/planejamentos-retorno/${plano.id}/cancelar`, {
        motivo: "Cancelamento concorrente"
      })
    ]);
    expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([200, 409]);
    const estado = await consultarUm<{ status: string }>("select status from transferencias where id = $1", [plano.id]);
    expect(["pendente", "cancelada"]).toContain(estado?.status);

    const status = await request(cookieAdmin, "GET", `/api/caixa/status?empresaId=${idsTeste.empresaA}`);
    expect(status.statusCode, status.body).toBe(200);
    const saldo = json<{ data: { resumo: { saldo: number } } }>(status).data.resumo.saldo;
    expect(saldo).toBe(estado?.status === "pendente" ? 0 : 100);
    if (estado?.status === "pendente") {
      const conferencia = await request(cookieGerente, "POST", `/api/transferencias/${plano.id}/confirmar`, {
        contaDestinoId: idsTeste.contaCofre,
        nLacreDoc: "R185-CORRIDA-RET",
        valorRecebido: 100
      });
      expect(conferencia.statusCode, conferencia.body).toBe(200);
    }
    const fechamento = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "corrida encerrada"
    });
    expect(fechamento.statusCode, fechamento.body).toBe(204);
  });

  it("Deve criar, vincular e executar transferencias de retorno planejadas sem antecipar o saldo (R-185/R-187)", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r185-retornos");
    const vinculoBanco = await request(cookieAdmin, "POST", "/api/contas-usuarios", {
      empresaId: idsTeste.empresaA,
      contaId: idsTeste.contaBanco,
      usuarioId: gerenteId
    });
    expect(vinculoBanco.statusCode, vinculoBanco.body).toBe(201);
    const inicial = await request(cookieTesouraria, "POST", "/api/transferencias", {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: "Fundo com retornos preparados",
      valorOriginal: 1_000,
      contaOrigemId: idsTeste.contaCofre,
      contaDestinoId: contaId,
      nLacreDoc: "R185-IDA-001",
      tempoConfirmacao: "1dia",
      retornosPlanejados: [
        { valor: 300, nLacreDoc: "R185-RET-002", contaDestinoId: idsTeste.contaCofre },
        { valor: 700, nLacreDoc: "R185-RET-003", contaDestinoId: idsTeste.contaBanco }
      ]
    });
    expect(inicial.statusCode, inicial.body).toBe(201);
    const transferenciaInicialId = json<{ data: { id: string } }>(inicial).data.id;

    const confirmarPaiForaDaAbertura = await request(
      cookieGerente,
      "POST",
      `/api/transferencias/${transferenciaInicialId}/confirmar`,
      { contaDestinoId: contaId, nLacreDoc: "R185-IDA-001", valorRecebido: 1_000 }
    );
    assertProblem(confirmarPaiForaDaAbertura, 400);
    expect(confirmarPaiForaDaAbertura.body).toMatch(/abertura do Caixa/iu);

    const antesDaAbertura = await consultarTodos<{
      id: string;
      tipo: string;
      status: string;
      valor_original: string;
      caixa_id: string | null;
      origem_lacre: string;
    }>(
      `select t.id, t.tipo, t.status, t.valor_original, t.caixa_id, l.origem as origem_lacre
         from transferencias t
         join lacres l on l.transferencia_id = t.id
        where t.planejamento_origem_transferencia_id = $1
        order by t.valor_original`,
      [transferenciaInicialId]
    );
    expect(antesDaAbertura).toEqual([
      expect.objectContaining({ tipo: "retorno", status: "agendada", valor_original: "300.00", caixa_id: null }),
      expect.objectContaining({ tipo: "retorno", status: "agendada", valor_original: "700.00", caixa_id: null })
    ]);
    expect(antesDaAbertura.map((linha) => linha.origem_lacre)).toEqual(["retorno", "retorno"]);

    const aberta = await abrir(pdvId, "R185-IDA-001");
    expect(aberta.statusCode, aberta.body).toBe(201);
    const caixaId = json<{ data: { id: string } }>(aberta).data.id;
    const status = await request(cookieAdmin, "GET", `/api/caixa/status?empresaId=${idsTeste.empresaA}`);
    expect(status.statusCode, status.body).toBe(200);
    const statusAberto = json<{
      data: { caixaAberto: { id: string }; resumo: { saldo: number }; planejamentosPendentes: Array<{ id: string }> };
    }>(status).data;
    expect(statusAberto.caixaAberto.id).toBe(caixaId);
    expect(statusAberto.resumo.saldo).toBe(1_000);
    expect(statusAberto.planejamentosPendentes).toHaveLength(2);

    const abaAntesDaExecucao = await request(cookieAdmin, "GET", `/api/caixa/${caixaId}/transferencias`);
    expect(abaAntesDaExecucao.statusCode, abaAntesDaExecucao.body).toBe(200);
    expect(
      json<{ data: { itens: Array<{ id: string }>; totalEntrada: number; totalSaida: number } }>(abaAntesDaExecucao)
        .data
    ).toMatchObject({ itens: [{ id: transferenciaInicialId }], totalEntrada: 0, totalSaida: 1_000 });

    const detalheAntesDaExecucao = await request(cookieAdmin, "GET", `/api/caixa/${caixaId}/detalhe`);
    expect(detalheAntesDaExecucao.statusCode, detalheAntesDaExecucao.body).toBe(200);
    const transferenciasNoDetalhe = json<{
      data: { lancamentos: Array<{ categoria: string; itens: Array<{ id: string }> }> };
    }>(detalheAntesDaExecucao).data.lancamentos.find((grupo) => grupo.categoria === "transferencias")?.itens;
    expect(transferenciasNoDetalhe).toEqual([expect.objectContaining({ id: transferenciaInicialId })]);

    const avulsaSobreSaldoReservado = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/transferencia-cofre`, {
      valor: 1,
      lacre: "R185-AVULSA-RESERVADA",
      idempotenciaChave: "00000000-0000-4000-8000-000000001851"
    });
    assertProblem(avulsaSobreSaldoReservado, 400);
    expect(avulsaSobreSaldoReservado.body).toMatch(/reservado/iu);

    const listaVinculada = await request(
      cookieAdmin,
      "GET",
      `/api/transferencias?empresaId=${idsTeste.empresaA}&pageSize=100`
    );
    expect(listaVinculada.statusCode, listaVinculada.body).toBe(200);
    const itensListados = json<{
      data: Array<{
        id: string;
        caixaId: string | null;
        possuiPlanejamentoRetorno: boolean;
        ehPlanejamentoRetorno: boolean;
      }>;
    }>(listaVinculada).data;
    expect(itensListados).toContainEqual(
      expect.objectContaining({
        id: transferenciaInicialId,
        caixaId,
        possuiPlanejamentoRetorno: true,
        ehPlanejamentoRetorno: false
      })
    );
    expect(itensListados.filter((item) => item.ehPlanejamentoRetorno && item.caixaId === caixaId)).toHaveLength(2);

    const vinculadas = await consultarTodos<{
      id: string;
      caixa_id: string | null;
      conta_destino_id: string;
      n_lacre_doc: string;
    }>(
      "select id, caixa_id, conta_destino_id, n_lacre_doc from transferencias where planejamento_origem_transferencia_id = $1 order by valor_original",
      [transferenciaInicialId]
    );
    expect(vinculadas.every((linha) => linha.caixa_id === statusAberto.caixaAberto.id)).toBe(true);
    const saldoCofreAntesRetornos = (await saldoConta(idsTeste.contaCofre)).saldoAtual;
    const saldoBancoAntesRetornos = (await saldoConta(idsTeste.contaBanco)).saldoAtual;

    const [executada, retryConcorrente] = await Promise.all([
      request(cookieAdmin, "POST", `/api/caixa/${caixaId}/planejamentos-retorno/${vinculadas[0]!.id}/executar`, {}),
      request(cookieAdmin, "POST", `/api/caixa/${caixaId}/planejamentos-retorno/${vinculadas[0]!.id}/executar`, {})
    ]);
    expect(executada.statusCode, executada.body).toBe(200);
    expect(retryConcorrente.statusCode, retryConcorrente.body).toBe(200);
    expect(
      json<{ data: { resumo: { saldo: number }; planejamentosPendentes: unknown[] } }>(executada).data
    ).toMatchObject({
      resumo: { saldo: 700 },
      planejamentosPendentes: expect.arrayContaining([expect.objectContaining({ id: vinculadas[1]!.id })])
    });
    const abaAposPrimeiraExecucao = await request(cookieAdmin, "GET", `/api/caixa/${caixaId}/transferencias`);
    expect(abaAposPrimeiraExecucao.statusCode, abaAposPrimeiraExecucao.body).toBe(200);
    const dadosAbaAposPrimeiraExecucao = json<{
      data: { itens: Array<{ id: string }>; totalEntrada: number };
    }>(abaAposPrimeiraExecucao).data;
    expect(dadosAbaAposPrimeiraExecucao.totalEntrada).toBe(300);
    expect(dadosAbaAposPrimeiraExecucao.itens.map((item) => item.id).sort()).toEqual(
      [transferenciaInicialId, vinculadas[0]!.id].sort()
    );
    expect(
      await consultarUm<{
        tipo: string;
        status: string;
        executado_em: Date | null;
        prazo_confirmacao_em: Date | null;
      }>("select tipo, status, executado_em, prazo_confirmacao_em from transferencias where id = $1", [
        vinculadas[0]!.id
      ])
    ).toMatchObject({
      tipo: "retorno",
      status: "pendente",
      executado_em: expect.any(Date),
      prazo_confirmacao_em: expect.any(Date)
    });
    const prazoExecutado = await consultarUm<{ executado_em: Date; prazo_confirmacao_em: Date }>(
      "select executado_em, prazo_confirmacao_em from transferencias where id = $1",
      [vinculadas[0]!.id]
    );
    expect(prazoExecutado!.prazo_confirmacao_em.getTime() - prazoExecutado!.executado_em.getTime()).toBe(86_400_000);

    const cancelarExecutada = await request(
      cookieAdmin,
      "POST",
      `/api/caixa/planejamentos-retorno/${vinculadas[0]!.id}/cancelar`,
      { motivo: "nao pode cancelar dinheiro que ja saiu" }
    );
    assertProblem(cancelarExecutada, 409);

    const fecharComPlanejamento = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "nao deve fechar"
    });
    assertProblem(fecharComPlanejamento, 400);
    expect(fecharComPlanejamento.body).toMatch(/retorno planejada/iu);

    const segundaExecutada = await request(
      cookieAdmin,
      "POST",
      `/api/caixa/${caixaId}/planejamentos-retorno/${vinculadas[1]!.id}/executar`,
      {}
    );
    expect(segundaExecutada.statusCode, segundaExecutada.body).toBe(200);
    expect(json<{ data: { resumo: { saldo: number } } }>(segundaExecutada).data.resumo.saldo).toBe(0);
    expect(
      await consultarTodos<{ ordem: number }>(
        "select ordem from transferencias where planejamento_origem_transferencia_id = $1 order by ordem",
        [transferenciaInicialId]
      )
    ).toEqual([{ ordem: 1 }, { ordem: 2 }]);

    const aindaTravado = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "aguarda destinos"
    });
    assertProblem(aindaTravado, 400);
    expect(aindaTravado.body).toMatch(/Cofre Integra[cç][aã]o|Banco Integra[cç][aã]o/iu);

    const retornoCofre = vinculadas.find((retorno) => retorno.conta_destino_id === idsTeste.contaCofre)!;
    const retornoBanco = vinculadas.find((retorno) => retorno.conta_destino_id === idsTeste.contaBanco)!;
    const conferenciaCofre = await request(cookieGerente, "POST", `/api/transferencias/${retornoCofre.id}/confirmar`, {
      contaDestinoId: retornoCofre.conta_destino_id,
      nLacreDoc: retornoCofre.n_lacre_doc,
      valorRecebido: 300
    });
    expect(conferenciaCofre.statusCode, conferenciaCofre.body).toBe(200);

    const divergenciaBanco = await request(
      cookieGerente,
      "POST",
      `/api/transferencias/${retornoBanco.id}/recusar-conferencia`,
      {
        contaDestinoId: retornoBanco.conta_destino_id,
        nLacreDoc: retornoBanco.n_lacre_doc,
        motivo: "Banco contou dez reais a menos",
        valorRecebido: 690,
        encerrar: true
      }
    );
    expect(divergenciaBanco.statusCode, divergenciaBanco.body).toBe(200);
    expect(
      await consultarUm<{ status: string; valor_recebido: string | null }>(
        "select status, valor_recebido from transferencias where id = $1",
        [retornoBanco.id]
      )
    ).toEqual({ status: "divergente", valor_recebido: "690.00" });
    expect(
      await consultarUm<{ valor: string; usuario_id: string }>(
        "select valor, usuario_id from quebras_caixa where transferencia_id = $1",
        [retornoBanco.id]
      )
    ).toEqual({ valor: "-10.00", usuario_id: adminId });
    expect((await saldoConta(idsTeste.contaCofre)).saldoAtual - saldoCofreAntesRetornos).toBe(300);
    expect((await saldoConta(idsTeste.contaBanco)).saldoAtual - saldoBancoAntesRetornos).toBe(690);

    const fechado = await request(cookieAdmin, "POST", `/api/caixa/${caixaId}/fechar`, {
      observacao: "retornos conferidos"
    });
    expect(fechado.statusCode, fechado.body).toBe(204);
  });

  it("Deve recusar o lacre de uma transferencia AGENDADA ainda nao liberada", async () => {
    const { contaId, pdvId } = await criarContaEPdv("r040-agendada");
    const transferenciaId = await criarTransferencia("R040-AGENDADA", 200, [contaId]);
    await executarSql("update transferencias set status = 'agendada' where id = $1", [transferenciaId]);

    const resposta = await abrir(pdvId, "R040-AGENDADA");
    assertProblem(resposta, 400);
    expect(resposta.body).toMatch(/agendada/i);
  });
});

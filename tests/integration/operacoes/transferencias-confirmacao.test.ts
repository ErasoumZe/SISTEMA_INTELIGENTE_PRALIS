import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processarTransferenciasTemporais } from "../../../api/src/transferencias/transferencias.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

type SaldoConta = { id: string; saldoAtual: number; saldoPendente: number };

describe("Etapa 10 - transferencia com disputa, saldo pendente e prazo", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let cookieTesouraria: string;
  let cookieSemPermissao: string;
  let gerenteId: string;
  let tesourariaId: string;
  let semPermissaoId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieGerente, cookieTesouraria, cookieSemPermissao] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "gerente"),
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "semPermissao")
    ]);
    const usuarios = await consultarTodos<{ id: string; email: string }>(
      'select id, email from "user" where lower(email) in (lower($1), lower($2), lower($3))',
      [usuariosTeste.gerente.email, usuariosTeste.tesouraria.email, usuariosTeste.semPermissao.email]
    );
    gerenteId = usuarios.find((item) => item.email.toLowerCase() === usuariosTeste.gerente.email)?.id ?? "";
    tesourariaId = usuarios.find((item) => item.email.toLowerCase() === usuariosTeste.tesouraria.email)?.id ?? "";
    semPermissaoId = usuarios.find((item) => item.email.toLowerCase() === usuariosTeste.semPermissao.email)?.id ?? "";
    if (!gerenteId || !tesourariaId || !semPermissaoId) throw new Error("Usuarios de confirmacao nao encontrados");
    await executarSql(
      `insert into contas_usuarios (empresa_id, conta_id, usuario_id)
       values ($1, $2, $3), ($1, $4, $5)
       on conflict (conta_id, usuario_id) do nothing`,
      [idsTeste.empresaA, idsTeste.contaCaixa, gerenteId, idsTeste.contaLivre, tesourariaId]
    );
    await executarSql(
      `insert into contas_usuarios (empresa_id, conta_id, usuario_id)
       values ($1, $2, $3)
       on conflict (conta_id, usuario_id) do nothing`,
      [idsTeste.empresaA, idsTeste.contaLivre, semPermissaoId]
    );
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function request(cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  function payloadTransferencia(lacre: string, origem: string, destino: string, extras: Record<string, unknown> = {}) {
    const destinoEhPdv = destino === idsTeste.contaCaixa || destino === idsTeste.contaLivre;
    return {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: `Transferencia QA ${lacre}`,
      valorOriginal: 100,
      contaOrigemId: origem,
      contaDestinoId: destino,
      nLacreDoc: lacre,
      tempoConfirmacao: "5min",
      // Cofre -> PDV e o malote fisico da abertura: deve declarar sua composicao e levar o
      // lacre que ficara reservado para o fechamento. Transferencias comuns mantem o contrato
      // original, pois esses campos so sao validos nesse circuito.
      ...(origem === idsTeste.contaCofre && destinoEhPdv
        ? {
            valorEspecieDeclarado: 100,
            valorMoedasDeclarado: 0,
            lacreFechamentoPlanejado: `${lacre}-FECHAMENTO`
          }
        : {}),
      ...extras
    };
  }

  async function saldos() {
    const resposta = await request(cookieAdmin, "GET", `/api/contas/saldos?empresaId=${idsTeste.empresaA}`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: SaldoConta[] }>(resposta).data;
  }

  it("exige lacre na saida do cofre e impede reutilizar o lacre em outro movimento", async () => {
    const semLacre = await request(cookieAdmin, "POST", "/api/transferencias", {
      ...payloadTransferencia("QA-LACRE-OBRIGATORIO", idsTeste.contaCofre, idsTeste.contaLivre),
      nLacreDoc: ""
    });
    expect(semLacre.statusCode, semLacre.body).toBe(400);

    const primeira = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-LACRE-MOVIMENTO-UNICO", idsTeste.contaCofre, idsTeste.contaLivre)
    );
    expect(primeira.statusCode, primeira.body).toBe(201);

    const reutilizada = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-LACRE-MOVIMENTO-UNICO", idsTeste.contaCofre, idsTeste.contaBanco)
    );
    expect(reutilizada.statusCode, reutilizada.body).toBe(400);
    expect(
      await consultarUm<{ quantidade: string }>(
        "select count(*)::text as quantidade from lacres where empresa_id = $1 and numero = $2",
        [idsTeste.empresaA, "QA-LACRE-MOVIMENTO-UNICO"]
      )
    ).toEqual({ quantidade: "1" });
  });

  it("retira da origem imediatamente e somente um destino confirma com o lacre", async () => {
    const antes = await saldos();
    const criada = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-DISPUTA-001", idsTeste.contaCofre, idsTeste.contaCaixa, {
        contasDestinoIds: [idsTeste.contaLivre],
        tempoConfirmacao: null
      })
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;

    const pendente = await saldos();
    const origemAntes = antes.find((item) => item.id === idsTeste.contaCofre)!;
    const origemPendente = pendente.find((item) => item.id === idsTeste.contaCofre)!;
    expect(origemPendente.saldoAtual - origemAntes.saldoAtual).toBe(-100);
    expect(origemPendente.saldoPendente - origemAntes.saldoPendente).toBe(100);
    expect(
      pendente.find((item) => item.id === idsTeste.contaCaixa)!.saldoAtual -
        antes.find((item) => item.id === idsTeste.contaCaixa)!.saldoAtual
    ).toBe(0);

    const [gerente, tesouraria] = await Promise.all([
      request(cookieGerente, "POST", `/api/transferencias/${transferenciaId}/confirmar`, {
        contaDestinoId: idsTeste.contaCaixa,
        nLacreDoc: "QA-DISPUTA-001"
      }),
      request(cookieTesouraria, "POST", `/api/transferencias/${transferenciaId}/confirmar`, {
        contaDestinoId: idsTeste.contaLivre,
        nLacreDoc: "QA-DISPUTA-001"
      })
    ]);
    expect([gerente.statusCode, tesouraria.statusCode].sort()).toEqual([200, 400]);

    const transferencia = await consultarUm<{
      status: string;
      conta_destino_id: string;
      confirmado_por: string;
    }>("select status, conta_destino_id, confirmado_por from transferencias where id = $1", [transferenciaId]);
    expect(transferencia?.status).toBe("recebido");
    expect([idsTeste.contaCaixa, idsTeste.contaLivre]).toContain(transferencia?.conta_destino_id);
    expect([gerenteId, tesourariaId]).toContain(transferencia?.confirmado_por);
    expect(
      await consultarUm("select id from lacres where transferencia_id = $1 and rompido = true", [transferenciaId])
    ).toBeTruthy();

    const confirmado = await saldos();
    expect(confirmado.find((item) => item.id === idsTeste.contaCofre)!.saldoPendente).toBe(origemAntes.saldoPendente);
    const destinoVencedor = transferencia!.conta_destino_id;
    expect(
      confirmado.find((item) => item.id === destinoVencedor)!.saldoAtual -
        antes.find((item) => item.id === destinoVencedor)!.saldoAtual
    ).toBe(100);

    const edicaoConferida = await request(
      cookieAdmin,
      "PUT",
      `/api/transferencias/${transferenciaId}`,
      payloadTransferencia("QA-DISPUTA-001", idsTeste.contaCofre, destinoVencedor, { tempoConfirmacao: null })
    );
    expect(edicaoConferida.statusCode, edicaoConferida.body).toBe(400);
    // O lacre de fechamento reservado é a primeira guarda de imutabilidade.
    expect(edicaoConferida.body).toMatch(/lacre de fechamento reservado/i);
  });

  it("permite prazo apenas na transferencia direta e persiste ausencia de prazo como null", async () => {
    const diretaSemPrazo = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-DIRETA-SEM-PRAZO", idsTeste.contaBanco, idsTeste.contaLivre, {
        tempoConfirmacao: undefined
      })
    );
    expect(diretaSemPrazo.statusCode, diretaSemPrazo.body).toBe(201);
    const diretaId = json<{ data: { id: string } }>(diretaSemPrazo).data.id;
    expect(
      await consultarUm<{ tempo_confirmacao: string | null; prazo_confirmacao_em: Date | null }>(
        "select tempo_confirmacao, prazo_confirmacao_em from transferencias where id = $1",
        [diretaId]
      )
    ).toEqual({ tempo_confirmacao: null, prazo_confirmacao_em: null });

    const multiplaComPrazo = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-DISPUTA-COM-PRAZO", idsTeste.contaCofre, idsTeste.contaCaixa, {
        contasDestinoIds: [idsTeste.contaLivre],
        tempoConfirmacao: "5min"
      })
    );
    expect(multiplaComPrazo.statusCode, multiplaComPrazo.body).toBe(400);
    expect(multiplaComPrazo.body).toMatch(/tempo de confirma.*direta/iu);

    const multiplaComDestinoDuplicado = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-MULTIPLA-DUPLICADA", idsTeste.contaBanco, idsTeste.contaCaixa, {
        contasDestinoIds: [idsTeste.contaCaixa],
        tempoConfirmacao: null
      })
    );
    expect(multiplaComDestinoDuplicado.statusCode, multiplaComDestinoDuplicado.body).toBe(400);
    expect(multiplaComDestinoDuplicado.body).toMatch(/duas contas.*distintas/iu);
    expect(
      await consultarUm<{ total: number }>(
        "select count(*)::int as total from transferencias where n_lacre_doc = 'QA-MULTIPLA-DUPLICADA'"
      )
    ).toEqual({ total: 0 });

    const multiplaSemPrazo = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-MULTIPLA-SEM-PRAZO", idsTeste.contaBanco, idsTeste.contaCaixa, {
        contasDestinoIds: [idsTeste.contaLivre],
        tempoConfirmacao: null
      })
    );
    expect(multiplaSemPrazo.statusCode, multiplaSemPrazo.body).toBe(201);
    const multiplaId = json<{ data: { id: string } }>(multiplaSemPrazo).data.id;
    expect(
      await consultarUm<{ tempo_confirmacao: string | null; prazo_confirmacao_em: Date | null }>(
        "select tempo_confirmacao, prazo_confirmacao_em from transferencias where id = $1",
        [multiplaId]
      )
    ).toEqual({ tempo_confirmacao: null, prazo_confirmacao_em: null });

    // Defesa para dado historico: um prazo residual em modalidade multipla nao volta a travar ninguem.
    await executarSql("update transferencias set prazo_confirmacao_em = now() - interval '1 minute' where id = $1", [
      multiplaId
    ]);
    await processarTransferenciasTemporais(new Date());
    const notificacoesAdmin = await request(cookieAdmin, "GET", `/api/notificacoes?empresaId=${idsTeste.empresaA}`);
    expect(notificacoesAdmin.statusCode, notificacoesAdmin.body).toBe(200);
    expect(json<{ data: Array<{ referenciaId: string }> }>(notificacoesAdmin).data).not.toContainEqual(
      expect.objectContaining({ referenciaId: multiplaId })
    );
    const adminNaoTrava = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-MULTIPLA-HISTORICA-IGNORADA", idsTeste.contaBanco, idsTeste.contaCaixa, {
        tempoConfirmacao: null
      })
    );
    expect(adminNaoTrava.statusCode, adminNaoTrava.body).toBe(201);
  });

  it("notifica os dois lados, trava mutacoes vencidas e Tesouraria libera", async () => {
    const criada = await request(
      cookieGerente,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-PRAZO-001", idsTeste.contaBanco, idsTeste.contaLivre)
    );
    expect(criada.statusCode, criada.body).toBe(201);
    const transferenciaId = json<{ data: { id: string } }>(criada).data.id;
    await executarSql("update transferencias set prazo_confirmacao_em = now() - interval '1 minute' where id = $1", [
      transferenciaId
    ]);
    await processarTransferenciasTemporais(new Date());

    const notificacoesSemPermissao = await request(
      cookieSemPermissao,
      "GET",
      `/api/notificacoes?empresaId=${idsTeste.empresaA}`
    );
    expect(notificacoesSemPermissao.statusCode, notificacoesSemPermissao.body).toBe(200);
    expect(
      json<{ data: Array<{ referenciaId: string; tipo: string }> }>(notificacoesSemPermissao).data
    ).not.toContainEqual(
      expect.objectContaining({ referenciaId: transferenciaId, tipo: "transferencia_prazo_confirmacao" })
    );
    const semPermissaoNaoTrava = await request(
      cookieSemPermissao,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-SEM-PERMISSAO-NAO-TRAVA", idsTeste.contaBanco, idsTeste.contaCaixa)
    );
    expect(semPermissaoNaoTrava.statusCode, semPermissaoNaoTrava.body).toBe(403);

    for (const [cookie, usuarioId] of [
      [cookieGerente, gerenteId],
      [cookieTesouraria, tesourariaId]
    ] as const) {
      const lista = await request(cookie, "GET", `/api/notificacoes?empresaId=${idsTeste.empresaA}`);
      expect(lista.statusCode, lista.body).toBe(200);
      expect(
        json<{ data: Array<{ referenciaId: string; tipo: string; destinatarioUsuarioId: string }> }>(lista).data
      ).toContainEqual(
        expect.objectContaining({
          referenciaId: transferenciaId,
          tipo: "transferencia_prazo_confirmacao",
          destinatarioUsuarioId: usuarioId
        })
      );
      const bloqueada = await request(
        cookie,
        "POST",
        "/api/transferencias",
        payloadTransferencia(`QA-BLOQUEIO-${usuarioId.slice(0, 6)}`, idsTeste.contaBanco, idsTeste.contaCaixa)
      );
      expect(bloqueada.statusCode, bloqueada.body).toBe(423);
    }

    const liberada = await request(cookieTesouraria, "PUT", `/api/transferencias/${transferenciaId}/liberar-trava`, {});
    expect(liberada.statusCode, liberada.body).toBe(200);
    expect(
      await consultarUm("select id from transferencias where id = $1 and trava_liberada_em is not null", [
        transferenciaId
      ])
    ).toBeTruthy();

    const destravada = await request(
      cookieGerente,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-DESTRAVADA-001", idsTeste.contaBanco, idsTeste.contaCaixa)
    );
    expect(destravada.statusCode, destravada.body).toBe(201);

    const executadaPeloDestino = await request(
      cookieGerente,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-EXECUTOR-NAO-CONFIRMA", idsTeste.contaBanco, idsTeste.contaLivre)
    );
    expect(executadaPeloDestino.statusCode, executadaPeloDestino.body).toBe(201);
    const executadaPeloDestinoId = json<{ data: { id: string } }>(executadaPeloDestino).data.id;
    await executarSql(
      `update transferencias
          set tipo = 'retorno', solicitacao_cofre_em = now(), caixa_id = $1,
              executado_por = $2, executado_em = now(), prazo_confirmacao_em = now() - interval '1 minute'
        where id = $3`,
      [idsTeste.caixaAberto, tesourariaId, executadaPeloDestinoId]
    );
    await processarTransferenciasTemporais(new Date());

    const listaExecutor = await request(cookieTesouraria, "GET", `/api/notificacoes?empresaId=${idsTeste.empresaA}`);
    expect(listaExecutor.statusCode, listaExecutor.body).toBe(200);
    expect(json<{ data: Array<{ referenciaId: string }> }>(listaExecutor).data).not.toContainEqual(
      expect.objectContaining({ referenciaId: executadaPeloDestinoId })
    );
    const executorNaoTrava = await request(
      cookieTesouraria,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-EXECUTOR-LIVRE", idsTeste.contaBanco, idsTeste.contaCaixa)
    );
    expect(executorNaoTrava.statusCode, executorNaoTrava.body).toBe(201);
  });
});

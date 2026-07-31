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
  let gerenteId: string;
  let tesourariaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieGerente, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "gerente"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
    const usuarios = await consultarTodos<{ id: string; email: string }>(
      'select id, email from "user" where lower(email) in (lower($1), lower($2))',
      [usuariosTeste.gerente.email, usuariosTeste.tesouraria.email]
    );
    gerenteId = usuarios.find((item) => item.email.toLowerCase() === usuariosTeste.gerente.email)?.id ?? "";
    tesourariaId = usuarios.find((item) => item.email.toLowerCase() === usuariosTeste.tesouraria.email)?.id ?? "";
    if (!gerenteId || !tesourariaId) throw new Error("Usuarios de confirmacao nao encontrados");
    await executarSql(
      `insert into contas_usuarios (empresa_id, conta_id, usuario_id)
       values ($1, $2, $3), ($1, $4, $5)
       on conflict (conta_id, usuario_id) do nothing`,
      [idsTeste.empresaA, idsTeste.contaCaixa, gerenteId, idsTeste.contaLivre, tesourariaId]
    );
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function request(cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  function payloadTransferencia(lacre: string, origem: string, destino: string, extras: Record<string, unknown> = {}) {
    return {
      empresaId: idsTeste.empresaA,
      dataReferencia: "2026-07-31",
      descricao: `Transferencia QA ${lacre}`,
      valorOriginal: 100,
      contaOrigemId: origem,
      contaDestinoId: destino,
      nLacreDoc: lacre,
      tempoConfirmacao: "5min",
      ...extras
    };
  }

  async function saldos() {
    const resposta = await request(cookieAdmin, "GET", `/api/contas/saldos?empresaId=${idsTeste.empresaA}`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: SaldoConta[] }>(resposta).data;
  }

  it("retira da origem imediatamente e somente um destino confirma com o lacre", async () => {
    const antes = await saldos();
    const criada = await request(
      cookieAdmin,
      "POST",
      "/api/transferencias",
      payloadTransferencia("QA-DISPUTA-001", idsTeste.contaCofre, idsTeste.contaCaixa, {
        contasDestinoIds: [idsTeste.contaLivre]
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
  });
});

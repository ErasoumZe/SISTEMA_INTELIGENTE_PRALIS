import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("turnos: CRUD + turno padrao na abertura do caixa", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let adminId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    adminId = (await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios where email = $1", [
      usuariosTeste.admin.email
    ]))!.usuario_id;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("cria/lista turno e a abertura sem turnoId herda o turno padrao do colaborador", async () => {
    const criar = await contexto.app.inject({
      method: "POST",
      url: "/api/turnos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Manha", horaInicio: "06:00", horaFim: "14:00" }
    });
    expect(criar.statusCode, criar.body).toBe(201);
    const turnoId = json<{ data: { id: string } }>(criar).data.id;

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/turnos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(json<{ data: Array<{ id: string }> }>(listar).data.some((t) => t.id === turnoId)).toBe(true);

    // Define o turno padrao do colaborador admin -> abertura sem turnoId deve herda-lo.
    await executarSql("update colaboradores set turno_padrao_id = $1 where id = $2", [
      turnoId,
      idsTeste.colaboradorAdmin
    ]);
    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvLivre,
        usuarioCaixaId: adminId,
        dataHoraAbertura: "2026-07-16T08:00"
      }
    });
    expect(abrir.statusCode, abrir.body).toBe(201);

    const caixa = await consultarUm<{ turno_id: string | null }>(
      "select turno_id from fechamentos_caixa where pdv_id = $1 and status = 'aberto'",
      [idsTeste.pdvLivre]
    );
    expect(caixa?.turno_id).toBe(turnoId);
  });
});

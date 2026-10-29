import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { encerrarCaixaSeedAdminParaTeste, vincularPostoCaixaParaTeste } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("turnos: CRUD + turno padrao na abertura do caixa", () => {
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

    // Define o vinculo operacional completo do administrador: a abertura sem turnoId deve herdar
    // o turno, e a API precisa aceitar somente o PDV que foi configurado no colaborador.
    await vincularPostoCaixaParaTeste(idsTeste.colaboradorAdmin, idsTeste.pdvLivre, turnoId, "manha");
    const statusAntesDaAbertura = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(statusAntesDaAbertura.statusCode, statusAntesDaAbertura.body).toBe(200);
    expect(
      json<{ data: { vinculoOperador?: { pdvId: string; turnoCaixa: string } | null } }>(statusAntesDaAbertura).data
        .vinculoOperador
    ).toEqual({ pdvId: idsTeste.pdvLivre, turnoCaixa: "manha" });
    const maquininha = await contexto.app.inject({
      method: "POST",
      url: "/api/maquininhas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        numeroSerie: `TURNO-ABERTURA-${turnoId}`,
        apelido: "Maquininha do turno",
        ativo: true
      }
    });
    expect(maquininha.statusCode, maquininha.body).toBe(201);
    const maquininhaId = json<{ data: { id: string } }>(maquininha).data.id;
    const lacreAbertura = `TURNO-ABERTURA-${turnoId}`;
    const malote = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieTesouraria },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-16",
        descricao: "Malote para teste de turno",
        valorOriginal: 100,
        valorEspecieDeclarado: 100,
        valorMoedasDeclarado: 0,
        contaOrigemId: idsTeste.contaCofre,
        contaDestinoId: idsTeste.contaLivre,
        nLacreDoc: lacreAbertura,
        lacreFechamentoPlanejado: `TURNO-FECHAMENTO-${turnoId}`
      }
    });
    expect(malote.statusCode, malote.body).toBe(201);

    const abrir = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvLivre,
        usuarioCaixaId: adminId,
        maquininhaId,
        lacreAbertura,
        caixaResponsavelNome: "Admin de teste",
        supervisorResponsavelNome: "Supervisor de teste"
      }
    });
    expect(abrir.statusCode, abrir.body).toBe(201);

    const caixa = await consultarUm<{ turno_id: string | null }>(
      "select turno_id from fechamentos_caixa where pdv_id = $1 and status = 'aberto'",
      [idsTeste.pdvLivre]
    );
    expect(caixa?.turno_id).toBe(turnoId);

    const outroPdv = await contexto.app.inject({
      method: "POST",
      url: "/api/caixa/abrir",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        pdvId: idsTeste.pdvEntradas,
        usuarioCaixaId: adminId,
        maquininhaId,
        lacreAbertura: "LACRE-NAO-DEVE-SER-CONSULTADO",
        caixaResponsavelNome: "Admin de teste",
        supervisorResponsavelNome: "Supervisor de teste"
      }
    });
    expect(outroPdv.statusCode).toBe(400);
    expect(outroPdv.body).toContain("PDV vinculado");
  });
});

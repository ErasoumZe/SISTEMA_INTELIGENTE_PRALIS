import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("colaboradores integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarCargoEColaborador_Quando_DadosValidos", async () => {
    const cargoResposta = await contexto.app.inject({
      method: "POST",
      url: "/api/cargos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Auxiliar de Integracao" }
    });
    expect(cargoResposta.statusCode).toBe(201);
    const cargoId = json<{ data: { id: string } }>(cargoResposta).data.id;

    const colaboradorResposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Colaborador criado por integracao",
        setorId: idsTeste.setorA,
        cargoId
      }
    });
    expect(colaboradorResposta.statusCode).toBe(201);
    const colaboradorId = json<{ data: { id: string } }>(colaboradorResposta).data.id;

    const colaborador = await consultarUm<{ nome: string }>("select nome from colaboradores where id = $1", [
      colaboradorId
    ]);
    const cargoVinculado = await consultarUm<{ cargo_id: string }>(
      "select cargo_id from colaboradores_cargos where colaborador_id = $1 and ativo = true",
      [colaboradorId]
    );
    expect(colaborador?.nome).toBe("Colaborador criado por integracao");
    expect(cargoVinculado?.cargo_id).toBe(cargoId);
  });

  it("Deve_Retornar403_Quando_CriarColaboradorOuCargoEmEmpresaNaoPermitida", async () => {
    const cargoResposta = await contexto.app.inject({
      method: "POST",
      url: "/api/cargos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaB, nome: "Cargo proibido" }
    });
    const colaboradorResposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        nome: "Colaborador proibido",
        setorId: idsTeste.setorA,
        cargoId: idsTeste.cargoAdmin
      }
    });

    assertProblem(cargoResposta, 403, "FORBIDDEN_COMPANY");
    assertProblem(colaboradorResposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_CriarJornadaEFaltaJustificada_Quando_ColaboradorExiste", async () => {
    const jornadaResposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/jornadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataInicio: "2026-07-01",
        dias: [
          {
            diaDaSemana: "SEGUNDA",
            faixas: [
              {
                horaEntrada: "08:00",
                cargaHorariaDiariaEmMinutos: 480,
                intervaloMinutos: 60,
                colaboradorCargoId: idsTeste.colaboradorCargoAdmin
              }
            ]
          }
        ]
      }
    });
    expect(jornadaResposta.statusCode).toBe(201);

    const faltaResposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/faltas-justificadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        inicio: "2026-07-02T08:00:00.000Z",
        fim: "2026-07-02T12:00:00.000Z",
        motivo: "Atestado medico"
      }
    });
    expect(faltaResposta.statusCode).toBe(201);

    const jornada = await consultarUm<{ dia_da_semana: string }>(
      "select dia_da_semana from colaboradores_jornadas where colaborador_id = $1 and data_inicio = $2",
      [idsTeste.colaboradorAdmin, "2026-07-01"]
    );
    const falta = await consultarUm<{ motivo: string }>(
      "select motivo from colaboradores_faltas_justificadas where colaborador_id = $1 and motivo = $2",
      [idsTeste.colaboradorAdmin, "Atestado medico"]
    );
    expect(jornada?.dia_da_semana).toBe("SEGUNDA");
    expect(falta?.motivo).toBe("Atestado medico");
  });

  it("Deve_ListarCargosJornadasEFaltasEspecificasDoColaborador", async () => {
    const cargos = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/cargos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    const jornadas = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/jornadas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    const faltas = await contexto.app.inject({
      method: "GET",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/faltas-justificadas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });

    expect(cargos.statusCode).toBe(200);
    expect(jornadas.statusCode).toBe(200);
    expect(faltas.statusCode).toBe(200);
    expect(JSON.stringify(cargos.json())).toContain(idsTeste.colaboradorCargoAdmin);
    expect(JSON.stringify(jornadas.json())).toContain("SEGUNDA");
    expect(JSON.stringify(faltas.json())).toContain("Atestado medico");
  });

  it("Deve_AtualizarColaboradorCargoEVinculoDeCargo", async () => {
    const colaborador = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${idsTeste.colaboradorGerente}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Gerente Integracao Editado",
        setorId: idsTeste.setorA,
        cargoId: idsTeste.cargoGerente
      }
    });
    const cargo = await contexto.app.inject({
      method: "PUT",
      url: `/api/cargos/${idsTeste.cargoGerente}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Cargo gerente editado" }
    });
    const novoCargo = await contexto.app.inject({
      method: "POST",
      url: "/api/cargos",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Cargo temporario integracao" }
    });
    expect(novoCargo.statusCode).toBe(201);
    const novoCargoId = json<{ data: { id: string } }>(novoCargo).data.id;
    const vinculo = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/cargos`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        cargoId: novoCargoId,
        setorId: idsTeste.setorA,
        remuneracaoMinuto: 1,
        dataInicio: "2026-02-01",
        ativo: true
      }
    });
    expect(vinculo.statusCode).toBe(201);
    const vinculoId = json<{ data: { id: string } }>(vinculo).data.id;
    const statusVinculo = await contexto.app.inject({
      method: "PUT",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/cargos/${vinculoId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ativo: false }
    });

    expect(colaborador.statusCode).toBe(204);
    expect(cargo.statusCode).toBe(204);
    expect(statusVinculo.statusCode).toBe(204);
    await expect(
      consultarUm("select id from colaboradores where id = $1 and nome = $2", [
        idsTeste.colaboradorGerente,
        "Gerente Integracao Editado"
      ])
    ).resolves.toBeTruthy();
    await expect(
      consultarUm("select id from cargos where id = $1 and nome = $2", [idsTeste.cargoGerente, "Cargo gerente editado"])
    ).resolves.toBeTruthy();
    await expect(
      consultarUm("select id from colaboradores_cargos where id = $1 and ativo = false", [vinculoId])
    ).resolves.toBeTruthy();
  });

  it("Deve_Retornar403_Quando_CriarJornadaOuFaltaEmEmpresaNaoPermitida", async () => {
    const jornadaResposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/jornadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        dataInicio: "2026-07-04",
        dias: [
          {
            diaDaSemana: "QUARTA",
            faixas: [
              {
                horaEntrada: "08:00",
                cargaHorariaDiariaEmMinutos: 480,
                intervaloMinutos: 60,
                colaboradorCargoId: idsTeste.colaboradorCargoAdmin
              }
            ]
          }
        ]
      }
    });
    const faltaResposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/faltas-justificadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaB,
        inicio: "2026-07-04T08:00:00.000Z",
        fim: "2026-07-04T12:00:00.000Z",
        motivo: "Falta proibida"
      }
    });

    assertProblem(jornadaResposta, 403, "FORBIDDEN_COMPANY");
    assertProblem(faltaResposta, 403, "FORBIDDEN_COMPANY");
  });

  it("Deve_Retornar400_Quando_JornadaTemFaixasSobrepostas", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/jornadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataInicio: "2026-07-03",
        dias: [
          {
            diaDaSemana: "TERCA",
            faixas: [
              {
                horaEntrada: "08:00",
                cargaHorariaDiariaEmMinutos: 240,
                intervaloMinutos: 0,
                colaboradorCargoId: idsTeste.colaboradorCargoAdmin
              },
              {
                horaEntrada: "09:00",
                cargaHorariaDiariaEmMinutos: 240,
                intervaloMinutos: 0,
                colaboradorCargoId: idsTeste.colaboradorCargoAdmin
              }
            ]
          }
        ]
      }
    });

    assertProblem(resposta, 400);
  });

  it("Deve_Retornar400_Quando_ReferenciasOuPeriodoForemInvalidos", async () => {
    const colaboradorInexistente = "99999999-9999-4999-8999-999999999999";
    const cargoInexistente = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/cargos`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        cargoId: colaboradorInexistente,
        remuneracaoMinuto: 1,
        dataInicio: "2026-02-01",
        ativo: true
      }
    });
    const faltaPeriodoInvalido = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorAdmin}/faltas-justificadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        inicio: "2026-07-05T12:00:00.000Z",
        fim: "2026-07-05T08:00:00.000Z",
        motivo: "Periodo invalido"
      }
    });
    const colaboradorNaoEncontrado = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${colaboradorInexistente}/faltas-justificadas`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        inicio: "2026-07-05T08:00:00.000Z",
        fim: "2026-07-05T12:00:00.000Z",
        motivo: "Colaborador inexistente"
      }
    });

    assertProblem(cargoInexistente, 400);
    assertProblem(faltaPeriodoInvalido, 400);
    assertProblem(colaboradorNaoEncontrado, 400);
  });
});

describe("colaboradores importacao/exportacao integration", () => {
  let contexto: ContextoApiTeste;
  let cookieMultiempresa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ImportarColaboradoresEntreEmpresasPermitidas", async () => {
    await executarSql(
      "delete from colaboradores_cargos where colaborador_id in (select id from colaboradores where empresa_id = $1 and importado_de = $2)",
      [idsTeste.empresaB, idsTeste.empresaA]
    );
    await executarSql("delete from colaboradores where empresa_id = $1 and importado_de = $2", [
      idsTeste.empresaB,
      idsTeste.empresaA
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/colaboradores/importar",
      headers: { cookie: cookieMultiempresa },
      payload: { empresaOrigemId: idsTeste.empresaA, empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBeGreaterThan(0);
    await expect(
      consultarUm("select id from colaboradores where empresa_id = $1 and importado_de = $2", [
        idsTeste.empresaB,
        idsTeste.empresaA
      ])
    ).resolves.toBeTruthy();
  });

  it("Deve_ExportarColaboradorParaEmpresaPermitida", async () => {
    await executarSql(
      "delete from colaboradores_cargos where colaborador_id in (select id from colaboradores where empresa_id = $1 and importado_de = $2 and id_importado = $3)",
      [idsTeste.empresaB, idsTeste.empresaA, idsTeste.colaboradorGerente]
    );
    await executarSql("delete from colaboradores where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
      idsTeste.empresaB,
      idsTeste.empresaA,
      idsTeste.colaboradorGerente
    ]);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/colaboradores/${idsTeste.colaboradorGerente}/exportar`,
      headers: { cookie: cookieMultiempresa },
      payload: { empresaDestinoId: idsTeste.empresaB, modo: "completo" }
    });

    assertOk(resposta);
    expect(json<{ data: { inseridos: number } }>(resposta).data.inseridos).toBe(1);
    await expect(
      consultarUm("select id from colaboradores where empresa_id = $1 and importado_de = $2 and id_importado = $3", [
        idsTeste.empresaB,
        idsTeste.empresaA,
        idsTeste.colaboradorGerente
      ])
    ).resolves.toBeTruthy();
  });
});

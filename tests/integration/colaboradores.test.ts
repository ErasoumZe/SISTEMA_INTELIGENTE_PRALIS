import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cargoId, colaboradorId, criarPerfil, empresaA, empresaB, registroId, requisitar, setorId, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarCargos: vi.fn(),
  criarCargo: vi.fn(),
  atualizarCargo: vi.fn(),
  listarCargosColaborador: vi.fn(),
  criarCargoColaborador: vi.fn(),
  atualizarStatusCargoColaborador: vi.fn(),
  listarJornadasColaborador: vi.fn(),
  criarJornadasColaborador: vi.fn(),
  listarFaltasJustificadas: vi.fn(),
  criarFaltaJustificada: vi.fn()
}));

vi.mock("../../api/src/auth.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      handler: vi.fn()
    }
  }
}));

vi.mock("../../api/src/perfis.js", () => ({
  buscarPerfilUsuario: mocks.buscarPerfilUsuario
}));

vi.mock("../../api/src/colaboradores/colaboradores.service.js", () => ({
  listarCargos: mocks.listarCargos,
  criarCargo: mocks.criarCargo,
  atualizarCargo: mocks.atualizarCargo,
  listarCargosColaborador: mocks.listarCargosColaborador,
  criarCargoColaborador: mocks.criarCargoColaborador,
  atualizarStatusCargoColaborador: mocks.atualizarStatusCargoColaborador,
  listarJornadasColaborador: mocks.listarJornadasColaborador,
  criarJornadasColaborador: mocks.criarJornadasColaborador,
  listarFaltasJustificadas: mocks.listarFaltasJustificadas,
  criarFaltaJustificada: mocks.criarFaltaJustificada
}));

describe("colaboradores", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../api/src/app.js");
    app = await buildApp();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: usuarioId } });
    mocks.buscarPerfilUsuario.mockResolvedValue(
      criarPerfil(["cadastro_colaboradores_visualizar", "cadastro_colaboradores_criar", "cadastro_colaboradores_editar"], {
        empresaIds: [empresaA]
      })
    );
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && mock !== mocks.getSession && mock !== mocks.buscarPerfilUsuario) {
        mock.mockResolvedValue([]);
      }
    }
    mocks.criarCargo.mockResolvedValue({ id: cargoId, empresaId: empresaA, nome: "Caixa" });
    mocks.atualizarCargo.mockResolvedValue({ id: cargoId, empresaId: empresaA, nome: "Caixa" });
    mocks.criarCargoColaborador.mockResolvedValue({ id: registroId });
    mocks.atualizarStatusCargoColaborador.mockResolvedValue({ id: registroId, ativo: false });
    mocks.criarJornadasColaborador.mockResolvedValue({ ok: true });
    mocks.criarFaltaJustificada.mockResolvedValue({ id: registroId });
  });

  it("Deve_Retornar403_Quando_ListarCargosSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/cargos?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(mocks.listarCargos).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/cargos", mocks.listarCargos],
    [`/api/colaboradores/${colaboradorId}/cargos`, mocks.listarCargosColaborador],
    [`/api/colaboradores/${colaboradorId}/jornadas`, mocks.listarJornadasColaborador],
    [`/api/colaboradores/${colaboradorId}/faltas-justificadas`, mocks.listarFaltasJustificadas]
  ])("Deve_ListarRecursoDeColaborador_Quando_TiverPermissao", async (url, listar) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}${url.includes("?") ? "&" : "?"}empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(listar).toHaveBeenCalled();
  });

  it.each([["/api/cargos", mocks.listarCargos]])("Deve_Retornar403_Quando_ListarRecursoDeEmpresaNaoPermitida", async (url, listar) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}?empresaId=${empresaB}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(listar).not.toHaveBeenCalled();
  });

  it.each([
    [`/api/colaboradores/${colaboradorId}/cargos`, mocks.listarCargosColaborador],
    [`/api/colaboradores/${colaboradorId}/jornadas`, mocks.listarJornadasColaborador],
    [`/api/colaboradores/${colaboradorId}/faltas-justificadas`, mocks.listarFaltasJustificadas]
  ])("Deve_RepassarEmpresasPermitidas_Quando_ListarRecursoDoColaborador", async (url, listar) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(listar).toHaveBeenCalledWith(colaboradorId, [empresaA]);
  });

  it.each([
    ["POST", "/api/cargos", { empresaId: empresaB, nome: "Cargo" }, mocks.criarCargo],
    ["PUT", `/api/cargos/${cargoId}`, { empresaId: empresaB, nome: "Cargo" }, mocks.atualizarCargo],
    [
      "POST",
      `/api/colaboradores/${colaboradorId}/cargos`,
      { empresaId: empresaB, cargoId, setorId, remuneracaoMinuto: 1, dataInicio: "2026-06-28", ativo: true },
      mocks.criarCargoColaborador
    ],
    [
      "PUT",
      `/api/colaboradores/${colaboradorId}/cargos/${registroId}`,
      { empresaId: empresaB, ativo: false },
      mocks.atualizarStatusCargoColaborador
    ],
    [
      "POST",
      `/api/colaboradores/${colaboradorId}/jornadas`,
      { empresaId: empresaB, dataInicio: "2026-06-28", dias: [{ diaDaSemana: "SEGUNDA", faixas: [] }] },
      mocks.criarJornadasColaborador
    ],
    [
      "POST",
      `/api/colaboradores/${colaboradorId}/faltas-justificadas`,
      { empresaId: empresaB, inicio: "2026-06-28T08:00:00.000Z", fim: "2026-06-28T18:00:00.000Z", motivo: "Atestado" },
      mocks.criarFaltaJustificada
    ]
  ])("Deve_Retornar403_Quando_GravarRecursoEmEmpresaNaoPermitida", async (method, url, payload, gravar) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: method as "POST" | "PUT", url, payload });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(gravar).not.toHaveBeenCalled();
  });

  it("Deve_CriarCargo_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, nome: "Caixa" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/cargos", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: cargoId } });
    expect(mocks.criarCargo).toHaveBeenCalledWith(payload);
  });

  it("Deve_AtualizarCargo_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, nome: "Caixa atualizado" };

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: `/api/cargos/${cargoId}`, payload });

    // Assert
    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    expect(mocks.atualizarCargo).toHaveBeenCalledWith(cargoId, payload);
  });

  it("Deve_VincularCargoAoColaborador_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, cargoId, setorId, remuneracaoMinuto: 1, dataInicio: "2026-06-28", ativo: true };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: `/api/colaboradores/${colaboradorId}/cargos`, payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: registroId } });
    expect(mocks.criarCargoColaborador).toHaveBeenCalledWith(colaboradorId, payload);
  });

  it("Deve_AtualizarStatusDoCargoDoColaborador_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, ativo: false };

    // Act
    const resposta = await requisitar(app, {
      method: "PUT",
      url: `/api/colaboradores/${colaboradorId}/cargos/${registroId}`,
      payload
    });

    // Assert
    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    expect(mocks.atualizarStatusCargoColaborador).toHaveBeenCalledWith(colaboradorId, registroId, payload);
  });

  it("Deve_CriarJornadaDoColaborador_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = {
      empresaId: empresaA,
      dataInicio: "2026-06-28",
      dias: [
        {
          diaDaSemana: "SEGUNDA",
          faixas: [
            {
              horaEntrada: "08:00",
              cargaHorariaDiariaEmMinutos: 480,
              intervaloMinutos: 60,
              colaboradorCargoId: registroId
            }
          ]
        }
      ]
    };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: `/api/colaboradores/${colaboradorId}/jornadas`, payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(mocks.criarJornadasColaborador).toHaveBeenCalledWith(colaboradorId, payload);
  });

  it("Deve_CriarFaltaJustificada_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = {
      empresaId: empresaA,
      inicio: "2026-06-28T08:00:00.000Z",
      fim: "2026-06-28T18:00:00.000Z",
      motivo: "Atestado"
    };

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: `/api/colaboradores/${colaboradorId}/faltas-justificadas`,
      payload
    });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: registroId } });
    expect(mocks.criarFaltaJustificada).toHaveBeenCalledWith(colaboradorId, payload);
  });

  it("Deve_Retornar400_Quando_ServiceRejeitarFaltaJustificada", async () => {
    // Arrange
    mocks.criarFaltaJustificada.mockRejectedValueOnce(new Error("Fim deve ser posterior ao inicio"));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: `/api/colaboradores/${colaboradorId}/faltas-justificadas`,
      payload: { empresaId: empresaA, inicio: "2026-06-28T18:00:00.000Z", fim: "2026-06-28T08:00:00.000Z", motivo: "Atestado" }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ title: "Fim deve ser posterior ao inicio", status: resposta.statusCode });
  });
});



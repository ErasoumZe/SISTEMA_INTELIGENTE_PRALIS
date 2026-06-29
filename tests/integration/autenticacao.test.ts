import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handler: vi.fn(),
  getSession: vi.fn()
}));

vi.mock("../../api/src/auth.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession
    },
    handler: mocks.handler
  }
}));

describe("autenticacao", () => {
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
    mocks.handler.mockResolvedValue(new Response("ok", { status: 200, headers: { "x-auth": "ok" } }));
  });

  it("Deve_RepassarGetParaBetterAuth_Quando_ChamarRotaDeAuth", async () => {
    // Arrange / Act
    const resposta = await app.inject({ method: "GET", url: "/api/auth/session" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toBe("ok");
    expect(resposta.headers["x-auth"]).toBe("ok");
    expect(mocks.handler).toHaveBeenCalledWith(expect.any(Request));
  });

  it("Deve_RepassarPostParaBetterAuth_Quando_ChamarRotaDeAuthComBody", async () => {
    // Arrange
    mocks.handler.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }));

    // Act
    const resposta = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: "diretor@email.com", password: "123456" }
    });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true });
    expect(mocks.handler).toHaveBeenCalledWith(expect.any(Request));
  });

  it("Deve_Retornar500_Quando_BetterAuthFalhar", async () => {
    // Arrange
    mocks.handler.mockRejectedValueOnce(new Error("falha auth"));

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/auth/session" });

    // Assert
    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({
      type: "about:blank",
      title: "Internal authentication error",
      status: 500,
      code: "AUTH_FAILURE"
    });
  });
});


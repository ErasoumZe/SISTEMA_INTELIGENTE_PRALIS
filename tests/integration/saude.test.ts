import { APP_NAME } from "@padaria/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../api/src/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      handler: vi.fn()
    }
  }
}));

describe("saude", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../api/src/app.js");
    app = await buildApp();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it("Deve_RetornarStatusDaApi_Quando_ConsultarHealth", async () => {
    // Arrange / Act
    const resposta = await app.inject({ method: "GET", url: "/health" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      ok: true,
      data: {
        status: "ok",
        service: "api",
        app: APP_NAME
      }
    });
  });
});

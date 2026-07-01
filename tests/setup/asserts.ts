import { expect } from "vitest";

type RespostaJson = {
  statusCode: number;
  headers: Record<string, string | number | string[] | undefined>;
  json: () => object;
};

export function assertOk(resposta: RespostaJson, status = 200) {
  expect(resposta.statusCode).toBe(status);
  expect(resposta.json()).toMatchObject({ ok: true });
}

export function assertProblem(resposta: RespostaJson, status: number, code?: string) {
  expect(resposta.statusCode).toBe(status);
  expect(String(resposta.headers["content-type"] ?? "")).toContain("application/json");
  expect(resposta.json()).toMatchObject({ status, ...(code ? { code } : {}) });
}

import test from "node:test";
import assert from "node:assert/strict";
import { ehErroPermanente, enviarComRetry } from "../src/retry.js";

const semEspera = async () => {};

test("retry: sucesso apos 2 falhas transitorias", async () => {
  let chamadas = 0;
  const enviar = async () => {
    chamadas += 1;
    if (chamadas < 3) throw new Error("network fail");
    return { data: { status: "criado" } };
  };
  const resposta = await enviarComRetry(enviar, { tentativas: 4, baseMs: 1, esperar: semEspera });
  assert.equal(resposta.data.status, "criado");
  assert.equal(chamadas, 3);
});

test("retry: 4xx nao re-tenta (permanente)", async () => {
  let chamadas = 0;
  const enviar = async () => {
    chamadas += 1;
    throw new Error("Falha ao enviar venda X: HTTP 400 invalido");
  };
  await assert.rejects(() => enviarComRetry(enviar, { tentativas: 4, baseMs: 1, esperar: semEspera }));
  assert.equal(chamadas, 1);
});

test("retry: esgota as tentativas em falha transitoria persistente", async () => {
  let chamadas = 0;
  const enviar = async () => {
    chamadas += 1;
    throw new Error("HTTP 503 indisponivel");
  };
  await assert.rejects(() => enviarComRetry(enviar, { tentativas: 3, baseMs: 1, esperar: semEspera }));
  assert.equal(chamadas, 3);
});

test("ehErroPermanente: 4xx true; 5xx e rede false", () => {
  assert.equal(ehErroPermanente(new Error("HTTP 400")), true);
  assert.equal(ehErroPermanente(new Error("HTTP 422")), true);
  assert.equal(ehErroPermanente(new Error("HTTP 500")), false);
  assert.equal(ehErroPermanente(new Error("network fail")), false);
});

import { expect, describe, beforeAll, afterAll, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";

function multipart(nome: string, conteudo: string, competencia: string) {
  const boundary = `----conplus-teste-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const corpo = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="competencia"\r\n\r\n${competencia}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="arquivo"; filename="${nome}"\r\n` +
      `Content-Type: ${nome.endsWith(".csv") ? "text/csv" : "text/plain"}\r\n\r\n` +
      `${conteudo}\r\n` +
      `--${boundary}--\r\n`
  );
  return { corpo, contentType: `multipart/form-data; boundary=${boundary}` };
}

const txtRescisao = [
  "CONTRATO DO EMPREGADO\tADMISSÃO\tAVISO\tDEMISSÃO\tSEQ\tSALDO FGTS\tSALÁRIO\tPROVENTOS\tDESCONTOS\tLÍQUIDO\tFGTS GRRF\tCAUSA DEMISSAO",
  "CP-TESTE-001 - COLABORADOR FICTICIO\t01/01/2020\t01/02/2026\t02/02/2026\t1\t100,00\t200,00\t300,00\t50,00\t250,00\t10,00\tSEM JUSTA CAUSA"
].join("\n");

const csvFerias = [
  "CONTRATO;LIMITE;ADMISSÃO;PERIODO (INICIAL/FINAL);FALTAS;AFASTAMENTOS;SALDO;PAGO;TIPO;QUANTIDADE",
  "CP-TESTE-002 - COLABORADOR FICTICIO;N;01/01/2020;01/01/2026 - 31/12/2026;0;0;10;N;F;10"
].join("\n");

describe("Conplus — fluxo HTTP local", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieSemPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
  }, 180_000);

  afterAll(async () => contexto.fechar());

  async function preview(nome: string, conteudo: string, competencia = "2026-02-01", cookie = cookieAdmin) {
    const arquivo = multipart(nome, conteudo, competencia);
    return contexto.app.inject({
      method: "POST",
      url: "/api/conplus/importacoes/preview",
      headers: { cookie, "content-type": arquivo.contentType },
      payload: arquivo.corpo
    });
  }

  it("executa rescisão por HTTP, persiste, consulta, confirma idempotentemente e retifica", async () => {
    const primeira = await preview("rescisao-ficticia.txt", txtRescisao);
    expect(primeira.statusCode, primeira.body).toBe(200);
    const previa = primeira.json().data;
    expect(previa.tipo).toBe("rescisoes");
    expect(previa.totalRegistros).toBe(1);

    const confirmacao = await contexto.app.inject({
      method: "POST",
      url: "/api/conplus/importacoes/confirmar",
      headers: { cookie: cookieAdmin },
      payload: { previewId: previa.previewId }
    });
    expect(confirmacao.statusCode, confirmacao.body).toBe(200);
    expect(confirmacao.json().data.status).toBe("confirmada");
    expect(confirmacao.json().data.idempotente).toBe(false);

    const repeticao = await contexto.app.inject({
      method: "POST",
      url: "/api/conplus/importacoes/confirmar",
      headers: { cookie: cookieAdmin },
      payload: { previewId: previa.previewId }
    });
    expect(repeticao.statusCode, repeticao.body).toBe(200);
    expect(repeticao.json().data.idempotente).toBe(true);

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/conplus/importacoes/${previa.previewId}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    expect(detalhe.json().data.registros).toHaveLength(1);

    const historico = await contexto.app.inject({
      method: "GET",
      url: `/api/conplus/importacoes/${previa.previewId}/historico`,
      headers: { cookie: cookieAdmin }
    });
    expect(historico.statusCode, historico.body).toBe(200);
    expect(historico.json().data.length).toBeGreaterThanOrEqual(1);

    const retificada = await preview("rescisao-ficticia-retificacao.txt", txtRescisao.replace("250,00", "260,00"));
    expect(retificada.statusCode, retificada.body).toBe(200);
    const confirmacaoRetificacao = await contexto.app.inject({
      method: "POST",
      url: "/api/conplus/importacoes/confirmar",
      headers: { cookie: cookieAdmin },
      payload: { previewId: retificada.json().data.previewId, retificar: true }
    });
    expect(confirmacaoRetificacao.statusCode, confirmacaoRetificacao.body).toBe(200);
    expect(confirmacaoRetificacao.json().data.status).toBe("confirmada");
  }, 180_000);

  it("executa férias por CSV e mantém a sincronização Google simulada desabilitada", async () => {
    const previa = await preview("ferias-ficticias.csv", csvFerias);
    expect(previa.statusCode, previa.body).toBe(200);
    const previewId = previa.json().data.previewId as string;
    expect(previa.json().data.tipo).toBe("ferias");
    expect(previa.json().data.totalRegistros).toBe(1);

    const confirmacao = await contexto.app.inject({
      method: "POST",
      url: "/api/conplus/importacoes/confirmar",
      headers: { cookie: cookieAdmin },
      payload: { previewId }
    });
    expect(confirmacao.statusCode, confirmacao.body).toBe(200);

    const sincronizacao = await contexto.app.inject({
      method: "POST",
      url: `/api/conplus/importacoes/${previewId}/sincronizar`,
      headers: { cookie: cookieAdmin }
    });
    expect(sincronizacao.statusCode, sincronizacao.body).toBe(200);
    expect(sincronizacao.json().data).toMatchObject({ habilitada: false, linhas: [] });
  }, 180_000);

  it("serializa confirmações concorrentes da mesma prévia sem duplicar registros", async () => {
    const previa = await preview(
      "rescisao-concorrente.txt",
      txtRescisao.replace("CP-TESTE-001", "CP-CONCORRENTE-003"),
      "2026-04-01"
    );
    expect(previa.statusCode, previa.body).toBe(200);
    const previewId = previa.json().data.previewId as string;
    const respostas = await Promise.all(
      [1, 2].map(() =>
        contexto.app.inject({
          method: "POST",
          url: "/api/conplus/importacoes/confirmar",
          headers: { cookie: cookieAdmin },
          payload: { previewId }
        })
      )
    );
    expect(
      respostas.map((resposta) => ({ status: resposta.statusCode, body: resposta.body })),
      "respostas concorrentes"
    ).toEqual([
      { status: 200, body: expect.any(String) },
      { status: 200, body: expect.any(String) }
    ]);
    expect(respostas.map((resposta) => resposta.json().data.idempotente).sort()).toEqual([false, true]);

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/conplus/importacoes/${previewId}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.json().data.registros).toHaveLength(1);
  }, 180_000);

  it("rejeita formatos, competência e permissões inválidos sem persistir importação", async () => {
    const formato = await preview("folha-ficticia.xlsx", "conteudo ficticio");
    expect(formato.statusCode).toBe(400);

    const competencia = await preview("rescisao-invalida.txt", txtRescisao, "02/2026");
    expect(competencia.statusCode).toBe(400);

    const semPermissao = await preview("rescisao-sem-permissao.txt", txtRescisao, "2026-03-01", cookieSemPermissao);
    expect(semPermissao.statusCode).toBe(403);
  });
});

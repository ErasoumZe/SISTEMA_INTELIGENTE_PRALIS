import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm } from "../../setup/integracao.js";

function multipartArquivo(nome: string, mimeType: string, conteudo: string) {
  const boundary = `----padaria-${Date.now()}`;
  const corpo = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="arquivo"; filename="${nome}"`,
      `Content-Type: ${mimeType}`,
      "",
      conteudo,
      `--${boundary}--`,
      ""
    ].join("\r\n")
  );
  return { boundary, corpo };
}

describe("vendas comprovantes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_ListarECriarComprovanteDaVenda_Quando_ArquivoForValido", async () => {
    const antes = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/${idsTeste.vendaSeed}/comprovantes`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(antes);

    const { boundary, corpo } = multipartArquivo("comprovante.png", "image/png", "imagem-teste");
    const criar = await contexto.app.inject({
      method: "POST",
      url: `/api/vendas/${idsTeste.vendaSeed}/comprovantes`,
      headers: {
        cookie: cookieAdmin,
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload: corpo
    });
    expect(criar.statusCode).toBe(201);
    expect(criar.json()).toMatchObject({ data: { vendaId: idsTeste.vendaSeed, nomeOriginal: "comprovante.png" } });

    const comprovante = await consultarUm<{ nome_original: string; mime_type: string }>(
      "select nome_original, mime_type from vendas_comprovantes where venda_id = $1",
      [idsTeste.vendaSeed]
    );
    expect(comprovante).toMatchObject({ nome_original: "comprovante.png", mime_type: "image/png" });

    const depois = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/${idsTeste.vendaSeed}/comprovantes`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(depois);
    expect(JSON.stringify(depois.json())).toContain("comprovante.png");
  });

  it("Deve_Retornar400_Quando_ComprovanteTiverMimeTypeNaoPermitido", async () => {
    const { boundary, corpo } = multipartArquivo("comprovante.txt", "text/plain", "texto");

    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/vendas/${idsTeste.vendaSeed}/comprovantes`,
      headers: {
        cookie: cookieAdmin,
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload: corpo
    });

    assertProblem(resposta, 400);
  });
});


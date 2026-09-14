import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

const BOUNDARY = "----discriminacaoia";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function multipart(bytes: Buffer, mime = "image/jpeg") {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="arquivo"; filename="nota.jpg"\r\nContent-Type: ${mime}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`)
  ]);
}

describe("discriminacao de nota fiscal com IA", () => {
  let contexto: ContextoApiTeste;
  let discriminador: string;
  let semPermissao: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    discriminador = await cookieSessao(contexto.app, "discriminador");
    semPermissao = await cookieSessao(contexto.app, "semPermissao");
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function chamar(cookie: string | undefined, bytes = JPEG, empresaId: string = idsTeste.empresaA) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/discriminacao-ia/analisar?empresaId=${empresaId}&categoria=mercadoria`,
      headers: {
        ...(cookie ? { cookie } : {}),
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`
      },
      payload: multipart(bytes)
    });
  }

  it("exige sessao", async () => {
    const resposta = await chamar(undefined);
    expect(resposta.statusCode).toBe(401);
  });

  it("exige permissao da categoria", async () => {
    const resposta = await chamar(semPermissao);
    expect(resposta.statusCode, resposta.body).toBe(403);
  });

  it("nao aceita empresa fora do escopo", async () => {
    const resposta = await chamar(discriminador, JPEG, idsTeste.empresaB);
    expect(resposta.statusCode, resposta.body).toBe(403);
  });

  it("recusa conteudo que nao e imagem", async () => {
    const resposta = await chamar(discriminador, Buffer.from("arquivo falso"));
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.json().code).toBe("IMAGEM_INVALIDA");
  });
});

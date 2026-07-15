import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// PR2 Parte 1c: anexo de foto do documento em mercadorias (reusa a infra de comprovantes).
const BOUNDARY = "----testeboundary123";
const BYTES_PNG = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex"); // conteudo qualquer

function corpoMultipart(nome: string, mime: string, bytes: Buffer): Buffer {
  const cabecalho = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="foto"; filename="${nome}"\r\nContent-Type: ${mime}\r\n\r\n`,
    "utf8"
  );
  const rodape = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, "utf8");
  return Buffer.concat([cabecalho, bytes, rodape]);
}

describe("anexo de foto do documento (mercadorias)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let mercadoriaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    const linha = await consultarUm<{ id: string }>(
      `insert into mercadorias
         (empresa_id, fornecedor_id, data_referencia, data_vencimento, descricao, valor_original, status, computar)
       values ($1,$2,'2026-07-10','2026-07-10','Mercadoria com foto','50.00','aguardando_aprovacao',false)
       returning id`,
      [idsTeste.empresaA, idsTeste.fornecedor]
    );
    mercadoriaId = linha!.id;
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("faz upload, aparece na fila de pendentes com a foto e serve o arquivo", async () => {
    const upload = await contexto.app.inject({
      method: "POST",
      url: `/api/mercadorias/${mercadoriaId}/foto`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: corpoMultipart("nota.png", "image/png", BYTES_PNG)
    });
    expect(upload.statusCode, upload.body).toBe(201);
    expect(json<{ data: { fotoDocumentoUrl: string } }>(upload).data.fotoDocumentoUrl).toContain("mercadorias/");

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/mercadorias?empresaId=${idsTeste.empresaA}&pendenteDiscriminacao=true`,
      headers: { cookie: cookieAdmin }
    });
    const alvo = json<{ data: Array<{ id: string; fotoDocumentoUrl: string | null }> }>(listar).data.find(
      (m) => m.id === mercadoriaId
    );
    expect(alvo?.fotoDocumentoUrl, "foto deve aparecer na fila de pendentes").toBeTruthy();

    const foto = await contexto.app.inject({
      method: "GET",
      url: `/api/mercadorias/${mercadoriaId}/foto`,
      headers: { cookie: cookieAdmin }
    });
    expect(foto.statusCode).toBe(200);
    expect(foto.headers["content-type"]).toContain("image/png");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

/**
 * Foto do produto (P-04, ETAPA 8): multipart -> `/app/storage`, sem Cloudinary.
 *
 * O que estes testes prendem: tipo aceito, teto de tamanho, permissao, escopo por empresa, produto
 * inexistente e caminho de arquivo. O nome final e um UUID e a extensao vem do MIME — nome enviado
 * pelo cliente nunca chega ao disco, entao nao ha por onde escapar da pasta.
 */

const BOUNDARY = "----boundaryfotoproduto";
const BYTES_PNG = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");

function corpoMultipart(nome: string, mime: string, bytes: Buffer): Buffer {
  const cabecalho = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: ${mime}\r\n\r\n`,
    "utf8"
  );
  return Buffer.concat([cabecalho, bytes, Buffer.from(`\r\n--${BOUNDARY}--\r\n`, "utf8")]);
}

interface RespostaId {
  data: { id: string };
}

describe("produtos - foto", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieMultiempresa: string;
  let cookieSemPermissao: string;
  let produtoDaA = "";
  let produtoDaB = "";

  async function criarProduto(cookie: string, empresaId: string, descricao: string, sigla: string) {
    const unidade = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie },
      payload: { empresaId, nome: `Unidade ${sigla}`, sigla }
    });
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookie, {
      empresaId,
      grupoMercadoriaId: empresaId === idsTeste.empresaB ? idsTeste.grupoMercadoriaB : idsTeste.grupoMercadoriaInsumos,
      descricao,
      unidadeIndividualId: json<RespostaId>(unidade).data.id,
      quantidadeIndividual: 1,
      conversoes: []
    });
    expect(criado.statusCode).toBe(201);
    return json<RespostaId>(criado).data.id;
  }

  function enviarFoto(cookie: string, produtoId: string, nome: string, mime: string, bytes = BYTES_PNG) {
    return contexto.app.inject({
      method: "POST",
      url: `/api/produtos/${produtoId}/foto`,
      headers: { cookie, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: corpoMultipart(nome, mime, bytes)
    });
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    cookieMultiempresa = await cookieSessao(contexto.app, "multiempresa");
    cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    produtoDaA = await criarProduto(cookieAdmin, idsTeste.empresaA, "Produto com foto A", "fta");
    produtoDaB = await criarProduto(cookieMultiempresa, idsTeste.empresaB, "Produto com foto B", "ftb");
  }, 180_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_GravarNoStorageComNomeUuid_Quando_ImagemValida", async () => {
    const resposta = await enviarFoto(cookieAdmin, produtoDaA, "minha foto.png", "image/png");
    expect(resposta.statusCode).toBe(201);

    const { fotoUrl } = json<{ data: { fotoUrl: string } }>(resposta).data;
    // Pasta previsivel, nome IMPREVISIVEL: o nome do cliente ("minha foto.png") nao chega ao disco.
    expect(fotoUrl).toMatch(new RegExp(`^produtos/${produtoDaA}/[0-9a-f-]{36}\\.png$`));
    expect(fotoUrl).not.toContain("minha foto");

    const linha = await consultarUm<{ foto_url: string }>("select foto_url from produtos where id = $1", [produtoDaA]);
    expect(linha?.foto_url).toBe(fotoUrl);
  });

  it("Deve_ServirEDepoisRemover_Quando_FotoExiste", async () => {
    const leitura = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${produtoDaA}/foto`,
      headers: { cookie: cookieAdmin }
    });
    expect(leitura.statusCode).toBe(200);
    expect(String(leitura.headers["content-type"])).toContain("image/png");

    const remocao = await contexto.app.inject({
      method: "DELETE",
      url: `/api/produtos/${produtoDaA}/foto`,
      headers: { cookie: cookieAdmin }
    });
    expect(remocao.statusCode).toBe(204);
    await expect(
      consultarUm("select id from produtos where id = $1 and foto_url is not null", [produtoDaA])
    ).resolves.toBeFalsy();
  });

  it("Deve_Recusar_Quando_TipoNaoEImagemAceita", async () => {
    // Extensao mentirosa: o nome diz .png, o MIME diz PDF. Vale o MIME.
    const resposta = await enviarFoto(cookieAdmin, produtoDaA, "documento.png", "application/pdf");
    assertProblem(resposta, 400, "INVALID_PHOTO");
  });

  it("Deve_Recusar_Quando_ArquivoAcimaDoTeto", async () => {
    const gigante = Buffer.alloc(9 * 1024 * 1024, 1);
    const resposta = await enviarFoto(cookieAdmin, produtoDaA, "grande.png", "image/png", gigante);
    assertProblem(resposta, 400, "INVALID_PHOTO");
  });

  it("Deve_Retornar404_Quando_ProdutoEDeOutraEmpresa", async () => {
    const resposta = await enviarFoto(cookieAdmin, produtoDaB, "foto.png", "image/png");
    assertProblem(resposta, 404, "NOT_FOUND");
    // E nada foi gravado na vitima.
    await expect(
      consultarUm("select id from produtos where id = $1 and foto_url is not null", [produtoDaB])
    ).resolves.toBeFalsy();
  });

  it("Deve_Retornar404_Quando_ProdutoNaoExiste", async () => {
    const resposta = await enviarFoto(cookieAdmin, "99999999-9999-4999-8999-999999999997", "foto.png", "image/png");
    assertProblem(resposta, 404, "NOT_FOUND");
  });

  it("Deve_Retornar403_Quando_SemPermissaoDeEscrita", async () => {
    const resposta = await enviarFoto(cookieSemPermissao, produtoDaA, "foto.png", "image/png");
    assertProblem(resposta, 403);
  });

  it("Deve_Retornar403_Quando_SemPermissaoDeLeitura", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${produtoDaA}/foto`,
      headers: { cookie: cookieSemPermissao }
    });
    assertProblem(resposta, 403);
  });

  it("Deve_Recusar_Quando_ProdutoNaoTemFoto", async () => {
    const semFoto = await criarProduto(cookieAdmin, idsTeste.empresaA, "Produto sem foto nenhuma", "sfn");
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/${semFoto}/foto`,
      headers: { cookie: cookieAdmin }
    });
    assertProblem(resposta, 400, "INVALID_PHOTO");
  });
});

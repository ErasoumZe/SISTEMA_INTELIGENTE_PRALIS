import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";
import { planilhaFalsaComoExcel } from "../../unit/apoio/xlsx-falso.js";

// Multipart cru: e assim que a tela envia (FormData com `fetch`), e o `inject` do Fastify aceita o
// corpo pronto. O arquivo e binario, entao o corpo e montado com Buffer, nao com join de strings.
function multipartXlsx(nome: string, arquivo: Buffer) {
  const boundary = `----padaria-${Date.now()}`;
  const cabecalho = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="arquivo"; filename="${nome}"`,
      "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "",
      ""
    ].join("\r\n")
  );
  const rodape = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { boundary, corpo: Buffer.concat([cabecalho, arquivo, rodape]) };
}

// Produto com a MESMA descricao do produto do seed: e o que cria ambiguidade real de dois candidatos
// no pareamento por descricao.
const PRODUTO_GEMEO = "11111111-1111-4111-8111-1111111199a1";

describe("fundacao do novo Compras integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql("delete from fornecedores_produtos where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos_precos_base where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base where empresa_id = $1", [idsTeste.empresaA]);
  }, 120_000);

  afterAll(async () => {
    // Limpeza aqui, e nao so no corpo dos casos: a suite compartilha um banco entre arquivos, e uma
    // assertiva que falha no meio deixaria o produto gemeo (descricao duplicada) na empresa A para
    // todos os testes seguintes.
    await executarSql("delete from produtos_precos_base where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from fornecedores_produtos where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos where id = $1", [PRODUTO_GEMEO]);
    await contexto.fechar();
  });

  it("cria catalogo aprovado com evento e impede duplicidade", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/catalogo-fornecedores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        fornecedorId: idsTeste.fornecedor,
        produtoId: idsTeste.produto,
        precoOfertado: 12.34
      }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<{ data: { id: string } }>(criado).data.id;
    await expect(
      consultarUm(
        "select fp.id from fornecedores_produtos fp join fornecedores_produtos_eventos e on e.fornecedor_produto_id = fp.id where fp.id = $1 and fp.status = 'aprovado' and e.status_novo = 'aprovado'",
        [id]
      )
    ).resolves.toBeTruthy();

    const duplicado = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/catalogo-fornecedores",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        fornecedorId: idsTeste.fornecedor,
        produtoId: idsTeste.produto
      }
    });
    expect(duplicado.statusCode).toBe(409);
  });

  it("analisa e aplica uma unica vez o preco-base inicial", async () => {
    const produto = await consultarUm<{ descricao: string; codigo: string | null }>(
      "select descricao, codigo from produtos where id = $1",
      [idsTeste.produto]
    );
    expect(produto).toBeTruthy();
    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nomeArquivo: "base-e2e.xlsx",
        hashArquivo: "f".repeat(64),
        linhas: [
          {
            numeroLinha: 2,
            codigo: produto!.codigo,
            descricao: produto!.descricao,
            ultimoMenorCusto: 9.87
          }
        ]
      }
    });
    expect(analisada.statusCode, analisada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;

    const aplicada = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(aplicada.statusCode, aplicada.body).toBe(200);
    const base = await consultarUm<{ valor: string }>(
      "select valor from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(base?.valor)).toBe(9.87);

    const repetida = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(repetida.statusCode).toBe(409);
    // O codigo importa: 409 aqui pode vir de DOIS ramos diferentes ("esta importacao ja foi
    // finalizada" e "esta empresa ja importou"). Sem checar o codigo, o teste nao distingue qual
    // regra esta sendo provada — e a regra "uma unica vez por empresa" tem teste proprio abaixo.
    expect(json<{ code?: string }>(repetida).code).toBe("PRICE_BASE_IMPORT_ALREADY_FINISHED");
  });

  // R-218 / doc 53: "ambiguidades e produtos nao encontrados bloqueiam a aplicacao; nao existe
  // gravacao silenciosa por aproximacao". O ramo de pendencia nao tinha teste nenhum: a cobertura
  // existente mandava uma linha que casava 1:1.
  it("bloqueia a aplicacao quando ha ambiguidade ou produto nao encontrado", async () => {
    const produto = await consultarUm<{ descricao: string }>("select descricao from produtos where id = $1", [
      idsTeste.produto
    ]);
    // Segundo produto com a MESMA descricao: e o que cria ambiguidade real de dois candidatos.
    await executarSql(
      "insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing",
      [
        PRODUTO_GEMEO,
        idsTeste.empresaA,
        idsTeste.grupoMercadoriaInsumos,
        idsTeste.unidade,
        "PROD-INT-GEMEO",
        produto!.descricao
      ]
    );

    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nomeArquivo: "base-pendencias.xlsx",
        hashArquivo: "a".repeat(64),
        linhas: [
          // Sem codigo: cai no pareamento por descricao e acha os DOIS produtos.
          { numeroLinha: 2, codigo: null, descricao: produto!.descricao, ultimoMenorCusto: 5 },
          { numeroLinha: 3, codigo: null, descricao: "PRODUTO QUE NAO EXISTE NO CADASTRO", ultimoMenorCusto: 7 }
        ]
      }
    });
    expect(analisada.statusCode, analisada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/precos-base/importacoes/${importacaoId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    const corpo = json<{
      data: { totalAmbiguidades: number; totalNaoEncontrados: number; itens: Array<{ resultado: string }> };
    }>(detalhe).data;
    expect(corpo.totalAmbiguidades).toBe(1);
    expect(corpo.totalNaoEncontrados).toBe(1);
    expect(corpo.itens.map((item) => item.resultado).sort()).toEqual(["ambiguidade", "nao_encontrado"]);

    const aplicada = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(aplicada.statusCode, aplicada.body).toBe(400);
    expect(json<{ code?: string }>(aplicada).code).toBe("PRICE_BASE_IMPORT_HAS_PENDING_ROWS");
    // Nada do arquivo com pendencia pode ter entrado: nem a linha ambigua, nem a que casou.
    await expect(
      consultarUm("select id from produtos_precos_base where empresa_id = $1 and produto_id = $2", [
        idsTeste.empresaA,
        PRODUTO_GEMEO
      ])
    ).resolves.toBeNull();

    await executarSql("delete from compras_importacoes_preco_base where id = $1", [importacaoId]);
    await executarSql("delete from produtos where id = $1", [PRODUTO_GEMEO]);
  });

  // O mesmo produto em duas linhas passava como duas correspondencias e a aplicacao tentava gravar
  // dois precos vigentes para ele, violando `produtos_precos_base_atual_unico_idx`: 500 "Erro
  // interno", sem dizer ao operador qual produto esta repetido na planilha.
  it("trata produto repetido na planilha como ambiguidade, nao como erro interno", async () => {
    const produto = await consultarUm<{ descricao: string; codigo: string | null }>(
      "select descricao, codigo from produtos where id = $1",
      [idsTeste.produto]
    );
    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nomeArquivo: "base-repetida.xlsx",
        hashArquivo: "b".repeat(64),
        linhas: [
          { numeroLinha: 2, codigo: produto!.codigo, descricao: produto!.descricao, ultimoMenorCusto: 4 },
          { numeroLinha: 9, codigo: produto!.codigo, descricao: produto!.descricao, ultimoMenorCusto: 6 }
        ]
      }
    });
    expect(analisada.statusCode, analisada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/precos-base/importacoes/${importacaoId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    const itens = json<{ data: { itens: Array<{ resultado: string; detalhe: string | null }> } }>(detalhe).data.itens;
    expect(itens.map((item) => item.resultado)).toEqual(["ambiguidade", "ambiguidade"]);
    // O motivo precisa apontar as linhas: e com isso que o operador corrige a planilha.
    expect(itens[0]?.detalhe).toContain("2, 9");

    const aplicada = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(aplicada.statusCode, aplicada.body).toBe(400);
    expect(json<{ code?: string }>(aplicada).code).toBe("PRICE_BASE_IMPORT_HAS_PENDING_ROWS");

    await executarSql("delete from compras_importacoes_preco_base where id = $1", [importacaoId]);
  });

  // Decisao do catalogo: a doc 53 promete evento imutavel com ator e observacao em TODA mudanca de
  // estado. Somente a criacao tinha teste; a rota de decisao nao tinha nenhum.
  it("registra evento com ator e observacao ao rejeitar um vinculo do catalogo", async () => {
    const vinculo = await consultarUm<{ id: string }>(
      "select id from fornecedores_produtos where empresa_id = $1 and fornecedor_id = $2 and produto_id = $3",
      [idsTeste.empresaA, idsTeste.fornecedor, idsTeste.produto]
    );
    expect(vinculo, "o vinculo criado no primeiro teste deveria existir").toBeTruthy();

    const decidida = await contexto.app.inject({
      method: "PUT",
      url: `/api/compras/catalogo-fornecedores/${vinculo!.id}/decisao`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, status: "rejeitado", observacao: "fornecedor nao entrega na regiao" }
    });
    expect(decidida.statusCode, decidida.body).toBe(204);

    const evento = await consultarUm<{ status_anterior: string; ator_tipo: string; usuario_id: string | null }>(
      "select status_anterior, ator_tipo, usuario_id from fornecedores_produtos_eventos where fornecedor_produto_id = $1 and status_novo = 'rejeitado'",
      [vinculo!.id]
    );
    expect(evento?.status_anterior).toBe("aprovado");
    expect(evento?.ator_tipo).toBe("usuario");
    expect(evento?.usuario_id).toBeTruthy();
    await expect(
      consultarUm("select id from fornecedores_produtos where id = $1 and status = 'rejeitado'", [vinculo!.id])
    ).resolves.toBeTruthy();
  });

  // Isolamento por empresa: o `exigirEmpresa` de cada operacao e as FKs compostas da migration 0060
  // nunca eram exercitados pelo lado negativo. O admin do seed pertence somente a empresa A.
  it("recusa catalogo e preco-base de outra empresa", async () => {
    const listagem = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/catalogo-fornecedores?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    expect(listagem.statusCode).toBe(403);
    expect(json<{ code?: string }>(listagem).code).toBe("FORBIDDEN_COMPANY");

    const criacao = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/catalogo-fornecedores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaB, fornecedorId: idsTeste.fornecedor, produtoId: idsTeste.produto }
    });
    expect(criacao.statusCode).toBe(403);

    const precos = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/precos-base?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    expect(precos.statusCode).toBe(403);
  });

  it("nega as rotas da fundacao a quem nao tem a permissao", async () => {
    const cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    const listagem = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/catalogo-fornecedores?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieSemPermissao }
    });
    expect(listagem.statusCode).toBe(403);

    const importacoes = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/precos-base/importacoes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieSemPermissao }
    });
    expect(importacoes.statusCode).toBe(403);
  });

  // A regra da carga inicial e "uma unica vez POR EMPRESA" (R-218), nao "uma vez por arquivo".
  // Este e o ramo `ja_importada`, que o teste anterior nao alcancava.
  it("recusa uma segunda importacao depois de a empresa ja ter aplicado a carga inicial", async () => {
    const produto = await consultarUm<{ descricao: string; codigo: string | null }>(
      "select descricao, codigo from produtos where id = $1",
      [idsTeste.produto]
    );
    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nomeArquivo: "base-segunda.xlsx",
        hashArquivo: "c".repeat(64),
        linhas: [{ numeroLinha: 2, codigo: produto!.codigo, descricao: produto!.descricao, ultimoMenorCusto: 11.11 }]
      }
    });
    expect(analisada.statusCode, analisada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;

    const aplicada = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(aplicada.statusCode, aplicada.body).toBe(409);
    expect(json<{ code?: string }>(aplicada).code).toBe("PRICE_BASE_ALREADY_IMPORTED");
    // E o preco vigente continua o da carga valida, nao o da tentativa recusada.
    const base = await consultarUm<{ valor: string }>(
      "select valor from produtos_precos_base where empresa_id = $1 and produto_id = $2 and valido_ate is null",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(base?.valor)).toBe(9.87);
  });

  // Sem o descarte, a carga inicial fica travada para sempre quando a planilha tem pendencia: a
  // unicidade `(empresa_id, hash_arquivo)` reserva o arquivo, e o fluxo normal e corrigir o cadastro
  // e reenviar o MESMO .xlsx.
  it("descarta analise com pendencia e libera o arquivo para reenvio", async () => {
    const payload = {
      empresaId: idsTeste.empresaA,
      nomeArquivo: "base-descartada.xlsx",
      hashArquivo: "e".repeat(64),
      linhas: [{ numeroLinha: 2, codigo: null, descricao: "PRODUTO INEXISTENTE", ultimoMenorCusto: 3 }]
    };
    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload
    });
    expect(analisada.statusCode, analisada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;

    // Com o arquivo reservado, reenviar o mesmo hash e recusado.
    const bloqueada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload
    });
    expect(bloqueada.statusCode).toBe(409);

    const descartada = await contexto.app.inject({
      method: "DELETE",
      url: `/api/compras/precos-base/importacoes/${importacaoId}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(descartada.statusCode, descartada.body).toBe(204);
    // Os itens saem por cascade: nao sobra lixo apontando para uma importacao que nao existe.
    const sobrou = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_importacoes_preco_base_itens where importacao_id = $1",
      [importacaoId]
    );
    expect(Number(sobrou?.total)).toBe(0);

    // E agora o mesmo arquivo pode ser reenviado, que e o ponto do descarte.
    const reenviada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload
    });
    expect(reenviada.statusCode, reenviada.body).toBe(201);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [
      json<{ data: { id: string } }>(reenviada).data.id
    ]);
  });

  it("recusa descartar importacao ja aplicada, que e a procedencia do preco vigente", async () => {
    const aplicada = await consultarUm<{ id: string }>(
      "select id from compras_importacoes_preco_base where empresa_id = $1 and status = 'aplicada'",
      [idsTeste.empresaA]
    );
    expect(aplicada, "o teste da aplicacao deveria ter deixado uma importacao aplicada").toBeTruthy();
    const recusada = await contexto.app.inject({
      method: "DELETE",
      url: `/api/compras/precos-base/importacoes/${aplicada!.id}?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(recusada.statusCode).toBe(409);
    expect(json<{ code?: string }>(recusada).code).toBe("PRICE_BASE_IMPORT_ALREADY_FINISHED");
  });

  // R-220: produto inativo fora do pareamento. Um inativo com a mesma descricao do ativo criava
  // ambiguidade que o operador nao tinha como resolver, porque a planilha estava certa.
  it("ignora produto inativo no pareamento", async () => {
    const produto = await consultarUm<{ descricao: string }>("select descricao from produtos where id = $1", [
      idsTeste.produto
    ]);
    await executarSql(
      "insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao, status) values ($1, $2, $3, $4, $5, $6, 'inativo') on conflict (id) do nothing",
      [
        PRODUTO_GEMEO,
        idsTeste.empresaA,
        idsTeste.grupoMercadoriaInsumos,
        idsTeste.unidade,
        "PROD-INT-INATIVO",
        produto!.descricao
      ]
    );
    try {
      const analisada = await contexto.app.inject({
        method: "POST",
        url: "/api/compras/precos-base/importacoes/analisar",
        headers: { cookie: cookieAdmin },
        payload: {
          empresaId: idsTeste.empresaA,
          nomeArquivo: "base-inativo.xlsx",
          hashArquivo: "f".repeat(63) + "a",
          linhas: [{ numeroLinha: 2, codigo: null, descricao: produto!.descricao, ultimoMenorCusto: 3 }]
        }
      });
      expect(analisada.statusCode, analisada.body).toBe(201);
      const importacaoId = json<{ data: { id: string } }>(analisada).data.id;
      // Dois produtos com a mesma descricao, mas um inativo: sobra UM candidato, nao ambiguidade.
      const item = await consultarUm<{ resultado: string; produto_id: string | null }>(
        "select resultado, produto_id from compras_importacoes_preco_base_itens where importacao_id = $1",
        [importacaoId]
      );
      expect(item?.resultado).toBe("correspondencia");
      expect(item?.produto_id).toBe(idsTeste.produto);
      await executarSql("delete from compras_importacoes_preco_base where id = $1", [importacaoId]);
    } finally {
      await executarSql("delete from produtos where id = $1", [PRODUTO_GEMEO]);
    }
  });

  it("recusa decisao que nao muda o estado do vinculo", async () => {
    const vinculo = await consultarUm<{ id: string; status: string }>(
      "select id, status from fornecedores_produtos where empresa_id = $1 and fornecedor_id = $2 and produto_id = $3",
      [idsTeste.empresaA, idsTeste.fornecedor, idsTeste.produto]
    );
    expect(vinculo).toBeTruthy();
    const repetida = await contexto.app.inject({
      method: "PUT",
      url: `/api/compras/catalogo-fornecedores/${vinculo!.id}/decisao`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, status: vinculo!.status }
    });
    expect(repetida.statusCode).toBe(409);
    expect(json<{ code?: string }>(repetida).code).toBe("SUPPLIER_PRODUCT_STATUS_UNCHANGED");
  });

  // A rota de UPLOAD e a unica que a tela chama, e era a unica sem teste: a cobertura toda batia no
  // endpoint JSON. Aqui o .xlsx vai no formato que o Excel grava (deflate + sharedStrings).
  it("analisa a planilha enviada por upload, no formato que o Excel grava", async () => {
    const produto = await consultarUm<{ descricao: string; codigo: string | null }>(
      "select descricao, codigo from produtos where id = $1",
      [idsTeste.produto]
    );
    const arquivo = planilhaFalsaComoExcel([
      ["Relatorio de discriminacao"],
      ["CODIGO", "DESCRIÇÃO", "ÚLTIMO MENOR CUSTO"],
      [produto!.codigo ?? "", produto!.descricao, "R$ 7,50"]
    ]);
    const { boundary, corpo } = multipartXlsx("discriminacao.xlsx", arquivo);

    const enviada = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(enviada.statusCode, enviada.body).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(enviada).data.id;

    const linha = await consultarUm<{ valor_informado: string; resultado: string; nome_arquivo: string }>(
      "select i.valor_informado, i.resultado, m.nome_arquivo from compras_importacoes_preco_base_itens i join compras_importacoes_preco_base m on m.id = i.importacao_id where i.importacao_id = $1",
      [importacaoId]
    );
    expect(Number(linha?.valor_informado)).toBe(7.5);
    expect(linha?.resultado).toBe("correspondencia");
    expect(linha?.nome_arquivo).toBe("discriminacao.xlsx");

    await executarSql("delete from compras_importacoes_preco_base where id = $1", [importacaoId]);
  });

  it("recusa upload que nao e .xlsx e arquivo que nao e um ZIP", async () => {
    const extensao = multipartXlsx("base.xls", Buffer.from("qualquer coisa"));
    const recusadaPorExtensao = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${extensao.boundary}` },
      payload: extensao.corpo
    });
    expect(recusadaPorExtensao.statusCode).toBe(400);
    expect(json<{ code?: string }>(recusadaPorExtensao).code).toBe("PRICE_BASE_FILE_TYPE");

    // Acima de 50 MB: a mensagem diz o motivo (antes: "Requisição inválida", sem pista do tamanho).
    // O teto era 10 MB ate 29/10/2026; o backup do cadastro de produtos tem 10,9 MB.
    const grande = multipartXlsx("base.xlsx", Buffer.alloc(50 * 1024 * 1024 + 1024));
    const recusadaPorTamanho = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${grande.boundary}` },
      payload: grande.corpo
    });
    expect(recusadaPorTamanho.statusCode).toBe(413);
    expect(json<{ code?: string; title?: string }>(recusadaPorTamanho)).toMatchObject({
      code: "FILE_TOO_LARGE",
      title:
        "Arquivo grande demais para este envio. Planilhas e backups aceitam até 50 MB; fotos e comprovantes, menos."
    });

    // 11 MB estourava o teto antigo de 10 MB: agora chega ao leitor, que recusa por nao ser um ZIP.
    const acimaDoTetoAntigo = multipartXlsx("base.xlsx", Buffer.alloc(11 * 1024 * 1024));
    const lidaAcimaDoTetoAntigo = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${acimaDoTetoAntigo.boundary}` },
      payload: acimaDoTetoAntigo.corpo
    });
    expect(lidaAcimaDoTetoAntigo.statusCode, lidaAcimaDoTetoAntigo.body).toBe(400);
    expect(json<{ code?: string }>(lidaAcimaDoTetoAntigo).code).not.toBe("FILE_TOO_LARGE");

    // Extensao certa e conteudo invalido: antes virava 500 "Erro interno" com alerta no Sentry.
    const conteudo = multipartXlsx("base.xlsx", Buffer.from("isto nao e um zip"));
    const recusadaPorConteudo = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${conteudo.boundary}` },
      payload: conteudo.corpo
    });
    expect(recusadaPorConteudo.statusCode).toBe(400);
    expect(json<{ code?: string }>(recusadaPorConteudo).code).toBe("PRICE_BASE_FILE_INVALID");
  });

  // O INSERT unico estourava os 65.535 parametros do protocolo do Postgres em ~6.550 linhas, bem
  // abaixo do teto de 50.000 que o contrato aceita: uma planilha de 7.000 linhas morria com 500.
  it("analisa volume acima do limite de parametros de um INSERT unico", async () => {
    const linhas = Array.from({ length: 7_000 }, (_, indice) => ({
      numeroLinha: indice + 2,
      codigo: `VOL-${indice}`,
      descricao: `Produto de volume ${indice}`,
      ultimoMenorCusto: 1.23
    }));
    const analisada = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nomeArquivo: "base-volume.xlsx",
        hashArquivo: "d".repeat(64),
        linhas
      }
    });
    expect(analisada.statusCode, analisada.body.slice(0, 300)).toBe(201);
    const importacaoId = json<{ data: { id: string } }>(analisada).data.id;
    const total = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_importacoes_preco_base_itens where importacao_id = $1",
      [importacaoId]
    );
    expect(Number(total?.total)).toBe(7_000);

    await executarSql("delete from compras_importacoes_preco_base where id = $1", [importacaoId]);
  });

  it("recusa o mesmo arquivo analisado duas vezes", async () => {
    const produto = await consultarUm<{ descricao: string; codigo: string | null }>(
      "select descricao, codigo from produtos where id = $1",
      [idsTeste.produto]
    );
    const payload = {
      empresaId: idsTeste.empresaA,
      nomeArquivo: "base-segunda.xlsx",
      hashArquivo: "c".repeat(64),
      linhas: [{ numeroLinha: 2, codigo: produto!.codigo, descricao: produto!.descricao, ultimoMenorCusto: 11.11 }]
    };
    const repetida = await contexto.app.inject({
      method: "POST",
      url: "/api/compras/precos-base/importacoes/analisar",
      headers: { cookie: cookieAdmin },
      payload
    });
    expect(repetida.statusCode).toBe(409);
    expect(json<{ code?: string }>(repetida).code).toBe("PRICE_BASE_FILE_ALREADY_ANALYZED");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// R-222 (PROJECT_BRAIN/55): historico de compras por fornecedor x produto. A planilha entra por CSV
// (pt-BR, ponto e virgula), e o teste percorre o ciclo inteiro: analisar -> aplicar -> apelido ->
// cadastrar -> reaplicar sem duplicar -> catalogo (cria/aprova/respeita rejeitado) -> consulta.

const FORNECEDOR_DO_APELIDO = "11111111-1111-4111-8111-1111111199b1";
const FORNECEDOR_SEED = "Fornecedor Integracao";
const PRODUTO_SEED = "Produto Integracao";

/** `dd/mm/aa` de N dias atras: o teste nao pode apodrecer quando a janela de 3 meses andar. */
function diasAtras(dias: number): string {
  const data = new Date(Date.now() - dias * 86_400_000);
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${String(data.getUTCFullYear()).slice(-2)}`;
}

function csv(linhas: string[][]): Buffer {
  const cabecalho = ["REFERÊNCIA", "PRODUTOS", "QUANT", "VALOR CUSTO UN", "DATA REF", "CONFRONTAR"];
  return Buffer.from([cabecalho, ...linhas].map((linha) => linha.join(";")).join("\r\n"), "utf8");
}

function compra(
  fornecedor: string,
  produto: string,
  dias: number,
  quantidade: string,
  custo: string,
  confronto = "CONFRONTADO"
) {
  return [`${fornecedor} - ${diasAtras(dias)} - 100`, produto, quantidade, custo, diasAtras(dias), confronto];
}

function multipart(nome: string, arquivo: Buffer) {
  const boundary = `----padaria-historico-${Date.now()}`;
  const cabecalho = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: text/csv\r\n\r\n`
  );
  return { boundary, corpo: Buffer.concat([cabecalho, arquivo, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}

describe("historico de compras por fornecedor e produto integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  const limpar = async () => {
    await executarSql("delete from compras_historico_precos where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_historico_importacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from fornecedores_aliases where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from fornecedores_produtos where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from fornecedores where empresa_id = $1 and nome in ($2, $3)", [
      idsTeste.empresaA,
      "FORNECEDOR NOVO TESTE",
      "Fornecedor Real do Apelido"
    ]);
  };

  async function analisar(nome: string, arquivo: Buffer, cookie = cookieAdmin, empresaId: string = idsTeste.empresaA) {
    const { boundary, corpo } = multipart(nome, arquivo);
    return contexto.app.inject({
      method: "POST",
      url: `/api/compras/historico/importacoes/analisar-arquivo?empresaId=${empresaId}`,
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
  }
  const detalhe = async (id: string) =>
    json<{
      data: {
        totalPendentes: number;
        totalAplicadas: number;
        status: string;
        porResultado: Record<string, number>;
        fornecedoresPendentes: Array<{ fornecedorNormalizado: string; fornecedorInformado: string; linhas: number }>;
        previa: { criar: number; aprovar: number; jaAprovados: number; rejeitadosIgnorados: number };
      };
    }>(
      await contexto.app.inject({
        method: "GET",
        url: `/api/compras/historico/importacoes/${id}?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieAdmin }
      })
    ).data;
  const acao = (id: string, rota: string, payload: Record<string, unknown> = {}) =>
    contexto.app.inject({
      method: "POST",
      url: `/api/compras/historico/importacoes/${id}/${rota}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, ...payload }
    });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await limpar();
    await executarSql("insert into fornecedores (id, empresa_id, nome) values ($1, $2, $3)", [
      FORNECEDOR_DO_APELIDO,
      idsTeste.empresaA,
      "Fornecedor Real do Apelido"
    ]);
  }, 120_000);

  afterAll(async () => {
    await limpar();
    await contexto.fechar();
  });

  let importacaoId = "";

  it("analisa o CSV e separa pareadas, pendencias e invalidas sem gravar historico", async () => {
    const arquivo = csv([
      compra(FORNECEDOR_SEED, PRODUTO_SEED, 40, "10,5", "4,308"),
      compra(FORNECEDOR_SEED, PRODUTO_SEED, 10, "5", "5,10"),
      compra(FORNECEDOR_SEED, PRODUTO_SEED, 200, "2", "3,00"),
      compra("APELIDO FORN LTDA", PRODUTO_SEED, 5, "1", "9,99"),
      compra("FORNECEDOR NOVO TESTE", PRODUTO_SEED, 3, "1", "8,00"),
      compra(FORNECEDOR_SEED, "PRODUTO QUE NAO EXISTE XYZ", 2, "1", "2,00"),
      compra(FORNECEDOR_SEED, PRODUTO_SEED, 1, "1", "7,00", "NÃO CONFRONTADO")
    ]);
    const resposta = await analisar("discriminacao.csv", arquivo);
    expect(resposta.statusCode, resposta.body).toBe(201);
    importacaoId = json<{ data: { id: string } }>(resposta).data.id;

    const lido = await detalhe(importacaoId);
    expect(lido.porResultado).toMatchObject({
      correspondencia: 3,
      fornecedor_nao_encontrado: 2,
      produto_nao_encontrado: 1,
      invalido: 1
    });
    expect(lido.fornecedoresPendentes.map((linha) => linha.fornecedorNormalizado).sort()).toEqual([
      "APELIDO FORN LTDA",
      "FORNECEDOR NOVO TESTE"
    ]);
    // Antes de aplicar: o relatorio diz o que vai acontecer com o catalogo, e nada foi gravado.
    expect(lido.previa).toMatchObject({ criar: 1, aprovar: 0, jaAprovados: 0, rejeitadosIgnorados: 0 });
    const gravadas = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_historico_precos where empresa_id = $1",
      [idsTeste.empresaA]
    );
    expect(Number(gravadas?.total)).toBe(0);
  });

  it("recusa o mesmo arquivo duas vezes (409) e extensao que nao e planilha", async () => {
    const arquivo = csv([compra(FORNECEDOR_SEED, PRODUTO_SEED, 40, "10,5", "4,308")]);
    const primeira = await analisar("uma-linha.csv", arquivo);
    expect(primeira.statusCode, primeira.body).toBe(201);
    const repetida = await analisar("uma-linha.csv", arquivo);
    expect(repetida.statusCode).toBe(409);
    expect(json<{ code?: string }>(repetida).code).toBe("PURCHASE_HISTORY_FILE_ALREADY_ANALYZED");
    const texto = await analisar("historico.txt", arquivo);
    expect(texto.statusCode).toBe(400);
    expect(json<{ code?: string }>(texto).code).toBe("PURCHASE_HISTORY_FILE_TYPE");
    await executarSql("delete from compras_historico_importacoes where nome_arquivo = 'uma-linha.csv'");
  });

  it("aplica so as pareadas, cria o vinculo aprovado com o ultimo custo e nao duplica ao reaplicar", async () => {
    const aplicada = await acao(importacaoId, "aplicar");
    expect(aplicada.statusCode, aplicada.body).toBe(200);
    expect(json<{ data: Record<string, number> }>(aplicada).data).toMatchObject({
      aplicadas: 3,
      pendentes: 4,
      vinculosCriados: 1,
      vinculosAprovados: 0
    });

    const vinculo = await consultarUm<{ status: string; origem: string; preco: string; evento_ator: string }>(
      `select fp.status, fp.origem, fp.preco_ofertado as preco, e.ator_tipo as evento_ator
         from fornecedores_produtos fp join fornecedores_produtos_eventos e on e.fornecedor_produto_id = fp.id
        where fp.empresa_id = $1 and fp.fornecedor_id = $2 and fp.produto_id = $3`,
      [idsTeste.empresaA, idsTeste.fornecedor, idsTeste.produto]
    );
    // O preco do vinculo e o da compra MAIS RECENTE (5,10, ha 10 dias), nao o da ultima linha da planilha.
    expect(vinculo).toMatchObject({ status: "aprovado", origem: "compras", evento_ator: "sistema" });
    expect(Number(vinculo?.preco)).toBe(5.1);

    const repetida = await acao(importacaoId, "aplicar");
    expect(repetida.statusCode, repetida.body).toBe(200);
    expect(json<{ data: Record<string, number> }>(repetida).data).toMatchObject({ aplicadas: 0, vinculosCriados: 0 });
    const linhas = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_historico_precos where empresa_id = $1",
      [idsTeste.empresaA]
    );
    expect(Number(linhas?.total)).toBe(3);
  });

  it("resolve fornecedor por apelido e por cadastro novo, e reaplica so o que faltava", async () => {
    const associado = await acao(importacaoId, "fornecedores/associar", {
      fornecedorNormalizado: "APELIDO FORN LTDA",
      fornecedorId: FORNECEDOR_DO_APELIDO
    });
    expect(associado.statusCode, associado.body).toBe(204);
    const cadastrado = await acao(importacaoId, "fornecedores/cadastrar", {
      fornecedorNormalizado: "FORNECEDOR NOVO TESTE"
    });
    expect(cadastrado.statusCode, cadastrado.body).toBe(204);

    const novo = await consultarUm<{ nome: string; situacao: string }>(
      "select nome, situacao from fornecedores where empresa_id = $1 and nome = 'FORNECEDOR NOVO TESTE'",
      [idsTeste.empresaA]
    );
    expect(novo).toMatchObject({ situacao: "ativo" });

    const lido = await detalhe(importacaoId);
    expect(lido.porResultado).toMatchObject({ correspondencia: 5, produto_nao_encontrado: 1, invalido: 1 });
    expect(lido.fornecedoresPendentes).toEqual([]);

    const aplicada = await acao(importacaoId, "aplicar");
    expect(json<{ data: Record<string, number> }>(aplicada).data).toMatchObject({
      aplicadas: 2,
      pendentes: 2,
      vinculosCriados: 2
    });
    const total = await consultarUm<{ total: string }>(
      "select count(*)::text as total from compras_historico_precos where empresa_id = $1",
      [idsTeste.empresaA]
    );
    expect(Number(total?.total)).toBe(5);
    // O apelido fica: a proxima planilha com o mesmo nome ja pareia sozinha.
    const alias = await consultarUm<{ fornecedor_id: string }>(
      "select fornecedor_id from fornecedores_aliases where empresa_id = $1 and alias_normalizado = 'APELIDO FORN LTDA'",
      [idsTeste.empresaA]
    );
    expect(alias?.fornecedor_id).toBe(FORNECEDOR_DO_APELIDO);
  });

  it("consulta o ultimo custo, o menor e o maior por fornecedor na janela escolhida", async () => {
    const consulta = async (meses: number) =>
      json<{
        data: {
          total: number;
          linhas: Array<{
            fornecedorNome: string;
            compras: number;
            ultimoCusto: string;
            menorCusto: string;
            maiorCusto: string;
          }>;
        };
      }>(
        await contexto.app.inject({
          method: "GET",
          url: `/api/compras/historico/resumo?empresaId=${idsTeste.empresaA}&meses=${meses}&produtoId=${idsTeste.produto}`,
          headers: { cookie: cookieAdmin }
        })
      ).data;

    const tres = await consulta(3);
    const seed = tres.linhas.find((linha) => linha.fornecedorNome === FORNECEDOR_SEED);
    // Ha 200 dias fica fora de 3 meses; 40 e 10 dias entram.
    expect(seed).toMatchObject({ compras: 2 });
    expect(Number(seed?.ultimoCusto)).toBe(5.1);
    expect(Number(seed?.menorCusto)).toBe(4.308);
    expect(Number(seed?.maiorCusto)).toBe(5.1);
    expect(tres.total).toBe(3);

    const doze = await consulta(12);
    const seedDoze = doze.linhas.find((linha) => linha.fornecedorNome === FORNECEDOR_SEED);
    expect(seedDoze).toMatchObject({ compras: 3 });
    expect(Number(seedDoze?.menorCusto)).toBe(3);
  });

  it("aprova vinculo pendente e nunca toca no rejeitado, mas grava o historico dos dois", async () => {
    await executarSql(
      "update fornecedores_produtos set status = 'rejeitado' where empresa_id = $1 and fornecedor_id = $2",
      [idsTeste.empresaA, idsTeste.fornecedor]
    );
    await executarSql(
      "update fornecedores_produtos set status = 'pendente' where empresa_id = $1 and fornecedor_id = $2",
      [idsTeste.empresaA, FORNECEDOR_DO_APELIDO]
    );
    const segunda = await analisar(
      "segunda.csv",
      csv([
        compra(FORNECEDOR_SEED, PRODUTO_SEED, 20, "1", "4,00"),
        compra("APELIDO FORN LTDA", PRODUTO_SEED, 15, "1", "9,50")
      ])
    );
    expect(segunda.statusCode, segunda.body).toBe(201);
    const id = json<{ data: { id: string } }>(segunda).data.id;
    // O apelido de antes pareia sozinho: nao precisa associar de novo.
    expect((await detalhe(id)).previa).toMatchObject({ criar: 0, aprovar: 1, rejeitadosIgnorados: 1 });

    const aplicada = await acao(id, "aplicar");
    expect(json<{ data: Record<string, number> }>(aplicada).data).toMatchObject({
      aplicadas: 2,
      vinculosCriados: 0,
      vinculosAprovados: 1,
      vinculosRejeitadosIgnorados: 1
    });
    const estados = await consultarTodos<{ fornecedor_id: string; status: string }>(
      "select fornecedor_id, status from fornecedores_produtos where empresa_id = $1 and fornecedor_id in ($2, $3)",
      [idsTeste.empresaA, idsTeste.fornecedor, FORNECEDOR_DO_APELIDO]
    );
    expect(Object.fromEntries(estados.map((linha) => [linha.fornecedor_id, linha.status]))).toEqual({
      [idsTeste.fornecedor]: "rejeitado",
      [FORNECEDOR_DO_APELIDO]: "aprovado"
    });
  });

  it("nao altera o preco-base e cancela so o que ainda nao foi aplicado", async () => {
    const base = await consultarUm<{ total: string }>(
      "select count(*)::text as total from produtos_precos_base where empresa_id = $1 and produto_id = $2",
      [idsTeste.empresaA, idsTeste.produto]
    );
    expect(Number(base?.total)).toBe(0);

    const aplicadaNaoCancela = await acao(importacaoId, "cancelar");
    expect(aplicadaNaoCancela.statusCode).toBe(409);
    const nova = await analisar("cancelar.csv", csv([compra(FORNECEDOR_SEED, PRODUTO_SEED, 30, "1", "6,00")]));
    const id = json<{ data: { id: string } }>(nova).data.id;
    expect((await acao(id, "cancelar")).statusCode).toBe(204);
    expect((await acao(id, "aplicar")).statusCode).toBe(409);
  });

  it("isola por empresa e por permissao", async () => {
    const outraEmpresa = await analisar(
      "b.csv",
      csv([compra(FORNECEDOR_SEED, PRODUTO_SEED, 5, "1", "1,00")]),
      cookieAdmin,
      idsTeste.empresaB
    );
    expect(outraEmpresa.statusCode).toBe(403);
    expect(json<{ code?: string }>(outraEmpresa).code).toBe("FORBIDDEN_COMPANY");

    const consultaOutraEmpresa = await contexto.app.inject({
      method: "GET",
      url: `/api/compras/historico/resumo?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieAdmin }
    });
    expect(consultaOutraEmpresa.statusCode).toBe(403);

    const cookieSemPermissao = await cookieSessao(contexto.app, "semPermissao");
    for (const url of [
      `/api/compras/historico/importacoes?empresaId=${idsTeste.empresaA}`,
      `/api/compras/historico/resumo?empresaId=${idsTeste.empresaA}`
    ]) {
      const negada = await contexto.app.inject({ method: "GET", url, headers: { cookie: cookieSemPermissao } });
      expect(negada.statusCode, url).toBe(403);
    }
    const aplicarSem = await contexto.app.inject({
      method: "POST",
      url: `/api/compras/historico/importacoes/${importacaoId}/aplicar`,
      headers: { cookie: cookieSemPermissao },
      payload: { empresaId: idsTeste.empresaA }
    });
    expect(aplicarSem.statusCode).toBe(403);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processarFilaWhatsapp } from "../../../api/src/compras/compras-whatsapp.service.js";
import { env } from "../../../api/src/env.js";
import { enviosDeTeste } from "../../../api/src/whatsapp/whatsapp-provedor.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { restaurarBaseImportada } from "../../setup/compras.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// Fluxo de Compras de 22/10/2026 (PROJECT_BRAIN/57): os dois passos da cotacao (cotado -> retornado ->
// comprado), a fila do WhatsApp, o "A fazer" sem fornecedor, o painel da matriz e o fornecedor marcando o que
// vende.

const FORN_A = "11111111-1111-4111-8111-11111111f701";
const FORN_B = "11111111-1111-4111-8111-11111111f702";
const PRODUTO_2 = "11111111-1111-4111-8111-11111111f703";
const IMPORTACAO = "11111111-1111-4111-8111-11111111f704";
const IMPORTACAO_ITEM = "11111111-1111-4111-8111-11111111f705";
const PRECO_BASE = "11111111-1111-4111-8111-11111111f706";

type Convite = { id: string; fornecedorId: string; token: string };
type RodadaAberta = { id: string; itens: Array<{ id: string; produtoId: string }>; convites: Convite[] };

describe("fluxo de compras do doc 57 integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      "insert into fornecedores (id, empresa_id, nome, whatsapp, situacao) values ($1,$2,'Fluxo Bahamas','11999997701','ativo'),($3,$2,'Fluxo Mercearia','11999997702','ativo') on conflict (id) do nothing",
      [FORN_A, idsTeste.empresaA, FORN_B]
    );
    await executarSql(
      "insert into produtos (id, empresa_id, grupo_mercadoria_id, unidade_medida_id, codigo, descricao) values ($1,$2,$3,$4,'PROD-FLX-2','Abacaxi do fluxo') on conflict (id) do nothing",
      [PRODUTO_2, idsTeste.empresaA, idsTeste.grupoMercadoriaInsumos, idsTeste.unidade]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base (id, empresa_id, nome_arquivo, hash_arquivo, status, total_linhas, criado_por) values ($1,$2,'base.xlsx',$3,'aplicada',1,(select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [IMPORTACAO, idsTeste.empresaA, "f".repeat(64)]
    );
    await executarSql(
      "insert into compras_importacoes_preco_base_itens (id, importacao_id, numero_linha, descricao_informada, descricao_normalizada, valor_informado, produto_id, resultado) values ($1,$2,1,'Produto','produto','10.0000',$3,'correspondencia') on conflict (id) do nothing",
      [IMPORTACAO_ITEM, IMPORTACAO, idsTeste.produto]
    );
    await executarSql(
      "insert into produtos_precos_base (id, empresa_id, produto_id, valor, origem, importacao_item_id, valido_desde, criado_por) values ($1,$2,$3,'10.0000','importacao',$4, now() - interval '1 day', (select usuario_id from perfis_usuarios limit 1)) on conflict (id) do nothing",
      [PRECO_BASE, idsTeste.empresaA, idsTeste.produto, IMPORTACAO_ITEM]
    );
  }, 120_000);

  beforeEach(() => restaurarBaseImportada(idsTeste.empresaA, [idsTeste.produto, PRODUTO_2], PRECO_BASE));

  afterAll(async () => {
    env.WHATSAPP_PROVEDOR = "desligado";
    await executarSql("delete from compras_adjudicacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql(
      "delete from pedidos_eventos where pedido_id in (select id from pedidos where empresa_id = $1 and tipo = 'rodada')",
      [idsTeste.empresaA]
    );
    await executarSql("delete from compras_whatsapp_envios where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from pedidos where empresa_id = $1 and tipo = 'rodada'", [idsTeste.empresaA]);
    await executarSql("delete from notificacoes where tipo = 'compras_decisao_pendente'", []);
    await executarSql("delete from compras_propostas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas_convites where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_rodadas_itens where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from produtos_precos_base where empresa_id = $1 and produto_id = any($2)", [
      idsTeste.empresaA,
      [idsTeste.produto, PRODUTO_2]
    ]);
    await executarSql("delete from compras_rodadas where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_solicitacoes where empresa_id = $1", [idsTeste.empresaA]);
    await executarSql("delete from compras_importacoes_preco_base_itens where id = $1", [IMPORTACAO_ITEM]);
    await executarSql("delete from compras_importacoes_preco_base where id = $1", [IMPORTACAO]);
    await executarSql("delete from fornecedores_produtos where fornecedor_id = any($1)", [[FORN_A, FORN_B]]);
    await executarSql("delete from produtos where id = $1", [PRODUTO_2]);
    await executarSql("delete from fornecedores where id = any($1)", [[FORN_A, FORN_B]]);
    await contexto.fechar();
  });

  const pedir = (method: "GET" | "POST", url: string, payload?: object, cookie = cookieAdmin) =>
    contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const publico = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
    contexto.app.inject({ method, url, headers: { "x-rodada-token": token }, ...(payload ? { payload } : {}) });

  /** Cotacao com os dois produtos; `convites` diz quais produtos cada fornecedor recebe. */
  async function abrir(convites: Array<{ fornecedorId: string; produtos: string[] }>): Promise<RodadaAberta> {
    const criar = await pedir("POST", "/api/compras/solicitacoes", {
      empresaId: idsTeste.empresaA,
      itens: [
        { produtoId: idsTeste.produto, quantidade: 5 },
        { produtoId: PRODUTO_2, quantidade: 3 }
      ]
    });
    const solicitacaoId = json<{ data: { id: string } }>(criar).data.id;
    const solicitacao = json<{ data: { itens: Array<{ id: string; produtoId: string }> } }>(
      await pedir("GET", `/api/compras/solicitacoes/${solicitacaoId}`)
    ).data;
    const itemDo = (produtoId: string) => solicitacao.itens.find((item) => item.produtoId === produtoId)!.id;
    const resposta = await pedir("POST", "/api/compras/rodadas", {
      empresaId: idsTeste.empresaA,
      solicitacaoId,
      margemVariacaoPercentual: 10,
      convites: convites.map((convite) => ({
        fornecedorId: convite.fornecedorId,
        solicitacaoItemIds: convite.produtos.map(itemDo)
      }))
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return json<{ data: RodadaAberta }>(resposta).data;
  }

  async function responder(token: string, valores: Record<string, number>) {
    const dto = json<{ data: { itens: Array<{ conviteItemId: string; descricaoProduto: string }> } }>(
      await publico("GET", "/api/rodada", token)
    ).data;
    const resposta = await publico("POST", "/api/rodada/responder", token, {
      itens: dto.itens.map((item) => ({
        conviteItemId: item.conviteItemId,
        indisponivel: false,
        valorUnitario: valores[item.descricaoProduto] ?? 1
      }))
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
  }

  it("dois passos: vence cotado, separa dentro da margem (retornado), o comprador confirma e o ok vai para a fila", async () => {
    const rodada = await abrir([{ fornecedorId: FORN_A, produtos: [idsTeste.produto] }]);
    const token = rodada.convites[0]!.token;
    const antes = json<{ data: { itens: Array<{ referencia: string | null }>; margemVariacaoPercentual: number } }>(
      await publico("GET", "/api/rodada", token)
    ).data;
    // O fornecedor ve a referencia e a margem (doc 57 §5).
    expect(Number(antes.itens[0]?.referencia)).toBe(10);
    expect(antes.margemVariacaoPercentual).toBe(10);

    await responder(token, { "Produto Integracao": 8 });
    const pedido = await consultarUm<{ id: string; status: string }>(
      "select id, status from pedidos where rodada_id = $1",
      [rodada.id]
    );
    expect(pedido?.status).toBe("cotado");

    const visto = json<{
      data: { pedido: { status: string; itens: Array<{ pedidoItemId: string; minimo: string; maximo: string }> } };
    }>(await publico("GET", "/api/rodada", token)).data;
    expect(visto.pedido.status).toBe("cotado");
    expect(Number(visto.pedido.itens[0]?.minimo)).toBe(4.5);
    expect(Number(visto.pedido.itens[0]?.maximo)).toBe(5.5);
    const pedidoItemId = visto.pedido.itens[0]!.pedidoItemId;

    const fora = await publico("POST", "/api/rodada/separacao", token, { itens: [{ pedidoItemId, quantidade: 5.6 }] });
    expect(fora.statusCode).toBe(422);
    expect(json<{ code?: string }>(fora).code).toBe("QUANTIDADE_FORA_DA_MARGEM");

    const separado = await publico("POST", "/api/rodada/separacao", token, {
      itens: [{ pedidoItemId, quantidade: 5.2 }]
    });
    expect(separado.statusCode, separado.body).toBe(200);
    const depois = await consultarUm<{ status: string; quantidade: string; adjudicada: string }>(
      "select p.status, i.quantidade, a.quantidade as adjudicada from pedidos p join pedidos_itens i on i.pedido_id = p.id join compras_adjudicacoes a on a.pedido_item_id = i.id where p.id = $1",
      [pedido!.id]
    );
    expect(depois?.status).toBe("retornado");
    expect(Number(depois?.quantidade)).toBe(5.2);
    expect(Number(depois?.adjudicada)).toBe(5.2);
    // O comprador e avisado; devolver de novo nao vale.
    await expect(
      consultarUm("select id from notificacoes where tipo = 'compras_decisao_pendente' and referencia_id = $1", [
        rodada.id
      ])
    ).resolves.toBeTruthy();
    const deNovo = await publico("POST", "/api/rodada/separacao", token, { itens: [{ pedidoItemId, quantidade: 5 }] });
    expect(deNovo.statusCode).toBe(409);

    const confirmar = await pedir("POST", `/api/pedidos/${pedido!.id}/confirmar`, { empresaId: idsTeste.empresaA });
    expect(confirmar.statusCode, confirmar.body).toBe(204);
    const confirmado = await consultarUm<{ status: string }>("select status from pedidos where id = $1", [pedido!.id]);
    expect(confirmado?.status).toBe("confirmado");
    const aviso = await consultarUm<{ telefone: string; status: string }>(
      "select telefone, status from compras_whatsapp_envios where pedido_id = $1 and tipo = 'pedido_confirmado'",
      [pedido!.id]
    );
    expect(aviso).toEqual({ telefone: "5511999997701", status: "pendente" });
    expect(
      (await pedir("POST", `/api/pedidos/${pedido!.id}/confirmar`, { empresaId: idsTeste.empresaA })).statusCode
    ).toBe(409);
  });

  it("quantidade disponivel fora da margem nao compra sozinha", async () => {
    const rodada = await abrir([{ fornecedorId: FORN_A, produtos: [idsTeste.produto] }]);
    const token = rodada.convites[0]!.token;
    const dto = json<{ data: { itens: Array<{ conviteItemId: string }> } }>(
      await publico("GET", "/api/rodada", token)
    ).data;
    const resposta = await publico("POST", "/api/rodada/responder", token, {
      itens: [
        { conviteItemId: dto.itens[0]!.conviteItemId, indisponivel: false, valorUnitario: 8, quantidadeDisponivel: 2 }
      ]
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    await expect(consultarUm("select id from pedidos where rodada_id = $1", [rodada.id])).resolves.toBeNull();
  });

  it("fila do WhatsApp com o provedor de teste: manda o link com token novo e o antigo deixa de valer", async () => {
    env.WHATSAPP_PROVEDOR = "teste";
    enviosDeTeste.length = 0;
    try {
      const rodada = await abrir([{ fornecedorId: FORN_A, produtos: [idsTeste.produto] }]);
      const tokenDaAbertura = rodada.convites[0]!.token;
      await processarFilaWhatsapp((_, erro) => {
        throw erro;
      });
      const mensagem = enviosDeTeste.find(
        (envio) => envio.tipo === "convite" && envio.telefone === "5511999997701" && envio.texto.includes("/rodada#t=")
      );
      expect(mensagem).toBeTruthy();
      const link = mensagem!.parametros[3]!;
      const tokenNovo = decodeURIComponent(link.split("#t=")[1]!);
      expect(tokenNovo).not.toBe(tokenDaAbertura);
      expect((await publico("GET", "/api/rodada", tokenDaAbertura)).statusCode).toBe(404);
      expect((await publico("GET", "/api/rodada", tokenNovo)).statusCode).toBe(200);

      const detalhe = json<{ data: { whatsappConectado: boolean; convites: Array<{ whatsapp: { status: string } }> } }>(
        await pedir("GET", `/api/compras/rodadas/${rodada.id}?empresaId=${idsTeste.empresaA}`)
      ).data;
      expect(detalhe.whatsappConectado).toBe(true);
      expect(detalhe.convites[0]?.whatsapp.status).toBe("enviado");
    } finally {
      env.WHATSAPP_PROVEDOR = "desligado";
    }
  });

  it("item sem fornecedor: aparece no painel, o comprador convida, o catalogo aprende e o convite vai para a fila", async () => {
    const rodada = await abrir([{ fornecedorId: FORN_A, produtos: [idsTeste.produto] }]);
    const painel = async () =>
      json<{
        data: {
          semFornecedor: Array<{ rodadaId: string; rodadaItemId: string; produtoId: string }>;
          convites: Array<{ conviteId: string; rodadaId: string; fornecedorId: string; totalItens: number }>;
        };
      }>(await pedir("GET", `/api/compras/painel?empresaId=${idsTeste.empresaA}`)).data;

    const antes = await painel();
    const aFazer = antes.semFornecedor.find((item) => item.rodadaId === rodada.id);
    expect(aFazer?.produtoId).toBe(PRODUTO_2);
    expect(antes.convites.some((convite) => convite.rodadaId === rodada.id && convite.fornecedorId === FORN_A)).toBe(
      true
    );

    const convidar = await pedir("POST", `/api/compras/rodadas/${rodada.id}/convidar`, {
      empresaId: idsTeste.empresaA,
      fornecedorId: FORN_B,
      rodadaItemIds: [aFazer!.rodadaItemId]
    });
    expect(convidar.statusCode, convidar.body).toBe(201);
    const { conviteId } = json<{ data: { conviteId: string } }>(convidar).data;
    expect((await painel()).semFornecedor.some((item) => item.rodadaId === rodada.id)).toBe(false);
    const vinculo = await consultarUm<{ status: string; origem: string }>(
      "select status, origem from fornecedores_produtos where fornecedor_id = $1 and produto_id = $2",
      [FORN_B, PRODUTO_2]
    );
    expect(vinculo).toEqual({ status: "aprovado", origem: "compras" });
    await expect(
      consultarUm("select id from compras_whatsapp_envios where convite_id = $1 and status = 'pendente'", [conviteId])
    ).resolves.toBeTruthy();

    // Convidar quem ja tem convite aberto acrescenta o item no mesmo convite.
    const conviteA = rodada.convites[0]!.id;
    const acrescentar = await pedir("POST", `/api/compras/rodadas/${rodada.id}/convidar`, {
      empresaId: idsTeste.empresaA,
      fornecedorId: FORN_A,
      rodadaItemIds: [aFazer!.rodadaItemId]
    });
    expect(json<{ data: { conviteId: string } }>(acrescentar).data.conviteId).toBe(conviteA);
    const itensA = await consultarTodos("select id from compras_convites_itens where convite_id = $1", [conviteA]);
    expect(itensA).toHaveLength(2);

    const intruso = await pedir("POST", `/api/compras/rodadas/${rodada.id}/convidar`, {
      empresaId: idsTeste.empresaB,
      fornecedorId: FORN_B,
      rodadaItemIds: [aFazer!.rodadaItemId]
    });
    expect(intruso.statusCode).toBe(403);
  });

  it("o fornecedor marca o que tambem vende e passa a ser fornecedor aprovado daquele produto", async () => {
    const rodada = await abrir([{ fornecedorId: FORN_B, produtos: [PRODUTO_2] }]);
    const token = rodada.convites[0]!.token;
    const lista = async () =>
      json<{ data: Array<{ produtoId: string; jaVende: boolean }> }>(
        await publico("GET", "/api/rodada/produtos", token)
      ).data;
    expect((await lista()).find((produto) => produto.produtoId === idsTeste.produto)?.jaVende).toBe(false);
    const marcar = await publico("POST", "/api/rodada/produtos", token, { produtoIds: [idsTeste.produto] });
    expect(marcar.statusCode, marcar.body).toBe(200);
    expect((await lista()).find((produto) => produto.produtoId === idsTeste.produto)?.jaVende).toBe(true);
    const vinculo = await consultarUm<{ status: string; origem: string }>(
      "select status, origem from fornecedores_produtos where fornecedor_id = $1 and produto_id = $2",
      [FORN_B, idsTeste.produto]
    );
    expect(vinculo).toEqual({ status: "aprovado", origem: "fornecedor" });
  });

  it("o painel da matriz respeita empresa e permissao", async () => {
    expect((await pedir("GET", `/api/compras/painel?empresaId=${idsTeste.empresaB}`)).statusCode).toBe(403);
    const cookieSem = await cookieSessao(contexto.app, "semPermissao");
    expect(
      (await pedir("GET", `/api/compras/painel?empresaId=${idsTeste.empresaA}`, undefined, cookieSem)).statusCode
    ).toBe(403);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

/**
 * Fase B2 da virada (29/10/2026): a loja passa a ter os produtos como estao no backup do paralelo (linhas da
 * loja carregadas na Central). Ativo entra ativo, inativo entra inativo; preco, custo, margem e estoque vem da
 * linha da loja. Produto ja ligado a BASE e atualizado (mantem o codigo do PDV); o resto e criado; o que nao
 * pode entrar fica de fora com o motivo.
 */
const FRASE = "APLICAR A LOJA PELO BACKUP";

const dados = (extra: Record<string, string>) =>
  JSON.stringify({
    status: "ativo",
    tipo: "revenda",
    medida_base: "UN",
    quantidade: "1",
    grupo: "Insumos",
    custo: "6",
    margem_pontual: "50",
    venda_pontual: "12.5",
    estoque_min: "2",
    estoque_max: "10",
    ...extra
  });

describe("produtos - aplicar a loja pelo backup do paralelo (fase B2)", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  let cargaId = "";
  let antigoLigado = "";
  let parMaisVendido = "";
  let parMenosVendido = "";
  let outroProduto = "";
  const prefixos = new Map<string, string>();

  const previa = () =>
    contexto.app.inject({
      method: "GET",
      url: `/api/produtos/central/cargas/${cargaId}/loja/previa?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });
  const aplicar = (corpo: Record<string, unknown>) =>
    contexto.app.inject({
      method: "POST",
      url: `/api/produtos/central/cargas/${cargaId}/loja/aplicar`,
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaA, ...corpo }
    });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    const base = async (idOrigem: string, nome: string, codigo: string) =>
      (await consultarUm<{ id: string }>(
        `insert into produtos_catalogo_base (id_origem, nome, codigo_interno, codigo_barras, dados_oficiais)
           values ($1, $2, $3, null, '{}'::jsonb) returning id`,
        [idOrigem, nome, codigo]
      ))!.id;
    await base("b2-um", "B2 NOVO", "94001");
    const baseDois = await base("b2-dois", "B2 ANTIGO LIGADO", "94002");
    await base("b2-quatro", "B2 SEM MEDIDA", "94004");
    await base("b2-cinco", "B2 DUPLICATA", "94005");
    await base("b2-seis", "B2 NOVO", "94006");
    // Produto antigo que a integracao do PDV criou e a fase A ja ligou a BASE (com o codigo interno dela).
    antigoLigado = (await consultarUm<{ id: string }>(
      "insert into produtos (empresa_id, descricao, codigo, codigo_interno, produto_base_id) values ($1, 'B2 PDV LIGADO UN', '94002', '94002', $2) returning id",
      [idsTeste.empresaA, baseDois]
    ))!.id;
    // Par de produtos antigos soltos com o MESMO codigo do PDV (com e sem zeros), cada um com o seu vinculo
    // de venda: o que mais vendeu fica, recebe a BASE e os vinculos do outro; o outro e inativado.
    const solto = async (descricao: string, codigo: string) =>
      (await consultarUm<{ id: string }>(
        "insert into produtos (empresa_id, descricao, codigo) values ($1, $2, $3) returning id",
        [idsTeste.empresaA, descricao, codigo]
      ))!.id;
    parMenosVendido = await solto("B2 DUPLICATA UN", "00000000094005");
    parMaisVendido = await solto("B2 DUPLICATA", "94005");
    // Mesmo codigo do PDV, mas OUTRO produto (outro nome): nao entra na juncao, mesmo vendendo mais.
    outroProduto = await solto("B2 DUPLICATA OUTRO SABOR", "094005");
    for (const [codigo, produtoId] of [
      ["00000000094005", parMenosVendido],
      ["94005", parMaisVendido],
      ["094005", outroProduto]
    ] as const) {
      await executarSql(
        `insert into integracoes_vinculos
           (empresa_id, tipo, tipo_registro, identificador_externo, descricao_externa, registro_sistema_id, pendente)
         values ($1, 'vendas', 'produto', $2, 'B2 PDV SOLTO', $3, false)`,
        [idsTeste.empresaA, codigo, produtoId]
      );
    }
    const venda = async (produtoId: string, vezes: number) => {
      for (let i = 0; i < vezes; i += 1) {
        const vendaId = (await consultarUm<{ id: string }>(
          `insert into vendas (empresa_id, data_referencia, descricao, valor_original, status)
           values ($1, '2026-10-01', 'B2 venda do par', '5.00', 'aprovado') returning id`,
          [idsTeste.empresaA]
        ))!.id;
        await executarSql(
          `insert into vendas_produtos (venda_id, produto_id, descricao_produto, quantidade, valor_unitario, valor_total)
           values ($1, $2, 'B2 PDV SOLTO', '1', '5.00', '5.00')`,
          [vendaId, produtoId]
        );
      }
    };
    await venda(parMenosVendido, 1);
    await venda(parMaisVendido, 2);
    await venda(outroProduto, 3);
    cargaId = (await consultarUm<{ id: string }>(
      "insert into produtos_central_cargas (estado, manifesto) values ('validada', '{}'::jsonb) returning id"
    ))!.id;
    const linha = (chave: string, codigo: string, nome: string, extra: Record<string, string>) =>
      executarSql(
        `insert into produtos_central_fontes
           (carga_id, fonte, loja_fonte, chave_linha_fonte, codigo_interno, codigo_barras, nome, dados_originais)
         values ($1, 'pralis', 'TNP', $2, $3, '', $4, $5::jsonb)`,
        [cargaId, chave, codigo, nome, dados(extra)]
      );
    await linha("pralis:b2-1", "94001", "B2 NOVO", { base_product_id: "b2-um" });
    await linha("pralis:b2-2", "94002", "B2 ANTIGO LIGADO", {
      base_product_id: "b2-dois",
      status: "inativo",
      venda_pontual: "3.2"
    });
    await linha("pralis:b2-3", "94003", "B2 SEM BASE", { base_product_id: "nao-existe" });
    await linha("pralis:b2-4", "94004", "B2 SEM MEDIDA", { base_product_id: "b2-quatro", medida_base: "" });
    await linha("pralis:b2-5", "94005", "B2 DUPLICATA", { base_product_id: "b2-cinco" });
    // Mesmo nome de outro produto (o paralelo tem 246 nomes repetidos): entra tambem.
    await linha("pralis:b2-6", "94006", "B2 NOVO", { base_product_id: "b2-seis" });
  }, 180_000);

  afterAll(async () => {
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await contexto.fechar();
  });

  it("Deve_CriarEAtualizarComOsDadosDaLoja_EDeixarDeForaComMotivo", async () => {
    const resposta = await previa();
    expect(resposta.statusCode, resposta.body).toBe(200);
    const plano = json<{
      data: {
        total: number;
        criar: number;
        atualizar: number;
        juntar: number;
        inativar: number;
        bloqueados: number;
        motivos: Record<string, number>;
        hashPlano: string;
        juntados: Array<{ codigoInterno: string | null; fica: string; inativados: string[] }>;
      };
    }>(resposta).data;
    expect(plano).toMatchObject({ total: 6, criar: 2, atualizar: 1, juntar: 1, inativar: 1, bloqueados: 2 });
    // De fora: a linha sem BASE e a sem medida base; o par antigo nao bloqueia mais.
    expect(plano.motivos["Sem o produto da BASE no ERP"]).toBe(1);
    expect(Object.keys(plano.motivos)).toHaveLength(2);
    expect(plano.juntados).toEqual([{ codigoInterno: "94005", fica: "B2 DUPLICATA", inativados: ["B2 DUPLICATA UN"] }]);

    assertProblem(await aplicar({ confirmacao: "SIM", hashPlano: plano.hashPlano }), 400, "CONFIRMACAO_INVALIDA");
    assertProblem(await aplicar({ confirmacao: FRASE, hashPlano: "f".repeat(64) }), 409, "PREVIA_DESATUALIZADA");
    const aplicado = await aplicar({ confirmacao: FRASE, hashPlano: plano.hashPlano, cursor: 0 });
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(json<{ data: Record<string, unknown> }>(aplicado).data).toMatchObject({
      total: 6,
      processados: 6,
      proximoCursor: null,
      criados: 2,
      atualizados: 1,
      juntados: 1,
      ignorados: 2,
      falhas: []
    });

    const produto = (codigoInterno: string) =>
      consultarUm<{
        id: string;
        status: string;
        preco: string | null;
        custo: string | null;
        min: string | null;
        max: string | null;
        codigo: string | null;
        nome: string | null;
      }>(
        `select id, status, preco_venda as preco, custo, estoque_min as min, estoque_max as max, codigo,
                nome_catalogo as nome
           from produtos where empresa_id = $1 and codigo_interno = $2`,
        [idsTeste.empresaA, codigoInterno]
      );
    const novo = await produto("94001");
    expect(novo).toMatchObject({ status: "ativo", nome: "B2 NOVO" });
    expect(Number(novo?.preco)).toBe(12.5);
    expect(Number(novo?.custo)).toBe(6);
    expect([Number(novo?.min), Number(novo?.max)]).toEqual([2, 10]);

    // O antigo ligado e o MESMO produto, agora com os dados da loja; o codigo do PDV fica.
    const antigo = await produto("94002");
    expect(antigo).toMatchObject({ id: antigoLigado, status: "inativo", codigo: "94002", nome: "B2 ANTIGO LIGADO" });
    expect(Number(antigo?.preco)).toBe(3.2);

    for (const codigo of ["94003", "94004"]) expect(await produto(codigo)).toBeNull();
    expect((await produto("94006"))?.nome).toBe("B2 NOVO");

    // O par: fica o que mais vendeu (mesmo id, codigo do PDV preservado), agora com a BASE e os dados da loja;
    // o outro fica inativo, com as vendas antigas; os dois codigos do PDV levam ao que ficou.
    const ficou = await produto("94005");
    expect(ficou).toMatchObject({ id: parMaisVendido, status: "ativo", codigo: "94005", nome: "B2 DUPLICATA" });
    expect(Number(ficou?.preco)).toBe(12.5);
    const inativado = await consultarUm<{ status: string; base: string | null }>(
      "select status, produto_base_id as base from produtos where id = $1",
      [parMenosVendido]
    );
    expect(inativado).toEqual({ status: "inativo", base: null });
    const vinculos = await consultarTodos<{ codigo: string; produto: string }>(
      `select identificador_externo as codigo, registro_sistema_id::text as produto from integracoes_vinculos
        where empresa_id = $1 and tipo_registro = 'produto' and identificador_externo in ('94005', '00000000094005')
        order by 1`,
      [idsTeste.empresaA]
    );
    expect(vinculos).toEqual([
      { codigo: "00000000094005", produto: parMaisVendido },
      { codigo: "94005", produto: parMaisVendido }
    ]);
    const vendasDoInativado = await consultarUm<{ total: string }>(
      "select count(*)::text as total from vendas_produtos where produto_id = $1",
      [parMenosVendido]
    );
    expect(Number(vendasDoInativado?.total)).toBe(1);
    // O de outro nome nao foi tocado: continua ativo, solto e com o vinculo dele.
    const intocado = await consultarUm<{ status: string; base: string | null; vinculo: string }>(
      `select p.status, p.produto_base_id as base, v.registro_sistema_id::text as vinculo
         from produtos p join integracoes_vinculos v on v.identificador_externo = '094005' and v.empresa_id = p.empresa_id
        where p.id = $1`,
      [outroProduto]
    );
    expect(intocado).toEqual({ status: "ativo", base: null, vinculo: outroProduto });

    // Refazer e idempotente: nada novo e criado nem juntado.
    const denovo = json<{ data: { criar: number; atualizar: number; juntar: number } }>(await previa()).data;
    expect(denovo).toMatchObject({ criar: 0, atualizar: 4, juntar: 0 });
  });
});

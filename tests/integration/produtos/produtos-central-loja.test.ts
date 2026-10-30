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
    // Produto antigo solto com o mesmo codigo do PDV de uma linha: criar faria duplicata.
    await executarSql(
      "insert into produtos (empresa_id, descricao, codigo) values ($1, 'B2 PDV SOLTO', '00000000094005')",
      [idsTeste.empresaA]
    );
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
        bloqueados: number;
        motivos: Record<string, number>;
        hashPlano: string;
      };
    }>(resposta).data;
    expect(plano).toMatchObject({ total: 6, criar: 2, atualizar: 1, bloqueados: 3 });
    expect(Object.keys(plano.motivos)).toEqual(
      expect.arrayContaining([
        "Sem o produto da BASE no ERP",
        "Já existe produto antigo da loja, solto, com este código do PDV (resolver à mão)"
      ])
    );

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
      ignorados: 3,
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

    for (const codigo of ["94003", "94004", "94005"]) expect(await produto(codigo)).toBeNull();
    expect((await produto("94006"))?.nome).toBe("B2 NOVO");

    // Refazer e idempotente: nada novo e criado.
    const denovo = json<{ data: { criar: number; atualizar: number } }>(await previa()).data;
    expect(denovo).toMatchObject({ criar: 0, atualizar: 3 });
  });
});

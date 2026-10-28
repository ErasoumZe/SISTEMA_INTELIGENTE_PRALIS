import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";

/**
 * Manutencao de pesaveis (R-222, igual a `pesaveis-maintenance`, `pesavel-backfill` e `pesavel-padronizar`
 * do app oficial): previa sem gravar, frase + hash da previa, e o produto e o de-para do SIA alinhados.
 */
const LIMITE = "----limitepesaveis";
const multipart = (conteudo: string) =>
  Buffer.concat([
    Buffer.from(
      `--${LIMITE}\r\nContent-Disposition: form-data; name="arquivo"; filename="pesaveis.csv"\r\nContent-Type: text/csv\r\n\r\n`,
      "utf8"
    ),
    Buffer.from(conteudo, "utf8"),
    Buffer.from(`\r\n--${LIMITE}--\r\n`, "utf8")
  ]);

describe("produtos - manutencao de pesaveis", () => {
  let contexto: ContextoApiTeste;
  let cookie: string;
  const prefixos = new Map<string, string>();
  const ids: Record<string, string> = {};

  const balanca = (id: string) =>
    consultarUm<{ pesavel: boolean | null; tecla: number | null; validade: number | null }>(
      "select pesavel, tecla_balanca as tecla, validade_balanca as validade from produtos where id = $1",
      [id]
    );
  const espelho = (empresaId: string, coditem: string) =>
    consultarUm<{ pesavel: string | null; tecla: string | null; validade: string | null }>(
      "select pesavel, tecla_balanca as tecla, validade_balanca as validade from sia_produto_depara where empresa_id = $1 and coditem = $2",
      [empresaId, coditem]
    );
  const criar = async (empresaId: string, descricao: string, codigoInterno: string) => {
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookie, {
      empresaId,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      descricao,
      conversoes: []
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<{ data: { id: string } }>(criado).data.id;
    await executarSql("update produtos set codigo_interno = $2 where id = $1", [id, codigoInterno]);
    return id;
  };
  const espelhar = (
    empresaId: string,
    coditem: string,
    pesavel: string | null,
    tecla: string | null,
    validade: string | null
  ) =>
    executarSql(
      `insert into sia_produto_depara (empresa_id, codigo_barras, chave_barras, coditem, pesavel, tecla_balanca, validade_balanca)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [empresaId, `0000000${coditem}`, `7${coditem}`, coditem, pesavel, tecla, validade]
    );

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookie = await cookieSessao(contexto.app, "multiempresa");
    for (const e of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixos.set(e.id, e.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'OUTRA' where id not in ($1, $2)", [
      idsTeste.empresaA,
      idsTeste.empresaB
    ]);
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    await executarSql("update empresas set matricula_prefixo = 'LI' where id = $1", [idsTeste.empresaB]);
    ids["a101"] = await criar(idsTeste.empresaA, "PESAVEL TNP UM", "00901");
    ids["a102"] = await criar(idsTeste.empresaA, "PESAVEL TNP DOIS", "00902");
    // Na LI basta o produto no banco: o plano so le codigo, barras e balanca.
    for (const [chave, descricao, codigo] of [
      ["b1", "PESAVEL LI UM", "00911"],
      ["b2", "PESAVEL LI DOIS", "00912"]
    ] as const) {
      const linha = await consultarUm<{ id: string }>(
        "insert into produtos (empresa_id, descricao, codigo_interno) values ($1, $2, $3) returning id",
        [idsTeste.empresaB, descricao, codigo]
      );
      ids[chave] = linha!.id;
    }
  }, 180_000);

  afterAll(async () => {
    for (const [id, p] of prefixos)
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, p]);
    await executarSql("delete from sia_produto_depara where coditem like '009%'");
    await executarSql("delete from produtos where empresa_id = $1 and codigo_interno like '009%'", [idsTeste.empresaB]);
    await contexto.fechar();
  });

  it("Deve_AlinharOsPesaveisDaExportacao_SoNaTnp_ComFraseEHash", async () => {
    await espelhar(idsTeste.empresaA, "00901", "N", "0", "0");
    const arquivo = multipart(
      [
        "Cód. produto;Descrição;Status;Pesável;Validade",
        "901;PAO UM;A;S;7",
        "902;PAO DOIS;A;N;",
        "99901;SUMIDO;A;S;3"
      ].join("\n")
    );
    const enviar = (url: string) =>
      contexto.app.inject({
        method: "POST",
        url,
        headers: { cookie, "content-type": `multipart/form-data; boundary=${LIMITE}` },
        payload: arquivo
      });

    assertProblem(await enviar(`/api/produtos/pesaveis/previa?empresaId=${idsTeste.empresaB}`), 422, "PESAVEIS_SO_TNP");

    const previa = await enviar(`/api/produtos/pesaveis/previa?empresaId=${idsTeste.empresaA}`);
    expect(previa.statusCode, previa.body).toBe(200);
    const dados = json<{
      data: {
        atualizarProdutos: number;
        atualizarEspelhos: number;
        semProduto: string[];
        hashArquivo: string;
        hashPlano: string;
      };
    }>(previa).data;
    expect(dados).toMatchObject({ atualizarProdutos: 1, atualizarEspelhos: 1, semProduto: ["99901"] });
    // A previa nao grava.
    expect((await balanca(ids["a101"]!))?.validade).not.toBe(7);

    const hashes = `hashArquivo=${dados.hashArquivo}&hashPlano=${dados.hashPlano}`;
    assertProblem(
      await enviar(`/api/produtos/pesaveis?empresaId=${idsTeste.empresaA}&confirmacao=SIM&${hashes}`),
      400,
      "CONFIRMACAO_INVALIDA"
    );
    const aplicar = () =>
      enviar(`/api/produtos/pesaveis?empresaId=${idsTeste.empresaA}&confirmacao=ATUALIZAR%20PESAVEIS%20TNP&${hashes}`);
    const aplicado = await aplicar();
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(await balanca(ids["a101"]!)).toEqual({ pesavel: true, tecla: 0, validade: 7 });
    expect(await espelho(idsTeste.empresaA, "00901")).toEqual({ pesavel: "S", tecla: "000", validade: "7" });
    // O mesmo hash depois de gravar: o estado mudou, nada e gravado de novo.
    assertProblem(await aplicar(), 409, "PREVIA_DESATUALIZADA");
  });

  it("Deve_ClassificarQuemNaoTemValor_PeloEspelhoOuN", async () => {
    await executarSql(
      "update produtos set pesavel = null, tecla_balanca = null, validade_balanca = null where empresa_id = $1",
      [idsTeste.empresaB]
    );
    await espelhar(idsTeste.empresaB, "00912", "S", "000", "4");
    const previa = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/pesavel-backfill/previa?empresaId=${idsTeste.empresaB}`,
      headers: { cookie }
    });
    expect(previa.statusCode, previa.body).toBe(200);
    const dados = json<{ data: { porOrigem: { espelho: number }; hashPlano: string; confirmacao: string } }>(
      previa
    ).data;
    expect(dados.confirmacao).toBe("CLASSIFICAR PESAVEL LI");
    expect(dados.porOrigem.espelho).toBe(1);

    const aplicado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/pesavel-backfill",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaB, confirmacao: dados.confirmacao, hashPlano: dados.hashPlano }
    });
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(await balanca(ids["b1"]!)).toEqual({ pesavel: false, tecla: 0, validade: 0 });
    expect(await balanca(ids["b2"]!)).toEqual({ pesavel: true, tecla: 0, validade: 4 });
  });

  it("Deve_PadronizarTodosOsAtivos_E_OEspelho", async () => {
    const previa = await contexto.app.inject({
      method: "GET",
      url: `/api/produtos/pesavel-padronizar/previa?empresaId=${idsTeste.empresaB}`,
      headers: { cookie }
    });
    expect(previa.statusCode, previa.body).toBe(200);
    const dados = json<{ data: { hashPlano: string; confirmacao: string; espelhoCorrigir: number } }>(previa).data;
    expect(dados.confirmacao).toBe("TODOS PESAVEIS LI");
    expect(dados.espelhoCorrigir).toBeGreaterThan(0);

    const aplicado = await contexto.app.inject({
      method: "POST",
      url: "/api/produtos/pesavel-padronizar",
      headers: { cookie },
      payload: { empresaId: idsTeste.empresaB, confirmacao: dados.confirmacao, hashPlano: dados.hashPlano }
    });
    expect(aplicado.statusCode, aplicado.body).toBe(200);
    expect(await balanca(ids["b1"]!)).toEqual({ pesavel: true, tecla: 0, validade: 5 });
    expect(await espelho(idsTeste.empresaB, "00912")).toEqual({ pesavel: "S", tecla: "000", validade: "5" });
  });
});

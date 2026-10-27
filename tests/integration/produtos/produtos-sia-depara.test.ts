import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { definirFontesFiscaisParaTeste } from "../../../api/src/produtos/produtos-fiscal.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";

/**
 * De-para do SIA por loja (R-222, igual ao `depara-upload` do app oficial): a previa nao grava; aplicar
 * substitui a loja inteira, com frase; recusas antes de qualquer escrita; e o fiscal de LI/HORA passa a
 * sair dele.
 */
const FRASE = "SUBSTITUIR O DE-PARA DESTA LOJA";
const LIMITE = "----limitesiadepara";

/** CSV no formato da exportacao do SIA Supervisor. */
const csv = (linhas: Array<[coditem: string, barras: string, nome: string]>) =>
  ["CODITEM;COD_BARRAS;NOME;ATIVO;ALIQ_ECF;CST;CSOSN;NCM;REDUCAO;ALIQ_INTERNA;GRUPO;PESAVEL;TECLA;VALIDADE"]
    .concat(
      linhas.map(([coditem, barras, nome]) => `${coditem};${barras};${nome};A;3;"040";102;19059090;33,33;18;0005;N;;`)
    )
    .join("\n");

function corpo(conteudo: string, nome = "exportacao.csv"): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${LIMITE}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: text/csv\r\n\r\n`,
      "utf8"
    ),
    Buffer.from(conteudo, "utf8"),
    Buffer.from(`\r\n--${LIMITE}--\r\n`, "utf8")
  ]);
}

describe("produtos - de-para do SIA por loja", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieGerente: string;
  let gerenteId = "";
  let regrasOriginaisGerente = "{}";
  let prefixoOriginalB = "TNP";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    // Administrador com as DUAS lojas (o "admin" do seed so tem a A).
    cookieAdmin = await cookieSessao(contexto.app, "multiempresa");
    const gerente = await consultarUm<{ id: string; regras: object }>(
      `select u.id, p.regras from "user" u join permissoes_usuarios p on p.usuario_id = u.id where u.email = $1`,
      ["gerente.integracao@padaria.local"]
    );
    gerenteId = gerente?.id ?? "";
    regrasOriginaisGerente = JSON.stringify(gerente?.regras ?? {});
    await executarSql(
      `update permissoes_usuarios set regras = regras || '{"cadastro_produtos_visualizar":true,"cadastro_produtos_editar":true}'::jsonb where usuario_id = $1`,
      [gerenteId]
    );
    cookieGerente = await cookieSessao(contexto.app, "gerente");
    // A empresa B faz o papel da Lisboa: o fiscal dela sai do SIA, nao da aba de ECF.
    prefixoOriginalB =
      (
        await consultarUm<{ p: string }>("select matricula_prefixo as p from empresas where id = $1", [
          idsTeste.empresaB
        ])
      )?.p ?? "TNP";
    await executarSql("update empresas set matricula_prefixo = 'LI' where id = $1", [idsTeste.empresaB]);
  }, 180_000);

  afterAll(async () => {
    definirFontesFiscaisParaTeste({});
    await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [
      idsTeste.empresaB,
      prefixoOriginalB
    ]);
    await executarSql("update permissoes_usuarios set regras = $2::jsonb where usuario_id = $1", [
      gerenteId,
      regrasOriginaisGerente
    ]);
    await executarSql("delete from sia_produto_depara");
    await executarSql("delete from produtos where descricao like 'SIA %'");
    await executarSql("delete from produtos_catalogo_base where nome like 'SIA %'");
    await contexto.fechar();
  });

  const enviar = (rota: string, conteudo: string, cookie = cookieAdmin, nome = "exportacao.csv") =>
    contexto.app.inject({
      method: "POST",
      url: rota,
      headers: { cookie, "content-type": `multipart/form-data; boundary=${LIMITE}` },
      payload: corpo(conteudo, nome)
    });
  const previa = (conteudo: string, cookie = cookieAdmin) =>
    enviar(`/api/produtos/sia-depara/previa?empresaId=${idsTeste.empresaB}`, conteudo, cookie);
  const aplicar = (conteudo: string, frase = FRASE, cookie = cookieAdmin) =>
    enviar(
      `/api/produtos/sia-depara?empresaId=${idsTeste.empresaB}&confirmacao=${encodeURIComponent(frase)}`,
      conteudo,
      cookie
    );
  const coditensDaLoja = async () =>
    (
      await consultarTodos<{ coditem: string }>(
        "select coditem from sia_produto_depara where empresa_id = $1 order by coditem",
        [idsTeste.empresaB]
      )
    ).map((linha) => linha.coditem);

  it("Deve_ConferirSemGravar_E_DeixarAEntregaDeFora", async () => {
    const resposta = await previa(
      csv([
        ["10000", "7891000249239", "ABACAXI UNID"],
        ["13126", "7891000249246", "IOGURTE"],
        ["710000", "7891000249253", "ABACAXI UNID DELIVERY"]
      ])
    );
    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(json<{ data: Record<string, unknown> }>(resposta).data).toMatchObject({
      loja: "LI",
      linhas: 2,
      entrega: 1,
      atuais: 0,
      faixa: { min: 10000, max: 13126 },
      confirmacao: FRASE
    });
    expect(await coditensDaLoja()).toEqual([]);
  });

  it("Deve_SoOAdministradorImportar_E_ExigirAFrase", async () => {
    const conteudo = csv([["10000", "7891000249239", "ABACAXI UNID"]]);
    assertProblem(await previa(conteudo, cookieGerente), 403, "FORBIDDEN");
    assertProblem(await aplicar(conteudo, "sim"), 400, "SIA_CONFIRMACAO");
    assertProblem(
      await enviar(`/api/produtos/sia-depara/previa?empresaId=${idsTeste.empresaB}`, "x", cookieAdmin, "velho.xls"),
      422,
      "SIA_FORMATO_XLS"
    );
    expect(await coditensDaLoja()).toEqual([]);
  });

  it("Deve_RecusarAntesDeGravar_Quando_BarrasApontamParaDoisProdutos", async () => {
    const resposta = await aplicar(
      csv([
        ["10000", "7891", "UM"],
        ["10001", "0007891", "OUTRO"]
      ])
    );
    assertProblem(resposta, 422, "SIA_RECUSADO");
    expect(resposta.body).toContain("apontam para mais de um produto");
    expect(await coditensDaLoja()).toEqual([]);
  });

  it("Deve_SubstituirOdeParaInteiro_E_OFiscalDaLojaSairDoSia", async () => {
    const primeira = await aplicar(
      csv([
        ["10000", "7891000249239", "ABACAXI UNID"],
        ["10001", "7891000249246", "ACAFRAO KG"]
      ])
    );
    expect(primeira.statusCode, primeira.body).toBe(200);
    // A exportacao e a verdade daquele momento: o que nao veio, sai.
    const segunda = await aplicar(
      csv([
        ["10001", "7891000249246", "ACAFRAO KG"],
        ["10002", "7894900011517", "SIA BISCOITO"]
      ])
    );
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(json<{ data: { gravadas: number; substituidas: number } }>(segunda).data).toMatchObject({
      gravadas: 2,
      substituidas: 2
    });
    expect(await coditensDaLoja()).toEqual(["10001", "10002"]);

    // Fiscal da LI: grupo pela planilha; aliquota ECF, reducao e categoria pelo SIA da propria loja.
    definirFontesFiscaisParaTeste({
      leitor: {
        async lerFaixasEmLote(faixas: string[]) {
          return faixas.map((faixa) =>
            faixa.endsWith("!AB4:AG79")
              ? [["Mercearia B", "1", "TRIBUTADO INTEGRAL", "11,28%", "3,69%", "Regra geral"]]
              : faixa.endsWith("!O4:Q20")
                ? [["1", "TRIBUTADO INTEGRAL", "11,28%"]]
                : []
          );
        }
      }
    });
    const payload = {
      empresaId: idsTeste.empresaB,
      grupoMercadoriaId: idsTeste.grupoMercadoriaB,
      unidadeIndividualId: await unidadeDaLojaB(),
      quantidadeIndividual: 1,
      descricao: "SIA BISCOITO LI",
      codigoBarras: "7894900011999",
      conversoes: []
    };
    const criado = await cadastrarProdutoNaLoja(contexto.app, cookieAdmin, payload);
    expect(criado.statusCode, criado.body).toBe(201);
    const id = json<{ data: { id: string } }>(criado).data.id;

    // A copia nasce com o fiscal da BASE; trocar o EAN na loja reclassifica pela fonte da LI (o SIA).
    const troca = await contexto.app.inject({
      method: "PUT",
      url: `/api/produtos/${id}`,
      headers: { cookie: cookieAdmin },
      payload: { ...payload, codigoBarras: "7894900011517" }
    });
    expect(troca.statusCode, troca.body).toBe(204);
    const fiscal = await consultarUm<{
      aliquota_ecf_id: string;
      aliquota_ecf: string;
      reducao_icms: string;
      categoria_fiscal: string;
    }>(
      "select aliquota_ecf_id, aliquota_ecf, reducao_icms, categoria_fiscal from produtos_fiscal where produto_id = $1",
      [id]
    );
    expect(fiscal).toMatchObject({ aliquota_ecf_id: "03", aliquota_ecf: "18,00%", categoria_fiscal: "0005" });
    expect(Number(fiscal?.reducao_icms)).toBe(33.33);
  });

  async function unidadeDaLojaB(): Promise<string> {
    const existente = await consultarUm<{ id: string }>(
      "select id from unidades_medida where empresa_id = $1 and sigla = 'siab' limit 1",
      [idsTeste.empresaB]
    );
    if (existente) return existente.id;
    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/unidades-medida",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaB, nome: "Unidade SIA B", sigla: "siab" }
    });
    return json<{ data: { id: string } }>(criada).data.id;
  }
});

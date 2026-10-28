import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../api/src/env.js";
import { GoogleSheetsGatewayReal, GoogleSheetsSobTesteError } from "../../../api/src/google/google-sheets-gateway.js";
import {
  CreareDriveSobTesteError,
  definirDriveDoCreareParaTeste,
  GoogleDriveCreareGateway,
  publicarCreareNoDrive
} from "../../../api/src/produtos/produtos-creare-drive.js";
import { EscritorPlanilhaGoogle } from "../../../api/src/produtos/produtos-planilha-escritor.js";
import { definirEscritorDaPlanilhaParaTeste } from "../../../api/src/produtos/produtos-planilha.service.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";
import { PlanilhaFalsa } from "../../setup/planilha-falsa.js";
import { cadastrarProdutoNaLoja } from "../../setup/produtos.js";

/**
 * Escritor REAL do espelho na planilha e publicacao no Drive (R-222, porte de `ProductSheetService`,
 * `ProductSheetLojaService` e `CreareDriveService` do app oficial), contra uma planilha em memoria.
 */
const BASE = "(BASE) CADASTRO PRODUTOS";
const ABA_TNP = "(TNP) CADASTRO PRODUTOS";

function montarPlanilha(): PlanilhaFalsa {
  const planilha = new PlanilhaFalsa();
  planilha.criarAba(
    BASE,
    {
      3: { D: "CADASTRO GERAL", G: "TNP - CADASTRO", I: "LI - CADASTRO", K: "CONTROLE" },
      5: {
        B: "V",
        C: "CADASTRO PRODUTOS ATUALIZADO NOVO",
        D: "CODIGO BARRAS",
        E: "MARCAS",
        F: "COMO SE COMPRA ESSE PRODUTO?",
        G: "CUSTO",
        H: "CODIGO INT.",
        I: "CUSTO",
        J: "CODIGO INT.",
        K: "ID"
      },
      11: { B: "ATIVO", C: "OUTRO", K: "id-outro" },
      12: { B: "ATIVO", C: "MODELO", F: '=C12&"!"', K: "id-modelo" }
    },
    12,
    11
  );
  planilha.criarAba(
    ABA_TNP,
    {
      3: { D: "CADASTRO GERAL", G: "TNP - CADASTRO", I: "CONTROLE" },
      5: {
        B: "V",
        C: "CADASTRO PRODUTOS ATUALIZADO NOVO",
        D: "CODIGO BARRAS",
        E: "MARCAS",
        F: "COMO SE COMPRA ESSE PRODUTO?",
        G: "CUSTO",
        H: "CODIGO INT.",
        I: "ID"
      },
      12: { F: '=C12&"!"' }
    },
    12,
    9
  );
  return planilha;
}

const CONFIG_CREARE = {
  TNP: {
    groupCodes: { Insumos: "0005" },
    categoryCodes: {},
    units: { UN: "UN", UCR: "UN", CX: "UN" },
    ecfTaxCodePadrao: "03",
    pisCofinsCstPadrao: "99",
    decimalPlaces: {
      unitPrice: 2,
      cost: 3,
      icmsReduction: 2,
      fullTaxRate: 2,
      fcpRate: 2,
      pisRate: 4,
      cofinsRate: 4,
      maximumQuantity: 3,
      minimumQuantity: 3
    },
    barcodeField: "extended",
    lineEnding: "CRLF",
    noPromotionDate: "30/12/99",
    iat: "A",
    ipptByProductType: { revenda: "T", transformacao: "P" },
    stockControlledByProductType: { revenda: "S", transformacao: "S" }
  }
};

describe("produtos - escritor da planilha e publicacao no Drive", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let planilha: PlanilhaFalsa;
  const prefixosOriginais = new Map<string, string>();
  const original = {
    espelho: env.GOOGLE_PRODUTOS_ESPELHO_ENABLED,
    drive: env.CREARE_DRIVE_ENABLED,
    pastas: env.CREARE_DRIVE_FOLDERS_JSON,
    exportacao: env.CREARE_EXPORT_ENABLED,
    config: env.CREARE_STORE_CONFIG_JSON
  };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "multiempresa");
    for (const empresa of await consultarTodos<{ id: string; p: string }>(
      "select id, matricula_prefixo as p from empresas"
    )) {
      prefixosOriginais.set(empresa.id, empresa.p);
    }
    await executarSql("update empresas set matricula_prefixo = 'OUTRA' where id <> $1", [idsTeste.empresaA]);
    await executarSql("update empresas set matricula_prefixo = 'TNP' where id = $1", [idsTeste.empresaA]);
    planilha = montarPlanilha();
    definirEscritorDaPlanilhaParaTeste(new EscritorPlanilhaGoogle(planilha, "planilha-teste"));
    env.GOOGLE_PRODUTOS_ESPELHO_ENABLED = true;
  }, 180_000);

  afterAll(async () => {
    env.GOOGLE_PRODUTOS_ESPELHO_ENABLED = original.espelho;
    env.CREARE_DRIVE_ENABLED = original.drive;
    env.CREARE_DRIVE_FOLDERS_JSON = original.pastas;
    env.CREARE_EXPORT_ENABLED = original.exportacao;
    env.CREARE_STORE_CONFIG_JSON = original.config;
    definirEscritorDaPlanilhaParaTeste(null);
    definirDriveDoCreareParaTeste(null);
    for (const [id, prefixo] of prefixosOriginais) {
      await executarSql("update empresas set matricula_prefixo = $2 where id = $1", [id, prefixo]);
    }
    await executarSql("delete from produtos_planilha_sincronizacoes");
    await executarSql("delete from sia_produto_depara where coditem = '888888'");
    await contexto.fechar();
  });

  const criar = (descricao: string) =>
    cadastrarProdutoNaLoja(contexto.app, cookieAdmin, {
      empresaId: idsTeste.empresaA,
      grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos,
      unidadeIndividualId: idsTeste.unidade,
      quantidadeIndividual: 1,
      descricao,
      custo: 4.5,
      auto: false,
      precoVenda: 9.9,
      conversoes: []
    });
  const reenviar = () =>
    contexto.app.inject({
      method: "POST",
      url: "/api/produtos/planilha/reenvio",
      headers: { cookie: cookieAdmin },
      payload: { limite: 200 }
    });
  const vinculo = (produtoId: string) =>
    consultarUm<{ base_id: string; id_origem: string; nome: string }>(
      `select b.id as base_id, b.id_origem, b.nome from produtos p
         join produtos_catalogo_base b on b.id = p.produto_base_id where p.id = $1`,
      [produtoId]
    );

  it("Deve_ReservarALinhaPeloId_PreservarAFormula_E_EscreverSoAFaixaDaLoja", async () => {
    const criado = await criar("PLANILHA PAO DE SAL");
    expect(criado.statusCode, criado.body).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;
    const base = (await vinculo(produtoId))!;

    const resposta = await reenviar();
    expect(json<{ data: { falharam: number } }>(resposta).data.falharam, resposta.body).toBe(0);

    // BASE: linha 13 (11 e 12 ocupadas), grade aumentada, formato e validacao da linha-modelo 12.
    expect(planilha.valor(BASE, "K13")).toBe(base.id_origem);
    expect(planilha.valor(BASE, "C13")).toBe(base.nome);
    expect(planilha.valor(BASE, "B13")).toBe("ATIVO");
    expect(planilha.valor(BASE, "F13")).toBe('=C13&"!"');
    const tipos = planilha.chamadas.map((c) => c.tipo);
    expect(tipos).toContain("appendDimension");
    expect(tipos).toEqual(expect.arrayContaining(["PASTE_FORMAT", "PASTE_DATA_VALIDATION", "PASTE_FORMULA"]));
    // A reserva (so o ID, RAW) vem antes de qualquer outra celula da linha.
    const primeiraDaLinha = planilha.chamadas.find((c) => c.detalhe.includes("13="));
    expect(primeiraDaLinha).toEqual({ tipo: "RAW", detalhe: `'${BASE}'!K13=${base.id_origem}` });

    // Copia da TNP: a faixa da TNP na MESMA linha; a da LI fica intacta.
    expect(planilha.valor(BASE, "G13")).toBe("4.5");
    expect(planilha.valor(BASE, "I13")).toBe("");
    expect(planilha.valor(BASE, "J13")).toBe("");
    // A aba (TNP) recebe a mesma linha.
    expect(planilha.valor(ABA_TNP, "C13")).toBe(base.nome);
    expect(planilha.valor(ABA_TNP, "G13")).toBe("4.5");

    const linhas = await consultarTodos<{ linha: number; status: string }>(
      "select linha, status from produtos_planilha_sincronizacoes where produto_id = $1 or produto_base_id = $2",
      [produtoId, base.base_id]
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.linha === 13 && l.status === "sincronizado")).toBe(true);

    // Reenvio do mesmo produto acha a linha pelo ID: nada de linha nova.
    const appendsAntes = tipos.filter((t) => t === "appendDimension").length;
    await executarSql("update produtos_planilha_sincronizacoes set status = 'pendente'");
    await reenviar();
    expect(planilha.chamadas.filter((c) => c.tipo === "appendDimension")).toHaveLength(appendsAntes);
    expect(planilha.valor(BASE, "K14")).toBe("");
  });

  it("Deve_RecusarACopiaDaLoja_QuandoABaseNaoTemLinha", async () => {
    const criado = await criar("PLANILHA SEM LINHA");
    expect(criado.statusCode, criado.body).toBe(201);
    const produtoId = json<{ data: { id: string } }>(criado).data.id;
    const base = (await vinculo(produtoId))!;
    // A BASE "ja sincronizou" sem ter linha: a copia nao pode recadastrar o produto.
    await executarSql(
      "update produtos_planilha_sincronizacoes set status = 'sincronizado' where produto_base_id = $1",
      [base.base_id]
    );
    const linhasAntes = planilha.abas.get(BASE)!.meta.rowCount;
    await reenviar();
    const copia = await consultarUm<{ status: string; ultimo_erro: string }>(
      "select status, ultimo_erro from produtos_planilha_sincronizacoes where produto_id = $1",
      [produtoId]
    );
    expect(copia?.status).toBe("falhou");
    expect(copia?.ultimo_erro).toContain("Linha do produto da BASE desconhecida");
    expect(planilha.abas.get(BASE)!.meta.rowCount).toBe(linhasAntes);
  });

  it("Deve_RecusarOsClientesReaisDoGoogle_SobTeste", async () => {
    const real = new GoogleSheetsGatewayReal(
      () => Promise.reject(new Error("rede")),
      async () => "token"
    );
    await expect(real.getSheets("x")).rejects.toBeInstanceOf(GoogleSheetsSobTesteError);
    const drive = new GoogleDriveCreareGateway(
      () => Promise.reject(new Error("rede")),
      async () => "token"
    );
    await expect(drive.acharArquivo("pasta", "cadastro-tnp.txt")).rejects.toBeInstanceOf(CreareDriveSobTesteError);
  });

  it("Deve_PublicarOTxtNoDrive_SoQuandoLigado_E_SoAtualizandoArquivoExistente", async () => {
    env.CREARE_DRIVE_ENABLED = false;
    expect(await publicarCreareNoDrive("TNP")).toBe("desligado");

    env.CREARE_DRIVE_ENABLED = true;
    env.CREARE_DRIVE_FOLDERS_JSON = "";
    expect(await publicarCreareNoDrive("TNP")).toBe("sem_pasta");
    env.CREARE_DRIVE_FOLDERS_JSON = JSON.stringify({ TNP: "pasta-tnp" });

    env.CREARE_EXPORT_ENABLED = true;
    env.CREARE_STORE_CONFIG_JSON = JSON.stringify(CONFIG_CREARE);
    await executarSql("delete from sia_produto_depara where empresa_id = $1", [idsTeste.empresaA]);
    expect(await publicarCreareNoDrive("TNP")).toBe("sem_depara");
    await executarSql(
      `insert into sia_produto_depara (empresa_id, codigo_barras, chave_barras, coditem, pesavel)
       values ($1, '00000000888888', '888888', '888888', 'N')`,
      [idsTeste.empresaA]
    );

    const enviados: Array<{ id: string; tamanho: number }> = [];
    let arquivoExiste = false;
    definirDriveDoCreareParaTeste({
      async acharArquivo(pasta, nome) {
        expect(pasta).toBe("pasta-tnp");
        expect(nome).toBe("cadastro-tnp.txt");
        return arquivoExiste ? "arquivo-1" : null;
      },
      async atualizarArquivo(id, conteudo) {
        enviados.push({ id, tamanho: conteudo.length });
      }
    });
    expect(await publicarCreareNoDrive("TNP")).toBe("sem_arquivo");
    expect(enviados).toHaveLength(0);

    arquivoExiste = true;
    expect(await publicarCreareNoDrive("TNP")).toBe("publicado");
    expect(enviados).toEqual([{ id: "arquivo-1", tamanho: expect.any(Number) }]);
    expect(enviados[0]!.tamanho % 365).toBe(0);
  });
});

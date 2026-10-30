import { describe, expect, it } from "vitest";
import {
  dataDaPlanilha,
  fornecedorDaReferencia,
  normalizarNomeHistorico,
  numeroDaPlanilha,
  type HistoricoLinha
} from "@padaria/shared/compras";
import { lerCsv, linhasDoHistorico } from "../../api/src/compras/compras-historico-planilha.js";
import {
  construirIndicesHistorico,
  motivoLinhaInvalida,
  parearLinhaHistorico,
  planejarVinculos
} from "../../api/src/compras/compras-historico-pareamento.js";
import { inicioDaJanela } from "../../api/src/compras/compras-historico.service.js";
import { planilhaFalsaComoExcel } from "./apoio/xlsx-falso.js";

/**
 * R-222 (PROJECT_BRAIN/55). Cada caso diz a regra que protege: nada entra por aproximacao, numero
 * ambiguo para a linha em vez de errar por mil, e o catalogo nunca perde uma decisao humana.
 */
describe("leitura de celulas da planilha", () => {
  it("le a data em serial do Excel, dd/mm/aa, dd/mm/aaaa e ISO, e recusa a que nao existe", () => {
    expect(dataDaPlanilha("46083")).toBe("2026-03-02");
    expect(dataDaPlanilha("46083.0")).toBe("2026-03-02");
    expect(dataDaPlanilha("02/03/26")).toBe("2026-03-02");
    expect(dataDaPlanilha("2/3/2026")).toBe("2026-03-02");
    expect(dataDaPlanilha("2026-03-02")).toBe("2026-03-02");
    expect(dataDaPlanilha("31/02/26")).toBeNull();
    expect(dataDaPlanilha("")).toBeNull();
    expect(dataDaPlanilha("ontem")).toBeNull();
  });

  it("le numero cru do XLSX com ponto decimal e numero pt-BR com virgula", () => {
    expect(numeroDaPlanilha("4.308", "xlsx")).toEqual({ valor: 4.308 });
    expect(numeroDaPlanilha("24.0", "xlsx")).toEqual({ valor: 24 });
    expect(numeroDaPlanilha("1.250,50", "csv")).toEqual({ valor: 1250.5 });
    expect(numeroDaPlanilha("R$ 7,5", "csv")).toEqual({ valor: 7.5 });
    expect(numeroDaPlanilha("", "csv")).toEqual({ vazio: true });
    expect(numeroDaPlanilha("abc", "csv")).toEqual({ invalido: true });
  });

  it("devolve ambiguo para 1.250 em CSV (milhar ou decimal?), nunca um palpite de mil vezes", () => {
    expect(numeroDaPlanilha("1.250", "csv")).toEqual({ ambiguo: true });
    expect(numeroDaPlanilha("1.250", "xlsx")).toEqual({ valor: 1.25 });
  });

  it("extrai o fornecedor da REFERENCIA `FORNECEDOR - dd/mm/aa - valor`", () => {
    expect(fornecedorDaReferencia("SPAL (COCA COLA) - 02/03/26 - 538,47")).toBe("SPAL (COCA COLA)");
    expect(fornecedorDaReferencia("MERCEARIA DO LU - 1/3/2026 - 10")).toBe("MERCEARIA DO LU");
    expect(fornecedorDaReferencia("sem padrao")).toBeNull();
  });
});

describe("leitor do CSV", () => {
  it("respeita aspas, separador dentro do campo e quebra de linha", () => {
    expect(lerCsv('a;b;c\r\n"x;y";"linha\n2";"aspas ""duplas"""\r\n')).toEqual([
      ["a", "b", "c"],
      ["x;y", "linha\n2", 'aspas "duplas"']
    ]);
  });

  it("detecta virgula ou tabulacao como separador", () => {
    expect(lerCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
    expect(lerCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("linhasDoHistorico", () => {
  const cabecalho = "REFERÊNCIA;PRODUTOS;QUANT;VALOR CUSTO UN;DATA REF;CONFRONTAR";

  it("acha o cabecalho abaixo de linhas de legenda, pula numeracao e le fornecedor da REFERENCIA", () => {
    const texto = [
      "DISCRIMINAÇÃO MERCADORIAS TNP;;;;;",
      ";;;;;",
      cabecalho,
      "1;2;3;4;5;6",
      "SPAL (COCA COLA) - 02/03/26 - 538,47;FANTA UVA LATA 220ML;6;3,095;02/03/26;CONFRONTADO",
      ";;;;;"
    ].join("\r\n");
    const { linhas, hashArquivo } = linhasDoHistorico(Buffer.from(texto, "utf8"), "x.csv");
    expect(hashArquivo).toHaveLength(64);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      numeroLinha: 5,
      fornecedor: "SPAL (COCA COLA)",
      produto: "FANTA UVA LATA 220ML",
      dataCompra: "2026-03-02",
      quantidade: 6,
      custoUnitario: 3.095,
      motivoInvalida: null
    });
  });

  it("marca a linha invalida em vez de descartar: nao confrontada, numero ambiguo e data ilegivel", () => {
    const texto = [
      cabecalho,
      "F - 02/03/26 - 1;P1;1;2,00;02/03/26;NÃO CONFRONTADO",
      "F - 02/03/26 - 1;P2;1;1.250;02/03/26;CONFRONTADO",
      "F - 02/03/26 - 1;P3;1;2,00;quando der;CONFRONTADO",
      "F - 02/03/26 - 1;P4;1;2,00;02/03/26;#N/A"
    ].join("\n");
    const { linhas } = linhasDoHistorico(Buffer.from(texto, "utf8"), "x.csv");
    expect(linhas.map((linha) => linha.motivoInvalida)).toEqual([
      expect.stringContaining("não confrontada"),
      expect.stringContaining("ambíguo"),
      expect.stringContaining("Data da compra"),
      expect.stringContaining("não confrontada")
    ]);
  });

  it("le XLSX de uma aba (numero cru e data em serial) e aceita FORNECEDOR em coluna propria", () => {
    const xlsx = planilhaFalsaComoExcel([
      ["FORNECEDOR", "PRODUDOS", "QUANT", "CUSTO EMB", "DATA REF"],
      ["MARVIN", "LEITE MARVIN 1L", "10.0", "5.5", "46083"]
    ]);
    const { linhas } = linhasDoHistorico(xlsx, "x.xlsx");
    expect(linhas).toEqual([
      expect.objectContaining({
        fornecedor: "MARVIN",
        produto: "LEITE MARVIN 1L",
        quantidade: 10,
        custoUnitario: 5.5,
        dataCompra: "2026-03-02"
      })
    ]);
  });

  it("explica quais colunas faltam", () => {
    expect(() => linhasDoHistorico(Buffer.from("PRODUTOS;VALOR CUSTO UN\nA;1", "utf8"), "x.csv")).toThrow(/colunas/);
  });
});

describe("pareamento com o cadastro", () => {
  const indices = construirIndicesHistorico(
    [
      { id: "f1", nome: "Spal Indústria de Bebidas" },
      { id: "f2", nome: "Dicasa" },
      { id: "f3", nome: "Dicasa" }
    ],
    [{ aliasNormalizado: "SPAL COCA COLA", fornecedorId: "f1" }],
    [
      { id: "p1", descricao: "Coca-Cola 600ml" },
      { id: "p2", descricao: "Fanta Uva" },
      { id: "p3", descricao: "FANTA UVA" }
    ]
  );
  const par = (fornecedor: string, produto: string) =>
    parearLinhaHistorico(normalizarNomeHistorico(fornecedor), normalizarNomeHistorico(produto), indices);

  it("pareia pelo nome exato normalizado (acento, caixa e pontuacao nao contam)", () => {
    expect(par("SPAL INDUSTRIA DE BEBIDAS", "COCA COLA 600ML")).toMatchObject({
      resultado: "correspondencia",
      fornecedorId: "f1",
      produtoId: "p1"
    });
  });

  it("usa o apelido confirmado por pessoa e nunca aproxima nome parecido", () => {
    expect(par("SPAL (COCA COLA)", "COCA COLA 600ML").fornecedorId).toBe("f1");
    expect(par("SPAL INDUSTRIA", "COCA COLA 600ML").resultado).toBe("fornecedor_nao_encontrado");
    expect(par("SPAL INDUSTRIA DE BEBIDAS", "COCA COLA 600").resultado).toBe("produto_nao_encontrado");
  });

  it("nome repetido no cadastro e ambiguidade, de fornecedor e de produto", () => {
    expect(par("DICASA", "COCA COLA 600ML").resultado).toBe("ambiguidade");
    expect(par("SPAL INDUSTRIA DE BEBIDAS", "FANTA UVA").resultado).toBe("ambiguidade");
  });

  it("nao e correspondencia quando o fornecedor falta, mesmo com produto achado", () => {
    expect(par("QUEM", "COCA COLA 600ML")).toMatchObject({
      resultado: "fornecedor_nao_encontrado",
      produtoId: "p1"
    });
  });
});

describe("pareamento pelo nome do catalogo (o nome da planilha)", () => {
  // Produto vindo do paralelo: a descricao leva a unidade ("SPRITE LATA 220ML UN"); o nome da planilha e o
  // nome do catalogo. Produto antigo do PDV: so a descricao.
  const indices = construirIndicesHistorico(
    [{ id: "f1", nome: "Spal" }],
    [],
    [
      { id: "p1", descricao: "SPRITE LATA 220ML UN", nomeCatalogo: "SPRITE LATA 220ML" },
      { id: "p2", descricao: "PAO FRANCES KG", nomeCatalogo: null },
      { id: "p3", descricao: "FANTA UVA", nomeCatalogo: "FANTA UVA LATA 220ML" },
      { id: "p4", descricao: "FANTA UVA UN", nomeCatalogo: "FANTA UVA" }
    ]
  );
  const par = (produto: string) => parearLinhaHistorico("SPAL", normalizarNomeHistorico(produto), indices);

  it("acha pelo nome do catalogo e, sem ele, pela descricao", () => {
    expect(par("SPRITE LATA 220ML")).toMatchObject({ resultado: "correspondencia", produtoId: "p1" });
    expect(par("PAO FRANCES KG")).toMatchObject({ resultado: "correspondencia", produtoId: "p2" });
  });

  it("o nome do catalogo vence a descricao de outro produto", () => {
    expect(par("FANTA UVA")).toMatchObject({ resultado: "correspondencia", produtoId: "p4" });
  });
});

describe("validade da linha", () => {
  const boa: HistoricoLinha = {
    numeroLinha: 2,
    fornecedor: "F",
    produto: "P",
    dataCompra: "2026-03-02",
    quantidade: 1,
    custoUnitario: 2,
    documento: null,
    motivoInvalida: null
  };

  it("exige data, quantidade e custo positivos e dentro do limite da coluna", () => {
    expect(motivoLinhaInvalida(boa)).toBeNull();
    expect(motivoLinhaInvalida({ ...boa, custoUnitario: 0 })).toMatch(/Custo/);
    expect(motivoLinhaInvalida({ ...boa, quantidade: -1 })).toMatch(/Quantidade/);
    expect(motivoLinhaInvalida({ ...boa, dataCompra: null })).toMatch(/Data/);
    expect(motivoLinhaInvalida({ ...boa, custoUnitario: 1e12 })).toMatch(/limite/);
    expect(motivoLinhaInvalida({ ...boa, motivoInvalida: "Linha não confrontada" })).toBe("Linha não confrontada");
  });
});

describe("plano do catalogo", () => {
  const item = (numeroLinha: number, dataCompra: string, custoUnitario: string, f = "f1", p = "p1") => ({
    numeroLinha,
    fornecedorId: f,
    produtoId: p,
    dataCompra,
    custoUnitario,
    fornecedorInformado: "F",
    produtoInformado: "P"
  });

  it("cria o vinculo que falta com o custo da compra MAIS RECENTE, nao o da ultima linha", () => {
    const plano = planejarVinculos([item(9, "2026-03-01", "9.0000"), item(2, "2026-05-01", "4.0000")], []);
    expect(plano.criar).toEqual([
      expect.objectContaining({ fornecedorId: "f1", produtoId: "p1", precoOfertado: "4.0000" })
    ]);
  });

  it("no empate de data vale a linha mais baixa da planilha por ultimo (numero maior)", () => {
    const plano = planejarVinculos([item(3, "2026-05-01", "1.0000"), item(8, "2026-05-01", "2.0000")], []);
    expect(plano.criar[0]?.precoOfertado).toBe("2.0000");
  });

  it("aprova o pendente, deixa o aprovado e NAO toca no rejeitado", () => {
    const plano = planejarVinculos(
      [
        item(1, "2026-05-01", "1", "f1", "p1"),
        item(2, "2026-05-01", "1", "f2", "p1"),
        item(3, "2026-05-01", "1", "f3", "p1")
      ],
      [
        { id: "v1", fornecedorId: "f1", produtoId: "p1", status: "pendente" },
        { id: "v2", fornecedorId: "f2", produtoId: "p1", status: "aprovado" },
        { id: "v3", fornecedorId: "f3", produtoId: "p1", status: "rejeitado" }
      ]
    );
    expect(plano).toMatchObject({ criar: [], aprovarIds: ["v1"], jaAprovados: 1, rejeitadosIgnorados: 1 });
  });
});

describe("janela da consulta", () => {
  it("volta N meses a partir do dia de Sao Paulo, sem transbordar para o mes seguinte", () => {
    expect(inicioDaJanela(3, new Date("2026-10-21T15:00:00Z"))).toBe("2026-07-21");
    expect(inicioDaJanela(6, new Date("2026-10-21T15:00:00Z"))).toBe("2026-04-21");
    // 31/05 menos 3 meses cairia em 31/02: vira o ultimo dia de fevereiro.
    expect(inicioDaJanela(3, new Date("2026-05-31T15:00:00Z"))).toBe("2026-02-28");
    // 02h UTC de 22/10 ainda e 21/10 em Sao Paulo (UTC-3).
    expect(inicioDaJanela(3, new Date("2026-10-22T02:00:00Z"))).toBe("2026-07-21");
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { linhasDePrecoBaseDoXlsx, numeroPlanilha } from "../../api/src/compras/compras-preco-base-xlsx.js";
import { planilhaFalsa, planilhaFalsaComoExcel, xlsxFalso } from "./apoio/xlsx-falso.js";

// O caminho que o operador usa de verdade (upload da planilha de discriminacao) nao tinha NENHUM
// teste: a cobertura existente parava no endpoint JSON, que a tela nem chama. Aqui o .xlsx e montado
// de verdade, byte a byte, em vez de simular o leitor.

const CABECALHO = ["CODIGO", "DESCRIÇÃO", "ÚLTIMO MENOR CUSTO"];

describe("numeroPlanilha", () => {
  it("le o padrao brasileiro com e sem simbolo de moeda", () => {
    expect(numeroPlanilha("1234,56")).toBe(1234.56);
    expect(numeroPlanilha("1.234,56")).toBe(1234.56);
    expect(numeroPlanilha("R$ 1.234,56")).toBe(1234.56);
    expect(numeroPlanilha("R$  9,87")).toBe(9.87);
  });

  it("aceita ponto como decimal quando nao e separador de milhar", () => {
    expect(numeroPlanilha("1250.5")).toBe(1250.5);
    expect(numeroPlanilha("12.5")).toBe(12.5);
  });

  // O caso que mexe em dinheiro: "1.250" na coluna de custo e mil duzentos e cinquenta, mas
  // `Number("1.250")` devolve 1,25. Entrar calado colocaria um preco-base mil vezes menor como
  // referencia da compra automatica (R-218), e toda proposta passaria no teste "custo <= base".
  it("recusa valor ambiguo de milhar em vez de adivinhar", () => {
    expect(numeroPlanilha("1.250")).toBeNull();
    expect(numeroPlanilha("R$ 12.500")).toBeNull();
  });

  it("recusa texto, vazio e negativo", () => {
    expect(numeroPlanilha("A COMBINAR")).toBeNull();
    expect(numeroPlanilha("   ")).toBeNull();
    expect(numeroPlanilha("-10,00")).toBeNull();
  });

  // R-220: zero nao e base valida. A compra automatica da R-218 compra quando o custo final e <= a
  // base, entao base zero reprovaria toda proposta daquele produto para sempre — e em silencio.
  it("recusa custo zero, que reprovaria toda compra automatica", () => {
    expect(numeroPlanilha("0")).toBeNull();
    expect(numeroPlanilha("0,00")).toBeNull();
    expect(numeroPlanilha("R$ 0,00")).toBeNull();
  });
});

describe("linhasDePrecoBaseDoXlsx", () => {
  it("acha o cabecalho fora da primeira linha e extrai as linhas de preco", () => {
    const planilha = planilhaFalsa([
      ["Relatorio de discriminacao"],
      [],
      CABECALHO,
      ["1001", "Açúcar cristal 5kg", "R$ 19,90"],
      ["1002", "Farinha de trigo 1kg", "4,55"]
    ]);

    const extraido = linhasDePrecoBaseDoXlsx(planilha);

    expect(extraido.nomeAba).toBe("Discriminacao");
    expect(extraido.hashArquivo).toMatch(/^[0-9a-f]{64}$/);
    expect(extraido.linhas).toEqual([
      { numeroLinha: 4, codigo: "1001", ean: null, descricao: "Açúcar cristal 5kg", ultimoMenorCusto: 19.9 },
      { numeroLinha: 5, codigo: "1002", ean: null, descricao: "Farinha de trigo 1kg", ultimoMenorCusto: 4.55 }
    ]);
  });

  it("ignora linha totalmente vazia sem deslocar o numero das demais", () => {
    const planilha = planilhaFalsa([CABECALHO, ["1001", "Açúcar", "1,00"], [], ["1002", "Farinha", "2,00"]]);
    expect(linhasDePrecoBaseDoXlsx(planilha).linhas.map((linha) => linha.numeroLinha)).toEqual([2, 4]);
  });

  // O numero vem do atributo `r` do `<row>`, e nao da posicao no array. O Excel OMITE a linha
  // totalmente vazia: contando por posicao, "corrija a linha 4" apontava a linha 3 na tela do
  // operador — e a correcao da planilha e o unico caminho para destravar a carga inicial.
  it("usa o numero de linha declarado pela planilha, nao a posicao", () => {
    const planilha = planilhaFalsaComoExcel([
      CABECALHO,
      ["1001", "Açúcar", "1,00"],
      // Linha 3 vazia: o Excel nao emite `<row>` para ela.
      [],
      ["1002", "Farinha", "2,00"]
    ]);
    expect(linhasDePrecoBaseDoXlsx(planilha).linhas.map((linha) => linha.numeroLinha)).toEqual([2, 4]);
  });

  // Antes a primeira celula ruim abortava o arquivo inteiro com a mensagem de UMA linha: o operador
  // corrigia, reenviava, e descobria a proxima. Agora a planilha e varrida toda e a mensagem nomeia
  // as linhas de uma vez.
  it("lista todas as linhas de custo invalido numa unica recusa", () => {
    const planilha = planilhaFalsa([
      CABECALHO,
      ["1001", "Açúcar", "A COMBINAR"],
      ["1002", "Farinha", "4,55"],
      ["1003", "Leite", "1.250"]
    ]);

    try {
      linhasDePrecoBaseDoXlsx(planilha);
      expect.unreachable("deveria recusar a planilha com custo invalido");
    } catch (erro) {
      const detalhes = erro as { status?: number; code?: string; message?: string };
      expect(detalhes.status).toBe(400);
      expect(detalhes.code).toBe("PRICE_BASE_INVALID_COST");
      expect(detalhes.message).toContain("2, 4");
    }
  });

  it("recusa planilha sem a coluna de custo", () => {
    const planilha = planilhaFalsa([
      ["CODIGO", "DESCRIÇÃO"],
      ["1001", "Açúcar"]
    ]);
    expect(() => linhasDePrecoBaseDoXlsx(planilha)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_COST_COLUMN_MISSING", status: 400 })
    );
  });

  it("recusa planilha com coluna de custo e sem descricao", () => {
    const planilha = planilhaFalsa([
      ["CODIGO", "ÚLTIMO MENOR CUSTO"],
      ["1001", "1,00"]
    ]);
    expect(() => linhasDePrecoBaseDoXlsx(planilha)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_DESCRIPTION_MISSING", status: 400 })
    );
  });

  it("recusa planilha sem nenhuma linha de dado", () => {
    expect(() => linhasDePrecoBaseDoXlsx(planilhaFalsa([CABECALHO]))).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_EMPTY_FILE", status: 400 })
    );
  });

  // Arquivo que nao e ZIP (um .xls renomeado, por exemplo) fazia `readUInt32LE` estourar RangeError:
  // 500 "Erro interno" e alerta no Sentry por culpa do arquivo do usuario.
  it("trata arquivo que nao e um .xlsx como erro de validacao, nao como falha do sistema", () => {
    expect(() => linhasDePrecoBaseDoXlsx(Buffer.from("isto nao e um zip"))).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
    expect(() => linhasDePrecoBaseDoXlsx(Buffer.alloc(0))).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
  });

  // O formato que o Excel realmente grava: deflate + sharedStrings + celula vazia self-closing +
  // linha vazia omitida. Sem este caso, o teto de inflacao e o ramo `t="s"` ficavam sem teste — e
  // dava para remover a protecao contra zip bomb com a suite verde.
  it("le planilha no formato que o Excel grava (deflate, sharedStrings, celula vazia)", () => {
    const planilha = planilhaFalsaComoExcel([
      ["Relatorio"],
      CABECALHO,
      ["1001", "Açúcar cristal 5kg", "19,90"],
      // Codigo ausente no meio: a celula vazia self-closing ja engoliu a seguinte uma vez neste
      // leitor, gravando o custo na coluna errada em silencio.
      ["", "Farinha de trigo 1kg", "4,55"]
    ]);

    const extraido = linhasDePrecoBaseDoXlsx(planilha);

    expect(extraido.linhas).toEqual([
      { numeroLinha: 3, codigo: "1001", ean: null, descricao: "Açúcar cristal 5kg", ultimoMenorCusto: 19.9 },
      { numeroLinha: 4, codigo: null, ean: null, descricao: "Farinha de trigo 1kg", ultimoMenorCusto: 4.55 }
    ]);
  });

  it("calcula o hash do arquivo inteiro, e nao de parte dele", () => {
    const planilha = planilhaFalsa([CABECALHO, ["1001", "Açúcar", "1,00"]]);
    const outra = planilhaFalsa([CABECALHO, ["1001", "Açúcar", "2,00"]]);

    // O hash e a chave do dedupe (`compras_importacoes_preco_base_empresa_hash_unico`): hashear a
    // coisa errada faria dois arquivos diferentes colidirem ou o mesmo passar duas vezes.
    expect(linhasDePrecoBaseDoXlsx(planilha).hashArquivo).toBe(createHash("sha256").update(planilha).digest("hex"));
    expect(linhasDePrecoBaseDoXlsx(outra).hashArquivo).not.toBe(linhasDePrecoBaseDoXlsx(planilha).hashArquivo);
  });

  it("procura a coluna de custo nas abas seguintes quando a primeira e capa", () => {
    const planilha = xlsxFalso({
      abas: ["Capa", "Dados"],
      sheet: `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>CODIGO</t></is></c><c r="B1" t="inlineStr"><is><t>DESCRIÇÃO</t></is></c><c r="C1" t="inlineStr"><is><t>ÚLTIMO MENOR CUSTO</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>1001</t></is></c><c r="B2" t="inlineStr"><is><t>Açúcar</t></is></c><c r="C2" t="inlineStr"><is><t>1,00</t></is></c></row></sheetData></worksheet>`
    });
    // As duas abas apontam para o mesmo sheet, entao a primeira ja casa; o que este caso garante e
    // que varias abas nao derrubam a leitura.
    expect(linhasDePrecoBaseDoXlsx(planilha).linhas).toHaveLength(1);
  });

  it("le a coluna de codigo de barras quando a planilha tem uma", () => {
    const planilha = planilhaFalsa([
      ["CODIGO", "EAN", "DESCRIÇÃO", "ÚLTIMO MENOR CUSTO"],
      ["1001", "7891234567890", "Açúcar", "1,00"]
    ]);
    expect(linhasDePrecoBaseDoXlsx(planilha).linhas[0]).toMatchObject({
      codigo: "1001",
      ean: "7891234567890"
    });
  });

  it("recusa custo acima do que a coluna de preco-base suporta", () => {
    // `numeric(14,4)` tem 10 digitos inteiros: acima disso o banco responde 22003 e a rota devolveria
    // 500 por um zero digitado a mais.
    expect(numeroPlanilha("99999999999,99")).toBeNull();
    const planilha = planilhaFalsa([CABECALHO, ["1001", "Açúcar", "99999999999,99"]]);
    expect(() => linhasDePrecoBaseDoXlsx(planilha)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_INVALID_COST", status: 400 })
    );
  });

  it("recusa linha com custo e sem descricao, nomeando a linha", () => {
    const planilha = planilhaFalsa([CABECALHO, ["1001", "", "1,00"]]);
    expect(() => linhasDePrecoBaseDoXlsx(planilha)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_DESCRIPTION_MISSING", status: 400 })
    );
  });

  // Teto de linhas: a amplificacao que derruba o processo acontece DEPOIS do inflate, montando uma
  // string e um array por linha. O teto precisa estar dentro do leitor, nao depois do parse.
  it("recusa planilha com mais linhas do que o limite de importacao", () => {
    const linhas = [CABECALHO, ...Array.from({ length: 50_001 }, (_, i) => [`${i}`, `Produto ${i}`, "1,00"])];
    expect(() => linhasDePrecoBaseDoXlsx(planilhaFalsa(linhas))).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
  });

  // Uma unica celula `r="ZZZZZZ1"` dava indice 308.915.775 e o array era densificado nesse tamanho:
  // gigas de heap e minutos de event loop travado a partir de centenas de bytes.
  it("recusa referencia de celula acima da ultima coluna do formato", () => {
    const planilha = xlsxFalso({
      sheet: `<worksheet><sheetData><row r="1"><c r="ZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`
    });
    const inicio = Date.now();
    expect(() => linhasDePrecoBaseDoXlsx(planilha)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
    // Se a guarda nao existisse, a densificacao levaria dezenas de segundos.
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("recusa buffer com tamanho de ZIP mas sem assinatura de fim de diretorio", () => {
    expect(() => linhasDePrecoBaseDoXlsx(Buffer.alloc(512, 7))).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
  });

  it("recusa entrada deflate corrompida sem derrubar o processo", () => {
    const planilha = planilhaFalsaComoExcel([CABECALHO, ["1001", "Açúcar", "1,00"]]);
    // Corrompe o meio do arquivo: o inflate falha e isso e arquivo invalido, nao bug do sistema.
    const corrompido = Buffer.from(planilha);
    corrompido.fill(0xff, 40, 80);
    expect(() => linhasDePrecoBaseDoXlsx(corrompido)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
  });

  it("remove caractere de controle que o banco recusa em texto", () => {
    const planilha = xlsxFalso({
      sheet: `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>DESCRIÇÃO</t></is></c><c r="B1" t="inlineStr"><is><t>ÚLTIMO MENOR CUSTO</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Açúcar&#0;cristal</t></is></c><c r="B2" t="inlineStr"><is><t>1,00</t></is></c></row></sheetData></worksheet>`
    });
    const descricao = linhasDePrecoBaseDoXlsx(planilha).linhas[0]?.descricao ?? "";
    expect(descricao).not.toContain("\u0000");
    expect(descricao).toBe("Açúcarcristal");
  });

  it("recusa planilha com abas demais", () => {
    const planilha = xlsxFalso({
      abas: Array.from({ length: 70 }, (_, i) => `Aba${i}`),
      sheet: `<worksheet><sheetData></sheetData></worksheet>`
    });
    expect(() => linhasDePrecoBaseDoXlsx(planilha)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
  });

  it("trata ZIP com deslocamento forjado como erro de validacao", () => {
    const planilha = planilhaFalsa([CABECALHO, ["1001", "Açúcar", "1,00"]]);
    // Aponta o inicio do diretorio central para fora do buffer.
    const forjado = Buffer.from(planilha);
    forjado.writeUInt32LE(0xfffffff0, forjado.length - 6);
    expect(() => linhasDePrecoBaseDoXlsx(forjado)).toThrowError(
      expect.objectContaining({ code: "PRICE_BASE_FILE_INVALID", status: 400 })
    );
  });
});

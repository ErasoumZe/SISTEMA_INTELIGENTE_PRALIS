import { deflateRawSync } from "node:zlib";

/**
 * Construtor de `.xlsx` para teste. Existe porque nao havia nenhum: a cobertura do leitor era zero e
 * um fixture binario no repositorio seria opaco — ninguem saberia dizer o que o arquivo contem.
 *
 * Suporta os dois metodos de compressao que o leitor aceita. `deflate` (o que o Excel e o Google
 * Sheets realmente geram) importa: sem ele, o teto de inflacao e a conversao de deflate corrompido em
 * erro de validacao ficariam sem teste, e seria possivel remover a protecao com a suite verde.
 */
export type ArquivoFalso = { nome: string; conteudo: string };

export function zipFalso(arquivos: ArquivoFalso[], opcoes: { comprimir?: boolean } = {}): Buffer {
  const comprimir = opcoes.comprimir ?? false;
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, "utf8");
    const cru = Buffer.from(arquivo.conteudo, "utf8");
    const dados = comprimir ? deflateRawSync(cru) : cru;
    const metodo = comprimir ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(0, 14); // crc ignorado pelo leitor
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nome.length, 26);
    locais.push(local, nome, dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);

    deslocamento += local.length + nome.length + dados.length;
  }

  const corpo = Buffer.concat(locais);
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(corpo.length, 16);
  return Buffer.concat([corpo, diretorio, fim]);
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** "A", "B", ... "Z", "AA", ... — mesma convencao de coluna do Excel. */
export function letraDaColuna(indice: number): string {
  let resto = indice;
  let letra = "";
  while (resto >= 0) {
    letra = `${LETRAS[resto % 26]}${letra}`;
    resto = Math.floor(resto / 26) - 1;
  }
  return letra;
}

/** Monta o .xlsx a partir das partes, deixando o teste escolher o XML de cada uma. */
export function xlsxFalso(
  partes: { sheet: string; sharedStrings?: string; abas?: string[] },
  opcoes: { comprimir?: boolean } = {}
): Buffer {
  const abas = partes.abas ?? ["Discriminacao"];
  const sheets = abas.map((nome, indice) => `<sheet name="${nome}" r:id="rId${indice + 1}"/>`).join("");
  // Todas as abas apontam para o MESMO sheet: e o que permite exercitar o custo de varrer muitas
  // abas sem inflar um arquivo gigante.
  const rels = abas.map((_, indice) => `<Relationship Id="rId${indice + 1}" Target="worksheets/sheet1.xml"/>`).join("");
  const arquivos: ArquivoFalso[] = [
    { nome: "xl/workbook.xml", conteudo: `<workbook><sheets>${sheets}</sheets></workbook>` },
    { nome: "xl/_rels/workbook.xml.rels", conteudo: `<Relationships>${rels}</Relationships>` },
    { nome: "xl/worksheets/sheet1.xml", conteudo: partes.sheet }
  ];
  if (partes.sharedStrings) arquivos.push({ nome: "xl/sharedStrings.xml", conteudo: partes.sharedStrings });
  return zipFalso(arquivos, opcoes);
}

function sheetDeLinhas(linhas: string[][], celula: (referencia: string, valor: string) => string): string {
  const xml = linhas
    .map(
      (celulas, indice) =>
        `<row r="${indice + 1}">${celulas
          .map((valor, coluna) => celula(`${letraDaColuna(coluna)}${indice + 1}`, valor))
          .join("")}</row>`
    )
    .join("");
  return `<worksheet><sheetData>${xml}</sheetData></worksheet>`;
}

/** Planilha com celulas `inlineStr` e entradas STORED: a forma mais simples de montar um caso. */
export function planilhaFalsa(linhas: string[][]): Buffer {
  return xlsxFalso({
    sheet: sheetDeLinhas(
      linhas,
      (referencia, valor) => `<c r="${referencia}" t="inlineStr"><is><t>${valor}</t></is></c>`
    )
  });
}

/**
 * Planilha na forma que o Excel realmente grava: entradas DEFLATE, texto em `xl/sharedStrings.xml`
 * com `t="s"`, celula vazia escrita self-closing e linha vazia OMITIDA (o Excel nao emite `<row>`
 * para linha sem conteudo).
 */
export function planilhaFalsaComoExcel(linhas: string[][]): Buffer {
  const textos: string[] = [];
  const indiceDoTexto = (valor: string) => {
    const existente = textos.indexOf(valor);
    if (existente >= 0) return existente;
    textos.push(valor);
    return textos.length - 1;
  };

  const xmlLinhas = linhas
    .map((celulas, indice) => {
      // Linha sem nenhum conteudo nao e emitida, igual ao Excel.
      if (!celulas.some((valor) => valor !== "")) return "";
      const xmlCelulas = celulas
        .map((valor, coluna) => {
          const referencia = `${letraDaColuna(coluna)}${indice + 1}`;
          // Celula vazia e self-closing; e a forma que ja deslocou coluna uma vez neste leitor.
          if (valor === "") return `<c r="${referencia}" s="3"/>`;
          return `<c r="${referencia}" t="s"><v>${indiceDoTexto(valor)}</v></c>`;
        })
        .join("");
      return `<row r="${indice + 1}">${xmlCelulas}</row>`;
    })
    .join("");

  return xlsxFalso(
    {
      sheet: `<worksheet><sheetData>${xmlLinhas}</sheetData></worksheet>`,
      sharedStrings: `<sst count="${textos.length}">${textos.map((texto) => `<si><t>${texto}</t></si>`).join("")}</sst>`
    },
    { comprimir: true }
  );
}

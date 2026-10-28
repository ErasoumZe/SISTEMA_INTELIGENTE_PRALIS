import AdmZip from "adm-zip";
import type { buscarCatalogoParaBackupRepository } from "./produtos-leitura.repository.js";

type CatalogoBackup = Awaited<ReturnType<typeof buscarCatalogoParaBackupRepository>>;
type Celula = string | number | boolean | Date | null;

const COLUNAS_PRODUTOS = [
  "id",
  "loja",
  "empresaId",
  "codigo",
  "codigoInterno",
  "codigoBarras",
  "produtoBaseId",
  "nome",
  "descricao",
  "pesavel",
  "marca",
  "grupo",
  "tipo",
  "status",
  "quantidade",
  "unidade",
  "embalagem",
  "cDe",
  "quantidadeCaixa",
  "medidaCompra",
  "compraAproximada",
  "fotoUrl",
  "habilitarAjuda",
  "estoque",
  "estoqueMin",
  "estoqueMax",
  "areaEstoque",
  "setorEstoque",
  "curvaAbc",
  "quantidadeVariavel",
  "toleranciaQuantidadePercentual",
  "custo",
  "margem",
  "precoVenda",
  "auto",
  "setorVenda1",
  "setorVenda2",
  "localVenda1",
  "localVenda2",
  "transformacaoPrecisao",
  "transformacaoQuantidade",
  "transformacaoUnidade",
  "produtoReceituario",
  "refReceituario",
  "ncm",
  "cest",
  "categoria",
  "cstPisCofins",
  "aliquotaCheia",
  "aliquotaFcp",
  "aliquotaPis",
  "aliquotaCofins",
  "reducaoIcms",
  "icms",
  "tributacaoSimples",
  "aliquotaSimples",
  "icmsRe",
  "baseFiscal",
  "codigoFiscal",
  "produtoFiscal",
  "cstReforma",
  "cClassTrib",
  "aliquotaIbs",
  "aliquotaCbs",
  "origemFiscal",
  "aliquotaEcf",
  "aliquotaEcfId",
  "estadoFiscal",
  "motivoFiscal",
  "conferidoEm",
  "pctNcm",
  "criadoPor",
  "criadoEm"
] as const;
const COLUNAS_PROMOCOES = [
  "produtoId",
  "tipo",
  "valor",
  "descontoFracao",
  "horaInicio",
  "horaFim",
  "seg",
  "ter",
  "qua",
  "qui",
  "sex",
  "sab",
  "dom",
  "validaAte"
] as const;
const COLUNAS_CONVERSOES = ["produtoId", "unidade", "quantidade", "unidadesIndividuais"] as const;

function xmlSeguro(valor: Celula): string {
  const texto = valor instanceof Date ? valor.toISOString() : valor == null ? "" : String(valor);
  let permitido = "";
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (
      codigo === 0x09 ||
      codigo === 0x0a ||
      codigo === 0x0d ||
      (codigo >= 0x20 && codigo <= 0xd7ff) ||
      (codigo >= 0xe000 && codigo <= 0xfffd) ||
      (codigo >= 0x10000 && codigo <= 0x10ffff)
    )
      permitido += caractere;
  }
  return permitido
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function coluna(indice: number): string {
  let n = indice + 1;
  let nome = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    nome = String.fromCharCode(65 + resto) + nome;
    n = Math.floor((n - 1) / 26);
  }
  return nome;
}

function nomeColuna(chave: PropertyKey): string {
  return String(chave)
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase();
}

function montarPlanilha<T extends object>(
  nome: string,
  cabecalhos: readonly (keyof T)[],
  linhas: readonly T[]
): string {
  const matriz = [cabecalhos.map(nomeColuna), ...linhas.map((linha) => cabecalhos.map((chave) => linha[chave]))];
  const dados = matriz
    .map((linha, indiceLinha) => {
      const numeroLinha = indiceLinha + 1;
      const celulas = linha
        .map(
          (valor, indiceColuna) =>
            `<c r="${coluna(indiceColuna)}${numeroLinha}" t="inlineStr"><is><t xml:space="preserve">${xmlSeguro(valor as Celula)}</t></is></c>`
        )
        .join("");
      return `<row r="${numeroLinha}">${celulas}</row>`;
    })
    .join("");
  const ultimaColuna = coluna(cabecalhos.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${dados}</sheetData><autoFilter ref="A1:${ultimaColuna}${matriz.length}"/></worksheet>`;
}

export function montarXlsxCatalogo(dados: CatalogoBackup): Buffer {
  const resumo = [
    { campo: "gerado_em_utc", valor: new Date().toISOString() },
    { campo: "total_produtos", valor: dados.produtos.length },
    { campo: "total_promocoes", valor: dados.promocoes.length },
    { campo: "total_conversoes", valor: dados.conversoes.length },
    { campo: "escopo", valor: "Todas as empresas autorizadas ao administrador" },
    {
      campo: "observacao",
      valor: "Inclui status ativos e inativos; saldo exportado como fotografia, sem criar movimento."
    }
  ];
  const abas = [
    { nome: "Resumo", colunas: ["campo", "valor"] as const, linhas: resumo },
    { nome: "Produtos", colunas: COLUNAS_PRODUTOS, linhas: dados.produtos },
    { nome: "Promocoes", colunas: COLUNAS_PROMOCOES, linhas: dados.promocoes },
    { nome: "Conversoes", colunas: COLUNAS_CONVERSOES, linhas: dados.conversoes }
  ];
  const zip = new AdmZip();
  const tiposFolhas = abas
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tiposFolhas}</Types>`
    )
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    )
  );
  zip.addFile(
    "xl/workbook.xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas.map((aba, i) => `<sheet name="${aba.nome}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`
    )
  );
  zip.addFile(
    "xl/_rels/workbook.xml.rels",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`
    )
  );
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(montarPlanilha("Resumo", ["campo", "valor"], resumo)));
  zip.addFile("xl/worksheets/sheet2.xml", Buffer.from(montarPlanilha("Produtos", COLUNAS_PRODUTOS, dados.produtos)));
  zip.addFile("xl/worksheets/sheet3.xml", Buffer.from(montarPlanilha("Promocoes", COLUNAS_PROMOCOES, dados.promocoes)));
  zip.addFile(
    "xl/worksheets/sheet4.xml",
    Buffer.from(montarPlanilha("Conversoes", COLUNAS_CONVERSOES, dados.conversoes))
  );
  return zip.toBuffer();
}

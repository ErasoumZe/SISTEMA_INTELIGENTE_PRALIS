import type { ItemFonteCentral, LojaProdutoCentral } from "./central-reconciliacao.js";

export const FONTES_ARQUIVO_CENTRAL = [
  "sia_li",
  "compilart_tnp",
  "planilha_tnp",
  "fiscal_tnp",
  "planilha_nova",
  "vendidos_tnp"
] as const;

export type FonteArquivoCentral = (typeof FONTES_ARQUIVO_CENTRAL)[number];

const LOJA_POR_FONTE: Record<FonteArquivoCentral, LojaProdutoCentral> = {
  sia_li: "LI",
  compilart_tnp: "TNP",
  planilha_tnp: "TNP",
  fiscal_tnp: "TNP",
  planilha_nova: "BASE",
  vendidos_tnp: "TNP"
};

export const ARQUIVOS_FONTE_CENTRAL: Record<FonteArquivoCentral, string> = {
  sia_li: "fonte_sia_lisboa.csv",
  compilart_tnp: "fonte_compilart_tnp.csv",
  planilha_tnp: "fonte_planilha_antiga_tnp.csv",
  fiscal_tnp: "fonte_fiscal_tnp_contabilidade.csv",
  planilha_nova: "fonte_planilha_nova.csv",
  vendidos_tnp: "fonte_vendidos_tnp.csv"
};

export class ErroFonteCentral extends Error {
  constructor(
    message: string,
    readonly code: "CSV_INVALIDO" | "CABECALHO_INVALIDO" | "LINHA_SEM_IDENTIDADE"
  ) {
    super(message);
    this.name = "ErroFonteCentral";
  }
}

/** CSV com aspas escapadas; `split(';')` quebra campos que contêm separadores. */
export function parseCsvCentral(conteudo: string, separador = ";"): string[][] {
  const texto = conteudo.replace(/^\uFEFF/u, "");
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice]!;
    if (entreAspas) {
      if (caractere === '"' && texto[indice + 1] === '"') {
        campo += '"';
        indice += 1;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        campo += caractere;
      }
      continue;
    }

    if (caractere === '"') entreAspas = true;
    else if (caractere === separador) {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n") {
      linha.push(campo.replace(/\r$/u, ""));
      if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += caractere;
    }
  }

  if (entreAspas) throw new ErroFonteCentral("O CSV terminou dentro de um campo entre aspas.", "CSV_INVALIDO");
  if (campo !== "" || linha.length > 0) {
    linha.push(campo.replace(/\r$/u, ""));
    if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
  }
  return linhas;
}

function normalizarCabecalho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "");
}

function limparValor(valor: string | undefined): string {
  const texto = (valor ?? "").trim();
  const protegido = texto.match(/^="?(.*?)"?$/u);
  return (protegido?.[1] ?? texto).replace(/^"|"$/gu, "").trim();
}

function lerAtivo(valor: string): boolean | null {
  const chave = limparValor(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toUpperCase();
  if (["A", "S", "SIM", "ATIVO", "TRUE", "1"].includes(chave)) return true;
  if (["I", "N", "NAO", "INATIVO", "FALSE", "0"].includes(chave)) return false;
  return null;
}

function valorCabecalho(registro: Map<string, string>, ...nomes: string[]): string {
  for (const nome of nomes) {
    const valor = registro.get(normalizarCabecalho(nome));
    if (valor !== undefined) return limparValor(valor);
  }
  return "";
}

function decimalLiteral(valor: string): string | null {
  const limpo = limparValor(valor);
  if (!limpo) return null;
  // Preserva a representação de entrada. Parsing/rounding só ocorrerá depois de
  // uma pessoa confirmar a ação e a fonte que poderá preencher o campo.
  return limpo;
}

function fiscalNulo(): NonNullable<ItemFonteCentral["fiscal"]> {
  return {
    ncm: null,
    cest: null,
    categoriaFiscal: null,
    cstPisCofins: null,
    csosn: null,
    aliquotaEcf: null,
    reducaoIcms: null,
    icms: null,
    icmsEfetivo: null,
    tributacaoSimples: null,
    aliquotaSimples: null,
    baseFiscal: null,
    codigoFiscal: null,
    produtoFiscal: null,
    cstReforma: null,
    cClassTrib: null,
    aliquotaIbs: null,
    aliquotaCbs: null,
    origemFiscal: null,
    aliquotaFcp: null,
    aliquotaPis: null,
    aliquotaCofins: null,
    aliquotaCheia: null,
    pctNcm: null,
    aliquotaEcfId: null,
    estado: null,
    motivo: null,
    conferidoEm: null
  };
}

export function lerFonteProdutosCentral(fonte: FonteArquivoCentral, csv: string): ItemFonteCentral[] {
  const linhas = parseCsvCentral(csv);
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho?.length) throw new ErroFonteCentral("O arquivo está vazio.", "CABECALHO_INVALIDO");

  const cabecalhos = cabecalho.map(normalizarCabecalho);
  if (new Set(cabecalhos.filter(Boolean)).size !== cabecalhos.filter(Boolean).length) {
    throw new ErroFonteCentral("O arquivo tem nomes de coluna duplicados.", "CABECALHO_INVALIDO");
  }
  const temNome =
    cabecalhos.includes("NOME") ||
    cabecalhos.includes("DESCRICAO") ||
    cabecalhos.includes("CADASTROPRODUTOSATUALIZADONOVO");
  const temIdentificador = cabecalhos.some((nome) =>
    ["CODBARRAS", "EAN", "GTIN", "CODINTERNO", "CODIGOINT", "CODITEM", "ID"].includes(nome)
  );
  if (!temNome || !temIdentificador) {
    throw new ErroFonteCentral(
      "A fonte precisa conter nome e ao menos um identificador esperado (ID, código interno ou código de barras).",
      "CABECALHO_INVALIDO"
    );
  }

  return dados.map((colunas, indice) => {
    const registro = new Map(cabecalhos.map((nome, coluna) => [nome, colunas[coluna] ?? ""]));
    const nome = valorCabecalho(registro, "NOME", "DESCRICAO", "CADASTRO PRODUTOS ATUALIZADO NOVO");
    const codigoInterno = valorCabecalho(registro, "COD_INTERNO", "CODIGO INT", "CODIGO INTERNO", "CODITEM");
    const codigoBarras = valorCabecalho(registro, "COD_BARRAS", "CODIGO BARRAS", "EAN", "GTIN");
    const idSistema = valorCabecalho(registro, "ID") || undefined;
    if (!nome && !codigoInterno && !codigoBarras && !idSistema) {
      throw new ErroFonteCentral(`A linha ${indice + 2} não tem identificadores.`, "LINHA_SEM_IDENTIDADE");
    }

    const bruto: Record<string, string> = {};
    cabecalho.forEach((chave, coluna) => {
      bruto[chave.trim()] = colunas[coluna] ?? "";
    });
    const fiscal = fiscalNulo();
    if (fonte === "sia_li" || fonte === "fiscal_tnp") {
      fiscal.ncm = valorCabecalho(registro, "NCM") || null;
      fiscal.cstPisCofins = valorCabecalho(registro, "CST") || null;
      if (fonte === "sia_li") {
        fiscal.csosn = valorCabecalho(registro, "CSOSN") || null;
        fiscal.aliquotaEcf = valorCabecalho(registro, "ALIQ_ECF") || null;
        fiscal.reducaoIcms = decimalLiteral(valorCabecalho(registro, "REDUCAO"));
        fiscal.icms = decimalLiteral(valorCabecalho(registro, "ALIQ_INTERNA"));
      } else {
        fiscal.icmsEfetivo = decimalLiteral(valorCabecalho(registro, "ICMS_EFETIVO"));
      }
    }

    return {
      id: `${fonte}:${indice + 2}`,
      ...(idSistema ? { idSistema } : {}),
      fonte,
      loja: LOJA_POR_FONTE[fonte],
      codigoInterno,
      codigoBarras,
      nome,
      ativo: lerAtivo(valorCabecalho(registro, "ATIVO", "A/I", "V")),
      grupo: fonte === "sia_li" ? valorCabecalho(registro, "GRUPO") || null : null,
      custo: fonte === "compilart_tnp" ? decimalLiteral(valorCabecalho(registro, "CUSTO")) : null,
      venda: fonte === "compilart_tnp" ? decimalLiteral(valorCabecalho(registro, "VENDA")) : null,
      fiscal: Object.values(fiscal).some((valor) => valor !== null) ? fiscal : null,
      raw: bruto
    } satisfies ItemFonteCentral;
  });
}

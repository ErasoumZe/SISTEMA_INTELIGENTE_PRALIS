/**
 * De-para do SIA — leitura e validacao da exportacao do SIA Supervisor, sem tocar em banco.
 *
 * Porte fiel do app oficial de Produtos (`sia-depara.parser.ts` + `separarCatalogo` do
 * `depara-upload.service.ts`, R-222): mesmas colunas, mesmas recusas, mesma tecla padrao, mesmo corte
 * das linhas de entrega. Recebe a planilha ja como linhas de texto — quem le XLSX ou CSV e outro modulo.
 */

/** Mesma normalizacao do oficial: so digitos, sem zeros a esquerda. */
export const chaveDeBarras = (valor: string | number | null | undefined): string =>
  String(valor ?? "")
    .replace(/\D/gu, "")
    .replace(/^0+(?=\d)/u, "");

const semAcento = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");

/** As colunas que interessam, por nome — a exportacao do SIA tem 340. */
const COLUNAS = {
  coditem: ["codproduto", "coditem"],
  codigoBarras: ["codbarras"],
  descricao: ["descricao", "nome"],
  codGrupo: ["codgrupo", "grupo"],
  aliqSaidaEcf: ["aliqsaida", "aliqecf"],
  reducao: ["reducao"],
  aliquotaInterna: ["aliqinterna"],
  cstSaida: ["cstsaida", "cst"],
  csosn: ["csosnempresa", "csosn"],
  ncm: ["ncm"],
  ativo: ["ativo"]
} as const;
type Campo = keyof typeof COLUNAS;

const COLUNAS_BALANCA = {
  pesavel: ["pesavel"],
  teclaBalanca: ["tecla", "teclabalanca"],
  validadeBalanca: ["validade", "validadebalanca"]
} as const;
type CampoBalanca = keyof typeof COLUNAS_BALANCA;
type Indices = Record<Campo, number> & Partial<Record<CampoBalanca, number>>;

export function mapearColunasDoSia(cabecalho: readonly string[]): Indices {
  const normalizado = cabecalho.map((coluna) => semAcento(String(coluna ?? "")));
  const indices: Partial<Indices> = {};
  const faltando: string[] = [];
  for (const [campo, nomes] of Object.entries(COLUNAS) as Array<[Campo, readonly string[]]>) {
    const posicao = normalizado.findIndex((coluna) => nomes.includes(coluna));
    if (posicao < 0) faltando.push(campo);
    else indices[campo] = posicao;
  }
  if (faltando.length) throw new Error(`Colunas não encontradas na exportação: ${faltando.join(", ")}.`);
  for (const [campo, nomes] of Object.entries(COLUNAS_BALANCA) as Array<[CampoBalanca, readonly string[]]>) {
    const posicao = normalizado.findIndex((coluna) => nomes.includes(coluna));
    if (posicao >= 0) indices[campo] = posicao;
  }
  return indices as Indices;
}

/** A planilha tem as colunas do SIA nas primeiras 5 linhas? (a BASE SIA FULL tem o cabecalho na 2a.) */
export function temColunasDoSia(tabela: readonly (readonly string[])[]): boolean {
  return tabela.slice(0, 5).some((linha) => {
    try {
      mapearColunasDoSia(linha);
      return true;
    } catch {
      return false;
    }
  });
}

export interface LinhaDeParaSia {
  coditem: string;
  codigoBarras: string;
  chaveBarras: string;
  descricao: string;
  codGrupo: string;
  aliqSaidaEcf: string;
  reducao: string | null;
  aliquotaInterna: string | null;
  cstSaida: string;
  csosn: string;
  ncm: string;
  ativo: string;
  pesavel: "S" | "N" | null;
  teclaBalanca: string | null;
  validadeBalanca: string | null;
}

/**
 * Tecla de balanca quando a exportacao nao traz uma: `000`, confirmada com o consultor do Creare
 * (oficial). A coluna `Tecla` do SIA Supervisor vem em branco em todas as linhas.
 */
export const TECLA_BALANCA_PADRAO_SIA = "000";

export interface LeituraDeParaSia {
  linhas: LinhaDeParaSia[];
  semBarras: number;
  teclaAssumida: string[];
}

/** Le as linhas da exportacao. Erro de formato (coluna, Pesavel, Tecla/Validade) recusa o arquivo. */
export function lerDeParaSia(tabela: readonly (readonly string[])[]): LeituraDeParaSia {
  let cabecalho = -1;
  let indices: Indices | undefined;
  for (let i = 0; i < Math.min(tabela.length, 5); i += 1) {
    try {
      indices = mapearColunasDoSia(tabela[i] ?? []);
      cabecalho = i;
      break;
    } catch {
      // tenta a proxima linha
    }
  }
  if (!indices) throw new Error("Colunas obrigatórias do SIA não encontradas nas primeiras cinco linhas.");
  const colunas = indices;
  const texto = (linha: readonly string[], campo: Campo) => String(linha[colunas[campo]] ?? "").trim();
  const textoBalanca = (linha: readonly string[], campo: CampoBalanca): string | null => {
    const posicao = colunas[campo];
    return posicao === undefined ? null : String(linha[posicao] ?? "").trim() || null;
  };

  const linhas: LinhaDeParaSia[] = [];
  const teclaAssumida: string[] = [];
  let semBarras = 0;
  for (const linha of tabela.slice(cabecalho + 1)) {
    const coditem = texto(linha, "coditem");
    if (!coditem) continue;
    const codigoBarras = texto(linha, "codigoBarras");
    const chaveBarras = chaveDeBarras(codigoBarras);
    // Sem barras nao ha como casar com o produto: fica de fora e aparece no resumo.
    if (!chaveBarras) {
      semBarras += 1;
      continue;
    }
    const reducao = texto(linha, "reducao").replace(",", ".");
    const aliquotaInterna = texto(linha, "aliquotaInterna").replace(",", ".");
    const pesavel = textoBalanca(linha, "pesavel")?.toUpperCase() ?? null;
    let teclaBalanca = textoBalanca(linha, "teclaBalanca");
    const validadeBalanca = textoBalanca(linha, "validadeBalanca");
    if (pesavel !== null && pesavel !== "S" && pesavel !== "N") {
      throw new Error(`Coditem ${coditem}: Pesável deve ser S ou N; recebido ${pesavel}.`);
    }
    for (const [nome, valor] of [
      ["Tecla", teclaBalanca],
      ["Validade", validadeBalanca]
    ] as const) {
      if (valor !== null && !/^\d{1,3}$/u.test(valor)) {
        throw new Error(`Coditem ${coditem}: ${nome} de balança deve ter até três dígitos.`);
      }
    }
    // Pesavel sem tecla recebe a padrao; a VALIDADE continua obrigatoria (e dado de verdade).
    if (pesavel === "S" && teclaBalanca === null && validadeBalanca !== null) {
      teclaBalanca = TECLA_BALANCA_PADRAO_SIA;
      teclaAssumida.push(coditem);
    }
    linhas.push({
      coditem,
      codigoBarras,
      chaveBarras,
      descricao: texto(linha, "descricao"),
      codGrupo: texto(linha, "codGrupo"),
      aliqSaidaEcf: texto(linha, "aliqSaidaEcf"),
      reducao: reducao && Number.isFinite(Number(reducao)) ? reducao : null,
      aliquotaInterna: aliquotaInterna && Number.isFinite(Number(aliquotaInterna)) ? aliquotaInterna : null,
      cstSaida: texto(linha, "cstSaida"),
      csosn: texto(linha, "csosn"),
      ncm: texto(linha, "ncm"),
      ativo: texto(linha, "ativo"),
      pesavel: pesavel === "S" || pesavel === "N" ? pesavel : null,
      teclaBalanca,
      validadeBalanca
    });
  }
  return { linhas, semBarras, teclaAssumida };
}

/**
 * Onde termina o catalogo e comeca a ENTREGA: pelo codigo, nao pelo nome (o SIA trunca a descricao).
 * Entrega = o mesmo produto de novo para o delivery, com `700000 + codigo`; o PDV e quem cuida dele.
 */
export const PRIMEIRO_CODIGO_DE_ENTREGA_SIA = 700_000;
const ehEntrega = (coditem: string): boolean => {
  const numero = Number(coditem.replace(/\D/gu, ""));
  return Number.isFinite(numero) && numero >= PRIMEIRO_CODIGO_DE_ENTREGA_SIA;
};

/** Frase que confirma a substituicao do de-para inteiro da loja (oficial). */
export const CONFIRMACAO_DEPARA_SIA = "SUBSTITUIR O DE-PARA DESTA LOJA";

export interface CatalogoDeParaSia {
  linhas: LinhaDeParaSia[];
  entrega: number;
  semBarras: number;
  semDadosBalanca: number;
  teclaAssumida: number;
  barrasAmbiguas: Array<{ chave: string; coditens: string[] }>;
  coditensRepetidos: string[];
  faixa: { min: number; max: number } | null;
}

/** Fica so com o catalogo e recalcula as recusas SOBRE ELE (entrega nao e gravada). */
export function catalogoDoDeParaSia(leitura: LeituraDeParaSia): CatalogoDeParaSia {
  const linhas = leitura.linhas.filter((linha) => !ehEntrega(linha.coditem));
  const porChave = new Map<string, string[]>();
  const porCoditem = new Map<string, number>();
  for (const linha of linhas) {
    porChave.set(linha.chaveBarras, [...(porChave.get(linha.chaveBarras) ?? []), linha.coditem]);
    porCoditem.set(linha.coditem, (porCoditem.get(linha.coditem) ?? 0) + 1);
  }
  const numeros = linhas.map((linha) => Number(linha.coditem)).filter(Number.isFinite);
  return {
    linhas,
    entrega: leitura.linhas.length - linhas.length,
    semBarras: leitura.semBarras,
    semDadosBalanca: linhas.filter(
      (linha) =>
        !linha.pesavel || (linha.pesavel === "S" && (linha.teclaBalanca === null || linha.validadeBalanca === null))
    ).length,
    teclaAssumida: leitura.teclaAssumida.filter((coditem) => !ehEntrega(coditem)).length,
    barrasAmbiguas: [...porChave.entries()]
      .filter(([, coditens]) => coditens.length > 1)
      .map(([chave, coditens]) => ({ chave, coditens })),
    coditensRepetidos: [...porCoditem.entries()].filter(([, vezes]) => vezes > 1).map(([coditem]) => coditem),
    faixa: numeros.length ? { min: Math.min(...numeros), max: Math.max(...numeros) } : null
  };
}

/** Motivo que impede gravar o de-para (mesma ordem e textos do oficial), ou null. */
export function recusaDoDeParaSia(catalogo: CatalogoDeParaSia): string | null {
  const [exemplo] = catalogo.barrasAmbiguas;
  if (exemplo) {
    return (
      `Recusado: ${catalogo.barrasAmbiguas.length} código(s) de barras apontam para mais de um produto no SIA ` +
      `(ex.: ${exemplo.chave} → ${exemplo.coditens.join(", ")}). Um sobrescreveria o outro no PDV.`
    );
  }
  if (catalogo.coditensRepetidos.length) {
    return `Recusado: coditem repetido na exportação (${catalogo.coditensRepetidos.slice(0, 10).join(", ")}).`;
  }
  if (!catalogo.linhas.length) {
    return catalogo.entrega > 0
      ? `O arquivo só tem linhas de entrega (código a partir de ${PRIMEIRO_CODIGO_DE_ENTREGA_SIA}). Envie a exportação do catálogo.`
      : "O arquivo não tem nenhuma linha com código de barras.";
  }
  if (catalogo.semDadosBalanca > 0) {
    return (
      `Recusado: ${catalogo.semDadosBalanca} produto(s) sem Pesável S/N ou, quando S, sem Tecla/Validade. ` +
      "Exporte o cadastro atual do SIA com as colunas operacionais de balança."
    );
  }
  return null;
}

/**
 * CSV da exportacao (separador `;`, `,` ou tabulacao, descoberto pela primeira linha; aspas duplas
 * com `""` como escape). Linhas vazias saem.
 */
export function lerCsvDoSia(conteudo: string): string[][] {
  // Tira a marca BOM (U+FEFF) que o Excel poe no inicio do CSV.
  const texto = conteudo.startsWith(String.fromCharCode(0xfeff)) ? conteudo.slice(1) : conteudo;
  const primeira = texto.split(/\r?\n/u, 1)[0] ?? "";
  const separador = [";", "\t", ","].reduce((melhor, candidato) =>
    primeira.split(candidato).length > primeira.split(melhor).length ? candidato : melhor
  );
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let entreAspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i]!;
    if (entreAspas) {
      if (caractere === '"' && texto[i + 1] === '"') {
        celula += '"';
        i += 1;
      } else if (caractere === '"') entreAspas = false;
      else celula += caractere;
      continue;
    }
    if (caractere === '"') entreAspas = true;
    else if (caractere === separador) {
      linha.push(celula);
      celula = "";
    } else if (caractere === "\n" || caractere === "\r") {
      if (caractere === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(celula);
      if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
      linha = [];
      celula = "";
    } else celula += caractere;
  }
  linha.push(celula);
  if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
  return linhas;
}

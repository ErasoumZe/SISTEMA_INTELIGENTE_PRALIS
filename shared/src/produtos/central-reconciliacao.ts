/**
 * Núcleo puro da Central de Produtos, portado do comportamento do cadastro
 * oficial. Apenas propõe grupos e valores com proveniência; não grava nem
 * decide equivalência sozinho.
 */

export type LojaProdutoCentral = "LI" | "TNP" | "BASE" | "HORA";
export type MotivoGrupoCentral =
  | "mesmo_id_sistema"
  | "mesmo_cod_barras"
  | "mesmo_cod_interno"
  | "nome_parecido"
  | "unico";

export interface ItemFonteCentral {
  id: string;
  idSistema?: string;
  fonte: string;
  loja: LojaProdutoCentral;
  codigoInterno: string;
  codigoBarras: string;
  nome: string;
  ativo: boolean | null;
  grupo: string | null;
  custo: string | null;
  venda: string | null;
  fiscal: {
    ncm: string | null;
    cest: string | null;
    categoriaFiscal: string | null;
    cstPisCofins: string | null;
    csosn: string | null;
    aliquotaEcf: string | null;
    reducaoIcms: string | null;
    icms: string | null;
    icmsEfetivo: string | null;
    tributacaoSimples: string | null;
    aliquotaSimples: string | null;
    baseFiscal: string | null;
    codigoFiscal: string | null;
    produtoFiscal: string | null;
    cstReforma: string | null;
    cClassTrib: string | null;
    aliquotaIbs: string | null;
    aliquotaCbs: string | null;
    origemFiscal: string | null;
    aliquotaFcp: string | null;
    aliquotaPis: string | null;
    aliquotaCofins: string | null;
    aliquotaCheia: string | null;
    pctNcm: string | null;
    aliquotaEcfId: string | null;
    estado: string | null;
    motivo: string | null;
    conferidoEm: string | null;
  } | null;
  /** Dados brutos da fonte para auditoria; nunca usar para inferir campo ausente. */
  raw: Record<string, string | number | boolean | null>;
}

export interface CandidatoProdutoCentral {
  nome: string;
  nomeDe: string | null;
  grupo: string | null;
  grupoDe: string | null;
  custo: string | null;
  custoDe: string | null;
  venda: string | null;
  vendaDe: string | null;
  ativo: boolean;
  fiscal: {
    LI: ItemFonteCentral["fiscal"];
    TNP: ItemFonteCentral["fiscal"];
  };
}

export interface GrupoProdutoCentral {
  chave: string;
  motivo: MotivoGrupoCentral;
  itens: ItemFonteCentral[];
  fontes: string[];
  lojas: LojaProdutoCentral[];
  candidato: CandidatoProdutoCentral;
  alertas: {
    nomesDivergentes: boolean;
    codigoBarrasConflitante: boolean;
    semCodigoBarras: boolean;
    semFiscalTnp: boolean;
    semGrupo: boolean;
    jaNaBase: boolean;
  };
}

/** Nome é uma chave fraca: só serve para reunir candidatos para revisão. */
export function normalizarNomeCentral(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\p{Cf}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normalizarBarras(valor: string): string {
  return valor.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function normalizarInterno(valor: string): string {
  const codigo = valor.trim().toUpperCase();
  return /^\d+$/.test(codigo) ? codigo.replace(/^0+(?=\d)/, "") : codigo;
}

/**
 * Para essas fontes a coluna chamada código interno contém o código CREARE,
 * cuja linhagem corresponde ao código de barras das outras fontes TNP.
 */
const FONTES_COM_CODIGO_CREARE_NO_INTERNO = new Set(["planilha_tnp", "fiscal_tnp"]);

export function chaveForteCentral(item: ItemFonteCentral): string {
  const barras = normalizarBarras(item.codigoBarras);
  if (barras) return barras;
  if (FONTES_COM_CODIGO_CREARE_NO_INTERNO.has(item.fonte)) {
    return normalizarBarras(item.codigoInterno);
  }
  return "";
}

const ORDEM_NOME_CANDIDATO = [
  "pralis",
  "compilart_tnp",
  "sia_li",
  "vendas_pdv_12m",
  "planilha_tnp",
  "fiscal_tnp",
  "planilha_nova",
  "vendidos_tnp"
];

function primeiroCampo<T>(
  itens: ItemFonteCentral[],
  ordem: string[],
  extrair: (item: ItemFonteCentral) => T | null | undefined
): { valor: T; fonte: string } | null {
  for (const fonte of ordem) {
    for (const item of itens) {
      if (item.fonte !== fonte) continue;
      const valor = extrair(item);
      if (valor != null && valor !== "") return { valor, fonte };
    }
  }
  return null;
}

export function montarCandidatoProdutoCentral(itens: ItemFonteCentral[]): CandidatoProdutoCentral {
  const nome = primeiroCampo(itens, ORDEM_NOME_CANDIDATO, (item) => item.nome);
  const comercial = ["compilart_tnp", "pralis"];
  const grupo = primeiroCampo(itens, ["sia_li", "pralis"], (item) => item.grupo);
  const custo = primeiroCampo(itens, comercial, (item) => item.custo);
  const venda = primeiroCampo(itens, comercial, (item) => item.venda);
  const fiscalLI = itens.find((item) => item.fonte === "sia_li")?.fiscal ?? null;
  const fiscalTNP = itens.find((item) => item.fonte === "fiscal_tnp")?.fiscal ?? null;

  return {
    nome: nome?.valor ?? "",
    nomeDe: nome?.fonte ?? null,
    grupo: grupo?.valor ?? null,
    grupoDe: grupo?.fonte ?? null,
    custo: custo?.valor ?? null,
    custoDe: custo?.fonte ?? null,
    venda: venda?.valor ?? null,
    vendaDe: venda?.fonte ?? null,
    ativo: itens.some((item) => item.ativo === true),
    fiscal: { LI: fiscalLI, TNP: fiscalTNP }
  };
}

function motivoDoGrupo(itens: ItemFonteCentral[]): MotivoGrupoCentral {
  if (itens.length === 1) return "unico";
  const idsSistema = itens.map((item) => item.idSistema).filter(Boolean);
  if (new Set(idsSistema).size < idsSistema.length) return "mesmo_id_sistema";

  const chavesFortes = itens.map(chaveForteCentral).filter(Boolean);
  if (new Set(chavesFortes).size < chavesFortes.length) return "mesmo_cod_barras";

  const codigosPorLoja = new Map<string, string[]>();
  for (const item of itens) {
    if (!item.codigoInterno.trim() || FONTES_COM_CODIGO_CREARE_NO_INTERNO.has(item.fonte)) continue;
    const codigos = codigosPorLoja.get(item.loja) ?? [];
    codigos.push(normalizarInterno(item.codigoInterno));
    codigosPorLoja.set(item.loja, codigos);
  }
  if ([...codigosPorLoja.values()].some((codigos) => new Set(codigos).size < codigos.length)) {
    return "mesmo_cod_interno";
  }

  return "nome_parecido";
}

class Agrupador {
  private readonly pais = new Map<string, string>();

  achar(chave: string): string {
    if (!this.pais.has(chave)) this.pais.set(chave, chave);
    const pai = this.pais.get(chave)!;
    if (pai === chave) return chave;
    const raiz = this.achar(pai);
    this.pais.set(chave, raiz);
    return raiz;
  }

  unir(a: string, b: string): void {
    const raizA = this.achar(a);
    const raizB = this.achar(b);
    if (raizA !== raizB) this.pais.set(raizA, raizB);
  }
}

export function agruparProdutosCentral(
  itens: ItemFonteCentral[],
  chavesBarrasConflitantes: ReadonlySet<string> = new Set()
): GrupoProdutoCentral[] {
  const agrupador = new Agrupador();

  itens.forEach((item, indice) => {
    const chaveLinha = `linha:${indice}`;
    agrupador.achar(chaveLinha);
    if (item.idSistema) agrupador.unir(chaveLinha, `produto:${item.idSistema}`);
    const chaveForte = chaveForteCentral(item);
    if (chaveForte) agrupador.unir(chaveLinha, chaveForte);
    if (item.codigoInterno.trim() && !FONTES_COM_CODIGO_CREARE_NO_INTERNO.has(item.fonte)) {
      agrupador.unir(chaveLinha, `interno:${item.loja}:${normalizarInterno(item.codigoInterno)}`);
    }
    const nome = normalizarNomeCentral(item.nome);
    if (nome) agrupador.unir(chaveLinha, `nome:${nome}`);
  });

  const porRaiz = new Map<string, ItemFonteCentral[]>();
  itens.forEach((item, indice) => {
    const raiz = agrupador.achar(`linha:${indice}`);
    porRaiz.set(raiz, [...(porRaiz.get(raiz) ?? []), item]);
  });

  return [...porRaiz.values()]
    .map((grupoItens) => {
      const chavesFortes = grupoItens.map(chaveForteCentral).filter(Boolean).sort();
      const lojas = [...new Set(grupoItens.map((item) => item.loja))].sort();
      const fontes = [...new Set(grupoItens.map((item) => item.fonte))].sort();
      const nomes = new Set(grupoItens.map((item) => normalizarNomeCentral(item.nome)).filter(Boolean));
      const chaveNome = normalizarNomeCentral(grupoItens[0]?.nome);
      const chave = chavesFortes[0] ?? `nome:${chaveNome || (grupoItens[0]?.id ?? "vazio")}`;
      return {
        chave,
        motivo: motivoDoGrupo(grupoItens),
        itens: grupoItens,
        fontes,
        lojas,
        candidato: montarCandidatoProdutoCentral(grupoItens),
        alertas: {
          nomesDivergentes: nomes.size > 1,
          codigoBarrasConflitante: chavesFortes.some((valor) => chavesBarrasConflitantes.has(valor)),
          semCodigoBarras: grupoItens.every((item) => !normalizarBarras(item.codigoBarras)),
          semFiscalTnp: lojas.includes("TNP") && !fontes.includes("fiscal_tnp"),
          semGrupo: grupoItens.every((item) => !item.grupo?.trim()),
          jaNaBase:
            fontes.includes("pralis") && grupoItens.some((item) => item.fonte === "pralis" && item.loja === "BASE")
        }
      };
    })
    .filter((grupo) => !(grupo.candidato.nome.trim() === "" && grupo.fontes.every((fonte) => fonte === "fiscal_tnp")));
}

/**
 * Motor fiscal por grupo — PORTE FIEL do app oficial de Cadastro de Produtos (origin/main 1ba6774,
 * `stack/api/src/modules/apoio/tax-rule.service.ts`, `formato-creare.ts`, `grupos-legados.ts` e os
 * `withAutomaticTax`/`comResultadoFiscal` de `product.service.ts`). Decisao de Jose (27/10/2026): o fiscal
 * e puxado pelo grupo, IGUAL ao app da loja; ninguem digita imposto.
 *
 * Aqui so ha regra PURA. Quem le a planilha (as mesmas abas e faixas do oficial) e guarda o cache de 5
 * minutos e a API; este arquivo recebe as faixas ja lidas e devolve a classificacao.
 */

// ------------------------------------------------------------------------------------------------
// Normalizacoes (identicas ao oficial)
// ------------------------------------------------------------------------------------------------

/** Chave de grupo: NFKC, sem `U+2060`/marcas de formatacao, espacos colapsados, maiusculas. Mantem acento. */
export function normalizarGrupoFiscal(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

/** `'11,28%'` -> 11.28; o que nao for numero vira 0 (como o `parseSheetPercent` do oficial). */
export function percentualDaPlanilha(valor: string): number {
  const n = Number(
    String(valor ?? "")
      .replace("%", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
  return Number.isFinite(n) ? n : 0;
}

/** Codigo de barras/PLU: so digitos, sem zeros a esquerda. */
export function chaveDeCodigo(valor: string | null | undefined): string {
  return String(valor ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
}

/** NCM tem 8 digitos fixos: completa com zero a esquerda o que veio curto (o Excel come o zero). */
export function ncmFiscal(valor: string | null | undefined): string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.length < 8 ? digitos.padStart(8, "0") : digitos;
}

/** EAN inteiro e, se for etiqueta de balanca (13 digitos comecando com 2), tambem o PLU (digitos 2 a 6). */
export function candidatosDeCodigo(codigoBarras: string | null | undefined): string[] {
  const digitos = String(codigoBarras ?? "").replace(/\D/g, "");
  const saida = new Set<string>();
  if (digitos) saida.add(chaveDeCodigo(digitos));
  if (digitos.length === 13 && digitos.startsWith("2")) saida.add(chaveDeCodigo(digitos.slice(1, 6)));
  return [...saida];
}

/** Chave de nome para o cadastro de ECF: sem acento, sem pontuacao, maiusculas. */
export function chaveNomeEcf(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Grafia numerica do Creare: `"5333"` com 2 casas -> 53.33; ja pontuado e lido direto; texto -> null. */
export function campoCreare(valor: string | null | undefined, casas: number): number | null {
  const bruto = String(valor ?? "").trim();
  if (bruto === "") return null;
  if (bruto.includes(",") || bruto.includes(".")) {
    const n = Number(bruto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (!/^\d+$/.test(bruto)) return null;
  const n = Number(bruto) / 10 ** casas;
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------------------------------------

export interface RegraFiscalGrupo {
  grupo: string;
  cstPisCofins: string;
  tributacaoSimples: string;
  aliquotaSimples: number;
  icmsRe: number;
  baseFiscal: string;
  /** Fracao (0,2 = 20%). Nula quando a aba de grupos nao define. */
  margemPadrao: number | null;
}

export interface RegistroEcf {
  reducaoIcms: number | null;
  aliquotaCheia: number | null;
  aliquotaFcp: number | null;
  aliquotaPis: number | null;
  aliquotaCofins: number | null;
  aliquotaEcf: string | null;
  aliquotaEcfId: string | null;
  categoria: string | null;
  icms: number | null;
  cest: string | null;
  ncm: string | null;
  cstEcf: string | null;
  pctNcm: number | null;
}

export interface FonteEcf {
  porNome: Map<string, RegistroEcf>;
  ambiguos: Set<string>;
  indisponivel: boolean;
}

/** Linha do cadastro que ja existe no SIA da loja (tabela `sia_produto_depara` do oficial). */
export interface SiaDePara {
  chaveBarras: string;
  aliqSaidaEcf: string;
  reducao: string | null;
  aliquotaInterna: string | null;
  codGrupo: string;
  ncm: string;
}

export interface TabelasFiscais {
  grupos: RegraFiscalGrupo[];
  produtos: Map<string, { codigo: string; ncm: string; cst: string; icmsRe: number; nome: string }>;
  reforma: Map<string, { cst: string; cClassTrib: string; ibs: number; cbs: number }>;
  cst: Map<string, { tributacao: string; aliquota: number }>;
  /** Uma fonte por ABA de ECF (hoje so a da TNP, usada por BASE e TNP). */
  ecf: Map<string, FonteEcf>;
  /** Export do SIA por loja, indexado pela chave de barras. */
  sia: Map<string, Map<string, SiaDePara>>;
}

export type EstadoFiscal =
  | "nao_classificado"
  | "completo"
  | "parcial"
  | "pendente_grupo_invalido"
  | "pendente_sem_correspondencia"
  | "pendente_ambiguo"
  | "pendente_conflito"
  | "pendente_fonte_da_loja"
  | "fonte_indisponivel";

export interface ClassificacaoFiscal extends RegraFiscalGrupo {
  ncm: string | null;
  codigoFiscal: string | null;
  produtoFiscal: string | null;
  cstReforma: string | null;
  cClassTrib: string | null;
  aliquotaIbs: number | null;
  aliquotaCbs: number | null;
  origem: "produto" | "plu_balanca" | "grupo";
  ecf: RegistroEcf | null;
}

export interface ResultadoFiscal {
  estado: EstadoFiscal;
  motivo: string;
  classificacao: ClassificacaoFiscal | null;
  conflitos: Array<{ campo: string; doGrupo: string; doEcf: string }>;
}

export interface EntradaFiscal {
  nome?: string | null | undefined;
  codigoBarras?: string | null | undefined;
  grupo?: string | null | undefined;
  loja?: string | null | undefined;
}

// ------------------------------------------------------------------------------------------------
// Fontes: as mesmas abas e faixas do oficial
// ------------------------------------------------------------------------------------------------

export const ABA_ECF = "(TNP) FISCAL - CADASTRO ECF";
/** De qual aba sai o ECF de cada loja. Fora do mapa: so o SIA importado da propria loja. */
export const FONTES_ECF: Readonly<Record<string, string>> = { BASE: ABA_ECF, TNP: ABA_ECF };
export const FAIXAS_FISCAIS = {
  grupos: "AB4:AG79",
  produtos: "A4:E2000",
  reforma: "H4:M200",
  cst: "O4:Q20",
  margens: "M5:N130",
  ecf: "A2:Q4000"
} as const;

export function fonteEcfDaLoja(loja?: string | null): string | null {
  return (
    FONTES_ECF[
      String(loja ?? "BASE")
        .trim()
        .toUpperCase()
    ] ?? null
  );
}

type Faixa = ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>;
const celula = (linha: ReadonlyArray<string | number | boolean | null | undefined>, i: number) =>
  String(linha[i] ?? "");

/** Margem por grupo (M = grupo, N = margem). `%` converte; <=0 ou >5 (500%) e descartado. */
export function lerMargensPorGrupo(faixa: Faixa): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const linha of faixa) {
    const chave = normalizarGrupoFiscal(celula(linha, 0));
    const bruto = celula(linha, 1).trim();
    if (!chave || bruto === "") continue;
    const valor = percentualDaPlanilha(bruto);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const fracao = bruto.includes("%") ? valor / 100 : valor;
    if (fracao > 5) continue;
    mapa.set(chave, fracao);
  }
  return mapa;
}

/** Monta as tabelas da aba fiscal. A margem so entra em grupo que ja tem regra fiscal (oficial). */
export function montarTabelasFiscais(faixas: {
  grupos: Faixa;
  produtos: Faixa;
  reforma: Faixa;
  cst: Faixa;
  margens: Map<string, number>;
}): Pick<TabelasFiscais, "grupos" | "produtos" | "reforma" | "cst"> {
  const unicos = new Map<string, RegraFiscalGrupo>();
  for (const linha of faixas.grupos) {
    const grupo = celula(linha, 0);
    const cst = celula(linha, 1);
    const chave = normalizarGrupoFiscal(grupo);
    if (!chave || !cst) continue;
    unicos.set(chave, {
      grupo: grupo
        .replace(/\p{Cf}/gu, "")
        .replace(/\s+/g, " ")
        .trim(),
      cstPisCofins: cst.trim(),
      tributacaoSimples: celula(linha, 2).trim(),
      aliquotaSimples: percentualDaPlanilha(celula(linha, 3)),
      icmsRe: percentualDaPlanilha(celula(linha, 4)),
      baseFiscal: celula(linha, 5).trim(),
      margemPadrao: null
    });
  }
  for (const [chave, margem] of faixas.margens) {
    const regra = unicos.get(chave);
    if (regra) regra.margemPadrao = margem;
  }
  const produtos: TabelasFiscais["produtos"] = new Map();
  for (const linha of faixas.produtos) {
    const codigo = chaveDeCodigo(celula(linha, 0));
    const ncm = celula(linha, 1);
    if (codigo && ncm) {
      produtos.set(codigo, {
        codigo,
        ncm: ncmFiscal(ncm),
        cst: celula(linha, 2).trim(),
        icmsRe: percentualDaPlanilha(celula(linha, 3)),
        nome: celula(linha, 4).trim()
      });
    }
  }
  const reforma: TabelasFiscais["reforma"] = new Map();
  for (const linha of faixas.reforma) {
    const ncm = ncmFiscal(celula(linha, 0));
    if (ncm) {
      reforma.set(ncm, {
        cst: celula(linha, 2).trim(),
        cClassTrib: celula(linha, 3).trim(),
        ibs: percentualDaPlanilha(celula(linha, 4)),
        cbs: percentualDaPlanilha(celula(linha, 5))
      });
    }
  }
  const cst: TabelasFiscais["cst"] = new Map();
  for (const linha of faixas.cst) {
    const codigo = celula(linha, 0);
    if (codigo)
      cst.set(codigo.trim(), { tributacao: celula(linha, 1).trim(), aliquota: percentualDaPlanilha(celula(linha, 2)) });
  }
  const grupos = [...unicos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, "pt-BR"));
  return { grupos, produtos, reforma, cst };
}

/**
 * Cadastro de ECF por NOME (`A2:Q4000`). `null` = a aba nao pode ser lida (falha temporaria, nao ausencia).
 * Nome repetido nao entra: escolher uma linha seria sortear imposto.
 */
export function lerFonteEcf(faixa: Faixa | null): FonteEcf {
  if (!faixa) return { porNome: new Map(), ambiguos: new Set(), indisponivel: true };
  const vistos = new Set<string>();
  const ambiguos = new Set<string>();
  const porNome = new Map<string, RegistroEcf>();
  for (const linha of faixa) {
    const chave = chaveNomeEcf(celula(linha, 1));
    if (!chave) continue;
    if (vistos.has(chave)) {
      ambiguos.add(chave);
      continue;
    }
    vistos.add(chave);
    const t = (i: number) => celula(linha, i).trim() || null;
    porNome.set(chave, {
      ncm: ncmFiscal(celula(linha, 12)) || null,
      cstEcf: t(7),
      pctNcm: campoCreare(celula(linha, 14), 2),
      reducaoIcms: campoCreare(celula(linha, 4), 2),
      aliquotaCheia: campoCreare(celula(linha, 5), 3),
      aliquotaFcp: campoCreare(celula(linha, 6), 2),
      aliquotaPis: campoCreare(celula(linha, 8), 4),
      aliquotaCofins: campoCreare(celula(linha, 9), 4),
      aliquotaEcf: t(10),
      aliquotaEcfId: t(11),
      categoria: t(13),
      icms: campoCreare(celula(linha, 15), 2),
      cest: t(16)
    });
  }
  for (const chave of ambiguos) porNome.delete(chave);
  return { porNome, ambiguos, indisponivel: false };
}

/** So os campos que o export do SIA afirma; `03` vira o rotulo da aliquota, `10` ST e `11` isento. */
export function registroEcfDoSia(linha: SiaDePara): RegistroEcf {
  const numero = (valor: string | null) => {
    if (valor == null || valor.trim() === "") return null;
    const n = Number(valor.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const digitos = linha.aliqSaidaEcf.replace(/\D/g, "");
  const id = digitos ? digitos.padStart(2, "0") : null;
  const cheia = numero(linha.aliquotaInterna);
  const rotulo =
    id === "03" && cheia != null
      ? `${cheia.toFixed(2).replace(".", ",")}%`
      : id === "10"
        ? "SUBST TRIB"
        : id === "11"
          ? "ISENTO"
          : null;
  return {
    reducaoIcms: numero(linha.reducao),
    aliquotaCheia: cheia,
    aliquotaFcp: null,
    aliquotaPis: null,
    aliquotaCofins: null,
    aliquotaEcf: rotulo,
    aliquotaEcfId: id,
    categoria: linha.codGrupo || null,
    icms: null,
    cest: null,
    ncm: ncmFiscal(linha.ncm) || null,
    cstEcf: null,
    pctNcm: null
  };
}

// ------------------------------------------------------------------------------------------------
// Grupos legados (excecoes por EAN/PLU decididas no oficial; o mapa global esta vazio la tambem)
// ------------------------------------------------------------------------------------------------

const GRUPOS_LEGADOS_POR_BARRAS: Readonly<Record<string, { legado: string; oficial: string }>> = {
  "7892840267841": { legado: "BISCOITO", oficial: "MER BISCOITOS - SALGADOS" },
  "7622210573353": { legado: "BOMBONIERI", oficial: "MER BOMBONIERI - CHOCOLATES" },
  "7896306612817": { legado: "BOMBONIERI", oficial: "MER BOMBONIERI - CHOCOLATES" },
  "7898229388602": { legado: "GERAL", oficial: "MER MAT. PRIMA - PROTEINAS" },
  "7898944767454": { legado: "SORVETES", oficial: "MER SORVETES - POTES" },
  "10772": { legado: "MAT. PRIMA (FARINHA)", oficial: "MER MAT. PRIMA - VERDURAS" },
  "7894900531005": { legado: "SUCO, ISOT E AGUA", oficial: "MER BEBIDAS - ÁGUAS" },
  "11844": { legado: "SUCO, ISOT E AGUA", oficial: "MER BEBIDAS - ÁGUAS" },
  "11667": { legado: "SUCO, ISOT E AGUA", oficial: "MER BEBIDAS - ÁGUAS" },
  "711844": { legado: "SUCO, ISOT E AGUA", oficial: "MER BEBIDAS - ÁGUAS" },
  "711667": { legado: "SUCO, ISOT E AGUA", oficial: "MER BEBIDAS - ÁGUAS" },
  "7894900521504": { legado: "SUCO, ISOT E AGUA", oficial: "MER BEBIDAS - ÁGUAS" }
};

export function grupoOficialDoProduto(legado?: string | null, codigoBarras?: string | null): string | null {
  const porProduto = GRUPOS_LEGADOS_POR_BARRAS[chaveDeCodigo(codigoBarras)];
  if (
    porProduto &&
    porProduto.legado ===
      String(legado ?? "")
        .trim()
        .toUpperCase()
  )
    return porProduto.oficial;
  return null;
}

// ------------------------------------------------------------------------------------------------
// Classificacao
// ------------------------------------------------------------------------------------------------

export function regraDoGrupo(tabelas: Pick<TabelasFiscais, "grupos">, grupo: string): RegraFiscalGrupo | null {
  const chave = normalizarGrupoFiscal(grupo);
  return tabelas.grupos.find((regra) => normalizarGrupoFiscal(regra.grupo) === chave) ?? null;
}

function fonteEcfDe(tabelas: TabelasFiscais, loja?: string | null): FonteEcf | null {
  const aba = fonteEcfDaLoja(loja);
  return aba ? (tabelas.ecf.get(aba) ?? null) : null;
}

function siaDe(tabelas: TabelasFiscais, loja?: string | null): Map<string, SiaDePara> | null {
  const fonte = tabelas.sia.get(
    String(loja ?? "")
      .trim()
      .toUpperCase()
  );
  return fonte?.size ? fonte : null;
}

/** `classify` do oficial. `null` quando o grupo nao tem regra (o oficial lanca TAX_RULE_NOT_FOUND). */
export function classificarPorGrupo(
  tabelas: TabelasFiscais,
  grupo: string,
  codigoBarras?: string | null,
  nome?: string | null,
  loja?: string | null
): ClassificacaoFiscal | null {
  const regra = regraDoGrupo(tabelas, grupo);
  if (!regra) return null;
  const candidatos = candidatosDeCodigo(codigoBarras);
  const indice = candidatos.findIndex((candidato) => tabelas.produtos.has(candidato));
  const produto = indice >= 0 ? tabelas.produtos.get(candidatos[indice]!)! : null;
  const cst = produto?.cst || regra.cstPisCofins;
  const regraCst = tabelas.cst.get(cst);
  const reforma = produto?.ncm ? tabelas.reforma.get(produto.ncm) : null;
  const fonteSia = siaDe(tabelas, loja);
  const linhaSia = candidatos.map((candidato) => fonteSia?.get(candidato)).find(Boolean);
  const fonte = fonteEcfDe(tabelas, loja);
  const ecf = linhaSia
    ? registroEcfDoSia(linhaSia)
    : nome && fonte
      ? (fonte.porNome.get(chaveNomeEcf(nome)) ?? null)
      : null;
  return {
    ...regra,
    cstPisCofins: cst,
    icmsRe: produto?.icmsRe ?? regra.icmsRe,
    tributacaoSimples: regraCst?.tributacao || regra.tributacaoSimples,
    aliquotaSimples: regraCst?.aliquota ?? regra.aliquotaSimples,
    ncm: produto?.ncm ?? null,
    codigoFiscal: produto?.codigo ?? null,
    produtoFiscal: produto?.nome ?? null,
    cstReforma: reforma?.cst || null,
    cClassTrib: reforma?.cClassTrib || null,
    aliquotaIbs: reforma?.ibs ?? null,
    aliquotaCbs: reforma?.cbs ?? null,
    origem: produto ? (indice === 0 ? "produto" : "plu_balanca") : "grupo",
    ecf
  };
}

/**
 * `classificar` do oficial: nunca lanca; diz o PORQUE. `tabelas = null` e a fonte fora do ar
 * (`fonte_indisponivel`) — o produto e salvo e o fiscal completa depois.
 */
export function classificarFiscal(tabelas: TabelasFiscais | null, entrada: EntradaFiscal): ResultadoFiscal {
  const grupo = (grupoOficialDoProduto(entrada.grupo, entrada.codigoBarras) ?? entrada.grupo)?.trim();
  if (!grupo) {
    return {
      estado: "pendente_grupo_invalido",
      motivo: "Produto sem grupo de mercadorias: não há regra fiscal para aplicar.",
      classificacao: null,
      conflitos: []
    };
  }
  if (!tabelas) {
    return {
      estado: "fonte_indisponivel",
      motivo: "Não consegui ler a tabela fiscal agora. O cadastro foi salvo; o fiscal será completado sozinho.",
      classificacao: null,
      conflitos: []
    };
  }
  const classificacao = classificarPorGrupo(tabelas, grupo, entrada.codigoBarras, entrada.nome, entrada.loja);
  if (!classificacao) {
    return {
      estado: "pendente_grupo_invalido",
      motivo: `O grupo "${grupo}" não está entre as regras fiscais oficiais. Corrija o grupo na BASE.`,
      classificacao: null,
      conflitos: []
    };
  }
  const fonte = fonteEcfDe(tabelas, entrada.loja);
  const fonteSia = siaDe(tabelas, entrada.loja);
  if (!fonte && !fonteSia) {
    const loja =
      String(entrada.loja ?? "")
        .trim()
        .toUpperCase() || "desta loja";
    return {
      estado: "pendente_fonte_da_loja",
      motivo:
        `Não há cadastro de ECF da ${loja}. Alíquota e código de ECF são do Creare de cada loja ` +
        "e não podem ser copiados de outra. Regra do grupo e NCM foram aplicados.",
      classificacao,
      conflitos: []
    };
  }
  const chave = entrada.nome ? chaveNomeEcf(entrada.nome) : "";
  if (!chave && !classificacao.ecf) {
    return {
      estado: "parcial",
      motivo: "Sem nome para consultar o cadastro de ECF: só a regra do grupo foi aplicada.",
      classificacao,
      conflitos: []
    };
  }
  if (!classificacao.ecf && fonte?.ambiguos.has(chave)) {
    return {
      estado: "pendente_ambiguo",
      motivo: "Há mais de um registro de ECF com este nome. Escolher um seria sortear imposto.",
      classificacao,
      conflitos: []
    };
  }
  if (!classificacao.ecf) {
    return {
      estado: fonte?.indisponivel ? "fonte_indisponivel" : "parcial",
      motivo: fonte?.indisponivel
        ? "Cadastro de ECF indisponível agora. O fiscal será completado sozinho depois."
        : "Este produto não existe no cadastro de ECF: alíquota e código de ECF ficam em branco até serem cadastrados lá.",
      classificacao,
      conflitos: []
    };
  }
  const cstEcf = classificacao.ecf.cstEcf;
  if (cstEcf && cstEcf !== "99" && cstEcf !== classificacao.cstPisCofins) {
    return {
      estado: "pendente_conflito",
      motivo:
        `O grupo diz CST ${classificacao.cstPisCofins} e o cadastro de ECF diz CST ${cstEcf}. ` +
        "Nenhum dos dois foi escolhido sozinho: precisa de decisão fiscal.",
      classificacao,
      conflitos: [{ campo: "cstPisCofins", doGrupo: classificacao.cstPisCofins, doEcf: cstEcf }]
    };
  }
  return { estado: "completo", motivo: "Fiscal completo.", classificacao, conflitos: [] };
}

// ------------------------------------------------------------------------------------------------
// Aplicacao no fiscal do produto (withAutomaticTax / comResultadoFiscal do oficial)
// ------------------------------------------------------------------------------------------------

/** O bloco fiscal do produto no ERP (mesmos campos do oficial; `categoria` aqui e `categoriaFiscal`). */
export interface FiscalDoProduto {
  ncm?: string | null | undefined;
  cest?: string | null | undefined;
  categoriaFiscal?: string | null | undefined;
  cstPisCofins?: string | null | undefined;
  aliquotaCheia?: number | null | undefined;
  aliquotaFcp?: number | null | undefined;
  aliquotaPis?: number | null | undefined;
  aliquotaCofins?: number | null | undefined;
  reducaoIcms?: number | null | undefined;
  icms?: number | null | undefined;
  tributacaoSimples?: string | null | undefined;
  aliquotaSimples?: number | null | undefined;
  icmsRe?: number | null | undefined;
  baseFiscal?: string | null | undefined;
  codigoFiscal?: string | null | undefined;
  produtoFiscal?: string | null | undefined;
  cstReforma?: string | null | undefined;
  cClassTrib?: string | null | undefined;
  aliquotaIbs?: number | null | undefined;
  aliquotaCbs?: number | null | undefined;
  origemFiscal?: string | null | undefined;
  aliquotaEcf?: string | null | undefined;
  aliquotaEcfId?: string | null | undefined;
  estado?: string | null | undefined;
  motivo?: string | null | undefined;
  conferidoEm?: string | null | undefined;
  pctNcm?: number | null | undefined;
}

/** Campos que uma PESSOA digita (so admin). Todo o resto e derivado. */
export const FISCAIS_MANUAIS = [
  "ncm",
  "cest",
  "categoriaFiscal",
  "aliquotaCheia",
  "aliquotaFcp",
  "aliquotaPis",
  "aliquotaCofins",
  "reducaoIcms",
  "icms"
] as const;

const fiscalVazio = (v: string | number | null | undefined) => v == null || v === "" || v === 0;

/** Compara so o que a pessoa digita, com `null`, `''` e `0` valendo o mesmo (oficial). */
export function mesmoFiscalManual(
  a: FiscalDoProduto | null | undefined,
  b: FiscalDoProduto | null | undefined
): boolean {
  return FISCAIS_MANUAIS.every((campo) => {
    const x = a?.[campo];
    const y = b?.[campo];
    if (fiscalVazio(x) && fiscalVazio(y)) return true;
    return String(x) === String(y);
  });
}

/** Sem CARGA fiscal: nenhum dos campos que so o cadastro de ECF traz esta preenchido. */
export function semCargaFiscal(fiscal: FiscalDoProduto | null | undefined): boolean {
  return (["aliquotaEcf", "aliquotaCheia", "reducaoIcms", "categoriaFiscal", "cest", "aliquotaPis"] as const).every(
    (campo) => fiscalVazio(fiscal?.[campo])
  );
}

/**
 * Aplica o resultado. Sem classificacao: o fiscal fica como estava e so `estado`/`motivo` mudam. Com:
 * o derivado e SEMPRE sobrescrito pela regra; o que vem do ECF so onde ele casou; `aliquotaEcf`/`Id`
 * sem ECF ficam nulos (o oficial apaga). Devolve tambem o nome oficial do grupo.
 */
export function aplicarResultadoFiscal(
  anterior: FiscalDoProduto | null | undefined,
  resultado: ResultadoFiscal
): { fiscal: FiscalDoProduto; grupoOficial: string | null } {
  const fiscal: FiscalDoProduto = { ...(anterior ?? {}) };
  if (!resultado.classificacao) {
    return { fiscal: { ...fiscal, estado: resultado.estado, motivo: resultado.motivo }, grupoOficial: null };
  }
  const regra = resultado.classificacao;
  const ecf = regra.ecf;
  return {
    grupoOficial: regra.grupo,
    fiscal: {
      ...fiscal,
      ncm: regra.ncm ?? fiscal.ncm ?? null,
      cstPisCofins: regra.cstPisCofins,
      reducaoIcms: ecf?.reducaoIcms ?? fiscal.reducaoIcms ?? null,
      aliquotaCheia: ecf?.aliquotaCheia ?? fiscal.aliquotaCheia ?? null,
      aliquotaFcp: ecf?.aliquotaFcp ?? fiscal.aliquotaFcp ?? null,
      aliquotaPis: ecf?.aliquotaPis ?? fiscal.aliquotaPis ?? null,
      aliquotaCofins: ecf?.aliquotaCofins ?? fiscal.aliquotaCofins ?? null,
      aliquotaEcf: ecf?.aliquotaEcf ?? null,
      aliquotaEcfId: ecf?.aliquotaEcfId ?? null,
      categoriaFiscal: ecf?.categoria ?? fiscal.categoriaFiscal ?? null,
      icms: ecf?.icms ?? fiscal.icms ?? null,
      cest: ecf?.cest ?? fiscal.cest ?? null,
      pctNcm: ecf?.pctNcm ?? fiscal.pctNcm ?? null,
      tributacaoSimples: regra.tributacaoSimples,
      aliquotaSimples: regra.aliquotaSimples,
      icmsRe: regra.icmsRe,
      baseFiscal: regra.baseFiscal,
      codigoFiscal: regra.codigoFiscal,
      produtoFiscal: regra.produtoFiscal,
      cstReforma: regra.cstReforma,
      cClassTrib: regra.cClassTrib,
      aliquotaIbs: regra.aliquotaIbs,
      aliquotaCbs: regra.aliquotaCbs,
      origemFiscal: regra.origem,
      estado: resultado.estado,
      motivo: resultado.motivo
    }
  };
}

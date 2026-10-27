import {
  classificarFiscal,
  FAIXAS_FISCAIS,
  FONTES_ECF,
  lerFonteEcf,
  lerMargensPorGrupo,
  montarTabelasFiscais,
  regraDoGrupo,
  type EntradaFiscal,
  type FonteEcf,
  type RegraFiscalGrupo,
  type ResultadoFiscal,
  type SiaDePara,
  type TabelasFiscais
} from "@padaria/shared/produtos";
import { env } from "../env.js";
import { GoogleSheetsService } from "../google/google-sheets.service.js";
import { deParaDeTodasAsLojasRepository } from "./produtos-sia-depara.repository.js";

/**
 * Leitura das regras fiscais — IGUAL ao `TaxRuleService` do app oficial (R-222): as mesmas abas e faixas da
 * MESMA planilha, valor formatado, cache de 5 minutos por instancia, e as mesmas protecoes:
 *  - a faixa de grupos fora da grade nao derruba as outras tres (rele sem ela);
 *  - margem e cadastro de ECF sao leituras SEPARADAS que falham sozinhas;
 *  - sem regra nenhuma de grupo, a fonte e tratada como quebrada.
 * A regra em si mora em `@padaria/shared/produtos` (fiscal-motor), testada com os casos do oficial.
 */

export class FonteFiscalIndisponivelError extends Error {
  readonly status = 503;
  readonly code = "TAX_RULES_UNAVAILABLE";
}

export interface LeitorDeFaixas {
  lerFaixasEmLote(faixas: string[]): Promise<string[][][]>;
}

const CACHE_MS = 5 * 60 * 1000;
let cache: { expiraEm: number; tabelas: TabelasFiscais } | null = null;
let leitorInjetado: LeitorDeFaixas | null = null;
let siaInjetado: (() => Promise<Map<string, Map<string, SiaDePara>>>) | null = null;

/** Notacao A1 com o titulo da aba entre aspas (aspas simples dobradas), como o `a1` do oficial. */
export function a1(aba: string, faixa: string): string {
  return `'${aba.replace(/'/g, "''")}'!${faixa}`;
}

function leitor(): LeitorDeFaixas {
  if (leitorInjetado) return leitorInjetado;
  if (!env.GOOGLE_PRODUTOS_SPREADSHEET_ID) {
    throw new FonteFiscalIndisponivelError(
      "Regras fiscais indisponíveis: configuração incompleta (GOOGLE_PRODUTOS_SPREADSHEET_ID)."
    );
  }
  return new GoogleSheetsService({ spreadsheetId: env.GOOGLE_PRODUTOS_SPREADSHEET_ID });
}

/** So para testes: troca a planilha por um leitor falso e/ou o SIA por linhas fixas, e limpa o cache. */
export function definirFontesFiscaisParaTeste(fontes: {
  leitor?: LeitorDeFaixas | null;
  sia?: (() => Promise<Map<string, Map<string, SiaDePara>>>) | null;
}): void {
  leitorInjetado = fontes.leitor ?? null;
  siaInjetado = fontes.sia ?? null;
  cache = null;
}

/** Depois de importar o de-para do SIA: a proxima classificacao rele tudo (sem esperar os 5 minutos). */
export function invalidarTabelasFiscais(): void {
  cache = null;
}

/** De-para do SIA por loja (`sia_produto_depara`), indexado pela chave de barras — fonte do ECF de LI/HORA. */
async function siaPorLoja(): Promise<Map<string, Map<string, SiaDePara>>> {
  const porLoja = new Map<string, Map<string, SiaDePara>>();
  for (const linha of await deParaDeTodasAsLojasRepository()) {
    const loja = lojaFiscalDaEmpresa(linha.matriculaPrefixo);
    const daLoja = porLoja.get(loja) ?? new Map<string, SiaDePara>();
    daLoja.set(linha.chaveBarras, {
      chaveBarras: linha.chaveBarras,
      aliqSaidaEcf: linha.aliqSaidaEcf,
      reducao: linha.reducao,
      aliquotaInterna: linha.aliquotaInterna,
      codGrupo: linha.codGrupo,
      ncm: linha.ncm
    });
    porLoja.set(loja, daLoja);
  }
  return porLoja;
}

async function margensPorGrupo(fonte: LeitorDeFaixas): Promise<Map<string, number>> {
  try {
    const [faixa] = await fonte.lerFaixasEmLote([a1(env.GOOGLE_PRODUTOS_GRUPOS_TAB, FAIXAS_FISCAIS.margens)]);
    return lerMargensPorGrupo(faixa ?? []);
  } catch {
    return new Map();
  }
}

async function fonteEcf(fonte: LeitorDeFaixas, aba: string): Promise<FonteEcf> {
  try {
    const [faixa] = await fonte.lerFaixasEmLote([a1(aba, FAIXAS_FISCAIS.ecf)]);
    return lerFonteEcf(faixa ?? []);
  } catch {
    // Falha de LEITURA, nao ausencia de registro.
    return lerFonteEcf(null);
  }
}

/** Tabelas fiscais (com cache). Lanca `FonteFiscalIndisponivelError` quando a fonte nao pode ser usada. */
export async function tabelasFiscais(): Promise<TabelasFiscais> {
  if (cache && cache.expiraEm > Date.now()) return cache.tabelas;
  const fonte = leitor();
  const aba = env.GOOGLE_PRODUTOS_FISCAL_TAB;
  const demais = [FAIXAS_FISCAIS.produtos, FAIXAS_FISCAIS.reforma, FAIXAS_FISCAIS.cst].map((faixa) => a1(aba, faixa));
  let faixas: string[][][];
  try {
    faixas = await fonte.lerFaixasEmLote([a1(aba, FAIXAS_FISCAIS.grupos), ...demais]);
  } catch {
    const semGrupos = await fonte.lerFaixasEmLote(demais).catch(() => null);
    if (!semGrupos) throw new FonteFiscalIndisponivelError(`Não foi possível ler a aba fiscal "${aba}".`);
    faixas = [[], ...semGrupos];
  }
  const [grupos = [], produtos = [], reforma = [], cst = []] = faixas;
  const base = montarTabelasFiscais({ grupos, produtos, reforma, cst, margens: await margensPorGrupo(fonte) });
  if (!base.grupos.length) {
    throw new FonteFiscalIndisponivelError(
      `A tabela de regras por grupo não foi encontrada em "${aba}"!${FAIXAS_FISCAIS.grupos}. ` +
        "Restaure nessa faixa as colunas grupo, CST PIS/COFINS, tributação (Simples), alíquota, % ICMS RE e base fiscal."
    );
  }
  const ecf = new Map<string, FonteEcf>();
  for (const abaEcf of new Set(Object.values(FONTES_ECF))) ecf.set(abaEcf, await fonteEcf(fonte, abaEcf));
  // De-para do SIA por loja: sem a exportacao importada, LI e HORA ficam `pendente_fonte_da_loja`,
  // exatamente como no oficial antes de o export da loja ser importado.
  const sia = siaInjetado ? await siaInjetado() : await siaPorLoja();
  const tabelas: TabelasFiscais = { ...base, ecf, sia };
  cache = { expiraEm: Date.now() + CACHE_MS, tabelas };
  return tabelas;
}

/** Classificacao com o porque — nunca lanca: fonte fora do ar vira `fonte_indisponivel`. */
export async function classificarProdutoFiscal(entrada: EntradaFiscal): Promise<ResultadoFiscal> {
  const tabelas = await tabelasFiscais().catch(() => null);
  return classificarFiscal(tabelas, entrada);
}

/** Margem padrao (fracao) do grupo pela regra fiscal; 0 sem grupo, sem regra, sem margem ou fonte fora. */
export async function margemPadraoDoGrupo(grupoNome: string | null): Promise<number> {
  if (!grupoNome?.trim()) return 0;
  try {
    return regraDoGrupo(await tabelasFiscais(), grupoNome)?.margemPadrao ?? 0;
  } catch {
    return 0;
  }
}

/** Regras por grupo (com a margem padrao), para a tela e para o preco. Lanca se a fonte estiver fora. */
export async function listarRegrasFiscaisPorGrupo(): Promise<RegraFiscalGrupo[]> {
  return (await tabelasFiscais()).grupos;
}

/**
 * Loja do app oficial para a empresa do ERP, pelo prefixo da empresa. Fora da lista fechada devolve uma loja
 * que nao tem fonte de ECF — NUNCA `null`, porque `null` no motor vale BASE e levaria o ECF da TNP.
 */
export function lojaFiscalDaEmpresa(matriculaPrefixo: string | null | undefined): string {
  const prefixo = String(matriculaPrefixo ?? "")
    .trim()
    .toUpperCase();
  return ["TNP", "LI", "HORA"].includes(prefixo) ? prefixo : `SEM LOJA (${prefixo || "vazio"})`;
}

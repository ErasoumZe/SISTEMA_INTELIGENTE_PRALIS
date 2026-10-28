import type { LancamentoMer } from "@padaria/shared/produtos";
import { env } from "../env.js";
import { a1, indexToCol } from "../google/google-sheets-gateway.js";
import { GoogleSheetsService } from "../google/google-sheets.service.js";

/**
 * Leitura da aba de discriminacao de mercadorias — SO LEITURA (porte de `CustoMerPlanilhaService` do app
 * oficial, R-222/DB-05). Cada linha e um lancamento de compra; interessam `PRODUTOS`, `VALOR CUSTO UN` e
 * `DATA REF`. O cabecalho e PROCURADO nas 30 primeiras linhas (o topo da aba muda quando alguem acrescenta
 * um bloco).
 */
export type EstadoMer = "ok" | "sem-destino" | "sem-coluna" | "falhou";

export interface LeituraMer {
  estado: EstadoMer;
  lancamentos: LancamentoMer[];
  linhaCabecalho: number | null;
  descartados: number;
  faltando: string[];
  truncada: boolean;
  erro?: string;
}

export interface ConfigMer {
  planilhaId: string | undefined;
  aba: string;
  linhaFinal: number;
}

/** Le varias faixas numa chamada so, em valor formatado (como o oficial). */
export type LeitorDeFaixas = (planilhaId: string, faixas: string[]) => Promise<string[][][]>;

const COLUNA_PRODUTO = "PRODUTOS";
const COLUNA_CUSTO = "VALOR CUSTO UN";
const COLUNA_DATA = "DATA REF";
const LINHAS_DE_CABECALHO = 30;

const normalizarTitulo = (valor: string | null | undefined): string =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\p{Cf}/gu, "")
    .toUpperCase()
    .replace(/\s+/gu, " ")
    .trim();

const vazio = (): LeituraMer => ({
  estado: "ok",
  lancamentos: [],
  linhaCabecalho: null,
  descartados: 0,
  faltando: [],
  truncada: false
});

const leitorPadrao: LeitorDeFaixas = (planilhaId, faixas) =>
  new GoogleSheetsService({ spreadsheetId: planilhaId }).lerFaixasEmLote(faixas);

let leitorInjetado: LeitorDeFaixas | null = null;
/** So para testes: troca quem le a planilha. */
export function definirLeitorDaDiscriminacaoParaTeste(leitor: LeitorDeFaixas | null): void {
  leitorInjetado = leitor;
}

export const configDaDiscriminacao = (): ConfigMer => ({
  planilhaId: env.GOOGLE_PRODUTOS_MER_SPREADSHEET_ID,
  aba: env.GOOGLE_PRODUTOS_MER_TAB,
  linhaFinal: env.GOOGLE_PRODUTOS_MER_LINHA_FINAL
});

export async function lerDiscriminacao(cfg: ConfigMer = configDaDiscriminacao()): Promise<LeituraMer> {
  const planilhaId = cfg.planilhaId?.trim();
  if (!planilhaId) return { ...vazio(), estado: "sem-destino" };
  const ler = leitorInjetado ?? leitorPadrao;
  try {
    const [linhas = []] = await ler(planilhaId, [a1(cfg.aba, `1:${LINHAS_DE_CABECALHO}`)]);
    let colunas: { linha: number; produto: number; custo: number; data: number } | null = null;
    for (let i = 0; i < linhas.length && !colunas; i += 1) {
      const titulos = (linhas[i] ?? []).map(normalizarTitulo);
      const produto = titulos.indexOf(normalizarTitulo(COLUNA_PRODUTO));
      const custo = titulos.indexOf(normalizarTitulo(COLUNA_CUSTO));
      const data = titulos.indexOf(normalizarTitulo(COLUNA_DATA));
      if (produto >= 0 && custo >= 0 && data >= 0) colunas = { linha: i + 1, produto, custo, data };
    }
    if (!colunas) return { ...vazio(), estado: "sem-coluna", faltando: [COLUNA_PRODUTO, COLUNA_CUSTO, COLUNA_DATA] };

    // Uma faixa estreita por coluna (oficial): a aba tem dezenas de colunas que nao interessam.
    const primeira = colunas.linha + 1;
    const faixa = (indice: number) =>
      a1(cfg.aba, `${indexToCol(indice)}${primeira}:${indexToCol(indice)}${cfg.linhaFinal}`);
    const [produtos = [], custos = [], datas = []] = await ler(planilhaId, [
      faixa(colunas.produto),
      faixa(colunas.custo),
      faixa(colunas.data)
    ]);
    const altura = Math.max(produtos.length, custos.length, datas.length);
    const lancamentos: LancamentoMer[] = [];
    let descartados = 0;
    for (let i = 0; i < altura; i += 1) {
      const produto = String(produtos[i]?.[0] ?? "").trim();
      const custoUnitario = String(custos[i]?.[0] ?? "").trim();
      // linha sem produto e subtotal, separador ou sobra de formula
      if (!produto || !custoUnitario) {
        descartados += 1;
        continue;
      }
      lancamentos.push({ linha: primeira + i, produto, custoUnitario, dataRef: String(datas[i]?.[0] ?? "").trim() });
    }
    return {
      estado: "ok",
      lancamentos,
      linhaCabecalho: colunas.linha,
      descartados,
      faltando: [],
      truncada: altura >= cfg.linhaFinal - primeira + 1
    };
  } catch (falha) {
    return { ...vazio(), estado: "falhou", erro: falha instanceof Error ? falha.message : "Falha ao ler a planilha" };
  }
}

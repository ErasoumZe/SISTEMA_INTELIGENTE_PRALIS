import { z } from "zod";
import { normalizarDescricaoPrecoBase } from "./fundacao.js";

const uuid = z.string().uuid();
const empresa = z.object({ empresaId: uuid });

// R-222 (PROJECT_BRAIN/55): historico de compras por fornecedor x produto. Aqui moram os contratos e as
// funcoes puras (testaveis sem banco) da importacao da planilha de discriminacao.

/** Mesmo teto de linhas das duas portas de entrada (arquivo e JSON). */
export const LIMITE_LINHAS_HISTORICO = 50_000;

/** Quanto do arquivo vai para o navegador por vez na lista de pendencias. */
export const LIMITE_PENDENCIAS_HISTORICO = 200;

/** Janela da consulta, em meses. 3 e o padrao da tela; 6 e a opcao maior (doc 55, decisao 6). */
export const historicoMesesSchema = z.coerce
  .number()
  .int()
  .refine((meses) => meses === 3 || meses === 6 || meses === 12, "Use 3, 6 ou 12 meses");

/**
 * Uma linha como saiu da planilha. Campo que nao deu para ler vem `null` e a linha fica `invalido`
 * na analise, com o motivo: nada some em silencio e nada entra por aproximacao.
 */
export const historicoLinhaSchema = z.object({
  numeroLinha: z.coerce.number().int().positive(),
  fornecedor: z.string().trim().max(300),
  produto: z.string().trim().min(1).max(300),
  dataCompra: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  quantidade: z.number().finite().nullable(),
  custoUnitario: z.number().finite().nullable(),
  documento: z.string().trim().max(300).nullable(),
  // Preenchido pelo leitor quando a propria planilha diz que a linha nao vale (NAO CONFRONTADO, erro de
  // lancamento) ou quando um numero e ambiguo.
  motivoInvalida: z.string().trim().max(300).nullable()
});

export const analisarHistoricoSchema = empresa.extend({
  nomeArquivo: z.string().trim().min(1).max(255),
  hashArquivo: z.string().trim().min(16).max(128),
  linhas: z.array(historicoLinhaSchema).min(1).max(LIMITE_LINHAS_HISTORICO)
});

export const historicoImportacaoQuerySchema = empresa;
export const aplicarHistoricoSchema = empresa;
export const reparearHistoricoSchema = empresa;

export const associarFornecedorHistoricoSchema = empresa.extend({
  fornecedorNormalizado: z.string().trim().min(1).max(300),
  fornecedorId: uuid
});

export const cadastrarFornecedorHistoricoSchema = empresa.extend({
  fornecedorNormalizado: z.string().trim().min(1).max(300),
  // Sem nome, usa o texto informado na planilha (o primeiro que apareceu).
  nome: z.string().trim().min(2).max(200).optional()
});

export const historicoResumoQuerySchema = empresa.extend({
  meses: historicoMesesSchema.default(3),
  produtoId: uuid.optional(),
  fornecedorId: uuid.optional(),
  busca: z.string().trim().max(120).optional(),
  limite: z.coerce.number().int().positive().max(500).default(200)
});

export type HistoricoLinha = z.infer<typeof historicoLinhaSchema>;
export type AnalisarHistorico = z.infer<typeof analisarHistoricoSchema>;

export type HistoricoResultado =
  | "correspondencia"
  | "fornecedor_nao_encontrado"
  | "produto_nao_encontrado"
  | "ambiguidade"
  | "invalido";

export type HistoricoImportacaoDto = {
  id: string;
  nomeArquivo: string;
  status: "analisada" | "aplicada" | "cancelada";
  totalLinhas: number;
  totalPareadas: number;
  totalPendentes: number;
  totalAplicadas: number;
  periodoInicio: string | null;
  periodoFim: string | null;
  criadoEm: string;
  aplicadoEm: string | null;
};

export type HistoricoPendenciaFornecedorDto = {
  fornecedorNormalizado: string;
  fornecedorInformado: string;
  linhas: number;
};
export type HistoricoPendenciaProdutoDto = { produtoNormalizado: string; produtoInformado: string; linhas: number };
export type HistoricoLinhaPendenteDto = {
  numeroLinha: number;
  resultado: HistoricoResultado;
  fornecedorInformado: string;
  produtoInformado: string;
  detalhe: string | null;
};

/** O que a aplicacao faria com o catalogo fornecedor-produto, antes de aplicar (doc 55, §3). */
export type HistoricoPreviaVinculosDto = {
  criar: number;
  aprovar: number;
  jaAprovados: number;
  rejeitadosIgnorados: number;
  amostraCriar: Array<{ fornecedor: string; produto: string; ultimoCusto: string }>;
};

export type HistoricoImportacaoDetalheDto = HistoricoImportacaoDto & {
  porResultado: Record<HistoricoResultado, number>;
  fornecedoresPendentes: HistoricoPendenciaFornecedorDto[];
  produtosPendentes: HistoricoPendenciaProdutoDto[];
  /** A lista foi cortada em LIMITE_PENDENCIAS_HISTORICO: ha mais, resolva e reabra. */
  fornecedoresPendentesTruncado: boolean;
  produtosPendentesTruncado: boolean;
  linhasPendentes: HistoricoLinhaPendenteDto[];
  previa: HistoricoPreviaVinculosDto;
};

export type HistoricoAplicacaoDto = {
  aplicadas: number;
  pendentes: number;
  vinculosCriados: number;
  vinculosAprovados: number;
  vinculosRejeitadosIgnorados: number;
};

export type HistoricoResumoLinhaDto = {
  fornecedorId: string;
  fornecedorNome: string;
  produtoId: string;
  produtoDescricao: string;
  ultimaCompraEm: string;
  ultimoCusto: string;
  menorCusto: string;
  maiorCusto: string;
  compras: number;
  quantidadeTotal: string;
};

export type HistoricoResumoDto = { meses: number; total: number; linhas: HistoricoResumoLinhaDto[] };

/** Nome de fornecedor/produto como chave de pareamento. A mesma normalizacao do preco-base. */
export function normalizarNomeHistorico(valor: string): string {
  return normalizarDescricaoPrecoBase(valor);
}

/** A coluna REFERENCIA da planilha traz `FORNECEDOR - dd/mm/aa - valor`. */
export function fornecedorDaReferencia(referencia: string): string | null {
  const achado = /^(.*?)\s+-\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+-/u.exec(referencia.trim());
  const nome = achado?.[1]?.trim();
  return nome ? nome : null;
}

/** Data de calendario valida (ex.: 31/02 nao existe) como `AAAA-MM-DD`; `null` se nao der para ler. */
export function dataIsoValida(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  if (ano < 2000 || ano > 2100) return null;
  return data.toISOString().slice(0, 10);
}

/**
 * Le a data da celula: serial do Excel (46083 ou 46083.0), `dd/mm/aa`, `dd/mm/aaaa` ou `aaaa-mm-dd`.
 * Ano de dois digitos vale 20xx. Qualquer outra coisa e `null` (linha invalida), nunca um palpite.
 */
export function dataDaPlanilha(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const serial = /^(\d{5})(?:\.\d+)?$/u.exec(limpo);
  if (serial) {
    const dias = Number(serial[1]);
    if (dias < 20_000 || dias > 80_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + dias * 86_400_000).toISOString().slice(0, 10);
  }
  const brasileira = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/u.exec(limpo);
  if (brasileira) {
    const ano = brasileira[3]!.length === 2 ? 2000 + Number(brasileira[3]) : Number(brasileira[3]);
    return dataIsoValida(ano, Number(brasileira[2]), Number(brasileira[1]));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(limpo);
  if (iso) return dataIsoValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

export type OrigemNumero = "xlsx" | "csv";

/**
 * Le o numero da celula. XLSX entrega o valor cru (`4.308` e quatro virgula tres zero oito); CSV vem
 * formatado em pt-BR (`1.250,50`). Com virgula, a leitura e SEMPRE pt-BR. Num CSV sem virgula, `1.250`
 * (um ponto e exatamente tres digitos) e ambiguo — milhar ou decimal? — e devolve `ambiguo`, para a linha
 * ficar pendente em vez de entrar com erro de mil vezes (mesma cautela do preco-base, R-218).
 */
export function numeroDaPlanilha(
  texto: string,
  origem: OrigemNumero
): { valor: number } | { ambiguo: true } | { vazio: true } | { invalido: true } {
  const limpo = texto
    .trim()
    .replace(/^R\$\s*/iu, "")
    .replace(/\s/gu, "");
  if (!limpo) return { vazio: true };
  if (limpo.includes(",")) {
    const numero = Number(limpo.replace(/\./gu, "").replace(",", "."));
    return Number.isFinite(numero) ? { valor: numero } : { invalido: true };
  }
  if (origem === "csv" && /^-?\d+\.\d{3}$/u.test(limpo)) return { ambiguo: true };
  const numero = Number(limpo);
  return Number.isFinite(numero) ? { valor: numero } : { invalido: true };
}

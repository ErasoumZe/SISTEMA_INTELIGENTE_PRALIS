import {
  aplicarResultadoFiscal,
  mesmoFiscalManual,
  semCargaFiscal,
  type FiscalDoProduto,
  type ResultadoFiscal
} from "@padaria/shared/produtos";
import { classificarProdutoFiscal } from "./produtos-fiscal.service.js";

/** Pessoa sem perfil de administrador mexeu nos campos fiscais digitaveis (oficial: ONLY_ADMIN_FISCAL). */
export class FiscalSoAdministradorError extends Error {
  readonly code = "ONLY_ADMIN_FISCAL";
  constructor() {
    super("Apenas o administrador altera os dados fiscais do produto.");
    this.name = "FiscalSoAdministradorError";
  }
}

/** `estado`/`motivo` sao do SERVIDOR: o que vier do cliente sai aqui (oficial `semEstadoFiscal`). */
function semEstado(fiscal: FiscalDoProduto | null | undefined): FiscalDoProduto | null {
  if (!fiscal) return null;
  const { estado: _estado, motivo: _motivo, conferidoEm: _conferido, ...resto } = fiscal;
  return resto;
}

/** Marca a TENTATIVA de classificacao (oficial): com estado, carimba agora; sem, fica nulo. */
const carimbar = (fiscal: FiscalDoProduto): FiscalDoProduto => ({
  ...fiscal,
  conferidoEm: fiscal.estado ? new Date().toISOString() : null
});

/**
 * Decide o fiscal que sera gravado — a MESMA sequencia do `create`/`update` do app oficial:
 *  - criacao: sempre classifica pelo grupo;
 *  - edicao com grupo OU codigo de barras trocado: reclassifica; quem nao e admin parte do fiscal SALVO;
 *  - edicao sem troca e produto sem carga fiscal: COMPLETA (nunca sobrescreve carga existente);
 *  - edicao comum: o admin pode digitar o fiscal manual; quem nao e admin nao pode alterar os campos
 *    digitaveis (comparando so eles) e o fiscal salvo e mantido.
 * Devolve tambem a regra do grupo (para a margem padrao do preco).
 */
export async function resolverFiscalDaGravacao(entrada: {
  criacao: boolean;
  administrador: boolean;
  fiscalDoPayload: FiscalDoProduto | null | undefined;
  grupoNome: string | null;
  grupoMudou: boolean;
  codigoBarras: string | null;
  codigoBarrasMudou: boolean;
  nome: string;
  loja: string;
  fiscalAtual: FiscalDoProduto | null;
}): Promise<{ fiscal: FiscalDoProduto | null; resultado: ResultadoFiscal | null }> {
  const payload = entrada.fiscalDoPayload === undefined ? undefined : semEstado(entrada.fiscalDoPayload);
  const classificar = () =>
    classificarProdutoFiscal({
      nome: entrada.nome,
      codigoBarras: entrada.codigoBarras,
      grupo: entrada.grupoNome,
      loja: entrada.loja
    });

  if (entrada.criacao) {
    const resultado = await classificar();
    return { fiscal: carimbar(aplicarResultadoFiscal(payload ?? null, resultado).fiscal), resultado };
  }

  const trocou = entrada.grupoMudou || entrada.codigoBarrasMudou;
  if (!entrada.administrador && payload !== undefined && !trocou && !mesmoFiscalManual(payload, entrada.fiscalAtual)) {
    throw new FiscalSoAdministradorError();
  }

  if (trocou) {
    if (!entrada.grupoNome?.trim()) throw new Error("Selecione o grupo de mercadorias para aplicar a regra fiscal.");
    const base = !entrada.administrador || payload === undefined ? entrada.fiscalAtual : payload;
    const resultado = await classificar();
    return { fiscal: carimbar(aplicarResultadoFiscal(base, resultado).fiscal), resultado };
  }

  if (entrada.grupoNome?.trim() && semCargaFiscal(entrada.fiscalAtual)) {
    const resultado = await classificar();
    return { fiscal: carimbar(aplicarResultadoFiscal(entrada.fiscalAtual, resultado).fiscal), resultado };
  }

  // Edicao comum: so o admin muda o fiscal, e a mudanca manual apaga o estado (o oficial faz igual).
  if (entrada.administrador && payload !== undefined && !mesmoFiscalManual(payload, entrada.fiscalAtual)) {
    return {
      fiscal: payload ? { ...entrada.fiscalAtual, ...payload, estado: null, motivo: null, conferidoEm: null } : null,
      resultado: null
    };
  }
  return { fiscal: entrada.fiscalAtual, resultado: null };
}

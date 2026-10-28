import type { JsonValue } from "@padaria/shared/api";
import type { FiscalDoProduto, ProdutoDetalhe, ProdutoPayload, ValoresHerdados } from "@padaria/shared/produtos";

/**
 * Traducao entre o produto do ERP e a linha do catalogo mestre BASE (`dados_oficiais`).
 *
 * A BASE guarda o produto com as MESMAS chaves do banco do app oficial (snake_case), porque e assim
 * que a Central traz a BASE de la e e isso que a copia para a loja (`montarPayloadBase`) le. Um
 * produto criado na BASE pelo ERP fica identico a um vindo do oficial: um formato, um leitor.
 */

type Numero = number | null | undefined;
const num = (valor: Numero): number | null => (valor == null || !Number.isFinite(valor) ? null : valor);
const txt = (valor: string | null | undefined): string | null => valor?.trim() || null;

export interface EntradaDadosBase {
  dados: ProdutoPayload;
  nome: string;
  siglaUnidade: string;
  grupoNome: string | null;
  grupoIdExterno: string | null;
  balanca: { pesavel: boolean | null; teclaBalanca: number | null; validadeBalanca: number | null };
  codigoInterno: string | null;
  codigoBarras: string | null;
  precoVenda: number | null;
  fiscal: FiscalDoProduto | null;
  /** Linha anterior (edicao): chaves que o ERP nao conhece — foto, ids do oficial — sobrevivem. */
  anteriores?: Record<string, JsonValue>;
}

function fiscalOficial(fiscal: FiscalDoProduto | null): Record<string, JsonValue> {
  const f = fiscal ?? {};
  return {
    ncm: txt(f.ncm),
    cest: txt(f.cest),
    categoria: txt(f.categoriaFiscal),
    cst_pis_cofins: txt(f.cstPisCofins),
    aliquota_cheia: num(f.aliquotaCheia),
    aliquota_fcp: num(f.aliquotaFcp),
    aliquota_pis: num(f.aliquotaPis),
    aliquota_cofins: num(f.aliquotaCofins),
    reducao_icms: num(f.reducaoIcms),
    icms: num(f.icms),
    tributacao_simples: txt(f.tributacaoSimples),
    aliquota_simples: num(f.aliquotaSimples),
    icms_re: num(f.icmsRe),
    base_fiscal: txt(f.baseFiscal),
    codigo_fiscal: txt(f.codigoFiscal),
    produto_fiscal: txt(f.produtoFiscal),
    cst_reforma: txt(f.cstReforma),
    cclass_trib: txt(f.cClassTrib),
    aliquota_ibs: num(f.aliquotaIbs),
    aliquota_cbs: num(f.aliquotaCbs),
    origem_fiscal: txt(f.origemFiscal),
    aliquota_ecf: txt(f.aliquotaEcf),
    aliquota_ecf_id: txt(f.aliquotaEcfId),
    estado_fiscal: txt(f.estado),
    motivo_fiscal: txt(f.motivo),
    pct_ncm: num(f.pctNcm)
  };
}

/** Monta `dados_oficiais` de um produto da BASE a partir do que a pessoa salvou no ERP. */
export function dadosOficiaisDaBase(entrada: EntradaDadosBase): Record<string, JsonValue> {
  const { dados } = entrada;
  const transformacao = dados.tipo === "transformacao" ? (dados.transformacao ?? null) : null;
  const pesavel = entrada.balanca.pesavel;
  return {
    ...(entrada.anteriores ?? {}),
    nome: entrada.nome,
    quantidade: dados.quantidadeIndividual,
    medida_base: entrada.siglaUnidade,
    pesavel: pesavel == null ? null : pesavel ? "S" : "N",
    tecla_balanca: entrada.balanca.teclaBalanca,
    validade_balanca: entrada.balanca.validadeBalanca,
    codigo_barras: entrada.codigoBarras,
    codigo_interno: entrada.codigoInterno,
    marca: txt(dados.marca),
    embalagem: txt(dados.embalagem),
    c_de: dados.embalagem ? (dados.cDe ?? "DE") : null,
    qt_cad: dados.quantidadeCaixa ?? 1,
    medida_compra: txt(dados.medidaCompra),
    compra_aproximada: dados.compraAproximada ?? false,
    grupo: entrada.grupoNome,
    grupo_id: entrada.grupoIdExterno,
    tipo: dados.tipo,
    status: dados.status,
    habilitar_ajuda: dados.habilitarAjuda ?? false,
    estoque_min: num(dados.estoqueMin),
    estoque_max: num(dados.estoqueMax),
    setor_estoque: txt(dados.setorEstoque),
    setor_venda_1: txt(dados.setorVenda1),
    setor_venda_2: txt(dados.setorVenda2),
    local_venda_1: txt(dados.localVenda1),
    local_venda_2: txt(dados.localVenda2),
    // Oficial: area de venda so existe no cadastro da TNP, nunca na BASE.
    area_venda: null,
    custo: num(dados.custo),
    margem_pontual: num(dados.margem),
    venda_pontual: entrada.precoVenda,
    calculo_automatico: dados.auto,
    transformacao_precisao: transformacao?.precisao ?? null,
    transformacao_qtd: num(transformacao?.quantidade),
    transformacao_unidade: transformacao?.unidade ?? null,
    produto_receituario: txt(transformacao?.produtoReceituario),
    ref_receituario: txt(transformacao?.refReceituario),
    // Oficial: promocao e da loja; a BASE nunca tem.
    promocoes: [],
    ...fiscalOficial(entrada.fiscal)
  };
}

function transformacaoHerdada(
  transformacao:
    | {
        precisao?: string | null | undefined;
        quantidade?: number | string | null | undefined;
        unidade?: string | null | undefined;
        produtoReceituario?: string | null | undefined;
        refReceituario?: string | null | undefined;
      }
    | null
    | undefined
): ValoresHerdados["transformacao"] {
  if (!transformacao) return null;
  return {
    precisao: transformacao.precisao ?? null,
    quantidade: transformacao.quantidade == null ? null : Number(transformacao.quantidade),
    unidade: transformacao.unidade ?? null,
    produtoReceituario: transformacao.produtoReceituario ?? null,
    refReceituario: transformacao.refReceituario ?? null
  };
}

/** Os campos herdados de um payload resolvido para uma loja (o que a BASE "e" naquela loja). */
export function valoresHerdadosDoPayload(
  payload: ProdutoPayload,
  extras: { codigoInterno: string | null; fotoUrl: string | null }
): ValoresHerdados {
  return {
    descricao: payload.descricao,
    nomeCatalogo: payload.nomeCatalogo ?? null,
    quantidadeIndividual: Number(payload.quantidadeIndividual),
    unidadeIndividualId: payload.unidadeIndividualId,
    pesavel: payload.pesavel ?? null,
    teclaBalanca: payload.teclaBalanca ?? null,
    validadeBalanca: payload.validadeBalanca ?? null,
    codigoBarras: payload.codigoBarras ?? null,
    marca: payload.marca ?? null,
    embalagem: payload.embalagem ?? null,
    cDe: payload.cDe ?? null,
    quantidadeCaixa: Number(payload.quantidadeCaixa ?? 1),
    medidaCompra: payload.medidaCompra ?? null,
    compraAproximada: payload.compraAproximada ?? false,
    codigoInterno: extras.codigoInterno,
    fotoUrl: extras.fotoUrl,
    grupoMercadoriaId: payload.grupoMercadoriaId ?? null,
    grupoIdExterno: payload.grupoIdExterno ?? null,
    tipo: payload.tipo,
    habilitarAjuda: payload.habilitarAjuda ?? false,
    transformacao: payload.tipo === "transformacao" ? transformacaoHerdada(payload.transformacao) : null
  };
}

/** Os campos herdados de uma copia como ela esta gravada na loja. */
export function valoresHerdadosDaCopia(
  copia: Pick<
    ProdutoDetalhe,
    | "descricao"
    | "nomeCatalogo"
    | "quantidadeIndividual"
    | "unidadeIndividualId"
    | "pesavel"
    | "teclaBalanca"
    | "validadeBalanca"
    | "codigoBarras"
    | "marca"
    | "embalagem"
    | "cDe"
    | "quantidadeCaixa"
    | "medidaCompra"
    | "compraAproximada"
    | "codigoInterno"
    | "fotoUrl"
    | "grupoMercadoriaId"
    | "grupoIdExterno"
    | "habilitarAjuda"
    | "transformacao"
  > & { tipo: string }
): ValoresHerdados {
  return {
    descricao: copia.descricao,
    nomeCatalogo: copia.nomeCatalogo,
    quantidadeIndividual: Number(copia.quantidadeIndividual),
    unidadeIndividualId: copia.unidadeIndividualId ?? "",
    pesavel: copia.pesavel,
    teclaBalanca: copia.teclaBalanca,
    validadeBalanca: copia.validadeBalanca,
    codigoBarras: copia.codigoBarras,
    marca: copia.marca,
    embalagem: copia.embalagem,
    cDe: copia.cDe,
    quantidadeCaixa: Number(copia.quantidadeCaixa),
    medidaCompra: copia.medidaCompra,
    compraAproximada: copia.compraAproximada,
    codigoInterno: copia.codigoInterno,
    fotoUrl: copia.fotoUrl,
    grupoMercadoriaId: copia.grupoMercadoriaId,
    grupoIdExterno: copia.grupoIdExterno,
    tipo: copia.tipo === "transformacao" ? "transformacao" : "revenda",
    habilitarAjuda: copia.habilitarAjuda,
    transformacao: copia.tipo === "transformacao" ? transformacaoHerdada(copia.transformacao) : null
  };
}

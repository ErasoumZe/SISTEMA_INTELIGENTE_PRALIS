import type { ProdutoDetalhe, ValoresHerdados } from "@padaria/shared";
import { montarDescricao } from "@padaria/shared";
import { fracaoParaPercentual, numeroDigitado, percentualParaFracao, textoDeNumero } from "~/utils/produto-numeros";

/**
 * Mapeamento PURO entre o detalhe da API e o formulario de produto, nos dois sentidos. Fica fora do
 * composable porque nao depende de Vue nem de rede: e a parte que compensa ler e testar sozinha, e
 * era o que fazia o `useProdutoFormulario` passar de 400 linhas.
 */

export interface PromocaoForm {
  tipo: "valor" | "desconto";
  valor: string;
  descontoPercentual: string;
  horaInicio: string;
  horaFim: string;
  dias: boolean[];
  validaAte: string;
}

export interface ConversaoForm {
  unidadeMedidaId: string;
  quantidade: string;
  unidadesIndividuais: string;
}

export function promocaoVazia(): PromocaoForm {
  return {
    tipo: "desconto",
    valor: "",
    descontoPercentual: "",
    horaInicio: "",
    horaFim: "",
    dias: [true, true, true, true, true, true, true],
    validaAte: ""
  };
}

export function formularioVazio(empresaId: string) {
  return {
    empresaId,
    status: "ativo" as "ativo" | "inativo",
    codigo: "",
    codigoInterno: "",
    codigoBarras: "",
    marca: "",
    compraAproximada: false,
    habilitarAjuda: false,
    setorVenda1: "",
    setorVenda2: "",
    descricao: "",
    nomeCatalogo: "",
    nomeCatalogoOriginal: null as string | null,
    pesavel: false as boolean | null,
    teclaBalanca: "",
    validadeBalanca: "",
    areaVenda: "",
    // Cadastro novo igual ao paralelo: gramatura 0 e medida base KG (o id do KG da empresa e
    // resolvido no `useProdutoFormulario`, depois de carregar as unidades).
    quantidadeIndividual: "0",
    unidadeIndividualId: "",
    grupoMercadoriaId: "" as string | null,
    tipo: "revenda" as "revenda" | "transformacao",
    embalagem: "" as string | null,
    cDe: "DE" as "C/" | "DE",
    quantidadeCaixa: "1",
    medidaCompra: "" as string | null,
    custo: "",
    margemPercentual: "",
    auto: true,
    precoVenda: "",
    quantidadeEstoque: "0",
    estoqueMin: "",
    estoqueMax: "",
    areaEstoque: "",
    setorEstoque: "",
    curvaAbc: "" as "" | "A" | "B" | "C",
    quantidadeVariavel: false,
    toleranciaQuantidadePercentual: "",
    localVenda1: "",
    localVenda2: "",
    fotoUrl: null as string | null,
    precisao: "EXATOS",
    quantidadeTransformacao: "",
    unidadeTransformacao: "",
    produtoReceituario: "",
    refReceituario: "",
    fiscal: {
      ncm: "",
      cest: "",
      categoriaFiscal: "",
      cstPisCofins: "",
      aliquotaCheia: "",
      aliquotaFcp: "",
      aliquotaPis: "",
      aliquotaCofins: "",
      reducaoIcms: "",
      icms: "",
      tributacaoSimples: "",
      aliquotaSimples: "",
      icmsRe: "",
      baseFiscal: "",
      codigoFiscal: "",
      produtoFiscal: "",
      cstReforma: "",
      cClassTrib: "",
      aliquotaIbs: "",
      aliquotaCbs: "",
      origemFiscal: "",
      aliquotaEcf: "",
      aliquotaEcfId: "",
      estado: "",
      motivo: "",
      conferidoEm: "",
      pctNcm: ""
    },
    promocoes: [] as PromocaoForm[],
    conversoes: [] as ConversaoForm[]
  };
}

export type ProdutoForm = ReturnType<typeof formularioVazio>;

export function descricaoPreviewDoProduto(entrada: {
  nome: string;
  nomeOriginal: string | null;
  descricaoAtual: string;
  quantidade: string;
  siglaUnidade: string;
}): string {
  const descricaoLegadaIntacta = entrada.nomeOriginal === null && entrada.nome === entrada.descricaoAtual;
  if (descricaoLegadaIntacta) return entrada.descricaoAtual;
  if (!entrada.nome.trim() || !entrada.siglaUnidade) return "";
  return montarDescricao(entrada.nome, entrada.quantidade, entrada.siglaUnidade);
}

export function formularioDoDetalhe(detalhe: ProdutoDetalhe): ProdutoForm {
  const { fiscal, transformacao } = detalhe;

  return {
    ...formularioVazio(detalhe.empresaId),
    status: detalhe.status === "inativo" ? "inativo" : "ativo",
    codigo: detalhe.codigo ?? "",
    codigoInterno: detalhe.codigoInterno ?? "",
    codigoBarras: detalhe.codigoBarras ?? "",
    marca: detalhe.marca ?? "",
    compraAproximada: detalhe.compraAproximada,
    habilitarAjuda: detalhe.habilitarAjuda,
    setorVenda1: detalhe.setorVenda1 ?? "",
    setorVenda2: detalhe.setorVenda2 ?? "",
    descricao: detalhe.descricao,
    nomeCatalogo: detalhe.nomeCatalogo ?? detalhe.descricao ?? "",
    nomeCatalogoOriginal: detalhe.nomeCatalogo,
    pesavel: detalhe.pesavel,
    teclaBalanca: detalhe.teclaBalanca == null ? "" : String(detalhe.teclaBalanca),
    validadeBalanca: detalhe.validadeBalanca == null ? "" : String(detalhe.validadeBalanca),
    areaVenda: detalhe.areaVenda ?? "",
    // Numeros sem as casas do banco ("25.000" -> "25") e margem sem lixo de ponto flutuante.
    quantidadeIndividual: textoDeNumero(detalhe.quantidadeIndividual) || "0",
    unidadeIndividualId: detalhe.unidadeIndividualId ?? "",
    grupoMercadoriaId: detalhe.grupoMercadoriaId,
    tipo: detalhe.tipo === "transformacao" ? "transformacao" : "revenda",
    embalagem: detalhe.embalagem,
    cDe: detalhe.cDe === "C/" ? "C/" : "DE",
    quantidadeCaixa: String(detalhe.quantidadeCaixa || 1),
    medidaCompra: detalhe.medidaCompra,
    custo: textoDeNumero(detalhe.custo),
    margemPercentual: fracaoParaPercentual(detalhe.margem),
    auto: detalhe.auto,
    precoVenda: textoDeNumero(detalhe.precoVenda),
    quantidadeEstoque: textoDeNumero(detalhe.quantidadeEstoque) || "0",
    estoqueMin: textoDeNumero(detalhe.estoqueMin),
    estoqueMax: textoDeNumero(detalhe.estoqueMax),
    areaEstoque: detalhe.areaEstoque ?? "",
    setorEstoque: detalhe.setorEstoque ?? "",
    curvaAbc: detalhe.curvaAbc ?? "",
    quantidadeVariavel: detalhe.quantidadeVariavel,
    toleranciaQuantidadePercentual: textoDeNumero(detalhe.toleranciaQuantidadePercentual),
    localVenda1: detalhe.localVenda1 ?? "",
    localVenda2: detalhe.localVenda2 ?? "",
    fotoUrl: detalhe.fotoUrl,
    precisao: transformacao?.precisao ?? "EXATOS",
    quantidadeTransformacao: textoDeNumero(transformacao?.quantidade),
    unidadeTransformacao: transformacao?.unidade ?? "",
    produtoReceituario: transformacao?.produtoReceituario ?? "",
    refReceituario: transformacao?.refReceituario ?? "",
    fiscal: {
      ncm: fiscal?.ncm ?? "",
      cest: fiscal?.cest ?? "",
      categoriaFiscal: fiscal?.categoriaFiscal ?? "",
      cstPisCofins: fiscal?.cstPisCofins ?? "",
      aliquotaCheia: fiscal?.aliquotaCheia ?? "",
      aliquotaFcp: fiscal?.aliquotaFcp ?? "",
      aliquotaPis: fiscal?.aliquotaPis ?? "",
      aliquotaCofins: fiscal?.aliquotaCofins ?? "",
      reducaoIcms: fiscal?.reducaoIcms ?? "",
      icms: fiscal?.icms ?? "",
      tributacaoSimples: fiscal?.tributacaoSimples ?? "",
      aliquotaSimples: fiscal?.aliquotaSimples ?? "",
      icmsRe: fiscal?.icmsRe ?? "",
      baseFiscal: fiscal?.baseFiscal ?? "",
      codigoFiscal: fiscal?.codigoFiscal ?? "",
      produtoFiscal: fiscal?.produtoFiscal ?? "",
      cstReforma: fiscal?.cstReforma ?? "",
      cClassTrib: fiscal?.cClassTrib ?? "",
      aliquotaIbs: fiscal?.aliquotaIbs ?? "",
      aliquotaCbs: fiscal?.aliquotaCbs ?? "",
      origemFiscal: fiscal?.origemFiscal ?? "",
      aliquotaEcf: fiscal?.aliquotaEcf ?? "",
      aliquotaEcfId: fiscal?.aliquotaEcfId ?? "",
      estado: fiscal?.estado ?? "",
      motivo: fiscal?.motivo ?? "",
      conferidoEm: fiscal?.conferidoEm ?? "",
      pctNcm: fiscal?.pctNcm ?? ""
    },
    promocoes: (detalhe.promocoes ?? []).map((promo) => ({
      tipo: promo.tipo === "valor" ? "valor" : "desconto",
      valor: textoDeNumero(promo.valor),
      descontoPercentual: fracaoParaPercentual(promo.descontoFracao),
      horaInicio: (promo.horaInicio ?? "").slice(0, 5),
      horaFim: (promo.horaFim ?? "").slice(0, 5),
      dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom],
      validaAte: promo.validaAte ?? ""
    })),
    conversoes: (detalhe.conversoes ?? []).map((conversao) => ({
      unidadeMedidaId: conversao.unidadeMedidaId,
      quantidade: textoDeNumero(conversao.quantidade),
      unidadesIndividuais: textoDeNumero(conversao.unidadesIndividuais)
    }))
  };
}

/**
 * "Voltar a herdar da base" (oficial): devolve ao formulario os valores ATUAIS da BASE nos campos
 * herdados. Promocoes, estoque, preco e fiscal sao da loja e nao sao tocados.
 */
export function aplicarValoresDaBase(form: ProdutoForm, base: ValoresHerdados): void {
  Object.assign(form, {
    descricao: base.descricao,
    nomeCatalogo: base.nomeCatalogo ?? base.descricao,
    quantidadeIndividual: String(base.quantidadeIndividual),
    unidadeIndividualId: base.unidadeIndividualId,
    pesavel: base.pesavel,
    teclaBalanca: base.teclaBalanca == null ? "" : String(base.teclaBalanca),
    validadeBalanca: base.validadeBalanca == null ? "" : String(base.validadeBalanca),
    codigoBarras: base.codigoBarras ?? "",
    marca: base.marca ?? "",
    embalagem: base.embalagem,
    cDe: base.cDe === "C/" ? "C/" : "DE",
    quantidadeCaixa: String(base.quantidadeCaixa || 1),
    medidaCompra: base.medidaCompra,
    compraAproximada: base.compraAproximada,
    grupoMercadoriaId: base.grupoMercadoriaId,
    tipo: base.tipo,
    habilitarAjuda: base.habilitarAjuda,
    precisao: base.transformacao?.precisao ?? "EXATOS",
    quantidadeTransformacao: base.transformacao?.quantidade == null ? "" : String(base.transformacao.quantidade),
    unidadeTransformacao: base.transformacao?.unidade ?? "",
    produtoReceituario: base.transformacao?.produtoReceituario ?? "",
    refReceituario: base.transformacao?.refReceituario ?? ""
  });
}

export function payloadDoFormulario(
  form: ProdutoForm,
  empresaId: string,
  forcar: boolean,
  descricaoAutomatica?: string
) {
  const ehRevenda = form.tipo === "revenda";
  const fiscalPreenchido = Object.values(form.fiscal).some((valor) => String(valor).trim());
  const preservarDescricaoLegada = form.nomeCatalogoOriginal === null && form.nomeCatalogo === form.descricao;
  return {
    empresaId,
    codigo: form.codigo || null,
    codigoBarras: form.codigoBarras || null,
    descricao: (preservarDescricaoLegada ? form.descricao : (descricaoAutomatica ?? form.descricao)).trim(),
    nomeCatalogo: preservarDescricaoLegada ? null : form.nomeCatalogo.trim() || null,
    pesavel: form.pesavel,
    // Tecla fixa 000 para quem vai a balanca; quem nao vai fica sem tecla e sem validade (oficial).
    teclaBalanca: form.pesavel === true ? 0 : form.pesavel === false ? null : numeroDigitado(form.teclaBalanca),
    validadeBalanca:
      form.pesavel === false ? null : form.validadeBalanca === "" ? null : numeroDigitado(form.validadeBalanca),
    // Sem `grupoIdExterno`: o ID do grupo no PDV nao e digitado, o servidor resolve pelo NOME do grupo.
    areaVenda: form.areaVenda || null,
    marca: form.marca || null,
    compraAproximada: form.compraAproximada,
    habilitarAjuda: form.habilitarAjuda,
    setorVenda1: form.setorVenda1 || null,
    setorVenda2: form.setorVenda2 || null,
    unidadeIndividualId: form.unidadeIndividualId,
    quantidadeIndividual: numeroDigitado(form.quantidadeIndividual) ?? 0,
    grupoMercadoriaId: form.grupoMercadoriaId || null,
    embalagem: form.embalagem || null,
    cDe: form.embalagem ? form.cDe : null,
    quantidadeCaixa: numeroDigitado(form.quantidadeCaixa) ?? 1,
    medidaCompra: form.medidaCompra || null,
    // Vazio vai como null, nunca 0: custo, preco e estoque zerados sao afirmacao, nao ausencia.
    custo: numeroDigitado(form.custo),
    margem: percentualParaFracao(form.margemPercentual),
    precoVenda: numeroDigitado(form.precoVenda),
    auto: form.auto,
    status: form.status,
    tipo: form.tipo,
    estoqueMin: numeroDigitado(form.estoqueMin),
    estoqueMax: numeroDigitado(form.estoqueMax),
    areaEstoque: form.areaEstoque || null,
    setorEstoque: form.setorEstoque || null,
    curvaAbc: form.curvaAbc || null,
    quantidadeVariavel: form.quantidadeVariavel,
    toleranciaQuantidadePercentual: form.quantidadeVariavel
      ? (numeroDigitado(form.toleranciaQuantidadePercentual) ?? 0)
      : null,
    localVenda1: form.localVenda1 || null,
    localVenda2: form.localVenda2 || null,
    fotoUrl: form.fotoUrl,
    fiscal: fiscalPreenchido
      ? {
          ncm: form.fiscal.ncm || null,
          cest: form.fiscal.cest || null,
          categoriaFiscal: form.fiscal.categoriaFiscal || null,
          cstPisCofins: form.fiscal.cstPisCofins || null,
          aliquotaCheia: numeroDigitado(form.fiscal.aliquotaCheia),
          aliquotaFcp: numeroDigitado(form.fiscal.aliquotaFcp),
          aliquotaPis: numeroDigitado(form.fiscal.aliquotaPis),
          aliquotaCofins: numeroDigitado(form.fiscal.aliquotaCofins),
          reducaoIcms: numeroDigitado(form.fiscal.reducaoIcms),
          icms: numeroDigitado(form.fiscal.icms),
          tributacaoSimples: form.fiscal.tributacaoSimples || null,
          aliquotaSimples: numeroDigitado(form.fiscal.aliquotaSimples),
          icmsRe: numeroDigitado(form.fiscal.icmsRe),
          baseFiscal: form.fiscal.baseFiscal || null,
          codigoFiscal: form.fiscal.codigoFiscal || null,
          produtoFiscal: form.fiscal.produtoFiscal || null,
          cstReforma: form.fiscal.cstReforma || null,
          cClassTrib: form.fiscal.cClassTrib || null,
          aliquotaIbs: numeroDigitado(form.fiscal.aliquotaIbs),
          aliquotaCbs: numeroDigitado(form.fiscal.aliquotaCbs),
          origemFiscal: form.fiscal.origemFiscal || null,
          aliquotaEcf: form.fiscal.aliquotaEcf || null,
          aliquotaEcfId: form.fiscal.aliquotaEcfId || null,
          estado: form.fiscal.estado || null,
          motivo: form.fiscal.motivo || null,
          conferidoEm: form.fiscal.conferidoEm || null,
          pctNcm: numeroDigitado(form.fiscal.pctNcm)
        }
      : null,
    // Payload coerente com o tipo: o servidor recusa o contrario, e a tela nao manda o que ele recusa.
    transformacao: ehRevenda
      ? null
      : {
          precisao: form.precisao,
          quantidade: numeroDigitado(form.quantidadeTransformacao),
          unidade: form.unidadeTransformacao || null,
          produtoReceituario: form.produtoReceituario || null,
          refReceituario: form.refReceituario || null
        },
    promocoes: ehRevenda
      ? form.promocoes.map((promo) => ({
          tipo: promo.tipo,
          valor: promo.tipo === "valor" ? numeroDigitado(promo.valor) : null,
          descontoFracao: promo.tipo === "desconto" ? percentualParaFracao(promo.descontoPercentual) : null,
          horaInicio: promo.horaInicio || null,
          horaFim: promo.horaFim || null,
          seg: promo.dias[0],
          ter: promo.dias[1],
          qua: promo.dias[2],
          qui: promo.dias[3],
          sex: promo.dias[4],
          sab: promo.dias[5],
          dom: promo.dias[6],
          validaAte: promo.validaAte || null
        }))
      : [],
    conversoes: form.conversoes
      .filter((conversao) => conversao.unidadeMedidaId)
      .map((conversao) => ({
        unidadeMedidaId: conversao.unidadeMedidaId,
        quantidade: numeroDigitado(conversao.quantidade) ?? 1,
        unidadesIndividuais: numeroDigitado(conversao.unidadesIndividuais) ?? 1
      })),
    forcar
  };
}

import type { ProdutoDetalhe } from "@padaria/shared";

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
    descricao: "",
    quantidadeIndividual: "1",
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
    setorEstoque: "",
    localVenda1: "",
    localVenda2: "",
    fotoUrl: null as string | null,
    precisao: "EXATOS",
    quantidadeTransformacao: "",
    unidadeTransformacao: "",
    produtoReceituario: "",
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
      icms: ""
    },
    promocoes: [] as PromocaoForm[],
    conversoes: [] as ConversaoForm[]
  };
}

export type ProdutoForm = ReturnType<typeof formularioVazio>;

export const numero = (texto: string) => {
  const valor = Number(String(texto).replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
};

export function formularioDoDetalhe(detalhe: ProdutoDetalhe): ProdutoForm {
  const { fiscal, transformacao } = detalhe;

  return {
    ...formularioVazio(detalhe.empresaId),
    status: detalhe.status === "inativo" ? "inativo" : "ativo",
    codigo: detalhe.codigo ?? "",
    codigoInterno: detalhe.codigoInterno ?? "",
    codigoBarras: detalhe.codigoBarras ?? "",
    marca: detalhe.marca ?? "",
    descricao: detalhe.descricao,
    quantidadeIndividual: detalhe.quantidadeIndividual || "1",
    unidadeIndividualId: detalhe.unidadeIndividualId ?? "",
    grupoMercadoriaId: detalhe.grupoMercadoriaId,
    tipo: detalhe.tipo === "transformacao" ? "transformacao" : "revenda",
    embalagem: detalhe.embalagem,
    cDe: detalhe.cDe === "C/" ? "C/" : "DE",
    quantidadeCaixa: String(detalhe.quantidadeCaixa || 1),
    medidaCompra: detalhe.medidaCompra,
    custo: detalhe.custo ?? "",
    margemPercentual: detalhe.margem == null ? "" : String(Number(detalhe.margem) * 100),
    auto: detalhe.auto,
    precoVenda: detalhe.precoVenda ?? "",
    quantidadeEstoque: detalhe.quantidadeEstoque || "0",
    estoqueMin: detalhe.estoqueMin ?? "",
    estoqueMax: detalhe.estoqueMax ?? "",
    setorEstoque: detalhe.setorEstoque ?? "",
    localVenda1: detalhe.localVenda1 ?? "",
    localVenda2: detalhe.localVenda2 ?? "",
    fotoUrl: detalhe.fotoUrl,
    precisao: transformacao?.precisao ?? "EXATOS",
    quantidadeTransformacao: transformacao?.quantidade ?? "",
    unidadeTransformacao: transformacao?.unidade ?? "",
    produtoReceituario: transformacao?.produtoReceituario ?? "",
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
      icms: fiscal?.icms ?? ""
    },
    promocoes: (detalhe.promocoes ?? []).map((promo) => ({
      tipo: promo.tipo === "valor" ? "valor" : "desconto",
      valor: promo.valor ?? "",
      descontoPercentual: promo.descontoFracao == null ? "" : String(Number(promo.descontoFracao) * 100),
      horaInicio: (promo.horaInicio ?? "").slice(0, 5),
      horaFim: (promo.horaFim ?? "").slice(0, 5),
      dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom],
      validaAte: promo.validaAte ?? ""
    })),
    conversoes: (detalhe.conversoes ?? []).map((conversao) => ({
      unidadeMedidaId: conversao.unidadeMedidaId,
      quantidade: conversao.quantidade,
      unidadesIndividuais: conversao.unidadesIndividuais
    }))
  };
}

export function payloadDoFormulario(form: ProdutoForm, empresaId: string, forcar: boolean) {
  const ehRevenda = form.tipo === "revenda";
  const fiscalPreenchido = Object.values(form.fiscal).some((valor) => String(valor).trim());
  return {
    empresaId,
    codigo: form.codigo || null,
    codigoBarras: form.codigoBarras || null,
    descricao: form.descricao.trim(),
    marca: form.marca || null,
    unidadeIndividualId: form.unidadeIndividualId,
    quantidadeIndividual: numero(form.quantidadeIndividual) ?? 1,
    grupoMercadoriaId: form.grupoMercadoriaId || null,
    embalagem: form.embalagem || null,
    cDe: form.embalagem ? form.cDe : null,
    quantidadeCaixa: numero(form.quantidadeCaixa) ?? 1,
    medidaCompra: form.medidaCompra || null,
    custo: numero(form.custo),
    margem: form.margemPercentual ? (numero(form.margemPercentual) ?? 0) / 100 : null,
    precoVenda: numero(form.precoVenda),
    auto: form.auto,
    status: form.status,
    tipo: form.tipo,
    quantidadeEstoque: numero(form.quantidadeEstoque),
    estoqueMin: numero(form.estoqueMin),
    estoqueMax: numero(form.estoqueMax),
    setorEstoque: form.setorEstoque || null,
    localVenda1: form.localVenda1 || null,
    localVenda2: form.localVenda2 || null,
    fotoUrl: form.fotoUrl,
    fiscal: fiscalPreenchido
      ? {
          ncm: form.fiscal.ncm || null,
          cest: form.fiscal.cest || null,
          categoriaFiscal: form.fiscal.categoriaFiscal || null,
          cstPisCofins: form.fiscal.cstPisCofins || null,
          aliquotaCheia: numero(form.fiscal.aliquotaCheia),
          aliquotaFcp: numero(form.fiscal.aliquotaFcp),
          aliquotaPis: numero(form.fiscal.aliquotaPis),
          aliquotaCofins: numero(form.fiscal.aliquotaCofins),
          reducaoIcms: numero(form.fiscal.reducaoIcms),
          icms: numero(form.fiscal.icms)
        }
      : null,
    // Payload coerente com o tipo: o servidor recusa o contrario, e a tela nao manda o que ele recusa.
    transformacao: ehRevenda
      ? null
      : {
          precisao: form.precisao,
          quantidade: numero(form.quantidadeTransformacao),
          unidade: form.unidadeTransformacao || null,
          produtoReceituario: form.produtoReceituario || null
        },
    promocoes: ehRevenda
      ? form.promocoes.map((promo) => ({
          tipo: promo.tipo,
          valor: promo.tipo === "valor" ? numero(promo.valor) : null,
          descontoFracao:
            promo.tipo === "desconto" && promo.descontoPercentual
              ? (numero(promo.descontoPercentual) ?? 0) / 100
              : null,
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
        quantidade: numero(conversao.quantidade) ?? 1,
        unidadesIndividuais: numero(conversao.unidadesIndividuais) ?? 1
      })),
    forcar
  };
}

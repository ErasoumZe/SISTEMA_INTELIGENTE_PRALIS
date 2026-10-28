import type { JsonValue } from "@padaria/shared/api";
import type { ProdutoPlanilha } from "@padaria/shared/produtos";
import type {
  baseParaPlanilhaRepository,
  produtoDaLojaParaPlanilhaRepository
} from "./produtos-planilha-produto.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";

/**
 * O produto do ERP com os nomes de campo do app oficial, para o mapa da planilha (`mapProductToCells`,
 * porte literal). `loja` e `baseProductId` decidem a linha e a faixa, como no `ProductSheetService`.
 */
export interface ProdutoParaPlanilha {
  produto: ProdutoPlanilha;
  loja: string;
  /** Id (do oficial) do produto da BASE: e o ID da linha na planilha nova. Null = sem vinculo. */
  baseProductId: string | null;
  /** Id do ERP do produto da BASE (onde a fila guarda a linha). */
  baseErpId: string | null;
}

type LinhaBase = NonNullable<Awaited<ReturnType<typeof baseParaPlanilhaRepository>>>;
type LinhaLoja = NonNullable<Awaited<ReturnType<typeof produtoDaLojaParaPlanilhaRepository>>>;

const txt = (valor: JsonValue | undefined): string | null => {
  if (valor == null || typeof valor === "object") return null;
  const limpo = String(valor).trim();
  return limpo || null;
};
const num = (valor: JsonValue | string | null | undefined): number | null => {
  if (valor == null || typeof valor === "object" || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};
const bool = (valor: JsonValue | undefined): boolean => valor === true || valor === "true" || valor === "S";
/** O oficial guarda "12:00"; o `time` do Postgres devolve "12:00:00". */
const hora = (valor: string | null | undefined): string | null => (valor ? valor.slice(0, 5) : null);

export function planilhaDaBase(linha: LinhaBase): ProdutoParaPlanilha {
  const d = linha.dadosOficiais;
  const tipo = d["tipo"] === "transformacao" ? "transformacao" : "revenda";
  const promocoes = Array.isArray(d["promocoes"]) ? d["promocoes"] : [];
  return {
    loja: "BASE",
    baseProductId: null,
    baseErpId: null,
    produto: {
      id: linha.idOrigem,
      nome: linha.nome,
      quantidade: num(d["quantidade"]) ?? 0,
      medidaBase: txt(d["medida_base"]) ?? "",
      codigoBarras: linha.codigoBarras,
      marca: txt(d["marca"]),
      embalagem: txt(d["embalagem"]),
      cDe: d["c_de"] === "C/" || d["c_de"] === "DE" ? d["c_de"] : null,
      qtCad: num(d["qt_cad"]) ?? 1,
      medidaCompra: txt(d["medida_compra"]),
      compraAproximada: bool(d["compra_aproximada"]),
      codigoInterno: linha.codigoInterno,
      fotoUrl: txt(d["foto_url"]),
      grupo: txt(d["grupo"]),
      tipo,
      status: linha.status,
      habilitarAjuda: bool(d["habilitar_ajuda"]),
      estoqueMin: num(d["estoque_min"]),
      estoqueMax: num(d["estoque_max"]),
      setorEstoque: txt(d["setor_estoque"]),
      custo: num(d["custo"]),
      margemPontual: num(d["margem_pontual"]),
      vVendaPontual: num(d["venda_pontual"]),
      auto: bool(d["calculo_automatico"]),
      localVenda1: txt(d["local_venda_1"]),
      localVenda2: txt(d["local_venda_2"]),
      // Oficial: promocao e da loja; a BASE nunca tem. Lida assim mesmo, sem inventar.
      promocoes: promocoes.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const tipoPromo = item["tipo"];
        if (tipoPromo !== "valor" && tipoPromo !== "desconto") return [];
        return [
          {
            tipo: tipoPromo,
            valor: num(item["valor"]),
            descontoPct: num(item["desconto_pct"]),
            descontoAte: txt(item["desconto_ate"]),
            horaInicio: txt(item["hora_inicio"]),
            horaFim: txt(item["hora_fim"]),
            dias: Array.isArray(item["dias"]) ? item["dias"].map((dia) => dia === true) : null
          }
        ];
      }),
      transformacao:
        tipo === "transformacao"
          ? {
              precisao: txt(d["transformacao_precisao"]),
              qtd: num(d["transformacao_qtd"]),
              unidade: txt(d["transformacao_unidade"]),
              produtoReceituario: txt(d["produto_receituario"]),
              refReceituario: txt(d["ref_receituario"])
            }
          : null,
      fiscal: {
        reducaoIcms: num(d["reducao_icms"]),
        aliquotaCheia: num(d["aliquota_cheia"]),
        aliquotaFcp: num(d["aliquota_fcp"]),
        cstPisCofins: txt(d["cst_pis_cofins"]),
        aliquotaPis: num(d["aliquota_pis"]),
        aliquotaCofins: num(d["aliquota_cofins"]),
        ncm: txt(d["ncm"]),
        categoria: txt(d["categoria"]),
        icms: num(d["icms"]),
        cest: txt(d["cest"]),
        aliquotaEcf: txt(d["aliquota_ecf"]),
        aliquotaEcfId: txt(d["aliquota_ecf_id"]),
        pctNcm: num(d["pct_ncm"])
      }
    }
  };
}

export function planilhaDaLoja(linha: LinhaLoja): ProdutoParaPlanilha {
  const tipo = linha.tipo === "transformacao" ? "transformacao" : "revenda";
  const f = linha.fiscal;
  const t = linha.transformacao;
  return {
    loja: lojaFiscalDaEmpresa(linha.matriculaPrefixo),
    baseProductId: linha.baseIdOrigem,
    baseErpId: linha.produtoBaseId,
    produto: {
      id: linha.id,
      nome: linha.nomeCatalogo?.trim() || linha.descricao,
      quantidade: linha.nomeCatalogo ? Number(linha.quantidadeIndividual) : 0,
      medidaBase: linha.sigla?.toUpperCase() ?? "",
      codigoBarras: linha.codigoBarras,
      marca: linha.marca,
      embalagem: linha.embalagem,
      cDe: linha.cDe === "C/" || linha.cDe === "DE" ? linha.cDe : null,
      qtCad: linha.quantidadeCaixa,
      medidaCompra: linha.medidaCompra,
      compraAproximada: linha.compraAproximada,
      codigoInterno: linha.codigoInterno,
      fotoUrl: linha.fotoUrl,
      grupo: linha.grupoNome,
      tipo,
      status: linha.status,
      habilitarAjuda: linha.habilitarAjuda,
      estoqueMin: num(linha.estoqueMin),
      estoqueMax: num(linha.estoqueMax),
      setorEstoque: linha.setorEstoque,
      custo: num(linha.custo),
      margemPontual: num(linha.margem),
      vVendaPontual: num(linha.precoVenda),
      auto: linha.auto,
      localVenda1: linha.localVenda1,
      localVenda2: linha.localVenda2,
      promocoes: linha.promocoes.map((p) => ({
        tipo: p.tipo === "desconto" ? "desconto" : "valor",
        valor: num(p.valor),
        // Fracao nos dois lados (oficial `descontoPct // fração`).
        descontoPct: num(p.descontoFracao),
        // O ERP nao guarda o rotulo "ATE x%" do oficial: a coluna fica vazia.
        descontoAte: null,
        horaInicio: hora(p.horaInicio),
        horaFim: hora(p.horaFim),
        dias: [p.seg, p.ter, p.qua, p.qui, p.sex, p.sab, p.dom]
      })),
      transformacao:
        tipo === "transformacao" && t
          ? {
              precisao: t.precisao,
              qtd: num(t.quantidade),
              unidade: t.unidade,
              produtoReceituario: t.produtoReceituario,
              refReceituario: t.refReceituario
            }
          : null,
      fiscal: f
        ? {
            reducaoIcms: num(f.reducaoIcms),
            aliquotaCheia: num(f.aliquotaCheia),
            aliquotaFcp: num(f.aliquotaFcp),
            cstPisCofins: f.cstPisCofins,
            aliquotaPis: num(f.aliquotaPis),
            aliquotaCofins: num(f.aliquotaCofins),
            ncm: f.ncm,
            categoria: f.categoriaFiscal,
            icms: num(f.icms),
            cest: f.cest,
            aliquotaEcf: f.aliquotaEcf,
            aliquotaEcfId: f.aliquotaEcfId,
            pctNcm: num(f.pctNcm)
          }
        : null
    }
  };
}

import type { JsonValue } from "@padaria/shared/api";
import { montarDescricao, type ProdutoPayload } from "@padaria/shared/produtos";
import {
  carregarProdutoBaseParaLojaRepository,
  importarCatalogoBaseRepository,
  listarCatalogoBaseRepository
} from "./produtos-catalogo-base.repository.js";
import { salvarProduto, type AtorDaEscrita } from "./produtos.service.js";
import { ehFotoDaBaseNoErp } from "./produtos-foto.js";

export class ImportacaoCatalogoBaseInvalidaError extends Error {}

const normalizarChave = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\p{Cf}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/gu, "");
const normalizarGrupo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\p{Cf}/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleUpperCase("pt-BR");
const AREAS_VENDA = [
  "caixa",
  "vitrine",
  "copa",
  "chapa",
  "mesas",
  "vasca_paes",
  "vitrine_paes",
  "paes_empacotados",
  "mesa_paes",
  "frios",
  "bebidas",
  "laticinios",
  "mercearia",
  "estoque_bebidas",
  "biscoitos",
  "dml_limpeza"
] as const;

function mapaDados(dados: Record<string, JsonValue>) {
  return new Map(Object.entries(dados).map(([chave, valor]) => [normalizarChave(chave), valor]));
}

function valor(dados: Map<string, JsonValue>, chave: string): JsonValue | undefined {
  return dados.get(normalizarChave(chave));
}

function texto(dados: Map<string, JsonValue>, chave: string): string | null {
  const bruto = valor(dados, chave);
  return typeof bruto === "string" || typeof bruto === "number" ? String(bruto).trim() || null : null;
}

function numero(dados: Map<string, JsonValue>, chave: string): number | null {
  const bruto = valor(dados, chave);
  if (typeof bruto !== "string" && typeof bruto !== "number") return null;
  const original = String(bruto).trim();
  const normalizado = original.includes(",") ? original.replace(/\./gu, "").replace(",", ".") : original;
  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado : null;
}

function booleano(dados: Map<string, JsonValue>, chave: string): boolean | null {
  const bruto = valor(dados, chave);
  if (typeof bruto === "boolean") return bruto;
  if (typeof bruto !== "string") return null;
  const valorNormalizado = normalizarChave(bruto);
  if (["sim", "s", "true", "1", "ativo"].includes(valorNormalizado)) return true;
  if (["nao", "n", "false", "0", "inativo"].includes(valorNormalizado)) return false;
  return null;
}

function resolverUnidade(sigla: string, unidades: Array<{ id: string; sigla: string }>) {
  const correspondentes = unidades.filter((unidade) => normalizarChave(unidade.sigla) === normalizarChave(sigla));
  return correspondentes.length === 1 ? correspondentes[0] : null;
}

/**
 * O produto da BASE resolvido para uma loja (unidade e grupo pelo id DAQUELA loja). E o leitor unico
 * de `dados_oficiais`: a copia, a edicao da BASE e a heranca usam esta mesma traducao.
 */
export function montarPayloadBase(
  produto: { codigoBarras: string | null; nome: string; dadosOficiais: Record<string, JsonValue> },
  unidades: Array<{ id: string; sigla: string }>,
  grupos: Array<{ id: string; nome: string }>,
  empresaId: string,
  /**
   * `tolerante`: para LER e COMPARAR (heranca, formulario), unidade ou grupo sem par na loja nao derruba
   * tudo — volta "" naquele campo, e quem chama ignora so ele. A copia (gravacao) nunca e tolerante.
   */
  opcoes: { ignorarFoto?: boolean; tolerante?: boolean } = {}
): { payload: ProdutoPayload; erro?: never } | { erro: string; payload?: never } {
  const dados = mapaDados(produto.dadosOficiais);
  // Caminhos de foto pertencem ao storage da aplicação de origem. Persisti-los
  // como se fossem paths deste ERP criaria produtos com imagens quebradas.
  // Até existir transferência binária autenticada, pare a cópia para não perder
  // silenciosamente um atributo oficial. Ler para editar ou comparar a herança não grava foto.
  // Foto gravada pelo ERP na BASE vive no storage daqui: a loja herda o mesmo caminho.
  const fotoOrigem = texto(dados, "foto_url");
  const fotoDoErp = fotoOrigem && ehFotoDaBaseNoErp(fotoOrigem) ? fotoOrigem : null;
  if (!opcoes.ignorarFoto && fotoOrigem && !fotoDoErp) {
    return { erro: "Este produto tem foto na origem; transfira o arquivo para o storage do ERP antes de copiá-lo." };
  }
  const medidaBase = texto(dados, "medida_base");
  const quantidade = numero(dados, "quantidade");
  // Gramatura 0 e valida no oficial (produto sem peso por unidade); so ausente ou negativa bloqueia.
  if (!medidaBase || quantidade == null || quantidade < 0)
    return { erro: "Produto sem quantidade ou medida base válidas." };
  const unidade = resolverUnidade(medidaBase, unidades);
  if (!unidade && !opcoes.tolerante) {
    return { erro: `A loja não tem uma unidade única equivalente a ${medidaBase}.` };
  }

  const grupoNome = texto(dados, "grupo");
  let grupoMercadoriaId: string | null = null;
  if (grupoNome) {
    const correspondentes = grupos.filter((grupo) => normalizarGrupo(grupo.nome) === normalizarGrupo(grupoNome));
    if (correspondentes.length !== 1 && !opcoes.tolerante) {
      return { erro: `O grupo “${grupoNome}” não tem correspondência única na loja.` };
    }
    grupoMercadoriaId = correspondentes.length === 1 ? correspondentes[0]!.id : "";
  }

  for (const campo of ["embalagem", "medida_compra"] as const) {
    const sigla = texto(dados, campo);
    if (sigla && !resolverUnidade(sigla, unidades) && !opcoes.tolerante)
      return { erro: `A loja não tem uma unidade única equivalente a ${sigla}.` };
  }

  const status = texto(dados, "status");
  const tipo = texto(dados, "tipo");
  if (status !== "ativo" && status !== "inativo")
    return { erro: `Situação oficial não suportada: ${status ?? "vazia"}.` };
  if (tipo !== "revenda" && tipo !== "transformacao")
    return { erro: `Tipo oficial não suportado: ${tipo ?? "vazio"}.` };
  const areaVendaOrigem = texto(dados, "area_venda");
  if (areaVendaOrigem && !AREAS_VENDA.includes(areaVendaOrigem as (typeof AREAS_VENDA)[number])) {
    return { erro: `Área de venda oficial não suportada: ${areaVendaOrigem}.` };
  }

  const tipoTransformacao =
    texto(dados, "transformacao_precisao") ||
    texto(dados, "transformacao_qtd") ||
    texto(dados, "transformacao_unidade");
  const precisaoOrigem = texto(dados, "transformacao_precisao");
  if (precisaoOrigem && precisaoOrigem !== "EXATOS" && precisaoOrigem !== "APROXIMADOS") {
    return { erro: `Precisão da transformação não suportada: ${precisaoOrigem}.` };
  }
  const precisaoValidada: "EXATOS" | "APROXIMADOS" | null = precisaoOrigem as "EXATOS" | "APROXIMADOS" | null;
  const transformacao =
    tipo === "transformacao" && tipoTransformacao
      ? {
          precisao: precisaoValidada,
          quantidade: numero(dados, "transformacao_qtd"),
          unidade: texto(dados, "transformacao_unidade"),
          produtoReceituario: texto(dados, "produto_receituario"),
          refReceituario: texto(dados, "ref_receituario")
        }
      : null;

  const promocoesRaw = valor(dados, "promocoes");
  if (Array.isArray(promocoesRaw)) {
    for (const item of promocoesRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return { erro: "A origem contém uma promoção inválida." };
      const promocao = mapaDados(item);
      const tipoPromocao = texto(promocao, "tipo");
      if (tipoPromocao !== "valor" && tipoPromocao !== "desconto") {
        return { erro: "A origem contém um tipo de promoção não suportado." };
      }
    }
  }
  const promocoes = Array.isArray(promocoesRaw)
    ? promocoesRaw.flatMap((item): ProdutoPayload["promocoes"] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const promo = mapaDados(item);
        const promoTipo = texto(promo, "tipo");
        const descontoPercentual = numero(promo, "desconto_pct");
        if (promoTipo !== "valor" && promoTipo !== "desconto") return [];
        const dias = texto(promo, "dias") ?? "";
        return [
          {
            tipo: promoTipo === "valor" ? "valor" : "desconto",
            valor: promoTipo === "valor" ? numero(promo, "valor") : null,
            descontoFracao: promoTipo === "desconto" && descontoPercentual != null ? descontoPercentual / 100 : null,
            horaInicio: texto(promo, "hora_inicio"),
            horaFim: texto(promo, "hora_fim"),
            seg: dias[0]?.toUpperCase() === "S",
            ter: dias[1]?.toUpperCase() === "S",
            qua: dias[2]?.toUpperCase() === "S",
            qui: dias[3]?.toUpperCase() === "S",
            sex: dias[4]?.toUpperCase() === "S",
            sab: dias[5]?.toUpperCase() === "S",
            dom: dias[6]?.toUpperCase() === "S",
            validaAte: texto(promo, "desconto_ate")
          }
        ];
      })
    : [];

  return {
    payload: {
      empresaId,
      codigo: null,
      codigoBarras: produto.codigoBarras,
      // Oficial: `nome` e o nome do catalogo; a descricao e nome + quantidade + medida.
      descricao: montarDescricao(produto.nome, quantidade, unidade?.sigla ?? medidaBase),
      nomeCatalogo: produto.nome,
      marca: texto(dados, "marca"),
      pesavel: booleano(dados, "pesavel"),
      teclaBalanca: numero(dados, "tecla_balanca"),
      validadeBalanca: numero(dados, "validade_balanca"),
      grupoIdExterno: texto(dados, "grupo_id"),
      areaVenda: (areaVendaOrigem as (typeof AREAS_VENDA)[number] | null) ?? null,
      unidadeIndividualId: unidade?.id ?? "",
      quantidadeIndividual: quantidade,
      conversoes: [],
      grupoMercadoriaId,
      embalagem: texto(dados, "embalagem"),
      cDe: texto(dados, "embalagem") ? (texto(dados, "c_de") === "C/" ? "C/" : "DE") : null,
      quantidadeCaixa: numero(dados, "qt_cad") ?? 1,
      medidaCompra: texto(dados, "medida_compra"),
      custo: numero(dados, "custo"),
      margem: numero(dados, "margem_pontual"),
      precoVenda: numero(dados, "venda_pontual"),
      auto: booleano(dados, "calculo_automatico") ?? false,
      status,
      tipo,
      compraAproximada: booleano(dados, "compra_aproximada") ?? false,
      quantidadeVariavel: false,
      estoqueMin: numero(dados, "estoque_min"),
      estoqueMax: numero(dados, "estoque_max"),
      setorEstoque: texto(dados, "setor_estoque"),
      setorVenda1: texto(dados, "setor_venda_1"),
      setorVenda2: texto(dados, "setor_venda_2"),
      localVenda1: texto(dados, "local_venda_1"),
      localVenda2: texto(dados, "local_venda_2"),
      habilitarAjuda: booleano(dados, "habilitar_ajuda") ?? false,
      fotoUrl: fotoDoErp,
      fiscal: {
        ncm: texto(dados, "ncm"),
        cest: texto(dados, "cest"),
        categoriaFiscal: texto(dados, "categoria"),
        cstPisCofins: texto(dados, "cst_pis_cofins"),
        aliquotaCheia: numero(dados, "aliquota_cheia"),
        aliquotaFcp: numero(dados, "aliquota_fcp"),
        aliquotaPis: numero(dados, "aliquota_pis"),
        aliquotaCofins: numero(dados, "aliquota_cofins"),
        reducaoIcms: numero(dados, "reducao_icms"),
        icms: numero(dados, "icms"),
        tributacaoSimples: texto(dados, "tributacao_simples"),
        aliquotaSimples: numero(dados, "aliquota_simples"),
        icmsRe: numero(dados, "icms_re"),
        baseFiscal: texto(dados, "base_fiscal"),
        codigoFiscal: texto(dados, "codigo_fiscal"),
        produtoFiscal: texto(dados, "produto_fiscal"),
        cstReforma: texto(dados, "cst_reforma"),
        cClassTrib: texto(dados, "cclass_trib"),
        aliquotaIbs: numero(dados, "aliquota_ibs"),
        aliquotaCbs: numero(dados, "aliquota_cbs"),
        origemFiscal: texto(dados, "origem_fiscal"),
        aliquotaEcf: texto(dados, "aliquota_ecf"),
        aliquotaEcfId: texto(dados, "aliquota_ecf_id"),
        estado: texto(dados, "estado_fiscal"),
        motivo: texto(dados, "motivo_fiscal"),
        pctNcm: numero(dados, "pct_ncm")
      },
      transformacao,
      promocoes,
      forcar: false
    }
  };
}

export function listarCatalogoBase(input: {
  busca?: string | undefined;
  status?: "ativo" | "inativo" | undefined;
  page: number;
  pageSize: number;
}) {
  return listarCatalogoBaseRepository(input);
}

export async function importarCatalogoBase(cargaId: string) {
  const resultado = await importarCatalogoBaseRepository(cargaId);
  if (resultado.estado === "nao_encontrada")
    throw new ImportacaoCatalogoBaseInvalidaError("Carga da Central não encontrada.");
  if (resultado.estado === "nao_validada") {
    throw new ImportacaoCatalogoBaseInvalidaError("Valide a carga antes de importar o catálogo mestre BASE.");
  }
  if (resultado.estado === "sem_base") {
    throw new ImportacaoCatalogoBaseInvalidaError("A carga validada não contém produtos da loja BASE.");
  }
  if (resultado.estado === "fonte_invalida") {
    throw new ImportacaoCatalogoBaseInvalidaError(
      "A fonte BASE contém identificadores ausentes ou repetidos; nenhuma alteração foi feita."
    );
  }
  return resultado;
}

export async function copiarProdutoBaseParaLoja(input: {
  produtoBaseId: string;
  empresaId: string;
  ator: AtorDaEscrita;
  /** O lote publica o TXT uma vez no fim; a copia avulsa publica na hora. */
  publicarNoDrive?: boolean;
}) {
  const contexto = await carregarProdutoBaseParaLojaRepository(input.produtoBaseId, input.empresaId);
  if (!contexto) return { estado: "nao_encontrado" as const };
  if (contexto.jaImportado) return { estado: "ja_importado" as const };
  if (contexto.codigoOcupadoPor) {
    return {
      estado: "bloqueado" as const,
      motivo: `A loja já tem o código interno ${contexto.produto.codigoInterno} em "${contexto.codigoOcupadoPor}".`
    };
  }
  const convertido = montarPayloadBase(contexto.produto, contexto.unidades, contexto.grupos, input.empresaId);
  if (convertido.erro) return { estado: "bloqueado" as const, motivo: convertido.erro };
  const salvo = await salvarProduto(null, convertido.payload, input.ator, {
    produtoBaseId: input.produtoBaseId,
    preservarPrecoImportado: true,
    // Oficial: a copia da loja herda o MESMO codigo interno da BASE (igual entre lojas).
    codigoInterno: contexto.produto.codigoInterno,
    publicarNoDrive: input.publicarNoDrive ?? true
  });
  return { estado: "importado" as const, produtoId: salvo.id };
}

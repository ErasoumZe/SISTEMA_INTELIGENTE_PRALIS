import type { DadosExternos } from "@padaria/shared/api";
import {
  calcularPrecoVenda,
  calcularPrecoVendaComPromocao,
  produtoPayloadSchema,
  type ExportarProdutoPayload as ExportarPayload,
  type ImportarProdutosPayload as ImportarPayload,
  type PromocaoRegra
} from "@padaria/shared/produtos";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { apenasDigitos, validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { copiarGruposRepository } from "../grupos/grupos.repository.js";
import { copiarUnidadesMedidaRepository } from "../unidades-medida/unidades-medida.repository.js";
import {
  buscarProdutoPorCodigoBarrasRepository,
  buscarProdutoPorDescricaoRepository,
  carregarProdutoParaEscritaRepository,
  referenciasForaDaEmpresaRepository,
  salvarProdutoRepository,
  travarCadastroDeProdutosDaEmpresa,
  type ProdutoParaGravar
} from "./produtos-escrita.repository.js";
import { copiarProdutosRepository } from "./produtos-importacao.repository.js";
import { listarProdutosRepository } from "./produtos.repository.js";

/**
 * Nome/descricao repetidos na mesma loja. Recusa com confirmacao — o "cadastrar mesmo assim"
 * (`forcar`) passa por cima.
 */
export class ProdutoDuplicadoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ProdutoDuplicadoError";
  }
}

/**
 * Codigo de barras repetido na mesma loja. **Bloqueio absoluto**: nao existe "cadastrar mesmo
 * assim" para EAN — dois produtos com o mesmo codigo tornam a leitura no balcao ambigua.
 */
export class CodigoBarrasDuplicadoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CodigoBarrasDuplicadoError";
  }
}

/**
 * Produto inexistente OU fora do escopo autorizado. **De proposito indistinguiveis**: responder
 * "existe, mas nao e seu" deixaria enumerar o cadastro das outras empresas.
 */
export class ProdutoNaoEncontradoError extends Error {
  constructor() {
    super("Produto nao encontrado");
    this.name = "ProdutoNaoEncontradoError";
  }
}

/** Grupo/unidade apontando para o cadastro de outra empresa. */
export class ReferenciaDeOutraEmpresaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ReferenciaDeOutraEmpresaError";
  }
}

export async function listarProdutos(escopoDados: string[]) {
  if (!escopoDados.length) return [];
  const agora = new Date();
  const linhas = await listarProdutosRepository(escopoDados);
  // ADR-002/003: o preco vigente (com promocao ativa por dia/horario) e derivado na
  // LEITURA, pelo servidor — nunca persistido nem calculado pelo cliente.
  return linhas.map((produto) => ({
    ...produto,
    precoVendaAtual:
      produto.precoVenda == null
        ? null
        : calcularPrecoVendaComPromocao({
            precoVenda: Number(produto.precoVenda),
            agora,
            promocoes: produto.promocoes.map(
              (promo): PromocaoRegra => ({
                tipo: promo.tipo === "valor" ? "valor" : "desconto",
                valor: promo.valor == null ? null : Number(promo.valor),
                descontoFracao: promo.descontoFracao == null ? null : Number(promo.descontoFracao),
                horaInicio: promo.horaInicio,
                horaFim: promo.horaFim,
                dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom]
              })
            )
          })
  }));
}

function mensagemDeDuplicado(duplicado: { descricao: string; criadoPorNome: string | null }, motivo: string) {
  const porQuem = duplicado.criadoPorNome ? ` (cadastrado por ${duplicado.criadoPorNome})` : "";
  return `Ja existe o produto "${duplicado.descricao}" nesta loja${porQuem}${motivo}.`;
}

export interface AtorDaEscrita {
  usuarioId: string | null | undefined;
  empresasPermitidas: string[];
}

/**
 * Cria ou edita produto. TUDO acontece numa transacao so, nesta ordem — e a ordem importa:
 *
 * 1. trava o cadastro da empresa (serializa codigo interno e duplicidade);
 * 2. na edicao, CARREGA E TRAVA o produto alvo e confere o escopo — **antes** de qualquer escrita
 *    ou `delete` de satelite;
 * 3. confere que grupo e unidades sao da mesma empresa do produto;
 * 4. aplica as duas regras de duplicidade (EAN absoluto, descricao com confirmacao);
 * 5. grava produto + satelites.
 */
export async function salvarProduto(id: string | null, body: DadosExternos, ator: AtorDaEscrita) {
  const dados = produtoPayloadSchema.parse(body);
  const descricao = dados.descricao.trim();
  const codigoBarras = apenasDigitos(dados.codigoBarras) ?? dados.codigoBarras?.trim() ?? null;

  if (!ator.empresasPermitidas.includes(dados.empresaId)) throw new Error("Empresa nao permitida");

  return executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutosDaEmpresa(tx, dados.empresaId);

    const alvo = id ? await carregarProdutoAlvoValidado(tx, id, dados.empresaId, ator.empresasPermitidas) : null;

    const problemas = await referenciasForaDaEmpresaRepository(tx, dados.empresaId, {
      grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
      unidadeIndividualId: dados.unidadeIndividualId,
      unidadesDasConversoes: dados.conversoes.map((conversao) => conversao.unidadeMedidaId)
    });
    if (problemas.length) throw new ReferenciaDeOutraEmpresaError(problemas.join(" "));

    await recusarDuplicados(tx, {
      empresaId: dados.empresaId,
      descricao,
      codigoBarras,
      ignorarId: alvo?.id,
      forcar: dados.forcar
    });

    const precoVenda = precoDeVendaDoServidor(dados);
    return salvarProdutoRepository(
      tx,
      montarProdutoParaGravar(dados, {
        id: alvo?.id,
        descricao,
        codigoBarras,
        precoVenda,
        criadoPor: ator.usuarioId ?? null
      })
    );
  });
}

async function carregarProdutoAlvoValidado(
  tx: TransacaoBanco,
  id: string,
  empresaIdDoPayload: string,
  permitidas: string[]
) {
  const alvo = await carregarProdutoParaEscritaRepository(tx, id);
  // Inexistente e "de outra empresa" respondem igual: 404 sem detalhe.
  if (!alvo || !permitidas.includes(alvo.empresaId)) throw new ProdutoNaoEncontradoError();
  // O produto NAO muda de empresa. Se o payload aponta outra loja (mesmo uma que o ator acessa),
  // a intencao e ambigua e a gravacao pararia em zero linhas — recusa explicita em vez de 204 falso.
  if (alvo.empresaId !== empresaIdDoPayload) {
    throw new ReferenciaDeOutraEmpresaError("Produto nao pode mudar de empresa");
  }
  return alvo;
}

async function recusarDuplicados(
  tx: TransacaoBanco,
  entrada: {
    empresaId: string;
    descricao: string;
    codigoBarras: string | null;
    ignorarId: string | undefined;
    forcar: boolean;
  }
) {
  // EAN primeiro e SEM bypass: `forcar` nunca vale para codigo de barras.
  if (entrada.codigoBarras) {
    const porBarras = await buscarProdutoPorCodigoBarrasRepository(
      tx,
      entrada.empresaId,
      entrada.codigoBarras,
      entrada.ignorarId
    );
    if (porBarras) {
      throw new CodigoBarrasDuplicadoError(mensagemDeDuplicado(porBarras, " com este codigo de barras"));
    }
  }
  if (entrada.forcar) return;
  const porDescricao = await buscarProdutoPorDescricaoRepository(
    tx,
    entrada.empresaId,
    entrada.descricao,
    entrada.ignorarId
  );
  if (porDescricao) throw new ProdutoDuplicadoError(mensagemDeDuplicado(porDescricao, ""));
}

/**
 * ADR-002: preco de venda e decisao do servidor. Com `auto=true` o valor enviado pelo cliente e
 * IGNORADO e recalculado pela regra oficial do shared; manual (`auto=false`) aceita o digitado.
 * Mesma formula que o front usa no preview.
 */
function precoDeVendaDoServidor(dados: {
  auto: boolean;
  custo?: number | null | undefined;
  quantidadeCaixa?: number | undefined;
  margem?: number | null | undefined;
  precoVenda?: number | null | undefined;
}) {
  if (!dados.auto) return dados.precoVenda ?? null;
  if (dados.custo == null) return null;
  return calcularPrecoVenda({
    auto: true,
    custo: dados.custo,
    quantidadeCaixa: dados.quantidadeCaixa ?? 1,
    margem: dados.margem ?? null,
    // TODO(P-04/ETAPA 4): margem do grupo entra quando `grupos_mercadorias.margem` existir.
    margemGrupo: 0,
    precoManual: 0
  });
}

type DadosDoPayload = ReturnType<typeof produtoPayloadSchema.parse>;

function montarProdutoParaGravar(
  dados: DadosDoPayload,
  extra: {
    id: string | undefined;
    descricao: string;
    codigoBarras: string | null;
    precoVenda: number | null;
    criadoPor: string | null;
  }
): ProdutoParaGravar {
  return {
    ...(extra.id ? { id: extra.id } : {}),
    empresaId: dados.empresaId,
    codigo: dados.codigo?.trim() || null,
    criadoPor: extra.criadoPor,
    codigoBarras: extra.codigoBarras,
    descricao: extra.descricao,
    marca: dados.marca?.trim() || null,
    unidadeIndividualId: dados.unidadeIndividualId,
    quantidadeIndividual: dados.quantidadeIndividual,
    grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
    embalagem: dados.embalagem ?? null,
    cDe: dados.cDe ?? null,
    quantidadeCaixa: dados.quantidadeCaixa,
    medidaCompra: dados.medidaCompra ?? null,
    custo: dados.custo ?? null,
    margem: dados.margem ?? null,
    precoVenda: extra.precoVenda,
    auto: dados.auto,
    status: dados.status,
    tipo: dados.tipo,
    quantidadeEstoque: dados.quantidadeEstoque ?? null,
    estoqueMin: dados.estoqueMin ?? null,
    estoqueMax: dados.estoqueMax ?? null,
    setorEstoque: dados.setorEstoque?.trim() || null,
    localVenda1: dados.localVenda1?.trim() || null,
    localVenda2: dados.localVenda2?.trim() || null,
    fotoUrl: dados.fotoUrl?.trim() || null,
    conversoes: dados.conversoes,
    fiscal: dados.fiscal
      ? {
          ncm: dados.fiscal.ncm?.trim() || null,
          cest: dados.fiscal.cest?.trim() || null,
          categoriaFiscal: dados.fiscal.categoriaFiscal?.trim() || null,
          cstPisCofins: dados.fiscal.cstPisCofins?.trim() || null,
          aliquotaCheia: dados.fiscal.aliquotaCheia ?? null,
          aliquotaFcp: dados.fiscal.aliquotaFcp ?? null,
          aliquotaPis: dados.fiscal.aliquotaPis ?? null,
          aliquotaCofins: dados.fiscal.aliquotaCofins ?? null,
          reducaoIcms: dados.fiscal.reducaoIcms ?? null,
          icms: dados.fiscal.icms ?? null
        }
      : null,
    transformacao: dados.transformacao
      ? {
          precisao: dados.transformacao.precisao ?? null,
          quantidade: dados.transformacao.quantidade ?? null,
          unidade: dados.transformacao.unidade ?? null,
          produtoReceituario: dados.transformacao.produtoReceituario?.trim() || null
        }
      : null,
    promocoes: dados.promocoes.map((promo) => ({
      tipo: promo.tipo,
      valor: promo.valor ?? null,
      descontoFracao: promo.descontoFracao ?? null,
      horaInicio: promo.horaInicio?.trim() || null,
      horaFim: promo.horaFim?.trim() || null,
      seg: promo.seg,
      ter: promo.ter,
      qua: promo.qua,
      qui: promo.qui,
      sex: promo.sex,
      sab: promo.sab,
      dom: promo.dom,
      validaAte: promo.validaAte?.trim() || null
    }))
  };
}

export async function importarProdutos(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  const permitidas = perfil ? empresasPermitidas(perfil) : [];
  return executarEmTransacao(async (tx) => {
    let inseridos = 0;
    if (body.modo === "completo") {
      inseridos += (
        await copiarGruposRepository(
          { empresaOrigemId: body.empresaOrigemId },
          body.empresaDestinoId,
          permitidas,
          body.modo,
          tx
        )
      ).inseridos;
      inseridos += (
        await copiarUnidadesMedidaRepository(
          { empresaOrigemId: body.empresaOrigemId },
          body.empresaDestinoId,
          permitidas,
          body.modo,
          tx
        )
      ).inseridos;
    }
    inseridos += (
      await copiarProdutosRepository(
        { empresaOrigemId: body.empresaOrigemId },
        body.empresaDestinoId,
        permitidas,
        body.modo,
        tx
      )
    ).inseridos;
    return { tipo: "produtos", modo: body.modo, inseridos };
  });
}

export async function exportarProduto(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  const resultado = await copiarProdutosRepository(
    { id },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
  // Produto inexistente ou de empresa alheia nunca vira "ok, 0 inseridos": isso e sucesso falso, e
  // a diferenca entre os dois casos permitiria enumerar o cadastro de outra loja.
  if (!resultado.encontradosNaOrigem) throw new ProdutoNaoEncontradoError();
  return { tipo: resultado.tipo, inseridos: resultado.inseridos };
}

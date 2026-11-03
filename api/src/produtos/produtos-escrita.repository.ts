import { and, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { sqlConsultaMaiorCodigoInterno, sqlTravarCadastroDeProdutos } from "@padaria/db/sessao";
import { codigoBarrasNaCriacao } from "@padaria/shared/produtos";
import {
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  produtosConversoes,
  produtosFiscal,
  produtosHistoricoNomes,
  produtosPromocoes,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";
import type { ExecutorBanco, TransacaoBanco } from "../banco/conexao.js";
import { calcularProximoCodigoInterno, ULTIMO_CODIGO_DE_PRODUTO } from "./codigo-interno.js";

// Codigo externo: PR-XXXX-XXXX (alfabeto sem caracteres ambiguos I/O/0/1). Unico global — tenta ate achar livre.
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function blocoCodigo(tamanho: number): string {
  let saida = "";
  for (let i = 0; i < tamanho; i += 1) saida += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)];
  return saida;
}

export async function gerarCodigoExternoUnico(tx: ExecutorBanco): Promise<string> {
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const candidato = `PR-${blocoCodigo(4)}-${blocoCodigo(4)}`;
    const existente = await tx
      .select({ id: produtos.id })
      .from(produtos)
      .where(eq(produtos.codigo, candidato))
      .limit(1);
    if (!existente.length) return candidato;
  }
  return `PR-${blocoCodigo(4)}-${blocoCodigo(4)}`;
}

// Regra R-222: sequência global do app oficial; a consulta ignora a faixa >=700000.
export async function proximoCodigoInterno(tx: ExecutorBanco): Promise<string> {
  const resultado = await tx.execute<{ maximo: string | number | null }>(sqlConsultaMaiorCodigoInterno());
  const maximo = resultado.rows[0]?.maximo;
  return calcularProximoCodigoInterno(Number(maximo ?? ULTIMO_CODIGO_DE_PRODUTO));
}

/**
 * Serializa o cadastro de produtos globalmente pelo resto da transacao. Precisa vir ANTES de
 * `proximoCodigoInterno` e das buscas de duplicidade — e o que impede que duas requisicoes
 * simultaneas escolham o mesmo codigo interno ou passem as duas pela checagem de duplicado.
 */
export async function travarCadastroDeProdutos(tx: ExecutorBanco): Promise<void> {
  await tx.execute(sqlTravarCadastroDeProdutos());
}

/**
 * Carrega o produto ALVO da edicao e trava a linha (`FOR UPDATE`) antes de qualquer escrita —
 * inclusive antes de apagar satelite. Devolve `null` quando o produto nao existe; quem chama
 * decide o que fazer, mas nunca deve diferenciar "nao existe" de "e de outra empresa" na resposta.
 */
export async function carregarProdutoParaEscritaRepository(
  tx: TransacaoBanco,
  id: string
): Promise<{
  id: string;
  empresaId: string;
  produtoBaseId: string | null;
  criadoPor: string | null;
  descricao: string;
  nomeCatalogo: string | null;
  pesavel: boolean | null;
  teclaBalanca: number | null;
  validadeBalanca: number | null;
  grupoIdExterno: string | null;
  areaVenda: string | null;
  grupoMercadoriaId: string | null;
  liberadoCompra: boolean;
} | null> {
  const [linha] = await tx
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      produtoBaseId: produtos.produtoBaseId,
      criadoPor: produtos.criadoPor,
      descricao: produtos.descricao,
      nomeCatalogo: produtos.nomeCatalogo,
      pesavel: produtos.pesavel,
      teclaBalanca: produtos.teclaBalanca,
      validadeBalanca: produtos.validadeBalanca,
      grupoIdExterno: produtos.grupoIdExterno,
      areaVenda: produtos.areaVenda,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      liberadoCompra: produtos.liberadoCompra
    })
    .from(produtos)
    .where(eq(produtos.id, id))
    .for("update");
  return linha ?? null;
}

export async function registrarHistoricoNomeProdutoRepository(
  tx: TransacaoBanco,
  input: {
    empresaId: string;
    produtoId: string;
    nomeAnterior: string;
    nomeNovo: string;
    alteradoPor: string | null;
    alteradoPorNome: string | null;
  }
): Promise<void> {
  await tx.insert(produtosHistoricoNomes).values(input);
}

export async function listarHistoricoNomesProdutoRepository(empresaId: string, produtoId: string) {
  const [produto] = await banco
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)))
    .limit(1);
  if (!produto) return null;
  return banco
    .select({
      id: produtosHistoricoNomes.id,
      nomeAnterior: produtosHistoricoNomes.nomeAnterior,
      nomeNovo: produtosHistoricoNomes.nomeNovo,
      alteradoPor: produtosHistoricoNomes.alteradoPorNome,
      alteradoEm: produtosHistoricoNomes.alteradoEm
    })
    .from(produtosHistoricoNomes)
    .where(and(eq(produtosHistoricoNomes.empresaId, empresaId), eq(produtosHistoricoNomes.produtoId, produtoId)))
    .orderBy(desc(produtosHistoricoNomes.alteradoEm), desc(produtosHistoricoNomes.id))
    .limit(200);
}

export interface ReferenciasDoProduto {
  grupoMercadoriaId: string | null;
  unidadeIndividualId: string;
  unidadesDasConversoes: string[];
}

/**
 * Grupo, unidade individual e as unidades das conversoes precisam ser DA MESMA EMPRESA do produto.
 * Sem isto, o payload pode apontar para o cadastro de outra loja: o banco aceita (a FK e para a
 * tabela, nao para a empresa) e o produto passa a exibir o grupo/unidade de quem nao deveria.
 * Devolve a lista de problemas; vazia = tudo pertence a empresa.
 */
export async function referenciasForaDaEmpresaRepository(
  tx: ExecutorBanco,
  empresaId: string,
  referencias: ReferenciasDoProduto
): Promise<string[]> {
  const problemas: string[] = [];

  if (referencias.grupoMercadoriaId) {
    const [grupo] = await tx
      .select({ id: gruposMercadorias.id })
      .from(gruposMercadorias)
      .where(and(eq(gruposMercadorias.id, referencias.grupoMercadoriaId), eq(gruposMercadorias.empresaId, empresaId)))
      .limit(1);
    if (!grupo) problemas.push("Grupo de mercadoria nao pertence a esta empresa");
  }

  const unidades = Array.from(new Set([referencias.unidadeIndividualId, ...referencias.unidadesDasConversoes]));
  if (unidades.length) {
    const encontradas = await tx
      .select({ id: unidadesMedida.id })
      .from(unidadesMedida)
      .where(and(inArray(unidadesMedida.id, unidades), eq(unidadesMedida.empresaId, empresaId)));
    if (encontradas.length !== unidades.length) problemas.push("Unidade de medida nao pertence a esta empresa");
  }

  return problemas;
}

/** Codigo de barras repetido na MESMA empresa. Pede confirmacao ("cadastrar mesmo assim"), como no app oficial. */
export async function buscarProdutoPorCodigoBarrasRepository(
  tx: ExecutorBanco,
  empresaId: string,
  codigoBarras: string,
  ignorarId?: string
): Promise<{ descricao: string; criadoPorNome: string | null } | null> {
  const [linha] = await tx
    .select({ descricao: produtos.descricao, criadoPorNome: perfisUsuarios.nome })
    .from(produtos)
    .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
    .where(
      and(
        eq(produtos.empresaId, empresaId),
        eq(produtos.codigoBarras, codigoBarras),
        ignorarId ? ne(produtos.id, ignorarId) : undefined
      )
    )
    .limit(1);
  return linha ?? null;
}

/**
 * Nome repetido na MESMA empresa. Gera confirmacao ("cadastrar mesmo assim"), nao bloqueio.
 * Compara pelo nome do CATALOGO, como o `nome` do paralelo; produto legado sem nome de catalogo
 * continua comparado pela descricao.
 */
export async function buscarProdutoPorDescricaoRepository(
  tx: ExecutorBanco,
  empresaId: string,
  nome: string,
  ignorarId?: string
): Promise<{ descricao: string; criadoPorNome: string | null } | null> {
  const [linha] = await tx
    .select({ descricao: produtos.descricao, criadoPorNome: perfisUsuarios.nome })
    .from(produtos)
    .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
    .where(
      and(
        eq(produtos.empresaId, empresaId),
        or(ilike(produtos.nomeCatalogo, nome), and(isNull(produtos.nomeCatalogo), ilike(produtos.descricao, nome))),
        ignorarId ? ne(produtos.id, ignorarId) : undefined
      )
    )
    .limit(1);
  return linha ?? null;
}

export interface ProdutoParaGravar {
  id?: string;
  produtoBaseId?: string | null;
  empresaId: string;
  codigo: string | null;
  codigoInterno?: string | null;
  criadoPor?: string | null;
  codigoBarras: string | null;
  descricao: string;
  nomeCatalogo: string | null;
  pesavel: boolean | null;
  teclaBalanca: number | null;
  validadeBalanca: number | null;
  grupoIdExterno: string | null;
  areaVenda: string | null;
  marca: string | null;
  compraAproximada: boolean;
  habilitarAjuda: boolean;
  liberadoCompra: boolean;
  unidadeIndividualId: string;
  quantidadeIndividual: number;
  grupoMercadoriaId: string | null;
  embalagem: string | null;
  cDe: string | null;
  quantidadeCaixa: number;
  medidaCompra: string | null;
  custo: number | null;
  margem: number | null;
  precoVenda: number | null;
  auto: boolean;
  status: "ativo" | "inativo";
  tipo: "revenda" | "transformacao";
  estoqueMin: number | null;
  estoqueMax: number | null;
  areaEstoque: string | null;
  setorEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
  quantidadeVariavel: boolean;
  toleranciaQuantidadePercentual: number | null;
  localVenda1: string | null;
  localVenda2: string | null;
  setorVenda1: string | null;
  setorVenda2: string | null;
  fotoUrl: string | null;
  conversoes: Array<{ unidadeMedidaId: string; quantidade: number; unidadesIndividuais: number }>;
  fiscal: {
    ncm: string | null;
    cest: string | null;
    categoriaFiscal: string | null;
    cstPisCofins: string | null;
    aliquotaCheia: number | null;
    aliquotaFcp: number | null;
    aliquotaPis: number | null;
    aliquotaCofins: number | null;
    reducaoIcms: number | null;
    icms: number | null;
    tributacaoSimples: string | null;
    aliquotaSimples: number | null;
    icmsRe: number | null;
    baseFiscal: string | null;
    codigoFiscal: string | null;
    produtoFiscal: string | null;
    cstReforma: string | null;
    cClassTrib: string | null;
    aliquotaIbs: number | null;
    aliquotaCbs: number | null;
    origemFiscal: string | null;
    aliquotaEcf: string | null;
    aliquotaEcfId: string | null;
    estado: string | null;
    motivo: string | null;
    conferidoEm: string | null;
    pctNcm: number | null;
  } | null;
  transformacao: {
    precisao: string | null;
    quantidade: number | null;
    unidade: string | null;
    produtoReceituario: string | null;
    refReceituario: string | null;
  } | null;
  promocoes: Array<{
    tipo: "valor" | "desconto";
    valor: number | null;
    descontoFracao: number | null;
    horaInicio: string | null;
    horaFim: string | null;
    seg: boolean;
    ter: boolean;
    qua: boolean;
    qui: boolean;
    sex: boolean;
    sab: boolean;
    dom: boolean;
    validaAte: string | null;
  }>;
}

/**
 * Grava produto e satelites. **Sempre dentro da transacao de quem chama** — o produto e as quatro
 * satelites (conversoes, fiscal, transformacao, promocoes) nunca podem ficar meio gravados.
 *
 * Na edicao, quem chama JA validou o alvo com `carregarProdutoParaEscritaRepository`: aqui o
 * `UPDATE` ainda casa por (id, empresa) como cinto de seguranca e devolve as linhas afetadas, para
 * que zero linha vire erro em vez de 204 mentiroso.
 */
export async function salvarProdutoRepository(
  tx: TransacaoBanco,
  input: ProdutoParaGravar
): Promise<{ id: string; empresaId: string }> {
  const valores = {
    empresaId: input.empresaId,
    produtoBaseId: input.produtoBaseId,
    codigo: input.codigo,
    codigoBarras: input.codigoBarras,
    descricao: input.descricao,
    nomeCatalogo: input.nomeCatalogo,
    pesavel: input.pesavel,
    teclaBalanca: input.teclaBalanca,
    validadeBalanca: input.validadeBalanca,
    grupoIdExterno: input.grupoIdExterno,
    areaVenda: input.areaVenda,
    marca: input.marca,
    compraAproximada: input.compraAproximada,
    habilitarAjuda: input.habilitarAjuda,
    liberadoCompra: input.liberadoCompra,
    unidadeMedidaId: input.unidadeIndividualId,
    unidadeIndividualId: input.unidadeIndividualId,
    quantidadeIndividual: String(input.quantidadeIndividual),
    grupoMercadoriaId: input.grupoMercadoriaId,
    embalagem: input.embalagem,
    cDe: input.cDe,
    quantidadeCaixa: input.quantidadeCaixa,
    medidaCompra: input.medidaCompra,
    custo: input.custo != null ? String(input.custo) : null,
    margem: input.margem != null ? String(input.margem) : null,
    precoVenda: input.precoVenda != null ? String(input.precoVenda) : null,
    auto: input.auto,
    status: input.status,
    tipo: input.tipo,
    estoqueMin: input.estoqueMin != null ? String(input.estoqueMin) : null,
    estoqueMax: input.estoqueMax != null ? String(input.estoqueMax) : null,
    areaEstoque: input.areaEstoque,
    setorEstoque: input.setorEstoque,
    curvaAbc: input.curvaAbc,
    quantidadeVariavel: input.quantidadeVariavel,
    toleranciaQuantidadePercentual:
      input.toleranciaQuantidadePercentual != null ? String(input.toleranciaQuantidadePercentual) : null,
    localVenda1: input.localVenda1,
    localVenda2: input.localVenda2,
    setorVenda1: input.setorVenda1,
    setorVenda2: input.setorVenda2,
    fotoUrl: input.fotoUrl
  };

  let produtoId: string;
  if (input.id) {
    // Edicao: nao regera codigo interno (atribuido uma vez) nem mexe em `criadoPor` — o autor
    // original e imutavel. Codigo externo vem do form (preservado).
    const atualizados = await tx
      .update(produtos)
      .set(valores)
      .where(and(eq(produtos.id, input.id), eq(produtos.empresaId, input.empresaId)))
      .returning({ id: produtos.id });
    if (!atualizados.length) throw new Error("Registro nao encontrado");
    produtoId = input.id;
  } else {
    // Criacao: codigo externo (PR-XXXX-XXXX) se nao veio manual; codigo interno sequencial
    // (ou herdado na importacao), escolhido sob a trava da empresa.
    const codigo = valores.codigo || (await gerarCodigoExternoUnico(tx));
    const codigoInterno = input.codigoInterno ?? (await proximoCodigoInterno(tx));
    const inserido = await tx
      .insert(produtos)
      .values({
        ...valores,
        codigo,
        codigoInterno,
        // Oficial: EAN vazio na criacao recebe o proprio codigo interno.
        codigoBarras: codigoBarrasNaCriacao(valores.codigoBarras, codigoInterno),
        criadoPor: input.criadoPor ?? null,
        quantidadeEstoque: "0"
      })
      .returning({ id: produtos.id });
    produtoId = inserido[0]?.id ?? "";
    if (!produtoId) throw new Error("Produto nao criado");
  }

  await gravarSatelites(tx, produtoId, input);
  return { id: produtoId, empresaId: input.empresaId };
}

/**
 * Regrava a linha fiscal do produto (apaga e reinsere). Um caminho so: o cadastro e o backfill fiscal
 * gravam o fiscal exatamente do mesmo jeito.
 */
export async function regravarFiscalDoProdutoRepository(
  tx: TransacaoBanco,
  produtoId: string,
  fiscal: ProdutoParaGravar["fiscal"]
): Promise<void> {
  await tx.delete(produtosFiscal).where(eq(produtosFiscal.produtoId, produtoId));
  if (fiscal) {
    await tx.insert(produtosFiscal).values({
      produtoId,
      ncm: fiscal.ncm,
      cest: fiscal.cest,
      categoriaFiscal: fiscal.categoriaFiscal,
      cstPisCofins: fiscal.cstPisCofins,
      aliquotaCheia: fiscal.aliquotaCheia != null ? String(fiscal.aliquotaCheia) : null,
      aliquotaFcp: fiscal.aliquotaFcp != null ? String(fiscal.aliquotaFcp) : null,
      aliquotaPis: fiscal.aliquotaPis != null ? String(fiscal.aliquotaPis) : null,
      aliquotaCofins: fiscal.aliquotaCofins != null ? String(fiscal.aliquotaCofins) : null,
      reducaoIcms: fiscal.reducaoIcms != null ? String(fiscal.reducaoIcms) : null,
      icms: fiscal.icms != null ? String(fiscal.icms) : null,
      tributacaoSimples: fiscal.tributacaoSimples,
      aliquotaSimples: fiscal.aliquotaSimples != null ? String(fiscal.aliquotaSimples) : null,
      icmsRe: fiscal.icmsRe != null ? String(fiscal.icmsRe) : null,
      baseFiscal: fiscal.baseFiscal,
      codigoFiscal: fiscal.codigoFiscal,
      produtoFiscal: fiscal.produtoFiscal,
      cstReforma: fiscal.cstReforma,
      cClassTrib: fiscal.cClassTrib,
      aliquotaIbs: fiscal.aliquotaIbs != null ? String(fiscal.aliquotaIbs) : null,
      aliquotaCbs: fiscal.aliquotaCbs != null ? String(fiscal.aliquotaCbs) : null,
      origemFiscal: fiscal.origemFiscal,
      aliquotaEcf: fiscal.aliquotaEcf,
      aliquotaEcfId: fiscal.aliquotaEcfId,
      estado: fiscal.estado,
      motivo: fiscal.motivo,
      conferidoEm: fiscal.conferidoEm ? new Date(fiscal.conferidoEm) : null,
      pctNcm: fiscal.pctNcm != null ? String(fiscal.pctNcm) : null
    });
  }
}

/** As quatro satelites sao regravadas por completo (apaga e reinsere) — sempre na mesma transacao. */
async function gravarSatelites(tx: TransacaoBanco, produtoId: string, input: ProdutoParaGravar): Promise<void> {
  await tx.delete(produtosConversoes).where(eq(produtosConversoes.produtoId, produtoId));
  if (input.conversoes.length) {
    await tx.insert(produtosConversoes).values(
      input.conversoes.map((conversao) => ({
        produtoId,
        unidadeMedidaId: conversao.unidadeMedidaId,
        quantidade: String(conversao.quantidade),
        unidadesIndividuais: String(conversao.unidadesIndividuais)
      }))
    );
  }

  await regravarFiscalDoProdutoRepository(tx, produtoId, input.fiscal);

  await tx.delete(produtosTransformacao).where(eq(produtosTransformacao.produtoId, produtoId));
  if (input.transformacao) {
    await tx.insert(produtosTransformacao).values({
      produtoId,
      precisao: input.transformacao.precisao,
      quantidade: input.transformacao.quantidade != null ? String(input.transformacao.quantidade) : null,
      unidade: input.transformacao.unidade,
      produtoReceituario: input.transformacao.produtoReceituario,
      refReceituario: input.transformacao.refReceituario
    });
  }

  await tx.delete(produtosPromocoes).where(eq(produtosPromocoes.produtoId, produtoId));
  if (input.promocoes.length) {
    await tx.insert(produtosPromocoes).values(
      input.promocoes.map((promo) => ({
        produtoId,
        tipo: promo.tipo,
        valor: promo.valor != null ? String(promo.valor) : null,
        descontoFracao: promo.descontoFracao != null ? String(promo.descontoFracao) : null,
        horaInicio: promo.horaInicio,
        horaFim: promo.horaFim,
        seg: promo.seg,
        ter: promo.ter,
        qua: promo.qua,
        qui: promo.qui,
        sex: promo.sex,
        sab: promo.sab,
        dom: promo.dom,
        validaAte: promo.validaAte
      }))
    );
  }
}

/**
 * Grava SO a `foto_url`, dentro do escopo da empresa. Separado de `salvarProdutoRepository` porque
 * o upload e um ato proprio: falhar a foto nao pode desfazer o produto que ja foi salvo.
 */
export async function atualizarFotoDoProdutoRepository(
  id: string,
  empresaId: string,
  fotoUrl: string | null
): Promise<boolean> {
  const atualizados = await banco
    .update(produtos)
    .set({ fotoUrl })
    .where(and(eq(produtos.id, id), eq(produtos.empresaId, empresaId)))
    .returning({ id: produtos.id });
  return atualizados.length > 0;
}

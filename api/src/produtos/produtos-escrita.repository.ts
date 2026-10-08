import { and, eq, ilike, inArray, max, ne } from "drizzle-orm";
import { sqlTravarCadastroDeProdutosDaEmpresa } from "@padaria/db/sessao";
import {
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  produtosConversoes,
  produtosFiscal,
  produtosPromocoes,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";
import type { ExecutorBanco, TransacaoBanco } from "../banco/conexao.js";

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

// Codigo interno: sequencial de 5 digitos por empresa (00001, 00002, ...). Zero-padded => max lexicografico = numerico.
// SO e seguro sob `travarCadastroDeProdutosDaEmpresa`: `max()` nao trava linha nenhuma, entao dois
// cadastros simultaneos leriam o mesmo maximo.
export async function proximoCodigoInterno(tx: ExecutorBanco, empresaIdAlvo: string): Promise<string> {
  const [linha] = await tx
    .select({ maximo: max(produtos.codigoInterno) })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaIdAlvo));
  const atual = Number(linha?.maximo ?? 0) || 0;
  return String(atual + 1).padStart(5, "0");
}

/**
 * Serializa o cadastro de produtos DA EMPRESA pelo resto da transacao. Precisa vir ANTES de
 * `proximoCodigoInterno` e das buscas de duplicidade — e o que impede que duas requisicoes
 * simultaneas escolham o mesmo codigo interno ou passem as duas pela checagem de duplicado.
 */
export async function travarCadastroDeProdutosDaEmpresa(tx: TransacaoBanco, empresaId: string): Promise<void> {
  await tx.execute(sqlTravarCadastroDeProdutosDaEmpresa(empresaId));
}

/**
 * Carrega o produto ALVO da edicao e trava a linha (`FOR UPDATE`) antes de qualquer escrita —
 * inclusive antes de apagar satelite. Devolve `null` quando o produto nao existe; quem chama
 * decide o que fazer, mas nunca deve diferenciar "nao existe" de "e de outra empresa" na resposta.
 */
export async function carregarProdutoParaEscritaRepository(
  tx: TransacaoBanco,
  id: string
): Promise<{ id: string; empresaId: string; criadoPor: string | null } | null> {
  const [linha] = await tx
    .select({ id: produtos.id, empresaId: produtos.empresaId, criadoPor: produtos.criadoPor })
    .from(produtos)
    .where(eq(produtos.id, id))
    .for("update");
  return linha ?? null;
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

/** Codigo de barras repetido na MESMA empresa. Bloqueio absoluto — nao existe "cadastrar mesmo assim". */
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

/** Nome/descricao repetidos na MESMA empresa. Gera confirmacao ("cadastrar mesmo assim"), nao bloqueio. */
export async function buscarProdutoPorDescricaoRepository(
  tx: ExecutorBanco,
  empresaId: string,
  descricao: string,
  ignorarId?: string
): Promise<{ descricao: string; criadoPorNome: string | null } | null> {
  const [linha] = await tx
    .select({ descricao: produtos.descricao, criadoPorNome: perfisUsuarios.nome })
    .from(produtos)
    .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
    .where(
      and(
        eq(produtos.empresaId, empresaId),
        ilike(produtos.descricao, descricao),
        ignorarId ? ne(produtos.id, ignorarId) : undefined
      )
    )
    .limit(1);
  return linha ?? null;
}

export interface ProdutoParaGravar {
  id?: string;
  empresaId: string;
  codigo: string | null;
  codigoInterno?: string | null;
  criadoPor?: string | null;
  codigoBarras: string | null;
  descricao: string;
  marca: string | null;
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
  quantidadeEstoque: number | null;
  estoqueMin: number | null;
  estoqueMax: number | null;
  areaEstoque: string | null;
  setorEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
  localVenda1: string | null;
  localVenda2: string | null;
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
  } | null;
  transformacao: {
    precisao: string | null;
    quantidade: number | null;
    unidade: string | null;
    produtoReceituario: string | null;
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
    codigo: input.codigo,
    codigoBarras: input.codigoBarras,
    descricao: input.descricao,
    marca: input.marca,
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
    quantidadeEstoque: String(input.quantidadeEstoque ?? 0),
    estoqueMin: input.estoqueMin != null ? String(input.estoqueMin) : null,
    estoqueMax: input.estoqueMax != null ? String(input.estoqueMax) : null,
    areaEstoque: input.areaEstoque,
    setorEstoque: input.setorEstoque,
    curvaAbc: input.curvaAbc,
    localVenda1: input.localVenda1,
    localVenda2: input.localVenda2,
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
    const codigoInterno = input.codigoInterno ?? (await proximoCodigoInterno(tx, input.empresaId));
    const inserido = await tx
      .insert(produtos)
      .values({ ...valores, codigo, codigoInterno, criadoPor: input.criadoPor ?? null })
      .returning({ id: produtos.id });
    produtoId = inserido[0]?.id ?? "";
    if (!produtoId) throw new Error("Produto nao criado");
  }

  await gravarSatelites(tx, produtoId, input);
  return { id: produtoId, empresaId: input.empresaId };
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

  await tx.delete(produtosFiscal).where(eq(produtosFiscal.produtoId, produtoId));
  if (input.fiscal) {
    await tx.insert(produtosFiscal).values({
      produtoId,
      ncm: input.fiscal.ncm,
      cest: input.fiscal.cest,
      categoriaFiscal: input.fiscal.categoriaFiscal,
      cstPisCofins: input.fiscal.cstPisCofins,
      aliquotaCheia: input.fiscal.aliquotaCheia != null ? String(input.fiscal.aliquotaCheia) : null,
      aliquotaFcp: input.fiscal.aliquotaFcp != null ? String(input.fiscal.aliquotaFcp) : null,
      aliquotaPis: input.fiscal.aliquotaPis != null ? String(input.fiscal.aliquotaPis) : null,
      aliquotaCofins: input.fiscal.aliquotaCofins != null ? String(input.fiscal.aliquotaCofins) : null,
      reducaoIcms: input.fiscal.reducaoIcms != null ? String(input.fiscal.reducaoIcms) : null,
      icms: input.fiscal.icms != null ? String(input.fiscal.icms) : null
    });
  }

  await tx.delete(produtosTransformacao).where(eq(produtosTransformacao.produtoId, produtoId));
  if (input.transformacao) {
    await tx.insert(produtosTransformacao).values({
      produtoId,
      precisao: input.transformacao.precisao,
      quantidade: input.transformacao.quantidade != null ? String(input.transformacao.quantidade) : null,
      unidade: input.transformacao.unidade,
      produtoReceituario: input.transformacao.produtoReceituario
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

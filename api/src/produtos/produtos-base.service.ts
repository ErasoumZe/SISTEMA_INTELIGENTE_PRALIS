import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";
import type { DadosExternos } from "@padaria/shared/api";
import {
  camposQueNaoSeguemABase,
  codigoBarrasNaCriacao,
  normalizarGrupoFiscal,
  normalizarTextosProduto,
  patchDeHeranca,
  produtoPayloadSchema,
  type ProdutoDetalhe,
  type ProdutoPayload
} from "@padaria/shared/produtos";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { publicarCreareAposSalvar } from "./produtos-creare-drive.js";
import { apenasDigitos } from "../utils.js";
import { dadosOficiaisDaBase, valoresHerdadosDaCopia, valoresHerdadosDoPayload } from "./produtos-base.dados.js";
import {
  aplicarHerancaNaCopiaRepository,
  atualizarProdutoBaseRepository,
  buscarProdutoBaseRepository,
  carregarProdutoBaseRepository,
  copiasDaBaseRepository,
  duplicadoNaBaseRepository,
  inserirProdutoBaseRepository,
  nomesDaReferenciaRepository,
  unidadesEGruposDaEmpresaRepository
} from "./produtos-base.repository.js";
import { montarPayloadBase } from "./produtos-catalogo-base.service.js";
import {
  proximoCodigoInterno,
  referenciasForaDaEmpresaRepository,
  registrarHistoricoNomeProdutoRepository,
  travarCadastroDeProdutos
} from "./produtos-escrita.repository.js";
import { resolverFiscalDaGravacao } from "./produtos-fiscal-gravacao.js";
import { registrarNaFilaDaPlanilha } from "./produtos-planilha.service.js";
import {
  caminhoAbsolutoDaFoto,
  ehFotoDaBaseNoErp,
  FotoInvalidaError,
  mimeDaFoto,
  salvarFotoDeProduto
} from "./produtos-foto.js";
import { margemPadraoDoGrupo, tabelasFiscais } from "./produtos-fiscal.service.js";
import {
  AreaDeVendaForaDaTnpError,
  balancaDaEntrada,
  precoDeVendaDoServidor,
  ProdutoDuplicadoError,
  ProdutoNaoEncontradoError,
  ReferenciaDeOutraEmpresaError,
  validarCoerenciaDoProduto,
  validarEstoqueDaEntrada,
  type AtorDaEscrita
} from "./produtos.service.js";

/**
 * Modelo BASE, igual ao app oficial: produto NOVO so o administrador cria, e sempre na base geral.
 * As lojas recebem por importacao (copia), nunca por cadastro direto. Editar a BASE tambem e so do
 * administrador — e a edicao desce para as lojas que ainda seguem cada campo.
 */
export class SoAdministradorNaBaseError extends Error {
  constructor(
    mensagem: string,
    readonly code: "ONLY_ADMIN_CREATE" | "FORBIDDEN"
  ) {
    super(mensagem);
    this.name = "SoAdministradorNaBaseError";
  }
}

/** O produto da BASE nao se traduz para a loja de referencia (unidade ou grupo sem par unico). */
export class BaseSemCorrespondenciaError extends Error {
  readonly code = "BASE_PRODUCT_MAPPING_REQUIRED";
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "BaseSemCorrespondenciaError";
  }
}

type Dados = ReturnType<typeof produtoPayloadSchema.parse>;

/** Regras de ENTRADA do oficial, as mesmas do cadastro da loja. */
function lerEntrada(body: DadosExternos, ator: AtorDaEscrita): Dados {
  const dados = normalizarTextosProduto(produtoPayloadSchema.parse(body));
  if (!ator.empresasPermitidas.includes(dados.empresaId))
    throw new ReferenciaDeOutraEmpresaError("Empresa nao permitida");
  if (dados.areaVenda != null) {
    throw new AreaDeVendaForaDaTnpError("Área de venda só pode ser definida no cadastro da TNP.");
  }
  validarCoerenciaDoProduto(dados);
  validarEstoqueDaEntrada(dados);
  return dados;
}

/** Unidade e grupo vem do cadastro da empresa de referencia; a BASE guarda sigla e nome. */
async function nomesDaEntrada(tx: TransacaoBanco, dados: Dados) {
  const problemas = await referenciasForaDaEmpresaRepository(tx, dados.empresaId, {
    grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
    unidadeIndividualId: dados.unidadeIndividualId,
    unidadesDasConversoes: []
  });
  if (problemas.length) throw new ReferenciaDeOutraEmpresaError(problemas.join(" "));
  const nomes = await nomesDaReferenciaRepository(tx, {
    empresaId: dados.empresaId,
    unidadeId: dados.unidadeIndividualId,
    grupoId: dados.grupoMercadoriaId ?? null
  });
  if (!nomes.sigla) throw new ReferenciaDeOutraEmpresaError("Unidade individual nao encontrada.");
  return { sigla: nomes.sigla, grupoNome: nomes.grupoNome };
}

const codigoDeBarras = (dados: Dados) => apenasDigitos(dados.codigoBarras) ?? dados.codigoBarras?.trim() ?? null;
const nomeDoCatalogo = (dados: Dados) => dados.nomeCatalogo?.trim() || dados.descricao.trim();

export async function criarProdutoBase(body: DadosExternos, ator: AtorDaEscrita): Promise<{ id: string }> {
  if (!ator.administrador) {
    throw new SoAdministradorNaBaseError(
      "Apenas o administrador cadastra produtos novos (na base geral).",
      "ONLY_ADMIN_CREATE"
    );
  }
  const dados = lerEntrada(body, ator);
  // Regras fiscais lidas ANTES da trava: dentro da transacao a classificacao usa o cache.
  await tabelasFiscais().catch(() => null);

  const criado = await executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutos(tx);
    if (!dados.grupoMercadoriaId) throw new Error("Selecione o grupo de mercadorias para aplicar a regra fiscal.");
    const { sigla, grupoNome } = await nomesDaEntrada(tx, dados);
    const codigoBarras = codigoDeBarras(dados);
    const nome = nomeDoCatalogo(dados);

    if (!dados.forcar) {
      const duplicado = await duplicadoNaBaseRepository(tx, { nome, codigoBarras });
      if (duplicado) throw new ProdutoDuplicadoError(`Ja existe o produto "${duplicado.nome}" na base.`);
    }

    const { fiscal } = await resolverFiscalDaGravacao({
      criacao: true,
      administrador: true,
      fiscalDoPayload: dados.fiscal,
      grupoNome,
      grupoMudou: false,
      codigoBarras,
      codigoBarrasMudou: false,
      nome,
      loja: "BASE",
      fiscalAtual: null
    });
    // Codigo interno da sequencia global, sob a trava; EAN vazio recebe o proprio codigo (oficial).
    const codigoInterno = await proximoCodigoInterno(tx);
    const codigoBarrasFinal = codigoBarrasNaCriacao(codigoBarras, codigoInterno);
    const dadosOficiais = dadosOficiaisDaBase({
      dados,
      nome,
      siglaUnidade: sigla,
      grupoNome,
      grupoIdExterno: dados.grupoIdExterno ?? null,
      balanca: balancaDaEntrada(dados, null),
      codigoInterno,
      codigoBarras: codigoBarrasFinal,
      precoVenda: precoDeVendaDoServidor(dados, await margemPadraoDoGrupo(grupoNome)),
      fiscal
    });
    const id = await inserirProdutoBaseRepository(tx, {
      idOrigem: randomUUID(),
      codigoInterno,
      codigoBarras: codigoBarrasFinal,
      nome,
      status: dados.status,
      grupoIdOrigem: dados.grupoIdExterno ?? null,
      dadosOficiais
    });
    await registrarNaFilaDaPlanilha(tx, { produtoBaseId: id });
    return { id };
  });
  await publicarCreareAposSalvar("BASE");
  return criado;
}

type LinhaBase = NonNullable<Awaited<ReturnType<typeof carregarProdutoBaseRepository>>>;

/** O produto da BASE traduzido para uma loja, sem gravar foto (so leitura/comparacao). */
function payloadNaLoja(
  linha: Pick<LinhaBase, "codigoBarras" | "nome" | "dadosOficiais">,
  referencia: {
    empresaId: string;
    unidades: Array<{ id: string; sigla: string }>;
    grupos: Array<{ id: string; nome: string }>;
  }
): ProdutoPayload {
  const convertido = montarPayloadBase(linha, referencia.unidades, referencia.grupos, referencia.empresaId, {
    ignorarFoto: true,
    tolerante: true
  });
  if (!convertido.payload) throw new BaseSemCorrespondenciaError(convertido.erro);
  return convertido.payload;
}

export async function editarProdutoBase(
  id: string,
  body: DadosExternos,
  ator: AtorDaEscrita
): Promise<{ id: string; lojasAtualizadas: number }> {
  if (!ator.administrador) {
    throw new SoAdministradorNaBaseError("Apenas o administrador altera o produto da base geral.", "FORBIDDEN");
  }
  const dados = lerEntrada(body, ator);
  await tabelasFiscais().catch(() => null);

  const editado = await executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutos(tx);
    const alvo = await carregarProdutoBaseRepository(tx, id);
    if (!alvo) throw new ProdutoNaoEncontradoError();
    const { sigla, grupoNome } = await nomesDaEntrada(tx, dados);
    const referencia = {
      empresaId: dados.empresaId,
      ...(await unidadesEGruposDaEmpresaRepository(dados.empresaId, tx))
    };
    const anterior = payloadNaLoja(alvo, referencia);
    const grupoAnterior = typeof alvo.dadosOficiais["grupo"] === "string" ? alvo.dadosOficiais["grupo"] : null;
    // Produto legado sem grupo continua editavel; quem ja tinha grupo nao fica sem (oficial).
    if (!dados.grupoMercadoriaId && grupoAnterior?.trim()) {
      throw new Error("Selecione o grupo de mercadorias para aplicar a regra fiscal.");
    }
    const codigoBarras = codigoDeBarras(dados);
    const nome = nomeDoCatalogo(dados);
    const { fiscal } = await resolverFiscalDaGravacao({
      criacao: false,
      administrador: true,
      fiscalDoPayload: dados.fiscal,
      grupoNome,
      grupoMudou: normalizarGrupoFiscal(grupoAnterior ?? "") !== normalizarGrupoFiscal(grupoNome ?? ""),
      codigoBarras,
      codigoBarrasMudou: (alvo.codigoBarras ?? null) !== codigoBarras,
      nome,
      loja: "BASE",
      fiscalAtual: anterior.fiscal ?? null
    });
    const novaLinha = {
      codigoInterno: alvo.codigoInterno,
      codigoBarras,
      nome,
      status: dados.status,
      grupoIdOrigem: dados.grupoIdExterno ?? alvo.grupoIdOrigem,
      dadosOficiais: dadosOficiaisDaBase({
        dados,
        nome,
        siglaUnidade: sigla,
        grupoNome,
        grupoIdExterno: dados.grupoIdExterno ?? alvo.grupoIdOrigem,
        balanca: balancaDaEntrada(dados, {
          pesavel: anterior.pesavel ?? null,
          teclaBalanca: anterior.teclaBalanca ?? null,
          validadeBalanca: anterior.validadeBalanca ?? null
        }),
        codigoInterno: alvo.codigoInterno,
        codigoBarras,
        precoVenda: precoDeVendaDoServidor(dados, await margemPadraoDoGrupo(grupoNome)),
        fiscal,
        anteriores: alvo.dadosOficiais
      })
    };
    await atualizarProdutoBaseRepository(tx, id, novaLinha);
    const lojasAtualizadas = await propagarParaLojas(tx, alvo, { ...alvo, ...novaLinha }, ator);
    await registrarNaFilaDaPlanilha(tx, { produtoBaseId: id });
    return { id, lojasAtualizadas };
  });
  // A BASE pode ter descido para as lojas (heranca): republica o arquivo de todas (oficial).
  await publicarCreareAposSalvar("BASE");
  return editado;
}

/**
 * Oficial `propagarParaLojas`: a edicao da BASE desce para cada copia, CAMPO A CAMPO, so onde a
 * copia ainda tinha o valor ANTIGO da BASE. Loja cuja unidade/grupo nao casa com a BASE fica de fora
 * (a copia dela nunca seguiu esse valor). Mesma transacao da edicao: ou tudo, ou nada.
 */
async function propagarParaLojas(
  tx: TransacaoBanco,
  antes: LinhaBase,
  depois: LinhaBase,
  ator?: Pick<AtorDaEscrita, "usuarioId" | "nome">
): Promise<number> {
  const copias = await copiasDaBaseRepository(tx, antes.id);
  const referencias = new Map<string, Awaited<ReturnType<typeof unidadesEGruposDaEmpresaRepository>>>();
  let atualizadas = 0;
  for (const copia of copias) {
    let referencia = referencias.get(copia.empresaId);
    if (!referencia) {
      referencia = await unidadesEGruposDaEmpresaRepository(copia.empresaId, tx);
      referencias.set(copia.empresaId, referencia);
    }
    const daLoja = { empresaId: copia.empresaId, ...referencia };
    const resolver = (linha: LinhaBase) => {
      try {
        const payload = payloadNaLoja(linha, daLoja);
        return valoresHerdadosDoPayload(payload, {
          codigoInterno: linha.codigoInterno,
          fotoUrl: fotoParaComparar(linha, payload, copia.valores.fotoUrl)
        });
      } catch (erro) {
        if (erro instanceof BaseSemCorrespondenciaError) return null;
        throw erro;
      }
    };
    const valoresAntes = resolver(antes);
    const valoresDepois = resolver(depois);
    if (!valoresAntes || !valoresDepois) continue;
    const patch = patchDeHeranca(valoresAntes, valoresDepois, copia.valores);
    // Unidade ou grupo que a loja nao tem fica de fora so naquele campo — o resto (nome, marca...) desce.
    if (patch.unidadeIndividualId === "") delete patch.unidadeIndividualId;
    if (patch.grupoMercadoriaId === "") delete patch.grupoMercadoriaId;
    if (!Object.keys(patch).length) continue;
    await aplicarHerancaNaCopiaRepository(tx, copia.id, patch);
    await registrarNaFilaDaPlanilha(tx, { empresaId: copia.empresaId, produtoId: copia.id });
    if (patch.nomeCatalogo !== undefined && patch.nomeCatalogo !== copia.valores.nomeCatalogo) {
      await registrarHistoricoNomeProdutoRepository(tx, {
        empresaId: copia.empresaId,
        produtoId: copia.id,
        nomeAnterior: copia.valores.nomeCatalogo ?? copia.valores.descricao,
        nomeNovo: patch.nomeCatalogo ?? patch.descricao ?? copia.valores.descricao,
        alteradoPor: ator?.usuarioId ?? null,
        alteradoPorNome: ator?.nome ?? null
      });
    }
    atualizadas += 1;
  }
  return atualizadas;
}

/**
 * Foto da BASE na comparacao da heranca. Foto gravada pelo ERP (ou nenhuma) participa normalmente;
 * foto do storage do app de origem ainda nao existe aqui, entao fica NEUTRA (igual a da copia) para
 * nao apagar nem acusar diferenca que ninguem fez.
 */
function fotoParaComparar(
  linha: Pick<LinhaBase, "dadosOficiais">,
  payload: ProdutoPayload,
  fotoDaCopia: string | null
) {
  const bruta = linha.dadosOficiais["foto_url"];
  if (typeof bruta === "string" && bruta.trim() && !ehFotoDaBaseNoErp(bruta.trim())) return fotoDaCopia;
  return payload.fotoUrl ?? null;
}

/** Foto da BASE (so administrador). O arquivo vai antes; o banco e a heranca, numa transacao so. */
export async function salvarFotoDaBase(
  id: string,
  arquivo: MultipartFile | undefined,
  ator: AtorDaEscrita
): Promise<{ fotoUrl: string; lojasAtualizadas: number }> {
  if (!ator.administrador) {
    throw new SoAdministradorNaBaseError("Apenas o administrador altera o produto da base geral.", "FORBIDDEN");
  }
  if (!(await buscarProdutoBaseRepository(id))) throw new ProdutoNaoEncontradoError();
  if (!arquivo) throw new FotoInvalidaError("Envie um arquivo de imagem.");
  const { caminhoRelativo } = await salvarFotoDeProduto(id, arquivo, "base");
  const lojasAtualizadas = await trocarFotoDaBase(id, caminhoRelativo);
  return { fotoUrl: caminhoRelativo, lojasAtualizadas };
}

/** Tira a foto da BASE; as lojas que seguiam a foto ficam sem ela tambem. O arquivo fica (backup). */
export async function removerFotoDaBase(id: string, ator: AtorDaEscrita): Promise<void> {
  if (!ator.administrador) {
    throw new SoAdministradorNaBaseError("Apenas o administrador altera o produto da base geral.", "FORBIDDEN");
  }
  await trocarFotoDaBase(id, null);
}

async function trocarFotoDaBase(id: string, fotoUrl: string | null): Promise<number> {
  return executarEmTransacao(async (tx) => {
    const alvo = await carregarProdutoBaseRepository(tx, id);
    if (!alvo) throw new ProdutoNaoEncontradoError();
    const depois = { ...alvo, dadosOficiais: { ...alvo.dadosOficiais, foto_url: fotoUrl } };
    await atualizarProdutoBaseRepository(tx, id, {
      codigoInterno: alvo.codigoInterno,
      codigoBarras: alvo.codigoBarras,
      nome: alvo.nome,
      status: alvo.status === "inativo" ? "inativo" : "ativo",
      grupoIdOrigem: alvo.grupoIdOrigem,
      dadosOficiais: depois.dadosOficiais
    });
    await registrarNaFilaDaPlanilha(tx, { produtoBaseId: id });
    return propagarParaLojas(tx, alvo, depois);
  });
}

/** Arquivo da foto da BASE para servir. Foto do app de origem ainda nao foi transferida para ca. */
export async function obterFotoDaBase(id: string): Promise<{ caminhoAbsoluto: string; mimeType: string }> {
  const linha = await buscarProdutoBaseRepository(id);
  if (!linha) throw new ProdutoNaoEncontradoError();
  const foto = linha.dadosOficiais["foto_url"];
  if (typeof foto !== "string" || !foto) throw new FotoInvalidaError("Produto sem foto.");
  if (!ehFotoDaBaseNoErp(foto)) throw new FotoInvalidaError("A foto deste produto ainda está no app de origem.");
  return { caminhoAbsoluto: caminhoAbsolutoDaFoto(foto), mimeType: mimeDaFoto(foto) };
}

const texto = (valor: number | null | undefined) => (valor == null ? null : String(valor));

/**
 * O produto da BASE no formato do formulario (\`ProdutoDetalhe\`), resolvido para a empresa de
 * referencia de quem edita. A BASE nao tem estoque, promocao nem conversao: vem vazio.
 */
export async function detalharProdutoBase(
  id: string,
  empresaId: string,
  empresasPermitidas: string[]
): Promise<ProdutoDetalhe> {
  if (!empresasPermitidas.includes(empresaId)) throw new ProdutoNaoEncontradoError();
  const linha = await buscarProdutoBaseRepository(id);
  if (!linha) throw new ProdutoNaoEncontradoError();
  const referencia = { empresaId, ...(await unidadesEGruposDaEmpresaRepository(empresaId)) };
  const payload = payloadNaLoja(linha, referencia);
  const fiscal = payload.fiscal ?? null;
  const transformacao = payload.transformacao ?? null;
  return {
    id: linha.id,
    empresaId,
    loja: "BASE",
    produtoBaseId: null,
    heranca: null,
    grupoMercadoriaId: payload.grupoMercadoriaId || null,
    grupoNome: referencia.grupos.find((grupo) => grupo.id === payload.grupoMercadoriaId)?.nome ?? null,
    unidadeMedidaId: payload.unidadeIndividualId,
    unidadeIndividualId: payload.unidadeIndividualId,
    unidadeIndividualSigla:
      referencia.unidades.find((unidade) => unidade.id === payload.unidadeIndividualId)?.sigla ?? null,
    codigo: null,
    codigoInterno: linha.codigoInterno,
    codigoBarras: payload.codigoBarras ?? null,
    descricao: payload.descricao,
    nomeCatalogo: payload.nomeCatalogo ?? null,
    pesavel: payload.pesavel ?? null,
    teclaBalanca: payload.teclaBalanca ?? null,
    validadeBalanca: payload.validadeBalanca ?? null,
    grupoIdExterno: payload.grupoIdExterno ?? null,
    areaVenda: null,
    marca: payload.marca ?? null,
    compraAproximada: payload.compraAproximada,
    habilitarAjuda: payload.habilitarAjuda,
    quantidadeIndividual: String(payload.quantidadeIndividual),
    embalagem: payload.embalagem ?? null,
    cDe: payload.cDe ?? null,
    quantidadeCaixa: payload.quantidadeCaixa,
    medidaCompra: payload.medidaCompra ?? null,
    custo: texto(payload.custo),
    margem: texto(payload.margem),
    precoVenda: texto(payload.precoVenda),
    precoVendaAtual: payload.precoVenda ?? null,
    auto: payload.auto,
    status: payload.status,
    tipo: payload.tipo,
    quantidadeEstoque: "0",
    estoqueMin: texto(payload.estoqueMin),
    estoqueMax: texto(payload.estoqueMax),
    areaEstoque: null,
    setorEstoque: payload.setorEstoque ?? null,
    curvaAbc: null,
    quantidadeVariavel: false,
    toleranciaQuantidadePercentual: null,
    localVenda1: payload.localVenda1 ?? null,
    localVenda2: payload.localVenda2 ?? null,
    setorVenda1: payload.setorVenda1 ?? null,
    setorVenda2: payload.setorVenda2 ?? null,
    fotoUrl: payload.fotoUrl ?? null,
    criadoPorNome: null,
    conversoes: [],
    fiscal: fiscal && {
      ncm: fiscal.ncm ?? null,
      cest: fiscal.cest ?? null,
      categoriaFiscal: fiscal.categoriaFiscal ?? null,
      cstPisCofins: fiscal.cstPisCofins ?? null,
      aliquotaCheia: texto(fiscal.aliquotaCheia),
      aliquotaFcp: texto(fiscal.aliquotaFcp),
      aliquotaPis: texto(fiscal.aliquotaPis),
      aliquotaCofins: texto(fiscal.aliquotaCofins),
      reducaoIcms: texto(fiscal.reducaoIcms),
      icms: texto(fiscal.icms),
      tributacaoSimples: fiscal.tributacaoSimples ?? null,
      aliquotaSimples: texto(fiscal.aliquotaSimples),
      icmsRe: texto(fiscal.icmsRe),
      baseFiscal: fiscal.baseFiscal ?? null,
      codigoFiscal: fiscal.codigoFiscal ?? null,
      produtoFiscal: fiscal.produtoFiscal ?? null,
      cstReforma: fiscal.cstReforma ?? null,
      cClassTrib: fiscal.cClassTrib ?? null,
      aliquotaIbs: texto(fiscal.aliquotaIbs),
      aliquotaCbs: texto(fiscal.aliquotaCbs),
      origemFiscal: fiscal.origemFiscal ?? null,
      aliquotaEcf: fiscal.aliquotaEcf ?? null,
      aliquotaEcfId: fiscal.aliquotaEcfId ?? null,
      estado: fiscal.estado ?? null,
      motivo: fiscal.motivo ?? null,
      conferidoEm: null,
      pctNcm: texto(fiscal.pctNcm)
    },
    transformacao: transformacao && {
      precisao: transformacao.precisao ?? null,
      quantidade: texto(transformacao.quantidade),
      unidade: transformacao.unidade ?? null,
      produtoReceituario: transformacao.produtoReceituario ?? null,
      refReceituario: transformacao.refReceituario ?? null
    },
    promocoes: []
  };
}

/**
 * Selo de heranca da tela oficial: em quais campos esta copia tem valor proprio e quais sao os
 * valores atuais da BASE nesta loja ("voltar a herdar"). Sem BASE, ou BASE que nao casa com a loja,
 * o selo simplesmente nao aparece (o oficial faz igual).
 */
export async function herancaDaCopia(
  copia: Parameters<typeof valoresHerdadosDaCopia>[0] & { empresaId: string; produtoBaseId: string | null }
): Promise<ProdutoDetalhe["heranca"]> {
  if (!copia.produtoBaseId) return null;
  const linha = await buscarProdutoBaseRepository(copia.produtoBaseId);
  if (!linha) return null;
  const referencia = { empresaId: copia.empresaId, ...(await unidadesEGruposDaEmpresaRepository(copia.empresaId)) };
  const convertido = montarPayloadBase(linha, referencia.unidades, referencia.grupos, copia.empresaId, {
    ignorarFoto: true,
    tolerante: true
  });
  if (!convertido.payload) return null;
  const valoresCopia = valoresHerdadosDaCopia(copia);
  const base = valoresHerdadosDoPayload(convertido.payload, {
    codigoInterno: linha.codigoInterno,
    fotoUrl: fotoParaComparar(linha, convertido.payload, valoresCopia.fotoUrl)
  });
  return { naoSeguem: camposQueNaoSeguemABase(valoresCopia, base), base };
}

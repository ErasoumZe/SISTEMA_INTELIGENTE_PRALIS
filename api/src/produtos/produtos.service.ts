import type { DadosExternos } from "@padaria/shared/api";
import {
  calcularPrecoVenda,
  calcularPrecoVendaComPromocao,
  normalizarTextosProduto,
  produtoPayloadSchema,
  TECLA_BALANCA_FIXA,
  validarBalanca,
  validarEstoquePorEmbalagem,
  validarPromocoesDoProduto,
  type PromocaoRegra
} from "@padaria/shared/produtos";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { apenasDigitos } from "../utils.js";
import type { MultipartFile } from "@fastify/multipart";
import {
  atualizarFotoDoProdutoRepository,
  buscarProdutoPorCodigoBarrasRepository,
  buscarProdutoPorDescricaoRepository,
  carregarProdutoParaEscritaRepository,
  listarHistoricoNomesProdutoRepository,
  registrarHistoricoNomeProdutoRepository,
  referenciasForaDaEmpresaRepository,
  salvarProdutoRepository,
  travarCadastroDeProdutos,
  type ProdutoParaGravar
} from "./produtos-escrita.repository.js";
import {
  caminhoAbsolutoDaFoto,
  ehFotoExternaLegada,
  FotoInvalidaError,
  mimeDaFoto,
  salvarFotoDeProduto
} from "./produtos-foto.js";
import {
  buscarCatalogoParaBackupRepository,
  buscarPanoramaFiscalProdutosRepository,
  exportarCatalogoCsvRepository,
  filtrosDeProdutoRepository,
  listarProdutosPaginadoRepository,
  opcoesDeProdutoRepository,
  promocoesDosProdutosRepository,
  type FiltroListaProdutos
} from "./produtos-leitura.repository.js";
import { detalheProdutoRepository } from "./produtos.repository.js";
import { registrarNaFilaDaPlanilha } from "./produtos-planilha.service.js";
import { contextoFiscalRepository } from "./produtos-fiscal.repository.js";
import { resolverFiscalDaGravacao } from "./produtos-fiscal-gravacao.js";
import { lojaFiscalDaEmpresa, margemPadraoDoGrupo, tabelasFiscais } from "./produtos-fiscal.service.js";

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
 * Codigo de barras repetido na mesma loja. Pede confirmacao, como no app oficial (decisao de Jose,
 * 27/10/2026): o "cadastrar mesmo assim" (`forcar`) passa por cima.
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

/** Oficial: area de venda so existe no cadastro da TNP (AREA_STORE_MISMATCH). */
export class AreaDeVendaForaDaTnpError extends Error {
  readonly code = "AREA_STORE_MISMATCH";
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "AreaDeVendaForaDaTnpError";
  }
}

/** Grupo/unidade apontando para o cadastro de outra empresa. */
export class ReferenciaDeOutraEmpresaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ReferenciaDeOutraEmpresaError";
  }
}

type PromocaoDoBanco = {
  tipo: string;
  valor: string | null;
  descontoFracao: string | null;
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
};

function paraRegraDePromocao(promo: PromocaoDoBanco): PromocaoRegra {
  return {
    tipo: promo.tipo === "valor" ? "valor" : "desconto",
    valor: promo.valor == null ? null : Number(promo.valor),
    descontoFracao: promo.descontoFracao == null ? null : Number(promo.descontoFracao),
    horaInicio: promo.horaInicio,
    horaFim: promo.horaFim,
    dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom],
    // `valida_ate` era GRAVADA e nunca lida. Agora vale: promocao vencida nao aplica.
    validaAte: promo.validaAte
  };
}

/**
 * ADR-003: o preco vigente (com promocao ativa por dia/horario) e derivado na LEITURA, pelo
 * servidor — nunca persistido nem calculado pelo cliente.
 */
function precoVigente(precoVenda: string | null, promocoes: PromocaoDoBanco[], agora: Date): number | null {
  if (precoVenda == null) return null;
  return calcularPrecoVendaComPromocao({
    precoVenda: Number(precoVenda),
    agora,
    promocoes: promocoes.map(paraRegraDePromocao)
  });
}

/**
 * Listagem paginada NO BANCO, com busca, filtros e ordenacao server-side. So as promocoes DA
 * PAGINA sao carregadas — nenhuma outra satelite entra no resumo.
 */
export async function listarProdutos(filtro: FiltroListaProdutos) {
  if (!filtro.escopoEmpresas.length) return { itens: [], total: 0 };
  const agora = new Date();
  const { itens, total } = await listarProdutosPaginadoRepository(filtro);
  const promocoes = await promocoesDosProdutosRepository(itens.map((produto) => produto.id));
  return {
    itens: itens.map((produto) => ({
      ...produto,
      precoVendaAtual: precoVigente(
        produto.precoVenda,
        promocoes.filter((promo) => promo.produtoId === produto.id),
        agora
      )
    })),
    total
  };
}

/** Detalhe completo para o formulario. `null` = inexistente OU fora do escopo (404 nos dois). */
export async function detalharProduto(id: string, escopoDados: string[]) {
  const detalhe = await detalheProdutoRepository(id, escopoDados);
  if (!detalhe) throw new ProdutoNaoEncontradoError();
  const { matriculaPrefixo, ...produto } = detalhe;
  return {
    ...produto,
    // Loja do produto (TNP/LI/HORA): area de venda so existe na TNP (oficial).
    loja: lojaFiscalDaEmpresa(matriculaPrefixo),
    precoVendaAtual: precoVigente(produto.precoVenda, produto.promocoes, new Date())
  };
}

/**
 * Projecao reduzida para seletores. **Teto duro de `LIMITE_DE_OPCOES` linhas, sempre.**
 *
 * O numero e escolhido, nao arbitrario: o mix real da rede fica na casa das centenas, entao o
 * seletor abre completo no uso de hoje — e continua **limitado**, para que a rota nunca vire
 * "traga todos os produtos" quando o catalogo crescer. Passar do teto nao quebra nada: digitar
 * refaz a consulta no servidor (`busca`), e `ids` hidrata o item ja escolhido mesmo que ele esteja
 * fora do recorte. Os seletores que usam `ProdutoAutocomplete` ja funcionam assim.
 */
const LIMITE_DE_OPCOES = 500;

export async function listarOpcoesDeProduto(entrada: {
  escopoEmpresas: string[];
  busca: string | undefined;
  ids: string[];
}) {
  if (!entrada.escopoEmpresas.length) return [];
  return opcoesDeProdutoRepository({ ...entrada, limite: LIMITE_DE_OPCOES });
}

export async function listarFiltrosDeProduto(escopoDados: string[]) {
  if (!escopoDados.length) return { setores: [], grupos: [] };
  return filtrosDeProdutoRepository(escopoDados);
}

export async function consultarPanoramaFiscalProdutos(perfil: PerfilComEmpresa) {
  return buscarPanoramaFiscalProdutosRepository(empresasPermitidas(perfil));
}

export async function exportarCatalogoCsvProdutos(perfil: PerfilComEmpresa) {
  return exportarCatalogoCsvRepository(empresasPermitidas(perfil));
}

export async function buscarBackupCatalogoProdutos(perfil: PerfilComEmpresa) {
  return buscarCatalogoParaBackupRepository(empresasPermitidas(perfil));
}

function mensagemDeDuplicado(duplicado: { descricao: string; criadoPorNome: string | null }, motivo: string) {
  const porQuem = duplicado.criadoPorNome ? ` (cadastrado por ${duplicado.criadoPorNome})` : "";
  return `Ja existe o produto "${duplicado.descricao}" nesta loja${porQuem}${motivo}.`;
}

export interface AtorDaEscrita {
  usuarioId: string | null | undefined;
  nome?: string | null | undefined;
  empresasPermitidas: string[];
  /** Administrador pode digitar os campos fiscais manuais (oficial: ONLY_ADMIN_FISCAL para os demais). */
  administrador?: boolean;
}

/**
 * Cria ou edita produto. TUDO acontece numa transacao so, nesta ordem — e a ordem importa:
 *
 * 1. trava o cadastro da empresa (serializa codigo interno e duplicidade);
 * 2. na edicao, CARREGA E TRAVA o produto alvo e confere o escopo — **antes** de qualquer escrita
 *    ou `delete` de satelite;
 * 3. confere que grupo e unidades sao da mesma empresa do produto;
 * 4. aplica as duas regras de duplicidade (EAN e descricao, ambas com confirmacao);
 * 5. grava produto + satelites.
 *
 * As regras de ENTRADA do app oficial (maiusculas, balanca, estoque por embalagem, grupo obrigatorio)
 * valem para o que a pessoa digita. A copia da BASE (`produtoBaseId`) e importacao de dado que ja
 * existe: cadastro legado que viola a regra de entrada nao pode impedir a copia (mesma separacao do
 * oficial entre `importProductSchema` e `createProductSchema`).
 */
export async function salvarProduto(
  id: string | null,
  body: DadosExternos,
  ator: AtorDaEscrita,
  opcoes: { produtoBaseId?: string; preservarPrecoImportado?: boolean; codigoInterno?: string | null } = {}
) {
  const entradaDaPessoa = opcoes.produtoBaseId === undefined;
  const lido = produtoPayloadSchema.parse(body);
  const dados = entradaDaPessoa ? normalizarTextosProduto(lido) : lido;
  const descricao = dados.descricao.trim();
  const codigoBarras = apenasDigitos(dados.codigoBarras) ?? dados.codigoBarras?.trim() ?? null;

  if (!ator.empresasPermitidas.includes(dados.empresaId)) throw new Error("Empresa nao permitida");
  validarCoerenciaDoProduto(dados);
  if (entradaDaPessoa) validarEstoqueDaEntrada(dados);
  // Le as regras fiscais ANTES da trava do cadastro: dentro da transacao a classificacao usa o cache em
  // memoria e o Google nunca segura a trava. Falha aqui nao derruba nada (vira "fonte_indisponivel").
  await tabelasFiscais().catch(() => null);

  return executarEmTransacao(async (tx) => {
    await travarCadastroDeProdutos(tx);

    const alvo = id ? await carregarProdutoAlvoValidado(tx, id, dados.empresaId, ator.empresasPermitidas) : null;

    // Oficial: produto novo sem grupo e recusado (e dele que sai a regra fiscal). Na edicao so
    // recusa quem JA tinha grupo — produto legado sem grupo continua editavel.
    if (entradaDaPessoa && !dados.grupoMercadoriaId && (!alvo || alvo.grupoMercadoriaId)) {
      throw new Error("Selecione o grupo de mercadorias para aplicar os impostos.");
    }
    const balanca = entradaDaPessoa
      ? balancaDaEntrada(dados, alvo)
      : {
          pesavel: dados.pesavel === undefined ? (alvo?.pesavel ?? false) : dados.pesavel,
          teclaBalanca: dados.teclaBalanca === undefined ? (alvo?.teclaBalanca ?? null) : dados.teclaBalanca,
          validadeBalanca: dados.validadeBalanca === undefined ? (alvo?.validadeBalanca ?? null) : dados.validadeBalanca
        };

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

    // Fiscal puxado pelo grupo, igual ao app da loja. A copia da BASE nao reclassifica: copia o fiscal.
    const contextoFiscal = await contextoFiscalRepository(tx, {
      empresaId: dados.empresaId,
      grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
      produtoId: alvo?.id ?? null
    });
    // Oficial: area de venda so pode ser definida em produto da TNP.
    if (entradaDaPessoa && dados.areaVenda != null && lojaFiscalDaEmpresa(contextoFiscal.matriculaPrefixo) !== "TNP") {
      throw new AreaDeVendaForaDaTnpError("Área de venda desta planta só pode ser definida em produto da TNP.");
    }
    const fiscal = entradaDaPessoa
      ? (
          await resolverFiscalDaGravacao({
            criacao: !alvo,
            administrador: Boolean(ator.administrador),
            fiscalDoPayload: dados.fiscal,
            grupoNome: contextoFiscal.grupoNome,
            grupoMudou:
              Boolean(alvo) && (contextoFiscal.atual?.grupoMercadoriaId ?? null) !== (dados.grupoMercadoriaId ?? null),
            codigoBarras,
            codigoBarrasMudou: Boolean(alvo) && (contextoFiscal.atual?.codigoBarras ?? null) !== codigoBarras,
            nome: dados.nomeCatalogo?.trim() || descricao,
            loja: lojaFiscalDaEmpresa(contextoFiscal.matriculaPrefixo),
            fiscalAtual: contextoFiscal.atual?.fiscal ?? null
          })
        ).fiscal
      : (dados.fiscal ?? null);

    // Margem padrao do grupo vem da MESMA planilha do oficial (aba de grupos), nao de cadastro local.
    const precoVenda = opcoes.preservarPrecoImportado
      ? (dados.precoVenda ?? null)
      : precoDeVendaDoServidor(dados, await margemPadraoDoGrupo(contextoFiscal.grupoNome));
    const salvo = await salvarProdutoRepository(
      tx,
      montarProdutoParaGravar(
        { ...dados, fiscal },
        {
          id: alvo?.id,
          descricao,
          codigoBarras,
          precoVenda,
          nomeCatalogo:
            dados.nomeCatalogo === undefined ? (alvo?.nomeCatalogo ?? null) : dados.nomeCatalogo?.trim() || null,
          ...balanca,
          grupoIdExterno: dados.grupoIdExterno === undefined ? (alvo?.grupoIdExterno ?? null) : dados.grupoIdExterno,
          areaVenda: dados.areaVenda === undefined ? (alvo?.areaVenda ?? null) : dados.areaVenda,
          produtoBaseId: opcoes.produtoBaseId ?? alvo?.produtoBaseId ?? null,
          codigoInterno: opcoes.codigoInterno ?? null,
          criadoPor: ator.usuarioId ?? null
        }
      )
    );
    const nomeNovo = dados.nomeCatalogo === undefined ? alvo?.nomeCatalogo : dados.nomeCatalogo?.trim() || null;
    if (alvo && nomeNovo != null && nomeNovo !== (alvo.nomeCatalogo ?? alvo.descricao)) {
      await registrarHistoricoNomeProdutoRepository(tx, {
        empresaId: alvo.empresaId,
        produtoId: alvo.id,
        nomeAnterior: alvo.nomeCatalogo ?? alvo.descricao,
        nomeNovo,
        alteradoPor: ator.usuarioId ?? null,
        alteradoPorNome: ator.nome ?? null
      });
    }
    // Espelho na planilha (desligado ate a virada): entra na fila na mesma transacao.
    await registrarNaFilaDaPlanilha(tx, { empresaId: salvo.empresaId, produtoId: salvo.id });
    return salvo;
  });
}

export async function listarHistoricoNomesProduto(empresaId: string, produtoId: string, empresasPermitidas: string[]) {
  if (!empresasPermitidas.includes(empresaId)) throw new ProdutoNaoEncontradoError();
  const historico = await listarHistoricoNomesProdutoRepository(empresaId, produtoId);
  if (!historico) throw new ProdutoNaoEncontradoError();
  return historico;
}

type DadosDoProduto = ReturnType<typeof produtoPayloadSchema.parse>;

/** Estoque minimo/maximo em embalagem fechada (oficial). So para o que a pessoa digita. */
export function validarEstoqueDaEntrada(dados: DadosDoProduto): void {
  const erros = validarEstoquePorEmbalagem({
    quantidadeCaixa: dados.quantidadeCaixa,
    estoqueMin: dados.estoqueMin,
    estoqueMax: dados.estoqueMax
  });
  if (erros.length) throw new Error(erros.map((item) => item.mensagem).join(" "));
}

/**
 * Balanca como no oficial: produto NOVO sem resposta comeca em "Nao"; quem vai para a balanca tem a
 * tecla fixa 000 e a validade obrigatoria (0 a 999 dias); quem nao vai fica sem tecla e sem validade.
 * Na edicao, `null` (ainda nao conferido) continua aceito: e o estado de cadastro legado.
 */
export function balancaDaEntrada(
  dados: DadosDoProduto,
  alvo: { pesavel: boolean | null; teclaBalanca: number | null; validadeBalanca: number | null } | null
) {
  const informado = dados.pesavel === undefined ? (alvo ? alvo.pesavel : null) : dados.pesavel;
  const pesavel = !alvo && informado == null ? false : informado;
  const validade = dados.validadeBalanca === undefined ? (alvo?.validadeBalanca ?? null) : dados.validadeBalanca;
  if (pesavel === true) {
    const erros = validarBalanca({ pesavel, validadeBalanca: validade });
    if (erros.length) throw new Error(erros.join(" "));
    return { pesavel, teclaBalanca: TECLA_BALANCA_FIXA, validadeBalanca: validade };
  }
  if (pesavel === false) return { pesavel, teclaBalanca: null, validadeBalanca: null };
  return {
    pesavel,
    teclaBalanca: dados.teclaBalanca === undefined ? (alvo?.teclaBalanca ?? null) : dados.teclaBalanca,
    validadeBalanca: validade
  };
}

/**
 * Coerencia do payload — o que o Zod nao consegue dizer sozinho porque depende de dois campos.
 *
 * O servidor RECUSA payload incompativel com o tipo: ficha de transformacao em produto de revenda
 * e promocao em produto de transformacao entrariam no banco e ficariam invisiveis na tela,
 * ressuscitando na proxima edicao.
 */
export function validarCoerenciaDoProduto(dados: DadosDoProduto): void {
  const problemas: string[] = [];

  if (dados.tipo === "revenda" && dados.transformacao) {
    problemas.push("Produto de revenda nao tem ficha de transformacao.");
  }
  if (dados.tipo === "transformacao" && dados.promocoes.length) {
    problemas.push("Promocao existe apenas para produto de revenda.");
  }
  if (dados.estoqueMin != null && dados.estoqueMax != null && dados.estoqueMax < dados.estoqueMin) {
    problemas.push("O estoque maximo nao pode ser menor que o minimo.");
  }

  const unidadesDasConversoes = dados.conversoes.map((conversao) => conversao.unidadeMedidaId);
  if (new Set(unidadesDasConversoes).size !== unidadesDasConversoes.length) {
    problemas.push("A mesma unidade aparece em duas conversoes do produto.");
  }

  problemas.push(
    ...validarPromocoesDoProduto(
      dados.promocoes.map((promo) => ({
        tipo: promo.tipo,
        valor: promo.valor ?? null,
        descontoFracao: promo.descontoFracao ?? null,
        horaInicio: promo.horaInicio ?? null,
        horaFim: promo.horaFim ?? null,
        dias: [promo.seg, promo.ter, promo.qua, promo.qui, promo.sex, promo.sab, promo.dom],
        validaAte: promo.validaAte ?? null
      }))
    )
  );

  if (problemas.length) throw new Error(problemas.join(" "));
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
  // Oficial: nome e EAN repetidos pedem confirmacao; `forcar` ("cadastrar mesmo assim") vale para os dois.
  if (entrada.forcar) return;
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
export function precoDeVendaDoServidor(
  dados: {
    auto: boolean;
    custo?: number | null | undefined;
    quantidadeCaixa?: number | undefined;
    margem?: number | null | undefined;
    precoVenda?: number | null | undefined;
  },
  margemGrupo: number
) {
  if (!dados.auto) return dados.precoVenda ?? null;
  if (dados.custo == null) return null;
  return calcularPrecoVenda({
    auto: true,
    custo: dados.custo,
    quantidadeCaixa: dados.quantidadeCaixa ?? 1,
    margem: dados.margem ?? null,
    // Margem padrao do grupo pela aba de grupos da planilha oficial (sem margem propria).
    margemGrupo,
    precoManual: 0
  });
}

function montarProdutoParaGravar(
  dados: DadosDoProduto,
  extra: {
    id: string | undefined;
    descricao: string;
    codigoBarras: string | null;
    precoVenda: number | null;
    nomeCatalogo: string | null;
    pesavel: boolean | null;
    teclaBalanca: number | null;
    validadeBalanca: number | null;
    grupoIdExterno: string | null;
    areaVenda: string | null;
    produtoBaseId: string | null;
    codigoInterno: string | null;
    criadoPor: string | null;
  }
): ProdutoParaGravar {
  return {
    ...(extra.id ? { id: extra.id } : {}),
    empresaId: dados.empresaId,
    produtoBaseId: extra.produtoBaseId,
    ...(extra.codigoInterno ? { codigoInterno: extra.codigoInterno } : {}),
    codigo: dados.codigo?.trim() || null,
    criadoPor: extra.criadoPor,
    codigoBarras: extra.codigoBarras,
    descricao: extra.descricao,
    nomeCatalogo: extra.nomeCatalogo,
    pesavel: extra.pesavel,
    teclaBalanca: extra.teclaBalanca,
    validadeBalanca: extra.validadeBalanca,
    grupoIdExterno: extra.grupoIdExterno?.trim() || null,
    areaVenda: extra.areaVenda,
    marca: dados.marca?.trim() || null,
    compraAproximada: dados.compraAproximada,
    habilitarAjuda: dados.habilitarAjuda,
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
    estoqueMin: dados.estoqueMin ?? null,
    estoqueMax: dados.estoqueMax ?? null,
    areaEstoque: dados.areaEstoque?.trim() || null,
    setorEstoque: dados.setorEstoque?.trim() || null,
    curvaAbc: dados.curvaAbc ?? null,
    quantidadeVariavel: dados.quantidadeVariavel,
    toleranciaQuantidadePercentual: dados.quantidadeVariavel ? (dados.toleranciaQuantidadePercentual ?? 0) : null,
    localVenda1: dados.localVenda1?.trim() || null,
    localVenda2: dados.localVenda2?.trim() || null,
    setorVenda1: dados.setorVenda1?.trim() || null,
    setorVenda2: dados.setorVenda2?.trim() || null,
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
          icms: dados.fiscal.icms ?? null,
          tributacaoSimples: dados.fiscal.tributacaoSimples?.trim() || null,
          aliquotaSimples: dados.fiscal.aliquotaSimples ?? null,
          icmsRe: dados.fiscal.icmsRe ?? null,
          baseFiscal: dados.fiscal.baseFiscal?.trim() || null,
          codigoFiscal: dados.fiscal.codigoFiscal?.trim() || null,
          produtoFiscal: dados.fiscal.produtoFiscal?.trim() || null,
          cstReforma: dados.fiscal.cstReforma?.trim() || null,
          cClassTrib: dados.fiscal.cClassTrib?.trim() || null,
          aliquotaIbs: dados.fiscal.aliquotaIbs ?? null,
          aliquotaCbs: dados.fiscal.aliquotaCbs ?? null,
          origemFiscal: dados.fiscal.origemFiscal?.trim() || null,
          aliquotaEcf: dados.fiscal.aliquotaEcf ?? null,
          aliquotaEcfId: dados.fiscal.aliquotaEcfId ?? null,
          estado: dados.fiscal.estado ?? null,
          motivo: dados.fiscal.motivo ?? null,
          conferidoEm: dados.fiscal.conferidoEm ?? null,
          pctNcm: dados.fiscal.pctNcm ?? null
        }
      : null,
    transformacao: dados.transformacao
      ? {
          precisao: dados.transformacao.precisao ?? null,
          quantidade: dados.transformacao.quantidade ?? null,
          unidade: dados.transformacao.unidade ?? null,
          produtoReceituario: dados.transformacao.produtoReceituario?.trim() || null,
          refReceituario: dados.transformacao.refReceituario?.trim() || null
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

// --------------------------------------------------------------------------------------------
// Foto do produto (ETAPA 8): multipart -> /app/storage, sem Cloudinary.
// --------------------------------------------------------------------------------------------

/**
 * Grava a foto e aponta `foto_url` para o caminho relativo.
 *
 * O produto e carregado e conferido ANTES de qualquer escrita em disco: sem isso, um id de outra
 * empresa criaria pasta e arquivo antes de a autorizacao ser negada.
 */
export async function salvarFotoDeProdutoNoEscopo(
  produtoId: string,
  arquivo: MultipartFile | undefined,
  escopoEmpresas: string[]
): Promise<{ fotoUrl: string }> {
  const produto = await detalheProdutoRepository(produtoId, escopoEmpresas);
  if (!produto) throw new ProdutoNaoEncontradoError();
  if (!arquivo) throw new FotoInvalidaError("Envie um arquivo de imagem.");

  const { caminhoRelativo } = await salvarFotoDeProduto(produtoId, arquivo);
  const gravou = await atualizarFotoDoProdutoRepository(produtoId, produto.empresaId, caminhoRelativo);
  if (!gravou) throw new ProdutoNaoEncontradoError();
  return { fotoUrl: caminhoRelativo };
}

/** Remove o vinculo da foto. O arquivo fica no storage — apagar bem seria outra OS (retencao). */
export async function removerFotoDeProdutoNoEscopo(produtoId: string, escopoEmpresas: string[]): Promise<void> {
  const produto = await detalheProdutoRepository(produtoId, escopoEmpresas);
  if (!produto) throw new ProdutoNaoEncontradoError();
  const gravou = await atualizarFotoDoProdutoRepository(produtoId, produto.empresaId, null);
  if (!gravou) throw new ProdutoNaoEncontradoError();
}

/**
 * Resolve a foto para leitura. Devolve `externa` quando o produto guarda uma URL legada — ela
 * continua sendo LIDA (o front aponta a `<img>` direto), mas nunca passa pelo storage.
 */
export async function obterFotoDeProdutoNoEscopo(
  produtoId: string,
  escopoEmpresas: string[]
): Promise<{ tipo: "arquivo"; caminhoAbsoluto: string; mimeType: string } | { tipo: "externa"; url: string }> {
  const produto = await detalheProdutoRepository(produtoId, escopoEmpresas);
  if (!produto) throw new ProdutoNaoEncontradoError();
  if (!produto.fotoUrl) throw new FotoInvalidaError("Produto sem foto.");
  if (ehFotoExternaLegada(produto.fotoUrl)) return { tipo: "externa", url: produto.fotoUrl };
  return {
    tipo: "arquivo",
    caminhoAbsoluto: caminhoAbsolutoDaFoto(produto.fotoUrl),
    mimeType: mimeDaFoto(produto.fotoUrl)
  };
}

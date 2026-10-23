import type {
  AnalisarImportacaoPrecoBase,
  CatalogoFornecedorDecisao,
  CatalogoFornecedorPayload
} from "@padaria/shared/compras";
import { normalizarDescricaoPrecoBase } from "@padaria/shared/compras";
import type { DadosExternos } from "@padaria/shared/api";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import {
  aplicarImportacaoPrecoBaseRepository,
  buscarImportacaoPorHashRepository,
  buscarVinculoCatalogoPorChaveRepository,
  buscarVinculoCatalogoRepository,
  criarAnaliseImportacaoRepository,
  criarVinculoCatalogoRepository,
  decidirVinculoCatalogoRepository,
  descartarImportacaoPrecoBaseRepository,
  detalharImportacaoPrecoBaseRepository,
  listarCatalogoFornecedorRepository,
  listarImportacoesPrecoBaseRepository,
  listarPrecosBaseAtuaisRepository,
  listarProdutosParaImportacaoRepository,
  validarFornecedorEProdutoRepository
} from "./compras-fundacao.repository.js";

function exigirEmpresa(perfil: PerfilComEmpresa, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

/**
 * As duas pre-checagens de duplicidade deste modulo (vinculo do catalogo e hash do arquivo) leem
 * ANTES de escrever, e em READ COMMITTED dois cliques simultaneos passam pelos dois. O unique do
 * banco segura o dado — a integridade nunca dependeu disto — mas o perdedor recebia 500 "Erro
 * interno" em vez do 409 que explica o que aconteceu.
 *
 * Comparacao por CODIGO e NOME da constraint, nunca pelo texto da mensagem (que muda entre versoes
 * e locales), e descendo a corrente de `cause` porque o Drizzle embrulha o erro do driver — mesma
 * forma de `funcoes.service.ts`.
 */
function ehViolacaoDeUnicidade(erro: DadosExternos, constraint: string): boolean {
  const candidatos = [erro, erro instanceof Error && erro.cause instanceof Error ? erro.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as { code?: string; constraint?: string };
    return detalhes.code === "23505" && detalhes.constraint === constraint;
  });
}

export async function listarCatalogoFornecedor(
  filtro: {
    empresaId: string;
    fornecedorId?: string | undefined;
    status?: "pendente" | "aprovado" | "rejeitado" | undefined;
  },
  perfil: PerfilComEmpresa
) {
  exigirEmpresa(perfil, filtro.empresaId);
  return listarCatalogoFornecedorRepository(filtro);
}

export async function criarVinculoCatalogo(
  dados: CatalogoFornecedorPayload,
  perfil: PerfilComEmpresa,
  usuarioId: string
) {
  exigirEmpresa(perfil, dados.empresaId);
  const referencias = await validarFornecedorEProdutoRepository(dados.empresaId, dados.fornecedorId, dados.produtoId);
  if (!referencias.fornecedorExiste) throw naoEncontrado("Fornecedor nao encontrado", "SUPPLIER_NOT_FOUND");
  if (!referencias.produtoExiste) throw naoEncontrado("Produto nao encontrado", "PRODUCT_NOT_FOUND");
  if (await buscarVinculoCatalogoPorChaveRepository(dados.empresaId, dados.fornecedorId, dados.produtoId))
    throw conflito("Produto ja vinculado a este fornecedor", "SUPPLIER_PRODUCT_ALREADY_EXISTS");
  try {
    return await executarEmTransacao((tx) =>
      criarVinculoCatalogoRepository(
        {
          ...dados,
          precoOfertado: dados.precoOfertado ?? null,
          observacao: dados.observacao ?? null,
          usuarioId
        },
        tx
      )
    );
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro, "fornecedores_produtos_empresa_fornecedor_produto_unico"))
      throw conflito("Produto ja vinculado a este fornecedor", "SUPPLIER_PRODUCT_ALREADY_EXISTS");
    throw erro;
  }
}

export async function decidirVinculoCatalogo(
  id: string,
  dados: CatalogoFornecedorDecisao,
  perfil: PerfilComEmpresa,
  usuarioId: string
) {
  exigirEmpresa(perfil, dados.empresaId);
  return executarEmTransacao(async (tx) => {
    const atual = await buscarVinculoCatalogoRepository(id, dados.empresaId, tx);
    if (!atual) throw naoEncontrado("Vinculo de catalogo nao encontrado", "SUPPLIER_PRODUCT_NOT_FOUND");
    // Revisao continua permitida (aprovado -> rejeitado e o contrario): o catalogo e revisavel e o
    // historico fica nos eventos. O que se recusa e a decisao que NAO muda nada, que so poluiria a
    // trilha com um evento sem fato — tipicamente clique duplo.
    if (atual.status === dados.status)
      throw conflito(`Este vinculo ja esta ${dados.status}`, "SUPPLIER_PRODUCT_STATUS_UNCHANGED");
    const salvo = await decidirVinculoCatalogoRepository(
      {
        id,
        empresaId: dados.empresaId,
        statusAnterior: atual.status,
        statusNovo: dados.status,
        precoOfertado: atual.precoOfertado,
        observacao: dados.observacao ?? atual.observacao,
        usuarioId
      },
      tx
    );
    if (!salvo) throw naoEncontrado("Vinculo de catalogo nao encontrado", "SUPPLIER_PRODUCT_NOT_FOUND");
    return salvo;
  });
}

export async function analisarImportacaoPrecoBase(
  dados: AnalisarImportacaoPrecoBase,
  perfil: PerfilComEmpresa,
  usuarioId: string
) {
  exigirEmpresa(perfil, dados.empresaId);
  const repetida = await buscarImportacaoPorHashRepository(dados.empresaId, dados.hashArquivo);
  if (repetida) throw conflito("Este arquivo ja foi analisado", "PRICE_BASE_FILE_ALREADY_ANALYZED", repetida);

  const produtos = await listarProdutosParaImportacaoRepository(dados.empresaId);
  // Indices montados UMA vez. Antes cada linha percorria todos os produtos tres vezes e
  // renormalizava a descricao de cada um: 50.000 linhas x 3.000 produtos travavam o event loop da
  // API inteira por minutos (a padaria toda fica sem Caixa enquanto roda).
  //
  // Codigo e EAN continuam em mapas SEPARADOS de proposito: o casamento por codigo olha
  // `codigo`/`codigo_interno`, o por EAN olha o codigo de barras. Num mapa unico, o codigo "123" de
  // um produto casaria com o EAN "123" de outro e inventaria ambiguidade.
  const indexar = (chaves: Map<string, typeof produtos>, chave: string, produto: (typeof produtos)[number]) => {
    const atual = chaves.get(chave);
    if (atual) atual.push(produto);
    else chaves.set(chave, [produto]);
  };
  const porCodigo = new Map<string, typeof produtos>();
  const porEan = new Map<string, typeof produtos>();
  const porDescricao = new Map<string, typeof produtos>();
  for (const produto of produtos) {
    const codigo = produto.codigo?.trim();
    const codigoInterno = produto.codigoInterno?.trim();
    if (codigo) indexar(porCodigo, codigo, produto);
    if (codigoInterno && codigoInterno !== codigo) indexar(porCodigo, codigoInterno, produto);
    const ean = produto.ean?.replace(/\D/g, "");
    if (ean) indexar(porEan, ean, produto);
    indexar(porDescricao, normalizarDescricaoPrecoBase(produto.descricao), produto);
  }

  const analisadas = dados.linhas.map((linha) => {
    const codigo = linha.codigo?.trim() || null;
    const ean = linha.ean?.replace(/\D/g, "") || null;
    const descricaoNormalizada = normalizarDescricaoPrecoBase(linha.descricao);
    const porChave = [...(codigo ? (porCodigo.get(codigo) ?? []) : []), ...(ean ? (porEan.get(ean) ?? []) : [])];
    const chaves = [...new Map(porChave.map((produto) => [produto.id, produto])).values()];
    const candidatos = chaves.length ? chaves : (porDescricao.get(descricaoNormalizada) ?? []);
    const resultado: "correspondencia" | "ambiguidade" | "nao_encontrado" =
      candidatos.length === 1 ? "correspondencia" : candidatos.length > 1 ? "ambiguidade" : "nao_encontrado";
    return {
      numeroLinha: linha.numeroLinha,
      codigo,
      ean,
      descricao: linha.descricao,
      descricaoNormalizada,
      valor: linha.ultimoMenorCusto,
      produtoId: candidatos.length === 1 ? candidatos[0]!.id : null,
      resultado,
      detalhe:
        candidatos.length > 1
          ? `Encontrados ${candidatos.length} produtos: ${candidatos.map((produto) => produto.descricao).join("; ")}`
          : candidatos.length === 0
            ? "Nenhum produto localizado por codigo, EAN ou descricao normalizada"
            : null
    };
  });

  // Duas linhas apontando para o MESMO produto sao ambiguidade da planilha, nao correspondencia.
  // Cada linha e avaliada isolada, entao as duas passavam como boas e a aplicacao tentava gravar
  // dois precos vigentes para o mesmo produto — violando `produtos_precos_base_atual_unico_idx` e
  // respondendo 500 "Erro interno", sem dizer ao operador qual produto esta repetido.
  //
  // Qual das duas vale e pergunta de negocio (a planilha pode ter dois custos diferentes para o
  // mesmo item): aqui a importacao para e pede correcao, em vez de escolher um numero sozinha.
  const linhasPorProduto = new Map<string, number[]>();
  for (const item of analisadas) {
    if (item.resultado !== "correspondencia" || !item.produtoId) continue;
    const atual = linhasPorProduto.get(item.produtoId);
    if (atual) atual.push(item.numeroLinha);
    else linhasPorProduto.set(item.produtoId, [item.numeroLinha]);
  }
  const itens = analisadas.map((item) => {
    const repetidas = item.produtoId ? (linhasPorProduto.get(item.produtoId) ?? []) : [];
    if (item.resultado !== "correspondencia" || repetidas.length < 2) return item;
    return {
      ...item,
      produtoId: null,
      resultado: "ambiguidade" as const,
      detalhe: `O mesmo produto aparece nas linhas ${repetidas.join(", ")} da planilha`
    };
  });

  try {
    return await executarEmTransacao((tx) =>
      criarAnaliseImportacaoRepository(
        {
          empresaId: dados.empresaId,
          nomeArquivo: dados.nomeArquivo,
          hashArquivo: dados.hashArquivo,
          usuarioId,
          itens
        },
        tx
      )
    );
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro, "compras_importacoes_preco_base_empresa_hash_unico"))
      throw conflito("Este arquivo ja foi analisado", "PRICE_BASE_FILE_ALREADY_ANALYZED");
    throw erro;
  }
}

export async function listarImportacoesPrecoBase(empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  return listarImportacoesPrecoBaseRepository(empresaId);
}

export async function detalharImportacaoPrecoBase(
  id: string,
  empresaId: string,
  perfil: PerfilComEmpresa,
  opcoes: { somentePendencias?: boolean } = {}
) {
  exigirEmpresa(perfil, empresaId);
  const importacao = await detalharImportacaoPrecoBaseRepository(id, empresaId, opcoes);
  if (!importacao) throw naoEncontrado("Importacao nao encontrada", "PRICE_BASE_IMPORT_NOT_FOUND");
  return importacao;
}

export async function descartarImportacaoPrecoBase(id: string, empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  const resultado = await executarEmTransacao((tx) => descartarImportacaoPrecoBaseRepository(id, empresaId, tx));
  if (resultado.tipo === "nao_encontrada")
    throw naoEncontrado("Importacao nao encontrada", "PRICE_BASE_IMPORT_NOT_FOUND");
  if (resultado.tipo === "status_invalido")
    throw conflito(
      "Importacao ja aplicada nao pode ser descartada: ela e a procedencia do preco-base vigente",
      "PRICE_BASE_IMPORT_ALREADY_FINISHED"
    );
  return resultado;
}

export async function aplicarImportacaoPrecoBase(
  id: string,
  empresaId: string,
  perfil: PerfilComEmpresa,
  usuarioId: string
) {
  exigirEmpresa(perfil, empresaId);
  const resultado = await executarEmTransacao((tx) =>
    aplicarImportacaoPrecoBaseRepository(id, empresaId, usuarioId, tx)
  );
  if (resultado.tipo === "nao_encontrada")
    throw naoEncontrado("Importacao nao encontrada", "PRICE_BASE_IMPORT_NOT_FOUND");
  if (resultado.tipo === "status_invalido")
    throw conflito("Importacao ja finalizada", "PRICE_BASE_IMPORT_ALREADY_FINISHED");
  if (resultado.tipo === "pendencias")
    throw erroValidacao(
      "Resolva ambiguidades e produtos nao encontrados antes de aplicar a importacao",
      "PRICE_BASE_IMPORT_HAS_PENDING_ROWS"
    );
  if (resultado.tipo === "ja_importada")
    throw conflito("A importacao inicial de preco-base desta empresa ja foi aplicada", "PRICE_BASE_ALREADY_IMPORTED");
  return resultado;
}

export async function listarPrecosBaseAtuais(empresaId: string, perfil: PerfilComEmpresa, limite?: number) {
  exigirEmpresa(perfil, empresaId);
  return listarPrecosBaseAtuaisRepository(empresaId, limite);
}

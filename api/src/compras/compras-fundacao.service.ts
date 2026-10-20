import type {
  AnalisarImportacaoPrecoBase,
  CatalogoFornecedorDecisao,
  CatalogoFornecedorPayload
} from "@padaria/shared/compras";
import { normalizarDescricaoPrecoBase } from "@padaria/shared/compras";
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
  return executarEmTransacao((tx) =>
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
  const itens = dados.linhas.map((linha) => {
    const codigo = linha.codigo?.trim() || null;
    const ean = linha.ean?.replace(/\D/g, "") || null;
    const descricaoNormalizada = normalizarDescricaoPrecoBase(linha.descricao);
    const porCodigo = codigo
      ? produtos.filter((produto) => produto.codigo === codigo || produto.codigoInterno === codigo)
      : [];
    const porEan = ean ? produtos.filter((produto) => produto.ean?.replace(/\D/g, "") === ean) : [];
    const chaves = [...new Map([...porCodigo, ...porEan].map((produto) => [produto.id, produto])).values()];
    const candidatos = chaves.length
      ? chaves
      : produtos.filter((produto) => normalizarDescricaoPrecoBase(produto.descricao) === descricaoNormalizada);
    const resultado =
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
    } as const;
  });

  return executarEmTransacao((tx) =>
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
}

export async function listarImportacoesPrecoBase(empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  return listarImportacoesPrecoBaseRepository(empresaId);
}

export async function detalharImportacaoPrecoBase(id: string, empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  const importacao = await detalharImportacaoPrecoBaseRepository(id, empresaId);
  if (!importacao) throw naoEncontrado("Importacao nao encontrada", "PRICE_BASE_IMPORT_NOT_FOUND");
  return importacao;
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

export async function listarPrecosBaseAtuais(empresaId: string, perfil: PerfilComEmpresa) {
  exigirEmpresa(perfil, empresaId);
  return listarPrecosBaseAtuaisRepository(empresaId);
}

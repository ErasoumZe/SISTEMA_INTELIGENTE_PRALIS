import { normalizarNomeHistorico, type HistoricoLinha, type HistoricoResultado } from "@padaria/shared/compras";

// R-222: pareamento da planilha com o cadastro. Funcoes puras (sem banco), testadas em tests/unit.
// Regra do doc 53/55: nunca por aproximacao. Nome normalizado IGUAL ou apelido confirmado por pessoa.

export type IndicesHistorico = {
  fornecedoresPorNome: Map<string, string[]>;
  apelidos: Map<string, string>;
  produtosPorNome: Map<string, string[]>;
  produtosPorDescricao: Map<string, string[]>;
};

function indexar(mapa: Map<string, string[]>, chave: string, id: string) {
  const atual = mapa.get(chave);
  if (!atual) mapa.set(chave, [id]);
  else if (!atual.includes(id)) atual.push(id);
}

export function construirIndicesHistorico(
  fornecedores: Array<{ id: string; nome: string }>,
  aliases: Array<{ aliasNormalizado: string; fornecedorId: string }>,
  produtos: Array<{ id: string; descricao: string; nomeCatalogo?: string | null }>
): IndicesHistorico {
  const fornecedoresPorNome = new Map<string, string[]>();
  for (const fornecedor of fornecedores)
    indexar(fornecedoresPorNome, normalizarNomeHistorico(fornecedor.nome), fornecedor.id);
  // O nome da planilha e o nome do catalogo (o do paralelo); a descricao leva a unidade no fim
  // ("SPRITE LATA 220ML UN"). A descricao so vale quando nenhum nome de catalogo casa.
  const produtosPorNome = new Map<string, string[]>();
  const produtosPorDescricao = new Map<string, string[]>();
  for (const produto of produtos) {
    const nome = produto.nomeCatalogo ? normalizarNomeHistorico(produto.nomeCatalogo) : "";
    if (nome) indexar(produtosPorNome, nome, produto.id);
    indexar(produtosPorDescricao, normalizarNomeHistorico(produto.descricao), produto.id);
  }
  return {
    fornecedoresPorNome,
    apelidos: new Map(aliases.map((alias) => [alias.aliasNormalizado, alias.fornecedorId])),
    produtosPorNome,
    produtosPorDescricao
  };
}

export type Pareamento = {
  resultado: HistoricoResultado;
  fornecedorId: string | null;
  produtoId: string | null;
  detalhe: string | null;
};

/** Por que a linha da planilha nao vale (campo ilegivel, numero nao positivo, linha nao confrontada). */
export function motivoLinhaInvalida(linha: HistoricoLinha): string | null {
  if (linha.motivoInvalida) return linha.motivoInvalida;
  if (!linha.dataCompra) return "Data da compra ilegível";
  if (linha.quantidade === null || !(linha.quantidade > 0)) return "Quantidade ausente ou não positiva";
  if (linha.custoUnitario === null || !(linha.custoUnitario > 0)) return "Custo unitário ausente ou não positivo";
  // numeric(14,3) / numeric(14,4): dez digitos inteiros. Acima disso o banco responderia 22003.
  if (linha.quantidade >= 1e10 || linha.custoUnitario >= 1e10) return "Valor acima do limite do sistema";
  return null;
}

export function parearLinhaHistorico(
  fornecedorNormalizado: string,
  produtoNormalizado: string,
  indices: IndicesHistorico
): Pareamento {
  const apelido = indices.apelidos.get(fornecedorNormalizado);
  const candidatosFornecedor = apelido ? [apelido] : (indices.fornecedoresPorNome.get(fornecedorNormalizado) ?? []);
  const candidatosProduto =
    indices.produtosPorNome.get(produtoNormalizado) ?? indices.produtosPorDescricao.get(produtoNormalizado) ?? [];
  const fornecedorId = candidatosFornecedor.length === 1 ? candidatosFornecedor[0]! : null;
  const produtoId = candidatosProduto.length === 1 ? candidatosProduto[0]! : null;

  if (candidatosFornecedor.length === 0)
    return {
      resultado: "fornecedor_nao_encontrado",
      fornecedorId,
      produtoId,
      detalhe: "Fornecedor sem correspondência no cadastro: associe a um fornecedor existente ou cadastre"
    };
  if (candidatosFornecedor.length > 1)
    return {
      resultado: "ambiguidade",
      fornecedorId,
      produtoId,
      detalhe: `Há ${candidatosFornecedor.length} fornecedores com este nome no cadastro: associe ao correto`
    };
  if (candidatosProduto.length === 0)
    return {
      resultado: "produto_nao_encontrado",
      fornecedorId,
      produtoId,
      detalhe: "Produto sem correspondência exata (pelo nome) no cadastro"
    };
  if (candidatosProduto.length > 1)
    return {
      resultado: "ambiguidade",
      fornecedorId,
      produtoId,
      detalhe: `Há ${candidatosProduto.length} produtos com este nome no cadastro`
    };
  return { resultado: "correspondencia", fornecedorId, produtoId, detalhe: null };
}

export type ItemAplicavel = {
  numeroLinha: number;
  fornecedorId: string | null;
  produtoId: string | null;
  dataCompra: string | null;
  custoUnitario: string | null;
  fornecedorInformado: string;
  produtoInformado: string;
};

export type VinculoExistente = {
  id: string;
  fornecedorId: string;
  produtoId: string;
  status: "pendente" | "aprovado" | "rejeitado";
};

export type PlanoVinculos = {
  criar: Array<{ fornecedorId: string; produtoId: string; precoOfertado: string; fornecedor: string; produto: string }>;
  aprovarIds: string[];
  jaAprovados: number;
  rejeitadosIgnorados: number;
};

/**
 * O que a aplicacao faz com o catalogo: cria o vinculo que nao existe (aprovado, preco = custo da compra mais
 * recente), aprova o pendente, deixa o aprovado como esta e NAO toca no rejeitado (so conta).
 */
export function planejarVinculos(itens: ItemAplicavel[], existentes: VinculoExistente[]): PlanoVinculos {
  const maisRecente = new Map<string, ItemAplicavel>();
  for (const item of itens) {
    if (!item.fornecedorId || !item.produtoId || !item.dataCompra || !item.custoUnitario) continue;
    const chave = `${item.fornecedorId}|${item.produtoId}`;
    const atual = maisRecente.get(chave);
    const mais =
      !atual ||
      item.dataCompra > atual.dataCompra! ||
      (item.dataCompra === atual.dataCompra && item.numeroLinha > atual.numeroLinha);
    if (mais) maisRecente.set(chave, item);
  }
  const porChave = new Map(existentes.map((vinculo) => [`${vinculo.fornecedorId}|${vinculo.produtoId}`, vinculo]));
  const plano: PlanoVinculos = { criar: [], aprovarIds: [], jaAprovados: 0, rejeitadosIgnorados: 0 };
  for (const [chave, item] of maisRecente) {
    const existente = porChave.get(chave);
    if (!existente)
      plano.criar.push({
        fornecedorId: item.fornecedorId!,
        produtoId: item.produtoId!,
        precoOfertado: item.custoUnitario!,
        fornecedor: item.fornecedorInformado,
        produto: item.produtoInformado
      });
    else if (existente.status === "pendente") plano.aprovarIds.push(existente.id);
    else if (existente.status === "aprovado") plano.jaAprovados += 1;
    else plano.rejeitadosIgnorados += 1;
  }
  return plano;
}

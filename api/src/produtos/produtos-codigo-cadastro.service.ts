import {
  formatarCodigoCadastro,
  PRIMEIRO_CODIGO_DE_ENTREGA,
  reconciliarCodigoCadastro,
  type BaldeCodigo,
  type ParSia,
  type PropostaCodigo,
  type ProdutoParaReconciliar
} from "@padaria/shared/produtos";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import {
  baseParaReconciliarRepository,
  codigosGravadosRepository,
  copiasDaBaseParaCodigoRepository,
  donoDoCodigoNaEmpresaRepository,
  orfaosParaReconciliarRepository,
  paresSiaRepository,
  registrarHistoricoDeCodigoRepository,
  trocarCodigoDaBaseRepository,
  trocarCodigoDoProdutoRepository
} from "./produtos-codigo-cadastro.repository.js";
import { calcularProximoCodigoInterno } from "./codigo-interno.js";
import { travarCadastroDeProdutos } from "./produtos-escrita.repository.js";
import { lojaFiscalDaEmpresa } from "./produtos-fiscal.service.js";
import { registrarNaFilaDaPlanilha } from "./produtos-planilha.service.js";

/**
 * Reconciliacao do codigo de cadastro com o SIA — porte de `CodigoCadastroService` do app oficial (R-222).
 * O motor (`reconciliarCodigoCadastro`) e o do app, literal. Muda o que o ERP tem de diferente:
 *  - a BASE e `produtos_catalogo_base`; os orfaos sao produtos de loja sem BASE (de todas as empresas
 *    permitidas). Copias de loja ficam fora: herdam a troca da BASE;
 *  - a troca roda sob a MESMA trava do cadastro de produto (o numero cunhado nunca colide com um produto
 *    novo sendo salvo) e grava historico em `produtos_historico_codigo_interno`;
 *  - o ERP tem codigo unico por empresa: se a copia de uma loja colidir com outro produto da loja, a troca
 *    inteira e recusada (o oficial gravaria duplicado);
 *  - a planilha MIX nao entra no teto (o ERP nao le essa planilha): teto = de-para do SIA e banco.
 */
export const CONFIRMACAO_CODIGO_CADASTRO = "RECONCILIAR CODIGO DE CADASTRO";
/** Teto de trocas por chamada (oficial): a tela repete em lotes e mostra o que falta. */
export const LOTE_MAXIMO = 200;
export const BALDES_EM_LOTE = ["exato", "barras-tem-codigo"] as const;
export type BaldeEmLote = (typeof BALDES_EM_LOTE)[number];

const BALDES: BaldeCodigo[] = [
  "ja-correto",
  "exato",
  "barras-tem-codigo",
  "conflito-sia",
  "disputado",
  "fora-do-sia",
  "novo"
];

export class CodigoCadastroError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 403 | 404 | 409 | 422,
    readonly code: string
  ) {
    super(mensagem);
    this.name = "CodigoCadastroError";
  }
}

type Ator = { administrador: boolean; usuarioId: string | null; nome: string | null; empresasPermitidas: string[] };
type Alvo = { tipo: "base" } | { tipo: "produto"; empresaId: string };

const numeroDoCodigo = (valor: string | null) => {
  const digitos = String(valor ?? "").replace(/\D/gu, "");
  return digitos ? Number(digitos) : 0;
};

/**
 * Maior codigo numerico DENTRO da faixa de produtos (< 700000). O oficial nao tinha teto aqui, e um
 * codigo de entrega/equipamento (>= 700000) gravado faria o proximo cunhado cair na faixa reservada; o
 * ERP usa a mesma regra do cadastro normal (`calcularProximoCodigoInterno`), entao os dois nunca divergem.
 */
const naFaixa = (codigo: string | null) =>
  codigo && /^\d+$/u.test(codigo) && Number(codigo) < PRIMEIRO_CODIGO_DE_ENTREGA ? Number(codigo) : 0;
const maiorGravado = (codigos: Array<string | null>) =>
  codigos.reduce<number>((maior, c) => Math.max(maior, naFaixa(c)), 0);

/** SQLSTATE da falha, no topo ou embrulhado pelo drizzle em `cause`. */
function codigoDoPostgres(falha: Error | null | undefined): string | undefined {
  let atual: Error | null | undefined = falha;
  for (let salto = 0; salto < 4 && atual instanceof Error; salto += 1) {
    const codigo = (atual as Error & { code?: string }).code;
    if (typeof codigo === "string") return codigo;
    atual = atual.cause instanceof Error ? atual.cause : null;
  }
  return undefined;
}

/**
 * A troca sob a trava do cadastro, com o indice unico (empresa, codigo) traduzido para 409: se outro
 * caminho gravou o codigo fora da trava, a resposta e "ocupado", nunca 500.
 */
async function trocarSobATrava<T>(fazer: (tx: TransacaoBanco) => Promise<T>): Promise<T> {
  try {
    return await executarEmTransacao(async (tx) => {
      await travarCadastroDeProdutos(tx);
      return fazer(tx);
    });
  } catch (falha) {
    if (falha instanceof Error && codigoDoPostgres(falha) === "23505") {
      throw new CodigoCadastroError("Esse código já está em uso nesta loja. Nada foi gravado.", 409, "CODIGO_OCUPADO");
    }
    throw falha;
  }
}

function exigirAdministrador(ator: Ator) {
  if (!ator.administrador) {
    throw new CodigoCadastroError("Apenas o administrador reconcilia o código de cadastro.", 403, "FORBIDDEN");
  }
}

async function carregar(ator: Ator) {
  const [base, orfaos, linhasSia] = await Promise.all([
    baseParaReconciliarRepository(),
    orfaosParaReconciliarRepository(),
    paresSiaRepository()
  ]);
  const alvos = new Map<string, Alvo>();
  const produtos: ProdutoParaReconciliar[] = [];
  for (const linha of base) {
    alvos.set(linha.id, { tipo: "base" });
    produtos.push({
      id: linha.id,
      loja: "BASE",
      nome: linha.nome,
      codigoBarras: linha.codigoBarras,
      codigoInterno: linha.codigoInterno
    });
  }
  for (const linha of orfaos) {
    if (!ator.empresasPermitidas.includes(linha.empresaId)) continue;
    alvos.set(linha.id, { tipo: "produto", empresaId: linha.empresaId });
    produtos.push({
      id: linha.id,
      loja: lojaFiscalDaEmpresa(linha.matriculaPrefixo),
      nome: linha.nomeCatalogo ?? linha.descricao,
      codigoBarras: linha.codigoBarras,
      codigoInterno: linha.codigoInterno
    });
  }
  const pares: ParSia[] = linhasSia.map((par) => ({
    loja: lojaFiscalDaEmpresa(par.matriculaPrefixo),
    coditem: par.coditem,
    chaveBarras: par.chaveBarras,
    descricao: par.descricao
  }));
  return { alvos, pares, propostas: reconciliarCodigoCadastro(produtos, pares) };
}

/** Teto da numeracao: o maior coditem do SIA (ate o limite) e o maior codigo ja gravado. */
async function teto(pares: ParSia[]) {
  // Oficial: so coditem numerico puro. No ERP, so a faixa de produtos (entrega >= 700000 nao conta).
  const sia = pares.reduce((maior, par) => Math.max(maior, naFaixa(par.coditem)), 0);
  const gravado = maiorGravado(await codigosGravadosRepository());
  const valor = Math.max(sia, gravado);
  return { teto: valor, tetoDe: valor === sia && sia > 0 ? "de-para do SIA" : "maior código já gravado" };
}

export async function previaCodigoCadastro(ator: Ator) {
  exigirAdministrador(ator);
  const { pares, propostas } = await carregar(ator);
  const resumo = Object.fromEntries(BALDES.map((b) => [b, 0])) as Record<BaldeCodigo, number>;
  for (const proposta of propostas) resumo[proposta.balde] += 1;
  const { teto: valor, tetoDe } = await teto(pares);
  return {
    resumo,
    teto: valor,
    tetoDe,
    paresSia: pares.length,
    confirmacao: CONFIRMACAO_CODIGO_CADASTRO,
    loteMaximo: LOTE_MAXIMO,
    itens: propostas.map((p) => ({
      productId: p.produto.id,
      loja: p.produto.loja,
      nome: p.produto.nome,
      codigoBarras: p.produto.codigoBarras,
      codigoAtual: p.produto.codigoInterno,
      balde: p.balde,
      codigoProposto: p.codigoProposto,
      motivo: p.motivo,
      candidatos: p.candidatos.map((c) => ({
        loja: c.loja,
        coditem: formatarCodigoCadastro(c.coditem),
        descricao: c.descricao,
        semelhanca: c.semelhanca
      }))
    }))
  };
}

function conferirFrase(confirmacao: string) {
  if (confirmacao.trim().toUpperCase() !== CONFIRMACAO_CODIGO_CADASTRO) {
    throw new CodigoCadastroError(
      `Frase de confirmação inválida. Digite "${CONFIRMACAO_CODIGO_CADASTRO}" para gravar.`,
      400,
      "CONFIRMACAO_INVALIDA"
    );
  }
}

const mudouEmbaixo = () =>
  new CodigoCadastroError(
    "O código deste produto mudou desde que a tela carregou. Recarregue a prévia antes de decidir de novo.",
    409,
    "CODIGO_MUDOU"
  );

/**
 * Troca o codigo, registra historico, propaga para as copias da BASE e enfileira o espelho — tudo na
 * transacao. Devolve false quando a guarda otimista falha (o codigo mudou desde a tela).
 */
async function aplicar(
  tx: TransacaoBanco,
  id: string,
  alvo: Alvo,
  troca: { esperado: string | null; codigoNovo: string; fonte: string },
  ator: Ator
): Promise<boolean> {
  const autor = { alteradoPor: ator.usuarioId, alteradoPorNome: ator.nome };
  if (alvo.tipo === "produto") {
    const dono = await donoDoCodigoNaEmpresaRepository(tx, alvo.empresaId, troca.codigoNovo);
    if (dono && dono.id !== id) {
      throw new CodigoCadastroError(
        `O código ${troca.codigoNovo} já é do produto "${dono.descricao}" nesta loja. Unifique os dois antes de numerar.`,
        409,
        "CODIGO_OCUPADO"
      );
    }
    if (!(await trocarCodigoDoProdutoRepository(tx, id, troca.esperado, troca.codigoNovo))) return false;
    await registrarHistoricoDeCodigoRepository(
      tx,
      { empresaId: alvo.empresaId, produtoId: id },
      { codigoAnterior: troca.esperado, codigoNovo: troca.codigoNovo, fonte: troca.fonte, ...autor }
    );
    await registrarNaFilaDaPlanilha(tx, { empresaId: alvo.empresaId, produtoId: id });
    return true;
  }

  if (!(await trocarCodigoDaBaseRepository(tx, id, troca.esperado, troca.codigoNovo))) return false;
  await registrarHistoricoDeCodigoRepository(
    tx,
    { produtoBaseId: id },
    { codigoAnterior: troca.esperado, codigoNovo: troca.codigoNovo, fonte: troca.fonte, ...autor }
  );
  await registrarNaFilaDaPlanilha(tx, { produtoBaseId: id });
  for (const copia of await copiasDaBaseParaCodigoRepository(tx, id)) {
    if (numeroDoCodigo(copia.codigoInterno) === numeroDoCodigo(troca.codigoNovo)) continue;
    const dono = await donoDoCodigoNaEmpresaRepository(tx, copia.empresaId, troca.codigoNovo);
    if (dono && dono.id !== copia.id) {
      throw new CodigoCadastroError(
        `Na loja, o código ${troca.codigoNovo} já é do produto "${dono.descricao}". Nada foi gravado; unifique antes.`,
        409,
        "CODIGO_OCUPADO_NA_LOJA"
      );
    }
    await trocarCodigoDoProdutoRepository(tx, copia.id, copia.codigoInterno, troca.codigoNovo);
    await registrarHistoricoDeCodigoRepository(
      tx,
      { empresaId: copia.empresaId, produtoId: copia.id },
      {
        codigoAnterior: copia.codigoInterno,
        codigoNovo: troca.codigoNovo,
        fonte: `Propagação da BASE (${troca.fonte})`,
        ...autor
      }
    );
    await registrarNaFilaDaPlanilha(tx, { empresaId: copia.empresaId, produtoId: copia.id });
  }
  return true;
}

/** Adota em lote um balde de certeza (`exato` ou `barras-tem-codigo`), ate 200 por chamada. */
export async function adotarCodigosEmLote(ator: Ator, confirmacao: string, balde: BaldeEmLote = "exato") {
  exigirAdministrador(ator);
  conferirFrase(confirmacao);
  const { alvos, propostas } = await carregar(ator);
  const todos = propostas.filter((p) => p.balde === balde);
  const lote = todos.slice(0, LOTE_MAXIMO);
  let aplicadas = 0;
  let conflitos = 0;
  for (const proposta of lote) {
    try {
      const trocado = await trocarSobATrava((tx) =>
        aplicar(
          tx,
          proposta.produto.id,
          alvos.get(proposta.produto.id)!,
          { esperado: proposta.produto.codigoInterno, codigoNovo: proposta.codigoProposto!, fonte: proposta.fonte },
          ator
        )
      );
      if (trocado) aplicadas += 1;
      else conflitos += 1;
    } catch (erro) {
      if (!(erro instanceof CodigoCadastroError)) throw erro;
      conflitos += 1;
    }
  }
  return { aplicadas, conflitos, restantes: Math.max(0, todos.length - lote.length) };
}

export interface DecisaoDeCodigo {
  productId: string;
  codigo?: string | undefined;
  cunhar?: boolean | undefined;
  /** O codigo que a TELA mostrava — a guarda contra decisao sobrescrita. */
  codigoAtualEsperado: string | null;
  confirmacao: string;
}

/** Uma decisao, um produto: escolher um par do SIA, aceitar o proposto, ou cunhar um numero novo. */
export async function decidirCodigo(ator: Ator, pedido: DecisaoDeCodigo) {
  exigirAdministrador(ator);
  conferirFrase(pedido.confirmacao);
  if (Boolean(pedido.cunhar) === Boolean(pedido.codigo)) {
    throw new CodigoCadastroError(
      "Escolha um código da lista OU cunhe um novo — não os dois, nem nenhum.",
      422,
      "DECISAO_INVALIDA"
    );
  }
  const { alvos, pares, propostas } = await carregar(ator);
  const proposta = propostas.find((p) => p.produto.id === pedido.productId);
  const alvo = alvos.get(pedido.productId);
  if (!proposta || !alvo) {
    throw new CodigoCadastroError("Produto não está na lista da reconciliação.", 404, "NAO_ENCONTRADO");
  }

  if (pedido.cunhar) {
    if (proposta.balde !== "novo") {
      throw new CodigoCadastroError(
        `Este produto está em "${proposta.balde}", não em "sem código da rede". Resolva ali antes de cunhar.`,
        422,
        "CUNHAR_FORA_DO_NOVO"
      );
    }
    const { teto: valor } = await teto(pares);
    if (valor <= 0) {
      throw new CodigoCadastroError(
        "Não dá para cunhar sem saber onde a numeração está: o de-para do SIA está vazio.",
        409,
        "SEM_TETO"
      );
    }
    // Sob a trava do cadastro: o MAX relido aqui e o numero gravado nao tem como ser de outro.
    return trocarSobATrava(async (tx) => {
      const maior = maiorGravado(await codigosGravadosRepository(tx));
      let codigo: string;
      try {
        // A mesma regra do cadastro normal: piso 13129, nunca na faixa de entrega.
        codigo = calcularProximoCodigoInterno(Math.max(valor, maior));
      } catch {
        throw new CodigoCadastroError("A numeração do código de cadastro esgotou.", 409, "NUMERACAO_ESGOTADA");
      }
      const trocado = await aplicar(
        tx,
        pedido.productId,
        alvo,
        { esperado: pedido.codigoAtualEsperado, codigoNovo: codigo, fonte: `Cunhado sequencial após ${valor}` },
        ator
      );
      if (!trocado) throw mudouEmbaixo();
      return { codigo, fonte: "cunhado" };
    });
  }

  const escolhido = formatarCodigoCadastro(pedido.codigo);
  const par = proposta.candidatos.find((c) => formatarCodigoCadastro(c.coditem) === escolhido);
  const proposto = proposta.codigoProposto && formatarCodigoCadastro(proposta.codigoProposto) === escolhido;
  if (!par && !proposto) {
    throw new CodigoCadastroError(
      "Esse código não está entre os pares deste produto no SIA. Escolha um dos oferecidos, ou cunhe um novo.",
      422,
      "CODIGO_FORA_DOS_PARES"
    );
  }
  // Nenhum codigo para dois cadastros da reconciliacao (BASE e orfaos): duplicata de verdade.
  const dono = propostas.find(
    (p: PropostaCodigo) =>
      p.produto.id !== proposta.produto.id &&
      p.produto.codigoInterno &&
      formatarCodigoCadastro(p.produto.codigoInterno) === escolhido
  );
  if (dono) {
    throw new CodigoCadastroError(
      `O código ${escolhido} já é do cadastro "${dono.produto.nome}" (${dono.produto.loja}). ` +
        "Dois cadastros com o mesmo número brigam no PDV — unifique os dois antes de numerar.",
      409,
      "CODIGO_OCUPADO"
    );
  }
  const origem = par ? `SIA ${par.loja}` : proposta.fonte;
  const trocado = await trocarSobATrava((tx) =>
    aplicar(
      tx,
      pedido.productId,
      alvo,
      {
        esperado: pedido.codigoAtualEsperado,
        codigoNovo: escolhido,
        fonte: `${origem} (escolhido por ${proposta.balde})`
      },
      ator
    )
  );
  if (!trocado) throw mudouEmbaixo();
  return { codigo: escolhido, fonte: origem };
}

import { createHash, randomBytes } from "node:crypto";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { DadosExternos } from "@padaria/shared/api";
import {
  calcularCotacao,
  cotacaoRespostaPayloadSchema,
  dezMilesimosParaDecimal,
  expiracaoCotacao,
  pendenciasParaEnviar,
  type CotacaoGeradaDto,
  type CotacaoItemDto,
  type CotacaoPublicaDto,
  type CotacaoResumoDto,
  type ItemCotacaoEntrada,
  type SituacaoCotacao
} from "@padaria/shared/compras";
import { centavosParaDecimalBanco } from "@padaria/shared/dinheiro";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { erroValidacao, foiEmbora, naoAutorizado, naoEncontrado } from "../erros.js";
import { atualizarSituacaoPedidoRepository, travarPedidoRepository } from "../pedidos/pedidos.repository.js";
import {
  buscarCotacaoPorHashRepository,
  buscarNomesDaCotacaoRepository,
  buscarUltimaCotacaoDoPedidoRepository,
  criarCotacaoRepository,
  gravarRespostaCotacaoRepository,
  listarItensDaCotacaoRepository,
  revogarCotacaoAbertaRepository,
  travarCotacaoPorHashRepository,
  ultimosValoresConfirmadosRepository,
  type CotacaoLinha,
  type ItemCotacaoGravar
} from "./cotacoes.repository.js";

/**
 * R-216 — cotacao de compra respondida pelo fornecedor.
 *
 * Regras que este arquivo garante, e que a tela so espelha:
 *
 * - o token sai UMA vez, na geracao; o banco guarda so o hash;
 * - um pedido tem no maximo um link aberto: gerar outro revoga o anterior;
 * - rascunho salva quantas vezes quiser ate o prazo; ENVIAR e unico e encerra o link;
 * - o total gravado e recalculado aqui, com a quantidade do BANCO, nunca com a do navegador;
 * - responder muda o pedido para Retornado e para por ai. Quem confirma e o Comprador.
 */

const BYTES_DO_TOKEN = 32;

export function hashTokenCotacao(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function situacaoDe(linha: CotacaoLinha, agora = new Date()): SituacaoCotacao {
  if (linha.status === "aberta" && linha.expiraEm.getTime() <= agora.getTime()) return "expirada";
  return linha.status;
}

/** Referencia curta para conversa por telefone. O fim do uuid v7 e a parte aleatoria. */
function referenciaDoPedido(pedidoId: string): string {
  return pedidoId.replace(/-/gu, "").slice(-8).toUpperCase();
}

/**
 * `ultimoValorDe`: "fornecedor" restringe o ultimo valor ao que foi pago a ESTE fornecedor — e o que
 * a tela publica usa, para nao revelar preco de concorrente. "empresa" usa qualquer fornecedor, que
 * e a referencia util para o Comprador decidir.
 */
async function montarCotacao(
  linha: CotacaoLinha,
  comConteudo: boolean,
  ultimoValorDe: "fornecedor" | "empresa",
  db?: ExecutorBanco
): Promise<CotacaoPublicaDto> {
  const nomes = await buscarNomesDaCotacaoRepository(linha.pedidoId, db);
  const base = {
    situacao: situacaoDe(linha),
    empresaNome: nomes?.empresaNome ?? "",
    fornecedorNome: nomes?.fornecedorNome ?? "Fornecedor",
    referencia: referenciaDoPedido(linha.pedidoId),
    expiraEm: linha.expiraEm.toISOString(),
    respondidaEm: linha.respondidaEm?.toISOString() ?? null
  };
  if (!comConteudo) {
    return {
      ...base,
      itens: [],
      descontoGeralTipo: null,
      descontoGeralValor: null,
      observacao: null,
      prazoEntrega: null,
      condicaoPagamento: null
    };
  }
  const leitura = await listarItensDaCotacaoRepository(linha.id, linha.pedidoId, db);
  const ultimos = await ultimosValoresConfirmadosRepository(
    linha.empresaId,
    leitura.map((item) => item.produtoId).filter((id): id is string => Boolean(id)),
    linha.pedidoId,
    ultimoValorDe === "fornecedor" ? (nomes?.fornecedorId ?? null) : null,
    db
  );
  const itens: CotacaoItemDto[] = leitura.map((item) => ({
    pedidoItemId: item.pedidoItemId,
    descricao: item.descricao,
    quantidade: item.quantidade,
    unidade: item.unidade,
    ultimoValor: item.produtoId ? (ultimos.get(item.produtoId) ?? null) : null,
    indisponivel: item.indisponivel,
    valorUnitario: item.valorUnitario,
    descontoTipo: item.descontoTipo,
    descontoValor: item.descontoValor
  }));
  return {
    ...base,
    itens,
    descontoGeralTipo: linha.descontoGeralTipo,
    descontoGeralValor: linha.descontoGeralValor,
    observacao: linha.observacao,
    prazoEntrega: linha.prazoEntrega,
    condicaoPagamento: linha.condicaoPagamento
  };
}

// --- Comprador ------------------------------------------------------------------------------------

/**
 * Gera o link e marca o pedido como Enviado. Vale para `A fazer` (primeiro envio) e para `Enviado`
 * (link perdido ou vencido): neste caso o anterior e revogado na MESMA transacao, e o fornecedor
 * que abrir o link velho ve que ele nao vale mais.
 */
export async function gerarCotacao(pedidoId: string, perfil: PerfilUsuario): Promise<CotacaoGeradaDto> {
  return executarEmTransacao(async (tx) => {
    const pedido = await travarPedidoRepository(pedidoId, tx);
    if (!pedido || !podeAcessarEmpresa(perfil, pedido.empresaId)) throw naoEncontrado("Pedido nao encontrado");
    if (pedido.status !== "a_fazer" && pedido.status !== "enviado") {
      throw erroValidacao("So e possivel enviar cotacao de pedido em A fazer ou Enviado", "PEDIDO_NAO_COTAVEL");
    }
    if (!pedido.fornecedorId) throw erroValidacao("Pedido sem fornecedor", "PEDIDO_SEM_FORNECEDOR");

    await revogarCotacaoAbertaRepository(pedidoId, tx);
    const token = randomBytes(BYTES_DO_TOKEN).toString("hex");
    const expiraEm = expiracaoCotacao(new Date());
    await criarCotacaoRepository(
      {
        empresaId: pedido.empresaId,
        pedidoId,
        tokenHash: hashTokenCotacao(token),
        expiraEm,
        criadoPor: perfil.usuarioId
      },
      tx
    );
    await atualizarSituacaoPedidoRepository(
      {
        pedidoId,
        empresaId: pedido.empresaId,
        status: "enviado",
        observacao:
          pedido.status === "enviado"
            ? "Novo link de cotacao gerado; o anterior deixou de valer."
            : "Cotacao enviada ao fornecedor.",
        criadoPor: perfil.usuarioId
      },
      tx
    );
    return { token, expiraEm: expiraEm.toISOString() };
  });
}

/** Cotacao mais recente do pedido, completa, para o Comprador revisar. */
export async function cotacaoDoPedido(pedidoId: string): Promise<CotacaoResumoDto | null> {
  const linha = await buscarUltimaCotacaoDoPedidoRepository(pedidoId);
  if (!linha) return null;
  const cotacao = await montarCotacao(linha, true, "empresa");
  return { ...cotacao, id: linha.id, criadaEm: linha.criadoEm.toISOString() };
}

/** Confirmar ou cancelar o pedido encerra o link aberto: o fornecedor nao responde mais depois disso. */
export async function encerrarCotacaoAberta(pedidoId: string, tx: ExecutorBanco): Promise<void> {
  await revogarCotacaoAbertaRepository(pedidoId, tx);
}

// --- Fornecedor (sem login) -----------------------------------------------------------------------

function exigirToken(token: string | undefined): string {
  if (!token) throw naoAutorizado("Link de cotacao ausente", "COTACAO_TOKEN_AUSENTE");
  return token;
}

export async function obterCotacaoPublica(token: string | undefined): Promise<CotacaoPublicaDto> {
  const linha = await buscarCotacaoPorHashRepository(hashTokenCotacao(exigirToken(token)));
  if (!linha) throw naoEncontrado("Link de cotacao invalido", "COTACAO_INVALIDA");
  // Fora de `aberta`, o link so diz o que aconteceu: nao mostra mais itens nem valores.
  return montarCotacao(linha, situacaoDe(linha) === "aberta", "fornecedor");
}

export async function salvarRascunhoCotacao(token: string | undefined, corpo: DadosExternos): Promise<void> {
  await responder(token, corpo, false);
}

export async function enviarCotacao(token: string | undefined, corpo: DadosExternos): Promise<void> {
  await responder(token, corpo, true);
}

async function responder(token: string | undefined, corpo: DadosExternos, enviar: boolean): Promise<void> {
  const hash = hashTokenCotacao(exigirToken(token));
  // Token desconhecido e recusado ANTES de validar um corpo de ate 500 itens: quem chuta tokens nao
  // ganha CPU de graca.
  const conhecida = await buscarCotacaoPorHashRepository(hash);
  if (!conhecida) throw naoEncontrado("Link de cotacao invalido", "COTACAO_INVALIDA");
  const payload = cotacaoRespostaPayloadSchema.parse(corpo ?? {});

  await executarEmTransacao(async (tx) => {
    // Mesma ordem de trava de `gerarCotacao` e `alterarSituacaoPedido`: pedido, depois cotacao.
    // Ordem invertida entre transacoes concorrentes e receita de deadlock.
    const pedido = await travarPedidoRepository(conhecida.pedidoId, tx);
    const linha = await travarCotacaoPorHashRepository(hash, tx);
    if (!linha) throw naoEncontrado("Link de cotacao invalido", "COTACAO_INVALIDA");
    const situacao = situacaoDe(linha);
    if (situacao === "expirada") {
      throw foiEmbora("Este link expirou. Peca um novo link ao comprador.", "COTACAO_EXPIRADA");
    }
    if (situacao !== "aberta") throw foiEmbora("Esta cotacao ja foi enviada ou nao vale mais.", "COTACAO_ENCERRADA");

    if (!pedido || pedido.status !== "enviado") {
      throw foiEmbora("Este pedido nao aceita mais respostas.", "COTACAO_ENCERRADA");
    }

    const itensPedido = await listarItensDaCotacaoRepository(linha.id, linha.pedidoId, tx);
    const itemPorId = new Map(itensPedido.map((item) => [item.pedidoItemId, item]));
    const respostaPorId = new Map(payload.itens.map((item) => [item.pedidoItemId, item]));
    for (const id of respostaPorId.keys()) {
      if (!itemPorId.has(id)) throw erroValidacao("Item nao pertence a esta cotacao", "COTACAO_ITEM_INVALIDO");
    }

    // Uma linha por item do PEDIDO, nao do payload: item omitido pelo navegador vira linha vazia,
    // e nao some — o envio vai pedir o valor dele pelo nome.
    let itens: ItemCotacaoGravar[] = itensPedido.map((item) => {
      const resposta = respostaPorId.get(item.pedidoItemId);
      const descontoValor = resposta?.descontoValor ?? null;
      return {
        pedidoItemId: item.pedidoItemId,
        indisponivel: resposta?.indisponivel ?? false,
        valorUnitario: resposta?.valorUnitario ?? null,
        // Tipo sem valor nao e desconto: grava nulo para nao reabrir a tela com um seletor orfao.
        descontoTipo: descontoValor === null ? null : (resposta?.descontoTipo ?? null),
        descontoValor
      };
    });

    let envio: { totalBruto: string; totalFinal: string; respondidaEm: Date } | undefined;
    if (enviar) {
      const entradas: ItemCotacaoEntrada[] = itens.map((item) => ({
        id: item.pedidoItemId,
        quantidade: itemPorId.get(item.pedidoItemId)?.quantidade ?? "0",
        indisponivel: item.indisponivel,
        valorUnitario: item.valorUnitario,
        descontoTipo: item.descontoTipo,
        descontoValor: item.descontoValor
      }));
      const calculo = calcularCotacao(entradas, { tipo: payload.descontoGeralTipo, valor: payload.descontoGeralValor });
      const pendencias = pendenciasParaEnviar(
        entradas,
        calculo,
        Object.fromEntries(itensPedido.map((item) => [item.pedidoItemId, item.descricao]))
      );
      if (pendencias.length) {
        throw erroValidacao(pendencias[0] ?? "Cotacao incompleta", "COTACAO_INCOMPLETA", pendencias);
      }
      const calculadoPorId = new Map(calculo.itens.map((item) => [item.id, item]));
      itens = itens.map((item) => {
        const calculado = calculadoPorId.get(item.pedidoItemId);
        if (!calculado || item.indisponivel) return { ...item, valorUnitarioFinal: null, totalFinal: null };
        return {
          ...item,
          valorUnitarioFinal: dezMilesimosParaDecimal(calculado.unitarioFinalDezMilesimos),
          totalFinal: centavosParaDecimalBanco(calculado.totalFinalCentavos)
        };
      });
      envio = {
        totalBruto: centavosParaDecimalBanco(calculo.totalBrutoCentavos),
        totalFinal: centavosParaDecimalBanco(calculo.totalFinalCentavos),
        respondidaEm: new Date()
      };
    }

    await gravarRespostaCotacaoRepository(
      {
        cotacaoId: linha.id,
        descontoGeralTipo: payload.descontoGeralValor === null ? null : payload.descontoGeralTipo,
        descontoGeralValor: payload.descontoGeralValor,
        observacao: payload.observacao || null,
        prazoEntrega: payload.prazoEntrega,
        condicaoPagamento: payload.condicaoPagamento || null,
        itens,
        ...(envio ? { envio } : {})
      },
      tx
    );

    if (enviar) {
      await atualizarSituacaoPedidoRepository(
        {
          pedidoId: linha.pedidoId,
          empresaId: linha.empresaId,
          status: "retornado",
          observacao: "Cotacao respondida pelo fornecedor.",
          criadoPor: null,
          cotacaoId: linha.id
        },
        tx
      );
    }
  });
}
